#!/usr/bin/env python3
"""Run the daily attention-source sweep and commit its queue to a local branch.

launchd runs this from a dedicated worktree on `local/hn-signals`. It moves that branch
onto `origin/main` so the sweep and the routine both run current code, sweeps, and commits
`directory/hn-signals.json`, which `run_hn_signals.py prepare --from-ref local/hn-signals`
then reads. Nothing here pushes. See "Attention-source sweep" in docs/OPERATIONS.md.

One property governs every line: no exit path may leave the checkout in a state the
first guard below refuses. A refused sweep is silent and a stale queue still reads as a
queue, so a half-finished run does not cost a day — it costs every day until someone
looks. That happened twice in one week of 2026-09, when this was a shell script outside
the repository: a rebase that aborted half-way, then a commit that failed with the queue
still staged.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

try:
    from . import routine_guards
except ImportError:  # Direct script execution places scripts/ on sys.path.
    import routine_guards

ROOT = Path(__file__).resolve().parents[1]
QUEUE = "directory/hn-signals.json"
BRANCH = "local/hn-signals"
PREV_REF = "local/hn-signals-prev"

SweepFn = Callable[[list[str], Path], tuple[int, str]]


def sweep_subprocess(args: list[str], cwd: Path) -> tuple[int, str]:
    """Run the sweep as a child process, so it is the code the reset just checked out.

    This module was loaded before the reset; importing the sweep here would mix yesterday's
    runner with today's sweep in one interpreter.
    """
    finished = subprocess.run(
        [sys.executable, "scripts/sweep_hackernews.py", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    return finished.returncode, finished.stdout + finished.stderr


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _refuse(reason: str) -> int:
    print(f"{_now()} refusing: {reason}", file=sys.stderr)
    return 1


def _discard_queue(run: routine_guards.ShellFn, root: Path) -> None:
    """Unstage and restore the queue. Best effort: it runs on paths that already failed."""
    run(["git", "reset", "--quiet"], root)
    run(["git", "checkout", "--", QUEUE], root)


def run_sweep(
    *,
    root: Path = ROOT,
    run: routine_guards.ShellFn = routine_guards.shell,
    sweep: SweepFn = sweep_subprocess,
    sweep_args: list[str] | None = None,
) -> int:
    code, porcelain = run(["git", "status", "--porcelain"], root)
    if code != 0:
        return _refuse("could not read the worktree's status")
    # An interrupted earlier run, or a hand edit, would otherwise be swept into an
    # automated commit or destroyed by the reset below.
    if porcelain.strip():
        return _refuse("worktree is dirty")

    # The reset below discards every commit the current branch holds that main does not.
    # On this branch that is by design; on any other it is someone's unpushed work. The
    # branch name is the only thing standing between this script and a working checkout
    # it was started in by mistake.
    code, branch = run(["git", "branch", "--show-current"], root)
    if code != 0 or branch.strip() != BRANCH:
        return _refuse(
            f"this checkout is on {branch.strip() or 'a detached HEAD'!r}, not {BRANCH!r}"
        )

    # Run current code: the worktree once ran ten commits behind main, missing
    # already-decided URL suppression. Refuse rather than sweep with stale code.
    code, _ = run(["git", "fetch", "--quiet", "origin", "main"], root)
    if code != 0:
        return _refuse("could not fetch origin main")

    # Reset rather than rebase. Each sweep rewrites the queue wholesale, so replaying
    # yesterday's sweep commits onto main conflicts with any queue change merged there;
    # on 2026-09-15 that rebase aborted and every later sweep refused. Nothing of value is
    # lost: assessments go to hn-signals/pending, never here, and this branch is never
    # pushed. The old tip is kept for one generation so a swept day stays recoverable.
    run(["git", "branch", "--force", PREV_REF, "HEAD"], root)
    code, _ = run(["git", "reset", "--quiet", "--hard", "origin/main"], root)
    if code != 0:
        return _refuse("could not reset onto origin/main")

    code, output = sweep(list(sweep_args or []), root)
    if output.strip():
        print(output.strip())
    if code != 0:
        _discard_queue(run, root)
        print(f"{_now()} sweep failed; queue discarded", file=sys.stderr)
        return 1

    code, _ = run(["git", "diff", "--quiet", "--", QUEUE], root)
    if code == 0:
        print(f"{_now()} no new signals")
        return 0

    # --no-verify: the repository's pre-commit suite cannot pass in this checkout — it
    # asserts a checkout holds no .hn-signal-bundle, and `prepare` writes one here — and on
    # 2026-09-18 its failure left the queue staged and every later sweep refused. Skipping
    # it costs nothing: this is one data file on a branch that is never pushed, and
    # `run_hn_signals.py finish` and the `verify` check both validate it before main does.
    message = f"Sweep attention-source signals for {_now()[:10]}"
    code, _ = run(["git", "add", "--", QUEUE], root)
    if code == 0:
        code, _ = run(["git", "commit", "--quiet", "--no-verify", "-m", message], root)
    if code != 0:
        _discard_queue(run, root)
        print(
            f"{_now()} commit failed; queue discarded so tomorrow's sweep can run",
            file=sys.stderr,
        )
        return 1

    _, sha = run(["git", "rev-parse", "--short", "HEAD"], root)
    print(f"{_now()} committed {sha.strip()}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    # Everything this runner does not know is the sweep's: --lag-days, --points-floor.
    _, sweep_args = parser.parse_known_args(argv)
    return run_sweep(sweep_args=sweep_args)


if __name__ == "__main__":
    raise SystemExit(main())
