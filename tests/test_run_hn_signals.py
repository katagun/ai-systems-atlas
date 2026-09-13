from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import subprocess
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

    Every signal here carries an `assessment` and passes `baseline=[]`: `refresh=False`
    now scopes to signals `assessed_story_ids` finds new against the baseline (see
    `RecheckScopeTests`), so a signal with no assessment would never reach the fetcher
    these tests are exercising.
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
            "assessment": {"verdict": "worth_review"},
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
            refresh=False, fetcher=lambda url: "the page changed since the sweep",
            signals_path=path, baseline=[],
        )
        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)

    def test_a_page_that_still_matches_the_recorded_digest_is_not_reported(self) -> None:
        from scripts import verify_signal_pages

        original = "the original vendor page text"
        path, _digest = self.signals_document(original)
        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: original, signals_path=path, baseline=[]
        )
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
            suppressed=0,
            discovered_at="2026-09-09",
            fetcher=lambda url: page,
        )
        self.assertEqual(document["signals"][0]["page_status"], "readable")
        # The sweep itself never writes an assessment; add one so this signal falls
        # inside the scope `refresh=False` now checks (see class docstring).
        document["signals"][0]["assessment"] = {"verdict": "worth_review"}
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "hn-signals.json"
        path.write_text(json.dumps(document), encoding="utf-8")

        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: page, signals_path=path, baseline=[]
        )

        self.assertEqual(problems, [])


class BundleCapTests(unittest.TestCase):
    """MAX_BUNDLE_CHARS caps only what verify() writes into bundle.json for the
    routine's model to read. The drift check must keep hashing the FULL extracted
    text, before any truncation — a bug that hashed the truncated prefix instead would
    report every long page as drifted (or worse, miss a real change past the cap)."""

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
            # A `refresh=False` call below now scopes to signals with an assessment new
            # against the (empty) baseline it passes; harmless for `refreshed_bundle`'s
            # `refresh=True` calls, which check every readable signal regardless.
            "assessment": {"verdict": "worth_review"},
        }
        path.write_text(
            json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": [signal]}),
            encoding="utf-8",
        )
        return path, digest

    def refreshed_bundle(self, page_text: str) -> dict:
        """Run verify(refresh=True) against a fake single-signal queue and return the
        bundle it wrote — with BUNDLE_DIR patched to a temp dir, never the real
        checkout's `.hn-signal-bundle/` (see NoStrayBundleInTheRealCheckoutTests)."""
        from scripts import verify_signal_pages

        path, _digest = self.signals_document(page_text)
        bundle_dir = Path(self.enterContext(tempfile.TemporaryDirectory())) / ".hn-signal-bundle"
        self.enterContext(mock.patch.object(verify_signal_pages, "BUNDLE_DIR", bundle_dir))
        problems = verify_signal_pages.verify(
            refresh=True, fetcher=lambda url: page_text, signals_path=path
        )
        self.assertEqual(problems, [])
        return json.loads((bundle_dir / "bundle.json").read_text(encoding="utf-8"))

    def test_a_page_longer_than_the_cap_is_truncated_and_carries_the_marker(self) -> None:
        from scripts import verify_signal_pages

        page = "x" * (verify_signal_pages.MAX_BUNDLE_CHARS + 500)
        bundled = self.refreshed_bundle(page)["1"]
        self.assertTrue(bundled.startswith("x" * verify_signal_pages.MAX_BUNDLE_CHARS))
        self.assertLess(len(bundled), len(page))
        self.assertIn("truncated", bundled)
        self.assertIn("https://vendor.example/launch", bundled)

    def test_a_page_shorter_than_the_cap_is_untouched_and_carries_no_marker(self) -> None:
        page = "a short vendor page, well under the cap"
        bundled = self.refreshed_bundle(page)["1"]
        self.assertEqual(bundled, page)
        self.assertNotIn("truncated", bundled)

    def test_the_hash_is_computed_over_the_full_text_not_the_truncated_text(self) -> None:
        """The digest that gates drift detection must be taken over the page BEFORE
        MAX_BUNDLE_CHARS ever applies. A page far longer than the cap still verifies
        clean against a digest recorded over its full text, even though only the first
        MAX_BUNDLE_CHARS of it are ever written to the bundle."""
        from scripts import verify_signal_pages

        page = "x" * (verify_signal_pages.MAX_BUNDLE_CHARS + 5000)
        self.assertGreater(len(page), verify_signal_pages.MAX_BUNDLE_CHARS)
        path, full_digest = self.signals_document(page)
        truncated_digest = hashlib.sha256(
            page[: verify_signal_pages.MAX_BUNDLE_CHARS].encode("utf-8")
        ).hexdigest()
        self.assertNotEqual(full_digest, truncated_digest)

        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: page, signals_path=path, baseline=[]
        )

        self.assertEqual(problems, [])

    def test_a_change_past_the_cap_is_still_reported_as_drift(self) -> None:
        """Existing drift behaviour is unchanged: the comparison covers the whole page,
        not just the prefix that would end up in the bundle."""
        from scripts import verify_signal_pages

        original = "x" * (verify_signal_pages.MAX_BUNDLE_CHARS + 5000)
        path, _digest = self.signals_document(original)
        changed = original[:-1] + "y"  # differs only at the very end, past the cap
        self.assertEqual(changed[: verify_signal_pages.MAX_BUNDLE_CHARS], original[: verify_signal_pages.MAX_BUNDLE_CHARS])

        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: changed, signals_path=path, baseline=[]
        )

        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)


