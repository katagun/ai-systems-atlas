from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import socket
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar
from unittest import mock

from scripts import build_candidate_evidence as harness
from scripts import routine_guards
from scripts import run_candidate_triage as runner


def candidate(repo: str, discovered_at: str = "2026-09-01", **extra) -> dict:
    return {"repo": repo, "url": f"https://github.com/{repo}", "discovered_at": discovered_at, **extra}


class SelectionTests(unittest.TestCase):
    def test_selection_skips_candidates_that_already_carry_a_triage_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "held"}), candidate("b/two")]
        self.assertEqual(["b/two"], [item["repo"] for item in harness.select_candidates(queue, 10)])

    def test_selection_takes_the_oldest_first(self) -> None:
        queue = [candidate("a/new", "2026-09-03"), candidate("b/old", "2026-08-25")]
        self.assertEqual(["b/old"], [item["repo"] for item in harness.select_candidates(queue, 1)])

    def test_selection_skips_a_candidate_with_no_repository(self) -> None:
        queue = [{"url": "https://example.com/x", "discovered_at": "2026-08-01"}, candidate("b/two")]
        self.assertEqual(["b/two"], [item["repo"] for item in harness.select_candidates(queue, 10)])

    def test_a_repo_less_candidate_never_consumes_a_limit_slot(self) -> None:
        queue = [{"url": "https://example.com/x", "discovered_at": "2026-08-01"}, candidate("b/two")]
        self.assertEqual(["b/two"], [item["repo"] for item in harness.select_candidates(queue, 1)])

    def test_untriageable_candidates_are_reported_so_they_stay_visible(self) -> None:
        queue = [
            {"url": "https://example.com/x", "discovered_at": "2026-08-01"},
            candidate("b/two"),
            {"url": "https://example.com/y", "discovered_at": "2026-08-02",
             "triage": {"verdict": "held"}},
        ]
        unreachable = harness.untriageable_candidates(queue)
        self.assertEqual(["https://example.com/x"], [item["url"] for item in unreachable])

    def test_carry_forward_restores_prior_work_by_repo(self) -> None:
        queue = [candidate("a/one")]
        previous = [candidate("A/One", triage={"verdict": "held", "held_by": "x"})]
        self.assertEqual(1, harness.carry_forward(queue, previous))
        self.assertEqual("held", queue[0]["triage"]["verdict"])

    def test_carry_forward_never_overwrites_an_existing_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "review_ready"})]
        previous = [candidate("a/one", triage={"verdict": "out_of_scope"})]
        self.assertEqual(0, harness.carry_forward(queue, previous))
        self.assertEqual("review_ready", queue[0]["triage"]["verdict"])

    def test_carry_forward_does_not_collapse_two_keyless_candidates_onto_each_other(self) -> None:
        queue = [{"discovered_at": "2026-09-01"}]
        previous = [{"discovered_at": "2026-08-01", "triage": {"verdict": "held", "held_by": "x"}}]
        self.assertEqual(0, harness.carry_forward(queue, previous))
        self.assertNotIn("triage", queue[0])


class CrossCheckTests(unittest.TestCase):
    def test_a_repo_already_excluded_is_reported(self) -> None:
        catalog = {"exclusions.json": [{"repo": "A/One"}], "projects.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("exclusions.json" in hit for hit in hits), hits)

    def test_a_repo_already_published_is_reported(self) -> None:
        catalog = {"projects.json": [{"repo": "a/one", "id": "one"}], "exclusions.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("projects.json" in hit for hit in hits), hits)

    def test_a_clean_candidate_reports_nothing(self) -> None:
        catalog = {"projects.json": [{"repo": "b/two", "id": "two"}], "exclusions.json": []}
        self.assertEqual([], harness.cross_collection_hits(candidate("a/one"), catalog))


class ClassSignalTests(unittest.TestCase):
    def test_an_awesome_list_is_flagged(self) -> None:
        item = candidate("aristoapp/awesome-second-brain", name="awesome-second-brain",
                         description="A curated list of tools.", topics=[])
        self.assertIn("awesome list", harness.class_signals(item))

    def test_a_benchmark_topic_is_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An evaluation suite.", topics=["benchmark"])
        self.assertIn("benchmark", harness.class_signals(item))

    def test_an_ordinary_candidate_is_not_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An agent runtime.", topics=["agents"])
        self.assertEqual([], harness.class_signals(item))


class FetchTests(unittest.TestCase):
    def responses(self, license_payload=None, readme_payload=None):
        def getter(path: str, _token):
            if path.endswith("/license"):
                if license_payload is None:
                    raise KeyError("no license")
                return license_payload
            if path.endswith("/readme"):
                return readme_payload or {}
            return {"full_name": "a/one", "description": "d", "topics": [], "archived": False}
        return getter

    def test_license_evidence_pins_the_blob_sha_the_api_returns(self) -> None:
        payload = {
            "sha": "0" * 40,
            "path": "LICENSE",
            "html_url": "https://github.com/a/one/blob/main/LICENSE",
            "content": base64.b64encode(b"MIT").decode(),
            "encoding": "base64",
        }
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(payload), None, "2026-09-04")
        licence = next(d for d in bundle["documents"] if d["label"] == "LICENSE")
        self.assertEqual("git_blob", licence["kind"])
        self.assertEqual("0" * 40, licence["blob_sha"])
        self.assertEqual(
            "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40, licence["immutable_url"])
        self.assertEqual(harness.content_hash("MIT"), licence["content_sha256"])

    def test_a_missing_license_is_recorded_as_an_error_not_a_crash(self) -> None:
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(None), None, "2026-09-04")
        self.assertTrue(bundle["errors"])
        self.assertFalse([d for d in bundle["documents"] if d["label"] == "LICENSE"])

    def test_a_github_document_without_a_blob_sha_is_never_downgraded_to_web(self) -> None:
        payload = {
            "html_url": "https://github.com/a/one/blob/main/README.md",
            "content": base64.b64encode(b"read me").decode(),
            "encoding": "base64",
        }
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(payload, payload), None, "2026-09-04"
        )
        self.assertEqual([], bundle["documents"])
        self.assertEqual(2, len(bundle["errors"]))
        self.assertTrue(all("blob SHA" in problem for problem in bundle["errors"]))

    def test_content_hash_is_stable(self) -> None:
        self.assertEqual(harness.content_hash("MIT"), harness.content_hash("MIT"))
        self.assertEqual(64, len(harness.content_hash("MIT")))


