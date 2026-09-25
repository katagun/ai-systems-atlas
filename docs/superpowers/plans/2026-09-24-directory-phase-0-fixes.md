# Directory Phase 0 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the nine Phase 0 fixes from the front-door spec, one pull request each, so the current Directory is correct and every reachable state is addressable before the redesign begins.

**Architecture:** The site is a dependency-free static app: pure, unit-tested logic lives in `web/app-core.js` (UMD, loaded by the page and by `node:test`), and DOM wiring lives in `web/app.js`. Each task adds its pure decision to `app-core.js` first with a failing unit test, wires it in `app.js`, pins the reader-visible behaviour with a Playwright test, and updates the `docs/WEB.md` contract in the same PR.

**Tech Stack:** Vanilla JavaScript (ES2020), CSS custom properties, `node:test` (`tests/test_web.js`), Playwright (`tests/e2e/`), Python `uv` scripts for generated files.

**Spec:** `docs/superpowers/specs/2026-09-24-directory-front-door-design.md` ("Phase 0 — fixes", "URL state and history", "Coordination").

## Global Constraints

- The Robots collection's PR 2 merged as #300 (`ceef3779`); code below is written against `main` from that point. Anchor every edit by function name, not line number: several sessions are editing the same files.
- One task, one branch, one PR: `git fetch origin && git switch -c claude/directory-p0-<n>-<slug> origin/main`. Before the first commit, run `ListAgents` and message every session touching `web/` or `docs/WEB.md` with the branch and file list (spec, "Coordination").
- Colours only from the custom properties in `web/styles.css`; no colour or `border-radius` literal outside `:root` (`tests/test_web.js` fails the build on either).
- After any change to `web/index.html`, `web/app.js`, `web/app-core.js`, or `web/styles.css`, run `/usr/local/bin/node scripts/build_asset_version.mjs` and commit its output. Always use `/usr/local/bin/node` (v22) for tests, lint, and the stamp; the default `node` drifts between versions.
- User-facing copy is short and plain; no internal vocabulary such as "score profile" or "scope" in the interface.
- The page makes no request outside its own origin and adds no dependency.
- Local Playwright runs can fail a random handful of tests with boot timeouts (a boot request with status -1 in the trace). Rerun with `npx playwright test --last-failed` before suspecting the change.
- Commits run the full pre-commit suite and take minutes: use a 10-minute timeout and check `git log -1` afterwards. Merge a PR once its checks pass (auto-merge is fine); if the branch is `BEHIND`, update it and rebuild generated files rather than hand-merging stamps.

---

### Task 1: Exactly one switcher chip is pressed

**Files:**
- Modify: `web/app-core.js` (add `activeSwitcherIndex`, export it)
- Modify: `web/app.js` (`syncCollectionSwitcher`)
- Modify: `tests/test_web.js` (import and test)
- Modify: `tests/e2e/directory-search.spec.js` (the Memory, Agents, and Assistants chip test)
- Modify: `docs/WEB.md` ("Behavioral contracts")

**Interfaces:**
- Produces: `AtlasCore.activeSwitcherIndex(entries, { collection, family })` → index into `entries` (`-1` when nothing matches). `entries` is `[{ collection: string, family?: string }]` in button order.

- [ ] **Step 1: Write the failing unit test**

Add `activeSwitcherIndex` to the destructured `require("../web/app-core.js")` at the top of `tests/test_web.js`, then append:

```js
test("exactly one switcher chip is pressed, and a family chip wins over Systems", () => {
  const entries = [
    { collection: "all" },
    { collection: "systems" },
    { collection: "systems", family: "memory_system" },
    { collection: "systems", family: "agent_system" },
    { collection: "inference" },
  ];
  assert.equal(activeSwitcherIndex(entries, { collection: "all" }), 0);
  assert.equal(activeSwitcherIndex(entries, { collection: "systems" }), 1);
  assert.equal(activeSwitcherIndex(entries, { collection: "systems", family: "memory_system" }), 2);
  assert.equal(activeSwitcherIndex(entries, { collection: "systems", family: "agent_system" }), 3);
  // A family with no chip of its own leaves the collection chip pressed.
  assert.equal(activeSwitcherIndex(entries, { collection: "systems", family: "robot_system" }), 1);
  assert.equal(activeSwitcherIndex(entries, { collection: "inference", family: "memory_system" }), 4);
  assert.equal(activeSwitcherIndex(entries, { collection: "packs" }), -1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `activeSwitcherIndex is not a function`.

- [ ] **Step 3: Implement it**

In `web/app-core.js`, after `mergePackScopeEntries`, add:

```js
  // Which one switcher chip is pressed. `entries` describes the buttons in
  // order: { collection, family }, with no family on a collection-wide chip.
  // A family chip wins over its collection's chip, so choosing Memory never
  // also presses Systems: the controls are mutually exclusive (docs/WEB.md).
  function activeSwitcherIndex(entries, { collection, family = "" }) {
    if (family) {
      const familyIndex = entries.findIndex(entry => entry.collection === collection && entry.family === family);
      if (familyIndex !== -1) return familyIndex;
    }
    return entries.findIndex(entry => entry.collection === collection && entry.family === undefined);
  }
```

Add `activeSwitcherIndex,` to the returned object, keeping its alphabetical order.

- [ ] **Step 4: Run the unit test and watch it pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Wire it into the switcher**

Replace the body of `syncCollectionSwitcher()` in `web/app.js`. Only the choice of the active button changes; the scroll block that #300 added stays exactly as it is, because it moves only `switcher.scrollLeft` and never the page:

```js
function syncCollectionSwitcher() {
  const buttons = $$('[data-directory-collection]');
  const active = AtlasCore.activeSwitcherIndex(
    buttons.map(button => ({ collection: button.dataset.directoryCollection, family: button.dataset.directoryFamily })),
    { collection: state.directoryCollection, family: $("#family-filter").value },
  );
  buttons.forEach((button, index) => {
    button.classList.toggle("is-active", index === active);
    button.setAttribute("aria-pressed", String(index === active));
  });
  const activeButton = buttons[active] || null;
  // The switcher wraps at desktop widths, so every entry is already visible
  // there; only the narrow layout keeps the horizontal scroll strip that can
  // hide the active entry off-screen. Scrolling only fires when the strip is
  // actually scrollable, so a scope change on a wide viewport never jolts the
  // page, and it never asks for smooth scrolling so reduced motion is respected.
  // scrollIntoView would do here, but it can scroll the whole page vertically
  // to bring the switcher itself into view (e.g. a Systems family change that
  // re-syncs it while it sits above the fold on a phone); moving only
  // switcher.scrollLeft, by the button's nearest-edge overflow, never touches
  // the page's own scroll position.
  const switcher = $(".collection-switcher");
  if (activeButton && switcher && switcher.scrollWidth > switcher.clientWidth) {
    const switcherRect = switcher.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    if (buttonRect.left < switcherRect.left) {
      switcher.scrollLeft -= switcherRect.left - buttonRect.left;
    } else if (buttonRect.right > switcherRect.right) {
      switcher.scrollLeft += buttonRect.right - switcherRect.right;
    }
  }
}
```

- [ ] **Step 6: Update the e2e test that pinned two pressed chips**

In `tests/e2e/directory-search.spec.js`, test "the Memory, Agents, and Assistants chips jump straight into their filtered, scored family", replace

```js
  await expect(page.getByRole("button", { name: /^Systems / })).toHaveAttribute("aria-pressed", "true");
