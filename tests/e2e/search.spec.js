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

// Published files, read the way the page reads them, so a routed copy can add
// a word no record holds: a query for it then matches only what the test put it on.
const readWeb = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", file), "utf8"));
const indexRoute = name => new RegExp(`/app/search/${name}\\.json(\\?.*)?$`);
const INDEX_WORD = "zyxwvutqj";
const withIndexWord = (index, id) => ({ ...index, [id]: `${index[id]} ${INDEX_WORD}` });

// Every request the page makes for one path, whatever its content stamp.
function requestsFor(page, pathname) {
  const urls = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === pathname) urls.push(request.url());
  });
  return urls;
}

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

// A sort chosen for one query must not outlive it (D9). Text carried in that
// differs from what the box held is a new query there, so it selects Best
// match, and clearing it restores the sort from before the box held a query.
test("a query carried in with new text selects Best match, and clearing it restores the earlier sort", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const sort = page.locator("#sort-filter");
  await page.locator("#project-search").fill("memory");
  await expect(sort).toHaveValue("match");
  await sort.selectOption("stars");
  await page.getByRole("button", { name: /^All / }).click();
  await page.locator("#reset-all-directory").click();
  await page.locator("#all-directory-search").fill("browser");
  await page.getByRole("button", { name: /^Systems / }).click();
  await expect(page.locator("#project-search")).toHaveValue("browser");
  await expect(sort, "a sort chosen for the old text gives way").toHaveValue("match");
  await page.locator("#project-search").fill("");
  await expect(sort, "clearing restores the sort from before the first query").toHaveValue("name");
});

// Search all writes All's box alone. Writing the hidden Directory scope's box
// would make a later carry back look unchanged and keep a stale sort (D9).
test("Search all from a sibling view leaves the Directory scope's own query alone", async ({ page }) => {
  // Only a system holds this word, so Models lists nothing and offers All.
  const systems = readWeb("app/search/systems.json");
  const [first] = Object.keys(systems);
  await page.route(indexRoute("systems"), route => route.fulfill({ json: withIndexWord(systems, first) }));
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const sort = page.locator("#sort-filter");
  await page.locator("#project-search").fill("memory");
  await sort.selectOption("stars");
  await page.locator('.tab[data-tab="models"]').click();
  await page.locator("#model-search").fill(INDEX_WORD);
  await page.locator("#model-grid").getByRole("button", { name: "Search all" }).click();
  await expect(page.locator("#all-directory-search")).toHaveValue(INDEX_WORD);
  await expect(page.locator("#project-search"), "Search all writes only All's box").toHaveValue("memory");
  await page.getByRole("button", { name: /^Systems / }).click();
  await expect(page.locator("#project-search")).toHaveValue(INDEX_WORD);
  await expect(sort).toHaveValue("match");
});

