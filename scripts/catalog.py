"""The catalog's published files and collections, defined once.

CR-16 in `docs/CODEBASE_REVIEW_2026-09-28.md`. `PUBLISHED_DATA` was defined twice,
in `sync_web_data.py` and in `validate_directory.py`, with no test keeping the two
equal — and the copy in `sync_web_data.py`, the one working rule 12 of `AGENTS.md`
names as the definition, had no test at all. The collection-to-file-to-key table was
then encoded four more times, in `build_web_payload.py`, `report_review_age.py`
(which listed the same eight rows in a different order), `build_share_pages.py`
(twice), and `run_directory_refresh.py`.

A file added to one copy and not the other either never reaches `web/` or is never
checked for freshness, and both failures are silent. This module is the one place,
and every consumer projects from it.

The collections are unscored-plus-scored peers: the eight scored families and the
four unscored artifact collections all appear, because a reader-facing feature like
a search index or a share page cannot treat any of them as a special case.
"""

from __future__ import annotations

__all__ = [
    "CATALOG_DOCUMENTS",
    "COLLECTIONS",
    "COLLECTION_TRIPLES",
    "MODELS_DEV_REPO",
    "OPENROUTER_DISPOSITIONS_NAME",
    "OPENROUTER_LEADS_NAME",
    "PUBLISHED_DATA",
    "REVIEW_AGE_ORDER",
    "SHARE_DIRECTORIES",
    "UNPUBLISHED_DATA",
]

# ADR 039's two cross-check files. They live here rather than in
# `import_openrouter.py` so that `UNPUBLISHED_DATA` and the importer cannot
# disagree about the filenames.
OPENROUTER_LEADS_NAME = "openrouter-model-leads.json"
OPENROUTER_DISPOSITIONS_NAME = "openrouter-model-dispositions.json"

# Kept in one place because two promote scripts cite models.dev evidence under this
# prefix, and a null-source record (ADR 038) may cite no evidence URL at all.
MODELS_DEV_REPO = "https://github.com/anomalyco/models.dev"

# Everything copied into web/. Working rule 12: publish only from this tuple.
PUBLISHED_DATA = (
    "projects.json",
    "taxonomy.json",
    "exclusions.json",
    "license-evidence.json",
    "specifications.json",
    "inference-services.json",
    "local-runtimes.json",
    "models.json",
    "models-dev.json",
    "packs.json",
    "labs.json",
    "robots.json",
)

# Everything read by the validator: the published set plus the unpublished queues
# and registries, which are validated but must never be copied to web/.
UNPUBLISHED_DATA = (
    "candidates.json",
    "model-candidates.json",
    "model-dispositions.json",
    OPENROUTER_LEADS_NAME,
    OPENROUTER_DISPOSITIONS_NAME,
    "license-review.json",
    "discovery-sources.json",
    "hn-signals.json",
)

CATALOG_DOCUMENTS = (*PUBLISHED_DATA, *UNPUBLISHED_DATA)

# (collection name, published file, record key, record-reference kind, share dir)
#
# The record-reference kind is the token in a record URL such as `record=system:aider`,
# and the share directory is the folder under web/records/. They differ from the file
# stem for three collections, which is exactly why they were being restated by hand.
COLLECTIONS = (
    ("systems", "projects.json", "projects", "system", "systems"),
    (
        "inference",
        "inference-services.json",
        "services",
        "inference",
        "inference-services",
    ),
    ("runtimes", "local-runtimes.json", "runtimes", "runtime", "local-runtimes"),
    (
        "specifications",
        "specifications.json",
        "specifications",
        "spec",
        "specifications",
    ),
    ("models", "models.json", "models", "model", "models"),
    ("packs", "packs.json", "packs", "pack", "packs"),
    ("labs", "labs.json", "labs", "lab", "labs"),
    ("robots", "robots.json", "robots", "robot", "robots"),
)

# The review-age report prints scored operational collections first, then the
# unscored ones, which is a reporting choice and not a second collection table.
REVIEW_AGE_ORDER = (
    "systems",
    "inference",
    "runtimes",
    "models",
    "specifications",
    "packs",
    "labs",
    "robots",
)

# kind (as in a record URL, `record=system:aider`) -> (share dir, record key)
SHARE_DIRECTORIES = {kind: (share, key) for _, _, key, kind, share in COLLECTIONS}


COLLECTION_TRIPLES = tuple((name, file, key) for name, file, key, _, _ in COLLECTIONS)
