from __future__ import annotations

import contextlib
import hashlib
import io
import json
import stat
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from unittest.mock import patch

from scripts import import_openrouter
from scripts.import_openrouter import (
    DISPOSITIONS_NAME,
    ENDPOINT,
    LEAD_FIELDS,
    LEADS_NAME,
    MIN_LISTED_ROWS,
    AtlasIndex,
    ImportResult,
    Route,
    Skipped,
    atlas_index,
    build_document,
    eligible_routes,
    get_listing,
    hugging_face_repo,
    listed_route,
    listing_rows,
    openrouter_route,
    run,
    unfetched_document,
    with_models_dev_author,
    write_json_atomic,
)

ROOT = Path(__file__).resolve().parents[1]
EMPTY_INDEX = AtlasIndex(frozenset(), frozenset(), frozenset())


def listing_row(listed_id: str, **overrides: Any) -> dict[str, Any]:
    """One row in the documented getModels shape, including fields Atlas must drop."""
    route = listed_id.lstrip("~").split(":", 1)[0]
    row: dict[str, Any] = {
        "id": listed_id,
        "canonical_slug": route,
        "hugging_face_id": "",
        "name": f"Example: {route}",
        "created": 1_750_000_000,
        "description": "Marketing prose Atlas must never copy.",
        "context_length": 131072,
        "architecture": {
            "modality": "text->text",
            "input_modalities": ["text"],
            "output_modalities": ["text"],
            "tokenizer": "Other",
            "instruct_type": None,
        },
        "pricing": {"prompt": "0.0000011", "completion": "0.0000022"},
        "top_provider": {
            "context_length": 131072,
            "max_completion_tokens": 8192,
            "is_moderated": False,
        },
        "per_request_limits": None,
        "supported_parameters": ["temperature", "tools"],
        "default_parameters": None,
        "supported_voices": None,
        "benchmarks": {"design_arena": [{"arena": "models", "elo": 1385.2}]},
        "expiration_date": None,
        "knowledge_cutoff": None,
        "links": {"details": f"/api/v1/models/{route}/endpoints"},
    }
    row.update(overrides)
    return row


def listing(
    rows: list[dict[str, Any]], *, filler: int = MIN_LISTED_ROWS, **envelope: Any
) -> bytes:
    """A complete response body; filler rows keep it inside the fail-closed bounds."""
    data = rows + [listing_row(f"filler/model-{n:03d}") for n in range(filler)]
    document: dict[str, Any] = {
        "data": data,
        "total_count": len(data),
        "links": {"next": None},
    }
    document.update(envelope)
    return json.dumps(document).encode()


def route(route_id: str, **overrides: Any) -> Route:
    fields = {
        "canonical_slug": route_id,
        "name": route_id,
        "hugging_face_id": None,
        "listed_at": "2025-06-15",
    }
    fields.update(overrides)
    return Route(**fields)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_exc: object) -> None:
        return None

    def read(self, limit: int) -> bytes:
        return self.body[:limit]


class FakeOpener:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.requests: list[urllib.request.Request] = []

    def open(self, request: urllib.request.Request, timeout: float) -> FakeResponse:
        self.requests.append(request)
        return FakeResponse(self.body)


