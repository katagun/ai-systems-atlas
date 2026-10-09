// Front-door Phase 3, the results page (docs/superpowers/specs/
// 2026-09-29-front-door-phase-3-results-page-design.md): the frame, one
// query, and the strip's match counts.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { collectionEntry, familyEntry, openCollection, openFamily, pressedEntry, searchAll } = require("./helpers/landing");
const { chooseFinderGoal, finderHandoff } = require("./helpers/finder");
const { clearControl, clearFilters, closeRecord, expectFilter, filterControl, recordView, search, searchBox, setFilter, settled, sortControl } = require("./helpers/results");

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
    await expect(page.locator(`.collection-panel [data-scope-note="${id}"]`), id).toContainText(rule);
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
  await expect(clearControl(page), "a query that searches nothing has nothing to clear").toBeHidden();
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
  const option = page.locator('#filter-rail [data-filter-group="lab"] .filter-option').filter({ has: page.locator('input:not([value=""])') }).first();
  const value = await option.locator("input").getAttribute("value");
  const count = Number(await option.locator(".filter-count").textContent());
  const total = Number((await page.locator("#inference-result-count").textContent()).match(/^\d+/)[0]);
  expect(count, "one lab's services are fewer than all of them").toBeLessThan(total);
  await setFilter(page, "inference", "lab", value);
  await expect(page).toHaveURL(new RegExp(`lab=${value}`));
  await expect(page.locator("#inference-result-count")).toHaveText(new RegExp(`^${count} services?\\b`));
  const names = await page.evaluate(id => state.labs.find(lab => lab.id === id).catalog_names, value);
  for (const operator of await page.locator("#inference-grid .project-card .repo").allTextContents()) expect(names, "every listed service is the lab's").toContain(operator.trim());
  await page.reload();
  await expectFilter(page, "inference", "lab", value);
});

// The rule is read from the page's own records, so the day a robot that is
// not active is published, Status shows and this still holds (review M2).
test("a group with one value in use hides until it has two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=robots");
  await expect(page.locator("#robot-grid .project-card").first()).toBeVisible();
  const inUse = await page.evaluate(() => ({
    formFactor: new Set(state.robots.map(robot => robot.form_factor)).size,
    status: new Set(state.robots.map(robot => robot.status)).size,
  }));
  for (const [key, values] of Object.entries(inUse)) {
    await expect(page.locator(`#filter-rail [data-filter-group="${key}"]`), `${key}: ${values} in use`).toHaveCount(values >= 2 ? 1 : 0);
  }
});

// Choosing a role replaces the Finder's role set, so a role outside the set
// counts what choosing it lists, and can be chosen.
/* global state */
test("beside a Finder role set, a role outside it counts what choosing it lists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=finder");
  await finderHandoff(page, "coding");
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
  await chooseFinderGoal(page, "route_models");
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

// Overlays fixed to the bottom of the viewport cover the rail's last values
// unless the rail ends above them (ruling R-T3-5): the closed legend's Key
// chip sits at the left, over the radios, and the comparison tray, centred,
// reaches over the rail's right edge at 1440 px, where the counts are. At
// the page's top the rail sits lowest, so it is scrolled to its end there,
// and its last value must take a real click where the overlay would be. The
// spot is tested for what it hits first: Playwright's own click would
// scroll the rail on a retry.
async function expectRailEndsAbove(page, overlay, side) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const rail = page.locator("#filter-rail");
  await expect.poll(() => page.evaluate(selector => document.querySelector("#filter-rail").getBoundingClientRect().bottom
    - document.querySelector(selector).getBoundingClientRect().top, overlay), { message: `the rail ends above ${overlay}` }).toBeLessThanOrEqual(0);
  await rail.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  const last = rail.locator(".filter-option").last();
  const spot = await last.evaluate((element, side) => new Promise(resolve => requestAnimationFrame(() => {
    const box = element.getBoundingClientRect();
    const x = side === "right" ? box.right - 6 : box.left + 8;
    const y = box.top + box.height / 2;
    resolve({ x, y, reached: element.contains(document.elementFromPoint(x, y)) });
  })), side);
  expect(spot.reached, `the rail's last value at ${Math.round(spot.x)},${Math.round(spot.y)} is clear of ${overlay}`).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await expect(last.locator("input")).toBeChecked();
}

