const { test, expect } = require("@playwright/test");

// The card marks and the reviewed license evidence are the two largest files
// the page can load, and neither is needed to render the directory. These
// tests hold that line: the evidence is not requested until a record is
// opened, and the page stays correct when either file never arrives.

const dataRequests = page => {
  const paths = [];
  page.on("request", request => paths.push(new URL(request.url()).pathname));
  return paths;
};

test("license evidence is left unfetched until a record is opened", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");

  // Painted marks prove the deferred logo file has landed, so boot is over.
  await expect(page.locator('#project-grid .card-mark[data-mark] svg').first()).toBeVisible();
  expect(requested.filter(path => path.endsWith("/license-evidence.json"))).toHaveLength(0);

  await page.locator("#project-search").fill("Kilo Code");
  await page.locator('#project-grid [data-project="kilo-code"]').click();

  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  await expect(page.locator("#dialog-content").getByText("immutable evidence")).toBeVisible();
  expect(requested.filter(path => path.endsWith("/license-evidence.json"))).toHaveLength(1);
});

test("a record dialog falls back to its license ids when the evidence never arrives", async ({ page }) => {
  await page.route("**/license-evidence.json*", route => route.abort());
  await page.goto("/?collection=systems&record=system:kilo-code");

  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  const licensing = page.locator("#dialog-content .detail-block").filter({ hasText: "Licenses and terms" });
  await expect(licensing).toContainText("MIT");
  await expect(page.locator("#dialog-content [data-copy-record-link]")).toBeVisible();
});

test("the directory renders complete when the card marks never arrive", async ({ page }) => {
  await page.route("**/logos.json*", route => route.abort());
  await page.goto("/?collection=systems");

  await page.locator("#project-search").fill("Kilo Code");
  const card = page.locator('#project-grid .project-card').first();
  await expect(card.locator("h2")).toHaveText("Kilo Code");
  await expect(card.locator('.card-mark[data-mark="kilo-code"]')).toHaveClass(/card-monogram/);
  await expect(card.locator(".card-mark svg")).toHaveCount(0);
});

// The directory boots from web/app/*.json — a projection of the published
// endpoints shaped for a first render (ADR 026) — and reaches for the rest on
// demand: a record's detail when a dialog or a comparison needs it, a search
// index when a search box takes focus. These tests hold each of those lines.

test("boot fetches payloads, not the published endpoints", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();

  expect(requested.filter(path => path.endsWith("/app/systems.json"))).toHaveLength(1);
  expect(requested.filter(path => path.endsWith("/projects.json"))).toHaveLength(0);
  expect(requested.filter(path => path.includes("/app/search/"))).toHaveLength(0);
});

test("a deep-linked record fetches its detail and renders the full dialog", async ({ page }) => {
  await page.goto("/?collection=systems&record=system:kilo-code");
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  const strengths = page.locator("#dialog-content .detail-block").filter({ hasText: "Strengths" });
  await expect(strengths.locator("li").first()).toBeVisible();
  await expect(page.locator("#dialog-content .score-table tr")).not.toHaveCount(1);
});

test("focusing search loads the index and widens the results", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?collection=systems");
  await page.locator("#project-search").focus();
  await expect.poll(() => requested.filter(path => path.endsWith("/app/search/systems.json")).length).toBe(1);

  // "allowlist" appears only in the editorial prose the index carries, never
  // in a boot record, so a match here proves the index is doing the widening.
  await page.locator("#project-search").fill("allowlist");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
});

test("a restored comparison renders every score row", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:kilo-code,cline");
  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator(".comparison-table tbody tr").filter({ hasText: "Strengths" })).toHaveCount(1);
  await expect(page.locator(".comparison-table tbody tr")).not.toHaveCount(2);
});

test("the page still renders when a payload class never arrives", async ({ page }) => {
  await page.route("**/app/search/**", route => route.abort());
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("kilo");
  await expect(page.locator('#project-grid [data-project="kilo-code"]')).toBeVisible();
});

test("a comparison opens degraded, and bounded, when detail never arrives", async ({ page }) => {
  // A comparison waits for its records' detail before opening, and loadDetail
  // clears a failed request so the next reader retries. Waiting more than once
  // would therefore fetch forever and never open the dialog at all.
  let detailRequests = 0;
  await page.route("**/app/detail/**", route => { detailRequests += 1; route.abort(); });
  await page.goto("/?collection=systems&compare=system:kilo-code,cline");

  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator(".comparison-table tbody tr").filter({ hasText: "Strengths" })).toHaveCount(1);
  await expect(page.locator(".comparison-table")).not.toContainText("undefined");
  expect(detailRequests).toBeLessThanOrEqual(4);
});

