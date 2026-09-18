from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import sweep_hackernews

# A distinctive sentinel that appears in no signal field. Padded well past
# MIN_READABLE_CHARS (400) so the fake fetch counts as a readable page. Unlike the
# fixture's title ("Mercury 2.5"), this string cannot leak into the document through
# any legitimate field, so its absence actually tests that page text is never stored.
SENTINEL_PAGE_TEXT = "SENTINEL_PAGE_BODY_TEXT and more prose... " * 12

# A client-rendered vendor page: kilobytes of markup, a mount point, and almost no text.
# ai.meta.com/muse/ yielded 55 characters of extracted text on 2026-09-09 while its
# markup ran far past MIN_READABLE_CHARS, so a threshold applied to the raw body calls
# this page readable and the "unreadable" guarantee in ADR 028 never fires for it.
SPA_SHELL = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link rel="preconnect" href="https://fonts.example" crossorigin />
    <link rel="modulepreload" href="/assets/vendor.4c1b9f2e.js" />
    <link rel="stylesheet" href="/assets/index.7a3d0b11.css" />
    <style>
      :root { --brand: #101828; --radius: 12px; --shadow: 0 1px 2px rgba(16,24,40,.05); }
      #root { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      .skeleton { animation: pulse 1.5s ease-in-out infinite; background: #eaecf0; }
    </style>
    <script>
      window.__APP_CONFIG__ = {
        apiBase: "https://api.vendor.example/v1",
        flags: { newOnboarding: true, telemetry: true, betaAgents: false },
        buildId: "2026.09.08-a41f0c9", region: "us-east-1", locale: "en-US"
      };
    </script>
  </head>
  <body>
    <div id="root"></div>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <script type="module" src="/assets/index.9f2c1a04.js"></script>
  </body>
</html>"""


def kept_stories(payload: dict, points_floor: int) -> list[dict]:
    """The kept half of the gate's pair. `main` calls `eligible_stories_with_total`."""
    kept, _qualifying = sweep_hackernews.eligible_stories_with_total(
        payload, points_floor=points_floor
    )
    return kept


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
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_a_story_below_the_points_floor_is_dropped(self) -> None:
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 3)]}
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_a_media_host_is_dropped(self) -> None:
        payload = {"hits": [hit("AI is coming", "https://www.wired.com/story", 400)]}
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_a_title_with_no_ai_keyword_still_survives(self) -> None:
        """Measured 2026-09-09: a keyword gate drops "Mercury 2.5", a real model release."""
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 231)]}
        kept = kept_stories(payload, points_floor=10)
        self.assertEqual([item["title"] for item in kept], ["Mercury 2.5"])

    def test_a_non_https_link_is_dropped(self) -> None:
        payload = {"hits": [hit("Thing", "http://vendor.example/m", 400)]}
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_the_signal_count_is_bounded(self) -> None:
        payload = {
            "hits": [
                hit(f"Launch {n}", f"https://v{n}.example/x", 99) for n in range(200)
            ]
        }
        kept = kept_stories(payload, points_floor=10)
        self.assertLessEqual(len(kept), sweep_hackernews.MAX_SIGNALS)

    def test_a_medium_author_subdomain_is_dropped(self) -> None:
        payload = {
            "hits": [hit("A post", "https://someauthor.medium.com/my-post", 400)]
        }
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_a_substack_newsletter_subdomain_is_dropped(self) -> None:
        payload = {
            "hits": [hit("A post", "https://newsletter.substack.com/p/my-post", 400)]
        }
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_a_wired_blog_subdomain_is_dropped(self) -> None:
        payload = {"hits": [hit("A post", "https://blog.wired.com/x", 400)]}
        self.assertEqual(kept_stories(payload, points_floor=10), [])

    def test_wired_with_and_without_www_is_still_dropped(self) -> None:
        with_www = {"hits": [hit("A post", "https://www.wired.com/x", 400)]}
        bare = {"hits": [hit("A post", "https://wired.com/x", 400)]}
        self.assertEqual(kept_stories(with_www, points_floor=10), [])
        self.assertEqual(kept_stories(bare, points_floor=10), [])

    def test_a_host_that_merely_shares_a_suffix_is_kept(self) -> None:
        """notwired.com ends with "wired.com" but is not a subdomain of it, and must
        not be dropped by a naive endswith(entry) that forgets the "." separator."""
        payload = {
            "hits": [
                hit("Not wired", "https://notwired.com/x", 400),
                hit("Fake medium", "https://fakemedium.com/x", 400),
            ]
        }
        kept = kept_stories(payload, points_floor=10)
        self.assertEqual([item["title"] for item in kept], ["Not wired", "Fake medium"])


