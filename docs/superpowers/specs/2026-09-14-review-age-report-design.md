# Design: review-age report

**Date:** 2026-09-14
**Status:** Approved in brainstorming; spec review waived by the maintainer

## Problem

`ROADMAP.md` asks the Atlas to "keep editorial age distinguishable from live-metadata age, so a stale review is a visible fact about the record rather than a gap in someone's recollection." Nothing computes review age today. A maintainer who wants to know which records have gone longest without human review has to read dates record by record, and the dates that matter are split between human-owned review dates and automation-owned refresh timestamps (`docs/DATA_MODEL.md`, timestamps table).

## Non-goals

The report changes no data: it never edits `verified_at`, evidence dates, or any other field, and it never proposes new dates. It is not a gate: it is not wired into `verify`, validation, or the weekly refresh, and it always exits 0. It does not fetch anything from the network. It shows nothing on the site. It does not treat upstream activity (`pushed_at`) as review age.

## Measured facts

- Every reviewed record carries a human `verified_at`: 199 systems, 59 inference services, 16 local runtimes, 53 models, 22 specifications.
- Nested human review dates are all keyed exactly `verified_at`: `evidence[]`, `license_evidence[]`, inference-service `terms`, and the inference-service `trust` block (its own date, every property, and finding `resolved`/`operator_response` checks).
- System license evidence lives in `directory/license-evidence.json` under `entries[]`, joined by `project_id`; only its 86 `web_terms` items carry `verified_at`. Pinned blob evidence carries no review date and is not an age signal.
- Automation-owned timestamps use different keys: `metadata_verified_at` (158 of 199 systems, 53 of 53 models) and `stars_verified_at` (159 systems, 15 of 16 runtimes). Inference services and specifications carry neither.
- Other date-shaped fields are not review dates: `pushed_at` (upstream push), trust finding `published_at` and `source.fetched_at`, model `source_metadata` release and update dates, and specification `current_version`.

## Decisions

### 1. A standalone, offline report script

`scripts/report_review_age.py` reads the canonical `directory/` files and prints a report. It is a separate script rather than a mode of `check_evidence_links.py` (a network checker with a cache) or output of `validate_directory.py` (a gate).

### 2. Three ages per record, never mixed

Each reviewed record yields one row:

- **reviewed** — the record's own `verified_at` and its age in days.
- **oldest evidence** — the oldest human review date attached to the record, its age, and a label naming its location (for example `license_evidence[1]`, `terms`, `trust.properties.cache_isolation`). It is the minimum over every nested key named exactly `verified_at` below the record, plus, for systems, the dated items of the record's `license-evidence.json` entry. A record with none shows `none`.
- **metadata** — the newest of `metadata_verified_at` and `stars_verified_at`, with its age, or `none`.

Editorial and automated ages stay in separate columns. Because the nested walk matches the key `verified_at` exactly, automation timestamps can never enter the editorial columns.

### 3. Report only

Rows sort by editorial staleness: the older of *reviewed* and *oldest evidence* first, then collection and id. Output is a plain-text table with a summary line, or JSON with `--json`. Options: `--as-of YYYY-MM-DD` (default: today) for reproducible runs; `--older-than DAYS` to keep rows whose reviewed or oldest-evidence age is strictly greater than `DAYS`; `--collection NAME`, repeatable, over `systems`, `inference`, `runtimes`, `models`, `specifications`. The script exits 0 on success; a malformed date raises rather than being skipped.

## Implementation

- **`scripts/report_review_age.py`.** Pure functions: `review_rows(directory: Path, as_of: date) -> list[ReviewRow]`, `filter_rows(rows, older_than, collections)`, `render_table(rows, as_of)`, `render_json(rows, as_of)`; `main(argv) -> int` with `argparse`, matching the other scripts.
- **`tests/test_review_age.py`.** `unittest`, with synthetic catalogs written to a temporary directory, plus one smoke test over the real `directory/`.
- **`docs/OPERATIONS.md`.** A "Review age" section after "Routine verification": the command, what each column means, that the report changes no dates, and why `pushed_at` is excluded.
- **`BACKLOG.md`.** Remove the `Now` item.

## Testing

- Ages computed against a fixed `--as-of`.
- Oldest evidence is the minimum nested `verified_at` and names its location, including system license evidence joined from `license-evidence.json`.
- `metadata_verified_at`, `stars_verified_at`, `pushed_at`, `fetched_at`, and `published_at` never appear as editorial dates.
- Metadata age is the newest automated timestamp, or `none`.
- `--older-than` is strict, and `--collection` narrows rows.
- Sort order is oldest editorial date first.
- JSON output has a stable shape.
- A smoke run over the real catalog yields exactly one row per reviewed record across all five collections and leaves every `directory/` file byte-identical.
