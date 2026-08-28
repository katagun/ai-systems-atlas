# Inference service curation

Use this guide for managed services that accept model-inference requests. Operational memory, agent, and assistant products follow [`CURATION.md`](CURATION.md); protocols and conventions follow [`SPECIFICATIONS.md`](SPECIFICATIONS.md).

## Inclusion boundary

Add a record to `directory/inference-services.json` only when all of the following are true:

1. a named service exposes a documented operational inference endpoint or managed deployment path;
2. the operator and contractual service boundary are identifiable;
3. authoritative sources establish at least one delivery mode, model-source scope, and API style;
4. regional, retention, routing, and customization claims can be stated without extrapolating from a different product or model; and
5. current service terms and dated product evidence are recorded.

The record represents the service, not its company. OpenAI API and Anthropic API are direct model APIs; Amazon Bedrock and Vertex AI are cloud model platforms; GroqCloud is a managed inference host; OpenRouter is a routing aggregator. Their parent organizations, underlying model releases, end-user chat products, and agent platforms remain separate boundaries.

Do not include a model repository, weights release, benchmark, local runtime, API client, proxy library, observability SDK, playground, or thin prompt wrapper. A self-hosted runtime may warrant a future operational collection, but it is not a managed inference service merely because it implements an API-compatible endpoint.

## Classification

Choose exactly one service type from the taxonomy. Record every reviewed delivery mode, model-source scope, and API style that is material to the represented service.

API compatibility is a documented trait, not an equivalence guarantee. `openai_compatible` means the service claims compatibility with some OpenAI API conventions; it does not imply complete endpoint, parameter, tool, or response parity.

Model-source scope records whose models the service can operate. It does not classify model licenses. “Open-weight” is intentionally not rewritten as “open source,” and customer-supplied support must be documented for the reviewed service path.

## Evidence and freshness

Use authoritative service documentation and governing service terms. Every mutable source carries `verified_at`. State feature-specific exceptions in prose rather than compressing them into a misleading boolean. In particular, retention, residency, capacity, and availability often vary by endpoint, model, region, feature, or negotiated agreement.

Do not copy per-token prices, rate limits, exhaustive model inventories, or benchmark results into the curated record. Link the official service documentation and describe only the stable decision boundary. Future automation may refresh clearly identified live metadata, but it must never rewrite editorial boundary prose or infer a service-wide conclusion from one endpoint.

## Review workflow

1. Establish the exact service and operator boundary.
2. Review current product documentation, data controls, and service terms.
3. Classify type, delivery modes, model sources, and API styles from those sources.
4. Write regional, retention, routing, customization, strengths, and tradeoffs with explicit limits.
5. Add dated evidence and terms, then run synchronization and the complete verification suite.
6. Exercise search, every inference-service filter, and the detail dialog in a browser.

Inference services are always unscored and alphabetically ordered after filtering. See [ADR 010](adr/010-inference-services-are-unscored-service-records.md).
