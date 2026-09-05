# Design: Screen the robotics boundary before deciding it

**Date:** 2026-09-04
**Status:** Proposed

> **This spec contains no findings, by design.** Every other spec in this directory
> has an Evidence section because screening ran before the design was written. Here
> the screening *is* the deliverable. What follows defines the sweep, the evidence
> rules, and the decision rule the evidence will be read against — fixed in advance,
> so the rule cannot be tuned to the result it produces.

## Problem

The Atlas has no position on robotics. Across `docs/` and `directory/`, the only
mentions are `robots.txt` in two operational documents, two topic tags and one
product description in `directory/candidates.json`, and a single entry in
`directory/model-candidates.json`. Nothing has been screened, excluded, or held.
The category is growing and the next sweep that meets it will decide from scratch.

Four facts frame the decision.

1. **The agent taxonomy cannot express embodiment.** `execution_boundaries` is
   `{host, container, external_sandbox, remote_cloud, framework_defined}` and
   `agent_capabilities` is `{code_editing, shell_execution, browser_control,
   research, multi_agent, persistent_state, mcp, workflows}`. Neither has a value
   for perception or actuation.
2. **The specification collection has the same gap.** All ten
   `specification_scopes` values describe agent-to-software boundaries, and
   [`docs/SPECIFICATIONS.md`](../../SPECIFICATIONS.md) bounds the collection to
   contracts "between agents, tools, clients, users, repositories, or extension
   packages." Robots are not in that enumeration, and the same document refuses
   "a general transport, serialization format, or API description language solely
   because an agent uses it" — a live objection to robotics middleware that
   predates agents.
3. **The Models collection has a narrower version of the gap.** `model_types` is
   `{language_model, multimodal_language_model}` and `model_modalities` is
   `{text, image, audio, video, pdf}`. An embodied-*reasoning* model that emits
   text is already expressible; an action-emitting policy is not. One such
   candidate is already queued — `google/gemini-robotics-er-1.6-preview`, whose
   output modality is `text` — the sole robotics-adjacent entry among 351 model
   candidates.
4. **Therefore the robot-software, robotics-specification, and robot-model
   questions are not independent.** All three reduce to one upstream question:
   *is the agent-to-physical-world boundary in scope for the Atlas at all?*

Each gap is the nanobrowser situation already recorded in `BACKLOG.md`: a real
property with no identifier, where [ADR 017](../../adr/017-local-runtime-eligibility-ignores-modality.md)
makes extending the vocabulary the remedy rather than distorting the
classification — and makes that extension an obligation discharged in the same
change that admits the record.

## What this screening feeds

A later ADR, written from the output of this sweep and not before it. That ADR
must clear bars this project has already set for exactly this move.

From [ADR 023](../../adr/023-autonomous-science-systems-are-not-a-role.md), the
standing test for minting a role, all three required simultaneously:

1. three or more systems that each pass the full five-condition inclusion gate in
   [`docs/CURATION.md`](../../CURATION.md);
2. a shared operational outcome that no existing role names; and
3. a distinguishing property establishable from first-party evidence **without
   reading source**, so the boundary applies equally to open and closed systems.

From [ADR 013](../../adr/013-distinct-collections-share-one-directory-surface.md),
additionally required for a new collection: an explicit schema, an explicit
boundary, and an explicit comparison policy. [ADR 015](../../adr/015-local-runtimes-are-self-operated-execution-records.md)
adds that a further collection needs its own decision record and that the
existence of the last one is not a precedent for admitting adjacent software by
analogy. Note the count: with
[ADR 025](../../adr/025-model-releases-are-independent-curated-records.md)
publishing Models, the Atlas already has five collections — systems,
specifications, inference services, local runtimes, and models. Robotics would be
the sixth, and ADR 015's warning applies with more force, not less.

Two further constraints apply and are not negotiable by this sweep:

- **`AGENTS.md`:** "Architecture, retrieval, deployment, and agent traits are not
  primary roles." ADR 023's gloss: "a role named after a mechanism is a trait axis
  wearing a role's name."
- **[`docs/COVERAGE.md`](../../COVERAGE.md):** "Do not add a new family merely to
  fit a famous product."

## Scope of the sweep

Five classes, 15–25 candidates total. The class list is the unit of coverage; the
count is a budget, not a target.

| Class | Screening question |
|---|---|
| Robot software stacks and embodied-agent frameworks | Does any pass the five-condition gate, and can an existing agent role hold it? |
| Policy and action models | Does the Models collection's boundary reach an action-emitting policy, and what `model_types` or modality identifier would it need? |
| Simulation and benchmark environments | Does the ADR 015 substrate test exclude them, and is serving-versus-building the right analogue? |
| Commercial robot products and fleets | Is there an adoptable artifact and authoritative terms, or only vendor claims? |
| Robotics interchange contracts | Does any define a reusable contract at a boundary the specification scopes could name? |

Class membership is a screening frame, not a proposed classification. A candidate
may be dispositioned into a class other than the one it was swept under.

## Method, per candidate

1. Identify the reviewable unit: software, hosted service, model artifact, spec, or
   hardware. Name it before assessing it.
