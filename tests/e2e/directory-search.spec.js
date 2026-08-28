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

test("reviewed provider traits appear only in project details", async ({ page }) => {
  await page.goto("/");
  await page.locator("#project-search").fill("Claude Code");
  await page.locator('button[data-project="claude-code"]').click();

  await expect(page.locator("#project-dialog")).toContainText("Model provider support");
  await expect(page.locator("#project-dialog")).toContainText("Provider-native");
  await expect(page.locator("#project-dialog")).toContainText("Anthropic");
  await expect(page.locator("#directory-controls")).not.toContainText("Provider relationship");
});

test("inference services combine dedicated filters and remain unscored", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Inference Services" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await expect(page.locator("#inference-result-count")).toContainText("34 services · Unscored");
  await page.locator("#inference-search").fill("Bedrock");
  await page.locator("#inference-type-filter").selectOption("cloud_model_platform");
  await page.locator("#inference-delivery-filter").selectOption("reserved_capacity");
  await page.locator("#inference-model-source-filter").selectOption("customer_supplied");
  await page.locator("#inference-api-filter").selectOption("openai_compatible");
  await expect(page.locator("#inference-grid .project-card h2")).toHaveText("Amazon Bedrock");

  await page.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#inference-dialog")).toContainText("Service boundary");
  await expect(page.locator("#inference-dialog")).toContainText("Governing terms");
  await expect(page.locator("#inference-dialog")).toContainText("Inference services are classified, not scored");
  await expect(page.locator("#inference-dialog")).not.toContainText("Overall");
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
  await expect(page.locator("#project-grid .score-ring")).toHaveCount(10);
  await expect(page.locator('#sort-filter option[value="score"]')).not.toHaveAttribute("disabled", "");
});

test("notable provider assistants are searchable and license-labeled", async ({ page }) => {
  await page.goto("/");
  await page.locator("#family-filter").selectOption("assistant_system");

  for (const name of [
    "Claude",
    "DeepSeek",
    "Gemini Apps",
    "Grok",
    "Microsoft 365 Copilot",
    "Microsoft Copilot",
    "Z.ai",
  ]) {
    await page.locator("#project-search").fill(name);
    const exactCard = page
      .locator("#project-grid .project-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(exactCard).toHaveCount(1);
    await expect(exactCard.locator(".license-badge")).toContainText("LicenseRef-Proprietary");
  }
});

test("reviewed coding and stateful agent additions are searchable", async ({ page }) => {
  await page.goto("/");

  for (const name of ["Kilo Code", "Hermes Agent", "Replit Agent"]) {
    await page.locator("#project-search").fill(name);
    await expect(page.locator("#project-grid .project-card h2")).toHaveText(name);
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
