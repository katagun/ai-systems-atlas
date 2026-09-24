#!/usr/bin/env python3
"""Serve web/ on 127.0.0.1 for the browser suite and for exploratory checks.

``python -m http.server`` listens with socketserver's default backlog of five, and
the kernel drops the handshake of a connection that arrives while five others wait
to be accepted. The directory fetches its boot payloads in parallel, each on a fresh
HTTP/1.0 connection, and a seven-request burst overflowed that queue on about a
quarter of its connections. Each dropped connection waits on its client to retry the
handshake; on 2026-09-24 the retries failed too, and every local end-to-end run
failed a different handful of tests on pages that never booted. This is the same
threading static server with a backlog deep enough for any burst a browser sends.
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
HOST = "127.0.0.1"


class Server(http.server.ThreadingHTTPServer):
    # The listen backlog. The kernel caps it at somaxconn, which is 128 on macOS.
    request_queue_size = 128


def make_server(port: int, directory: Path = WEB) -> Server:
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=directory
    )
    return Server((HOST, port), handler)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("port", type=int, help="port to listen on; 0 picks a free one")
    args = parser.parse_args(argv)
    with make_server(args.port) as server:
        print(f"Serving {WEB} at http://{HOST}:{server.server_port}/", flush=True)
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
