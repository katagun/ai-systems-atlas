// Every test reaches a Directory collection, a system family, a primary view,
// the pressed entry, an entry's count, or the mixed search through here, so
// the landing page's markup can change in one place (front-door spec, "Test
// impact"). Until Front-door Phase 2 lands, the entries are the switcher chips.

function collectionEntry(page, id) {
  return page.locator(`[data-directory-collection="${id}"]:not([data-directory-family])`);
}

function familyEntry(page, family) {
  return page.locator(`[data-directory-collection="systems"][data-directory-family="${family}"]`);
}

function pressedEntry(page) {
  return page.locator('.collection-switcher [aria-pressed="true"]');
}

// Today a family chip is the pressed entry; after Phase 2 the family row has
// its own pressed control while Systems stays pressed above it.
function pressedFamily(page) {
  return page.locator('.collection-switcher [aria-pressed="true"][data-directory-family]');
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
  await page.locator(`.tab[data-tab="${id}"]`).click();
}

function allSearch(page) {
  return page.locator("#all-directory-search");
}

async function searchAll(page, text) {
  await allSearch(page).fill(text);
}

module.exports = { allSearch, collectionEntry, entryCount, familyCount, familyEntry, openCollection, openFamily, openView, pressedEntry, pressedFamily, searchAll };
