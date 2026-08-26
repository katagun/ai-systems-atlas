# Roadmap

This roadmap describes outcomes and sequencing. [`BACKLOG.md`](BACKLOG.md) is the source of truth for executable work; policy and architectural decisions live in `docs/`.

## Current: representative, transparent AI-system coverage

Make the Atlas broad enough to represent important memory and agent-system choices without hiding systems because of their source model.

- Separate relevance from licensing: include by operational role and expose source model, licenses, and evidence as filters and labels.
- Represent model-provider coupling as reviewed traits, not as a third system family.
- Review provisional projects in small domain batches, continuing with provider SDKs, the coding-agent second pass, and thin operational roles.
- Measure coverage by operational role, source-model diversity, and meaningful alternatives—not one misleading project total.
- Keep licensing, classifications, scores, and evidence human-owned while automation refreshes only live metadata and opens review signals.
- Maintain an unscored specification collection for the contracts between systems, without treating conventions as products or ranking unlike artifacts.

Exit signal: every supported role has several meaningful reviewed alternatives where the ecosystem provides them, priority candidate batches have an evidence-backed disposition, and users can filter by source model, license, and provider constraints without confusing those traits with capability.

## Next: efficient curation

Reduce repetitive review work while preserving deliberate editorial judgment.

- Add guarded candidate-promotion and stale-review reporting commands.
- Make repository transfers, license drift, and link failures explicit, recoverable review events.
- Add accessibility and link checks that fit the dependency-light static site; keep the Pages deployment path validated and reproducible.

Exit signal: routine catalog maintenance is repeatable, evidence-safe, and documented without relying on maintainer memory.

## Later: ecosystem context

Evaluate a separate, unscored ecosystem index for adjacent model providers, API clients, adapters, and observability SDKs. Build it only when concrete user questions cannot be answered by traits on operational systems.

Expand the specification collection in question-driven batches. Prefer agent-specific contracts with authoritative version and license evidence; do not absorb every general-purpose web standard used by an agent implementation.

Evaluate additional scored families only when a distinct operational outcome cannot fit the memory or agent profiles. The broader AI Systems Atlas brand is permission to grow deliberately, not permission to compare incompatible systems.

Exit signal: evidence of user value justifies the additional model and maintenance surface.

## Delivery principles

- **KISS:** introduce the smallest domain concept that answers a real catalog question.
- **DRY:** keep executable enums and mappings in the taxonomy rather than duplicating them in automation or prose.
- **DDD:** model operational outcomes as families and roles; model source, license, and provider coupling as orthogonal traits.
- **DIP:** pass taxonomy-owned policy into discovery and validation instead of embedding catalog policy in GitHub adapters.
- **TDD:** express each boundary as a failing test before changing behavior.
