const { test, expect } = require("@playwright/test");
const { openCollection, openView, searchAll } = require("./helpers/landing");
const { searchBox } = require("./helpers/results");

for (const theme of ["light", "dark"]) {
  test(`mobile Elements families, compact collections and dock fit in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const familyTabs = page.locator("[data-element-family-tab]");
    await expect(familyTabs).toHaveText(["Agents", "Memory", "Assistants"]);
    await expect(familyTabs.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.element-group[data-element-family="agent_system"]')).toBeVisible();
    for (const width of [320, 390, 767]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("#mobile-nav")).toBeInViewport();
      await expect(page.locator(".door-search")).toBeHidden();
      await expect(page.locator(".door-jobs")).toBeHidden();
      await expect(page.locator(".site-header .tabs")).toBeHidden();
      for (const family of ["agent_system", "assistant_system", "memory_system"]) {
        await page.locator(`[data-element-family-tab="${family}"]`).click();
        await expect(page.locator(".element-group:visible")).toHaveCount(1);
        await expect(page.locator(`.element-group[data-element-family="${family}"]`)).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const button of await page.locator("#mobile-nav button, [data-element-family-tab]").all()) {
        const box = await button.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.locator(".collection-index-heading").evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(760);
    }
    await openCollection(page, "models");
    await expect(page.locator("#models-directory-panel")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#front-door")).toBeVisible();
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("#mobile-nav")).toBeHidden();
      await expect(page.locator(".element-group:visible")).toHaveCount(3);
      await expect(page.locator(".door-search")).toBeVisible();
      await expect(page.locator(".site-header #theme-toggle")).toBeVisible();
    }
  });
}

test("mobile navigation restores search and sheets through history and handles More focus", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?element=coding_agent&elementRecord=aider");
  await expect(page.locator('[data-element-family-tab="agent_system"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#element-record-name")).toHaveAccessibleName("Aider");
  await searchAll(page, "Ollama");
  await expect(searchBox(page, "all")).toBeFocused();
  await expect(page).toHaveURL(/q=Ollama/);
  await page.goBack();
  await expect(page.locator("#element-record-name")).toHaveAccessibleName("Aider");
  await page.locator('[data-element-family-tab="memory_system"]').click();
  await expect(page.locator("#element-sheet")).toBeHidden();
  await expect(page).not.toHaveURL(/element=/);
  await openView(page, "finder");
  await expect(page.locator('[data-mobile-nav="finder"]')).toHaveAttribute("aria-current", "page");
  await openView(page, "explore");
  await expect(page).toHaveURL(/view=explore/);
  await page.goBack();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await openView(page, "api");
  await expect(page.locator("#api")).toHaveClass(/is-active/);
  await page.locator('[data-mobile-nav="more"]').click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-mobile-nav="more"]')).toBeFocused();
  await page.locator('[data-mobile-nav="more"]').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#mobile-more")).not.toBeVisible();
  await expect(page.locator(".site-header #theme-toggle")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile overlays and the page footer remain above the bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=systems&family=agent_system&role=coding_agent");
  await page.locator('#project-grid [data-compare-id="aider"]').click();
  const dock = await page.locator("#mobile-nav").boundingBox();
  const tray = await page.locator("#comparison-tray").boundingBox();
  expect(tray.y + tray.height).toBeLessThanOrEqual(dock.y);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.locator("footer").evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(dock.y);
});

test("the dock steps aside for a keyboard-sized viewport change while searching", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await searchAll(page, "Ollama");
  // Chromium desktop cannot summon an OS keyboard; exercise the browser
  // viewport signal that the app listens for, including restoration.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 450 });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("#mobile-nav")).toBeHidden();
  await expect(searchBox(page, "all")).toBeFocused();
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("#mobile-nav")).toBeVisible();
});
