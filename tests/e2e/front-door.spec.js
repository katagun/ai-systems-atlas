const { test, expect } = require("@playwright/test");
const { familyEntry, openCollection, searchAll } = require("./helpers/landing");
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
  await expect(page.locator('[data-tile="models"] .tile-count')).toContainText(`${counts.reviewedModels} reviewed`);
  await expect(page.locator('[data-tile="packs"] .tile-count')).toContainText(`${counts.packs} packs`);
  await expect(page.locator('[data-tile="labs"] .tile-count strong')).toHaveText(String(counts.labs));
  await expect(page.locator('[data-tile="robots"] .tile-count strong')).toHaveText(String(counts.robots));
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

test("the Everything tile is the A–Z list, and the Models, Labs, and Specifications tiles open their collections", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "all");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=all/);
  for (const id of ["models", "labs", "specifications"]) {
    await page.goto("/");
    await page.locator(`[data-tile="${id}"] .tile-open`).click();
    await expect(page.locator(`#${id}-directory-panel`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`collection=${id}`));
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
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
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

// Before boot only the door's search is on screen, and a boot that is slow to
// land must not lose what was typed into it.
test("text typed on the front door before the page finishes loading still searches", async ({ page }) => {
  await page.route(/\/app\/systems\.json/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/");
  await page.locator("#door-search").fill("Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// Leaving the door carries the query of the collection last shown; the text
// typed on the door must win over it.
test("text typed on the front door replaces a query left in another collection", async ({ page }) => {
  await page.goto("/?collection=inference&q=vllm");
  await expect(page.locator("#inference-search")).toHaveValue("vllm");
  await page.locator('.tab[data-tab="directory"]').click();
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// Every lab's name also names its models, so the query is a word only a lab's
// own record holds (AI Singapore's note names the Infocomm Media Development
// Authority). The All list finds nothing; the Labs tile carries the query in.
/* global searchIndexes */
test("a query only a lab answers follows the reader into Labs from its tile", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Infocomm");
  await page.waitForFunction(() =>
    ["systems", "inference", "runtimes", "models", "packs", "robots"].every(key => searchIndexes[key] !== undefined));
  await expect(page.locator("#all-directory-grid .empty-search")).toBeVisible();
  await expect(page.locator("#all-directory-grid .project-card")).toHaveCount(0);
  await page.locator('.tab[data-tab="directory"]').click();
  await expect(page.locator("#front-door")).toBeVisible();
  await page.locator('[data-tile="labs"] .tile-open').click();
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
  await expect(page.locator("#lab-search")).toHaveValue("Infocomm");
  await expect(page.locator("#lab-grid .project-card")).toHaveCount(1);
  await expect(page.locator("#lab-grid .project-card")).toContainText("AI Singapore");
});

// The door shows no cards, so it has no badges for the key to explain.
test("the badge key stays hidden on the front door and returns in results", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page.locator("#badge-legend")).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();
  await openCollection(page, "inference");
  await expect(page.locator("#badge-legend")).toBeVisible();
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
