const { test, expect } = require("@playwright/test");
const { collectionDot, openCollection, openView, searchAll } = require("./helpers/landing");
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

// The priority row is the first thing a chosen job adds, and it sits below all
// the goal tiles: on a phone the shortlist starts more than 2,500 px down the
// page, so a choice that left the page where it was looked like nothing had
// happened. "In view" is its top below the sticky header and above the bottom of
// the viewport, or above the phone's fixed bottom bar where there is one; the
// exact 12 px the page aims for is not asserted, because a shortlist still
// reading its scores can leave a desktop page too short to scroll that far.
async function expectPriorityRowInView(page, label) {
  const { top, headerBottom } = await settle(page, ".finder-priorities");
  const bottom = await page.evaluate(() => {
    const bar = document.querySelector("#mobile-nav");
    return getComputedStyle(bar).display === "none" ? window.innerHeight : bar.getBoundingClientRect().top;
  });
  expect(top, `${label}: the row clears the sticky header`).toBeGreaterThanOrEqual(headerBottom - 1);
  expect(top, `${label}: the row starts above the bottom of the screen`).toBeLessThan(bottom);
}

// Walks to a coding-agent shortlist under balanced fit with a plain click on the
// job's tile. Choosing a job repaints only what sits below the tiles, so the
// page scrolls the priority row into view for the reader (the "priority row"
// tests at the end of this file assert that), and a spec needs no scroll of its
// own to reach the shortlist.
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

// The records figure is the total the five directions hold, not a floor: "over
// 293 active records" read as "more than 293".
test("the status line counts the jobs and the records they span before a job is chosen", async ({ page }) => {
  await page.goto("/?view=finder");
  await expect(page.locator("#finder-status")).toHaveText(
    /^\d+ jobs in 5 directions, across \d+ active records\. Choose one to see its three strongest reviewed matches\.$/,
  );
});

test("a goal's count matches the records the shortlist is drawn from", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);

  // "51 active records match" for a goal drawn from two roles. The tile count
  // and the candidate set come from one predicate, so they cannot drift apart;
  // this is the reader-visible half of that. The number moves with each
  // coding-agent or coding-workflow record the catalog publishes.
  await expect(page.locator("#finder-status")).toContainText("Write and maintain software: 51 active records match");
  await expect(page.locator(".finder-result-heading")).toContainText("3 of 51 active records");
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

  const { top: panelTop, stickyBottom: sb } = await settle(page, "#systems-directory-panel");
  expect(panelTop).toBeLessThan(900);
  expect(panelTop).toBeGreaterThanOrEqual(sb - 1);
  expect(panelTop).toBeLessThanOrEqual(sb + 13);
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

test("the Finder chip sits beside the result count, and its × glyph never wraps alone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await shortlist(page);
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

// The priority row. Choosing a job paints it, and the shortlist under it, below
// every goal tile, so the page scrolls it into view once per choice: on a click or
// keyboard choice, and when the Finder opens with a job already set.

test("priority row: choosing a job brings it into view, and choosing a priority does not scroll", async ({ page }) => {
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?view=finder");
    await shortlist(page);
    await expectPriorityRowInView(page, `${width} px, after choosing a job`);

    // A priority re-ranks the shortlist in place: the page asks for no scroll,
    // and the row stays where the reader sees it. scrollY itself is another
    // matter on a phone. Its status line above the tiles gains a line when the
    // ranking names a longer priority (the wide layout reserves two), and
    // Chromium's scroll anchoring then moves scrollY by that line to keep the
    // row still, so the row is what is held still there and scrollY at 1440.
    await page.evaluate(() => {
      window.scrollRequests = 0;
      for (const method of ["scrollTo", "scroll", "scrollBy"]) {
        const request = window[method].bind(window);
        window[method] = (...args) => { window.scrollRequests += 1; return request(...args); };
      }
    });
    const place = () => page.evaluate(() => ({ scrollY: window.scrollY, rowTop: document.querySelector(".finder-priorities").getBoundingClientRect().top }));
    const before = await place();
    expect(before.scrollY, `${width} px: the page did scroll to the row`).toBeGreaterThan(0);
    await page.locator('[data-finder-priority="developer"]').click();
    await expect(page).toHaveURL(/prefer=developer/);
    await expect(page.locator('[data-finder-priority="developer"]')).toHaveAttribute("aria-checked", "true");
    const after = await place();
    expect(await page.evaluate(() => window.scrollRequests), `${width} px: a priority asks for no scroll`).toBe(0);
    expect(Math.abs(after.rowTop - before.rowTop), `${width} px: the row stays where it was`).toBeLessThanOrEqual(1);
    if (width > 720) expect(after.scrollY, `${width} px: a priority leaves scrollY unchanged`).toBe(before.scrollY);
  }
});

test("priority row: a row already on screen below the header does not move the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/?view=finder");
  await shortlist(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectPriorityRowInView(page, "tall desktop");
});

// The shortlist first paints a placeholder and paints again when the reviewed
// scores arrive. The second paint leaves the page where the first put it.
test("priority row: the shortlist replacing its placeholder does not scroll the page again", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/app\/detail\/system\//, async route => {
    await held;
    await route.continue();
  });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-goal="coding"]').click();
  await expect(page.getByRole("heading", { name: "Reading the reviewed scores…" })).toBeVisible();
  await expectPriorityRowInView(page, "while the scores load");
  const before = await page.evaluate(() => window.scrollY);
  expect(before, "the page scrolled to the row at the choice").toBeGreaterThan(0);

  release();
  await expect(page.locator(".finder-result")).toHaveCount(3);
  expect(await page.evaluate(() => window.scrollY), "the scores landing does not scroll").toBe(before);
});

