#!/usr/bin/env python3
"""Join a lab record to the catalog records that name it (ADR 041).

A lab stores the strings the other collections use for it (`catalog_names`) and the
ids of the systems it builds, never copies of other collections. This module is the
one Python statement of the join rules; `labRelations` in web/app-core.js states the
same rules for the page, and each side is tested against fixtures:

- a reviewed model joins when its `developer` is one of the lab's names;
- the lab's models.dev namespaces are the namespaces of those models' `source_id`s,
  and an imported source row in one of them joins until a review overlays it;
- a service joins by `operator`, a runtime by `maintainer`, a specification by any of
  its `stewards`, and a pack by `steward`;
- a system joins when its id is listed in `systems`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

# The collections a lab joins across, keyed as `catalog_lists` expects them.
CATALOG_KEYS = (
    "projects",
    "models",
    "source_models",
    "services",
    "runtimes",
    "specifications",
    "packs",
)


def source_namespace(source_id: object) -> str | None:
    """The models.dev provider directory a source id sits under, if it has one."""
    if not isinstance(source_id, str) or "/" not in source_id:
        return None
    return source_id.split("/", 1)[0]


def _records(values: Iterable[Any]) -> list[dict[str, Any]]:
    return [value for value in values if isinstance(value, dict)]


def catalog_lists(documents: Mapping[str, Mapping[str, Any]]) -> dict[str, list[Any]]:
    """Pull the record lists a lab joins across out of the published documents."""
    return {
        "projects": documents["projects.json"].get("projects", []),
        "models": documents["models.json"].get("models", []),
        "source_models": documents["models-dev.json"].get("models", []),
        "services": documents["inference-services.json"].get("services", []),
        "runtimes": documents["local-runtimes.json"].get("runtimes", []),
        "specifications": documents["specifications.json"].get("specifications", []),
        "packs": documents["packs.json"].get("packs", []),
    }


def overlaid_source_ids(models: Iterable[Any]) -> tuple[set[str], set[str]]:
    """Source ids a reviewed model overlays, and ids a null-source review stands in for.

    The same overlay the app payload applies (ADR 027, ADR 038): a linked review
    replaces its row by `source_id`; a review with no `source_id` yet replaces a row
    whose `id` matches its own.
    """
    linked: set[str] = set()
    unlisted: set[str] = set()
    for model in _records(models):
        if isinstance(model.get("source_id"), str):
            linked.add(model["source_id"])
        elif isinstance(model.get("id"), str):
            unlisted.add(model["id"])
    return linked, unlisted


def lab_relations(
    lab: Mapping[str, Any], catalog: Mapping[str, Iterable[Any]]
) -> dict[str, Any]:
    """Every catalog record the lab's names and system ids reach, by collection."""
    names = {name for name in lab.get("catalog_names") or [] if isinstance(name, str)}
    system_ids = {item for item in lab.get("systems") or [] if isinstance(item, str)}
    all_models = _records(catalog.get("models", []))
    models = [model for model in all_models if model.get("developer") in names]
    namespaces = sorted(
        {
            namespace
            for model in models
            if (namespace := source_namespace(model.get("source_id"))) is not None
        }
    )
    linked, unlisted = overlaid_source_ids(all_models)
    source_rows = [
        row
        for row in _records(catalog.get("source_models", []))
        if source_namespace(row.get("source_id")) in namespaces
        and row.get("source_id") not in linked
        and row.get("id") not in unlisted
    ]
    return {
        "models": models,
        "namespaces": namespaces,
        "source_rows": source_rows,
        "services": [
            item
            for item in _records(catalog.get("services", []))
            if item.get("operator") in names
        ],
        "runtimes": [
            item
            for item in _records(catalog.get("runtimes", []))
            if item.get("maintainer") in names
        ],
        "specifications": [
            item
            for item in _records(catalog.get("specifications", []))
            if names.intersection(
                steward
                for steward in item.get("stewards") or []
                if isinstance(steward, str)
            )
        ],
        "packs": [
            item
            for item in _records(catalog.get("packs", []))
            if item.get("steward") in names
        ],
        "systems": [
            item
            for item in _records(catalog.get("projects", []))
            if item.get("id") in system_ids
        ],
    }


def organization_names(catalog: Mapping[str, Iterable[Any]]) -> dict[str, set[str]]:
    """Every organization string each collection uses, keyed by the field that holds it."""

    def strings(records: Iterable[Any], field: str) -> set[str]:
        return {
            record[field]
            for record in _records(records)
            if isinstance(record.get(field), str)
        }

    stewards = {
        steward
        for specification in _records(catalog.get("specifications", []))
        for steward in specification.get("stewards") or []
        if isinstance(steward, str)
    }
    return {
        "developer": strings(catalog.get("models", []), "developer"),
        "operator": strings(catalog.get("services", []), "operator"),
        "maintainer": strings(catalog.get("runtimes", []), "maintainer"),
        "stewards": stewards,
        "steward": strings(catalog.get("packs", []), "steward"),
    }
