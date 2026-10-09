const { test, expect } = require("@playwright/test");
const { allSearch, categoryEntry, collectionDot, collectionEntry, entryCount, familyEntry, openCollection, openView, pressedEntry, searchAll } = require("./helpers/landing");
const { finderHandoff } = require("./helpers/finder");
const counts = require("./helpers/catalog-counts");
const { closeRecord, expectFilter, recordView, search, searchBox, setFilter, sortControl } = require("./helpers/results");

test("a bare URL opens the Elements front door with search and the role map above the fold", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#front-door")).toBeVisible();
    await expect(page.locator("#directory-title")).toHaveText(`${counts.allDirectoryEntries.toLocaleString("en-US")} elements of AI`);
    await expect(page.locator(".collection-panel:not([hidden])")).toHaveCount(0);
    await expect(page).not.toHaveURL(/collection=/);
    const index = page.locator("#elements");
    const top = await index.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
    expect(top, `${width}: the role map starts above the fold`).toBeLessThan(height);
    await expect(page.locator("[data-tile]")).toHaveCount(9);
    await expect(page.locator(".atlas-map")).toHaveCount(0);
  }
});

// The headline carries the count, so the line above it names the kinds and no
// number: the reader used to see "878 systems, …" and then "878 elements of AI".
// Until the boot payloads land the headline has no count to show, and reads
// "The elements of AI" rather than " elements of AI".
test("the headline reads The elements of AI until its count arrives, and the kicker above it never holds a number", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/app\/systems\.json/, async route => {
    await held;
    await route.continue();
  });
  await page.goto("/");
  const kicker = page.locator("#hero-kicker");
  await expect(page.locator("#directory-title")).toHaveText("The elements of AI");
  await expect(kicker).toBeVisible();
  // Everything lists labs and specifications as well (#404), so the line names them.
  await expect(kicker).toContainText("labs");
  await expect(kicker).toContainText("specifications");
  await expect(kicker).not.toContainText(/\d/);

  release();
  await expect(page.locator("#directory-title")).toHaveText(`${counts.allDirectoryEntries.toLocaleString("en-US")} elements of AI`);
  await expect(kicker).toContainText("labs");
  await expect(kicker).not.toContainText(/\d/);
});

test("every tile counts what its collection lists, with the Models and packs splits", async ({ page }) => {
  await page.goto("/");
  const expected = {
    all: counts.allDirectoryEntries,
    systems: counts.projectsWithStatus("active"),
    models: counts.models,
    inference: counts.inferenceServices,
    runtimes: counts.localRuntimes,
    packs: counts.packs + counts.hostPackSystems,
    robots: counts.robots,
    labs: counts.labs,
    specifications: counts.specifications,
  };
  for (const [id, count] of Object.entries(expected)) {
    await expect(page.locator(`[data-tile="${id}"] .tile-count strong`), id).toHaveText(String(count));
  }
  await expect(page.locator('[data-tile="models"] .tile-count small')).toHaveText(`${counts.reviewedModels} reviewed · ${counts.models - counts.reviewedModels} imported`);
  await expect(page.locator('[data-tile="packs"] .tile-count small')).toHaveText(`${counts.packs} packs · ${counts.hostPackSystems} host-installed`);
});

test("a tile opens its collection in results and Back returns to the front door", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "inference");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(page).toHaveURL(/collection=inference/);
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/collection=/);
  await page.goForward();
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Inference services \d/);
});

test("the Everything tile is the A–Z list, and the Models, Labs, and Specifications tiles open their collections", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "all");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=all/);
  for (const id of ["models", "labs", "specifications"]) {
    await page.goto("/");
    await openCollection(page, id);
    await expect(page.locator(`#${id}-directory-panel`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`collection=${id}`));
  }
});

// Everything lists labs and specifications as well as the six kinds the box used
// to name (#404), so its hint names all eight, as the markup's own hint does.
test("the Everything search box names every kind it searches", async ({ page }) => {
  const hint = "Search systems, models, services, runtimes, packs, robots, labs, and specifications";
  await page.goto("/");
  await openCollection(page, "all");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(searchBox(page)).toHaveAttribute("placeholder", hint);
  await page.goto("/?collection=all");
  await expect(searchBox(page)).toHaveAttribute("placeholder", hint);
});

