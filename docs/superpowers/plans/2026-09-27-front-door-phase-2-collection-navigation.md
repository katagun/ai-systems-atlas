# Front-door Phase 2 Collection Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Directory's quick-filter switcher with the front door (an index of collection tiles) and a sticky scope strip in results, both rendered from one collection registry, and close the three Phase 0 leftovers.

**Architecture:** The site is a dependency-free static app: pure, unit-tested logic lives in `web/app-core.js` (UMD, loaded by the page and by `node:test`), DOM wiring in `web/app.js`, markup in `web/index.html`, styles in `web/styles.css`. The registry, counts, categories, and URL rules are pure functions in the core; the front door, tiles, strip, and history are DOM code in `app.js`; the three "most recently reviewed" ids per collection come from the payload builder. The Directory view gains one piece of state, `state.directoryStage`, which is `"door"` or `"results"`.

**Tech Stack:** Vanilla JavaScript (ES2020), CSS custom properties, `node:test` (`tests/test_web.js`), Playwright (`tests/e2e/`), Python `uv` scripts for generated files, `unittest` (`tests/test_web_payload.py`).

**Spec:** `docs/superpowers/specs/2026-09-27-front-door-phase-2-collection-navigation-design.md`, checked against `docs/superpowers/specs/2026-09-24-directory-front-door-design.md` ("Target design" items 2 and 3, "URL state and history", "Contract changes", "Test impact").

## Global Constraints

- **Base on `main` after Phase 1 merges.** The front-door session's ranked-search PR (branch `claude/directory-p1-ranked-search`, ADR 040) lands first and changes `setDirectoryCollection`, `activateView`, the search fields, and the boot sequence. Do not start Task 1's code before that merge; the session "Landing page UI/UX review" sends a notice. Every task: `git fetch origin && git switch -c claude/directory-p2-<n>-<slug> origin/main`. Anchor edits by function name, not line number.
- **Phase 1 signatures to keep** (spec section 6): `setDirectoryCollection(collection, { updateURL = true, carryQuery = updateURL })`; `activateView(id, { focusTarget } = {})` moves focus to the new view's heading, and every view heading carries `tabindex="-1"`; `syncMatchSort(scope)` sets a scope's sort to Best match while a query is present; `<output class="search-count">` sits inside every `label.search-field`; `<div class="job-hint" data-job-hint="...">` sits directly before `#all-directory-grid`, `#project-grid`, `#inference-grid`, and `#runtime-grid`; `.empty-search` spans a grid and its "Search all" button (`[data-empty-search-all]`) switches to All carrying the query. Keep each of these beside the grid it belongs to.
- **One task, one branch, one PR**, green before the next starts. Before the first commit of each task, run `ListAgents` and message every session touching `web/` or `tests/e2e/` with the branch and file list (the front-door session and the badge session at least).
- **Colours and radii only from the custom properties in `web/styles.css`**: no colour literal and no `border-radius` literal outside `:root` (`tests/test_web.js` fails the build on either). Add `--radius-pill: 999px;` to `:root` in Task 3 and use `var(--radius-pill)` for pills.
- **After any change to `web/index.html`, `web/app.js`, `web/app-core.js`, or `web/styles.css`, run `/usr/local/bin/node scripts/build_asset_version.mjs` and commit its output.** Always use `/usr/local/bin/node` (v22) for tests, lint, and the stamp; the default `node` drifts.
- **Fit tests need 16 px of measured slack** because CI's Linux Chromium renders text wider than macOS. **Position tests wait for scrolling to stop** (`html { scroll-behavior: smooth }`) with the `settle`/`aim` pattern from `tests/e2e/finder-handoff.spec.js` and `tests/e2e/card-click.spec.js`.
- **User-facing copy is short and plain**: no "score profile", "scope", or "registry" in the interface.
- **The page makes no request outside its own origin and adds no dependency.**
- **Local Playwright runs can fail a random handful of tests with boot timeouts** (a boot request with status -1 in the trace). Rerun with `npx playwright test --last-failed` before suspecting the change.
- **Commits run the full pre-commit suite and take minutes**: use a 10-minute timeout and check `git log -1` afterwards; a formatter hook can abort the first attempt, so re-add and commit again. `markdownlint-cli2` lints every `.md`.
- **ADR 043 is provisional.** Right before Task 6's PR: `git ls-tree --name-only origin/main docs/adr/`; if 043 is taken, renumber by slug and fix only this plan's own references.
- Unit tests: `/usr/local/bin/node --test tests/test_web.js`. Payload tests: `uv run python -m pytest tests/test_web_payload.py -q`. Browser tests: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/<file>`. Full gate: `pre-commit run --all-files`.

## File structure

| File | Responsibility in this plan |
|---|---|
| `tests/e2e/helpers/landing.js` (new, Task 1) | The one place tests reach a collection, a family, a view, the pressed entry, an entry's count, and the All search; its internals change in Task 3 and 4, its API never |
| `web/app-core.js` (Task 2, 5) | `COLLECTIONS`, `FAMILY_SHORT_NAMES`, `collectionEntries`, `collectionCount`, `collectionCategories`, `collectionState`, `directoryStageFromURL`; `scopeFromURL` gains comparison and record precedence |
| `scripts/build_web_payload.py` (Task 2) | `recent_record_ids` and the `recent` envelope key |
| `web/index.html` (Task 3, 4) | The front door replaces the hero, the map, and the switcher; the scope strip container |
| `web/app.js` (Task 3, 4, 5) | `state.directoryStage`, `state.recent`; `renderCollectionIndex`, `renderDoorJobs`, `openFinderAtJob`, `openCollection`, `leaveFrontDoor`, `showFrontDoor`, `showResults`; `renderScopeStrip`, `renderFamilyRow`, `syncHeaderHeight`; `resetScopeControls`, `restoreFromURL` |
| `web/styles.css` (Task 3, 4) | `.front-door`, `.collection-index`, `.tile*`, `.door-*`, `.state-dot`; `.scope-strip`, `.scope-*`, `.family-*`, the phone sticky rule; the hero and map rules go |
| `tests/test_web.js` (Task 2, 4, 5) | Registry, counts, categories, state, stage, and `scopeFromURL` tests; the old switcher tests go in Task 4 |
| `tests/test_web_payload.py` (Task 2) | `recent` rule |
| `tests/e2e/front-door.spec.js` (new, Task 3, 4, 5) | The front door, tiles, strip, history, and the three leftovers |
| `docs/adr/043-the-directory-opens-on-a-front-door-of-collection-tiles.md` (new, Task 6) | The decision |
| `docs/WEB.md`, `BACKLOG.md` (Task 6, with small edits in Tasks 3–5) | Contracts, change surfaces, verification, backlog |

---

### Task 1: One landing-navigation helper for the e2e suite

No markup change. Every test that reaches a collection, a family, a view, the pressed entry, a chip's count, or the All search does so through `tests/e2e/helpers/landing.js`, so Tasks 3 and 4 change the helper's internals once.

**Files:**
- Create: `tests/e2e/helpers/landing.js`
- Modify: `tests/e2e/badge-legend.spec.js`, `tests/e2e/card-badges.spec.js`, `tests/e2e/card-click.spec.js`, `tests/e2e/card-stars.spec.js`, `tests/e2e/deferred-data.spec.js`, `tests/e2e/directory-search.spec.js`, `tests/e2e/page-health.spec.js`, `tests/e2e/record-links.spec.js`, `tests/e2e/robots.spec.js`, `tests/e2e/url-state.spec.js`
- Modify: `docs/WEB.md` ("Change surfaces": one row)

**Interfaces:**
- Produces, for every later task and every e2e test:
  - `collectionEntry(page, id)` → Locator of the control that opens a Directory collection; `id` is `"all" | "systems" | "inference" | "runtimes" | "packs" | "robots"`.
  - `familyEntry(page, family)` → Locator of the control that opens Systems on one family; `family` is a `system_families` id.
  - `pressedEntry(page)` → Locator of the one pressed collection control (`aria-pressed="true"`).
  - `pressedFamily(page)` → Locator of the pressed family control, when Systems is open on one family.
  - `entryCount(page, id)` → `Promise<number>`, the count the collection control prints.
  - `familyCount(page, family)` → `Promise<number>`.
  - `openCollection(page, id)`, `openFamily(page, family)` → `Promise<void>`, click and return.
  - `openView(page, id)` → clicks the primary tab `id` (`"directory" | "finder" | "models" | "labs" | "specifications" | "taxonomy" | "api"`).
  - `allSearch(page)` → Locator of the mixed search input; `searchAll(page, text)` fills it.

- [ ] **Step 1: Write the helper against today's switcher**

```js
// tests/e2e/helpers/landing.js
// Every test reaches a Directory collection, a system family, a primary view,
// the pressed entry, an entry's count, or the mixed search through here, so
// the landing page's markup can change in one place (front-door spec, "Test
// impact"). Until Front-door Phase 2 lands, the entries are the switcher chips.

function collectionEntry(page, id) {
  return page.locator(`[data-directory-collection="${id}"]:not([data-directory-family])`);
}

function familyEntry(page, family) {
  return page.locator(`[data-directory-collection="systems"][data-directory-family="${family}"]`);
}

function pressedEntry(page) {
  return page.locator('.collection-switcher [aria-pressed="true"]');
}

// Today a family chip is the pressed entry; after Phase 2 the family row has
// its own pressed control while Systems stays pressed above it.
function pressedFamily(page) {
  return page.locator('.collection-switcher [aria-pressed="true"][data-directory-family]');
}

async function countOf(locator) {
  return Number((await locator.locator("strong").first().textContent()).trim());
}

const entryCount = (page, id) => countOf(collectionEntry(page, id));
const familyCount = (page, family) => countOf(familyEntry(page, family));

async function openCollection(page, id) {
  await collectionEntry(page, id).click();
}

async function openFamily(page, family) {
  await familyEntry(page, family).click();
}

async function openView(page, id) {
  await page.locator(`.tab[data-tab="${id}"]`).click();
}

function allSearch(page) {
  return page.locator("#all-directory-search");
}

async function searchAll(page, text) {
  await allSearch(page).fill(text);
}

