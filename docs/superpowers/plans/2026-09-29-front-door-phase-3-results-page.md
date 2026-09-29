# Front-door Phase 3 Results Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Directory's nine per-collection control panels into one results frame, made of:

- one bar for search, sort, and layout;
- the scope strip with match counts;
- a filter rail with counts and chips;
- a list view whose rows are the cards;
- one record view that opens beside the list on wide screens and full-screen elsewhere, with previous, next, and related records.

Suggestions while typing come last. The phase also closes Phase 2's two leftovers.

**Architecture:** The site is a dependency-free static app:

- pure, unit-tested logic lives in `web/app-core.js` (UMD, loaded by the page and by `node:test`);
- DOM wiring lives in `web/app.js`;
- markup lives in `web/index.html`;
- styles live in `web/styles.css`.

The nine `.collection-panel` sections keep their ids and become each collection's results region: the result row, job hint, empty state, grid, and pager stay; the controls leave. Three things are shared across collections:

- one bar (`#results-bar`), with the search box `#results-search`;
- one rail (`#filter-rail`), which becomes a sheet on narrow screens;
- one record renderer, drawn into `#record-panel` (a region beside the list) or `#record-dialog` (a full-screen modal).

The rail's groups, the counts, the strip's match counts, step order, related records, and suggestions are pure functions in the core.

