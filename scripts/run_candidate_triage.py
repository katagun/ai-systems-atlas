#!/usr/bin/env python3
"""Orchestrate one candidate-triage run: prepare evidence, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/candidate-triage.md. Everything here is mechanical.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ALLOWED_CHANGES = {"directory/candidates.json"}

CHECKS = (
    ["uv", "run", "python", "scripts/build_candidate_evidence.py", "--recheck"],
    ["uv", "run", "python", "scripts/validate_directory.py"],
    ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
    ["uv", "run", "ruff", "check", "scripts", "tests"],
)

WORKTREE = ROOT.parent / "atlas-candidate-triage"
PROMPT = ROOT / "docs" / "routines" / "candidate-triage.md"
INSTALLED_PROMPT = Path.home() / ".claude" / "scheduled-tasks" / "candidate-triage" / "SKILL.md"


def unexpected_changes(porcelain: str) -> list[str]:
    """Return every path in `git status --porcelain` output the routine may not touch."""
    changed: list[str] = []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # a rename reports "old -> new"
            path = path.split(" -> ", 1)[1]
        if path not in ALLOWED_CHANGES:
            changed.append(path)
    return changed


def shell(command: list[str], cwd: Path | None = None) -> tuple[int, str]:
    finished = subprocess.run(command, capture_output=True, text=True, cwd=cwd)
    return finished.returncode, finished.stdout + finished.stderr


def prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs."""
    if installed_prompt is None:
        return "the routine prompt is not installed"
    if installed_prompt.strip() != repo_prompt.strip():
        return "the installed routine prompt differs from docs/routines/candidate-triage.md"
    return None


def prepare(*, limit: int, run=shell) -> int:
    """Refresh an isolated worktree from origin/main and build the evidence bundle."""
    installed = INSTALLED_PROMPT.read_text(encoding="utf-8") if INSTALLED_PROMPT.exists() else None
    drift = prompt_drift(PROMPT.read_text(encoding="utf-8"), installed)
    if drift:
        print(f"error: {drift}", file=sys.stderr)
        return 1
    steps = (
        (["git", "fetch", "--quiet", "origin"], False),
        # Removing a worktree that does not exist is expected on a first run.
        (["git", "worktree", "remove", "--force", str(WORKTREE)], True),
        (["git", "worktree", "add", "--quiet", "--detach", str(WORKTREE), "origin/main"], False),
    )
    for command, tolerate_failure in steps:
        code, output = run(command, ROOT)
        if code != 0 and not tolerate_failure:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    code, output = run([
        "uv", "run", "python", "scripts/build_candidate_evidence.py",
        "--limit", str(limit), "--previous-branch", "triage/pending",
    ], WORKTREE)
    print(output)
    if code == 0:
        print(f"worktree ready: {WORKTREE}")
    return code


def finish(*, run=shell) -> int:
    """Run every guard, then commit. Any failure aborts before the commit."""
    status_code, porcelain = run(["git", "status", "--porcelain"], WORKTREE)
    if status_code != 0:
        print("error: could not read git status", file=sys.stderr)
        return 1
    forbidden = unexpected_changes(porcelain)
    if forbidden:
        print(f"error: the run changed files it may not touch: {forbidden}", file=sys.stderr)
        return 1
    # A clean tree is not the same as an idle run: an agent that stages and commits its
    # own work leaves nothing in `git status` while its commit sits on the branch. The
    # guards must run against anything HEAD carries beyond origin/main, however it got there.
    head_code, head = run(["git", "rev-parse", "HEAD"], WORKTREE)
    base_code, base = run(["git", "rev-parse", "origin/main"], WORKTREE)
    if head_code != 0 or base_code != 0:
        print("error: could not compare HEAD against origin/main", file=sys.stderr)
        return 1
    dirty = bool(porcelain.strip())
    if not dirty and head.strip() == base.strip():
        print("no triage proposals to commit")
        return 0
    for command in CHECKS:
        code, output = run(list(command), WORKTREE)
        if code != 0:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    commands = [["git", "checkout", "-B", "triage/pending"]]
    if dirty:
        commands = [
            ["git", "add", "directory/candidates.json"],
            ["git", "checkout", "-B", "triage/pending"],
            ["git", "commit", "-m", f"Propose candidate triage for {date.today().isoformat()}"],
        ]
    for command in commands:
        code, output = run(command, WORKTREE)
        if code != 0:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    print("committed triage proposals")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "finish"))
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args(argv)
    if args.command == "prepare":
        return prepare(limit=args.limit)
    return finish()


if __name__ == "__main__":
    raise SystemExit(main())
