# Design: installing into a host is a deployment mode, and the Packs scope shows it

**Date:** 2026-09-18
**Status:** Approved design, pending implementation plan

## Problem

Superpowers was published on 2026-09-18 as a scored `coding_agent_workflow` system under [ADR 031](../../adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md), on the brainstorming companion server it ships. A reader who knows Superpowers as a skills pack opens the Agent packs scope and does not find it, and `packs.json` does not list it. The role it holds is literally named "Coding-agent workflow / skill stack", so the classification is coherent; the record is unfindable from the place a reader looks.

A first proposal moved placement onto distribution form and would have migrated Superpowers into `packs.json` without a score. A repository-only skeptic showed that proposal's exception clause was ADR 031's own rejected wording ("no pack executed by a host earns a record" was refused because ecc, gstack, hyperresearch, and claude-obsidian "own machinery a reader is genuinely choosing"), that the catalog never withdraws a reviewed score ([ADR 016](../../adr/016-superseded-predecessors-keep-their-record.md)), and that `BACKLOG.md` already settled a sibling question on 2026-09-17 with the rule that packaging is a trait. This design takes that route.

## Decisions

### 1. `host_pack` is a deployment mode

`directory/taxonomy.json` `deployment_modes` gains one value:

| id | name | definition |
|---|---|---|
| `host_pack` | Installed into a host agent | A skills bundle, plugin, or vault template the user installs into a host coding agent's own directories, so the system runs inside that host's sessions rather than as its own process. |

Deployment is one of the axes [ADR 003](../../adr/003-multi-axis-directory.md) names and [ADR 018](../../adr/018-operating-party-is-a-trait-not-a-role.md) already used for an operational fact; no new field, no new role, no new collection. A record may carry `host_pack` beside `local_cli` or `desktop` when it also ships a program the user runs directly.

### 2. Nine records carry it

Reviewed from their existing record prose (`description`, `canonical_data`, `current_repo_note`), which already states that each installs into a host: `superpowers`, `gentle-ai`, `ecc`, `gstack`, `vibecode-pro-max-kit`, `oh-my-openagent`, `claude-obsidian`, `obsidian-second-brain`, `hyperresearch`. A record whose prose does not say it installs into a host does not get the value on inference; the implementer reports it instead. Each edited record's `verified_at` becomes 2026-09-18, because a reviewer re-read it.

Nothing else on those records changes: no score, no role, no family, no prose.

### 3. The Agent packs scope lists them

Below the packs grid, the Packs scope renders a second block:

- heading `Scored systems installed as packs`, with its own count;
- one line under the heading: "These are reviewed systems that ship as a skills bundle, plugin, or vault; their scores live in the Systems scope.";
- cards in the mixed-directory system card shape (family label `System · <family>`, role pill, licence row, description, no score ring, no Compare, "View details" opening the system dialog);
- alphabetical; it honours the scope's search term only, because the type, host, install, and licence facets describe packs and not systems;
- hidden when empty.

A pure helper in `web/app-core.js`, `packShapedSystems(projects, { term, searchIndex })`, returns the systems whose `deployment` includes `host_pack` and that match the term through the existing `matchesDirectoryProjectSearch`, sorted by name. `app.js` calls it from the packs renderer. The pack result count is unchanged; the block's heading carries its own count. `deployment` is already a boot field, so no payload change.

### 4. The Systems scope reaches it

The deployment filter is taxonomy-driven and lists only modes carried by published projects, so `host_pack` appears there once the nine records carry it; ADR 018 and ADR 019 make that reachability the precondition for a trait. The system dialog already prints deployment. No card badge: nine of the agent-system family's records is below the 10% guide in `docs/WEB.md`.

### 5. ADR 033 records the trait

`docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md`, in the shape of ADRs 018 and 019: context (the findability complaint and the rejected placement proposal), decision (the value, the nine records, the Packs-scope block, reachability), "what this does not change" (ADR 031 and ADR 032 stand; scores are never withdrawn; a repository still appears in exactly one collection; the Packs scope's second block is a presentation-layer union under [ADR 013](../../adr/013-distinct-collections-share-one-directory-surface.md) and never merges schemas), and consequences.

### 6. Documents

- `AGENTS.md`: the packs routing row adds ADR 033.
- `docs/TAXONOMY.md`: one sentence after the collections paragraph: installing into a host is a deployment mode, and the Packs scope lists scored systems that carry it.
- `docs/DATA_MODEL.md`: the project-record traits line gains "(including `host_pack` for systems installed into a host agent)".
- `docs/PACKS.md`: a short section "Scored systems that install as packs" stating the rule, the block, and that ADR 031 still decides which pack-shaped repositories are systems.
- `docs/CURATION.md` packs paragraph: one sentence pointing to the deployment mode.
- `docs/WEB.md`: the Packs scope bullets describe the block; manual check 31 gains "confirm the scored-systems block lists Superpowers, shows no score, and opens the system dialog"; the deployment-filter bullet mentions `host_pack`.
- `skills/ai-systems-atlas/SKILL.md`: the fetch table's packs row adds "scored systems that install as packs are in `projects.json` with `deployment` containing `host_pack`".
- `docs/COVERAGE.md`: one sentence in the Agent packs subsection.

### 7. Tests

- `tests/test_directory.py`: the set of records with `host_pack` includes `superpowers` and every such record has at least one other deployment mode or an `agent_interfaces` entry (a pack-installed system still has a host to run in).
- `tests/test_web.js`: `packShapedSystems` filters by the value, honours the term and the index, sorts by name, and returns `[]` for projects without the value.
- `tests/e2e/directory-search.spec.js`: the Packs scope shows the block with a Superpowers card, no score ring or Compare, opening it shows `#project-dialog` with `record=system:superpowers`; searching "Superpowers" in the Packs scope keeps the block and empties the packs grid; the Systems deployment filter offers `host_pack` and selecting it lists Superpowers.
- `tests/test_documentation.py`: ADR 033 routed.

## Out of scope

- Re-reviewing ecc, gstack, vibecode-pro-max-kit, or obsidian-second-brain under any new placement test: no placement test is adopted.
- Moving obsidian-claude-pkm: it stays excluded under ADR 031.
- Any change to ADR 031 or ADR 032 text.
