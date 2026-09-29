const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { allSearch, collectionEntry, openCollection, openView, pressedEntry } = require("./helpers/landing");
const { clearFilters, expectFilter, filterControl, recordView, search, searchBox, setFilter, settled, sortControl } = require("./helpers/results");

// The page binds its search and keyboard listeners once its data has loaded,
// and paints the All grid right after, so a card on screen means they are live.
// The All list is results, so the page opens on it rather than the front door.
// The results repaint once typing pauses, so this waits for that.
async function searchAll(page, text) {
  await page.goto("/?collection=all");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  const input = allSearch(page);
  await input.focus();
  await input.fill(text);
  await settled(page);
}

// Focusing the search box fetches every search index, and each of All's six
// repaints the grid as it lands, so a count read before they all land can
// still grow.
/* global searchIndexes */
const allIndexesLanded = page => page.waitForFunction(() =>
  ["systems", "inference", "runtimes", "models", "packs", "robots"].every(key => searchIndexes[key] !== undefined));

// Published files, read the way the page reads them, so a routed copy can add
// a word no record holds: a query for it then matches only what the test put it on.
const readWeb = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", file), "utf8"));
const indexRoute = name => new RegExp(`/app/search/${name}\\.json(\\?.*)?$`);
const INDEX_WORD = "zyxwvutqj";
const withIndexWord = (index, id) => ({ ...index, [id]: `${index[id]} ${INDEX_WORD}` });

// Adds archived systems to the boot payload, with prose of their own so that
// nothing else in the catalog matches their names. Systems lists active
// records by default, so they stay hidden there until its filters are cleared.
async function addArchivedSystems(page, names) {
  const payload = readWeb("app/systems.json");
  const [template] = payload.systems;
  const added = names.map(name => {
    const id = name.toLowerCase().replace(/\s+/g, "-");
    return {
      ...template, id, name, status: "archived", superseded_by: undefined,
      description: "A record this test adds.", repo: `example/${id}`, url: `https://example.com/${id}`,
    };
  });
  await page.route(/\/app\/systems\.json(\?.*)?$/, route => route.fulfill({ json: { ...payload, systems: [...payload.systems, ...added] } }));
}

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
  await allSearch(page).fill("self hosted");
  await expect(page.locator("#all-directory-result-count")).toHaveText(hyphenated);
});

test("the result count shows beside the box, uncovered, without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchAll(page, "ollama");
  const count = page.locator("#results-bar .search-count");
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
  await expect(collectionEntry(page, "all")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(allSearch(page)).toHaveId("door-search");
  await expect(allSearch(page)).toBeFocused();

  await page.goto("/?collection=all");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(allSearch(page)).toHaveId("results-search");
  await expect(allSearch(page)).toBeFocused();
});

// A modal dialog makes the search box inert, so "/" there could only be
// swallowed. The page leaves the key to the browser, and focus in the dialog.
test("slash does nothing while a dialog is open", async ({ page }) => {
  const [runtime] = readWeb("app/runtimes.json").runtimes;
  await page.goto(`/?record=runtime:${runtime.id}`);
  const close = recordView(page, "runtime").locator(".dialog-close");
  await expect(close).toBeVisible();
  await page.evaluate(() => window.addEventListener("keydown", event => { window.slashPrevented = event.defaultPrevented; }));
  await close.focus();
  await page.keyboard.press("/");
  expect(await page.evaluate(() => window.slashPrevented), "the key is left to the browser").toBe(false);
  expect(await page.evaluate(() => Boolean(document.activeElement.closest("dialog[open]"))), "focus stays in the dialog").toBe(true);
});

test("a query follows the reader to another scope, and Best match selects itself and gives way", async ({ page }) => {
  await searchAll(page, "coding agent");
  await openCollection(page, "systems");
  await expect(searchBox(page, "systems")).toHaveValue("coding agent");
  await expect(sortControl(page, "systems")).toHaveValue("match");
  await search(page, "");
  await expect(sortControl(page, "systems")).toHaveValue("name");
});

test("a sort chosen during a query is kept", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await search(page, "api");
  await expect(sortControl(page, "inference")).toHaveValue("match");
  await sortControl(page, "inference").selectOption("name");
  await search(page, "apis");
  await expect(sortControl(page, "inference")).toHaveValue("name");
});

