#!/usr/bin/env python3
"""Report how long each reviewed record has gone without human review.

Each record gets three ages, kept apart on purpose (ROADMAP.md; docs/DATA_MODEL.md):
its own editorial ``verified_at``; the oldest human review date on its evidence,
terms, and trust record; and the newest automated metadata timestamp. The report
is read-only and never a gate: it changes no date, fetches nothing, and exits 0.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

COLLECTIONS = (
    ("systems", "projects.json", "projects"),
    ("inference", "inference-services.json", "services"),
    ("runtimes", "local-runtimes.json", "runtimes"),
    ("models", "models.json", "models"),
    ("specifications", "specifications.json", "specifications"),
)
COLLECTION_ORDER = {name: index for index, (name, _, _) in enumerate(COLLECTIONS)}

# Automation-owned refresh timestamps. Only these feed the metadata column. The
# editorial walk matches the key "verified_at" exactly, so neither these nor
# upstream dates such as pushed_at or fetched_at can reach an editorial column.
METADATA_KEYS = ("metadata_verified_at", "stars_verified_at")


@dataclass(frozen=True)
class Dated:
    on: date
    age_days: int
    source: str

    def as_json(self, *, with_source: bool = True) -> dict[str, object]:
        payload: dict[str, object] = {"date": self.on.isoformat(), "age_days": self.age_days}
        if with_source:
            payload["source"] = self.source
        return payload


@dataclass(frozen=True)
class ReviewRow:
    collection: str
    id: str
    name: str
    reviewed: Dated
    oldest_evidence: Dated | None
    metadata: Dated | None

    @property
    def editorial_age(self) -> int:
        """The older of the record review and its oldest evidence review."""
        if self.oldest_evidence is None:
            return self.reviewed.age_days
        return max(self.reviewed.age_days, self.oldest_evidence.age_days)


def dated(value: str, as_of: date, source: str) -> Dated:
    on = date.fromisoformat(value)
    return Dated(on=on, age_days=(as_of - on).days, source=source)


def _review_dates(value: object, path: str) -> Iterator[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "verified_at":
                yield path, child
            else:
                yield from _review_dates(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _review_dates(child, f"{path}[{index}]")


def evidence_review_dates(record: dict) -> Iterator[tuple[str, str]]:
    """Yield (location, date) for every human review date below the record itself."""
    for key, child in record.items():
        if key != "verified_at":
            yield from _review_dates(child, key)


def _load(directory: Path, filename: str) -> dict:
    return json.loads((directory / filename).read_text(encoding="utf-8"))


def system_license_review_dates(directory: Path) -> dict[str, list[tuple[str, str]]]:
    """Dated items of each system's license-evidence entry; pinned blobs carry no review date."""
    return {
        entry["project_id"]: [
            (f"license-evidence.json items[{index}]", item["verified_at"])
            for index, item in enumerate(entry["items"])
            if "verified_at" in item
        ]
        for entry in _load(directory, "license-evidence.json")["entries"]
    }


def review_rows(directory: Path, as_of: date) -> list[ReviewRow]:
    licenses = system_license_review_dates(directory)
    rows = []
    for collection, filename, key in COLLECTIONS:
        for record in _load(directory, filename)[key]:
            evidence = [dated(value, as_of, location) for location, value in evidence_review_dates(record)]
            if collection == "systems":
                evidence += [dated(value, as_of, location) for location, value in licenses.get(record["id"], [])]
            metadata = [dated(record[field], as_of, field) for field in METADATA_KEYS if record.get(field)]
            rows.append(
                ReviewRow(
                    collection=collection,
                    id=record["id"],
                    name=record["name"],
                    reviewed=dated(record["verified_at"], as_of, "verified_at"),
                    oldest_evidence=min(evidence, key=lambda item: (item.on, item.source)) if evidence else None,
                    metadata=max(metadata, key=lambda item: item.on) if metadata else None,
                )
            )
    return sorted(rows, key=lambda row: (-row.editorial_age, COLLECTION_ORDER[row.collection], row.id))


def filter_rows(
    rows: Iterable[ReviewRow],
    older_than: int | None = None,
    collections: set[str] | None = None,
) -> list[ReviewRow]:
    """Keep rows in the chosen collections whose review or oldest evidence is older than the threshold."""
    return [
        row
        for row in rows
        if (not collections or row.collection in collections)
        and (older_than is None or row.editorial_age > older_than)
    ]


def _cell(item: Dated | None, *, with_source: bool) -> str:
    if item is None:
        return "none"
    text = f"{item.on.isoformat()} ({item.age_days}d)"
    return f"{text} {item.source}" if with_source else text


def render_table(rows: list[ReviewRow], as_of: date) -> str:
    header = ("collection", "id", "reviewed", "oldest evidence", "metadata")
    body = [
        (
            row.collection,
            row.id,
            _cell(row.reviewed, with_source=False),
            _cell(row.oldest_evidence, with_source=True),
            _cell(row.metadata, with_source=True),
        )
        for row in rows
    ]
    lines = [header, *body]
    widths = [max(len(line[column]) for line in lines) for column in range(len(header))]
    text = ["  ".join(cell.ljust(width) for cell, width in zip(line, widths, strict=True)).rstrip() for line in lines]
    count = len(rows)
    without_evidence = sum(row.oldest_evidence is None for row in rows)
    without_metadata = sum(row.metadata is None for row in rows)
    text += [
        "",
        f"{count} {'record' if count == 1 else 'records'} as of {as_of.isoformat()} · "
        f"{without_evidence} without dated evidence · {without_metadata} without automated metadata",
    ]
    return "\n".join(text) + "\n"


def render_json(rows: list[ReviewRow], as_of: date) -> str:
    payload = {
        "as_of": as_of.isoformat(),
        "records": [
            {
                "collection": row.collection,
                "id": row.id,
                "name": row.name,
                "reviewed": row.reviewed.as_json(with_source=False),
                "oldest_evidence": row.oldest_evidence.as_json() if row.oldest_evidence else None,
                "metadata": row.metadata.as_json() if row.metadata else None,
            }
            for row in rows
        ],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def _non_negative_days(value: str) -> int:
    days = int(value)
    if days < 0:
        raise argparse.ArgumentTypeError("must be zero or more days")
    return days


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--as-of", type=date.fromisoformat, help="date to measure ages from (default: today)")
    parser.add_argument(
        "--older-than",
        type=_non_negative_days,
        metavar="DAYS",
        help="only records whose review or oldest evidence is more than DAYS old",
    )
    parser.add_argument(
        "--collection",
        action="append",
        choices=list(COLLECTION_ORDER),
        help="limit to one collection; repeat for several",
    )
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    parser.add_argument("--directory", type=Path, default=ROOT / "directory", help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    as_of = args.as_of or date.today()
    rows = filter_rows(review_rows(args.directory, as_of), args.older_than, set(args.collection or ()) or None)
    sys.stdout.write(render_json(rows, as_of) if args.json else render_table(rows, as_of))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
