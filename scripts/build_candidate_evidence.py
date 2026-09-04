#!/usr/bin/env python3
"""Gather pinned, verifiable evidence for queued candidates.

This script makes no editorial judgment. It fetches and records; a human, or a
routine acting under docs/adr/024, decides what the evidence means.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

try:
    from .update_directory import GitHubGetter, github_get
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from update_directory import GitHubGetter, github_get

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_PATH = ROOT / ".candidate-evidence" / "bundle.json"
CATALOG_FILES = (
    "projects.json", "exclusions.json", "specifications.json",
    "inference-services.json", "local-runtimes.json",
)
COLLECTION_KEYS = {
    "projects.json": "projects", "exclusions.json": "entries",
    "specifications.json": "specifications", "inference-services.json": "services",
    "local-runtimes.json": "runtimes",
}


def candidate_key(candidate: dict[str, Any]) -> str:
    """Identify a candidate the same way the updater's queue does."""
    return str(candidate.get("repo") or candidate.get("url") or "").lower()


def untriageable_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return untriaged candidates this harness can never gather evidence for.

    Every document it fetches comes from a GitHub repository, and the schema requires a
    triage block to cite at least one. A candidate with no `repo` is therefore not a
    transient failure to route around; it is permanently out of this harness's reach, and
    leaving it in the selection would starve the queue behind it on every future run.
    """
    return [item for item in candidates if "triage" not in item and not item.get("repo")]


def select_candidates(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Return untriaged candidates with a repository, oldest discovery first, at most `limit`."""
    pending = [item for item in candidates if "triage" not in item and item.get("repo")]
    pending.sort(key=lambda item: str(item.get("discovered_at") or ""))
    return pending[:limit]


def carry_forward(candidates: list[dict[str, Any]], previous: list[dict[str, Any]]) -> int:
    """Copy triage blocks from a previous unmerged run onto candidates that lack one."""
    prior = {
        candidate_key(item): item["triage"] for item in previous if isinstance(item.get("triage"), dict)
    }
    carried = 0
    for item in candidates:
        key = candidate_key(item)
        block = prior.get(key) if key else None
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


def recheck_candidates(
    candidates: list[dict[str, Any]], getter: GitHubGetter, token: str | None, today: str
) -> list[str]:
    """Re-fetch this run's cited documents and confirm they still hash to what was recorded.

    Scoped to blocks proposed today, which are exactly the ones this run wrote. An older
    block describes a document as it stood when a human accepted it; re-verifying it here
    would turn ordinary upstream drift — a README edited after the fact — into a guard
    failure that no triage run can clear, deadlocking the routine permanently.
    """
    problems: list[str] = []
    for candidate in candidates:
        triage = candidate.get("triage")
        if not isinstance(triage, dict) or triage.get("proposed_at") != today:
            continue
        repo = candidate.get("repo")
        evidence = triage.get("evidence") or []
        if not isinstance(evidence, list):
            problems.append(
                f"{candidate_key(candidate)}: evidence must be a list, got "
                f"{type(evidence).__name__}"
            )
            continue
        for item in evidence:
            label = item.get("label")
            if label == "LICENSE":
                path = f"/repos/{repo}/license"
            elif label == "README":
                path = f"/repos/{repo}/readme"
            else:
                problems.append(
                    f"{candidate_key(candidate)}: unknown evidence label {label!r} is not "
                    "one this harness ever emits"
                )
                continue
            try:
                payload = getter(path, token)
            except Exception as exc:
                problems.append(
                    f"{candidate_key(candidate)}: {label} could not be re-fetched: "
                    f"{type(exc).__name__}: {exc}"
                )
                continue
            # A hash alone proves only that some document reads this way. Without this
            # check a fabricated `url` pointing anywhere at all passes the guard, because
            # the path re-fetched is derived from the label and the repo, never read from
            # the citation. The prompt promises this check; here it is.
            expected_url = payload.get("html_url") or f"https://github.com/{repo}"
            if item.get("url") != expected_url:
                problems.append(
                    f"{candidate_key(candidate)}: {label} cites {item.get('url')!r} but the "
                    f"document this harness fetched is at {expected_url!r}"
                )
            actual = content_hash(_decode(payload))
            if actual != item.get("content_sha256"):
                problems.append(
                    f"{candidate_key(candidate)}: {label} content_sha256 recorded "
                    f"{item.get('content_sha256')} but re-fetched {actual}"
                )
            if item.get("kind") == "git_blob" and payload.get("sha") != item.get("blob_sha"):
                problems.append(
                    f"{candidate_key(candidate)}: {label} blob_sha recorded "
                    f"{item.get('blob_sha')} but re-fetched {payload.get('sha')}"
                )
    return problems


