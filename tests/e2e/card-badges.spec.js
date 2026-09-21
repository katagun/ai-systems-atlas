const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadgeGlossary, cardBadges } = require("../../web/app-core.js");

// Expectations come from the same published files and resolver the page uses,
// and each fixture asserts the property it was chosen for, so a data change
// fails with a clear message instead of a confusing locator timeout.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const projects = read("projects.json").projects;
const runtimes = read("local-runtimes.json").runtimes;
const reviewedModels = read("app/models.json").models.filter(model => model.review_status === "reviewed");

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

// OpenClaw matches all five agent-system badges, so its card shows the whole set.
const openclaw = byId(projects, "openclaw");
// Chroma matches no memory-system badge, so its card has no badge row.
const chroma = byId(projects, "chroma");
const ollama = byId(runtimes, "ollama");
const reviewedModel = byId(reviewedModels, "model-alibaba-qwen2-5-coder-0-5b");

test("an agent-system card shows every matching badge as an emblem in set order", async ({ page }) => {
  const expected = cardBadges("system", openclaw);
  expect(expected.map(badge => badge.name)).toEqual(["Local-first", "Sandboxed execution", "Browser control", "MCP", "Self-hostable"]);

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

test("a card without badges omits the row and keeps its footer at the bottom", async ({ page }) => {
  expect(cardBadges("system", chroma)).toEqual([]);

  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(chroma.name);
  const card = page.locator('#project-grid .project-card:has([data-project="chroma"])');
  await expect(card).toBeVisible();
  await expect(card.locator(".card-badges")).toHaveCount(0);
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

test("a reviewed-model card shows no badges and keeps its attributed models.dev modality", async ({ page }) => {
  expect(cardBadges("model", reviewedModel)).toEqual([]);

  await page.goto("/?view=models");
  await page.locator("#model-search").fill(reviewedModel.name);
  const card = page.locator(`#model-grid .model-card:has([data-model="${reviewedModel.id}"])`);
  await expect(card.locator(".card-badges")).toHaveCount(0);
  const meta = card.locator(".card-source-meta");
  await expect(meta).toContainText("→");
  await expect(meta).toHaveAttribute("title", "From models.dev source metadata, not Atlas reviewed");
  await expect(meta.locator(".visually-hidden")).toHaveText("From models.dev: ");
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

test("the Taxonomy view defines every card badge and where it appears", async ({ page }) => {
  const glossary = cardBadgeGlossary();

  await page.goto("/?view=taxonomy");
  const group = page.locator("#taxonomy-content .taxonomy-group").filter({ has: page.locator("h2", { hasText: /^Card badges$/ }) });
  await expect(group.locator(".taxonomy-item")).toHaveCount(glossary.length);
  for (const [index, entry] of glossary.entries()) {
    const item = group.locator(".taxonomy-item").nth(index);
    await expect(item.locator("strong")).toHaveText(entry.name);
    await expect(item.locator("p")).toHaveText(`${entry.definition} Shown on: ${entry.scopes.join(", ")}.`);
  }
});
