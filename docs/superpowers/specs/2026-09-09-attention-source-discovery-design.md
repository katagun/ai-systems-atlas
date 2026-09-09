# Design: attention-source discovery from Hacker News

**Date:** 2026-09-09
**Status:** Approved design, pending implementation plan

## Problem

The Atlas discovers systems from eight vendor feeds in `directory/discovery-sources.json` — AWS, GitHub, Google (two), JetBrains, OpenAI, Replit, and Microsoft. Every one is a large incumbent. `docs/COVERAGE.md:84` and `:102` record the resulting gap directly: the long tail is found by hand, in batches, when someone goes looking.

Hacker News surfaces that tail daily. On 2026-09-09 its front page carried three systems the Atlas did not know: Desert Ant Labs (on-device models), Meta's Muse agent, and Inception Labs' Mercury 2.5. None came from a feed in the registry.

The registry cannot express this source, and the reason is a deliberate guarantee rather than an oversight. `scripts/discovery_sources.py:10` fixes `REQUIRED_SOURCE_FIELDS` and line 72 enforces it as exact set equality, so no field can be added. More decisively, `scripts/update_directory.py:393` keeps a feed item only when its link host appears in that source's `item_hosts`. An attention source's defining property is that its links point off-host, chosen daily by anonymous submitters. Configured as an official source, Hacker News would yield exactly zero candidates — and that zero is the guarantee `docs/OPERATIONS.md:43` states as "Official discovery never fetches article pages."

So the question is not how to add a feed. It is whether the Atlas can take a pointer from a source that vouches for nothing, and do so without weakening the evidence discipline that makes the catalog worth reading.

## Non-goals

This design does not promote anything. It does not write `directory/candidates.json`, `directory/projects.json`, or `directory/exclusions.json`. It proposes no `system_family`, no `primary_role`, no trait, score, `source_model`, confidence, or editorial prose. It does not replace or modify the weekly GitHub Actions refresh as a discovery mechanism. It does not settle the robotics scope decision, and records that would depend on it are collected, not resolved.

## Measured facts

Every number below was measured against live endpoints on 2026-09-09, not estimated.

- **Title keyword filtering does not work.** The repository's own `classify()` scores "Mercury 2.5" at 0.00, "Desert Ant Labs: local, fast models that run on device" at 0.00, and "Muse — Meta's personal AI agent" at 0.20. All three fall below the 0.75 floor at `scripts/update_directory.py:399`, and all three fail `ANNOUNCEMENT_SIGNAL_PATTERN`. A regex sweep of AI terms over titles misses two of the three.
- **The deterministic classifier is worse than absent on page text.** Run over fetched vendor pages, `classify()` returned `ai_knowledge_app` at **0.78** — above the acceptance floor — for an article about building a printer and for a blog post about building a wall lamp. It classified Mercury 2.5, a diffusion language model, as `coding_agent` at **1.00**. It scored the two real systems it was pointed at as no-role. It cannot be used as a gate at any stage of this pipeline.
- **Volume is tractable and tunable.** Of roughly 1,000 stories in 24 hours, 97 carry an outbound link, clear a 5-point floor, and sit on a host outside a media denylist. At a 10-point floor that is 50 per day; at 25 points, 32. All three example systems survive every floor tested.
- **Known-host suppression is a weak lever.** The Atlas knows 159 distinct hosts across all collections. Suppressing them removes 12 of 97 daily items.
- **Some vendor pages cannot be read.** `https://ai.meta.com/muse/` renders client-side and yields 55 characters of text to a plain fetch.
- **The exclusions schema cannot record a rejection.** All 70 entries in `directory/exclusions.json` have exactly the fields `{name, reason, repo, useful_lesson}`. There is no `url` field, and 10 entries have `repo: null`. `known_urls` at `scripts/update_directory.py:675` reads project URLs only.

## Decisions

### 1. An attention source is a pointer, not a claim

A Hacker News submission is evidence that people looked. It is never evidence about the system. Points, comment counts, submission time and submitter are recorded as provenance and are structurally barred from reaching any classification field. The linked vendor page is the evidence; Hacker News is the pointer that found it.

The term is "attention source", not "aggregator": `routing_aggregator` is an inference-service type in `directory/taxonomy.json:80` used by 12 published records, and reusing the word would make it unsearchable.