module.exports = { allSearch, collectionEntry, entryCount, familyCount, familyEntry, openCollection, openFamily, openView, pressedEntry, pressedFamily, searchAll };
```

- [ ] **Step 2: Move every call site onto the helper**

In each file below add `const landing = require("./helpers/landing");` (or destructure the names it uses) after the Playwright require, then rewrite by these rules. The grep that finds them all:

```bash
grep -n 'all-directory-search\|name: /\^All\|name: /\^Systems\|name: /\^Memory\|name: /\^Agents\|name: /\^Assistants\|name: /\^Inference\|name: /\^Local runtimes\|name: /\^Agent packs\|name: /\^Robots\|collection-switcher\|data-directory-collection' tests/e2e/*.js
```

| Today | Becomes |
|---|---|
| `page.getByRole("button", { name: /^Systems / }).click()` (any collection name) | `await openCollection(page, "systems")` (`all`, `inference`, `runtimes`, `packs`, `robots`) |
| `page.getByRole("button", { name: /^Memory / }).click()` (Agents, Assistants) | `await openFamily(page, "memory_system")` (`agent_system`, `assistant_system`) |
| `expect(page.getByRole("button", { name: /^X / })).toHaveAttribute("aria-pressed", "true")` | `await expect(pressedEntry(page)).toHaveAccessibleName(/^X /)` for a collection; `await expect(pressedFamily(page)).toHaveAccessibleName(/^Memory /)` for a family |
| `expect(page.getByRole("button", { name: /^X / })).toHaveAttribute("aria-pressed", "false")` | `await expect(collectionEntry(page, "x")).toHaveAttribute("aria-pressed", "false")` (or `familyEntry`) |
| `page.locator('.collection-switcher [aria-pressed="true"]')` | `pressedEntry(page)` |
| `page.getByRole("button", { name: new RegExp(\`^${name} \\\\d\`) })` in the count loops | `collectionEntry` / `familyEntry` with `entryCount` / `familyCount` for the number |
| `page.locator("#all-directory-search").fill(x)` | `await searchAll(page, x)` |
| `page.locator("#all-directory-search")` (focus, `toHaveValue`) | `allSearch(page)` |
| `page.locator('[data-directory-collection="runtimes"]').click()` | `await openCollection(page, "runtimes")` |
| `page.locator('[data-directory-collection="robots"]')` in `robots.spec.js` | `collectionEntry(page, "robots")` |
| `page.getByRole("button", { name: /^All/ }).click()` in `robots.spec.js` | `await openCollection(page, "all")` |
| `expect(page.getByRole("button", { name: /^X / })).toBeVisible()` | `await expect(collectionEntry(page, "x")).toBeVisible()` |

For example, `directory-search.spec.js`'s family-count loop becomes:

```js
test("every family chip counts exactly the systems it lists", async ({ page }) => {
  await page.goto("/");
  // Memory goes first, so Systems has a family to clear.
  const steps = [["family", "memory_system"], ["collection", "systems"], ["family", "agent_system"], ["family", "assistant_system"]];
  for (const [kind, id] of steps) {
    const entry = kind === "family" ? familyEntry(page, id) : collectionEntry(page, id);
    const count = kind === "family" ? await familyCount(page, id) : await entryCount(page, id);
    await entry.click();
    await expect(page.locator("#result-count")).toContainText(new RegExp(`^${count} projects?\\b`));
    await expect(pressedEntry(page)).toHaveCount(1);
    await expect(entry).toHaveAttribute("aria-pressed", "true");
  }
});
```

- [ ] **Step 3: Run the moved specs**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/badge-legend.spec.js tests/e2e/card-badges.spec.js tests/e2e/card-click.spec.js tests/e2e/card-stars.spec.js tests/e2e/deferred-data.spec.js tests/e2e/directory-search.spec.js tests/e2e/page-health.spec.js tests/e2e/record-links.spec.js tests/e2e/robots.spec.js tests/e2e/url-state.spec.js`
Expected: all pass. Rerun the grep from Step 2 and expect no hits outside `tests/e2e/helpers/landing.js`.

- [ ] **Step 4: Record the surface**

In `docs/WEB.md` "Change surfaces" add the row:

```markdown
| landing navigation in browser tests | `tests/e2e/helpers/landing.js`; no spec reaches a collection, a family, a view, or the mixed search by its own selector |
```

- [ ] **Step 5: Commit and open the PR**

```bash
git add tests/e2e/helpers/landing.js tests/e2e/*.spec.js docs/WEB.md
git commit -m "Reach the landing page through one e2e helper"
gh pr create --title "Reach the landing page through one e2e helper" --body "Front-door Phase 2, task 1 of 6: tests/e2e/helpers/landing.js is now the only place browser tests name a collection, a family, a view, the pressed entry, or the mixed search, so the next tasks change the markup once. No markup change."
```

---

### Task 2: The collection registry and the `recent` ids

**Files:**
- Modify: `web/app-core.js` (after `switcherCounts`; export the new names)
- Modify: `tests/test_web.js` (import and tests)
- Modify: `scripts/build_web_payload.py` (`recent_record_ids`, the envelope)
- Modify: `tests/test_web_payload.py`
- Regenerate: `web/app/*.json` (`uv run python scripts/build_web_payload.py`)

**Interfaces:**
- Consumes: `directoryDefaults()`, `packShapedSystems(projects, filters)`, `CARD_BADGES`, `SCOPE_URL_KEYS` (all existing in `app-core.js`).
- Produces (all exported from `AtlasCore`):
  - `COLLECTIONS`: ordered array of `{ id, name, short, kind: "scope" | "view", emblem: string | null, field: string | null, facet: string | null }`.
  - `FAMILY_SHORT_NAMES`: `{ memory_system: "Memory", agent_system: "Agents", assistant_system: "Assistants" }`.
  - `collectionEntries(id, payloads)` → the records the collection's default view lists. `payloads` is `{ projects, services, runtimes, models, packs, robots, labs, specifications }` (arrays, each optional).
  - `collectionCount(id, payloads)` → `{ count: number, note: string }`.
  - `collectionCategories(id, payloads, limit = 4)` → `[{ key, value, count, label }]`, largest first.
  - `collectionState(id, { comparisonKind, finderRoles })` → `"compare" | "finder" | null`.
  - `directoryStageFromURL(params)` → `"door" | "results"`.
  - Payload envelopes gain `recent: [id, id, id]`.

- [ ] **Step 1: Write the failing unit tests**

Add `COLLECTIONS, FAMILY_SHORT_NAMES, collectionCategories, collectionCount, collectionEntries, collectionState, directoryStageFromURL` to the destructured `require("../web/app-core.js")` at the top of `tests/test_web.js`, then append:

```js
const registryPayloads = {
  projects: [
    { id: "m1", name: "M1", system_family: "memory_system", status: "active", deployment: [] },
    { id: "m2", name: "M2", system_family: "memory_system", status: "archived", deployment: [] },
    { id: "a1", name: "A1", system_family: "agent_system", status: "active", deployment: ["host_pack"] },
    { id: "a2", name: "A2", system_family: "agent_system", status: "active", deployment: [] },
    { id: "s1", name: "S1", system_family: "assistant_system", status: "active", deployment: [] },
  ],
  services: [
    { id: "i1", name: "I1", service_type: "direct_model_api" },
    { id: "i2", name: "I2", service_type: "direct_model_api" },
    { id: "i3", name: "I3", service_type: "routing_aggregator" },
  ],
  runtimes: [{ id: "r1", name: "R1", runtime_type: "desktop_runner" }],
  models: [
    { id: "x1", name: "X1", review_status: "reviewed", model_type: "language_model" },
    { id: "x2", name: "X2", review_status: "reviewed", model_type: "multimodal_language_model" },
    { id: "x3", name: "X3", review_status: "imported" },
  ],
  packs: [{ id: "p1", name: "P1", pack_type: "skills_bundle" }],
  robots: [{ id: "b1", name: "B1", form_factor: "humanoid" }, { id: "b2", name: "B2", form_factor: "quadruped" }],
  labs: [{ id: "l1", name: "L1", lab_type: "ai_company" }],
  specifications: [{ id: "sp1", name: "SP1", specification_type: "protocol" }],
};

test("the registry lists every collection once, scopes and sibling views alike, in front-door order", () => {
  assert.deepEqual(COLLECTIONS.map(entry => entry.id), ["all", "systems", "models", "inference", "runtimes", "packs", "robots", "labs", "specifications"]);
  assert.deepEqual(COLLECTIONS.filter(entry => entry.kind === "view").map(entry => entry.id), ["models", "labs", "specifications"]);
  // Every emblem names a type badge that exists; All and Robots have none yet.
  for (const entry of COLLECTIONS) {
    if (entry.emblem === null) assert.ok(["all", "robots"].includes(entry.id));
    else assert.equal(CARD_BADGES[entry.emblem].family, "type", entry.id);
  }
  assert.equal(COLLECTIONS.find(entry => entry.id === "systems").emblem, "memory-system");
});

test("each collection counts what its default view lists, with its split", () => {
  assert.deepEqual(collectionCount("all", registryPayloads), { count: 5 + 3 + 1 + 3 + 1 + 2, note: "A–Z, no scores" });
  assert.deepEqual(collectionCount("systems", registryPayloads), { count: 4, note: "active" });
  assert.deepEqual(collectionCount("models", registryPayloads), { count: 3, note: "2 reviewed · 1 imported" });
  assert.deepEqual(collectionCount("packs", registryPayloads), { count: 2, note: "1 pack · 1 host-installed" });
  assert.deepEqual(collectionCount("inference", registryPayloads), { count: 3, note: "" });
  assert.deepEqual(collectionCount("robots", registryPayloads), { count: 2, note: "" });
  assert.deepEqual(collectionCount("labs", registryPayloads), { count: 1, note: "" });
  assert.deepEqual(collectionCount("specifications", registryPayloads), { count: 1, note: "" });
  assert.deepEqual(collectionCount("robots", { ...registryPayloads, robots: [] }), { count: 0, note: "" });
});

test("a collection's categories are its largest values with the facet that opens them", () => {
  assert.deepEqual(collectionCategories("systems", registryPayloads), [
    { key: "family", value: "agent_system", count: 2, label: "Agents" },
    { key: "family", value: "memory_system", count: 1, label: "Memory" },
    { key: "family", value: "assistant_system", count: 1, label: "Assistants" },
  ]);
  assert.deepEqual(collectionCategories("inference", registryPayloads), [
    { key: "type", value: "direct_model_api", count: 2, label: "Direct model API" },
    { key: "type", value: "routing_aggregator", count: 1, label: "Routing aggregator" },
  ]);
  // Imported rows carry no model type, so only reviewed rows are tallied.
  assert.deepEqual(collectionCategories("models", registryPayloads).map(category => category.value), ["language_model", "multimodal_language_model"]);
  // Robots have no type badge yet, so the value is humanised.
  assert.deepEqual(collectionCategories("robots", registryPayloads).map(category => category.label), ["Humanoid", "Quadruped"]);
  assert.deepEqual(collectionCategories("robots", registryPayloads)[0].key, "formFactor");
  assert.deepEqual(collectionCategories("all", registryPayloads), []);
  assert.equal(collectionCategories("inference", registryPayloads, 1).length, 1);
});

test("a state dot names the collection a comparison or a Finder role set belongs to", () => {
  assert.equal(collectionState("systems", { comparisonKind: "system", finderRoles: null }), "compare");
  assert.equal(collectionState("runtimes", { comparisonKind: "runtime", finderRoles: null }), "compare");
  assert.equal(collectionState("models", { comparisonKind: "model", finderRoles: null }), "compare");
  assert.equal(collectionState("systems", { comparisonKind: null, finderRoles: ["coding_agent", "coding_agent_workflow"] }), "finder");
  assert.equal(collectionState("systems", { comparisonKind: "system", finderRoles: ["coding_agent"] }), "compare");
  assert.equal(collectionState("inference", { comparisonKind: "system", finderRoles: ["coding_agent"] }), null);
  assert.equal(collectionState("packs", {}), null);
});

test("a bare URL is the front door; a collection, a filter, a comparison, or a record is results", () => {
  const stage = query => directoryStageFromURL(new URLSearchParams(query));
  assert.equal(stage(""), "door");
  assert.equal(stage("view=directory"), "door");
  assert.equal(stage("collection=all"), "results");
  assert.equal(stage("collection=systems&family=memory_system"), "results");
  assert.equal(stage("q=ollama"), "results");
  assert.equal(stage("compare=system:aider,kilo-code"), "results");
  assert.equal(stage("record=system:aider"), "results");
  assert.equal(stage("view=finder"), "results");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: the five new tests fail with `TypeError: ... is not a function` or `COLLECTIONS is undefined`.

- [ ] **Step 3: Implement the registry in `web/app-core.js`**

Directly after `switcherCounts`:

```js
  // The collections the Directory offers, in the order the front door's index
  // and the results strip list them (Phase 2 spec, section 2). A `scope`
  // entry is a Directory collection; a `view` entry opens its sibling view
  // (ADR 008, ADR 013, ADR 041). `emblem` names the card badge whose emblem
  // the entry shows: the family's own type badge for a system family, else
  // the collection's first type badge in CARD_BADGES order. All shows the
  // type family's empty frame, and Robots shows none until its form_factor
  // type badge exists (ADR 037). `field` is what the tile's categories
  // tally; `facet` is the URL key that opens the scope narrowed to one.
  const FAMILY_SHORT_NAMES = { memory_system: "Memory", agent_system: "Agents", assistant_system: "Assistants" };
  const COLLECTIONS = [
    { id: "all", name: "Everything", short: "All", kind: "scope", emblem: null, field: null, facet: null },
    { id: "systems", name: "Systems", short: "Systems", kind: "scope", emblem: "memory-system", field: "system_family", facet: "family" },
    { id: "models", name: "Models", short: "Models", kind: "view", emblem: "language-model", field: "model_type", facet: "type" },
    { id: "inference", name: "Inference services", short: "Services", kind: "scope", emblem: "direct-model-api", field: "service_type", facet: "type" },
    { id: "runtimes", name: "Local runtimes", short: "Runtimes", kind: "scope", emblem: "desktop-runner", field: "runtime_type", facet: "type" },
    { id: "packs", name: "Agent packs", short: "Packs", kind: "scope", emblem: "skills-bundle", field: "pack_type", facet: "type" },
    { id: "robots", name: "Robots", short: "Robots", kind: "scope", emblem: null, field: "form_factor", facet: "formFactor" },
    { id: "labs", name: "Labs", short: "Labs", kind: "view", emblem: "ai-company", field: "lab_type", facet: "type" },
    { id: "specifications", name: "Specifications", short: "Specs", kind: "view", emblem: "protocol", field: "specification_type", facet: "type" },
  ];

  // What a collection's default view lists: the same records switcherCounts
  // counted, so a tile and a strip entry never disagree with the grid.
  function collectionEntries(id, payloads = {}) {
    const { projects = [], services = [], runtimes = [], models = [], packs = [], robots = [], labs = [], specifications = [] } = payloads;
    const { status } = directoryDefaults();
    const listed = projects.filter(project => !status || project.status === status);
    if (id === "all") return [...projects, ...services, ...runtimes, ...models, ...packs, ...robots];
    if (id === "systems") return listed;
    if (id === "models") return models;
    if (id === "inference") return services;
    if (id === "runtimes") return runtimes;
    if (id === "packs") return [...packs, ...packShapedSystems(projects, {})];
    if (id === "robots") return robots;
    if (id === "labs") return labs;
    if (id === "specifications") return specifications;
    return [];
  }

  // The count beside a name, and the split where the collection has one:
  // Models reviewed against imported (ADR 027), Agent packs packs against
  // host-installed systems (ADR 035), Systems active, All unscored A–Z.
  function collectionCount(id, payloads = {}) {
    const count = collectionEntries(id, payloads).length;
    if (id === "all") return { count, note: "A–Z, no scores" };
    if (id === "systems") return { count, note: "active" };
    if (id === "models") {
      const reviewed = (payloads.models || []).filter(model => model.review_status === "reviewed").length;
      return { count, note: `${reviewed} reviewed · ${count - reviewed} imported` };
    }
    if (id === "packs") {
      const packs = (payloads.packs || []).length;
      return { count, note: `${packs} ${packs === 1 ? "pack" : "packs"} · ${count - packs} host-installed` };
    }
    return { count, note: "" };
  }

  function humanize(value) {
    return String(value).replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
  }

  // A value's reader-facing name is its type badge's name; every type value
  // has one (docs/WEB.md "Card badges"), except Robots' form factors so far.
  function typeName(field, value) {
    const badge = Object.values(CARD_BADGES).find(entry => entry.family === "type" && entry.test && entry.test.field === field && entry.test.equals === value);
    return badge ? badge.name : humanize(value);
  }

  // A collection's largest categories, at most `limit`, each with the facet
  // key and value that opens the scope narrowed to it. Records without the
  // field (imported model rows, host-installed systems) are not tallied.
  function collectionCategories(id, payloads = {}, limit = 4) {
    const collection = COLLECTIONS.find(entry => entry.id === id);
    if (!collection || !collection.field) return [];
    const tally = new Map();
    for (const record of collectionEntries(id, payloads)) {
      const value = record[collection.field];
      if (value === undefined || value === null) continue;
      tally.set(value, (tally.get(value) || 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([value, count]) => ({
        key: collection.facet,
        value,
        count,
        label: id === "systems" ? FAMILY_SHORT_NAMES[value] || humanize(value) : typeName(collection.field, value),
      }));
  }

  // Which collection a comparison belongs to, by the comparison's kind.
  const COMPARISON_COLLECTIONS = { system: "systems", inference: "inference", runtime: "runtimes", model: "models" };

  // The state dot on a collection's entry: a comparison in progress there,
  // or the Finder's role set applied to Systems. A comparison wins.
  function collectionState(id, { comparisonKind = null, finderRoles = null } = {}) {
    if (COMPARISON_COLLECTIONS[comparisonKind] === id) return "compare";
    if (id === "systems" && finderRoles) return "finder";
    return null;
  }

  // A bare Directory URL is the front door; anything that names a scope, a
  // filter, a comparison, or a record is results (front-door spec, "URL
  // state and history"). Other views are never the door.
  function directoryStageFromURL(params) {
    const view = params.get("view");
    if (view && view !== "directory") return "results";
    if (params.has("collection") || params.has("compare") || params.has("record")) return "results";
    return SCOPE_URL_KEYS.some(key => params.has(key)) ? "results" : "door";
  }
```

`SCOPE_URL_KEYS` is declared later in the file than `switcherCounts`; `directoryStageFromURL` reads it at call time, so the order is fine. Add to the returned object, in alphabetical position: `COLLECTIONS`, `COMPARISON_COLLECTIONS`, `FAMILY_SHORT_NAMES`, `collectionCategories`, `collectionCount`, `collectionEntries`, `collectionState`, `directoryStageFromURL`.

- [ ] **Step 4: Run the unit tests**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS, including the existing `switcherCounts` and `activeSwitcherIndex` tests (they go in Task 4).

- [ ] **Step 5: Write the failing payload test**

Append to `WebPayloadTests` in `tests/test_web_payload.py`:

```python
    def test_every_boot_payload_names_its_three_most_recently_reviewed_records(self) -> None:
        """Tiles show the three records reviewed last, ties broken by name (Phase 2 spec, section 3)."""
        for collection, name, key, _ in COLLECTIONS:
            payload = json.loads(self.payloads[f"app/{collection}.json"])
            records = self.catalog[name][key]
            by_name = sorted(records, key=lambda record: record["name"])
            newest_first = sorted(by_name, key=lambda record: record["verified_at"], reverse=True)
            self.assertEqual(payload["recent"], [record["id"] for record in newest_first[:3]], collection)
            self.assertTrue(set(payload["recent"]) <= {record["id"] for record in payload[collection]}, collection)

    def test_recent_record_ids_orders_by_review_date_then_name(self) -> None:
        records = [
            {"id": "b", "name": "Beta", "verified_at": "2026-09-01"},
            {"id": "a", "name": "Alpha", "verified_at": "2026-09-01"},
            {"id": "c", "name": "Gamma", "verified_at": "2026-09-20"},
            {"id": "d", "name": "Delta", "verified_at": "2026-08-01"},
            {"id": "e", "name": "Epsilon"},
        ]
        self.assertEqual(build_web_payload.recent_record_ids(records), ["c", "a", "b"])
        self.assertEqual(build_web_payload.recent_record_ids(records, limit=1), ["c"])
        self.assertEqual(build_web_payload.recent_record_ids([]), [])
```

ISO dates sort correctly as strings, and Python's sort is stable, so sorting by name and then by date descending gives newest first with names A–Z inside one date.

- [ ] **Step 6: Run the payload tests to verify they fail**

Run: `uv run python -m pytest tests/test_web_payload.py -q -k recent`
Expected: FAIL with `AttributeError: module ... has no attribute 'recent_record_ids'`.

- [ ] **Step 7: Implement `recent` in `scripts/build_web_payload.py`**

Above `dumps`:

```python
RECENT_LIMIT = 3


def recent_record_ids(records: list[dict], limit: int = RECENT_LIMIT) -> list[str]:
    """The ids of the records reviewed most recently, ties broken by name.

    A tile shows these as marks (Phase 2 spec, section 3). A review date is
    not a ranking, so the rule never touches a score. Records without
    ``verified_at`` are left out.
    """
    dated = [record for record in records if record.get("verified_at")]
    by_name = sorted(dated, key=lambda record: record["name"])
    newest_first = sorted(by_name, key=lambda record: record["verified_at"], reverse=True)
    return [record["id"] for record in newest_first[:limit]]
```

Python's sort is stable, so sorting by name and then by date descending gives newest first with names A–Z inside one date. In `build_payloads`, after `envelope = {...}` and before the `if collection == "models":` block:

```python
        envelope["recent"] = recent_record_ids(document[key])
```

`document[key]` is the published collection: for Models that is the reviewed records only, which is what carries `verified_at`.

- [ ] **Step 8: Regenerate and run the payload tests**

Run:

```bash
uv run python scripts/build_web_payload.py
uv run python scripts/build_web_payload.py --check
uv run python -m pytest tests/test_web_payload.py -q
```

Expected: PASS; `git status` shows nine `web/app/*.json` files changed and nothing under `web/app/detail/` or `web/app/search/`.

- [ ] **Step 9: Commit and open the PR**

```bash
git add web/app-core.js tests/test_web.js scripts/build_web_payload.py tests/test_web_payload.py web/app/*.json
/usr/local/bin/node scripts/build_asset_version.mjs && git add web/index.html web/blog
git commit -m "Add the collection registry and each payload's recent ids"
gh pr create --title "Add the collection registry and each payload's recent ids" --body "Front-door Phase 2, task 2 of 6: AtlasCore.COLLECTIONS with counts, splits, categories, state, and the front-door stage rule, all pure and unit-tested; each app payload envelope gains recent, the three most recently reviewed ids. Nothing on the page changes yet."
```

---

### Task 3: The front door

The hero, the atlas map, the hero action, and the switcher go. The Directory opens on the front door: headline, sentence, one search, five Finder jobs, and the index of tiles. Choosing a tile lands in results (the existing panels) and pushes one history entry. This task leaves the old strip's job to Task 4, so between the two, results have no collection navigation of their own; Task 4 follows in the same day.

**Files:**
- Modify: `web/index.html` (the `#directory` section's head)
- Modify: `web/app.js` (`state`, `bootstrap`, `renderStats`, `writeDirectoryURL`, `activeScope`, `setDirectoryCollection`, `syncBadgeLegend`, `SEARCH_SCOPES`, `bindEvents`; new functions)
- Modify: `web/styles.css`
- Modify: `tests/e2e/helpers/landing.js`, `tests/e2e/directory-search.spec.js`, `tests/e2e/card-badges.spec.js`, plus any spec whose `page.goto("/")` expects cards
- Create: `tests/e2e/front-door.spec.js`
- Modify: `docs/WEB.md` ("Content hierarchy", verification step 18)

**Interfaces:**
- Consumes: `AtlasCore.COLLECTIONS`, `collectionCount`, `collectionCategories`, `collectionState`, `directoryStageFromURL`, `badgeEmblem`, `familyEmblem` (Task 2); `cardMark`, `paintMarks`, `jumpToDirectoryFamily`, `setDirectoryCollection`, `activateView`, `renderFinder`, `FINDER_DIRECTIONS`, `FINDER_GOALS`, `SCOPE_CONTROLS` (existing).
- Produces:
  - `state.directoryStage`: `"door" | "results"`; `state.recent`: `{ [collectionId]: string[] }`.
  - `showFrontDoor({ updateURL = true })`, `showResults()`, `leaveFrontDoor()`.
  - `openCollection(id, { facet: { key, value } | null })`: the one entry point from a tile or a strip entry.
  - `renderCollectionIndex()`, `renderDoorJobs()`, `openFinderAtJob(direction, goal)`.
  - Markup: `#front-door`, `#door-search`, `#door-jobs`, `#collection-index` with `[data-tile="<id>"] .tile-open` and `[data-facet-key][data-facet-value]` category buttons; `#scope-strip` (empty, hidden, filled in Task 4).

- [ ] **Step 1: Write the failing browser tests**

Create `tests/e2e/front-door.spec.js`:

```js
const { test, expect } = require("@playwright/test");
const { allSearch, collectionEntry, familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const counts = require("./helpers/catalog-counts");

test("a bare URL opens the front door with every collection above the fold", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#front-door")).toBeVisible();
    await expect(page.locator(".collection-panel:not([hidden])")).toHaveCount(0);
    await expect(page).not.toHaveURL(/collection=/);
    const index = page.locator("#collection-index");
    const top = await index.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
    expect(top, `${width}: the index starts above the fold`).toBeLessThan(height);
    await expect(page.locator("[data-tile]")).toHaveCount(9);
    await expect(page.locator(".atlas-map")).toHaveCount(0);
  }
});

test("every tile counts what its collection lists, with the Models and packs splits", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-tile="systems"] .tile-count strong')).toHaveText(String(counts.projectsWithStatus("active")));
  await expect(page.locator('[data-tile="all"] .tile-count strong')).toHaveText(String(counts.allDirectoryEntries));
  await expect(page.locator('[data-tile="models"] .tile-count')).toContainText(`${counts.reviewedModels.length} reviewed`);
  await expect(page.locator('[data-tile="packs"] .tile-count')).toContainText(`${counts.packs.length} packs`);
  await expect(page.locator('[data-tile="labs"] .tile-count strong')).toHaveText(String(counts.labs.length));
  await expect(page.locator('[data-tile="robots"] .tile-count strong')).toHaveText(String(counts.robots.length));
});

test("a tile opens its collection in results and Back returns to the front door", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "inference");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(page).toHaveURL(/collection=inference/);
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/collection=/);
});

test("the Everything tile is the A–Z list, and the Models, Labs, and Specifications tiles open their views", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "all");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=all/);
  for (const [id, view] of [["models", "#models"], ["labs", "#labs"], ["specifications", "#specifications"]]) {
    await page.goto("/");
    await page.locator(`[data-tile="${id}"] .tile-open`).click();
    await expect(page.locator(view)).toHaveClass(/is-active/);
    await expect(page).toHaveURL(new RegExp(`view=${id}`));
  }
});

test("a category link opens the scope narrowed to it", async ({ page }) => {
  await page.goto("/");
  await familyEntry(page, "memory_system").click();
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
  await expect(page).toHaveURL(/family=memory_system/);
  await page.goto("/");
  await page.locator('[data-tile="inference"] [data-facet-value="direct_model_api"]').click();
  await expect(page.locator("#inference-type-filter")).toHaveValue("direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.goto("/");
  await page.locator('[data-tile="labs"] [data-facet-value="ai_company"]').click();
  await expect(page.locator("#labs")).toHaveClass(/is-active/);
  await expect(page.locator("#lab-type-filter")).toHaveValue("ai_company");
});

test("typing on the front door searches everything and lands in results", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page.locator("#all-directory-search")).toBeFocused();
  await expect(page).toHaveURL(/q=Ollama/);
  await expect(page.locator("#all-directory-grid .project-card").first()).toContainText("Ollama");
});

test("a Finder job opens the Finder at its priority question", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#door-jobs button")).toHaveCount(5);
  await page.locator('#door-jobs [data-door-direction="agent_system"]').click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
});

test("tiles carry the three most recently reviewed marks and no example ranking", async ({ page }) => {
  await page.goto("/");
  const marks = page.locator('[data-tile="inference"] .tile-marks .card-mark');
  await expect(marks).toHaveCount(3);
  // logos.json lands after first paint and fills each mark that has an icon.
  await expect.poll(async () => page.locator('[data-tile="systems"] .tile-marks .card-mark svg').count()).toBeGreaterThan(0);
});

test("the Directory tab and the brand mark return to the front door", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await page.locator('.tab[data-tab="directory"]').click();
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/collection=/);
  await page.goto("/?collection=runtimes");
  await page.locator(".brand-link").click();
  await expect(page.locator("#front-door")).toBeVisible();
});
```

`catalog-counts.js` must export `reviewedModels`, `packs`, `labs`, `robots`, `projectsWithStatus`, and `allDirectoryEntries`; read its `module.exports` and add any of these it does not yet export.

- [ ] **Step 2: Run the new spec to verify it fails**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/front-door.spec.js`
Expected: every test fails on `#front-door` not found.

- [ ] **Step 3: Replace the hero and the switcher in `web/index.html`**

Delete from `<div class="hero">` through the closing `</nav>` of `.collection-switcher` inside `<section id="directory">`, and put in their place:

```html
      <div id="front-door" class="front-door">
        <div class="front-door-copy">
          <p class="eyebrow" id="hero-kicker">Systems, source models, services, and runtimes</p>
          <h1 id="directory-title" tabindex="-1">Find the AI layer <span>that fits.</span></h1>
          <p class="hero-copy">Reviewed AI systems, models, inference services, local runtimes, agent packs, and robots, each with its terms and evidence. Look up a name, start from a job, or open a collection.</p>
        </div>
        <label class="search-field door-search"><span>Search</span><input id="door-search" type="search" placeholder="Search everything in the Atlas" autocomplete="off"></label>
        <nav class="door-jobs" aria-label="Start from a job">
          <p class="door-jobs-label">Start from a job</p>
          <ul id="door-jobs" role="list"></ul>
        </nav>
        <nav id="collection-index" class="collection-index" aria-label="Collections"></nav>
      </div>
      <nav id="scope-strip" class="scope-strip" aria-label="Directory collections" hidden></nav>
```

If Phase 1 gave `#directory-title` `tabindex="-1"`, keep it as above. The `#hero-kicker` id stays because `renderStats` writes the live count line into it.

- [ ] **Step 4: Add the state, the door, and the tiles to `web/app.js`**

In `state`, after `directoryCollection: "all",` add `directoryStage: "door", recent: {},`.

In `bootstrap`, after `state.robots = robots.robots;` add:

```js
  state.recent = { systems: systems.recent || [], inference: inference.recent || [], runtimes: runtimes.recent || [], specifications: specifications.recent || [], models: models.recent || [], packs: packs.recent || [], labs: labs.recent || [], robots: robots.recent || [] };
```

Replace the boot lines

```js
  if (!restoreComparisonFromURL()) {
    setDirectoryCollection(new URL(window.location.href).searchParams.get("collection") || "all", { updateURL: false });
  }
```

with

```js
  const bootParams = new URL(window.location.href).searchParams;
  if (!restoreComparisonFromURL()) {
    if (AtlasCore.directoryStageFromURL(bootParams) === "door") showFrontDoor({ updateURL: false });
    else setDirectoryCollection(bootParams.get("collection") || "all", { updateURL: false });
  }
```

and add `renderDoorJobs();` next to `renderFinder();` in the boot render list. Keep everything Phase 1 added to `bootstrap` around these lines.

In `renderStats`, delete every line that writes a `*-collection-count` element and the Robots `hidden` line; keep the `#hero-kicker` line. It becomes:

```js
function renderStats() {
  const { count } = AtlasCore.collectionCount("all", collectionPayloads());
  $("#hero-kicker").textContent = `${count} systems, source models, services, runtimes, packs, and robots`;
}
```

Delete `syncCollectionSwitcher` and its two call sites (`setDirectoryCollection` and the `#family-filter` input handler); Task 4 puts `renderScopeStrip()` in both places. Add, after `renderStats`:

```js
// Every registry function reads the boot payloads in this shape.
function collectionPayloads() {
  return {
    projects: state.projects, services: state.inferenceServices, runtimes: state.localRuntimes, models: state.models,
    packs: state.packs, robots: state.robots, labs: state.labs, specifications: state.specifications,
  };
}

function collectionEmblem(entry) {
  if (entry.id === "all") return AtlasCore.familyEmblem("type");
  return entry.emblem ? AtlasCore.badgeEmblem(entry.emblem) : "";
}

function collectionStateFor(id) {
  return AtlasCore.collectionState(id, {
    comparisonKind: state.comparison.ids.length ? state.comparison.kind : null,
    finderRoles: state.directoryRoles,
  });
}

// A state dot is decoration with a hidden label, so the entry's accessible
// name still starts with the collection's name and count.
function stateDot(kind) {
  if (kind === "compare") return '<span class="state-dot is-compare" title="A comparison is in progress here"><span class="visually-hidden">A comparison is in progress here</span></span>';
  if (kind === "finder") return '<span class="state-dot is-finder" title="Finder roles applied"><span class="visually-hidden">Finder roles applied</span></span>';
  return "";
}

// The three records the payload names as reviewed most recently, painted the
// way a card's mark is: an icon once logos.json lands, a monogram until then.
function tileMarks(id) {
  const records = (state.recent[id] || [])
    .map(recordId => AtlasCore.collectionEntries(id, collectionPayloads()).find(record => record.id === recordId))
    .filter(Boolean);
  if (!records.length) return "";
  return `<span class="tile-marks" aria-hidden="true">${records.map(cardMark).join("")}</span>`;
}

// The index: one tile per registry entry, hidden while its collection is
// empty (the Robots rule from ADR 037, now general). A tile carries emblem,
// name, count with its split, the largest categories as links, three marks,
// and a state dot. It carries no definition; those stay in Taxonomy.
function renderCollectionIndex() {
  const payloads = collectionPayloads();
  $("#collection-index").innerHTML = AtlasCore.COLLECTIONS.map(entry => {
    const { count, note } = AtlasCore.collectionCount(entry.id, payloads);
    if (count === 0 && entry.id !== "all") return "";
    const categories = AtlasCore.collectionCategories(entry.id, payloads);
    const categoryList = categories.length
      ? `<ul class="tile-categories" role="list">${categories.map(category => `<li><button type="button" class="tile-category" data-open-collection="${escapeHTML(entry.id)}" data-facet-key="${escapeHTML(category.key)}" data-facet-value="${escapeHTML(category.value)}">${escapeHTML(category.label)} <strong>${category.count}</strong></button></li>`).join("")}</ul>`
      : "";
    return `<article class="tile${entry.id === "all" ? " tile-wide" : ""}" data-tile="${escapeHTML(entry.id)}">
      <button type="button" class="tile-open" data-open-collection="${escapeHTML(entry.id)}">${collectionEmblem(entry)}<span class="tile-name">${escapeHTML(entry.name)}</span><span class="tile-count"><strong>${count}</strong>${note ? `<small>${escapeHTML(note)}</small>` : ""}</span></button>
      ${categoryList}${tileMarks(entry.id)}${stateDot(collectionStateFor(entry.id))}
    </article>`;
  }).join("");
}

// The front door's Finder jobs: the first goal of each direction, opened at
// the Finder's priority question with that direction and goal answered.
function renderDoorJobs() {
  $("#door-jobs").innerHTML = FINDER_DIRECTIONS.map(direction => {
    const goal = FINDER_GOALS[direction.id][0];
    return `<li><button type="button" class="door-job" data-door-direction="${escapeHTML(direction.id)}" data-door-goal="${escapeHTML(goal.id)}">${escapeHTML(goal.label)}</button></li>`;
  }).join("");
}

function openFinderAtJob(direction, goal) {
  state.finder = { step: 2, answers: { direction, goal } };
  renderFinder();
  activateView("finder");
}

// Leaving the front door pushes one history entry, so Back returns to it;
// every change inside results keeps replacing (front-door spec, "URL state
// and history"). Pushing the current URL first, then replacing it with the
// new state, spends one history call, within WebKit's budget (writeURL).
function leaveFrontDoor() {
  if (state.directoryStage !== "door") return;
  try { window.history.pushState(null, "", window.location.href); } catch {}
  state.directoryStage = "results";
}

function showFrontDoor({ updateURL = true } = {}) {
  state.directoryStage = "door";
  $$(".collection-panel").forEach(panel => { panel.hidden = true; });
  $("#scope-strip").hidden = true;
  $("#front-door").hidden = false;
  renderCollectionIndex();
  syncBadgeLegend();
  if (updateURL) {
    writeDirectoryURL();
    writeScopeURL();
  }
}

function showResults() {
  state.directoryStage = "results";
  $("#front-door").hidden = true;
  $("#scope-strip").hidden = false;
}

// The one way a tile or a strip entry opens a collection. A `view` entry
// opens its sibling view; a scope entry lands in results. A facet narrows
// the scope to one category first; a family goes through
// jumpToDirectoryFamily so the role and Finder set are cleared as ever.
const VIEW_RENDERERS = { models: () => renderModels(), labs: () => renderLabs(), specifications: () => renderSpecifications() };
function openCollection(id, { facet = null } = {}) {
  const entry = AtlasCore.COLLECTIONS.find(item => item.id === id);
  if (!entry) return;
  leaveFrontDoor();
  if (entry.kind === "view") {
    if (facet) {
      $(SCOPE_CONTROLS[id][facet.key]).value = facet.value;
      state.page[id] = 1;
    }
    activateView(id);
    if (facet) VIEW_RENDERERS[id]();
    return;
  }
  if (id === "systems") {
    jumpToDirectoryFamily(facet && facet.key === "family" ? facet.value : "");
    return;
  }
  if (facet) {
    $(SCOPE_CONTROLS[id][facet.key]).value = facet.value;
    state.page[id] = 1;
  }
  setDirectoryCollection(id);
}
```

In `setDirectoryCollection`, right after `state.directoryCollection = selected;`, add `showResults();`. In `writeDirectoryURL`, replace the two `collection` lines with:

```js
  if (state.directoryStage === "door") url.searchParams.delete("collection");
  else url.searchParams.set("collection", state.directoryCollection);
```

so results in All write `collection=all` and only the door writes nothing. In `activeScope`, make the Directory branch `return state.directoryStage === "door" ? null : state.directoryCollection;`, so the door writes no scope parameter. In `syncBadgeLegend`, at the top of the function, add:

```js
  if ($("#directory").classList.contains("is-active") && state.directoryStage === "door") {
    $("#badge-legend").hidden = true;
    $("#badge-legend-chip").hidden = true;
    return;
  }
```

(read the function first: if it already computes a `hidden` decision, fold the door into that decision instead of an early return, so the Key chip's own rules stay intact; tell the badge session either way).

In `SEARCH_SCOPES` add `"#door-search": ["systems", "inference", "runtimes", "models", "packs", "robots"],` so focusing the door's search preloads the same indexes the All search does. In `bindEvents`:

- Replace the `.tab` binding with:

```js
  $$(".tab").forEach(button => button.addEventListener("click", () => {
    activateView(button.dataset.tab);
    if (button.dataset.tab === "directory") showFrontDoor();
  }));
```

- In the brand-link handler, after `activateView("directory");` add `showFrontDoor();`.
- Delete the `$$('[data-directory-collection]')` binding.
- Add, after `initBadgeLegend();`:

```js
  // The front door's search hands its text to the All search and lands in
  // results, so the first character is the search; the caret follows.
  $("#door-search").addEventListener("input", event => {
    const value = event.target.value;
    if (!value) return;
    event.target.value = "";
    $("#all-directory-search").value = value;
    state.page.all = 1;
    openCollection("all");
    const target = $("#all-directory-search");
    target.focus({ preventScroll: true });
    target.setSelectionRange(value.length, value.length);
  });
  document.addEventListener("click", event => {
    const category = event.target.closest("[data-facet-key]");
    if (category) {
      openCollection(category.dataset.openCollection, { facet: { key: category.dataset.facetKey, value: category.dataset.facetValue } });
      return;
    }
    const entry = event.target.closest("[data-open-collection]");
    if (entry) {
      openCollection(entry.dataset.openCollection);
      return;
    }
    const job = event.target.closest("[data-door-goal]");
    if (job) openFinderAtJob(job.dataset.doorDirection, job.dataset.doorGoal);
  });
```

Check that `setDirectoryCollection`'s All renderer reads the query from `#all-directory-search` (it does: `renderAllDirectoryEntries`), so no extra render call is needed after `openCollection("all")`. In `renderComparisonControls`, after the buttons are toggled, add `if (state.directoryStage === "door") renderCollectionIndex();` so a cleared comparison drops its dot on the door.

- [ ] **Step 5: Style the front door in `web/styles.css`**

Add `--radius-pill: 999px;` to `:root` next to `--radius-chip`. Delete the rules for `.hero`, `.hero-copy-block`, `.hero h1`, `.hero h1 span`, `.hero-action` (and its hover and span), `.atlas-map`, `.map-toolbar`, `.map-status`, `.map-field`, `.map-axis*`, `.map-node*`, `.map-*` positions, `.map-orbit`, `.orbit-*`, and `.collection-switcher*`, in both the base block and the `@media (max-width: 720px)` and `@media (max-width: 460px)` blocks (the `.atlas-map { display: none }` and `.hero { min-height }` lines). Keep `.hero-copy` and `.eyebrow`. Then add:

```css
.front-door { display: grid; gap: 1.4rem; padding-top: 1rem; }
.front-door-copy { max-width: 820px; }
.front-door h1 { max-width: 820px; font-size: clamp(2.6rem, 5vw, 4.6rem); }
.front-door h1 span { color: var(--cyan); }
.door-search { max-width: 820px; }
.door-jobs { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .6rem; }
.door-jobs-label { margin: 0; color: var(--muted); font: 500 .68rem var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
.door-jobs ul { display: contents; }
.door-job { padding: .45rem .8rem; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--glass-weak); color: var(--text); font: 500 .85rem var(--font-body); cursor: pointer; }
.door-job:hover { border-color: var(--cyan); color: var(--cyan); }
.collection-index { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .7rem; }
.tile { position: relative; display: grid; align-content: start; gap: .5rem; padding: .85rem .9rem 2.2rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.tile-wide { grid-column: span 2; }
.tile-open { display: grid; grid-template-columns: auto 1fr; gap: .25rem .55rem; align-items: center; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.tile-open .badge-emblem { grid-row: span 2; width: 1.7rem; height: 1.7rem; color: var(--slate-ink); }
.tile-name { font-weight: 600; }
.tile-count { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem; }
.tile-count strong { color: var(--cyan-bright); font: 700 1.05rem var(--font-mono); letter-spacing: -.02em; }
.tile-count small { color: var(--muted); font: .68rem var(--font-mono); }
.tile-categories { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0; padding: 0; list-style: none; }
.tile-category { padding: .15rem .5rem; border: 0; border-radius: var(--radius-pill); background: var(--chip-bg); color: var(--chip-ink); font: .7rem var(--font-body); cursor: pointer; }
.tile-category:hover { color: var(--cyan); }
.tile-category strong { font: 700 .62rem var(--font-mono); }
.tile-marks { position: absolute; right: .9rem; bottom: .8rem; display: flex; }
.tile-marks .card-mark { width: 24px; height: 24px; margin-left: -.35rem; border-radius: var(--radius-pill); background: var(--panel-2); }
.tile-marks .card-mark:first-child { margin-left: 0; }
.tile-marks .card-mark svg { width: 14px; height: 14px; }
.tile-marks .card-monogram { font-size: .62rem; }
.state-dot { position: absolute; right: .8rem; top: .8rem; width: .55rem; height: .55rem; border-radius: var(--radius-pill); background: var(--coral); box-shadow: 0 0 0 2px var(--panel); }
.state-dot.is-finder { background: var(--violet); }
```

and inside `@media (max-width: 720px)`:

```css
  .collection-index { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
  .tile { padding: .7rem .75rem 2rem; }
  .front-door h1 { font-size: clamp(2.2rem, 10vw, 3.2rem); }
```

Both palettes come from the tokens; check the dark theme once in the browser.

- [ ] **Step 6: Update the helper and the landing assertions**

In `tests/e2e/helpers/landing.js` change the internals only:

```js
function collectionEntry(page, id) {
  return page.locator(`#collection-index [data-tile="${id}"] .tile-open:visible, #scope-strip [data-open-collection="${id}"]:visible`);
}

function familyEntry(page, family) {
  return page.locator(`#collection-index [data-tile="systems"] [data-facet-value="${family}"]:visible, #scope-strip [data-family-entry="${family}"]:visible`);
}

function pressedEntry(page) {
  return page.locator('#scope-strip .scope-row [aria-pressed="true"]');
}

function pressedFamily(page) {
  return page.locator('#scope-strip .family-row [aria-pressed="true"]');
}

function allSearch(page) {
  return page.locator("#door-search:visible, #all-directory-search:visible");
}
```

`searchAll` stays `await allSearch(page).fill(text)`: on the door it fills `#door-search`, whose `input` handler carries the whole value into the All search. `countOf` stays: a tile's first `strong` is its count. A test that asserted a family was the pressed entry (for example `url-state.spec.js`'s reload case) now asserts `pressedFamily(page)` has that name and `pressedEntry(page)` reads `/^Systems /`; the family row itself arrives in Task 4, so land Tasks 3 and 4 in one PR if such a test cannot otherwise pass.

Then, in every spec, a test that starts at `page.goto("/")` and expects cards or a pressed entry without first opening a collection must open one: change `page.goto("/")` to `page.goto("/?collection=all")` where the test only needs the A–Z grid, or add `await openCollection(page, "all")` where it must start from the landing page. Find them with `grep -n 'goto("/")' tests/e2e/*.js` and run the suite; `directory-search.spec.js` line 7 (`All` pressed at load) becomes `await expect(page.locator("#front-door")).toBeVisible()`. Delete the "atlas orbital field" test from `directory-search.spec.js`. In `card-badges.spec.js`, the phone outside-tap target moves off the hero's `h1` to `.front-door-copy .hero-copy` when the test starts on the door, or to `.result-row` when it starts in a collection.

- [ ] **Step 7: Run the suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS after `--last-failed` reruns of boot-timeout flakes. `pressedEntry` has no element yet (Task 4), so any test that asserts it after this task's changes must wait for Task 4; there should be none left after Step 6 because the strip's assertions were on chips that no longer exist. If a test needs a pressed entry to pass, land Task 3 and Task 4 in one PR rather than weakening the test.

- [ ] **Step 8: Docs**

In `docs/WEB.md` "Content hierarchy", replace the first two bullets (the switcher bullet and the counts bullet) with:

```markdown
- The Directory opens on the front door: the headline, one supporting sentence, one search across every collection, the first Finder job of each direction as a link, and the index, one tile per collection from `AtlasCore.COLLECTIONS`. A tile carries the collection's emblem (its first type badge; the memory badge for Systems, the type family's empty frame for Everything, none for Robots until its form-factor badge exists), the count its default view lists with its split (Models: reviewed and imported; Agent packs: packs and host-installed systems; Systems: active), its largest categories as links that open the scope narrowed to one, the three records reviewed most recently as marks (ties by name), and a dot when a comparison is in progress there or the Finder's role set is applied. Tiles carry no definitions. An empty collection has no tile.
- Choosing a tile opens results; the Everything tile is the A–Z list (`collection=all`). Typing on the front door searches everything and lands in results with the caret in the All search.
```

Replace verification step 18 with: `18. open a bare URL at 1440×900 and 375×812 and confirm the front door shows every collection tile above the fold, that the Models tile shows reviewed and imported counts, and that no map or switcher renders; open a tile, press Back, and confirm the front door returns.`

- [ ] **Step 9: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/index.html web/app.js web/styles.css web/blog tests/e2e docs/WEB.md
git commit -m "Open the Directory on a front door of collection tiles"
gh pr create --title "Open the Directory on a front door of collection tiles" --body "Front-door Phase 2, task 3 of 6: the hero, the atlas map, and the switcher give way to the front door (headline, one search, five Finder jobs, one tile per collection with emblem, honest count, categories, marks, and state). Leaving the door pushes one history entry so Back returns to it. The results strip follows in task 4."
```

Message the badge session ("Badge design brainstorm") that the grid now starts under the front door or the scope strip rather than under the switcher, and that the Key chip and legend hide on the front door.

---

### Task 4: The scope strip and the family row

**Files:**
- Modify: `web/app.js` (`renderScopeStrip`, `renderFamilyRow`, `syncHeaderHeight`; call sites in `setDirectoryCollection`, the `#family-filter` handler, `renderComparisonControls`, the `#finder-roles-chip` handler, `bindEvents`)
- Modify: `web/app-core.js` (delete `switcherCounts` and `activeSwitcherIndex` and their exports)
- Modify: `tests/test_web.js` (delete their two tests and imports)
- Modify: `web/styles.css`
- Modify: `tests/e2e/front-door.spec.js`, `tests/e2e/helpers/landing.js` (no change expected; verify)
- Modify: `docs/WEB.md` ("Content hierarchy", steps 23, 24, 27), the Phase 2 spec (one sentence, see Step 4)

**Interfaces:**
- Consumes: everything Task 3 produced; `AtlasCore.FAMILY_SHORT_NAMES`, `collectionCategories`.
- Produces: `renderScopeStrip()`; markup `#scope-strip > .scope-row > button.scope-entry[data-open-collection][aria-pressed]`, `.scope-caption` (phone), `.family-row > button.family-entry[data-family-entry][aria-pressed]`; the `--header-height` custom property on `:root`.

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/front-door.spec.js`:

```js
test("results carry a sticky strip with exactly one pressed entry, families inside Systems", async ({ page }) => {
  await page.goto("/?collection=inference");
  const strip = page.locator("#scope-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator(".scope-row .scope-entry")).toHaveCount(9);
  await expect(pressedEntry(page)).toHaveCount(1);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Inference services \d/);
  await expect(strip.locator(".family-row")).toHaveCount(0);
  await expect(strip).toHaveCSS("position", "sticky");
  await openCollection(page, "systems");
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems \d/);
  await expect(strip.locator(".family-row .family-entry")).toHaveCount(4);
  await expect(strip.locator('.family-row [aria-pressed="true"]')).toHaveAccessibleName(/^All families \d/);
  await familyEntry(page, "memory_system").click();
  await expect(strip.locator('.family-row [aria-pressed="true"]')).toHaveAccessibleName(/^Memory \d/);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems \d/);
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
});

test("at phone widths the strip shows emblems only, fits with slack, and is the only sticky thing", async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/?collection=runtimes");
    const strip = page.locator("#scope-strip");
    const row = strip.locator(".scope-row");
    const [rowWidth, frame] = await row.evaluate(element => [element.scrollWidth, element.clientWidth]);
    expect(frame - rowWidth, `${width}: the row leaves at least 16 px`).toBeGreaterThanOrEqual(16);
    await expect(strip.locator(".scope-caption")).toHaveText(/^Local runtimes · \d+$/);
    const nameWidth = await strip.locator(".scope-entry").first().locator(".scope-name").evaluate(element => element.getBoundingClientRect().width);
    expect(nameWidth, `${width}: names are clipped, not shown`).toBeLessThanOrEqual(1);
    await expect(page.locator(".site-header")).toHaveCSS("position", "static");
    await expect(strip).toHaveCSS("position", "sticky");
    await expect(strip).toHaveCSS("top", "0px");
  }
});

test("above phone widths the strip sticks under the header", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=systems");
  const headerHeight = await page.locator(".site-header").evaluate(element => element.getBoundingClientRect().height);
  await expect(page.locator("#scope-strip")).toHaveCSS("top", `${headerHeight}px`);
  await page.mouse.wheel(0, 2000);
  // Wait for smooth scrolling to stop before measuring (html { scroll-behavior: smooth }).
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY, still = 0;
    const frame = () => requestAnimationFrame(() => { still = window.scrollY === last ? still + 1 : 0; last = window.scrollY; if (still >= 5) resolve(); else frame(); });
    frame();
  }));
  const [stripTop, headerBottom] = await page.evaluate(() => [
    document.querySelector("#scope-strip").getBoundingClientRect().top,
    document.querySelector(".site-header").getBoundingClientRect().bottom,
  ]);
  expect(Math.abs(stripTop - headerBottom)).toBeLessThan(2);
});

test("a state dot marks a comparison in progress and Finder roles applied", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:aider,kilo-code");
  await expect(page.locator('#scope-strip [data-open-collection="systems"] .state-dot.is-compare')).toHaveCount(1);
  await page.locator("#comparison-clear").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
  await page.goto("/?view=finder");
  for (const value of ["agent_system", "coding", "balanced"]) {
    await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  }
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator('#scope-strip [data-open-collection="systems"] .state-dot.is-finder')).toHaveCount(1);
  await page.locator("#finder-roles-chip").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
});

test("the Systems entry clears a family, and the strip's view entries open their views", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system");
  await openCollection(page, "systems");
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page).not.toHaveURL(/family=/);
  await page.locator('#scope-strip [data-open-collection="models"]').click();
  await expect(page.locator("#models")).toHaveClass(/is-active/);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/front-door.spec.js -g "strip|state dot|Systems entry"`
Expected: FAIL on `#scope-strip` empty.

- [ ] **Step 3: Render the strip in `web/app.js`**

After `showResults`:

```js
// The results strip: one entry per registry entry, the collection pressed
// and never a view. At phone widths the entries are emblems only and the
// pressed one's name and count read as a caption under the row (styles.css),
// so nine entries fit a 320 px phone with slack and nothing scrolls sideways.
// Inside Systems a second row lists the families, one pressed.
const FAMILY_ORDER = ["memory_system", "agent_system", "assistant_system"];
function renderScopeStrip() {
  const payloads = collectionPayloads();
  let caption = "";
  const entries = AtlasCore.COLLECTIONS.map(entry => {
    const { count } = AtlasCore.collectionCount(entry.id, payloads);
    if (count === 0 && entry.id !== "all") return "";
    const pressed = entry.kind === "scope" && entry.id === state.directoryCollection;
    if (pressed) caption = `${entry.name} · ${count}`;
    return `<button type="button" class="scope-entry${pressed ? " is-active" : ""}" data-open-collection="${escapeHTML(entry.id)}" aria-pressed="${pressed}" title="${escapeHTML(entry.name)}">${collectionEmblem(entry)}<span class="scope-name">${escapeHTML(entry.name)}</span><strong class="scope-count">${count}</strong>${stateDot(collectionStateFor(entry.id))}</button>`;
  }).join("");
  const familyRow = state.directoryCollection === "systems" ? renderFamilyRow(payloads) : "";
  $("#scope-strip").innerHTML = `<div class="scope-row">${entries}</div><p class="scope-caption" aria-hidden="true">${escapeHTML(caption)}</p>${familyRow}`;
}

function renderFamilyRow(payloads) {
  const current = $("#family-filter").value;
  const categories = AtlasCore.collectionCategories("systems", payloads);
  const total = AtlasCore.collectionCount("systems", payloads).count;
  const entry = (value, name, count) => `<button type="button" class="family-entry${value === current ? " is-active" : ""}" data-family-entry="${escapeHTML(value)}" aria-pressed="${value === current}">${escapeHTML(name)} <strong>${count}</strong></button>`;
  const families = FAMILY_ORDER.map(id => entry(id, AtlasCore.FAMILY_SHORT_NAMES[id], (categories.find(category => category.value === id) || { count: 0 }).count));
  return `<div class="family-row" role="group" aria-label="System families">${entry("", "All families", total)}${families.join("")}</div>`;
}

// The strip sticks under the header above phone widths, so the header's
// live height is a custom property the stylesheet reads.
function syncHeaderHeight() {
  const header = $(".site-header");
  if (header) document.documentElement.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
}
```

Call sites:

- In `setDirectoryCollection`, where `syncCollectionSwitcher()` was (after `showResults();`): `renderScopeStrip();`.
- In the `#family-filter` input handler, where `syncCollectionSwitcher()` was: `renderScopeStrip();`.
- In `renderComparisonControls`, next to the Task 3 line: `if (state.directoryStage === "results") renderScopeStrip();`.
- In the `#finder-roles-chip` click handler, after the roles are cleared and the grid re-rendered: `renderScopeStrip();`.
- In the delegated click handler from Task 3, before the `[data-open-collection]` branch:

```js
    const family = event.target.closest("[data-family-entry]");
    if (family) {
      jumpToDirectoryFamily(family.dataset.familyEntry);
      return;
    }
```

- In `bindEvents`, add `syncHeaderHeight(); window.addEventListener("resize", syncHeaderHeight);`. Also call `syncHeaderHeight()` at the end of `bootstrap`, after `loadMarks();`, because the header's fonts can settle after bind.

- [ ] **Step 4: Style the strip**

In `web/styles.css`, after the tile rules:

```css
.scope-strip { position: sticky; top: var(--header-height, 88px); z-index: 9; margin: 0 0 1rem; padding: .5rem 0 .4rem; border-bottom: 1px solid var(--line); background: var(--header-bg); backdrop-filter: blur(20px) saturate(140%); }
.scope-row { display: flex; flex-wrap: wrap; gap: .4rem; }
.scope-entry { position: relative; display: inline-flex; align-items: center; gap: .45rem; min-height: 40px; padding: .35rem .75rem .35rem .45rem; border: 1px solid transparent; border-radius: var(--radius-pill); background: transparent; color: var(--muted); font: 600 .84rem var(--font-body); cursor: pointer; }
.scope-entry .badge-emblem { width: 1.3rem; height: 1.3rem; color: var(--slate-ink); }
.scope-entry:hover { border-color: var(--line); color: var(--text); background: var(--glass); }
.scope-entry.is-active { border-color: var(--text); background: var(--text); color: var(--on-ink); box-shadow: var(--shadow-small); }
.scope-entry.is-active .badge-emblem { color: var(--on-ink); }
.scope-count { color: var(--cyan); font: 700 .68rem var(--font-mono); }
.scope-entry.is-active .scope-count { color: inherit; }
.scope-entry .state-dot { right: -.15rem; top: -.15rem; }
.scope-caption { display: none; margin: .35rem 0 0; color: var(--text); font: 600 .8rem var(--font-body); }
.family-row { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .45rem; }
.family-entry { padding: .25rem .6rem; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--glass-weak); color: var(--muted); font: 500 .78rem var(--font-body); cursor: pointer; }
.family-entry strong { font: 700 .62rem var(--font-mono); color: var(--cyan); }
.family-entry.is-active { border-color: var(--cyan); background: color-mix(in srgb, var(--cyan) 14%, transparent); color: var(--cyan); }
```

Inside `@media (max-width: 720px)`:

```css
  /* Only the strip is sticky on a phone: the header scrolls away, which
     closes the 185 px sticky-header leftover from Phase 0. Entries are
     emblems only; the pressed entry's name and count read as the caption. */
  .site-header { position: static; }
  .scope-strip { top: 0; padding: .4rem 0 .35rem; }
  .scope-row { flex-wrap: nowrap; gap: .2rem; }
  .scope-entry { min-height: 0; padding: .2rem; gap: 0; }
  .scope-entry .badge-emblem { width: 1.2rem; height: 1.2rem; }
  .scope-entry .scope-name { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .scope-entry .scope-count { display: none; }
  .scope-caption { display: block; }
```

The name stays in the accessible name (it is clipped, not hidden), so `/^Local runtimes \d/` keeps matching; the count is `display: none` on phones and does not, so the phone test above asserts the caption instead. If the 320 px assertion fails by a few pixels, reduce `.scope-entry` padding to `.15rem` before touching the emblem size.

- [ ] **Step 5: Retire the switcher functions**

In `web/app-core.js` delete `activeSwitcherIndex` and `switcherCounts` and their two export lines; in `tests/test_web.js` delete their imports and the two tests ("exactly one switcher chip is pressed…" and "each switcher chip counts…"). Run `/usr/local/bin/node --test tests/test_web.js` and `grep -rn 'switcherCounts\|activeSwitcherIndex\|collection-switcher\|data-directory-collection' web tests docs` and expect no hits outside `docs/superpowers/` and `docs/adr/`.

- [ ] **Step 6: Run the suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS.

- [ ] **Step 7: Docs and the spec's caption sentence**

`docs/WEB.md` "Content hierarchy": after the two Task 3 bullets add:

```markdown
- In results a sticky strip under the header lists every collection from the same registry, emblem, name, and count, with exactly one pressed (`aria-pressed`), never a sibling-view entry. At 720px and below the entries are emblems only, the pressed entry's name and count read as a caption under the row, the row never scrolls sideways (nine entries fit 320px with at least 16px measured slack), and only the strip is sticky, not the header. Inside Systems a second row lists All families, Memory, Agents, and Assistants with active counts, one pressed; the Systems entry clears the family, role, Finder roles, and comparison. A coral dot marks a comparison in progress in that collection, a violet dot the Finder's role set applied to Systems.
```

Reword verification step 23 to: `23. confirm the theme control and the GitHub icon sit on the brand row at desktop and tablet widths, that at phone widths the header scrolls away and only the scope strip is sticky, and that the GitHub icon carries an accessible name.` Step 24: keep, and add `; confirm the scope strip's nine entries fit at 320px with no horizontal scroll and the pressed entry's caption reads its name and count`. Step 27: replace "use the Models quick filter" with "open Models from its tile or strip entry".

In the Phase 2 spec, section 4, replace "every entry shows its emblem only, and the pressed entry unfolds to emblem, `short` name, and count" with "every entry shows its emblem only, and the pressed entry's name and count read as a caption under the row", and replace "Nine entries with the pressed one unfolded fit a 343 px frame" with "Nine emblem-only entries fit a 296 px frame (a 320 px phone)". The plan measured that an inline unfolded label does not fit nine entries at 375 px.

- [ ] **Step 8: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/app-core.js web/styles.css web/index.html web/blog tests docs/WEB.md docs/superpowers/specs/2026-09-27-front-door-phase-2-collection-navigation-design.md
git commit -m "Pin a scope strip under the header in Directory results"
gh pr create --title "Pin a scope strip under the header in Directory results" --body "Front-door Phase 2, task 4 of 6: results get a sticky strip of every collection with emblem, count, one pressed entry, state dots, and a family row inside Systems. Phones show emblems only with a caption, fit nine entries at 320px, and keep only the strip sticky. switcherCounts and activeSwitcherIndex retire."
```

---

### Task 5: One restore for boot and history

**Files:**
- Modify: `web/app-core.js` (`scopeFromURL`)
- Modify: `tests/test_web.js`
- Modify: `web/app.js` (`bootstrap`, `restoreFromURL`, `resetScopeControls`; delete `restoreViewFromURL`, `restoreRecordFromURL`, `syncRecordWithHistory`)
- Modify: `tests/e2e/front-door.spec.js`, `tests/e2e/url-state.spec.js`
- Modify: `docs/WEB.md` ("Behavioral contracts" URL bullet, "Change surfaces" two rows)

**Interfaces:**
- Consumes: `AtlasCore.COMPARISON_COLLECTIONS`, `directoryStageFromURL` (Task 2); `showFrontDoor`, `setDirectoryCollection`, `VIEW_RENDERERS` (Task 3); `syncMatchSort(scope)` (Phase 1); `restoreScopeFromURL`, `restoreComparisonFromURL`, `openRecord`, `closeRecordDialogs`, `loadRestoredSearch` (existing).
- Produces: `scopeFromURL(params)` with comparison and record precedence; `restoreFromURL({ boot })`; `resetScopeControls(scope)`.

- [ ] **Step 1: Write the failing unit test**

Append to `tests/test_web.js`:

```js
test("a comparison or a record names the scope before the collection parameter does", () => {
  const scope = query => scopeFromURL(new URLSearchParams(query));
  assert.equal(scope(""), "all");
  assert.equal(scope("collection=systems"), "systems");
  assert.equal(scope("collection=systems&compare=inference:a,b"), "inference");
  assert.equal(scope("compare=model:a,b"), "models");
  assert.equal(scope("record=runtime:ollama"), "runtimes");
  assert.equal(scope("collection=systems&record=pack:superpowers"), "packs");
  assert.equal(scope("record=spec:mcp"), "specifications");
  assert.equal(scope("record=lab:anthropic"), "labs");
  assert.equal(scope("record=model:x"), "models");
  // A comparison wins over a record; a malformed reference is ignored.
  assert.equal(scope("compare=system:a,b&record=runtime:x"), "systems");
  assert.equal(scope("record=nonsense"), "all");
  assert.equal(scope("view=finder&record=system:aider"), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: the assertion on `collection=systems&compare=inference:a,b` fails (today it returns `systems`).

- [ ] **Step 3: Give `scopeFromURL` its precedence**

In `web/app-core.js` replace `scopeFromURL`:

```js
  // Which scope a URL's filters belong to. A sibling view with filters owns
  // them; otherwise a comparison names its collection, then a record names
  // its own, then `collection`, then All (front-door spec, "URL state and
  // history"). Views without filters own none. Deciding this before any
  // control is restored is what keeps a hand-edited URL from leaving state
  // in a hidden panel (Phase 0 leftover).
  const RECORD_COLLECTIONS = { system: "systems", inference: "inference", runtime: "runtimes", pack: "packs", robot: "robots", spec: "specifications", model: "models", lab: "labs" };
  function scopeFromURL(params) {
    const view = params.get("view");
    if (["models", "labs", "specifications"].includes(view)) return view;
    if (view && view !== "directory") return null;
    const compare = params.get("compare") || "";
    const compared = COMPARISON_COLLECTIONS[compare.slice(0, compare.indexOf(":"))];
    if (compared) return compared;
    const record = parseRecordReference(params.get("record"));
    if (record && RECORD_COLLECTIONS[record.kind]) return RECORD_COLLECTIONS[record.kind];
    const collection = params.get("collection");
    return ["systems", "inference", "runtimes", "packs", "robots"].includes(collection) ? collection : "all";
  }
```

`parseRecordReference` and `COMPARISON_COLLECTIONS` are defined in the same closure; check `parseRecordReference` returns `null` for `"nonsense"` (it does today: the record tests rely on it). Run the unit tests: PASS.

- [ ] **Step 4: Write the failing browser tests**

Append to `tests/e2e/front-door.spec.js`:

```js
test("a record URL with no collection opens over its own collection's results", async ({ page }) => {
  await page.goto("/?record=runtime:ollama");
  await expect(page.locator("#runtime-dialog")).toBeVisible();
  await page.locator("#runtime-dialog .dialog-close").click();
  await expect(page.locator("#runtimes-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=runtimes/);
  await expect(page).not.toHaveURL(/record=/);
});

test("a comparison decides the scope before the collection's filters are applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=inference:openai-api,anthropic-api");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page.locator("#comparison-tray")).toBeVisible();
});

