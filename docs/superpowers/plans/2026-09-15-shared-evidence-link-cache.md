# Shared Evidence-Link Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make terms-drift detection independent of the checkout that ran it: one lock-protected cache in the shared git directory, runs that keep entries they did not check, missing baselines reported instead of silently created, and a fail-closed one-time import of per-checkout caches.

**Architecture:** All changes live in `scripts/check_evidence_links.py`: a `default_cache_path` resolver, a `cache_lock` context manager with atomic `write_cache`, `merge_caches` for import, and a `check_targets(..., establish_baselines=False)` whose bootstrap branch consults the cache's previous `updated_at`. The CLI resolves the default path at run time and adds `--import-cache` and `--establish-baselines`.

**Tech Stack:** Python 3.11+ standard library (`fcntl`, `subprocess`, `contextlib`, `os`), `unittest`, `ruff`, `uv`.

**Spec:** `docs/superpowers/specs/2026-09-15-shared-evidence-link-cache-design.md`

## Global Constraints

- The checker never edits catalog records, evidence, or human-owned dates (`docs/CURATION.md`).
- A newer human review still accepts a changed hash; drift acceptance is unchanged.
- Shared cache path: `<git common dir>/atlas/evidence-link-cache.json`; fallback `ROOT / ".evidence-link-cache.json"`.
- Missing-baseline error text begins `terms baseline missing:`; the entry marker key is `terms_baseline_missing`; the escape-hatch warning begins `terms baseline established by request:`.
- Import never fetches, never modifies sources, and opens drift on any baseline disagreement without a strictly newer review.
- Commit messages end with a separate line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Tests first

**Files:** Modify `tests/test_evidence_links.py` (imports `os`, `subprocess`, `unittest.mock.mock`; append `SharedCacheTests`).

- [ ] **Step 1: Append the tests** (full code as committed in `tests/test_evidence_links.py`, class `SharedCacheTests`): `test_default_cache_lives_in_the_shared_git_directory`, `test_default_cache_falls_back_outside_git`, `test_a_held_lock_refuses_a_second_run`, `test_cache_writes_replace_the_file_without_leftovers`, `test_a_run_keeps_entries_it_did_not_target`, `test_new_baseline_is_recorded_for_terms_reviewed_since_the_last_run`, `test_missing_baseline_for_terms_reviewed_before_the_last_run_fails`, `test_a_cache_without_a_previous_run_reports_every_missing_baseline`, `test_missing_baseline_stays_reported_while_the_entry_is_fresh`, `test_establish_baselines_records_them_with_a_warning`, `test_import_keeps_urls_found_in_only_one_cache`, `test_import_of_agreeing_baselines_keeps_the_latest_check_and_open_drift`, `test_import_prefers_the_entry_accepted_after_a_strictly_newer_review`, `test_import_opens_drift_when_baselines_disagree_without_a_newer_review`, `test_import_cli_merges_into_the_cache_and_leaves_sources_unchanged`, `test_import_cli_rejects_a_missing_source`.
- [ ] **Step 2: Run and confirm failure** — `uv run python -m unittest tests.test_evidence_links -v`; expected `AttributeError` for `default_cache_path`, `cache_lock`, `merge_caches`, and an unexpected keyword `establish_baselines`.

### Task 2: Implementation

**Files:** Modify `scripts/check_evidence_links.py`.

- [ ] **Step 1: Shared path, lock, atomic write.** Replace `DEFAULT_CACHE_PATH` with `SHARED_CACHE_PATH = Path("atlas") / "evidence-link-cache.json"` and `LEGACY_CACHE_NAME = ".evidence-link-cache.json"`; add `default_cache_path(root=ROOT, *, runner=subprocess.run)` calling `git rev-parse --path-format=absolute --git-common-dir` with `cwd=root, capture_output=True, text=True, check=True`, falling back on `OSError`/`CalledProcessError` or empty output; add `class CacheLocked(RuntimeError)` and `@contextlib.contextmanager cache_lock(path)` taking `fcntl.flock(fd, LOCK_EX | LOCK_NB)` on `<name>.lock`, raising `CacheLocked` on `BlockingIOError`; make `write_cache` write `.<name>.<pid>.tmp` then `os.replace`.
- [ ] **Step 2: Missing-baseline rule and retention in `check_targets`.** Add keyword `establish_baselines: bool = False`; capture `last_run = _parse_timestamp(cache.get("updated_at"))` before the loop; in the fresh-cache branch report `_missing_baseline_error(target)` when the entry carries `terms_baseline_missing` and no drift; in the bootstrap branch bootstrap when `_reviewed_since_last_run(review_dates, last_run)` or `establish_baselines` (warning when only the flag allowed it, marker popped), otherwise append the error and set `entry["terms_baseline_missing"] = now.date().isoformat()`; end with `cache["entries"] = {**previous_entries, **next_entries}`.
- [ ] **Step 3: Import.** Add `@dataclass ImportReport(sources, added, agreed, newer_review, conflicts, conflict_urls)`, `_reviewed_strictly_later(candidate, other)`, `_newest_checked(a, b)`, `_merge_entry(current, incoming, *, today, report)`, `merge_caches(shared, sources, *, today)`, and `import_caches(cache_path, sources, *, today)` requiring each source to be a file.
- [ ] **Step 4: CLI.** `--cache` default `None` resolved to `default_cache_path()`; `--import-cache PATH` (append) runs `import_caches` under the lock, prints the report, exits 0; `--establish-baselines` passes through; `CacheLocked` exits 2.
- [ ] **Step 5: Existing fixtures.** Tests that expect a first baseline get `"updated_at"` older than their target's review date (`"2026-08-31T00:00:00Z"` for the default `2026-09-01`). Confirm each failure is the new rule, not a regression.
- [ ] **Step 6: Run** `uv run python -m unittest tests.test_evidence_links -v` and `uv run ruff check scripts tests` — all pass.
- [ ] **Step 7: Commit.**

### Task 3: Docs, backlog, verify, merge

- [ ] **Step 1:** `docs/OPERATIONS.md` — shared cache, lock, retention, missing-baseline rule and `--establish-baselines`, one-time `--import-cache`; drop the refresh-worktree cache copy.
- [ ] **Step 2:** `BACKLOG.md` — narrow the item to hashing only terms content with a safe baseline migration.
- [ ] **Step 3:** Full `AGENTS.md` check list; merge `origin/main`; push; open the PR; `gh pr merge --squash --auto`.
- [ ] **Step 4 (after merge):** `uv run python scripts/check_evidence_links.py --import-cache <main checkout>/.evidence-link-cache.json --import-cache ../atlas-directory-refresh/.evidence-link-cache.json` once; report the counts.
