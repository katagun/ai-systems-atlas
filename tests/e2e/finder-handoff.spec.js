const { test, expect } = require("@playwright/test");

const headerBottom = page => page.locator(".site-header").evaluate(header => header.getBoundingClientRect().bottom);

test("a choice keeps the step indicator in view and cards drop the repeated cue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await expect(page.locator(".finder-choice-cue", { hasText: "Choose this" })).toHaveCount(0);
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();

  // A no-op keepFinderInView leaves the shell scrolled well past the header
  // here (goal and priority each shrink the panel); a working one snaps its
  // top back to just under the header, within the same 12px margin every time.
  const hb = await headerBottom(page);
  const shellTop = () => page.locator(".finder-shell").evaluate(shell => shell.getBoundingClientRect().top);
  const topAfterPriority = await shellTop();
  expect(topAfterPriority).toBeGreaterThanOrEqual(hb);
  expect(topAfterPriority).toBeLessThanOrEqual(hb + 13);

  await page.locator("[data-finder-back]").click();
  const topAfterBack = await shellTop();
  expect(topAfterBack).toBeGreaterThanOrEqual(hb);
  expect(topAfterBack).toBeLessThanOrEqual(hb + 13);
});

test("Browse matches lands on the results and shows the Finder's role set as a removable filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
  await page.locator("[data-finder-directory]").click();

  const hb = await headerBottom(page);
  const panelTop = await page.locator("#systems-directory-panel").evaluate(panel => panel.getBoundingClientRect().top);
  expect(panelTop).toBeLessThan(900);
  expect(panelTop).toBeGreaterThanOrEqual(hb - 1);
  // A no-op revealDirectoryResults leaves the panel far below the header
  // (mid smooth-scroll or settled at its natural offset); a working one
  // lands its top within the same 12px margin keepFinderInView uses.
  expect(panelTop).toBeLessThanOrEqual(hb + 13);
  const chip = page.getByRole("button", { name: /Finder: Write and maintain software/ });
  await expect(chip).toBeVisible();
  await expect(page.locator("#result-count")).toContainText("Finder match");

  await chip.click();
  // Targeted by id, not accessible name: the label empties on removal, so a
  // name-based locator would stop matching for that reason alone and read as
  // "hidden" regardless of whether the element itself was ever hidden.
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
  await expect(page.locator("#result-count")).not.toContainText("Finder match");
});

test("removing the Finder chip by keyboard moves focus to the result count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
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
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();

  // The Finder hides itself as it hands off, taking the focused button with it.
  await page.locator("[data-finder-directory]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-count")).toBeFocused();
});

test("Browse matches opens its matches on their first page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems&page=3");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 3 of");
  await page.locator('.tab[data-tab="finder"]').click();
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
  await page.locator("[data-finder-directory]").click();

  await expect(page.locator("#result-count")).toContainText("Finder match");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 1 of");
  await expect(page).not.toHaveURL(/page=/);
});

test("the Finder chip sits beside the result count, and its × glyph never wraps alone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice="direction"][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice="goal"][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice="priority"][data-finder-value="balanced"]').click();
  await page.locator("[data-finder-directory]").click();

  async function checkChipLayout() {
    const chip = page.locator("#finder-roles-chip");
    const chipBox = await chip.boundingBox();
    const countBox = await page.locator("#result-count").boundingBox();
    // space-between with no gap centers the count between the chip and Clear
    // filters (hundreds of px away); beside the chip, the gap is a few px.
    expect(countBox.x - (chipBox.x + chipBox.width)).toBeLessThan(40);
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