test("Back after closing a record restores the filters the URL carries", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#license-filter").selectOption("MIT");
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid .project-card h2").first().click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await page.locator("#project-dialog .dialog-close").click();
  await page.locator("#license-filter").selectOption("Apache-2.0");
  await expect(page).toHaveURL(/license=Apache-2\.0/);
  await page.goBack();
  await expect(page).toHaveURL(/license=MIT/);
  await expect(page.locator("#license-filter")).toHaveValue("MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator("#project-dialog")).toBeHidden();
});

test("Back and forward move between the front door, results, and a record", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "packs");
  await page.locator("#pack-grid .project-card h2").first().click();
  await expect(page.locator("#pack-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#pack-dialog")).toBeHidden();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Agent packs \d/);
});

test("a restored query with no sort lands on Best match", async ({ page }) => {
  await page.goto("/?collection=inference&q=router");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("match");
});
```

Use two inference service ids that exist in `web/inference-services.json` (`grep -o '"id": "[^"]*"' web/inference-services.json | head`) in place of `openai-api,anthropic-api`, and a runtime id that exists for `runtime:ollama`. The Best match value `"match"` is Phase 1's sort option id; confirm it in `MATCH_SORTS`' options before pinning it.

- [ ] **Step 5: Run them to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/front-door.spec.js -g "record URL|comparison decides|Back after|Back and forward|Best match"`
Expected: the record-URL test lands on All, the comparison test keeps `family=memory_system`, the Back test leaves Apache-2.0 selected.

