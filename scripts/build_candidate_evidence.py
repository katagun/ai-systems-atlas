#!/usr/bin/env python3
"""Gather pinned, verifiable evidence for queued candidates.

This script makes no editorial judgment. It fetches and records; a human, or a
routine acting under docs/adr/024, decides what the evidence means.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

try:
    from .discovery_sources import https_url_host
    from .update_directory import GitHubGetter, github_get
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from discovery_sources import https_url_host
    from update_directory import GitHubGetter, github_get

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_PATH = ROOT / ".candidate-evidence" / "bundle.json"
CATALOG_FILES = (
    "projects.json",
    "exclusions.json",
    "specifications.json",
    "inference-services.json",
    "local-runtimes.json",
    "packs.json",
)
COLLECTION_KEYS = {
    "projects.json": "projects",
    "exclusions.json": "entries",
    "specifications.json": "specifications",
    "inference-services.json": "services",
    "local-runtimes.json": "runtimes",
    "packs.json": "packs",
}
GIT_BLOB_SHA = re.compile(r"[0-9a-f]{40}")
MAX_WEB_EVIDENCE_BYTES = 2 * 1024 * 1024
MAX_WEB_REDIRECTS = 5
MAX_WEB_ADDRESSES = 8
WEB_REDIRECT_CODES = {301, 302, 303, 307, 308}


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
    return [
        item for item in candidates if "triage" not in item and not item.get("repo")
    ]


def select_candidates(
    candidates: list[dict[str, Any]], limit: int
) -> list[dict[str, Any]]:
    """Return untriaged candidates with a repository, oldest discovery first, at most `limit`."""
    pending = [item for item in candidates if "triage" not in item and item.get("repo")]
    pending.sort(key=lambda item: str(item.get("discovered_at") or ""))
    return pending[:limit]


def carry_forward(
    candidates: list[dict[str, Any]], previous: list[dict[str, Any]]
) -> int:
    """Copy triage blocks from a previous unmerged run onto candidates that lack one."""
    prior = {
        candidate_key(item): item["triage"]
        for item in previous
        if isinstance(item.get("triage"), dict)
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
    "paper or research artifact": (
        "official implementation of",
        "paper implementation",
    ),
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
    haystack = " ".join(
        [
            str(candidate.get("name") or ""),
            str(candidate.get("description") or ""),
            " ".join(candidate.get("topics") or []),
        ]
    ).lower()
    return [
        name
        for name, terms in CLASS_SIGNALS.items()
        if any(term in haystack for term in terms)
    ]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _validated_web_endpoint(
    url: str, resolver=socket.getaddrinfo
) -> tuple[str, tuple[str, ...]]:
    """Return an HTTPS host and every public-unicast address it may connect to."""
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in url):
        raise ValueError("web evidence URL contains a control character")
    host = https_url_host(url)
    if host is None:
        raise ValueError("web evidence URL must be absolute HTTPS on a public DNS host")
    parsed = urllib.parse.urlsplit(url)
    if parsed.port not in (None, 443):
        raise ValueError("web evidence URL must use the default HTTPS port")
    try:
        answers = resolver(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError(f"web evidence host could not be resolved: {exc}") from exc
    addresses: set[str] = set()
    for answer in answers:
        try:
            addresses.add(str(answer[4][0]).split("%", 1)[0])
        except (IndexError, TypeError):
            raise ValueError("web evidence host returned an invalid address") from None
    if not addresses:
        raise ValueError("web evidence host returned no addresses")
    if len(addresses) > MAX_WEB_ADDRESSES:
        raise ValueError(
            f"web evidence host returned more than {MAX_WEB_ADDRESSES} addresses"
        )
    for address in addresses:
        try:
            parsed_address = ipaddress.ip_address(address)
        except ValueError:
            raise ValueError(
                f"web evidence host returned an invalid address: {address}"
            ) from None
        if (
            not parsed_address.is_global
            or parsed_address.is_multicast
            or parsed_address.is_reserved
            or getattr(parsed_address, "is_site_local", False)
        ):
            raise ValueError(
                f"web evidence host resolved to a non-public-unicast address: {address}"
            )
    return host, tuple(sorted(addresses))


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to a validated address while retaining the DNS name for TLS."""

    def __init__(self, host: str, address: str, **kwargs) -> None:
        super().__init__(host, **kwargs)
        self._validated_address = address

    def connect(self) -> None:
        # Deliberately do not call HTTPConnection.connect(): it would resolve
        # ``self.host`` again and reopen the DNS-rebinding gap this class closes.
        self.sock = self._create_connection(
            (self._validated_address, self.port), self.timeout, self.source_address
        )
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _PinnedWebResponse:
    """Give an ``HTTPResponse`` the small context-managed interface used below."""

    def __init__(self, response, connection, url: str) -> None:
        self._response = response
        self._connection = connection
        self._url = url
        self.headers = response.headers

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        try:
            self._response.close()
        finally:
            self._connection.close()

    def getcode(self) -> int:
        return self._response.status

    def geturl(self) -> str:
        return self._url

    def read(self, amount: int | None = None) -> bytes:
        return self._response.read(amount)


