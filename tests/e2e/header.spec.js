const { test, expect } = require("@playwright/test");

const box = (page, selector) => page.locator(selector).boundingBox();

test("the theme control and GitHub link stay on the brand row at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");

  const header = await box(page, ".site-header");
  const toggle = await box(page, "#theme-toggle");
  const github = await box(page, ".github-link");
  expect(github).not.toBeNull();
  expect(header.height).toBeLessThanOrEqual(88);
  expect(toggle.y + toggle.height).toBeLessThanOrEqual(header.y + header.height);
  expect(github.y + github.height).toBeLessThanOrEqual(header.y + header.height);
});

test("the GitHub link and theme control share the first header row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const brand = await box(page, ".brand");
  const tabs = await box(page, ".tabs");
  const toggle = await box(page, "#theme-toggle");
  const github = await box(page, ".github-link");
  expect(github).not.toBeNull();
  expect(toggle.y).toBeLessThan(tabs.y);
  expect(github.y).toBeLessThan(tabs.y);
  expect(github.x + github.width).toBeGreaterThan(brand.x + brand.width);
});

test("the header tools end at the content column's right edge on a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");

  const main = await box(page, "main");
  const tools = await box(page, ".header-tools");
  expect(Math.round(tools.x + tools.width)).toBe(Math.round(main.x + main.width));
});
