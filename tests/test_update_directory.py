from __future__ import annotations

import copy
import urllib.error
import unittest

from scripts import update_directory


def project_fixture(status: str = "active") -> dict:
    return {
        "id": "tool",
        "repo": "example/tool",
        "licenses": ["MIT"],
        "source_model": "open_source",
        "license_review_status": "verified",
        "status": status,
        "verified_at": "2025-01-15",
        "stars": 10,
        "stars_verified_at": "2025-01-15",
        "current_repo_note": None,
    }


def metadata_fixture(license_id: str = "MIT") -> dict:
    return {
        "archived": False,
        "stargazers_count": 20,
        "pushed_at": "2026-08-25T00:00:00Z",
        "forks_count": 3,
        "open_issues_count": 2,
        "license": {"spdx_id": license_id},
    }


class UpdateDirectoryTests(unittest.TestCase):
    def test_license_change_opens_review_without_hiding_project(self) -> None:
        project = project_fixture()

        successes, failures, reviews = update_directory.refresh_projects(
            [project], {}, lambda _path, _token: metadata_fixture("Apache-2.0"), None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual(1, successes)
        self.assertEqual([], failures)
        self.assertEqual("active", project["status"])
        self.assertEqual("review_required", project["license_review_status"])
        self.assertEqual(["MIT"], reviews[0]["expected_licenses"])
        self.assertEqual("Apache-2.0", reviews[0]["detected_license"])

    def test_metadata_refresh_does_not_change_editorial_verification_date(self) -> None:
        project = project_fixture()

        update_directory.refresh_projects(
            [project], {}, lambda _path, _token: metadata_fixture(), None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual("2025-01-15", project["verified_at"])
        self.assertEqual("2026-08-25", project["metadata_verified_at"])
        self.assertEqual("2026-08-25", project["stars_verified_at"])

    def test_transport_failure_is_reported_without_destroying_existing_metadata(self) -> None:
        project = project_fixture()
        before = copy.deepcopy(project)

        def unavailable(_path: str, _token: str | None) -> dict:
            raise urllib.error.URLError("offline")

        successes, failures, reviews = update_directory.refresh_projects(
            [project], {}, unavailable, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual(0, successes)
        self.assertEqual(before, project)
        self.assertEqual(1, len(failures))
        self.assertEqual([], reviews)

    def test_transport_failure_preserves_an_open_license_review(self) -> None:
        project = project_fixture()
        project["license_review_status"] = "review_required"
        previous_entry = {
            "project_id": "tool",
            "repo": "example/tool",
            "expected_licenses": ["MIT"],
            "detected_license": "Apache-2.0",
            "reason": "review required",
            "detected_at": "2026-08-24",
            "status": "open",
        }

        def unavailable(_path: str, _token: str | None) -> dict:
            raise urllib.error.URLError("offline")

        _, _, reviews = update_directory.refresh_projects(
            [project], {"tool": previous_entry}, unavailable, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual([previous_entry], reviews)

    def test_non_github_projects_are_not_sent_to_github(self) -> None:
        project = project_fixture()
        project["repo"] = None

        def unexpected_request(_path: str, _token: str | None) -> dict:
            raise AssertionError("non-GitHub project should not be refreshed through GitHub")

        successes, failures, reviews = update_directory.refresh_projects(
            [project], {}, unexpected_request, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual((0, [], []), (successes, failures, reviews))

    def test_existing_license_review_requires_human_resolution(self) -> None:
        project = project_fixture()
        project["license_review_status"] = "review_required"
        previous = {
            "tool": {
                "project_id": "tool",
                "repo": "example/tool",
                "expected_licenses": ["MIT"],
                "detected_license": "Apache-2.0",
                "reason": "review required",
                "detected_at": "2026-08-24",
                "status": "open",
            }
        }

        _, _, reviews = update_directory.refresh_projects(
            [project], previous, lambda _path, _token: metadata_fixture("MIT"), None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual("active", project["status"])
        self.assertEqual("review_required", project["license_review_status"])
        self.assertEqual("2026-08-24", reviews[0]["detected_at"])

    def test_candidate_has_no_editorial_score_or_review_date(self) -> None:
        repo = {
            "full_name": "example/new-agent",
            "name": "new-agent",
            "html_url": "https://github.com/example/new-agent",
            "description": "A coding agent",
            "license": {"spdx_id": "MIT"},
            "stargazers_count": 500,
            "topics": ["agent"],
        }

        candidate = update_directory.candidate_template(
            repo, "agent_system", "coding_agent", 0.82, "2026-08-25"
        )

        self.assertNotIn("score", candidate)
        self.assertNotIn("verified_at", candidate)
        self.assertEqual("provisional", candidate["status"])
        self.assertIn("editorial_score", candidate["review_required"])

    def test_text_to_sql_discovery_is_an_agent_candidate(self) -> None:
        role, confidence = update_directory.classify(
            "An open-source text-to-SQL data assistant with vector database context that executes and repairs queries"
        )
        repo = {
            "full_name": "example/data-agent",
            "name": "data-agent",
            "html_url": "https://github.com/example/data-agent",
            "description": "A text-to-SQL data assistant",
            "license": {"spdx_id": "MIT"},
            "stargazers_count": 500,
            "topics": ["text-to-sql"],
        }

        candidate = update_directory.candidate_template(
            repo, "agent_system", role, confidence, "2026-08-25"
        )

        self.assertEqual("data_analysis_agent", role)
        self.assertGreaterEqual(confidence, 0.84)
        self.assertEqual("agent_system", candidate["proposed_system_family"])

    def test_agent_harness_does_not_need_memory_wording(self) -> None:
        role, confidence = update_directory.classify(
            "An agent harness with sessions, tools, plugins, and an interactive runtime"
        )

        self.assertEqual("stateful_agent_runtime", role)
        self.assertGreaterEqual(confidence, 0.83)

    def test_candidate_family_is_supplied_by_taxonomy_policy(self) -> None:
        repo = {
            "full_name": "example/agent-sdk",
            "name": "agent-sdk",
            "html_url": "https://github.com/example/agent-sdk",
            "description": "Agent SDK",
            "license": {"spdx_id": "MIT"},
            "stargazers_count": 12,
            "topics": ["agents"],
        }

        candidate = update_directory.candidate_template(
            repo, "agent_system", "agent_framework_sdk", 0.8, "2026-08-25"
        )

        self.assertEqual("agent_system", candidate["proposed_system_family"])

    def test_discovery_preserves_non_github_candidates(self) -> None:
        previous = [{"repo": None, "url": "https://example.com/system", "name": "External"}]

        candidates, new_count, successful_queries, failures = update_directory.discover_candidates(
            set(),
            previous,
            {"coding_agent": "agent_system"},
            lambda _path, _token: {"items": []},
            None,
            "2026-08-25",
            sleeper=lambda _seconds: None,
        )

        self.assertEqual(previous, candidates)
        self.assertEqual(0, new_count)
        self.assertGreater(successful_queries, 0)
        self.assertEqual([], failures)


if __name__ == "__main__":
    unittest.main()