test("a category link opens the scope narrowed to it", async ({ page }) => {
  await page.goto("/");
  await familyEntry(page, "memory_system").click();
  await expectFilter(page, "systems", "family", "memory_system");
  await expect(page).toHaveURL(/family=memory_system/);
  await page.goto("/");
  await categoryEntry(page, "inference", "direct_model_api").click();
  await expectFilter(page, "inference", "type", "direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.goto("/");
  await categoryEntry(page, "labs", "ai_company").click();
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
  await expectFilter(page, "labs", "type", "ai_company");
});

test("typing on the front door searches everything and lands in results", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(allSearch(page)).toHaveValue("Ollama");
  await expect(allSearch(page)).toBeFocused();
  await expect(page).toHaveURL(/q=Ollama/);
  await expect(page.locator("#all-directory-grid .project-card").first()).toContainText("Ollama");
});

// Before boot only the door's search is on screen, and a boot that is slow to
// land must not lose what was typed into it.
test("text typed on the front door before the page finishes loading still searches", async ({ page }) => {
  await page.route(/\/app\/systems\.json/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/");
  await page.locator("#door-search").fill("Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(allSearch(page)).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// The front door clears the query a collection left behind, so the text
// typed on the door is the search.
test("text typed on the front door replaces a query left in another collection", async ({ page }) => {
  await page.goto("/?collection=inference&q=vllm");
  await expect(searchBox(page, "inference")).toHaveValue("vllm");
  await openView(page, "directory");
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(allSearch(page)).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// Every lab's name also names its models, so the query is a word only a lab's
// own record holds (AI Singapore's note names the Infocomm Media Development
// Authority). This used to be a dead end in Everything -- the All grid summed six
// collections and omitted Labs, so the reader got an empty result and a pointer into
// the Labs scope. Everything holds every collection now, so the lab is listed where
// the search landed, and the pointer into Labs is what a narrower scope is for.
/* global activateView, searchIndexes */
test("a query only a lab answers lists the lab in Everything, and opens Labs on request", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Infocomm");
  await page.waitForFunction(() =>
    ["systems", "inference", "runtimes", "models", "packs", "robots", "labs", "specifications"]
      .every(key => searchIndexes[key] !== undefined));
  await expect(page.locator("#all-directory-grid .empty-search")).toHaveCount(0);
  const labCard = page.locator("#all-directory-grid .lab-card");
  await expect(labCard).toHaveCount(1);
  await expect(labCard).toContainText("AI Singapore");
  await labCard.getByRole("button", { name: /^View details for / }).click();
  await expect(recordView(page, "lab")).toContainText("AI Singapore");
  await closeRecord(page, "lab");

  // The narrower scope still answers, and carries the query with it.
  await openCollection(page, "labs");
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
  await expect(searchBox(page, "labs")).toHaveValue("Infocomm");
  await expect(page.locator("#lab-grid .project-card")).toHaveCount(1);
  await expect(page.locator("#lab-grid .project-card")).toContainText("AI Singapore");
});

// The door shows no cards, so it has no badges for the key to explain.
// The door is a clean start: the query left in the collection last shown is
// cleared on arrival, so a tile never opens with a search the door never showed.
test("a tile opened from the front door carries no query from the collection last shown", async ({ page }) => {
  await page.goto("/?collection=inference");
  await search(page, "vllm");
  await expect(page).toHaveURL(/q=vllm/);
  await openView(page, "directory");
  await expect(page.locator("#front-door")).toBeVisible();
  await openCollection(page, "runtimes");
  await expect(page.locator("#runtimes-directory-panel")).toBeVisible();
  await expect(searchBox(page, "runtimes")).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&]q=/);
});

// A category link's count is what its collection lists narrowed to that one
// category, so the link clears any other facet a previous visit left set.
test("a category link opens its collection narrowed to that category alone", async ({ page }) => {
  await page.goto("/?collection=inference&delivery=reserved_capacity");
  await expectFilter(page, "inference", "delivery", "reserved_capacity");
  await openView(page, "directory");
  const link = categoryEntry(page, "inference", "direct_model_api");
  const count = Number(await link.locator("strong").textContent());
  await link.click();
  await expectFilter(page, "inference", "type", "direct_model_api");
  await expectFilter(page, "inference", "delivery", "");
  await expect(page).toHaveURL(address => {
    const keys = [...address.searchParams.keys()].sort();
    return keys.join(",") === "collection,type" && address.searchParams.get("type") === "direct_model_api";
  });
  await expect(page.locator("#inference-result-count")).toContainText(new RegExp(`^${count} services?\\b`));
});

// Each search index the door's search fetches on focus repaints the grids as
// it lands; the index must not be rebuilt under a reader's focus then.
test("a focused tile keeps its focus while the search indexes land", async ({ page }) => {
  // Hold the indexes until a tile has focus, so they land under it.
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/app\/search\/[a-z]+\.json(\?.*)?$/, async route => {
    await held;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#door-jobs button")).toHaveCount(5);
  await page.locator("#door-search").focus();
  // The role map precedes the collection index; test the same late-load focus contract.
  const tile = collectionEntry(page, "all");
  await tile.focus();
  await expect(tile).toBeFocused();
  release();
  await page.waitForFunction(() =>
    ["systems", "inference", "runtimes", "models", "packs", "robots"].every(key => searchIndexes[key] !== undefined));
  await expect(tile).toBeFocused();
});

test("the badge key stays hidden on the front door and returns in results", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page.locator("#badge-legend")).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();
  await openCollection(page, "inference");
  await expect(page.locator("#badge-legend")).toBeVisible();
});

test("a Finder job opens the Finder at its priority question", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#door-jobs button")).toHaveCount(5);
  await page.locator('#door-jobs [data-door-direction="agent_system"]').click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  // The Finder is one screen, so the job is chosen and its shortlist is what
  // the pill leaves open — there is no standing question left to answer.
  await expect(page.locator(".finder-result-heading h2")).toHaveText("Delegate general knowledge work");
  await expect(page.locator("#finder-status")).toContainText("match, ranked for");
});

test("tiles carry the three most recently reviewed marks and no example ranking", async ({ page }) => {
  await page.goto("/");
  const marks = page.locator('[data-tile="inference"] .tile-marks .card-mark');
  await expect(marks).toHaveCount(3);
  // logos.json lands after first paint and fills each mark that has an icon.
  // Poll the whole front door rather than one tile: which collections' three
  // newest records carry a vendored mark changes with every promotion, and a
  // record with no mark is meant to keep its monogram.
  await expect.poll(async () => page.locator("#collection-index .tile-marks .card-mark svg").count()).toBeGreaterThan(0);
});

test("the Directory tab and the brand mark return to the front door", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await openView(page, "directory");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/collection=/);
  await page.goto("/?collection=runtimes");
  await page.locator(".brand-link").click();
  await expect(page.locator("#front-door")).toBeVisible();
});

