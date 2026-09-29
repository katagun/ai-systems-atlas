const { test, expect } = require("@playwright/test");
const catalogCounts = require("./helpers/catalog-counts");
const { collectionEntry, entryCount, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const { clearFilters, recordView, search, setFilter, sortControl } = require("./helpers/results");

const ROBOTS = [
  { id: "g-one", name: "G One", manufacturer: "Unibot", url: "https://unibot.example/g-one", description: "A compact humanoid.", form_factor: "humanoid", ai_basis: ["vendor_named_model", "open_model_interface"], availability: "orderable", status: "active" },
  { id: "rover", name: "Rover", manufacturer: "Dynamo", url: "https://dynamo.example/rover", description: "A walking inspector.", form_factor: "quadruped", ai_basis: ["open_model_interface"], availability: "enterprise_sales", status: "active" },
];
const DETAIL = {
  first_party_domains: ["unibot.example"],
  availability_note: "Sold direct in two regions.",
  named_models: [{ name: "Uni-VLA", kind: "vision_language_action", role_note: "The maker says it turns camera frames and a request into whole-body motion.", evidence_label: "Model page" }],
  research_confidence: "medium",
  hardware: { compute: "Not published.", sensors: "Depth camera and lidar.", actuation: "Electric joints.", power: "Swappable battery." },
  developer_access: "A documented SDK for running your own policy.",
  terms: ["terms_of_sale"], terms_note: "Purchase terms only.",
  terms_evidence: [{ terms_kind: "terms_of_sale", scope: "Purchase terms", kind: "web_terms", url: "https://unibot.example/terms", verified_at: "2026-09-20", unpinnable: true }],
  not_verified: "The model named here is the maker's own claim and is not verified by the Atlas.",
  evidence: [
    { kind: "web", role: "named_model", label: "Model page", url: "https://unibot.example/uni-vla", verified_at: "2026-09-20" },
    { kind: "web", role: "product_page", label: "Order page", url: "https://unibot.example/order", verified_at: "2026-09-20", unpinnable: true },
  ],
  verified_at: "2026-09-20",
};

async function withRobots(page) {
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { verified_at: "2026-09-20", robots: ROBOTS } }));
  await page.route(/\/app\/search\/robots\.json/, route => route.fulfill({ json: {} }));
  await page.route(/\/app\/detail\/robot\/g-one\.json/, route => route.fulfill({ json: DETAIL }));
}

// Routing an explicitly empty collection makes the empty-nav assertion
// independent of whether the published collection happens to be empty: it
// stays meaningful (and would fail if the renderStats() hidden-toggle line
// were ever deleted) regardless of real catalog data.
async function withEmptyRobots(page) {
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { verified_at: "2026-09-20", robots: [] } }));
  await page.route(/\/app\/search\/robots\.json/, route => route.fulfill({ json: {} }));
}

test("the robots entry stays out of the navigation while the collection is empty", async ({ page }) => {
  await withEmptyRobots(page);
  await page.goto("/");
  // A missing entry also passes for an index that never rendered, so pin the index first.
  expect(await entryCount(page, "all")).toBe(catalogCounts.allDirectoryEntries - catalogCounts.robots);
  await expect(collectionEntry(page, "robots")).toHaveCount(0);
});

test("the published robots open from the real collection", async ({ page }) => {
  // No routing fixtures: the app boots from the real web/app/robots.json and
  // fetches a real robot's detail payload, so this fails if the published
  // records stop loading.
  await page.goto("/?collection=robots");
  await expect(collectionEntry(page, "robots")).toBeVisible();
  expect(await entryCount(page, "robots")).toBe(catalogCounts.robots);
  await page.locator('#robot-grid [data-robot="spot"]').click();
  await expect(recordView(page, "robot")).toBeVisible();
  await expect(recordView(page, "robot")).toContainText("Models the vendor names");
  await expect(recordView(page, "robot")).toContainText("Reinforcement-learning locomotion controller");
  await expect(page).toHaveURL(/record=robot(%3A|:)spot/);
});

