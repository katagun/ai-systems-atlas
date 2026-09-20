"""The signal pre-rank orders a queue and can never fail a run or reach the network here."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

from scripts import rank_signals


class FakeResponse(io.BytesIO):
    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def answering(noul_by_title: dict[str, float], seen: list[dict] | None = None):
    """An opener that answers each request from the title inside its state."""

    def opener(request, timeout):
        body = json.loads(request.data)
        if seen is not None:
            seen.append({"body": body, "headers": dict(request.header_items())})
        noul = noul_by_title[body["state"]["title"]]
        payload = {"answers": {"system": {"type": "noul", "noul": noul}}}
        return FakeResponse(json.dumps(payload).encode())

    return opener


SIGNALS = [
    {"story_id": "1", "title": "essay", "url": "https://a.example/"},
    {"story_id": "2", "title": "agent", "url": "https://b.example/"},
    {"story_id": "3", "title": "database", "url": "https://c.example/"},
]
PAGES = {"1": "essay text", "2": "agent text", "3": "database text"}


class LoadApiKeyTests(unittest.TestCase):
    def test_the_environment_wins_over_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            env_file = Path(scratch) / ".env"
            env_file.write_text("TYPESAFE_API_KEY=from-file\n", encoding="utf-8")
            key = rank_signals.load_api_key({"TYPESAFE_API_KEY": "from-env"}, env_file)
        self.assertEqual("from-env", key)

    def test_the_file_is_read_when_the_environment_is_silent(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            env_file = Path(scratch) / ".env"
            env_file.write_text(
                "# comment\nOTHER=1\nTYPESAFE_API_KEY='quoted-key'\n", encoding="utf-8"
            )
            self.assertEqual("quoted-key", rank_signals.load_api_key({}, env_file))

    def test_no_key_anywhere_is_none(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            self.assertIsNone(rank_signals.load_api_key({}, Path(scratch) / ".env"))
            empty = Path(scratch) / "empty.env"
            empty.write_text("TYPESAFE_API_KEY=\n", encoding="utf-8")
            self.assertIsNone(rank_signals.load_api_key({}, empty))


class ScoreTests(unittest.TestCase):
    def test_each_page_is_asked_once_with_the_key_as_a_bearer_token(self) -> None:
        seen: list[dict] = []
        scores = rank_signals.score_pages(
            SIGNALS,
            PAGES,
            key="secret",
            opener=answering({"essay": 0.02, "agent": 0.9, "database": 0.1}, seen),
        )
        self.assertEqual({"1": 0.02, "2": 0.9, "3": 0.1}, scores)
        self.assertEqual(3, len(seen))
        first = seen[0]
        self.assertEqual("Bearer secret", first["headers"]["Authorization"])
        self.assertEqual(rank_signals.MODEL, first["body"]["model"])
        self.assertEqual({"system"}, set(first["body"]["questions"]))
        self.assertEqual("noul", first["body"]["questions"]["system"]["type"])
        self.assertEqual({"title", "url", "page_text"}, set(first["body"]["state"]))

    def test_a_signal_without_bundled_text_is_not_asked_about(self) -> None:
        seen: list[dict] = []
        scores = rank_signals.score_pages(
            SIGNALS,
            {"2": "agent text"},
            key="k",
            opener=answering({"agent": 0.9}, seen),
        )
        self.assertEqual({"2": 0.9}, scores)
        self.assertEqual(1, len(seen))

    def test_a_failed_request_costs_only_its_own_score(self) -> None:
        good = answering({"essay": 0.02, "database": 0.1})

        def opener(request, timeout):
            if json.loads(request.data)["state"]["title"] == "agent":
                raise urllib.error.URLError("unreachable")
            return good(request, timeout)

        scores = rank_signals.score_pages(
            SIGNALS, PAGES, key="k", opener=opener, stderr=io.StringIO()
        )
        self.assertEqual({"1": 0.02, "3": 0.1}, scores)

    def test_a_malformed_or_out_of_range_answer_is_dropped(self) -> None:
        def opener(request, timeout):
            title = json.loads(request.data)["state"]["title"]
            payload = {
                "essay": b"not json",
                "agent": json.dumps({"answers": {"system": {"noul": 7}}}).encode(),
                "database": json.dumps(
                    {"answers": {"system": {"noul": True}}}
                ).encode(),
            }[title]
            return FakeResponse(payload)

        self.assertEqual(
            {},
            rank_signals.score_pages(
                SIGNALS, PAGES, key="k", opener=opener, stderr=io.StringIO()
            ),
        )

    def test_an_error_never_prints_the_key(self) -> None:
        def opener(request, timeout):
            raise urllib.error.URLError("failed with Bearer sk-live-secret")

        stderr = io.StringIO()
        rank_signals.score_pages(
            SIGNALS, PAGES, key="sk-live-secret", opener=opener, stderr=stderr
        )
        self.assertNotIn("sk-live-secret", stderr.getvalue())
        self.assertIn("URLError", stderr.getvalue())


class OrderTests(unittest.TestCase):
    def test_scored_ids_lead_by_descending_score_and_the_rest_keep_their_order(
        self,
    ) -> None:
        ordered = rank_signals.order_pending(
            ["1", "2", "3", "4", "5"], {"1": 0.02, "2": 0.9, "4": 0.5}
        )
        self.assertEqual(["2", "4", "1", "3", "5"], ordered)

    def test_ties_keep_queue_order(self) -> None:
        self.assertEqual(
            ["1", "2", "3"],
            rank_signals.order_pending(["1", "2", "3"], {"1": 0.5, "2": 0.5, "3": 0.5}),
        )

    def test_no_scores_leaves_the_queue_as_it_was(self) -> None:
        self.assertEqual(["3", "1"], rank_signals.order_pending(["3", "1"], {}))


class RankerTests(unittest.TestCase):
    def test_without_a_key_nothing_is_asked_and_the_queue_is_unchanged(self) -> None:
        def opener(request, timeout):
            raise AssertionError("the network must not be reached without a key")

        ranked, scores = rank_signals.rank_pending(
            ["1", "2", "3"], SIGNALS, PAGES, key=None, opener=opener
        )
        self.assertEqual(["1", "2", "3"], ranked)
        self.assertEqual({}, scores)

    def test_only_pending_signals_are_sent(self) -> None:
        seen: list[dict] = []
        ranked, _ = rank_signals.rank_pending(
            ["1", "2"],
            SIGNALS,
            PAGES,
            key="k",
            opener=answering({"essay": 0.02, "agent": 0.9}, seen),
        )
        self.assertEqual(["2", "1"], ranked)
        self.assertEqual(2, len(seen))


if __name__ == "__main__":
    unittest.main()
