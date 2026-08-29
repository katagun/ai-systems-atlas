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
        cls.inference_services = json.loads((ROOT / "directory" / "inference-services.json").read_text(encoding="utf-8"))

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

    def test_assistant_family_has_distinct_roles_and_score_profile(self) -> None:
        families = {item["id"] for item in self.taxonomy["system_families"]}
        roles = {
            item["id"]: item["family"]
            for item in self.taxonomy["primary_roles"]
        }
        profiles = {
            item["id"]: item["family"]
            for item in self.taxonomy["score_profiles"]
        }

        self.assertIn("assistant_system", families)
        self.assertEqual("assistant_system", profiles["assistant"])
        self.assertEqual(
            {"general_ai_assistant", "enterprise_work_assistant", "multi_model_chat_client"},
            {role for role, family in roles.items() if family == "assistant_system"},
        )

    def test_first_assistant_batch_is_reviewed_across_each_role(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}
        expected = {
            "chatgpt": "general_ai_assistant",
            "amazon-quick": "enterprise_work_assistant",
            "t3-chat": "multi_model_chat_client",
        }

        for project_id, role in expected.items():
            self.assertEqual("assistant_system", projects[project_id]["system_family"])
            self.assertEqual("assistant", projects[project_id]["score_profile"])
            self.assertEqual(role, projects[project_id]["primary_role"])
            self.assertEqual("proprietary", projects[project_id]["source_model"])

    def test_notable_general_assistant_batch_is_reviewed(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}
        expected = {"claude", "deepseek", "gemini-apps", "microsoft-copilot", "z-ai"}

        for project_id in expected:
            project = projects[project_id]
            self.assertEqual("assistant_system", project["system_family"])
            self.assertEqual("general_ai_assistant", project["primary_role"])
            self.assertEqual("assistant", project["score_profile"])
            self.assertEqual("proprietary", project["source_model"])
            self.assertEqual("verified", project["license_review_status"])

        candidate_names = {
            candidate["name"]
            for candidate in json.loads(
                (ROOT / "directory" / "candidates.json").read_text(encoding="utf-8")
            )["candidates"]
        }
        self.assertNotIn("Claude.ai", candidate_names)
        self.assertNotIn("Gemini Apps", candidate_names)

    def test_third_assistant_batch_preserves_product_boundaries(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}
        candidates = json.loads(
            (ROOT / "directory" / "candidates.json").read_text(encoding="utf-8")
        )["candidates"]
        candidate_names = {candidate["name"] for candidate in candidates}

        self.assertEqual("general_ai_assistant", projects["grok"]["primary_role"])
        self.assertEqual(
            "enterprise_work_assistant",
            projects["microsoft-365-copilot"]["primary_role"],
        )
        for project_id in ("grok", "microsoft-365-copilot"):
            project = projects[project_id]
            self.assertEqual("assistant_system", project["system_family"])
            self.assertEqual("assistant", project["score_profile"])
            self.assertEqual("proprietary", project["source_model"])
            self.assertEqual("verified", project["license_review_status"])

        self.assertNotIn("Grok", candidate_names)
        self.assertNotIn("Microsoft 365 Copilot", candidate_names)
        self.assertIn("GroqChat", candidate_names)
        self.assertNotIn("groqchat", projects)

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

    def test_gbrain_and_gstack_are_distinct_reviewed_systems(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        projects = {project["id"]: project for project in self.document["projects"]}

        self.assertEqual("agent_memory_service", projects["gbrain"]["primary_role"])
        self.assertEqual("memory_system", projects["gbrain"]["system_family"])
        self.assertEqual("open_source", projects["gbrain"]["source_model"])
        self.assertEqual("provider_agnostic", projects["gbrain"]["provider_relationship"])
        self.assertTrue(projects["gbrain"]["local_first"])
        self.assertEqual("coding_agent_workflow", projects["gstack"]["primary_role"])
        self.assertEqual("agent_system", projects["gstack"]["system_family"])
        self.assertEqual("mixed_open_source", projects["gstack"]["source_model"])
        self.assertEqual({"MIT", "OFL-1.1"}, set(projects["gstack"]["licenses"]))
        self.assertEqual("garrytan/gbrain", projects["gbrain"]["repo"])
        self.assertEqual("garrytan/gstack", projects["gstack"]["repo"])
        self.assertNotIn("garrytan/gbrain", {item["repo"] for item in candidates["candidates"]})
        self.assertNotIn("garrytan/gbrain", {item["repo"] for item in exclusions["entries"]})

    def test_data_analysis_batch_has_evidence_backed_dispositions(self) -> None:
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))
        reviewed = {"eosphoros-ai/DB-GPT", "vanna-ai/vanna"}

        self.assertLessEqual(reviewed, {project["repo"] for project in self.document["projects"]})
        self.assertTrue(reviewed.isdisjoint({candidate["repo"] for candidate in candidates["candidates"]}))
        self.assertIn("sqlchat/sqlchat", {entry["repo"] for entry in exclusions["entries"]})

    def test_delegated_work_and_named_memory_products_have_explicit_dispositions(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))
        exclusions = json.loads((ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8"))

        self.assertEqual("general_work_agent", projects["claude-cowork"]["primary_role"])
        self.assertEqual("general_work_agent", projects["perplexity-computer"]["primary_role"])
        self.assertEqual("general_ai_assistant", projects["perplexity"]["primary_role"])
        self.assertEqual("assistant_system", projects["perplexity"]["system_family"])
        self.assertEqual("multi_provider", projects["perplexity"]["provider_relationship"])
        self.assertIn("Perplexity Computer", projects["perplexity"]["current_repo_note"])
        self.assertEqual("ai_knowledge_app", projects["slite"]["primary_role"])
        self.assertEqual("agent_memory_service", projects["zep-cloud"]["primary_role"])
        self.assertNotIn("Zep Cloud", {candidate["name"] for candidate in candidates["candidates"]})

        self.assertLessEqual({"mem0", "graphiti", "letta-code"}, set(projects))
        self.assertLessEqual(
            {"Pletor", "Sylph"},
            {candidate["name"] for candidate in candidates["candidates"]},
        )
        self.assertIn("Gorgias Cortex", {entry["name"] for entry in exclusions["entries"]})

    def test_named_agent_additions_have_reviewed_product_boundaries(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}
        candidates = json.loads((ROOT / "directory" / "candidates.json").read_text(encoding="utf-8"))

        self.assertEqual("coding_agent", projects["kilo-code"]["primary_role"])
        self.assertEqual("open_source", projects["kilo-code"]["source_model"])
        self.assertIn("Cloud Agent", projects["kilo-code"]["current_repo_note"])
        self.assertEqual("stateful_agent_runtime", projects["hermes-agent"]["primary_role"])
        self.assertIn("self_editing", projects["hermes-agent"]["memory_lifecycle"])
        self.assertEqual("coding_agent", projects["replit-agent"]["primary_role"])
        self.assertEqual("proprietary", projects["replit-agent"]["source_model"])
        self.assertNotIn("Replit Agent", {candidate["name"] for candidate in candidates["candidates"]})

    def test_computer_research_terminal_and_media_agent_batch_has_explicit_boundaries(self) -> None:
        projects = {project["id"]: project for project in self.document["projects"]}

        self.assertEqual("browser_computer_agent", projects["cua"]["primary_role"])
        self.assertEqual("open_source", projects["cua"]["source_model"])
        self.assertEqual("research_agent", projects["praxist"]["primary_role"])
        self.assertEqual("source_available", projects["praxist"]["source_model"])
        self.assertEqual("coding_agent", projects["open-grok"]["primary_role"])
        self.assertIn("unrelated", projects["open-grok"]["current_repo_note"])
        self.assertEqual("coding_agent", projects["warp"]["primary_role"])
        self.assertEqual({"AGPL-3.0", "MIT"}, set(projects["warp"]["licenses"]))
        self.assertEqual("general_work_agent", projects["higgsfield-supercomputer"]["primary_role"])
        self.assertEqual("multi_model_chat_client", projects["venice-ai"]["primary_role"])
        self.assertIn("Venice API", projects["venice-ai"]["current_repo_note"])

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
        for name in ("projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json", "specifications.json", "inference-services.json"):
            self.assertEqual((ROOT / "directory" / name).read_bytes(), (ROOT / "web" / name).read_bytes(), name)

    def test_inference_services_are_separate_scored_service_records(self) -> None:
        records = self.inference_services["services"]
        expected = {
            "openai-api", "anthropic-api", "amazon-bedrock",
            "vertex-ai-generative-ai", "openrouter", "groqcloud",
            "google-gemini-api", "xai-api", "mistral-ai-studio",
            "cohere-api", "deepseek-api", "moonshot-ai-open-platform",
            "zai-model-api", "ai21-studio", "minimax-open-platform",
            "perplexity-api", "alibaba-cloud-model-studio",
            "baidu-qianfan-modelbuilder", "byteplus-modelark",
            "azure-ai-foundry-models", "oci-generative-ai",
            "databricks-foundation-model-apis", "ibm-watsonx-ai",
            "cloudflare-workers-ai", "tencent-cloud-tokenhub",
            "nvidia-api-catalog", "hugging-face-inference-providers",
            "hugging-face-inference-endpoints", "together-ai",
            "fireworks-ai", "cerebras-inference", "sambanova-cloud",
            "deepinfra", "replicate", "venice-api",
            "stability-ai-developer-platform",
        }
        self.assertEqual(expected, {record["id"] for record in records})
        self.assertEqual(
            {"direct_model_api", "cloud_model_platform", "managed_inference_host", "routing_aggregator"},
            {record["service_type"] for record in records},
        )
        for record in records:
            self.assertFalse({"system_family", "models", "pricing"} & set(record), record["id"])
            self.assertEqual("inference_service", record["score_profile"], record["id"])
            self.assertTrue(record["service_boundary"], record["id"])
            self.assertTrue(record["evidence"], record["id"])
            self.assertEqual("web_terms", record["terms"]["kind"], record["id"])

    def test_inference_service_scores_match_the_dedicated_profile(self) -> None:
        profile = self.taxonomy["inference_service_score_profile"]
        dimensions = {item["id"]: item["weight"] for item in profile["dimensions"]}

        self.assertEqual("inference_service", profile["id"])
        self.assertAlmostEqual(1.0, sum(dimensions.values()))
        for record in self.inference_services["services"]:
            self.assertEqual(set(dimensions) | {"overall"}, set(record["score"]), record["id"])
            calculated = round(sum(
                record["score"][name] * weight for name, weight in dimensions.items()
            ), 2)
            self.assertEqual(calculated, record["score"]["overall"], record["id"])
            self.assertTrue(all(0 <= record["score"][name] <= 10 for name in dimensions), record["id"])

    def test_inference_service_baseline_covers_named_ecosystem_gaps(self) -> None:
        records = {record["id"]: record for record in self.inference_services["services"]}
        named_gaps = {
            "deepseek-api", "moonshot-ai-open-platform", "zai-model-api",
            "alibaba-cloud-model-studio", "mistral-ai-studio",
            "hugging-face-inference-providers", "nvidia-api-catalog", "xai-api",
            "azure-ai-foundry-models", "oci-generative-ai",
            "databricks-foundation-model-apis", "cohere-api",
        }
        self.assertFalse(named_gaps - records.keys())
        self.assertGreaterEqual(len(records), 30)
        self.assertTrue(any(record["operator"] == "Baidu AI Cloud" for record in records.values()))
        self.assertTrue(any(record["operator"] == "Tencent Cloud" for record in records.values()))

    def test_inference_service_traits_are_taxonomy_backed(self) -> None:
        service_types = {item["id"] for item in self.taxonomy["inference_service_types"]}
        delivery_modes = {item["id"] for item in self.taxonomy["inference_delivery_modes"]}
        model_sources = {item["id"] for item in self.taxonomy["inference_model_sources"]}
        api_styles = {item["id"] for item in self.taxonomy["inference_api_styles"]}
        for record in self.inference_services["services"]:
            self.assertIn(record["service_type"], service_types, record["id"])
            self.assertFalse(set(record["delivery_modes"]) - delivery_modes, record["id"])
            self.assertFalse(set(record["model_sources"]) - model_sources, record["id"])
            self.assertFalse(set(record["api_styles"]) - api_styles, record["id"])

    def test_specifications_are_a_separate_unscored_collection(self) -> None:
        records = self.specifications["specifications"]
        expected = {
            "mcp",
            "a2a",
            "ag-ui",
            "acp",
            "agents-md",
            "claude-md",
            "github-copilot-instructions",
            "gemini-md",
            "cline-rules",
            "cursor-rules",
            "continue-rules",
            "roo-code-rules",
            "devin-desktop-rules",
            "agent-skills",
            "agent-plugins",
        }
        self.assertLessEqual(expected, {record["id"] for record in records})
        for record in records:
            self.assertNotIn("system_family", record, record["id"])
            self.assertNotIn("score_profile", record, record["id"])
            self.assertNotIn("score", record, record["id"])

    def test_vendor_instruction_conventions_are_explicitly_classified(self) -> None:
        records = {record["id"]: record for record in self.specifications["specifications"]}
        expected = {
            "claude-md",
            "github-copilot-instructions",
            "gemini-md",
            "cline-rules",
            "cursor-rules",
            "continue-rules",
            "roo-code-rules",
            "devin-desktop-rules",
        }

        self.assertLessEqual(expected, records.keys())
        for specification_id in expected:
            record = records[specification_id]
            self.assertEqual("instruction_convention", record["specification_type"])
            self.assertEqual("project_instructions", record["scope"])
            self.assertEqual("vendor_specific", record["status"])

        copilot = records["github-copilot-instructions"]
        self.assertIn(".github/instructions/**/*.instructions.md", copilot["standardizes"])
        self.assertIn("excludeAgent", copilot["standardizes"])
        self.assertIn("README.md", {item.get("path") for item in copilot["evidence"]})
        self.assertIn(
            "https://prod.cursor.com/help/customization/rules",
            {item["url"] for item in records["cursor-rules"]["evidence"]},
        )

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

    def test_specification_relations_are_reciprocal(self) -> None:
        records = {record["id"]: record for record in self.specifications["specifications"]}

        for specification_id, record in records.items():
            for related_id in record["related_specifications"]:
                self.assertIn(
                    specification_id,
                    records[related_id]["related_specifications"],
                    f"{specification_id} -> {related_id}",
                )


if __name__ == "__main__":
    unittest.main()
