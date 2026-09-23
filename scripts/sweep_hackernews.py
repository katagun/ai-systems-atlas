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
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

try:
    from .build_candidate_evidence import fetch_web_text
    from .discovery_sources import canonical_url_key, https_url_host
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_candidate_evidence import fetch_web_text
    from discovery_sources import canonical_url_key, https_url_host

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
PROJECTS_PATH = ROOT / "directory" / "projects.json"
EXCLUSIONS_PATH = ROOT / "directory" / "exclusions.json"
CANDIDATES_PATH = ROOT / "directory" / "candidates.json"
ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date"
USER_AGENT = "ai-systems-atlas-sweep/0.1"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
# Measured on extracted visible text, never on the raw body: ai.meta.com/muse/ is a
# client-rendered shell that yielded 55 characters of text on 2026-09-09 while its
# markup ran to kilobytes.
MIN_READABLE_CHARS = 400
DEFAULT_POINTS_FLOOR = 25
MAX_SIGNALS = 60
MAX_STORY_PAGES = 5

# Hosts that report on systems rather than ship them. This list is the load-bearing
# filter and is maintained by hand; a host here is never fetched.
MEDIA_DENYLIST = frozenset(
    {
        "arstechnica.com",
        "arxiv.org",
        "bbc.co.uk",
        "bbc.com",
        "bloomberg.com",
        "cnbc.com",
        "cnn.com",
        "ft.com",
        "medium.com",
        "newyorker.com",
        "nytimes.com",
        "openreview.net",
        "politico.eu",
        "quantamagazine.org",
        "reddit.com",
        "reuters.com",
        "science.org",
        "smithsonianmag.com",
        "substack.com",
        "techcrunch.com",
        "theguardian.com",
        "theverge.com",
        "threads.com",
        "twitter.com",
        "en.wikipedia.org",
        "wired.com",
        "wsj.com",
        "x.com",
        "youtube.com",
        "news.ycombinator.com",
        "phoronix.com",
    }
)


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


def usable_story_fields(story: Any) -> tuple[str, str | int, str, int, str] | None:
    """Identity fields a signal can be built from, or None when the row is malformed.

    The attention source occasionally returns rows missing `url`, `objectID`,
    `title`, `points`, or `created_at` (deleted or flagged stories). Both the
    eligibility gate and the document builder use this check so neither raises
    `KeyError` on such a row; malformed rows are dropped, never recorded.
    """
    if not isinstance(story, dict):
        return None
    url = story.get("url")
    object_id = story.get("objectID")
    title = story.get("title")
    points = story.get("points")
    created_at = story.get("created_at")
    if (
        not isinstance(url, str)
        or not url
        or not isinstance(object_id, str | int)
        or not isinstance(title, str)
        or not title.strip()
        or not isinstance(points, int)
        or not isinstance(created_at, str)
        or not created_at
    ):
        return None
    return url, object_id, title, points, created_at


def eligible_stories_with_total(
    payload: dict[str, Any],
    *,
    points_floor: int = DEFAULT_POINTS_FLOOR,
    denylist: frozenset[str] = MEDIA_DENYLIST,
) -> tuple[list[dict[str, Any]], int]:
    """Keep stories that point off-site, cleared the floor, and are not media.

    There is deliberately no keyword gate. Measured on 2026-09-09, a title keyword
    filter drops "Mercury 2.5" and "Muse", two real system announcements, because
    Hacker News titles carry no announcement vocabulary.

    `search_by_date` returns stories newest-first within the window, so once the
    MAX_SIGNALS cap binds, it systematically drops the oldest eligible stories, not a
    random sample. Callers that need to surface that (see `build_document`) compare
    the returned pre-cap qualifying count against the length of the kept list.
    """
    kept: list[dict[str, Any]] = []
    qualifying = 0
    for story in payload.get("hits", []):
        fields = usable_story_fields(story)
        if fields is None:
            continue
        url, _object_id, _title, points, _created_at = fields
        host = registrable_host(url)
        if not host or denylisted_host(host, denylist):
            continue
        if points < points_floor:
            continue
        qualifying += 1
        if len(kept) < MAX_SIGNALS:
            kept.append(story)
    return kept, qualifying


