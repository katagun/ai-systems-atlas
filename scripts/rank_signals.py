#!/usr/bin/env python3
"""Order the attention-source queue by how likely each page is to be a system.

One yes/no question per bundled page goes to TypeSafe's System One API, which returns a
probability and no generated text. The probabilities order the pending list that
`run_hn_signals.py prepare` prints, and do nothing else: every signal still gets an
assessment, no signal is skipped, and nothing here is evidence. ADR 028 holds that an
attention source is a pointer, never a claim; a rank is a pointer to a pointer.

Everything fails open. No key, an unreachable API, a malformed answer, or a rejected
request leaves the queue in sweep order, because a missing rank costs nothing and a
failed run costs a day. The 2026-09-20 measurements behind this are in `BACKLOG.md`.

The title, URL, and page text of each pending signal leave this machine for
api.typesafe.ai. They are public web pages, but that is still a disclosure: do not point
this at anything that is not.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, TextIO

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
KEY_NAME = "TYPESAFE_API_KEY"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"
# Pinned, not `jev-latest`: an alias moves when a release ships, and an ordering that
# changes underneath the routine with no change here is not reproducible.
MODEL = "jev-1.13.0"
TIMEOUT_SECONDS = 20
MAX_RESPONSE_BYTES = 64 * 1024

# The wording the 2026-09-20 spike measured. A companion question asking which
# collection a page belongs to was unreliable there and is deliberately absent.
QUESTION = {
    "type": "noul",
    "instructions": (
        "Does `page_text` describe a specific, shipped software product or open-source "
        "project that is itself an AI memory system, an AI agent, or an AI assistant?"
    ),
    "criteria": {
        "true": (
            "The page is about one identifiable product, tool, framework, or repository "
            "that people can use today, and its main purpose is one of: preserving or "
            "organizing knowledge for AI use; planning and acting through tools as an "
            "agent, or building or running such agents; or a conversational AI "
            "assistant workspace."
        ),
        "false": (
            "Anything else: news, opinion, essays, tutorials, research papers without a "
            "shipped artifact, hiring or funding posts, hardware, databases, networking, "
            "developer utilities, programming languages, bare language models, or "
            "products that merely use AI for a narrow feature."
        ),
    },
}

Opener = Callable[..., Any]


def load_api_key(
    environ: Mapping[str, str] | None = None, env_file: Path = ENV_FILE
) -> str | None:
    """The key from the environment, else from the checkout's ignored `.env`."""
    environ = os.environ if environ is None else environ
    value = environ.get(KEY_NAME, "").strip()
    if value:
        return value
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        name, separator, raw = line.strip().partition("=")
        if separator and name.strip() == KEY_NAME:
            value = raw.strip().strip("'\"")
            return value or None
    return None


def _ask(state: dict[str, str], key: str, opener: Opener) -> float | None:
    body = json.dumps(
        {"state": state, "model": MODEL, "questions": {"system": QUESTION}}
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with opener(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read(MAX_RESPONSE_BYTES))
    noul = payload["answers"]["system"]["noul"]
    # bool is an int in Python; a probability is a real number in [0, 1] and nothing else.
    if isinstance(noul, bool) or not isinstance(noul, int | float):
        return None
    return float(noul) if 0 <= noul <= 1 else None


def score_pages(
    signals: list[dict[str, Any]],
    pages: Mapping[str, str],
    *,
    key: str,
    opener: Opener = urllib.request.urlopen,
    stderr: TextIO | None = None,
) -> dict[str, float]:
    """Probability per story id, for the signals whose page text is in `pages`."""
    stderr = sys.stderr if stderr is None else stderr
    scores: dict[str, float] = {}
    for signal in signals:
        story_id = str(signal.get("story_id"))
        text = pages.get(story_id)
        if not isinstance(text, str):
            continue
        state = {
            "title": str(signal.get("title", "")),
            "url": str(signal.get("url", "")),
            "page_text": text,
        }
        try:
            noul = _ask(state, key, opener)
        except (OSError, ValueError, KeyError, TypeError) as error:
            # Only the class: an HTTP error's text can echo request headers, and the
            # one header this request carries is the key.
            print(
                f"warning: rank skipped {story_id}: {type(error).__name__}", file=stderr
            )
            continue
        if noul is not None:
            scores[story_id] = noul
    return scores


def order_pending(pending: list[str], scores: Mapping[str, float]) -> list[str]:
    """Scored ids first by descending score; the rest, and ties, keep queue order."""
    scored = [story_id for story_id in pending if story_id in scores]
    unscored = [story_id for story_id in pending if story_id not in scores]
    return sorted(scored, key=lambda story_id: -scores[story_id]) + unscored


def rank_pending(
    pending: list[str],
    signals: list[dict[str, Any]],
    pages: Mapping[str, str],
    *,
    key: str | None,
    opener: Opener = urllib.request.urlopen,
    stderr: TextIO | None = None,
) -> tuple[list[str], dict[str, float]]:
    """`pending` reordered, with the scores behind the order. No key means no change."""
    if not key:
        return list(pending), {}
    wanted = set(pending)
    scores = score_pages(
        [signal for signal in signals if str(signal.get("story_id")) in wanted],
        pages,
        key=key,
        opener=opener,
        stderr=stderr,
    )
    return order_pending(pending, scores), scores
