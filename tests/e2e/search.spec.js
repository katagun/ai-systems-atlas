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
