const { test, expect } = require("@playwright/test");
const { viewTab } = require("./helpers/landing");
const catalogCounts = require("./helpers/catalog-counts");
const { clearFilters, expectFilter, recordHeading, recordView, search, setFilter, sortControl } = require("./helpers/results");

test("Labs lists every lab by name and filters by type, headquarters, and release distribution", async ({ page }) => {
  await page.goto("/?collection=labs");

  await expect(viewTab(page, "directory")).toHaveClass(/is-active/);
  await expect(page.locator("#labs-directory-panel")).not.toHaveAttribute("hidden");
  await expect(page.locator("#labs-kicker")).toHaveText(
    `${catalogCounts.labs} labs · developers of ${catalogCounts.labCoveredModels} of ${catalogCounts.reviewedModels} reviewed releases`,
  );
  await expect(page.locator("#lab-result-count")).toHaveText(`${catalogCounts.labs} labs · Unscored`);
  // The labs outrun the default 24 per page; one page of 96 lists them all.
  await page.locator('#lab-pager select[aria-label="Results per page"]').selectOption("96");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labNames());
  await expect(page.locator("#lab-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#lab-grid .compare-toggle")).toHaveCount(0);

  // Each card carries a circle per geography fact: the headquarters country,
  // and any reviewed research location beside it. The circles repeat what the
  // eyebrow and the dialog print in words, so they are hidden from assistive
  // technology (ADR 052).
  await expect(page.locator("#lab-grid .lab-card .card-flag")).toHaveCount(catalogCounts.labFlagsOnCards());
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-anthropic"]) .card-flag')).toHaveCount(1);
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-anthropic"]) .card-flag')).toHaveAttribute("aria-hidden", "true");
  // Higgsfield AI is a San Francisco entity whose engineering sits in Almaty.
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-higgsfield-ai"]) .card-flag')).toHaveCount(2);
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-hugging-face"]) .card-flag')).toHaveCount(0);

  await setFilter(page, "labs", "type", "technology_company");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(
    catalogCounts.labNames(lab => lab.lab_type === "technology_company"),
  );
  await clearFilters(page, "labs");
  await setFilter(page, "labs", "headquarters", "cn");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labNames(lab => lab.headquarters === "cn"));
  await clearFilters(page, "labs");
  await setFilter(page, "labs", "distribution", "downloadable_weights");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(
    catalogCounts.labsWithReleaseDistribution("downloadable_weights"),
  );

  // The organization note is detail-only; the search index still reaches it.
  // A search orders by match rather than by name (ADR 040), so both sides are
  // sorted here: which labs match is the assertion, not where they land.
  await clearFilters(page, "labs");
  await search(page, "Hangzhou");
  const headings = await page.locator("#lab-grid .lab-card h2").allTextContents();
  expect(headings.sort()).toEqual([...catalogCounts.labsMatching("Hangzhou")].sort());
});

