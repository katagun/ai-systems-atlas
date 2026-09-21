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
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

try:
    from . import rank_signals, routine_guards, verify_signal_pages
except ImportError:  # Direct script execution places scripts/ on sys.path.
    import rank_signals
    import routine_guards
    import verify_signal_pages

ROOT = Path(__file__).resolve().parents[1]

QUEUE = "directory/hn-signals.json"
BUNDLE = ".hn-signal-bundle/bundle.json"
# Where `prepare` records the exact commit it built the worktree from, so `finish` can
# compare against that same tree rather than whatever `origin/main` has since become.
# Deliberately NOT under WORKTREE: that directory is handed to the unattended model, so a
# guard that read its single point of trust out of WORKTREE could be rewritten by an
# ordinary file edit there. Keeping the record under ROOT — the primary checkout, still
# git-ignored — closes that one route; it does not make the record unreachable by a model
# with shell access to this checkout, which is a materially different and stronger
# adversary. See "Guard threat model" in docs/OPERATIONS.md for what these guards do and
# do not bound; `prepare` writes this file and `finish` reads it with `root_text`, never
# `worktree_text`.
BASE_REF = ".hn-signal-bundle/base-ref.json"
DEFAULT_FROM_REF = routine_guards.DEFAULT_BASE_REF
ALLOWED_CHANGES = {QUEUE}
WORKTREE = ROOT.parent / "atlas-hn-signals"
PROMPT = ROOT / "docs" / "routines" / "hn-signals.md"
INSTALLED_PROMPT = (
    Path.home() / ".claude" / "scheduled-tasks" / "hn-signals" / "SKILL.md"
)

MISSING = object()


def checks(base_ref: str) -> tuple[list[str], ...]:
    """The quality gates `finish` runs before committing, in order.

    `verify_signal_pages.py --recheck` needs `base_ref` — the same commit `finish`
    already resolved everything else against — so it can scope its recheck to only the
    signals whose `assessment` this run added or changed, rather than every readable
    signal in the queue. A function, not a module-level constant, because `base_ref` is
    only known once `finish` has read `BASE_REF`.
    """
    return (
        ["uv", "run", "python", "scripts/validate_directory.py"],
        [
            "uv",
            "run",
            "python",
            "scripts/verify_signal_pages.py",
            "--recheck",
            "--base-ref",
            base_ref,
        ],
        ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
        ["uv", "run", "ruff", "check", "scripts", "tests"],
    )


def unexpected_changes(porcelain: str) -> list[str]:
    """Every path in `git status --porcelain` output the routine may not touch."""
    return routine_guards.unexpected_changes(porcelain, ALLOWED_CHANGES)


def signal_field_changes(
    key: str, old: dict[str, Any], new: dict[str, Any]
) -> list[str]:
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


def index_signals(
    signals: Any, side: str
) -> tuple[dict[str, dict[str, Any]], list[str]]:
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


def unexpected_field_changes(
    before: str, after: str, *, base_label: str = "origin/main"
) -> list[str]:
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
        if key != "signals"
        and old_document.get(key, MISSING) != new_document.get(key, MISSING)
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


def root_text(path: str) -> str:
    """Read a file out of ROOT — the primary checkout, not the worktree the model runs in.

    Used only for BASE_REF: reading it from ROOT rather than WORKTREE means an ordinary
    edit inside the model's own workspace cannot change what this file says. It does not
    mean the record is unreachable by a model with shell access to this checkout — see
    "Guard threat model" in docs/OPERATIONS.md. `routine_guards.worktree_text` also
    refuses a symlink at `path` here, rather than following it into content this routine
    never wrote.
    """
    return routine_guards.worktree_text(path, ROOT)


def worktree_write(path: str, text: str) -> None:
    """Write a file into the run's worktree, refusing to follow a symlink out of it."""
    target = WORKTREE / path
    if target.is_symlink():
        raise OSError(f"{path} is a symlink; refusing to write through it")
    target.write_text(text, encoding="utf-8")


