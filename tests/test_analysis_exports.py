from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path

from scripts import build_analysis_exports
from scripts.build_analysis_exports import (
    COLLECTIONS,
    HEADERS,
    INPUT_FILES,
    build_outputs,
    load_catalog,
)
from scripts.catalog import PUBLISHED_DATA

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "web" / "analysis"


def read_table(name: str) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    with (ANALYSIS / f"{name}.csv").open(encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = tuple(reader.fieldnames or ())
        return header, list(reader)


class AnalysisExportsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = {
            name: json.loads((ROOT / "web" / name).read_text(encoding="utf-8"))
            for name in INPUT_FILES
        }
        cls.tables = {name: read_table(name) for name in build_analysis_exports.TABLES}
        cls.records = cls.tables["records"][1]

    def test_headers_match_contract(self) -> None:
        for name, (header, _rows) in self.tables.items():
            self.assertEqual(header, HEADERS[name], name)

    def test_record_counts_reconcile_to_published(self) -> None:
        by_collection: dict[str, list[dict[str, str]]] = {}
        for row in self.records:
            by_collection.setdefault(row["collection"], []).append(row)
        for (
            collection,
            filename,
            reckey,
            _kind,
            _type,
            _status,
            _lic,
            _scored,
        ) in COLLECTIONS:
            published = self.catalog[filename][reckey]
            rows = by_collection.get(collection, [])
            reviewed = [row for row in rows if row["record_kind"] == "reviewed"]
            self.assertEqual(len(reviewed), len(published), collection)
            self.assertEqual(
                {row["record_id"] for row in reviewed},
                {r["id"] for r in published},
                collection,
            )
        reviewed_source = {
            m["source_id"]
            for m in self.catalog["models.json"]["models"]
            if m.get("source_id")
        }
        reviewed_nosource = {
            m["id"]
            for m in self.catalog["models.json"]["models"]
            if not m.get("source_id")
        }
        expected_imported = [
            row
            for row in self.catalog["models-dev.json"]["models"]
            if row.get("source_id") not in reviewed_source
            and row.get("id") not in reviewed_nosource
        ]
        imported = [
            row
            for row in by_collection.get("models", [])
            if row["record_kind"] == "imported_source"
        ]
        self.assertEqual(len(imported), len(expected_imported))
        self.assertEqual(
            {row["record_id"] for row in imported},
            {row["id"] for row in expected_imported},
        )
        kinds = {row["record_kind"] for row in self.records}
        self.assertEqual(kinds, {"reviewed", "imported_source"})

    def test_imported_rows_carry_no_reviewed_conclusions(self) -> None:
        for row in self.records:
            if row["record_kind"] != "imported_source":
                continue
            self.assertEqual(row["type_value"], "")
            self.assertEqual(row["status"], "")
            self.assertEqual(row["verified_at"], "")
            self.assertNotEqual(row["source_id"], "")

    def test_child_tables_join_to_reviewed_records(self) -> None:
        reviewed = {
            (row["collection"], row["record_id"])
            for row in self.records
            if row["record_kind"] == "reviewed"
        }
        reviewed_models = {
            row["record_id"]
            for row in self.records
            if row["collection"] == "models" and row["record_kind"] == "reviewed"
        }
        for row in self.tables["model_distributions"][1]:
            self.assertIn(("models", row["record_id"]), reviewed)
        for table in ("material_licenses", "score_dimensions", "evidence"):
            for row in self.tables[table][1]:
                self.assertIn((row["collection"], row["record_id"]), reviewed, table)
        self.assertTrue(reviewed_models)

    def test_child_tables_cover_exactly_the_records_carrying_each_field(self) -> None:
        by_collection: dict[str, dict[str, dict]] = {}
        for (
            collection,
            filename,
            reckey,
            _kind,
            _type,
            _status,
            _lic,
            _scored,
        ) in COLLECTIONS:
            by_collection[collection] = {
                r["id"]: r for r in self.catalog[filename][reckey]
            }
        modes = {
            (r["id"], mode)
            for r in by_collection["models"].values()
            for mode in set(r.get("distribution_modes", []))
        }
        got_modes = {
            (r["record_id"], r["distribution_mode"])
            for r in self.tables["model_distributions"][1]
        }
        self.assertEqual(got_modes, modes)
        licensed = {
            (collection, rid, lic)
            for collection, _fn, _rk, _kd, _tf, _sf, licfield, _sc in COLLECTIONS
            if licfield
            for rid, r in by_collection[collection].items()
            for lic in set(r.get(licfield, []))
        }
        got_licensed = {
            (r["collection"], r["record_id"], r["license_id"])
            for r in self.tables["material_licenses"][1]
        }
        self.assertEqual(got_licensed, licensed)
        scored = {
            (collection, rid, r.get("score_profile", ""), dim)
            for collection, _fn, _rk, _kd, _tf, _sf, _lf, scored_flag in COLLECTIONS
            if scored_flag
            for rid, r in by_collection[collection].items()
            for dim in r.get("score", {})
        }
        got_scored = {
            (r["collection"], r["record_id"], r["score_profile"], r["dimension"])
            for r in self.tables["score_dimensions"][1]
        }
        self.assertEqual(got_scored, scored)

    def test_record_totals_do_not_come_from_child_rows(self) -> None:
        spine_ids = {(r["collection"], r["record_id"]) for r in self.records}
        for table in (
            "model_distributions",
            "material_licenses",
            "score_dimensions",
            "evidence",
        ):
            _header, rows = self.tables[table]
            self.assertGreater(len(rows), 0, table)
            keys = {(r.get("collection", "models"), r["record_id"]) for r in rows}
            self.assertTrue(keys <= spine_ids, table)

    def test_dictionary_covers_every_column(self) -> None:
        _header, rows = self.tables["data_dictionary"]
        documented = {(r["table"], r["column"]) for r in rows}
        for name, header in HEADERS.items():
            for column in header:
                self.assertIn((name, column), documented, f"{name}.{column}")

    def test_inputs_are_published_data_only(self) -> None:
        self.assertTrue(set(INPUT_FILES) <= set(PUBLISHED_DATA))
        manifest = json.loads((ANALYSIS / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["generator"], "scripts/build_analysis_exports.py")
        self.assertEqual(set(manifest["inputs"]), set(INPUT_FILES))
        for name in build_analysis_exports.TABLES:
            table = manifest["tables"][name]
            _header, rows = self.tables[name]
            self.assertEqual(table["rows"], len(rows), name)

    def test_build_is_deterministic(self) -> None:
        catalog = load_catalog()
        first = build_outputs(catalog)
        second = build_outputs(catalog)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
