# Design: a local candidate-triage routine

**Date:** 2026-09-04
**Status:** Approved design, pending implementation plan

## Problem

Discovery outruns review. A single weekly refresh, measured on 2026-09-04 against `origin/main`, added 97 candidates to a queue of 55 in 112 seconds; the oldest entries in that queue were ten days old. Review is a human act that takes hours per record, so the queue grows structurally rather than incidentally.

The obvious automation is closed off by design. `docs/CURATION.md` reserves classification, traits, editorial prose, scores, confidence, license evidence, source model, and `verified_at` for human review, and states that discovery "never auto-promotes entries and cannot complete editorial or license review." `.github/workflows/update-directory.yml` therefore does what it is allowed to do — find candidates — and stops. Nothing in the repository helps with the part that actually costs time: establishing, per candidate, whether it is in scope at all, and if it is, assembling the evidence a reviewer needs.

Two consequences are already recorded in `BACKLOG.md`:

- **No per-item triage record.** Item 11 notes that the 2026-08-31 sweep "queued thirty survivors out of 279 candidates and recorded the classes it dropped only in aggregate … no per-item triage log exists, so the size of this class is unknown and would have to be re-derived." Triage work is done and then lost.
- **No field naming what holds a record.** Item 12 asks for two things the schema cannot express: a reference from a candidate to the decision that gates it, and a way to queue a record awaiting a collection that does not exist yet — the standing Liquid AI case, blocked because the schema requires a compatible family and role pair.

This design adds a local, scheduled routine that does the two things automation is permitted to do — gather verifiable evidence, and sort the queue — while writing nothing the curation contract reserves for a human.

Two facts establish that it can be built safely, both checked against the code rather than assumed:

- `scripts/update_directory.py:537` carries existing candidates through the weekly refresh **verbatim** (`{candidate_key(item): item for item in previous_candidates}`) and skips any repo already queued, so fields added to a candidate survive the refresh untouched.
- The GitHub `/repos/{repo}/license` endpoint returns the blob SHA the catalog already pins. For `ActivityWatch/activitywatch` it returns `d0a1fa1482eea82e19510e7920cbe3a03e41f691`, byte-identical to the `blob_sha` in `directory/license-evidence.json`. Evidence can therefore be pinned exactly as `CURATION.md` step 1 requires, with `/repos/{repo}/contents/` as a fallback when the licence endpoint reports none.

## Non-goals

The routine never proposes a family, role, trait, score, `source_model`, confidence, or editorial prose. It never promotes a candidate, never writes an exclusion, and never edits any file except `directory/candidates.json`. It does not replace the weekly GitHub Actions refresh, which remains the only thing that discovers candidates.

## Decisions

### 1. Evidence, not conclusions

The routine's output is evidence and routing. Concretely, for each candidate it may record: a verdict routing the candidate, the rule that verdict turns on, the decision that holds it when held, a prose finding, and cited evidence. It may not record anything that appears in `CURATION.md`'s "Human review owns" list.

The boundary is enforced mechanically, not by prompt discipline — see decisions 3 and 6.

### 2. An optional `triage` block on a candidate

Added to the candidate record in `directory/candidates.json`. Absent on every existing record, so nothing breaks and no migration is needed.

```json
"triage": {
  "verdict": "held",
  "rule": "CURATION.md § Scope boundaries — a process layer over a host harness is undecided",
  "held_by": "BACKLOG.md — agent skill packs",
  "finding": "One paragraph of what was found, quoting the sources cited below.",
  "evidence": [
    {
      "label": "LICENSE",
      "url": "https://github.com/owner/name/blob/main/LICENSE",
      "kind": "git_blob",
      "blob_sha": "12597231b2c37fef747a2e39df55cccba71c3ceb",
      "immutable_url": "https://api.github.com/repos/owner/name/git/blobs/12597231b2c37fef747a2e39df55cccba71c3ceb",
      "content_sha256": "<64 hex>",
      "fetched_at": "2026-09-04"
    }
  ],
  "proposed_at": "2026-09-04",
  "proposer": "candidate-triage"
}
```

`verdict` is one of:

- `out_of_scope` — fails a family or role boundary, is a duplicate, or is a non-operational research input. This is a *proposed* exclusion; moving the record to `directory/exclusions.json` remains a human act.
- `held` — in scope but blocked on an undecided question. Requires `held_by`.
- `review_ready` — nothing blocks a human review, and `finding` carries the dossier.

`proposer` marks the block as agent-authored, so a reader can always tell a proposal from a human conclusion. The routine never overwrites an existing `triage` block, whoever wrote it; re-triaging its own earlier proposals is deliberately out of scope for a first version.

### 3. Item 12's second shape: family and role may be null when held

`proposed_system_family` and `proposed_primary_role` may be `null` when — and only when — `triage.held_by` is set. This lets a record awaiting a collection that does not yet exist wait in the queue instead of having nowhere to go, which is the Liquid AI case named in backlog item 12. With `held_by` absent, both fields remain required and must be a compatible pair exactly as today.

### 4. Validator rules

`scripts/validate_directory.py` currently requires exact field-set equality for candidates. That becomes a required/optional split mirroring `PROJECT_REQUIRED` / `PROJECT_OPTIONAL`, which already exists in the same file, with `triage` as the only optional field. Added to `validate_candidates`:

1. When `triage` is present its field set is exact, `verdict` is one of the three values, and `held_by` is present **if and only if** `verdict` is `held`.
2. Every evidence entry carries an HTTPS `url`, an ISO `fetched_at`, and a 64-hex `content_sha256`. A `git_blob` entry additionally carries a 40-hex `blob_sha` and the canonical `https://api.github.com/repos/{repo}/git/blobs/{blob_sha}` immutable URL, reusing `SHA_PATTERN` and the immutable-URL rule already applied to license evidence.
3. `finding` may not contain a taxonomy identifier. Matching is against ids from `directory/taxonomy.json` (`agent_framework_sdk`), never prose, so quoting a README that says "agent framework" stays legal. This turns decision 1's boundary into a check that fails CI.
4. Family and role are null-permitted exactly as described in decision 3.

### 5. `scripts/build_candidate_evidence.py`

Deterministic, no judgment, no Claude. For each selected candidate it:

- reads `directory/candidates.json` and selects candidates with no `triage` block, bounded by `--limit`;
- carries forward any `triage` block from a previous unmerged run (decision 8) as JSON, so prior work is never redone;
- fetches repository metadata, the licence via `/repos/{repo}/license` with `/repos/{repo}/contents/` as fallback, the README, and the declared homepage, recording a `content_sha256` for each document;
- cross-checks the repo, id, and URL against `projects.json`, `exclusions.json`, `specifications.json`, `inference-services.json`, and `local-runtimes.json`, reporting every hit;
- records cheap class signals from name, topics, and description — the `awesome-second-brain` shape that reached the queue on 2026-09-03 despite `EXCLUDED` in `update_directory.py`;
- writes a bundle to a gitignored path in the run's worktree: compact per candidate for triage, with full documents only for candidates that reach dossier depth.

It reuses `github_get` from `scripts/update_directory.py` for retry, timeout, and transient-code handling rather than reimplementing them, and exits non-zero when GitHub is unreachable or rate-limited, before any agent work begins. The token comes from `gh auth token`; no secret is stored.

### 6. Guards and in-run verification

Four mechanical guards, each of which aborts the run without committing:

1. **Blast radius.** After the judgment step, `git status --porcelain` must show `directory/candidates.json` and nothing else. A stray edit to `projects.json` aborts. This enforces the human/automation boundary without relying on the prompt.
2. **Fabrication.** `--recheck` re-fetches every cited URL and compares `content_sha256` and `blob_sha`. A 404 or a mismatch aborts and names the offending citation. A scheduled task retains its tools, so nothing *prevents* an invented citation; this detects one before it reaches the branch.
3. **Validation.** `validate_directory.py` and the full test suite must pass.
4. **Reachability.** Handled in decision 5: the harness fails before the agent runs.

### 7. Orchestration is two commands

`prepare` builds the worktree and runs the harness. `finish` runs the four guards, the validator, the tests, and the commit. The routine prompt does judgment between them. Everything mechanical lives in tested code rather than in agent improvisation.

