#!/usr/bin/env python3
"""Refresh GitHub metadata and discover new open-source memory-system candidates.

Existing editorial analysis is preserved. New projects are added as low-confidence
candidates only when the repository metadata, license, and keyword classifier all
pass strict gates. A human or coding agent can then deepen the review.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROJECTS_PATH = ROOT / "directory" / "projects.json"
CANDIDATES_PATH = ROOT / "directory" / "candidates.json"
QUARANTINE_PATH = ROOT / "directory" / "quarantine.json"

ALLOWED_LICENSES = {
    "MIT", "Apache-2.0", "AGPL-3.0", "GPL-3.0", "GPL-2.0", "LGPL-3.0",
    "BSD-3-Clause", "BSD-2-Clause", "MPL-2.0", "EUPL-1.2", "ISC", "Unlicense",
}
DISCOVERY_QUERIES = [
    '"second brain" in:name,description stars:>500 archived:false',
    '"agent memory" in:name,description stars:>500 archived:false',
    '"personal knowledge management" in:description stars:>500 archived:false',
    '"local-first" note knowledge in:description stars:>500 archived:false',
    'RAG personal knowledge in:description stars:>1000 archived:false',
    'vector database AI memory in:description stars:>1000 archived:false',
    'screen recall privacy in:description stars:>300 archived:false',
    'coding agent skills workflow in:description stars:>500 archived:false',
]
RELEVANT = {
    "memory", "second brain", "knowledge", "pkm", "note", "rag", "retrieval",
    "vector", "graph", "context", "agent", "recall", "lifelog", "markdown",
}
EXCLUDED = {"game", "awesome list", "interview questions", "tutorial only", "course only"}


def now_date() -> str:
    return datetime.now(UTC).date().isoformat()


def github_get(path: str, token: str | None) -> dict[str, Any]:
    url = path if path.startswith("https://") else f"https://api.github.com{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "memory-systems-atlas-updater/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def classify(text: str) -> tuple[str | None, float]:
    lowered = text.lower()
    if any(term in lowered for term in EXCLUDED):
        return None, 0.0
    hits = sum(1 for term in RELEVANT if term in lowered)
    relevance = min(1.0, hits / 5)
    if "vector database" in lowered or ("vector" in lowered and "database" in lowered):
        return "retrieval_infrastructure", max(relevance, 0.9)
    if any(term in lowered for term in ("screen recall", "lifelog", "activity tracker", "screen history")):
        return "ambient_capture", max(relevance, 0.86)
    if "coding agent" in lowered and any(term in lowered for term in ("skill", "workflow", "software factory")):
        return "coding_agent_workflow", max(relevance, 0.86)
    if any(term in lowered for term in ("stateful agent", "agent runtime", "agent harness")) and "memory" in lowered:
        return "stateful_agent_runtime", max(relevance, 0.83)
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


def candidate_template(repo: dict[str, Any], role: str, confidence: float) -> dict[str, Any]:
    license_id = (repo.get("license") or {}).get("spdx_id")
    dimensions_by_role = {
        "human_pkm": [7.0, 8.0, 7.0, 4.5, 7.0, 6.0],
        "ai_knowledge_app": [7.0, 6.5, 7.5, 6.5, 6.5, 6.0],
        "agent_memory_service": [6.5, 6.0, 7.5, 7.0, 6.5, 5.5],
        "context_graph_engine": [6.0, 6.0, 7.0, 7.5, 5.0, 5.5],
        "stateful_agent_runtime": [6.0, 6.0, 7.0, 7.5, 5.5, 5.5],
        "coding_agent_workflow": [4.5, 7.0, 7.0, 4.0, 6.5, 6.0],
        "ambient_capture": [5.5, 7.0, 6.0, 5.5, 5.5, 5.0],
        "retrieval_infrastructure": [3.5, 6.5, 8.0, 6.0, 5.0, 6.5],
    }
    values = dimensions_by_role[role]
    names = ["second_brain_fit", "data_sovereignty", "interoperability", "memory_intelligence", "operational_simplicity", "maturity"]
    score = dict(zip(names, values, strict=True))
    weights = [0.22, 0.18, 0.16, 0.18, 0.12, 0.14]
    score["overall"] = round(sum(value * weight for value, weight in zip(values, weights, strict=True)), 2)
    architectures = []
    lowered = f"{repo.get('name','')} {repo.get('description') or ''} {' '.join(repo.get('topics') or [])}".lower()
    for term, architecture in [
        ("markdown", "plain_files"), ("vector", "vector_index"), ("graph", "graph_db"),
        ("sqlite", "relational_db"), ("postgres", "relational_db"), ("search", "full_text"),
    ]:
        if term in lowered and architecture not in architectures:
            architectures.append(architecture)
    return {
        "id": re.sub(r"[^a-z0-9]+", "-", repo["full_name"].lower()).strip("-"),
        "name": repo["name"],
        "repo": repo["full_name"],
        "url": repo["html_url"],
        "description": repo.get("description") or "Auto-discovered GitHub project awaiting editorial review.",
        "primary_role": role,
        "secondary_roles": [],
        "agent_relation": "external_memory" if "agent" in lowered else "none",
        "architectures": architectures or ["hybrid"],
        "retrieval_modes": ["semantic_vector"] if "vector" in lowered else ["keyword"],
        "capture_modes": ["file_import"],
        "memory_lifecycle": ["upsert_rewrite"],
        "canonical_data": "unknown — editorial review required",
        "deployment": ["unknown"],
        "local_first": "local-first" in lowered or "local first" in lowered,
        "human_editable": "markdown" in lowered,
        "provenance": "unknown",
        "license": license_id,
        "license_scope": "open_source",
        "status": "candidate",
        "stars": repo.get("stargazers_count"),
        "stars_verified_at": now_date(),
        "historical_stars": None,
        "current_repo_note": "Automatically discovered; requires deep README, code, and license review.",
        "score": score,
        "strengths": ["Passed strict relevance and open-source metadata gates."],
        "weaknesses": ["Not yet deeply reviewed; category and score are provisional."],
        "why_it_matters": "Potentially relevant project discovered by the weekly GitHub scan.",
        "research_confidence": "low",
        "classification_confidence": round(confidence, 2),
        "verified_at": now_date(),
    }


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    document = json.loads(PROJECTS_PATH.read_text(encoding="utf-8"))
    projects = document["projects"]
    quarantined: list[dict[str, Any]] = []
    existing = {project["repo"].lower(): project for project in projects}

    for project in list(projects):
        try:
            metadata = github_get(f"/repos/{project['repo']}", token)
        except urllib.error.HTTPError as exc:
            if exc.code in {404, 410}:
                project["status"] = "removed"
                project["current_repo_note"] = f"GitHub returned {exc.code} on {now_date()}."
                continue
            print(f"warning: unable to update {project['repo']}: {exc}", file=sys.stderr)
            continue
        project.update({
            "stars": metadata.get("stargazers_count"),
            "stars_verified_at": now_date(),
            "status": "archived" if metadata.get("archived") else ("candidate" if project.get("status") == "candidate" else "active"),
            "pushed_at": metadata.get("pushed_at"),
            "forks": metadata.get("forks_count"),
            "open_issues": metadata.get("open_issues_count"),
            "verified_at": now_date(),
        })
        license_id = (metadata.get("license") or {}).get("spdx_id")
        if license_id and license_id != "NOASSERTION":
            project["license"] = license_id
            if license_id not in ALLOWED_LICENSES:
                quarantined.append({"project": project, "reason": f"License changed to {license_id}"})
                projects.remove(project)
        elif project.get("research_confidence") == "low":
            quarantined.append({"project": project, "reason": "License could not be verified automatically"})
            projects.remove(project)
        time.sleep(0.05)

    candidates: list[dict[str, Any]] = []
    for query in DISCOVERY_QUERIES:
        encoded = urllib.parse.quote(query)
        try:
            result = github_get(f"/search/repositories?q={encoded}&sort=stars&order=desc&per_page=30", token)
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            print(f"warning: discovery query failed: {query}: {exc}", file=sys.stderr)
            continue
        for repo in result.get("items", []):
            full_name = repo["full_name"].lower()
            if full_name in existing or repo.get("fork") or repo.get("archived"):
                continue
            license_id = (repo.get("license") or {}).get("spdx_id")
            if license_id not in ALLOWED_LICENSES:
                continue
            text = f"{repo.get('name','')} {repo.get('description') or ''} {' '.join(repo.get('topics') or [])}"
            role, confidence = classify(text)
            if not role or confidence < 0.75:
                continue
            candidate = candidate_template(repo, role, confidence)
            candidates.append(candidate)
            existing[full_name] = candidate
        time.sleep(0.1)

    # Add only high-confidence candidates to the main data, visibly marked as candidates.
    promoted = [candidate for candidate in candidates if candidate["classification_confidence"] >= 0.85]
    projects.extend(promoted)
    projects.sort(key=lambda project: (project.get("status") != "active", -(project.get("score") or {}).get("overall", 0), project["name"].lower()))
    document["generated_at"] = now_date()
    PROJECTS_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CANDIDATES_PATH.write_text(json.dumps({"generated_at": now_date(), "candidates": candidates}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    QUARANTINE_PATH.write_text(json.dumps({"generated_at": now_date(), "entries": quarantined}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in ("projects.json", "taxonomy.json", "exclusions.json"):
        shutil.copy2(ROOT / "directory" / name, ROOT / "web" / name)
    print(json.dumps({"updated": len(projects), "discovered": len(candidates), "auto_added": len(promoted), "quarantined": len(quarantined)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
