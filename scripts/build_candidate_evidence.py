#!/usr/bin/env python3
"""Gather pinned, verifiable evidence for queued candidates.

This script makes no editorial judgment. It fetches and records; a human, or a
routine acting under docs/adr/023, decides what the evidence means.
"""
from __future__ import annotations

from typing import Any

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
