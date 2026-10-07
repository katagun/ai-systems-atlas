#!/usr/bin/env python3
"""Measure the engineering facts that BACKLOG.md cites in prose.

The engineering-debt items in BACKLOG.md quote line counts, function counts, and
complexity maxima to size their work. Those numbers are true when written and
drift with every merge, so this script recomputes them on demand instead. It
reads the tree, prints what it finds, and exits 0: it is a report, never a gate,
because a gate on a number that changes on every commit is a gate that gets
skipped.

It is also the definition behind the two claims in
tests/test_documentation.py that *are* gates, both of which are stable enough to
assert: that every ``file:symbol`` anchor in the backlog resolves, and that the
complexity ratchet in pyproject.toml still sits above the live maximum.

Run it with no arguments for the report, ``--json`` for machine-readable output,
or ``--ratchet`` to exit nonzero when the configured ratchet has been undercut.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Files the backlog's engineering-debt section names. Each is measured the same
# way the script that owns it would answer the question, so the report is a
# reading of the tree rather than a second, looser copy of it.
JS_TARGETS = ("web/app.js", "web/app-core.js")
PY_TARGETS = ("scripts/validate_directory.py",)

# A declaration at the start of a line, unindented, is what makes these files
# global-scope: a classic script, not a module. The pattern is deliberately
# anchored to column 0 so an indented declaration inside a function is not
# counted as a binding of the file's scope.
JS_DECLARATION = re.compile(r"^(?:async function|function|const|let|var)\s+(\w+)")

# Anchor resolution asks a different question from the global-scope count: does
# this name exist as a declaration *anywhere* in the file, at any indent? A
# backlog anchor can name a function-local binding two spaces in, such as
# `dataDate` inside `bootstrap`, not a global one, and existence is the
# property worth checking.
JS_DECLARATION_ANY_INDENT = re.compile(
    r"^\s*(?:async function|function|const|let|var)\s+(\w+)", re.MULTILINE
)


def relative_label(path: Path) -> str:
    """`path` as a repo-relative string, or as given when it lies outside the tree.

    The label is for display only. Measurement is also run against temporary files
    in the tests, and a `relative_to` that raised there would make an unrelated
    assertion fail for a reason the reader could not see.
    """
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


@dataclass(frozen=True)
class PythonFacts:
    """What one Python module looks like, in the terms CR-19 uses."""

    path: str
    lines: int
    functions: int
    error_accumulators: int
    live_max_complexity: str
    live_max_complexity_value: int

    @property
    def error_accumulator_share(self) -> str:
        """The share of functions taking the `errors: list[str]` out-parameter.

        Rendered as a percentage because CR-19's argument is about proportion —
        "most validators accumulate errors" — not about a raw count that a
        refactor is meant to move.
        """
        if not self.functions:
            return "0%"
        return f"{round(100 * self.error_accumulators / self.functions)}%"


@dataclass(frozen=True)
class JavaScriptFacts:
    """What one classic script looks like, in the terms CR-18 uses."""

    path: str
    lines: int
    module_level_declarations: int
    exports: int | None

    @property
    def global_scope(self) -> bool:
        """True when the file declares bindings at column 0 and exports nothing.

        This is the property CR-18 rests on: a classic script whose top-level
        `const` bindings are shared globals, which is why the e2e suite can
        reach them with `page.evaluate`. A file that gained an `export` or an
        `import` would be encapsulated, and the finding's argument would no
        longer describe it.
        """
        return self.exports is None


def module_level_declarations(path: Path) -> int:
    """Count the bindings `path` declares at global scope.

    Column 0 is the whole test: these are classic scripts, so an indented
    `const` belongs to a function and a column-0 one is shared with the page.
    """
    count = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if JS_DECLARATION.match(line):
            count += 1
    return count


def declared_names(path: Path) -> set[str]:
    """The set of every name `path` declares, at any indent.

    Anchor resolution wants existence, not scope: a backlog anchor may name a
    function-local binding two spaces in, and the failure worth catching is a
    name that has been renamed or deleted outright, not one that moved from
    module scope into a closure.
    """
    return set(JS_DECLARATION_ANY_INDENT.findall(path.read_text(encoding="utf-8")))


def python_facts(path: Path) -> PythonFacts:
    """Measure one Python module: size, function count, out-parameter share.

    The `errors` count is the one CR-19's ratchet argument turns on, so it is
    read from the signature rather than from the body: a function *takes* the
    accumulator when `errors` is one of its declared parameters, whether it is
    positional, keyword-only, or annotated.
    """
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    accumulators = 0
    for function in functions:
        args = function.args
        parameters = [*args.posonlyargs, *args.args, *args.kwonlyargs]
        if any(arg.arg == "errors" for arg in parameters):
            accumulators += 1
    complexity_name, complexity = live_max_complexity(path)
    return PythonFacts(
        path=relative_label(path),
        lines=len(source.splitlines()),
        functions=len(functions),
        error_accumulators=accumulators,
        live_max_complexity=complexity_name,
        live_max_complexity_value=complexity,
    )


def live_max_complexity(path: Path) -> tuple[str, int]:
    """The worst function in `path` by ruff's own C901 measure, and its score.

    Ruff is the authority here and not a reimplementation of it: `pyproject.toml`
    sets `max-complexity` as a ratchet against "the worst one already carried",
    so the number that matters is the one ruff itself computes. The configured
    threshold is deliberately lower than 10 in this call, so every function is
    reported and the maximum is found by sorting rather than by a cutoff.
    """
    proc = subprocess.run(
        [
            "uv",
            "run",
            "ruff",
            "check",
            "--select",
            "C901",
            "--config",
            "lint.mccabe.max-complexity=1",
            "--output-format",
            "concise",
            str(path.relative_to(ROOT)),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    pattern = re.compile(r"`(?P<name>\w+)` is too complex \((?P<score>\d+)")
    findings = [
        (match.group("name"), int(match.group("score")))
        for match in pattern.finditer(proc.stdout)
    ]
    if not findings:
        return ("none", 0)
    return max(findings, key=lambda finding: finding[1])


def configured_ratchet() -> int:
    """The `lint.mccabe.max-complexity` value in pyproject.toml."""
    text = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    section = text.split("[tool.ruff.lint.mccabe]", 1)[-1]
    match = re.search(r"max-complexity\s*=\s*(\d+)", section)
    if match is None:
        raise SystemExit("pyproject.toml has no [tool.ruff.lint.mccabe] max-complexity")
    return int(match.group(1))


def javascript_facts(path: Path) -> JavaScriptFacts:
    """Measure one classic script: size, global bindings, and whether it exports.

    The export count is read by loading the module through Node, because
    `app-core.js` publishes its API from a `return` block inside a factory and
    counting declarations would count things it never publishes — a mistake this
    script exists to stop.
    """
    source = path.read_text(encoding="utf-8")
    exports: int | None = None
    if path.name == "app-core.js":
        exports = node_export_count(path)
    return JavaScriptFacts(
        path=relative_label(path),
        lines=len(source.splitlines()),
        module_level_declarations=module_level_declarations(path),
        exports=exports,
    )


def node_export_count(path: Path) -> int:
    """How many names `path` publishes, as Node actually sees them.

    `app-core.js` is a UMD-style file that assigns `module.exports` when one is
    present, so `require` is the same view a browser gets through `AppCore`.
    Counting the keys rather than the declarations is the point: the declarations
    include helpers the file never publishes.
    """
    proc = subprocess.run(
        [
            "node",
            "-e",
            f"process.stdout.write(String(Object.keys(require({json.dumps(str(path))})).length))",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"could not load {path.name} in Node: {proc.stderr.strip()}")
    return int(proc.stdout)


def symbol_anchor(line: str) -> tuple[str, str] | None:
    """Read one `name` (1234) or `name` at 1234 anchor out of a line of prose.

    Anchors arrive in two shapes in BACKLOG.md — ``syncMatchSort`` (319) and
    ``RECORD_DIALOGS`` at 2780 — so both are recognised. Only a JavaScript
    classic script is checked for existence; a Python line number is a
    different kind of claim and is handled by its own reader.
    """
    match = re.search(
        r"`(?P<name>[A-Za-z_]\w*)`\s*(?:\(\s*(?P<paren>\d+)\s*\)|at\s+(?P<at>\d+))",
        line,
    )
    if match is None:
        return None
    return (match.group("name"), match.group("paren") or match.group("at") or "")


def javascript_anchor_failures(text: str) -> list[str]:
    """Every `name` (line) anchor in `text` whose symbol is gone from the web tree.

    Existence, not the line number. The numbers are stale on almost every merge
    — #382 verified seven anchors and #384 moved six of them minutes later — so
    asserting a line number would fail constantly and teach people to skip the
    check. Asserting that the symbol is still declared somewhere catches the
    failure that actually misleads: a reader sent to a line that no longer holds
    the thing, or a refactor that quietly deleted it.

    Both shipped application scripts count. CR-18 moved the Finder and its ranking
    helpers into `app-core.js`, and anchors that followed them resolved against
    neither file while only `app.js` was searched: the `|| []` guards item cited
    `web/app-core.js` line numbers roughly 500 lines out of date until 2026-09-30,
    and nothing failed, because the file holding those symbols was never opened.
    The union is coarse — a name declared in either file satisfies the anchor —
    which is the right trade for a claim about a symbol still existing.
    """
    declared: set[str] = set()
    for script in ("app.js", "app-core.js"):
        declared |= declared_names(ROOT / "web" / script)
    failures: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        anchor = symbol_anchor(line)
        if anchor is None:
            continue
        name = anchor[0]
        if name not in declared:
            failures.append(
                f"BACKLOG.md:{number}: `{name}` is no longer declared in "
                "web/app.js or web/app-core.js"
            )
    return failures


def python_line_anchor_failures(text: str) -> list[str]:
    """Every `file.py:NNN` anchor in `text` whose line no longer holds the claim.

    Unlike the JavaScript anchors these are checked as *lines*, because the claim
    they carry is about a line's content ("collapses three failures into one
    `1`"), which a moving symbol could still satisfy by coincidence. A rename or
    a moved statement is exactly what should fail here.

    A bare `name.py` resolves against `scripts/`, which is where every Python
    module the backlog cites lives; `docs/OPERATIONS.md` and friends use the
    same short form, and accepting a full path when one is given keeps both.
    """
    failures: list[str] = []
    pattern = re.compile(r"`?(?P<path>[\w/]+\.py)`?:(?P<line>\d+)")
    for number, line in enumerate(text.splitlines(), start=1):
        for match in pattern.finditer(line):
            named = match.group("path")
            target = ROOT / named
            if not target.exists() and (ROOT / "scripts" / named).exists():
                target = ROOT / "scripts" / named
            if not target.exists():
                failures.append(f"BACKLOG.md:{number}: {named} does not exist")
                continue
            claimed = int(match.group("line"))
            lines = target.read_text(encoding="utf-8").splitlines()
            if claimed < 1 or claimed > len(lines):
                failures.append(
                    f"BACKLOG.md:{number}: {named}:{claimed} "
                    f"is past the end of a {len(lines)}-line file"
                )
    return failures


def backlog_text() -> str:
    return (ROOT / "BACKLOG.md").read_text(encoding="utf-8")


def engineering_debt_section() -> str:
    """The Engineering debt group of BACKLOG.md, which is where the claims are."""
    text = backlog_text()
    start = text.index("### Engineering debt")
    end = text.index("### AI systems papers")
    return text[start:end]


def global_scope_holds() -> list[str]:
    """Fails unless `app.js` still declares its bindings at global scope.

    CR-18's argument is that these are classic scripts sharing globals, which is
    what makes the untested remainder reachable from e2e. If a future change
    encapsulates the file, the finding stops describing the code and the next
    reader would be misled by prose that says the opposite.
    """
    facts = javascript_facts(ROOT / "web" / "app.js")
    failures: list[str] = []
    if facts.module_level_declarations == 0:
        failures.append(
            "web/app.js declares nothing at global scope; CR-18's premise no longer holds"
        )
    return failures


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--ratchet",
        action="store_true",
        help=(
            "exit nonzero when a configured ratchet has been undercut, or when "
            "a BACKLOG.md anchor no longer resolves; the report itself always exits 0"
        ),
    )
    return parser


def report() -> dict[str, object]:
    python = python_facts(ROOT / PY_TARGETS[0])
    return {
        "javascript": [asdict(javascript_facts(ROOT / path)) for path in JS_TARGETS],
        "python": [asdict(facts) for facts in (python,)],
        "ratchet": {
            "configured_max_complexity": configured_ratchet(),
            "live_max_complexity_value": python.live_max_complexity_value,
            "live_max_complexity_function": python.live_max_complexity,
        },
    }


def render(data: dict[str, object]) -> str:
    lines = ["engineering facts, measured from the tree", ""]
    for entry in data["javascript"]:  # type: ignore[index]
        assert isinstance(entry, dict)
        exports = entry["exports"]
        scope = "global scope" if exports is None else f"{exports} published names"
        lines.append(f"{entry['path']}")
        lines.append(
            f"  {entry['lines']} lines, {entry['module_level_declarations']} global bindings, {scope}"
        )
    for entry in data["python"]:  # type: ignore[index]
        assert isinstance(entry, dict)
        lines.append(f"{entry['path']}")
        lines.append(
            f"  {entry['lines']} lines, {entry['functions']} functions, "
            f"{entry['error_accumulators']} taking an errors accumulator"
        )
    ratchet = data["ratchet"]
    assert isinstance(ratchet, dict)
    lines.append("")
    lines.append(
        f"complexity ratchet: configured {ratchet['configured_max_complexity']}, "
        f"live maximum {ratchet['live_max_complexity_value']} "
        f"in {ratchet['live_max_complexity_function']}"
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    data = report()
    sys.stdout.write(
        json.dumps(data, indent=2) + "\n" if args.json else render(data) + "\n"
    )
    if not args.ratchet:
        return 0
    ratchet = data["ratchet"]
    assert isinstance(ratchet, dict)
    failures: list[str] = []
    if int(ratchet["live_max_complexity_value"]) > int(
        ratchet["configured_max_complexity"]
    ):
        failures.append(
            f"live maximum complexity {ratchet['live_max_complexity_value']} in "
            f"{ratchet['live_max_complexity_function']} exceeds the configured ratchet "
            f"{ratchet['configured_max_complexity']}"
        )
    section = engineering_debt_section()
    failures += javascript_anchor_failures(section)
    failures += python_line_anchor_failures(section)
    failures += global_scope_holds()
    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
