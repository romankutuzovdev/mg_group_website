"""Outbound proxy for the scraper Chrome (Cloudflare / geo-blocks on a BY address).

`SCRAPER_PROXY_URL=http://user:pass@host:port` in ``api/.env``:

* The API starts a tiny *local* forwarder on ``127.0.0.1:SCRAPER_PROXY_LOCAL_PORT``
  that adds ``Proxy-Authorization`` and tunnels to the upstream proxy. Chrome
  cannot take proxy credentials on the command line and would pop an auth
  dialog, so it is pointed at the forwarder instead (``chrome_args()``).
* ``SCRAPER_PROXY_HOSTS`` empty → the whole scraper Chrome goes through the
  proxy. A comma list (``bid.cars,bid.car``) → PAC script, only those hosts.
* ``httpx_kwargs()`` gives the same routing to server-side photo downloads.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlparse

logger = logging.getLogger("mg.scraper.proxy")

_IO_TIMEOUT = 30.0


@dataclass(frozen=True)
class UpstreamProxy:
    host: str
    port: int
    username: str = ""
    password: str = ""

    @property
    def server(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def url(self) -> str:
        if self.username:
            return f"http://{self.username}:{self.password}@{self.host}:{self.port}"
        return self.server

    @property
    def basic_auth(self) -> bytes | None:
        if not self.username:
            return None
        raw = f"{self.username}:{self.password}".encode("utf-8")
        return b"Basic " + base64.b64encode(raw)


def parse_proxy_url(raw: str) -> UpstreamProxy | None:
    """``http://user:pass@host:port`` (scheme optional) → UpstreamProxy."""
    value = (raw or "").strip()
    if not value:
        return None
    if "://" not in value:
        value = "http://" + value
    parts = urlparse(value)
    if not parts.hostname or not parts.port:
        logger.warning("SCRAPER_PROXY_URL needs host:port — got %r", raw[:60])
        return None
    return UpstreamProxy(
        host=parts.hostname,
        port=int(parts.port),
        username=unquote(parts.username or ""),
        password=unquote(parts.password or ""),
    )


def proxy_hosts(raw: str) -> list[str]:
    return [h.strip().lower().lstrip(".") for h in (raw or "").split(",") if h.strip()]


def _settings_tuple() -> tuple[UpstreamProxy | None, list[str], int]:
    from app.config import get_settings

    s = get_settings()
    return (
        parse_proxy_url(getattr(s, "scraper_proxy_url", "") or ""),
        proxy_hosts(getattr(s, "scraper_proxy_hosts", "") or ""),
        int(getattr(s, "scraper_proxy_local_port", 9280) or 9280),
    )


def pac_script(hosts: list[str], local_port: int) -> str:
    conds = " || ".join(
        f"dnsDomainIs(host, '.{h}') || host == '{h}'"
        for h in hosts
        if re.fullmatch(r"[a-z0-9.-]+", h)
    )
    if not conds:
        conds = "false"
    return (
        "function FindProxyForURL(url, host) { "
        f"if ({conds}) return 'PROXY 127.0.0.1:{local_port}'; return 'DIRECT'; }}"
    )


def chrome_args(
    *,
    upstream: UpstreamProxy | None = None,
    hosts: list[str] | None = None,
    local_port: int | None = None,
) -> list[str]:
    """Extra Chrome flags: all traffic (or PAC-selected hosts) via the local forwarder."""
    if upstream is None and hosts is None and local_port is None:
        upstream, hosts, local_port = _settings_tuple()
    if upstream is None:
        return []
    port = int(local_port or 9280)
    if hosts:
        pac = pac_script(hosts, port)
        b64 = base64.b64encode(pac.encode("ascii")).decode("ascii")
        return [f"--proxy-pac-url=data:application/x-ns-proxy-autoconfig;base64,{b64}"]
    return [f"--proxy-server=http://127.0.0.1:{port}"]


def playwright_proxy() -> dict[str, str] | None:
    """Proxy option for a Playwright-launched Chromium (fallback mode only)."""
    upstream, _hosts, _ = _settings_tuple()
    if upstream is None:
        return None
    opt: dict[str, str] = {"server": upstream.server}
    if upstream.username:
        opt["username"] = upstream.username
        opt["password"] = upstream.password
    return opt


def httpx_kwargs() -> dict[str, Any]:
    """``httpx.AsyncClient(**httpx_kwargs())`` → same routing as Chrome."""
    import httpx

    upstream, hosts, _ = _settings_tuple()
    if upstream is None:
        return {}
    if not hosts:
        return {"proxy": upstream.url}
    transport = httpx.AsyncHTTPTransport(proxy=upstream.url)
    mounts: dict[str, Any] = {}
    for h in hosts:
        mounts[f"all://{h}"] = transport
        mounts[f"all://*.{h}"] = transport
    return {"mounts": mounts}


# ---------------------------------------------------------------------------
# Local auth-adding forwarder
# ---------------------------------------------------------------------------


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            writer.write(chunk)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionError, OSError):
        pass
    finally:
        try:
            if writer.can_write_eof():
                writer.write_eof()
        except Exception:
            pass


