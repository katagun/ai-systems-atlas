// Front-door Phase 3, the results page (docs/superpowers/specs/
// 2026-09-29-front-door-phase-3-results-page-design.md): the frame, one
// query, and the strip's match counts.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { collectionEntry, familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const { recordView, search, searchBox, settled, sortControl } = require("./helpers/results");

// A word no record holds, written into one collection's search index so a
// test controls exactly which collection answers it.
const INDEX_WORD = "zyxwvutsrq";
const readIndex = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "app", "search", `${name}.json`), "utf8"));
async function onlyInIndex(page, name) {
  const index = readIndex(name);
  const [first] = Object.keys(index);
  await page.route(`**/app/search/${name}.json*`, route => route.fulfill({ json: { ...index, [first]: `${index[first]} ${INDEX_WORD}` } }));
}

test("one search box serves every collection and keeps its text across them", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#results-search")).toHaveCount(1);
  await expect(page.locator(".collection-panel input[type=search]")).toHaveCount(0);
  await search(page, "memory");
  await openCollection(page, "models");
  await expect(searchBox(page)).toHaveValue("memory");
  await expect(page).toHaveURL(url => url.searchParams.get("collection") === "models" && url.searchParams.get("q") === "memory");
});

test("while searching, each strip entry counts and names its matches", async ({ page }) => {
  await onlyInIndex(page, "labs");
  await page.goto("/?collection=all");
  await search(page, INDEX_WORD);
  const labs = collectionEntry(page, "labs");
  await expect(labs.locator(".scope-count")).toHaveText("1");
  await expect(labs).toHaveAccessibleName(/^Labs\s*1\s*match$/);
  await expect(collectionEntry(page, "systems").locator(".scope-count")).toHaveText("0");
  await search(page, "");
  await expect(labs.locator(".scope-count")).not.toHaveText("1");
  await expect(labs).toHaveAccessibleName(/^Labs\s*\d+$/);
});

test("a query of stop words alone leaves the strip on its browsing counts", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const counts = page.locator("#scope-strip .scope-count, #scope-strip .family-entry strong");
  const browsing = await counts.allTextContents();
  // "me" is a stop word, and it begins "memory": a reader who pauses there is still browsing.
  await search(page, "me");
  await expect(counts).toHaveText(browsing);
  await expect(page.locator("#scope-strip .scope-caption")).not.toContainText("match");
  for (const entry of await page.locator("#scope-strip .scope-entry").all()) await expect(entry).not.toHaveAccessibleName(/match/);
});

test("an empty result names the collections that hold matches, from the front door on", async ({ page }) => {
  await onlyInIndex(page, "labs");
  await page.goto("/");
  await searchAll(page, INDEX_WORD);
  const button = page.locator('#all-directory-grid [data-empty-open-collection="labs"]');
  await expect(button).toHaveText("Labs 1");
  await button.click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Labs\b/);
  await expect(searchBox(page)).toHaveValue(INDEX_WORD);
  await expect(searchBox(page)).toBeFocused();
  await expect(page.locator("#lab-grid .project-card")).toHaveCount(1);
});

// ECC is an agent system installed as a pack, so Systems and Agent packs both
// list it. A Systems filter that hides it leaves no "0 records" line, and the
// Agent packs button counts what Agent packs then lists.
test("an empty result's collection buttons count where the matches are, when two collections list one record", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system");
  await search(page, "ECC");
  const grid = page.locator("#project-grid");
  await expect(grid).toContainText("It matches 1 reviewed record your filters hide.");
  await expect(grid).toContainText("It matches records in other collections: Agent packs 1");
  await expect(grid).not.toContainText(/\b0 records?\b/);
  await expect(grid.getByRole("button", { name: "Search all" })).toHaveCount(0);
  await expect(collectionEntry(page, "packs").locator(".scope-count")).toHaveText("1");
  await grid.locator('[data-empty-open-collection="packs"]').click();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Agent packs\b/);
  await expect(page.locator("#pack-grid .project-card h2")).toHaveText(["ECC"]);
});