test("results carry a sticky strip with exactly one pressed entry, families inside Systems", async ({ page }) => {
  await page.goto("/?collection=inference");
  const strip = page.locator("#scope-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator(".scope-row .scope-entry")).toHaveCount(9);
  await expect(pressedEntry(page)).toHaveCount(1);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Inference services \d/);
  await expect(strip.locator(".family-row")).toHaveCount(0);
  await expect(strip).toHaveCSS("position", "sticky");
  await openCollection(page, "systems");
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems \d/);
  await expect(strip.locator(".family-row .family-entry")).toHaveCount(4);
  await expect(strip.locator('.family-row [aria-pressed="true"]')).toHaveAccessibleName(/^All families \d/);
  await familyEntry(page, "memory_system").click();
  await expect(strip.locator('.family-row [aria-pressed="true"]')).toHaveAccessibleName(/^Memory \d/);
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Systems \d/);
  await expectFilter(page, "systems", "family", "memory_system");
});

test("up to tablet width the strip shows emblems only in one row with slack, sticky under the header at every width", async ({ page }) => {
  for (const width of [320, 360, 390, 768, 960]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/?collection=runtimes");
    const strip = page.locator("#scope-strip");
    const row = strip.locator(".scope-row");
    // scrollWidth never drops below clientWidth, so the entries' extent is
    // measured from the row's left edge to the last entry's right edge.
    const [rowWidth, frame, overflow, rows] = await row.evaluate(element => [
      element.lastElementChild.getBoundingClientRect().right - element.getBoundingClientRect().left,
      element.clientWidth,
      element.scrollWidth - element.clientWidth,
      new Set([...element.children].map(entry => entry.getBoundingClientRect().top)).size,
    ]);
    expect(rows, `${width}: one row`).toBe(1);
    expect(frame - rowWidth, `${width}: the row leaves at least 16 px`).toBeGreaterThanOrEqual(16);
    expect(overflow, `${width}: the row never scrolls sideways`).toBe(0);
    await expect(strip.locator(".scope-caption")).toHaveText(/^Local runtimes · \d+$/);
    const nameWidth = await strip.locator(".scope-entry").first().locator(".scope-name").evaluate(element => element.getBoundingClientRect().width);
    expect(nameWidth, `${width}: names are clipped, not shown`).toBeLessThanOrEqual(1);
    await expect(strip).toHaveCSS("position", "sticky");
    await expect(page.locator(".site-header")).toHaveCSS("position", "sticky");
    const headerHeight = await page.locator(".site-header").evaluate(element => element.getBoundingClientRect().height);
    await expect(strip).toHaveCSS("top", `${headerHeight}px`);
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
    expect((await strip.boundingBox()).y).toBe(headerHeight);
  }
});

