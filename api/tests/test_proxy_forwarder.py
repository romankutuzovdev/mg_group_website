from __future__ import annotations

import asyncio
import base64
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.scraper import proxy_forwarder as pf


class ParseTests(unittest.TestCase):
    def test_parse_with_credentials(self):
        up = pf.parse_proxy_url("http://daT%40x:p%3Ass@80.68.150.202:62646")
        self.assertEqual((up.host, up.port, up.username, up.password), ("80.68.150.202", 62646, "daT@x", "p:ss"))
        self.assertEqual(up.server, "http://80.68.150.202:62646")
        self.assertEqual(up.basic_auth, b"Basic " + base64.b64encode(b"daT@x:p:ss"))

    def test_parse_without_scheme_or_auth(self):
        up = pf.parse_proxy_url("1.2.3.4:3128")
        self.assertEqual((up.host, up.port, up.username), ("1.2.3.4", 3128, ""))
        self.assertIsNone(up.basic_auth)
        self.assertIsNone(pf.parse_proxy_url(""))
        self.assertIsNone(pf.parse_proxy_url("http://nohostport"))

    def test_chrome_args_all_or_pac(self):
        up = pf.parse_proxy_url("http://u:p@1.2.3.4:5")
        self.assertEqual(pf.chrome_args(upstream=up, hosts=[], local_port=9280), ["--proxy-server=http://127.0.0.1:9280"])
        pac_flag = pf.chrome_args(upstream=up, hosts=["bid.cars", "bid.car"], local_port=9280)[0]
        self.assertTrue(pac_flag.startswith("--proxy-pac-url=data:application/x-ns-proxy-autoconfig;base64,"))
        pac = base64.b64decode(pac_flag.split("base64,", 1)[1]).decode()
        self.assertIn("dnsDomainIs(host, '.bid.cars')", pac)
        self.assertIn("PROXY 127.0.0.1:9280", pac)
        self.assertEqual(pf.chrome_args(upstream=None, hosts=[], local_port=1), [])

    def test_httpx_kwargs(self):
        with patch.object(pf, "_settings_tuple", return_value=(pf.parse_proxy_url("http://u:p@1.2.3.4:5"), [], 9280)):
            self.assertEqual(pf.httpx_kwargs(), {"proxy": "http://u:p@1.2.3.4:5"})
        with patch.object(pf, "_settings_tuple", return_value=(pf.parse_proxy_url("1.2.3.4:5"), ["bid.cars"], 9280)):
            kw = pf.httpx_kwargs()
            self.assertEqual(set(kw["mounts"]), {"all://bid.cars", "all://*.bid.cars"})
        with patch.object(pf, "_settings_tuple", return_value=(None, [], 9280)):
            self.assertEqual(pf.httpx_kwargs(), {})


