# Directory Card Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tags row on system, inference-service, local-runtime, and reviewed-model cards with up to four scanning badges derived from reviewed fields, each explaining itself, listed in the Taxonomy view.

**Architecture:** Badges are defined once in `web/app-core.js` (`CARD_BADGES`), assigned to scopes in priority order (`CARD_BADGE_SETS`), and resolved by the pure function `cardBadges(kind, record)`. `web/app.js` renders them through one `badgeRow` helper in both the collection grids and the mixed All grid. `scripts/build_web_payload.py` adds the fields badges test to the systems boot payload. No `directory/*.json` record or public endpoint changes.

**Tech Stack:** Vanilla JavaScript (`web/app-core.js`, `web/app.js`), CSS custom properties (`web/styles.css`), Node test runner (`tests/test_web.js`), Playwright (`tests/e2e/`), Python 3.12 with `uv` (`scripts/build_web_payload.py`).

**Spec:** `docs/superpowers/specs/2026-09-12-directory-card-badges-design.md`

## Global Constraints

- Every command runs from the worktree root. Python runs through `uv run`; JavaScript through `node`, `npm`, or `npx`. See `AGENTS.md` "Commands".
- A badge only asserts presence: a boolean field must be exactly `true`; an array field must contain one of the named values. Missing, `null`, `false`, and empty never produce a badge. (Spec decision 1.)
- At most four badges per card, in the order listed in `CARD_BADGE_SETS`. (Spec decision 4.)
- Record kinds are the ones `parseRecordReference` already uses: `system`, `spec`, `inference`, `runtime`, `model`.
- Specifications and models whose `review_status` is not `"reviewed"` get no badges. (Spec decision 5.)
- Badges are not links, buttons, or tab stops. (Spec decision 6.)
- No colour or `border-radius` literal outside the `:root` token blocks; `tests/test_web.js` enforces both. The body text token is `--text`, not `--ink`.
- After changing `web/app.js`, `web/app-core.js`, `web/styles.css`, or anything under `web/app/`, run `node scripts/build_asset_version.mjs` before committing; `--check` fails otherwise.
- Never edit `directory/*.json`. If a record looks misclassified, report it; do not fix it here.
- User-facing copy is plain language; no internal vocabulary such as "badge set", "scope", or "boot payload" appears on the page.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Badge catalog and resolver in `app-core.js`

**Files:**
- Modify: `web/app-core.js` (insert before the final `return {` block at line 285; add exports to that block)
- Test: `tests/test_web.js` (extend the `require` on line 6; append tests at the end of the file)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `CARD_BADGES: { [id: string]: { name: string, definition: string, test: { field: string, anyOf?: string[] } } }`
  - `CARD_BADGE_SETS: { [scope: string]: string[] }` with scope keys `system:agent_system`, `system:memory_system`, `system:assistant_system`, `inference`, `runtime`, `model`
  - `cardBadges(kind: string, record: object) -> Array<{ id: string, name: string, definition: string }>`
  - `cardBadgeGlossary() -> Array<{ id: string, name: string, definition: string, scopes: string[] }>`

- [ ] **Step 1: Write the failing unit tests**

In `tests/test_web.js`, replace line 6 with:

```js
const { CARD_BADGES, CARD_BADGE_SETS, cardBadgeGlossary, cardBadges, cycleThemePreference, directoryDefaults, filterAndSortProjects, filterDirectoryEntries, filterInferenceServices, filterLocalRuntimes, filterModels, filterScoredCollection, filterSpecifications, matchesProject, paginate, parseRecordReference, parseViewId, shareRecordPath, updateComparisonSelection } = require("../web/app-core.js");
```

Append to the end of `tests/test_web.js`:

```js
const badgeNames = badges => badges.map(badge => badge.name);

test("agent-system badges follow priority order and stop at four", () => {
  const record = {
    system_family: "agent_system",
    local_first: true,
    execution_boundaries: ["host", "container"],
    agent_capabilities: ["mcp", "browser_control"],
    deployment: ["self_hosted"],
  };
  assert.deepEqual(badgeNames(cardBadges("system", record)), ["Local-first", "Sandboxed execution", "Browser control", "MCP"]);
});

test("badges come from the record's own family", () => {
  const memory = {
    system_family: "memory_system",
    local_first: false,
    human_editable: true,
    retrieval_modes: ["graph_traversal"],
    architectures: ["plain_files"],
    agent_capabilities: ["mcp"],
  };
  assert.deepEqual(badgeNames(cardBadges("system", memory)), ["Editable by you", "Graph retrieval", "Plain files"]);
  assert.deepEqual(cardBadges("system", { system_family: "agent_system", human_editable: true }), []);
});

test("missing, null, false, empty, and non-boolean fields never produce a badge", () => {
  const records = [
    { system_family: "agent_system" },
    { system_family: "agent_system", local_first: null, execution_boundaries: null, agent_capabilities: [], deployment: [] },
    { system_family: "agent_system", local_first: false },
    { system_family: "agent_system", local_first: "true" },
    { system_family: "agent_system", deployment: "self_hosted" },
  ];
  for (const record of records) assert.deepEqual(cardBadges("system", record), [], JSON.stringify(record));
});

test("specifications, unreviewed models, and unknown kinds or families get no badges", () => {
  assert.deepEqual(cardBadges("spec", { status: "published", licenses: ["MIT"] }), []);
  assert.deepEqual(cardBadges("model", { review_status: "imported", distribution_modes: ["downloadable_weights"] }), []);
  assert.deepEqual(cardBadges("model", { distribution_modes: ["downloadable_weights"] }), []);
  assert.deepEqual(badgeNames(cardBadges("model", { review_status: "reviewed", distribution_modes: ["downloadable_weights"] })), ["Downloadable weights"]);
  assert.deepEqual(cardBadges("toString", { local_first: true }), []);
  assert.deepEqual(cardBadges("system", { system_family: "constructor", local_first: true }), []);
});

test("inference-service and local-runtime badges share only the identical API fact", () => {
  assert.deepEqual(
    badgeNames(cardBadges("inference", { model_sources: ["customer_supplied"], delivery_modes: ["batch"], api_styles: ["anthropic_compatible"] })),
    ["Bring your own weights", "Anthropic-compatible API", "Batch"],
  );
  assert.deepEqual(
    badgeNames(cardBadges("runtime", { accelerators: ["cuda", "metal"], serving_modes: ["distributed_serving"], api_styles: ["openai_compatible"] })),
    ["Apple Metal", "Distributed serving"],
  );
});

test("every badge list names a defined badge and every defined badge is listed", () => {
  const listed = new Set(Object.values(CARD_BADGE_SETS).flat());
  for (const id of listed) assert.ok(Object.hasOwn(CARD_BADGES, id), `${id} is listed but not defined`);
  for (const id of Object.keys(CARD_BADGES)) assert.ok(listed.has(id), `${id} is defined but never shown`);
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    assert.ok(badge.name && badge.definition, `${id} needs a name and a definition`);
    assert.ok(Array.isArray(badge.test.anyOf) ? badge.test.anyOf.length > 0 : badge.test.anyOf === undefined, `${id} has a malformed test`);
  }
});

test("the badge glossary lists each badge once with every place it appears", () => {
  const glossary = cardBadgeGlossary();
  assert.equal(glossary.length, Object.keys(CARD_BADGES).length);
  assert.equal(new Set(glossary.map(entry => entry.name)).size, glossary.length);
  assert.deepEqual(glossary.find(entry => entry.id === "local-first").scopes, ["Agent systems", "Memory systems", "Assistant systems"]);
  assert.deepEqual(glossary.find(entry => entry.id === "anthropic-compatible-api").scopes, ["Inference services", "Local runtimes"]);
});

// Published-data guards: a renamed taxonomy value or a badge nothing can earn
// fails here instead of silently emptying cards.
const readWebJSON = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", file), "utf8"));

const BADGE_FIELD_VOCABULARIES = {
  execution_boundaries: "execution_boundaries",
  agent_capabilities: "agent_capabilities",
  deployment: "deployment_modes",
  retrieval_modes: "retrieval_modes",
  architectures: "architectures",
  model_sources: "inference_model_sources",
  delivery_modes: "inference_delivery_modes",
  api_styles: "inference_api_styles",
  accelerators: "runtime_accelerators",
  serving_modes: "runtime_serving_modes",
  distribution_modes: "model_distribution_modes",
};

test("every value a badge tests exists in its taxonomy vocabulary", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    if (!badge.test.anyOf) continue;
    const group = BADGE_FIELD_VOCABULARIES[badge.test.field];
    assert.ok(group, `${id} tests ${badge.test.field}, which has no known vocabulary`);
    const known = new Set(taxonomy[group].map(item => item.id));
    for (const value of badge.test.anyOf) assert.ok(known.has(value), `${id} names unknown ${group} value ${value}`);
  }
});

function publishedBadgeScopes() {
  const projects = readWebJSON("projects.json").projects;
  const family = name => ["system", projects.filter(record => record.system_family === name)];
  return {
    "system:agent_system": family("agent_system"),
    "system:memory_system": family("memory_system"),
    "system:assistant_system": family("assistant_system"),
    inference: ["inference", readWebJSON("inference-services.json").services],
    runtime: ["runtime", readWebJSON("local-runtimes.json").runtimes],
    model: ["model", readWebJSON("app/models.json").models.filter(record => record.review_status === "reviewed")],
  };
}

test("every badge appears on at least one published card in each place it is listed", () => {
  const scopes = publishedBadgeScopes();
  assert.deepEqual(Object.keys(scopes).sort(), Object.keys(CARD_BADGE_SETS).sort());
  for (const [scope, ids] of Object.entries(CARD_BADGE_SETS)) {
    const [kind, records] = scopes[scope];
    assert.ok(records.length > 0, `${scope} has no published records`);
    for (const id of ids) {
      assert.ok(records.some(record => cardBadges(kind, record).some(badge => badge.id === id)), `${id} never appears on a ${scope} card`);
    }
  }
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/test_web.js 2>&1 | tail -20`
Expected: FAIL — `cardBadges is not a function` (the destructured names are `undefined`).

- [ ] **Step 3: Implement the catalog and resolver**

In `web/app-core.js`, insert immediately before the line `  return {` (currently line 285):

