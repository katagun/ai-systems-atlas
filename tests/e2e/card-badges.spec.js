const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadgeGlossary, cardBadges, BADGE_FAMILIES } = require("../../web/app-core.js");
const { searchAll } = require("./helpers/landing");
const { chooseFinderGoal } = require("./helpers/finder");
const { filterControl, recordView, search, searchBox } = require("./helpers/results");

// Expectations come from the same published files and resolver the page uses,
// and each fixture asserts the property it was chosen for, so a data change
// fails with a clear message instead of a confusing locator timeout.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const projects = read("projects.json").projects;
const runtimes = read("local-runtimes.json").runtimes;
const allModels = read("app/models.json").models;
const reviewedModels = allModels.filter(model => model.review_status === "reviewed");

const byId = (records, id) => {
  const record = records.find(candidate => candidate.id === id);
  if (!record) throw new Error(`fixture ${id} is no longer published; pick another record with the property its comment states`);
  return record;
};
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A badge's text always contains its name followed by the hidden ": definition";
// lettered accelerator badges (apple-metal, amd-rocm, npu) also draw letters
// inside the emblem itself, which precede that text, so the pattern is not
// anchored to the start.
const namePatterns = badges => badges.map(badge => new RegExp(escapeRegExp(badge.name) + ":"));

// OpenClaw matches all five agent-system trait badges, so its card shows its
// type badge and the whole trait set: the six-badge cap, exactly.
const openclaw = byId(projects, "openclaw");
// Chroma matches no memory-system trait badge, so its card shows only its type.
const chroma = byId(projects, "chroma");
const ollama = byId(runtimes, "ollama");
// A language model with downloadable weights only: its type and one mode.
const reviewedModel = byId(reviewedModels, "model-alibaba-qwen2-5-coder-0-5b");
// A multimodal model carrying all three distribution modes.
const allModesModel = byId(reviewedModels, "model-alibaba-qwen3-8-27b");
const importedModel = byId(allModels, "model-alibaba-qwen-flash");

test("an agent-system card leads with its type and shows every matching badge as an emblem in set order", async ({ page }) => {
  const expected = cardBadges("system", openclaw);
  expect(expected.map(badge => badge.name)).toEqual(["Agent system", "Local-first", "Sandboxed execution", "Browser control", "MCP", "Self-hostable"]);

  await page.goto("/?collection=systems");
  await search(page, openclaw.name);
  const card = page.locator('#project-grid .project-card:has([data-project="openclaw"])');
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  await expect(card.locator(".card-badge svg.badge-emblem")).toHaveCount(expected.length);
  expect(await card.locator(".card-badge").evaluateAll(items => items.map(item => item.dataset.family))).toEqual(expected.map(badge => badge.family));
  // Emblems are icon-only: the badge carries no visible label of its own,
  // only the svg emblem and the visually hidden name/definition text.
  const first = card.locator(".card-badge").first();
  const structure = await first.evaluate(item => ({
    children: [...item.children].map(child => child.getAttribute("class")),
    directText: [...item.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean),
  }));
  expect(structure.children).toEqual(["badge-emblem", "visually-hidden"]);
  expect(structure.directText).toEqual([]);
  await expect(card.locator(".tags")).toHaveCount(0);
});

test("a card with no trait badge still shows its type badge and keeps its footer at the bottom", async ({ page }) => {
  expect(cardBadges("system", chroma).map(badge => badge.name)).toEqual(["Memory system"]);

  await page.goto("/?collection=systems");
  await search(page, chroma.name);
  const card = page.locator('#project-grid .project-card:has([data-project="chroma"])');
  await expect(card).toBeVisible();
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(cardBadges("system", chroma)));
  await expect(card.locator(".card-badge")).toHaveAttribute("data-family", "type");
  // Wait out web-font swap (font-display: swap) and the page's own
  // smooth-scroll settling (html { scroll-behavior: smooth }), so the two
  // boundingBox() reads below land after layout has fully settled instead of
  // straddling a reflow or an in-flight scroll animation.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY;
    const check = () => requestAnimationFrame(() => {
      if (window.scrollY === last) return resolve();
      last = window.scrollY;
      check();
    });
    check();
  }));
  const cardBox = await card.boundingBox();
  const footerBox = await card.locator(".card-footer").boundingBox();
  // The card's bottom padding is 1.4rem; anything more means the footer floated up.
  expect(cardBox.y + cardBox.height - (footerBox.y + footerBox.height)).toBeLessThanOrEqual(24);
});