test("a lab dialog joins the records that name the lab and browses its releases in Models", async ({ page }) => {
  await page.goto("/?collection=labs");
  await page.locator('#lab-grid .card-open[data-lab="lab-anthropic"]').click();

  const dialog = recordView(page, "lab");
  await expect(dialog.locator("h1")).toHaveText("Anthropic");
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-anthropic/);
  const releases = catalogCounts.reviewedModelsDevelopedBy("lab-anthropic");
  await expect(dialog.getByRole("heading", { name: `Reviewed model releases · ${releases.length}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Anthropic API", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Claude Code", exact: true })).toBeVisible();
  // Detail-only fields paint once app/detail/lab/lab-anthropic.json lands.
  await expect(dialog.getByRole("link", { name: /Responsible Scaling Policy/ })).toBeVisible();
  await expect(dialog).toContainText("does not assess whether or how it is followed");

  // Models continues the dialog's newest-first list instead of the score order.
  await dialog.locator('[data-browse-lab-models="lab-anthropic"]').click();
  await expect(viewTab(page, "directory")).toHaveClass(/is-active/);
  await expect(page.locator("#models-directory-panel")).not.toHaveAttribute("hidden");
  await expectFilter(page, "models", "lab", "lab-anthropic");
  await expect(sortControl(page, "models")).toHaveValue("release");
  await page.locator('#model-pager select[aria-label="Results per page"]').selectOption("96");
  await expect(page.locator("#model-grid .project-card:not(.imported-model-card) h2")).toHaveText(
    catalogCounts.reviewedModelsDevelopedByNewestFirst("lab-anthropic"),
  );

  await clearFilters(page, "models");
  await expectFilter(page, "models", "lab", "");
  await expect(sortControl(page, "models")).toHaveValue("score");
});

test("a lab dialog fits a phone screen with its longest channel URL and name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [catalogCounts.labIdWithLongestChannel, catalogCounts.labIdWithLongestNameWord]) {
    await page.goto(`/?collection=labs&record=lab:${id}`);
    const dialog = recordView(page, "lab");
    // Channels are detail-only; measure once they have painted.
    await expect(dialog.locator(".lab-channel-link").first()).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth), id).toBe(0);
  }
});

test("a lab admitted on a system explains its empty release join instead of listing nothing", async ({ page }) => {
  // An explicit id, not a lookup by basis: three labs now share this basis and
  // the test asserts which one it means.
  await page.goto("/?collection=labs&record=lab:lab-stanford-nlp");
  const dialog = recordView(page, "lab");
  await expect(dialog.locator("h1")).toHaveText("Stanford NLP Group");
  await expect(dialog).toContainText("Recorded because:");
  await expect(dialog).toContainText("Reviewed system");

  // ADR 048: a research group joins from a system, so the Models block is empty
  // and has to say why rather than print a bare zero over an empty list.
  const releases = dialog.locator(".detail-block").filter({ hasText: "Reviewed model releases" });
  await expect(releases.locator("h3")).toHaveText("Reviewed model releases · 0");
  await expect(releases).toContainText("recorded on a system it built");
  await expect(dialog.locator("[data-browse-lab-models]")).toHaveCount(0);
  // Nothing in the catalog names the group, so that line is omitted, not blank.
  await expect(dialog).not.toContainText("Named in the catalog as");

  const systems = dialog.locator(".detail-block").filter({ hasText: "Systems it builds" });
  await expect(systems).toContainText("DSPy");
});

test("a lab's dialog names the work location its card's second circle stands for", async ({ page }) => {
  await page.goto("/?collection=labs&record=lab:lab-higgsfield-ai");
  const dialog = recordView(page, "lab");

  // The San Francisco entity and the Almaty engineering are two different facts,
  // and the dialog keeps them apart rather than folding one into the other.
  await expect(dialog).toContainText("Headquarters:");
  await expect(dialog).toContainText("United States");
  await expect(dialog).toContainText("Work also happens in: Kazakhstan");

  // A lab with no reviewed work location prints no such line at all.
  await page.goto("/?collection=labs&record=lab:lab-hugging-face");
  await expect(recordView(page, "lab")).not.toContainText("Work also happens in:");
});

test("a lab joined to systems but to no release says so instead of listing nothing", async ({ page }) => {
  await page.goto("/?collection=labs&record=lab:lab-hugging-face");
  const dialog = recordView(page, "lab");
  await expect(recordHeading(page, "lab")).toHaveText("Hugging Face");
  await expect(dialog).toContainText("Recorded because:");
  await expect(dialog).toContainText("Reviewed system");
  // The parent line is omitted rather than blank: the record names no parent.
  await expect(dialog).not.toContainText("Parent organization:");

  // No reviewed release to join, so no control offers to browse zero releases.
  const releases = dialog.locator(".detail-block").filter({ hasText: "Reviewed model releases" });
  await expect(releases.locator("h3")).toHaveText("Reviewed model releases · 0");
  await expect(dialog.locator("[data-browse-lab-models]")).toHaveCount(0);

  // Every join the record does have, across four collections.
  await expect(dialog.locator(".detail-block").filter({ hasText: "Systems it builds" })).toContainText("smolagents");
  await expect(dialog.locator(".detail-block").filter({ hasText: "Systems it builds" })).toContainText("LeRobot");
  await expect(dialog.locator(".detail-block").filter({ hasText: "Inference services it operates" }))
    .toContainText("Hugging Face Inference Endpoints");
  await expect(dialog).toContainText("Named in the catalog as:");

  // The card names systems inline and counts the joins it does not list in tags.
  const card = page.locator('#lab-grid .lab-card:has([data-lab="lab-hugging-face"])');
  await expect(card.locator('.lab-related-label:text-matches("Systems it builds")')).toHaveText("Systems it builds · 2");
  await expect(card.locator(".tags span")).toHaveText(["2 inference services", "1 local runtime"]);
});

test("a lab card opens an inline release above the card details target", async ({ page }) => {
  await page.goto("/?collection=labs");
  const card = page.locator('#lab-grid .lab-card:has([data-lab="lab-anthropic"])');
  const releaseRow = card.locator(".lab-related-list li").first();
  await expect(releaseRow.locator(".lab-related-date")).not.toBeEmpty();
  await releaseRow.locator("[data-open-model]").click();
  await expect(recordHeading(page, "model")).toBeVisible();
  await expect(recordView(page, "lab")).toBeHidden();
});

test("a model dialog links to the lab that developed the release", async ({ page }) => {
  await page.goto("/?collection=models&record=model:model-deepseek-deepseek-v4-pro");
  await expect(recordHeading(page, "model")).toHaveText("DeepSeek V4 Pro");

  await recordView(page, "model").locator('[data-open-lab="lab-deepseek"]').click();
  await expect(recordHeading(page, "lab")).toHaveText("DeepSeek");
  await expect(recordView(page, "model")).toBeHidden();
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-deepseek/);
});

test("a lab share page names the organization and opens the lab in the Atlas", async ({ page }) => {
  await page.goto("/records/labs/lab-anthropic/");

  await expect(page).toHaveTitle("Anthropic · peacefulcoexistance");
  await expect(page.locator("h1")).toHaveText("Anthropic");
  await expect(page.locator("main")).toContainText("Responsible Scaling Policy");

  await page.getByRole("link", { name: /Open in the directory/ }).click();
  await expect(page).toHaveURL(/record=lab(%3A|:)lab-anthropic/);
  await expect(recordHeading(page, "lab")).toHaveText("Anthropic");
});
