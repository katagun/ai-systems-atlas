"""The sweep runner may never leave its checkout in a state its own first guard refuses.

Both silent outages of 2026-09 broke that one property: a rebase that aborted half-way
(09-15) and a commit that failed with the queue still staged (09-18). Each made every
later sweep refuse while the routine reassessed an old queue. So these tests drive a real
git repository and inject a failure at every step, then ask the only question that
matters: is the tree clean, and is the branch where it should be?
"""

from __future__ import annotations

import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import routine_guards, run_hn_sweep

QUEUE = run_hn_sweep.QUEUE


def git(cwd: Path, *args: str) -> str:
    finished = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True
    )
    return finished.stdout.strip()


class SweepRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.origin = scratch / "origin.git"
        self.root = scratch / "checkout"
        git(
            scratch,
            "init",
            "--quiet",
            "--bare",
            "--initial-branch=main",
            str(self.origin),
        )
        git(scratch, "clone", "--quiet", str(self.origin), str(self.root))
        for key, value in (("user.name", "t"), ("user.email", "t@example.invalid")):
            git(self.root, "config", key, value)
        git(self.root, "config", "commit.gpgsign", "false")
        (self.root / "directory").mkdir()
        (self.root / QUEUE).write_text('{"signals": []}\n', encoding="utf-8")
        git(self.root, "add", "-A")
        git(self.root, "commit", "--quiet", "-m", "main: first")
        git(self.root, "push", "--quiet", "origin", "HEAD:main")
        git(self.root, "checkout", "--quiet", "-b", run_hn_sweep.BRANCH)
        # A hook that always fails: the runner must commit past it, as the 09-18 outage
        # showed the real suite cannot pass in the routine's own checkout.
        hook = self.root / ".git" / "hooks" / "pre-commit"
        hook.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        hook.chmod(0o755)

    # --- helpers -------------------------------------------------------------------

    def sweep_writing(self, text: str | None, code: int = 0):
        """A stand-in for sweep_hackernews.py: writes the queue, or fails, or both."""

        def sweep(args: list[str], cwd: Path) -> tuple[int, str]:
            self.sweep_args = args
            if text is not None:
                (cwd / QUEUE).write_text(text, encoding="utf-8")
            return code, "signals: 1 of 1 stories"

        return sweep

    def failing_on(self, *needle: str):
        """The real shell, except the first git command containing `needle` fails."""

        def run(command: list[str], cwd: Path | None = None) -> tuple[int, str]:
            if all(part in command for part in needle):
                return 1, "injected failure"
            return routine_guards.shell(command, cwd)

        return run

    def run_sweep(self, **kwargs) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        kwargs.setdefault("sweep", self.sweep_writing('{"signals": [1]}\n'))
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = run_hn_sweep.run_sweep(root=self.root, **kwargs)
        return code, stdout.getvalue(), stderr.getvalue()

    def assert_clean(self) -> None:
        self.assertEqual("", git(self.root, "status", "--porcelain"))
        self.assertEqual(
            run_hn_sweep.BRANCH, git(self.root, "branch", "--show-current")
        )

    def advance_main(self, name: str) -> str:
        other = Path(self.enterContext(tempfile.TemporaryDirectory())) / "other"
        git(other.parent, "clone", "--quiet", str(self.origin), str(other))
        for key, value in (("user.name", "t"), ("user.email", "t@example.invalid")):
            git(other, "config", key, value)
        (other / name).write_text(name, encoding="utf-8")
        git(other, "add", "-A")
        git(other, "commit", "--quiet", "-m", f"main: {name}")
        git(other, "push", "--quiet", "origin", "HEAD:main")
        return git(other, "rev-parse", "HEAD")

    # --- the happy path --------------------------------------------------------------

    def test_a_sweep_commits_the_queue_past_a_failing_hook_and_leaves_a_clean_tree(
        self,
    ) -> None:
        code, stdout, _ = self.run_sweep()
        self.assertEqual(0, code)
        self.assertIn("committed", stdout)
        self.assert_clean()
        self.assertEqual(
            QUEUE, git(self.root, "show", "--name-only", "--format=", "HEAD")
        )

    def test_the_branch_is_moved_onto_main_and_the_old_tip_is_kept(self) -> None:
        self.run_sweep()  # yesterday's sweep commit
        yesterday = git(self.root, "rev-parse", "HEAD")
        new_main = self.advance_main("newer-code.txt")

        code, _, _ = self.run_sweep(sweep=self.sweep_writing('{"signals": [2]}\n'))
        self.assertEqual(0, code)
        self.assert_clean()
        self.assertEqual(new_main, git(self.root, "rev-parse", "HEAD~1"))
        self.assertTrue((self.root / "newer-code.txt").is_file())
        self.assertEqual(yesterday, git(self.root, "rev-parse", run_hn_sweep.PREV_REF))

    def test_an_unchanged_queue_commits_nothing(self) -> None:
        before = git(self.root, "rev-parse", "HEAD")
        code, stdout, _ = self.run_sweep(sweep=self.sweep_writing(None))
        self.assertEqual(0, code)
        self.assertIn("no new signals", stdout)
        self.assertEqual(before, git(self.root, "rev-parse", "HEAD"))
        self.assert_clean()

    def test_extra_arguments_reach_the_sweep(self) -> None:
        self.run_sweep(sweep_args=["--lag-days", "3"])
        self.assertEqual(["--lag-days", "3"], self.sweep_args)

    # --- refusals that touch nothing -------------------------------------------------

    def test_a_dirty_tree_is_refused_untouched(self) -> None:
        (self.root / "hand-edit.txt").write_text("mine", encoding="utf-8")
        before = git(self.root, "rev-parse", "HEAD")
        code, _, stderr = self.run_sweep()
        self.assertEqual(1, code)
        self.assertIn("dirty", stderr)
        self.assertEqual("mine", (self.root / "hand-edit.txt").read_text("utf-8"))
        self.assertEqual(before, git(self.root, "rev-parse", "HEAD"))

    def test_any_other_branch_is_refused_before_the_hard_reset(self) -> None:
        """The runner hard-resets its branch. Started by mistake in a working checkout it
        would destroy a feature branch's commits, so the branch name is the safety catch."""
        git(self.root, "checkout", "--quiet", "-b", "someones-feature")
        (self.root / "work.txt").write_text("unpushed work", encoding="utf-8")
        git(self.root, "add", "-A")
        git(self.root, "commit", "--quiet", "--no-verify", "-m", "unpushed work")
        before = git(self.root, "rev-parse", "HEAD")
        self.advance_main("newer-code.txt")

        code, _, stderr = self.run_sweep()
        self.assertEqual(1, code)
        self.assertIn(run_hn_sweep.BRANCH, stderr)
        self.assertEqual(before, git(self.root, "rev-parse", "HEAD"))
        self.assertTrue((self.root / "work.txt").is_file())

    def test_a_failed_fetch_is_refused_before_anything_moves(self) -> None:
        before = git(self.root, "rev-parse", "HEAD")
        code, _, stderr = self.run_sweep(run=self.failing_on("fetch"))
        self.assertEqual(1, code)
        self.assertIn("fetch", stderr)
        self.assertEqual(before, git(self.root, "rev-parse", "HEAD"))
        self.assert_clean()

    # --- the property: no failure leaves the tree dirty ------------------------------

    def test_a_failed_sweep_that_wrote_a_partial_queue_is_discarded(self) -> None:
        code, _, stderr = self.run_sweep(sweep=self.sweep_writing("{partial", code=1))
        self.assertEqual(1, code)
        self.assertIn("sweep failed", stderr)
        self.assert_clean()

    def test_a_failed_commit_unstages_and_discards_the_queue(self) -> None:
        """The 2026-09-18 outage, exactly: the commit fails with the queue staged."""
        code, _, stderr = self.run_sweep(run=self.failing_on("commit"))
        self.assertEqual(1, code)
        self.assertIn("commit failed", stderr)
        self.assert_clean()

    def test_a_failed_add_discards_the_queue(self) -> None:
        code, _, _ = self.run_sweep(run=self.failing_on("add"))
        self.assertEqual(1, code)
        self.assert_clean()

    def test_after_every_injected_failure_the_next_sweep_still_runs(self) -> None:
        for needle in (("fetch",), ("reset", "--hard"), ("add",), ("commit",)):
            with self.subTest(failing=needle):
                code, _, _ = self.run_sweep(run=self.failing_on(*needle))
                self.assertEqual(1, code)
                self.assert_clean()
        code, _, _ = self.run_sweep()
        self.assertEqual(0, code)
        self.assert_clean()


if __name__ == "__main__":
    unittest.main()
