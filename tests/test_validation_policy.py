from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar

from scripts.validate_directory import CATALOG_DOCUMENTS, PUBLISHED_DATA, validate

ROOT = Path(__file__).resolve().parents[1]


class ValidationPolicyTests(unittest.TestCase):
    # validate() reads exactly these files. Copying the whole tree instead meant
    # 295 files and 271 directories per test, almost all of them share pages the
    # validator never opens, for a suite that mutates one JSON document at a time.
    _catalog: ClassVar[dict[str, bytes]] = {}

    @classmethod
    def setUpClass(cls) -> None:
        cls._catalog = {
            f"directory/{name}": (ROOT / "directory" / name).read_bytes()
            for name in CATALOG_DOCUMENTS
        }
        cls._catalog.update({
            f"web/{name}": (ROOT / "web" / name).read_bytes() for name in PUBLISHED_DATA
        })

    def temporary_catalog(self) -> tuple[tempfile.TemporaryDirectory, Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        (root / "directory").mkdir()
        (root / "web").mkdir()
        for relative, payload in self._catalog.items():
            (root / relative).write_bytes(payload)
        return temporary, root

    def write_json(self, path: Path, value: dict) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    SAMPLE_RUNTIME: ClassVar[dict] = {
        "id": "sample-runtime",
        "name": "Sample Runtime",
        "maintainer": "Sample Maintainer",
        "runtime_type": "server_engine",
        "repo": "sample/runtime",
        "url": "https://example.com/docs",
        "description": "A synthetic runtime used to exercise local-runtime validation.",
        "runtime_boundary": "Represents the runtime, not any managed service built on it.",
        "accelerators": ["cpu", "cuda"],
        "model_formats": ["safetensors"],
        "serving_modes": ["continuous_batching"],
        "api_styles": ["openai_compatible"],
        "deployment_surfaces": ["container"],
        "model_management": "Models are loaded from a configured local path.",
        "hardware_requirements": "Documented accelerator memory guidance only.",
        "operational_controls": "Configuration flags govern concurrency and resource limits.",
        "strengths": ["Documented batching behaviour."],
        "tradeoffs": ["No graphical interface."],
        "licenses": ["Apache-2.0"],
        "source_model": "open_source",
        "license_note": "Repository-wide Apache-2.0 license.",
        "license_evidence": [{
            "license_id": "Apache-2.0",
            "scope": "Repository-wide license file",
            "kind": "git_blob",
            "path": "LICENSE",
            "url": "https://github.com/sample/runtime/blob/main/LICENSE",
            "blob_sha": "0123456789abcdef0123456789abcdef01234567",
            "immutable_url": (
                "https://api.github.com/repos/sample/runtime/git/blobs/"
                "0123456789abcdef0123456789abcdef01234567"
            ),
        }],
        "score_profile": "local_runtime",
        "score": {
            "hardware_accelerator_coverage": 5.0,
            "model_format_support": 5.0,
            "serving_concurrency": 5.0,
            "api_interoperability": 5.0,
            "deployment_operations": 5.0,
            "model_lifecycle_management": 5.0,
            "observability_control": 5.0,
            "documentation_transparency": 5.0,
            "overall": 5.0,
        },
        "evidence": [{
            "kind": "web",
            "label": "Documentation",
            "url": "https://example.com/docs",
            "verified_at": "2026-08-29",
        }],
        "verified_at": "2026-08-29",
    }

    def catalog_with_runtime(self, mutate=None) -> list[str]:
        """Validate a temporary catalog holding one synthetic local runtime."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        runtimes_path = root / "directory" / "local-runtimes.json"
        document = json.loads(runtimes_path.read_text(encoding="utf-8"))
        runtime = json.loads(json.dumps(self.SAMPLE_RUNTIME))
        document["runtimes"] = [runtime]
        if mutate is not None:
            mutate(runtime, root)
        self.write_json(runtimes_path, document)
        self.write_json(root / "web" / "local-runtimes.json", document)
        return validate(root)

    def test_valid_local_runtime_passes_validation(self) -> None:
        errors = self.catalog_with_runtime()
        self.assertFalse([error for error in errors if "sample-runtime" in error], errors)

    def test_local_runtime_overall_must_match_weighted_score(self) -> None:
        def mutate(runtime, root):
            runtime["score"]["overall"] = 9.99

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(any("does not match weighted" in error for error in errors), errors)

    def test_local_runtime_rejects_unknown_accelerator(self) -> None:
        def mutate(runtime, root):
            runtime["accelerators"] = ["quantum"]

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(any("unknown accelerators" in error for error in errors), errors)

    def test_local_runtime_license_evidence_must_cover_every_license(self) -> None:
        def mutate(runtime, root):
            runtime["licenses"] = ["Apache-2.0", "MIT"]

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(
            any("license evidence does not match licenses" in error for error in errors), errors
        )

    def test_local_runtime_rejects_mismatched_immutable_license_url(self) -> None:
        def mutate(runtime, root):
            runtime["license_evidence"][0]["immutable_url"] = (
                "https://api.github.com/repos/sample/runtime/git/blobs/"
                "ffffffffffffffffffffffffffffffffffffffff"
            )

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(
            any("immutable license URL must address the blob SHA" in error for error in errors),
            errors,
        )

    def test_local_runtime_accepts_descriptive_star_metadata(self) -> None:
        def mutate(runtime, root):
            runtime["stars"] = 42
            runtime["stars_verified_at"] = "2026-08-30"

        errors = self.catalog_with_runtime(mutate)
        self.assertFalse([error for error in errors if "sample-runtime" in error], errors)

    def test_local_runtime_rejects_negative_stars(self) -> None:
        def mutate(runtime, root):
            runtime["stars"] = -1
            runtime["stars_verified_at"] = "2026-08-30"

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(any("stars must be a non-negative integer or null" in error for error in errors), errors)

    def test_local_runtime_populated_stars_require_stars_verified_at(self) -> None:
        def mutate(runtime, root):
            runtime["stars"] = 42

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(any("populated stars require stars_verified_at" in error for error in errors), errors)

    def test_local_runtime_still_rejects_unknown_fields(self) -> None:
        def mutate(runtime, root):
            runtime["throughput_tokens_per_second"] = 500

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(any("fields differ from schema" in error for error in errors), errors)

    def test_ids_must_be_unique_across_collections(self) -> None:
        def mutate(runtime, root):
            services_path = root / "directory" / "inference-services.json"
            services = json.loads(services_path.read_text(encoding="utf-8"))
            runtime["id"] = services["services"][0]["id"]

        errors = self.catalog_with_runtime(mutate)
        self.assertTrue(
            any("appears in more than one collection" in error for error in errors), errors
        )

    def test_local_runtimes_must_be_published_to_web(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = json.loads(
            (root / "directory" / "local-runtimes.json").read_text(encoding="utf-8")
        )
        document["verified_at"] = "2026-01-01"
        self.write_json(root / "directory" / "local-runtimes.json", document)

        errors = validate(root)

        self.assertTrue(
            any("web/local-runtimes.json is not synchronized" in error for error in errors), errors
        )

    def catalog_with_malformed_record(self, document: str, key: str, entry: object) -> list[str]:
        """Validate a temporary catalog whose collection holds a non-object entry."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / document
        value = json.loads(path.read_text(encoding="utf-8"))
        value[key].append(entry)
        self.write_json(path, value)
        self.write_json(root / "web" / document, value)
        return validate(root)

    def test_a_non_object_project_is_reported_rather_than_crashing_the_run(self) -> None:
        """A malformed entry must not deny the operator every other error in the catalog."""
        errors = self.catalog_with_malformed_record("projects.json", "projects", "not a project")
        self.assertTrue(any("every project must be an object" in error for error in errors), errors)

    def test_a_non_object_record_never_crashes_any_collection(self) -> None:
        for document, key, message in (
            ("projects.json", "projects", "every project must be an object"),
            ("specifications.json", "specifications", "every specification must be an object"),
            ("inference-services.json", "services", "every service must be an object"),
            ("local-runtimes.json", "runtimes", "every runtime must be an object"),
            ("models.json", "models", "every model must be an object"),
        ):
            with self.subTest(document=document):
                errors = self.catalog_with_malformed_record(document, key, ["not", "a", "record"])
                self.assertTrue(any(message in error for error in errors), errors)

    def test_model_candidates_must_not_be_published(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        (root / "web" / "model-candidates.json").write_text("{}\n", encoding="utf-8")

        errors = validate(root)

        self.assertTrue(any("provisional model candidates must not be published" in error for error in errors), errors)

    def catalog_with_superseded(self, mutate=None) -> list[str]:
        """Validate a temporary catalog whose first project is marked superseded."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        projects_path = root / "directory" / "projects.json"
        projects = json.loads(projects_path.read_text(encoding="utf-8"))
        project = projects["projects"][0]
        successor = next(item for item in projects["projects"] if item["id"] != project["id"])
        project["status"] = "superseded"
        project["superseded_by"] = successor["id"]
        if mutate is not None:
            mutate(project, projects)
        self.write_json(projects_path, projects)
        self.write_json(root / "web" / "projects.json", projects)
        return validate(root)

    def test_superseded_project_is_valid_with_a_resolvable_successor(self) -> None:
        errors = self.catalog_with_superseded()
        self.assertFalse([error for error in errors if "supersed" in error], errors)

    def test_superseded_project_requires_a_successor(self) -> None:
        errors = self.catalog_with_superseded(lambda project, _: project.pop("superseded_by"))
        self.assertTrue(any("requires superseded_by" in error for error in errors), errors)

    def test_superseded_by_must_reference_an_existing_project(self) -> None:
        errors = self.catalog_with_superseded(
            lambda project, _: project.update({"superseded_by": "no-such-project"})
        )
        self.assertTrue(any("unknown superseded_by" in error for error in errors), errors)

    def test_superseded_by_cannot_reference_itself(self) -> None:
        errors = self.catalog_with_superseded(
            lambda project, _: project.update({"superseded_by": project["id"]})
        )
        self.assertTrue(any("cannot supersede itself" in error for error in errors), errors)

    def test_active_project_cannot_declare_a_successor(self) -> None:
        errors = self.catalog_with_superseded(lambda project, _: project.update({"status": "active"}))
        self.assertTrue(
            any("superseded_by requires the superseded status" in error for error in errors), errors
        )

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

    def catalog_with_candidate(self, mutate=None) -> list[str]:
        """Validate a temporary catalog whose queue holds one synthetic candidate."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "candidates.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        candidate = {
            "repo": "sample/candidate",
            "name": "candidate",
            "url": "https://github.com/sample/candidate",
            "description": "A synthetic candidate used to exercise queue validation.",
            "proposed_system_family": "agent_system",
            "proposed_primary_role": "coding_agent",
            "classification_confidence": 0.8,
            "github_detected_license": "MIT",
            "stars": 100,
            "topics": ["agent"],
            "status": "provisional",
            "discovered_at": "2026-09-04",
            "review_required": ["licensing", "classification", "traits", "editorial_score"],
        }
        document["candidates"] = [candidate]
        if mutate is not None:
            mutate(candidate)
        self.write_json(path, document)
        return validate(root)

    def test_a_candidate_without_a_triage_block_is_valid(self) -> None:
        errors = self.catalog_with_candidate()
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_a_candidate_rejects_a_field_outside_the_schema(self) -> None:
        errors = self.catalog_with_candidate(lambda candidate: candidate.update({"surprise": 1}))
        self.assertTrue(any("fields do not match candidate schema" in error for error in errors), errors)

    TRIAGE: ClassVar[dict] = {
        "verdict": "review_ready",
        "rule": "CURATION.md § Inclusion gate — operational product is identifiable",
        "finding": "The README documents a tool-using loop over a local index.",
        "evidence": [{
            "label": "README",
            "url": "https://github.com/sample/candidate/blob/main/README.md",
            "kind": "web",
            "content_sha256": "a" * 64,
            "fetched_at": "2026-09-04",
        }],
        "proposed_at": "2026-09-04",
        "proposer": "candidate-triage",
    }

    def candidate_with_triage(self, mutate=None) -> list[str]:
        def apply(candidate):
            candidate["triage"] = json.loads(json.dumps(self.TRIAGE))
            if mutate is not None:
                mutate(candidate["triage"], candidate)
        return self.catalog_with_candidate(apply)

    def test_a_valid_triage_block_passes(self) -> None:
        errors = self.candidate_with_triage()
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_triage_rejects_an_unknown_verdict(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"verdict": "publish"}))
        self.assertTrue(any("unknown triage verdict" in error for error in errors), errors)

    def test_triage_rejects_a_field_outside_its_schema(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"score": 9}))
        self.assertTrue(any("triage fields differ from schema" in error for error in errors), errors)

    def test_held_by_is_required_for_a_held_verdict(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"verdict": "held"}))
        self.assertTrue(any("held_by is required" in error for error in errors), errors)

    def test_held_by_is_forbidden_on_any_other_verdict(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"held_by": "BACKLOG.md — skill packs"}))
        self.assertTrue(any("held_by is required" in error for error in errors), errors)

    def test_triage_evidence_requires_an_https_url(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage["evidence"][0].update({"url": "http://example.com"}))
        self.assertTrue(any("evidence requires an authoritative HTTPS URL" in e for e in errors), errors)

    def test_triage_evidence_requires_a_content_hash(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage["evidence"][0].update({"content_sha256": "nope"}))
        self.assertTrue(any("evidence requires a content_sha256" in e for e in errors), errors)

    def test_triage_evidence_must_not_be_empty(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"evidence": []}))
        self.assertTrue(any("triage evidence must be a non-empty list" in e for e in errors), errors)

    def test_git_blob_evidence_must_address_the_recorded_sha(self) -> None:
        def mutate(triage, _candidate):
            triage["evidence"][0] = {
                "label": "LICENSE",
                "url": "https://github.com/sample/candidate/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/sample/candidate/git/blobs/" + "1" * 40,
                "content_sha256": "a" * 64,
                "fetched_at": "2026-09-04",
            }
        errors = self.candidate_with_triage(mutate)
        self.assertTrue(any("immutable evidence URL must address the blob SHA" in e for e in errors), errors)

    def test_valid_git_blob_evidence_passes(self) -> None:
        def mutate(triage, _candidate):
            triage["evidence"][0] = {
                "label": "LICENSE",
                "url": "https://github.com/sample/candidate/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/sample/candidate/git/blobs/" + "0" * 40,
                "content_sha256": "a" * 64,
                "fetched_at": "2026-09-04",
            }
        errors = self.candidate_with_triage(mutate)
        self.assertFalse([e for e in errors if "sample/candidate" in e], errors)

    def test_evidence_carrying_the_bundle_content_field_is_rejected(self) -> None:
        """The harness records `content` to quote from; it is context, never a citation field."""
        errors = self.candidate_with_triage(
            lambda triage, _: triage["evidence"][0].update({"content": "The MIT License"}))
        self.assertTrue(any("evidence fields differ from schema" in e for e in errors), errors)

    def test_evidence_missing_a_required_field_is_rejected(self) -> None:
        def mutate(triage, _candidate):
            del triage["evidence"][0]["fetched_at"]
        errors = self.candidate_with_triage(mutate)
        self.assertTrue(any("evidence fields differ from schema" in e for e in errors), errors)

    def test_a_finding_may_not_name_a_taxonomy_role(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"finding": "This is clearly a coding_agent."}))
        self.assertTrue(any("finding must not classify" in error for error in errors), errors)

    def test_a_finding_may_not_name_a_taxonomy_role_in_any_case(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"finding": "This is clearly a Coding_Agent."}))
        self.assertTrue(any("finding must not classify" in error for error in errors), errors)

    def test_a_finding_may_quote_prose_that_resembles_a_role(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"finding": 'The README calls it a "coding agent".'}))
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_a_finding_must_be_a_non_empty_string(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"finding": "  "}))
        self.assertTrue(any("triage requires a finding" in error for error in errors), errors)

    def test_family_and_role_may_be_null_while_a_decision_holds_the_record(self) -> None:
        def mutate(triage, candidate):
            triage["verdict"] = "held"
            triage["held_by"] = "BACKLOG.md — labs whose models you serve yourself"
            candidate["proposed_system_family"] = None
            candidate["proposed_primary_role"] = None
        errors = self.candidate_with_triage(mutate)
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_family_and_role_may_not_be_null_without_a_holding_decision(self) -> None:
        def mutate(candidate):
            candidate["proposed_system_family"] = None
            candidate["proposed_primary_role"] = None
        errors = self.catalog_with_candidate(mutate)
        self.assertTrue(any("may only be null" in error for error in errors), errors)

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

    def test_invalid_inference_service_score_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        services["services"][0]["score"]["operational_maturity"] = 11
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)

        errors = validate(root)

        self.assertTrue(any("score dimensions must be numbers between 0 and 10" in error for error in errors), errors)

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
