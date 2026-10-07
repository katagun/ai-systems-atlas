// Front-door Phase 3, the results page (docs/superpowers/specs/
// 2026-09-29-front-door-phase-3-results-page-design.md): the frame, one
// query, and the strip's match counts.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { collectionEntry, familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const { clearFilters, closeRecord, expectFilter, recordView, search, searchBox, setFilter, settled, sortControl } = require("./helpers/results");

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

// A lab's models, not only its name, must join for "Browse all in Models" to
// appear; Palmyra matches Writer's releases while Hangzhou now also matches
// robot-only labs with no model button. Everything lists the lab, so open Writer
// from the All grid rather than from an empty-state pointer into Labs.
test("Browse all in Models clears the search and lists the lab's releases newest first", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Palmyra");
  // The card's own details control, not the overflow control a capped card's
  // release list adds: both carry data-lab and both open this dialog.
  const lab = page.locator('#all-directory-grid .lab-card .card-open[data-lab="lab-writer"]');
  const id = "lab-writer";
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

test("the rail lists Systems' filters with Role first, and a count equals what choosing it lists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const rail = page.locator("#filter-rail");
  await expect(rail).toBeVisible();
  await expect(rail.locator(".filter-group legend").first()).toHaveText("Role");
  const option = rail.locator('[data-filter-group="role"] .filter-option').filter({ has: page.locator(".filter-count") }).nth(1);
  const count = Number(await option.locator(".filter-count").textContent());
  await option.locator("input").check();
  await expect(page.locator("#result-count")).toHaveText(new RegExp(`^${count} projects?\\b`));
  await expect(page).toHaveURL(/role=/);
});

test("a group's counts leave its own choice aside, and focus stays while the reader moves through it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  const group = page.locator('#filter-rail [data-filter-group="type"]');
  await group.locator("input").nth(1).check();
  await expect(group.locator(".filter-count").nth(1)).not.toHaveText("0");
  await group.locator("input").nth(1).focus();
  await page.keyboard.press("ArrowDown");
  await settled(page);
  expect(await page.evaluate(() => document.activeElement?.closest("[data-filter-group]")?.dataset.filterGroup)).toBe("type");
});

// "me" is a stop word, so the rail counts what browsing lists (ruling R-T2-4).
test("a query of stop words alone leaves the rail's counts at their browsing values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const counts = page.locator("#filter-rail .filter-count");
  await expect(counts.first()).not.toBeEmpty();
  const browsing = await counts.allTextContents();
  await search(page, "me");
  await expect(counts).toHaveText(browsing);
});

// The Finder's chip shares the row and stays hidden outside Systems, so the
// row's chips are the visible ones.
test("every active filter is a chip, and Clear filters clears them and the query", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=runtimes");
  await search(page, "server");
  const option = page.locator('#filter-rail [data-filter-group="type"] input').nth(1);
  await option.check();
  await settled(page);
  const chips = page.locator("#filter-chips .filter-chip:visible");
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText("Type: ");
  await chips.first().click();
  await settled(page);
  await expect(chips).toHaveCount(0);
  await option.check();
  await clearFilters(page, "runtimes");
  await expect(chips).toHaveCount(0);
  await expect(searchBox(page)).toHaveValue("");
});

test("on a phone the filters open as a sheet whose button counts the results", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference");
  await expect(page.locator("#filter-rail")).toBeHidden();
  await page.locator("#filters-button").click();
  const sheet = page.locator("#filter-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-filter-group="type"] input').nth(1).check();
  await settled(page);
  const shown = Number((await page.locator("#inference-result-count").textContent()).match(/^\d+/)[0]);
  await expect(page.locator("#filter-sheet-done")).toHaveText(`Show ${shown} ${shown === 1 ? "result" : "results"}`);
  await page.locator("#filter-sheet-done").click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#filters-button .filters-count")).toHaveText("1");
});

test("Agent packs count packs only and say so, with no Lab filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=packs");
  await expect(page.locator("#filter-rail .filter-note")).toHaveText("Counts are packs; installed systems follow the search only.");
  await expect(page.locator('#filter-rail [data-filter-group="lab"]')).toHaveCount(0);
});

test("the Lab filter narrows inference services to one lab's, and a reload keeps it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  const labs = page.locator('#filter-rail [data-filter-group="lab"] input:not([value=""])');
  const value = await labs.first().getAttribute("value");
  await setFilter(page, "inference", "lab", value);
  await expect(page).toHaveURL(new RegExp(`lab=${value}`));
  await page.reload();
  await expectFilter(page, "inference", "lab", value);
});

test("a group with one value in use hides until it has two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=robots");
  await expect(page.locator('#filter-rail [data-filter-group="formFactor"]')).toBeVisible();
  await expect(page.locator('#filter-rail [data-filter-group="status"]'), "every robot is active").toHaveCount(0);
});

