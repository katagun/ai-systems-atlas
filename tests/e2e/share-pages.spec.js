const { test, expect } = require("@playwright/test");

test("a share page carries record metadata and opens the record in the Atlas", async ({ page }) => {
  await page.goto("/records/systems/kilo-code/");

  await expect(page).toHaveTitle("Kilo Code · peacefulcoexistance");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://peacefulcoexistance.com/records/systems/kilo-code/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Kilo Code");
  await expect(page.locator("h1")).toHaveText("Kilo Code");
  await expect(page.locator("main")).not.toContainText(/\d\.\d/);

  await page.getByRole("link", { name: /Open in the directory/ }).click();
  await expect(page).toHaveURL(/record=system(%3A|:)kilo-code/);
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
});

test("copy link in a record dialog copies the share page URL", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?collection=runtimes&record=runtime:ollama");
  await expect(page.locator("#runtime-dialog-content h1")).toHaveText("Ollama");

  await page.locator("#runtime-dialog [data-copy-record-link]").click();
  await expect(page.locator("#runtime-dialog [data-record-link-status]")).toHaveText("Share link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/records/local-runtimes/ollama/`);
});

test("the sitemap and robots file are served", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("records/specifications/mcp/");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap:");
});