class RecheckTests(unittest.TestCase):
    def triaged(self, content_sha256: str) -> list[dict]:
        return [candidate("a/one", triage={
            "verdict": "review_ready",
            "rule": "r",
            "finding": "f",
            "evidence": [{
                "label": "LICENSE",
                "url": "https://github.com/a/one/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40,
                "content_sha256": content_sha256,
                "fetched_at": "2026-09-04",
            }],
            "proposed_at": "2026-09-04",
            "proposer": "candidate-triage",
        })]

    def getter(self, path: str, _token):
        return {"sha": "0" * 40, "encoding": "base64",
                "content": base64.b64encode(b"MIT").decode(),
                "html_url": "https://github.com/a/one/blob/main/LICENSE"}

    def test_a_block_identical_to_the_baseline_is_not_refetched(self) -> None:
        """An accepted block describes a document as it stood when a human accepted it."""
        queue = self.triaged(harness.content_hash("MIT"))
        baseline = json.loads(json.dumps(queue))

        def refuse(_path, _token):
            self.fail("a block unchanged since origin/main must not be re-fetched")

        self.assertEqual([], harness.recheck_candidates(queue, refuse, None, baseline))

    def test_a_block_absent_from_the_baseline_is_refetched(self) -> None:
        queue = self.triaged("a" * 64)
        baseline = [candidate("a/one")]
        problems = harness.recheck_candidates(queue, self.getter, None, baseline)
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_a_back_dated_block_is_still_refetched(self) -> None:
        """proposed_at is written by the agent, so it can never decide what gets verified."""
        queue = self.triaged("a" * 64)
        queue[0]["triage"]["proposed_at"] = "2020-01-01"
        baseline = [candidate("a/one")]
        problems = harness.recheck_candidates(queue, self.getter, None, baseline)
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_an_edited_block_is_refetched_even_though_the_candidate_had_one(self) -> None:
        queue = self.triaged("a" * 64)
        baseline = json.loads(json.dumps(queue))
        baseline[0]["triage"]["evidence"][0]["content_sha256"] = "b" * 64
        problems = harness.recheck_candidates(queue, self.getter, None, baseline)
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_matching_evidence_rechecks_clean(self) -> None:
        self.assertEqual([], harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), self.getter, None, "2026-09-04"))

    def test_a_wrong_content_hash_is_reported(self) -> None:
        problems = harness.recheck_candidates(
            self.triaged("a" * 64), self.getter, None, "2026-09-04")
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_an_unreachable_citation_is_reported(self) -> None:
        def failing(_path, _token):
            raise OSError("404")
        problems = harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), failing, None, "2026-09-04")
        self.assertTrue(any("could not be re-fetched" in problem for problem in problems), problems)

    def test_an_unknown_evidence_label_is_reported_not_guessed(self) -> None:
        queue = self.triaged(harness.content_hash("MIT"))
        queue[0]["triage"]["evidence"][0]["label"] = "CONTRIBUTING"

        def unexpected(_path, _token):
            self.fail("an unknown label must never be turned into a fetch")

        problems = harness.recheck_candidates(queue, unexpected, None, "2026-09-04")
        self.assertTrue(any("unknown evidence label" in problem for problem in problems), problems)

    def test_an_unknown_evidence_kind_is_rejected_before_any_fetch(self) -> None:
        queue = self.triaged(harness.content_hash("MIT"))
        queue[0]["triage"]["evidence"][0]["kind"] = "file"
        getter = mock.Mock()
        problems = harness.recheck_candidates(queue, getter, None, [])
        getter.assert_not_called()
        self.assertTrue(any("unknown evidence kind" in problem for problem in problems), problems)

    def test_unattended_duplicate_evidence_is_rejected_before_any_fetch(self) -> None:
        queue = self.triaged(harness.content_hash("MIT"))
        item = queue[0]["triage"]["evidence"][0]
        queue[0]["triage"]["evidence"] = [item, dict(item), dict(item)]
        getter = mock.Mock()
        problems = harness.recheck_candidates(
            queue, getter, None, [], unattended=True
        )
        getter.assert_not_called()
        self.assertTrue(any("one or two" in problem for problem in problems), problems)
        self.assertTrue(any("duplicate LICENSE" in problem for problem in problems), problems)

    def test_unattended_preflights_every_candidate_before_any_fetch(self) -> None:
        first = self.triaged(harness.content_hash("MIT"))[0]
        second = json.loads(json.dumps(first))
        second["repo"] = "b/two"
        item = second["triage"]["evidence"][0]
        second["triage"]["evidence"] = [item, dict(item)]
        getter = mock.Mock()

        problems = harness.recheck_candidates(
            [first, second], getter, None, [], unattended=True
        )

        getter.assert_not_called()
        self.assertTrue(any("duplicate LICENSE" in problem for problem in problems), problems)

    def test_a_fabricated_url_is_reported_even_when_the_hash_matches(self) -> None:
        """A hash proves a document reads this way, never that the citation points at it."""
        queue = self.triaged(harness.content_hash("MIT"))
        queue[0]["triage"]["evidence"][0]["url"] = "https://example.com/invented"
        problems = harness.recheck_candidates(queue, self.getter, None, "2026-09-04")
        self.assertTrue(any("invented" in problem for problem in problems), problems)
        self.assertFalse(any("content_sha256" in problem for problem in problems), problems)

    def test_a_non_list_evidence_is_reported_not_raised(self) -> None:
        queue = self.triaged(harness.content_hash("MIT"))
        queue[0]["triage"]["evidence"] = "not-a-list"
        problems = harness.recheck_candidates(queue, self.getter, None, "2026-09-04")
        self.assertTrue(any("evidence must be a list" in problem for problem in problems), problems)


def candidate_with(evidence: list[dict]) -> dict:
    return {
        "repo": None,
        "url": "https://example.invalid/product",
        "triage": {"verdict": "held", "held_by": "robotics scope decision", "evidence": evidence},
    }


class WebCitationRecheckTests(unittest.TestCase):
    def test_a_web_citation_that_still_matches_reports_no_problem(self) -> None:
        body = "terms of service, version 3"
        item = {
            "label": "Product terms",
            "url": "https://example.invalid/terms",
            "kind": "web",
            "content_sha256": harness.content_hash(body),
            "fetched_at": "2026-09-04",
        }
        with mock.patch("scripts.build_candidate_evidence.fetch_web_text", return_value=body):
            problems = harness.recheck_candidates([candidate_with([item])], lambda *a, **k: {}, None, [])
        self.assertEqual([], problems)

    def test_a_web_citation_that_drifted_is_reported(self) -> None:
        item = {
            "label": "Product terms",
            "url": "https://example.invalid/terms",
            "kind": "web",
            "content_sha256": harness.content_hash("original"),
            "fetched_at": "2026-09-04",
        }
        with mock.patch("scripts.build_candidate_evidence.fetch_web_text", return_value="rewritten"):
            problems = harness.recheck_candidates([candidate_with([item])], lambda *a, **k: {}, None, [])
        self.assertEqual(1, len(problems), problems)
        self.assertIn("Product terms", problems[0])

    def test_unattended_triage_rejects_web_evidence_before_fetching(self) -> None:
        item = {
            "label": "Product terms",
            "url": "https://example.invalid/terms",
            "kind": "web",
            "content_sha256": harness.content_hash("original"),
            "fetched_at": "2026-09-04",
        }
        record = candidate("a/one", triage={
            "verdict": "held",
            "held_by": "a decision",
            "proposer": "candidate-triage",
            "evidence": [item],
        })
        with mock.patch("scripts.build_candidate_evidence.fetch_web_text") as fetch:
            problems = harness.recheck_candidates(
                [record], lambda *a, **k: {}, None, [], unattended=True
            )
        fetch.assert_not_called()
        self.assertTrue(any("only GitHub blob" in problem for problem in problems), problems)

    def test_unattended_triage_requires_the_routine_proposer_before_fetching(self) -> None:
        record = candidate("a/one", triage={
            "verdict": "review_ready",
            "proposer": "something else",
            "evidence": [{"kind": "git_blob", "label": "README"}],
        })
        getter = mock.Mock()
        problems = harness.recheck_candidates(
            [record], getter, None, [], unattended=True
        )
        getter.assert_not_called()
        self.assertTrue(any("requires proposer" in problem for problem in problems), problems)