// Choosing a role replaces the Finder's role set, so a role outside the set
// counts what choosing it lists, and can be chosen.
/* global state */
test("beside a Finder role set, a role outside it counts what choosing it lists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  for (const value of ["agent_system", "coding", "balanced"]) await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  const finderRoles = await page.evaluate(() => state.directoryRoles);
  const option = page.locator('#filter-rail [data-filter-group="role"] .filter-option')
    .filter({ has: page.locator(".filter-count") })
    .filter({ hasNot: page.locator(finderRoles.map(role => `input[value="${role}"]`).join(", ")) })
    .first();
  const count = Number(await option.locator(".filter-count").textContent());
  expect(count, "a role outside the set lists records once chosen").toBeGreaterThan(0);
  await option.locator("input").check();
  await expect(page.locator("#result-count")).toHaveText(new RegExp(`^${count} projects?\\b`));
  await expect(page.locator("#finder-roles-chip")).toBeHidden();
});

test("Clear filters clears a Lab chosen in Systems", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const value = await page.locator('#filter-rail [data-filter-group="lab"] input:not([value=""])').first().getAttribute("value");
  await setFilter(page, "systems", "lab", value);
  await expect(page).toHaveURL(new RegExp(`lab=${value}`));
  await clearFilters(page);
  await expectFilter(page, "systems", "lab", "");
  await expect(page).not.toHaveURL(/lab=/);
});

test("the Finder's handoff clears a Lab left set in its collection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  const value = await page.locator('#filter-rail [data-filter-group="lab"] input:not([value=""])').first().getAttribute("value");
  await setFilter(page, "inference", "lab", value);
  await page.getByRole("button", { name: "Find your fit", exact: true }).click();
  for (const choice of ["inference_service", "route_models", "balanced"]) await page.locator(`[data-finder-choice][data-finder-value="${choice}"]`).click();
  await page.locator("[data-finder-directory]").click();
  await expectFilter(page, "inference", "type", "routing_aggregator");
  await expectFilter(page, "inference", "lab", "");
});

test("the front door hides the rail and the chips a collection left set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await openCollection(page, "inference");
  await page.locator('#filter-rail [data-filter-group="delivery"] input').nth(1).check();
  await expect(page.locator("#filter-chips")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page.locator("#filter-rail")).toBeHidden();
  await expect(page.locator("#filter-chips")).toBeHidden();
});

test("All has no filters, so it offers no Filters button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=all");
  await expect(page.locator("#all-directory-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#filters-button")).toBeHidden();
  await openCollection(page, "inference");
  await expect(page.locator("#filters-button")).toBeVisible();
});

// A chip takes itself off the row, so focus would fall to the page.
test("removing a chip by keyboard moves focus to the result count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await page.locator('#filter-rail [data-filter-group="type"] input').nth(1).check();
  const chip = page.locator("#filter-chips .filter-chip:visible").first();
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#filter-chips .filter-chip:visible")).toHaveCount(0);
  await expect(page.locator("#inference-result-count")).toBeFocused();
});

// A search index landing repaints the results; the chips it did not change
// stay the same elements, so a reader's focus on one survives.
/* global RESULT_VIEWS */
test("a focused chip keeps its focus while the results repaint", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await page.locator('#filter-rail [data-filter-group="type"] input').nth(1).check();
  const chip = page.locator("#filter-chips .filter-chip:visible").first();
  await chip.focus();
  await page.evaluate(() => RESULT_VIEWS[state.directoryCollection].render());
  await expect(chip).toBeFocused();
});

// While a comparison is in progress the tray sits over the bottom of the
// viewport, and at 1440 px it reaches over the rail's right edge, where the
// counts are. The rail ends above it (ruling R-T3-5), even at the page's
// top, where the rail sits lowest, so the last value, scrolled to, takes a
// click there. The spot is tested for what it hits first: Playwright's own
// click would scroll the rail on a retry.
test("the rail's last value takes a click while the comparison tray shows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-grid .compare-toggle").nth(0).click();
  await page.locator("#runtime-grid .compare-toggle").nth(1).click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  // The second toggle sits under the tray the first one opened, so the click
  // may have scrolled the page; the rail sits lowest at the page's top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const rail = page.locator("#filter-rail");
  await expect.poll(() => page.evaluate(() => document.querySelector("#filter-rail").getBoundingClientRect().bottom
    - document.querySelector("#comparison-tray").getBoundingClientRect().top), { message: "the rail ends above the tray" }).toBeLessThanOrEqual(0);
  await rail.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  const last = rail.locator(".filter-option").last();
  const spot = await last.evaluate(element => new Promise(resolve => requestAnimationFrame(() => {
    const box = element.getBoundingClientRect();
    const x = box.right - 6;
    const y = box.top + box.height / 2;
    resolve({ x, y, reached: element.contains(document.elementFromPoint(x, y)) });
  })));
  expect(spot.reached, `the rail's last value at ${Math.round(spot.x)},${Math.round(spot.y)} is not under the tray`).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await expect(last.locator("input")).toBeChecked();
});

// Every result count takes focus (ruling R-T3-6), so a chip or Clear
// filters, which take themselves off the row, hand it there in every
// collection, not only in the three the Finder's handoff lands in.
test("in Models a removed chip and Clear filters hand focus to the result count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=models");
  const count = page.locator("#model-result-count");
  const type = page.locator('#filter-rail [data-filter-group="type"] input').nth(1);
  await type.check();
  await page.locator("#filter-chips .filter-chip:visible").first().click();
  await expect(count).toBeFocused();
  await type.check();
  await clearFilters(page);
  await expect(count).toBeFocused();
});