**Tech Stack:** Vanilla JavaScript (ES2020), CSS custom properties, `node:test` (`tests/test_web.js`), Playwright 1.63 (`tests/e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-29-front-door-phase-3-results-page-design.md`. It is checked against `docs/superpowers/specs/2026-09-24-directory-front-door-design.md` (target design 3–5, "Collections in flight", "URL state and history", "Contract changes") and ADRs 013, 014, 035, 040, 041, and 043. Read the spec before each task: where this plan and the spec disagree, the spec wins, and the executor records the ruling.

## Global Constraints

- **Base every task on current `main`**:

  ```bash
  git fetch origin && git switch -c claude/directory-p3-<n>-<slug> origin/main
  ```

  Anchor edits by function name, never by line number. `main` moves several times a day.
- **One task, one branch, one PR.** Each PR is green before the next starts.
  - Before each task's first commit, run `ListAgents` and message every session touching `web/` or `tests/e2e/` with the branch and file list.
  - Message the badge session ("Badge design brainstorm") before Task 4. Its key strip anchors to the grid, and its `badgeRow` work touches card markup.
- **Keep Phase 2's contracts** (spec, "Contracts that change"):
  - `AppCore.COLLECTIONS`, `collectionEntries`, `collectionCount`, `collectionCategories`, `collectionState`, `directoryStageFromURL`;
  - `#front-door`, `#door-search`, `#door-jobs`, `#collection-index`, `#scope-strip` and its `.scope-entry[data-open-collection][aria-pressed]` and `.family-entry[data-family-entry][aria-pressed]`;
  - `state.directoryStage`, `openCollection(id, { facet })`, `renderScopeStrip()`, `syncDoorDots()`, `syncStickyClearance()`, `restoreFromURL({ boot })`, `resetScopeControls(scope, params)`;
  - the pushed front-door history entry;
  - a comparison kept out of the front door's URL;
  - focus on the pressed entry after a tile opens by keyboard;
  - the breakpoints at 1000 px and 1407 px.
- **`setDirectoryCollection(collection, { updateURL = true, carryQuery = updateURL })` keeps its signature and meaning.** `carryQuery: false` leaves the query as it is. Restore on boot and popstate, comparison restore, "Search all", "Browse all in Models", the pack-to-specification link, and the legacy `?view=` alias all pass `false` and expect the query kept. Only the Finder's handoffs and Clear filters clear the query, and they clear it themselves.
- **Backlog anchors and measurements** (AGENTS rule 18, #385).
  - `tests/test_documentation.py` checks that every code symbol the backlog's "Engineering debt" section names still exists, and that any measurement there carries a date.
  - When a task deletes or renames a symbol that section names, such as `renderers`, `RECORD_DIALOG_SELECTORS`, or `mixedSystemCard`, the same PR updates or closes the item.
  - Quote code measurements from `uv run python scripts/measure_engineering.py`, never by hand.
- **No new ADR.** If review finds a decision-level change, the ADR takes the next free number on `origin/main` at PR time. On 2026-09-29, 042 was held by the badge session, and 047 was on main twice (#388's badge ADR and #391's research-group ADR), so one of those two will renumber. Run `git ls-tree --name-only origin/main docs/adr/` right before any PR that adds one.
- **The phone layout of #390.**
  - Below 768 px a fixed bottom bar, `#mobile-nav`, holds Home, Search, Finder, Explore, and More.
  - Its Search opens All and focuses All's search box.
  - It stacks below the badge legend and the comparison tray.
  - Phase 3's phone measurements stop at whichever of those is highest.
  - Its modal views (the filter sheet, the full-screen record) sit in the top layer, above it.
- **Breakpoints and numbers from the spec, verbatim:**
  - Above 1000 px: the rail is visible and the bar is sticky.
  - At 1200 px and wider: the side panel opens.
  - At 720 px and below: the list description is hidden and the legend is a closed chip.
  - "Show all N" appears after eight values.
  - Related records: "up to five".
  - Suggestions:
    - they open at two characters;
    - they offer, in order, the Finder job, up to five records, up to three labs, up to three categories, and "See all results for “q”".
  - Goal 1:
    - at least seven results fully inside the band at 1440×900, with the legend open, in Systems and in Models;
    - at least four above the legend chip at 375×812, at the top of the page, in Systems and in Models.
- **URL keys:**
  - `layout` (`cards` only) is global, not a scope key;
  - `browseSort` is per scope;
  - `lab` joins the scope keys of Systems, Inference services, Local runtimes, and Specifications;
  - every other key is unchanged. Explore's links (#368, #372, #377) depend on the unchanged keys.
- **Colours and radii only from the custom properties in `web/styles.css`.** No colour literal and no `border-radius` literal outside `:root`: `tests/test_web.js` fails the build on either. Use `var(--radius-pill)` for pills.
- **After any change to `web/index.html`, `web/app.js`, `web/app-core.js`, or `web/styles.css`, run `/usr/local/bin/node scripts/build_asset_version.mjs` and commit its output.** Always use `/usr/local/bin/node` (v22). The default `node` drifts.
- **Fit tests need 16 px of measured slack**, because CI's Linux Chromium renders text wider than macOS. Position tests wait for scrolling to stop (`html { scroll-behavior: smooth }`), using the `settle`/`aim` pattern from `tests/e2e/finder-handoff.spec.js`.
- **User-facing copy is short and plain.** No "score profile", "scope", "registry", "facet", or "descriptor" in the interface.
- **The page makes no request outside its own origin and adds no dependency.**
- **Local Playwright runs can fail a random handful of tests with boot timeouts** (a boot request with status -1 in the trace). Rerun with `npx playwright test --last-failed` before suspecting the change.
- **Commits run the full pre-commit suite and take minutes.**
  - Use a 10-minute timeout and check `git log -1` afterwards.
  - A formatter hook can abort the first attempt: re-add and commit again.
  - Write hook output to a file rather than piping it through `grep`.
  - Never pass `--no-verify`.
- **Commands:**
  - Unit tests: `/usr/local/bin/node --test tests/test_web.js`.
  - Browser tests: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/<file>`.
  - Full gate: `pre-commit run --all-files`.
  - If `package-lock.json` changed on `main` since the worktree last installed, first run `PATH=/usr/local/bin:$PATH npm ci --ignore-scripts`.

## File structure

| File | Responsibility in this plan |
|---|---|
| `tests/e2e/helpers/results.js` (new, Task 1) | The one place tests name a search box, a filter, the sort, a Clear control, or an open record. Its internals change in Tasks 2, 3, and 5; its API never does |
| `tests/e2e/helpers/landing.js` (Task 2) | `allSearch` becomes `#door-search:visible, #results-search:visible` |
| `web/app-core.js` (Tasks 2, 3, 6, 7) | `browseSort` in `scopeURLParams`/`readScopeURLParams`; `stripMatchCounts`; `FILTER_GROUPS`, `buildLabMembership`, `filterGroupCounts`; `stepRecord`, `relatedRecords`, `labCountsForRecord`; `searchSuggestions` |
| `web/index.html` (Tasks 2, 3, 5, 7) | `#results-bar`; each panel loses its `.control-panel` and heading and gains a `.scope-note`; `#filter-rail`, `#filter-sheet`, `#filter-chips`; `#record-panel` and `#record-dialog` replace the eight record dialogs; the combobox listbox |
| `web/app.js` (every task but 1) | The frame, one query, strip counts, and empty-result buttons (Task 2); the rail, chips, and sheet (Task 3); the layout (Task 4); the record view (Task 5); the panel, stepping, and related records (Task 6); suggestions and the door combobox (Task 7) |
| `web/styles.css` (Tasks 2–7) | `.results-bar`, `.scope-note`, `.filter-rail*`, `.filter-chip*`, `.filter-sheet`, `.results-frame.is-list .project-card`, `.record-panel`, `.record-dialog`, `.record-nav`, `.related-*`, `.suggestions*` |
| `tests/test_web.js` (Tasks 2, 3, 6, 7) | The pure rules |
| `tests/e2e/results-page.spec.js` (new, Tasks 2–7) | Phase 3's browser tests |
| `docs/WEB.md`, `BACKLOG.md` (every task) | Each PR carries the contract lines it makes true, and closes its backlog lines |

---

### Task 1: One results helper for the e2e suite

No markup change. Every browser test that names a search box, a filter, a Sort control, a Clear control, or a record dialog does so through `tests/e2e/helpers/results.js`. Later tasks then change the helper's internals once, rather than 440 lines across 21 files.

**Files:**

- Create: `tests/e2e/helpers/results.js`
- Modify these twenty-one spec files, which name those controls today:
  - `badge-legend.spec.js`, `card-badges.spec.js`, `card-click.spec.js`, `card-stars.spec.js`
  - `deferred-data.spec.js`, `directory-search.spec.js`, `elements.spec.js`, `explore.spec.js`, `finder-handoff.spec.js`
  - `front-door.spec.js`, `labs.spec.js`, `models.spec.js`, `navigation.spec.js`
  - `page-health.spec.js`, `record-links.spec.js`, `robots.spec.js`, `search.spec.js`
  - `share-pages.spec.js`, `theme.spec.js`, `trust-record.spec.js`, `url-state.spec.js`
- Modify: `docs/WEB.md` ("Change surfaces": one row)

**Interfaces:**

- Consumes: nothing new.
- Produces the following for every later task and every e2e test. `scope` is a collection id (`"all" | "systems" | "inference" | "runtimes" | "packs" | "robots" | "models" | "labs" | "specifications"`). `kind` is a `record=` kind (`"system" | "spec" | "inference" | "runtime" | "pack" | "robot" | "model" | "lab"`). `key` is a filter's URL key (for example `"role"`, `"type"`, `"license"`, `"localOnly"`).
  - `searchBox(page, scope?)` → Locator. With a scope, the box that serves that collection. Without one, the search box on screen.
  - `search(page, text, scope?)` → `Promise<void>`: fills `searchBox(page, scope)`.
  - `filterControl(page, scope, key)` → Locator of the control for one filter.
  - `setFilter(page, scope, key, value)` → `Promise<void>`: chooses `value`, revealing the control first if it is folded away.
  - `expectFilter(page, scope, key, value)` → `Promise<void>`: a retrying assertion that the filter holds `value`.
  - `sortControl(page, scope)` → Locator of the Sort `<select>`. For a collection without one, a locator that matches nothing.
  - `clearFilters(page, scope)` → `Promise<void>`: presses the collection's Clear control.
  - `recordView(page, kind?)` → Locator. With a kind, that kind's record view, open or not. Without one, whichever record view is open.
  - `recordHeading(page, kind?)` → Locator of the open record's `h1`.
  - `closeRecord(page, kind?)` → `Promise<void>`: presses the record's close control.

- [ ] **Step 1: Write the helper against today's markup**

```js
// tests/e2e/helpers/results.js
// Every browser test reaches a collection's search box, a filter, the sort,
// the Clear control, or an open record through here, so Front-door Phase 3
// can move them into one bar, one rail, and one record view by changing this
// file alone (Phase 3 spec, "Tests"). Until then each collection has its own.
const { expect } = require("@playwright/test");

const SEARCH_BOXES = {
  all: "#all-directory-search", systems: "#project-search", inference: "#inference-search",
  runtimes: "#runtime-search", packs: "#pack-search", robots: "#robot-search",
  models: "#model-search", labs: "#lab-search", specifications: "#specification-search",
};

// Keyed by each filter's URL key, as web/app.js SCOPE_CONTROLS is.
const FILTER_CONTROLS = {
  systems: {
    family: "#family-filter", role: "#role-filter", agent: "#agent-filter", architecture: "#architecture-filter",
    deployment: "#deployment-filter", agentInterface: "#agent-interface-filter", capability: "#capability-filter",
    sourceModel: "#source-model-filter", license: "#license-filter", status: "#status-filter", localOnly: "#local-filter",
  },
  inference: { type: "#inference-type-filter", delivery: "#inference-delivery-filter", modelSource: "#inference-model-source-filter", apiStyle: "#inference-api-filter" },
  runtimes: { type: "#runtime-type-filter", accelerator: "#runtime-accelerator-filter", modelFormat: "#runtime-format-filter", apiStyle: "#runtime-api-filter" },
  packs: { type: "#pack-type-filter", host: "#pack-host-filter", install: "#pack-install-filter", license: "#pack-license-filter" },
  robots: { formFactor: "#robot-form-factor-filter", aiBasis: "#robot-ai-basis-filter", availability: "#robot-availability-filter", status: "#robot-status-filter" },
  models: { type: "#model-type-filter", distribution: "#model-distribution-filter", modality: "#model-modality-filter", sourceModel: "#model-source-filter", license: "#model-license-filter", lab: "#model-lab-filter" },
  labs: { type: "#lab-type-filter", headquarters: "#lab-country-filter", distribution: "#lab-distribution-filter" },
  specifications: { type: "#specification-type-filter", scope: "#specification-scope-filter", status: "#specification-status-filter", license: "#specification-license-filter" },
};

const SORT_CONTROLS = { systems: "#sort-filter", inference: "#inference-sort-filter", runtimes: "#runtime-sort-filter", models: "#model-sort-filter" };

const CLEAR_CONTROLS = {
  all: "#reset-all-directory", systems: "#reset-filters", inference: "#reset-inference-filters",
  runtimes: "#reset-runtime-filters", packs: "#reset-pack-filters", robots: "#reset-robot-filters",
  models: "#reset-model-filters", labs: "#reset-lab-filters", specifications: "#reset-specification-filters",
};

// Keyed by the `record=` URL's kinds.
const RECORD_VIEWS = {
  system: "#project-dialog", spec: "#specification-dialog", inference: "#inference-dialog",
  runtime: "#runtime-dialog", pack: "#pack-dialog", robot: "#robot-dialog",
  model: "#model-dialog", lab: "#lab-dialog",
};

function searchBox(page, scope) {
  if (scope) return page.locator(SEARCH_BOXES[scope]);
  return page.locator(Object.values(SEARCH_BOXES).map(selector => `${selector}:visible`).join(", "));
}

async function search(page, text, scope) {
  await searchBox(page, scope).fill(text);
}

function filterControl(page, scope, key) {
  return page.locator(FILTER_CONTROLS[scope][key]);
}

// Systems folds most of its filters under "More filters": open it first.
async function setFilter(page, scope, key, value) {
  const control = filterControl(page, scope, key);
  if (!(await control.isVisible())) {
    const shell = page.locator(".advanced-filter-shell:visible");
    if (await shell.count() && !(await shell.evaluate(details => details.open))) await shell.locator("summary").click();
  }
  await control.selectOption(value);
}

async function expectFilter(page, scope, key, value) {
  await expect(filterControl(page, scope, key)).toHaveValue(value);
}

// A collection without a Sort control gets a locator that matches nothing, so
// `toHaveCount(0)` says so.
function sortControl(page, scope) {
  return page.locator(SORT_CONTROLS[scope] || "[data-no-sort-control]");
}

async function clearFilters(page, scope) {
  await page.locator(CLEAR_CONTROLS[scope]).click();
}

function recordView(page, kind) {
  if (kind) return page.locator(RECORD_VIEWS[kind]);
  return page.locator(Object.values(RECORD_VIEWS).map(selector => `${selector}[open]`).join(", "));
}

function recordHeading(page, kind) {
  return recordView(page, kind).locator("h1");
}

async function closeRecord(page, kind) {
  await recordView(page, kind).locator(".dialog-close").click();
}

module.exports = { clearFilters, closeRecord, expectFilter, filterControl, recordHeading, recordView, search, searchBox, setFilter, sortControl };
```

- [ ] **Step 2: Move every call site onto the helper**

In each file, require the names it uses after the Playwright require:

```js
const { closeRecord, recordView, search, searchBox, setFilter } = require("./helpers/results");
```

Then rewrite by these rules. This grep finds every call site; `#comparison-dialog` is excluded because the comparison dialog stays:

```bash
grep -nE '#(project|inference|runtime|model|pack|robot|lab|specification|all-directory)-search|#[a-z-]+-filter\b|#reset-[a-z-]+|#(project|specification|inference|runtime|pack|robot|model|lab)-dialog|#dialog-content|advanced-filter-shell summary"\)\.click' tests/e2e/*.spec.js | grep -v comparison-dialog
```

Record kinds map from the dialog ids: `#project-dialog` and `#dialog-content` → `"system"`; `#specification-dialog` → `"spec"`; each other `#<kind>-dialog` → `"<kind>"`.

| Today | Becomes |
|---|---|
| `page.locator("#project-search").fill(x)` (any of the nine boxes) | `await search(page, x)`: the box on screen, which is the only box Playwright can fill |
| `expect(page.locator("#project-search")).toHaveValue(x)` | `await expect(searchBox(page, "systems")).toHaveValue(x)` |
| `page.locator("#project-search")` held in a variable, focused, evaluated, or checked for visibility | `searchBox(page, "systems")` |
| `document.querySelector("#inference-search")` inside `page.evaluate` (front-door.spec.js, "a focused strip entry keeps its focus while the grid repaints") | `await searchBox(page, "inference").evaluate(input => { input.value = "vllm"; input.dispatchEvent(new Event("input", { bubbles: true })); })` |
| Table rows naming a search, sort, or reset selector (search.spec.js) | The collection id, with `searchBox(page, scope)`, `sortControl(page, scope)`, or `clearFilters(page, scope)` in the loop body |
| `page.locator("#role-filter").selectOption(v)` (any filter) | `await setFilter(page, "systems", "role", v)`, with the URL key from `FILTER_CONTROLS` |
| `expect(page.locator("#role-filter")).toHaveValue(v)` | `await expectFilter(page, "systems", "role", v)` |
| `page.locator(".advanced-filter-shell summary").click()` before choosing a filter | Delete it: `setFilter` opens "More filters". Keep the three steps in directory-search.spec.js that assert the summary reads "More filters · 1 active"; Task 3 rewrites them |
| `page.locator("#sort-filter")` (any of the four sort selects) | `sortControl(page, "systems")` |
| `expect(page.locator("#pack-sort-filter")).toHaveCount(0)` (Packs, Robots) | `await expect(sortControl(page, "packs")).toHaveCount(0)` |
| `page.locator("#reset-filters").click()` (any Clear control) | `await clearFilters(page, "systems")` |
| `expect(page.locator("#runtime-dialog")).toBeVisible()`, and likewise `toBeHidden`, `toContainText`, `not` | `recordView(page, "runtime")` in the same assertion |
| `page.locator("#runtime-dialog-content")` or `#dialog-content` | `recordView(page, "runtime")` or `recordView(page, "system")` |
| `#X-dialog h1` or `#X-dialog-content h1` | `recordHeading(page, "x")` |
| `page.locator("#X-dialog .dialog-close").click()` | `await closeRecord(page, "x")` |
| `page.locator("#X-dialog <selector>")` or `#X-dialog-content <selector>` | `recordView(page, "x").locator("<selector>")` |
| `page.locator("#runtime-dialog").evaluate(dialog => …)` (page-health.spec.js) | `recordView(page, "runtime").evaluate(dialog => …)` |
| `expect(page.locator("#model-dialog")).toHaveJSProperty("open", false)` (labs.spec.js) | `await expect(recordView(page, "model")).toBeHidden()` |

For example, search.spec.js's Best-match table becomes:

```js
const MATCH_SORT_SCOPES = [
  ["/?collection=systems", "systems", "name"],
  ["/?collection=inference", "inference", "score"],
  ["/?collection=runtimes", "runtimes", "score"],
  ["/?collection=models", "models", "score"],
];
```

and its loop body reads `searchBox(page, scope)` and `sortControl(page, scope)` wherever it named the two selectors.

- [ ] **Step 3: Run the moved specs**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`

Expected: the whole suite passes. Rerun the grep from Step 2 and expect no output.

- [ ] **Step 4: Record the surface**

In `docs/WEB.md`, "Change surfaces", add after the "landing navigation in browser tests" row:

```markdown
| results controls in browser tests | `tests/e2e/helpers/results.js`; no spec names a collection's search box, a filter, a Sort or Clear control, or a record view by its own selector |
```

- [ ] **Step 5: Commit and open the PR**

```bash
git add tests/e2e/helpers/results.js tests/e2e/*.spec.js docs/WEB.md
git commit -m "Reach results controls through one e2e helper"
gh pr create --title "Reach results controls through one e2e helper" --body "Front-door Phase 3, task 1 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). tests/e2e/helpers/results.js is now the only place browser tests name a search box, a filter, a Sort or Clear control, or a record view, so the next tasks change that markup once. No markup change."
```

---
### Task 2: The frame, one query, and match counts

The nine collection panels lose their search boxes and sort selects to one bar under the scope strip. Their guidance paragraphs and headings become one scope note per collection. The query becomes one value, painted 150 ms after the reader pauses. While a query is present, the strip counts matches. An empty result names every collection that holds matches, and a sort chosen before typing survives a reload.

This task also does the following:

- **Folded-in work.** It does the table half of `CR-20` and closes `CR-21`.
- **Phase 2 follow-ups closed:**
  - the phone caption's hidden count;
  - the strip rebuilt with `innerHTML`;
  - the hardcoded collection lists;
  - `urlReady` without `try`/`finally`;
  - `setPageSize` repainting hidden grids;
  - the phone family row's smallest text.
- **Filters stay put.** The filter dropdowns stay in each panel's `.control-panel` until Task 3.

**Files:**

- Modify: `web/app-core.js`. Add `browseSort` to `SCOPE_URL_PARAMS` and change `scopeURLParams` and `readScopeURLParams`. Add `queryMatches`, `collectionMatchCounts`, `familyMatchCounts`, and `collectionHidden`. `scopeFromURL` reads the registry, and the new functions are exported.
- Modify: `web/index.html` (the bar, scope notes, retired search boxes and headings)
- Modify: `web/app.js`. This task touches many functions; each step below names the ones it changes.
- Modify: `web/styles.css`
- Modify: `tests/test_web.js`
- Modify: `tests/e2e/helpers/results.js`, `tests/e2e/helpers/landing.js`
- Create: `tests/e2e/results-page.spec.js`
- Modify: `tests/e2e/front-door.spec.js` (the `test.fixme` becomes a test)
- Modify: `tests/e2e/search.spec.js` (three tests written for nine boxes)
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes: Task 1's helpers.
- Produces:
  - **Markup:**
    - `#results-bar.results-bar`, hidden on the front door. It holds `label.search-field.results-search > input#results-search + span.search-count[aria-hidden]` and `.results-sort`. `.results-sort` holds four `label[data-sort-scope]`, each wrapping its unchanged select: `#sort-filter`, `#inference-sort-filter`, `#runtime-sort-filter`, `#model-sort-filter`.
    - `p.scope-note[data-scope-note="<id>"]` directly after each panel's `.result-row`.
    - `.scope-entry > .scope-count + .scope-count-label.visually-hidden`.
    - `#directory.is-results` while results show.
    - The active `.collection-panel` carries `aria-busy="true"` while a repaint is pending.
  - **In `web/app.js`:**
    - `RESULT_VIEWS[id]` → `{ panel, grid, pager, count, clear, placeholder, render }`;
    - `currentQuery()` → string;
    - `clearQuery()`, `syncMatchSorts()`, `onQueryInput()`, `scheduleResults()`, `flushResults()`, `loadCatalogIndexes()`;
    - `currentMatches(term = currentQuery())` → `Set` of records;
    - `syncScopeStrip()`, `syncResultsBar(scope)`, `resetCollection(scope)`.
  - **In `AppCore`:**
    - `queryMatches(term, payloads, indexes, { labelOf })` → `Set`;
    - `collectionMatchCounts(matched, payloads)` → `{ [collectionId]: number }`;
    - `familyMatchCounts(matched | null, payloads)` → `{ "": n, [familyId]: n }`;
    - `collectionHidden(id, payloads)` → boolean.
  - **Test helpers:**
    - `settled(page)` in `helpers/results.js` waits until no results region is busy.
    - `search(page, text)` fills `#results-search` and waits for it to settle.

- [ ] **Step 1: Write the failing unit tests**

Add `collectionHidden, collectionMatchCounts, familyMatchCounts, queryMatches, readScopeURLParams, scopeURLParams` to the destructured `require("../web/app-core.js")` on line 6 of `tests/test_web.js` (keep it alphabetical; add only the names not already there). Append after the test "each collection counts what its default view lists, with its split":

```js
test("one match pass finds each record any collection's search finds", () => {
  assert.deepEqual([...queryMatches("a1", registryPayloads, {})].map(record => record.id), ["a1"]);
  assert.equal(queryMatches("", registryPayloads, {}).size, 0);
  assert.equal(queryMatches("the", registryPayloads, {}).size, 0, "stop words alone match nothing");
});

test("each collection counts the query's matches its default view lists", () => {
  const counts = collectionMatchCounts(queryMatches("m", registryPayloads, {}), registryPayloads);
  assert.equal(counts.all, 2, "All lists the archived M2 as well");
  assert.equal(counts.systems, 1, "Systems lists active systems only");
  assert.equal(counts.labs, 0);
  assert.deepEqual(Object.keys(counts), ["all", "systems", "models", "inference", "runtimes", "packs", "robots", "labs", "specifications"]);
  const packs = collectionMatchCounts(queryMatches("a1", registryPayloads, {}), registryPayloads);
  assert.equal(packs.packs, 1, "a host-installed system counts in Agent packs");
});

test("the family row counts active systems, and only the query's matches while searching", () => {
  assert.deepEqual(familyMatchCounts(null, registryPayloads), { "": 4, memory_system: 1, agent_system: 2, assistant_system: 1 });
  assert.deepEqual(familyMatchCounts(queryMatches("m", registryPayloads, {}), registryPayloads), { "": 1, memory_system: 1 });
});

test("an empty collection is hidden and All never is", () => {
  assert.equal(collectionHidden("labs", registryPayloads), false);
  assert.equal(collectionHidden("labs", { ...registryPayloads, labs: [] }), true);
  assert.equal(collectionHidden("all", {}), false);
});

test("browseSort is written only beside a query listed by Best match, and never as the default", () => {
  const params = values => Object.fromEntries(scopeURLParams("inference", values));
  assert.deepEqual(params({ q: "router", sort: "match", browseSort: "name" }), { q: "router", browseSort: "name" });
  assert.deepEqual(params({ q: "router", sort: "match", browseSort: "score" }), { q: "router" }, "the default is never written");
  assert.deepEqual(params({ q: "router", sort: "name", browseSort: "score" }), { q: "router", sort: "name" }, "a sort chosen during the query wins");
  assert.deepEqual(params({ q: "", sort: "name", browseSort: "score" }), { sort: "name" }, "without a query there is nothing to return to");
});

test("browseSort restores only beside a query and without a sort", () => {
  const allowed = { q: "text", sort: new Set(["score", "name"]), browseSort: new Set(["score", "name"]) };
  const read = query => readScopeURLParams("inference", new URLSearchParams(query), allowed);
  assert.deepEqual(read("q=router&browseSort=name"), { values: { q: "router", browseSort: "name" }, rejected: [] });
  assert.deepEqual(read("browseSort=name").rejected, ["browseSort"]);
  assert.deepEqual(read("q=router&sort=score&browseSort=name").rejected, ["browseSort"]);
  assert.deepEqual(read("q=router&browseSort=match").rejected, ["browseSort"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL. `queryMatches is not a function`, and the browseSort tests fail on the missing key.

- [ ] **Step 3: Implement the core**

In `web/app-core.js`:

1. In `SCOPE_URL_PARAMS`, add `browseSort: ""` after `sort` in `systems`, `inference`, `runtimes`, and `models`.
2. Replace `scopeURLParams` with:

```js
  // A query lists by Best match unless the reader chose another sort, so
  // while one is present the URL leaves out "match" and names any other sort,
  // the browsing default included. A reload or a shared link then restores
  // the sort the reader chose (ruling R-P1-2b). Beside a query still listed
  // by Best match, `browseSort` carries the sort clearing the query returns
  // to, when that is not the default (Phase 3 spec, section 8).
  function scopeURLParams(scope, values = {}) {
    const owned = SCOPE_URL_PARAMS[scope] || {};
    const searching = String(values.q ?? "").trim() !== "";
    return Object.entries(owned)
      .filter(([key, fallback]) => {
        if (values[key] === undefined) return false;
        if (key === "browseSort") return searching && values.sort === "match" && values[key] !== "" && values[key] !== owned.sort;
        return String(values[key]) !== (key === "sort" && searching ? "match" : fallback);
      })
      .map(([key]) => [key, String(values[key])]);
  }
```

3. In `readScopeURLParams`, inside the `for (const key of SCOPE_URL_KEYS)` loop, directly after `const accepts = allowed[key];`, add:

```js
      // A browsing sort means something only beside a query the URL lists by
      // Best match, so it is refused without a query or beside a chosen sort.
      if (key === "browseSort") {
        const query = String(params.get("q") || "").trim();
        if (key in owned && query && !params.has("sort") && accepts instanceof Set && accepts.has(value)) values[key] = value;
        else rejected.push(key);
        continue;
      }
```

4. In `scopeFromURL`, replace the hardcoded list in the `params.has("collection")` branch:

```js
    if (params.has("collection")) {
      const collection = params.get("collection");
      return COLLECTIONS.some(entry => entry.id === collection) ? collection : "all";
    }
```

5. After `collectionCount`, add:

```js
  // An empty collection offers no tile and no strip entry; All always does.
  function collectionHidden(id, payloads = {}) {
    return id !== "all" && collectionCount(id, payloads).count === 0;
  }

  // One match pass over the whole catalog for a query: the set of records
  // any collection's search finds, each kind read through its own search
  // index once that index has landed (Phase 3 spec, section 1). The strip's
  // counts and an empty result's pointers both read it; the results keep
  // their own ranked pass, which also orders them.
  const MATCH_GROUPS = [
    ["system", "projects", "systems"], ["inference", "services", "inference"], ["runtime", "runtimes", "runtimes"],
    ["model", "models", "models"], ["pack", "packs", "packs"], ["robot", "robots", "robots"],
    ["lab", "labs", "labs"], ["spec", "specifications", "specifications"],
  ];
  function queryMatches(term, payloads = {}, indexes = {}, { labelOf } = {}) {
    const query = parseSearchQuery(term);
    const matched = new Set();
    if (!query.tokens.length) return matched;
    for (const [kind, payloadKey, indexKey] of MATCH_GROUPS) {
      for (const record of payloads[payloadKey] || []) {
        if (recordMatch(query, searchFields(kind, record, { index: indexes[indexKey], labelOf })) > 0) matched.add(record);
      }
    }
    return matched;
  }

  // What each collection's default view lists of a query's matches: the
  // strip's counts while searching, in registry order.
  function collectionMatchCounts(matched, payloads = {}) {
    return Object.fromEntries(COLLECTIONS.map(entry => [entry.id, collectionEntries(entry.id, payloads).filter(record => matched.has(record)).length]));
  }

  // The Systems family row: active systems per family, and while a query is
  // present only its matches (`matched` is null without one). "" is All families.
  function familyMatchCounts(matched, payloads = {}) {
    const listed = collectionEntries("systems", payloads).filter(record => !matched || matched.has(record));
    const counts = { "": listed.length };
    for (const record of listed) counts[record.system_family] = (counts[record.system_family] || 0) + 1;
    return counts;
  }
```

6. Add `collectionHidden`, `collectionMatchCounts`, `familyMatchCounts`, and `queryMatches` to the exported object, in alphabetical position.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS, the whole file.

- [ ] **Step 5: Write the failing browser tests**

Create `tests/e2e/results-page.spec.js`:

```js
// Front-door Phase 3, the results page (docs/superpowers/specs/
// 2026-09-29-front-door-phase-3-results-page-design.md): the frame, one
// query, and the strip's match counts.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { collectionEntry, familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const { search, searchBox, settled } = require("./helpers/results");

// A word no record holds, written into one collection's search index so a
// test controls exactly which collection answers it.
const INDEX_WORD = "zyxwvutsrq";
const readIndex = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "app", "search", `${name}.json`), "utf8"));
async function onlyInIndex(page, name) {
  const index = readIndex(name);
  const [first] = Object.keys(index);
  await page.route(`**/app/search/${name}.json*`, route => route.fulfill({ json: { ...index, [first]: `${index[first]} ${INDEX_WORD}` } }));
}

test("one search box serves every collection and keeps its text across them", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#results-search")).toHaveCount(1);
  await expect(page.locator(".collection-panel input[type=search]")).toHaveCount(0);
  await search(page, "memory");
  await openCollection(page, "models");
  await expect(searchBox(page)).toHaveValue("memory");
  await expect(page).toHaveURL(url => url.searchParams.get("collection") === "models" && url.searchParams.get("q") === "memory");
});

test("while searching, each strip entry counts and names its matches", async ({ page }) => {
  await onlyInIndex(page, "labs");
  await page.goto("/?collection=all");
  await search(page, INDEX_WORD);
  const labs = collectionEntry(page, "labs");
  await expect(labs.locator(".scope-count")).toHaveText("1");
  await expect(labs).toHaveAccessibleName(/^Labs\s*1\s*match$/);
  await expect(collectionEntry(page, "systems").locator(".scope-count")).toHaveText("0");
  await search(page, "");
  await expect(labs.locator(".scope-count")).not.toHaveText("1");
  await expect(labs).toHaveAccessibleName(/^Labs\s*\d+$/);
});

test("an empty result names the collections that hold matches, from the front door on", async ({ page }) => {
  await onlyInIndex(page, "labs");
  await page.goto("/");
  await searchAll(page, INDEX_WORD);
  const button = page.locator('#all-directory-grid [data-empty-open-collection="labs"]');
  await expect(button).toHaveText("Labs 1");
  await button.click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Labs\b/);
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(searchBox(page)).toBeFocused();
  await expect(page.locator("#lab-grid .project-card")).toHaveCount(1);
});

test("a restored query survives boot and Back", async ({ page }) => {
  await page.goto("/?collection=systems&q=memory");
  await expect(searchBox(page)).toHaveValue("memory");
  await page.locator("#project-grid .project-card").first().click();
  await expect(page).toHaveURL(/record=system%3A|record=system:/);
  await page.goBack();
  await expect(searchBox(page)).toHaveValue("memory");
  await expect(page).toHaveURL(/q=memory/);
});

test("typing repaints once the reader pauses", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.evaluate(() => {
    window.urlWrites = 0;
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args) => { window.urlWrites += 1; return replace(...args); };
  });
  await searchBox(page).pressSequentially("memory", { delay: 20 });
  await settled(page);
  await expect(page).toHaveURL(/q=memory/);
  expect(await page.evaluate(() => window.urlWrites)).toBeLessThanOrEqual(2);
});

test("the results bar sticks under the strip above 1000 px and scrolls with the page on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=systems");
  await expect(page.locator("#results-bar")).toHaveCSS("position", "sticky");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#results-bar")).toHaveCSS("position", "static");
});

test("each collection's score rule sits in its scope note, and the headings are gone", async ({ page }) => {
  await page.goto("/?collection=models");
  await expect(page.locator('[data-scope-note="models"]')).toContainText("Imported source records have no Atlas score");
  await expect(page.locator("#models-kicker")).not.toBeEmpty();
  await expect(page.locator(".collection-panel .section-heading, .collection-panel .filter-guidance")).toHaveCount(0);
});

test("on a phone the unpressed family entries hide their counts but keep them in their names", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?collection=systems");
  const memory = familyEntry(page, "memory_system");
  await expect(memory.locator("strong")).toHaveCSS("position", "absolute");
  await expect(memory).toHaveAccessibleName(/Memory\s*\d+/);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems\s*\d+/);
});
```

In `tests/e2e/front-door.spec.js`, change `test.fixme("a sort chosen before typing survives a reload and returns when the query is cleared"` to `test("a sort chosen before typing survives a reload and returns when the query is cleared"`. Task 1 already moved its selectors onto the helpers.

- [ ] **Step 6: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js tests/e2e/front-door.spec.js`
Expected: FAIL. `#results-search` has count 0, and the sort test finds no `browseSort` in the URL after the reload.

- [ ] **Step 7: Change the markup**

In `web/index.html`, inside `#directory`:

1. Directly after `<nav id="scope-strip" …></nav>`, add the bar. Move each of the four sort `<select>` elements out of its panel into it, unchanged, options and all.

```html
      <div id="results-bar" class="results-bar" hidden>
        <label class="search-field results-search"><span class="visually-hidden">Search</span><input id="results-search" type="search" placeholder="Search systems, models, services, runtimes, packs, and robots" autocomplete="off"><span class="search-count" aria-hidden="true"></span></label>
        <div class="results-sort">
          <label data-sort-scope="systems" hidden><span class="visually-hidden">Sort</span><!-- #sort-filter moves here --></label>
          <label data-sort-scope="inference" hidden><span class="visually-hidden">Sort</span><!-- #inference-sort-filter moves here --></label>
          <label data-sort-scope="runtimes" hidden><span class="visually-hidden">Sort</span><!-- #runtime-sort-filter moves here --></label>
          <label data-sort-scope="models" hidden><span class="visually-hidden">Sort</span><!-- #model-sort-filter moves here --></label>
        </div>
      </div>
```

Each comment stands where its moved `<select>` goes. Delete the comments once the selects are in place, and delete the now-empty `<label><span>Sort</span>…</label>` each select leaves behind.

2. In every `.collection-panel`:
   - **Search box.** Delete its `<label class="search-field">…</label>` and its `<input id="*-search">`.
   - **Guidance paragraph.** Move the panel's `<p class="filter-guidance">…</p>` to directly after the panel's `<div class="result-row">…</div>`. Change it to `<p class="scope-note" data-scope-note="<id>">`, where `<id>` is the collection id, keeping its text and button verbatim.
3. `#all-directory-panel`: delete the whole `<section class="control-panel mixed-directory-controls">`. Its guidance paragraph moves as in rule 2, becoming `data-scope-note="all"`.
4. `#models-directory-panel` and `#labs-directory-panel`:
   - **Heading.** Delete the `<div class="section-heading …">` block.
   - **Kicker.** Keep its kicker as the first child of the scope note: `<p class="eyebrow" id="models-kicker">…</p>` becomes `<span id="models-kicker" class="scope-note-facts">…</span>`, followed by a space and the moved guidance text. Do the same for `labs-kicker`.
5. `#specifications-directory-panel`: delete its `.section-heading`. It has no guidance paragraph, so add this after its `.result-row`:

```html
        <p class="scope-note" data-scope-note="specifications"><span id="specifications-kicker" class="scope-note-facts">Interoperability artifacts</span> Protocols, instruction conventions, and package formats, classified by what they connect, with no cross-purpose score.</p>
```

Check the markup: `grep -c 'type="search"' web/index.html` prints 2 (`#door-search`, `#results-search`), and `grep -c 'class="filter-guidance"\|section-heading' web/index.html` prints 0.

- [ ] **Step 8: One table per collection, and one query**

In `web/app.js`:

1. In `SCOPE_CONTROLS`, set every scope's `q` to `"#results-search"`.
2. Replace `PAGE_CONTAINERS` and `pageRenderer` with:

```js
// One entry per collection: where its results live, how it paints, its
// Clear control, and its search box's hint. Every per-collection list reads
// this table, so a new collection is one entry here and one in
// AppCore.COLLECTIONS (CR-20; RECORD_DIALOGS is the pattern).
const RESULT_VIEWS = {
  all: { panel: "#all-directory-panel", grid: "#all-directory-grid", pager: "#all-directory-pager", count: "#all-directory-result-count", clear: "#reset-all-directory", placeholder: "Search systems, models, services, runtimes, packs, and robots", render: () => renderAllDirectoryEntries() },
  systems: { panel: "#systems-directory-panel", grid: "#project-grid", pager: "#project-pager", count: "#result-count", clear: "#reset-filters", placeholder: "Search all systems", render: () => renderCollection("systems") },
  inference: { panel: "#inference-directory-panel", grid: "#inference-grid", pager: "#inference-pager", count: "#inference-result-count", clear: "#reset-inference-filters", placeholder: "Search services and boundaries", render: () => renderCollection("inference") },
  runtimes: { panel: "#runtimes-directory-panel", grid: "#runtime-grid", pager: "#runtime-pager", count: "#runtime-result-count", clear: "#reset-runtime-filters", placeholder: "Search runtimes and boundaries", render: () => renderCollection("runtimes") },
  packs: { panel: "#packs-directory-panel", grid: "#pack-grid", pager: "#pack-pager", count: "#pack-result-count", clear: "#reset-pack-filters", placeholder: "Search packs and stewards", render: () => renderPacks() },
  robots: { panel: "#robots-directory-panel", grid: "#robot-grid", pager: "#robot-pager", count: "#robot-result-count", clear: "#reset-robot-filters", placeholder: "Search robots, makers, and named models", render: () => renderCollection("robots") },
  models: { panel: "#models-directory-panel", grid: "#model-grid", pager: "#model-pager", count: "#model-result-count", clear: "#reset-model-filters", placeholder: "Search models, developers, and boundaries", render: () => renderCollection("models") },
  labs: { panel: "#labs-directory-panel", grid: "#lab-grid", pager: "#lab-pager", count: "#lab-result-count", clear: "#reset-lab-filters", placeholder: "Search labs, units, and parent companies", render: () => renderCollection("labs") },
  specifications: { panel: "#specifications-directory-panel", grid: "#specification-grid", pager: "#specification-pager", count: "#specification-result-count", clear: "#reset-specification-filters", placeholder: "Search specifications and purposes", render: () => renderCollection("specifications") },
};

const pageRenderer = key => RESULT_VIEWS[key]?.render;
```

   In `renderPager`, replace `$(PAGE_CONTAINERS[key])` with `$(RESULT_VIEWS[key]?.pager)`. In `setPageSize`, replace the four render calls after the page reset with `RESULT_VIEWS[state.directoryCollection].render();`. The hidden Models, Labs, and Specifications grids paint when they open.

3. After `syncMatchSort`, add:

```js
// The one query every collection reads (Phase 3 spec, section 1).
const currentQuery = () => $("#results-search").value;

function syncMatchSorts() {
  Object.keys(MATCH_SORTS).forEach(syncMatchSort);
}

// Empties the one query, as the Finder's handoffs, Clear filters, and the
// front door do: every collection returns to its first page, and each sort
// follows the query's end as syncMatchSort decides.
function clearQuery() {
  $("#results-search").value = "";
  Object.keys(state.page).forEach(key => { state.page[key] = 1; });
  syncMatchSorts();
}

// Every search index, loaded once a query is present: the strip counts the
// query in every collection (CATALOG_INDEXES).
function loadCatalogIndexes() {
  for (const name of CATALOG_INDEXES) loadSearchIndex(name)?.then(renderSearchSurfaces);
}

// Typing repaints once the reader pauses (CR-21): the results, the strip's
// counts, and the URL follow 150 ms after the last keystroke, while the
// sort, a control's state rather than a paint, follows at once. The results
// region says it is busy meanwhile.
const RESULTS_PAUSE_MS = 150;
let resultsTimer = null;
function scheduleResults() {
  clearTimeout(resultsTimer);
  $(RESULT_VIEWS[state.directoryCollection].panel).setAttribute("aria-busy", "true");
  resultsTimer = setTimeout(flushResults, RESULTS_PAUSE_MS);
}

function flushResults() {
  clearTimeout(resultsTimer);
  resultsTimer = null;
  $$(".collection-panel[aria-busy]").forEach(panel => panel.removeAttribute("aria-busy"));
  if (!activeScope()) return;
  RESULT_VIEWS[state.directoryCollection].render();
  syncScopeStrip();
}

// A change to the query's text starts every collection on its first page.
// Typing on continues the same query, so a sort chosen during it stays
// (docs/WEB.md, Phase 3 spec section 1).
function onQueryInput() {
  Object.keys(state.page).forEach(key => { state.page[key] = 1; });
  syncMatchSorts();
  if (currentQuery().trim()) loadCatalogIndexes();
  scheduleResults();
}

// The one match pass per query and index state, shared by the strip's
// counts and the empty result's pointers.
let matchCache = { key: null, matched: new Set() };
function currentMatches(term = currentQuery()) {
  const key = `${term}\u0000${CATALOG_INDEXES.filter(name => searchIndexes[name]).join(",")}`;
  if (matchCache.key !== key) matchCache = { key, matched: AppCore.queryMatches(term, collectionPayloads(), searchIndexes, { labelOf: searchLabel }) };
  return matchCache.matched;
}

// The bar speaks for the collection on screen: its search hint and its Sort.
function syncResultsBar(scope) {
  $("#results-search").placeholder = RESULT_VIEWS[scope].placeholder;
  $$("#results-bar [data-sort-scope]").forEach(label => { label.hidden = label.dataset.sortScope !== scope; });
}
```

4. Replace `setDirectoryCollection` with the following. `carryQuery` keeps its meaning: `false` leaves the query as it is and loads nothing for it. Boot's restore loads through `loadRestoredSearch`, and a handoff has already cleared the query.

```js
function setDirectoryCollection(collection, { updateURL = true, carryQuery = updateURL } = {}) {
  const selected = AppCore.COLLECTIONS.some(entry => entry.id === collection) ? collection : "all";
  const compatible = (selected === "systems" && state.comparison.kind === "system")
    || (selected === "inference" && state.comparison.kind === "inference")
    || (selected === "runtimes" && state.comparison.kind === "runtime")
    || (selected === "models" && state.comparison.kind === "model");
  if (updateURL && state.comparison.ids.length && !compatible) clearComparison({ updateURL: false });
  state.directoryCollection = selected;
  showResults();
  renderScopeStrip();
  syncResultsBar(selected);
  // One box holds the query for every collection, so nothing is carried:
  // the new collection reads it, and its sort follows it.
  syncMatchSort(selected);
  if (carryQuery && currentQuery().trim()) loadCatalogIndexes();
  for (const [name, view] of Object.entries(RESULT_VIEWS)) {
    $(view.panel).hidden = name !== selected;
    if (name !== selected) $(view.grid).innerHTML = "";
  }
  RESULT_VIEWS[selected].render();
  if (updateURL) writeDirectoryURL();
  syncBadgeLegend();
}
```

5. In `showFrontDoor`, replace the block that clears the last collection's query:

```js
  const collection = state.directoryCollection;
  const query = $(SCOPE_CONTROLS[collection].q);
  if (query.value) {
    query.value = "";
    state.page[collection] = 1;
    syncMatchSort(collection);
  }
```

   with:

```js
  if (currentQuery()) clearQuery();
```

   Add `$("#results-bar").hidden = true;` and `$("#directory").classList.remove("is-results");` beside `$("#scope-strip").hidden = true;`. In `showResults`, add `$("#results-bar").hidden = false;` and `$("#directory").classList.add("is-results");` beside `$("#scope-strip").hidden = false;`.

6. In the `#mobile-nav` Search handler (#390), replace `$("#all-directory-search").focus();` with `$("#results-search").focus();`. In `renderAllDirectoryEntries`, replace both `$("#all-directory-search").value` with `currentQuery()`. In `renderPacks`, replace `$("#pack-search").value` with `currentQuery()`. In `renderCollection`, replace both `$(SCOPE_CONTROLS[name].q).value` with `currentQuery()`.
7. In `applyDirectoryDefaults`, delete `$("#project-search").value = defaults.term;`. The query is no longer a Systems default.
8. In `applyFinderToDirectory`, replace each of `$("#runtime-search").value = "";`, `$("#inference-search").value = "";`, and `$("#project-search").value = "";` with `clearQuery();`.
9. Replace `searchAllCollections` with:

```js
// "Search all" under an empty result lists the one query in All, opening
// the Directory first when another view is active, and hands the search box
// focus. The query stays: every collection reads the same one.
function searchAllCollections() {
  if ($(".view.is-active")?.id !== "directory") activateView("directory");
  state.page.all = 1;
  setDirectoryCollection("all", { carryQuery: false });
  $("#results-search").focus();
}
```

10. Replace `SEARCH_SCOPES` with:

```js
const SEARCH_SCOPES = { "#results-search": CATALOG_INDEXES, "#door-search": CATALOG_INDEXES };
```

11. Replace `renderSearchSurfaces` with:

```js
function renderSearchSurfaces() {
  pageRenderer(state.directoryCollection)?.();
  syncScopeStrip();
  if (state.directoryRoles) renderFinder();
}
```

- [ ] **Step 9: The strip counts in place**

In `web/app.js`:

1. Replace `renderScopeStrip` and `renderFamilyRow` with the following. `renderCollectionIndex`'s `if (count === 0 && entry.id !== "all") return "";` becomes `if (AppCore.collectionHidden(entry.id, payloads)) return "";`.

```js
// The results strip: one entry per registry entry, the collection pressed.
// Up to tablet width (1000 px) the entries are emblems only and the pressed
// one's name and count read as a caption under the row (styles.css), so nine
// entries fit a 320 px phone with slack and nothing scrolls sideways. Up to
// 1407 px each shows its short name, so the row stays one row. Inside Systems
// a second row lists the families, one pressed. It is rebuilt only when the
// collection or the family changes; counts and dots update in place
// (syncScopeStrip), so a click that lands during a repaint is never lost.
const FAMILY_ORDER = ["memory_system", "agent_system", "assistant_system"];
function renderScopeStrip() {
  const strip = $("#scope-strip");
  const focused = strip.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused?.dataset.openCollection !== undefined
    ? `[data-open-collection="${focused.dataset.openCollection}"]`
    : focused?.dataset.familyEntry !== undefined ? `[data-family-entry="${focused.dataset.familyEntry}"]` : null;
  const payloads = collectionPayloads();
  const entries = AppCore.COLLECTIONS.map(entry => {
    if (AppCore.collectionHidden(entry.id, payloads)) return "";
    const pressed = entry.id === state.directoryCollection;
    // Keep an initial as a fallback for any future collection without a glyph.
    const emblem = collectionEmblem(entry) || `<span class="scope-monogram" aria-hidden="true">${escapeHTML(AppCore.monogramGlyph(entry.name))}</span>`;
    return `<button type="button" class="scope-entry${pressed ? " is-active" : ""}" data-open-collection="${escapeHTML(entry.id)}" aria-pressed="${pressed}" title="${escapeHTML(entry.name)}">${emblem}<span class="scope-name">${escapeHTML(entry.name)}</span><span class="scope-short" aria-hidden="true">${escapeHTML(entry.short)}</span><strong class="scope-count"></strong><span class="scope-count-label visually-hidden"></span></button>`;
  }).join("");
  const familyRow = state.directoryCollection === "systems" ? renderFamilyRow() : "";
  strip.innerHTML = `<div class="scope-row">${entries}</div><p class="scope-caption" aria-hidden="true"></p>${familyRow}`;
  syncScopeStrip();
  if (focusKey) strip.querySelector(focusKey)?.focus({ preventScroll: true });
  syncStickyClearance();
}

function renderFamilyRow() {
  const current = $("#family-filter").value;
  const entry = (value, label) => `<button type="button" class="family-entry${value === current ? " is-active" : ""}" data-family-entry="${escapeHTML(value)}" aria-pressed="${value === current}">${label} <strong></strong></button>`;
  const families = FAMILY_ORDER.map(id => entry(id, escapeHTML(AppCore.FAMILY_SHORT_NAMES[id])));
  // A phone shows "All" alone so the row stays one row (styles.css); the
  // clipped rest keeps "All families" the accessible name at every width.
  return `<div class="family-row" role="group" aria-label="System families">${entry("", 'All<span class="family-rest"> families</span>')}${families.join("")}</div>`;
}

// Fills the strip's counts, caption, and dots in place. While a query is
// present each entry counts its matches in its default view and says so;
// otherwise what that view lists (Phase 3 spec, section 2).
function syncScopeStrip() {
  const strip = $("#scope-strip");
  if (strip.hidden || !strip.firstElementChild) return;
  const payloads = collectionPayloads();
  const searching = currentQuery().trim() !== "";
  const matched = searching ? currentMatches() : null;
  const counts = searching ? AppCore.collectionMatchCounts(matched, payloads) : null;
  const matchWord = count => (count === 1 ? " match" : " matches");
  for (const button of strip.querySelectorAll(".scope-entry")) {
    const id = button.dataset.openCollection;
    const count = searching ? counts[id] : AppCore.collectionCount(id, payloads).count;
    button.querySelector(".scope-count").textContent = String(count);
    button.querySelector(".scope-count-label").textContent = searching ? matchWord(count) : "";
    button.querySelector(".state-dot")?.remove();
    button.insertAdjacentHTML("beforeend", stateDot(collectionStateFor(id)));
    if (id === state.directoryCollection) {
      const name = AppCore.COLLECTIONS.find(entry => entry.id === id).name;
      strip.querySelector(".scope-caption").textContent = `${name} · ${count}${searching ? matchWord(count) : ""}`;
    }
  }
  const families = AppCore.familyMatchCounts(matched, payloads);
  strip.querySelectorAll(".family-entry").forEach(button => {
    button.querySelector("strong").textContent = String(families[button.dataset.familyEntry] ?? 0);
  });
}
```

2. In `renderComparisonControls`, replace `if (state.directoryStage === "results") renderScopeStrip();` with `if (state.directoryStage === "results") syncScopeStrip();`.
3. Replace `stickyHeight` and extend `syncStickyClearance`:

```js
// How much sticks to the top of the viewport: the header, and in results
// the strip and, above 1000 px, the results bar. Each counts only while it
// is sticky; a hidden one measures no height.
function stickyHeight() {
  const sticky = element => element && !element.hidden && getComputedStyle(element).position === "sticky" ? element.getBoundingClientRect().height : 0;
  return sticky($(".site-header")) + sticky($("#scope-strip")) + sticky($("#results-bar"));
}
```

   In `syncStickyClearance`, before the `--sticky-clearance` line, add:

```js
  const strip = $("#scope-strip");
  document.documentElement.style.setProperty("--strip-height", `${strip && !strip.hidden ? strip.getBoundingClientRect().height : 0}px`);
```

- [ ] **Step 10: Empty results name their collections**

In `web/app.js`, replace `emptyResultMatches` and the "in other collections" line of `emptyStateMarkup`:

```js
// What a query still finds when a scope lists nothing for it:
// - `hidden`: this scope's own matches, which its facets hide. All has no
//   facets, so it hides nothing.
// - `elsewhere`: every other collection whose default view lists matches,
//   with its count, in registry order. From All that is Labs and
//   Specifications, which All leaves out (Phase 3 spec, section 2).
// - `searchAll`: whether All lists matches this scope does not.
// - `others`: how many distinct records outside this scope match.
// - `found`: whether anything in the catalog matches at all.
function emptyResultMatches(scope, term) {
  const query = AppCore.parseSearchQuery(term);
  const ownGroups = SCOPE_RECORDS[scope]?.() || [];
  const hidden = scope === "all" ? [] : ownGroups.flatMap(([kind, records, index]) => records
    .filter(record => AppCore.recordMatch(query, AppCore.searchFields(kind, record, { index, labelOf: searchLabel })) > 0)
    .map(record => ({ kind, record })));
  const matched = currentMatches(term);
  const counts = AppCore.collectionMatchCounts(matched, collectionPayloads());
  const own = new Set(ownGroups.flatMap(([, records]) => records));
  const elsewhere = AppCore.COLLECTIONS
    .filter(entry => entry.id !== scope && entry.id !== "all" && counts[entry.id] > 0)
    .map(entry => ({ id: entry.id, name: entry.name, count: counts[entry.id] }));
  const hiddenInAll = hidden.filter(({ kind }) => kind !== "lab" && kind !== "spec").length;
  return {
    hidden,
    elsewhere,
    searchAll: scope !== "all" && counts.all > hiddenInAll,
    others: [...matched].filter(record => !own.has(record)).length,
    found: counts.all + counts.labs + counts.specifications > 0,
  };
}
```

In `emptyStateMarkup`:

- Destructure `const { hidden, elsewhere, searchAll, others, found } = settled ? emptyResultMatches(scope, term) : { hidden: [], elsewhere: [], searchAll: false, others: 0, found: false };`.
- Replace the `${elsewhere.length ? …Search all…}` line with:

```js
    ${elsewhere.length || searchAll ? `<p>It matches ${others} ${others === 1 ? "record" : "records"} in other collections: ${[
      ...elsewhere.map(entry => `<button type="button" class="link-button" data-empty-open-collection="${escapeHTML(entry.id)}">${escapeHTML(entry.name)} ${entry.count}</button>`),
      ...(searchAll ? ['<button type="button" class="link-button" data-empty-search-all>Search all</button>'] : []),
    ].join(" · ")}</p>` : ""}
```

In `bindEvents`' delegated click handler, replace the `[data-empty-search-all]` branch's call with `searchAllCollections();`, and add beside it:

```js
    const collectionButton = event.target.closest("[data-empty-open-collection]");
    if (collectionButton) {
      openCollection(collectionButton.dataset.emptyOpenCollection);
      $("#results-search").focus();
      return;
    }
```

- [ ] **Step 11: Wire the one query, the Clear controls, and restore**

In `bindEvents`:

1. In the `for (const [scope, selector] of Object.entries(MATCH_SORTS))` loop, delete the `$(SCOPE_CONTROLS[scope].q).addEventListener("input", …)` line. Keep the sort select's listener.
2. Delete `$("#all-directory-search").addEventListener("input", …)`. From each per-collection `[…].forEach(selector => $(selector).addEventListener("input", …))` array, delete its search selector (`"#project-search"`, `"#specification-search"`, and the rest).
3. Add: `$("#results-search").addEventListener("input", onQueryInput);`
4. Replace the nine `$("#reset-…").addEventListener("click", …)` blocks, the Systems one included, with one function and one loop. Put the function beside `clearQuery`:

```js
// One Clear control per collection, one behaviour: the collection's own
// controls return to their defaults, and the query, which every collection
// shares, clears everywhere (front-door spec, Phase 1).
function resetCollection(scope) {
  if (scope === "systems") applyDirectoryDefaults();
  else {
    for (const [key, selector] of Object.entries(SCOPE_CONTROLS[scope])) {
      if (key !== "q") $(selector).value = AppCore.SCOPE_URL_PARAMS[scope][key] ?? "";
    }
  }
  clearQuery();
  RESULT_VIEWS[scope].render();
  // Systems' defaults can change the family, which the strip's second row
  // shows, so it rebuilds; elsewhere only the counts move.
  if (scope === "systems") renderScopeStrip();
  else syncScopeStrip();
}
```

   ```js
  for (const [scope, view] of Object.entries(RESULT_VIEWS)) $(view.clear).addEventListener("click", () => resetCollection(scope));
   ```

5. Replace the `#door-search` input handler's body:

```js
  $("#door-search").addEventListener("input", event => {
    const value = event.target.value;
    if (!value) return;
    event.target.value = "";
    state.page.all = 1;
    const target = $("#results-search");
    target.value = value;
    openCollection("all");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus({ preventScroll: true });
    target.setSelectionRange(value.length, value.length);
  });
```

Then restore:

1. In `allowedScopeValues`, before the closing `return`, build the result in a variable and add:

```js
  if (MATCH_SORTS[scope]) allowed.browseSort = new Set([...$(MATCH_SORTS[scope]).options].filter(option => !option.disabled && option.value !== "match").map(option => option.value));
  return allowed;
```

   The full function becomes:

```js
function allowedScopeValues(scope) {
  const allowed = Object.fromEntries(Object.entries(SCOPE_CONTROLS[scope] || {}).map(([key, selector]) => {
    const control = $(selector);
    if (control.type === "checkbox") return [key, new Set(["1"])];
    if (control.tagName === "SELECT") return [key, new Set([...control.options].filter(option => !option.disabled).map(option => option.value))];
    return [key, "text"];
  }));
  if (MATCH_SORTS[scope]) allowed.browseSort = new Set([...$(MATCH_SORTS[scope]).options].filter(option => !option.disabled && option.value !== "match").map(option => option.value));
  return allowed;
}
```

2. In `restoreScopeFromURL`'s loop over `values`, directly after the `if (key === "page") { … continue; }` block, add:

```js
    // The sort clearing the query returns to; syncMatchSort keeps it
    // (`sortBeforeQuery[scope] ??= …`).
    if (key === "browseSort") {
      sortBeforeQuery[scope] = value;
      continue;
    }
```

3. In `writeScopeURL`, replace the `for (const [key, value] of AppCore.scopeURLParams(scope, readScopeControls(scope)))` line with:

```js
    const values = readScopeControls(scope);
    if (MATCH_SORTS[scope] && !sortChosenDuringQuery[scope] && sortBeforeQuery[scope]) values.browseSort = sortBeforeQuery[scope];
    for (const [key, value] of AppCore.scopeURLParams(scope, values)) url.searchParams.set(key, value);
```

4. In `restoreFromURL`:
   - Wrap everything from `state.urlReady = false;` to the line before `state.urlReady = true;` in `try { … } finally { state.urlReady = true; }`, and delete the original `state.urlReady = true;`. A restore that throws then leaves the URL following the page.
   - In the `if (scope && restored.q?.trim())` block, replace `syncMatchSort(scope);` with `syncMatchSorts();`. The one restored query reaches every collection's sort.

- [ ] **Step 12: Style the bar, the scope notes, and the strip's counts**

In `web/styles.css`:

1. In `.control-panel`, delete `position: sticky;`, `top: 96px;`, and `z-index: 5;`, and set `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));`. The bar is what sticks now. Delete the `grid-template-columns` lines of `.specification-controls` and `.inference-controls`, and the whole `.mixed-directory-controls` rule. In `.advanced-filter-shell, .filter-guidance { grid-column: 1 / -1; }`, drop `.filter-guidance`, and delete the other `.filter-guidance` rules.
2. After `.collection-panel[hidden] { display: none; }`, add:

```css
/* The results bar: one search for every collection and the collection's
   Sort (Phase 3 spec, section 1). Above 1000 px it sticks under the strip. */
.results-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin: 0 0 .75rem; padding: .5rem 0; background: var(--header-bg); }
.results-bar[hidden] { display: none; }
.results-bar .results-search { flex: 1 1 18rem; }
.results-sort label { display: flex; align-items: center; gap: .45rem; }
.results-sort label[hidden] { display: none; }
@media (min-width: 1001px) {
  .results-bar { position: sticky; top: calc(var(--header-height, 88px) + var(--strip-height, 0px)); z-index: 8; backdrop-filter: blur(20px) saturate(140%); }
}
/* The score rule under each result count, with the collection's facts. */
.scope-note { margin: 0 0 .75rem; color: var(--muted); font-size: .78rem; }
.scope-note-facts { color: var(--text); font-weight: 600; }
.scope-note button { padding: 0; border: 0; background: transparent; color: var(--cyan); cursor: pointer; font-weight: 600; }
.scope-note button:hover { color: var(--text); }
#directory.view.is-results { padding-top: .75rem; }
```

3. In `@media (max-width: 1000px)`, replace `.scope-entry .scope-count { display: none; }` with the visually hidden pattern, so a screen reader still hears the count:

```css
  .scope-entry .scope-count { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

4. In the `@media (max-width: 720px)` block that sets `.family-entry strong { font-size: .56rem; }`, replace that rule with:

```css
  .family-entry strong { font-size: .62rem; }
  .family-entry:not(.is-active) strong { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

- [ ] **Step 13: Point the helpers at the one box**

In `tests/e2e/helpers/results.js`, replace `SEARCH_BOXES`, `searchBox`, and `search` with the following, and export `settled`:

```js
// One search box serves every collection since Phase 3 task 2.
const SEARCH_BOX = "#results-search";

function searchBox(page, scope) {
  return page.locator(scope ? SEARCH_BOX : `${SEARCH_BOX}:visible`);
}

// Typing repaints after a 150 ms pause, and the results region is busy
// until it has; a test that reads or clicks results waits for that.
async function settled(page) {
  await expect(page.locator('.collection-panel[aria-busy="true"]')).toHaveCount(0);
}

async function search(page, text, scope) {
  await searchBox(page, scope).fill(text);
  await settled(page);
}
```

In `tests/e2e/helpers/landing.js`:

- `allSearch` returns `page.locator("#door-search:visible, #results-search:visible")`.
- `searchAll` keeps #390's tap on the bottom bar's Search when no search box is on screen, and becomes:

```js
async function searchAll(page, text) {
  if (!await allSearch(page).count()) await page.locator('[data-mobile-nav="search"]').click();
  await allSearch(page).fill(text);
  await require("./results").settled(page);
}
```

- [ ] **Step 14: Rewrite the three tests written for nine boxes**

In `tests/e2e/search.spec.js`, replace the three tests named below. The rest of the suite keeps its assertions.

```js
test("clearing a query everywhere keeps a sort chosen during it, and the next query starts from that sort", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const sort = sortControl(page, "systems");
  await search(page, "memory");
  await expect(sort).toHaveValue("match");
  await sort.selectOption("stars");
  await openCollection(page, "all");
  await clearFilters(page, "all");
  await expect(searchBox(page), "All's Clear control clears the one query").toHaveValue("");
  await search(page, "browser");
  await openCollection(page, "systems");
  await expect(searchBox(page)).toHaveValue("browser");
  await expect(sort, "a new query selects Best match").toHaveValue("match");
  await search(page, "");
  await expect(sort, "clearing gives back the sort the reader had before this query").toHaveValue("stars");
});
```

It replaces "a query carried in with new text selects Best match, and clearing it restores the earlier sort".

```js
test("Search all lists the one query in All and keeps it for every collection", async ({ page }) => {
  // Only a system holds this word, so Models lists nothing and offers All.
  const systems = readWeb("app/search/systems.json");
  const [first] = Object.keys(systems);
  await page.route(indexRoute("systems"), route => route.fulfill({ json: withIndexWord(systems, first) }));
  await page.goto("/?collection=models");
  await search(page, INDEX_WORD);
  await page.locator("#model-grid").getByRole("button", { name: "Search all" }).click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Everything /);
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(searchBox(page)).toBeFocused();
  await openCollection(page, "systems");
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(sortControl(page, "systems")).toHaveValue("match");
});
```

It replaces "Search all from a sibling view leaves the Directory scope's own query alone".

```js
test("a changed query starts every collection on its first page", async ({ page }) => {
  const index = readWeb("app/search/inference.json");
  await page.route(indexRoute("inference"), route => route.fulfill({
    json: Object.fromEntries(Object.entries(index).map(([id, text]) => [id, `${text} ${INDEX_WORD}`])),
  }));
  await page.goto("/?collection=inference&page=2");
  const pager = page.locator("#inference-pager");
  await expect(pager).toContainText("Page 2 of");
  await openCollection(page, "all");
  await search(page, INDEX_WORD);
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  await openCollection(page, "inference");
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(pager).toContainText(/Page 1 of ([2-9]|\d{2,})/);
});
```

It replaces "a query carried in with new text starts on the first page".

Add any helper names these use to the file's `require` lines.

- [ ] **Step 15: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS. Suspect a failure that expects results the moment text is typed first: route that step through `search()` or `settled()` rather than adding a wait.

- [ ] **Step 16: Update the contracts and the backlog**

In `docs/WEB.md`:

1. **Content hierarchy, the tile line.** Replace "lands in results with the caret in the All search." with "lands in results with the caret in the results search."
2. **After the strip line** (the line beginning "- In results a sticky strip under the header"), add:

```markdown
- In results a bar directly under the strip holds one search box, `#results-search`, for every collection, and the Sort control of a collection that has one. Above 1000px it sticks under the strip and `--sticky-clearance` counts it; at 1000px and below it scrolls with the page. While a query is present, every strip entry, the pressed entry's caption, and the Systems family row count the query's matches in their default view, updated in place rather than rebuilt, and each entry's accessible name says so ("Labs 3 matches"). At 1000px and below the entries' counts are visually hidden, never removed, and at 720px and below so are the unpressed family entries' counts. The front door's heading needs a top margin that results do not, so the results drop it.
```

3. Replace "- State the applicable score-scope rule beside each collection's controls." with:

```markdown
- State the applicable score-scope rule in each collection's scope note, the line under its result count. Models, Labs, and Specifications carry their counts there too (`#models-kicker`, `#labs-kicker`, `#specifications-kicker`).
```

4. **Behavioral contracts.** Replace the line beginning "- A query follows the reader between Directory scopes" with:

```markdown
- One search box, `#results-search`, serves every Directory collection, the family entries included, so a query follows the reader by construction. A change to its text returns every collection to its first page. Typing on continues the same query, so a sort the reader chose during it survives in that collection until the query is cleared, and each collection keeps its own sort from before the query. The results, the strip's counts, and the URL follow 150ms after the last keystroke, and the results region is `aria-busy` until they have; the sort follows at once. The Finder's handoff and every Clear control clear the query.
```

5. In the line beginning `- "/" focuses the visible search box`, replace "Each of the nine search boxes shows its result count" with "The results search shows the collection's result count".
6. Replace the sub-bullet beginning `  - "It matches N records in other collections."` with:

```markdown
  - "It matches N records in other collections:", followed by one button per collection whose default view lists matches ("Labs 3"), which opens that collection with the query, and "Search all" when All lists matches this collection does not. All's own empty result names Labs and Specifications, which All leaves out. Each button focuses the results search.
```

7. In the URL line beginning "- The active Catalog collection writes its query", after "to the URL with `replaceState`;", insert:

```markdown
 while a query is present and the reader has chosen no sort during it, `browseSort` carries the collection's sort from before the query when that differs from its default, so a reload keeps what clearing the query returns to;
```

8. In the boot-payload line, replace the sentence beginning "A search box loads its collection's search index from `app/search/` on focus" up to its full stop with:

```markdown
Focusing either search box loads every collection's search index from `app/search/`, as does a query restored at boot or carried by a collection switch, and every index loads when a search lists nothing.
```

In `BACKLOG.md`:

- **Delete these items:**
  - "Keep a sort chosen before typing in the URL while a query lasts";
  - "Point an empty result at Labs and Specifications";
  - "Debounce the search inputs and stop the wasted repaints (`CR-21`)".
- **Delete these "Phase 2 follow-ups":**
  - "the phone strip's caption is `aria-hidden`…";
  - "the strip is rebuilt with `innerHTML`…";
  - "the collection id whitelists are hardcoded…";
  - "`restoreFromURL` clears `urlReady` with no `try`/`finally`…";
  - "the phone family row's `.62rem` text…";
  - "`setPageSize` still repaints the hidden Models, Labs, and Specifications grids".
- **CR-20.** In its item, replace everything from "`renderers` and `pageRenderer` remain" to "`RECORD_DIALOGS` is the model to follow." with "The per-collection tables became one `RESULT_VIEWS` table in Phase 3 task 2; the card half remains for task 4." `tests/test_documentation.py` checks that every symbol the Engineering debt section names still exists, and this sentence named `renderers`, which this task deletes.

- [ ] **Step 17: Stamp, run the gate, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
/usr/local/bin/node --test tests/test_web.js
git add web/app-core.js web/app.js web/index.html web/styles.css tests/test_web.js tests/e2e docs/WEB.md BACKLOG.md web/blog
git commit -m "Give results one bar, one query, and match counts in the strip"
gh pr create --title "Give results one bar, one query, and match counts in the strip" --body "Front-door Phase 3, task 2 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). One search box and the collection's sort sit in a bar under the strip, the query is one value painted after a 150 ms pause (CR-21), the strip counts matches while searching, an empty result names the collections that hold matches, and a sort chosen before typing survives a reload as browseSort. Closes the table half of CR-20 and six Phase 2 follow-ups."
```

---
### Task 3: The filter rail, chips, and the Lab filter

Above 1000 px a rail beside the results lists the active collection's filters. Each value shows the number of records it would list. On narrow screens the same groups open as a sheet from the bar's Filters button. Every non-default filter becomes a removable chip above the results, followed by one Clear filters. `labRelations` becomes a Lab filter in Systems, Inference services, Local runtimes, and Specifications, beside the one Models has. One definition per filter group in the core feeds both the results and the counts.

**Ruling R-P3-1 (recorded for the executor's ledger; the spec now states the same).** The spec says `SCOPE_CONTROLS`, `readScopeControls`, `resetScopeControls`, and `clearScopeFacets` are reworked to read the rail's groups by key.

- **What the plan does instead.** It keeps every filter's `<select>` as a hidden state holder, and the rail draws from it. The radios write the select and dispatch the `input` event its handlers already listen for.
- **Why.** Every restore, reset, handoff, and "Show it" path keeps its tested plumbing. Restore still checks values against the published options, which counts never disable, as spec section 3 requires. The spec's aims hold: one definition per group feeds the results and the counts, and the rail is drawn from those definitions.
- **Cost if wrong.** A later task that removes the selects would need these paths reworked then.

**Files:**

- Modify: `web/app-core.js`:
  - add `FILTER_GROUPS`, `matchesFilterGroups`, `filterGroupCounts`, and `buildLabMembership`;
  - move the facet checks of `matchesProjectFacets`, `filterSpecifications`, `filterScoredCollection`, `filterModels`, and `filterLabs` onto the groups;
  - give each view a `collection`;
  - add `lab: ""` to four collections' URL parameters.
- Modify: `web/index.html`:
  - the `.control-panel`s become hidden `.filter-state` holders, with four new Lab selects;
  - add `#results-frame`, `#filter-rail`, `#filter-chips`, `#clear-filters`, `#filters-button`, and `#filter-sheet`;
  - move `#finder-roles-chip`;
  - delete the result rows' Clear buttons.
- Modify: `web/app.js`:
  - state and boot;
  - `SCOPE_CONTROLS`;
  - the collections' `records` functions;
  - `populateLabFilters`;
  - the rail, the chips, the sheet, and `clearScopeFacets`;
  - `RESULT_VIEWS` loses `clear`;
  - delete `updateAdvancedFilterSummary` and `labModelIds`.
- Modify: `web/styles.css`, `tests/test_web.js`, `tests/e2e/helpers/results.js`, `tests/e2e/results-page.spec.js`, `tests/e2e/directory-search.spec.js`
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes: Task 2's `RESULT_VIEWS`, `currentQuery()`, `currentMatches()`, `clearQuery()`, `resetCollection(scope)`, `syncScopeStrip()`, `settled(page)`.
- Produces:
  - **In `AppCore`:**
    - `FILTER_GROUPS[collectionId]` → array of `{ key, name, values(record, ctx) → string[] }`;
    - `matchesFilterGroups(record, filters, groups, ctx, except = null)` → boolean;
    - `filterGroupCounts(records, filters, groups, ctx)` → `{ [key]: Map<value, count> }`;
    - `buildLabMembership(labs, catalog)` → `{ labsOf: Map<record, labId[]>, distributionsOf: Map<labId, string[]> }`. `ctx` is `{ labs: labMembership }`, and filters carry it as `labMembership`.
  - **Markup:**
    - `#filter-rail > .filter-groups`, and `#filter-sheet > .filter-groups`;
    - each group is `fieldset.filter-group[data-filter-group="<key>"] > legend + label.filter-option > input[type=radio][value]`, with an optional `.filter-count` and `button[data-filter-more]`;
    - `#filter-chips > .filter-chip[data-chip-key]`, then `#finder-roles-chip`, then `#clear-filters`;
    - `#filters-button > .filters-count`; `#filter-sheet-done`.
  - **In `web/app.js`:**
    - `state.labMembership`;
    - `renderFilterRail()` rebuilds the groups; `syncFilterRail()` updates counts, disabled, checked, and chips in place.
    - `openFilterSheet()`.
  - **Test helpers:**
    - `setFilter(page, scope, key, value)` uses the rail, or the sheet when the rail is hidden. Systems' `family` goes through the strip.
    - `clearFilters(page, scope)` presses `#clear-filters`.
    - `filterControl`/`expectFilter` read the hidden select, unchanged.

- [ ] **Step 1: Write the failing unit tests**

Add `FILTER_GROUPS, buildLabMembership, filterGroupCounts, matchesFilterGroups` to the core `require` in `tests/test_web.js`, and append:

```js
test("every filter group reads a URL key, and every facet key has a group", () => {
  for (const [collection, groups] of Object.entries(FILTER_GROUPS)) {
    const keys = Object.keys(SCOPE_URL_PARAMS[collection]).filter(key => !["q", "sort", "browseSort", "family"].includes(key));
    assert.deepEqual(groups.map(group => group.key).sort(), keys.sort(), collection);
  }
  assert.equal(FILTER_GROUPS.systems[0].key, "role", "Role leads in Systems; Family is the strip's row");
  assert.deepEqual(FILTER_GROUPS.all, []);
});

test("a filter group matches what a record carries for it", () => {
  const groups = FILTER_GROUPS.systems;
  const project = { primary_role: "coding_agent", licenses: ["MIT"], deployment: ["local_cli"], status: "active", local_first: null };
  assert.equal(matchesFilterGroups(project, { license: "MIT" }, groups), true);
  assert.equal(matchesFilterGroups(project, { license: "Apache-2.0" }, groups), false);
  assert.equal(matchesFilterGroups(project, { localOnly: "unknown" }, groups), true);
  assert.equal(matchesFilterGroups(project, { localOnly: "1" }, groups), false);
  assert.equal(matchesFilterGroups(project, { localOnly: false, status: "" }, groups), true, "false and empty choose nothing");
  assert.equal(matchesFilterGroups({ ...project, local_first: true }, { localOnly: true }, groups), true, "the legacy true reads as 1");
  assert.equal(matchesFilterGroups(project, { status: "archived", license: "MIT" }, groups, {}, "status"), true, "except leaves a group aside");
});

test("a group's counts leave its own choice aside and read every other one", () => {
  const groups = FILTER_GROUPS.inference;
  const services = [
    { service_type: "direct_model_api", delivery_modes: ["api"], model_sources: [], api_styles: ["openai"] },
    { service_type: "direct_model_api", delivery_modes: ["api"], model_sources: [], api_styles: ["native"] },
    { service_type: "routing_aggregator", delivery_modes: ["api"], model_sources: [], api_styles: ["openai"] },
  ];
  const counts = filterGroupCounts(services, { type: "direct_model_api", apiStyle: "openai" }, groups);
  assert.equal(counts.type.get("direct_model_api"), 1);
  assert.equal(counts.type.get("routing_aggregator"), 1, "the type group ignores its own choice");
  assert.equal(counts.apiStyle.get("openai"), 1);
  assert.equal(counts.apiStyle.get("native"), 1);
  assert.equal(counts.apiStyle.get("missing"), undefined, "a value no record carries has no count");
});

test("lab membership follows labRelations for every collection", () => {
  const lab = { id: "lab-acme", name: "Acme", catalog_names: ["Acme"], systems: ["s1"] };
  const catalog = {
    projects: [{ id: "s1" }, { id: "s2" }],
    services: [{ id: "i1", operator: "Acme" }],
    runtimes: [{ id: "r1", maintainer: "Other" }],
    models: [{ id: "m1", developer: "Acme", review_status: "reviewed", source_id: "acme/m1", distribution_modes: ["open_weights"] }],
    specifications: [{ id: "sp1", stewards: ["Acme"] }],
    packs: [],
  };
  const { labsOf, distributionsOf } = buildLabMembership([lab], catalog);
  assert.deepEqual(labsOf.get(catalog.projects[0]), ["lab-acme"]);
  assert.equal(labsOf.get(catalog.projects[1]), undefined);
  assert.deepEqual(labsOf.get(catalog.services[0]), ["lab-acme"]);
  assert.deepEqual(labsOf.get(catalog.specifications[0]), ["lab-acme"]);
  assert.deepEqual(distributionsOf.get("lab-acme"), ["open_weights"]);
  const ctx = { labs: { labsOf, distributionsOf } };
  assert.equal(matchesFilterGroups(catalog.services[0], { lab: "lab-acme" }, FILTER_GROUPS.inference, ctx), true);
  assert.equal(matchesFilterGroups(catalog.runtimes[0], { lab: "lab-acme" }, FILTER_GROUPS.runtimes, ctx), false);
});
```

Append a real-catalog test that ties the rail's counts to the results. Each value's count must equal what choosing it lists:

```js
test("on the real catalog, every rail count equals what choosing its value lists", () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "app", `${name}.json`), "utf8"))[name];
  const payloads = {
    projects: read("systems"), services: read("inference"), runtimes: read("runtimes"), models: read("models"),
    packs: read("packs"), robots: read("robots"), labs: read("labs"), specifications: read("specifications"),
  };
  const labMembership = buildLabMembership(payloads.labs, payloads);
  const ctx = { labs: labMembership };
  const lists = {
    systems: filters => filterAndSortProjects(payloads.projects, { ...filters, sort: "name", labMembership }),
    inference: filters => filterInferenceServices(payloads.services, { ...filters, sort: "name", labMembership }),
    runtimes: filters => filterLocalRuntimes(payloads.runtimes, { ...filters, sort: "name", labMembership }),
    models: filters => filterModels(payloads.models, { ...filters, sort: "name", labMembership }),
    packs: filters => filterPacks(payloads.packs, { ...filters, labMembership }),
    robots: filters => filterRobots(payloads.robots, { ...filters, labMembership }),
    labs: filters => filterLabs(payloads.labs, { ...filters, labMembership }),
    specifications: filters => filterSpecifications(payloads.specifications, { ...filters, labMembership }),
  };
  const records = { systems: payloads.projects, inference: payloads.services, runtimes: payloads.runtimes, models: payloads.models, packs: payloads.packs, robots: payloads.robots, labs: payloads.labs, specifications: payloads.specifications };
  for (const [collection, list] of Object.entries(lists)) {
    const base = collection === "systems" ? { status: "" } : {};
    const counts = filterGroupCounts(records[collection], base, FILTER_GROUPS[collection], ctx);
    for (const [key, values] of Object.entries(counts)) {
      for (const [value, count] of values) {
        assert.equal(list({ ...base, [key]: value }).length, count, `${collection} ${key}=${value}`);
      }
    }
  }
});
```

Add any of `filterAndSortProjects, filterInferenceServices, filterLabs, filterLocalRuntimes, filterModels, filterPacks, filterRobots, filterSpecifications, SCOPE_URL_PARAMS` not already required. `fs` and `path` are required at the top of the file already.

- [ ] **Step 2: Run them to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, because `FILTER_GROUPS` is undefined.

- [ ] **Step 3: Implement the core**

In `web/app-core.js`:

1. Add `lab: ""` to `SCOPE_URL_PARAMS` for `systems` (after `capability`), `inference` (after `apiStyle`), `runtimes` (after `apiStyle`), and `specifications` (after `license`).
2. Before `matchesProjectFacets`, add:

```js
  // The rail's filter groups per collection, in rail order (Phase 3 spec,
  // section 3). Each reads one URL key; `values(record, ctx)` lists what a
  // record carries for it, and a record matches a chosen value when that
  // list holds it. The results and the rail's counts both read these, so
  // they never disagree. `ctx.labs` is buildLabMembership's result; Family
  // is the strip's row, so Systems has no family group.
  const listOf = value => (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]);
  const fieldValues = field => record => listOf(record[field]).map(String);
  const labValues = (record, ctx = {}) => ctx.labs?.labsOf.get(record) || [];
  const FILTER_GROUPS = {
    all: [],
    systems: [
      { key: "role", name: "Role", values: fieldValues("primary_role") },
      { key: "sourceModel", name: "Source model", values: fieldValues("source_model") },
      { key: "license", name: "License", values: fieldValues("licenses") },
      { key: "agent", name: "AI relationship", values: fieldValues("agent_relation") },
      { key: "architecture", name: "Architecture", values: fieldValues("architectures") },
      { key: "deployment", name: "Deployment", values: fieldValues("deployment") },
      { key: "agentInterface", name: "Interface", values: fieldValues("agent_interfaces") },
      { key: "capability", name: "Capability", values: fieldValues("agent_capabilities") },
      { key: "status", name: "Status", values: fieldValues("status") },
      { key: "localOnly", name: "Local-first", values: project => [project.local_first === true ? "1" : project.local_first === false ? "0" : "unknown"] },
      { key: "lab", name: "Lab", values: labValues },
    ],
    inference: [
      { key: "type", name: "Type", values: fieldValues("service_type") },
      { key: "delivery", name: "Delivery", values: fieldValues("delivery_modes") },
      { key: "modelSource", name: "Model source", values: fieldValues("model_sources") },
      { key: "apiStyle", name: "API style", values: fieldValues("api_styles") },
      { key: "lab", name: "Lab", values: labValues },
    ],
    runtimes: [
      { key: "type", name: "Type", values: fieldValues("runtime_type") },
      { key: "accelerator", name: "Accelerator", values: fieldValues("accelerators") },
      { key: "modelFormat", name: "Model format", values: fieldValues("model_formats") },
      { key: "apiStyle", name: "API style", values: fieldValues("api_styles") },
      { key: "lab", name: "Lab", values: labValues },
    ],
    models: [
      { key: "type", name: "Type", values: fieldValues("model_type") },
      { key: "distribution", name: "Distribution", values: fieldValues("distribution_modes") },
      { key: "modality", name: "Modality", values: model => [...new Set([...(model.source_metadata?.modalities?.input || []), ...(model.source_metadata?.modalities?.output || [])])] },
      { key: "sourceModel", name: "Source model", values: fieldValues("source_model") },
      { key: "license", name: "License", values: fieldValues("licenses") },
      { key: "lab", name: "Lab", values: labValues },
    ],
    packs: [
      { key: "type", name: "Type", values: fieldValues("pack_type") },
      { key: "host", name: "Host", values: fieldValues("hosts") },
      { key: "install", name: "Install", values: fieldValues("install_mechanism") },
      { key: "license", name: "License", values: fieldValues("licenses") },
    ],
    robots: [
      { key: "formFactor", name: "Form", values: fieldValues("form_factor") },
      { key: "aiBasis", name: "AI", values: fieldValues("ai_basis") },
      { key: "availability", name: "Availability", values: fieldValues("availability") },
      { key: "status", name: "Status", values: fieldValues("status") },
    ],
    labs: [
      { key: "type", name: "Type", values: fieldValues("lab_type") },
      { key: "headquarters", name: "Headquarters", values: fieldValues("headquarters") },
      { key: "distribution", name: "Releases", values: (lab, ctx = {}) => ctx.labs?.distributionsOf.get(lab.id) || [] },
    ],
    specifications: [
      { key: "type", name: "Type", values: fieldValues("specification_type") },
      { key: "scope", name: "Scope", values: fieldValues("scope") },
      { key: "status", name: "Status", values: fieldValues("status") },
      { key: "license", name: "License", values: fieldValues("licenses") },
      { key: "lab", name: "Lab", values: labValues },
    ],
  };

  // Whether a record passes every chosen group. `except` leaves one group
  // aside, as that group's own counts need. An empty choice, and the legacy
  // `localOnly: false`, choose nothing; `localOnly: true` reads as "1".
  function matchesFilterGroups(record, filters = {}, groups = [], ctx = {}, except = null) {
    return groups.every(group => {
      if (group.key === except) return true;
      const chosen = filters[group.key];
      if (chosen === undefined || chosen === null || chosen === "" || chosen === false) return true;
      return group.values(record, ctx).includes(chosen === true ? "1" : String(chosen));
    });
  }

  // For each group, how many records each value would list given every other
  // group's choice: a group's own choice aside, so the reader sees what each
  // alternative gives (Phase 3 spec, section 3). A value no record carries
  // has no entry.
  function filterGroupCounts(records, filters = {}, groups = [], ctx = {}) {
    return Object.fromEntries(groups.map(group => {
      const counts = new Map();
      for (const record of records) {
        if (!matchesFilterGroups(record, filters, groups, ctx, group.key)) continue;
        for (const value of new Set(group.values(record, ctx))) counts.set(value, (counts.get(value) || 0) + 1);
      }
      return [group.key, counts];
    }));
  }
```

3. Replace `matchesProjectFacets` with the following. Family and the Finder's role set stay explicit, because neither is a rail group.

```js
  function matchesProjectFacets(project, filters) {
    const roles = filters.roles || [];
    return (!filters.family || project.system_family === filters.family) &&
      (!roles.length || roles.includes(project.primary_role)) &&
      matchesFilterGroups(project, filters, FILTER_GROUPS.systems, { labs: filters.labMembership });
  }
```

   `matchesLocalFirst` stays; `systemDeploymentSummary` uses it.
4. In `filterSpecifications`, replace the facet `filter` with:

```js
    const faceted = specifications.filter(specification =>
      matchesFilterGroups(specification, filters, FILTER_GROUPS.specifications, { labs: filters.labMembership }));
```

5. In `filterScoredCollection`, replace the `facets` block with the following. A view names its collection's groups; ad hoc `facets` still work for callers such as the runtime-options test.

```js
    const groups = options.collection
      ? FILTER_GROUPS[options.collection]
      : Object.entries(options.facets || {}).map(([key, field]) => ({ key, values: fieldValues(field) }));
    const faceted = records.filter(record => matchesFilterGroups(record, filters, groups, { labs: filters.labMembership }));
```

6. In each view, replace its `facets: { … }` with a `collection` id:
   - `INFERENCE_SERVICE_VIEW` gets `collection: "inference"`;
   - `LOCAL_RUNTIME_VIEW` gets `collection: "runtimes"`;
   - `MODEL_VIEW` gets `collection: "models"`;
   - `PACK_VIEW` gets `collection: "packs"`;
   - `LAB_VIEW` gets `collection: "labs"`;
   - `ROBOT_VIEW` gets `collection: "robots"`.
7. Replace `filterModels` and `filterLabs` with the following. Modality, lab, and release distribution are groups now.

```js
  function filterModels(models, filters = {}) {
    const matches = filterScoredCollection(models, filters, MODEL_VIEW);
    return filters.sort === "release" ? releasesNewestFirst(matches) : matches;
  }

  function filterLabs(labs, filters = {}) {
    return filterScoredCollection(labs, { ...filters, sort: unscoredSort(filters) }, LAB_VIEW);
  }
```

8. After `labRelations`, add:

```js
  // Which labs join each record, by labRelations' rules, and the release
  // distributions of each lab's reviewed releases: the Lab filter's values
  // and Labs' "Releases" filter. Built once, since the joins read every
  // collection; labs go A–Z, never by size (ADR 041).
  function buildLabMembership(labs = [], catalog = {}) {
    const labsOf = new Map();
    const distributionsOf = new Map();
    for (const lab of [...labs].sort((a, b) => a.name.localeCompare(b.name))) {
      const relations = labRelations(lab, catalog);
      const joined = [...relations.models, ...relations.sourceRows, ...relations.services, ...relations.runtimes, ...relations.specifications, ...relations.packs, ...relations.systems];
      for (const record of joined) {
        if (!labsOf.has(record)) labsOf.set(record, []);
        labsOf.get(record).push(lab.id);
      }
      distributionsOf.set(lab.id, [...new Set(relations.models.flatMap(model => model.distribution_modes || []))]);
    }
    return { labsOf, distributionsOf };
  }
```

9. Export `FILTER_GROUPS`, `buildLabMembership`, `filterGroupCounts`, and `matchesFilterGroups`.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS. If an older filter test fails, it pinned one of `filterModels`'s `ids` or `filterLabs`'s `models` options: pass `lab` and `labMembership` instead.

- [ ] **Step 5: Write the failing browser tests**

Append to `tests/e2e/results-page.spec.js`, and add `openFamily` and `setFilter, expectFilter, clearFilters` to its requires:

```js
test("the rail lists Systems' filters with Role first, and a count equals what choosing it lists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const rail = page.locator("#filter-rail");
  await expect(rail).toBeVisible();
  await expect(rail.locator(".filter-group legend").first()).toHaveText("Role");
  const option = rail.locator('[data-filter-group="role"] .filter-option').filter({ has: page.locator(".filter-count") }).nth(1);
  const count = Number(await option.locator(".filter-count").textContent());
  await option.locator("input").check();
  await expect(page.locator("#result-count")).toHaveText(new RegExp(`^${count} projects?\\b`));
  await expect(page).toHaveURL(/role=/);
});

test("a group's counts leave its own choice aside, and focus stays while the reader moves through it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  const group = page.locator('#filter-rail [data-filter-group="type"]');
  await group.locator("input").nth(1).check();
  await expect(group.locator(".filter-count").nth(1)).not.toHaveText("0");
  await group.locator("input").nth(1).focus();
  await page.keyboard.press("ArrowDown");
  await settled(page);
  expect(await page.evaluate(() => document.activeElement?.closest("[data-filter-group]")?.dataset.filterGroup)).toBe("type");
});

test("every active filter is a chip, and Clear filters clears them and the query", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=runtimes");
  await search(page, "server");
  const option = page.locator('#filter-rail [data-filter-group="type"] input').nth(1);
  await option.check();
  await settled(page);
  const chips = page.locator("#filter-chips .filter-chip");
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText("Type: ");
  await chips.first().click();
  await settled(page);
  await expect(chips).toHaveCount(0);
  await option.check();
  await clearFilters(page, "runtimes");
  await expect(chips).toHaveCount(0);
  await expect(searchBox(page)).toHaveValue("");
});

test("on a phone the filters open as a sheet whose button counts the results", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference");
  await expect(page.locator("#filter-rail")).toBeHidden();
  await page.locator("#filters-button").click();
  const sheet = page.locator("#filter-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-filter-group="type"] input').nth(1).check();
  await settled(page);
  const shown = Number((await page.locator("#inference-result-count").textContent()).match(/^\d+/)[0]);
  await expect(page.locator("#filter-sheet-done")).toHaveText(`Show ${shown} ${shown === 1 ? "result" : "results"}`);
  await page.locator("#filter-sheet-done").click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#filters-button .filters-count")).toHaveText("1");
});

test("Agent packs count packs only and say so, with no Lab filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=packs");
  await expect(page.locator("#filter-rail .filter-note")).toHaveText("Counts are packs; installed systems follow the search only.");
  await expect(page.locator('#filter-rail [data-filter-group="lab"]')).toHaveCount(0);
});

test("the Lab filter narrows inference services to one lab's, and a reload keeps it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  const labs = page.locator('#filter-rail [data-filter-group="lab"] input:not([value=""])');
  const value = await labs.first().getAttribute("value");
  await setFilter(page, "inference", "lab", value);
  await expect(page).toHaveURL(new RegExp(`lab=${value}`));
  await page.reload();
  await expectFilter(page, "inference", "lab", value);
});

test("a group with one value in use hides until it has two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=robots");
  await expect(page.locator('#filter-rail [data-filter-group="formFactor"]')).toBeVisible();
  await expect(page.locator('#filter-rail [data-filter-group="status"]'), "every robot is active").toHaveCount(0);
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js`
Expected: FAIL, because `#filter-rail` does not exist.

- [ ] **Step 7: Change the markup**

In `web/index.html`:

1. Wrap the nine `.collection-panel` sections in the frame, and put the chips row first in its main column:

```html
      <div id="results-frame" class="results-frame">
        <aside id="filter-rail" class="filter-rail" aria-labelledby="filter-rail-title" hidden>
          <h2 id="filter-rail-title" class="visually-hidden">Filters</h2>
          <div class="filter-groups"></div>
        </aside>
        <div class="results-main">
          <div id="filter-chips" class="filter-chips" hidden>
            <span class="filter-chip-list"></span>
            <button id="finder-roles-chip" class="filter-chip" type="button" hidden></button>
            <button id="clear-filters" class="link-button" type="button">Clear filters</button>
          </div>
          <!-- the nine .collection-panel sections, unchanged in order -->
        </div>
      </div>
```

   The comment marks where the nine panels go. Delete it once they are inside.
2. Delete `#finder-roles-chip` from the Systems result row; it lives in the chips row now. Delete every result row's Clear button (`#reset-all-directory`, `#reset-filters`, `#reset-inference-filters`, `#reset-runtime-filters`, `#reset-pack-filters`, `#reset-robot-filters`, `#reset-model-filters`, `#reset-lab-filters`, `#reset-specification-filters`).
3. In every panel, replace `<section class="control-panel …" …>` and its closing tag with `<div class="filter-state" hidden>` and `</div>`. Keep every `<select>` inside, labels and all. In Systems, delete the `<details class="advanced-filter-shell">`, `<summary>`, and `<div class="advanced-filters">` wrappers (their opening and closing tags), keeping the selects.
4. Add a Lab select to four of the holders:
   - Systems: `<label><span>Lab</span><select id="system-lab-filter"><option value="">All labs</option></select></label>`;
   - Inference services: the same with `id="inference-lab-filter"`;
   - Local runtimes: with `id="runtime-lab-filter"`;
   - Specifications: with `id="specification-lab-filter"`.
5. In `#results-bar`, after `.results-sort`, add:

```html
        <button id="filters-button" class="ghost-button filters-button" type="button" aria-haspopup="dialog" aria-controls="filter-sheet">Filters <span class="filters-count"></span></button>
```

6. After `#comparison-dialog`, add the sheet:

```html
  <dialog id="filter-sheet" class="filter-sheet" aria-labelledby="filter-sheet-title">
    <h2 id="filter-sheet-title">Filters</h2>
    <div class="filter-groups"></div>
    <button id="filter-sheet-done" class="primary-button" type="button">Show results</button>
  </dialog>
```

- [ ] **Step 8: Wire the rail**

In `web/app.js`:

1. **`SCOPE_CONTROLS`.** Add `lab: "#system-lab-filter"` to `systems`, `lab: "#inference-lab-filter"` to `inference`, `lab: "#runtime-lab-filter"` to `runtimes`, and `lab: "#specification-lab-filter"` to `specifications`.
2. **`RESULT_VIEWS`.** Delete each entry's `clear` key.
3. **Boot.** In `bootstrap`, after the payloads are assigned to `state` and before `populateFilters()` runs, add `state.labMembership = AppCore.buildLabMembership(state.labs, collectionPayloads());`. After `populateCollectionFilters()`, call `populateLabFilters()`, defined beside `populateModelLabFilter`:

```js
// Each collection's Lab filter lists, A–Z, the labs that join at least one of
// its records (buildLabMembership), never by size (ADR 041). Models lists
// every lab, as it did.
function populateLabFilters() {
  const joined = records => {
    const ids = new Set(records.flatMap(record => state.labMembership.labsOf.get(record) || []));
    return [...state.labs].filter(lab => ids.has(lab.id)).sort((a, b) => a.name.localeCompare(b.name));
  };
  for (const [selector, records] of [
    ["#system-lab-filter", state.projects], ["#inference-lab-filter", state.inferenceServices],
    ["#runtime-lab-filter", state.localRuntimes], ["#specification-lab-filter", state.specifications],
  ]) {
    joined(records).forEach(lab => $(selector).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(lab.id)}">${escapeHTML(lab.name)}</option>`));
  }
}
```

4. **Each collection's `records` function.**
   - `filteredProjects` and the Specifications, Inference services, and Local runtimes entries in `COLLECTIONS`: add `lab: $("#system-lab-filter").value` (with each collection's own selector) and `labMembership: state.labMembership`.
   - Models: replace `ids: labModelIds($("#model-lab-filter").value),` with `lab: $("#model-lab-filter").value, labMembership: state.labMembership,`.
   - Labs: replace `models: state.models,` with `labMembership: state.labMembership,`.
   - Delete `labModelIds`.
   - Add the four Lab selectors to their collections' `[…].forEach(selector => $(selector).addEventListener("input", …))` arrays in `bindEvents`.
5. **Retire "More filters".** Delete `updateAdvancedFilterSummary` and its call in `COLLECTIONS.systems.context`.
6. **The rail and chips.** Add these functions after `syncScopeStrip`:

```js
// The rail: the active collection's filter groups (AppCore.FILTER_GROUPS),
// drawn from the hidden select that holds each one's value (ruling R-P3-1).
// Its values are the select's options, in their order, with "Any" first;
// each counts what choosing it would list, given the query and every other
// choice. It is rebuilt when the collection changes and updated in place
// otherwise, so focus stays on the radio a reader is moving through.
const FILTER_SHOWN = 8;
const expandedGroups = new Set();
let railScope = null;

function railRecords(scope) {
  const searching = currentQuery().trim() !== "";
  const matched = searching ? currentMatches() : null;
  const inQuery = record => !matched || matched.has(record);
  if (scope === "systems") {
    const family = $("#family-filter").value;
    const roles = state.directoryRoles || [];
    return state.projects.filter(project => (!family || project.system_family === family)
      && (!roles.length || roles.includes(project.primary_role)) && inQuery(project));
  }
  const records = { inference: state.inferenceServices, runtimes: state.localRuntimes, models: state.models, packs: state.packs, robots: state.robots, labs: state.labs, specifications: state.specifications }[scope] || [];
  // Pack facets narrow packs alone (ADR 035), so their counts are packs.
  return records.filter(inQuery);
}

// A group shows once at least two of its values list records in the whole
// collection, or while it holds a choice; a group of one offers no choice.
function railGroups(scope) {
  const values = readScopeControls(scope);
  const all = { inference: state.inferenceServices, runtimes: state.localRuntimes, models: state.models, packs: state.packs, robots: state.robots, labs: state.labs, specifications: state.specifications, systems: state.projects }[scope] || [];
  const ctx = { labs: state.labMembership };
  return AppCore.FILTER_GROUPS[scope].filter(group => {
    const used = new Set(all.flatMap(record => group.values(record, ctx)));
    const chosen = values[group.key] ?? "";
    return used.size >= 2 || (chosen !== "" && chosen !== (AppCore.SCOPE_URL_PARAMS[scope][group.key] ?? ""));
  });
}

function filterGroupsMarkup(scope, prefix) {
  const values = readScopeControls(scope);
  const note = scope === "packs" ? '<p class="filter-note">Counts are packs; installed systems follow the search only.</p>' : "";
  return note + railGroups(scope).map(group => {
    const select = $(SCOPE_CONTROLS[scope][group.key]);
    const chosen = values[group.key] ?? "";
    const options = [...select.options].filter(option => option.value !== "");
    const expanded = expandedGroups.has(`${scope}:${group.key}`);
    const shown = expanded ? options : options.filter((option, index) => index < FILTER_SHOWN || option.value === chosen);
    const radio = (value, text) => `<label class="filter-option"><input type="radio" name="${prefix}-${escapeHTML(group.key)}" value="${escapeHTML(value)}"${value === chosen ? " checked" : ""}> <span>${escapeHTML(text)}</span>${value ? '<span class="filter-count"></span>' : ""}</label>`;
    const more = !expanded && options.length > shown.length ? `<button type="button" class="link-button filter-more" data-filter-more="${escapeHTML(group.key)}">Show all ${options.length}</button>` : "";
    return `<fieldset class="filter-group" data-filter-group="${escapeHTML(group.key)}"><legend>${escapeHTML(group.name)}</legend>${radio("", "Any")}${shown.map(option => radio(option.value, option.textContent)).join("")}${more}</fieldset>`;
  }).join("");
}

function renderFilterRail() {
  const scope = state.directoryCollection;
  railScope = scope;
  const hasGroups = AppCore.FILTER_GROUPS[scope].length > 0;
  $("#filter-rail").hidden = !hasGroups;
  $("#results-frame").classList.toggle("has-rail", hasGroups);
  $("#filter-rail .filter-groups").innerHTML = hasGroups ? filterGroupsMarkup(scope, "rail") : "";
  if ($("#filter-sheet").open) $("#filter-sheet .filter-groups").innerHTML = filterGroupsMarkup(scope, "sheet");
  syncFilterRail();
}

// Counts, disabled states, checked radios, the chips, and the Filters
// button's count, in place.
function syncFilterRail() {
  const scope = state.directoryCollection;
  if (railScope !== scope) return renderFilterRail();
  const values = readScopeControls(scope);
  const groups = AppCore.FILTER_GROUPS[scope];
  const counts = AppCore.filterGroupCounts(railRecords(scope), values, groups, { labs: state.labMembership });
  for (const container of $$("#filter-rail .filter-groups, #filter-sheet .filter-groups")) {
    for (const fieldset of container.querySelectorAll("[data-filter-group]")) {
      const key = fieldset.dataset.filterGroup;
      const chosen = values[key] ?? "";
      for (const input of fieldset.querySelectorAll("input[type=radio]")) {
        const count = input.value ? counts[key]?.get(input.value) || 0 : null;
        const label = input.closest(".filter-option");
        if (count !== null) label.querySelector(".filter-count").textContent = String(count);
        input.checked = input.value === chosen;
        input.disabled = count === 0 && !input.checked;
      }
    }
  }
  renderFilterChips(scope, values);
}

// Every non-default choice as a removable chip, then Clear filters, which
// also clears the query (docs/WEB.md). The Finder's role set keeps its own
// chip. The row shows while anything is set.
function renderFilterChips(scope, values) {
  const chips = AppCore.FILTER_GROUPS[scope].flatMap(group => {
    const chosen = values[group.key] ?? "";
    if (chosen === (AppCore.SCOPE_URL_PARAMS[scope][group.key] ?? "")) return [];
    const option = [...$(SCOPE_CONTROLS[scope][group.key]).options].find(item => item.value === chosen);
    const text = chosen === "" ? "Any" : option?.textContent || chosen;
    return [`<button type="button" class="filter-chip" data-chip-key="${escapeHTML(group.key)}">${escapeHTML(group.name)}: ${escapeHTML(text)}<span aria-hidden="true"> ×</span><span class="visually-hidden">, remove</span></button>`];
  });
  $("#filter-chips .filter-chip-list").innerHTML = chips.join("");
  // The Finder's role set narrows Systems alone, so its chip shows only there.
  const finder = scope === "systems" && Boolean(state.directoryRolesLabel);
  $("#finder-roles-chip").hidden = !finder;
  const anything = chips.length > 0 || finder || currentQuery().trim() !== "";
  $("#filter-chips").hidden = !anything;
  $("#clear-filters").textContent = scope === "all" ? "Clear search" : "Clear filters";
  $("#filters-button .filters-count").textContent = chips.length + (finder ? 1 : 0) ? String(chips.length + (finder ? 1 : 0)) : "";
}

// Choosing in the rail or the sheet writes the hidden select and lets its
// own input handler repaint, as the dropdown did.
function chooseFilter(key, value) {
  const control = $(SCOPE_CONTROLS[state.directoryCollection][key]);
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function openFilterSheet() {
  $("#filter-sheet .filter-groups").innerHTML = filterGroupsMarkup(state.directoryCollection, "sheet");
  syncFilterRail();
  syncFilterSheetButton();
  $("#filter-sheet").showModal();
}

function syncFilterSheetButton() {
  const count = state.resultCounts[state.directoryCollection] ?? 0;
  $("#filter-sheet-done").textContent = `Show ${count} ${count === 1 ? "result" : "results"}`;
}
```

7. **Rebuild and update calls.**
   - In `setDirectoryCollection`, after `RESULT_VIEWS[selected].render();`, call `renderFilterRail();`.
   - Add `resultCounts: {}` to `state`. In `renderCollection`, `renderPacks`, and `renderAllDirectoryEntries`, record the number of entries listed before painting: `state.resultCounts[name] = records.length;`, `state.resultCounts.packs = entries.length;`, and `state.resultCounts.all = entries.length;`. At the end of each, call `syncFilterRail(); if ($("#filter-sheet").open) syncFilterSheetButton();`.
   - In the `#family-filter` input handler, after `renderScopeStrip();`, call `renderFilterRail();`, since the family decides which roles Systems offers.
8. **Events.** In `bindEvents`, bind the rail, the chips, and the sheet:

```js
  for (const container of $$("#filter-rail, #filter-sheet")) {
    container.addEventListener("change", event => {
      const input = event.target.closest('input[type="radio"]');
      if (input) chooseFilter(input.closest("[data-filter-group]").dataset.filterGroup, input.value);
    });
    container.addEventListener("click", event => {
      const more = event.target.closest("[data-filter-more]");
      if (!more) return;
      expandedGroups.add(`${state.directoryCollection}:${more.dataset.filterMore}`);
      renderFilterRail();
      $(`#${container.id} [data-filter-group="${more.dataset.filterMore}"] input`)?.focus();
    });
  }
  $("#filter-chips").addEventListener("click", event => {
    const chip = event.target.closest("[data-chip-key]");
    if (chip) chooseFilter(chip.dataset.chipKey, AppCore.SCOPE_URL_PARAMS[state.directoryCollection][chip.dataset.chipKey] ?? "");
  });
  $("#clear-filters").addEventListener("click", () => resetCollection(state.directoryCollection));
  $("#filters-button").addEventListener("click", openFilterSheet);
  $("#filter-sheet-done").addEventListener("click", () => $("#filter-sheet").close());
  $("#filter-sheet").addEventListener("close", () => $("#filters-button").focus());
