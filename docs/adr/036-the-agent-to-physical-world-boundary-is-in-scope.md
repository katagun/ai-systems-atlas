# ADR 036: The agent-to-physical-world boundary is in scope

**Status:** Accepted

## Context

The 2026-09-04 screening spec reduced three open questions — robot software, robotics specifications, and robot models — to one upstream question: "is the agent-to-physical-world boundary in scope for the Atlas at all?" It deliberately did not answer it: "This decides nothing about robotics."

Coverage batch 39 in [`docs/COVERAGE.md`](../COVERAGE.md) ran the sweep. Twenty-three candidates were screened; ten were excluded and thirteen were held under `triage.held_by: "robotics scope decision"`. The batch note then read the evidence against [ADR 023](023-autonomous-science-systems-are-not-a-role.md)'s three-part reopening test, "applied here to embodiment rather than to autonomous science," and concluded that the decision "does not reopen." `BACKLOG.md` carried the result as "Reopen the agent-to-physical-world role only after the three gaps … close."

That reading answered a narrower question than the one the spec asked. ADR 023's test governs minting a primary role; its decision line is "No primary role is added." Whether a domain belongs in the Atlas is decided earlier and by someone else: `AGENTS.md` rule 4 decides inclusion "by the collection's relevance and operational boundary," and what the Atlas is relevant to is the owner's call.

The owner made that call on 2026-09-20: AI systems include AI robots and their hardware, and the Atlas is not limited to software.

A repo-only skeptic was briefed before this record was drafted. It found no ADR or policy text that forbids an owner-level scope decision, and it found four constraints the decision must not be read past. They are recorded below as what this record does not do.

## Decision

The agent-to-physical-world boundary is in scope. A system, model, or product is not outside the Atlas because its output reaches a physical actuator, and it is not outside the Atlas because it is hardware.

The first round is bounded to **AI robots**: robots — humanoids, quadrupeds, arms, mobile manipulators — for which first-party documentation names a learned model or policy that drives the robot's behaviour. The fact is recorded as what the vendor documents, with a research confidence, not as a verified behaviour. A robot's compute, sensors, and actuators are described on the robot's record, not as records of their own.

This record supersedes batch 39's "does not reopen" conclusion as a statement about scope. Batch 39's evidence, exclusions, and findings stand.

### What this does not do

- **It admits nothing.** No record is published, no vocabulary is extended, and no hold is lifted by this record. Each of the thirteen held candidates is re-labelled with the decision that now holds it, as [ADR 032](032-agent-packs-are-unscored-records-of-what-a-host-installs.md) did for pack candidates:

  | `triage.held_by` | Candidates | Decided by |
  |---|---|---|
  | `robot software role decision` | Dora, OM1, LeRobot, openpi, Safari SDK | Full `docs/CURATION.md` review, and the role question put to [ADR 011](011-delegated-work-agents-are-agent-systems.md) and ADR 023 directly |
  | `robots collection decision` | Spot, Unitree G1, Figure, 1X NEO | A collection decision record of its own |
  | `action-policy model boundary` | Isaac GR00T, OpenVLA, Alpamayo | A record amending [ADR 025](025-model-releases-are-independent-curated-records.md) |
  | `robot description specification boundary` | urdfdom | A specifications boundary review |

- **It mints no role.** ADR 023's test and ADR 011's comparison-set condition still govern any new role for robot software. Batch 39's first gap — name an operational outcome rather than a mechanism — stays open and belongs to that review.
- **It is not the Robots collection's decision record.** [ADR 015](015-local-runtimes-are-self-operated-execution-records.md) requires a further collection to carry its own record and forbids admitting by analogy, and [ADR 013](013-distinct-collections-share-one-directory-surface.md) requires an explicit schema, boundary, and comparison policy. Inclusion-gate condition 4 in `docs/CURATION.md` is unmeetable for purchased hardware, which is why hardware needs that record rather than a place in `projects.json`.
- **It does not extend the Models collection.** `docs/MODELS.md` makes text output an eligibility criterion, the validator enforces it, and every reviewed model carries a models.dev `source_id`. An action-emitting policy meets none of the three. Admitting one is an amendment to ADR 025 with its own ingestion path, not a vocabulary addition.
- **It does not reach autonomous vehicles, drones, wearables, robot components, or general AI hardware.** The `commaai/openpilot` and `autowarefoundation/autoware` exclusions already say that whether purpose-built autonomous-vehicle software belongs in the Atlas "is a separate, unresolved question." It remains one. No batch 39 exclusion is reopened by this record.
- **It does not relax `docs/COVERAGE.md`'s rule:** "Do not add a new family merely to fit a famous product." Humanoid vendors are the most visible members of this domain and the least documented; the later records answer to that sentence.

## Alternatives considered

**Wait for batch 39's three gaps to close before deciding scope.** The gaps are conditions on a role. Two of them — licence review through promotion, and the closed-system test — can only be exercised by doing review work that a held queue forbids. Holding scope behind them made the decision wait on work the hold itself blocked.

**Software only, with hardware as a trait on software records.** [ADR 034](034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md) treated where a system runs as a deployment trait, and the analogy is the strongest argument against hardware records. It is left to the Robots collection record to answer, because the owner's decision is that the robot itself is something a reader chooses, and no software record can carry both the model-to-robot and the software-to-robot relationship.

**All AI hardware.** Accelerators and servers are chosen on benchmarks and price, which every Atlas score profile deliberately excludes. That is a different catalog.

## Consequences

- The thirteen candidates stay queued under four named decisions instead of one, and `BACKLOG.md` carries one item per decision.
- Batch 39's third gap — the model-in-the-loop property against opaque commercial systems — is exercised for the first time by the Robots collection's gate, which asks what the vendor's own documentation names.
- A later proposal to widen the domain beyond AI robots is a new scope decision and needs a record of its own.
