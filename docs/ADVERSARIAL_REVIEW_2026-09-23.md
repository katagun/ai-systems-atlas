# Adversarial review — 2026-09-23

Method: six parallel audits (docs consistency, Python scripts, web app,
data/taxonomy, style/naming/comments, operations/CI) plus a critic pass,
followed by independent spot-verification of the highest-severity claims.
Items marked **verified** were re-checked against the file body in this
session; items marked **reported** come from the audit pass and still need a
human to confirm before acting.

Prior review: [CODEBASE_REVIEW_2026-09-05](CODEBASE_REVIEW_2026-09-05.md).
This report supersedes nothing; it is a new adversarial pass.

## Severity summary

| Severity | Finding |
|---|---|
| P0 — will mislead or break | ROBOTS references a nonexistent script (verified); README test-before-install order breaks fresh checkouts (verified); CURATION/MODELS regeneration snippets omit payload + asset steps (verified) |
| P1 — likely bug on real input | Unvalidated HN dict subscripts in sweep; `item["url"]` KeyError fallback in update_directory; direct subscripts in verify_signal_pages (all verified). The `report_review_age.py` `fromisoformat` abort is intended fail-closed per `test_malformed_review_date_raises_rather_than_being_skipped` — not a bug; withdrawn. |
| P2 — docs drift / taxonomy drift | Finder direction count, DATA_MODEL robots omission, WEB matrix robots gap, licence/license spelling (verified); remaining routine/roadmap items (reported) |
| P3 — smells / hygiene | Duplicated helpers, broad excepts, payload subscript density, comment staleness (reported, spot-verified in part) |

## 1. Docs inconsistencies

### 1.1 P0 — verified

- **ROBOTS points at a script that does not exist.** `docs/ROBOTS.md` (step 2)
  instructs `uv run python scripts/check_page_stability.py <url>`, but
  `scripts/` contains no such file (`ls` confirms absence). Every robot
  review following the workflow verbatim hits a dead step. Fix: add the
  script or rewrite step 2 to the real pinning/checking procedure.
- **README runs tests before installing dependencies.**
  [README.md](../README.md) "Start here"
  runs `ruff`, `validate_directory.py`, `unittest`, and `node --test`
  before `npm ci` / `npx playwright install chromium`. A fresh checkout
  fails at the JS test and e2e lines. Fix: move `npm ci` (and the
  Playwright install) above the test lines, or split into
  "setup" vs "check" blocks.
- **CURATION and MODELS omit payload + asset steps.**
  `docs/CURATION.md` (step 7) runs only `sync_web_data.py` and
  `build_share_pages.py`; `docs/MODELS.md` (promotion snippet) does
  the same. [AGENTS.md](../AGENTS.md)
  requires the four-step sequence including `build_web_payload.py` and
  `build_asset_version.mjs`. A reviewer following CURATION/MODELS leaves
  `web/` payload and asset version stale. Fix: copy the AGENTS sequence
  into both snippets.

### 1.2 P2 — verified

