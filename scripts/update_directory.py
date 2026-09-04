#!/usr/bin/env python3
"""Refresh live GitHub metadata and maintain human-review queues.

The updater may change live metadata and safety status. It never changes human
editorial analysis, scores, license evidence, or editorial verification dates.
Discovered projects remain provisional in ``directory/candidates.json``.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import xml.parsers.expat as expat
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

try:
    from .discovery_sources import (
        canonical_url_key,
        https_url_host,
        validate_discovery_sources,
    )
    from .sync_web_data import main as sync_web_data
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from discovery_sources import (
        canonical_url_key,
        https_url_host,
        validate_discovery_sources,
    )
    from sync_web_data import main as sync_web_data

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
PROJECTS_PATH = DIRECTORY / "projects.json"
TAXONOMY_PATH = DIRECTORY / "taxonomy.json"
CANDIDATES_PATH = DIRECTORY / "candidates.json"
LICENSE_REVIEW_PATH = DIRECTORY / "license-review.json"
DISCOVERY_SOURCES_PATH = DIRECTORY / "discovery-sources.json"
LOCAL_RUNTIMES_PATH = DIRECTORY / "local-runtimes.json"

TRANSIENT_HTTP_CODES = {429, 500, 502, 503, 504}
MIN_METADATA_SUCCESS_RATIO = 0.80
MAX_FEED_BYTES = 2 * 1024 * 1024
MAX_FEED_OBSERVATIONS = 100
FEED_LOOKBACK_DAYS = 14
ANNOUNCEMENT_SIGNAL_PATTERN = re.compile(
    r"\b(?:introduc(?:e[sd]?|ing)|announc(?:e[sd]?|ing)|launch(?:ed|es|ing)?|new)\b"
    r"|\b(?:now available|general availability|public preview)\b",
    re.IGNORECASE,
)
DISCOVERY_QUERIES = [
    '"second brain" in:name,description stars:>500 archived:false',
    '"agent memory" in:name,description stars:>500 archived:false',
    '"personal knowledge management" in:description stars:>500 archived:false',
    '"local-first" note knowledge in:description stars:>500 archived:false',
    'RAG personal knowledge in:description stars:>1000 archived:false',
    'vector database AI memory in:description stars:>1000 archived:false',
    'screen recall privacy in:description stars:>300 archived:false',
    'coding agent skills workflow in:description stars:>500 archived:false',
    'open source coding agent in:description stars:>1000 archived:false',
    'research agent web in:description stars:>1000 archived:false',
    'browser agent in:name,description stars:>1000 archived:false',
    '"text-to-sql" in:name,description stars:>500 archived:false',
    '"data assistant" agent database in:description stars:>1000 archived:false',
    'multi-agent framework in:description stars:>1000 archived:false',
    '"agent sdk" in:name,description stars:>500 archived:false',
    '"agent harness" in:name,description stars:>500 archived:false',
]
RELEVANT = {
    "memory", "second brain", "knowledge", "pkm", "note", "rag", "retrieval",
    "vector", "graph", "context", "agent", "recall", "lifelog", "markdown",
    "sql", "database", "data assistant", "text-to-sql", "text2sql", "nl2sql",
    "scientific", "discovery", "hypothesis", "experiment",
}
EXCLUDED = {"game", "awesome list", "interview questions", "tutorial only", "course only"}

GitHubGetter = Callable[[str, str | None], dict[str, Any]]
FeedGetter = Callable[[str, set[str]], bytes]


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value: str) -> str:
    parser = _TextExtractor()
    parser.feed(value)
    return " ".join(" ".join(parser.parts).split())


def now_date() -> str:
    return datetime.now(UTC).date().isoformat()


def load_json(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        if default is None:
            raise FileNotFoundError(path)
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def github_get(
    path: str,
    token: str | None,
    *,
    attempts: int = 3,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Read a GitHub API object, retrying only transient transport failures."""
    url = path if path.startswith("https://") else f"https://api.github.com{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ai-systems-atlas-updater/0.4",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in TRANSIENT_HTTP_CODES or attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
        sleeper(2**attempt)
    raise AssertionError("retry loop ended without returning or raising")


