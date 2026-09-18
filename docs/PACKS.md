# Agent pack curation

Use this guide for skills bundles, plugins, process kits, vault bundles, and marketplaces a host agent installs and reads. Operational systems follow [`CURATION.md`](CURATION.md); the two collections share licence and evidence rigour but not schema or scores. The boundary is [ADR 032](adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md), which amends [ADR 031](adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md).

## Inclusion boundary

Add a repository to `directory/packs.json` when all four hold:

1. **One steward authored the contents.** A mirror, a daily sync of other products' documentation, or an aggregate of other authors' bundles is not a pack.
2. **It is offered for install as one unit:** a plugin manifest, a skills folder, a marketplace manifest, a vault template, or an install script that copies the whole pack into a host's discovery locations. A personal snapshot nobody is invited to install is not a pack.
3. **A host agent consumes it.** Books, courses, and awesome-lists stay out.
4. **Its contents are documents, not running code.** Open the tree before deciding. A pack that ships a program the host runs at runtime is decided by ADR 031: scored if it owns state or does enforced work, excluded if what it runs is observation. Install, sync, manifest-resolution, and self-validation scripts, and a hook or script that only loads, prints, or installs the pack's own documents into the session, are distribution machinery and do not move a pack out of this collection; record them in `distribution_machinery`. A pack whose shipped code records what the host did is observation and stays excluded, as ADR 031 already holds.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`. Adoption does not establish an operational boundary, and it does not decide inclusion here either; a pack enters `candidates.json` and is reviewed from its tree like any other record.

## Classification order

Choose one `pack_type`:

- `skills_bundle`: skill documents installed together under a capability format;
- `plugin`: a host plugin whose manifest declares commands, agents, skills, or hook configuration;
- `process_kit`: a methodology packaged as prompts, commands, subagent definitions, and templates;
- `vault_bundle`: a knowledge-vault template with the instructions a host reads to maintain it;
- `marketplace`: a host-consumable manifest that lists other packs.

Then record in `hosts` every host the pack **documents** installing into, using values from the `pack_hosts` group, never a host inferred from a format's compatibility list; use `any_agent_skills_host` when the pack documents only the Agent Skills format. Record one `install_mechanism`, and name each `packaging_formats` entry as a `specifications.json` id (`agent-skills`, `claude-code-plugins`, `agent-plugins`, or an instruction convention). Assign `status` from the project statuses so an abandoned pack is labelled rather than removed.

## The marketplace rule

A marketplace record pins its manifest and names its steward, hosts, install mechanism, and licence. It never reviews, counts, or lists its entries and has no field for them; its `verified_at` dates the pinned manifest, not the catalogue behind it. A repository whose items each install separately through a marketplace manifest it ships is recorded once, as a marketplace, not as forty bundles. The entries it lists are each reviewable on their own evidence, in whichever collection ADR 031 and this boundary place them.

## Evidence workflow

1. List the tree (`gh api repos/<owner>/<name>/git/trees/HEAD?recursive=1 --jq '.tree[].path'`) and read the install manifest, skill frontmatter, or install script. Decide boundary test 4 from the tree, never from the README.
2. Pin the manifest or top-level `SKILL.md` as `git_blob` evidence with its blob SHA from the API (`gh api repos/<owner>/<name>/contents/<path> --jq .sha`), and add a `web` evidence item for the official page when the manifest alone does not show the documented hosts.
3. Inspect licence files and path-specific terms; record every material licence with scoped `git_blob` evidence. When no licence file is served at any usual path, record `LicenseRef-Unclear` with `web_terms` evidence pointing at the README and say so in `license_note`; never rewrite it as open source by inference.
4. Write `installs` from the tree in countable terms: how many skill directories, command files, agent definitions, hook configurations, templates, and where the host reads them. Write `not_a_system` in ADR 031's terms, or, for a marketplace, that it lists packs rather than being one.
5. Relate records only when it aids navigation; a relationship is not a compatibility claim.
6. Run synchronization, payload and share-page generation, validation, all tests, and the pack browser checks in [`WEB.md`](WEB.md).

Packs are never scored, sorted by popularity, or assigned a system family.

## Current coverage

The collection opens with four of the six repositories ADR 031's first application excluded: claude-code-tresor as a process kit, agent-toolkit and Build with Claude as marketplaces, and Second Brain Starter as a vault bundle. `NVIDIA/skills` and `AI-Research-SKILLs` remain excluded as mirrors, `knowledge-garden` as a personal snapshot.

Two of the six failed boundary test 4 on their trees and left `exclusions.json` for `candidates.json`, each held under `triage.held_by` for a scored review under [ADR 031](adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md), which is not this collection's decision to make. Superpowers: ADR 032 anticipated only its session hook, which does print a skill document and nothing more, but the tree also ships `skills/brainstorming/scripts/server.cjs` with `start-server.sh`, an HTTP and WebSocket server the brainstorming skill tells the host to launch, which opens the user's browser on a generated screen and writes the user's selections into a state directory the skill reads back on its next turn, plus plugin code under `.opencode/`, `.pi/`, and `.hermes-plugin/`. obsidian-claude-pkm: its vault template ships `.claude/hooks/auto-commit.sh`, which commits the user's vault after every Write or Edit, and `.claude/hooks/session-init.sh`, which reads the weekly-review document back into the session. In both cases the old exclusion reason no longer matches the tree, which is why neither stayed excluded. Both scored reviews are now done: Superpowers is a published system on its companion server, and obsidian-claude-pkm is excluded again on a reason its tree does support.

Use [`COVERAGE.md`](COVERAGE.md) and [`BACKLOG.md`](../BACKLOG.md) for the next pass.
