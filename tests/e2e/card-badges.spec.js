const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadgeGlossary, cardBadges, BADGE_FAMILIES } = require("../../web/app-core.js");

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
  await page.locator("#project-search").fill(openclaw.name);
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
  await page.locator("#project-search").fill(chroma.name);
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
  await page.locator("#project-search").fill(openclaw.name);
  const badges = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badges');
  await expect(badges.locator(".card-badge").first()).not.toHaveAttribute("title", /.*/);
  await expect(badges.locator(".card-badge .visually-hidden").first()).toHaveText(`${first.name}: ${first.definition}`);
  await expect(badges.locator("a, button, [tabindex]")).toHaveCount(0);
});

test("a record shows the same badges in its collection grid and in All", async ({ page }) => {
  const runtimeBadges = cardBadges("runtime", ollama);
  expect(runtimeBadges.length).toBeGreaterThan(0);

  await page.goto("/");
  await page.locator("#all-directory-search").fill(openclaw.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-project="openclaw"]) .card-badge'))
    .toHaveText(namePatterns(cardBadges("system", openclaw)));

  await page.locator("#all-directory-search").fill(ollama.name);
  await expect(page.locator('#all-directory-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));

  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-search").fill(ollama.name);
  await expect(page.locator('#runtime-grid .project-card:has([data-local-runtime="ollama"]) .card-badge'))
    .toHaveText(namePatterns(runtimeBadges));
});

test("a reviewed-model card has no role pill and shows its distribution modes as badges, plus its attributed models.dev modality", async ({ page }) => {
  const expected = cardBadges("model", reviewedModel);
  expect(expected.map(badge => badge.name)).toEqual(["Language model", "Downloadable weights"]);

  await page.goto("/?view=models");
  await page.locator("#model-search").fill(reviewedModel.name);
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

  await page.goto("/?view=models");
  await page.locator("#model-search").fill(allModesModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${allModesModel.id}"])`);
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  expect(await card.locator(".card-badge").evaluateAll(items => items.map(item => item.dataset.family))).toEqual(["type", "control", "platform", "platform"]);
});

test("an imported models.dev card keeps its role pill and shows only its source-record badge", async ({ page }) => {
  expect(cardBadges("model", importedModel).map(badge => badge.name)).toEqual(["Source record"]);

  await page.goto("/?view=models");
  await page.locator("#model-search").fill(importedModel.name);
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
    ["/", "#all-directory-grid"],
    ["/?view=models", "#model-grid"],
    ["/?view=specifications", "#specification-grid"],
    ["/?view=labs", "#lab-grid"],
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

  // A system shortlist (the first direction) and an inference shortlist.
  for (const direction of ["", "inference_service"]) {
    await page.goto("/?view=finder");
    const first = direction ? `#finder-content .finder-choice[data-finder-value="${direction}"]` : "#finder-content .finder-choice";
    await page.locator(first).first().click();
    for (let step = 0; step < 2; step += 1) await page.locator("#finder-content .finder-choice").first().click();
    const shortlist = page.locator(".finder-result");
    await expect(shortlist.first()).toBeVisible();
    const finderRows = await shortlist.evaluateAll(items => items.map(item => [...item.querySelectorAll(".card-badge")].map(badge => badge.dataset.family)));
    expect(finderRows.length).toBeGreaterThan(0);
    for (const families of finderRows) expect(families[0], `${direction || "first"} shortlist leads with a type badge`).toBe("type");
  }
});

test("a reviewed-model card shows the same badges in the Models grid and in the mixed All directory", async ({ page }) => {
  const expected = cardBadges("model", reviewedModel);

  await page.goto("/");
  await page.locator("#all-directory-search").fill(reviewedModel.name);
  const mixedCard = page.locator(`#all-directory-grid .project-card:has([data-model="${reviewedModel.id}"])`);
  await expect(mixedCard.locator(".role-badge")).toHaveCount(0);
  await expect(mixedCard.locator(".card-badge")).toHaveText(namePatterns(expected));
});

for (const colorScheme of ["light", "dark"]) {
  test(`badges read as a different kind of chip from the source pill in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/?collection=systems");
    await page.locator("#project-search").fill(openclaw.name);
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
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
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
});

test("tapping an emblem toggles the tooltip and an outside tap closes it", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  const tooltip = page.locator("#badge-tooltip");
  await emblem.tap();
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator("h1").first().tap();
  await expect(tooltip).toBeHidden();
  await context.close();
});

test("repainting the grid dismisses a tapped tooltip", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const tooltip = page.locator("#badge-tooltip");
  await page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first().tap();
  await expect(tooltip).toBeVisible();
  // A touch reader types while the tooltip is up; the grid repaints with the
  // same cards, so nothing scrolls or moves under a pointer to hide it.
  await page.locator("#project-search").evaluate(input => {
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
    await page.locator("#project-search").fill("Aider");
    const before = page.url();
    await page.locator('#project-grid .project-card:has([data-project="aider"]) .card-badge').first().tap();
    await expect(page.locator("#badge-tooltip")).toBeVisible();
    await expect(page.locator("#project-dialog")).not.toBeVisible();
    expect(page.url()).toBe(before);
  });
});
