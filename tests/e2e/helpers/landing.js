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

async function openView(page, id) {
  if (["explore", "taxonomy", "api"].includes(id)) {
    await page.locator(".docs-button").click();
    await page.locator(`#docs-menu-list [data-open-view="${id}"]`).click();
    return;
  }
  await page.locator(`.tab[data-tab="${id}"]`).click();
}

function allSearch(page) {
  return page.locator("#door-search:visible, #all-directory-search:visible");
}

// On the front door this fills its search, whose input handler carries the
// whole value into the All search and lands in results.
async function searchAll(page, text) {
  await allSearch(page).fill(text);
}

module.exports = { allSearch, collectionEntry, entryCount, familyCount, familyEntry, openCollection, openFamily, openView, pressedEntry, pressedFamily, searchAll };
