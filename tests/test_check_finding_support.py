"""A finding must say what its pinned documents say, and the check can never reach out here."""

from __future__ import annotations

import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import check_finding_support as cfs
from scripts.build_candidate_evidence import content_hash

README = """# Hive

The agent harness for production workloads. It is released under the terms in LICENSE
(the "License"); see that file.

## License

MIT - use it however you want.

Features: **Crash-safe** park/resume, and `cost enforcement`.
"""


class FakeResponse(io.BytesIO):
    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def blob_getter(texts: dict[str, str], calls: list[str] | None = None):
    def getter(path: str, token: str | None) -> dict[str, str]:
        if calls is not None:
            calls.append(path)
        sha = path.rsplit("/", 1)[1]
        return {
            "encoding": "base64",
            "content": base64.b64encode(texts[sha].encode()).decode(),
        }

    return getter


def evidence(label: str, sha: str, text: str) -> dict[str, str]:
    return {
        "label": label,
        "kind": "git_blob",
        "blob_sha": sha,
        "content_sha256": content_hash(text),
        "url": "https://github.com/o/r",
    }


class QuoteReportTests(unittest.TestCase):
    def report(self, finding: str) -> tuple[int, list[str]]:
        return cfs.quote_report(finding, {"README": README})

    def test_a_verbatim_quote_is_found(self) -> None:
        self.assertEqual(
            (1, []),
            self.report(
                'It calls itself "The agent harness for production workloads".'
            ),
        )

    def test_words_the_source_never_used_are_missing(self) -> None:
        checked, missing = self.report(
            'The README says "The agent harness for regulated banks".'
        )
        self.assertEqual(1, checked)
        self.assertEqual(["The agent harness for regulated banks"], missing)

    def test_a_heading_fused_into_a_quote_is_not_verbatim(self) -> None:
        """The real miss of 2026-09-20: a heading and its body joined by an invented colon."""
        _, missing = self.report('It states "License: MIT - use it however you want,".')
        self.assertEqual(1, len(missing))

    def test_typography_is_not_wording(self) -> None:
        for finding in (
            'It says "MIT - use it however you want,".',  # comma tucked inside the quote
            "It says \u201cMIT \u2013 use it however you want\u201d.",  # curly, en dash
            'It lists "Crash-safe park/resume, and cost enforcement".',  # Markdown marks
            'It says "The agent   harness for\nproduction workloads".',  # whitespace
        ):
            with self.subTest(finding=finding):
                self.assertEqual((1, []), self.report(finding))

    def test_a_quote_containing_quotes_is_not_split_into_the_agents_own_prose(
        self,
    ) -> None:
        checked, missing = self.report(
            'It opens "released under the terms in LICENSE (the "License"); see that '
            'file", so licence evidence exists, and adds "MIT - use it however you want".'
        )
        self.assertEqual((2, []), (checked, missing))

    def test_an_elided_quote_needs_every_part_in_order(self) -> None:
        self.assertEqual(
            (1, []),
            self.report('It says "The agent harness ... use it however you want".'),
        )
        _, missing = self.report(
            'It says "use it however you want ... The agent harness for production".'
        )
        self.assertEqual(1, len(missing))

    def test_short_quoted_words_are_not_treated_as_citations(self) -> None:
        self.assertEqual((0, []), self.report('It is "beta" and "local-first".'))


class SentenceTests(unittest.TestCase):
    def test_sentences_about_the_review_itself_are_never_sent_for_judgment(
        self,
    ) -> None:
        finding = (
            "The README describes a crash-safe agent harness. "
            "The bundle reports no cross-collection hits. "
            "ADR 020 compares operational boundaries, not repositories. "
            "GitHub reports NOASSERTION. "
            "Boundary question: is the hosted service covered by this licence?"
        )
        self.assertEqual(
            ["The README describes a crash-safe agent harness."],
            cfs.sentences(finding),
        )

    def test_a_full_stop_inside_a_quotation_mark_still_ends_a_sentence(self) -> None:
        parts = cfs.sentences(
            'It says "use it however you want." The project ships a CLI for it.'
        )
        self.assertEqual(2, len(parts))


class CheckBlockTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cache = Path(self.enterContext(tempfile.TemporaryDirectory())) / "cache"
        self.triage = {
            "finding": (
                'The README calls it "The agent harness for production workloads". '
                "The README says the project holds SOC 2 certification."
            ),
            "evidence": [evidence("README", "a" * 40, README)],
        }

    def answering(self, choices: list[tuple[str, float]], seen: list | None = None):
        def opener(request, timeout):
            body = json.loads(request.data)
            if seen is not None:
                seen.append(body)
            answers = {
                f"s{i}": {"type": "choice", "choice": choice, "confidence": confidence}
                for i, (choice, confidence) in enumerate(choices)
            }
            return FakeResponse(json.dumps({"answers": answers}).encode())

        return opener

    def check(self, **kwargs) -> cfs.BlockReport:
        kwargs.setdefault("getter", blob_getter({"a" * 40: README}))
        return cfs.check_block("o/r", "o/r", self.triage, cache=self.cache, **kwargs)

    def test_without_a_key_only_quotes_are_checked_and_nothing_is_sent(self) -> None:
        def opener(request, timeout):
            raise AssertionError("no key, so the API must not be reached")

        report = self.check(api_key=None, opener=opener)
        self.assertEqual(1, report.quotes_checked)
        self.assertEqual([], report.quotes_missing)
        self.assertEqual([], report.claims)

    def test_an_immutable_blob_is_fetched_once_and_then_read_from_the_cache(
        self,
    ) -> None:
        calls: list[str] = []
        getter = blob_getter({"a" * 40: README}, calls)
        self.check(getter=getter)
        self.check(getter=getter)
        self.assertEqual([f"/repos/o/r/git/blobs/{'a' * 40}"], calls)

    def test_each_sentence_is_one_question_over_the_documents(self) -> None:
        seen: list[dict] = []
        report = self.check(
            api_key="k",
            opener=self.answering(
                [("supported", 0.99), ("not_in_documents", 0.95)], seen
            ),
        )
        self.assertEqual(["s0", "s1"], sorted(seen[0]["questions"]))
        self.assertEqual("README", seen[0]["state"]["documents"][0]["label"])
        self.assertEqual(
            ["The README says the project holds SOC 2 certification."],
            [claim["sentence"] for claim in report.flagged_claims],
        )

    def test_a_failed_judgment_leaves_the_quote_report_standing(self) -> None:
        def opener(request, timeout):
            raise OSError("unreachable, Bearer sk-secret")

        report = self.check(api_key="sk-secret", opener=opener)
        self.assertEqual("OSError", report.claims_error)
        self.assertEqual(1, report.quotes_checked)
        self.assertNotIn("sk-secret", cfs.render([report], judged=True))

    def as_drifted_web_page(self) -> None:
        item = self.triage["evidence"][0]
        item.update(kind="web", url="https://vendor.example/", content_sha256="0" * 64)
        del item["blob_sha"]
        self.enterContext(mock.patch.object(cfs, "fetch_web_text", return_value=README))

    def test_a_blob_that_does_not_match_its_digest_is_an_inconsistent_record(
        self,
    ) -> None:
        """A blob cannot drift. The real case of 2026-09-20 was LaVague's README, and
        treating it as drift hid the document and made every claim about it look false."""
        self.triage["evidence"][0]["content_sha256"] = "0" * 64
        seen: list[dict] = []
        report = self.check(
            api_key="k",
            opener=self.answering([("supported", 0.9), ("supported", 0.9)], seen),
        )
        self.assertEqual(["README"], report.mismatched)
        self.assertEqual([], report.drifted)
        self.assertEqual(1, report.quotes_checked)
        self.assertEqual("README", seen[0]["state"]["documents"][0]["label"])
        self.assertIn("RECORD INCONSISTENT", cfs.render([report], judged=True))

    def test_a_drifted_source_cannot_convict_a_quote(self) -> None:
        self.triage["finding"] = 'It says "words that were there when it was pinned".'
        self.as_drifted_web_page()
        report = self.check()
        self.assertEqual([], report.quotes_missing)
        self.assertIn("unverifiable", report.drifted[0])

    def test_claims_are_never_judged_against_a_document_that_changed(self) -> None:
        self.as_drifted_web_page()

        def opener(request, timeout):
            raise AssertionError("a drifted page must not be sent for judgment")

        report = self.check(api_key="k", opener=opener)
        self.assertEqual([], report.claims)
        self.assertIsNone(report.claims_error)

    def test_a_document_that_cannot_be_fetched_is_reported_not_raised(self) -> None:
        def getter(path, token):
            raise OSError("network down")

        report = self.check(getter=getter)
        self.assertEqual(["README: OSError"], report.unfetched)
        self.assertFalse(report.clean)

    def test_a_long_document_is_cut_and_says_so(self) -> None:
        long_text = "x" * (cfs.MAX_STATE_CHARS + 10)
        request = cfs.build_request(
            "A sentence long enough to be judged.", {"R": long_text}
        )
        document = request["state"]["documents"][0]
        self.assertTrue(document["truncated"])
        self.assertEqual(cfs.MAX_STATE_CHARS, len(document["text"]))


class RenderTests(unittest.TestCase):
    def report_with(self, confidence: float) -> cfs.BlockReport:
        return cfs.BlockReport(
            "o/r",
            quotes_checked=2,
            claims=[
                {
                    "sentence": "A claim.",
                    "choice": "contradicted",
                    "confidence": confidence,
                },
                {"sentence": "Fine.", "choice": "supported", "confidence": 0.99},
            ],
        )

    def test_a_confident_flag_is_listed(self) -> None:
        text = cfs.render([self.report_with(0.9)], judged=True)
        self.assertIn("contradicted (0.90): A claim.", text)
        self.assertIn("1 flagged at confidence 0.6 or above, 0 below", text)

    def test_a_weak_flag_is_counted_but_not_listed(self) -> None:
        text = cfs.render([self.report_with(0.3)], judged=True)
        self.assertNotIn("A claim.", text)
        self.assertIn("0 flagged at confidence 0.6 or above, 1 below", text)

    def test_a_missing_quote_is_always_listed(self) -> None:
        report = cfs.BlockReport("o/r", quotes_checked=1, quotes_missing=["never said"])
        text = cfs.render([report], judged=False)
        self.assertIn("QUOTE NOT IN SOURCE: 'never said'", text)
        self.assertIn("claims not judged: no TYPESAFE_API_KEY", text)


class MainTests(unittest.TestCase):
    def test_strict_fails_only_on_a_missing_quote(self) -> None:
        clean = cfs.BlockReport("a", quotes_checked=1)
        judged = cfs.BlockReport(
            "b", claims=[{"sentence": "x", "choice": "contradicted", "confidence": 1.0}]
        )
        missing = cfs.BlockReport("c", quotes_checked=1, quotes_missing=["q"])
        self.assertFalse(any(r.quotes_missing for r in (clean, judged)))
        self.assertTrue(any(r.quotes_missing for r in (clean, judged, missing)))


if __name__ == "__main__":
    unittest.main()
