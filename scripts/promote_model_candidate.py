#!/usr/bin/env python3
"""Guarded human-review workflow for promoting one models.dev candidate.

The command scaffolds review work but never invents editorial conclusions. Its
apply path writes only after the complete proposed model collection and the
remaining candidate queue pass validation together.
"""
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
from copy import deepcopy
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

try:
    from .validate_directory import (
        validate_model_candidates,
        validate_models,
        validate_taxonomy,
        validate_unique_record_ids,
    )
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from validate_directory import (
        validate_model_candidates,
        validate_models,
        validate_taxonomy,
        validate_unique_record_ids,
    )

ROOT = Path(__file__).resolve().parents[1]
MODELS_DEV_REPO = "https://github.com/anomalyco/models.dev"


class PromotionError(ValueError):
    """A review draft is incomplete, inconsistent, or unsafe to apply."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise PromotionError(f"required file does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise PromotionError(f"invalid JSON in {path}: {error}") from error
    if not isinstance(value, dict):
        raise PromotionError(f"expected a JSON object in {path}")
    return value


def candidate_for(
    candidates_data: dict[str, Any], identifier: str,
) -> dict[str, Any]:
    candidates = candidates_data.get("candidates")
    if not isinstance(candidates, list):
        raise PromotionError("model-candidates.json does not contain a candidate list")
    matches = [
        item for item in candidates
        if isinstance(item, dict)
        and identifier in {item.get("id"), item.get("source_id")}
    ]
    if not matches:
        raise PromotionError(f"model candidate not found: {identifier}")
    if len(matches) != 1:
        raise PromotionError(f"model candidate identifier is ambiguous: {identifier}")
    return matches[0]


def models_dev_evidence_url(candidate: dict[str, Any], candidates_data: dict[str, Any]) -> str:
    source = candidates_data.get("source")
    commit = source.get("commit") if isinstance(source, dict) else None
    source_id = candidate.get("source_id")
    if not isinstance(commit, str) or not isinstance(source_id, str):
        raise PromotionError("candidate source attribution is incomplete")
    return f"{MODELS_DEV_REPO}/blob/{commit}/models/{source_id}.toml"


def build_draft(
    candidate: dict[str, Any], candidates_data: dict[str, Any],
) -> dict[str, Any]:
    """Create an intentionally incomplete full-schema review draft."""
    source_metadata = deepcopy(candidate.get("source_metadata"))
    reported_name = source_metadata.get("name") if isinstance(source_metadata, dict) else None
    return {
        "id": candidate.get("id"),
        "source_id": candidate.get("source_id"),
        "name": reported_name if isinstance(reported_name, str) else "",
        "developer": "",
        "url": "",
        "description": "",
        "model_type": "",
        "distribution_modes": [],
        "source_metadata": source_metadata,
        "licenses": [],
        "source_model": "",
        "license_review_status": "review_required",
        "license_note": "",
        "license_evidence": [],
        "access_boundary": "",
        "strengths": [],
        "tradeoffs": [],
        "score_profile": "model_access",
        "score": {
            "license_clarity": None,
            "artifact_availability": None,
            "deployment_portability": None,
            "serving_reach": None,
            "lifecycle_transparency": None,
            "documentation_provenance": None,
            "overall": None,
        },
        "evidence": [
            {
                "kind": "web",
                "label": "Pinned models.dev source metadata",
                "url": models_dev_evidence_url(candidate, candidates_data),
                "verified_at": "",
            }
        ],
        "metadata_verified_at": "",
        "verified_at": "",
    }


def _valid_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def _promotion_specific_errors(
    record: dict[str, Any],
    candidate: dict[str, Any],
    candidates_data: dict[str, Any],
    models_data: dict[str, Any],
    source_models_data: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    for field in ("id", "source_id", "source_metadata"):
        if record.get(field) != candidate.get(field):
            errors.append(f"review record must preserve candidate {field} exactly")

    source_models = source_models_data.get("models")
    source_matches = [
        item for item in source_models or []
        if isinstance(item, dict) and item.get("source_id") == candidate.get("source_id")
    ] if isinstance(source_models, list) else []
    if len(source_matches) != 1:
        errors.append("candidate must appear exactly once in the complete models.dev source snapshot")
    elif source_matches[0].get("source_metadata") != candidate.get("source_metadata"):
        errors.append("candidate metadata differs from the complete models.dev source snapshot")

    models = models_data.get("models")
    if not isinstance(models, list):
        errors.append("models.json does not contain a model list")
        models = []
    for model in models:
        if not isinstance(model, dict):
            continue
        if model.get("id") == record.get("id"):
            errors.append(f"model id is already published: {record.get('id')}")
        if model.get("source_id") == record.get("source_id"):
            errors.append(f"models.dev source_id is already published: {record.get('source_id')}")

    if record.get("license_review_status") != "verified":
        errors.append("license_review_status must be verified before promotion")

    evidence = record.get("evidence")
    evidence_urls = {
        item.get("url") for item in evidence or [] if isinstance(item, dict)
    } if isinstance(evidence, list) else set()
    try:
        expected_source_url = models_dev_evidence_url(candidate, candidates_data)
    except PromotionError as error:
        errors.append(str(error))
    else:
        if expected_source_url not in evidence_urls:
            errors.append("evidence must include the exact pinned models.dev source URL")
    if record.get("url") not in evidence_urls:
        errors.append("evidence must include the authoritative model URL")

    queue_date = _valid_date(candidates_data.get("updated_at"))
    metadata_date = _valid_date(record.get("metadata_verified_at"))
    reviewed_date = _valid_date(record.get("verified_at"))
    current_date = datetime.now(UTC).date()
    if metadata_date and queue_date and metadata_date < queue_date:
        errors.append("metadata_verified_at predates the imported candidate snapshot")
    if reviewed_date and metadata_date and reviewed_date < metadata_date:
        errors.append("verified_at predates metadata_verified_at")
    if metadata_date and metadata_date > current_date:
        errors.append("metadata_verified_at cannot be in the future")
    if reviewed_date and reviewed_date > current_date:
        errors.append("verified_at cannot be in the future")
    return errors


def preflight_promotion(
    root: Path, record: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return complete proposed documents or raise without writing anything."""
    directory = root / "directory"
    models_data = load_json(directory / "models.json")
    source_models_data = load_json(directory / "models-dev.json")
    candidates_data = load_json(directory / "model-candidates.json")
    taxonomy_data = load_json(directory / "taxonomy.json")
    projects_data = load_json(directory / "projects.json")
    specifications_data = load_json(directory / "specifications.json")
    inference_services_data = load_json(directory / "inference-services.json")
    local_runtimes_data = load_json(directory / "local-runtimes.json")
    source_id = record.get("source_id")
    if not isinstance(source_id, str) or not source_id:
        raise PromotionError("review record requires a models.dev source_id")
    candidate = candidate_for(candidates_data, source_id)

    errors = _promotion_specific_errors(
        record, candidate, candidates_data, models_data, source_models_data,
    )
    proposed_models = deepcopy(models_data)
    proposed_candidates = deepcopy(candidates_data)
    if isinstance(proposed_models.get("models"), list):
        proposed_models["models"].append(deepcopy(record))
        proposed_models["models"].sort(key=lambda item: (
            str(item.get("developer", "")).casefold(),
            str(item.get("name", "")).casefold(),
            str(item.get("id", "")),
        ))
    record_date = _valid_date(record.get("verified_at"))
    collection_date = _valid_date(proposed_models.get("verified_at"))
    if record_date and (collection_date is None or record_date > collection_date):
        proposed_models["verified_at"] = record_date.isoformat()

    remaining = proposed_candidates.get("candidates")
    if isinstance(remaining, list):
        proposed_candidates["candidates"] = [
            item for item in remaining
            if not isinstance(item, dict) or item.get("source_id") != source_id
        ]
    taxonomy_errors: list[str] = []
    taxonomy = validate_taxonomy(taxonomy_data, taxonomy_errors)
    errors.extend(taxonomy_errors)
    validate_models(proposed_models, taxonomy, errors)
    published_models = proposed_models.get("models")
    validate_unique_record_ids(
        projects_data.get("projects", []),
        specifications_data.get("specifications", []),
        inference_services_data.get("services", []),
        local_runtimes_data.get("runtimes", []),
        published_models if isinstance(published_models, list) else [],
        errors,
    )
    validate_model_candidates(
        proposed_candidates,
        published_models if isinstance(published_models, list) else [],
        source_models_data.get("models", []) if isinstance(source_models_data.get("models"), list) else [],
        taxonomy,
        errors,
    )
    if errors:
        formatted = "\n".join(f"- {error}" for error in errors)
        raise PromotionError(f"model candidate is not ready for promotion:\n{formatted}")
    return proposed_models, proposed_candidates


