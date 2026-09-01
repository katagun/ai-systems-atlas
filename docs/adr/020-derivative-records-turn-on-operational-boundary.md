# ADR 020: Derivative records turn on operational boundary

**Status:** Accepted

## Context

`BACKLOG.md` has carried an item asking for the derivative rule to be written down, on the grounds that it had been applied three times and stated nowhere. The sweep kept queueing forks, ports, and renames, and each was decided from scratch.

The principle is not actually new. [ADR 016](016-superseded-predecessors-keep-their-record.md) already settled it in passing while deciding a different question:

> distinct operational boundaries mean distinct records, and a shared name or a shared lineage does not merge them.

What was missing is the operational half: given a candidate with an ancestor, which comparison decides it, and against which fields. This record supplies that and nothing more.

Reviewing four suspected derivatives together showed why the question needed answering, because repository lineage turned out to be a poor guide. GitHub reported `fork: false` for all four. One of them, oh-my-pi, shares early history with the published Pi record and carries that author's copyright. Two had no upstream at all — one a rename of its own author's earlier project, one a rewrite on an orphan branch. The fourth shares no code with the project it was ported from, and that project is not in the Atlas.

## Decision

A fork, port, or reimplementation earns its own record when its operational boundary differs from the system it came from, not when its repository does.

Repository lineage locates the ancestor. It does not decide the disposition. A fork flag, an imported upstream history, a squashed clean-room commit, and a disjoint branch are all evidence about provenance, and none of them is evidence about what a reader would be choosing.

### The comparison is against named fields

"Operational boundary" is not a new axis, and it is not the enumerated `execution_boundaries` vocabulary that `docs/TAXONOMY.md` defines. It is a comparison across the fields the record already carries:

- `agent_interfaces` — the surfaces through which the system is reached
- `deployment` — how it is obtained and operated
- `canonical_data` — what it owns and where that lives
- `execution_boundaries` and `agent_capabilities` — what it can actually do

Where those differ materially from the published record's, the candidate is its own system. Where they match, it is the same system in different packaging. This follows [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md): the distinction is decided by what the schema already models, rather than by a term introduced to decide it.

oh-my-pi is the worked case. Pi carries `agent_interfaces` of `terminal`, `api_sdk`, and `library`; oh-my-pi carries those plus `ide` and `web_app`, adds six agent capabilities, and ships its own binary, install channel, and native execution core. It earns a record while still sharing the upstream's history and copyright.

### First-party siblings are one product

A vendor that publishes the same product in several languages has one operational boundary, not several. The Claude Agent SDK and Google ADK exclusions were decided on that basis, and they were decided correctly: a reader choosing ADK chooses one supported product, whichever language binding they install.

This is not brand deciding classification, which `docs/CURATION.md` forbids. It is that the product boundary genuinely spans the implementations, because one maintainer publishes, versions, documents, and supports them as one thing. A third-party reimplementation has no such claim on the original, and is judged on the fields above like any other candidate.

### What this does not change

- **Licence and source model remain irrelevant to inclusion.** `AGENTS.md` states that relevance and operational capability determine inclusion and licence never does. A derivative does not earn a record by being more open than its ancestor.
- **A rename stays one record.** `docs/CURATION.md` and [ADR 016](016-superseded-predecessors-keep-their-record.md) already decide that case, and this record does not reopen it. Codewhale is recorded once, under its current name, with the rename noted.
- **Supersession is untouched.** [ADR 016](016-superseded-predecessors-keep-their-record.md) governs a maintainer-declared successor; this record governs an undeclared descendant.
- **Add-ons are not decided here.** Whether a plugin, skill pack, or harness extension earns a record is reserved by `BACKLOG.md` as a deliberate question, and settling it as a side effect of the derivative rule is exactly what that item exists to prevent.

## Consequences

- The `BACKLOG.md` derivative item is closed, with one correction it did not anticipate: Open Grok is not a precedent for this rule. Its upstream, Grok Build, is not a published record, so no exclusion branch was ever available; it was published because there was nothing to fold it into. The rule's evidentiary base is oh-my-pi as the inclusion case and llamafile as the packaging exclusion.
- The Open Grok record's stated distinguishing fact is that it is an open implementation of a provider-associated workflow. If Grok Build is ever published, that record needs re-deciding on the fields above, because openness cannot carry it.
- Candidates whose only novelty is a distribution format continue to be excluded as packaging, with their lineage noted on the record they fold into.
- A derivative with fully shared history can diverge far enough to become its own system, and a project with no shared history at all can still be one product with an upstream. Both follow from the rule rather than qualifying it.