async def _close(writer: asyncio.StreamWriter | None) -> None:
    if writer is None:
        return
    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass


class ProxyForwarder:
    def __init__(
        self, upstream: UpstreamProxy, *, local_port: int, host: str = "127.0.0.1"
    ) -> None:
        self.upstream = upstream
        self.local_port = int(local_port)
        self.host = host
        self._server: asyncio.AbstractServer | None = None
        self.connections = 0
        self.errors = 0

    @property
    def running(self) -> bool:
        return self._server is not None

    async def start(self) -> None:
        if self._server is not None:
            return
        self._server = await asyncio.start_server(self._handle, self.host, self.local_port)
        logger.info(
            "proxy forwarder on %s:%s → %s:%s (auth=%s)",
            self.host,
            self.local_port,
            self.upstream.host,
            self.upstream.port,
            "yes" if self.upstream.username else "no",
        )

    async def stop(self) -> None:
        if self._server is None:
            return
        self._server.close()
        try:
            await self._server.wait_closed()
        except Exception:
            pass
        self._server = None

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.connections += 1
        up_reader: asyncio.StreamReader | None = None
        up_writer: asyncio.StreamWriter | None = None
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=_IO_TIMEOUT)
            request_line, _, raw_headers = head.partition(b"\r\n")
            parts = request_line.split(b" ")
            if len(parts) < 3:
                writer.write(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
                await writer.drain()
                return
            method, target, version = parts[0], parts[1], parts[2]

            up_reader, up_writer = await asyncio.wait_for(
                asyncio.open_connection(self.upstream.host, self.upstream.port),
                timeout=_IO_TIMEOUT,
            )
            auth = self.upstream.basic_auth

            if method.upper() == b"CONNECT":
                lines = [b"CONNECT " + target + b" " + version, b"Host: " + target]
                if auth:
                    lines.append(b"Proxy-Authorization: " + auth)
                lines.append(b"Proxy-Connection: Keep-Alive")
                up_writer.write(b"\r\n".join(lines) + b"\r\n\r\n")
                await up_writer.drain()
                resp_head = await asyncio.wait_for(
                    up_reader.readuntil(b"\r\n\r\n"), timeout=_IO_TIMEOUT
                )
                writer.write(resp_head)
                await writer.drain()
                status_line = resp_head.split(b"\r\n", 1)[0]
                if b" 200" not in status_line:
                    self.errors += 1
                    logger.warning(
                        "upstream CONNECT %s → %s",
                        target.decode(errors="ignore"),
                        status_line.decode(errors="ignore"),
                    )
                    return
            else:
                # Plain HTTP: forward one request per connection with our auth.
                kept: list[bytes] = []
                for line in raw_headers.split(b"\r\n"):
                    if not line:
                        continue
                    key = line.split(b":", 1)[0].strip().lower()
                    if key in {b"proxy-authorization", b"proxy-connection", b"connection"}:
                        continue
                    kept.append(line)
                if auth:
                    kept.append(b"Proxy-Authorization: " + auth)
                kept.append(b"Connection: close")
                up_writer.write(request_line + b"\r\n" + b"\r\n".join(kept) + b"\r\n\r\n")
                await up_writer.drain()

            await asyncio.gather(_pipe(reader, up_writer), _pipe(up_reader, writer))
        except asyncio.IncompleteReadError:
            pass
        except asyncio.TimeoutError:
            self.errors += 1
        except (ConnectionError, OSError) as exc:
            self.errors += 1
            logger.debug("proxy forwarder: %s", exc)
            try:
                writer.write(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
                await writer.drain()
            except Exception:
                pass
        except Exception as exc:  # pragma: no cover - defensive
            self.errors += 1
            logger.warning("proxy forwarder error: %s", exc)
        finally:
            await _close(up_writer)
            await _close(writer)


_forwarder: ProxyForwarder | None = None


async def start_forwarder_from_settings() -> ProxyForwarder | None:
    """Called from the API lifespan (scraper roles). No proxy configured → None."""
    global _forwarder
    upstream, _, local_port = _settings_tuple()
    if upstream is None:
        return None
    if _forwarder is not None and _forwarder.running:
        return _forwarder
    fwd = ProxyForwarder(upstream, local_port=local_port)
    try:
        await fwd.start()
    except OSError as exc:
        logger.error("proxy forwarder cannot bind 127.0.0.1:%s: %s", local_port, exc)
        return None
    _forwarder = fwd
    return fwd


async def stop_forwarder() -> None:
    global _forwarder
    if _forwarder is not None:
        await _forwarder.stop()
        _forwarder = None


def forwarder_status() -> dict[str, Any]:
    upstream, hosts, local_port = _settings_tuple()
    return {
        "configured": upstream is not None,
        "upstream": f"{upstream.host}:{upstream.port}" if upstream else None,
        "hosts": hosts or "all",
        "local_port": local_port,
        "running": bool(_forwarder and _forwarder.running),
        "connections": _forwarder.connections if _forwarder else 0,
        "errors": _forwarder.errors if _forwarder else 0,
    }
