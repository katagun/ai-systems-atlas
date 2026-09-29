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

for (const width of [320, 360, 390, 720]) {
  for (const path of ["/", "/blog/"]) {
    test(`the whole header stays on one sticky row at ${width}px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const header = await box(page, ".site-header");
      const brand = await box(page, ".brand");
      if (path === "/") {
        await expect(page.locator(".site-header .tabs")).toBeHidden();
        await expect(page.locator("#mobile-nav")).toBeInViewport();
        await page.locator('[data-mobile-nav="more"]').click();
        await expect(page.locator("#theme-toggle")).toBeInViewport();
        await expect(page.locator(".github-link")).toBeInViewport();
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-mobile-nav="more"]')).toBeFocused();
        return;
      }
      const tabs = await box(page, ".tabs");
      const tools = await box(page, ".header-tools");
      const center = rect => rect.y + rect.height / 2;
      expect(header.height).toBeLessThanOrEqual(64);
      expect(Math.abs(center(brand) - center(tabs))).toBeLessThan(1);
      expect(Math.abs(center(tabs) - center(tools))).toBeLessThan(1);
      expect(brand.x + brand.width).toBeLessThanOrEqual(tabs.x);
      expect(tabs.x + tabs.width).toBeLessThanOrEqual(tools.x);
      expect(tools.x + tools.width).toBeLessThanOrEqual(width);
      await expect(page.locator(".site-header .suggest-link")).toHaveCount(0);
      await expect(page.locator("footer .suggest-link")).toHaveText("Suggest a system");
      await expect(page.getByRole("navigation", { name: "Site map" })).toBeAttached();
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
      expect((await box(page, ".site-header")).y).toBe(0);
      await expect(page.locator("#theme-toggle")).toBeInViewport();
      await expect(page.locator(".github-link")).toBeInViewport();
      await page.locator(".docs-menu > :first-child").click();
      await expect(page.locator(".docs-menu-list")).toBeInViewport();
    });
  }
}

test("the header tools end at the content column's right edge on a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");

  const main = await box(page, "main");
  const tools = await box(page, ".header-tools");
  expect(Math.round(tools.x + tools.width)).toBe(Math.round(main.x + main.width));
});
