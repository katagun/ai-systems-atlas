from __future__ import annotations

import json
import stat
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from scripts.promote_model_candidate import (
    EMPTY_SOURCE_METADATA,
    MODELS_DEV_REPO,
    PromotionError,
    apply_link,
    apply_promotion,
    build_draft,
    build_gap_draft,
    metadata_diff,
    preflight_link,
    preflight_promotion,
    write_draft,
)
from scripts.validate_directory import (
    MODEL_CAPABILITIES,
    MODEL_LIMITS,
    MODEL_SOURCE_METADATA_REQUIRED,
)

ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


class PromoteModelCandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        directory = self.root / "directory"
        directory.mkdir()

        taxonomy = json.loads((ROOT / "directory" / "taxonomy.json").read_text())
        models = json.loads((ROOT / "directory" / "models.json").read_text())
        queue = json.loads((ROOT / "directory" / "model-candidates.json").read_text())
        # The fixture promotes a linked record; models reviewed ahead of models.dev
        # (source_id null, ADR 038) stay in the collection and never count as eligible.
        first_linked = next(
            index
            for index, model in enumerate(models["models"])
            if model["source_id"] is not None
        )
        self.record = deepcopy(models["models"].pop(first_linked))
        self.candidate = {
            "id": self.record["id"],
            "source_id": self.record["source_id"],
            "source_metadata": deepcopy(self.record["source_metadata"]),
            "status": "provisional",
            "discovered_at": "2026-09-04",
            "last_seen_at": "2026-09-04",
            "review_required": [
                "official_identity",
                "model_boundary",
                "license_evidence",
                "source_model",
                "model_access_score",
            ],
        }
        pinned_url = (
            "https://github.com/anomalyco/models.dev/blob/"
            f"{queue['source']['commit']}/models/{self.record['source_id']}.toml"
        )
        for evidence in self.record["evidence"]:
            if "github.com/anomalyco/models.dev/blob/" in evidence["url"]:
                evidence["url"] = pinned_url
        queue["updated_at"] = "2026-09-04"
        queue["source_record_count"] = len(models["models"]) + 1
        queue["eligible_record_count"] = (
            sum(model["source_id"] is not None for model in models["models"]) + 1
        )
        queue["candidates"] = [deepcopy(self.candidate)]
        source_models = {
            "models": [
                {
                    "id": self.candidate["id"],
                    "source_id": self.candidate["source_id"],
                    "source_metadata": deepcopy(self.candidate["source_metadata"]),
                }
            ],
        }

        write_json(directory / "taxonomy.json", taxonomy)
        write_json(directory / "models.json", models)
        write_json(directory / "models-dev.json", source_models)
        write_json(directory / "model-candidates.json", queue)
        for name in (
            "projects.json",
            "specifications.json",
            "inference-services.json",
            "local-runtimes.json",
            "packs.json",
            "labs.json",
            "robots.json",
        ):
            (directory / name).write_bytes((ROOT / "directory" / name).read_bytes())
        self.queue = queue

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_draft_preserves_imported_metadata_but_invents_no_conclusions(self) -> None:
        draft = build_draft(self.candidate, self.queue)

        self.assertEqual(self.candidate["id"], draft["id"])
        self.assertEqual(self.candidate["source_metadata"], draft["source_metadata"])
        self.assertEqual("", draft["developer"])
        self.assertEqual([], draft["distribution_modes"])
        self.assertEqual("review_required", draft["license_review_status"])
        self.assertIsNone(draft["score"]["overall"])
        self.assertIn(self.queue["source"]["commit"], draft["evidence"][0]["url"])

    def test_incomplete_draft_fails_without_writing_catalog_files(self) -> None:
        models_path = self.root / "directory" / "models.json"
        candidates_path = self.root / "directory" / "model-candidates.json"
        original_models = models_path.read_bytes()
        original_candidates = candidates_path.read_bytes()

        with self.assertRaisesRegex(PromotionError, "not ready for promotion"):
            preflight_promotion(self.root, build_draft(self.candidate, self.queue))

        self.assertEqual(original_models, models_path.read_bytes())
        self.assertEqual(original_candidates, candidates_path.read_bytes())

    def test_complete_review_passes_without_writing(self) -> None:
        models_path = self.root / "directory" / "models.json"
        candidates_path = self.root / "directory" / "model-candidates.json"
        original_models = models_path.read_bytes()
        original_candidates = candidates_path.read_bytes()

        proposed_models, proposed_candidates = preflight_promotion(
            self.root, self.record
        )

        self.assertIn(self.record, proposed_models["models"])
        self.assertEqual([], proposed_candidates["candidates"])
        self.assertEqual(original_models, models_path.read_bytes())
        self.assertEqual(original_candidates, candidates_path.read_bytes())

    def test_apply_adds_reviewed_record_and_removes_only_its_candidate(self) -> None:
        models_path = self.root / "directory" / "models.json"
        candidates_path = self.root / "directory" / "model-candidates.json"
        remaining, model_id = apply_promotion(self.root, self.record)
        models = json.loads(models_path.read_text())
        candidates = json.loads(candidates_path.read_text())

        self.assertEqual(0, remaining)
        self.assertEqual(self.record["id"], model_id)
        self.assertEqual(
            1,
            sum(
                model["source_id"] == self.record["source_id"]
                for model in models["models"]
            ),
        )
        self.assertEqual([], candidates["candidates"])
        self.assertEqual(self.queue["updated_at"], candidates["updated_at"])
        self.assertEqual(0o644, stat.S_IMODE(models_path.stat().st_mode))
        self.assertEqual(0o644, stat.S_IMODE(candidates_path.stat().st_mode))

    def test_dispositioned_candidate_is_rejected_until_lifted(self) -> None:
        write_json(
            self.root / "directory" / "model-dispositions.json",
            {
                "version": "1.0",
                "updated_at": "2026-09-04",
                "dispositions": [
                    {
                        "source_id": self.record["source_id"],
                        "disposition": "held",
                        "reason": "Awaiting first-party documentation.",
                        "decided_at": "2026-09-04",
                    }
                ],
            },
        )

        with self.assertRaisesRegex(PromotionError, "lift the disposition"):
            preflight_promotion(self.root, self.record)

    def test_changed_imported_metadata_is_rejected(self) -> None:
        record = deepcopy(self.record)
        record["source_metadata"]["limits"]["context"] += 1

        with self.assertRaisesRegex(
            PromotionError, "preserve candidate source_metadata"
        ):
            preflight_promotion(self.root, record)

    def test_candidate_metadata_must_match_complete_source_snapshot(self) -> None:
        path = self.root / "directory" / "models-dev.json"
        source_models = json.loads(path.read_text())
        source_models["models"][0]["source_metadata"]["limits"]["context"] += 1
        write_json(path, source_models)

        with self.assertRaisesRegex(
            PromotionError, "complete models.dev source snapshot"
        ):
            preflight_promotion(self.root, self.record)

    def test_missing_authoritative_model_evidence_is_rejected(self) -> None:
        record = deepcopy(self.record)
        record["evidence"] = [
            item for item in record["evidence"] if item["url"] != record["url"]
        ]

        with self.assertRaisesRegex(PromotionError, "authoritative model URL"):
            preflight_promotion(self.root, record)

    def test_wrong_pinned_models_dev_evidence_is_rejected(self) -> None:
        record = deepcopy(self.record)
        for evidence in record["evidence"]:
            if "github.com/anomalyco/models.dev/blob/" in evidence["url"]:
                evidence["url"] = evidence["url"].replace(
                    self.queue["source"]["commit"],
                    "0" * 40,
                )

        with self.assertRaisesRegex(
            PromotionError, "exact pinned models.dev source URL"
        ):
            preflight_promotion(self.root, record)

    def test_unverified_license_or_incorrect_score_is_rejected(self) -> None:
        unverified = deepcopy(self.record)
        unverified["license_review_status"] = "review_required"
        with self.assertRaisesRegex(PromotionError, "must be verified"):
            preflight_promotion(self.root, unverified)

        wrong_score = deepcopy(self.record)
        wrong_score["score"]["overall"] = 0
        with self.assertRaisesRegex(
            PromotionError, "overall 0 does not match weighted"
        ):
            preflight_promotion(self.root, wrong_score)

    def test_review_dates_cannot_predate_source_or_each_other(self) -> None:
        record = deepcopy(self.record)
        record["metadata_verified_at"] = "2026-09-03"
        with self.assertRaisesRegex(
            PromotionError, "predates the imported candidate snapshot"
        ):
            preflight_promotion(self.root, record)

        record = deepcopy(self.record)
        record["verified_at"] = "2026-09-03"
        with self.assertRaisesRegex(PromotionError, "predates metadata_verified_at"):
            preflight_promotion(self.root, record)

        record = deepcopy(self.record)
        record["metadata_verified_at"] = "9999-12-31"
        record["verified_at"] = "9999-12-31"
        with self.assertRaisesRegex(PromotionError, "cannot be in the future"):
            preflight_promotion(self.root, record)

    def test_cross_collection_id_collision_is_rejected(self) -> None:
        path = self.root / "directory" / "specifications.json"
        specifications = json.loads(path.read_text())
        specifications["specifications"].append({"id": self.record["id"]})
        write_json(path, specifications)

        with self.assertRaisesRegex(
            PromotionError, "appears in more than one collection"
        ):
            preflight_promotion(self.root, self.record)

    def test_draft_creation_refuses_to_overwrite_work(self) -> None:
        path = self.root / "review.json"
        path.write_text("keep me", encoding="utf-8")

        with self.assertRaisesRegex(PromotionError, "refusing to overwrite"):
            write_draft(path, build_draft(self.candidate, self.queue))

        self.assertEqual("keep me", path.read_text(encoding="utf-8"))

    def test_empty_source_metadata_matches_the_schema(self) -> None:
        self.assertEqual(MODEL_SOURCE_METADATA_REQUIRED, set(EMPTY_SOURCE_METADATA))
        self.assertEqual(MODEL_CAPABILITIES, set(EMPTY_SOURCE_METADATA["capabilities"]))
        self.assertEqual(MODEL_LIMITS, set(EMPTY_SOURCE_METADATA["limits"]))

    def test_gap_draft_returns_a_deep_copy_of_the_empty_template(self) -> None:
        first = build_gap_draft(self.root, "acme/unlisted")
        first["source_metadata"]["modalities"]["output"].append("text")
        first["source_metadata"]["links"].append({"label": "x", "url": "https://x"})

        second = build_gap_draft(self.root, "acme/other-unlisted")

        self.assertEqual([], second["source_metadata"]["modalities"]["output"])
        self.assertEqual([], second["source_metadata"]["links"])
        self.assertEqual([], EMPTY_SOURCE_METADATA["modalities"]["output"])
        self.assertEqual([], EMPTY_SOURCE_METADATA["links"])

    def gap_record(self) -> dict:
        """The fixture record rewritten as a complete null-source review."""
        record = deepcopy(self.record)
        record["source_id"] = None
        record["id"] = "model-acme-unlisted"
        record["evidence"] = [
            item
            for item in record["evidence"]
            if "github.com/anomalyco/models.dev/blob/" not in item["url"]
        ]
        return record

    def test_gap_draft_has_null_source_and_empty_metadata(self) -> None:
        draft = build_gap_draft(self.root, "acme/unlisted")

        self.assertEqual("model-acme-unlisted", draft["id"])
        self.assertIsNone(draft["source_id"])
        self.assertEqual([], draft["source_metadata"]["modalities"]["output"])
        self.assertEqual([], draft["evidence"])
        self.assertEqual("review_required", draft["license_review_status"])

    def test_gap_draft_refuses_ids_models_dev_already_lists(self) -> None:
        with self.assertRaisesRegex(
            PromotionError, "already in the models.dev snapshot"
        ):
            build_gap_draft(self.root, self.candidate["source_id"])

    def test_gap_draft_refuses_an_id_models_dev_would_now_derive(self) -> None:
        """A different source_id can still collide on the derived stable slug id."""
        path = self.root / "directory" / "models-dev.json"
        source_models = json.loads(path.read_text())
        source_models["models"].append(
            {
                "id": "model-acme-unlisted",
                "source_id": "acme/other-id",
                "source_metadata": {},
            }
        )
        write_json(path, source_models)

        with self.assertRaisesRegex(
            PromotionError,
            r"models\.dev already lists acme/other-id.*use the queue",
        ):
            build_gap_draft(self.root, "acme/unlisted")

    def test_gap_draft_refuses_dispositioned_ids(self) -> None:
        write_json(
            self.root / "directory" / "model-dispositions.json",
            {
                "dispositions": [
                    {
                        "source_id": "acme/unlisted",
                        "disposition": "held",
                        "reason": "x",
                        "decided_at": "2026-09-20",
                    }
                ]
            },
        )
        with self.assertRaisesRegex(PromotionError, "dispositioned"):
            build_gap_draft(self.root, "acme/unlisted")

    def test_gap_draft_refuses_an_id_that_is_already_published(self) -> None:
        models = json.loads((self.root / "directory" / "models.json").read_text())
        taken = models["models"][0]["source_id"]
        source = {"models": []}
        write_json(self.root / "directory" / "models-dev.json", source)
        with self.assertRaisesRegex(PromotionError, "already published"):
            build_gap_draft(self.root, taken)

    def test_complete_gap_review_passes_and_apply_leaves_the_queue_alone(self) -> None:
        queue_path = self.root / "directory" / "model-candidates.json"
        before = queue_path.read_bytes()

        preflight_promotion(self.root, self.gap_record())
        remaining, model_id = apply_promotion(self.root, self.gap_record())

        self.assertEqual("model-acme-unlisted", model_id)
        self.assertEqual(1, remaining)
        self.assertEqual(before, queue_path.read_bytes())
        models = json.loads((self.root / "directory" / "models.json").read_text())
        added = [m for m in models["models"] if m["id"] == "model-acme-unlisted"]
        self.assertEqual([None], [m["source_id"] for m in added])

    def test_gap_review_still_needs_the_authoritative_model_url(self) -> None:
        record = self.gap_record()
        record["evidence"] = [
            e for e in record["evidence"] if e["url"] != record["url"]
        ]
        with self.assertRaisesRegex(PromotionError, "authoritative model URL"):
            preflight_promotion(self.root, record)

    def test_gap_review_is_refused_once_models_dev_lists_the_id(self) -> None:
        record = self.gap_record()
        record["id"] = self.candidate["id"]
        with self.assertRaisesRegex(PromotionError, "use the queue"):
            preflight_promotion(self.root, record)

    def test_missing_source_id_key_is_still_rejected(self) -> None:
        record = deepcopy(self.record)
        del record["source_id"]
        with self.assertRaisesRegex(PromotionError, "requires a models.dev source_id"):
            preflight_promotion(self.root, record)

    def install_null_source_twin(self, *, model_id: str | None = None) -> dict:
        record = deepcopy(self.record)
        record["source_id"] = None
        record["id"] = model_id or self.candidate["id"]
        record["source_metadata"]["limits"]["context"] = 123
        record["evidence"] = [
            e
            for e in record["evidence"]
            if "github.com/anomalyco/models.dev/blob/" not in e["url"]
        ]
        path = self.root / "directory" / "models.json"
        models = json.loads(path.read_text())
        models["models"].append(record)
        write_json(path, models)
        return record

    def test_metadata_diff_names_each_differing_leaf(self) -> None:
        self.assertEqual(
            ["limits.context: 123 -> 456", "name: 'A' -> 'B'"],
            metadata_diff(
                {"name": "A", "limits": {"context": 123}, "family": "f"},
                {"name": "B", "limits": {"context": 456}, "family": "f"},
            ),
        )

    def test_link_adopts_upstream_metadata_and_removes_the_candidate(self) -> None:
        twin = self.install_null_source_twin()

        diff = apply_link(
            self.root, twin["id"], self.candidate["source_id"], "2026-09-20"
        )

        self.assertTrue(
            any(line.startswith("limits.context: 123 -> ") for line in diff)
        )
        models = json.loads((self.root / "directory" / "models.json").read_text())
        linked = next(m for m in models["models"] if m["id"] == twin["id"])
        self.assertEqual(self.candidate["source_id"], linked["source_id"])
        self.assertEqual(self.candidate["source_metadata"], linked["source_metadata"])
        self.assertEqual("2026-09-20", linked["metadata_verified_at"])
        self.assertEqual(twin["verified_at"], linked["verified_at"])
        self.assertEqual(twin["score"], linked["score"])
        self.assertTrue(
            any(
                e["url"].endswith(f"/models/{self.candidate['source_id']}.toml")
                and e["label"] == "Pinned models.dev source metadata"
                and e["verified_at"] == "2026-09-20"
                for e in linked["evidence"]
            )
        )
        queue = json.loads(
            (self.root / "directory" / "model-candidates.json").read_text()
        )
        self.assertEqual([], queue["candidates"])

    def test_link_replaces_a_stale_pinned_models_dev_entry_left_by_a_repair(
        self,
    ) -> None:
        """The documented wrong-guess repair (unlink to null, link to the matching
        row, exclude the other) must leave exactly one pinned models.dev entry, the
        current one -- not the stale one from the excluded row plus the new one."""
        twin = self.install_null_source_twin()
        stale_url = f"{MODELS_DEV_REPO}/blob/{'0' * 40}/models/acme/wrong-guess.toml"
        path = self.root / "directory" / "models.json"
        models = json.loads(path.read_text())
        record = next(m for m in models["models"] if m["id"] == twin["id"])
        record["evidence"].append(
            {
                "kind": "web",
                "label": "Pinned models.dev source metadata",
                "url": stale_url,
                "verified_at": "2026-09-10",
            }
        )
        write_json(path, models)

        apply_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        updated = json.loads(path.read_text())
        linked = next(m for m in updated["models"] if m["id"] == twin["id"])
        pinned_entries = [
            e
            for e in linked["evidence"]
            if e["label"] == "Pinned models.dev source metadata"
        ]
        self.assertEqual(1, len(pinned_entries))
        self.assertTrue(
            pinned_entries[0]["url"].endswith(
                f"/models/{self.candidate['source_id']}.toml"
            )
        )
        self.assertNotEqual(stale_url, pinned_entries[0]["url"])

    def test_link_keeps_a_frozen_id_when_upstream_used_another_name(self) -> None:
        twin = self.install_null_source_twin(model_id="model-acme-guessed-name")

        apply_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        models = json.loads((self.root / "directory" / "models.json").read_text())
        ids = {m["id"]: m["source_id"] for m in models["models"]}
        self.assertEqual(self.candidate["source_id"], ids["model-acme-guessed-name"])

    def test_preflight_link_writes_nothing(self) -> None:
        twin = self.install_null_source_twin()
        before = {
            name: (self.root / "directory" / name).read_bytes()
            for name in ("models.json", "model-candidates.json")
        }

        preflight_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        for name, payload in before.items():
            self.assertEqual(payload, (self.root / "directory" / name).read_bytes())

    def test_link_refuses_a_record_that_is_already_linked(self) -> None:
        models = json.loads((self.root / "directory" / "models.json").read_text())
        linked_id = models["models"][0]["id"]
        with self.assertRaisesRegex(PromotionError, "already linked"):
            preflight_link(
                self.root, linked_id, self.candidate["source_id"], "2026-09-20"
            )

    def test_link_refuses_a_source_id_that_is_not_queued(self) -> None:
        twin = self.install_null_source_twin()
        with self.assertRaisesRegex(PromotionError, "model candidate not found"):
            preflight_link(self.root, twin["id"], "acme/ghost", "2026-09-20")

    def test_link_refuses_a_stale_or_future_metadata_date(self) -> None:
        twin = self.install_null_source_twin()
        for bad in ("2026-09-03", "2999-01-01", "yesterday"):
            with self.subTest(bad=bad), self.assertRaises(PromotionError):
                preflight_link(self.root, twin["id"], self.candidate["source_id"], bad)


if __name__ == "__main__":
    unittest.main()
