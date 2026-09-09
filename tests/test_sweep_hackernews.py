from __future__ import annotations

import json
import unittest

from scripts import sweep_hackernews

# A distinctive sentinel that appears in no signal field. Padded well past
# MIN_READABLE_CHARS (400) so the fake fetch counts as a readable page. Unlike the
# fixture's title ("Mercury 2.5"), this string cannot leak into the document through
# any legitimate field, so its absence actually tests that page text is never stored.
SENTINEL_PAGE_TEXT = "SENTINEL_PAGE_BODY_TEXT and more prose... " * 12


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

    def test_a_medium_author_subdomain_is_dropped(self) -> None:
        payload = {"hits": [hit("A post", "https://someauthor.medium.com/my-post", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_substack_newsletter_subdomain_is_dropped(self) -> None:
        payload = {"hits": [hit("A post", "https://newsletter.substack.com/p/my-post", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_wired_blog_subdomain_is_dropped(self) -> None:
        payload = {"hits": [hit("A post", "https://blog.wired.com/x", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_wired_with_and_without_www_is_still_dropped(self) -> None:
        with_www = {"hits": [hit("A post", "https://www.wired.com/x", 400)]}
        bare = {"hits": [hit("A post", "https://wired.com/x", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(with_www, points_floor=10), [])
        self.assertEqual(sweep_hackernews.eligible_stories(bare, points_floor=10), [])

    def test_a_host_that_merely_shares_a_suffix_is_kept(self) -> None:
        """notwired.com ends with "wired.com" but is not a subdomain of it, and must
        not be dropped by a naive endswith(entry) that forgets the "." separator."""
        payload = {
            "hits": [
                hit("Not wired", "https://notwired.com/x", 400),
                hit("Fake medium", "https://fakemedium.com/x", 400),
            ]
        }
        kept = sweep_hackernews.eligible_stories(payload, points_floor=10)
        self.assertEqual([item["title"] for item in kept], ["Not wired", "Fake medium"])


class DenylistedHostTests(unittest.TestCase):
    def test_exact_match_is_denylisted(self) -> None:
        self.assertTrue(sweep_hackernews.denylisted_host("wired.com", sweep_hackernews.MEDIA_DENYLIST))

    def test_subdomain_is_denylisted(self) -> None:
        self.assertTrue(sweep_hackernews.denylisted_host("blog.wired.com", sweep_hackernews.MEDIA_DENYLIST))
        self.assertTrue(
            sweep_hackernews.denylisted_host("someauthor.medium.com", sweep_hackernews.MEDIA_DENYLIST)
        )
        self.assertTrue(
            sweep_hackernews.denylisted_host("newsletter.substack.com", sweep_hackernews.MEDIA_DENYLIST)
        )

    def test_suffix_lookalike_is_not_denylisted(self) -> None:
        self.assertFalse(sweep_hackernews.denylisted_host("notwired.com", sweep_hackernews.MEDIA_DENYLIST))
        self.assertFalse(sweep_hackernews.denylisted_host("fakemedium.com", sweep_hackernews.MEDIA_DENYLIST))


class DocumentTests(unittest.TestCase):
    def build(self, fetcher) -> dict:
        stories = [{
            "objectID": "49616354", "title": "Mercury 2.5",
            "url": "https://vendor.example/launch", "points": 231,
            "num_comments": 88, "created_at": "2026-09-08T20:14:52Z",
        }]
        return sweep_hackernews.build_document(
            stories,
            window_start="2026-09-07T00:00:00Z",
            window_end="2026-09-08T00:00:00Z",
            points_floor=10,
            story_count=1042,
            discovered_at="2026-09-09",
            fetcher=fetcher,
        )

    def test_a_readable_page_is_hashed_but_never_stored(self) -> None:
        document = self.build(lambda url: SENTINEL_PAGE_TEXT)
        signal = document["signals"][0]
        self.assertEqual(signal["page_status"], "readable")
        self.assertRegex(signal["content_sha256"], r"\A[0-9a-f]{64}\Z")
        self.assertNotIn("content", signal)
        self.assertNotIn("SENTINEL_PAGE_BODY_TEXT", json.dumps(document))

    def test_a_client_rendered_page_is_recorded_as_unreadable(self) -> None:
        """ai.meta.com/muse/ yielded 55 characters on 2026-09-09."""
        document = self.build(lambda url: "   ")
        signal = document["signals"][0]
        self.assertEqual(signal["page_status"], "unreadable")
        self.assertIsNone(signal["content_sha256"])

    def test_a_failed_fetch_is_recorded_and_does_not_abort_the_run(self) -> None:
        def boom(url: str) -> str:
            raise ValueError("web evidence redirect changed host")

        document = self.build(boom)
        self.assertEqual(document["signals"][0]["page_status"], "failed")
        self.assertIsNone(document["signals"][0]["content_sha256"])

    def test_no_signal_carries_a_classification_field(self) -> None:
        document = self.build(lambda url: "text")
        for signal in document["signals"]:
            self.assertNotIn("proposed_system_family", signal)
            self.assertNotIn("proposed_primary_role", signal)
            self.assertNotIn("classification_confidence", signal)
