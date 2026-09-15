# Design: one evidence-link cache, and no silent terms baselines

**Date:** 2026-09-15
**Status:** Approved in brainstorming (part 1 of 2); spec review waived by the maintainer

## Problem

Terms-drift detection depends on which checkout ran it. `scripts/check_evidence_links.py` keeps its cache — HTTP validators plus a normalized content hash per monitored terms page — in a repository-local ignored `.evidence-link-cache.json`, so every checkout has its own. A baseline is whatever page version that cache first saw, and the first sight is silently accepted. On 2026-09-15 the main checkout's cache and the weekly-refresh worktree's cache agreed on 163 of 168 shared baselines, disagreed on 5, and held different open drift sets (Azure, DeepInfra, Volcengine, and the Microsoft Services Agreement in one; the Claude Agent SDK overview and three Cohere pages in the other). A lost or new cache silently accepts every terms change made since the last check.

This is part 1 of the backlog item. Part 2 — hashing only terms content instead of a whole page, with a baseline migration — is a separate change.

## Non-goals

No change to what is hashed or how pages are normalized. No change to drift acceptance: a newer human review date still accepts a changed hash. No catalog record, evidence, or human-owned date changes. No network access during import.

## Measured facts

- Every worktree of the clone shares one git directory: the main checkout, the `atlas-directory-refresh` worktree, and the session worktrees all report `/…/agent-systems-atlas/.git` from `git rev-parse --git-common-dir`.
- `scripts/run_directory_refresh.py` runs the checker with no `--cache`, and nothing else in `scripts/`, `tests/`, or `.github/` names the cache path.
- `check_targets` ends with `cache["entries"] = next_entries`, dropping every URL the run did not target, and sets `cache["updated_at"]` to the run time.
- The bootstrap branch records a baseline for any monitored page without one; nothing reports it.
- A fresh cached entry (checked within `--max-age-hours`) is not refetched and reports only open drift.
- `write_cache` rewrites the file in place with no lock.
- Existing caches on 2026-09-15: main checkout 168 baselines, 4 open drift; refresh worktree 172 baselines, 4 open drift. Of the 5 disagreements, DeepInfra, `pypi.org/project/langgraph-api`, and `x.ai/legal/terms-of-service` were accepted in the refresh cache after strictly newer reviews; the Azure preview terms and the Microsoft Services Agreement disagree with identical review dates.

## Decisions

### 1. One cache for every worktree

The default cache is `<git common dir>/atlas/evidence-link-cache.json`, resolved with `git rev-parse --path-format=absolute --git-common-dir` from the repository root. Outside a git checkout it falls back to the repository-local `.evidence-link-cache.json`. `--cache PATH` still overrides.

### 2. A run owns the cache while it runs

A run holds an exclusive, non-blocking `flock` on `<cache>.lock` from load to save; a second run exits 2 with a clear message instead of overwriting the first. Saves write a temporary sibling file and `os.replace` it into place.

### 3. A run keeps entries it did not check

`check_targets` keeps previous entries for URLs outside the current target set. With a shared cache, a run on a branch that lacks some records must not erase their baselines. Entries for URLs no branch monitors any more are harmless and stay.

### 4. A missing baseline is reported, not silently created

A monitored page with no baseline gets one only when every reference's review date is on or after the date of the cache's previous run (`updated_at`): the evidence was added or re-reviewed since the checker last ran, so first sight follows a human review. Otherwise the run fails with `terms baseline missing: <url> (<references>)` and marks the entry `terms_baseline_missing`, which a later run reports again even when it serves the entry from cache. A cache with no `updated_at` (new or lost) therefore reports every baseline as missing.

`--establish-baselines` records missing baselines anyway, clears the marker, and lists each one as a warning; a person uses it only after reviewing those pages, with `--max-age-hours 0` so the pages are actually fetched.

Accepted cost: evidence reviewed on a branch that stays unmerged past the next checker run fails once and needs `--establish-baselines`.

### 5. One-time, fail-closed import of per-checkout caches

`--import-cache PATH` (repeatable) merges existing cache files into the cache, prints what it did, and exits without fetching. Sources must exist and are never modified. Per URL:

- present in one cache only → taken as is;
- one entry was accepted after a strictly newer human review of every reference → that entry wins, with its drift state;
- same baseline, no newer review → the most recently checked entry, keeping the earliest open drift signal from either side;
- different baselines, no newer review → the most recently checked entry, with the other baseline recorded as `observed_terms_sha256` and `terms_drift_detected_at` opened (import date) unless already open, so a person must review.

The merged `updated_at` is the latest of the inputs, the conservative choice for decision 4.

## Implementation

- **`scripts/check_evidence_links.py`.** `default_cache_path(root, *, runner)`; `CacheLocked` and `cache_lock(path)`; atomic `write_cache`; `ImportReport` and `merge_caches(shared, sources, *, today)`; `check_targets(..., establish_baselines=False)` with the missing-baseline rule, marker, and entry retention; CLI `--cache` default resolved at run time, `--import-cache`, `--establish-baselines`.
- **`tests/test_evidence_links.py`.** New tests for each decision; existing fixtures that expect a first baseline gain an `updated_at` older than their review date.
- **`docs/OPERATIONS.md`.** "Evidence links and terms drift" describes the shared cache, lock, retention, missing-baseline rule, escape hatch, and one-time import; the refresh-worktree setup drops the cache copy.
- **`BACKLOG.md`.** The item is narrowed to part 2.

## Testing

- Default path resolves to the shared git directory and falls back when git fails or is absent.
- A held lock refuses a second lock on the same cache; the save leaves no temporary file.
- A run keeps untargeted entries.
- A missing baseline is recorded when reviewed since the last run, fails when reviewed earlier, fails on a cache with no `updated_at`, is reported again from a fresh cached entry, and is recorded with a warning under `--establish-baselines`.
- Import: one-sided, agreeing (latest check wins, open drift kept), newer review wins, disagreement opens drift, latest `updated_at`, sources unchanged, missing source rejected.