- [ ] **Step 6: Implement `restoreFromURL` in `web/app.js`**

Replace `syncRecordWithHistory`, `restoreViewFromURL`, and `restoreRecordFromURL` with:

```js
// Resets one scope's controls to the defaults its URL parameters assume, so
// a URL that drops a filter also drops it from the control (Phase 0
// leftover: Back after closing a record showed older filters than the URL).
function resetScopeControls(scope) {
  for (const [key, selector] of Object.entries(SCOPE_CONTROLS[scope] || {})) {
    const control = $(selector);
    const fallback = AtlasCore.SCOPE_URL_PARAMS[scope][key] ?? "";
    if (control.type === "checkbox") control.checked = fallback === "1";
    else control.value = fallback;
  }
  state.page[scope] = 1;
  if (scope === "systems") {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
    populateRoleFilter();
    updateScoreSortAvailability();
  }
}

// One restore for boot and for every popstate. The URL decides, in order:
// the view; the scope, where a comparison or a record names its collection
// before `collection` does (scopeFromURL); that scope's controls, reset
// first; the comparison; the front door or results; the record. Every
// writer is quiet until the end, so a half-restored state never reaches the
// address bar, and a popstate never pushes.
function restoreFromURL({ boot = false } = {}) {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const rawView = params.get("view");
  let view = rawView === null ? "directory" : AtlasCore.parseViewId(rawView);
  if (!view) {
    view = "directory";
    params.delete("view");
    writeURL(url);
  }
  const scope = AtlasCore.scopeFromURL(params);
  state.urlReady = false;
  let restored = {};
  if (scope) {
    resetScopeControls(scope);
    restored = restoreScopeFromURL(scope);
  }
  const comparisonRestored = restoreComparisonFromURL();
  if (scope === "models" || scope === "labs" || scope === "specifications") {
    if (!comparisonRestored) activateView(scope);
    VIEW_RENDERERS[scope]();
  } else if (view !== "directory") {
    // Finder, Taxonomy, API: the Directory keeps whatever it had.
    activateView(view);
  } else if (AtlasCore.directoryStageFromURL(params) === "door") {
    activateView("directory");
    showFrontDoor({ updateURL: false });
  } else {
    if (!comparisonRestored) setDirectoryCollection(scope, { updateURL: false });
    activateView("directory");
  }
  if (scope && restored.sort === undefined) syncMatchSort(scope);
  const reference = AtlasCore.parseRecordReference(params.get("record"));
  if (reference && openRecord(reference.kind, reference.id)) {
    // Open; showRecordDialog wrote nothing because the URL already names it.
  } else {
    closeRecordDialogs();
    if (params.has("record")) {
      params.delete("record");
      writeURL(url);
    }
  }
  state.urlReady = true;
  writeDirectoryURL();
  writeScopeURL();
  if (boot && restored.q) loadRestoredSearch(scope, restored.page);
}
```

