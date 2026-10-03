const { test, expect } = require("@playwright/test");
const { viewTab } = require("./helpers/landing");
const catalogCounts = require("./helpers/catalog-counts");
const { clearFilters, closeRecord, expectFilter, recordHeading, recordView, search, setFilter, sortControl } = require("./helpers/results");

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

  // Each card carries its headquarters flag on the organization's mark, except
  // where the record lists no headquarters, and the flag repeats the country the
  // eyebrow already names, so it is hidden from assistive technology.
  await expect(page.locator("#lab-grid .lab-card .card-flag")).toHaveCount(catalogCounts.labNamesWithFlag().length);
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-anthropic"]) .card-flag')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-hugging-face"]) .card-flag')).toHaveCount(0);
  await expect(page.locator('#lab-grid .lab-card:has([data-lab="lab-higgsfield-ai"]) .card-flag')).toHaveCount(1);

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
  await clearFilters(page, "labs");
  await search(page, "Hangzhou");
  await expect(page.locator("#lab-grid .lab-card h2")).toHaveText(catalogCounts.labsMatching("Hangzhou"));
});

test("a lab dialog joins the records that name the lab and browses its releases in Models", async ({ page }) => {
  await page.goto("/?collection=labs");
  // The card's own details control. A capped card's release list adds a second
  // [data-lab] for the same record, so this asks for the footer control.
  await page.locator('#lab-grid .lab-card .card-open[data-lab="lab-anthropic"]').click();

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

  // The card's count row drops the zeros rather than printing a 0, and leaves out
  // the two joins the card names below it, which carry their own totals.
  const card = page.locator('#lab-grid .lab-card:has(.card-open[data-lab="lab-hugging-face"])');
  await expect(card.locator(".tags span")).toHaveText(["2 inference services", "1 local runtime"]);
});

// A lab card names the records behind the organization, so a reader in search
// results reaches a release or a system without opening the lab first.
test("a lab card names the releases and systems behind the organization", async ({ page }) => {
  await page.goto("/?collection=labs");
  const card = page.locator('#lab-grid .lab-card:has(.card-open[data-lab="lab-anthropic"])');

  // Releases, newest first, continuing the dialog's own order, then the systems
  // it builds. Two groups, so a lab that joins to one of them shows one.
  const releases = catalogCounts.reviewedModelsDevelopedByNewestFirst("lab-anthropic");
  const systems = catalogCounts.labSystemsByName("lab-anthropic");
  await expect(card.locator(".lab-related-label")).toHaveText([
    `Reviewed releases · ${releases.length}`, `Systems it builds · ${systems.length}`,
  ]);
  await expect(card.locator(".lab-related-list .link-button")).toHaveText([...releases.slice(0, 4), ...systems]);

  // A listed release opens that release, not the lab the card is for.
  await card.locator("[data-open-model]").first().click();
  await expect(recordHeading(page, "model")).toHaveText(releases[0]);
  await closeRecord(page, "model");

  // And a listed system opens that system.
  await card.locator("[data-open-project]").first().click();
  await expect(recordHeading(page, "system")).toHaveText(systems[0]);
  await closeRecord(page, "system");

  // The rest of the card is still the lab's own target.
  await card.locator(".card-open").click();
  await expect(recordHeading(page, "lab")).toHaveText("Anthropic");
});

// Four is the card's cap, and the control that reports the rest steps into the
// dialog rather than silently truncating the join.
test("a lab card caps its lists and hands the remainder to the dialog", async ({ page }) => {
  await page.goto("/?collection=labs");
  // The largest join is past the first page of results, so this browses them all.
  await page.locator('#lab-pager select[aria-label="Results per page"]').selectOption("96");
  const labId = catalogCounts.labIdWithMostReleases();
  const card = page.locator(`#lab-grid .lab-card:has(.card-open[data-lab="${labId}"])`);
  const total = catalogCounts.reviewedModelsDevelopedBy(labId).length;
  expect(total).toBeGreaterThan(4);

  // The heading states the total, so the cap is visible rather than implied.
  await expect(card.locator(".lab-related-group").first().locator(".lab-related-label"))
    .toHaveText(`Reviewed releases · ${total}`);
  await expect(card.locator(".lab-related-group").first().locator("[data-open-model]")).toHaveCount(4);

  const name = await card.locator("h2").textContent();
  const more = card.locator(".lab-related-more button").first();
  // The lab's name rides along in the control's hidden text, because a page of
  // cards would otherwise hold several buttons with one name.
  await expect(more).toHaveText(`All ${total} reviewed releases from ${name} →`);
  await more.click();
  await expect(recordHeading(page, "lab")).toHaveText(name);
  await expect(recordView(page, "lab").getByRole("heading", { name: `Reviewed model releases · ${total}` })).toBeVisible();
});

// A lab joined to nothing says nothing rather than printing an empty heading,
// which would read as a gap in the catalog (ADR 044, ADR 048).
test("a lab joined to no release and no system lists neither", async ({ page }) => {
  await page.goto("/?collection=labs");
  await page.locator('#lab-pager select[aria-label="Results per page"]').selectOption("96");
  const card = page.locator('#lab-grid .lab-card:has(.card-open[data-lab="lab-safe-superintelligence"])');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".lab-related")).toHaveCount(0);
  await expect(card.locator(".tags")).toHaveCount(0);
});

// Everything holds the same lab card, so the records it names are reachable from
// the mixed grid without switching scope.
test("an Everything lab card names the same records as the Labs grid", async ({ page }) => {
  await page.goto("/?collection=all&q=Black+Forest+Labs");
  const card = page.locator('#all-directory-grid .lab-card:has(.card-open[data-lab="lab-black-forest-labs"])');
  const releases = catalogCounts.reviewedModelsDevelopedByNewestFirst("lab-black-forest-labs");
  await expect(card.locator("[data-open-model]")).toHaveText(releases);
  await card.locator("[data-open-model]").first().click();
  await expect(recordHeading(page, "model")).toHaveText(releases[0]);
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