def public_resolver(host: str, port: int, **_kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", port))]


class FakeWebResponse:
    def __init__(self, status: int, url: str, body: bytes = b"", headers=None) -> None:
        self.status = status
        self.url = url
        self.body = body
        self.headers = headers or {}
        self.read_amounts: list[int | None] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def getcode(self) -> int:
        return self.status

    def geturl(self) -> str:
        return self.url

    def read(self, amount: int | None = None) -> bytes:
        self.read_amounts.append(amount)
        return self.body if amount is None else self.body[:amount]


class FakeWebOpener:
    def __init__(self, *responses: FakeWebResponse) -> None:
        self.responses = list(responses)
        self.urls: list[str] = []

    def open(self, request, timeout: int):
        self.urls.append(request.full_url)
        if timeout != 30:
            raise AssertionError(f"unexpected timeout {timeout}")
        return self.responses.pop(0)


class WebFetchBoundaryTests(unittest.TestCase):
    def test_the_default_fetch_pins_the_validated_address(self) -> None:
        response = FakeWebResponse(200, "https://example.com/terms", body=b"terms")
        pinned_open = mock.Mock(return_value=response)
        self.assertEqual(
            "terms",
            harness.fetch_web_text(
                "https://example.com/terms",
                resolver=public_resolver,
                pinned_open=pinned_open,
            ),
        )
        pinned_open.assert_called_once_with(
            "https://example.com/terms",
            "example.com",
            ("93.184.216.34",),
            timeout=30,
        )

    def test_the_pinned_connection_uses_the_ip_but_keeps_tls_hostname_verification(self) -> None:
        context = mock.Mock()
        wrapped = mock.Mock()
        context.wrap_socket.return_value = wrapped
        connection = harness._PinnedHTTPSConnection(
            "example.com", "93.184.216.34", port=443, timeout=30, context=context
        )
        raw_socket = mock.Mock()
        connection._create_connection = mock.Mock(return_value=raw_socket)

        connection.connect()

        connection._create_connection.assert_called_once_with(
            ("93.184.216.34", 443), 30, None
        )
        context.wrap_socket.assert_called_once_with(
            raw_socket, server_hostname="example.com"
        )
        self.assertIs(wrapped, connection.sock)

    def test_non_https_credentials_ports_and_non_dns_hosts_fail_before_open(self) -> None:
        unsafe = (
            "http://example.com/terms",
            "file:///etc/hosts",
            "data:text/plain,hello",
            "ftp://example.com/terms",
            "https://user:password@example.com/terms",
            "https://example.com:444/terms",
            "https://localhost/terms",
            "https://127.0.0.1/terms",
            "https://example.com/\x01terms",
        )
        opener = mock.Mock()
        for url in unsafe:
            with self.subTest(url=url), self.assertRaises(ValueError):
                harness.fetch_web_text(url, resolver=public_resolver, opener=opener)
        opener.open.assert_not_called()

    def test_a_host_resolving_to_any_non_public_address_fails_before_open(self) -> None:
        def mixed_resolver(_host: str, port: int, **_kwargs):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port)),
            ]

        opener = mock.Mock()
        with self.assertRaisesRegex(ValueError, "non-public"):
            harness.fetch_web_text(
                "https://example.com/terms", resolver=mixed_resolver, opener=opener
            )
        opener.open.assert_not_called()

    def test_non_unicast_and_site_local_addresses_fail_before_open(self) -> None:
        for family, address in (
            (socket.AF_INET, "224.0.0.1"),
            (socket.AF_INET6, "ff02::1"),
            (socket.AF_INET6, "fec0::1"),
        ):
            with self.subTest(address=address):
                def resolver(
                    _host, port, *, _family=family, _address=address, **_kwargs
                ):
                    return [
                        (_family, socket.SOCK_STREAM, 6, "", (_address, port))
                    ]

                pinned_open = mock.Mock()
                with self.assertRaisesRegex(ValueError, "non-public-unicast"):
                    harness.fetch_web_text(
                        "https://example.com/terms",
                        resolver=resolver,
                        pinned_open=pinned_open,
                    )
                pinned_open.assert_not_called()

    def test_too_many_resolved_addresses_fail_before_open(self) -> None:
        def resolver(_host: str, port: int, **_kwargs):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", (f"8.8.8.{index}", port))
                for index in range(1, harness.MAX_WEB_ADDRESSES + 2)
            ]

        pinned_open = mock.Mock()
        with self.assertRaisesRegex(ValueError, "more than"):
            harness.fetch_web_text(
                "https://example.com/terms",
                resolver=resolver,
                pinned_open=pinned_open,
            )
        pinned_open.assert_not_called()

    def test_a_cross_host_redirect_is_rejected_without_reading_its_body(self) -> None:
        redirect = FakeWebResponse(
            302,
            "https://example.com/terms",
            body=b"must not be consumed",
            headers={"Location": "https://other.example/terms"},
        )
        opener = FakeWebOpener(redirect)
        with self.assertRaisesRegex(ValueError, "changed host"):
            harness.fetch_web_text(
                "https://example.com/terms", resolver=public_resolver, opener=opener
            )
        self.assertEqual([], redirect.read_amounts)
        self.assertEqual(["https://example.com/terms"], opener.urls)

    def test_a_same_host_redirect_is_followed_without_reading_redirect_body(self) -> None:
        redirect = FakeWebResponse(
            302,
            "https://example.com/old",
            body=b"must not be consumed",
            headers={"Location": "/current"},
        )
        final = FakeWebResponse(200, "https://example.com/current", body=b"current terms")
        opener = FakeWebOpener(redirect, final)
        text = harness.fetch_web_text(
            "https://example.com/old", resolver=public_resolver, opener=opener
        )
        self.assertEqual("current terms", text)
        self.assertEqual([], redirect.read_amounts)
        self.assertEqual([harness.MAX_WEB_EVIDENCE_BYTES + 1], final.read_amounts)

    def test_an_oversized_response_is_rejected_after_one_bounded_read(self) -> None:
        response = FakeWebResponse(
            200,
            "https://example.com/terms",
            body=b"x" * (harness.MAX_WEB_EVIDENCE_BYTES + 1),
        )
        with self.assertRaisesRegex(ValueError, "exceeds"):
            harness.fetch_web_text(
                "https://example.com/terms",
                resolver=public_resolver,
                opener=FakeWebOpener(response),
            )
        self.assertEqual([harness.MAX_WEB_EVIDENCE_BYTES + 1], response.read_amounts)

    def test_too_many_redirects_fail_without_reading_any_redirect_body(self) -> None:
        redirects = [
            FakeWebResponse(
                302,
                f"https://example.com/{index}",
                body=b"must not be consumed",
                headers={"Location": f"/{index + 1}"},
            )
            for index in range(harness.MAX_WEB_REDIRECTS + 1)
        ]
        with self.assertRaisesRegex(ValueError, "redirect limit"):
            harness.fetch_web_text(
                "https://example.com/0",
                resolver=public_resolver,
                opener=FakeWebOpener(*redirects),
            )
        self.assertTrue(all(not response.read_amounts for response in redirects))


