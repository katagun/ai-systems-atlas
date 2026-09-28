const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

// The page binds its search and keyboard listeners once its data has loaded,
// and paints the All grid right after, so a card on screen means they are live.
async function searchAll(page, text) {
  await page.goto("/");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  const input = page.locator("#all-directory-search");
  await input.focus();
  await input.fill(text);
}

// Focusing the All box fetches six search indexes, and each one repaints the
// grid as it lands, so a count read before they all land can still grow.
/* global searchIndexes */
const allIndexesLanded = page => page.waitForFunction(() =>
  ["systems", "inference", "runtimes", "models", "packs", "robots"].every(key => searchIndexes[key] !== undefined));

// Measures the count beside a search box, after the page stops scrolling:
// focusing and filling the box scroll it into view, and the page's smooth
// scrolling animates that scroll. One evaluate then measures and hit-tests,
// so nothing moves between the two. `slack` is the room between the typed
// text's right edge and the count's left edge.
const placeCount = count => count.evaluate(async element => {
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
  const input = element.parentElement.querySelector("input");
  const box = element.getBoundingClientRect();
  const field = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  const textRight = field.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  return {
    uncovered: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element,
    inViewport: box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
    insideField: box.top >= field.top && box.bottom <= field.bottom && box.right <= field.right,
    slack: box.left - textRight,
  };
});

test("an exact name comes first", async ({ page }) => {
  await searchAll(page, "ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
});

test("hyphens and spaces ask the same question", async ({ page }) => {
  await searchAll(page, "self-hosted");
  await allIndexesLanded(page);
  const hyphenated = await page.locator("#all-directory-result-count").textContent();
  await page.locator("#all-directory-search").fill("self hosted");
  await expect(page.locator("#all-directory-result-count")).toHaveText(hyphenated);
});

test("the result count shows beside the box, uncovered, without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchAll(page, "ollama");
  const count = page.locator("#all-directory-panel .search-count");
  await expect(count).toHaveText(/^\d+ results?$/);
  const placed = await placeCount(count);
  await expect(count).toBeInViewport();
  expect(placed.inViewport, "the whole count is on screen").toBe(true);
  expect(placed.uncovered, "nothing covers the count").toBe(true);
  expect(placed.insideField, "the count sits inside the search box").toBe(true);
  expect(placed.slack, "the count clears the typed text").toBeGreaterThanOrEqual(0);
});

test("slash focuses the search box", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(page.locator("#all-directory-search")).toBeFocused();
});

test("a query follows the reader to another scope, and Best match selects itself and gives way", async ({ page }) => {
  await searchAll(page, "coding agent");
  await page.getByRole("button", { name: /^Systems / }).click();
  await expect(page.locator("#project-search")).toHaveValue("coding agent");
  await expect(page.locator("#sort-filter")).toHaveValue("match");
  await page.locator("#project-search").fill("");
  await expect(page.locator("#sort-filter")).toHaveValue("name");
});

test("a sort chosen during a query is kept", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await page.locator("#inference-search").fill("api");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("match");
  await page.locator("#inference-sort-filter").selectOption("name");
  await page.locator("#inference-search").fill("apis");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("name");
});

test("a shared query lists by Best match unless the link names a sort", async ({ page }) => {
  // The restored query shows once boot has restored the scope, which is the
  // same step that settles the sort, so each sort is read after it settles.
  await page.goto("/?collection=systems&q=coding%20agent");
  await expect(page.locator("#project-search")).toHaveValue("coding agent");
  await expect(page.locator("#sort-filter")).toHaveValue("match");

  await page.goto("/?collection=systems&q=coding%20agent&sort=name");
  await expect(page.locator("#project-search")).toHaveValue("coding agent");
  await expect(page.locator("#sort-filter")).toHaveValue("name");
});

test("a sort the link names is kept while the reader types", async ({ page }) => {
  await page.goto("/?collection=systems&q=coding%20agent&sort=name");
  await expect(page.locator("#project-search")).toHaveValue("coding agent");
  await page.locator("#project-search").fill("coding agents");
  await expect(page.locator("#sort-filter")).toHaveValue("name");
});

// Each scope with a Sort control, and its sort while browsing.
const BROWSING_SORTS = [
  ["/?collection=systems", "#project-search", "#sort-filter", "name"],
  ["/?collection=inference", "#inference-search", "#inference-sort-filter", "score"],
  ["/?collection=runtimes", "#runtime-search", "#runtime-sort-filter", "score"],
  ["/?view=models", "#model-search", "#model-sort-filter", "score"],
];