test("above phone widths the strip sticks under the header", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=systems");
  const headerHeight = await page.locator(".site-header").evaluate(element => element.getBoundingClientRect().height);
  await expect(page.locator("#scope-strip")).toHaveCSS("top", `${headerHeight}px`);
  await page.mouse.wheel(0, 2000);
  // Wait for smooth scrolling to stop before measuring (html { scroll-behavior: smooth }).
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY, still = 0;
    const frame = () => requestAnimationFrame(() => { still = window.scrollY === last ? still + 1 : 0; last = window.scrollY; if (still >= 5) resolve(); else frame(); });
    frame();
  }));
  const [stripTop, headerBottom] = await page.evaluate(() => [
    document.querySelector("#scope-strip").getBoundingClientRect().top,
    document.querySelector(".site-header").getBoundingClientRect().bottom,
  ]);
  expect(Math.abs(stripTop - headerBottom)).toBeLessThan(2);
});

test("a state dot marks a comparison in progress and Finder roles applied", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:aider,kilo-code");
  await expect(collectionDot(page, "systems")).toHaveClass(/is-compare/);
  // A compare link opens the comparison itself; close it to reach the tray.
  await page.locator("#comparison-dialog .dialog-close").click();
  await page.locator("#comparison-clear").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
  await page.goto("/?view=finder");
  await finderHandoff(page, "coding");
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);
  await page.locator("#finder-roles-chip").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
});

