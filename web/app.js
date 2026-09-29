const PAGE_SIZE_OPTIONS = [24, 48, 96];
const PAGE_SIZE_STORAGE_KEY = "atlas.pageSize";

function readStoredPageSize() {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return PAGE_SIZE_OPTIONS.includes(stored) ? stored : PAGE_SIZE_OPTIONS[0];
  } catch {
    return PAGE_SIZE_OPTIONS[0];
  }
}

function writeStoredPageSize(pageSize) {
  try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize)); } catch {}
}

const state = {
  projects: [], specifications: [], inferenceServices: [], localRuntimes: [], models: [], packs: [], labs: [], robots: [], taxonomy: null,
  labIndex: null,
  reviewedModelCount: 0, modelSourceCount: 0,
  licenses: new Map(), logos: { icons: {}, records: {} },
  directoryCollection: "all", directoryStage: "door", recent: {}, directoryRoles: null, directoryRolesLabel: null, badgeLegendPreference: null,
  comparison: { kind: null, profile: null, ids: [], limitReached: false },
  finder: { step: 0, answers: {} },
  pageSize: readStoredPageSize(),
  page: { all: 1, systems: 1, inference: 1, runtimes: 1, models: 1, specifications: 1, packs: 1, labs: 1, robots: 1 },
  urlReady: false,
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
// A card or a dialog paints from the boot record — before that record's detail
// file has landed, and forever if the fetch for it failed. Every detail-only
// prose field is therefore printed through this: a heading over an em dash
// reads as a value that is missing, where a heading over a blank line reads as
// a page that is broken. It is the fallback comparisonTable already makes for
// an absent cell, held to across the finder and all four record dialogs.
const detailText = value => escapeHTML(value || "—");
// The same rule for the lists a detail file carries. An absent list renders an
// empty <ul> under its heading — a heading over nothing, which reads as a broken
// page rather than a value that is missing — so the bullets fall back to the one
// em dash detailText prints for absent prose. A list that has items is untouched.
const detailList = values => `<ul>${(values || []).map(item => `<li>${escapeHTML(item)}</li>`).join("") || "<li>—</li>"}</ul>`;
// And the same for a score dimension. The inference and runtime tables label
// their rows from the taxonomy profile, which is always loaded, and read the
// value off the record, which the boot payload does not carry — so a failed
// detail fetch leaves a full table of labels with blank cells. The test is
// `== null`, not truthiness, for the reason scoreCell tests that way: zero is
// a score a record can actually hold, and a dash would be a lie about it.
const detailScore = value => value == null ? "—" : escapeHTML(value);
const compactNumber = value => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const label = value => String(value || "")
  .replaceAll("_", " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())
  .replace(/\bApi\b/g, "API")
  .replace(/\bAi\b/g, "AI");
const projectLocation = project => project.repo || new URL(project.url).hostname.replace(/^www\./, "");
const isReviewedModel = model => model.review_status === "reviewed";

// Content hashes stamped into index.html by scripts/build_asset_version.mjs.
// They let the catalog files be cached: the URL changes whenever the data does,
// so `no-store` — which threw away 261 KB of gzipped JSON on every single load,
// including the ETag the server offered — is no longer needed to stay current.
const dataVersions = (() => {
  try {
    return JSON.parse(document.getElementById("data-versions")?.textContent || "{}");
  } catch {
    return {};
  }
})();

async function loadJSON(path) {
  // Record detail shares one stamp rather than carrying 271 hashes in the page.
  const version = dataVersions[path] || (path.startsWith("app/detail/") ? dataVersions["app/detail"] : undefined);
  const response = await fetch(version ? `${path}?v=${version}` : path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function bootstrap() {
  // The published endpoints are an API, not this page's payload: the page reads
  // a projection of them shaped for a first render. See ADR 026. Only the files
  // the first paint reads are awaited here — taxonomy.json is small and wholly
  // needed, so it stays a direct read of the endpoint. Everything else arrives
  // on demand: a record's detail when a dialog or comparison needs it, a search
  // index when a search box takes focus, logos.json off the critical path.
  const [systems, inference, runtimes, specifications, models, taxonomy, packs, labs, robots] = await Promise.all([
    loadJSON("app/systems.json"), loadJSON("app/inference.json"), loadJSON("app/runtimes.json"),
    loadJSON("app/specifications.json"), loadJSON("app/models.json"), loadJSON("taxonomy.json"),
    loadJSON("app/packs.json"), loadJSON("app/labs.json"), loadJSON("app/robots.json")
  ]);
  state.projects = systems.systems;
  state.inferenceServices = inference.inference;
  state.localRuntimes = runtimes.runtimes;
  state.runtimesVerifiedAt = runtimes.verified_at;
  state.specifications = specifications.specifications;
  state.models = models.models;
  state.reviewedModelCount = models.reviewed_count;
  state.modelSourceCount = models.source_record_count;
  state.modelUnlistedCount = models.unlisted_reviewed_count;
  state.modelsVerifiedAt = models.verified_at;
  state.taxonomy = taxonomy;
  state.packs = packs.packs;
  state.labs = labs.labs;
  state.labIndex = AppCore.buildLabIndex(state.labs, state.models);
  state.robots = robots.robots;
  state.recent = { systems: systems.recent || [], inference: inference.recent || [], runtimes: runtimes.recent || [], specifications: specifications.recent || [], models: models.recent || [], packs: packs.recent || [], labs: labs.recent || [], robots: robots.recent || [] };
  const dataDate = [systems.generated_at, specifications.verified_at, inference.verified_at, runtimes.verified_at, models.verified_at, models.source_updated_at, packs.verified_at, labs.verified_at, robots.verified_at]
    .filter(Boolean)
    .sort()
    .at(-1);
  $("#data-date").textContent = `Data updated ${dataDate}`;
  populateFilters();
  populateCollectionFilters();
  populateModelLabFilter();
  populateRuntimeMatrixFilters();
  renderStats();
  renderFinder();
  renderDoorJobs();
  renderElements();
  renderModels();
  renderLabs();
  renderSpecifications();
  renderTaxonomy();
  renderModelAccess();
  renderSystemDeployment(systems.active_review_dates);
  bindEvents();
  restoreFromURL({ boot: true });
  // Text typed on the front door before its listener was bound is still a
  // search; it lands in results the way a keystroke after boot would.
  if ($("#door-search").value && state.directoryStage === "door") $("#door-search").dispatchEvent(new Event("input", { bubbles: true }));
  loadMarks();
  // The header's fonts can settle after bindEvents measured it.
  syncStickyClearance();
}

// Marks are decorative next to the record name, so they stay hidden from
// assistive technology. Icon bodies come from the vendored, build-sanitized
// logos.json; every dynamic value still passes through escapeHTML.
function cardMark(record) {
  const icon = state.logos.icons[state.logos.records[record.id]];
  if (icon) return `<span class="card-mark" data-mark="${escapeHTML(record.id)}" aria-hidden="true"><svg viewBox="0 0 24 24">${icon.body}</svg></span>`;
  return `<span class="card-mark card-monogram" data-mark="${escapeHTML(record.id)}" aria-hidden="true">${escapeHTML(AppCore.monogramGlyph(record.name))}</span>`;
}

// The icon bodies are the largest file the page loads and nothing about the
// page depends on them: a card without one already renders its monogram. So
// they arrive after the first paint, and every mark on screen is filled in
// once they do. Cards rendered later pick their icon up through cardMark.
function loadMarks() {
  return loadJSON("logos.json")
    .then(logos => { state.logos = logos; paintMarks(); })
    .catch(() => {});
}

function paintMarks(root = document) {
  $$("[data-mark]", root).forEach(mark => {
    const icon = state.logos.icons[state.logos.records[mark.dataset.mark]];
    if (!icon) return;
    mark.classList.remove("card-monogram");
    mark.innerHTML = `<svg viewBox="0 0 24 24">${icon.body}</svg>`;
  });
}

function taxonomyName(group, id) {
  return state.taxonomy[group].find(item => item.id === id)?.name || label(id);
}
const familyName = id => taxonomyName("system_families", id);
const finderDirectionName = id => AppCore.FINDER_DIRECTION_NAMES[id] || familyName(id);
const roleName = id => taxonomyName("primary_roles", id);
const relationName = id => taxonomyName("agent_relations", id);
const architectureName = id => taxonomyName("architectures", id);
const sourceModelName = id => taxonomyName("source_models", id);
const licenseName = id => taxonomyName("licenses", id);
const scoreProfileName = id => taxonomyName("score_profiles", id);
const traitNames = (group, values = []) => values.map(id => taxonomyName(group, id)).join(" · ");

// A record's role or type in words, which search weighs above its prose.
function searchLabel(kind, record) {
  if (kind === "system") return `${roleName(record.primary_role)} ${familyName(record.system_family)} ${sourceModelName(record.source_model)}`;
  if (kind === "inference") return taxonomyName("inference_service_types", record.service_type);
  if (kind === "runtime") return taxonomyName("local_runtime_types", record.runtime_type);
  if (kind === "model") return record.model_type ? taxonomyName("model_types", record.model_type) : "";
  if (kind === "pack") return taxonomyName("pack_types", record.pack_type);
  if (kind === "lab") return taxonomyName("lab_types", record.lab_type);
  if (kind === "spec") return taxonomyName("specification_types", record.specification_type);
  if (kind === "robot") return taxonomyName("robot_form_factors", record.form_factor);
  return "";
}

// Static dispatch on purpose. The comparison kind comes from the compare URL
// parameter, so any dynamic lookup keyed on it can resolve an unintended target;
// an object literal would return inherited names such as "constructor". Each
// branch names one collection, so an unknown kind can only fall through to null.
function comparisonCollection(kind) {
  if (kind === "system") return state.projects;
  if (kind === "inference") return state.inferenceServices;
  if (kind === "runtime") return state.localRuntimes;
  if (kind === "model") return state.models.filter(isReviewedModel);
  return null;
}

function comparisonRecords() {
  const records = comparisonCollection(state.comparison.kind) || [];
  return state.comparison.ids.map(id => records.find(item => item.id === id)).filter(Boolean);
}

// Every history write goes through here. WebKit throws a SecurityError once a
// page makes too many history calls in a short window, and every writer draws
// on that one budget: a keystroke's scope, a chip's collection, a dialog's
// record. So an unchanged URL makes no call, and a refused call is dropped
// rather than stopping whatever asked for it: the page keeps working, and
// only the address bar falls behind. Two writers push: `record`
// (writeRecordURL) and leaving the front door (leaveFrontDoor).
function writeURL(url, { push = false } = {}) {
  if (url.href === window.location.href) return;
  try {
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  } catch {}
  settledSearch = window.location.search;
}

// The query string the page last restored or wrote, so the page's state
// agrees with it. A popstate that arrives with the same one changed only the
// fragment, as the skip link does, and has nothing to restore: a restore
// there would reset the grid and forget in-memory state the URL cannot
// carry, such as the sort from before a query or a Finder role set.
let settledSearch = null;

// The front door's URL names no collection and no comparison, so a reload or
// a Back that lands on it lands on the door (front-door spec, "URL and
// history"). A comparison in progress stays in memory there, marked by its
// tile's dot, and returns to the URL when a collection opens.
function writeDirectoryURL() {
  const url = new URL(window.location.href);
  if (state.directoryStage === "door") url.searchParams.delete("collection");
  else {
    url.searchParams.set("collection", state.directoryCollection);
    url.searchParams.delete("element");
    url.searchParams.delete("elementRecord");
  }
  if (state.comparison.ids.length && state.directoryStage !== "door") {
    url.searchParams.set("compare", `${state.comparison.kind}:${state.comparison.ids.join(",")}`);
  } else {
    url.searchParams.delete("compare");
  }
  writeURL(url);
}

// Each scope's URL parameters and the control that holds each one. Keys are
// AppCore.SCOPE_URL_PARAMS keys; selectors are web/index.html's.
const SCOPE_CONTROLS = {
  all: { q: "#all-directory-search" },
  systems: { q: "#project-search", family: "#family-filter", role: "#role-filter", agent: "#agent-filter", architecture: "#architecture-filter", deployment: "#deployment-filter", agentInterface: "#agent-interface-filter", sourceModel: "#source-model-filter", license: "#license-filter", status: "#status-filter", localOnly: "#local-filter", sort: "#sort-filter" },
  inference: { q: "#inference-search", type: "#inference-type-filter", delivery: "#inference-delivery-filter", modelSource: "#inference-model-source-filter", apiStyle: "#inference-api-filter", sort: "#inference-sort-filter" },
  runtimes: { q: "#runtime-search", type: "#runtime-type-filter", accelerator: "#runtime-accelerator-filter", modelFormat: "#runtime-format-filter", apiStyle: "#runtime-api-filter", sort: "#runtime-sort-filter" },
  packs: { q: "#pack-search", type: "#pack-type-filter", host: "#pack-host-filter", install: "#pack-install-filter", license: "#pack-license-filter" },
  robots: { q: "#robot-search", formFactor: "#robot-form-factor-filter", aiBasis: "#robot-ai-basis-filter", availability: "#robot-availability-filter", status: "#robot-status-filter" },
  models: { q: "#model-search", type: "#model-type-filter", distribution: "#model-distribution-filter", modality: "#model-modality-filter", sourceModel: "#model-source-filter", license: "#model-license-filter", lab: "#model-lab-filter", sort: "#model-sort-filter" },
  labs: { q: "#lab-search", type: "#lab-type-filter", headquarters: "#lab-country-filter", distribution: "#lab-distribution-filter" },
  specifications: { q: "#specification-search", type: "#specification-type-filter", scope: "#specification-scope-filter", status: "#specification-status-filter", license: "#specification-license-filter" },
};

// The scope whose state the URL carries: the Directory's collection while
// results show. The front door, the Finder, Taxonomy, and API carry none.
function activeScope() {
  const view = $(".view.is-active")?.id;
  if (view === "directory") return state.directoryStage === "door" ? null : state.directoryCollection;
  return SCOPE_CONTROLS[view] ? view : null;
}

function readScopeControls(scope) {
  return Object.fromEntries(Object.entries(SCOPE_CONTROLS[scope] || {}).map(([key, selector]) => {
    const control = $(selector);
    return [key, control.type === "checkbox" ? (control.checked ? "1" : "") : control.value];
  }));
}

function allowedScopeValues(scope) {
  return Object.fromEntries(Object.entries(SCOPE_CONTROLS[scope] || {}).map(([key, selector]) => {
    const control = $(selector);
    if (control.type === "checkbox") return [key, new Set(["1"])];
    if (control.tagName === "SELECT") return [key, new Set([...control.options].filter(option => !option.disabled).map(option => option.value))];
    return [key, "text"];
  }));
}

// Rewrites the active scope's parameters in place: only `record` and
// leaving the front door push history (docs/WEB.md), so Back still closes a
// dialog and returns to the door. Quiet until the page has restored itself,
// so boot never writes a half-restored state.
function writeScopeURL() {
  if (!state.urlReady) return;
  const url = new URL(window.location.href);
  AppCore.SCOPE_URL_KEYS.forEach(key => url.searchParams.delete(key));
  const scope = activeScope();
  if (scope) {
    for (const [key, value] of AppCore.scopeURLParams(scope, readScopeControls(scope))) url.searchParams.set(key, value);
    if (state.page[scope] > 1) url.searchParams.set("page", String(state.page[scope]));
  }
  // Every render and keystroke lands here, so this is the writer that spends
  // most of WebKit's history budget; writeURL skips an unchanged URL.
  writeURL(url);
}

// Scopes whose Sort control has "Best match": a query selects it unless the
// reader picked a sort since typing, and clearing the query gives back the
// sort from before (spec, Phase 1 "Order"). syncMatchSort runs wherever a
// scope's query changes: typing, a carried query, a Clear control, and the
// Finder's handoff. So a sort chosen for one query never outlives it. Best
// match orders a query's matches, so it is offered only beside a query.
const MATCH_SORTS = { systems: "#sort-filter", inference: "#inference-sort-filter", runtimes: "#runtime-sort-filter", models: "#model-sort-filter" };
const sortBeforeQuery = {};
const sortChosenDuringQuery = {};

function syncMatchSort(scope) {
  const selector = MATCH_SORTS[scope];
  if (!selector) return;
  const select = $(selector);
  const hasQuery = Boolean($(SCOPE_CONTROLS[scope].q).value.trim());
  select.querySelector('option[value="match"]').disabled = !hasQuery;
  if (hasQuery && !sortChosenDuringQuery[scope] && select.value !== "match") {
    // A carried query can replace one the box still holds, so the sort from
    // before the first query is the one clearing gives back.
    sortBeforeQuery[scope] ??= select.value;
    select.value = "match";
  } else if (!hasQuery) {
    if (select.value === "match") select.value = sortBeforeQuery[scope] || AppCore.SCOPE_URL_PARAMS[scope].sort;
    delete sortBeforeQuery[scope];
    sortChosenDuringQuery[scope] = false;
    if (scope === "systems") updateScoreSortAvailability();
  }
}

// "12 results" beside a search box while it holds a query.
function setSearchCount(scope, count) {
  const selector = SCOPE_CONTROLS[scope]?.q;
  const input = selector && $(selector);
  const badge = input && input.parentElement.querySelector(".search-count");
  if (badge) badge.textContent = input.value.trim() ? `${count} ${count === 1 ? "result" : "results"}` : "";
}

// Applies the URL to one scope's controls before its first paint. Family goes
// first because it decides which roles and sorts Systems offers, the score
// sort among them. It goes first even beside a comparison, which decides the
// family itself (spec, "URL state and history"): restoreComparisonFromURL runs
// later and replaces a family that disagrees, so the URL then names the
// comparison's. Anything a control cannot take is removed from the URL rather
// than half-applied. Returns what it applied, for loadRestoredSearch.
function restoreScopeFromURL(scope) {
  if (!SCOPE_CONTROLS[scope]) return {};
  const url = new URL(window.location.href);
  if (scope === "systems" && url.searchParams.has("family")) {
    const family = url.searchParams.get("family");
    if ([...$("#family-filter").options].some(option => option.value === family)) {
      $("#family-filter").value = family;
      populateRoleFilter();
      updateScoreSortAvailability();
    }
  }
  const { values, rejected } = AppCore.readScopeURLParams(scope, url.searchParams, allowedScopeValues(scope));
  for (const [key, value] of Object.entries(values)) {
    if (key === "page") {
      state.page[scope] = value;
      continue;
    }
    const control = $(SCOPE_CONTROLS[scope][key]);
    if (control.type === "checkbox") control.checked = value === "1";
    else control.value = value;
  }
  if (rejected.length) {
    rejected.forEach(key => url.searchParams.delete(key));
    writeURL(url);
  }
  return values;
}

// A restored query searches what a typed one does: the indexes its search box
// loads on focus, with a repaint as each one lands. The first paint clamped a
// restored page to the pages the boot records alone fill, which can be fewer
// than the index fills, so each repaint puts that page back first, until the
// URL shows the reader has changed something since the page settled.
function loadRestoredSearch(scope, page) {
  let restoredPage = page;
  let settled = window.location.href;
  for (const collection of SEARCH_SCOPES[SCOPE_CONTROLS[scope].q]) {
    loadSearchIndex(collection)?.then(() => {
      if (window.location.href !== settled) restoredPage = undefined;
      if (restoredPage) state.page[scope] = restoredPage;
      renderSearchSurfaces();
      settled = window.location.href;
    });
  }
}

function clearComparison({ updateURL = true } = {}) {
  state.comparison = { kind: null, profile: null, ids: [], limitReached: false };
  if ($("#comparison-dialog")?.open) $("#comparison-dialog").close();
  renderComparisonControls();
  syncDoorDots();
  if (updateURL) writeDirectoryURL();
}

// A tile's dot follows the comparison, so the index is rebuilt only when the
// comparison changes. Rebuilding it on every grid repaint, as each search
// index lands, would drop the focus and the click a reader has on a tile.
function syncDoorDots() {
  if (state.directoryStage === "door") renderCollectionIndex();
}

// The views where records can be compared, and so the only ones that show the
// comparison tray. activateView and every repaint decide through here, so a
// repaint that lands while another view is open, such as a search index or
// the exclusions list arriving, never unhides the tray over it.
const COMPARISON_VIEWS = ["directory"];

function renderComparisonControls() {
  const records = comparisonRecords();
  $$('[data-compare-kind]').forEach(button => {
    const selected = button.dataset.compareKind === state.comparison.kind && state.comparison.ids.includes(button.dataset.compareId);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    const collection = comparisonCollection(button.dataset.compareKind);
    const record = collection ? collection.find(item => item.id === button.dataset.compareId) : null;
    button.setAttribute("aria-label", `${selected ? "Remove" : "Add"} ${record?.name || "item"} ${selected ? "from" : "to"} comparison`);
    button.textContent = selected ? "Selected" : "Compare";
  });
  const tray = $("#comparison-tray");
  if (!tray) return;
  tray.hidden = records.length === 0 || !COMPARISON_VIEWS.includes($(".view.is-active")?.id);
  // The strip's dots follow the comparison; its render keeps a reader's focus.
  if (state.directoryStage === "results") renderScopeStrip();
  syncBadgeLegend();
  $("#comparison-tray-title").textContent = records.length === 1 ? "1 item selected" : `${records.length} items selected`;
  $("#comparison-tray-items").textContent = records.map(item => item.name).join(" · ");
  $("#comparison-open").disabled = records.length < 2;
  $("#comparison-status").textContent = state.comparison.limitReached
    ? "Four is the maximum. Remove an item before adding another."
    : records.length === 1 ? "Choose at least one more item from this score profile." : "";
}

function toggleComparison(kind, id) {
  const collection = comparisonCollection(kind);
  const record = collection ? collection.find(item => item.id === id) : null;
  if (!record) return;
  state.comparison = AppCore.updateComparisonSelection(state.comparison, { kind, profile: record.score_profile, id });
  renderComparisonControls();
  syncDoorDots();
  writeDirectoryURL();
}

function restoreComparisonFromURL() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("compare");
  if (!raw) return false;
  const separator = raw.indexOf(":");
  const kind = raw.slice(0, separator);
  const referencedIds = raw.slice(separator + 1).split(",").filter(Boolean);
  const ids = [...new Set(referencedIds)];
  const collection = comparisonCollection(kind);
  const records = collection ? ids.map(id => collection.find(item => item.id === id)).filter(Boolean) : [];
  const profiles = new Set(records.map(item => item.score_profile));
  if (separator < 1 || referencedIds.length > 4 || records.length !== ids.length || !records.length || profiles.size !== 1 || profiles.has(undefined)) {
    url.searchParams.delete("compare");
    writeURL(url);
    return false;
  }
  const profile = [...profiles][0];
  state.comparison = { kind, profile, ids, limitReached: false };
  if (kind === "system") {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
    // A role restored from the URL stays when the comparison's family offers
    // it; populateRoleFilter falls back to All roles when it does not.
    $("#family-filter").value = records[0].system_family;
    populateRoleFilter();
    updateScoreSortAvailability();
    setDirectoryCollection("systems", { updateURL: false });
  } else if (kind === "model") {
    setDirectoryCollection("models", { updateURL: false });
    activateView("directory");
  } else {
    setDirectoryCollection(kind === "runtime" ? "runtimes" : "inference", { updateURL: false });
  }
  renderComparisonControls();
  writeDirectoryURL();
  return true;
}

function populateFilters() {
  const defaults = AppCore.directoryDefaults();
  const family = $("#family-filter");
  state.taxonomy.system_families.forEach(item => family.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  family.value = defaults.family;
  $("#sort-filter").value = defaults.sort;
  populateRoleFilter();
  state.taxonomy.agent_relations.forEach(item => $("#agent-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  state.taxonomy.architectures.forEach(item => $("#architecture-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  const publishedDeployments = new Set(state.projects.flatMap(project => project.deployment));
  state.taxonomy.deployment_modes.filter(item => publishedDeployments.has(item.id)).forEach(item => $("#deployment-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  const publishedInterfaces = new Set(state.projects.flatMap(project => project.agent_interfaces || []));
  state.taxonomy.agent_interfaces.filter(item => publishedInterfaces.has(item.id)).forEach(item => $("#agent-interface-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  const publishedSourceModels = new Set(state.projects.map(project => project.source_model));
  state.taxonomy.source_models.filter(item => publishedSourceModels.has(item.id)).forEach(item => $("#source-model-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  const publishedLicenses = new Set(state.projects.flatMap(project => project.licenses));
  state.taxonomy.licenses.filter(item => publishedLicenses.has(item.id)).forEach(item => $("#license-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.id)} — ${escapeHTML(item.name)}</option>`));
  updateScoreSortAvailability();
}

function populateRoleFilter() {
  const role = $("#role-filter");
  const selected = role.value;
  const family = $("#family-filter").value;
  const publishedRoles = new Set(state.projects
    .filter(project => !family || project.system_family === family)
    .map(project => project.primary_role));
  const roles = state.taxonomy.primary_roles.filter(item => publishedRoles.has(item.id));
  role.innerHTML = '<option value="">All roles</option>' + roles.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("");
  if (roles.some(item => item.id === selected)) role.value = selected;
}

// Every scored collection populates its filters the same way: for each taxonomy
// group, list only the values the published records actually use, so a filter
// never offers a choice that returns nothing. Adding a collection is a row here.
const COLLECTION_FILTERS = {
  specifications: {
    records: () => state.specifications,
    groups: [
      ["specification_types", "#specification-type-filter", item => [item.specification_type]],
      ["specification_scopes", "#specification-scope-filter", item => [item.scope]],
      ["specification_statuses", "#specification-status-filter", item => [item.status]],
    ],
    // Licences read "MIT — Massachusetts Institute of Technology License".
    licenseFilter: "#specification-license-filter",
  },
  inference: {
    records: () => state.inferenceServices,
    groups: [
      ["inference_service_types", "#inference-type-filter", item => [item.service_type]],
      ["inference_delivery_modes", "#inference-delivery-filter", item => item.delivery_modes],
      ["inference_model_sources", "#inference-model-source-filter", item => item.model_sources],
      ["inference_api_styles", "#inference-api-filter", item => item.api_styles],
    ],
  },
  runtimes: {
    records: () => state.localRuntimes,
    groups: [
      ["local_runtime_types", "#runtime-type-filter", item => [item.runtime_type]],
      ["runtime_accelerators", "#runtime-accelerator-filter", item => item.accelerators],
      ["runtime_model_formats", "#runtime-format-filter", item => item.model_formats],
      ["inference_api_styles", "#runtime-api-filter", item => item.api_styles],
    ],
  },
  models: {
    records: () => state.models,
    groups: [
      ["model_types", "#model-type-filter", item => [item.model_type]],
      ["model_distribution_modes", "#model-distribution-filter", item => item.distribution_modes || []],
      ["model_modalities", "#model-modality-filter", item => [
        ...item.source_metadata.modalities.input, ...item.source_metadata.modalities.output,
      ]],
      ["source_models", "#model-source-filter", item => item.source_model ? [item.source_model] : []],
    ],
    licenseFilter: "#model-license-filter",
  },
  packs: {
    records: () => state.packs,
    groups: [
      ["pack_types", "#pack-type-filter", item => [item.pack_type]],
      ["pack_hosts", "#pack-host-filter", item => item.hosts],
      ["pack_install_mechanisms", "#pack-install-filter", item => [item.install_mechanism]],
    ],
    licenseFilter: "#pack-license-filter",
  },
  labs: {
    records: () => state.labs,
    groups: [
      ["lab_types", "#lab-type-filter", item => [item.lab_type]],
      ["countries", "#lab-country-filter", item => [item.headquarters]],
      ["model_distribution_modes", "#lab-distribution-filter", item => labRelationsFor(item).models.flatMap(model => model.distribution_modes || [])],
    ],
  },
  robots: {
    records: () => state.robots,
    groups: [
      ["robot_form_factors", "#robot-form-factor-filter", item => [item.form_factor]],
      ["robot_ai_bases", "#robot-ai-basis-filter", item => item.ai_basis],
      ["robot_availability", "#robot-availability-filter", item => [item.availability]],
      ["project_statuses", "#robot-status-filter", item => [item.status]],
    ],
  },
};

// The Models view's Lab facet lists labs by name rather than a taxonomy group.
function populateModelLabFilter() {
  [...state.labs].sort((a, b) => a.name.localeCompare(b.name)).forEach(lab =>
    $("#model-lab-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(lab.id)}">${escapeHTML(lab.name)}</option>`));
}

function populateCollectionFilters() {
  for (const collection of Object.values(COLLECTION_FILTERS)) {
    const records = collection.records();
    for (const [group, selector, values] of collection.groups) {
      const published = new Set(records.flatMap(values));
      state.taxonomy[group]
        .filter(item => published.has(item.id))
        .forEach(item => $(selector).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
    }
    if (!collection.licenseFilter) continue;
    const licenses = new Set(records.flatMap(item => item.licenses || []));
    state.taxonomy.licenses.filter(item => licenses.has(item.id)).forEach(item =>
      $(collection.licenseFilter).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.id)} — ${escapeHTML(item.name)}</option>`)
    );
  }
}

function updateScoreSortAvailability() {
  const scoreOption = $("#sort-filter").querySelector('option[value="score"]');
  const hasFamily = Boolean($("#family-filter").value);
  scoreOption.disabled = !hasFamily;
  if (!hasFamily && $("#sort-filter").value === "score") $("#sort-filter").value = "name";
}

function updateAdvancedFilterSummary() {
  const active = [
    $("#source-model-filter").value,
    $("#license-filter").value,
    $("#agent-filter").value,
    $("#architecture-filter").value,
    $("#deployment-filter").value,
    $("#agent-interface-filter").value,
    $("#status-filter").value !== "active" ? $("#status-filter").value || "all" : "",
    $("#local-filter").value,
  ].filter(Boolean).length;
  $(".advanced-filter-shell summary").textContent = active ? `More filters · ${active} active` : "More filters";
}

function applyDirectoryDefaults() {
  clearComparison();
  const defaults = AppCore.directoryDefaults();
  state.directoryRoles = null;
  state.directoryRolesLabel = null;
  $("#project-search").value = defaults.term;
  $("#family-filter").value = defaults.family;
  $("#role-filter").value = defaults.role;
  populateRoleFilter();
  $("#source-model-filter").value = defaults.sourceModel;
  $("#license-filter").value = defaults.license;
  $("#agent-filter").value = defaults.agent;
  $("#architecture-filter").value = defaults.architecture;
  $("#deployment-filter").value = defaults.deployment;
  $("#agent-interface-filter").value = defaults.agentInterface;
  $("#status-filter").value = defaults.status;
  $("#sort-filter").value = defaults.sort;
  $("#local-filter").value = defaults.localOnly ? "1" : "";
  updateScoreSortAvailability();
  syncBadgeLegend();
}

function renderStats() {
  const { count } = AppCore.collectionCount("all", collectionPayloads());
  $("#hero-kicker").textContent = `${count} systems, source models, services, runtimes, packs, and robots`;
}

// Every registry function reads the boot payloads in this shape.
function collectionPayloads() {
  return {
    projects: state.projects, services: state.inferenceServices, runtimes: state.localRuntimes, models: state.models,
    packs: state.packs, robots: state.robots, labs: state.labs, specifications: state.specifications,
  };
}

function collectionEmblem(entry) {
  return AppCore.collectionEmblem(entry);
}

function collectionStateFor(id) {
  return AppCore.collectionState(id, {
    comparisonKind: state.comparison.ids.length ? state.comparison.kind : null,
    finderRoles: state.directoryRoles,
  });
}

// A state dot is decoration with a hidden label, so the entry's accessible
// name still starts with the collection's name and count.
function stateDot(kind) {
  if (kind === "compare") return '<span class="state-dot is-compare" title="A comparison is in progress here"><span class="visually-hidden">A comparison is in progress here</span></span>';
  if (kind === "finder") return '<span class="state-dot is-finder" title="Finder roles applied"><span class="visually-hidden">Finder roles applied</span></span>';
  return "";
}

// The three records the payload names as reviewed most recently, painted the
// way a card's mark is: an icon once logos.json lands, a monogram until then.
function tileMarks(id) {
  const records = (state.recent[id] || [])
    .map(recordId => AppCore.collectionEntries(id, collectionPayloads()).find(record => record.id === recordId))
    .filter(Boolean);
  if (!records.length) return "";
  return `<span class="tile-marks" aria-hidden="true">${records.map(cardMark).join("")}</span>`;
}

// The index: one tile per registry entry, hidden while its collection is
// empty (the Robots rule from ADR 037, now general). A tile carries emblem,
// name, count with its split, the largest categories as links, three marks,
// and a state dot. It carries no definition; those stay in Taxonomy.
function renderCollectionIndex() {
  const payloads = collectionPayloads();
  $("#collection-index").innerHTML = AppCore.COLLECTIONS.map(entry => {
    const { count, note } = AppCore.collectionCount(entry.id, payloads);
    if (count === 0 && entry.id !== "all") return "";
    const categories = AppCore.collectionCategories(entry.id, payloads);
    const categoryList = categories.length
      ? `<ul class="tile-categories" role="list">${categories.map(category => `<li><button type="button" class="tile-category" data-open-collection="${escapeHTML(entry.id)}" data-facet-key="${escapeHTML(category.key)}" data-facet-value="${escapeHTML(category.value)}">${escapeHTML(category.label)} <strong>${category.count}</strong></button></li>`).join("")}</ul>`
      : "";
    return `<article class="tile${entry.id === "all" ? " tile-wide" : ""}" data-tile="${escapeHTML(entry.id)}">
      <button type="button" class="tile-open" data-open-collection="${escapeHTML(entry.id)}">${collectionEmblem(entry)}<span class="tile-name">${escapeHTML(entry.name)}</span><span class="tile-count"><strong>${count}</strong>${note ? `<small>${escapeHTML(note)}</small>` : ""}</span></button>
      ${categoryList}${tileMarks(entry.id)}${stateDot(collectionStateFor(entry.id))}
    </article>`;
  }).join("");
}

// Elements uses the boot records for navigation; only a selected record loads
// detail. Repaints touch sheet content, never its focused select or role tiles.
let elementGroups = [];
let selectedElement = null;
let selectedElementRecord = null;
let elementRequest = 0;

function renderElements() {
  elementGroups = AppCore.systemElements(state.projects, state.taxonomy);
  $("#elements-count").textContent = `${elementGroups.reduce((sum, group) => sum + group.count, 0)} active systems · ${elementGroups.reduce((sum, group) => sum + group.roles.length, 0)} operational roles`;
  $("#element-groups").innerHTML = elementGroups.map(group => `<section class="element-group" data-element-family="${escapeHTML(group.id)}" aria-labelledby="element-family-${escapeHTML(group.id)}">
    <div class="element-family-heading"><h3 id="element-family-${escapeHTML(group.id)}">${escapeHTML(group.name)}</h3><span>${group.count} active</span></div>
    <div class="element-tiles">${group.roles.map(role => `<button type="button" class="element-tile" data-element="${escapeHTML(role.id)}" aria-pressed="false" aria-controls="element-sheet"${role.records.length ? "" : " disabled"} aria-label="${escapeHTML(role.name)}, ${role.records.length} active systems. Show reference sheet"><span class="element-count">${role.records.length}</span><span class="element-symbol" aria-hidden="true">${escapeHTML(role.symbol)}</span><span class="element-name">${escapeHTML(role.name)}</span></button>`).join("")}</div></section>`).join("");
}

function positionElementSheet() {
  const sheet = $("#element-sheet");
  const family = selectedElement && document.querySelector(`[data-element-family="${selectedElement.family}"]`);
  if (family && window.matchMedia("(max-width: 700px)").matches) family.after(sheet);
  else $("#element-groups").after(sheet);
}

function writeElementURL() {
  const url = new URL(window.location.href);
  url.searchParams.delete("element");
  url.searchParams.delete("elementRecord");
  if (selectedElement) {
    url.searchParams.set("element", selectedElement.id);
    url.searchParams.set("elementRecord", selectedElementRecord.id);
  }
  writeURL(url);
}

function selectElement(id, recordId = "", { focus = false } = {}) {
  selectedElement = elementGroups.flatMap(group => group.roles).find(role => role.id === id && role.records.length) || null;
  selectedElementRecord = selectedElement?.records.find(record => record.id === recordId) || selectedElement?.records[0] || null;
  elementRequest += 1;
  $$("[data-element]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.element === selectedElement?.id)));
  $("#element-sheet").hidden = !selectedElement;
  positionElementSheet();
  if (selectedElement) {
    $("#element-sheet-title").textContent = selectedElement.name;
    $("#element-role-description").textContent = selectedElement.definition || "";
    $("#element-record").innerHTML = selectedElement.records.map(record => `<option value="${escapeHTML(record.id)}">${escapeHTML(record.name)}</option>`).join("");
    $("#element-record").value = selectedElementRecord.id;
    loadElementRecord();
    if (focus) $("#element-sheet-title").focus();
  }
  writeElementURL();
}

function renderElementRecord() {
  const record = selectedElementRecord;
  const ready = loadedDetail.has(`system:${record.id}`);
  const pending = ready ? "Not recorded" : "Review details not loaded";
  $("#element-record-name").textContent = record.name;
  $("#element-record-description").textContent = record.description;
  const rows = [
    ["Operational role", selectedElement.name],
    ["System family", taxonomyName("system_families", record.system_family)],
    ["Deployment", record.deployment.map(value => taxonomyName("deployment_modes", value)).join(" · ")],
    ["License classification", sourceModelName(record.source_model)],
    ["Material licenses", record.licenses.join(" · ")],
    ["Local-first", record.local_first === true ? "Yes" : record.local_first === false ? "No" : "Not recorded"],
    ["Canonical data", ready ? record.canonical_data || "Not recorded" : pending],
    ["Editorial review date", ready ? record.verified_at || "Not recorded" : pending],
    ["Recorded limitations", ready ? (record.weaknesses || []).join(" · ") || "None recorded" : pending],
  ];
  $("#element-properties").innerHTML = rows.map(([name, value]) => `<tr><th scope="row">${escapeHTML(name)}</th><td>${escapeHTML(value)}</td></tr>`).join("");
  const params = new URLSearchParams({ collection: "systems", family: selectedElement.family, role: selectedElement.id, sort: "name" });
  $("#element-browse").href = `?${params}`;
  $("#element-browse").textContent = `Browse all ${selectedElement.records.length} matching systems →`;
  params.set("record", `system:${record.id}`);
  $("#element-detail").href = `?${params}`;
}

async function loadElementRecord() {
  const request = ++elementRequest;
  const record = selectedElementRecord;
  renderElementRecord();
  $("#element-retry").hidden = true;
  $("#element-load-status").textContent = "Loading reviewed details…";
  await loadDetail("system", record);
  if (request !== elementRequest) return;
  renderElementRecord();
  const ready = loadedDetail.has(`system:${record.id}`);
  $("#element-load-status").textContent = ready ? `Review details loaded for ${record.name}.` : "Review details could not load. Basic catalog properties remain available.";
  $("#element-retry").hidden = ready;
}

// The front door's Finder jobs: the first goal of each direction, opened at
// the Finder's priority question with that direction and goal answered
// (openFinderAt, which the job hint under a search already uses).
function renderDoorJobs() {
  $("#door-jobs").innerHTML = AppCore.FINDER_DIRECTIONS.map(direction => {
    const goal = AppCore.FINDER_GOALS[direction.id][0];
    return `<li><button type="button" class="door-job" data-door-direction="${escapeHTML(direction.id)}" data-door-goal="${escapeHTML(goal.id)}">${escapeHTML(goal.label)}</button></li>`;
  }).join("");
}

// Leaving the front door pushes one history entry, so Back returns to it;
// every change inside results keeps replacing (front-door spec, "URL state
// and history"). Pushing the current URL first, then replacing it with the
// new state, spends one history call, within WebKit's budget (writeURL).
// Returns whether it left the door, so a caller can hand on the focus the
// hidden door held.
function leaveFrontDoor() {
  if (state.directoryStage !== "door") return false;
  try { window.history.pushState(null, "", window.location.href); } catch {}
  state.directoryStage = "results";
  return true;
}

// The front door is a clean start: the query of the collection last shown
// is cleared, so no tile opens with a search the door's empty box never showed.
function showFrontDoor({ updateURL = true } = {}) {
  state.directoryStage = "door";
  const collection = state.directoryCollection;
  const query = $(SCOPE_CONTROLS[collection].q);
  if (query.value) {
    query.value = "";
    state.page[collection] = 1;
    syncMatchSort(collection);
  }
  $$(".collection-panel").forEach(panel => { panel.hidden = true; });
  $("#scope-strip").hidden = true;
  $("#front-door").hidden = false;
  $("#hero-kicker").hidden = false;
  $("#directory-title").classList.remove("visually-hidden");
  syncStickyClearance();
  renderCollectionIndex();
  syncBadgeLegend();
  if (updateURL) {
    writeDirectoryURL();
    writeScopeURL();
    writeElementURL();
  }
}

// The heading stays in the page, visually hidden, because activateView lands
// focus on it when a switch into the Directory leaves another view.
function showResults() {
  state.directoryStage = "results";
  $("#front-door").hidden = true;
  $("#hero-kicker").hidden = true;
  $("#directory-title").classList.add("visually-hidden");
  $("#scope-strip").hidden = false;
}

// The results strip: one entry per registry entry, the collection pressed.
// Up to tablet width (1000 px) the entries are emblems only and the pressed
// one's name and count read as a caption under the row (styles.css), so nine
// entries fit a 320 px phone with slack and nothing scrolls sideways. Up to
// 1407 px each shows its short name, so the row stays one row. Inside Systems
// a second row lists the families, one pressed.
const FAMILY_ORDER = ["memory_system", "agent_system", "assistant_system"];
function renderScopeStrip() {
  const strip = $("#scope-strip");
  // Every grid repaint lands here, so a reader's focus on an entry is put
  // back on the rebuilt one rather than dropped to the page.
  const focused = strip.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused?.dataset.openCollection !== undefined
    ? `[data-open-collection="${focused.dataset.openCollection}"]`
    : focused?.dataset.familyEntry !== undefined ? `[data-family-entry="${focused.dataset.familyEntry}"]` : null;
  const payloads = collectionPayloads();
  let caption = "";
  const entries = AppCore.COLLECTIONS.map(entry => {
    const { count } = AppCore.collectionCount(entry.id, payloads);
    if (count === 0 && entry.id !== "all") return "";
    const pressed = entry.id === state.directoryCollection;
    if (pressed) caption = `${entry.name} · ${count}`;
    // Keep an initial as a fallback for any future collection without a glyph.
    const emblem = collectionEmblem(entry) || `<span class="scope-monogram" aria-hidden="true">${escapeHTML(AppCore.monogramGlyph(entry.name))}</span>`;
    return `<button type="button" class="scope-entry${pressed ? " is-active" : ""}" data-open-collection="${escapeHTML(entry.id)}" aria-pressed="${pressed}" title="${escapeHTML(entry.name)}">${emblem}<span class="scope-name">${escapeHTML(entry.name)}</span><span class="scope-short" aria-hidden="true">${escapeHTML(entry.short)}</span><strong class="scope-count">${count}</strong>${stateDot(collectionStateFor(entry.id))}</button>`;
  }).join("");
  const familyRow = state.directoryCollection === "systems" ? renderFamilyRow(payloads) : "";
  strip.innerHTML = `<div class="scope-row">${entries}</div><p class="scope-caption" aria-hidden="true">${escapeHTML(caption)}</p>${familyRow}`;
  if (focusKey) strip.querySelector(focusKey)?.focus({ preventScroll: true });
  syncStickyClearance();
}

function renderFamilyRow(payloads) {
  const current = $("#family-filter").value;
  const categories = AppCore.collectionCategories("systems", payloads);
  const total = AppCore.collectionCount("systems", payloads).count;
  const entry = (value, label, count) => `<button type="button" class="family-entry${value === current ? " is-active" : ""}" data-family-entry="${escapeHTML(value)}" aria-pressed="${value === current}">${label} <strong>${count}</strong></button>`;
  const families = FAMILY_ORDER.map(id => entry(id, escapeHTML(AppCore.FAMILY_SHORT_NAMES[id]), (categories.find(category => category.value === id) || { count: 0 }).count));
  // A phone shows "All" alone so the row stays one row (styles.css); the
  // clipped rest keeps "All families" the accessible name at every width.
  return `<div class="family-row" role="group" aria-label="System families">${entry("", 'All<span class="family-rest"> families</span>', total)}${families.join("")}</div>`;
}

// The strip sticks under the header at every width, so the header's
// live height is a custom property the stylesheet reads. The sticky height
// is another, html's scroll-padding-top, so focus moving through a grid
// stops below the header and the strip rather than under them. The strip's
// height changes with the family row, so every strip render re-measures.
function syncStickyClearance() {
  const header = $(".site-header");
  if (!header) return;
  document.documentElement.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
  document.documentElement.style.setProperty("--sticky-clearance", `${stickyHeight()}px`);
}

// The one way a tile or a strip entry opens a collection. A facet narrows
// the collection to one category first; a family goes through
// jumpToDirectoryFamily so the role and Finder set are cleared as ever.
// setDirectoryCollection carries the query the reader leaves, so a query
// only a lab or a specification answers follows the reader from the All
// results into Labs or Specifications; the front door itself carries none.
function openCollection(id, { facet = null } = {}) {
  const entry = AppCore.COLLECTIONS.find(item => item.id === id);
  if (!entry) return;
  const fromDoor = leaveFrontDoor();
  if (fromDoor && !facet && id === "systems" && collectionStateFor("systems")) reopenSystems();
  else {
    // A tile or a category link opens what its count promises: the facets a
    // previous visit left set are cleared, and Systems keeps its default
    // status, the one its counts are taken at. A strip entry in results
    // keeps the collection's facets as the reader left them.
    if (facet || fromDoor) {
      clearScopeFacets(id, { focus: false });
      if (id === "systems") $("#status-filter").value = AppCore.directoryDefaults().status;
      state.page[id] = 1;
    }
    if (id === "systems") jumpToDirectoryFamily(facet && facet.key === "family" ? facet.value : "");
    else {
      if (facet) $(SCOPE_CONTROLS[id][facet.key]).value = facet.value;
      setDirectoryCollection(id);
    }
  }
  // The door that held the pressed tile or link is hidden now, so focus
  // moves to the collection's own entry in the strip rather than the page.
  if (fromDoor) $('#scope-strip .scope-row [aria-pressed="true"]')?.focus({ preventScroll: true });
}

// The Systems tile's dot promises a comparison in progress or a Finder role
// set, so the tile reopens Systems with it, at the Finder's family or the
// comparison's (as restoreComparisonFromURL chooses it), and with the other
// facets as the reader left them. The strip's Systems entry still clears
// both through jumpToDirectoryFamily (Phase 0).
function reopenSystems() {
  if (!state.directoryRoles) {
    $("#family-filter").value = comparisonRecords()[0]?.system_family ?? $("#family-filter").value;
    populateRoleFilter();
    updateScoreSortAvailability();
  }
  setDirectoryCollection("systems");
}

// Opens Systems on one family, or on every family when `family` is empty,
// clearing any role or Finder role set. A page kept from the list this
// replaces, or restored from the URL, belongs to that list, so the new one
// opens on its first page, as a Family choice does.
function jumpToDirectoryFamily(family) {
  clearComparison();
  $("#family-filter").value = family;
  state.directoryRoles = null;
  state.directoryRolesLabel = null;
  $("#role-filter").value = "";
  populateRoleFilter();
  updateScoreSortAvailability();
  state.page.systems = 1;
  setDirectoryCollection("systems");
}

function setDirectoryCollection(collection, { updateURL = true, carryQuery = updateURL } = {}) {
  const selected = ["all", "systems", "inference", "runtimes", "packs", "robots", "models", "labs", "specifications"].includes(collection) ? collection : "all";
  // Read before the scope changes: the query the reader is leaving.
  const previousQuery = carryQuery ? $(SCOPE_CONTROLS[state.directoryCollection].q).value : null;
  const compatible = (selected === "systems" && state.comparison.kind === "system")
    || (selected === "inference" && state.comparison.kind === "inference")
    || (selected === "runtimes" && state.comparison.kind === "runtime")
    || (selected === "models" && state.comparison.kind === "model");
  if (updateURL && state.comparison.ids.length && !compatible) clearComparison({ updateURL: false });
  state.directoryCollection = selected;
  showResults();
  renderScopeStrip();
  if (previousQuery !== null) {
    const input = $(SCOPE_CONTROLS[selected].q);
    // Changed text is a new query in this scope: it starts on the first page,
    // and a sort the reader chose for the old text gives way to Best match.
    if (input.value !== previousQuery) {
      input.value = previousQuery;
      state.page[selected] = 1;
      sortChosenDuringQuery[selected] = false;
    }
    syncMatchSort(selected);
    // A carried query searches what a typed one does: the indexes the box
    // fetches on focus, with a repaint as each one lands.
    if (previousQuery.trim()) SEARCH_SCOPES[SCOPE_CONTROLS[selected].q].forEach(name => loadSearchIndex(name)?.then(renderSearchSurfaces));
  }
  $("#all-directory-panel").hidden = selected !== "all";
  $("#systems-directory-panel").hidden = selected !== "systems";
  $("#inference-directory-panel").hidden = selected !== "inference";
  $("#runtimes-directory-panel").hidden = selected !== "runtimes";
  $("#packs-directory-panel").hidden = selected !== "packs";
  $("#robots-directory-panel").hidden = selected !== "robots";
  $("#models-directory-panel").hidden = selected !== "models";
  $("#labs-directory-panel").hidden = selected !== "labs";
  $("#specifications-directory-panel").hidden = selected !== "specifications";
  const renderers = {
    all: renderAllDirectoryEntries,
    systems: renderProjects,
    inference: renderInferenceServices,
    runtimes: renderLocalRuntimes,
    packs: renderPacks,
    robots: () => renderCollection("robots"),
    models: renderModels,
    labs: renderLabs,
    specifications: renderSpecifications,
  };
  for (const [name, grid] of [
    ["all", "#all-directory-grid"], ["systems", "#project-grid"],
    ["inference", "#inference-grid"], ["runtimes", "#runtime-grid"], ["packs", "#pack-grid"],
    ["robots", "#robot-grid"], ["models", "#model-grid"], ["labs", "#lab-grid"],
    ["specifications", "#specification-grid"],
  ]) {
    if (name !== selected) $(grid).innerHTML = "";
  }
  renderers[selected]();
  if (updateURL) writeDirectoryURL();
  syncBadgeLegend();
}

const PAGE_CONTAINERS = {
  all: "#all-directory-pager",
  systems: "#project-pager",
  inference: "#inference-pager",
  runtimes: "#runtime-pager",
  models: "#model-pager",
  specifications: "#specification-pager",
  packs: "#pack-pager",
  labs: "#lab-pager",
  robots: "#robot-pager",
};

function pageRenderer(key) {
  return {
    all: renderAllDirectoryEntries, systems: renderProjects, inference: renderInferenceServices,
    runtimes: renderLocalRuntimes, models: renderModels, specifications: renderSpecifications,
    packs: renderPacks, labs: renderLabs, robots: () => renderCollection("robots"),
  }[key];
}

function setPageSize(pageSize) {
  if (!PAGE_SIZE_OPTIONS.includes(pageSize) || pageSize === state.pageSize) return;
  state.pageSize = pageSize;
  writeStoredPageSize(pageSize);
  Object.keys(state.page).forEach(key => { state.page[key] = 1; });
  pageRenderer(state.directoryCollection)();
  renderModels();
  renderLabs();
  renderSpecifications();
}

function renderPager(key, { page, pageCount }) {
  const container = $(PAGE_CONTAINERS[key]);
  if (!container) return;
  container.innerHTML = `
    <label class="pager-size"><span>Show</span>
      <select aria-label="Results per page">${PAGE_SIZE_OPTIONS.map(size => `<option value="${size}" ${size === state.pageSize ? "selected" : ""}>${size}</option>`).join("")}</select>
    </label>
    <div class="pager-nav">
      <button type="button" class="ghost-button" data-pager-prev ${page <= 1 ? "disabled" : ""}>← Prev</button>
      <span>Page ${page} of ${pageCount}</span>
      <button type="button" class="ghost-button" data-pager-next ${page >= pageCount ? "disabled" : ""}>Next →</button>
    </div>`;
  $("select", container).addEventListener("input", event => setPageSize(Number(event.target.value)));
  $("[data-pager-prev]", container).addEventListener("click", () => {
    state.page[key] = Math.max(1, page - 1);
    pageRenderer(key)();
  });
  $("[data-pager-next]", container).addEventListener("click", () => {
    state.page[key] = Math.min(pageCount, page + 1);
    pageRenderer(key)();
  });
}

function modelModalityRoute(model) {
  const modalities = model.source_metadata.modalities;
  return `${modalities.input.map(item => taxonomyName("model_modalities", item)).join(" + ")} → ${modalities.output.map(item => taxonomyName("model_modalities", item)).join(" + ")}`;
}

// Badges replace the tags row on system, inference-service, and
// local-runtime cards. Each is an icon-only emblem whose frame names its
// family; the name and definition ride in visually hidden text for screen
// readers and in data attributes for the pointer tooltip. Badges are never
// controls and take no tab stop.
function badgeRow(badges) {
  if (!badges.length) return "";
  return `<ul class="card-badges" role="list">${badges.map(badge => `<li class="card-badge" data-badge="${escapeHTML(badge.id)}" data-family="${escapeHTML(badge.family)}" data-name="${escapeHTML(badge.name)}" data-definition="${escapeHTML(badge.definition)}">${AppCore.badgeEmblem(badge.id)}<span class="visually-hidden">${escapeHTML(badge.name)}: ${escapeHTML(badge.definition)}</span></li>`).join("")}</ul>`;
}

// The one control that opens a card's record. Its hidden text names the
// record, so a page of cards doesn't hold twenty-four buttons with one name,
// and `.card-open::after` in styles.css stretches it over the whole card. The
// arrow is decoration, so screen readers hear "View details for <name>".
function detailsButton(attribute, id, name, text = "View details") {
  return `<button class="card-open" ${attribute}="${escapeHTML(id)}">${escapeHTML(text)}<span class="visually-hidden"> for ${escapeHTML(name)}</span><span aria-hidden="true"> →</span></button>`;
}

// Stars are live repository metadata, never a score or a badge, and every
// card whose record carries a count shows it, in every view where the card
// appears: systems, local runtimes, agent packs, and specifications with a
// repo. Screen readers hear "GitHub stars" instead of the glyph's name.
function starCount(record) {
  if (record.stars == null) return "";
  return `<span class="card-stars">${escapeHTML(compactNumber(record.stars))}<span aria-hidden="true"> ★</span><span class="visually-hidden"> GitHub stars</span></span>`;
}

const systemStatus = project => project.status === "active" ? "" : `<b class="archived">${escapeHTML(project.status)}</b>`;

// A footer reads its facts in order, a dot between each, skipping any absent.
const footerFacts = (...facts) => facts.filter(Boolean).join(" · ");

// One tooltip serves every emblem. It is pointer-only help: screen readers
// already get the same words from each badge's hidden text, so the tooltip is
// aria-hidden and emblems stay out of the tab order.
// Grids repaint in place (search, filters, paging), detaching the emblem a
// tooltip points at; each badge grid's renderer calls this afterwards.
let hideDetachedBadgeTooltip = () => {};
function initBadgeTooltip() {
  const tooltip = $("#badge-tooltip");
  if (!tooltip) return;
  let anchor = null;
  const hide = () => { tooltip.hidden = true; anchor = null; };
  hideDetachedBadgeTooltip = () => { if (anchor && !anchor.isConnected) hide(); };
  const show = badge => {
    anchor = badge;
    tooltip.dataset.family = badge.dataset.family;
    tooltip.querySelector(".badge-tooltip-family").textContent = AppCore.BADGE_FAMILIES[badge.dataset.family]?.name || "";
    tooltip.querySelector(".badge-tooltip-name").textContent = badge.dataset.name;
    tooltip.querySelector(".badge-tooltip-definition").textContent = badge.dataset.definition;
    tooltip.hidden = false;
    const target = badge.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, target.left), window.innerWidth - box.width - margin);
    const below = target.bottom + margin;
    const top = below + box.height > window.innerHeight - margin ? target.top - box.height - margin : below;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  };
  // Escape dismisses the tooltip until the pointer really moves. The card's
  // hover lift slides its emblems under a resting pointer, and a repaint or a
  // clamped scroll does the same. Each hands an emblem a pointerover at the
  // same spot, which must not bring back what the reader dismissed.
  let pointer = null;
  let dismissedAt = null;
  const movedFrom = (spot, event) => Math.abs(event.clientX - spot.x) > 1 || Math.abs(event.clientY - spot.y) > 1;
  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    if (dismissedAt && movedFrom(dismissedAt, event)) dismissedAt = null;
    pointer = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    if (dismissedAt && !movedFrom(dismissedAt, event)) return;
    dismissedAt = null;
    pointer = { x: event.clientX, y: event.clientY };
    const badge = event.target.closest?.(".card-badge");
    if (badge) show(badge);
    else if (anchor) hide();
  });
  document.addEventListener("click", event => {
    dismissedAt = null;
    const badge = event.target.closest?.(".card-badge");
    if (badge && badge !== anchor) show(badge);
    else hide();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    hide();
    dismissedAt = pointer;
  });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);
}

// The legend explains the emblems of whatever Directory scope is showing. The
// reader's open/closed choice is remembered; without one it starts open on
// wide viewports and closed on phones. The strip and its Key chip both step
// aside for the comparison tray, which owns the same edge of the viewport, and
// come back as the stored choice says once it closes.
const BADGE_LEGEND_STORAGE_KEY = "atlas.badgeLegend";
function badgeLegendPreference() {
  try {
    const stored = localStorage.getItem(BADGE_LEGEND_STORAGE_KEY);
    if (stored === "open" || stored === "closed") return stored;
  } catch {}
  return window.matchMedia("(max-width: 720px)").matches ? "closed" : "open";
}
function setBadgeLegendPreference(value) {
  try { localStorage.setItem(BADGE_LEGEND_STORAGE_KEY, value); } catch {}
  state.badgeLegendPreference = value;
  syncBadgeLegend();
}
function syncBadgeLegend() {
  const strip = $("#badge-legend");
  const chip = $("#badge-legend-chip");
  if (!strip || !chip) return;
  const activeViewId = $(".view.is-active")?.id;
  const inDirectory = activeViewId === "directory";
  const systemFamily = state.directoryCollection === "systems" ? $("#family-filter").value : "";
  // The front door shows no cards, so it has no badges to explain.
  const legend = inDirectory && state.directoryStage === "door" ? null
    : inDirectory ? AppCore.badgeLegend(state.directoryCollection, systemFamily)
    : ["models", "specifications", "labs"].includes(activeViewId) ? AppCore.badgeLegend(activeViewId)
    : null;
  const shown = Boolean(legend) && $("#comparison-tray").hidden;
  const open = shown && (state.badgeLegendPreference || badgeLegendPreference()) === "open";
  if (legend) {
    $("#badge-legend-items").dataset.mode = legend.mode;
    $("#badge-legend-items").innerHTML = legend.mode === "families"
      ? legend.families.map(family => `<li data-family="${escapeHTML(family.id)}" title="${escapeHTML(family.meaning)}">${AppCore.familyEmblem(family.id)}<span>${escapeHTML(family.name)}</span></li>`).join("")
      : legend.badges.map(badge => `<li data-family="${escapeHTML(badge.family)}">${AppCore.badgeEmblem(badge.id)}<span>${escapeHTML(badge.name)}</span></li>`).join("");
  }
  strip.hidden = !open;
  chip.hidden = !shown || open;
  chip.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("has-badge-legend", open);
}
function initBadgeLegend() {
  const strip = $("#badge-legend");
  const chip = $("#badge-legend-chip");
  // The strip's height depends on the scope and the viewport width, so the
  // page's bottom clearance and scroll padding read the measured height from
  // --legend-h instead of guessing a budget.
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--legend-h", `${strip.hidden ? 0 : strip.getBoundingClientRect().height}px`);
  }).observe(strip);
  // Focus follows the toggle so a keyboard reader is not dropped on the page.
  $("#badge-legend-close").addEventListener("click", () => { setBadgeLegendPreference("closed"); chip.focus(); });
  chip.addEventListener("click", () => { setBadgeLegendPreference("open"); $("#badge-legend-close").focus(); });
  $("#badge-legend-more").addEventListener("click", event => { event.preventDefault(); activateView("taxonomy"); });
  syncBadgeLegend();
}

function packHosts(pack) {
  return pack.hosts.map(item => taxonomyName("pack_hosts", item)).join(" · ");
}

function packCard(pack, { mixed = false } = {}) {
  const typeLabel = taxonomyName("pack_types", pack.pack_type);
  return `<article class="project-card agent-pack-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(pack)}<div><p class="family-label">${mixed ? "Agent pack · " : ""}${escapeHTML(typeLabel)}</p><h2>${escapeHTML(pack.name)}</h2><div class="repo">${escapeHTML(pack.steward)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(packHosts(pack))}</span>
    <div class="license-row">${pack.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
    <p>${escapeHTML(pack.description)}</p>
    ${badgeRow(AppCore.cardBadges("pack", pack))}
    <div class="card-footer"><span>${footerFacts(starCount(pack), escapeHTML(taxonomyName("pack_install_mechanisms", pack.install_mechanism)))}${pack.status === "active" ? "" : ` · ${escapeHTML(label(pack.status))}`}</span>${detailsButton("data-pack", pack.id, pack.name)}</div>
  </article>`;
}

// A lab's other records are joined by the names the catalog already uses for it
// (ADR 041); the join runs over the boot records this page holds.
function labRelationsFor(lab) {
  return AppCore.labRelations(lab, {
    models: state.models, projects: state.projects, services: state.inferenceServices,
    runtimes: state.localRuntimes, specifications: state.specifications, packs: state.packs,
  });
}

const labDistributionOrder = () => state.taxonomy.model_distribution_modes.map(item => item.id);

// Every Atlas count on a lab card is a join over reviewed records; nothing on it
// ranks the lab. The newest reviewed release date is a tracking signal only.
function labCard(lab) {
  const relations = labRelationsFor(lab);
  const modes = AppCore.labDistributionModes(relations.models, labDistributionOrder());
  const newest = AppCore.releasesNewestFirst(relations.models)[0];
  const counts = [
    [relations.models.length, "reviewed release", "reviewed releases"],
    [relations.systems.length, "system", "systems"],
    [relations.services.length, "inference service", "inference services"],
    [relations.runtimes.length, "local runtime", "local runtimes"],
    [relations.specifications.length, "specification", "specifications"],
    [relations.packs.length, "agent pack", "agent packs"],
  ].filter(([count]) => count).map(([count, one, many]) => `<span>${count} ${count === 1 ? one : many}</span>`).join("");
  const origin = lab.parent_organization ? `Part of ${escapeHTML(lab.parent_organization)}` : escapeHTML(new URL(lab.url).hostname.replace(/^www\./, ""));
  const newestDate = newest && AppCore.releaseDate(newest);
  return `<article class="project-card lab-card">
    <div class="card-top"><div class="card-identity">${cardMark(lab)}<div><p class="family-label">${escapeHTML(taxonomyName("lab_types", lab.lab_type))} · ${escapeHTML(taxonomyName("countries", lab.headquarters))}</p><h2>${escapeHTML(lab.name)}</h2><div class="repo">${origin}</div></div></div></div>
    <span class="role-badge">${escapeHTML(modes.map(mode => taxonomyName("model_distribution_modes", mode)).join(" · "))}</span>
    <p>${escapeHTML(lab.description)}</p>
    <div class="tags">${counts}</div>
    ${badgeRow(AppCore.cardBadges("lab", lab))}
    <div class="card-footer"><span>${newestDate ? `Newest reviewed release ${escapeHTML(newestDate)}` : ""}</span>${detailsButton("data-lab", lab.id, lab.name)}</div>
  </article>`;
}

// A record a lab claims links to that lab, by its own collection's join rule.
function labLinksMarkup(kind, record) {
  const labs = AppCore.labsForRecord(kind, record, state.labIndex);
  if (!labs.length) return "";
  return `<p><strong>Lab:</strong> ${labs.map(lab => `<button type="button" class="link-button" data-open-lab="${escapeHTML(lab.id)}">${escapeHTML(lab.name)}</button>`).join(" · ")}</p>`;
}

function robotCard(robot, { mixed = false } = {}) {
  const formLabel = taxonomyName("robot_form_factors", robot.form_factor);
  return `<article class="project-card robot-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(robot)}<div><p class="family-label">${mixed ? "Robot · " : ""}${escapeHTML(formLabel)}</p><h2>${escapeHTML(robot.name)}</h2><div class="repo">${escapeHTML(robot.manufacturer)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(taxonomyName("robot_availability", robot.availability))}</span>
    <p>${escapeHTML(robot.description)}</p>
    <div class="card-footer"><span>${robot.status === "active" ? "Unscored" : escapeHTML(label(robot.status))}</span>${detailsButton("data-robot", robot.id, robot.name)}</div>
  </article>`;
}

// Modality and family on a reviewed-model card come from models.dev, or from
// developer documentation for a model models.dev does not list yet, not from
// Atlas review, so they carry attributed plain text instead of badges.
function modelSourceMeta(model) {
  const parts = [modelModalityRoute(model), model.source_metadata.family].filter(Boolean);
  const attribution = AppCore.modelMetadataAttribution(model);
  return `<div class="card-source-meta" title="${escapeHTML(attribution.cardTitle)}"><span class="visually-hidden">${escapeHTML(attribution.cardPrefix)}</span>${parts.map(part => `<span>${escapeHTML(part)}</span>`).join("")}</div>`;
}

function importedModelCard(model, { mixed = false } = {}) {
  const metadata = model.source_metadata;
  const reportedLicense = metadata.reported_license || "Not reported";
  const openWeights = metadata.reported_open_weights == null
    ? "Open weights not reported"
    : metadata.reported_open_weights ? "Open weights reported" : "Closed weights reported";
  return `<article class="project-card model-card imported-model-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(model)}<div><p class="family-label">models.dev source record</p><h2>${escapeHTML(model.name)}</h2><div class="repo">Namespace · ${escapeHTML(model.developer)}</div></div></div></div>
    <span class="role-badge">Imported metadata · Not Atlas reviewed</span>
    <div class="license-row"><span class="source-badge">models.dev</span><span class="review-badge">Reported license · ${escapeHTML(reportedLicense)}</span></div>
    <p>${escapeHTML(model.description || "Imported provider-independent model metadata from models.dev.")}</p>
    <div class="tags"><span>${escapeHTML(modelModalityRoute(model))}</span>${metadata.family ? `<span>${escapeHTML(metadata.family)}</span>` : ""}<span>${escapeHTML(openWeights)}</span></div>
    ${badgeRow(AppCore.cardBadges("model", model))}
    <div class="card-footer"><span>${escapeHTML(model.source_id)}</span>${detailsButton("data-model", model.id, model.name, "View source details")}</div>
  </article>`;
}

// One system card serves the All and Agent packs grids, which both hide scores.
function mixedSystemCard(record) {
  const location = projectLocation(record);
  return `<article class="project-card mixed-directory-card ${escapeHTML(record.system_family)}">
      <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">System · ${escapeHTML(familyName(record.system_family))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(location)}</div></div></div></div>
      <span class="role-badge">${escapeHTML(roleName(record.primary_role))}</span>
      <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(record.source_model))}</span>${record.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
      <p>${escapeHTML(record.description)}</p>
      ${badgeRow(AppCore.cardBadges("system", record))}
      <div class="card-footer"><span>${footerFacts(starCount(record), systemStatus(record))}</span>${detailsButton("data-project", record.id, record.name)}</div>
    </article>`;
}

function renderAllDirectoryEntries() {
  // The mixed directory searches five collections, so it reads five index
  // namespaces; each is absent until that collection's index lands, and the
  // filter falls back to the boot record for whichever is still missing.
  const entries = AppCore.filterDirectoryEntries(state.projects, state.inferenceServices, state.localRuntimes, state.models, {
    term: $("#all-directory-search").value,
    searchIndex: searchIndexes.systems,
    serviceSearchIndex: searchIndexes.inference,
    runtimeSearchIndex: searchIndexes.runtimes,
    modelSearchIndex: searchIndexes.models,
    packSearchIndex: searchIndexes.packs,
    robotSearchIndex: searchIndexes.robots,
    labelOf: searchLabel,
  }, state.packs, state.robots);
  $("#all-directory-result-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · Scores hidden across collections`;
  setSearchCount("all", entries.length);
  renderJobHint("all", $("#all-directory-search").value);
  const paged = AppCore.paginate(entries, { page: state.page.all, pageSize: state.pageSize });
  state.page.all = paged.page;
  $("#all-directory-grid").innerHTML = paged.items.map(({ kind, record }) => {
    if (kind === "model") {
      if (!isReviewedModel(record)) return importedModelCard(record, { mixed: true });
      return `<article class="project-card model-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Model release · ${escapeHTML(taxonomyName("model_types", record.model_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.developer)}</div></div></div></div>
        <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(record.source_model))}</span>${record.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
        <p>${escapeHTML(record.description)}</p>
        ${modelSourceMeta(record)}
        ${badgeRow(AppCore.cardBadges("model", record))}
        <div class="card-footer"><span>Dedicated model-access score</span>${detailsButton("data-model", record.id, record.name)}</div>
      </article>`;
    }
    if (kind === "pack") return packCard(record, { mixed: true });
    if (kind === "robot") return robotCard(record, { mixed: true });
    if (kind === "runtime") {
      return `<article class="project-card local-runtime-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Local runtime · ${escapeHTML(taxonomyName("local_runtime_types", record.runtime_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.maintainer)}</div></div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        ${badgeRow(AppCore.cardBadges("runtime", record))}
        <div class="card-footer"><span>${starCount(record)}</span>${detailsButton("data-local-runtime", record.id, record.name)}</div>
      </article>`;
    }
    if (kind === "inference") {
      return `<article class="project-card inference-service-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Inference service · ${escapeHTML(taxonomyName("inference_service_types", record.service_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.operator)}</div></div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        ${badgeRow(AppCore.cardBadges("inference", record))}
        <div class="card-footer"><span>Dedicated service score</span>${detailsButton("data-inference-service", record.id, record.name)}</div>
      </article>`;
    }
    return mixedSystemCard(record);
  }).join("") || emptyStateMarkup("all", "No systems, model releases, inference services, local runtimes, agent packs, or robots match this search.");
  $$('[data-project]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  $$('[data-inference-service]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openInferenceService(button.dataset.inferenceService)));
  $$('[data-local-runtime]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openLocalRuntime(button.dataset.localRuntime)));
  $$('[data-model]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openModel(button.dataset.model)));
  $$('[data-pack]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openPack(button.dataset.pack)));
  $$('[data-robot]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openRobot(button.dataset.robot)));
  hideDetachedBadgeTooltip();
  renderPager("all", paged);
  if (activeScope() === "all") writeScopeURL();
}

function filteredProjects(term) {
  return AppCore.filterAndSortProjects(state.projects, {
    term,
    searchIndex: searchIndexes.systems,
    labelOf: searchLabel,
    family: $("#family-filter").value,
    role: $("#role-filter").value,
    roles: state.directoryRoles || [],
    agent: $("#agent-filter").value,
    architecture: $("#architecture-filter").value,
    deployment: $("#deployment-filter").value,
    agentInterface: $("#agent-interface-filter").value,
    sourceModel: $("#source-model-filter").value,
    license: $("#license-filter").value,
    status: $("#status-filter").value,
    localOnly: $("#local-filter").value,
    sort: $("#sort-filter").value
  });
}

// One rendering path for every collection. Each entry supplies what actually
// differs — where its records come from, how its cards look, which dialog a
// card opens — and renderCollection owns the shape they all shared: filter,
// count, paginate, paint, bind, page. A fifth collection is a new entry here,
// not a fifth near-identical function. `records(term)` lists an entry for a
// query under its current facets, so an empty result can also ask what the
// facets alone allow.
const COLLECTIONS = {
  systems: {
    grid: "#project-grid",
    resultCount: "#result-count",
    pageKey: "systems",
    dataset: "project",
    noun: ["project", "projects"],
    empty: "No projects match these filters.",
    open: id => openProject(id),
    context() {
      updateAdvancedFilterSummary();
      const family = $("#family-filter").value;
      const finderContext = state.directoryRoles ? " · Finder match" : "";
      const selectedProfile = state.taxonomy.score_profiles.find(profile => profile.family === family);
      const suffix = family
        ? ` · ${scoreProfileName(selectedProfile?.id)}${finderContext}`
        : " · Scores hidden across families";
      const chip = $("#finder-roles-chip");
      chip.hidden = !state.directoryRolesLabel;
      chip.innerHTML = state.directoryRolesLabel
        ? `Finder: ${escapeHTML(state.directoryRolesLabel)}<span aria-hidden="true"> ×</span><span class="visually-hidden">, remove</span>`
        : "";
      // Scores are never comparable across families, so the compare control
      // only exists once a family narrows the grid to one score profile.
      return { family, suffix, comparable: Boolean(family) };
    },
    records: term => filteredProjects(term),
    card: (project, { family }) => {

    const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${escapeHTML(project.score.overall)} out of 10">${escapeHTML(project.score.overall)}</div>` : "";
    // Only this grid sorts by stars, so only its cards explain a missing count.
    const githubSignal = project.stars == null ? "No GitHub metrics" : starCount(project);
    return `<article class="project-card ${escapeHTML(project.system_family)}">
      <div class="card-top"><div class="card-identity">${cardMark(project)}<div><p class="family-label">${escapeHTML(familyName(project.system_family))}</p><h2>${escapeHTML(project.name)}</h2><div class="repo">${escapeHTML(projectLocation(project))}</div></div></div>${score}</div>
      <span class="role-badge">${escapeHTML(roleName(project.primary_role))}</span>
      <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(project.source_model))}</span>${project.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}${project.license_review_status === "review_required" ? '<span class="review-badge">Evidence review</span>' : ""}</div>
      <p>${escapeHTML(project.description)}</p>
      ${badgeRow(AppCore.cardBadges("system", project))}
      <div class="card-footer"><span>${footerFacts(githubSignal, systemStatus(project))}</span><div class="card-actions">${family ? `<button class="compare-toggle" data-compare-kind="system" data-compare-id="${escapeHTML(project.id)}" aria-label="Add ${escapeHTML(project.name)} to comparison" aria-pressed="false">Compare</button>` : ""}${detailsButton("data-project", project.id, project.name)}</div></div>
    </article>`;
    },
  },
  specifications: {
    grid: "#specification-grid",
    resultCount: "#specification-result-count",
    pageKey: "specifications",
    dataset: "specification",
    noun: ["artifact", "artifacts"],
    empty: "No specifications match these filters.",
    open: id => openSpecification(id),
    context() {
      $("#specifications-kicker").textContent = `${state.specifications.length} reviewed specifications`;
      return { suffix: " · Unscored", comparable: false };
    },
    records: term => AppCore.filterSpecifications(state.specifications, {
      term,
      searchIndex: searchIndexes.specifications,
      labelOf: searchLabel,
      type: $("#specification-type-filter").value,
      scope: $("#specification-scope-filter").value,
      status: $("#specification-status-filter").value,
      license: $("#specification-license-filter").value,
    }),
    card: specification => {

    const version = specification.current_version ? `Version ${escapeHTML(specification.current_version)}` : escapeHTML(taxonomyName("specification_statuses", specification.status));
    return `<article class="project-card specification-card">
      <div class="card-top"><div><p class="family-label">${escapeHTML(taxonomyName("specification_types", specification.specification_type))}</p><h2>${escapeHTML(specification.short_name)}</h2><div class="repo">${escapeHTML(specification.repo || new URL(specification.url).hostname)}</div></div><span class="status-badge">${version}</span></div>
      <span class="role-badge">${escapeHTML(taxonomyName("specification_scopes", specification.scope))}</span>
      <div class="license-row">${specification.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
      <p>${escapeHTML(specification.description)}</p>
      <div class="tags"><span>${escapeHTML(taxonomyName("specification_statuses", specification.status))}</span><span>${escapeHTML(specification.stewards[0])}</span></div>
      ${badgeRow(AppCore.cardBadges("spec", specification))}
      <div class="card-footer"><span>${footerFacts(starCount(specification), "No editorial score")}</span>${detailsButton("data-specification", specification.id, specification.name)}</div>
    </article>`;
    },
  },
  labs: {
    grid: "#lab-grid",
    resultCount: "#lab-result-count",
    pageKey: "labs",
    dataset: "lab",
    noun: ["lab", "labs"],
    empty: "No labs match these filters.",
    open: id => openLab(id),
    context() {
      const covered = state.models.filter(model => isReviewedModel(model) && state.labIndex.byName.has(model.developer)).length;
      $("#labs-kicker").textContent = `${state.labs.length} labs · developers of ${covered} of ${state.reviewedModelCount} reviewed releases`;
      return { suffix: " · Unscored", comparable: false };
    },
    records: term => AppCore.filterLabs(state.labs, {
      term,
      searchIndex: searchIndexes.labs,
      labelOf: searchLabel,
      type: $("#lab-type-filter").value,
      headquarters: $("#lab-country-filter").value,
      distribution: $("#lab-distribution-filter").value,
      models: state.models,
    }),
    card: lab => labCard(lab),
  },
  inference: {
    grid: "#inference-grid",
    resultCount: "#inference-result-count",
    pageKey: "inference",
    dataset: "inferenceService",
    noun: ["service", "services"],
    empty: "No inference services match these filters.",
    open: id => openInferenceService(id),
    context: () => ({
      suffix: ` · ${state.taxonomy.inference_service_score_profile.name}`,
      comparable: true,
    }),
    records: term => AppCore.filterInferenceServices(state.inferenceServices, {
      term,
      searchIndex: searchIndexes.inference,
      labelOf: searchLabel,
      type: $("#inference-type-filter").value,
      delivery: $("#inference-delivery-filter").value,
      modelSource: $("#inference-model-source-filter").value,
      apiStyle: $("#inference-api-filter").value,
      sort: $("#inference-sort-filter").value,
    }),
    card: service => `<article class="project-card inference-service-card">
    <div class="card-top"><div class="card-identity">${cardMark(service)}<div><p class="family-label">${escapeHTML(taxonomyName("inference_service_types", service.service_type))}</p><h2>${escapeHTML(service.name)}</h2><div class="repo">${escapeHTML(service.operator)}</div></div></div><div class="score-ring" aria-label="Inference-service score ${escapeHTML(service.score.overall)} out of 10">${escapeHTML(service.score.overall)}</div></div>
    <span class="role-badge">${escapeHTML(service.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
    <p>${escapeHTML(service.description)}</p>
    ${badgeRow(AppCore.cardBadges("inference", service))}
    <div class="card-footer"><span>${escapeHTML(service.model_sources.map(item => taxonomyName("inference_model_sources", item)).join(" · "))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="inference" data-compare-id="${escapeHTML(service.id)}" aria-label="Add ${escapeHTML(service.name)} to comparison" aria-pressed="false">Compare</button>${detailsButton("data-inference-service", service.id, service.name)}</div></div>
  </article>`,
  },
  runtimes: {
    grid: "#runtime-grid",
    resultCount: "#runtime-result-count",
    pageKey: "runtimes",
    dataset: "localRuntime",
    noun: ["runtime", "runtimes"],
    empty: "No local runtimes match these filters.",
    open: id => openLocalRuntime(id),
    context: () => ({
      suffix: ` · ${state.taxonomy.local_runtime_score_profile.name}`,
      comparable: true,
    }),
    records: term => AppCore.filterLocalRuntimes(state.localRuntimes, {
      term,
      searchIndex: searchIndexes.runtimes,
      labelOf: searchLabel,
      type: $("#runtime-type-filter").value,
      accelerator: $("#runtime-accelerator-filter").value,
      modelFormat: $("#runtime-format-filter").value,
      apiStyle: $("#runtime-api-filter").value,
      sort: $("#runtime-sort-filter").value,
    }),
    card: runtime => `<article class="project-card local-runtime-card">
    <div class="card-top"><div class="card-identity">${cardMark(runtime)}<div><p class="family-label">${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))}</p><h2>${escapeHTML(runtime.name)}</h2><div class="repo">${escapeHTML(runtime.repo || runtime.maintainer)}</div></div></div><div class="score-ring" aria-label="Local-runtime score ${escapeHTML(runtime.score.overall)} out of 10">${escapeHTML(runtime.score.overall)}</div></div>
    <span class="role-badge">${escapeHTML(runtime.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
    <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(runtime.source_model))}</span>${runtime.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
    <p>${escapeHTML(runtime.description)}</p>
    ${badgeRow(AppCore.cardBadges("runtime", runtime))}
    <div class="card-footer"><span>${footerFacts(starCount(runtime), escapeHTML(runtime.model_formats.map(item => taxonomyName("runtime_model_formats", item)).join(" · ")))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="runtime" data-compare-id="${escapeHTML(runtime.id)}" aria-label="Add ${escapeHTML(runtime.name)} to comparison" aria-pressed="false">Compare</button>${detailsButton("data-local-runtime", runtime.id, runtime.name)}</div></div>
  </article>`,
  },
  models: {
    grid: "#model-grid",
    resultCount: "#model-result-count",
    pageKey: "models",
    dataset: "model",
    noun: ["model", "models"],
    empty: "No models match these filters.",
    open: id => openModel(id),
    context() {
      $("#models-kicker").textContent = AppCore.modelsKickerText(state.modelSourceCount, state.reviewedModelCount, state.modelUnlistedCount);
      return { suffix: ` · ${state.reviewedModelCount} Atlas reviewed; source imports are unscored`, comparable: true };
    },
    records: term => AppCore.filterModels(state.models, {
      term,
      type: $("#model-type-filter").value,
      distribution: $("#model-distribution-filter").value,
      modality: $("#model-modality-filter").value,
      sourceModel: $("#model-source-filter").value,
      license: $("#model-license-filter").value,
      sort: $("#model-sort-filter").value,
      searchIndex: searchIndexes.models,
      labelOf: searchLabel,
      ids: labModelIds($("#model-lab-filter").value),
    }),
    card: model => {
      if (!isReviewedModel(model)) return importedModelCard(model);
      return `<article class="project-card model-card">
        <div class="card-top"><div class="card-identity">${cardMark(model)}<div><p class="family-label">${escapeHTML(taxonomyName("model_types", model.model_type))}</p><h2>${escapeHTML(model.name)}</h2><div class="repo">${escapeHTML(model.developer)}</div></div></div><div class="score-ring" aria-label="Model-access score ${escapeHTML(model.score.overall)} out of 10">${escapeHTML(model.score.overall)}</div></div>
        <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(model.source_model))}</span>${model.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
        <p>${escapeHTML(model.description)}</p>
        ${modelSourceMeta(model)}
        ${badgeRow(AppCore.cardBadges("model", model))}
        <div class="card-footer"><span>${escapeHTML(AppCore.modelSourceLabel(model))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="model" data-compare-id="${escapeHTML(model.id)}" aria-label="Add ${escapeHTML(model.name)} to comparison" aria-pressed="false">Compare</button>${detailsButton("data-model", model.id, model.name)}</div></div>
      </article>`;
    },
  },
  robots: {
    grid: "#robot-grid",
    resultCount: "#robot-result-count",
    pageKey: "robots",
    dataset: "robot",
    noun: ["robot", "robots"],
    empty: "No robots match these filters.",
    open: id => openRobot(id),
    context: () => ({ suffix: " · Unscored", comparable: false }),
    records: term => AppCore.filterRobots(state.robots, {
      term,
      searchIndex: searchIndexes.robots,
      labelOf: searchLabel,
      formFactor: $("#robot-form-factor-filter").value,
      aiBasis: $("#robot-ai-basis-filter").value,
      availability: $("#robot-availability-filter").value,
      status: $("#robot-status-filter").value,
    }),
    card: robot => robotCard(robot),
  },
};

function renderCollection(name) {
  const collection = COLLECTIONS[name];
  const context = collection.context();
  const records = collection.records($(SCOPE_CONTROLS[name].q).value);
  const noun = collection.noun[records.length === 1 ? 0 : 1];
  $(collection.resultCount).textContent = `${records.length} ${noun}${context.suffix}`;
  setSearchCount(name, records.length);
  renderJobHint(name, $(SCOPE_CONTROLS[name].q).value);
  const paged = AppCore.paginate(records, { page: state.page[collection.pageKey], pageSize: state.pageSize });
  state.page[collection.pageKey] = paged.page;
  const grid = $(collection.grid);
  grid.innerHTML = paged.items.map(record => collection.card(record, context)).join("")
    || emptyStateMarkup(name, collection.empty);
  $$(`[${AppCore.datasetAttribute(collection.dataset)}]`, grid).forEach(button =>
    button.addEventListener("click", () => collection.open(button.dataset[collection.dataset])));
  if (context.comparable) {
    bindComparisonButtons(grid);
    renderComparisonControls();
  }
  hideDetachedBadgeTooltip();
  renderPager(collection.pageKey, paged);
  if (activeScope() === name) writeScopeURL();
}

const renderProjects = () => renderCollection("systems");
const renderSpecifications = () => renderCollection("specifications");
const renderInferenceServices = () => renderCollection("inference");
const renderLocalRuntimes = () => renderCollection("runtimes");
const renderModels = () => renderCollection("models");
const renderLabs = () => renderCollection("labs");

const RUNTIME_MATRIX_CONTROLS = {
  runtimeAccelerator: { selector: "#matrix-accelerator", fallback: "" },
  runtimeFormat: { selector: "#matrix-format", fallback: "" },
  matrix: { selector: "#matrix-columns", fallback: "accelerators" },
};
const RUNTIME_MATRIX_GROUPS = {
  accelerators: { taxonomy: "runtime_accelerators", name: "Hardware" },
  model_formats: { taxonomy: "runtime_model_formats", name: "Model formats" },
  api_styles: { taxonomy: "inference_api_styles", name: "API styles" },
};

function runtimeMatrixColumns(field) {
  return state.taxonomy[RUNTIME_MATRIX_GROUPS[field].taxonomy]
    .filter(item => state.localRuntimes.some(runtime => (runtime[field] || []).includes(item.id)));
}

function populateRuntimeMatrixFilters() {
  for (const [field, selector] of [["accelerators", "#matrix-accelerator"], ["model_formats", "#matrix-format"]]) {
    $(selector).insertAdjacentHTML("beforeend", runtimeMatrixColumns(field)
      .map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join(""));
  }
}

// Matrix parameters belong only to Explore. Ordinary catalog links create a
// history entry, so Back and reload restore this exact hardware/format slice.
function restoreRuntimeMatrix() {
  const params = new URL(window.location.href).searchParams;
  for (const [key, { selector, fallback }] of Object.entries(RUNTIME_MATRIX_CONTROLS)) {
    const value = params.get(key) || fallback;
    const select = $(selector);
    select.value = [...select.options].some(option => option.value === value) ? value : fallback;
  }
  updateRuntimeMatrix();
}

function updateRuntimeMatrix() {
  const url = new URL(window.location.href);
  for (const [key, { selector, fallback }] of Object.entries(RUNTIME_MATRIX_CONTROLS)) {
    const value = $(selector).value;
    if (value === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  writeURL(url);
  renderRuntimeMatrix();
}

function renderRuntimeMatrix() {
  const accelerator = $("#matrix-accelerator").value;
  const modelFormat = $("#matrix-format").value;
  const field = $("#matrix-columns").value;
  const rows = AppCore.filterLocalRuntimes(state.localRuntimes, { accelerator, modelFormat, sort: "name" });
  const columns = runtimeMatrixColumns(field);
  const group = RUNTIME_MATRIX_GROUPS[field].name;
  const params = new URLSearchParams({ collection: "runtimes", sort: "name" });
  if (accelerator) params.set("accelerator", accelerator);
  if (modelFormat) params.set("modelFormat", modelFormat);
  $("#runtime-matrix-browse").href = `?${params}`;
  $("#runtime-matrix-date").textContent = `Catalog review date ${state.runtimesVerifiedAt || "not recorded"}`;
  $("#runtime-matrix-count").textContent = `${rows.length} of ${state.localRuntimes.length} reviewed runtimes`;
  if (!rows.length) {
    $("#runtime-matrix-content").innerHTML = '<p class="notice">No reviewed runtimes match both filters. Change a filter or reset the matrix.</p>';
    return;
  }
  const body = rows.map(runtime => {
    const recordParams = new URLSearchParams(params);
    recordParams.set("record", `runtime:${runtime.id}`);
    const cells = columns.map(column => {
      const recorded = (runtime[field] || []).includes(column.id);
      return `<td${recorded ? ' class="is-recorded"' : ""}><span aria-hidden="true">${recorded ? "●" : "—"}</span><span class="visually-hidden">${recorded ? "Recorded" : "Not recorded"}</span></td>`;
    }).join("");
    return `<tr><th scope="row"><a href="?${escapeHTML(recordParams.toString())}">${escapeHTML(runtime.name)}</a></th>${cells}</tr>`;
  }).join("");
  $("#runtime-matrix-content").innerHTML = `<div class="runtime-matrix-scroll" role="region" aria-label="Runtime ${escapeHTML(group)} table, scroll horizontally for more columns" tabindex="0" aria-describedby="runtime-matrix-note">
    <table class="runtime-matrix"><caption>${escapeHTML(group)} recorded for the selected runtimes. Names open reviewed details.</caption>
    <thead><tr><th scope="col">Runtime</th>${columns.map(column => `<th scope="col">${escapeHTML(column.name)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function systemAnalysisCell(cell, row, facet, rowFacet) {
  const share = accessPercent(cell.count, row.count);
  const content = `<strong>${cell.count}</strong><span>${share}%</span>`;
  const style = `--access-share: ${share}%`;
  if (!cell.count || !row.id) return `<td><span class="deployment-cell" style="${style}">${content}</span></td>`;
  const params = new URLSearchParams({ collection: "systems", [rowFacet]: row.id, [facet]: cell.id, sort: "name" });
  const name = `${row.name}, ${cell.name}: ${cell.count} of ${row.count} active systems (${share}%). Browse systems`;
  return `<td><a class="deployment-cell" style="${style}" href="?${escapeHTML(params.toString())}" aria-label="${escapeHTML(name)}">${content}</a></td>`;
}

function systemAnalysisTable(id, caption, heading, rows, columns, facet, rowFacet) {
  const body = rows.map(row => `<tr><th scope="row">${escapeHTML(row.name)}<small>${row.count} active systems</small></th>${row.cells.map(cell => systemAnalysisCell(cell, row, facet, rowFacet)).join("")}</tr>`).join("");
  return `<div class="deployment-scroll" role="region" aria-label="${escapeHTML(heading)} table, scroll horizontally for more columns" tabindex="0">
    <table id="${id}" class="deployment-table"><caption>${escapeHTML(caption)}</caption>
    <thead><tr><th scope="col">${escapeHTML(heading)}</th>${columns.map(column => `<th scope="col">${escapeHTML(column.name)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function renderSystemDeployment(dates) {
  const summary = AppCore.systemDeploymentSummary(state.projects, state.taxonomy);
  const dated = dates?.first ? `Editorial review dates ${dates.first} to ${dates.last}` : "No editorial review dates recorded";
  $("#deployment-data-note").textContent = `${summary.total} active reviewed systems · ${summary.excluded} inactive records excluded · ${dated} · ${dates?.missing ?? summary.total} without a recorded review date`;
  if (!summary.total) {
    $("#system-deployment-content").innerHTML = '<p class="notice">No active reviewed systems are available.</p>';
    return;
  }
  $("#system-deployment-content").innerHTML = systemAnalysisTable("deployment-heatmap",
    "Deployment by family. Counts and percentages of each row; darker cells indicate a larger share. Deployment modes overlap.",
    "System family", summary.families, summary.deployments, "deployment", "family")
    + `<p class="runtime-scroll-hint">Scroll horizontally for every deployment mode. ${summary.missingDeployment} active systems have no recorded deployment mode.</p>
    <div class="explore-section-heading access-matrix-section"><h3>Is local-first tied to licensing?</h3><p>Each system belongs to exactly one local-first column. Percentages use the license classification’s total.</p></div>`
    + systemAnalysisTable("local-license-table", "Local-first by license classification. Counts and percentages of each row; Yes, No, and Not recorded sum to the row total.",
      "License classification", summary.licensing, summary.localStates, "localOnly", "sourceModel");
}

function modelAccessURL(distribution, sourceModel = "") {
  const params = new URLSearchParams({ collection: "models", distribution, sort: "name" });
  if (sourceModel) params.set("sourceModel", sourceModel);
  return `?${params}`;
}

const accessPercent = (count, total) => total ? Math.round(count / total * 1000) / 10 : 0;

function modelAccessCell(mode, row) {
  const share = accessPercent(mode.count, row.count);
  const contents = `<strong>${mode.count}</strong><span>${share}%</span><span class="access-cell-bar" style="--access-share: ${share}%" aria-hidden="true"></span>`;
  // Unknown classifications have no catalog facet; never link to a broader
  // set than the count describes. Zero cells are plain text as well.
  if (!mode.count || !row.id) return `<td><span class="access-cell">${contents}</span></td>`;
  const name = `${row.name}, ${mode.name}: ${mode.count} of ${row.count} releases (${share}%). Browse models`;
  return `<td><a class="access-cell" href="${escapeHTML(modelAccessURL(mode.id, row.id))}" aria-label="${escapeHTML(name)}">${contents}</a></td>`;
}

function renderModelAccess() {
  const summary = AppCore.modelAccessSummary(state.models, state.taxonomy.source_models, state.taxonomy.model_distribution_modes);
  const date = state.modelsVerifiedAt ? ` · Catalog review date ${state.modelsVerifiedAt}` : "";
  $("#explore-data-note").textContent = `${summary.total} reviewed releases · ${summary.excluded} imported records excluded${date}`;
  if (!summary.total) {
    $("#model-access-content").innerHTML = '<p class="notice">No reviewed model releases are available for this view.</p>';
    return;
  }
  const bars = summary.modes.map(mode => {
    const share = accessPercent(mode.count, summary.total);
    const contents = `<span class="access-route-label">${escapeHTML(mode.name)}</span><span class="access-route-value"><strong>${mode.count}</strong> / ${summary.total} <span>(${share}%)</span></span><span class="access-route-track" aria-hidden="true"><span style="--access-share: ${share}%"></span></span>`;
    const name = `${mode.name}: ${mode.count} of ${summary.total} reviewed releases (${share}%). Browse models`;
    return `<li>${mode.count ? `<a href="${escapeHTML(modelAccessURL(mode.id))}" aria-label="${escapeHTML(name)}">${contents}</a>` : `<div>${contents}</div>`}</li>`;
  }).join("");
  const rows = summary.rows.map(row => `<tr><th scope="row">${escapeHTML(row.name)}<small>${row.count} ${row.count === 1 ? "release" : "releases"}</small></th>${row.modes.map(mode => modelAccessCell(mode, row)).join("")}</tr>`).join("");
  $("#model-access-content").innerHTML = `
    <section class="access-routes" aria-labelledby="access-routes-title">
      <div class="explore-section-heading"><h2 id="access-routes-title">Three ways in</h2><p>A release can offer more than one route. Select a bar to browse its models.</p></div>
      <ul class="access-route-list">${bars}</ul>
      <div class="access-scale" aria-hidden="true"><span>0%</span><span>100% of reviewed releases</span></div>
    </section>
    <section class="access-matrix-section" aria-labelledby="access-matrix-title">
      <div class="explore-section-heading"><h2 id="access-matrix-title">Access meets licensing</h2><p>Downloadable weights do not imply an open-source license. Select a count to inspect the matching releases and their terms.</p></div>
      <table class="access-matrix">
        <caption>Reviewed releases by license classification and access route. Percentages are of each row; routes overlap.</caption>
        <thead><tr><th scope="col">License classification</th>${summary.modes.map(mode => `<th scope="col">${escapeHTML(mode.name)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    ${summary.missingDistribution ? `<p class="notice">${summary.missingDistribution} reviewed releases have no recorded distribution mode; they remain in the denominators.</p>` : ""}`;
}

// One lab's releases for the Models view's Lab facet: its reviewed releases and
// the imported rows in their models.dev namespaces. No lab selected, no filter.
function labModelIds(labId) {
  const lab = labId ? state.labs.find(item => item.id === labId) : null;
  if (!lab) return undefined;
  const relations = labRelationsFor(lab);
  return new Set([...relations.models, ...relations.sourceRows].map(model => model.id));
}
// One grid of installables: unscored packs beside scored host-installed
// systems (ADR 035). Pack facets narrow only packs; the search term narrows
// both. Scores stay hidden and comparison stays off, as the scope requires.
function packScope(term) {
  const packs = AppCore.filterPacks(state.packs, {
    term,
    searchIndex: searchIndexes.packs,
    labelOf: searchLabel,
    type: $("#pack-type-filter").value,
    host: $("#pack-host-filter").value,
    install: $("#pack-install-filter").value,
    license: $("#pack-license-filter").value,
  });
  const systems = AppCore.packShapedSystems(state.projects, {
    term,
    searchIndex: searchIndexes.systems,
    labelOf: searchLabel,
  });
  const entries = AppCore.mergePackScopeEntries(packs, systems, {
    term, packIndex: searchIndexes.packs, systemIndex: searchIndexes.systems, labelOf: searchLabel,
  });
  return { packs, systems, entries };
}

function renderPacks() {
  const { packs, systems, entries } = packScope($("#pack-search").value);
  const packNoun = packs.length === 1 ? "pack" : "packs";
  const systemNoun = systems.length === 1 ? "installed system" : "installed systems";
  $("#pack-result-count").textContent = `${packs.length} ${packNoun} · ${systems.length} ${systemNoun} · Scores hidden`;
  setSearchCount("packs", entries.length);
  const paged = AppCore.paginate(entries, { page: state.page.packs, pageSize: state.pageSize });
  state.page.packs = paged.page;
  const grid = $("#pack-grid");
  grid.innerHTML = paged.items.map(({ kind, record }) =>
    kind === "pack" ? packCard(record) : mixedSystemCard(record)).join("")
    || emptyStateMarkup("packs", "No agent packs match these filters.");
  $$('[data-pack]', grid).forEach(button => button.addEventListener("click", () => openPack(button.dataset.pack)));
  $$('[data-project]', grid).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  paintMarks(grid);
  hideDetachedBadgeTooltip();
  renderPager("packs", paged);
  if (activeScope() === "packs") writeScopeURL();
}

// Repaint whatever a search index could have widened. A search box may have a
// term in it already when its index lands, so this runs for the collection on
// screen. The others are painted when they open (setDirectoryCollection), so
// a hidden grid is not repainted here.
function renderSearchSurfaces() {
  pageRenderer(state.directoryCollection)?.();
  if (state.directoryRoles) renderFinder();
}

function bindComparisonButtons(root) {
  $$('[data-compare-kind]', root).forEach(button => button.addEventListener("click", () => {
    toggleComparison(button.dataset.compareKind, button.dataset.compareId);
  }));
}

function finderChoice(key, item) {
  return `<button class="finder-choice" data-finder-choice="${escapeHTML(key)}" data-finder-value="${escapeHTML(item.id)}">
    ${item.cue ? `<span class="finder-choice-cue">${escapeHTML(item.cue)}</span>` : ""}
    <strong>${escapeHTML(item.label)}</strong>
    <span>${escapeHTML(item.description)}</span>
  </button>`;
}

function renderFinderProgress() {
  const step = state.finder.step;
  const labels = ["Direction", "Job", "Priority"];
  $("#finder-progress").innerHTML = labels.map((item, index) => {
    const status = step > index ? "is-complete" : step === index ? "is-active" : "";
    return `<div class="finder-progress-step ${status}"><span>${step > index ? "✓" : index + 1}</span><strong>${item}</strong></div>`;
  }).join("") + `<p>${step >= 3 ? "Shortlist ready" : `Step ${step + 1} of 3`}</p>`;
}

function renderFinder() {
  renderFinderProgress();
  const { step, answers } = state.finder;
  let content;
  if (step === 0) {
    content = `<div class="finder-question"><p class="eyebrow">Start with the outcome</p><h2>What should it do?</h2><p>Preserve knowledge, carry out delegated work, assist interactively, or serve models through a managed inference layer.</p></div>
      <div class="finder-choice-grid direction-grid">${AppCore.FINDER_DIRECTIONS.map(item => finderChoice("direction", item)).join("")}</div>`;
  } else if (step === 1) {
    const choices = AppCore.FINDER_GOALS[answers.direction];
    content = `<div class="finder-question"><p class="eyebrow">${escapeHTML(finderDirectionName(answers.direction))}</p><h2>Choose the closest job.</h2><p>You can broaden the directory afterward.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("goal", item)).join("")}</div>`;
  } else if (step === 2) {
    // The shortlist's candidates are known once the goal is: fetch their detail
    // now, while the priority question is on screen.
    ensureFinderDetail();
    const choices = AppCore.FINDER_PRIORITIES[answers.direction];
    content = `<div class="finder-question"><p class="eyebrow">Final tradeoff</p><h2 tabindex="-1">What matters most?</h2><p>This adjusts ranking only within the selected score profile.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("priority", item)).join("")}</div>`;
  } else {
    const { direction, goal } = answers;
    const pending = ensureFinderDetail();
    if (pending) {
      pending.then(() => {
        if (state.finder.step === 3 && answers.direction === direction && answers.goal === goal) renderFinder();
      });
      content = `<div class="finder-question"><p class="eyebrow">Your shortlist</p><h2>Reading the reviewed scores…</h2><p>Ranking these matches needs the full score for each candidate.</p></div>`;
    } else {
      content = renderFinderResults();
    }
  }
  const navigation = step > 0 ? `<div class="finder-navigation"><button class="ghost-button" data-finder-back>← Back</button><button class="ghost-button" data-finder-reset>Start over</button></div>` : "";
  $("#finder-content").innerHTML = content + navigation;
}

// How much sticks to the top of the viewport. The header sticks only above
// phone widths, and in results the scope strip sticks under it, so each
// counts only while it is sticky; a hidden strip measures no height.
function stickyHeight() {
  const sticky = element => element && getComputedStyle(element).position === "sticky" ? element.getBoundingClientRect().height : 0;
  return sticky($(".site-header")) + sticky($("#scope-strip"));
}

// The sticky height plus the reading margin both Finder scroll corrections
// leave beneath it, measured once so the two never disagree.
function headerClearance() {
  return stickyHeight() + 12;
}

// A choice replaces the panel's content, which can leave the step indicator
// under the sticky header; bring the shell's top back into view, instantly.
function keepFinderInView() {
  const shell = $(".finder-shell");
  const clearance = headerClearance();
  const top = shell.getBoundingClientRect().top;
  if (top < clearance) window.scrollBy({ top: top - clearance, behavior: "instant" });
}

const finderDetailAwaited = new Set();

// The records a Finder goal can draw on: active systems in its family and
// role set, or services or runtimes of its type (docs/WEB.md).
function finderGoalRecords(direction, goalConfig) {
  if (direction === "inference_service") return state.inferenceServices.filter(item => goalConfig.serviceTypes.includes(item.service_type));
  if (direction === "local_runtime") return state.localRuntimes.filter(item => goalConfig.runtimeTypes.includes(item.runtime_type));
  return state.projects.filter(item => item.status === "active" && item.system_family === direction && goalConfig.roles.includes(item.primary_role));
}

function finderCandidates() {
  const { direction, goal } = state.finder.answers;
  const goalConfig = AppCore.FINDER_GOALS[direction]?.find(item => item.id === goal);
  return goalConfig ? finderGoalRecords(direction, goalConfig) : [];
}

let finderGoalList = null;
function finderGoalEntries() {
  finderGoalList ||= Object.entries(AppCore.FINDER_GOALS).flatMap(([direction, goals]) =>
    goals.map(goal => ({ ...goal, direction, eligible: finderGoalRecords(direction, goal).length })));
  return finderGoalList;
}

// The job is already chosen, so focus lands on the question it leaves open.
function openFinderAt(direction, goal) {
  state.finder = { step: 2, answers: { direction, goal } };
  renderFinder();
  activateView("finder", { focusTarget: $("#finder-content h2") });
}

function renderJobHint(scope, term) {
  const hint = $(`[data-job-hint="${scope}"]`);
  if (!hint) return;
  const goal = term.trim() ? AppCore.matchFinderGoal(finderGoalEntries(), term) : null;
  hint.hidden = !goal;
  hint.innerHTML = goal
    ? `<span>Looks like a job: <strong>${escapeHTML(goal.label)}</strong>. The Finder can shortlist from ${goal.eligible} reviewed ${goal.eligible === 1 ? "record" : "records"}.</span><button type="button" class="link-button" data-finder-goal="${escapeHTML(`${goal.direction}:${goal.id}`)}">Open shortlist →</button>`
    : "";
}

// What each scope searches before any facet applies, as [kind, records, index]
// groups: the kind searchFields reads a record as, and the search index the
// scope's own filter widens it with once that index has loaded.
const SCOPE_RECORDS = {
  all: () => [
    ["system", state.projects, searchIndexes.systems], ["inference", state.inferenceServices, searchIndexes.inference],
    ["runtime", state.localRuntimes, searchIndexes.runtimes], ["model", state.models, searchIndexes.models],
    ["pack", state.packs, searchIndexes.packs], ["robot", state.robots, searchIndexes.robots],
  ],
  systems: () => [["system", state.projects, searchIndexes.systems]],
  inference: () => [["inference", state.inferenceServices, searchIndexes.inference]],
  runtimes: () => [["runtime", state.localRuntimes, searchIndexes.runtimes]],
  packs: () => [["pack", state.packs, searchIndexes.packs], ["system", AppCore.packShapedSystems(state.projects, {}), searchIndexes.systems]],
  robots: () => [["robot", state.robots, searchIndexes.robots]],
  models: () => [["model", state.models, searchIndexes.models]],
  labs: () => [["lab", state.labs, searchIndexes.labs]],
  specifications: () => [["spec", state.specifications, searchIndexes.specifications]],
};

// What a query still finds when a scope lists nothing for it, across the whole
// catalog: All's six kinds, then Labs and Specifications, which All leaves
// out. It runs the matcher every scope's filter runs, with each kind's index
// once that index has loaded, and every facet ignored.
// - `hidden`: this scope's own matches. It lists none of them, so its facets
//   hide every one. All has no facets, so it hides nothing.
// - `elsewhere`: matches of All's kinds outside this scope, which All lists.
// - `found`: whether anything in the catalog matches at all.
function emptyResultMatches(scope, term) {
  const query = AppCore.parseSearchQuery(term);
  const matches = [...SCOPE_RECORDS.all(), ...SCOPE_RECORDS.labs(), ...SCOPE_RECORDS.specifications()]
    .flatMap(([kind, records, index]) => records
      .filter(record => AppCore.recordMatch(query, AppCore.searchFields(kind, record, { index, labelOf: searchLabel })) > 0)
      .map(record => ({ kind, record })));
  if (scope === "all") return { hidden: [], elsewhere: [], found: matches.length > 0 };
  const own = new Set((SCOPE_RECORDS[scope]?.() || []).flatMap(([, records]) => records));
  const allKinds = new Set(SCOPE_RECORDS.all().map(([kind]) => kind));
  return {
    hidden: matches.filter(({ record }) => own.has(record)),
    elsewhere: matches.filter(({ kind, record }) => allKinds.has(kind) && !own.has(record)),
    found: matches.length > 0,
  };
}

// The records a scope lists under its current facets with no query: what its
// did-you-mean draws from, so a suggestion always matches something in the
// scope as filtered.
function facetedRecords(scope) {
  if (scope === "packs") return packScope("").entries.map(entry => entry.record);
  if (COLLECTIONS[scope]) return COLLECTIONS[scope].records("");
  return (SCOPE_RECORDS[scope]?.() || []).flatMap(([, records]) => records);
}

// "Show it" under an empty result: clears every facet the scope's URL
// carries, keeping its query and sort, then repaints through each changed
// control's own input path, so the page, the counts, and the URL follow.
// Systems also drops a Finder role set, a facet no control holds. Its search
// box takes focus, as the button that asked sits in the grid it repaints;
// openCollection clears a panel still hidden and places focus itself.
function clearScopeFacets(scope, { focus = true } = {}) {
  if (!SCOPE_CONTROLS[scope]) return;
  if (scope === "systems") {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
  }
  const changed = Object.entries(SCOPE_CONTROLS[scope])
    .filter(([key]) => key !== "q" && key !== "sort")
    .map(([, selector]) => $(selector))
    .filter(control => (control.type === "checkbox" ? control.checked : control.value !== ""));
  changed.forEach(control => {
    if (control.type === "checkbox") control.checked = false;
    else control.value = "";
  });
  changed.forEach(control => control.dispatchEvent(new Event("input", { bubbles: true })));
  if (!changed.length) pageRenderer(scope)?.();
  if (focus) $(SCOPE_CONTROLS[scope].q).focus();
}

// "Search all" under an empty result: lists the query in All, opening the
// Directory first when another view is active. It writes All's box itself
// and opens All without a carry, so All searches exactly the text the empty
// result named. Focusing All's box loads its indexes, as it does for a typed
// query.
function searchAllCollections(term) {
  if ($(".view.is-active")?.id !== "directory") activateView("directory");
  $("#all-directory-search").value = term;
  state.page.all = 1;
  setDirectoryCollection("all", { carryQuery: false });
  $("#all-directory-search").focus();
}

// Names compared the way search and suggestNames compare them: a hyphen reads
// as a space, so "claude squad" names claude-squad.
const comparableName = text => AppCore.comparableText(text);

// The list lands once, and every search surface repaints, since the suggestion
// form under any empty result waits for it.
let exclusionsRequest = null;
function excludedEntry(term) {
  if (!state.exclusions) {
    exclusionsRequest ||= loadJSON("exclusions.json")
      .then(data => { state.exclusions = data.entries || []; })
      .catch(() => { state.exclusions = []; })
      .then(renderSearchSurfaces);
    return null;
  }
  const wanted = comparableName(term);
  return state.exclusions.find(entry => comparableName(entry.name) === wanted) || null;
}

function suggestionURL(term) {
  return `https://github.com/katagun/ai-systems-atlas/issues/new?template=system-suggestion.yml&name=${encodeURIComponent(term.trim())}`;
}

// Every search index an empty result reads: All's six kinds, then Labs and
// Specifications (emptyResultMatches).
const CATALOG_INDEXES = ["systems", "inference", "runtimes", "models", "packs", "robots", "labs", "specifications"];
const catalogIndexWaits = new Set();

// Whether any of those indexes is still on its way. Each one neither loaded
// nor failed is fetched, and the search surfaces repaint once as it lands. A
// failed index counts as settled: an empty result never asks for it again,
// so an index that keeps failing cannot loop.
function catalogIndexesPending() {
  let pending = false;
  for (const collection of CATALOG_INDEXES) {
    if (searchIndexes[collection] || searchIndexFailed.has(collection)) continue;
    pending = true;
    if (catalogIndexWaits.has(collection)) continue;
    catalogIndexWaits.add(collection);
    loadSearchIndex(collection)?.then(() => {
      catalogIndexWaits.delete(collection);
      renderSearchSurfaces();
    });
  }
  return pending;
}

// An empty result names what the reader can do next (R-P1-11, R-P1-15): a
// match the facets hide is offered back, and a match in another collection is
// offered through All. The query is suggested for review only when nothing in
// the catalog answers it and no exclusion names it. An imported models.dev row
// is not Atlas reviewed, so a hidden count holding one does not say "reviewed".
// Until every index has settled, part of the catalog is searched by its boot
// fields alone, so only did-you-mean, which reads names, and the Finder show.
function emptyStateMarkup(scope, fallback) {
  const selector = SCOPE_CONTROLS[scope]?.q;
  const term = selector ? $(selector).value : "";
  if (!term.trim()) return `<div class="notice">${fallback}</div>`;
  const settled = !catalogIndexesPending();
  const { hidden, elsewhere, found } = settled ? emptyResultMatches(scope, term) : { hidden: [], elsewhere: [], found: false };
  const typed = comparableName(term);
  const names = AppCore.suggestNames(facetedRecords(scope), term).filter(name => comparableName(name) !== typed);
  const excluded = settled ? excludedEntry(term) : null;
  // The form also waits for the exclusions list, so it never invites review
  // of a name the review already left out.
  const suggest = settled && !found && !excluded && Array.isArray(state.exclusions);
  const reviewed = hidden.every(({ kind, record }) => kind !== "model" || isReviewedModel(record)) ? "reviewed " : "";
  return `<div class="notice empty-search">
    <p><strong>No matches for “${escapeHTML(term.trim())}”${hidden.length ? " with these filters" : ""}.</strong></p>
    ${hidden.length ? `<p>It matches ${hidden.length} ${reviewed}${hidden.length === 1 ? "record" : "records"} your filters hide. <button type="button" class="link-button" data-empty-unfilter>${hidden.length === 1 ? "Show it" : "Show them"}</button></p>` : ""}
    ${elsewhere.length ? `<p>It matches ${elsewhere.length} ${elsewhere.length === 1 ? "record" : "records"} in other collections. <button type="button" class="link-button" data-empty-search-all>Search all</button></p>` : ""}
    ${names.length ? `<p>Did you mean ${names.map(name => `<button type="button" class="link-button" data-suggest-query="${escapeHTML(name)}">${escapeHTML(name)}</button>`).join(", ")}?</p>` : ""}
    ${excluded ? `<p><strong>Reviewed and left out:</strong> ${escapeHTML(excluded.name)}. ${escapeHTML(excluded.reason)}</p>` : ""}
    <p><button type="button" class="link-button" data-empty-finder>Try the Finder</button>${suggest ? ` · <a href="${escapeHTML(suggestionURL(term))}" target="_blank" rel="noreferrer">Suggest it for review</a>` : ""}</p>
  </div>`;
}

// Null once this goal's candidates have been waited on, so a detail file that
// never arrives costs one wait and then a shortlist built from what landed —
// never an endless retry.
function ensureFinderDetail() {
  const { direction, goal } = state.finder.answers;
  const key = `${direction}:${goal}`;
  if (finderDetailAwaited.has(key)) return null;
  const kind = AppCore.FINDER_DETAIL_KINDS[direction] || "system";
  const pending = finderCandidates().map(record => loadDetail(kind, record)).filter(Boolean);
  if (!pending.length) {
    finderDetailAwaited.add(key);
    return null;
  }
  return Promise.all(pending).then(() => { finderDetailAwaited.add(key); });
}

function recommendedFinderRecords() {
  const { direction, goal, priority } = state.finder.answers;
  const goalConfig = AppCore.FINDER_GOALS[direction].find(item => item.id === goal);
  return finderCandidates()
    .map(project => {
      const classificationIndex = direction === "inference_service" ? goalConfig.serviceTypes.indexOf(project.service_type)
        : direction === "local_runtime" ? goalConfig.runtimeTypes.indexOf(project.runtime_type)
        : goalConfig.roles.indexOf(project.primary_role);
      const match = 6 - classificationIndex * 0.4 + project.score.overall * 0.2 + AppCore.priorityBoost(project, priority);
      return { project, match, reasons: AppCore.recommendationReasons(project, priority, taxonomyName) };
    })
    .sort((a, b) => b.match - a.match || b.project.score.overall - a.project.score.overall || a.project.name.localeCompare(b.project.name))
    .slice(0, 3);
}

function renderFinderResults() {
  const { direction, goal, priority } = state.finder.answers;
  const goalConfig = AppCore.FINDER_GOALS[direction].find(item => item.id === goal);
  const priorityConfig = AppCore.FINDER_PRIORITIES[direction].find(item => item.id === priority);
  const results = recommendedFinderRecords();
  const isInference = direction === "inference_service";
  const isRuntime = direction === "local_runtime";
  const classificationLabel = record => isInference ? taxonomyName("inference_service_types", record.service_type)
    : isRuntime ? taxonomyName("local_runtime_types", record.runtime_type)
    : roleName(record.primary_role);
  const identityRow = record => {
    if (isInference) return `<span class="source-badge">${escapeHTML(record.operator)}</span><span class="license-badge">${escapeHTML(record.terms.label)}</span>`;
    const badge = isRuntime ? record.maintainer : sourceModelName(record.source_model);
    return `<span class="source-badge">${escapeHTML(badge)}</span>${record.licenses.map(license => `<span class="license-badge" title="${escapeHTML(licenseName(license))}">${escapeHTML(license)}</span>`).join("")}`;
  };
  const detailAttribute = isInference ? "data-finder-inference" : isRuntime ? "data-finder-runtime" : "data-finder-project";
  const profileLabel = isInference ? "inference-service" : isRuntime ? "local-runtime" : "";
  return `<div class="finder-result-heading"><div><p class="eyebrow">Your shortlist</p><h2>${escapeHTML(goalConfig.label)}</h2><p>Within ${escapeHTML(finderDirectionName(direction).toLowerCase())}, weighted for “${escapeHTML(priorityConfig.label.toLowerCase())}.”</p></div><button class="primary-button" data-finder-directory>Browse matches →</button></div>
    <div class="finder-results">${results.map(({ project, reasons }, index) => `<article class="finder-result ${escapeHTML(project.system_family || direction)}">
      <div class="finder-result-top">${cardMark(project)}<div class="finder-rank">0${index + 1}</div></div>
      <div><p class="family-label">${escapeHTML(classificationLabel(project))}</p><h3>${escapeHTML(project.name)}</h3><p>${escapeHTML(project.description)}</p>
        <div class="license-row">${identityRow(project)}</div>
      </div>
      <div class="finder-why"><strong>Why it surfaced</strong><div class="tags">${reasons.map(reason => `<span>${escapeHTML(reason)}</span>`).join("")}</div></div>
      <p class="finder-tradeoff"><strong>Watch for:</strong> ${detailText(isInference || isRuntime ? project.tradeoffs?.[0] : project.weaknesses?.[0])}</p>
      ${badgeRow(AppCore.cardBadges(isInference ? "inference" : isRuntime ? "runtime" : "system", project))}
      <div class="finder-result-footer"><span>${footerFacts(`${escapeHTML(project.score.overall)} / 10 ${escapeHTML(profileLabel || project.score_profile)} score`, starCount(project))}</span>${detailsButton(detailAttribute, project.id, project.name)}</div>
    </article>`).join("")}</div>
    <p class="finder-disclaimer">A curated starting point—not a benchmark of your workload.</p>`;
}

// Each branch lands on the first page of its matches: a page kept from
// earlier browsing, or restored from the URL, belongs to another list.
function applyFinderToDirectory() {
  const { direction, goal } = state.finder.answers;
  const goalConfig = AppCore.FINDER_GOALS[direction].find(item => item.id === goal);
  clearComparison();
  if (direction === "local_runtime") {
    $("#runtime-search").value = "";
    $("#runtime-type-filter").value = goalConfig.runtimeTypes[0];
    $("#runtime-accelerator-filter").value = "";
    $("#runtime-format-filter").value = "";
    $("#runtime-api-filter").value = "";
    $("#runtime-sort-filter").value = "score";
    syncMatchSort("runtimes");
    state.page.runtimes = 1;
    setDirectoryCollection("runtimes", { carryQuery: false });
    activateView("directory");
    revealDirectoryResults();
    return;
  }
  if (direction === "inference_service") {
    $("#inference-search").value = "";
    $("#inference-type-filter").value = goalConfig.serviceTypes[0];
    $("#inference-delivery-filter").value = "";
    $("#inference-model-source-filter").value = "";
    $("#inference-api-filter").value = "";
    $("#inference-sort-filter").value = "score";
    syncMatchSort("inference");
    state.page.inference = 1;
    setDirectoryCollection("inference", { carryQuery: false });
    activateView("directory");
    revealDirectoryResults();
    return;
  }
  $("#project-search").value = "";
  $("#family-filter").value = direction;
  populateRoleFilter();
  state.directoryRoles = goalConfig.roles.length > 1 ? [...goalConfig.roles] : null;
  state.directoryRolesLabel = state.directoryRoles ? goalConfig.label : null;
  $("#role-filter").value = goalConfig.roles.length === 1 ? goalConfig.roles[0] : "";
  $("#agent-filter").value = "";
  $("#architecture-filter").value = "";
  $("#deployment-filter").value = "";
  $("#agent-interface-filter").value = "";
  $("#source-model-filter").value = "";
  $("#license-filter").value = "";
  $("#status-filter").value = "active";
  $("#local-filter").value = "";
  $("#sort-filter").value = "score";
  syncMatchSort("systems");
  updateScoreSortAvailability();
  state.page.systems = 1;
  setDirectoryCollection("systems", { carryQuery: false });
  activateView("directory");
  revealDirectoryResults();
}

// The handoff lands on the results the Finder chose, not on the page top above them.
// The Finder view hides the button that asked for this, so focus moves to the
// count of what the Finder chose rather than falling to the page, as it does
// when the Finder chip removes itself. It moves without scrolling, since the
// scroll above has already placed the results.
function revealDirectoryResults() {
  const panel = $(".collection-panel:not([hidden])");
  if (!panel) return;
  window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - headerClearance(), behavior: "instant" });
  $(COLLECTIONS[state.directoryCollection].resultCount).focus({ preventScroll: true });
}

function renderTaxonomy() {
  const roleGroups = state.taxonomy.system_families.map(family => [
    `${family.name} roles`,
    state.taxonomy.primary_roles.filter(item => item.family === family.id),
  ]);
  const glossary = AppCore.cardBadgeGlossary();
  const badgeGroups = Object.entries(AppCore.BADGE_FAMILIES).map(([id, family]) => [
    `Card badges · ${family.name}`,
    glossary.filter(entry => entry.family === id).map(entry => ({
      name: entry.name,
      definition: `${entry.definition} Shown on: ${entry.scopes.join(", ")}.`,
      emblem: AppCore.badgeEmblem(entry.id),
      family: id,
    })),
    { lede: family.meaning, badgeFamily: id },
  ]);
  const groups = [
    ["System families", state.taxonomy.system_families], ...roleGroups,
    ...badgeGroups,
    ["AI relationship", state.taxonomy.agent_relations], ["Architecture", state.taxonomy.architectures],
    ["Retrieval modes", state.taxonomy.retrieval_modes], ["Capture modes", state.taxonomy.capture_modes],
    ["Memory lifecycle", state.taxonomy.memory_lifecycle], ["Agent interfaces", state.taxonomy.agent_interfaces],
    ["Execution boundaries", state.taxonomy.execution_boundaries], ["Agent capabilities", state.taxonomy.agent_capabilities],
    ["Deployment modes", state.taxonomy.deployment_modes], ["Project statuses", state.taxonomy.project_statuses],
    ["Provenance levels", state.taxonomy.provenance_levels], ["Research confidence", state.taxonomy.research_confidence_levels],
    ["Source models", state.taxonomy.source_models], ["Inference service types", state.taxonomy.inference_service_types],
    ["Inference delivery modes", state.taxonomy.inference_delivery_modes], ["Inference model sources", state.taxonomy.inference_model_sources],
    ["Inference API styles", state.taxonomy.inference_api_styles],
    ["Inference-service score", state.taxonomy.inference_service_score_profile.dimensions.map(item => ({name: `${label(item.id)} · ${Math.round(item.weight * 100)}%`, definition: item.definition}))],
    ["Local runtime types", state.taxonomy.local_runtime_types],
    ["Runtime accelerators", state.taxonomy.runtime_accelerators],
    ["Runtime model formats", state.taxonomy.runtime_model_formats],
    ["Runtime serving modes", state.taxonomy.runtime_serving_modes],
    ["Runtime deployment surfaces", state.taxonomy.runtime_deployment_surfaces],
    ["Local-runtime score", state.taxonomy.local_runtime_score_profile.dimensions.map(item => ({name: `${label(item.id)} · ${Math.round(item.weight * 100)}%`, definition: item.definition}))],
    ["Model types", state.taxonomy.model_types],
    ["Model modalities", state.taxonomy.model_modalities],
    ["Model distribution modes", state.taxonomy.model_distribution_modes],
    ["Model-access score", state.taxonomy.model_score_profile.dimensions.map(item => ({name: `${label(item.id)} · ${Math.round(item.weight * 100)}%`, definition: item.definition}))],
    ["Specification types", state.taxonomy.specification_types],
    ["Specification scopes", state.taxonomy.specification_scopes], ["Specification statuses", state.taxonomy.specification_statuses],
    ["Pack types", state.taxonomy.pack_types], ["Pack hosts", state.taxonomy.pack_hosts],
    ["Pack install mechanisms", state.taxonomy.pack_install_mechanisms],
    ["Lab types", state.taxonomy.lab_types], ["Lab channels", state.taxonomy.lab_channel_kinds],
    ["Robot forms", state.taxonomy.robot_form_factors], ["How a robot uses AI", state.taxonomy.robot_ai_bases], ["Robot availability", state.taxonomy.robot_availability],
    ["Kinds of model a robot maker names", state.taxonomy.robot_model_kinds], ["Robot terms", state.taxonomy.robot_terms_kinds],
    ["Licenses and terms", state.taxonomy.licenses]
  ];
  $("#taxonomy-content").innerHTML = groups.map(([name, items, extra = {}]) => `<section class="taxonomy-group"${extra.badgeFamily ? ` data-badge-family="${escapeHTML(extra.badgeFamily)}"` : ""}><h2>${escapeHTML(name)}</h2>${extra.lede ? `<p class="taxonomy-lede">${escapeHTML(extra.lede)}</p>` : ""}<div class="taxonomy-grid">${items.map(item => `<article class="taxonomy-item"${item.family ? ` data-family="${escapeHTML(item.family)}"` : ""}>${item.emblem || ""}<strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.definition || item.note || "An explicit comparison trait.")}</p></article>`).join("")}</div></section>`).join("");
}

// Every record dialog is the same frame — find the record, paint one content
// element, register the open record for deep links and the back button — around
// markup that is genuinely per-collection. The frame lives here once; the
// entries below hold only what differs.
//
// Each of these paints twice on a first open: once from the boot record, once
// when that record's detail lands — and only once, on the boot record, when
// that fetch fails. So nothing a detail file carries is printed raw: prose goes
// through detailText, bulleted lists through detailList, and a list joined into
// one line through detailText as well, so a heading or a bold label that has
// nothing under it yet shows the em dash rather than a blank. The score table
// renders its Overall row first, then the dimensions on the repaint.
function systemDialogMarkup(project) {
  const proof = state.licenses.get(project.id);
  const dimensions = Object.entries(project.score).filter(([key]) => key !== "overall");
  let familyDetail;
  if (project.system_family === "agent_system") {
    familyDetail = `<section class="detail-block"><h3>Agent operation</h3><p><strong>Interfaces:</strong> ${detailText(traitNames("agent_interfaces", project.agent_interfaces))}</p><p><strong>Execution:</strong> ${detailText(traitNames("execution_boundaries", project.execution_boundaries))}</p><p><strong>Capabilities:</strong> ${detailText(traitNames("agent_capabilities", project.agent_capabilities))}</p></section>`;
  } else if (project.system_family === "memory_system") {
    familyDetail = `<section class="detail-block"><h3>Capture & lifecycle</h3><p><strong>Capture:</strong> ${detailText((project.capture_modes || []).map(label).join(" · "))}</p><p><strong>Lifecycle:</strong> ${detailText((project.memory_lifecycle || []).map(label).join(" · "))}</p></section>`;
  } else {
    familyDetail = `<section class="detail-block"><h3>Context & continuity</h3><p><strong>Inputs:</strong> ${detailText((project.capture_modes || []).map(label).join(" · "))}</p><p><strong>Continuity:</strong> ${detailText((project.memory_lifecycle || []).map(label).join(" · "))}</p></section>`;
  }
  const licenseLinks = proof ? proof.items.map(item => item.kind === "git_blob"
    ? `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable evidence ↗</a> · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">source path ↗</a></p>`
    : `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed terms ↗</a></p>`
  ).join("") : `<p>${project.licenses.map(escapeHTML).join(" · ")}</p>`;
  const providerDetail = project.provider_relationship && project.model_backends
    ? `<section class="detail-block"><h3>Model provider support</h3><p><strong>Relationship:</strong> ${escapeHTML(taxonomyName("provider_relationships", project.provider_relationship))}</p><p><strong>Reviewed backends:</strong> ${escapeHTML(project.model_backends.map(item => taxonomyName("model_backends", item)).join(" · "))}</p><p class="unscored-note">These traits describe reviewed support, not an inference-service score. Missing traits mean not reviewed.</p></section>`
    : "";
  const successor = project.superseded_by
    ? state.projects.find(item => item.id === project.superseded_by)
    : null;
  const statusNotice = project.status === "superseded"
    ? `<section class="detail-block status-notice"><h3>Superseded</h3><p>The maintainer designates ${successor ? `<button class="link-button" data-successor="${escapeHTML(successor.id)}">${escapeHTML(successor.name)}</button>` : "a named successor"} as this project's successor. The review below stands; the record is kept as a historical reference rather than a current recommendation.</p></section>`
    : "";
  return `<p class="eyebrow">${escapeHTML(familyName(project.system_family))} · ${escapeHTML(roleName(project.primary_role))}</p><h1>${escapeHTML(project.name)}</h1><p>${detailText(project.why_it_matters)}</p>
    <div class="detail-grid">
      ${statusNotice}
      <section class="detail-block"><h3>System identity</h3><p><strong>AI relationship:</strong> ${escapeHTML(relationName(project.agent_relation))}</p><p><strong>Canonical data:</strong> ${detailText(project.canonical_data)}</p><p><strong>Source model:</strong> ${escapeHTML(sourceModelName(project.source_model))}</p><p><strong>Deployment:</strong> ${escapeHTML(project.deployment.map(item => taxonomyName("deployment_modes", item)).join(", "))}</p>${labLinksMarkup("system", project)}<p><a href="${escapeHTML(project.url)}" target="_blank" rel="noreferrer">${project.repo ? "Open repository" : "Open official product"} ↗</a></p></section>
      <section class="detail-block"><h3>Licenses and terms</h3>${licenseLinks}${project.license_review_status === "review_required" ? '<p class="notice">The reviewed license evidence may be stale and requires human review.</p>' : ""}</section>
      <section class="detail-block"><h3>${escapeHTML(scoreProfileName(project.score_profile))}</h3><table class="score-table">${dimensions.map(([name, value]) => `<tr><td>${escapeHTML(label(name))}</td><td>${escapeHTML(value)}</td></tr>`).join("")}<tr><td><strong>Overall</strong></td><td>${escapeHTML(project.score.overall)}</td></tr></table></section>
      <section class="detail-block"><h3>Strengths</h3>${detailList(project.strengths)}</section>
      <section class="detail-block"><h3>Weaknesses</h3>${detailList(project.weaknesses)}</section>
      <section class="detail-block"><h3>Architecture</h3><p>${project.architectures.map(architectureName).map(escapeHTML).join(" · ")}</p><h3>Retrieval</h3><p>${detailText((project.retrieval_modes || []).map(label).join(" · "))}</p></section>
      ${providerDetail}
      ${familyDetail}
    </div>`;
}

function specificationDialogMarkup(specification) {
  const related = specification.related_specifications.map(relatedId => state.specifications.find(item => item.id === relatedId)).filter(Boolean);
  return `<p class="eyebrow">${escapeHTML(taxonomyName("specification_types", specification.specification_type))} · ${escapeHTML(taxonomyName("specification_scopes", specification.scope))}</p><h1>${escapeHTML(specification.name)}</h1><p>${escapeHTML(specification.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Artifact identity</h3><p><strong>Status:</strong> ${escapeHTML(taxonomyName("specification_statuses", specification.status))}</p><p><strong>Version:</strong> ${escapeHTML(specification.current_version || "Rolling / unversioned")}</p><p><strong>Steward:</strong> ${escapeHTML(specification.stewards.join(" · "))}</p>${labLinksMarkup("spec", specification)}<p><a href="${escapeHTML(specification.url)}" target="_blank" rel="noreferrer">Open official specification ↗</a></p>${specification.repo ? `<p><a href="https://github.com/${escapeHTML(specification.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p>` : ""}</section>
      <section class="detail-block"><h3>What it standardizes</h3><p>${detailText(specification.standardizes)}</p></section>
      <section class="detail-block"><h3>What it does not standardize</h3><p>${detailText(specification.does_not_standardize)}</p></section>
      <section class="detail-block"><h3>Licenses and terms</h3><p>${detailText(specification.license_note)}</p>${(specification.license_evidence || []).map(specificationEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(specification.evidence || []).map(specificationEvidenceLink).join("") || "<p>—</p>"}</section>
      <section class="detail-block"><h3>Related artifacts</h3>${related.length ? `<p>${related.map(item => escapeHTML(item.short_name)).join(" · ")}</p>` : "<p>None recorded.</p>"}<p class="unscored-note">Specifications are classified, not scored. Their value depends on the integration boundary you need.</p></section>
    </div>`;
}

function packDialogMarkup(pack) {
  const formats = (pack.packaging_formats || []).map(id => state.specifications.find(item => item.id === id)).filter(Boolean);
  const relatedPacks = (pack.related_packs || []).map(id => state.packs.find(item => item.id === id)).filter(Boolean);
  const relatedSystems = (pack.related_systems || []).map(id => state.projects.find(item => item.id === id)).filter(Boolean);
  return `<p class="eyebrow">Agent pack · ${escapeHTML(taxonomyName("pack_types", pack.pack_type))} · Unscored</p><h1>${escapeHTML(pack.name)}</h1><p>${escapeHTML(pack.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Pack identity</h3><p><strong>Steward:</strong> ${escapeHTML(pack.steward)}</p>${labLinksMarkup("pack", pack)}<p><strong>Status:</strong> ${escapeHTML(label(pack.status))}</p><p><strong>Hosts:</strong> ${escapeHTML(packHosts(pack))}</p><p><strong>Install:</strong> ${escapeHTML(taxonomyName("pack_install_mechanisms", pack.install_mechanism))}</p><p><a href="${escapeHTML(pack.url)}" target="_blank" rel="noreferrer">Open official page ↗</a></p><p><a href="https://github.com/${escapeHTML(pack.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p></section>
      <section class="detail-block"><h3>What it installs</h3><p>${detailText(pack.installs)}</p>${pack.distribution_machinery ? `<p><strong>Distribution machinery:</strong> ${escapeHTML(pack.distribution_machinery)}</p>` : ""}</section>
      <section class="detail-block"><h3>Why it is not a scored system</h3><p>${detailText(pack.not_a_system)}</p><p class="unscored-note">Packs are recorded for what they install, never for what they do. A pack that owns state or does enforced work is a scored system instead (ADR 031, ADR 032).</p></section>
      <section class="detail-block"><h3>Packaging formats</h3>${formats.length ? `<p>${formats.map(item => `<button type="button" class="ghost-button" data-open-spec="${escapeHTML(item.id)}">${escapeHTML(item.short_name)}</button>`).join(" ")}</p>` : "<p>No packaging format recorded; the pack installs by script or clone.</p>"}</section>
      <section class="detail-block"><h3>Licenses and terms</h3><p>${detailText(pack.license_note)}</p>${(pack.license_evidence || []).map(specificationEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(pack.evidence || []).map(specificationEvidenceLink).join("") || "<p>—</p>"}</section>
      <section class="detail-block"><h3>Related records</h3>${relatedPacks.length || relatedSystems.length ? `<p>${[...relatedPacks.map(item => `<button type="button" class="ghost-button" data-open-pack="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`), ...relatedSystems.map(item => `<button type="button" class="ghost-button" data-open-project="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`)].join(" ")}</p>` : "<p>None recorded.</p>"}</section>
    </div>`;
}

function robotTermsLink(item) {
  return `<p><strong>${escapeHTML(taxonomyName("robot_terms_kinds", item.terms_kind))}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a></p>` + (item.unpinnable ? '<p class="unscored-note">This page changes between visits, so the Atlas cannot pin what it said.</p>' : "");
}

// An evidence entry a maker can change without notice (a live pricing or
// availability page, not a dated document) is marked unpinnable at review
// time. The reader sees the same source link everyone else gets, plus a note
// that the Atlas cannot pin what the page said when it was reviewed.
function robotEvidenceLink(item) {
  return specificationEvidenceLink(item) + (item.unpinnable ? '<p class="unscored-note">This page changes between visits, so the Atlas cannot pin what it said.</p>' : "");
}

// named_models, terms_evidence, not_verified, verified_at, terms_note,
// hardware, developer_access, and availability_note only arrive with detail;
// the boot record carries only id, name, short_name, manufacturer, url,
// description, form_factor, ai_basis, availability, and status. Asserting an
// absence — "the maker names no model", "no terms were published" — off a
// field that has simply not loaded yet would be a false claim, so each one
// renders the detailText em dash (lines ~31-37) until robotDetailLoaded is
// true, exactly as the other three record dialogs already do for their own
// detail-only fields.
function robotDialogMarkup(robot) {
  const relatedSystems = (robot.related_systems || []).map(id => state.projects.find(item => item.id === id)).filter(Boolean);
  const relatedRobots = (robot.related_robots || []).map(id => state.robots.find(item => item.id === id)).filter(Boolean);
  const hardware = robot.hardware || {};
  const detailLoaded = robotDetailLoaded(robot);
  const namedModelsMarkup = (robot.named_models || []).map(model => `<p><strong>${escapeHTML(model.name)}</strong> · ${escapeHTML(taxonomyName("robot_model_kinds", model.kind))} · <em>vendor-stated</em></p><p>${detailText(model.role_note)}</p>`).join("");
  const modelsSection = detailLoaded && !(robot.ai_basis || []).includes("vendor_named_model")
    ? "<p>The maker names no model for this robot.</p>"
    : namedModelsMarkup || "<p>—</p>";
  const notVerifiedMarkup = robot.not_verified ? `<p class="unscored-note">${escapeHTML(robot.not_verified)}</p>` : "";
  const termsMarkup = (robot.terms_evidence || []).map(robotTermsLink).join("");
  const termsSection = detailLoaded
    ? termsMarkup || "<p>No terms were published on the maker's pages at review time.</p>"
    : "<p>—</p>";
  const reviewedLine = robot.verified_at ? `<p>Reviewed ${escapeHTML(robot.verified_at)}.</p>` : "";
  return `<p class="eyebrow">Robot · ${escapeHTML(taxonomyName("robot_form_factors", robot.form_factor))} · Unscored</p><h1>${escapeHTML(robot.name)}</h1><p>${escapeHTML(robot.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>What it is</h3><p><strong>Maker:</strong> ${escapeHTML(robot.manufacturer)}</p><p><strong>Status:</strong> ${escapeHTML(label(robot.status))}</p>${robot.variants ? `<p><strong>Variants:</strong> ${escapeHTML(robot.variants)}</p>` : ""}<p><a href="${escapeHTML(robot.url)}" target="_blank" rel="noreferrer">Open official page ↗</a></p>${robot.repo ? `<p><a href="https://github.com/${escapeHTML(robot.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p>` : ""}</section>
      <section class="detail-block"><h3>Models the vendor names</h3>${modelsSection}${notVerifiedMarkup}</section>
      ${(robot.ai_basis || []).includes("open_model_interface") ? `<section class="detail-block"><h3>Running your own models</h3><p>${detailText(robot.developer_access || "")}</p></section>` : ""}
      <section class="detail-block"><h3>Hardware</h3><p><strong>Compute:</strong> ${detailText(hardware.compute || "—")}</p><p><strong>Sensors:</strong> ${detailText(hardware.sensors || "—")}</p><p><strong>Actuation:</strong> ${detailText(hardware.actuation || "—")}</p><p><strong>Power:</strong> ${detailText(hardware.power || "—")}</p></section>
      ${(robot.ai_basis || []).includes("open_model_interface") ? "" : `<section class="detail-block"><h3>Developer access</h3><p>${detailText(robot.developer_access || "—")}</p></section>`}
      <section class="detail-block"><h3>Availability</h3><p><strong>${escapeHTML(taxonomyName("robot_availability", robot.availability))}</strong></p><p>${detailText(robot.availability_note || "")}</p></section>
      <section class="detail-block"><h3>Terms</h3><p>${detailText(robot.terms_note || "")}</p>${termsSection}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(robot.evidence || []).map(robotEvidenceLink).join("") || "<p>—</p>"}${reviewedLine}</section>
      <section class="detail-block"><h3>Related records</h3>${relatedSystems.length || relatedRobots.length ? `<p>${[...relatedSystems.map(item => `<button type="button" class="ghost-button" data-open-project="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`), ...relatedRobots.map(item => `<button type="button" class="ghost-button" data-open-robot="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`)].join(" ")}</p>` : "<p>None recorded.</p>"}</section>
    </div>`;
}

// A trust record is unscored and human-owned. Each status says whether the operator
// publishes a statement about a property, never what the service does; the note
// carries every exception. Nothing rendered here enters a score. See ADR 029.
const TRUST_PROPERTY_LABELS = {
  response_integrity: "Response integrity",
  upstream_disclosure: "Upstream disclosure",
  credential_handling: "Credential handling",
  cache_isolation: "Cache isolation",
  vulnerability_disclosure: "Vulnerability disclosure",
  independent_audit: "Independent audit",
};
const TRUST_PROPERTY_ORDER = Object.keys(TRUST_PROPERTY_LABELS);

function trustStatusName(status) {
  return taxonomyName("trust_property_statuses", status);
}

function trustSourceLink(item, text) {
  return `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">${escapeHTML(text)} ↗</a>`;
}

function trustResponseMarkup(label, response, absent) {
  if (!response) return `<p><strong>${escapeHTML(label)}:</strong> ${escapeHTML(absent)}</p>`;
  return `<p><strong>${escapeHTML(label)}:</strong> ${escapeHTML(response.summary)} ${trustSourceLink(response, "source")} <span class="evidence-date">${escapeHTML(response.verified_at)}</span></p>`;
}

function trustFindingMarkup(finding) {
  const source = `<p>${trustSourceLink(finding.source, finding.source.label)} <span class="evidence-date">published ${escapeHTML(finding.published_at)} · read ${escapeHTML(finding.source.fetched_at)}</span></p>`;
  return `<li><p>${escapeHTML(finding.claim)}</p>${source}${trustResponseMarkup("Operator response", finding.operator_response, "none recorded.")}${finding.resolved ? trustResponseMarkup("Closed", finding.resolved, "") : "<p><strong>Open.</strong></p>"}</li>`;
}

function trustBlockMarkup(service) {
  const heading = "<h3>Trust record · unscored</h3>";
  // The dialog paints from boot data and repaints when the detail file lands;
  // until the detail file has loaded, whether trust is present or absent is
  // unknown, which must not read as "not examined".
  if (!inferenceDetailLoaded(service)) {
    return `<section class="detail-block" data-trust="pending">${heading}<p>—</p></section>`;
  }
  const trust = service.trust;
  if (!trust) {
    return `<section class="detail-block" data-trust="absent">${heading}<p>Not yet examined for trust properties.</p></section>`;
  }
  const rows = TRUST_PROPERTY_ORDER.map(name => {
    const item = trust.properties[name];
    return `<tr><td>${escapeHTML(TRUST_PROPERTY_LABELS[name])}</td><td>${escapeHTML(trustStatusName(item.status))}</td><td>${escapeHTML(item.note)} ${trustSourceLink(item, "source")} <span class="evidence-date">${escapeHTML(item.verified_at)}</span></td></tr>`;
  }).join("");
  const findings = trust.findings.length
    ? `<ul>${trust.findings.map(trustFindingMarkup).join("")}</ul>`
    : `<p>Reviewed on ${escapeHTML(trust.verified_at)}; no admissible third-party finding recorded. Absence of a finding is not evidence of safety.</p>`;
  const trustState = trust.findings.length ? "findings" : "reviewed";
  return `<section class="detail-block" data-trust="${trustState}">${heading}<table class="trust-table">${rows}</table><h4>Third-party findings</h4>${findings}<p class="unscored-note">Each status says whether the operator publishes a statement, never what the service does. Nothing here enters the score. Reviewed ${escapeHTML(trust.verified_at)}.</p></section>`;
}

function inferenceDialogMarkup(service) {
  const profile = state.taxonomy.inference_service_score_profile;
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${detailScore(service.score[dimension.id])}</td></tr>`).join("");
  return `<p class="eyebrow">${escapeHTML(taxonomyName("inference_service_types", service.service_type))} · ${escapeHTML(profile.name)} ${escapeHTML(service.score.overall)}</p><h1>${escapeHTML(service.name)}</h1><p>${escapeHTML(service.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Service identity</h3><p><strong>Operator:</strong> ${escapeHTML(service.operator)}</p>${labLinksMarkup("inference", service)}<p><strong>Type:</strong> ${escapeHTML(taxonomyName("inference_service_types", service.service_type))}</p><p><a href="${escapeHTML(service.url)}" target="_blank" rel="noreferrer">Open official service documentation ↗</a></p></section>
      <section class="detail-block"><h3>${escapeHTML(profile.name)}</h3><table class="score-table">${scoreRows}<tr><td><strong>Overall</strong></td><td>${escapeHTML(service.score.overall)}</td></tr></table><p class="unscored-note">Operational service score only. It excludes model quality, current price, and transient latency or throughput.</p></section>
      <section class="detail-block"><h3>Service boundary</h3><p>${detailText(service.service_boundary)}</p><p class="unscored-note">Companies, models, local runtimes, and system-family scores remain separate boundaries.</p></section>
      <section class="detail-block"><h3>Delivery and model sources</h3><p><strong>Delivery:</strong> ${escapeHTML(service.delivery_modes.map(item => taxonomyName("inference_delivery_modes", item)).join(" · "))}</p><p><strong>Model sources:</strong> ${escapeHTML(service.model_sources.map(item => taxonomyName("inference_model_sources", item)).join(" · "))}</p><p><strong>API styles:</strong> ${escapeHTML(service.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Regional controls</h3><p>${detailText(service.regional_controls)}</p></section>
      <section class="detail-block"><h3>Retention controls</h3><p>${detailText(service.retention_controls)}</p></section>
      <section class="detail-block"><h3>Routing and customization</h3><p><strong>Routing:</strong> ${detailText(service.routing)}</p><p><strong>Customization:</strong> ${detailText(service.customization)}</p></section>
      ${trustBlockMarkup(service)}
      <section class="detail-block"><h3>Strengths</h3>${detailList(service.strengths)}</section>
      <section class="detail-block"><h3>Tradeoffs</h3>${detailList(service.tradeoffs)}</section>
      <section class="detail-block"><h3>Governing terms</h3>${inferenceEvidenceLink(service.terms)}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(service.evidence || []).map(inferenceEvidenceLink).join("") || "<p>—</p>"}</section>
    </div>`;
}

function runtimeDialogMarkup(runtime) {
  const profile = state.taxonomy.local_runtime_score_profile;
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${detailScore(runtime.score[dimension.id])}</td></tr>`).join("");
  return `<p class="eyebrow">${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))} · ${escapeHTML(profile.name)} ${escapeHTML(runtime.score.overall)}</p><h1>${escapeHTML(runtime.name)}</h1><p>${escapeHTML(runtime.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Runtime identity</h3><p><strong>Maintainer:</strong> ${escapeHTML(runtime.maintainer)}</p>${labLinksMarkup("runtime", runtime)}<p><strong>Type:</strong> ${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))}</p>${runtime.repo ? `<p><strong>Repository:</strong> ${escapeHTML(runtime.repo)}</p>` : ""}<p><a href="${escapeHTML(runtime.url)}" target="_blank" rel="noreferrer">Open official documentation ↗</a></p></section>
      <section class="detail-block"><h3>${escapeHTML(profile.name)}</h3><table class="score-table">${scoreRows}<tr><td><strong>Overall</strong></td><td>${escapeHTML(runtime.score.overall)}</td></tr></table><p class="unscored-note">Documented execution capability only. It excludes model quality, throughput, latency, benchmark rank, and hardware cost.</p></section>
      <section class="detail-block"><h3>Runtime boundary</h3><p>${detailText(runtime.runtime_boundary)}</p><p class="unscored-note">Managed inference services, models, and system-family scores remain separate boundaries.</p></section>
      <section class="detail-block"><h3>Execution</h3><p><strong>Accelerators:</strong> ${escapeHTML(runtime.accelerators.map(item => taxonomyName("runtime_accelerators", item)).join(" · "))}</p><p><strong>Model formats:</strong> ${escapeHTML(runtime.model_formats.map(item => taxonomyName("runtime_model_formats", item)).join(" · "))}</p><p><strong>Serving:</strong> ${escapeHTML(runtime.serving_modes.map(item => taxonomyName("runtime_serving_modes", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Interfaces and deployment</h3><p><strong>API styles:</strong> ${escapeHTML(runtime.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</p><p><strong>Deployment:</strong> ${escapeHTML(runtime.deployment_surfaces.map(item => taxonomyName("runtime_deployment_surfaces", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Hardware requirements</h3><p>${detailText(runtime.hardware_requirements)}</p></section>
      <section class="detail-block"><h3>Model management</h3><p>${detailText(runtime.model_management)}</p></section>
      <section class="detail-block"><h3>Operational controls</h3><p>${detailText(runtime.operational_controls)}</p></section>
      <section class="detail-block"><h3>Strengths</h3>${detailList(runtime.strengths)}</section>
      <section class="detail-block"><h3>Tradeoffs</h3>${detailList(runtime.tradeoffs)}</section>
      <section class="detail-block"><h3>Licensing</h3><p><strong>Source model:</strong> ${escapeHTML(sourceModelName(runtime.source_model))}</p><p>${detailText(runtime.license_note)}</p>${(runtime.license_evidence || []).map(runtimeLicenseEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(runtime.evidence || []).map(inferenceEvidenceLink).join("") || "<p>—</p>"}</section>
    </div>`;
}

// The reviewed license evidence is read in one place — the system dialog —
// so it is fetched the first time a record is opened rather than at boot. A
// failed fetch clears the request so the next open retries; until it lands the
// dialog shows the license ids the record already carries.
let licenseEvidenceRequest = null;

function ensureLicenseEvidence() {
  if (state.licenses.size) return null;
  if (!licenseEvidenceRequest) {
    licenseEvidenceRequest = loadJSON("license-evidence.json")
      .then(evidence => { state.licenses = new Map(evidence.entries.map(item => [item.project_id, item])); })
      .catch(() => { licenseEvidenceRequest = null; });
  }
  return licenseEvidenceRequest;
}

// A record's detail is merged into the boot record in place, so every existing
// reference to it — the dialog, the comparison table, the finder shortlist —
// sees the full record afterwards without being handed a new object. A failed
// fetch clears the request so the next reader retries.
const loadedDetail = new Set();
// The trust dialog block and the trust comparison cell both need to tell
// "detail hasn't loaded yet" apart from "reviewed, and trust is absent" —
// this is the one predicate for that, keyed the same way loadDetail keys
// loadedDetail. Safe to reference from functions defined earlier in this
// file: none of them run until the whole script has finished loading.
const inferenceDetailLoaded = service => loadedDetail.has(`inference:${service.id}`);
// robotDialogMarkup's own version of the same predicate, keyed the way
// loadDetail keys loadedDetail for a robot: `robot:<id>`.
const robotDetailLoaded = robot => loadedDetail.has(`robot:${robot.id}`);
const detailRequests = new Map();
let modelSourceDetails = null;
let modelSourceDetailsRequest = null;

function loadModelSourceDetail(record) {
  const key = `model:${record.id}`;
  if (loadedDetail.has(key)) return null;
  if (modelSourceDetails) {
    Object.assign(record, modelSourceDetails[record.id]);
    loadedDetail.add(key);
    return Promise.resolve();
  }
  if (!modelSourceDetailsRequest) {
    modelSourceDetailsRequest = loadJSON("app/model-source-details.json")
      .then(details => { modelSourceDetails = details; return details; })
      .catch(() => { modelSourceDetailsRequest = null; return null; });
  }
  return modelSourceDetailsRequest.then(details => {
    if (!details?.[record.id]) return;
    Object.assign(record, details[record.id]);
    loadedDetail.add(key);
  });
}

function loadDetail(kind, record) {
  if (kind === "model" && !isReviewedModel(record)) return loadModelSourceDetail(record);
  const key = `${kind}:${record.id}`;
  if (loadedDetail.has(key)) return null;
  if (!detailRequests.has(key)) {
    detailRequests.set(key, loadJSON(`app/detail/${kind}/${record.id}.json`)
      .then(detail => { Object.assign(record, detail); loadedDetail.add(key); })
      .catch(() => { detailRequests.delete(key); }));
  }
  return detailRequests.get(key);
}

// A collection's search index is the editorial prose its filter matches on,
// keyed by record id. It is worth a fetch only once someone means to search,
// and every filter falls back to the boot record until it lands. Only a JSON
// object is stored, so an index is loaded exactly when its entry is truthy.
const searchIndexes = {};
const searchIndexRequests = {};
// Indexes whose last fetch failed. An empty result counts one as settled, so
// it never waits on it or asks for it again; a focused search box still does.
const searchIndexFailed = new Set();

// A body that is not a JSON object, such as null, is a failed load too.
// Stored, it would stay falsy, so an empty result would wait on it for ever,
// re-arming its own repaint in a loop the page never leaves.
function loadSearchIndex(collection) {
  if (searchIndexes[collection]) return null;
  if (!searchIndexRequests[collection]) {
    searchIndexRequests[collection] = loadJSON(`app/search/${collection}.json`)
      .then(index => {
        if (!index || typeof index !== "object" || Array.isArray(index)) throw new Error(`app/search/${collection}.json is not an index`);
        searchIndexes[collection] = index;
        searchIndexFailed.delete(collection);
      })
      .catch(() => { delete searchIndexRequests[collection]; searchIndexFailed.add(collection); });
  }
  return searchIndexRequests[collection];
}

const reportedCapability = value => value == null ? "Not reported" : value ? "Yes" : "No";
const reportedTokenLimit = value => value == null ? "Not reported" : Intl.NumberFormat("en").format(value);

function modelSourceLinks(metadata, noLinksText) {
  return [...(metadata.links || []), ...(metadata.weights || [])].map(item =>
    `<p><strong>${escapeHTML(item.label || "Source")}</strong>: <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">open source ↗</a></p>`
  ).join("") || `<p>${escapeHTML(noLinksText)}</p>`;
}

function importedModelDialogMarkup(model) {
  const metadata = model.source_metadata;
  const capabilities = metadata.capabilities || {};
  const limits = metadata.limits || {};
  return `<p class="eyebrow">models.dev source record · Not Atlas reviewed</p><h1>${escapeHTML(model.name)}</h1><p>${escapeHTML(model.description || "Loading the models.dev source description…")}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Source identity</h3><p><strong>models.dev namespace:</strong> ${escapeHTML(model.developer)}</p>${labLinksMarkup("model", model)}<p><strong>models.dev ID:</strong> ${escapeHTML(model.source_id)}</p><p><a href="${escapeHTML(model.source_url)}" target="_blank" rel="noreferrer">Open commit-pinned source record ↗</a></p></section>
      <section class="detail-block"><h3>Review status</h3><p>This is attributed metadata imported directly from models.dev. Atlas has not reviewed its identity boundary, licensing, distribution, evidence, or access score.</p><p class="unscored-note">Reported license and open-weight fields are source claims, not Atlas conclusions.</p></section>
      <section class="detail-block"><h3>Modalities and limits</h3><p><strong>Input:</strong> ${escapeHTML(metadata.modalities.input.map(item => taxonomyName("model_modalities", item)).join(" · "))}</p><p><strong>Output:</strong> ${escapeHTML(metadata.modalities.output.map(item => taxonomyName("model_modalities", item)).join(" · "))}</p><p><strong>Context:</strong> ${escapeHTML(reportedTokenLimit(limits.context))}</p><p><strong>Input limit:</strong> ${escapeHTML(reportedTokenLimit(limits.input))}</p><p><strong>Output limit:</strong> ${escapeHTML(reportedTokenLimit(limits.output))}</p></section>
      <section class="detail-block"><h3>Reported capabilities</h3>${Object.entries(capabilities).map(([name, value]) => `<p><strong>${escapeHTML(label(name))}:</strong> ${escapeHTML(reportedCapability(value))}</p>`).join("") || "<p>Loading source details…</p>"}<p class="unscored-note">These values are imported discovery metadata, not an Atlas capability test.</p></section>
      <section class="detail-block"><h3>Release metadata</h3><p><strong>Family:</strong> ${escapeHTML(metadata.family || "Not reported")}</p><p><strong>Released:</strong> ${escapeHTML(metadata.release_date || "Not reported")}</p><p><strong>Last updated:</strong> ${escapeHTML(metadata.last_updated || "Not reported")}</p><p><strong>Knowledge cutoff:</strong> ${escapeHTML(metadata.knowledge_cutoff || "Not reported")}</p><p><strong>Open weights reported:</strong> ${escapeHTML(reportedCapability(metadata.reported_open_weights))}</p><p><strong>License reported:</strong> ${escapeHTML(metadata.reported_license || "Not reported")}</p></section>
      <section class="detail-block"><h3>Source links from models.dev</h3>${modelSourceLinks(metadata, "No source links reported by models.dev.")}</section>
    </div>`;
}

// Like the other four record dialogs, this paints from the boot record the
// moment it opens and repaints when app/detail/model/<id>.json lands. Only
// the imported models.dev block, the identity fields and the overall score
// are on the boot record; the reviewed prose, the licence note and evidence,
// the official model page link and every score dimension come from detail,
// so each of those goes through detailText, detailList or detailScore.
function modelDialogMarkup(model) {
  if (!isReviewedModel(model)) return importedModelDialogMarkup(model);
  const profile = state.taxonomy.model_score_profile;
  const metadata = model.source_metadata;
  const attribution = AppCore.modelMetadataAttribution(model);
  const openWeightsLabel = attribution.listed ? "Open weights reported" : "Open weights";
  const licenseLabel = attribution.listed ? "License reported" : "License named by the developer";
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${detailScore(model.score[dimension.id])}</td></tr>`).join("");
  return `<p class="eyebrow">${escapeHTML(taxonomyName("model_types", model.model_type))} · ${escapeHTML(profile.name)} ${escapeHTML(model.score.overall)}</p><h1>${escapeHTML(model.name)}</h1><p>${escapeHTML(model.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Model identity</h3><p><strong>Developer:</strong> ${escapeHTML(model.developer)}</p>${labLinksMarkup("model", model)}<p>${attribution.listed ? `<strong>models.dev ID:</strong> ${escapeHTML(model.source_id)}` : escapeHTML(AppCore.UNLISTED_MODEL_LABEL)}</p><p><strong>Distribution:</strong> ${escapeHTML(model.distribution_modes.map(item => taxonomyName("model_distribution_modes", item)).join(" · "))}</p><p>${model.url ? `<a href="${escapeHTML(model.url)}" target="_blank" rel="noreferrer">Open official model page ↗</a>` : "—"}</p></section>
      <section class="detail-block"><h3>${escapeHTML(profile.name)}</h3><table class="score-table">${scoreRows}<tr><td><strong>Overall</strong></td><td>${escapeHTML(model.score.overall)}</td></tr></table><p class="unscored-note">Access and deployability only. This score excludes output quality, benchmark rank, parameter count, price, latency, and throughput.</p></section>
      <section class="detail-block"><h3>Model boundary</h3><p>${detailText(model.access_boundary)}</p><p class="unscored-note">Hosted endpoints, inference services, runtimes, repackagings, fine-tunes, and applications remain separate boundaries.</p></section>
      <section class="detail-block"><h3>Modalities and limits</h3><p><strong>Input:</strong> ${escapeHTML(metadata.modalities.input.map(item => taxonomyName("model_modalities", item)).join(" · "))}</p><p><strong>Output:</strong> ${escapeHTML(metadata.modalities.output.map(item => taxonomyName("model_modalities", item)).join(" · "))}</p><p><strong>Context:</strong> ${escapeHTML(reportedTokenLimit(metadata.limits.context))}</p><p><strong>Input limit:</strong> ${escapeHTML(reportedTokenLimit(metadata.limits.input))}</p><p><strong>Output limit:</strong> ${escapeHTML(reportedTokenLimit(metadata.limits.output))}</p></section>
      <section class="detail-block"><h3>Reported capabilities</h3>${Object.entries(metadata.capabilities).map(([name, value]) => `<p><strong>${escapeHTML(label(name))}:</strong> ${escapeHTML(reportedCapability(value))}</p>`).join("")}<p class="unscored-note">${escapeHTML(attribution.capabilityNote)}</p></section>
      <section class="detail-block"><h3>Release metadata</h3><p><strong>Family:</strong> ${escapeHTML(metadata.family || "Not reported")}</p><p><strong>Released:</strong> ${escapeHTML(metadata.release_date || "Not reported")}</p><p><strong>Last updated:</strong> ${escapeHTML(metadata.last_updated || "Not reported")}</p><p><strong>Knowledge cutoff:</strong> ${escapeHTML(metadata.knowledge_cutoff || "Not reported")}</p><p><strong>${escapeHTML(openWeightsLabel)}:</strong> ${escapeHTML(reportedCapability(metadata.reported_open_weights))}</p><p><strong>${escapeHTML(licenseLabel)}:</strong> ${escapeHTML(metadata.reported_license || "Not reported")}</p></section>
      <section class="detail-block"><h3>Licenses and terms</h3><p><strong>Source model:</strong> ${escapeHTML(sourceModelName(model.source_model))}</p><p>${detailText(model.license_note)}</p>${(model.license_evidence || []).map(runtimeLicenseEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>${escapeHTML(attribution.linksHeading)}</h3>${modelSourceLinks(metadata, attribution.noLinksText)}</section>
      <section class="detail-block"><h3>Strengths</h3>${detailList(model.strengths)}</section>
      <section class="detail-block"><h3>Tradeoffs</h3>${detailList(model.tradeoffs)}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(model.evidence || []).map(inferenceEvidenceLink).join("") || "<p>—</p>"}</section>
    </div>`;
}

// How many of a lab's reviewed releases its dialog lists before handing off to
// the Models view's Lab facet for the rest.
const LAB_RECENT_RELEASES = 8;

function labRecordButtons(records, attribute) {
  return records.map(item => `<button type="button" class="ghost-button" ${attribute}="${escapeHTML(item.id)}">${escapeHTML(item.short_name || item.name)}</button>`).join(" ");
}

function labChannelMarkup(channel) {
  const shown = channel.url.replace(/^https:\/\//, "").replace(/\/$/, "");
  return `<p><strong>${escapeHTML(taxonomyName("lab_channel_kinds", channel.kind))}:</strong> <a class="lab-channel-link" href="${escapeHTML(channel.url)}" target="_blank" rel="noreferrer">${escapeHTML(shown)} ↗</a></p>`;
}

// The framework field says only that the lab publishes one. Until the detail
// file lands, presence is unknown, which must not read as "none found".
function labSafetyFrameworkMarkup(lab) {
  if (!loadedDetail.has(`lab:${lab.id}`)) return "<p>—</p>";
  const framework = lab.safety_framework;
  if (!framework) {
    return '<p>None found on the lab\'s own pages.</p><p class="unscored-note">Absence here is not a finding that the lab has no framework.</p>';
  }
  return `<p><a href="${escapeHTML(framework.url)}" target="_blank" rel="noreferrer">${escapeHTML(framework.title)} ↗</a> <span class="evidence-date">read ${escapeHTML(framework.verified_at)}</span></p><p class="unscored-note">Recorded because the lab publishes it. The Atlas does not assess whether or how it is followed.</p>`;
}

// Like the other record dialogs, this paints from the boot record and repaints
// when app/detail/lab/<id>.json lands with the note, channels, framework, and
// sources. Every joined list is computed from records the page already holds.
function labDialogMarkup(lab) {
  const relations = labRelationsFor(lab);
  const releases = AppCore.releasesNewestFirst(relations.models);
  const modes = AppCore.labDistributionModes(relations.models, labDistributionOrder());
  const modeCounts = modes.map(mode => `${escapeHTML(taxonomyName("model_distribution_modes", mode))}: ${relations.models.filter(model => (model.distribution_modes || []).includes(mode)).length}`).join(" · ");
  const recent = releases.slice(0, LAB_RECENT_RELEASES).map(model => `<li><button type="button" class="link-button" data-open-model="${escapeHTML(model.id)}">${escapeHTML(model.name)}</button><span class="evidence-date">${escapeHTML(AppCore.releaseDate(model) || "release date not reported")}</span></li>`).join("");
  const total = relations.models.length + relations.sourceRows.length;
  const pending = relations.sourceRows.length
    ? `<p>models.dev also lists ${relations.sourceRows.length} ${relations.sourceRows.length === 1 ? "release" : "releases"} under ${escapeHTML(relations.namespaces.join(", "))} that the Atlas has not reviewed.</p>`
    : "";
  const others = [
    ["Local runtimes it maintains", relations.runtimes, "data-open-runtime"],
    ["Specifications it stewards", relations.specifications, "data-open-spec"],
    ["Agent packs it publishes", relations.packs, "data-open-pack"],
  ].filter(([, records]) => records.length).map(([title, records, attribute]) =>
    `<section class="detail-block"><h3>${title}</h3><p>${labRecordButtons(records, attribute)}</p></section>`).join("");
  // A lab admitted on a published frontier commitment has nothing to join, and
  // an empty heading over an empty list would read as a gap in the catalog
  // rather than as the state the record is in (ADR 044).
  const announced = lab.admission_basis === "frontier_announcement";
  const releaseBlock = announced
    ? `<section class="detail-block"><h3>Reviewed model releases · 0</h3><p>None reviewed. The Atlas has reviewed no release this organization developed, which is why it is recorded on its own published statement of intent rather than on a release. Nothing here is a claim that it has released nothing.</p></section>`
    : `<section class="detail-block"><h3>Reviewed model releases · ${relations.models.length}</h3><p>${modeCounts}</p><ul class="lab-release-list">${recent}</ul>${pending}<p><button type="button" class="ghost-button" data-browse-lab-models="${escapeHTML(lab.id)}">Browse all ${total} in Models →</button></p></section>`;
  return `<p class="eyebrow">Lab · ${escapeHTML(taxonomyName("lab_types", lab.lab_type))} · Unscored</p><h1>${escapeHTML(lab.name)}</h1><p>${escapeHTML(lab.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Organization</h3><p><strong>Type:</strong> ${escapeHTML(taxonomyName("lab_types", lab.lab_type))}</p><p><strong>Headquarters:</strong> ${escapeHTML(taxonomyName("countries", lab.headquarters))}</p>${lab.parent_organization ? `<p><strong>Parent organization:</strong> ${escapeHTML(lab.parent_organization)}</p>` : ""}<p><strong>Recorded because:</strong> ${escapeHTML(taxonomyName("lab_admission_bases", lab.admission_basis))}</p>${lab.catalog_names.length ? `<p><strong>Named in the catalog as:</strong> ${escapeHTML(lab.catalog_names.join(" · "))}</p>` : ""}<p><a href="${escapeHTML(lab.url)}" target="_blank" rel="noreferrer">Open official site ↗</a></p></section>
      <section class="detail-block"><h3>How it is organized</h3><p>${detailText(lab.organization_note)}</p></section>
      ${releaseBlock}
      <section class="detail-block"><h3>Systems it builds</h3>${relations.systems.length ? `<p>${labRecordButtons(relations.systems, "data-open-project")}</p>` : "<p>None recorded in the catalog.</p>"}</section>
      <section class="detail-block"><h3>Inference services it operates</h3>${relations.services.length ? `<p>${labRecordButtons(relations.services, "data-open-inference")}</p>` : "<p>None recorded in the catalog.</p>"}</section>
      ${others}
      <section class="detail-block"><h3>Where it publishes</h3>${(lab.channels || []).map(labChannelMarkup).join("") || "<p>—</p>"}</section>
      <section class="detail-block"><h3>Safety framework</h3>${labSafetyFrameworkMarkup(lab)}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(lab.evidence || []).map(inferenceEvidenceLink).join("") || "<p>—</p>"}<p class="unscored-note">Labs are recorded, never scored or ranked. Every count here is joined from the catalog's own reviewed records.</p></section>
    </div>`;
}

// A lab dialog opens the records it lists over the current view, and hands its
// full release list to the Models view's Lab facet.
function bindLabDialogLinks() {
  const root = $("#lab-dialog-content");
  for (const [attribute, open] of [
    ["data-open-model", openModel], ["data-open-project", openProject],
    ["data-open-inference", openInferenceService], ["data-open-runtime", openLocalRuntime],
    ["data-open-spec", openSpecification], ["data-open-pack", openPack],
  ]) {
    $$(`[${attribute}]`, root).forEach(button => button.addEventListener("click", () => {
      $("#lab-dialog").close();
      open(button.getAttribute(attribute));
    }));
  }
  $$("[data-browse-lab-models]", root).forEach(button => button.addEventListener("click", () => browseLabModels(button.dataset.browseLabModels)));
}

// The grid continues the dialog's newest-first release list rather than
// switching to the access-score order.
function browseLabModels(labId) {
  $("#lab-dialog").close();
  $("#model-lab-filter").value = labId;
  $("#model-sort-filter").value = "release";
  state.page.models = 1;
  renderModels();
  setDirectoryCollection("models", { updateURL: false });
  activateView("directory");
}

const RECORD_DIALOGS = {
  system: {
    dialog: "#project-dialog",
    content: "#dialog-content",
    find: id => state.projects.find(item => item.id === id),
    markup: systemDialogMarkup,
    hydrate: ensureLicenseEvidence,
    afterRender: () => $$('[data-successor]', $("#dialog-content")).forEach(button =>
      button.addEventListener("click", () => openProject(button.dataset.successor))),
  },
  spec: {
    dialog: "#specification-dialog",
    content: "#specification-dialog-content",
    find: id => state.specifications.find(item => item.id === id),
    markup: specificationDialogMarkup,
  },
  inference: {
    dialog: "#inference-dialog",
    content: "#inference-dialog-content",
    find: id => state.inferenceServices.find(item => item.id === id),
    markup: inferenceDialogMarkup,
  },
  runtime: {
    dialog: "#runtime-dialog",
    content: "#runtime-dialog-content",
    find: id => state.localRuntimes.find(item => item.id === id),
    markup: runtimeDialogMarkup,
  },
  pack: {
    dialog: "#pack-dialog",
    content: "#pack-dialog-content",
    find: id => state.packs.find(item => item.id === id),
    markup: packDialogMarkup,
    afterRender: () => {
      $$('[data-open-spec]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#pack-dialog").close(); openSpecification(button.dataset.openSpec); setDirectoryCollection("specifications", { updateURL: false }); activateView("directory"); }));
      $$('[data-open-pack]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => openPack(button.dataset.openPack)));
      $$('[data-open-project]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#pack-dialog").close(); openProject(button.dataset.openProject); }));
    },
  },
  model: {
    dialog: "#model-dialog",
    content: "#model-dialog-content",
    find: id => state.models.find(item => item.id === id),
    markup: modelDialogMarkup,
  },
  lab: {
    dialog: "#lab-dialog",
    content: "#lab-dialog-content",
    find: id => state.labs.find(item => item.id === id),
    markup: labDialogMarkup,
    afterRender: bindLabDialogLinks,
  },
  robot: {
    dialog: "#robot-dialog",
    content: "#robot-dialog-content",
    find: id => state.robots.find(item => item.id === id),
    markup: robotDialogMarkup,
    afterRender: () => {
      $$('[data-open-robot]', $("#robot-dialog-content")).forEach(button => button.addEventListener("click", () => openRobot(button.dataset.openRobot)));
      $$('[data-open-project]', $("#robot-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#robot-dialog").close(); openProject(button.dataset.openProject); }));
    },
  },
};

function paintRecordDialog(dialog, record) {
  const content = $(dialog.content);
  content.innerHTML = dialog.markup(record);
  if (!record.review_status || isReviewedModel(record)) {
    content.querySelector(".detail-grid").insertAdjacentHTML("beforebegin", RECORD_LINK_MARKUP);
  }
  dialog.afterRender?.();
}

function openRecordDialog(kind, id) {
  const dialog = RECORD_DIALOGS[kind];
  const record = dialog.find(id);
  if (!record) return false;
  paintRecordDialog(dialog, record);
  showRecordDialog(dialog.dialog, kind, id);
  // A dialog that needs a lazily fetched file paints immediately from the
  // record and repaints when the file lands — unless the reader has moved on
  // to a different record by then. The RECORD_DIALOGS key is also the record's
  // detail directory, so one kind names both.
  const repaint = () => {
    const element = $(dialog.dialog);
    if (element.dataset.recordKind === kind && element.dataset.recordId === id) paintRecordDialog(dialog, record);
  };
  dialog.hydrate?.()?.then(repaint);
  loadDetail(kind, record)?.then(repaint);
  return true;
}

// Kept as declarations: they are referenced before this point in the file and
// openProject recurses through the superseded-by link in its own markup.
function openProject(id) { return openRecordDialog("system", id); }
function openSpecification(id) { return openRecordDialog("spec", id); }
function openInferenceService(id) { return openRecordDialog("inference", id); }
function openLocalRuntime(id) { return openRecordDialog("runtime", id); }
function openPack(id) { return openRecordDialog("pack", id); }
function openModel(id) { return openRecordDialog("model", id); }
function openLab(id) { return openRecordDialog("lab", id); }
function openRobot(id) { return openRecordDialog("robot", id); }

function specificationEvidenceLink(item) {
  if (item.kind === "git_blob") {
    return `<p><strong>${escapeHTML(item.label || item.license_id)}:</strong> ${item.scope ? `${escapeHTML(item.scope)} · ` : ""}<a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable evidence ↗</a> · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">source path ↗</a></p>`;
  }
  return `<p><strong>${escapeHTML(item.label || item.license_id)}:</strong> ${item.scope ? `${escapeHTML(item.scope)} · ` : ""}<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a></p>`;
}

function inferenceEvidenceLink(item) {
  return `<p><strong>${escapeHTML(item.label)}:</strong> <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a> <span class="evidence-date">${escapeHTML(item.verified_at)}</span></p>`;
}

function runtimeLicenseEvidenceLink(item) {
  const source = item.kind === "git_blob"
    ? `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">${escapeHTML(item.path)} ↗</a> · <a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable blob ↗</a>`
    : `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed terms ↗</a> <span class="evidence-date">${escapeHTML(item.verified_at)}</span>`;
  return `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} — ${source}</p>`;
}

// A record dialog is the shareable unit of the site: opening one writes a
// `record=kind:id` URL, so the address bar always links to what is on screen.
// Dispatch is static, as with comparisons, because the kind comes from the URL.
const RECORD_DIALOG_SELECTORS = [
  "#project-dialog", "#specification-dialog", "#inference-dialog", "#runtime-dialog", "#pack-dialog", "#model-dialog", "#lab-dialog", "#robot-dialog",
];
const RECORD_LINK_MARKUP = '<p class="record-link"><button type="button" class="ghost-button" data-copy-record-link>Copy link</button><span class="record-link-status" data-record-link-status aria-live="polite">Copy link shares a preview page for this record.</span></p>';

function openRecord(kind, id) {
  if (kind === "system") return openProject(id);
  if (kind === "spec") return openSpecification(id);
  if (kind === "inference") return openInferenceService(id);
  if (kind === "runtime") return openLocalRuntime(id);
  if (kind === "pack") return openPack(id);
  if (kind === "model") return openModel(id);
  if (kind === "lab") return openLab(id);
  if (kind === "robot") return openRobot(id);
  return false;
}

// The dialog opens before its URL is written, so the record is on screen
// whatever the browser makes of the history write that follows.
function showRecordDialog(selector, kind, id) {
  const dialog = $(selector);
  dialog.dataset.recordKind = kind;
  dialog.dataset.recordId = id;
  if (!dialog.open) dialog.showModal();
  writeRecordURL(kind, id);
}

function writeRecordURL(kind, id) {
  const url = new URL(window.location.href);
  const reference = `${kind}:${id}`;
  if (url.searchParams.get("record") === reference) return;
  url.searchParams.set("record", reference);
  writeURL(url, { push: true });
}

function clearRecordURL() {
  // A dialog's close event is queued, not synchronous, so a handler that
  // closes one dialog and opens another (e.g. a pack's packaging-format or
  // related-record buttons) writes the new record's URL before this fires.
  // `.open` still flips to false synchronously on close, so checking it here
  // tells a genuine close (nothing open) from that close-then-open sequence
  // (a different dialog now open) without touching the handlers themselves.
  if (RECORD_DIALOG_SELECTORS.some(selector => $(selector).open)) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("record")) return;
  url.searchParams.delete("record");
  writeURL(url);
}

function closeRecordDialogs() {
  RECORD_DIALOG_SELECTORS.forEach(selector => { if ($(selector).open) $(selector).close(); });
}

// Resets one scope's controls to the defaults its URL parameters assume, so
// a URL that leaves a parameter out also clears it from the control (Phase 0
// leftover: Back after closing a record showed older filters than the URL).
// The sort remembered across a query goes too: it belonged to the state the
// URL is replacing. A Finder role set has no URL key yet, so it stays when
// the URL keeps the Systems family it was applied to and names no role of
// its own (ruling R18): a Back that changes nothing there must not widen
// the list the Finder chose. Restoring another collection leaves it alone,
// as a strip switch does.
function resetScopeControls(scope, params) {
  const keepFinderRoles = (params.get("family") || "") === $("#family-filter").value && !params.get("role");
  for (const [key, selector] of Object.entries(SCOPE_CONTROLS[scope] || {})) {
    const control = $(selector);
    const fallback = AppCore.SCOPE_URL_PARAMS[scope][key] ?? "";
    if (control.type === "checkbox") control.checked = fallback === "1";
    else control.value = fallback;
  }
  state.page[scope] = 1;
  delete sortBeforeQuery[scope];
  sortChosenDuringQuery[scope] = false;
  if (scope === "systems" && !keepFinderRoles) {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
  }
  if (scope === "systems") populateRoleFilter();
  // With the query empty this disables Best match again, so the URL's sort is
  // judged as boot judges it: "match" is never a sort the reader chose.
  syncMatchSort(scope);
}

// One restore for boot and for every popstate. The URL decides, in order:
// the view; the scope, where a comparison or a record names its collection
// before `collection` does (scopeFromURL); that scope's controls, reset
// first; the comparison; the front door or results; the record. The scope
// writer is quiet until the end, so a half-restored state never reaches the
// address bar, and nothing here pushes.
function restoreFromURL({ boot = false } = {}) {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const rawView = params.get("view");
  let view = rawView === null ? "directory" : AppCore.parseViewId(rawView);
  if (!view) {
    // A legacy sibling-view URL lands on its unified collection; any other
    // unknown view is dropped.
    const alias = AppCore.parseViewAlias(rawView);
    params.delete("view");
    if (alias) params.set("collection", alias);
    writeURL(url);
    view = "directory";
  }
  const scope = AppCore.scopeFromURL(params);
  state.urlReady = false;
  let restored = {};
  if (scope) {
    resetScopeControls(scope, params);
    restored = restoreScopeFromURL(scope);
  }
  const comparisonRestored = restoreComparisonFromURL();
  if (!comparisonRestored && state.comparison.ids.length) clearComparison({ updateURL: false });
  const onDoor = view === "directory" && AppCore.directoryStageFromURL(params) === "door";
  if (onDoor) showFrontDoor({ updateURL: false });
  else if (scope && !comparisonRestored) setDirectoryCollection(scope, { updateURL: false });
  activateView(view);
  // Beside a query, the URL names every sort but Best match (scopeURLParams,
  // rulings R-P1-2 and R-P1-2b). So a link with a query and no sort lists by
  // match, and a sort it names is one the reader chose, which typing keeps.
  // A sort the scope cannot take was removed on restore, so it counts as none.
  if (scope && restored.q?.trim()) {
    if (restored.sort !== undefined) sortChosenDuringQuery[scope] = true;
    syncMatchSort(scope);
  }
  // The record is read from the URL as it arrived; an open dialog names it
  // already, so showRecordDialog writes nothing and nothing pushes.
  const reference = AppCore.parseRecordReference(params.get("record"));
  if (!reference || !openRecord(reference.kind, reference.id)) {
    closeRecordDialogs();
    // A record the page cannot show leaves the URL, as any value a control
    // cannot take does.
    const current = new URL(window.location.href);
    current.searchParams.delete("record");
    writeURL(current);
  }
  state.urlReady = true;
  if (onDoor) selectElement(params.get("element"), params.get("elementRecord"));
  writeDirectoryURL();
  writeScopeURL();
  if (restored.q) loadRestoredSearch(scope, restored.page);
  // A shared comparison link opens its table; Back to a comparison restores
  // only the selection. It opens last, since its loading notice lives in the
  // tray, which the view switch above repaints.
  if (boot && comparisonRestored) openComparison();
  settledSearch = window.location.search;
}

// The share link is the record's static preview page, which carries its own
// title, description, and card metadata; the address bar stays on the app URL.
async function copyRecordLink(button) {
  const status = button.parentElement.querySelector("[data-record-link-status]");
  const dialog = button.closest("dialog");
  const url = new URL(AppCore.shareRecordPath(dialog.dataset.recordKind, dialog.dataset.recordId), window.location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = "Share link copied.";
  } catch {
    status.textContent = `Share link: ${url}`;
  }
}

// A score cell reads "8 / 10", or nothing at all when that dimension has not
// arrived: returning null hands the cell to comparisonTable's own "—" fallback,
// which a template literal would have stringified into "undefined / 10".
const scoreCell = value => value == null ? null : `${value} / 10`;
// The same for a list a detail file carries: absent and empty both become "—",
// so a degraded table reads consistently rather than mixing blanks and dashes.
const listCell = values => (values || []).join(" • ") || null;

function trustComparisonCell(service, name) {
  // Detail not loaded yet (or never arrived) is unknown, not "not examined" —
  // comparisonCell renders null as "—" so a failed fetch reads as missing data
  // rather than a false claim that the service was reviewed and found clean.
  if (!inferenceDetailLoaded(service)) return null;
  const item = service.trust?.properties?.[name];
  if (!item) return "not examined";
  return { text: trustStatusName(item.status), title: `${item.note} (${item.verified_at})` };
}

// A cell is a string, null (rendered "—"), or { text, title }: the trust rows put
// the status word in the cell and the reviewer's note in the title, so a table of
// six one-word statuses still carries every exception on hover.
const comparisonCell = value => {
  if (value && typeof value === "object") {
    return `<td title="${escapeHTML(value.title)}">${escapeHTML(value.text)}</td>`;
  }
  return `<td>${escapeHTML(value ?? "—")}</td>`;
};

function comparisonTable(records, rows) {
  return `<div class="comparison-table-wrap"><table class="comparison-table">
    <thead><tr><th scope="col">Decision factor</th>${records.map(record => `<th scope="col"><strong>${escapeHTML(record.name)}</strong></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([name, values]) => `<tr><th scope="row">${escapeHTML(name)}</th>${values.map(comparisonCell).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

// Every row below a comparison's overall score reads a detail field, and a
// half-filled table is worse than a moment's wait, so a comparison opens whole.
// A selection is waited on at most once, tracked here: a detail file that never
// arrives then costs one beat and a table built from what landed. Without that,
// loadDetail's catch — which clears its request so the next reader retries —
// would turn the re-entry below into an unbounded fetch loop.
const comparisonDetailAwaited = new Set();

// Because the comparison opens whole, pressing Compare can be followed by
// nothing at all on a slow connection — the dialog is waiting on the fetch
// above. The tray's own polite live region says so, and stops saying it the
// moment the wait ends; it is cleared only while it still carries this line,
// so a "four is the maximum" written meanwhile survives.
const COMPARISON_PENDING = "Loading the full details for this comparison.";
const showComparisonPending = () => { const status = $("#comparison-status"); if (status) status.textContent = COMPARISON_PENDING; };
const clearComparisonPending = () => {
  const status = $("#comparison-status");
  if (status && status.textContent === COMPARISON_PENDING) status.textContent = "";
};

function openComparison() {
  const records = comparisonRecords();
  if (records.length < 2) return;
  const selection = `${state.comparison.kind}:${state.comparison.ids.join(",")}`;
  if (!comparisonDetailAwaited.has(selection)) {
    // The selection is capped at four, so this is at most four small fetches.
    const pending = records.map(record => loadDetail(state.comparison.kind, record)).filter(Boolean);
    if (pending.length) {
      showComparisonPending();
      Promise.all(pending).then(() => {
        comparisonDetailAwaited.add(selection);
        clearComparisonPending();
        if (comparisonRecords().length === records.length) openComparison();
      });
      return;
    }
    comparisonDetailAwaited.add(selection);
  }
  clearComparisonPending();
  let profile;
  let rows;
  let eyebrow;
  let note;
  if (state.comparison.kind === "system") {
    profile = state.taxonomy.score_profiles.find(item => item.id === state.comparison.profile);
    eyebrow = `${familyName(records[0].system_family)} · ${profile.name}`;
    note = "Scores and weights are comparable only inside this system family. They are editorial judgments—not workload benchmarks.";
    rows = [
      ["Primary role", records.map(item => roleName(item.primary_role))],
      ["Overall score", records.map(item => scoreCell(item.score.overall))],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => scoreCell(item.score[dimension.id])),
      ]),
      ["Source model", records.map(item => sourceModelName(item.source_model))],
      ["Licenses / terms", records.map(item => item.licenses.map(value => `${value} — ${licenseName(value)}`).join(" · "))],
      ["Deployment", records.map(item => item.deployment.map(value => taxonomyName("deployment_modes", value)).join(" · "))],
      ["Local-first", records.map(item => item.local_first ? "Yes" : "No")],
      ["Architecture", records.map(item => item.architectures.map(architectureName).join(" · "))],
      ["Strengths", records.map(item => listCell(item.strengths))],
      ["Watchouts", records.map(item => listCell(item.weaknesses))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  } else if (state.comparison.kind === "model") {
    profile = state.taxonomy.model_score_profile;
    eyebrow = profile.name;
    note = "This comparison covers model access, distribution, and deployability. It excludes output quality, benchmarks, parameter count, current price, latency, and throughput.";
    rows = [
      ["Developer", records.map(item => item.developer)],
      ["Model type", records.map(item => taxonomyName("model_types", item.model_type))],
      ["Overall score", records.map(item => scoreCell(item.score.overall))],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => scoreCell(item.score[dimension.id])),
      ]),
      ["Distribution", records.map(item => traitNames("model_distribution_modes", item.distribution_modes) || null)],
      ["Input modalities", records.map(item => traitNames("model_modalities", item.source_metadata?.modalities?.input) || null)],
      ["Output modalities", records.map(item => traitNames("model_modalities", item.source_metadata?.modalities?.output) || null)],
      // Boot carries only card metadata, so `limits` is absent until detail
      // lands: that is unknown ("—"), not a reported absence.
      ["Context limit", records.map(item => {
        const limits = item.source_metadata?.limits;
        if (!limits) return null;
        return limits.context == null ? "Not reported" : Intl.NumberFormat("en").format(limits.context);
      })],
      ["Source model", records.map(item => sourceModelName(item.source_model))],
      ["Licenses", records.map(item => item.licenses.map(value => `${value} — ${licenseName(value)}`).join(" · "))],
      ["Strengths", records.map(item => listCell(item.strengths))],
      ["Tradeoffs", records.map(item => listCell(item.tradeoffs))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  } else if (state.comparison.kind === "runtime") {
    profile = state.taxonomy.local_runtime_score_profile;
    eyebrow = profile.name;
    note = "This comparison covers documented execution capability on hardware you operate. It excludes model quality, throughput, latency, benchmark rank, and hardware cost.";
    rows = [
      ["Maintainer", records.map(item => item.maintainer)],
      ["Runtime type", records.map(item => taxonomyName("local_runtime_types", item.runtime_type))],
      ["Overall score", records.map(item => scoreCell(item.score.overall))],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => scoreCell(item.score[dimension.id])),
      ]),
      ["Accelerators", records.map(item => item.accelerators.map(value => taxonomyName("runtime_accelerators", value)).join(" · "))],
      ["Model formats", records.map(item => item.model_formats.map(value => taxonomyName("runtime_model_formats", value)).join(" · "))],
      ["Serving", records.map(item => item.serving_modes.map(value => taxonomyName("runtime_serving_modes", value)).join(" · "))],
      ["API styles", records.map(item => item.api_styles.map(value => taxonomyName("inference_api_styles", value)).join(" · "))],
      ["Deployment", records.map(item => item.deployment_surfaces.map(value => taxonomyName("runtime_deployment_surfaces", value)).join(" · "))],
      ["Source model", records.map(item => sourceModelName(item.source_model))],
      ["Licenses", records.map(item => item.licenses.map(value => `${value} — ${licenseName(value)}`).join(" · "))],
      ["Hardware requirements", records.map(item => item.hardware_requirements)],
      ["Model management", records.map(item => item.model_management)],
      ["Strengths", records.map(item => listCell(item.strengths))],
      ["Tradeoffs", records.map(item => listCell(item.tradeoffs))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  } else {
    profile = state.taxonomy.inference_service_score_profile;
    eyebrow = profile.name;
    note = "This comparison covers operational service characteristics. It excludes model quality, current price, and transient latency or throughput. Trust rows record whether the operator documents a property; they are unscored and never ranked.";
    rows = [
      ["Operator", records.map(item => item.operator)],
      ["Service type", records.map(item => taxonomyName("inference_service_types", item.service_type))],
      ["Overall score", records.map(item => scoreCell(item.score.overall))],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => scoreCell(item.score[dimension.id])),
      ]),
      ["Delivery", records.map(item => item.delivery_modes.map(value => taxonomyName("inference_delivery_modes", value)).join(" · "))],
      ["Model sources", records.map(item => item.model_sources.map(value => taxonomyName("inference_model_sources", value)).join(" · "))],
      ["API styles", records.map(item => item.api_styles.map(value => taxonomyName("inference_api_styles", value)).join(" · "))],
      ["Regional controls", records.map(item => item.regional_controls)],
      ["Retention controls", records.map(item => item.retention_controls)],
      ["Routing", records.map(item => item.routing)],
      ["Customization", records.map(item => item.customization)],
      ...TRUST_PROPERTY_ORDER.map(name => [
        `${TRUST_PROPERTY_LABELS[name]} · trust record, unscored`,
        records.map(item => trustComparisonCell(item, name)),
      ]),
      ["Strengths", records.map(item => listCell(item.strengths))],
      ["Tradeoffs", records.map(item => listCell(item.tradeoffs))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  }
  $("#comparison-dialog-content").innerHTML = `<div class="comparison-heading">
    <div><p class="eyebrow">${escapeHTML(eyebrow)}</p><h1>Compare ${records.length} choices</h1><p>${escapeHTML(note)}</p></div>
    <button id="comparison-copy-link" class="ghost-button">Copy comparison link</button>
  </div>
  <p id="comparison-copy-status" class="comparison-copy-status" aria-live="polite">The current URL restores this exact comparison.</p>
  ${comparisonTable(records, rows)}`;
  $("#comparison-copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      $("#comparison-copy-status").textContent = "Comparison link copied.";
    } catch {
      $("#comparison-copy-status").textContent = "Copy the current browser URL to share this comparison.";
    }
  });
  $("#comparison-dialog").showModal();
}

// The directory is the default view, so it stays out of the URL; every other
// view names itself so the address bar is the shareable state, as it already is
// for a collection, a comparison, and a record.
function writeViewURL(id) {
  const url = new URL(window.location.href);
  if (id !== "directory") { url.searchParams.delete("element"); url.searchParams.delete("elementRecord"); }
  if (id !== "explore") Object.keys(RUNTIME_MATRIX_CONTROLS).forEach(key => url.searchParams.delete(key));
  if (id === "directory") url.searchParams.delete("view");
  else url.searchParams.set("view", id);
  writeURL(url);
}

// A switch hides whatever was pressed inside the old view, so focus would fall
// to the page. When focus is leaving another view, it lands on the new view's
// heading instead, or on `focusTarget`, without scrolling. Boot, the header's
// tabs, and dialogs all sit outside every view, so they keep their focus.
function activateView(id, { focusTarget } = {}) {
  // Read before anything repaints: a repaint can detach the focused element.
  const leaving = document.activeElement?.closest?.(".view");
  if (id === "inference-services" || id === "local-runtimes" || id === "agent-packs" || id === "robots") {
    setDirectoryCollection(id === "inference-services" ? "inference" : id === "local-runtimes" ? "runtimes" : id === "agent-packs" ? "packs" : "robots");
    id = "directory";
  }
  const alias = AppCore.parseViewAlias ? AppCore.parseViewAlias(id) : null;
  if (alias) {
    setDirectoryCollection(alias, { updateURL: false });
    id = "directory";
  }
  const comparisonFitsView = (id === "directory" && (
    (state.directoryCollection === "systems" && state.comparison.kind === "system")
    || (state.directoryCollection === "inference" && state.comparison.kind === "inference")
    || (state.directoryCollection === "runtimes" && state.comparison.kind === "runtime")
    || (state.directoryCollection === "models" && state.comparison.kind === "model")
  ));
  if (COMPARISON_VIEWS.includes(id) && state.comparison.ids.length && !comparisonFitsView) {
    clearComparison();
  }
  $$(".tab[data-tab]").forEach(item => {
    const active = item.dataset.tab === id;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const docsButton = $(".docs-button");
  const docsActive = id === "taxonomy" || id === "api" || id === "explore";
  if (docsButton) {
    docsButton.classList.toggle("is-active", docsActive);
    if (docsActive) docsButton.setAttribute("aria-current", "page");
    else docsButton.removeAttribute("aria-current");
  }
  $$('[data-open-view]').forEach(item => {
    const active = item.dataset.openView === id;
    if (active) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
  $$(".view").forEach(view => view.classList.toggle("is-active", view.id === id));
  if (id === "explore") restoreRuntimeMatrix();
  if (leaving && leaving.id !== id) {
    const heading = focusTarget || document.getElementById(document.getElementById(id)?.getAttribute("aria-labelledby"));
    heading?.focus({ preventScroll: true });
  }
  // The view is active now, so the tray shows here only in COMPARISON_VIEWS.
  renderComparisonControls();
  syncBadgeLegend();
  writeViewURL(id);
  writeScopeURL();
  window.scrollTo({ top: 0 });
}

// Which collections a search box can widen, and so which indexes its focus
// is worth fetching.
const SEARCH_SCOPES = {
  "#project-search": ["systems"], "#specification-search": ["specifications"],
  "#inference-search": ["inference"], "#runtime-search": ["runtimes"],
  "#model-search": ["models"], "#pack-search": ["packs", "systems"], "#lab-search": ["labs"],
  "#robot-search": ["robots"],
  "#all-directory-search": ["systems", "inference", "runtimes", "models", "packs", "robots"],
  "#door-search": ["systems", "inference", "runtimes", "models", "packs", "robots"],
};

// Docs groups the explanatory views so the primary row stays on the catalog
// loop. It is a plain menu: toggle on click, close on Escape, outside click,
// or selection, with focus returned to the button on Escape.
function closeDocsMenu({ focusButton = false } = {}) {
  const menu = $("#docs-menu-list");
  const button = $(".docs-button");
  if (!menu || !button || menu.hidden) return;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (focusButton) button.focus();
}

function initDocsMenu() {
  const button = $(".docs-button");
  const menu = $("#docs-menu-list");
  if (!button || !menu) return;
  button.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDocsMenu({ focusButton: true });
    }
  });
  document.addEventListener("click", event => {
    if (!menu.hidden && !event.target.closest(".docs-menu")) closeDocsMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDocsMenu();
  });
}

function bindEvents() {
  Object.values(RUNTIME_MATRIX_CONTROLS).forEach(({ selector }) => $(selector).addEventListener("change", updateRuntimeMatrix));
  $("#matrix-reset").addEventListener("click", () => {
    Object.values(RUNTIME_MATRIX_CONTROLS).forEach(({ selector, fallback }) => { $(selector).value = fallback; });
    updateRuntimeMatrix();
  });
  syncStickyClearance();
  window.addEventListener("resize", syncStickyClearance);
  for (const [scope, selector] of Object.entries(MATCH_SORTS)) {
    $(SCOPE_CONTROLS[scope].q).addEventListener("input", () => syncMatchSort(scope));
    $(selector).addEventListener("input", () => {
      if ($(SCOPE_CONTROLS[scope].q).value.trim()) sortChosenDuringQuery[scope] = true;
    });
  }
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    // A modal dialog makes the search box inert, so the key would only be
    // swallowed; leave it to the browser.
    if (document.querySelector("dialog[open]")) return;
    const onDoor = $("#directory").classList.contains("is-active") && state.directoryStage === "door";
    const selector = onDoor ? "#door-search" : SCOPE_CONTROLS[activeScope()]?.q;
    if (!selector) return;
    event.preventDefault();
    $(selector).focus();
  });
  // The Docs menu button carries .tab styling but no data-tab, so the primary
  // tabs bind on [data-tab] and the menu wires separately below.
  $$(".tab[data-tab]").forEach(button => button.addEventListener("click", () => {
    activateView(button.dataset.tab);
    if (button.dataset.tab === "directory") showFrontDoor();
  }));
  $$('[data-open-tab]').forEach(button => button.addEventListener("click", () => activateView(button.dataset.openTab)));
  $$('[data-open-view]').forEach(button => button.addEventListener("click", () => { closeDocsMenu(); activateView(button.dataset.openView); }));
  initDocsMenu();
  // The brand mark links home. A plain left click stays in the single-page
  // app on the directory landing view; modified clicks and new tabs follow
  // the href to the site root.
  const brandLink = $(".brand-link");
  if (brandLink) brandLink.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    activateView("directory");
    showFrontDoor();
  });
  // Fetching on focus rather than on the first keystroke usually beats the
  // second character, so the widened results arrive before anyone sees the
  // narrow ones. The All view searches five collections, so it loads five.
  for (const [selector, collections] of Object.entries(SEARCH_SCOPES)) {
    const input = $(selector);
    const loadIndexes = () => {
      for (const collection of collections) {
        loadSearchIndex(collection)?.then(renderSearchSurfaces);
      }
    };
    input.addEventListener("focus", loadIndexes);
    // Boot data can take longer to parse as catalogs grow. If someone focuses
    // a search field before bootstrap binds events, honor that existing focus
    // instead of waiting for a second focus cycle.
    if (document.activeElement === input) loadIndexes();
  }
  $("#all-directory-search").addEventListener("input", () => { state.page.all = 1; renderAllDirectoryEntries(); });
  initBadgeTooltip();
  initBadgeLegend();
  // The front door's search hands its text to the All search and lands in
  // results, so the first character is the search; the caret follows.
  $("#element-groups").addEventListener("click", event => {
    const button = event.target.closest("[data-element]");
    if (button) selectElement(button.dataset.element, "", { focus: true });
  });
  $("#element-record").addEventListener("change", event => {
    selectedElementRecord = selectedElement.records.find(record => record.id === event.target.value);
    writeElementURL();
    loadElementRecord();
  });
  $("#element-close").addEventListener("click", () => {
    const id = selectedElement.id;
    selectElement(null);
    document.querySelector(`[data-element="${id}"]`)?.focus();
  });
  $("#element-retry").addEventListener("click", loadElementRecord);
  window.matchMedia("(max-width: 700px)").addEventListener("change", positionElementSheet);
  $("#door-search").addEventListener("input", event => {
    const value = event.target.value;
    if (!value) return;
    event.target.value = "";
    $("#all-directory-search").value = value;
    state.page.all = 1;
    openCollection("all");
    // Leaving the door carries the query of the scope last shown, which can
    // replace the text just typed; the typed text is the search.
    const target = $("#all-directory-search");
    if (target.value !== value) {
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    target.focus({ preventScroll: true });
    target.setSelectionRange(value.length, value.length);
  });
  document.addEventListener("click", event => {
    const family = event.target.closest("[data-family-entry]");
    if (family) {
      jumpToDirectoryFamily(family.dataset.familyEntry);
      return;
    }
    const category = event.target.closest("[data-facet-key]");
    if (category) {
      openCollection(category.dataset.openCollection, { facet: { key: category.dataset.facetKey, value: category.dataset.facetValue } });
      return;
    }
    const entry = event.target.closest("[data-open-collection]");
    if (entry) {
      openCollection(entry.dataset.openCollection);
      return;
    }
    const job = event.target.closest("[data-door-goal]");
    if (job) openFinderAt(job.dataset.doorDirection, job.dataset.doorGoal);
  });
  $("#family-filter").addEventListener("input", () => {
    clearComparison();
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
    $("#role-filter").value = "";
    populateRoleFilter();
    updateScoreSortAvailability();
    state.page.systems = 1;
    renderProjects();
    syncBadgeLegend();
    renderScopeStrip();
  });
  $("#role-filter").addEventListener("input", () => { state.directoryRoles = null; state.directoryRolesLabel = null; state.page.systems = 1; renderProjects(); });
  ["#project-search", "#source-model-filter", "#license-filter", "#agent-filter", "#architecture-filter", "#deployment-filter", "#agent-interface-filter", "#status-filter", "#sort-filter", "#local-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.systems = 1; renderProjects(); }));
  ["#specification-search", "#specification-type-filter", "#specification-scope-filter", "#specification-status-filter", "#specification-license-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.specifications = 1; renderSpecifications(); }));
  ["#inference-search", "#inference-type-filter", "#inference-delivery-filter", "#inference-model-source-filter", "#inference-api-filter", "#inference-sort-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.inference = 1; renderInferenceServices(); }));
  ["#runtime-search", "#runtime-type-filter", "#runtime-accelerator-filter", "#runtime-format-filter", "#runtime-api-filter", "#runtime-sort-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.runtimes = 1; renderLocalRuntimes(); }));
  ["#model-search", "#model-type-filter", "#model-distribution-filter", "#model-modality-filter", "#model-source-filter", "#model-license-filter", "#model-lab-filter", "#model-sort-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.models = 1; renderModels(); }));
  ["#lab-search", "#lab-type-filter", "#lab-country-filter", "#lab-distribution-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.labs = 1; renderLabs(); }));
  ["#pack-search", "#pack-type-filter", "#pack-host-filter", "#pack-install-filter", "#pack-license-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.packs = 1; renderPacks(); }));
  ["#robot-search", "#robot-form-factor-filter", "#robot-ai-basis-filter", "#robot-availability-filter", "#robot-status-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.robots = 1; renderCollection("robots"); }));
  $("#reset-specification-filters").addEventListener("click", () => {
    $("#specification-search").value = "";
    $("#specification-type-filter").value = "";
    $("#specification-scope-filter").value = "";
    $("#specification-status-filter").value = "";
    $("#specification-license-filter").value = "";
    state.page.specifications = 1;
    renderSpecifications();
  });
  $("#reset-inference-filters").addEventListener("click", () => {
    $("#inference-search").value = "";
    $("#inference-type-filter").value = "";
    $("#inference-delivery-filter").value = "";
    $("#inference-model-source-filter").value = "";
    $("#inference-api-filter").value = "";
    $("#inference-sort-filter").value = "score";
    syncMatchSort("inference");
    state.page.inference = 1;
    renderInferenceServices();
  });
  $("#reset-runtime-filters").addEventListener("click", () => {
    $("#runtime-search").value = "";
    $("#runtime-type-filter").value = "";
    $("#runtime-accelerator-filter").value = "";
    $("#runtime-format-filter").value = "";
    $("#runtime-api-filter").value = "";
    $("#runtime-sort-filter").value = "score";
    syncMatchSort("runtimes");
    state.page.runtimes = 1;
    renderLocalRuntimes();
  });
  $("#reset-model-filters").addEventListener("click", () => {
    $("#model-search").value = "";
    $("#model-type-filter").value = "";
    $("#model-distribution-filter").value = "";
    $("#model-modality-filter").value = "";
    $("#model-source-filter").value = "";
    $("#model-license-filter").value = "";
    $("#model-lab-filter").value = "";
    $("#model-sort-filter").value = "score";
    syncMatchSort("models");
    state.page.models = 1;
    renderModels();
  });
  $("#reset-pack-filters").addEventListener("click", () => {
    $("#pack-search").value = "";
    $("#pack-type-filter").value = "";
    $("#pack-host-filter").value = "";
    $("#pack-install-filter").value = "";
    $("#pack-license-filter").value = "";
    state.page.packs = 1;
    renderPacks();
  });
  $("#reset-lab-filters").addEventListener("click", () => {
    $("#lab-search").value = "";
    $("#lab-type-filter").value = "";
    $("#lab-country-filter").value = "";
    $("#lab-distribution-filter").value = "";
    state.page.labs = 1;
    renderLabs();
  });
  $("#reset-robot-filters").addEventListener("click", () => {
    $("#robot-search").value = "";
    $("#robot-form-factor-filter").value = "";
    $("#robot-ai-basis-filter").value = "";
    $("#robot-availability-filter").value = "";
    $("#robot-status-filter").value = "";
    state.page.robots = 1;
    renderCollection("robots");
  });
  $("#reset-all-directory").addEventListener("click", () => {
    $("#all-directory-search").value = "";
    state.page.all = 1;
    renderAllDirectoryEntries();
  });
  $("#reset-filters").addEventListener("click", () => {
    applyDirectoryDefaults();
    syncMatchSort("systems");
    state.page.systems = 1;
    renderProjects();
  });
  $("#finder-roles-chip").addEventListener("click", () => {
    state.directoryRoles = null;
    state.directoryRolesLabel = null;
    state.page.systems = 1;
    renderProjects();
    renderScopeStrip();
    // The chip removes itself, so keyboard and screen-reader focus would
    // otherwise fall off the page; land it on the count the chip affected.
    $("#result-count").focus();
  });
  $("#finder-content").addEventListener("click", event => {
    const choice = event.target.closest("[data-finder-choice]");
    if (choice) {
      const key = choice.dataset.finderChoice;
      state.finder.answers[key] = choice.dataset.finderValue;
      if (key === "direction") {
        delete state.finder.answers.goal;
        delete state.finder.answers.priority;
      } else if (key === "goal") {
        delete state.finder.answers.priority;
      }
      state.finder.step = Math.min(3, state.finder.step + 1);
      renderFinder();
      keepFinderInView();
      return;
    }
    if (event.target.closest("[data-finder-back]")) {
      state.finder.step = Math.max(0, state.finder.step - 1);
      if (state.finder.step < 2) delete state.finder.answers.priority;
      if (state.finder.step < 1) delete state.finder.answers.goal;
      renderFinder();
      keepFinderInView();
      return;
    }
    if (event.target.closest("[data-finder-reset]")) {
      state.finder = { step: 0, answers: {} };
      renderFinder();
      keepFinderInView();
      return;
    }
    const projectButton = event.target.closest("[data-finder-project]");
    if (projectButton) {
      openProject(projectButton.dataset.finderProject);
      return;
    }
    const inferenceButton = event.target.closest("[data-finder-inference]");
    if (inferenceButton) {
      openInferenceService(inferenceButton.dataset.finderInference);
      return;
    }
    const runtimeButton = event.target.closest("[data-finder-runtime]");
    if (runtimeButton) {
      openLocalRuntime(runtimeButton.dataset.finderRuntime);
      return;
    }
    if (event.target.closest("[data-finder-directory]")) applyFinderToDirectory();
  });
  $("#project-dialog .dialog-close").addEventListener("click", () => $("#project-dialog").close());
  $("#project-dialog").addEventListener("click", event => { if (event.target === $("#project-dialog")) $("#project-dialog").close(); });
  $("#specification-dialog .dialog-close").addEventListener("click", () => $("#specification-dialog").close());
  $("#specification-dialog").addEventListener("click", event => { if (event.target === $("#specification-dialog")) $("#specification-dialog").close(); });
  $("#inference-dialog .dialog-close").addEventListener("click", () => $("#inference-dialog").close());
  $("#inference-dialog").addEventListener("click", event => { if (event.target === $("#inference-dialog")) $("#inference-dialog").close(); });
  $("#runtime-dialog .dialog-close").addEventListener("click", () => $("#runtime-dialog").close());
  $("#runtime-dialog").addEventListener("click", event => { if (event.target === $("#runtime-dialog")) $("#runtime-dialog").close(); });
  $("#pack-dialog .dialog-close").addEventListener("click", () => $("#pack-dialog").close());
  $("#pack-dialog").addEventListener("click", event => { if (event.target === $("#pack-dialog")) $("#pack-dialog").close(); });
  $("#robot-dialog .dialog-close").addEventListener("click", () => $("#robot-dialog").close());
  $("#robot-dialog").addEventListener("click", event => { if (event.target === $("#robot-dialog")) $("#robot-dialog").close(); });
  $("#model-dialog .dialog-close").addEventListener("click", () => $("#model-dialog").close());
  $("#model-dialog").addEventListener("click", event => { if (event.target === $("#model-dialog")) $("#model-dialog").close(); });
  $("#lab-dialog .dialog-close").addEventListener("click", () => $("#lab-dialog").close());
  $("#lab-dialog").addEventListener("click", event => { if (event.target === $("#lab-dialog")) $("#lab-dialog").close(); });
  RECORD_DIALOG_SELECTORS.forEach(selector => $(selector).addEventListener("close", clearRecordURL));
  window.addEventListener("popstate", () => { if (window.location.search !== settledSearch) restoreFromURL(); });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-copy-record-link]");
    if (button) copyRecordLink(button);
    // Every record dialog links a lab-claimed record to its lab (ADR 041).
    const labLink = event.target.closest("[data-open-lab]");
    if (labLink) {
      labLink.closest("dialog")?.close();
      openLab(labLink.dataset.openLab);
    }
  });
  document.addEventListener("click", event => {
    const suggestion = event.target.closest("[data-suggest-query]");
    if (suggestion) {
      const selector = SCOPE_CONTROLS[activeScope()]?.q;
      if (!selector) return;
      const input = $(selector);
      input.value = suggestion.dataset.suggestQuery;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      return;
    }
    const goal = event.target.closest("[data-finder-goal]");
    if (goal) {
      const [direction, id] = goal.dataset.finderGoal.split(":");
      openFinderAt(direction, id);
      return;
    }
    if (event.target.closest("[data-empty-unfilter]")) {
      clearScopeFacets(activeScope());
      return;
    }
    if (event.target.closest("[data-empty-search-all]")) {
      const selector = SCOPE_CONTROLS[activeScope()]?.q;
      if (selector) searchAllCollections($(selector).value);
      return;
    }
    if (event.target.closest("[data-empty-finder]")) activateView("finder");
  });
  $("#comparison-open").addEventListener("click", openComparison);
  $("#comparison-clear").addEventListener("click", () => clearComparison());
  $("#comparison-dialog .dialog-close").addEventListener("click", () => $("#comparison-dialog").close());
  $("#comparison-dialog").addEventListener("click", event => { if (event.target === $("#comparison-dialog")) $("#comparison-dialog").close(); });
}

// Theme: "system" leaves the root unstamped so the OS preference decides;
// "light" and "dark" stamp data-theme and persist. The inline script in
// index.html applies a stored choice before first paint; this keeps the
// control, the storage, and the browser chrome colour in step afterwards.
const THEME_STORAGE_KEY = "theme";

function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function syncThemeColor() {
  const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  const meta = $('meta[name="theme-color"]');
  if (meta && background) meta.setAttribute("content", background);
}

function applyThemePreference(preference) {
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable; the choice still applies for this page.
  }
  $("#theme-toggle")?.setAttribute("aria-label", `Theme: ${preference}`);
  syncThemeColor();
}

function bindTheme() {
  applyThemePreference(readThemePreference());
  $("#theme-toggle")?.addEventListener("click", () => applyThemePreference(AppCore.cycleThemePreference(readThemePreference())));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
}

bindTheme();
bootstrap().catch(error => {
  document.body.innerHTML = `<main><div class="notice">peacefulcoexistance failed to load: ${escapeHTML(error.message)}</div></main>`;
});
