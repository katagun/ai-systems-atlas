#!/usr/bin/env python3
"""Cross-check OpenRouter's public model list against Atlas and stage unpublished leads.

OpenRouter is a second automated discovery source for models, used only to surface
releases models.dev omits (ADR 039). The importer fetches the documented, keyless
`GET /api/v1/models` endpoint once, drops every row Atlas already represents, and
writes the rest to `directory/openrouter-model-leads.json` as pointers for the ADR 038
`init-gap` review path. It keeps identifiers only: never descriptions, prices,
benchmarks, rankings, latency, throughput, provider endpoints, parameters, or limits.
Nothing it writes is published, and it never creates or edits a reviewed model, a
models.dev row, a queue candidate, or a disposition.

It makes no request until a maintainer has read OpenRouter's terms and recorded
`terms_reviewed_at` in `directory/openrouter-model-dispositions.json`.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, NamedTuple

try:
    from .import_models_dev import stable_model_id
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from import_models_dev import stable_model_id

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
LEADS_NAME = "openrouter-model-leads.json"
DISPOSITIONS_NAME = "openrouter-model-dispositions.json"

SOURCE_NAME = "OpenRouter"
ENDPOINT = "https://openrouter.ai/api/v1/models"
TERMS_URL = "https://openrouter.ai/terms"
USER_AGENT = "ai-systems-atlas-openrouter-importer/1.0"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MIN_LISTED_ROWS = 100
MAX_LISTED_ROWS = 20_000
MIN_PREVIOUS_RATIO = 0.80

# A route is an OpenRouter model ID without its variant suffix: author/slug.
ROUTE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)+")
# A listed ID may add a `~` alias prefix or a `:variant` suffix to a route.
LISTED_ID = re.compile(rf"(~?)({ROUTE_ID.pattern})(?::[A-Za-z0-9._-]+)?")
HUGGING_FACE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*")
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f-\x9f]")
# Everything a lead may carry; validate_directory.py rejects any other field.
LEAD_FIELDS = (
    "openrouter_id",
    "canonical_slug",
    "name",
    "hugging_face_id",
    "listed_at",
    "discovered_at",
    "last_seen_at",
)

# OpenRouter author namespaces whose models.dev provider directory has another name.
# A missing entry costs a spurious lead, which a disposition closes; it never hides one,
# because the rest of the ID must still derive the same stable Atlas ID.
AUTHOR_ALIASES = {
    "ibm-granite": "ibm",
    "meta-llama": "meta",
    "mistralai": "mistral",
    "qwen": "alibaba",
    "sarvamai": "sarvam",
    "stepfun-ai": "stepfun",
    "thudm": "zhipuai",
    "x-ai": "xai",
    "z-ai": "zhipuai",
}
# OpenRouter's own namespaces, which name no developer: `openrouter/` holds its routers
# (and once held cloaked models), `stealth/` holds its stealth program's cloaked models.
EXCLUDED_AUTHORS = frozenset({"openrouter", "stealth"})
HUGGING_FACE_HOSTS = frozenset({"huggingface.co", "www.huggingface.co", "hf.co"})
HUGGING_FACE_NON_MODEL_PATHS = frozenset(
    {"api", "blog", "collections", "datasets", "docs", "papers", "spaces", "tasks"}
)
OPENROUTER_HOSTS = frozenset({"openrouter.ai", "www.openrouter.ai"})

ListingGetter = Callable[[str], bytes]


class Route(NamedTuple):
    """The identity facts a lead keeps for one eligible OpenRouter route."""

    canonical_slug: str
    name: str
    hugging_face_id: str | None
    listed_at: str


@dataclass(frozen=True)
class AtlasIndex:
    """Exact keys under which Atlas already represents a release."""

    model_ids: frozenset[str]
    hugging_face_ids: frozenset[str]
    openrouter_routes: frozenset[str]

    def represents(self, route_id: str, route: Route) -> bool:
        keys = {
            stable_model_id(candidate)
            for value in (route_id, route.canonical_slug)
            for candidate in (value, with_models_dev_author(value))
        }
        return (
            bool(keys & self.model_ids)
            or (
                route.hugging_face_id is not None
                and route.hugging_face_id.lower() in self.hugging_face_ids
            )
            or route_id.lower() in self.openrouter_routes
            or route.canonical_slug.lower() in self.openrouter_routes
        )


class Skipped(NamedTuple):
    """No terms review is recorded; `cleared` says whether stored leads were removed."""

    cleared: bool


class _RefuseRedirects(urllib.request.HTTPRedirectHandler):
    """The endpoint is fixed; a redirect anywhere else is a reason to stop."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code, "OpenRouter import refuses redirects", headers, fp
        )


