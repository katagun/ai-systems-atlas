from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
