const { test, expect } = require("@playwright/test");
const { badgeLegend } = require("../../web/app-core.js");

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Accelerator badges (apple-metal, amd-rocm, npu) draw mono letters (MTL, ROC,
// NPU) inside the emblem's own SVG <text>, which precedes the <li>'s label
// span in DOM order and so in textContent — the same characteristic
// tests/e2e/card-badges.spec.js already works around for the card badge row.
// Anchoring to the end of the string tolerates that prefix without weakening
// the assertion: the label itself still must match exactly.
const names = legend => legend.badges.map(badge => new RegExp(`${escapeRegExp(badge.name)}$`));
const legend = page => page.locator("#badge-legend");
const items = page => page.locator("#badge-legend-items > li");

test("the legend lists the active scope's badges and follows the scope", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(legend(page)).toBeVisible();
  await expect(items(page)).toHaveText(names(badgeLegend("inference")));

  await page.locator('[data-directory-collection="runtimes"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("runtimes")));

  await page.locator('[data-directory-collection="systems"][data-directory-family="memory_system"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("systems", "memory_system")));

  // The plain "Systems" switcher pill only changes the collection — the
  // family filter itself (the actual scope narrower) is untouched by it, same
  // as the grid it drives, so the family select is how a reader widens back
  // out to every system family. This also exercises the #family-filter input
  // listener's syncBadgeLegend() call.
  await page.locator("#family-filter").selectOption("");
  await expect(items(page)).toHaveText(names(badgeLegend("systems")));
});

test("mixed scopes show only the families, and badge-less views show nothing", async ({ page }) => {
  await page.goto("/");
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).first()).toContainText("Control and privacy");
  await expect(items(page).first()).toContainText("Where your data lives");

  await page.locator('[data-tab="models"]').click();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();

  await page.locator('[data-tab="taxonomy"]').click();
  await expect(legend(page)).toBeHidden();
});

test("closing the legend leaves a Key chip and the choice survives a reload", async ({ page }) => {
  await page.goto("/?collection=systems");
  const chip = page.locator("#badge-legend-chip");
  await expect(chip).toBeHidden();
  await page.locator("#badge-legend-close").click();
  await expect(legend(page)).toBeHidden();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "false");

  await page.reload();
  await expect(legend(page)).toBeHidden();
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(legend(page)).toBeVisible();
  await expect(chip).toBeHidden();
});

test("the legend yields to the comparison tray", async ({ page }) => {
  // The Compare control only exists once a family narrows the grid to one
  // score profile (comparisons are never comparable across families), so a
  // family must be selected before any [data-compare-id] button exists.
  await page.goto("/?collection=systems");
  await page.locator('[data-directory-collection="systems"][data-directory-family="memory_system"]').click();
  await expect(legend(page)).toBeVisible();
  await page.locator("#project-grid [data-compare-id]").first().click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeVisible();
});

test("the open legend never covers the site footer, and phones start collapsed", async ({ page, browser }) => {
  await page.goto("/?collection=inference");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = await page.locator("footer").boundingBox();
  const strip = await legend(page).boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(strip.y + 1);

  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, baseURL: test.info().project.use.baseURL });
  const small = await phone.newPage();
  await small.goto("/?collection=inference");
  await expect(small.locator("#badge-legend")).toBeHidden();
  await expect(small.locator("#badge-legend-chip")).toBeVisible();
  await phone.close();
});

test("All badges opens the Taxonomy glossary without a tab stop on any emblem", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(legend(page).locator("svg [tabindex], li[tabindex]")).toHaveCount(0);
  await page.locator("#badge-legend-more").click();
  await expect(page.locator("#taxonomy")).toHaveClass(/is-active/);
});
