const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

// Expectations come from the published files the page loads, and each fixture
// asserts the property it was chosen for, so a data change fails with a clear
// message instead of a confusing locator timeout. Star counts move with every
// refresh, so the expected label is built from the record's own count.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const projects = read("projects.json").projects;
const runtimes = read("local-runtimes.json").runtimes;
const taxonomy = read("taxonomy.json");

const byId = (records, id) => {
  const record = records.find(candidate => candidate.id === id);
  if (!record) throw new Error(`fixture ${id} is no longer published; pick another record with the property its comment states`);
  return record;
};

// Superpowers is an active, host-installed system with a star count, so its
// card appears in the All, Systems, and Agent packs grids.
const superpowers = byId(projects, "superpowers");
// Ollama is a local runtime with a star count.
const ollama = byId(runtimes, "ollama");
// Continue is archived and has a star count, so its status must survive beside the count.
const archived = byId(projects, "continue");
// ChatGPT and LM Studio have no public repository, so they have no star count.
const chatgpt = byId(projects, "chatgpt");
const lmStudio = byId(runtimes, "lm-studio");

test.beforeAll(() => {
  expect(superpowers.stars).toEqual(expect.any(Number));
  expect(superpowers.status).toBe("active");
  expect(superpowers.deployment).toContain("host_pack");
  expect(ollama.stars).toEqual(expect.any(Number));
  expect(archived.stars).toEqual(expect.any(Number));
  expect(archived.status).toBe("archived");
  expect(chatgpt.stars).toBeNull();
  expect(lmStudio.stars).toBeNull();
});

// A screen reader hears the compact count followed by "GitHub stars", not the
// star glyph's own name.
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

async function expectStars(card, record) {
  const stars = card.locator(".card-stars");
  await expect(stars).toBeVisible();
  await expect.poll(() => stars.ariaSnapshot()).toBe(`- text: ${compact.format(record.stars)} GitHub stars`);
}

async function expectNoGitHubClaim(card) {
  await expect(card).toBeVisible();
  await expect(card.locator(".card-stars")).toHaveCount(0);
  await expect(card.locator(".card-footer")).not.toContainText("GitHub");
}

// Runs in the page: how many lines an element's visible text occupies.
// Screen-reader text is clipped beside the line, so it is not counted.
const visibleLineCount = element => {
  const tops = new Set();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest(".visually-hidden")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
  }
  return tops.size;
};

test("landing cards show the star count of starred systems and runtimes", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("#all-directory-search");

  await search.fill(superpowers.name);
  await expectStars(page.locator('#all-directory-grid .project-card:has([data-project="superpowers"])'), superpowers);

  await search.fill(ollama.name);
  await expectStars(page.locator('#all-directory-grid .project-card:has([data-local-runtime="ollama"])'), ollama);
});

test("a landing card keeps an archived status beside its star count", async ({ page }) => {
  await page.goto("/");
  await page.locator("#all-directory-search").fill(archived.name);
  const card = page.locator(`#all-directory-grid .project-card:has([data-project="${archived.id}"])`);

  await expectStars(card, archived);
  await expect(card.locator(".card-footer")).toContainText(/archived/i);
});

