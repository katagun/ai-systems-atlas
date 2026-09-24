"""The browser suite's server must hold a burst of connections it has not accepted yet.

The directory fetches its boot payloads in parallel, each on a fresh connection, and
socketserver's default listen backlog of five dropped about a quarter of the
connections in such a burst (scripts/serve_web.py has the history).
"""

from __future__ import annotations

import contextlib
import http.client
import io
import select
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from scripts import serve_web

# More connections at once than a browser opens to one host (six in Chromium) and
# than socketserver's default backlog of five can hold.
BURST = 32


class ServeWebTest(unittest.TestCase):
    def start(self, directory: Path) -> serve_web.Server:
        server = serve_web.make_server(0, directory)
        self.addCleanup(server.server_close)
        thread = threading.Thread(
            target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
        )
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.shutdown)
        return server

    def test_listen_queue_holds_a_burst_the_server_has_not_accepted(self) -> None:
        # Listening but not serving yet, like a server still busy with earlier
        # requests: every connection has to wait in the kernel's listen queue.
        server = serve_web.make_server(0, serve_web.WEB)
        self.addCleanup(server.server_close)
        pending = []
        for _ in range(BURST):
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.addCleanup(client.close)
            client.setblocking(False)
            client.connect_ex(server.server_address)
            pending.append(client)

        deadline = time.monotonic() + 0.5
        while pending and time.monotonic() < deadline:
            _, connected, _ = select.select([], pending, [], 0.05)
            pending = [client for client in pending if client not in connected]
        # A connect still pending had its SYN dropped by a full queue. Close it
        # so a retransmitted SYN cannot slip into the queue once it drains.
        for client in pending:
            client.close()

        accepted = 0
        while accepted < BURST and select.select([server.socket], [], [], 0.2)[0]:
            connection, _ = server.socket.accept()
            connection.close()
            accepted += 1
        self.assertEqual(
            accepted, BURST, "the listen queue dropped part of a burst of connections"
        )

    def test_serves_the_directory_on_loopback_only(self) -> None:
        directory = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (directory / "probe.json").write_text('{"ok": true}\n', encoding="utf-8")
        server = self.start(directory)
        host, port = server.server_address
        self.assertEqual(host, "127.0.0.1")

        connection = http.client.HTTPConnection(host, port, timeout=5)
        self.addCleanup(connection.close)
        with contextlib.redirect_stderr(io.StringIO()):
            connection.request("GET", "/probe.json")
            response = connection.getresponse()
            body = response.read()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Content-Type"), "application/json")
        self.assertEqual(body, b'{"ok": true}\n')

    def test_main_serves_web_on_the_given_port_until_interrupted(self) -> None:
        stdout = io.StringIO()
        with (
            mock.patch.object(
                serve_web.Server, "serve_forever", side_effect=KeyboardInterrupt
            ),
            contextlib.redirect_stdout(stdout),
        ):
            self.assertEqual(serve_web.main(["0"]), 0)
        self.assertRegex(
            stdout.getvalue(), r"^Serving .+/web at http://127\.0\.0\.1:\d+/\n$"
        )


if __name__ == "__main__":
    unittest.main()
