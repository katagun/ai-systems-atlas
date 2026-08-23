from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

RecordType = Literal[
    "note",
    "observation",
    "decision",
    "project",
    "person",
    "task",
    "source",
    "claim",
    "event",
]
RecordStatus = Literal["active", "superseded", "archived", "deleted"]


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds")


@dataclass(slots=True)
class Record:
    id: str
    title: str
    content: str
    record_type: RecordType = "note"
    status: RecordStatus = "active"
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    valid_from: str | None = None
    valid_to: str | None = None
    confidence: float = 1.0
    tags: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    supersedes: list[str] = field(default_factory=list)
    origin: str = "human"
    visibility: str = "private"
    extra: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("record id cannot be empty")
        if not self.title.strip():
            raise ValueError("record title cannot be empty")
        if not 0 <= self.confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        self.tags = sorted({tag.strip().lower() for tag in self.tags if tag.strip()})
        self.sources = list(dict.fromkeys(source.strip() for source in self.sources if source.strip()))
        self.links = list(dict.fromkeys(link.strip() for link in self.links if link.strip()))
        self.supersedes = list(dict.fromkeys(item.strip() for item in self.supersedes if item.strip()))
        self.valid_from = self.valid_from or self.created_at

    def metadata(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("content")
        return data

    @classmethod
    def from_metadata(cls, metadata: dict[str, Any], content: str) -> "Record":
        known = {
            "id",
            "title",
            "record_type",
            "status",
            "created_at",
            "updated_at",
            "valid_from",
            "valid_to",
            "confidence",
            "tags",
            "sources",
            "links",
            "supersedes",
            "origin",
            "visibility",
            "extra",
        }
        unknown = {key: value for key, value in metadata.items() if key not in known}
        merged_extra = dict(metadata.get("extra") or {})
        merged_extra.update(unknown)
        return cls(
            id=str(metadata["id"]),
            title=str(metadata["title"]),
            content=content,
            record_type=metadata.get("record_type", "note"),
            status=metadata.get("status", "active"),
            created_at=metadata.get("created_at", utc_now()),
            updated_at=metadata.get("updated_at", utc_now()),
            valid_from=metadata.get("valid_from"),
            valid_to=metadata.get("valid_to"),
            confidence=float(metadata.get("confidence", 1.0)),
            tags=list(metadata.get("tags") or []),
            sources=list(metadata.get("sources") or []),
            links=list(metadata.get("links") or []),
            supersedes=list(metadata.get("supersedes") or []),
            origin=str(metadata.get("origin", "human")),
            visibility=str(metadata.get("visibility", "private")),
            extra=merged_extra,
        )
