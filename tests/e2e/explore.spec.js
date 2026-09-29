const { test, expect } = require("@playwright/test");
const { openView } = require("./helpers/landing");
const { expectFilter, recordHeading, recordView } = require("./helpers/results");
const { models } = require("../../directory/models.json");
const taxonomy = require("../../directory/taxonomy.json");
const { runtimes } = require("../../directory/local-runtimes.json");

test("Explore counts reviewed releases and every matrix link matches its catalog slice", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await openView(page, "explore");
  await expect(page).toHaveURL(/view=explore/);
  await expect(page.locator("#explore-data-note")).toContainText(`${models.length} reviewed releases`);
  await expect(page.locator(".docs-button")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#badge-legend")).not.toBeVisible();
  await expect(page.locator("#explore .score-ring, #explore .compare-toggle")).toHaveCount(0);
  const links = await page.locator(".access-matrix a").evaluateAll(items => items.map(item => ({
    href: item.getAttribute("href"), count: Number(item.querySelector("strong").textContent),
  })));
  expect(links.length).toBeGreaterThan(0);
  for (const { href, count } of links) {
    const params = new URLSearchParams(href.slice(1));
    const expected = models.filter(model => model.source_model === params.get("sourceModel")
      && model.distribution_modes.includes(params.get("distribution")));
    expect(count).toBe(expected.length);
    await page.goto(`/${href}`);
    await expect(page.locator("#model-result-count")).toContainText(`${count} ${count === 1 ? "model" : "models"} ·`);
    await expect(page.locator("#model-grid .imported-model-card")).toHaveCount(0);
    await expectFilter(page, "models", "sourceModel", params.get("sourceModel"));
    await expectFilter(page, "models", "distribution", params.get("distribution"));
  }
  expect(errors).toEqual([]);
});