// A goal tile carried the attribute the "Open shortlist →" banner's handler
// reads, so a tile click also ran openFinderAt, which asks the page for its top.
// From the last tile on a phone that sent the reader 1,700 px up, away from the
// shortlist their click had just chosen.
test("priority row: choosing a job from the last tile on a phone does not throw the page to the top", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?view=finder");
  const last = page.locator(".finder-goal").last();
  await last.scrollIntoViewIfNeeded();
  const start = await page.evaluate(() => window.scrollY);
  expect(start, "the last tile sits far down the page").toBeGreaterThan(1000);
  // Everything from here on is recorded: how far up the page ever gets, and
  // every scroll the page itself asks for. The first is what the reader sees. The
  // second catches a request for the top that a later scroll to the row would
  // hide, since an explicit scroll cancels the glide it interrupts.
  await page.evaluate(() => {
    window.lowestScroll = window.scrollY;
    window.addEventListener("scroll", () => { window.lowestScroll = Math.min(window.lowestScroll, window.scrollY); });
    window.scrollCalls = [];
    const request = window.scrollTo.bind(window);
    window.scrollTo = (...args) => { window.scrollCalls.push(args); return request(...args); };
  });
  await last.click();
  // The last job has fewer than three matches, so the shortlist is awaited by
  // its first card rather than a count.
  await expect(page.locator(".finder-result").first()).toBeVisible();
  await settle(page, ".finder-priorities");
  const scrollCalls = await page.evaluate(() => window.scrollCalls);
  expect(scrollCalls.filter(([options]) => options?.top === 0), "a tile click never asks the page for its top").toEqual([]);
  // A line more or less in the status text above the tiles moves scrollY by that
  // line (scroll anchoring); a glide to the top is 1,700 px.
  expect(await page.evaluate(() => window.lowestScroll), "the page never went back up").toBeGreaterThanOrEqual(start - 100);
  await expectPriorityRowInView(page, "from the last tile");
});

// A phone's bottom bar is fixed over the last 64 px of the screen, so a row whose
// top sits behind it is inside the viewport and still out of the reader's sight.
test("priority row: a row that would land behind the phone's bottom bar is scrolled clear of it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?view=finder");
  await shortlist(page);
  // Park the page with the row 32 px above the bottom edge of the screen, then
  // choose another job from a tile that is on screen. Left where it is, the new
  // row would sit under the bar.
  const offset = await page.locator(".finder-priorities").evaluate(row => row.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(top => window.scrollTo({ top, behavior: "instant" }), offset - 780);
  const barTop = await page.locator("#mobile-nav").evaluate(bar => bar.getBoundingClientRect().top);
  expect(barTop, "the parked row is behind the bar").toBeLessThan(780 - 26);
  await page.locator(".finder-goal").nth(-3).click();
  await expect(page.locator(".finder-result").first()).toBeVisible();
  await expectPriorityRowInView(page, "from behind the bottom bar");
});

test("priority row: a Finder link that names a job opens with it in view on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // `direction` only makes a link legible; the job alone restores both.
  for (const query of ["view=finder&direction=agent_system&job=coding&prefer=balanced", "view=finder&job=coding"]) {
    await page.goto(`/?${query}`);
    await expect(page.locator(".finder-result")).toHaveCount(3);
    // Web fonts swap in after boot and can move the row a few pixels.
    await page.evaluate(() => document.fonts.ready);
    await expectPriorityRowInView(page, query);
  }
});

test("priority row: a front-door job button, clicked from a scrolled page, opens the Finder with it in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await page.locator('#door-jobs [data-door-direction="agent_system"]').click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator(".finder-result")).toHaveCount(3);
  await expectPriorityRowInView(page, "front-door job");
});

/* global finderGoalEntries */
test("priority row: the search banner's Open shortlist opens the Finder with it in view on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  // Boot payloads arrive after load. Reading goals before they land caches an
  // empty list, and a later search then has nothing eligible to shortlist.
  // Phones hide the other families, so the first tile can be attached and hidden.
  await page.locator("[data-element]").first().waitFor({ state: "attached" });
  // Any Finder goal with records to shortlist, asked for by its own label.
  const goal = await page.evaluate(() => finderGoalEntries().find(entry => entry.eligible).label);
  await searchAll(page, goal);
  const hint = page.locator('[data-job-hint="all"]');
  await expect(hint).toContainText("Looks like a job:");
  await hint.getByRole("button", { name: /Open shortlist/ }).click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator(".finder-result")).toHaveCount(3);
  await expectPriorityRowInView(page, "search banner");
});

// Both scrolls are instant, as the Directory's own handoff is, so reduced
// motion has nothing to switch off. Measured at once, with no wait for the page
// to settle: an animated scroll would still be on its way.
test("priority row: with reduced motion the row is in place the moment a job is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-goal="coding"]').click();
  // The row is looked up when measuring: the shortlist repaints as its scores
  // land, and a handle taken before that would point at a detached copy.
  const { top, headerBottom } = await page.evaluate(() => ({
    top: document.querySelector(".finder-priorities").getBoundingClientRect().top,
    headerBottom: document.querySelector(".site-header").getBoundingClientRect().bottom,
  }));
  expect(top).toBeGreaterThanOrEqual(headerBottom - 1);
  expect(top).toBeLessThan(812);
});
