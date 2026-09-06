from __future__ import annotations

import json
import tempfile
import unittest
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
            }
            for filename, document in documents.items():
                (directory / filename).write_text(json.dumps(document), encoding="utf-8")

            targets = check_evidence_links.collect_targets(directory)

        by_url = {item.url: item for item in targets}
        self.assertEqual(7, len(targets))
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

    def test_terms_drift_stays_open_until_a_newer_human_review(self) -> None:
        cache = {"version": "1.0", "updated_at": None, "entries": {}}
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


if __name__ == "__main__":
    unittest.main()
