#!/usr/bin/env python3
"""Import provider-independent models.dev metadata into a source snapshot and queue.

The importer owns discovery facts only. It publishes the complete attributed
source snapshot separately from the Atlas's reviewed model collection and
maintains the unpublished review queue. It never creates or edits the Atlas's
model classification, licence conclusion, score, prose, evidence, or editorial
verification date. Published model records are removed from the candidate view
but otherwise untouched.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
import tarfile
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
CANDIDATES_PATH = DIRECTORY / "model-candidates.json"
MODELS_PATH = DIRECTORY / "models.json"
SOURCE_MODELS_PATH = DIRECTORY / "models-dev.json"

UPSTREAM_REPO = "anomalyco/models.dev"
UPSTREAM_REF = "dev"
UPSTREAM_LICENSE = "MIT"
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MIN_SOURCE_RECORDS = 100
MAX_SOURCE_RECORDS = 20_000
MIN_PREVIOUS_RATIO = 0.80
SOURCE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*")
PARTIAL_DATE = re.compile(r"\d{4}-\d{2}(?:-\d{2})?")

JsonGetter = Callable[[str, str | None], tuple[Any, bytes]]
BytesGetter = Callable[[str, str | None], bytes]


def today() -> str:
    return datetime.now(UTC).date().isoformat()


def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_json(url: str, token: str | None) -> tuple[Any, bytes]:
    parsed = urllib.parse.urlsplit(url)
    is_api_url = (
        parsed.scheme == "https"
        and parsed.netloc == "api.github.com"
        and parsed.path.startswith(f"/repos/{UPSTREAM_REPO}/")
    )
    is_raw_url = (
        parsed.scheme == "https"
        and parsed.netloc == "raw.githubusercontent.com"
        and parsed.path.startswith(f"/{UPSTREAM_REPO}/")
    )
    if parsed.fragment or not (is_api_url or is_raw_url):
        raise ValueError("models.dev import URL is outside the fixed HTTPS allowlist")
    headers = {
        "Accept": "application/vnd.github+json" if is_api_url else "application/json",
        "User-Agent": "ai-systems-atlas-model-importer/1.0",
    }
    if token and is_api_url:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(MAX_SOURCE_BYTES + 1)
        if len(body) > MAX_SOURCE_BYTES:
            raise ValueError("models.dev source exceeds the configured size limit")
        return json.loads(body), body


def get_bytes(url: str, token: str | None) -> bytes:
    parsed = urllib.parse.urlsplit(url)
    is_archive_url = (
        parsed.scheme == "https"
        and parsed.netloc == "codeload.github.com"
        and parsed.path.startswith(f"/{UPSTREAM_REPO}/tar.gz/")
    )
    if parsed.query or parsed.fragment or not is_archive_url:
        raise ValueError("models.dev archive URL is outside the fixed HTTPS allowlist")
    headers = {"User-Agent": "ai-systems-atlas-model-importer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(MAX_SOURCE_BYTES + 1)
        if len(body) > MAX_SOURCE_BYTES:
            raise ValueError("models.dev source exceeds the configured size limit")
        return body


def catalog_from_archive(body: bytes, commit: str) -> dict[str, dict[str, Any]]:
    """Read only provider-independent model TOMLs from a pinned repository archive."""
    prefix = f"models.dev-{commit}/models/"
    catalog: dict[str, dict[str, Any]] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as archive:
            for member in archive.getmembers():
                if not member.isfile() or not member.name.startswith(prefix) or not member.name.endswith(".toml"):
                    continue
                if member.size > 256 * 1024:
                    raise ValueError(f"models.dev model metadata file is unexpectedly large: {member.name}")
                relative = member.name[len(prefix):-5]
                if not SOURCE_ID.fullmatch(relative) or relative in catalog:
                    raise ValueError(f"models.dev archive contains an invalid or duplicate model path: {relative!r}")
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise ValueError(f"models.dev archive member could not be read: {member.name}")
                try:
                    record = tomllib.loads(extracted.read().decode("utf-8"))
                except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
                    raise ValueError(f"models.dev metadata is invalid TOML: {member.name}") from error
                record["id"] = relative
                catalog[relative] = record
    except tarfile.TarError as error:
        raise ValueError("models.dev source is not a valid tar archive") from error
    return catalog


def stable_model_id(source_id: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", source_id.lower()).strip("-")
    if not slug:
        raise ValueError(f"models.dev source id has no slug characters: {source_id!r}")
    return f"model-{slug}"


def optional_date(value: object, field: str, source_id: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not PARTIAL_DATE.fullmatch(value):
        raise ValueError(f"{source_id}: {field} must be YYYY-MM or YYYY-MM-DD")
    return value


def optional_bool(value: object, field: str, source_id: str) -> bool | None:
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ValueError(f"{source_id}: {field} must be boolean when present")
    return value


def clean_links(items: object, source_id: str, *, weights: bool = False) -> list[dict[str, str]]:
    if items is None:
        return []
    if not isinstance(items, list):
        raise ValueError(f"{source_id}: {'weights' if weights else 'links'} must be a list")
    result: list[dict[str, str]] = []
    allowed = {"label", "url", "format", "quantization"} if weights else {"label", "url", "type"}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
            raise ValueError(f"{source_id}: source links require HTTPS URLs")
        cleaned = {key: value for key, value in item.items() if key in allowed and isinstance(value, str)}
        result.append(cleaned)
    return result


def source_metadata(source_id: str, record: dict[str, Any]) -> dict[str, Any]:
    if record.get("id") != source_id:
        raise ValueError(f"{source_id}: embedded id does not match the catalog key")
    name = record.get("name")
    description = record.get("description")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{source_id}: name is required")
    if description is not None and (not isinstance(description, str) or not description.strip()):
        raise ValueError(f"{source_id}: description must be a non-empty string when present")
    modalities = record.get("modalities")
    if not isinstance(modalities, dict):
        raise ValueError(f"{source_id}: modalities must be an object")
    inputs, outputs = modalities.get("input"), modalities.get("output")
    known_modalities = {"text", "image", "audio", "video", "pdf"}
    if not isinstance(inputs, list) or not isinstance(outputs, list):
        raise ValueError(f"{source_id}: modality input and output must be lists")
    if any(item not in known_modalities for item in [*inputs, *outputs]):
        raise ValueError(f"{source_id}: unknown modality")
    limits = record.get("limit")
    if not isinstance(limits, dict):
        raise ValueError(f"{source_id}: limit must be an object")
    cleaned_limits: dict[str, int | None] = {}
    for field in ("context", "input", "output"):
        value = limits.get(field)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 0):
            raise ValueError(f"{source_id}: limit.{field} must be a non-negative integer")
        cleaned_limits[field] = value
    family = record.get("family")
    license_name = record.get("license")
    if family is not None and not isinstance(family, str):
        raise ValueError(f"{source_id}: family must be a string when present")
    if license_name is not None and not isinstance(license_name, str):
        raise ValueError(f"{source_id}: license must be a string when present")
    return {
        "name": name,
        "description": description,
        "family": family,
        "release_date": optional_date(record.get("release_date"), "release_date", source_id),
        "last_updated": optional_date(record.get("last_updated"), "last_updated", source_id),
        "knowledge_cutoff": optional_date(record.get("knowledge"), "knowledge", source_id),
        "modalities": {"input": inputs, "output": outputs},
        "capabilities": {
            field: optional_bool(record.get(field), field, source_id)
            for field in ("attachment", "reasoning", "tool_call", "structured_output", "temperature")
        },
        "limits": cleaned_limits,
        "reported_open_weights": optional_bool(record.get("open_weights"), "open_weights", source_id),
        "reported_license": license_name,
        "links": clean_links(record.get("links"), source_id),
        "weights": clean_links(record.get("weights"), source_id, weights=True),
    }


def normalize_catalog(
    catalog: object,
    *,
    observed_at: str,
    existing: dict[str, Any] | None = None,
    published_source_ids: set[str] | None = None,
    minimum_records: int = MIN_SOURCE_RECORDS,
) -> tuple[list[dict[str, Any]], int]:
    if not isinstance(catalog, dict):
        raise ValueError("models.dev catalog must be an object keyed by source id")
    if not minimum_records <= len(catalog) <= MAX_SOURCE_RECORDS:
        raise ValueError("models.dev source record count is outside the fail-closed bounds")
    previous = {
        item.get("source_id"): item
        for item in (existing or {}).get("candidates", [])
        if isinstance(item, dict) and isinstance(item.get("source_id"), str)
    }
    published_source_ids = published_source_ids or set()
    candidates: list[dict[str, Any]] = []
    ids: dict[str, str] = {}
    eligible = 0
    for source_id, record in catalog.items():
        if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id) or not isinstance(record, dict):
            raise ValueError("models.dev records require path-style ids and object values")
        metadata = source_metadata(source_id, record)
        if "text" not in metadata["modalities"]["output"]:
            continue
        eligible += 1
        record_id = stable_model_id(source_id)
        if record_id in ids and ids[record_id] != source_id:
            raise ValueError(f"models.dev ids {ids[record_id]!r} and {source_id!r} collide as {record_id!r}")
        ids[record_id] = source_id
        if source_id in published_source_ids:
            continue
        prior = previous.get(source_id, {})
        candidates.append({
            "id": record_id,
            "source_id": source_id,
            "source_metadata": metadata,
            "status": "provisional",
            "discovered_at": prior.get("discovered_at", observed_at),
            "last_seen_at": observed_at,
            "review_required": [
                "official_identity",
                "model_boundary",
                "license_evidence",
                "source_model",
                "model_access_score",
            ],
        })
    candidates.sort(key=lambda item: item["source_id"])
    return candidates, eligible


def normalize_source_catalog(
    catalog: object,
    *,
    minimum_records: int = MIN_SOURCE_RECORDS,
) -> list[dict[str, Any]]:
    """Preserve every provider-independent source record without editorial fields."""
    if not isinstance(catalog, dict):
        raise ValueError("models.dev catalog must be an object keyed by source id")
    if not minimum_records <= len(catalog) <= MAX_SOURCE_RECORDS:
        raise ValueError("models.dev source record count is outside the fail-closed bounds")
    records: list[dict[str, Any]] = []
    ids: dict[str, str] = {}
    for source_id, record in catalog.items():
        if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id) or not isinstance(record, dict):
            raise ValueError("models.dev records require path-style ids and object values")
        record_id = stable_model_id(source_id)
        if record_id in ids and ids[record_id] != source_id:
            raise ValueError(f"models.dev ids {ids[record_id]!r} and {source_id!r} collide as {record_id!r}")
        ids[record_id] = source_id
        records.append({
            "id": record_id,
            "source_id": source_id,
            "source_metadata": source_metadata(source_id, record),
        })
    records.sort(key=lambda item: item["source_id"])
    return records


def source_descriptor(source_bytes: bytes, commit: str) -> dict[str, str]:
    return {
        "repo": UPSTREAM_REPO,
        "ref": UPSTREAM_REF,
        "commit": commit,
        "url": f"https://github.com/{UPSTREAM_REPO}",
        "immutable_url": f"https://codeload.github.com/{UPSTREAM_REPO}/tar.gz/{commit}",
        "path": "models/**/*.toml",
        "license": UPSTREAM_LICENSE,
        "sha256": hashlib.sha256(source_bytes).hexdigest(),
    }


def build_source_document(
    catalog: object,
    source_bytes: bytes,
    commit: str,
    *,
    observed_at: str,
    minimum_records: int = MIN_SOURCE_RECORDS,
) -> dict[str, Any]:
    records = normalize_source_catalog(catalog, minimum_records=minimum_records)
    return {
        "version": "1.0",
        "updated_at": observed_at,
        "source_record_count": len(records),
        "source": source_descriptor(source_bytes, commit),
        "models": records,
    }


def build_document(
    catalog: object,
    source_bytes: bytes,
    commit: str,
    *,
    observed_at: str,
    existing: dict[str, Any],
    published_source_ids: set[str],
    minimum_records: int = MIN_SOURCE_RECORDS,
) -> dict[str, Any]:
    candidates, eligible = normalize_catalog(
        catalog,
        observed_at=observed_at,
        existing=existing,
        published_source_ids=published_source_ids,
        minimum_records=minimum_records,
    )
    previous_count = existing.get("eligible_record_count")
    if isinstance(previous_count, int) and eligible < previous_count * MIN_PREVIOUS_RATIO:
        raise ValueError("models.dev eligible record count shrank beyond the fail-closed threshold")
    return {
        "version": "1.0",
        "updated_at": observed_at,
        "source_record_count": len(catalog) if isinstance(catalog, dict) else 0,
        "eligible_record_count": eligible,
        "source": source_descriptor(source_bytes, commit),
        "candidates": candidates,
    }


def run(
    getter: JsonGetter = get_json,
    archive_getter: BytesGetter = get_bytes,
    *,
    observed_at: str | None = None,
) -> dict[str, Any]:
    snapshot_date = observed_at or today()
    token = os.environ.get("GITHUB_TOKEN")
    commit_document, _ = getter(
        f"https://api.github.com/repos/{UPSTREAM_REPO}/commits/{UPSTREAM_REF}", token
    )
    if not isinstance(commit_document, dict) or not re.fullmatch(r"[0-9a-f]{40}", str(commit_document.get("sha", ""))):
        raise ValueError("models.dev commit lookup did not return a full Git SHA")
    commit = commit_document["sha"]
    archive_url = f"https://codeload.github.com/{UPSTREAM_REPO}/tar.gz/{commit}"
    source_bytes = archive_getter(archive_url, token)
    catalog = catalog_from_archive(source_bytes, commit)
    existing = load_json(CANDIDATES_PATH, {"candidates": []})
    published = load_json(MODELS_PATH, {"models": []})
    published_source_ids = {
        item.get("source_id") for item in published.get("models", [])
        if isinstance(item, dict) and isinstance(item.get("source_id"), str)
    }
    document = build_document(
        catalog,
        source_bytes,
        commit,
        observed_at=snapshot_date,
        existing=existing,
        published_source_ids=published_source_ids,
    )
    source_document = build_source_document(
        catalog,
        source_bytes,
        commit,
        observed_at=snapshot_date,
    )
    write_json(SOURCE_MODELS_PATH, source_document)
    write_json(CANDIDATES_PATH, document)
    return document


def main() -> int:
    try:
        document = run()
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        print(f"models.dev import failed without changing the queue: {exc}", file=sys.stderr)
        return 1
    print(
        f"staged {len(document['candidates'])} model candidates from "
        f"{document['eligible_record_count']} eligible models.dev records at {document['source']['commit'][:12]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