test("the Systems entry clears a family, and the Models entry opens its collection", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system");
  await openCollection(page, "systems");
  await expectFilter(page, "systems", "family", "");
  await expect(page).not.toHaveURL(/family=/);
  await openCollection(page, "models");
  await expect(page.locator("#models-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=models/);
});

// A grid repaints under the strip as a search runs; a reader's focus on a
// strip entry must survive it.
test("a focused strip entry keeps its focus while the grid repaints", async ({ page }) => {
  await page.goto("/?collection=inference");
  const entry = collectionEntry(page, "runtimes");
  await entry.focus();
  await searchBox(page, "inference").evaluate(input => {
    input.value = "vllm";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page).toHaveURL(/q=vllm/);
  await expect(entry).toBeFocused();
});

// The heading is the Directory view's focus target, so it must exist in
// results too: a switch into results from another view lands focus on it.
test("a switch into Directory results focuses its heading", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#systems-directory-panel [data-scope-note=systems] [data-open-tab=taxonomy]").click();
  await expect(page.locator("#taxonomy")).toHaveClass(/is-active/);
  await expect(page.locator("#taxonomy-title")).toBeFocused();
  // The Catalog tab returns to the front door by design; the switch that
  // lands in results is the app's own, as the Finder and record links use.
  await page.evaluate(() => activateView("directory"));
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(page.locator("#directory-title")).toBeFocused();
});

// Waits until scrollY holds still for five animation frames, since html
// scrolls smoothly, then runs `measure` in the same frame.
const settled = (page, measure) => page.evaluate(async source => {
  await new Promise(resolve => {
    let last = window.scrollY, still = 0;
    const frame = () => requestAnimationFrame(() => { still = window.scrollY === last ? still + 1 : 0; last = window.scrollY; if (still >= 5) resolve(); else frame(); });
    frame();
  });
  return new Function(`return (${source})()`)();
}, measure.toString());

test("from tablet to wide desktop the strip stays one short row", async ({ page }) => {
  for (const [width, height] of [[768, 1024], [1024, 768], [1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?collection=systems");
    const strip = page.locator("#scope-strip");
    await expect(strip.locator(".family-row")).toHaveCount(1);
    const tops = await strip.locator(".scope-row .scope-entry").evaluateAll(entries => entries.map(entry => entry.getBoundingClientRect().top));
    expect(new Set(tops).size, `${width}: one row`).toBe(1);
    const height_ = await strip.evaluate(element => element.getBoundingClientRect().height);
    expect(height_, `${width}: the strip stays short`).toBeLessThanOrEqual(96);
  }
  // The short name is shown and the full name stays the accessible name.
  await page.setViewportSize({ width: 1024, height: 768 });
  const services = collectionEntry(page, "inference");
  await expect(services.locator(".scope-short")).toBeVisible();
  await expect(services).toHaveAccessibleName(/^Inference services \d/);
});

// Focus moving back up a results grid must stop below the sticky header and
// strip, never under them (html's scroll-padding-top, measured by app.js).
// A control wholly off screen is scrolled to the middle anyway, so before
// each step the focused control sits 300 px below the strip: a card row up,
// the previous control is then on screen but under the strip, and only the
// scroll padding makes the browser scroll it clear.
test("focus walking back up the results stays clear of the strip", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?collection=systems");
  const controls = page.locator("#project-grid button:visible");
  await expect(controls.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await controls.last().focus();
  for (let step = 0; step < 8; step += 1) {
    await page.evaluate(() => {
      const stripBottom = document.querySelector("#scope-strip").getBoundingClientRect().bottom;
      window.scrollBy({ top: document.activeElement.getBoundingClientRect().top - stripBottom - 300, behavior: "instant" });
    });
    await page.keyboard.press("Shift+Tab");
    const [top, stripBottom, inGrid] = await settled(page, () => [
      document.activeElement.getBoundingClientRect().top,
      document.querySelector("#scope-strip").getBoundingClientRect().bottom,
      Boolean(document.activeElement.closest("#project-grid")),
    ]);
    expect(inGrid, `step ${step}: focus is still in the grid`).toBe(true);
    expect(top, `step ${step}: the focused control sits below the strip`).toBeGreaterThanOrEqual(stripBottom - 1);
  }
});

test("a record URL with no collection opens over its own collection's results", async ({ page }) => {
  await page.goto("/?record=runtime:ollama");
  await expect(recordView(page, "runtime")).toBeVisible();
  await closeRecord(page, "runtime");
  await expect(page.locator("#runtimes-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=runtimes/);
  await expect(page).not.toHaveURL(/record=/);

  // A record opened over the All results keeps All (ruling R17).
  await page.goto("/?collection=all&record=pack:agent-toolkit");
  await page.reload();
  await expect(recordView(page, "pack")).toBeVisible();
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await closeRecord(page, "pack");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=all/);
  await expect(page).not.toHaveURL(/record=/);
});

test("a comparison decides the scope before the collection's filters are applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=inference:openai-api,anthropic-api");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expectFilter(page, "systems", "family", "");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page.locator("#comparison-tray")).toBeVisible();
});

test("Back after closing a record restores the filters the URL carries", async ({ page }) => {
  await page.goto("/?collection=systems");
  await setFilter(page, "systems", "license", "MIT");
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid [data-project]").first().click();
  await expect(recordView(page, "system")).toBeVisible();
  await closeRecord(page, "system");
  await setFilter(page, "systems", "license", "Apache-2.0");
  await expect(page).toHaveURL(/license=Apache-2\.0/);
  await page.goBack();
  await expect(page).toHaveURL(/license=MIT/);
  await expectFilter(page, "systems", "license", "MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(recordView(page, "system")).toBeHidden();
});

// Typing replaces the entry a closed record left, so Back lands on the entry
// before the record, whose query the box and the results must show.
test("Back after closing a record restores the query the URL carries", async ({ page }) => {
  await page.goto("/?collection=systems");
  const index = page.waitForResponse(response => new URL(response.url()).pathname === "/app/search/systems.json");
  await search(page, "ollama");
  await index;
  await page.waitForFunction(() => searchIndexes.systems !== undefined);
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid [data-project]").first().click();
  await expect(recordView(page, "system")).toBeVisible();
  await closeRecord(page, "system");
  await search(page, "vllm");
  await expect(page).toHaveURL(/q=vllm/);
  await page.goBack();
  await expect(page).toHaveURL(/q=ollama/);
  await expect(searchBox(page, "systems")).toHaveValue("ollama");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(recordView(page, "system")).toBeHidden();
});

test("Back and forward move between the front door, results, and a record", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "packs");
  await page.locator('#pack-grid [data-pack="agent-toolkit"]').click();
  await expect(recordView(page, "pack")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "pack")).toBeHidden();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Agent packs \d/);
  await page.goForward();
  await expect(recordView(page, "pack")).toBeVisible();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
});

