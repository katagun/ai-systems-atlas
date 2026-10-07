const { test, expect } = require("@playwright/test");
const { collectionDot, openCollection, openView } = require("./helpers/landing");
const { closeRecord, recordView } = require("./helpers/results");

// Reads where an element sits once the page stops scrolling. It first waits
// until scrollY holds still for five animation frames, then measures in the
// same evaluate, so nothing can move between the wait and the reading.
const settle = (page, selector) => page.locator(selector).evaluate(async element => {
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
  const box = element.getBoundingClientRect();
  return {
    top: box.top,
    bottom: box.bottom,
    headerBottom: document.querySelector(".site-header").getBoundingClientRect().bottom,
    stickyBottom: Math.max(
      document.querySelector(".site-header").getBoundingClientRect().bottom,
      document.querySelector("#scope-strip").getBoundingClientRect().bottom,
      document.querySelector("#results-bar").getBoundingClientRect().bottom,
    ),
  };
});

// Walks to a coding-agent shortlist under balanced fit. The one-screen layout
// needs no scroll correction to keep a choice reachable — choosing a job
// repaints only the shortlist below the tiles — so this is a plain click.
const shortlist = async (page, goal = "coding") => {
  await page.locator(`[data-finder-goal="${goal}"]`).click();
  await expect(page.locator(".finder-result")).toHaveCount(3);
};

test("every goal is listed at once with a count, and the tallest column clears the fold", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=finder");

  // The density claim the redesign rests on: 23 goals in five columns, with
  // the tallest column's last tile inside the first screen. Measured as the
  // lowest tile bottom anywhere on the page, so a taller column cannot hide,
  // and given the 16 px slack CI's Linux Chromium needs for font metrics.
  await expect(page.locator(".finder-goal")).toHaveCount(23);
  await expect(page.locator(".finder-group")).toHaveCount(5);
  const lowest = await page.locator(".finder-goal").evaluateAll(tiles =>
    Math.max(...tiles.map(tile => tile.getBoundingClientRect().bottom)));
  expect(lowest).toBeLessThanOrEqual(1000);

  // Every column lists exactly its table's goals, so the direction split the
  // tables describe is the one the screen shows.
  const perGroup = await page.locator(".finder-group").evaluateAll(groups =>
    groups.map(group => group.querySelectorAll(".finder-goal").length));
  expect(perGroup).toEqual([5, 7, 3, 4, 4]);

  // Every tile carries a number, which is the whole point: the wizard's
  // choices named a job and never said how many would match it.
  const counts = await page.locator(".finder-goal .element-count").allInnerTexts();
  expect(counts).toHaveLength(23);
  for (const count of counts) expect(Number(count)).toBeGreaterThan(0);
});

test("a goal's count matches the records the shortlist is drawn from", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);

  // "49 active records match" for a goal drawn from two roles. The tile count
  // and the candidate set come from one predicate, so they cannot drift apart;
  // this is the reader-visible half of that. The number moves with each
  // coding-agent or coding-workflow record the catalog publishes.
  await expect(page.locator("#finder-status")).toContainText("Write and maintain software: 49 active records match");
  await expect(page.locator(".finder-result-heading")).toContainText("3 of 49 active records");
});

