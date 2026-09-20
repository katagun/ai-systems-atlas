# Design: card badges become framed emblems with a scoped legend

**Date:** 2026-09-20
**Status:** Approved design, pending implementation plan

## Problem

Card badges are outlined text pills with a cyan dot ([`web/styles.css`](../../../web/styles.css) `.card-badge`). They read like every other pill on the card (role, source, license), they cost enough width that a card shows at most four, and nothing about their look says what kind of fact each one is. The owner wants badges that read as badges: a framed emblem per trait, explained by a tooltip and a legend, with room to grow into other icon families later, such as a warning-style mark for reviewed risk flags.

The badge contract in [`docs/WEB.md`](../../WEB.md) "Card badges" does not change: a badge tests one reviewed field for presence, never carries merit, trust, risk, or automated signals, never ranks, and is not a control. This design changes how a badge is drawn and explained, not what it may claim.

## Decisions

### 1. Frame shape names the badge's family

Every badge belongs to exactly one family, and the family decides the frame and the accent token:

| Family id | Frame | Token | Meaning shown to readers | Badges |
|---|---|---|---|---|
| `control` | Shield | `--cyan` | Where your data lives and who can touch it | `local-first`, `self-hostable`, `sandboxed-execution`, `editable-by-you`, `plain-files` |
| `capability` | Hexagon | `--violet` | What it can do | `browser-control`, `mcp`, `graph-retrieval`, `time-aware-recall`, `batch`, `distributed-serving` |
| `platform` | Rounded square ("chip") | `--amber` | Where it runs and what it runs on | `desktop-app`, `mobile-app`, `apple-metal`, `amd-rocm`, `npu`, `dedicated-endpoints`, `reserved-capacity` |

`web/app-core.js` gains a `BADGE_FAMILIES` registry (`id → { name, meaning, frame, token }`, where `frame` is SVG path data on a 32-unit viewBox), and each `CARD_BADGES` entry gains `family` and `glyph` (SVG markup for the 32-unit viewBox, drawn inside roughly the central 12 units). A later family is one registry entry plus its glyphs; nothing else in the renderer names a family.

Glyph rules:

- 1.5-unit stroke in `currentColor`, round caps and joins, no fills except small dots; hand-drawn for Atlas, no icon library dependency.
- One glyph maps to exactly one badge id.
- The three accelerator badges use mono lettering (`MTL`, `ROC`, `NPU`) rather than invented pictograms or vendor marks.
- First-pass glyphs: house, server, cube, pencil, document; cursor, plug, three-node graph, clock, layer stack, linked boxes; monitor, phone, target, bars. The brainstorm mockups in `.superpowers/brainstorm/` (uncommitted) hold working path data to start from.

### 2. Badges render as tinted, icon-only emblems

`badgeRow` in `web/app.js` emits, per badge, an `<li class="card-badge" data-family data-badge>` holding an inline `aria-hidden` SVG (frame plus glyph) and the existing visually hidden `Name: definition` text. There is no visible label on the card.

- Size about 1.7rem; gap as today. The frame is stroked in the family token and filled with a `color-mix()` of that token into the card surface, so both dark palettes work and `tests/test_web.js` sees no new colour literal. No `border-radius` is involved; the chip frame's corner is SVG geometry.
- `MAX_CARD_BADGES` rises from 4 to 6. The largest set lists five badges, so every match shows; the constant remains as a layout guard. Set order still decides emblem order.
- The native `title` attribute is removed (see decision 3).
- A card with no badge still omits the row.

### 3. One styled tooltip, no tab stops

A single tooltip element, owned by `web/app.js`, shows the family name, the badge name, and the definition. It opens on pointer hover and on tap or click of an emblem, positions itself against the emblem within the viewport, and closes on Escape, scroll, outside tap, or pointer leave.

Badges stay non-focusable: the contract and `tests/e2e/card-badges.spec.js` require that badges add no tab stops, and up to six stops per card would wreck grid tabbing. Screen readers keep the hidden `Name: definition` text, now announced once because `title` is gone, which closes the backlog item "Stop card-badge definitions from being announced twice". Sighted keyboard users get badge names from the legend (decision 4) and definitions through its link to Taxonomy.

### 4. A scoped legend strip, fixed to the viewport bottom

