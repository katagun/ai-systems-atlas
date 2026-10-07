const { test, expect } = require("@playwright/test");
const { recordHeading, recordView } = require("./helpers/results");

test("a share page carries record metadata and opens the record in the Atlas", async ({ page }) => {
  await page.goto("/records/systems/kilo-code/");

  await expect(page).toHaveTitle("Kilo Code · peacefulcoexistance");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://peacefulcoexistance.com/records/systems/kilo-code/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Kilo Code");
  await expect(page.locator("h1")).toHaveText("Kilo Code");
  await expect(page.locator("main")).not.toContainText(/\d\.\d/);

  await page.getByRole("link", { name: /Open in the directory/ }).click();
  await expect(page).toHaveURL(/record=system(%3A|:)kilo-code/);
  await expect(recordHeading(page, "system")).toHaveText("Kilo Code");
});

test("copy link in a record dialog copies the share page URL", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?collection=runtimes&record=runtime:ollama");
  await expect(recordHeading(page, "runtime")).toHaveText("Ollama");

  await recordView(page, "runtime").locator("[data-copy-record-link]").click();
  await expect(recordView(page, "runtime").locator("[data-record-link-status]")).toHaveText("Share link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/records/local-runtimes/ollama/`);
});

test("a model share page identifies the model without publishing its score", async ({ page }) => {
  await page.goto("/records/models/model-alibaba-qwen2-5-coder-0-5b/");

  await expect(page).toHaveTitle("Qwen2.5-Coder-0.5B · peacefulcoexistance");
  await expect(page.locator("h1")).toHaveText("Qwen2.5-Coder-0.5B");
  await expect(page.locator("main")).toContainText("DeveloperQwen");
  await expect(page.locator("main")).not.toContainText("7.96");
});

test("the sitemap and robots file are served", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("records/specifications/mcp/");
  expect(await sitemap.text()).toContain("records/models/model-alibaba-qwen2-5-coder-0-5b/");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap:");
});
