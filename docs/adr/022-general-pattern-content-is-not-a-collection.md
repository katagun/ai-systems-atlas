# ADR 022: General pattern content is not a collection

**Status:** Accepted

## Context

`BACKLOG.md`'s "Later" section carried the question [ADR 021](021-the-research-reference-role-is-removed.md) deferred rather than answered: if the Atlas ever publishes explanatory material about general agent-architecture patterns, should it take the shape of a new unscored collection under the [ADR 008](008-specifications-are-unscored-artifacts.md) pattern that specifications, inference services, and local runtimes already follow?

`zoltlabs/ai-systems-atlas`, reviewed 2026-09-02, is worked prior art for what such a collection would contain: seventy-eight architecture, security, evaluation, context, and coding-agent pattern plates, each with a one-sentence definition, a key insight, a failure mode, and one to three cited sources, with no product named anywhere.

## Decision

The Atlas does not add a collection for general agent-architecture patterns — harness shapes such as ReAct or actor–verifier, failure taxonomies, context-management techniques, and similar concepts that exist independent of any one product.

### The evidence shape does not transfer

Every existing collection — scored systems, and the unscored specifications, inference services, and local runtimes that ADR 008, ADR 010/012, and ADR 015 created — pins each record's evidence to one authoritative steward's own artifact: a repository, a specification text, a terms page. A specification record can carry several evidence entries, but they are several facets of that one steward's own material, never a synthesis across independent authors. A pattern like ReAct or an actor–verifier loop has no such steward or single reviewable artifact; it is a concept named and measured differently across an open literature. Citing one to three papers per pattern does not produce the evidence this repository's other collections require — it produces a record whose central claims cannot be checked against what the citation actually says without re-deriving the pattern from the paper yourself.

### The demonstrated failure mode is not hypothetical

`zoltlabs/ai-systems-atlas`'s Failure Taxonomy plate assigns its seven categories — Perception, Reasoning, Planning, Tool use, Recovery, Verification, Final answer — precise percentages (14, 22, 17, 19, 12, 9, and 7) and cites one source: arXiv 2503.13657, "Why Do Multi-Agent LLM Systems Fail?" (Cemri et al., 2025), also known as MAST. That paper's own taxonomy groups fourteen named failure modes under three top-level categories — System Design Issues, Inter-Agent Misalignment, and Task Verification — none named Perception, Reasoning, Planning, Tool use, Recovery, Verification, or Final answer. The plate's category set is not the cited paper's category set, so its percentages cannot be that paper's reported numbers under those labels either. The citation is real; the figures presented beside it are not traceable to it. This is the exact failure `AGENTS.md`'s evidence-integrity rule exists to keep out of this repository, produced by precisely the record shape this backlog item asked the Atlas to consider adopting.

### What this does not change

- **ADR 021 stands.** The `research_reference` role stays removed; nothing here reopens it.
- **The ADR 008 shape stays available for evidence that does fit it.** A future artifact with one authoritative steward and a real reviewable specification remains eligible for the specifications collection or a similarly-shaped new one; this decision is about pattern content specifically, not about closing the mechanism.
- **The Atlas's own taxonomy is a different, narrower question.** An explanatory diagram layer that illustrates only this repository's own boundaries — the three system families, why scores never cross profiles, and the boundaries between systems, specifications, inference services, and local runtimes — sources every claim to this repository's own ADRs and JSON, not to external literature. It carries none of the evidence problem described here and is not decided by this ADR; see `BACKLOG.md`.

## Consequences

- `docs/TAXONOMY.md` gains one sentence noting that general pattern content is not a further collection, beside its existing note that specifications and inference services are collections rather than families.
- `ROADMAP.md`'s "Later: ecosystem context" section no longer poses this as an open question.
- `BACKLOG.md` closes the item that asked for a skeptic before drafting this ADR.
- No taxonomy, validator, or schema changes: no collection existed to remove.
