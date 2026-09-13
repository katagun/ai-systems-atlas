#!/usr/bin/env python3
"""Orchestrate one candidate-triage run: prepare evidence, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/candidate-triage.md. Everything here is mechanical.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

try:
    from . import routine_guards
except ImportError:  # Direct script execution places scripts/ on sys.path.
    import routine_guards

ROOT = Path(__file__).resolve().parents[1]

QUEUE = "directory/candidates.json"
# Where `prepare` records the exact commit it built the worktree from, so `finish` can
# compare against that same tree rather than whatever `origin/main` has since become —
# main moves several times a day in this repository, and re-resolving `origin/main` at
# `finish` time made every intervening commit look like something this run touched.
# Shared machinery with run_hn_signals.py; see `routine_guards.record_prepared_base` and
# `routine_guards.prepared_base_ref` for the ROOT-vs-WORKTREE reasoning and the fallback
# and validation rules. Deliberately under `.candidate-evidence/`, already git-ignored
# and already this routine's own bundle directory, not under WORKTREE.
BASE_REF = ".candidate-evidence/base-ref.json"
DEFAULT_FROM_REF = routine_guards.DEFAULT_BASE_REF
ALLOWED_CHANGES = {QUEUE}

# The only fields the routine may write. Everything else in a candidate record —
# classification, confidence, status, the membership of the queue itself — belongs to
# human review under docs/CURATION.md, and a file-level guard cannot tell the difference.
NULLABLE_WHEN_HELD = ("proposed_system_family", "proposed_primary_role")
MISSING = object()

CHECKS = (
    ["uv", "run", "python", "scripts/validate_directory.py"],
    [
        "uv", "run", "python", "scripts/build_candidate_evidence.py",
        "--recheck", "--unattended",
    ],
    ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
    ["uv", "run", "ruff", "check", "scripts", "tests"],
)

WORKTREE = ROOT.parent / "atlas-candidate-triage"
PROMPT = ROOT / "docs" / "routines" / "candidate-triage.md"
INSTALLED_PROMPT = Path.home() / ".claude" / "scheduled-tasks" / "candidate-triage" / "SKILL.md"


def unexpected_changes(porcelain: str) -> list[str]:
    """Every path in `git status --porcelain` output the routine may not touch."""
    return routine_guards.unexpected_changes(porcelain, ALLOWED_CHANGES)


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


def unexpected_field_changes(before: str, after: str, *, base_label: str = "origin/main") -> list[str]:
    """Report every change to the queue beyond the two the routine is permitted to make.

    Permitted: adding a `triage` block to a candidate that has none, and nulling
    `proposed_system_family` / `proposed_primary_role` on a candidate whose new block
    names the decision holding it. Everything else — a rewritten classification, a nudged
    confidence, a changed status, an added or deleted candidate — is a human's, and the
    blast-radius check cannot see it because it all lands in the one permitted file.

    `base_label` names the revision `before` was read from, for diagnostics only. It
    defaults to "origin/main" so every existing call and test is unaffected; `finish`
    passes the actual base ref it compared against, which may be a pinned commit SHA.
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
    old, old_problems = index_candidates(old_document.get("candidates"), base_label)
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
    return routine_guards.worktree_text(path, WORKTREE)


def root_text(path: str) -> str:
    """Read a file out of ROOT — the primary checkout, not the worktree the model runs in.

    Used only for BASE_REF: reading it from ROOT rather than WORKTREE means an ordinary
    edit inside the model's own workspace cannot change what this file says. See
    `routine_guards.record_prepared_base` for the full reasoning, shared with
    run_hn_signals.py.
    """
    return routine_guards.worktree_text(path, ROOT)


shell = routine_guards.shell


def prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs."""
    return routine_guards.prompt_drift(repo_prompt, installed_prompt, "docs/routines/candidate-triage.md", ROOT)


def install_prompt() -> int:
    """Install the reviewed prompt, rendered for this checkout, where the scheduler reads it."""
    try:
        routine_guards.install_prompt(
            PROMPT.read_text(encoding="utf-8"), INSTALLED_PROMPT, ROOT, INSTALLED_PROMPT.parents[1]
        )
    except OSError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"installed {PROMPT.name} for {ROOT} at {INSTALLED_PROMPT}")
    return 0


def prepared_base_ref(read=root_text) -> str:
    """The commit `prepare` actually built the worktree from.

    See `routine_guards.prepared_base_ref` (shared with run_hn_signals.py) for the
    fallback and validation rules this applies.
    """
    return routine_guards.prepared_base_ref(BASE_REF, read, DEFAULT_FROM_REF)


def prepare(*, limit: int, run=shell) -> int:
    """Refresh an isolated worktree from origin/main and build the evidence bundle."""
    installed = INSTALLED_PROMPT.read_text(encoding="utf-8") if INSTALLED_PROMPT.exists() else None
    drift = prompt_drift(PROMPT.read_text(encoding="utf-8"), installed)
    if drift:
        print(f"error: {drift}", file=sys.stderr)
        return 1
    fetch_code, fetch_output = run(["git", "fetch", "--quiet", "origin"], ROOT)
    if fetch_code != 0:
        print(f"error: git fetch --quiet origin failed\n{fetch_output}", file=sys.stderr)
        return 1
    resolve_code, resolved = run(["git", "rev-parse", "--verify", "origin/main"], ROOT)
    if resolve_code != 0:
        print(f"error: could not resolve 'origin/main' to a commit\n{resolved}", file=sys.stderr)
        return 1
    base_sha = resolved.strip()
    steps = (
        # Removing a worktree that does not exist is expected on a first run.
        (["git", "worktree", "remove", "--force", str(WORKTREE)], True),
        (["git", "worktree", "add", "--quiet", "--detach", str(WORKTREE), base_sha], False),
    )
    for command, tolerate_failure in steps:
        code, output = run(command, ROOT)
        if code != 0 and not tolerate_failure:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    # Record the exact commit the worktree was built from, so `finish` compares its
    # guards against this tree rather than whatever `origin/main` has since become — see
    # `routine_guards.record_prepared_base`, shared with run_hn_signals.py.
    routine_guards.record_prepared_base(ROOT / BASE_REF, base_sha, "origin/main")
    code, output = run([
        "uv", "run", "python", "scripts/build_candidate_evidence.py",
        "--limit", str(limit), "--previous-branch", "triage/pending",
    ], WORKTREE)
    print(output)
    if code == 0:
        print(f"worktree ready: {WORKTREE}")
    return code


def unexpected_committed_changes(name_only: str) -> list[str]:
    """Paths a commit already on the branch touched that the routine may not write."""
    return routine_guards.unexpected_committed_changes(name_only, ALLOWED_CHANGES)


def finish(*, run=shell, read=worktree_text, base_read=root_text) -> int:
    """Run every guard, then commit. Any failure aborts before the commit."""
    # Checked before any guard below reads a diff or a blob: a populated refs/replace
    # would let those reads be silently redirected. See routine_guards.replace_refs_problem.
    replace_problem = routine_guards.replace_refs_problem(run, WORKTREE)
    if replace_problem:
        print(f"error: {replace_problem}", file=sys.stderr)
        return 1
    status_code, porcelain = run(["git", "status", "--porcelain"], WORKTREE)
    if status_code != 0:
        print("error: could not read git status", file=sys.stderr)
        return 1
    forbidden = unexpected_changes(porcelain)
    if forbidden:
        print(f"error: the run changed files it may not touch: {forbidden}", file=sys.stderr)
        return 1
    # The base `prepare` actually built from — a pinned SHA when it recorded one,
    # `origin/main` otherwise. Every guard below must compare against this same tree:
    # `origin/main` moves several times a day in this repository, and re-resolving it here
    # would make every intervening commit look like something this run touched. Read with
    # `base_read` (ROOT), never `read` (WORKTREE): the model being guarded against runs
    # inside WORKTREE, so the record of what it may be compared to must come from outside it.
    base_ref = prepared_base_ref(base_read)
    # A clean tree is not the same as an idle run: an agent that stages and commits its
    # own work leaves nothing in `git status` while its commit sits on the branch. The
    # guards must run against anything HEAD carries beyond the base, however it got there.
    head_code, head = run(["git", "rev-parse", "HEAD"], WORKTREE)
    base_code, base = run(["git", "rev-parse", base_ref], WORKTREE)
    if head_code != 0 or base_code != 0:
        print(f"error: could not compare HEAD against {base_ref}", file=sys.stderr)
        return 1
    dirty = bool(porcelain.strip())
    if not dirty and head.strip() == base.strip():
        print("no triage proposals to commit")
        return 0
    # --no-renames so a rename shows as a delete and an add, putting both paths in front
    # of the guard rather than only the destination.
    diff_code, committed = run(
        ["git", "diff", "--name-only", "--no-renames", base_ref, "HEAD"], WORKTREE
    )
    if diff_code != 0:
        print(f"error: could not diff HEAD against {base_ref}", file=sys.stderr)
        return 1
    forbidden_commits = unexpected_committed_changes(committed)
    if forbidden_commits:
        print(
            f"error: a commit on this branch touched files the run may not write: "
            f"{forbidden_commits}",
            file=sys.stderr,
        )
        return 1
    show_code, before = run(["git", "show", f"{base_ref}:{QUEUE}"], WORKTREE)
    if show_code != 0:
        print(f"error: could not read {QUEUE} from {base_ref}\n{before}", file=sys.stderr)
        return 1
    try:
        after = read(QUEUE)
    except OSError as exc:
        print(f"error: could not read {QUEUE} from the worktree: {exc}", file=sys.stderr)
        return 1
    overreach = unexpected_field_changes(before, after, base_label=base_ref)
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
    if dirty:
        # CHECKS above runs worktree-controlled code — the routine's own quality gates —
        # after `after` was read for the field guard and before anything is staged. A
        # command CHECKS runs (or something it shells out to) could rewrite QUEUE in that
        # window, and every guard above already ran against the version it read, not this
        # one. Re-reading right before `git add` and refusing on any difference closes that
        # window deterministically; see "Guard threat model" in docs/OPERATIONS.md.
        try:
            just_before_add = read(QUEUE)
        except OSError as exc:
            print(f"error: could not re-read {QUEUE} before staging: {exc}", file=sys.stderr)
            return 1
        if just_before_add != after:
            print(
                f"error: {QUEUE} changed after the field guard read it; refusing to commit",
                file=sys.stderr,
            )
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
    return routine_guards.main(
        argv, description=__doc__, prepare=prepare, finish=finish, install=install_prompt
    )


if __name__ == "__main__":
    raise SystemExit(main())
