from __future__ import annotations

import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar
from unittest import mock

from scripts import run_hn_signals


def document(**overrides) -> str:
    signal = {
        "story_id": "49616354", "story_url": "https://news.ycombinator.com/item?id=49616354",
        "title": "Mercury 2.5", "url": "https://vendor.example/launch", "points": 231,
        "num_comments": 88, "submitted_at": "2026-09-08T20:14:52Z", "page_status": "readable",
        "content_sha256": "b" * 64, "fetched_at": "2026-09-09T00:00:00Z",
        "status": "provisional", "discovered_at": "2026-09-09",
    }
    signal.update(overrides)
    return json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": [signal]})


class FieldGuardTests(unittest.TestCase):
    def test_adding_an_assessment_is_permitted(self) -> None:
        after = document(assessment={"verdict": "worth_review"})
        self.assertEqual(run_hn_signals.unexpected_field_changes(document(), after), [])

    def test_changing_provenance_is_rejected(self) -> None:
        problems = run_hn_signals.unexpected_field_changes(document(), document(points=999))
        self.assertTrue(any("points" in problem for problem in problems), problems)

    def test_adding_a_signal_is_rejected(self) -> None:
        before = json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []})
        problems = run_hn_signals.unexpected_field_changes(before, document())
        self.assertTrue(any("only the sweep adds" in problem for problem in problems), problems)

    def test_removing_a_signal_is_rejected(self) -> None:
        after = json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []})
        problems = run_hn_signals.unexpected_field_changes(document(), after)
        self.assertTrue(any("only a human resolves" in problem for problem in problems), problems)

    def test_overwriting_an_existing_assessment_is_rejected(self) -> None:
        before = document(assessment={"verdict": "worth_review"})
        after = document(assessment={"verdict": "out_of_scope"})
        problems = run_hn_signals.unexpected_field_changes(before, after)
        self.assertTrue(any("assessment" in problem for problem in problems), problems)


class VerifierTests(unittest.TestCase):
    """Hermetic: a fake fetcher and an injected signals path, never the network or the
    real (empty) directory/hn-signals.json. Ruling 3 replaces the brief's vacuous,
    network-dependent assertion with one that checks both directions of the drift check.
    """

    def signals_document(self, page_text: str) -> tuple[Path, str]:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "hn-signals.json"
        digest = hashlib.sha256(page_text.encode("utf-8")).hexdigest()
        signal = {
            "story_id": "1", "story_url": "https://news.ycombinator.com/item?id=1",
            "title": "A launch", "url": "https://vendor.example/launch", "points": 50,
            "num_comments": 4, "submitted_at": "2026-09-08T00:00:00Z", "page_status": "readable",
            "content_sha256": digest, "fetched_at": "2026-09-09T00:00:00Z",
            "status": "provisional", "discovered_at": "2026-09-09",
        }
        path.write_text(
            json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": [signal]}),
            encoding="utf-8",
        )
        return path, digest

    def test_a_page_that_no_longer_hashes_to_the_recorded_digest_is_reported_as_drift(self) -> None:
        from scripts import verify_signal_pages

        path, _digest = self.signals_document("the original vendor page text")
        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: "the page changed since the sweep", signals_path=path
        )
        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)

    def test_a_page_that_still_matches_the_recorded_digest_is_not_reported(self) -> None:
        from scripts import verify_signal_pages

        original = "the original vendor page text"
        path, _digest = self.signals_document(original)
        problems = verify_signal_pages.verify(refresh=False, fetcher=lambda url: original, signals_path=path)
        self.assertEqual(problems, [])

    def test_the_verifier_hashes_a_page_exactly_as_the_sweep_did(self) -> None:
        """The sweep pins the digest; the verifier reproduces it. Two extractors that
        disagreed by one character would report drift on every page, every day."""
        from scripts import sweep_hackernews, verify_signal_pages

        page = (
            "<html><head><style>.a{color:red}</style></head><body>"
            + "<p>A launch announcement with plenty of prose. </p>" * 20
            + "<script>var buildId = 'changes-every-deploy';</script></body></html>"
        )
        document = sweep_hackernews.build_document(
            [{
                "objectID": "1", "title": "A launch", "url": "https://vendor.example/launch",
                "points": 50, "num_comments": 4, "created_at": "2026-09-08T00:00:00Z",
            }],
            window_start="2026-09-07T00:00:00Z",
            window_end="2026-09-08T00:00:00Z",
            points_floor=10,
            story_count=1,
            qualifying_count=1,
            discovered_at="2026-09-09",
            fetcher=lambda url: page,
        )
        self.assertEqual(document["signals"][0]["page_status"], "readable")
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "hn-signals.json"
        path.write_text(json.dumps(document), encoding="utf-8")

        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: page, signals_path=path
        )

        self.assertEqual(problems, [])