Then:

- In `bootstrap`, delete the lines from `const scope = AtlasCore.scopeFromURL(...)` and `const restored = restoreScopeFromURL(scope);` through `if (restored.q) loadRestoredSearch(scope, restored.page);`, keeping the render calls and `bindEvents()` between them, and put `restoreFromURL({ boot: true });` where the deleted restore sequence was (after `bindEvents()`). Keep whatever Phase 1 added to `bootstrap` around these lines; only the restore sequence is replaced. `renderStats` stays before the restore because the door reads counts.
- In `bindEvents`, replace `window.addEventListener("popstate", syncRecordWithHistory);` with `window.addEventListener("popstate", () => restoreFromURL());`.
- `activateView` scrolls to the top; on a popstate that is right for a door or a view change and harmless for a record close. If `activateView` gained a `focusTarget` option in Phase 1, pass nothing here so boot and history never move focus, as Phase 1's own rule says.
- `restoreComparisonFromURL` still calls `setDirectoryCollection(..., { updateURL: false })` or `activateView("models")` itself; `restoreFromURL` therefore skips its own call when it returns `true`.
- `syncMatchSort(scope)` is Phase 1's; if the merged name differs, use the merged one.

- [ ] **Step 7: Run the suite**

Run: `PATH=/usr/local/bin:$PATH npx playwright test`
Expected: PASS. `url-state.spec.js`'s existing cases (reload keeps the family and query, unknown values are removed, a comparison decides the family, the Models view restores) keep passing under the new restore; any `not.toHaveURL(/collection=/)` assertion written when All meant a missing parameter is updated to expect `collection=all` in results and no parameter on the front door.

