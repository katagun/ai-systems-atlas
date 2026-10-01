# Design: the Finder on one dense screen

Phase 4 of the [Directory front-door design](2026-09-24-directory-front-door-design.md), the part its Phase 3 spec named as "the Finder's own screen and URL state" and its `BACKLOG.md` line records as "Front-door Phase 4: the Finder on one screen, shareable through its own URL parameters, and straight to Compare."

It replaces the three-step wizard with one screen of counted job tiles in the front door's Elements vocabulary, and it gives the shortlist the directory card's treatment. The ranking rules, the goal tables, and the eligibility rule do not change; only what the reader sees, and what the URL carries, change.

Measured on `main` at 3ac267c4 with Chromium at 1440×1000 on 2026-09-30. Every figure below was measured, not transcribed; `uv run python scripts/measure_engineering.py` reports the code counts.

## Problem

The Finder is the least dense surface in the app, and the front door already holds everything it asks for.

**Measured density.** Averaged over each surface's repeated card, as box area per character of rendered text:

| Surface | Cards | Mean size | Chars each | px per char |
|---|---|---|---|---|
| Front-door role tile | 19 | 188×121px | 32 | 711 |
| Collection tile | 9 | 370×158px | 79 | 740 |
| Finder choice, step 1 | 5 | 304×180px | 138 | 397 |
| Finder choice, step 2 | 7 | 410×180px | 104 | 710 |
| Finder shortlist card | 3 | 408×587px | 731 | 328 |

**Measured page cost.** At 1440×1000 the whole front door is 2038px: a headline, one search box, five job pills, all 19 role tiles, all 9 collection tiles, and their counts. Sixteen of the nineteen role tiles are above the fold. The Finder spends 1904px on step 2's seven choices and 1982px on step 3's three cards, and shows no counts at any step.

Five defects, each with its code:

1. **Two headlines say the same thing.** `#finder-title` is "What should the system help you do?" at `clamp(3rem, 6.3vw, 6.4rem)`, and `renderFinder` then renders "What should it do?" at `3.7rem` inside the shell. The pair occupies roughly 330px of the fold to say one thing twice.
2. **Cards are 180px tall to hold a sentence.** `.finder-choice` sets `min-height: 180px` for a cue line, a label, and two lines of description. The front door's tile is 112px and carries a symbol, a count, a name, and organization marks.
3. **Orphan rows.** `.direction-grid` fixes four columns for five directions, so "Run models on hardware I operate" sits alone on a second row. Seven agent goals in a three-column grid leave 3/3/1.
4. **The stepper is 1360px wide and holds three words.** `grid-template-columns: repeat(3, minmax(120px, 1fr)) auto` spreads "Direction", "Job", and "Priority" about 400px apart, so they read as three labels rather than one stepper.
5. **A fixed 480px of reserved emptiness.** `.finder-content` sets `min-height: 480px` under `padding: clamp(1.5rem, 4vw, 3.2rem)`, so the shortest step is mostly padding.

**The front door already answers every question the Finder asks, with counts the Finder omits.** Extracted from the live page:

| Finder question | Front-door answer | Count shown there |
|---|---|---|
| which direction | Elements group heading | `62 active`, `131 active`, `17 active` |
| which direction, for inference | the Inference services tile | 60 across four category chips |
| which direction, for runtimes | the Local runtimes tile | 17 across four category chips |
| which job | one of 19 role tiles | a count on every tile |
| how many will match | nowhere | nowhere |

The Finder's own goal tables are wider than the door's role list, because one goal can span several roles. Measured eligible counts, per goal in table order:

```
memory_system       5 goals  [12,  9, 33,  3, 10]   family total 62
agent_system        7 goals  [ 7, 48,  6,  3,  6, 19, 42]   family total 131
assistant_system    3 goals  [11,  2,  4]          family total 17
inference_service   4 goals  [20, 12, 15, 13]      total 60
local_runtime       4 goals  [ 4,  6,  5,  2]      total 17
```

