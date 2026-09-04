#!/usr/bin/env python3
"""Gather pinned, verifiable evidence for queued candidates.

This script makes no editorial judgment. It fetches and records; a human, or a
routine acting under docs/adr/023, decides what the evidence means.
"""
from __future__ import annotations

import base64
import hashlib
from typing import Any

try:
    from .update_directory import GitHubGetter
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from update_directory import GitHubGetter

ROOT_KEYS = ("repo", "url")


def candidate_key(candidate: dict[str, Any]) -> str:
    """Identify a candidate the same way the updater's queue does."""
    return str(candidate.get("repo") or candidate.get("url") or "").lower()


def select_candidates(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Return untriaged candidates, oldest discovery first, at most `limit`."""
    pending = [item for item in candidates if "triage" not in item]
    pending.sort(key=lambda item: str(item.get("discovered_at") or ""))
    return pending[:limit]


def carry_forward(candidates: list[dict[str, Any]], previous: list[dict[str, Any]]) -> int:
    """Copy triage blocks from a previous unmerged run onto candidates that lack one."""
    prior = {
        candidate_key(item): item["triage"] for item in previous if isinstance(item.get("triage"), dict)
    }
    carried = 0
    for item in candidates:
        block = prior.get(candidate_key(item))
        if block is not None and "triage" not in item:
            item["triage"] = block
            carried += 1
    return carried


CLASS_SIGNALS = {
    "awesome list": ("awesome-", "awesome ", "curated list"),
    "benchmark": ("benchmark", "eval suite", "evaluation suite", "leaderboard"),
    "dataset": ("dataset", "corpus"),
    "course or tutorial": ("tutorial", "course", "learning path", "roadmap"),
    "paper or research artifact": ("official implementation of", "paper implementation"),
}


def cross_collection_hits(
    candidate: dict[str, Any], catalog: dict[str, list[dict[str, Any]]]
) -> list[str]:
    """Report every collection that already holds this repository, id, or URL."""
    key = candidate_key(candidate)
    url = str(candidate.get("url") or "").lower().rstrip("/")
    hits: list[str] = []
    for name, records in sorted(catalog.items()):
        for record in records:
            values = {
                str(record.get(field) or "").lower().rstrip("/")
                for field in ("repo", "id", "url")
            }
            if key and key in values:
                hits.append(f"{name}: already holds {key}")
            elif url and url in values:
                hits.append(f"{name}: already holds {url}")
    return hits


def class_signals(candidate: dict[str, Any]) -> list[str]:
    """Flag obvious non-operational classes visible in the queued record itself."""
    haystack = " ".join([
        str(candidate.get("name") or ""),
        str(candidate.get("description") or ""),
        " ".join(candidate.get("topics") or []),
    ]).lower()
    return [name for name, terms in CLASS_SIGNALS.items() if any(term in haystack for term in terms)]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _decode(payload: dict[str, Any]) -> str:
    if payload.get("encoding") == "base64":
        return base64.b64decode(payload.get("content") or "").decode("utf-8", "replace")
    return str(payload.get("content") or "")


def fetch_candidate_evidence(
    candidate: dict[str, Any], getter: GitHubGetter, token: str | None, today: str
) -> dict[str, Any]:
    """Fetch and hash a candidate's licence and README. Failures are recorded, never raised."""
    repo = candidate.get("repo")
    bundle: dict[str, Any] = {"repo": repo, "documents": [], "errors": []}
    if not repo:
        bundle["errors"].append("candidate has no GitHub repository")
        return bundle
    for label, path in (("LICENSE", f"/repos/{repo}/license"), ("README", f"/repos/{repo}/readme")):
        try:
            payload = getter(path, token)
        except Exception as exc:  # a missing document is data, not a failure
            bundle["errors"].append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        text = _decode(payload)
        blob_sha = payload.get("sha")
        document = {
            "label": label,
            "url": payload.get("html_url") or f"https://github.com/{repo}",
            "kind": "git_blob" if blob_sha else "web",
            "content": text,
            "content_sha256": content_hash(text),
            "fetched_at": today,
        }
        if blob_sha:
            document["blob_sha"] = blob_sha
            document["immutable_url"] = f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}"
        bundle["documents"].append(document)
    return bundle