```

   Delete Task 2's `for (const [scope, view] of Object.entries(RESULT_VIEWS)) $(view.clear)…` loop.
9. **One paint in `clearScopeFacets`.** It dispatched an `input` event per changed control, which painted the collection once for each, even while it was hidden: the follow-up "a tile opened from the front door paints the hidden collection once in `clearScopeFacets` and again in `setDirectoryCollection`". Replace it with:

```js
function clearScopeFacets(scope, { focus = true } = {}) {
  if (!SCOPE_CONTROLS[scope]) return;
  const controls = Object.entries(SCOPE_CONTROLS[scope])
    .filter(([key]) => key !== "q" && key !== "sort")
    .map(([, selector]) => $(selector));
  const familyChanged = scope === "systems" && $("#family-filter").value !== "";
  if (scope === "systems") {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
  }
  controls.forEach(control => { control.value = ""; });
  state.page[scope] = 1;
  if (familyChanged) {
    clearComparison();
    populateRoleFilter();
    updateScoreSortAvailability();
  }
  // One paint, and none for a collection still hidden: openCollection
  // paints it when it opens.
  if (!$(RESULT_VIEWS[scope].panel).hidden) {
    if (familyChanged) renderScopeStrip();
    RESULT_VIEWS[scope].render();
  }
  if (focus) $("#results-search").focus();
}
```

- [ ] **Step 9: Style the frame, the rail, the chips, and the sheet**

In `web/styles.css`:

- **Delete** the `.control-panel`, `.specification-controls`, `.inference-controls`, `.advanced-filter-shell`, and `.advanced-filters` rules, including their `@media` overrides. The hidden `.filter-state` needs no rule.
- **Add** after the `.scope-note` rules:

```css
/* The rail beside the results above 1000 px; a sheet from the bar's
   Filters button below it (Phase 3 spec, section 3). */