class DenylistedHostTests(unittest.TestCase):
    def test_exact_match_is_denylisted(self) -> None:
        self.assertTrue(
            sweep_hackernews.denylisted_host(
                "wired.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )

    def test_subdomain_is_denylisted(self) -> None:
        self.assertTrue(
            sweep_hackernews.denylisted_host(
                "blog.wired.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )
        self.assertTrue(
            sweep_hackernews.denylisted_host(
                "someauthor.medium.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )
        self.assertTrue(
            sweep_hackernews.denylisted_host(
                "newsletter.substack.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )

    def test_suffix_lookalike_is_not_denylisted(self) -> None:
        self.assertFalse(
            sweep_hackernews.denylisted_host(
                "notwired.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )
        self.assertFalse(
            sweep_hackernews.denylisted_host(
                "fakemedium.com", sweep_hackernews.MEDIA_DENYLIST
            )
        )


class ExtractVisibleTextTests(unittest.TestCase):
    def test_script_and_style_bodies_are_not_text(self) -> None:
        body = "<style>.a{color:red}</style><script>var x = 1;</script><p>Hello</p>"
        self.assertEqual(sweep_hackernews.extract_visible_text(body), "Hello")

    def test_entities_and_whitespace_are_normalised(self) -> None:
        body = "<p>Mercury\n\n  2.5 &amp;   friends</p>"
        self.assertEqual(
            sweep_hackernews.extract_visible_text(body), "Mercury 2.5 & friends"
        )

    def test_a_body_with_no_markup_is_returned_as_written(self) -> None:
        self.assertEqual(
            sweep_hackernews.extract_visible_text("plain text"), "plain text"
        )

    def test_a_noscript_fallback_is_text_because_this_fetcher_runs_no_javascript(
        self,
    ) -> None:
        body = "<script>render()</script><noscript>Enable JavaScript to continue.</noscript>"
        self.assertEqual(
            sweep_hackernews.extract_visible_text(body),
            "Enable JavaScript to continue.",
        )

    def test_template_content_is_not_text(self) -> None:
        body = "<template><p>never rendered</p></template><p>rendered</p>"
        self.assertEqual(sweep_hackernews.extract_visible_text(body), "rendered")

    def test_malformed_markup_does_not_raise(self) -> None:
        body = "<div><p>half a tag <span class=unquoted>text</div><script>oops"
        self.assertIn("half a tag", sweep_hackernews.extract_visible_text(body))


class DocumentTests(unittest.TestCase):
    def build(
        self, fetcher, qualifying_count: int | None = None, suppressed: int = 0
    ) -> dict:
        stories = [
            {
                "objectID": "49616354",
                "title": "Mercury 2.5",
                "url": "https://vendor.example/launch",
                "points": 231,
                "num_comments": 88,
                "created_at": "2026-09-08T20:14:52Z",
            }
        ]
        return sweep_hackernews.build_document(
            stories,
            window_start="2026-09-07T00:00:00Z",
            window_end="2026-09-08T00:00:00Z",
            points_floor=10,
            story_count=1042,
            qualifying_count=len(stories)
            if qualifying_count is None
            else qualifying_count,
            suppressed=suppressed,
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
        """ai.meta.com/muse/ yielded 55 characters of extracted text on 2026-09-09.

        The markup is the point: this shell is well past MIN_READABLE_CHARS as a raw
        body, so the test fails against a threshold that measures HTML source.
        """
        self.assertGreater(len(SPA_SHELL), sweep_hackernews.MIN_READABLE_CHARS)
        self.assertLess(
            len(sweep_hackernews.extract_visible_text(SPA_SHELL)),
            sweep_hackernews.MIN_READABLE_CHARS,
        )
        document = self.build(lambda url: SPA_SHELL)
        signal = document["signals"][0]
        self.assertEqual(signal["page_status"], "unreadable")
        self.assertIsNone(signal["content_sha256"])

    def test_a_readable_page_is_hashed_on_its_text_not_its_markup(self) -> None:
        """Two pages with the same words in different markup pin the same digest."""
        plain = self.build(lambda url: SENTINEL_PAGE_TEXT)["signals"][0]
        wrapped = self.build(
            lambda url: (
                f"<html><body><p>{SENTINEL_PAGE_TEXT}</p>"
                f"<script>var tracking = {{id: 'abc'}};</script></body></html>"
            )
        )["signals"][0]
        self.assertEqual(wrapped["page_status"], "readable")
        self.assertEqual(wrapped["content_sha256"], plain["content_sha256"])

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

    def test_truncated_is_false_when_nothing_was_dropped(self) -> None:
        document = self.build(lambda url: SENTINEL_PAGE_TEXT)
        self.assertIs(document["source"]["truncated"], False)

    def test_truncated_is_true_when_the_pre_cap_count_exceeds_the_kept_count(
        self,
    ) -> None:
        document = self.build(lambda url: SENTINEL_PAGE_TEXT, qualifying_count=5)
        self.assertIs(document["source"]["truncated"], True)


class EligibleStoriesWithTotalTests(unittest.TestCase):
    def test_qualifying_count_exceeds_kept_when_the_cap_binds(self) -> None:
        payload = {
            "hits": [
                hit(f"Launch {n}", f"https://v{n}.example/x", 99) for n in range(200)
            ]
        }
        kept, qualifying = sweep_hackernews.eligible_stories_with_total(
            payload, points_floor=10
        )
        self.assertEqual(len(kept), sweep_hackernews.MAX_SIGNALS)
        self.assertEqual(qualifying, 200)

    def test_qualifying_count_equals_kept_when_the_cap_does_not_bind(self) -> None:
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 231)]}
        kept, qualifying = sweep_hackernews.eligible_stories_with_total(
            payload, points_floor=10
        )
        self.assertEqual(qualifying, len(kept))


# A real, previously-decided page: excluded on 2026-09-11 with its URL recorded so the
# rejection sticks (see directory/exclusions.json). Used throughout as the concrete
# case the defect this module fixes was verified against.
SWE2_URL = "https://cognition.com/blog/swe-2"


def catalog(
    *,
    projects: list[dict] | None = None,
    exclusions: list[dict] | None = None,
    candidates: list[dict] | None = None,
) -> tuple[dict, dict, dict]:
    """Build minimal (projects, exclusions, candidates) documents for decided_url_keys."""
    return (
        {"projects": projects or []},
        {"entries": exclusions or []},
        {"candidates": candidates or []},
    )


class DecidedUrlKeysTests(unittest.TestCase):
    def test_a_project_url_is_decided(self) -> None:
        projects, exclusions, candidates = catalog(
            projects=[{"id": "x", "url": SWE2_URL}]
        )
        keys = sweep_hackernews.decided_url_keys(projects, exclusions, candidates)
        self.assertIn(sweep_hackernews.canonical_url_key(SWE2_URL), keys)

    def test_an_exclusion_url_is_decided(self) -> None:
        projects, exclusions, candidates = catalog(
            exclusions=[{"name": "SWE-2", "repo": None, "url": SWE2_URL}]
        )
        keys = sweep_hackernews.decided_url_keys(projects, exclusions, candidates)
        self.assertIn(sweep_hackernews.canonical_url_key(SWE2_URL), keys)

    def test_a_candidate_url_is_decided(self) -> None:
        projects, exclusions, candidates = catalog(
            candidates=[{"repo": "x/y", "url": SWE2_URL}]
        )
        keys = sweep_hackernews.decided_url_keys(projects, exclusions, candidates)
        self.assertIn(sweep_hackernews.canonical_url_key(SWE2_URL), keys)

    def test_records_without_a_string_url_do_not_crash_the_load(self) -> None:
        projects, exclusions, candidates = catalog(
            projects=[{"id": "no-url"}, {"id": "null-url", "url": None}, "not-a-dict"],
            exclusions=[{"name": "no-url-exclusion", "repo": "a/b"}, {"url": 12345}],
            candidates=[{"repo": "a/b"}, None],
        )
        keys = sweep_hackernews.decided_url_keys(projects, exclusions, candidates)
        self.assertEqual(keys, set())

    def test_an_empty_catalog_decides_nothing(self) -> None:
        projects, exclusions, candidates = catalog()
        self.assertEqual(
            sweep_hackernews.decided_url_keys(projects, exclusions, candidates), set()
        )


class DropDecidedStoriesTests(unittest.TestCase):
    def decided(self, *urls: str) -> set[str]:
        return {sweep_hackernews.canonical_url_key(url) for url in urls}

    def test_a_story_matching_a_decided_url_is_dropped_and_never_fetched(self) -> None:
        stories = [hit("SWE-2", SWE2_URL, 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, [])
        self.assertEqual(suppressed, 1)

        calls: list[str] = []

        def spy_fetcher(url: str) -> str:
            calls.append(url)
            return SENTINEL_PAGE_TEXT

        sweep_hackernews.build_document(
            kept,
            window_start="2026-09-11T00:00:00Z",
            window_end="2026-09-12T00:00:00Z",
            points_floor=10,
            story_count=1,
            qualifying_count=1,
            suppressed=suppressed,
            discovered_at="2026-09-12",
            fetcher=spy_fetcher,
        )
        self.assertEqual(calls, [])

    def test_a_story_surviving_none_of_the_catalogs_is_kept(self) -> None:
        stories = [hit("A new launch", "https://vendor.example/new", 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, stories)
        self.assertEqual(suppressed, 0)

    def test_a_trailing_slash_still_matches(self) -> None:
        stories = [hit("SWE-2", SWE2_URL + "/", 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, [])
        self.assertEqual(suppressed, 1)

    def test_an_added_utm_parameter_still_matches(self) -> None:
        stories = [hit("SWE-2", SWE2_URL + "?utm_source=hn&utm_medium=social", 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, [])
        self.assertEqual(suppressed, 1)

    def test_a_www_difference_does_not_match(self) -> None:
        """`canonical_url_key` is a conservative comparison key, not a full
        normaliser: it strips the default port, a trailing slash, and utm_/tracking
        query keys, but it does not fold a `www.` host prefix. A story linked as
        www.cognition.com would NOT be suppressed against a catalog entry recorded as
        bare cognition.com (or vice versa) -- this documents that real limit rather
        than assuming the opposite."""
        stories = [hit("SWE-2", "https://www.cognition.com/blog/swe-2", 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, stories)
        self.assertEqual(suppressed, 0)

    def test_a_null_url_story_is_not_suppressed_and_does_not_crash(self) -> None:
        stories = [hit("Ask HN", None, 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(
            stories, self.decided(SWE2_URL)
        )
        self.assertEqual(kept, stories)
        self.assertEqual(suppressed, 0)


class LoadDecidedUrlKeysTests(unittest.TestCase):
    def test_an_unreadable_catalog_file_raises_rather_than_suppressing_nothing(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "does-not-exist.json"
            with (
                mock.patch.object(sweep_hackernews, "PROJECTS_PATH", missing),
                self.assertRaises(OSError),
            ):
                sweep_hackernews.load_decided_url_keys()

    def test_a_malformed_catalog_file_raises_rather_than_suppressing_nothing(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            malformed = Path(directory) / "exclusions.json"
            malformed.write_text("{not valid json", encoding="utf-8")
            with (
                mock.patch.object(sweep_hackernews, "EXCLUSIONS_PATH", malformed),
                self.assertRaises(json.JSONDecodeError),
            ):
                sweep_hackernews.load_decided_url_keys()

    def test_the_real_checkout_catalog_suppresses_the_real_excluded_swe2_url(
        self,
    ) -> None:
        """End-to-end against the actual committed catalog files, not a fixture:
        SWE-2 was excluded with its URL recorded in directory/exclusions.json, and a
        fresh sweep payload pointing at that same URL must be suppressed before any
        fetch — proving the concrete defect this module fixes is closed."""
        decided = sweep_hackernews.load_decided_url_keys()
        stories = [hit("SWE-2 launch, again", SWE2_URL, 400)]
        kept, suppressed = sweep_hackernews.drop_decided_stories(stories, decided)
        self.assertEqual(kept, [])
        self.assertEqual(suppressed, 1)
