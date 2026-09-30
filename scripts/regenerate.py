#!/usr/bin/env python3
"""The one command that regenerates or checks every generated file under web/.

The order lives here rather than in prose because prose drifts. `AGENTS.md` carried a
four-step sequence that omitted `build_logos.mjs`, `build_fonts.mjs`, and
`build_blog.py` entirely, so following the documented steps after a rebase left three
generated files stale — and the freshness hooks that would have said so were only
reached at push time, or not at all behind `--no-verify`. On 2026-09-30 that is exactly
how `web/logos.json` reached CI carrying a package version CI did not install.

Order is a real constraint, not a preference. `sync_web_data.py` mirrors the canonical
catalog into `web/`, and every generator after it reads those mirrors rather than
`directory/`: `build_logos.mjs` resolves record names from `web/*.json`, so a logos
build before a sync invents or loses marks.
`build_asset_version.mjs` is deliberately absent. It writes no committed file: committed
pages carry the `?v=BUILD` placeholder and the deploy job writes the hashes, per
[ADR 050](../../docs/adr/050-committed-pages-carry-an-asset-version-placeholder.md).
Running it here would contradict that, and its `--check` is kept as a separate guard
against a deploy build being committed -- a different failure from a stale tree, which is
why folding the two together would make one read as the other.

Two modes, because checking and generating are different acts and conflating them is
how a stale artifact gets blessed. Plain `regenerate.py` rewrites the tree.
`--check` writes nothing, runs every step in the same order, and reports **all** the
failures rather than stopping at the first, so one run tells you everything that needs
regenerating. Regeneration and validation are separately wired in `.pre-commit-config.yaml`
so the cheap gate cannot be skipped along with the browser suite.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# (label, argv) in dependency order. Node steps are called through `node` because the
# vendoring generators are .mjs and the Python ones would otherwise need a second entry
# per interpreter.
STEPS: list[tuple[str, list[str]]] = [
    ("sync catalog mirrors", ["uv", "run", "python", "scripts/sync_web_data.py"]),
    ("app payloads", ["uv", "run", "python", "scripts/build_web_payload.py"]),
    ("share pages", ["uv", "run", "python", "scripts/build_share_pages.py"]),
    ("card marks", ["node", "scripts/build_logos.mjs"]),
    ("web fonts", ["node", "scripts/build_fonts.mjs"]),
    ("blog", ["uv", "run", "python", "scripts/build_blog.py"]),
]


def run(label: str, argv: list[str], check: bool) -> tuple[bool, str]:
    command = [*argv, "--check"] if check else argv
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode == 0:
        return True, ""
    detail = (result.stdout + result.stderr).strip()
    return False, f"{label}: {detail}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report every stale generated file without writing",
    )
    args = parser.parse_args()

    started = time.monotonic()
    failures: list[str] = []
    for label, argv in STEPS:
        ok, detail = run(label, argv, args.check)
        verb = "checked" if args.check else "generated"
        if ok:
            print(f"  {verb:<10} {label}")
        else:
            print(f"  {'STALE' if args.check else 'FAILED':<10} {label}")
            failures.append(detail)

    if failures:
        print(f"\n{len(failures)} of {len(STEPS)} generated trees are not current:")
        for failure in failures:
            # The generators explain themselves; keep their message and add where it came
            # from, because several of them share a first line of prose.
            for line in failure.splitlines():
                print(f"  {line}")
        remedy = (
            "run `uv run python scripts/sync_web_data.py` and each generator above"
            if args.check
            else "fix the failing generator, then regenerate"
        )
        print(f"\nTo bring the tree current: {remedy}")
        return 1

    mode = "current" if args.check else "regenerated"
    print(
        f"\nall {len(STEPS)} generated trees are {mode} in {time.monotonic() - started:.1f}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