class _AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: set[str]) -> None:
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        if https_url_host(newurl) not in self.allowed_hosts:
            raise urllib.error.URLError("feed redirect left its HTTPS host allowlist")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def feed_get(
    url: str,
    allowed_hosts: set[str],
    *,
    attempts: int = 3,
    sleeper: Callable[[float], None] = time.sleep,
) -> bytes:
    if https_url_host(url) not in allowed_hosts:
        raise ValueError("feed URL is outside its HTTPS host allowlist")
    headers = {"User-Agent": "ai-systems-atlas-updater/0.5"}
    request = urllib.request.Request(url, headers=headers)
    opener = urllib.request.build_opener(_AllowlistedRedirectHandler(allowed_hosts))
    for attempt in range(attempts):
        try:
            with opener.open(request, timeout=30) as response:
                if https_url_host(response.geturl()) not in allowed_hosts:
                    raise ValueError("feed response left its HTTPS host allowlist")
                body = response.read(MAX_FEED_BYTES + 1)
                if len(body) > MAX_FEED_BYTES:
                    raise ValueError("feed exceeds size limit")
                return body
        except urllib.error.HTTPError as exc:
            if exc.code not in TRANSIENT_HTTP_CODES or attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
        sleeper(2**attempt)
    raise AssertionError("retry loop ended without returning or raising")


def classify(text: str) -> tuple[str | None, float]:
    lowered = text.lower()
    if any(term in lowered for term in EXCLUDED):
        return None, 0.0
    hits = sum(1 for term in RELEVANT if term in lowered)
    relevance = min(1.0, hits / 5)
    if any(term in lowered for term in ("text-to-sql", "text2sql", "nl2sql")) or (
        "data assistant" in lowered and any(term in lowered for term in ("database", "sql", "analytics"))
    ):
        return "data_analysis_agent", max(relevance, 0.84)
    if "vector database" in lowered or ("vector" in lowered and "database" in lowered):
        return "retrieval_infrastructure", max(relevance, 0.9)
    if any(term in lowered for term in ("screen recall", "lifelog", "activity tracker", "screen history")):
        return "ambient_capture", max(relevance, 0.86)
    if "coding agent" in lowered and any(term in lowered for term in ("skill", "workflow", "software factory")):
        return "coding_agent_workflow", max(relevance, 0.86)
    if "coding agent" in lowered or "ai pair programmer" in lowered:
        return "coding_agent", max(relevance, 0.82)
    if any(term in lowered for term in (
        "ai scientist", "ai-scientist", "autonomous discovery", "autonomous science",
        "scientific discovery",
    )):
        # ADR 023: autonomous scientific-discovery systems take an existing role.
        return "research_agent", max(relevance, 0.82)
    if "research agent" in lowered or "deep research" in lowered:
        return "research_agent", max(relevance, 0.82)
    if "browser agent" in lowered or "computer use agent" in lowered:
        return "browser_computer_agent", max(relevance, 0.82)
    if "multi-agent" in lowered or "multi agent" in lowered:
        return "multi_agent_orchestrator", max(relevance, 0.8)
    if any(term in lowered for term in ("stateful agent", "agent runtime", "agent harness")):
        return "stateful_agent_runtime", max(relevance, 0.83)
    if "agent framework" in lowered or "agent sdk" in lowered:
        return "agent_framework_sdk", max(relevance, 0.8)
    if "temporal" in lowered and "graph" in lowered:
        return "context_graph_engine", max(relevance, 0.9)
    if "knowledge graph" in lowered and "agent" in lowered:
        return "context_graph_engine", max(relevance, 0.82)
    if "agent" in lowered and "memory" in lowered:
        return "agent_memory_service", max(relevance, 0.8)
    if any(term in lowered for term in (
        "rag", "notebooklm", "chat with your docs", "chat with your documents", "document assistant",
    )):
        return "ai_knowledge_app", max(relevance, 0.78)
    if any(term in lowered for term in ("note-taking", "note taking", "personal knowledge", "pkm", "digital garden")):
        return "human_pkm", max(relevance, 0.76)
    if any(term in lowered for term in ("multi-model chat", "multi model chat", "multiple models in chat")):
        return "multi_model_chat_client", max(relevance, 0.8)
    if "assistant" in lowered and any(term in lowered for term in ("enterprise", "workplace", "organization", "business")):
        return "enterprise_work_assistant", max(relevance, 0.78)
    if any(term in lowered for term in ("ai assistant", "personal assistant", "chat assistant")):
        return "general_ai_assistant", max(relevance, 0.76)
    return None, relevance