- **TAXONOMY Finder omits the local-runtime direction.**
  `docs/TAXONOMY.md` (step 1) lists memory, agent, assistant, or
  inference-service; [web/app.js](../web/app.js)
  `FINDER_DIRECTIONS` also offers `local_runtime` ("Run models on hardware
  I operate"). The taxonomy either under-documents a shipped path or the
  app over-offers one. Fix in whichever direction is intended.
- **DATA_MODEL omits the robots collection.**
  `docs/DATA_MODEL.md` (canonical/published table) lists ten
  files; it has no `robots.json` row although ROBOTS describes
  `directory/robots.json`, and [sync_web_data.py](../scripts/sync_web_data.py)
  `PUBLISHED_DATA` is exactly those ten files. Either robots is
  unpublished (then ROBOTS step 7 "regeneration sequence" is wrong) or the
  table and `PUBLISHED_DATA` are stale. Decide and fix both together.
- **WEB browser matrix has no robots row.**
  `grep -i robot docs/WEB.md` returns only share-page/sitemap/robots.txt
  hits; `docs/ROBOTS.md` (step 7) points at "the robots row of the
  browser verification matrix in WEB.md". The cross-link dangles. Add the
  row or retarget the ROBOTS step.
- **`licence` vs `license` spelling drift.**
  `docs/PACKS.md` ("licence and evidence rigour") and neighboring
  lines use British spelling; the schema, taxonomy, and remaining docs use
  `license`. Pick one for prose; code identifiers stay `license_*`.

### 1.3 Reported (needs human confirmation)

- `CONTRIBUTING` pre-commit gate vs AGENTS/OPERATIONS gate ordering.
- `BACKLOG`/`ROADMAP`/`COVERAGE` snapshot staleness (e.g. coverage role
  counts vs current record counts; HN refresh scheduling).
- `OPERATIONS.md` write-ops section unlabeled relative to AGENTS rule 15.
- `llms.txt` / PACKS terminology drift.

## 2. Bugs and crash paths — verified

All below were re-read at the cited lines; none is a style nit.

- **`scripts/sweep_hackernews.py` trusts HN rows.**
  Signal construction uses `story["url"]`, `story["objectID"]`,
  `story["title"]`, `story["points"]`, `story["created_at"]` with direct
  subscripts. One deleted/flagged/odd HN row (missing `url`, null id,
  missing points) raises `KeyError` mid-sweep. Use `.get()` with explicit
  skip/drop accounting like the surrounding `num_comments` handling.
- **`scripts/update_directory.py` `candidate_key` fallback can raise.**
  `str(item.get("repo") or item["url"])` still subscripts `"url"`. A queued
  candidate with neither key crashes the dedupe pass instead of being
  reported. Guard or validate upstream.
- **`scripts/verify_signal_pages.py` trusts the queue file.**
  `document["signals"]`, `signal["page_status"]`, `signal["url"]`,
  `signal["story_id"]` are direct subscripts. A hand-edited or older queue
  raises instead of producing a `problems` entry. Fail soft per-signal.
- **`scripts/report_review_age.py` date parse (withdrawn).**
  The abort on a malformed `verified_at` is the documented fail-closed
  contract (`test_malformed_review_date_raises_rather_than_being_skipped`),
  not a bug. No change made.
- **`scripts/check_finding_support.py:275` confidence ranking.**
  `sorted(shown, key=lambda claim: -(claim.get("confidence") or 1.0))`
  maps an explicit `0.0` confidence to `1.0`, ranking "no confidence" as
  strongest. Use an explicit `is None` check.

## 3. Frontend robustness — partially verified

- `web/app.js` finder/URL paths: audit reports unguarded `URL()` calls and
  modality branches missing optional chaining where `app-core.js` guards.
  Grep confirms the finder-direction surface exists; the exact unguarded
  call sites were **reported**, not re-verified line by line. Treat as
  P2 until the web owner confirms: wrap URL parsing in try/catch and align
  modality guards with `app-core.js`.

## 4. Code smells — reported with spot checks

- Duplicated helpers across scripts: `candidate_key`, `content_hash`,
  `load_json`, GitHub-token retrieval. Extract to one shared module or
  document why duplication is intentional.
- `build_web_payload.py` subscript density plus overlay recompute in the
  236–283 region; consider local accessors and single-pass overlay build.
- Broad `except Exception` in `build_candidate_evidence.py`,
  `check_finding_support.py`, and similar fallbacks — narrow to the
  network/parse errors actually expected, and log the dropped context.
- Healthy notes (kept so the report is not pure negatives): no
  `shell=True`/`eval`/`pickle` found; HTTPS pinned, atomic writes with
  fsync, symlink refusal, and fail-closed validation observed; JS lint and
  `node --check` pass per audit.

## 5. Style, naming, comments

- Verified: `licence`/`license` drift (above); `bind` flag example
  inconsistency between README/WEB/AGENTS noted by audit — confirm the
  canonical flag and fix the outlier.
- Reported: snake/camel and singular/plural drift across scripts/web/docs;
  stale comments referencing moved scripts (cousin of the
  `check_page_stability.py` miss); tone drift between normative docs
  ("never") and guide docs ("prefer"). A lint pass for dead references
  (`grep` for each script name across `docs/`) would catch the whole class.

## 6. Operations / CI gaps — reported

- `verify.yml` vs pre-commit vs AGENTS check-list ordering claims need a
  three-way diff; audit alleges at least one ordering contradiction and
  one freshness gap for generated files.
- Browser matrix coverage for the robots scope is missing (verified gap
  above); remaining matrix rows (filters, score scopes, comparisons,
  URL/history restoration, Finder, taxonomy, record dialogs) were not
  exercised in this review — no browser was launched.

## Suggested fix order

1. ROBOTS dead script reference; CURATION/MODELS regeneration snippets;
   README setup ordering.
2. Sweep/verify/update/review-age input guards + confidence sort fix.
3. DATA_MODEL + PUBLISHED_DATA robots decision; TAXONOMY finder list; WEB
   robots matrix row.
4. Spelling, helper dedupe, except narrowing.

## What this review did not do

- No browser verification matrix run (per AGENTS rule 16, required before
  completing web changes — this report changes no web code so it stays a
  gap, not a violation).
- No full test/lint/CI run; the audit cites passing suites secondhand.
  Re-run `pre-commit run --all-files` and the verify workflow before
  acting on P0 items.
- Line numbers above are as read on 2026-09-23; re-verify before editing.
