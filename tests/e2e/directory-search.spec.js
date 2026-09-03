const { test, expect } = require("@playwright/test");

test("searching G finds GBrain and GStack across all families", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: /^All / })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#all-directory-result-count")).toContainText("233 entries · Scores hidden across collections");
  await expect(page.locator("#all-directory-grid .score-ring")).toHaveCount(0);
  await page.locator("#all-directory-search").fill("G");

  const resultNames = page.locator("#all-directory-grid .project-card h2");
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

test("the atlas orbital field spans the five landscape nodes", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".atlas-map .map-node")).toHaveCount(5);
  await expect(page.locator(".atlas-map .map-orbit")).toHaveCount(5);
  await expect(page.locator(".atlas-map .map-orbit").first()).toBeVisible();
});

test("superseded systems leave the active view and link to their successor", async ({ page }) => {
  await page.goto("/?collection=systems");

  const names = page.locator("#project-grid .project-card h2");
  await page.locator("#project-search").fill("AutoGen");
  await expect(names.filter({ hasText: /^AutoGen$/ })).toHaveCount(0);

  await page.locator("#project-search").fill("");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#status-filter").selectOption("superseded");
  await expect(names).toHaveText(["AutoGen", "Semantic Kernel", "SWE-agent"]);

  await page.locator('#project-grid [data-project="autogen"]').click();
  const dialog = page.locator("#project-dialog");
  await expect(dialog.locator(".status-notice")).toContainText("The review below stands");
  await expect(dialog.locator("h1")).toHaveText("AutoGen");

  await dialog.locator("[data-successor]").click();
  await expect(dialog.locator("h1")).toHaveText("Microsoft Agent Framework");
  await expect(dialog.locator(".status-notice")).toHaveCount(0);
});

test("taxonomy documents every local-runtime group and its score weights", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Taxonomy" }).click();
  for (const group of [
    "Local runtime types", "Runtime accelerators", "Runtime model formats",
    "Runtime serving modes", "Runtime deployment surfaces", "Local-runtime score",
  ]) {
    await expect(page.locator("#taxonomy-content h2", { hasText: group })).toHaveCount(1);
  }
  await expect(page.locator("#taxonomy-content")).toContainText("Hardware Accelerator Coverage · 16%");
  await expect(page.locator("#taxonomy-content")).toContainText("Compatibility gateway");
});

test("the local runtimes scope filters, sorts, and opens its own detail dialog", async ({ page }) => {
  await page.goto("/?collection=runtimes");

  await expect(page.getByRole("button", { name: /^Local runtimes / })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#runtime-result-count")).toContainText("Local-runtime score");
  const names = page.locator("#runtime-grid .project-card h2");
  await expect(names.first()).toHaveText("vLLM");

  await page.locator("#runtime-type-filter").selectOption("desktop_runner");
  await expect(names).toHaveCount(3);
  await page.locator("#runtime-accelerator-filter").selectOption("vulkan");
  await expect(names).toHaveText(["LM Studio"]);

  await page.locator("#reset-runtime-filters").click();
  await page.locator("#runtime-sort-filter").selectOption("name");
  await expect(names.first()).toHaveText("GenieX");

  await page.locator("#runtime-search").fill("Ollama Cloud");
  await expect(names).toHaveText(["Ollama"]);
  await page.locator('#runtime-grid [data-local-runtime="ollama"]').click();
  await expect(page.locator("#runtime-dialog")).toBeVisible();
  await expect(page.locator("#runtime-dialog-content .eyebrow")).toContainText("Local-runtime score");
  await expect(page.locator("#runtime-dialog-content")).toContainText("Runtime boundary");
});

test("local runtimes compare inside their own profile and clear across scopes", async ({ page }) => {
  await page.goto("/?collection=runtimes");

  await page.locator('#runtime-grid .compare-toggle').nth(0).click();
  await page.locator('#runtime-grid .compare-toggle').nth(1).click();
  await expect(page).toHaveURL(/compare=runtime%3A|compare=runtime:/);
  await page.locator("#comparison-open").click();
  await expect(page.locator("#comparison-dialog")).toBeVisible();
  await expect(page.locator("#comparison-dialog .eyebrow")).toHaveText("Local-runtime score");
  await page.locator("#comparison-dialog .dialog-close").click();

  await page.getByRole("button", { name: /^Inference services / }).click();
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(page).not.toHaveURL(/compare=/);
});

test("comparison URLs naming inherited object properties are discarded, not dispatched", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const kind of ["constructor", "hasOwnProperty", "__proto__", "toString"]) {
    await page.goto(`/?compare=${kind}:ollama`);
    await expect(page).not.toHaveURL(/compare=/);
    await expect(page.locator("#all-directory-result-count")).toContainText("entries");
  }

  expect(errors).toEqual([]);
});

