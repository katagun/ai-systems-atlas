"""Mechanical guards shared by the local review routines.

`scripts/run_candidate_triage.py` and `scripts/run_hn_signals.py` both drive an
unattended LLM prompt and both fence it the same way: a blast-radius check on the
working tree, the same check on what the branch already committed, a prompt-drift check
against the reviewed prompt, base-commit pinning, and one subprocess helper. Those were
verbatim forks of each other, so `tests/test_candidate_evidence.py` covered one copy
thoroughly and nothing covered the other — which is exactly how base pinning shipped for
`run_hn_signals.py` and never reached `run_candidate_triage.py`. They live here once, and
each routine binds them to its own queue, worktree, prompt, and base-ref record path.

What is deliberately *not* here: `unexpected_field_changes` and its per-record helpers.
Those encode what each queue's records mean — which field a routine may add, and which
belongs to human review — and merging them would let one routine's permission leak into
the other's queue.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections.abc import Callable, Container
from pathlib import Path

ShellFn = Callable[..., tuple[int, str]]

DEFAULT_BASE_REF = "origin/main"
# A recorded base sha must look like a commit sha, and nothing more, before anything
# shells out with it; see `prepared_base_ref`. `fullmatch`, not `match` against a
# `$`-anchored pattern: `$` in Python matches immediately before a trailing "\n", so
# `match` would accept a 40-hex value with a trailing newline appended and pass it to
# `git` argv unchecked.
BASE_REF_SHA_RE = re.compile(r"[0-9a-f]{40}")


def unexpected_changes(porcelain: str, allowed: Container[str]) -> list[str]:
    """Return every path in `git status --porcelain` output the routine may not touch."""
    changed: list[str] = []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # a rename reports "old -> new"; both ends are a change
            for side in path.split(" -> ", 1):
                if side.strip() not in allowed:
                    changed.append(side.strip())
            continue
        if path not in allowed:
            changed.append(path)
    return changed


def unexpected_committed_changes(name_only: str, allowed: Container[str]) -> list[str]:
    """Paths a commit already on the branch touched that the routine may not write.

    A clean working tree proves nothing on its own: an agent that commits its own edit
    leaves `git status` empty while the change rides on the branch the reviewer merges.
    """
    return [
        line.strip() for line in name_only.splitlines()
        if line.strip() and line.strip() not in allowed
    ]


def worktree_text(path: str, worktree: Path) -> str:
    """Read a file out of the run's worktree. Injected in tests, which have no worktree.

    Refuses a symlink at `path` rather than following it: every caller uses this to read
    content it is about to trust — the queue a guard diffs, or (for
    `run_hn_signals.py`'s `root_text`) the base-record file naming what a guard compares
    against — and a symlink there can point that read at content the routine never wrote,
    including back into the model's own worktree. Raising `OSError` here reaches every
    caller's existing "could not read" handling; `run_hn_signals.prepared_base_ref`
    specifically treats it the same as a missing record and falls back to `origin/main`.

    Checks every directory between `worktree` and `path` as well as `path` itself: making
    a directory the file lives under — `.hn-signal-bundle`, say — a symlink to somewhere
    outside the worktree leaves the file's own `is_symlink()` false while still redirecting
    the read, so `path` alone is not enough.
    """
    target = worktree / path
    node = target
    while node != worktree:
        if node.is_symlink():
            raise OSError(f"{path} is a symlink; refusing to read it as trusted content")
        node = node.parent
    return target.read_text(encoding="utf-8")


def record_prepared_base(path: Path, sha: str, from_ref: str) -> None:
    """Record the exact commit `prepare` built its worktree from, for `finish` to read.

    `finish` must compare its guards against the tree the model was actually handed, not
    whatever the ref it came from has since become — a ref can move between `prepare` and
    `finish`, so pinning the commit rather than the ref name is what keeps the two
    commands looking at the same tree. `path` is deliberately the caller's concern, not
    fixed here: each routine writes this record under its own `ROOT` (the primary
    checkout, never the worktree handed to the model — an ordinary file edit inside the
    model's own workspace must not be able to change what `finish` trusts) and under its
    own bundle directory, so the two routines' records never collide. That does not make
    the record unreachable by a model with shell access to this checkout, which can reach
    `ROOT` the same way it reaches everything else the repository's git process can
    reach; see "Guard threat model" in docs/OPERATIONS.md.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"sha": sha, "from_ref": from_ref}), encoding="utf-8")


