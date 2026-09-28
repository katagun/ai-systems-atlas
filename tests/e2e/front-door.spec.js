const { test, expect } = require("@playwright/test");
const { familyEntry, openCollection, pressedEntry, searchAll } = require("./helpers/landing");
const counts = require("./helpers/catalog-counts");

test("a bare URL opens the front door with every collection above the fold", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#front-door")).toBeVisible();
    await expect(page.locator(".collection-panel:not([hidden])")).toHaveCount(0);
    await expect(page).not.toHaveURL(/collection=/);
    const index = page.locator("#collection-index");
    const top = await index.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
    expect(top, `${width}: the index starts above the fold`).toBeLessThan(height);
    await expect(page.locator("[data-tile]")).toHaveCount(9);
    await expect(page.locator(".atlas-map")).toHaveCount(0);
  }
});

test("every tile counts what its collection lists, with the Models and packs splits", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-tile="systems"] .tile-count strong')).toHaveText(String(counts.projectsWithStatus("active")));
  await expect(page.locator('[data-tile="all"] .tile-count strong')).toHaveText(String(counts.allDirectoryEntries));
  await expect(page.locator('[data-tile="models"] .tile-count')).toContainText(`${counts.reviewedModels} reviewed`);
  await expect(page.locator('[data-tile="packs"] .tile-count')).toContainText(`${counts.packs} packs`);
  await expect(page.locator('[data-tile="labs"] .tile-count strong')).toHaveText(String(counts.labs));
  await expect(page.locator('[data-tile="robots"] .tile-count strong')).toHaveText(String(counts.robots));
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
    await page.locator(`[data-tile="${id}"] .tile-open`).click();
    await expect(page.locator(`#${id}-directory-panel`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`collection=${id}`));
  }
});

test("a category link opens the scope narrowed to it", async ({ page }) => {
  await page.goto("/");
  await familyEntry(page, "memory_system").click();
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
  await expect(page).toHaveURL(/family=memory_system/);
  await page.goto("/");
  await page.locator('[data-tile="inference"] [data-facet-value="direct_model_api"]').click();
  await expect(page.locator("#inference-type-filter")).toHaveValue("direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.goto("/");
  await page.locator('[data-tile="labs"] [data-facet-value="ai_company"]').click();
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
  await expect(page.locator("#lab-type-filter")).toHaveValue("ai_company");
});

test("typing on the front door searches everything and lands in results", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page.locator("#all-directory-search")).toBeFocused();
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
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// Leaving the door carries the query of the collection last shown; the text
// typed on the door must win over it.
test("text typed on the front door replaces a query left in another collection", async ({ page }) => {
  await page.goto("/?collection=inference&q=vllm");
  await expect(page.locator("#inference-search")).toHaveValue("vllm");
  await page.locator('.tab[data-tab="directory"]').click();
  await searchAll(page, "Ollama");
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page).toHaveURL(/q=Ollama/);
});

// Every lab's name also names its models, so the query is a word only a lab's
// own record holds (AI Singapore's note names the Infocomm Media Development
// Authority). The All list finds nothing; opening Labs from the results
// carries the query in. The front door carries none (a clean start).
/* global activateView, searchIndexes */
test("a query only a lab answers follows the reader from the All results into Labs", async ({ page }) => {
  await page.goto("/");
  await searchAll(page, "Infocomm");
  await page.waitForFunction(() =>
    ["systems", "inference", "runtimes", "models", "packs", "robots"].every(key => searchIndexes[key] !== undefined));
  await expect(page.locator("#all-directory-grid .empty-search")).toBeVisible();
  await expect(page.locator("#all-directory-grid .project-card")).toHaveCount(0);
  await openCollection(page, "labs");
  await expect(page.locator("#labs-directory-panel")).toBeVisible();
  await expect(page.locator("#lab-search")).toHaveValue("Infocomm");
  await expect(page.locator("#lab-grid .project-card")).toHaveCount(1);
  await expect(page.locator("#lab-grid .project-card")).toContainText("AI Singapore");
});

// The door shows no cards, so it has no badges for the key to explain.
// The door is a clean start: the query left in the collection last shown is
// cleared on arrival, so a tile never opens with a search the door never showed.
test("a tile opened from the front door carries no query from the collection last shown", async ({ page }) => {
  await page.goto("/?collection=inference");
  await page.locator("#inference-search").fill("vllm");
  await expect(page).toHaveURL(/q=vllm/);
  await page.locator('.tab[data-tab="directory"]').click();
  await expect(page.locator("#front-door")).toBeVisible();
  await openCollection(page, "runtimes");
  await expect(page.locator("#runtimes-directory-panel")).toBeVisible();
  await expect(page.locator("#runtime-search")).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&]q=/);
});

// A category link's count is what its collection lists narrowed to that one
// category, so the link clears any other facet a previous visit left set.
test("a category link opens its collection narrowed to that category alone", async ({ page }) => {
  await page.goto("/?collection=inference&delivery=reserved_capacity");
  await expect(page.locator("#inference-delivery-filter")).toHaveValue("reserved_capacity");
  await page.locator('.tab[data-tab="directory"]').click();
  const link = page.locator('[data-tile="inference"] [data-facet-value="direct_model_api"]');
  const count = Number(await link.locator("strong").textContent());
  await link.click();
  await expect(page.locator("#inference-type-filter")).toHaveValue("direct_model_api");
  await expect(page.locator("#inference-delivery-filter")).toHaveValue("");
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
  // Past the five Finder jobs to the first tile's button.
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("Tab");
  const tile = page.locator('[data-tile="all"] .tile-open');
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
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
});

