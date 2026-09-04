# Design: split the app's data payload from the published endpoints

**Date:** 2026-09-04
**Status:** Proposed design, pending approval
**Ripple analysis pinned to:** `f9bacbe` (`origin/main`, merged 2026-09-04; re-verified after #94)
**Line references:** `web/app.js` line numbers assume steps 1 and 2 are applied (this branch); every other file is unmodified `5af4f67`

## Problem

Every visitor downloads the whole catalogue before seeing a card. Measured on `web/` at `5af4f67`, gzipped, which is what GitHub Pages serves:

| | gzipped |
|---|---|
| Boot payload before any of this work | 252.0 KB |
| Boot payload after steps 1 and 2 (lazy `license-evidence.json`, deferred `logos.json`) | 182.8 KB |

Most of what remains is never read before a click. Per-field marginal gzip cost of `projects.json` (102.5 KB total):

| field | gz | rendered |
|---|---|---|
| `weaknesses` | 20.5 KB | detail dialog only |
| `strengths` | 20.1 KB | detail dialog only |
| `current_repo_note` | 9.9 KB | nowhere yet — see decision 3 |
| `why_it_matters` | 8.9 KB | detail dialog only |
| `description` | 7.4 KB | card |
| `score` (full breakdown) | 6.3 KB | detail and comparison; the card reads `overall` only |
| `canonical_data` | 5.1 KB | detail dialog only |

Roughly 64% of `projects.json` is text behind a click. The other collections are worse: `inference-services.json` is 82% detail-only, `local-runtimes.json` 89%.

Minifying was considered first and rejected: across all of `web/*.json` it saves 9.0 KB gzipped (3.3%), because gzip already collapses indentation. It would also make `directory/*.json` undiffable, which is where curation review happens.

## Non-goals

- **The seven published endpoints do not change**, in shape, field set, or formatting. They are documented as a public API at `web/index.html:227` and `web/llms.txt`, licensed CC BY 4.0, and fetched by parties we cannot see.
- `directory/*.json` stays pretty-printed and diffable. Curation review depends on it.
- No new dependency, no bundler, no framework. The app stays dependency-free.
- No search-behaviour change. See decision 4.
- This design does not render `current_repo_note`; it only stops the split from foreclosing it (`BACKLOG.md` item 36 owns that decision).

## Decisions

### 1. App payloads are a separate, regenerable projection

`web/` gains a generated `app/` tree, committed like the 273 share pages already under `web/records/`, since `deploy-pages.yml` uploads `path: web` with no build step.

```
web/app/<collection>.json          4 files   boot payloads   43.6 KB gz total
web/app/search/<collection>.json   4 files   search index   100.3 KB gz total
web/app/detail/<kind>/<id>.json  271 files   record detail  0.5–4.2 KB each
```

`<collection>` is `systems`, `inference`, `runtimes`, `specifications`. `<kind>` is the record-reference kind already used in URLs by `AtlasCore.parseRecordReference`: `system`, `inference`, `runtime`, `spec`.

**Not** `web/app/records/`: `web/records/` already means share pages, and two directories called "records" holding different things is a trap.

These files are never added to `PUBLISHED_DATA` (`scripts/validate_directory.py:18`). That tuple drives three checks — the API-view test (`tests/test_web.js:578`), the `llms.txt` test (`:574`), and `validate_published_copies` (`scripts/validate_directory.py:1214`) — so the boundary enforces itself: a payload added there would immediately demand both an endpoint listing and a byte-identical twin in `directory/`, and fail.

### 2. Boot payloads carry exactly what renders before a click

Per record: the fields the card, the filters, the sort, and the finder read, plus `score.overall` alone.

- **systems**: `id`, `name`, `system_family`, `primary_role`, `secondary_roles`, `score_profile`, `score.overall`, `stars`, `status`, `source_model`, `licenses`, `license_review_status`, `description`, `agent_relation`, `architectures`, `repo`, `url`, `deployment`, `agent_interfaces`, `local_first`, `superseded_by`
- **inference**: `id`, `name`, `service_type`, `operator`, `url`, `api_styles`, `model_sources`, `delivery_modes`, `description`, `score_profile`, `score.overall`, `terms`
- **runtimes**: `id`, `name`, `runtime_type`, `maintainer`, `repo`, `url`, `api_styles`, `accelerators`, `model_formats`, `serving_modes`, `deployment_surfaces`, `licenses`, `source_model`, `stars`, `description`, `score_profile`, `score.overall`
- **specifications**: `id`, `name`, `short_name`, `specification_type`, `scope`, `status`, `current_version`, `repo`, `url`, `licenses`, `description`, `stewards`, `related_specifications`

`stars` is in the systems and runtimes boot payloads deliberately: the weekly refresh changes it (decision 7), and `BACKLOG.md` item 38 wants a runtime star badge on the card.

`superseded_by` is in boot because the successor lookup at `web/app.js:1035` resolves the target's name out of the in-memory collection, and because `BACKLOG.md` item 37 (related records, previous/next) wants role, family, and successor links available while a dialog is open.

The top-level `policy` string in `projects.json` is read by nothing in the app and is omitted.

### 3. The detail payload is the mechanical complement, not a curated list

**A detail file is the published record minus the boot fields.** Not a hand-picked set.

This is the most load-bearing decision in the design, and it exists because of a mistake caught during review. An earlier pass identified nine "never-rendered" fields in `projects.json` — `current_repo_note`, `forks`, `github_detected_license`, `historical_stars`, `metadata_verified_at`, `open_issues`, `pushed_at`, `secondary_roles`, `stars_verified_at` — worth 14.6 KB gzipped, and proposed dropping them. `BACKLOG.md` item 36, filed 2026-09-03 on `claude/ai-scientist-ingestion-planning-d14f93`, reaches the opposite conclusion about the largest of them: `current_repo_note` is "editorial prose written for readers that no reader can see," it is load-bearing for product-boundary distinctions `docs/CURATION.md` requires reviewers to write, and the open question is whether to **render** it — not whether to drop it.

A complement rule makes that whole class of error impossible. Nothing is ever dropped, the builder needs no field list to drift out of date, and any future feature finds its field already in detail. The cost is a few hundred bytes per record of fields nothing reads yet, against a boot payload that is 43.6 KB.

### 4. Search keeps its exact current semantics, from a lazily fetched raw-text index

Today the grid searches whole records via `JSON.stringify` (`web/app-core.js:40`) while the finder beside it searches an explicit field list (`:43`). The split forces these to converge.

The index is one file per collection: `{"<record id>": "<lowercased concatenated searchable text>"}`, built from exactly the fields each surface searches today — `web/app-core.js:45-53` for systems, `:88-96` for specifications, `:127-130` for inference services, `:140-143` for runtimes. `matchesSearchTerm` runs against the index string unchanged, so infix substring matching and cross-field phrase matching behave exactly as they do now.

Measured alternatives, rejected: an inverted word index is 67.6 KB (saves 32.7 KB but breaks infix matching — "llama" would stop finding "ollama"); a trigram index preserves semantics but is 138.6 KB, larger than the raw text it replaces.

Per-collection index files matter because the All view searches three collections while a scoped view searches one: a reader inside Systems fetches 55.8 KB, not 100.3 KB.

**Timing:** the fetch starts on `focus` of a search input — before the first keystroke, and only for people who intend to search. Until it resolves, filtering runs against the card-level text already in the boot payload; the filter re-runs when it lands. No spinner, no disabled input, no visible two-stage result in the common case.

`BACKLOG.md` item 35 wants one search across records, specifications, and taxonomy terms. Per-collection index files compose into that (fetch all four and concatenate) rather than blocking it, but that item will revisit this decision and should say so.

### 5. Everything async follows the hydrate pattern already in the code

Steps 1 and 2 established it at `web/app.js:1160`: paint synchronously from what is in memory, fetch what is missing, repaint if the same record is still on screen. Three consumers:

- **Record dialogs.** `openRecordDialog` already returns a synchronous boolean; `id` is in the boot payload, so "does this record exist" stays answerable without a fetch, and `restoreRecordFromURL` and `syncRecordWithHistory` keep working unchanged. Only the dialog body awaits.
- **Comparison.** The table needs score dimensions, `strengths`, `weaknesses`, and `verified_at` — all detail. It is capped at 4 records (`web/app-core.js:177`), and `restoreComparisonFromURL` validates against `id` and `score_profile`, both in boot, so URL validation stays synchronous and only the table render awaits at most four small fetches.
- **Search.** As decision 4.

Every path degrades to something correct when a fetch fails, as `logos.json` and `license-evidence.json` already do.

### 6. One shared version stamp for detail files

`scripts/build_asset_version.mjs:22` inlines one content hash per file into `<script id="data-versions">`. At 271 detail files that is 8–10 KB of hashes inlined into `index.html` — spending a sixth of the boot budget to save it.

The 8 boot and index files get individual hashes in `DATA_FILES` as usual. The 271 detail files share one stamp, a hash over the whole detail tree, published as a single `app/detail` key. A change to any record busts every detail URL; given detail files are fetched on demand and rarely, that is the right trade against 10 KB on every page load.

The API view's caching note ("the `?v=` value this page appends is its own content hash") stays true for the endpoints, which is what it describes.

### 7. The builder joins both pipelines, or it rots

`scripts/build_web_payload.py`, following the house pattern of a `--check` mode (as `build_share_pages.py`, `build_logos.mjs`, `build_fonts.mjs`, and `build_asset_version.mjs` all have).

Two call sites, and the second is the one that would fail silently:

- `.github/workflows/verify.yml` — a `--check` step beside the four existing freshness checks.
- `.github/workflows/update-directory.yml` — the weekly refresh calls `sync_web_data()` from `scripts/update_directory.py:709` and then regenerates share pages and asset versions. A payload builder missing from that chain would ship payloads built from the previous week's data on every refresh. This is live, not theoretical: the refresh's whole purpose is updating `stars`, which decision 2 puts in the boot payload.

Order is fixed: `sync_web_data` → `build_web_payload` → `build_share_pages` → `build_asset_version`.

### 8. Governance: ADR 025, plus the documents it touches

`AGENTS.md` states: "Keep only `projects.json`, `taxonomy.json`, `exclusions.json`, `license-evidence.json`, `specifications.json`, `inference-services.json`, and `local-runtimes.json` synchronized into `web/`." Generated payloads are a different category — generated, not synchronized, like `web/records/` — and the rule has to name both.

- **`docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md`** — the endpoints are a stable public contract; payloads are a regenerable projection with no compatibility promise, never advertised, never in `PUBLISHED_DATA`.
- **`AGENTS.md`** — amend the hard rule; add the build command; add a routing row for the ADR.
- **`tests/test_documentation.py:29`** — add ADR 025 to the hardcoded manifest. `test_routing_documents_are_reachable_from_agents` then requires it to be named in `AGENTS.md`, which the routing row satisfies.
- **`docs/WEB.md`** — the loading model under "Behavioral contracts"; the payload tree under "Change surfaces"; the browser pass under "Verification".
- **`docs/OPERATIONS.md`** — an "App payloads" section beside the existing "Share pages", "Asset versions", and "Logo coverage" sections.
- **`docs/AGENT_DOCS.md`** — record that payloads are deliberately absent from `llms.txt` and the Atlas skill, and why.
- **`web/index.html`** — the API view's "What is not published" section (`:265`) already accounts for the one non-endpoint JSON on the origin: "`logos.json` is served because this page needs it, but it holds vendored product marks rather than catalog data." That is a standing promise to explain every JSON the site serves. Shipping 279 more without a sentence there makes it quietly false. One paragraph, no new endpoint links — the API-view test matches on `class="endpoint-link"` and stays green.

## Testing

- **`tests/test_web.js` is the largest cost.** All 56 tests exercise `web/app-core.js` against plain record objects. `matchesProject`, `filterAndSortProjects`, `filterDirectoryEntries`, `filterSpecifications`, and `filterScoredCollection` all gain an optional index argument and must be re-tested both with an index and without one (the pre-index window from decision 4). This is test rewriting, not feature code, and it is the bulk of the work.
- **New unit tests** for the builder: complement completeness (every published field lands in boot or detail, none in neither and none in both), index text equals the concatenation the current filters build, and `--check` fails on drift.
- **New e2e tests**, extending `tests/e2e/deferred-data.spec.js`: a deep-linked record renders its full dialog; searching before the index lands returns card-level matches and widens when it arrives; a restored 4-record comparison renders every score row; each payload class aborted in turn leaves the page correct.
- **The mandated browser pass** from `AGENTS.md`: search and filters across all four collections, cross-family score hiding, scoped comparison and URL restoration, record deep links, back-button behaviour, the finder handoff, taxonomy, and all four dialogs.

## Expected outcome

| visitor | today (after steps 1+2) | after this change |
|---|---|---|
| browses, never searches | 182.8 KB | **43.6 KB** |
| browses, opens a few records | 182.8 KB | ~46 KB |
| searches inside one collection | 182.8 KB | ~99 KB |
| searches the All view | 182.8 KB | ~144 KB |

The large win belongs to the majority who never type. A visitor who both searches and opens records improves by roughly 20%, because the prose is unavoidably carried twice — once lowercased and flattened for search, once structured for rendering. The index is lossy and cannot drive the dialog; there is no version of this design where it does both.

## Risks

- **Search test rewrite is the schedule risk**, not the payload builder.
- **A record open now depends on a second request.** Mitigated by the hydrate pattern, but a reader on a bad connection sees the dialog frame before its body. The share pages under `web/records/` remain the complete no-JS view.
- **279 committed generated files** enlarge diffs on every curation change. `web/records/` already sets this precedent at 273 files; the payload tree roughly doubles it.
- **`BACKLOG.md` item 35 (unified search) will revisit decision 4.** Building per-collection index files keeps that path open rather than closing it.

## Ripple analysis: re-verify before implementing

Every claim below was verified against `5af4f67`. Work is in flight on at least ten branches, and `claude/ai-scientist-ingestion-planning-d14f93` alone touches `web/app.js`, `web/app-core.js`, `tests/test_web.js`, and `docs/WEB.md` while predating the API view entirely (`git merge-base --is-ancestor 5af4f67 <branch>` returns false). **Re-run this list after the next merge to `main`; do not trust it as written.**

| claim | how to re-check |
|---|---|
| `PUBLISHED_DATA` is still the single source of truth for "published" | `grep -n -A4 "PUBLISHED_DATA = " scripts/validate_directory.py` |
| The API view and `llms.txt` tests still bind to it | `grep -n "PUBLISHED_DATA" tests/test_web.js` |
| `web/` copies are still byte-identity checked | `grep -n -A6 "def validate_published_copies" scripts/validate_directory.py` |
| The weekly refresh still syncs `web/` from Python | `grep -n "sync_web_data" scripts/update_directory.py` |
| Pages still deploys `web/` with no build step | `grep -n -A3 "upload-pages-artifact" .github/workflows/deploy-pages.yml` |
| Asset versions are still one hash per file | `grep -n -A6 "const DATA_FILES" scripts/build_asset_version.mjs` |
| The comparison cap is still 4 | `grep -n "maxItems = " web/app-core.js` |
| Search field lists per collection are unchanged | `sed -n '43,53p;88,95p;126,143p' web/app-core.js` |
| The card, filter, and sort field lists in decision 2 are still complete | re-read the `COLLECTIONS` card renderers in `web/app.js` and `matchesProject` in `web/app-core.js` |
| The "What is not published" section still exists | `grep -n "What is not published" web/index.html` |
| The routing manifest still hardcodes every ADR | `grep -n -A6 "def test_task_routing_documents_exist" tests/test_documentation.py` |
| No new backlog item contradicts a decision here | `grep -n "^- \[ \]" BACKLOG.md \| grep -iE "search\|dialog\|card\|render\|directory ui"` |

Two backlog items already changed this design once and must be re-read each time: item 36 (`current_repo_note` should probably be rendered) drove decision 3, and item 35 (one unified search) constrains decision 4.