```

with

```js
  await expect(page.getByRole("button", { name: /^Systems / })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.collection-switcher [aria-pressed="true"]')).toHaveCount(1);
```

- [ ] **Step 7: Run the e2e file**

Run: `npx playwright test tests/e2e/directory-search.spec.js`
Expected: PASS. Any other test asserting that Systems stays pressed while a family chip is active gets the same change.

- [ ] **Step 8: Update the contract**

In `docs/WEB.md` "Behavioral contracts", extend the bullet that begins "Collection controls are mutually exclusive" with: "Exactly one switcher control is pressed: while a family is selected, its family chip is pressed instead of Systems."

- [ ] **Step 9: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app-core.js web/app.js web/index.html tests/test_web.js tests/e2e/directory-search.spec.js docs/WEB.md
git commit -m "Press exactly one Directory switcher chip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 2: Chip counts match what each scope lists

**Files:**
- Modify: `web/app-core.js` (add `switcherCounts`, export it)
- Modify: `web/app.js` (`renderStats`)
- Modify: `tests/test_web.js`, `tests/e2e/directory-search.spec.js`
- Modify: `docs/WEB.md` ("Content hierarchy", the switcher bullet)

**Interfaces:**
- Consumes: `directoryDefaults()`, `packShapedSystems()` (existing).
- Produces: `AtlasCore.switcherCounts({ projects, services, runtimes, models, packs, robots })` → `{ all, systems, memory_system, agent_system, assistant_system, inference, runtimes, models, packs, robots }` (numbers).

- [ ] **Step 1: Write the failing unit test**

Import `switcherCounts` in `tests/test_web.js`, then append:

```js
test("each switcher chip counts what its scope lists by default", () => {
  const systems = [
    { name: "M1", system_family: "memory_system", status: "active", deployment: [] },
    { name: "M2", system_family: "memory_system", status: "archived", deployment: [] },
    { name: "A1", system_family: "agent_system", status: "active", deployment: ["host_pack"] },
    { name: "A2", system_family: "agent_system", status: "superseded", deployment: [] },
    { name: "S1", system_family: "assistant_system", status: "active", deployment: [] },
  ];
  const counts = switcherCounts({ projects: systems, services: [{}, {}], runtimes: [{}], models: [{}, {}, {}], packs: [{}], robots: [] });
  assert.deepEqual(counts, {
    all: 5 + 2 + 1 + 3 + 1,
    systems: 3,
    memory_system: 1,
    agent_system: 1,
    assistant_system: 1,
    inference: 2,
    runtimes: 1,
    models: 3,
    packs: 1 + 1,
    robots: 0,
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `switcherCounts is not a function`.

- [ ] **Step 3: Implement it**

In `web/app-core.js`, after `activeSwitcherIndex`:

```js
  // What each switcher chip counts: exactly what its scope lists by default.
  // Systems and the family chips open on directoryDefaults().status, so they
  // count active records; All lists everything, archived references
  // included; Agent packs lists packs beside host-installed systems (ADR 035).
  function switcherCounts({ projects = [], services = [], runtimes = [], models = [], packs = [], robots = [] }) {
    const { status } = directoryDefaults();
    const listed = projects.filter(project => !status || project.status === status);
    const family = id => listed.filter(project => project.system_family === id).length;
    return {
      all: projects.length + services.length + runtimes.length + models.length + packs.length + robots.length,
      systems: listed.length,
      memory_system: family("memory_system"),
      agent_system: family("agent_system"),
      assistant_system: family("assistant_system"),
      inference: services.length,
      runtimes: runtimes.length,
      models: models.length,
      packs: packs.length + packShapedSystems(projects, {}).length,
      robots: robots.length,
    };
  }
```

Export `switcherCounts`.

- [ ] **Step 4: Run the unit test and watch it pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Use it in `renderStats`**

Replace the body of `renderStats()` in `web/app.js`. Keep the kicker sentence exactly as the Robots PR left it; only its number changes source:

```js
function renderStats() {
  const counts = AtlasCore.switcherCounts({
    projects: state.projects, services: state.inferenceServices, runtimes: state.localRuntimes,
    models: state.models, packs: state.packs, robots: state.robots,
  });
  $("#hero-kicker").textContent = `${counts.all} systems, source models, services, runtimes, packs, and robots`;
  $("#all-collection-count").textContent = counts.all;
  $("#system-collection-count").textContent = counts.systems;
  $("#memory-collection-count").textContent = counts.memory_system;
  $("#agent-collection-count").textContent = counts.agent_system;
  $("#assistant-collection-count").textContent = counts.assistant_system;
  $("#inference-collection-count").textContent = counts.inference;
  $("#runtime-collection-count").textContent = counts.runtimes;
  $("#model-collection-count").textContent = counts.models;
  $("#pack-collection-count").textContent = counts.packs;
  $("#robot-collection-count").textContent = counts.robots;
  $("#robot-collection-count").parentElement.hidden = counts.robots === 0;
}
```

- [ ] **Step 6: Pin the reader-visible rule**

Append to `tests/e2e/directory-search.spec.js`:

```js
test("every family chip counts exactly the systems it lists", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Systems", "Memory", "Agents", "Assistants"]) {
    const chip = page.getByRole("button", { name: new RegExp(`^${name} \\d`) });
    const count = Number((await chip.locator("strong").textContent()).trim());
    await chip.click();
    await expect(page.locator("#result-count")).toContainText(new RegExp(`^${count} projects?\\b`));
  }
});
```

- [ ] **Step 7: Run both suites**

Run: `/usr/local/bin/node --test tests/test_web.js && npx playwright test tests/e2e/directory-search.spec.js`
Expected: PASS.

- [ ] **Step 8: Update the contract**

In `docs/WEB.md` "Content hierarchy", after the switcher bullet, add: "Each switcher chip counts what its scope lists by default: Systems and the family chips count active systems, All counts everything it lists, archived references included, and Agent packs counts packs beside host-installed systems."

- [ ] **Step 9: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app-core.js web/app.js web/index.html tests/test_web.js tests/e2e/directory-search.spec.js docs/WEB.md
git commit -m "Count what each Directory chip lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 3: Every scope's state lives in the URL

**Files:**
- Modify: `web/app-core.js` (add `SCOPE_URL_PARAMS`, `SCOPE_URL_KEYS`, `scopeURLParams`, `readScopeURLParams`, `scopeFromURL`; export all five)
- Modify: `web/app.js` (add `SCOPE_CONTROLS`, `activeScope`, `readScopeControls`, `allowedScopeValues`, `writeScopeURL`, `restoreScopeFromURL`; call them from `bootstrap`, `activateView`, `renderCollection`, `renderAllDirectoryEntries`, `renderPacks`)
- Modify: `tests/test_web.js`
- Create: `tests/e2e/url-state.spec.js`
- Modify: `docs/WEB.md` ("Behavioral contracts", verification steps 2 and 26)

**Interfaces:**
- Produces (app-core):
  - `SCOPE_URL_PARAMS`: `{ [scope]: { [param]: defaultString } }` for scopes `all`, `systems`, `inference`, `runtimes`, `packs`, `robots`, `models`, `labs`, `specifications`.
  - `SCOPE_URL_KEYS`: every parameter name any scope writes, plus `"page"`.
  - `scopeURLParams(scope, values)` → `[[param, value], …]`, only values that differ from the default, in table order.
  - `readScopeURLParams(scope, params: URLSearchParams, allowed)` → `{ values, rejected }`, where `allowed[param]` is a `Set` of acceptable values or `"text"`, `values.page` is a positive integer, and `rejected` lists present parameters to remove.
  - `scopeFromURL(params: URLSearchParams)` → a scope name or `null`.
- Produces (app.js): `writeScopeURL()`, `restoreScopeFromURL(scope, { familyFromComparison })`, `activeScope()`.

- [ ] **Step 1: Write the failing unit tests**

Import `SCOPE_URL_KEYS`, `readScopeURLParams`, `scopeFromURL`, `scopeURLParams` in `tests/test_web.js`, then append:

```js
test("a scope writes only the parameters that differ from their defaults, in a fixed order", () => {
  assert.deepEqual(
    scopeURLParams("systems", { q: "graph", family: "memory_system", role: "", status: "active", localOnly: "", sort: "name" }),
    [["q", "graph"], ["family", "memory_system"]],
  );
  assert.deepEqual(scopeURLParams("systems", { status: "", localOnly: "1", sort: "score" }), [["status", ""], ["localOnly", "1"], ["sort", "score"]]);
  assert.deepEqual(scopeURLParams("inference", { type: "direct_model_api", sort: "score" }), [["type", "direct_model_api"]]);
  assert.deepEqual(scopeURLParams("nowhere", { q: "x" }), []);
});

test("restoring a scope keeps what its controls offer and rejects the rest", () => {
  const params = new URLSearchParams("q=graph&family=memory_system&role=nope&type=direct_model_api&page=2");
  const allowed = { q: "text", family: new Set(["", "memory_system"]), role: new Set(["", "human_pkm"]) };
  assert.deepEqual(readScopeURLParams("systems", params, allowed), {
    values: { q: "graph", family: "memory_system", page: 2 },
    rejected: ["role", "type"],
  });
  assert.deepEqual(readScopeURLParams("all", new URLSearchParams("page=0"), { q: "text" }), { values: {}, rejected: ["page"] });
  assert.ok(SCOPE_URL_KEYS.includes("page"));
});

test("a URL's filters belong to its view or to the Directory collection it names", () => {
  assert.equal(scopeFromURL(new URLSearchParams("")), "all");
  assert.equal(scopeFromURL(new URLSearchParams("collection=systems")), "systems");
  assert.equal(scopeFromURL(new URLSearchParams("collection=nope")), "all");
  assert.equal(scopeFromURL(new URLSearchParams("view=models&collection=systems")), "models");
  assert.equal(scopeFromURL(new URLSearchParams("view=finder")), null);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `scopeURLParams is not a function`.

- [ ] **Step 3: Implement the pure half**

In `web/app-core.js`, after `switcherCounts`:

```js
  // Every URL parameter a scope writes, with its default. The keys are the
  // ones the scope's filter already reads — directoryDefaults() for Systems,
  // the view descriptors' facets elsewhere — so a parameter means the same in
  // the URL and in the code; `q` is the scope's query. A value equal to its
  // default is never written.
  const SCOPE_URL_PARAMS = {
    all: { q: "" },
    systems: { q: "", family: "", role: "", agent: "", architecture: "", deployment: "", agentInterface: "", sourceModel: "", license: "", status: "active", localOnly: "", sort: "name" },
    inference: { q: "", type: "", delivery: "", modelSource: "", apiStyle: "", sort: "score" },
    runtimes: { q: "", type: "", accelerator: "", modelFormat: "", apiStyle: "", sort: "score" },
    packs: { q: "", type: "", host: "", install: "", license: "" },
    robots: { q: "", formFactor: "", aiBasis: "", availability: "", status: "" },
    models: { q: "", type: "", distribution: "", modality: "", sourceModel: "", license: "", lab: "", sort: "score" },
    labs: { q: "", type: "", headquarters: "", distribution: "" },
    specifications: { q: "", type: "", scope: "", status: "", license: "" },
  };
  const SCOPE_URL_KEYS = [...new Set(Object.values(SCOPE_URL_PARAMS).flatMap(Object.keys)), "page"];

  function scopeURLParams(scope, values = {}) {
    return Object.entries(SCOPE_URL_PARAMS[scope] || {})
      .filter(([key, fallback]) => values[key] !== undefined && String(values[key]) !== fallback)
      .map(([key]) => [key, String(values[key])]);
  }

  // `allowed` maps each key to the Set of values its control offers, or to
  // "text" for free text. A present parameter the control cannot take, or one
  // this scope does not own, comes back in `rejected`, so the caller removes it
  // rather than applying part of a state.
  function readScopeURLParams(scope, params, allowed = {}) {
    const owned = SCOPE_URL_PARAMS[scope] || {};
    const values = {};
    const rejected = [];
    for (const key of SCOPE_URL_KEYS) {
      if (key === "page" || !params.has(key)) continue;
      const value = params.get(key);
      const accepts = allowed[key];
      if (key in owned && (accepts === "text" || (accepts instanceof Set && accepts.has(value)))) values[key] = value;
      else rejected.push(key);
    }
    const page = params.get("page");
    if (page !== null) {
      if (/^[1-9]\d*$/.test(page)) values.page = Number(page);
      else rejected.push("page");
    }
    return { values, rejected };
  }

  // Which scope a URL's filters belong to: a sibling view with filters, the
  // Directory collection it names, or All. Views without filters own none.
  function scopeFromURL(params) {
    const view = params.get("view");
    if (["models", "labs", "specifications"].includes(view)) return view;
    if (view && view !== "directory") return null;
    const collection = params.get("collection");
    return ["systems", "inference", "runtimes", "packs", "robots"].includes(collection) ? collection : "all";
  }
```

Export all five names.

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Add the DOM half to `web/app.js`**

Add after `writeDirectoryURL()`:

```js
// Each scope's URL parameters and the control that holds each one. Keys are
// AtlasCore.SCOPE_URL_PARAMS keys; selectors are web/index.html's.
const SCOPE_CONTROLS = {
  all: { q: "#all-directory-search" },
  systems: { q: "#project-search", family: "#family-filter", role: "#role-filter", agent: "#agent-filter", architecture: "#architecture-filter", deployment: "#deployment-filter", agentInterface: "#agent-interface-filter", sourceModel: "#source-model-filter", license: "#license-filter", status: "#status-filter", localOnly: "#local-filter", sort: "#sort-filter" },
  inference: { q: "#inference-search", type: "#inference-type-filter", delivery: "#inference-delivery-filter", modelSource: "#inference-model-source-filter", apiStyle: "#inference-api-filter", sort: "#inference-sort-filter" },
  runtimes: { q: "#runtime-search", type: "#runtime-type-filter", accelerator: "#runtime-accelerator-filter", modelFormat: "#runtime-format-filter", apiStyle: "#runtime-api-filter", sort: "#runtime-sort-filter" },
  packs: { q: "#pack-search", type: "#pack-type-filter", host: "#pack-host-filter", install: "#pack-install-filter", license: "#pack-license-filter" },
  robots: { q: "#robot-search", formFactor: "#robot-form-factor-filter", aiBasis: "#robot-ai-basis-filter", availability: "#robot-availability-filter", status: "#robot-status-filter" },
  models: { q: "#model-search", type: "#model-type-filter", distribution: "#model-distribution-filter", modality: "#model-modality-filter", sourceModel: "#model-source-filter", license: "#model-license-filter", lab: "#model-lab-filter", sort: "#model-sort-filter" },
  labs: { q: "#lab-search", type: "#lab-type-filter", headquarters: "#lab-country-filter", distribution: "#lab-distribution-filter" },
  specifications: { q: "#specification-search", type: "#specification-type-filter", scope: "#specification-scope-filter", status: "#specification-status-filter", license: "#specification-license-filter" },
};

// The scope whose state the URL carries: the Directory's collection, or a
// sibling view that has filters. Finder, Taxonomy, and API carry none.
function activeScope() {
  const view = $(".view.is-active")?.id;
  if (view === "directory") return state.directoryCollection;
  return SCOPE_CONTROLS[view] ? view : null;
}

function readScopeControls(scope) {
  return Object.fromEntries(Object.entries(SCOPE_CONTROLS[scope] || {}).map(([key, selector]) => {
    const control = $(selector);
    return [key, control.type === "checkbox" ? (control.checked ? "1" : "") : control.value];
  }));
}

function allowedScopeValues(scope) {
  return Object.fromEntries(Object.entries(SCOPE_CONTROLS[scope] || {}).map(([key, selector]) => {
    const control = $(selector);
    if (control.type === "checkbox") return [key, new Set(["1"])];
    if (control.tagName === "SELECT") return [key, new Set([...control.options].filter(option => !option.disabled).map(option => option.value))];
    return [key, "text"];
  }));
}

// Rewrites the active scope's parameters in place: only `record` pushes
// history (docs/WEB.md), so Back still closes a dialog. Quiet until the
// page has restored itself, so boot never writes a half-restored state.
function writeScopeURL() {
  if (!state.urlReady) return;
  const url = new URL(window.location.href);
  AtlasCore.SCOPE_URL_KEYS.forEach(key => url.searchParams.delete(key));
  const scope = activeScope();
  if (scope) {
    for (const [key, value] of AtlasCore.scopeURLParams(scope, readScopeControls(scope))) url.searchParams.set(key, value);
    if (state.page[scope] > 1) url.searchParams.set("page", String(state.page[scope]));
  }
  window.history.replaceState(null, "", url);
}

// Applies the URL to one scope's controls before its first paint. Family goes
// first because it decides which roles and sorts Systems offers. A comparison
// decides the family itself (spec, "URL state and history"), so a family
// parameter beside one is dropped. Anything a control cannot take is removed
// from the URL rather than half-applied.
function restoreScopeFromURL(scope, { familyFromComparison = false } = {}) {
  if (!SCOPE_CONTROLS[scope]) return;
  const url = new URL(window.location.href);
  if (scope === "systems" && !familyFromComparison && url.searchParams.has("family")) {
    const family = url.searchParams.get("family");
    if ([...$("#family-filter").options].some(option => option.value === family)) {
      $("#family-filter").value = family;
      populateRoleFilter();
      updateScoreSortAvailability();
    }
  }
  const { values, rejected } = AtlasCore.readScopeURLParams(scope, url.searchParams, allowedScopeValues(scope));
  if (familyFromComparison && "family" in values) {
    delete values.family;
    rejected.push("family");
  }
  for (const [key, value] of Object.entries(values)) {
    if (key === "page") {
      state.page[scope] = value;
      continue;
    }
    const control = $(SCOPE_CONTROLS[scope][key]);
    if (control.type === "checkbox") control.checked = value === "1";
    else control.value = value;
  }
  if (rejected.length) {
    rejected.forEach(key => url.searchParams.delete(key));
    window.history.replaceState(null, "", url);
  }
}
```

- [ ] **Step 6: Call them**

1. In `bootstrap()`, directly after the last `populate…Filter()` call and before the first `render…()` call, insert:

```js
  const initialParams = new URL(window.location.href).searchParams;
  restoreScopeFromURL(AtlasCore.scopeFromURL(initialParams), { familyFromComparison: initialParams.has("compare") });
```

2. At the end of `bootstrap()`, after `restoreRecordFromURL();`, insert:

```js
  state.urlReady = true;
  writeScopeURL();
```

3. In `activateView(id)`, directly after `writeViewURL(id);`, insert `writeScopeURL();`.
4. At the end of `renderCollection(name)`, after `renderPager(...)`, insert `if (activeScope() === name) writeScopeURL();`.
5. At the end of `renderAllDirectoryEntries()`, insert `if (activeScope() === "all") writeScopeURL();`.
6. At the end of `renderPacks()`, insert `if (activeScope() === "packs") writeScopeURL();`.
7. Add `urlReady: false,` to the `state` object literal.

- [ ] **Step 7: Write the reader-path tests**

Create `tests/e2e/url-state.spec.js`:

```js
const { test, expect } = require("@playwright/test");

test("a family chip, a query, and a filter survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Memory / }).click();
  await page.locator("#project-search").fill("graph");
  await page.locator("#license-filter").selectOption("MIT");
  await expect(page).toHaveURL(/family=memory_system/);
  await expect(page).toHaveURL(/q=graph/);
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();

  await page.reload();
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
  await expect(page.locator("#project-search")).toHaveValue("graph");
  await expect(page.locator("#license-filter")).toHaveValue("MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator('.collection-switcher [aria-pressed="true"]')).toHaveText(/^Memory /);
});

test("values a control cannot take are removed from the URL rather than half-applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=nope&role=nope&q=agent&type=direct_model_api");
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page.locator("#project-search")).toHaveValue("agent");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page).not.toHaveURL(/role=/);
  await expect(page).not.toHaveURL(/type=/);
});

test("a comparison decides the family, and a disagreeing family is dropped", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=system:kilo-code,aider");
  await expect(page.locator("#family-filter")).toHaveValue("agent_system");
  await expect(page).not.toHaveURL(/family=memory_system/);
});

