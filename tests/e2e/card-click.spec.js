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

// The point halfway from an element's last visible box to its card's inner
// right edge, level with that box: the card beside the element, which a row
// stretched across the card would cover. Returns the boxes a test checks it
// against, read after an instant scroll has landed.
const besideElement = (card, selector, last) => card.evaluate((element, [selector, last]) => {
  const target = element.querySelector(selector);
  target.scrollIntoView({ block: "center", behavior: "instant" });
  const style = getComputedStyle(element);
  const cardBox = element.getBoundingClientRect();
  const lastBox = [...target.querySelectorAll(last)].at(-1).getBoundingClientRect();
  const innerRight = cardBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  return {
    x: (lastBox.right + innerRight) / 2,
    y: (lastBox.top + lastBox.bottom) / 2,
    targetBox: target.getBoundingClientRect().toJSON(),
    cardBox: cardBox.toJSON(),
  };
}, [selector, last]);
const holds = (box, x, y) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

test("clicking beside a card's emblems opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  const card = page.locator('#project-grid .project-card:has([data-project="aider"])');
  // The emblem row sits above the card's details target and shrinks to its
  // emblems, so the card beside the row still opens the record. The spot must
  // fall outside the row: a row stretched across the card would swallow it.
  const { x, y, targetBox, cardBox } = await besideElement(card, ".card-badges", ".card-badge");
  expect(holds(cardBox, x, y), "the spot lies inside the card").toBe(true);
  expect(holds(targetBox, x, y), "the spot lies outside the emblem row").toBe(false);
  await page.mouse.click(x, y);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("clicking between two emblems opens neither the record nor a tooltip", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  const row = page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badges');
  // A near miss inside the row stays inert, so a tap meant for an emblem
  // never opens the record in its place.
  const { rowBox, emblemBoxes } = await row.evaluate(element => {
    element.scrollIntoView({ block: "center", behavior: "instant" });
    return {
      rowBox: element.getBoundingClientRect().toJSON(),
      emblemBoxes: [...element.querySelectorAll(".card-badge")].map(emblem => emblem.getBoundingClientRect().toJSON()),
    };
  });
  const [first, second] = emblemBoxes;
  const x = (first.right + second.left) / 2;
  const y = (first.top + first.bottom) / 2;
  expect(holds(rowBox, x, y) && !emblemBoxes.some(box => holds(box, x, y)), "the spot lies in the row, between two emblems").toBe(true);
  const before = page.url();
  await page.mouse.click(x, y);
  await expect(page.locator("#badge-tooltip")).toBeHidden();
  await expect(page.locator("#project-dialog")).not.toBeVisible();
  expect(page.url()).toBe(before);
});

test("clicking beside a reviewed-model card's source line opens its record", async ({ page }) => {
  await page.goto("/?view=models");
  const card = page.locator("#model-grid .model-card:not(.imported-model-card)").first();
  const id = await card.locator(".card-open").getAttribute("data-model");
  // The source line sits above the details target for its hover title and
  // shrinks to its text, so the card beside the text still opens the record.
  await expect(card.locator(".card-source-meta")).toHaveAttribute("title", /\S/);
  const { x, y, targetBox, cardBox } = await besideElement(card, ".card-source-meta", "span:not(.visually-hidden)");
  expect(holds(cardBox, x, y), "the spot lies inside the card").toBe(true);
  expect(holds(targetBox, x, y), "the spot lies outside the source line").toBe(false);
  await page.mouse.click(x, y);
  await expect(page.locator("#model-dialog")).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get("record") === `model:${id}`);
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