test("tiles carry the three most recently reviewed marks and no example ranking", async ({ page }) => {
  await page.goto("/");
  const marks = page.locator('[data-tile="inference"] .tile-marks .card-mark');
  await expect(marks).toHaveCount(3);
  // logos.json lands after first paint and fills each mark that has an icon.
  await expect.poll(async () => page.locator('[data-tile="systems"] .tile-marks .card-mark svg').count()).toBeGreaterThan(0);
});

test("the Directory tab and the brand mark return to the front door", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await page.locator('.tab[data-tab="directory"]').click();
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
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
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
  await expect(page.locator('#scope-strip [data-open-collection="systems"] .state-dot.is-compare')).toHaveCount(1);
  // A compare link opens the comparison itself; close it to reach the tray.
  await page.locator("#comparison-dialog .dialog-close").click();
  await page.locator("#comparison-clear").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
  await page.goto("/?view=finder");
  for (const value of ["agent_system", "coding", "balanced"]) {
    await page.locator(`[data-finder-choice][data-finder-value="${value}"]`).click();
  }
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator('#scope-strip [data-open-collection="systems"] .state-dot.is-finder')).toHaveCount(1);
  await page.locator("#finder-roles-chip").click();
  await expect(page.locator("#scope-strip .state-dot")).toHaveCount(0);
});

test("the Systems entry clears a family, and the Models entry opens its collection", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system");
  await openCollection(page, "systems");
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page).not.toHaveURL(/family=/);
  await page.locator('#scope-strip [data-open-collection="models"]').click();
  await expect(page.locator("#models-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=models/);
});

// A grid repaints under the strip as a search runs; a reader's focus on a
// strip entry must survive it.
test("a focused strip entry keeps its focus while the grid repaints", async ({ page }) => {
  await page.goto("/?collection=inference");
  const entry = page.locator('#scope-strip [data-open-collection="runtimes"]');
  await entry.focus();
  await page.evaluate(() => {
    const input = document.querySelector("#inference-search");
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
  await page.locator("#systems-directory-panel [data-open-tab=taxonomy]").click();
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
  const services = page.locator('#scope-strip [data-open-collection="inference"]');
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
  await expect(page.locator("#runtime-dialog")).toBeVisible();
  await page.locator("#runtime-dialog .dialog-close").click();
  await expect(page.locator("#runtimes-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=runtimes/);
  await expect(page).not.toHaveURL(/record=/);

  // A record opened over the All results keeps All (ruling R17).
  await page.goto("/?collection=all&record=pack:agent-toolkit");
  await page.reload();
  await expect(page.locator("#pack-dialog")).toBeVisible();
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await page.locator("#pack-dialog .dialog-close").click();
  await expect(page.locator("#all-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=all/);
  await expect(page).not.toHaveURL(/record=/);
});

test("a comparison decides the scope before the collection's filters are applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=inference:openai-api,anthropic-api");
  await expect(page.locator("#inference-directory-panel")).toBeVisible();
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page.locator("#comparison-tray")).toBeVisible();
});

test("Back after closing a record restores the filters the URL carries", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#license-filter").selectOption("MIT");
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid [data-project]").first().click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await page.locator("#project-dialog .dialog-close").click();
  await page.locator("#license-filter").selectOption("Apache-2.0");
  await expect(page).toHaveURL(/license=Apache-2\.0/);
  await page.goBack();
  await expect(page).toHaveURL(/license=MIT/);
  await expect(page.locator("#license-filter")).toHaveValue("MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator("#project-dialog")).toBeHidden();
});

// Typing replaces the entry a closed record left, so Back lands on the entry
// before the record, whose query the box and the results must show.
test("Back after closing a record restores the query the URL carries", async ({ page }) => {
  await page.goto("/?collection=systems");
  const index = page.waitForResponse(response => new URL(response.url()).pathname === "/app/search/systems.json");
  await page.locator("#project-search").fill("ollama");
  await index;
  await page.waitForFunction(() => searchIndexes.systems !== undefined);
  const before = await page.locator("#result-count").textContent();
  await page.locator("#project-grid [data-project]").first().click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await page.locator("#project-dialog .dialog-close").click();
  await page.locator("#project-search").fill("vllm");
  await expect(page).toHaveURL(/q=vllm/);
  await page.goBack();
  await expect(page).toHaveURL(/q=ollama/);
  await expect(page.locator("#project-search")).toHaveValue("ollama");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator("#project-dialog")).toBeHidden();
});

test("Back and forward move between the front door, results, and a record", async ({ page }) => {
  await page.goto("/");
  await openCollection(page, "packs");
  await page.locator('#pack-grid [data-pack="agent-toolkit"]').click();
  await expect(page.locator("#pack-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#pack-dialog")).toBeHidden();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#front-door")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#packs-directory-panel")).toBeVisible();
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Agent packs \d/);
  await page.goForward();
  await expect(page.locator("#pack-dialog")).toBeVisible();
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
  await expect(page.locator("#project-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#project-dialog")).toBeHidden();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#comparison-dialog")).toBeHidden();
});

test("a restored query with no sort lands on Best match", async ({ page }) => {
  await page.goto("/?collection=inference&q=router");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("match");
});

// A sort chosen before typing is what clearing the query gives back, but
// beside a query the URL names only a sort the reader chose since typing,
// so a reload forgets the earlier one (BACKLOG, Phase 1 leftover).
test.fixme("a sort chosen before typing survives a reload and returns when the query is cleared", async ({ page }) => {
  await page.goto("/?collection=inference");
  await page.locator("#inference-sort-filter").selectOption("name");
  await page.locator("#inference-search").fill("router");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("match");
  await page.reload();
  await page.locator("#inference-search").fill("");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("name");
  await expect(page).toHaveURL(/sort=name/);
});
