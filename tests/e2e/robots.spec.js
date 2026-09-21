const { test, expect } = require("@playwright/test");
const catalogCounts = require("./helpers/catalog-counts");

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
  terms_evidence: [{ terms_kind: "terms_of_sale", scope: "Purchase terms", kind: "web_terms", url: "https://unibot.example/terms", verified_at: "2026-09-20" }],
  not_verified: "The model named here is the maker's own claim and is not verified by the Atlas.",
  evidence: [
    { kind: "web", role: "named_model", label: "Model page", url: "https://unibot.example/uni-vla", verified_at: "2026-09-20" },
    { kind: "web", role: "availability", label: "Order page", url: "https://unibot.example/order", verified_at: "2026-09-20", unpinnable: true },
  ],
  verified_at: "2026-09-20",
};

async function withRobots(page) {
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { verified_at: "2026-09-20", robots: ROBOTS } }));
  await page.route(/\/app\/search\/robots\.json/, route => route.fulfill({ json: {} }));
  await page.route(/\/app\/detail\/robot\/g-one\.json/, route => route.fulfill({ json: DETAIL }));
}

test("the robots entry stays out of the navigation while the collection is empty", async ({ page }) => {
  test.skip(catalogCounts.robots > 0, "the published collection has records");
  await page.goto("/");
  // toBeHidden also passes for an element that does not exist, so pin its presence first.
  await expect(page.locator('[data-directory-collection="robots"]')).toHaveCount(1);
  await expect(page.locator('[data-directory-collection="robots"]')).toBeHidden();
  await expect(page.locator("#all-collection-count")).toHaveText(String(catalogCounts.allDirectoryEntries));
});

test("the robots scope filters, opens its own dialog, and never scores or compares", async ({ page }) => {
  await withRobots(page);
  await page.goto("/?collection=robots");

  await expect(page.getByRole("button", { name: "Robots 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#robot-result-count")).toContainText("2 robots · Unscored");
  await expect(page.locator("#robot-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#robot-grid .compare-toggle")).toHaveCount(0);
  await expect(page.locator("#robot-sort-filter")).toHaveCount(0);
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One", "Rover"]);

  await page.locator("#robot-form-factor-filter").selectOption("quadruped");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["Rover"]);
  await page.locator("#reset-robot-filters").click();
  await page.locator("#robot-ai-basis-filter").selectOption("vendor_named_model");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);
  await page.locator("#reset-robot-filters").click();
  await page.locator("#robot-search").fill("unibot");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);

  await page.locator('#robot-grid [data-robot="g-one"]').click();
  await expect(page.locator("#robot-dialog")).toBeVisible();
  await expect(page.locator("#robot-dialog-content .eyebrow")).toContainText("Unscored");
  await expect(page.locator("#robot-dialog-content")).toContainText("Models the vendor names");
  await expect(page.locator("#robot-dialog-content")).toContainText("vendor-stated");
  await expect(page.locator("#robot-dialog-content")).toContainText("Running your own models");
  await expect(page.locator("#robot-dialog-content")).toContainText("not verified by the Atlas");
  await expect(page.locator("#robot-dialog-content")).toContainText("This page changes between visits, so the Atlas cannot pin what it said.");
  await expect(page).toHaveURL(/record=robot(%3A|:)g-one/);

  await page.reload();
  await expect(page.locator("#robot-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#robot-dialog")).toBeHidden();
});

test("mixed browsing surfaces robots without scores or comparison", async ({ page }) => {
  await withRobots(page);
  await page.goto("/");
  await page.locator("#all-directory-search").fill("rover");
  const card = page.locator('#all-directory-grid .robot-card:has([data-robot="rover"])');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".family-label")).toContainText("Robot · Quadruped");
  await expect(card.locator(".score-ring")).toHaveCount(0);
  await expect(card.locator(".compare-toggle")).toHaveCount(0);
});