.results-frame { display: block; }
@media (min-width: 1001px) {
  .results-frame.has-rail { display: grid; grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  .filter-rail { position: sticky; top: calc(var(--sticky-clearance, 0px) + .5rem); max-height: calc(100vh - var(--sticky-clearance, 0px) - 1rem); overflow-y: auto; padding-right: .25rem; }
  .filters-button { display: none; }
}
@media (max-width: 1000px) {
  .filter-rail { display: none; }
}
.filter-group { margin: 0 0 1rem; padding: 0; border: 0; min-width: 0; }
.filter-group legend { margin: 0 0 .35rem; padding: 0; color: var(--muted); font: 700 .66rem var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
.filter-option { display: flex; align-items: center; gap: .45rem; padding: .15rem 0; font-size: .82rem; cursor: pointer; }
.filter-option .filter-count { margin-left: auto; color: var(--muted); font: 500 .7rem var(--font-mono); }
.filter-option:has(input:disabled) { color: var(--faint); cursor: default; }
.filter-more { font-size: .78rem; }
.filter-note { margin: 0 0 .75rem; color: var(--muted); font-size: .72rem; }
.filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin: 0 0 .25rem; }
.filter-chips[hidden] { display: none; }
.filter-chip-list { display: contents; }
.filter-chip { padding: .25rem .6rem; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--glass-weak); color: var(--text); font-size: .78rem; cursor: pointer; }
.filter-chip:hover { border-color: var(--cyan); }
.filter-sheet { width: min(100%, 32rem); max-height: 85vh; margin: auto auto 0; padding: 1rem 1rem 1.25rem; border: 1px solid var(--line); border-radius: var(--radius) var(--radius) 0 0; background: var(--panel); color: var(--text); box-shadow: var(--shadow-dialog); }
.filter-sheet::backdrop { background: var(--backdrop); }
.filter-sheet h2 { margin: 0 0 .75rem; font: 700 1rem var(--font-display); }
#filter-sheet-done { width: 100%; margin-top: .5rem; }
```

- [ ] **Step 10: Move the helpers onto the rail**

In `tests/e2e/helpers/results.js`:

- Add the four Lab selects to `FILTER_CONTROLS`: `systems.lab: "#system-lab-filter"`, `inference.lab: "#inference-lab-filter"`, `runtimes.lab: "#runtime-lab-filter"`, and `specifications.lab: "#specification-lab-filter"`.
- Replace `setFilter` and `clearFilters` with:

```js
// The rail on wide screens, the sheet from the Filters button on narrow
// ones (Phase 3 task 3). Systems' family is the strip's row.
async function setFilter(page, scope, key, value) {
  if (scope === "systems" && key === "family") {
    await require("./landing").openFamily(page, value);
    await settled(page);
    return;
  }
  const rail = page.locator("#filter-rail");
  const onRail = await rail.isVisible();
  if (!onRail) await page.locator("#filters-button").click();
  const container = onRail ? rail : page.locator("#filter-sheet");
  const group = container.locator(`[data-filter-group="${key}"]`);
  const more = group.locator("[data-filter-more]");
  if (await more.isVisible()) await more.click();
  await group.locator(`input[type="radio"][value="${value}"]`).check();
  if (!onRail) await page.locator("#filter-sheet-done").click();
  await settled(page);
}