// Blankness is the failure mode a payload split invites: a heading, a label or
// a whole dialog renders from the boot record while the detail file it reads is
// still in flight or never lands. Every check but a browser sees valid markup,
// so these three hold the line the reader actually sees.

test("pressing Compare says the details are loading rather than showing nothing", async ({ page }) => {
  await page.route("**/app/detail/**", async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/?collection=systems&compare=system:kilo-code,cline");

  // The dialog cannot open until the detail lands, so the tray's live region
  // must be the thing that speaks in the meantime.
  await expect(page.locator("#comparison-status")).toContainText("Loading");
  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator("#comparison-status")).toHaveText("");
});

test("a finder shortlist prints an em dash, not a dangling label, when detail never arrives", async ({ page }) => {
  await page.route("**/app/detail/**", route => route.abort());
  await page.goto("/");
  await page.locator('[data-tab="finder"]').click();
  for (let step = 0; step < 3; step += 1) {
    await page.locator("#finder-content .finder-choice").first().click();
  }

  const tradeoff = page.locator(".finder-result .finder-tradeoff").first();
  await expect(tradeoff).toBeVisible();
  await expect(tradeoff).toHaveText("Watch for: —");
});

test("a record dialog prints an em dash under a heading whose detail never arrives", async ({ page }) => {
  await page.route("**/app/detail/**", route => route.abort());
  await page.goto("/?collection=runtimes&record=runtime:ollama");

  await expect(page.locator("#runtime-dialog h1")).toHaveText("Ollama");
  const hardware = page.locator("#runtime-dialog-content .detail-block").filter({ hasText: "Hardware requirements" });
  await expect(hardware.locator("p")).toHaveText("—");
  await expect(page.locator("#runtime-dialog-content")).not.toContainText("undefined");
});

// The dash has to hold for every heading and every bold label, not just the
// prose ones — a heading over an empty <ul>, or a label followed by nothing, is
// the same blank to a reader. This walks one record of each kind, and one of
// each system_family because the systems dialog branches on it, and asserts
// that nothing a detail file would have filled is left empty.
const blankBodies = content => content.evaluate(root => {
  const blanks = [];
  const text = element => (element.textContent || "").trim();
  // Every element that can render nothing, `td` included: the inference and
  // runtime score tables label their rows from the taxonomy profile and read
  // the value off the record, so a missing detail file leaves a table full of
  // labels whose cells are blank while no block, list or paragraph is empty.
  for (const element of root.querySelectorAll("p, ul, ol, li, td, .detail-block")) {
    if (!text(element)) blanks.push(`empty <${element.tagName.toLowerCase()}>: ${text(element.previousElementSibling)}`);
  }
  for (const strong of root.querySelectorAll("p > strong")) {
    if (text(strong.parentElement) === text(strong)) blanks.push(`dangling label: ${text(strong)}`);
  }
  return blanks;
});

const BLANK_CHECKS = [
  ["an agent system", "/?collection=systems&record=system:kilo-code", "#dialog-content", "Kilo Code"],
  ["a memory system", "/?collection=systems&record=system:activitywatch", "#dialog-content", "ActivityWatch"],
  ["an assistant system", "/?collection=systems&record=system:chatgpt", "#dialog-content", "ChatGPT"],
  ["a specification", "/?record=spec:mcp", "#specification-dialog-content", "Model Context Protocol"],
  ["an inference service", "/?record=inference:openai-api", "#inference-dialog-content", "OpenAI API"],
  ["a local runtime", "/?collection=runtimes&record=runtime:ollama", "#runtime-dialog-content", "Ollama"],
  ["a model release", "/?record=model:model-anthropic-claude-sonnet-4-6", "#model-dialog-content", "Claude Sonnet 4.6"],
];

for (const [kind, url, selector, name] of BLANK_CHECKS) {
  test(`the dialog for ${kind} leaves no blank body when detail never arrives`, async ({ page }) => {
    await page.route("**/app/detail/**", route => route.abort());
    await page.goto(url);

    const content = page.locator(selector);
    await expect(content.locator("h1")).toHaveText(name);
    expect(await blankBodies(content)).toEqual([]);
    await expect(content).not.toContainText("undefined");
  });
}

