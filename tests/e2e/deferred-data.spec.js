const { test, expect } = require("@playwright/test");

// The card marks and the reviewed license evidence are the two largest files
// the page can load, and neither is needed to render the directory. These
// tests hold that line: the evidence is not requested until a record is
// opened, and the page stays correct when either file never arrives.

const dataRequests = page => {
  const paths = [];
  page.on("request", request => paths.push(new URL(request.url()).pathname));
  return paths;
};

test("license evidence is left unfetched until a record is opened", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");

  // Painted marks prove the deferred logo file has landed, so boot is over.
  await expect(page.locator('#project-grid .card-mark[data-mark] svg').first()).toBeVisible();
  expect(requested.filter(path => path.endsWith("/license-evidence.json"))).toHaveLength(0);

  await page.locator("#project-search").fill("Kilo Code");
  await page.locator('#project-grid [data-project="kilo-code"]').click();

  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  await expect(page.locator("#dialog-content").getByText("immutable evidence")).toBeVisible();
  expect(requested.filter(path => path.endsWith("/license-evidence.json"))).toHaveLength(1);
});

test("a record dialog falls back to its license ids when the evidence never arrives", async ({ page }) => {
  await page.route("**/license-evidence.json*", route => route.abort());
  await page.goto("/?collection=systems&record=system:kilo-code");

  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  const licensing = page.locator("#dialog-content .detail-block").filter({ hasText: "Licenses and terms" });
  await expect(licensing).toContainText("MIT");
  await expect(page.locator("#dialog-content [data-copy-record-link]")).toBeVisible();
});

test("the directory renders complete when the card marks never arrive", async ({ page }) => {
  await page.route("**/logos.json*", route => route.abort());
  await page.goto("/?collection=systems");

  await page.locator("#project-search").fill("Kilo Code");
  const card = page.locator('#project-grid .project-card').first();
  await expect(card.locator("h2")).toHaveText("Kilo Code");
  await expect(card.locator('.card-mark[data-mark="kilo-code"]')).toHaveClass(/card-monogram/);
  await expect(card.locator(".card-mark svg")).toHaveCount(0);
});

// The directory boots from web/app/*.json — a projection of the published
// endpoints shaped for a first render (ADR 025) — and reaches for the rest on
// demand: a record's detail when a dialog or a comparison needs it, a search
// index when a search box takes focus. These tests hold each of those lines.

test("boot fetches payloads, not the published endpoints", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();

  expect(requested.filter(path => path.endsWith("/app/systems.json"))).toHaveLength(1);
  expect(requested.filter(path => path.endsWith("/projects.json"))).toHaveLength(0);
  expect(requested.filter(path => path.includes("/app/search/"))).toHaveLength(0);
});

test("a deep-linked record fetches its detail and renders the full dialog", async ({ page }) => {
  await page.goto("/?collection=systems&record=system:kilo-code");
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  const strengths = page.locator("#dialog-content .detail-block").filter({ hasText: "Strengths" });
  await expect(strengths.locator("li").first()).toBeVisible();
  await expect(page.locator("#dialog-content .score-table tr")).not.toHaveCount(1);
});

test("focusing search loads the index and widens the results", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");
  await page.locator("#project-search").focus();
  await expect.poll(() => requested.filter(path => path.endsWith("/app/search/systems.json")).length).toBe(1);

  // "allowlist" appears only in the editorial prose the index carries, never
  // in a boot record, so a match here proves the index is doing the widening.
  await page.locator("#project-search").fill("allowlist");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
});

test("a restored comparison renders every score row", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:kilo-code,cline");
  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator(".comparison-table tbody tr").filter({ hasText: "Strengths" })).toHaveCount(1);
  await expect(page.locator(".comparison-table tbody tr")).not.toHaveCount(2);
});

test("the page still renders when a payload class never arrives", async ({ page }) => {
  await page.route("**/app/search/**", route => route.abort());
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("kilo");
  await expect(page.locator('#project-grid [data-project="kilo-code"]')).toBeVisible();
});