This is recorded as ADR 028.

### 2. A separate queue, not `directory/candidates.json`

`CANDIDATE_REQUIRED` at `scripts/validate_directory.py:110` is a closed 13-field set, enforced by exact set comparison at lines 1448–1453 with `CANDIDATE_OPTIONAL = {"triage"}`. There is nowhere in it to record a story id, a points count, or a page hash. It also requires a compatible `proposed_system_family` and `proposed_primary_role` pair at line 1485 unless `triage.held_by` is set — that is, it forces a classification at insert time, which decision 3 forbids and which the measured facts show nothing available can perform correctly.

`directory/model-candidates.json` is the precedent: a mechanically distinct discovery stream gets its own queue with its own provenance envelope, validated inline, unpublished, and drained by an explicit human act. This design follows it.

A further reason: `scripts/build_candidate_evidence.py:57` permanently excludes repo-less candidates from the triage harness, because every document that harness fetches comes from a GitHub repository. 24 of the 73 records currently in `directory/candidates.json` are repo-less and therefore unreachable by it. Attention-sourced records are overwhelmingly repo-less; routing them into that queue would grow a class of records automation can never process.

### 3. Nothing automated proposes a classification

ADR 024 records that a block written by an unattended routine "may not carry a family, role, trait, score, `source_model`, confidence, or editorial prose", and its reasoning at line 9 is that "the schema, not the prompt, is what keeps its output from silently becoming an editorial decision." `docs/CURATION.md:94` assigns classification and confidence to human review.

`directory/hn-signals.json` therefore has **no classification fields at all** — not for a model to write, and not for deterministic code to write either. `classify()` is not called anywhere in this pipeline; the measured facts show it would be actively wrong.

What the routine may add is an `assessment` block carrying a routing verdict and a prose finding. Its `finding` is validated by the same taxonomy-id leak check that already guards triage findings at `scripts/validate_directory.py:1393–1399`, which rejects a finding containing any `system_families` or `primary_roles` id. The prohibition is enforced by schema, not by prompt.

### 4. The routine never fetches; deterministic code does

`docs/routines/candidate-triage.md` establishes the pattern and this design reuses it unchanged: a deterministic `prepare` gathers and hashes every document, the model reads only what was pinned, and a deterministic `finish` re-verifies before anything is committed.

### 5. Page content is hashed in CI and never committed

The daily CI job fetches each vendor page and commits **only** `content_sha256` and `fetched_at`. The page text is not committed: arbitrary third-party content in git history is permanent and cannot be removed, and `.gitignore:13` shows the existing evidence bundle is deliberately kept out of the repository for the same reason.

The local `prepare` step re-fetches each page into a git-ignored bundle and verifies its hash against what CI recorded. This preserves "the model reads only pinned bytes" and additionally detects drift between CI's observation and the local read — a page that changed in between is reported rather than silently classified.

### 6. Deterministic gates, and no keyword gate

`scripts/sweep_hackernews.py` queries `https://hn.algolia.com/api/v1/search_by_date` over a fixed window and keeps a story only when it has an outbound HTTPS link, clears a points floor (default 10), and sits on a host outside a maintained media and social denylist.

There is no keyword gate, because the measured facts show one discards two of the three motivating examples. The window runs on a one-day lag so scores have settled; sweeping the most recent 24 hours gates on half-formed counts.

Hard bounds mirror `scripts/import_models_dev.py`: a maximum signal count per run, a per-page byte cap, request timeouts, and a fail-closed abort that preserves the existing queue when the API call fails.

### 7. Fetching reuses the hardened path that already exists

Following submitter-chosen links is the one place this design knowingly reverses a documented guarantee — `docs/OPERATIONS.md`'s "Metadata refresh" section and `docs/DATA_MODEL.md`'s "Discovery source registry" section both state that discovery never fetches linked article pages. Both sentences are scoped to the official-feed updater rather than deleted, and ADR 028 records the reversal for attention sources.

