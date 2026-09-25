const { test, expect } = require("@playwright/test");

test("a family chip, a query, and a filter survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Memory / }).click();
  await page.locator("#project-search").fill("graph");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#license-filter").selectOption("MIT");
  await expect(page).toHaveURL(/family=memory_system/);
  await expect(page).toHaveURL(/q=graph/);
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();

  await page.reload();
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
  await expect(page.locator("#project-search")).toHaveValue("graph");
  await expect(page.locator("#license-filter")).toHaveValue("MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator('.collection-switcher [aria-pressed="true"]')).toHaveAccessibleName(/^Memory /);
});

test("values a control cannot take are removed from the URL rather than half-applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=nope&role=nope&q=agent&type=direct_model_api");
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page.locator("#project-search")).toHaveValue("agent");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page).not.toHaveURL(/role=/);
  await expect(page).not.toHaveURL(/type=/);
});

test("a comparison decides the family, and a disagreeing family is dropped", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=system:kilo-code,aider");
  await expect(page.locator("#family-filter")).toHaveValue("agent_system");
  await expect(page).not.toHaveURL(/family=memory_system/);
});

test("the Models view restores its query and filters", async ({ page }) => {
  await page.goto("/?view=models&q=gemma&type=language_model");
  await expect(page.locator("#models")).toHaveClass(/is-active/);
  await expect(page.locator("#model-search")).toHaveValue("gemma");
  await expect(page.locator("#model-type-filter")).toHaveValue("language_model");
  await page.reload();
  await expect(page.locator("#model-search")).toHaveValue("gemma");
});

test("a page number restores, and changing scope clears the last scope's parameters", async ({ page }) => {
  await page.goto("/?page=2");
  await expect(page.locator("#all-directory-pager .pager-nav span")).toContainText("Page 2 of");

  await page.getByRole("button", { name: /^Inference services / }).click();
  await page.locator("#inference-type-filter").selectOption("direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.getByRole("button", { name: /^Local runtimes / }).click();
  await expect(page).not.toHaveURL(/type=/);
  await expect(page).not.toHaveURL(/page=/);
});

test("a comparison keeps the role and score sort chosen beside it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Agents / }).click();
  await page.locator("#role-filter").selectOption("coding_agent");
  await page.locator("#sort-filter").selectOption("score");
  await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
  await page.locator('#project-grid [data-compare-id="aider"]').click();
  await expect(page).toHaveURL(/compare=system%3Akilo-code%2Caider/);

  await page.reload();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#role-filter")).toHaveValue("coding_agent");
  await expect(page.locator("#sort-filter")).toHaveValue("score");
  await expect(page).toHaveURL(/role=coding_agent/);
  await expect(page).toHaveURL(/sort=score/);
});

test("a restored query searches the same text a typed one does", async ({ page }) => {
  // "allowlist" appears only in the prose a search index carries, never in a
  // boot record, so a card here proves the restored query loaded the index.
  await page.goto("/?collection=systems&q=allowlist");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
});