class FetchTests(unittest.TestCase):
    def test_fetch_refuses_every_url_but_the_fixed_endpoint(self) -> None:
        refused = (
            "http://openrouter.ai/api/v1/models",
            "https://openrouter.ai.attacker.invalid/api/v1/models",
            "https://attacker.invalid/?next=https://openrouter.ai/api/v1/models",
            "https://user@openrouter.ai/api/v1/models",
            "https://openrouter.ai:8443/api/v1/models",
            "https://openrouter.ai/api/v1/models?output_modalities=all",
            "https://openrouter.ai/api/v1/models#fragment",
            "https://openrouter.ai/api/v1/providers",
            "https://openrouter.ai/models",
        )
        with patch.object(import_openrouter.urllib.request, "build_opener") as build:
            for url in refused:
                with (
                    self.subTest(url=url),
                    self.assertRaisesRegex(ValueError, "allowlist"),
                ):
                    get_listing(url)
            build.assert_not_called()

    def test_fetch_sends_no_credentials_or_app_attribution_and_refuses_redirects(
        self,
    ) -> None:
        opener = FakeOpener(b'{"data": []}')
        with patch.object(
            import_openrouter.urllib.request, "build_opener", return_value=opener
        ) as build:
            self.assertEqual(b'{"data": []}', get_listing(ENDPOINT))

        build.assert_called_once_with(import_openrouter._RefuseRedirects)
        (request,) = opener.requests
        self.assertEqual(ENDPOINT, request.full_url)
        headers = {name.lower() for name, _value in request.header_items()}
        for forbidden in ("authorization", "http-referer", "x-openrouter-title"):
            self.assertNotIn(forbidden, headers)
        self.assertEqual(import_openrouter.USER_AGENT, request.get_header("User-agent"))

    def test_fetch_refuses_an_oversized_body(self) -> None:
        opener = FakeOpener(b"x" * (import_openrouter.MAX_RESPONSE_BYTES + 1))
        with (
            patch.object(
                import_openrouter.urllib.request, "build_opener", return_value=opener
            ),
            self.assertRaisesRegex(ValueError, "size limit"),
        ):
            get_listing(ENDPOINT)

    def test_redirect_handler_raises_instead_of_following(self) -> None:
        handler = import_openrouter._RefuseRedirects()
        request = urllib.request.Request(ENDPOINT)
        with self.assertRaisesRegex(urllib.error.HTTPError, "refuses redirects"):
            handler.redirect_request(
                request, None, 302, "Found", {}, "https://elsewhere.invalid/models"
            )


class ListingTests(unittest.TestCase):
    def test_listing_accepts_a_complete_list_with_or_without_pagination_fields(
        self,
    ) -> None:
        self.assertEqual(MIN_LISTED_ROWS, len(listing_rows(listing([]))))
        bare = json.dumps({"data": json.loads(listing([]))["data"]}).encode()
        self.assertEqual(MIN_LISTED_ROWS, len(listing_rows(bare)))

    def test_listing_fails_closed_on_malformed_truncated_or_out_of_bounds_bodies(
        self,
    ) -> None:
        cases = {
            "not json": (b"<html>", "not valid UTF-8 JSON"),
            "not utf-8": (b"\xff\xfe", "not valid UTF-8 JSON"),
            "a list": (b"[]", "data list"),
            "no data": (b'{"models": []}', "data list"),
            "short total": (listing([], total_count=5), "total_count"),
            "bool total": (listing([], total_count=True), "total_count"),
            "next page": (
                listing([], links={"next": "/api/v1/models?offset=500&limit=500"}),
                "paginated",
            ),
            "odd links": (listing([], links=["next"]), "paginated"),
            "too few": (listing([], filler=MIN_LISTED_ROWS - 1), "bounds"),
        }
        for label, (body, message) in cases.items():
            with (
                self.subTest(label),
                self.assertRaisesRegex(ValueError, message),
            ):
                listing_rows(body)

    def test_listing_refuses_more_rows_than_the_upper_bound(self) -> None:
        with (
            patch.object(import_openrouter, "MAX_LISTED_ROWS", MIN_LISTED_ROWS),
            self.assertRaisesRegex(ValueError, "bounds"),
        ):
            listing_rows(listing([listing_row("acme/one-more")]))