A `badge-legend` strip is fixed to the bottom of the viewport in the Directory view. It lists emblem plus visible name for the badges of the active scope only, and ends with an "All badges" link to the Taxonomy glossary.

| Active scope | Legend contents |
|---|---|
| Systems | Union of the three system-family sets, grouped by badge family, each badge once |
| Inference services | The `inference` set |
| Local runtimes | The `runtime` set |
| All (mixed) | The three families only: frame, name, meaning |
| Agent packs | The three families only, because host-installed systems are listed inline there ([ADR 035](../../adr/035-host-installed-systems-are-listed-inline-in-the-packs-scope.md)) and keep their badges |
| Models, Specifications, Papers, and every view other than Directory | No legend |

If the Systems scope is filtered to one system family, the legend narrows to that family's set.

Behaviour:

- A close button collapses the strip to a small "Key" chip at the bottom-left; the chip reopens it. The state persists in `localStorage` under its own key, wrapped in try/catch like the theme and page-size keys, and the page renders correctly without storage.
- Viewports under the phone breakpoint start collapsed unless the reader has opened it.
- While `.comparison-tray` is visible the legend shows as the chip, positioned clear of the tray, so the two never stack.
- The Directory content gains bottom padding equal to the strip's height so the strip never covers the last card row or the site footer.
- The strip is a labelled `<aside>` with a list; the close button and chip are real buttons. It is not shown in Finder, Taxonomy, or record dialogs.

### 5. Taxonomy, documentation

- The Taxonomy badge glossary groups entries by family, shows each emblem beside its name, definition, and scopes, and states each family's meaning. `cardBadgeGlossary()` returns `family` so the view needs no second lookup.
- `docs/WEB.md` "Card badges" is rewritten for emblems: families and frames, the one-glyph-one-badge rule, the cap of six, the tooltip and legend, the unchanged presence-only contract, and one sentence reserving a triangle frame for a possible reviewed-flags tier that requires its own ADR before any data or UI work. Browser-matrix step 30 is updated: emblems per family in both palettes, hover and tap tooltips, legend per scope, legend collapse persistence, legend yielding to the comparison tray.
- `BACKLOG.md`: close the double-announcement item; add an item for the reviewed-flags tier (ADR first); keep click-to-filter as is.

## Out of scope

- Reviewed flags such as "cyber-capable" or "advanced capabilities". They are judgments, not presence tests, and need a reviewed field, an evidence bar, and an ADR amending the badge contract. This design only keeps the door open (family registry, reserved triangle).
- Badges that apply a filter when clicked (existing backlog item).
- Badges on models, specifications, packs, or papers.
- Any change to which badges exist, what they test, or their order.

## Testing

`tests/test_web.js`:

- every `CARD_BADGES` entry has a `family` present in `BADGE_FAMILIES` and a non-empty `glyph`; glyphs are unique across badges;
- every family has a frame, a token that exists in `styles.css`, a name, and a meaning;
- the existing data guard, colour-literal guard, and radius guard continue to pass unchanged.

`tests/e2e/card-badges.spec.js`:

- the OpenClaw fixture shows all five agent-system badges in set order (replaces the first-four test);
- each emblem carries its family and the hidden `Name: definition` text, has no `title`, and the row adds no tab stops;
- hovering an emblem shows the tooltip with family, name, and definition; tapping does the same on a touch viewport; Escape closes it;
- the badge-less Chroma card still omits the row and keeps its footer at the bottom.

New legend coverage (same spec file or a sibling):

- contents match the active scope and change with it; the All scope shows families only; Models shows none;
- collapse persists across reload; the chip reopens it;
- opening the comparison tray collapses the legend to the chip;
- the last card row and the site footer are reachable with the strip open.

Completion follows `AGENTS.md` rules 15–17: regenerate the asset version stamp with Node 22 (`/usr/local/bin/node`), run `pre-commit run --all-files`, exercise the updated browser matrix in both palettes, and report only checks actually run.

## Files touched

`web/app-core.js` (registry, badge fields, cap, glossary), `web/app.js` (badge row, tooltip, legend, Taxonomy glossary), `web/styles.css` (emblem, tooltip, legend, chip), `web/index.html` if the legend or tooltip needs a static mount point, `tests/test_web.js`, `tests/e2e/card-badges.spec.js`, `docs/WEB.md`, `BACKLOG.md`, and the generated asset-version output.