class RecheckScopeTests(unittest.TestCase):
    """`--recheck` (refresh=False) must verify only the signals THIS RUN's assessments
    actually cite, judged against a baseline queue — never a drifted page nobody
    assessed. Mirrors `blocks_to_recheck` in build_candidate_evidence.py, including its
    refusal to scope on `proposed_at` or `proposer`, both written by the run being
    policed."""

    def signal(self, **overrides) -> dict:
        signal = {
            "story_id": "1", "story_url": "https://news.ycombinator.com/item?id=1",
            "title": "A launch", "url": "https://vendor.example/launch", "points": 50,
            "num_comments": 4, "submitted_at": "2026-09-08T00:00:00Z", "page_status": "readable",
            "content_sha256": "a" * 64, "fetched_at": "2026-09-09T00:00:00Z",
            "status": "provisional", "discovered_at": "2026-09-09",
        }
        signal.update(overrides)
        return signal

    def queue_path(self, signals: list[dict]) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "hn-signals.json"
        path.write_text(
            json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": signals}),
            encoding="utf-8",
        )
        return path

    def test_a_drifted_page_with_no_assessment_does_not_fail_recheck(self) -> None:
        """The exact blocker: 13 signals drifted, 0 carried an assessment, and the old
        unscoped --recheck discarded 31 verifiable assessments over it."""
        from scripts import verify_signal_pages

        def unexpected_fetch(_url: str) -> str:
            raise AssertionError("a signal with no assessment must not be re-fetched")

        path = self.queue_path([self.signal(story_id="1")])
        problems = verify_signal_pages.verify(
            refresh=False, fetcher=unexpected_fetch, signals_path=path, baseline=[]
        )
        self.assertEqual(problems, [])

    def test_a_drifted_page_with_a_new_assessment_fails_recheck(self) -> None:
        from scripts import verify_signal_pages

        path = self.queue_path(
            [self.signal(story_id="1", assessment={"verdict": "worth_review"})]
        )
        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: "the page changed since the sweep",
            signals_path=path, baseline=[],
        )
        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)

    def test_an_assessment_already_in_the_baseline_does_not_refail_on_later_drift(self) -> None:
        """An assessment on the baseline was verified when it was introduced; a run that
        merely inherits it — and did not cite it — must not be failed by drift since."""
        from scripts import verify_signal_pages

        assessment = {"verdict": "worth_review"}
        path = self.queue_path([self.signal(story_id="1", assessment=dict(assessment))])
        baseline = [self.signal(story_id="1", assessment=dict(assessment))]

        def unexpected_fetch(_url: str) -> str:
            raise AssertionError("an assessment already on the baseline must not be re-fetched")

        problems = verify_signal_pages.verify(
            refresh=False, fetcher=unexpected_fetch, signals_path=path, baseline=baseline
        )
        self.assertEqual(problems, [])

    def test_back_dating_proposed_at_does_not_exempt_a_new_assessment(self) -> None:
        """proposed_at is written by the agent being policed, so it can never decide
        what gets verified — mirrors test_a_back_dated_block_is_still_refetched for the
        triage routine's identical guard."""
        from scripts import verify_signal_pages

        path = self.queue_path([self.signal(story_id="1", assessment={
            "verdict": "worth_review", "proposed_at": "2020-01-01", "proposer": "human",
        })])
        problems = verify_signal_pages.verify(
            refresh=False, fetcher=lambda url: "the page changed since the sweep",
            signals_path=path, baseline=[],
        )
        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)

    def test_assessed_story_ids_ignores_proposed_at_and_proposer_directly(self) -> None:
        from scripts import verify_signal_pages

        baseline = [{"story_id": "1"}]
        signals = [{
            "story_id": "1",
            "assessment": {"verdict": "worth_review", "proposed_at": "2020-01-01", "proposer": "human"},
        }]
        self.assertEqual({"1"}, verify_signal_pages.assessed_story_ids(signals, baseline))

    def test_assessed_story_ids_excludes_an_unchanged_baselined_assessment(self) -> None:
        from scripts import verify_signal_pages

        assessment = {"verdict": "worth_review", "proposed_at": "2026-09-01", "proposer": "hn-signals"}
        baseline = [{"story_id": "1", "assessment": dict(assessment)}]
        signals = [{"story_id": "1", "assessment": dict(assessment)}]
        self.assertEqual(set(), verify_signal_pages.assessed_story_ids(signals, baseline))

    def test_refresh_still_checks_every_readable_signal_regardless_of_assessment(self) -> None:
        """`--refresh` behaviour is unchanged: `prepare` must keep checking broadly, not
        just the signals an assessment happens to cite (there are none yet — `prepare`
        runs before the model writes any)."""
        from scripts import verify_signal_pages

        bundle_dir = Path(self.enterContext(tempfile.TemporaryDirectory())) / ".hn-signal-bundle"
        self.enterContext(mock.patch.object(verify_signal_pages, "BUNDLE_DIR", bundle_dir))
        path = self.queue_path([self.signal(story_id="1")])  # no assessment at all
        problems = verify_signal_pages.verify(
            refresh=True, fetcher=lambda url: "the page changed since the sweep", signals_path=path
        )
        self.assertTrue(any("changed since the sweep" in problem for problem in problems), problems)


