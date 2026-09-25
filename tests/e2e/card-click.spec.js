const { test, expect } = require("@playwright/test");

test("clicking a card's title opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  const card = page.locator('#project-grid .project-card:has([data-project="aider"])');
  // Click the title's spot with the mouse, the way a reader would. Playwright's
  // own click refuses, because the details target stretched over the card
  // intercepts the title, and that interception is the behaviour under test.
  // The instant scroll overrides the page's smooth scrolling, so the box is
  // read after the scroll has landed.
  const title = card.locator("h2");
  await title.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await title.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("the details control names the record it opens", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  await expect(page.getByRole("button", { name: "View details for Aider" })).toBeVisible();
});

test("Compare toggles without opening the record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.getByRole("button", { name: /^Agents / }).click();
  await page.locator("#project-search").fill("Aider");
  await page.locator('#project-grid .compare-toggle[data-compare-id="aider"]').click();
  await expect(page.locator("#project-dialog")).not.toBeVisible();
  await expect(page.locator("#comparison-tray")).toBeVisible();
});
