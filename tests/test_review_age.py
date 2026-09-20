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
    packs: tuple[dict, ...] = (),
    robots: tuple[dict, ...] = (),
) -> Path:
    files = {
        "projects.json": {"projects": list(systems)},
        "license-evidence.json": {"entries": list(licenses)},
        "inference-services.json": {"services": list(services)},
        "local-runtimes.json": {"runtimes": list(runtimes)},
        "models.json": {"models": list(models)},
        "specifications.json": {"specifications": list(specifications)},
        "packs.json": {"packs": list(packs)},
        "robots.json": {"robots": list(robots)},
    }
    for name, payload in files.items():
        (directory / name).write_text(json.dumps(payload), encoding="utf-8")
    return directory


def record(record_id: str, verified_at: str, **fields: object) -> dict:
    return {
        "id": record_id,
        "name": record_id.title(),
        "verified_at": verified_at,
        **fields,
    }


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

    def test_oldest_evidence_is_the_earliest_nested_review_date_and_names_it(
        self,
    ) -> None:
        service = record(
            "router",
            "2026-09-13",
            evidence=[{"url": "https://example.com/a", "verified_at": "2026-09-01"}],
            terms={"url": "https://example.com/terms", "verified_at": "2026-08-20"},
            trust={
                "verified_at": "2026-09-12",
                "properties": {
                    "cache_isolation": {
                        "status": "undocumented",
                        "verified_at": "2026-08-15",
                    }
                },
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
            {
                "project_id": "agent",
                "items": [
                    {"kind": "git_blob"},
                    {"kind": "web_terms", "verified_at": "2026-07-01"},
                ],
            },
            {"project_id": "other", "items": [{"kind": "git_blob"}]},
        )
        rows = {row.id: row for row in self.rows(systems=systems, licenses=licenses)}
        self.assertEqual(rows["agent"].oldest_evidence.on, date(2026, 7, 1))
        self.assertEqual(
            rows["agent"].oldest_evidence.source, "license-evidence.json items[1]"
        )
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
                "findings": [
                    {
                        "published_at": "2025-06-01",
                        "source": {"fetched_at": "2025-06-02"},
                    }
                ],
            },
        )
        rows = {
            row.id: row for row in self.rows(systems=(system,), services=(service,))
        }
        self.assertIsNone(rows["agent"].oldest_evidence)
        self.assertEqual(rows["router"].oldest_evidence.on, date(2026, 9, 10))
        self.assertEqual(rows["router"].oldest_evidence.source, "trust")

    def test_metadata_is_the_newest_automated_timestamp_or_none(self) -> None:
        systems = (
            record(
                "agent",
                "2026-09-10",
                metadata_verified_at="2026-09-12",
                stars_verified_at="2026-09-13",
            ),
            record(
                "hosted",
                "2026-09-10",
                metadata_verified_at=None,
                stars_verified_at=None,
            ),
        )
        rows = {row.id: row for row in self.rows(systems=systems)}
        self.assertEqual(rows["agent"].metadata.on, date(2026, 9, 13))
        self.assertEqual(rows["agent"].metadata.source, "stars_verified_at")
        self.assertIsNone(rows["hosted"].metadata)

    def test_packs_are_reported_with_their_evidence_age(self) -> None:
        (row,) = self.rows(
            packs=(
                record("kit", "2026-09-10", evidence=[{"verified_at": "2026-08-01"}]),
            )
        )
        self.assertEqual("packs", row.collection)
        self.assertEqual(date(2026, 8, 1), row.oldest_evidence.on)
        self.assertIsNone(
            row.metadata, "a pack carries no stars_verified_at, so no metadata column"
        )

    def test_robots_are_reported_with_their_evidence_age(self) -> None:
        (row,) = self.rows(
            robots=(
                record("bot", "2026-09-10", evidence=[{"verified_at": "2026-08-01"}]),
            )
        )
        self.assertEqual("robots", row.collection)
        self.assertEqual(date(2026, 8, 1), row.oldest_evidence.on)
        self.assertIsNone(row.metadata)

    def test_rows_sort_oldest_editorial_date_first(self) -> None:
        rows = self.rows(
            systems=(record("fresh", "2026-09-13"),),
            runtimes=(
                record(
                    "old-evidence",
                    "2026-09-13",
                    evidence=[{"verified_at": "2026-06-01"}],
                ),
            ),
            models=(record("old-review", "2026-07-01"),),
        )
        self.assertEqual(
            [row.id for row in rows], ["old-evidence", "old-review", "fresh"]
        )

    def test_older_than_is_strict_over_either_editorial_age_and_collection_narrows(
        self,
    ) -> None:
        rows = self.rows(
            systems=(
                record("exactly-ten", "2026-09-04"),
                record("eleven", "2026-09-03"),
            ),
            specifications=(
                record(
                    "old-evidence",
                    "2026-09-13",
                    evidence=[{"verified_at": "2026-08-01"}],
                ),
            ),
        )
        self.assertEqual(
            {row.id for row in report.filter_rows(rows, older_than=10)},
            {"eleven", "old-evidence"},
        )
        self.assertEqual(
            [
                row.id
                for row in report.filter_rows(rows, collections={"specifications"})
            ],
            ["old-evidence"],
        )

    def test_malformed_review_date_raises_rather_than_being_skipped(self) -> None:
        with self.assertRaises(ValueError):
            self.rows(models=(record("bad", "2026-13-01"),))

    def test_json_output_has_a_stable_shape(self) -> None:
        rows = self.rows(
            runtimes=(
                record(
                    "engine",
                    "2026-09-04",
                    stars_verified_at="2026-09-13",
                    evidence=[{"verified_at": "2026-09-01"}],
                ),
            ),
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
                        "oldest_evidence": {
                            "date": "2026-09-01",
                            "age_days": 13,
                            "source": "evidence[0]",
                        },
                        "metadata": {
                            "date": "2026-09-13",
                            "age_days": 1,
                            "source": "stars_verified_at",
                        },
                    }
                ],
            },
        )

    def test_table_lists_each_row_and_a_summary(self) -> None:
        table = report.render_table(
            self.rows(specifications=(record("mcp", "2026-09-04"),)), AS_OF
        )
        self.assertIn("mcp", table)
        self.assertIn("2026-09-04 (10d)", table)
        self.assertIn(
            "1 record as of 2026-09-14 · 1 without dated evidence · 1 without automated metadata",
            table,
        )

    def test_negative_older_than_is_rejected(self) -> None:
        with (
            contextlib.redirect_stderr(io.StringIO()),
            self.assertRaises(SystemExit) as caught,
        ):
            report.main(["--older-than", "-1"])
        self.assertEqual(caught.exception.code, 2)


class RealCatalogTests(unittest.TestCase):
    def test_every_reviewed_record_appears_once_and_no_file_changes(self) -> None:
        directory = ROOT / "directory"

        def digests() -> dict[str, str]:
            return {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted(directory.glob("*.json"))
            }

        before = digests()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(report.main(["--json", "--as-of", "2026-09-14"]), 0)
        self.assertEqual(before, digests())

        expected = sorted(
            (collection, item["id"])
            for collection, filename, key in report.COLLECTIONS
            for item in json.loads((directory / filename).read_text(encoding="utf-8"))[
                key
            ]
        )
        records = json.loads(output.getvalue())["records"]
        self.assertEqual(
            sorted((row["collection"], row["id"]) for row in records), expected
        )


if __name__ == "__main__":
    unittest.main()