- [ ] **Step 8: Docs**

`docs/WEB.md` "Behavioral contracts", the URL bullet that begins "The active Directory collection and the Models, Labs, and Specifications views write their query": append the sentences: `A bare URL opens the front door and `collection=all` names the A–Z list. Leaving the front door pushes one history entry; everything inside results replaces. Every popstate and boot go through one restore that reads the view, then the scope (a comparison or a record names its collection before `collection` does), resets and restores that scope's controls, restores the comparison, shows the front door or results, then the record, so Back always shows the filters the URL carries. A `record=` URL with no collection opens over its own collection's results.` In "Change surfaces", change the "record URLs and detail dialog history" row's location to `web/app-core.js parseRecordReference and scopeFromURL, web/app.js restoreFromURL and the record functions`, and the "view URLs and primary navigation" row to name `restoreFromURL` instead of `restoreViewFromURL`.

- [ ] **Step 9: Stamp, commit, and open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/app-core.js web/index.html web/blog tests docs/WEB.md
git commit -m "Restore every Directory state from the URL, on boot and on Back"
gh pr create --title "Restore every Directory state from the URL, on boot and on Back" --body "Front-door Phase 2, task 5 of 6: one restoreFromURL for boot and popstate; a comparison or a record names the scope before collection does; controls reset before the URL applies; Back returns to the front door; a record URL opens over its own collection. Closes the three Phase 0 leftovers."
```

---

### Task 6: ADR 043, the contracts, and the backlog

**Files:**
- Create: `docs/adr/043-the-directory-opens-on-a-front-door-of-collection-tiles.md`
- Modify: `docs/adr/013-distinct-collections-share-one-directory-surface.md` (status line and the two quick-filter phrases)
- Modify: `docs/superpowers/specs/2026-09-24-directory-front-door-design.md` (the skeptic ruling on marks, one sentence)
- Modify: `docs/WEB.md` ("Visual language", the switcher mention in "Content hierarchy" if any remains, verification step 31's mention of the Key chip on the landing page)
- Modify: `BACKLOG.md` (close the Phase 2 item and the Labs tile item)

**Interfaces:** none; documentation only.

- [ ] **Step 1: Check the number**

Run: `git fetch origin && git ls-tree --name-only origin/main docs/adr/ | tail -4`
Expected: 041 is the last, or 042 (the badge session's). If 043 exists, use the next free number in every reference below and in this plan's Global Constraints line.

- [ ] **Step 2: Write ADR 043**

```markdown
# ADR 043: The Directory opens on a front door of collection tiles

