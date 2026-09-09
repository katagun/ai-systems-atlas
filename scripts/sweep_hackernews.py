"""Sweep an attention source for pointers to systems the Atlas has not reviewed.

This script owns discovery facts only. It never proposes a family, role, trait,
score, or confidence, and never writes directory/candidates.json. See ADR 028.
"""
from __future__ import annotations

from typing import Any

from scripts.discovery_sources import https_url_host

DEFAULT_POINTS_FLOOR = 10
MAX_SIGNALS = 60
MAX_STORY_PAGES = 5

# Hosts that report on systems rather than ship them. This list is the load-bearing
# filter and is maintained by hand; a host here is never fetched.
MEDIA_DENYLIST = frozenset({
    "arstechnica.com", "arxiv.org", "bbc.co.uk", "bbc.com", "bloomberg.com", "cnbc.com",
    "cnn.com", "ft.com", "medium.com", "newyorker.com", "nytimes.com", "openreview.net",
    "politico.eu", "quantamagazine.org", "reddit.com", "reuters.com", "science.org",
    "smithsonianmag.com", "substack.com", "techcrunch.com", "theguardian.com", "theverge.com",
    "threads.com", "twitter.com", "en.wikipedia.org", "wired.com", "wsj.com", "x.com",
    "youtube.com", "news.ycombinator.com", "phoronix.com",
})


def registrable_host(url: object) -> str:
    """Return the comparison host for a URL, with a leading www. removed."""
    host = https_url_host(url)
    return "" if host is None else host.removeprefix("www.")


def eligible_stories(
    payload: dict[str, Any],
    *,
    points_floor: int = DEFAULT_POINTS_FLOOR,
    denylist: frozenset[str] = MEDIA_DENYLIST,
) -> list[dict[str, Any]]:
    """Keep stories that point off-site, cleared the floor, and are not media.

    There is deliberately no keyword gate. Measured on 2026-09-09, a title keyword
    filter drops "Mercury 2.5" and "Muse", two real system announcements, because
    Hacker News titles carry no announcement vocabulary.
    """
    kept: list[dict[str, Any]] = []
    for story in payload.get("hits", []):
        if not isinstance(story, dict):
            continue
        host = registrable_host(story.get("url"))
        if not host or host in denylist:
            continue
        if not isinstance(story.get("points"), int) or story["points"] < points_floor:
            continue
        if not isinstance(story.get("title"), str) or not story["title"].strip():
            continue
        kept.append(story)
        if len(kept) >= MAX_SIGNALS:
            break
    return kept
