# Design: Front-door Phase 2, the collection navigation

Phase 2 of the [Directory front-door design](2026-09-24-directory-front-door-design.md). It replaces the hero, the atlas map, and the quick-filter switcher with the front door and the scope strip that spec's target design describes, and it settles the three Phase 0 leftovers `BACKLOG.md` attached to this phase. The owner chose this layout on 2026-09-27 from four mocked alternatives (a scope picker, a wrapped two-level rail, and a side rail with a phone bottom bar were the others).

## Problem

Measured on branch `claude/fast-filter-nav-redesign-2b3d06` at 3be698f6 on 2026-09-27, with Playwright's Chromium at 1440×900 and 375×812:

- The switcher is 1,346 px wide inside a 349 px frame on the phone, so six of its ten entries start off-screen. Its top edge is at 560 px, and the first card at 871 px, on an 812 px viewport.
- On the laptop its top edge is at 644 px and the first card at 917 px, under the hero and the map.
- One row mixes three levels: All, a collection (Systems), that collection's families (Memory, Agents, Assistants), and a sibling view (Models).
- An entry carries a name and a count and nothing else: no emblem, no reviewed-versus-imported split for Models, and nothing for a comparison in progress or a Finder role set.

## Goals

1. Every collection is visible without a tap on the landing page and in results, at 320 px and above, with nothing scrolling sideways.
2. The collections are reachable without scrolling past a hero: the index is above the fold on the landing page, and the scope strip is pinned in results.
3. An entry says what kind of records it holds (its emblem), how many its default view lists, and whether the reader has state in it.
4. Robots, Papers, and any later collection is one registry entry.
5. The three Phase 0 leftovers are closed: the phone header's height, the order of URL restore, and Back after closing a record.

## Non-goals

- No change to search order, scores, comparison scopes, or badge claims (ADR 014, ADR 040, `docs/WEB.md` "Card badges").
- No new editorial field. The marks rule below reads `verified_at`, which every published record already carries.
- The wordmark, the primary navigation's entries, the theme control, and the badge key strip, which the badge session owns.
- The Finder's own screen and its URL state (Phase 4). The front door only links into the Finder as it exists.
- The list view and the record side panel (Phase 3).

## Design

### 1. The front door

The Directory's landing state. From top to bottom:

- The headline and one supporting sentence, as `docs/WEB.md` "Content hierarchy" already requires. The kicker's live count line stays.
- One search box across the whole Atlas. It is the All scope's search from Phase 1, so a query orders by match and carries into whichever scope the reader opens next.
- A row of Finder jobs, each a link that opens the Finder with that goal chosen. The jobs are the existing `FINDER_GOALS` labels: the first goal of each of the five directions, so the row has five links and no job is invented for it. Choosing one is the existing Finder handoff, so the Finder's role set still shows as the removable chip and stays out of the URL.
- The index: one tile per collection, from the registry in section 2.

The atlas map, its orbits, and the hero action button go. The map's legend went in Phase 0.

### 2. One collection registry

`web/app-core.js` gains `COLLECTIONS`, an ordered list. Each entry has:

| Field | Meaning |
|---|---|
| `id` | `all`, `systems`, `models`, `inference`, `runtimes`, `packs`, `robots`, `labs`, `specifications` |
| `name`, `short` | "Inference services" and "Services"; the strip uses `short` at phone widths only |
| `kind` | `scope` (a Directory collection) or `view` (Models, Labs, Specifications open their sibling views, as ADR 008, ADR 013, and ADR 041 require) |
| `emblem` | the id of the card badge whose emblem the entry shows: the family's own type badge for Memory, Agents, and Assistants; for a collection with several types, its first type badge in `CARD_BADGES` order (`memory-system` for Systems, `direct-model-api`, `desktop-runner`, `language-model`, `skills-bundle`, `ai-company`, `protocol`). All shows the type family's empty frame, which `familyEmblem("type")` already draws for the legend. Robots reuses nothing until its `form_factor` type badge exists, and shows its name without an emblem until then |
| `count` | a function of the boot payloads returning what the default view lists, plus an optional split: Systems counts active systems, All counts everything it lists, Agent packs counts packs plus host-installed systems, Models returns `{ total, reviewed, imported }`, Labs and Specifications their record counts |
| `categories` | a function returning the collection's largest categories with counts, each carrying the facet key and value that opens the scope narrowed to it: families for Systems, `type` values elsewhere, `form_factor` for Robots. At most four |
| `hidden` | true while the count is zero, so an empty collection offers no entry (the Robots rule from ADR 037, now general) |