def today() -> str:
    return datetime.now(UTC).date().isoformat()


def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    """Replace `path` in one step, keeping its mode (mkstemp would leave 0600)."""
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    target_mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, target_mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def get_listing(url: str) -> bytes:
    """Fetch the fixed public endpoint: no key, no query, no redirects, bounded size."""
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "openrouter.ai"
        or parsed.path != "/api/v1/models"
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("OpenRouter import URL is outside the fixed HTTPS allowlist")
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}
    )
    opener = urllib.request.build_opener(_RefuseRedirects)
    with opener.open(request, timeout=30) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("OpenRouter model list exceeds the configured size limit")
    return body


def listing_rows(body: bytes) -> list[Any]:
    """Parse the response and refuse anything but one complete, bounded list."""
    try:
        document = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("OpenRouter model list is not valid UTF-8 JSON") from error
    if not isinstance(document, dict) or not isinstance(document.get("data"), list):
        raise ValueError("OpenRouter model list must be an object with a data list")
    rows = document["data"]
    total = document.get("total_count")
    if total is not None and (
        isinstance(total, bool) or not isinstance(total, int) or total != len(rows)
    ):
        raise ValueError(
            "OpenRouter model list total_count differs from the rows returned"
        )
    links = document.get("links")
    if links is not None and (
        not isinstance(links, dict) or links.get("next") is not None
    ):
        raise ValueError(
            "OpenRouter model list is paginated; the complete list was not returned"
        )
    if not MIN_LISTED_ROWS <= len(rows) <= MAX_LISTED_ROWS:
        raise ValueError(
            "OpenRouter listed-row count is outside the fail-closed bounds"
        )
    return rows


def listed_date(value: object, listed_id: str) -> str:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{listed_id}: created must be a non-negative Unix timestamp")
    try:
        return datetime.fromtimestamp(value, UTC).date().isoformat()
    except (OverflowError, OSError, ValueError) as error:
        raise ValueError(f"{listed_id}: created is out of range") from error


def listed_route(row: object) -> tuple[str, Route] | None:
    """(route ID, identity) for an eligible row, or None when a rule skips it.

    Rules apply only where OpenRouter states the fact itself: a `~` prefix or an
    `alias_target` marks a moving alias, OpenRouter's own `openrouter/` and `stealth/`
    namespaces name no developer, and the listed output modalities say whether the
    model outputs text.
    """
    if not isinstance(row, dict):
        raise ValueError("OpenRouter rows must be objects")
    listed_id = row.get("id")
    match = LISTED_ID.fullmatch(listed_id) if isinstance(listed_id, str) else None
    if match is None:
        raise ValueError(f"OpenRouter row has an invalid id: {listed_id!r}")
    alias_prefix, route_id = match.group(1), match.group(2)
    architecture = row.get("architecture")
    outputs = (
        architecture.get("output_modalities")
        if isinstance(architecture, dict)
        else None
    )
    if not isinstance(outputs, list) or not all(
        isinstance(item, str) for item in outputs
    ):
        raise ValueError(
            f"{listed_id}: architecture.output_modalities must be a list of strings"
        )
    if alias_prefix or row.get("alias_target") is not None:
        return None
    if route_id.split("/", 1)[0].lower() in EXCLUDED_AUTHORS:
        return None
    if "text" not in outputs:
        return None
    name = row.get("name")
    if not isinstance(name, str) or not name.strip() or CONTROL_CHARACTERS.search(name):
        raise ValueError(f"{listed_id}: name must be a non-empty single-line string")
    canonical_slug = row.get("canonical_slug")
    if not isinstance(canonical_slug, str) or not ROUTE_ID.fullmatch(canonical_slug):
        raise ValueError(f"{listed_id}: canonical_slug is invalid")
    hugging_face_id = row.get("hugging_face_id")
    if hugging_face_id == "":
        hugging_face_id = None
    if hugging_face_id is not None and (
        not isinstance(hugging_face_id, str)
        or not HUGGING_FACE_ID.fullmatch(hugging_face_id)
    ):
        raise ValueError(f"{listed_id}: hugging_face_id is invalid")
    return (
        route_id,
        Route(
            canonical_slug=canonical_slug,
            name=name,
            hugging_face_id=hugging_face_id,
            listed_at=listed_date(row.get("created"), listed_id),
        ),
    )