def drop_drifted_assessments(
    before: str, after: str, fetcher: Callable[[str], str]
) -> tuple[list[str], list[str], str]:
    """Remove this run's assessments whose cited page no longer hashes to its pin.

    Returns the dropped story ids, any re-fetch failures, and the queue text to carry
    forward. Only an assessment the base queue lacked is in scope, so a block a human may
    already have read is never touched, and only a digest mismatch drops one: a page that
    cannot be fetched at all proves nothing about its content, so that is a failure that
    aborts the run rather than silently deleting work. The url fetched and the digest
    compared come from the base queue, never the run's copy, because this runs before the
    field guard has confirmed the run left both untouched. A queue either side cannot
    parse is returned unchanged for the field guard to report.
    """
    try:
        base_document = json.loads(before)
        run_document = json.loads(after)
    except json.JSONDecodeError:
        return [], [], after
    if not isinstance(base_document, dict) or not isinstance(run_document, dict):
        return [], [], after
    base, base_problems = index_signals(base_document.get("signals"), "base")
    current, run_problems = index_signals(run_document.get("signals"), "run")
    if base_problems or run_problems:
        return [], [], after
    dropped: list[str] = []
    problems: list[str] = []
    for key in sorted(current):
        pinned = base.get(key)
        if pinned is None or "assessment" in pinned:
            continue
        if not isinstance(current[key].get("assessment"), dict):
            continue
        if pinned.get("page_status") != "readable":
            continue
        url = pinned.get("url")
        if not isinstance(url, str):
            problems.append(f"signal {key}: the base queue records no url to re-fetch")
            continue
        try:
            body = fetcher(url)
        except (OSError, ValueError) as error:
            problems.append(f"signal {key}: re-fetch failed: {error}")
            continue
        # The same extraction and hash the sweep pinned and `--recheck` compares, taken
        # from verify_signal_pages so the two can never disagree about what drifted.
        text = verify_signal_pages.extract_visible_text(body)
        if verify_signal_pages.content_hash(text) != pinned.get("content_sha256"):
            dropped.append(key)
    if problems:
        return [], problems, after
    if not dropped:
        return [], [], after
    for key in dropped:
        del current[key]["assessment"]
    if run_document == base_document:
        return dropped, [], before
    return dropped, [], json.dumps(run_document, indent=2) + "\n"


shell = routine_guards.shell


def prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs."""
    return routine_guards.prompt_drift(
        repo_prompt, installed_prompt, "docs/routines/hn-signals.md", ROOT
    )


def install_prompt() -> int:
    """Install the reviewed prompt, rendered for this checkout, where the scheduler reads it."""
    try:
        routine_guards.install_prompt(
            PROMPT.read_text(encoding="utf-8"),
            INSTALLED_PROMPT,
            ROOT,
            INSTALLED_PROMPT.parents[1],
        )
    except OSError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"installed {PROMPT.name} for {ROOT} at {INSTALLED_PROMPT}")
    return 0


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
        if signal.get("page_status") == "readable"
        and str(signal.get("story_id")) not in bundled
    )


def pending_story_ids(
    signals: list[dict[str, Any]], drifted: list[str], limit: int
) -> list[str]:
    """Signals awaiting an assessment, minus the ones nothing can be said about.

    A drifted page is both unreadable to the routine and barred from the `unreadable`
    verdict, whose rule turns on `page_status`. Listing it as pending would ask for an
    assessment no valid block could express.
    """
    return [
        str(signal.get("story_id"))
        for signal in signals
        if "assessment" not in signal
        and str(signal.get("story_id")) not in set(drifted)
    ][:limit]


def remote_for_ref(ref: str, run=shell) -> str | None:
    """The configured remote `ref` names, or None if `ref` is purely local.

    A purely local ref (a local branch, a tag, a SHA) has no remote to be stale against,
    so a user working offline from one should not have a routine run aborted by a fetch
    that was never going to change anything it reads. A remote-tracking ref is the
    opposite: it is a local pointer to work that lives elsewhere, so a fetch failure
    there means the ref may be stale and the run must not proceed on stale evidence.

    Classifying by the ref's literal spelling is not enough: "refs/remotes/origin/main"
    is the same ref as "origin/main" but splits to the prefix "refs", which matches no
    remote, so the canonical spelling would silently skip the freshness check the
    shorthand enforces. Resolving with `git rev-parse --symbolic-full-name` first closes
    that gap; the plain prefix check stays as a cheap path for the common shorthand and
    for a ref (like a bare "origin") that resolution alone would not classify.
    """
    code, remotes = run(["git", "remote"], ROOT)
    names = (
        {line.strip() for line in remotes.splitlines() if line.strip()}
        if code == 0
        else set()
    )
    prefix = ref.split("/", 1)[0]
    if prefix in names:
        return prefix
    symbolic_code, symbolic = run(
        ["git", "rev-parse", "--symbolic-full-name", ref], ROOT
    )
    if symbolic_code != 0:
        return None
    full = symbolic.strip()
    if not full.startswith("refs/remotes/"):
        return None
    remote = full[len("refs/remotes/") :].split("/", 1)[0]
    return remote if remote in names else None


def is_remote_tracking_ref(ref: str, run=shell) -> bool:
    """Whether `ref` names a branch of a configured remote (e.g. "origin/main")."""
    return remote_for_ref(ref, run) is not None


def default_ranker(
    pending: list[str], signals: list[dict[str, Any]], pages: dict[str, str]
) -> tuple[list[str], dict[str, float]]:
    """The ranker `main` hands to `prepare`: TypeSafe when a key exists, else no change."""
    return rank_signals.rank_pending(
        pending, signals, pages, key=rank_signals.load_api_key()
    )


STALE_QUEUE_DAYS = 2


def queue_age_days(document: dict[str, Any], today: date) -> int | None:
    """Whole days since the sweep stamped this queue, or None when it carries no date.

    An unreadable date is not an old date: guessing here would cry wolf on every fixture
    and hand-built queue, and a warning that fires wrongly stops being read.
    """
    stamp = document.get("updated_at")
    if not isinstance(stamp, str):
        return None
    try:
        swept = date.fromisoformat(stamp[:10])
    except ValueError:
        return None
    return (today - swept).days


def bundled_pages(worktree: Path) -> dict[str, str]:
    """Story id to page text, as `verify_signal_pages --refresh` bundled it."""
    try:
        bundle = json.loads((worktree / BUNDLE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(bundle, dict):
        return {}
    return {str(k): v for k, v in bundle.items() if isinstance(v, str)}


def prepare(
    *,
    limit: int = 40,
    run=shell,
    from_ref: str = DEFAULT_FROM_REF,
    ranker: Callable[..., tuple[list[str], dict[str, float]]] | None = None,
    today: date | None = None,
) -> int:
    """Refresh an isolated worktree from `from_ref` and build the signal-page bundle."""
    installed = (
        INSTALLED_PROMPT.read_text(encoding="utf-8")
        if INSTALLED_PROMPT.exists()
        else None
    )
    drift = prompt_drift(PROMPT.read_text(encoding="utf-8"), installed)
    if drift:
        print(f"error: {drift}", file=sys.stderr)
        return 1
    # Only a remote-tracking ref can be stale against its remote, so only that case makes
    # a fetch failure fatal; a purely local ref is exactly as current as it will ever be.
    remote = remote_for_ref(from_ref, run)
    # The freshness check below only ever fetches `origin`. A ref naming a different
    # remote (e.g. "fork/main") would still be classified remote-tracking — so a fetch
    # failure would be fatal — but the fetch that runs never touches that remote, and the
    # check would pass while the baseline is arbitrarily stale. Reject it outright rather
    # than silently fetching the wrong remote or the right one under the wrong name.
    if remote is not None and remote != "origin":
        print(
            f"error: --from-ref {from_ref!r} names remote {remote!r}; only origin is fetched",
            file=sys.stderr,
        )
        return 1
    fetch_is_fatal = remote is not None
    fetch_code, fetch_output = run(["git", "fetch", "--quiet", "origin"], ROOT)
    if fetch_code != 0 and fetch_is_fatal:
        print(
            f"error: git fetch --quiet origin failed\n{fetch_output}", file=sys.stderr
        )
        return 1
    resolve_code, resolved = run(["git", "rev-parse", "--verify", from_ref], ROOT)
    if resolve_code != 0:
        print(
            f"error: could not resolve {from_ref!r} to a commit\n{resolved}",
            file=sys.stderr,
        )
        return 1
    base_sha = resolved.strip()
    steps = (
        # Removing a worktree that does not exist is expected on a first run.
        (["git", "worktree", "remove", "--force", str(WORKTREE)], True),
        (
            ["git", "worktree", "add", "--quiet", "--detach", str(WORKTREE), base_sha],
            False,
        ),
    )
    for command, tolerate_failure in steps:
        code, output = run(command, ROOT)
        if code != 0 and not tolerate_failure:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    # Record the exact commit the worktree was built from, so `finish` compares its
    # guards against the tree the model was actually handed rather than whatever
    # `origin/main` has since become. Shared with run_candidate_triage.py; see
    # `routine_guards.record_prepared_base` for why this lives under ROOT, not WORKTREE.
    routine_guards.record_prepared_base(ROOT / BASE_REF, base_sha, from_ref)
    code, output = run(
        ["uv", "run", "python", "scripts/verify_signal_pages.py", "--refresh"], WORKTREE
    )
    print(output)
    try:
        document = json.loads((WORKTREE / QUEUE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(
            f"error: could not read {QUEUE} from the worktree: {error}", file=sys.stderr
        )
        return 1
    # A stale queue still reads as a queue, which is how a dead sweep went unnoticed for
    # four days in 2026-09: twice in one week the wrapper refused every run while this
    # routine reassessed whatever was last committed. The sweep's log is read by nobody,
    # so say it here, where a person reads the run. Warn, never fail: an old queue with
    # unassessed signals is still work worth doing.
    age = queue_age_days(document, today or date.today())
    if age is not None and age > STALE_QUEUE_DAYS:
        print(
            f"warning: this queue is {age} days old (swept {document['updated_at'][:10]}); "
            "the daily sweep has probably stopped — read /tmp/atlas-hn-sweep.log",
            file=sys.stderr,
        )
    signals = [
        signal for signal in document.get("signals", []) if isinstance(signal, dict)
    ]
    bundled = bundled_story_ids(WORKTREE)
    drifted = drifted_story_ids(signals, bundled)
    # A day's batch is not all-or-nothing. `verify_signal_pages` exits non-zero when any
    # one page drifted, and propagating that discarded every other page in the run — a
    # single vendor edit costing the whole day. The drifted page is already absent from
    # the bundle, so the routine cannot read it; that is the whole remedy needed here.
    # `finish` keeps pins strict without discarding a day either: it drops only the
    # assessments whose page drifted and commits the rest, so nothing is committed while
    # a pin is unverified.
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
    # Rank before the cap, not after: with more pending signals than `limit`, the cap
    # should keep the likeliest, not the lowest story ids. `ranker` is None everywhere
    # but `main`, so no test of `prepare` can reach the network, and a ranker that
    # raises is a lost ordering, never a lost run.
    pending = pending_story_ids(signals, drifted, len(signals))
    scores: dict[str, float] = {}
    if ranker is not None:
        try:
            pending, scores = ranker(pending, signals, bundled_pages(WORKTREE))
        except Exception as error:
            print(
                f"warning: ranking failed ({type(error).__name__}); using sweep order",
                file=sys.stderr,
            )
    pending = pending[:limit]
    print(f"worktree ready: {WORKTREE}")
    if scores:
        print(
            f"ranked {len(scores)} signal(s) by likelihood of being a system "
            f"({rank_signals.MODEL}); an order to read in, never evidence"
        )
    print(f"pending signals ({len(pending)} of up to {limit}): {pending}")
    return 0


def unexpected_committed_changes(name_only: str) -> list[str]:
    """Paths a commit already on the branch touched that the routine may not write."""
    return routine_guards.unexpected_committed_changes(name_only, ALLOWED_CHANGES)


def prepared_base_ref(read=root_text) -> str:
    """The commit `prepare` actually built the worktree from.

    Read from ROOT, where `prepare` wrote it — not WORKTREE, the model's own working
    directory — so every guard below compares against the exact tree the model was
    handed rather than whatever `origin/main` has become since, and so an ordinary edit
    inside the model's own workspace cannot change what this function returns. See
    `routine_guards.prepared_base_ref` (shared with run_candidate_triage.py) for the
    fallback and validation rules this applies.
    """
    return routine_guards.prepared_base_ref(BASE_REF, read, DEFAULT_FROM_REF)


def finish(
    *,
    run=shell,
    read=worktree_text,
    base_read=root_text,
    write=worktree_write,
    fetcher=verify_signal_pages.fetch_web_text,
) -> int:
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
        print(
            f"error: the run changed files it may not touch: {forbidden}",
            file=sys.stderr,
        )
        return 1
    # The base `prepare` actually built from — a pinned SHA when it recorded one,
    # `origin/main` otherwise. Every guard below must compare against this same tree:
    # `prepare` may have built the worktree from a ref other than `origin/main`, and
    # comparing against the wrong tree would make the blast-radius, committed-diff, and
    # field-level guards below meaningless. Read with `base_read` (ROOT), never `read`
    # (WORKTREE): the model being guarded against runs inside WORKTREE, so the record of
    # what it may be compared to must come from outside it.
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
        print(
            f"error: could not read {QUEUE} from {base_ref}\n{before}", file=sys.stderr
        )
        return 1
    try:
        after = read(QUEUE)
    except OSError as exc:
        print(
            f"error: could not read {QUEUE} from the worktree: {exc}", file=sys.stderr
        )
        return 1
    # Before any guard judges the queue: a page that changed since the sweep pinned it
    # can no longer back the assessment citing it, so that one assessment is dropped here
    # and every other verified one still commits. Decided in this process from the base
    # queue's url and digest, never from CHECKS output or the run's own copy; the field
    # guard, CHECKS, and the re-read before `git add` all run on the result. See "Review a
    # signal batch" in docs/OPERATIONS.md.
    dropped, fetch_problems, after = drop_drifted_assessments(before, after, fetcher)
    if fetch_problems:
        for problem in fetch_problems:
            print(f"error: {problem}", file=sys.stderr)
        return 1
    if dropped:
        print(
            f"warning: dropped {len(dropped)} assessment(s) whose page changed since the "
            f"sweep: {dropped}",
            file=sys.stderr,
        )
        try:
            write(QUEUE, after)
        except OSError as exc:
            print(
                f"error: could not write {QUEUE} to the worktree: {exc}",
                file=sys.stderr,
            )
            return 1
        status_code, porcelain = run(["git", "status", "--porcelain"], WORKTREE)
        if status_code != 0:
            print("error: could not read git status", file=sys.stderr)
            return 1
        forbidden = unexpected_changes(porcelain)
        if forbidden:
            print(
                f"error: the run changed files it may not touch: {forbidden}",
                file=sys.stderr,
            )
            return 1
        dirty = bool(porcelain.strip())
        if not dirty and head.strip() == base.strip():
            print("no signal assessments to commit")
            return 0
    overreach = unexpected_field_changes(before, after, base_label=base_ref)
    if overreach:
        print("error: the run wrote outside the fields it may write:", file=sys.stderr)
        for problem in overreach:
            print(f"  {problem}", file=sys.stderr)
        return 1
    for command in checks(base_ref):
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
            print(
                f"error: could not re-read {QUEUE} before staging: {exc}",
                file=sys.stderr,
            )
            return 1
        if just_before_add != after:
            print(
                f"error: {QUEUE} changed after the field guard read it; refusing to commit",
                file=sys.stderr,
            )
            return 1
    message = f"Propose signal review for {date.today().isoformat()}"
    if dropped:
        message += (
            "\n\nDropped assessments whose page changed since the sweep: "
            + ", ".join(dropped)
        )
    commands = [["git", "checkout", "-B", "hn-signals/pending"]]
    if dirty:
        commands = [
            ["git", "add", QUEUE],
            ["git", "checkout", "-B", "hn-signals/pending"],
            ["git", "commit", "-m", message],
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
    parser.add_argument("command", choices=("prepare", "finish", "install-prompt"))
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument(
        "--from-ref",
        default=DEFAULT_FROM_REF,
        help=(
            "ref `prepare` builds its worktree from (default: origin/main). `prepare` "
            "resolves this to a commit SHA and records it outside the worktree, under "
            "the primary checkout; `finish` always uses that recorded SHA for its "
            "guards, so the two commands can never compare against different trees."
        ),
    )
    args = parser.parse_args(argv)
    if args.command == "prepare":
        return prepare(limit=args.limit, from_ref=args.from_ref, ranker=default_ranker)
    if args.command == "install-prompt":
        return install_prompt()
    return finish()


if __name__ == "__main__":
    raise SystemExit(main())
