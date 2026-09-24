const { test, expect } = require("@playwright/test");
const catalogCounts = require("./helpers/catalog-counts");

test("Labs lists every lab by name and filters by type, headquarters, and release distribution", async ({ page }) => {
  await page.goto("/?view=labs");

  await expect(page.locator('.tab[data-tab="labs"]')).toHaveClass(/is-active/);
  await expect(page.locator("#labs-kicker")).toHaveText(
    `${catalogCounts.labs} labs · developers of ${catalogCounts.labCoveredModels} of ${catalogCounts.reviewedModels} reviewed releases`,
  );
  await expect(page.locator("#lab-result-count")).toHaveText(`${catalogCounts.labs} labs · Unscored`);
  // The labs outrun the default 24 per page; one page of 96 lists them all.
  await page.locator('#lab-pager select[aria-label="Results per page"]').selectOption("96");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labNames());
  await expect(page.locator("#lab-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#lab-grid .compare-toggle")).toHaveCount(0);

  await page.locator("#lab-type-filter").selectOption("technology_company");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(
    catalogCounts.labNames(lab => lab.lab_type === "technology_company"),
  );
  await page.locator("#reset-lab-filters").click();
  await page.locator("#lab-country-filter").selectOption("cn");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labNames(lab => lab.headquarters === "cn"));
  await page.locator("#reset-lab-filters").click();
  await page.locator("#lab-distribution-filter").selectOption("downloadable_weights");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(
    catalogCounts.labsWithReleaseDistribution("downloadable_weights"),
  );

  // The organization note is detail-only; the search index still reaches it.
  await page.locator("#reset-lab-filters").click();
  await page.locator("#lab-search").fill("Hangzhou");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labsMatching("Hangzhou"));
});

test("a lab dialog joins the records that name the lab and browses its releases in Models", async ({ page }) => {
  await page.goto("/?view=labs");
  await page.locator('#lab-grid [data-lab="lab-anthropic"]').click();

  const dialog = page.locator("#lab-dialog-content");
  await expect(dialog.locator("h1")).toHaveText("Anthropic");
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-anthropic/);
  const releases = catalogCounts.reviewedModelsDevelopedBy("lab-anthropic");
  await expect(dialog.getByRole("heading", { name: `Reviewed model releases · ${releases.length}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Anthropic API", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Claude Code", exact: true })).toBeVisible();
  // Detail-only fields paint once app/detail/lab/lab-anthropic.json lands.
  await expect(dialog.getByRole("link", { name: /Responsible Scaling Policy/ })).toBeVisible();
  await expect(dialog).toContainText("does not assess whether or how it is followed");

  await dialog.locator('[data-browse-lab-models="lab-anthropic"]').click();
  await expect(page.locator('.tab[data-tab="models"]')).toHaveClass(/is-active/);
  await expect(page.locator("#model-lab-filter")).toHaveValue("lab-anthropic");
  await page.locator('#model-pager select[aria-label="Results per page"]').selectOption("96");
  await expect(page.locator("#model-grid .project-card:not(.imported-model-card) h2")).toHaveText(releases);

  await page.locator("#reset-model-filters").click();
  await expect(page.locator("#model-lab-filter")).toHaveValue("");
});

test("a lab dialog fits a phone screen with its longest channel URL and name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [catalogCounts.labIdWithLongestChannel, catalogCounts.labIdWithLongestNameWord]) {
    await page.goto(`/?view=labs&record=lab:${id}`);
    const dialog = page.locator("#lab-dialog");
    // Channels are detail-only; measure once they have painted.
    await expect(dialog.locator(".lab-channel-link").first()).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth), id).toBe(0);
  }
});

test("a model dialog links to the lab that developed the release", async ({ page }) => {
  await page.goto("/?view=models&record=model:model-deepseek-deepseek-v4-pro");
  await expect(page.locator("#model-dialog-content h1")).toHaveText("DeepSeek V4 Pro");

  await page.locator('#model-dialog-content [data-open-lab="lab-deepseek"]').click();
  await expect(page.locator("#lab-dialog-content h1")).toHaveText("DeepSeek");
  await expect(page.locator("#model-dialog")).toHaveJSProperty("open", false);
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-deepseek/);
});

test("a lab share page names the organization and opens the lab in the Atlas", async ({ page }) => {
  await page.goto("/records/labs/lab-anthropic/");

  await expect(page).toHaveTitle("Anthropic · peacefulcoexistance");
  await expect(page.locator("h1")).toHaveText("Anthropic");
  await expect(page.locator("main")).toContainText("Responsible Scaling Policy");

  await page.getByRole("link", { name: /Open in the directory/ }).click();
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-anthropic/);
  await expect(page.locator("#lab-dialog h1")).toHaveText("Anthropic");
});
