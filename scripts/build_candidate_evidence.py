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