test("the rail's last value takes a click beside the Key chip and the comparison tray", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=runtimes");
  await expect(page.locator("#runtime-grid .project-card").first()).toBeVisible();
  // Closed, the legend leaves its Key chip at the bottom left.
  await page.locator("#badge-legend-close").click();
  await expect(page.locator("#badge-legend-chip")).toBeVisible();
  await expectRailEndsAbove(page, "#badge-legend-chip", "left");
  await clearFilters(page);
  // A comparison opens the tray, which the Key chip steps aside for. The
  // second toggle can sit under the tray the first one opened, so the click
  // may scroll the page; the helper measures from the page's top again.
  await page.locator("#runtime-grid .compare-toggle").nth(0).click();
  await page.locator("#runtime-grid .compare-toggle").nth(1).click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  await expectRailEndsAbove(page, "#comparison-tray", "right");
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

// The sheet's groups scroll inside it and "Show N results" stays at its
// foot (review I3), so the reader sees the count change as they choose.
test("on a phone the sheet keeps Show N results in view while the reader chooses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=systems");
  await page.locator("#filters-button").click();
  const done = page.locator("#filter-sheet-done");
  await expect(done).toBeInViewport({ ratio: 1 });
  const before = await done.textContent();
  await page.locator('#filter-sheet [data-filter-group="role"] input').nth(1).check();
  await expect(done).not.toHaveText(before);
  await expect(done).toBeInViewport({ ratio: 1 });
});

// The result counts' own live regions sit outside the modal sheet, where a
// screen reader cannot hear them, so the sheet says the new count itself
// (review M8).
test("the phone sheet tells a screen reader the new count as the reader chooses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference");
  await page.locator("#filters-button").click();
  const status = page.locator("#filter-sheet").getByRole("status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await page.locator('#filter-sheet [data-filter-group="type"] input').nth(1).check();
  await settled(page);
  const shown = Number((await page.locator("#inference-result-count").textContent()).match(/^\d+/)[0]);
  await expect(status).toHaveText(`${shown} ${shown === 1 ? "result" : "results"}`);
});

// A query alone adds no row: "Clear search" ends the collection's result
// row, where each collection's Clear sat before, and the chips row stays
// shut until it holds a chip (ruling R-T3-8), so results do not jump.
test("a query alone adds no row, and Clear search ends the result row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  const row = page.locator("#systems-directory-panel .result-row");
  const top = () => row.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await search(page, "memory");
  expect(await top(), "the result row has not moved").toBe(before);
  await expect(clearControl(page)).toHaveText("Clear search");
  await expect(row.getByRole("button", { name: "Clear search" })).toBeVisible();
  await expect(page.locator("#filter-chips")).toBeHidden();
});

test("a chip takes Clear into the chips row as Clear filters, and it returns when the chip goes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  await search(page, "memory");
  const row = page.locator("#systems-directory-panel .result-row");
  const chips = page.locator("#filter-chips");
  await expect(row.getByRole("button", { name: "Clear search" })).toBeVisible();
  await page.locator('#filter-rail [data-filter-group="role"] input:not([value=""]):not([disabled])').first().check();
  await expect(chips.getByRole("button", { name: "Clear filters" })).toBeVisible();
  await expect(row.getByRole("button", { name: /^Clear/ })).toHaveCount(0);
  await chips.locator(".filter-chip:visible").first().click();
  await expect(row.getByRole("button", { name: "Clear search" })).toBeVisible();
  await expect(chips).toBeHidden();
});