test("a strengths list prints one em dash when detail never arrives", async ({ page }) => {
  await page.route("**/app/detail/**", route => route.abort());
  await page.goto("/?collection=systems&record=system:kilo-code");

  const strengths = page.locator("#dialog-content .detail-block").filter({ hasText: "Strengths" });
  await expect(strengths.locator("li")).toHaveText(["—"]);
});

// The systems dialog builds its score rows from the record's own score object,
// so a boot record carrying only `overall` yields no rows at all. The inference
// and runtime dialogs build theirs from the taxonomy profile, which is always
// loaded, so every row renders and only the value is missing — a different
// failure that only a check on the cells can see.
test("a score table built from the profile prints a dash in every cell detail would fill", async ({ page }) => {
  await page.route("**/app/detail/**", route => route.abort());
  await page.goto("/?record=inference:openai-api");

  const table = page.locator("#inference-dialog-content .score-table");
  await expect(table.locator("tr")).not.toHaveCount(1);
  const dimensions = table.locator("tr").filter({ hasNotText: "Overall" });
  await expect(dimensions.locator("td").nth(1)).toHaveText("—");
  expect(await dimensions.locator("td:nth-child(2)").allInnerTexts()).not.toContain("");
});

// Models are the fifth payload collection, and the last one wired up, so they
// get the same three lines the other four hold: boot reads the payload rather
// than the endpoint, a deep link fetches the record's own detail, and the
// search box fetches its index only once it has focus.
test("a deep-linked model boots from its payload and fetches its own detail", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?record=model:model-anthropic-claude-sonnet-4-6");

  await expect(page.locator("#model-dialog h1")).toHaveText("Claude Sonnet 4.6");
  expect(requested.filter(path => path.endsWith("/app/models.json"))).toHaveLength(1);
  expect(requested.filter(path => path.endsWith("/models.json") && !path.includes("/app/"))).toHaveLength(0);
  expect(requested.filter(path =>
    path.endsWith("/app/detail/model/model-anthropic-claude-sonnet-4-6.json"))).toHaveLength(1);

  const strengths = page.locator("#model-dialog-content .detail-block").filter({ hasText: "Strengths" });
  await expect(strengths.locator("li").first()).not.toHaveText("—");
  const dimensions = page.locator("#model-dialog-content .score-table tr").filter({ hasNotText: "Overall" });
  expect(await dimensions.locator("td:nth-child(2)").allInnerTexts()).not.toContain("—");
});

test("a model dialog degrades to dashes when its detail never arrives", async ({ page }) => {
  await page.route("**/app/detail/**", route => route.abort());
  await page.goto("/?record=model:model-anthropic-claude-sonnet-4-6");

  const content = page.locator("#model-dialog-content");
  await expect(content.locator("h1")).toHaveText("Claude Sonnet 4.6");
  // The overall score is a card field, so it survives; every dimension is
  // detail-only, and detailScore is null-safe so a real 0 still prints as 0.
  await expect(content.locator(".score-table tr").filter({ hasText: "Overall" })).toContainText("5.06");
  const dimensions = content.locator(".score-table tr").filter({ hasNotText: "Overall" });
  await expect(dimensions.locator("td").nth(1)).toHaveText("—");
  const boundary = content.locator(".detail-block").filter({ hasText: "Model boundary" });
  await expect(boundary.locator("p").first()).toHaveText("—");
  await expect(content.locator(".detail-block").filter({ hasText: "Tradeoffs" }).locator("li")).toHaveText(["—"]);
  await expect(content).not.toContainText("undefined");
});

test("focusing the model search loads the models index and widens the results", async ({ page }) => {
  const requested = dataRequests(page);
  await page.goto("/?view=models");
  await expect(page.locator("#model-grid .project-card").first()).toBeVisible();
  expect(requested.filter(path => path.includes("/app/search/"))).toHaveLength(0);

  await page.locator("#model-search").focus();
  await expect.poll(() => requested.filter(path => path.endsWith("/app/search/models.json")).length).toBe(1);

  // "retirement" appears only in the reviewed prose the index carries, never in
  // a boot record, so a match here proves the index is doing the widening.
  await page.locator("#model-search").fill("retirement");
  await expect(page.locator('#model-grid [data-model="model-anthropic-claude-sonnet-4-6"]')).toBeVisible();
});
