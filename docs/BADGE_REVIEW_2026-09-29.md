# Badge review — 2026-09-29

Reviewed revision `0695dce5`. This is a product and implementation review, not an accepted taxonomy decision or a re-review of catalog records. The six follow-ups were implemented under [ADR 047](adr/047-badges-identify-record-facts-and-licensing-stays-scoped-text.md), with completed items removed from [BACKLOG.md](../BACKLOG.md); the current contract remains in [WEB.md](WEB.md#card-badges).

## Recommendation

Keep licensing as explicit text and compatibility as a scoped integration fact. Do not add generic OSS or OA emblems to the current rows. Resolve the accessibility and capacity issues below before expanding the badge vocabulary.

| Proposal | Benefit | Cost or ambiguity | Recommendation |
|---|---|---|---|
| OSS on systems | Quickly identifies reusable operational software; useful to readers selecting for control and modification | Cards and Finder already print the reviewed source classification and license identifiers. A second emblem duplicates them, uses scarce space, and can imply that the underlying model or hosted dependencies are open too. A test for only `open_source` excludes legitimate mixed open licenses. | Keep the full-text classification. If stronger emphasis is needed, improve that existing label and source filter rather than adding another trait. Scope it to the represented software boundary, never the entire AI stack. |
| OSS on models | Could help readers distinguish unrestricted reuse from downloadable but restricted weights | Model artifact licensing is not the same conclusion as open-source AI. Atlas currently reuses the software-oriented `source_models` vocabulary and does not have a structured review of training code and data information. Imported license strings and open-weight flags are not reviewed conclusions. | Keep Downloadable weights plus exact reviewed licenses. First decide how the existing model source label should describe its evidence scope. A future stronger openness claim needs an explicit standard and human review, not an icon inferred from the current enum. |
| OA on services and runtimes | API portability is a useful selection criterion | API styles are already printed on cards, filterable, and exposed in runtime Explore. Around 88% of both collections already carry the compatible value. “OA” is obscure and can be confused with OpenAI itself or open access; an OpenAI logo would imply identity. Compatibility covers subsets, not universal endpoint or parameter parity. | Keep “OpenAI-compatible” in text; do not add a duplicate icon or OpenAI logo. A later compact presentation should replace the existing label, preserve its accessible name, and disclose documented limits. |
| OA on systems | Helps readers choose tools that can connect to an existing compatible backend | `model_backends` describes what the system can call; `api_styles` on a service/runtime describes what it serves. These are opposite directions. System backend data is optional, detail-only, and already has an unresolved taxonomy issue in the backlog. Agent rows are at their badge budget. | A candidate for a future filter or detail improvement, labelled “Connects to OpenAI-compatible endpoints”. Resolve backend scope and coverage first. Do not reuse a serving badge or assume missing means unsupported. |
| OA on models | Superficially promises that a release works with familiar clients | The same release can be served through different runtimes and endpoint contracts; compatibility belongs to the serving implementation and route. Model tool-use capabilities also do not guarantee protocol support. | Do not put this claim on provider-independent model releases. Link to reviewed services/runtimes instead. |

The [OSI Open Source AI Definition 1.0](https://opensource.org/ai/open-source-ai-definition) includes parameters, training/run code, and information about training data. This is a stronger claim than a permissive weight license; it does not require publishing every raw training example. Atlas can choose its own clearly named classification, but should not imply it has audited that standard when it has not.

Compatibility limits are concrete: [Ollama's documentation](https://docs.ollama.com/api/openai-compatibility) distinguishes stateless Responses support from stateful features it does not support; [vLLM documents supported APIs and parameter differences](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/). These sources explain the presentation risk; this review does not update any catalog record from them.

## Catalog measurements

Counts below were computed from canonical published collections at the reviewed revision. They include archived systems unless explicitly marked active, exclude imported models.dev rows from reviewed-model counts, and describe Atlas coverage rather than the market.

| Population | Recorded fact | Count |
|---|---|---|
| Systems | `source_model: open_source` | 143 / 214 (67%) |
| Systems | `mixed_open_source`, kept separate | 7 / 214 (3%) |
| Active memory systems | `open_source` | 51 / 61 (84%) |
| Active agent systems | `open_source` | 80 / 124 (65%) |
| Active assistants | `open_source` | 2 / 17 (12%) |
| Reviewed models | `source_model: open_source` | 104 / 311 (33%) |
| Reviewed models | Downloadable weights | 170 / 311 (55%) |
| Inference services | `api_styles` contains `openai_compatible` | 53 / 60 (88%) |
| Local runtimes | `api_styles` contains `openai_compatible` | 15 / 17 (88%) |
| Systems | `model_backends` contains `openai_compatible` | 49 / 214 (23%) |
| Active agent systems | Same client-side backend value | 41 / 124 (33%) |

For example, Qwen Code, Ruflo, Vercel AI SDK, Warp, and OpenViking use multiple open software licenses; a badge testing only `source_model === "open_source"` would omit them. Other mixed-open records include content or font terms, so blindly folding the entire category into “OSS” would also need a scope decision. Open core, source available, mixed proprietary, and unclear must not become synonyms for OSS. Preserve every material license and the last reviewed classification while drift incidents await human resolution.

## Findings

### B-01 — Tooltip cannot be hovered; keyboard explanation is indirect

**Priority: P2, reproduced.** `initBadgeTooltip` in [app.js](../web/app.js) hides the tooltip when `pointerover` lands outside `.card-badge`. [styles.css](../web/styles.css) gives `.badge-tooltip` `pointer-events: none`. In Chromium, hovering OpenClaw's MCP badge showed the tooltip; moving the pointer into the tooltip's text hid it. This fails the hoverable behavior described by [WCAG 2.2 SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), particularly relevant to magnification users.

Screen readers do receive the definition through hidden text, and Escape, tap, outside-tap dismissal, detached-grid cleanup, and viewport clamping already have tests. Do not undo those strengths or add hundreds of tab stops by reflex. Provide a deliberate visible explanation path for sighted keyboard users, and keep the tooltip open across the trigger, the gap, and its own content. The current non-focusable emblems and pointer-only tooltip do not directly offer that path; the Taxonomy glossary is an indirect alternative. Amend the interaction contract and add behavior tests, rather than treating this as a cosmetic CSS change.

### B-02 — Adding a badge can silently hide a different true trait

**Priority: P2, reproduced as an extension risk; no current overflow found.** `cardBadges` filters then truncates with `.slice(0, MAX_CARD_BADGES)`, currently six. Seven published systems already reach six: CowAgent, Cua, Hermes Agent, OpenClaw, Ruflo, SwarmClaw, and OpenHuman. In an in-memory experiment, inserting an OSS predicate after OpenClaw's type badge removed Self-hostable from the returned row. No source or catalog file was altered by this experiment.

The existing `badges.length <= 6` published-record assertion checks an already-truncated result. Implementation follow-up also found a separate registry test that already bounds one type plus the possible traits to six; this reduces the extension risk and was omitted from the initial review. The renderer should still avoid silent truncation, and published-data parity needs strengthening. Before adding any badge, require a pre-truncation coverage assertion or an explicit overflow design. Keep the leading type invariant. The boot-field test checks field presence, not value equality or complete canonical/boot badge parity; strengthen it so missing or changed trait values cannot silently change boot rendering. Add a non-blocking prevalence report, with population and denominator, rather than changing editorial data to satisfy a threshold.

### B-03 — Model “Open source” reuses a software definition

**Priority: P2, product/taxonomy decision.** `sourceModelName` reads the same `source_models` vocabulary for system and model cards, comparisons, and dialogs. The `open_source` definition in [taxonomy.json](../directory/taxonomy.json) refers to operational code under one OSI-approved license. The [model schema](DATA_MODEL.md#model-record) reviews artifact licenses and access boundaries, but has no explicit training-code/data-information openness assessment. The displayed conclusion therefore needs a clearly stated model-specific scope before it is amplified by an OSS emblem.

This is a presentation/definition gap, not a finding that the 104 reviewed model classifications are wrong. Decide the terminology and evidence bar, then handle any necessary record changes through human review. Imported metadata must remain attributed and must never earn a reviewed OSS badge automatically.

### B-04 — Robot exception contradicts the general type-badge promise

**Priority: P2, existing backlog item refined.** There are four published robots. `robotCard` has no badge row, `cardBadges("robot", ...)` returns none, and `badgeLegend("robots")` returns none. Yet `BADGE_FAMILIES.type.meaning` says every card carries exactly one type badge, and `WEB.md` still describes the exception as applying while the collection is empty. Tests explicitly preserve the exception and omit robots from `publishedBadgeScopes` and type-vocabulary coverage.

Amend ADR 037 before implementing `form_factor` type badges, cover every taxonomy value, and update the renderer, legend, glossary, boot parity, and tests together. The navigation arm is a collection symbol, not evidence that every robot is an arm. Evaluate `ai_basis` traits separately: admission basis is not automatically a useful scanning badge, and vendor-named models must remain labelled as vendor statements.

### B-05 — Navigation emblems and record badges have diverged

**Priority: P3, clarity and small maintenance debt.** `COLLECTIONS` now has dedicated glyphs for Systems and Robots, and Agent packs intentionally borrows the Agent system head. Its pack cards still lead with Skills bundle, Plugin, Process kit, Vault bundle, or Marketplace. This implements the owner's requested navigation design; it is not a reason to relabel those records as agent systems.

The “All badges” glossary is generated only from `CARD_BADGE_SETS`; it therefore does not explain the Systems/Robots navigation glyphs or the bot head's collection use. Collection emblems should have their own explicit label/meaning contract and a small visual reference if the key is intended to explain navigation too. Share glyph artwork where intended without making navigation semantics depend on a card predicate. Distinguish this from the existing phone-strip accessibility and focus items; do not create a second registry of collection counts or filtering logic.

### B-06 — Review-attention label differs between card surfaces

**Priority: P2, latent inconsistency.** The scoped system renderer prints “Evidence review” when `license_review_status === "review_required"`; `mixedSystemCard` (All and Agent packs) and Finder's identity row omit that attention label while still showing the source classification. All 214 systems currently have `verified`, so this is not an active hidden incident in the measured catalog. A browser fixture changing only OpenClaw's in-memory boot review status reproduced the difference: one “Evidence review” label in Systems, none in All.

Extend the existing CR-20 card-template consolidation outcome with a review-required fixture across the scoped grid, All, host-installed systems in Packs, and Finder. Retain the reviewed classification and show attention as separate status text, never as a trait or merit emblem. Resolve whether any surface intentionally differs and document it; prevent accidental differences from copied templates.

## What already works, and what not to overbuild

- The 48 badge definitions, predicates, family frames, and resolver are centralized. Cards, Finder, legend, and Taxonomy share the artwork and names; this does not need a wholesale badge framework rewrite.
- Existing tests cover taxonomy values, type-first behavior, strict boolean/array presence, imported-versus-reviewed models, badge existence, boot-field presence, themes, touch behavior, and legend interactions. Extend these rather than building a parallel badge engine.
- Trait absence intentionally makes no negative claim. MCP is shown only in the agent set; Engram has recorded MCP capability but belongs to memory systems, where the trait occurs in only 1 / 63 records. This is selective display, not evidence of a missing protocol implementation. Explain scope rather than copying every badge into every family.
- The 10–75% guidance is advisory, not a hard classifier. Assistant Local-first is 1 / 17 (6%), while Developer API is 239 / 311 reviewed models (77%) and is an explicit distribution-mode exception. Review low-information badges with their scope and exceptions; do not silently remove them or rewrite catalog records.
- Preserve the existing backend-taxonomy, late-load focus, and CR-20 renderer tasks. This review adds acceptance criteria and dependencies to those items instead of duplicating them.

## Verification

Read the badge registry/resolver, rendering and tooltip code, styles, taxonomy, boot projection, relevant policy, and unit/browser tests. Computed the counts above from canonical JSON. Reproduced B-01 in a local Chromium page, B-02 in an isolated Node process, and B-06 with a browser response fixture that did not change catalog files. The default exploratory alternative port 8766 was occupied; the reproduction used a new server at 48717. No catalog or application behavior was changed in this review.

## Implementation follow-up

All six findings are addressed: hoverable tooltips and keyboard badge disclosures; lossless rendering with capacity and canonical/boot guards plus an advisory prevalence report; artifact-scoped model labels without record reclassification; robot form-factor type badges; a separate collection-symbol glossary; and shared evidence-review attention on scoped/mixed cards and Finder. The original counts and reproductions above describe the reviewed revision, not the changed application. No OSS/OA emblem or AI-basis trait was added.