def _open_pinned_https(
    url: str,
    host: str,
    addresses: tuple[str, ...],
    *,
    timeout: int,
):
    """Open one direct TLS connection to an address already approved by policy."""
    parsed = urllib.parse.urlsplit(url)
    target = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    context = ssl.create_default_context()
    failures: list[str] = []
    for address in addresses:
        connection = _PinnedHTTPSConnection(
            host, address, port=443, timeout=timeout, context=context
        )
        try:
            connection.request(
                "GET",
                target,
                headers={
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                    "User-Agent": "agent-systems-atlas-evidence",
                },
            )
            return _PinnedWebResponse(connection.getresponse(), connection, url)
        except (OSError, http.client.HTTPException) as exc:
            connection.close()
            failures.append(f"{address}: {type(exc).__name__}: {exc}")
    raise OSError("every validated address failed: " + "; ".join(failures))


def fetch_web_text(
    url: str, *, resolver=socket.getaddrinfo, opener=None, pinned_open=None
) -> str:
    """Fetch bounded HTTPS through a TLS connection pinned to a validated address."""
    allowed_host, _ = _validated_web_endpoint(url, resolver)
    pinned_open = pinned_open or _open_pinned_https
    current_url = url
    for redirect_count in range(MAX_WEB_REDIRECTS + 1):
        current_host, current_addresses = _validated_web_endpoint(current_url, resolver)
        if current_host != allowed_host:
            raise ValueError("web evidence redirect changed host")
        request = urllib.request.Request(
            current_url, headers={"User-Agent": "agent-systems-atlas-evidence"}
        )
        response_context = (
            opener.open(request, timeout=30)
            if opener is not None
            else pinned_open(current_url, current_host, current_addresses, timeout=30)
        )
        with response_context as response:
            status = response.getcode()
            if status in WEB_REDIRECT_CODES:
                if redirect_count == MAX_WEB_REDIRECTS:
                    raise ValueError("web evidence exceeded its redirect limit")
                location = response.headers.get("Location")
                if not location:
                    raise ValueError("web evidence redirect has no Location")
                redirected = urllib.parse.urljoin(current_url, location)
                redirected_host, _ = _validated_web_endpoint(redirected, resolver)
                if redirected_host != allowed_host:
                    raise ValueError("web evidence redirect changed host")
                current_url = redirected
                continue
            if not isinstance(status, int) or not 200 <= status < 300:
                raise ValueError(f"web evidence returned HTTP {status}")
            final_url = response.geturl()
            final_host, _ = _validated_web_endpoint(final_url, resolver)
            if final_host != allowed_host:
                raise ValueError("web evidence response changed host")
            body = response.read(MAX_WEB_EVIDENCE_BYTES + 1)
            if len(body) > MAX_WEB_EVIDENCE_BYTES:
                raise ValueError(
                    f"web evidence response exceeds {MAX_WEB_EVIDENCE_BYTES} bytes"
                )
            return body.decode("utf-8", "replace")
    raise AssertionError("redirect loop ended without returning or raising")


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
    for label, path in (
        ("LICENSE", f"/repos/{repo}/license"),
        ("README", f"/repos/{repo}/readme"),
    ):
        try:
            payload = getter(path, token)
        except Exception as exc:  # a missing document is data, not a failure
            bundle["errors"].append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        text = _decode(payload)
        blob_sha = payload.get("sha")
        if not isinstance(blob_sha, str) or not GIT_BLOB_SHA.fullmatch(blob_sha):
            bundle["errors"].append(f"{label}: GitHub did not return a valid blob SHA")
            continue
        document = {
            "label": label,
            "url": payload.get("html_url") or f"https://github.com/{repo}",
            "kind": "git_blob",
            "content": text,
            "content_sha256": content_hash(text),
            "fetched_at": today,
        }
        document["blob_sha"] = blob_sha
        document["immutable_url"] = (
            f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}"
        )
        bundle["documents"].append(document)
    return bundle