**Status:** Accepted

## Context

The Directory landed on a hero, an atlas map, and a switcher of ten chips that mixed three levels (All, a collection, its families, and the Models sibling view), was 1,346 px wide inside a 349 px phone frame, sat below the fold on a laptop, and carried a name and a count and nothing else. The front-door design (`docs/superpowers/specs/2026-09-24-directory-front-door-design.md`) chose a search-first landing page whose index and scope tabs are the quick filters, and its skeptic review ruled that tiles carry no definitions and no example marks, because choosing example records would need a ranking the unscored collections forbid ([ADR 008](008-specifications-are-unscored-artifacts.md), [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md), [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md)).

[ADR 013](013-distinct-collections-share-one-directory-surface.md) describes Models as "a visible quick-filter destination" and requires every sibling scope to be "reachable from the quick filters", wording written for the chip switcher.

## Decision

A bare Directory URL opens the front door: the headline, one supporting sentence, one search across every collection, the first Finder job of each direction, and an index with one tile per collection. Choosing a tile opens results, where a sticky strip lists the same collections. Tiles and the strip render from one registry, `AtlasCore.COLLECTIONS`, so a new collection is one entry, hidden while empty.

Tiles and strip entries are the Directory's quick filters. ADR 013's "a visible quick-filter destination" and "reachable from the quick filters" mean a tile on the front door and an entry in the strip. Models, Labs, and Specifications keep their sibling views (ADR 013, ADR 041); their tile and entry open the view.