class RouteTests(unittest.TestCase):
    def test_a_route_keeps_only_identity_facts(self) -> None:
        route_id, identity = listed_route(
            listing_row(
                "qwen/qwen3-max:free",
                canonical_slug="qwen/qwen3-max-20250923",
                hugging_face_id="Qwen/Qwen3-Max",
                created=0,
            )
        )

        self.assertEqual("qwen/qwen3-max", route_id)
        self.assertEqual(
            Route(
                canonical_slug="qwen/qwen3-max-20250923",
                name="Example: qwen/qwen3-max",
                hugging_face_id="Qwen/Qwen3-Max",
                listed_at="1970-01-01",
            ),
            identity,
        )

    def test_rules_skip_only_what_openrouter_itself_declares(self) -> None:
        skipped = {
            "tilde alias": listing_row("~anthropic/claude-sonnet-latest"),
            "alias target": listing_row(
                "anthropic/claude-sonnet",
                alias_target={"slug": "anthropic/claude-sonnet-4.5", "name": "x"},
            ),
            "router": listing_row("openrouter/auto"),
            "cloaked model": listing_row("OpenRouter/sonoma-sky-alpha"),
            "image only": listing_row(
                "acme/painter",
                architecture={"input_modalities": ["text"], "output_modalities": []},
            ),
        }
        for label, row in skipped.items():
            with self.subTest(label):
                self.assertIsNone(listed_route(row))
        self.assertIsNotNone(listed_route(listing_row("openai/chatgpt-4o-latest")))

    def test_an_empty_hugging_face_id_means_none(self) -> None:
        _route_id, identity = listed_route(listing_row("acme/model"))
        self.assertIsNone(identity.hugging_face_id)

    def test_rows_fail_closed_on_invalid_fields(self) -> None:
        cases = {
            "not an object": (["acme/model"], "must be objects"),
            "no id": ({"name": "x"}, "invalid id"),
            "nested alias": (listing_row("acme/model::free"), "invalid id"),
            "bare author": (listing_row("acme"), "invalid id"),
            "no architecture": (
                listing_row("acme/model", architecture=None),
                "output_modalities",
            ),
            "modalities not strings": (
                listing_row("acme/model", architecture={"output_modalities": [1]}),
                "output_modalities",
            ),
            "blank name": (listing_row("acme/model", name=" "), "name"),
            "control character": (
                listing_row("acme/model", name="Example\nInjected: line"),
                "name",
            ),
            "bad canonical slug": (
                listing_row("acme/model", canonical_slug="acme model"),
                "canonical_slug",
            ),
            "bad hugging face id": (
                listing_row("acme/model", hugging_face_id="not a repo"),
                "hugging_face_id",
            ),
            "numeric hugging face id": (
                listing_row("acme/model", hugging_face_id=7),
                "hugging_face_id",
            ),
            "bool created": (listing_row("acme/model", created=True), "created"),
            "negative created": (listing_row("acme/model", created=-1), "created"),
            "string created": (listing_row("acme/model", created="2025"), "created"),
            "huge created": (listing_row("acme/model", created=10**20), "range"),
        }
        for label, (row, message) in cases.items():
            with (
                self.subTest(label),
                self.assertRaisesRegex(ValueError, message),
            ):
                listed_route(row)

    def test_variants_fold_into_their_route_whatever_the_row_order(self) -> None:
        rows = [
            listing_row("acme/chat:free", name="Acme Chat (free)"),
            listing_row("acme/chat", name="Acme Chat"),
            listing_row("acme/solo:thinking", name="Solo (thinking)"),
            listing_row("acme/solo:extended", name="Solo (extended)"),
            listing_row("~acme/chat-latest"),
            listing_row("openrouter/auto"),
        ]
        for ordering in (rows, list(reversed(rows))):
            routes = eligible_routes(ordering)
            self.assertEqual(["acme/chat", "acme/solo"], sorted(routes))
            self.assertEqual("Acme Chat", routes["acme/chat"].name)
            self.assertEqual("Solo (extended)", routes["acme/solo"].name)

    def test_a_repeated_listed_id_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "repeats the id"):
            eligible_routes([listing_row("acme/chat"), listing_row("acme/chat")])


