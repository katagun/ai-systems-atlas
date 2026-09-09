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
import sys
from datetime import date
from pathlib import Path
from typing import Any

try:
    from . import routine_guards
except ImportError:  # Direct script execution places scripts/ on sys.path.
    import routine_guards

ROOT = Path(__file__).resolve().parents[1]

QUEUE = "directory/hn-signals.json"
BUNDLE = ".hn-signal-bundle/bundle.json"
# Where `prepare` records the exact commit it built the worktree from, so `finish` can
# compare against that same tree rather than whatever `origin/main` has since become.
# Lives inside the already-git-ignored bundle directory, so it travels with the evidence
# handed to the model and is never a candidate for a commit.
BASE_REF = ".hn-signal-bundle/base-ref.json"
DEFAULT_FROM_REF = "origin/main"
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
    """Every path in `git status --porcelain` output the routine may not touch."""
    return routine_guards.unexpected_changes(porcelain, ALLOWED_CHANGES)


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


def unexpected_field_changes(before: str, after: str, *, base_label: str = "origin/main") -> list[str]:
    """Compare two revisions of the queue and report every change the routine may not make.

    `base_label` names the revision `before` was read from, for diagnostics only. It
    defaults to "origin/main" so every existing call and test is unaffected; `finish`
    passes the actual base ref it compared against, which may be a pinned commit SHA.
    """
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
    old, old_problems = index_signals(old_document.get("signals"), base_label)
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
    return routine_guards.worktree_text(path, WORKTREE)


shell = routine_guards.shell


def prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs."""
    return routine_guards.prompt_drift(repo_prompt, installed_prompt, "docs/routines/hn-signals.md")


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


def is_remote_tracking_ref(ref: str, run=shell) -> bool:
    """Whether `ref` names a branch of a configured remote (e.g. "origin/main").

    A purely local ref (a local branch, a tag, a SHA) has no remote to be stale against,
    so a user working offline from one should not have a routine run aborted by a fetch
    that was never going to change anything it reads. A remote-tracking ref is the
    opposite: it is a local pointer to work that lives elsewhere, so a fetch failure
    there means the ref may be stale and the run must not proceed on stale evidence.
    """
    code, remotes = run(["git", "remote"], ROOT)
    if code != 0:
        return False
    names = {line.strip() for line in remotes.splitlines() if line.strip()}
    prefix = ref.split("/", 1)[0]
    return prefix in names


def prepare(*, limit: int = 40, run=shell, from_ref: str = DEFAULT_FROM_REF) -> int:
    """Refresh an isolated worktree from `from_ref` and build the signal-page bundle."""
    installed = INSTALLED_PROMPT.read_text(encoding="utf-8") if INSTALLED_PROMPT.exists() else None
    drift = prompt_drift(PROMPT.read_text(encoding="utf-8"), installed)
    if drift:
        print(f"error: {drift}", file=sys.stderr)
        return 1
    # Only a remote-tracking ref can be stale against its remote, so only that case makes
    # a fetch failure fatal; a purely local ref is exactly as current as it will ever be.
    fetch_is_fatal = is_remote_tracking_ref(from_ref, run)
    fetch_code, fetch_output = run(["git", "fetch", "--quiet", "origin"], ROOT)
    if fetch_code != 0 and fetch_is_fatal:
        print(f"error: git fetch --quiet origin failed\n{fetch_output}", file=sys.stderr)
        return 1
    resolve_code, resolved = run(["git", "rev-parse", "--verify", from_ref], ROOT)
    if resolve_code != 0:
        print(f"error: could not resolve {from_ref!r} to a commit\n{resolved}", file=sys.stderr)
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
    # guards against the tree the model was actually handed rather than whatever
    # `origin/main` has since become. A SHA, not `from_ref` itself, because a ref can
    # move between `prepare` and `finish` and the guards must pin the tree, not the name.
    base_ref_path = WORKTREE / BASE_REF
    base_ref_path.parent.mkdir(parents=True, exist_ok=True)
    base_ref_path.write_text(json.dumps({"sha": base_sha, "from_ref": from_ref}), encoding="utf-8")
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
    """Paths a commit already on the branch touched that the routine may not write."""
    return routine_guards.unexpected_committed_changes(name_only, ALLOWED_CHANGES)


def prepared_base_ref(read=worktree_text) -> str:
    """The commit `prepare` actually built the worktree from.

    Read from the bundle directory `prepare` wrote it to, so every guard below compares
    against the exact tree the model was handed rather than whatever `origin/main` has
    become since. When nothing was recorded — an older worktree, or one built by hand —
    fall back to `origin/main` exactly as the routine always has.
    """
    try:
        recorded = json.loads(read(BASE_REF))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_FROM_REF
    sha = recorded.get("sha") if isinstance(recorded, dict) else None
    return sha if isinstance(sha, str) and sha else DEFAULT_FROM_REF


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
    # The base `prepare` actually built from — a pinned SHA when it recorded one,
    # `origin/main` otherwise. Every guard below must compare against this same tree:
    # `prepare` may have built the worktree from a ref other than `origin/main`, and
    # comparing against the wrong tree would make the blast-radius, committed-diff, and
    # field-level guards below meaningless.
    base_ref = prepared_base_ref(read)
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
        print("no signal assessments to commit")
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
    # A dedicated parser, not routine_guards.main: --from-ref is meaningful only to this
    # routine's `prepare`, and routine_guards.main is shared with candidate triage, whose
    # `prepare` has no such option.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "finish"))
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument(
        "--from-ref",
        default=DEFAULT_FROM_REF,
        help=(
            "ref `prepare` builds its worktree from (default: origin/main). `prepare` "
            "resolves this to a commit SHA and records it in the bundle directory; "
            "`finish` always uses that recorded SHA for its guards, so the two commands "
            "can never compare against different trees."
        ),
    )
    args = parser.parse_args(argv)
    if args.command == "prepare":
        return prepare(limit=args.limit, from_ref=args.from_ref)
    return finish()


if __name__ == "__main__":
    raise SystemExit(main())
