# Design: the Directory opens on a front door

**Date:** 2026-09-24
**Status:** Direction approved by the owner on 2026-09-24 (direction B of the 2026-09-23 landing review). This written spec awaits owner review. Phases 0 and 1 are specified in full; Phases 2–5 each get a short spec before they start.

## Problem

Measured on `main` at 98d52c6, which served the same asset hashes as the live site on 2026-09-23, with Playwright at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 in both themes:

- No Directory card sits above the fold at any of the five sizes. On a 1440×900 laptop the first card starts at 917 px; at 1024 and 768 wide the collection switcher is below the fold too.
- Typing a search produces no visible response on a laptop. At 1440×900 the result count renders at 873 px, under the badge key strip (860–900 px); at 1280×800 and narrower it is below the fold.
- Search is one literal substring (`web/app-core.js` `matchesSearchTerm`), ordered A–Z (`filterDirectoryEntries`). "ollama" lists Ollama 17th of 20. "run models locally", "memory for agents", "open source coding agent", "chat with my documents", and "self hosted" return nothing, while "self-hosted" returns 51. "rag" (69) and "mac" (44) match inside other words. "olama" and "lang chain" return nothing, with no suggestion.
- The Finder's shortlist is the most useful answer on the site, but it sits behind a tab, opens by asking for a taxonomy family, cannot be shared (`?view=finder` only), and "Browse matches" lands on the hero with the role set applied invisibly and the chosen priority replaced by "Editorial score".
- The quick-filter switcher mixes three levels in one row, leaves the Directory for Models, omits Specifications, marks two chips pressed at once (`syncCollectionSwitcher`), counts archived and superseded records the default view hides (Systems 207 lists 195), and is 1,234 px wide inside a 364 px frame on a phone. A Robots chip joins it as a tenth (ADR 037, merging now), and `BACKLOG.md` queues Papers.
- Only `collection`, `compare`, `record`, and `view` reach the URL (`writeDirectoryURL`, `writeViewURL`, `writeRecordURL`). A family chip, a query, and every filter vanish on reload.
- On a 390 px phone the primary navigation was 12 px wider than its frame and clipped "Blog"; `docs/WEB.md` verification step 24 says every tab fits. #293 added a Labs tab and tightened the phone gap, and on 2026-09-24 the nav was still 1 px over at 390 px, 16 px at 375 px, and 31 px at 360 px.

## Goals

1. Every visitor has a first move above the fold: look up a name, start from a job, or open a collection.
2. A search returns what was meant. Known names come first, multi-word and loosely spelled queries work, and nothing is ever ordered by score.
3. The Finder's shortlist is reachable from the landing page and can be shared.
4. The Directory's layout takes new collections as tiles and tabs, not as chips.
5. Every state a reader can reach can be linked, reloaded, and restored.

## Non-goals

- No change to what a score means, which records compare, or what a badge may claim (ADR 014; `docs/WEB.md` "Card badges").
- No new editorial fields and no data-model change before Phase 5.
- No request outside the site's origin, no dependency, no server-side or model-based search.
- The wordmark and the peacefulcoexistance/Atlas naming.
- The badge key strip's behaviour, which the badge session owns.

## Target design

The end state after Phase 4. Each point names the phase that builds it; Phases 2–5 get their own short spec, which must hold to these rules.

1. **Search orders by match, never by score or stars** (Phase 1). With a query, every Directory scope, Models, and Specifications orders results by match. With no query, each keeps its current order: All, Agent packs, Specifications, and Robots A–Z, and scored scopes by their default sort.
2. **The Directory opens on a front door** (Phase 2). One short value proposition, one supporting sentence, one search box, and the Finder's jobs as its entry points, then an index of collections. The mixed All grid stays one step away as "Everything, A–Z", unchanged in content and order.
3. **The index and scope tabs are the quick filters** (Phases 2–3). Every collection keeps a visible entry: a tile on the landing page, a tab on results. Tiles carry the collection's name, the count its default view lists, and its largest categories as links. They carry no definitions, which stay in Taxonomy, and no example marks, since choosing them would need a ranking the unscored collections forbid. Models', Labs', and Specifications' tiles and tabs open their sibling views (ADR 008, ADR 013, ADR 041). Tiles and tabs come from one registry, so Robots, Papers, and any later collection each add one entry, hidden while the collection is empty. The Models tile shows reviewed and imported counts separately (ADR 027).
4. **A list row is a card** (Phase 3). The list view prints, in two lines, every fact the card it replaces prints: mark, name, collection with native classification or imported status, licences, source model, stars where the card shows them, emblems, and a score only in a comparable scope. Every card contract in `docs/WEB.md` applies to rows unchanged.
5. **Records open beside the list on wide screens** (Phase 3). Next and previous replace the history entry, so Back still closes the panel. Phones, and any `record=` URL opened directly, get a full-screen view. Inside a comparable scope (one system family, Inference services, Local runtimes, or reviewed Models) the panel lists other active records of the same role or type, with their scores and a Compare control. Everywhere else it lists related records from existing family, role, and successor data, with no score and no Compare, as `BACKLOG.md` already asks. ADR 014 is unchanged.
6. **The Finder fits on one screen** (Phase 4). All goals appear at once under plain headings, each still mapped to exactly one family or type. Up to two priorities are allowed, still as preferences. Phase 4 first rebalances the local priorities (the `BACKLOG.md` item on `local_first` outweighing data sovereignty) and defines how two priorities combine, then amends "Guided finder" in `docs/TAXONOMY.md`.
7. **Every reachable state is addressable** (Phase 0, extended by each phase). See "URL state and history".
8. **Explore and What's new wait for their data** (Phase 5). What's new needs a first-seen date, because `verified_at` moves on re-review. Any new field stays out of the boot payload's `BOOT_FIELDS`.