test("distribution links, record dialogs, reload and Back preserve the exploration path", async ({ page }) => {
  await page.goto("/?view=explore");
  for (const mode of taxonomy.model_distribution_modes) {
    const expected = models.filter(model => model.distribution_modes.includes(mode.id)).length;
    const link = page.locator(`.access-route-list a[href*="distribution=${mode.id}"]`);
    await expect(link.locator("strong")).toHaveText(String(expected));
  }
  const link = page.locator(".access-route-list a").first();
  await link.focus();
  await page.keyboard.press("Enter");
  await expectFilter(page, "models", "distribution", "downloadable_weights");
  await page.reload();
  await expectFilter(page, "models", "distribution", "downloadable_weights");
  await page.locator("#model-grid [data-model]").first().click();
  await expect(recordView(page, "model")).toBeVisible();
  await page.goBack();
  await expect(recordView(page, "model")).not.toBeVisible();
  await page.goBack();
  await expect(page.locator("#explore")).toBeVisible();
  await page.reload();
  await expect(page.locator("#explore-title")).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`Explore fits desktop and phones in ${theme} without additional payloads`, async ({ page, baseURL }) => {
    const external = [];
    const details = [];
    page.on("request", request => {
      if (!request.url().startsWith(baseURL)) external.push(request.url());
      if (request.url().includes("/app/detail/")) details.push(request.url());
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?view=explore", { waitUntil: "networkidle" });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".access-matrix")).toBeVisible();
      const main = await page.locator("main").boundingBox();
      const explore = await page.locator("#explore").boundingBox();
      expect(explore.x).toBe(main.x);
      expect(explore.width).toBe(main.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const cell of await page.locator(".access-matrix a").all()) {
        expect(await cell.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      }
      if (width < 400) {
        const scroll = page.locator(".runtime-matrix-scroll");
        await scroll.focus();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      }
    }
    for (const table of ["#deployment-heatmap", "#local-license-table"]) {
      const scroll = page.locator(table).locator("..");
      await scroll.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByText("About these counts", { exact: true }).click();
    await expect(page.locator(".explore-method")).toContainText("not market share");
    expect(external).toEqual([]);
    expect(details).toEqual([]);
});
}

test("runtime matrix cells match reviewed traits in every feature group", async ({ page }) => {
  await page.goto("/?view=explore");
  const ordered = [...runtimes].sort((a, b) => a.name.localeCompare(b.name));
  const groups = { accelerators: "runtime_accelerators", model_formats: "runtime_model_formats", api_styles: "inference_api_styles" };
  for (const [field, group] of Object.entries(groups)) {
    await page.locator("#matrix-columns").selectOption(field);
    const columns = taxonomy[group].filter(item => runtimes.some(runtime => runtime[field].includes(item.id)));
    await expect(page.locator(".runtime-matrix tbody th a")).toHaveText(ordered.map(runtime => runtime.name));
    const cells = await page.locator(".runtime-matrix tbody tr").evaluateAll(rows => rows.map(row => [...row.querySelectorAll("td")].map(cell => cell.classList.contains("is-recorded"))));
    expect(cells).toEqual(ordered.map(runtime => columns.map(column => runtime[field].includes(column.id))));
  }
});

test("runtime filters, catalog handoff, details and Back restore the matrix", async ({ page }) => {
  await page.goto("/?view=explore");
  await page.locator("#matrix-accelerator").selectOption("metal");
  await page.locator("#matrix-format").selectOption("gguf");
  await page.locator("#matrix-columns").selectOption("api_styles");
  const matches = runtimes.filter(runtime => runtime.accelerators.includes("metal") && runtime.model_formats.includes("gguf"));
  await expect(page.locator("#runtime-matrix-count")).toHaveText(`${matches.length} of ${runtimes.length} reviewed runtimes`);
  await expect(page).toHaveURL(/runtimeAccelerator=metal/);
  await page.reload();
  await expect(page.locator("#matrix-accelerator")).toHaveValue("metal");
  await expect(page.locator("#matrix-format")).toHaveValue("gguf");
  await expect(page.locator("#matrix-columns")).toHaveValue("api_styles");
  await page.locator("#runtime-matrix-browse").click();
  await expectFilter(page, "runtimes", "accelerator", "metal");
  await expectFilter(page, "runtimes", "modelFormat", "gguf");
  await expect(page.locator("#runtime-grid .project-card")).toHaveCount(matches.length);
  await page.goBack();
  await expect(page.locator("#matrix-format")).toHaveValue("gguf");
  const first = page.locator(".runtime-matrix tbody a").first();
  const name = await first.textContent();
  await first.click();
  await expect(recordHeading(page, "runtime")).toHaveText(name);
  await page.goBack();
  await expect(page.locator("#explore")).toBeVisible();
  await expect(page.locator("#matrix-columns")).toHaveValue("api_styles");
  await page.locator("#matrix-reset").click();
  await expect(page.locator("#runtime-matrix-count")).toHaveText(`${runtimes.length} of ${runtimes.length} reviewed runtimes`);
  await expect(page).not.toHaveURL(/runtimeAccelerator|runtimeFormat|matrix=/);
});

test("runtime matrix handles empty slices and invalid URL values without inventing support", async ({ page }) => {
  await page.goto("/?view=explore&matrix=constructor&runtimeAccelerator=invalid&runtimeFormat=invalid");
  await expect(page.locator("#matrix-columns")).toHaveValue("accelerators");
  await expect(page).not.toHaveURL(/constructor|invalid/);
  const pair = taxonomy.runtime_accelerators.flatMap(accelerator => taxonomy.runtime_model_formats.map(format => [accelerator.id, format.id]))
    .find(([accelerator, format]) => runtimes.some(runtime => runtime.accelerators.includes(accelerator))
      && runtimes.some(runtime => runtime.model_formats.includes(format))
      && !runtimes.some(runtime => runtime.accelerators.includes(accelerator) && runtime.model_formats.includes(format)));
  await page.locator("#matrix-accelerator").selectOption(pair[0]);
  await page.locator("#matrix-format").selectOption(pair[1]);
  await expect(page.locator("#runtime-matrix-content")).toContainText("No reviewed runtimes match both filters");
  await expect(page.locator(".runtime-matrix")).toHaveCount(0);
  await openView(page, "directory");
  await expect(page).not.toHaveURL(/runtimeAccelerator|runtimeFormat|matrix=/);
});


test("system analysis cells match active catalog slices and preserve exploration history", async ({ page }) => {
  const { projects } = require("../../directory/projects.json");
  const active = projects.filter(project => project.status === "active");
  await page.goto("/?view=explore#deployment-title");
  await expect(page.locator("#deployment-data-note")).toContainText(`${active.length} active reviewed systems`);
  const links = await page.locator(".deployment-table a").evaluateAll(items => items.map(item => ({ href: item.getAttribute("href"), count: Number(item.querySelector("strong").textContent) })));
  expect(links.length).toBeGreaterThan(0);
  for (const { href, count } of links) {
    const params = new URLSearchParams(href.slice(1));
    const matches = active.filter(project => (!params.has("family") || project.system_family === params.get("family"))
      && (!params.has("deployment") || project.deployment.includes(params.get("deployment")))
      && (!params.has("sourceModel") || project.source_model === params.get("sourceModel"))
      && (!params.has("localOnly") || project.local_first === (params.get("localOnly") === "1")));
    expect(count).toBe(matches.length);
  }
  for (const selector of ['#deployment-heatmap a', '#local-license-table a[href*="localOnly=1"]', '#local-license-table a[href*="localOnly=0"]']) {
    const link = page.locator(selector).first();
    const count = await link.locator("strong").textContent();
    const href = await link.getAttribute("href");
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#result-count")).toContainText(`${count} `);
    await page.reload();
    await expect(page.locator("#result-count")).toContainText(`${count} `);
    const params = new URLSearchParams(href.slice(1));
    if (params.has("localOnly")) await expectFilter(page, "systems", "localOnly", params.get("localOnly"));
    await page.locator("#project-grid [data-project]").first().click();
    await expect(recordView(page, "system")).toBeVisible();
    await page.goBack();
    await expect(recordView(page, "system")).not.toBeVisible();
    await page.goBack();
    await expect(page.locator("#system-deployment")).toBeVisible();
    await expect(page).toHaveURL(/view=explore#deployment-title/);
  }
  await page.goto("/?collection=systems&localOnly=unknown");
  await expectFilter(page, "systems", "localOnly", "unknown");
  await expect(page.locator("#project-grid .project-card")).toHaveCount(0);
});
