#!/usr/bin/env python3
"""Apply the two-fetch rule from docs/ROBOTS.md to one page.

Fetch a URL twice and hash its visible text both times with the same
normalisation the evidence monitor uses. A page whose hashes differ cannot be
pinned: prefer a stable first-party alternative, and where none exists cite the
page with "unpinnable": true, which is link-checked but never drift-monitored.
An unpinnable page never holds a robot out of the collection (ADR 037).
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable

try:
    from .check_evidence_links import (
        FetchFailure,
        FetchResult,
        LinkTarget,
        content_sha256,
        fetch_target,
    )
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from check_evidence_links import (
        FetchFailure,
        FetchResult,
        LinkTarget,
        content_sha256,
        fetch_target,
    )


def _fetch(url: str) -> FetchResult:
    target = LinkTarget(
        url=url,
        kinds=("terms",),
        references=("page-stability",),
        review_dates=(),
        monitor_terms=True,
    )
    return fetch_target(target, {}, token=None)


def fetch_hash(url: str, *, fetch: Callable[[str], FetchResult] = _fetch) -> str:
    result = fetch(url)
    if result.body is None:
        raise FetchFailure("no body returned")
    return content_sha256(result.body, result.headers.get("content-type", ""))


def main(
    argv: list[str] | None = None,
    *,
    fetch: Callable[[str], FetchResult] = _fetch,
) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("url")
    parser.add_argument(
        "--wait", type=float, default=120.0, help="seconds between the two fetches"
    )
    args = parser.parse_args(argv)
    try:
        first = fetch_hash(args.url, fetch=fetch)
        time.sleep(args.wait)
        second = fetch_hash(args.url, fetch=fetch)
    except FetchFailure as failure:
        print(f"{args.url}: fetch failed: {failure}")
        return 2
    print(f"first  {first}\nsecond {second}")
    if first != second:
        print(
            "UNSTABLE: the visible text changed between fetches; prefer a stable "
            'first-party page, or cite this one with "unpinnable": true'
        )
        return 1
    print("stable: citable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
