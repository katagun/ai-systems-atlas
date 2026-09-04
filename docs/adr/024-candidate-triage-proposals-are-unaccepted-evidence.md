# ADR 024: Candidate triage proposals are unaccepted evidence

**Status:** Accepted

## Context

`BACKLOG.md` recorded that all fifty-three provisional candidates carry `status: "provisional"` and no field naming the open question that gates them, so the held set had to be re-derived from backlog prose on every pass, and that the candidate schema could not queue a record awaiting a collection that does not exist yet because it requires a compatible family and role pair.

A local routine, described in `docs/routines/candidate-triage.md` and orchestrated by `scripts/run_candidate_triage.py`, now sorts the queue on a schedule: it refreshes an isolated worktree from `origin/main`, gathers and hashes evidence with `scripts/build_candidate_evidence.py`, and proposes a disposition for each candidate by adding a `triage` block to it. `scripts/validate_directory.py` enforces the shape of that block. The routine runs unattended against an LLM-driven prompt, so the schema, not the prompt, is what keeps its output from silently becoming an editorial decision.

## Decision

A `triage` block on a candidate is gathered evidence and a routing proposal. It is never an editorial conclusion. It may carry a verdict, the rule that verdict turns on, the decision that holds the record, a prose finding, and pinned evidence. It may not carry a family, role, trait, score, `source_model`, confidence, or editorial prose, and validation rejects a finding that names a family or role id. Accepting a proposal — promoting a candidate, writing an exclusion, or resolving what holds it — remains a human act. Automation may add a block; only a human may act on one.

### The verdict is a proposal, not a status

`verdict` takes one of three values — `out_of_scope`, `held`, or `review_ready` — and each names a proposed next step, not a fact about the candidate. `status` stays `provisional` regardless of `verdict`; nothing in this schema promotes a candidate, writes it to `directory/exclusions.json`, or changes its family or role. `held_by` is required exactly when `verdict` is `held`, so the open question that gates a record is now a field rather than backlog prose, and `proposed_system_family` and `proposed_primary_role` may be null only while `held_by` is set — the second shape the backlog item asked for, a record that can wait for a collection that does not exist yet.

### Evidence is pinned, not asserted

Every evidence item cites a `label`, `url`, and `kind`, and pins a `content_sha256` and `fetched_at` so a later re-fetch can catch drift; `git_blob` evidence additionally pins `blob_sha` and an `immutable_url` addressing that blob, the same pattern license evidence already uses elsewhere in this repository. A finding may quote what a licence or a README says, but validation rejects a finding whose text contains a `system_families` or `primary_roles` taxonomy id, because writing that identifier down is the classification act this ADR reserves for a human.

### What this does not change

- **The review workflow in `docs/CURATION.md` is unchanged.** A `triage` block does not shorten it; it gives the reviewer a dossier to check against its own cited sources before doing that workflow.
- **`directory/exclusions.json` still requires a human write.** An `out_of_scope` verdict proposes an exclusion; it is not one.
- **Nothing here changes `directory/projects.json` or its evidence schema.** The candidate queue is the only surface this decision touches.

## Consequences

- `docs/DATA_MODEL.md` documents the `triage` block's fields, the `held_by` rule, and that `proposed_system_family` and `proposed_primary_role` may be null only while a candidate is held.
- `docs/CURATION.md` states that a triage proposal is evidence and that accepting it is a human act.
- `docs/OPERATIONS.md` gains a runbook for reviewing a triage batch.
- `BACKLOG.md` closes the item asking for a way to record what holds a candidate; both shapes it asked for are now expressible.
