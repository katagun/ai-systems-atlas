# Design: scanning badges on Directory cards

**Date:** 2026-09-12
**Status:** Approved; implemented on branch claude/directory-card-badges-7fdca5

## Problem

A reader scanning a Directory grid wants to tell cards apart on the properties that decide a shortlist: does it keep data local, can it run actions in a sandbox, can I bring my own weights, does it run on Apple hardware. The card already carries a role pill, a source-model pill, one pill per license, and a tags row, but the tags row does not answer those questions. It prints the first three raw taxonomy values of one array — architectures on systems (`web/app.js:726`), accelerators on runtimes (`web/app.js:827`), delivery modes on services (`web/app.js:797`) — whether or not those values separate one card from the next. `on_demand` appears on 58 of 59 services, so the services row mostly repeats itself.

## Non-goals

Badges are for scanning only. They carry no merit, distinction, or editorial pick, and no trust or evidence state: nothing here ranks records, and nothing crosses a score profile. Badges are not filters and are not clickable. They add no field to any `directory/*.json` record, change no public endpoint shape, and need no curation. They do not appear on share pages, in detail dialogs, or in the comparison table. Specifications and unreviewed models.dev source rows get no badges. Automated signals such as GitHub stars stay outside the system; the `BACKLOG.md` item to surface runtime stars on the card is unaffected.

## Measured facts

Counts are from the published data on 2026-09-12.

- **Traits differ by family, not only by collection.** `agent_capabilities` and `execution_boundaries` exist only on agent systems. A memory or assistant record has no such key.
- **Several values are near-universal inside one scope.** `human_editable` is true on 104 of 112 agent systems and 17 of 17 assistants, but 19 of 46 memory systems. `openai_compatible` is on 51 of 59 services and 14 of 16 runtimes. `cpu` and `cuda` are each on 12 of 16 runtimes. `multi_agent` is on 81 of 112 agent systems.
- **Empty is not negative.** 63 systems have no `agent_capabilities`, because only agent systems are assessed for them. A missing value never means the property is absent.
- **The boot payload lacks several badge fields.** `BOOT_FIELDS["systems"]` (`scripts/build_web_payload.py:30`) omits `execution_boundaries`, `agent_capabilities`, `human_editable`, and `retrieval_modes`. ADR 026 lets the projection change with any web change.
- **Two booleans have no written definition.** `local_first` and `human_editable` are required and validated (`scripts/validate_directory.py:528`), and `local_first` drives a filter (`web/app-core.js:67`), but no document defines either. A badge definition would be the first published wording.
- **Model modality comes from models.dev.** The model card's tags row prints the modality route and family from `source_metadata` (`web/app.js:860`), which is automated source metadata, not Atlas review.
- **No tooltip component exists.** Cards explain pills only through `title` attributes (`web/app.js:732`), which keyboard and touch readers cannot reach.

## Decisions

### 1. Badges state reviewed facts that already exist

Every badge is a presence test over one curated field that is already on the record: a boolean that is `true`, or an enum array that contains one of the named values. A missing, `null`, or empty field never produces a badge, and no badge ever asserts that something is absent. A card without a badge means "nothing highlighted", not "has none of these".

### 2. A badge earns its place by separating cards

A badge should apply to roughly 10–75% of the records in its scope. Values above that band are noise and values far below it rarely help a scan. The band guides review of the catalog; it is not a test, because routine curation would otherwise fail CI.

### 3. Sets are scoped per collection and per system family

Each badge declares a scope: a collection, and for systems a family. A name is shared across scopes only when it tests the same field and value with the same meaning. `Local-first` and `Self-hostable` are shared across the three system families. A badge that only resembles another, such as a system's local-first behavior and a model's downloadable weights, gets its own name.

### 3a. A badge never repeats its own card

A badge must never test a field the same card already prints elsewhere — a role pill, a license row, or a footer. This rule was added after the final review found reviewed-model badges repeating the distribution-modes role pill, `Anthropic-compatible API` repeating the API-style role pill on inference services and local runtimes, and `Bring your own weights` repeating the `model_sources` already shown in the inference-service footer.

### 4. The catalog

Order is priority. Each card shows at most four.

| Scope | Badge | Test | Share |
|---|---|---|---|
| Agent systems (112) | Local-first | `local_first` | 55% |
| | Sandboxed execution | `execution_boundaries` ∋ `container` or `external_sandbox` | 47% |
| | Browser control | `agent_capabilities` ∋ `browser_control` | 30% |
| | MCP | `agent_capabilities` ∋ `mcp` | 70% |
| | Self-hostable | `deployment` ∋ `self_hosted` | 38% |
| Memory systems (46) | Local-first | `local_first` | 50% |
| | Editable by you | `human_editable` | 41% |
| | Graph retrieval | `retrieval_modes` ∋ `graph_traversal` | 37% |
| | Plain files | `architectures` ∋ `plain_files` | 24% |
| | Time-aware recall | `retrieval_modes` ∋ `temporal` | 22% |
| Assistant systems (17) | Local-first | `local_first` | 6% |
| | Self-hostable | `deployment` ∋ `self_hosted` | 12% |
| | Desktop app | `deployment` ∋ `desktop` | 53% |
| | Mobile app | `deployment` ∋ `mobile` | 65% |
| Inference services (59) | Dedicated endpoints | `delivery_modes` ∋ `dedicated_endpoint` | 37% |
| | Reserved capacity | `delivery_modes` ∋ `reserved_capacity` | 25% |
| | Batch | `delivery_modes` ∋ `batch` | 51% |
| Local runtimes (16) | Apple Metal | `accelerators` ∋ `metal` | 44% |
| | AMD ROCm | `accelerators` ∋ `rocm` | 50% |
| | Distributed serving | `serving_modes` ∋ `distributed_serving` | 50% |
| | NPU | `accelerators` ∋ `npu` | 25% |