The goal counts sum to more than the family totals — memory's goals sum to 67 against 62 active systems — because `context_graph_engine` is claimed by both `agent_memory` and `memory_infrastructure`. So a rendered count is per goal and never summed into a column total. This is a rendering rule the redesign must honour, not a data bug.

**The answers are not shareable.** `docs/WEB.md` records the Finder's role set as the one filter deliberately left out of the URL, because the wizard had no screen for an answer that a URL could name. Three sequential screens are the cause; `BACKLOG.md` Phase 4 is the consequence.

## Goals

1. **One screen.** Every direction and every job is listed at once, with a count. Measured at 1440×1000 on the built screen, the bottom of the tallest column's last tile — the agent column's seventh, "Build and orchestrate agents" — sits at 953px, inside the first screen with 47px to spare. The priority row follows the tiles at about 1060px, adjacent to the shortlist it ranks.
2. **Counted, concrete language.** Every tile carries a number. The shortlist heading names the count it is drawn from. The prose that currently describes the step becomes the selected job's one-line summary.
3. **The shortlist reads as the directory.** The handoff button's target and the cards it lands on are the same card, so "Browse matches" is not a change of subject.
4. **Every answer has a URL.** `?view=finder&direction=…&job=…&prefer=…` restores a shared link to the same three answers and the same shortlist, and Back retraces them.
5. **Nothing in the ranking, eligibility, or editorial copy changes.**

## Non-goals

- **The ranking rules.** `priorityBoost`, `recommendationReasons`, `scoreDimension`, the `match` formula, and the `.slice(0, 3)` cap stay as they are (`web/app-core.js:1853`, `:1896`, `:1852`; `web/app.js:2455`).
- **The goal tables.** `FINDER_DIRECTIONS`, `FINDER_GOALS`, `FINDER_PRIORITIES`, `FINDER_DIRECTION_NAMES`, and `FINDER_DETAIL_KINDS` keep their ids, labels, and descriptions.
- **Several priorities at once.** One priority is chosen, as today. The chip row is a radio group, not a multi-select; "up to two priority ids" stays a backlog item.
- **The shortlist's length.** Three cards, as today.
- **Straight to Compare.** The handoff is unchanged and lands on the Directory, not on Compare. Compare stays the Directory's control.
- **The front door itself.** The door keeps its layout, its Elements map, and its own reference sheet (ADR 046). This spec changes what `?view=finder` draws.
- **Mobile below the Finder.** The phone bar keeps Home / Search / Finder / Explore / More (ADR 046) and the Finder stays one column there.

## Design

### 1. One screen

`renderFinder` draws one layout at every state. There is no step machine, so `state.finder.step` goes away and `state.finder.answers` becomes the whole state.

Above the tiles:

- the view heading, one `h1`, at the door's scale rather than the landing scale. `index.html:306` keeps its id and its text; the size comes from `.door-title` (`web/styles.css:521`). The two lines under it stop promising three questions: the `.eyebrow` at `index.html:305` reads "Counted, ranked, reviewed", and the subheading at `index.html:308` reads "23 jobs across five directions, 287 active records. Choose one to see its three strongest reviewed matches." The in-shell `h2` is gone; its place is an `.eyebrow` summary line. Both strings are counts, not adjectives.
- the summary line, which is the only prose on the screen, and which is always specific:
  - nothing chosen: "23 jobs across five directions, 287 active records."
  - a job chosen: that goal's own `description`, then "N active records match · ranked for “<priority label>.”"
- the priority chip row, which is always visible and disabled until a job is chosen. It is `.door-jobs` made of radios: the family's priorities plus `balanced`, each a `.door-job` pill with `aria-pressed`.

Below, five goal groups:

- **One group per direction**, in `FINDER_DIRECTIONS` order, each with a 2px top rule in its family ink, exactly as `.element-family-heading` does. Memory is cyan, Agents coral, Assistants violet, Inference blue, Runtimes amber.
- **A group heading carrying the family's total**, so "62 active" is legible next to the column, and the goal counts beneath it are per goal and are not summed (see the Problem's overlap note).
- **One tile per goal**, in `FINDER_GOALS` order, each carrying:
  - the eligible count, in `.element-count`'s slot;
  - the goal label in `.element-name`'s slot;
  - `aria-pressed="true"` when chosen;
  - `disabled` when the count is 0.