// Best match orders a query's matches, so browsing never offers it (D23). A
// link naming it without a query loses it, typing offers it, and clearing
// takes it away. Playwright's toBeDisabled does not read an option's state.
test("Best match is offered only while a query is present", async ({ page }) => {
  for (const [url, search, sortSelector, browsing] of BROWSING_SORTS) {
    await page.goto(`${url}&sort=match`);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    const sort = page.locator(sortSelector);
    const bestMatch = sort.locator('option[value="match"]');
    await expect(sort, `${url} restores its browsing sort`).toHaveValue(browsing);
    await expect(page, `${url} drops a Best match named without a query`).toHaveURL(address => !address.searchParams.has("sort"));
    await expect(bestMatch).toHaveJSProperty("disabled", true);
    await page.locator(search).fill("api");
    await expect(bestMatch).toHaveJSProperty("disabled", false);
    await expect(sort).toHaveValue("match");
    await page.locator(search).fill("");
    await expect(bestMatch).toHaveJSProperty("disabled", true);
    await expect(sort).toHaveValue(browsing);
  }
  // A link with a query offers Best match beside a sort it names.
  await page.goto("/?collection=inference&q=api&sort=name");
  await expect(page.locator("#inference-search")).toHaveValue("api");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("name");
  await expect(page.locator('#inference-sort-filter option[value="match"]')).toHaveJSProperty("disabled", false);
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
  // The review already saw it, so there is nothing to suggest.
  await expect(page.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
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
    // Nothing matches even with every facet cleared, so nothing is hidden and
    // the query can be suggested for review.
    await expect(results.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
    await expect(results.getByRole("button", { name: /^Show (it|them)$/ })).toHaveCount(0);
    if (banner) await expect(banner, `${hint} drops the banner`).toBeHidden();
  }
});

// Systems lists active records by default, so a superseded or archived
// system's name finds nothing there until its filters are cleared (R-P1-11).
test("a search the filters hide says so, offers to show it, and never offers it back or for review", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const search = page.locator("#project-search");
  const grid = page.locator("#project-grid");
  await search.fill("kernel");
  await expect(grid).toContainText("It matches 2 reviewed records your filters hide.");
  await expect(grid.getByRole("button", { name: "Show them" })).toBeVisible();
  // Did-you-mean offers only what the filters let through, never a hidden name.
  await expect(grid.getByRole("button", { name: "Semantic Kernel", exact: true })).toHaveCount(0);

  await search.fill("AutoGen");
  await expect(grid).toContainText("No matches for “AutoGen” with these filters.");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await expect(grid.getByRole("button", { name: "AutoGen", exact: true })).toHaveCount(0);
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#project-grid .project-card h2")).toHaveText(["AutoGen"]);
  await expect(search).toHaveValue("AutoGen");
  await expect(page.locator("#status-filter")).toHaveValue("");
  // The button repaints away, so focus lands back in the search box.
  await expect(search).toBeFocused();
});

// The Finder's handoff narrows Systems by a role set no control shows, so
// showing what the filters hide must drop it too: Family's own path does.
test("showing what the filters hide also drops a Finder role set", async ({ page }) => {
  await page.goto("/?view=finder");
  for (const value of ["memory_system", "agent_memory", "balanced"]) await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  await page.locator("#project-search").fill("Joplin");
  const grid = page.locator("#project-grid");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#project-grid .project-card h2")).toHaveText(["Joplin"]);
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
});

test("a search one facet hides says so, and showing it clears that facet and keeps the query", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await page.locator("#inference-type-filter").selectOption("direct_model_api");
  await page.locator("#inference-search").fill("Together AI");
  const grid = page.locator("#inference-grid");
  await expect(grid).toContainText("No matches for “Together AI” with these filters.");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#inference-type-filter")).toHaveValue("");
  await expect(page.locator("#inference-grid .project-card h2")).toHaveText(["Together AI"]);
  await expect(page.locator("#inference-directory-panel .search-count")).toHaveText("1 result");
  await expect(page.locator("#inference-search")).toHaveValue("Together AI");
  await expect(page).toHaveURL(address => address.searchParams.get("q") === "Together AI" && !address.searchParams.has("type"));
});

// An imported models.dev row is not Atlas reviewed, and every Models type
// filter hides it, since none of those rows has a type.
test("a hidden match that is an imported source row is not called reviewed", async ({ page }) => {
  await page.goto("/?view=models");
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  await page.locator("#model-type-filter").selectOption("language_model");
  await page.locator("#model-search").fill("Qwen3 Coder Flash");
  const grid = page.locator("#model-grid");
  await expect(grid).toContainText("It matches 1 record your filters hide.");
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#model-grid .project-card h2")).toHaveText(["Qwen3 Coder Flash"]);
});

