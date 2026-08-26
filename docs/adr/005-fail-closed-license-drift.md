# ADR 005: Fail-closed license drift and durable review queues

**Status:** Superseded in part by ADR 007

The durable-queue and human-owned timestamp decisions remain active. ADR 007 replaces license-gated inclusion and project quarantine with a non-hiding license-review signal.

## Context

GitHub license detection is useful for finding drift but cannot establish repository-wide license scope. Earlier automation wrote candidate and quarantine results to ignored files, left drifted projects active, and refreshed the human editorial verification date alongside live metadata.

## Decision

- Any meaningful detected license mismatch sets the project status to `quarantined`.
- Quarantined projects remain outside the default active UI until a human resolves the review.
- Candidate and quarantine queues are versioned canonical files but are not published to the browser.
- Candidates contain no editorial score or editorial verification date.
- `verified_at` is human-owned; automation uses `metadata_verified_at` and field-specific timestamps.
- Reviewed evidence records both the source path and an immutable Git blob URL.
- The taxonomy owns the curated license allowlist, and validation—not metadata collection—enforces main-directory eligibility.

## Consequences

The directory may temporarily hide a still-eligible project after benign license drift. That false positive is preferable to silently publishing a project whose license scope changed. Queue resolution requires deliberate human review and an atomic update of project, evidence, exclusion, and queue records.
