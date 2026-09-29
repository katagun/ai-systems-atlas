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

// Systems folds most of its filters under "More filters": open it first. The
// shell is the one that holds the control, not whichever shell shows: straight
// after page.goto the whole panel is still hidden, and a control that is not
// visible yet must not read as one that is folded away.
async function setFilter(page, scope, key, value) {
  const control = filterControl(page, scope, key);
  const shell = page.locator(".advanced-filter-shell").filter({ has: control });
  if (await shell.count() && !(await shell.evaluate(details => details.open))) await shell.locator("summary").click();
  await control.selectOption(value);
}

async function expectFilter(page, scope, key, value) {
  await expect(filterControl(page, scope, key)).toHaveValue(value);
}

// A collection without a Sort control gets a locator on where one would sit: any
// select whose id ends in "sort-filter" inside its own panel. It matches nothing
// today, so `toHaveCount(0)` says so, and it fails the day a Sort is added. A
// scope that is not a collection is a typo, and would read as "no Sort" too.
function sortControl(page, scope) {
  if (!Object.hasOwn(SEARCH_BOXES, scope)) throw new Error(`sortControl: "${scope}" is not a collection`);
  return page.locator(SORT_CONTROLS[scope] || `#${scope}-directory-panel select[id$="sort-filter"]`);
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
