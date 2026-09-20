# ADR 034: Installing into a host is a deployment mode, not a collection

**Status:** Accepted. Numbered 034 on 2026-09-20: the record was accepted as ADR 033, but `main` already carried `033-ai-systems-papers` (Proposed), so this record took the next free number. Nothing else changed.

## Context

Superpowers was published on 2026-09-18 as a scored coding-agent workflow under [ADR 031](031-skill-packs-earn-records-by-owned-state-or-enforced-work.md), on `skills/brainstorming/scripts/server.cjs`, the companion HTTP and WebSocket server its brainstorming skill starts. `docs/COVERAGE.md` records that review. A reader who knows Superpowers as a skills pack opens the Agent packs scope and does not find it, because `packs.json` does not list it and cannot: [ADR 032](032-agent-packs-are-unscored-records-of-what-a-host-installs.md) gives a repository exactly one of `projects.json`, `packs.json`, and `exclusions.json`.

The classification is not the defect. The role Superpowers holds is named "Coding-agent workflow / skill stack" in `directory/taxonomy.json`, which is what the repository is. What is missing is a way to reach the record from where a reader looks for it.

A first proposal answered that by moving placement onto distribution form, which would have migrated Superpowers into `packs.json` without a score. Three documents in this repository refuse it.

- Its exception clause — a pack keeps a scored record when it owns machinery a reader is choosing — is ADR 031's own rejected alternative, "No pack executed by a host earns a record," which that record refused because it evicts `ecc`, `gstack`, `hyperresearch`, and `claude-obsidian`. A rule cannot be adopted by reinstating the clause that defeated it.
- [ADR 016](016-superseded-predecessors-keep-their-record.md) keeps a reviewed record when its standing changes, rather than withdrawing it. The catalog has no procedure for retracting a score a reviewer gave.
- `BACKLOG.md` settled the sibling question on 2026-09-17: an SDK category was answered with the existing rule that packaging is a trait, not a role, citing [ADR 003](003-multi-axis-directory.md), [ADR 018](018-operating-party-is-a-trait-not-a-role.md), and [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md).

## Decision

Installing into a host agent is a deployment mode. `directory/taxonomy.json` `deployment_modes` gains `host_pack`, "Installed into a host agent": a skills bundle, plugin, or vault template the user installs into a host coding agent's own directories, so the system runs inside that host's sessions rather than as its own process.

No new field, no new role, no new collection. Deployment is one of the orthogonal trait axes ADR 003 names in the founding decision, and ADR 018 already used it to carry an operational fact rather than inventing a role for one. A record may carry `host_pack` beside `local_cli`, `desktop`, or `library` when it also ships a program the user runs directly, and every record that carries it does.

Nine records carry the mode, each from its own prose rather than from any inference about its repository: `superpowers`, `gentle-ai`, `ecc`, `gstack`, `vibecode-pro-max-kit`, `oh-my-openagent`, `claude-obsidian`, `obsidian-second-brain`, and `hyperresearch`. Their `verified_at` becomes 2026-09-18, because a reviewer re-read them; nothing else on them changes, except that `hyperresearch` had recorded the fact nowhere and its `current_repo_note` gained the sentence stating it, from the README's Install section. A record whose prose does not say it installs into a host does not get the value on inference; a reviewer establishes the fact and writes it into the record first.

The Agent packs scope renders a second block below the packs grid, "Scored systems installed as packs", listing the systems that carry the mode with their scores hidden, each opening its own system dialog. The Systems scope reaches the same records through the deployment filter, which is built from the taxonomy over the modes published records actually carry, so `host_pack` appears there as soon as a record has it.

### Making the trait reachable is a precondition

[ADR 017](017-local-runtime-eligibility-ignores-modality.md) decided that a record the filters cannot reach is unfindable however well it is written up, and that the remedy is to extend the reachable vocabulary rather than distort the classification. ADR 018 and ADR 019 each applied it as a precondition: no record whose distinguishing fact is operational is promoted before the filter that exposes that fact exists.

The same obligation applies here, and it is the whole point of this record. A value no reader can reach would leave the findability complaint exactly where it was, so the mode lands together with both surfaces that expose it — the deployment filter on the Systems scope and the block on the Packs scope.

### What this does not change

- **ADR 031 and ADR 032 stand.** ADR 031 still decides which pack-shaped repositories earn a scored record, and ADR 032 still decides which are packs. `host_pack` is set at review from a record that has already passed one of those tests; it never decides inclusion, and it is not a third answer to that question.
- **A repository still appears in exactly one collection.** The Packs scope's second block reads system records; it adds nothing to `packs.json`. Under [ADR 013](013-distinct-collections-share-one-directory-surface.md) the block is a presentation-layer union, and it merges no schema, no rubric, and no comparison.
- **No score changes, and none is withdrawn.** The nine records keep their family, role, scores, and prose.
- **No card badge.** The card-badge guide in `docs/WEB.md` admits a badge that separates roughly 10 to 75 per cent of its collection or family; nine of the 128 agent-system records is below that floor.

## Alternatives considered

**Placement by distribution form.** Refuted above: its exception clause is ADR 031's rejected wording, it withdraws a reviewed score against ADR 016, and `BACKLOG.md` had already answered the sibling question with the rule that packaging is a trait.

**A new `distributed_as` field.** A second field for a fact `deployment` already carries. It would need its own vocabulary, its own validation, and its own filter, and a reader would have two places to look for one answer.

**Moving Superpowers to `packs.json`.** It would withdraw a score a reviewer gave and leave a published systems URL with no successor record behind it.

## Consequences

- The Agent packs scope shows scored systems beside the unscored packs, and a reader who arrives knowing a repository as a pack finds it there.
- The Systems deployment filter gains a value, and the nine records are reachable by it.
- `docs/PACKS.md` carries the relationship between the two, so a reviewer meets it where pack decisions are made.
- A future pack-shaped repository that passes ADR 031's prongs gets the mode at review, from its own prose.
- The value is never used to decide inclusion. A proposal to read `host_pack` as a placement test is a proposal to reopen ADR 031, and belongs in a record of its own.