class BaselineQueueSignalsTests(unittest.TestCase):
    """`baseline_queue_signals` mirrors `previous_candidates` in
    build_candidate_evidence.py: an unreadable or malformed baseline must widen scope
    (return `[]`, so every current assessment counts as new) rather than raise or narrow
    it."""

    def test_a_failed_git_show_returns_an_empty_baseline(self) -> None:
        from scripts import verify_signal_pages

        def failing_run(command, **_kwargs):
            return subprocess.CompletedProcess(command, 1, stdout="", stderr="fatal: bad revision")

        self.assertEqual(
            [], verify_signal_pages.baseline_queue_signals("no-such-ref", run=failing_run)
        )

    def test_a_resolvable_ref_returns_its_signals(self) -> None:
        from scripts import verify_signal_pages

        document = json.dumps({"signals": [{"story_id": "1"}]})

        def fake_run(command, **_kwargs):
            self.assertEqual(["git", "show", "abc123:directory/hn-signals.json"], command)
            return subprocess.CompletedProcess(command, 0, stdout=document, stderr="")

        self.assertEqual(
            [{"story_id": "1"}],
            verify_signal_pages.baseline_queue_signals("abc123", run=fake_run),
        )

    def test_malformed_json_returns_an_empty_baseline(self) -> None:
        from scripts import verify_signal_pages

        def fake_run(command, **_kwargs):
            return subprocess.CompletedProcess(command, 0, stdout="not json", stderr="")

        self.assertEqual(
            [], verify_signal_pages.baseline_queue_signals("abc123", run=fake_run)
        )

    def test_a_non_list_signals_field_returns_an_empty_baseline(self) -> None:
        from scripts import verify_signal_pages

        def fake_run(command, **_kwargs):
            return subprocess.CompletedProcess(command, 0, stdout='{"signals": "not-a-list"}', stderr="")

        self.assertEqual(
            [], verify_signal_pages.baseline_queue_signals("abc123", run=fake_run)
        )


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
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        # ROOT is where `prepare` writes BASE_REF. Left unpatched, `prepare` here would
        # plant `.hn-signal-bundle/base-ref.json` in this repository's own live checkout —
        # exactly the failure this routine exists to prevent developers from causing.
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))
        # Rendered for the patched ROOT: the drift check fills the checkout placeholder
        # with ROOT before comparing, so a raw copy would read as drift.
        installed.write_text(
            run_hn_signals.routine_guards.render_prompt(
                run_hn_signals.PROMPT.read_text(encoding="utf-8"), root
            ),
            encoding="utf-8",
        )
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