class MatchingTests(unittest.TestCase):
    def test_author_aliases_translate_only_the_author_segment(self) -> None:
        self.assertEqual(
            "alibaba/qwen3-coder-next", with_models_dev_author("qwen/qwen3-coder-next")
        )
        self.assertEqual(
            "meta/llama-3.3", with_models_dev_author("Meta-Llama/llama-3.3")
        )
        self.assertEqual("acme/qwen/x", with_models_dev_author("acme/qwen/x"))

    def test_url_keys_come_only_from_model_pages(self) -> None:
        self.assertEqual(
            "qwen/qwen3-32b", hugging_face_repo("https://huggingface.co/Qwen/Qwen3-32B")
        )
        self.assertEqual(
            "qwen/qwen3-32b",
            hugging_face_repo("https://hf.co/Qwen/Qwen3-32B/tree/main?x=1"),
        )
        for url in (
            "https://huggingface.co/datasets/acme/corpus",
            "https://huggingface.co/spaces/acme/demo",
            "https://huggingface.co/Qwen",
            "http://huggingface.co/Qwen/Qwen3-32B",
            "https://huggingface.co.attacker.invalid/Qwen/Qwen3-32B",
        ):
            with self.subTest(url):
                self.assertIsNone(hugging_face_repo(url))
        self.assertEqual(
            "poolside/laguna-s-2.1",
            openrouter_route(
                "https://www.openrouter.ai/poolside/laguna-s-2.1/providers"
            ),
        )
        self.assertIsNone(openrouter_route("https://openrouter.ai/docs"))
        self.assertIsNone(openrouter_route("https://example.com/poolside/laguna"))

    def test_every_exact_key_marks_a_route_as_represented(self) -> None:
        index = atlas_index(
            [
                {
                    "id": "model-alibaba-qwen3-coder-next",
                    "source_id": "alibaba/qwen3-coder-next",
                    "source_metadata": {
                        "links": [],
                        "weights": [
                            {"url": "https://huggingface.co/Qwen/Qwen3-Coder-480B"}
                        ],
                    },
                },
                {"id": "model-anthropic-claude-sonnet-4-5", "source_id": "x/y"},
            ],
            [
                {
                    "id": "model-alibaba-qwen3-max-thinking",
                    "source_id": None,
                    "url": "https://qwen.ai/qwen3-max",
                    "source_metadata": {"links": [], "weights": []},
                    "evidence": [
                        {"url": "https://openrouter.ai/arcee-ai/trinity-mini"}
                    ],
                },
                {"id": "model-vendor-model-2026-01-01", "source_id": None},
            ],
        )
        represented = {
            "author alias": ("qwen/qwen3-coder-next", route("qwen/qwen3-coder-next")),
            "dots and hyphens": (
                "anthropic/claude-sonnet-4.5",
                route("anthropic/claude-sonnet-4.5"),
            ),
            "null-source review": (
                "qwen/qwen3-max-thinking",
                route("qwen/qwen3-max-thinking"),
            ),
            "canonical slug": (
                "vendor/model",
                route("vendor/model", canonical_slug="vendor/model-2026-01-01"),
            ),
            "hugging face weights": (
                "qwen/qwen3-coder",
                route("qwen/qwen3-coder", hugging_face_id="qwen/qwen3-coder-480B"),
            ),
            "openrouter evidence": (
                "arcee-ai/trinity-mini",
                route("arcee-ai/trinity-mini"),
            ),
        }
        for label, (route_id, identity) in represented.items():
            with self.subTest(label):
                self.assertTrue(index.represents(route_id, identity))
        self.assertFalse(
            index.represents("nousresearch/hermes-4", route("nousresearch/hermes-4"))
        )

    def test_a_hugging_face_link_in_evidence_does_not_represent_that_repo(
        self,
    ) -> None:
        """Evidence cites base models (Aikido Altar-1 cites GLM-5.3), not the release."""
        finetune = {
            "id": "model-acme-finetune",
            "source_id": None,
            "url": "https://acme.example/finetune",
            "source_metadata": {"links": [], "weights": []},
            "evidence": [{"url": "https://huggingface.co/base-org/Base-Model"}],
        }
        base = route("base-org/base-model", hugging_face_id="base-org/Base-Model")

        self.assertFalse(atlas_index([], [finetune]).represents("base/model", base))
        finetune["source_metadata"]["weights"] = [
            {"url": "https://huggingface.co/base-org/Base-Model"}
        ]
        self.assertTrue(atlas_index([], [finetune]).represents("base/model", base))

    def test_the_committed_catalog_indexes_every_source_row_and_review(self) -> None:
        source_rows = json.loads(
            (ROOT / "directory" / "models-dev.json").read_text(encoding="utf-8")
        )["models"]
        reviewed = json.loads(
            (ROOT / "directory" / "models.json").read_text(encoding="utf-8")
        )["models"]
        index = atlas_index(source_rows, reviewed)

        self.assertTrue({row["id"] for row in source_rows} <= index.model_ids)
        self.assertTrue({record["id"] for record in reviewed} <= index.model_ids)
        # Cited in the reviewed Poolside record as exact-model hosting evidence.
        self.assertTrue(
            index.represents("poolside/laguna-s-2.1", route("poolside/laguna-s-2.1"))
        )