def candidate_template(
    repo: dict[str, Any], family: str, role: str, confidence: float, discovered_at: str
) -> dict[str, Any]:
    """Create a discovery record without pretending an editorial review occurred."""
    return {
        "repo": repo["full_name"],
        "name": repo["name"],
        "url": repo["html_url"],
        "description": repo.get("description") or "GitHub project awaiting editorial review.",
        "proposed_system_family": family,
        "proposed_primary_role": role,
        "classification_confidence": round(confidence, 2),
        "github_detected_license": (repo.get("license") or {}).get("spdx_id"),
        "stars": repo.get("stargazers_count"),
        "topics": repo.get("topics") or [],
        "status": "provisional",
        "discovered_at": discovered_at,
        "review_required": ["licensing", "classification", "traits", "editorial_score"],
    }


def official_candidate_template(
    *,
    source: dict[str, Any],
    title: str,
    url: str,
    summary: str,
    family: str,
    role: str,
    confidence: float,
    discovered_at: str,
) -> dict[str, Any]:
    description = f"Official {source['name']} announcement awaiting editorial review."
    if summary:
        description = f"{description} {summary}"
    return {
        "repo": None,
        "name": title,
        "url": url,
        "description": description[:1000],
        "proposed_system_family": family,
        "proposed_primary_role": role,
        "classification_confidence": round(confidence, 2),
        "github_detected_license": None,
        "stars": None,
        "topics": ["official-announcement", source["id"]],
        "status": "provisional",
        "discovered_at": discovered_at,
        "review_required": ["licensing", "classification", "traits", "editorial_score"],
    }


def _child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in element.iter():
        local_name = child.tag.rsplit("}", 1)[-1].lower()
        if local_name in names:
            return "".join(child.itertext()).strip()
    return ""


def _item_link(element: ET.Element) -> str:
    for child in element.iter():
        if child.tag.rsplit("}", 1)[-1].lower() != "link":
            continue
        href = child.attrib.get("href")
        if href and child.attrib.get("rel", "alternate") in {"", "alternate"}:
            return href.strip()
        if child.text:
            return child.text.strip()
    return ""


def _published_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).date()
    except (TypeError, ValueError, OverflowError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def _reject_document_doctype(body: bytes) -> None:
    """Reject an actual XML doctype without mistaking CDATA text for markup."""
    parser = expat.ParserCreate()

    def reject(*_args: object) -> None:
        raise ValueError("DOCTYPE is not allowed in discovery feeds")

    parser.StartDoctypeDeclHandler = reject
    try:
        parser.Parse(body, True)
    except ValueError:
        raise
    except expat.ExpatError as exc:
        raise ET.ParseError(str(exc)) from exc


def parse_official_feed(
    body: bytes,
    source: dict[str, Any],
    role_families: dict[str, str],
    discovered_at: str,
) -> list[dict[str, Any]]:
    if len(body) > MAX_FEED_BYTES:
        raise ValueError("feed exceeds size limit")
    _reject_document_doctype(body)
    root = ET.fromstring(body)
    if root.tag.rsplit("}", 1)[-1].lower() not in {"rss", "feed"}:
        raise ValueError("official discovery source must be an RSS or Atom feed")
    items = [
        element for element in root.iter()
        if element.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}
    ]
    observed_date = date.fromisoformat(discovered_at)
    cutoff = observed_date - timedelta(days=FEED_LOOKBACK_DAYS)
    latest = observed_date + timedelta(days=1)
    allowed_hosts = set(source["item_hosts"])
    candidates: list[dict[str, Any]] = []
    for item in items:
        title = plain_text(_child_text(item, ("title",)))
        summary = plain_text(_child_text(item, ("description", "summary", "content")))
        url = _item_link(item)
        published = _published_date(_child_text(item, ("pubdate", "published", "updated")))
        parsed_url = urllib.parse.urlparse(url)
        if (
            not title
            or published is None
            or published < cutoff
            or published > latest
            or parsed_url.scheme != "https"
            or (parsed_url.hostname or "").lower() not in allowed_hosts
            or not ANNOUNCEMENT_SIGNAL_PATTERN.search(title)
        ):
            continue
        role, confidence = classify(f"{title} {summary}")
        family = role_families.get(role) if role else None
        if not role or not family or confidence < 0.75:
            continue
        candidates.append(official_candidate_template(
            source=source,
            title=title,
            url=url,
            summary=summary,
            family=family,
            role=role,
            confidence=confidence,
            discovered_at=discovered_at,
        ))
        if len(candidates) >= MAX_FEED_OBSERVATIONS:
            break
    return candidates