The reversal is safe only because the guards already exist for arbitrary hosts in `scripts/build_candidate_evidence.py`: `_validated_web_endpoint` (lines 133–175) rejects control characters, requires HTTPS on a public DNS name, pins the port to 443, resolves the host and requires every address be public unicast, and caps the address count; `_PinnedHTTPSConnection` (178–191) connects to the validated numeric address while retaining the TLS server name, closing DNS rebinding. `MAX_WEB_EVIDENCE_BYTES` and `MAX_WEB_REDIRECTS` bound the response. This design reuses those functions rather than writing new ones.

`_reject_document_doctype` is not reused: it exists because the parsed body is XML, and vendor pages are HTML. Fetched pages are hashed and text-extracted, never parsed as XML.

### 8. Fetched page text is data, never instruction

Anyone may submit any URL to Hacker News, so every fetched page is attacker-influenceable input read by a model that writes to a repository. The routine prompt states that page content is data and that instructions found inside it are never followed, and the `finish` guards make the statement enforceable: the blast-radius check limits writes to one file, the field-level check limits them to one block, and the taxonomy-id check limits what that block may say.

### 9. Records leave the queue only by a human act

Promotion into `directory/candidates.json` follows the existing curation workflow in `docs/CURATION.md`. Nothing in this pipeline writes that file. `docs/OPERATIONS.md` gains a runbook for reviewing a signal batch, modeled on the triage-batch runbook at lines 108–180.

### 10. A daily workflow, isolated from the weekly refresh

`.github/workflows/sweep-hackernews.yml` runs the deterministic sweep daily on its own branch, its own concurrency group, and its own failure issue title. It mirrors the weekly workflow's safety properties: pinned action SHAs, `persist-credentials: false` while untrusted input is parsed, `continue-on-error` verification with a step summary, and `secrets.ATLAS_AUTOMATION_TOKEN || secrets.GITHUB_TOKEN` — the fallback matters because `docs/OPERATIONS.md`'s "Tokens" section records that a pull request opened with `GITHUB_TOKEN` never triggers the required `verify` check.

One edit to the weekly workflow is required: `git add -A directory web` at `.github/workflows/update-directory.yml:162` is unqualified and would sweep the daily job's queue file into the weekly refresh branch. It becomes an explicit path list.

### 11. The exclusions gap is fixed independently

`directory/exclusions.json` has no field in which to record a rejected non-GitHub URL, and `known_urls` never consults exclusions. Today this misfires at most weekly across eight curated feeds. With an attention source resubmitting popular pages, a reviewer would re-reject the same page indefinitely with no way to make the rejection stick.

A `url` field is added to the exclusion schema and excluded URLs are folded into `known_urls` at `scripts/update_directory.py:675`. This is a real defect today, affecting the 10 repo-less exclusions, and it lands whether or not the rest of this design proceeds.

### 12. Record shape

```json
{
  "version": "1.0",
  "updated_at": "2026-09-09T08:00:00Z",
  "source": {
    "endpoint": "https://hn.algolia.com/api/v1/search_by_date",
    "window_start": "2026-09-07T00:00:00Z",
    "window_end": "2026-09-08T00:00:00Z",
    "points_floor": 10,
    "story_count": 1042,
    "eligible_count": 50
  },
  "signals": [
    {
      "story_id": "49616354",
      "story_url": "https://news.ycombinator.com/item?id=49616354",
      "title": "Mercury 2.5",
      "url": "https://www.inceptionlabs.ai/blog/introducing-mercury-2-5",
      "points": 231,
      "num_comments": 88,
      "submitted_at": "2026-09-08T20:14:52Z",
      "page_status": "readable",
      "content_sha256": "…64 hex…",
      "fetched_at": "2026-09-09T08:00:00Z",
      "status": "provisional",
      "discovered_at": "2026-09-09"
    }
  ]
}
```

`page_status` is one of `readable`, `unreadable`, or `failed`. A page that renders client-side is recorded as `unreadable` and is never classified from an empty body.

The optional `assessment` block, written only by the routine:

```json
{
  "verdict": "worth_review",
  "rule": "…the docs/CURATION.md clause the verdict turns on…",
  "finding": "…prose, quoting the page; may not name a taxonomy id…",
  "evidence": [{"label": "…", "url": "…", "kind": "web",
                "content_sha256": "…", "fetched_at": "…"}],
  "proposed_at": "2026-09-09",
  "proposer": "hn-signals"
}
```