async function clearFilters(page) {
  await page.locator("#clear-filters").click();
  await settled(page);
}
```

`filterControl` and `expectFilter` keep reading the hidden selects. `toHaveValue` needs no visibility.

- [ ] **Step 11: Rewrite the "More filters" assertions**

In `tests/e2e/directory-search.spec.js`, replace each `expect(page.locator(".advanced-filter-shell summary")).toHaveText("More filters · 1 active")` with `await expect(page.locator("#filter-chips .filter-chip")).toHaveCount(1)`. Delete any remaining `.advanced-filter-shell summary` click; `setFilter` reaches every group.

- [ ] **Step 12: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS. A test that reads a Clear button by its old id goes through `clearFilters`. A test that expects the Finder chip inside `.result-row` now finds `#finder-roles-chip` in `#filter-chips`: `finder-handoff.spec.js` locates it by id, so it needs no change.

- [ ] **Step 13: Update the contracts and the backlog**

In `docs/WEB.md`, "Content hierarchy":

- Replace the Systems, Inference services, Local runtimes, Agent packs, Robots, Models, and Labs "keep … visible" lines, and the Specifications line, with:

```markdown
- Above 1000px a rail beside the results lists the collection's filters. Each value shows how many records it would list given the query and every other filter, a value that lists none shows 0 and cannot be chosen unless it is the choice, a group with more than eight values shows eight and "Show all N", and a group with fewer than two values in use is hidden until it holds a choice. At 1000px and below the bar's Filters button opens the same groups as a sheet, applied as they are chosen and closed by "Show N results". A filter takes one value at a time.
- In Systems the rail lists Role, Source model, License, AI relationship, Architecture, Deployment, Interface, Capability, Status, Local-first, and Lab; Family is the strip's second row and Sort sits in the results bar.
- In Inference services the rail lists Type, Delivery, Model source, API style, and Lab; in Local runtimes, Type, Accelerator, Model format, API style, and Lab. Their score sort sits in the results bar.
- In Agent packs the rail lists Type, Host, Install, and License, and its counts are packs, since host-installed systems follow the search only (ADR 035). Results are alphabetical while browsing and ordered by match while searching, and unscored.
- In Robots the rail lists Form, AI, Availability, and Status, which shows once a robot is not active; results are alphabetical while browsing and ordered by match while searching, unscored, and never offer comparison.
- In Models the rail lists Type, Distribution, Modality, Source model, License, and Lab, and the results bar holds the sort (best match, access score, release date, or name).
- In Labs the rail lists Type, Headquarters, and Releases; results are alphabetical while browsing and ordered by match while searching, and unscored.
- Keep Specifications as a Catalog collection whose rail lists Type, Scope, Status, License, and Lab; show contract boundaries and evidence only on demand.
- The Lab filter lists, A–Z and never by size ([ADR 041](adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md)), the labs whose recorded names or systems join records in the collection, by the join a lab's record uses, and narrows to the records one lab joins.
```

In "Behavioral contracts":

- Replace '- “More filters” reports how many non-default advanced constraints are active so a collapsed control never hides why results are missing.' (curly quotes, as the file has them) with '- Every non-default filter, and a Finder role set, shows as a removable chip above the results, followed by Clear filters, so no active constraint is ever hidden.'
- In the "Browse matches" line, replace 'shows as a removable "Finder:" chip beside the result count' with 'shows as a removable "Finder:" chip in the chips row'.
- In the verification steps, replace "More filters" with "the rail" wherever it appears.

In `BACKLOG.md`, delete the Phase 2 follow-up "a tile opened from the front door paints the hidden collection once in `clearScopeFacets` and again in `setDirectoryCollection`". Add, under "Reader experience":

```markdown
- [ ] Let a filter take several values (the rail's radio groups become checkboxes, a value list in the URL, and every filter function and count reads a set). Front-door Phase 3 kept one value per filter by the owner's decision of 2026-09-29.
```

- [ ] **Step 14: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
/usr/local/bin/node --test tests/test_web.js
git add web tests docs/WEB.md BACKLOG.md
git commit -m "Filter results from a rail with counts, chips, and a Lab filter"
# Tell the AI labs session (cloud, one-way) in its PR thread or by message that the Lab filter now spans five collections.
gh pr create --title "Filter results from a rail with counts, chips, and a Lab filter" --body "Front-door Phase 3, task 3 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). A rail beside the results (a sheet below 1000 px) lists every filter with the count each value would list; one definition per group in the core feeds both results and counts, and a real-catalog test ties them. Active filters are chips with one Clear filters; More filters retires. labRelations becomes a Lab filter in Systems, services, runtimes, and specifications, A–Z (ADR 041); Packs count packs only (ADR 035)."
```

---
### Task 4: One card builder per kind, then the list view

First the card half of `CR-20`: every card a record kind shows, in any grid, comes from one builder per kind, with a `mixed` option for All's card. Then results open as a list in every collection at every width. A row is the card itself, laid out by a list class, with cards one toggle away. `layout=cards` records the choice. Goal 1 is measured here.

Before the first commit, message the badge session: the list moves the "grid on screen" anchor of its key strip, and rows render the card's own badge row.

**Files:**

- Modify: `web/app.js`:
  - add `systemCard`, `inferenceCard`, `runtimeCard`, `modelCard`, and `specificationCard`;
  - the `COLLECTIONS` entries' `card`;
  - `renderAllDirectoryEntries`, `renderPacks`;
  - delete `mixedSystemCard`;
  - `state.layout`, `setLayout`, `writeScopeURL`, `restoreFromURL`.
- Modify: `web/index.html` (the layout toggle in `#results-bar`)
- Modify: `web/styles.css`
- Modify: `tests/e2e/helpers/results.js` (`setLayout`), `tests/e2e/results-page.spec.js`
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes: Tasks 2 and 3's frame (`#results-frame`, `#results-bar`, `RESULT_VIEWS`, `writeScopeURL`, `settled`).
- Produces:
  - `CARD_BUILDERS`, keyed by the kinds `system`, `inference`, `runtime`, `model`, `pack`, `robot`, `lab`, and `spec`, each builder called with the record and its options;
  - `state.layout`, which is `"list"` or `"cards"`, and `setLayout(layout)`;
  - markup `#results-frame.is-list` in the list layout, and the `.layout-toggle > button[data-layout][aria-pressed]` buttons;
  - the test helper `setLayout(page, layout)`.

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/results-page.spec.js` (add `setLayout` to the results require):

```js
test("results open as a list, and the Cards choice travels in the URL", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(page.locator("#results-frame")).toHaveClass(/\bis-list\b/);
  await expect(page.locator('.layout-toggle [data-layout="list"]')).toHaveAttribute("aria-pressed", "true");
  await setLayout(page, "cards");
  await expect(page).toHaveURL(/layout=cards/);
  await page.reload();
  await expect(page.locator("#results-frame")).not.toHaveClass(/\bis-list\b/);
  await setLayout(page, "list");
  await expect(page).not.toHaveURL(/layout=/);
});

test("a URL holding only a layout opens the front door", async ({ page }) => {
  await page.goto("/?layout=cards");
  await expect(page.locator("#front-door")).toBeVisible();
});

