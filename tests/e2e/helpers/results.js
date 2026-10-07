// Every browser test reaches a collection's search box, a filter, the sort,
// the Clear control, or an open record through here, so Front-door Phase 3
// can move them into one bar, one rail, and one record view by changing this
// file alone (Phase 3 spec, "Tests"). The search box and the Sort share the
// bar, and the filters one rail with one Clear filters; each collection
// still has its own record view.
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
    lab: "#system-lab-filter",
  },
  inference: { type: "#inference-type-filter", delivery: "#inference-delivery-filter", modelSource: "#inference-model-source-filter", apiStyle: "#inference-api-filter", lab: "#inference-lab-filter" },
  runtimes: { type: "#runtime-type-filter", accelerator: "#runtime-accelerator-filter", modelFormat: "#runtime-format-filter", apiStyle: "#runtime-api-filter", lab: "#runtime-lab-filter" },
  packs: { type: "#pack-type-filter", host: "#pack-host-filter", install: "#pack-install-filter", license: "#pack-license-filter" },
  robots: { formFactor: "#robot-form-factor-filter", aiBasis: "#robot-ai-basis-filter", availability: "#robot-availability-filter", status: "#robot-status-filter" },
  models: { type: "#model-type-filter", distribution: "#model-distribution-filter", modality: "#model-modality-filter", sourceModel: "#model-source-filter", license: "#model-license-filter", lab: "#model-lab-filter" },
  labs: { type: "#lab-type-filter", headquarters: "#lab-country-filter", distribution: "#lab-distribution-filter" },
  specifications: { type: "#specification-type-filter", scope: "#specification-scope-filter", status: "#specification-status-filter", license: "#specification-license-filter", lab: "#specification-lab-filter" },
};

const COLLECTIONS = ["all", "systems", "inference", "runtimes", "packs", "robots", "models", "labs", "specifications"];

// Keyed by the `record=` URL's kinds.
const RECORD_VIEWS = {
  system: "#project-dialog", spec: "#specification-dialog", inference: "#inference-dialog",
  runtime: "#runtime-dialog", pack: "#pack-dialog", robot: "#robot-dialog",
  model: "#model-dialog", lab: "#lab-dialog",
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

// The rail on wide screens, the sheet from the Filters button on narrow
// ones (Phase 3 task 3). Systems' family is the strip's row. Straight after
// page.goto the page may not have booted, and then neither shows yet, so
// the probe waits for whichever this width offers (ruling R-T1-3).
async function setFilter(page, scope, key, value) {
  if (scope === "systems" && key === "family") {
    await require("./landing").openFamily(page, value);
    await settled(page);
    return;
  }
  await page.locator("#filter-rail:visible, #filters-button:visible").first().waitFor();
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

// One Clear control serves every collection: "Clear filters" after the
// chips, or "Clear search" at the end of the result row while a query is the
// only thing set (ruling R-T3-8). It shows only while something is set: with
// nothing set there is nothing to clear.
function clearControl(page) {
  return page.locator("#clear-filters");
}

async function clearFilters(page) {
  const clear = clearControl(page);
  if (!await clear.isVisible()) return;
  await clear.click();
  await settled(page);
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

module.exports = { clearControl, clearFilters, closeRecord, expectFilter, filterControl, recordHeading, recordView, search, searchBox, setFilter, settled, sortControl };