test("badges explain themselves without adding tab stops", async ({ page }) => {
  const [first] = cardBadges("system", openclaw);

  await page.goto("/?collection=systems");
  await search(page, openclaw.name);
  const badges = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badges');
  await expect(badges.locator(".card-badge").first()).not.toHaveAttribute("title", /.*/);
  await expect(badges.locator(".card-badge .visually-hidden").first()).toHaveText(`${first.name}: ${first.definition}`);
  await expect(badges.locator("a, button, [tabindex]")).toHaveCount(0);
});

test("a record shows the same badges in its collection grid and in All", async ({ page }) => {
  const runtimeBadges = cardBadges("runtime", ollama);
  expect(runtimeBadges.length).toBeGreaterThan(0);

  await page.goto("/");
  await searchAll(page, openclaw.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-project="openclaw"]) .card-badge'))
    .toHaveText(namePatterns(cardBadges("system", openclaw)));

  await searchAll(page, ollama.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));

  await page.goto("/?collection=runtimes");
  await search(page, ollama.name);
  await expect(page.locator('#runtime-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));
});

test("a reviewed-model card has no role pill and shows its distribution modes as badges, plus its attributed models.dev modality", async ({ page }) => {
  const expected = cardBadges("model", reviewedModel);
  expect(expected.map(badge => badge.name)).toEqual(["Language model", "Downloadable weights"]);

  await page.goto("/?collection=models");
  await search(page, reviewedModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${reviewedModel.id}"])`);
  await expect(card.locator(".role-badge")).toHaveCount(0);
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  expect(await card.locator(".card-badge").evaluateAll(items => items.map(item => item.dataset.family))).toEqual(["type", "control"]);
  const meta = card.locator(".card-source-meta");
  await expect(meta).toContainText("→");
  await expect(meta).toHaveAttribute("title", "From models.dev source metadata, not Atlas reviewed");
  await expect(meta.locator(".visually-hidden")).toHaveText("From models.dev: ");
});

test("a reviewed-model card carrying every distribution mode shows its type and all three modes, in taxonomy order", async ({ page }) => {
  const expected = cardBadges("model", allModesModel);
  expect(expected.map(badge => badge.name)).toEqual(["Multimodal language model", "Downloadable weights", "Developer API", "Third-party hosting"]);

  await page.goto("/?collection=models");
  await search(page, allModesModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${allModesModel.id}"])`);
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  expect(await card.locator(".card-badge").evaluateAll(items => items.map(item => item.dataset.family))).toEqual(["type", "control", "platform", "platform"]);
});

test("an imported models.dev card keeps its role pill and shows only its source-record badge", async ({ page }) => {
  expect(cardBadges("model", importedModel).map(badge => badge.name)).toEqual(["Source record"]);

  await page.goto("/?collection=models");
  await search(page, importedModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${importedModel.id}"])`);
  await expect(card.locator(".role-badge")).toHaveText("Imported metadata · Not Atlas reviewed");
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(cardBadges("model", importedModel)));
});

// Every grid, including the collections that had no trait badges, now leads
// each card with its one type badge; the Finder shortlist carries them too.
test("every card in every grid and the Finder shortlist leads with exactly one type badge", async ({ page }) => {
  const grids = [
    ["/?collection=systems", "#project-grid"],
    ["/?collection=inference", "#inference-grid"],
    ["/?collection=runtimes", "#runtime-grid"],
    ["/?collection=packs", "#pack-grid"],
    ["/?collection=all", "#all-directory-grid"],
    ["/?collection=models", "#model-grid"],
    ["/?collection=specifications", "#specification-grid"],
    ["/?collection=labs", "#lab-grid"],
    ["/?collection=robots", "#robot-grid"],
  ];
  for (const [url, grid] of grids) {
    await page.goto(url);
    const cards = page.locator(`${grid} .project-card`);
    await expect(cards.first()).toBeVisible();
    const rows = await cards.evaluateAll(items => items.map(item => [...item.querySelectorAll(".card-badge")].map(badge => badge.dataset.family)));
    expect(rows.length, `${grid} renders cards`).toBeGreaterThan(0);
    for (const [index, families] of rows.entries()) {
      expect(families[0], `${grid} card ${index} leads with its type`).toBe("type");
      expect(families.filter(family => family === "type"), `${grid} card ${index} shows one type badge`).toHaveLength(1);
    }
  }

  // A system shortlist and an inference shortlist. The Finder is one screen of
  // goal tiles, so each is a single goal rather than a direction and a goal.
  for (const [label, goal] of [["first", "personal_knowledge"], ["inference_service", "model_developer_api"]]) {
    await page.goto("/?view=finder");
    const shortlist = await chooseFinderGoal(page, goal);
    await expect(shortlist.first()).toBeVisible();
    const finderRows = await shortlist.evaluateAll(items => items.map(item => [...item.querySelectorAll(".card-badge")].map(badge => badge.dataset.family)));
    expect(finderRows.length).toBeGreaterThan(0);
    for (const families of finderRows) expect(families[0], `${label} shortlist leads with a type badge`).toBe("type");
  }
});

test("a reviewed-model card shows the same badges in the Models grid and in the mixed All directory", async ({ page }) => {
  const expected = cardBadges("model", reviewedModel);

  await page.goto("/");
  await searchAll(page, reviewedModel.name);
  const mixedCard = page.locator(`#all-directory-grid .project-card:has([data-model="${reviewedModel.id}"])`);
  await expect(mixedCard.locator(".role-badge")).toHaveCount(0);
  await expect(mixedCard.locator(".card-badge")).toHaveText(namePatterns(expected));
});

for (const colorScheme of ["light", "dark"]) {
  test(`badges read as a different kind of chip from the source pill in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?collection=systems");
    await search(page, openclaw.name);
    const card = page.locator('#project-grid .project-card:has([data-project="openclaw"])');
    const style = locator => locator.evaluate(element => {
      const computed = getComputedStyle(element);
      return { color: computed.color, background: computed.backgroundColor, border: computed.borderTopColor };
    });
    const badge = await style(card.locator(".card-badge").first());
    const source = await style(card.locator(".source-badge"));
    expect(badge.background).toBe("rgba(0, 0, 0, 0)");
    expect(source.background).not.toBe(badge.background);
    // The emblem reads as a framed icon, not a flat chip: its frame is
    // filled a soft tint of the family colour while its outline stays solid.
    const frame = await card.locator(".card-badge .badge-frame").first().evaluate(element => {
      const computed = getComputedStyle(element);
      return { fill: computed.fill, stroke: computed.stroke };
    });
    expect(frame.fill).not.toBe(frame.stroke);
  });
}

test("hovering an emblem explains it and Escape dismisses it", async ({ page }) => {
  const [first] = cardBadges("system", openclaw);
  // Arrive with the query in the URL rather than typing it. Escape in a
  // focused search box also clears it, and the repainted grid can put another
  // card's emblem under the resting pointer, whose tooltip then opens: Linux
  // CI's wider text did exactly that. The restored query loads the search
  // index, whose repaint must land before the hover, not between it and the key.
  // searchIndexes is an app.js global.
  /* global searchIndexes */
  await page.goto(`/?collection=systems&q=${encodeURIComponent(openclaw.name)}`);
  await page.waitForFunction(() => searchIndexes.systems !== undefined);
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  const tooltip = page.locator("#badge-tooltip");
  await expect(tooltip).toBeHidden();
  // The emblem sits below the fold, so Playwright's own hover scrolls it
  // into view over the page's `scroll-behavior: smooth`; that animation
  // races the hover's pointerover against this file's "scroll hides the
  // tooltip" behavior. Scroll it into view and let the animation settle
  // first, the same way the footer test below waits out smooth-scroll.
  await emblem.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY;
    const check = () => requestAnimationFrame(() => {
      if (window.scrollY === last) return resolve();
      last = window.scrollY;
      check();
    });
    check();
  }));
  // Where the pointer comes to rest: the hover aims at the emblem's centre
  // before the card lifts.
  const box = await emblem.boundingBox();
  const rest = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await emblem.hover();
  await expect(tooltip).toBeVisible();
  // The first emblem is the card's type badge, so the tooltip names the Type family.
  expect(first.family).toBe("type");
  await expect(tooltip.locator(".badge-tooltip-family")).toHaveText(BADGE_FAMILIES[first.family].name);
  await expect(tooltip.locator(".badge-tooltip-name")).toHaveText(first.name);
  await expect(tooltip.locator(".badge-tooltip-definition")).toHaveText(first.definition);
  await expect(tooltip).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  // The card's 4px hover lift slides its emblem under the resting pointer,
  // and a repaint or a clamped scroll does the same. Each hands the emblem a
  // fresh pointerover at the resting spot, which is how Linux CI saw the
  // tooltip return after Escape. The dismissal survives it, and only a real
  // move reopens it.
  await emblem.dispatchEvent("pointerover", { bubbles: true, pointerType: "mouse", clientX: rest.x, clientY: rest.y });
  await expect(tooltip).toBeHidden();
  await emblem.dispatchEvent("pointerover", { bubbles: true, pointerType: "mouse", clientX: rest.x + 6, clientY: rest.y });
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".badge-tooltip-name")).toHaveText(first.name);
  await expect(searchBox(page, "systems")).toHaveValue(openclaw.name);
});

// On a phone the Key chip is fixed over the bottom of the screen, and while
// the search box holds a query the chips row pushes the first card's emblems
// down to it. A tap on an emblem under the chip scrolls first, and a scroll
// closes the tooltip the tap opens, so the emblem is lifted clear of the
// chip, instantly, before it is tapped.
async function liftClearOfKeyChip(page, emblem) {
  const overlap = await emblem.evaluate(element => {
    const chip = document.querySelector("#badge-legend-chip");
    return chip.hidden ? 0 : element.getBoundingClientRect().bottom - chip.getBoundingClientRect().top + 8;
  });
  if (overlap > 0) await page.evaluate(top => window.scrollBy({ top, behavior: "instant" }), overlap);
  // The scroll event lands a frame later, and must land before the tap.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("tapping an emblem toggles the tooltip and an outside tap closes it", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/?collection=systems");
  await search(page, openclaw.name);
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  const tooltip = page.locator("#badge-tooltip");
  await liftClearOfKeyChip(page, emblem);
  await emblem.tap();
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator("#systems-directory-panel .result-row").tap();
  await expect(tooltip).toBeHidden();
  await context.close();
});

test("repainting the grid dismisses a tapped tooltip", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/?collection=systems");
  await search(page, openclaw.name);
  const tooltip = page.locator("#badge-tooltip");
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  await liftClearOfKeyChip(page, emblem);
  await emblem.tap();
  await expect(tooltip).toBeVisible();
  // A touch reader types while the tooltip is up; the grid repaints with the
  // same cards, so nothing scrolls or moves under a pointer to hide it.
  await searchBox(page, "systems").evaluate(input => {
    input.value = input.value.slice(0, -1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator('#project-grid [data-project="openclaw"]')).not.toHaveCount(0);
  await expect(tooltip).toBeHidden();
  await context.close();
});

test("Taxonomy lists every badge under its family with its emblem", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  const glossary = cardBadgeGlossary();
  for (const [id, family] of Object.entries(BADGE_FAMILIES)) {
    const group = page.locator(`#taxonomy-content [data-badge-family="${id}"]`);
    await expect(group.locator("h2")).toHaveText(`Card badges · ${family.name}`);
    await expect(group.locator(".taxonomy-lede")).toHaveText(family.meaning);
    const expected = glossary.filter(entry => entry.family === id);
    await expect(group.locator(".taxonomy-item strong")).toHaveText(expected.map(entry => entry.name));
    await expect(group.locator(".taxonomy-item p")).toHaveText(expected.map(entry => `${entry.definition} Shown on: ${entry.scopes.join(", ")}.`));
    await expect(group.locator(".taxonomy-item svg.badge-emblem")).toHaveCount(expected.length);
  }
  await expect(page.locator("#taxonomy-content [data-badge-family] .taxonomy-item")).toHaveCount(glossary.length);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping an emblem opens its tooltip and neither opens the record nor changes the URL", async ({ page }) => {
    await page.goto("/?collection=systems");
    await search(page, "Aider");
    const before = page.url();
    await page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badge').first().tap();
    await expect(page.locator("#badge-tooltip")).toBeVisible();
    await expect(recordView(page, "system")).not.toBeVisible();
    expect(page.url()).toBe(before);
  });
});

