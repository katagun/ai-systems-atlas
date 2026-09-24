# Design: every card leads with a type badge

**Date:** 2026-09-24
**Status:** Approved by the owner in the request, implemented with this design

## Problem

The owner asked that every card, system, and entity carry at least one badge, for example "Direct model API" for an inference service. Before this change a badge could only flag a reviewed trait, so many cards had none:

| Cards | Without a badge |
|---|---:|
| Systems | 21 of 207 |
| Inference services | 21 of 60 |
| Local runtimes | 2 of 17 |
| Imported models.dev rows | 124 of 124 |
| Specifications | 22 of 22 |
| Agent packs | 6 of 6 |
| Labs | 15 of 15 |

A grid mixed cards that opened with emblems and cards that had none. In the mixed All view, the one thing a reader always needs, what kind of record a card is, existed only as small eyebrow text.

## Decisions

### 1. A fourth badge family, Type

`BADGE_FAMILIES` gains `type`, first in registry order: named "Type", meaning "What kind of record it is. Every card carries exactly one.", with a circle frame and the neutral `--slate-ink` token. The circle is distinct from the shield, hexagon, and rounded square, and from the triangle reserved for reviewed flags. The neutral accent keeps the kind visually apart from the coloured trait families, so a row reads as "what it is", then "what it has".

### 2. One type badge per value of each collection's type field

A type badge tests one field for one value, with a new `equals` test shape beside the existing presence tests:

| Cards | Field | Badges |
|---|---|---|
| Systems | `system_family` | Memory system (database), Agent system (robot head), Assistant system (speech bubble) |
| Inference services | `service_type` | Direct model API (arrow to a model), Cloud model platform (grid of four), Managed inference host (chip), Routing aggregator (fork) |
| Local runtimes | `runtime_type` | Desktop runner (window with play), Server engine (gear), Embedded library (open book), Compatibility gateway (swap arrows) |
| Reviewed models | `model_type` | Language model (text lines), Multimodal language model (picture) |
| Imported models.dev rows | `review_status` = `imported` | Source record (bulleted list) |
| Specifications | `specification_type` | Protocol (two linked nodes), Metadata schema (table), Instruction convention (signpost), Capability format (puzzle piece), Package format (archive box) |
| Agent packs | `pack_type` | Skills bundle (star), Plugin (plus), Process kit (steps), Vault bundle (folder), Marketplace (storefront) |
| Labs | `lab_type` | AI company (sparkle), Technology company (building), Public research organization (flask) |

That gives 27 badges. Each carries its taxonomy name, with system families singular, and a plain-language definition drawn from the taxonomy definition. Each also has one hand-drawn glyph under the existing rules: 1.5-unit strokes, round caps, dots only as fills, no library. Every value of every type vocabulary has a badge, including values no record carries yet (Plugin, Public research organization), so a new taxonomy value cannot ship without one.

### 3. Placement: first in every row, on every card

- Each `CARD_BADGE_SETS` entry lists its type badges first. They all test one field for distinct values, so exactly one matches a well-formed record, and the six-badge cap still bounds one type plus at most five traits.
- New set keys cover `model-source` (an imported row), `spec`, `pack`, and `lab`.
- Specification, agent pack, lab, and imported-model cards gain a badge row just above the footer, as on the other cards.
- Finder shortlist cards gain the same row.
- A card whose record has an unknown type value and no trait still omits the row; no published record does.

### 4. Contract amendments

These amend "Card badges" in [`docs/WEB.md`](../../WEB.md):

- Every card carries at least one badge; every card leads with exactly one type badge.
- A type badge is the one deliberate restatement of a printed fact: the eyebrow names the type as text, and the badge repeats it as an emblem so every emblem row starts with the record's kind. The eyebrow stays, because badges are icon-only and the text is what a reader sees without hovering.
- The 10–75% separation guideline applies to trait badges; a type badge identifies rather than filters.
- The imported-row badge tests `review_status`, the one field that says what that card is. It states the kind of record, not whether to trust it, and its definition says the Atlas has not reviewed the release, as the card already does.

### 5. Legend and Taxonomy

- The legend lists type badges first:
  - Systems and every Family filter value: their family's type badge, then the traits.
  - Inference services and Local runtimes: their four types, then the traits.
  - Models: both model types and Source record, then the distribution badges.
  - Specifications and Labs, which had no legend before: their type badges.
  - All and Agent packs: the four families.
- Taxonomy gains a "Card badges · Type" group that lists all 27 badges with the scopes each appears in.

## Out of scope

- Click-to-filter on badges, which remains a separate backlog item. The redesigned results page's filter rail is the natural home for a type facet.
- A type badge for robots. The Robots collection is not built; when it is, its type field gets badges the same way, and the vocabulary test fails until it does.
- Changing any trait badge, what it tests, or its order.

## Testing

`tests/test_web.js`:

- every set lists type badges first, all on one field with distinct values, and cannot exceed the cap;
- type badges use `equals` and trait badges never do;
- every `equals` value exists in its vocabulary under its taxonomy name;
- every vocabulary value has a type badge;
- every published card in every collection shows exactly one type badge, first;
- trait badges must still appear on some published card, while type badges need not;
- specifications, packs, labs, and imported rows show only their type;
- malformed type values match nothing;
- the legend lists each view's set, and the families list has four entries.

`tests/e2e/card-badges.spec.js`:

- every card in every grid, and in a system and an inference Finder shortlist, leads with one type badge;
- the fixtures' expected rows now begin with their type;
- a card with only its type badge keeps its footer at the bottom;
- the imported card shows only Source record;
- the tooltip names the Type family.

`tests/e2e/badge-legend.spec.js`: four families in All, and the Specifications and Labs legends.

## Files touched

- Code: `web/app-core.js` (family, badges, `equals`, sets, set keys, legend), `web/app.js` (badge rows on spec, pack, lab, imported, and Finder cards; legend in Specifications and Labs), `web/styles.css` (the Type colour).
- Generated: the asset stamps.
- Tests: the three test files above.
- Docs: `docs/WEB.md`.
