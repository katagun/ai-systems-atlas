const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadges, flagEmblemText, badgeLegend } = require("../../web/app-core.js");
const { searchAll } = require("./helpers/landing");
const { recordView, search } = require("./helpers/results");

// No published model carries a flag until the ADR 042 backfill lands, so these
// tests serve one, shaped as the payload builder shapes it: boot carries each
// entry's kind and status plus a found statement's term, domains,
// determination, and scope; the model's detail file carries the whole entry.
// The fixture quotes no real developer.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const taxonomy = read("taxonomy.json");
const allModels = read("app/models.json").models;
const byId = id => {
  const record = allModels.find(candidate => candidate.id === id);
  if (!record) throw new Error(`fixture ${id} is no longer published; pick another record of the same kind`);
  return record;
};
const FLAGGED = byId("model-anthropic-claude-sonnet-4-6");
const CHECKED = byId("model-alibaba-qwen2-5-coder-0-5b");
const UNEXAMINED = byId("model-alibaba-qwen3-235b-a22b-instruct-2507");
const IMPORTED = byId("model-alibaba-qwen-flash");

const FOUND = {
  kind: "maker_risk_safeguards", status: "statement_found", tier_term: "Fixture Level 3",
  domains: ["cyber", "bio_chem"], determination: "precautionary", scope: "weights",
  statement: "Fixture statement for the browser suite; it quotes no real developer.",
  url: "https://example.com/fixture-system-card", content_sha256: "a".repeat(64),
  verified_at: "2026-09-01", research_confidence: "high",
};
const NONE = { kind: "maker_risk_safeguards", status: "no_statement_found", url: "https://example.com/fixture-framework", verified_at: "2026-09-01", research_confidence: "medium" };
const BOOT_KEYS = {
  statement_found: ["kind", "status", "tier_term", "domains", "determination", "scope"],
  no_statement_found: ["kind", "status"],
};
const bootEntry = entry => Object.fromEntries(BOOT_KEYS[entry.status].map(key => [key, entry[key]]));

async function serveFlags(page, entries, { detail = true } = {}) {
  await page.route("**/app/models.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const models = payload.models.map(model => entries[model.id]
      ? { ...model, flags: [bootEntry(entries[model.id])] }
      : model);
    await route.fulfill({ response, json: { ...payload, models } });
  });
  for (const [id, entry] of Object.entries(entries)) {
    await page.route(`**/app/detail/model/${id}.json*`, async route => {
      if (!detail) return route.abort();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, flags: [entry] } });
    });
  }
}

const modelCard = (page, record) => page.locator(`#model-grid .model-card:has([data-model="${record.id}"])`);
const FLAG = ".card-reviewed-flag";
const flagName = "“Fixture Level 3” · Precautionary";

async function showModel(page, record) {
  await page.goto("/?collection=models");
  await search(page, record.name);
  await expect(modelCard(page, record)).toBeVisible();
}

// Hover races the page's smooth scrolling (see card-badges.spec.js), so scroll
// the emblem into view and let the scroll settle first.
async function settleOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
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
}

test("a found statement sits second in a reviewed-model card's emblem row, after the type and outside the badge cap", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await showModel(page, FLAGGED);
  const card = modelCard(page, FLAGGED);
  const badges = cardBadges("model", FLAGGED);
  const row = card.locator(".card-badges > li");
  await expect(row.nth(0)).toHaveAttribute("data-family", "type");
  await expect(row.nth(1)).toHaveAttribute("data-family", "flags");
  await expect(row).toHaveCount(badges.length + 1);
  await expect(card.locator(FLAG)).toHaveCount(1);
  await expect(card.locator(`.card-badge:not(${FLAG})`)).toHaveCount(badges.length);
  const expected = flagEmblemText(FOUND, FLAGGED.developer, taxonomy);
  await expect(card.locator(`${FLAG} .visually-hidden`)).toHaveText(expected.sentence);
  await expect(card.locator(`${FLAG} svg.badge-emblem`)).toHaveCount(1);
  await expect(card.locator(FLAG)).not.toHaveAttribute("tabindex");
  await expect(card.locator(FLAG)).toHaveAttribute("data-flag-record", FLAGGED.id);
  // Badge meanings lists the emblems in the row's order, the flag second.
  const [type, ...rest] = badges;
  await expect(card.locator(".badge-help dt")).toHaveText([type.name, `Maker risk statement · ${flagName}`, ...rest.map(badge => badge.name)]);
  await expect(card.locator(".badge-help dd")).toHaveText([type.definition, expected.sentence, ...rest.map(badge => badge.definition)]);
});