test("a shared query lists by Best match unless the link names a sort", async ({ page }) => {
  // The restored query shows once boot has restored the scope, which is the
  // same step that settles the sort, so each sort is read after it settles.
  await page.goto("/?collection=systems&q=coding%20agent");
  await expect(searchBox(page, "systems")).toHaveValue("coding agent");
  await expect(sortControl(page, "systems")).toHaveValue("match");

  await page.goto("/?collection=systems&q=coding%20agent&sort=name");
  await expect(searchBox(page, "systems")).toHaveValue("coding agent");
  await expect(sortControl(page, "systems")).toHaveValue("name");
});

test("a sort the link names is kept while the reader types", async ({ page }) => {
  await page.goto("/?collection=systems&q=coding%20agent&sort=name");
  await expect(searchBox(page, "systems")).toHaveValue("coding agent");
  await search(page, "coding agents");
  await expect(sortControl(page, "systems")).toHaveValue("name");
});

// Each scope with a Sort control, and its sort while browsing.
const BROWSING_SORTS = [
  ["/?collection=systems", "systems", "name"],
  ["/?collection=inference", "inference", "score"],
  ["/?collection=runtimes", "runtimes", "score"],
  ["/?collection=models", "models", "score"],
];

test("the browsing sort chosen during a query survives a reload", async ({ page }) => {
  for (const [url, scope, browsing] of BROWSING_SORTS) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await search(page, "api", scope);
    await expect(sortControl(page, scope)).toHaveValue("match");
    await sortControl(page, scope).selectOption(browsing);
    await page.reload();
    await expect(searchBox(page, scope)).toHaveValue("api");
    await expect(sortControl(page, scope), `${scope} keeps ${browsing} across a reload`).toHaveValue(browsing);
    await expect(page).toHaveURL(address => address.searchParams.get("sort") === browsing);
  }
});

test("Best match left in place during a query returns after a reload, and the URL names no sort", async ({ page }) => {
  for (const [url, scope] of BROWSING_SORTS) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await search(page, "api", scope);
    await expect(sortControl(page, scope)).toHaveValue("match");
    await page.reload();
    await expect(searchBox(page, scope)).toHaveValue("api");
    await expect(sortControl(page, scope)).toHaveValue("match");
    await expect(page, `${url} with a query leaves Best match out of the URL`)
      .toHaveURL(address => address.searchParams.get("q") === "api" && !address.searchParams.has("sort"));
  }
});

test("Clear filters ends the query, so the next query selects Best match again", async ({ page }) => {
  for (const [url, scope, chosen, fallback] of [
    ["/?collection=systems", "systems", "stars", "name"],
    ["/?collection=inference", "inference", "name", "score"],
    ["/?collection=runtimes", "runtimes", "name", "score"],
    ["/?collection=models", "models", "name", "score"],
  ]) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await search(page, "api", scope);
    await sortControl(page, scope).selectOption(chosen);
    await clearFilters(page, scope);
    await expect(sortControl(page, scope)).toHaveValue(fallback);
    await search(page, "apis", scope);
    await expect(sortControl(page, scope), `Clear filters in ${scope} forgets the sort chosen for the last query`).toHaveValue("match");
  }
});

test("the Finder's handoff ends an earlier query, so the next query selects Best match again", async ({ page }) => {
  for (const [url, scope, chosen, direction, goal, priority] of [
    ["/?collection=systems", "systems", "stars", "agent_system", "coding", "balanced"],
    ["/?collection=inference", "inference", "name", "inference_service", "route_models", "balanced"],
    ["/?collection=runtimes", "runtimes", "name", "local_runtime", "serve_workload", "hardware"],
  ]) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    await search(page, "api", scope);
    await sortControl(page, scope).selectOption(chosen);
    await page.getByRole("button", { name: "Find your fit", exact: true }).click();
    for (const value of [direction, goal, priority]) await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
    await page.locator("[data-finder-directory]").click();
    await expect(searchBox(page, scope)).toHaveValue("");
    await expect(sortControl(page, scope)).toHaveValue("score");
    await search(page, "apis", scope);
    await expect(sortControl(page, scope), `the ${direction} handoff forgets the sort chosen for the last query`).toHaveValue("match");
  }
});

