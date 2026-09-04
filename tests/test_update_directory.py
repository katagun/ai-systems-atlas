from __future__ import annotations

import copy
import urllib.error
import urllib.request
import unittest
from unittest import mock

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

    def test_editorial_status_survives_a_metadata_refresh(self) -> None:
        superseded = project_fixture(status="superseded")
        archived = project_fixture(status="archived")

        update_directory.refresh_projects(
            [superseded, archived],
            {},
            lambda _path, _token: metadata_fixture("MIT"),
            None,
            "2026-08-25",
            sleeper=lambda _delay: None,
        )

        self.assertEqual("superseded", superseded["status"])
        self.assertEqual("archived", archived["status"])

    def test_refresh_still_archives_a_record_its_repository_archived(self) -> None:
        project = project_fixture()

        def archived_metadata(_path: str, _token: str | None) -> dict:
            metadata = metadata_fixture("MIT")
            metadata["archived"] = True
            return metadata

        update_directory.refresh_projects(
            [project], {}, archived_metadata, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual("archived", project["status"])

    def test_local_runtime_stars_refresh_updates_descriptive_metadata_only(self) -> None:
        runtime = {
            "id": "sample-runtime",
            "repo": "sample/runtime",
            "verified_at": "2025-01-15",
            "score": {"overall": 5.0},
            "stars": 10,
            "stars_verified_at": "2025-01-15",
        }

        successes, failures = update_directory.refresh_local_runtime_stars(
            [runtime], lambda _path, _token: {"stargazers_count": 42}, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual((1, []), (successes, failures))
        self.assertEqual(42, runtime["stars"])
        self.assertEqual("2026-08-25", runtime["stars_verified_at"])
        self.assertEqual("2025-01-15", runtime["verified_at"])
        self.assertEqual({"overall": 5.0}, runtime["score"])

    def test_local_runtime_star_refresh_transport_failure_preserves_existing_value(self) -> None:
        runtime = {"id": "sample-runtime", "repo": "sample/runtime", "stars": 10, "stars_verified_at": "2025-01-15"}
        before = copy.deepcopy(runtime)

        def unavailable(_path: str, _token: str | None) -> dict:
            raise urllib.error.URLError("offline")

        successes, failures = update_directory.refresh_local_runtime_stars(
            [runtime], unavailable, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual(0, successes)
        self.assertEqual(1, len(failures))
        self.assertEqual(before, runtime)

    def test_local_runtime_without_a_repo_is_not_sent_to_github(self) -> None:
        runtime = {"id": "lm-studio", "repo": None, "stars": None, "stars_verified_at": None}

        def unexpected_request(_path: str, _token: str | None) -> dict:
            raise AssertionError("repo-less local runtime should not be refreshed through GitHub")

        successes, failures = update_directory.refresh_local_runtime_stars(
            [runtime], unexpected_request, None, "2026-08-25", sleeper=lambda _delay: None
        )

        self.assertEqual((0, []), (successes, failures))

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

    def test_autonomous_science_systems_reach_the_candidate_queue(self) -> None:
        """ADR 023 routes discovery systems to research_agent, so discovery must see them.

        The vocabulary this class uses says nothing about memory, retrieval, or
        agents, so before ADR 023 every one of these scored 0.0 and was dropped --
        including the published Kosmos record's own paper title.
        """
        cases = (
            "Kosmos: an AI Scientist for autonomous discovery",
            "An AI scientist that generates and tests hypotheses over your data",
            "Autonomous discovery platform for scientific research",
            "Fully automated open-ended scientific discovery",
        )

        for description in cases:
            with self.subTest(description=description):
                role, confidence = update_directory.classify(description)
                self.assertEqual("research_agent", role)
                self.assertGreaterEqual(confidence, 0.75)

    def test_science_wording_does_not_capture_ordinary_research_agents(self) -> None:
        """The existing research-agent and orchestrator branches keep their answers."""
        role, _confidence = update_directory.classify(
            "Autonomous research agent that produces cited reports"
        )
        self.assertEqual("research_agent", role)

        role, _confidence = update_directory.classify(
            "A multi-agent orchestrator for handoffs and shared execution"
        )
        self.assertEqual("multi_agent_orchestrator", role)

    def test_agent_harness_does_not_need_memory_wording(self) -> None:
        role, confidence = update_directory.classify(
            "An agent harness with sessions, tools, plugins, and an interactive runtime"
        )

        self.assertEqual("stateful_agent_runtime", role)
        self.assertGreaterEqual(confidence, 0.83)

    def test_specialized_memory_roles_precede_broad_assistant_fallbacks(self) -> None:
        cases = {
            "AI assistant to chat with your documents and personal knowledge": "ai_knowledge_app",
            "personal AI assistant for note-taking and your digital garden": "human_pkm",
            "enterprise AI assistant for agent memory and knowledge graphs": "context_graph_engine",
        }

        for description, expected_role in cases.items():
            with self.subTest(description=description):
                role, _confidence = update_directory.classify(description)
                self.assertEqual(expected_role, role)

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

    def test_official_rss_discovery_creates_only_a_provisional_observation(self) -> None:
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        body = b"""<?xml version="1.0"?><rss><channel><item>
          <title>Introducing a new enterprise AI assistant</title>
          <link>https://vendor.example/news/assistant</link>
          <description>An enterprise business assistant with connected workplace tools.</description>
          <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate>
        </item></channel></rss>"""

        candidates, new_count, successes, failures = update_directory.discover_official_candidates(
            [],
            set(),
            [source],
            {"enterprise_work_assistant": "assistant_system"},
            "2026-08-26",
            getter=lambda _url, _hosts: body,
        )

        self.assertEqual((1, 1, []), (new_count, successes, failures))
        candidate = candidates[0]
        self.assertEqual("assistant_system", candidate["proposed_system_family"])
        self.assertEqual("enterprise_work_assistant", candidate["proposed_primary_role"])
        self.assertEqual(["official-announcement", "vendor-ai"], candidate["topics"])
        for editorial_field in ("score", "verified_at", "licenses", "source_model", "provider_relationship"):
            self.assertNotIn(editorial_field, candidate)

    def test_official_discovery_rejects_external_hosts_and_unsafe_xml(self) -> None:
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        external = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <title>Launching a new AI assistant</title>
          <link href="https://untrusted.example/product"/>
          <summary>A personal AI assistant for broad tasks.</summary>
          <updated>2026-08-26T12:00:00Z</updated>
        </entry></feed>"""

        self.assertEqual([], update_directory.parse_official_feed(
            external, source, {"general_ai_assistant": "assistant_system"}, "2026-08-26"
        ))
        with self.assertRaisesRegex(ValueError, "DOCTYPE"):
            update_directory.parse_official_feed(
                b"<!DOCTYPE rss><rss/>", source, {}, "2026-08-26"
            )

        utf16_doctype = """<?xml version="1.0" encoding="UTF-16"?>
          <!DOCTYPE rss [<!ENTITY title "Introducing an AI assistant">]>
          <rss><channel><item><title>&title;</title></item></channel></rss>""".encode("utf-16")
        with self.assertRaisesRegex(ValueError, "DOCTYPE"):
            update_directory.parse_official_feed(
                utf16_doctype, source, {}, "2026-08-26"
            )

    def test_official_feed_allows_html_doctype_inside_cdata(self) -> None:
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        body = b"""<rss><channel><item>
          <title>Introducing an AI assistant</title>
          <link>https://vendor.example/news/assistant</link>
          <description><![CDATA[<!DOCTYPE html><p>A personal AI assistant.</p>]]></description>
          <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate>
        </item></channel></rss>"""

        candidates = update_directory.parse_official_feed(
            body, source, {"general_ai_assistant": "assistant_system"}, "2026-08-26"
        )

        self.assertEqual(1, len(candidates))

    def test_official_feed_bounds_observations_without_rejecting_large_feeds(self) -> None:
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        items = "".join(
            f"""<item><title>Introducing AI assistant {index}</title>
              <link>https://vendor.example/news/assistant-{index}</link>
              <description>A personal AI assistant.</description>
              <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate></item>"""
            for index in range(150)
        )

        candidates = update_directory.parse_official_feed(
            f"<rss><channel>{items}</channel></rss>".encode(),
            source,
            {"general_ai_assistant": "assistant_system"},
            "2026-08-26",
        )

        self.assertEqual(update_directory.MAX_FEED_OBSERVATIONS, len(candidates))

    def test_official_feed_rejects_substring_signals_and_future_dates(self) -> None:
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        items = """<item><title>Renewing our AI assistant</title>
            <link>https://vendor.example/news/renewal</link>
            <description>A personal AI assistant.</description>
            <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate></item>
          <item><title>Newsroom update for our AI assistant</title>
            <link>https://vendor.example/news/update</link>
            <description>A personal AI assistant.</description>
            <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate></item>
          <item><title>Introducing an AI assistant</title>
            <link>https://vendor.example/news/future</link>
            <description>A personal AI assistant.</description>
            <pubDate>Wed, 26 Aug 2099 12:00:00 GMT</pubDate></item>"""

        candidates = update_directory.parse_official_feed(
            f"<rss><channel>{items}</channel></rss>".encode(),
            source,
            {"general_ai_assistant": "assistant_system"},
            "2026-08-26",
        )

        self.assertEqual([], candidates)

    def test_official_discovery_preserves_existing_candidate_by_url(self) -> None:
        previous = [{
            "repo": None,
            "url": "https://vendor.example/news/assistant/?utm_source=manual",
            "name": "Manual review",
        }]
        source = {
            "id": "vendor-ai",
            "name": "Vendor AI",
            "hub_url": "https://vendor.example/news",
            "feed_url": "https://vendor.example/feed.xml",
            "item_hosts": ["vendor.example"],
        }
        body = b"""<rss><channel><item><title>Introducing an AI assistant</title>
          <link>https://vendor.example/news/assistant</link>
          <description>A personal AI assistant.</description>
          <pubDate>Wed, 26 Aug 2026 12:00:00 GMT</pubDate>
        </item></channel></rss>"""

        candidates, new_count, successes, failures = update_directory.discover_official_candidates(
            previous,
            set(),
            [source],
            {"general_ai_assistant": "assistant_system"},
            "2026-08-26",
            getter=lambda _url, _hosts: body,
        )

        self.assertEqual(previous, candidates)
        self.assertEqual((0, 1, []), (new_count, successes, failures))

    def test_canonical_url_identity_preserves_non_tracking_query_bytes(self) -> None:
        key = update_directory.canonical_url_key(
            "https://Vendor.Example/item/?b=%2F&a=hello+world&%75tm_source=test#section"
        )

        self.assertEqual(
            "https://vendor.example/item?b=%2F&a=hello+world",
            key,
        )

    def test_feed_get_rejects_initial_and_redirect_hosts_outside_allowlist(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside"):
            update_directory.feed_get(
                "https://untrusted.example/feed.xml", {"vendor.example"}, attempts=1
            )

        handler = update_directory._AllowlistedRedirectHandler({"vendor.example"})
        with self.assertRaisesRegex(urllib.error.URLError, "redirect"):
            handler.redirect_request(
                urllib.request.Request("https://vendor.example/feed.xml"),
                None,
                302,
                "Found",
                {},
                "https://untrusted.example/feed.xml",
            )

    def test_all_official_source_failures_abort_before_writes(self) -> None:
        source_document = {
            "version": "1.0",
            "sources": [{
                "id": "vendor-ai",
                "name": "Vendor AI",
                "hub_url": "https://vendor.example/news",
                "feed_url": "https://vendor.example/feed.xml",
                "item_hosts": ["vendor.example"],
            }],
        }
        project_document = {"generated_at": "2026-08-25", "projects": [{"repo": "example/tool", "url": "https://github.com/example/tool"}]}
        documents = {
            update_directory.PROJECTS_PATH: project_document,
            update_directory.TAXONOMY_PATH: {"primary_roles": [{"id": "coding_agent", "family": "agent_system"}]},
            update_directory.DIRECTORY / "exclusions.json": {"entries": []},
            update_directory.DISCOVERY_SOURCES_PATH: source_document,
            update_directory.CANDIDATES_PATH: {"candidates": []},
            update_directory.LICENSE_REVIEW_PATH: {"entries": []},
        }

        with (
            mock.patch.object(update_directory, "load_json", side_effect=lambda path, default=None: documents.get(path, default)),
            mock.patch.object(update_directory, "refresh_projects", return_value=(1, [], [])),
            mock.patch.object(update_directory, "discover_candidates", return_value=([], 0, 1, [])),
            mock.patch.object(update_directory, "discover_official_candidates", return_value=([], 0, 0, ["offline"])),
            mock.patch.object(update_directory, "write_json") as write_json,
            mock.patch.object(update_directory, "sync_web_data") as synchronize,
        ):
            result = update_directory.main()

        self.assertEqual(1, result)
        write_json.assert_not_called()
        synchronize.assert_not_called()


if __name__ == "__main__":
    unittest.main()
