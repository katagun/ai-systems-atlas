from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.validate_directory import validate

ROOT = Path(__file__).resolve().parents[1]


class ValidationPolicyTests(unittest.TestCase):
    def temporary_catalog(self) -> tuple[tempfile.TemporaryDirectory, Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        shutil.copytree(ROOT / "directory", root / "directory")
        shutil.copytree(ROOT / "web", root / "web")
        return temporary, root

    def write_json(self, path: Path, value: dict) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def test_restricted_license_is_valid_when_source_model_and_evidence_agree(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        evidence_path = root / "directory" / "license-evidence.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        project = projects["projects"][0]
        project["licenses"] = ["LicenseRef-Commercial"]
        project["source_model"] = "source_available"
        project_evidence = next(
            entry for entry in evidence["entries"] if entry["project_id"] == project["id"]
        )
        project_evidence["items"] = [{
            "license_id": "LicenseRef-Commercial",
            "scope": "operational product terms",
            "kind": "web_terms",
            "url": "https://example.com/terms",
            "verified_at": "2026-08-25",
        }]
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)
        self.write_json(evidence_path, evidence)
        self.write_json(root / "web" / "license-evidence.json", evidence)

        errors = validate(root)

        self.assertFalse(any(project["repo"] in error and "license" in error for error in errors), errors)

    def test_proprietary_non_github_system_is_valid_with_terms_evidence(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        evidence_path = root / "directory" / "license-evidence.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        project = projects["projects"][0]
        project.update({
            "repo": None,
            "url": "https://example.com/product",
            "licenses": ["LicenseRef-Proprietary"],
            "source_model": "proprietary",
            "stars": None,
            "stars_verified_at": None,
            "pushed_at": None,
            "forks": None,
            "open_issues": None,
            "metadata_verified_at": None,
            "github_detected_license": None,
        })
        project_evidence = next(
            entry for entry in evidence["entries"] if entry["project_id"] == project["id"]
        )
        project_evidence.update({
            "repo": None,
            "items": [{
                "license_id": "LicenseRef-Proprietary",
                "scope": "operational product",
                "kind": "web_terms",
                "url": "https://example.com/terms",
                "verified_at": "2026-08-25",
            }],
        })
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)
        self.write_json(evidence_path, evidence)
        self.write_json(root / "web" / "license-evidence.json", evidence)

        errors = validate(root)

        self.assertFalse(any(project["id"] in error for error in errors), errors)

    def test_license_evidence_must_cover_every_project_license(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        evidence_path = root / "directory" / "license-evidence.json"
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        project_id = json.loads(
            (root / "directory" / "projects.json").read_text(encoding="utf-8")
        )["projects"][0]["id"]
        next(entry for entry in evidence["entries"] if entry["project_id"] == project_id)["items"] = []
        self.write_json(evidence_path, evidence)
        self.write_json(root / "web" / "license-evidence.json", evidence)

        errors = validate(root)

        self.assertTrue(any("evidence licenses do not match project licenses" in error for error in errors), errors)

    def test_source_model_must_match_license_kinds(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["source_model"] = "proprietary"
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("source model and license kinds are inconsistent" in error for error in errors), errors)

    def test_unknown_retrieval_mode_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["retrieval_modes"].append("magic_lookup")
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("unknown retrieval_modes" in error for error in errors), errors)

    def test_unknown_provider_relationship_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["provider_relationship"] = "mostly_anthropic"
        projects["projects"][0]["model_backends"] = ["anthropic"]
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("unknown provider relationship" in error for error in errors), errors)

    def test_provider_traits_must_be_reviewed_together(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["provider_relationship"] = "provider_native"
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("provider traits must be supplied together" in error for error in errors), errors)

    def test_provider_native_requires_one_backend(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["provider_relationship"] = "provider_native"
        projects["projects"][0]["model_backends"] = ["anthropic", "openai"]
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("provider_native requires exactly one model backend" in error for error in errors), errors)

    def test_every_family_requires_exactly_one_score_profile(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        taxonomy_path = root / "directory" / "taxonomy.json"
        taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
        duplicate = dict(next(item for item in taxonomy["score_profiles"] if item["family"] == "assistant_system"))
        duplicate["id"] = "assistant_duplicate"
        taxonomy["score_profiles"].append(duplicate)
        self.write_json(taxonomy_path, taxonomy)
        self.write_json(root / "web" / "taxonomy.json", taxonomy)

        errors = validate(root)

        self.assertTrue(any("requires exactly one score profile" in error for error in errors), errors)

    def test_secondary_roles_cannot_cross_family_boundaries(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        projects["projects"][0]["secondary_roles"] = ["general_ai_assistant"]
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)

        errors = validate(root)

        self.assertTrue(any("secondary roles must belong" in error for error in errors), errors)

    def test_discovery_sources_require_https_and_lowercase_hosts(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        sources_path = root / "directory" / "discovery-sources.json"
        sources = json.loads(sources_path.read_text(encoding="utf-8"))
        sources["sources"][0]["feed_url"] = "http://example.com/feed.xml"
        sources["sources"][0]["item_hosts"] = ["Example.COM"]
        self.write_json(sources_path, sources)

        errors = validate(root)

        self.assertTrue(any("feed_url must be an HTTPS URL" in error for error in errors), errors)
        self.assertTrue(any("item_hosts must be a non-empty unique list" in error for error in errors), errors)

    def test_discovery_sources_require_public_coherent_hosts(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        sources_path = root / "directory" / "discovery-sources.json"
        sources = json.loads(sources_path.read_text(encoding="utf-8"))
        sources["sources"][0]["item_hosts"] = ["localhost"]
        self.write_json(sources_path, sources)

        errors = validate(root)

        self.assertTrue(any("lowercase public DNS hosts" in error for error in errors), errors)

        sources["sources"][0]["item_hosts"] = ["example.com"]
        self.write_json(sources_path, sources)
        errors = validate(root)

        self.assertTrue(any("host must appear in item_hosts" in error for error in errors), errors)

    def test_candidate_url_identity_normalizes_slashes_and_tracking_parameters(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        candidates_path = root / "directory" / "candidates.json"
        candidates = json.loads(candidates_path.read_text(encoding="utf-8"))
        original = next(item for item in candidates["candidates"] if item["repo"] is None)
        duplicate = dict(original)
        duplicate["url"] = original["url"].rstrip("/") + "/?utm_source=test"
        candidates["candidates"].append(duplicate)
        self.write_json(candidates_path, candidates)

        errors = validate(root)

        self.assertTrue(any("duplicate candidate identity" in error for error in errors), errors)

    def test_unknown_specification_type_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "specifications.json"
        specifications = json.loads(path.read_text(encoding="utf-8"))
        specifications["specifications"][0]["specification_type"] = "marketing_label"
        self.write_json(path, specifications)
        self.write_json(root / "web" / "specifications.json", specifications)

        errors = validate(root)

        self.assertTrue(any("unknown specification type" in error for error in errors), errors)

    def test_specification_score_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "specifications.json"
        specifications = json.loads(path.read_text(encoding="utf-8"))
        specifications["specifications"][0]["score"] = {"overall": 10}
        self.write_json(path, specifications)
        self.write_json(root / "web" / "specifications.json", specifications)

        errors = validate(root)

        self.assertTrue(any("fields differ from schema" in error and "score" in error for error in errors), errors)

    def test_unknown_inference_service_type_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        services["services"][0]["service_type"] = "provider_company"
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)

        errors = validate(root)

        self.assertTrue(any("unknown inference service type" in error for error in errors), errors)

    def test_inference_service_score_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        services["services"][0]["score"] = {"overall": 10}
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)

        errors = validate(root)

        self.assertTrue(any("fields differ from schema" in error and "score" in error for error in errors), errors)

    def test_inference_service_requires_dated_terms_and_evidence(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        services["services"][0]["terms"]["verified_at"] = None
        services["services"][0]["evidence"] = []
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)

        errors = validate(root)

        self.assertTrue(any("terms require verified_at" in error for error in errors), errors)
        self.assertTrue(any("evidence must be a non-empty list" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