class BundleDriftTests(unittest.TestCase):
    """One vendor edit must not discard the rest of the day's batch."""

    SIGNALS: ClassVar[list[dict]] = [
        {"story_id": "1", "page_status": "readable"},
        {"story_id": "2", "page_status": "readable"},
        {"story_id": "3", "page_status": "failed"},
        {"story_id": "4", "page_status": "readable", "assessment": {"verdict": "unreadable"}},
    ]

    def test_a_readable_page_missing_from_the_bundle_is_drift(self) -> None:
        self.assertEqual(
            run_hn_signals.drifted_story_ids(self.SIGNALS, {"1", "4"}), ["2"]
        )

    def test_an_unfetchable_page_is_not_drift(self) -> None:
        """`failed` carries no digest to re-check; it is dispositioned `unreadable`."""
        self.assertNotIn("3", run_hn_signals.drifted_story_ids(self.SIGNALS, {"1", "2", "4"}))

    def test_pending_excludes_a_drifted_page_but_keeps_an_unfetchable_one(self) -> None:
        pending = run_hn_signals.pending_story_ids(self.SIGNALS, ["2"], 40)
        self.assertEqual(pending, ["1", "3"])

    def test_pending_honours_the_limit(self) -> None:
        self.assertEqual(run_hn_signals.pending_story_ids(self.SIGNALS, [], 2), ["1", "2"])

    def test_a_missing_bundle_verifies_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(run_hn_signals.bundled_story_ids(Path(directory)), set())


class PrepareDriftTests(unittest.TestCase):
    def prepared_worktree(self, bundle: dict[str, str]) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        worktree = Path(directory.name)
        (worktree / "directory").mkdir()
        (worktree / run_hn_signals.QUEUE).write_text(
            json.dumps({"signals": [
                {"story_id": "1", "page_status": "readable"},
                {"story_id": "2", "page_status": "readable"},
            ]}),
            encoding="utf-8",
        )
        (worktree / ".hn-signal-bundle").mkdir()
        (worktree / run_hn_signals.BUNDLE).write_text(json.dumps(bundle), encoding="utf-8")
        installed = worktree / "SKILL.md"
        installed.write_text(
            run_hn_signals.PROMPT.read_text(encoding="utf-8"), encoding="utf-8"
        )
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        return worktree

    @staticmethod
    def drifting_run(command: list[str], _cwd=None) -> tuple[int, str]:
        if "verify_signal_pages.py" in " ".join(command):
            return 1, "error: signal 2: page changed since the sweep recorded it"
        return 0, ""

    def test_one_drifted_page_does_not_discard_the_pages_that_verified(self) -> None:
        self.prepared_worktree({"1": "the page text"})
        self.assertEqual(0, run_hn_signals.prepare(limit=40, run=self.drifting_run))

    def test_a_run_where_nothing_verified_fails(self) -> None:
        self.prepared_worktree({})
        self.assertEqual(1, run_hn_signals.prepare(limit=40, run=self.drifting_run))


class BoundGuardTests(unittest.TestCase):
    """The blast-radius and prompt-drift guards are shared with candidate triage; what
    is not shared is which queue and which prompt this routine is bound to."""

    def test_the_signal_queue_is_the_only_file_the_run_may_touch(self) -> None:
        self.assertEqual([], run_hn_signals.unexpected_changes(" M directory/hn-signals.json\n"))
        self.assertEqual(
            ["directory/candidates.json"],
            run_hn_signals.unexpected_changes(" M directory/candidates.json\n"),
        )

    def test_a_committed_edit_outside_the_signal_queue_is_reported(self) -> None:
        self.assertEqual(
            ["directory/projects.json"],
            run_hn_signals.unexpected_committed_changes(
                "directory/hn-signals.json\ndirectory/projects.json\n"
            ),
        )

    def test_drift_is_reported_against_this_routines_prompt_not_the_other_one(self) -> None:
        """Verifying the triage prompt here would pass while checking the wrong file."""
        drift = run_hn_signals.prompt_drift("body", "different body")
        self.assertIn("docs/routines/hn-signals.md", str(drift))
        self.assertIsNotNone(run_hn_signals.prompt_drift("body", None))
        self.assertIsNone(run_hn_signals.prompt_drift("body\n", "  body  "))