// Clear resets Systems' family as well (applyDirectoryDefaults), so beside a
// chosen family it never reads as if it cleared the query alone.
test("in Systems a chosen family keeps the result row's Clear reading Clear filters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems&family=memory_system");
  await search(page, "memory");
  await expect(page.locator("#systems-directory-panel .result-row").getByRole("button", { name: "Clear filters" })).toBeVisible();
  await clearFilters(page);
  await expectFilter(page, "systems", "family", "");
  await expect(searchBox(page)).toHaveValue("");
});

// The rail sits before the results, one tab stop per group, so its first
// stop skips it (review I5): a button, which leaves the URL alone, that hands
// focus to the result count, after which Tab moves on into the results. It
// is the first stop after the results bar, whose search, Sort, and Cards |
// List (#471) come first. In
// Systems the scope note's own button comes before the grid; Specifications'
// note has none, so there the next stop is in the grid.
test("a keyboard reader can skip the rail to the results", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [collection, count, next] of [
    ["systems", "#result-count", '[data-scope-note="systems"]'],
    ["specifications", "#specification-result-count", "#specification-grid"],
  ]) {
    await page.goto(`/?collection=${collection}`);
    await expect(page.locator("#filter-rail .filter-group").first()).toBeVisible();
    await searchBox(page).focus();
    const before = [];
    let reached = false;
    for (let press = 0; press < 8 && !reached; press += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => ({ skip: document.activeElement?.textContent === "Skip to results", inBar: Boolean(document.activeElement?.closest("#results-bar")), name: document.activeElement?.textContent.trim() || document.activeElement?.id }));
      reached = stop.skip;
      if (!reached) before.push(stop);
    }
    expect(reached, `${collection}: Tab reaches Skip to results`).toBe(true);
    expect(before.filter(stop => !stop.inBar).map(stop => stop.name), `${collection}: only the results bar comes before it`).toEqual([]);
    await expect(page.locator("#filter-rail").getByRole("button", { name: "Skip to results" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(count)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`collection=${collection}$`));
    await page.keyboard.press("Tab");
    expect(await page.evaluate(selector => Boolean(document.activeElement?.closest(selector)), next), `${collection}: the next Tab lands past the rail`).toBe(true);
  }
});

// Each innerHTML write to the rail's groups is one mutation record, so this
// counts builds: one per collection switch and one per family change, never
// a second straight after (review M3).
test("the rail is built once per collection switch and once per family change", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await expect(page.locator('#filter-rail [data-filter-group="type"]')).toBeVisible();
  const builds = async action => {
    await page.evaluate(() => {
      window.railBuilds = 0;
      window.railWatch?.disconnect();
      window.railWatch = new MutationObserver(records => { window.railBuilds += records.length; });
      window.railWatch.observe(document.querySelector("#filter-rail .filter-groups"), { childList: true });
    });
    await action();
    await settled(page);
    return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(window.railBuilds))));
  };
  expect(await builds(() => openCollection(page, "systems")), "a collection switch").toBe(1);
  expect(await builds(() => openFamily(page, "agent_system")), "a family change").toBe(1);
});

// A collection whose every group has one value in use offers no choice, so
// it gets neither an empty rail column nor an empty sheet (review M6).
test("a collection with no group of two values gets no rail and no Filters button", async ({ page }) => {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "app", "robots.json"), "utf8"));
  const [first] = payload.robots;
  const alike = payload.robots.map(robot => ({ ...robot, form_factor: first.form_factor, ai_basis: [first.ai_basis[0]], availability: first.availability, status: first.status }));
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { ...payload, robots: alike } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=robots");
  await expect(page.locator("#robot-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#filter-rail")).toHaveAttribute("hidden", "");
  await expect(page.locator("#results-frame")).not.toHaveClass(/\bhas-rail\b/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#filters-button")).toBeHidden();
});

