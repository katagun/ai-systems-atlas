# Roadmap

This roadmap describes outcomes and sequencing. [`BACKLOG.md`](BACKLOG.md) is the source of truth for executable work; policy and architectural decisions live in `docs/`.

## Current: comprehensive coverage and evidence that stays true

Make the Atlas broad enough to represent important memory, agent, and assistant-system choices without hiding systems because of their source model. Coverage build-out has reached the point where adding records is no longer the binding constraint, so a second outcome now runs alongside it: keeping the reviewed claim true as the catalog ages, and keeping the decisions that gate the queue moving.

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
- Publish the complete commit-pinned models.dev source catalog for discovery, visibly separate those automated records from a bounded reviewed Models collection, and reserve access-and-deployability scores for reviewed releases while keeping labs, APIs, hosts, runtimes, applications, quality rankings, benchmarks, parameter counts, prices, and transient performance outside the score.
- Support side-by-side shortlists only within one score profile, preserving collection-specific decision context and shareable URL state.
- Detect evidence decay rather than relying on maintainer memory: link and terms-drift checks must reach every collection, not only the records whose license the repository host can detect.
- Keep editorial age distinguishable from live-metadata age, so a stale review is a visible fact about the record rather than a gap in someone's recollection.
- Make decision debt legible in the data: a queued candidate should name the open question that holds it instead of leaving the held set to be re-derived from prose.
- Settle the treatment of agent skill packs before the class grows further, separating the authoring convention from a skills runtime from a collection of skill documents; only the middle case can own an operational outcome, and adoption does not settle any of them.
- Give every record one review of its own; a shared boilerplate review across several products is a coverage claim the catalog cannot support.

Exit signal: every supported role has several meaningful reviewed alternatives where the ecosystem provides them, important vendor ecosystems have no unexplained gaps, priority candidate batches have an evidence-backed disposition, users can filter by source model, license, and provider constraints without confusing those traits with capability, and no published record's evidence can go stale without raising a signal.

## Next: efficient curation

Reduce repetitive review work while preserving deliberate editorial judgment. The decay-detection half of this phase moved into Current: a directory that cannot say what has rotted has a correctness problem, not an efficiency one.

- Extend the guarded promotion workflow from model candidates to system candidates; model promotion already refuses incomplete editorial, source-model, license, evidence, identity, date, taxonomy, and score fields.
- Make repository transfers and renames explicit, recoverable review events that preserve evidence history.
- Add accessibility checks to the browser end-to-end suite the repository already runs, keeping the shipped application dependency-free; keep the Pages deployment path validated and reproducible.

Exit signal: routine catalog maintenance is repeatable, evidence-safe, and documented without relying on maintainer memory.

## Later: ecosystem context

Expand the inference-service pilot only when a new record answers a distinct deployment, routing, residency, retention, or procurement question. Keep plain API clients, adapters, observability SDKs, model catalogs, prices, and performance rankings outside that collection. Local runtimes have their own boundary under ADR 015, and provider-independent model releases have theirs under ADR 025; expand either only when a record answers its collection's distinct execution or model-access question.

Expand the specification collection in question-driven batches. Prefer agent-specific contracts with authoritative version and license evidence; do not absorb every general-purpose web standard used by an agent implementation.

A separately published, unscored collection of general architecture and safety patterns, in the ADR 008 shape that ADR 021 reserved for research material, is declined under [ADR 022](docs/adr/022-general-pattern-content-is-not-a-collection.md): such patterns have no single authoritative steward to pin evidence to, and a reviewed reference implementation of the idea already shows the result — invented figures presented beside a real citation. An explanatory diagram layer confined to the Atlas's own taxonomy boundaries is a narrower, still-open question; see `BACKLOG.md`.

A vertical role for autonomous scientific-discovery systems is likewise declined, under [ADR 023](docs/adr/023-autonomous-science-systems-are-not-a-role.md): records route to existing roles until three or more systems clear the full inclusion gate around one operational outcome no existing role names, distinguished by a property first-party evidence can establish without reading source, so the boundary applies equally to open and closed systems.

Evaluate additional scored families only when a distinct operational outcome cannot fit the memory, agent, or assistant profiles. The broader AI Systems Atlas brand is permission to grow deliberately, not permission to compare incompatible systems.

Exit signal: evidence of user value justifies the additional model and maintenance surface.

## Delivery principles

- **KISS:** introduce the smallest domain concept that answers a real catalog question.
- **DRY:** keep executable enums and mappings in the taxonomy rather than duplicating them in automation or prose.
- **DDD:** model operational outcomes as families and roles; model source, license, and provider coupling as orthogonal traits.
- **DIP:** pass taxonomy-owned policy into discovery and validation instead of embedding catalog policy in GitHub adapters.
- **TDD:** express each boundary as a failing test before changing behavior.