def decided_url_keys(
    projects: dict[str, Any], exclusions: dict[str, Any], candidates: dict[str, Any]
) -> set[str]:
    """Return the canonical URL keys of pages a human has already decided on.

    A project is already a reviewed record, an exclusion is a durable human
    rejection, and a candidate is already queued for review; a story pointing at any
    of them has already been decided and must not be re-queued. Mirrors the
    null-handling in `update_directory.known_urls_from`: a record without a string
    `url` (exclusions and candidates both carry those) contributes nothing rather
    than raising, since not every record carries one.
    """
    raw_urls: list[Any] = [
        *(
            project.get("url")
            for project in projects.get("projects", [])
            if isinstance(project, dict)
        ),
        *(
            entry.get("url")
            for entry in exclusions.get("entries", [])
            if isinstance(entry, dict)
        ),
        *(
            item.get("url")
            for item in candidates.get("candidates", [])
            if isinstance(item, dict)
        ),
    ]
    return {canonical_url_key(url) for url in raw_urls if isinstance(url, str)}


def load_decided_url_keys() -> set[str]:
    """Load the catalog files and return the decided-URL keys, failing closed.

    These are local JSON files in the same checkout as the sweep. If one cannot be
    read or parsed, something is genuinely wrong and the caller must abort rather
    than proceed with an empty suppression set — an empty set here would silently
    re-queue everything the catalog has already decided on, which is exactly the
    failure mode this exists to remove. `main` lets the resulting exception
    propagate into its existing fail-closed handler.
    """
    projects = json.loads(PROJECTS_PATH.read_text(encoding="utf-8"))
    exclusions = json.loads(EXCLUSIONS_PATH.read_text(encoding="utf-8"))
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    return decided_url_keys(projects, exclusions, candidates)


def drop_decided_stories(
    stories: list[dict[str, Any]], decided: set[str]
) -> tuple[list[dict[str, Any]], int]:
    """Remove stories whose outbound URL a human has already decided on.

    Runs before any page is fetched, so an already-decided story never costs a fetch.
    Comparison uses `canonical_url_key`, the same key `update_directory.py` uses for
    this, so a trailing slash or an added tracking parameter does not requeue a page
    that is already decided under a differently-punctuated URL. It is a conservative
    key, not a full normaliser: see `scripts/discovery_sources.py::canonical_url_key`
    for exactly what it does and does not treat as equivalent (for example, it does
    not fold a `www.` host prefix).
    """
    kept: list[dict[str, Any]] = []
    suppressed = 0
    for story in stories:
        if canonical_url_key(story.get("url")) in decided:
            suppressed += 1
        else:
            kept.append(story)
    return kept, suppressed


