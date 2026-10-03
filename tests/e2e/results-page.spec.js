// Front-door Phase 3, the results page (docs/superpowers/specs/
// 2026-09-29-front-door-phase-3-results-page-design.md): the frame, one
// query, and the strip's match counts.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { collectionEntry, familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const { closeRecord, recordView, search, searchBox, settled, sortControl } = require("./helpers/results");

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

// Everything holds every collection, so a term only Labs answers is listed by the
// scope the search landed in. The empty-state pointer into another collection is for
// the opposite case: a scope whose own filters hide the match, which the sibling test
// below covers. Before this, the All grid omitted Labs, so this case was an empty
// result plus a pointer, and a lab was findable by search but not browsable.
test("a term only Labs answers is listed in Everything rather than pointed at", async ({ page }) => {
  await onlyInIndex(page, "labs");
  await page.goto("/");
  await searchAll(page, INDEX_WORD);
  await expect(page.locator('#all-directory-grid [data-empty-open-collection="labs"]')).toHaveCount(0);
  const labCard = page.locator("#all-directory-grid .lab-card");
  await expect(labCard).toHaveCount(1);
  await labCard.getByRole("button", { name: /^View details for / }).click();
  await expect(recordView(page, "lab")).toBeVisible();
  await closeRecord(page, "lab");
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
// lists nothing unless it clears the search its label promises to widen. Everything
// lists the lab now that it holds Labs, so the lab is opened from the All grid rather
// than from the empty state's pointer into the Labs scope, which this query no longer
// produces.
test("Browse all in Models clears the search and lists the lab's releases newest first", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "hangzhou");
  // A lab with no reviewed release offers no "Browse all in Models" control at
  // all, so this picks a matching lab that has releases rather than the first
  // match: "hangzhou" also reaches a maker whose engineering is in Almaty or
  // whose headquarters is Hangzhou, and neither has a release to browse. Use the
  // card's own details control, not the overflow control a capped card's release
  // list adds: both carry data-lab and both open this dialog.
  const lab = page.locator('#all-directory-grid .lab-card:has(.lab-related-label:text-matches("Reviewed releases")) .card-open').first();
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

// Back to an entry with no query ends the query in every collection, so a
// sort chosen during it elsewhere gives way to Best match at the next query.
test("Back to a URL without a query ends it in every collection's sort", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-grid .project-card").first().click();
  await expect(recordView(page, "system")).toBeVisible();
  await closeRecord(page, "system");
  await search(page, "router");
  await openCollection(page, "inference");
  await sortControl(page, "inference").selectOption("name");
  await page.goBack();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems\b/);
  await expect(searchBox(page)).toHaveValue("");
  await search(page, "api");
  await openCollection(page, "inference");
  await expect(sortControl(page, "inference"), "a new query selects Best match").toHaveValue("match");
});

// The strip updates in place, dots included, so a click that lands on a
// dot during a repaint still reaches it.
test("a state dot survives the strip's repaints while it still applies", async ({ page }) => {
  await page.goto("/?collection=systems&family=agent_system&role=coding_agent");
  await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
  const dot = await page.locator('#scope-strip [data-open-collection="systems"] .state-dot').elementHandle();
  await search(page, "agent");
  expect(await dot.evaluate(element => element.isConnected), "the same dot is still in the strip").toBe(true);
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

// The bar sticks at the strip's measured height, which the webfonts can
// change after boot has measured it. Scrolling is smooth, so this measures
// once it has come to rest.
test("above 1000 px the results bar sits flush under the strip once the fonts have loaded", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
  const [stripBottom, barTop] = await page.evaluate(async () => {
    await new Promise(resolve => {
      let last = window.scrollY, still = 0;
      const frame = () => requestAnimationFrame(() => { still = window.scrollY === last ? still + 1 : 0; last = window.scrollY; if (still >= 5) resolve(); else frame(); });
      frame();
    });
    return [document.querySelector("#scope-strip").getBoundingClientRect().bottom, document.querySelector("#results-bar").getBoundingClientRect().top];
  });
  expect(Math.abs(barTop - stripBottom), `bar top ${barTop}, strip bottom ${stripBottom}`).toBeLessThan(0.5);
});

test("results drop the top padding the front door's headline needs, on phones too", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#front-door")).toBeVisible();
    const door = await page.locator("#directory").evaluate(element => parseFloat(getComputedStyle(element).paddingTop));
    await page.goto("/?collection=systems");
    await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
    const results = await page.locator("#directory").evaluate(element => parseFloat(getComputedStyle(element).paddingTop));
    expect(results, `${width}: results ${results}px, front door ${door}px`).toBeLessThan(door);
  }
});

test("each collection's score rule sits in its scope note under its result count, and the headings are gone", async ({ page }) => {
  await page.goto("/?collection=models");
  for (const [id, rule] of [
    ["all", "Scores stay hidden here"],
    ["systems", "Choose one family to compare editorial scores"],
    ["inference", "Scores compare stable service operations across types"],
    ["runtimes", "Scores compare documented execution capability"],
    ["packs", "never scored, and never compared"],
    ["robots", "nothing here is scored or compared"],
    ["models", "Imported source records have no Atlas score"],
    ["labs", "each release keeps its own licence and score in Models"],
    ["specifications", "with no cross-purpose score"],
  ]) {
    await expect(page.locator(`#${id}-directory-panel > .result-row + [data-scope-note="${id}"]`), id).toContainText(rule);
  }
  await expect(page.locator('[data-scope-note="models"] #models-kicker, [data-scope-note="labs"] #labs-kicker, [data-scope-note="specifications"] #specifications-kicker')).toHaveCount(3);
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
