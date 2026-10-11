#!/usr/bin/env python3
"""Build reproducible CSV analysis exports from the published catalog mirrors.

The exports describe the reviewed catalog for analysis: one identity spine plus
one table each for model distributions, material licenses, score dimensions,
and license evidence, with a data dictionary and a provenance manifest. They
are derived tables, not a second source of truth: every row joins back to a
published record by (collection, record_id), and multi-valued fields live in
their own pair tables so counting rows in a child table never counts records.

Inputs are the synchronized web/ mirrors of PUBLISHED_DATA only — never
directory/ directly, and never the unpublished queues or dispositions
(candidates, model-candidates, model-dispositions, OpenRouter leads and
dispositions, license-review, discovery-sources, hn-signals). Imported
models.dev source rows appear in the spine with record_kind
``imported_source`` and empty reviewed columns, so reviewed conclusions stay
distinguishable from source metadata.

Output is deterministic: rows are sorted, newlines are ``\\n``, and the
manifest carries the source revision plus input hashes but no timestamps.
``--check`` rebuilds into a temporary directory and reports every file whose
committed bytes differ, writing nothing.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT_DIRNAME = "analysis"

# collection, published mirror, record key, kind label, type field,
# status field or None, licenses field or None, scored
COLLECTIONS: tuple[
    tuple[str, str, str, str, str, str | None, str | None, bool], ...
] = (
    (
        "systems",
        "projects.json",
        "projects",
        "system",
        "system_family",
        "status",
        "licenses",
        True,
    ),
    (
        "inference",
        "inference-services.json",
        "services",
        "inference",
        "service_type",
        None,
        None,
        True,
    ),
    (
        "runtimes",
        "local-runtimes.json",
        "runtimes",
        "runtime",
        "runtime_type",
        None,
        "licenses",
        True,
    ),
    (
        "specifications",
        "specifications.json",
        "specifications",
        "spec",
        "specification_type",
        "status",
        "licenses",
        False,
    ),
    ("models", "models.json", "models", "model", "model_type", None, "licenses", True),
    ("packs", "packs.json", "packs", "pack", "pack_type", "status", "licenses", False),
    ("labs", "labs.json", "labs", "lab", "lab_type", None, None, False),
    ("robots", "robots.json", "robots", "robot", "form_factor", "status", None, False),
)

TABLES = (
    "records",
    "model_distributions",
    "material_licenses",
    "score_dimensions",
    "evidence",
    "data_dictionary",
)

# table, column, type, description. The grain sentence each table starts with
# is load-bearing: it states what one row is, so a reader never counts
# records by counting child-table rows.
DATA_DICTIONARY: tuple[tuple[str, str, str, str], ...] = (
    ("records", "collection", "string", "Published collection the row belongs to."),
    (
        "records",
        "record_id",
        "string",
        "Stable record id; the join key with every other table.",
    ),
    (
        "records",
        "record_kind",
        "string",
        "reviewed for a human-reviewed record, imported_source for an unmatched models.dev source row.",
    ),
    (
        "records",
        "name",
        "string",
        "Record display name; empty for imported source rows without one.",
    ),
    (
        "records",
        "type_value",
        "string",
        "The collection's classifying value: system_family, service_type, runtime_type, model_type, specification_type, pack_type, lab_type, or robot form_factor.",
    ),
    (
        "records",
        "status",
        "string",
        "Lifecycle status where the collection carries one; empty otherwise.",
    ),
    (
        "records",
        "source_id",
        "string",
        "models.dev source id for reviewed models that have one; empty otherwise.",
    ),
    (
        "records",
        "verified_at",
        "string",
        "Editorial review date; the review provenance of the row. Empty for imported source rows.",
    ),
    ("model_distributions", "record_id", "string", "Reviewed model id; joins records."),
    (
        "model_distributions",
        "distribution_mode",
        "string",
        "One distribution mode the release is reviewed as using.",
    ),
    (
        "material_licenses",
        "collection",
        "string",
        "Published collection the record belongs to.",
    ),
    ("material_licenses", "record_id", "string", "Record id; joins records."),
    (
        "material_licenses",
        "license_id",
        "string",
        "One reviewed material license identifier on the record.",
    ),
    (
        "score_dimensions",
        "collection",
        "string",
        "Published collection the record belongs to.",
    ),
    ("score_dimensions", "record_id", "string", "Scored record id; joins records."),
    (
        "score_dimensions",
        "score_profile",
        "string",
        "Score profile the dimensions belong to.",
    ),
    ("score_dimensions", "dimension", "string", "Score dimension, including overall."),
    (
        "score_dimensions",
        "value",
        "string",
        "Dimension value as stored in the published record.",
    ),
    ("evidence", "collection", "string", "Published collection the record belongs to."),
    ("evidence", "record_id", "string", "Record id; joins records."),
    (
        "evidence",
        "license_id",
        "string",
        "License identifier the evidence item covers.",
    ),
    (
        "evidence",
        "scope",
        "string",
        "Component, path, documentation, assets, or product terms covered.",
    ),
    ("evidence", "kind", "string", "git_blob or web_terms."),
    ("evidence", "url", "string", "Authoritative URL of the evidence."),
    (
        "evidence",
        "path",
        "string",
        "Repository path for git_blob evidence; empty otherwise.",
    ),
    (
        "evidence",
        "blob_sha",
        "string",
        "Git blob SHA for git_blob evidence; empty otherwise.",
    ),
    (
        "evidence",
        "verified_at",
        "string",
        "Evidence verification date where the item carries one; empty otherwise.",
    ),
    ("data_dictionary", "table", "string", "Export table the column belongs to."),
    (
        "data_dictionary",
        "column",
        "string",
        "Column name as it appears in the CSV header.",
    ),
    ("data_dictionary", "type", "string", "Value type."),
    (
        "data_dictionary",
        "description",
        "string",
        "What the column carries, including the grain of its table.",
    ),
)

GRAIN = {
    "records": "One row per reviewed published record, plus one row per unmatched models.dev source row.",
    "model_distributions": "One row per (reviewed model, distribution mode) pair.",
    "material_licenses": "One row per (record, reviewed license) pair.",
    "score_dimensions": "One row per (scored record, dimension) pair, overall included.",
    "evidence": "One row per license evidence item.",
    "data_dictionary": "One row per (table, column) pair.",
}


def read_mirror(name: str) -> dict:
    return json.loads((WEB / name).read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_revision() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    return result.stdout.strip() or None if result.returncode == 0 else None


def reviewed_source_keys(models: list[dict]) -> tuple[set[str], set[str]]:
    """Source ids and record ids that reviewed models already account for."""
    source_ids = {m["source_id"] for m in models if m.get("source_id")}
    record_ids = {m["id"] for m in models if not m.get("source_id")}
    return source_ids, record_ids


def build_tables(catalog: dict[str, dict]) -> dict[str, list[list[str]]]:
    records: list[list[str]] = []
    distributions: list[list[str]] = []
    licenses: list[list[str]] = []
    dimensions: list[list[str]] = []
    evidence: list[list[str]] = []

    for (
        collection,
        filename,
        reckey,
        _kind,
        type_field,
        status_field,
        licenses_field,
        scored,
    ) in COLLECTIONS:
        for record in catalog[filename][reckey]:
            record_id = record["id"]
            records.append(
                [
                    collection,
                    record_id,
                    "reviewed",
                    record.get("name", ""),
                    record.get(type_field, ""),
                    record.get(status_field, "") if status_field else "",
                    record.get("source_id", "") or "",
                    record.get("verified_at", "") or "",
                ]
            )
            if collection == "models":
                for mode in sorted(set(record.get("distribution_modes", []))):
                    distributions.append([record_id, mode])
            if licenses_field:
                for license_id in sorted(set(record.get(licenses_field, []))):
                    licenses.append([collection, record_id, license_id])
            if scored:
                for dimension in sorted(record.get("score", {})):
                    dimensions.append(
                        [
                            collection,
                            record_id,
                            record.get("score_profile", ""),
                            dimension,
                            repr(record["score"][dimension]),
                        ]
                    )
            for item in record.get("license_evidence", []):
                evidence.append(
                    [
                        collection,
                        record_id,
                        item.get("license_id", ""),
                        item.get("scope", ""),
                        item.get("kind", ""),
                        item.get("url", ""),
                        item.get("path", ""),
                        item.get("blob_sha", ""),
                        item.get("verified_at", "") or "",
                    ]
                )

    reviewed = catalog["models.json"]["models"]
    source_ids, record_ids = reviewed_source_keys(reviewed)
    for row in catalog["models-dev.json"]["models"]:
        if row.get("source_id") in source_ids or row.get("id") in record_ids:
            continue
        records.append(
            [
                "models",
                row["id"],
                "imported_source",
                (row.get("source_metadata", {}) or {}).get("name", "") or "",
                "",
                "",
                row.get("source_id", "") or "",
                "",
            ]
        )

    for item_entry in catalog["license-evidence.json"]["entries"]:
        for item in item_entry.get("items", []):
            evidence.append(
                [
                    "systems",
                    item_entry["project_id"],
                    item.get("license_id", ""),
                    item.get("scope", ""),
                    item.get("kind", ""),
                    item.get("url", ""),
                    item.get("path", ""),
                    item.get("blob_sha", ""),
                    item.get("verified_at", "") or "",
                ]
            )

    records.sort()
    distributions.sort()
    licenses.sort()
    dimensions.sort()
    evidence.sort()
    dictionary = [
        [table, column, kind, description]
        for table, column, kind, description in DATA_DICTIONARY
    ]
    return {
        "records": records,
        "model_distributions": distributions,
        "material_licenses": licenses,
        "score_dimensions": dimensions,
        "evidence": evidence,
        "data_dictionary": dictionary,
    }


HEADERS = {
    "records": (
        "collection",
        "record_id",
        "record_kind",
        "name",
        "type_value",
        "status",
        "source_id",
        "verified_at",
    ),
    "model_distributions": ("record_id", "distribution_mode"),
    "material_licenses": ("collection", "record_id", "license_id"),
    "score_dimensions": (
        "collection",
        "record_id",
        "score_profile",
        "dimension",
        "value",
    ),
    "evidence": (
        "collection",
        "record_id",
        "license_id",
        "scope",
        "kind",
        "url",
        "path",
        "blob_sha",
        "verified_at",
    ),
    "data_dictionary": ("table", "column", "type", "description"),
}

INPUT_FILES = (
    "projects.json",
    "models.json",
    "models-dev.json",
    "inference-services.json",
    "local-runtimes.json",
    "packs.json",
    "labs.json",
    "robots.json",
    "specifications.json",
    "license-evidence.json",
)


def render_csv(header: tuple[str, ...], rows: list[list[str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return buffer.getvalue()


def build_outputs(catalog: dict[str, dict]) -> dict[str, str]:
    tables = build_tables(catalog)
    outputs = {name: render_csv(HEADERS[name], tables[name]) for name in TABLES}
    manifest = {
        "generator": "scripts/build_analysis_exports.py",
        "source_revision": source_revision(),
        "inputs": {name: file_sha256(WEB / name) for name in INPUT_FILES},
        "tables": {
            name: {
                "rows": len(tables[name]),
                "sha256": hashlib.sha256(outputs[name].encode("utf-8")).hexdigest(),
            }
            for name in TABLES
        },
    }
    outputs["manifest"] = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    return outputs


def filenames() -> dict[str, str]:
    return {name: f"{name}.csv" for name in TABLES} | {"manifest": "manifest.json"}


def write_outputs(out_dir: Path, outputs: dict[str, str]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    names = filenames()
    for name, text in outputs.items():
        (out_dir / names[name]).write_text(text, encoding="utf-8")
    for stale in out_dir.iterdir():
        if stale.name not in names.values():
            stale.unlink()


def load_catalog() -> dict[str, dict]:
    return {name: read_mirror(name) for name in INPUT_FILES}


def manifests_equal(committed: bytes, fresh: bytes) -> bool:
    """Manifests match when everything but the wall-clock-free source revision matches.

    The revision names the commit the export was generated from, so it moves
    with unrelated commits while the tables stay identical. Staleness is
    content drift, not a newer HEAD.
    """
    try:
        old = json.loads(committed.decode("utf-8"))
        new = json.loads(fresh.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return False
    old["source_revision"] = new.get("source_revision")
    return old == new


def check(out_dir: Path) -> list[str]:
    with tempfile.TemporaryDirectory(prefix="analysis-exports-") as tmp:
        fresh = Path(tmp)
        write_outputs(fresh, build_outputs(load_catalog()))
        names = filenames()
        stale = []
        for name, filename in names.items():
            candidate = fresh / filename
            committed = out_dir / filename
            if not committed.is_file():
                stale.append(f"web/{OUT_DIRNAME}/{filename} is missing or stale")
            elif name == "manifest":
                if not manifests_equal(committed.read_bytes(), candidate.read_bytes()):
                    stale.append(f"web/{OUT_DIRNAME}/{filename} is missing or stale")
            elif committed.read_bytes() != candidate.read_bytes():
                stale.append(f"web/{OUT_DIRNAME}/{filename} is missing or stale")
        for extra in out_dir.iterdir() if out_dir.is_dir() else []:
            if extra.name not in names.values():
                stale.append(
                    f"web/{OUT_DIRNAME}/{extra.name} is not generated by build_analysis_exports.py"
                )
        return stale


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="report stale exports without writing"
    )
    args = parser.parse_args(argv[1:])
    out_dir = WEB / OUT_DIRNAME
    if args.check:
        stale = check(out_dir)
        for line in stale:
            print(line)
            print(
                "Run `uv run python scripts/build_analysis_exports.py` and commit the result."
            )
        return 1 if stale else 0
    write_outputs(out_dir, build_outputs(load_catalog()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