test("clearing a query everywhere keeps a sort chosen during it, and the next query starts from that sort", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const sort = sortControl(page, "systems");
  await search(page, "memory");
  await expect(sort).toHaveValue("match");
  await sort.selectOption("stars");
  await openCollection(page, "all");
  await clearFilters(page, "all");
  await expect(searchBox(page), "All's Clear control clears the one query").toHaveValue("");
  await search(page, "browser");
  await openCollection(page, "systems");
  await expect(searchBox(page)).toHaveValue("browser");
  await expect(sort, "a new query selects Best match").toHaveValue("match");
  await search(page, "");
  await expect(sort, "clearing gives back the sort the reader had before this query").toHaveValue("stars");
});

test("Search all lists the one query in All and keeps it for every collection", async ({ page }) => {
  // Only a system holds this word, so Models lists nothing and offers All.
  const systems = readWeb("app/search/systems.json");
  const [first] = Object.keys(systems);
  await page.route(indexRoute("systems"), route => route.fulfill({ json: withIndexWord(systems, first) }));
  await page.goto("/?collection=models");
  await search(page, INDEX_WORD);
  await page.locator("#model-grid").getByRole("button", { name: "Search all" }).click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Everything /);
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(searchBox(page)).toBeFocused();
  await openCollection(page, "systems");
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(sortControl(page, "systems")).toHaveValue("match");
});

// Best match orders a query's matches, so browsing never offers it (D23). A
// link naming it without a query loses it, typing offers it, and clearing
// takes it away. Playwright's toBeDisabled does not read an option's state.
test("Best match is offered only while a query is present", async ({ page }) => {
  for (const [url, scope, browsing] of BROWSING_SORTS) {
    await page.goto(`${url}&sort=match`);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    const sort = sortControl(page, scope);
    const bestMatch = sort.locator('option[value="match"]');
    await expect(sort, `${url} restores its browsing sort`).toHaveValue(browsing);
    await expect(page, `${url} drops a Best match named without a query`).toHaveURL(address => !address.searchParams.has("sort"));
    await expect(bestMatch).toHaveJSProperty("disabled", true);
    await search(page, "api", scope);
    await expect(bestMatch).toHaveJSProperty("disabled", false);
    await expect(sort).toHaveValue("match");
    await search(page, "", scope);
    await expect(bestMatch).toHaveJSProperty("disabled", true);
    await expect(sort).toHaveValue(browsing);
  }
  // A link with a query offers Best match beside a sort it names.
  await page.goto("/?collection=inference&q=api&sort=name");
  await expect(searchBox(page, "inference")).toHaveValue("api");
  await expect(sortControl(page, "inference")).toHaveValue("name");
  await expect(sortControl(page, "inference").locator('option[value="match"]')).toHaveJSProperty("disabled", false);
});

test("a changed query starts every collection on its first page", async ({ page }) => {
  const index = readWeb("app/search/inference.json");
  await page.route(indexRoute("inference"), route => route.fulfill({
    json: Object.fromEntries(Object.entries(index).map(([id, text]) => [id, `${text} ${INDEX_WORD}`])),
  }));
  await page.goto("/?collection=inference&page=2");
  const pager = page.locator("#inference-pager");
  await expect(pager).toContainText("Page 2 of");
  await openCollection(page, "all");
  await search(page, INDEX_WORD);
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  await openCollection(page, "inference");
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(pager).toContainText(/Page 1 of ([2-9]|\d{2,})/);
});

test("a carried query searches the same text a typed one does", async ({ page }) => {
  // A query fetches every collection's index, so the one query reaches
  // Inference with its index, and lists what typing it there lists.
  let requested = false;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/app/search/inference.json") requested = true;
  });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await search(page, "privacy");
  await openCollection(page, "inference");
  await expect(searchBox(page, "inference")).toHaveValue("privacy");
  await expect.poll(() => requested, { message: "the carried query fetches the Inference index" }).toBe(true);
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  const carried = await page.locator("#inference-result-count").textContent();

  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await search(page, "privacy");
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  await expect(page.locator("#inference-result-count")).toHaveText(carried);
});

test("a misspelled name offers the right one", async ({ page }) => {
  await searchAll(page, "olama");
  const suggestion = page.getByRole("button", { name: "Ollama", exact: true });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(allSearch(page)).toHaveValue("Ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
  // The choice repaints away, so focus lands back in the search box.
  await expect(allSearch(page)).toBeFocused();
});

test("a query with no match offers the Finder and a suggestion form", async ({ page }) => {
  await searchAll(page, "Zyxwvut Frobnicator");
  await expect(page.getByText("No matches for “Zyxwvut Frobnicator”.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Suggest it for review" }))
    .toHaveAttribute("href", /template=system-suggestion\.yml&name=Zyxwvut%20Frobnicator$/);
});