// An empty result is one message, so it spans the grid rather than one card's
// column, at a measure that stays readable on a wide screen (R-P1-12). Widths
// do not move with scrolling, so nothing here waits for it to settle.
test("an empty result spans the grid, at a readable measure", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await searchAll(page, "notion alternative");
    const empty = page.locator("#all-directory-grid .empty-search");
    await expect(empty).toBeVisible();
    const { box, grid, column } = await empty.evaluate(element => ({
      box: element.getBoundingClientRect().width,
      grid: element.parentElement.getBoundingClientRect().width,
      column: parseFloat(getComputedStyle(element.parentElement).gridTemplateColumns.split(" ")[0]),
    }));
    if (width === 1440) {
      expect(box, "wider than one card's column").toBeGreaterThan(column + 16);
      expect(box, "narrower than the whole grid").toBeLessThan(grid - 16);
    } else {
      expect(Math.abs(box - grid), "as wide as the phone's one-column grid").toBeLessThanOrEqual(1);
    }
  }
});

// A view switch hides the button that asked for it, so focus would fall to
// the page. It lands on the new view's heading instead, or on the Finder's
// question when a job opens it partway (R-P1-14). Boot moves no focus.
test("a button that switches views hands focus to the new view's heading", async ({ page }) => {
  await page.goto("/?view=finder");
  await expect(page.locator("#finder-content h2")).toHaveText("What should it do?");
  expect(await page.evaluate(() => document.activeElement === document.body), "boot leaves focus alone").toBe(true);

  await page.goto("/");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  await page.locator('.hero [data-open-tab="finder"]').press("Enter");
  await expect(page.locator("#finder-title")).toBeFocused();

  await searchAll(page, "notion alternative");
  await page.getByRole("button", { name: "Try the Finder" }).press("Enter");
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator("#finder-title")).toBeFocused();

  await searchAll(page, "run models locally");
  await page.locator('[data-job-hint="all"]').getByRole("button", { name: /Open shortlist/ }).press("Enter");
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
  await expect(page.locator("#finder-content h2")).toBeFocused();
});

