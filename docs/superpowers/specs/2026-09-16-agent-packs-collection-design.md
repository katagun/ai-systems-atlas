# Design: an unscored Agent packs collection

**Date:** 2026-09-16
**Status:** Approved design, pending implementation plan

## Problem

[ADR 031](../../adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md) settled which packs earn a scored system record: those that own state or do enforced work. Every other pack — a skills bundle, a plugin, a prompt-and-process kit, a vault bundle, a marketplace — goes to `directory/exclusions.json`, and `ROADMAP.md` says of the "collection of skill documents" case that it cannot own an operational outcome.

Both statements are correct about scoring and wrong about the catalog. A reader assembling a coding-agent setup chooses among exactly these packs, and the Atlas answers that reader with a rejection note. The scored roles hold the packs that ship machinery (`ecc`, `gstack`, `gentle-ai`, `claude-obsidian`, `obsidian-second-brain`), which is a minority of what the reader is choosing among. The question the catalog cannot answer today is concrete: **for a given host agent, which add-ons exist, what does each one install, under what licence, and does any of them own machinery of its own?**

That is a discoverability question, and the Atlas already has a shape for artifacts that matter to selection but are not systems: the unscored collection of [ADR 008](../../adr/008-specifications-are-unscored-artifacts.md). [ADR 022](../../adr/022-general-pattern-content-is-not-a-collection.md) refused a pattern collection only because patterns have no single steward or reviewable artifact. A pack has both.

A repository-only skeptic was briefed to refute the proposal before this design was written. Its objections shaped every section below; the ones it called fatal are answered in "What ADR 032 amends" and "Evidence".

## Decisions

### 1. A fifth collection: Agent packs, recorded in ADR 032

Publish `directory/packs.json` as an independent canonical collection with **no** `system_family`, `primary_role`, score profile, score, or popularity metric, in the ADR 008 shape. Envelope: `{"version": "1.0", "verified_at": ..., "packs": [...]}`.

**Unit of curation:** one steward's pack, offered for others to install into a host agent as one unit, whose contents the host reads as instructions, configuration, or templates. The pack is recorded for what it installs and where, never for what it does.

**The name is "Agent packs".** "Harness" already names the `stateful_agent_runtime` role ("Stateful agent runtime / harness") and is used throughout the queue for agent runtimes, so it stays out of the collection's name, file, and record kind. ADR 031 already uses "pack" throughout.

### 2. Inclusion boundary

A record is admitted when all of the following hold:

1. **One steward authored the contents.** A mirror, a sync of other products' documentation, or an aggregate of other authors' bundles is not a pack. This keeps the `NVIDIA/skills` and `AI-Research-SKILLs` exclusions and their lesson ("An aggregated catalog of independent instruction bundles is not one product") intact.
2. **It is offered for install as one unit.** A plugin manifest, a skills folder, a marketplace manifest, a vault template, or an install script that copies the whole pack into a host's discovery locations. A personal snapshot not offered for install (`oldwinter/knowledge-garden`) is not a pack; the lesson "the recordable system is the software that stores and operates the vault" stands.
3. **A host consumes it.** Books, courses, awesome-lists, and reading material that no host agent installs stay out (`lintsinghua/claude-code-book`).
4. **Its contents are documents, not running code.** A pack that ships a program the host runs at runtime — a hook that denies or rewrites, a script that does the work, a store the pack re-reads — is decided by ADR 031: it is a scored system if it passes, and excluded if what it runs is observation (the `agentops`, `pandaprobe`, `langsmith-sdk` line). Installer, sync, manifest-resolution, and self-validation scripts are **distribution machinery** and never move a pack out of this collection; ADR 031 already says the same of `vibecode-pro-max-kit`'s two top-level scripts.

**One collection per pack.** A repository appears in exactly one of `projects.json`, `packs.json`, or `exclusions.json`. ADR 031 decides between the first two; `validate_directory.py` refuses an `id` or `repo` present in both `projects.json` and `packs.json`. `claude-obsidian`, published as a scored system and described as an Agent Skills bundle, stays where it is; its record prose is not changed by this design.

**Types.** One `pack_type` per record from a new taxonomy enum:

| id | name | definition |
|---|---|---|
| `skills_bundle` | Skills bundle | A set of skill documents installed together under a capability format such as Agent Skills. |
| `plugin` | Plugin | A host plugin whose manifest declares commands, agents, skills, or hook configuration the host reads. |
| `process_kit` | Process kit | A methodology packaged as prompts, commands, subagent definitions, and templates a host follows. |
| `vault_bundle` | Vault bundle | A knowledge-vault template with the instructions a host reads to maintain it. |
| `marketplace` | Marketplace | A host-consumable manifest that lists other packs for installation. |

