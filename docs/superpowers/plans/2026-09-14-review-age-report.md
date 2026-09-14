# Review-Age Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `scripts/report_review_age.py` that shows, per reviewed record, the age of its editorial review, the age and location of its oldest human evidence review, and the age of its newest automated metadata timestamp.

**Architecture:** One offline script of pure functions over the canonical `directory/` files — `review_rows` builds rows, `filter_rows` narrows them, `render_table`/`render_json` print them, `main` parses arguments. Human review dates are found by walking for the exact key `verified_at`; automation timestamps are read only from `metadata_verified_at` and `stars_verified_at`. Nothing is written and nothing is gated.

**Tech Stack:** Python 3.11+ standard library (`argparse`, `dataclasses`, `datetime`, `json`), `unittest`, `ruff`, `uv`.

**Spec:** `docs/superpowers/specs/2026-09-14-review-age-report-design.md`

## Global Constraints

- The report never writes a file, never changes a date, fetches nothing, and exits 0 on success. (Spec: Non-goals, decision 3.)
- Editorial dates are only keys named exactly `verified_at`; `metadata_verified_at`, `stars_verified_at`, `pushed_at`, `fetched_at`, and `published_at` never enter an editorial column. (Spec decision 2.)
- Collections, in order: `systems` (`projects.json`/`projects`), `inference` (`inference-services.json`/`services`), `runtimes` (`local-runtimes.json`/`runtimes`), `models` (`models.json`/`models`), `specifications` (`specifications.json`/`specifications`). System license evidence comes from `license-evidence.json` `entries[]`, joined by `project_id`.
- `--older-than` is strict (`>`), non-negative, and applies to the older of *reviewed* and *oldest evidence*.
- Every catalog review and metadata date is a plain `YYYY-MM-DD` string (checked 2026-09-14: 1,466 `verified_at`, 240 `metadata_verified_at`, 215 `stars_verified_at`), so `date.fromisoformat` parses them; a malformed value raises.
- Commands run from the repository root with `uv run`. Commit messages end with a separate line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: The report script, test-first

**Files:**
- Create: `tests/test_review_age.py`
- Create: `scripts/report_review_age.py`

**Interfaces:**
- Produces: `COLLECTIONS`, `Dated(on: date, age_days: int, source: str)`, `ReviewRow(collection, id, name, reviewed: Dated, oldest_evidence: Dated | None, metadata: Dated | None)` with `editorial_age: int`, `review_rows(directory: Path, as_of: date) -> list[ReviewRow]`, `filter_rows(rows, older_than: int | None = None, collections: set[str] | None = None) -> list[ReviewRow]`, `render_table(rows, as_of) -> str`, `render_json(rows, as_of) -> str`, `main(argv: list[str] | None = None) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_review_age.py`:

```python
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts import report_review_age as report

ROOT = Path(__file__).resolve().parents[1]
AS_OF = date(2026, 9, 14)


def write_catalog(
    directory: Path,
    *,
    systems: tuple[dict, ...] = (),
    licenses: tuple[dict, ...] = (),
    services: tuple[dict, ...] = (),
    runtimes: tuple[dict, ...] = (),
    models: tuple[dict, ...] = (),
    specifications: tuple[dict, ...] = (),
) -> Path:
    files = {
        "projects.json": {"projects": list(systems)},
        "license-evidence.json": {"entries": list(licenses)},
        "inference-services.json": {"services": list(services)},
        "local-runtimes.json": {"runtimes": list(runtimes)},
        "models.json": {"models": list(models)},
        "specifications.json": {"specifications": list(specifications)},
    }
    for name, payload in files.items():
        (directory / name).write_text(json.dumps(payload), encoding="utf-8")
    return directory


def record(record_id: str, verified_at: str, **fields: object) -> dict:
    return {"id": record_id, "name": record_id.title(), "verified_at": verified_at, **fields}


class ReviewAgeTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)

    def rows(self, **catalog: tuple[dict, ...]) -> list[report.ReviewRow]:
        return report.review_rows(write_catalog(self.directory, **catalog), AS_OF)

    def test_reviewed_age_counts_days_before_as_of(self) -> None:
        (row,) = self.rows(specifications=(record("mcp", "2026-09-04"),))
        self.assertEqual(row.reviewed.on, date(2026, 9, 4))
        self.assertEqual(row.reviewed.age_days, 10)
        self.assertIsNone(row.oldest_evidence)
        self.assertIsNone(row.metadata)

    def test_oldest_evidence_is_the_earliest_nested_review_date_and_names_it(self) -> None:
        service = record(
            "router",
            "2026-09-13",
            evidence=[{"url": "https://example.com/a", "verified_at": "2026-09-01"}],
            terms={"url": "https://example.com/terms", "verified_at": "2026-08-20"},
            trust={
                "verified_at": "2026-09-12",
                "properties": {"cache_isolation": {"status": "undocumented", "verified_at": "2026-08-15"}},
                "findings": [],
            },
        )
        (row,) = self.rows(services=(service,))
        self.assertEqual(row.oldest_evidence.on, date(2026, 8, 15))
        self.assertEqual(row.oldest_evidence.age_days, 30)
        self.assertEqual(row.oldest_evidence.source, "trust.properties.cache_isolation")

    def test_system_license_evidence_is_joined_by_project_id(self) -> None:
        systems = (record("agent", "2026-09-10"), record("other", "2026-09-10"))
        licenses = (
            {"project_id": "agent", "items": [{"kind": "git_blob"}, {"kind": "web_terms", "verified_at": "2026-07-01"}]},
            {"project_id": "other", "items": [{"kind": "git_blob"}]},
        )
        rows = {row.id: row for row in self.rows(systems=systems, licenses=licenses)}
        self.assertEqual(rows["agent"].oldest_evidence.on, date(2026, 7, 1))
        self.assertEqual(rows["agent"].oldest_evidence.source, "license-evidence.json items[1]")
        self.assertIsNone(rows["other"].oldest_evidence)

    def test_automation_and_upstream_dates_never_count_as_editorial(self) -> None:
        system = record(
            "agent",
            "2026-09-10",
            metadata_verified_at="2026-01-01",
            stars_verified_at="2026-01-02",
            pushed_at="2025-01-01T00:00:00Z",
        )
        service = record(
            "router",
            "2026-09-10",
            trust={
                "verified_at": "2026-09-10",
                "properties": {},
                "findings": [{"published_at": "2025-06-01", "source": {"fetched_at": "2025-06-02"}}],
            },
        )
        rows = {row.id: row for row in self.rows(systems=(system,), services=(service,))}
        self.assertIsNone(rows["agent"].oldest_evidence)
        self.assertEqual(rows["router"].oldest_evidence.on, date(2026, 9, 10))
        self.assertEqual(rows["router"].oldest_evidence.source, "trust")

    def test_metadata_is_the_newest_automated_timestamp_or_none(self) -> None:
        systems = (
            record("agent", "2026-09-10", metadata_verified_at="2026-09-12", stars_verified_at="2026-09-13"),
            record("hosted", "2026-09-10", metadata_verified_at=None, stars_verified_at=None),
        )
        rows = {row.id: row for row in self.rows(systems=systems)}
        self.assertEqual(rows["agent"].metadata.on, date(2026, 9, 13))
        self.assertEqual(rows["agent"].metadata.source, "stars_verified_at")
        self.assertIsNone(rows["hosted"].metadata)

    def test_rows_sort_oldest_editorial_date_first(self) -> None:
        rows = self.rows(
            systems=(record("fresh", "2026-09-13"),),
            runtimes=(record("old-evidence", "2026-09-13", evidence=[{"verified_at": "2026-06-01"}]),),
            models=(record("old-review", "2026-07-01"),),
        )
        self.assertEqual([row.id for row in rows], ["old-evidence", "old-review", "fresh"])

    def test_older_than_is_strict_over_either_editorial_age_and_collection_narrows(self) -> None:
        rows = self.rows(
            systems=(record("exactly-ten", "2026-09-04"), record("eleven", "2026-09-03")),
            specifications=(record("old-evidence", "2026-09-13", evidence=[{"verified_at": "2026-08-01"}]),),
        )
        self.assertEqual({row.id for row in report.filter_rows(rows, older_than=10)}, {"eleven", "old-evidence"})
        self.assertEqual([row.id for row in report.filter_rows(rows, collections={"specifications"})], ["old-evidence"])

    def test_malformed_review_date_raises_rather_than_being_skipped(self) -> None:
        with self.assertRaises(ValueError):
            self.rows(models=(record("bad", "2026-13-01"),))

    def test_json_output_has_a_stable_shape(self) -> None:
        rows = self.rows(
            runtimes=(record("engine", "2026-09-04", stars_verified_at="2026-09-13", evidence=[{"verified_at": "2026-09-01"}]),),
        )
        self.assertEqual(
            json.loads(report.render_json(rows, AS_OF)),
            {
                "as_of": "2026-09-14",
                "records": [
                    {
                        "collection": "runtimes",
                        "id": "engine",
                        "name": "Engine",
                        "reviewed": {"date": "2026-09-04", "age_days": 10},
                        "oldest_evidence": {"date": "2026-09-01", "age_days": 13, "source": "evidence[0]"},
                        "metadata": {"date": "2026-09-13", "age_days": 1, "source": "stars_verified_at"},
                    }
                ],
            },
        )

    def test_table_lists_each_row_and_a_summary(self) -> None:
        table = report.render_table(self.rows(specifications=(record("mcp", "2026-09-04"),)), AS_OF)
        self.assertIn("mcp", table)
        self.assertIn("2026-09-04 (10d)", table)
        self.assertIn("1 record as of 2026-09-14 · 1 without dated evidence · 1 without automated metadata", table)

    def test_negative_older_than_is_rejected(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            report.main(["--older-than", "-1"])
        self.assertEqual(caught.exception.code, 2)


class RealCatalogTests(unittest.TestCase):
    def test_every_reviewed_record_appears_once_and_no_file_changes(self) -> None:
        directory = ROOT / "directory"

        def digests() -> dict[str, str]:
            return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(directory.glob("*.json"))}

        before = digests()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(report.main(["--json", "--as-of", "2026-09-14"]), 0)
        self.assertEqual(before, digests())

        expected = sorted(
            (collection, item["id"])
            for collection, filename, key in report.COLLECTIONS
            for item in json.loads((directory / filename).read_text(encoding="utf-8"))[key]
        )
        records = json.loads(output.getvalue())["records"]
        self.assertEqual(sorted((row["collection"], row["id"]) for row in records), expected)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run python -m unittest tests.test_review_age -v`
