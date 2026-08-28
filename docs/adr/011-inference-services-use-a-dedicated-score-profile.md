# ADR 011: Inference services use a dedicated score profile

**Status:** Accepted

## Context

ADR 010 separated managed inference services from models, companies, local runtimes, and scored operational systems. It initially left the collection unscored because model quality, latency, throughput, and price vary by model, region, tier, contract, and time. That exclusion remains correct, but it does not prevent comparison of more stable service-level properties.

Users choosing where inference runs still need to compare documented production controls, data governance, regional placement, serving modes, interoperability, traffic resilience, customization, and transparency. These properties belong to the represented service boundary and can be reviewed without converting the Atlas into a volatile model leaderboard.

[NIST's cloud-service metrics work](https://www.nist.gov/publications/cloud-computing-service-metrics-description) emphasizes representative, reproducible service properties for informed cloud choices, while the [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) emphasizes governance, resilience, privacy, transparency, and documentation. The Atlas profile is an editorial application of those general principles, not a claim of NIST certification or a substitute for workload testing.

## Decision

Assign every reviewed inference service the dedicated `inference_service` score profile. Scores run from 0 to 10 and use the following weighted dimensions:

- operational maturity: 17%;
- data governance: 18%;
- regional and deployment control: 14%;
- serving flexibility: 13%;
- API interoperability: 12%;
- traffic resilience: 10%;
- customization and lifecycle: 9%; and
- documentation transparency: 7%.

The overall is the weighted sum rounded to two decimals. Dimension values use the common anchors documented in `docs/INFERENCE_SERVICES.md` and must be supported by the record's dated authoritative evidence. Missing public evidence lowers the relevant dimension; private assurances are not inferred.

The score evaluates the managed operational service—not its parent company, underlying model intelligence, catalog prestige, current price, benchmark rank, or theoretical hardware performance. Scores are comparable only inside the inference-service collection and remain a starting point for workload-specific evaluation. Classification filters remain first-class because a lower-scoring specialist can be the correct fit for a particular API, region, model source, or deployment mode.

## Consequences

- Direct APIs, cloud platforms, managed hosts, and routers share one type-neutral operational rubric.
- The inference-services scope of the Directory may sort services by overall score and displays all dimension values and definitions; mixed browsing hides the score under ADR 012.
- Model quality, latency, throughput, uptime, and price remain outside the score unless stable, independently supportable service-level evidence is added through a future decision.
- Changing a dimension or weight requires a taxonomy and documentation change plus recomputation of every inference-service score.
- New services require a complete score at promotion; automation may not change editorial scores.
- Specifications remain unscored artifacts under ADR 008.