def eligible_routes(rows: Iterable[Any]) -> dict[str, Route]:
    """Fold variants into their route, preferring the unsuffixed row, deterministically."""
    chosen: dict[str, tuple[tuple[bool, str], Route]] = {}
    seen: set[str] = set()
    for row in rows:
        result = listed_route(row)
        listed_id = row["id"]  # listed_route has validated the row and its id
        if listed_id in seen:
            raise ValueError(f"OpenRouter model list repeats the id {listed_id!r}")
        seen.add(listed_id)
        if result is None:
            continue
        route_id, route = result
        preference = (listed_id != route_id, listed_id)
        current = chosen.get(route_id)
        if current is None or preference < current[0]:
            chosen[route_id] = (preference, route)
    return {route_id: route for route_id, (_preference, route) in chosen.items()}


def with_models_dev_author(route_id: str) -> str:
    author, rest = route_id.split("/", 1)
    return f"{AUTHOR_ALIASES.get(author.lower(), author)}/{rest}"


def https_urls(value: object) -> Iterator[str]:
    if isinstance(value, dict):
        for item in value.values():
            yield from https_urls(item)
    elif isinstance(value, list):
        for item in value:
            yield from https_urls(item)
    elif isinstance(value, str) and value.startswith("https://"):
        yield value


