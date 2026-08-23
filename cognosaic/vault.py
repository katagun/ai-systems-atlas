from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from .models import Record, utc_now
from .paths import BrainPaths

_FRONTMATTER = re.compile(r"\A---\s*\n(?P<meta>.*?)\n---\s*\n(?P<body>.*)\Z", re.DOTALL)
_SLUG = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    slug = _SLUG.sub("-", value.lower()).strip("-")
    return slug[:48] or "memory"


def new_record_id(title: str) -> str:
    now = datetime.now(UTC)
    entropy = secrets.token_hex(3)
    return f"{now:%Y%m%d}-{_slugify(title)}-{entropy}"


def render_record(record: Record) -> str:
    metadata = json.dumps(record.metadata(), ensure_ascii=False, indent=2, sort_keys=True)
    return f"---\n{metadata}\n---\n# {record.title}\n\n{record.content.rstrip()}\n"


def parse_record(text: str) -> Record:
    match = _FRONTMATTER.match(text)
    if not match:
        raise ValueError("record is missing JSON frontmatter")
    metadata = json.loads(match.group("meta"))
    body = match.group("body")
    if body.startswith("# "):
        first_newline = body.find("\n")
        body = body[first_newline + 1 :] if first_newline >= 0 else ""
    return Record.from_metadata(metadata, body.strip())


def checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Vault:
    def __init__(self, paths: BrainPaths):
        self.paths = paths
        self.paths.ensure()

    def _record_path(self, record: Record) -> Path:
        try:
            created = datetime.fromisoformat(record.created_at.replace("Z", "+00:00"))
        except ValueError:
            created = datetime.now(UTC)
        return self.paths.records / f"{created:%Y}" / f"{created:%m}" / f"{record.id}.md"

    @staticmethod
    def _atomic_write(path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def append_event(self, event: str, record_id: str, **details: Any) -> None:
        payload = {
            "at": utc_now(),
            "event": event,
            "record_id": record_id,
            "details": details,
        }
        self.paths.events.parent.mkdir(parents=True, exist_ok=True)
        with self.paths.events.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    def save(self, record: Record, *, event: str = "record.saved") -> Path:
        record.updated_at = utc_now()
        path = self._record_path(record)
        text = render_record(record)
        self._atomic_write(path, text)
        self.append_event(event, record.id, path=str(path), sha256=checksum(text), status=record.status)
        return path

    def create(
        self,
        *,
        title: str,
        content: str,
        record_type: str = "note",
        tags: Iterable[str] = (),
        sources: Iterable[str] = (),
        links: Iterable[str] = (),
        confidence: float = 1.0,
        origin: str = "human",
        valid_from: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> Record:
        record = Record(
            id=new_record_id(title),
            title=title,
            content=content,
            record_type=record_type,  # type: ignore[arg-type]
            tags=list(tags),
            sources=list(sources),
            links=list(links),
            confidence=confidence,
            origin=origin,
            valid_from=valid_from,
            extra=extra or {},
        )
        self.save(record, event="record.created")
        return record

    def iter_paths(self, *, include_archive: bool = True) -> Iterable[Path]:
        yield from sorted(self.paths.records.rglob("*.md"))
        if include_archive:
            yield from sorted(self.paths.archive.rglob("*.md"))

    def iter_records(self, *, include_archive: bool = True) -> Iterable[tuple[Record, Path]]:
        for path in self.iter_paths(include_archive=include_archive):
            try:
                yield parse_record(path.read_text(encoding="utf-8")), path
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                self.append_event("record.parse_failed", path.stem, path=str(path), error=str(exc))

    def find_path(self, record_id: str) -> Path | None:
        matches = list(self.paths.records.rglob(f"{record_id}.md"))
        if not matches:
            matches = list(self.paths.archive.rglob(f"{record_id}.md"))
        if len(matches) > 1:
            raise RuntimeError(f"duplicate record id detected: {record_id}")
        return matches[0] if matches else None

    def get(self, record_id: str) -> Record:
        path = self.find_path(record_id)
        if not path:
            raise KeyError(record_id)
        return parse_record(path.read_text(encoding="utf-8"))

    def supersede(
        self,
        old_id: str,
        *,
        title: str,
        content: str,
        record_type: str | None = None,
        tags: Iterable[str] | None = None,
        sources: Iterable[str] | None = None,
        confidence: float | None = None,
        origin: str = "human",
    ) -> Record:
        old = self.get(old_id)
        if old.status != "active":
            raise ValueError(f"only active records can be superseded; {old_id} is {old.status}")
        now = utc_now()
        new = Record(
            id=new_record_id(title),
            title=title,
            content=content,
            record_type=(record_type or old.record_type),  # type: ignore[arg-type]
            tags=list(tags if tags is not None else old.tags),
            sources=list(sources if sources is not None else old.sources),
            links=list(old.links),
            supersedes=[old.id],
            confidence=confidence if confidence is not None else old.confidence,
            origin=origin,
            valid_from=now,
        )
        old.status = "superseded"
        old.valid_to = now
        old.links = list(dict.fromkeys([*old.links, new.id]))
        self.save(old, event="record.superseded")
        self.save(new, event="record.created_as_supersession")
        return new

    def archive(self, record_id: str) -> Path:
        path = self.find_path(record_id)
        if not path:
            raise KeyError(record_id)
        record = parse_record(path.read_text(encoding="utf-8"))
        record.status = "archived"
        record.updated_at = utc_now()
        destination = self.paths.archive / f"{record.id}.md"
        self._atomic_write(destination, render_record(record))
        path.unlink()
        self.append_event("record.archived", record.id, from_path=str(path), to_path=str(destination))
        return destination

    def hard_delete(self, record_id: str) -> None:
        path = self.find_path(record_id)
        if not path:
            raise KeyError(record_id)
        tombstone = self.paths.root / "tombstones" / f"{record_id}.json"
        tombstone.parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(
            tombstone,
            json.dumps({"id": record_id, "deleted_at": utc_now(), "former_path": str(path)}, indent=2) + "\n",
        )
        path.unlink()
        self.append_event("record.hard_deleted", record_id, tombstone=str(tombstone))

    def import_text_file(self, source: Path, *, tags: Iterable[str] = ()) -> Record:
        source = source.expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        content = source.read_text(encoding="utf-8", errors="replace")
        title = source.stem.replace("_", " ").replace("-", " ").strip().title()
        return self.create(
            title=title,
            content=content,
            record_type="source",
            tags=[*tags, source.suffix.lstrip(".").lower()],
            sources=[source.as_uri()],
            origin="file-import",
            extra={"imported_from": str(source), "source_sha256": checksum(content)},
        )

    def backup(self, destination: Path) -> Path:
        destination = destination.expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        archive = shutil.make_archive(str(destination), "zip", root_dir=self.paths.root)
        self.append_event("vault.backed_up", "vault", destination=archive)
        return Path(archive)