class IsRemoteTrackingRefTests(unittest.TestCase):
    @staticmethod
    def remotes_run(_command: list[str], _cwd=None) -> tuple[int, str]:
        return 0, "origin\n"

    def test_a_remote_tracking_ref_is_detected(self) -> None:
        self.assertTrue(run_hn_signals.is_remote_tracking_ref("origin/main", self.remotes_run))

    def test_a_local_ref_is_not_remote_tracking(self) -> None:
        self.assertFalse(
            run_hn_signals.is_remote_tracking_ref("my-local-sweep-branch", self.remotes_run)
        )

    def test_a_ref_named_exactly_like_a_remote_is_treated_as_remote_tracking(self) -> None:
        """`origin` alone (no branch) is an edge case, not one --from-ref needs to support
        well — the important property is that an unrelated local branch name isn't caught."""
        self.assertTrue(run_hn_signals.is_remote_tracking_ref("origin", self.remotes_run))

    def test_git_remote_failing_is_treated_as_not_remote_tracking(self) -> None:
        self.assertFalse(
            run_hn_signals.is_remote_tracking_ref("origin/main", lambda *_a, **_k: (1, "error"))
        )


class PrepareFromRefTests(unittest.TestCase):
    """`prepare` with no --from-ref must behave exactly as it always has: fetch failure
    fatal, worktree built from origin/main. A local --from-ref changes both."""

    def prepared_worktree(self) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        worktree = Path(directory.name)
        (worktree / "directory").mkdir()
        (worktree / run_hn_signals.QUEUE).write_text(
            json.dumps({"signals": []}), encoding="utf-8"
        )
        installed = worktree / "SKILL.md"
        installed.write_text(
            run_hn_signals.PROMPT.read_text(encoding="utf-8"), encoding="utf-8"
        )
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        return worktree

    @staticmethod
    def fake_run(calls: list[list[str]], *, fetch_code: int = 0, resolved_sha: str = "a" * 40):
        def run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command == ["git", "remote"]:
                return 0, "origin\n"
            if command[:3] == ["git", "fetch", "--quiet"]:
                return fetch_code, "" if fetch_code == 0 else "network unreachable"
            if command[:3] == ["git", "rev-parse", "--verify"]:
                return 0, resolved_sha + "\n"
            if command[:2] == ["git", "worktree"]:
                return 0, ""
            return 0, ""  # verify_signal_pages.py --refresh
        return run

    def test_default_from_ref_resolves_origin_main(self) -> None:
        self.prepared_worktree()
        calls: list[list[str]] = []
        code = run_hn_signals.prepare(limit=5, run=self.fake_run(calls))
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", "--verify", "origin/main"], calls)

    def test_a_fetch_failure_on_the_default_ref_is_fatal(self) -> None:
        self.prepared_worktree()
        calls: list[list[str]] = []
        code = run_hn_signals.prepare(limit=5, run=self.fake_run(calls, fetch_code=1))
        self.assertEqual(1, code)
        self.assertNotIn(["git", "worktree", "remove", "--force", str(run_hn_signals.WORKTREE)], calls)

    def test_a_fetch_failure_on_a_local_ref_is_tolerated(self) -> None:
        self.prepared_worktree()
        calls: list[list[str]] = []
        code = run_hn_signals.prepare(
            limit=5, run=self.fake_run(calls, fetch_code=1), from_ref="local-sweep-branch"
        )
        self.assertEqual(0, code)

    def test_prepare_builds_the_worktree_from_the_given_ref(self) -> None:
        worktree = self.prepared_worktree()
        calls: list[list[str]] = []
        sha = "b" * 40
        code = run_hn_signals.prepare(
            limit=5, run=self.fake_run(calls, resolved_sha=sha), from_ref="local-sweep-branch"
        )
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", "--verify", "local-sweep-branch"], calls)
        self.assertIn(
            ["git", "worktree", "add", "--quiet", "--detach", str(worktree), sha], calls
        )

    def test_prepare_records_the_resolved_sha_in_the_bundle_directory(self) -> None:
        worktree = self.prepared_worktree()
        calls: list[list[str]] = []
        sha = "c" * 40
        code = run_hn_signals.prepare(limit=5, run=self.fake_run(calls, resolved_sha=sha))
        self.assertEqual(0, code)
        recorded = json.loads((worktree / run_hn_signals.BASE_REF).read_text(encoding="utf-8"))
        self.assertEqual(sha, recorded["sha"])
        self.assertEqual("origin/main", recorded["from_ref"])


class PreparedBaseRefTests(unittest.TestCase):
    """The SHA `prepare` records is the one `finish` uses."""

    def test_finish_reads_the_sha_prepare_recorded(self) -> None:
        sha = "d" * 40

        def read(path: str) -> str:
            self.assertEqual(run_hn_signals.BASE_REF, path)
            return json.dumps({"sha": sha, "from_ref": "local-sweep-branch"})

        self.assertEqual(sha, run_hn_signals.prepared_base_ref(read))

    def test_no_recorded_sha_falls_back_to_origin_main(self) -> None:
        def missing(_path: str) -> str:
            raise OSError("no such file")

        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(missing))

    def test_a_malformed_bundle_falls_back_to_origin_main(self) -> None:
        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(lambda _p: "not json"))


