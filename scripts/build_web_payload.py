#!/usr/bin/env python3
"""Generate the web application's data payloads from the published catalog.

The seven files under web/ are a published API with a compatibility promise.
These payloads are a projection of them shaped for how the page loads: a small
boot payload per collection, a lazily fetched search index, and one detail file
per record. See docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# collection, published file, record key, record-reference kind
COLLECTIONS = (
    ("systems", "projects.json", "projects", "system"),
    ("inference", "inference-services.json", "services", "inference"),
    ("runtimes", "local-runtimes.json", "runtimes", "runtime"),
    ("specifications", "specifications.json", "specifications", "spec"),
)

# What a card, a filter, a sort, and the finder read before anything is clicked.
BOOT_FIELDS = {
    "systems": (
        "id", "name", "system_family", "primary_role", "secondary_roles", "score_profile",
        "stars", "status", "source_model", "licenses", "license_review_status", "description",
        "agent_relation", "architectures", "repo", "url", "deployment", "agent_interfaces",
        "local_first", "superseded_by",
    ),
    "inference": (
        "id", "name", "service_type", "operator", "url", "api_styles", "model_sources",
        "delivery_modes", "description", "score_profile", "terms",
    ),
    "runtimes": (
        "id", "name", "runtime_type", "maintainer", "repo", "url", "api_styles", "accelerators",
        "model_formats", "serving_modes", "deployment_surfaces", "licenses", "source_model",
        "stars", "description", "score_profile",
    ),
    "specifications": (
        "id", "name", "short_name", "specification_type", "scope", "status", "current_version",
        "repo", "url", "licenses", "description", "stewards", "related_specifications",
    ),
}

# Exactly the fields each filter in web/app-core.js searches today.
SEARCH_FIELDS = {
    "systems": ("id", "name", "description", "repo", "url", "why_it_matters", "strengths", "weaknesses"),
    "inference": (
        "id", "name", "operator", "description", "service_boundary", "regional_controls",
        "retention_controls", "routing", "customization", "strengths", "tradeoffs",
    ),
    "runtimes": (
        "id", "name", "maintainer", "description", "runtime_boundary", "model_management",
        "hardware_requirements", "operational_controls", "strengths", "tradeoffs",
    ),
    "specifications": (
        "id", "name", "short_name", "description", "standardizes", "does_not_standardize",
        "repo", "stewards",
    ),
}

# Envelope keys the page reads: bootstrap() prints the newest of these as "Data updated".
ENVELOPE_KEYS = ("generated_at", "verified_at")


def load_catalog(root: Path) -> dict[str, dict]:
    """Read the published copies the payloads project from."""
    web = root / "web"
    return {
        name: json.loads((web / name).read_text(encoding="utf-8"))
        for _, name, _, _ in COLLECTIONS
    }


def searchable_text(value) -> str:
    """Flatten a field the way the browser's filters do before matching."""
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(searchable_text(item) for item in value)
    return str(value)


def dumps(payload) -> str:
    """Payloads are machine-read, so they are written minified with a trailing newline."""
    return json.dumps(payload, separators=(",", ":"), sort_keys=False) + "\n"


def build_payloads(catalog: dict[str, dict]) -> dict[str, str]:
    payloads: dict[str, str] = {}
    for collection, name, key, kind in COLLECTIONS:
        document = catalog[name]
        records = document[key]
        boot_fields = BOOT_FIELDS[collection]

        entries = []
        for record in records:
            entry = {field: record[field] for field in boot_fields if field in record}
            if "score" in record:
                entry["score"] = {"overall": record["score"]["overall"]}
            entries.append(entry)

        envelope = {key: document[key] for key in ENVELOPE_KEYS if key in document}
        payloads[f"app/{collection}.json"] = dumps({**envelope, collection: entries})

        payloads[f"app/search/{collection}.json"] = dumps({
            record["id"]: " ".join(
                searchable_text(record.get(field)) for field in SEARCH_FIELDS[collection]
            ).lower()
            for record in records
        })

        for record in records:
            detail = {field: value for field, value in record.items() if field not in boot_fields}
            if "score" in record:
                detail["score"] = record["score"]
            payloads[f"app/detail/{kind}/{record['id']}.json"] = dumps(detail)
    return payloads


def main(argv: list[str]) -> int:
    payloads = build_payloads(load_catalog(ROOT))
    web = ROOT / "web"
    if "--check" in argv:
        problems = [
            f"web/{path} is missing or stale"
            for path, content in payloads.items()
            if not (web / path).exists() or (web / path).read_text(encoding="utf-8") != content
        ]
        app_dir = web / "app"
        if app_dir.exists():
            committed = {str(path.relative_to(web)) for path in app_dir.rglob("*") if path.is_file()}
            problems += [
                f"web/{path} is not produced by the catalog"
                for path in sorted(committed - set(payloads))
            ]
        if problems:
            print("\n".join(problems[:20] + ([f"… and {len(problems) - 20} more"] if len(problems) > 20 else [])), file=sys.stderr)
            print("Run `uv run python scripts/build_web_payload.py` and commit the result.", file=sys.stderr)
            return 1
        print(f"{len(payloads)} app payload files are up to date.")
        return 0
    shutil.rmtree(web / "app", ignore_errors=True)
    for path, content in payloads.items():
        target = web / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(f"wrote {len(payloads)} app payload files under web/app/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
