"""The pre-commit config gates on coverage and scopes its slow hooks by change."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts import ci_changes as ci

ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8")


def hook_block(hook_id: str) -> str:
    # Up to the next hook or repository entry, so a field is read from this hook
    # alone and never from the one declared after it.
    hook = re.search(
        rf"- id: {re.escape(hook_id)}\n((?:(?![ \t]*- (?:id|repo):).*\n)*)", CONFIG
    )
    assert hook is not None, f"{hook_id} hook not found"
    return hook.group(1)


def hook_field(block: str, key: str) -> str | None:
    match = re.search(rf"^ +{key}: *(.*)$", block, re.M)
    if match is None:
        return None
    value = match.group(1).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    return value


class NodeCoverageFloorTests(unittest.TestCase):
    def hook_entry(self) -> str:
        hook = hook_block("node-web-tests")
        # `entry:` may be a folded block, so take every line up to the next key.
        entry = re.search(r"^ +entry:[ >-]*\n?((?:(?: {10,}).*\n)+|.*\n)", hook, re.M)
        self.assertIsNotNone(entry, "node-web-tests entry not found")
        return " ".join(entry.group(1).split())

    def test_the_hook_sets_a_floor_for_lines_branches_and_functions(self) -> None:
        entry = self.hook_entry()
        self.assertIn("--experimental-test-coverage", entry)
        for kind in ("lines", "branches", "functions"):
            floor = re.search(rf"--test-coverage-{kind}=(\d+)", entry)
            self.assertIsNotNone(floor, f"no --test-coverage-{kind} floor")
            self.assertGreater(int(floor.group(1)), 0)

    def test_the_floor_measures_app_core_alone(self) -> None:
        # Left open, "all files" averages in tests/test_web.js and the asset-stamp
        # scripts, so app-core.js could lose coverage behind them.
        self.assertIn("--test-coverage-include=web/app-core.js", self.hook_entry())


# One path per class of change the classifier distinguishes. The Python suite's
# `files` pattern must agree with ci_changes.classify on every one of them, so a
# docs-only push skips the suite locally exactly when CI skips it, and a Python,
# tool-config, or unrecognised change runs it in both places.
CLASSIFIED_PATHS = (
    "docs/adr/057-the-atlas-is-the-reviewed-layer-over-the-inventories.md",
    "README.md",
    "directory/models.json",
    "web/app-core.js",
    "web/index.html",
    "web/styles.css",
    "blog/2026-09-14-changed-since-what.md",
    "skills/atlas/SKILL.md",
    "scripts/build_logos.mjs",
    "tests/test_web.js",
    "tests/e2e/landing.spec.js",
    "scripts/validate_directory.py",
    "tests/test_directory.py",
    "pyproject.toml",
    "uv.lock",
    "package-lock.json",
    ".pre-commit-config.yaml",
    "playwright.config.js",
    ".github/workflows/verify.yml",
    "LICENSE",
    "Makefile",
)


class ScopedPushHookTests(unittest.TestCase):
    def test_the_python_suite_runs_exactly_when_ci_would_run_it(self) -> None:
        block = hook_block("python-tests-coverage")
        self.assertIsNone(
            hook_field(block, "always_run"), "scope by files, not always_run"
        )
        pattern = hook_field(block, "files")
        self.assertIsNotNone(pattern, "python-tests-coverage has no files pattern")
        matcher = re.compile(pattern)
        for path in CLASSIFIED_PATHS:
            with self.subTest(path=path):
                expected, _lint_all = ci.classify([path])
                self.assertEqual(bool(matcher.search(path)), expected)

    def test_the_browser_suite_runs_for_what_the_browser_reads(self) -> None:
        block = hook_block("e2e-browser-tests")
        self.assertIsNone(
            hook_field(block, "always_run"), "scope by files, not always_run"
        )
        pattern = hook_field(block, "files")
        self.assertIsNotNone(pattern, "e2e-browser-tests has no files pattern")
        matcher = re.compile(pattern)
        runs = (
            "web/app.js",
            "web/app/models.json",
            "web/records/models/x.html",
            "directory/labs.json",
            "tests/e2e/landing.spec.js",
            "tests/e2e/helpers/finder.js",
            "playwright.config.js",
            "package-lock.json",
            "scripts/serve_web.py",
        )
        skips = (
            "docs/adr/057-the-atlas-is-the-reviewed-layer-over-the-inventories.md",
            "README.md",
            "scripts/validate_directory.py",
            "tests/test_directory.py",
            ".github/workflows/verify.yml",
        )
        for path in runs:
            with self.subTest(path=path, expected="run"):
                self.assertTrue(matcher.search(path))
        for path in skips:
            with self.subTest(path=path, expected="skip"):
                self.assertFalse(matcher.search(path))

    def test_content_contracts_run_on_every_commit_and_push(self) -> None:
        # When the Python suite is skipped, the documentation, catalog, and web
        # contracts it contains must still run somewhere locally, as CI runs them.
        block = hook_block("content-checks")
        self.assertEqual(hook_field(block, "always_run"), "true")
        self.assertIsNone(hook_field(block, "stages"))
        self.assertIn("scripts/run_content_checks.py", block)


if __name__ == "__main__":
    unittest.main()
