# ADR 025: Model releases are independent curated records

- Status: Accepted
- Date: 2026-09-04

## Context

The Atlas can already represent systems that use models, managed services that serve them, and local runtimes that execute them. None of those record units can answer a separate procurement question: what terms and deployment paths govern an identifiable underlying model release?

Putting models into `system_family` would compare artifacts with operational products. Putting them into Inference Services would merge a model with each service and contract through which it can be called. Putting them into Local Runtimes would merge the executable artifact with the software that loads it. Recording a developer or lab instead of a release would collapse differently licensed versions, sizes, and modalities into one unstable company record.

models.dev now publishes provider-independent model metadata separately from provider endpoint data. It is broad enough to support discovery, but its metadata is community-maintained and sparse in fields such as licenses. Importing it directly into the published Atlas would erase the line between automated observation and reviewed editorial conclusions.

## Decision

Create Models as a fifth canonical record collection and a sibling top-level web view.

The record unit is one provider-independent model release. Models remain outside `system_family`, system roles, Specifications, Inference Services, Local Runtimes, and the mixed Directory union. A record explicitly names the adjacent APIs, hosts, runtimes, quantizations, fine-tunes, and applications it does not represent.

Use models.dev as an automated discovery source by resolving its Git ref to a full commit, importing only `models/**/*.toml` from the pinned archive, and preserving selected facts under `source_metadata`. Provider-specific metadata, benchmarks, and prices are excluded. Automated records remain in unpublished `model-candidates.json`; automation may not publish or edit human-owned fields.

Publish only fully reviewed models in `models.json`. Each record carries authoritative identity and license evidence, one source-model classification, distribution modes, editorial boundary prose, and a dedicated `model_access` score. The score covers license clarity, artifact availability, deployment portability, serving reach, lifecycle transparency, and documentation provenance. It excludes model quality, benchmark results, parameter counts, current prices, latency, throughput, popularity, and safety rankings.

Allow comparison only among records sharing `model_access`. Model record and comparison URLs use the `model:` kind, and static share pages use `web/records/models/<id>/`.

## Consequences

- The same model can relate to several inference services and runtimes without merging their operational or contractual boundaries.
- Public weights and upstream license labels remain discovery facts until human review establishes their scope and source-model classification.
- Candidate volume can grow automatically while published claims remain bounded by evidence review.
- The Atlas accepts a new taxonomy, validation, UI, documentation, attribution, and maintenance surface.
- The collection cannot answer which model is most capable or cost-effective; users need workload-specific evaluations and current provider information for those questions.