test("choosing a job presses its tile and writes the URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await expect(page.locator(".finder-goal[aria-pressed='true']")).toHaveCount(0);
  await expect(page.locator(".finder-priorities")).toHaveCount(0);

  await shortlist(page);
  await expect(page.locator('[data-finder-goal="coding"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".finder-goal[aria-pressed='true']")).toHaveCount(1);
  await expect(page).toHaveURL(/view=finder&direction=agent_system&job=coding&prefer=balanced/);
  // A job settles its own direction, so the priorities shown are that
  // family's and no other's.
  await expect(page.locator(".finder-priority")).toHaveCount(5);
  await expect(page.locator('[data-finder-priority="balanced"]')).toHaveAttribute("aria-checked", "true");
});

test("choosing a priority reranks the shortlist and writes the URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  const balanced = await page.locator(".finder-result h3").allInnerTexts();

  await page.locator('[data-finder-priority="developer"]').click();
  await expect(page).toHaveURL(/prefer=developer/);
  await expect(page.locator("#finder-status")).toContainText("ranked for “Composable developer framework”");
  await expect(page.locator(".finder-result-heading")).toContainText("ranked for “Composable developer framework”");
  await expect(page.locator('[data-finder-priority="developer"]')).toHaveAttribute("aria-checked", "true");

  // Direct use is a trait of the coding agents themselves, so both profiles
  // of it rank Claude Code first. The ranking is exercised by unit tests
  // over every record and every priority; what the screen owes is that the
  // choice lands and the label follows it.
  expect(await page.locator(".finder-result h3").allInnerTexts()).toEqual(balanced);
});

test("Back and Forward retrace the three answers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator('[data-finder-priority="developer"]').click();
  await expect(page.locator(".finder-result")).toHaveCount(3);

  await page.goBack();
  await expect(page).toHaveURL(/prefer=balanced/);
  await expect(page.locator('[data-finder-priority="balanced"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".finder-result")).toHaveCount(3);

  await page.goBack();
  await expect(page).toHaveURL(/view=finder$/);
  await expect(page.locator(".finder-result")).toHaveCount(0);
  await expect(page.locator(".finder-goal")).toHaveCount(23);

  await page.goForward();
  await expect(page).toHaveURL(/job=coding&prefer=balanced/);
  await expect(page.locator(".finder-result")).toHaveCount(3);
});

test("a shared link restores the same three answers and the same three records", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator('[data-finder-priority="local"]').click();
  const shared = new URL(page.url()).search;
  const before = await page.locator(".finder-result h3").allInnerTexts();

  await page.goto("/?view=finder");
  await expect(page.locator(".finder-result")).toHaveCount(0);

  await page.goto(`/${shared}`);
  await expect(page.locator(".finder-result")).toHaveCount(3);
  await expect(page.locator(".finder-result h3")).toHaveText(before);
  await expect(page.locator('[data-finder-priority="local"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#finder-status")).toContainText("ranked for “Local execution and control”");
});

test("a goal its direction contradicts, or no goal at all, leaves the URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/?view=finder&direction=local_runtime&job=coding&prefer=balanced");
  await expect(page).toHaveURL(/view=finder$/);
  await expect(page.locator(".finder-result")).toHaveCount(0);
  await expect(page.locator(".finder-goal")).toHaveCount(23);

  await page.goto("/?view=finder&direction=agent_system&job=not_a_job");
  await expect(page).toHaveURL(/view=finder$/);
  await expect(page.locator(".finder-goal")).toHaveCount(23);

  // A priority the chosen direction does not offer falls back to balanced
  // rather than ranking against a profile it was never written for.
  await page.goto("/?view=finder&job=coding&prefer=serving");
  await expect(page.locator('[data-finder-priority="balanced"]')).toHaveAttribute("aria-checked", "true");
});

test("Browse matches lands on the results and shows the Finder's role set as a removable filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();

  // The results begin with the chips row, which holds the Finder chip, so
  // revealDirectoryResults lands the row's top within the same 12px margin
  // under the sticky stack that keepFinderInView uses. Landing on the panel
  // below it would leave the row under the bar.
  const { top: chipsTop, stickyBottom: sb } = await settle(page, "#filter-chips");
  expect(chipsTop).toBeLessThan(900);
  expect(chipsTop).toBeGreaterThanOrEqual(sb - 1);
  expect(chipsTop).toBeLessThanOrEqual(sb + 13);
  const chip = page.getByRole("button", { name: /Finder: Write and maintain software/ });
  await expect(chip).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");
  // The three answers belong to the Finder's own view, so the results URL
  // carries none of them.
  await expect(page).not.toHaveURL(/job=|prefer=|direction=/);

  await chip.click();
  // Targeted by id, not accessible name: the label empties on removal, so a
  // name-based locator would stop matching for that reason alone and read as
  // "hidden" regardless of whether the element itself was ever hidden.
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
  await expect(page.locator("#result-count")).not.toContainText("Finder match");
});

