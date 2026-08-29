# ADR 013: Distinct collections share one Directory surface

**Status:** Accepted

## Context

The Atlas originally exposed operational systems and managed inference services as sibling top-level views. That preserved their different record boundaries, filters, evidence, and score profiles, but it also split discovery across two destinations. After the inference-service collection expanded to 36 scored records, a standalone navigation item made a substantial part of the operational catalog easier to overlook and made “Directory” sound narrower than the product actually is.

Combining the canonical records would create a different problem. A system is classified by outcome, role, licensing, architecture, deployment, and system-family score. An inference service is classified by operator, service boundary, delivery, model-source scope, API style, operational controls, governing terms, and its dedicated service score. Their numeric scores answer different questions.

## Decision

Present systems and inference services through one Directory browsing surface while preserving `directory/projects.json` and `directory/inference-services.json` as independent canonical collections.

The Directory provides three scopes:

- **All:** alphabetical discovery across both collections, with numeric scores hidden;
- **Systems:** the existing family, role, project-trait, status, and family-scoped score behavior; and
- **Inference services:** the existing service-type, delivery, model-source, API-style, and inference-service score behavior.

The browser may normalize the two record types into a small presentation-only shape for mixed search and cards. It must not create a shared canonical schema, add inference services to `system_family`, reuse a primary role, combine service terms with project licensing, or rank different score profiles.

Mixed cards identify both the collection and the record's native classification. Collection-specific detail dialogs continue to render the original canonical record. The selected Directory scope is represented in the URL so the systems and inference-service views remain directly addressable.

The Atlas Finder may guide both collections, but its branches remain schema-specific. System jobs map to family-compatible roles and use only that family's score dimensions. Inference jobs map to one service type and use only inference-service dimensions. The results and Directory handoff retain the native classification, and no Finder ranking may pool scores across profiles.

Specifications remain a sibling view because they are interoperability artifacts rather than deployable product or service choices.

## Consequences

- One search entry point can discover operational systems and managed inference services without flattening their meanings.
- Inference services no longer require a top-level navigation destination.
- Mixed browsing cannot display or sort by numeric score; users must choose a comparable scope first.
- Filters change with the selected collection instead of exposing controls that do not apply to most records.
- New operational collections can share the Directory only when they retain an explicit schema, boundary, and comparison policy.
- Web tests must cover mixed search, score hiding, scope-specific controls, URL restoration, the Finder handoff, and both record-specific detail dialogs.
- Side-by-side evaluation follows ADR 014: selection is available only inside one score profile and never in mixed browsing.