class TokenTests(unittest.TestCase):
    """Unauthenticated GitHub allows 60 requests an hour; a default run issues 80."""

    def completed(self, returncode: int, stdout: str):
        return subprocess.CompletedProcess(["gh", "auth", "token"], returncode, stdout, "")

    def test_the_environment_token_wins_and_gh_is_never_run(self) -> None:
        def fail_if_called(*_args, **_kwargs):
            self.fail("gh must not run when GITHUB_TOKEN is set")

        with mock.patch.dict(os.environ, {"GITHUB_TOKEN": "from-the-environment"}):
            self.assertEqual("from-the-environment", harness.github_token(fail_if_called))

    def test_gh_auth_token_supplies_the_token_when_the_environment_has_none(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            token = harness.github_token(lambda *a, **k: self.completed(0, "gho_fromgh\n"))
        self.assertEqual("gho_fromgh", token)

    def test_a_missing_gh_is_tolerated(self) -> None:
        def missing(*_args, **_kwargs):
            raise FileNotFoundError("gh")

        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(harness.github_token(missing))

    def test_an_unauthenticated_gh_is_tolerated(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(harness.github_token(lambda *a, **k: self.completed(1, "")))

    def test_a_timeout_is_tolerated(self) -> None:
        def slow(*_args, **_kwargs):
            raise subprocess.TimeoutExpired(["gh"], 15)

        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(harness.github_token(slow))


class LoadCatalogTests(unittest.TestCase):
    def test_load_catalog_returns_the_right_list_per_collection(self) -> None:
        contents = {
            "projects.json": {"projects": [{"id": "p"}]},
            "exclusions.json": {"entries": [{"repo": "a/one"}]},
            "specifications.json": {"specifications": [{"id": "s"}]},
            "inference-services.json": {"services": [{"id": "i"}]},
            "local-runtimes.json": {"runtimes": [{"id": "r"}]},
        }
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for name, document in contents.items():
                (directory / name).write_text(json.dumps(document), encoding="utf-8")
            catalog = harness.load_catalog(directory)
        self.assertEqual([{"id": "p"}], catalog["projects.json"])
        self.assertEqual([{"repo": "a/one"}], catalog["exclusions.json"])
        self.assertEqual([{"id": "s"}], catalog["specifications.json"])
        self.assertEqual([{"id": "i"}], catalog["inference-services.json"])
        self.assertEqual([{"id": "r"}], catalog["local-runtimes.json"])


class PreviousCandidatesTests(unittest.TestCase):
    def test_a_nonexistent_branch_returns_no_candidates(self) -> None:
        self.assertEqual([], harness.previous_candidates("no-such-branch-xyz"))

    def test_an_empty_branch_name_returns_no_candidates_without_running_git(self) -> None:
        self.assertEqual([], harness.previous_candidates(""))


class MainTests(unittest.TestCase):
    def test_an_unreachable_github_fails_before_any_agent_work(self) -> None:
        def failing(_path, _token):
            raise OSError("network down")
        self.assertEqual(1, harness.run_build(
            candidates=[candidate("a/one")], catalog={}, getter=failing,
            token=None, today="2026-09-04", limit=5, bundle_path=None))

    def test_a_partial_fetch_still_succeeds_but_warns_on_stderr(self) -> None:
        def license_only(path: str, _token):
            if path.endswith("/license"):
                return {"sha": "0" * 40, "encoding": "base64",
                         "content": base64.b64encode(b"MIT").decode(),
                         "html_url": "https://github.com/a/one/blob/main/LICENSE"}
            raise OSError("readme unreachable")

        import contextlib
        import io

        captured = io.StringIO()
        with contextlib.redirect_stderr(captured):
            code = harness.run_build(
                candidates=[candidate("a/one")], catalog={}, getter=license_only,
                token=None, today="2026-09-04", limit=5, bundle_path=None)
        self.assertEqual(0, code)
        self.assertIn("a/one", captured.getvalue())
        self.assertIn("warning", captured.getvalue())


    def test_a_carried_forward_block_is_written_back_to_the_queue(self) -> None:
        block = {"verdict": "held", "held_by": "BACKLOG.md — skill packs"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidates.json"
            path.write_text(json.dumps({
                "version": 1, "updated_at": "2026-09-01", "candidates": [candidate("a/one")],
            }), encoding="utf-8")
            queue = json.loads(path.read_text(encoding="utf-8"))["candidates"]
            code = harness.run_build(
                candidates=queue, catalog={}, getter=self.fail_if_fetched,
                token=None, today="2026-09-04", limit=5, bundle_path=None,
                previous=[candidate("a/one", triage=block)], candidates_path=path)
            written = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(0, code)
        self.assertEqual(block, written["candidates"][0]["triage"])
        self.assertEqual(1, written["version"], "other document keys must survive the write")

    def test_nothing_is_written_back_when_no_block_is_carried(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidates.json"
            original = json.dumps({"version": 1, "candidates": [candidate("a/one")]})
            path.write_text(original, encoding="utf-8")
            queue = json.loads(original)["candidates"]
            harness.run_build(
                candidates=queue, catalog={}, getter=self.fail_if_fetched,
                token=None, today="2026-09-04", limit=0, bundle_path=None,
                previous=[], candidates_path=path)
            self.assertEqual(original, path.read_text(encoding="utf-8"))

    def test_run_build_reports_the_candidates_it_cannot_reach(self) -> None:
        import contextlib
        import io

        queue = [{"url": "https://example.com/x", "discovered_at": "2026-08-01"}]
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            code = harness.run_build(
                candidates=queue, catalog={}, getter=self.fail_if_fetched,
                token=None, today="2026-09-04", limit=5, bundle_path=None)
        self.assertEqual(0, code)
        self.assertIn("skipped 1 candidates with no GitHub repository", captured.getvalue())
        self.assertIn("https://example.com/x", captured.getvalue())

    def fail_if_fetched(self, _path, _token):
        self.fail("a candidate with a carried block or no repository must never be fetched")


class BlastRadiusTests(unittest.TestCase):
    def test_only_candidates_json_is_allowed_to_change(self) -> None:
        self.assertEqual([], runner.unexpected_changes(" M directory/candidates.json\n"))

    def test_an_edit_to_projects_json_is_reported(self) -> None:
        porcelain = " M directory/candidates.json\n M directory/projects.json\n"
        self.assertEqual(["directory/projects.json"], runner.unexpected_changes(porcelain))

    def test_an_untracked_file_is_reported(self) -> None:
        self.assertEqual(["scratch.txt"], runner.unexpected_changes("?? scratch.txt\n"))

    def test_an_empty_diff_is_clean(self) -> None:
        self.assertEqual([], runner.unexpected_changes(""))

    def test_a_rename_from_the_allowed_path_is_reported(self) -> None:
        porcelain = "R  directory/candidates.json -> scratch.txt\n"
        self.assertEqual(["scratch.txt"], runner.unexpected_changes(porcelain))

    def test_a_rename_into_the_allowed_path_is_reported(self) -> None:
        """A rename has two ends, and the forbidden one is the source here."""
        porcelain = "R  directory/projects.json -> directory/candidates.json\n"
        self.assertEqual(["directory/projects.json"], runner.unexpected_changes(porcelain))

    def test_a_rename_between_two_forbidden_paths_reports_both_ends(self) -> None:
        porcelain = "R  directory/projects.json -> directory/exclusions.json\n"
        self.assertEqual(
            ["directory/projects.json", "directory/exclusions.json"],
            runner.unexpected_changes(porcelain))

    def test_a_staged_and_modified_allowed_path_is_clean(self) -> None:
        self.assertEqual([], runner.unexpected_changes("MM directory/candidates.json\n"))

    def test_a_path_containing_spaces_is_reported(self) -> None:
        porcelain = " M directory/my file.json\n"
        self.assertEqual(["directory/my file.json"], runner.unexpected_changes(porcelain))


class FieldGuardTests(unittest.TestCase):
    """The automation boundary is a field boundary; only these two writes are the run's."""

    def queue(self, *candidates, **document) -> str:
        return json.dumps({"version": 1, "updated_at": "2026-09-01",
                           "candidates": list(candidates), **document})

    def record(self, **overrides) -> dict:
        return {
            "repo": "a/one", "url": "https://github.com/a/one", "name": "one",
            "proposed_system_family": "memory_system",
            "proposed_primary_role": "agent_memory_service",
            "classification_confidence": 0.8, "status": "provisional",
            **overrides,
        }

    BLOCK: ClassVar[dict] = {
        "verdict": "review_ready", "rule": "r", "finding": "f",
        "evidence": [{"label": "README"}], "proposed_at": "2026-09-04",
        "proposer": "candidate-triage"}
    HELD_BLOCK: ClassVar[dict] = {
        **BLOCK, "verdict": "held", "held_by": "BACKLOG.md — skill packs"}

    def test_adding_a_triage_block_is_accepted(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(triage=self.BLOCK))
        self.assertEqual([], runner.unexpected_field_changes(before, after))

    def test_nulling_family_and_role_is_accepted_when_the_new_block_is_held(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(
            triage=self.HELD_BLOCK, proposed_system_family=None, proposed_primary_role=None))
        self.assertEqual([], runner.unexpected_field_changes(before, after))

    def test_nulling_family_and_role_is_rejected_without_a_holding_decision(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(triage=self.BLOCK, proposed_system_family=None))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("proposed_system_family" in problem for problem in problems), problems)

    def test_a_changed_classification_confidence_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(triage=self.BLOCK, classification_confidence=0.99))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("classification_confidence" in problem for problem in problems), problems)
        self.assertTrue(any("a/one" in problem for problem in problems), problems)

    def test_a_rewritten_proposed_family_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(proposed_system_family="agent_system"))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("proposed_system_family" in problem for problem in problems), problems)

    def test_a_changed_status_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(status="published"))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("status" in problem for problem in problems), problems)

    def test_a_deleted_candidate_is_rejected(self) -> None:
        before = self.queue(self.record(), self.record(repo="b/two", url="https://github.com/b/two"))
        after = self.queue(self.record())
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("removed the candidate" in problem for problem in problems), problems)
        self.assertTrue(any("b/two" in problem for problem in problems), problems)

    def test_an_added_candidate_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(), self.record(repo="b/two", url="https://github.com/b/two"))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("added the candidate" in problem for problem in problems), problems)

    def test_overwriting_an_existing_triage_block_is_rejected(self) -> None:
        before = self.queue(self.record(triage=self.BLOCK))
        after = self.queue(self.record(triage={**self.BLOCK, "verdict": "out_of_scope"}))
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("triage" in problem for problem in problems), problems)

    def test_deleting_a_field_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(triage=self.BLOCK))
        after_document = json.loads(after)
        del after_document["candidates"][0]["classification_confidence"]
        problems = runner.unexpected_field_changes(before, json.dumps(after_document))
        self.assertTrue(any("classification_confidence" in problem for problem in problems), problems)

    def test_a_changed_document_field_is_rejected(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(), updated_at="2026-09-04")
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("updated_at" in problem for problem in problems), problems)

    def test_an_unparseable_queue_is_rejected_not_raised(self) -> None:
        problems = runner.unexpected_field_changes(self.queue(self.record()), "{oops")
        self.assertTrue(any("not valid JSON" in problem for problem in problems), problems)

    def test_a_candidate_with_no_key_is_rejected_rather_than_compared(self) -> None:
        before = self.queue(self.record())
        after = self.queue(self.record(), {"name": "keyless"})
        problems = runner.unexpected_field_changes(before, after)
        self.assertTrue(any("neither a repo nor a url" in problem for problem in problems), problems)