class ForwarderTests(unittest.TestCase):
    """Fake upstream proxy records what it gets and echoes tunnel bytes."""

    def test_connect_tunnel_gets_auth_header(self):
        seen: dict[str, bytes] = {}

        async def upstream(reader, writer):
            head = await reader.readuntil(b"\r\n\r\n")
            seen["head"] = head
            writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
            await writer.drain()
            data = await reader.read(100)
            writer.write(b"echo:" + data)
            await writer.drain()
            writer.close()

        async def run():
            srv = await asyncio.start_server(upstream, "127.0.0.1", 0)
            port = srv.sockets[0].getsockname()[1]
            fwd = pf.ProxyForwarder(pf.parse_proxy_url(f"http://user:secret@127.0.0.1:{port}"), local_port=0)
            await fwd.start()
            lport = fwd._server.sockets[0].getsockname()[1]
            r, w = await asyncio.open_connection("127.0.0.1", lport)
            w.write(b"CONNECT bid.cars:443 HTTP/1.1\r\nHost: bid.cars:443\r\nProxy-Connection: keep-alive\r\n\r\n")
            await w.drain()
            resp = await r.readuntil(b"\r\n\r\n")
            w.write(b"hello")
            await w.drain()
            echoed = await r.read(100)
            w.close()
            await fwd.stop()
            srv.close()
            return resp, echoed

        resp, echoed = asyncio.run(run())
        self.assertTrue(resp.startswith(b"HTTP/1.1 200"))
        self.assertEqual(echoed, b"echo:hello")
        self.assertIn(b"CONNECT bid.cars:443 HTTP/1.1", seen["head"])
        self.assertIn(b"Proxy-Authorization: Basic " + base64.b64encode(b"user:secret"), seen["head"])

    def test_plain_http_request_rewritten(self):
        seen: dict[str, bytes] = {}

        async def upstream(reader, writer):
            seen["head"] = await reader.readuntil(b"\r\n\r\n")
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
            await writer.drain()
            writer.close()

        async def run():
            srv = await asyncio.start_server(upstream, "127.0.0.1", 0)
            port = srv.sockets[0].getsockname()[1]
            fwd = pf.ProxyForwarder(pf.parse_proxy_url(f"http://u:p@127.0.0.1:{port}"), local_port=0)
            await fwd.start()
            lport = fwd._server.sockets[0].getsockname()[1]
            r, w = await asyncio.open_connection("127.0.0.1", lport)
            w.write(b"GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nProxy-Connection: keep-alive\r\nProxy-Authorization: Basic junk\r\n\r\n")
            await w.drain()
            body = await r.read()
            w.close()
            await fwd.stop()
            srv.close()
            return body

        body = asyncio.run(run())
        self.assertTrue(body.endswith(b"ok"))
        head = seen["head"]
        self.assertIn(b"GET http://example.com/ HTTP/1.1", head)
        self.assertIn(b"Proxy-Authorization: Basic " + base64.b64encode(b"u:p"), head)
        self.assertNotIn(b"Basic junk", head)
        self.assertIn(b"Connection: close", head)

    def test_upstream_407_is_passed_through(self):
        async def upstream(reader, writer):
            await reader.readuntil(b"\r\n\r\n")
            writer.write(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")
            await writer.drain()
            writer.close()

        async def run():
            srv = await asyncio.start_server(upstream, "127.0.0.1", 0)
            port = srv.sockets[0].getsockname()[1]
            fwd = pf.ProxyForwarder(pf.parse_proxy_url(f"127.0.0.1:{port}"), local_port=0)
            await fwd.start()
            lport = fwd._server.sockets[0].getsockname()[1]
            r, w = await asyncio.open_connection("127.0.0.1", lport)
            w.write(b"CONNECT x:443 HTTP/1.1\r\n\r\n")
            await w.drain()
            resp = await r.read()
            w.close()
            await fwd.stop()
            srv.close()
            return resp, fwd.errors

        resp, errors = asyncio.run(run())
        self.assertTrue(resp.startswith(b"HTTP/1.1 407"))
        self.assertEqual(errors, 1)


if __name__ == "__main__":
    unittest.main()


class ForwarderThreadTests(unittest.TestCase):
    def test_forwarder_keeps_serving_while_caller_loop_is_blocked(self):
        import socket
        import threading
        import time

        def upstream_server(sock):
            conn, _ = sock.accept()
            conn.recv(4096)
            conn.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
            conn.close()

        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        threading.Thread(target=upstream_server, args=(sock,), daemon=True).start()

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            local_port = probe.getsockname()[1]
        up = pf.parse_proxy_url(f"127.0.0.1:{sock.getsockname()[1]}")

        async def run():
            with patch.object(pf, "_settings_tuple", return_value=(up, [], local_port)):
                await pf.start_forwarder_from_settings()
                result = {}

                def client():
                    with socket.create_connection(("127.0.0.1", local_port), timeout=3) as c:
                        c.sendall(b"CONNECT x:443 HTTP/1.1\r\n\r\n")
                        result["resp"] = c.recv(100)

                t = threading.Thread(target=client)
                t.start()
                time.sleep(0.5)  # blocks this event loop on purpose
                self.assertIn("resp", result)
                t.join()
                await pf.stop_forwarder()
                return result["resp"]

        self.assertTrue(asyncio.run(run()).startswith(b"HTTP/1.1 200"))
        sock.close()
