#!/usr/bin/env python3
"""Generate the web application's data payloads from the published catalog.

The published files under web/ are an API with a compatibility promise.
These payloads are a projection of them shaped for how the page loads: a small
boot payload per collection, a lazily fetched search index, per-reviewed-record
detail files, and one shared imported-model detail payload. See
docs/adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md.
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
    ("models", "models.json", "models", "model"),
    ("packs", "packs.json", "packs", "pack"),
)

# What a card, a filter, a sort, and the finder read before anything is clicked.
BOOT_FIELDS = {
    "systems": (
        "id",
        "name",
        "system_family",
        "primary_role",
        "secondary_roles",
        "score_profile",
        "stars",
        "status",
        "source_model",
        "licenses",
        "license_review_status",
        "description",
        "agent_relation",
        "architectures",
        "repo",
        "url",
        "deployment",
        "agent_interfaces",
        "local_first",
        "superseded_by",
        # Card badges test these; see CARD_BADGES in web/app-core.js.
        "human_editable",
        "execution_boundaries",
        "agent_capabilities",
        "retrieval_modes",
    ),
    "inference": (
        "id",
        "name",
        "service_type",
        "operator",
        "url",
        "api_styles",
        "model_sources",
        "delivery_modes",
        "description",
        "score_profile",
        "terms",
    ),
    "runtimes": (
        "id",
        "name",
        "runtime_type",
        "maintainer",
        "repo",
        "url",
        "api_styles",
        "accelerators",
        "model_formats",
        "serving_modes",
        "deployment_surfaces",
        "licenses",
        "source_model",
        "stars",
        "description",
        "score_profile",
    ),
    "specifications": (
        "id",
        "name",
        "short_name",
        "specification_type",
        "scope",
        "status",
        "current_version",
        "repo",
        "url",
        "licenses",
        "description",
        "stewards",
        "related_specifications",
    ),
    # source_metadata is a nested block rather than a card field, and it is here
    # for the same reason the flat ones are: the card prints the family and the
    # modality route out of it, and the modality facet filters on
    # source_metadata.modalities. It costs about 1.1 KB gzipped across the
    # collection, which is cheaper than a card that cannot paint until detail
    # lands.
    "models": (
        "id",
        "name",
        "model_type",
        "developer",
        "description",
        "source_id",
        "source_model",
        "licenses",
        "distribution_modes",
        "score_profile",
        "source_metadata",
        "review_status",
        "source_url",
    ),
    "packs": (
        "id",
        "name",
        "short_name",
        "steward",
        "repo",
        "url",
        "description",
        "pack_type",
        "hosts",
        "install_mechanism",
        "packaging_formats",
        "licenses",
        "status",
    ),
}

# Exactly the fields each filter in web/app-core.js searches today.
SEARCH_FIELDS = {
    "systems": (
        "id",
        "name",
        "description",
        "repo",
        "url",
        "why_it_matters",
        "strengths",
        "weaknesses",
    ),
    "inference": (
        "id",
        "name",
        "operator",
        "description",
        "service_boundary",
        "regional_controls",
        "retention_controls",
        "routing",
        "customization",
        "strengths",
        "tradeoffs",
    ),
    "runtimes": (
        "id",
        "name",
        "maintainer",
        "description",
        "runtime_boundary",
        "model_management",
        "hardware_requirements",
        "operational_controls",
        "strengths",
        "tradeoffs",
    ),
    "specifications": (
        "id",
        "name",
        "short_name",
        "description",
        "standardizes",
        "does_not_standardize",
        "repo",
        "stewards",
    ),
    "models": (
        "id",
        "source_id",
        "name",
        "developer",
        "description",
        "access_boundary",
        "strengths",
        "tradeoffs",
    ),
    "packs": (
        "id",
        "name",
        "short_name",
        "steward",
        "repo",
        "description",
        "installs",
        "not_a_system",
    ),
}

MODEL_SOURCE_CARD_METADATA = (
    "family",
    "modalities",
    "reported_open_weights",
    "reported_license",
)

# Envelope keys the page reads: bootstrap() prints the newest of these as "Data updated".
ENVELOPE_KEYS = ("generated_at", "verified_at")


def load_catalog(root: Path) -> dict[str, dict]:
    """Read the published copies the payloads project from."""
    web = root / "web"
    catalog = {
        name: json.loads((web / name).read_text(encoding="utf-8"))
        for _, name, _, _ in COLLECTIONS
    }
    catalog["models-dev.json"] = json.loads(
        (web / "models-dev.json").read_text(encoding="utf-8")
    )
    return catalog


def _overlay_models(catalog: dict[str, dict]) -> tuple[list[dict], int]:
    """Overlay reviewed Atlas models on the complete attributed source snapshot.

    A linked record matches its row by source_id. A record reviewed before
    models.dev listed it has no source_id and matches by id (ADR 036), but
    only against a row no linked record has already claimed by source_id -
    the single pass below is the one place that distinction is made, so the
    combined list and the unmatched count can never drift apart.

    Returns the combined list and the count of null-source records left
    unmatched after the pass.
    """
    linked: dict[str, dict] = {}
    unlisted: dict[str, dict] = {}
    for record in catalog["models.json"]["models"]:
        reviewed = {**record, "review_status": "reviewed"}
        if record["source_id"] is None:
            unlisted[record["id"]] = reviewed
        else:
            linked[record["source_id"]] = reviewed
    source = catalog["models-dev.json"]
    commit = source["source"]["commit"]
    combined: list[dict] = []
    for source_record in source["models"]:
        source_id = source_record["source_id"]
        if source_id in linked:
            combined.append(linked.pop(source_id))
            continue
        if source_record["id"] in unlisted:
            combined.append(unlisted.pop(source_record["id"]))
            continue
        metadata = source_record["source_metadata"]
        combined.append(
            {
                "id": source_record["id"],
                "source_id": source_id,
                "name": metadata["name"],
                "developer": source_id.split("/", 1)[0],
                "description": metadata["description"]
                or "No description reported by models.dev.",
                "source_metadata": metadata,
                "review_status": "imported",
                "source_url": f"https://github.com/anomalyco/models.dev/blob/{commit}/models/{source_id}.toml",
            }
        )
    combined.extend(linked.values())
    combined.extend(unlisted.values())
    return combined, len(unlisted)


def model_records(catalog: dict[str, dict]) -> list[dict]:
    """Overlay reviewed Atlas models on the complete attributed source snapshot."""
    records, _ = _overlay_models(catalog)
    return records


def unlisted_model_count(catalog: dict[str, dict]) -> int:
    """Reviewed models that no models.dev row stands behind yet."""
    _, count = _overlay_models(catalog)
    return count


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
    model_source_details: dict[str, dict] = {}
    overlaid_models, unlisted_count = _overlay_models(catalog)
    for collection, name, key, kind in COLLECTIONS:
        document = catalog[name]
        records = overlaid_models if collection == "models" else document[key]
        boot_fields = BOOT_FIELDS[collection]

        entries = []
        for record in records:
            entry = {field: record[field] for field in boot_fields if field in record}
            if collection == "models" and record.get("review_status") == "imported":
                entry.pop("description", None)
                entry["source_metadata"] = {
                    field: record["source_metadata"][field]
                    for field in MODEL_SOURCE_CARD_METADATA
                }
                model_source_details[record["id"]] = {
                    "description": record["description"],
                    "source_metadata": record["source_metadata"],
                }
            if "score" in record:
                entry["score"] = {"overall": record["score"]["overall"]}
            entries.append(entry)

        envelope = {
            envelope_key: document[envelope_key]
            for envelope_key in ENVELOPE_KEYS
            if envelope_key in document
        }
        if collection == "models":
            envelope.update(
                {
                    "source_updated_at": catalog["models-dev.json"]["updated_at"],
                    "source_record_count": catalog["models-dev.json"][
                        "source_record_count"
                    ],
                    "reviewed_count": len(document[key]),
                    "unlisted_reviewed_count": unlisted_count,
                }
            )
        payloads[f"app/{collection}.json"] = dumps({**envelope, collection: entries})

        payloads[f"app/search/{collection}.json"] = dumps(
            {
                record["id"]: " ".join(
                    searchable_text(record.get(field))
                    for field in SEARCH_FIELDS[collection]
                ).lower()
                for record in records
            }
        )

        for record in records:
            if collection == "models" and record.get("review_status") == "imported":
                continue
            detail = {
                field: value
                for field, value in record.items()
                if field not in boot_fields
            }
            if "score" in record:
                detail["score"] = record["score"]
            payloads[f"app/detail/{kind}/{record['id']}.json"] = dumps(detail)
    payloads["app/model-source-details.json"] = dumps(model_source_details)
    return payloads


def main(argv: list[str]) -> int:
    payloads = build_payloads(load_catalog(ROOT))
    web = ROOT / "web"
    if "--check" in argv:
        problems = [
            f"web/{path} is missing or stale"
            for path, content in payloads.items()
            if not (web / path).exists()
            or (web / path).read_text(encoding="utf-8") != content
        ]
        app_dir = web / "app"
        if app_dir.exists():
            committed = {
                str(path.relative_to(web))
                for path in app_dir.rglob("*")
                if path.is_file()
            }
            problems += [
                f"web/{path} is not produced by the catalog"
                for path in sorted(committed - set(payloads))
            ]
        if problems:
            print(
                "\n".join(
                    problems[:20]
                    + (
                        [f"… and {len(problems) - 20} more"]
                        if len(problems) > 20
                        else []
                    )
                ),
                file=sys.stderr,
            )
            print(
                "Run `uv run python scripts/build_web_payload.py` and commit the result.",
                file=sys.stderr,
            )
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