class FinishTests(unittest.TestCase):
    MAIN_QUEUE = json.dumps({
        "version": 1,
        "candidates": [{
            "repo": "a/one", "url": "https://github.com/a/one",
            "proposed_system_family": "memory_system",
            "proposed_primary_role": "agent_memory_service",
            "classification_confidence": 0.8, "status": "provisional",
        }],
    })
    BLOCK: ClassVar[dict] = {
        "verdict": "review_ready", "rule": "r", "finding": "f",
        "evidence": [{"label": "README"}], "proposed_at": "2026-09-04",
        "proposer": "candidate-triage"}

    def triaged(self, **overrides) -> str:
        document = json.loads(self.MAIN_QUEUE)
        document["candidates"][0]["triage"] = self.BLOCK
        document["candidates"][0].update(overrides)
        return json.dumps(document)

    def reader(self, text=None):
        return lambda _path: text if text is not None else self.triaged()

    def responder(self, calls, porcelain=" M directory/candidates.json\n",
                  head="1111", base="1111", fails=()):
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, porcelain
            if command[:2] == ["git", "rev-parse"]:
                return 0, (head if command[2] == "HEAD" else base) + "\n"
            if command[:2] == ["git", "show"]:
                return 0, self.MAIN_QUEUE
            for marker in fails:
                if any(marker in part for part in command):
                    return 1, f"{marker} failed"
            return 0, ""
        return fake_run

    def test_finish_refuses_when_a_forbidden_file_changed(self) -> None:
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, porcelain=" M directory/projects.json\n"),
            read=self.reader())
        self.assertEqual(1, code)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_finish_commits_when_every_check_passes(self) -> None:
        calls: list[list[str]] = []
        self.assertEqual(0, runner.finish(run=self.responder(calls), read=self.reader()))
        self.assertIn(["git", "commit"], [call[:2] for call in calls])

    def test_finish_validates_before_the_unattended_network_recheck(self) -> None:
        calls: list[list[str]] = []
        self.assertEqual(0, runner.finish(run=self.responder(calls), read=self.reader()))
        checks = [call for call in calls if call and call[0] == "uv"]
        self.assertTrue(any("validate_directory.py" in part for part in checks[0]))
        self.assertTrue(any("build_candidate_evidence.py" in part for part in checks[1]))
        self.assertIn("--unattended", checks[1])

    def test_finish_reports_no_proposals_when_the_run_left_nothing_behind(self) -> None:
        """Nothing to do means a clean tree AND a HEAD that never moved off origin/main."""
        calls: list[list[str]] = []
        code = runner.finish(run=self.responder(calls, porcelain=""), read=self.reader())
        self.assertEqual(0, code)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])
        self.assertNotIn(["git", "add"], [call[:2] for call in calls])
        self.assertNotIn(["git", "checkout"], [call[:2] for call in calls])
        self.assertFalse([call for call in calls if call[0] == "uv"], calls)

    def test_a_clean_tree_whose_head_moved_still_runs_every_guard(self) -> None:
        """An agent that commits its own work leaves no diff; the guards must run anyway."""
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, porcelain="", head="1111", base="2222"),
            read=self.reader())
        self.assertEqual(0, code)
        for check in runner.CHECKS:
            self.assertIn(list(check), calls)
        self.assertIn(["git", "checkout", "-B", "triage/pending"], calls)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_a_failing_guard_on_a_clean_tree_whose_head_moved_aborts(self) -> None:
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, porcelain="", head="1111", base="2222",
                               fails=("validate_directory.py",)),
            read=self.reader())
        self.assertEqual(1, code)
        self.assertNotIn(["git", "checkout"], [call[:2] for call in calls])

    def test_finish_aborts_when_head_cannot_be_compared_to_origin_main(self) -> None:
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:2] == ["git", "rev-parse"] and command[2] == "origin/main":
                return 128, "fatal: ambiguous argument"
            return 0, ""

        self.assertEqual(1, runner.finish(run=fake_run, read=self.reader()))

    def test_a_changed_classification_confidence_aborts_before_any_check(self) -> None:
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls),
            read=self.reader(self.triaged(classification_confidence=0.99)))
        self.assertEqual(1, code)
        self.assertFalse([call for call in calls if call[0] == "uv"], calls)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_a_deleted_candidate_aborts_the_run(self) -> None:
        calls: list[list[str]] = []
        emptied = json.dumps({**json.loads(self.MAIN_QUEUE), "candidates": []})
        code = runner.finish(run=self.responder(calls), read=self.reader(emptied))
        self.assertEqual(1, code)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_a_held_block_may_null_family_and_role(self) -> None:
        calls: list[list[str]] = []
        document = json.loads(self.MAIN_QUEUE)
        candidate_record = document["candidates"][0]
        candidate_record["triage"] = {**self.BLOCK, "verdict": "held",
                                      "held_by": "BACKLOG.md — skill packs"}
        candidate_record["proposed_system_family"] = None
        candidate_record["proposed_primary_role"] = None
        code = runner.finish(run=self.responder(calls), read=self.reader(json.dumps(document)))
        self.assertEqual(0, code)
        self.assertIn(["git", "commit"], [call[:2] for call in calls])

    def test_finish_aborts_when_the_queue_cannot_be_read_from_origin_main(self) -> None:
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/candidates.json\n"
            if command[:2] == ["git", "show"]:
                return 128, "fatal: path does not exist"
            return 0, ""

        self.assertEqual(1, runner.finish(run=fake_run, read=self.reader()))

    def test_a_failing_check_short_circuits_before_any_commit(self) -> None:
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, fails=("build_candidate_evidence.py",)),
            read=self.reader())
        self.assertEqual(1, code)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])
        self.assertNotIn(["git", "add"], [call[:2] for call in calls])

    def test_finish_does_not_commit_when_git_add_fails(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:2] == ["git", "add"]:
                calls.append(command)
                return 1, "fatal: could not add"
            return self.responder(calls)(command, _cwd)

        self.assertEqual(1, runner.finish(run=fake_run, read=self.reader()))
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_finish_does_not_report_success_when_checkout_fails(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:2] == ["git", "checkout"]:
                calls.append(command)
                return 1, "fatal: branch is checked out elsewhere"
            return self.responder(calls)(command, _cwd)

        self.assertEqual(1, runner.finish(run=fake_run, read=self.reader()))
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_finish_does_not_report_success_when_commit_fails(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:2] == ["git", "commit"]:
                calls.append(command)
                return 1, "fatal: nothing to commit"
            return self.responder(calls)(command, _cwd)

        self.assertEqual(1, runner.finish(run=fake_run, read=self.reader()))


class FinishRefusesQueueDriftDuringChecksTests(unittest.TestCase):
    """The re-read-before-add guard: closes the deterministic form of the CHECKS-window
    bypass, where a command CHECKS runs (or something it shells out to) rewrites QUEUE
    after the field guard already read it and before `git add` stages it. See "Guard
    threat model" in docs/OPERATIONS.md."""

    BASE_QUEUE = json.dumps({
        "version": 1,
        "candidates": [{
            "repo": "a/one", "url": "https://github.com/a/one",
            "proposed_system_family": "memory_system",
            "proposed_primary_role": "agent_memory_service",
            "classification_confidence": 0.8, "status": "provisional",
        }],
    })
    BLOCK: ClassVar[dict] = {
        "verdict": "review_ready", "rule": "r", "finding": "f",
        "evidence": [{"label": "README"}], "proposed_at": "2026-09-04",
        "proposer": "candidate-triage"}

    def triaged(self, **overrides) -> str:
        document = json.loads(self.BASE_QUEUE)
        document["candidates"][0]["triage"] = self.BLOCK
        document["candidates"][0].update(overrides)
        return json.dumps(document)

    def test_a_queue_rewritten_during_checks_is_refused(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/candidates.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, "1111\n"
            if command[:2] == ["git", "show"]:
                return 0, self.BASE_QUEUE
            return 0, ""  # every CHECKS command, stubbed to succeed

        # The field guard reads a legitimately triaged queue; by the time `finish` would
        # stage it, the file on disk has drifted — standing in for a CHECKS command that
        # rewrote it in between.
        reads = iter([self.triaged(), self.triaged(classification_confidence=0.99)])

        def fake_read(path: str) -> str:
            self.assertEqual(runner.QUEUE, path)
            return next(reads)

        import contextlib
        import io

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(run=fake_run, read=fake_read)
        self.assertEqual(1, code)
        self.assertIn("changed after the field guard read it", stderr.getvalue())
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])
        self.assertNotIn(["git", "add"], [call[:2] for call in calls])


class PrepareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        prompt_path = Path(self.tmp.name) / "candidate-triage.md"
        installed_path = Path(self.tmp.name) / "SKILL.md"
        prompt_path.write_text("routine body\n", encoding="utf-8")
        installed_path.write_text("routine body\n", encoding="utf-8")
        self.prompt_path = prompt_path
        self.installed_path = installed_path
        # ROOT is where `prepare` now writes BASE_REF (see `record_prepared_base`). Left
        # unpatched, `prepare` here would plant `.candidate-evidence/base-ref.json` in
        # this repository's own live checkout — exactly the failure this routine exists
        # to prevent developers from causing.
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        for patcher in (
            mock.patch.object(runner, "PROMPT", prompt_path),
            mock.patch.object(runner, "INSTALLED_PROMPT", installed_path),
            mock.patch.object(runner, "ROOT", root),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_a_failed_worktree_add_aborts_and_never_runs_the_harness(self) -> None:
        calls = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "worktree", "add"]:
                return 1, "fatal: could not create worktree"
            return 0, ""

        self.assertEqual(1, runner.prepare(limit=5, run=fake_run))
        self.assertFalse(any("build_candidate_evidence.py" in part for call in calls for part in call))

    def test_a_failed_worktree_remove_is_tolerated_and_the_run_continues(self) -> None:
        calls = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "worktree", "remove"]:
                return 1, "fatal: no such worktree"
            return 0, ""

        self.assertEqual(0, runner.prepare(limit=5, run=fake_run))
        self.assertTrue(any("build_candidate_evidence.py" in part for call in calls for part in call))

    def test_prompt_drift_aborts_before_any_git_command_runs(self) -> None:
        self.installed_path.unlink()

        def fail_if_called(command: list[str], _cwd=None) -> tuple[int, str]:
            self.fail(f"no command should run once the prompt has drifted, got: {command}")

        self.assertEqual(1, runner.prepare(limit=5, run=fail_if_called))


class CommittedOverreachTests(unittest.TestCase):
    def test_a_committed_edit_outside_the_queue_is_reported(self) -> None:
        self.assertEqual(
            ["directory/projects.json"],
            runner.unexpected_committed_changes("directory/candidates.json\ndirectory/projects.json\n"),
        )

    def test_a_commit_touching_only_the_queue_is_allowed(self) -> None:
        self.assertEqual([], runner.unexpected_committed_changes("directory/candidates.json\n"))

    def test_finish_rejects_a_commit_that_touched_another_file(self) -> None:
        """A clean working tree is not proof: the agent may have committed its own edit."""
        calls = []

        def fake_run(command, _cwd=None):
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, ""
            if command[:2] == ["git", "rev-parse"]:
                return 0, "aaa\n" if command[2] == "HEAD" else "bbb\n"
            if command[:3] == ["git", "diff", "--name-only"]:
                return 0, "directory/candidates.json\ndirectory/projects.json\n"
            return 0, ""

        self.assertEqual(1, runner.finish(run=fake_run, read=lambda _p: "{}"))
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])


class PromptDriftTests(unittest.TestCase):
    def test_an_uninstalled_prompt_is_drift(self) -> None:
        self.assertIsNotNone(runner.prompt_drift("body", None))

    def test_a_changed_installed_prompt_is_drift(self) -> None:
        self.assertIsNotNone(runner.prompt_drift("body", "different body"))

    def test_an_identical_prompt_is_not_drift(self) -> None:
        self.assertIsNone(runner.prompt_drift("body\n", "  body  "))


