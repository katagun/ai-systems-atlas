// Every test reaches a Directory collection, a system family, a primary view,
// the pressed entry, an entry's count, or the mixed search through here, so
// the landing page's markup can change in one place (front-door spec, "Test
// impact"). An entry is a front-door tile or, in results, a scope strip entry,
// whichever is on screen.

function collectionEntry(page, id) {
  return page.locator(`#collection-index [data-tile="${id}"] .tile-open:visible, #scope-strip [data-open-collection="${id}"]:visible`);
}

function familyEntry(page, family) {
  return page.locator(`#collection-index [data-tile="systems"] [data-facet-value="${family}"]:visible, #scope-strip [data-family-entry="${family}"]:visible`);
}

// A tile's category link, which opens its collection narrowed to one value.
function categoryEntry(page, id, value) {
  return page.locator(`#collection-index [data-tile="${id}"] [data-facet-value="${value}"]:visible`);
}

// The state dot on a collection's tile or strip entry, whichever is on screen.
function collectionDot(page, id) {
  return page.locator(`#collection-index [data-tile="${id}"]:visible .state-dot, #scope-strip [data-open-collection="${id}"]:visible .state-dot`);
}

function pressedEntry(page) {
  return page.locator('#scope-strip .scope-row [aria-pressed="true"]');
}

// The family row has its own pressed control while Systems stays pressed
// above it.
function pressedFamily(page) {
  return page.locator('#scope-strip .family-row [aria-pressed="true"]');
}

async function countOf(locator) {
  return Number((await locator.locator("strong").first().textContent()).trim());
}

const entryCount = (page, id) => countOf(collectionEntry(page, id));
const familyCount = (page, family) => countOf(familyEntry(page, family));

async function openCollection(page, id) {
  await collectionEntry(page, id).click();
}

async function openFamily(page, family) {
  await familyEntry(page, family).click();
}

function viewTab(page, id) {
  return page.locator(`.tab[data-tab="${id}"]:visible, [data-mobile-nav="${id === "directory" ? "home" : id}"]:visible`);
}

async function openView(page, id) {
  if (await page.locator("#mobile-nav").isVisible()) {
    if (["taxonomy", "api"].includes(id)) {
      await page.locator('[data-mobile-nav="more"]').click();
      await page.locator(`[data-mobile-view="${id}"]`).click();
    } else await viewTab(page, id).click();
    return;
  }
  if (["explore", "taxonomy", "api"].includes(id)) {
    await page.locator(".docs-button").click();
    await page.locator(`#docs-menu-list [data-open-view="${id}"]`).click();
    return;
  }
  await viewTab(page, id).click();
}

function allSearch(page) {
  return page.locator("#door-search:visible, #results-search:visible");
}

// On the front door this fills its search, whose input handler carries the
// whole value into the results search and lands in results.
async function searchAll(page, text) {
  if (!await allSearch(page).count()) await page.locator('[data-mobile-nav="search"]').click();
  await allSearch(page).fill(text);
  await require("./results").settled(page);
}

module.exports = { allSearch, categoryEntry, collectionDot, collectionEntry, entryCount, familyCount, familyEntry, openCollection, openFamily, openView, pressedEntry, pressedFamily, searchAll, viewTab };