def previous_candidates(branch: str) -> list[dict[str, Any]]:
    """Read the queue from a previous unmerged triage branch, if one exists."""
    if not branch:
        return []
    finished = subprocess.run(
        ["git", "show", f"{branch}:directory/candidates.json"],
        capture_output=True, text=True, cwd=ROOT,
    )
    if finished.returncode != 0:
        return []
    return json.loads(finished.stdout).get("candidates") or []


def persist_candidates(path: Path, candidates: list[dict[str, Any]]) -> None:
    """Write the queue back, preserving every other key in the document."""
    document = json.loads(path.read_text(encoding="utf-8"))
    document["candidates"] = candidates
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def github_token(run=subprocess.run) -> str | None:
    """Prefer GITHUB_TOKEN, then `gh auth token`; no secret is stored either way.

    A scheduled local run has no environment to put a token in, and unauthenticated
    GitHub allows 60 requests an hour against the 80 a default `--limit 40` issues.
    """
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    try:
        finished = run(["gh", "auth", "token"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None  # gh is not installed, or not on this PATH
    if finished.returncode != 0:
        return None  # gh is installed but not authenticated
    return finished.stdout.strip() or None


def load_catalog(directory: Path) -> dict[str, list[dict[str, Any]]]:
    catalog: dict[str, list[dict[str, Any]]] = {}
    for name in CATALOG_FILES:
        document = json.loads((directory / name).read_text(encoding="utf-8"))
        catalog[name] = document.get(COLLECTION_KEYS[name]) or []
    return catalog


def run_build(
    *, candidates, catalog, getter, token, today, limit, bundle_path, previous=(),
    candidates_path=None,
) -> int:
    """Build the evidence bundle. Returns a process exit code."""
    carried = carry_forward(candidates, list(previous))
    if carried:
        print(f"carried {carried} triage blocks forward from the previous run")
        # Carrying forward in memory alone loses the previous run's unmerged work: the
        # branch it lived on is force-reset onto a fresh origin/main by `finish`, and the
        # carried block also removes the candidate from this run's selection, so nobody
        # redoes it either. The carry-forward is only real once it is on disk.
        if candidates_path is not None:
            persist_candidates(candidates_path, candidates)
    unreachable = untriageable_candidates(candidates)
    if unreachable:
        print(
            f"skipped {len(unreachable)} candidates with no GitHub repository, which this "
            f"harness cannot gather evidence for: "
            f"{', '.join(sorted(candidate_key(item) for item in unreachable))}"
        )
    selected = select_candidates(candidates, limit)
    entries = []
    for item in selected:
        bundle = fetch_candidate_evidence(item, getter, token, today)
        if bundle["errors"] and not bundle["documents"]:
            print(f"error: {candidate_key(item)}: {bundle['errors']}", file=sys.stderr)
            return 1
        if bundle["errors"]:
            print(
                f"warning: {candidate_key(item)}: partial evidence, {bundle['errors']}",
                file=sys.stderr,
            )
        bundle["cross_collection_hits"] = cross_collection_hits(item, catalog)
        bundle["class_signals"] = class_signals(item)
        entries.append(bundle)
    if bundle_path is not None:
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        bundle_path.write_text(json.dumps({"candidates": entries}, indent=2) + "\n", encoding="utf-8")
    print(f"prepared evidence for {len(entries)} candidates")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--recheck", action="store_true")
    parser.add_argument("--previous-branch", default="")
    args = parser.parse_args(argv)
    directory = ROOT / "directory"
    candidates_path = directory / "candidates.json"
    candidates = json.loads(candidates_path.read_text(encoding="utf-8"))["candidates"]
    token = github_token()
    today = date.today().isoformat()
    if args.recheck:
        problems = recheck_candidates(candidates, github_get, token, today)
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        return 1 if problems else 0
    return run_build(
        candidates=candidates, catalog=load_catalog(directory), getter=github_get,
        token=token, today=today, limit=args.limit, bundle_path=BUNDLE_PATH,
        previous=previous_candidates(args.previous_branch), candidates_path=candidates_path,
    )


if __name__ == "__main__":
    raise SystemExit(main())
