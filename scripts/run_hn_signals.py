#!/usr/bin/env python3
"""Orchestrate one attention-source signal run: prepare pinned pages, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/hn-signals.md. Everything here is mechanical. See ADR 028:
a signal is a pointer, never a claim, and this routine may add an assessment of one but
may never write a classification.
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

QUEUE = "directory/hn-signals.json"
BUNDLE = ".hn-signal-bundle/bundle.json"
ALLOWED_CHANGES = {QUEUE}
WORKTREE = ROOT.parent / "atlas-hn-signals"
PROMPT = ROOT / "docs" / "routines" / "hn-signals.md"
INSTALLED_PROMPT = Path.home() / ".claude" / "scheduled-tasks" / "hn-signals" / "SKILL.md"

MISSING = object()

CHECKS = (
    ["uv", "run", "python", "scripts/validate_directory.py"],
    ["uv", "run", "python", "scripts/verify_signal_pages.py", "--recheck"],
    ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
    ["uv", "run", "ruff", "check", "scripts", "tests"],
)


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


def signal_field_changes(key: str, old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Permit exactly one change per signal: adding an assessment where none existed."""
    problems: list[str] = []
    for field in sorted(set(old) | set(new)):
        was = old.get(field, MISSING)
        now = new.get(field, MISSING)
        if was == now:
            continue
        # `was is MISSING` matters: overwriting an existing assessment is an edit to
        # a proposal a human may already have read, not a new proposal.
        if field == "assessment" and was is MISSING:
            continue
        problems.append(
            f"the signal {key!r} field {field!r} is human review's and the run changed it"
        )
    return problems


def index_signals(signals: Any, side: str) -> tuple[dict[str, dict[str, Any]], list[str]]:
    indexed: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    if not isinstance(signals, list):
        return indexed, [f"{side}: signals is not a list"]
    for signal in signals:
        if not isinstance(signal, dict) or not isinstance(signal.get("story_id"), str):
            problems.append(f"{side}: a signal has no story_id")
            continue
        if signal["story_id"] in indexed:
            problems.append(f"{side}: duplicate signal {signal['story_id']!r}")
        indexed[signal["story_id"]] = signal
    return indexed, problems


def unexpected_field_changes(before: str, after: str) -> list[str]:
    """Compare two revisions of the queue and report every change the routine may not make."""
    problems: list[str] = []
    try:
        old_document = json.loads(before)
        new_document = json.loads(after)
    except json.JSONDecodeError as error:
        return [f"the queue is not valid JSON: {error}"]
    if not isinstance(old_document, dict) or not isinstance(new_document, dict):
        return ["the queue is not an object"]

    problems.extend(
        f"the run changed the document field {key!r}"
        for key in sorted(set(old_document) | set(new_document))
        if key != "signals" and old_document.get(key, MISSING) != new_document.get(key, MISSING)
    )
    old, old_problems = index_signals(old_document.get("signals"), "origin/main")
    new, new_problems = index_signals(new_document.get("signals"), "the run")
    problems.extend(old_problems + new_problems)
    problems.extend(
        f"the run added the signal {key!r}; only the sweep adds to the queue"
        for key in sorted(set(new) - set(old))
    )
    problems.extend(
        f"the run removed the signal {key!r}; only a human resolves a signal"
        for key in sorted(set(old) - set(new))
    )
    for key in sorted(set(old) & set(new)):
        problems.extend(signal_field_changes(key, old[key], new[key]))
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
        return "the installed routine prompt differs from docs/routines/hn-signals.md"
    return None


def bundled_story_ids(worktree: Path) -> set[str]:
    """The story ids whose page actually verified and reached the bundle.

    `verify_signal_pages --refresh` writes only the pages whose re-fetch matched the
    committed digest, so the bundle's keys are the run's verified set. A missing or
    unreadable bundle means nothing verified.
    """
    try:
        bundle = json.loads((worktree / BUNDLE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    return set(bundle) if isinstance(bundle, dict) else set()


def drifted_story_ids(signals: list[dict[str, Any]], bundled: set[str]) -> list[str]:
    """Readable signals whose page did not survive re-fetch, so no text was bundled.

    A signal that the sweep could not read is not drift: it carries no digest to
    re-check, and the routine dispositions it `unreadable` from the queue alone.
    """
    return sorted(
        str(signal.get("story_id"))
        for signal in signals
        if signal.get("page_status") == "readable" and str(signal.get("story_id")) not in bundled
    )


def pending_story_ids(signals: list[dict[str, Any]], drifted: list[str], limit: int) -> list[str]:
    """Signals awaiting an assessment, minus the ones nothing can be said about.

    A drifted page is both unreadable to the routine and barred from the `unreadable`
    verdict, whose rule turns on `page_status`. Listing it as pending would ask for an
    assessment no valid block could express.
    """
    return [
        str(signal.get("story_id"))
        for signal in signals
        if "assessment" not in signal and str(signal.get("story_id")) not in set(drifted)
    ][:limit]


def prepare(*, limit: int = 40, run=shell) -> int:
    """Refresh an isolated worktree from origin/main and build the signal-page bundle."""
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
    code, output = run(
        ["uv", "run", "python", "scripts/verify_signal_pages.py", "--refresh"], WORKTREE
    )
    print(output)
    try:
        document = json.loads((WORKTREE / QUEUE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"error: could not read {QUEUE} from the worktree: {error}", file=sys.stderr)
        return 1
    signals = [signal for signal in document.get("signals", []) if isinstance(signal, dict)]
    bundled = bundled_story_ids(WORKTREE)
    drifted = drifted_story_ids(signals, bundled)
    # A day's batch is not all-or-nothing. `verify_signal_pages` exits non-zero when any
    # one page drifted, and propagating that discarded every other page in the run — a
    # single vendor edit costing the whole day. The drifted page is already absent from
    # the bundle, so the routine cannot read it; that is the whole remedy needed here.
    # `finish --recheck` stays strict: nothing is committed while a pin is unverified.
    if code != 0 and not bundled:
        print(
            "error: no signal page verified against its recorded digest; nothing to assess",
            file=sys.stderr,
        )
        return code
    if drifted:
        print(
            f"warning: {len(drifted)} page(s) changed since the sweep and were omitted "
            f"from the bundle: {drifted}",
            file=sys.stderr,
        )
    pending = pending_story_ids(signals, drifted, limit)
    print(f"worktree ready: {WORKTREE}")
    print(f"pending signals ({len(pending)} of up to {limit}): {pending}")
    return 0


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
        print("no signal assessments to commit")
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
    commands = [["git", "checkout", "-B", "hn-signals/pending"]]
    if dirty:
        commands = [
            ["git", "add", QUEUE],
            ["git", "checkout", "-B", "hn-signals/pending"],
            ["git", "commit", "-m", f"Propose signal review for {date.today().isoformat()}"],
        ]
    for command in commands:
        code, output = run(command, WORKTREE)
        if code != 0:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    print("committed signal assessments")
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
