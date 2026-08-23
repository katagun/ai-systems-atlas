from __future__ import annotations

import json
import mimetypes
import secrets
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from .brief import build_brief
from .context import build_context_pack
from .index import BrainIndex
from .paths import BrainPaths
from .vault import Vault

_ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _server_token(paths: BrainPaths) -> str:
    if paths.token.exists():
        token = paths.token.read_text(encoding="utf-8").strip()
        if token:
            return token
    token = secrets.token_urlsafe(32)
    paths.token.write_text(token + "\n", encoding="utf-8")
    try:
        paths.token.chmod(0o600)
    except OSError:
        pass
    return token


class CognosaicHandler(BaseHTTPRequestHandler):
    server_version = "Cognosaic/0.1"

    @property
    def app(self) -> "CognosaicHTTPServer":
        return self.server  # type: ignore[return-value]

    def log_message(self, format: str, *args: object) -> None:
        # Keep the default useful log format, but avoid reverse DNS.
        print(f"[{self.log_date_time_string()}] {self.client_address[0]} {format % args}")

    def _valid_host(self) -> bool:
        raw = self.headers.get("Host", "")
        host = raw.rsplit(":", 1)[0] if raw.count(":") <= 1 else raw
        return host in _ALLOWED_HOSTS

    def _common_headers(self, content_type: str, length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
        )

    def _send_bytes(self, payload: bytes, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        self.send_response(status)
        self._common_headers(content_type, len(payload))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, data: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        payload = json.dumps(data, ensure_ascii=False, indent=2, default=str).encode("utf-8")
        self._send_bytes(payload, "application/json; charset=utf-8", status)

    def _error(self, status: HTTPStatus, message: str) -> None:
        self._send_json({"error": message, "status": status.value}, status)

    def _parse_body(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("application/json"):
            raise ValueError("Content-Type must be application/json")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1_000_000:
            raise ValueError("invalid request body size")
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        return data

    def _authorized_mutation(self) -> bool:
        return secrets.compare_digest(self.headers.get("X-Cognosaic-Token", ""), self.app.token)

    def do_GET(self) -> None:  # noqa: N802
        if not self._valid_host():
            self._error(HTTPStatus.FORBIDDEN, "invalid Host header")
            return
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/health":
                self._send_json({"status": "ok", "version": "0.1.0"})
            elif parsed.path == "/api/session":
                self._send_json({"mutation_token": self.app.token})
            elif parsed.path == "/api/taxonomy":
                self._send_json(_load_json(self.app.project_root / "directory" / "taxonomy.json"))
            elif parsed.path == "/api/directory":
                self._send_json(_load_json(self.app.project_root / "directory" / "projects.json"))
            elif parsed.path == "/api/exclusions":
                self._send_json(_load_json(self.app.project_root / "directory" / "exclusions.json"))
            elif parsed.path == "/api/search":
                term = query.get("q", [""])[0]
                limit = min(max(int(query.get("limit", ["10"])[0]), 1), 50)
                include_inactive = query.get("include_inactive", ["false"])[0].lower() == "true"
                results = self.app.index.search(term, limit=limit, include_inactive=include_inactive)
                self._send_json([asdict(item) | {"citation": item.citation} for item in results])
            elif parsed.path == "/api/context":
                term = query.get("q", [""])[0]
                budget = min(max(int(query.get("budget", ["1800"])[0]), 200), 12000)
                pack = build_context_pack(self.app.index, term, token_budget=budget)
                self._send_json(asdict(pack))
            elif parsed.path == "/api/brief":
                days = min(max(int(query.get("days", ["7"])[0]), 1), 365)
                self._send_json({"days": days, "brief": build_brief(self.app.index, days=days)})
            elif parsed.path.startswith("/api/records/"):
                record_id = unquote(parsed.path.removeprefix("/api/records/"))
                record = self.app.vault.get(record_id)
                self._send_json(asdict(record))
            elif parsed.path.startswith("/api/"):
                self._error(HTTPStatus.NOT_FOUND, "unknown API endpoint")
            else:
                self._serve_static(parsed.path)
        except KeyError as exc:
            self._error(HTTPStatus.NOT_FOUND, f"record not found: {exc.args[0]}")
        except (ValueError, json.JSONDecodeError) as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:  # pragma: no cover - defensive boundary
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, f"server error: {exc}")

    def do_POST(self) -> None:  # noqa: N802
        if not self._valid_host():
            self._error(HTTPStatus.FORBIDDEN, "invalid Host header")
            return
        if not self._authorized_mutation():
            self._error(HTTPStatus.FORBIDDEN, "missing or invalid mutation token")
            return
        parsed = urlparse(self.path)
        try:
            body = self._parse_body()
            if parsed.path == "/api/capture":
                record = self.app.vault.create(
                    title=str(body.get("title", "")).strip(),
                    content=str(body.get("content", "")).strip(),
                    record_type=str(body.get("record_type", "note")),
                    tags=list(body.get("tags") or []),
                    sources=list(body.get("sources") or []),
                    links=list(body.get("links") or []),
                    confidence=float(body.get("confidence", 1.0)),
                    origin=str(body.get("origin", "web")),
                )
                path = self.app.vault.find_path(record.id)
                if path:
                    self.app.index.upsert(record, path)
                self._send_json(asdict(record), HTTPStatus.CREATED)
            elif parsed.path == "/api/supersede":
                record = self.app.vault.supersede(
                    str(body.get("old_id", "")),
                    title=str(body.get("title", "")).strip(),
                    content=str(body.get("content", "")).strip(),
                    record_type=body.get("record_type"),
                    tags=body.get("tags"),
                    sources=body.get("sources"),
                    confidence=float(body["confidence"]) if "confidence" in body else None,
                    origin=str(body.get("origin", "web")),
                )
                self.app.index.rebuild(self.app.vault)
                self._send_json(asdict(record), HTTPStatus.CREATED)
            elif parsed.path == "/api/archive":
                record_id = str(body.get("record_id", ""))
                path = self.app.vault.archive(record_id)
                self.app.index.rebuild(self.app.vault)
                self._send_json({"record_id": record_id, "archived_path": str(path)})
            elif parsed.path == "/api/reindex":
                count = self.app.index.rebuild(self.app.vault)
                self._send_json({"indexed": count})
            else:
                self._error(HTTPStatus.NOT_FOUND, "unknown API endpoint")
        except KeyError as exc:
            self._error(HTTPStatus.NOT_FOUND, f"record not found: {exc.args[0]}")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:  # pragma: no cover - defensive boundary
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, f"server error: {exc}")

    def _serve_static(self, request_path: str) -> None:
        relative = request_path.lstrip("/") or "index.html"
        static_root = self.app.project_root / "web"
        candidate = (static_root / relative).resolve()
        if static_root.resolve() not in candidate.parents and candidate != static_root.resolve():
            self._error(HTTPStatus.FORBIDDEN, "invalid path")
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            candidate = static_root / "index.html"
        content_type, _ = mimetypes.guess_type(candidate.name)
        self._send_bytes(candidate.read_bytes(), content_type or "application/octet-stream")


class CognosaicHTTPServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], paths: BrainPaths):
        self.paths = paths
        self.vault = Vault(paths)
        self.index = BrainIndex(paths)
        if not paths.index.exists():
            self.index.rebuild(self.vault)
        self.token = _server_token(paths)
        self.project_root = _project_root()
        super().__init__(address, CognosaicHandler)


def serve(paths: BrainPaths, host: str = "127.0.0.1", port: int = 8765) -> None:
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Cognosaic binds to loopback only")
    server = CognosaicHTTPServer((host, port), paths)
    print(f"Cognosaic is available at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
