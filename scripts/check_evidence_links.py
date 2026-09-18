#!/usr/bin/env python3
"""Check reviewed catalog links and detect changes to mutable terms pages.

The cache is operational state, not reviewed evidence. It records HTTP validators
and a normalized content hash for mutable terms so repeat runs can use
conditional requests and a changed page can raise a review signal. The checker
never edits catalog records, evidence, scores, classifications, or review dates.

Pages that refuse the checker's bot user agent with 403 but serve an ordinary
browser (observed bot walls) get one retry with browser headers; a success is
recorded as reachable with a bot-wall warning rather than as a broken link.
"""
from __future__ import annotations

import argparse
import contextlib
import difflib
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Iterator, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.message import Message
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, ClassVar

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
# One cache for every worktree of the clone, kept in the shared git directory; a
# per-checkout cache let two worktrees hold different baselines for the same page.
SHARED_CACHE_PATH = Path("atlas") / "evidence-link-cache.json"
LEGACY_CACHE_NAME = ".evidence-link-cache.json"
# URL → element id whose section holds a page's terms. Add an entry only after a
# stored diff shows the page's churn sits outside its terms; a URL fragment needs none.
TERMS_SECTION_IDS: dict[str, str] = {}
MAX_DIFF_SEGMENTS = 12
MAX_SEGMENT_CHARS = 240

CACHE_VERSION = "1.0"
DEFAULT_MAX_AGE_HOURS = 20.0
DEFAULT_WORKERS = 8
MIN_SUCCESS_RATIO = 0.80
MAX_TERMS_BYTES = 8 * 1024 * 1024
TRANSIENT_HTTP_CODES = {408, 425, 429, 500, 502, 503, 504}
HEAD_FALLBACK_CODES = {401, 403, 404, 405, 410, 501}
BOT_USER_AGENT = "ai-systems-atlas-evidence-checker/0.1"
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


@dataclass
class _TargetBuilder:
    url: str
    kinds: set[str] = field(default_factory=set)
    references: set[str] = field(default_factory=set)
    review_dates: dict[str, str | None] = field(default_factory=dict)
    monitor_terms: bool = False


@dataclass(frozen=True)
class LinkTarget:
    url: str
    kinds: tuple[str, ...]
    references: tuple[str, ...]
    review_dates: tuple[tuple[str, str | None], ...]
    monitor_terms: bool


@dataclass(frozen=True)
class FetchResult:
    status: int
    final_url: str
    headers: dict[str, str]
    body: bytes | None
    not_modified: bool = False
    via_browser_fallback: bool = False


class FetchFailure(Exception):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class CheckSummary:
    total: int = 0
    checked: int = 0
    cached: int = 0
    succeeded: int = 0
    failed: int = 0
    terms_bootstrapped: int = 0
    terms_accepted: int = 0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    # URL → changed text segments for each page reported as terms drift.
    drift_details: dict[str, list[str]] = field(default_factory=dict)


Fetcher = Callable[[LinkTarget, Mapping[str, Any]], FetchResult]
Sleeper = Callable[[float], None]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _newer_date(current: str | None, candidate: object) -> str | None:
    if not isinstance(candidate, str):
        return current
    try:
        datetime.fromisoformat(candidate)
    except ValueError:
        return current
    return candidate if current is None or candidate > current else current


def _add_target(
    targets: dict[str, _TargetBuilder],
    url: object,
    *,
    kind: str,
    reference: str,
    reviewed_at: object = None,
    monitor_terms: bool = False,
) -> None:
    if not isinstance(url, str) or not url.startswith("https://"):
        return
    target = targets.setdefault(url, _TargetBuilder(url=url))
    target.kinds.add(kind)
    target.references.add(reference)
    target.review_dates[reference] = _newer_date(
        target.review_dates.get(reference),
        reviewed_at,
    )
    target.monitor_terms = target.monitor_terms or monitor_terms


def _add_evidence_items(
    targets: dict[str, _TargetBuilder],
    items: Iterable[dict[str, Any]],
    *,
    collection: str,
    record_id: str,
    group: str,
    record_reviewed_at: object,
) -> None:
    for index, item in enumerate(items):
        reference = f"{collection}:{record_id}:{group}:{index}"
        is_terms = item.get("kind") == "web_terms"
        reviewed_at = item.get("verified_at", record_reviewed_at)
        _add_target(
            targets,
            item.get("url"),
            kind="terms" if is_terms else "evidence",
            reference=reference,
            reviewed_at=reviewed_at,
            monitor_terms=is_terms,
        )
        _add_target(
            targets,
            item.get("immutable_url"),
            kind="immutable_evidence",
            reference=reference,
            reviewed_at=record_reviewed_at,
        )


def _add_trust_targets(
    targets: dict[str, _TargetBuilder],
    trust: Mapping[str, Any],
    *,
    record_id: str,
) -> None:
    """Trust URLs are checked as links and never drift-hashed.

    A property URL is the operator's page; a finding URL is someone else's. The Atlas
    cannot accept a change to a page it does not steward, so neither gets a terms
    baseline. The pinned content_sha256 on a finding is a review-time record of what
    the reviewer read, compared to nothing here. See ADR 029.
    """
    for name, item in trust.get("properties", {}).items():
        _add_target(
            targets,
            item.get("url"),
            kind="trust_property",
            reference=f"inference-services:{record_id}:trust:{name}",
            reviewed_at=item.get("verified_at"),
        )
    for index, finding in enumerate(trust.get("findings", [])):
        reference = f"inference-services:{record_id}:finding:{index}"
        source = finding.get("source") or {}
        _add_target(
            targets,
            source.get("url"),
            kind="trust_finding",
            reference=reference,
            reviewed_at=source.get("fetched_at"),
        )
        for field_name in ("operator_response", "resolved"):
            response = finding.get(field_name)
            if isinstance(response, dict):
                _add_target(
                    targets,
                    response.get("url"),
                    kind="trust_response",
                    reference=f"{reference}:{field_name}",
                    reviewed_at=response.get("verified_at"),
                )


