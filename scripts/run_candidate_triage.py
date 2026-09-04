#!/usr/bin/env python3
"""Orchestrate one candidate-triage run: prepare evidence, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/candidate-triage.md. Everything here is mechanical.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

QUEUE = "directory/candidates.json"
ALLOWED_CHANGES = {QUEUE}

# The only fields the routine may write. Everything else in a candidate record —
# classification, confidence, status, the membership of the queue itself — belongs to
# human review under docs/CURATION.md, and a file-level guard cannot tell the difference.
NULLABLE_WHEN_HELD = ("proposed_system_family", "proposed_primary_role")
MISSING = object()

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
        if " -> " in path:  # a rename reports "old -> new"; both ends are a change
            for side in path.split(" -> ", 1):
                if side.strip() not in ALLOWED_CHANGES:
                    changed.append(side.strip())
            continue
        if path not in ALLOWED_CHANGES:
            changed.append(path)
    return changed


def candidate_key(candidate: dict[str, Any]) -> str:
    """Identify a candidate the same way the queue and the evidence harness do."""
    return str(candidate.get("repo") or candidate.get("url") or "").lower()


def index_candidates(candidates: Any, side: str) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Key a candidate list for comparison, refusing anything it cannot compare reliably."""
    if not isinstance(candidates, list):
        return {}, [f"{side}: candidates must be a list"]
    indexed: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    for position, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            problems.append(f"{side}: the candidate at position {position} is not an object")
            continue
        key = candidate_key(candidate)
        if not key:
            problems.append(
                f"{side}: the candidate at position {position} has neither a repo nor a url"
            )
        elif key in indexed:
            problems.append(f"{side}: more than one candidate is keyed {key!r}")
        else:
            indexed[key] = candidate
    return indexed, problems


def candidate_field_changes(key: str, old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Report every field of one candidate the routine changed but may not."""
    added_block = new.get("triage") if "triage" not in old else None
    held = isinstance(added_block, dict) and bool(added_block.get("held_by"))
    problems: list[str] = []
    for field in sorted(set(old) | set(new)):
        was, now = old.get(field, MISSING), new.get(field, MISSING)
        if was == now:
            continue
        if field == "triage" and was is MISSING:
            continue  # adding a block to a candidate that lacks one is the routine's whole job
        if field in NULLABLE_WHEN_HELD and now is None and held:
            continue  # a held record may wait for a collection that does not exist yet
        problems.append(f"candidate {key}: {field!r} is human review's field and the run changed it")
    return problems


def unexpected_field_changes(before: str, after: str) -> list[str]:
    """Report every change to the queue beyond the two the routine is permitted to make.

    Permitted: adding a `triage` block to a candidate that has none, and nulling
    `proposed_system_family` / `proposed_primary_role` on a candidate whose new block
    names the decision holding it. Everything else — a rewritten classification, a nudged
    confidence, a changed status, an added or deleted candidate — is a human's, and the
    blast-radius check cannot see it because it all lands in the one permitted file.
    """
    try:
        old_document, new_document = json.loads(before), json.loads(after)
    except json.JSONDecodeError as exc:
        return [f"{QUEUE} is not valid JSON: {exc}"]
    if not isinstance(old_document, dict) or not isinstance(new_document, dict):
        return [f"{QUEUE} must be a JSON object"]
    problems = [
        f"the run changed the document field {key!r}"
        for key in sorted(set(old_document) | set(new_document))
        if key != "candidates" and old_document.get(key, MISSING) != new_document.get(key, MISSING)
    ]
    old, old_problems = index_candidates(old_document.get("candidates"), "origin/main")
    new, new_problems = index_candidates(new_document.get("candidates"), "the run")
    problems.extend(old_problems + new_problems)
    problems.extend(
        f"the run added the candidate {key!r}; only discovery adds to the queue"
        for key in sorted(set(new) - set(old))
    )
    problems.extend(
        f"the run removed the candidate {key!r}; only a human resolves a candidate"
        for key in sorted(set(old) - set(new))
    )
    for key in sorted(set(old) & set(new)):
        problems.extend(candidate_field_changes(key, old[key], new[key]))
    return problems


def worktree_text(path: str) -> str:
    """Read a file out of the run's worktree. Injected in tests, which have no worktree."""
    return (WORKTREE / path).read_text(encoding="utf-8")


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


def unexpected_committed_changes(name_only: str) -> list[str]:
    """Paths a commit already on the branch touched that the routine may not write.

    A clean working tree proves nothing on its own: an agent that commits its own edit
    leaves `git status` empty while the change rides on the branch the reviewer merges.
    """
    return [
        line.strip() for line in name_only.splitlines()
        if line.strip() and line.strip() not in ALLOWED_CHANGES
    ]


def finish(*, run=shell, read=worktree_text) -> int:
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
    # --no-renames so a rename shows as a delete and an add, putting both paths in front
    # of the guard rather than only the destination.
    diff_code, committed = run(
        ["git", "diff", "--name-only", "--no-renames", "origin/main", "HEAD"], WORKTREE
    )
    if diff_code != 0:
        print("error: could not diff HEAD against origin/main", file=sys.stderr)
        return 1
    forbidden_commits = unexpected_committed_changes(committed)
    if forbidden_commits:
        print(
            f"error: a commit on this branch touched files the run may not write: "
            f"{forbidden_commits}",
            file=sys.stderr,
        )
        return 1
    show_code, before = run(["git", "show", f"origin/main:{QUEUE}"], WORKTREE)
    if show_code != 0:
        print(f"error: could not read {QUEUE} from origin/main\n{before}", file=sys.stderr)
        return 1
    try:
        after = read(QUEUE)
    except OSError as exc:
        print(f"error: could not read {QUEUE} from the worktree: {exc}", file=sys.stderr)
        return 1
    overreach = unexpected_field_changes(before, after)
    if overreach:
        print("error: the run wrote outside the fields it may write:", file=sys.stderr)
        for problem in overreach:
            print(f"  {problem}", file=sys.stderr)
        return 1
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
