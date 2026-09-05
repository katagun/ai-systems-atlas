#!/usr/bin/env python3
"""Validate the canonical directory, review queues, and published data copies."""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any, NamedTuple

try:
    from .discovery_sources import canonical_url_key, validate_discovery_sources
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from discovery_sources import canonical_url_key, validate_discovery_sources

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "directory"
PUBLISHED_DATA = (
    "projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json",
    "specifications.json", "inference-services.json", "local-runtimes.json", "models.json",
)
CATALOG_DOCUMENTS = (
    *PUBLISHED_DATA, "candidates.json", "model-candidates.json", "license-review.json",
    "discovery-sources.json",
)
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
REPO_PATTERN = re.compile(r"[^/\s]+/[^/\s]+")
SHA_PATTERN = re.compile(r"[0-9a-f]{40}")
CONTENT_SHA_PATTERN = re.compile(r"[0-9a-f]{64}")
EVIDENCE_REQUIRED = {"label", "url", "kind", "content_sha256", "fetched_at"}
BLOB_EVIDENCE_REQUIRED = {"blob_sha", "immutable_url"}

TAXONOMY_GROUPS = (
    "system_families",
    "primary_roles",
    "agent_relations",
    "provider_relationships",
    "model_backends",
    "inference_service_types",
    "inference_delivery_modes",
    "inference_model_sources",
    "inference_api_styles",
    "local_runtime_types",
    "runtime_accelerators",
    "runtime_model_formats",
    "runtime_serving_modes",
    "runtime_deployment_surfaces",
    "model_types",
    "model_modalities",
    "model_distribution_modes",
    "specification_types",
    "specification_scopes",
    "specification_statuses",
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
    "licenses",
    "source_models",
    "license_review_statuses",
    "score_profiles",
)

PROJECT_REQUIRED = {
    "id", "system_family", "score_profile", "name", "repo", "url", "description",
    "primary_role", "secondary_roles", "agent_relation", "architectures", "retrieval_modes",
    "capture_modes", "memory_lifecycle", "canonical_data", "deployment", "local_first",
    "human_editable", "provenance", "licenses", "source_model", "license_review_status",
    "status", "stars",
    "stars_verified_at", "historical_stars", "current_repo_note", "score", "strengths",
    "weaknesses", "why_it_matters", "research_confidence", "verified_at",
}
PROJECT_OPTIONAL = {
    "agent_interfaces", "execution_boundaries", "agent_capabilities", "pushed_at", "forks",
    "open_issues", "metadata_verified_at", "github_detected_license", "provider_relationship",
    "model_backends", "superseded_by",
}

SPECIFICATION_REQUIRED = {
    "id", "name", "short_name", "specification_type", "scope", "status",
    "current_version", "stewards", "repo", "url", "description", "standardizes",
    "does_not_standardize", "licenses", "license_note", "related_specifications",
    "evidence", "license_evidence", "verified_at",
}

LOCAL_RUNTIME_REQUIRED = {
    "id", "name", "maintainer", "runtime_type", "repo", "url", "description",
    "runtime_boundary", "accelerators", "model_formats", "serving_modes", "api_styles",
    "deployment_surfaces", "model_management", "hardware_requirements",
    "operational_controls", "strengths", "tradeoffs", "licenses", "source_model",
    "license_note", "license_evidence", "score_profile", "score", "evidence", "verified_at",
}
LOCAL_RUNTIME_OPTIONAL = {"stars", "stars_verified_at"}

INFERENCE_SERVICE_REQUIRED = {
    "id", "name", "operator", "service_type", "url", "description", "service_boundary",
    "delivery_modes", "model_sources", "api_styles", "regional_controls",
    "retention_controls", "routing", "customization", "strengths", "tradeoffs",
    "score_profile", "score", "terms", "evidence", "verified_at",
}

CANDIDATE_REQUIRED = {
    "repo", "name", "url", "description", "proposed_system_family", "proposed_primary_role",
    "classification_confidence", "github_detected_license", "stars", "topics", "status",
    "discovered_at", "review_required",
}
CANDIDATE_OPTIONAL = {"triage"}

TRIAGE_REQUIRED = {"verdict", "rule", "finding", "evidence", "proposed_at", "proposer"}
TRIAGE_OPTIONAL = {"held_by"}
TRIAGE_VERDICTS = {"out_of_scope", "held", "review_ready"}

MODEL_REQUIRED = {
    "id", "source_id", "name", "developer", "url", "description", "model_type",
    "distribution_modes", "source_metadata", "licenses", "source_model",
    "license_review_status", "license_note", "license_evidence", "access_boundary",
    "strengths", "tradeoffs", "score_profile", "score", "evidence",
    "metadata_verified_at", "verified_at",
}
MODEL_SOURCE_METADATA_REQUIRED = {
    "name", "description", "family", "release_date", "last_updated", "knowledge_cutoff",
    "modalities", "capabilities", "limits", "reported_open_weights", "reported_license",
    "links", "weights",
}
MODEL_CAPABILITIES = {
    "attachment", "reasoning", "tool_call", "structured_output", "temperature",
}
MODEL_LIMITS = {"context", "input", "output"}
MODEL_REVIEW_REQUIRED = {
    "official_identity", "model_boundary", "license_evidence", "source_model",
    "model_access_score",
}


def load_document(directory: Path, name: str) -> dict[str, Any]:
    return json.loads((directory / name).read_text(encoding="utf-8"))


def load(name: str) -> dict[str, Any]:
    return load_document(DIRECTORY, name)


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def valid_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def valid_partial_date(value: object) -> bool:
    if value is None:
        return True
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?", value):
        return False
    if len(value) == 7:
        return 1 <= int(value[5:7]) <= 12
    return valid_date(value)


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