class ReplaceRefGuardTests(unittest.TestCase):
    """`routine_guards.replace_refs_problem` and the `GIT_NO_REPLACE_OBJECTS=1` env var
    on `routine_guards.shell` are shared with `run_hn_signals.py`, which has thorough
    coverage of the mechanism itself (see `tests/test_run_hn_signals.py`,
    `ReplaceRefGuardTests`). This class only proves `run_candidate_triage.py`'s `finish`
    actually wires the refusal in, using a real repository and a real `git replace`."""

    def setUp(self) -> None:
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))
        root = scratch / "root"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "directory").mkdir()
        (root / "directory" / "candidates.json").write_text(
            json.dumps({"version": 1, "candidates": []}), encoding="utf-8"
        )
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "init"], check=True)
        (root / "other.txt").write_text("second commit\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "second"], check=True)

        worktree = scratch / "worktree"
        subprocess.run(
            ["git", "-C", str(root), "worktree", "add", "--quiet", "--detach", str(worktree), "HEAD"],
            check=True,
        )
        self.enterContext(mock.patch.object(runner, "WORKTREE", worktree))
        self.worktree = worktree

    def test_a_populated_replace_ref_is_refused(self) -> None:
        import contextlib
        import io

        _, head = runner.shell(["git", "rev-parse", "HEAD"], self.worktree)
        _, parent = runner.shell(["git", "rev-parse", "HEAD~1"], self.worktree)
        code, output = runner.shell(
            ["git", "replace", "-f", head.strip(), parent.strip()], self.worktree
        )
        self.assertEqual(0, code, output)

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(run=runner.shell)
        self.assertEqual(1, code)
        self.assertIn("refs/replace", stderr.getvalue())


class PreparedBaseRefTests(unittest.TestCase):
    """The SHA `prepare` records is the one `finish` uses. Mirrors
    tests/test_run_hn_signals.py's `PreparedBaseRefTests` for the shared
    `routine_guards.prepared_base_ref` this routine now binds the same way."""

    def test_finish_reads_the_sha_prepare_recorded(self) -> None:
        sha = "d" * 40

        def read(path: str) -> str:
            self.assertEqual(runner.BASE_REF, path)
            return json.dumps({"sha": sha, "from_ref": "origin/main"})

        self.assertEqual(sha, runner.prepared_base_ref(read))

    def test_no_recorded_sha_falls_back_to_origin_main(self) -> None:
        def missing(_path: str) -> str:
            raise OSError("no such file")

        self.assertEqual("origin/main", runner.prepared_base_ref(missing))

    def test_a_malformed_bundle_falls_back_to_origin_main(self) -> None:
        self.assertEqual("origin/main", runner.prepared_base_ref(lambda _p: "not json"))

    def test_a_recorded_value_that_is_not_a_commit_sha_falls_back_to_origin_main(self) -> None:
        """A recorded "sha" reaches `git` argv unchecked everywhere it is used — as a
        base ref in `git rev-parse`/`git diff`/`git show`. Without this check, a forged
        value like an option flag becomes an arbitrary-argv-injection primitive rather
        than a rejected record."""

        def forged(_path: str) -> str:
            return json.dumps({"sha": "--output=/tmp/pwn_probe"})

        self.assertEqual("origin/main", runner.prepared_base_ref(forged))

    def test_reads_from_root_by_default_not_the_worktree(self) -> None:
        self.assertEqual(runner.root_text, runner.prepared_base_ref.__defaults__[0])

    def test_a_sha_with_a_trailing_newline_falls_back_rather_than_hard_erroring(self) -> None:
        """`$` in Python's `re` matches immediately before a trailing "\\n", so a `match`
        against a `$`-anchored pattern would accept `"<40 hex>\\n"` and pass a value
        carrying a newline straight to `git` argv. `fullmatch` against an unanchored
        pattern rejects it outright, same as any other malformed record."""
        sha = "a" * 40

        def read(_path: str) -> str:
            return json.dumps({"sha": sha + "\n"})

        self.assertEqual("origin/main", runner.prepared_base_ref(read))


class SymlinkedBaseRecordTests(unittest.TestCase):
    """The reviewer's other bypass, shared with run_hn_signals.py: replace ROOT's
    base-record file — or the directory it lives under — with a symlink into the
    worktree, so a value the model fully controls is read as the trusted base."""

    def test_a_symlinked_base_record_is_refused(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        (root / ".candidate-evidence").mkdir()
        forged = root / "forged.json"
        forged.write_text(json.dumps({"sha": "1" * 40, "from_ref": "forged"}), encoding="utf-8")
        (root / runner.BASE_REF).symlink_to(forged)
        self.enterContext(mock.patch.object(runner, "ROOT", root))

        self.assertEqual("origin/main", runner.prepared_base_ref(runner.root_text))

    def test_root_text_raises_rather_than_follows_a_symlink(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        target = root / "elsewhere.txt"
        target.write_text("attacker-controlled", encoding="utf-8")
        link = root / "linked.txt"
        link.symlink_to(target)
        self.enterContext(mock.patch.object(runner, "ROOT", root))

        with self.assertRaises(OSError):
            runner.root_text("linked.txt")

    def test_a_symlinked_base_directory_is_refused(self) -> None:
        """A narrower bypass than the file-level one above: `base-ref.json` itself stays
        a plain file, but `.candidate-evidence` — the directory it lives under — is a
        symlink to somewhere outside ROOT. `Path.is_symlink()` on the file alone would
        pass."""
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        elsewhere = tempfile.TemporaryDirectory()
        self.addCleanup(elsewhere.cleanup)
        forged_dir = Path(elsewhere.name)
        (forged_dir / "base-ref.json").write_text(
            json.dumps({"sha": "1" * 40, "from_ref": "forged"}), encoding="utf-8"
        )
        (root / ".candidate-evidence").symlink_to(forged_dir)
        self.enterContext(mock.patch.object(runner, "ROOT", root))

        self.assertEqual("origin/main", runner.prepared_base_ref(runner.root_text))


class PrepareRecordsBaseRefTests(unittest.TestCase):
    """`prepare` must resolve `origin/main` to a full commit SHA, build the worktree from
    it, and record it under ROOT — never under WORKTREE, the model's own directory."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        prompt_path = Path(self.tmp.name) / "candidate-triage.md"
        installed_path = Path(self.tmp.name) / "SKILL.md"
        prompt_path.write_text("routine body\n", encoding="utf-8")
        installed_path.write_text("routine body\n", encoding="utf-8")
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        worktree = Path(self.enterContext(tempfile.TemporaryDirectory()))
        for patcher in (
            mock.patch.object(runner, "PROMPT", prompt_path),
            mock.patch.object(runner, "INSTALLED_PROMPT", installed_path),
            mock.patch.object(runner, "ROOT", root),
            mock.patch.object(runner, "WORKTREE", worktree),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.root = root
        self.worktree = worktree

    @staticmethod
    def fake_run(calls: list[list[str]], *, fetch_code: int = 0, resolved_sha: str = "c" * 40):
        def run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "fetch", "--quiet"]:
                return fetch_code, "" if fetch_code == 0 else "network unreachable"
            if command[:3] == ["git", "rev-parse", "--verify"]:
                return 0, resolved_sha + "\n"
            return 0, ""
        return run

    def test_prepare_records_the_resolved_sha_under_root_not_the_worktree(self) -> None:
        sha = "c" * 40
        calls: list[list[str]] = []
        code = runner.prepare(limit=5, run=self.fake_run(calls, resolved_sha=sha))
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", "--verify", "origin/main"], calls)
        self.assertIn(["git", "worktree", "add", "--quiet", "--detach", str(self.worktree), sha], calls)
        recorded = json.loads((self.root / runner.BASE_REF).read_text(encoding="utf-8"))
        self.assertEqual(sha, recorded["sha"])
        self.assertEqual("origin/main", recorded["from_ref"])
        self.assertFalse((self.worktree / runner.BASE_REF).exists())

    def test_a_fetch_failure_is_fatal(self) -> None:
        calls: list[list[str]] = []
        code = runner.prepare(limit=5, run=self.fake_run(calls, fetch_code=1))
        self.assertEqual(1, code)
        self.assertNotIn(["git", "worktree", "remove", "--force", str(self.worktree)], calls)
        self.assertFalse((self.root / runner.BASE_REF).exists())

    def test_an_unresolvable_origin_main_is_fatal(self) -> None:
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:3] == ["git", "rev-parse", "--verify"]:
                return 128, "fatal: ambiguous argument 'origin/main'"
            return 0, ""

        self.assertEqual(1, runner.prepare(limit=5, run=fake_run))
        self.assertFalse((self.root / runner.BASE_REF).exists())


class FinishUsesRecordedBaseTests(unittest.TestCase):
    """`finish` must compare against the exact commit `prepare` recorded, in every place
    it otherwise falls back to origin/main: the head-moved comparison, the
    committed-diff blast-radius check, the `git show <base>:<queue>` field-guard
    baseline, and the diagnostic label `unexpected_field_changes` uses for the base
    side. Mirrors tests/test_run_hn_signals.py's identical class."""

    QUEUE_DOC: ClassVar[str] = json.dumps({
        "version": 1,
        "candidates": [{
            "repo": "a/one", "url": "https://github.com/a/one",
            "proposed_system_family": "memory_system",
            "proposed_primary_role": "agent_memory_service",
            "classification_confidence": 0.8, "status": "provisional",
        }],
    })

    def responder(self, calls: list[list[str]], *, base_sha: str, head: str = "1111"):
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/candidates.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, (head if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"{base_sha}:{runner.QUEUE}", command[2])
                return 0, self.QUEUE_DOC
            if command[:2] == ["git", "diff"]:
                self.assertIn(base_sha, command)
                self.assertNotIn("origin/main", command)
                return 0, runner.QUEUE
            return 0, ""
        return fake_run

    def base_read(self, base_sha: str):
        def _read(path: str) -> str:
            self.assertEqual(runner.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "origin/main"})
        return _read

    def queue_read(self):
        def _read(path: str) -> str:
            self.assertEqual(runner.QUEUE, path)
            return self.QUEUE_DOC
        return _read

    def test_finish_uses_the_recorded_sha_in_place_of_origin_main(self) -> None:
        base_sha = "e" * 40
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, base_sha=base_sha),
            read=self.queue_read(),
            base_read=self.base_read(base_sha),
        )
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", base_sha], calls)
        self.assertNotIn(["git", "rev-parse", "origin/main"], calls)

    def test_finish_falls_back_to_origin_main_when_nothing_was_recorded(self) -> None:
        calls: list[list[str]] = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/candidates.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else "origin/main") + "\n"
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"origin/main:{runner.QUEUE}", command[2])
                return 0, self.QUEUE_DOC
            return 0, ""

        def base_read_without_a_recorded_base(path: str) -> str:
            self.assertEqual(runner.BASE_REF, path)
            raise OSError("no bundle")

        code = runner.finish(
            run=fake_run, read=self.queue_read(), base_read=base_read_without_a_recorded_base
        )
        self.assertEqual(0, code)
        self.assertIn(["git", "rev-parse", "origin/main"], calls)

    def test_a_base_side_problem_is_labelled_with_the_recorded_sha_not_origin_main(self) -> None:
        """Mutation coverage: dropping `base_label=base_ref` at the `finish` call site
        reverts the diagnostic label to the literal default "origin/main"."""
        base_sha = "7" * 40
        malformed_base = json.dumps({"version": 1, "candidates": "not-a-list"})

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/candidates.json\n"
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "diff"]:
                return 0, runner.QUEUE
            if command[:2] == ["git", "show"]:
                self.assertEqual(f"{base_sha}:{runner.QUEUE}", command[2])
                return 0, malformed_base
            return 0, ""

        def fake_base_read(path: str) -> str:
            self.assertEqual(runner.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "origin/main"})

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(
                run=fake_run, read=self.queue_read(), base_read=fake_base_read
            )
        self.assertEqual(1, code)
        self.assertIn(base_sha, stderr.getvalue())
        self.assertNotIn("origin/main", stderr.getvalue())