### Collections in flight

- **Robots.** ADR 037 is being built on `claude/robots-collection-plumbing` and merges before Phase 0. Its Directory scope works like the other scopes: a switcher chip, hidden while the collection is empty, until Phase 2 turns it into a tile and a tab. Its facets (form factor, AI basis, availability, status) reach the URL through its view descriptor. `ROBOT_VIEW` in `web/app-core.js` has the `{ searchFields, facets }` shape. Its facets `formFactor`, `aiBasis` (array-valued), `availability`, and `status` become URL keys like every other scope's. Its search index joins ranked search: the form factor is the category label, `manufacturer` is the maker, and vendor-named models (`named_models[].name`) rank as other indexed prose. Its list rows print the card's facts, plus any emblem if the badge session's later robot badges on `ai_basis` land. Its records always get the no-score, no-Compare panel. `?collection=robots` and `record=robot:<id>` already work while the chip is hidden. The Robots PR also makes the switcher wrap to a second row on desktop and scroll, with the active chip in view, at 720 px and below; Phase 2 retires both. ADR 040 amends ADR 037's alphabetical rule for searching, with the Robots session's agreement.
- **Labs.** Landed on 2026-09-24 in #293 and #294 under ADR 041: an unscored sibling view with its own nav tab, filters (type, headquarters, release distribution), search index (`app/search/labs.json`), dialogs, and share pages. `labRelations` in `web/app-core.js` joins a lab to the records the catalog already has by name, every record dialog links to its lab, and Models has a Lab filter. In this design:
  - Labs gets an index tile and a results tab that open the Labs view carrying the query, as Models and Specifications do.
  - Its index joins ranked search, with `lab_type` as the category label and the catalog names a lab stores as other indexed prose.
  - In Phase 3 `labRelations` becomes a Maker facet across collections, and a record's panel lists "More from <lab>" as related records, with no score and no cross-collection Compare.
  - The Labs group in `BACKLOG.md` lists a landing-page tile, which Phase 2 builds.
- **Type badges.** #293 also gave every card a leading type badge, a fourth badge family, and amended `docs/WEB.md` "Card badges" to match. List rows print the type badge like every other card fact, and Phase 3's filter rail is where its design places a type facet. Robots have no type badge yet: the owner decided on 2026-09-24 that they get one on `form_factor` once PR 3 publishes records, and until then `docs/WEB.md` records robots as the interim exception.
- **Papers.** ADR 033 is still Proposed; if accepted, Papers gets a tile and a tab like any other collection.

Removed after the refutation review: a "How records are made" aside beside the search. Its licence and authorship lines were false for web-page evidence, for imported models.dev rows, and for LicenseRef-Unclear records, and its score line repeated the footer (`docs/WEB.md` "do not repeat the taxonomy thesis").

## Phases

| Phase | Outcome | Size |
|---|---|---|
| 0 | Fixes that hold under any direction; state in the URL | S each, independent PRs |
| 1 | Search that ranks, suggests, and explains an empty result | M |
| 2 | The front door replaces the hero and the switcher on the landing page | M |
| 3 | Results page: scope tabs, filter rail, list view, record side panel | M–L |
| 4 | Finder on one screen, shareable, straight to Compare | M |
| 5 | Explore and What's new, after their data decisions | M–L |

Phases 2–5 each get a short spec before work starts, checked against this one.