- **The shortlist**, in the same view, below the tiles, replacing step 3. It appears as soon as a job is chosen and ranks under `balanced` until a priority is chosen.

Every one of the 23 goals already has a counterpart on the front door, which is what makes this vocabulary free. The three system families' goals map onto the 19 role tiles — `coding` alone spans `coding_agent` (38) and `coding_agent_workflow` (10). The inference and runtime goals map one to one onto the four `.tile-category` chips the Inference services and Local runtimes tiles already carry, "Direct model API 20" through "Compatibility gateway 2". So the door's counts and the Finder's counts are the same numbers read two ways, and no second count table is introduced.

The direction step disappears as a screen and survives as the group rule and heading. The job step disappears as a screen and becomes the tile. The priority step disappears as a screen and becomes the chip row. Nothing is lost that the reader needs; three page transitions are.

**The shell goes.** `.finder-shell` is a bordered, shadowed panel with `margin-top: 3.5rem`, and `.finder-content` reserves `min-height: 480px` under `clamp(1.5rem, 4vw, 3.2rem)` padding — the padding waste of defect 5, boxed. A screen that holds its own groups needs neither a frame nor reserved height, so both retire and the tiles sit on the page like `.front-door`'s children do. `#finder-content` stays as the render target.

### 2. Tiles are the door's tiles

The goal tile shares `.element-tile`'s declarations rather than restating them, so the Finder's density is the door's density by construction. Two selectors, one style block:

- `.element-tile, .finder-goal` carry the shared rules;
- `.finder-goal` overrides `min-height`, from the tile's 112px to **72px**, and `align-content`, from the door's `space-between` to `center`. The door's tile spaces a symbol above its name; a goal tile has only a name, since its count sits in the door's own corner, so centring is what keeps 72px from reading as 72px of emptiness. 72px is the figure that put the tallest column's last tile at 953px on the measured build; the browser test pins that outcome, not the constant, so a later font or copy change cannot silently cost a whole row.
- `.finder-goal` adds no organization marks, since a goal spans roles and its preview would be a different count than the tile's.

Goal groups are a five-column row at 1440px, three columns at 1100px, and one at 720px, with a `.45rem` gap. Five, seven, three, and four tiles per column all fill their column, so no row orphans — the defect the wizard's fixed four-column direction grid had. `.finder-choice-grid`, `.direction-grid`, and the dead `.two-up` retire.

Two placement decisions keep the screen still while a job is chosen. The priority row sits below the tiles rather than above them, so the tile grid does not move out from under the pointer and the preference stays adjacent to the shortlist it changes. And `#finder-status` reserves two lines with `min-height`, because the chosen state names a label, a count, and a priority that together run to two, and an unbounded line would shove the whole grid down by 34px on the primary interaction. With both, choosing a job moves nothing: measured, the lowest tile sits at 953px before and after.

### 3. The shortlist is a directory card

`.finder-result` keeps its class and its extra sections — the rank, "Why it surfaced", "Watch for:" — and takes the directory card's frame:

- the 4px family `::before` rule `.project-card` uses (`web/styles.css:771`), which `.finder-result` does not have today;
- `--glass-strong` instead of `--panel`;
- `min-height: 340px` instead of 420px, so a shortlist is one results row;
- `padding: 1.4rem`, and `h3` at `.project-card`'s `1.55rem` instead of `1.65rem`.

`position: relative` and the stretched `.card-open::after` target stay. `card-click.spec.js:151-165` holds both: the whole card opens the record and a licence badge does not swallow the click.

`.finder-tradeoff`'s reserved `min-height: 3.1rem` goes; three cards of differing copy may differ in height, as three directory cards do.

The heading loses its prose sentence and gains the count: "Write and maintain software" with "3 of 48 active records, ranked for “Ready for me to use.”" and the goal's `description` on one muted line beneath.

### 4. URL and history

Three keys, on `view=finder`:

| Key | Value | Written when |
|---|---|---|
| `direction` | a direction id | a goal is chosen, because a goal's family is implied by its id |
| `job` | a goal id | a job is chosen |
| `prefer` | a priority id | a priority is chosen |

- `direction` is not `family`. `family` is a Directory scope key and Explore links to it (`?family=…`), and reusing it on another view would make a shared Finder link mean a Directory scope.
- Writing uses `writeURL` with `pushState` semantics the Directory already has, so Back retraces the three answers in order and Forward replays them.
- `restoreFromURL` drops each key it cannot apply: an unknown direction or goal, a goal whose direction contradicts `direction`, or a priority the chosen direction does not offer.
- A URL with no `job` opens the tiles with no shortlist. A URL with `job` and no `prefer` opens the shortlist ranked under `balanced`.
- The "Browse matches" handoff is unchanged and still hands the role set to Systems. `docs/WEB.md`'s sentence about the one filter left out of the URL is deleted, because it is no longer true.
- The `state.directoryRoles` chip and its removal stay exactly as they are, including the focus rescue onto `#result-count`.

### 5. Entry points

Every existing entry point keeps working and lands better:

- the header tab, the mobile bar, and the footer's Finder link open the bare screen;
- a front-door job pill and the job-hint banner's "Open shortlist →" call `openFinderAt(direction, goal)`, which now selects the job and scrolls to the shortlist rather than jumping to a priority question;
- the empty search state's "Try the Finder" opens the bare screen.

`openFinderAt` drops the `focusTarget` it passed, because the priority `h2` is gone; it focuses `#finder-title`, as a view change does.

## Contracts that change

- **`state.finder`.** `{ step, answers }` becomes `{ direction, goal, priority }`. `step`, `state.finder.answers`, `Math.min(3, …)`, and the Back/reset ladder go.
- **`renderFinderProgress`.** The `#finder-progress` element and the whole function go, with the stepper CSS.
- **`aria-live`.** `#finder-content` currently carries `aria-live="polite"` and, in the wizard, held only one step's worth of content. In a one-screen layout it holds the whole tile grid, so choosing a job would announce 23 tiles. The attribute moves to a dedicated `#finder-status` line beside the summary, which carries only the chosen job, its count, and its priority. `#finder-content` loses it.
- **`finderGoalRecords` and the counts.** `finderGoalRecords(direction, goalConfig)` (`web/app.js:2229`) reads `state`, so it cannot move to `web/app-core.js`. The new `AppCore.finderGoalCounts(direction, goalConfig, collections)` is a pure function that takes the four collections explicitly — `{ projects, inferenceServices, localRuntimes }` — and returns the per-goal eligible count, so it is testable against the real payloads in `tests/test_web.js` without a `state` object. `finderGoalRecords` keeps its own body and both read one predicate, so a tile's count and the shortlist's candidate set cannot disagree.
- **`.finder-choice`, `.finder-choice-grid`, `.direction-grid`, `.two-up`, `.finder-question`, `.finder-shell`, `.finder-content`'s `min-height`, `.finder-heading`.** All retire; `.finder-goal`, `.finder-goals`, and `.finder-groups` arrive.
- **`.finder-result`.** Keeps its class and sections, takes the directory card's frame.
- **`keepFinderInView`.** Retires, because there is no repaint that can push a step out of view. `#finder-progress` was its only reason to exist. `stickyHeight` and `headerClearance` stay if another caller needs them; `headerClearance` is checked against its remaining call sites first.
- **`openFinderAt(direction, goal)`.** Keeps its signature, loses its `focusTarget`, and focuses `#finder-title`.
- **`index.html:303-313`.** `#finder-progress` goes; `#finder-content` stays as the render target and loses `aria-live`; `#finder-status` is added; the eyebrow and subheading strings change.
- **`docs/WEB.md:7`, `:88`, `:98`, `:153`, `:181`** and its verification steps move with the parts above.
- **`docs/TAXONOMY.md:70-78`.** The "Guided finder" contract's three numbered questions become one screen with three visible axes. This is the spec's only editorial-surface change and it is the owner's to accept.

## Docs and ADR

**No new ADR.** Each decision rests on one already recorded:

- The Finder reuses the Elements vocabulary and tile. ADR 046 records Elements as role navigation and its reference sheets; the Finder is navigation by role, so it is the same decision in a second place.
- Goals are ranked by a priority inside one score profile. ADR 014's rule is unchanged and `docs/TAXONOMY.md`'s "never pools or compares scores across profiles" holds.
- Preferences stay soft ranking signals, never eligibility filters. `docs/TAXONOMY.md:70-78` already says so and the code already does so.
- The role set still hands off to Systems and still carries its chip. ADR 013's distinct-collections rule is unchanged.

If review finds a decision-level change, the ADR takes the next free number on `origin/main` at PR time. On 2026-09-30, 050 is the highest taken.

`BACKLOG.md` closes its Phase 4 line. The "up to two priority ids" half of that line moves to its own item, because this spec keeps one priority.

## Tests

**Unit (`tests/test_web.js`).** The finder block keeps every test it has: the goal tables' taxonomy values, `priorityBoost`'s dispatch and its finiteness across every real record, `recommendationReasons`, `matchFinderGoal`, and the `collectionState` dot. Two additions:

- `finderGoalCounts` against the real payloads: every one of the 23 goals returns a finite count of at least 1, which enforces `docs/WEB.md`'s "a goal is exposed only after at least one active reviewed system can satisfy it", and each direction's counts equal what `recommendedFinderRecords` ranks over;
- the overlap rule, asserted as the specific `context_graph_engine` case: memory's goal counts sum to more than its family total, and a direction with no overlap sums exactly. This pins the rendering rule that a column total is never the sum of its goal counts, so a future role overlap is a deliberate test change rather than a silent regression.

**Browser (`tests/e2e/`).** `finder-handoff.spec.js` is rewritten around the one screen:

- all 23 goal tiles visible at once at 1440×900 with no scrolling — the density claim, pinned as the tallest column's last tile's bottom at or under 900px, the 16 px slack CI's Linux Chromium needs;
- each group lists exactly its table's goals — 5, 7, 3, 4, and 4 — and every tile carries a count;
- choosing a job shows three shortlist cards, presses its tile, and writes `job`;
- choosing a priority repaints the ranking text, presses its pill, and writes `prefer`;
- Back from `prefer` to `job` to bare tiles, and Forward again;
- a shared URL restores all three answers and the same three names in the same order;
- `direction` contradicting `job` is dropped, leaving the tiles;
- "Browse matches" lands on results with the chip, and removing the chip by keyboard still focuses the count — the two focus rules `finder-handoff.spec.js` already pins.

Updated rather than rewritten elsewhere:

- `front-door.spec.js:215-221` — a front-door job opens the Finder with the job selected, not at a priority question;
- `front-door.spec.js:312-326`, `:625-640` — the Systems tile and the chip, unchanged in behaviour, re-pointed at the new markup;
- `card-badges.spec.js:161-197` — the same type-badge-first rule over the restyled card;
- `directory-search.spec.js:525-553`, `:754-771` and `search.spec.js:463-473` — the handoff and the empty state's entry;
- `deferred-data.spec.js:174-183` — the em dash on the shortlist card;
- the `.finder-choice-cue` assertion at `finder-handoff.spec.js:59-85` retires with the cue.

**The verification matrix** in `docs/WEB.md` runs in full.

## Sequence

One PR per step, each green before the next:

1. The unit work: `finderGoalCounts` in `web/app-core.js`, its two tests, and no markup change.
2. The screen: the tiles, the group rules, the summary line, the priority chips, and the retirements, with `finder-handoff.spec.js` rewritten and the other specs re-pointed.
3. The shortlist's frame, and the heading's count.
4. URL and history, with `BACKLOG.md`'s Phase 4 line closed and the `docs/WEB.md` sentence about the one unwritten filter deleted.
5. The docs pass: `docs/WEB.md`'s change-surface row and verification steps, and `docs/TAXONOMY.md`'s "Guided finder" contract.

Steps 2 and 3 could be one PR; they are separate so the density change lands and is reviewed before the shortlist's frame changes what the reader sees on arrival.