// The Finder chip is the only sign that the Finder's roles narrow the list,
// so the handoff never leaves it under the sticky strip and bar (ruling R-T3-4).
test("after Browse matches the Finder chip sits below the sticky strip and bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();
  const { top, stickyBottom } = await settle(page, "#finder-roles-chip");
  expect(top, `chip top ${top}, sticky bottom ${stickyBottom}`).toBeGreaterThanOrEqual(stickyBottom);
  await expect(page.locator("#result-count")).toBeFocused();
});

test("removing the Finder chip by keyboard moves focus to the result count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();

  const chip = page.getByRole("button", { name: /Finder: Write and maintain software/ });
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
  await expect(page.locator("#result-count")).toBeFocused();
});

test("Browse matches by keyboard moves focus to the result count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);

  // The Finder hides itself as it hands off, taking the focused button with it.
  await page.locator("[data-finder-directory]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-count")).toBeFocused();
});

test("Browse matches opens its matches on their first page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems&page=3");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 3 of");
  await openView(page, "finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();

  await expect(page.locator("#result-count")).toContainText("Finder match");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 1 of");
  await expect(page).not.toHaveURL(/page=/);
});

test("the Finder chip sits in the chips row above the result count, and its × glyph never wraps alone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();

  async function checkChipLayout() {
    const chip = page.locator("#finder-roles-chip");
    const chipBox = await chip.boundingBox();
    const countBox = await page.locator("#result-count").boundingBox();
    // Every active constraint is a chip in the row above the results
    // (Phase 3 task 3), so the chip ends before the count begins.
    await expect(page.locator("#filter-chips #finder-roles-chip")).toBeVisible();
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(countBox.y);
    // A Range over the label text node reports one client rect per wrapped
    // line; the × marker sharing the last line's bottom edge means it wrapped
    // together with the label rather than landing alone on its own line.
    const markerGluedToLabel = await chip.evaluate(button => {
      const range = document.createRange();
      range.selectNodeContents(button.firstChild);
      const labelRects = range.getClientRects();
      const markerRect = button.querySelector('[aria-hidden="true"]').getBoundingClientRect();
      return Math.abs(labelRects[labelRects.length - 1].bottom - markerRect.bottom) < 2;
    });
    expect(markerGluedToLabel).toBe(true);
  }

  await checkChipLayout();
  await page.setViewportSize({ width: 375, height: 800 });
  await checkChipLayout();
});

// The role set still has no URL key of its own, so a Back that leaves Systems'
// URL state as it was must not widen the list the Finder chose (ruling R18).
test("Back after closing a record keeps the Finder's role set", async ({ page }) => {
  await page.goto("/?view=finder");
  await shortlist(page);
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid [data-project]").first().click();
  await expect(recordView(page, "system")).toBeVisible();
  await closeRecord(page, "system");
  await expect(recordView(page, "system")).toBeHidden();
  await page.goBack();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);

  // A Back inside another collection leaves Systems alone, as a strip switch
  // does. The Systems strip entry clears the family by design, so the way
  // back into Systems is Back to the entry the Finder landed on.
  await page.locator("#project-grid [data-project]").first().click();
  await closeRecord(page, "system");
  await expect(recordView(page, "system")).toBeHidden();
  await openCollection(page, "inference");
  await page.locator("#inference-grid [data-inference-service]").first().click();
  await expect(recordView(page, "inference")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "inference")).toBeHidden();
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);
  await page.goBack();
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);
});
