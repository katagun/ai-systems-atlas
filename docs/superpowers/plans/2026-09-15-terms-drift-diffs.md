# Terms Drift Diffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every terms-drift report shows what changed, anchored evidence URLs hash only their section, and existing baselines migrate without silent acceptance.

**Architecture:** `scripts/check_evidence_links.py` gains a stdlib section extractor, a `terms_content` function that returns the hashed text, hash, and scope together, and a bounded sentence-segment `drift_diff`. The terms branch of `check_targets` stores `terms_text` / `observed_terms_text` and `terms_hash_scope`, migrates legacy entries, and attaches diffs to `CheckSummary.drift_details`. The CLI prints those diffs and adds `--show-drift`.

**Tech Stack:** Python 3.11+ standard library (`html.parser`, `difflib`, `hashlib`), `unittest`, `ruff`, `uv`.

**Spec:** `docs/superpowers/specs/2026-09-15-terms-drift-diffs-design.md`

## Global Constraints

- Non-anchored page hashes do not change: the stored text is exactly the normalized content that `content_sha256` hashes.
- Drift acceptance is unchanged: only a newer human review accepts a changed hash.
- Anchored migration is silent only when the current whole-page hash equals the stored legacy baseline and no drift is open.
- Diff: segments split after `.`, `!`, `?`, `;`, `:` plus whitespace; at most 12 changed segments, each clipped to 240 characters; lines prefixed `  - ` / `  + `.
- Warning text begins `terms anchor not found:`; `--show-drift` lines begin `terms drift since <date>: <url>`.
- `TERMS_SECTION_IDS` starts empty.
- Commit messages end with a separate line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Tests first

- [ ] Append `TermsTextTests` to `tests/test_evidence_links.py`: `test_section_of_a_heading_runs_to_the_next_same_or_higher_heading`, `test_section_of_a_container_is_its_subtree_without_scripts`, `test_missing_section_id_is_none`, `test_anchored_url_hashes_its_section_and_stores_the_text`, `test_missing_anchor_warns_and_hashes_the_whole_page`, `test_drift_stores_both_texts_shows_a_diff_and_acceptance_moves_the_text`, `test_legacy_entry_gains_text_when_its_hash_is_unchanged`, `test_legacy_drift_says_no_baseline_text_was_stored`, `test_anchored_legacy_baseline_moves_to_the_section_when_the_page_is_unchanged`, `test_anchored_legacy_baseline_stays_drift_when_the_page_changed`, `test_drift_diff_is_bounded_and_clipped`, `test_show_drift_prints_stored_diffs_without_fetching`; add `import hashlib`.
- [ ] Run `uv run python -m unittest tests.test_evidence_links.TermsTextTests`; expect missing `section_text`, `drift_diff`, `drift_details`, `terms_text`, and `--show-drift`.

### Task 2: Implementation

- [ ] Imports and constants: `difflib`; `TERMS_SECTION_IDS: dict[str, str] = {}`, `MAX_DIFF_SEGMENTS = 12`, `MAX_SEGMENT_CHARS = 240`.
- [ ] `CheckSummary.drift_details: dict[str, list[str]]`.
- [ ] `_is_html`, `_SectionText(HTMLParser)`, `section_text(html, element_id) -> str | None`, `TermsContent(text, sha256, scope, page_sha256, anchor_missing)`, `terms_content(body, content_type, url) -> TermsContent | None`, `drift_diff(before, after) -> list[str]`, `_entry_drift_diff(entry) -> list[str]`.
- [ ] `check_targets` terms branch: compute content (reusing stored hash, text, and scope on `304`); anchored migration; bootstrap and acceptance write text and scope; drift writes observed text and scope and a diff; unchanged pages backfill text and scope; fresh cached drift attaches its stored diff.
- [ ] CLI: print `summary.drift_details` after errors; `--show-drift` reads the cache without the lock and prints `_entry_drift_diff` for every open drift entry.
- [ ] Run the evidence-link tests and ruff; all pass.

### Task 3: Docs, backlog, verify, merge

- [ ] `docs/OPERATIONS.md` › Evidence links and terms drift: stored text and diffs, `--show-drift`, anchored sections and `TERMS_SECTION_IDS`, migration.
- [ ] `BACKLOG.md`: remove the part-2 item.
- [ ] Full `AGENTS.md` check list; merge `origin/main`; push; PR; `gh pr merge --squash --auto`.
- [ ] After merge: run the checker once against the shared cache and report what it backfilled, migrated, and flagged.