// A lab's name, not its models, answers "hangzhou", so "Browse all in Models"
// lists nothing unless it clears the search its label promises to widen.
test("Browse all in Models clears the search and lists the lab's releases newest first", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "hangzhou");
  await page.locator('#all-directory-grid [data-empty-open-collection="labs"]').click();
  const lab = page.locator("#lab-grid [data-lab]").first();
  const id = await lab.getAttribute("data-lab");
  await lab.click();
  await recordView(page, "lab").locator(`[data-browse-lab-models="${id}"]`).click();
  await expect(page.locator("#models-directory-panel")).toBeVisible();
  await expect(searchBox(page)).toHaveValue("");
  await expect(sortControl(page, "models")).toHaveValue("release");
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  await search(page, "reasoning");
  await expect(sortControl(page, "models")).toHaveValue("match");
  await search(page, "");
  await expect(sortControl(page, "models"), "clearing a later query returns to release").toHaveValue("release");
});

test("a restored query survives boot and Back", async ({ page }) => {
  await page.goto("/?collection=systems&q=memory");
  await expect(searchBox(page)).toHaveValue("memory");
  await page.locator("#project-grid .project-card").first().click();
  await expect(page).toHaveURL(/record=system%3A|record=system:/);
  await page.goBack();
  await expect(searchBox(page)).toHaveValue("memory");
  await expect(page).toHaveURL(/q=memory/);
});

test("typing repaints once the reader pauses", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.evaluate(() => {
    window.urlWrites = 0;
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args) => { window.urlWrites += 1; return replace(...args); };
  });
  await searchBox(page).pressSequentially("memory", { delay: 20 });
  await settled(page);
  await expect(page).toHaveURL(/q=memory/);
  expect(await page.evaluate(() => window.urlWrites)).toBeLessThanOrEqual(2);
});

// A keystroke that finds an index still loading must not chain one more
// repaint onto it, or a slow index repaints once per keystroke when it lands.
/* global searchIndexes */
test("an index that lands after typing repaints once, however many keystrokes it waited through", async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/app/search/systems.json*", async route => {
    await held;
    await route.continue();
  });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await searchBox(page).pressSequentially("memory", { delay: 20 });
  await settled(page);
  // The other indexes land and repaint first, so only the held one is counted.
  await page.waitForFunction(() => ["inference", "runtimes", "models", "packs", "robots", "labs", "specifications"].every(key => searchIndexes[key] !== undefined));
  await page.evaluate(() => {
    window.gridPaints = 0;
    new MutationObserver(records => { window.gridPaints += records.length; }).observe(document.querySelector("#project-grid"), { childList: true });
  });
  release();
  await page.waitForFunction(() => searchIndexes.systems !== undefined);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => window.gridPaints), "the held index repaints the grid once").toBe(1);
});

test("the results bar sticks under the strip above 1000 px and scrolls with the page on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=systems");
  await expect(page.locator("#results-bar")).toHaveCSS("position", "sticky");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#results-bar")).toHaveCSS("position", "static");
});

test("each collection's score rule sits in its scope note, and the headings are gone", async ({ page }) => {
  await page.goto("/?collection=models");
  await expect(page.locator('[data-scope-note="models"]')).toContainText("Imported source records have no Atlas score");
  await expect(page.locator("#models-kicker")).not.toBeEmpty();
  await expect(page.locator(".collection-panel .section-heading, .collection-panel .filter-guidance")).toHaveCount(0);
});

test("on a phone the unpressed family entries hide their counts but keep them in their names", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?collection=systems");
  const memory = familyEntry(page, "memory_system");
  await expect(memory.locator("strong")).toHaveCSS("position", "absolute");
  await expect(memory).toHaveAccessibleName(/Memory\s*\d+/);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems\s*\d+/);
});