```js
  // Card badges flag reviewed traits a reader scans a grid for. Each badge is
  // defined once and listed by id wherever it applies, so a name shared across
  // collections always tests the same field and value. A badge only asserts
  // presence: a missing, null, false, or empty field never produces one, and a
  // card without a badge claims nothing is absent. See docs/WEB.md "Card badges".
  const CARD_BADGES = {
    "local-first": {
      name: "Local-first",
      definition: "Designed to work with its primary data on your own device; cloud services, where offered, are optional.",
      test: { field: "local_first" },
    },
    "self-hostable": {
      name: "Self-hostable",
      definition: "Ships a service you can deploy and run on infrastructure you control.",
      test: { field: "deployment", anyOf: ["self_hosted"] },
    },
    "sandboxed-execution": {
      name: "Sandboxed execution",
      definition: "Can run agent actions in a local container or an external sandbox.",
      test: { field: "execution_boundaries", anyOf: ["container", "external_sandbox"] },
    },
    "browser-control": {
      name: "Browser control",
      definition: "Can operate a web browser as part of its work.",
      test: { field: "agent_capabilities", anyOf: ["browser_control"] },
    },
    mcp: {
      name: "MCP",
      definition: "Can use tools and data sources through the Model Context Protocol.",
      test: { field: "agent_capabilities", anyOf: ["mcp"] },
    },
    "editable-by-you": {
      name: "Editable by you",
      definition: "People can review and edit the data it stores.",
      test: { field: "human_editable" },
    },
    "graph-retrieval": {
      name: "Graph retrieval",
      definition: "Can recall related memories by following connections in a graph.",
      test: { field: "retrieval_modes", anyOf: ["graph_traversal"] },
    },
    "plain-files": {
      name: "Plain files",
      definition: "Keeps data in human-readable files, such as Markdown.",
      test: { field: "architectures", anyOf: ["plain_files"] },
    },
    "time-aware-recall": {
      name: "Time-aware recall",
      definition: "Can recall what was true as of a given point in time.",
      test: { field: "retrieval_modes", anyOf: ["temporal"] },
    },
    "desktop-app": {
      name: "Desktop app",
      definition: "Available as a desktop application you install and run.",
      test: { field: "deployment", anyOf: ["desktop"] },
    },
    "mobile-app": {
      name: "Mobile app",
      definition: "Available as a mobile application you install and run.",
      test: { field: "deployment", anyOf: ["mobile"] },
    },
    "bring-your-own-weights": {
      name: "Bring your own weights",
      definition: "Customers can import or deploy their own eligible models or weights.",
      test: { field: "model_sources", anyOf: ["customer_supplied"] },
    },
    "dedicated-endpoints": {
      name: "Dedicated endpoints",
      definition: "Customers can get isolated serving resources or an endpoint of their own.",
      test: { field: "delivery_modes", anyOf: ["dedicated_endpoint"] },
    },
    "anthropic-compatible-api": {
      name: "Anthropic-compatible API",
      definition: "Implements a documented subset or adaptation of Anthropic API conventions.",
      test: { field: "api_styles", anyOf: ["anthropic_compatible"] },
    },
    "reserved-capacity": {
      name: "Reserved capacity",
      definition: "Customers can reserve a defined throughput tier or capacity allocation.",
      test: { field: "delivery_modes", anyOf: ["reserved_capacity"] },
    },
    batch: {
      name: "Batch",
      definition: "Accepts asynchronous jobs that trade an immediate response for separate capacity or pricing.",
      test: { field: "delivery_modes", anyOf: ["batch"] },
    },
    "apple-metal": {
      name: "Apple Metal",
      definition: "Documented to run on Apple silicon GPUs through Metal.",
      test: { field: "accelerators", anyOf: ["metal"] },
    },
    "amd-rocm": {
      name: "AMD ROCm",
      definition: "Documented to run on AMD GPUs through ROCm.",
      test: { field: "accelerators", anyOf: ["rocm"] },
    },
    "distributed-serving": {
      name: "Distributed serving",
      definition: "Can spread a model or its requests across several accelerators or hosts.",
      test: { field: "serving_modes", anyOf: ["distributed_serving"] },
    },
    npu: {
      name: "NPU",
      definition: "Documented to run on a dedicated neural processing unit.",
      test: { field: "accelerators", anyOf: ["npu"] },
    },
    "downloadable-weights": {
      name: "Downloadable weights",
      definition: "The developer publishes weights you can download and run under the recorded terms.",
      test: { field: "distribution_modes", anyOf: ["downloadable_weights"] },
    },
    "developer-api": {
      name: "Developer API",
      definition: "The developer offers the model through its own managed API.",
      test: { field: "distribution_modes", anyOf: ["developer_api"] },
    },
    "third-party-hosting": {
      name: "Hosted by third parties",
      definition: "Unrelated inference operators document a hosted path for the model.",
      test: { field: "distribution_modes", anyOf: ["third_party_hosting"] },
    },
  };

  // Order is priority: a card shows the first MAX_CARD_BADGES that match.
  const CARD_BADGE_SETS = {
    "system:agent_system": ["local-first", "sandboxed-execution", "browser-control", "mcp", "self-hostable"],
    "system:memory_system": ["local-first", "editable-by-you", "graph-retrieval", "plain-files", "time-aware-recall"],
    "system:assistant_system": ["local-first", "self-hostable", "desktop-app", "mobile-app"],
    inference: ["bring-your-own-weights", "dedicated-endpoints", "anthropic-compatible-api", "reserved-capacity", "batch"],
    runtime: ["apple-metal", "amd-rocm", "distributed-serving", "anthropic-compatible-api", "npu"],
    model: ["downloadable-weights", "developer-api", "third-party-hosting"],
  };
  const CARD_BADGE_SET_NAMES = {
    "system:agent_system": "Agent systems",
    "system:memory_system": "Memory systems",
    "system:assistant_system": "Assistant systems",
    inference: "Inference services",
    runtime: "Local runtimes",
    model: "Reviewed models",
  };
  const MAX_CARD_BADGES = 4;

  function cardBadgeSetKey(kind, record) {
    if (kind === "system") return `system:${record.system_family}`;
    if (kind === "model") return record.review_status === "reviewed" ? "model" : null;
    return kind;
  }

  function matchesBadgeTest(record, test) {
    const value = record[test.field];
    if (!test.anyOf) return value === true;
    return Array.isArray(value) && value.some(item => test.anyOf.includes(item));
  }

  function cardBadges(kind, record) {
    const key = cardBadgeSetKey(kind, record);
    if (!key || !Object.hasOwn(CARD_BADGE_SETS, key)) return [];
    return CARD_BADGE_SETS[key]
      .filter(id => matchesBadgeTest(record, CARD_BADGES[id].test))
      .slice(0, MAX_CARD_BADGES)
      .map(id => ({ id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition }));
  }

  // One entry per badge, in first-listed order, naming every place it appears.
  function cardBadgeGlossary() {
    const entries = new Map();
    for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
      for (const id of ids) {
        if (!entries.has(id)) entries.set(id, { id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, scopes: [] });
        entries.get(id).scopes.push(CARD_BADGE_SET_NAMES[key]);
      }
    }
    return [...entries.values()];
  }

```

