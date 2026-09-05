# ADR 014: Comparisons are scoped to one score profile

**Status:** Accepted

## Context

The Directory now discovers operational systems, model releases, managed inference services, and local runtimes in one surface, but their scores answer different questions. System scores are meaningful only inside one outcome-specific family. The inference-service, local-runtime, and model-access scores each apply only to their own record boundary. A generic comparison basket would make unlike numeric values look interchangeable and would weaken the editorial meaning of every rubric.

Users still need a faster way to evaluate a shortlist without opening several detail dialogs or manually aligning score dimensions, licensing, deployment, governance, and tradeoffs.

## Decision

Provide a comparison workflow for two to four records, with eligibility determined by score profile:

- systems can be selected only after one system family is chosen, and every selected system must use that family's score profile;
- inference services can be selected together under the dedicated inference-service score profile;
- local runtimes can be selected together under the dedicated local-runtime score profile;
- Atlas-reviewed models can be selected together under the dedicated `model_access` score profile in the Models view; imported models.dev source rows expose no comparison control;
- mixed Directory results, cross-family system results, and specifications do not expose comparison selection;
- changing to an incompatible Directory scope or system family clears the current selection; and
- comparison state is encoded in the URL and restored only when every referenced record exists and belongs to one compatible profile.

The comparison table renders the published overall score and weighted dimensions without recalculation or reweighting. It also aligns collection-specific decision context: systems expose role, source model, licenses or terms, deployment, architecture, strengths, and watchouts; inference services expose operator and service traits; local runtimes expose maintainer and execution traits; and models expose developer, distribution, modalities, licensing, access strengths, and tradeoffs.

The interface must name the active profile and repeat its boundary. A comparison link may restore and open the selection, but invalid or incompatible identifiers are discarded rather than partially compared.

## Consequences

- Shortlists become inspectable side by side without implying that all Atlas scores share one scale.
- Mixed search remains a discovery tool rather than a ranking surface.
- URL state is durable enough to share or revisit without adding server-side storage.
- The four-record cap keeps the table usable at narrow widths while horizontal scrolling preserves the complete comparison.
- Web tests must cover hidden controls in incomparable scopes, selection limits, profile changes, URL restoration, collection-specific rows, and responsive keyboard-operable dialogs.
