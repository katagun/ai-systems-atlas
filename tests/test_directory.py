from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DirectoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.taxonomy = json.loads((ROOT / "directory" / "taxonomy.json").read_text(encoding="utf-8"))
        cls.document = json.loads((ROOT / "directory" / "projects.json").read_text(encoding="utf-8"))
        cls.evidence = json.loads((ROOT / "directory" / "license-evidence.json").read_text(encoding="utf-8"))
        cls.specifications = json.loads((ROOT / "directory" / "specifications.json").read_text(encoding="utf-8"))

    def test_projects_have_unique_ids_and_reviewed_source_models(self) -> None:
        projects = self.document["projects"]
        ids = [project["id"] for project in projects]
        self.assertEqual(len(ids), len(set(ids)))
        source_models = {item["id"] for item in self.taxonomy["source_models"]}
        licenses = {item["id"] for item in self.taxonomy["licenses"]}
        for project in projects:
            self.assertIn(project["source_model"], source_models)
            self.assertTrue(project["licenses"])
            self.assertFalse(set(project["licenses"]) - licenses)

    def test_taxonomy_references_are_valid(self) -> None:
        roles = {item["id"]: item["family"] for item in self.taxonomy["primary_roles"]}
        relations = {item["id"] for item in self.taxonomy["agent_relations"]}
        architectures = {item["id"] for item in self.taxonomy["architectures"]}
        for project in self.document["projects"]:
            self.assertIn(project["primary_role"], roles, project["repo"])
            self.assertEqual(roles[project["primary_role"]], project["system_family"], project["repo"])
            self.assertIn(project["agent_relation"], relations, project["repo"])
            self.assertFalse(set(project["architectures"]) - architectures, project["repo"])

    def test_vector_is_architecture_not_primary_role(self) -> None:
        roles = {item["id"] for item in self.taxonomy["primary_roles"]}
        self.assertNotIn("vector", roles)
        self.assertIn("vector_index", {item["id"] for item in self.taxonomy["architectures"]})

    def test_provider_relationship_is_a_trait_not_a_family(self) -> None:
        families = {item["id"] for item in self.taxonomy["system_families"]}
        relationships = {item["id"] for item in self.taxonomy["provider_relationships"]}

        self.assertNotIn("model_provider", families)
        self.assertEqual({"provider_native", "multi_provider", "provider_agnostic"}, relationships)
        self.assertIn("anthropic", {item["id"] for item in self.taxonomy["model_backends"]})

    def test_reviewed_provider_traits_are_atomic_and_taxonomy_backed(self) -> None:
        relationships = {item["id"] for item in self.taxonomy["provider_relationships"]}
        backends = {item["id"] for item in self.taxonomy["model_backends"]}
        reviewed = [project for project in self.document["projects"] if "provider_relationship" in project]

        self.assertGreaterEqual(len(reviewed), 1)
        for project in reviewed:
            self.assertIn(project["provider_relationship"], relationships, project["repo"])
            self.assertTrue(project["model_backends"], project["repo"])
            self.assertFalse(set(project["model_backends"]) - backends, project["repo"])

    def test_license_only_exclusions_return_to_the_review_queue(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        requeued = {
            "onyx-dot-app/onyx",
            "screenpipe/screenpipe",
            "toeverything/AFFiNE",
        }

        self.assertLessEqual(requeued, {candidate["repo"] for candidate in candidates["candidates"]})
        self.assertTrue(requeued.isdisjoint({entry["repo"] for entry in exclusions["entries"]}))

    def test_major_coding_agent_and_runtime_batch_is_reviewed(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        projects = {project["id"]: project for project in self.document["projects"]}
        expected = {
            "claude-code": "proprietary",
            "devin": "proprietary",
            "kiro": "proprietary",
            "openhands": "open_source",
            "openclaw": "open_source",
            "pi": "open_source",
            "prime-agent": "open_source",
        }

        self.assertLessEqual(expected.keys(), projects.keys())
        for project_id, source_model in expected.items():
            self.assertEqual(source_model, projects[project_id]["source_model"], project_id)
        self.assertNotIn(
            "OpenHands/OpenHands",
            {candidate["repo"] for candidate in candidates["candidates"]},
        )

    def test_wrenai_is_reviewed_as_open_core_not_excluded(self) -> None:
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        project = next(project for project in self.document["projects"] if project["id"] == "wrenai")

        self.assertEqual("open_core", project["source_model"])
        self.assertEqual(
            {"Apache-2.0", "CC-BY-4.0", "LicenseRef-Commercial"},
            set(project["licenses"]),
        )
        self.assertNotIn(project["repo"], {entry["repo"] for entry in exclusions["entries"]})

    def test_reviewed_framework_batch_leaves_the_candidate_queue(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        reviewed_repos = {
            "agno-agi/agno",
            "deepset-ai/haystack",
            "langchain-ai/langchain",
            "openai/openai-agents-python",
            "run-llama/llama_index",
            "stanfordnlp/dspy",
        }

        self.assertLessEqual(
            reviewed_repos,
            {project["repo"] for project in self.document["projects"]},
        )
        self.assertTrue(
            reviewed_repos.isdisjoint({candidate["repo"] for candidate in candidates["candidates"]})
        )

    def test_provider_framework_batch_has_evidence_backed_dispositions(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        projects = {project["id"]: project for project in self.document["projects"]}
        reviewed_repos = {
            "anthropics/claude-agent-sdk-python",
            "anthropics/claude-agent-sdk-typescript",
            "google/adk-go",
            "google/adk-python",
            "mastra-ai/mastra",
        }

        self.assertTrue(reviewed_repos.isdisjoint({item["repo"] for item in candidates["candidates"]}))
        self.assertEqual("mixed_source", projects["claude-agent-sdk"]["source_model"])
        self.assertEqual("provider_native", projects["claude-agent-sdk"]["provider_relationship"])
        self.assertEqual("open_source", projects["google-adk"]["source_model"])
        self.assertEqual("provider_agnostic", projects["google-adk"]["provider_relationship"])
        self.assertEqual("open_core", projects["mastra"]["source_model"])
        self.assertEqual("provider_agnostic", projects["mastra"]["provider_relationship"])
        self.assertLessEqual(
            {"anthropics/claude-agent-sdk-typescript", "google/adk-go"},
            {item["repo"] for item in exclusions["entries"]},
        )

    def test_data_analysis_batch_has_evidence_backed_dispositions(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        reviewed = {"eosphoros-ai/DB-GPT", "vanna-ai/vanna"}

        self.assertLessEqual(reviewed, {project["repo"] for project in self.document["projects"]})
        self.assertTrue(reviewed.isdisjoint({candidate["repo"] for candidate in candidates["candidates"]}))
        self.assertIn("sqlchat/sqlchat", {entry["repo"] for entry in exclusions["entries"]})

    def test_editorial_scores_match_family_profile(self) -> None:
        profiles = {item["id"]: item for item in self.taxonomy["score_profiles"]}
        for project in self.document["projects"]:
            profile = profiles[project["score_profile"]]
            self.assertEqual(profile["family"], project["system_family"], project["repo"])
            dimensions = {item["id"]: item["weight"] for item in profile["dimensions"]}
            self.assertEqual(set(project["score"]), set(dimensions) | {"overall"}, project["repo"])
            calculated = round(sum(project["score"][name] * weight for name, weight in dimensions.items()), 2)
            self.assertEqual(calculated, project["score"]["overall"], project["repo"])

    def test_agent_projects_have_agent_traits(self) -> None:
        agents = [project for project in self.document["projects"] if project["system_family"] == "agent_system"]
        self.assertGreaterEqual(len(agents), 10)
        for project in agents:
            self.assertTrue(project["agent_interfaces"], project["repo"])
            self.assertTrue(project["execution_boundaries"], project["repo"])
            self.assertTrue(project["agent_capabilities"], project["repo"])

    def test_every_project_has_scoped_license_evidence(self) -> None:
        evidence = {item["project_id"]: item for item in self.evidence["entries"]}
        projects = {item["id"]: item for item in self.document["projects"]}
        self.assertEqual(set(projects), set(evidence))
        for project_id, project in projects.items():
            items = evidence[project_id]["items"]
            self.assertEqual(set(project["licenses"]), {item["license_id"] for item in items})
            for item in items:
                self.assertTrue(item["scope"])
                if item["kind"] == "git_blob":
                    self.assertEqual(40, len(item["blob_sha"]))

    def test_web_data_matches_directory_data(self) -> None:
        for name in ("projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json", "specifications.json"):
            self.assertEqual((ROOT / "directory" / name).read_bytes(), (ROOT / "web" / name).read_bytes(), name)

    def test_specifications_are_a_separate_unscored_collection(self) -> None:
        records = self.specifications["specifications"]
        expected = {"mcp", "a2a", "ag-ui", "acp", "agents-md", "claude-md", "agent-skills", "agent-plugins"}
        self.assertLessEqual(expected, {record["id"] for record in records})
        for record in records:
            self.assertNotIn("system_family", record, record["id"])
            self.assertNotIn("score_profile", record, record["id"])
            self.assertNotIn("score", record, record["id"])

    def test_specification_classification_and_evidence_are_taxonomy_backed(self) -> None:
        types = {item["id"] for item in self.taxonomy["specification_types"]}
        scopes = {item["id"] for item in self.taxonomy["specification_scopes"]}
        statuses = {item["id"] for item in self.taxonomy["specification_statuses"]}
        licenses = {item["id"] for item in self.taxonomy["licenses"]}
        records = self.specifications["specifications"]
        ids = {record["id"] for record in records}

        self.assertEqual(len(records), len(ids))
        for record in records:
            self.assertIn(record["specification_type"], types, record["id"])
            self.assertIn(record["scope"], scopes, record["id"])
            self.assertIn(record["status"], statuses, record["id"])
            self.assertTrue(record["evidence"], record["id"])
            self.assertEqual(set(record["licenses"]), {item["license_id"] for item in record["license_evidence"]})
            self.assertFalse(set(record["licenses"]) - licenses, record["id"])
            self.assertFalse(set(record["related_specifications"]) - ids, record["id"])


if __name__ == "__main__":
    unittest.main()