class PromptInstallTests(unittest.TestCase):
    """A scheduled run starts in no particular directory, so the installed prompt names its
    checkout — filled into the reviewed prompt's one placeholder, and nowhere else."""

    PLACEHOLDER = run_hn_signals.routine_guards.CHECKOUT_PLACEHOLDER

    def scratch(self) -> Path:
        return Path(self.enterContext(tempfile.TemporaryDirectory()))

    def test_drift_accepts_only_the_prompt_rendered_for_this_checkout(self) -> None:
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", Path("/machine/atlas")))
        reviewed = f"cd {self.PLACEHOLDER}\nbody\n"
        self.assertIsNone(run_hn_signals.prompt_drift(reviewed, "cd /machine/atlas\nbody\n"))
        self.assertIsNotNone(run_hn_signals.prompt_drift(reviewed, "cd /elsewhere/atlas\nbody\n"))
        self.assertIsNotNone(run_hn_signals.prompt_drift(reviewed, reviewed))
        self.assertIsNotNone(
            run_hn_signals.prompt_drift(reviewed, "cd /machine/atlas\nbody\nand more\n")
        )

    def test_install_prompt_writes_the_prompt_the_drift_check_accepts(self) -> None:
        scratch = self.scratch()
        prompt = scratch / "hn-signals.md"
        prompt.write_text(f"cd {self.PLACEHOLDER}\nbody\n", encoding="utf-8")
        installed = scratch / "scheduled-tasks" / "hn-signals" / "SKILL.md"
        checkout = scratch / "checkout"
        self.enterContext(mock.patch.object(run_hn_signals, "PROMPT", prompt))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", checkout))
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(0, run_hn_signals.main(["install-prompt"]))
        self.assertEqual(f"cd {checkout}\nbody\n", installed.read_text(encoding="utf-8"))
        self.assertIsNone(
            run_hn_signals.prompt_drift(
                prompt.read_text(encoding="utf-8"), installed.read_text(encoding="utf-8")
            )
        )

    def test_install_prompt_refuses_a_symlinked_task_directory(self) -> None:
        scratch = self.scratch()
        prompt = scratch / "hn-signals.md"
        prompt.write_text("body\n", encoding="utf-8")
        elsewhere = scratch / "elsewhere"
        elsewhere.mkdir()
        tasks = scratch / "scheduled-tasks"
        tasks.mkdir()
        (tasks / "hn-signals").symlink_to(elsewhere)
        installed = tasks / "hn-signals" / "SKILL.md"
        self.enterContext(mock.patch.object(run_hn_signals, "PROMPT", prompt))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(1, run_hn_signals.main(["install-prompt"]))
        self.assertIn("symlink", stderr.getvalue())
        self.assertFalse((elsewhere / "SKILL.md").exists())


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

    @staticmethod
    def canonical_run(command: list[str], _cwd=None) -> tuple[int, str]:
        if command == ["git", "remote"]:
            return 0, "origin\n"
        if command[:3] == ["git", "rev-parse", "--symbolic-full-name"]:
            return 0, "refs/remotes/origin/main\n"
        return 1, ""

    def test_a_canonically_spelled_remote_ref_is_treated_as_remote_tracking(self) -> None:
        """"refs/remotes/origin/main" is "origin/main" spelled canonically. Splitting the
        literal string on "/" yields the prefix "refs", which matches no remote — the bug
        this guards: that spelling must classify the same as the shorthand, not tolerate
        a fetch failure the shorthand would treat as fatal."""
        self.assertTrue(
            run_hn_signals.is_remote_tracking_ref("refs/remotes/origin/main", self.canonical_run)
        )

    def test_a_ref_resolving_to_a_local_branch_is_not_remote_tracking(self) -> None:
        def run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command == ["git", "remote"]:
                return 0, "origin\n"
            if command[:3] == ["git", "rev-parse", "--symbolic-full-name"]:
                return 0, "refs/heads/my-local-sweep-branch\n"
            return 1, ""

        self.assertFalse(run_hn_signals.is_remote_tracking_ref("my-local-sweep-branch", run))


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
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        # ROOT is where BASE_REF is written now — never WORKTREE, the model's own
        # directory. Pointed at a scratch dir so the test never touches this repo's own
        # (git-ignored) .hn-signal-bundle/.
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))
        # Rendered for the patched ROOT: the drift check fills the checkout placeholder
        # with ROOT before comparing, so a raw copy would read as drift.
        installed.write_text(
            run_hn_signals.routine_guards.render_prompt(
                run_hn_signals.PROMPT.read_text(encoding="utf-8"), root
            ),
            encoding="utf-8",
        )
        return worktree

    @staticmethod
    def fake_run(
        calls: list[list[str]], *, fetch_code: int = 0, resolved_sha: str = "a" * 40,
        remotes: str = "origin\n",
    ):
        def run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command == ["git", "remote"]:
                return 0, remotes
            if command[:3] == ["git", "rev-parse", "--symbolic-full-name"]:
                return 0, ""
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

    def test_prepare_records_the_resolved_sha_under_root_not_the_worktree(self) -> None:
        """The record `finish` trusts must land outside WORKTREE — the model's own
        directory — or the model could simply overwrite it."""
        worktree = self.prepared_worktree()
        calls: list[list[str]] = []
        sha = "c" * 40
        code = run_hn_signals.prepare(limit=5, run=self.fake_run(calls, resolved_sha=sha))
        self.assertEqual(0, code)
        recorded = json.loads(
            (run_hn_signals.ROOT / run_hn_signals.BASE_REF).read_text(encoding="utf-8")
        )
        self.assertEqual(sha, recorded["sha"])
        self.assertEqual("origin/main", recorded["from_ref"])
        self.assertFalse((worktree / run_hn_signals.BASE_REF).exists())

    def test_a_from_ref_naming_a_remote_other_than_origin_is_rejected(self) -> None:
        """`prepare` only ever fetches `origin`. A ref naming another remote (here
        "fork") would be classified remote-tracking, so a fetch failure would be fatal —
        but the fetch that runs never touches that remote, so the freshness check would
        pass while the baseline is arbitrarily stale. Rejecting it is the chosen fix."""
        self.prepared_worktree()
        calls: list[list[str]] = []
        code = run_hn_signals.prepare(
            limit=5,
            run=self.fake_run(calls, remotes="origin\nfork\n"),
            from_ref="fork/main",
        )
        self.assertEqual(1, code)
        self.assertNotIn(["git", "fetch", "--quiet", "origin"], calls)


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

    def test_a_recorded_value_that_is_not_a_commit_sha_falls_back_to_origin_main(self) -> None:
        """A recorded "sha" reaches `git` argv unchecked everywhere below — as a
        base ref in `git rev-parse`/`git diff`/`git show`. Without this check, a forged
        value like an option flag becomes an arbitrary-argv-injection primitive rather
        than a rejected record."""
        def forged(_path: str) -> str:
            return json.dumps({"sha": "--output=/tmp/pwn_probe"})

        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(forged))

    def test_reads_from_root_by_default_not_the_worktree(self) -> None:
        self.assertEqual(run_hn_signals.root_text, run_hn_signals.prepared_base_ref.__defaults__[0])

    def test_a_sha_with_a_trailing_newline_falls_back_rather_than_hard_erroring(self) -> None:
        """`$` in Python's `re` matches immediately before a trailing "\\n", so a `match`
        against a `$`-anchored pattern would accept `"<40 hex>\\n"` and pass a value
        carrying a newline straight to `git` argv. `fullmatch` against an unanchored
        pattern rejects it outright, same as any other malformed record."""
        sha = "a" * 40

        def read(_path: str) -> str:
            return json.dumps({"sha": sha + "\n"})

        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(read))


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

    def base_read(self, base_sha: str):
        """Stands in for `root_text`: must be consulted for BASE_REF only, never QUEUE —
        `finish` must never read the security decision out of the worktree."""
        def _read(path: str) -> str:
            self.assertEqual(run_hn_signals.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "local-sweep-branch"})
        return _read

    def queue_read(self):
        """Stands in for `worktree_text`: must be consulted for QUEUE only."""
        def _read(path: str) -> str:
            self.assertEqual(run_hn_signals.QUEUE, path)
            return self.QUEUE_DOC
        return _read

    def test_finish_uses_the_recorded_sha_in_place_of_origin_main(self) -> None:
        base_sha = "e" * 40
        calls: list[list[str]] = []
        code = run_hn_signals.finish(
            run=self.responder(calls, base_sha=base_sha),
            read=self.queue_read(),
            base_read=self.base_read(base_sha),
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

        def base_read_without_a_recorded_base(path: str) -> str:
            self.assertEqual(run_hn_signals.BASE_REF, path)
            raise OSError("no bundle")

        code = run_hn_signals.finish(
            run=fake_run, read=self.queue_read(), base_read=base_read_without_a_recorded_base
        )
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

        def fake_base_read(path: str) -> str:
            self.assertEqual(run_hn_signals.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "local-sweep-branch"})

        def fake_read(path: str) -> str:
            self.assertEqual(run_hn_signals.QUEUE, path)
            return document()

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=fake_run, read=fake_read, base_read=fake_base_read)
        self.assertEqual(1, code)
        self.assertIn("only the sweep adds", stderr.getvalue())
        self.assertNotIn(["git", "commit", "-m"], [call[:2] for call in calls])


