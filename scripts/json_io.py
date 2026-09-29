"""Atomic reads and writes for the canonical JSON files in `directory/`.

CR-14 in `docs/CODEBASE_REVIEW_2026-09-28.md`. Every writer of canonical data used
to carry its own `write_json` helper, and four of them wrote with a bare
`path.write_text`. An interrupt in the middle of a multi-file update left the
catalog half-refreshed, and `scripts/import_models_dev.py` printed "failed without
changing the queue" for a failure that had already rewritten the pinned snapshot.

The atomic-replace and rollback shapes were already correct in
`promote_system_candidate.py` and `promote_model_candidate.py`, in two verbatim
copies each. They live here now, once.

Two properties matter, and both are load-bearing:

* A write either replaces the target whole or leaves it untouched. `write_text`
  truncates first, so a crash mid-write leaves a file that parses as nothing.
* A multi-file update either lands whole or leaves every file as it was. Readers
  never see a catalog where three collections were refreshed and three were not.
"""

from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

__all__ = [
    "DirectoryDataError",
    "load_document",
    "write_json_atomic",
    "write_json_atomic_all",
]


class DirectoryDataError(Exception):
    """A canonical file is missing, unreadable, or not a JSON object.

    CR-22. Six loaders disagreed about this: some returned a default for a
    missing file, some let `JSONDecodeError` escape with no filename attached, and
    two promote scripts raised their own error type. Because every script exited 1
    either way, a corrupt `taxonomy.json` surfaced as a bare "Expecting property
    name enclosed in double quotes" with nothing naming the file.
    """


def load_document(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Read one canonical document, naming the file in any failure.

    `default` is returned only when the file is absent. A file that exists but does
    not parse is an error, never a silent default: a half-written catalog must not
    read as an empty one.
    """
    if not path.exists():
        if default is not None:
            return default
        raise DirectoryDataError(f"{path}: canonical file is missing")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise DirectoryDataError(f"{path}: cannot be read: {error}") from error
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        raise DirectoryDataError(
            f"{path}: is not valid JSON: {error.msg} at line {error.lineno} "
            f"column {error.colno}"
        ) from error
    if not isinstance(value, dict):
        raise DirectoryDataError(
            f"{path}: must be a JSON object at the top level, found "
            f"{type(value).__name__}"
        )
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    """Write one JSON document so a reader sees the old file or the new one.

    The payload is written to a temporary file in the target directory, flushed to
    disk, given the target's existing permissions, and then moved into place with
    `os.replace`, which is atomic within a filesystem. The temporary file is removed
    on every path, including failure.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    target_mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary_path, target_mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def write_json_atomic_all(pairs: list[tuple[Path, dict[str, Any]]]) -> None:
    """Write several documents together, restoring every one if any write fails.

    Reads the current bytes of each target first. If any write raises, each file is
    restored from those bytes and the original exception propagates, so the catalog
    is either fully new or fully old. A target that does not exist yet is recorded as
    absent and removed on rollback, rather than failing the write or being left
    behind — a first-time file is a legitimate member of a group write.

    The guard catches `BaseException`, not `Exception`. An interrupt is the most
    likely way a group write is cut short, and `KeyboardInterrupt` and
    `SystemExit` are both `BaseException`; catching `Exception` would skip the
    rollback in exactly the case a person caused. The two promote scripts carried
    the same `except Exception` inline before this module.
    """
    originals = [
        (path, path.read_bytes() if path.exists() else None) for path, _ in pairs
    ]
    try:
        for path, value in pairs:
            write_json_atomic(path, value)
    except BaseException:
        for path, original in originals:
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original)
        raise
