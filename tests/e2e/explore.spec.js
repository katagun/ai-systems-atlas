const { test, expect } = require("@playwright/test");
const { openView } = require("./helpers/landing");
const { models } = require("../../directory/models.json");
const taxonomy = require("../../directory/taxonomy.json");

test("Explore counts reviewed releases and every matrix link matches its catalog slice", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await openView(page, "explore");
  await expect(page).toHaveURL(/view=explore/);
  await expect(page.locator("#explore-data-note")).toContainText(`${models.length} reviewed releases`);
  await expect(page.locator(".docs-button")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#badge-legend")).not.toBeVisible();
  await expect(page.locator("#explore .score-ring, #explore .compare-toggle")).toHaveCount(0);
  const links = await page.locator(".access-matrix a").evaluateAll(items => items.map(item => ({
    href: item.getAttribute("href"), count: Number(item.querySelector("strong").textContent),
  })));
  expect(links.length).toBeGreaterThan(0);
  for (const { href, count } of links) {
    const params = new URLSearchParams(href.slice(1));
    const expected = models.filter(model => model.source_model === params.get("sourceModel")
      && model.distribution_modes.includes(params.get("distribution")));
    expect(count).toBe(expected.length);
    await page.goto(`/${href}`);
    await expect(page.locator("#model-result-count")).toContainText(`${count} ${count === 1 ? "model" : "models"} ·`);
    await expect(page.locator("#model-grid .imported-model-card")).toHaveCount(0);
    await expect(page.locator("#model-source-filter")).toHaveValue(params.get("sourceModel"));
    await expect(page.locator("#model-distribution-filter")).toHaveValue(params.get("distribution"));
  }
  expect(errors).toEqual([]);
});

test("distribution links, record dialogs, reload and Back preserve the exploration path", async ({ page }) => {
  await page.goto("/?view=explore");
  for (const mode of taxonomy.model_distribution_modes) {
    const expected = models.filter(model => model.distribution_modes.includes(mode.id)).length;
    const link = page.locator(`.access-route-list a[href*="distribution=${mode.id}"]`);
    await expect(link.locator("strong")).toHaveText(String(expected));
  }
  const link = page.locator(".access-route-list a").first();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#model-distribution-filter")).toHaveValue("downloadable_weights");
  await page.reload();
  await expect(page.locator("#model-distribution-filter")).toHaveValue("downloadable_weights");
  await page.locator("#model-grid [data-model]").first().click();
  await expect(page.locator("#model-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#model-dialog")).not.toBeVisible();
  await page.goBack();
  await expect(page.locator("#explore")).toBeVisible();
  await page.reload();
  await expect(page.locator("#explore-title")).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`Explore fits desktop and phones in ${theme} without additional payloads`, async ({ page, baseURL }) => {
    const external = [];
    const details = [];
    page.on("request", request => {
      if (!request.url().startsWith(baseURL)) external.push(request.url());
      if (request.url().includes("/app/detail/")) details.push(request.url());
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?view=explore", { waitUntil: "networkidle" });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".access-matrix")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const cell of await page.locator(".access-matrix a").all()) {
        expect(await cell.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      }
    }
    await page.getByText("About these counts", { exact: true }).click();
    await expect(page.locator(".explore-method")).toContainText("not market share");
    expect(external).toEqual([]);
    expect(details).toEqual([]);
  });
}
