const { test, expect } = require("@playwright/test");

test("searching G finds GBrain and GStack across all families", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#family-filter")).toHaveValue("");
  await page.locator("#project-search").fill("G");

  const resultNames = page.locator("#project-grid .project-card h2");
  await expect(resultNames.filter({ hasText: /^GBrain$/ })).toHaveCount(1);
  await expect(resultNames.filter({ hasText: /^GStack$/ })).toHaveCount(1);
});

test("canonical and repository links use the AI Systems Atlas slug", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://katagun.github.io/ai-systems-atlas/",
  );
  await expect(page.getByRole("link", { name: "GitHub ↗" })).toHaveAttribute(
    "href",
    "https://github.com/katagun/ai-systems-atlas",
  );
});

test("vendor instruction conventions are searchable and inspectable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Specifications" }).click();

  for (const name of ["copilot-instructions.md", "GEMINI.md", ".clinerules/"]) {
    await page.locator("#specification-search").fill(name);
    await expect(page.locator("#specification-grid .project-card h2")).toHaveText(name);
  }

  await page.locator("#specification-search").fill("GEMINI.md");
  await page.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#specification-dialog")).toContainText("Gemini CLI");
  await expect(page.locator("#specification-dialog")).toContainText("Specifications are classified, not scored");
});

test("assistant systems filter, score, and open without agent-only fields", async ({ page }) => {
  await page.goto("/");

  await page.locator("#family-filter").selectOption("assistant_system");
  await expect(page.locator("#result-count")).toContainText("Assistant-system score");
  await expect(page.locator("#role-filter option")).toContainText([
    "All roles",
    "General AI assistant",
    "Enterprise work assistant",
    "Multi-model chat client",
  ]);

  await page.locator("#role-filter").selectOption("multi_model_chat_client");
  await expect(page.locator("#project-grid .project-card h2")).toHaveText("T3 Chat");
  await page.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#project-dialog")).toContainText("Assistant-system score");
  await expect(page.locator("#project-dialog")).toContainText("Context & continuity");
  await expect(page.locator("#project-dialog")).toContainText("LicenseRef-Proprietary");
});

test("scores remain hidden across families and visible within the assistant family", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page.locator("#project-grid .score-ring")).toHaveCount(0);
  await expect(page.locator('#sort-filter option[value="score"]')).toHaveAttribute("disabled", "");

  await page.locator("#family-filter").selectOption("assistant_system");
  await expect(page.locator("#project-grid .score-ring")).toHaveCount(8);
  await expect(page.locator('#sort-filter option[value="score"]')).not.toHaveAttribute("disabled", "");
});

test("notable provider assistants are searchable and license-labeled", async ({ page }) => {
  await page.goto("/");
  await page.locator("#family-filter").selectOption("assistant_system");

  for (const name of ["Claude", "DeepSeek", "Gemini Apps", "Microsoft Copilot", "Z.ai"]) {
    await page.locator("#project-search").fill(name);
    await expect(page.locator("#project-grid .project-card h2")).toHaveText(name);
    await expect(page.locator("#project-grid .license-badge")).toContainText("LicenseRef-Proprietary");
  }
});

test("finder offers assistant outcomes and preserves the selected role", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Finder" }).click();
  await page.getByRole("button", { name: /I need an assistant/ }).click();
  await page.getByRole("button", { name: /Use several models in one place/ }).click();
  await page.getByRole("button", { name: /Model and data portability/ }).click();

  await expect(page.locator(".finder-results h3")).toHaveText("T3 Chat");
  await page.getByRole("button", { name: "Browse matches →" }).click();
  await expect(page.locator("#family-filter")).toHaveValue("assistant_system");
  await expect(page.locator("#role-filter")).toHaveValue("multi_model_chat_client");
});
