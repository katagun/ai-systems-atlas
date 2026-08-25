# Roadmap

This roadmap describes outcomes and sequencing. [`BACKLOG.md`](BACKLOG.md) is the source of truth for executable work; policy and architectural decisions live in `docs/`.

## Current: trustworthy coverage

Make the atlas broad enough to represent important memory and agent-system choices without weakening its evidence or comparison boundaries.

- Represent model-provider coupling as reviewed traits, not as a third system family.
- Review provisional projects in small domain batches, beginning with agent SDKs and data-analysis agents.
- Keep licenses, classifications, scores, and evidence human-owned while automation refreshes only live metadata.

Exit signal: priority candidate batches have an evidence-backed disposition, and users can understand material provider constraints without a cross-provider leaderboard.

## Next: efficient curation

Reduce repetitive review work while preserving deliberate editorial judgment.

- Add guarded candidate-promotion and stale-review reporting commands.
- Make repository transfers and link failures explicit, recoverable review events.
- Add accessibility and deployment checks that fit the dependency-light static site.

Exit signal: routine catalog maintenance is repeatable, fail-closed, and documented without relying on maintainer memory.

## Later: ecosystem context

Evaluate a separate, unscored ecosystem index for adjacent model providers, API clients, adapters, and observability SDKs. Build it only when concrete user questions cannot be answered by traits on operational systems.

Exit signal: evidence of user value justifies the additional model and maintenance surface.

## Delivery principles

- **KISS:** introduce the smallest domain concept that answers a real catalog question.
- **DRY:** keep executable enums and mappings in the taxonomy rather than duplicating them in automation or prose.
- **DDD:** model operational outcomes as families and roles; model provider coupling as an orthogonal trait.
- **DIP:** pass taxonomy-owned policy into discovery and validation instead of embedding catalog policy in GitHub adapters.
- **TDD:** express each boundary as a failing test before changing behavior.