## Phase 0 — fixes

Each item is one PR with its own e2e assertion.

1. **One selected chip.** When a family chip is active, "Systems" is not pressed. `aria-pressed="true"` appears on exactly one switcher button. The Systems chip clears any family, so it lists every active system.
2. **Counts match what they show.** Every chip counts what its scope lists by default. Systems and the family chips count active records; All keeps counting everything it lists, archived references included.
3. **State in the URL.** The Directory writes `family`, `q`, every non-default facet, `sort`, and `page` for the active scope (see "URL state and history"), with `replaceState`. Restoration drops unknown or incompatible values rather than applying part of them.
4. **The phone nav fits.** At 390 px, and at 360 px, every primary tab is fully visible without scrolling the nav.
5. **The active view is announced.** The active primary tab carries `aria-current="page"`.
6. **Whole-card click.** Clicking a card or its title opens the record, through one stretched link from the card's details control. The card's own controls stay separately clickable above it: Compare, and the emblem row (`ul.card-badges`, which also carries ADR 042's flag emblems), raised in stacking order so a tap on an emblem opens its tooltip and nothing else. The stretched link never sits inside the emblem row, and emblems stay out of the tab order. The details control's accessible name includes the record name ("View details for Claude Code"). `tests/e2e/card-badges.spec.js` gains a touch-viewport case: tapping an emblem opens the tooltip and neither opens a dialog nor changes the URL.
7. **Finder fixes.** A choice keeps the step indicator in view below the sticky header. Goal and priority cards drop the default "Choose this" cue. "Browse matches" scrolls to the results rather than the hero and shows the Finder's role set as a visible, removable filter chip.
8. **Hero map legend.** Legend swatches match the node colours, or the legend goes. The map itself leaves in Phase 2.
9. **API page accuracy.** The `license-evidence.json` description says evidence is "pinned to the exact file or page it was read from". `docs/DATA_MODEL.md` gives web evidence "no claim of immutability", so the line says files are pinned and web pages are dated.

## Phase 1 — search that ranks

### Matching

Queries and indexed text are compared as words:

- **Normalise.** Unicode NFKD with combining marks removed, lower case, and every run of characters other than letters, digits, `.`, `+`, and `#` becomes a space. A word containing `.`, `+`, `-`, or `#` also counts as its parts, so "llama.cpp" matches "llama" and "cpp".
- **Tokens.** Drop a short stop-word list (a, an, the, for, with, my, to, of, and, on, in, i, me). Stem query tokens lightly: plurals (-s, -es, -ies), and -ly, -ing, -ed on words longer than five letters.
- **Every token must match** somewhere in the record's searchable text (AND).
- **Word starts in prose, anywhere in names.** A token of four or more characters matches the start of any word, and anywhere inside a word of the record's name. A three-character token matches a whole word anywhere, or the start of or anywhere inside a word of the name. A two-character token matches a whole word anywhere or the start of a word in the name. So "pi" finds Pi but not API, "rag" finds RAG but not storage, and "gpt", "memory", and "chain" still find ChatGPT, agentmemory, and LangChain, whose names are compounds. A one-character token matches the start of a word in the name, as today. This drops mid-word matching inside prose, which `tests/test_web.js` "indexed search keeps infix matching, which is why the index is raw text" asserts today; that test changes to prove the index is read through a whole word, and new tests pin both halves of the rule.
- **Joined words.** For a multi-word query, each adjacent pair is also tried joined ("lang chain" as "langchain"); records whose name matches the joined form are included and ranked as name matches.
- **Searchable text** is unchanged: the per-collection search indexes in `web/app/search/`, falling back to boot fields until an index arrives. No payload grows.

### Order

While a query is present, results are ordered by match, never by score or stars:

1. Each token takes the weight of the best field it hits: name 50 (12 if not every token hits the name), category label (role or type name) 30, maker (repo, operator, maintainer, developer, or steward) 20, description 10, other indexed prose 3. A whole-word hit counts in full, a word-start hit at 0.8, a mid-word hit inside the name at 0.6. The weights are starting values: the implementation tunes them against the probe fixtures in the Testing section, not by eye.
2. Bonuses: the whole name equals the query +1000; the name starts with the query +400; every token is in the name +200.
3. Among equal matches, active records come before archived, superseded, and unavailable ones.
4. Ties break by name, then collection, as today.

With no query, every scope keeps its current order: All and the unscored scopes A–Z, scored scopes by their default sort.

In scopes that have a Sort control, a query selects a new "Best match" option unless the reader has picked a sort since typing; clearing the query restores the previous sort. Scores stay visible wherever they are visible today; "Best match" only decides order.

### Suggestions and empty results

- **Did you mean.** When nothing matches, offer up to three record names within an edit distance of 1 (queries up to seven characters) or 2 (longer), whole-name matches first. Choosing one replaces the query.
- **Jobs.** When the query's tokens match a Finder goal's label and description (at least 60% of tokens, and at least one), a banner above the results offers "Looks like a job: <goal>. The Finder can shortlist from N reviewed records." It opens the Finder with that goal chosen and the priority step showing. At most one banner shows.
- **Empty state.** "No matches for “q”." Then any did-you-mean names, a link to the Finder, and "Suggest it for review", which opens the system-suggestion issue form with the Name field filled in. When the normalised query equals an entry's name in `exclusions.json`, the empty state also says "Reviewed and left out" with that entry's reason; the file loads only when an empty state needs it.
- **Visible feedback.** The result count moves inside the search panel, next to the input, so a query's effect shows without scrolling at every tested size.

### Keyboard and scope

- "/" focuses the visible search box when focus is not already in a field.
- One query follows the reader: switching Directory scope carries the text into the new scope's box and re-runs it; a scope's Clear control clears it everywhere.

## URL state and history

A parameter is written only when it differs from its default. Restoration removes any value that is unknown, malformed, or incompatible with the restored scope, never applying part of it, as `docs/WEB.md` already requires for `view` and `compare`. Where parameters disagree, `record` decides the view (unchanged), and `compare` decides the scope and family, so a disagreeing `family` is removed.

History, through Phase 1: every Directory parameter is written with `replaceState`, and only `record` pushes an entry, so a `popstate` is still always a record change (`syncRecordWithHistory`).

From Phase 2 the landing page and the results page are two states, and moving from the front door to results pushes one entry, so Back returns to the front door. Filter, sort, page, and query changes inside results keep replacing. `syncRecordWithHistory` becomes a general restore that re-reads view state as well as the record. What each URL means from Phase 2:

- A bare URL opens the front door. `collection=all` names the A–Z list; today a missing `collection` means All.
- A `record=` URL with no `collection`, the form all 615 share pages link to, opens the record over its own collection's results, so closing it lands somewhere related.

Phase 2's spec settles the details. These rules are fixed now so Phase 0's parameters don't need renaming later.

| Parameter | Scope | Value | Phase |
|---|---|---|---|
| `view` | any | view id (unchanged) | existing |
| `collection` | Directory | `systems`, `inference`, `runtimes`, `packs` (unchanged) | existing |
| `record` | any | `kind:id` (unchanged) | existing |
| `compare` | Directory, Models | `kind:id,id` (unchanged) | existing |
| `family` | Systems | a `system_families` id | 0 |
| `q` | any searchable scope | the query text | 0 |
| filter keys | the active scope | one parameter per filter, named after the key the scope's `app-core.js` filter already reads: `directoryDefaults()` for Systems and the view descriptors' `facets` elsewhere (for example `role`, `license`, `type`, `delivery`, `accelerator`, `host`, `formFactor`). `roles`, the Finder's multi-role set, stays out of the URL until the Finder's URL state (Phase 4) | 0 |
| `sort` | scopes with a Sort control | a sort option id | 0 |
| `page` | paged grids | page number above 1 | 0 |
| `job`, `prefer` | Finder | goal id; up to two priority ids | 4 |

## Contract changes

Two ADRs, each landing in the PR that makes it true, so `docs/WEB.md` never contradicts an accepted decision:

- **ADR 040, "Search orders by match, never by score"**, lands with Phase 1. On `origin/main`, 039 is the OpenRouter cross-check (#292) and 041 is Labs (#293); the badge session's reviewed-flags ADR moves to 042. It amends ADR 013's All bullet ("alphabetical discovery") and ADR 032's "The scope is alphabetical only": both hold while browsing, and a query orders by match. It amends ADR 037's "They are listed alphabetically" the same way, named in the same sentence as ADR 013 and ADR 032. The Robots session, which owns ADR 037, agreed on 2026-09-24. ADR 037's other rules stay untouched: no score, comparison, badge, or Finder goal. The number is claimed.
- **A front-door ADR**, numbered when Phase 2 lands, amends ADR 013's quick-filter wording ("a visible quick-filter destination", "reachable from the quick filters"), so tiles and scope tabs count as the quick filters, and names the front door as the Directory's default.

Neither touches ADR 013's reasons for Specifications as a sibling view, or anything in ADR 014.

`docs/WEB.md` changes phase by phase, each change in the PR that makes it true:

| Phase | `docs/WEB.md` changes |
|---|---|
| 0 | "Behavioral contracts": collection controls, URL parameters; verification steps 2 and 26 |
| 1 | "Behavioral contracts": the one- and two-character search rules become the matching rules above; All, Packs, Specifications, and Robots ordering while searching; verification step 11 |
| 2 | "Content hierarchy": the landing page's parts, the switcher line, the default Directory scope. "Visual language": the atlas map and "the only filled segmented control". Verification steps 18, 20, and 27 |
| 3 | "Content hierarchy": "More filters" and its count, which the filter rail and its chips replace with the same guarantee (no active constraint is hidden). "Behavioral contracts": record dialogs become record views; list rows are cards. Verification steps 31 and 32 |
| 4 | "Guided finder" in `docs/TAXONOMY.md`, and the Finder contracts in `docs/WEB.md` |

Each ADR joins the routing manifest in `tests/test_documentation.py` and is linked from `docs/WEB.md` in the PR that adds it.

## Testing

- `tests/test_web.js` covers the pure rules: normalising, tokens, stop words, stemming, the short-token rules (the Pi/API and RAG/storage guards), AND, word starts, joined words, ranking order, the rule that score never affects order, did-you-mean, and job matching, each against fixtures.
- Playwright covers the reader's paths: "ollama" puts Ollama first in All; "self hosted" and "self-hosted" return the same set; "olama" offers Ollama; an empty result offers the Finder and the suggestion link; `q` and every Phase 0 parameter restore on reload; "/" focuses search; a query follows a scope change; "Best match" selects itself and gives way.
- Ranking fixtures come from the 2026-09-23 probe queries, each pinned to an expected first result or an expected set: "ollama" → Ollama, "cursor" → Cursor, "openrouter" → OpenRouter, "claude code" → Claude Code, "lang chain" → LangChain, "olama" → a suggestion of Ollama, "self hosted" = "self-hosted", "rag" → only whole-word RAG records, "pi" → Pi and never an API-only match, "gpt" → includes ChatGPT.
- The `docs/WEB.md` verification matrix gains the new steps, and each phase runs the full matrix before its PR.

### What existing tests change

An inventory of the suite on 2026-09-24 found no shared navigation helper: every test drives the landing page inline.

- Phase 0 changes the switcher's pressed-state assertions in `tests/e2e/directory-search.spec.js` (the Memory, Agents, and Assistants chip test expects both Systems and the family chip pressed) and adds URL-restoration cases where `?collection=systems` restores an empty family today.
- Phase 1 changes the search unit tests in `tests/test_web.js` (A–Z order of `filterDirectoryEntries`, the infix test above) and every e2e case that asserts a mixed-search result's position.
- Phase 2 is the expensive one: 16 call sites type into `#all-directory-search` and about 30 click or read switcher chips by accessible names such as `/^All /` or exact `Models 427`, and several tests find the "Taxonomy", "Specifications", "Models", "Finder", and "Directory" buttons by name, so a new tile or tab with the same word collides. Phase 2 starts by adding one landing-navigation helper to `tests/e2e/helpers/` and moving those call sites onto it before any markup changes.
- The hero itself is nearly unpinned: one test counts the atlas map's five nodes and orbits, and one taps the page's first `h1` as an outside target on a phone.

## Coordination

The badge session owns the key strip. Its ADR 039 (reviewed flags) work touches `web/app.js` (reviewed-model cards, dialogs, legend, Taxonomy), the badge block in `web/app-core.js`, `web/styles.css`, `scripts/build_web_payload.py`, `scripts/build_share_pages.py`, and `docs/WEB.md` "Card badges".

- Phase 0 starts after that session's model-badge PR (#290, merged at 4f28ca0) and its robots PR.
- Each Phase 0 and Phase 1 PR's file list goes to that session before the first commit.
- Whichever PR merges second rebuilds the generated asset stamps.
- ADR 040 is claimed here. Their reviewed-flags ADR collided with #292's 039 and moves to 042.

The Robots session builds ADR 037 on `claude/robots-collection-plumbing`, and Phase 0 starts after its PR merges. The AI labs session shipped Labs (#293, #294) and was told how Labs maps into this design; it runs in the cloud and cannot send messages back. Two OpenRouter cloud sessions (the ADR 039 cross-check and the first import) were told the ADR claims and the web files in flight. Two Codex worktrees (`codex/curate-agent-systems-batch-40-41`, `codex/refresh-agent-instructions`) change catalog data and agent instructions, so they only meet this work in generated files.
