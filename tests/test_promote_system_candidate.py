from __future__ import annotations

import json
import stat
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest import mock

from scripts import promote_system_candidate
from scripts.promote_system_candidate import (
    PromotionError,
    apply_promotion,
    build_draft,
    preflight_promotion,
    write_draft,
)

ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


class PromoteSystemCandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        directory = self.root / "directory"
        directory.mkdir()

        taxonomy = json.loads((ROOT / "directory" / "taxonomy.json").read_text())
        projects = json.loads((ROOT / "directory" / "projects.json").read_text())
        license_evidence = json.loads((ROOT / "directory" / "license-evidence.json").read_text())
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text())
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text())

        project_index = next(i for i, p in enumerate(projects["projects"]) if p["id"] == "aider")
        self.project_record = deepcopy(projects["projects"].pop(project_index))
        evidence_index = next(
            i for i, e in enumerate(license_evidence["entries"]) if e["project_id"] == "aider"
        )
        self.license_entry = deepcopy(license_evidence["entries"].pop(evidence_index))
        pinned_license = self.license_entry["items"][0]

        self.candidate = {
            "repo": self.project_record["repo"],
            "name": self.project_record["name"],
            "url": self.project_record["url"],
            "description": "A terminal AI coding tool.",
            "proposed_system_family": "assistant_system",
            "proposed_primary_role": "general_assistant",
            "classification_confidence": 0.4,
            "github_detected_license": self.project_record["github_detected_license"],
            "stars": self.project_record["stars"],
            "topics": ["ai", "cli"],
            "status": "provisional",
            "discovered_at": "2026-09-04",
            "review_required": ["licensing", "classification", "traits", "editorial_score"],
            "triage": {
                "verdict": "review_ready",
                "rule": "Review rule text.",
                "finding": "The README documents a terminal tool with broad model support.",
                "evidence": [
                    {
                        "label": "LICENSE",
                        "url": pinned_license["url"],
                        "kind": "git_blob",
                        "content_sha256": "a" * 64,
                        "fetched_at": "2026-09-04",
                        "blob_sha": pinned_license["blob_sha"],
                        "immutable_url": pinned_license["immutable_url"],
                    },
                ],
                "proposed_at": "2026-09-04",
                "proposer": "candidate-triage",
            },
        }
        candidates["updated_at"] = "2026-09-04"
        candidates["candidates"] = [deepcopy(self.candidate)]

        write_json(directory / "taxonomy.json", taxonomy)
        write_json(directory / "projects.json", projects)
        write_json(directory / "license-evidence.json", license_evidence)
        write_json(directory / "candidates.json", candidates)
        write_json(directory / "exclusions.json", exclusions)
        for name in ("specifications.json", "inference-services.json", "local-runtimes.json", "models.json", "packs.json"):
            (directory / name).write_bytes((ROOT / "directory" / name).read_bytes())

        self.queue = candidates
        self.pinned_license = pinned_license
        self.draft = deepcopy(self.project_record)
        self.draft["license_evidence_items"] = deepcopy(self.license_entry["items"])

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_candidate_triage(self, triage: dict) -> None:
        path = self.root / "directory" / "candidates.json"
        doc = json.loads(path.read_text())
        doc["candidates"][0]["triage"] = triage
        write_json(path, doc)

    # -- init -----------------------------------------------------------

    def test_draft_prefills_identity_and_evidence_but_invents_no_classification(self) -> None:
        draft = build_draft(self.candidate)

        self.assertEqual(self.project_record["repo"], draft["repo"])
        self.assertEqual(self.project_record["name"], draft["name"])
        self.assertEqual(self.project_record["url"], draft["url"])
        self.assertEqual(self.project_record["github_detected_license"], draft["github_detected_license"])
        self.assertEqual(self.project_record["stars"], draft["stars"])

        # The proposed classification must never be copied into the draft.
        self.assertEqual("", draft["system_family"])
        self.assertEqual("", draft["primary_role"])
        self.assertNotEqual(self.candidate["proposed_system_family"], draft["system_family"])
        self.assertNotEqual(self.candidate["proposed_primary_role"], draft["primary_role"])

        for field in (
            "score_profile", "description", "canonical_data", "source_model",
            "license_review_status", "status", "provenance", "research_confidence",
            "verified_at", "stars_verified_at", "id",
        ):
            self.assertEqual("", draft[field])
        self.assertIsNone(draft["score"])
        self.assertEqual([], draft["licenses"])
        self.assertEqual([], draft["strengths"])

        item = draft["license_evidence_items"][0]
        self.assertEqual(self.pinned_license["blob_sha"], item["blob_sha"])
        self.assertEqual(self.pinned_license["immutable_url"], item["immutable_url"])
        self.assertEqual(self.pinned_license["url"], item["url"])
        self.assertEqual(self.pinned_license["path"], item["path"])
        self.assertEqual("git_blob", item["kind"])
        self.assertIsNone(item["license_id"])
        self.assertIsNone(item["scope"])

    def test_draft_creation_refuses_to_overwrite_work(self) -> None:
        path = self.root / "review.json"
        path.write_text("keep me", encoding="utf-8")

        with self.assertRaisesRegex(PromotionError, "refusing to overwrite"):
            write_draft(path, build_draft(self.candidate))

        self.assertEqual("keep me", path.read_text(encoding="utf-8"))

    # -- check / apply ----------------------------------------------------

    def test_incomplete_draft_fails_without_writing_catalog_files(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        evidence_path = self.root / "directory" / "license-evidence.json"
        candidates_path = self.root / "directory" / "candidates.json"
        original_projects = projects_path.read_bytes()
        original_evidence = evidence_path.read_bytes()
        original_candidates = candidates_path.read_bytes()

        with self.assertRaisesRegex(PromotionError, "not ready for promotion"):
            preflight_promotion(self.root, build_draft(self.candidate))

        self.assertEqual(original_projects, projects_path.read_bytes())
        self.assertEqual(original_evidence, evidence_path.read_bytes())
        self.assertEqual(original_candidates, candidates_path.read_bytes())

    def test_complete_review_passes_without_writing(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        evidence_path = self.root / "directory" / "license-evidence.json"
        candidates_path = self.root / "directory" / "candidates.json"
        original_projects = projects_path.read_bytes()
        original_evidence = evidence_path.read_bytes()
        original_candidates = candidates_path.read_bytes()

        proposed_projects, proposed_evidence, proposed_candidates = preflight_promotion(
            self.root, self.draft,
        )

        self.assertIn(self.project_record, proposed_projects["projects"])
        self.assertEqual([], proposed_candidates["candidates"])
        added_evidence = [
            item for item in proposed_evidence["entries"] if item["project_id"] == "aider"
        ]
        self.assertEqual(1, len(added_evidence))
        self.assertEqual(self.license_entry["items"], added_evidence[0]["items"])
        self.assertEqual(original_projects, projects_path.read_bytes())
        self.assertEqual(original_evidence, evidence_path.read_bytes())
        self.assertEqual(original_candidates, candidates_path.read_bytes())

    def test_apply_adds_one_project_and_evidence_entry_and_removes_one_candidate(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        evidence_path = self.root / "directory" / "license-evidence.json"
        candidates_path = self.root / "directory" / "candidates.json"

        remaining, project_id = apply_promotion(self.root, self.draft)

        projects = json.loads(projects_path.read_text())
        evidence = json.loads(evidence_path.read_text())
        candidates = json.loads(candidates_path.read_text())

        self.assertEqual(0, remaining)
        self.assertEqual("aider", project_id)
        self.assertEqual(1, sum(project["id"] == "aider" for project in projects["projects"]))
        self.assertEqual(1, sum(item["project_id"] == "aider" for item in evidence["entries"]))
        self.assertEqual([], candidates["candidates"])
        self.assertEqual(self.queue["updated_at"], candidates["updated_at"])
        self.assertEqual(0o644, stat.S_IMODE(projects_path.stat().st_mode))
        self.assertEqual(0o644, stat.S_IMODE(evidence_path.stat().st_mode))
        self.assertEqual(0o644, stat.S_IMODE(candidates_path.stat().st_mode))

    def test_missing_candidate_is_rejected(self) -> None:
        draft = deepcopy(self.draft)
        draft["repo"] = "no-such-org/no-such-repo"

        with self.assertRaisesRegex(PromotionError, "not found"):
            preflight_promotion(self.root, draft)

    def test_wrong_overall_is_rejected_with_correct_value(self) -> None:
        draft = deepcopy(self.draft)
        draft["score"]["overall"] = 0

        with self.assertRaisesRegex(PromotionError, r"does not match weighted 8\.36"):
            preflight_promotion(self.root, draft)

    def test_mismatched_score_profile_is_rejected(self) -> None:
        draft = deepcopy(self.draft)
        self.assertEqual("agent_system", draft["system_family"])
        draft["score_profile"] = "memory"

        with self.assertRaisesRegex(PromotionError, "does not match"):
            preflight_promotion(self.root, draft)

    def test_held_candidate_is_refused(self) -> None:
        self._write_candidate_triage({
            "verdict": "held",
            "held_by": "Backlog item #7",
            "rule": "r",
            "finding": "f",
            "evidence": [],
            "proposed_at": "2026-09-04",
            "proposer": "human",
        })

        with self.assertRaisesRegex(PromotionError, r"held \(Backlog item #7\)"):
            preflight_promotion(self.root, self.draft)

    def test_out_of_scope_candidate_is_refused(self) -> None:
        self._write_candidate_triage({
            "verdict": "out_of_scope",
            "rule": "r",
            "finding": "f",
            "evidence": [],
            "proposed_at": "2026-09-04",
            "proposer": "human",
        })

        with self.assertRaisesRegex(PromotionError, "out_of_scope"):
            preflight_promotion(self.root, self.draft)

    def test_duplicate_id_is_rejected(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        projects_doc = json.loads(projects_path.read_text())
        conflicting = deepcopy(self.project_record)
        conflicting["repo"] = "someone-else/aider-fork"
        conflicting["url"] = "https://github.com/someone-else/aider-fork"
        projects_doc["projects"].append(conflicting)
        write_json(projects_path, projects_doc)

        with self.assertRaisesRegex(PromotionError, "duplicate id"):
            preflight_promotion(self.root, self.draft)

    def test_duplicate_repo_is_rejected(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        projects_doc = json.loads(projects_path.read_text())
        conflicting = deepcopy(self.project_record)
        conflicting["id"] = "aider-conflict"
        projects_doc["projects"].append(conflicting)
        write_json(projects_path, projects_doc)

        with self.assertRaisesRegex(PromotionError, "duplicate repository"):
            preflight_promotion(self.root, self.draft)

    def test_excluded_repo_is_rejected(self) -> None:
        exclusions_path = self.root / "directory" / "exclusions.json"
        exclusions_doc = json.loads(exclusions_path.read_text())
        exclusions_doc["entries"].append({
            "name": "Aider",
            "reason": "Test exclusion.",
            "repo": self.draft["repo"],
            "useful_lesson": "Test lesson.",
        })
        write_json(exclusions_path, exclusions_doc)

        with self.assertRaisesRegex(PromotionError, "cannot be both included and excluded"):
            preflight_promotion(self.root, self.draft)

    def test_failed_write_rolls_back_every_file(self) -> None:
        projects_path = self.root / "directory" / "projects.json"
        evidence_path = self.root / "directory" / "license-evidence.json"
        candidates_path = self.root / "directory" / "candidates.json"
        original_projects = projects_path.read_bytes()
        original_evidence = evidence_path.read_bytes()
        original_candidates = candidates_path.read_bytes()

        real_write = promote_system_candidate._write_json_atomic

        def flaky_write(path: Path, value: dict) -> None:
            if path.name == "candidates.json":
                raise OSError("simulated disk failure")
            real_write(path, value)

        with mock.patch.object(
            promote_system_candidate, "_write_json_atomic", side_effect=flaky_write,
        ), self.assertRaises(OSError):
            apply_promotion(self.root, self.draft)

        self.assertEqual(original_projects, projects_path.read_bytes())
        self.assertEqual(original_evidence, evidence_path.read_bytes())
        self.assertEqual(original_candidates, candidates_path.read_bytes())


if __name__ == "__main__":
    unittest.main()
