# ADR 007: Licenses are classification, not inclusion

**Status:** Accepted

## Context

The Atlas originally admitted only GitHub-hosted systems whose repositories fit one OSI-compatible license scope. That made source inspection and evidence straightforward, but it also made licensing decide whether a relevant system existed in the directory. Mixed-license, open-core, source-available, and proprietary systems disappeared from comparison even when they materially answered the user's question.

The product is a directory of operational memory and agent systems. Relevance and capability should determine inclusion. Licensing should explain what users may inspect, run, modify, and redistribute.

## Decision

- Include a reviewed system when it fits a family and primary role, regardless of source model.
- Record `source_model` separately as `open_source`, `mixed_open_source`, `open_core`, `source_available`, `proprietary`, or `unclear`.
- Record every material license in `licenses`; do not collapse path- or component-specific terms into a misleading single value.
- Allow multiple scoped evidence items per project. Git-hosted evidence pins blobs; non-Git terms link the authoritative reviewed source and explicitly carry weaker mutability guarantees.
- Treat exclusions as scope decisions, not license decisions. Relevant but unreviewed systems belong in the candidate queue.
- A detected license change creates or preserves a license-review incident and marks the evidence stale. It does not remove the system from the default directory or rewrite human conclusions.
- Show source model and license labels in the UI and provide filters for both. Default browsing includes every active reviewed source model.

## Consequences

- Users can compare relevant systems without mistaking source availability for capability.
- Open-source-only discovery remains available as a filter rather than a hidden editorial gate.
- Curation must review component scope and terms more carefully, especially for open-core and hosted products.
- Some proprietary systems will have less inspectable operational evidence; research confidence and evidence kind make that limitation visible.
- ADR 005 remains authoritative for durable queues and human-owned timestamps, but its quarantine-and-hide decision is superseded by this ADR.
