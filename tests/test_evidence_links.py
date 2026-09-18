from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest import mock

from scripts import check_evidence_links


def target(*, reviewed_at: str = "2026-09-01", terms: bool = False) -> check_evidence_links.LinkTarget:
    reference = "systems:example:license:0" if terms else "systems:example:url"
    return check_evidence_links.LinkTarget(
        url="https://example.com/terms" if terms else "https://example.com/project",
        kinds=("terms",) if terms else ("record",),
        references=(reference,),
        review_dates=((reference, reviewed_at),),
        monitor_terms=terms,
    )


def response(body: bytes | None = None, *, status: int = 200) -> check_evidence_links.FetchResult:
    return check_evidence_links.FetchResult(
        status=status,
        final_url="https://example.com/final",
        headers={"content-type": "text/html", "etag": '"abc"'},
        body=body,
        not_modified=status == 304,
    )


class _Response:
    def __init__(self, body: bytes = b"ok", *, status: int = 200) -> None:
        self.body = body
        self.status = status
        self.headers = {"Content-Type": "text/plain", "ETag": '"new"'}

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def geturl(self) -> str:
        return "https://example.com/final"

    def getcode(self) -> int:
        return self.status

    def read(self, amount: int | None = None) -> bytes:
        return self.body if amount is None else self.body[:amount]


class _Opener:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = outcomes
        self.requests: list[urllib.request.Request] = []

    def open(self, request: urllib.request.Request, timeout: int) -> _Response:
        self.requests.append(request)
        self.timeout = timeout
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        assert isinstance(outcome, _Response)
        return outcome


