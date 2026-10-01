// Reaching a Finder shortlist. The Finder is one screen of counted goal tiles,
// so a shortlist is one click on a goal plus its detail arriving — not three
// questions in sequence. Every spec that needs a shortlist goes through here,
// so a change to the flow is one edit rather than a dozen.
const { expect } = require("@playwright/test");

// Chooses a job and waits for its three reviewed matches. `priority` defaults
// to balanced, the profile's own overall score, which is what a bare goal URL
// restores.
const chooseFinderGoal = async (page, goal, priority = "balanced") => {
  await page.locator(`[data-finder-goal="${goal}"]`).click();
  await expect(page.locator(".finder-result")).toHaveCount(3);
  if (priority !== "balanced") await page.locator(`[data-finder-priority="${priority}"]`).click();
  return page.locator(".finder-result");
};

// Chooses a job and hands off to the results the goal maps to, which is how a
// spec that asserts on the Directory's Finder chip gets there.
const finderHandoff = async (page, goal, priority = "balanced") => {
  await chooseFinderGoal(page, goal, priority);
  await page.locator("[data-finder-directory]").click();
  await expect(page.locator("#finder-roles-chip")).toBeVisible();
};

module.exports = { chooseFinderGoal, finderHandoff };
