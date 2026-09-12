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

## Scoring

Inference services use one dedicated operational-service profile. It is comparable only inside this collection; it is not comparable to memory, agent, or assistant scores. The profile deliberately does not score model intelligence, benchmark results, current price, raw latency, token throughput, or the prestige of a catalog. Those properties are model-, workload-, region-, tier-, and time-specific.

| Dimension | Weight | What earns a high score |
|---|---:|---|
| Operational maturity | 17% | Documented production controls, stable lifecycle practices, administration, support, capacity isolation, and a credible sustained-service surface |
| Data governance | 18% | Explicit retention and training-use rules, deletion or zero-retention controls, tenant isolation, and clear exceptions for stateful features |
| Regional and deployment control | 14% | Customer-selected processing geography, regional endpoints, private networking, and isolated or dedicated placement with explicit boundaries |
| Serving flexibility | 13% | Complementary on-demand, batch, reserved, dedicated, priority, and scaling paths rather than one undifferentiated endpoint |
| API interoperability | 12% | Well-documented native or compatible contracts, SDK portability, and low-friction movement across supported integration paths |
| Traffic resilience | 10% | Explicit fallback, regional capacity routing, replicas, traffic steering, priority controls, or recovery behavior |
| Customization and lifecycle | 9% | Fine-tuning, customer models, version pinning, deployment configuration, and lifecycle control for supported artifacts |
| Documentation transparency | 7% | Specific, current, authoritative documentation for terms, data handling, regions, availability, limits, and exceptions |

Score each dimension from 0 to 10 using common anchors:

- **0–2:** absent, non-operational, or too opaque to support a useful claim;
- **3–4:** minimal capability or public evidence, with major limitations;
- **5–6:** a documented baseline with material gaps or plan-specific uncertainty;
- **7–8:** strong production capability with clear controls and bounded exceptions; and
- **9–10:** unusually comprehensive, explicit, and mature coverage of the dimension.

Use decimal values when evidence falls between anchors. Missing evidence lowers the relevant score; never substitute company reputation or an adjacent product's controls. Compute `overall` as the weighted sum rounded to two decimals. A specialist service can be the right workload fit even when its overall is lower, so service type, model source, API style, region, and delivery-mode filters remain primary decision tools.

## Evidence and freshness

Use authoritative service documentation and governing service terms. Every mutable source carries `verified_at`. State feature-specific exceptions in prose rather than compressing them into a misleading boolean. In particular, retention, residency, capacity, and availability often vary by endpoint, model, region, feature, or negotiated agreement.

Do not copy per-token prices, rate limits, exhaustive model inventories, or benchmark results into the curated record. Link the official service documentation and describe only the stable decision boundary. Future automation may refresh clearly identified live metadata, but it must never rewrite editorial boundary prose or infer a service-wide conclusion from one endpoint.

## Trust record

A trust record is an optional, unscored, human-owned block that says whether the operator documents six properties, and lists dated third-party findings about the named service. It never enters the score. [ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md) is the governing decision.

| Property | `documented_yes` means the operator publishes… |
|---|---|
| `response_integrity` | a mechanism by which a client can verify a response, including a tool call, arrived from the upstream model unaltered: a signature, an attestation, or an equivalent. |
| `upstream_disclosure` | the parties that receive request plaintext: the operator alone for a direct API; the upstream or subprocessor list for an aggregator or platform. |
| `credential_handling` | how customer-supplied upstream keys are stored and whether they are encrypted at rest. A service whose documentation offers no such path is `documented_no`, with a note citing the documented request path. |
| `cache_isolation` | whether prompt caching is scoped per customer or pooled behind shared upstream credentials. |
| `vulnerability_disclosure` | a public security contact or disclosure policy for the named service. |
| `independent_audit` | a SOC 2, ISO 27001, or equivalent attestation for the named service, recorded as an operator claim the Atlas does not read or judge. |

`documented_no` means the operator publishes a statement denying the property or stating it does not apply. `undocumented` means no first-party statement was found on the review date. The line between them is a judgement: a privacy policy that never mentions caching is `undocumented`; one that says caches are not isolated is `documented_no`. The note quotes the sentence that decided it. Every `url` is first-party and public — gated portals are ineligible — and scoped to the named service; a company-wide attestation that does not name the service earns `undocumented` with a note. Where existing prose already states the fact, the prose stays and the property cites the same source.

A finding is admissible when the source names the service, states a method a reader could repeat or an incident the operator has acknowledged, carries a publication date, and can be pinned: a version-specific arXiv URL, a CVE or advisory record, a DOI, or a first-party disclosure page, with its content hash taken at review. News coverage, social posts, and summaries of others' work are pointers, never findings; follow them to their source. A finding says nothing its source does not say. It is never deleted; close it with a dated `resolved` source. A finding that bears on a scored dimension is a review trigger: re-read that dimension against the operator's evidence and the finding, and advance `verified_at`.

An empty findings list on a reviewed record means "reviewed, no admissible finding recorded". It is never evidence of safety, and the app says so.

## Coverage discovery

No one external directory defines the Atlas universe. Use several current discovery sources because each counts a different unit:

- provider routers describe the upstream operators reachable through that router;
- inference-client adapter lists mix managed services with gateways, local runtimes, and compatibility aliases;
- model hubs list their integrated inference partners rather than the whole market; and
- benchmark directories count model endpoints, which can produce many rows for one operational service.

Build the discovery union, normalize aliases to a named service boundary, and then apply the inclusion test above. Use third-party or ecosystem catalogs only to find candidates. Promotion still requires first-party product documentation and governing terms. Coverage is representative of material operational choices, not a claim that every regional cloud, reseller, white-label endpoint, or transient model host has been enumerated.

For geographically broad batches, explicitly screen direct model developers, hyperscale and regional cloud model platforms, independent managed hosts, and routing aggregators. Do not treat a model's country of origin as the service operator's processing location, and do not infer residency from a company's headquarters.

## Review workflow

1. Establish the exact service and operator boundary.
2. Review current product documentation, data controls, and service terms.
3. Classify type, delivery modes, model sources, and API styles from those sources.
4. Write regional, retention, routing, customization, strengths, and tradeoffs with explicit limits.
5. Score every dimension from the same evidence, calculate the weighted overall, and check that no value imports model quality, price, or unverified performance.
6. Add dated evidence and terms, then run synchronization and the complete verification suite.
7. Optionally review the trust record: answer each of the six properties from first-party pages with a scoped URL and a note quoting the deciding sentence, record any admissible third-party finding with its pinned hash, and set `trust.verified_at`. A service without this step carries no `trust` block and renders as unexamined.
8. Exercise search, every inference-service filter, score sorting, and the detail dialog in a browser.

Inference services use a dedicated score profile and default to score sorting inside their Directory scope. Mixed Directory browsing hides every numeric score. See [ADR 010](adr/010-inference-services-are-unscored-service-records.md), [ADR 012](adr/012-inference-services-use-a-dedicated-score-profile.md), and [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md).
