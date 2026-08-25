from __future__ import annotations

import copy
import urllib.error
import unittest

from scripts import update_directory


def project_fixture(status: str = "active") -> dict:
    return {
        "repo": "example/tool",
        "license": "MIT",
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
    def test_allowed_to_allowed_license_change_is_quarantined(self) -> None:
        project = project_fixture()

        successes, failures, quarantine = update_directory.refresh_projects(
            [project], {}, lambda _path, _token: metadata_fixture("Apache-2.0"), None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual(1, successes)
        self.assertEqual([], failures)
        self.assertEqual("quarantined", project["status"])
        self.assertEqual("MIT", quarantine[0]["expected_license"])
        self.assertEqual("Apache-2.0", quarantine[0]["detected_license"])

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

        successes, failures, quarantine = update_directory.refresh_projects(
            [project], {}, unavailable, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual(0, successes)
        self.assertEqual(before, project)
        self.assertEqual(1, len(failures))
        self.assertEqual([], quarantine)

    def test_transport_failure_preserves_an_open_quarantine(self) -> None:
        project = project_fixture("quarantined")
        previous_entry = {
            "repo": "example/tool",
            "expected_license": "MIT",
            "detected_license": "Apache-2.0",
            "reason": "review required",
            "detected_at": "2026-08-24",
            "status": "open",
        }

        def unavailable(_path: str, _token: str | None) -> dict:
            raise urllib.error.URLError("offline")

        _, _, quarantine = update_directory.refresh_projects(
            [project], {"example/tool": previous_entry}, unavailable, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual([previous_entry], quarantine)

    def test_existing_quarantine_requires_human_resolution(self) -> None:
        project = project_fixture("quarantined")
        previous = {
            "example/tool": {
                "repo": "example/tool",
                "expected_license": "MIT",
                "detected_license": "Apache-2.0",
                "reason": "review required",
                "detected_at": "2026-08-24",
                "status": "open",
            }
        }

        _, _, quarantine = update_directory.refresh_projects(
            [project], previous, lambda _path, _token: metadata_fixture("MIT"), None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual("quarantined", project["status"])
        self.assertEqual("2026-08-24", quarantine[0]["detected_at"])

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

        candidate = update_directory.candidate_template(repo, "coding_agent", 0.82, "2026-08-25")

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

        candidate = update_directory.candidate_template(repo, role, confidence, "2026-08-25")

        self.assertEqual("data_analysis_agent", role)
        self.assertGreaterEqual(confidence, 0.84)
        self.assertEqual("agent_system", candidate["proposed_system_family"])


if __name__ == "__main__":
    unittest.main()