def collect_targets(directory: Path = DIRECTORY) -> list[LinkTarget]:
    """Collect and deduplicate the reviewed URLs the Atlas promises to maintain."""
    targets: dict[str, _TargetBuilder] = {}

    project_document = load_json(directory / "projects.json")
    projects = {project["id"]: project for project in project_document["projects"]}
    for project in projects.values():
        _add_target(
            targets,
            project.get("url"),
            kind="record",
            reference=f"systems:{project['id']}:url",
            reviewed_at=project.get("verified_at"),
        )

    license_document = load_json(directory / "license-evidence.json")
    for record in license_document["entries"]:
        project = projects[record["project_id"]]
        _add_evidence_items(
            targets,
            record["items"],
            collection="systems",
            record_id=record["project_id"],
            group="license",
            record_reviewed_at=project.get("verified_at"),
        )

    specification_document = load_json(directory / "specifications.json")
    for record in specification_document["specifications"]:
        record_id = record["id"]
        reviewed_at = record.get("verified_at")
        _add_target(
            targets,
            record.get("url"),
            kind="record",
            reference=f"specifications:{record_id}:url",
            reviewed_at=reviewed_at,
        )
        _add_evidence_items(
            targets,
            record["evidence"],
            collection="specifications",
            record_id=record_id,
            group="evidence",
            record_reviewed_at=reviewed_at,
        )
        _add_evidence_items(
            targets,
            record["license_evidence"],
            collection="specifications",
            record_id=record_id,
            group="license",
            record_reviewed_at=reviewed_at,
        )

    service_document = load_json(directory / "inference-services.json")
    for record in service_document["services"]:
        record_id = record["id"]
        reviewed_at = record.get("verified_at")
        _add_target(
            targets,
            record.get("url"),
            kind="record",
            reference=f"inference-services:{record_id}:url",
            reviewed_at=reviewed_at,
        )
        _add_evidence_items(
            targets,
            [record["terms"]],
            collection="inference-services",
            record_id=record_id,
            group="terms",
            record_reviewed_at=reviewed_at,
        )
        _add_evidence_items(
            targets,
            record["evidence"],
            collection="inference-services",
            record_id=record_id,
            group="evidence",
            record_reviewed_at=reviewed_at,
        )
        if isinstance(record.get("trust"), dict):
            _add_trust_targets(targets, record["trust"], record_id=record_id)

    for filename, key, collection in (
        ("local-runtimes.json", "runtimes", "local-runtimes"),
        ("models.json", "models", "models"),
        ("packs.json", "packs", "packs"),
    ):
        document = load_json(directory / filename)
        for record in document[key]:
            record_id = record["id"]
            reviewed_at = record.get("verified_at")
            _add_target(
                targets,
                record.get("url"),
                kind="record",
                reference=f"{collection}:{record_id}:url",
                reviewed_at=reviewed_at,
            )
            _add_evidence_items(
                targets,
                record["evidence"],
                collection=collection,
                record_id=record_id,
                group="evidence",
                record_reviewed_at=reviewed_at,
            )
            _add_evidence_items(
                targets,
                record["license_evidence"],
                collection=collection,
                record_id=record_id,
                group="license",
                record_reviewed_at=reviewed_at,
            )

    return [
        LinkTarget(
            url=item.url,
            kinds=tuple(sorted(item.kinds)),
            references=tuple(sorted(item.references)),
            review_dates=tuple(sorted(item.review_dates.items())),
            monitor_terms=item.monitor_terms,
        )
        for item in sorted(targets.values(), key=lambda target: target.url)
    ]