// "Suggest it for review" waits until nothing anywhere in the catalog answers
// the query. A match in another collection is offered through All, from a
// Directory scope or from a sibling view (R-P1-15).
test("a query another collection answers offers Search all, not the suggestion form", async ({ page }) => {
  // vLLM is a local runtime, so Systems lists nothing for it.
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.locator("#project-search").fill("vLLM");
  const systems = page.locator("#project-grid");
  await expect(systems).toContainText(/It matches \d+ records? in other collections\./);
  await expect(systems.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await systems.getByRole("button", { name: "Search all" }).click();
  await expect(page.getByRole("button", { name: /^All / })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#all-directory-search")).toHaveValue("vLLM");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("vLLM");
  await expect(page.locator("#all-directory-search")).toBeFocused();
  await expect(page).toHaveURL(address => address.searchParams.get("q") === "vLLM" && !address.searchParams.has("collection"));

  await page.goto("/?view=specifications");
  await expect(page.locator("#specification-grid .project-card").first()).toBeVisible();
  await page.locator("#specification-search").fill("vLLM");
  await page.locator("#specification-grid").getByRole("button", { name: "Search all" }).click();
  await expect(page.locator("#directory")).toHaveClass(/is-active/);
  await expect(page.locator("#all-directory-search")).toHaveValue("vLLM");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("vLLM");
  await expect(page.locator("#all-directory-search")).toBeFocused();
  await expect(page).toHaveURL(address => address.searchParams.get("q") === "vLLM" && !address.searchParams.has("view"));

  // Only Specifications answers this one, and All lists no specifications:
  // no suggestion form, and nothing for Search all to show.
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.locator("#project-search").fill("Agent2Agent Protocol");
  await expect(systems).toContainText("No matches for “Agent2Agent Protocol”.");
  await expect(systems.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(systems.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await expect(systems.getByRole("button", { name: "Search all" })).toHaveCount(0);
});

// An empty result judges the whole catalog, and the Systems box loads only its
// own index, so the empty result loads the rest itself. Until they land it
// offers nothing that judges the catalog: no count, no suggestion form, and
// no exclusions fetch. Here only a model holds the query, in its held index.
test("an empty result waits for every search index before it counts other collections", async ({ page }) => {
  const models = readWeb("app/search/models.json");
  const [first] = Object.keys(models);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(indexRoute("models"), async route => {
    await held;
    await route.fulfill({ json: withIndexWord(models, first) });
  });
  const exclusions = requestsFor(page, "/exclusions.json");
  const indexes = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/app/search/")) indexes.push(new URL(request.url()).pathname);
  });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.locator("#project-search").fill(INDEX_WORD);
  const grid = page.locator("#project-grid");
  await expect(grid).toContainText(`No matches for “${INDEX_WORD}”.`);
  await expect(grid.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  // Every other index lands, and the held one alone still keeps the catalog unjudged.
  await page.waitForFunction(() => ["systems", "inference", "runtimes", "packs", "robots", "labs", "specifications"]
    .every(key => searchIndexes[key] !== undefined));
  await expect(grid).not.toContainText("in other collections");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  expect(exclusions, "no exclusions fetch while an index is pending").toEqual([]);

  release();
  await expect(grid).toContainText("It matches 1 record in other collections.");
  await expect(grid.getByRole("button", { name: "Search all" })).toBeVisible();
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);

  // Once every index has landed, a later empty result fetches none again.
  await page.locator("#project-search").fill("Zyxwvut Frobnicator");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
  expect([...indexes].sort(), "each index is fetched once").toEqual([...new Set(indexes)].sort());
  expect(indexes, "every collection's index").toHaveLength(8);
});

// A link that restores a query the boot records cannot answer paints an empty
// result first. It waits for the indexes too, so the suggestion form never
// flashes and the exclusions list is never fetched for a query the index answers.
test("a restored query waits for the indexes before it offers the suggestion form", async ({ page }) => {
  const systems = readWeb("app/search/systems.json");
  const [first] = Object.keys(systems);
  const { name } = readWeb("app/systems.json").systems.find(record => record.id === first);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(indexRoute("systems"), async route => {
    await held;
    await route.fulfill({ json: withIndexWord(systems, first) });
  });
  const exclusions = requestsFor(page, "/exclusions.json");
  await page.goto(`/?q=${INDEX_WORD}`);
  const grid = page.locator("#all-directory-grid");
  await expect(grid).toContainText(`No matches for “${INDEX_WORD}”.`);
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);

  release();
  await expect(grid.locator(".project-card h2")).toHaveText([name]);
  expect(exclusions, "a query the index answers never needs the exclusions list").toEqual([]);
});

// The form waits for the exclusions list as well, so it never invites review
// of a name the review has already left out.
test("the suggestion form waits for the exclusions list", async ({ page }) => {
  const fetched = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/exclusions\.json(\?.*)?$/, async route => {
    fetched.push(route.request().url());
    await held;
    await route.continue();
  });
  await searchAll(page, "Zyxwvut Frobnicator");
  const grid = page.locator("#all-directory-grid");
  // The list is asked for only once every index has settled.
  await expect.poll(() => fetched.length).toBe(1);
  await expect(grid).toContainText("No matches for “Zyxwvut Frobnicator”.");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);

  release();
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
});

// A failed index counts as settled, so an empty result asks for it once and
// then judges the catalog without it; an index that keeps failing cannot loop.
// A search box that loads the index on focus still retries it.
test("a search index that fails is asked for once, and a focused search box retries it", async ({ page }) => {
  let failures = 0;
  await page.route(indexRoute("labs"), route => {
    failures += 1;
    return route.fulfill({ status: 503, body: "" });
  });
  await searchAll(page, "Zyxwvut Frobnicator");
  const grid = page.locator("#all-directory-grid");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
  await page.locator("#all-directory-search").fill("Zyxwvut Frobnicators");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveAttribute("href", /name=Zyxwvut%20Frobnicators$/);
  expect(failures, "an empty result asks for a failed index once").toBe(1);

  await page.unroute(indexRoute("labs"));
  await page.locator('.tab[data-tab="labs"]').click();
  await page.locator("#lab-search").focus();
  await page.waitForFunction(() => searchIndexes.labs !== undefined);
});