// Many excluded names are hyphenated, and search reads a hyphen as a space,
// so the name typed either way finds its entry (D18).
test("a name the review left out says why, however its hyphen is typed", async ({ page }) => {
  // Serve a known exclusion so the test does not depend on which real
  // entries happen to be mentioned in some record's prose.
  const published = readWeb("exclusions.json");
  await page.route(/\/exclusions\.json(\?.*)?$/, route => route.fulfill({
    json: { ...published, entries: [{ ...published.entries[0], name: "Zyxwvut-Frobnicator", reason: "Test reason: out of scope." }] },
  }));
  for (const typed of ["Zyxwvut Frobnicator", "zyxwvut-frobnicator"]) {
    await searchAll(page, typed);
    await expect(page.getByText("Reviewed and left out:"), `${typed} finds the entry`).toBeVisible();
    await expect(page.getByText("Test reason: out of scope.")).toBeVisible();
    // The review already saw it, so there is nothing to suggest.
    await expect(page.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  }
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
  await allSearch(page).fill("run models locally");
  await expect(hint).toBeVisible();
  // A generic word appears in several jobs, so it names none of them.
  await allSearch(page).fill("agent");
  await expect(hint).toBeHidden();
  await allSearch(page).fill("run models locally");
  await expect(hint).toBeVisible();
  await clearFilters(page, "all");
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
  // A record's own name finds at least that record.
  const [system] = readWeb("app/systems.json").systems;
  await searchAll(page, system.name);
  await allIndexesLanded(page);
  await expect(page.locator("#results-bar .search-count")).toHaveText(/^[1-9]\d* results?$/);
  expect(fetched, "a search that found something never needs the list").toEqual([]);

  // A second empty result while the first fetch is still in flight.
  const input = allSearch(page);
  await input.fill("Zyxwvut Frobnicator");
  await expect(page.getByText("No matches for “Zyxwvut Frobnicator”.")).toBeVisible();
  await expect.poll(() => fetched.length, "the first empty result asks for the list").toBe(1);
  await input.fill("Zyxwvut Frobnicators");
  await expect(page.getByText("No matches for “Zyxwvut Frobnicators”.")).toBeVisible();
  release();
  await page.waitForFunction(() => Array.isArray(state.exclusions));
  expect(fetched, "one fetch serves every empty result").toHaveLength(1);
  expect(new URL(fetched[0]).searchParams.get("v"), "the list is fetched under its content stamp").toMatch(/^[0-9a-f]{12}$/);
});

// The suggestion form waits for the exclusions list, so the list's arrival
// repaints every view's results, not only those on screen. Switching views
// repaints nothing, so an empty result left in another view needs it too.
test("an empty result in another view gains the suggestion form when the exclusions list lands", async ({ page }) => {
  const fetched = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/exclusions\.json(\?.*)?$/, async route => {
    fetched.push(route.request().url());
    await held;
    await route.continue();
  });
  await page.goto("/?collection=models");
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  await search(page, "Zyxwvut Frobnicator");
  await expect.poll(() => fetched.length, "the settled empty result asks for the list").toBe(1);
  // The Finder, not the Catalog tab: the Catalog opens on the front door,
  // which clears the query this test leaves behind in Models.
  await openView(page, "finder");
  release();
  await page.waitForFunction(() => Array.isArray(state.exclusions));
  // The grid is hidden with its view, so the link is found by text, not role.
  await expect(page.locator("#model-grid a", { hasText: "Suggest it for review" })).toHaveCount(1);
});

// A list that fails to load counts as an empty one: empty results then name
// no exclusion but still offer the form, and the page never asks again
// (docs/WEB.md: exclusions.json is not retried within the page).
test("an exclusions list that fails to load counts as empty, and is asked for once", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let requests = 0;
  await page.route(/\/exclusions\.json(\?.*)?$/, route => {
    requests += 1;
    return route.fulfill({ status: 500, body: "" });
  });
  await searchAll(page, "Zyxwvut Frobnicator");
  const grid = page.locator("#all-directory-grid");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
  await allSearch(page).fill("Zyxwvut Frobnicators");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveAttribute("href", /name=Zyxwvut%20Frobnicators$/);
  await expect(grid).not.toContainText("Reviewed and left out:");
  expect(await page.evaluate(() => state.exclusions), "a failed list is recorded as empty").toEqual([]);
  expect(requests, "a failed list is not asked for again").toBe(1);
  expect(errors, "no page error").toEqual([]);
});

