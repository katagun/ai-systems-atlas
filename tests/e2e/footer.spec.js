const { test, expect } = require("@playwright/test");

const box = (page, selector) => page.locator(selector).boundingBox();

const spanBoxes = page =>
  page.locator("footer > *").evaluateAll(elements =>
    elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    })
  );

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const width of [768, 1280]) {
  test(`footer items never touch or overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const boxes = await spanBoxes(page);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j]), `items ${i} and ${j} overlap`).toBe(false);
        const sameRow = boxes[i].top < boxes[j].bottom && boxes[j].top < boxes[i].bottom;
        if (sameRow) {
          const gap = Math.max(boxes[j].left - boxes[i].right, boxes[i].left - boxes[j].right);
          expect(gap, `items ${i} and ${j} sit ${gap}px apart`).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });
}

test("the footer is left-aligned to the content column on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const main = await box(page, "main");
  const footer = await box(page, "footer");
  const boxes = await spanBoxes(page);
  expect(Math.round(footer.x)).toBe(Math.round(main.x));
  for (const item of boxes) expect(Math.round(item.left)).toBe(Math.round(main.x));
  const textAlign = await page.locator("footer").evaluate(element => getComputedStyle(element).textAlign);
  expect(textAlign).toBe("left");
});

test("the footer states the data date in the metadata voice without repeating the wordmark", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.locator("#data-date")).toContainText(/Data updated \d{4}-\d{2}-\d{2}/);
  const family = await page.locator("#data-date").evaluate(element => getComputedStyle(element).fontFamily);
  expect(family).toMatch(/JetBrains Mono/);
  await expect(page.locator("footer")).not.toContainText("peacefulcoexistance");
});
