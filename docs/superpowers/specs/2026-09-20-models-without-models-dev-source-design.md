# Design: reviewed models without a models.dev source row

**Date:** 2026-09-20
**Status:** Approved design, pending implementation plan
**Decision record:** [ADR 036](../../adr/036-reviewed-models-may-precede-their-models-dev-source-row.md)

## Problem

Every reviewed model must today come from the pinned models.dev snapshot. Claude Mythos 5.1 is absent from models.dev (pin `9df518a` and `dev`, checked 2026-09-20) while its sibling Fable 5.1 is present, so Atlas cannot record it. `BACKLOG.md` holds the same gap for Harvey Tenet. models.dev will keep having gaps; the collection must not inherit them.

The owner's requirement: allow reviewed models with no `source_id`; when models.dev later lists the model, deduplicate, set `source_id`, and use models.dev as the source from then on.

A first design (published `source_gap` block, importer-written `reconciliations` list, overlay by expected ID) was refuted by a repository-only skeptic: it published workflow state in `models.json`, its to-do list had no reader, and multiple expected IDs left an unhandled case. This design is the skeptic's alternative, checked against the repo: all 242 reviewed records satisfy `id == stable_model_id(source_id)` and overlaying by `id` yields zero mismatches.

## Decisions

### 1. `source_id` is nullable; nothing else is added to the schema

`scripts/validate_directory.py`:

- `source_id` stays in `MODEL_REQUIRED` (`:353-376`); `null` is accepted at `:1950-1958`, and the regex and uniqueness checks apply only to strings.
- For `source_id: null`: `id` must match the stable-slug form produced by `stable_model_id` (`scripts/import_models_dev.py:159-163`), and `source_metadata.modalities.output` must contain `text`.
- New: every non-null reviewed `source_id` must exist in `models-dev.json`. `validate_models` does not read the snapshot today, so the snapshot is passed in from the cross-file wiring (`:2926-2939`).
- A queued candidate whose `id` equals a null-source reviewed `id` is valid. The validator summary prints one `link pending: <model id> <- <source_id>` line per such pair. The eligible-count invariant (`:2280-2286`) is unchanged because `published_ids` already ignores non-string IDs (`:2218-2222`) and the pending row is an ordinary queued candidate.

### 2. The projection overlays by `id`

`scripts/build_web_payload.py:236-265` `model_records`: key the reviewed map by `record["id"]` and match `source_record["id"]`. Unmatched reviewed records are still appended. The envelope (`:312-321`) gains `unlisted_reviewed_count`, the number of reviewed records with `source_id: null` and no overlaid row, so the UI total stays truthful.

Grid order is decided client-side; if appended records sort visibly last in any default view, the builder inserts them in name order instead. The implementation plan checks this first.

### 3. The importer does not change

`scripts/import_models_dev.py` never reads or writes anything about null-source records. When upstream lists the release, the row is eligible, enters `candidates`, and the queue diff in the weekly refresh pull request is the attention surface (`docs/OPERATIONS.md` already directs the maintainer there). A test pins this non-change.

### 4. `promote_model_candidate.py` gains `init-gap` and `link`

`init-gap PROVIDER/MODEL --output FILE`

- Refuses when the ID is in the snapshot, the queue, or `model-dispositions.json`, or when the derived `id` collides with any published record.
- Writes a draft with `id = stable_model_id(PROVIDER/MODEL)`, `source_id: null`, and an empty `source_metadata` template in the exact required shape. All human-owned fields are left incomplete, as `init` does.

`check` / `apply` with `source_id: null`

- Skip the candidate match (`:57-72`, `:156-158`), the snapshot byte-equality (`:160-178`), and the pinned-TOML evidence requirement (`:77-85`, `:125-132`, `:203-211`).
- Guard the published-duplicate comparison at `:189-192` so `None == None` cannot fire.
- Keep every other refusal: unverified license review, missing authoritative model evidence, stale or future dates, taxonomy values, score arithmetic, cross-collection ID collisions. `apply` writes `models.json` only; the queue is untouched.

`link MODEL_ID SOURCE_ID --metadata-verified-at DATE`

- Requires `MODEL_ID` to be a null-source reviewed record and `SOURCE_ID` to be a queued candidate. `SOURCE_ID` need not slug to `MODEL_ID` (the wrong-guess case).
- Prints a field-by-field diff of hand-authored against upstream `source_metadata`; `--dry-run` stops there.
- Sets `source_id`, replaces `source_metadata` with the snapshot copy, sets `metadata_verified_at`, appends the commit-pinned TOML evidence entry, removes the candidate, and preflights the full collection and queue before writing either file, as `apply` does.
- Does not touch prose, classifications, licenses, scores, or `verified_at`. If the upstream metadata contradicts the review (for example a different context limit that changes a score rationale), the diff is the prompt for a human re-review; the command does not decide.