// Every search surface besides All, each with the job banner when its panel has one.
const EMPTY_STATE_SCOPES = [
  { url: "/?collection=systems", scope: "systems", grid: "#project-grid", hint: "systems" },
  { url: "/?collection=inference", scope: "inference", grid: "#inference-grid", hint: "inference" },
  { url: "/?collection=runtimes", scope: "runtimes", grid: "#runtime-grid", hint: "runtimes" },
  { url: "/?collection=packs", scope: "packs", grid: "#pack-grid" },
  { url: "/?collection=robots", scope: "robots", grid: "#robot-grid" },
  { url: "/?collection=models", scope: "models", grid: "#model-grid" },
  { url: "/?collection=labs", scope: "labs", grid: "#lab-grid" },
  { url: "/?collection=specifications", scope: "specifications", grid: "#specification-grid" },
];

test("every scope's empty search offers the next steps, and each Directory panel with a banner offers the job", async ({ page }) => {
  for (const { url, scope, grid, hint } of EMPTY_STATE_SCOPES) {
    await page.goto(url);
    await expect(page.locator(".view.is-active .project-card").first()).toBeVisible();
    const banner = hint && page.locator(`[data-job-hint="${hint}"]`);
    if (banner) {
      // Any Finder goal with records to shortlist, asked for by its own label.
      const goal = await page.evaluate(() => finderGoalEntries().find(entry => entry.eligible).label);
      await search(page, goal, scope);
      await expect(banner, `${hint} names a job`).toContainText("Looks like a job:");
    }
    await search(page, "Zyxwvut Frobnicator", scope);
    const results = page.locator(grid);
    await expect(results, `${grid} explains the empty result`).toContainText("No matches for “Zyxwvut Frobnicator”.");
    await expect(results.getByRole("button", { name: "Try the Finder" })).toBeVisible();
    // Nothing matches even with every facet cleared, so nothing is hidden and
    // the query can be suggested for review.
    await expect(results.getByRole("link", { name: "Suggest it for review" })).toBeVisible();
    await expect(results.getByRole("button", { name: /^Show (it|them)$/ })).toHaveCount(0);
    await expect(page.locator(".search-field").filter({ has: searchBox(page, scope) }).locator(".search-count"), `${scope} counts nothing`).toHaveText("0 results");
    if (banner) await expect(banner, `${hint} drops the banner`).toBeHidden();
  }
});

// Systems lists active records by default, so an archived system's name finds
// nothing there until its filters are cleared (R-P1-11).
test("a search the filters hide says so, offers to show it, and never offers it back or for review", async ({ page }) => {
  await addArchivedSystems(page, ["Zyxwvut Alpha", "Zyxwvut Beta"]);
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const input = searchBox(page, "systems");
  const grid = page.locator("#project-grid");
  await input.fill("Zyxwvut");
  await expect(grid).toContainText("It matches 2 reviewed records your filters hide.");
  await expect(grid.getByRole("button", { name: "Show them" })).toBeVisible();
  // Did-you-mean offers only what the filters let through, never a hidden name.
  await expect(grid.getByRole("button", { name: "Zyxwvut Alpha", exact: true })).toHaveCount(0);

  await input.fill("Zyxwvut Alpha");
  await expect(grid).toContainText("No matches for “Zyxwvut Alpha” with these filters.");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await expect(grid.getByRole("button", { name: "Zyxwvut Alpha", exact: true })).toHaveCount(0);
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#project-grid .project-card h2")).toHaveText(["Zyxwvut Alpha"]);
  await expect(input).toHaveValue("Zyxwvut Alpha");
  await expectFilter(page, "systems", "status", "");
  // The button repaints away, so focus lands back in the search box.
  await expect(input).toBeFocused();
});