test("the robots scope filters, opens its own dialog, and never scores or compares", async ({ page }) => {
  await withRobots(page);
  await page.goto("/?collection=robots");

  await expect(pressedEntry(page)).toHaveAccessibleName(/^Robots /);
  expect(await entryCount(page, "robots")).toBe(2);
  await expect(page.locator("#robot-result-count")).toContainText("2 robots · Unscored");
  await expect(page.locator("#robot-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#robot-grid .compare-toggle")).toHaveCount(0);
  await expect(sortControl(page, "robots")).toHaveCount(0);
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One", "Rover"]);

  await setFilter(page, "robots", "formFactor", "quadruped");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["Rover"]);
  await clearFilters(page, "robots");
  await setFilter(page, "robots", "aiBasis", "vendor_named_model");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);
  await clearFilters(page, "robots");
  await search(page, "unibot");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);

  await page.locator('#robot-grid [data-robot="g-one"]').click();
  await expect(recordView(page, "robot")).toBeVisible();
  await expect(recordView(page, "robot").locator(".eyebrow")).toContainText("Unscored");
  await expect(recordView(page, "robot")).toContainText("Models the vendor names");
  await expect(recordView(page, "robot")).toContainText("vendor-stated");
  await expect(recordView(page, "robot")).toContainText("Running your own models");
  await expect(recordView(page, "robot")).toContainText("not verified by the Atlas");
  await expect(recordView(page, "robot")).toContainText("This page changes between visits, so the Atlas cannot pin what it said.");
  // Once for the evidence entry and once for the terms entry: robotTermsLink
  // now carries the same unpinnable note robotEvidenceLink already adds.
  await expect(recordView(page, "robot").locator(".unscored-note", { hasText: "This page changes between visits" })).toHaveCount(2);
  await expect(recordView(page, "robot")).toContainText("Reviewed 2026-09-20.");
  await expect(page).toHaveURL(/record=robot(%3A|:)g-one/);

  await page.reload();
  await expect(recordView(page, "robot")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "robot")).toBeHidden();
});

test("the models section reads as an em dash, not a false absence claim, while a robot's detail never arrives", async ({ page }) => {
  // Rover's boot record already says its ai_basis lacks vendor_named_model,
  // but the dialog must not assert "the maker names no model" off that alone:
  // it has not confirmed named_models is really empty, because that field
  // only ever arrives with detail, and Rover's detail route here 404s.
  await withRobots(page);
  await page.route(/\/app\/detail\/robot\/rover\.json/, route => route.fulfill({ status: 404, body: "not found" }));
  await page.goto("/?collection=robots");
  await page.locator('#robot-grid [data-robot="rover"]').click();
  await expect(recordView(page, "robot")).toBeVisible();
  const content = recordView(page, "robot");
  const modelsSection = content.locator("section.detail-block", { hasText: "Models the vendor names" });
  await expect(modelsSection).not.toContainText("names no model");
  await expect(modelsSection.locator("p").first()).toHaveText("—");
  await expect(content).not.toContainText("Reviewed .");
});

test("a robot with a named-model basis also reads as an em dash before its detail arrives", async ({ page }) => {
  const namedModelRobot = { id: "solo-arm", name: "Solo Arm", manufacturer: "Lonestar", url: "https://lonestar.example/solo-arm", description: "A tabletop arm.", form_factor: "arm", ai_basis: ["vendor_named_model"], availability: "orderable", status: "active" };
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { verified_at: "2026-09-20", robots: [...ROBOTS, namedModelRobot] } }));
  await page.route(/\/app\/search\/robots\.json/, route => route.fulfill({ json: {} }));
  await page.route(/\/app\/detail\/robot\/solo-arm\.json/, route => route.fulfill({ status: 404, body: "not found" }));
  await page.goto("/?collection=robots");
  await page.locator('#robot-grid [data-robot="solo-arm"]').click();
  await expect(recordView(page, "robot")).toBeVisible();
  const content = recordView(page, "robot");
  const modelsSection = content.locator("section.detail-block", { hasText: "Models the vendor names" });
  await expect(modelsSection).not.toContainText("names no model");
  await expect(modelsSection.locator("p").first()).toHaveText("—");
});

test("mixed browsing surfaces robots without scores or comparison", async ({ page }) => {
  await withRobots(page);
  await page.goto("/");
  await searchAll(page, "rover");
  const card = page.locator('#all-directory-grid .robot-card:has([data-robot="rover"])');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".family-label")).toContainText("Robot · Quadruped");
  await expect(card.locator(".score-ring")).toHaveCount(0);
  await expect(card.locator(".compare-toggle")).toHaveCount(0);
});

test("the active Robots switcher entry stays reachable at a wide desktop width", async ({ page }) => {
  await withRobots(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?collection=robots");
  await expect(collectionEntry(page, "robots")).toBeInViewport();
});

test("the active Robots switcher entry scrolls into view on a phone", async ({ page }) => {
  await withRobots(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=robots");
  await expect(collectionEntry(page, "robots")).toBeInViewport();
});

test("syncing the switcher on a phone never scrolls the page vertically", async ({ page }) => {
  // The switcher is already in view at the top of the page here, so any scope
  // switch that re-syncs it (e.g. clicking another switcher entry) must touch
  // only the switcher's own horizontal scroll, never window.scrollY.
  await withRobots(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=robots");
  await expect(collectionEntry(page, "robots")).toBeInViewport();
  const before = await page.evaluate(() => window.scrollY);
  await openCollection(page, "all");
  await openCollection(page, "robots");
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBe(before);
});
