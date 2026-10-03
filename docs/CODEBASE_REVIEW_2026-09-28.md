# Codebase review — 2026-09-28

## Executive assessment

This review covers the engineering layer only: the canonical-data pipeline, the validators, the browser application, the test suites, the CI configuration, and the documentation that describes them. It does not assess curation judgements, collection boundaries, or taxonomy.

The repository's editorial discipline is strong and worth naming before the findings, because it explains the shape of what follows. The escaping discipline in `web/app.js` is near-perfect — 192 `escapeHTML` call sites, 15 of 15 `title=` and 24 of 24 `href=` interpolations correct. The closed-allowlist schema validation rejects an unknown field on any record in any of the eight published collections. The Playwright suite runs 261 behavioural tests across 22 specs and includes genuine failure-path coverage for every degraded data load. `promote_system_candidate.py` and `promote_model_candidate.py` contain a correct atomic-replace-plus-rollback shape. The coverage and complexity ratchets are real and honestly documented.

The problems recorded here are not sloppiness. They are the specific debt that accumulates when curation receives sustained attention and the engineering layer receives none — and, in three cases, they are invariants the documentation states and nothing enforces. Four are defects that a second reader would call bugs today.

Of the findings below, CR-09 through CR-13 are confirmed live defects: a violated provenance invariant, a schema document naming fields that do not exist, a coverage snapshot wrong by eleven records, unescaped interpolations, and a declared Python floor that was broken rather than untested. CR-14 through CR-17 close the data-integrity and duplication gaps. CR-18 onward are structural and remain open.

CR-09 through CR-14 and CR-16 and CR-17 were fixed on 2026-09-28 and each fix carries a test that fails if the defect returns. CR-18 is partly resolved in the same pass: the five Finder tables and the three ranking helpers moved to `web/app-core.js` behind the file's existing `labelOf` injection seam, and `tests/test_web.js` now covers them, including a table-driven pass over every profile, priority, and real record. CR-15 is partly resolved: both `--check` merge gates now have negative tests, while the JavaScript coverage floor and the CI job split remain open and are tracked under "Engineering debt" in `BACKLOG.md`.

| ID | Severity | Status | Finding |
|---|---|---|---|
| CR-09 | High | Resolved | `models.json` attributes 309 reviewed models to a commit the snapshot is not pinned to |
| CR-10 | Medium | Resolved | `docs/DATA_MODEL.md` names two editorial fields that do not exist, and nothing checks the document against the validator |
| CR-11 | Medium | Resolved | The `docs/COVERAGE.md` snapshot is wrong by eleven records and no test can catch it |
| CR-12 | Medium | Resolved | Two record-derived values reach `innerHTML` unescaped, and the escaping convention has no enforcement |
| CR-13 | Medium | Resolved | The declared Python 3.11 floor is broken, not merely unexercised |
| CR-14 | High | Resolved | Canonical data is written non-atomically and without rollback; one error message misstates the guarantee |
| CR-15 | Medium | Partly resolved | Both `--check` merge gates are untested, and the highest-risk write paths have no coverage |
| CR-16 | Medium | Resolved | `PUBLISHED_DATA` and the collection table are duplicated across five modules with no equality test |
| CR-17 | Medium | Resolved | Candidate identity is derived five ways, and two incompatible derivations can insert one candidate twice |
| CR-18 | Medium | Partly resolved | The Finder's ranking and vocabulary are now pure and unit-tested; the rest of `web/app.js` is still untested and declares 251 module-level bindings |
| CR-19 | Medium | Open | `scripts/validate_directory.py` is 4,272 lines behind a complexity ratchet that can never be lowered |
| CR-20 | Low | Open | Fourteen hand-written card templates, three copies of one table, and eleven edit sites per new collection |
| CR-21 | Low | Open | No search input is debounced, and sibling views repaint on every index arrival |
| CR-22 | Low | Open | Exit codes cannot distinguish invalid data from an unreadable input or an internal fault |
| CR-23 | Low | Open | Organisation names are free text across six collections; `labs.json` is bypassed in five of them |
| CR-24 | Low | Open | Stale numbers in the process documentation, two dead pre-commit hooks, and no automated dependency bumps |

CR-08 from [the 2026-09-05 review](history/CODEBASE_REVIEW_2026-09-05.md) is superseded by CR-13, which carries the same finding with a stronger statement: the floor is not untested, it fails.

Line references identify the implementation as reviewed. They drift as fixes land; the finding text is the durable record.

## Scope and method

The review was conducted at commit `c8beedde` on `main`, on a working tree carrying unrelated in-flight changes (an `AtlasCore` to `AppCore` rename across the web application and blog output), which were preserved untouched.

Method was source inspection across `scripts/`, `web/`, `tests/`, `docs/`, and `.github/`, plus direct measurement against the canonical data. Every finding marked confirmed was verified by execution — reading the JSON with the repository's own loader, running the validator, and running the test suite — rather than by reading alone. Three candidate findings raised during the review did not survive verification and are not recorded here: a claimed 100-entry batch log in `docs/COVERAGE.md` (the file has seven `###` headings), and two claims that `.evidence-link-cache.json` and `.coverage` are committed (both are gitignored).

