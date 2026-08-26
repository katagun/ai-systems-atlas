const { test, expect } = require("@playwright/test");

test("searching G finds GBrain and GStack across all families", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#family-filter")).toHaveValue("");
  await page.locator("#project-search").fill("G");

  const resultNames = page.locator("#project-grid .project-card h2");
  await expect(resultNames.filter({ hasText: /^GBrain$/ })).toHaveCount(1);
  await expect(resultNames.filter({ hasText: /^GStack$/ })).toHaveCount(1);
});

test("canonical and repository links use the AI Systems Atlas slug", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://katagun.github.io/ai-systems-atlas/",
  );
  await expect(page.getByRole("link", { name: "GitHub ↗" })).toHaveAttribute(
    "href",
    "https://github.com/katagun/ai-systems-atlas",
  );
});