class FinishLabelsBaseSideProblemsWithTheRecordedShaTests(unittest.TestCase):
    """Mutation coverage: dropping `base_label=base_ref` at the `finish` call site
    reverts the diagnostic label to the literal default "origin/main" while every other
    assertion elsewhere in the suite stays green, because they check exit codes and argv,
    not this message text."""

    def test_a_base_side_problem_is_labelled_with_the_recorded_sha_not_origin_main(self) -> None:
        base_sha = "7" * 40
        malformed_base = json.dumps(
            {"version": "1.0", "updated_at": "x", "source": None, "signals": "not-a-list"}
        )
        after = document()

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/hn-signals.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "diff"]:
                return 0, run_hn_signals.QUEUE
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"{base_sha}:{run_hn_signals.QUEUE}", command[2])
                return 0, malformed_base
            return 0, ""

        def fake_base_read(path: str) -> str:
            self.assertEqual(run_hn_signals.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "local-sweep-branch"})

        def fake_read(path: str) -> str:
            self.assertEqual(run_hn_signals.QUEUE, path)
            return after

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=fake_run, read=fake_read, base_read=fake_base_read)
        self.assertEqual(1, code)
        self.assertIn(base_sha, stderr.getvalue())
        self.assertNotIn("origin/main", stderr.getvalue())