`switcherCounts` and `activeSwitcherIndex` fold into this registry. Families are not registry entries: they are the Systems tile's categories and the second strip row of section 4. Exactly one registry entry is active at a time, and inside Systems exactly one family row entry is pressed, "All families" included.

### 3. Tiles

A tile is a button (a link for a `view` entry) carrying, in order:

1. The emblem and the name.
2. The count. Models prints "428" with "304 reviewed · 124 imported" beside it; Agent packs prints "17" with "8 packs · 9 host-installed"; Systems prints "196" with "active"; All prints "725" with "A–Z, no scores".
3. The categories as links. Systems lists its families; the others list their types with counts.
4. Three marks: the three records the collection has reviewed most recently by `verified_at`, ties broken by name A–Z. The build script writes their ids as `recent` in each app payload's envelope, so no per-record field joins `BOOT_FIELDS`. Marks paint from `logos.json` after first paint, as cards do, and a record without a logo shows its monogram. A tile with fewer than three records shows what it has. Labs share one review date today, so their marks are alphabetical until re-reviews spread the dates; that is the rule working, not a bug.
5. A state dot when the reader has state in the collection: a coral dot for a comparison in progress in that scope, a violet dot for a Finder role set applied in Systems. Each dot has a visible-on-hover title and a visually hidden label.

Tiles carry no definitions; those stay in Taxonomy. The marks are the one amendment to the front-door spec's skeptic ruling ("tiles carry no example marks, since choosing them would need a ranking the unscored collections forbid"): a review date is not a ranking, and ADR 043 records that.

Layout: a four-column grid at desktop widths, two columns at 720 px and below, with All spanning two columns. The index must start above 900 px at 1440 wide and above 812 px at 375 wide, measured from the page top with the header in place.

### 4. The scope strip

Choosing a tile opens the results state, where the strip replaces the index. It sits directly under the header and is `position: sticky`.

- **Wide screens:** every entry shows emblem, name, and count. Exactly one is pressed (`aria-pressed`), and the strip never scrolls.
- **720 px and below:** every entry shows its emblem only, and the pressed entry's name and count read as a caption under the row. The other entries carry their name as a tooltip through the existing badge tooltip and as a visually hidden label. Nine emblem-only entries fit a 296 px frame (a 320 px phone) with at least 16 px measured to spare, the slack `docs/WEB.md` requires for CI's Linux Chromium. If a later collection breaks that, the strip wraps to a second row; it never scrolls sideways.
- **Inside Systems:** a second row lists All families, Memory, Agents, and Assistants with their active counts, one pressed. The Systems entry itself clears the family, role, Finder roles, and comparison through `jumpToDirectoryFamily("")`, as Phase 0 fixed.
- **State dots** as on tiles, on the entry's corner.
- **Sticky rule:** at 720 px and below only the strip is sticky; the header scrolls away. That closes the Phase 0 leftover of a 185 px sticky phone header at 360 and 320 px, and `docs/WEB.md` step 23's "tools on the brand row" no longer claims to hold at phone widths. Above 720 px the header stays sticky and the strip sticks under it at the header's measured height.

The Finder role chip and the result count stay in the result row under the strip, as today.

### 5. URL and history

The front-door spec fixed these rules; Phase 2 makes them true.

- A bare URL opens the front door. `collection=all` names the A–Z list, which the front door reaches through the Everything tile. A URL with any other scope parameter opens results.
- Opening a scope from the front door pushes one history entry, so Back returns to the front door. Filter, sort, page, query, and scope changes inside results keep replacing, as Phase 0 made them.
- `syncRecordWithHistory` becomes `restoreFromURL`: on `popstate` it re-reads the view, the scope, its filters, the comparison, and the record, in that order, then paints once. Two Phase 0 leftovers close with it: a URL's `compare` or `record` decides the scope before the collection's filters are applied, so a hand-edited URL cannot leave state in hidden controls; and Back after closing a record repaints the filters the URL carries, so the screen and the controls agree.
- A `record=` URL with no `collection`, the form the share pages link to, opens the record over its own collection's results.
- `setDirectoryCollection(collection, { updateURL, carryQuery })` keeps Phase 1's semantics: `carryQuery` defaults to `updateURL`, the Finder handoff passes `false`, boot passes `updateURL: false`, and a carried query loads the new scope's search index and calls `syncMatchSort`. A tile or strip entry is one more caller that carries.

### 6. Phase 1 behaviour the front door keeps