def validate_collection_envelope(
    data: dict[str, Any],
    name: str,
    version: str,
    key: str,
    errors: list[str],
) -> list[Any]:
    """Validate a published collection's version, date, and record identifiers."""
    if data.get("version") != version:
        errors.append(f"{name}: unsupported version")
    if not valid_date(data.get("verified_at")):
        errors.append(f"{name}: verified_at must be an ISO date")
    records = data.get(key)
    if not isinstance(records, list):
        errors.append(f"{name}: {key} must be a list")
        return []
    identifiers = {
        item.get("id") for item in records
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if len(identifiers) != len(records):
        errors.append(f"{name}: ids must be present and unique")
    return records


def validate_score_profile(
    taxonomy: dict[str, Any],
    key: str,
    profile_id: str,
    label: str,
    errors: list[str],
) -> dict[str, float]:
    """Validate a dedicated collection score profile and return its weights."""
    profile = taxonomy.get(key)
    weights: dict[str, float] = {}
    if not isinstance(profile, dict):
        errors.append(f"taxonomy: {key} must be an object")
        return weights
    if profile.get("id") != profile_id:
        errors.append(f"taxonomy: {label} score profile requires id {profile_id!r}")
    if not isinstance(profile.get("name"), str) or not profile["name"].strip():
        errors.append(f"taxonomy: {label} score profile requires a name")
    dimensions = profile.get("dimensions")
    if not isinstance(dimensions, list) or not dimensions:
        errors.append(f"taxonomy: {label} score profile requires dimensions")
        return weights
    for item in dimensions:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            errors.append(f"taxonomy: {label} score dimensions require string ids")
            continue
        weight = item.get("weight")
        if not is_number(weight) or weight <= 0:
            errors.append(f"taxonomy: {label} score dimensions require positive weights")
            continue
        if item["id"] in weights:
            errors.append(f"taxonomy: {label} score profile has duplicate dimensions")
        weights[item["id"]] = weight
        if not isinstance(item.get("definition"), str) or not item["definition"].strip():
            errors.append(f"taxonomy: {label} score dimensions require definitions")
    if weights and abs(sum(weights.values()) - 1.0) > 1e-9:
        errors.append(f"taxonomy: {label} score profile weights do not total 1")
    return weights


def validate_record_score(
    record: dict[str, Any],
    dimensions: dict[str, float],
    profile_id: str,
    label: str,
    prefix: str,
    errors: list[str],
) -> None:
    """Validate a record's score against its dedicated profile."""
    if record.get("score_profile") != profile_id:
        errors.append(f"{prefix}: score_profile must be {profile_id!r}")
    score = record.get("score")
    if not isinstance(score, dict) or set(score) != set(dimensions) | {"overall"}:
        errors.append(f"{prefix}: score keys must exactly match the {label} profile")
    elif any(
        not is_number(score[key]) or not 0 <= score[key] <= 10
        for key in dimensions
    ):
        errors.append(f"{prefix}: score dimensions must be numbers between 0 and 10")
    elif not is_number(score["overall"]):
        errors.append(f"{prefix}: score overall must be numeric")
    else:
        calculated = round(sum(
            score[key] * weight for key, weight in dimensions.items()
        ), 2)
        if score["overall"] != calculated:
            errors.append(
                f"{prefix}: overall {score['overall']} does not match weighted {calculated}"
            )


class Taxonomy(NamedTuple):
    """The enum, role, and score-profile vocabulary every collection validates against."""

    enum_ids: dict[str, set[str]]
    families: set[str]
    roles: dict[str, Any]
    profiles: dict[str, Any]
    license_kinds: dict[str, Any]
    inference_dimensions: dict[str, float]
    runtime_dimensions: dict[str, float]
    model_dimensions: dict[str, float]


class ProjectIndex(NamedTuple):
    """Identifiers the later collections and queues check themselves against."""

    projects: list[dict[str, Any]]
    ids: set[str]
    repos: set[str]
    url_keys: set[str]


def validate_taxonomy(taxonomy: dict[str, Any], errors: list[str]) -> Taxonomy:
    """Validate the shared vocabulary, then hand it to every collection validator."""
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
    profiles_by_family: dict[str, list[str]] = {family: [] for family in families}
    license_kinds = {
        item["id"]: item.get("kind")
        for item in taxonomy.get("licenses", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    known_license_kinds = {"open_source", "open_content", "restricted", "proprietary", "unclear"}
    for license_id, kind in license_kinds.items():
        if kind not in known_license_kinds:
            errors.append(f"taxonomy: license {license_id!r} has unknown kind {kind!r}")
    for profile_id, profile in profiles.items():
        profile_family = profile.get("family")
        if profile_family not in families:
            errors.append(f"taxonomy: score profile {profile_id!r} has unknown family")
        else:
            profiles_by_family[profile_family].append(profile_id)
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
    for family, family_profiles in profiles_by_family.items():
        if len(family_profiles) != 1:
            errors.append(
                f"taxonomy: family {family!r} requires exactly one score profile; "
                f"found {sorted(family_profiles)}"
            )

    inference_score_dimensions = validate_score_profile(
        taxonomy, "inference_service_score_profile", "inference_service", "inference service", errors,
    )
    local_runtime_score_dimensions = validate_score_profile(
        taxonomy, "local_runtime_score_profile", "local_runtime", "local runtime", errors,
    )
    model_score_dimensions = validate_score_profile(
        taxonomy, "model_score_profile", "model_access", "model", errors,
    )
    return Taxonomy(
        enum_ids=enum_ids,
        families=families,
        roles=roles,
        profiles=profiles,
        license_kinds=license_kinds,
        inference_dimensions=inference_score_dimensions,
        runtime_dimensions=local_runtime_score_dimensions,
        model_dimensions=model_score_dimensions,
    )


def validate_project_identity(
    project: dict[str, Any],
    prefix: str,
    ids: set[str],
    repos: set[str],
    project_url_keys: set[str],
    errors: list[str],
) -> Any:
    """Validate a project's schema, identifier, repository, and URL; return its repo."""
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
    if repo is not None:
        if not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo):
            errors.append(f"{prefix}: invalid GitHub repository")
        elif repo_key in repos:
            errors.append(f"{prefix}: duplicate repository")
        else:
            repos.add(repo_key)
        if project.get("url") != f"https://github.com/{repo}":
            errors.append(f"{prefix}: url must be the canonical GitHub repository URL")
    elif not isinstance(project.get("url"), str) or not project["url"].startswith("https://"):
        errors.append(f"{prefix}: non-GitHub systems require an authoritative HTTPS URL")
    if isinstance(project.get("url"), str):
        project_url_keys.add(canonical_url_key(project["url"]))
    return repo


def validate_project_classification(
    project: dict[str, Any], prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """Validate a project's family, role, score, traits, and license classification."""
    enum_ids, families, roles, profiles, license_kinds = (
        tax.enum_ids, tax.families, tax.roles, tax.profiles, tax.license_kinds,
    )
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
    incompatible_secondary_roles = sorted(
        secondary_role
        for secondary_role in project.get("secondary_roles", [])
        if roles.get(secondary_role) != family
    )
    if incompatible_secondary_roles:
        errors.append(
            f"{prefix}: secondary roles must belong to {family!r}: "
            f"{incompatible_secondary_roles}"
        )

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
    has_provider_relationship = "provider_relationship" in project
    has_model_backends = "model_backends" in project
    if has_provider_relationship != has_model_backends:
        errors.append(f"{prefix}: provider traits must be supplied together")
    elif has_provider_relationship:
        relationship = project.get("provider_relationship")
        if relationship not in enum_ids["provider_relationships"]:
            errors.append(f"{prefix}: unknown provider relationship")
        validate_string_list(project, "model_backends", enum_ids["model_backends"], prefix, errors)
        if relationship == "provider_native" and len(project.get("model_backends", [])) != 1:
            errors.append(f"{prefix}: provider_native requires exactly one model backend")
    if project.get("provenance") not in enum_ids["provenance_levels"]:
        errors.append(f"{prefix}: unknown provenance level")
    if project.get("research_confidence") not in enum_ids["research_confidence_levels"]:
        errors.append(f"{prefix}: unknown research confidence")
    if project.get("status") not in enum_ids["project_statuses"]:
        errors.append(f"{prefix}: unknown project status")
    if project.get("status") == "superseded":
        if "superseded_by" not in project:
            errors.append(f"{prefix}: superseded status requires superseded_by")
        elif project["superseded_by"] == project.get("id"):
            errors.append(f"{prefix}: a project cannot supersede itself")
    elif "superseded_by" in project:
        errors.append(f"{prefix}: superseded_by requires the superseded status")
    validate_string_list(project, "licenses", enum_ids["licenses"], prefix, errors)
    source_model = project.get("source_model")
    if source_model not in enum_ids["source_models"]:
        errors.append(f"{prefix}: unknown source model")
    else:
        project_license_kinds = {
            license_kinds[license_id]
            for license_id in project.get("licenses", [])
            if license_id in license_kinds
        }
        coherent = {
            "open_source": bool(project_license_kinds) and project_license_kinds <= {"open_source"},
            "mixed_open_source": len(project.get("licenses", [])) >= 2
            and bool(project_license_kinds)
            and project_license_kinds <= {"open_source", "open_content"},
            "mixed_source": "open_source" in project_license_kinds
            and bool(project_license_kinds & {"restricted", "proprietary"}),
            "open_core": "open_source" in project_license_kinds
            and bool(project_license_kinds & {"restricted", "proprietary"}),
            "source_available": "restricted" in project_license_kinds
            and "open_source" not in project_license_kinds,
            "proprietary": project_license_kinds == {"proprietary"},
            "unclear": "unclear" in project_license_kinds,
        }[source_model]
        if not coherent:
            errors.append(f"{prefix}: source model and license kinds are inconsistent")
    if project.get("license_review_status") not in enum_ids["license_review_statuses"]:
        errors.append(f"{prefix}: unknown license review status")

    if family == "agent_system":
        for field, group in (
            ("agent_interfaces", "agent_interfaces"),
            ("execution_boundaries", "execution_boundaries"),
            ("agent_capabilities", "agent_capabilities"),
        ):
            validate_string_list(project, field, enum_ids[group], prefix, errors)


def validate_project_editorial_fields(
    project: dict[str, Any], prefix: str, repo: Any, errors: list[str]
) -> None:
    """Validate a project's editorial prose, review date, and live GitHub metadata."""
    for field in ("strengths", "weaknesses"):
        validate_string_list(project, field, None, prefix, errors)
    if not valid_date(project.get("verified_at")):
        errors.append(f"{prefix}: verified_at must be an ISO date")
    if project.get("stars") is not None and (not isinstance(project["stars"], int) or project["stars"] < 0):
        errors.append(f"{prefix}: stars must be a non-negative integer or null")
    if repo and project.get("status") in {"active", "archived", "superseded"} and project.get("stars") is None:
        errors.append(f"{prefix}: active, archived, and superseded GitHub projects require refreshed stars")
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


def validate_project_record(
    project: Any,
    tax: Taxonomy,
    ids: set[str],
    repos: set[str],
    project_url_keys: set[str],
    errors: list[str],
) -> None:
    if not isinstance(project, dict):
        errors.append("projects.json: every project must be an object")
        return
    prefix = str(project.get("repo") or project.get("id") or "unknown")
    repo = validate_project_identity(project, prefix, ids, repos, project_url_keys, errors)
    validate_project_classification(project, prefix, tax, errors)
    validate_project_editorial_fields(project, prefix, repo, errors)


def validate_projects(
    data: dict[str, Any], tax: Taxonomy, errors: list[str]
) -> ProjectIndex | None:
    """Validate every project record. Returns None when projects.json is unusable."""
    projects_value = data.get("projects")
    if not valid_date(data.get("generated_at")):
        errors.append("projects.json: generated_at must be an ISO date")
    if not isinstance(projects_value, list):
        return None
    entries: list[Any] = projects_value
    ids: set[str] = set()
    repos: set[str] = set()
    project_url_keys: set[str] = set()

    for entry in entries:
        validate_project_record(entry, tax, ids, repos, project_url_keys, errors)

    # An entry that is not an object was reported above and is dropped here. Every
    # later pass cross-checks records against each other — supersession, license
    # evidence, id collisions across collections — and a non-record has nothing to
    # cross-check. Carrying one in the index makes ProjectIndex.projects lie about
    # its own type, which is how a malformed entry used to replace the whole error
    # report with an AttributeError from the evidence pass.
    projects: list[dict[str, Any]] = [entry for entry in entries if isinstance(entry, dict)]

    for project in projects:
        if "superseded_by" not in project:
            continue
        successor = project["superseded_by"]
        if successor != project.get("id") and successor not in ids:
            prefix = str(project.get("repo") or project.get("id") or "unknown")
            errors.append(f"{prefix}: unknown superseded_by {successor!r}")
    return ProjectIndex(projects=projects, ids=ids, repos=repos, url_keys=project_url_keys)


def validate_license_evidence(
    evidence_data: dict[str, Any], projects: list[dict[str, Any]], errors: list[str]
) -> dict[str, Any]:
    """Validate reviewed license evidence against the projects it proves."""
    evidence_entries = evidence_data.get("entries", [])
    if not valid_date(evidence_data.get("verified_at")):
        errors.append("license-evidence.json: verified_at must be an ISO date")
    evidence_ids = [item.get("project_id") for item in evidence_entries if isinstance(item, dict)]
    duplicate_evidence = sorted({item for item in evidence_ids if item and evidence_ids.count(item) > 1})
    if duplicate_evidence:
        errors.append(f"license evidence has duplicate project ids: {duplicate_evidence}")
    evidence = {
        item["project_id"]: item
        for item in evidence_entries
        if isinstance(item, dict) and isinstance(item.get("project_id"), str)
    }
    projects_by_id = {
        project["id"]: project for project in projects if isinstance(project.get("id"), str)
    }
    if set(evidence) != set(projects_by_id):
        errors.append(
            "license evidence/project ids differ: "
            f"missing={sorted(set(projects_by_id) - set(evidence))}, "
            f"extra={sorted(set(evidence) - set(projects_by_id))}"
        )
    for project_id, project in projects_by_id.items():
        proof = evidence.get(project_id)
        if not proof:
            continue
        prefix = str(project.get("repo") or project_id)
        if proof.get("repo") != project.get("repo"):
            errors.append(f"{prefix}: evidence repository does not match project")
        items = proof.get("items")
        if not isinstance(items, list) or not items:
            errors.append(f"{prefix}: license evidence items must be a non-empty list")
            items = []
        evidence_licenses = {
            item.get("license_id") for item in items if isinstance(item, dict)
        }
        if evidence_licenses != set(project.get("licenses", [])):
            errors.append(f"{prefix}: evidence licenses do not match project licenses")
        for item in items:
            if not isinstance(item, dict):
                errors.append(f"{prefix}: every license evidence item must be an object")
                continue
            if not isinstance(item.get("scope"), str) or not item["scope"].strip():
                errors.append(f"{prefix}: license evidence requires a scope")
            kind = item.get("kind")
            if kind == "git_blob":
                if not project.get("repo"):
                    errors.append(f"{prefix}: git-blob evidence requires a GitHub repository")
                    continue
                blob_sha = item.get("blob_sha")
                if not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                    errors.append(f"{prefix}: invalid license blob SHA")
                    continue
                path = item.get("path")
                if not isinstance(path, str) or not path:
                    errors.append(f"{prefix}: license evidence requires a path")
                source_prefix = f"https://github.com/{project['repo']}/blob/"
                if not isinstance(item.get("url"), str) or not item["url"].startswith(source_prefix):
                    errors.append(f"{prefix}: source license URL must be a GitHub blob URL")
                expected_immutable = (
                    f"https://api.github.com/repos/{project['repo']}/git/blobs/{blob_sha}"
                )
                if item.get("immutable_url") != expected_immutable:
                    errors.append(
                        f"{prefix}: immutable license URL must address the recorded blob SHA"
                    )
            elif kind == "web_terms":
                if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
                    errors.append(f"{prefix}: web terms require an authoritative HTTPS URL")
                if not valid_date(item.get("verified_at")):
                    errors.append(f"{prefix}: web terms require verified_at")
            else:
                errors.append(f"{prefix}: unknown license evidence kind {kind!r}")
    return projects_by_id


def validate_scoped_license_evidence(
    record: dict[str, Any], repo: Any, prefix: str, errors: list[str]
) -> None:
    """Validate scoped license evidence. Specifications and runtimes prove licences alike."""
    license_items = record.get("license_evidence")
    if not isinstance(license_items, list) or not license_items:
        errors.append(f"{prefix}: license_evidence must be a non-empty list")
        license_items = []
    evidence_licenses = {
        item.get("license_id") for item in license_items if isinstance(item, dict)
    }
    if evidence_licenses != set(record.get("licenses", [])):
        errors.append(f"{prefix}: license evidence does not match licenses")
    for item in license_items:
        if not isinstance(item, dict) or not isinstance(item.get("scope"), str) or not item["scope"].strip():
            errors.append(f"{prefix}: license evidence requires a scope")
            continue
        if item.get("kind") == "git_blob":
            blob_sha = item.get("blob_sha")
            if not repo:
                errors.append(f"{prefix}: git-blob license evidence requires a repository")
            elif not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                errors.append(f"{prefix}: invalid license blob SHA")
            elif item.get("immutable_url") != f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}":
                errors.append(f"{prefix}: immutable license URL must address the blob SHA")
            if not isinstance(item.get("path"), str) or not item["path"]:
                errors.append(f"{prefix}: git-blob license evidence requires a path")
            if not isinstance(item.get("url"), str) or not item["url"].startswith(
                f"https://github.com/{repo}/blob/"
            ):
                errors.append(f"{prefix}: license source must be a GitHub blob URL")
        elif item.get("kind") == "web_terms":
            if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
                errors.append(f"{prefix}: web terms require an authoritative HTTPS URL")
            if not valid_date(item.get("verified_at")):
                errors.append(f"{prefix}: web terms require verified_at")
        else:
            errors.append(f"{prefix}: unknown license evidence kind {item.get('kind')!r}")


def validate_web_evidence(record: dict[str, Any], prefix: str, errors: list[str]) -> None:
    """Validate reviewed web sources. Services and runtimes cite evidence alike."""
    evidence_items = record.get("evidence")
    if not isinstance(evidence_items, list) or not evidence_items:
        errors.append(f"{prefix}: evidence must be a non-empty list")
        evidence_items = []
    evidence_urls: set[str] = set()
    for item in evidence_items:
        if not isinstance(item, dict) or set(item) != {"kind", "label", "url", "verified_at"}:
            errors.append(f"{prefix}: evidence must match the web evidence schema")
            continue
        if item.get("kind") != "web":
            errors.append(f"{prefix}: evidence kind must be web")
        if not isinstance(item.get("label"), str) or not item["label"].strip():
            errors.append(f"{prefix}: evidence requires a label")
        if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
            errors.append(f"{prefix}: evidence requires an authoritative HTTPS URL")
        elif item["url"] in evidence_urls:
            errors.append(f"{prefix}: evidence URLs must be unique")
        else:
            evidence_urls.add(item["url"])
        if not valid_date(item.get("verified_at")):
            errors.append(f"{prefix}: evidence requires verified_at")


def validate_specifications(
    specifications_data: dict[str, Any], tax: Taxonomy, errors: list[str]
) -> list[Any]:
    """Validate unscored specification records and their evidence."""
    enum_ids = tax.enum_ids
    specifications_value = validate_collection_envelope(
        specifications_data, "specifications.json", "1.0", "specifications", errors,
    )
    specification_ids = {
        item.get("id") for item in specifications_value
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for specification in specifications_value:
        if not isinstance(specification, dict):
            errors.append("specifications.json: every specification must be an object")
            continue
        prefix = f"specification {specification.get('id', 'unknown')}"
        if set(specification) != SPECIFICATION_REQUIRED:
            missing = sorted(SPECIFICATION_REQUIRED - set(specification))
            extra = sorted(set(specification) - SPECIFICATION_REQUIRED)
            errors.append(f"{prefix}: fields differ from schema: missing={missing}, extra={extra}")
        specification_id = specification.get("id")
        if not isinstance(specification_id, str) or not ID_PATTERN.fullmatch(specification_id):
            errors.append(f"{prefix}: invalid id")
        for field in (
            "name", "short_name", "url", "description", "standardizes",
            "does_not_standardize", "license_note",
        ):
            if not isinstance(specification.get(field), str) or not specification[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        if not isinstance(specification.get("url"), str) or not specification["url"].startswith("https://"):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        repo = specification.get("repo")
        if repo is not None and (not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo)):
            errors.append(f"{prefix}: invalid GitHub repository")
        if specification.get("current_version") is not None and not isinstance(
            specification["current_version"], str
        ):
            errors.append(f"{prefix}: current_version must be a string or null")
        if specification.get("specification_type") not in enum_ids["specification_types"]:
            errors.append(f"{prefix}: unknown specification type")
        if specification.get("scope") not in enum_ids["specification_scopes"]:
            errors.append(f"{prefix}: unknown specification scope")
        if specification.get("status") not in enum_ids["specification_statuses"]:
            errors.append(f"{prefix}: unknown specification status")
        validate_string_list(specification, "stewards", None, prefix, errors)
        validate_string_list(specification, "licenses", enum_ids["licenses"], prefix, errors)
        validate_string_list(
            specification, "related_specifications", specification_ids, prefix, errors,
            allow_empty=True,
        )
        if specification_id in specification.get("related_specifications", []):
            errors.append(f"{prefix}: cannot relate to itself")
        if not valid_date(specification.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")

        evidence_items = specification.get("evidence")
        if not isinstance(evidence_items, list) or not evidence_items:
            errors.append(f"{prefix}: evidence must be a non-empty list")
            evidence_items = []
        for item in evidence_items:
            if not isinstance(item, dict) or not isinstance(item.get("label"), str):
                errors.append(f"{prefix}: evidence requires an object with a label")
                continue
            if item.get("kind") == "git_blob":
                blob_sha = item.get("blob_sha")
                if not repo:
                    errors.append(f"{prefix}: git-blob evidence requires a repository")
                elif not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                    errors.append(f"{prefix}: invalid evidence blob SHA")
                elif item.get("immutable_url") != f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}":
                    errors.append(f"{prefix}: immutable evidence URL must address the blob SHA")
                if not isinstance(item.get("path"), str) or not item["path"]:
                    errors.append(f"{prefix}: git-blob evidence requires a path")
                if not isinstance(item.get("url"), str) or not item["url"].startswith(
                    f"https://github.com/{repo}/blob/"
                ):
                    errors.append(f"{prefix}: evidence source must be a GitHub blob URL")
            elif item.get("kind") == "web":
                if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
                    errors.append(f"{prefix}: web evidence requires an authoritative HTTPS URL")
                if not valid_date(item.get("verified_at")):
                    errors.append(f"{prefix}: web evidence requires verified_at")
            else:
                errors.append(f"{prefix}: unknown evidence kind {item.get('kind')!r}")

        validate_scoped_license_evidence(specification, repo, prefix, errors)
    return specifications_value


def validate_inference_services(
    inference_services_data: dict[str, Any], tax: Taxonomy, errors: list[str]
) -> list[Any]:
    """Validate managed inference services against their dedicated score profile."""
    enum_ids, inference_score_dimensions = tax.enum_ids, tax.inference_dimensions
    inference_services_value = validate_collection_envelope(
        inference_services_data, "inference-services.json", "2.0", "services", errors,
    )
    for service in inference_services_value:
        if not isinstance(service, dict):
            errors.append("inference-services.json: every service must be an object")
            continue
        prefix = f"inference service {service.get('id', 'unknown')}"
        if set(service) != INFERENCE_SERVICE_REQUIRED:
            missing = sorted(INFERENCE_SERVICE_REQUIRED - set(service))
            extra = sorted(set(service) - INFERENCE_SERVICE_REQUIRED)
            errors.append(f"{prefix}: fields differ from schema: missing={missing}, extra={extra}")
        service_id = service.get("id")
        if not isinstance(service_id, str) or not ID_PATTERN.fullmatch(service_id):
            errors.append(f"{prefix}: invalid id")
        for field in (
            "name", "operator", "url", "description", "service_boundary",
            "regional_controls", "retention_controls", "routing", "customization",
        ):
            if not isinstance(service.get(field), str) or not service[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        if not isinstance(service.get("url"), str) or not service["url"].startswith("https://"):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        if service.get("service_type") not in enum_ids["inference_service_types"]:
            errors.append(f"{prefix}: unknown inference service type")
        for field, group in (
            ("delivery_modes", "inference_delivery_modes"),
            ("model_sources", "inference_model_sources"),
            ("api_styles", "inference_api_styles"),
        ):
            validate_string_list(service, field, enum_ids[group], prefix, errors)
        for field in ("strengths", "tradeoffs"):
            validate_string_list(service, field, None, prefix, errors)
        validate_record_score(
            service, inference_score_dimensions, "inference_service", "inference service", prefix, errors,
        )
        if not valid_date(service.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")

        terms = service.get("terms")
        if not isinstance(terms, dict) or set(terms) != {
            "kind", "label", "url", "verified_at",
        }:
            errors.append(f"{prefix}: terms must match the web-terms evidence schema")
        else:
            if terms.get("kind") != "web_terms":
                errors.append(f"{prefix}: terms kind must be web_terms")
            if not isinstance(terms.get("label"), str) or not terms["label"].strip():
                errors.append(f"{prefix}: terms require a label")
            if not isinstance(terms.get("url"), str) or not terms["url"].startswith("https://"):
                errors.append(f"{prefix}: terms require an authoritative HTTPS URL")
            if not valid_date(terms.get("verified_at")):
                errors.append(f"{prefix}: terms require verified_at")

        validate_web_evidence(service, prefix, errors)
    return inference_services_value


def validate_local_runtimes(
    local_runtimes_data: dict[str, Any], tax: Taxonomy, errors: list[str]
) -> list[Any]:
    """Validate self-operated runtimes against their dedicated score profile."""
    enum_ids, local_runtime_score_dimensions = tax.enum_ids, tax.runtime_dimensions
    local_runtimes_value = validate_collection_envelope(
        local_runtimes_data, "local-runtimes.json", "1.0", "runtimes", errors,
    )
    for runtime in local_runtimes_value:
        if not isinstance(runtime, dict):
            errors.append("local-runtimes.json: every runtime must be an object")
            continue
        prefix = f"local runtime {runtime.get('id', 'unknown')}"
        missing = LOCAL_RUNTIME_REQUIRED - set(runtime)
        unknown_fields = set(runtime) - LOCAL_RUNTIME_REQUIRED - LOCAL_RUNTIME_OPTIONAL
        if missing or unknown_fields:
            errors.append(
                f"{prefix}: fields differ from schema: missing={sorted(missing)}, extra={sorted(unknown_fields)}"
            )
            continue
        runtime_id = runtime.get("id")
        if not isinstance(runtime_id, str) or not ID_PATTERN.fullmatch(runtime_id):
            errors.append(f"{prefix}: invalid id")
        for field in (
            "name", "maintainer", "description", "runtime_boundary",
            "model_management", "hardware_requirements", "operational_controls", "license_note",
        ):
            if not isinstance(runtime.get(field), str) or not runtime[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        if not isinstance(runtime.get("url"), str) or not runtime["url"].startswith("https://"):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        repo = runtime.get("repo")
        if repo is not None and (not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo)):
            errors.append(f"{prefix}: repo must be owner/name or null")
        if runtime.get("runtime_type") not in enum_ids["local_runtime_types"]:
            errors.append(f"{prefix}: unknown runtime type")
        if runtime.get("source_model") not in enum_ids["source_models"]:
            errors.append(f"{prefix}: unknown source model")
        for field, group in (
            ("accelerators", "runtime_accelerators"),
            ("model_formats", "runtime_model_formats"),
            ("serving_modes", "runtime_serving_modes"),
            ("api_styles", "inference_api_styles"),
            ("deployment_surfaces", "runtime_deployment_surfaces"),
            ("licenses", "licenses"),
        ):
            validate_string_list(runtime, field, enum_ids[group], prefix, errors)
        for field in ("strengths", "tradeoffs"):
            validate_string_list(runtime, field, None, prefix, errors)
        validate_record_score(
            runtime, local_runtime_score_dimensions, "local_runtime", "local runtime", prefix, errors,
        )
        if not valid_date(runtime.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")
        if runtime.get("stars") is not None and (not isinstance(runtime["stars"], int) or runtime["stars"] < 0):
            errors.append(f"{prefix}: stars must be a non-negative integer or null")
        if runtime.get("stars") is not None and not valid_date(runtime.get("stars_verified_at")):
            errors.append(f"{prefix}: populated stars require stars_verified_at")
        if runtime.get("stars_verified_at") is not None and not valid_date(runtime["stars_verified_at"]):
            errors.append(f"{prefix}: stars_verified_at must be null or an ISO date")

        validate_web_evidence(runtime, prefix, errors)

        validate_scoped_license_evidence(runtime, repo, prefix, errors)
    return local_runtimes_value


def validate_model_source_metadata(
    metadata: object, prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """Validate the models.dev-owned snapshot without treating it as editorial truth."""
    if not isinstance(metadata, dict) or set(metadata) != MODEL_SOURCE_METADATA_REQUIRED:
        errors.append(f"{prefix}: source_metadata fields differ from schema")
        return
    if not isinstance(metadata.get("name"), str) or not metadata["name"].strip():
        errors.append(f"{prefix}: source_metadata.name must be a non-empty string")
    if metadata.get("description") is not None and (
        not isinstance(metadata["description"], str) or not metadata["description"].strip()
    ):
        errors.append(f"{prefix}: source_metadata.description must be null or a non-empty string")
    for field in ("family", "reported_license"):
        if metadata.get(field) is not None and not isinstance(metadata[field], str):
            errors.append(f"{prefix}: source_metadata.{field} must be a string or null")
    for field in ("release_date", "last_updated", "knowledge_cutoff"):
        if not valid_partial_date(metadata.get(field)):
            errors.append(f"{prefix}: source_metadata.{field} must be null, YYYY-MM, or YYYY-MM-DD")

    modalities = metadata.get("modalities")
    if not isinstance(modalities, dict) or set(modalities) != {"input", "output"}:
        errors.append(f"{prefix}: source_metadata.modalities must contain input and output")
    else:
        for field in ("input", "output"):
            validate_string_list(
                modalities, field, tax.enum_ids["model_modalities"],
                f"{prefix}: source_metadata.modalities", errors,
            )
        if "text" not in modalities.get("output", []):
            errors.append(f"{prefix}: model candidates must produce text")

    capabilities = metadata.get("capabilities")
    if not isinstance(capabilities, dict) or set(capabilities) != MODEL_CAPABILITIES:
        errors.append(f"{prefix}: source_metadata.capabilities fields differ from schema")
    elif any(value is not None and not isinstance(value, bool) for value in capabilities.values()):
        errors.append(f"{prefix}: source capability values must be boolean or null")

    limits = metadata.get("limits")
    if not isinstance(limits, dict) or set(limits) != MODEL_LIMITS:
        errors.append(f"{prefix}: source_metadata.limits fields differ from schema")
    elif any(
        value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 0)
        for value in limits.values()
    ):
        errors.append(f"{prefix}: source limits must be non-negative integers or null")
    if metadata.get("reported_open_weights") is not None and not isinstance(
        metadata["reported_open_weights"], bool
    ):
        errors.append(f"{prefix}: reported_open_weights must be boolean or null")

    for field, allowed_fields in (
        ("links", {"label", "url", "type"}),
        ("weights", {"label", "url", "format", "quantization"}),
    ):
        items = metadata.get(field)
        if not isinstance(items, list):
            errors.append(f"{prefix}: source_metadata.{field} must be a list")
            continue
        for item in items:
            if not isinstance(item, dict) or not set(item) <= allowed_fields:
                errors.append(f"{prefix}: source_metadata.{field} item fields differ from schema")
                continue
            if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
                errors.append(f"{prefix}: source_metadata.{field} requires HTTPS URLs")
            if any(not isinstance(value, str) for value in item.values()):
                errors.append(f"{prefix}: source_metadata.{field} values must be strings")


def validate_models(
    models_data: dict[str, Any], tax: Taxonomy, errors: list[str]
) -> list[Any]:
    """Validate reviewed model releases against their independent access profile."""
    source = models_data.get("source")
    expected_source_fields = {"id", "name", "repo", "commit", "url", "license"}
    if not isinstance(source, dict) or set(source) != expected_source_fields:
        errors.append("models.json: source fields differ from schema")
    else:
        if source.get("id") != "models-dev" or source.get("repo") != "anomalyco/models.dev":
            errors.append("models.json: source must identify the models.dev repository")
        if not isinstance(source.get("commit"), str) or not SHA_PATTERN.fullmatch(source["commit"]):
            errors.append("models.json: source commit must be a full Git SHA")
        if source.get("url") != "https://github.com/anomalyco/models.dev" or source.get("license") != "MIT":
            errors.append("models.json: source URL and license must match models.dev")

    models_value = validate_collection_envelope(
        models_data, "models.json", "1.0", "models", errors,
    )
    source_ids: set[str] = set()
    for model in models_value:
        if not isinstance(model, dict):
            errors.append("models.json: every model must be an object")
            continue
        prefix = f"model {model.get('id', 'unknown')}"
        if set(model) != MODEL_REQUIRED:
            errors.append(
                f"{prefix}: fields differ from schema: "
                f"missing={sorted(MODEL_REQUIRED - set(model))}, "
                f"extra={sorted(set(model) - MODEL_REQUIRED)}"
            )
            continue
        model_id = model.get("id")
        if not isinstance(model_id, str) or not ID_PATTERN.fullmatch(model_id) or not model_id.startswith("model-"):
            errors.append(f"{prefix}: invalid id")
        source_id = model.get("source_id")
        if not isinstance(source_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", source_id):
            errors.append(f"{prefix}: invalid models.dev source_id")
        elif source_id in source_ids:
            errors.append(f"{prefix}: duplicate models.dev source_id")
        else:
            source_ids.add(source_id)
        for field in (
            "name", "developer", "description", "access_boundary", "license_note",
        ):
            if not isinstance(model.get(field), str) or not model[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        if not isinstance(model.get("url"), str) or not model["url"].startswith("https://"):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        if model.get("model_type") not in tax.enum_ids["model_types"]:
            errors.append(f"{prefix}: unknown model type")
        validate_string_list(
            model, "distribution_modes", tax.enum_ids["model_distribution_modes"], prefix, errors,
        )
        validate_model_source_metadata(model.get("source_metadata"), prefix, tax, errors)

        validate_string_list(model, "licenses", tax.enum_ids["licenses"], prefix, errors)
        source_model = model.get("source_model")
        if source_model not in tax.enum_ids["source_models"]:
            errors.append(f"{prefix}: unknown source model")
        else:
            license_kinds = {
                tax.license_kinds[item]
                for item in model.get("licenses", [])
                if item in tax.license_kinds
            }
            if source_model == "open_source":
                coherent = bool(license_kinds) and license_kinds <= {"open_source"}
            elif source_model == "source_available":
                coherent = "restricted" in license_kinds and "open_source" not in license_kinds
            elif source_model == "proprietary":
                coherent = license_kinds == {"proprietary"}
            elif source_model == "unclear":
                coherent = "unclear" in license_kinds
            else:
                coherent = True
            if not coherent:
                errors.append(f"{prefix}: source model and license kinds are inconsistent")
        if model.get("license_review_status") not in tax.enum_ids["license_review_statuses"]:
            errors.append(f"{prefix}: unknown license review status")
        validate_scoped_license_evidence(model, None, prefix, errors)

        for field in ("strengths", "tradeoffs"):
            validate_string_list(model, field, None, prefix, errors)
        validate_record_score(
            model, tax.model_dimensions, "model_access", "model", prefix, errors,
        )
        validate_web_evidence(model, prefix, errors)
        for field in ("metadata_verified_at", "verified_at"):
            if not valid_date(model.get(field)):
                errors.append(f"{prefix}: {field} must be an ISO date")
    return models_value


def validate_model_candidates(
    candidates_data: dict[str, Any], published_models: list[Any], tax: Taxonomy,
    errors: list[str],
) -> None:
    """Validate the automated models.dev queue and keep it disjoint from reviewed records."""
    if candidates_data.get("version") != "1.0":
        errors.append("model-candidates.json: unsupported version")
    if not valid_date(candidates_data.get("updated_at")):
        errors.append("model-candidates.json: updated_at must be an ISO date")
    for field in ("source_record_count", "eligible_record_count"):
        if not isinstance(candidates_data.get(field), int) or candidates_data[field] < 0:
            errors.append(f"model-candidates.json: {field} must be a non-negative integer")
    source = candidates_data.get("source")
    source_fields = {"repo", "ref", "commit", "url", "immutable_url", "path", "license", "sha256"}
    if not isinstance(source, dict) or set(source) != source_fields:
        errors.append("model-candidates.json: source fields differ from schema")
    else:
        commit = source.get("commit")
        if source.get("repo") != "anomalyco/models.dev" or source.get("ref") != "dev":
            errors.append("model-candidates.json: source repo and ref must identify models.dev")
        if not isinstance(commit, str) or not SHA_PATTERN.fullmatch(commit):
            errors.append("model-candidates.json: source commit must be a full Git SHA")
        elif source.get("immutable_url") != f"https://codeload.github.com/anomalyco/models.dev/tar.gz/{commit}":
            errors.append("model-candidates.json: immutable URL must address the source commit")
        if source.get("url") != "https://github.com/anomalyco/models.dev":
            errors.append("model-candidates.json: source URL must be the models.dev repository")
        if source.get("path") != "models/**/*.toml" or source.get("license") != "MIT":
            errors.append("model-candidates.json: source path and license must identify model TOMLs")
        if not isinstance(source.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["sha256"]):
            errors.append("model-candidates.json: source sha256 is invalid")

    candidates = candidates_data.get("candidates")
    if not isinstance(candidates, list):
        errors.append("model-candidates.json: candidates must be a list")
        return
    published_ids = {
        item.get("source_id") for item in published_models
        if isinstance(item, dict) and isinstance(item.get("source_id"), str)
    }
    candidate_ids: set[str] = set()
    for candidate in candidates:
        prefix = f"model candidate {candidate.get('source_id', 'unknown') if isinstance(candidate, dict) else 'unknown'}"
        required = {
            "id", "source_id", "source_metadata", "status", "discovered_at",
            "last_seen_at", "review_required",
        }
        if not isinstance(candidate, dict) or set(candidate) != required:
            errors.append(f"{prefix}: fields differ from schema")
            continue
        source_id = candidate.get("source_id")
        if not isinstance(source_id, str) or source_id in candidate_ids:
            errors.append(f"{prefix}: source_id must be a unique string")
        else:
            candidate_ids.add(source_id)
        if source_id in published_ids:
            errors.append(f"{prefix}: already exists in the reviewed collection")
        model_id = candidate.get("id")
        if not isinstance(model_id, str) or not ID_PATTERN.fullmatch(model_id) or not model_id.startswith("model-"):
            errors.append(f"{prefix}: invalid id")
        if candidate.get("status") != "provisional":
            errors.append(f"{prefix}: status must be provisional")
        for field in ("discovered_at", "last_seen_at"):
            if not valid_date(candidate.get(field)):
                errors.append(f"{prefix}: {field} must be an ISO date")
        review_required = candidate.get("review_required")
        if not isinstance(review_required, list) or set(review_required) != MODEL_REVIEW_REQUIRED:
            errors.append(f"{prefix}: review_required is incomplete")
        validate_model_source_metadata(candidate.get("source_metadata"), prefix, tax, errors)
    eligible_count = candidates_data.get("eligible_record_count")
    if isinstance(eligible_count, int) and eligible_count != len(candidates) + len(published_ids):
        errors.append("model-candidates.json: eligible count must equal queued plus reviewed source ids")


def validate_unique_record_ids(
    projects: list[dict[str, Any]],
    specifications_value: list[Any],
    inference_services_value: list[Any],
    local_runtimes_value: list[Any],
    models_value: list[Any],
    errors: list[str],
) -> None:
    """No identifier may name a record in more than one collection."""
    collection_ids: dict[str, list[str]] = {}
    for collection_name, collection_records in (
        ("projects.json", projects),
        ("specifications.json", specifications_value),
        ("inference-services.json", inference_services_value),
        ("local-runtimes.json", local_runtimes_value),
        ("models.json", models_value),
    ):
        for record in collection_records:
            if isinstance(record, dict) and isinstance(record.get("id"), str):
                collection_ids.setdefault(record["id"], []).append(collection_name)
    for record_id, sources in sorted(collection_ids.items()):
        if len(sources) > 1:
            errors.append(
                f"id {record_id!r} appears in more than one collection: {sorted(sources)}"
            )


def validate_triage(
    triage: Any, repo: Any, prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """Validate an unaccepted triage proposal: gathered evidence, never a conclusion."""
    if not isinstance(triage, dict):
        errors.append(f"candidate {prefix}: triage must be an object")
        return
    missing = sorted(TRIAGE_REQUIRED - set(triage))
    unknown = sorted(set(triage) - TRIAGE_REQUIRED - TRIAGE_OPTIONAL)
    if missing or unknown:
        errors.append(
            f"candidate {prefix}: triage fields differ from schema: missing={missing}, extra={unknown}"
        )
        return
    verdict = triage["verdict"]
    if verdict not in TRIAGE_VERDICTS:
        errors.append(f"candidate {prefix}: unknown triage verdict {verdict!r}")
    if (verdict == "held") != ("held_by" in triage):
        errors.append(
            f"candidate {prefix}: held_by is required for a held verdict and forbidden otherwise"
        )
    elif "held_by" in triage and (
        not isinstance(triage["held_by"], str) or not triage["held_by"].strip()
    ):
        errors.append(f"candidate {prefix}: held_by must name the decision that holds the record")
    for field in ("rule", "proposer"):
        if not isinstance(triage[field], str) or not triage[field].strip():
            errors.append(f"candidate {prefix}: triage {field} must be a non-empty string")
    finding = triage["finding"]
    if not isinstance(finding, str) or not finding.strip():
        errors.append(f"candidate {prefix}: triage requires a finding")
    else:
        classifying = tax.enum_ids["system_families"] | tax.enum_ids["primary_roles"]
        finding_lower = finding.lower()
        leaked = sorted(name for name in classifying if name in finding_lower)
        if leaked:
            errors.append(
                f"candidate {prefix}: finding must not classify; it names taxonomy ids {leaked}"
            )
    if not valid_date(triage["proposed_at"]):
        errors.append(f"candidate {prefix}: triage proposed_at must be an ISO date")
    items = triage["evidence"]
    if not isinstance(items, list) or not items:
        errors.append(f"candidate {prefix}: triage evidence must be a non-empty list")
        return
    for item in items:
        if not isinstance(item, dict):
            errors.append(f"candidate {prefix}: every evidence item must be an object")
            continue
        allowed = EVIDENCE_REQUIRED | (BLOB_EVIDENCE_REQUIRED if item.get("kind") == "git_blob" else set())
        if set(item) != allowed:
            errors.append(f"candidate {prefix}: evidence fields differ from schema")
            continue
        if not isinstance(item["label"], str) or not item["label"].strip():
            errors.append(f"candidate {prefix}: evidence requires a label")
        if not isinstance(item["url"], str) or not item["url"].startswith("https://"):
            errors.append(f"candidate {prefix}: evidence requires an authoritative HTTPS URL")
        if not isinstance(item["content_sha256"], str) or not CONTENT_SHA_PATTERN.fullmatch(
            item["content_sha256"]
        ):
            errors.append(f"candidate {prefix}: evidence requires a content_sha256")
        if not valid_date(item["fetched_at"]):
            errors.append(f"candidate {prefix}: evidence requires fetched_at")
        if item["kind"] == "git_blob":
            blob_sha = item["blob_sha"]
            if not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                errors.append(f"candidate {prefix}: invalid evidence blob SHA")
            elif item["immutable_url"] != f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}":
                errors.append(f"candidate {prefix}: immutable evidence URL must address the blob SHA")
        elif item["kind"] != "web":
            errors.append(f"candidate {prefix}: unknown evidence kind {item['kind']!r}")


def validate_candidates(
    candidates_data: dict[str, Any], tax: Taxonomy, index: ProjectIndex, errors: list[str]
) -> set[str]:
    """Validate the provisional discovery queue against the curated catalog."""
    families, roles = tax.families, tax.roles
    repos, project_url_keys = index.repos, index.url_keys
    candidate_entries = candidates_data.get("candidates")
    if not isinstance(candidate_entries, list):
        errors.append("candidates.json: candidates must be a list")
        candidate_entries = []
    candidate_repos: set[str] = set()
    candidate_keys: set[str] = set()
    for candidate in candidate_entries:
        prefix = (candidate.get("repo") or candidate.get("url") or "unknown") if isinstance(candidate, dict) else "unknown"
        if not isinstance(candidate, dict) or (
            CANDIDATE_REQUIRED - set(candidate)
            or set(candidate) - CANDIDATE_REQUIRED - CANDIDATE_OPTIONAL
        ):
            errors.append(f"candidate {prefix}: fields do not match candidate schema")
            continue
        candidate_repo = candidate["repo"]
        repo_key = candidate_repo.lower() if isinstance(candidate_repo, str) else ""
        candidate_key = repo_key or canonical_url_key(candidate.get("url", ""))
        if candidate_key in candidate_keys:
            errors.append(f"candidate {prefix}: duplicate candidate identity")
        candidate_keys.add(candidate_key)
        if repo_key:
            if repo_key in candidate_repos or repo_key in repos:
                errors.append(f"candidate {prefix}: duplicate or already curated repository")
            candidate_repos.add(repo_key)
        elif candidate_key in project_url_keys:
            errors.append(f"candidate {prefix}: URL is already curated")
        if candidate["status"] != "provisional":
            errors.append(f"candidate {prefix}: status must be provisional")
        if candidate_repo and candidate["url"] != f"https://github.com/{candidate_repo}":
            errors.append(f"candidate {prefix}: url must be the canonical GitHub repository URL")
        if not candidate_repo and (
            not isinstance(candidate["url"], str) or not candidate["url"].startswith("https://")
        ):
            errors.append(f"candidate {prefix}: non-GitHub candidate requires an HTTPS URL")
        family = candidate["proposed_system_family"]
        role = candidate["proposed_primary_role"]
        triage = candidate.get("triage")
        held_by = triage.get("held_by") if isinstance(triage, dict) else None
        if family is None and role is None:
            if not held_by:
                errors.append(
                    f"candidate {prefix}: family and role may only be null while "
                    "triage.held_by names the decision that holds the record"
                )
        elif family not in families or role not in roles or roles.get(role) != family:
            errors.append(f"candidate {prefix}: proposed family and role are incompatible")
        if candidate["github_detected_license"] is not None and not isinstance(
            candidate["github_detected_license"], str
        ):
            errors.append(f"candidate {prefix}: detected license must be a string or null")
        if not is_number(candidate["classification_confidence"]) or not 0 <= candidate["classification_confidence"] <= 1:
            errors.append(f"candidate {prefix}: classification confidence must be between 0 and 1")
        if candidate["stars"] is not None and (not isinstance(candidate["stars"], int) or candidate["stars"] < 0):
            errors.append(f"candidate {prefix}: stars must be a non-negative integer or null")
        if not isinstance(candidate["topics"], list) or any(not isinstance(topic, str) for topic in candidate["topics"]):
            errors.append(f"candidate {prefix}: topics must be a list of strings")
        review_required = candidate["review_required"]
        if not isinstance(review_required, list) or any(not isinstance(item, str) for item in review_required) or set(review_required) != {
            "licensing", "classification", "traits", "editorial_score"
        }:
            errors.append(f"candidate {prefix}: review_required is incomplete")
        if not valid_date(candidate["discovered_at"]):
            errors.append(f"candidate {prefix}: discovered_at must be an ISO date")
        if "triage" in candidate:
            validate_triage(candidate["triage"], candidate_repo, prefix, tax, errors)
    return candidate_repos


def validate_license_review(
    license_review_data: dict[str, Any], projects_by_id: dict[str, Any], errors: list[str]
) -> None:
    """The license-review queue and the project review statuses must agree exactly."""
    review_entries = license_review_data.get("entries")
    if not isinstance(review_entries, list):
        errors.append("license-review.json: entries must be a list")
        review_entries = []
    review_ids = [item.get("project_id") for item in review_entries if isinstance(item, dict)]
    if len(review_ids) != len(set(review_ids)):
        errors.append("license-review.json: project entries must be unique")
    review_required = {
        project_id
        for project_id, project in projects_by_id.items()
        if project.get("license_review_status") == "review_required"
    }
    if set(review_ids) != review_required:
        errors.append("license-review queue and project review statuses must match")
    for item in review_entries:
        if not isinstance(item, dict):
            errors.append("license-review.json: every entry must be an object")
            continue
        project = projects_by_id.get(str(item.get("project_id", "")))
        if item.get("status") != "open" or not valid_date(item.get("detected_at")):
            errors.append(
                f"license review {item.get('project_id', 'unknown')}: invalid status or detected_at"
            )
        if project and item.get("expected_licenses") != project.get("licenses"):
            errors.append(
                f"license review {item.get('project_id', 'unknown')}: expected licenses do not match project"
            )


def validate_exclusions(
    exclusions_data: dict[str, Any], repos: set[str], candidate_repos: set[str], errors: list[str]
) -> None:
    """A repository is curated, a candidate, or excluded - never two of those."""
    excluded_repos = {
        item["repo"].lower()
        for item in exclusions_data.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    }
    if overlap := excluded_repos & repos:
        errors.append(f"repositories cannot be both included and excluded: {sorted(overlap)}")
    if overlap := excluded_repos & candidate_repos:
        errors.append(f"repositories cannot be both candidates and excluded: {sorted(overlap)}")


def validate_queue_envelopes(
    candidates_data: dict[str, Any], license_review_data: dict[str, Any], errors: list[str]
) -> None:
    for queue_name, document in (
        ("candidates.json", candidates_data),
        ("license-review.json", license_review_data),
    ):
        if document.get("version") != "1.0":
            errors.append(f"{queue_name}: unsupported version")
        if document.get("updated_at") is not None and not valid_date(document["updated_at"]):
            errors.append(f"{queue_name}: updated_at must be null or an ISO date")


def validate_published_copies(root: Path, errors: list[str]) -> None:
    """web/ must be a byte-for-byte copy of the canonical directory/ files."""
    for name in PUBLISHED_DATA:
        if (root / "directory" / name).read_bytes() != (root / "web" / name).read_bytes():
            errors.append(f"web/{name} is not synchronized with directory/{name}")


def validate(root: Path = ROOT) -> list[str]:
    """Validate the canonical catalog, its review queues, and the published copies."""
    directory = root / "directory"
    catalog = {name: load_document(directory, name) for name in CATALOG_DOCUMENTS}

    errors: list[str] = []

    errors.extend(validate_discovery_sources(catalog["discovery-sources.json"]))
    if (root / "web" / "discovery-sources.json").exists():
        errors.append("discovery-sources.json: operational discovery sources must not be published")
    if (root / "web" / "model-candidates.json").exists():
        errors.append("model-candidates.json: provisional model candidates must not be published")

    tax = validate_taxonomy(catalog["taxonomy.json"], errors)

    index = validate_projects(catalog["projects.json"], tax, errors)
    if index is None:
        return [*errors, "projects.json: projects must be a list"]

    projects_by_id = validate_license_evidence(
        catalog["license-evidence.json"], index.projects, errors
    )
    specifications_value = validate_specifications(catalog["specifications.json"], tax, errors)
    inference_services_value = validate_inference_services(
        catalog["inference-services.json"], tax, errors
    )
    local_runtimes_value = validate_local_runtimes(catalog["local-runtimes.json"], tax, errors)
    models_value = validate_models(catalog["models.json"], tax, errors)

    validate_unique_record_ids(
        index.projects, specifications_value, inference_services_value, local_runtimes_value,
        models_value, errors,
    )

    candidate_repos = validate_candidates(catalog["candidates.json"], tax, index, errors)
    validate_model_candidates(catalog["model-candidates.json"], models_value, tax, errors)
    validate_license_review(catalog["license-review.json"], projects_by_id, errors)
    validate_exclusions(catalog["exclusions.json"], index.repos, candidate_repos, errors)
    validate_queue_envelopes(catalog["candidates.json"], catalog["license-review.json"], errors)
    validate_published_copies(root, errors)

    return errors

def main() -> int:
    errors = validate()
    if errors:
        raise SystemExit("\n".join(errors))
    data = load("projects.json")
    families = sorted({project["system_family"] for project in data["projects"]})
    counts = {family: sum(project["system_family"] == family for project in data["projects"]) for family in families}
    specification_count = len(load("specifications.json")["specifications"])
    inference_service_count = len(load("inference-services.json")["services"])
    local_runtime_count = len(load("local-runtimes.json")["runtimes"])
    model_count = len(load("models.json")["models"])
    print(
        f"validated {len(data['projects'])} projects with reviewed license evidence: "
        f"{counts}; {specification_count} unscored specifications; "
        f"{inference_service_count} scored inference services; "
        f"{local_runtime_count} scored local runtimes; {model_count} scored model releases"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
