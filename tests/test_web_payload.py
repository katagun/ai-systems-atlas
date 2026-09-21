from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts.build_web_payload import (
    BOOT_FIELDS,
    COLLECTIONS,
    SEARCH_FIELDS,
    build_payloads,
    load_catalog,
    model_records,
)

ROOT = Path(__file__).resolve().parents[1]


class WebPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(ROOT)
        cls.payloads = build_payloads(cls.catalog)

    def test_every_published_field_lands_in_boot_or_detail(self) -> None:
        """Detail is the complement of boot: no field is dropped, none is duplicated."""
        for collection, name, key, kind in COLLECTIONS:
            boot = {
                item["id"]: item
                for item in json.loads(self.payloads[f"app/{collection}.json"])[
                    collection
                ]
            }
            for record in self.catalog[name][key]:
                entry = boot[record["id"]]
                detail = json.loads(
                    self.payloads[f"app/detail/{kind}/{record['id']}.json"]
                )
                for field in record:
                    # A score is the one field deliberately split: boot carries
                    # the overall a card prints, detail carries every dimension.
                    # Specifications are unscored, so they never take this path.
                    if field == "score":
                        self.assertIn("overall", entry["score"])
                        self.assertEqual(record["score"], detail["score"])
                        continue
                    self.assertTrue(
                        (field in entry) != (field in detail),
                        f"{collection}/{record['id']}.{field} must be in exactly one of boot and detail",
                    )

    def test_specifications_are_unscored_so_no_field_is_split(self) -> None:
        """The score exception above must never fire for specifications."""
        for record in self.catalog["specifications.json"]["specifications"]:
            self.assertNotIn("score", record)

    def test_boot_carries_the_dates_the_page_prints(self) -> None:
        """bootstrap() derives the 'Data updated' line from these envelope keys."""
        self.assertIn("generated_at", json.loads(self.payloads["app/systems.json"]))
        for collection in (
            "inference",
            "runtimes",
            "specifications",
            "models",
            "packs",
            "robots",
        ):
            self.assertIn(
                "verified_at", json.loads(self.payloads[f"app/{collection}.json"])
            )

    def test_search_index_covers_every_record(self) -> None:
        for collection, name, key, _ in COLLECTIONS:
            index = json.loads(self.payloads[f"app/search/{collection}.json"])
            records = (
                model_records(self.catalog)
                if collection == "models"
                else self.catalog[name][key]
            )
            ids = {record["id"] for record in records}
            self.assertEqual(ids, set(index), collection)

    def test_models_payload_overlays_reviews_on_every_source_record(self) -> None:
        payload = json.loads(self.payloads["app/models.json"])
        source = self.catalog["models-dev.json"]
        reviewed = self.catalog["models.json"]["models"]

        self.assertEqual(source["source_record_count"], len(payload["models"]))
        self.assertEqual(len(reviewed), payload["reviewed_count"])
        self.assertEqual(
            len(reviewed),
            sum(item["review_status"] == "reviewed" for item in payload["models"]),
        )
        self.assertEqual(
            len(payload["models"]),
            len({item["source_id"] for item in payload["models"]}),
        )

    def test_every_imported_model_keeps_its_complete_source_metadata(self) -> None:
        records = {item["id"]: item for item in model_records(self.catalog)}
        boot = {
            item["id"]: item
            for item in json.loads(self.payloads["app/models.json"])["models"]
            if item["review_status"] == "imported"
        }
        details = json.loads(self.payloads["app/model-source-details.json"])

        self.assertEqual(set(boot), set(details))
        for record_id, entry in boot.items():
            self.assertEqual(
                records[record_id]["description"], details[record_id]["description"]
            )
            self.assertEqual(
                records[record_id]["source_metadata"],
                details[record_id]["source_metadata"],
            )
            self.assertEqual(
                {"family", "modalities", "reported_open_weights", "reported_license"},
                set(entry["source_metadata"]),
            )

    def test_search_index_holds_lowercased_prose(self) -> None:
        """Every indexed field of every collection reaches the index, lowercased."""
        for collection, name, key, _ in COLLECTIONS:
            index = json.loads(self.payloads[f"app/search/{collection}.json"])
            for record in self.catalog[name][key]:
                text = index[record["id"]]
                self.assertEqual(text, text.lower(), f"{collection}/{record['id']}")
                for field in SEARCH_FIELDS[collection]:
                    value = record.get(field)
                    if value is None:
                        continue
                    items = value if isinstance(value, list) else [value]
                    for item in items:
                        self.assertIn(
                            str(item).lower(),
                            text,
                            f"{collection}/{record['id']}.{field}",
                        )

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
                ("models.json", "models"),
                ("packs.json", "packs"),
                ("robots.json", "robots"),
            )
        )
        self.assertEqual(records, len(detail))

    def test_packs_are_unscored_and_boot_carries_only_card_fields(self) -> None:
        boot = json.loads(self.payloads["app/packs.json"])
        self.assertIn("packs", boot)
        self.assertTrue(boot["packs"], "the collection has published records")
        for entry in boot["packs"]:
            self.assertNotIn("score", entry)
            self.assertNotIn("installs", entry, "installs is detail-only prose")
            self.assertIn("pack_type", entry)

    def test_robots_are_unscored_and_boot_carries_only_card_fields(self) -> None:
        boot = json.loads(self.payloads["app/robots.json"])
        self.assertIn("robots", boot)
        for entry in boot["robots"]:
            self.assertNotIn("score", entry)
            self.assertNotIn("hardware", entry, "hardware is detail-only prose")
            self.assertIn("form_factor", entry)

    def test_an_empty_robots_collection_still_ships_its_boot_payload(self) -> None:
        """app/robots.json sits in the blocking boot fetch; a missing file blanks the site."""
        catalog = {
            **self.catalog,
            "robots.json": {"verified_at": "2026-09-20", "robots": []},
        }
        payloads = build_payloads(catalog)
        self.assertEqual([], json.loads(payloads["app/robots.json"])["robots"])
        self.assertEqual({}, json.loads(payloads["app/search/robots.json"]))

    def test_named_models_are_searchable_by_name_only(self) -> None:
        """A dict-valued search field is flattened to its name, not a Python repr."""
        robot = {
            "id": "fixture-bot",
            "name": "Fixture Bot",
            "manufacturer": "Example Robotics",
            "url": "https://robots.example/fixture",
            "description": "A test fixture.",
            "form_factor": "humanoid",
            "availability": "reservation",
            "status": "active",
            "ai_basis": ["vendor_named_model"],
            "named_models": [
                {
                    "name": "Sample-VLA",
                    "kind": "vision_language_action",
                    "role_note": "Turns camera frames into arm motion, mentioning roleonlyword.",
                    "evidence_label": "Model announcement",
                }
            ],
            "not_verified": "The model is the maker's claim.",
            "verified_at": "2026-09-20",
        }
        catalog = {
            **self.catalog,
            "robots.json": {
                "verified_at": "2026-09-20",
                "robots": [robot],
            },
        }
        payloads = build_payloads(catalog)
        index = json.loads(payloads["app/search/robots.json"])
        self.assertIn("sample-vla", index["fixture-bot"])
        self.assertNotIn("roleonlyword", index["fixture-bot"])

    def test_trust_records_are_detail_only_and_never_searched(self) -> None:
        """A trust block is read behind a click; it never bloats boot and never makes a card match."""
        self.assertNotIn("trust", BOOT_FIELDS["inference"])
        self.assertNotIn("trust", SEARCH_FIELDS["inference"])

    def test_committed_output_matches_the_builder(self) -> None:
        """The same assertion --check makes, so a stale commit fails the suite too."""
        for path, content in self.payloads.items():
            self.assertEqual(
                content,
                (ROOT / "web" / path).read_text(encoding="utf-8"),
                f"web/{path} is stale; run uv run python scripts/build_web_payload.py",
            )
