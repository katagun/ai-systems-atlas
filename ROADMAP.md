# Roadmap

This roadmap describes outcomes and sequencing. [`BACKLOG.md`](BACKLOG.md) is the source of truth for executable work; policy and architectural decisions live in `docs/`.

## Current: comprehensive coverage within a declared operational scope

Make the Atlas broad enough to represent important memory, agent, and assistant-system choices without hiding systems because of their source model.

- Separate relevance from licensing: include by operational role and expose source model, licenses, and evidence as filters and labels.
- Compare memory, agent, and assistant products only within their outcome-specific family and score profile.
- Represent model-provider coupling as reviewed traits, never as a system family.
- Review provisional projects in small domain batches, continuing with assistants, managed proprietary platforms, coding agents, source-model diversity, and thin operational roles.
- Measure coverage by operational role, source-model diversity, and meaningful alternatives—not one misleading project total.
- Combine GitHub repository discovery with a conservative allowlist of authoritative vendor feeds so proprietary products can enter the same provisional queue.
- Keep licensing, classifications, scores, and evidence human-owned while automation refreshes only live metadata and opens review signals.
- Maintain an unscored specification collection for the contracts between systems, without treating conventions as products or ranking unlike artifacts.
- Maintain a bounded inference-service collection with a dedicated operational score, surfaced alongside systems in one Directory without treating providers as a fourth system family or ranking model quality, price, and transient performance.
- Maintain a bounded local-runtime collection with a dedicated execution-capability score for software the user operates on their own hardware, keeping managed tiers of a runtime in the inference-service collection and keeping throughput, latency, and benchmark rank out of the score.
- Support side-by-side shortlists only within one score profile, preserving collection-specific decision context and shareable URL state.

Exit signal: every supported role has several meaningful reviewed alternatives where the ecosystem provides them, important vendor ecosystems have no unexplained gaps, priority candidate batches have an evidence-backed disposition, and users can filter by source model, license, and provider constraints without confusing those traits with capability.

## Next: efficient curation

Reduce repetitive review work while preserving deliberate editorial judgment.

- Add guarded candidate-promotion and stale-review reporting commands.
- Make repository transfers, license drift, and link failures explicit, recoverable review events.
- Add accessibility and link checks that fit the dependency-light static site; keep the Pages deployment path validated and reproducible.

Exit signal: routine catalog maintenance is repeatable, evidence-safe, and documented without relying on maintainer memory.

## Later: ecosystem context

Expand the inference-service pilot only when a new record answers a distinct deployment, routing, residency, retention, or procurement question. Keep plain API clients, adapters, observability SDKs, model catalogs, prices, and performance rankings outside that collection unless they receive their own evidence-backed boundary. Local runtimes now have such a boundary under ADR 015; expand that collection only when a record answers a distinct execution, hardware, format, or deployment question.

Decide the treatment of agent skill packs before the class grows further, separating the authoring convention from a skills runtime from a collection of skill documents; only the middle case can own an operational outcome, and adoption does not settle any of them.

Expand the specification collection in question-driven batches. Prefer agent-specific contracts with authoritative version and license evidence; do not absorb every general-purpose web standard used by an agent implementation.

Evaluate additional scored families only when a distinct operational outcome cannot fit the memory, agent, or assistant profiles. The broader AI Systems Atlas brand is permission to grow deliberately, not permission to compare incompatible systems.

Exit signal: evidence of user value justifies the additional model and maintenance surface.

## Delivery principles

- **KISS:** introduce the smallest domain concept that answers a real catalog question.
- **DRY:** keep executable enums and mappings in the taxonomy rather than duplicating them in automation or prose.
- **DDD:** model operational outcomes as families and roles; model source, license, and provider coupling as orthogonal traits.
- **DIP:** pass taxonomy-owned policy into discovery and validation instead of embedding catalog policy in GitHub adapters.
- **TDD:** express each boundary as a failing test before changing behavior.
