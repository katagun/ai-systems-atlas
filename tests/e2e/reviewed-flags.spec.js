const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadges, flagEmblemText, badgeLegend } = require("../../web/app-core.js");
const { searchAll } = require("./helpers/landing");
const { recordHeading, recordView, search } = require("./helpers/results");

// These tests serve their own flags rather than rely on a model's published
// ones, shaped as the payload builder shapes them: boot carries each entry's
// kind and status plus a found statement's term, domains, determination, and
// scope; the model's detail file carries the whole entry. The fixture quotes no
// real developer.
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

// Each served record carries exactly the given entry, and UNEXAMINED always
// carries none (null), so the tests hold once the backfill flags real records.
const withFlags = (record, entry) => {
  const rest = { ...record };
  delete rest.flags;
  return entry ? { ...rest, flags: [entry] } : rest;
};

async function serveFlags(page, entries, { detail = true } = {}) {
  const served = { [UNEXAMINED.id]: null, ...entries };
  await page.route("**/app/models.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const models = payload.models.map(model => Object.hasOwn(served, model.id)
      ? withFlags(model, served[model.id] && bootEntry(served[model.id]))
      : model);
    await route.fulfill({ response, json: { ...payload, models } });
  });
  for (const [id, entry] of Object.entries(served)) {
    await page.route(`**/app/detail/model/${id}.json*`, async route => {
      if (!detail && entry) return route.abort();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: withFlags(body, entry) });
    });
  }
}

const modelCard = (page, record) => page.locator(`#model-grid .model-card:has([data-model="${record.id}"])`);
const FLAG = ".card-reviewed-flag";
const flagName = "“Fixture Level 3” · Precautionary";
// Like every badge's "name: definition", a screen reader hears the family name
// before the sentence.
const hiddenText = text => `Maker risk statement: ${text.sentence}`;

async function showModel(page, record) {
  await page.goto("/?collection=models");
  await search(page, record.name);
  await expect(modelCard(page, record)).toBeVisible();
}

// Hover races the page's smooth scrolling (see card-badges.spec.js), so scroll
// the emblem into view and wait for five still frames, as card-click.spec.js
// does: one still frame can fall between two steps of a smooth scroll.
async function settleOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY;
    let still = 0;
    const frame = () => requestAnimationFrame(() => {
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
      if (still >= 5) resolve();
      else frame();
    });
    frame();
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
  await expect(card.locator(`${FLAG} .visually-hidden`)).toHaveText(hiddenText(expected));
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
  await expect(emblem.locator(".visually-hidden")).toHaveText(hiddenText(expected));
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
  await expect(flag.locator(".visually-hidden")).toHaveText(hiddenText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy)));
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
  await expect(card.locator(`${FLAG} .visually-hidden`)).toHaveText(hiddenText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy)));
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
  await expect(page.locator("#taxonomy-content")).toContainText("Nobody has checked this release's developer pages yet.");
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

// The dialog's Risk statements section (ADR 042) in each of its three states,
// plus the found statement still waiting on its detail file.
const riskSection = (page, state) => recordView(page, "model").locator(state ? `section[data-risk="${state}"]` : "section[data-risk]");

test("a found statement is quoted in the dialog with its link, date, confidence, and scope", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await page.goto(`/?record=model:${FLAGGED.id}`);
  const section = riskSection(page, "statement_found");
  await expect(section.locator("h3")).toHaveText("Risk statements");
  await expect(section.locator("h4")).toHaveText(flagName);
  await expect(section.locator("blockquote")).toHaveText(FOUND.statement);
  await expect(section).toContainText("Risk areas: Cyber · Biological or chemical");
  await expect(section).toContainText("Covers: The model itself");
  await expect(section.locator("a")).toHaveAttribute("href", FOUND.url);
  await expect(section).toContainText("2026-09-01");
  await expect(section).toContainText("Research confidence: High");
  await expect(section).toContainText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(section).not.toContainText(/high risk|dangerous/i);
  // It follows the Model boundary section.
  const headings = await recordView(page, "model").locator(".detail-block > h3").allInnerTexts();
  expect(headings.indexOf("Risk statements")).toBe(headings.indexOf("Model boundary") + 1);
});

test("the dialog says when the developer publishes no statement, and when nobody has looked", async ({ page }) => {
  await serveFlags(page, { [CHECKED.id]: NONE });
  await page.goto(`/?record=model:${CHECKED.id}`);
  const none = riskSection(page, "no_statement_found");
  await expect(none).toContainText("The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.");
  await expect(none.locator("a")).toHaveAttribute("href", NONE.url);
  await expect(none).toContainText("Research confidence: Medium");

  await page.goto(`/?record=model:${UNEXAMINED.id}`);
  await expect(riskSection(page, "not_examined")).toHaveText("Risk statementsNot yet examined.");
});

test("a found statement whose detail never arrives never reads as unexamined or leaves a blank", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND }, { detail: false });
  await page.goto(`/?record=model:${FLAGGED.id}`);
  // Boot already carries the term, domains, determination, and scope; only the
  // quote, link, date, and confidence wait for the detail file.
  const pending = riskSection(page, "pending");
  await expect(pending.locator("h4")).toHaveText(flagName);
  await expect(pending).toContainText("Risk areas: Cyber · Biological or chemical");
  await expect(pending).toContainText("Covers: The model itself");
  await expect(pending).toContainText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(pending.locator("blockquote")).toHaveCount(0);
  await expect(pending.locator("a")).toHaveCount(0);
  await expect(riskSection(page, "not_examined")).toHaveCount(0);
  // The same blank-body rule deferred-data.spec.js holds every dialog to.
  const blanks = await pending.evaluate(root => [
    ...[...root.querySelectorAll("p, blockquote")].filter(element => !element.textContent.trim()).map(element => `empty <${element.tagName.toLowerCase()}>`),
    ...[...root.querySelectorAll("p > strong")].filter(strong => strong.parentElement.textContent.trim() === strong.textContent.trim()).map(strong => `dangling label: ${strong.textContent}`),
  ]);
  expect(blanks).toEqual([]);
});

test("imported models show no Risk statements section", async ({ page }) => {
  await page.goto(`/?record=model:${IMPORTED.id}`);
  await expect(recordHeading(page, "model")).toHaveText(IMPORTED.name);
  await expect(riskSection(page)).toHaveCount(0);
  await expect(recordView(page, "model")).not.toContainText("Risk statements");
});

test("a flag never enters a model comparison", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND, [CHECKED.id]: NONE });
  await page.goto(`/?collection=models&compare=model:${FLAGGED.id},${CHECKED.id}`);
  const table = page.locator("#comparison-dialog-content .comparison-table");
  await expect(table).toBeVisible();
  await expect(table).not.toContainText("Fixture Level 3");
  await expect(table).not.toContainText("Risk statements");
  await expect(table).not.toContainText("risk-threshold");
});