class DocumentTests(unittest.TestCase):
    def build(
        self,
        rows: list[dict[str, Any]],
        *,
        existing: dict[str, Any] | None = None,
        index: AtlasIndex = EMPTY_INDEX,
        dispositioned: set[str] | None = None,
        filler: int = MIN_LISTED_ROWS,
    ) -> ImportResult:
        return build_document(
            listing(rows, filler=filler),
            observed_at="2026-09-24",
            existing=existing or unfetched_document("2026-09-20"),
            index=index,
            dispositioned_routes=dispositioned or set(),
        )

    def test_leads_carry_identifiers_and_never_prices_prose_or_rankings(self) -> None:
        body = listing([listing_row("acme/chat", hugging_face_id="Acme/Chat-7B")])
        result = build_document(
            body,
            observed_at="2026-09-24",
            existing=unfetched_document("2026-09-20"),
            index=EMPTY_INDEX,
            dispositioned_routes=set(),
        )
        document = result.document

        self.assertEqual(
            {
                "name": "OpenRouter",
                "url": "https://openrouter.ai/api/v1/models",
                "terms_url": "https://openrouter.ai/terms",
                "fetched_at": "2026-09-24",
                "sha256": hashlib.sha256(body).hexdigest(),
            },
            document["source"],
        )
        self.assertEqual(MIN_LISTED_ROWS + 1, document["listed_count"])
        for lead in document["leads"]:
            self.assertEqual(set(LEAD_FIELDS), set(lead))
        self.assertEqual(
            {
                "openrouter_id": "acme/chat",
                "canonical_slug": "acme/chat",
                "name": "Example: acme/chat",
                "hugging_face_id": "Acme/Chat-7B",
                "listed_at": "2025-06-15",
                "discovered_at": "2026-09-24",
                "last_seen_at": "2026-09-24",
            },
            document["leads"][0],
        )
        serialized = json.dumps(document)
        for dropped in (
            "Marketing prose",
            "0.0000011",
            "pricing",
            "1385.2",
            "benchmarks",
            "max_completion_tokens",
            "temperature",
            "/endpoints",
        ):
            self.assertNotIn(dropped, serialized)

    def test_leads_are_sorted_and_exclude_represented_and_dispositioned_routes(
        self,
    ) -> None:
        index = AtlasIndex(frozenset({"model-acme-known"}), frozenset(), frozenset())
        result = self.build(
            [
                listing_row("acme/zeta"),
                listing_row("acme/known"),
                listing_row("acme/held"),
                listing_row("acme/alpha"),
            ],
            index=index,
            dispositioned={"acme/held", "acme/known", "acme/gone"},
            filler=MIN_LISTED_ROWS - 4,
        )
        leads = [lead["openrouter_id"] for lead in result.document["leads"]]

        self.assertEqual(["acme/alpha", "acme/zeta"], leads[:2])
        self.assertNotIn("acme/known", leads)
        self.assertNotIn("acme/held", leads)
        self.assertEqual(sorted(leads), leads)
        self.assertEqual(1, result.represented)
        self.assertEqual(1, result.dispositioned)
        # A disposition is prunable once its route is gone or represented.
        self.assertEqual(["acme/gone", "acme/known"], result.prunable_dispositions)

    def test_discovery_dates_survive_later_imports(self) -> None:
        existing = unfetched_document("2026-09-17")
        existing["eligible_count"] = MIN_LISTED_ROWS + 1
        existing["leads"] = [
            {"openrouter_id": "acme/chat", "discovered_at": "2026-09-17"}
        ]
        lead = self.build([listing_row("acme/chat")], existing=existing).document[
            "leads"
        ][0]

        self.assertEqual("2026-09-17", lead["discovered_at"])
        self.assertEqual("2026-09-24", lead["last_seen_at"])

    def test_a_sharp_drop_in_eligible_routes_fails_closed(self) -> None:
        existing = unfetched_document("2026-09-17")
        existing["eligible_count"] = 1000
        with self.assertRaisesRegex(ValueError, "shrank"):
            self.build([], existing=existing)
        existing["eligible_count"] = True  # bool is not a count
        self.assertEqual(
            MIN_LISTED_ROWS,
            self.build([], existing=existing).document["eligible_count"],
        )


class RunTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.write("models-dev.json", {"models": []})
        self.write("models.json", {"models": []})
        self.write(LEADS_NAME, unfetched_document("2026-09-20"))
        self.review_terms("2026-09-23")

    def write(self, name: str, value: dict[str, Any]) -> None:
        (self.directory / name).write_text(
            json.dumps(value, indent=2) + "\n", encoding="utf-8"
        )

    def read(self, name: str) -> dict[str, Any]:
        return json.loads((self.directory / name).read_text(encoding="utf-8"))

    def review_terms(
        self, reviewed_at: object, dispositions: list[dict[str, Any]] | None = None
    ) -> None:
        self.write(
            DISPOSITIONS_NAME,
            {
                "version": "1.0",
                "updated_at": "2026-09-23",
                "terms_reviewed_at": reviewed_at,
                "dispositions": dispositions or [],
            },
        )

    def fail_if_called(self, url: str) -> bytes:
        raise AssertionError(f"no request may be made without a terms review: {url}")

    def test_without_a_terms_review_nothing_is_requested_or_written(self) -> None:
        self.review_terms(None)
        before = (self.directory / LEADS_NAME).read_bytes()

        result = run(self.fail_if_called, directory=self.directory)

        self.assertEqual(Skipped(cleared=False), result)
        self.assertEqual(before, (self.directory / LEADS_NAME).read_bytes())

    def test_a_checkout_without_either_file_is_an_unreviewed_one(self) -> None:
        (self.directory / LEADS_NAME).unlink()
        (self.directory / DISPOSITIONS_NAME).unlink()

        result = run(self.fail_if_called, directory=self.directory)

        self.assertEqual(Skipped(cleared=False), result)
        self.assertFalse((self.directory / LEADS_NAME).exists())

    def test_withdrawing_the_terms_review_clears_stored_leads_without_a_request(
        self,
    ) -> None:
        run(
            lambda _url: listing([listing_row("acme/chat")]),
            directory=self.directory,
            observed_at="2026-09-23",
        )
        self.assertTrue(self.read(LEADS_NAME)["leads"])
        self.review_terms(None)

        result = run(
            self.fail_if_called, directory=self.directory, observed_at="2026-09-24"
        )

        self.assertEqual(Skipped(cleared=True), result)
        self.assertEqual(unfetched_document("2026-09-24"), self.read(LEADS_NAME))

    def test_an_invalid_terms_review_date_fails_closed(self) -> None:
        for value in ("yes", "20260923", "2026-02-30", 20260923):
            with self.subTest(value=value):
                self.review_terms(value)
                with self.assertRaisesRegex(ValueError, "terms_reviewed_at"):
                    run(self.fail_if_called, directory=self.directory)

    def test_an_import_writes_leads_against_the_catalog_and_dispositions(
        self,
    ) -> None:
        self.write(
            "models-dev.json",
            {
                "models": [
                    {
                        "id": "model-alibaba-qwen3-coder-next",
                        "source_id": "alibaba/qwen3-coder-next",
                        "source_metadata": {"links": [], "weights": []},
                    }
                ]
            },
        )
        self.review_terms(
            "2026-09-23",
            [
                {
                    "openrouter_id": "thedrummer/cydonia-24b",
                    "disposition": "excluded",
                    "reason": "A roleplay fine-tune without a release page.",
                    "decided_at": "2026-09-23",
                }
            ],
        )
        requested: list[str] = []

        def getter(url: str) -> bytes:
            requested.append(url)
            return listing(
                [
                    listing_row("qwen/qwen3-coder-next"),
                    listing_row("thedrummer/cydonia-24b"),
                    listing_row("nousresearch/hermes-4-405b"),
                ]
            )

        result = run(getter, directory=self.directory, observed_at="2026-09-24")

        self.assertEqual([ENDPOINT], requested)
        self.assertIsInstance(result, ImportResult)
        self.assertEqual(result.document, self.read(LEADS_NAME))
        leads = {lead["openrouter_id"] for lead in result.document["leads"]}
        self.assertIn("nousresearch/hermes-4-405b", leads)
        self.assertNotIn("qwen/qwen3-coder-next", leads)
        self.assertNotIn("thedrummer/cydonia-24b", leads)

    def test_a_failed_import_leaves_the_leads_file_untouched(self) -> None:
        before = (self.directory / LEADS_NAME).read_bytes()
        for body in (b"not json", listing([], filler=3)):
            with (
                self.subTest(body=body[:20]),
                self.assertRaises(ValueError),
            ):
                run(lambda _url, body=body: body, directory=self.directory)
            self.assertEqual(before, (self.directory / LEADS_NAME).read_bytes())

    def test_atomic_write_removes_its_temporary_file_on_failure(self) -> None:
        path = self.directory / LEADS_NAME
        before = path.read_bytes()
        with (
            patch.object(import_openrouter.os, "replace", side_effect=OSError("disk")),
            self.assertRaises(OSError),
        ):
            write_json_atomic(path, {"version": "2.0"})

        self.assertEqual(before, path.read_bytes())
        self.assertEqual([path], list(self.directory.glob(f"*{LEADS_NAME}*")))

    def test_atomic_write_keeps_the_mode_mkstemp_would_narrow(self) -> None:
        path = self.directory / LEADS_NAME
        path.chmod(0o640)
        write_json_atomic(path, unfetched_document("2026-09-24"))
        self.assertEqual(0o640, stat.S_IMODE(path.stat().st_mode))

        created = self.directory / "created.json"
        write_json_atomic(created, {})
        self.assertEqual(0o644, stat.S_IMODE(created.stat().st_mode))


