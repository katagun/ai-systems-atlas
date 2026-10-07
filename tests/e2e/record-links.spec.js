const { test, expect } = require("@playwright/test");
const { pressedEntry, viewTab } = require("./helpers/landing");
const { closeRecord, expectFilter, recordHeading, recordView, search } = require("./helpers/results");

test("opening a record writes a shareable URL, survives reload, and closes on back", async ({ page }) => {
  await page.goto("/?collection=systems");
  await search(page, "Kilo Code");
  await page.locator('#project-grid [data-project="kilo-code"]').click();

  await expect(recordHeading(page, "system")).toHaveText("Kilo Code");
  await expect(page).toHaveURL(/record=system%3Akilo-code|record=system:kilo-code/);
  await expect(recordView(page, "system").locator("[data-copy-record-link]")).toBeVisible();

  await page.reload();
  await expect(recordView(page, "system")).toBeVisible();
  await expect(recordHeading(page, "system")).toHaveText("Kilo Code");
  await expectFilter(page, "systems", "family", "");

  await page.goBack();
  await expect(recordView(page, "system")).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
  await expect(page).toHaveURL(/collection=systems/);
});

test("closing a record dialog removes the record parameter", async ({ page }) => {
  await page.goto("/?record=inference:openai-api");

  await expect(recordView(page, "inference")).toBeVisible();
  await expect(recordHeading(page, "inference")).toHaveText("OpenAI API");
  await closeRecord(page, "inference");
  await expect(recordView(page, "inference")).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
});

test("a specification record URL opens the Specifications view and its dialog", async ({ page }) => {
  await page.goto("/?record=spec:mcp");

  await expect(recordView(page, "spec")).toBeVisible();
  await expect(recordHeading(page, "spec")).toHaveText("Model Context Protocol");
  await closeRecord(page, "spec");
  await expect(viewTab(page, "directory")).toHaveClass(/is-active/);
  await expect(page.locator("#specifications-directory-panel")).not.toHaveAttribute("hidden");
});

test("a local runtime record URL opens inside the runtimes scope", async ({ page }) => {
  await page.goto("/?collection=runtimes&record=runtime:ollama");

  await expect(recordHeading(page, "runtime")).toHaveText("Ollama");
  await closeRecord(page, "runtime");
  await expect(pressedEntry(page)).toHaveAccessibleName(/^Local runtimes /);
  await expect(page).toHaveURL(/collection=runtimes/);
});

test("a model record URL opens the Models view and keeps its distinct boundary", async ({ page }) => {
  await page.goto("/?record=model:model-alibaba-qwen2-5-coder-0-5b");

  await expect(recordHeading(page, "model")).toHaveText("Qwen2.5-Coder-0.5B");
  await expect(recordView(page, "model")).toContainText("Model boundary");
  await closeRecord(page, "model");
  await expect(viewTab(page, "directory")).toHaveClass(/is-active/);
  await expect(page.locator("#models-directory-panel")).not.toHaveAttribute("hidden");
});

test("following a successor link updates the record URL", async ({ page }) => {
  await page.goto("/?record=system:autogen");

  await expect(recordHeading(page, "system")).toHaveText("AutoGen");
  await recordView(page, "system").locator("[data-successor]").click();
  await expect(recordHeading(page, "system")).toHaveText("Microsoft Agent Framework");
  await expect(page).toHaveURL(/record=system%3Amicrosoft-agent-framework|record=system:microsoft-agent-framework/);
});

test("a system dialog shows its product boundary note and related records", async ({ page }) => {
  await page.goto("/?record=system:autogen");

  const view = recordView(page, "system");
  await expect(view).toContainText("Product boundary");
  await expect(view).toContainText("Related in");
  const first = view.locator("[data-open-project]").first();
  const name = await first.innerText();
  await first.click();
  await expect(recordHeading(page, "system")).toHaveText(name);
  await expect(page).toHaveURL(/record=system%3A|record=system:/);
});

test("a successor record names its predecessor", async ({ page }) => {
  await page.goto("/?record=system:microsoft-agent-framework");

  const view = recordView(page, "system");
  await expect(view).toContainText("Superseded predecessor");
  await view.locator("[data-open-project]", { hasText: "AutoGen" }).click();
  await expect(recordHeading(page, "system")).toHaveText("AutoGen");
});

test("a system dialog links more records from the same lab", async ({ page }) => {
  await page.goto("/?record=system:autogen");

  await expect(recordView(page, "system")).toContainText("More from Microsoft");
});

test("unknown, malformed, and inherited-property record URLs are discarded without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const raw of ["system:no-such-record", "constructor:ollama", "__proto__:x", "ollama", "runtime:", "spec:kilo-code"]) {
    await page.goto(`/?record=${raw}`);
    // A known kind names its collection even when the id is unknown, so the
    // page settles in that collection's results, or in All's.
    await expect(pressedEntry(page)).toHaveCount(1);
    await expect(page).not.toHaveURL(/record=/);
    for (const kind of ["system", "spec", "inference", "runtime", "model"]) {
      await expect(recordView(page, kind)).toBeHidden();
    }
  }

  expect(errors).toEqual([]);
});
