const { test, expect } = require("@playwright/test");

// Reads where an element sits once the page stops scrolling. It first waits
// until scrollY holds still for five animation frames, then measures in the
// same evaluate, so nothing can move between the wait and the reading. With
// `aim`, it first scrolls the element to the middle of the screen, instantly,
// and reports its centre and whether a click there reaches it. Alongside the
// element's top it reads the header's bottom edge and the Finder shell's top.
const settle = (page, selector, { aim = false } = {}) => page.locator(selector).evaluate(async (element, aim) => {
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
  if (aim) element.scrollIntoView({ block: "center", behavior: "instant" });
  const box = element.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  return {
    x,
    y,
    top: box.top,
    reached: element.contains(document.elementFromPoint(x, y)),
    headerBottom: document.querySelector(".site-header").getBoundingClientRect().bottom,
    shellTop: document.querySelector(".finder-shell").getBoundingClientRect().top,
  };
}, aim);

// Clicks a Finder control with the mouse on a page that holds still, and
// returns where things sat when it did. Playwright's own click is not used
// here. A choice rendered under the resting mouse is still running its hover
// lift when that click checks it, so the click retries, and each retry scrolls
// with element.scrollIntoView, which the page's smooth scrolling animates and
// the click does not wait for. The page then kept moving after the choice had
// been handled, so a reading could land mid-scroll, and where the Finder sat
// before a choice depended on which retry ran.
const choose = async (page, selector) => {
  const aimed = await settle(page, selector, { aim: true });
  expect(aimed.reached, `a click at the centre of ${selector} reaches it`).toBe(true);
  await page.mouse.click(aimed.x, aimed.y);
  return aimed;
};

test("a choice keeps the step indicator in view and cards drop the repeated cue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await choose(page, '[data-finder-choice="direction"][data-finder-value="agent_system"]');
  await expect(page.locator(".finder-choice-cue", { hasText: "Choose this" })).toHaveCount(0);
  await choose(page, '[data-finder-choice="goal"][data-finder-value="coding"]');

  // Clicked from the middle of the screen, each checked control starts with
  // the shell's top hidden behind the sticky header, the case keepFinderInView
  // exists for. A no-op leaves it hidden; a working one snaps it back to just
  // below the header, within the same 12px margin every time.
  const beforePriority = await choose(page, '[data-finder-choice="priority"][data-finder-value="balanced"]');
  expect(beforePriority.shellTop, "the shell's top starts behind the header").toBeLessThan(beforePriority.headerBottom);
  const afterPriority = await settle(page, ".finder-shell");
  expect(afterPriority.top).toBeGreaterThanOrEqual(afterPriority.headerBottom);
  expect(afterPriority.top).toBeLessThanOrEqual(afterPriority.headerBottom + 13);

  // Back is aimed at on the painted shortlist. A shortlist still waiting on
  // detail repaints when the detail lands, which would move Back away from
  // the point already aimed at.
  await expect(page.locator(".finder-results")).toBeVisible();
  const beforeBack = await choose(page, "[data-finder-back]");
  expect(beforeBack.shellTop, "the shell's top starts behind the header").toBeLessThan(beforeBack.headerBottom);
  const afterBack = await settle(page, ".finder-shell");
  expect(afterBack.top).toBeGreaterThanOrEqual(afterBack.headerBottom);
  expect(afterBack.top).toBeLessThanOrEqual(afterBack.headerBottom + 13);
});

test("Browse matches lands on the results and shows the Finder's role set as a removable filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await choose(page, '[data-finder-choice="direction"][data-finder-value="agent_system"]');
  await choose(page, '[data-finder-choice="goal"][data-finder-value="coding"]');
  await choose(page, '[data-finder-choice="priority"][data-finder-value="balanced"]');
  await choose(page, "[data-finder-directory]");

  const { top: panelTop, headerBottom: hb } = await settle(page, "#systems-directory-panel");
  expect(panelTop).toBeLessThan(900);
  expect(panelTop).toBeGreaterThanOrEqual(hb - 1);
  // A no-op revealDirectoryResults leaves the panel far below the header,
  // where activateView's smooth scroll to the top comes to rest; a working
  // one lands its top within the same 12px margin keepFinderInView uses.
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