class _VisibleText(HTMLParser):
    """Collect the text a reader would see, dropping script and style bodies.

    stdlib only, by design: this repository has zero dependencies, and an HTML
    tokenizer is exactly what `html.parser` is. It is deliberately lenient — a vendor
    page is arbitrary third-party markup, and a strict parse that raised would turn a
    malformed page into a failed run rather than an unreadable one.
    """

    # `noscript` is deliberately absent: this fetcher runs no JavaScript, so a page's
    # noscript fallback is exactly the text it shows the reader we are. `template`
    # content is inert markup and is skipped with the two code containers.
    SKIPPED = frozenset({"script", "style", "template"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._depth = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIPPED:
            self._depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIPPED and self._depth:
            self._depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._depth:
            self._chunks.append(data)

    def collected(self) -> str:
        return " ".join("".join(self._chunks).split())


def extract_visible_text(body: str) -> str:
    """Return the visible text of an HTTP response body, whitespace-collapsed.

    `fetch_web_text` returns the raw body, so both the readability threshold and the
    committed digest must be taken from this, never from the markup. A client-rendered
    page is kilobytes of HTML around an empty div: measured on the raw body it reads as
    a long, readable document, and the `unreadable` guarantee in ADR 028 and Decision 12
    of the design would never fire for the case it was written for.
    """
    parser = _VisibleText()
    parser.feed(body)
    parser.close()
    return parser.collected()


def content_hash(text: str) -> str:
    """Hash extracted page text. Callers must pass `extract_visible_text` output.

    `scripts/verify_signal_pages.py` re-fetches and re-hashes the same way; if the two
    ever extracted differently, every re-check would report drift that never happened.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_document(
    stories: list[dict[str, Any]],
    *,
    window_start: str,
    window_end: str,
    points_floor: int,
    story_count: int,
    qualifying_count: int,
    suppressed: int,
    discovered_at: str,
    fetcher: Callable[[str], str],
) -> dict[str, Any]:
    """Pin each story's vendor page by hash. The page text is never stored.

    Third-party page content in git history is permanent and unremovable, so only the
    digest is committed; the local routine re-fetches and verifies against it.

    `qualifying_count` is the number of stories that passed the gate before the
    MAX_SIGNALS cap in `eligible_stories_with_total` truncated the list; `stories` is
    what the cap actually kept. The envelope's `truncated` flag is true exactly when
    those two differ, so an operator can tell "60 of 1008" (the cap bound, oldest
    stories in the window were dropped) apart from "60 of 1008" that organically
    qualified.

    `suppressed` is the count `drop_decided_stories` already removed from `stories`
    before this call, one per story whose URL a human already decided on (an
    exclusion, a project, or a candidate). It is recorded in the envelope so an
    operator reading the committed queue can see how much of the day's attention
    volume was already-decided noise, the same way `truncated` surfaces the cap.
    """
    signals: list[dict[str, Any]] = []
    for story in stories:
        fields = usable_story_fields(story)
        if fields is None:
            continue
        url, object_id, title, points, created_at = fields
        page_status = "readable"
        digest: str | None = None
        try:
            body = fetcher(url)
        except (OSError, ValueError) as error:
            page_status = "failed"
            # The URL is attacker-supplied and this line lands in a GitHub Actions log,
            # where ::error:: and ::add-mask:: annotations are injectable. !r keeps a
            # newline a newline.
            print(f"warning: {url!r}: {error}", file=sys.stderr)
        else:
            text = extract_visible_text(body)
            if len(text) < MIN_READABLE_CHARS:
                page_status = "unreadable"
            else:
                digest = content_hash(text)
        signals.append(
            {
                "story_id": str(object_id),
                "story_url": f"https://news.ycombinator.com/item?id={object_id}",
                "title": title,
                "url": url,
                "points": points,
                "num_comments": story.get("num_comments") or 0,
                "submitted_at": created_at,
                "page_status": page_status,
                "content_sha256": digest,
                "fetched_at": f"{discovered_at}T00:00:00Z",
                "status": "provisional",
                "discovered_at": discovered_at,
            }
        )
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
            "truncated": qualifying_count > len(signals),
            "suppressed": suppressed,
        },
        "signals": signals,
    }


def search_stories(
    window_start_epoch: int, window_end_epoch: int, getter
) -> dict[str, Any]:
    """Query the attention source over a settled window. One request per page, bounded."""
    hits: list[dict[str, Any]] = []
    story_count = 0
    for page in range(MAX_STORY_PAGES):
        query = urllib.parse.urlencode(
            {
                "tags": "story",
                "numericFilters": f"created_at_i>{window_start_epoch},created_at_i<{window_end_epoch}",
                "hitsPerPage": 1000,
                "page": page,
            }
        )
        payload = getter(f"{ENDPOINT}?{query}")
        hits.extend(payload.get("hits", []))
        story_count = payload.get("nbHits", story_count)
        if page >= payload.get("nbPages", 1) - 1:
            break
    return {"hits": hits, "nbHits": story_count}


def get_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    # Bandit B310: url is always ENDPOINT plus encoded query params,
    # never caller-controlled.
    with urllib.request.urlopen(request, timeout=30) as response:  # nosec B310
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
        stories, qualifying_count = eligible_stories_with_total(
            payload, points_floor=args.points_floor
        )
        # Skip anything a human has already decided on before any page is fetched, so
        # the fetch cost — not just the triage cost — is saved too. A read/parse
        # failure on any catalog file raises here and is caught below: fail closed
        # rather than silently suppressing nothing.
        decided = load_decided_url_keys()
        stories, suppressed = drop_decided_stories(stories, decided)
        # A suppressed story was never dropped by the MAX_SIGNALS cap, so it must not
        # count toward `truncated`: subtract it from the pre-cap qualifying total the
        # same way it was subtracted from `stories`, or an all-suppressed batch would
        # print the cap's "raise --points-floor" warning for a cap that never bound.
        qualifying_count -= suppressed
        document = build_document(
            stories,
            window_start=window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            window_end=window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            points_floor=args.points_floor,
            story_count=payload.get("nbHits", 0),
            qualifying_count=qualifying_count,
            suppressed=suppressed,
            discovered_at=now.date().isoformat(),
            fetcher=fetch_web_text,
        )
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        # Fail closed: the existing queue is preserved rather than half-rewritten.
        print(f"error: attention-source sweep failed: {error}", file=sys.stderr)
        return 1
    SIGNALS_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    kept = len(document["signals"])
    if document["source"]["truncated"]:
        # The cap is a deliberate cost guard (search_by_date returns newest-first, so
        # it always drops the oldest eligible stories in the window, never a random
        # sample) — surface it so an operator can respond by raising the floor.
        print(
            f"warning: kept {kept} of {qualifying_count} qualifying stories; the cap "
            "dropped the oldest in the window. Raise --points-floor to keep a full day.",
            file=sys.stderr,
        )
    print(f"signals: {kept} of {payload.get('nbHits', 0)} stories")
    print(f"suppressed: {document['source']['suppressed']} already-decided stories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