The two assistant badges below the band stay because they are rare and decisive for a reader who needs them, and because they reuse the shared system-family definitions rather than adding vocabulary.

Simulated against today's data, the cap drops Self-hostable from 5 agent systems and Time-aware recall from 1 memory system. Cards with no badge are now 6 agent systems, 13 memory systems, 3 assistants, 21 services, 2 runtimes; models take none.

"Distributed serving" is deliberately not "Multi-node serving": the taxonomy definition covers several accelerators on one host as well as several hosts.

### 5. Badges replace the tags row

On system, inference-service, and local-runtime cards, the badge row takes the tags row's position, in both the collection grids and the mixed All grid, which render identical badges for the same record. When a card has no badge, the row is omitted. The values the tags row showed stay in the detail dialog and in the filters, where they already appear.

Specification cards keep their current tags row. Unreviewed models.dev source cards keep their current row and get no badges.

Reviewed-model cards take no badges; their tags row is replaced by the modality route and family as plain text that is visibly not a badge, with a `title` stating that the values come from models.dev.

### 6. Every badge explains itself without becoming a control

A badge is a non-focusable list item in a `role="list"` list, holding its visible name, a `title` carrying its one-line plain-language definition for pointer readers, and visually hidden text carrying the same definition for screen readers. It adds no tab stop. Badges render as outlined chips with a leading dot, distinct in shape (not only in hue) from the filled `.license-badge` and `.source-badge` pills, so they read as a different kind of chip even where colors are close in a given theme. The Taxonomy view gains a "Card badges" section listing each badge, its definition, and the scopes it applies to, so keyboard and touch readers can find the meaning of any badge.

Definitions say what the field records and no more. "Sandboxed execution" reads as "Can run agent actions in a local container or an external sandbox", not as a security guarantee.

### 7. Definitions for undefined booleans are checked against records before shipping

Before the wording for Local-first and Editable by you merges, a research subagent drafts each definition from about ten sampled records per value, citing the record fields and evidence it read. The integrator re-reads those sources, and the maintainer approves the final wording. `docs/DATA_MODEL.md` gains the same two definitions so the badge is not the only place they are written.

## Implementation

- **Payload.** Add `execution_boundaries`, `agent_capabilities`, `human_editable`, and `retrieval_modes` to `BOOT_FIELDS["systems"]`. Record the gzipped boot-payload delta in the PR. Regenerate `web/app/`.
- **Logic, `web/app-core.js`.** Define each badge once in `CARD_BADGES`, keyed by id, with `name`, `definition`, and `test` (`{ field, anyOf }` for enum arrays, `{ field }` for booleans). List each scope's badge ids in priority order in `CARD_BADGE_SETS`, so a name shared across scopes is one definition by construction. No badge tests a field its card already prints elsewhere. Add and export `cardBadges(kind, record)`, which returns at most four matching badges in priority order and returns `[]` for specifications and for models, and `cardBadgeGlossary()`, which lists each badge once with the scopes it appears in.
- **Rendering, `web/app.js`.** Add one `badgeRow(badges)` helper and call it from the collection cards and from the mixed cards in `renderAllDirectoryEntries` (`web/app.js:617`) in place of the tags markup, on system, inference-service, and local-runtime cards. Add the models.dev plain-text line, with visually hidden attribution, to both reviewed-model card paths, which take no badges. Add the "Card badges" section to `renderTaxonomy` (`web/app.js:1182`).
- **Styles, `web/styles.css`.** Add a `.card-badges` row and a badge style using `--radius-chip`: an outlined chip with a transparent background, a `--line-strong` border, `--text` ink, and a small `--cyan` dot, so its shape stays distinct from the filled `.license-badge` and `.source-badge` pills in both palettes. Replace the bottom alignment in `.tags { margin-top: auto }` (`web/styles.css:782`) with `flex-grow: 1` on the card description, so badge-less cards keep their footer at the bottom; a second auto margin on the footer would split the free space and float the remaining tags rows mid-card. Add a visually hidden utility class.
- **Docs.** Add a "Card badges" section to `docs/WEB.md` stating decisions 1, 2, 3, 5, and 6 and the scanning-only boundary. Add the two boolean definitions to `docs/DATA_MODEL.md`.

## Testing

- **`tests/test_web.js`:** scope and family filtering; priority order and the four-badge cap; no badge from a missing, `null`, or empty field; `[]` for specifications and models; no badge tests a field its card already prints (inference and runtime role pills, the inference-service footer), and no `model` set exists; every enum value a test names exists in the matching `taxonomy.json` vocabulary; every badge renders on at least one published record in each scope that lists it; every set names a defined badge and every defined badge is used; every field a badge tests reaches the boot payload for every record that has it; the existing color-literal and radius-literal checks pass with the new styles.
- **Playwright:** a known agent system shows its expected badges in order; a badge-less card renders no badge row and its footer stays aligned; a reviewed-model card shows no badges and still shows its attributed modality route; a record shows the same badges in its collection grid and in the All grid; badges carry definitions in accessible text and add no tab stop; the Taxonomy view lists every badge; badges read as a different kind of chip from the source pill in both light and dark color schemes.
- **Full check list** from `AGENTS.md`, and the browser pass it requires across all five collections.