### 5. UI

`web/app.js`, plain language, no internal vocabulary:

- Card footer (`:920`) and detail "Model identity" (`:1600`): when `source_id` is null show "Not yet listed on models.dev" in place of the ID.
- Reviewed detail metadata section: when `source_id` is null, label it "Reviewed by Atlas from developer documentation" and do not render the models.dev source badge or link.
- Kicker (`:899`): `"{source} models.dev records · {reviewed} Atlas reviewed"` gains `" · {n} not yet on models.dev"` when `unlisted_reviewed_count > 0`.
- `web/index.html:190-205` intro copy stops implying every model is a models.dev record.
- `source_metadata` stays fully populated, so `modelSourceMeta` (`:646-649`), `modelModalityRoute` (`:616`), and the dialog capability rows need no guards. Search (`web/app-core.js:154-165`) already drops null fields.

### 6. Tests

All on fixtures; no catalog record is added in this change.

- `tests/test_directory.py:46-51`, `:60-68`: compare only non-null `source_id` values.
- `tests/test_web_payload.py:87`: `source_record_count + unlisted_reviewed_count == len(models)`; `:93-96`: uniqueness over non-null `source_id`, and uniqueness of `id` over all.
- `tests/test_validation_policy.py`: null accepted; null with non-slug `id` rejected; null without text output rejected; non-null `source_id` missing from snapshot rejected; link-pending candidate accepted and reported; two null-source records do not collide.
- `tests/test_promote_model_candidate.py`: `init-gap` refusals (in snapshot, queued, dispositioned, colliding `id`); `check`/`apply` null path; `link` happy path, wrong-guess path with frozen `id`, refusal on non-null record, refusal on unqueued source ID, `--dry-run` writes nothing; the existing `"review record requires a models.dev source_id"` guard still fires for the normal `init` path when the field is missing rather than null.
- `tests/test_web_payload.py`: overlay-by-`id` fixture with a null-source record whose row is present (one card, reviewed) and absent (appended).
- `tests/test_import_models_dev.py`: a null-source reviewed record does not remove its upstream row from `candidates`.
- `tests/test_web.js` and one e2e case in `tests/e2e/models.spec.js`: fixture record renders "Not yet listed on models.dev", never the string `null`. `tests/e2e/helpers/catalog-counts.js:20-21` already handles the count.

### 7. Documentation

- `docs/MODELS.md`: overlay wording (`:17`, `:52`); a "Releases models.dev does not list" subsection under Review workflow covering `init-gap`, link pending, `link`, wrong guess, upstream deletion; release-identity rules (`:86-101`) rephrased so they govern the release, not only "a models.dev ID"; attribution paragraph (`:126`) notes hand-authored metadata is Atlas material; link ADR 036 (`:128`).
- `docs/DATA_MODEL.md:214-230`: `source_id` nullable, `source_metadata` provenance conditional, new validation rules.
- `docs/WEB.md:31`, `:89`: overlay by `id`; new envelope field; add the null-source card and dialog to the browser verification matrix.
- `docs/OPERATIONS.md`: refresh review notes mention the `link pending` validator line.
- `docs/adr/025` (`:20`), `026` (`:17`), `027` (`:18`): one-line "amended by ADR 036" pointers; decisions are not rewritten.
- `AGENTS.md` rule 11: append that a reviewed record may exist before its models.dev row (ADR 036).
- `skills/ai-systems-atlas/reference.md:51-57` and the `llms.txt` generator input: `source_id` may be null; metadata provenance.
- `tests/test_documentation.py:95-125`: add ADR 036 to the manifest; it is reachable through `docs/MODELS.md`.
- `BACKLOG.md`: new item for holds and exclusions of releases absent from models.dev; the Harvey Tenet entry (`:101`) points at it. New item to curate Claude Mythos 5.1.

## Out of scope

- Dispositions for releases models.dev does not list.
- The Claude Mythos 5.1 record itself. It lands in a separate curation change after this mechanism merges, with its own first-party evidence.
- Redirects or aliases for renamed record IDs. The `id` is frozen instead.
- Any fuzzy or name-based matching between reviewed records and snapshot rows.

## Verification

`pre-commit run --all-files` with `/usr/local/bin/node` (v22) first on `PATH`; regeneration sequence from `AGENTS.md` and `build_web_payload.py --check`; the `docs/WEB.md` browser matrix on the Models scope, exercised against a temporary local fixture record that is not committed.