def refresh_projects(
    projects: list[dict[str, Any]],
    previous_reviews: dict[str, dict[str, Any]],
    getter: GitHubGetter,
    token: str | None,
    refreshed_at: str,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[int, list[str], list[dict[str, Any]]]:
    successes = 0
    failures: list[str] = []
    reviews: list[dict[str, Any]] = []

    for project in projects:
        if not project.get("repo"):
            continue
        project_id = project["id"]
        try:
            metadata = getter(f"/repos/{project['repo']}", token)
        except urllib.error.HTTPError as exc:
            if exc.code in {404, 410}:
                successes += 1
                project["status"] = "removed"
                project["metadata_verified_at"] = refreshed_at
                project["current_repo_note"] = f"GitHub returned {exc.code} on {refreshed_at}."
                continue
            failures.append(f"{project['repo']}: HTTP {exc.code}")
            if project.get("license_review_status") == "review_required" and project_id in previous_reviews:
                reviews.append(previous_reviews[project_id])
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{project['repo']}: {type(exc).__name__}: {exc}")
            if project.get("license_review_status") == "review_required" and project_id in previous_reviews:
                reviews.append(previous_reviews[project_id])
            continue

        successes += 1
        review_was_open = project.get("license_review_status") == "review_required"
        # Metadata may archive an active record, and never overwrites an
        # editorial status. GitHub reports archived=false for a project whose
        # maintainers wound it down without archiving the repository, and for a
        # superseded predecessor under ADR 016, so deriving the status in both
        # directions would silently revert a reviewed decision.
        if project.get("status") == "active" and metadata.get("archived"):
            project["status"] = "archived"
        project.update({
            "stars": metadata.get("stargazers_count"),
            "stars_verified_at": refreshed_at,
            "pushed_at": metadata.get("pushed_at"),
            "forks": metadata.get("forks_count"),
            "open_issues": metadata.get("open_issues_count"),
            "metadata_verified_at": refreshed_at,
        })
        detected_license = (metadata.get("license") or {}).get("spdx_id")
        project["github_detected_license"] = detected_license
        meaningful_license = detected_license not in {None, "", "NOASSERTION"}
        if meaningful_license and detected_license not in project.get("licenses", []):
            project["license_review_status"] = "review_required"
            reason = (
                f"GitHub detects {detected_license}; reviewed evidence records "
                f"{', '.join(project.get('licenses', []))}."
            )
            project["current_repo_note"] = f"License review required: {reason}"
            reviews.append({
                "project_id": project_id,
                "repo": project["repo"],
                "expected_licenses": project.get("licenses", []),
                "detected_license": detected_license,
                "reason": reason,
                "detected_at": refreshed_at,
                "status": "open",
            })
        elif review_was_open:
            project["license_review_status"] = "review_required"
            reviews.append(previous_reviews.get(project_id, {
                "project_id": project_id,
                "repo": project["repo"],
                "expected_licenses": project.get("licenses", []),
                "detected_license": detected_license,
                "reason": "A previous license-evidence review still requires human resolution.",
                "detected_at": refreshed_at,
                "status": "open",
            }))
        sleeper(0.05)

    return successes, failures, reviews


def refresh_local_runtime_stars(
    runtimes: list[dict[str, Any]],
    getter: GitHubGetter,
    token: str | None,
    refreshed_at: str,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[int, list[str]]:
    """Refresh descriptive GitHub star counts. Never touches score, evidence, or verified_at."""
    successes = 0
    failures: list[str] = []

    for runtime in runtimes:
        repo = runtime.get("repo")
        if not repo:
            continue
        try:
            metadata = getter(f"/repos/{repo}", token)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{repo}: {type(exc).__name__}: {exc}")
            continue
        runtime["stars"] = metadata.get("stargazers_count")
        runtime["stars_verified_at"] = refreshed_at
        successes += 1
        sleeper(0.05)

    return successes, failures


def discover_candidates(
    known_projects: set[str],
    previous_candidates: list[dict[str, Any]],
    role_families: dict[str, str],
    getter: GitHubGetter,
    token: str | None,
    discovered_at: str,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    def candidate_key(item: dict[str, Any]) -> str:
        return str(item.get("repo") or item["url"]).lower()

    candidates = {candidate_key(item): item for item in previous_candidates}
    known = known_projects | set(candidates)
    new_count = 0
    successful_queries = 0
    failures: list[str] = []

    for query in DISCOVERY_QUERIES:
        encoded = urllib.parse.quote(query)
        try:
            result = getter(f"/search/repositories?q={encoded}&sort=stars&order=desc&per_page=30", token)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{query}: {type(exc).__name__}: {exc}")
            continue
        successful_queries += 1
        for repo in result.get("items", []):
            repo_key = repo["full_name"].lower()
            if repo_key in known or repo.get("fork") or repo.get("archived"):
                continue
            text = f"{repo.get('name', '')} {repo.get('description') or ''} {' '.join(repo.get('topics') or [])}"
            role, confidence = classify(text)
            family = role_families.get(role) if role else None
            if not role or not family or confidence < 0.75:
                continue
            candidates[repo_key] = candidate_template(repo, family, role, confidence, discovered_at)
            known.add(repo_key)
            new_count += 1
        sleeper(0.1)

    ordered = sorted(candidates.values(), key=candidate_key)
    return ordered, new_count, successful_queries, failures


def discover_official_candidates(
    previous_candidates: list[dict[str, Any]],
    known_urls: set[str],
    sources: list[dict[str, Any]],
    role_families: dict[str, str],
    discovered_at: str,
    *,
    getter: FeedGetter = feed_get,
) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    def candidate_key(item: dict[str, Any]) -> str:
        repo = item.get("repo")
        return str(repo).lower() if repo else canonical_url_key(item["url"])

    candidates = {candidate_key(item): item for item in previous_candidates}
    known = {canonical_url_key(value) for value in known_urls} | set(candidates)
    new_count = 0
    successful_sources = 0
    failures: list[str] = []
    for source in sources:
        try:
            observations = parse_official_feed(
                getter(source["feed_url"], set(source["item_hosts"])),
                source,
                role_families,
                discovered_at,
            )
        except (ET.ParseError, ValueError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{source['id']}: {type(exc).__name__}: {exc}")
            continue
        successful_sources += 1
        for observation in observations:
            key = candidate_key(observation)
            if key in known:
                continue
            candidates[key] = observation
            known.add(key)
            new_count += 1
    return sorted(candidates.values(), key=candidate_key), new_count, successful_sources, failures


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    refreshed_at = now_date()
    document = load_json(PROJECTS_PATH)
    taxonomy = load_json(TAXONOMY_PATH)
    exclusions = load_json(DIRECTORY / "exclusions.json")
    discovery_sources = load_json(DISCOVERY_SOURCES_PATH)
    candidate_document = load_json(CANDIDATES_PATH, {"version": "1.0", "updated_at": None, "candidates": []})
    review_document = load_json(LICENSE_REVIEW_PATH, {"version": "1.0", "updated_at": None, "entries": []})
    local_runtimes_document = load_json(LOCAL_RUNTIMES_PATH, {"version": "1.0", "verified_at": None, "runtimes": []})
    projects = document["projects"]
    previous_reviews = {item["project_id"]: item for item in review_document["entries"]}

    if source_errors := validate_discovery_sources(discovery_sources):
        for error in source_errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    successes, metadata_failures, reviews = refresh_projects(
        projects,
        previous_reviews,
        github_get,
        token,
        refreshed_at,
    )
    github_projects = sum(bool(project.get("repo")) for project in projects)
    success_ratio = successes / github_projects if github_projects else 1.0
    if success_ratio < MIN_METADATA_SUCCESS_RATIO:
        print(
            f"error: refreshed {successes}/{github_projects} GitHub projects; minimum success ratio is {MIN_METADATA_SUCCESS_RATIO:.0%}",
            file=sys.stderr,
        )
        for failure in metadata_failures:
            print(f"warning: {failure}", file=sys.stderr)
        return 1

    role_families = {item["id"]: item["family"] for item in taxonomy["primary_roles"]}
    known_projects = {project["repo"].lower() for project in projects if project.get("repo")}
    known_projects.update(
        item["repo"].lower()
        for item in exclusions.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    )
    candidates, new_candidates, successful_queries, discovery_failures = discover_candidates(
        known_projects,
        candidate_document["candidates"],
        role_families,
        github_get,
        token,
        refreshed_at,
    )
    if DISCOVERY_QUERIES and successful_queries == 0:
        print("error: every discovery query failed; existing candidate queue was preserved", file=sys.stderr)
        for failure in discovery_failures:
            print(f"warning: {failure}", file=sys.stderr)
        return 1

    known_urls = {project["url"] for project in projects}
    candidates, new_official_candidates, successful_sources, official_failures = discover_official_candidates(
        candidates,
        known_urls,
        discovery_sources["sources"],
        role_families,
        refreshed_at,
    )
    if discovery_sources["sources"] and successful_sources == 0:
        print("error: every official discovery source failed; existing candidate queue was preserved", file=sys.stderr)
        for failure in official_failures:
            print(f"warning: {failure}", file=sys.stderr)
        return 1

    runtime_successes, runtime_failures = refresh_local_runtime_stars(
        local_runtimes_document["runtimes"],
        github_get,
        token,
        refreshed_at,
    )

    for failure in metadata_failures:
        print(f"warning: {failure}", file=sys.stderr)
    for failure in discovery_failures:
        print(f"warning: discovery query failed: {failure}", file=sys.stderr)
    for failure in official_failures:
        print(f"warning: official discovery source failed: {failure}", file=sys.stderr)
    for failure in runtime_failures:
        print(f"warning: local runtime star refresh failed: {failure}", file=sys.stderr)

    projects.sort(key=lambda project: (project["system_family"], project["name"].lower()))
    document["generated_at"] = refreshed_at
    write_json(PROJECTS_PATH, document)
    write_json(CANDIDATES_PATH, {"version": "1.0", "updated_at": refreshed_at, "candidates": candidates})
    write_json(LICENSE_REVIEW_PATH, {"version": "1.0", "updated_at": refreshed_at, "entries": reviews})
    write_json(LOCAL_RUNTIMES_PATH, local_runtimes_document)
    sync_web_data()

    print(json.dumps({
        "metadata_refreshed": successes,
        "metadata_failed": len(metadata_failures),
        "discovery_queries_succeeded": successful_queries,
        "official_sources_succeeded": successful_sources,
        "new_candidates": new_candidates + new_official_candidates,
        "candidate_queue": len(candidates),
        "license_reviews_open": len(reviews),
        "local_runtime_stars_refreshed": runtime_successes,
        "local_runtime_stars_failed": len(runtime_failures),
        "auto_added": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
