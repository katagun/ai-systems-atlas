const { test, expect } = require("@playwright/test");

const headerBottom = page => page.locator(".site-header").evaluate(header => header.getBoundingClientRect().bottom);

test("a choice keeps the step indicator in view and cards drop the repeated cue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  const top = await page.locator(".finder-shell").evaluate(shell => shell.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(await headerBottom(page));
  await expect(page.locator(".finder-choice-cue", { hasText: "Choose this" })).toHaveCount(0);
});

test("Browse matches lands on the results and shows the Finder's role set as a removable filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
  await page.locator("[data-finder-directory]").click();

  const panelTop = await page.locator("#systems-directory-panel").evaluate(panel => panel.getBoundingClientRect().top);
  expect(panelTop).toBeLessThan(900);
  expect(panelTop).toBeGreaterThanOrEqual((await headerBottom(page)) - 1);
  const chip = page.getByRole("button", { name: /Finder: Write and maintain software/ });
  await expect(chip).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");

  await chip.click();
  await expect(chip).toBeHidden();
  await expect(page.locator("#result-count")).not.toContainText("Finder match");
});