def url_path_head(url: str, hosts: frozenset[str]) -> list[str] | None:
    """The first two path segments of an HTTPS URL on one of `hosts`, else None."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc.lower() not in hosts:
        return None
    segments = [segment for segment in parsed.path.split("/") if segment]
    return segments[:2] if len(segments) >= 2 else None


def hugging_face_repo(url: str) -> str | None:
    head = url_path_head(url, HUGGING_FACE_HOSTS)
    if head is None or head[0].lower() in HUGGING_FACE_NON_MODEL_PATHS:
        return None
    return "/".join(head).lower()


def openrouter_route(url: str) -> str | None:
    head = url_path_head(url, OPENROUTER_HOSTS)
    return "/".join(head).lower() if head else None


def own_urls(item: dict[str, Any]) -> list[str]:
    """URLs that name the release itself: its own page, source links, and weights.

    Evidence is left out on purpose: it also cites base models and quantizations, so
    a Hugging Face link there would mark a different release as represented.
    """
    return [*https_urls(item.get("url")), *https_urls(item.get("source_metadata"))]


def atlas_index(source_rows: Iterable[Any], reviewed: Iterable[Any]) -> AtlasIndex:
    """Index models.dev rows and reviewed records by every exact key a route can match."""
    records = [item for item in [*source_rows, *reviewed] if isinstance(item, dict)]
    model_ids = {item["id"] for item in records if isinstance(item.get("id"), str)}
    model_ids |= {
        stable_model_id(item["source_id"])
        for item in records
        if isinstance(item.get("source_id"), str)
    }
    identity = [url for item in records for url in own_urls(item)]
    # A reviewed record cites an OpenRouter page only as hosting evidence for the exact
    # model (docs/MODELS.md), so for that host the evidence list is safe to read.
    cited = identity + [
        url for item in records for url in https_urls(item.get("evidence"))
    ]
    return AtlasIndex(
        model_ids=frozenset(model_ids),
        hugging_face_ids=frozenset(
            repo for url in identity if (repo := hugging_face_repo(url))
        ),
        openrouter_routes=frozenset(
            route for url in cited if (route := openrouter_route(url))
        ),
    )


def source_descriptor(body: bytes | None, fetched_at: str | None) -> dict[str, Any]:
    return {
        "name": SOURCE_NAME,
        "url": ENDPOINT,
        "terms_url": TERMS_URL,
        "fetched_at": fetched_at,
        "sha256": hashlib.sha256(body).hexdigest() if body is not None else None,
    }


def unfetched_document(observed_at: str) -> dict[str, Any]:
    """The state before any import, or after a terms review is withdrawn."""
    return {
        "version": "1.0",
        "updated_at": observed_at,
        "source": source_descriptor(None, None),
        "listed_count": None,
        "eligible_count": None,
        "leads": [],
    }


class ImportResult(NamedTuple):
    document: dict[str, Any]
    represented: int
    dispositioned: int
    prunable_dispositions: list[str]


def build_document(
    body: bytes,
    *,
    observed_at: str,
    existing: dict[str, Any],
    index: AtlasIndex,
    dispositioned_routes: set[str],
) -> ImportResult:
    rows = listing_rows(body)
    routes = eligible_routes(rows)
    previous_eligible = existing.get("eligible_count")
    if (
        isinstance(previous_eligible, int)
        and not isinstance(previous_eligible, bool)
        and len(routes) < previous_eligible * MIN_PREVIOUS_RATIO
    ):
        raise ValueError(
            "OpenRouter eligible route count shrank beyond the fail-closed threshold"
        )
    previous = {
        item["openrouter_id"]: item
        for item in existing.get("leads") or []
        if isinstance(item, dict) and isinstance(item.get("openrouter_id"), str)
    }
    leads: list[dict[str, Any]] = []
    represented = 0
    dispositioned = 0
    unrepresented: set[str] = set()
    for route_id, route in sorted(routes.items()):
        if index.represents(route_id, route):
            represented += 1
            continue
        unrepresented.add(route_id)
        if route_id in dispositioned_routes:
            dispositioned += 1
            continue
        leads.append(
            {
                "openrouter_id": route_id,
                "canonical_slug": route.canonical_slug,
                "name": route.name,
                "hugging_face_id": route.hugging_face_id,
                "listed_at": route.listed_at,
                "discovered_at": previous.get(route_id, {}).get(
                    "discovered_at", observed_at
                ),
                "last_seen_at": observed_at,
            }
        )
    document = {
        "version": "1.0",
        "updated_at": observed_at,
        "source": source_descriptor(body, observed_at),
        "listed_count": len(rows),
        "eligible_count": len(routes),
        "leads": leads,
    }
    return ImportResult(
        document,
        represented,
        dispositioned,
        sorted(dispositioned_routes - unrepresented),
    )


def recorded_terms_review(dispositions: dict[str, Any]) -> str | None:
    value = dispositions.get("terms_reviewed_at")
    if value is None:
        return None
    message = f"{DISPOSITIONS_NAME}: terms_reviewed_at must be an ISO date or null"
    if not isinstance(value, str):
        raise ValueError(message)
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(message) from error
    if parsed.isoformat() != value:
        raise ValueError(message)
    return value


def run(
    getter: ListingGetter = get_listing,
    *,
    directory: Path = DIRECTORY,
    observed_at: str | None = None,
) -> ImportResult | Skipped:
    """Import and write the leads, or skip without a request when no terms review is recorded."""
    snapshot_date = observed_at or today()
    leads_path = directory / LEADS_NAME
    existing = load_json(leads_path, unfetched_document(snapshot_date))
    dispositions = load_json(
        directory / DISPOSITIONS_NAME, {"terms_reviewed_at": None, "dispositions": []}
    )
    if recorded_terms_review(dispositions) is None:
        source = existing.get("source")
        stored = isinstance(source, dict) and source.get("fetched_at") is not None
        if stored:
            write_json_atomic(leads_path, unfetched_document(snapshot_date))
        return Skipped(cleared=stored)
    dispositioned_routes = {
        item["openrouter_id"]
        for item in dispositions.get("dispositions") or []
        if isinstance(item, dict) and isinstance(item.get("openrouter_id"), str)
    }
    index = atlas_index(
        load_json(directory / "models-dev.json", {"models": []}).get("models") or [],
        load_json(directory / "models.json", {"models": []}).get("models") or [],
    )
    result = build_document(
        getter(ENDPOINT),
        observed_at=snapshot_date,
        existing=existing,
        index=index,
        dispositioned_routes=dispositioned_routes,
    )
    write_json_atomic(leads_path, result.document)
    return result


def main() -> int:
    try:
        result = run()
    except (OSError, ValueError, urllib.error.URLError) as exc:
        print(
            f"OpenRouter import failed without changing the leads: {exc}",
            file=sys.stderr,
        )
        return 1
    if isinstance(result, Skipped):
        cleared = " and cleared the stored leads" if result.cleared else ""
        print(
            f"OpenRouter import skipped without a request{cleared}: no terms review is "
            f"recorded. Read {TERMS_URL}, then set terms_reviewed_at in "
            f"directory/{DISPOSITIONS_NAME} (docs/MODELS.md, ADR 039)."
        )
        return 0
    document = result.document
    print(
        f"staged {len(document['leads'])} OpenRouter model leads from "
        f"{document['eligible_count']} eligible routes ({document['listed_count']} listed, "
        f"sha256 {document['source']['sha256'][:12]}); {result.represented} already "
        f"represented in Atlas, {result.dispositioned} dispositioned"
    )
    for route_id in result.prunable_dispositions:
        print(
            f"prunable OpenRouter disposition: {route_id} is no longer listed or is now represented"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