class FinishRefusesQueueDriftDuringChecksTests(unittest.TestCase):
    """The re-read-before-add guard: closes the deterministic form of the CHECKS-window
    bypass, where a command CHECKS runs (or something it shells out to) rewrites QUEUE
    after the field guard already read it and before `git add` stages it. See "Guard
    threat model" in docs/OPERATIONS.md."""

    def test_a_queue_rewritten_during_checks_is_refused(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/hn-signals.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, "1111\n"
            if command[:2] == ["git", "show"]:
                return 0, document()
            return 0, ""  # every CHECKS command, stubbed to succeed

        # The field guard reads a legitimately assessed queue; by the time `finish` would
        # stage it, the file on disk has drifted — standing in for a CHECKS command that
        # rewrote it in between.
        reads = iter([document(), document(points=9999)])

        def fake_read(path: str) -> str:
            self.assertEqual(run_hn_signals.QUEUE, path)
            return next(reads)

        def fake_base_read(path: str) -> str:
            raise OSError("no bundle")

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=fake_run, read=fake_read, base_read=fake_base_read)
        self.assertEqual(1, code)
        self.assertIn("changed after the field guard read it", stderr.getvalue())
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])
        self.assertNotIn(["git", "add"], [call[:2] for call in calls])


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


class RealGitPrepareFinishRoundTripTests(unittest.TestCase):
    """The only test in this suite that drives real git end to end. Every other test
    mocks `run` and `read`/`base_read`, so nothing else exercises the actual `prepare` ->
    `finish` handoff through a real worktree and a real ROOT-relative BASE_REF file — the
    writer/reader contract held only because independent tests agreed on the "sha" key,
    not because anything ran the round trip for real. `uv run ...` quality checks are
    stubbed out: this is about the security boundary (does a legitimate edit commit, does
    a forbidden one get rejected), not about this throwaway temp repo's own lint/tests."""

    def setUp(self) -> None:
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))
        root = scratch / "root"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "directory").mkdir()
        # Matches this repository's own `.gitignore`: `.hn-signal-bundle/` (where
        # `verify_signal_pages.py --refresh` writes its bundle, in a real run) is ignored
        # in production, so it never shows up in `git status --porcelain` for the blast-
        # radius guard to see. Without this file, that guard would pass here for a
        # different reason than it does for real — nothing in this fixture ever creates
        # the directory, since the `uv run ...` step that would is stubbed below — rather
        # than because the directory is actually ignored.
        (root / ".gitignore").write_text(".hn-signal-bundle/\n", encoding="utf-8")
        (root / run_hn_signals.QUEUE).write_text(
            json.dumps({
                "version": "1.0", "updated_at": "x", "source": None,
                "signals": [{
                    "story_id": "1", "story_url": "https://news.ycombinator.com/item?id=1",
                    "title": "t", "url": "https://vendor.example/x", "points": 10,
                    "num_comments": 1, "submitted_at": "2026-09-08T00:00:00Z",
                    # unreadable, not readable: sidesteps the page-drift bundle check,
                    # which is orthogonal to what this test drives.
                    "page_status": "unreadable", "content_sha256": "a" * 64,
                    "fetched_at": "2026-09-09T00:00:00Z", "status": "provisional",
                    "discovered_at": "2026-09-09",
                }],
            }),
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "init"], check=True)
        subprocess.run(["git", "-C", str(root), "branch", "-M", "local-sweep-branch"], check=True)

        worktree = scratch / "worktree"
        installed = scratch / "SKILL.md"

        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))
        # Rendered for the patched ROOT: the drift check fills the checkout placeholder
        # with ROOT before comparing, so a raw copy would read as drift.
        installed.write_text(
            run_hn_signals.routine_guards.render_prompt(
                run_hn_signals.PROMPT.read_text(encoding="utf-8"), root
            ),
            encoding="utf-8",
        )
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.enterContext(mock.patch.object(run_hn_signals, "INSTALLED_PROMPT", installed))
        self.root = root
        self.worktree = worktree

    @staticmethod
    def hybrid_run(command: list[str], cwd=None) -> tuple[int, str]:
        if command and command[0] == "git":
            return run_hn_signals.shell(command, cwd)
        return 0, ""  # every "uv run ..." quality check, stubbed to succeed

    def test_an_assessment_only_edit_commits(self) -> None:
        code = run_hn_signals.prepare(limit=5, run=self.hybrid_run, from_ref="local-sweep-branch")
        self.assertEqual(0, code)

        queue_path = self.worktree / run_hn_signals.QUEUE
        queue = json.loads(queue_path.read_text(encoding="utf-8"))
        queue["signals"][0]["assessment"] = {"verdict": "worth_review"}
        queue_path.write_text(json.dumps(queue), encoding="utf-8")

        code = run_hn_signals.finish(run=self.hybrid_run)
        self.assertEqual(0, code)

        branch_code, branch_sha = run_hn_signals.shell(
            ["git", "rev-parse", "hn-signals/pending"], self.worktree
        )
        self.assertEqual(0, branch_code)
        diff_code, changed = run_hn_signals.shell(
            ["git", "diff", "--name-only", "local-sweep-branch", branch_sha.strip()], self.root
        )
        self.assertEqual(0, diff_code)
        self.assertEqual(run_hn_signals.QUEUE, changed.strip())

    def test_a_forbidden_edit_is_rejected(self) -> None:
        code = run_hn_signals.prepare(limit=5, run=self.hybrid_run, from_ref="local-sweep-branch")
        self.assertEqual(0, code)
        _, head_before = run_hn_signals.shell(["git", "rev-parse", "HEAD"], self.worktree)

        (self.worktree / "other.txt").write_text("not the queue", encoding="utf-8")

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=self.hybrid_run)
        self.assertEqual(1, code)
        self.assertIn("other.txt", stderr.getvalue())

        _, head_after = run_hn_signals.shell(["git", "rev-parse", "HEAD"], self.worktree)
        self.assertEqual(head_before, head_after)
        branch_code, _ = run_hn_signals.shell(
            ["git", "rev-parse", "--verify", "hn-signals/pending"], self.worktree
        )
        self.assertNotEqual(0, branch_code)