class MainTests(unittest.TestCase):
    def main_output(self, result: object) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        side_effect = result if isinstance(result, Exception) else None
        with (
            patch.object(
                import_openrouter, "run", return_value=result, side_effect=side_effect
            ),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            code = import_openrouter.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def test_main_reports_a_skip_as_success(self) -> None:
        code, stdout, _stderr = self.main_output(Skipped(cleared=False))
        self.assertEqual(0, code)
        self.assertIn("skipped without a request:", stdout)
        self.assertIn("terms_reviewed_at", stdout)

        _code, stdout, _stderr = self.main_output(Skipped(cleared=True))
        self.assertIn("cleared the stored leads", stdout)

    def test_main_reports_a_failure_without_changing_the_leads(self) -> None:
        code, _stdout, stderr = self.main_output(ValueError("bounds"))
        self.assertEqual(1, code)
        self.assertIn("failed without changing the leads: bounds", stderr)

    def test_main_summarizes_an_import_and_prunable_dispositions(self) -> None:
        document = unfetched_document("2026-09-24")
        document.update(
            {
                "source": import_openrouter.source_descriptor(b"{}", "2026-09-24"),
                "listed_count": 446,
                "eligible_count": 430,
                "leads": [{"openrouter_id": "acme/chat"}],
            }
        )
        code, stdout, _stderr = self.main_output(
            ImportResult(document, 400, 29, ["acme/gone"])
        )

        self.assertEqual(0, code)
        self.assertIn(
            "staged 1 OpenRouter model leads from 430 eligible routes", stdout
        )
        self.assertIn("400 already represented in Atlas, 29 dispositioned", stdout)
        self.assertIn("prunable OpenRouter disposition: acme/gone", stdout)


if __name__ == "__main__":
    unittest.main()
