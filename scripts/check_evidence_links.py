#!/usr/bin/env python3
"""Check reviewed catalog links and detect changes to mutable terms pages.

The cache is operational state, not reviewed evidence. It records HTTP validators
and a normalized content hash for mutable terms so repeat runs can use
conditional requests and a changed page can raise a review signal. The checker
never edits catalog records, evidence, scores, classifications, or review dates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.message import Message
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, ClassVar

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
DEFAULT_CACHE_PATH = ROOT / ".evidence-link-cache.json"

CACHE_VERSION = "1.0"
DEFAULT_MAX_AGE_HOURS = 20.0
DEFAULT_WORKERS = 8
MIN_SUCCESS_RATIO = 0.80
MAX_TERMS_BYTES = 8 * 1024 * 1024
TRANSIENT_HTTP_CODES = {408, 425, 429, 500, 502, 503, 504}
HEAD_FALLBACK_CODES = {401, 403, 404, 405, 410, 501}


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

    for filename, key, collection in (
        ("local-runtimes.json", "runtimes", "local-runtimes"),
        ("models.json", "models", "models"),
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


def normalized_content(body: bytes, content_type: str) -> bytes:
    """Remove transport and page-shell noise before comparing mutable terms."""
    media_type = content_type.partition(";")[0].strip().lower()
    stripped = body.lstrip().lower()
    if media_type == "application/json":
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return body
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    if media_type in {"text/html", "application/xhtml+xml"} or stripped.startswith(
        (b"<!doctype html", b"<html")
    ):
        parser = _VisibleText()
        parser.feed(body.decode("utf-8", errors="replace"))
        return " ".join(" ".join(parser.parts).split()).encode()
    if media_type.startswith("text/") or media_type in {"application/xml", "text/xml"}:
        return " ".join(body.decode("utf-8", errors="replace").split()).encode()
    return body


def content_sha256(body: bytes, content_type: str) -> str:
    return hashlib.sha256(normalized_content(body, content_type)).hexdigest()


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
    last_failure: FetchFailure | None = None

    for method in methods:
        for attempt in range(attempts):
            headers = {
                "Accept": "*/*",
                "User-Agent": "ai-systems-atlas-evidence-checker/0.1",
            }
            if method == "GET" and not target.monitor_terms:
                headers["Range"] = "bytes=0-0"
            if cached.get("etag"):
                headers["If-None-Match"] = str(cached["etag"])
            if cached.get("last_modified"):
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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


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
) -> CheckSummary:
    summary = CheckSummary(total=len(targets))
    previous_entries = cache["entries"]
    next_entries: dict[str, Any] = {}

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

        if target.monitor_terms:
            current_hash: str | None
            if response.not_modified:
                current_hash = entry.get("observed_terms_sha256") or entry.get("terms_sha256")
            elif response.body is not None:
                current_hash = content_sha256(
                    response.body,
                    response.headers.get("content-type", ""),
                )
            else:
                current_hash = None

            baseline_hash = entry.get("terms_sha256")
            review_dates = dict(target.review_dates)
            review_advanced = _terms_review_advanced(target, entry)
            if current_hash is None:
                summary.failed += 1
                summary.succeeded -= 1
                summary.warnings.append(
                    f"terms content unavailable: {target.url} ({_reference_label(target)})"
                )
            elif baseline_hash is None:
                entry["terms_sha256"] = current_hash
                entry["terms_reviewed_at"] = review_dates
                entry.pop("observed_terms_sha256", None)
                entry.pop("terms_drift_detected_at", None)
                summary.terms_bootstrapped += 1
            elif current_hash != baseline_hash or entry.get("terms_drift_detected_at"):
                if review_advanced:
                    entry["terms_sha256"] = current_hash
                    entry["terms_reviewed_at"] = review_dates
                    entry.pop("observed_terms_sha256", None)
                    entry.pop("terms_drift_detected_at", None)
                    summary.terms_accepted += 1
                else:
                    entry["observed_terms_sha256"] = current_hash
                    entry.setdefault(
                        "terms_drift_detected_at",
                        now.date().isoformat(),
                    )
                    summary.errors.append(_terms_drift_error(target))
            else:
                entry["terms_reviewed_at"] = review_dates

        next_entries[target.url] = entry

    coverage = summary.succeeded / summary.total if summary.total else 1.0
    if coverage < MIN_SUCCESS_RATIO:
        summary.errors.append(
            f"only {summary.succeeded}/{summary.total} reviewed links were checked or cached; "
            f"minimum coverage is {MIN_SUCCESS_RATIO:.0%}"
        )
    cache["updated_at"] = now.isoformat().replace("+00:00", "Z")
    cache["entries"] = next_entries
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=Path,
        default=DEFAULT_CACHE_PATH,
        help="operational HTTP cache path (default: repository-local ignored file)",
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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.max_age_hours < 0:
        print("error: --max-age-hours must be non-negative", file=sys.stderr)
        return 2
    if args.workers < 1:
        print("error: --workers must be positive", file=sys.stderr)
        return 2
    try:
        targets = collect_targets()
        cache = load_cache(args.cache)
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
    )
    write_cache(args.cache, cache)

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
    return 1 if summary.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
