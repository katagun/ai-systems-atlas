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

    def test_projects_are_open_source_and_have_unique_ids(self) -> None:
        projects = self.document["projects"]
        ids = [project["id"] for project in projects]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(project["license_scope"] == "open_source" for project in projects))

    def test_taxonomy_references_are_valid(self) -> None:
        roles = {item["id"] for item in self.taxonomy["primary_roles"]}
        relations = {item["id"] for item in self.taxonomy["agent_relations"]}
        architectures = {item["id"] for item in self.taxonomy["architectures"]}
        for project in self.document["projects"]:
            self.assertIn(project["primary_role"], roles, project["repo"])
            self.assertIn(project["agent_relation"], relations, project["repo"])
            self.assertFalse(set(project["architectures"]) - architectures, project["repo"])

    def test_vector_is_architecture_not_primary_role(self) -> None:
        roles = {item["id"] for item in self.taxonomy["primary_roles"]}
        self.assertNotIn("vector", roles)
        self.assertIn("vector_index", {item["id"] for item in self.taxonomy["architectures"]})

    def test_editorial_scores_are_bounded(self) -> None:
        for project in self.document["projects"]:
            self.assertGreaterEqual(project["score"]["overall"], 0)
            self.assertLessEqual(project["score"]["overall"], 10)

    def test_web_data_matches_directory_data(self) -> None:
        self.assertEqual(
            (ROOT / "directory" / "projects.json").read_bytes(),
            (ROOT / "web" / "projects.json").read_bytes(),
        )


if __name__ == "__main__":
    unittest.main()