Not run: the live metadata refresh, the models.dev import, the evidence-link crawl, and the OpenRouter import. Each depends on external state and can mutate canonical data. Their implementations and unit tests were reviewed instead. The Playwright suite was not executed for this review; the browser findings below rest on source reading and on Node-level measurement of the pure filter and search functions.

## Findings

### CR-09 — `models.json` attributes reviewed models to a commit the snapshot is not pinned to

`docs/DATA_MODEL.md:255` states that the `models.json` envelope's `source` block "identifies the models.dev repository and pinned full commit used for attributed discovery metadata." The two catalog files carry different commits:

```text
directory/models.json     source.commit = ef71a4865a5821d8cd24f171a0100156a02e808e
directory/models-dev.json source.commit = 1bc95312f70441e339d5aa010ad656b9c7706952
```text

`validate_models` (`scripts/validate_directory.py:2784-2802`) checks that the `source` block has exactly six keys, that `id`, `repo`, `url`, and `license` are correct, and that `commit` is a forty-character hexadecimal string. It never compares the value against `models-dev.json.source.commit`. The analogous check for the candidate queue is present at `scripts/validate_directory.py:4109-4121`; the reviewed-model collection, which is the collection the documented invariant is written about, is the one that was skipped.

No producer maintains the field. `scripts/import_models_dev.py:513` writes only `models-dev.json` and `model-candidates.json`. `scripts/promote_model_candidate.py` `_with_record` writes only `models` and `verified_at`. The value is therefore hand-maintained, has already drifted, and can only drift further.

The impact is bounded but real. All 309 reviewed models carry a `source_metadata` block whose provenance points at a commit that is not the commit from which the snapshot was taken, under a rule that working rule 11 and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md) make load-bearing. Seven records already diverge from their source row on top of this, which is precisely the case ADR 027 exists to detect.

**Fix.** In `validate()`, assert that `catalog["models.json"]["source"]["commit"]` equals `catalog["models-dev.json"]["source"]["commit"]`, alongside the existing source-block comparison at line 4109. If the two files are ever legitimately allowed to reference different snapshots, drop the field from `models.json` and let it join from the snapshot at render time; that decision belongs in `docs/DATA_MODEL.md`, not in the validator.

### CR-10 — `docs/DATA_MODEL.md` names two editorial fields that do not exist

The "Editorial review" bullet for project records at `docs/DATA_MODEL.md:48` reads:

> score dimensions, strengths, weaknesses, **significance**, **confidence**, and `verified_at`.

The required fields are `why_it_matters` and `research_confidence` (`scripts/validate_directory.py:203-205`). No field named `significance` or `confidence` exists in any of the twenty files in `directory/`.

This is the single paragraph a curator reads when writing or reviewing a project record, and it is the paragraph that documents the editorial fields working rule 8 requires automation never to touch. A curator following it would write two fields that validation rejects and lose the two that matter.

The class of defect recurs because `tests/test_documentation.py` checks that documents exist, that their links resolve, and that they are reachable from `AGENTS.md` — but never that the schema they describe matches the validator's constants. `docs/DATA_MODEL.md:43` already holds one field list (`web/app-core.js` badge definitions) under exactly the test that keeps it identical, so the pattern is established in this repository and simply not applied here.

**Fix.** Correct the two names in `docs/DATA_MODEL.md:48`. Add a test asserting that every backticked identifier in each record section of `docs/DATA_MODEL.md` is a member of the corresponding `*_REQUIRED` or `*_OPTIONAL` set in `scripts/validate_directory.py`, and that every member of those sets appears in the document. That test makes CR-10 unrepeatable and costs roughly sixty lines.

### CR-11 — The `docs/COVERAGE.md` snapshot is wrong and no test can catch it

The snapshot paragraph at `docs/COVERAGE.md:21` states that "every count in this section and the numeric columns of the role table below were recomputed from the canonical files on this date." Measured against `directory/` on 2026-09-28:

| Claim | Stated | Actual |
|---|---:|---:|
| systems | 197 | 208 |
| memory systems | 55 | 58 |
| agent systems | 125 | 133 |
| assistant systems | 17 | 17 |
| records satisfying active-choice coverage | 185 | 196 |
| scored local runtimes (`COVERAGE.md:25`) | 16 | 17 |
| provisional queue records | 43 | see note |
| exclusions | 88 | 92 |
| models.dev queue candidates | 270 | 6 |

The paragraph pre-empts the staleness objection for queue counts alone, noting that the snapshot predates batch 95. The family counts are not covered by that disclaimer and are the ones presented as freshly recomputed.

`docs/COVERAGE.md` is 118 KB across 289 lines and is the only place these numbers appear. No test reads it; `tests/test_documentation.py:87` asserts only that the file exists. The `Backlog` item at `BACKLOG.md:58` tracks validating the snapshot, but scopes the check to count drift generally and protects the editorial prose, leaving the numeric half of the same paragraph unowned.

**Fix.** Have `scripts/validate_directory.py` emit its counts — it already computes and prints them at `main()` — into a machine-checked fenced block, and add a test asserting the block matches the validator's output. `docs/COVERAGE.md` links the block rather than restating it. Widen the `BACKLOG.md:58` acceptance signal to cover every count in the snapshot paragraph, not only the queue counts.