Then replace the start of the returned object:

```js
  return {
    compareProjects,
```

with:

```js
  return {
    CARD_BADGES,
    CARD_BADGE_SETS,
    cardBadgeGlossary,
    cardBadges,
    compareProjects,
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/test_web.js 2>&1 | tail -8`
Expected: `# fail 0`. Also run `node --check web/app-core.js` and `npm run lint:js` — both clean.

- [ ] **Step 5: Commit**

```bash
node scripts/build_asset_version.mjs
git add web/app-core.js web/index.html tests/test_web.js
git commit -m "Define card badges and resolve them per record

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Carry badge fields in the systems boot payload

**Files:**
- Modify: `scripts/build_web_payload.py:30-35` (`BOOT_FIELDS["systems"]`)
- Regenerate: `web/app/systems.json`, `web/app/detail/system/*.json`, `web/index.html` (asset version)
- Test: `tests/test_web.js` (append)

**Interfaces:**
- Consumes: `CARD_BADGES`, `CARD_BADGE_SETS` from Task 1.
- Produces: systems boot records carrying `human_editable`, `execution_boundaries`, `agent_capabilities`, and `retrieval_modes` whenever the published record has them. Task 3 renders from these.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_web.js`:

```js
// Cards paint from the boot payload before any detail file lands, so every
// field a badge tests must be in boot for every record that carries it.
test("every field a badge tests reaches the boot payload", () => {
  const boots = {
    system: [readWebJSON("projects.json").projects, readWebJSON("app/systems.json").systems],
    inference: [readWebJSON("inference-services.json").services, readWebJSON("app/inference.json").inference],
    runtime: [readWebJSON("local-runtimes.json").runtimes, readWebJSON("app/runtimes.json").runtimes],
    model: [readWebJSON("models.json").models, readWebJSON("app/models.json").models],
  };
  for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
    const kind = key.split(":")[0];
    const [published, boot] = boots[kind];
    const bootById = new Map(boot.map(record => [record.id, record]));
    for (const id of ids) {
      const { field } = CARD_BADGES[id].test;
      for (const record of published) {
        if (!(field in record)) continue;
        assert.ok(field in bootById.get(record.id), `${kind}/${record.id} boot record lacks ${field}, which the ${id} badge tests`);
      }
    }
  }
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test --test-name-pattern="reaches the boot payload" tests/test_web.js 2>&1 | grep -E "not ok|lacks" | head -3`
Expected: FAIL naming a system record whose boot record lacks `human_editable` (or `execution_boundaries`, `agent_capabilities`, `retrieval_modes`).

- [ ] **Step 3: Record the current gzipped size**

Run: `gzip -9 -c web/app/systems.json | wc -c`
Write the number down; it goes in the PR description.

- [ ] **Step 4: Add the fields**

In `scripts/build_web_payload.py`, replace:

```python
    "systems": (
        "id", "name", "system_family", "primary_role", "secondary_roles", "score_profile",
        "stars", "status", "source_model", "licenses", "license_review_status", "description",
        "agent_relation", "architectures", "repo", "url", "deployment", "agent_interfaces",
        "local_first", "superseded_by",
    ),
```

with:

```python
    "systems": (
        "id", "name", "system_family", "primary_role", "secondary_roles", "score_profile",
        "stars", "status", "source_model", "licenses", "license_review_status", "description",
        "agent_relation", "architectures", "repo", "url", "deployment", "agent_interfaces",
        "local_first", "superseded_by",
        # Card badges test these; see CARD_BADGES in web/app-core.js.
        "human_editable", "execution_boundaries", "agent_capabilities", "retrieval_modes",
    ),
```

- [ ] **Step 5: Regenerate and confirm the tests pass**

```bash
uv run python scripts/build_web_payload.py
node scripts/build_asset_version.mjs
node --test tests/test_web.js 2>&1 | tail -4
uv run python -m unittest tests.test_web_payload -v 2>&1 | tail -3
gzip -9 -c web/app/systems.json | wc -c
```

Expected: `# fail 0`; payload tests `OK` (the complement rule still holds because the fields move from detail to boot); a new size. Record the delta.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_web_payload.py web/app web/index.html tests/test_web.js
git commit -m "Carry card-badge fields in the systems boot payload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Render badges on cards

**Files:**
- Modify: `web/app.js` — add helpers after `modelModalityRoute` (line 596-599); replace tags markup at lines 639, 648, 657, 667 (mixed All grid), 726 and 734 (systems), 797 (inference), 827 (runtimes), 860 (models)
- Modify: `web/styles.css:780-789` (`.project-card > p`, `.tags`) and append new rules after `.tags span`
- Create: `tests/e2e/card-badges.spec.js`

**Interfaces:**
- Consumes: `AtlasCore.cardBadges(kind, record)` from Task 1; boot fields from Task 2.
- Produces: markup `<ul class="card-badges">` of `<li class="card-badge" title="{definition}">{name}<span class="visually-hidden">: {definition}</span></li>`; `<div class="card-source-meta">` on reviewed-model cards. Task 4 reuses `.visually-hidden` nowhere else; later tasks rely only on these class names in tests.

- [ ] **Step 1: Write the failing end-to-end tests**

Create `tests/e2e/card-badges.spec.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadges } = require("../../web/app-core.js");

// Expectations come from the same published files and resolver the page uses,
// and each fixture asserts the property it was chosen for, so a data change
// fails with a clear message instead of a confusing locator timeout.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const projects = read("projects.json").projects;
const runtimes = read("local-runtimes.json").runtimes;
const reviewedModels = read("app/models.json").models.filter(model => model.review_status === "reviewed");

const byId = (records, id) => records.find(record => record.id === id);
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A badge's text is its name followed by the hidden ": definition".
const namePatterns = badges => badges.map(badge => new RegExp("^" + escapeRegExp(badge.name) + ":"));

// OpenClaw matches all five agent-system badges, so its card shows the cap.
const openclaw = byId(projects, "openclaw");
// Chroma matches no memory-system badge, so its card has no badge row.
const chroma = byId(projects, "chroma");
const ollama = byId(runtimes, "ollama");
const reviewedModel = byId(reviewedModels, "model-alibaba-qwen2-5-coder-0-5b");

test("an agent-system card shows its first four badges in priority order", async ({ page }) => {
  const expected = cardBadges("system", openclaw);
  expect(expected.map(badge => badge.name)).toEqual(["Local-first", "Sandboxed execution", "Browser control", "MCP"]);

  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const card = page.locator('#project-grid .project-card:has([data-project="openclaw"])');
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  await expect(card.locator(".tags")).toHaveCount(0);
});

test("a card without badges omits the row and keeps its footer at the bottom", async ({ page }) => {
  expect(cardBadges("system", chroma)).toEqual([]);

  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(chroma.name);
  const card = page.locator('#project-grid .project-card:has([data-project="chroma"])');
  await expect(card).toBeVisible();
  await expect(card.locator(".card-badges")).toHaveCount(0);
  const cardBox = await card.boundingBox();
  const footerBox = await card.locator(".card-footer").boundingBox();
  // The card's bottom padding is 1.4rem; anything more means the footer floated up.
  expect(cardBox.y + cardBox.height - (footerBox.y + footerBox.height)).toBeLessThanOrEqual(24);
});

test("badges explain themselves without adding tab stops", async ({ page }) => {
  const [first] = cardBadges("system", openclaw);

  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const badges = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badges');
  await expect(badges.locator(".card-badge").first()).toHaveAttribute("title", first.definition);
  await expect(badges.locator(".card-badge .visually-hidden").first()).toHaveText(`: ${first.definition}`);
  await expect(badges.locator("a, button, [tabindex]")).toHaveCount(0);
});

test("a record shows the same badges in its collection grid and in All", async ({ page }) => {
  const runtimeBadges = cardBadges("runtime", ollama);
  expect(runtimeBadges.length).toBeGreaterThan(0);

  await page.goto("/");
  await page.locator("#all-directory-search").fill(openclaw.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-project="openclaw"]) .card-badge'))
    .toHaveText(namePatterns(cardBadges("system", openclaw)));

  await page.locator("#all-directory-search").fill(ollama.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));

  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-search").fill(ollama.name);
  await expect(page.locator('#runtime-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));
});

test("a reviewed-model card keeps its models.dev modality beside its badges", async ({ page }) => {
  const expected = cardBadges("model", reviewedModel);
  expect(expected.length).toBeGreaterThan(0);

  await page.goto("/?view=models");
  await page.locator("#model-search").fill(reviewedModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${reviewedModel.id}"])`);
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  const meta = card.locator(".card-source-meta");
  await expect(meta).toContainText("→");
  await expect(meta).toHaveAttribute("title", "From models.dev source metadata, not Atlas reviewed");
});

test("badges stay legible in the dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const badge = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  await expect(badge).toBeVisible();
  const [color, background] = await badge.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.color, style.backgroundColor];
  });
  expect(color).not.toBe(background);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/card-badges.spec.js 2>&1 | tail -15`
Expected: the data preconditions pass, then locator assertions fail because no `.card-badge` element exists. If a precondition such as `toEqual(["Local-first", ...])` fails instead, the data changed: pick a new fixture that satisfies the stated property and note it in the commit message.

- [ ] **Step 3: Add the rendering helpers**

In `web/app.js`, immediately after the closing `}` of `modelModalityRoute` (line 599), insert:

```js

// Badges replace the tags row on system, inference-service, local-runtime, and
// reviewed-model cards. A card with none omits the row rather than printing an
// empty strip. The definition rides in the title for pointers and in hidden
// text for screen readers; badges are never controls.
function badgeRow(badges) {
  if (!badges.length) return "";
  return `<ul class="card-badges">${badges.map(badge => `<li class="card-badge" title="${escapeHTML(badge.definition)}">${escapeHTML(badge.name)}<span class="visually-hidden">: ${escapeHTML(badge.definition)}</span></li>`).join("")}</ul>`;
}

// Modality and family on a reviewed-model card come from models.dev, not from
// Atlas review, so they sit beside the badges as attributed plain text.
function modelSourceMeta(model) {
  const parts = [modelModalityRoute(model), model.source_metadata.family].filter(Boolean);
  return `<div class="card-source-meta" title="From models.dev source metadata, not Atlas reviewed">${parts.map(part => `<span>${escapeHTML(part)}</span>`).join("")}</div>`;
}
```

- [ ] **Step 4: Replace the tags rows in the mixed All grid**

In `renderAllDirectoryEntries`, make these four replacements.

Reviewed model — replace:

```js
        <div class="tags"><span>${escapeHTML(modelModalityRoute(record))}</span>${record.source_metadata.family ? `<span>${escapeHTML(record.source_metadata.family)}</span>` : ""}</div>
```

with:

```js
        ${badgeRow(AtlasCore.cardBadges("model", record))}${modelSourceMeta(record)}
```

Local runtime — replace:

```js
        <div class="tags">${record.accelerators.slice(0, 3).map(item => `<span>${escapeHTML(taxonomyName("runtime_accelerators", item))}</span>`).join("")}</div>
```

with:

```js
        ${badgeRow(AtlasCore.cardBadges("runtime", record))}
```

Inference service — replace:

```js
        <div class="tags">${record.delivery_modes.slice(0, 3).map(item => `<span>${escapeHTML(taxonomyName("inference_delivery_modes", item))}</span>`).join("")}</div>
```

with:

```js
        ${badgeRow(AtlasCore.cardBadges("inference", record))}
```

System — replace:

```js
      <div class="tags">${record.architectures.slice(0, 3).map(item => `<span>${escapeHTML(architectureName(item))}</span>`).join("")}</div>
```

with:

```js
      ${badgeRow(AtlasCore.cardBadges("system", record))}
```

- [ ] **Step 5: Replace the tags rows in the collection grids**

In `COLLECTIONS.systems.card`, delete the line:

```js
    const tags = [project.agent_relation, ...project.architectures.slice(0, 3)];
```

and replace:

```js
      <div class="tags">${tags.map(tag => `<span>${escapeHTML(label(tag))}</span>`).join("")}</div>
```

with:

```js
      ${badgeRow(AtlasCore.cardBadges("system", project))}
```

In `COLLECTIONS.inference.card`, replace:

```js
    <div class="tags">${service.delivery_modes.map(item => `<span>${escapeHTML(taxonomyName("inference_delivery_modes", item))}</span>`).join("")}</div>
```

with:

```js
    ${badgeRow(AtlasCore.cardBadges("inference", service))}
```

In `COLLECTIONS.runtimes.card`, replace:

```js
    <div class="tags">${runtime.accelerators.map(item => `<span>${escapeHTML(taxonomyName("runtime_accelerators", item))}</span>`).join("")}</div>
```

with:

```js
    ${badgeRow(AtlasCore.cardBadges("runtime", runtime))}
```

In `COLLECTIONS.models.card`, replace:

```js
        <div class="tags"><span>${escapeHTML(modelModalityRoute(model))}</span>${model.source_metadata.family ? `<span>${escapeHTML(model.source_metadata.family)}</span>` : ""}</div>
```

with:

```js
        ${badgeRow(AtlasCore.cardBadges("model", model))}${modelSourceMeta(model)}
```

Leave `importedModelCard` and `COLLECTIONS.specifications.card` unchanged. Then run `npm run lint:js`; if `architectureName` or `label` is now reported unused, check with `grep -n "architectureName(\|label(" web/app.js` and remove only a helper that has no remaining caller.

- [ ] **Step 6: Style the badges**

In `web/styles.css`, replace:

```css
.project-card > p { margin-top: .2rem; color: var(--muted); font-size: .91rem; line-height: 1.6; }
.tags { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: auto; padding-top: 1rem; }
```

with:

```css
/* The description absorbs spare height, so the footer sits at the bottom of
   every card whether or not a badge or tags row follows it. */
