# ADR 010: Inference services are unscored service records

**Status:** Amended by [ADR 012](012-inference-services-use-a-dedicated-score-profile.md) and [ADR 013](013-distinct-collections-share-one-directory-surface.md)

ADR 012 preserves this record's service boundary and exclusions but replaces the unscored conclusion with a dedicated operational-service score that excludes model quality, price, and performance rankings. ADR 013 preserves the independent collection while moving it into the shared Directory browsing surface.

## Context

Selecting an operational AI system and selecting the infrastructure that performs model inference are different decisions. The existing `provider_relationship` and `model_backends` project traits describe whether a reviewed system is provider-native, multi-provider, or provider-agnostic. They do not answer where a model is served, which organization operates the endpoint, how requests are routed, what regional and retention controls apply, or whether capacity is on-demand, batch, reserved, or dedicated.

“Provider” is too ambiguous to be the catalog unit. A company may publish models, operate a direct API, resell third-party models, run a cloud marketplace, or route requests to other operators. A model may be served through several unrelated services with different terms and data boundaries. A local runtime can execute the same weights without being a managed service at all.

These products also lack a coherent editorial score. Price, latency, throughput, and model quality vary by model, region, capacity tier, contract, and time. A single provider score would collapse workload-specific facts and become stale quickly.

## Decision

Publish a separate, unscored Inference Services collection.

The unit of curation is a named operational service that accepts model-inference requests under one documented operator and service boundary. Record the service—not the parent company and not an individual model. Examples include a direct model API, a cloud model platform, a managed inference host, or a routing aggregator.

Each record must:

- identify the operator, service type, delivery modes, model-source scope, and API styles;
- state regional, retention, routing, customization, and product-boundary facts in prose;
- distinguish strengths from tradeoffs without producing a numeric score or rank;
- link governing service terms and dated authoritative evidence; and
- avoid claims that apply only to an unreviewed model, region, endpoint, preview, or negotiated contract.

The collection excludes:

- **companies:** an organization is not a record unless a specific service boundary is named;
- **models and model families:** model quality, release history, weights, and benchmark comparisons require a different catalog;
- **local inference runtimes:** Ollama, vLLM, llama.cpp, and similar software are deployable runtimes rather than managed inference services;
- **thin client SDKs and adapters:** a client library is not the operator of the endpoint it calls;
- **agent, assistant, and memory products:** those remain in their scored operational family even when the same vendor operates an inference service; and
- **volatile leaderboards and copied price tables:** the Atlas links authoritative sources instead of presenting time-sensitive rankings as reviewed editorial truth.

Provider traits remain orthogonal project metadata. They may be shown in project details when reviewed, but provider filtering remains deferred until coverage is representative. Inference-service filters operate only inside the service-scoped collection view.

## Consequences

- Users can compare service and deployment boundaries without turning providers into a fourth system family.
- The same model can appear behind several service boundaries without duplicating a company or conflating model ownership with inference operation.
- Specifications, inference services, and operational systems remain distinct collections with distinct inclusion rules; ADR 013 later gives systems and inference services a shared Directory surface.
- Curation must revisit mutable service documentation and terms using explicit verification dates.
- The collection favors stable capability classes and documented constraints over exhaustive inventories, prices, or performance claims.