test("the browsing sort chosen during a query survives a reload", async ({ page }) => {
  for (const [url, search, sort, browsing] of BROWSING_SORTS) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await page.locator(search).fill("api");
    await expect(page.locator(sort)).toHaveValue("match");
    await page.locator(sort).selectOption(browsing);
    await page.reload();
    await expect(page.locator(search)).toHaveValue("api");
    await expect(page.locator(sort), `${sort} keeps ${browsing} across a reload`).toHaveValue(browsing);
    await expect(page).toHaveURL(address => address.searchParams.get("sort") === browsing);
  }
});

test("Best match left in place during a query returns after a reload, and the URL names no sort", async ({ page }) => {
  for (const [url, search, sort] of BROWSING_SORTS) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await page.locator(search).fill("api");
    await expect(page.locator(sort)).toHaveValue("match");
    await page.reload();
    await expect(page.locator(search)).toHaveValue("api");
    await expect(page.locator(sort)).toHaveValue("match");
    await expect(page, `${url} with a query leaves Best match out of the URL`)
      .toHaveURL(address => address.searchParams.get("q") === "api" && !address.searchParams.has("sort"));
  }
});

test("Clear filters ends the query, so the next query selects Best match again", async ({ page }) => {
  for (const [url, search, sort, clear, chosen, fallback] of [
    ["/?collection=systems", "#project-search", "#sort-filter", "#reset-filters", "stars", "name"],
    ["/?collection=inference", "#inference-search", "#inference-sort-filter", "#reset-inference-filters", "name", "score"],
    ["/?collection=runtimes", "#runtime-search", "#runtime-sort-filter", "#reset-runtime-filters", "name", "score"],
    ["/?view=models", "#model-search", "#model-sort-filter", "#reset-model-filters", "name", "score"],
  ]) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await page.locator(search).fill("api");
    await page.locator(sort).selectOption(chosen);
    await page.locator(clear).click();
    await expect(page.locator(sort)).toHaveValue(fallback);
    await page.locator(search).fill("apis");
    await expect(page.locator(sort), `${clear} forgets the sort chosen for the last query`).toHaveValue("match");
  }
});

test("the Finder's handoff ends an earlier query, so the next query selects Best match again", async ({ page }) => {
  for (const [url, search, sort, chosen, direction, goal, priority] of [
    ["/?collection=systems", "#project-search", "#sort-filter", "stars", "agent_system", "coding", "balanced"],
    ["/?collection=inference", "#inference-search", "#inference-sort-filter", "name", "inference_service", "route_models", "balanced"],
    ["/?collection=runtimes", "#runtime-search", "#runtime-sort-filter", "name", "local_runtime", "serve_workload", "hardware"],
  ]) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await page.locator(search).fill("api");
    await page.locator(sort).selectOption(chosen);
    await page.getByRole("button", { name: "Finder", exact: true }).click();
    for (const value of [direction, goal, priority]) await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
    await page.locator("[data-finder-directory]").click();
    await expect(page.locator(search)).toHaveValue("");
    await expect(page.locator(sort)).toHaveValue("score");
    await page.locator(search).fill("apis");
    await expect(page.locator(sort), `the ${direction} handoff forgets the sort chosen for the last query`).toHaveValue("match");
  }
});

test("a carried query searches the same text a typed one does", async ({ page }) => {
  // Focusing the Systems box fetches only the Systems index, so the
  // Inference index is fetched for the carried query or not at all.
  let requested = false;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/app/search/inference.json") requested = true;
  });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.locator("#project-search").fill("privacy");
  await page.getByRole("button", { name: /^Inference services / }).click();
  await expect(page.locator("#inference-search")).toHaveValue("privacy");
  await expect.poll(() => requested, { message: "the carried query fetches the Inference index" }).toBe(true);
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  const carried = await page.locator("#inference-result-count").textContent();

  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await page.locator("#inference-search").fill("privacy");
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  await expect(page.locator("#inference-result-count")).toHaveText(carried);
});

test("a misspelled name offers the right one", async ({ page }) => {
  await searchAll(page, "olama");
  const suggestion = page.getByRole("button", { name: "Ollama", exact: true });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
});

test("a query with no match offers the Finder and a suggestion form", async ({ page }) => {
  await searchAll(page, "notion alternative");
  await expect(page.getByText("No matches for “notion alternative”.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Suggest it for review" }))
    .toHaveAttribute("href", /template=system-suggestion\.yml&name=notion%20alternative/);
});