The stated weak point: nothing refuses the tenth Claude Code skills bundle except the candidate queue and the ecosystem-significance judgement `docs/COVERAGE.md` already applies to the ninth coding agent. Adoption still decides nothing; a pack enters the queue like any other candidate and is reviewed from its tree.

### 3. The marketplace rule

A marketplace record pins its host-consumable manifest (`.claude-plugin/marketplace.json` or the equivalent) and names its steward, hosts, install mechanism, and licence. It **never** reviews, counts, or lists its entries, and it carries no field for them; its `verified_at` dates the pinned manifest, not the catalogue behind it. This keeps the `buildwithclaude` lesson intact — "indexing them adds no operational boundary of its own" — because the record claims none. The entries a marketplace lists remain individually reviewable on their own evidence, in whichever collection ADR 031 and this boundary place them. This is not the models.dev shape of [ADR 027](../../adr/027-complete-models-dev-source-catalog-is-published.md): nothing is imported, and no unreviewed source rows are published.

A repository where each item installs separately through a marketplace it ships (`softaworks/agent-toolkit`, "`/plugin install <skill>@agent-toolkit`") is recorded once, as a marketplace, not as forty bundles.

### 4. Record schema

Every field is required unless marked optional; there is no `stars`, `stars_verified_at`, `system_family`, `primary_role`, `score_profile`, or `score`, and the validator rejects them if present.