class ReplaceRefGuardTests(unittest.TestCase):
    """The reviewer's decisive bypass: `git replace -f <pinned-sha> <forged-sha>`, run
    from inside the worktree, makes `git diff`/`git show` silently substitute a different
    object for the one a 40-hex SHA names — no filesystem access outside the worktree
    needed, because `refs/replace/*` lives in the git dir every worktree shares."""

    def setUp(self) -> None:
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))
        root = scratch / "root"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "directory").mkdir()
        (root / ".gitignore").write_text(".hn-signal-bundle/\n", encoding="utf-8")
        (root / run_hn_signals.QUEUE).write_text(
            json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []}),
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "init"], check=True)
        # A second commit gives `git replace` a distinct object to swap the first one for.
        (root / "other.txt").write_text("second commit\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "second"], check=True)

        worktree = scratch / "worktree"
        subprocess.run(
            ["git", "-C", str(root), "worktree", "add", "--quiet", "--detach", str(worktree), "HEAD"],
            check=True,
        )
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))
        self.enterContext(mock.patch.object(run_hn_signals, "WORKTREE", worktree))
        self.root = root
        self.worktree = worktree

    def plant_replace_ref(self) -> None:
        _, head = run_hn_signals.shell(["git", "rev-parse", "HEAD"], self.worktree)
        _, parent = run_hn_signals.shell(["git", "rev-parse", "HEAD~1"], self.worktree)
        code, output = run_hn_signals.shell(
            ["git", "replace", "-f", head.strip(), parent.strip()], self.worktree
        )
        self.assertEqual(0, code, output)

    def test_a_populated_replace_ref_is_refused(self) -> None:
        self.plant_replace_ref()

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = run_hn_signals.finish(run=run_hn_signals.shell)
        self.assertEqual(1, code)
        self.assertIn("refs/replace", stderr.getvalue())

    def test_git_diff_is_blinded_by_a_replace_ref_without_the_env_var(self) -> None:
        """Proves the exploit is real and that `routine_guards.shell` actually closes it:
        a diff that should show `other.txt` goes empty once HEAD is replaced by its own
        parent, using plain `subprocess.run` with no `GIT_NO_REPLACE_OBJECTS`. The same
        diff run through `run_hn_signals.shell` (which sets that variable) still shows the
        real change."""
        self.plant_replace_ref()
        _, head = run_hn_signals.shell(["git", "rev-parse", "HEAD"], self.worktree)
        _, parent = run_hn_signals.shell(["git", "rev-parse", "HEAD~1"], self.worktree)

        # The negative control must run with GIT_NO_REPLACE_OBJECTS genuinely unset.
        # `finish` invokes this suite through `routine_guards.shell`, which sets that
        # variable, so a bare `subprocess.run` here inherits it from the parent and the
        # diff is never blinded -- the assertion below then fails whenever the suite runs
        # as part of a real routine run, which is the only time it matters.
        plain_env = {k: v for k, v in os.environ.items() if k != "GIT_NO_REPLACE_OBJECTS"}
        blinded = subprocess.run(
            ["git", "diff", "--name-only", parent.strip(), head.strip()],
            capture_output=True, text=True, cwd=self.worktree, env=plain_env,
        )
        self.assertEqual("", blinded.stdout.strip())

        immune_code, immune_output = run_hn_signals.shell(
            ["git", "diff", "--name-only", parent.strip(), head.strip()], self.worktree
        )
        self.assertEqual(0, immune_code)
        self.assertIn("other.txt", immune_output)

    def test_shell_sets_git_no_replace_objects_in_the_subprocess_environment(self) -> None:
        """Direct environment assertion, independent of observed git behavior above."""
        captured: dict[str, dict] = {}
        real_run = subprocess.run

        def spying_run(*args, **kwargs):
            captured["env"] = kwargs.get("env")
            return real_run(*args, **kwargs)

        with mock.patch("subprocess.run", spying_run):
            run_hn_signals.shell(["git", "rev-parse", "HEAD"], self.worktree)
        self.assertEqual("1", captured["env"]["GIT_NO_REPLACE_OBJECTS"])


