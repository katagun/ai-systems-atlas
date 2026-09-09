from __future__ import annotations

import hashlib
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


if __name__ == "__main__":
    unittest.main()