test("a cross-profile comparison URL is discarded rather than partially restored", async ({ page }) => {
  await page.goto("/?compare=runtime:ollama,openai-api");

  await expect(page).not.toHaveURL(/compare=/);
  await expect(page.locator("#comparison-dialog")).toBeHidden();
});

test("mixed browsing surfaces local runtimes without scores or comparison", async ({ page }) => {
  await page.goto("/");

  await page.locator("#all-directory-search").fill("SGLang");
  const runtimeCards = page.locator("#all-directory-grid .local-runtime-card h2");
  await expect(runtimeCards.filter({ hasText: /^SGLang$/ })).toHaveCount(1);
  await expect(page.locator("#all-directory-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#all-directory-grid .compare-toggle")).toHaveCount(0);
  await page.locator('#all-directory-grid [data-local-runtime="sglang"]').click();
  await expect(page.locator("#runtime-dialog")).toBeVisible();
  await expect(page.locator("#runtime-dialog-content h1")).toHaveText("SGLang");
});

test("the finder guides a local runtime path into the runtimes scope", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Finder", exact: true }).click();
  await page.locator('[data-finder-choice][data-finder-value="local_runtime"]').click();
  await page.locator('[data-finder-choice][data-finder-value="serve_workload"]').click();
  await page.locator('[data-finder-choice][data-finder-value="hardware"]').click();

  await expect(page.locator(".finder-result h3").first()).toHaveText("vLLM");
  await expect(page.locator(".finder-result").first().locator(".card-mark svg")).toHaveCount(1);
  await expect(page.locator(".finder-result-footer span").first()).toContainText("local-runtime score");

  await page.locator("[data-finder-directory]").click();
  await expect(page).toHaveURL(/collection=runtimes/);
  await expect(page.locator("#runtime-type-filter")).toHaveValue("server_engine");
});

test("the unified directory distinguishes and opens systems and inference services", async ({ page }) => {
  await page.goto("/");

  await page.locator("#all-directory-search").fill("AI21 Studio");
  const serviceCard = page.locator("#all-directory-grid .project-card");
  await expect(serviceCard).toHaveCount(1);
  await expect(serviceCard.locator(".family-label")).toContainText("Inference service · Direct model API");
  await expect(serviceCard.locator(".score-ring")).toHaveCount(0);
  await serviceCard.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#inference-dialog")).toContainText("Inference-service score");
  await page.locator("#inference-dialog .dialog-close").click();

  await page.locator("#all-directory-search").fill("Kilo Code");
  const systemCard = page.locator("#all-directory-grid .project-card");
  await expect(systemCard).toHaveCount(1);
  await expect(systemCard.locator(".family-label")).toContainText("System · Agent system");
  await systemCard.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#project-dialog")).toContainText("Kilo Code");
});

