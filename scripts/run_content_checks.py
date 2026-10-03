#!/usr/bin/env python3
"""Run the live repository contracts without the Python implementation suite.

Documentation, catalog, and web edits can break assertions written in Python even
when no Python file changes. Keep those checks available independently of the
full regression suite and its coverage floor. The selections below name existing
tests; missing or renamed tests fail rather than silently reducing the gate.

No scopes means all content checks. Repeat --scope to narrow a local run, or use
--list to inspect the exact selection without running it.
"""

from __future__ import annotations

import argparse
import sys
import unittest
from collections.abc import Iterable, Iterator, Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def documentation_tests(*methods: str) -> tuple[str, ...]:
    return tuple(
        f"tests.test_documentation.DocumentationTests.{name}" for name in methods
    )


CONTENT_TESTS: dict[str, tuple[str, ...]] = {
    # This class deliberately includes cross-file contracts: prose can cite a
    # catalog count, a JavaScript symbol, or a Python complexity limit.
    "docs": (
        "tests.test_documentation.DocumentationTests",
        "tests.test_measure_engineering.EngineeringMeasurementTests",
        "tests.test_skill.SkillTests",
        "tests.test_directory.DirectoryTests.test_agent_documents_name_the_robots_endpoint",
    ),
    "catalog": (
        "tests.test_directory.DirectoryTests",
        "tests.test_web_payload.WebPayloadTests",
        "tests.test_share_pages.SharePageTests",
        "tests.test_review_age.RealCatalogTests",
        "tests.test_import_openrouter.MatchingTests.test_the_committed_catalog_indexes_every_source_row_and_review",
        "tests.test_validation_policy.ValidationPolicyTests.test_robot_taxonomy_groups_exist",
        *documentation_tests(
            "test_coverage_snapshot_quotes_generated_counts",
            "test_the_collection_registry_agrees_with_the_files_on_disk",
            "test_the_local_refresh_stages_every_directory_file_except_the_signal_queue",
        ),
    ),
    "web": (
        "tests.test_measure_engineering.EngineeringMeasurementTests",
        "tests.test_web_payload.WebPayloadTests",
        "tests.test_web_payload.WebPayloadCheckGateTests.test_boot_payload_list_matches_what_the_page_awaits",
        "tests.test_share_pages.SharePageTests",
        "tests.test_blog.HeaderTests",
        "tests.test_directory.DirectoryTests.test_web_data_matches_directory_data",
        "tests.test_directory.DirectoryTests.test_agent_documents_name_the_robots_endpoint",
        *documentation_tests(
            "test_relative_markdown_links_resolve",
            "test_backlog_engineering_anchors_still_resolve",
            "test_web_app_js_still_declares_global_bindings",
            "test_every_corner_in_the_stylesheet_comes_from_a_radius_token",
            "test_container_components_take_the_container_radius",
            "test_the_radius_scale_stays_sharp_and_ordered",
        ),
    ),
    "workflows": documentation_tests(
        "test_every_path_has_a_code_owner",
        "test_pages_deploy_accepts_only_trusted_main_verification",
        "test_pages_deploy_cannot_be_dispatched_by_hand",
    ),
}


def iter_tests(
    suite: Iterable[unittest.TestCase | unittest.TestSuite],
) -> Iterator[unittest.TestCase]:
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from iter_tests(test)
        else:
            yield test


def build_suite(scopes: Sequence[str]) -> unittest.TestSuite:
    unknown = sorted(set(scopes) - CONTENT_TESTS.keys())
    if unknown:
        raise ValueError(f"unknown content scopes: {', '.join(unknown)}")
    # A direct `python scripts/run_content_checks.py` starts with scripts/ on
    # sys.path; the root is needed for both tests.* and their scripts.* imports.
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    names = list(
        dict.fromkeys(name for scope in scopes for name in CONTENT_TESTS[scope])
    )
    loader = unittest.TestLoader()
    loaded = loader.loadTestsFromNames(names)
    if loader.errors:
        raise ValueError(
            "content test selection could not be loaded:\n" + "\n".join(loader.errors)
        )
    tests = {test.id(): test for test in iter_tests(loaded)}
    if not tests:
        raise ValueError("content test selection is empty")
    # Ordering by ID also keeps each class together so expensive setUpClass
    # fixtures run once when scopes share a class or an individual method.
    return unittest.TestSuite(tests[name] for name in sorted(tests))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", action="append", choices=CONTENT_TESTS)
    parser.add_argument(
        "--list", action="store_true", help="list test IDs without running them"
    )
    args = parser.parse_args(argv)
    try:
        suite = build_suite(args.scope or tuple(CONTENT_TESTS))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    if args.list:
        for test in iter_tests(suite):
            print(test.id())
        return 0
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
