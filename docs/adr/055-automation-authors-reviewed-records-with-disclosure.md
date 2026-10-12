# ADR 055: Automation authors reviewed records under disclosure

**Status:** Accepted 2026-10-12, owner-directed. Replaces the human-only authorship of editorial fields (AGENTS.md rule 8) and the automation bar in [ADR 024](024-candidate-triage-proposals-are-unaccepted-evidence.md).

## Context

Every classification, prose passage, score, evidence pin, and review flag required a human hand. With hundreds of candidates queued and a scale goal of 1,001 cataloged systems, the owner is the bottleneck: full human review of every field slows everything down. The owner directs that automation takes over authorship, keeps verification rigorous on the machine side, checks a sample themselves, and discloses the arrangement to readers.

## Decision

1. **Scope: all collections and fields.** Automation may author classifications, prose, scores, evidence pins, confidence, trust records, reviewed flags, and `verified_at` in every collection.
2. **Machine verification, extensive.** Every automation-authored record passes the same gates a human review passes: first-party reads only, the two-fetch and pin rules unchanged, validator green, full test suite green, `regenerate.py --check` green, and an adversarial second pass against the applicable gate (recorded in the pull request body) that tries to reject the record before it is filed.
3. **Human verification, sampled.** The owner reviews a sample instead of every record. Batches name their sample and its outcome in the pull request.
4. **Disclosure, complete.** Every automation-authored record carries an explicit authorship statement in its own prose, visible wherever the record renders: "Reviewed by automation under ADR 055 with human spot-checks; verify against the cited evidence." No silent machine judgments.
5. **What does not change.** Evidence still comes only from first-party pages; inclusion gates and score profiles are unchanged; attention sources stay pointers, never claims; the Pages deploy still requires a green verify run.

## Consequences

- AGENTS.md rule 8 now states the ADR 055 default: automation-authored with disclosure. Human ownership now means the owner's spot-check regime and this ADR, not per-field authorship.
- Standing "human review" and "human-owned" lines across `docs/` (review-field definitions, disposition files, license-review resolution, trust records) are read under this ADR: reviewed means reviewed under these verification and disclosure terms, by automation unless a record states otherwise. Scattered rewording follows in later grooming instead of one noisy sweep.
- ADR 024's bar on automation proposals is lifted for records authored under this ADR's verification and disclosure. Triage `finding` blocks may now carry classification proposals, still never as accepted conclusions until the gates pass.
- Backlog prose that restates the old bar (e.g. the Typed judgments preamble) needs reconciliation in a later grooming pass.
- A schema-level authorship flag is deferred; prose disclosure renders on every surface today, which a new field would have to earn separately.