// A row is the card itself: everything the card shows stays visible in the
// row, except the description, which is one line above 720 px and hidden
// at 720 px and below.
for (const [collection, grid] of [
  ["all", "#all-directory-grid"], ["systems", "#project-grid"], ["inference", "#inference-grid"],
  ["runtimes", "#runtime-grid"], ["models", "#model-grid"], ["packs", "#pack-grid"],
  ["robots", "#robot-grid"], ["labs", "#lab-grid"], ["specifications", "#specification-grid"],
]) {
  test(`a ${collection} list row keeps every fact its card shows`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?collection=${collection}${collection === "systems" ? "&family=agent_system" : ""}`);
    const row = page.locator(`${grid} .project-card`).first();
    await expect(row).toBeVisible();
    const hidden = await row.evaluate(card => [...card.querySelectorAll(":scope > *:not(p), .card-top *, .card-footer *")]
      .filter(element => element.getClientRects().length === 0 && getComputedStyle(element).display !== "contents")
      .map(element => element.className || element.tagName));
    expect(hidden, "nothing the card prints is hidden in the row").toEqual([]);
    const description = row.locator(":scope > p").first();
    if (await description.count()) {
      const [height, line] = await description.evaluate(element => [element.getBoundingClientRect().height, parseFloat(getComputedStyle(element).lineHeight)]);
      expect(height, "one line").toBeLessThanOrEqual(line + 1);
    }
  });
}

test("at 720 px and below the row hides its description", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first().locator(":scope > p").first()).toBeHidden();
});

// Goal 1 (Phase 3 spec): results start near the top. Counted between the
// bottom of what sticks and the top of the badge legend, with 16 px slack
// for CI's Linux Chromium.
async function rowsInBand(page, grid) {
  return page.evaluate(selector => {
    const stuck = [...document.querySelectorAll(".site-header, #scope-strip, #results-bar")]
      .filter(element => !element.hidden && getComputedStyle(element).position === "sticky")
      .reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom), 0);
    const legend = [...document.querySelectorAll("#badge-legend, #badge-legend-chip, #mobile-nav")]
      .filter(element => !element.hidden && element.getClientRects().length)
      .reduce((top, element) => Math.min(top, element.getBoundingClientRect().top), innerHeight);
    return [...document.querySelectorAll(`${selector} .project-card`)]
      .filter(card => { const box = card.getBoundingClientRect(); return box.top >= stuck && box.bottom <= legend - 16; }).length;
  }, grid);
}

test("Goal 1: at least seven rows in the band at 1440x900 in Systems and Models", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [url, grid] of [["/?collection=systems", "#project-grid"], ["/?collection=models", "#model-grid"]]) {
    await page.goto(url);
    await expect(page.locator(`${grid} .project-card`).first()).toBeVisible();
    expect(await rowsInBand(page, grid), url).toBeGreaterThanOrEqual(7);
  }
});

test("Goal 1: at least four rows above the legend chip at 375x812 in Systems and Models", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [url, grid] of [["/?collection=systems", "#project-grid"], ["/?collection=models", "#model-grid"]]) {
    await page.goto(url);
    await expect(page.locator(`${grid} .project-card`).first()).toBeVisible();
    expect(await rowsInBand(page, grid), url).toBeGreaterThanOrEqual(4);
  }
});
```

In `tests/e2e/helpers/results.js`, add and export:

```js
async function setLayout(page, layout) {
  await page.locator(`.layout-toggle [data-layout="${layout}"]`).click();
  await settled(page);
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js`
Expected: FAIL. `#results-frame` has no `is-list` class, and there is no `.layout-toggle`.

- [ ] **Step 3: One builder per record kind**

In `web/app.js`, before `renderAllDirectoryEntries`, add the builders below. Each moves existing templates without changing a character of their markup:

- **The scoped template.** Cut the template the collection's `COLLECTIONS` entry returns from `card`, and paste it as the builder's scoped branch.
- **The mixed template.** Cut the matching `kind === …` template from `renderAllDirectoryEntries` (for systems, `mixedSystemCard`'s body), and paste it as the `mixed` branch.
- **Names.** Rename `record` to the builder's parameter inside the moved text.

```js
// One builder per record kind (CR-20): every card a kind shows, in any grid,
// comes from here, so a card change, and the list layout, reach one place.
// `mixed` is All's card: no score, no Compare, and the collection named in
// its label, exactly as the mixed templates printed them.
function systemCard(project, { family = "", mixed = false } = {}) {
  if (mixed) {
    // mixedSystemCard's body, moved here unchanged.
  }
  // COLLECTIONS.systems.card's body, moved here unchanged; it reads `family`.
}

function inferenceCard(service, { mixed = false } = {}) {
  if (mixed) {
    // renderAllDirectoryEntries' `kind === "inference"` template, moved here unchanged.
  }
  // COLLECTIONS.inference.card's template, moved here unchanged.
}

function runtimeCard(runtime, { mixed = false } = {}) {
  if (mixed) {
    // renderAllDirectoryEntries' `kind === "runtime"` template, moved here unchanged.
  }
  // COLLECTIONS.runtimes.card's template, moved here unchanged.
}

function modelCard(model, { mixed = false } = {}) {
  if (!isReviewedModel(model)) return importedModelCard(model, { mixed });
  if (mixed) {
    // renderAllDirectoryEntries' reviewed `kind === "model"` template, moved here unchanged.
  }
  // COLLECTIONS.models.card's reviewed template, moved here unchanged.
}

function specificationCard(specification) {
  // COLLECTIONS.specifications.card's body, moved here unchanged.
}

// Every kind's builder, by the `record=` kind, for the grids that mix them.
const CARD_BUILDERS = {
  system: systemCard, inference: inferenceCard, runtime: runtimeCard, model: modelCard,
  pack: packCard, robot: robotCard, lab: labCard, spec: specificationCard,
};
```

Each comment marks where the moved template goes. The builder returns it with `return`, and the comment is deleted once the template is in place. Then:

1. **Collection entries.**
   - `COLLECTIONS.systems.card` becomes `(project, { family }) => systemCard(project, { family })`.
   - `inference`, `runtimes`, `models`, and `specifications` become `service => inferenceCard(service)`, `runtime => runtimeCard(runtime)`, `model => modelCard(model)`, and `specification => specificationCard(specification)`.
   - `labs` and `robots` keep `labCard` and `robotCard`.
2. **`renderAllDirectoryEntries`'s grid map.** It becomes the following, still followed by the unchanged `|| emptyStateMarkup(…)`:

   ```js
   paged.items.map(({ kind, record }) => CARD_BUILDERS[kind](record, { mixed: true })).join("")
   ```
3. **`renderPacks`.** `mixedSystemCard(record)` becomes `systemCard(record, { mixed: true })`.
4. **Delete `mixedSystemCard`.**

Run `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js tests/e2e/card-click.spec.js tests/e2e/card-stars.spec.js tests/e2e/directory-search.spec.js` before going on. The moved markup must pass unchanged. Then commit the builders alone:

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/index.html web/blog
git commit -m "Build every card of a kind in one place"
```

- [ ] **Step 4: Add the layout toggle and state**

In `web/index.html`, in `#results-bar` before `#filters-button`, add:

```html
        <div class="layout-toggle" role="group" aria-label="Layout"><button type="button" data-layout="list" aria-pressed="true">List</button><button type="button" data-layout="cards" aria-pressed="false">Cards</button></div>
```

Add `class="results-frame is-list"` to `#results-frame`: the list is the default before any script runs.

In `web/app.js`:

1. Add `layout: "list"` to `state`.
2. After `syncResultsBar`, add:

```js
// Results open as a list; cards are one toggle away (owner, 2026-09-29). The
// layout is one setting for the whole results page, not a collection's, so
// it survives collection switches, Clear filters, and "Show it", and a URL
// holding only a layout still opens the front door (Phase 3 spec, section 4).
function setLayout(layout, { updateURL = true } = {}) {
  state.layout = layout === "cards" ? "cards" : "list";
  $("#results-frame").classList.toggle("is-list", state.layout === "list");
  $$(".layout-toggle [data-layout]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.layout === state.layout)));
  if (updateURL) writeScopeURL();
}
```

3. In `writeScopeURL`, after `AppCore.SCOPE_URL_KEYS.forEach(key => url.searchParams.delete(key));`, add `url.searchParams.delete("layout");`. Inside `if (scope) { … }`, add `if (state.layout === "cards") url.searchParams.set("layout", "cards");`.
4. In `restoreFromURL`, directly after `const scope = AppCore.scopeFromURL(params);`, add:

```js
  // `layout` takes "cards" and nothing else; any other value leaves the URL.
  const layout = params.get("layout");
  if (layout !== null && layout !== "cards") {
    params.delete("layout");
    writeURL(url);
  }
  setLayout(layout === "cards" ? "cards" : "list", { updateURL: false });
```

5. In `bindEvents`, add:

```js
  $$(".layout-toggle [data-layout]").forEach(button => button.addEventListener("click", () => setLayout(button.dataset.layout)));
```

- [ ] **Step 5: Style rows**

In `web/styles.css`, after the rail rules, add the list layout below. It is a starting point: tune the spacing until Step 1's row tests and Goal 1 pass, and keep every value a custom property or a length.

```css
/* The list: a row is the card itself, relaid (Phase 3 spec, section 4).
   Identity leads the first line; the other facts follow and wrap rather
   than drop; the description is one line, and hidden at 720 px and below. */
.results-frame.is-list .project-grid { display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--line); }
.results-frame.is-list .project-card {
  display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem;
  min-height: 0; padding: .55rem .75rem; border-width: 0 0 1px; border-radius: 0; box-shadow: none;
}
.results-frame.is-list .project-card:hover { transform: none; }
.results-frame.is-list .project-card > .card-top { flex: 1 1 22rem; min-width: 0; margin: 0; }
.results-frame.is-list .project-card .card-identity h2 { font-size: 1rem; }
.results-frame.is-list .project-card > :is(.role-badge, .license-row, .tags, .card-badges, .card-footer) { flex: 0 1 auto; margin: 0; }
.results-frame.is-list .project-card > .card-footer { margin-left: auto; padding: 0; border: 0; }
.results-frame.is-list .project-card > p { flex: 1 0 100%; order: 10; margin: 0; overflow: hidden; color: var(--muted); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .results-frame.is-list .project-card > p { display: none; }
}
.layout-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-control); overflow: hidden; }
.layout-toggle button { padding: .4rem .7rem; border: 0; background: transparent; color: var(--muted); font: 600 .78rem var(--font-body); cursor: pointer; }
.layout-toggle button[aria-pressed="true"] { background: var(--text); color: var(--on-ink); }
```

The `:scope > p` in the row test exempts the description paragraph alone. Any other element a card prints, including model-source meta and `.tags`, must stay visible. A rule that hides one fails the test.

- [ ] **Step 6: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS.

- A test that assumed a card grid by position, such as "the third card is to the right of the first", now runs in the list. Set `setLayout(page, "cards")` at its start: it tests the card grid.
- A test whose purpose is the row goes into `results-page.spec.js` instead.
- If Goal 1 fails, measure first: tighten the row's padding and the scope note's margin before touching anything Phase 2 owns.

- [ ] **Step 7: Update the contracts and the backlog**

In `docs/WEB.md`, "Behavioral contracts", after the whole-card-click line (the one beginning "- Clicking anywhere on a card opens its record"), add:

```markdown
- Results open as a list in every collection at every width, and the results bar's List/Cards toggle switches to cards; `layout=cards` records that choice and the list is never written. The layout is one setting for the whole results page: it survives collection switches, Clear filters, and "Show it", and a URL holding only `layout` opens the front door. A list row is the card itself from the same builder, relaid by a list class, so every card contract here holds for rows: nothing the card prints is hidden, except that the description is cut to one line above 720px and hidden at 720px and below. Every card of a kind, in any grid, comes from that kind's one builder.
```

In the verification steps, add at the end:

```markdown
37. in Systems and Models at 1440×900 with the legend open, confirm at least seven rows sit fully between the sticky bar and the legend, and at 375×812 at least four above the legend chip; switch to Cards, reload, and confirm the cards return and `layout=cards` stays; open `?layout=cards` alone and confirm the front door.
```

In `BACKLOG.md`, delete the item "Collapse the hand-written card templates and the per-collection tables (`CR-20`)". Both halves have landed.

- [ ] **Step 8: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web tests docs/WEB.md BACKLOG.md
git commit -m "Open results as a list whose rows are the cards"
gh pr create --title "Open results as a list whose rows are the cards" --body "Front-door Phase 3, task 4 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). One card builder per record kind (the card half of CR-20); results then open as a list in every collection, each row the card itself relaid, with Cards one toggle away and layout=cards in the URL. Goal 1 is pinned: seven rows in the band at 1440x900 and four at 375x812, in Systems and Models."
```

---
### Task 5: One record view, full-screen everywhere

One full-screen record view, `#record-dialog`, replaces the eight record dialogs. The eight markup functions behind `RECORD_DIALOGS` render into its one content box, so what each record shows is unchanged.

- **Opening from inside a record.** A related record, a lab, a pack's specification, or a successor repaints the view and adds a history entry. Back therefore retraces it; it no longer closes one dialog and opens another.
- **Focus.** It moves to the record's heading on open, and back to what opened it on close.
- **Sideways scrolling.** Nothing scrolls sideways at 390 px. The OrcaRouter record is the known case.
- **Task 6's panel.** Task 6 puts records opened from results beside the list at 1200 px and wider. Until then every record opens here.

**Files:**

- Modify: `web/index.html` (the eight record dialogs become `#record-dialog`, and every result count gets `tabindex="-1"`)
- Modify: `web/app.js`:
  - `RECORD_DIALOGS` entries;
  - `paintRecordDialog`, `openRecordDialog`, `showRecordDialog`;
  - `clearRecordURL`, `closeRecordDialogs`, `copyRecordLink`;
  - `bindLabDialogLinks`, `browseLabModels`;
  - the close bindings and `restoreFromURL`.
- Modify: `web/styles.css`, `tests/e2e/helpers/results.js`, `tests/e2e/results-page.spec.js`
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes: `RESULT_VIEWS[scope].count` (Task 2), and the `recordView`, `recordHeading`, and `closeRecord` helpers (Task 1).
- Produces:
  - markup `dialog#record-dialog.record-dialog[data-record-kind][data-record-id] > button.dialog-close + #record-content`;
  - in `web/app.js`, the constants `RECORD_VIEW` and `RECORD_CONTENT`, and the functions `showRecordView(kind, id)`, `closeRecordView()`, and `returnRecordFocus()`, with `recordOpener`;
  - `openRecordDialog(kind, id)` and `openRecord(kind, id)`, which keep their names and return values.

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/results-page.spec.js`:

```js
test("one record view shows every kind, takes focus, and gives it back", async ({ page }) => {
  await page.goto("/?collection=runtimes");
  await expect(page.locator("dialog[id$='-dialog']:not(#record-dialog):not(#comparison-dialog)")).toHaveCount(0);
  const details = page.locator("#runtime-grid .project-card").first().locator("[data-local-runtime]");
  await details.click();
  await expect(recordView(page, "runtime")).toBeVisible();
  await expect(recordHeading(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(recordView(page)).toBeHidden();
  await expect(details).toBeFocused();
  await expect(page).not.toHaveURL(/record=/);
});

test("a record opened from inside another adds a history entry, and Back retraces it", async ({ page }) => {
  await page.goto("/?collection=labs");
  await page.locator("#lab-grid .project-card").first().click();
  await expect(recordView(page, "lab")).toBeVisible();
  await recordView(page, "lab").locator("[data-open-model]").first().click();
  await expect(recordView(page, "model")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "lab")).toBeVisible();
  await page.goBack();
  await expect(recordView(page)).toBeHidden();
});

test("a control in the view that changes collection closes it and focuses the result count", async ({ page }) => {
  await page.goto("/?collection=labs");
  await page.locator("#lab-grid .project-card").first().click();
  await recordView(page, "lab").locator("[data-browse-lab-models]").click();
  await expect(recordView(page)).toBeHidden();
  await expect(page.locator("#model-result-count")).toBeFocused();
});

test("a record link loaded directly opens full-screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?record=inference:orcarouter");
  const box = await recordView(page, "inference").boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(1440 - 1);
});

test("no record view scrolls sideways on a phone, OrcaRouter included", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference&record=inference:orcarouter");
  const view = recordView(page, "inference");
  await expect(view).toBeVisible();
  expect(await view.evaluate(dialog => dialog.scrollWidth - dialog.clientWidth)).toBeLessThanOrEqual(0);
});
```

Add `recordHeading, recordView` to the file's results require.

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js`
Expected: FAIL. The eight dialogs still exist, and `recordView` finds `#runtime-dialog` not `#record-dialog`.

- [ ] **Step 3: Replace the markup**

In `web/index.html`:

- Delete the eight `<dialog id="project-dialog">` … `<dialog id="lab-dialog">` blocks, and put in their place:

```html
  <dialog id="record-dialog" class="record-dialog">
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <div id="record-content" class="record-content"></div>
  </dialog>
```

- Add `tabindex="-1"` to `#all-directory-result-count`, `#pack-result-count`, `#robot-result-count`, `#model-result-count`, `#lab-result-count`, and `#specification-result-count`. The other three have it. A closing view or a scope change hands focus to the result count.

- [ ] **Step 4: One view in the code**

In `web/app.js`:

1. Above `RECORD_DIALOGS`, add:

```js
// One record view (Phase 3 spec, section 5). Every kind paints into its one
// content box; the view carries the record's kind and id as data.
const RECORD_VIEW = "#record-dialog";
const RECORD_CONTENT = "#record-content";
let recordOpener = null;
```

2. In `RECORD_DIALOGS`:
   - delete every entry's `dialog:` and `content:` keys;
   - in the `afterRender` hooks, replace `$("#dialog-content")`, `$("#pack-dialog-content")`, and `$("#robot-dialog-content")` with `$(RECORD_CONTENT)`;
   - delete each `$("#pack-dialog").close();` and `$("#robot-dialog").close();` before an `open…` call. The view repaints in place.
3. In `bindLabDialogLinks`, replace `$("#lab-dialog-content")` with `$(RECORD_CONTENT)` and delete `$("#lab-dialog").close();`.
4. In `browseLabModels`, replace `$("#lab-dialog").close();` with `closeRecordView();`. At its end, after `activateView("directory");`, add `$(RESULT_VIEWS.models.count).focus({ preventScroll: true });`.
5. Replace `paintRecordDialog`, `openRecordDialog`, `showRecordDialog`, `clearRecordURL`, and `closeRecordDialogs`, and delete `RECORD_DIALOG_SELECTORS`:

```js
function paintRecordDialog(entry, record) {
  const content = $(RECORD_CONTENT);
  content.innerHTML = entry.markup(record);
  if (!record.review_status || isReviewedModel(record)) {
    content.querySelector(".detail-grid").insertAdjacentHTML("beforebegin", RECORD_LINK_MARKUP);
  }
  content.querySelector("h1")?.setAttribute("tabindex", "-1");
  entry.afterRender?.();
}

function openRecordDialog(kind, id) {
  const entry = RECORD_DIALOGS[kind];
  const record = entry.find(id);
  if (!record) return false;
  const view = $(RECORD_VIEW);
  // What opened the first record in the view gets focus back when it closes.
  if (!view.open) recordOpener = document.activeElement;
  paintRecordDialog(entry, record);
  showRecordView(kind, id);
  // A record that needs a lazily fetched file paints now and repaints when
  // the file lands, unless the reader has moved on to another record.
  const repaint = () => {
    if (view.dataset.recordKind === kind && view.dataset.recordId === id) paintRecordDialog(entry, record);
  };
  entry.hydrate?.()?.then(repaint);
  loadDetail(kind, record)?.then(repaint);
  return true;
}

// The view opens before its URL is written, so the record is on screen
// whatever the browser makes of the history write. A record opened from
// inside another repaints the view and pushes, so Back retraces it.
function showRecordView(kind, id) {
  const view = $(RECORD_VIEW);
  view.dataset.recordKind = kind;
  view.dataset.recordId = id;
  if (!view.open) view.showModal();
  view.scrollTop = 0;
  $(`${RECORD_CONTENT} h1`)?.focus({ preventScroll: true });
  writeRecordURL(kind, id);
}

function clearRecordURL() {
  if ($(RECORD_VIEW).open) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("record")) return;
  url.searchParams.delete("record");
  writeURL(url);
}

function closeRecordView() {
  if ($(RECORD_VIEW).open) $(RECORD_VIEW).close();
}

// Focus goes back to what opened the record, or, when a repaint replaced
// it, to the result count of the collection on screen.
function returnRecordFocus() {
  const scope = activeScope();
  const target = recordOpener?.isConnected ? recordOpener : scope ? $(RESULT_VIEWS[scope].count) : null;
  recordOpener = null;
  target?.focus({ preventScroll: true });
}
```

6. In `copyRecordLink`, replace `const dialog = button.closest("dialog");` with `const dialog = button.closest("[data-record-kind]");`. Task 6's panel is not a dialog.
7. In `restoreFromURL`, replace `closeRecordDialogs();` with `closeRecordView();`.
8. In `bindEvents`:
   - Delete the sixteen per-dialog `addEventListener` lines, from `$("#project-dialog .dialog-close")…` to `$("#lab-dialog")…`, and `RECORD_DIALOG_SELECTORS.forEach(selector => $(selector).addEventListener("close", clearRecordURL));`.
   - Add the lines below. A full-screen view has no backdrop to click, so the old click-outside handler goes.

```js
  $(`${RECORD_VIEW} .dialog-close`).addEventListener("click", closeRecordView);
  $(RECORD_VIEW).addEventListener("close", () => {
    clearRecordURL();
    returnRecordFocus();
  });
```

- [ ] **Step 5: Style the view**

In `web/styles.css`, after `.dialog-close:hover`, add:

```css
/* One record view (Phase 3 spec, section 5): full-screen, with the record
   in an 840 px reading column. Nothing in it scrolls sideways. */
.record-dialog { width: 100%; max-width: 100%; height: 100%; max-height: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: var(--bg); box-shadow: none; }
.record-dialog .dialog-close { position: sticky; top: .5rem; z-index: 2; margin: .5rem .75rem 0 0; }
.record-content { width: min(840px, calc(100% - 2rem)); margin: 0 auto; padding: 1rem 0 3rem; }
.record-content .detail-grid > *, .record-content .detail-block { min-width: 0; }
.record-content a, .record-content code { overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .record-content .detail-grid { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 6: Point the helper at the one view**

In `tests/e2e/helpers/results.js`, replace `RECORD_VIEWS` and `recordView` with:

```js
// One record view since Phase 3 task 5; it names its record's kind.
function recordView(page, kind) {
  return page.locator(kind ? `#record-dialog[open][data-record-kind="${kind}"]` : "#record-dialog[open]");
}
```

- [ ] **Step 7: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS.

- A test that clicked a backdrop to close a dialog now presses the close button through `closeRecord`.
- A test that expected a lab link to close the lab dialog before the next opened now expects one view with the new kind.
- `page-health.spec.js`'s dialog overflow checks keep their meaning, since they measure the one view.

- [ ] **Step 8: Update the contracts and the backlog**

In `docs/WEB.md`, "Behavioral contracts":

- Replace the line beginning "- Every detail dialog is addressable." with:

```markdown
- Every record opens in one record view, whatever its kind: system, specification, inference service, local runtime, model, pack, lab, or robot. Opening one writes a `record` URL parameter (`system:id`, `spec:id`, `inference:id`, `runtime:id`, `model:id`, `pack:id`, `lab:id`, or `robot:id`) as a new history entry, so Back closes the view and Forward reopens it; closing it removes the parameter. A record opened from inside another, such as a related record, a lab, a pack's packaging format, or a successor, repaints the view and adds an entry, so Back retraces it. Opening moves focus to the record's heading; closing returns it to what opened the record, or to the result count when a repaint replaced that. A control in the view that changes collection, such as "Browse all in Models", closes the view and focuses the result count. The view is full-screen, and nothing in it scrolls sideways. Restoring a `record` URL opens the view over the requested Catalog collection and discards an unknown kind, an unknown id, or a malformed reference rather than opening anything. Each reviewed record offers a Copy link control that copies the record's share page URL rather than the address bar, because only the share page carries the record's own title, description, and preview card. Imported model source records link their commit-pinned source and intentionally have no reviewed-record share control.
```

- In the line beginning "- System, model, inference-service, local-runtime, specification, and pack dialogs name the lab", replace "opening a lab closes the dialog it was opened from" with "opening the lab shows it in the same record view, and Back returns to the record it was opened from".
- In the verification steps, replace "dialog" with "record view" wherever a step opens a record. Leave the comparison dialog as it is.

In `BACKLOG.md`, delete the item "Remove horizontal overflow from the OrcaRouter inference-service dialog".

- [ ] **Step 9: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web tests docs/WEB.md BACKLOG.md
git commit -m "Show every record in one full-screen view"
gh pr create --title "Show every record in one full-screen view" --body "Front-door Phase 3, task 5 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). One record view replaces the eight record dialogs; every kind renders into it unchanged. Records opened from inside another push a history entry so Back retraces them; focus moves to the heading on open and back on close; nothing scrolls sideways at 390 px (the OrcaRouter item closes). Task 6 puts records opened from results beside the list on wide screens."
```

---
### Task 6: The side panel, previous and next, and related records

At 1200 px and wider, a record opened from Catalog results opens in a panel beside the list. The rail steps aside, one Filters tap away, and the list keeps its place, with the open row marked.

- **Stepping.** Previous and Next, and ← and →, step through the results in their current order across pages. Stepping, or clicking another row, replaces the history entry, so Back closes the panel. The position and the buttons hide when the record leaves the results.
- **Related records.** The view ends with related records chosen by the scope behind it:
  - "On the same scale", with scores and Compare, inside one profile;
  - elsewhere, "Related" with no scores;
  - in both, "More from <lab>" as counts per collection.
- **Where the full-screen view stays.** Below 1200 px, from the Finder, and for a record link loaded directly, the full-screen view of Task 5 stays.

**Files:**

- Modify: `web/app-core.js` (`stepRecord`, `relatedRecords`, `labCountsForRecord`, exports)
- Modify: `web/index.html` (`#record-panel`; the step bar in both containers)
- Modify: `web/app.js`:
  - `RESULT_VIEWS` gains `kind`;
  - add `state.resultOrder`, `recordContainer`, `recordContent`, `closeRecordPanel`, `markOpenRow`, `syncRecordNav`, `stepOpenRecord`, and `relatedMarkup`;
  - change `openRecordDialog`, `showRecordView`, `writeRecordURL`, the grids' open bindings, `restoreFromURL`, and `bindEvents`.
- Modify: `web/styles.css`, `tests/test_web.js`, `tests/e2e/helpers/results.js`, `tests/e2e/results-page.spec.js`
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes:
  - Task 5's `RECORD_VIEW`, `RECORD_CONTENT`, `paintRecordDialog`, `openRecordDialog`, `showRecordView`, `closeRecordView`, `returnRecordFocus`, and `recordOpener`;
  - Task 2's `RESULT_VIEWS`;
  - Task 3's `SCOPE_CONTROLS[…].lab` and `state.labMembership`.
- Produces:
  - **In `AppCore`:**
    - `stepRecord(order, key, delta)` → `{ index, total, key }`;
    - `relatedRecords(kind, record, records, { comparable })` → `{ sameScale, field, value, total }` when comparable, otherwise `{ successor, predecessors, field, value, total }`;
    - `labCountsForRecord(record, labs, catalog, labMembership)` → `[{ lab, counts: [{ collection, count }] }]`.
  - **In `web/app.js`:**
    - `openRecordDialog(kind, id, { fullScreen, fromList })`;
    - `writeRecordURL(kind, id, { replace })`.
  - **Markup:**
    - `aside#record-panel[data-record-kind][data-record-id]`, with `.record-nav > [data-record-step] + .record-position` and `#record-panel-content`;
    - `#results-frame.has-record` and `#directory.has-record-panel` while the panel is open;
    - `.project-card[aria-current="true"]` on the open row;
    - `section.related-records`.
  - **Test helper:** `recordView(page, kind)` also finds the panel.

- [ ] **Step 1: Write the failing unit tests**

Add `labCountsForRecord, relatedRecords, stepRecord` to the core `require` in `tests/test_web.js`, and append:

```js
test("stepping finds the record's place in the current order and its neighbours", () => {
  const order = ["system:a", "system:b", "system:c"];
  assert.deepEqual(stepRecord(order, "system:b", 1), { index: 1, total: 3, key: "system:c" });
  assert.deepEqual(stepRecord(order, "system:a", -1), { index: 0, total: 3, key: null });
  assert.deepEqual(stepRecord(order, "system:z", 1), { index: -1, total: 3, key: null }, "a record the results left has no place");
});

test("related records stay inside one profile by score, and elsewhere carry no score", () => {
  const records = [
    { id: "a", name: "A", primary_role: "coding_agent", status: "active", score: { overall: 6 } },
    { id: "b", name: "B", primary_role: "coding_agent", status: "active", score: { overall: 8 } },
    { id: "c", name: "C", primary_role: "coding_agent", status: "archived", score: { overall: 9 } },
    { id: "d", name: "D", primary_role: "research_agent", status: "active", score: { overall: 7 } },
    { id: "e", name: "E", primary_role: "coding_agent", status: "active", score: { overall: 5 }, superseded_by: "a" },
  ];
  const same = relatedRecords("system", records[0], records, { comparable: true });
  assert.deepEqual(same.sameScale.map(item => item.id), ["b", "e"], "active peers of the role, by score");
  assert.equal(same.total, 2);
  const elsewhere = relatedRecords("system", records[0], records, { comparable: false });
  assert.equal(elsewhere.sameScale, undefined);
  assert.deepEqual(elsewhere.predecessors.map(item => item.id), ["e"]);
  assert.equal(elsewhere.successor, null);
  assert.equal(elsewhere.total, 2);
  assert.equal(relatedRecords("system", records[4], records).successor.id, "a");
});

test("More from a lab counts its other records per collection, never listing one", () => {
  const lab = { id: "lab-acme", name: "Acme", catalog_names: ["Acme"], systems: ["s1"] };
  const catalog = {
    projects: [{ id: "s1" }], services: [{ id: "i1", operator: "Acme" }, { id: "i2", operator: "Acme" }], runtimes: [],
    models: [{ id: "m1", developer: "Acme", review_status: "reviewed", source_id: "acme/m1" }], specifications: [], packs: [],
  };
  const membership = buildLabMembership([lab], catalog);
  const [entry] = labCountsForRecord(catalog.services[0], [lab], catalog, membership);
  assert.equal(entry.lab.id, "lab-acme");
  assert.deepEqual(entry.counts, [{ collection: "systems", count: 1 }, { collection: "models", count: 1 }, { collection: "inference", count: 1 }]);
  assert.deepEqual(labCountsForRecord({ id: "x" }, [lab], catalog, membership), []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, because `stepRecord is not a function`.

- [ ] **Step 3: Implement the core**

In `web/app-core.js`, after `buildLabMembership`, add the following, and export `RELATED_FIELDS`, `labCountsForRecord`, `relatedRecords`, and `stepRecord`:

```js
  // Where the open record sits in the results' current order, and the record
  // a step of `delta` reaches (Phase 3 spec, section 5). `order` holds
  // "kind:id" keys; a record not in it has no place, so the view hides
  // previous, next, and the position.
  function stepRecord(order = [], key, delta = 0) {
    const index = order.indexOf(key);
    if (index < 0) return { index: -1, total: order.length, key: null };
    const next = index + delta;
    return { index, total: order.length, key: next >= 0 && next < order.length ? order[next] : null };
  }

  // What a record view lists at its end (Phase 3 spec, section 6). In a
  // comparable scope: up to five other active records of the same role or
  // type, by score, one profile so the scores compare (ADR 014). Elsewhere,
  // with no score: the successor and predecessors the data names, and how
  // many other active records share the role or type.
  const RELATED_FIELDS = { system: "primary_role", inference: "service_type", runtime: "runtime_type", model: "model_type", pack: "pack_type", robot: "form_factor", spec: "specification_type", lab: "lab_type" };
  function relatedRecords(kind, record, records = [], { comparable = false } = {}) {
    const field = RELATED_FIELDS[kind];
    const value = field ? record[field] : undefined;
    const peers = value === undefined || value === null ? [] : records.filter(item => item !== record && item[field] === value && isActiveRecord(item));
    if (comparable && record.score) {
      const ranked = peers.filter(item => item.score).sort((a, b) => b.score.overall - a.score.overall || a.name.localeCompare(b.name));
      return { sameScale: ranked.slice(0, 5), field, value, total: ranked.length };
    }
    const successor = record.superseded_by ? records.find(item => item.id === record.superseded_by) || null : null;
    const predecessors = records.filter(item => item.superseded_by === record.id);
    return { successor, predecessors, field, value, total: peers.length };
  }

  // "More from <lab>": for each lab that joins a record, how many of its
  // other records each collection lists, in registry order. Counts, never a
  // hand-picked list, so no record is singled out.
  function labCountsForRecord(record, labs = [], catalog = {}, labMembership) {
    const ids = labMembership?.labsOf.get(record) || [];
    return ids.map(id => {
      const lab = labs.find(item => item.id === id);
      const relations = labRelations(lab, catalog);
      const groups = [
        ["systems", relations.systems], ["models", [...relations.models, ...relations.sourceRows]],
        ["inference", relations.services], ["runtimes", relations.runtimes],
        ["packs", relations.packs], ["specifications", relations.specifications],
      ];
      const counts = groups
        .map(([collection, joined]) => ({ collection, count: joined.filter(item => item !== record).length }))
        .filter(entry => entry.count > 0);
      return { lab, counts };
    });
  }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Write the failing browser tests**

Append to `tests/e2e/results-page.spec.js`:

```js
test("at 1280 px a row opens beside the list, the rail steps aside, and the row is marked", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=inference");
  const row = page.locator("#inference-grid .project-card").nth(1);
  await row.click();
  const panel = recordView(page, "inference");
  await expect(panel).toBeVisible();
  await expect(page.locator("#record-panel")).toBeVisible();
  await expect(page.locator("#filter-rail")).toBeHidden();
  await expect(page.locator("#filters-button")).toBeVisible();
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(recordHeading(page)).toBeFocused();
  await expect(page.locator("#inference-grid")).toBeVisible();
});

test("previous and next step through the results and replace the history entry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-grid .project-card").first().click();
  const panel = page.locator("#record-panel");
  await expect(panel.locator(".record-position")).toHaveText(/^1 of \d+$/);
  const length = await page.evaluate(() => history.length);
  await panel.locator('[data-record-step="1"]').click();
  await expect(panel.locator(".record-position")).toHaveText(/^2 of \d+$/);
  await recordHeading(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel.locator(".record-position")).toHaveText(/^3 of \d+$/);
  await page.locator("#runtime-grid .project-card").nth(5).click();
  await expect(panel.locator(".record-position")).toHaveText(/^6 of \d+$/);
  expect(await page.evaluate(() => history.length), "stepping and another row replace").toBe(length);
  await page.goBack();
  await expect(panel).toBeHidden();
});

test("a filter that drops the open record hides its place but keeps it open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await page.locator("#inference-grid .project-card").first().click();
  await search(page, "zzzz-no-such-record");
  await expect(page.locator("#record-panel")).toBeVisible();
  await expect(page.locator("#record-panel .record-nav")).toBeHidden();
});

test("below 1200 px, and from a loaded link, a record opens full-screen", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/?collection=inference");
  await page.locator("#inference-grid .project-card").first().click();
  await expect(page.locator("#record-dialog")).toBeVisible();
  await expect(page.locator("#record-panel")).toBeHidden();
});

test("Escape closes the panel only while focus is inside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await page.locator("#inference-grid .project-card").first().click();
  await searchBox(page).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#record-panel")).toBeVisible();
  await recordHeading(page).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#record-panel")).toBeHidden();
});

test("in one family, the panel lists records on the same scale, with scores and Compare", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems&family=agent_system");
  await page.locator("#project-grid .project-card").first().click();
  const related = page.locator("#record-panel .related-records");
  await expect(related.locator("h2")).toHaveText("On the same scale");
  await expect(related.locator(".related-score").first()).toHaveText(/^\d+(\.\d+)?$/);
  await expect(related.locator(".compare-toggle").first()).toBeVisible();
});

test("across families, related records carry no score, and More from a lab counts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=models");
  await page.locator("#model-grid .project-card").first().click();
  const related = page.locator("#record-panel .related-records");
  await expect(related).toBeVisible();
  await page.goto("/?collection=all&q=claude");
  await page.locator("#all-directory-grid .project-card").first().click();
  const panel = page.locator("#record-panel .related-records");
  await expect(panel.locator("h2")).toHaveText("Related");
  await expect(panel.locator(".related-score")).toHaveCount(0);
  await expect(panel.locator(".compare-toggle")).toHaveCount(0);
  const lab = panel.locator("[data-lab-browse]").first();
  if (await lab.count()) {
    const collection = await lab.getAttribute("data-lab-browse");
    await lab.click();
    await expect(pressedEntry(page)).toHaveAttribute("data-open-collection", collection);
    await expect(page).toHaveURL(/lab=/);
  }
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js`
Expected: FAIL, because `#record-panel` does not exist.

- [ ] **Step 7: Add the panel and the step bars**

In `web/index.html`:

1. In `#results-frame`, after `.results-main`, add:

```html
        <aside id="record-panel" class="record-panel" hidden>
          <div class="record-nav" hidden>
            <button type="button" class="ghost-button" data-record-step="-1">← Previous</button>
            <span class="record-position"></span>
            <button type="button" class="ghost-button" data-record-step="1">Next →</button>
          </div>
          <button type="button" class="dialog-close" aria-label="Close">×</button>
          <div id="record-panel-content" class="record-content"></div>
        </aside>
```

2. In `#record-dialog`, after its `.dialog-close`, add the same `<div class="record-nav" hidden>…</div>` block.

- [ ] **Step 8: Wire the panel**

In `web/app.js`:

1. **`RESULT_VIEWS`.** Add `kind` to each entry that lists one kind: `systems: "system"`, `inference: "inference"`, `runtimes: "runtime"`, `models: "model"`, `robots: "robot"`, `labs: "lab"`, `specifications: "spec"`. All and Packs mix kinds and leave it out.
2. **Result order.** Add `resultOrder: {}` to `state`. In `renderCollection`, beside `state.resultCounts[name]`, record `state.resultOrder[name] = records.map(record => `${RESULT_VIEWS[name].kind}:${record.id}`);`. In `renderPacks` and `renderAllDirectoryEntries`, record `state.resultOrder.packs = entries.map(({ kind, record }) => `${kind}:${record.id}`);` and the same for `all`.
3. **The container a record opens in.** After `RECORD_CONTENT`, add:

```js
const RECORD_PANEL = "#record-panel";
const wideRecordQuery = window.matchMedia("(min-width: 1200px)");
let activeRecordContainer = "dialog";
const isPanelOpen = () => !$(RECORD_PANEL).hidden;
const recordContent = () => $(activeRecordContainer === "panel" ? "#record-panel-content" : RECORD_CONTENT);
const RECORD_DETAIL_ATTRIBUTES = {
  system: "data-project", spec: "data-specification", inference: "data-inference-service", runtime: "data-local-runtime",
  model: "data-model", pack: "data-pack", robot: "data-robot", lab: "data-lab",
};

// Beside the list at 1200 px and wider for a record opened from results,
// full-screen otherwise, and full-screen for a record link loaded directly
// (Phase 3 spec, section 5). A record opened from inside the full-screen
// view stays there.
function recordContainer({ fullScreen = false } = {}) {
  if ($(RECORD_VIEW).open) return "dialog";
  if (!fullScreen && activeScope() && wideRecordQuery.matches) return "panel";
  return "dialog";
}
```

4. **Paint into the active container.** Replace every `$(RECORD_CONTENT)` in `paintRecordDialog`, `showRecordView`, `bindLabDialogLinks`, and the `RECORD_DIALOGS` `afterRender` hooks with `recordContent()`. Give `paintRecordDialog` a `kind` parameter, `paintRecordDialog(entry, record, kind)`, and end it with the related records:

```js
  content.insertAdjacentHTML("beforeend", relatedMarkup(kind, record));
  bindComparisonButtons(content);
  renderComparisonControls();
```

5. **`openRecordDialog`, `showRecordView`, and `writeRecordURL`.** Replace them with:

```js
function openRecordDialog(kind, id, { fullScreen = false, fromList = false } = {}) {
  const entry = RECORD_DIALOGS[kind];
  const record = entry.find(id);
  if (!record) return false;
  const target = recordContainer({ fullScreen });
  const view = $(target === "panel" ? RECORD_PANEL : RECORD_VIEW);
  const opening = target === "panel" ? view.hidden : !view.open;
  if (opening) recordOpener = document.activeElement;
  activeRecordContainer = target;
  paintRecordDialog(entry, record, kind);
  // Stepping and another row replace the entry, so Back still closes the
  // view; a link inside the view pushes, so Back retraces it.
  showRecordView(kind, id, { target, replace: fromList && !opening });
  const repaint = () => {
    if (view.dataset.recordKind === kind && view.dataset.recordId === id) paintRecordDialog(entry, record, kind);
  };
  entry.hydrate?.()?.then(repaint);
  loadDetail(kind, record)?.then(repaint);
  return true;
}

function showRecordView(kind, id, { target = "dialog", replace = false } = {}) {
  const view = $(target === "panel" ? RECORD_PANEL : RECORD_VIEW);
  view.dataset.recordKind = kind;
  view.dataset.recordId = id;
  if (target === "panel") {
    view.hidden = false;
    view.setAttribute("aria-label", RECORD_DIALOGS[kind].find(id)?.name || "Record");
    $("#results-frame").classList.add("has-record");
    $("#directory").classList.add("has-record-panel");
    markOpenRow();
  } else if (!view.open) view.showModal();
  view.scrollTop = 0;
  syncRecordNav();
  recordContent().querySelector("h1")?.focus({ preventScroll: true });
  writeRecordURL(kind, id, { replace });
}

function writeRecordURL(kind, id, { replace = false } = {}) {
  const url = new URL(window.location.href);
  const reference = `${kind}:${id}`;
  if (url.searchParams.get("record") === reference) return;
  url.searchParams.set("record", reference);
  writeURL(url, { push: !replace });
}
```

6. **Closing, the open row, and stepping.** Add after `closeRecordView`:

```js
function closeRecordPanel() {
  const panel = $(RECORD_PANEL);
  if (panel.hidden) return;
  panel.hidden = true;
  $("#record-panel-content").innerHTML = "";
  $("#results-frame").classList.remove("has-record");
  $("#directory").classList.remove("has-record-panel");
  activeRecordContainer = "dialog";
  markOpenRow();
  clearRecordURL();
  returnRecordFocus();
}

// The open record's row carries aria-current, repainted with the grid.
function markOpenRow() {
  $$('.project-card[aria-current="true"]').forEach(card => card.removeAttribute("aria-current"));
  if (!isPanelOpen()) return;
  const { recordKind, recordId } = $(RECORD_PANEL).dataset;
  const scope = activeScope();
  const attribute = RECORD_DETAIL_ATTRIBUTES[recordKind];
  if (!scope || !attribute) return;
  $(RESULT_VIEWS[scope].grid).querySelector(`[${attribute}="${CSS.escape(recordId)}"]`)?.closest(".project-card")?.setAttribute("aria-current", "true");
}

// "3 of 45" with Previous and Next, shown only while the open record is in
// the current results.
function syncRecordNav() {
  const scope = activeScope();
  const order = scope ? state.resultOrder[scope] || [] : [];
  for (const view of [$(RECORD_PANEL), $(RECORD_VIEW)]) {
    const nav = view.querySelector(".record-nav");
    const { index, total } = AppCore.stepRecord(order, `${view.dataset.recordKind}:${view.dataset.recordId}`, 0);
    nav.hidden = index < 0;
    if (index < 0) continue;
    nav.querySelector(".record-position").textContent = `${index + 1} of ${total}`;
    nav.querySelector('[data-record-step="-1"]').disabled = index === 0;
    nav.querySelector('[data-record-step="1"]').disabled = index === total - 1;
  }
}

function stepOpenRecord(delta) {
  const view = isPanelOpen() ? $(RECORD_PANEL) : $(RECORD_VIEW);
  const scope = activeScope();
  const order = scope ? state.resultOrder[scope] || [] : [];
  const { key } = AppCore.stepRecord(order, `${view.dataset.recordKind}:${view.dataset.recordId}`, delta);
  if (!key) return;
  // The list pages along, so the open row stays in the grid.
  const page = Math.floor(order.indexOf(key) / state.pageSize) + 1;
  if (page !== state.page[scope]) {
    state.page[scope] = page;
    RESULT_VIEWS[scope].render();
  }
  const colon = key.indexOf(":");
  openRecordDialog(key.slice(0, colon), key.slice(colon + 1), { fromList: true });
}

// An arrow key steps unless the reader is in a field or in a region that
// scrolls sideways, such as a score or comparison table.
function scrollsSideways(element) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}
```

7. **`clearRecordURL`.** Its first line becomes `if ($(RECORD_VIEW).open || isPanelOpen()) return;`.
8. **After every paint.** At the end of `renderCollection`, `renderPacks`, and `renderAllDirectoryEntries`, call `markOpenRow(); syncRecordNav();`.
9. **Rows open from the list.**
   - In `renderCollection`, replace the grid's binding `collection.open(button.dataset[collection.dataset])` with `openRecordDialog(RESULT_VIEWS[name].kind, button.dataset[collection.dataset], { fromList: true })`.
   - In `renderAllDirectoryEntries` and `renderPacks`, replace the per-attribute `forEach` bindings with:

```js
  for (const [kind, attribute] of Object.entries(RECORD_DETAIL_ATTRIBUTES)) {
    $$(`[${attribute}]`, grid).forEach(button => button.addEventListener("click", () =>
      openRecordDialog(kind, button.getAttribute(attribute), { fromList: true })));
  }
```

   (`grid` is `$("#all-directory-grid")` in `renderAllDirectoryEntries`; declare it there if the function does not already hold it in a variable.)
10. **Restore.** In `restoreFromURL`:
   - replace `if (!reference || !openRecord(reference.kind, reference.id)) {` with `if (!reference || !openRecordDialog(reference.kind, reference.id, { fullScreen: boot })) {`;
   - replace `closeRecordView();` inside that branch with `closeRecordView(); closeRecordPanel();`.

   A link loaded directly opens full-screen. Back and Forward reopen the container the reader was using.

- [ ] **Step 9: Related records**

In `web/app.js`, after `labCard`, add:

```js
const RECORD_RECORDS = {
  system: () => state.projects, inference: () => state.inferenceServices, runtime: () => state.localRuntimes, model: () => state.models,
  pack: () => state.packs, robot: () => state.robots, spec: () => state.specifications, lab: () => state.labs,
};
const RECORD_COLLECTIONS = { system: "systems", inference: "inference", runtime: "runtimes", model: "models", pack: "packs", robot: "robots", spec: "specifications", lab: "labs" };
const RELATED_FACETS = { system: "role", inference: "type", runtime: "type", model: "type", pack: "type", robot: "formFactor", spec: "type", lab: "type" };
const RELATED_VALUE_GROUPS = { inference: "inference_service_types", runtime: "local_runtime_types", model: "model_types", pack: "pack_types", robot: "robot_form_factors", spec: "specification_types", lab: "lab_types" };
const RELATED_NOUNS = { system: "systems", inference: "services", runtime: "runtimes", model: "models", pack: "packs", robot: "robots", spec: "specifications", lab: "labs" };
const LAB_COUNT_NOUNS = {
  systems: ["system", "systems"], models: ["model", "models"], inference: ["inference service", "inference services"],
  runtimes: ["local runtime", "local runtimes"], packs: ["agent pack", "agent packs"], specifications: ["specification", "specifications"],
};

// The end of every record view (Phase 3 spec, section 6). In a comparable
// scope, "On the same scale": up to five of the same role or type, with
// scores and Compare, one profile (ADR 014). Elsewhere, "Related", with no
// score: the successor and predecessors, and a link to the others of the
// role or type. Both end with "More from <lab>", as counts. A robot's
// section comes after its own related records, so nothing implies
// related_models.
function relatedMarkup(kind, record) {
  const scope = activeScope();
  const comparable = scope === RECORD_COLLECTIONS[kind]
    && (scope === "systems" ? Boolean($("#family-filter").value) : ["inference", "runtimes", "models"].includes(scope))
    && (kind !== "model" || isReviewedModel(record));
  const related = AppCore.relatedRecords(kind, record, RECORD_RECORDS[kind](), { comparable });
  const recordButton = (itemKind, item) => `<button type="button" class="link-button" data-related-kind="${itemKind}" data-related-id="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`;
  const valueName = !related.value ? "" : kind === "system" ? roleName(related.value) : taxonomyName(RELATED_VALUE_GROUPS[kind], related.value);
  const seeAll = related.total ? `<button type="button" class="link-button" data-related-see-all>${related.sameScale ? `See all ${related.total}` : `${related.total} other ${escapeHTML(valueName.toLowerCase())} ${RELATED_NOUNS[kind]}`}</button>` : "";
  let body;
  if (related.sameScale) {
    body = `<h2>On the same scale</h2><ul class="related-list" role="list">${related.sameScale.map(item => `<li>${recordButton(kind, item)} <span class="related-score">${escapeHTML(item.score.overall)}</span> <button class="compare-toggle" data-compare-kind="${kind}" data-compare-id="${escapeHTML(item.id)}" aria-label="Add ${escapeHTML(item.name)} to comparison" aria-pressed="false">Compare</button></li>`).join("")}</ul>${seeAll}`;
  } else {
    const successor = related.successor ? `<p>Succeeded by ${recordButton(kind, related.successor)}</p>` : "";
    const predecessors = related.predecessors.length ? `<p>Succeeds ${related.predecessors.map(item => recordButton(kind, item)).join(", ")}</p>` : "";
    body = `<h2>Related</h2>${successor}${predecessors}${seeAll ? `<p>${seeAll}</p>` : ""}`;
  }
  const labs = AppCore.labCountsForRecord(record, state.labs, collectionPayloads(), state.labMembership)
    .map(({ lab, counts }) => `<p class="related-lab">More from ${recordButton("lab", lab)}: ${counts.map(({ collection, count }) => `<button type="button" class="link-button" data-lab-browse="${collection}" data-lab-id="${escapeHTML(lab.id)}">${count} ${LAB_COUNT_NOUNS[collection][count === 1 ? 0 : 1]}</button>`).join(" · ")}</p>`)
    .join("");
  if (!body.includes("<p>") && !related.sameScale?.length && !labs) return "";
  return `<section class="related-records" data-related-kind-of="${kind}">${body}${labs}</section>`;
}