// A shared comparison link opens its table; Back to a comparison is not a
// request for the table, only for the selection the URL carries.
test("Back to a comparison restores the selection without opening its table", async ({ page }) => {
  await page.goto("/?collection=systems&family=agent_system&role=coding_agent");
  await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
  await page.locator('#project-grid [data-compare-id="aider"]').click();
  await expect(page).toHaveURL(/compare=system%3Akilo-code%2Caider/);
  await page.locator('#project-grid [data-project="aider"]').click();
  await expect(recordView(page, "system")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "system")).toBeHidden();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#comparison-dialog")).toBeHidden();
});

test("a restored query with no sort lands on Best match", async ({ page }) => {
  await page.goto("/?collection=inference&q=router");
  await expect(sortControl(page, "inference")).toHaveValue("match");
});

// Following the skip link changes only the fragment, which fires popstate;
// nothing the URL's search carries changed, so nothing is restored.
test("the skip link restores nothing, so a sort chosen before typing still comes back", async ({ page }) => {
  await page.goto("/?collection=inference");
  await sortControl(page, "inference").selectOption("name");
  const index = page.waitForResponse(response => new URL(response.url()).pathname === "/app/search/inference.json");
  await search(page, "router");
  await index;
  await page.waitForFunction(() => searchIndexes.inference !== undefined);
  await expect(sortControl(page, "inference")).toHaveValue("match");
  const before = await page.locator("#inference-result-count").textContent();
  const urlSearch = new URL(page.url()).search;
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  expect(new URL(page.url()).search).toBe(urlSearch);
  await expect(sortControl(page, "inference")).toHaveValue("match");
  await expect(page.locator("#inference-result-count")).toHaveText(before);
  await search(page, "");
  await expect(sortControl(page, "inference")).toHaveValue("name");
});

// A sort chosen before typing is what clearing the query gives back. Beside
// a query still listed by Best match the URL carries it as browseSort, so a
// reload keeps it (Phase 3 spec, section 8).
test("a sort chosen before typing survives a reload and returns when the query is cleared", async ({ page }) => {
  await page.goto("/?collection=inference");
  await sortControl(page, "inference").selectOption("name");
  await search(page, "router");
  await expect(sortControl(page, "inference")).toHaveValue("match");
  await page.reload();
  await search(page, "");
  await expect(sortControl(page, "inference")).toHaveValue("name");
  await expect(page).toHaveURL(/sort=name/);
});

// Presses Tab until `target` holds focus, as a keyboard reader reaches it.
async function tabTo(page, target) {
  for (let step = 0; step < 80; step += 1) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

// Opening a tile hides the front door that held the focused control, so
// focus moves to the pressed strip entry rather than falling to the page.
test("a tile or a category link opened by keyboard hands focus to the pressed strip entry", async ({ page }) => {
  for (const [open, panel, name] of [
    [page => collectionEntry(page, "inference"), "#inference-directory-panel", /^Inference services \d/],
    [page => collectionEntry(page, "systems"), "#systems-directory-panel", /^Systems \d/],
    [page => categoryEntry(page, "inference", "direct_model_api"), "#inference-directory-panel", /^Inference services \d/],
    [page => familyEntry(page, "memory_system"), "#systems-directory-panel", /^Systems \d/],
  ]) {
    await page.goto("/");
    await expect(page.locator("#door-jobs button")).toHaveCount(5);
    await page.locator("#door-search").focus();
    await tabTo(page, open(page));
    await page.keyboard.press("Enter");
    await expect(page.locator(panel)).toBeVisible();
    await expect(pressedEntry(page)).toHaveAccessibleName(name);
    await expect(pressedEntry(page)).toBeFocused();
  }
});

// The front door's URL is bare (spec, "URL and history"): a comparison in
// progress stays in memory there, so Back from a collection opened from the
// door lands on the door, and the Systems tile its dot marks reopens it.
test("a comparison in progress stays off the front door's URL and the Systems tile reopens it", async ({ page }) => {
  const start = async () => {
    await page.goto("/?collection=systems&family=agent_system&role=coding_agent");
    await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
    await page.locator('#project-grid [data-compare-id="aider"]').click();
    await expect(page).toHaveURL(/compare=system%3Akilo-code%2Caider/);
    await openView(page, "directory");
    await expect(page.locator("#front-door")).toBeVisible();
  };
  await start();
  await expect(page).not.toHaveURL(/compare=/);
  await expect(collectionDot(page, "systems")).toHaveClass(/is-compare/);
  await openCollection(page, "inference");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/[?&](collection|compare)=/);

  await start();
  await openCollection(page, "systems");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#comparison-tray-items")).toContainText("Kilo Code");
  await expect(page.locator("#comparison-tray-items")).toContainText("Aider");
  await expectFilter(page, "systems", "family", "agent_system");
  await expect(page).toHaveURL(/compare=system%3Akilo-code%2Caider/);
});

