const { test, expect } = require("@playwright/test");
const { projects } = require("../../directory/projects.json");
const taxonomy = require("../../directory/taxonomy.json");
const { expectFilter, recordHeading, recordView, sortControl } = require("./helpers/results");
const active = projects.filter(record => record.status === "active");
const coding = active.filter(record => record.primary_role === "coding_agent").sort((a, b) => a.name.localeCompare(b.name));

test("a role opens its systems as a name-sorted list and loads no detail until a row opens", async ({ page }) => {
  const details = [];
  page.on("request", request => { if (request.url().includes("/app/detail/")) details.push(request.url()); });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-element]")).toHaveCount(taxonomy.primary_roles.length);
  await expect(page.locator("#elements-count")).toContainText(`${active.length} active systems`);
  await expect(page.locator("#elements .score-ring, #elements .compare-toggle")).toHaveCount(0);
  expect(details).toEqual([]);
  for (const role of taxonomy.primary_roles) {
    const count = active.filter(record => record.primary_role === role.id && record.system_family === role.family).length;
    await expect(page.locator(`[data-element="${role.id}"] .element-count`)).toHaveText(String(count));
  }
  const tile = page.locator('[data-element="coding_agent"]');
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/collection=systems/);
  await expect(page).toHaveURL(/family=agent_system/);
  await expect(page).toHaveURL(/role=coding_agent/);
  await expect(page).toHaveURL(/layout=list/);
  await expect(page).not.toHaveURL(/element/);
  await expectFilter(page, "systems", "family", "agent_system");
  await expectFilter(page, "systems", "role", "coding_agent");
  await expect(sortControl(page, "systems")).toHaveValue("name");
  await expect(page.locator("#project-grid tbody .link-button").first()).toHaveText(coding[0].name);
  await expect(page.locator("#result-count")).toBeFocused();
  expect(details).toEqual([]);
  await page.locator("#project-grid tbody .link-button").first().click();
  await expect(recordView(page, "system")).toBeVisible();
  await expect(recordHeading(page, "system")).toHaveText(coding[0].name);
  await expect.poll(() => details.length).toBe(1);
});

test("an old element URL opens that role's list, and a valid record opens the dialog", async ({ page }) => {
  const chosen = coding[1];
  await page.goto(`/?element=coding_agent&elementRecord=${chosen.id}`);
  await expect(page.locator("#front-door")).toBeHidden();
  await expect(page).toHaveURL(/collection=systems/);
  await expect(page).toHaveURL(/role=coding_agent/);
  await expect(sortControl(page, "systems")).toHaveValue("name");
  await expect(page).not.toHaveURL(/[?&]sort=/);
  await expect(page).toHaveURL(/layout=list/);
  await expect(page).not.toHaveURL(/element/);
  await expect(page.locator("#project-grid")).toContainText(chosen.name);
  await expect(recordHeading(page, "system")).toHaveText(chosen.name);
  await expect(page).toHaveURL(new RegExp(`record=system(%3A|:)${chosen.id}`));
  await page.locator("#record-dialog .dialog-close").click();
  await expect(recordView(page, "system")).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
  await expect(page.locator("#project-grid")).toContainText(chosen.name);
});

test("invalid element URLs recover without keeping the old parameters", async ({ page }) => {
  await page.goto("/?element=constructor&elementRecord=invalid");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page).not.toHaveURL(/element/);
  await expect(page).not.toHaveURL(/collection=/);
  await page.goto("/?element=coding_agent&elementRecord=invalid");
  await expect(page.locator("#systems-directory-panel")).toBeVisible();
  await expect(page).toHaveURL(/role=coding_agent/);
  await expect(page).not.toHaveURL(/invalid/);
  await expect(page).not.toHaveURL(/record=/);
  await expect(recordView(page, "system")).toBeHidden();
});

for (const theme of ["light", "dark"]) {
  test(`the role map fits desktop and phones in ${theme}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    for (const width of [1440, 1000, 736, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("#elements")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const tile of await page.locator("[data-element]:visible").all()) {
        const box = await tile.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("Elements previews organization marks, never monograms, and keeps mobile counts and bounds correct", async ({ page }) => {
  const logos = require("../../web/logos.json");
  const { buildLabIndex, elementLabs } = require("../../web/app-core.js");
  const labs = require("../../directory/labs.json").labs;
  const marked = new Set(Object.keys(logos.records).filter(id => logos.records[id]));
  const previews = role => elementLabs(
    active.filter(record => record.primary_role === role), buildLabIndex(labs, []), marked,
  ).map(lab => lab.id);
  const codingLabs = previews("coding_agent");
  expect(codingLabs.slice(0, 3)).toEqual(["lab-openai", "lab-anthropic", "lab-google"]);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/logos.json*", async route => { await gate; await route.continue(); });
  await page.goto("/");
  const tile = page.locator('[data-element="coding_agent"]');
  await expect(tile.locator("[data-mark]")).toHaveCount(0);
  await expect(page.locator(".element-tile .card-monogram")).toHaveCount(0);
  release();
  await expect(tile.locator("[data-mark]")).toHaveCount(3);
  for (const id of codingLabs.slice(0, 3)) await expect(tile.locator(`[data-mark="${id}"] svg`)).toHaveCount(1);
  await expect(tile.locator(".element-marks")).toHaveAttribute("title", /Organizations in this role: OpenAI, Anthropic, Google/);
  await expect(page.locator('[data-element="human_pkm"] .element-marks')).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [320, 390, 767, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const limit = width < 768 ? 2 : 3;
      await expect(tile.locator(".card-mark:visible")).toHaveCount(limit);
      await expect(tile.locator(width < 768 ? ".element-more-mobile" : ".element-more-desktop")).toHaveText(`+${codingLabs.length - limit}`);
      expect(await page.locator(".element-tile:visible").evaluateAll(tiles => tiles.every(item => item.scrollWidth <= item.clientWidth))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("a role list still opens when logos fail", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/logos.json*", route => route.abort());
  await page.goto("/?element=coding_agent");
  await expect(page.locator("#project-grid tbody .link-button").first()).toHaveText(coding[0].name);
  await expect(page.locator(".element-tile .card-monogram")).toHaveCount(0);
  expect(errors).toEqual([]);
});