class _VisibleText(HTMLParser):
    SKIPPED: ClassVar[set[str]] = {
        "head",
        "header",
        "footer",
        "nav",
        "noscript",
        "script",
        "style",
        "svg",
        "template",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skipped_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag.lower() in self.SKIPPED:
            self.skipped_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.SKIPPED and self.skipped_depth:
            self.skipped_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skipped_depth:
            self.parts.append(data)


def _is_html(body: bytes, content_type: str) -> bool:
    media_type = content_type.partition(";")[0].strip().lower()
    return media_type in {"text/html", "application/xhtml+xml"} or body.lstrip().lower().startswith(
        (b"<!doctype html", b"<html")
    )


def normalized_content(body: bytes, content_type: str) -> bytes:
    """Remove transport and page-shell noise before comparing mutable terms."""
    media_type = content_type.partition(";")[0].strip().lower()
    if media_type == "application/json":
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return body
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    if _is_html(body, content_type):
        parser = _VisibleText()
        parser.feed(body.decode("utf-8", errors="replace"))
        text = " ".join(" ".join(parser.parts).split())
        # Microsoft hosts render a per-request telemetry nonce as visible text
        # beside their scripts. It is never terms substance; without this the
        # same page hashes differently on every fetch and can never clear drift.
        text = re.sub(r"this is the trace id:\s*[0-9a-f]{32}", "", text, flags=re.IGNORECASE)
        return " ".join(text.split()).encode()
    if media_type.startswith("text/") or media_type in {"application/xml", "text/xml"}:
        return " ".join(body.decode("utf-8", errors="replace").split()).encode()
    return body


def content_sha256(body: bytes, content_type: str) -> str:
    return hashlib.sha256(normalized_content(body, content_type)).hexdigest()


_HEADING = re.compile(r"h([1-6])")
_SEGMENT_BREAK = re.compile(r"(?<=[.!?;:])\s+")
_SCOPE_NAMES = {"page": "whole page", "section": "anchored section"}


class _SectionText(HTMLParser):
    """Collect the visible text of one element, or of the section a heading opens."""

    SKIPPED: ClassVar[set[str]] = {"noscript", "script", "style", "svg", "template"}

    def __init__(self, element_id: str) -> None:
        super().__init__(convert_charrefs=True)
        self.element_id = element_id
        self.found = False
        self.done = False
        self.heading_level: int | None = None
        self.container: str | None = None
        self.depth = 0
        self.skipped_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.done:
            return
        tag = tag.lower()
        heading = _HEADING.fullmatch(tag)
        if not self.found:
            if dict(attrs).get("id") == self.element_id:
                self.found = True
                if heading:
                    self.heading_level = int(heading.group(1))
                else:
                    self.container, self.depth = tag, 1
            return
        # A heading's section ends at the next heading of the same or a higher level.
        if self.heading_level is not None and heading and int(heading.group(1)) <= self.heading_level:
            self.done = True
            return
        if tag == self.container:
            self.depth += 1
        if tag in self.SKIPPED:
            self.skipped_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self.done or not self.found:
            return
        tag = tag.lower()
        if tag in self.SKIPPED and self.skipped_depth:
            self.skipped_depth -= 1
        if tag == self.container:
            self.depth -= 1
            if self.depth == 0:
                self.done = True

    def handle_data(self, data: str) -> None:
        if self.found and not self.done and not self.skipped_depth:
            self.parts.append(data)


def section_text(html: str, element_id: str) -> str | None:
    """The visible text of the section an element id names, or None when the page lacks it."""
    parser = _SectionText(element_id)
    parser.feed(html)
    text = " ".join(" ".join(parser.parts).split())
    return text if parser.found and text else None


@dataclass(frozen=True)
class TermsContent:
    text: str | None
    sha256: str
    scope: str
    page_sha256: str
    anchor_missing: bool = False


def terms_content(body: bytes, content_type: str, url: str) -> TermsContent | None:
    """The terms a URL points at: its section when it names one, otherwise the whole page.

    The text is exactly what the hash covers, so a later drift can show what changed. None
    means nothing readable remained, which proves nothing about the terms.
    """
    page = normalized_content(body, content_type)
    if not page.strip():
        return None
    page_sha256 = hashlib.sha256(page).hexdigest()
    element_id = urllib.parse.urlsplit(url).fragment or TERMS_SECTION_IDS.get(url)
    anchor_missing = False
    if element_id and _is_html(body, content_type):
        section = section_text(body.decode("utf-8", errors="replace"), element_id)
        if section:
            return TermsContent(
                section, hashlib.sha256(section.encode()).hexdigest(), "section", page_sha256
            )
        anchor_missing = True
    try:
        text: str | None = page.decode("utf-8")
    except UnicodeDecodeError:
        text = None
    return TermsContent(text, page_sha256, "page", page_sha256, anchor_missing)


def _clip(segment: str) -> str:
    return segment if len(segment) <= MAX_SEGMENT_CHARS else segment[: MAX_SEGMENT_CHARS - 1] + "…"


def drift_diff(before: str | None, after: str | None) -> list[str]:
    """Changed sentence-sized segments between two stored terms texts, bounded for a terminal."""
    if before is None:
        return ["  (no baseline text stored; the next accepted review stores one)"]
    if after is None:
        return ["  (the changed content is not text, so no diff is available)"]
    old = _SEGMENT_BREAK.split(before)
    new = _SEGMENT_BREAK.split(after)
    changed: list[str] = []
    matcher = difflib.SequenceMatcher(a=old, b=new, autojunk=False)
    for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        changed.extend(f"  - {_clip(segment)}" for segment in old[old_start:old_end])
        changed.extend(f"  + {_clip(segment)}" for segment in new[new_start:new_end])
    if len(changed) > MAX_DIFF_SEGMENTS:
        hidden = len(changed) - MAX_DIFF_SEGMENTS
        changed = [*changed[:MAX_DIFF_SEGMENTS], f"  … {hidden} more changed segments"]
    return changed


def _entry_drift_diff(entry: Mapping[str, Any]) -> list[str]:
    """The stored diff for an entry with open drift, noting a change of hashed scope."""
    baseline_scope = entry.get("terms_hash_scope", "page")
    observed_scope = entry.get("observed_terms_hash_scope", baseline_scope)
    notes = []
    if observed_scope != baseline_scope:
        notes.append(
            f"  (the baseline hashes the {_SCOPE_NAMES.get(baseline_scope, baseline_scope)}; "
            f"the new hash covers the {_SCOPE_NAMES.get(observed_scope, observed_scope)})"
        )
    return [*notes, *drift_diff(entry.get("terms_text"), entry.get("observed_terms_text"))]


def _fetch_url(url: str) -> str:
    """Prefer stable raw bytes for mutable GitHub and Hugging Face blob pages."""
    parsed = urllib.parse.urlsplit(url)
    parts = parsed.path.strip("/").split("/")
    if parsed.hostname == "github.com" and len(parts) >= 5 and parts[2] == "blob":
        owner, repo, _blob, ref, *path = parts
        raw_path = "/".join((owner, repo, ref, *path))
        return urllib.parse.urlunsplit(("https", "raw.githubusercontent.com", f"/{raw_path}", "", ""))
    if parsed.hostname == "huggingface.co" and len(parts) >= 5 and parts[2] == "blob":
        owner, repo, _blob, ref, *path = parts
        raw_path = "/".join((owner, repo, "resolve", ref, *path))
        return urllib.parse.urlunsplit(("https", "huggingface.co", f"/{raw_path}", parsed.query, ""))
    return url


class _HTTPSRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        if urllib.parse.urlsplit(newurl).scheme.lower() != "https":
            raise urllib.error.URLError("redirect left HTTPS")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if (
            redirected is not None
            and urllib.parse.urlsplit(req.full_url).hostname
            != urllib.parse.urlsplit(newurl).hostname
        ):
            redirected.remove_header("Authorization")
        return redirected


def _headers(value: Mapping[str, str] | Message) -> dict[str, str]:
    return {key.lower(): str(item) for key, item in value.items()}


def _rate_limit_delay(headers: Mapping[str, str], attempt: int) -> float:
    retry_after = headers.get("retry-after")
    if retry_after:
        try:
            return min(30.0, max(0.0, float(retry_after)))
        except ValueError:
            pass
    reset = headers.get("x-ratelimit-reset")
    if headers.get("x-ratelimit-remaining") == "0" and reset:
        try:
            return min(30.0, max(0.0, float(reset) - time.time()))
        except ValueError:
            pass
    return float(2**attempt)


def _browser_headers() -> dict[str, str]:
    """Headers mimicking an ordinary browser for bot-walled terms pages.

    Some developer terms pages (observed on xAI and OpenAI hosts) refuse the
    checker's bot user agent with 403 while serving browsers normally. A
    one-shot retry with these headers distinguishes a bot wall from a broken
    link; it never replaces the recorded evidence URL or review date.
    """
    return {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_USER_AGENT,
    }


def _browser_fallback_fetch(
    opener: Any,
    fetch_url: str,
    *,
    monitor_terms: bool,
) -> FetchResult | None:
    """Retry one GET with browser headers; None when the wall holds."""
    headers = _browser_headers()
    if not monitor_terms:
        headers["Range"] = "bytes=0-0"
    request = urllib.request.Request(fetch_url, headers=headers, method="GET")
    try:
        with opener.open(request, timeout=30) as response:
            final_url = response.geturl()
            if urllib.parse.urlsplit(final_url).scheme.lower() != "https":
                return None
            response_headers = _headers(response.headers)
            body = None
            if monitor_terms:
                body = response.read(MAX_TERMS_BYTES + 1)
                if len(body) > MAX_TERMS_BYTES:
                    return None
            else:
                response.read(1)
            return FetchResult(
                status=response.getcode(),
                final_url=final_url,
                headers=response_headers,
                body=body,
                via_browser_fallback=True,
            )
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return None


def _needs_terms_body(target: LinkTarget, cached: Mapping[str, Any]) -> bool:
    """True when a terms entry lacks the text behind a stored hash.

    A conditional request can come back 304 with no body, which would leave that text
    missing on every later run, so such an entry must fetch the page in full.
    """
    if not target.monitor_terms or not cached.get("terms_sha256"):
        return False
    return "terms_text" not in cached or (
        bool(cached.get("observed_terms_sha256")) and "observed_terms_text" not in cached
    )


def fetch_target(
    target: LinkTarget,
    cached: Mapping[str, Any],
    *,
    token: str | None,
    attempts: int = 3,
    sleeper: Sleeper = time.sleep,
    opener: Any = None,
) -> FetchResult:
    """Fetch one target with conditional requests and bounded rate-limit retries."""
    fetch_url = _fetch_url(target.url) if target.monitor_terms else target.url
    parsed = urllib.parse.urlsplit(fetch_url)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise FetchFailure("target is not an absolute HTTPS URL")
    opener = opener or urllib.request.build_opener(_HTTPSRedirectHandler())
    methods = ("GET",) if target.monitor_terms else ("HEAD", "GET")
    conditional = not _needs_terms_body(target, cached)
    last_failure: FetchFailure | None = None

    for method in methods:
        for attempt in range(attempts):
            headers = {
                "Accept": "*/*",
                "User-Agent": BOT_USER_AGENT,
            }
            if method == "GET" and not target.monitor_terms:
                headers["Range"] = "bytes=0-0"
            if conditional and cached.get("etag"):
                headers["If-None-Match"] = str(cached["etag"])
            if conditional and cached.get("last_modified"):
                headers["If-Modified-Since"] = str(cached["last_modified"])
            if token and parsed.hostname == "api.github.com":
                headers["Authorization"] = f"Bearer {token}"
            request = urllib.request.Request(fetch_url, headers=headers, method=method)
            try:
                with opener.open(request, timeout=30) as response:
                    final_url = response.geturl()
                    if urllib.parse.urlsplit(final_url).scheme.lower() != "https":
                        raise FetchFailure("response left HTTPS")
                    response_headers = _headers(response.headers)
                    body = None
                    if target.monitor_terms:
                        body = response.read(MAX_TERMS_BYTES + 1)
                        if len(body) > MAX_TERMS_BYTES:
                            raise FetchFailure(f"terms response exceeds {MAX_TERMS_BYTES} bytes")
                    elif method == "GET":
                        response.read(1)
                    return FetchResult(
                        status=response.getcode(),
                        final_url=final_url,
                        headers=response_headers,
                        body=body,
                    )
            except urllib.error.HTTPError as exc:
                response_headers = _headers(exc.headers)
                if exc.code == 304:
                    return FetchResult(
                        status=304,
                        final_url=target.url,
                        headers=response_headers,
                        body=None,
                        not_modified=True,
                    )
                rate_limited = exc.code == 403 and response_headers.get("x-ratelimit-remaining") == "0"
                if exc.code in TRANSIENT_HTTP_CODES or rate_limited:
                    last_failure = FetchFailure(f"HTTP {exc.code} after retries", status=exc.code)
                    if attempt < attempts - 1:
                        sleeper(_rate_limit_delay(response_headers, attempt))
                        continue
                if method == "HEAD" and exc.code in HEAD_FALLBACK_CODES and not rate_limited:
                    last_failure = FetchFailure(f"HTTP {exc.code}", status=exc.code)
                    break
                if method == "GET" and exc.code == 403 and not rate_limited:
                    browser_result = _browser_fallback_fetch(
                        opener, fetch_url, monitor_terms=target.monitor_terms
                    )
                    if browser_result is not None:
                        return browser_result
                raise FetchFailure(f"HTTP {exc.code}", status=exc.code) from exc
            except FetchFailure:
                raise
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_failure = FetchFailure(f"{type(exc).__name__}: {exc}")
                if attempt < attempts - 1:
                    sleeper(float(2**attempt))
                    continue
                raise last_failure from exc
        else:
            continue
        if method == "HEAD":
            continue
        break
    if last_failure is not None:
        raise last_failure
    raise FetchFailure("request did not produce a response")


def load_cache(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": CACHE_VERSION, "updated_at": None, "entries": {}}
    cache = load_json(path)
    if set(cache) != {"version", "updated_at", "entries"} or cache.get("version") != CACHE_VERSION:
        raise ValueError(f"{path}: unsupported evidence-link cache schema")
    if not isinstance(cache.get("entries"), dict):
        raise ValueError(f"{path}: cache entries must be an object")
    return cache


def write_cache(path: Path, cache: dict[str, Any]) -> None:
    """Replace the cache atomically, so an interrupted run never leaves a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def default_cache_path(
    root: Path = ROOT,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> Path:
    """Resolve the cache every worktree of the clone shares, or the local file outside git."""
    try:
        result = runner(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return root / LEGACY_CACHE_NAME
    common_dir = result.stdout.strip()
    return Path(common_dir) / SHARED_CACHE_PATH if common_dir else root / LEGACY_CACHE_NAME


class CacheLocked(RuntimeError):
    """Another evidence-link run holds the cache."""


@contextlib.contextmanager
def cache_lock(path: Path) -> Iterator[None]:
    """Hold an exclusive lock on the cache from load to save; refuse rather than wait."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_name(f"{path.name}.lock").open("a", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise CacheLocked(
                f"{path}: another evidence-link check is using this cache; wait for it to finish"
            ) from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _reviewed_since_last_run(
    review_dates: Mapping[str, str | None], last_run: datetime | None
) -> bool:
    """True when every reference was reviewed on or after the day of the cache's previous run."""
    if last_run is None or not review_dates:
        return False
    since = last_run.date().isoformat()
    return all(isinstance(value, str) and value >= since for value in review_dates.values())


def _missing_baseline_error(target: LinkTarget) -> str:
    return (
        f"terms baseline missing: {target.url} ({_reference_label(target)}); no cached baseline "
        "covers a review made before the last check. Import the cache that checked it "
        "(--import-cache), or review the page and rerun with --establish-baselines --max-age-hours 0"
    )


@dataclass
class ImportReport:
    sources: int = 0
    added: int = 0
    agreed: int = 0
    newer_review: int = 0
    conflicts: int = 0
    conflict_urls: list[str] = field(default_factory=list)


def _review_map(raw: object, keys: Iterable[str]) -> dict[str, object]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        # Cache version 1.0 once stored a single date for a shared URL.
        return dict.fromkeys(keys, raw)
    return {}


def _reviewed_strictly_later(candidate: Mapping[str, Any], other: Mapping[str, Any]) -> bool:
    """True when candidate was accepted after a newer human review of every reference."""
    raw_candidate = candidate.get("terms_reviewed_at")
    raw_other = other.get("terms_reviewed_at")
    keys = {
        *(raw_candidate if isinstance(raw_candidate, dict) else ()),
        *(raw_other if isinstance(raw_other, dict) else ()),
    } or {""}
    ours = _review_map(raw_candidate, keys)
    theirs = _review_map(raw_other, keys)
    return bool(ours) and all(
        isinstance(ours.get(key), str)
        and (not isinstance(theirs.get(key), str) or ours[key] > theirs[key])
        for key in keys
    )


def _newest_checked(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    first_at = _parse_timestamp(first.get("checked_at"))
    second_at = _parse_timestamp(second.get("checked_at"))
    if second_at is not None and (first_at is None or second_at > first_at):
        return second
    return first


def _merge_entry(
    current: dict[str, Any] | None,
    incoming: dict[str, Any],
    *,
    url: str,
    today: str,
    report: ImportReport,
) -> dict[str, Any]:
    if current is None:
        report.added += 1
        return dict(incoming)
    current_hash = current.get("terms_sha256")
    incoming_hash = incoming.get("terms_sha256")
    if not current_hash or not incoming_hash:
        if current_hash:
            return dict(current)
        if incoming_hash:
            return dict(incoming)
        return dict(_newest_checked(current, incoming))

    winner: dict[str, Any] | None = None
    if _reviewed_strictly_later(incoming, current):
        winner = incoming
    elif _reviewed_strictly_later(current, incoming):
        winner = current

    if current_hash == incoming_hash:
        report.agreed += 1
        if winner is not None:
            return dict(winner)
        merged = dict(_newest_checked(current, incoming))
        merged.pop("terms_drift_detected_at", None)
        merged.pop("observed_terms_sha256", None)
        drifted = [side for side in (current, incoming) if side.get("terms_drift_detected_at")]
        if drifted:
            earliest = min(drifted, key=lambda side: str(side["terms_drift_detected_at"]))
            merged["terms_drift_detected_at"] = earliest["terms_drift_detected_at"]
            if earliest.get("observed_terms_sha256"):
                merged["observed_terms_sha256"] = earliest["observed_terms_sha256"]
        return merged

    if winner is not None:
        report.newer_review += 1
        return dict(winner)
    # Two baselines and no later human review to choose between them: fail closed.
    base = _newest_checked(current, incoming)
    other = incoming if base is current else current
    merged = dict(base)
    merged.setdefault("observed_terms_sha256", other["terms_sha256"])
    merged.setdefault("terms_drift_detected_at", today)
    report.conflicts += 1
    report.conflict_urls.append(url)
    return merged


def merge_caches(
    shared: dict[str, Any], sources: Iterable[dict[str, Any]], *, today: str
) -> ImportReport:
    """Merge per-checkout caches into one, failing closed wherever baselines disagree."""
    report = ImportReport()
    entries = shared["entries"]
    for source in sources:
        report.sources += 1
        for url, incoming in source["entries"].items():
            if not isinstance(incoming, dict):
                continue
            existing = entries.get(url)
            entries[url] = _merge_entry(
                existing if isinstance(existing, dict) else None,
                incoming,
                url=url,
                today=today,
                report=report,
            )
        stamps = [
            value
            for value in (shared.get("updated_at"), source.get("updated_at"))
            if _parse_timestamp(value) is not None
        ]
        if stamps:
            shared["updated_at"] = max(stamps, key=_parse_timestamp)
    return report


def import_caches(cache_path: Path, sources: Iterable[Path], *, today: str) -> ImportReport:
    loaded = []
    for source in sources:
        if not source.is_file():
            raise FileNotFoundError(f"{source}: no evidence-link cache to import")
        loaded.append(load_cache(source))
    shared = load_cache(cache_path)
    report = merge_caches(shared, loaded, today=today)
    write_cache(cache_path, shared)
    return report


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _is_fresh(entry: Mapping[str, Any], now: datetime, max_age: timedelta) -> bool:
    checked_at = _parse_timestamp(entry.get("checked_at"))
    return checked_at is not None and now - checked_at < max_age


def _reference_label(target: LinkTarget) -> str:
    preview = ", ".join(target.references[:3])
    if len(target.references) > 3:
        preview += f", +{len(target.references) - 3} more"
    return preview


def _terms_drift_error(target: LinkTarget) -> str:
    return f"terms drift requires review: {target.url} ({_reference_label(target)})"


def _terms_review_advanced(target: LinkTarget, entry: Mapping[str, Any]) -> bool:
    current_dates = dict(target.review_dates)
    previous_dates = entry.get("terms_reviewed_at")
    if isinstance(previous_dates, str):
        # Cache version 1.0 stored only the newest date for a shared URL. Treat
        # that date as every reference's baseline so migration cannot clear a
        # drift signal on the strength of one newly reviewed record.
        previous_dates = dict.fromkeys(current_dates, previous_dates)
    if not isinstance(previous_dates, dict):
        previous_dates = {}
    return bool(current_dates) and all(
        isinstance(date, str)
        and (
            not isinstance(previous_dates.get(reference), str)
            or date > previous_dates[reference]
        )
        for reference, date in current_dates.items()
    )


def check_targets(
    targets: list[LinkTarget],
    cache: dict[str, Any],
    fetcher: Fetcher,
    *,
    now: datetime,
    max_age: timedelta,
    workers: int = 1,
    establish_baselines: bool = False,
) -> CheckSummary:
    summary = CheckSummary(total=len(targets))
    previous_entries = cache["entries"]
    next_entries: dict[str, Any] = {}
    # A baseline may be created silently only for terms reviewed since this cache last ran.
    last_run = _parse_timestamp(cache.get("updated_at"))

    pending: list[tuple[LinkTarget, dict[str, Any]]] = []
    for target in targets:
        previous = previous_entries.get(target.url, {})
        if not isinstance(previous, dict):
            previous = {}
        if not _is_fresh(previous, now, max_age):
            pending.append((target, previous))

    def attempt(item: tuple[LinkTarget, dict[str, Any]]) -> FetchResult | FetchFailure:
        target, previous = item
        try:
            return fetcher(target, previous)
        except FetchFailure as exc:
            return exc

    if workers == 1:
        fetched = {target.url: attempt((target, previous)) for target, previous in pending}
    else:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            outcomes = executor.map(attempt, pending)
            fetched = {
                target.url: outcome
                for (target, _previous), outcome in zip(pending, outcomes, strict=True)
            }

    for target in targets:
        previous = previous_entries.get(target.url, {})
        if not isinstance(previous, dict):
            previous = {}
        if _is_fresh(previous, now, max_age):
            next_entries[target.url] = previous
            summary.cached += 1
            summary.succeeded += 1
            if previous.get("terms_drift_detected_at"):
                summary.errors.append(_terms_drift_error(target))
                summary.drift_details[target.url] = _entry_drift_diff(previous)
            elif target.monitor_terms and previous.get("terms_baseline_missing"):
                summary.errors.append(_missing_baseline_error(target))
            continue

        outcome = fetched[target.url]
        if isinstance(outcome, FetchFailure):
            exc = outcome
            summary.failed += 1
            if previous:
                next_entries[target.url] = previous
            message = f"{target.url}: {exc} ({_reference_label(target)})"
            if exc.status in {404, 410}:
                summary.errors.append(f"broken reviewed link: {message}")
            else:
                summary.warnings.append(f"unchecked reviewed link: {message}")
            continue
        response = outcome

        summary.checked += 1
        summary.succeeded += 1
        entry = dict(previous)
        entry.update({
            "checked_at": now.isoformat().replace("+00:00", "Z"),
            "final_url": response.final_url,
            "status": response.status,
        })
        if response.headers.get("etag"):
            entry["etag"] = response.headers["etag"]
        if response.headers.get("last-modified"):
            entry["last_modified"] = response.headers["last-modified"]
        if response.via_browser_fallback:
            entry["via_browser_fallback"] = True
            summary.warnings.append(
                f"bot-walled reviewed link (browser headers succeeded): "
                f"{target.url} ({_reference_label(target)})"
            )

        if target.monitor_terms:
            current_hash: str | None = None
            current_text: str | None = None
            current_scope = entry.get("terms_hash_scope", "page")
            page_hash: str | None = None
            if response.not_modified:
                observed = entry.get("observed_terms_sha256")
                current_hash = observed or entry.get("terms_sha256")
                if observed:
                    current_text = entry.get("observed_terms_text")
                    current_scope = entry.get("observed_terms_hash_scope", current_scope)
                else:
                    current_text = entry.get("terms_text")
                page_hash = current_hash if current_scope == "page" else None
            elif response.body is not None:
                # An empty normalized body (usually a JavaScript shell with no readable
                # terms) proves nothing about the terms. terms_content returns None for
                # it, so it counts as unavailable rather than bootstrapping an empty
                # baseline that every later real fetch would flag as drift.
                content = terms_content(
                    response.body, response.headers.get("content-type", ""), target.url
                )
                if content is not None:
                    current_hash, current_text = content.sha256, content.text
                    current_scope, page_hash = content.scope, content.page_sha256
                    if content.anchor_missing:
                        summary.warnings.append(
                            f"terms anchor not found: {target.url} ({_reference_label(target)}); "
                            "hashing the whole page"
                        )

            baseline_hash = entry.get("terms_sha256")
            review_dates = dict(target.review_dates)
            review_advanced = _terms_review_advanced(target, entry)
            if (
                current_hash is not None
                and baseline_hash is not None
                and current_scope == "section"
                and entry.get("terms_hash_scope", "page") == "page"
                and page_hash == baseline_hash
                and not entry.get("terms_drift_detected_at")
            ):
                # A baseline recorded over the whole page moves to the anchored section
                # silently only when the page is exactly the one that baseline hashed.
                _store_terms(entry, "terms", current_hash, current_text, current_scope)
                baseline_hash = current_hash
            if current_hash is None:
                summary.failed += 1
                summary.succeeded -= 1
                summary.warnings.append(
                    f"terms content unavailable: {target.url} ({_reference_label(target)})"
                )
            elif baseline_hash is None:
                reviewed_since = _reviewed_since_last_run(review_dates, last_run)
                if reviewed_since or establish_baselines:
                    _store_terms(entry, "terms", current_hash, current_text, current_scope)
                    entry["terms_reviewed_at"] = review_dates
                    _clear_observed(entry)
                    entry.pop("terms_baseline_missing", None)
                    summary.terms_bootstrapped += 1
                    if not reviewed_since:
                        summary.warnings.append(
                            "terms baseline established by request: "
                            f"{target.url} ({_reference_label(target)})"
                        )
                else:
                    # Terms reviewed before the last run should already have a baseline;
                    # its absence means a lost, new, or partial cache, not a first sight.
                    entry["terms_baseline_missing"] = now.date().isoformat()
                    summary.errors.append(_missing_baseline_error(target))
            elif current_hash != baseline_hash or entry.get("terms_drift_detected_at"):
                if review_advanced:
                    _store_terms(entry, "terms", current_hash, current_text, current_scope)
                    entry["terms_reviewed_at"] = review_dates
                    _clear_observed(entry)
                    summary.terms_accepted += 1
                else:
                    _store_terms(entry, "observed_terms", current_hash, current_text, current_scope)
                    entry.setdefault(
                        "terms_drift_detected_at",
                        now.date().isoformat(),
                    )
                    summary.errors.append(_terms_drift_error(target))
                    summary.drift_details[target.url] = _entry_drift_diff(entry)
            else:
                entry["terms_reviewed_at"] = review_dates
                # Entries from before stored text gain it once their hash is confirmed unchanged.
                if "terms_text" not in entry and current_text is not None:
                    entry["terms_text"] = current_text
                entry.setdefault("terms_hash_scope", current_scope)

        next_entries[target.url] = entry

    coverage = summary.succeeded / summary.total if summary.total else 1.0
    if coverage < MIN_SUCCESS_RATIO:
        summary.errors.append(
            f"only {summary.succeeded}/{summary.total} reviewed links were checked or cached; "
            f"minimum coverage is {MIN_SUCCESS_RATIO:.0%}"
        )
    cache["updated_at"] = now.isoformat().replace("+00:00", "Z")
    # The cache is shared by every worktree, and a branch may lack records another
    # branch monitors; keep the entries this run did not check.
    cache["entries"] = {**previous_entries, **next_entries}
    return summary


def _store_terms(
    entry: dict[str, Any], prefix: str, sha256: str, text: str | None, scope: str
) -> None:
    """Record a terms hash with the text and scope it covers, as the baseline or the observation."""
    entry[f"{prefix}_sha256"] = sha256
    entry["terms_hash_scope" if prefix == "terms" else "observed_terms_hash_scope"] = scope
    if text is None:
        entry.pop(f"{prefix}_text", None)
    else:
        entry[f"{prefix}_text"] = text


def _clear_observed(entry: dict[str, Any]) -> None:
    for key in (
        "observed_terms_sha256",
        "observed_terms_text",
        "observed_terms_hash_scope",
        "terms_drift_detected_at",
    ):
        entry.pop(key, None)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=Path,
        default=None,
        help="evidence-link cache path (default: shared by every worktree, in the git directory)",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=DEFAULT_MAX_AGE_HOURS,
        help="reuse a successful cached check younger than this many hours",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help="maximum concurrent network requests",
    )
    parser.add_argument(
        "--establish-baselines",
        action="store_true",
        help="record missing terms baselines; use only after reviewing those pages",
    )
    parser.add_argument(
        "--import-cache",
        type=Path,
        action="append",
        default=[],
        metavar="PATH",
        help="merge an older per-checkout cache into the cache and exit; repeatable",
    )
    parser.add_argument(
        "--show-drift",
        action="store_true",
        help="print what changed on every page with open terms drift, from the cache, and exit",
    )
    return parser


def _run_show_drift(cache_path: Path) -> int:
    """Print stored diffs without fetching or locking; the cache is replaced atomically."""
    try:
        cache = load_cache(cache_path)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    open_drift = sorted(
        (
            (url, entry)
            for url, entry in cache["entries"].items()
            if isinstance(entry, dict) and entry.get("terms_drift_detected_at")
        ),
        key=lambda item: item[0],
    )
    if not open_drift:
        print("no open terms drift")
        return 0
    for url, entry in open_drift:
        print(f"terms drift since {entry['terms_drift_detected_at']}: {url}")
        for line in _entry_drift_diff(entry):
            print(line)
    return 0


def _run_import(cache_path: Path, sources: list[Path]) -> int:
    try:
        report = import_caches(cache_path, sources, today=datetime.now(UTC).date().isoformat())
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(
        f"imported {report.sources} caches into {cache_path}: {report.added} URLs added, "
        f"{report.agreed} baselines agreed, {report.newer_review} taken from a newer review, "
        f"{report.conflicts} disagreements opened as terms drift"
    )
    for url in report.conflict_urls:
        print(f"terms drift opened by import: {url}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.max_age_hours < 0:
        print("error: --max-age-hours must be non-negative", file=sys.stderr)
        return 2
    if args.workers < 1:
        print("error: --workers must be positive", file=sys.stderr)
        return 2
    cache_path = args.cache or default_cache_path()
    if args.show_drift:
        return _run_show_drift(cache_path)
    try:
        with cache_lock(cache_path):
            if args.import_cache:
                return _run_import(cache_path, args.import_cache)
            return _run_check(cache_path, args)
    except CacheLocked as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


def _run_check(cache_path: Path, args: argparse.Namespace) -> int:
    try:
        targets = collect_targets()
        cache = load_cache(cache_path)
    except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    token = os.environ.get("GITHUB_TOKEN")
    summary = check_targets(
        targets,
        cache,
        lambda target, previous: fetch_target(
            target,
            previous,
            token=token,
        ),
        now=datetime.now(UTC),
        max_age=timedelta(hours=args.max_age_hours),
        workers=args.workers,
        establish_baselines=args.establish_baselines,
    )
    write_cache(cache_path, cache)

    print(
        "evidence links: "
        f"{summary.total} targets, {summary.checked} fetched, {summary.cached} cached, "
        f"{summary.failed} unchecked, {summary.terms_bootstrapped} terms baselines added, "
        f"{summary.terms_accepted} reviewed terms changes accepted"
    )
    for warning in summary.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    for error in summary.errors:
        print(f"error: {error}", file=sys.stderr)
    for url, lines in summary.drift_details.items():
        print(f"changes on {url}:", file=sys.stderr)
        for line in lines:
            print(line, file=sys.stderr)
    return 1 if summary.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