class GuardFiresWithAPinnedBaseTests(unittest.TestCase):
    """The blast-radius, added/removed-candidate, and overwritten-`triage`-block guards
    must fire identically whether `finish` compares against `origin/main` or a pinned
    commit SHA — pinning the base must never weaken a guard."""

    BASE_QUEUE: ClassVar[str] = json.dumps({
        "version": 1,
        "candidates": [{
            "repo": "a/one", "url": "https://github.com/a/one",
            "proposed_system_family": "memory_system",
            "proposed_primary_role": "agent_memory_service",
            "classification_confidence": 0.8, "status": "provisional",
            "triage": {
                "verdict": "review_ready", "rule": "r", "finding": "f",
                "evidence": [{"label": "README"}], "proposed_at": "2026-09-04",
                "proposer": "candidate-triage",
            },
        }],
    })

    def fake_base_read(self, base_sha: str):
        def _read(path: str) -> str:
            self.assertEqual(runner.BASE_REF, path)
            return json.dumps({"sha": base_sha, "from_ref": "origin/main"})
        return _read

    def responder(self, calls: list[list[str]], *, base_sha: str,
                  porcelain: str = " M directory/candidates.json\n"):
        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, porcelain
            if command[:2] == ["git", "rev-parse"]:
                return 0, ("1111" if command[2] == "HEAD" else base_sha) + "\n"
            if command[:2] == ["git", "show"]:
                return 0, self.BASE_QUEUE
            if command[:2] == ["git", "diff"]:
                return 0, runner.QUEUE
            return 0, ""
        return fake_run

    def test_a_file_outside_allowed_changes_is_rejected(self) -> None:
        base_sha = "1" * 40
        calls: list[list[str]] = []
        code = runner.finish(
            run=self.responder(calls, base_sha=base_sha, porcelain=" M directory/projects.json\n"),
            read=lambda _p: self.BASE_QUEUE,
            base_read=self.fake_base_read(base_sha),
        )
        self.assertEqual(1, code)
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])

    def test_an_added_candidate_is_rejected(self) -> None:
        base_sha = "2" * 40
        document = json.loads(self.BASE_QUEUE)
        document["candidates"].append({"repo": "b/two", "url": "https://github.com/b/two"})
        after = json.dumps(document)
        calls: list[list[str]] = []
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(
                run=self.responder(calls, base_sha=base_sha),
                read=lambda _p: after,
                base_read=self.fake_base_read(base_sha),
            )
        self.assertEqual(1, code)
        self.assertIn("only discovery adds", stderr.getvalue())

    def test_a_removed_candidate_is_rejected(self) -> None:
        base_sha = "3" * 40
        after = json.dumps({"version": 1, "candidates": []})
        calls: list[list[str]] = []
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(
                run=self.responder(calls, base_sha=base_sha),
                read=lambda _p: after,
                base_read=self.fake_base_read(base_sha),
            )
        self.assertEqual(1, code)
        self.assertIn("only a human resolves", stderr.getvalue())

    def test_an_overwritten_triage_block_is_rejected(self) -> None:
        base_sha = "4" * 40
        document = json.loads(self.BASE_QUEUE)
        document["candidates"][0]["triage"]["verdict"] = "out_of_scope"
        after = json.dumps(document)
        calls: list[list[str]] = []
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(
                run=self.responder(calls, base_sha=base_sha),
                read=lambda _p: after,
                base_read=self.fake_base_read(base_sha),
            )
        self.assertEqual(1, code)
        self.assertIn("human review's field", stderr.getvalue())


class RealGitMovingMainTests(unittest.TestCase):
    """The actual bug this branch fixes: `finish` re-resolved `origin/main` at finish
    time, so any commit that landed on `main` between `prepare` and `finish` looked like
    something this run had touched — in a repository where main moves several times a
    day, that made the routine fail on ordinary unrelated activity. Builds a real
    repository, replicates what `prepare` records (a pinned base SHA and a worktree built
    from it), advances `refs/remotes/origin/main` with an unrelated commit exactly as a
    `git fetch` would, and confirms `finish` does not report that commit's files as
    overreach."""

    def setUp(self) -> None:
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))
        root = scratch / "root"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "directory").mkdir()
        (root / ".gitignore").write_text(".candidate-evidence/\n", encoding="utf-8")
        (root / "directory" / "candidates.json").write_text(
            json.dumps({
                "version": 1,
                "candidates": [{
                    "repo": "a/one", "url": "https://github.com/a/one",
                    "proposed_system_family": "memory_system",
                    "proposed_primary_role": "agent_memory_service",
                    "classification_confidence": 0.8, "status": "provisional",
                }],
            }),
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "init"], check=True)
        base_code, base_sha = runner.shell(["git", "rev-parse", "HEAD"], root)
        self.assertEqual(0, base_code)
        self.base_sha = base_sha.strip()
        # A real `git fetch origin` would create this ref; forging it directly means the
        # test needs no actual network remote to exercise the guard's use of it.
        subprocess.run(
            ["git", "-C", str(root), "update-ref", "refs/remotes/origin/main", self.base_sha],
            check=True,
        )

        worktree = scratch / "worktree"
        subprocess.run(
            ["git", "-C", str(root), "worktree", "add", "--quiet", "--detach",
             str(worktree), self.base_sha],
            check=True,
        )

        self.enterContext(mock.patch.object(runner, "ROOT", root))
        self.enterContext(mock.patch.object(runner, "WORKTREE", worktree))
        self.root = root
        self.worktree = worktree

        # What `prepare` records: the exact commit the worktree was built from.
        routine_guards.record_prepared_base(root / runner.BASE_REF, self.base_sha, "origin/main")

    @staticmethod
    def hybrid_run(command: list[str], cwd=None) -> tuple[int, str]:
        if command and command[0] == "git":
            return runner.shell(command, cwd)
        return 0, ""  # every "uv run ..." quality check, stubbed to succeed

    def advance_origin_main(self, *paths: str) -> None:
        """Simulate main moving between `prepare` and `finish`: commit unrelated files
        directly in `root` — standing in for what a real `git fetch origin` would bring
        down — and repoint `refs/remotes/origin/main` at the new commit."""
        for relative in paths:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("unrelated change\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.root), "add", "-A"], check=True)
        subprocess.run(
            ["git", "-C", str(self.root), "commit", "-q", "-m", "unrelated main commit"], check=True
        )
        _, new_sha = runner.shell(["git", "rev-parse", "HEAD"], self.root)
        subprocess.run(
            ["git", "-C", str(self.root), "update-ref", "refs/remotes/origin/main", new_sha.strip()],
            check=True,
        )

    def test_an_unrelated_commit_on_origin_main_is_not_reported(self) -> None:
        # The exact three files today's real failed run blamed on the routine.
        self.advance_origin_main(
            ".github/workflows/update-directory.yml", "BACKLOG.md",
            "directory/model-candidates.json",
        )

        # The run's only permitted edit: add a `triage` block to the one candidate.
        queue_path = self.worktree / runner.QUEUE
        document = json.loads(queue_path.read_text(encoding="utf-8"))
        document["candidates"][0]["triage"] = {
            "verdict": "review_ready", "rule": "r", "finding": "f",
            "evidence": [{"label": "README"}], "proposed_at": "2026-09-04",
            "proposer": "candidate-triage",
        }
        queue_path.write_text(json.dumps(document), encoding="utf-8")

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = runner.finish(run=self.hybrid_run)
        self.assertEqual(0, code, stderr.getvalue())
        self.assertNotIn("update-directory.yml", stderr.getvalue())
        self.assertNotIn("BACKLOG.md", stderr.getvalue())
        self.assertNotIn("model-candidates.json", stderr.getvalue())

        branch_code, _ = runner.shell(["git", "rev-parse", "--verify", "triage/pending"], self.worktree)
        self.assertEqual(0, branch_code)

    def test_without_pinning_the_same_unrelated_commit_would_have_been_blamed(self) -> None:
        """Proves the scenario is real, not just that the new code happens to pass it: a
        blast-radius check that re-resolved the literal `origin/main` ref — what `finish`
        did before this branch — would see the unrelated commit as part of the diff."""
        self.advance_origin_main("BACKLOG.md")

        diff_code, diff_output = runner.shell(
            ["git", "diff", "--name-only", "--no-renames", "origin/main", self.base_sha],
            self.worktree,
        )
        self.assertEqual(0, diff_code)
        self.assertIn("BACKLOG.md", diff_output)


if __name__ == "__main__":
    unittest.main()