- **Identity:** `id`, `name`, optional `short_name`, `steward` (one string; the person or organisation that authors the pack), `repo` (GitHub `owner/name`), authoritative `url`, `description` (one sentence, what the pack is).
- **Classification:** `pack_type` (taxonomy `pack_types`); `hosts` (non-empty array from taxonomy `pack_hosts`; the hosts the pack documents installing into, never inferred from a format's compatibility list); `packaging_formats` (array of `specifications.json` ids, may be empty when a pack uses only an install script); `install_mechanism` (taxonomy `pack_install_mechanisms`).
- **Composition:** `installs` — a short paragraph stating what the pack places in the host and where, written from the pinned manifest and tree listing, in countable terms ("14 SKILL.md skill directories, one SessionStart hook configuration that prints a skill document as context, and plugin manifests for eight hosts"). `distribution_machinery` — optional paragraph naming any shipped scripts and what they do, when the pack ships any; its presence is the reviewer's record that the ADR 031 code test was applied.
- **Boundary:** `not_a_system` — one or two sentences stating why the pack is here rather than a scored record, in ADR 031's terms (no owned state, no enforced work), or, for a marketplace, that it lists packs rather than being one.
- **Licensing:** `licenses`, `license_note`, `license_evidence` exactly as specification records carry them; `LicenseRef-Unclear` is valid when no licence file is served, and is never rewritten as open source by inference.
- **Relationships:** optional `related_packs` (ids in `packs.json`) and optional `related_systems` (ids in `projects.json`, for a pack whose steward also ships a scored system, such as a marketplace and a plugin from the same author). Neither implies compatibility.
- **Review:** `evidence` (see below) and human-owned `verified_at`.
- **Lifecycle:** `status` from `project_statuses` (`active`, `archived`, and so on, reusing the existing enum) so an abandoned pack is labelled rather than removed.

New taxonomy enums:

- `pack_types` as above.
- `pack_hosts`: `claude_code`, `codex`, `cursor`, `gemini_cli`, `github_copilot`, `opencode`, `windsurf`, `cline`, `obsidian`, `any_agent_skills_host` (the pack documents only the Agent Skills format and names no host). Each carries a name and definition; the list grows only when a reviewed pack documents a host not on it.
- `pack_install_mechanisms`: `host_marketplace` (installed through the host's own plugin marketplace command), `skills_cli` (a third-party skills installer such as `npx skills add`), `copy_files` (the user or an install script copies files into the host's directories), `clone_template` (the user clones or forks the repository as a starting vault or project).

### 5. Evidence: composition, never behaviour

ADR 031 found that prose about what a pack does is a claim, not evidence. This collection therefore pins only artifacts that prove **composition**:

1. the install manifest or skill frontmatter (`plugin.json`, `marketplace.json`, the top-level `SKILL.md`, or the install script) as a `git_blob`;
2. the licence file(s) as scoped `license_evidence`;
3. one `web` evidence item for the current official page or README when the manifest alone does not show the hosts the pack documents.

The `installs` paragraph must be verifiable by counting the pinned tree; a reviewer writes it from the tree, never from the README. No record states what the pack does at runtime, because the collection admits only packs that run nothing.

### 6. Placement on the site

Packs join the Directory as a fifth scope under [ADR 013](../../adr/013-distinct-collections-share-one-directory-surface.md), because a pack is a deployment choice rather than an interoperability artifact, and because a reader typing "superpowers" into mixed search must find it.

- **Packs scope:** filters combine search, pack type, host, install mechanism, and licence. Results are alphabetical only; there is no score sort, no stars sort, and no comparison selection (the ADR 014 rule for unscored records). The scope is represented in the URL like the others.
- **All scope:** pack cards appear in mixed search, identified as "Agent pack · <type>" the way mixed cards identify every collection.
- **Cards:** name, steward, pack type pill, hosts, licence pills, and the description. No badges (`CARD_BADGE_SETS` gets no entry; the badge guard in `tests/test_web.js` is unaffected). A mark from `web/logos.json` when one is mapped, otherwise the monogram fallback; this design maps no new marks.
- **Detail dialog:** the canonical record with `installs`, `distribution_machinery`, `not_a_system`, hosts, packaging formats linked to their specification records, licence evidence, and pinned evidence. Record kind `pack:id` in `RECORD_KINDS`, `parseRecordReference`, `shareRecordPath`, and the back-button behaviour every dialog has.
- **Share pages:** `web/records/packs/<id>/index.html` through `scripts/build_share_pages.py`'s kind map and sitemap; eyebrow "Agent pack · <type>", facts for steward, hosts, install mechanism, and licences, no score.
- **Payload:** `scripts/build_web_payload.py` gains a `("packs", "packs.json", "packs", "pack")` collection with boot fields `id`, `name`, `short_name`, `steward`, `pack_type`, `hosts`, `install_mechanism`, `packaging_formats`, `licenses`, `description`, `status`, `repo`, `url`; everything else is detail-only. The search index under `app/search/` covers identity, steward, repo, description, and `installs`. The gzipped boot budget in `docs/WEB.md` is re-measured after the change.
- **Finder:** no goal. `docs/WEB.md` only admits a goal once a reviewed record can satisfy it, and an unscored collection has nothing for a ranking to use.
- **Taxonomy view:** lists the three new enums beside the specification enums.

### 7. Documents, routing, and published-file lists

- New `docs/PACKS.md`: inclusion boundary, classification order, the marketplace rule, evidence workflow, and current coverage, in the shape of `docs/SPECIFICATIONS.md`.
- New `docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md` (see next section).
- `AGENTS.md`: the description line names agent packs; the routing row for "skill packs, plugins, vault bundles, or harness add-ons" reads `docs/PACKS.md`, then ADR 031 and ADR 032; the hard rule for packs is added beside the specifications rule; `packs.json` joins the published-file rule.
- `PUBLISHED_DATA` in `scripts/validate_directory.py` and `scripts/sync_web_data.py`, `web/llms.txt`'s Data section, the API view in `web/index.html`, `skills/ai-systems-atlas/reference.md`, and `docs/AGENT_DOCS.md` change in the same commit, as `docs/AGENT_DOCS.md` requires.
- `docs/DATA_MODEL.md` gains a "Pack record" section and its file table grows by one; `docs/TAXONOMY.md` lists packs among the collections that are not families; `docs/WEB.md` documents the scope, dialog, and manual checks; `docs/COVERAGE.md` gains a packs section; `docs/CURATION.md` paragraph on packs points to `PACKS.md` for the non-scored case; `tests/test_documentation.py` routes the new documents.
- `docs/OPERATIONS.md`: the updater's star refresh does not touch `packs.json`; link and licence-drift checks reach it like every collection.

### 8. What ADR 032 amends

ADR 032 is an **amendment**, stated as such, not a sibling:

- ADR 031's decision sentence "Otherwise it is a document collection executed by the host, and it belongs in `directory/exclusions.json`" becomes "Otherwise it is a document collection executed by the host, and it is reviewed for the unscored Agent packs collection under ADR 032." ADR 031 gains `**Amended by:** ADR 032` in the form ADR 010 already carries. Its prongs, its evidence rule, and its observability line are unchanged.
- `ROADMAP.md`'s "only the middle case can own an operational outcome" stays true and gains the clause that the third case is recorded, unscored, for what it installs.
- `docs/CURATION.md`'s sentence reserving exclusions and its packs paragraph are updated to route document packs to `PACKS.md`.
- The Superpowers exclusion lesson "Adoption does not establish an operational boundary" is preserved in `docs/PACKS.md` verbatim: it remains true, and the pack's record is unscored precisely because it establishes none.

ADR 032 also records, as alternatives considered: a new `specification_type` (refused, a bundle is an instance of a format, not a format); rendering `exclusions.json` in the app (refused, an exclusion is a reason to leave, and the reader's question needs hosts, install mechanism, and licence, which exclusions do not carry); a blog post (kept as a complement, not a substitute, because a post carries no evidence schema and no review date).

### 9. Candidate routing

No candidate schema change. A candidate bound for the packs collection carries a `triage` block with `verdict: held`, `held_by: "ADR 032 pack review"`, and a `rule` citing ADR 032 until a human reviews it. Promotion into `packs.json` follows the manual workflow in `docs/PACKS.md`; automation never writes a pack record. Extending the triage routine's routing to name packs is a follow-up in `BACKLOG.md`.

### 10. Initial records

Six repositories are re-reviewed **from their trees**, not from their exclusion text, and their `exclusions.json` entries are removed in the same change. Proposed types, subject to what the tree shows:

| repo | proposed type | note |
|---|---|---|
| `obra/superpowers` | `process_kit` | skills plus a SessionStart hook that prints a document; manifests for several hosts |
| `alirezarezvani/claude-code-tresor` | `process_kit` | subagent definitions, templates, commands; install script copies into `~/.claude/` |
| `softaworks/agent-toolkit` | `marketplace` | each skill installs separately through its own marketplace manifest |
| `davepoon/buildwithclaude` | `marketplace` | the marketplace manifest; its web index is not recorded |
| `coleam00/second-brain-starter` | `vault_bundle` | one skill document and memory templates; `LicenseRef-Unclear` |
| `ballred/obsidian-claude-pkm` | `vault_bundle` | vault template plus command documents |

`NVIDIA/skills` and `Orchestra-Research/AI-Research-SKILLs` stay excluded under boundary test 1; `oldwinter/knowledge-garden` under test 2. Their exclusion entries are unchanged.

### 11. Validation

`validate_directory.py` gains `validate_packs` in the shape of `validate_specifications`: exact required-key set, enum membership for `pack_type`, `hosts`, `install_mechanism`, `status`, and every licence; `packaging_formats` ids must exist in `specifications.json`; `related_packs` ids in `packs.json`; `related_systems` ids in `projects.json`; every licence has one scoped evidence item; forbidden keys (`stars`, `score`, `score_profile`, `system_family`, `primary_role`) rejected; cross-collection `id` and `repo` collision with `projects.json` rejected; `verified_at` present and dated. The cross-collection id check at the end of validation includes packs.

### 12. Testing

- `tests/test_validation_policy.py`: a valid pack passes; each forbidden key, a missing licence evidence item, an unknown host, an unknown packaging-format id, and a repo shared with `projects.json` each fail.
- `tests/test_directory.py`: published `packs.json` validates and matches `web/packs.json`; every record's `installs` is non-empty; no record carries `stars`.
- `tests/test_web.js`: `llms.txt`, the API view, and `PUBLISHED_DATA` agree; the packs boot payload carries exactly the boot fields; mixed search finds a pack by name; the Packs scope filters by type and host; `parseRecordReference` accepts `pack:` and rejects unknown kinds; no comparison controls in the Packs scope.
- `tests/e2e/directory-search.spec.js`: select the Packs scope, filter by host, open a pack dialog, confirm the `record=pack:` URL, reload, back to close, Copy link, and follow the share page back.
- `tests/test_documentation.py`: `docs/PACKS.md` and ADR 032 are routed.
- `scripts/build_share_pages.py --check`, `build_web_payload.py`, the logos check, and the full command list in `AGENTS.md` run clean before completion.

## Out of scope

- Reviewing the two ADR 031 follow-ups in `BACKLOG.md` (`Gentleman-Programming/engram`; the role question for `failproofai` and `video-use`). Unchanged.
- Importing marketplace entries, or any unreviewed snapshot of a marketplace. Refused in section 3.
- New card marks for packs.
- A Finder goal for packs.
- Extending the triage routine to route packs automatically (backlog follow-up).
