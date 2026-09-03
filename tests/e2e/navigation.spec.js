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

test("the four tabs fit on a phone with room to spare", async ({ page }) => {
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
