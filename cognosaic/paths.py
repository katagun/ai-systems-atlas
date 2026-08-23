from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class BrainPaths:
    root: Path
    records: Path
    archive: Path
    events: Path
    index: Path
    token: Path

    @classmethod
    def from_root(cls, root: str | os.PathLike[str] | None = None) -> "BrainPaths":
        configured = root or os.environ.get("COGNOSAIC_HOME") or "~/.cognosaic"
        base = Path(configured).expanduser().resolve()
        return cls(
            root=base,
            records=base / "records",
            archive=base / "archive",
            events=base / "events.jsonl",
            index=base / "index.sqlite3",
            token=base / ".server-token",
        )

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.records.mkdir(parents=True, exist_ok=True)
        self.archive.mkdir(parents=True, exist_ok=True)
