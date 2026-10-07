from __future__ import annotations

import contextlib
import io
import unittest
from unittest.mock import patch

from scripts import run_content_checks as checks


def selected_ids(*scopes: str) -> list[str]:
    return [test.id() for test in checks.iter_tests(checks.build_suite(scopes))]


class ContentCheckSelectionTests(unittest.TestCase):
    def test_docs_keep_links_prose_counts_and_skill_contracts(self) -> None:
        selected = selected_ids("docs")
        for name in (
            "tests.test_documentation.DocumentationTests.test_relative_markdown_links_resolve",
            "tests.test_documentation.DocumentationTests.test_adr_numbers_are_unique_and_match_their_titles",
            "tests.test_documentation.DocumentationTests.test_coverage_snapshot_quotes_generated_counts",
            "tests.test_measure_engineering.EngineeringMeasurementTests.test_backlog_section_is_the_engineering_debt_group",
            "tests.test_skill.SkillTests.test_skill_manifest_has_required_frontmatter",
            "tests.test_directory.DirectoryTests.test_agent_documents_name_the_robots_endpoint",
        ):
            self.assertIn(name, selected)

    def test_catalog_keeps_live_record_and_generated_contracts(self) -> None:
        selected = selected_ids("catalog")
        for name in (
            "tests.test_directory.DirectoryTests.test_projects_have_unique_ids_and_reviewed_source_models",
            "tests.test_web_payload.WebPayloadTests.test_every_published_field_lands_in_boot_or_detail",
            "tests.test_share_pages.SharePageTests.test_every_record_gets_a_page_plus_sitemap_and_robots",
            "tests.test_review_age.RealCatalogTests.test_every_reviewed_record_appears_once_and_no_file_changes",
            "tests.test_documentation.DocumentationTests.test_coverage_snapshot_quotes_generated_counts",
            "tests.test_import_openrouter.MatchingTests.test_the_committed_catalog_indexes_every_source_row_and_review",
        ):
            self.assertIn(name, selected)

    def test_web_keeps_css_boot_navigation_and_footer_contracts(self) -> None:
        selected = selected_ids("web")
        for name in (
            "tests.test_documentation.DocumentationTests.test_every_corner_in_the_stylesheet_comes_from_a_radius_token",
            "tests.test_documentation.DocumentationTests.test_backlog_engineering_anchors_still_resolve",
            "tests.test_web_payload.WebPayloadCheckGateTests.test_boot_payload_list_matches_what_the_page_awaits",
            "tests.test_blog.HeaderTests.test_the_blog_header_mirrors_the_directory_navigation",
            "tests.test_blog.HeaderTests.test_footers_carry_the_directory_page_notices_verbatim",
            "tests.test_measure_engineering.EngineeringMeasurementTests.test_anchors_accept_both_shapes",
            "tests.test_measure_engineering.EngineeringMeasurementTests.test_global_scope_gate_passes_on_this_tree",
            "tests.test_measure_engineering.EngineeringMeasurementTests.test_export_count_loads_the_module",
        ):
            self.assertIn(name, selected)

    def test_workflows_keep_deployment_trust_contracts(self) -> None:
        self.assertEqual(
            {
                "tests.test_documentation.DocumentationTests.test_every_path_has_a_code_owner",
                "tests.test_documentation.DocumentationTests.test_pages_deploy_accepts_only_trusted_main_verification",
                "tests.test_documentation.DocumentationTests.test_pages_deploy_cannot_be_dispatched_by_hand",
            },
            set(selected_ids("workflows")),
        )

    def test_combined_scopes_run_each_test_once_with_classes_grouped(self) -> None:
        selected = selected_ids("web", "catalog", "docs", "web", "workflows")
        self.assertEqual(sorted(set(selected)), selected)
        self.assertEqual(set(selected_ids(*checks.CONTENT_TESTS)), set(selected))

    def test_implementation_regressions_do_not_enter_content_selection(self) -> None:
        selected = selected_ids(*checks.CONTENT_TESTS)
        self.assertFalse(any("test_run_hn_signals." in name for name in selected))
        self.assertFalse(any("test_candidate_evidence." in name for name in selected))
        self.assertFalse(any("test_run_content_checks." in name for name in selected))

    def test_unknown_scope_fails_instead_of_silently_selecting_nothing(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown content scopes: typo"):
            checks.build_suite(["typo"])

    def test_missing_test_fails_instead_of_silently_weakening_the_gate(self) -> None:
        with (
            patch.dict(
                checks.CONTENT_TESTS,
                {"broken": ("tests.test_skill.SkillTests.test_missing",)},
            ),
            self.assertRaisesRegex(ValueError, "could not be loaded"),
        ):
            checks.build_suite(["broken"])

    def test_empty_selection_fails(self) -> None:
        with self.assertRaisesRegex(ValueError, "selection is empty"):
            checks.build_suite([])


class ContentCheckCommandTests(unittest.TestCase):
    def test_no_scope_runs_all_content_checks(self) -> None:
        with (
            patch.object(
                checks, "build_suite", return_value=unittest.TestSuite()
            ) as build,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(0, checks.main([]))
        build.assert_called_once_with(tuple(checks.CONTENT_TESTS))

    def test_list_prints_deduplicated_ids_and_executes_no_tests(self) -> None:
        output = io.StringIO()
        with (
            contextlib.redirect_stdout(output),
            patch.object(checks.unittest, "TextTestRunner") as runner,
        ):
            self.assertEqual(
                0, checks.main(["--scope", "docs", "--scope", "docs", "--list"])
            )
        self.assertEqual(selected_ids("docs"), output.getvalue().splitlines())
        runner.assert_not_called()

    def test_test_failure_returns_nonzero(self) -> None:
        def fail() -> None:
            self.fail("deliberate content regression")

        with (
            patch.object(
                checks,
                "build_suite",
                return_value=unittest.TestSuite([unittest.FunctionTestCase(fail)]),
            ),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(1, checks.main(["--scope", "docs"]))

    def test_invalid_selection_reports_error_and_returns_two(self) -> None:
        output = io.StringIO()
        with (
            patch.object(
                checks, "build_suite", side_effect=ValueError("missing content test")
            ),
            contextlib.redirect_stderr(output),
        ):
            self.assertEqual(2, checks.main(["--list"]))
        self.assertIn("missing content test", output.getvalue())

    def test_unknown_cli_scope_is_rejected(self) -> None:
        with (
            contextlib.redirect_stderr(io.StringIO()),
            self.assertRaises(SystemExit) as error,
        ):
            checks.main(["--scope", "typo"])
        self.assertEqual(2, error.exception.code)


if __name__ == "__main__":
    unittest.main()
