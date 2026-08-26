# ADR 008: Specifications are unscored artifacts

**Status:** Accepted

## Context

The Atlas needs to explain the contracts that connect agents, tools, clients, repositories, and extension packages. MCP, A2A, AGENTS.md, and SKILL.md are important to system selection, but they are not deployable memory or agent systems. Forcing them into `system_family` would break the operational taxonomy; giving them scores would create meaningless comparisons between wire protocols and Markdown conventions.

## Decision

- Publish specifications in a separate `directory/specifications.json` collection and a sibling web view.
- Classify each artifact by one type, one integration scope, and one publication status.
- Include open standards, evolving community formats, and material vendor-specific conventions; name governance accurately.
- Record current version when the steward publishes one, otherwise use null rather than inventing a release.
- Require authoritative behavior evidence and complete scoped license evidence, with immutable Git blobs where available.
- State what each artifact standardizes and does not standardize.
- Never assign a system family, primary role, score profile, score, or popularity ranking.

## Consequences

- Users can discover interoperability choices without confusing contracts with products.
- The existing family score guarantees remain intact.
- Similar-looking artifacts can coexist when they address different boundaries.
- Curation has a new evidence surface and must distinguish open governance from documented vendor behavior.
- Future specification types and scopes require taxonomy and validator changes, but no new operational score profile.