class SymlinkedBaseRecordTests(unittest.TestCase):
    """The reviewer's other bypass: replace ROOT's base-record file with a symlink into
    the worktree, so a value the model fully controls is read as the trusted base."""

    def test_a_symlinked_base_record_is_refused(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        (root / ".hn-signal-bundle").mkdir()
        forged = root / "forged.json"
        forged.write_text(json.dumps({"sha": "1" * 40, "from_ref": "forged"}), encoding="utf-8")
        (root / run_hn_signals.BASE_REF).symlink_to(forged)
        # Without this, `root_text` reads ROOT as still pointed at the real checkout, so
        # the assertion below passes whether or not the symlink refusal fires — the same
        # forgot-to-patch-ROOT defect PrepareDriftTests had.
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))

        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(run_hn_signals.root_text))

    def test_root_text_raises_rather_than_follows_a_symlink(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        target = root / "elsewhere.txt"
        target.write_text("attacker-controlled", encoding="utf-8")
        link = root / "linked.txt"
        link.symlink_to(target)
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))

        with self.assertRaises(OSError):
            run_hn_signals.root_text("linked.txt")

    def test_a_symlinked_base_directory_is_refused(self) -> None:
        """A narrower bypass than the file-level one above: `base-ref.json` itself stays a
        plain file, but `.hn-signal-bundle` — the directory it lives under — is a symlink
        to somewhere outside ROOT. `Path.is_symlink()` on the file alone would pass."""
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        elsewhere = tempfile.TemporaryDirectory()
        self.addCleanup(elsewhere.cleanup)
        forged_dir = Path(elsewhere.name)
        (forged_dir / "base-ref.json").write_text(
            json.dumps({"sha": "1" * 40, "from_ref": "forged"}), encoding="utf-8"
        )
        (root / ".hn-signal-bundle").symlink_to(forged_dir)
        self.enterContext(mock.patch.object(run_hn_signals, "ROOT", root))

        self.assertEqual("origin/main", run_hn_signals.prepared_base_ref(run_hn_signals.root_text))


class NoStrayBundleInTheRealCheckoutTests(unittest.TestCase):
    """Regression guard for the bug this suite itself used to have: a test class that
    forgot to patch ROOT could plant `.hn-signal-bundle/base-ref.json` in this
    repository's own live checkout. Every test above now patches ROOT to a temp
    directory, so nothing in this run should have touched the real one."""

    def test_running_the_suite_leaves_no_stray_bundle_in_the_real_checkout(self) -> None:
        real_root = Path(__file__).resolve().parents[1]
        self.assertFalse((real_root / run_hn_signals.BASE_REF).exists())


if __name__ == "__main__":
    unittest.main()