class EvidenceLinkTests(unittest.TestCase):
    def test_collects_every_reviewed_collection_and_deduplicates_urls(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            documents = {
                "projects.json": {"projects": [{"id": "system", "url": "https://example.com/shared", "verified_at": "2026-08-01"}]},
                "license-evidence.json": {"entries": [{"project_id": "system", "items": [{
                    "kind": "web_terms", "url": "https://example.com/terms", "verified_at": "2026-08-02"
                }]}]},
                "specifications.json": {"specifications": [{
                    "id": "spec", "url": "https://example.com/shared", "verified_at": "2026-08-03",
                    "evidence": [{"kind": "git_blob", "url": "https://example.com/blob", "immutable_url": "https://api.github.com/blob"}],
                    "license_evidence": [],
                }]},
                "inference-services.json": {"services": [{
                    "id": "service", "url": "https://example.com/service", "verified_at": "2026-08-04",
                    "terms": {"kind": "web_terms", "url": "https://example.com/terms", "verified_at": "2026-08-05"},
                    "evidence": [],
                }]},
                "local-runtimes.json": {"runtimes": [{
                    "id": "runtime", "url": "https://example.com/runtime", "verified_at": "2026-08-06",
                    "evidence": [], "license_evidence": [],
                }]},
                "models.json": {"models": [{
                    "id": "model", "url": "https://example.com/model", "verified_at": "2026-08-07",
                    "evidence": [], "license_evidence": [],
                }]},
                "packs.json": {"packs": [{
                    "id": "kit", "url": "https://example.com/kit", "verified_at": "2026-08-08",
                    "evidence": [{"kind": "git_blob", "url": "https://example.com/kit-manifest", "immutable_url": "https://api.github.com/kit-blob"}],
                    "license_evidence": [],
                }]},
            }
            for filename, document in documents.items():
                (directory / filename).write_text(json.dumps(document), encoding="utf-8")

            targets = check_evidence_links.collect_targets(directory)

        by_url = {item.url: item for item in targets}
        self.assertEqual(10, len(targets))
        self.assertEqual(
            ("specifications:spec:url", "systems:system:url"),
            by_url["https://example.com/shared"].references,
        )
        self.assertTrue(by_url["https://example.com/terms"].monitor_terms)
        self.assertEqual(
            (
                ("inference-services:service:terms:0", "2026-08-05"),
                ("systems:system:license:0", "2026-08-02"),
            ),
            by_url["https://example.com/terms"].review_dates,
        )
        self.assertIn("immutable_evidence", by_url["https://api.github.com/blob"].kinds)
        self.assertEqual(("packs:kit:url",), by_url["https://example.com/kit"].references)

    def test_trust_urls_are_link_checked_and_never_drift_hashed(self) -> None:
        """A third-party page is not the Atlas's to accept changes to: check the link, hash nothing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            documents = {
                "projects.json": {"projects": []},
                "license-evidence.json": {"entries": []},
                "specifications.json": {"specifications": []},
                "local-runtimes.json": {"runtimes": []},
                "models.json": {"models": []},
                "packs.json": {"packs": []},
                "inference-services.json": {"services": [{
                    "id": "router", "url": "https://example.com/router", "verified_at": "2026-09-18",
                    "terms": {"kind": "web_terms", "url": "https://example.com/terms", "verified_at": "2026-09-18"},
                    "evidence": [],
                    "trust": {
                        "verified_at": "2026-09-18",
                        "properties": {"cache_isolation": {
                            "status": "undocumented", "note": "n", "scope": "s",
                            "url": "https://example.com/privacy", "verified_at": "2026-09-17",
                        }},
                        "findings": [{
                            "claim": "c", "published_at": "2026-05-28",
                            "source": {
                                "label": "l", "url": "https://arxiv.org/abs/2605.30613v1", "kind": "third_party",
                                "content_sha256": "0" * 64, "fetched_at": "2026-09-16",
                            },
                            "operator_response": {"url": "https://example.com/response", "verified_at": "2026-09-17", "summary": "s"},
                            "resolved": None,
                        }],
                    },
                }]},
            }
            for filename, document in documents.items():
                (directory / filename).write_text(json.dumps(document), encoding="utf-8")

            targets = check_evidence_links.collect_targets(directory)

        by_url = {item.url: item for item in targets}
        self.assertEqual(5, len(targets))
        finding = by_url["https://arxiv.org/abs/2605.30613v1"]
        self.assertFalse(finding.monitor_terms)
        self.assertIn("trust_finding", finding.kinds)
        self.assertEqual((("inference-services:router:finding:0", "2026-09-16"),), finding.review_dates)
        self.assertEqual(("inference-services:router:trust:cache_isolation",), by_url["https://example.com/privacy"].references)
        self.assertFalse(by_url["https://example.com/privacy"].monitor_terms)
        self.assertIn("trust_response", by_url["https://example.com/response"].kinds)
        self.assertEqual(
            ("inference-services:router:finding:0:operator_response",),
            by_url["https://example.com/response"].references,
        )

    def test_terms_drift_stays_open_until_a_newer_human_review(self) -> None:
        # The previous run predates the review, so the first sight may set the baseline.
        cache = {"version": "1.0", "updated_at": "2026-08-31T00:00:00Z", "entries": {}}
        first = check_evidence_links.check_targets(
            [target(terms=True)],
            cache,
            lambda _target, _cached: response(b"<html><main>Terms A</main></html>"),
            now=datetime(2026, 9, 5, tzinfo=UTC),
            max_age=timedelta(0),
        )
        self.assertEqual([], first.errors)
        self.assertEqual(1, first.terms_bootstrapped)
        baseline = cache["entries"]["https://example.com/terms"]["terms_sha256"]

        changed = check_evidence_links.check_targets(
            [target(terms=True)],
            cache,
            lambda _target, _cached: response(b"<html><main>Terms B</main></html>"),
            now=datetime(2026, 9, 6, tzinfo=UTC),
            max_age=timedelta(0),
        )
        self.assertRegex(changed.errors[0], "terms drift")
        entry = cache["entries"]["https://example.com/terms"]
        self.assertEqual(baseline, entry["terms_sha256"])
        self.assertIn("observed_terms_sha256", entry)

        accepted = check_evidence_links.check_targets(
            [target(reviewed_at="2026-09-07", terms=True)],
            cache,
            lambda _target, _cached: response(b"<html><main>Terms B</main></html>"),
            now=datetime(2026, 9, 7, tzinfo=UTC),
            max_age=timedelta(0),
        )
        self.assertEqual([], accepted.errors)
        self.assertEqual(1, accepted.terms_accepted)
        entry = cache["entries"]["https://example.com/terms"]
        self.assertNotEqual(baseline, entry["terms_sha256"])
        self.assertNotIn("terms_drift_detected_at", entry)

    def test_fresh_cache_avoids_a_request_but_preserves_drift_signal(self) -> None:
        cache = {
            "version": "1.0",
            "updated_at": None,
            "entries": {
                "https://example.com/terms": {
                    "checked_at": "2026-09-05T12:00:00Z",
                    "terms_sha256": "a" * 64,
                    "terms_drift_detected_at": "2026-09-05",
                }
            },
        }

        def unexpected_fetch(_target: object, _cached: object) -> check_evidence_links.FetchResult:
            raise AssertionError("fresh cache should skip the request")

        summary = check_evidence_links.check_targets(
            [target(terms=True)],
            cache,
            unexpected_fetch,
            now=datetime(2026, 9, 5, 13, tzinfo=UTC),
            max_age=timedelta(hours=20),
        )

        self.assertEqual(1, summary.cached)
        self.assertRegex(summary.errors[0], "terms drift")

    def test_broken_links_fail_and_transport_errors_are_warnings(self) -> None:
        cache = {"version": "1.0", "updated_at": None, "entries": {}}
        targets = [
            target(),
            check_evidence_links.LinkTarget(
                url="https://example.com/offline",
                kinds=("evidence",),
                references=("models:model:evidence:0",),
                review_dates=(("models:model:evidence:0", "2026-09-01"),),
                monitor_terms=False,
            ),
        ]

        def fail(item: check_evidence_links.LinkTarget, _cached: object) -> check_evidence_links.FetchResult:
            if item.url.endswith("project"):
                raise check_evidence_links.FetchFailure("HTTP 404", status=404)
            raise check_evidence_links.FetchFailure("URLError: offline")

        summary = check_evidence_links.check_targets(
            targets,
            cache,
            fail,
            now=datetime(2026, 9, 5, tzinfo=UTC),
            max_age=timedelta(0),
        )

        self.assertTrue(any("broken reviewed link" in item for item in summary.errors))
        self.assertTrue(any("minimum coverage" in item for item in summary.errors))
        self.assertTrue(any("unchecked reviewed link" in item for item in summary.warnings))

    def test_fetch_uses_conditional_head_then_bounded_get_fallback(self) -> None:
        http_error = urllib.error.HTTPError(
            "https://example.com/project", 404, "Not Found", {}, None
        )
        opener = _Opener([http_error, _Response()])

        result = check_evidence_links.fetch_target(
            target(),
            {"etag": '"old"', "last_modified": "yesterday"},
            token=None,
            opener=opener,
            sleeper=lambda _delay: None,
        )

        self.assertEqual(200, result.status)
        self.assertEqual(["HEAD", "GET"], [request.method for request in opener.requests])
        self.assertEqual("bytes=0-0", opener.requests[1].get_header("Range"))
        self.assertEqual('"old"', opener.requests[0].get_header("If-none-match"))

    def test_terms_entry_missing_its_text_fetches_a_full_body(self) -> None:
        # A 304 carries no body, so an entry without the text behind its hash would never gain it.
        for cached in (
            {"etag": '"old"', "last_modified": "yesterday", "terms_sha256": "a" * 64},
            {
                "etag": '"old"',
                "terms_sha256": "a" * 64,
                "terms_text": "Terms A.",
                "observed_terms_sha256": "b" * 64,
            },
        ):
            opener = _Opener([_Response(b"<html><main>Terms A.</main></html>")])
            check_evidence_links.fetch_target(
                target(terms=True), cached, token=None, opener=opener, sleeper=lambda _delay: None
            )
            self.assertIsNone(opener.requests[0].get_header("If-none-match"), cached)
            self.assertIsNone(opener.requests[0].get_header("If-modified-since"), cached)

    def test_terms_entry_holding_its_text_keeps_conditional_requests(self) -> None:
        opener = _Opener([_Response(b"<html><main>Terms A.</main></html>")])
        check_evidence_links.fetch_target(
            target(terms=True),
            {"etag": '"old"', "terms_sha256": "a" * 64, "terms_text": "Terms A."},
            token=None,
            opener=opener,
            sleeper=lambda _delay: None,
        )
        self.assertEqual('"old"', opener.requests[0].get_header("If-none-match"))

    def test_head_404_is_confirmed_with_get_before_marking_a_link_broken(self) -> None:
        http_error = urllib.error.HTTPError(
            "https://example.com/project", 404, "Not Found", {}, None
        )
        opener = _Opener([http_error, _Response()])

        result = check_evidence_links.fetch_target(
            target(),
            {},
            token=None,
            opener=opener,
            sleeper=lambda _delay: None,
        )

        self.assertEqual(200, result.status)
        self.assertEqual(["HEAD", "GET"], [request.method for request in opener.requests])

    def test_shared_terms_require_every_affected_reference_to_be_reviewed(self) -> None:
        shared = check_evidence_links.LinkTarget(
            url="https://example.com/terms",
            kinds=("terms",),
            references=("systems:a:license:0", "systems:b:license:0"),
            review_dates=(
                ("systems:a:license:0", "2026-09-07"),
                ("systems:b:license:0", "2026-09-01"),
            ),
            monitor_terms=True,
        )
        cache = {
            "version": "1.0",
            "updated_at": None,
            "entries": {
                shared.url: {
                    "terms_sha256": check_evidence_links.content_sha256(b"Terms A", "text/plain"),
                    "terms_reviewed_at": {
                        "systems:a:license:0": "2026-09-01",
                        "systems:b:license:0": "2026-09-01",
                    },
                }
            },
        }

        summary = check_evidence_links.check_targets(
            [shared],
            cache,
            lambda _target, _cached: response(b"Terms B"),
            now=datetime(2026, 9, 7, tzinfo=UTC),
            max_age=timedelta(0),
        )

        self.assertRegex(summary.errors[0], "terms drift")
        self.assertIn("terms_drift_detected_at", cache["entries"][shared.url])

    def test_fetch_retries_rate_limits_using_retry_after(self) -> None:
        http_error = urllib.error.HTTPError(
            "https://example.com/terms",
            429,
            "Too Many Requests",
            {"Retry-After": "3"},
            None,
        )
        opener = _Opener([http_error, _Response(b"terms")])
        delays: list[float] = []

        result = check_evidence_links.fetch_target(
            target(terms=True),
            {},
            token=None,
            opener=opener,
            sleeper=delays.append,
        )

        self.assertEqual(200, result.status)
        self.assertEqual([3.0], delays)

    def test_terms_hash_ignores_page_shell_and_whitespace(self) -> None:
        first = b"<html><head><title>One</title></head><nav>menu A</nav><main>Same terms</main></html>"
        second = b"<html><head><title>Two</title></head><nav>menu B</nav><main> Same   terms </main></html>"

        self.assertEqual(
            check_evidence_links.content_sha256(first, "text/html; charset=utf-8"),
            check_evidence_links.content_sha256(second, "text/html"),
        )

    def test_mutable_blob_terms_use_stable_raw_endpoints(self) -> None:
        self.assertEqual(
            "https://raw.githubusercontent.com/example/repo/main/LICENSE",
            check_evidence_links._fetch_url("https://github.com/example/repo/blob/main/LICENSE"),
        )
        self.assertEqual(
            "https://huggingface.co/example/model/resolve/main/LICENSE",
            check_evidence_links._fetch_url(
                "https://huggingface.co/example/model/blob/main/LICENSE"
            ),
        )

    def test_redirects_never_send_github_auth_to_another_host(self) -> None:
        handler = check_evidence_links._HTTPSRedirectHandler()
        request = urllib.request.Request(
            "https://api.github.com/repos/example/project",
            headers={"Authorization": "Bearer secret"},
        )

        redirected = handler.redirect_request(
            request,
            None,
            302,
            "Found",
            {},
            "https://downloads.example.com/project",
        )

        self.assertIsNotNone(redirected)
        assert redirected is not None
        self.assertIsNone(redirected.get_header("Authorization"))

    def test_redirects_must_remain_https(self) -> None:
        handler = check_evidence_links._HTTPSRedirectHandler()
        request = urllib.request.Request("https://example.com/project")

        with self.assertRaisesRegex(urllib.error.URLError, "HTTPS"):
            handler.redirect_request(
                request,
                None,
                302,
                "Found",
                {},
                "http://example.com/project",
            )

    def test_bot_walled_get_falls_back_to_browser_headers(self) -> None:
        bot_wall = urllib.error.HTTPError(
            "https://example.com/project", 403, "Forbidden", {}, None
        )
        opener = _Opener([bot_wall, bot_wall, _Response()])

        result = check_evidence_links.fetch_target(
            target(),
            {},
            token=None,
            opener=opener,
            sleeper=lambda _delay: None,
        )

        self.assertEqual(200, result.status)
        self.assertTrue(result.via_browser_fallback)
        self.assertEqual(["HEAD", "GET", "GET"], [request.method for request in opener.requests])
        user_agents = [request.get_header("User-agent") for request in opener.requests]
        self.assertEqual(check_evidence_links.BOT_USER_AGENT, user_agents[0])
        self.assertEqual(check_evidence_links.BOT_USER_AGENT, user_agents[1])
        self.assertEqual(check_evidence_links.BROWSER_USER_AGENT, user_agents[2])

    def test_browser_fallback_refusal_keeps_the_original_403(self) -> None:
        bot_wall = urllib.error.HTTPError(
            "https://example.com/project", 403, "Forbidden", {}, None
        )
        opener = _Opener([
            urllib.error.HTTPError(
                "https://example.com/project", 403, "Forbidden", {}, None
            ),
            bot_wall,
            urllib.error.HTTPError(
                "https://example.com/project", 403, "Forbidden", {}, None
            ),
        ])

        with self.assertRaisesRegex(check_evidence_links.FetchFailure, "HTTP 403"):
            check_evidence_links.fetch_target(
                target(),
                {},
                token=None,
                opener=opener,
                sleeper=lambda _delay: None,
            )

    def test_rate_limit_403_retries_without_browser_headers(self) -> None:
        limited = urllib.error.HTTPError(
            "https://example.com/terms",
            403,
            "Forbidden",
            {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "0"},
            None,
        )
        opener = _Opener([limited, _Response(b"terms")])

        result = check_evidence_links.fetch_target(
            target(terms=True),
            {},
            token=None,
            opener=opener,
            sleeper=lambda _delay: None,
        )

        self.assertEqual(200, result.status)
        self.assertFalse(result.via_browser_fallback)
        for request in opener.requests:
            self.assertEqual(
                check_evidence_links.BOT_USER_AGENT, request.get_header("User-agent")
            )

    def test_bot_wall_success_is_a_visible_warning(self) -> None:
        cache = {"version": "1.0", "updated_at": None, "entries": {}}
        summary = check_evidence_links.check_targets(
            [target()],
            cache,
            lambda _target, _cached: check_evidence_links.FetchResult(
                status=200,
                final_url="https://example.com/project",
                headers={},
                body=None,
                via_browser_fallback=True,
            ),
            now=datetime(2026, 9, 11, tzinfo=UTC),
            max_age=timedelta(0),
        )

        self.assertEqual([], summary.errors)
        self.assertTrue(
            any("bot-walled reviewed link" in item for item in summary.warnings)
        )
        self.assertTrue(cache["entries"]["https://example.com/project"]["via_browser_fallback"])

    def test_telemetry_nonce_does_not_change_the_terms_hash(self) -> None:
        first = (
            b"<html><body><main>Terms text</main>"
            b"<script>telemetry();</script>"
            b"   This is the Trace Id: d0901de7db6b7a296ea95c3a74ffd750 <script>more();</script>"
            b"</body></html>"
        )
        second = first.replace(b"d0901de7db6b7a296ea95c3a74ffd750", b"5f95e477b07e9a394f28e8460cd28633")

        self.assertEqual(
            check_evidence_links.content_sha256(first, "text/html"),
            check_evidence_links.content_sha256(second, "text/html"),
        )

    def test_changed_terms_text_still_changes_the_hash(self) -> None:
        first = b"<html><body><main>Terms text version one</main></body></html>"
        second = b"<html><body><main>Terms text version two</main></body></html>"

        self.assertNotEqual(
            check_evidence_links.content_sha256(first, "text/html"),
            check_evidence_links.content_sha256(second, "text/html"),
        )

    def test_empty_terms_body_is_unavailable_not_a_baseline(self) -> None:
        cache = {"version": "1.0", "updated_at": None, "entries": {}}
        shell = b"<html><head></head><body><div id=root></div><script>app();</script></body></html>"

        summary = check_evidence_links.check_targets(
            [target(terms=True)],
            cache,
            lambda _target, _cached: response(shell),
            now=datetime(2026, 9, 12, tzinfo=UTC),
            max_age=timedelta(0),
        )

        self.assertFalse(
            any("terms drift" in item for item in summary.errors)
        )
        self.assertTrue(
            any("terms content unavailable" in item for item in summary.warnings)
        )
        entry = cache["entries"]["https://example.com/terms"]
        self.assertNotIn("terms_sha256", entry)
        self.assertNotIn("terms_drift_detected_at", entry)


TERMS_URL = "https://example.com/terms"


def terms_entry(
    sha: str,
    reviewed: dict[str, str],
    *,
    checked: str = "2026-09-10T00:00:00Z",
    drift: str | None = None,
    observed: str | None = None,
) -> dict[str, object]:
    entry: dict[str, object] = {
        "checked_at": checked,
        "status": 200,
        "terms_sha256": sha * 64,
        "terms_reviewed_at": reviewed,
    }
    if drift:
        entry["terms_drift_detected_at"] = drift
    if observed:
        entry["observed_terms_sha256"] = observed * 64
    return entry


def cache_of(entries: dict[str, object], *, updated_at: str | None = "2026-09-10T00:00:00Z") -> dict[str, object]:
    return {"version": "1.0", "updated_at": updated_at, "entries": entries}


class SharedCacheTests(unittest.TestCase):
    """One cache for every worktree, no silent baselines, and a fail-closed import."""

    def check_terms(
        self,
        cache: dict[str, object],
        *,
        reviewed_at: str = "2026-09-01",
        now: datetime = datetime(2026, 9, 5, tzinfo=UTC),
        max_age: timedelta = timedelta(0),
        fetch: object = None,
        **options: object,
    ) -> check_evidence_links.CheckSummary:
        body = b"<html><main>Terms A</main></html>"
        return check_evidence_links.check_targets(
            [target(reviewed_at=reviewed_at, terms=True)],
            cache,
            fetch or (lambda _target, _cached: response(body)),
            now=now,
            max_age=max_age,
            **options,
        )

    def test_default_cache_lives_in_the_shared_git_directory(self) -> None:
        calls: list[tuple[list[str], dict[str, object]]] = []

        def runner(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, stdout="/clone/.git\n", stderr="")

        path = check_evidence_links.default_cache_path(Path("/clone/worktree"), runner=runner)
        self.assertEqual(Path("/clone/.git/atlas/evidence-link-cache.json"), path)
        self.assertEqual(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], calls[0][0])
        self.assertEqual(Path("/clone/worktree"), calls[0][1]["cwd"])

    def test_default_cache_falls_back_outside_git(self) -> None:
        def not_a_checkout(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
            raise subprocess.CalledProcessError(128, args)

        def no_git(_args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
            raise FileNotFoundError("git")

        for runner in (not_a_checkout, no_git):
            self.assertEqual(
                Path("/tarball/.evidence-link-cache.json"),
                check_evidence_links.default_cache_path(Path("/tarball"), runner=runner),
            )

    def test_a_held_lock_refuses_a_second_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "atlas" / "evidence-link-cache.json"
            # The first lock stays held while the second is attempted and refused.
            with (
                check_evidence_links.cache_lock(path),
                self.assertRaises(check_evidence_links.CacheLocked),
                check_evidence_links.cache_lock(path),
            ):
                pass
            # Released on exit, so the next run can take it.
            with check_evidence_links.cache_lock(path):
                pass

    def test_cache_writes_replace_the_file_without_leftovers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "atlas" / "evidence-link-cache.json"
            cache = cache_of({}, updated_at=None)
            with mock.patch("scripts.check_evidence_links.os.replace", wraps=os.replace) as replace:
                check_evidence_links.write_cache(path, cache)
            replace.assert_called_once()
            self.assertEqual(cache, json.loads(path.read_text(encoding="utf-8")))
            self.assertEqual(["evidence-link-cache.json"], [item.name for item in path.parent.iterdir()])

    def test_a_run_keeps_entries_it_did_not_target(self) -> None:
        other = "https://example.com/terms-on-another-branch"
        cache = cache_of(
            {other: terms_entry("b", {"systems:other:license:0": "2026-09-01"})},
            updated_at="2026-08-31T00:00:00Z",
        )
        self.check_terms(cache)
        self.assertIn(other, cache["entries"])
        self.assertIn(TERMS_URL, cache["entries"])

    def test_new_baseline_is_recorded_for_terms_reviewed_since_the_last_run(self) -> None:
        cache = cache_of({}, updated_at="2026-09-01T08:00:00Z")
        summary = self.check_terms(cache, reviewed_at="2026-09-01")
        self.assertEqual([], summary.errors)
        self.assertEqual(1, summary.terms_bootstrapped)
        self.assertIn("terms_sha256", cache["entries"][TERMS_URL])

    def test_missing_baseline_for_terms_reviewed_before_the_last_run_fails(self) -> None:
        cache = cache_of({}, updated_at="2026-09-03T08:00:00Z")
        summary = self.check_terms(cache, reviewed_at="2026-09-01")
        self.assertEqual(0, summary.terms_bootstrapped)
        self.assertRegex(summary.errors[0], r"^terms baseline missing: https://example\.com/terms")
        entry = cache["entries"][TERMS_URL]
        self.assertNotIn("terms_sha256", entry)
        self.assertEqual("2026-09-05", entry["terms_baseline_missing"])

    def test_a_cache_without_a_previous_run_reports_every_missing_baseline(self) -> None:
        summary = self.check_terms(cache_of({}, updated_at=None))
        self.assertEqual(0, summary.terms_bootstrapped)
        self.assertRegex(summary.errors[0], "terms baseline missing")

    def test_missing_baseline_stays_reported_while_the_entry_is_fresh(self) -> None:
        cache = cache_of({}, updated_at=None)
        self.check_terms(cache, now=datetime(2026, 9, 5, 12, tzinfo=UTC))

        def unexpected_fetch(_target: object, _cached: object) -> check_evidence_links.FetchResult:
            raise AssertionError("a fresh entry should be served from the cache")

        again = self.check_terms(
            cache,
            now=datetime(2026, 9, 5, 13, tzinfo=UTC),
            max_age=timedelta(hours=20),
            fetch=unexpected_fetch,
        )
        self.assertEqual(1, again.cached)
        self.assertRegex(again.errors[0], "terms baseline missing")

    def test_establish_baselines_records_them_with_a_warning(self) -> None:
        cache = cache_of({}, updated_at=None)
        self.check_terms(cache)
        summary = self.check_terms(cache, establish_baselines=True)
        self.assertEqual([], summary.errors)
        self.assertEqual(1, summary.terms_bootstrapped)
        self.assertRegex(summary.warnings[0], r"^terms baseline established by request: https://example\.com/terms")
        entry = cache["entries"][TERMS_URL]
        self.assertIn("terms_sha256", entry)
        self.assertNotIn("terms_baseline_missing", entry)

    def test_import_keeps_urls_found_in_only_one_cache(self) -> None:
        shared = cache_of({}, updated_at=None)
        report = check_evidence_links.merge_caches(
            shared,
            [cache_of({TERMS_URL: terms_entry("a", {"systems:example:license:0": "2026-09-01"})})],
            today="2026-09-15",
        )
        self.assertEqual("a" * 64, shared["entries"][TERMS_URL]["terms_sha256"])
        self.assertEqual((1, 1), (report.sources, report.added))
        self.assertEqual("2026-09-10T00:00:00Z", shared["updated_at"])

    def test_import_of_agreeing_baselines_keeps_the_latest_check_and_open_drift(self) -> None:
        reviewed = {"systems:example:license:0": "2026-09-01"}
        drifted = terms_entry("a", reviewed, checked="2026-09-05T00:00:00Z", drift="2026-09-05", observed="b")
        later = terms_entry("a", reviewed, checked="2026-09-09T00:00:00Z")
        shared = cache_of({TERMS_URL: drifted})
        report = check_evidence_links.merge_caches(shared, [cache_of({TERMS_URL: later})], today="2026-09-15")
        entry = shared["entries"][TERMS_URL]
        self.assertEqual("2026-09-09T00:00:00Z", entry["checked_at"])
        self.assertEqual("2026-09-05", entry["terms_drift_detected_at"])
        self.assertEqual("b" * 64, entry["observed_terms_sha256"])
        self.assertEqual(1, report.agreed)

    def test_import_prefers_the_entry_accepted_after_a_strictly_newer_review(self) -> None:
        older = terms_entry(
            "a",
            {"inference-services:deepinfra:terms:0": "2026-09-12"},
            checked="2026-09-12T00:00:00Z",
            drift="2026-09-12",
            observed="b",
        )
        newer = terms_entry(
            "b",
            {
                "inference-services:deepinfra:terms:0": "2026-09-13",
                "inference-services:deepinfra:trust:vulnerability_disclosure": "2026-09-13",
            },
            checked="2026-09-11T00:00:00Z",
        )
        for first, second in ((older, newer), (newer, older)):
            shared = cache_of({TERMS_URL: dict(first)})
            report = check_evidence_links.merge_caches(shared, [cache_of({TERMS_URL: dict(second)})], today="2026-09-15")
            entry = shared["entries"][TERMS_URL]
            self.assertEqual("b" * 64, entry["terms_sha256"])
            self.assertNotIn("terms_drift_detected_at", entry)
            self.assertEqual(1, report.newer_review)

    def test_import_opens_drift_when_baselines_disagree_without_a_newer_review(self) -> None:
        reviewed = {"systems:example:license:0": "2026-09-12"}
        first = terms_entry("a", reviewed, checked="2026-09-12T00:00:00Z")
        second = terms_entry("b", reviewed, checked="2026-09-14T00:00:00Z")
        shared = cache_of({TERMS_URL: first})
        report = check_evidence_links.merge_caches(shared, [cache_of({TERMS_URL: second})], today="2026-09-15")
        entry = shared["entries"][TERMS_URL]
        self.assertEqual("b" * 64, entry["terms_sha256"])
        self.assertEqual("a" * 64, entry["observed_terms_sha256"])
        self.assertEqual("2026-09-15", entry["terms_drift_detected_at"])
        self.assertEqual([TERMS_URL], report.conflict_urls)

        # The opened drift holds until a newer human review, like any other drift.
        summary = self.check_terms(shared, reviewed_at="2026-09-12", now=datetime(2026, 9, 15, tzinfo=UTC))
        self.assertRegex(summary.errors[0], "terms drift requires review")

    def test_import_cli_merges_into_the_cache_and_leaves_sources_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            cache_path = root / "shared" / "evidence-link-cache.json"
            source = root / "old" / ".evidence-link-cache.json"
            source.parent.mkdir()
            source.write_text(
                json.dumps(
                    cache_of(
                        {TERMS_URL: terms_entry("a", {"systems:example:license:0": "2026-09-01"})},
                        updated_at="2026-09-12T16:00:00Z",
                    )
                ),
                encoding="utf-8",
            )
            before = source.read_bytes()
            with mock.patch("builtins.print") as printed:
                code = check_evidence_links.main(["--cache", str(cache_path), "--import-cache", str(source)])
            self.assertEqual(0, code)
            self.assertEqual(before, source.read_bytes())
            merged = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual("a" * 64, merged["entries"][TERMS_URL]["terms_sha256"])
            self.assertEqual("2026-09-12T16:00:00Z", merged["updated_at"])
            self.assertIn("1 URLs added", " ".join(str(call.args[0]) for call in printed.call_args_list))

    def test_import_cli_rejects_a_missing_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "evidence-link-cache.json"
            with mock.patch("builtins.print"):
                code = check_evidence_links.main(
                    ["--cache", str(cache_path), "--import-cache", str(Path(temp_dir) / "missing.json")]
                )
            self.assertEqual(2, code)
            self.assertFalse(cache_path.exists())


ANCHORED_URL = "https://example.com/terms#license"
ANCHORED_PAGE = (
    b"<html><body><nav>Menu</nav><h1>Docs</h1><p>Intro.</p>"
    b"<h2 id='license'>License</h2><p>Use is governed by the terms.</p>"
    b"<h3>Details</h3><p>Sub detail.</p>"
    b"<h2>Next steps</h2><p>Other.</p></body></html>"
)
ANCHORED_SECTION = "License Use is governed by the terms. Details Sub detail."


def anchored_target(*, reviewed_at: str = "2026-09-01") -> check_evidence_links.LinkTarget:
    reference = "systems:example:license:0"
    return check_evidence_links.LinkTarget(
        url=ANCHORED_URL,
        kinds=("terms",),
        references=(reference,),
        review_dates=((reference, reviewed_at),),
        monitor_terms=True,
    )


class TermsTextTests(unittest.TestCase):
    """Drift reports show what changed, and anchored URLs hash their section."""

    def run_check(
        self,
        cache: dict[str, object],
        link: check_evidence_links.LinkTarget,
        body: bytes,
        *,
        now: datetime = datetime(2026, 9, 5, tzinfo=UTC),
    ) -> check_evidence_links.CheckSummary:
        return check_evidence_links.check_targets(
            [link], cache, lambda _target, _cached: response(body), now=now, max_age=timedelta(0)
        )

    def test_section_of_a_heading_runs_to_the_next_same_or_higher_heading(self) -> None:
        self.assertEqual(
            ANCHORED_SECTION,
            check_evidence_links.section_text(ANCHORED_PAGE.decode(), "license"),
        )

    def test_section_of_a_container_is_its_subtree_without_scripts(self) -> None:
        html = (
            "<div id='terms'><p>Terms apply.</p><script>track()</script>"
            "<div>Nested clause.</div></div><p>After.</p>"
        )
        self.assertEqual("Terms apply. Nested clause.", check_evidence_links.section_text(html, "terms"))

    def test_missing_section_id_is_none(self) -> None:
        self.assertIsNone(check_evidence_links.section_text("<p>Terms.</p>", "license"))

    def test_anchored_url_hashes_its_section_and_stores_the_text(self) -> None:
        cache = cache_of({}, updated_at="2026-08-31T00:00:00Z")
        summary = self.run_check(cache, anchored_target(), ANCHORED_PAGE)
        self.assertEqual([], summary.errors)
        entry = cache["entries"][ANCHORED_URL]
        self.assertEqual("section", entry["terms_hash_scope"])
        self.assertEqual(ANCHORED_SECTION, entry["terms_text"])
        self.assertEqual(hashlib.sha256(ANCHORED_SECTION.encode()).hexdigest(), entry["terms_sha256"])

    def test_missing_anchor_warns_and_hashes_the_whole_page(self) -> None:
        cache = cache_of({}, updated_at="2026-08-31T00:00:00Z")
        body = b"<html><body><p>Terms without the anchor.</p></body></html>"
        summary = self.run_check(cache, anchored_target(), body)
        self.assertRegex(summary.warnings[0], r"^terms anchor not found: https://example\.com/terms#license")
        entry = cache["entries"][ANCHORED_URL]
        self.assertEqual("page", entry["terms_hash_scope"])
        self.assertEqual(check_evidence_links.content_sha256(body, "text/html"), entry["terms_sha256"])

    def test_drift_stores_both_texts_shows_a_diff_and_acceptance_moves_the_text(self) -> None:
        cache = cache_of({}, updated_at="2026-08-31T00:00:00Z")
        self.run_check(cache, target(terms=True), b"<html><main>Terms A. Shared clause.</main></html>")
        self.assertEqual("Terms A. Shared clause.", cache["entries"][TERMS_URL]["terms_text"])

        drifted = self.run_check(
            cache, target(terms=True), b"<html><main>Terms B. Shared clause.</main></html>",
            now=datetime(2026, 9, 6, tzinfo=UTC),
        )
        self.assertRegex(drifted.errors[0], "terms drift requires review")
        entry = cache["entries"][TERMS_URL]
        self.assertEqual("Terms B. Shared clause.", entry["observed_terms_text"])
        self.assertEqual(["  - Terms A.", "  + Terms B."], drifted.drift_details[TERMS_URL])

        accepted = self.run_check(
            cache, target(reviewed_at="2026-09-07", terms=True),
            b"<html><main>Terms B. Shared clause.</main></html>",
            now=datetime(2026, 9, 7, tzinfo=UTC),
        )
        self.assertEqual([], accepted.errors)
        entry = cache["entries"][TERMS_URL]
        self.assertEqual("Terms B. Shared clause.", entry["terms_text"])
        self.assertNotIn("observed_terms_text", entry)

    def test_legacy_entry_gains_text_when_its_hash_is_unchanged(self) -> None:
        body = b"<html><main>Terms A.</main></html>"
        cache = cache_of({
            TERMS_URL: {
                "checked_at": "2026-09-01T00:00:00Z",
                "terms_sha256": check_evidence_links.content_sha256(body, "text/html"),
                "terms_reviewed_at": {"systems:example:license:0": "2026-09-01"},
            }
        })
        summary = self.run_check(cache, target(terms=True), body)
        self.assertEqual([], summary.errors)
        entry = cache["entries"][TERMS_URL]
        self.assertEqual("Terms A.", entry["terms_text"])
        self.assertEqual("page", entry["terms_hash_scope"])

    def test_legacy_drift_says_no_baseline_text_was_stored(self) -> None:
        cache = cache_of({TERMS_URL: terms_entry("a", {"systems:example:license:0": "2026-09-01"})})
        # Checked on 2026-09-10, so the run must come later for the entry to be refetched.
        summary = self.run_check(
            cache, target(terms=True), b"<html><main>Terms A.</main></html>",
            now=datetime(2026, 9, 15, tzinfo=UTC),
        )
        self.assertRegex(summary.errors[0], "terms drift requires review")
        self.assertRegex(" ".join(summary.drift_details[TERMS_URL]), "no baseline text stored")

    def test_anchored_legacy_baseline_moves_to_the_section_when_the_page_is_unchanged(self) -> None:
        cache = cache_of({
            ANCHORED_URL: {
                "checked_at": "2026-09-01T00:00:00Z",
                "terms_sha256": check_evidence_links.content_sha256(ANCHORED_PAGE, "text/html"),
                "terms_reviewed_at": {"systems:example:license:0": "2026-09-01"},
            }
        })
        summary = self.run_check(cache, anchored_target(), ANCHORED_PAGE)
        self.assertEqual([], summary.errors)
        self.assertEqual(0, summary.terms_accepted)
        entry = cache["entries"][ANCHORED_URL]
        self.assertEqual("section", entry["terms_hash_scope"])
        self.assertEqual(hashlib.sha256(ANCHORED_SECTION.encode()).hexdigest(), entry["terms_sha256"])
        self.assertEqual(ANCHORED_SECTION, entry["terms_text"])

    def test_anchored_legacy_baseline_stays_drift_when_the_page_changed(self) -> None:
        older_page = ANCHORED_PAGE.replace(b"Intro.", b"Older intro.")
        cache = cache_of({
            ANCHORED_URL: {
                "checked_at": "2026-09-01T00:00:00Z",
                "terms_sha256": check_evidence_links.content_sha256(older_page, "text/html"),
                "terms_reviewed_at": {"systems:example:license:0": "2026-09-01"},
            }
        })
        summary = self.run_check(cache, anchored_target(), ANCHORED_PAGE)
        self.assertRegex(summary.errors[0], "terms drift requires review")
        entry = cache["entries"][ANCHORED_URL]
        self.assertEqual("section", entry["observed_terms_hash_scope"])
        self.assertNotIn("terms_hash_scope", {key for key, value in entry.items() if value == "section"})
        self.assertRegex(" ".join(summary.drift_details[ANCHORED_URL]), "whole page")

    def test_drift_diff_is_bounded_and_clipped(self) -> None:
        before = " ".join(f"Clause {index}." for index in range(30))
        after = " ".join(f"Clause {index} changed." for index in range(30))
        lines = check_evidence_links.drift_diff(before, after)
        self.assertEqual(13, len(lines))
        self.assertRegex(lines[-1], "48 more changed segments")
        long_line = check_evidence_links.drift_diff("Short.", "X" * 500)[-1]
        self.assertTrue(long_line.startswith("  + "))
        self.assertLessEqual(len(long_line), 4 + 240)

    def test_show_drift_prints_stored_diffs_without_fetching(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "evidence-link-cache.json"
            entry = terms_entry("a", {"systems:example:license:0": "2026-09-01"}, drift="2026-09-06", observed="b")
            entry["terms_text"] = "Terms A. Shared clause."
            entry["observed_terms_text"] = "Terms B. Shared clause."
            check_evidence_links.write_cache(cache_path, cache_of({TERMS_URL: entry}))
            with (
                mock.patch("scripts.check_evidence_links.fetch_target", side_effect=AssertionError("fetched")),
                mock.patch("builtins.print") as printed,
            ):
                code = check_evidence_links.main(["--cache", str(cache_path), "--show-drift"])
            output = "\n".join(str(call.args[0]) for call in printed.call_args_list)
            self.assertEqual(0, code)
            self.assertIn("terms drift since 2026-09-06: https://example.com/terms", output)
            self.assertIn("  - Terms A.", output)
            self.assertIn("  + Terms B.", output)


if __name__ == "__main__":
    unittest.main()
