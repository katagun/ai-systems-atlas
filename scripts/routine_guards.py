"""Mechanical guards shared by the local review routines.

`scripts/run_candidate_triage.py` and `scripts/run_hn_signals.py` both drive an
unattended LLM prompt and both fence it the same way: a blast-radius check on the
working tree, the same check on what the branch already committed, a prompt-drift check
against the reviewed prompt, and one subprocess helper. Those five were verbatim forks
of each other, so `tests/test_candidate_evidence.py` covered one copy thoroughly and
nothing covered the other. They live here once, and each routine binds them to its own
queue, worktree, and prompt.

What is deliberately *not* here: `unexpected_field_changes` and its per-record helpers.
Those encode what each queue's records mean — which field a routine may add, and which
belongs to human review — and merging them would let one routine's permission leak into
the other's queue.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from collections.abc import Callable, Container
from pathlib import Path

ShellFn = Callable[..., tuple[int, str]]


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
    """
    target = worktree / path
    if target.is_symlink():
        raise OSError(f"{path} is a symlink; refusing to read it as trusted content")
    return target.read_text(encoding="utf-8")


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
