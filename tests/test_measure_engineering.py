from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import measure_engineering as measure

ROOT = Path(__file__).resolve().parents[1]

# The report reads the real tree, so these assert against it rather than a fixture:
# the point of the script is that it describes this repository, and a test that
# passed against invented input would pass just as well if the real reading broke.
APP_JS = ROOT / "web" / "app.js"
APP_CORE = ROOT / "web" / "app-core.js"
VALIDATOR = ROOT / "scripts" / "validate_directory.py"


class EngineeringMeasurementTests(unittest.TestCase):
    def test_reads_the_real_tree(self) -> None:
        """A report that measured nothing would still print a confident table."""
        data = measure.report()
        self.assertIn("javascript", data)
        self.assertIn("python", data)
        self.assertIn("ratchet", data)
        app = next(
            entry for entry in data["javascript"] if entry["path"] == "web/app.js"
        )
        self.assertGreater(app["lines"], 0)
        self.assertGreater(app["module_level_declarations"], 0)
        self.assertIsNone(
            app["exports"], "app.js is a classic script and exports nothing"
        )

    def test_global_bindings_are_column_zero_only(self) -> None:
        """The scope claim rests on indent, so an indented declaration must not count.

        `dataDate` is declared two spaces in, inside `bootstrap`, and is a
        function-local binding. If the count took any indent it would report a
        closure as a global, and CR-18's "shared globals" premise would rest on a
        miscount.
        """
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "sample.js"
            target.write_text(
                "const outer = 1;\nfunction fn() {\n  const inner = 2;\n  return inner;\n}\n",
                encoding="utf-8",
            )
            self.assertEqual(2, measure.module_level_declarations(target))
            names = measure.declared_names(target)
        self.assertIn("outer", names)
        self.assertIn("inner", names, "anchor resolution asks existence, not scope")
        self.assertIn("dataDate", measure.declared_names(APP_JS))

    def test_python_facts_count_accumulators_from_the_signature(self) -> None:
        """`errors` is counted as a declared parameter, in any position.

        CR-19's argument is about how many validators take the out-parameter, so
        the count has to come from the signature rather than the body: a function
        that never appends to it still carries the coupling.
        """
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "mod.py"
            target.write_text(
                "def one(errors):\n    pass\n"
                "def two(*, errors: list[str]):\n    pass\n"
                "def three(path):\n    pass\n"
                "def four(errors, path):\n    pass\n"
                "def outer():\n    def inner(errors):\n        pass\n    return inner\n",
                encoding="utf-8",
            )
            with patch.object(measure, "live_max_complexity", return_value=("none", 0)):
                facts = measure.python_facts(target)
        # Six functions: four top-level plus `inner` nested inside `outer`. Four of
        # them take `errors` — `one`, `two` (keyword-only), `four`, and the nested
        # one — which is the whole point of reading the signature rather than the
        # body: `four` never appends to it and still carries the coupling.
        self.assertEqual(6, facts.functions)
        self.assertEqual(4, facts.error_accumulators)
        self.assertEqual("67%", facts.error_accumulator_share)

    def test_share_of_zero_functions_is_not_a_division_error(self) -> None:
        """An empty module reports 0% rather than raising."""
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "empty.py"
            target.write_text("x = 1\n", encoding="utf-8")
            with patch.object(measure, "live_max_complexity", return_value=("none", 0)):
                facts = measure.python_facts(target)
        self.assertEqual("0%", facts.error_accumulator_share)

    def test_live_complexity_comes_from_ruff_not_a_reimplementation(self) -> None:
        """The live maximum is ruff's number, and it names the function holding it.

        A hand-rolled mccabe disagrees with ruff by a wide margin, so computing it
        here would make the ratchet assertion test something other than what the
        linter enforces. Ruff is asked at a threshold of 1 so every function is
        reported and the maximum comes from sorting.
        """
        name, score = measure.live_max_complexity(VALIDATOR)
        self.assertGreater(score, 0)
        self.assertTrue(name, "a nonzero maximum must name the function carrying it")
        configured = measure.configured_ratchet()
        self.assertLessEqual(
            score,
            configured,
            f"live maximum {score} in {name} exceeds the configured ratchet {configured}",
        )

    def test_configured_ratchet_is_read_from_pyproject(self) -> None:
        """The ratchet value comes from the file that configures it.

        Read from the `[tool.ruff.lint.mccabe]` section specifically, so a
        `max-complexity` under some other table cannot be mistaken for it.
        """
        text = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
        section = text.split("[tool.ruff.lint.mccabe]", 1)[-1]
        self.assertIn("max-complexity", section)
        self.assertGreater(measure.configured_ratchet(), 0)

    def test_missing_pyproject_section_is_an_error_not_a_silent_default(self) -> None:
        """A renamed section must fail loudly rather than report no ratchet."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "pyproject.toml").write_text("[tool.ruff]\n", encoding="utf-8")
            with patch.object(measure, "ROOT", root), self.assertRaises(SystemExit):
                measure.configured_ratchet()

    def test_export_count_loads_the_module(self) -> None:
        """`app-core.js`'s published names are counted the way Node sees them.

        Counting declarations instead reported 114 where the module publishes 80,
        a figure repeated in the review, a commit message, and a pull request body.
        The distinction is the whole reason this function calls out to Node.
        """
        count = measure.node_export_count(APP_CORE)
        self.assertGreater(count, 0)
        # A file Node cannot load is a broken tree, so it exits with a message
        # rather than reporting zero published names.
        with self.assertRaises(SystemExit):
            measure.node_export_count(ROOT / "web" / "no_such_module.js")

    def test_anchors_flag_a_renamed_symbol(self) -> None:
        """A renamed symbol fails; an unchanged one does not."""
        section = "- [ ] Item. `syncMatchSort` (313) sorts.\n"
        self.assertEqual([], measure.javascript_anchor_failures(section))
        renamed = "- [ ] Item. `syncMatchSortGone` (313) sorts.\n"
        failures = measure.javascript_anchor_failures(renamed)
        self.assertEqual(1, len(failures))
        self.assertIn("syncMatchSortGone", failures[0])

    def test_anchors_accept_both_shapes(self) -> None:
        """`name` (933) and `name` at 2780 are both anchors, both resolvable."""
        for line in (
            "- [ ] Item. `syncMatchSort` (313) sorts.\n",
            "- [ ] Item. `RECORD_DIALOGS` at 2780 is the model.\n",
            "- [ ] Item. `renderSearchSurfaces` (1842) repaints.\n",
        ):
            self.assertEqual([], measure.javascript_anchor_failures(line), line)
        # A number with no symbol beside it is prose, not an anchor.
        self.assertEqual(
            [], measure.javascript_anchor_failures("- [ ] Eleven edits.\n")
        )

    def test_python_anchors_resolve_against_scripts(self) -> None:
        """A bare `mod.py` resolves under scripts/, and a line past the end fails."""
        ok = f"- [ ] Item. `run_directory_refresh.py:{_validator_line()}` collapses.\n"
        self.assertEqual([], measure.python_line_anchor_failures(ok))
        self.assertEqual(
            [],
            measure.python_line_anchor_failures(
                "- [ ] `scripts/validate_directory.py:1` opens.\n"
            ),
        )
        missing = measure.python_line_anchor_failures(
            "- [ ] Item. `no_such_module.py:12` collapses.\n"
        )
        self.assertEqual(1, len(missing))
        self.assertIn("does not exist", missing[0])
        past_end = measure.python_line_anchor_failures(
            "- [ ] Item. `run_directory_refresh.py:999999` collapses.\n"
        )
        self.assertEqual(1, len(past_end))
        self.assertIn("past the end", past_end[0])

    def test_global_scope_gate_detects_an_encapsulated_file(self) -> None:
        """CR-18's premise is asserted, and its absence is a failure.

        A file whose only declaration is indented has no global bindings, so the
        finding's "classic script sharing globals" description no longer fits it.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            web = root / "web"
            web.mkdir()
            (web / "app.js").write_text("  const indented = 1;\n", encoding="utf-8")
            with patch.object(measure, "ROOT", root):
                failures = measure.global_scope_holds()
        self.assertEqual(1, len(failures))
        self.assertIn("global scope", failures[0])

    def test_global_scope_gate_passes_on_this_tree(self) -> None:
        """The premise holds today, so a failure means the file changed shape."""
        self.assertEqual([], measure.global_scope_holds())

    def test_backlog_section_is_the_engineering_debt_group(self) -> None:
        """The section is read from the live file, not a copy of it."""
        section = measure.engineering_debt_section()
        self.assertIn("CR-19", section)
        self.assertNotIn("AI systems papers", section)
        self.assertEqual([], measure.javascript_anchor_failures(section))
        self.assertEqual([], measure.python_line_anchor_failures(section))

    def test_report_renders_every_target(self) -> None:
        """The human-facing report names each file and the ratchet verdict."""
        rendered = measure.render(measure.report())
        for path in ("web/app.js", "web/app-core.js", "scripts/validate_directory.py"):
            self.assertIn(path, rendered)
        self.assertIn("complexity ratchet:", rendered)
        self.assertIn("errors accumulator", rendered)

    def test_json_output_is_valid_and_complete(self) -> None:
        """`--json` is the machine-readable path other tools would read."""
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = measure.main(["--json"])
        self.assertEqual(0, code)
        data = json.loads(buffer.getvalue())
        self.assertIn("ratchet", data)
        ratchet = data["ratchet"]
        self.assertIn("configured_max_complexity", ratchet)
        self.assertIn("live_max_complexity_value", ratchet)
        self.assertIn("live_max_complexity_function", ratchet)

    def test_plain_report_exits_zero_even_over_budget(self) -> None:
        """The report never fails on a number; only `--ratchet` gates."""
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.assertEqual(0, measure.main([]))
        self.assertIn("engineering facts", buffer.getvalue())

    def test_ratchet_flag_gates_an_undercut_ratchet(self) -> None:
        """An undercut ratchet is the one thing that must fail, and does."""
        buffer = io.StringIO()
        with (
            contextlib.redirect_stdout(buffer),
            patch.object(measure, "configured_ratchet", return_value=1),
            contextlib.redirect_stderr(io.StringIO()) as errors,
        ):
            self.assertEqual(1, measure.main(["--ratchet"]))
        self.assertIn("exceeds the configured ratchet", errors.getvalue())

    def test_ratchet_flag_passes_on_this_tree(self) -> None:
        """The gate is green here, so a red one means something changed."""
        with (
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(0, measure.main(["--ratchet"]))


def _validator_line() -> int:
    """The line in run_directory_refresh.py the backlog cites as the collapsed exit."""
    text = (ROOT / "scripts" / "run_directory_refresh.py").read_text(encoding="utf-8")
    for number, line in enumerate(text.splitlines(), start=1):
        if "any_check_failed or publish_failed or openrouter_failed" in line:
            return number
    raise AssertionError(
        "the collapsed exit line is gone from run_directory_refresh.py"
    )


if __name__ == "__main__":
    unittest.main()
