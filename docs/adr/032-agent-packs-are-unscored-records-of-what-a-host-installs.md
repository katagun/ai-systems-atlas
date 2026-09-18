# ADR 032: Agent packs are unscored records of what a host installs

**Status:** Accepted. Amends [ADR 031](031-skill-packs-earn-records-by-owned-state-or-enforced-work.md).

## Context

ADR 031 settled which packs earn a scored system record: those that own state or do enforced work. Its decision sentence sends every other pack to `directory/exclusions.json`, and `ROADMAP.md` says of the "collection of skill documents" that it cannot own an operational outcome. Both statements are right about scoring. Neither answers the reader.

A reader assembling a coding-agent setup chooses among exactly these packs. The scored roles hold the packs that ship machinery, a minority of what that reader is choosing among, and the catalog answers the rest with a rejection note. The question the catalog cannot answer is concrete: **for a given host agent, which add-ons exist, what does each one install, under what licence, and does any of them own machinery of its own?** Only the last clause is ADR 031's question.

The Atlas already has a shape for artifacts that matter to selection but are not systems. [ADR 008](008-specifications-are-unscored-artifacts.md) made specifications an unscored collection on that reasoning. [ADR 022](022-general-pattern-content-is-not-a-collection.md) refused a pattern collection only because patterns have no single steward or reviewable artifact. A pack has both: one repository, one licence, one tree to open.

A repository-only skeptic was briefed to refute this proposal before it was designed. Its objections are answered below where they changed the design, and named in "Alternatives considered" where they did not.

## Decision

`directory/packs.json` is a fifth collection, **Agent packs**, in the ADR 008 shape: no `system_family`, no `primary_role`, no score profile, no score, no stars. A pack record states what the pack installs, into which hosts, by which mechanism, under which licence, and why it is not a scored system.

### The boundary

A record is one steward's pack, offered for others to install into a host agent as one unit, whose contents the host reads as instructions, configuration, or templates. Four refusals, each already decided elsewhere in this catalog:

1. **Mirrors and aggregated documentation** are not one steward's pack. `NVIDIA/skills` and `Orchestra-Research/AI-Research-SKILLs` stay excluded, and their lesson stands: an aggregated catalog of independent instruction bundles is not one product.
2. **Personal snapshots not offered for install** have no install unit. `oldwinter/knowledge-garden` stays excluded; the recordable system is the software that operates a vault, not one person's vault.
3. **Material no host consumes** is not a pack: books, courses, awesome-lists.
4. **Packs that ship running code** are decided by ADR 031, not here. A hook that denies, a script that does the work, a store the pack re-reads: scored if it passes, excluded if what it runs is observation. Install, sync, manifest-resolution, and self-validation scripts, and a hook that only loads or prints the pack's own documents into the session, are distribution machinery and never move a pack out of this collection; ADR 031 already says the same of `vibecode-pro-max-kit`'s top-level scripts, and it is why Superpowers' session hook does not make Superpowers a system.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`. ADR 031 decides between the first two, and the validator refuses a repository present in both.

Five types: skills bundle, plugin, process kit, vault bundle, marketplace.

### Evidence is composition, never behaviour

ADR 031 found that prose about what a pack does is a claim, not evidence. This collection therefore pins only artifacts that prove composition: the install manifest or skill frontmatter, the licence file, and the tree. The `installs` field is written from the tree in countable terms and is checkable by counting it. No record states what a pack does at runtime, because the collection admits only packs that run nothing.

### Marketplaces are install sources, not catalogues

A marketplace record pins its host-consumable manifest and names its steward, hosts, install mechanism, and licence. It never reviews, counts, or lists its entries, carries no field for them, and its `verified_at` dates the pinned manifest rather than the catalogue behind it. The `buildwithclaude` lesson stands: indexing adds no operational boundary, and the record claims none. This is not the models.dev shape of [ADR 027](027-complete-models-dev-source-catalog-is-published.md): nothing is imported and no unreviewed rows are published. A repository whose items each install separately through a marketplace manifest it ships is recorded once, as a marketplace.

### Adoption still decides nothing

The Superpowers exclusion's lesson, "adoption does not establish an operational boundary", remains true and is preserved in `docs/PACKS.md`. A pack record is unscored precisely because it establishes none. Records carry no `stars`, the Packs scope sorts by name only, and a pack enters the queue and is reviewed from its tree like any other candidate. The stated weak point: nothing refuses the tenth Claude Code skills bundle except the queue and the ecosystem-significance judgement `docs/COVERAGE.md` already applies to the ninth coding agent.

### Placement

Packs join the Directory as a fifth scope under [ADR 013](013-distinct-collections-share-one-directory-surface.md), because a pack is a deployment choice rather than an interoperability artifact and a reader searching the mixed Directory must find it. The scope is alphabetical only, offers no comparison ([ADR 014](014-comparisons-are-scoped-to-one-score-profile.md)), no Finder goal, and no card badges.

## What this amends

- ADR 031's decision sentence now reads: "Otherwise it is a document collection executed by the host, and it is reviewed for the unscored Agent packs collection under ADR 032." Its prongs, its evidence rule, and its observability line are unchanged.
- `ROADMAP.md`'s "only the middle case can own an operational outcome" stays true and gains the clause that the third case is recorded, unscored, for what it installs.
- `docs/CURATION.md`'s reservation of `exclusions.json` and its packs paragraph route document packs to `docs/PACKS.md`.

## Alternatives considered

**A new `specification_type`.** A skills bundle is an instance of a capability format, not a format; `docs/SPECIFICATIONS.md` requires normative detail for an independent implementation, which a bundle of prompts does not have.

**Rendering `exclusions.json` in the app.** An exclusion is a reason to leave. The reader's question needs hosts, install mechanism, and licence, which exclusions do not carry.

**A blog post.** Kept as a complement, not a substitute: a post carries no evidence schema and no review date.

**Reversing ADR 031 and scoring packs as coding-agent workflows.** Every score dimension would measure the host. ADR 031 rejected the "supervises the host" phrasing for exactly this reason.

## Consequences

- `docs/PACKS.md` carries the inclusion boundary, classification order, marketplace rule, and evidence workflow.
- The six packs excluded under ADR 031's first application were re-reviewed from their trees. Four pass this boundary and move from `exclusions.json` to `packs.json`. `obra/superpowers` does not: beyond the session hook that prints a skill document, its tree ships a brainstorming companion server with a state directory and a browser launcher, and plugin code for three hosts, so it returns to `candidates.json` on hold for a scored review under ADR 031 rather than staying excluded on a reason its tree no longer supports. `ballred/obsidian-claude-pkm` does not either: its vault template ships a hook that commits the user's vault after every edit and a hook that reads the weekly-review document back into the session, so it returns to `candidates.json` on the same hold. Both were reviewed under ADR 031 on 2026-09-18: Superpowers earned a scored record on its companion server, and obsidian-claude-pkm was excluded because its scripts only record and its deny list is host configuration.
- A candidate bound for this collection waits under `triage.held_by: "ADR 032 pack review"`; automation never writes a pack record. Extending the triage routine's routing is a `BACKLOG.md` follow-up.
- Every script that enumerates collections gains a row; `docs/AGENT_DOCS.md`'s one-commit rule for published files applies.