.project-card > p { flex-grow: 1; margin-top: .2rem; color: var(--muted); font-size: .91rem; line-height: 1.6; }
.tags { display: flex; flex-wrap: wrap; gap: .35rem; padding-top: 1rem; }
```

Immediately after the `.tags span { … }` rule, insert:

```css
.card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem;
  margin: 0;
  padding: 1rem 0 0;
  list-style: none;
}
.card-badge {
  padding: .28rem .5rem;
  border: 1px solid color-mix(in srgb, var(--cyan) 38%, var(--line));
  border-radius: var(--radius-chip);
  background: color-mix(in srgb, var(--cyan) 9%, var(--bg-elevated));
  color: var(--text);
  font: 600 .64rem var(--font-body);
  cursor: help;
}
.card-source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem;
  padding-top: .55rem;
  color: var(--muted);
  font: .62rem var(--font-mono);
}
.card-source-meta span + span::before { content: "·"; margin-right: .35rem; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 7: Run every web test and confirm they pass**

```bash
node --check web/app.js
node scripts/build_asset_version.mjs
node --test tests/test_web.js 2>&1 | tail -4
npm run lint:js
npx playwright test tests/e2e/card-badges.spec.js 2>&1 | tail -10
npm run test:e2e 2>&1 | tail -10
```

Expected: `# fail 0`; lint clean; the new spec passes; the full e2e suite passes. If an existing e2e test asserted old tag text on a card, update it to assert the badge the same record now shows, computed with `cardBadges`, and say so in the commit message.

- [ ] **Step 8: Commit**

```bash
git add web/app.js web/styles.css web/index.html tests/e2e/card-badges.spec.js
git commit -m "Replace card tags rows with scanning badges

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: List card badges in the Taxonomy view

**Files:**
- Modify: `web/app.js` `renderTaxonomy` (line ~1182; the `groups` array)
- Test: `tests/e2e/card-badges.spec.js` (append)

**Interfaces:**
- Consumes: `AtlasCore.cardBadgeGlossary()` from Task 1.
- Produces: a `#taxonomy-content .taxonomy-group` headed "Card badges" with one `.taxonomy-item` per badge.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/card-badges.spec.js`, change the `require` of app-core to:

```js
const { cardBadgeGlossary, cardBadges } = require("../../web/app-core.js");
```

and append:

```js
test("the Taxonomy view defines every card badge and where it appears", async ({ page }) => {
  const glossary = cardBadgeGlossary();

  await page.goto("/?view=taxonomy");
  const group = page.locator("#taxonomy-content .taxonomy-group").filter({ has: page.locator("h2", { hasText: /^Card badges$/ }) });
  await expect(group.locator(".taxonomy-item")).toHaveCount(glossary.length);
  for (const [index, entry] of glossary.entries()) {
    const item = group.locator(".taxonomy-item").nth(index);
    await expect(item.locator("strong")).toHaveText(entry.name);
    await expect(item.locator("p")).toHaveText(`${entry.definition} Shown on: ${entry.scopes.join(", ")}.`);
  }
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test tests/e2e/card-badges.spec.js -g "Taxonomy view" 2>&1 | tail -8`
Expected: FAIL — expected count N, received 0.

- [ ] **Step 3: Add the group**

In `renderTaxonomy`, replace:

```js
  const groups = [
    ["System families", state.taxonomy.system_families], ...roleGroups,
```

with:

```js
  const groups = [
    ["System families", state.taxonomy.system_families], ...roleGroups,
    ["Card badges", AtlasCore.cardBadgeGlossary().map(entry => ({ name: entry.name, definition: `${entry.definition} Shown on: ${entry.scopes.join(", ")}.` }))],
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
node --check web/app.js
node scripts/build_asset_version.mjs
npx playwright test tests/e2e/card-badges.spec.js tests/e2e/navigation.spec.js tests/e2e/directory-search.spec.js 2>&1 | tail -8
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/app.js web/index.html tests/e2e/card-badges.spec.js
git commit -m "Define card badges in the Taxonomy view

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Verify the two undefined booleans and publish their definitions

This task has a human gate. Do not merge wording for Local-first or Editable by you until the maintainer approves it in chat.

**Files:**
- Modify: `web/app-core.js` (`CARD_BADGES["local-first"].definition`, `CARD_BADGES["editable-by-you"].definition`)
- Modify: `docs/DATA_MODEL.md` (the "Project record" section, after the **Traits** bullet)

**Interfaces:**
- Consumes: `CARD_BADGES` from Task 1.
- Produces: final definitions, identical in `web/app-core.js` and `docs/DATA_MODEL.md`.

- [ ] **Step 1: Dispatch the research subagent**

Dispatch a `general-purpose` subagent with this prompt, verbatim:

> In the repository at the current working directory, `directory/projects.json` records carry two required booleans, `local_first` and `human_editable`, that no document defines. Using only that file and the evidence URLs the records cite, propose a one-sentence plain-language definition for each that matches how curators actually applied it. For each boolean, sample at least ten `true` and ten `false` records, spread across `system_family` values `agent_system`, `memory_system`, and `assistant_system` where both values occur. For every sampled record, quote the exact record fields (`deployment`, `architectures`, `canonical_data`, `strengths`, `weaknesses`, and any other field) that support the value. Then list every sampled record whose value your proposed definition would contradict, with the quote that shows it. Current draft definitions to test against: local_first — "Designed to work with its primary data on your own device; cloud services, where offered, are optional."; human_editable — "People can review and edit the data it stores." Do not edit any file. Do not explain a missing quote with a mechanism you did not observe; say it is missing.

- [ ] **Step 2: Check the subagent's sources yourself**

For every record the subagent quotes, run `uv run python -c "import json; r={p['id']:p for p in json.load(open('directory/projects.json'))['projects']}['<id>']; print({k: r.get(k) for k in ('local_first','human_editable','deployment','architectures','canonical_data','strengths','weaknesses')})"` and confirm the quote is present. Discard any claim whose quote is not in the record. For contradictions, do not change the record: list them for the maintainer as possible curation follow-ups.

- [ ] **Step 3: STOP and ask the maintainer**

Present in chat: the draft definitions, the proposed definitions, the verified supporting quotes (two or three per value), and the verified contradictions. Ask the maintainer to approve or edit the final wording. Do not continue until they reply.

- [ ] **Step 4: Apply the approved wording**

Replace the two `definition` strings in `web/app-core.js` with the approved text. In `docs/DATA_MODEL.md`, after the line beginning `- **Traits:**`, insert:

```markdown
- **Trait definitions:** `local_first` is true when <approved Local-first definition, starting lower-case>. `human_editable` is true when <approved Editable-by-you definition, starting lower-case>. Directory cards show these as the Local-first and Editable by you badges, so the two wordings must stay identical.
```

Substitute the approved text for both angle-bracketed spans before saving; the file must contain no angle brackets from this template.

- [ ] **Step 5: Run the tests and commit**

```bash
node scripts/build_asset_version.mjs
node --test tests/test_web.js 2>&1 | tail -4
npx playwright test tests/e2e/card-badges.spec.js 2>&1 | tail -4
uv run python -m unittest tests.test_documentation 2>&1 | tail -3
git add web/app-core.js web/index.html docs/DATA_MODEL.md
git commit -m "Define local-first and editable traits for card badges

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: all pass.

---

### Task 6: Document the contract and run the full verification

**Files:**
- Modify: `docs/WEB.md` ("Content hierarchy" bullet list ending at line ~28; "Verification" numbered list ending at item 29)

**Interfaces:**
- Consumes: everything above.
- Produces: the documented contract future card changes must follow.

- [ ] **Step 1: Document card badges**

In `docs/WEB.md`, under "## Content hierarchy", immediately after the paragraph that begins `Prefer plain interface labels over methodology language.`, insert:

```markdown
### Card badges

System, inference-service, local-runtime, and reviewed-model cards replace the tags row with up to four badges, defined once in `CARD_BADGES` and listed per collection and system family, in priority order, in `CARD_BADGE_SETS` in `web/app-core.js`. Badges are for scanning only: they never carry merit, editorial picks, trust or evidence state, or automated signals such as stars, and they never rank. Each badge tests one reviewed field for presence — a boolean that is `true`, or an array that contains a named value — so a missing badge claims nothing is absent. Share a badge name across collections or families only when it tests the same field and value. Add a badge only when it separates cards, roughly 10–75% of its collection or family; values nearly every record carries are noise. Unreviewed models.dev rows and specifications get no badges, and a reviewed-model card keeps its models.dev modality and family as attributed plain text beside its badges. A card with no badge omits the row. Badges are not controls: each carries its definition in a `title` and in visually hidden text, and the Taxonomy view lists every badge with its definition and where it appears. Cards paint from the boot payload, so any field a badge tests must be in `BOOT_FIELDS` in `scripts/build_web_payload.py`.
```

Then append to the "Verification" numbered list, after item 29:

```markdown
30. confirm card badges on a system from each family, an inference service, a local runtime, and a reviewed model; confirm an imported model and a specification show none; confirm a badge-less card keeps its footer at the bottom; hover a badge for its definition; and find every badge in Taxonomy in both palettes.
```

- [ ] **Step 2: Run the complete check list from `AGENTS.md`**

```bash
uv sync --locked
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
uv run python scripts/build_blog.py
node scripts/build_logos.mjs --check
node scripts/build_fonts.mjs --check
node scripts/build_asset_version.mjs --check
uv run python scripts/build_share_pages.py --check
uv run python scripts/build_blog.py --check
uv run ruff check scripts tests
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
npm run lint:js
npm run test:e2e
git status --short
```

Expected: every command succeeds, and `git status --short` shows only `docs/WEB.md` (the regeneration steps change nothing, because Tasks 2–5 already committed their outputs). If a generated file changed, commit it with an explanation.

- [ ] **Step 3: Browser pass**

Start `uv run python -m http.server 8765 --directory web` and walk the `docs/WEB.md` Verification list, with extra attention to items 11, 13, 19, 22, and the new item 30, at phone (375px) and desktop widths in light and dark. Take one screenshot of a Systems grid page and one of the All grid showing mixed cards, and send both to the user.

- [ ] **Step 4: Commit**

```bash
git add docs/WEB.md
git commit -m "Document the card badge contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