// The Finder's handoff narrows Systems by a role set no control shows, so
// showing what the filters hide must drop it too: Family's own path does.
test("showing what the filters hide also drops a Finder role set", async ({ page }) => {
  await page.goto("/?view=finder");
  for (const value of ["memory_system", "agent_memory", "balanced"]) await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  // An active memory system whose role the set leaves out, so only the set hides it.
  const outside = await page.evaluate(() => state.projects.find(project => project.status === "active"
    && project.system_family === "memory_system" && !state.directoryRoles.includes(project.primary_role)));
  const index = readWeb("app/search/systems.json");
  await page.route(indexRoute("systems"), route => route.fulfill({ json: withIndexWord(index, outside.id) }));
  await search(page, INDEX_WORD);
  const grid = page.locator("#project-grid");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#project-grid .project-card h2")).toHaveText([outside.name]);
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
});

test("a search one facet hides says so, and showing it clears that facet and keeps the query", async ({ page }) => {
  // One service holds this word, and a Type it does not have hides it.
  const services = readWeb("app/inference.json").inference;
  const [service] = services;
  const type = services.find(item => item.service_type !== service.service_type).service_type;
  const index = readWeb("app/search/inference.json");
  await page.route(indexRoute("inference"), route => route.fulfill({ json: withIndexWord(index, service.id) }));
  await page.goto("/?collection=inference");
  await expect(page.locator("#inference-grid .project-card").first()).toBeVisible();
  await setFilter(page, "inference", "type", type);
  await search(page, INDEX_WORD);
  const grid = page.locator("#inference-grid");
  await expect(grid).toContainText(`No matches for “${INDEX_WORD}” with these filters.`);
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await grid.getByRole("button", { name: "Show it" }).click();
  await expectFilter(page, "inference", "type", "");
  await expect(page.locator("#inference-grid .project-card h2")).toHaveText([service.name]);
  await expect(page.locator("#results-bar .search-count")).toHaveText("1 result");
  await expect(searchBox(page, "inference")).toHaveValue(INDEX_WORD);
  await expect(page).toHaveURL(address => address.searchParams.get("q") === INDEX_WORD && !address.searchParams.has("type"));
});

// An imported models.dev row is not Atlas reviewed, and every Models type
// filter hides it, since none of those rows has a type.
test("a hidden match that is an imported source row is not called reviewed", async ({ page }) => {
  const imported = readWeb("app/models.json").models.find(model => model.review_status === "imported" && !model.model_type);
  const index = readWeb("app/search/models.json");
  await page.route(indexRoute("models"), route => route.fulfill({ json: withIndexWord(index, imported.id) }));
  await page.goto("/?collection=models");
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  const type = await filterControl(page, "models", "type").locator('option:not([value=""])').first().getAttribute("value");
  await setFilter(page, "models", "type", type);
  await search(page, INDEX_WORD);
  const grid = page.locator("#model-grid");
  await expect(grid).toContainText("It matches 1 record your filters hide.");
  await grid.getByRole("button", { name: "Show it" }).click();
  await expect(page.locator("#model-grid .project-card h2")).toHaveText([imported.name]);
});

// An empty result is one message, so it spans the grid rather than one card's
// column, at a measure that stays readable on a wide screen (R-P1-12). Widths
// do not move with scrolling, so nothing here waits for it to settle.
test("an empty result spans the grid, at a readable measure", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await searchAll(page, "Zyxwvut Frobnicator");
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
  await page.locator("#door-jobs button").first().press("Enter");
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
  await expect(page.locator("#finder-content h2")).toBeFocused();

  await searchAll(page, "Zyxwvut Frobnicator");
  await page.getByRole("button", { name: "Try the Finder" }).press("Enter");
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator("#finder-title")).toBeFocused();

  // Any Finder goal with records to shortlist, asked for by its own label.
  const goal = await page.evaluate(() => finderGoalEntries().find(entry => entry.eligible).label);
  await searchAll(page, goal);
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
  await search(page, "vLLM");
  const systems = page.locator("#project-grid");
  await expect(systems).toContainText("It matches records in other collections:");
  await expect(systems.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await systems.getByRole("button", { name: "Search all" }).click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Everything /);
  await expect(allSearch(page)).toHaveValue("vLLM");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("vLLM");
  await expect(allSearch(page)).toBeFocused();
  await expect(page).toHaveURL(address => address.searchParams.get("q") === "vLLM" && address.searchParams.get("collection") === "all");

  await page.goto("/?collection=specifications");
  await expect(page.locator("#specification-grid .project-card").first()).toBeVisible();
  await search(page, "vLLM");
  await page.locator("#specification-grid").getByRole("button", { name: "Search all" }).click();
  await expect(page.locator("#directory")).toHaveClass(/is-active/);
  await expect(allSearch(page)).toHaveValue("vLLM");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("vLLM");
  await expect(allSearch(page)).toBeFocused();
  await expect(page).toHaveURL(address => address.searchParams.get("q") === "vLLM" && !address.searchParams.has("view"));

  // Only Specifications answers this one, and All lists no specifications:
  // no suggestion form, and nothing for Search all to show.
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await search(page, "Agent2Agent Protocol");
  await expect(systems).toContainText("No matches for “Agent2Agent Protocol”.");
  await expect(systems.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(systems.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);
  await expect(systems.getByRole("button", { name: "Search all" })).toHaveCount(0);
});