test("the Models view restores its query and filters", async ({ page }) => {
  await page.goto("/?view=models&q=gemma&type=language_model");
  await expect(page.locator("#models")).toHaveClass(/is-active/);
  await expect(page.locator("#model-search")).toHaveValue("gemma");
  await expect(page.locator("#model-type-filter")).toHaveValue("language_model");
  await page.reload();
  await expect(page.locator("#model-search")).toHaveValue("gemma");
});

test("a page number restores, and changing scope clears the last scope's parameters", async ({ page }) => {
  await page.goto("/?page=2");
  await expect(page.locator("#all-directory-pager .pager-nav span")).toContainText("Page 2 of");

  await page.getByRole("button", { name: /^Inference services / }).click();
  await page.locator("#inference-type-filter").selectOption("direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.getByRole("button", { name: /^Local runtimes / }).click();
  await expect(page).not.toHaveURL(/type=/);
  await expect(page).not.toHaveURL(/page=/);
});
```

- [ ] **Step 8: Run the new and existing e2e suites**

Run: `npx playwright test tests/e2e/url-state.spec.js && npm run test:e2e`
Expected: PASS. An existing assertion that pinned an exact URL (for example, `toHaveURL(/collection=inference$/)`) now also sees filter parameters; loosen it to the parameter it cares about.

- [ ] **Step 9: Update the contract**

In `docs/WEB.md` "Behavioral contracts", add after the `view` bullet: "The active Directory collection and the Models, Labs, and Specifications views write their query (`q`), every non-default filter under the key their filter function reads, the sort, and a page above 1 to the URL with `replaceState`; only `record` adds a history entry. Restoring a URL applies what each control offers and removes any parameter it cannot take; a `compare` parameter decides the family, so a disagreeing `family` is removed." In the verification list, extend step 2 with "reload with a family chip, a query, and a filter selected and confirm all three return" and step 26 with "confirm a Models or Labs URL restores its query and filters".

- [ ] **Step 10: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app-core.js web/app.js web/index.html tests/test_web.js tests/e2e/url-state.spec.js docs/WEB.md
git commit -m "Keep every Directory and view filter in the URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 4: The primary navigation fits a phone

**Files:**
- Modify: `web/styles.css` (the `.tabs` and `.tab` rules inside the phone media query)
- Modify: `tests/e2e/navigation.spec.js` ("every tab fits on a phone with room to spare")
- Modify: `docs/WEB.md` (verification step 24)

**Interfaces:** none.

- [ ] **Step 1: Make the phone test measure every item, Blog included**

Replace the test "every tab fits on a phone with room to spare" in `tests/e2e/navigation.spec.js` with:

```js
for (const width of [390, 360, 320]) {
  test(`every navigation item is fully visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const fit = await page.locator(".tabs").evaluate(nav => {
      const box = nav.getBoundingClientRect();
      const items = [...nav.querySelectorAll(".tab, .tab-link")].map(item => item.getBoundingClientRect());
      return {
        overflow: nav.scrollWidth - nav.clientWidth,
        outside: items.filter(item => item.left < box.left - 0.5 || item.right > box.right + 0.5).length,
        rows: new Set(items.map(item => Math.round(item.top))).size,
      };
    });
    expect(fit.overflow).toBeLessThanOrEqual(0);
    expect(fit.outside).toBe(0);
    if (width === 390) expect(fit.rows).toBe(1);
    expect(await styleOf(page, ".tab.is-active", "borderTopLeftRadius")).toBe("0px");
  });
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/navigation.spec.js`
Expected: FAIL at 360px and 320px (`overflow` above 0), and at 390px with a 1px overflow.

- [ ] **Step 3: Let the nav wrap on phones**

In `web/styles.css`, inside the phone media query, replace

```css
  .tabs { order: 3; width: 100%; gap: .5rem; overflow-x: auto; }
```

with

```css
  .tabs { order: 3; width: 100%; flex-wrap: wrap; column-gap: .45rem; row-gap: .1rem; overflow-x: visible; }
```

Keep `.tab { flex: 0 0 auto; font-size: .66rem; }` unchanged. The narrower gap keeps a 390px phone on one row; smaller screens wrap onto a second row instead of scrolling.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx playwright test tests/e2e/navigation.spec.js tests/e2e/header.spec.js tests/e2e/page-health.spec.js`
Expected: PASS.

- [ ] **Step 5: Update the contract**

In `docs/WEB.md` verification step 24, change "that every tab fits on a phone" to "that every navigation item, Blog included, is fully visible at 390px on one row and at 360px and 320px".

- [ ] **Step 6: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/styles.css web/index.html tests/e2e/navigation.spec.js docs/WEB.md
git commit -m "Fit every navigation item on a phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 5: The active view is announced

**Files:**
- Modify: `web/index.html` (the Directory tab)
- Modify: `web/app.js` (`activateView`)
- Modify: `tests/e2e/navigation.spec.js`
- Modify: `docs/WEB.md` ("Behavioral contracts", the `view` bullet)

**Interfaces:** none.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/navigation.spec.js`:

```js
test("the active view's tab carries aria-current and no other tab does", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.tab[aria-current="page"]')).toHaveAttribute("data-tab", "directory");

  await page.locator('.tab[data-tab="finder"]').click();
  await expect(page.locator('.tab[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('.tab[aria-current="page"]')).toHaveAttribute("data-tab", "finder");

  await page.goto("/?view=labs");
  await expect(page.locator('.tab[aria-current="page"]')).toHaveAttribute("data-tab", "labs");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/navigation.spec.js`
Expected: FAIL, no element matches `.tab[aria-current="page"]`.

- [ ] **Step 3: Implement it**

In `web/index.html`, give the Directory tab its starting state: `<button class="tab is-active" data-tab="directory" aria-current="page">Directory</button>`.

In `activateView(id)` in `web/app.js`, replace

```js
  $$(".tab").forEach(item => item.classList.toggle("is-active", item.dataset.tab === id));
```

with

```js
  $$(".tab").forEach(item => {
    const active = item.dataset.tab === id;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx playwright test tests/e2e/navigation.spec.js`
Expected: PASS.

- [ ] **Step 5: Update the contract**

In `docs/WEB.md`, extend the bullet that begins "Every primary navigation view is addressable" with: "The active view's tab carries `aria-current=\"page\"`."

- [ ] **Step 6: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/index.html web/app.js tests/e2e/navigation.spec.js docs/WEB.md
git commit -m "Announce the active view with aria-current

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 6: A whole card opens its record, and emblems stay tooltips

**Files:**
- Modify: `web/app.js` (add `detailsButton`; use it in every card's details control)
- Modify: `web/styles.css` (stretched target, stacking, focus ring)
- Modify: `tests/e2e/directory-search.spec.js` (six "View details →" lookups), `tests/e2e/card-badges.spec.js` (touch case)
- Create: `tests/e2e/card-click.spec.js`
- Modify: `docs/WEB.md` ("Behavioral contracts", "Card badges")

**Interfaces:**
- Produces: `detailsButton(attribute, id, name, text = "View details")` → button markup with `class="card-open"`, the `attribute="id"` hook every renderer already binds, visible text `text →`, and accessible name `text for name`.

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e/card-click.spec.js`:

```js
const { test, expect } = require("@playwright/test");

test("clicking a card's title opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  const card = page.locator('#project-grid .project-card:has([data-project="aider"])');
  await card.locator("h2").click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("the details control names the record it opens", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  await expect(page.getByRole("button", { name: "View details for Aider" })).toBeVisible();
});

test("Compare toggles without opening the record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.getByRole("button", { name: /^Agents / }).click();
  await page.locator("#project-search").fill("Aider");
  await page.locator('#project-grid .compare-toggle[data-compare-id="aider"]').click();
  await expect(page.locator("#project-dialog")).not.toBeVisible();
  await expect(page.locator("#comparison-tray")).toBeVisible();
});
```

Append to `tests/e2e/card-badges.spec.js`:

```js
test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping an emblem opens its tooltip and neither opens the record nor changes the URL", async ({ page }) => {
    await page.goto("/?collection=systems");
    await page.locator("#project-search").fill("Aider");
    const before = page.url();
    await page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badge').first().tap();
    await expect(page.locator("#badge-tooltip")).toBeVisible();
    await expect(page.locator("#project-dialog")).not.toBeVisible();
    expect(page.url()).toBe(before);
  });
});
```

- [ ] **Step 2: Run them and watch the first and second fail**

Run: `npx playwright test tests/e2e/card-click.spec.js tests/e2e/card-badges.spec.js`
Expected: FAIL for "clicking a card's title opens its record" (no dialog) and "the details control names the record it opens" (no such name). The Compare and emblem tests pass today and must keep passing.

- [ ] **Step 3: Add the helper**

In `web/app.js`, after `badgeRow`:

```js
// The one control that opens a card's record. Its hidden text names the
// record, so a page of cards doesn't hold twenty-four buttons with one name,
// and `.card-open::after` in styles.css stretches it over the whole card. The
// arrow is decoration, so screen readers hear "View details for <name>".
function detailsButton(attribute, id, name, text = "View details") {
  return `<button class="card-open" ${attribute}="${escapeHTML(id)}">${escapeHTML(text)}<span class="visually-hidden"> for ${escapeHTML(name)}</span><span aria-hidden="true"> →</span></button>`;
}
```

- [ ] **Step 4: Use it in every card**

Replace each details button with the helper call. Search `web/app.js` for `View details →` and `View source details →`; every hit is one of these:

| Renderer | Replace | With |
|---|---|---|
| `packCard` | `<button data-pack="${escapeHTML(pack.id)}">View details →</button>` | `${detailsButton("data-pack", pack.id, pack.name)}` |
| `labCard` | `<button data-lab="${escapeHTML(lab.id)}">View details →</button>` | `${detailsButton("data-lab", lab.id, lab.name)}` |
| `importedModelCard` | `<button data-model="${escapeHTML(model.id)}">View source details →</button>` | `${detailsButton("data-model", model.id, model.name, "View source details")}` |
| `mixedSystemCard` | `<button data-project="${escapeHTML(record.id)}">View details →</button>` | `${detailsButton("data-project", record.id, record.name)}` |
| `renderAllDirectoryEntries`, reviewed model | `<button data-model="${escapeHTML(record.id)}">View details →</button>` | `${detailsButton("data-model", record.id, record.name)}` |
| `renderAllDirectoryEntries`, runtime | `<button data-local-runtime="${escapeHTML(record.id)}">View details →</button>` | `${detailsButton("data-local-runtime", record.id, record.name)}` |
| `renderAllDirectoryEntries`, service | `<button data-inference-service="${escapeHTML(record.id)}">View details →</button>` | `${detailsButton("data-inference-service", record.id, record.name)}` |
| `COLLECTIONS.systems.card` | `<button data-project="${escapeHTML(project.id)}">View details →</button>` | `${detailsButton("data-project", project.id, project.name)}` |
| `COLLECTIONS.specifications.card` | `<button data-specification="${escapeHTML(specification.id)}">View details →</button>` | `${detailsButton("data-specification", specification.id, specification.name)}` |
| `COLLECTIONS.inference.card` | `<button data-inference-service="${escapeHTML(service.id)}">View details →</button>` | `${detailsButton("data-inference-service", service.id, service.name)}` |
| `COLLECTIONS.runtimes.card` | `<button data-local-runtime="${escapeHTML(runtime.id)}">View details →</button>` | `${detailsButton("data-local-runtime", runtime.id, runtime.name)}` |
| `COLLECTIONS.models.card` | `<button data-model="${escapeHTML(model.id)}">View details →</button>` | `${detailsButton("data-model", model.id, model.name)}` |
| robot card (Robots PR) | `<button data-robot="${escapeHTML(robot.id)}">View details →</button>` | `${detailsButton("data-robot", robot.id, robot.name)}` |
| `renderFinderResults` | `<button ${detailAttribute}="${escapeHTML(project.id)}">View details →</button>` | `${detailsButton(detailAttribute, project.id, project.name)}` |

After the edit, `grep -n "View details →\|View source details →" web/app.js` must print nothing.

- [ ] **Step 5: Stretch the target and keep the card's own controls above it**

Append to `web/styles.css`, next to the `.card-footer button` rules:

```css
/* The details control's target covers its whole card; the card's own controls
   and hover-titled facts sit above it, so a tap on an emblem only opens its
   tooltip and Compare only toggles. */
