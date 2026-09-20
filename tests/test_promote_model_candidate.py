from __future__ import annotations

import json
import stat
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from scripts.promote_model_candidate import (
    EMPTY_SOURCE_METADATA,
    PromotionError,
    apply_promotion,
    build_draft,
    build_gap_draft,
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
        self.record = deepcopy(models["models"].pop(0))
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
        queue["eligible_record_count"] = len(models["models"]) + 1
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


if __name__ == "__main__":
    unittest.main()
