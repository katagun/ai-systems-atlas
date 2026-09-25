const { test, expect } = require("@playwright/test");

test("a family chip, a query, and a filter survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Memory / }).click();
  await page.locator("#project-search").fill("graph");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#license-filter").selectOption("MIT");
  await expect(page).toHaveURL(/family=memory_system/);
  await expect(page).toHaveURL(/q=graph/);
  await expect(page).toHaveURL(/license=MIT/);
  const before = await page.locator("#result-count").textContent();

  await page.reload();
  await expect(page.locator("#family-filter")).toHaveValue("memory_system");
  await expect(page.locator("#project-search")).toHaveValue("graph");
  await expect(page.locator("#license-filter")).toHaveValue("MIT");
  await expect(page.locator("#result-count")).toHaveText(before);
  await expect(page.locator('.collection-switcher [aria-pressed="true"]')).toHaveAccessibleName(/^Memory /);
});

test("values a control cannot take are removed from the URL rather than half-applied", async ({ page }) => {
  await page.goto("/?collection=systems&family=nope&role=nope&q=agent&type=direct_model_api");
  await expect(page.locator("#family-filter")).toHaveValue("");
  await expect(page.locator("#project-search")).toHaveValue("agent");
  await expect(page).not.toHaveURL(/family=/);
  await expect(page).not.toHaveURL(/role=/);
  await expect(page).not.toHaveURL(/type=/);
});

test("a comparison decides the family, and a disagreeing family is dropped", async ({ page }) => {
  await page.goto("/?collection=systems&family=memory_system&compare=system:kilo-code,aider");
  await expect(page.locator("#family-filter")).toHaveValue("agent_system");
  await expect(page).not.toHaveURL(/family=memory_system/);
});

test("the Models view restores its query and filters", async ({ page }) => {
  await page.goto("/?view=models&q=gemma&type=language_model");
  await expect(page.locator("#models")).toHaveClass(/is-active/);
  await expect(page.locator("#model-search")).toHaveValue("gemma");
  await expect(page.locator("#model-type-filter")).toHaveValue("language_model");
  await page.reload();
  await expect(page.locator("#model-search")).toHaveValue("gemma");
});

test("a page number restores, and changing scope clears the last scope's parameters", async ({ page }) => {
  await page.goto("/?page=2");
  await expect(page.locator("#all-directory-pager .pager-nav span")).toContainText("Page 2 of");

  await page.getByRole("button", { name: /^Inference services / }).click();
  await page.locator("#inference-type-filter").selectOption("direct_model_api");
  await expect(page).toHaveURL(/type=direct_model_api/);
  await page.getByRole("button", { name: /^Local runtimes / }).click();
  await expect(page).not.toHaveURL(/type=/);
  await expect(page).not.toHaveURL(/page=/);
});

test("a family chip opens its family on the first page", async ({ page }) => {
  await page.goto("/?collection=systems&page=5");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 5 of");
  await page.getByRole("button", { name: /^Memory / }).click();
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 1 of");
  await expect(page).not.toHaveURL(/page=/);
});

test("every scope's URL keys match its controls, and every control exists", async ({ page }) => {
  // AtlasCore.SCOPE_URL_PARAMS says which keys a scope writes, and app.js's
  // SCOPE_CONTROLS says which control holds each one. A key in only one of
  // them is never written, or always rejected on restore.
  await page.goto("/");
  const problems = await page.evaluate(() => {
    // Both are page globals. SCOPE_CONTROLS is a top-level const in a classic
    // script, so the page reaches it by name, though window does not hold it.
    /* global AtlasCore, SCOPE_CONTROLS */
    const params = AtlasCore.SCOPE_URL_PARAMS;
    const found = [];
    for (const scope of new Set([...Object.keys(params), ...Object.keys(SCOPE_CONTROLS)])) {
      const urlKeys = Object.keys(params[scope] || {}).sort().join(",");
      const controlKeys = Object.keys(SCOPE_CONTROLS[scope] || {}).sort().join(",");
      if (urlKeys !== controlKeys) found.push(`${scope}: URL keys [${urlKeys}], controls [${controlKeys}]`);
      for (const [key, selector] of Object.entries(SCOPE_CONTROLS[scope] || {})) {
        if (!document.querySelector(selector)) found.push(`${scope}.${key}: nothing matches ${selector}`);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
});

test("a record opens while the browser refuses history writes", async ({ page }) => {
  // WebKit throws a SecurityError once a page makes too many history calls in
  // a short window, a budget every writer on the page shares. Chromium drops
  // such calls silently, so here both methods throw from the start.
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException("Too many calls to the History API.", "SecurityError"); };
    window.history.pushState = refuse;
    window.history.replaceState = refuse;
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("Aider");
  await page.locator('#project-grid [data-project="aider"]').click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await page.locator("#project-dialog .dialog-close").click();
  await expect(page.locator("#project-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^Memory / }).click();
  await page.locator('.tab[data-tab="models"]').click();
  await expect(page.locator("#models")).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test("a comparison keeps the role and score sort chosen beside it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Agents / }).click();
  await page.locator("#role-filter").selectOption("coding_agent");
  await page.locator("#sort-filter").selectOption("score");
  await page.locator('#project-grid [data-compare-id="kilo-code"]').click();
  await page.locator('#project-grid [data-compare-id="aider"]').click();
  await expect(page).toHaveURL(/compare=system%3Akilo-code%2Caider/);

  await page.reload();
  await expect(page.locator("#comparison-tray-title")).toHaveText("2 items selected");
  await expect(page.locator("#role-filter")).toHaveValue("coding_agent");
  await expect(page.locator("#sort-filter")).toHaveValue("score");
  await expect(page).toHaveURL(/role=coding_agent/);
  await expect(page).toHaveURL(/sort=score/);
});

test("a restored query searches the same text a typed one does", async ({ page }) => {
  // The index is held, so the test watches the mechanism rather than trusting
  // the catalog: boot must request the index with nothing focused, and
  // "allowlist", which only the index's prose carries, must match nothing
  // until the index lands. A catalog change that puts the word in a boot
  // record fails the empty-grid check instead of passing without the index.
  let requested = false;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/app/search/systems.json*", async route => {
    requested = true;
    await held;
    await route.continue();
  });
  await page.goto("/?collection=systems&q=allowlist");
  await expect.poll(() => requested, { message: "boot requests the systems search index" }).toBe(true);
  await expect(page.locator("#result-count")).toHaveText(/^0 projects\b/);
  release();
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
});

test("a restored page beside a query survives the index widening the matches", async ({ page }) => {
  // The boot records alone match "rag" on one page; its index widens that to two.
  await page.goto("/?collection=systems&q=rag&page=2");
  await expect(page.locator("#project-pager .pager-nav span")).toContainText("Page 2 of");
  await expect(page).toHaveURL(/page=2/);
});

test("a reader who changes a filter before the index lands keeps their own page", async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/app/search/systems.json*", async route => { await held; await route.continue(); });
  await page.goto("/?collection=systems&q=rag&page=2");
  await expect(page.locator("#project-pager .pager-nav span")).toHaveText("Page 1 of 1");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#status-filter").selectOption("");
  release();
  await expect(page.locator("#project-pager .pager-nav span")).toHaveText(/^Page 1 of [2-9]/);
  await expect(page).not.toHaveURL(/page=/);
});
