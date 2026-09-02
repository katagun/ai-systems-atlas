const { test, expect } = require("@playwright/test");

test("opening a record writes a shareable URL, survives reload, and closes on back", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Kilo Code");
  await page.locator('#project-grid [data-project="kilo-code"]').click();

  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  await expect(page).toHaveURL(/record=system%3Akilo-code|record=system:kilo-code/);
  await expect(page.locator("#project-dialog [data-copy-record-link]")).toBeVisible();

  await page.reload();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  await expect(page.locator("#family-filter")).toHaveValue("");

  await page.goBack();
  await expect(page.locator("#project-dialog")).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
  await expect(page).toHaveURL(/collection=systems/);
});

test("closing a record dialog removes the record parameter", async ({ page }) => {
  await page.goto("/?record=inference:openai-api");

  await expect(page.locator("#inference-dialog")).toBeVisible();
  await expect(page.locator("#inference-dialog-content h1")).toHaveText("OpenAI API");
  await page.locator("#inference-dialog .dialog-close").click();
  await expect(page.locator("#inference-dialog")).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
});

test("a specification record URL opens the Specifications view and its dialog", async ({ page }) => {
  await page.goto("/?record=spec:mcp");

  await expect(page.locator("#specification-dialog")).toBeVisible();
  await expect(page.locator("#specification-dialog-content h1")).toHaveText("Model Context Protocol");
  await page.locator("#specification-dialog .dialog-close").click();
  await expect(page.locator('.tab[data-tab="specifications"]')).toHaveClass(/is-active/);
  await expect(page.locator("#specifications")).toHaveClass(/is-active/);
});

test("a local runtime record URL opens inside the runtimes scope", async ({ page }) => {
  await page.goto("/?collection=runtimes&record=runtime:ollama");

  await expect(page.locator("#runtime-dialog-content h1")).toHaveText("Ollama");
  await page.locator("#runtime-dialog .dialog-close").click();
  await expect(page.getByRole("button", { name: /^Local runtimes / })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/collection=runtimes/);
});

test("following a successor link updates the record URL", async ({ page }) => {
  await page.goto("/?record=system:autogen");

  await expect(page.locator("#project-dialog h1")).toHaveText("AutoGen");
  await page.locator("#project-dialog [data-successor]").click();
  await expect(page.locator("#project-dialog h1")).toHaveText("Microsoft Agent Framework");
  await expect(page).toHaveURL(/record=system%3Amicrosoft-agent-framework|record=system:microsoft-agent-framework/);
});

test("unknown, malformed, and inherited-property record URLs are discarded without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const raw of ["system:no-such-record", "constructor:ollama", "__proto__:x", "ollama", "runtime:", "spec:kilo-code"]) {
    await page.goto(`/?record=${raw}`);
    await expect(page.locator("#all-directory-result-count")).toContainText("entries");
    await expect(page).not.toHaveURL(/record=/);
    for (const id of ["#project-dialog", "#specification-dialog", "#inference-dialog", "#runtime-dialog"]) {
      await expect(page.locator(id)).toBeHidden();
    }
  }

  expect(errors).toEqual([]);
});