.finder-result { position: relative; }
.card-open::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
}
.project-card .card-badges,
.project-card .compare-toggle,
.project-card .card-source-meta,
.project-card .license-badge,
.finder-result .card-badges {
  position: relative;
  z-index: 2;
}
.project-card:has(.card-open:focus-visible),
.finder-result:has(.card-open:focus-visible) {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Update the six lookups that used the old name**

In `tests/e2e/directory-search.spec.js`, replace every `{ name: "View details →" }` with `{ name: /^View details for / }`. There are six, at the calls on `serviceCard`, `systemCard`, `assistantCard`, and three on `page` after a search narrows to one card.

- [ ] **Step 7: Run everything touching cards**

Run: `npx playwright test tests/e2e/card-click.spec.js tests/e2e/card-badges.spec.js tests/e2e/directory-search.spec.js tests/e2e/record-links.spec.js tests/e2e/card-stars.spec.js`
Expected: PASS.

- [ ] **Step 8: Update the contract**

In `docs/WEB.md` "Behavioral contracts", add: "Clicking anywhere on a card opens its record; the card's Compare control, emblems, and hover-titled facts stay separate targets above it. The details control's accessible name names the record (\"View details for Aider\")." In "Card badges", extend the paragraph that begins "Badges are not controls" with: "Emblems sit above the card's own click target, so a tap on an emblem opens only its tooltip."

- [ ] **Step 9: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/styles.css web/index.html tests/e2e/card-click.spec.js tests/e2e/card-badges.spec.js tests/e2e/directory-search.spec.js docs/WEB.md
git commit -m "Open a record from anywhere on its card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 7: The Finder keeps its place and hands off visibly

**Files:**
- Modify: `web/app.js` (`finderChoice`, `renderFinder`, the Finder click handler in `bindEvents`, `applyFinderToDirectory`, `COLLECTIONS.systems.context`)
- Modify: `web/index.html` (the Systems result row)
- Modify: `web/styles.css` (the Finder chip)
- Create: `tests/e2e/finder-handoff.spec.js`
- Modify: `docs/WEB.md` (the "Browse matches" bullet)

**Interfaces:**
- Produces: `state.directoryRolesLabel` (string or `null`), set with `state.directoryRoles` and cleared with it; `keepFinderInView()`; `revealDirectoryResults()`.

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e/finder-handoff.spec.js`:

```js
const { test, expect } = require("@playwright/test");

const headerBottom = page => page.locator(".site-header").evaluate(header => header.getBoundingClientRect().bottom);

test("a choice keeps the step indicator in view and cards drop the repeated cue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  const top = await page.locator(".finder-shell").evaluate(shell => shell.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(await headerBottom(page));
  await expect(page.locator(".finder-choice-cue", { hasText: "Choose this" })).toHaveCount(0);
});