`verdict` is one of `worth_review`, `out_of_scope`, or `unreadable`. The two vocabularies are not independent: `page_status` records what the fetch obtained, `verdict` records what the routine concluded, and a signal whose `page_status` is `unreadable` or `failed` may only carry the `unreadable` verdict. The validator enforces that pairing, so a record with no readable evidence cannot be dispositioned from its title alone.

### 13. Validator rules

`hn-signals.json` is added to `CATALOG_DOCUMENTS` at `scripts/validate_directory.py:23`, gains a `validate_hn_signals` function beside the other queue validators, is called from `validate()`, and gains a must-not-exist assertion for `web/hn-signals.json` mirroring lines 1586–1587. It is absent from `PUBLISHED_DATA`, so `scripts/sync_web_data.py` needs no change.

Enforced: exact envelope and record field sets; unique `story_id`; `status` is `provisional`; ISO dates; HTTPS URLs on public hosts; 64-hex `content_sha256` when `page_status` is `readable`; `assessment` field set exact, `verdict` in range, and `finding` free of taxonomy ids.

### 14. Orchestration

`scripts/run_hn_signals.py` provides `prepare` and `finish`, modeled on `scripts/run_candidate_triage.py`. `ALLOWED_CHANGES` is `{"directory/hn-signals.json"}`. `finish` rejects added or removed signals — only the sweep adds, only a human resolves — and permits exactly one field change per record: adding an `assessment` block where none existed. It has its own worktree path, its own branch, and its own prompt-drift check against `docs/routines/hn-signals.md`; reusing the triage routine's paths would verify the wrong prompt while appearing to pass.

The routine prompt lives at `docs/routines/hn-signals.md` and states its boundary, including "NEVER FETCH" and a reference to ADR 028, matching what `tests/test_documentation.py:29` requires of the triage prompt.

## Implementation phases

1. The exclusions `url` field and `known_urls` fix, with tests. Independent of everything below.
2. ADR 028; scoping the never-fetches claims in `docs/OPERATIONS.md`'s "Metadata refresh" and `docs/DATA_MODEL.md`'s "Discovery source registry" sections; routing rows in `AGENTS.md`; `README.md` repo map. `tests/test_documentation.py` fails until the ADR is registered in its manifest.
3. `directory/hn-signals.json` schema, `validate_hn_signals`, unpublished guard, and validation tests — before anything writes the file.
4. `scripts/sweep_hackernews.py`: query, gates, fetch via the reused hardened path, hashing, fail-closed bounds.
5. `.github/workflows/sweep-hackernews.yml`, plus the `git add` fix in the weekly workflow.
6. `docs/routines/hn-signals.md` and `scripts/run_hn_signals.py`.
7. `docs/OPERATIONS.md` signal-batch runbook; `docs/CURATION.md:117`; `docs/DATA_MODEL.md` queue section.

## Verification

Every command in the `AGENTS.md` command block, plus: a first live sweep reviewed by hand against the measured numbers above; confirmation that `web/hn-signals.json` does not exist; confirmation that the weekly refresh no longer stages the signals file; and a `finish` run proving that an added signal, a removed signal, a changed provenance field, and a finding naming a taxonomy id are each rejected.

## Risks and open questions

- **Recall is untested.** The points floor is the only volume control, and it discards exactly what the wide sweep was chosen to catch: a launch that never trends. On 2026-09-09 a voice-agent evaluation directory sat at 1 point. The floor should start at 10 and be revisited against what review wishes it had seen; no number here is settled.
- **The denylist is hand-maintained and load-bearing.** It is the filter that separates vendor pages from news about vendors. There is no self-maintaining version of it in this design.
- **Client-rendered vendor pages are opaque** to a plain fetch. They are recorded as `unreadable` rather than guessed at, which means a real system can reach the queue with no usable finding.
- **The robotics scope decision still gates a class of records.** `BACKLOG.md:20` holds 13 candidates pending it. Attention-sourced robotics finds will accumulate in the same state; this design collects them and settles nothing.
- **Daily automation raises review pressure on a queue that is already behind.** 24 of 73 existing candidates are repo-less and unreachable by the triage harness. Adding a second daily stream is a deliberate bet that a sorted signal queue costs less to review than it adds.