test("the unified Directory remains usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /^All / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Inference services / })).toBeVisible();
  await page.locator("#all-directory-search").fill("AI21 Studio");
  await expect(page.locator("#all-directory-grid .project-card h2")).toHaveText("AI21 Studio");
  await page.getByRole("button", { name: /^Inference services / }).click();
  await expect(page.locator("#inference-search")).toBeVisible();
  await expect(page.locator("#inference-grid .score-ring").first()).toBeVisible();
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

test("new protocol layers are searchable and keep their boundaries distinct", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Specifications" }).click();

  for (const name of ["WebMCP", "OASF", "ANP", "AP2", "UCP", "Commerce ACP"]) {
    await page.locator("#specification-search").fill(name);
    await expect(page.locator("#specification-grid .project-card h2")).toHaveText(name);
  }

  await page.locator("#specification-search").fill("OASF");
  await page.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#specification-dialog")).toContainText("Metadata schema");
  await expect(page.locator("#specification-dialog")).toContainText("Agent identity and discovery");
});

test("reviewed provider traits appear only in project details", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();
  await page.locator("#project-search").fill("Claude Code");
  await page.locator('#project-grid button[data-project="claude-code"]').click();

  await expect(page.locator("#project-dialog")).toContainText("Model provider support");
  await expect(page.locator("#project-dialog")).toContainText("Provider-native");
  await expect(page.locator("#project-dialog")).toContainText("Anthropic");
  await expect(page.locator("#directory-controls")).not.toContainText("Provider relationship");
});

test("inference services combine filters and expose the dedicated service score", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Inference services / }).click();
  await expect(page).toHaveURL(/collection=inference/);
  await expect(page.getByRole("button", { name: /^Inference services / })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Inference services / })).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator("#inference-result-count")).toContainText("57 services · Inference-service score");
  await expect(page.locator("#inference-grid .project-card h2").first()).toHaveText("Microsoft Foundry Models");
  await page.locator("#inference-sort-filter").selectOption("name");
  await expect(page.locator("#inference-grid .project-card h2").first()).toHaveText("abliteration.ai");
  await page.locator("#inference-sort-filter").selectOption("score");
  await page.locator("#inference-search").fill("Bedrock");
  await page.locator("#inference-type-filter").selectOption("cloud_model_platform");
  await page.locator("#inference-delivery-filter").selectOption("reserved_capacity");
  await page.locator("#inference-model-source-filter").selectOption("customer_supplied");
  await page.locator("#inference-api-filter").selectOption("openai_compatible");
  await expect(page.locator("#inference-grid .project-card h2")).toHaveText("Amazon Bedrock");
  await expect(page.locator("#inference-grid .score-ring")).toHaveText("8.9");

  await page.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#inference-dialog")).toContainText("Service boundary");
  await expect(page.locator("#inference-dialog")).toContainText("Governing terms");
  await expect(page.locator("#inference-dialog")).toContainText("Inference-service score");
  await expect(page.locator("#inference-dialog")).toContainText("Overall");
  await expect(page.locator("#inference-dialog")).toContainText("excludes model quality");
});

test("assistant systems filter, score, and open without agent-only fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();

  await page.locator("#family-filter").selectOption("assistant_system");
  await expect(page.locator("#result-count")).toContainText("Assistant-system score");
  await expect(page.locator("#role-filter option")).toContainText([
    "All roles",
    "General AI assistant",
    "Enterprise work assistant",
    "Multi-model chat client",
  ]);

  await page.locator("#role-filter").selectOption("multi_model_chat_client");
  await expect(page.locator("#project-grid .project-card h2")).toHaveText(["Jan", "LibreChat", "T3 Chat", "Venice.ai"]);
  await page.locator('#project-grid button[data-project="t3-chat"]').click();
  await expect(page.locator("#project-dialog")).toContainText("Assistant-system score");
  await expect(page.locator("#project-dialog")).toContainText("Context & continuity");
  await expect(page.locator("#project-dialog")).toContainText("LicenseRef-Proprietary");
});

