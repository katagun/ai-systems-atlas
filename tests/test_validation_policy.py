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


if __name__ == "__main__":
    unittest.main()