test("a name the review left out says why", async ({ page }) => {
  // Serve a known exclusion so the test does not depend on which real
  // entries happen to be mentioned in some record's prose.
  const published = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "exclusions.json"), "utf8"));
  await page.route(/\/exclusions\.json(\?.*)?$/, route => route.fulfill({
    json: { ...published, entries: [{ ...published.entries[0], name: "Zyxwvut Frobnicator", reason: "Test reason: out of scope." }] },
  }));
  await searchAll(page, "Zyxwvut Frobnicator");
  await expect(page.getByText("Reviewed and left out:")).toBeVisible();
  await expect(page.getByText("Test reason: out of scope.")).toBeVisible();
});

test("an intent query offers the Finder job and opens its shortlist step", async ({ page }) => {
  await searchAll(page, "run models locally");
  const hint = page.locator('[data-job-hint="all"]');
  await expect(hint).toContainText("Run models on my own computer");
  await hint.getByRole("button", { name: /Open shortlist/ }).click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
});

// The banner is a flex box, and an author display rule overrides the one the
// hidden attribute brings, so the stylesheet has to restore it.
test("the job banner shows only while the query names a job", async ({ page }) => {
  await searchAll(page, "ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
  const hint = page.locator('[data-job-hint="all"]');
  await expect(hint).toBeHidden();
  await page.locator("#all-directory-search").fill("run models locally");
  await expect(hint).toBeVisible();
  await page.locator("#reset-all-directory").click();
  await expect(hint).toBeHidden();
});

// The exclusions list is a published endpoint, read only to explain an empty
// result. A search that finds something never needs it, one fetch serves every
// empty result after it, and it carries the content stamp every other data
// file does (ruling R-P1-3), so a changed list is never served from a cache.
/* global state */
test("the exclusions list is fetched once, stamped, and only for a search that found nothing", async ({ page }) => {
  const fetched = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/exclusions\.json(\?.*)?$/, async route => {
    fetched.push(route.request().url());
    await held;
    await route.continue();
  });
  await searchAll(page, "ollama");
  await allIndexesLanded(page);
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
  expect(fetched, "a search that found something never needs the list").toEqual([]);

  // A second empty result while the first fetch is still in flight.
  const input = page.locator("#all-directory-search");
  await input.fill("notion alternative");
  await expect(page.getByText("No matches for “notion alternative”.")).toBeVisible();
  await input.fill("notion alternatives");
  await expect(page.getByText("No matches for “notion alternatives”.")).toBeVisible();
  release();
  await page.waitForFunction(() => Array.isArray(state.exclusions));
  expect(fetched, "one fetch serves every empty result").toHaveLength(1);
  expect(new URL(fetched[0]).searchParams.get("v"), "the list is fetched under its content stamp").toMatch(/^[0-9a-f]{12}$/);
});

// Every search surface besides All, each with the job banner when its panel has one.
const EMPTY_STATE_SCOPES = [
  { url: "/?collection=systems", search: "#project-search", grid: "#project-grid", hint: "systems" },
  { url: "/?collection=inference", search: "#inference-search", grid: "#inference-grid", hint: "inference" },
  { url: "/?collection=runtimes", search: "#runtime-search", grid: "#runtime-grid", hint: "runtimes" },
  { url: "/?collection=packs", search: "#pack-search", grid: "#pack-grid" },
  { url: "/?collection=robots", search: "#robot-search", grid: "#robot-grid" },
  { url: "/?view=models", search: "#model-search", grid: "#model-grid" },
  { url: "/?view=labs", search: "#lab-search", grid: "#lab-grid" },
  { url: "/?view=specifications", search: "#specification-search", grid: "#specification-grid" },
];

test("every scope's empty search offers the next steps, and each Directory panel with a banner offers the job", async ({ page }) => {
  for (const { url, search, grid, hint } of EMPTY_STATE_SCOPES) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    const banner = hint && page.locator(`[data-job-hint="${hint}"]`);
    if (banner) {
      await page.locator(search).fill("run models locally");
      await expect(banner, `${hint} names the job`).toContainText("Run models on my own computer");
    }
    await page.locator(search).fill("Zyxwvut Frobnicator");
    const results = page.locator(grid);
    await expect(results, `${grid} explains the empty result`).toContainText("No matches for “Zyxwvut Frobnicator”.");
    await expect(results.getByRole("button", { name: "Try the Finder" })).toBeVisible();
    await expect(results.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
    if (banner) await expect(banner, `${hint} drops the banner`).toBeHidden();
  }
});