Phase 1 (ranked search, ADR 040) lands first, and `docs/WEB.md` records these by its last task. The front door and the strip must not undo them:

- While a query is present the default sort is Best match, so `restoreFromURL` runs `syncMatchSort(scope)` after restoring a scope whose `sort` is undefined.
- `activateView` moves focus to the new view's heading when the focused control sat inside the view being hidden; every view heading carries `tabindex="-1"`. Opening a `view` entry from a tile or the strip goes through `activateView`, so the rule holds.
- The `<output class="search-count">` in every search field, the `.job-hint` container directly before each of the four Directory grids, and the `.empty-search` state stay beside their grids if the front door moves or re-parents them. The empty state's "Search all" button switches to All carrying the query, and lands on the results state, not the front door.
- `SCOPE_RECORDS`, `clearScopeFacets`, and `state.exclusions` are state the registry reuses rather than duplicates.
- The All panel's "Mixed discovery is alphabetical" intro is rewritten by Phase 1 and replaced by the front door's supporting sentence.

## Data

- `scripts/build_web_payload.py` writes `recent`, the three most recently reviewed record ids, into each app payload's envelope. `build_web_payload.py --check` covers it.
- No published endpoint changes. `sync_web_data.py`, the share pages, and the blog are untouched.

## Tests

Work starts with `tests/e2e/helpers/landing.js`, a navigation helper (`openCollection`, `openFamily`, `openView`, `frontDoor`) that the existing call sites move onto before any markup changes, in its own PR. The front-door spec counted 16 call sites typing into the All search and about 30 reading switcher chips by accessible name.

Then, with the markup:

- Unit (`tests/test_web.js`): registry counts and splits, `recent` selection with the A–Z tie-break, one active entry, one pressed family, hidden-while-empty.
- Browser (`tests/e2e/front-door.spec.js`): the index above the fold at 1440×900 and 375×812; every tile's count against the catalog-counts helper; each category link opening its scope with the facet set; marks painting after `logos.json`; the strip fitting at 320, 360, and 390 px with 16 px slack, using the `aim` and `settle` helpers so scrolling has stopped; emblem-only entries with a tooltip and a hidden label; only the strip sticky at phone widths; a comparison dot and a Finder dot; Back from results to the front door; a `record=` URL without a collection; the three Phase 0 leftovers.
- The atlas-map assertions in `tests/e2e/directory-search.spec.js` go, and the phone outside-tap target in `tests/e2e/card-badges.spec.js` moves off the hero's `h1`.
- `docs/WEB.md` verification: step 18 (map and statistics row) is replaced by front-door steps; steps 23, 24, and 27 are reworded for the strip.

## Docs and ADR

- **ADR 043, "The Directory opens on a front door of collection tiles"**, lands in the PR that makes it true. It names the front door as the Directory's default, amends ADR 013's quick-filter wording ("a visible quick-filter destination", "reachable from the quick filters") so tiles and the scope strip are the quick filters, and records the marks rule as an amendment to the front-door spec's skeptic ruling. The number is provisional: 040 is Phase 1's, 041 is Labs, 042 is the badge session's reviewed flags. Check `git ls-tree --name-only origin/main docs/adr/` right before the PR and renumber by slug if something landed first.
- `docs/WEB.md`: "Content hierarchy" describes the front door and the strip instead of the switcher; "Change surfaces" gains the registry and the helper; "Visual language" drops the map. The front-door spec's own table of `docs/WEB.md` changes lists the same sections.
- `BACKLOG.md`: the Phase 2 item and its three leftovers close; the Labs tile item in the Labs group closes.

## Coordination

- The front-door session (`claude/directory-p1-ranked-search`) merges Phase 1 first. This work bases on `main` after that merge and keeps its `setDirectoryCollection` semantics. It was sent the chosen design and this file list on 2026-09-27.
- The badge session owns the key strip and the legend; it is told that the "grid on screen" anchor changes, since the grid now starts under the strip rather than under the switcher.
- The Robots session has nothing open in these files; its four published records make the Robots entry visible.

## Sequence

One task per PR, each green before the next:

1. The e2e landing-navigation helper, moving every call site, with no markup change.
2. The registry, `recent` in the payload envelopes, and the unit tests.
3. The front door: markup, styles, tiles, Finder jobs, the map's removal, and its browser tests.
4. The scope strip, family row, state dots, and the phone sticky rule, with its fit and position tests.
5. URL and history: `restoreFromURL`, the pushed entry, `collection=all`, and the three leftovers.
6. ADR 043, `docs/WEB.md`, `BACKLOG.md`, and the verification steps.
