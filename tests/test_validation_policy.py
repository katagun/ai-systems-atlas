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

    SAMPLE_TRUST: ClassVar[dict] = {
        "verified_at": "2026-09-03",
        "properties": {
            name: {
                "status": "undocumented",
                "note": "No first-party statement was found in the API documentation.",
                "url": "https://example.com/docs",
                "scope": "Public API documentation for the named service",
                "verified_at": "2026-09-02",
            }
            for name in (
                "response_integrity", "upstream_disclosure", "credential_handling",
                "cache_isolation", "vulnerability_disclosure", "independent_audit",
            )
        },
        "findings": [
            {
                "claim": "Routing through the gateway with shared credentials may pool prompt caches across customers.",
                "published_at": "2026-05-28",
                "source": {
                    "label": "CacheProbe, arXiv 2605.30613v1",
                    "url": "https://arxiv.org/abs/2605.30613v1",
                    "kind": "third_party",
                    "content_sha256": "0" * 64,
                    "fetched_at": "2026-09-01",
                },
                "operator_response": None,
                "resolved": None,
            }
        ],
    }

    def catalog_with_trust(self, mutate) -> list[str]:
        """Validate the real catalog with the first service carrying a mutated SAMPLE_TRUST."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        trust = json.loads(json.dumps(self.SAMPLE_TRUST))
        mutate(trust)
        services["services"][0]["trust"] = trust
        # Pin the collection's own review date so this fixture can never drift against
        # whatever the live catalog's verified_at happens to be.
        services["verified_at"] = max(services["verified_at"], "2026-09-03")
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)
        return validate(root)

    def test_a_valid_trust_record_passes_validation(self) -> None:
        self.assertEqual([], self.catalog_with_trust(lambda trust: None))

    def test_trust_rejects_a_field_outside_its_schema(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust.update({"score": 7}))
        self.assertTrue(any("trust fields differ from schema" in error and "score" in error for error in errors), errors)

    def test_trust_properties_must_be_exactly_the_six(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust["properties"].pop("cache_isolation"))
        self.assertTrue(any("trust properties must be exactly" in error for error in errors), errors)

    def test_trust_status_must_come_from_the_taxonomy(self) -> None:
        errors = self.catalog_with_trust(
            lambda trust: trust["properties"]["cache_isolation"].update({"status": "safe"})
        )
        self.assertTrue(any("unknown trust status 'safe'" in error for error in errors), errors)

    def test_trust_property_requires_note_scope_and_public_https_url(self) -> None:
        def mutate(trust: dict) -> None:
            trust["properties"]["independent_audit"].update({"note": "", "scope": " ", "url": "https://"})
        errors = self.catalog_with_trust(mutate)
        for needle in ("note must be a non-empty string", "scope must be a non-empty string", "url must be an HTTPS URL on a public DNS host"):
            self.assertTrue(any("trust independent_audit" in error and needle in error for error in errors), errors)

    def test_trust_finding_source_must_be_a_pinned_third_party_page(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["source"].update({"kind": "web", "content_sha256": "abc"})
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("source kind must be third_party" in error for error in errors), errors)
        self.assertTrue(any("source requires a content_sha256" in error for error in errors), errors)

    def test_trust_dates_cannot_postdate_the_review(self) -> None:
        def mutate(trust: dict) -> None:
            trust["properties"]["response_integrity"]["verified_at"] = "2026-09-04"
            trust["findings"][0]["source"]["fetched_at"] = "2026-09-04"
            trust["findings"][0]["published_at"] = "2026-09-05"
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("trust response_integrity: verified_at must not be after the trust verified_at" in error for error in errors), errors)
        self.assertTrue(any("source fetched_at must not be after the trust verified_at" in error for error in errors), errors)
        self.assertTrue(any("published_at must not be after the source fetched_at" in error for error in errors), errors)

    def test_trust_review_cannot_postdate_the_collection(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust.update({"verified_at": "2099-01-01"}))
        self.assertTrue(any("trust verified_at must not be after the collection verified_at" in error for error in errors), errors)

    def test_trust_operator_response_is_null_or_complete(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["operator_response"] = {"url": "https://example.com/statement"}
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("operator_response must be null or have exactly" in error for error in errors), errors)

    def test_trust_response_dates_cannot_postdate_the_review(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["operator_response"] = {
                "url": "https://example.com/statement",
                "verified_at": "2026-09-04",
                "summary": "s",
            }
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("operator_response verified_at must not be after the trust verified_at" in error for error in errors), errors)

    def test_trust_closure_carries_a_dated_first_party_source(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["resolved"] = {"url": "https://example.com/fix", "verified_at": "2026-09-02", "summary": "Caches are now scoped per API key."}
        self.assertEqual([], self.catalog_with_trust(mutate))

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

    def test_model_dispositions_must_not_be_published(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        (root / "web" / "model-dispositions.json").write_text("{}\n", encoding="utf-8")

        errors = validate(root)

        self.assertTrue(any("model hold and exclusion decisions must not be published" in error for error in errors), errors)

    def test_model_dispositions_reject_unknown_source_ids(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "model-dispositions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["dispositions"].append({
            "source_id": "acme/ghost",
            "disposition": "held",
            "reason": "No such upstream record.",
            "decided_at": "2026-09-11",
        })
        self.write_json(path, document)

        errors = validate(root)

        self.assertTrue(any("acme/ghost" in error and "missing from the complete models.dev source snapshot" in error for error in errors), errors)

    def test_model_dispositions_reject_reviewed_source_ids(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "model-dispositions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["dispositions"].append({
            "source_id": "openai/gpt-4.1",
            "disposition": "held",
            "reason": "Already reviewed; the disposition must be lifted, not duplicated.",
            "decided_at": "2026-09-11",
        })
        self.write_json(path, document)

        errors = validate(root)

        self.assertTrue(any("openai/gpt-4.1" in error and "already exists in the reviewed collection" in error for error in errors), errors)

    def test_model_queue_must_not_contain_dispositioned_ids(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "model-dispositions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["dispositions"].append({
            "source_id": "alibaba/qwen-flash",
            "disposition": "held",
            "reason": "Still queued; the importer must filter it first.",
            "decided_at": "2026-09-11",
        })
        self.write_json(path, document)

        errors = validate(root)

        self.assertTrue(any("alibaba/qwen-flash" in error and "must not remain queued" in error for error in errors), errors)

    def test_model_eligible_count_covers_dispositioned_ids(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "model-dispositions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["dispositions"] = document["dispositions"][:-1]
        self.write_json(path, document)

        errors = validate(root)

        self.assertTrue(any("eligible count must equal queued plus reviewed plus dispositioned" in error for error in errors), errors)

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

    def test_an_exclusion_rejects_a_field_outside_the_schema(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "exclusions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"][0]["unexpected"] = "value"
        path.write_text(json.dumps(document), encoding="utf-8")

        errors = validate(root)

        self.assertTrue(
            any("fields do not match exclusion schema" in error for error in errors), errors
        )

    def test_an_exclusion_accepts_an_optional_https_url(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "exclusions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"][0]["url"] = "https://vendor.example/launch"
        serialized = json.dumps(document)
        path.write_text(serialized, encoding="utf-8")
        (root / "web" / "exclusions.json").write_text(serialized, encoding="utf-8")

        errors = validate(root)

        self.assertEqual([error for error in errors if "exclusion" in error], [])

    def signals_document(self, **extra: str) -> dict:
        signal = {
            "story_id": "49616354",
            "story_url": "https://news.ycombinator.com/item?id=49616354",
            "title": "Mercury 2.5",
            "url": "https://vendor.example/launch",
            "points": 231,
            "num_comments": 88,
            "submitted_at": "2026-09-08T20:14:52Z",
            "page_status": "readable",
            "content_sha256": "b" * 64,
            "fetched_at": "2026-09-09T08:00:00Z",
            "status": "provisional",
            "discovered_at": "2026-09-09",
        }
        signal.update(extra)
        return {
            "version": "1.0",
            "updated_at": "2026-09-09T08:00:00Z",
            "source": {
                "endpoint": "https://hn.algolia.com/api/v1/search_by_date",
                "window_start": "2026-09-07T00:00:00Z",
                "window_end": "2026-09-08T00:00:00Z",
                "points_floor": 10,
                "story_count": 1042,
                "eligible_count": 1,
                "truncated": False,
            },
            "signals": [signal],
        }

    def test_hn_signals_must_not_be_published(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        (root / "web" / "hn-signals.json").write_text("{}", encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any("hn-signals.json" in error and "must not be published" in error for error in errors),
            errors,
        )

    def test_a_signal_rejects_a_field_outside_the_schema(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "hn-signals.json"
        path.write_text(json.dumps(self.signals_document(extra="value")), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any("fields do not match signal schema" in error for error in errors), errors
        )

    def test_a_signal_finding_may_not_name_a_taxonomy_id(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "The page describes a coding_agent for developers.",
            "evidence": [{
                "label": "vendor page", "url": "https://vendor.example/launch",
                "kind": "web", "content_sha256": "a" * 64,
                "fetched_at": "2026-09-09T08:00:00Z",
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        # Scoped: the candidate-triage validator emits "must not classify" too, so a bare
        # substring match passes on an error from an entirely different queue.
        self.assertTrue(
            any(
                "signal 49616354" in error and "finding must not classify" in error
                for error in errors
            ),
            errors,
        )

    def test_an_unreadable_page_may_only_carry_the_unreadable_verdict(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["page_status"] = "unreadable"
        document["signals"][0]["content_sha256"] = None
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Looks interesting from the title.",
            "evidence": [],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any("unreadable page" in error for error in errors), errors
        )

    def test_signal_assessment_evidence_must_be_a_list(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": "https://vendor.example/launch",
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "assessment evidence must be a list" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_evidence_item_missing_content_sha256_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": "https://vendor.example/launch",
                "kind": "web", "fetched_at": "2026-09-09T08:00:00Z",
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "evidence fields differ from schema" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_evidence_may_not_cite_a_page_the_signal_never_pinned(self) -> None:
        """The routine reads one page. A citation to any other is unreproducible.

        Shape checks alone pass an invented HTTPS URL beside an invented 64-hex digest,
        and nothing else in the pipeline inspects an assessment: verify_signal_pages
        walks the sweep's signals, never the model's citations.
        """
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": "https://totally-unrelated.example/nope",
                "kind": "web", "content_sha256": "a" * 64,
                "fetched_at": "2026-09-09T08:00:00Z",
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error
                and "evidence must cite the signal's own pinned page" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_evidence_carrying_the_signals_own_digest_validates(self) -> None:
        """The other half of the rule: the one citation the routine may write passes."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": signal["url"],
                "kind": "web", "content_sha256": signal["content_sha256"],
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertEqual([error for error in errors if "signal 49616354" in error], [])

    def test_signal_evidence_digest_must_match_even_when_the_url_matches(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": signal["url"],
                "kind": "web", "content_sha256": "a" * 64,
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any("evidence must cite the signal's own pinned page" in error for error in errors),
            errors,
        )

    def test_a_reviewer_may_record_their_own_disposition_as_the_proposer(self) -> None:
        """A human overriding a verdict edits the block in place; recording that edit as
        `hn-signals` would make a human's disposition indistinguishable from an
        unattended proposal, in the one queue whose purpose is holding that line."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "out_of_scope",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Reviewed by hand: the page is a hiring post, not a launch.",
            "evidence": [{
                "label": "vendor page", "url": signal["url"],
                "kind": "web", "content_sha256": signal["content_sha256"],
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "human",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertEqual([error for error in errors if "signal 49616354" in error], [])

    def test_an_unknown_proposer_is_still_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "out_of_scope",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "The page is a hiring post, not a launch.",
            "evidence": [{
                "label": "vendor page", "url": signal["url"],
                "kind": "web", "content_sha256": signal["content_sha256"],
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "some-other-routine",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any("assessment proposer must be hn-signals or human" in error for error in errors),
            errors,
        )

    def signals_with_assessment(self, root: Path, **fields) -> list[str]:
        """Validate a catalog whose one signal carries an assessment built from `fields`."""
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": signal["url"],
                "kind": "web", "content_sha256": signal["content_sha256"],
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        signal["assessment"].update(fields)
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        return validate(root)

    def test_a_kebab_case_taxonomy_id_does_not_evade_the_finding_check(self) -> None:
        """`coding-agent` is the identifier with its separator swapped, not prose."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        errors = self.signals_with_assessment(
            root, finding="The page positions this as a coding-agent for large repositories."
        )
        self.assertTrue(
            any(
                "signal 49616354" in error and "finding must not classify" in error
                for error in errors
            ),
            errors,
        )

    def test_prose_that_merely_resembles_a_role_still_passes(self) -> None:
        """docs/routines/candidate-triage.md: quoting prose that resembles a role is
        fine; writing the identifier is not. The separator normalisation must not
        collapse whitespace, or this documented case would be rejected."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        errors = self.signals_with_assessment(
            root, finding="The page describes a coding agent that edits files in a repository."
        )
        self.assertEqual([error for error in errors if "signal 49616354" in error], [])

    def test_an_evidence_label_may_not_name_a_taxonomy_id(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        signal = document["signals"][0]
        signal["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "coding_agent launch page", "url": signal["url"],
                "kind": "web", "content_sha256": signal["content_sha256"],
                "fetched_at": signal["fetched_at"],
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "evidence label must not classify" in error
                for error in errors
            ),
            errors,
        )

    def test_a_triage_finding_may_not_evade_the_check_with_kebab_case(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "candidates.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        candidate = next(item for item in document["candidates"] if "triage" in item)
        candidate["triage"]["finding"] = "The README calls it a coding-agent for teams."
        path.write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(any("finding must not classify" in error for error in errors), errors)

    def test_a_signal_url_carrying_a_control_character_is_rejected(self) -> None:
        """urlsplit strips tabs and newlines, so the host still parses clean."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document(url="https://vendor.example/launch\n::error::spoofed")
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "must not contain control characters" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_timestamps_must_be_iso_8601(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document(submitted_at="yesterday", fetched_at="2026-13-45T99:00Z")
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        joined = "\n".join(errors)
        self.assertIn("signal 49616354: submitted_at must be an ISO 8601 timestamp", joined)
        self.assertIn("signal 49616354: fetched_at must be an ISO 8601 timestamp", joined)

    def test_worth_review_verdict_requires_at_least_one_evidence_item(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "evidence must cite at least one source" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_story_id_must_be_a_string_not_an_int(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["story_id"] = 49616354
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "story_id must be a numeric string" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_duplicate_story_id_across_signals_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        duplicate = json.loads(json.dumps(document["signals"][0]))
        duplicate["url"] = "https://vendor.example/other"
        document["signals"].append(duplicate)
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "duplicate signal identity" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_provenance_fields_reject_invalid_types(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document(
            points="not-a-number",
            num_comments=-50,
            title=12345,
            story_url="javascript:alert(1)",
            submitted_at="",
            fetched_at="",
        )
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        joined = "\n".join(errors)
        self.assertIn("signal 49616354: points must be a non-negative integer", joined)
        self.assertIn("signal 49616354: num_comments must be a non-negative integer", joined)
        self.assertIn("signal 49616354: title must be a non-empty string", joined)
        self.assertIn(
            "signal 49616354: story_url must be an HTTPS URL on a public DNS host", joined
        )
        self.assertIn("signal 49616354: submitted_at must be a non-empty string", joined)
        self.assertIn("signal 49616354: fetched_at must be a non-empty string", joined)

    def test_signal_points_rejects_boolean_value(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document(points=True)
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "points must be a non-negative integer" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_rule_may_not_name_a_taxonomy_id(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md coding_agent inclusion gate",
            "finding": "Ships a new assistant with agentic workflows for developers.",
            "evidence": [{
                "label": "vendor page", "url": "https://vendor.example/launch",
                "kind": "web", "content_sha256": "a" * 64,
                "fetched_at": "2026-09-09T08:00:00Z",
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "signal 49616354" in error and "rule must not classify" in error
                for error in errors
            ),
            errors,
        )

    def test_the_seeded_empty_hn_signals_envelope_still_validates(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        errors = validate(root)
        self.assertEqual([error for error in errors if "hn-signals.json" in error], [])

    def test_signal_envelope_missing_truncated_is_rejected(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        del document["source"]["truncated"]
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "hn-signals.json: source envelope does not match the sweep schema" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_envelope_truncated_rejects_an_int(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["source"]["truncated"] = 1
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertTrue(
            any(
                "hn-signals.json: source envelope truncated must be a boolean" in error
                for error in errors
            ),
            errors,
        )

    def test_signal_envelope_truncated_accepts_a_real_bool(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = self.signals_document()
        document["source"]["truncated"] = True
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
        self.assertEqual([error for error in errors if "hn-signals.json" in error], [])


if __name__ == "__main__":
    unittest.main()
