"""Sweep an attention source for pointers to systems the Atlas has not reviewed.

This script owns discovery facts only. It never proposes a family, role, trait,
score, or confidence, and never writes directory/candidates.json. See ADR 028.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    from .build_candidate_evidence import fetch_web_text
    from .discovery_sources import https_url_host
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_candidate_evidence import fetch_web_text
    from discovery_sources import https_url_host

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date"
USER_AGENT = "ai-systems-atlas-sweep/0.1"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MIN_READABLE_CHARS = 400
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


def denylisted_host(host: str, denylist: frozenset[str]) -> bool:
    """A host is denylisted if it equals a denylist entry or is one of its subdomains.

    A subdomain of a denylisted platform is that platform: medium.com is denylisted
    to drop someauthor.medium.com, substack.com to drop newsletter.substack.com, and
    wired.com to drop blog.wired.com. This must not match a host that merely ends
    with the same characters (notwired.com, fakemedium.com), so the subdomain check
    requires the "." separator, not a bare endswith.
    """
    return host in denylist or any(host.endswith("." + entry) for entry in denylist)


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
        if not host or denylisted_host(host, denylist):
            continue
        if not isinstance(story.get("points"), int) or story["points"] < points_floor:
            continue
        if not isinstance(story.get("title"), str) or not story["title"].strip():
            continue
        kept.append(story)
        if len(kept) >= MAX_SIGNALS:
            break
    return kept


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_document(
    stories: list[dict[str, Any]],
    *,
    window_start: str,
    window_end: str,
    points_floor: int,
    story_count: int,
    discovered_at: str,
    fetcher: Callable[[str], str],
) -> dict[str, Any]:
    """Pin each story's vendor page by hash. The page text is never stored.

    Third-party page content in git history is permanent and unremovable, so only the
    digest is committed; the local routine re-fetches and verifies against it.
    """
    signals: list[dict[str, Any]] = []
    for story in stories:
        url = story["url"]
        page_status = "readable"
        digest: str | None = None
        try:
            text = fetcher(url)
        except (OSError, ValueError) as error:
            page_status = "failed"
            print(f"warning: {url}: {error}", file=sys.stderr)
        else:
            if len(text.strip()) < MIN_READABLE_CHARS:
                page_status = "unreadable"
            else:
                digest = content_hash(text)
        signals.append({
            "story_id": str(story["objectID"]),
            "story_url": f"https://news.ycombinator.com/item?id={story['objectID']}",
            "title": story["title"],
            "url": url,
            "points": story["points"],
            "num_comments": story.get("num_comments") or 0,
            "submitted_at": story["created_at"],
            "page_status": page_status,
            "content_sha256": digest,
            "fetched_at": f"{discovered_at}T00:00:00Z",
            "status": "provisional",
            "discovered_at": discovered_at,
        })
    signals.sort(key=lambda item: item["story_id"])
    return {
        "version": "1.0",
        "updated_at": f"{discovered_at}T00:00:00Z",
        "source": {
            "endpoint": ENDPOINT,
            "window_start": window_start,
            "window_end": window_end,
            "points_floor": points_floor,
            "story_count": story_count,
            "eligible_count": len(signals),
        },
        "signals": signals,
    }


def search_stories(window_start_epoch: int, window_end_epoch: int, getter) -> dict[str, Any]:
    """Query the attention source over a settled window. One request per page, bounded."""
    hits: list[dict[str, Any]] = []
    story_count = 0
    for page in range(MAX_STORY_PAGES):
        query = urllib.parse.urlencode({
            "tags": "story",
            "numericFilters": f"created_at_i>{window_start_epoch},created_at_i<{window_end_epoch}",
            "hitsPerPage": 1000,
            "page": page,
        })
        payload = getter(f"{ENDPOINT}?{query}")
        hits.extend(payload.get("hits", []))
        story_count = payload.get("nbHits", story_count)
        if page >= payload.get("nbPages", 1) - 1:
            break
    return {"hits": hits, "nbHits": story_count}


def get_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("attention-source response exceeds size limit")
    return json.loads(body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--points-floor", type=int, default=DEFAULT_POINTS_FLOOR)
    parser.add_argument("--lag-days", type=int, default=1)
    args = parser.parse_args(argv)

    # A one-day lag: Hacker News scores accrue over roughly a day, so sweeping the
    # last 24 hours gates on half-formed counts.
    now = datetime.now(UTC)
    window_end = now - timedelta(days=args.lag_days)
    window_start = window_end - timedelta(days=1)
    try:
        payload = search_stories(
            int(window_start.timestamp()), int(window_end.timestamp()), get_json
        )
        stories = eligible_stories(payload, points_floor=args.points_floor)
        document = build_document(
            stories,
            window_start=window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            window_end=window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            points_floor=args.points_floor,
            story_count=payload.get("nbHits", 0),
            discovered_at=now.date().isoformat(),
            fetcher=fetch_web_text,
        )
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        # Fail closed: the existing queue is preserved rather than half-rewritten.
        print(f"error: attention-source sweep failed: {error}", file=sys.stderr)
        return 1
    SIGNALS_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"signals: {len(document['signals'])} of {payload.get('nbHits', 0)} stories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
