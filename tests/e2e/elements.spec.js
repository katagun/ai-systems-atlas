const { test, expect } = require("@playwright/test");
const { projects } = require("../../directory/projects.json");
const taxonomy = require("../../directory/taxonomy.json");
const { openCollection, openView } = require("./helpers/landing");
const active = projects.filter(record => record.status === "active");
const coding = active.filter(record => record.primary_role === "coding_agent").sort((a, b) => a.name.localeCompare(b.name));

test("Elements counts primary roles and loads no record detail until selection", async ({ page }) => {
  const details = [];
  page.on("request", request => { if (request.url().includes("/app/detail/")) details.push(request.url()); });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-element]")).toHaveCount(taxonomy.primary_roles.length);
  await expect(page.locator("#elements-count")).toContainText(`${active.length} active systems`);
  await expect(page.locator("#element-sheet")).toBeHidden();
  expect(details).toEqual([]);
  for (const role of taxonomy.primary_roles) {
    const count = active.filter(record => record.primary_role === role.id && record.system_family === role.family).length;
    await expect(page.locator(`[data-element="${role.id}"] .element-count`)).toHaveText(String(count));
  }
  const tile = page.locator('[data-element="coding_agent"]');
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#element-sheet-title")).toBeFocused();
  await expect(page.locator("#element-record")).toHaveValue(coding[0].id);
  await expect(page.locator("#element-load-status")).toContainText(`Review details loaded for ${coding[0].name}`);
  await expect(page.locator("#element-properties")).toContainText(coding[0].verified_at);
  await expect(page.locator("#elements .score-ring, #elements .compare-toggle")).toHaveCount(0);
  expect(details.length).toBe(1);
  await page.locator("#element-close").click();
  await expect(tile).toBeFocused();
  await expect(page.locator("#element-sheet")).toBeHidden();
  await expect(page).not.toHaveURL(/element=/);
});

test("reference sheets restore URL, exact catalog slices and record navigation", async ({ page }) => {
  const chosen = coding[1];
  await page.goto(`/?element=coding_agent&elementRecord=${chosen.id}`);
  await expect(page.locator("#element-record-name")).toHaveText(chosen.name);
  await page.reload();
  await expect(page.locator("#element-record")).toHaveValue(chosen.id);
  await page.locator("#element-browse").click();
  await expect(page.locator("#role-filter")).toHaveValue("coding_agent");
  await expect(page.locator("#result-count")).toContainText(`${coding.length} `);
  await expect(page).not.toHaveURL(/element=/);
  await page.goBack();
  await expect(page.locator("#element-record")).toHaveValue(chosen.id);
  await page.locator("#element-detail").click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page.locator("#project-dialog h1")).toHaveText(chosen.name);
  await page.goBack();
  await expect(page.locator("#element-record")).toHaveValue(chosen.id);
  await openCollection(page, "runtimes");
  await expect(page).not.toHaveURL(/element=/);
  await page.goBack();
  await expect(page.locator("#element-sheet")).toBeVisible();
  await openView(page, "explore");
  await expect(page).not.toHaveURL(/element=/);
});

test("late or failed detail loads never replace another selected record and can retry", async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(`**/app/detail/system/${coding[0].id}.json*`, async route => { await held; await route.continue(); });
  await page.goto("/?element=coding_agent");
  await expect(page.locator("#element-load-status")).toHaveText("Loading reviewed details…");
  await page.locator("#element-record").selectOption(coding[1].id);
  await expect(page.locator("#element-load-status")).toContainText(`Review details loaded for ${coding[1].name}`);
  release();
  await expect(page.locator("#element-record-name")).toHaveText(coding[1].name);
  await page.route(`**/app/detail/system/${coding[2].id}.json*`, route => route.abort());
  await page.locator("#element-record").selectOption(coding[2].id);
  await expect(page.locator("#element-retry")).toBeVisible();
  await expect(page.locator("#element-properties")).toContainText("Review details not loaded");
  await page.unroute(`**/app/detail/system/${coding[2].id}.json*`);
  await page.locator("#element-retry").click();
  await expect(page.locator("#element-load-status")).toContainText(`Review details loaded for ${coding[2].name}`);
  await expect(page.locator("#element-record")).toHaveValue(coding[2].id);
});

test("invalid element URLs recover to an unselected front door", async ({ page }) => {
  await page.goto("/?element=constructor&elementRecord=invalid");
  await expect(page.locator("#front-door")).toBeVisible();
  await expect(page.locator("#element-sheet")).toBeHidden();
  await expect(page).not.toHaveURL(/element/);
  await page.goto("/?element=coding_agent&elementRecord=invalid");
  await expect(page.locator("#element-record")).toHaveValue(coding[0].id);
  await expect(page).not.toHaveURL(/invalid/);
});

for (const theme of ["light", "dark"]) {
  test(`Elements and the selected sheet fit desktop and phones in ${theme}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?element=coding_agent");
    for (const width of [1440, 1000, 736, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("#element-sheet")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      if (width <= 700) {
        expect(await page.locator("#element-sheet").evaluate(el => el.previousElementSibling.dataset.elementFamily)).toBe("agent_system");
      }
      for (const tile of await page.locator("[data-element]").all()) {
        const box = await tile.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(errors).toEqual([]);
  });
}