def blocks_to_recheck(
    candidates: list[dict[str, Any]], baseline: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Candidates whose triage block this run introduced or changed.

    Judged by comparing against a reference queue, never by a date. `proposed_at` is
    written by the agent being policed, so scoping on it let a back-dated block skip
    verification entirely — the guard could be switched off by the thing it guards.
    """
    prior = {
        candidate_key(item): item.get("triage")
        for item in baseline
        if isinstance(item, dict)
    }
    return [
        item
        for item in candidates
        if isinstance(item.get("triage"), dict)
        and item["triage"] != prior.get(candidate_key(item))
    ]


def _unattended_evidence_problems(candidate: dict[str, Any]) -> list[str]:
    """Check the complete unattended evidence shape without performing any I/O."""
    key = candidate_key(candidate)
    triage = candidate["triage"]
    problems: list[str] = []
    if triage.get("proposer") != "candidate-triage":
        problems.append(
            f"{key}: unattended triage requires proposer 'candidate-triage'"
        )
    evidence = triage.get("evidence") or []
    if not isinstance(evidence, list):
        return [
            *problems,
            f"{key}: evidence must be a list, got {type(evidence).__name__}",
        ]
    if not 1 <= len(evidence) <= 2:
        problems.append(
            f"{key}: unattended triage requires one or two GitHub citations"
        )
    labels: list[str] = []
    for item in evidence:
        if not isinstance(item, dict):
            problems.append(f"{key}: every evidence item must be an object")
            continue
        if item.get("kind") != "git_blob":
            problems.append(
                f"{key}: unattended triage accepts only GitHub blob evidence"
            )
        label = item.get("label")
        if label not in {"LICENSE", "README"}:
            problems.append(
                f"{key}: unattended triage accepts only LICENSE and README labels"
            )
        elif label in labels:
            problems.append(
                f"{key}: unattended triage rejects duplicate {label} evidence"
            )
        else:
            labels.append(label)
    return problems


def recheck_candidates(
    candidates: list[dict[str, Any]],
    getter: GitHubGetter,
    token: str | None,
    baseline: list[dict[str, Any]],
    *,
    unattended: bool = False,
) -> list[str]:
    """Re-fetch this run's cited documents and confirm they still hash to what was recorded.

    Scoped to blocks this run introduced or changed. A block already on the reference
    describes a document as a human accepted it; re-verifying it would turn ordinary
    upstream drift — a README edited afterwards — into a guard failure no run can clear.
    """
    problems: list[str] = []
    scoped = blocks_to_recheck(candidates, baseline)
    if unattended:
        for candidate in scoped:
            problems.extend(_unattended_evidence_problems(candidate))
        if problems:
            return problems
    for candidate in scoped:
        triage = candidate["triage"]
        repo = candidate.get("repo")
        evidence = triage.get("evidence") or []
        if not isinstance(evidence, list):
            problems.append(
                f"{candidate_key(candidate)}: evidence must be a list, got "
                f"{type(evidence).__name__}"
            )
            continue
        for item in evidence:
            if not isinstance(item, dict):
                problems.append(
                    f"{candidate_key(candidate)}: every evidence item must be an object"
                )
                continue
            label = item.get("label")
            if item.get("kind") == "web":
                if unattended:
                    problems.append(
                        f"{candidate_key(candidate)}: unattended triage accepts only "
                        "GitHub blob evidence"
                    )
                    continue
                # Re-fetching the cited URL itself is what makes a fabricated citation
                # fail: there is no label-derived path to fall back on, so a URL that
                # does not serve the recorded bytes cannot pass.
                try:
                    actual = content_hash(fetch_web_text(item.get("url") or ""))
                except Exception as exc:
                    problems.append(
                        f"{candidate_key(candidate)}: {label} could not be re-fetched: "
                        f"{type(exc).__name__}: {exc}"
                    )
                    continue
                if actual != item.get("content_sha256"):
                    problems.append(
                        f"{candidate_key(candidate)}: {label} content_sha256 recorded "
                        f"{item.get('content_sha256')} but re-fetched {actual}"
                    )
                continue
            if item.get("kind") != "git_blob":
                problems.append(
                    f"{candidate_key(candidate)}: unknown evidence kind "
                    f"{item.get('kind')!r}"
                )
                continue
            if not isinstance(repo, str):
                problems.append(
                    f"{candidate_key(candidate)}: GitHub blob evidence requires a repository"
                )
                continue
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
            if item.get("kind") == "git_blob" and payload.get("sha") != item.get(
                "blob_sha"
            ):
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
        capture_output=True,
        text=True,
        cwd=ROOT,
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
        finished = run(
            ["gh", "auth", "token"], capture_output=True, text=True, timeout=15
        )
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
    *,
    candidates,
    catalog,
    getter,
    token,
    today,
    limit,
    bundle_path,
    previous=(),
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
        bundle_path.write_text(
            json.dumps({"candidates": entries}, indent=2) + "\n", encoding="utf-8"
        )
    print(f"prepared evidence for {len(entries)} candidates")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--recheck", action="store_true")
    parser.add_argument(
        "--unattended",
        action="store_true",
        help="reject generic web evidence in the unattended candidate-triage routine",
    )
    parser.add_argument("--previous-branch", default="")
    parser.add_argument("--baseline-ref", default="origin/main")
    args = parser.parse_args(argv)
    if args.unattended and not args.recheck:
        parser.error("--unattended requires --recheck")
    directory = ROOT / "directory"
    candidates_path = directory / "candidates.json"
    candidates = json.loads(candidates_path.read_text(encoding="utf-8"))["candidates"]
    token = github_token()
    today = date.today().isoformat()
    if args.recheck:
        baseline = previous_candidates(args.baseline_ref)
        scoped = blocks_to_recheck(candidates, baseline)
        problems = recheck_candidates(
            candidates, github_get, token, baseline, unattended=args.unattended
        )
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        cited = sum(len(item["triage"].get("evidence") or []) for item in scoped)
        # Say what was verified. A silent "0 problems" reads identically whether the
        # citations held up or whether nothing was examined at all.
        print(f"rechecked {cited} citations across {len(scoped)} candidates")
        return 1 if problems else 0
    return run_build(
        candidates=candidates,
        catalog=load_catalog(directory),
        getter=github_get,
        token=token,
        today=today,
        limit=args.limit,
        bundle_path=BUNDLE_PATH,
        previous=previous_candidates(args.previous_branch),
        candidates_path=candidates_path,
    )


if __name__ == "__main__":
    raise SystemExit(main())
