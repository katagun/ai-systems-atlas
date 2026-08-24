#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str) -> dict:
    return json.loads((ROOT / "directory" / name).read_text(encoding="utf-8"))


taxonomy = load("taxonomy.json")
data = load("projects.json")
evidence_data = load("license-evidence.json")

families = {item["id"] for item in taxonomy["system_families"]}
roles = {item["id"]: item["family"] for item in taxonomy["primary_roles"]}
relations = {item["id"] for item in taxonomy["agent_relations"]}
architectures = {item["id"] for item in taxonomy["architectures"]}
profiles = {item["id"]: item for item in taxonomy["score_profiles"]}
agent_interfaces = {item["id"] for item in taxonomy["agent_interfaces"]}
execution_boundaries = {item["id"] for item in taxonomy["execution_boundaries"]}
agent_capabilities = {item["id"] for item in taxonomy["agent_capabilities"]}
evidence = {item["repo"].lower(): item for item in evidence_data["entries"]}

errors: list[str] = []
ids: set[str] = set()
repos: set[str] = set()

for project in data["projects"]:
    prefix = project.get("repo", project.get("id", "unknown"))
    repo_key = project["repo"].lower()

    if project["id"] in ids:
        errors.append(f"{prefix}: duplicate id")
    if repo_key in repos:
        errors.append(f"{prefix}: duplicate repository")
    ids.add(project["id"])
    repos.add(repo_key)

    family = project.get("system_family")
    if family not in families:
        errors.append(f"{prefix}: unknown system family {family!r}")
    role = project.get("primary_role")
    if role not in roles:
        errors.append(f"{prefix}: unknown role {role!r}")
    elif roles[role] != family:
        errors.append(f"{prefix}: role {role!r} belongs to {roles[role]!r}, not {family!r}")

    profile_id = project.get("score_profile")
    profile = profiles.get(profile_id)
    if not profile:
        errors.append(f"{prefix}: unknown score profile {profile_id!r}")
    elif profile["family"] != family:
        errors.append(f"{prefix}: score profile {profile_id!r} does not match {family!r}")
    else:
        dimensions = {item["id"]: item["weight"] for item in profile["dimensions"]}
        score = project.get("score", {})
        expected_keys = set(dimensions) | {"overall"}
        if set(score) != expected_keys:
            errors.append(f"{prefix}: score keys must exactly match profile {profile_id!r}")
        else:
            if any(not 0 <= score[key] <= 10 for key in dimensions):
                errors.append(f"{prefix}: score dimensions must be between 0 and 10")
            calculated = round(sum(score[key] * weight for key, weight in dimensions.items()), 2)
            if score["overall"] != calculated:
                errors.append(f"{prefix}: overall {score['overall']} does not match weighted {calculated}")

    if project.get("agent_relation") not in relations:
        errors.append(f"{prefix}: unknown agent relation")
    unknown = set(project.get("architectures", [])) - architectures
    if unknown:
        errors.append(f"{prefix}: unknown architectures {sorted(unknown)}")
    if project.get("license_scope") != "open_source":
        errors.append(f"{prefix}: non-open-source entry in main directory")

    if family == "agent_system":
        for field, allowed in (
            ("agent_interfaces", agent_interfaces),
            ("execution_boundaries", execution_boundaries),
            ("agent_capabilities", agent_capabilities),
        ):
            values = project.get(field)
            if not values:
                errors.append(f"{prefix}: agent project requires {field}")
            elif unknown_values := set(values) - allowed:
                errors.append(f"{prefix}: unknown {field} {sorted(unknown_values)}")

    proof = evidence.get(repo_key)
    if not proof:
        errors.append(f"{prefix}: missing pinned license evidence")
    else:
        if proof.get("spdx_id") != project.get("license"):
            errors.append(f"{prefix}: evidence license does not match project license")
        if not re.fullmatch(r"[0-9a-f]{40}", proof.get("blob_sha", "")):
            errors.append(f"{prefix}: invalid license blob SHA")
        expected_prefix = f"https://github.com/{project['repo']}/blob/"
        if not proof.get("url", "").startswith(expected_prefix):
            errors.append(f"{prefix}: license evidence must be a GitHub blob URL for the repository")

extra_evidence = set(evidence) - repos
if extra_evidence:
    errors.append(f"license evidence has no project: {sorted(extra_evidence)}")

for profile in profiles.values():
    weight = sum(item["weight"] for item in profile["dimensions"])
    if abs(weight - 1.0) > 1e-9:
        errors.append(f"score profile {profile['id']}: weights total {weight}, not 1")

if errors:
    raise SystemExit("\n".join(errors))

counts = {family: sum(project["system_family"] == family for project in data["projects"]) for family in sorted(families)}
print(f"validated {len(data['projects'])} projects with pinned licenses: {counts}")
