#!/usr/bin/env python3
"""Guarded human-review workflow for promoting one system candidate.

The command scaffolds review work but never invents editorial conclusions. Its
apply path writes only after the complete proposed `projects.json`,
`license-evidence.json`, and remaining `candidates.json` queue pass validation
together. It mirrors `scripts/promote_model_candidate.py`; see that module and
`docs/OPERATIONS.md` ("Review a candidate") for the workflow this automates.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any

try:
    from .validate_directory import (
        validate_candidates,
        validate_exclusions,
        validate_license_evidence,
        validate_projects,
        validate_taxonomy,
        validate_unique_record_ids,
    )
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from validate_directory import (
        validate_candidates,
        validate_exclusions,
        validate_license_evidence,
        validate_projects,
        validate_taxonomy,
        validate_unique_record_ids,
    )

ROOT = Path(__file__).resolve().parents[1]


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


def _candidate_key(item: dict[str, Any]) -> str | None:
    """A candidate's identity key: its lowercased repo, or else its URL."""
    repo = item.get("repo")
    if isinstance(repo, str) and repo:
        return repo.lower()
    url = item.get("url")
    return url.rstrip("/") if isinstance(url, str) and url else None


def candidate_for(candidates_data: dict[str, Any], identifier: str) -> dict[str, Any]:
    candidates = candidates_data.get("candidates")
    if not isinstance(candidates, list):
        raise PromotionError("candidates.json does not contain a candidate list")
    identifier = identifier.strip()
    repo_key = identifier.lower().rstrip("/")
    url_key = identifier.rstrip("/")
    matches = [
        item
        for item in candidates
        if isinstance(item, dict) and _candidate_key(item) in {repo_key, url_key}
    ]
    if not matches:
        raise PromotionError(f"system candidate not found: {identifier}")
    if len(matches) != 1:
        raise PromotionError(f"system candidate identifier is ambiguous: {identifier}")
    return matches[0]


def _pinned_license_blob(candidate: dict[str, Any]) -> dict[str, Any]:
    triage = candidate.get("triage")
    if not isinstance(triage, dict):
        raise PromotionError(
            "candidate has no triage evidence to prefill license evidence"
        )
    evidence = triage.get("evidence")
    if not isinstance(evidence, list):
        raise PromotionError("candidate triage evidence is missing")
    license_blobs = [
        item
        for item in evidence
        if isinstance(item, dict)
        and item.get("kind") == "git_blob"
        and item.get("label") == "LICENSE"
    ]
    if len(license_blobs) != 1:
        raise PromotionError("candidate triage must pin exactly one LICENSE git blob")
    return license_blobs[0]


def _blob_path(repo: str, url: object) -> str:
    prefix = f"https://github.com/{repo}/blob/"
    if not isinstance(url, str) or not url.startswith(prefix):
        raise PromotionError(
            "pinned LICENSE blob URL is not a GitHub blob URL for this repository"
        )
    _, _, path = url[len(prefix) :].partition("/")
    if not path:
        raise PromotionError("pinned LICENSE blob URL has no path component")
    return path


def build_draft(candidate: dict[str, Any]) -> dict[str, Any]:
    """Create an intentionally incomplete full-schema review draft.

    Only identity and automation-owned GitHub facts are prefilled. The
    proposed classification a keyword classifier attached to the candidate is
    never copied in: `docs/OPERATIONS.md` requires a human to choose
    `system_family` and `primary_role` from scratch.
    """
    repo = candidate.get("repo")
    if not isinstance(repo, str) or not repo:
        raise PromotionError("system candidate requires a GitHub repository")
    license_blob = _pinned_license_blob(candidate)
    path = _blob_path(repo, license_blob.get("url"))
    return {
        "id": "",
        "system_family": "",
        "score_profile": "",
        "name": candidate.get("name") if isinstance(candidate.get("name"), str) else "",
        "repo": repo,
        "url": candidate.get("url") if isinstance(candidate.get("url"), str) else "",
        "description": "",
        "primary_role": "",
        "secondary_roles": [],
        "agent_relation": "",
        "architectures": [],
        "retrieval_modes": [],
        "capture_modes": [],
        "memory_lifecycle": [],
        "canonical_data": "",
        "deployment": [],
        "local_first": None,
        "human_editable": None,
        "provenance": "",
        "licenses": [],
        "source_model": "",
        "license_review_status": "",
        "status": "",
        "stars": candidate.get("stars"),
        "stars_verified_at": "",
        "historical_stars": None,
        "current_repo_note": None,
        "score": None,
        "strengths": [],
        "weaknesses": [],
        "why_it_matters": "",
        "research_confidence": "",
        "verified_at": "",
        "github_detected_license": candidate.get("github_detected_license"),
        "license_evidence_items": [
            {
                "license_id": None,
                "scope": None,
                "kind": license_blob.get("kind"),
                "path": path,
                "url": license_blob.get("url"),
                "blob_sha": license_blob.get("blob_sha"),
                "immutable_url": license_blob.get("immutable_url"),
            }
        ],
    }


