const { test, expect } = require("@playwright/test");

const styleOf = (page, selector, property) =>
  page.locator(selector).evaluate((element, name) => getComputedStyle(element)[name], property);

test("the primary navigation is plain text with an underline rather than a filled pill", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");

  expect(await styleOf(page, ".tabs", "borderTopLeftRadius")).toBe("0px");
  expect(await styleOf(page, ".tabs", "borderTopWidth")).toBe("0px");
  expect(await styleOf(page, ".tabs", "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
  expect(await styleOf(page, ".tab.is-active", "boxShadow")).toBe("none");
  expect(await styleOf(page, ".tab.is-active", "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
  expect(await styleOf(page, ".tab.is-active", "borderBottomWidth")).toBe("2px");
  expect(await styleOf(page, ".tab.is-active", "borderTopLeftRadius")).toBe("0px");
});

test("every tab fits on a phone with room to spare", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const slack = await page.locator(".tabs").evaluate(nav => {
    const tabs = [...nav.querySelectorAll(".tab")];
    const first = tabs[0].getBoundingClientRect();
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    return nav.clientWidth - (last.right - first.left);
  });
  expect(slack).toBeGreaterThanOrEqual(24);
  expect(await styleOf(page, ".tab.is-active", "borderTopLeftRadius")).toBe("0px");
});

test("choosing a view writes a shareable URL and reloading restores it", async ({ page }) => {
  await page.goto("/");

  await page.locator('.tab[data-tab="api"]').click();
  await expect(page.locator("#api")).toHaveClass(/is-active/);
  await expect(page).toHaveURL(/view=api/);

  await page.reload();
  await expect(page.locator("#api")).toHaveClass(/is-active/);
  await expect(page.locator('.tab[data-tab="api"]')).toHaveClass(/is-active/);
  await expect(page.locator("#directory")).not.toHaveClass(/is-active/);
});

test("returning to the directory drops the view parameter", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  await expect(page.locator("#taxonomy")).toHaveClass(/is-active/);

  await page.locator('.tab[data-tab="directory"]').click();
  await expect(page.locator("#directory")).toHaveClass(/is-active/);
  await expect(page).not.toHaveURL(/view=/);
});

test("an unknown view parameter falls back to the directory rather than showing nothing", async ({ page }) => {
  await page.goto("/?view=records");

  await expect(page.locator("#directory")).toHaveClass(/is-active/);
  await expect(page.locator('.tab[data-tab="directory"]')).toHaveClass(/is-active/);
  await expect(page).not.toHaveURL(/view=/);
});