def _write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    target_mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary_path, target_mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def apply_promotion(root: Path, record: dict[str, Any]) -> tuple[int, str]:
    """Apply a preflighted promotion and return remaining count plus model id."""
    proposed_models, proposed_candidates = preflight_promotion(root, record)
    models_path = root / "directory" / "models.json"
    candidates_path = root / "directory" / "model-candidates.json"
    original_models = models_path.read_bytes()
    original_candidates = candidates_path.read_bytes()
    try:
        _write_json_atomic(models_path, proposed_models)
        _write_json_atomic(candidates_path, proposed_candidates)
    except Exception:
        models_path.write_bytes(original_models)
        candidates_path.write_bytes(original_candidates)
        raise
    candidates = proposed_candidates.get("candidates")
    remaining = len(candidates) if isinstance(candidates, list) else 0
    return remaining, str(record.get("id"))


def write_draft(path: Path, draft: dict[str, Any]) -> None:
    if path.exists():
        raise PromotionError(f"refusing to overwrite existing review draft: {path}")
    _write_json_atomic(path, draft)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scaffold, check, or apply one reviewed models.dev candidate.",
    )
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="write an incomplete human-review draft")
    init.add_argument("candidate", help="models.dev source_id or Atlas candidate id")
    init.add_argument("--output", type=Path, required=True, help="new JSON review-draft path")

    for name, help_text in (
        ("check", "validate a completed review draft without writing"),
        ("apply", "promote a completed review draft into the canonical catalog"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("record", type=Path, help="completed JSON review-draft path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == "init":
            candidates_data = load_json(root / "directory" / "model-candidates.json")
            candidate = candidate_for(candidates_data, args.candidate)
            output = args.output.resolve()
            write_draft(output, build_draft(candidate, candidates_data))
            print(f"wrote incomplete review draft for {candidate['source_id']} to {output}")
            print("complete every editorial field, then run the check command")
            return 0

        record = load_json(args.record.resolve())
        if args.command == "check":
            _, proposed_candidates = preflight_promotion(root, record)
            print(
                f"ready to promote {record['source_id']}; "
                f"{len(proposed_candidates['candidates'])} candidates would remain"
            )
            return 0

        remaining, model_id = apply_promotion(root, record)
        print(f"promoted {record['source_id']} as {model_id}; {remaining} candidates remain")
        print("next: synchronize web data, regenerate share pages, and run full verification")
        return 0
    except (OSError, PromotionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