### CR-12 — Two record-derived values reach `innerHTML` unescaped

`web/app.js:1461`:

```js
const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${project.score.overall} out of 10">${project.score.overall}</div>` : "";
```text

`web/app.js:2357`:

```js
<tr><td><strong>Overall</strong></td><td>${project.score.overall}</td></tr>
```text

Both interpolate `project.score.overall` into a template literal assigned to `innerHTML`. The first escapes `score_profile` two tokens earlier and then does not escape `overall` in either of its two positions.

`score.overall` is constrained by validation to a number, so this is not exploitable against the published catalog today. The defect is that `escapeHTML` is a convention with no enforcement, and these two sites demonstrate that it leaks. The convention is also structurally unavailable in the other file: `web/app-core.js` contains zero `escapeHTML` calls yet returns HTML, in `emblemSVG` at line 1386. The rule is enforced in one file and cannot be expressed in the other.

**Fix.** Wrap both interpolations. Then add a guard to `tests/test_web.js` rejecting a `${` in an HTML-template position that is not wrapped in one of the known-safe helpers (`escapeHTML`, `detailText`, `detailList`, `detailScore`, `scoreCell`, `listCell`), which converts the convention into a check. The guard will need an explicit allowance for `web/app-core.js`'s emblem builders, which is the correct place to record that those templates are trusted and build-sanitized.

### CR-13 — The declared Python 3.11 floor is broken, not merely unexercised

`pyproject.toml:6` declares `requires-python = ">=3.11"` and `pyproject.toml:20` sets ruff's `target-version = "py311"` with a comment stating the floor "is enforced." `verify.yml` pins Python 3.12 in every job.

`BACKLOG.md:54` records the finding that the floor is not only untested: on 2026-09-24 `scripts/validate_directory.py` failed under Python 3.11 against the published catalog, rejecting seven records whose stored overall no longer matched the weighted sum, because Python 3.12 made `sum()` of floats compensated and the stored scores were computed under 3.12.

That is a correctness defect, not a coverage gap. The published catalog does not validate under a version the project claims to support.

**Fix.** Raise the declared floor to `>=3.12` and update `pyproject.toml`, the ruff `target-version`, and `docs/OPERATIONS.md` in the same change. Raising it is the smaller of the two options: rounding the weighted sum so both versions agree would rewrite stored editorial scores, which working rule 8 forbids automation from doing. Then add a 3.11 job to the matrix only if the floor is ever lowered again, which the ratchet should prevent.

### CR-14 — Canonical data is written non-atomically and without rollback

Two scripts write multiple canonical files with `path.write_text` and no rollback.

`scripts/import_models_dev.py:513-514` writes `models-dev.json` and then `model-candidates.json`. `scripts/import_models_dev.py:521-524` catches failures and prints:

> `models.dev import failed without changing the queue: {exc}`

That claim holds only for failures occurring before line 513. An interrupt, a `KeyboardInterrupt`, or an `ENOSPC` between the two writes leaves the 461 KB commit-pinned snapshot rewritten and the queue stale. `scripts/validate_directory.py:4109` then correctly reports `model-candidates.json: source snapshot differs from models-dev.json` — a corruption the script created and misattributed to the input.

`scripts/update_directory.py:936-948` writes six canonical files in sequence — `projects.json`, `candidates.json`, `license-review.json`, `local-runtimes.json`, `packs.json`, `specifications.json` — and then calls `sync_web_data()` and `build_web_payload([])`. `scripts/update_directory.py:150-153` is the same plain `write_text` helper. An interrupt at line 945 leaves three collections refreshed and three not, with `web/` subsequently copied from the mixture. `docs/OPERATIONS.md:82-91` describes this as "transactional at the repository level." It is transactional in decision — the gates at `scripts/update_directory.py:848-899` are genuinely fail-closed and return before any write — and unguarded in execution.

`scripts/sweep_hackernews.py:460` has the same shape for the signals queue, at lower stakes, since `docs/DATA_MODEL.md:123-127` treats that file as transient and rebuilt wholesale.

The correct implementation already exists twice, verbatim. `scripts/promote_system_candidate.py:331-345` and `scripts/promote_model_candidate.py:686-700` are fifteen identical lines: `mkstemp`, write, `fsync`, `os.chmod` preserving `stat.S_IMODE`, `os.replace`, and a `finally` that unlinks the temporary. `scripts/promote_system_candidate.py:359-370` and `scripts/promote_model_candidate.py:710-720` are eleven identical lines implementing read-originals, try, write, `except Exception`, restore all three, re-raise.

**Fix.** Move both shapes into a new `scripts/json_io.py` as `write_json_atomic(path, value)` and `write_json_atomic_all(pairs)`, and call them from the four writers. This is the first change in the list because it fixes CR-14, CR-15's testability problem, and two duplication findings in one move, at the highest data-integrity value per line written. `BACKLOG.md:11` tracks this as `CR-05`; the finding here adds the misattributed error message and the coverage gap as concrete acceptance signals.

### CR-15 — Both `--check` merge gates are untested, and the highest-risk write paths have no coverage

Measured coverage of `scripts/` is 82% against a `fail_under = 79` floor (`pyproject.toml:50-59`) — three points of headroom on 6,995 statements. The distribution is the problem, not the total.

`scripts/build_web_payload.py` and `scripts/build_share_pages.py` are both at 82%, and the uncovered regions are `main()` in each — `scripts/build_web_payload.py:457-502` and `scripts/build_share_pages.py:445-490`. Those are the entire `--check` paths, which are the gate that decides whether a pull request may merge. `tests/test_web_payload.py:353-360` and `tests/test_share_pages.py:369-388` assert the same conditions the `--check` mode asserts, so a stale commit fails the suite. Nothing catches a broken checker: a regression that made `--check` return 0 unconditionally would pass the entire Python suite.

`scripts/update_directory.py` is at 69%, with `scripts/update_directory.py:901-973` — the six-file write half and the payload rebuild — at zero coverage. That is precisely the region CR-14 identifies as unsafe. `scripts/import_models_dev.py:519-531`, `scripts/promote_model_candidate.py:749-867`, and `scripts/promote_system_candidate.py:383-438` are similarly uncovered, and each is a write path.

On the browser side the asymmetry is complete. `node --test --experimental-test-coverage` reports `web/app-core.js` at 99.80% line coverage. `web/app.js` does not appear in the report at all, because it is never imported by any test. The Python floor has a threshold; the JavaScript run has the coverage flag and no threshold, so the number is an observation rather than a gate.

**Fix.** Two tests each for the two builders: copy the generated tree to a temporary directory, corrupt one payload or share page, and assert `main(["--check"])` returns non-zero; then assert a non-zero return for a missing file. That closes the last twenty-two uncovered statements in `build_web_payload.py` and the last twenty-seven in `build_share_pages.py`, and converts the highest-stakes untested path in the repository into a tested one. Add a coverage floor for the JavaScript suite so the Python/JavaScript asymmetry stops being silent, even if the initial threshold is set at the current measured value.

### CR-16 — `PUBLISHED_DATA` and the collection table are duplicated with no equality test

`PUBLISHED_DATA` is defined twice, with identical contents:

```text
scripts/sync_web_data.py:10-23       12 names
scripts/validate_directory.py:36-49  12 names
```text

Working rule 12 in `AGENTS.md` names the `scripts/sync_web_data.py` copy as the definition. The validator keeps its own copy, and `validate_published_copies` at `scripts/validate_directory.py:3960-3966` is what enforces byte-identity between `directory/` and `web/`. `tests/test_web.js:980` reads the validator's copy. The `sync_web_data.py` copy has no test at all.

If the two tuples diverge, one of two things happens: a file is validated but never copied, so `web/` goes stale and the assertion at `scripts/validate_directory.py:4066-4087` still passes because it checks specific known names; or a file is copied but never checked for freshness. Neither is loud.

`MODELS_DEV_REPO` is defined twice, at `scripts/validate_directory.py:35` and `scripts/promote_model_candidate.py:45`, with a comment at lines 33-35 stating that the duplication is deliberate and must be kept equal. `scripts/import_models_dev.py:37` carries a third form of the same constant without a scheme.

The collection-to-file-to-key table is encoded four further times:

| Location | Shape |
|---|---|
| `scripts/build_web_payload.py:21-30` | `(name, file, key, kind)` × 8 |
| `scripts/report_review_age.py:22-31` | `(name, file, key)` × 8, in a different order |
| `scripts/build_share_pages.py:37-46` | `kind -> (dir, key)` × 8 |
| `scripts/build_share_pages.py:81-97` | implicit `read("x.json")["y"]` × 9 |
| `scripts/run_directory_refresh.py:43-63` | `STAGED_DIRECTORY_FILES`, 19 paths |

**Fix.** One `scripts/collections.py` module holding `PUBLISHED_DATA`, `MODELS_DEV_REPO`, and the collection table with an explicit report-order column, imported by all consumers. This is three lines of real work and it de-risks working rule 12 directly.

### CR-17 — Candidate identity is derived five ways, and two derivations can insert one candidate twice

```text
scripts/build_candidate_evidence.py:62-64   str(repo or url or "").lower()
scripts/run_candidate_triage.py:68-70       identical body
scripts/update_directory.py:658-661         identical body
scripts/update_directory.py:714-716         DIVERGENT: repo.lower() else canonical_url_key(url)
scripts/promote_system_candidate.py:62-68   DIVERGENT: url.rstrip("/"), or None
```text

`scripts/update_directory.py` `discover_candidates` and `discover_official_candidates` both append into the same `candidates` list, and `main()` merges the two results under different key functions at lines 663 and 718. A candidate with no `repo` — which the official-feed path can produce, since it reads XML rather than GitHub search results — is keyed by `canonical_url_key` in one pass and by `url.lower()` in the other. Those are different functions over the same string, so such a candidate can be inserted into `directory/candidates.json` twice under two identities.

The docstring at `scripts/build_candidate_evidence.py:63` states that the queue and the evidence harness derive identity "the same way." They do not, and the updater's own two passes do not agree with each other.

**Fix.** One `candidate_identity(item) -> str` in a shared module, implemented as `repo.lower()` when `repo` is present and `canonical_url_key(url)` otherwise, imported by all five call sites. Add a test asserting that a repo-less official candidate appears exactly once in the merged queue. That test is the acceptance signal; the refactor is what makes it writable.

## Structural findings

### CR-18 — `web/app.js` is 3,694 lines with no unit-test coverage

`web/app.js` declares 247 module-level bindings — 163 `function`, 78 `const`, 6 `let` — in global scope, loaded as a classic script at `web/index.html:435` and configured as `sourceType: "script"` in `eslint.config.mjs`. The e2e suite reaches into these globals directly; `tests/e2e/search.spec.js:19` declares `/* global searchIndexes */`, which is the clearest evidence that nothing is encapsulated.

`tests/test_web.js` destructures 50 named imports from `web/app-core.js` and asserts against them in 152 tests. `web/app.js` is read as text three times, all guardrails about cache headers and asset references. It is never imported, never unit-tested. Of its 166 functions, 154 appear in no test file at all.

`web/app-core.js` is a genuine and well-chosen seam — pure logic and data on one side, DOM and state on the other, with 96 named exports and 180-plus assertions. The fix path therefore already exists. The functions in `web/app.js` that most want unit tests are the ones `docs/WEB.md` specifies in prose and nothing enforces:

| Function | Line | Why it wants a test |
|---|---|---|
| `syncMatchSort` | 398 | 18 lines of sort bookkeeping; `docs/WEB.md:74` spends a paragraph on it |
| `priorityBoost` | 1843 | 35 lines of profile-dispatched weighting; `docs/WEB.md:90` requires dispatch on `score_profile` |
| `recommendationReasons` | 1883 | the repository's live maximum complexity, 39 |
| `readScopeControls` | 355 | checkbox, select, and text branching |
| `emptyStateMarkup` | 2111 | six branches, each a specified reader behaviour |
| `datasetAttribute` | 1653 | camelCase to kebab-case, pure, untested |

`web/app-core.js` is not purely logic: `emblemSVG` at line 1386 returns an SVG string, and `badgeLettering` at line 961 returns markup. That is the same seam-drawing error as CR-12, in the opposite direction, and it is worth correcting while the file is open.

**Fix, as applied.** `FINDER_DIRECTIONS`, `FINDER_GOALS`, `FINDER_PRIORITIES`, `FINDER_DIRECTION_NAMES`, `FINDER_DETAIL_KINDS`, `priorityBoost`, `scoreDimension`, `datasetAttribute`, and `recommendationReasons` moved to `web/app-core.js`, which now exports 80 names and is exercised by 173 unit tests. `recommendationReasons` reached taxonomy through `taxonomyName` and `roleName`, which read `state.taxonomy`; rather than import app state into the core file, it takes the resolver as a third argument, following the `searchFields(kind, record, { labelOf })` convention already in that file. `web/app.js` dropped from 3,878 to 3,694 lines.

Two things the finding predicted did not hold. Three of the six listed candidates — `syncMatchSort`, `readScopeControls`, and `emptyStateMarkup` — are not pure: they read the DOM and module state, so moving them would have deepened the coupling rather than removing it, and they stay in `app.js` for the e2e suite. And `FINDER_DETAIL_KINDS` values are detail-directory stems (`inference`, `runtime`), not collection ids, so the completeness assertion checks `web/app/detail/<kind>` exists.

On the merged commit `app-core.js` is 99.61% line, 91.62% branch, and 99.49% function, with 173 unit tests. Line coverage is marginally below the 99.81% this file sat at before, and branch coverage below 92.71%, because the rebase brought in concurrent work on `app-core.js` (#375, #377) that added its own uncovered branches alongside the moved dispatch tables. The moved code is covered by a table-driven pass over every profile, priority, and real record; the shortfall is in that concurrent work, not here.

**Re-measured 2026-09-29, after #375, #377, #378, #379, and #382 merged.** `app.js` is 3,740 lines with 251 module-level declarations (172 `function`, 72 `const`, 7 `let`), so the finding's original 3,694 and 247 are now undercounts. The line count grew on every one of those merges while the binding count held steady, which is the useful part: the refactor's own removals were not undone by the concurrent work. These are dated measurements rather than properties of the refactor, so they do not read as current when they drift; [#382](https://github.com/katagun/ai-systems-atlas/pull/382) refreshed the same figures in `BACKLOG.md` independently. The remaining open task is the DOM and state declarations in `app.js`, and separating their decisions from their effects where a decision is worth testing on its own.

Two follow-ups came out of the fix and are in `BACKLOG.md` under Engineering debt: the uneven `|| []` guards on `deployment` and `architectures` inside `priorityBoost`, which no published record currently triggers, and the `verify` run that did not appear for #379's first push.

### CR-19 — `validate_directory.py` is a 4,272-line module behind a ratchet that cannot be lowered

`scripts/validate_directory.py` is the largest script in the repository by a factor of 2.7. It holds 64 module-level functions, 505 `errors.append` calls, and 51 function signatures taking an `errors: list[str]` out-parameter.

`pyproject.toml:44-48` sets `max-complexity = 50` against a live maximum of 46, in `validate_hn_signals`. A ratchet set one notch below the current maximum cannot fail existing code and therefore constrains only new work; it can never be lowered while the worst function exists. The comment states the intent — "Tighten toward 10 as the validators are decomposed" — but nothing tracks the decomposition, and the file has grown in the meantime.

Within the module, the same rule is written several times:

- The exact-field-set check appears at 34 sites and produces four different message shapes. After a shape error, lines 2604 and 2817 `continue` to the next record while lines 860, 1557, and 2503 fall through, so a malformed pack record yields one error and a malformed model record yields many. That inconsistency is not documented anywhere.
- The non-empty-string field loop appears 22 times. A `validate_string_list` helper exists at line 596; there is no scalar equivalent.
- The stars and `stars_verified_at` block appears four times, with a fifth clause present only for specifications.
- Evidence-item validation appears five times and has already drifted: line 1297 uses `item["path"]` after a guard that `continue`s on a non-dict, where line 1516 uses `item.get("path")`.
- `validate_score_profile` at line 646 and the inline check in `validate_taxonomy` at line 791 implement one rule twice, and the second uses plain `sum` rather than `math.fsum`, despite the comment at lines 691-695 explaining precisely why compensated summation is required.

The out-parameter is what makes the module hard to test at rule level. `tests/test_validation_policy.py` responds by snapshotting all twenty canonical files into a temporary tree and re-running the whole `validate()` per assertion, which is why that file is 3,984 lines — larger than the validator — and why 111 of its 214 tests assert on error-message substrings. Rewording one message at `scripts/validate_directory.py:1370` breaks 111 tests; changing line 1370 so it stops rejecting the field breaks none.

**Fix.** Introduce a `RecordSchema(required, optional, forbidden)` named tuple and a `check_fields` helper used at all 34 sites, so every collection reports missing and extra fields identically and each caller must decide explicitly whether to continue. Add `require_non_empty`, `validate_stars`, and a shared evidence-item validator. Then change the accumulator from `list[str]` to `list[Error(code, subject, detail)]` and retarget the 111 substring assertions at stable codes. That is a mechanical rename with a large payoff: it makes rule-level unit tests possible without a twenty-file fixture, and it is what unblocks CR-09, CR-10, and CR-16 tests. The eventual split into `scripts/validators/` is mechanical too, since no test imports a private symbol.

### CR-20 — Fourteen card templates, three copies of one table, eleven edit sites per collection

Fourteen card templates are written out by hand, at `web/app.js` lines 1236, 1261, 1292, 1311, 1329, 1363, 1375, 1384, 1459, 1495, 1555, 1585, 1618, and 1648. Lines 1363, 1375, and 1384 — the mixed-view model, runtime, and inference cards — are literal copies of the scoped versions at 1618, 1585, and 1555. The only intended difference is that the mixed view omits the score ring and licence row, which `docs/WEB.md:68` requires. Nothing in the code records that relationship, so a structural change to a card requires finding all fourteen sites and remembering which three may differ.

`RECORD_DIALOGS` at `web/app.js:2772-2834` is the correct counterexample: the frame is shared, and only `find`, `markup`, and `afterRender` vary. The dialog templates that follow it have little duplication, because their content genuinely differs per collection. The cards should use the same shape.

The same 9-entry table is written three times: `renderers` at line 994, `pageRenderer` at line 1030, and `renderers` at line 1742 inside `renderSearchSurfaces`, the last missing three entries. All three are derivable from the `COLLECTIONS` descriptor at line 1432, which already carries `grid`, `pageKey`, and `resultCount`.

Adding a collection requires editing eleven locations: `web/index.html`, `SCOPE_CONTROLS` at line 335, `COLLECTION_FILTERS` at line 608, the panel list at 985-993, the grid-clearing loop at 1005-1010, `PAGE_CONTAINERS` at 1018-1028, the three renderer maps, `SCOPE_URL_PARAMS` at `web/app-core.js:797`, and `AppCore.COLLECTIONS` at `web/app-core.js:687`. With the Papers collection proposed and Robots and Labs recently added, this tax is being paid every few weeks.

Two smaller items in the same file: nine near-identical reset-filter handlers occupy lines 3451-3525, and sixteen dialog close-handler pairs occupy lines 3589-3604 while `RECORD_DIALOG_SELECTORS` at line 2903 already lists every dialog.

**Fix.** A field-descriptor card renderer — `eyebrow`, `maker`, `role`, `licenses`, `footer`, and a `scored` flag — driving one template from nine descriptors, with the mixed view expressed as `scored: false`. This makes the badge, emblem, and score contracts that `docs/WEB.md` depends on into data rather than copy-paste. Derive the three renderer maps from `COLLECTIONS`, and add a `panel` field so the panel, grid, and pager tables collapse into the same descriptor.

### CR-21 — No search input is debounced

`web/app.js` contains no occurrence of `debounce`, `setTimeout`, `requestAnimationFrame`, or `requestIdleCallback`. Nine `input` handlers, at line 3389 and lines 3443-3450, each perform a full filter, a full grid `innerHTML` replacement, and a `history.replaceState` on every keystroke.

Measured in Node against the published payload, with 730 boot records:

| Operation | Cost |
|---|---:|
| `filterModels`, one word | 13.5 ms |
| `filterDirectoryEntries`, All, three words, warm index | 11.3 ms |
| `suggestNames` over 730 records | 5.2 ms |
| `emptyResultMatches`, six kinds, no match | 6.0 ms |
| `filterAndSortProjects`, two words | 4.0 ms |
| `filterInferenceServices`, one word | 1.8 ms |

The filter half is 3-14 ms on the main thread per keystroke. The DOM half — `renderCollection` builds up to 96 cards, attaches a listener per card, renders the pager, and writes history — is strictly additional and was not measured, since no browser was run for this review. The `cachedSearchWords` and `cachedPhraseWords` maps in `web/app-core.js:365,378` are working; the filter is not the problem.

Two related inefficiencies. `renderSearchSurfaces` at `web/app.js:1741-1754` unconditionally repaints three sibling views whenever any search index arrives, so focusing the All search box can trigger up to eighteen full grid renders at boot. `renderComparisonControls` at lines 499-509 runs a document-wide `$$('[data-compare-kind]')` query on every render of a comparable collection, and `renderScopeStrip` rebuilds the strip with `innerHTML` on the same path.

**Fix.** Debounce the nine search inputs by roughly 120 ms. The listener that must stay synchronous is `syncMatchSort` at line 3337, which toggles the Best-match option and changes control state rather than triggering a render. Gate the sibling repaints in `renderSearchSurfaces` on the active view, and scope `renderComparisonControls` to the active grid or skip it when the comparison set is empty.

### CR-22 — Exit codes cannot distinguish failure kinds

Twenty-four of twenty-six Python scripts return only 0 or 1. The exceptions are `scripts/check_evidence_links.py` and `scripts/check_page_stability.py`, which document a three-value taxonomy.

The consequence is visible in `scripts/validate_directory.py:4232-4235`, which raises `SystemExit("\n".join(errors))` for a catalog with errors and lets an uncaught `JSONDecodeError` propagate for an unreadable file. Both exit 1. Verified by corrupting `directory/taxonomy.json`: the validator raises a bare `Expecting property name enclosed in double quotes: line 1 column 3` with no filename and no catalog context, and the caller cannot distinguish that from forty schema errors.

The six JSON loaders also disagree. `scripts/validate_directory.py:519-520` propagates `JSONDecodeError`; `scripts/import_models_dev.py:55-58` and `scripts/import_openrouter.py:151-154` return a default for a missing file and propagate on bad JSON; `scripts/promote_system_candidate.py:50-59` and `scripts/promote_model_candidate.py:74-83` convert both to `PromotionError` and are otherwise byte-identical.

`scripts/run_directory_refresh.py:524` collapses three unrelated conditions into one return value: a failed verification check, a failed push or pull-request creation at lines 511-516, and a non-fatal OpenRouter degradation at line 497.

**Fix.** A module of exit constants — `OK`, `INVALID_DATA`, `UNREADABLE_INPUT`, `INTERNAL` — applied first to the validator and the refresh runner, and bit-flagged where one run can degrade without failing. The shared loader from CR-14 is where the `UNREADABLE_INPUT` distinction originates.

### CR-23 — Organisation names are free text across six collections

`labs.json` was built to solve entity identity: `docs/DATA_MODEL.md:214` states that a system record "names no organization," and `catalog_names` exists so labs can be joined by string. Labs cover only model developers, so the same names are re-typed as raw strings in five other places:

| Field | Distinct values | In `catalog_names` |
|---|---:|---|
| `labs[].catalog_names` | 58 | — |
| `models[].developer` | 44 | 44, validated |
| `inference-services[].operator` | 58 | 26 |
| `local-runtimes[].maintainer` | 16 | 3 |
| `specifications[].stewards` | 32 | unchecked |
| `packs[].steward` | 8 | unchecked |

`packs[].steward` goes further and embeds a handle in the display string — `"Alireza Rezvani (alirezarezvani)"` — where every other repository-bearing field in the repository uses the `owner/name` convention of `REPO_PATTERN` at `scripts/validate_directory.py:62`.

Two related normalisations are cheap. `url` is a pure function of `repo` on 165 of 208 project records; the 43 that differ are exactly the ones carrying signal, being product pages or documentation sites. And the same editorial slot is named `weaknesses` on systems but `tradeoffs` on inference services, local runtimes, and models, which is why four separate builders branch on which name the collection uses. `research_confidence`, which `docs/DATA_MODEL.md:48` and `docs/CURATION.md:96` treat as a universal human-owned editorial field, exists on two of eight published collections.

**Fix.** A `directory/organizations.json` with `{id, name, aliases, hq_country, parent_id, channels}`, and `developer`, `operator`, `maintainer`, `steward`, and `stewards` referencing ids the way `packaging_formats` already references `specification_ids` at `scripts/validate_directory.py:1721-1728`. `scripts/lab_relations.py` is the joiner to reuse. This is the highest-value item in the review and the most expensive, and it deserves an explicit decision rather than absorption. The `weaknesses`/`tradeoffs` naming should be settled in the same ADR, whichever direction it goes.

### CR-24 — Stale process documentation, dead hooks, and no automated dependency bumps

The configuration files that describe the checks contain inaccurate numbers.

- `.pre-commit-config.yaml:12-13` states "the eslint complexity rule (JS, max 30)". `eslint.config.mjs:19` sets `["error", 40]`.
- `AGENTS.md:22` directs the reader to `.github/workflows/verify.yml` for the local check list. `AGENTS.md:69` correctly names `.pre-commit-config.yaml`. A local contributor following working rule 15 reads CI YAML to find out what to run.
- `docs/OPERATIONS.md:26` states the unit suite takes approximately 1.5 minutes. It measured 192 seconds wall on this checkout.

Two pre-commit hooks are dead weight. `python-compileall` at `.pre-commit-config.yaml:199-204` cannot catch anything `ruff-check` does not, since `pyproject.toml:30` selects ruff's `E9` syntax and IO rules and that hook runs on every Python file. `node-syntax-check` at lines 206-212 parses `web/app.js` and `web/app-core.js` at `ecmaVersion: 2023`, which is exactly what `eslint.config.mjs:29-46` does. Both run in the `static` CI job, and `docs/OPERATIONS.md:45` restates them as required checks.

`.github/dependabot.yml` declares the `github-actions` and `npm` ecosystems only. The twelve pinned pre-commit hook revisions and both Python tools — `coverage==7.10.1` and `ruff==0.16.6` — are therefore never bumped automatically, while `docs/OPERATIONS.md:50` mandates twelve sequential manual bump cycles, each with a full verification run.

**Fix.** Correct the three numbers, remove the two redundant hooks and their `docs/OPERATIONS.md` entry, and add the `pre-commit` and `uv` ecosystems to `.github/dependabot.yml`. Separately, the Python job is the critical path at 192 seconds serial; splitting `unittest discover` into a fast bucket and a slow bucket across two jobs would roughly halve it, and the ten-minute `timeout-minutes` at `verify.yml:67` has little headroom for a slow-machine flake.

## What is working well

Recorded so that a later refactor does not remove it by accident.

- The closed-allowlist schema validation. An unknown field on a record in any of the eight published collections fails the build, and the `*_FORBIDDEN` sets at `scripts/validate_directory.py:276-281`, `:300`, and `:355` correctly reject a sibling collection's fields.
- The atomic-write and rollback shape in both promote scripts, which is the correct implementation CR-14 generalises.
- The Playwright suite, particularly `tests/e2e/deferred-data.spec.js`, which covers every degraded data path, and `tests/e2e/search.spec.js`, which pins the ADR 040 ordering semantics that `docs/WEB.md:72-73` states only in prose.
- The `errors.append` accumulator discipline in the validators: uniform `(record, prefix, errors)` signatures throughout, which is what makes CR-19's refactor mechanical.
- The CSS. Two `!important` declarations in 1,517 lines, both justified, and `tests/test_web.js:807,814,901` enforce that no colour or radius literal appears outside `:root`.
- The complexity and coverage ratchets in principle, and the honest comment in `eslint.config.mjs` explaining that the threshold exists to fail new code worse than the worst already carried. The problem is the value, not the mechanism.
- `scripts/lab_relations.py`, `scripts/discovery_sources.py`, `scripts/page_shell.py`, and `scripts/verify_signal_pages.py` are genuinely shared modules rather than copied helpers, and `scripts/verify_signal_pages.py:22` correctly imports `extract_visible_text` and `content_hash` from the sweep rather than duplicating them.

## Verification record

Findings verified by direct execution against the canonical data: CR-09 (both commit values read from `directory/`), CR-11 (all eight counts recomputed from `directory/`), CR-12 (both interpolation sites read in `web/app.js`, and the `escapeHTML` call-site census across `web/app.js` and `web/app-core.js`), CR-13 (recorded in `BACKLOG.md:54` with the failing record and the arithmetic cause), CR-15 (per-module coverage measured with `coverage run -m unittest discover -s tests`), CR-21 (filter, sort, and search timings measured in Node against the published payload), CR-24 (measured unit-suite wall time, and the hook and configuration values read directly).

Findings verified by source inspection with line citations confirmed: CR-14, CR-16, CR-17, CR-18, CR-19, CR-20, CR-22, CR-23.

Rejected during verification, recorded here so they are not re-raised: `docs/COVERAGE.md` does not contain a hundred numbered batch entries; `.evidence-link-cache.json` and `.coverage` are both gitignored and neither is committed; and `web/` holding copies of `directory/*.json` is an enforced invariant rather than a convention, since `validate_published_copies` compares bytes.

## Tracking and remediation order

CR-01 through CR-04 are resolved as recorded in [the 2026-09-05 review](history/CODEBASE_REVIEW_2026-09-05.md). CR-05 through CR-08 remain open there and are tracked in `BACKLOG.md`; CR-13 supersedes CR-08 and CR-14 restates CR-05 with concrete acceptance signals.

1. CR-09, one line, closes a live violated provenance invariant.
2. CR-10, two words plus a sixty-line sync test, and it makes the drift unrepeatable.
3. CR-11, forty lines, and it stops a snapshot from decaying silently.
4. CR-12, two wraps plus a guard test.
5. CR-13, raise the floor to 3.12; the alternative rewrites editorial scores and working rule 8 forbids that.
6. CR-14, the shared `json_io` module, which also unblocks CR-15 and CR-16.
7. CR-15, four negative tests, closing the untested merge gates.
8. CR-16 and CR-17, one module and one function, removing duplicated and incompatible identity logic.
9. CR-18 and CR-19, the two large refactors, each unblocked by the previous tier.
10. CR-20 through CR-24, in the order recorded above, each independently verifiable.