test("scores remain hidden across families and visible within the assistant family", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();

  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page.locator("#project-grid .score-ring")).toHaveCount(0);
  await expect(page.locator('#sort-filter option[value="score"]')).toHaveAttribute("disabled", "");

  await page.locator("#family-filter").selectOption("assistant_system");
  await expect(page.locator("#project-grid .score-ring")).toHaveCount(16);
  await expect(page.locator('#sort-filter option[value="score"]')).not.toHaveAttribute("disabled", "");
});

test("system comparisons require one family and restore from a shareable URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();
  await expect(page.locator("#project-grid .compare-toggle")).toHaveCount(0);

  await page.locator("#family-filter").selectOption("agent_system");
  await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
  await page.locator('#project-grid [data-compare-id="hermes-agent"]').click();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#comparison-tray-items")).toContainText("Kilo Code");
  await expect(page).toHaveURL(/compare=system%3Akilo-code%2Chermes-agent/);

  await page.locator("#comparison-open").click();
  await expect(page.locator("#comparison-dialog")).toBeVisible();
  await expect(page.locator("#comparison-dialog")).toContainText("Agent-system score");
  await expect(page.locator("#comparison-dialog thead")).toContainText("Kilo Code");
  await expect(page.locator("#comparison-dialog thead")).toContainText("Hermes Agent");
  await expect(page.locator("#comparison-dialog")).toContainText("Task Reliability · 20%");
  await page.locator("#comparison-dialog .dialog-close").click();

  await page.reload();
  await expect(page.locator("#family-filter")).toHaveValue("agent_system");
  await expect(page.locator("#comparison-dialog")).toBeVisible();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await page.locator("#comparison-dialog .dialog-close").click();
  await page.getByRole("button", { name: /^All / }).click();
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(page).not.toHaveURL(/compare=/);
});

test("inference-service comparison uses its dedicated decision context", async ({ page }) => {
  await page.goto("/?collection=inference");
  await page.locator('#inference-grid [data-compare-id="openai-api"]').click();
  await page.locator('#inference-grid [data-compare-id="amazon-bedrock"]').click();
  await page.locator("#comparison-open").click();

  await expect(page.locator("#comparison-dialog")).toContainText("Inference-service score");
  await expect(page.locator("#comparison-dialog")).toContainText("OpenAI API");
  await expect(page.locator("#comparison-dialog")).toContainText("Amazon Bedrock");
  await expect(page.locator("#comparison-dialog")).toContainText("Regional controls");
  await expect(page.locator("#comparison-dialog")).toContainText("excludes model quality");
});

test("comparison URLs reject cross-profile selections", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:kilo-code,t3-chat");

  await expect(page).not.toHaveURL(/compare=/);
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(page.locator("#comparison-dialog")).toBeHidden();
  await expect(page.locator("#family-filter")).toHaveValue("");
});

