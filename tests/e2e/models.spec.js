const { test, expect } = require("@playwright/test");

const QWEN = "model-alibaba-qwen2-5-coder-0-5b";
const DEEPSEEK = "model-deepseek-deepseek-v3";

test("Models filters reviewed releases and explains imported versus editorial evidence", async ({ page }) => {
  await page.goto("/?view=models");

  await expect(page.locator('.tab[data-tab="models"]')).toHaveClass(/is-active/);
  await expect(page.locator("#model-result-count")).toHaveText(
    "7 models · Model access and deployability score",
  );
  await expect(page.locator("#model-grid .project-card h2").first()).toHaveText("Qwen2.5-Coder-0.5B");

  await page.locator("#model-source-filter").selectOption("source_available");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText([
    "DeepSeek-V3",
    "Llama 3.2 11B Vision Instruct",
    "Aya Expanse 8B",
  ]);
  await page.locator("#model-license-filter").selectOption("CC-BY-NC-4.0");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText("Aya Expanse 8B");

  await page.locator("#reset-model-filters").click();
  await page.locator("#model-modality-filter").selectOption("image");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText([
    "Pixtral 12B",
    "Llama 3.2 11B Vision Instruct",
    "Claude Sonnet 4.6",
    "GPT-4.1",
  ]);

  await page.locator("#model-distribution-filter").selectOption("developer_api");
  await expect(page.locator("#model-grid .project-card h2")).toHaveText([
    "Claude Sonnet 4.6",
    "GPT-4.1",
  ]);

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

test("Models comparisons stay inside the model-access profile and restore from the URL", async ({ page }) => {
  await page.goto("/?view=models");

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