A tile carries the collection's emblem, the count its default view lists with its split, its largest categories as links, three marks, and a state dot. The marks are the three records reviewed most recently by `verified_at`, ties broken by name A–Z. That amends the front-door spec's ruling against example marks: a review date is not a ranking, so the marks make no claim any unscored collection forbids. Tiles still carry no definitions.

The sticky strip on phones shows emblems only and keeps the header from being sticky, so the collections are always one tap away without a 185 px sticky header.

## Consequences

- `docs/WEB.md` "Content hierarchy" describes the front door and the strip; the switcher contract is gone.
- Leaving the front door pushes one history entry; everything inside results replaces; one restore reads the whole URL on boot and on Back.
- A collection with no records has no tile and no entry, which generalises ADR 037's Robots rule.
- The marks rule reads a field every published record already carries, so no field joins the boot payload; the payload envelope names the three ids.
- Papers (ADR 033, Proposed) and any later collection add one registry entry and one payload.
```

- [ ] **Step 3: Amend ADR 013 and the front-door spec**

In ADR 013, under the status line add an `**Amended by:**` line that links ADR 043 by its file name, `043-the-directory-opens-on-a-front-door-of-collection-tiles.md`, with the note "tiles and the scope strip are the quick filters". (The link is spelled out here rather than written, because `tests/test_documentation.py` resolves every relative link in this plan and the ADR does not exist until this task.) Leave the two phrases in place; the amendment note redefines them. In the front-door spec, in "Target design" item 3, after "and no example marks, since choosing them would need a ranking the unscored collections forbid" add ` (amended by ADR 043: three marks per tile, chosen by review date, not by rank)`.

- [ ] **Step 4: Finish `docs/WEB.md` and `BACKLOG.md`**

In `docs/WEB.md` "Visual language", delete the sentence about the atlas map and "the only filled segmented control" (the switcher) and say the pressed strip entry is the only filled control. In the "Content hierarchy" introduction, "one optional Finder action" becomes "the first Finder job of each direction". Verification step 31: "reload, and reopen it from the Key chip" stays; add "confirm the Key chip and legend are absent on the front door". Grep `docs/WEB.md` for `switcher` and `atlas map` and expect no hits.

In `BACKLOG.md`, delete the "Front-door Phase 2" item and its three sub-items, and the Labs group's "Give Labs its tile and results scope tab" item; under "Reader experience", change "Phase 1 is in `Now`" to reflect that Phases 1 and 2 have landed with ADR 040 and ADR 043, and that Phase 3 is next.

- [ ] **Step 5: Lint and commit**

```bash
PATH=/usr/local/bin:$PATH npx markdownlint-cli2 docs/adr/043-*.md docs/WEB.md BACKLOG.md
git add docs/adr docs/WEB.md BACKLOG.md docs/superpowers/specs/2026-09-24-directory-front-door-design.md
git commit -m "Record the front door as the Directory's default (ADR 043)"
gh pr create --title "Record the front door as the Directory's default (ADR 043)" --body "Front-door Phase 2, task 6 of 6: ADR 043 names the front door as the Directory's default, makes tiles and the scope strip ADR 013's quick filters, and records the marks-by-review-date rule as an amendment to the spec's skeptic ruling. docs/WEB.md and BACKLOG.md follow."
```

Tell the front-door session that Phase 2 has landed and which ADR number it took, so its Phase 3 spec builds on it.

---

## Self-review

**Spec coverage.** Section 1 (front door: headline, sentence, search, jobs, index; map and hero action gone): Task 3. Section 2 (registry fields, counts, categories, hidden-while-empty, one active, families as categories): Task 2 and 4. Section 3 (tiles: emblem, count with splits, categories as links, marks by `verified_at` with A–Z ties from the payload envelope, state dots, no definitions, 4/2 columns, above the fold): Tasks 2 and 3. Section 4 (strip: wide and phone forms, family row, Systems clears, state dots, phone sticky rule, header offset): Task 4, with the caption in place of an inline unfolded label, recorded in the spec by Task 4 Step 7. Section 5 (bare URL, `collection=all`, one push, general restore, record over its own collection, `setDirectoryCollection` semantics): Tasks 3 and 5. Section 6 (Phase 1 behaviours): Global Constraints, Task 3 Step 4 (search fields and hints untouched, `activateView` used for views), Task 5 (`syncMatchSort` after a restore with no sort). Data (`recent`, `--check`): Task 2. Tests (helper first, unit and browser cases listed, map assertions gone, outside-tap target moved, verification steps): Tasks 1, 3, 4, 5. Docs and ADR: Task 6, with `docs/WEB.md` edits in the task that makes each true. Coordination: Global Constraints and the message steps in Tasks 3 and 6. Sequence: the six tasks in the spec's order.

**Placeholders.** None: every code step carries its code; the two ids to confirm against the data (inference service ids, the Best match option value) are named as things to read, not to invent.

**Type consistency.** `openCollection(id, { facet })` in Task 3 is what the category buttons and Task 4's strip call; `data-open-collection`, `data-facet-key`, `data-facet-value`, `data-family-entry`, and `data-tile` are the attributes the helper in Task 3 Step 6 reads; `collectionPayloads()` feeds `collectionCount`, `collectionCategories`, and `collectionEntries` with the same shape Task 2's tests use; `VIEW_RENDERERS` is defined in Task 3 and read in Task 5; `state.directoryStage` is set only by `showFrontDoor`, `showResults`, and `leaveFrontDoor`.