test("the Systems tile reopens a Finder role set its dot marks", async ({ page }) => {
  await page.goto("/?view=finder");
  await finderHandoff(page, "coding");
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  const before = await page.locator("#result-count").textContent();
  await openView(page, "directory");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);
  await openCollection(page, "systems");
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(collectionDot(page, "systems")).toHaveClass(/is-finder/);
});

// A tile promises its collection's default view, so facets a previous visit
// left set are cleared on the way in, as a category link's are.
test("a tile opens what its count promises, whatever the last visit left set", async ({ page }) => {
  await page.goto("/");
  const count = await entryCount(page, "inference");
  await openCollection(page, "inference");
  await setFilter(page, "inference", "delivery", "reserved_capacity");
  await expect(page).toHaveURL(/delivery=reserved_capacity/);
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await openCollection(page, "inference");
  await expectFilter(page, "inference", "delivery", "");
  await expect(page).toHaveURL(address => [...address.searchParams.keys()].join(",") === "collection"
    && address.searchParams.get("collection") === "inference");
  await expect(page.locator("#inference-result-count")).toContainText(new RegExp(`^${count} services?\\b`));
});

// Inside Systems the family row stays one row on a phone, so the sticky strip
// stays short under the sticky header.
test("inside Systems on a phone the strip stays short and the family row fits one row", async ({ page }) => {
  for (const [width, height] of [[320, 640], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?collection=systems");
    const strip = page.locator("#scope-strip");
    const row = strip.locator(".family-row");
    await expect(row.locator(".family-entry")).toHaveCount(4);
    const [stripHeight, rowWidth, frame, rows] = await settled(page, () => {
      const element = document.querySelector("#scope-strip .family-row");
      return [
        document.querySelector("#scope-strip").getBoundingClientRect().height,
        element.lastElementChild.getBoundingClientRect().right - element.getBoundingClientRect().left,
        element.clientWidth,
        new Set([...element.children].map(entry => entry.getBoundingClientRect().top)).size,
      ];
    });
    expect(rows, `${width}: the family row is one row`).toBe(1);
    expect(frame - rowWidth, `${width}: the family row leaves at least 16 px`).toBeGreaterThanOrEqual(16);
    expect(stripHeight, `${width}: the strip is at most 80 px tall`).toBeLessThanOrEqual(80);
    await expect(row.locator(".family-entry").first()).toHaveAccessibleName(/^All families \d/);
    await expect(familyEntry(page, "memory_system")).toHaveAccessibleName(/^Memory \d/);
    await expect(familyEntry(page, "agent_system")).toHaveAccessibleName(/^Agents \d/);
    await expect(familyEntry(page, "assistant_system")).toHaveAccessibleName(/^Assistants \d/);
  }
});

test("Models, Systems, Labs, and Robots open as cards, newest first where a date sort exists", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const elements = page.getByRole("tab", { name: "Elements" });
  await expect(elements).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#elements")).toBeVisible();

  await page.getByRole("button", { name: "Models", exact: true }).click();
  await expect(page.locator("#models-directory-panel")).toBeVisible();
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#model-grid.is-list")).toHaveCount(0);
  await expect(page).toHaveURL(/collection=models/);
  await expect(page).toHaveURL(/reviewed=1/);
  await expect(page).toHaveURL(/sort=release/);
  await expect(page).not.toHaveURL(/layout=list/);
  await page.locator('[data-set-layout="list"]').click();
  await expect(page).toHaveURL(/layout=list/);
  const reviews = await page.locator("#model-grid tbody tr td:nth-child(5)").allTextContents();
  expect(reviews.length).toBeGreaterThan(0);
  expect(reviews.every(review => review.trim() === "Atlas reviewed")).toBe(true);
  const released = await page.locator("#model-grid tbody tr td:nth-child(4)").allTextContents();
  let previous = null;
  for (const value of released) {
    const date = value.trim();
    if (!date) {
      previous = "";
      continue;
    }
    expect(previous, "an undated release sorts last").not.toBe("");
    if (previous) expect(date <= previous).toBe(true);
    previous = date;
  }
  await page.locator("#model-grid tbody .link-button").first().click();
  await expect(page.locator("#record-dialog")).toBeVisible();
  await page.locator("#record-dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#record-dialog")).toBeHidden();

  await page.goto("/");
  await page.getByRole("button", { name: "Systems", exact: true }).click();
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#project-grid.is-list")).toHaveCount(0);
  await expect(page).toHaveURL(/collection=systems/);
  await expect(page).toHaveURL(/sort=reviewed/);
  await expect(page).not.toHaveURL(/layout=list/);
  await page.locator('[data-set-layout="list"]').click();
  const reviewed = await page.locator("#project-grid tbody tr td:nth-child(6)").allTextContents();
  expect(reviewed.length).toBeGreaterThan(0);
  previous = null;
  for (const value of reviewed) {
    const date = value.trim();
    if (!date || date === "Not recorded") {
      previous = "";
      continue;
    }
    expect(previous, "a dated system sorts ahead of an undated one").not.toBe("");
    if (previous) expect(date <= previous).toBe(true);
    previous = date;
  }
  await page.locator("#project-grid tbody .link-button").first().click();
  await expect(page.locator("#record-dialog")).toBeVisible();
  await page.locator("#record-dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#record-dialog")).toBeHidden();
  // Opening the record pushed an entry, and closing it replaces that entry,
  // so the first Back stays on the list and the next returns to the door.
  await page.goBack();
  await expect(page).toHaveURL(/sort=reviewed/);
  await page.goBack();
  await expect(page.locator("#elements")).toBeVisible();
  await expect(page.locator("#front-door")).toBeVisible();

  await page.getByRole("button", { name: "Labs", exact: true }).click();
  await expect(page.locator("#lab-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#lab-grid.is-list")).toHaveCount(0);
  await expect(page).toHaveURL(/collection=labs/);
  await expect(page).not.toHaveURL(/layout=list/);

  await page.goto("/");
  await page.getByRole("button", { name: "Robots", exact: true }).click();
  await expect(page.locator("#robot-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#robot-grid.is-list")).toHaveCount(0);
  await expect(page).toHaveURL(/collection=robots/);
  await expect(page).not.toHaveURL(/layout=list/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?collection=models&layout=list&sort=release&reviewed=1");
  await expect(page.locator(".layout-toggle")).toBeHidden();
  await expect(page.locator("#model-grid.is-list")).toHaveCount(0);
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
});