class FinishUsesRecordedBaseTests(unittest.TestCase):
    """`finish` must compare against the exact commit `prepare` recorded, in every place
    it otherwise falls back to origin/main: the head-moved comparison, the committed-diff
    blast-radius check, and the `git show <base>:<queue>` field-guard baseline."""

    QUEUE_DOC: ClassVar[str] = json.dumps({
        "version": "1.0", "updated_at": "x", "source": None,
        "signals": [{
            "story_id": "1", "story_url": "https://news.ycombinator.com/item?id=1",
            "title": "t", "url": "https://vendor.example/x", "points": 10,
            "num_comments": 1, "submitted_at": "2026-09-08T00:00:00Z",
            "page_status": "readable", "content_sha256": "a" * 64,
            "fetched_at": "2026-09-09T00:00:00Z", "status": "provisional",
            "discovered_at": "2026-09-09",
        }],
    })

    def responder(self, calls: list[list[str]], *, base_sha: str, head: str = "1111"):
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/hn-signals.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, (head if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"{base_sha}:{run_hn_signals.QUEUE}", command[2])
                return 0, self.QUEUE_DOC
            if command[:2] == ["git", "diff"]:
                self.assertIn(base_sha, command)
                self.assertNotIn("origin/main", command)
                return 0, run_hn_signals.QUEUE
            return 0, ""
        return fake_run

    def read(self, base_sha: str):
        def _read(path: str) -> str:
            if path == run_hn_signals.BASE_REF:
                return json.dumps({"sha": base_sha, "from_ref": "local-sweep-branch"})
            return self.QUEUE_DOC
        return _read

    def test_finish_uses_the_recorded_sha_in_place_of_origin_main(self) -> None:
        base_sha = "e" * 40
        calls: list[list[str]] = []
        code = run_hn_signals.finish(
            run=self.responder(calls, base_sha=base_sha), read=self.read(base_sha)
        )
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", base_sha], calls)
        self.assertNotIn(["git", "rev-parse", "origin/main"], calls)

    def test_finish_falls_back_to_origin_main_when_nothing_was_recorded(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/hn-signals.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else "origin/main") + "\n"
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"origin/main:{run_hn_signals.QUEUE}", command[2])
                return 0, self.QUEUE_DOC
            return 0, ""

        def read_without_a_recorded_base(path: str) -> str:
            if path == run_hn_signals.BASE_REF:
                raise OSError("no bundle")
            return self.QUEUE_DOC

        code = run_hn_signals.finish(run=fake_run, read=read_without_a_recorded_base)
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", "origin/main"], calls)


class GuardFiresAgainstALocalBaseTests(unittest.TestCase):
    """`unexpected_field_changes` must reject a run that adds a signal exactly the same
    way whether the base it compares against is origin/main or a local ref's commit."""

    BEFORE = json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []})

    def test_an_added_signal_is_rejected_when_the_base_is_a_local_commit(self) -> None:
        base_sha = "f" * 40
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/hn-signals.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"{base_sha}:{run_hn_signals.QUEUE}", command[2])
                return 0, self.BEFORE
            return 0, ""

        def fake_read(path: str) -> str:
            if path == run_hn_signals.BASE_REF:
                return json.dumps({"sha": base_sha, "from_ref": "local-sweep-branch"})
            return document()

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=fake_run, read=fake_read)
        self.assertEqual(1, code)
        self.assertIn("only the sweep adds", stderr.getvalue())
        self.assertNotIn(["git", "commit", "-m"], [call[:2] for call in calls])


class CLIFromRefWiringTests(unittest.TestCase):
    def test_main_passes_from_ref_through_to_prepare(self) -> None:
        with mock.patch.object(run_hn_signals, "prepare", return_value=0) as prepare_mock:
            code = run_hn_signals.main(
                ["prepare", "--from-ref", "local-sweep-branch", "--limit", "7"]
            )
        self.assertEqual(0, code)
        prepare_mock.assert_called_once_with(limit=7, from_ref="local-sweep-branch")

    def test_main_defaults_from_ref_to_origin_main(self) -> None:
        with mock.patch.object(run_hn_signals, "prepare", return_value=0) as prepare_mock:
            run_hn_signals.main(["prepare"])
        prepare_mock.assert_called_once_with(limit=40, from_ref="origin/main")


if __name__ == "__main__":
    unittest.main()