test("hovering the flag shows the family, the developer's term, and the sentence", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await showModel(page, FLAGGED);
  const emblem = modelCard(page, FLAGGED).locator(FLAG);
  const expected = flagEmblemText(FOUND, FLAGGED.developer, taxonomy);
  await expect(emblem.locator(".visually-hidden")).toHaveText(expected.sentence);
  await settleOn(page, emblem);
  await emblem.hover();
  const tooltip = page.locator("#badge-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".badge-tooltip-family")).toHaveText("Maker risk statement");
  await expect(tooltip.locator(".badge-tooltip-name")).toHaveText(flagName);
  await expect(tooltip.locator(".badge-tooltip-definition")).toHaveText(expected.sentence);
  await expect(tooltip).not.toContainText(/high risk|dangerous/i);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});

test("the flag paints its full words from boot without fetching the model's detail", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND }, { detail: false });
  let flaggedDetailRequests = 0;
  page.on("request", request => { if (request.url().includes(`/app/detail/model/${FLAGGED.id}.json`)) flaggedDetailRequests += 1; });
  await showModel(page, FLAGGED);
  const flag = modelCard(page, FLAGGED).locator(FLAG);
  await expect(flag.locator(".visually-hidden")).toHaveText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(flag).toHaveAttribute("data-name", flagName);
  expect(flaggedDetailRequests).toBe(0);
});

test("no statement, not examined, and imported models paint no flag", async ({ page }) => {
  await serveFlags(page, { [CHECKED.id]: NONE, [IMPORTED.id]: FOUND });
  await showModel(page, CHECKED);
  await expect(modelCard(page, CHECKED).locator(".card-badges")).toHaveCount(1);
  await expect(modelCard(page, CHECKED).locator(FLAG)).toHaveCount(0);
  await search(page, UNEXAMINED.name);
  await expect(modelCard(page, UNEXAMINED)).toBeVisible();
  await expect(modelCard(page, UNEXAMINED).locator(FLAG)).toHaveCount(0);
  // Even a flag entry on an imported row paints nothing: it carries no Atlas
  // conclusion, only its Source record badge.
  await search(page, IMPORTED.name);
  await expect(modelCard(page, IMPORTED)).toBeVisible();
  await expect(modelCard(page, IMPORTED).locator(".card-badges")).toHaveCount(1);
  await expect(modelCard(page, IMPORTED).locator(FLAG)).toHaveCount(0);
});

test("the mixed All grid shows the same flag in the same place", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await page.goto("/");
  await searchAll(page, FLAGGED.name);
  const card = page.locator(`#all-directory-grid .project-card:has([data-model="${FLAGGED.id}"])`);
  await expect(card.locator(".card-badges > li").nth(0)).toHaveAttribute("data-family", "type");
  await expect(card.locator(".card-badges > li").nth(1)).toHaveAttribute("data-family", "flags");
  await expect(card.locator(`${FLAG} .visually-hidden`)).toHaveText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
});

test("the Models legend lists the flag after the type badges and the All legend names its family", async ({ page }) => {
  const models = badgeLegend("models").badges;
  const types = models.filter(badge => badge.family === "type").length;
  expect(models[types].id).toBe("maker_risk_safeguards");
  await page.goto("/?collection=models");
  const flag = page.locator("#badge-legend-items > li").nth(types);
  await expect(flag).toHaveAttribute("data-family", "flags");
  await expect(flag).toContainText("Maker risk statement");
  await page.goto("/?collection=all");
  await expect(page.locator("#badge-legend-items > li").nth(1)).toContainText("Maker risk statement");
});

test("Taxonomy lists reviewed flags in their own group with the emblem", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  const group = page.locator("#taxonomy-content [data-reviewed-flags]");
  await expect(group.locator("h2")).toHaveText("Reviewed flags");
  await expect(group.locator(".taxonomy-item strong")).toHaveText(["Maker risk statement"]);
  await expect(group.locator('.taxonomy-item[data-family="flags"] svg.badge-emblem')).toHaveCount(1);
  for (const heading of ["Reviewed flag states", "Risk areas", "What the developer states", "What a statement covers"]) {
    await expect(page.locator("#taxonomy-content h2", { hasText: heading })).toHaveCount(1);
  }
  await expect(page.locator("#taxonomy-content")).toContainText("Not examined");
  await expect(page.locator(`#taxonomy-content [data-badge-family] ${FLAG}, #taxonomy-content [data-badge-family] [data-family="flags"]`)).toHaveCount(0);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping the flag opens its tooltip and neither opens the record nor changes the URL", async ({ page }) => {
    await serveFlags(page, { [FLAGGED.id]: FOUND });
    await showModel(page, FLAGGED);
    const before = page.url();
    await modelCard(page, FLAGGED).locator(FLAG).tap();
    await expect(page.locator("#badge-tooltip")).toBeVisible();
    await expect(page.locator("#badge-tooltip .badge-tooltip-family")).toHaveText("Maker risk statement");
    await expect(recordView(page, "model")).not.toBeVisible();
    expect(page.url()).toBe(before);
  });
});
