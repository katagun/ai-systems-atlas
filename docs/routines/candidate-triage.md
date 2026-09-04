---
name: candidate-triage
description: Sort the Atlas candidate queue and gather pinned evidence, without making an editorial decision
---

Triage the AI Systems Atlas candidate queue, once.

Work from the root of the Atlas checkout — the directory holding
`directory/candidates.json`. Every command below is run from there.

    uv run python scripts/run_candidate_triage.py prepare

`prepare` refreshes an isolated worktree from `origin/main` and prints its path.
Do all of your work in that worktree. It also writes `.candidate-evidence/bundle.json`
there: every fact you are allowed to cite is in that file.

Then, for each candidate in the bundle, add a `triage` block to that candidate in
`directory/candidates.json` — and change nothing else, in no other file.

Finally:

    uv run python scripts/run_candidate_triage.py finish

WHAT THIS IS. An evidence-gathering and sorting pass, not a review. `docs/CURATION.md`
reserves classification, traits, editorial prose, scores, confidence, license evidence,
source model, and `verified_at` for human review, and ADR 024 records that a `triage`
block is gathered evidence and a routing proposal, never an editorial conclusion. A
human decides what your evidence means.

NEVER FETCH ANYTHING. You have no need to: `prepare` already fetched and hashed every
document, and recorded the blob SHA for each licence. `finish` re-fetches every citation you add or change
and compares its `url`, its `content_sha256`, and its `blob_sha` against what the document
actually is, so a citation you did not copy verbatim out of the bundle fails the run. Cite
the bundle and nothing else.

THE SHAPE OF A BLOCK. Validation rejects any field set but this one, exactly. See
`docs/DATA_MODEL.md` for the canonical definition.

A `triage` block has `verdict`, `rule`, `finding`, `evidence`, `proposed_at`, and
`proposer` — plus `held_by`, which is present if and only if `verdict` is `held`, and
forbidden otherwise. Set `proposed_at` to today and `proposer` to `candidate-triage`.

An `evidence` entry has `label`, `url`, `kind`, `content_sha256`, and `fetched_at`. When
`kind` is `git_blob` it also has `blob_sha` and `immutable_url`; when `kind` is `web` it
has neither. Copy every one of those values from the bundle document unchanged.

The bundle's documents also carry a `content` field. That is the document's text, given to
you so you can quote it in `finding`. It is not a citation field: an evidence entry
containing `content` fails validation. Copy the other fields; leave `content` behind.

THE THREE VERDICTS.

- `out_of_scope` — it fails a family or role boundary, duplicates something already in a
  collection, or is a non-operational research input (an awesome list, a benchmark, a
  dataset, a course). Quote the `docs/CURATION.md` clause in `rule`. This is a *proposed*
  exclusion; you never write `directory/exclusions.json`.
- `held` — in scope, but blocked on a question nobody has decided. Name that question in
  `held_by`, citing the `BACKLOG.md` item or ADR. If the record is waiting for a
  collection that does not exist yet, also set `proposed_system_family` and
  `proposed_primary_role` to null — that is the only case where null is permitted.
- `review_ready` — nothing blocks a human review. Here `finding` is the dossier: what the
  licence says, quoted; what the official documentation claims the product does, quoted;
  any cross-collection hit the bundle reports; and the one boundary question the record
  turns on.

WHAT A FINDING MAY NOT SAY. It may not name a `system_family` or `primary_role` id.
Validation rejects a finding containing one, because proposing a classification is the
human's call. Quoting prose that resembles a role is fine; writing the identifier is not.

WHEN A GUARD FAILS. Report what failed and stop. Do not retry, do not work around it, and
do not edit any file to make a check pass. A failed run costs a week; a wrong record in
the catalog costs more.
