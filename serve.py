#!/usr/bin/env python3
"""Serve this folder on localhost for both IPv4 and IPv6.

Python's built-in server only listens on IPv4. Browsers such as Safari try
::1 first for "localhost" and stop when that port is closed.
"""

import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 4173
ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def main():
    handler = partial(Handler, directory=str(ROOT))
    try:
        httpd = DualStackServer(("::", PORT), handler)
    except OSError:
        httpd = ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    print(f"Offen: http://localhost:{PORT}/")
    print(f"Ersatz: http://127.0.0.1:{PORT}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")


if __name__ == "__main__":
    main()
