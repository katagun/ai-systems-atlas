const { test, expect } = require("@playwright/test");
const catalogCounts = require("./helpers/catalog-counts");

const QWEN = "model-alibaba-qwen2-5-coder-0-5b";
const DEEPSEEK = "model-deepseek-deepseek-v3";

test("Models exposes every source record and keeps Atlas reviews distinct", async ({ page }) => {
  await page.goto("/?view=models");

  await expect(page.locator('.tab[data-tab="models"]')).toHaveClass(/is-active/);
  await expect(page.locator("#model-result-count")).toHaveText(
    `${catalogCounts.models} models · ${catalogCounts.reviewedModels} Atlas reviewed; source imports are unscored`,
  );
  await expect(page.locator("#model-grid .project-card h2").first()).toHaveText(
    catalogCounts.topReviewedModelName(),
  );

  // Filtered expectations name every match, so page past the default 24.
  await page.locator('#model-pager select[aria-label="Results per page"]').selectOption("96");

  await page.locator("#model-source-filter").selectOption("source_available");
  await expect(page.locator("#model-grid .project-card:not(.imported-model-card) h2")).toHaveText(
    catalogCounts.reviewedModelsWithSourceModel("source_available"),
  );
  await page.locator("#model-license-filter").selectOption("CC-BY-NC-4.0");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText(
    catalogCounts.reviewedModelsWithLicense("CC-BY-NC-4.0"),
  );

  await page.locator("#reset-model-filters").click();
  await page.locator("#model-modality-filter").selectOption("image");
  // More than one page at 96: name page one, then page two.
  const imageNames = catalogCounts.reviewedModelsWithModality("image");
  await expect(page.locator("#model-grid .project-card:not(.imported-model-card) h2")).toHaveText(
    imageNames.slice(0, 96),
  );
  await page.locator("#model-pager [data-pager-next]").click();
  await expect(page.locator("#model-grid .project-card:not(.imported-model-card) h2")).toHaveText(
    imageNames.slice(96),
  );

  await page.locator("#reset-model-filters").click();
  await page.locator("#model-distribution-filter").selectOption("developer_api");
  // More than one page at 96: name page one, then page two.
  const apiNames = catalogCounts.reviewedModelsWithDistribution("developer_api");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText(apiNames.slice(0, 96));
  await page.locator("#model-pager [data-pager-next]").click();
  await expect(page.locator("#model-grid .project-card h2")).toHaveText(apiNames.slice(96));

  await page.locator("#reset-model-filters").click();
  await page.locator(`#model-grid [data-model="${QWEN}"]`).click();
  const dialog = page.locator("#model-dialog-content");
  await expect(dialog.locator("h1")).toHaveText("Qwen2.5-Coder-0.5B");
  await expect(dialog).toContainText("Model access and deployability score");
  await expect(dialog).toContainText("Access and deployability only");
  await expect(dialog).toContainText("models.dev ID: alibaba/qwen2.5-coder-0.5b");
  await expect(dialog).toContainText("Reported capabilities");
  await expect(dialog).toContainText("imported discovery metadata, not an Atlas capability test");
});

test("an imported models.dev record is unscored and opens attributed source details", async ({ page }) => {
  await page.goto("/?view=models");
  await page.locator("#model-search").fill("Sarvam 105B");

  const card = page.locator("#model-grid .imported-model-card").filter({ hasText: "Sarvam 105B" });
  await expect(card).toContainText("Imported metadata · Not Atlas reviewed");
  await expect(card.locator(".score-ring")).toHaveCount(0);
  await expect(card.locator(".compare-toggle")).toHaveCount(0);
  await card.locator('[data-model="model-sarvam-sarvam-105b"]').click();

  const dialog = page.locator("#model-dialog-content");
  await expect(dialog.locator("h1")).toHaveText("Sarvam 105B");
  await expect(dialog).toContainText("models.dev source record · Not Atlas reviewed");
  await expect(dialog).toContainText("Atlas has not reviewed its identity boundary");
  await expect(dialog.getByRole("link", { name: "Open commit-pinned source record ↗" })).toBeVisible();
  await expect(dialog.locator(".record-link-row")).toHaveCount(0);
});

test("the Directory quick filters include Models and its complete source count", async ({ page }) => {
  await page.goto("/");

  const quickFilter = page.getByRole("button", { name: `Models ${catalogCounts.models}`, exact: true });
  await expect(quickFilter).toBeVisible();
  await quickFilter.click();
  await expect(page.locator('.tab[data-tab="models"]')).toHaveClass(/is-active/);
  await expect(page.locator("#model-result-count")).toContainText(`${catalogCounts.models} models`);
});

test("Models comparisons stay inside the model-access profile and restore from the URL", async ({ page }) => {
  await page.goto("/?view=models");

  // Past the default 24: high-scoring new records sort above older ones.
  await page.locator('#model-pager select[aria-label="Results per page"]').selectOption("96");

  await page.locator(`#model-grid [data-compare-id="${QWEN}"]`).click();
  await page.locator(`#model-grid [data-compare-id="${DEEPSEEK}"]`).click();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page).toHaveURL(/compare=model(%3A|:)model-alibaba-qwen2-5-coder-0-5b/);

  await page.locator("#comparison-open").click();
  await expect(page.locator("#comparison-dialog .eyebrow")).toHaveText("Model access and deployability score");
  await expect(page.locator("#comparison-dialog thead")).toContainText("Qwen2.5-Coder-0.5B");
  await expect(page.locator("#comparison-dialog thead")).toContainText("DeepSeek-V3");
  await expect(page.locator("#comparison-dialog")).toContainText("License Clarity · 22%");
  await expect(page.locator("#comparison-dialog")).toContainText("excludes output quality");
  await page.locator("#comparison-dialog .dialog-close").click();

  await page.reload();
  await expect(page.locator('.tab[data-tab="models"]')).toHaveClass(/is-active/);
  await expect(page.locator("#comparison-dialog")).toBeVisible();
  await page.locator("#comparison-dialog .dialog-close").click();

  await page.getByRole("button", { name: "Directory", exact: true }).click();
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(page).not.toHaveURL(/compare=/);
});

test("a reviewed model models.dev does not list yet says so and never prints null", async ({ page }) => {
  await page.route("**/app/models.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const models = payload.models.map(model => model.id === QWEN ? { ...model, source_id: null } : model);
    await route.fulfill({ response, json: { ...payload, unlisted_reviewed_count: 1, models } });
  });
  await page.goto("/?view=models");

  await expect(page.locator("#models-kicker")).toContainText("1 not yet on models.dev");
  const card = page.locator(`#model-grid .project-card:has([data-model="${QWEN}"])`);
  await page.locator("#model-search").fill("Qwen2.5-Coder-0.5B");
  await expect(card.locator(".card-footer")).toContainText("Not yet listed on models.dev");
  await expect(card).not.toContainText("null");
  await expect(card.locator(".card-source-meta")).toHaveAttribute("title", "Reviewed by Atlas from developer documentation");

  await card.locator(`[data-model="${QWEN}"]`).click();
  const dialog = page.locator("#model-dialog-content");
  await expect(dialog).toContainText("models.dev ID: Not yet listed on models.dev");
  await expect(dialog).toContainText("Reviewed by Atlas from developer documentation");
  await expect(dialog).not.toContainText("Source links from models.dev");
  await expect(dialog).not.toContainText("null");
});
