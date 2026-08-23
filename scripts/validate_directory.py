#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
taxonomy = json.loads((ROOT / "directory" / "taxonomy.json").read_text())
data = json.loads((ROOT / "directory" / "projects.json").read_text())
roles = {item["id"] for item in taxonomy["primary_roles"]}
relations = {item["id"] for item in taxonomy["agent_relations"]}
architectures = {item["id"] for item in taxonomy["architectures"]}
ids: set[str] = set()
errors: list[str] = []
for project in data["projects"]:
    prefix = project.get("repo", project.get("id", "unknown"))
    if project["id"] in ids: errors.append(f"{prefix}: duplicate id")
    ids.add(project["id"])
    if project["primary_role"] not in roles: errors.append(f"{prefix}: unknown role")
    if project["agent_relation"] not in relations: errors.append(f"{prefix}: unknown agent relation")
    unknown = set(project["architectures"]) - architectures
    if unknown: errors.append(f"{prefix}: unknown architectures {sorted(unknown)}")
    if project["license_scope"] != "open_source": errors.append(f"{prefix}: non-open-source entry in main directory")
    overall = project["score"]["overall"]
    if not 0 <= overall <= 10: errors.append(f"{prefix}: invalid score")
if errors:
    raise SystemExit("\n".join(errors))
print(f"validated {len(data['projects'])} projects across {len(roles)} roles")