// An empty result judges the whole catalog, so it waits for every search
// index a query loads. Until they land it offers nothing that judges the
// catalog: no collection button, no suggestion form, and no exclusions
// fetch. Here only a model holds the query, in its held index.
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
  await search(page, INDEX_WORD);
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
  await expect(grid).toContainText("It matches records in other collections: Models 1 · Search all");
  await expect(grid.getByRole("button", { name: "Search all" })).toBeVisible();
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveCount(0);

  // Once every index has landed, a later empty result fetches none again.
  await search(page, "Zyxwvut Frobnicator");
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
  await allSearch(page).fill("Zyxwvut Frobnicators");
  await expect(grid.getByRole("link", { name: "Suggest it for review" })).toHaveAttribute("href", /name=Zyxwvut%20Frobnicators$/);
  expect(failures, "an empty result asks for a failed index once").toBe(1);

  await page.unroute(indexRoute("labs"));
  await openCollection(page, "labs");
  await searchBox(page, "labs").focus();
  await page.waitForFunction(() => searchIndexes.labs !== undefined);
});

// Only a JSON object is an index. Stored, a body such as null would stay
// falsy, so the empty result would wait on it for ever and re-arm its own
// repaint in a microtask loop that hangs the page (N2). It is a failed load
// instead: the empty result settles, the page answers, and focus retries.
/* global searchIndexFailed */
test("a search index whose body is not an object counts as failed, so the page settles and answers", async ({ page }) => {
  await page.route(indexRoute("labs"), route => route.fulfill({ contentType: "application/json", body: "null" }));
  await searchAll(page, "Zyxwvut Frobnicator");
  await expect(page.locator("#all-directory-grid").getByRole("link", { name: "Suggest it for review" })).toBeVisible();
  const answer = await Promise.race([
    page.evaluate(() => searchIndexFailed.has("labs") && searchIndexes.labs === undefined),
    new Promise(resolve => { setTimeout(() => resolve("no answer within 2 s"), 2000); }),
  ]);
  expect(answer, "the page answers, holding the body as a failed load").toBe(true);

  await page.unroute(indexRoute("labs"));
  await openCollection(page, "labs");
  await searchBox(page, "labs").focus();
  await page.waitForFunction(() => searchIndexes.labs !== undefined);
});

// The comparison tray belongs to the Catalog's comparable collections. A repaint
// that lands while another view or collection is open, here an index an empty
// result was waiting on, must leave it hidden there, and the Directory shows
// it again (N1). The Finder is where the wave's repaints reached; Labs is
// where an index landing already unhid it before.
test("a repaint that lands in another view leaves the comparison tray hidden", async ({ page }) => {
  const { system_family: family } = readWeb("app/systems.json").systems.find(record => record.status === "active");
  const releases = {};
  for (const name of ["models", "specifications"]) {
    const held = new Promise(resolve => { releases[name] = resolve; });
    await page.route(indexRoute(name), async route => {
      await held;
      await route.continue();
    });
  }
  await page.goto(`/?collection=systems&family=${family}`);
  const tray = page.locator("#comparison-tray");
  await page.locator("#project-grid .compare-toggle").first().click();
  await expect(tray).toBeVisible();
  await search(page, INDEX_WORD);
  await page.waitForFunction(() => ["systems", "inference", "runtimes", "packs", "robots", "labs"]
    .every(key => searchIndexes[key] !== undefined));

  for (const [tab, chip, name] of [["finder", null, "models"], [null, "labs", "specifications"]]) {
    if (tab) await openView(page, tab);
    else {
      // Collections live inside the Catalog view, so return to it first.
      await openView(page, "directory");
      await openCollection(page, chip);
    }
    await expect(tray).toBeHidden();
    releases[name]();
    await page.waitForFunction(key => searchIndexes[key] !== undefined, name);
    await expect(tray, `the ${name} repaint leaves the tray hidden`).toBeHidden();
  }
  // Labs is an unscored collection, so entering it clears the system
  // comparison as incompatible; returning to Systems keeps it cleared.
  await openCollection(page, "systems");
  await expect(tray).toBeHidden();
  await expect(page).not.toHaveURL(/compare=/);
});

