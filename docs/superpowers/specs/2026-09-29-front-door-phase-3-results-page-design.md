# Design: Front-door Phase 3, the results page

Phase 3 of the [Directory front-door design](2026-09-24-directory-front-door-design.md). It turns the nine per-collection control panels into one results frame: one bar for search, sort, and layout; the scope strip with match counts; a filter rail; a list view; and a record view that opens beside the list. It closes the two leftovers Phase 2 handed on. It holds to the front-door spec's target design points 3, 4, and 5, its "Collections in flight" notes on Labs and type badges, and ADR 043.

The owner settled four questions on 2026-09-29:

1. **Scope.** One spec for all seven parts, shipped as seven PRs. Suggestions while typing come last, so the owner can drop them after the rest ships.
2. **Default layout.** Results open as a list in every scope at every width, with cards one toggle away.
3. **Filter values.** A filter takes one value at a time, as today. Choosing several values is a later backlog item.
4. **Structure.** One shared frame drawn from each collection's descriptor, not nine restyled panels and not a separate results module.

The owner then approved the design, presented in four parts, on the same day.

The layout follows the review's approved mockups (the 2026-09-23 landing review, direction B, mockups 3, 5, and 6):

- while browsing, the rail sits beside the list;
- while a record is open, the list sits beside the record and the rail steps aside;
- phones get the filters as a sheet and the record full-screen.