for (const width of [320, 1440]) {
  test(`badge explanations support slow pointer travel and keyboard disclosure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?collection=systems&q=${encodeURIComponent(openclaw.name)}`);
    await page.waitForFunction(() => searchIndexes.systems !== undefined);
    await page.addStyleTag({ content: "html { scroll-behavior: auto !important; } .project-card { transition: none !important; transform: none !important; }" });
    const card = page.locator('#project-grid .project-card:has([data-project="openclaw"])');
    const emblem = card.locator('[data-badge="mcp"]');
    await emblem.scrollIntoViewIfNeeded();
    await emblem.hover();
    const tooltip = page.locator("#badge-tooltip");
    await expect(tooltip).toBeVisible();
    const a = await emblem.boundingBox();
    const b = await tooltip.boundingBox();
    const below = b.y >= a.y + a.height;
    const gapY = below ? (a.y + a.height + b.y) / 2 : (b.y + b.height + a.y) / 2;
    await page.mouse.move(a.x + a.width / 2, gapY);
    // Deliberately pause in the gap: a grace timer alone is insufficient.
    await page.waitForTimeout(600);
    await expect(tooltip).toBeVisible();
    await tooltip.locator(".badge-tooltip-definition").hover();
    await page.waitForTimeout(600);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    const help = card.locator(".badge-help");
    await help.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(help).toHaveAttribute("open", "");
    await expect(help.locator("dt")).toHaveText(cardBadges("system", openclaw).map(badge => badge.name));
    await expect(help.locator("dd")).toHaveText(cardBadges("system", openclaw).map(badge => badge.definition));
    await expect(recordView(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(help).not.toHaveAttribute("open");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("evidence review attention is consistent in Systems, All, Packs and Finder", async ({ page }) => {
  await page.route("**/app/systems.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    for (const record of payload.systems) record.license_review_status = "review_required";
    await route.fulfill({ response, json: payload });
  });
  for (const [collection, grid] of [["systems", "#project-grid"], ["all", "#all-directory-grid"], ["packs", "#pack-grid"]]) {
    await page.goto(`/?collection=${collection}`);
    const cards = page.locator(`${grid} .project-card:has([data-project])`);
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      await expect(card.locator(".review-badge")).toHaveText("Evidence review");
      await expect(card.locator(".source-badge")).not.toHaveText("");
      await expect(card.locator('.card-badge[data-name="Evidence review"]')).toHaveCount(0);
    }
  }
  await page.goto("/?view=finder");
  const results = await chooseFinderGoal(page, "personal_knowledge");
  await expect(results.first()).toBeVisible();
  for (const result of await results.all()) await expect(result.locator(".review-badge")).toHaveText("Evidence review");
});

test("model artifact terms use scoped names and imported licenses stay attributed", async ({ page }) => {
  await page.goto(`/?collection=models&q=${encodeURIComponent(reviewedModel.name)}`);
  const card = page.locator(`#model-grid .model-card:has([data-model="${reviewedModel.id}"])`);
  const categories = read("taxonomy.json").source_models;
  const expected = categories.find(item => item.id === reviewedModel.source_model).model_name;
  await expect(card.locator(".source-badge")).toHaveText(expected);
  await expect(filterControl(page, "models", "sourceModel").locator(`option[value="${reviewedModel.source_model}"]`)).toHaveText(expected);
  await card.locator(".card-open").click();
  await expect(recordView(page)).toContainText(`Artifact licensing: ${expected}`);
  await expect(recordView(page)).toContainText("do not assess training code or training data openness");
  await page.goto(`/?collection=all&q=${encodeURIComponent(reviewedModel.name)}`);
  await expect(page.locator(`#all-directory-grid .project-card:has([data-model="${reviewedModel.id}"]) .source-badge`)).toHaveText(expected);
});

test("Taxonomy explains navigation symbols separately from card facts", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  const group = page.locator(".taxonomy-group").filter({ has: page.getByRole("heading", { name: "Collection symbols", exact: true }) });
  await expect(group.locator(".taxonomy-item")).toHaveCount(9);
  await expect(group).toContainText("The bot head indicates the agent ecosystem");
  await expect(group).toContainText("each record has its own form-factor badge");
});