def prepared_base_ref(
    base_ref_path: str,
    read: Callable[[str], str],
    default_from_ref: str = DEFAULT_BASE_REF,
) -> str:
    """The commit `prepare` actually built the worktree from, read via `read`.

    `read` is expected to resolve `base_ref_path` against `ROOT` — not the worktree the
    model runs in — so an ordinary edit inside the model's own workspace cannot change
    what this function returns; callers pass their own root-reading wrapper (which also
    refuses a symlink at `base_ref_path` or at any parent directory, per
    `worktree_text`). When nothing was recorded — an older run, a worktree built by hand,
    or a record `read` refused as a symlink — fall back to `default_from_ref` exactly as
    the routine always has before base pinning existed. The recorded value must also look
    like exactly a commit sha and nothing more: it reaches `git` argv unchecked
    everywhere a caller uses it, so anything else (an option flag, an empty string, a
    value with a trailing newline) falls back the same as if nothing were recorded.
    """
    try:
        recorded = json.loads(read(base_ref_path))
    except (OSError, json.JSONDecodeError):
        return default_from_ref
    sha = recorded.get("sha") if isinstance(recorded, dict) else None
    return sha if isinstance(sha, str) and BASE_REF_SHA_RE.fullmatch(sha) else default_from_ref


def replace_refs_problem(run: ShellFn, cwd: Path) -> str | None:
    """None when `refs/replace` is empty; otherwise, why a guard run must refuse.

    `refs/replace/*` lives in the git dir every worktree of a repository shares, not in
    any one worktree, so `git replace -f <pinned-sha> <forged-sha>` run from inside the
    model's own worktree reaches every other worktree of this repository, this one
    included. `git diff` and `git show` — what every field-level guard here is built
    from — honor a replace ref transparently: the object named by the pinned SHA is
    silently swapped for the replacement's, so a truthful two-file diff can become empty
    output. Neither routine's own workflow ever creates a replace ref, so finding one
    populated during a run has no legitimate explanation.
    """
    code, output = run(["git", "for-each-ref", "refs/replace"], cwd)
    if code != 0:
        # Fails open, deliberately: a non-zero `for-each-ref` skips this explicit,
        # name-the-ref refusal, but it does not reopen the bypass. `shell()` sets
        # `GIT_NO_REPLACE_OBJECTS=1` for every git command a caller runs afterward —
        # including the `git diff` and `git show` calls the field-level guards are built
        # from — so those already see the real objects a pinned SHA names regardless of
        # whether this check ran. This function only makes that outcome loud (name the
        # ref, refuse outright) instead of silent; losing it here falls back to the env
        # var doing the actual work, not to trusting a substituted object.
        return None
    refs = [line.split()[-1] for line in output.splitlines() if line.strip()]
    if not refs:
        return None
    return f"refs/replace is not empty ({refs}); refusing to trust any git diff or git show"


def shell(command: list[str], cwd: Path | None = None) -> tuple[int, str]:
    # GIT_NO_REPLACE_OBJECTS=1 makes every git command below treat refs/replace as if it
    # were empty, so the diff- and show-based guards see the real objects a pinned SHA
    # names even when a replace ref exists. This closes the cheapest way to blind those
    # guards; it does not by itself bound a model with shell access to this checkout — see
    # "Guard threat model" in docs/OPERATIONS.md. Harmless for the non-git commands this
    # helper also runs (the `uv run` / `ruff` quality checks): they never look at it.
    env = {**os.environ, "GIT_NO_REPLACE_OBJECTS": "1"}
    finished = subprocess.run(command, capture_output=True, text=True, cwd=cwd, env=env)
    return finished.returncode, finished.stdout + finished.stderr


def prompt_drift(repo_prompt: str, installed_prompt: str | None, document: str) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs.

    `document` is the repository path each routine's prompt lives at, so a run names the
    prompt it verified. Reusing another routine's path would report the wrong file while
    appearing to pass.
    """
    if installed_prompt is None:
        return "the routine prompt is not installed"
    if installed_prompt.strip() != repo_prompt.strip():
        return f"the installed routine prompt differs from {document}"
    return None


def main(
    argv: list[str] | None,
    *,
    description: str | None,
    prepare: Callable[..., int],
    finish: Callable[[], int],
) -> int:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("command", choices=("prepare", "finish"))
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args(argv)
    if args.command == "prepare":
        return prepare(limit=args.limit)
    return finish()
