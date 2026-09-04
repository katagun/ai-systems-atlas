#!/usr/bin/env python3
"""Orchestrate one candidate-triage run: prepare evidence, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/candidate-triage.md. Everything here is mechanical.
"""
from __future__ import annotations

ALLOWED_CHANGES = {"directory/candidates.json"}


def unexpected_changes(porcelain: str) -> list[str]:
    """Return every path in `git status --porcelain` output the routine may not touch."""
    changed: list[str] = []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # a rename reports "old -> new"
            path = path.split(" -> ", 1)[1]
        if path not in ALLOWED_CHANGES:
            changed.append(path)
    return changed