// A group of more than eight values shows eight and "Show all N", which
// reveals the rest and moves focus to the first value it revealed, so a
// keyboard reader need not arrow past the eight already read (review M9).
test("Show all N appears after eight values and focuses the first value it reveals", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const values = page.locator('#filter-rail [data-filter-group="license"] input:not([value=""])');
  await expect(values).toHaveCount(8);
  const total = await filterControl(page, "systems", "license").locator('option:not([value=""])').count();
  expect(total).toBeGreaterThan(8);
  const shown = await values.evaluateAll(inputs => inputs.map(input => input.value));
  await page.locator('#filter-rail [data-filter-group="license"]').getByRole("button", { name: `Show all ${total}` }).click();
  await expect(values).toHaveCount(total);
  const focused = await page.evaluate(() => ({ value: document.activeElement?.value, group: document.activeElement?.closest("[data-filter-group]")?.dataset.filterGroup }));
  expect(focused.group).toBe("license");
  expect(focused.value, "focus is on a value, not Any").not.toBe("");
  expect(shown, "and on one the group did not show before").not.toContain(focused.value);
});

// Pack facets narrow packs alone (ADR 035), so the rail counts packs, not the
// installed systems the grid lists beside them, though many share a licence.
test("Agent packs' rail counts packs only, not the installed systems beside them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=packs");
  const more = page.locator('#filter-rail [data-filter-group="license"]').getByRole("button", { name: /^Show all \d+$/ });
  if (await more.isVisible()) await more.click();
  const options = page.locator('#filter-rail [data-filter-group="license"] .filter-option').filter({ has: page.locator('input:not([value=""])') });
  const shown = await options.evaluateAll(labels => labels.map(label => [label.querySelector("input").value, Number(label.querySelector(".filter-count").textContent)]));
  const expected = await page.evaluate(values => values.map(value => ({
    packs: state.packs.filter(pack => (pack.licenses || []).includes(value)).length,
    systems: state.projects.filter(project => (project.deployment || []).includes("host_pack") && (project.licenses || []).includes(value)).length,
  })), shown.map(([value]) => value));
  expect(shown.map(([, count]) => count)).toEqual(expected.map(item => item.packs));
  expect(expected.some(item => item.systems > 0), "an installed system shares a pack licence, so counting them would show").toBe(true);
  const [value, count] = shown[0];
  await setFilter(page, "packs", "license", value);
  await expect(page.locator("#pack-result-count")).toHaveText(new RegExp(`^${count} packs? · `));
});

// The Lab group lists its labs A–Z, never by size (ADR 041).
test("the Lab group lists its labs A–Z", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  const group = page.locator('#filter-rail [data-filter-group="lab"]');
  await group.getByRole("button", { name: /^Show all \d+$/ }).click();
  const names = await group.locator('.filter-option:has(input:not([value=""])) > span:not(.filter-count)').allTextContents();
  expect(names.length).toBeGreaterThan(8);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

// A value that lists nothing beside the other choices shows 0 and cannot be
// chosen (Phase 3 spec, section 3).
test("a value that lists nothing shows 0 and cannot be chosen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=inference");
  await page.locator('#filter-rail [data-filter-group="type"] input').nth(1).check();
  const empty = page.locator("#filter-rail .filter-option").filter({ has: page.locator(".filter-count", { hasText: /^0$/ }) });
  await expect(empty.first()).toBeVisible();
  for (const option of await empty.all()) await expect(option.locator("input")).toBeDisabled();
});

test("Escape closes the phone sheet and returns focus to the Filters button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=inference");
  await page.locator("#filters-button").click();
  await expect(page.locator("#filter-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-sheet")).toBeHidden();
  await expect(page.locator("#filters-button")).toBeFocused();
});

