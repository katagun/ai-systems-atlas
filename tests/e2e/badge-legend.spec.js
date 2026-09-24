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

test("mixed scopes show only the families, sibling views name their own sets, and badge-less views show nothing", async ({ page }) => {
  await page.goto("/");
  await expect(items(page)).toHaveCount(4);
  await expect(items(page).first()).toContainText("Type");
  await expect(items(page).first()).toContainText("What kind of record it is");
  await expect(items(page).nth(1)).toContainText("Control and privacy");

  await page.locator('[data-tab="models"]').click();
  await expect(legend(page)).toBeVisible();
  await expect(items(page)).toHaveText(names(badgeLegend("models")));

  await page.locator('[data-tab="specifications"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("specifications")));

  await page.locator('[data-tab="labs"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("labs")));

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
  // Focus follows the toggle so a keyboard reader is never dropped on <body>.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("badge-legend-chip");

  await page.reload();
  await expect(legend(page)).toBeHidden();
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(legend(page)).toBeVisible();
  await expect(chip).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("badge-legend-close");
});

test("the legend and its Key chip step aside for the comparison tray", async ({ page }) => {
  // The Compare control only exists once a family narrows the grid to one
  // score profile (comparisons are never comparable across families), so a
  // family must be selected before any [data-compare-id] button exists.
  await page.goto("/?collection=systems");
  await page.locator('[data-directory-collection="systems"][data-directory-family="memory_system"]').click();
  await expect(legend(page)).toBeVisible();
  await page.locator("#project-grid [data-compare-id]").first().click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();

  // Clearing the comparison hands the edge back to the reader's stored choice.
  await page.locator("#comparison-clear").click();
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(legend(page)).toBeVisible();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();
});

test("the Models legend also steps aside for the comparison tray", async ({ page }) => {
  // Unlike Systems, every reviewed-model card carries a Compare control with
  // no family narrowing needed first.
  await page.goto("/?view=models");
  await expect(legend(page)).toBeVisible();
  await expect(items(page)).toHaveText(names(badgeLegend("models")));
  await page.locator('#model-grid [data-compare-id]').first().click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();

  await page.locator("#comparison-clear").click();
  await expect(page.locator("#comparison-tray")).toBeHidden();
  await expect(legend(page)).toBeVisible();
});

// Resolves once the page stops scrolling: focus scrolling honours the page's
// `scroll-behavior: smooth`, so measure only after it settles.
const settleScroll = page => page.evaluate(() => new Promise(resolve => {
  let last = window.scrollY;
  const check = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (window.scrollY === last) return resolve();
    last = window.scrollY;
    check();
  }));
  check();
}));

// The footer's clearance is the strip's measured height, applied once, so at
// the bottom of the page the footer sits flush above the strip: neither under
// it nor above a band of empty space.
async function expectFooterClearsLegend(page) {
  // `goto` resolves on load, before the data-driven first render; the legend
  // appears in the same task as that render, so wait for it before scrolling.
  await expect(page.locator("#badge-legend")).toBeVisible();
  // Jump to the end and poll until the page rests there: a smooth scroll can
  // look settled before it starts, and the end moves if the page grows after
  // the jump. Both edges then come from the one layout that met the condition.
  const edges = await page.waitForFunction(() => {
    const end = document.documentElement.scrollHeight - window.innerHeight;
    if (Math.abs(window.scrollY - end) > 0.5) {
      window.scrollTo({ top: end, behavior: "instant" });
      return null;
    }
    return {
      footerBottom: document.querySelector("footer").getBoundingClientRect().bottom,
      stripTop: document.querySelector("#badge-legend").getBoundingClientRect().top,
    };
  }).then(handle => handle.jsonValue());
  expect(edges.footerBottom).toBeLessThanOrEqual(edges.stripTop + 1);
  expect(edges.footerBottom).toBeGreaterThanOrEqual(edges.stripTop - 1);
}

test("the open legend never covers the site footer, and phones start collapsed", async ({ page, browser }) => {
  await page.goto("/?collection=inference");
  await expectFooterClearsLegend(page);

  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, baseURL: test.info().project.use.baseURL });
  const small = await phone.newPage();
  await small.goto("/?collection=inference");
  await expect(small.locator("#badge-legend")).toBeHidden();
  await expect(small.locator("#badge-legend-chip")).toBeVisible();

  // Systems is the widest scope; at phone width its strip wraps to several rows.
  await small.goto("/?collection=systems");
  await small.locator("#badge-legend-chip").click();
  await expect(small.locator("#badge-legend")).toBeVisible();
  await expectFooterClearsLegend(small);
  await phone.close();
});

test("keyboard focus never lands under the open legend", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?collection=systems");
  await expect(legend(page)).toBeVisible();
  const covered = [];
  let stops = 0;
  for (let tab = 0; tab < 150; tab += 1) {
    await page.keyboard.press("Tab");
    await settleScroll(page);
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      const strip = document.querySelector("#badge-legend");
      if (!element || element === document.body || strip.contains(element)) return null;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const key = strip.getBoundingClientRect();
      const inside = box.top >= key.top && box.bottom <= key.bottom && box.left >= key.left && box.right <= key.right;
      const name = (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return { inside, label: `${element.tagName.toLowerCase()} ${name}` };
    });
    if (!stop) continue;
    stops += 1;
    if (stop.inside) covered.push(stop.label);
  }
  expect(stops).toBeGreaterThan(50);
  expect(covered).toEqual([]);
});

test("All badges opens the Taxonomy glossary without a tab stop on any emblem", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(legend(page).locator("svg [tabindex], li[tabindex]")).toHaveCount(0);
  await page.locator("#badge-legend-more").click();
  await expect(page.locator("#taxonomy")).toHaveClass(/is-active/);
});
