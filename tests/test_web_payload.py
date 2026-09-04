from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts.build_web_payload import build_payloads, load_catalog

ROOT = Path(__file__).resolve().parents[1]


class WebPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(ROOT)
        cls.payloads = build_payloads(cls.catalog)

    def test_every_published_field_lands_in_boot_or_detail(self) -> None:
        """Detail is the complement of boot: no field is dropped, none is duplicated."""
        boot = {item["id"]: item for item in json.loads(self.payloads["app/systems.json"])["systems"]}
        for record in self.catalog["projects.json"]["projects"]:
            entry = boot[record["id"]]
            detail = json.loads(self.payloads[f"app/detail/system/{record['id']}.json"])
            for field in record:
                if field == "score":
                    self.assertIn("overall", entry["score"])
                    self.assertEqual(record["score"], detail["score"])
                    continue
                self.assertTrue(
                    (field in entry) != (field in detail),
                    f"{record['id']}.{field} must be in exactly one of boot and detail",
                )

    def test_boot_carries_the_dates_the_page_prints(self) -> None:
        """bootstrap() derives the 'Data updated' line from these envelope keys."""
        self.assertIn("generated_at", json.loads(self.payloads["app/systems.json"]))
        for collection in ("inference", "runtimes", "specifications"):
            self.assertIn("verified_at", json.loads(self.payloads[f"app/{collection}.json"]))

    def test_search_index_covers_every_record(self) -> None:
        index = json.loads(self.payloads["app/search/systems.json"])
        ids = {record["id"] for record in self.catalog["projects.json"]["projects"]}
        self.assertEqual(ids, set(index))

    def test_search_index_holds_lowercased_prose(self) -> None:
        index = json.loads(self.payloads["app/search/systems.json"])
        record = self.catalog["projects.json"]["projects"][0]
        self.assertEqual(index[record["id"]], index[record["id"]].lower())
        self.assertIn(record["why_it_matters"].lower(), index[record["id"]])
        for item in record["strengths"]:
            self.assertIn(item.lower(), index[record["id"]])

    def test_payloads_never_carry_the_published_policy_string(self) -> None:
        self.assertNotIn("policy", json.loads(self.payloads["app/systems.json"]))

    def test_one_detail_file_per_record(self) -> None:
        detail = [path for path in self.payloads if path.startswith("app/detail/")]
        records = sum(
            len(self.catalog[name][key])
            for name, key in (
                ("projects.json", "projects"),
                ("inference-services.json", "services"),
                ("local-runtimes.json", "runtimes"),
                ("specifications.json", "specifications"),
            )
        )
        self.assertEqual(records, len(detail))

    def test_committed_output_matches_the_builder(self) -> None:
        """The same assertion --check makes, so a stale commit fails the suite too."""
        for path, content in self.payloads.items():
            self.assertEqual(
                content,
                (ROOT / "web" / path).read_text(encoding="utf-8"),
                f"web/{path} is stale; run uv run python scripts/build_web_payload.py",
            )
