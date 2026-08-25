#!/usr/bin/env python3
"""Refresh live GitHub metadata and maintain human-review queues.

The updater may change live metadata and safety status. It never changes human
editorial analysis, scores, license evidence, or editorial verification dates.
Discovered projects remain provisional in ``directory/candidates.json``.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

try:
    from .sync_web_data import main as sync_web_data
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from sync_web_data import main as sync_web_data

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
PROJECTS_PATH = DIRECTORY / "projects.json"
TAXONOMY_PATH = DIRECTORY / "taxonomy.json"
CANDIDATES_PATH = DIRECTORY / "candidates.json"
QUARANTINE_PATH = DIRECTORY / "quarantine.json"

TRANSIENT_HTTP_CODES = {429, 500, 502, 503, 504}
MIN_METADATA_SUCCESS_RATIO = 0.80
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
}
EXCLUDED = {"game", "awesome list", "interview questions", "tutorial only", "course only"}

GitHubGetter = Callable[[str, str | None], dict[str, Any]]


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
        "User-Agent": "agent-systems-atlas-updater/0.3",
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
    if any(term in lowered for term in ("rag", "notebooklm", "chat with your docs", "document assistant")):
        return "ai_knowledge_app", max(relevance, 0.78)
    if any(term in lowered for term in ("note-taking", "note taking", "personal knowledge", "pkm", "digital garden")):
        return "human_pkm", max(relevance, 0.76)
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
        "review_required": ["license_scope", "classification", "traits", "editorial_score"],
    }


def refresh_projects(
    projects: list[dict[str, Any]],
    previous_quarantine: dict[str, dict[str, Any]],
    getter: GitHubGetter,
    token: str | None,
    refreshed_at: str,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[int, list[str], list[dict[str, Any]]]:
    successes = 0
    failures: list[str] = []
    quarantine: list[dict[str, Any]] = []

    for project in projects:
        repo_key = project["repo"].lower()
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
            if project.get("status") == "quarantined" and repo_key in previous_quarantine:
                quarantine.append(previous_quarantine[repo_key])
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{project['repo']}: {type(exc).__name__}: {exc}")
            if project.get("status") == "quarantined" and repo_key in previous_quarantine:
                quarantine.append(previous_quarantine[repo_key])
            continue

        successes += 1
        was_quarantined = project.get("status") == "quarantined"
        if project.get("status") != "candidate" and not was_quarantined:
            project["status"] = "archived" if metadata.get("archived") else "active"
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
        if meaningful_license and detected_license != project.get("license"):
            project["status"] = "quarantined"
            reason = f"GitHub detects {detected_license}; pinned review records {project.get('license')}."
            project["current_repo_note"] = f"License review required: {reason}"
            quarantine.append({
                "repo": project["repo"],
                "expected_license": project.get("license"),
                "detected_license": detected_license,
                "reason": reason,
                "detected_at": refreshed_at,
                "status": "open",
            })
        elif was_quarantined:
            project["status"] = "quarantined"
            quarantine.append(previous_quarantine.get(repo_key, {
                "repo": project["repo"],
                "expected_license": project.get("license"),
                "detected_license": detected_license,
                "reason": "Previously quarantined; human license review is still required.",
                "detected_at": refreshed_at,
                "status": "open",
            }))
        sleeper(0.05)

    return successes, failures, quarantine


def discover_candidates(
    known_projects: set[str],
    previous_candidates: list[dict[str, Any]],
    allowed_licenses: set[str],
    role_families: dict[str, str],
    getter: GitHubGetter,
    token: str | None,
    discovered_at: str,
    *,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    candidates = {item["repo"].lower(): item for item in previous_candidates}
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
            license_id = (repo.get("license") or {}).get("spdx_id")
            if license_id not in allowed_licenses:
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

    ordered = sorted(candidates.values(), key=lambda item: item["repo"].lower())
    return ordered, new_count, successful_queries, failures


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    refreshed_at = now_date()
    document = load_json(PROJECTS_PATH)
    taxonomy = load_json(TAXONOMY_PATH)
    exclusions = load_json(DIRECTORY / "exclusions.json")
    candidate_document = load_json(CANDIDATES_PATH, {"version": "1.0", "updated_at": None, "candidates": []})
    quarantine_document = load_json(QUARANTINE_PATH, {"version": "1.0", "updated_at": None, "entries": []})
    projects = document["projects"]
    previous_quarantine = {item["repo"].lower(): item for item in quarantine_document["entries"]}

    successes, metadata_failures, quarantine = refresh_projects(
        projects,
        previous_quarantine,
        github_get,
        token,
        refreshed_at,
    )
    success_ratio = successes / len(projects) if projects else 1.0
    if success_ratio < MIN_METADATA_SUCCESS_RATIO:
        print(
            f"error: refreshed {successes}/{len(projects)} projects; minimum success ratio is {MIN_METADATA_SUCCESS_RATIO:.0%}",
            file=sys.stderr,
        )
        for failure in metadata_failures:
            print(f"warning: {failure}", file=sys.stderr)
        return 1

    allowed_licenses = {item["id"] for item in taxonomy["allowed_licenses"]}
    role_families = {item["id"]: item["family"] for item in taxonomy["primary_roles"]}
    known_projects = {project["repo"].lower() for project in projects}
    known_projects.update(
        item["repo"].lower()
        for item in exclusions.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    )
    candidates, new_candidates, successful_queries, discovery_failures = discover_candidates(
        known_projects,
        candidate_document["candidates"],
        allowed_licenses,
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

    for failure in metadata_failures:
        print(f"warning: {failure}", file=sys.stderr)
    for failure in discovery_failures:
        print(f"warning: discovery query failed: {failure}", file=sys.stderr)

    projects.sort(key=lambda project: (project["system_family"], project["name"].lower()))
    document["generated_at"] = refreshed_at
    write_json(PROJECTS_PATH, document)
    write_json(CANDIDATES_PATH, {"version": "1.0", "updated_at": refreshed_at, "candidates": candidates})
    write_json(QUARANTINE_PATH, {"version": "1.0", "updated_at": refreshed_at, "entries": quarantine})
    sync_web_data()

    print(json.dumps({
        "metadata_refreshed": successes,
        "metadata_failed": len(metadata_failures),
        "discovery_queries_succeeded": successful_queries,
        "new_candidates": new_candidates,
        "candidate_queue": len(candidates),
        "quarantined": len(quarantine),
        "auto_added": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