A repository-only refutation review checked an earlier draft against the code and the binding documents. Its findings are folded in below. The spec was then re-checked against `main` at a4eb95dd, after the Elements map (#384, ADR 046) and the backlog's engineering refresh (#382, #383) landed. The changes that followed are:

- the Elements entry points;
- the ADR number;
- the 150 ms pause (`CR-21`);
- one table and one card builder per collection (`CR-20`);
- a record view that never scrolls sideways;
- six Phase 2 follow-ups whose code this phase rewrites.

None of them changes the four decisions or the approved design.

## Problem

Measured on the live site, which served `main` at d297746d, with Chromium on 2026-09-29. "The band" is the space a reader can see between the bottom of the sticky header and strip and the top of the badge legend. The legend is open by default above 720 px and a closed chip at 720 px and below.

- **1440×900, Systems.**
  - The band runs from 249 px to 867 px. The directory's top padding is 72 px.
  - The control panel spans 266–443 px (177 px).
  - The first card starts at 509 px and is 391 px tall. No card is fully inside the band; three are partly.
- **1440×900, Models.**
  - The collection heading spans 231–459 px, and the control panel 480–685 px.
  - The first card starts at 751 px. No card is fully inside the band.
- **375×812, Systems.**
  - The band runs from 181 px to 779 px, and the control panel spans 198–620 px.
  - The first card starts at 689 px, and cards average 398 px, so the band holds about 1.4 cards.
- **375×812, Models.**
  - The heading spans 176–537 px, and the controls 555–1284 px.
  - The first card starts at 1353 px.
- **Nine sets of controls.** Each of the nine collections carries its own search box, its own row of dropdowns, and its own grid: nine search boxes, 39 filter controls, and four sort selects. Systems hides eight of its ten filters under "More filters".
- **No counts.** No filter says how many records a value lists. `populateFilters` and `populateCollectionFilters` list values only.
- **Modal records.** A record opens in one of eight modal dialogs over the list. Reading several records means open, close, find the place, and open again.
- **Two Phase 2 leftovers**, recorded under "Phase 2 follow-ups" in `BACKLOG.md`:
  - A sort chosen before typing is not in the URL while the query lasts. After a reload, clearing the query returns to the scope's default sort rather than the reader's. `tests/e2e/front-door.spec.js` holds this as a `test.fixme`.
  - An empty result gives no pointer to Labs or Specifications. `emptyResultMatches` counts matches there, but All returns before it builds `elsewhere` (`if (scope === "all") return { hidden: [], elsewhere: [], found: … }`), and other scopes keep only All's six kinds. Typing `hangzhou` on the front door lands in All on "No matches" with only "Try the Finder", while Labs lists three.

## Goals

1. **Results start near the top.**
   - At 1440×900, at least seven results sit fully inside the band, in Systems and in Models, with the legend open.
   - At 375×812, at least four sit fully above the legend chip at the top of the page, in Systems and in Models.
   - Browser tests pin both counts with the 16 px slack that CI's Linux Chromium needs.
2. **Filters are visible, counted, and never hidden.** Every collection's filters are visible with counts on wide screens and one tap away on phones, and no active constraint is ever hidden.
3. **One search box.** One search box serves every collection, and the strip shows where a query's matches are, Labs and Specifications included.
4. **Records beside the list.** A record opens beside the list on wide screens, and the reader can step through the results without losing their place.
5. **Addressable state.** Every new state survives reload and Back, and restore drops what it cannot apply.
6. **Phase 2's leftovers close.** Both of the leftovers above close. So do two Phase 2 follow-ups that Phase 3's strip work touches (section 2).

## Non-goals

- **Unchanged rules.** Search order and match weights (ADR 040) stay as they are. So do what a score means and which records compare (ADR 014), and what a badge may claim (`docs/WEB.md` "Card badges").
- **One value per filter.** No filter takes several values.
- **No data change.** There is no new field, no new payload, and no change to `BOOT_FIELDS`. The Lab filter and related records read what the boot payloads and `labRelations` already give.
- **Other phases' work.** This spec leaves out:
  - the Finder's own screen and URL state (Phase 4);
  - Explore and What's new (Phase 5);
  - the front door, except where the one search box meets it (section 7).
- **The badge key strip and legend**, which the badge session owns.
- **Remembering a layout across visits.** The page size is remembered in the browser (`atlas.pageSize`). The layout travels in the URL instead, so a shared link shows what its sender saw.

## Design

### 1. The frame, and one query

The nine `.collection-panel` sections keep their ids and become each collection's results region. Their result row (`*-result-count`, the live count with its profile suffix), job hint, empty state, grid, and pager keep their ids and behaviour. What each panel loses is its control panel: the search box, the dropdown rows, "More filters", the guidance paragraph, and the Models, Labs, and Specifications section headings. Those move into shared parts:

- **The bar**, directly under the scope strip, holds:
  - one search box, `#results-search`, with the aria-hidden `<span class="search-count">` beside it;
  - the Sort control in scopes that have one, listing that scope's options as today;
  - a List/Cards toggle;
  - a Filters button with the number of active constraints, shown at 1000 px and below and whenever a record is open beside the list.

  Above 1000 px the bar sticks under the strip, and `syncStickyClearance()` adds its height to `--sticky-clearance`. Once scrolled at 1440×900, the header, strip, bar, and open legend then cover about 265 px (29%) in Systems. At 1000 px and below the bar scrolls with the page, so the sticky stack stays Phase 2's header and strip.
- **The rail** (section 3).
- **Above each collection's results**, in order:
  - the chips row (section 3);
  - the result row, whose live count keeps its profile suffix ("196 systems · Scores hidden across families");
  - the scope note;
  - the job hint where the scope has one.

  The scope note is one line carrying the collection's score-scope rule, which the eight `.filter-guidance` paragraphs carry today, as ADR 014 and `docs/WEB.md` "State the applicable score-scope rule" require. For Models, Labs, and Specifications the note also carries their kicker's facts under the kickers' ids (`#models-kicker`, `#labs-kicker`, `#specifications-kicker`), so " · N not yet on models.dev" keeps its home.
- **Headings.** The three section headings retire: the pressed strip entry names the collection, and `#directory-title` stays the results heading. In results the directory drops the 72 px (41.6 px on phones) top padding that the front door's headline needs.

**One query.** The query is one value that every collection reads:

- **Switching scope keeps it.** `setDirectoryCollection(collection, { updateURL, carryQuery })` keeps its signature and its meaning: `carryQuery: false` leaves the query as it is.
- **Callers that must clear the query clear it themselves, as today:** the Finder's handoffs and Clear filters. The callers that pass `false`, directly or through `updateURL: false`, all expect the query kept:
  - boot and every popstate, through `restoreFromURL`;
  - comparison restore;
  - "Search all";
  - "Browse all in Models";
  - the pack-to-specification link;
  - the legacy `?view=` alias.
- **What a query change resets.** `docs/WEB.md` rules that "text that differs from what the box held is a new query". With one box:
  - a change to the query's text returns every scope to its first page;
  - typing on continues the same query, so a sort the reader chose during it survives further typing in that scope, as `docs/WEB.md` already promises, until the query is cleared;
  - each scope keeps its own sort from before the query.

  PR 2 restates the rule in those words. It also deletes the sentence saying Models, Labs, and Specifications "never receive a carried query", which has been false since #345.
- **The search boxes.** The front door keeps `#door-search`, and typing there lands in All with the caret in `#results-search` (section 7 may change that). Leaving the door still removes the Elements selection (`element`, `elementRecord`), as ADR 046 requires. "/" focuses whichever box is visible.

**One match pass, after a pause.** A query is matched once per collection for the strip's counts and the empty result's pointers; the results keep their own ranked pass, which also orders them. Matching all eight kinds took 3–6 ms per query in the review's measurements.

The results, the strip's counts, and the URL follow the reader 150 ms after the last keystroke, not on every keystroke. `syncMatchSort` stays synchronous, because it changes a control's state rather than painting. This closes `CR-21` in `BACKLOG.md`, whose measurement puts the filter half alone at 3–14 ms on the main thread per keystroke across nine handlers. It also closes the related wasted repaints:
- `setPageSize` repainting the hidden Models, Labs, and Specifications grids;
- `renderSearchSurfaces` repainting views that are not on screen when an index lands.

A query loads all eight search indexes from any scope, instead of only the active scope's:
- they total 770 KiB raw, about 193 KiB gzipped;
- All already loads six of them (732 KiB), so Labs and Specifications add 37 KiB.

Until an index lands, that collection counts from its boot fields, as its filter already does. `docs/WEB.md`'s index-loading sentence changes to say so.

### 2. The scope strip with match counts

While a query is present, every strip entry, the pressed entry's caption, and the Systems family row show how many records their default view lists for the query. The default view means the collection's filters at their defaults with the query applied, as `collectionEntries` defines it. Without a query they show Phase 2's counts.

- **Empty entries stay usable.** An entry with no match shows 0 and stays enabled, so the reader can open it and read its empty result.
- **Updated in place.** Counts update the existing entries in place instead of rebuilding the strip. That closes the Phase 2 follow-up "the strip is rebuilt with `innerHTML` on every results repaint, so a click that lands across a repaint is lost".
- **Smaller phone family row.** At phone widths the unpressed family entries hide their counts, as the scope row's caption pattern does. That closes the follow-up about the site's smallest interactive text.
- **Heard as well as seen.** Every entry carries its count as visually hidden text, so a screen reader hears it where the count is not shown (at 1000 px and below the count is `display: none`). That closes the follow-up "the phone strip's caption is `aria-hidden`, so a screen reader hears no count for the pressed entry".

**The empty-result pointers leftover closes.** "It matches N records in other collections" names each collection that has matches, "Labs 3 · Specifications 1", and each name is a button that opens that collection with the query. This covers All: Labs and Specifications are exactly All's other collections. From another scope, the buttons name every other collection with matches. "Search all" stays where All's own kinds hold matches. An end-to-end test starts on the front door, types `hangzhou`, and follows the Labs button.

### 3. The filter rail

Above 1000 px, while no record is open beside the list, a rail left of the results lists the active scope's filters. All has none, as today, so All shows no rail.

- **Order.**
  - In Systems, Role leads, because Family lives in the strip's family row and is what the card's type badge tests. The Systems filters follow in today's order, including Capability, which #373 added.
  - Elsewhere the type filter leads: the service, runtime, model, pack, specification, or lab type, or the robot form factor. The scope's other filters follow in today's order, then Lab where it applies.
- **Values and counts.** Each group lists "Any" and then its values in today's order, each with a count. The count is the number of records the scope would list with that value, given the query and every other filter, with the group's own choice left aside.
  - A value with no records stays listed with 0 and cannot be chosen, unless it is the chosen value, which stays enabled so the reader can clear it.
  - A group with more than eight values shows its first eight and "Show all N". Models' licence group has 55.
  - The Lab group lists labs A–Z, never by size. ADR 041 says labs carry "no rank" and that "Ranking organizations invites the misreading ADR 014 exists to prevent".
- **One choice per group.** Each group is a radio group whose default is "Any", except Systems' status, whose default stays "Active". Local-first is a group like the others: Any, Yes, No, and Not recorded.
  - Every URL key keeps its name and meaning.
  - Counts update in place, so focus stays on the radio the reader is moving through.
- **Only real choices.** A group shows only when at least two of its values list records in the scope, generalising the rule that role filters list only represented roles.
  - On the catalog of 2026-09-29 this hides one shipped group: Robots' status, since every robot is active. It returns as soon as one is not.
  - `docs/WEB.md`'s Robots line and verification step 33 say so.
- **Packs.** Under ADR 035, pack filters narrow only packs, and host-installed systems follow the search alone. So Packs' counts are over packs only, and the rail says so under its groups. Packs gets no Lab filter: one lab joins one pack today, and narrowing host-installed systems by lab would amend ADR 035.

**Active constraints as chips.** Above the results, every non-default constraint is a removable chip, followed by "Clear filters":
- a facet ("Role: Coding agent ×");
- the Finder's role set, which keeps its own label ("Finder: Write and maintain software ×") and stays out of the URL until Phase 4.

This replaces "More filters · N active" with the same guarantee: no active constraint is ever hidden. Clear filters also clears the query and resets the sort, as `docs/WEB.md` already says of it.

**Phones, narrow screens, and an open record.** At 1000 px and below, and while a record is open beside the list, the bar's Filters button opens the rail as a sheet. The sheet holds the same groups, applies each choice as it is made, and closes with a button reading "Show N results".

**The Lab filter.** The front-door spec calls this the Maker facet. It is named Lab here because its values are lab records (ADR 041) and because Models already has a Lab filter under the key `lab`.
- **Where it appears.** Its values are the labs that join at least one record in the scope, and a record matches when the chosen lab's `labRelations` include it. It appears in Systems, Inference services, Local runtimes, Models, and Specifications.
- **What it joins on the catalog of 2026-09-29:**
  - 43 labs;
  - 311 reviewed models and 113 imported rows;
  - 27 of 60 inference services (23 labs);
  - 48 of 214 systems (16 labs);
  - 3 of 17 runtimes;
  - 7 of 22 specifications.
- **Models** keeps today's rule: the lab's reviewed releases and its pending source rows.

**One definition per group.** Each group gets one definition in `web/app-core.js` that the results and the counts both read, so they can never disagree:
- a key, a label, a values function, and a matcher `(record, value, ctx)`;
- the lab join as a lab-to-record-ids index built once from `labRelations` and passed in `ctx`.

The existing descriptors become these definitions (`INFERENCE_SERVICE_VIEW`, `LOCAL_RUNTIME_VIEW`, `MODEL_VIEW`, `PACK_VIEW`, `LAB_VIEW`, `ROBOT_VIEW`), plus new ones for Systems and Specifications.
- Models' modality and lab, and Labs' release distribution, which are applied outside the descriptors today, move inside them.
- Modality matches a model's input or output once.

The filter functions are rebuilt on these definitions. Every filter's URL key and meaning stays the same.

Every filter's `<select>` stays, hidden, as the state its restore, reset, and handoff paths already read (`SCOPE_CONTROLS`, `readScopeControls`, `resetScopeControls`, `clearScopeFacets`). The rail draws its values and labels from the select, and a choice goes back through the select's own `input` event. Counts never disable a select's options, so restore checks a shared link's value against the values the collection publishes, not the values enabled under the current filters, and a link whose value lists nothing under its other filters still restores. It then lands on the empty result's "Show it".

### 4. The list view

Results open as a list in every scope at every width.

- **Switching.** The bar's toggle switches to cards, and `layout=cards` records the choice. The list is the default and is never written.
- **One setting.** `layout` is one setting for the whole results page, not a scope key: a URL holding only `layout` still opens the front door, and the setting survives scope switches, Clear filters, and "Show it".

**One builder per record kind first.** Before the list class lands, the card templates collapse into one builder per record kind. A `mixed` option carries All's differences. The model, runtime, and inference cards that `renderAllDirectoryEntries` writes inline become calls to those builders. This closes the card half of `CR-20` in `BACKLOG.md`, and it leaves one place per kind for the list class to reach.

**A list row is a card.**
- **Same card, list layout.** A row is the same `article.project-card`, from the same card function, laid out by a list class. The class changes layout only, so every card contract in `docs/WEB.md` holds for rows by construction:
  - the whole row opens the record;
  - the Compare control and the emblem row stay separate targets;
  - the details control names the record.
- **Every fact.** Nothing the card prints is removed. The row lists the facts each kind's card prints today:
  - model sources on a service's footer;
  - a specification's version, scope, status, and steward;
  - a robot's maker and availability;
  - a pack's hosts and install mechanism;
  - a system's status word;
  - a lab's join counts and newest reviewed release;
  - "Not yet listed on models.dev".
- **The one exception is the description.** Above 720 px it is cut to one line; at 720 px and below it is hidden. Rows show every other fact the card prints.
- **Line one, identity:** the mark where the card has one (specification cards have none), the name, the leading type badge, the emblems, and the score in a comparable scope or the stars where the card shows them.
- **The following lines:** every other fact, in the card's order. They form one line where the facts fit and wrap to a second line rather than drop a fact, so a row is two lines on wide screens and up to three on phones.

The pager and page size are unchanged. The Cards layout is today's grid.

### 5. The record view

One record view replaces the eight record dialogs. The eight markup functions behind `RECORD_DIALOGS` render into it, so what each record shows is unchanged, and the view adds no emblem row, as the dialogs have none.

- **Two containers, one renderer.**
  - `#record-panel` is a labelled region inside the Directory's results.
  - `#record-dialog` is a modal dialog after `</main>`, beside the comparison dialog.

  The panel is not a `<dialog>`, because "/" stands down while any `dialog[open]` exists.
- **Beside the list.** At 1200 px and wider, a record opened from Catalog results opens in the panel beside the results.
  - The rail steps aside, one Filters tap away.
  - The opened row carries `aria-current="true"`, and the list keeps its scroll position.
  - The panel's bottom clears the comparison tray and the badge legend.
- **Full-screen.** The view opens full-screen as the modal dialog in three cases:
  - below 1200 px;
  - for a record opened from the Finder's shortlist;
  - for a `record=` URL loaded directly. That covers every share page's "Open in the directory" link and the front door's Elements "Full evidence" link, which ADR 046 calls the record's "existing evidence dialog".
- **Nothing scrolls sideways.** At 390 px a record's content fits the view's width. The OrcaRouter inference record overflows by 288 px there today (`BACKLOG.md`); it is the known case and gets its own test.
- **Focus.**
  - Opening moves focus to the record's heading.
  - Closing returns it to the row or card that opened it, or to the result count when that row is gone.
  - A control inside the view that changes scope closes the view and focuses the result count, as the Finder's handoff does. Examples are "Browse all in Models" and a "See all" link.
- **Previous and next.** The top bar shows the position ("3 of 45") and Previous and Next.
  - ← and → do the same while focus is inside the view and not in a field or a horizontally scrolling region such as a score or comparison table.
  - They step through the results in their current order across pages, and the list pages along.
  - The position and the buttons show only while the open record is in the current results. A query or filter change leaves the view open and hides them if the record has left.
- **History.**
  - **Pushes.** Opening a record from the results pushes one history entry, as the dialogs do. A link inside the view, such as a related record or the lab, pushes one more, so Back retraces it, as opening a lab from a dialog does today.
  - **Replaces.** Stepping and clicking another row while the panel is open replace the entry, so Back closes the panel.
- **Escape.** Escape closes an open listbox first, then the badge tooltip, and closes the view only while focus is inside it. The search box keeps its own native Escape, which clears it.
- **Unchanged:**
  - the `record=kind:id` values;
  - share pages;
  - Copy link;
  - the comparison dialog and tray;
  - the Compare control in comparable scopes.

### 6. Related records

The view ends with related records, chosen by the scope behind it.

- **In a comparable scope** (one system family, Inference services, Local runtimes, or reviewed Models), "On the same scale" lists up to five other active records of the same role (systems) or type. They are ordered as the scope's own score sort orders them, each with its score and a Compare control. "See all N" opens the scope narrowed to that role or type. Every record listed shares the profile (ADR 014).
- **Everywhere else**, including a record opened from the Finder, which has no scope behind it and no visible tray, nothing carries a score or a Compare control:
  - the successor or predecessor the record's data names;
  - a link reading "N other <role or type> records", which opens the scope narrowed to that role or type. There is no hand-picked list, so no five records are singled out.
- **More from <lab>**, in both cases, when the record joins a lab (an imported model joins through its namespace):
  - it gives the lab's other records as counts per collection, for example "Google: 45 models · 3 inference services · 2 specifications";
  - each count opens that collection with the Lab filter set, and the lab's name opens the lab's own record view, which lists every join.
  - "See all" for a lab is always the lab's view: All never lists specifications, so the Lab filter could not show them all.
- **Existing relations stay where they are:** a robot's related records, a pack's packaging formats, and a lab's joins. A robot's "N other <form factor> robots" sits below its existing related records, so nothing implies `related_models`.

This closes the backlog item "Show related records and previous/next navigation inside detail dialogs".

### 7. Suggestions while typing

This is the last PR, and the owner may drop it.

**The front door stays on the door.** The door's search becomes a combobox that stays on the front door while the reader types. Enter, a choice, or "See all results" opens results. That closes the Phase 2 follow-up recording the first-keystroke hand-off as a WCAG 3.2.2 change of context. If this part is dropped, that follow-up stays open.

**The listbox.** Under `#door-search` and `#results-search`, a listbox opens once the query has two characters. It offers, in order:

1. the Finder job the query names, by `matchFinderGoal`, the banner's rule;
2. up to five records across all eight collections in ADR 040 match order, each with its collection;
3. up to three labs, in match order;
4. up to three categories, whose families, roles, and types have names that match the query's words, each opening its scope narrowed to that category;
5. "See all results for “q”".

**Accessibility and order.**
- It follows the ARIA combobox pattern with `aria-expanded`, `aria-controls`, and `aria-activedescendant`: ↑ and ↓ move, Enter opens, and Escape closes.
- The live result count stays quiet while the listbox is open and speaks when it closes.
- Nothing in it is ordered by score.

### 8. URL and history

- **`layout`.** It holds `cards` when the reader chose cards, and restore removes any other value. It is global to the results and not a scope key (section 4).
- **`browseSort`.** This closes the first leftover without changing what `sort` means beside a query, and it makes `tests/e2e/front-door.spec.js`'s `test.fixme` a real test.
  - It holds the scope's sort from before a query.
  - It is written while the query lasts, only when the reader has not chosen a sort during it and the sort differs from the scope's default.
  - Restoring it makes clearing the query return to it.
  - Restore drops it when there is no query, when `sort` is present, when it is `match`, or when its value is invalid for the scope, such as `score` in Systems with no family.
  - It stays out of the facets, the chips, Clear filters, and "Show it".
- **`lab`.** It joins the scope keys of Systems, Inference services, Local runtimes, and Specifications. Models already has it.
- **Unchanged keys.** Facet keys, `q`, `sort`, `page`, `compare`, and `record` stay as they are, so Explore's links keep working: Models by distribution (#368), Local runtimes by feature (#372), and Systems by two of its filters at once (#377).
- **Restore.** `restoreFromURL({ boot })` restores the new keys like the others and drops what it cannot apply.

## Contracts that change

Phase 2's session listed the contracts Phase 3 must keep. These change, and `docs/WEB.md` and `tests/e2e/helpers/landing.js` move with them:

- **Search boxes.** `#door-search` stays. `#all-directory-search` and the other eight search boxes retire into `#results-search`.
  - The helper's `allSearch` becomes `#door-search:visible, #results-search:visible`.
  - `SEARCH_SCOPES` collapses to the two boxes.
- **`setDirectoryCollection`** keeps its signature and meaning (section 1).
- **`#scope-strip` markup** gains the visually hidden count text. Entry counts, the caption, and the family row read match counts while a query is present, and they update in place.
- **Collection panels.** The nine `.collection-panel` sections, their grids, result rows, job hints, empty states, and pagers keep their ids. Their `.control-panel`, `.filter-guidance`, and the three `.section-heading` blocks retire into the bar, the rail, and the scope note, and the kickers' ids move to the scope note.
- **The eight record `<dialog>` elements** retire into `#record-panel` and `#record-dialog`. The comparison dialog stays.
- **The Finder's handoff** still focuses the result count. `revealDirectoryResults` scrolls to the collection's results region.
- **The per-collection tables.** `renderers`, `pageRenderer`, `PAGE_CONTAINERS`, the grid list in `setDirectoryCollection`, and the per-scope reset blocks become one table keyed by collection id, modelled on `RECORD_DIALOGS`. The collection ids come from `AppCore.COLLECTIONS` rather than the four hardcoded lists. This closes the table half of `CR-20`, whose count is eleven edits to add a collection, and the Phase 2 follow-up on hardcoded whitelists.

Every other contract Phase 2 listed holds, and so does ADR 046's Elements map, with its reference sheet and its `element` and `elementRecord` parameters:

- `AppCore.COLLECTIONS` and its helpers;
- the front-door and strip markup;
- `state.directoryStage`;
- `openCollection`;
- `renderScopeStrip`;
- `syncDoorDots`;
- `restoreFromURL`;
- `resetScopeControls`, which still reads the hidden selects;
- the pushed front-door entry;
- a comparison kept off the front door's URL;
- the keyboard focus on the pressed entry after a tile opens;
- the breakpoints of 1000 px and 1407 px.

## Docs and ADR

**No new ADR.** Each part keeps a decision an ADR already records:

- The record view renders each canonical record as the dialogs did, which is what ADR 013 asks of "collection-specific detail dialogs".
- The Lab filter reuses ADR 041's join and lists labs A–Z, never ranked.
- Packs' counts respect ADR 035, and Packs gets no Lab filter.
- "On the same scale" stays inside one score profile (ADR 014).
- `browseSort` extends ADR 040's URL sort rules without changing them.
- Labs and Specifications as Catalog collections, which one query and the strip's counts rely on, rest on ADR 043.
- The full-screen record view is the "existing evidence dialog" that ADR 046's Elements links open. It renders the same record, so ADR 046 needs no amendment.

If later review finds a decision-level change, the ADR takes 047:

- 042 is the badge session's;
- 043 is the front door;
- 044 is #380's;
- 045 is robot software (#373);
- 046 is Elements (#384).

`docs/WEB.md` changes in the PR that makes each part true:

- **Content hierarchy.**
  - Each scope's "keep … visible" line becomes its rail groups, in rail order.
  - The Systems "More filters" line goes.
  - The Robots line notes the two-value rule.
- **Behavioral contracts:**
  - one search box, and the restated query rule;
  - the deleted sentence about sibling views never receiving a carried query;
  - index loading;
  - the strip's match counts;
  - the empty result's collection buttons;
  - chips instead of "More filters · N active", with the same guarantee;
  - the "Finder:" chip's place;
  - list rows are cards;
  - the record view, previous and next, and related records;
  - `layout`, `browseSort`, and `lab`;
  - the Escape order.
- **Verification.** Steps 2, 4, 11, 19, 20, 22, 30, 31, 32, 33, 34, and 35 name More filters, cards, or dialogs, and are reworded. Step 36 (Elements) opens its full evidence in the record view. New steps cover the rail, the list, the panel, and suggestions.

`BACKLOG.md` closes these items:

- the Phase 3 item;
- the related-records item;
- the two leftovers, "Keep a sort chosen before typing in the URL" and "Point an empty result at Labs and Specifications";
- `CR-21`, and the card and table halves of `CR-20`;
- the OrcaRouter overflow item;
- these "Phase 2 follow-ups", each in the PR that rewrites its code:
  - the phone caption's hidden count;
  - the strip rebuilt with `innerHTML`;
  - the hardcoded collection whitelists;
  - `restoreFromURL` clearing `urlReady` without a `try`/`finally`;
  - a tile from the door painting the hidden collection twice;
  - `setPageSize` repainting hidden grids;
  - the phone family row's smallest text, whose unpressed counts hide at phone widths as the scope row's caption pattern does;
- with part 7, the door's WCAG 3.2.2 follow-up.

It adds "Let a filter take several values".

## Tests

Work starts with the test helpers, as Phase 2's did. On `main` at a4eb95dd, the 23 end-to-end spec files reach the controls this phase moves through three kinds of reference, in 21 of the files:

- the per-collection search boxes, 132 times;
- filter and sort selects, 125 times, and the Clear buttons 17 more;
- the eight dialogs, 166 times.

Two of those references are new: `elements.spec.js`, from #384, reads the Role filter and the system dialog.

The grids (227 references), result counts, panels, and pagers keep their ids and need no change. The first PR moves every one of those steps onto helpers in `tests/e2e/helpers/`, with no markup change:

- `search(page, text)` and `searchBox(page)`;
- `setFilter(page, key, value)` and `clearFilters(page)`;
- `recordView(page)` and `closeRecord(page)`;
- `setLayout(page, layout)`.

`explore.spec.js`, which reads Models and Local runtimes controls, grids, and dialogs, moves onto the same helpers.

Then, with each part:

- **Unit (`tests/test_web.js`):**
  - group definitions: the group's own choice left aside, array-valued fields, the two-value rule, zero counts, Packs over packs only, labs A–Z;
  - strip match counts against each default view;
  - the query rule's resets;
  - `browseSort`'s write-and-restore rules;
  - restore against published values;
  - step order across pages;
  - related-record selection: one profile only, active only, the lab counts, imported models by namespace;
  - suggestion grouping.
- **Browser (`tests/e2e/`):**
  - Search and the strip:
    - one search box across every scope, and the strip's match counts;
    - `hangzhou` from the front door, reaching Labs through the empty result's button;
    - a restored `q` surviving boot and Back;
  - Filters:
    - rail counts in place, chips, and Clear filters;
    - Packs' counts;
    - the phone sheet's live count;
  - Rows and layout:
    - list rows carrying every fact their card carries, for each record kind;
    - the layout toggle and `layout=cards` on reload;
  - The record view:
    - the side panel at 1280×800 and 1440×900, with ← and →, a clicked row, and Back;
    - the full-screen view at 390 px and from a direct `record=` URL;
    - the two related sections, and More from a lab;
  - The combobox's keyboard path, and staying on the door.
  - Goal 1's counts in Systems and Models at both sizes.
- **The verification matrix** runs in full before each PR.

## Coordination

- **Phase 2** (the "Fast filter nav bar redesign" session) is fully on `main`: #365, #370, and #374, ADR 043. It handed the Directory files to this phase.
- **The badge session** owns the key strip and legend. Its "grid on screen" anchor moves again, because results start with the list. It is told before PR 4. The side panel clears the legend. Rows render the card's own badge row, so its placement rules carry into rows unchanged: the type badge first, and the maker-risk flag of ADR 042 second.
- **The Robots session.**
  - Robots get the no-score related line below their existing related records.
  - The rail carries #373's Capability filter under its `capability` key.
  - No robot data shape changes.
- **Explore** (#368, #372, #377) links in by URL keys that Phase 3 keeps. The backlog's planned lab relationship view in Explore is to "share the relationship navigation with the Maker work". So "More from <lab>" and the Lab filter are that navigation, and the relationship view should reuse them.
- **Elements** (#384, ADR 046) keeps its map, its reference sheet, and its `element` and `elementRecord` parameters. Leaving the door still removes them. Its "Browse all matching systems" link opens Systems with the family and role set, which the rail shows as chips. Its "Full evidence" link opens the full-screen record view. The suggestions listbox of part 7 opens under the door's search, above Elements.
- **The AI labs session**, which runs in the cloud and cannot reply, is told that the Lab filter spans five collections and that records list "More from <lab>" counts.

## Sequence

One PR per step, each green before the next:

1. The test helpers, with every call site moved and no markup change.
2. The frame and one query:
   - the bar, the chips row's place, the result row, and the scope note;
   - the strip's match counts, updated in place;
   - the empty result's collection buttons, `browseSort`, and the restated query rule;
   - the 150 ms pause (`CR-21`), and one table per collection (the table half of `CR-20`);
   - the `restoreFromURL` `try`/`finally`, the hidden-grid repaints, and the phone family row's counts.
3. The filter rail: group definitions and counts, the rail, the chips, the phone sheet, and the Lab filter. "More filters" and the dropdown rows retire, and a tile from the door paints its collection once.
4. The list view: first one card builder per record kind (the card half of `CR-20`), then rows as cards, the toggle, and `layout`. Goal 1 is measured here.
5. One record view, full-screen everywhere, replacing the eight dialogs, with no sideways scrolling at 390 px (the OrcaRouter case).
6. The side panel beside the list, previous and next, and related records.
7. Suggestions while typing, and the door that stays on the door.

Each PR carries its own `docs/WEB.md` change and verification steps, and closes the backlog lines it makes true.