// A focused control's ring, 2 px drawn 3 px out, must fit inside the
// scroller that holds it, or the scroller clips the stroke where its edge
// meets the control (review N1). The walk starts at the control that holds
// focus, if the scroller holds it, and tabs through every control after it,
// so the scroll each Tab causes is checked as well as the first value.
async function walkRings(page, scroller) {
  const rings = [];
  for (let press = 0; press <= 60; press += 1) {
    if (press) await page.keyboard.press("Tab");
    const ring = await page.evaluate(selector => {
      const element = document.activeElement;
      const port = document.querySelector(selector);
      if (element === port || !port.contains(element)) return null;
      const style = getComputedStyle(element);
      const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
      const box = element.getBoundingClientRect();
      const outer = port.getBoundingClientRect();
      const left = outer.left + port.clientLeft;
      const top = outer.top + port.clientTop;
      return {
        name: element.matches("input") ? `${element.closest("[data-filter-group]").dataset.filterGroup}=${element.value}` : element.textContent.trim(),
        drawn: element.matches(":focus-visible") && style.outlineStyle !== "none" && grow > 0,
        cut: Math.max(left - (box.left - grow), top - (box.top - grow), box.right + grow - (left + port.clientWidth), box.bottom + grow - (top + port.clientHeight)),
      };
    }, scroller);
    if (ring) rings.push(ring);
    else if (rings.length) break;
  }
  return rings;
}

function expectWholeRings(rings, where) {
  expect(rings.length, `${where}: the walk crosses every group`).toBeGreaterThan(10);
  for (const ring of rings) {
    expect(ring.drawn, `${where}, ${ring.name}: its ring is drawn`).toBe(true);
    expect(ring.cut, `${where}, ${ring.name}: the scroller clips its ring by`).toBeLessThanOrEqual(0);
  }
}

test("a focused control's whole ring shows in the rail, which still lines up with the bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=systems");
  await expect(page.locator("#filter-rail .filter-group").first()).toBeVisible();
  const [bar, value] = await page.evaluate(() => ["#results-search", "#filter-rail .filter-option input"].map(selector => document.querySelector(selector).getBoundingClientRect().left));
  expect(value, "the rail's values start where the search box does").toBeCloseTo(bar, 0);
  await searchBox(page).focus();
  const rings = await walkRings(page, "#filter-rail");
  expect(rings[0].name, "the walk starts at the skip button").toBe("Skip to results");
  expect(rings[1].name, "and goes on to the first value").toBe("role=");
  expectWholeRings(rings, "rail");
});

// On a 667 px phone Tab scrolls the sheet's groups to controls near their
// edges, so the walk there checks the groups' scroll-padding too.
test("a focused control's whole ring shows in the phone sheet, on a short phone too", async ({ page }) => {
  for (const height of [844, 667]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/?collection=systems");
    await page.locator("#filters-button").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#filter-sheet")).toBeVisible();
    const [title, value] = await page.evaluate(() => ["#filter-sheet-title", "#filter-sheet .filter-option input"].map(selector => document.querySelector(selector).getBoundingClientRect().left));
    expect(value, `${height}px: the sheet's values start where its title does`).toBeCloseTo(title, 0);
    // The groups can hold focus themselves, as any scroller can, so their
    // own ring, 5 px out, must clear the title above them and the button
    // below them.
    const room = await page.evaluate(() => {
      const groups = document.querySelector("#filter-sheet .filter-groups").getBoundingClientRect();
      return {
        above: groups.top - document.querySelector("#filter-sheet-title").getBoundingClientRect().bottom,
        below: document.querySelector("#filter-sheet-done").getBoundingClientRect().top - groups.bottom,
      };
    });
    expect(room.below, `${height}px: the groups' own ring clears the button`).toBeGreaterThanOrEqual(5);
    expect(room.above, `${height}px: and the title`).toBeGreaterThanOrEqual(5);
    const rings = await walkRings(page, "#filter-sheet .filter-groups");
    expect(rings[0].name, `${height}px: the walk starts at the first value`).toBe("role=");
    expectWholeRings(rings, `${height}px sheet`);
  }
});

