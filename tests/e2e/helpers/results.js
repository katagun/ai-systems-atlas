// Every browser test reaches a collection's search box, a filter, the sort,
// the Clear control, or an open record through here, so Front-door Phase 3
// can move them into one bar, one rail, and one record view by changing this
// file alone (Phase 3 spec, "Tests"). The search box and the Sort share the
// bar already; each collection still has its own filters, Clear control,
// and record view.
const { expect } = require("@playwright/test");

// One search box serves every collection since Phase 3 task 2.
const SEARCH_BOX = "#results-search";

// Keyed by each filter's URL key, as web/app.js SCOPE_CONTROLS is.
const FILTER_CONTROLS = {
  systems: {
    family: "#family-filter", role: "#role-filter", agent: "#agent-filter", architecture: "#architecture-filter",
    deployment: "#deployment-filter", agentInterface: "#agent-interface-filter", capability: "#capability-filter",
    retrieval: "#retrieval-filter",
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

const COLLECTIONS = ["all", "systems", "inference", "runtimes", "packs", "robots", "models", "labs", "specifications"];

const CLEAR_CONTROLS = {
  all: "#reset-all-directory", systems: "#reset-filters", inference: "#reset-inference-filters",
  runtimes: "#reset-runtime-filters", packs: "#reset-pack-filters", robots: "#reset-robot-filters",
  models: "#reset-model-filters", labs: "#reset-lab-filters", specifications: "#reset-specification-filters",
};

// Keyed by the `record=` URL's kinds.
const RECORD_VIEWS = {
  system: "#record-dialog", spec: "#record-dialog", inference: "#record-dialog",
  runtime: "#record-dialog", pack: "#record-dialog", robot: "#record-dialog",
  model: "#record-dialog", lab: "#record-dialog",
};

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

function filterControl(page, scope, key) {
  return page.locator(FILTER_CONTROLS[scope][key]);
}

// Systems folds most of its filters under "More filters": open it first. On a
// narrow window every filter sits in the closed Filters drawer: open that
// before the shell. The shell is the one that holds the control, not whichever
// shell shows: straight after page.goto the whole panel is still hidden, and a
// control that is not visible yet must not read as one that is folded away.
async function setFilter(page, scope, key, value) {
  const control = filterControl(page, scope, key);
  if (!(await control.isVisible())) {
    const toggle = page.locator("#filters-toggle");
    if (await toggle.isVisible()) await toggle.click();
  }
  const shell = page.locator(".advanced-filter-shell").filter({ has: control });
  if (await shell.count() && !(await shell.evaluate(details => details.open))) await shell.locator("summary").click();
  await control.selectOption(value);
}

async function expectFilter(page, scope, key, value) {
  await expect(filterControl(page, scope, key)).toHaveValue(value);
}

// Every Sort sits in the results bar, in a label naming its collection. A
// collection without one gets the same locator, which matches nothing, so
// `toHaveCount(0)` says so, and it fails the day a Sort is added. A scope
// that is not a collection is a typo, and would read as "no Sort" too.
function sortControl(page, scope) {
  if (!COLLECTIONS.includes(scope)) throw new Error(`sortControl: "${scope}" is not a collection`);
  return page.locator(`.results-sort label[data-sort-scope="${scope}"] select`);
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

module.exports = { clearFilters, closeRecord, expectFilter, filterControl, recordHeading, recordView, search, searchBox, setFilter, settled, sortControl };
