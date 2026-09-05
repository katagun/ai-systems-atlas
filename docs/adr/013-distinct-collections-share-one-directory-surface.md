# ADR 013: Distinct collections share one Directory surface

**Status:** Accepted

## Context

The Atlas originally exposed operational systems and managed inference services as sibling top-level views. Later work added local runtimes and provider-independent model releases with equally distinct boundaries. Preserving separate schemas, filters, evidence, and score profiles is necessary, but splitting discovery across destinations makes substantial parts of the AI-systems catalog easier to overlook and makes “Directory” sound narrower than the product actually is.

Combining the canonical records would create a different problem. A system is classified by outcome, role, licensing, architecture, deployment, and system-family score. An inference service is classified by operator and service traits; a local runtime by self-operated execution traits; and a model release by identity, licensing, distribution, modalities, and access. Their numeric scores answer different questions.

## Decision

Present systems, model releases, inference services, and local runtimes through one Directory browsing surface while preserving their four JSON catalogs as independent canonical collections.

The Directory provides four browsing scopes and one specialist model view:

- **All:** alphabetical discovery across systems, the complete models.dev source catalog, inference services, and local runtimes, with numeric scores hidden;
- **Systems:** the existing family, role, project-trait, status, and family-scoped score behavior;
- **Inference services:** the existing service-type, delivery, model-source, API-style, and inference-service score behavior;
- **Local runtimes:** the existing runtime-type, accelerator, model-format, API-style, and local-runtime score behavior; and
- **Models:** both a visible quick-filter destination and a sibling primary view, combining complete attributed source discovery with reviewed-only `model_access` filters and comparison.

The browser may normalize the four record types into a small presentation-only shape for mixed search and cards. It must not create a shared canonical schema, add services, runtimes, or models to `system_family`, reuse a primary role, combine unlike licensing or terms fields, or rank different score profiles.

Mixed cards identify both the collection and the record's native classification or imported-source status. Collection-specific detail dialogs continue to render the original canonical record; imported model details render only attributed models.dev fields and a commit-pinned source link. The selected Directory scope is represented in the URL so every specialist Directory scope remains directly addressable; the sibling Models specialist view uses the `view` parameter and is also reachable from the quick filters.

The Atlas Finder may guide the operational system, inference-service, and local-runtime collections, but its branches remain schema-specific. System jobs map to family-compatible roles and use only that family's score dimensions. Inference and runtime jobs map to their native types and dimensions. The results and Directory handoff retain the native classification, and no Finder ranking may pool scores across profiles.

Specifications remain a sibling view because they are interoperability artifacts rather than deployable product or service choices.

## Consequences

- One search entry point can discover operational systems, every models.dev source record, managed inference services, and local runtimes without flattening their meanings.
- Inference services no longer require a top-level navigation destination.
- Mixed browsing cannot display or sort by numeric score; users must choose a comparable scope first.
- Filters change with the selected collection instead of exposing controls that do not apply to most records.
- New operational collections can share the Directory only when they retain an explicit schema, boundary, and comparison policy.
- Web tests must cover mixed search, score hiding, scope-specific controls, URL restoration, the Finder handoff, and every record-specific detail dialog.
- Side-by-side evaluation follows ADR 014: selection is available only inside one score profile and never in mixed browsing.