// Every published record without a count is active today, so the page is
// served ChatGPT as archived to show the status standing alone.
test("a landing card with a status and no count prints the status without a separator", async ({ page }) => {
  await page.route("**/app/systems.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.systems.find(record => record.id === chatgpt.id).status = "archived";
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/");
  await page.locator("#all-directory-search").fill(chatgpt.name);

  await expect(page.locator('#all-directory-grid .project-card:has([data-project="chatgpt"]) .card-footer > span')).toHaveText("archived");
});

test("Local runtimes cards show the star count beside the model formats", async ({ page }) => {
  const formatName = taxonomy.runtime_model_formats.find(format => format.id === ollama.model_formats[0]).name;

  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-search").fill(ollama.name);
  const card = page.locator('#runtime-grid .project-card:has([data-local-runtime="ollama"])');

  await expectStars(card, ollama);
  await expect(card.locator(".card-footer")).toContainText(formatName);
});

// A count lengthens the longest footers in the Directory, where model formats
// already fill the line; the text beside the actions may wrap, the actions may not.
for (const width of [390, 1280]) {
  test(`Local runtimes card actions stay on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?collection=runtimes");
    const buttons = page.locator("#runtime-grid .card-footer button");
    await expect(buttons.first()).toBeVisible();
    const wrapped = [];
    for (const button of await buttons.all()) {
      if (await button.evaluate(visibleLineCount) > 1) {
        wrapped.push(await button.evaluate(item => `${item.closest(".project-card").querySelector("h2").textContent}: ${item.textContent}`));
      }
    }
    expect(wrapped).toEqual([]);
  });
}

test("host-installed systems in Agent packs show their star count", async ({ page }) => {
  await page.goto("/?collection=packs");
  await page.locator("#pack-search").fill(superpowers.name);

  await expectStars(page.locator('#pack-grid .project-card:has([data-project="superpowers"])'), superpowers);
});

test("Finder shortlist cards show the star count of every starred record", async ({ page }) => {
  const paths = [
    { direction: "local_runtime", goal: "personal_machine", attribute: "data-finder-runtime", records: runtimes },
    { direction: "agent_system", goal: "coding", attribute: "data-finder-project", records: projects },
  ];
  let starred = 0;
  for (const { direction, goal, attribute, records } of paths) {
    await page.goto("/?view=finder");
    await page.locator(`[data-finder-choice][data-finder-value="${direction}"]`).click();
    await page.locator(`[data-finder-choice][data-finder-value="${goal}"]`).click();
    await page.locator('[data-finder-choice][data-finder-value="balanced"]').click();
    const results = page.locator(".finder-results .finder-result");
    await expect(results).toHaveCount(3);
    for (const card of await results.all()) {
      const record = byId(records, await card.locator(`[${attribute}]`).getAttribute(attribute));
      if (record.stars == null) {
        await expect(card.locator(".card-stars")).toHaveCount(0);
      } else {
        starred += 1;
        await expectStars(card, record);
      }
    }
  }
  // Guards against a shortlist of only unstarred records passing vacuously.
  expect(starred).toBeGreaterThan(0);
});

// The Finder prints the count after the score, where it can meet the end of a
// narrow line; sweeping phone widths finds whichever count lands there.
test("a star count never splits from its star on a narrow Finder card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?view=finder");
  await page.locator('[data-finder-choice][data-finder-value="agent_system"]').click();
  await page.locator('[data-finder-choice][data-finder-value="coding"]').click();
  await page.locator('[data-finder-choice][data-finder-value="balanced"]').click();
  const counts = page.locator(".finder-results .card-stars");
  await expect(counts.first()).toBeVisible();
  const split = [];
  for (let width = 320; width <= 430; width += 5) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of await counts.all()) {
      if (await count.evaluate(visibleLineCount) > 1) split.push(`${width}px: ${await count.textContent()}`);
    }
  }
  expect(split).toEqual([]);
});

test("Systems cards show the star count and say when a record has none", async ({ page }) => {
  await page.goto("/?collection=systems");
  const search = page.locator("#project-search");

  await search.fill(superpowers.name);
  await expectStars(page.locator('#project-grid .project-card:has([data-project="superpowers"])'), superpowers);

  // Only Systems sorts by stars, so only its cards explain why a record sorts last.
  await search.fill(chatgpt.name);
  const card = page.locator('#project-grid .project-card:has([data-project="chatgpt"])');
  await expect(card.locator(".card-footer")).toContainText("No GitHub metrics");
  await expect(card.locator(".card-stars")).toHaveCount(0);
});

test("outside Systems, a card without a star count makes no GitHub claim", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("#all-directory-search");
  await search.fill(chatgpt.name);
  await expectNoGitHubClaim(page.locator('#all-directory-grid .project-card:has([data-project="chatgpt"])'));
  await search.fill(lmStudio.name);
  await expectNoGitHubClaim(page.locator('#all-directory-grid .project-card:has([data-local-runtime="lm-studio"])'));

  await page.goto("/?collection=runtimes");
  await page.locator("#runtime-search").fill(lmStudio.name);
  await expectNoGitHubClaim(page.locator('#runtime-grid .project-card:has([data-local-runtime="lm-studio"])'));
});