test("a list Compare label stays inside its button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?family=agent_system&role=research_agent&layout=list&collection=systems");
  const singleLine = locator => locator.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length === 1;
  });
  const headers = page.locator("#project-grid thead th");
  for (const [index, label] of [[4, "Local-first"], [6, "Score"]]) {
    await expect(headers.nth(index)).toHaveText(label);
    expect(await singleLine(headers.nth(index)), label).toBe(true);
  }
  const first = page.locator("#project-grid tbody tr").first();
  expect(await singleLine(first.locator("td").nth(0)), "role").toBe(true);
  expect(await singleLine(first.locator("td").nth(4)), "review date").toBe(true);
  expect(await singleLine(page.locator("#project-grid tbody tr").filter({ hasText: "Kosmos" }).locator("td").nth(6)), "stars").toBe(true);
  expect(await singleLine(page.locator("#project-grid tbody tr").filter({ hasText: "Open Deep Research" }).locator(".link-button")), "name").toBe(true);
  await expect(page.locator('[data-scope-note="systems"] [data-family-score="ready"]')).toBeVisible();
  await expect(page.locator('[data-scope-note="systems"] [data-family-score="needed"]')).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
  const [barBottom, rowTop] = await page.evaluate(() => [
    document.querySelector("#results-bar").getBoundingClientRect().bottom,
    document.querySelector(".result-row").getBoundingClientRect().top,
  ]);
  expect(Math.abs(rowTop - barBottom), `count row ${rowTop}, bar bottom ${barBottom}`).toBeLessThan(1);
  await expect(page.locator("#result-count")).toContainText("8 projects");
  await expect(page.locator("#filter-chips")).toContainText("Role: Research agent");
  const button = page.locator("#project-grid .compare-toggle").first();
  await button.scrollIntoViewIfNeeded();
  const fits = async () => button.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()];
    const box = element.getBoundingClientRect();
    return rects.length === 1 && rects[0].left >= box.left - 1 && rects[0].right <= box.right + 1;
  });
  await expect(button).toHaveText("Compare");
  expect(await fits()).toBe(true);
  await button.click();
  await expect(button).toHaveText("Selected");
  expect(await fits()).toBe(true);
  await expect(page.locator("#project-grid .badge-help")).toHaveCount(0);
  await page.locator('[data-set-layout="cards"]').click();
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
  await expect(page.locator("#project-grid .badge-help")).toHaveCount(0);
});