// "See all" and a lab's count leave the record for its collection: the view
// closes and focus goes to the result count (Phase 3 spec, section 5).
function openRelatedSlice(kind, record) {
  closeRecordView();
  closeRecordPanel();
  const collection = RECORD_COLLECTIONS[kind];
  if (kind === "system") {
    jumpToDirectoryFamily(record.system_family);
    $("#role-filter").value = record.primary_role;
    $("#role-filter").dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    openCollection(collection, { facet: { key: RELATED_FACETS[kind], value: record[AppCore.RELATED_FIELDS[kind]] } });
  }
  activateView("directory");
  $(RESULT_VIEWS[collection].count).focus({ preventScroll: true });
}

function openLabSlice(collection, labId) {
  closeRecordView();
  closeRecordPanel();
  const select = SCOPE_CONTROLS[collection]?.lab;
  if (!select) {
    openRecordDialog("lab", labId);
    return;
  }
  openCollection(collection);
  $(select).value = labId;
  $(select).dispatchEvent(new Event("input", { bubbles: true }));
  activateView("directory");
  $(RESULT_VIEWS[collection].count).focus({ preventScroll: true });
}
```

In `openRelatedSlice`, the facet value is the record's own field for its kind, read through the core's exported `RELATED_FIELDS`, so the app and the core name the same field.

In `bindEvents`, add one delegated handler for both containers:

```js
  for (const container of [$(RECORD_PANEL), $(RECORD_VIEW)]) {
    container.addEventListener("click", event => {
      const step = event.target.closest("[data-record-step]");
      if (step) return stepOpenRecord(Number(step.dataset.recordStep));
      if (event.target.closest(".dialog-close") && container === $(RECORD_PANEL)) return closeRecordPanel();
      const related = event.target.closest("[data-related-kind]");
      if (related) return openRecordDialog(related.dataset.relatedKind, related.dataset.relatedId);
      const seeAll = event.target.closest("[data-related-see-all]");
      if (seeAll) {
        const { recordKind, recordId } = container.dataset;
        return openRelatedSlice(recordKind, RECORD_DIALOGS[recordKind].find(recordId));
      }
      const lab = event.target.closest("[data-lab-browse]");
      if (lab) openLabSlice(lab.dataset.labBrowse, lab.dataset.labId);
    });
    container.addEventListener("keydown", event => {
      if (event.key === "Escape" && container === $(RECORD_PANEL)) {
        // A visible badge tooltip takes Escape first; the panel closes only
        // while focus is inside it, which this listener's place ensures.
        if ($("#badge-tooltip").hidden) {
          event.preventDefault();
          closeRecordPanel();
        }
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target.closest("input, select, textarea, [contenteditable]") || scrollsSideways(event.target)) return;
      event.preventDefault();
      stepOpenRecord(event.key === "ArrowLeft" ? -1 : 1);
    });
  }
  // A window that narrows below 1200 px moves the open record full-screen.
  wideRecordQuery.addEventListener("change", () => {
    if (wideRecordQuery.matches || !isPanelOpen()) return;
    const { recordKind, recordId } = $(RECORD_PANEL).dataset;
    $(RECORD_PANEL).hidden = true;
    $("#results-frame").classList.remove("has-record");
    $("#directory").classList.remove("has-record-panel");
    activeRecordContainer = "dialog";
    openRecordDialog(recordKind, recordId);
  });