test("Browse matches lands on the results and shows the Finder's role set as a removable filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
  await page.locator("[data-finder-directory]").click();

  const panelTop = await page.locator("#systems-directory-panel").evaluate(panel => panel.getBoundingClientRect().top);
  expect(panelTop).toBeLessThan(900);
  expect(panelTop).toBeGreaterThanOrEqual((await headerBottom(page)) - 1);
  const chip = page.getByRole("button", { name: /Finder: Write and maintain software/ });
  await expect(chip).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");

  await chip.click();
  await expect(chip).toBeHidden();
  await expect(page.locator("#result-count")).not.toContainText("Finder match");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx playwright test tests/e2e/finder-handoff.spec.js`
Expected: FAIL. The shell's top sits under the header, "Choose this" cues exist, and no Finder chip is visible.

- [ ] **Step 3: Drop the default cue**

Replace `finderChoice` in `web/app.js`:

```js
function finderChoice(key, item) {
  return `<button class="finder-choice" data-finder-choice="${escapeHTML(key)}" data-finder-value="${escapeHTML(item.id)}">
    ${item.cue ? `<span class="finder-choice-cue">${escapeHTML(item.cue)}</span>` : ""}
    <strong>${escapeHTML(item.label)}</strong>
    <span>${escapeHTML(item.description)}</span>
  </button>`;
}
```

- [ ] **Step 4: Keep the step indicator in view**

Add after `renderFinder` in `web/app.js`:

```js
// A choice replaces the panel's content, which can leave the step indicator
// under the sticky header; bring the shell's top back into view, instantly.
function keepFinderInView() {
  const shell = $(".finder-shell");
  const clearance = $(".site-header")?.getBoundingClientRect().height || 0;
  const top = shell.getBoundingClientRect().top;
  if (top < clearance) window.scrollBy({ top: top - clearance - 12 });
}
```

In the `#finder-content` click handler in `bindEvents`, call `keepFinderInView();` right after each of the three `renderFinder();` calls that follow a choice, Back, or Start over.

- [ ] **Step 5: Land the handoff on the results with a visible chip**

1. Add `directoryRolesLabel: null,` to the `state` object literal. Wherever the code sets `state.directoryRoles = null;`, also set `state.directoryRolesLabel = null;`.
2. In `applyFinderToDirectory`, replace `state.directoryRoles = goalConfig.roles.length > 1 ? [...goalConfig.roles] : null;` with:

```js
  state.directoryRoles = goalConfig.roles.length > 1 ? [...goalConfig.roles] : null;
  state.directoryRolesLabel = state.directoryRoles ? goalConfig.label : null;
```

3. Add after `applyFinderToDirectory`:

```js
// The handoff lands on the results the Finder chose, not on the hero above them.
function revealDirectoryResults() {
  const panel = $(".collection-panel:not([hidden])");
  if (!panel) return;
  const clearance = $(".site-header")?.getBoundingClientRect().height || 0;
  window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - clearance - 12 });
}
```

4. In `applyFinderToDirectory`, call `revealDirectoryResults();` after each of its three `activateView("directory");` calls.
5. In `web/index.html`, in the Systems panel's result row, insert before `<p id="result-count" …>`: `<button id="finder-roles-chip" class="filter-chip" type="button" hidden></button>`.
6. In `COLLECTIONS.systems.context()`, before its `return`, add:

```js
      const chip = $("#finder-roles-chip");
      chip.hidden = !state.directoryRoles;
      chip.innerHTML = state.directoryRolesLabel
        ? `Finder: ${escapeHTML(state.directoryRolesLabel)}<span aria-hidden="true"> ×</span><span class="visually-hidden">, remove</span>`
        : "";
```

7. In `bindEvents`, add:

```js
  $("#finder-roles-chip").addEventListener("click", () => {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
    state.page.systems = 1;
    renderProjects();
  });
```

8. Append to `web/styles.css`:

```css
.filter-chip {
  padding: .3rem .55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-chip);
  background: var(--panel);
  color: var(--text);
  font: 600 .74rem var(--font-body);
  cursor: pointer;
}
.filter-chip:hover { border-color: var(--cyan); }
```

- [ ] **Step 6: Run the Finder tests**

Run: `npx playwright test tests/e2e/finder-handoff.spec.js tests/e2e/directory-search.spec.js`
Expected: PASS, including the existing Finder paths (local runtime, assistant, inference).

- [ ] **Step 7: Update the contract**

In `docs/WEB.md`, extend the bullet that begins "“Browse matches” preserves every eligible system role" with: "The handoff lands on the results rather than the page top, and a multi-role set shows as a removable \"Finder:\" chip beside the result count."

- [ ] **Step 8: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/index.html web/styles.css tests/e2e/finder-handoff.spec.js docs/WEB.md
git commit -m "Keep the Finder in view and show its handoff filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 8: Remove the hero map's contradictory legend

**Files:**
- Modify: `web/index.html` (delete the `.map-legend` element)
- Modify: `web/styles.css` (delete every `.map-legend` rule)
- Modify: `tests/e2e/directory-search.spec.js` (the atlas map test)

**Interfaces:** none.

- [ ] **Step 1: Write the failing assertion**

In `tests/e2e/directory-search.spec.js`, in the test "the atlas orbital field spans the five landscape nodes", add:

```js
  // Every node is labelled; a colour legend could only disagree with them.
  await expect(page.locator(".atlas-map .map-legend")).toHaveCount(0);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/directory-search.spec.js -g "atlas orbital"`
Expected: FAIL, count 1.

- [ ] **Step 3: Delete the legend**

Delete the `<div class="map-legend">…</div>` line from the hero map in `web/index.html`, and every rule whose selector starts with `.map-legend` in `web/styles.css`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx playwright test tests/e2e/directory-search.spec.js -g "atlas orbital" && npx playwright test tests/e2e/page-health.spec.js`
Expected: PASS.

- [ ] **Step 5: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/index.html web/styles.css tests/e2e/directory-search.spec.js
git commit -m "Remove the hero map legend that contradicted its nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 9: Say how licence evidence is kept, accurately

**Files:**
- Modify: `web/index.html` (the `license-evidence.json` endpoint description in the API view)
- Modify: `tests/test_web.js`

**Interfaces:** none.

- [ ] **Step 1: Write the failing unit test**

Append to `tests/test_web.js`:

```js
test("the API view does not call web-page evidence pinned", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  // docs/DATA_MODEL.md: web terms carry "no claim of immutability".
  assert.doesNotMatch(html, /pinned to the exact file or page/);
  assert.match(html, /web page records the date it was read/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Fix the sentence**

In `web/index.html`, replace

```html
<p>The reviewed license and terms evidence behind each record, scoped to the components it covers and pinned to the exact file or page it was read from.</p>
```

with

```html
<p>The reviewed license and terms evidence behind each record, scoped to the components it covers. Evidence from a Git repository is pinned to the exact file; evidence from a web page records the date it was read.</p>
```

- [ ] **Step 4: Run it and watch it pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Stamp, commit, open the PR**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/index.html tests/test_web.js
git commit -m "Describe licence evidence as pinned files and dated pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh pr create --fill
```

---

## After the last task

- Run the full browser verification matrix in `docs/WEB.md` once against `main`, including steps 2, 24, and 26 as amended.
- Groom `BACKLOG.md` in its own PR: record Phase 0 as landed and point "Reader experience" at the front-door spec.