2. Test it against the five-condition inclusion gate in `CURATION.md`. Record which
   condition fails first, if one does.
3. Test whether an existing role or collection holds it. If none does, state which
   comes closest and precisely what it fails to name. "Nothing fits" is not a
   finding; "no record type names outcome X" is.
4. Apply the source-independence test explicitly: is the distinguishing property
   visible in first-party documentation, or only by reading the tree? Record the
   answer even when it is inconvenient.
5. Gather first-party evidence to the triage schema below.

## Evidence rules

These are the rules the triage harness already enforces, applied by hand here.

- Each evidence entry carries `label`, `url`, `kind` (`git_blob` or `web`),
  `content_sha256`, and `fetched_at`; `git_blob` evidence additionally carries
  `blob_sha` and a matching `immutable_url`.
- Every URL is fetched and verified directly. A summary from a subagent is a lead,
  never evidence; a 404 is the cheapest tell that a citation was invented.
- A `finding` states what was observed. `scripts/validate_directory.py` rejects a
  finding naming any `system_family` or `primary_role` taxonomy id, and that
  constraint is the point: the sweep reports evidence, not classification.
- Vendor claims about a vendor's own system are evidence of the claim, not of the
  behavior — the treatment ADR 023 gave Kosmos's self-authored preprint.

## Outputs

1. **Every screened candidate lands in a machine-readable file.** Held and
   review-ready candidates go to `directory/candidates.json` with a `triage` block;
   out-of-scope candidates go to `directory/exclusions.json`. Coverage batch 38
   made this explicit — "every candidate screened here is recorded in a
   machine-readable file rather than in this note alone" — and this sweep inherits
   it. Nothing is dispositioned in prose alone.
2. **Held candidates carry `triage.held_by`** set to the exact string
   `robotics scope decision` — one stable value across the batch, so the held set
   is greppable before an ADR number exists. Their `proposed_system_family` and
   `proposed_primary_role` are null, which `validate_directory.py` permits only
   while `held_by` is set. This is the first real use of the mechanism #94 built.
3. **One `BACKLOG.md` item** naming the open decision, as
   [`docs/OPERATIONS.md`](../../OPERATIONS.md) requires for an accepted `held`
   verdict, so the question stays visible outside the queue.
4. **One `docs/COVERAGE.md` research-batch note** recording the sweep, its
   dispositions, and its sharpest finding.

No records are published. No vocabulary is extended. No ADR is written.

## The decision rule, fixed in advance

Each row states what the *later ADR* would record, not what this sweep does.

| Evidence | Conclusion the ADR records |
|---|---|
| Fewer than three systems pass the five-condition gate | No role, no collection. Route to existing roles; extend traits only where a published record needs an identifier. |
| Three or more pass, each held by an existing agent role | Trait-vocabulary extension only, under the ADR 017 obligation. Records publish under existing roles. |
| Three or more pass, sharing an outcome no existing role names, distinguishing property visible without reading source | Propose a role, subject to ADR 011's comparison-set condition. |
| All of the above, and the record unit cannot share the project schema or score profile | Propose a sixth collection, subject to ADR 013's three conditions and ADR 015's rule against admitting by analogy. |
| An action-emitting policy passes the gate but no `model_type` or modality names it | The vocabulary extension is part of that ADR, discharged in the same change per ADR 017. |
| Robotics contracts define a reusable boundary the specification scopes cannot name | The scope extension is part of that ADR, not a records decision. |

## Verification

The sweep changes only `directory/candidates.json`, `directory/exclusions.json`,
`docs/COVERAGE.md`, and `BACKLOG.md`. Required before claiming completion:

```
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run ruff check scripts tests
```

Candidates are unpublished, so no share-page or web rebuild is implicated. If any
exclusion is written, `sync_web_data.py` runs because `exclusions.json` is
published. Nothing in this sweep touches `models.json`, which is published and
would otherwise pull in share-page regeneration.

## Risks, and what this does not decide

- **The source-independence test may fail the whole category.** Closed humanoid
  stacks publish demos; open robotics stacks are frequently research code. If the
  distinguishing property is legible only by reading a tree, ADR 023's third
  requirement is unmet, and the honest outcome is the trait-extension row — the
  same trap that "convicts the inspectable and acquits the opaque."
- **Class-frame bias.** Sweeping by five predefined classes risks confirming the
  frame. Mitigated by allowing cross-class disposition and by requiring the
  first-failing gate condition to be named rather than a verdict asserted.
- **A famous-product pull.** Humanoid vendors are the most visible members and the
  least likely to pass condition 4. `COVERAGE.md`'s rule against adding a family to
  fit a famous product is the check, and it is cited here so the later ADR cannot
  quietly drop it.
- **The models discovery source is not a robotics source.** One robotics-adjacent
  entry in 351 model candidates is a fact about models.dev's coverage, not about
  the field. Absence there is not evidence of absence in the world, and this sweep
  must not read it as such.
- **This decides nothing about robotics.** It produces the evidence a decision
  needs. A sweep that concludes "no change" is a successful sweep.
