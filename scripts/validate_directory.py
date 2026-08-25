#!/usr/bin/env python3
"""Validate the canonical directory, review queues, and published data copies."""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
PUBLISHED_DATA = ("projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json")
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
REPO_PATTERN = re.compile(r"[^/\s]+/[^/\s]+")
SHA_PATTERN = re.compile(r"[0-9a-f]{40}")

TAXONOMY_GROUPS = (
    "system_families",
    "primary_roles",
    "agent_relations",
    "architectures",
    "retrieval_modes",
    "capture_modes",
    "memory_lifecycle",
    "agent_interfaces",
    "execution_boundaries",
    "agent_capabilities",
    "deployment_modes",
    "project_statuses",
    "provenance_levels",
    "research_confidence_levels",
    "allowed_licenses",
    "license_scopes",
    "score_profiles",
)

PROJECT_REQUIRED = {
    "id", "system_family", "score_profile", "name", "repo", "url", "description",
    "primary_role", "secondary_roles", "agent_relation", "architectures", "retrieval_modes",
    "capture_modes", "memory_lifecycle", "canonical_data", "deployment", "local_first",
    "human_editable", "provenance", "license", "license_scope", "status", "stars",
    "stars_verified_at", "historical_stars", "current_repo_note", "score", "strengths",
    "weaknesses", "why_it_matters", "research_confidence", "verified_at",
}
PROJECT_OPTIONAL = {
    "agent_interfaces", "execution_boundaries", "agent_capabilities", "pushed_at", "forks",
    "open_issues", "metadata_verified_at", "github_detected_license",
}


