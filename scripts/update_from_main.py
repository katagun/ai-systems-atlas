#!/usr/bin/env python3
"""Pick up main's changes in one command, then bring the generated trees with them.

Merging rather than rebasing is the point, and it is a deliberate change from the habit
this repository grew. A rebase of a branch that main has also moved replays every
commit, and a replay that lands on regenerated files usually conflicts, so the recovery
is: resolve, regenerate, and force-push. The force-push is the expensive part.
`verify.yml` sets `cancel-in-progress: true`, so each one kills the verification run the
push just started, and the next push kills that one's. On 2026-09-30 that threw away
three five-minute runs while a branch was brought up to date, and the cost looked like
the work rather than like the merge strategy.

A merge needs no force-push, so it cannot cancel anything. It also produces one state to
push instead of one per rebase. The price is a non-linear branch history, which costs
this repository nothing: main is squash-merged, so the merge commit never reaches main
and never appears in the log anyone reads. Rebase remains available when a clean history
on the branch itself is what you want, which after ADR 050 is close to never, because a
rebase re-introduces the conflict this is here to avoid.

The generated trees come along because a merge brings main's regenerated files, which are
current for main and stale for this branch the moment the catalog differs. That is not
something to remember: `regenerate.py` runs here, in order, and reports what it changed.
What this script will not do is commit or push. Those stay explicit, so the regenerated
output lands in a commit you can read and one push carries both the merge and the files
it invalidated.

Exit codes: 0 clean, 1 the tree was dirty or something went wrong, 2 the merge needs a
human to resolve, 3 main was unreachable.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CLEAN, DIRTY, CONFLICT, NO_REMOTE = 0, 1, 2, 3


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=check
    )


def dirty_files() -> list[str]:
    return [
        line[3:]
        for line in git("status", "--porcelain").stdout.splitlines()
        if line.strip()
    ]


def conflicted_files() -> list[str]:
    return [
        line[3:]
        for line in git("diff", "--name-only", "--diff-filter=U").stdout.splitlines()
        if line.strip()
    ]


def regenerate() -> bool:
    return (
        subprocess.run([sys.executable, "scripts/regenerate.py"], cwd=ROOT).returncode
        == 0
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report whether main has moved and whether the generated trees are current, without merging",
    )
    args = parser.parse_args()

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch == "main":
        print("You are on main. Merge main into a branch, not the other way round.")
        return DIRTY

    pending = dirty_files()
    if pending:
        # A merge with local changes can apply half of them and leave the rest in the
        # index, which is the one failure mode here that is expensive to unpick.
        print(f"{len(pending)} uncommitted change(s); commit or stash them first:")
        for name in pending[:10]:
            print(f"  {name}")
        if len(pending) > 10:
            print(f"  ... and {len(pending) - 10} more")
        return DIRTY

    if git("fetch", "origin", "main", check=False).returncode != 0:
        print("Could not fetch origin/main.")
        return NO_REMOTE

    behind = git("rev-list", "--count", "HEAD..origin/main").stdout.strip()
    print(f"on {branch}, {behind or '0'} commit(s) behind origin/main")

    if args.dry_run:
        stale = (
            subprocess.run(
                [sys.executable, "scripts/regenerate.py", "--check"], cwd=ROOT
            ).returncode
            != 0
        )
        print("dry run: nothing merged, nothing generated")
        return DIRTY if stale else CLEAN

    if behind != "0":
        # --no-edit keeps the merge non-interactive, and no --force anywhere: that is
        # the whole reason this script merges.
        merge = git("merge", "--no-edit", "origin/main", check=False)
        if merge.returncode != 0:
            stuck = conflicted_files()
            if stuck:
                print(f"\nmerge conflicts in {len(stuck)} file(s):")
                for name in stuck:
                    print(f"  {name}")
                print(
                    "\nResolve them, then `git add` the files and `git commit` to finish the merge."
                    "\nThese files are hand-maintained shells, so take the incoming content and re-apply"
                    "\nyour own edit; do not take either side wholesale. Then run"
                    "\n`uv run python scripts/regenerate.py` and push once."
                )
                return CONFLICT
            print(merge.stdout + merge.stderr)
            return DIRTY
        print("merged origin/main")

    if not regenerate():
        print("\nregeneration failed; fix the generator above before committing")
        return DIRTY

    changed = dirty_files()
    if not changed:
        print(
            "\nnothing to commit: the tree already matches main and its generated output"
        )
        return CLEAN

    print(f"\n{len(changed)} file(s) changed:")
    for name in changed[:15]:
        print(f"  {name}")
    if len(changed) > 15:
        print(f"  ... and {len(changed) - 15} more")
    print(
        "\nReview, then commit and push once. No force-push: this branch was merged, not rebased."
    )
    return CLEAN


if __name__ == "__main__":
    sys.exit(main())
