const { test, expect } = require("@playwright/test");

const VIEWS = ["Directory", "Finder", "Specifications", "Taxonomy"];

test("every view and a detail dialog render without console or page errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/");
  await expect(page.locator("#all-directory-result-count")).toContainText("entries");
  for (const view of VIEWS) {
    await page.getByRole("button", { name: view, exact: true }).click();
  }
  await page.getByRole("button", { name: "Directory", exact: true }).click();
  await page.locator("#all-directory-search").fill("Kilo Code");
  await page.locator('#all-directory-grid [data-project="kilo-code"]').click();
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");

  expect(errors).toEqual([]);
});

test("no view overflows the page horizontally at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#all-directory-result-count")).toContainText("entries");

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const view of VIEWS) {
    await page.getByRole("button", { name: view, exact: true }).click();
    expect(await overflow(), `${view} overflows horizontally`).toBeLessThanOrEqual(0);
  }
  for (const collection of [/^Systems /, /^Inference services /, /^Local runtimes /]) {
    await page.getByRole("button", { name: "Directory", exact: true }).click();
    await page.getByRole("button", { name: collection }).click();
    expect(await overflow(), `${collection} overflows horizontally`).toBeLessThanOrEqual(0);
  }
  await page.locator("#runtime-grid [data-local-runtime=\"ollama\"]").click();
  const dialogOverflow = await page.locator("#runtime-dialog").evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(0);
});

test("the page loads without third-party runtime requests", async ({ page, baseURL }) => {
  const external = [];
  page.on("request", request => {
    if (!request.url().startsWith(baseURL)) external.push(request.url());
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#all-directory-result-count")).toContainText("entries");

  expect(external).toEqual([]);
});
