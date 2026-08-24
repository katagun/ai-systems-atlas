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

    def test_projects_are_open_source_and_have_unique_ids(self) -> None:
        projects = self.document["projects"]
        ids = [project["id"] for project in projects]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(project["license_scope"] == "open_source" for project in projects))

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

    def test_every_project_has_pinned_license_evidence(self) -> None:
        evidence = {item["repo"].lower(): item for item in self.evidence["entries"]}
        projects = {item["repo"].lower(): item for item in self.document["projects"]}
        self.assertEqual(set(projects), set(evidence))
        for repo, project in projects.items():
            self.assertEqual(project["license"], evidence[repo]["spdx_id"])
            self.assertEqual(40, len(evidence[repo]["blob_sha"]))

    def test_web_data_matches_directory_data(self) -> None:
        for name in ("projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json"):
            self.assertEqual((ROOT / "directory" / name).read_bytes(), (ROOT / "web" / name).read_bytes(), name)


if __name__ == "__main__":
    unittest.main()