test("notable provider assistants are searchable and license-labeled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();
  await page.locator("#family-filter").selectOption("assistant_system");

  for (const name of [
    "Claude",
    "DeepSeek",
    "Gemini Apps",
    "Grok",
    "Microsoft 365 Copilot",
    "Microsoft Copilot",
    "Perplexity",
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

test("Perplexity assistant, Computer, and API remain distinct directory records", async ({ page }) => {
  await page.goto("/");
  await page.locator("#all-directory-search").fill("Perplexity");

  const cards = page.locator("#all-directory-grid .project-card");
  for (const name of ["Perplexity", "Perplexity Computer", "Perplexity API"]) {
    await expect(cards.filter({ has: page.getByRole("heading", { name, exact: true }) })).toHaveCount(1);
  }

  const assistantCard = cards.filter({ has: page.getByRole("heading", { name: "Perplexity", exact: true }) });
  await expect(assistantCard.locator(".family-label")).toContainText("System · Assistant system");
  await assistantCard.getByRole("button", { name: "View details →" }).click();
  await expect(page.locator("#project-dialog")).toContainText("Assistant-system score");
  await expect(page.locator("#project-dialog")).toContainText("Multi-provider");
});

test("reviewed named agent additions are searchable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Systems / }).click();

  for (const name of ["Kilo Code", "Hermes Agent", "Replit Agent", "Cua", "PRAXIST Beta", "Open Grok", "Warp", "Higgsfield Supercomputer"]) {
    await page.locator("#project-search").fill(name);
    await expect(page.locator("#project-grid .project-card h2")).toHaveText(name);
  }
});

test("finder offers assistant outcomes and preserves the selected role", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Finder", exact: true }).click();
  await page.getByRole("button", { name: /I need an assistant/ }).click();
  await page.getByRole("button", { name: /Use several models in one place/ }).click();
  await page.getByRole("button", { name: /Model and data portability/ }).click();

  await expect(page.locator(".finder-results h3").filter({ hasText: /^T3 Chat$/ })).toHaveCount(1);
  await expect(page.locator(".finder-result").filter({ hasText: "T3 Chat" }).locator(".card-monogram")).toHaveText("T");
  await page.getByRole("button", { name: "Browse matches →" }).click();
  await expect(page.getByRole("button", { name: /^Systems / })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/collection=systems/);
  await expect(page.locator("#family-filter")).toHaveValue("assistant_system");
  await expect(page.locator("#role-filter")).toHaveValue("multi_model_chat_client");
});

test("finder recommends inference services without crossing score profiles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Finder", exact: true }).click();
  await page.getByRole("button", { name: /I need an inference service/ }).click();
  await page.getByRole("button", { name: /Route across models and providers/ }).click();
  await page.getByRole("button", { name: /Traffic resilience/ }).click();

  await expect(page.locator(".finder-results .finder-result")).toHaveCount(3);
  await expect(page.locator(".finder-results .family-label").first()).toHaveText("Routing aggregator");
  await page.locator(".finder-results [data-finder-inference]").first().click();
  await expect(page.locator("#inference-dialog")).toContainText("Inference-service score");
  await page.locator("#inference-dialog .dialog-close").click();

  await page.getByRole("button", { name: "Browse matches →" }).click();
  await expect(page.getByRole("button", { name: /^Inference services / })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/collection=inference/);
  await expect(page.locator("#inference-type-filter")).toHaveValue("routing_aggregator");
});

test("the deployment filter reaches vendor-operated systems and reports itself as active", async ({ page }) => {
  await page.goto("/?collection=systems");

  const names = page.locator("#project-grid .project-card h2");
  await expect(names.filter({ hasText: /^Devin$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^smolagents$/ })).toHaveCount(1);

  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#deployment-filter").selectOption("managed_cloud");

  await expect(names.filter({ hasText: /^Devin$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^smolagents$/ })).toHaveCount(0);
  await expect(page.locator(".advanced-filter-shell summary")).toHaveText("More filters · 1 active");
});

test("the interface filter separates canvas builders from code libraries", async ({ page }) => {
  await page.goto("/?collection=systems");

  const names = page.locator("#project-grid .project-card h2");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#agent-interface-filter").selectOption("library");

  await expect(names.filter({ hasText: /^LangChain$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^Devin$/ })).toHaveCount(0);
  await expect(page.locator(".advanced-filter-shell summary")).toHaveText("More filters · 1 active");
});

test("directory cards carry product marks with monogram fallbacks", async ({ page }) => {
  await page.goto("/");

  await page.locator("#all-directory-search").fill("OpenAI API");
  const marked = page.locator("#all-directory-grid .project-card").filter({ hasText: "OpenAI API" }).first();
  await expect(marked.locator(".card-mark svg")).toHaveCount(1);

  await page.locator("#all-directory-search").fill("Aider");
  const fallback = page.locator("#all-directory-grid .project-card").filter({ hasText: "Aider" }).first();
  await expect(fallback.locator(".card-monogram")).toHaveText("A");
});