def load(name: str) -> dict[str, Any]:
    return json.loads((DIRECTORY / name).read_text(encoding="utf-8"))


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def valid_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def ids_for(taxonomy: dict[str, Any], group: str, errors: list[str]) -> set[str]:
    items = taxonomy.get(group)
    if not isinstance(items, list):
        errors.append(f"taxonomy: {group} must be a list")
        return set()
    ids: list[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            errors.append(f"taxonomy: {group}[{index}] requires a string id")
            continue
        ids.append(item["id"])
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates:
        errors.append(f"taxonomy: {group} has duplicate ids {duplicates}")
    return set(ids)


def validate_string_list(
    project: dict[str, Any],
    field: str,
    allowed: set[str] | None,
    prefix: str,
    errors: list[str],
    *,
    allow_empty: bool = False,
) -> None:
    values = project.get(field)
    if not isinstance(values, list) or (not values and not allow_empty):
        errors.append(f"{prefix}: {field} must be {'a' if allow_empty else 'a non-empty'} list")
        return
    if any(not isinstance(value, str) for value in values):
        errors.append(f"{prefix}: {field} must contain only strings")
        return
    if len(values) != len(set(values)):
        errors.append(f"{prefix}: {field} contains duplicates")
    if allowed is not None and (unknown := set(values) - allowed):
        errors.append(f"{prefix}: unknown {field} {sorted(unknown)}")


def validate(root: Path = ROOT) -> list[str]:
    global DIRECTORY
    original_directory = DIRECTORY
    DIRECTORY = root / "directory"
    try:
        taxonomy = load("taxonomy.json")
        data = load("projects.json")
        evidence_data = load("license-evidence.json")
        candidates_data = load("candidates.json")
        quarantine_data = load("quarantine.json")
        exclusions_data = load("exclusions.json")
    finally:
        DIRECTORY = original_directory

    errors: list[str] = []
    enum_ids = {group: ids_for(taxonomy, group, errors) for group in TAXONOMY_GROUPS}
    families = enum_ids["system_families"]
    roles = {
        item["id"]: item.get("family")
        for item in taxonomy.get("primary_roles", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for role, family in roles.items():
        if family not in families:
            errors.append(f"taxonomy: role {role!r} has unknown family {family!r}")

    profiles = {
        item["id"]: item
        for item in taxonomy.get("score_profiles", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for profile_id, profile in profiles.items():
        if profile.get("family") not in families:
            errors.append(f"taxonomy: score profile {profile_id!r} has unknown family")
        dimensions = profile.get("dimensions")
        if not isinstance(dimensions, list) or not dimensions:
            errors.append(f"taxonomy: score profile {profile_id!r} requires dimensions")
            continue
        dimension_ids = [item.get("id") for item in dimensions if isinstance(item, dict)]
        if len(dimension_ids) != len(set(dimension_ids)):
            errors.append(f"taxonomy: score profile {profile_id!r} has duplicate dimensions")
        weights = [item.get("weight") for item in dimensions if isinstance(item, dict)]
        if len(weights) != len(dimensions) or any(not is_number(weight) or weight <= 0 for weight in weights):
            errors.append(f"taxonomy: score profile {profile_id!r} has invalid weights")
        elif abs(sum(weights) - 1.0) > 1e-9:
            errors.append(f"taxonomy: score profile {profile_id!r} weights do not total 1")

    projects_value = data.get("projects")
    if not valid_date(data.get("generated_at")):
        errors.append("projects.json: generated_at must be an ISO date")
    if not isinstance(projects_value, list):
        return errors + ["projects.json: projects must be a list"]
    projects: list[dict[str, Any]] = projects_value
    ids: set[str] = set()
    repos: set[str] = set()

    for project in projects:
        if not isinstance(project, dict):
            errors.append("projects.json: every project must be an object")
            continue
        prefix = str(project.get("repo", project.get("id", "unknown")))
        missing = PROJECT_REQUIRED - set(project)
        unknown_fields = set(project) - PROJECT_REQUIRED - PROJECT_OPTIONAL
        if missing:
            errors.append(f"{prefix}: missing required fields {sorted(missing)}")
        if unknown_fields:
            errors.append(f"{prefix}: unknown fields {sorted(unknown_fields)}")

        project_id = project.get("id")
        if not isinstance(project_id, str) or not ID_PATTERN.fullmatch(project_id):
            errors.append(f"{prefix}: invalid id")
        elif project_id in ids:
            errors.append(f"{prefix}: duplicate id")
        else:
            ids.add(project_id)

        repo = project.get("repo")
        repo_key = repo.lower() if isinstance(repo, str) else ""
        if not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo):
            errors.append(f"{prefix}: invalid GitHub repository")
        elif repo_key in repos:
            errors.append(f"{prefix}: duplicate repository")
        else:
            repos.add(repo_key)
        if project.get("url") != f"https://github.com/{repo}":
            errors.append(f"{prefix}: url must be the canonical GitHub repository URL")

        for field in ("name", "description", "canonical_data", "why_it_matters"):
            if not isinstance(project.get(field), str) or not project[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        for field in ("local_first", "human_editable"):
            if not isinstance(project.get(field), bool):
                errors.append(f"{prefix}: {field} must be boolean")

        family = project.get("system_family")
        if family not in families:
            errors.append(f"{prefix}: unknown system family {family!r}")
        role = project.get("primary_role")
        if role not in roles:
            errors.append(f"{prefix}: unknown role {role!r}")
        elif roles[role] != family:
            errors.append(f"{prefix}: role {role!r} belongs to {roles[role]!r}, not {family!r}")
        validate_string_list(project, "secondary_roles", set(roles), prefix, errors, allow_empty=True)
        if role in project.get("secondary_roles", []):
            errors.append(f"{prefix}: primary role must not be repeated as a secondary role")

        profile_id = project.get("score_profile")
        profile = profiles.get(profile_id)
        if not profile:
            errors.append(f"{prefix}: unknown score profile {profile_id!r}")
        elif profile.get("family") != family:
            errors.append(f"{prefix}: score profile {profile_id!r} does not match {family!r}")
        else:
            dimensions = {item["id"]: item["weight"] for item in profile["dimensions"]}
            score = project.get("score")
            if not isinstance(score, dict) or set(score) != set(dimensions) | {"overall"}:
                errors.append(f"{prefix}: score keys must exactly match profile {profile_id!r}")
            elif any(not is_number(score[key]) or not 0 <= score[key] <= 10 for key in dimensions):
                errors.append(f"{prefix}: score dimensions must be numbers between 0 and 10")
            elif not is_number(score["overall"]):
                errors.append(f"{prefix}: score overall must be numeric")
            else:
                calculated = round(sum(score[key] * weight for key, weight in dimensions.items()), 2)
                if score["overall"] != calculated:
                    errors.append(f"{prefix}: overall {score['overall']} does not match weighted {calculated}")

        for field, group in (
            ("architectures", "architectures"),
            ("retrieval_modes", "retrieval_modes"),
            ("capture_modes", "capture_modes"),
            ("memory_lifecycle", "memory_lifecycle"),
            ("deployment", "deployment_modes"),
        ):
            validate_string_list(project, field, enum_ids[group], prefix, errors)
        if project.get("agent_relation") not in enum_ids["agent_relations"]:
            errors.append(f"{prefix}: unknown agent relation")
        if project.get("provenance") not in enum_ids["provenance_levels"]:
            errors.append(f"{prefix}: unknown provenance level")
        if project.get("research_confidence") not in enum_ids["research_confidence_levels"]:
            errors.append(f"{prefix}: unknown research confidence")
        if project.get("status") not in enum_ids["project_statuses"]:
            errors.append(f"{prefix}: unknown project status")

        if project.get("license_scope") != "open_source":
            errors.append(f"{prefix}: non-open-source entry in main directory")
        if project.get("license") not in enum_ids["allowed_licenses"]:
            errors.append(f"{prefix}: license is not in the curated OSI-compatible allowlist")

        if family == "agent_system":
            for field, group in (
                ("agent_interfaces", "agent_interfaces"),
                ("execution_boundaries", "execution_boundaries"),
                ("agent_capabilities", "agent_capabilities"),
            ):
                validate_string_list(project, field, enum_ids[group], prefix, errors)

        for field in ("strengths", "weaknesses"):
            validate_string_list(project, field, None, prefix, errors)
        if not valid_date(project.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")
        if project.get("stars") is not None and (not isinstance(project["stars"], int) or project["stars"] < 0):
            errors.append(f"{prefix}: stars must be a non-negative integer or null")
        if project.get("status") in {"active", "archived"} and project.get("stars") is None:
            errors.append(f"{prefix}: active and archived projects require refreshed stars")
        if project.get("stars") is not None and not valid_date(project.get("stars_verified_at")):
            errors.append(f"{prefix}: populated stars require stars_verified_at")
        if project.get("stars_verified_at") is not None and not valid_date(project["stars_verified_at"]):
            errors.append(f"{prefix}: stars_verified_at must be null or an ISO date")
        if project.get("historical_stars") is not None and (
            not isinstance(project["historical_stars"], int) or project["historical_stars"] < 0
        ):
            errors.append(f"{prefix}: historical_stars must be a non-negative integer or null")
        if project.get("current_repo_note") is not None and not isinstance(project["current_repo_note"], str):
            errors.append(f"{prefix}: current_repo_note must be a string or null")
        if project.get("metadata_verified_at") is not None and not valid_date(project["metadata_verified_at"]):
            errors.append(f"{prefix}: metadata_verified_at must be an ISO date")
        for field in ("forks", "open_issues"):
            if project.get(field) is not None and (not isinstance(project[field], int) or project[field] < 0):
                errors.append(f"{prefix}: {field} must be a non-negative integer or null")
        for field in ("pushed_at", "github_detected_license"):
            if project.get(field) is not None and not isinstance(project[field], str):
                errors.append(f"{prefix}: {field} must be a string or null")

    evidence_entries = evidence_data.get("entries", [])
    if not valid_date(evidence_data.get("verified_at")):
        errors.append("license-evidence.json: verified_at must be an ISO date")
    evidence_repos = [item.get("repo", "").lower() for item in evidence_entries if isinstance(item, dict)]
    duplicate_evidence = sorted({repo for repo in evidence_repos if evidence_repos.count(repo) > 1})
    if duplicate_evidence:
        errors.append(f"license evidence has duplicate repositories: {duplicate_evidence}")
    evidence = {item["repo"].lower(): item for item in evidence_entries if isinstance(item, dict) and item.get("repo")}
    if set(evidence) != repos:
        errors.append(f"license evidence/project repositories differ: missing={sorted(repos - set(evidence))}, extra={sorted(set(evidence) - repos)}")
    projects_by_repo = {project["repo"].lower(): project for project in projects if isinstance(project.get("repo"), str)}
    for repo_key, project in projects_by_repo.items():
        proof = evidence.get(repo_key)
        if not proof:
            continue
        prefix = project["repo"]
        if proof.get("spdx_id") != project.get("license"):
            errors.append(f"{prefix}: evidence license does not match project license")
        blob_sha = proof.get("blob_sha")
        if not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
            errors.append(f"{prefix}: invalid license blob SHA")
            continue
        path = proof.get("path")
        if not isinstance(path, str) or not path:
            errors.append(f"{prefix}: license evidence requires a path")
        source_prefix = f"https://github.com/{project['repo']}/blob/"
        if not isinstance(proof.get("url"), str) or not proof["url"].startswith(source_prefix):
            errors.append(f"{prefix}: source license URL must be a GitHub blob URL")
        expected_immutable = f"https://api.github.com/repos/{project['repo']}/git/blobs/{blob_sha}"
        if proof.get("immutable_url") != expected_immutable:
            errors.append(f"{prefix}: immutable license URL must address the recorded blob SHA")

    candidate_entries = candidates_data.get("candidates")
    if not isinstance(candidate_entries, list):
        errors.append("candidates.json: candidates must be a list")
        candidate_entries = []
    candidate_repos: set[str] = set()
    for candidate in candidate_entries:
        prefix = candidate.get("repo", "unknown") if isinstance(candidate, dict) else "unknown"
        required = {
            "repo", "name", "url", "description", "proposed_system_family", "proposed_primary_role",
            "classification_confidence", "github_detected_license", "stars", "topics", "status",
            "discovered_at", "review_required",
        }
        if not isinstance(candidate, dict) or set(candidate) != required:
            errors.append(f"candidate {prefix}: fields do not match candidate schema")
            continue
        repo_key = candidate["repo"].lower()
        if repo_key in candidate_repos or repo_key in repos:
            errors.append(f"candidate {prefix}: duplicate or already curated repository")
        candidate_repos.add(repo_key)
        if candidate["status"] != "provisional":
            errors.append(f"candidate {prefix}: status must be provisional")
        if candidate["url"] != f"https://github.com/{candidate['repo']}":
            errors.append(f"candidate {prefix}: url must be the canonical GitHub repository URL")
        family = candidate["proposed_system_family"]
        role = candidate["proposed_primary_role"]
        if family not in families or role not in roles or roles.get(role) != family:
            errors.append(f"candidate {prefix}: proposed family and role are incompatible")
        if candidate["github_detected_license"] not in enum_ids["allowed_licenses"]:
            errors.append(f"candidate {prefix}: detected license is not allowed")
        if not is_number(candidate["classification_confidence"]) or not 0 <= candidate["classification_confidence"] <= 1:
            errors.append(f"candidate {prefix}: classification confidence must be between 0 and 1")
        if candidate["stars"] is not None and (not isinstance(candidate["stars"], int) or candidate["stars"] < 0):
            errors.append(f"candidate {prefix}: stars must be a non-negative integer or null")
        if not isinstance(candidate["topics"], list) or any(not isinstance(topic, str) for topic in candidate["topics"]):
            errors.append(f"candidate {prefix}: topics must be a list of strings")
        review_required = candidate["review_required"]
        if not isinstance(review_required, list) or any(not isinstance(item, str) for item in review_required) or set(review_required) != {
            "license_scope", "classification", "traits", "editorial_score"
        }:
            errors.append(f"candidate {prefix}: review_required is incomplete")
        if not valid_date(candidate["discovered_at"]):
            errors.append(f"candidate {prefix}: discovered_at must be an ISO date")

    quarantine_entries = quarantine_data.get("entries")
    if not isinstance(quarantine_entries, list):
        errors.append("quarantine.json: entries must be a list")
        quarantine_entries = []
    quarantine_repos = [item.get("repo", "").lower() for item in quarantine_entries if isinstance(item, dict)]
    if len(quarantine_repos) != len(set(quarantine_repos)):
        errors.append("quarantine.json: repository entries must be unique")
    status_quarantined = {repo for repo, project in projects_by_repo.items() if project.get("status") == "quarantined"}
    if set(quarantine_repos) != status_quarantined:
        errors.append("quarantine queue and quarantined project statuses must match")
    for item in quarantine_entries:
        if not isinstance(item, dict):
            errors.append("quarantine.json: every entry must be an object")
            continue
        project = projects_by_repo.get(str(item.get("repo", "")).lower())
        if item.get("status") != "open" or not valid_date(item.get("detected_at")):
            errors.append(f"quarantine {item.get('repo', 'unknown')}: invalid status or detected_at")
        if project and item.get("expected_license") != project.get("license"):
            errors.append(f"quarantine {item.get('repo', 'unknown')}: expected license does not match project")

    excluded_repos = {
        item["repo"].lower()
        for item in exclusions_data.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    }
    if overlap := excluded_repos & repos:
        errors.append(f"repositories cannot be both included and excluded: {sorted(overlap)}")
    if overlap := excluded_repos & candidate_repos:
        errors.append(f"repositories cannot be both candidates and excluded: {sorted(overlap)}")

    for queue_name, document in (("candidates.json", candidates_data), ("quarantine.json", quarantine_data)):
        if document.get("version") != "1.0":
            errors.append(f"{queue_name}: unsupported version")
        if document.get("updated_at") is not None and not valid_date(document["updated_at"]):
            errors.append(f"{queue_name}: updated_at must be null or an ISO date")

    for name in PUBLISHED_DATA:
        if (root / "directory" / name).read_bytes() != (root / "web" / name).read_bytes():
            errors.append(f"web/{name} is not synchronized with directory/{name}")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        raise SystemExit("\n".join(errors))
    data = load("projects.json")
    families = sorted({project["system_family"] for project in data["projects"]})
    counts = {family: sum(project["system_family"] == family for project in data["projects"]) for family in families}
    print(f"validated {len(data['projects'])} projects with pinned licenses: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