// The sheet's status speaks only when the count changes. "Show all" shows
// more values but changes no filter, so it says nothing (review N2).
test("in the phone sheet Show all says nothing, and a choice says the new count", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=systems");
  await page.locator("#filters-button").click();
  const sheet = page.locator("#filter-sheet");
  const status = sheet.getByRole("status");
  const role = sheet.locator('[data-filter-group="role"]');
  const values = role.locator("input");
  const shown = await values.count();
  await role.getByRole("button", { name: /^Show all \d+$/ }).click();
  await expect(values).not.toHaveCount(shown);
  expect(await status.textContent(), "Show all changes no count, so the status says nothing").toBe("");
  await role.locator('input:not([value=""]):not([disabled])').first().check();
  await settled(page);
  const count = Number((await page.locator("#result-count").textContent()).match(/^\d+/)[0]);
  await expect(status).toHaveText(`${count} ${count === 1 ? "result" : "results"}`);
});

// At 390 px "Clear search" keeps to one line beside the count, which wraps
// instead, so the result row stays one count and one control (review N3).
test("on a phone Clear search stays one line beside the count in All and Models", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [collection, count] of [["all", "#all-directory-result-count"], ["models", "#model-result-count"]]) {
    await page.goto(`/?collection=${collection}`);
    await search(page, "memory");
    const clear = clearControl(page);
    await expect(clear).toHaveText("Clear search");
    const lines = await clear.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(lines, `${collection}: Clear search is one line`).toBe(1);
    const [counted, control] = [await page.locator(count).boundingBox(), await clear.boundingBox()];
    expect(control.x, `${collection}: Clear sits beside the count`).toBeGreaterThanOrEqual(counted.x + counted.width);
  }
});

// Models' Lab group lists only the labs that join a model (ruling R-T3-7), so
// at the defaults no lab counts 0, and a robot maker that joins no model is
// not offered (review N4).
test("Models' Lab group offers only labs that join a model", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?collection=models");
  const group = page.locator('#filter-rail [data-filter-group="lab"]');
  await group.getByRole("button", { name: /^Show all \d+$/ }).click();
  const counts = await group.locator('.filter-option:has(input:not([value=""])) .filter-count').allTextContents();
  expect(counts.length).toBeGreaterThan(8);
  expect(counts.filter(count => Number(count) === 0), "no lab counts 0").toEqual([]);
  expect(await page.evaluate(() => state.labs.some(lab => lab.name === "Unitree Robotics")), "Unitree Robotics is a lab").toBe(true);
  await expect(group.locator(".filter-option").filter({ hasText: /^Unitree Robotics/ })).toHaveCount(0);
});

// Opened from the keyboard, the sheet puts focus on the first group's chosen
// value, the one a reader changes first, as it did before its groups became
// a scroller. Otherwise the dialog focuses the container they scroll in,
// which a screen reader cannot name (ruling R-T3-10).
test("opened from the keyboard, the phone sheet focuses the first group's chosen value", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=systems");
  await page.locator("#filters-button").focus();
  await page.keyboard.press("Enter");
  const sheet = page.locator("#filter-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".filter-groups"), "not the container the groups scroll in").not.toBeFocused();
  const first = sheet.locator("[data-filter-group]").first();
  const chosen = first.locator("input:checked");
  await expect(chosen).toBeFocused();
  const value = (await first.locator(".filter-option:has(input:checked) > span").first().textContent()).trim();
  await expect(chosen).toHaveAccessibleName(value);
});

// Cards | List is one setting for the whole results page (ADR 054), not a
// filter, so Clear leaves it as the reader chose it (ruling R-T3-12). Models
// clears through its own controls, Systems through its defaults.
test("Clear keeps the reader's list layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const url of ["/?collection=models&layout=list&q=claude&sort=release", "/?collection=systems&layout=list&q=memory"]) {
    await page.goto(url);
    await expect(page.locator(".collection-panel .project-grid.is-list")).toBeVisible();
    await clearFilters(page);
    await expect(searchBox(page)).toHaveValue("");
    await expect(page.locator("#layout-filter"), url).toHaveValue("list");
    await expect(page.locator('[data-set-layout="list"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".collection-panel .project-grid.is-list")).toBeVisible();
    await expect(page).toHaveURL(/layout=list/);
  }
});
