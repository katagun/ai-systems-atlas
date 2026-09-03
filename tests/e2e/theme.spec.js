const { test, expect } = require("@playwright/test");

const LIGHT_BG = "rgb(247, 249, 252)";
const DARK_BG = "rgb(15, 20, 27)";
const bodyBackground = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("the OS dark preference applies when no theme has been chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bodyBackground(page)).toBe(DARK_BG);
  await expect(page.locator("#theme-toggle")).toHaveAttribute("aria-label", "Theme: system");
});

test("the theme control cycles system, light, dark and persists the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("#theme-toggle");

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "Theme: light");

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "Theme: dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f141b");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);

  await toggle.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
});

test("an explicit light choice beats a dark OS preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f9fc");
});

test("a stored dark choice is stamped before the app script runs", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.route("**/app.js*", route => route.abort());
  await page.reload().catch(() => {});

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("dark theme keeps a record dialog and its share page readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?record=runtime:ollama");
  await expect(page.locator("#runtime-dialog-content h1")).toHaveText("Ollama");
  const dialogText = await page.locator("#runtime-dialog-content h1").evaluate(node => getComputedStyle(node).color);
  expect(dialogText).not.toBe("rgb(19, 34, 52)");

  await page.goto("/records/local-runtimes/ollama/");
  expect(await bodyBackground(page)).not.toBe(LIGHT_BG);
});
