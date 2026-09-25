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

test("clicking beside a card's emblems opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  const row = page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badges');
  // Only the emblems sit above the card's details target, so the rest of
  // their row still opens the record. The spot is level with the emblems,
  // halfway from the last one to the row's end.
  const { rowBox, emblemBoxes } = await row.evaluate(element => {
    element.scrollIntoView({ block: "center", behavior: "instant" });
    return {
      rowBox: element.getBoundingClientRect().toJSON(),
      emblemBoxes: [...element.querySelectorAll(".card-badge")].map(emblem => emblem.getBoundingClientRect().toJSON()),
    };
  });
  const last = emblemBoxes.at(-1);
  const x = (last.right + rowBox.right) / 2;
  const y = (last.top + last.bottom) / 2;
  const holds = box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  expect(holds(rowBox) && !emblemBoxes.some(holds), "the spot lies in the row, clear of every emblem").toBe(true);
  await page.mouse.click(x, y);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("clicking a Finder result's body opens that result's record", async ({ page }) => {
  await page.goto("/?view=finder");
  for (const value of ["agent_system", "coding", "balanced"]) {
    await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  }
  const result = page.locator(".finder-result").first();
  const id = await result.locator(".card-open").getAttribute("data-finder-project");
  // Click the description, not the button. Each result must hold its own
  // details target; one that escaped would open another record or none.
  const description = result.locator("h3 + p");
  await description.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await description.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get("record") === `system:${id}`);
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