// WCAG contrast of an element's text against what it sits on: each
// translucent background up to the first opaque one, composited in order. A
// colour format it cannot read fails the test rather than being guessed at.
const contrastOf = locator => locator.evaluate(element => {
  if (!element.isConnected) throw new Error("the element was repainted away before it was measured");
  const parse = value => {
    const rgb = value.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);
    if (!rgb) throw new Error(`unreadable colour ${value}`);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const layers = [];
  for (let node = element; node; node = node.parentElement) {
    const layer = parse(getComputedStyle(node).backgroundColor);
    if (layer.a > 0) layers.push(layer);
    if (layer.a === 1) break;
  }
  const background = layers.reduceRight((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
  const text = over(parse(getComputedStyle(element).color), background);
  const luminance = ({ r, g, b }) => [r, g, b]
    .map(channel => channel / 255)
    .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
  const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return {
    ratio: (lighter + 0.05) / (darker + 0.05),
    underlined: getComputedStyle(element).textDecorationLine.includes("underline"),
  };
});

// Every action an empty result offers, and the job banner's button, sits on a
// tinted surface. Each must reach WCAG AA, 4.5:1 for text this size, in both
// palettes, and keep the underline that marks it as a link or button (D13).
/* global finderGoalEntries */
for (const colorScheme of ["light", "dark"]) {
  test(`an empty result's actions and the job banner's button are legible in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const expectLegible = async (locator, name) => {
      await expect(locator, name).toBeVisible();
      // The results repaint as each index lands and once more when the
      // exclusions list does, which is the last load, so measure after it.
      await page.waitForFunction(() => Array.isArray(state.exclusions));
      const { ratio, underlined } = await contrastOf(locator);
      expect(ratio, `${name} contrast in ${colorScheme}`).toBeGreaterThanOrEqual(4.5);
      expect(underlined, `${name} keeps its underline`).toBe(true);
    };
    // One system and one model hold this word, and the Status filter hides
    // the system, so Systems offers both "Show it" and "Search all".
    const systemsIndex = readWeb("app/search/systems.json");
    const modelsIndex = readWeb("app/search/models.json");
    const [system] = Object.keys(systemsIndex);
    const [model] = Object.keys(modelsIndex);
    await page.route(indexRoute("systems"), route => route.fulfill({ json: withIndexWord(systemsIndex, system) }));
    await page.route(indexRoute("models"), route => route.fulfill({ json: withIndexWord(modelsIndex, model) }));
    const { status } = readWeb("app/systems.json").systems.find(record => record.id === system);
    await page.goto(`/?collection=systems&status=${status === "active" ? "archived" : "active"}`);
    await page.waitForFunction(() => state.urlReady);
    await search(page, INDEX_WORD);
    const systems = page.locator("#project-grid .empty-search");
    await expectLegible(systems.getByRole("button", { name: "Show it" }), "Show it");
    await expectLegible(systems.getByRole("button", { name: "Search all" }), "Search all");
    await expectLegible(systems.getByRole("button", { name: "Try the Finder" }), "Try the Finder");

    await page.goto("/");
    await page.waitForFunction(() => state.urlReady);
    await allSearch(page).fill("Zyxwvut Frobnicator");
    await expectLegible(page.locator("#all-directory-grid .empty-search").getByRole("link", { name: "Suggest it for review" }), "Suggest it for review");
    // Any Finder goal with records to shortlist, asked for by its own label.
    const goal = await page.evaluate(() => finderGoalEntries().find(entry => entry.eligible).label);
    await allSearch(page).fill(goal);
    await expectLegible(page.locator('[data-job-hint="all"]').getByRole("button", { name: /Open shortlist/ }), "Open shortlist");
  });
}