### 8. Delivery: a local branch, never pushed

Each run works in a git worktree built fresh from `origin/main`, so it never touches a working tree and never contends with the refresh. It commits to a local branch and notifies; nothing is pushed.

Unmerged work from a previous run is carried forward **as JSON data, not as a git operation** (decision 5). A text rebase of a 1,600-line pretty-printed JSON file can conflict; a key-by-key carry-forward cannot.

### 9. Ownership

GitHub Actions discovers and appends new candidates. The routine triages existing ones. Because the refresh preserves existing candidate dicts verbatim, and the routine only ever adds a `triage` block to a candidate that already exists, the two never write the same field.

### 10. The routine prompt lives in the repository

`docs/routines/candidate-triage.md` is the canonical prompt — the most safety-critical prose in this design, and therefore reviewable in git. An install step syncs it to `~/.claude/scheduled-tasks/candidate-triage/SKILL.md`, and a test asserts the two match so what runs cannot drift from what was reviewed.

Scheduled for Tuesday morning local time, after Monday's refresh. Scheduled tasks run while the desktop app is open and catch up on next launch if it was closed.

### 11. ADR 023

`docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md` records the decision that a triage block is gathered evidence and a routing proposal, never an editorial conclusion, and that accepting one remains a human act.

### 12. Tests

- **Validator rules** in `tests/test_validation_policy.py`, using the class-cached catalog fixture: block optional; exact field set; `held_by` if and only if `held`; evidence shape; `finding` rejects taxonomy ids; null family and role allowed only when held.
- **Harness and recheck** in a new `tests/test_candidate_evidence.py`, with an injected getter exactly as `tests/test_update_directory.py` does — fully offline. Covers selection, `--limit`, cross-collection duplicate detection, class signals, carry-forward, licence fallback, and non-zero exit when GitHub fails.
- **Guards**: the blast-radius check rejects a diff touching `projects.json`; the recheck fails on a hash mismatch and on a 404.
- **Prompt drift**: the installed task matches `docs/routines/candidate-triage.md`.

The agent's judgment is not unit-testable. Everything around it is.

## Implementation phases

1. Schema and validator: `triage` block, null family/role when held, the four rules, and their tests. Ships independently and is useful on its own — a human can write a triage block by hand.
2. ADR 023, `DATA_MODEL.md`, `CURATION.md`, `AGENTS.md` routing, and closing `BACKLOG.md` item 12.
3. `build_candidate_evidence.py` with `--limit` and `--recheck`, and its offline tests.
4. Orchestration (`prepare` / `finish`) and the four guards, with tests.
5. `docs/routines/candidate-triage.md`, the install step, and the drift test.
6. `OPERATIONS.md` runbook for reviewing and accepting a triage batch.

## Verification

Every command in `AGENTS.md` plus `uv run ruff check scripts tests` and `npm run lint:js`. Beyond the suite:

- A dry run against the real queue producing a branch whose diff touches only `directory/candidates.json`.
- Deliberate fabrication: hand-edit a citation's `content_sha256` and confirm `--recheck` aborts and names it.
- Deliberate overreach: hand-edit a `finding` to contain a taxonomy id and confirm validation fails.
- Confirm a run leaves the main working tree and `origin` untouched.

## Risks and open questions

- **Judgment quality is unmeasured.** The guards prove a citation is real and that the routine stayed inside its lane. Nothing proves a verdict is *right*. Treat early batches as suggestions and check the sources, not the conclusions.
- **Queue arithmetic.** Triage covers the whole untriaged queue each run, but dossiers are capped at roughly six. If the share of `review_ready` candidates is high, dossiers become the new bottleneck. The caps are flags, and the first few runs should be used to size them.
- **A held candidate can outlive its holding decision.** Nothing yet re-opens a `held` candidate when the backlog item that gates it is closed. Deliberately out of scope here; worth a follow-up once `held_by` values exist to point at.
- **`held_by` is free text.** Making it a checked reference to an ADR or backlog anchor would be better, and is deferred until there is a stable anchor format to check against.
