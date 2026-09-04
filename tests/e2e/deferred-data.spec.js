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
