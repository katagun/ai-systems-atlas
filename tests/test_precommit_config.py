"""The browser unit-test hook gates on coverage; it does not only report it."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NodeCoverageFloorTests(unittest.TestCase):
    def hook_entry(self) -> str:
        config = (ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8")
        hook = re.search(r"- id: node-web-tests\n((?:[ \t]+.*\n|\n)*)", config)
        self.assertIsNotNone(hook, "node-web-tests hook not found")
        # `entry:` may be a folded block, so take every line up to the next key.
        entry = re.search(
            r"^ +entry:[ >-]*\n?((?:(?: {10,}).*\n)+|.*\n)", hook.group(1), re.M
        )
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


if __name__ == "__main__":
    unittest.main()
