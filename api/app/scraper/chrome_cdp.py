"""Ensure Google Chrome is listening on the scraper CDP port.

Under Windows NSSM the API runs as a service — GUI Chrome often cannot start.
We therefore prefer headless CDP (``--headless=new``) with a fixed profile under
``api/data/chrome-profile``. Playwright attaches via SCRAPER_CDP_URL.
"""

from __future__ import annotations

import logging
import os
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger("mg.scraper.chrome_cdp")

# Stable path even when NSSM runs as LOCAL SYSTEM (LOCALAPPDATA is useless there).
_API_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROFILE = _API_ROOT / "data" / "chrome-profile"


def _parse_cdp_port(cdp_url: str) -> int | None:
    raw = (cdp_url or "").strip()
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
        if parsed.port:
            return int(parsed.port)
        if parsed.scheme in {"http", "https"}:
            return 443 if parsed.scheme == "https" else 80
    except Exception:
        return None
    return None


def cdp_responsive(cdp_url: str, *, timeout: float = 1.5) -> bool:
    """True when Chrome answers /json/version on the CDP endpoint."""
    url = (cdp_url or "").strip().rstrip("/")
    if not url:
        return False
    try:
        with urllib.request.urlopen(f"{url}/json/version", timeout=timeout) as resp:
            return 200 <= getattr(resp, "status", 200) < 300
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def _port_open(host: str, port: int, *, timeout: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _chrome_executables() -> list[Path]:
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    pf = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
    pf86 = Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
    home = Path.home()
    return [
        pf / "Google/Chrome/Application/chrome.exe",
        local / "Google/Chrome/Application/chrome.exe",
        pf86 / "Google/Chrome/Application/chrome.exe",
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        home / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/chromium"),
        Path("/usr/bin/chromium-browser"),
    ]


def _chrome_exe() -> Path | None:
    for path in _chrome_executables():
        if path.is_file():
            return path
    return None


def _user_data_dir() -> Path:
    env = (os.environ.get("SCRAPER_CHROME_USER_DATA") or "").strip()
    if env:
        return Path(env)
    return DEFAULT_PROFILE


def _clear_profile_locks(user_data: Path) -> None:
    """Remove stale Singleton* locks so a new Chrome can bind the profile."""
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"):
        path = user_data / name
        try:
            if path.is_file() or path.is_symlink():
                path.unlink(missing_ok=True)  # type: ignore[call-arg]
            elif path.exists():
                path.unlink()
        except TypeError:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        except OSError:
            pass


def _kill_listeners_on_port(port: int) -> None:
    """Best-effort: free a stuck CDP port (Windows / Unix). Never raises."""
    try:
        if os.name == "nt":
            out = subprocess.check_output(
                ["netstat", "-ano"],
                text=True,
                errors="ignore",
                timeout=8,
            )
            pids: set[str] = set()
            needle = f":{port} "
            for line in out.splitlines():
                if needle not in line or "LISTENING" not in line.upper():
                    continue
                parts = line.split()
                if parts:
                    pids.add(parts[-1])
            for pid in pids:
                if pid in {"0", "4"}:
                    continue
                subprocess.run(
                    ["taskkill", "/F", "/PID", pid],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=8,
                    check=False,
                )
        else:
            subprocess.run(
                ["bash", "-lc", f"lsof -ti tcp:{port} | xargs -r kill -9"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=8,
                check=False,
            )
    except Exception as exc:
        logger.debug("kill port %s skipped: %s", port, exc)


def _launch_chrome(port: int, *, headless: bool) -> None:
    exe = _chrome_exe()
    if exe is None:
        raise RuntimeError("Google Chrome not found — install Chrome on the server")

    user_data = _user_data_dir()
    user_data.mkdir(parents=True, exist_ok=True)
    _clear_profile_locks(user_data)

    args = [
        str(exe),
        f"--remote-debugging-port={port}",
        "--remote-allow-origins=*",
        f"--user-data-dir={str(user_data)}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-features=Translate,BackForwardCache",
    ]
    if headless:
        args.extend(
            [
                "--headless=new",
                "--disable-gpu",
                "--window-size=1920,1080",
                "--no-sandbox",
            ]
        )
    args.append("about:blank")

    logger.info(
        "starting Chrome CDP port=%s headless=%s profile=%s",
        port,
        headless,
        user_data,
    )
    kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        # Detach from interactive desktop so Chrome survives AnyDesk / RDP logout.
        flags = 0
        flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
        flags |= getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0x01000000)
        kwargs["creationflags"] = flags
        kwargs["close_fds"] = True
        # Avoid inheriting the console of the parent service / session
        kwargs["stdin"] = subprocess.DEVNULL
    else:
        kwargs["start_new_session"] = True

    subprocess.Popen(args, **kwargs)


def ensure_chrome_cdp(
    cdp_url: str,
    *,
    autostart: bool = True,
    headless: bool = True,
    wait_seconds: float = 60.0,
    force_restart: bool = False,
) -> bool:
    """Make sure CDP endpoint responds. Returns True if ready for Playwright.

    Defaults to headless Chrome — required for NSSM / Windows Service.
    Never raises: failures are logged and return False so the API stays up.
    """
    url = (cdp_url or "").strip()
    if not url:
        return False

    try:
        if not force_restart and cdp_responsive(url):
            logger.info("Chrome CDP already up: %s", url)
            return True

        port = _parse_cdp_port(url)
        if port is None:
            logger.warning("cannot parse CDP port from %s", url)
            return False

        host = urlparse(url).hostname or "127.0.0.1"

        if not autostart:
            logger.warning(
                "Chrome CDP not responding at %s — start start-chrome-cdp.bat "
                "or enable SCRAPER_CDP_AUTOSTART",
                url,
            )
            return False

        if force_restart or (_port_open(host, port) and not cdp_responsive(url)):
            logger.warning("CDP port %s stuck — freeing and relaunching Chrome", port)
            _kill_listeners_on_port(port)
            time.sleep(1.0)

        _launch_chrome(port, headless=headless)

        deadline = time.time() + max(8.0, wait_seconds)
        while time.time() < deadline:
            if cdp_responsive(url, timeout=1.2):
                logger.info("Chrome CDP ready: %s", url)
                return True
            time.sleep(0.5)

        logger.warning("Chrome CDP did not become ready within %.0fs (%s)", wait_seconds, url)
        return False
    except Exception as exc:
        logger.exception("ensure_chrome_cdp failed (API continues): %s", exc)
        return False


def chrome_available() -> bool:
    return _chrome_exe() is not None