def _valid_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def _matches_candidate(item: dict[str, Any], candidate_key: str | None) -> bool:
    return isinstance(item, dict) and _candidate_key(item) == candidate_key


def preflight_promotion(
    root: Path,
    draft: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Return complete proposed documents or raise without writing anything."""
    directory = root / "directory"
    taxonomy_data = load_json(directory / "taxonomy.json")
    projects_data = load_json(directory / "projects.json")
    license_evidence_data = load_json(directory / "license-evidence.json")
    candidates_data = load_json(directory / "candidates.json")
    exclusions_data = load_json(directory / "exclusions.json")
    specifications_data = load_json(directory / "specifications.json")
    inference_services_data = load_json(directory / "inference-services.json")
    local_runtimes_data = load_json(directory / "local-runtimes.json")
    models_data = load_json(directory / "models.json")
    packs_data = load_json(directory / "packs.json")
    labs_data = load_json(directory / "labs.json")

    repo = draft.get("repo")
    if not isinstance(repo, str) or not repo:
        raise PromotionError("review record requires a repo")
    candidate = candidate_for(candidates_data, repo)

    triage = candidate.get("triage")
    if isinstance(triage, dict):
        verdict = triage.get("verdict")
        if verdict == "held":
            raise PromotionError(
                f"system candidate triage verdict is held ({triage.get('held_by', 'unnamed decision')}); "
                "resolve the hold before promoting"
            )
        if verdict == "out_of_scope":
            raise PromotionError(
                "system candidate triage verdict is out_of_scope; "
                "write the exclusion instead of promoting"
            )

    errors: list[str] = []
    record = deepcopy(draft)
    license_items = record.pop("license_evidence_items", None)
    if not isinstance(license_items, list) or not license_items:
        errors.append("review record requires a non-empty license_evidence_items list")
        license_items = []
    license_entry = {
        "project_id": record.get("id"),
        "repo": record.get("repo"),
        "items": deepcopy(license_items),
    }

    proposed_projects = deepcopy(projects_data)
    proposed_license_evidence = deepcopy(license_evidence_data)
    proposed_candidates = deepcopy(candidates_data)

    if isinstance(proposed_projects.get("projects"), list):
        proposed_projects["projects"].append(deepcopy(record))
    else:
        errors.append("projects.json does not contain a project list")

    if isinstance(proposed_license_evidence.get("entries"), list):
        proposed_license_evidence["entries"].append(license_entry)
    else:
        errors.append("license-evidence.json does not contain an entries list")

    candidate_key = _candidate_key(candidate)
    remaining = proposed_candidates.get("candidates")
    if isinstance(remaining, list):
        proposed_candidates["candidates"] = [
            item for item in remaining if not _matches_candidate(item, candidate_key)
        ]
    else:
        errors.append("candidates.json does not contain a candidate list")

    # Bump collection-level review dates when the new record's own review date
    # is newer, mirroring promote_model_candidate.py. Purely bookkeeping: the
    # validator only checks these fields are well-formed ISO dates.
    record_date = _valid_date(record.get("verified_at"))
    projects_date = _valid_date(proposed_projects.get("generated_at"))
    if record_date and (projects_date is None or record_date > projects_date):
        proposed_projects["generated_at"] = record_date.isoformat()
    evidence_date = _valid_date(proposed_license_evidence.get("verified_at"))
    if record_date and (evidence_date is None or record_date > evidence_date):
        proposed_license_evidence["verified_at"] = record_date.isoformat()
        proposed_license_evidence["generated_at"] = record_date.isoformat()

    taxonomy_errors: list[str] = []
    tax = validate_taxonomy(taxonomy_data, taxonomy_errors)
    errors.extend(taxonomy_errors)

    index = validate_projects(proposed_projects, tax, errors)
    if index is None:
        errors.append("projects.json: projects must be a list")
        raise PromotionError(
            "system candidate is not ready for promotion:\n"
            + "\n".join(f"- {error}" for error in errors)
        )

    validate_license_evidence(proposed_license_evidence, index.projects, errors)

    specifications_value = specifications_data.get("specifications")
    inference_services_value = inference_services_data.get("services")
    local_runtimes_value = local_runtimes_data.get("runtimes")
    models_value = models_data.get("models")
    validate_unique_record_ids(
        index.projects,
        specifications_value if isinstance(specifications_value, list) else [],
        inference_services_value if isinstance(inference_services_value, list) else [],
        local_runtimes_value if isinstance(local_runtimes_value, list) else [],
        models_value if isinstance(models_value, list) else [],
        errors,
        packs_value=packs_data.get("packs")
        if isinstance(packs_data.get("packs"), list)
        else [],
        labs_value=labs_data.get("labs")
        if isinstance(labs_data.get("labs"), list)
        else [],
    )

    candidate_repos = validate_candidates(proposed_candidates, tax, index, errors)
    validate_exclusions(exclusions_data, index.repos, candidate_repos, errors)

    if errors:
        formatted = "\n".join(f"- {error}" for error in errors)
        raise PromotionError(
            f"system candidate is not ready for promotion:\n{formatted}"
        )
    return proposed_projects, proposed_license_evidence, proposed_candidates


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


def apply_promotion(root: Path, draft: dict[str, Any]) -> tuple[int, str]:
    """Apply a preflighted promotion and return remaining count plus project id."""
    proposed_projects, proposed_license_evidence, proposed_candidates = (
        preflight_promotion(
            root,
            draft,
        )
    )
    projects_path = root / "directory" / "projects.json"
    license_evidence_path = root / "directory" / "license-evidence.json"
    candidates_path = root / "directory" / "candidates.json"
    original_projects = projects_path.read_bytes()
    original_license_evidence = license_evidence_path.read_bytes()
    original_candidates = candidates_path.read_bytes()
    try:
        _write_json_atomic(projects_path, proposed_projects)
        _write_json_atomic(license_evidence_path, proposed_license_evidence)
        _write_json_atomic(candidates_path, proposed_candidates)
    except Exception:
        projects_path.write_bytes(original_projects)
        license_evidence_path.write_bytes(original_license_evidence)
        candidates_path.write_bytes(original_candidates)
        raise
    candidates = proposed_candidates.get("candidates")
    remaining = len(candidates) if isinstance(candidates, list) else 0
    return remaining, str(draft.get("id"))


def write_draft(path: Path, draft: dict[str, Any]) -> None:
    if path.exists():
        raise PromotionError(f"refusing to overwrite existing review draft: {path}")
    _write_json_atomic(path, draft)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scaffold, check, or apply one reviewed system candidate.",
    )
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="write an incomplete human-review draft")
    init.add_argument("candidate", help="GitHub 'owner/repo' or the candidate's URL")
    init.add_argument(
        "--output", type=Path, required=True, help="new JSON review-draft path"
    )

    for name, help_text in (
        ("check", "validate a completed review draft without writing"),
        ("apply", "promote a completed review draft into the canonical catalog"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument(
            "record", type=Path, help="completed JSON review-draft path"
        )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == "init":
            candidates_data = load_json(root / "directory" / "candidates.json")
            candidate = candidate_for(candidates_data, args.candidate)
            output = args.output.resolve()
            write_draft(output, build_draft(candidate))
            print(f"wrote incomplete review draft for {candidate['repo']} to {output}")
            print("complete every editorial field, then run the check command")
            return 0

        record = load_json(args.record.resolve())
        if args.command == "check":
            _, _, proposed_candidates = preflight_promotion(root, record)
            print(
                f"ready to promote {record.get('repo')} as {record.get('id')}; "
                f"{len(proposed_candidates['candidates'])} candidates would remain"
            )
            return 0

        remaining, project_id = apply_promotion(root, record)
        print(
            f"promoted {record.get('repo')} as {project_id}; {remaining} candidates remain"
        )
        print(
            "next: synchronize web data, regenerate share pages, and run full verification"
        )
        return 0
    except (OSError, PromotionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