Expected: `ImportError`/`ModuleNotFoundError` for `scripts.report_review_age`.

- [ ] **Step 3: Write the script**

Create `scripts/report_review_age.py`:

```python
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `uv run python -m unittest tests.test_review_age -v` and `uv run ruff check scripts/report_review_age.py tests/test_review_age.py`
Expected: 12 tests OK; ruff clean. Then run `uv run python scripts/report_review_age.py --older-than 20 | tail -5` and read the output.

- [ ] **Step 5: Commit**

```bash
git add scripts/report_review_age.py tests/test_review_age.py docs/superpowers/specs/2026-09-14-review-age-report-design.md docs/superpowers/plans/2026-09-14-review-age-report.md
git commit -m "Add a read-only review-age report" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Document, retire the backlog item, verify, and merge

**Files:**
- Modify: `docs/OPERATIONS.md` (new section after "Routine verification")
- Modify: `BACKLOG.md` (remove the `Now` item "Add a stale-review report …")

- [ ] **Step 1: Document the report**

In `docs/OPERATIONS.md`, immediately before `## Metadata refresh`, insert:

````markdown
## Review age

```bash
uv run python scripts/report_review_age.py
uv run python scripts/report_review_age.py --older-than 90 --collection systems
uv run python scripts/report_review_age.py --json --as-of 2026-09-14
```

The report reads `directory/` and prints one row per reviewed record, oldest editorial date first. It changes no date, fetches nothing, and always exits 0: it is a prompt for human re-review, never a gate.

- **reviewed** is the age of the record's own `verified_at`.
- **oldest evidence** is the oldest human review date attached to the record — any nested `verified_at` in its evidence, license evidence, terms, or trust record, plus a system's dated items in `license-evidence.json` — and names where that date sits. `none` means the record has no dated evidence; pinned blob evidence carries no review date.
- **metadata** is the newest automated timestamp, `metadata_verified_at` or `stars_verified_at`, or `none` for records without GitHub metadata. It says how fresh the live numbers are, not how fresh the review is.

`pushed_at` is left out because it measures upstream activity, not Atlas review. `--older-than DAYS` keeps records whose review or oldest evidence is more than `DAYS` old; `--collection` accepts `systems`, `inference`, `runtimes`, `models`, or `specifications` and may repeat.

````

- [ ] **Step 2: Retire the backlog item**

Delete the line `- [ ] Add a stale-review report that distinguishes editorial \`verified_at\` age from live-metadata age without changing either date.` from `BACKLOG.md` `Now`.

- [ ] **Step 3: Verify, merge `main`, push, open the PR, enable auto-merge**

Commit the docs, merge `origin/main` (rebuilding generated files if it moved), run the full `AGENTS.md` check list, push `claude/review-age-report`, open the PR, and run `gh pr merge --squash --auto`. After merge, confirm the deploy for the merge commit.
