from __future__ import annotations

import unittest

from scripts import sweep_hackernews


def hit(title: str, url: str | None, points: int) -> dict:
    return {
        "objectID": str(abs(hash(title)) % 10**8),
        "title": title,
        "url": url,
        "points": points,
        "num_comments": 3,
        "created_at": "2026-09-08T20:14:52Z",
    }


class GateTests(unittest.TestCase):
    def test_a_story_without_an_outbound_link_is_dropped(self) -> None:
        payload = {"hits": [hit("Ask HN: anything?", None, 90)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_story_below_the_points_floor_is_dropped(self) -> None:
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 3)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_media_host_is_dropped(self) -> None:
        payload = {"hits": [hit("AI is coming", "https://www.wired.com/story", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_title_with_no_ai_keyword_still_survives(self) -> None:
        """Measured 2026-09-09: a keyword gate drops "Mercury 2.5", a real model release."""
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 231)]}
        kept = sweep_hackernews.eligible_stories(payload, points_floor=10)
        self.assertEqual([item["title"] for item in kept], ["Mercury 2.5"])

    def test_a_non_https_link_is_dropped(self) -> None:
        payload = {"hits": [hit("Thing", "http://vendor.example/m", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_the_signal_count_is_bounded(self) -> None:
        payload = {"hits": [hit(f"Launch {n}", f"https://v{n}.example/x", 99) for n in range(200)]}
        kept = sweep_hackernews.eligible_stories(payload, points_floor=10)
        self.assertLessEqual(len(kept), sweep_hackernews.MAX_SIGNALS)
