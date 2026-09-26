const { test, expect } = require("@playwright/test");

// Typing searches the boot records at once, and focusing the box fetches the
// systems search index, which repaints the grid when it lands. Tests measure
// after that repaint, so the card they measure is the card they click.
async function searchSystems(page, term) {
  const index = page.waitForResponse(response => new URL(response.url()).pathname === "/app/search/systems.json");
  await page.locator("#project-search").fill(term);
  await index;
  // The page stores the index and repaints in the same step, so once the
  // page holds it the repaint is done. searchIndexes is an app.js global.
  /* global searchIndexes */
  await page.waitForFunction(() => searchIndexes.systems !== undefined);
}

// Aims at a point on a card and reports what the point reaches. It first
// waits until the page stops scrolling: focusing the search box scrolls it
// into view, the page's smooth scrolling animates that scroll, and an instant
// scroll does not cancel the animation, so a point measured mid-scroll drifts
// before the click lands. Then one evaluate scrolls the target into view
// instantly, measures, and hit-tests the point, so nothing can move between
// the measurement and the hit test.
//
// `at` names the point: the target's centre, the gap between its first two
// `parts`, or the card beside its last part, halfway to the card's inner right
// edge. `hit` names what the point reaches, checked in this order: the card's
// details target, one of the parts, the target itself, something inside it,
// or anything else by tag and class.
const aim = (target, { at = "centre", parts = "" } = {}) => target.evaluate(async (element, { at, parts }) => {
  await new Promise(resolve => {
    let last = window.scrollY;
    let still = 0;
    const frame = () => requestAnimationFrame(() => {
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
      if (still >= 5) resolve();
      else frame();
    });
    frame();
  });
  element.scrollIntoView({ block: "center", behavior: "instant" });
  const card = element.closest(".project-card, .finder-result");
  const box = element.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const partElements = parts ? [...element.querySelectorAll(parts)] : [];
  const partBoxes = partElements.map(part => part.getBoundingClientRect());
  let x = box.left + box.width / 2;
  let y = box.top + box.height / 2;
  if (at === "between") {
    const [first, second] = partBoxes;
    x = (first.right + second.left) / 2;
    y = (first.top + first.bottom) / 2;
  } else if (at === "beside") {
    const last = partBoxes.at(-1);
    const style = getComputedStyle(card);
    x = (last.right + cardBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)) / 2;
    y = (last.top + last.bottom) / 2;
  }
  const within = rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const node = document.elementFromPoint(x, y);
  const hit = node?.closest(".card-open") ? "details"
    : partElements.some(part => part.contains(node)) ? "part"
    : node === element ? "target"
    : element.contains(node) ? "inside target"
    : `${node?.tagName}.${node?.getAttribute("class")}`;
  return { x, y, inCard: within(cardBox), inTarget: within(box), onPart: partBoxes.some(within), hit };
}, { at, parts });

test("clicking a card's title opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await searchSystems(page, "Aider");
  const card = page.locator('#project-grid .project-card:has([data-project="aider"])');
  // Click the title's spot with the mouse, the way a reader would. Playwright's
  // own click refuses, because the details target stretched over the card
  // intercepts the title, and that interception is the behaviour under test.
  const aimed = await aim(card.locator("h2"));
  expect(aimed.hit, "the title's spot reaches the card's details target").toBe("details");
  await page.mouse.click(aimed.x, aimed.y);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("clicking beside a card's emblems opens its record", async ({ page }) => {
  await page.goto("/?collection=systems");
  await searchSystems(page, "Aider");
  const row = page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badges');
  // The emblem row sits above the card's details target and shrinks to its
  // emblems, so the card beside the row still opens the record. The spot must
  // fall outside the row: a row stretched across the card would swallow it.
  const aimed = await aim(row, { at: "beside", parts: ".card-badge" });
  expect(aimed.inCard, "the spot lies inside the card").toBe(true);
  expect(aimed.inTarget, "the spot lies outside the emblem row").toBe(false);
  expect(aimed.hit, "the spot reaches the card's details target").toBe("details");
  await page.mouse.click(aimed.x, aimed.y);
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system%3Aaider|record=system:aider/);
});

test("clicking between two emblems opens neither the record nor a tooltip", async ({ page }) => {
  await page.goto("/?collection=systems");
  await searchSystems(page, "Aider");
  const row = page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badges');
  // A near miss inside the row stays inert, so a tap meant for an emblem
  // never opens the record in its place.
  const aimed = await aim(row, { at: "between", parts: ".card-badge" });
  expect(aimed.inTarget && !aimed.onPart, "the spot lies in the row, between two emblems").toBe(true);
  expect(aimed.hit, "the spot reaches the row itself, not an emblem or the details target").toBe("target");
  const before = page.url();
  await page.mouse.click(aimed.x, aimed.y);
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
  const aimed = await aim(card.locator(".card-source-meta"), { at: "beside", parts: "span:not(.visually-hidden)" });
  expect(aimed.inCard, "the spot lies inside the card").toBe(true);
  expect(aimed.inTarget, "the spot lies outside the source line").toBe(false);
  expect(aimed.hit, "the spot reaches the card's details target").toBe("details");
  await page.mouse.click(aimed.x, aimed.y);
  await expect(page.locator("#model-dialog")).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get("record") === `model:${id}`);
});

test("a card's hover-titled facts stay above its details target", async ({ page }) => {
  // A licence badge and a reviewed model's source line explain themselves in
  // a hover title, so the point at their centre must reach them, not the
  // details target stretched over the card.
  const reached = async locator => {
    const { hit } = await aim(locator);
    return hit === "target" || hit === "inside target" ? "itself" : hit;
  };

  await page.goto("/?collection=systems");
  await searchSystems(page, "Aider");
  const card = page.locator('#project-grid .project-card:has([data-project="aider"])');
  expect(await reached(card.locator(".license-badge").first()), "a project card's licence badge").toBe("itself");

  await page.goto("/?view=models");
  const model = page.locator("#model-grid .model-card:not(.imported-model-card)").first();
  expect(await reached(model.locator(".card-source-meta")), "a reviewed-model card's source line").toBe("itself");

  await page.goto("/?view=finder");
  for (const value of ["agent_system", "coding", "balanced"]) {
    await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  }
  expect(await reached(page.locator(".finder-result .license-badge").first()), "a Finder result's licence badge").toBe("itself");
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