```

The record markup's own buttons keep their `afterRender` bindings: the successor notice, a lab's joins, a pack's formats, and a robot's related records. They open records through `openRecordDialog` without options, which pushes, as the related section's buttons do.

- [ ] **Step 10: Style the panel and the related section**

In `web/styles.css`, after the rail rules, add:

```css
/* The panel beside the list at 1200 px and wider (Phase 3 spec, section 5):
   the rail steps aside, and the panel scrolls on its own, clearing the
   comparison tray and the legend. */
@media (min-width: 1200px) {
  .results-frame.has-record { display: grid; grid-template-columns: minmax(0, 1fr) minmax(24rem, 34rem); gap: 1.25rem; align-items: start; }
  .results-frame.has-record .filter-rail { display: none; }
  .record-panel { position: sticky; top: calc(var(--sticky-clearance, 0px) + .5rem); max-height: calc(100vh - var(--sticky-clearance, 0px) - 5rem); overflow-y: auto; padding: 0 1rem 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-elevated); box-shadow: var(--shadow-small); }
  .record-panel .record-content { width: 100%; }
  #directory.has-record-panel .filters-button { display: inline-flex; }
}
.record-panel[hidden] { display: none; }
.record-panel .dialog-close { position: sticky; top: 0; }
.record-nav { display: flex; align-items: center; gap: .5rem; padding: .5rem 0; font-size: .8rem; color: var(--muted); }
.record-nav[hidden] { display: none; }
.project-card[aria-current="true"] { outline: 2px solid var(--cyan); outline-offset: -2px; }
.related-records { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
.related-records h2 { margin: 0 0 .5rem; font: 700 .95rem var(--font-display); }
.related-list { display: grid; gap: .3rem; margin: 0 0 .5rem; padding: 0; list-style: none; }
.related-list li { display: flex; align-items: center; gap: .6rem; }
.related-score { color: var(--cyan); font: 700 .75rem var(--font-mono); }
.related-lab { margin: .5rem 0 0; }
```

- [ ] **Step 11: Let the helper find the panel**

In `tests/e2e/helpers/results.js`, replace `recordView` with:

```js
// The full-screen view or, from results at 1200 px and wider, the panel
// beside the list (Phase 3 task 6). Each names its record's kind.
function recordView(page, kind) {
  const open = kind ? `[data-record-kind="${kind}"]` : "";
  return page.locator(`#record-dialog[open]${open}, #record-panel:not([hidden])${open}`);
}
```

`closeRecord` presses the view's `.dialog-close`, which both containers carry.

- [ ] **Step 12: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS. At the default 1280×720 viewport, records opened from results now land in the panel.

- A test that measured the modal dialog's box, or its backdrop, sets a viewport below 1200 px or opens the record from a loaded link.
- A test that expected Back after clicking a second row to show the first record now expects the panel closed. Clicking another row replaces the entry.

- [ ] **Step 13: Update the contracts and the backlog**

In `docs/WEB.md`, in the record view line from Task 5, replace "The view is full-screen, and nothing in it scrolls sideways." with:

```markdown
At 1200px and wider a record opened from Catalog results opens in a panel beside the list: the rail steps aside, one Filters tap away, the list keeps its place, and the open row carries `aria-current`. Below 1200px, from the Finder, and for a record link loaded directly, the view is full-screen, and nothing in it scrolls sideways. The view's top bar shows the record's place in the results ("3 of 45") with Previous and Next, and ← and → do the same while focus is inside the view and not in a field or a region that scrolls sideways; they step through the results in their current order across pages, and the list pages along. Stepping, or clicking another row while the panel is open, replaces the history entry, so Back closes the panel; the place and the buttons hide while the record is not in the results. Escape closes the panel only while focus is inside it, after a visible badge tooltip. The view ends with related records: in a comparable scope, "On the same scale", up to five active records of the same role or type by score, each with its score and Compare, and "See all N"; elsewhere "Related", with no score or Compare: the successor and predecessors the record names and a link to the other active records of its role or type. Both end with "More from <lab>": the lab's other records as counts per collection, each opening that collection with the Lab filter set, and the lab's name opening its own record.
```

In `BACKLOG.md`, delete the item "Show related records and previous/next navigation inside detail dialogs using existing family, role, and successor data."

- [ ] **Step 14: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
/usr/local/bin/node --test tests/test_web.js
git add web tests docs/WEB.md BACKLOG.md
git commit -m "Open records beside the list, step through them, and show related records"
gh pr create --title "Open records beside the list, step through them, and show related records" --body "Front-door Phase 3, task 6 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). At 1200 px and wider a record opened from results opens in a panel beside the list (the rail steps aside); Previous/Next and the arrow keys step through the results across pages, replacing the history entry; related records end every view: on the same scale with scores in a comparable scope (ADR 014), otherwise related with no score, and More from a lab as counts."
```

---
### Task 7: Suggestions while typing, and a front door that stays put

The owner may drop this task after Tasks 1–6 ship. If so, the Phase 2 follow-up about the door's first-keystroke hand-off stays in `BACKLOG.md`.

Under the front door's search and the results search, a listbox opens once the query has two characters. It offers, in order:

- the Finder job the query names;
- up to five records across the catalog;
- up to three labs;
- up to three categories;
- "See all results for “q”".

The front door's search stops handing its text to All on the first keystroke. The reader stays on the door until Enter, a choice, or "See all results", which closes the WCAG 3.2.2 follow-up.

**Files:**

- Modify: `web/app-core.js` (`searchSuggestions`, export)
- Modify: `web/index.html` (the two listboxes; combobox attributes on both inputs)
- Modify: `web/app.js` (`renderSuggestions`, `closeSuggestions`, `activateSuggestion`, and `handOffDoorQuery`; the door's input handler; the keyboard wiring)
- Modify: `web/styles.css`, `tests/test_web.js`, `tests/e2e/helpers/landing.js`, `tests/e2e/results-page.spec.js`, `tests/e2e/front-door.spec.js`
- Modify: `docs/WEB.md`, `BACKLOG.md`

**Interfaces:**

- Consumes:
  - `matchFinderGoal`, `recordMatch`, `searchFields`, and `parseSearchQuery` (core);
  - `finderGoalEntries()`, `openFinderAt(direction, goal)`, `openRecordDialog(kind, id)`, `openCollection(id, { facet })`, `jumpToDirectoryFamily`, and `currentQuery()` (app).
- Produces:
  - `AppCore.searchSuggestions(term, { payloads, indexes, labelOf, goals, taxonomy })` → `{ job, records: [{ kind, record, weight }], labs: [{ kind, record, weight }], categories: [{ collection, key, value, name, family, weight }] }`;
  - markup `ul#door-suggestions.suggestions[role=listbox]` and `ul#results-suggestions.suggestions[role=listbox]`, with `li[role=option][data-suggestion]` options;
  - `input[role=combobox][aria-controls][aria-expanded][aria-activedescendant]`;
  - `searchAll(page, text)` in `landing.js` keeps its meaning of landing in All's results, now by pressing Enter.

- [ ] **Step 1: Write the failing unit test**

Add `searchSuggestions` to the core `require` in `tests/test_web.js`, and append:

```js
test("suggestions wait for two characters, rank by match, and keep scores out", () => {
  const payloads = {
    projects: [
      { id: "coder", name: "Coder", primary_role: "coding_agent", system_family: "agent_system", status: "active", score: { overall: 1 } },
      { id: "old", name: "Coder Classic", primary_role: "coding_agent", system_family: "agent_system", status: "archived", score: { overall: 9 } },
    ],
    labs: [{ id: "lab-coderco", name: "CoderCo", lab_type: "ai_company" }],
  };
  const taxonomy = { primary_roles: [{ id: "coding_agent", name: "Coding agent", family: "agent_system" }], system_families: [{ id: "agent_system", name: "Agent systems" }] };
  const none = searchSuggestions("c", { payloads, taxonomy });
  assert.deepEqual([none.records, none.labs, none.categories], [[], [], []]);
  const coder = searchSuggestions("coder", { payloads, taxonomy });
  assert.deepEqual(coder.records.map(entry => entry.record.id), ["coder", "old"], "match order, never the score");
  assert.deepEqual(coder.labs.map(entry => entry.record.id), ["lab-coderco"]);
  const coding = searchSuggestions("coding", { payloads, taxonomy });
  assert.deepEqual(coding.categories.map(entry => [entry.collection, entry.key, entry.value]), [["systems", "role", "coding_agent"]]);
  assert.equal(coding.categories[0].family, "agent_system");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, because `searchSuggestions is not a function`.

- [ ] **Step 3: Implement the core**

In `web/app-core.js`, after `matchFinderGoal`, add the following, and export `searchSuggestions`:

```js
  // What the search offers while the reader types (Phase 3 spec, section 7):
  // the Finder job the query names, by the banner's rule; up to five records
  // across the catalog and up to three labs, each in ADR 040 match order
  // (match, then active first, then A–Z); and up to three categories whose
  // names match, each opening its collection narrowed. Nothing reads a score.
  const SUGGESTION_KINDS = [
    ["system", "projects", "systems"], ["inference", "services", "inference"], ["runtime", "runtimes", "runtimes"],
    ["model", "models", "models"], ["pack", "packs", "packs"], ["robot", "robots", "robots"], ["spec", "specifications", "specifications"],
  ];
  const SUGGESTION_CATEGORIES = [
    ["system_families", "systems", "family", "system_family", "projects"],
    ["primary_roles", "systems", "role", "primary_role", "projects"],
    ["inference_service_types", "inference", "type", "service_type", "services"],
    ["local_runtime_types", "runtimes", "type", "runtime_type", "runtimes"],
    ["model_types", "models", "type", "model_type", "models"],
    ["pack_types", "packs", "type", "pack_type", "packs"],
    ["robot_form_factors", "robots", "formFactor", "form_factor", "robots"],
    ["specification_types", "specifications", "type", "specification_type", "specifications"],
    ["lab_types", "labs", "type", "lab_type", "labs"],
  ];
  function searchSuggestions(term, { payloads = {}, indexes = {}, labelOf, goals = [], taxonomy = {} } = {}) {
    const query = parseSearchQuery(term);
    if (String(term || "").trim().length < 2 || !query.tokens.length) return { job: null, records: [], labs: [], categories: [] };
    const weigh = (kind, record, index) => ({ kind, record, weight: recordMatch(query, searchFields(kind, record, { index, labelOf })) });
    const ranked = entries => entries.filter(entry => entry.weight > 0).sort((a, b) =>
      b.weight - a.weight || Number(isActiveRecord(b.record)) - Number(isActiveRecord(a.record)) || a.record.name.localeCompare(b.record.name));
    const records = ranked(SUGGESTION_KINDS.flatMap(([kind, key, index]) => (payloads[key] || []).map(record => weigh(kind, record, indexes[index])))).slice(0, 5);
    const labs = ranked((payloads.labs || []).map(record => weigh("lab", record, indexes.labs))).slice(0, 3);
    const categories = SUGGESTION_CATEGORIES.flatMap(([group, collection, key, field, payloadKey]) => {
      const present = new Set((payloads[payloadKey] || []).map(record => record[field]));
      return (taxonomy[group] || []).filter(item => present.has(item.id)).map(item => ({
        collection, key, value: item.id, name: item.name, family: item.family,
        weight: recordMatch(query, { name: item.name, names: [item.name], label: "", maker: "", description: "", text: "" }),
      }));
    }).filter(entry => entry.weight > 0).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)).slice(0, 3);
    return { job: goals.length ? matchFinderGoal(goals, term) : null, records, labs, categories };
  }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Write the failing browser tests**

Append to `tests/e2e/results-page.spec.js`:

```js
test("the front door keeps the reader while suggestions open, and Enter lands in All", async ({ page }) => {
  await page.goto("/");
  const door = page.locator("#door-search");
  await door.fill("ollama");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(door).toHaveAttribute("aria-expanded", "true");
  const options = page.locator("#door-suggestions [role=option]");
  await expect(options.filter({ hasText: "Ollama" }).first()).toBeVisible();
  await expect(page).not.toHaveURL(/collection=/);
  await door.press("Enter");
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Everything /);
  await expect(searchBox(page)).toHaveValue("ollama");
});

test("arrow keys move through the suggestions and Enter opens the one chosen", async ({ page }) => {
  await page.goto("/");
  const door = page.locator("#door-search");
  await door.fill("ollama");
  await door.press("ArrowDown");
  const active = await door.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  const chosen = page.locator(`#${active}`);
  await expect(chosen).toHaveAttribute("aria-selected", "true");
  const kind = await chosen.getAttribute("data-suggestion");
  await door.press("Enter");
  if (kind === "record") await expect(recordView(page)).toBeVisible();
});

test("a category suggestion opens its collection narrowed to it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=all");
  await searchBox(page).fill("coding agent");
  const category = page.locator('#results-suggestions [data-suggestion="category"]').first();
  await expect(category).toBeVisible();
  await category.click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems/);
  await expect(page.locator("#filter-chips .filter-chip").first()).toContainText("Role: ");
});

test("Escape closes the suggestions first, and the live count waits for them to close", async ({ page }) => {
  await page.goto("/?collection=all");
  const box = searchBox(page);
  await box.fill("memory");
  await expect(page.locator("#results-suggestions")).toBeVisible();
  await expect(page.locator("#all-directory-result-count")).toHaveAttribute("aria-live", "off");
  await box.press("Escape");
  await expect(page.locator("#results-suggestions")).toBeHidden();
  await expect(box).toHaveValue("memory");
  await expect(page.locator("#all-directory-result-count")).toHaveAttribute("aria-live", "polite");
});

test("a job suggestion opens the Finder at its priority question", async ({ page }) => {
  await page.goto("/");
  await page.locator("#door-search").fill("run models locally");
  const job = page.locator('#door-suggestions [data-suggestion="job"]');
  await expect(job).toBeVisible();
  await job.click();
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
});
```

In `tests/e2e/front-door.spec.js`, rewrite the tests that expect the door to hand off on the first keystroke (grep `searchAll(` and `#door-search` there). A typed door query now lands in results on Enter; `searchAll` does it for them.

In `tests/e2e/helpers/landing.js`, `searchAll` becomes:

```js
// On the front door the search keeps the reader until Enter, which lands in
// All's results (Phase 3 task 7); in results it types into the results search.
async function searchAll(page, text) {
  if (!await allSearch(page).count()) await page.locator('[data-mobile-nav="search"]').click();
  const box = allSearch(page);
  await box.fill(text);
  if (await page.locator("#door-search").isVisible()) await box.press("Enter");
  await require("./results").settled(page);
}
```

- [ ] **Step 6: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/results-page.spec.js`
Expected: FAIL, because `#door-suggestions` does not exist.

- [ ] **Step 7: Add the listboxes**

In `web/index.html`:

- **Door search.** Give `#door-search` the attributes `role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="door-suggestions"`. After its `</label>`, add `<ul id="door-suggestions" class="suggestions" role="listbox" aria-label="Suggestions" hidden></ul>`.
- **Results search.** Give `#results-search` the same attributes with `aria-controls="results-suggestions"`. After its `</label>`, add `<ul id="results-suggestions" class="suggestions" role="listbox" aria-label="Suggestions" hidden></ul>`.

- [ ] **Step 8: Wire the suggestions and the door**

In `web/app.js`, after `renderDoorJobs`, add:

```js
// Suggestions while typing (Phase 3 spec, section 7): an ARIA combobox on
// each search box. ↑ and ↓ move, Enter opens the active option, Escape
// closes the list. The results keep updating underneath, and their live
// count stays quiet while the list is open.
const SUGGESTION_LISTS = { "door-search": "#door-suggestions", "results-search": "#results-suggestions" };
let suggestionEntries = [];

function suggestionsFor(input) {
  return $(SUGGESTION_LISTS[input.id]);
}

function renderSuggestions(input) {
  const list = suggestionsFor(input);
  const term = input.value;
  const found = AppCore.searchSuggestions(term, {
    payloads: collectionPayloads(), indexes: searchIndexes, labelOf: searchLabel,
    goals: finderGoalEntries(), taxonomy: state.taxonomy,
  });
  const collectionName = id => AppCore.COLLECTIONS.find(entry => entry.id === id)?.name || "";
  suggestionEntries = [
    ...(found.job ? [{ type: "job", label: `Job: ${found.job.label}`, detail: "Open the Finder's shortlist", job: found.job }] : []),
    ...found.records.map(({ kind, record }) => ({ type: "record", label: record.name, detail: collectionName(RECORD_COLLECTIONS[kind]), kind, id: record.id })),
    ...found.labs.map(({ record }) => ({ type: "lab", label: record.name, detail: "Lab", kind: "lab", id: record.id })),
    ...found.categories.map(category => ({ type: "category", label: category.name, detail: collectionName(category.collection), category })),
  ];
  if (!suggestionEntries.length || term.trim().length < 2) return closeSuggestions(input);
  suggestionEntries.push({ type: "all", label: `See all results for “${term.trim()}”`, detail: "" });
  list.innerHTML = suggestionEntries.map((entry, index) =>
    `<li id="${list.id}-${index}" role="option" aria-selected="false" data-suggestion="${entry.type}" data-index="${index}"><span class="suggestion-label">${escapeHTML(entry.label)}</span>${entry.detail ? `<span class="suggestion-detail">${escapeHTML(entry.detail)}</span>` : ""}</li>`).join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.removeAttribute("aria-activedescendant");
  $$(".result-row [aria-live]").forEach(count => count.setAttribute("aria-live", "off"));
}

function closeSuggestions(input) {
  const list = suggestionsFor(input);
  list.hidden = true;
  list.innerHTML = "";
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  $$(".result-row [aria-live]").forEach(count => count.setAttribute("aria-live", "polite"));
}

function moveSuggestion(input, delta) {
  const options = $$("[role=option]", suggestionsFor(input));
  if (!options.length) return;
  const current = options.findIndex(option => option.id === input.getAttribute("aria-activedescendant"));
  const next = (current + delta + options.length) % options.length;
  options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
  input.setAttribute("aria-activedescendant", options[next].id);
  options[next].scrollIntoView({ block: "nearest" });
}

// The door hands its query to All's results only when the reader asks:
// Enter or "See all results" (the WCAG 3.2.2 follow-up of Phase 2).
function handOffDoorQuery() {
  const value = $("#door-search").value;
  if (!value.trim()) return;
  $("#door-search").value = "";
  state.page.all = 1;
  const target = $("#results-search");
  target.value = value;
  openCollection("all");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus({ preventScroll: true });
  target.setSelectionRange(value.length, value.length);
}

function activateSuggestion(input, index) {
  const entry = suggestionEntries[index];
  closeSuggestions(input);
  if (!entry) return;
  const fromDoor = input.id === "door-search";
  if (entry.type === "all") {
    if (fromDoor) handOffDoorQuery();
    else setDirectoryCollection("all", { carryQuery: false });
    return;
  }
  if (entry.type === "job") return openFinderAt(entry.job.direction, entry.job.id);
  if (entry.type === "record" || entry.type === "lab") return openRecordDialog(entry.kind, entry.id);
  const { collection, key, value, family } = entry.category;
  if (fromDoor) $("#door-search").value = "";
  if (collection === "systems" && key === "family") return jumpToDirectoryFamily(value);
  if (collection === "systems" && key === "role") {
    openCollection("systems");
    jumpToDirectoryFamily(family);
    $("#role-filter").value = value;
    $("#role-filter").dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  openCollection(collection, { facet: { key, value } });
}
```

In `bindEvents`:

1. Replace the whole `#door-search` input handler with:

```js
  $("#door-search").addEventListener("input", () => renderSuggestions($("#door-search")));
```

2. Add `renderSuggestions($("#results-search"))` to the results search's input path. Bind it beside `onQueryInput`: `$("#results-search").addEventListener("input", () => renderSuggestions($("#results-search")));`.
3. Add the keyboard and pointer wiring for both boxes:

```js
  for (const input of [$("#door-search"), $("#results-search")]) {
    input.addEventListener("keydown", event => {
      const open = !suggestionsFor(input).hidden;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!open) return;
        event.preventDefault();
        moveSuggestion(input, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        const active = input.getAttribute("aria-activedescendant");
        if (open && active) {
          event.preventDefault();
          activateSuggestion(input, Number($(`#${active}`).dataset.index));
        } else if (input.id === "door-search") {
          event.preventDefault();
          closeSuggestions(input);
          handOffDoorQuery();
        } else if (open) closeSuggestions(input);
      } else if (event.key === "Escape" && open) {
        // The list closes first; the box's own Escape, which clears it, waits.
        event.preventDefault();
        event.stopPropagation();
        closeSuggestions(input);
      }
    });
    input.addEventListener("blur", () => setTimeout(() => {
      if (!suggestionsFor(input).contains(document.activeElement)) closeSuggestions(input);
    }, 0));
    const list = suggestionsFor(input);
    // Mousedown keeps focus in the box, so the choice lands before blur closes the list.
    list.addEventListener("mousedown", event => event.preventDefault());
    list.addEventListener("click", event => {
      const option = event.target.closest("[role=option]");
      if (option) activateSuggestion(input, Number(option.dataset.index));
    });
  }
```

4. In `bootstrap`, the line that re-dispatches a door query typed before boot (`if ($("#door-search").value && state.directoryStage === "door") $("#door-search").dispatchEvent(…)`) stays. It now renders suggestions.

- [ ] **Step 9: Style the listbox**

In `web/styles.css`, add:

```css
/* Suggestions under a search box (Phase 3 spec, section 7). */
.door-search, .results-search { position: relative; }
.suggestions { position: absolute; z-index: 20; width: min(40rem, 100%); max-height: min(24rem, 60vh); margin: .25rem 0 0; padding: .3rem; overflow-y: auto; list-style: none; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg-elevated); box-shadow: var(--shadow-dialog); }
.suggestions[hidden] { display: none; }
.suggestions [role=option] { display: flex; justify-content: space-between; gap: 1rem; padding: .45rem .6rem; border-radius: var(--radius-control); cursor: pointer; }
.suggestions [role=option][aria-selected="true"], .suggestions [role=option]:hover { background: var(--glass); }
.suggestions [data-suggestion="job"] .suggestion-label { color: var(--cyan); font-weight: 600; }
.suggestion-detail { color: var(--muted); font-size: .78rem; white-space: nowrap; }
```

The `#door-suggestions` and `#results-suggestions` lists follow their labels in the markup. The `position: relative` above makes each list drop under its box. If a label is not the lists' positioning parent, wrap each input's label and list in one `<div class="door-search">` or `<div class="results-search">`.

- [ ] **Step 10: Run the browser suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS. A test that types on the front door and expects results at once goes through `searchAll`, which presses Enter.

- [ ] **Step 11: Update the contracts and close Phase 3 in the backlog**

In `docs/WEB.md`:

- **Content hierarchy, the tile line.** Replace "Typing on the front door searches everything and lands in results with the caret in the results search." with "Typing on the front door offers suggestions under the box and keeps the reader on the front door; Enter, a suggestion, or \"See all results\" opens results, with the caret in the results search when it lands on All."
- **Behavioral contracts.** Add after the "/" line:

```markdown
- Both search boxes are comboboxes. Once a query has two characters a list under the box offers, in order: the Finder job the query names (by the banner's rule), up to five records across the catalog and up to three labs, each in match order and never by score, up to three families, roles, or types whose names match, each opening its collection narrowed, and "See all results for “q”". ↑ and ↓ move through it, Enter opens the active option, and Escape closes it before the box's own Escape clears the query. While it is open the result row's live count stays quiet, and it speaks when the list closes.
```

In `BACKLOG.md`:

- **Delete** the item "Front-door Phase 3: the results page, with a filter rail, a list view, and a record side panel."
- **The "Reader experience" intro.** Replace "Phase 3, the results page with a filter rail, a list view, and a record side panel, is next. Specify the remaining Phase 3 and 4 work against the shipped UI before implementation." with "Phase 3, the results page (one search bar, a filter rail, a list view, and a record view beside the list), landed in the seven PRs of `docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md`. Specify Phase 4 against the shipped UI before implementation."
- **The Phase 2 follow-up about the door.** Replace "the front-door search hands off to the All search on the first keystroke (a WCAG 3.2.2 change of context), and emblem-only strip entries carry a `title` rather than the badge tooltip; both depart from the spec without a record;" with "emblem-only strip entries carry a `title` rather than the badge tooltip, a departure from the spec without a record;".

- [ ] **Step 12: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
/usr/local/bin/node --test tests/test_web.js
git add web tests docs/WEB.md BACKLOG.md
git commit -m "Suggest jobs, records, labs, and categories while typing"
gh pr create --title "Suggest jobs, records, labs, and categories while typing" --body "Front-door Phase 3, task 7 of 7 (plan: docs/superpowers/plans/2026-09-29-front-door-phase-3-results-page.md). Both search boxes become comboboxes that suggest the Finder job the query names, up to five records, three labs, and three categories, in match order and never by score. The front door keeps the reader until Enter or a choice, closing the WCAG 3.2.2 follow-up. This completes Phase 3."
```
