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
  directoryCollection: "all", directoryRoles: null, badgeLegendPreference: null,
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

const FINDER_DIRECTIONS = [
  { id: "memory_system", label: "Preserve and use knowledge", description: "Notes, documents, recall, personal knowledge, or durable memory for agents.", cue: "I need a memory system" },
  { id: "agent_system", label: "Plan and take action", description: "Coding, research, data analysis, browser work, or a framework for building tool-using agents.", cue: "I need an agent system" },
  { id: "assistant_system", label: "Help across everyday work", description: "A conversational workspace for research, creation, organizational context, or access to several models.", cue: "I need an assistant" },
  { id: "inference_service", label: "Serve and route models", description: "A managed API, cloud platform, model host, or routing layer for production inference.", cue: "I need an inference service" },
  { id: "local_runtime", label: "Run models on hardware I operate", description: "A desktop runner, server engine, embeddable library, or self-hosted compatible gateway.", cue: "I need a local runtime" }
];

const FINDER_GOALS = {
  memory_system: [
    { id: "personal_knowledge", label: "Keep my own notes and knowledge", description: "A workspace for writing, linking, organizing, and revisiting ideas.", roles: ["human_pkm"] },
    { id: "knowledge_assistant", label: "Ask questions over documents", description: "A ready-to-use AI knowledge app or RAG workspace.", roles: ["ai_knowledge_app"] },
    { id: "agent_memory", label: "Give agents durable memory", description: "Memory services, temporal context, or a bridge to human-owned knowledge.", roles: ["agent_memory_service", "context_graph_engine", "memory_bridge"] },
    { id: "ambient_recall", label: "Automatically remember activity", description: "Passive capture for reconstructing digital work and context.", roles: ["ambient_capture"] },
    { id: "memory_infrastructure", label: "Build a custom memory product", description: "Retrieval or context-graph infrastructure for developers.", roles: ["retrieval_infrastructure", "context_graph_engine"] }
  ],
  agent_system: [
    { id: "general_work", label: "Delegate general knowledge work", description: "An end-user agent that plans and completes broad multi-step work across files, web sources, and applications.", roles: ["general_work_agent"] },
    { id: "coding", label: "Write and maintain software", description: "An interactive coding agent or a repeatable coding-agent workflow.", roles: ["coding_agent", "coding_agent_workflow"] },
    { id: "research", label: "Research and synthesize information", description: "A multi-step researcher that gathers sources and produces reports.", roles: ["research_agent"] },
    { id: "analyze_data", label: "Analyze data with natural language", description: "A text-to-SQL or analytics agent that plans, validates, and explains queries.", roles: ["data_analysis_agent"] },
    { id: "browser", label: "Operate websites or browsers", description: "An agent specialized in browser and graphical interaction.", roles: ["browser_computer_agent"] },
    { id: "persistent", label: "Run a persistent, stateful agent", description: "Identity, memory, schedules, skills, and long-running state.", roles: ["stateful_agent_runtime"] },
    { id: "build_agents", label: "Build and orchestrate agents", description: "A framework for tools, workflows, state, and multi-agent coordination.", roles: ["agent_framework_sdk", "multi_agent_orchestrator"] }
  ],
  assistant_system: [
    { id: "general_assistance", label: "Use one broad AI workspace", description: "A general assistant for research, files, creation, memory, and connected tools.", roles: ["general_ai_assistant"] },
    { id: "enterprise_work", label: "Work across organizational context", description: "A governed assistant grounded in company data, applications, and business actions.", roles: ["enterprise_work_assistant"] },
    { id: "model_choice", label: "Use several models in one place", description: "A consistent chat workspace with first-class model and provider choice.", roles: ["multi_model_chat_client"] }
  ],
  inference_service: [
    { id: "model_developer_api", label: "Use a model developer's API", description: "Call first-party model families through their developer's managed service.", serviceTypes: ["direct_model_api"] },
    { id: "cloud_governance", label: "Deploy through my cloud platform", description: "Use cloud-native identity, regions, networking, and models from several publishers.", serviceTypes: ["cloud_model_platform"] },
    { id: "host_models", label: "Host selected or custom models", description: "Serve open-weight, third-party, or customer-supplied models on managed infrastructure.", serviceTypes: ["managed_inference_host"] },
    { id: "route_models", label: "Route across models and providers", description: "Use one API with provider selection, fallback, or routing policy.", serviceTypes: ["routing_aggregator"] }
  ],
  local_runtime: [
    { id: "personal_machine", label: "Run models on my own computer", description: "A packaged runner that manages download, storage, and local serving.", runtimeTypes: ["desktop_runner"] },
    { id: "serve_workload", label: "Serve a sustained request load", description: "An engine built for batching, concurrency, and multi-accelerator serving.", runtimeTypes: ["server_engine"] },
    { id: "embed_inference", label: "Embed inference in my own software", description: "A library or binary a host application links rather than operates as a service.", runtimeTypes: ["embedded_library"] },
    { id: "self_host_endpoint", label: "Self-host one compatible endpoint", description: "A gateway presenting familiar APIs over interchangeable local backends.", runtimeTypes: ["compatibility_gateway"] }
  ]
};

const FINDER_PRIORITIES = {
  memory_system: [
    { id: "local_editable", label: "Local, inspectable knowledge", description: "Prefer local-first systems with data people can directly inspect or edit." },
    { id: "local_control", label: "Self-hosting and privacy", description: "Prefer local execution and strong control over stored data." },
    { id: "easy", label: "Low setup and maintenance", description: "Prefer systems that are easier for an individual to operate." },
    { id: "portable", label: "Open and interoperable", description: "Prefer portable formats, APIs, and provider flexibility." },
    { id: "balanced", label: "Best balanced fit", description: "Use the family-specific editorial score as the main tie-breaker." }
  ],
  agent_system: [
    { id: "direct_use", label: "Ready for me to use", description: "Prefer terminal, IDE, or web interfaces over embedded libraries." },
    { id: "developer", label: "Composable developer framework", description: "Prefer libraries and APIs for building a custom agent product." },
    { id: "local", label: "Local execution and control", description: "Prefer local-first agents that can operate on the host." },
    { id: "control", label: "Human control and recovery", description: "Prefer approvals, observability, checkpoints, and recoverability." },
    { id: "balanced", label: "Best balanced fit", description: "Use the family-specific editorial score as the main tie-breaker." }
  ],
  assistant_system: [
    { id: "tools", label: "Tools and connected apps", description: "Prefer assistants that work across files, search, applications, and actions." },
    { id: "continuity", label: "Context and memory", description: "Prefer durable projects, conversation continuity, memory controls, and provenance." },
    { id: "governance", label: "Control and governance", description: "Prefer strong consent, retention, administration, privacy, and deletion controls." },
    { id: "portable", label: "Model and data portability", description: "Prefer model choice, export, APIs, protocols, and open connectors." },
    { id: "balanced", label: "Best balanced fit", description: "Use the family-specific editorial score as the main tie-breaker." }
  ],
  inference_service: [
    { id: "governance", label: "Data governance", description: "Prefer documented retention, training-use, privacy, deletion, and tenant controls." },
    { id: "regions", label: "Regional deployment control", description: "Prefer explicit processing regions, network boundaries, and isolated placement." },
    { id: "portable", label: "API and serving flexibility", description: "Prefer portable interfaces and several documented capacity or deployment modes." },
    { id: "resilience", label: "Traffic resilience", description: "Prefer documented routing, fallback, recovery, or multi-region traffic controls." },
    { id: "balanced", label: "Best balanced fit", description: "Use the inference-service editorial score as the main tie-breaker." }
  ],
  local_runtime: [
    { id: "hardware", label: "Hardware coverage", description: "Prefer runtimes documenting the widest range of processors and accelerators." },
    { id: "formats", label: "Model format breadth", description: "Prefer runtimes that load the widest range of weight formats and quantizations." },
    { id: "serving", label: "Concurrent serving", description: "Prefer documented batching, parallel requests, and distributed serving." },
    { id: "operability", label: "Deployment and visibility", description: "Prefer documented install paths, orchestration, controls, and metrics." },
    { id: "balanced", label: "Best balanced fit", description: "Use the local-runtime editorial score as the main tie-breaker." }
  ]
};

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
  state.specifications = specifications.specifications;
  state.models = models.models;
  state.reviewedModelCount = models.reviewed_count;
  state.modelSourceCount = models.source_record_count;
  state.modelUnlistedCount = models.unlisted_reviewed_count;
  state.taxonomy = taxonomy;
  state.packs = packs.packs;
  state.labs = labs.labs;
  state.labIndex = AtlasCore.buildLabIndex(state.labs, state.models);
  state.robots = robots.robots;
  const dataDate = [systems.generated_at, specifications.verified_at, inference.verified_at, runtimes.verified_at, models.verified_at, models.source_updated_at, packs.verified_at, labs.verified_at, robots.verified_at]
    .filter(Boolean)
    .sort()
    .at(-1);
  $("#data-date").textContent = `Data updated ${dataDate}`;
  populateFilters();
  populateCollectionFilters();
  populateModelLabFilter();
  const scope = AtlasCore.scopeFromURL(new URL(window.location.href).searchParams);
  const restored = restoreScopeFromURL(scope);
  renderStats();
  renderFinder();
  renderModels();
  renderLabs();
  renderSpecifications();
  renderTaxonomy();
  bindEvents();
  if (!restoreComparisonFromURL()) {
    setDirectoryCollection(new URL(window.location.href).searchParams.get("collection") || "all", { updateURL: false });
  }
  restoreViewFromURL();
  restoreRecordFromURL();
  state.urlReady = true;
  writeScopeURL();
  if (restored.q) loadRestoredSearch(scope, restored.page);
  loadMarks();
}

// Marks are decorative next to the record name, so they stay hidden from
// assistive technology. Icon bodies come from the vendored, build-sanitized
// logos.json; every dynamic value still passes through escapeHTML.
function cardMark(record) {
  const icon = state.logos.icons[state.logos.records[record.id]];
  if (icon) return `<span class="card-mark" data-mark="${escapeHTML(record.id)}" aria-hidden="true"><svg viewBox="0 0 24 24">${icon.body}</svg></span>`;
  return `<span class="card-mark card-monogram" data-mark="${escapeHTML(record.id)}" aria-hidden="true">${escapeHTML(AtlasCore.monogramGlyph(record.name))}</span>`;
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
const FINDER_DIRECTION_NAMES = { inference_service: "Inference services", local_runtime: "Local runtimes" };
const finderDirectionName = id => FINDER_DIRECTION_NAMES[id] || familyName(id);
const roleName = id => taxonomyName("primary_roles", id);
const relationName = id => taxonomyName("agent_relations", id);
const architectureName = id => taxonomyName("architectures", id);
const sourceModelName = id => taxonomyName("source_models", id);
const licenseName = id => taxonomyName("licenses", id);
const scoreProfileName = id => taxonomyName("score_profiles", id);
const traitNames = (group, values = []) => values.map(id => taxonomyName(group, id)).join(" · ");

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

function writeDirectoryURL() {
  const url = new URL(window.location.href);
  if (state.directoryCollection === "all") url.searchParams.delete("collection");
  else url.searchParams.set("collection", state.directoryCollection);
  if (state.comparison.ids.length) {
    url.searchParams.set("compare", `${state.comparison.kind}:${state.comparison.ids.join(",")}`);
  } else {
    url.searchParams.delete("compare");
  }
  window.history.replaceState(null, "", url);
}

// Each scope's URL parameters and the control that holds each one. Keys are
// AtlasCore.SCOPE_URL_PARAMS keys; selectors are web/index.html's.
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

// The scope whose state the URL carries: the Directory's collection, or a
// sibling view that has filters. Finder, Taxonomy, and API carry none.
function activeScope() {
  const view = $(".view.is-active")?.id;
  if (view === "directory") return state.directoryCollection;
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

// Rewrites the active scope's parameters in place: only `record` pushes
// history (docs/WEB.md), so Back still closes a dialog. Quiet until the
// page has restored itself, so boot never writes a half-restored state.
function writeScopeURL() {
  if (!state.urlReady) return;
  const url = new URL(window.location.href);
  AtlasCore.SCOPE_URL_KEYS.forEach(key => url.searchParams.delete(key));
  const scope = activeScope();
  if (scope) {
    for (const [key, value] of AtlasCore.scopeURLParams(scope, readScopeControls(scope))) url.searchParams.set(key, value);
    if (state.page[scope] > 1) url.searchParams.set("page", String(state.page[scope]));
  }
  // Every render and keystroke lands here, and WebKit throws once a page makes
  // too many history calls in a short window. So an unchanged URL makes no
  // call, and a refused one is dropped rather than stopping the render that
  // asked for it: the next write brings the address bar up to date.
  if (url.href === window.location.href) return;
  try { window.history.replaceState(null, "", url); } catch {}
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
  const { values, rejected } = AtlasCore.readScopeURLParams(scope, url.searchParams, allowedScopeValues(scope));
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
    window.history.replaceState(null, "", url);
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
  if (updateURL) writeDirectoryURL();
}

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
  tray.hidden = records.length === 0;
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
  state.comparison = AtlasCore.updateComparisonSelection(state.comparison, { kind, profile: record.score_profile, id });
  renderComparisonControls();
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
    window.history.replaceState(null, "", url);
    return false;
  }
  const profile = [...profiles][0];
  state.comparison = { kind, profile, ids, limitReached: false };
  if (kind === "system") {
    state.directoryRoles = null;
    // A role restored from the URL stays when the comparison's family offers
    // it; populateRoleFilter falls back to All roles when it does not.
    $("#family-filter").value = records[0].system_family;
    populateRoleFilter();
    updateScoreSortAvailability();
    setDirectoryCollection("systems", { updateURL: false });
  } else if (kind === "model") {
    activateView("models");
  } else {
    setDirectoryCollection(kind === "runtime" ? "runtimes" : "inference", { updateURL: false });
  }
  renderComparisonControls();
  writeDirectoryURL();
  if (ids.length >= 2) openComparison();
  return true;
}

function populateFilters() {
  const defaults = AtlasCore.directoryDefaults();
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
    $("#local-filter").checked ? "local" : "",
  ].filter(Boolean).length;
  $(".advanced-filter-shell summary").textContent = active ? `More filters · ${active} active` : "More filters";
}

function applyDirectoryDefaults() {
  clearComparison();
  const defaults = AtlasCore.directoryDefaults();
  state.directoryRoles = null;
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
  $("#local-filter").checked = defaults.localOnly;
  updateScoreSortAvailability();
  syncBadgeLegend();
}

function renderStats() {
  const counts = AtlasCore.switcherCounts({
    projects: state.projects, services: state.inferenceServices, runtimes: state.localRuntimes,
    models: state.models, packs: state.packs, robots: state.robots,
  });
  $("#hero-kicker").textContent = `${counts.all} systems, source models, services, runtimes, packs, and robots`;
  $("#all-collection-count").textContent = counts.all;
  $("#system-collection-count").textContent = counts.systems;
  $("#memory-collection-count").textContent = counts.memory_system;
  $("#agent-collection-count").textContent = counts.agent_system;
  $("#assistant-collection-count").textContent = counts.assistant_system;
  $("#inference-collection-count").textContent = counts.inference;
  $("#runtime-collection-count").textContent = counts.runtimes;
  $("#model-collection-count").textContent = counts.models;
  $("#pack-collection-count").textContent = counts.packs;
  // An empty collection has no navigation entry: the scope exists before its
  // first record is reviewed, and a reader should not be sent to an empty page.
  $("#robot-collection-count").textContent = counts.robots;
  $("#robot-collection-count").parentElement.hidden = counts.robots === 0;
}

function syncCollectionSwitcher() {
  const buttons = $$('[data-directory-collection]');
  const active = AtlasCore.activeSwitcherIndex(
    buttons.map(button => ({ collection: button.dataset.directoryCollection, family: button.dataset.directoryFamily })),
    { collection: state.directoryCollection, family: $("#family-filter").value },
  );
  buttons.forEach((button, index) => {
    button.classList.toggle("is-active", index === active);
    button.setAttribute("aria-pressed", String(index === active));
  });
  const activeButton = buttons[active] || null;
  // The switcher wraps at desktop widths, so every entry is already visible
  // there; only the narrow layout keeps the horizontal scroll strip that can
  // hide the active entry off-screen. Scrolling only fires when the strip is
  // actually scrollable, so a scope change on a wide viewport never jolts the
  // page, and it never asks for smooth scrolling so reduced motion is respected.
  // scrollIntoView would do here, but it can scroll the whole page vertically
  // to bring the switcher itself into view (e.g. a Systems family change that
  // re-syncs it while it sits above the fold on a phone); moving only
  // switcher.scrollLeft, by the button's nearest-edge overflow, never touches
  // the page's own scroll position.
  const switcher = $(".collection-switcher");
  if (activeButton && switcher && switcher.scrollWidth > switcher.clientWidth) {
    const switcherRect = switcher.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    if (buttonRect.left < switcherRect.left) {
      switcher.scrollLeft -= switcherRect.left - buttonRect.left;
    } else if (buttonRect.right > switcherRect.right) {
      switcher.scrollLeft += buttonRect.right - switcherRect.right;
    }
  }
}

function jumpToDirectoryFamily(family) {
  clearComparison();
  $("#family-filter").value = family;
  state.directoryRoles = null;
  $("#role-filter").value = "";
  populateRoleFilter();
  updateScoreSortAvailability();
  setDirectoryCollection("systems");
}

function setDirectoryCollection(collection, { updateURL = true } = {}) {
  const selected = ["all", "systems", "inference", "runtimes", "packs", "robots"].includes(collection) ? collection : "all";
  const compatible = (selected === "systems" && state.comparison.kind === "system")
    || (selected === "inference" && state.comparison.kind === "inference")
    || (selected === "runtimes" && state.comparison.kind === "runtime");
  if (updateURL && state.comparison.ids.length && !compatible) clearComparison({ updateURL: false });
  state.directoryCollection = selected;
  syncCollectionSwitcher();
  $("#all-directory-panel").hidden = selected !== "all";
  $("#systems-directory-panel").hidden = selected !== "systems";
  $("#inference-directory-panel").hidden = selected !== "inference";
  $("#runtimes-directory-panel").hidden = selected !== "runtimes";
  $("#packs-directory-panel").hidden = selected !== "packs";
  $("#robots-directory-panel").hidden = selected !== "robots";
  const renderers = {
    all: renderAllDirectoryEntries,
    systems: renderProjects,
    inference: renderInferenceServices,
    runtimes: renderLocalRuntimes,
    packs: renderPacks,
    robots: () => renderCollection("robots"),
  };
  for (const [name, grid] of [
    ["all", "#all-directory-grid"], ["systems", "#project-grid"],
    ["inference", "#inference-grid"], ["runtimes", "#runtime-grid"], ["packs", "#pack-grid"],
    ["robots", "#robot-grid"],
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
  return `<ul class="card-badges" role="list">${badges.map(badge => `<li class="card-badge" data-badge="${escapeHTML(badge.id)}" data-family="${escapeHTML(badge.family)}" data-name="${escapeHTML(badge.name)}" data-definition="${escapeHTML(badge.definition)}">${AtlasCore.badgeEmblem(badge.id)}<span class="visually-hidden">${escapeHTML(badge.name)}: ${escapeHTML(badge.definition)}</span></li>`).join("")}</ul>`;
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
    tooltip.querySelector(".badge-tooltip-family").textContent = AtlasCore.BADGE_FAMILIES[badge.dataset.family]?.name || "";
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
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const badge = event.target.closest?.(".card-badge");
    if (badge) show(badge);
    else if (anchor) hide();
  });
  document.addEventListener("click", event => {
    const badge = event.target.closest?.(".card-badge");
    if (badge && badge !== anchor) show(badge);
    else hide();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
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
  const legend = inDirectory ? AtlasCore.badgeLegend(state.directoryCollection, systemFamily)
    : ["models", "specifications", "labs"].includes(activeViewId) ? AtlasCore.badgeLegend(activeViewId)
    : null;
  const shown = Boolean(legend) && $("#comparison-tray").hidden;
  const open = shown && (state.badgeLegendPreference || badgeLegendPreference()) === "open";
  if (legend) {
    $("#badge-legend-items").dataset.mode = legend.mode;
    $("#badge-legend-items").innerHTML = legend.mode === "families"
      ? legend.families.map(family => `<li data-family="${escapeHTML(family.id)}">${AtlasCore.familyEmblem(family.id)}<span><strong>${escapeHTML(family.name)}</strong> ${escapeHTML(family.meaning)}</span></li>`).join("")
      : legend.badges.map(badge => `<li data-family="${escapeHTML(badge.family)}">${AtlasCore.badgeEmblem(badge.id)}<span>${escapeHTML(badge.name)}</span></li>`).join("");
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
    ${badgeRow(AtlasCore.cardBadges("pack", pack))}
    <div class="card-footer"><span>${footerFacts(starCount(pack), escapeHTML(taxonomyName("pack_install_mechanisms", pack.install_mechanism)))}${pack.status === "active" ? "" : ` · ${escapeHTML(label(pack.status))}`}</span><button data-pack="${escapeHTML(pack.id)}">View details →</button></div>
  </article>`;
}

// A lab's other records are joined by the names the catalog already uses for it
// (ADR 041); the join runs over the boot records this page holds.
function labRelationsFor(lab) {
  return AtlasCore.labRelations(lab, {
    models: state.models, projects: state.projects, services: state.inferenceServices,
    runtimes: state.localRuntimes, specifications: state.specifications, packs: state.packs,
  });
}

const labDistributionOrder = () => state.taxonomy.model_distribution_modes.map(item => item.id);

// Every Atlas count on a lab card is a join over reviewed records; nothing on it
// ranks the lab. The newest reviewed release date is a tracking signal only.
function labCard(lab) {
  const relations = labRelationsFor(lab);
  const modes = AtlasCore.labDistributionModes(relations.models, labDistributionOrder());
  const newest = AtlasCore.releasesNewestFirst(relations.models)[0];
  const counts = [
    [relations.models.length, "reviewed release", "reviewed releases"],
    [relations.systems.length, "system", "systems"],
    [relations.services.length, "inference service", "inference services"],
    [relations.runtimes.length, "local runtime", "local runtimes"],
    [relations.specifications.length, "specification", "specifications"],
    [relations.packs.length, "agent pack", "agent packs"],
  ].filter(([count]) => count).map(([count, one, many]) => `<span>${count} ${count === 1 ? one : many}</span>`).join("");
  const origin = lab.parent_organization ? `Part of ${lab.parent_organization}` : new URL(lab.url).hostname.replace(/^www\./, "");
  const newestDate = newest && AtlasCore.releaseDate(newest);
  return `<article class="project-card lab-card">
    <div class="card-top"><div class="card-identity">${cardMark(lab)}<div><p class="family-label">${escapeHTML(taxonomyName("lab_types", lab.lab_type))} · ${escapeHTML(taxonomyName("countries", lab.headquarters))}</p><h2>${escapeHTML(lab.name)}</h2><div class="repo">${escapeHTML(origin)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(modes.map(mode => taxonomyName("model_distribution_modes", mode)).join(" · "))}</span>
    <p>${escapeHTML(lab.description)}</p>
    <div class="tags">${counts}</div>
    ${badgeRow(AtlasCore.cardBadges("lab", lab))}
    <div class="card-footer"><span>${newestDate ? `Newest reviewed release ${escapeHTML(newestDate)}` : ""}</span><button data-lab="${escapeHTML(lab.id)}">View details →</button></div>
  </article>`;
}

// A record a lab claims links to that lab, by its own collection's join rule.
function labLinksMarkup(kind, record) {
  const labs = AtlasCore.labsForRecord(kind, record, state.labIndex);
  if (!labs.length) return "";
  return `<p><strong>Lab:</strong> ${labs.map(lab => `<button type="button" class="link-button" data-open-lab="${escapeHTML(lab.id)}">${escapeHTML(lab.name)}</button>`).join(" · ")}</p>`;
}

function robotCard(robot, { mixed = false } = {}) {
  const formLabel = taxonomyName("robot_form_factors", robot.form_factor);
  return `<article class="project-card robot-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(robot)}<div><p class="family-label">${mixed ? "Robot · " : ""}${escapeHTML(formLabel)}</p><h2>${escapeHTML(robot.name)}</h2><div class="repo">${escapeHTML(robot.manufacturer)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(taxonomyName("robot_availability", robot.availability))}</span>
    <p>${escapeHTML(robot.description)}</p>
    <div class="card-footer"><span>${robot.status === "active" ? "Unscored" : escapeHTML(label(robot.status))}</span><button data-robot="${escapeHTML(robot.id)}">View details →</button></div>
  </article>`;
}

// Modality and family on a reviewed-model card come from models.dev, or from
// developer documentation for a model models.dev does not list yet, not from
// Atlas review, so they carry attributed plain text instead of badges.
function modelSourceMeta(model) {
  const parts = [modelModalityRoute(model), model.source_metadata.family].filter(Boolean);
  const attribution = AtlasCore.modelMetadataAttribution(model);
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
    ${badgeRow(AtlasCore.cardBadges("model", model))}
    <div class="card-footer"><span>${escapeHTML(model.source_id)}</span><button data-model="${escapeHTML(model.id)}">View source details →</button></div>
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
      ${badgeRow(AtlasCore.cardBadges("system", record))}
      <div class="card-footer"><span>${footerFacts(starCount(record), systemStatus(record))}</span><button data-project="${escapeHTML(record.id)}">View details →</button></div>
    </article>`;
}

function renderAllDirectoryEntries() {
  // The mixed directory searches five collections, so it reads five index
  // namespaces; each is absent until that collection's index lands, and the
  // filter falls back to the boot record for whichever is still missing.
  const entries = AtlasCore.filterDirectoryEntries(state.projects, state.inferenceServices, state.localRuntimes, state.models, {
    term: $("#all-directory-search").value,
    searchIndex: searchIndexes.systems,
    serviceSearchIndex: searchIndexes.inference,
    runtimeSearchIndex: searchIndexes.runtimes,
    modelSearchIndex: searchIndexes.models,
    packSearchIndex: searchIndexes.packs,
    robotSearchIndex: searchIndexes.robots,
  }, state.packs, state.robots);
  $("#all-directory-result-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · Scores hidden across collections`;
  const paged = AtlasCore.paginate(entries, { page: state.page.all, pageSize: state.pageSize });
  state.page.all = paged.page;
  $("#all-directory-grid").innerHTML = paged.items.map(({ kind, record }) => {
    if (kind === "model") {
      if (!isReviewedModel(record)) return importedModelCard(record, { mixed: true });
      return `<article class="project-card model-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Model release · ${escapeHTML(taxonomyName("model_types", record.model_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.developer)}</div></div></div></div>
        <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(record.source_model))}</span>${record.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
        <p>${escapeHTML(record.description)}</p>
        ${modelSourceMeta(record)}
        ${badgeRow(AtlasCore.cardBadges("model", record))}
        <div class="card-footer"><span>Dedicated model-access score</span><button data-model="${escapeHTML(record.id)}">View details →</button></div>
      </article>`;
    }
    if (kind === "pack") return packCard(record, { mixed: true });
    if (kind === "robot") return robotCard(record, { mixed: true });
    if (kind === "runtime") {
      return `<article class="project-card local-runtime-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Local runtime · ${escapeHTML(taxonomyName("local_runtime_types", record.runtime_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.maintainer)}</div></div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        ${badgeRow(AtlasCore.cardBadges("runtime", record))}
        <div class="card-footer"><span>${starCount(record)}</span><button data-local-runtime="${escapeHTML(record.id)}">View details →</button></div>
      </article>`;
    }
    if (kind === "inference") {
      return `<article class="project-card inference-service-card mixed-directory-card">
        <div class="card-top"><div class="card-identity">${cardMark(record)}<div><p class="family-label">Inference service · ${escapeHTML(taxonomyName("inference_service_types", record.service_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.operator)}</div></div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        ${badgeRow(AtlasCore.cardBadges("inference", record))}
        <div class="card-footer"><span>Dedicated service score</span><button data-inference-service="${escapeHTML(record.id)}">View details →</button></div>
      </article>`;
    }
    return mixedSystemCard(record);
  }).join("") || '<div class="notice">No systems, model releases, inference services, local runtimes, agent packs, or robots match this search.</div>';
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

function filteredProjects() {
  return AtlasCore.filterAndSortProjects(state.projects, {
    term: $("#project-search").value,
    searchIndex: searchIndexes.systems,
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
    localOnly: $("#local-filter").checked,
    sort: $("#sort-filter").value
  });
}

// One rendering path for every collection. Each entry supplies what actually
// differs — where its records come from, how its cards look, which dialog a
// card opens — and renderCollection owns the shape they all shared: filter,
// count, paginate, paint, bind, page. A fifth collection is a new entry here,
// not a fifth near-identical function.
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
      // Scores are never comparable across families, so the compare control
      // only exists once a family narrows the grid to one score profile.
      return { family, suffix, comparable: Boolean(family) };
    },
    records: () => filteredProjects(),
    card: (project, { family }) => {

    const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${project.score.overall} out of 10">${project.score.overall}</div>` : "";
    // Only this grid sorts by stars, so only its cards explain a missing count.
    const githubSignal = project.stars == null ? "No GitHub metrics" : starCount(project);
    return `<article class="project-card ${escapeHTML(project.system_family)}">
      <div class="card-top"><div class="card-identity">${cardMark(project)}<div><p class="family-label">${escapeHTML(familyName(project.system_family))}</p><h2>${escapeHTML(project.name)}</h2><div class="repo">${escapeHTML(projectLocation(project))}</div></div></div>${score}</div>
      <span class="role-badge">${escapeHTML(roleName(project.primary_role))}</span>
      <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(project.source_model))}</span>${project.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}${project.license_review_status === "review_required" ? '<span class="review-badge">Evidence review</span>' : ""}</div>
      <p>${escapeHTML(project.description)}</p>
      ${badgeRow(AtlasCore.cardBadges("system", project))}
      <div class="card-footer"><span>${footerFacts(githubSignal, systemStatus(project))}</span><div class="card-actions">${family ? `<button class="compare-toggle" data-compare-kind="system" data-compare-id="${escapeHTML(project.id)}" aria-label="Add ${escapeHTML(project.name)} to comparison" aria-pressed="false">Compare</button>` : ""}<button data-project="${escapeHTML(project.id)}">View details →</button></div></div>
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
    records: () => AtlasCore.filterSpecifications(state.specifications, {
      term: $("#specification-search").value,
      searchIndex: searchIndexes.specifications,
      type: $("#specification-type-filter").value,
      scope: $("#specification-scope-filter").value,
      status: $("#specification-status-filter").value,
      license: $("#specification-license-filter").value,
    }),
    card: specification => {

    const version = specification.current_version ? `Version ${specification.current_version}` : taxonomyName("specification_statuses", specification.status);
    return `<article class="project-card specification-card">
      <div class="card-top"><div><p class="family-label">${escapeHTML(taxonomyName("specification_types", specification.specification_type))}</p><h2>${escapeHTML(specification.short_name)}</h2><div class="repo">${escapeHTML(specification.repo || new URL(specification.url).hostname)}</div></div><span class="status-badge">${escapeHTML(version)}</span></div>
      <span class="role-badge">${escapeHTML(taxonomyName("specification_scopes", specification.scope))}</span>
      <div class="license-row">${specification.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
      <p>${escapeHTML(specification.description)}</p>
      <div class="tags"><span>${escapeHTML(taxonomyName("specification_statuses", specification.status))}</span><span>${escapeHTML(specification.stewards[0])}</span></div>
      ${badgeRow(AtlasCore.cardBadges("spec", specification))}
      <div class="card-footer"><span>${footerFacts(starCount(specification), "No editorial score")}</span><button data-specification="${escapeHTML(specification.id)}">View details →</button></div>
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
    records: () => AtlasCore.filterLabs(state.labs, {
      term: $("#lab-search").value,
      searchIndex: searchIndexes.labs,
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
    records: () => AtlasCore.filterInferenceServices(state.inferenceServices, {
      term: $("#inference-search").value,
      searchIndex: searchIndexes.inference,
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
    ${badgeRow(AtlasCore.cardBadges("inference", service))}
    <div class="card-footer"><span>${escapeHTML(service.model_sources.map(item => taxonomyName("inference_model_sources", item)).join(" · "))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="inference" data-compare-id="${escapeHTML(service.id)}" aria-label="Add ${escapeHTML(service.name)} to comparison" aria-pressed="false">Compare</button><button data-inference-service="${escapeHTML(service.id)}">View details →</button></div></div>
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
    records: () => AtlasCore.filterLocalRuntimes(state.localRuntimes, {
      term: $("#runtime-search").value,
      searchIndex: searchIndexes.runtimes,
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
    ${badgeRow(AtlasCore.cardBadges("runtime", runtime))}
    <div class="card-footer"><span>${footerFacts(starCount(runtime), escapeHTML(runtime.model_formats.map(item => taxonomyName("runtime_model_formats", item)).join(" · ")))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="runtime" data-compare-id="${escapeHTML(runtime.id)}" aria-label="Add ${escapeHTML(runtime.name)} to comparison" aria-pressed="false">Compare</button><button data-local-runtime="${escapeHTML(runtime.id)}">View details →</button></div></div>
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
      $("#models-kicker").textContent = AtlasCore.modelsKickerText(state.modelSourceCount, state.reviewedModelCount, state.modelUnlistedCount);
      return { suffix: ` · ${state.reviewedModelCount} Atlas reviewed; source imports are unscored`, comparable: true };
    },
    records: () => AtlasCore.filterModels(state.models, {
      term: $("#model-search").value,
      type: $("#model-type-filter").value,
      distribution: $("#model-distribution-filter").value,
      modality: $("#model-modality-filter").value,
      sourceModel: $("#model-source-filter").value,
      license: $("#model-license-filter").value,
      sort: $("#model-sort-filter").value,
      searchIndex: searchIndexes.models,
      ids: labModelIds($("#model-lab-filter").value),
    }),
    card: model => {
      if (!isReviewedModel(model)) return importedModelCard(model);
      return `<article class="project-card model-card">
        <div class="card-top"><div class="card-identity">${cardMark(model)}<div><p class="family-label">${escapeHTML(taxonomyName("model_types", model.model_type))}</p><h2>${escapeHTML(model.name)}</h2><div class="repo">${escapeHTML(model.developer)}</div></div></div><div class="score-ring" aria-label="Model-access score ${escapeHTML(model.score.overall)} out of 10">${escapeHTML(model.score.overall)}</div></div>
        <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(model.source_model))}</span>${model.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
        <p>${escapeHTML(model.description)}</p>
        ${modelSourceMeta(model)}
        ${badgeRow(AtlasCore.cardBadges("model", model))}
        <div class="card-footer"><span>${escapeHTML(AtlasCore.modelSourceLabel(model))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="model" data-compare-id="${escapeHTML(model.id)}" aria-label="Add ${escapeHTML(model.name)} to comparison" aria-pressed="false">Compare</button><button data-model="${escapeHTML(model.id)}">View details →</button></div></div>
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
    records: () => AtlasCore.filterRobots(state.robots, {
      term: $("#robot-search").value,
      searchIndex: searchIndexes.robots,
      formFactor: $("#robot-form-factor-filter").value,
      aiBasis: $("#robot-ai-basis-filter").value,
      availability: $("#robot-availability-filter").value,
      status: $("#robot-status-filter").value,
    }),
    card: robot => robotCard(robot),
  },
};

// dataset keys are camelCase; the matching attribute is kebab-case.
const datasetAttribute = key => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;

function renderCollection(name) {
  const collection = COLLECTIONS[name];
  const context = collection.context();
  const records = collection.records(context);
  const noun = collection.noun[records.length === 1 ? 0 : 1];
  $(collection.resultCount).textContent = `${records.length} ${noun}${context.suffix}`;
  const paged = AtlasCore.paginate(records, { page: state.page[collection.pageKey], pageSize: state.pageSize });
  state.page[collection.pageKey] = paged.page;
  const grid = $(collection.grid);
  grid.innerHTML = paged.items.map(record => collection.card(record, context)).join("")
    || `<div class="notice">${collection.empty}</div>`;
  $$(`[${datasetAttribute(collection.dataset)}]`, grid).forEach(button =>
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
function renderPacks() {
  const term = $("#pack-search").value;
  const packs = AtlasCore.filterPacks(state.packs, {
    term,
    searchIndex: searchIndexes.packs,
    type: $("#pack-type-filter").value,
    host: $("#pack-host-filter").value,
    install: $("#pack-install-filter").value,
    license: $("#pack-license-filter").value,
  });
  const systems = AtlasCore.packShapedSystems(state.projects, {
    term,
    searchIndex: searchIndexes.systems,
  });
  const entries = AtlasCore.mergePackScopeEntries(packs, systems);
  const packNoun = packs.length === 1 ? "pack" : "packs";
  const systemNoun = systems.length === 1 ? "installed system" : "installed systems";
  $("#pack-result-count").textContent = `${packs.length} ${packNoun} · ${systems.length} ${systemNoun} · Scores hidden`;
  const paged = AtlasCore.paginate(entries, { page: state.page.packs, pageSize: state.pageSize });
  state.page.packs = paged.page;
  const grid = $("#pack-grid");
  grid.innerHTML = paged.items.map(({ kind, record }) =>
    kind === "pack" ? packCard(record) : mixedSystemCard(record)).join("")
    || '<div class="notice">No agent packs match these filters.</div>';
  $$('[data-pack]', grid).forEach(button => button.addEventListener("click", () => openPack(button.dataset.pack)));
  $$('[data-project]', grid).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  paintMarks(grid);
  hideDetachedBadgeTooltip();
  renderPager("packs", paged);
  if (activeScope() === "packs") writeScopeURL();
}

// Repaint whatever a search index could have widened. A search box may have a
// term in it already when its index lands, so this runs for the collection on
// screen and for specifications, which live on their own view.
function renderSearchSurfaces() {
  const renderers = {
    all: renderAllDirectoryEntries, systems: renderProjects,
    inference: renderInferenceServices, runtimes: renderLocalRuntimes,
    packs: renderPacks, robots: () => renderCollection("robots"),
  };
  renderers[state.directoryCollection]?.();
  // Specifications, Models, and Labs are sibling views rather than directory
  // collections, so none is in the map above and each repaints every time.
  renderSpecifications();
  renderModels();
  renderLabs();
  if (state.directoryRoles) renderFinder();
}

function bindComparisonButtons(root) {
  $$('[data-compare-kind]', root).forEach(button => button.addEventListener("click", () => {
    toggleComparison(button.dataset.compareKind, button.dataset.compareId);
  }));
}

function finderChoice(key, item) {
  return `<button class="finder-choice" data-finder-choice="${escapeHTML(key)}" data-finder-value="${escapeHTML(item.id)}">
    <span class="finder-choice-cue">${escapeHTML(item.cue || "Choose this")}</span>
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
      <div class="finder-choice-grid direction-grid">${FINDER_DIRECTIONS.map(item => finderChoice("direction", item)).join("")}</div>`;
  } else if (step === 1) {
    const choices = FINDER_GOALS[answers.direction];
    content = `<div class="finder-question"><p class="eyebrow">${escapeHTML(finderDirectionName(answers.direction))}</p><h2>Choose the closest job.</h2><p>You can broaden the directory afterward.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("goal", item)).join("")}</div>`;
  } else if (step === 2) {
    // The shortlist's candidates are known once the goal is: fetch their detail
    // now, while the priority question is on screen.
    ensureFinderDetail();
    const choices = FINDER_PRIORITIES[answers.direction];
    content = `<div class="finder-question"><p class="eyebrow">Final tradeoff</p><h2>What matters most?</h2><p>This adjusts ranking only within the selected score profile.</p></div>
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

// A boot record carries only its overall score, so every other dimension this
// weighting reads may still be in flight. One undefined turns the whole match
// into NaN and the shortlist's order into whatever the sort happened to do, so
// a dimension that has not arrived counts as zero — the ordering stays
// deterministic, the same way recommendationReasons below stays readable.
const scoreDimension = (project, name) => project.score?.[name] ?? 0;

function priorityBoost(project, priority) {
  const dimension = name => scoreDimension(project, name);
  if (project.score_profile === "inference_service") {
    if (priority === "governance") return dimension("data_governance") / 2;
    if (priority === "regions") return dimension("regional_deployment_control") / 2;
    if (priority === "portable") return dimension("api_interoperability") / 2 + dimension("serving_flexibility") / 4;
    if (priority === "resilience") return dimension("traffic_resilience") / 2 + dimension("operational_maturity") / 4;
    return dimension("overall") / 3;
  }
  if (project.score_profile === "local_runtime") {
    if (priority === "hardware") return dimension("hardware_accelerator_coverage") / 2;
    if (priority === "formats") return dimension("model_format_support") / 2;
    if (priority === "serving") return dimension("serving_concurrency") / 2 + dimension("api_interoperability") / 4;
    if (priority === "operability") return dimension("deployment_operations") / 2 + dimension("observability_control") / 4;
    return dimension("overall") / 3;
  }
  if (project.system_family === "memory_system") {
    if (priority === "local_editable") return (project.local_first ? 2.2 : 0) + (project.human_editable ? 2 : 0) + (project.architectures.includes("plain_files") ? 0.8 : 0);
    if (priority === "local_control") return (project.local_first ? 3 : 0) + (project.deployment.includes("self_hosted") ? 0.8 : 0) + dimension("data_sovereignty") / 10;
    if (priority === "easy") return dimension("operational_simplicity") / 2;
    if (priority === "portable") return dimension("interoperability") / 1.8 + (project.architectures.includes("plain_files") ? 0.6 : 0);
    return dimension("overall") / 3;
  }
  if (project.system_family === "agent_system") {
    if (priority === "direct_use") return project.agent_interfaces.some(item => ["terminal", "ide", "web_app"].includes(item)) ? 3 : 0;
    if (priority === "developer") return project.agent_interfaces.some(item => ["library", "api_sdk"].includes(item)) ? 3 : 0;
    if (priority === "local") return (project.local_first ? 3 : 0) + ((project.execution_boundaries || []).includes("host") ? 1 : 0) + dimension("data_sovereignty") / 10;
    if (priority === "control") return dimension("human_control") / 3 + dimension("observability_recovery") / 4;
    return dimension("overall") / 3;
  }
  if (priority === "tools") return dimension("tools_integrations") / 2;
  if (priority === "continuity") return dimension("context_continuity") / 2;
  if (priority === "governance") return dimension("data_governance") / 3 + dimension("human_control") / 4;
  if (priority === "portable") return dimension("interoperability") / 1.8;
  return dimension("overall") / 3;
}

// A reason chip quotes a score dimension, which only a detail file carries. It
// cannot throw, but it can print "Simplicity undefined/10" at a reader when a
// detail file never arrived, so every dimension here falls back to an em dash.
function recommendationReasons(project, priority) {
  if (project.score_profile === "local_runtime") {
    const reasons = [taxonomyName("local_runtime_types", project.runtime_type)];
    if (priority === "hardware") reasons.push(`Accelerator coverage ${project.score.hardware_accelerator_coverage ?? "—"}/10`);
    if (priority === "formats") reasons.push(`Model formats ${project.score.model_format_support ?? "—"}/10`);
    if (priority === "serving") reasons.push(`Serving ${project.score.serving_concurrency ?? "—"}/10`);
    if (priority === "operability") reasons.push(`Deployment ${project.score.deployment_operations ?? "—"}/10`, `Observability ${project.score.observability_control ?? "—"}/10`);
    reasons.push(...project.accelerators.slice(0, 2).map(item => taxonomyName("runtime_accelerators", item)));
    return [...new Set(reasons)].slice(0, 4);
  }
  if (project.score_profile === "inference_service") {
    const reasons = [taxonomyName("inference_service_types", project.service_type)];
    if (priority === "governance") reasons.push(`Data governance ${project.score.data_governance ?? "—"}/10`);
    if (priority === "regions") reasons.push(`Regional control ${project.score.regional_deployment_control ?? "—"}/10`);
    if (priority === "portable") reasons.push(`API interoperability ${project.score.api_interoperability ?? "—"}/10`, `Serving flexibility ${project.score.serving_flexibility ?? "—"}/10`);
    if (priority === "resilience") reasons.push(`Traffic resilience ${project.score.traffic_resilience ?? "—"}/10`);
    reasons.push(...project.delivery_modes.slice(0, 2).map(item => taxonomyName("inference_delivery_modes", item)));
    return [...new Set(reasons)].slice(0, 4);
  }
  const reasons = [roleName(project.primary_role)];
  if (project.local_first) reasons.push("Local-first");
  if (project.system_family === "memory_system") {
    if (project.human_editable) reasons.push("Human-editable data");
    if (priority === "easy") reasons.push(`Simplicity ${project.score.operational_simplicity ?? "—"}/10`);
    if (priority === "portable") reasons.push(`Interoperability ${project.score.interoperability ?? "—"}/10`);
  } else if (project.system_family === "agent_system") {
    const interfaces = project.agent_interfaces.slice(0, 2).map(item => taxonomyName("agent_interfaces", item));
    reasons.push(...interfaces);
    if (priority === "control") reasons.push(`Human control ${project.score.human_control ?? "—"}/10`);
  } else {
    if (priority === "tools") reasons.push(`Tools & integrations ${project.score.tools_integrations ?? "—"}/10`);
    if (priority === "continuity") reasons.push(`Context continuity ${project.score.context_continuity ?? "—"}/10`);
    if (priority === "governance") reasons.push(`Data governance ${project.score.data_governance ?? "—"}/10`);
    if (priority === "portable") reasons.push(`Interoperability ${project.score.interoperability ?? "—"}/10`);
  }
  return [...new Set(reasons)].slice(0, 4);
}

// The shortlist is the one surface that reads detail for records nobody has
// opened: it ranks on the full score dimensions and quotes a tradeoff, and
// boot carries neither. So a direction and a goal name a bounded candidate set
// — one goal's classifications, a few dozen records at most — and that set is
// hydrated before results paint. The fetches start when the goal is chosen, so
// the priority question usually covers the wait.
const FINDER_DETAIL_KINDS = { inference_service: "inference", local_runtime: "runtime" };
const finderDetailAwaited = new Set();

function finderCandidates() {
  const { direction, goal } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction]?.find(item => item.id === goal);
  if (!goalConfig) return [];
  const records = direction === "inference_service" ? state.inferenceServices
    : direction === "local_runtime" ? state.localRuntimes : state.projects;
  return records.filter(project => {
    if (direction === "inference_service") return goalConfig.serviceTypes.includes(project.service_type);
    if (direction === "local_runtime") return goalConfig.runtimeTypes.includes(project.runtime_type);
    return project.status === "active" && project.system_family === direction && goalConfig.roles.includes(project.primary_role);
  });
}

// Null once this goal's candidates have been waited on, so a detail file that
// never arrives costs one wait and then a shortlist built from what landed —
// never an endless retry.
function ensureFinderDetail() {
  const { direction, goal } = state.finder.answers;
  const key = `${direction}:${goal}`;
  if (finderDetailAwaited.has(key)) return null;
  const kind = FINDER_DETAIL_KINDS[direction] || "system";
  const pending = finderCandidates().map(record => loadDetail(kind, record)).filter(Boolean);
  if (!pending.length) {
    finderDetailAwaited.add(key);
    return null;
  }
  return Promise.all(pending).then(() => { finderDetailAwaited.add(key); });
}

function recommendedFinderRecords() {
  const { direction, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction].find(item => item.id === goal);
  return finderCandidates()
    .map(project => {
      const classificationIndex = direction === "inference_service" ? goalConfig.serviceTypes.indexOf(project.service_type)
        : direction === "local_runtime" ? goalConfig.runtimeTypes.indexOf(project.runtime_type)
        : goalConfig.roles.indexOf(project.primary_role);
      const match = 6 - classificationIndex * 0.4 + project.score.overall * 0.2 + priorityBoost(project, priority);
      return { project, match, reasons: recommendationReasons(project, priority) };
    })
    .sort((a, b) => b.match - a.match || b.project.score.overall - a.project.score.overall || a.project.name.localeCompare(b.project.name))
    .slice(0, 3);
}

function renderFinderResults() {
  const { direction, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction].find(item => item.id === goal);
  const priorityConfig = FINDER_PRIORITIES[direction].find(item => item.id === priority);
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
      ${badgeRow(AtlasCore.cardBadges(isInference ? "inference" : isRuntime ? "runtime" : "system", project))}
      <div class="finder-result-footer"><span>${footerFacts(`${escapeHTML(project.score.overall)} / 10 ${escapeHTML(profileLabel || project.score_profile)} score`, starCount(project))}</span><button ${detailAttribute}="${escapeHTML(project.id)}">View details →</button></div>
    </article>`).join("")}</div>
    <p class="finder-disclaimer">A curated starting point—not a benchmark of your workload.</p>`;
}

function applyFinderToDirectory() {
  const { direction, goal } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction].find(item => item.id === goal);
  clearComparison();
  if (direction === "local_runtime") {
    $("#runtime-search").value = "";
    $("#runtime-type-filter").value = goalConfig.runtimeTypes[0];
    $("#runtime-accelerator-filter").value = "";
    $("#runtime-format-filter").value = "";
    $("#runtime-api-filter").value = "";
    $("#runtime-sort-filter").value = "score";
    setDirectoryCollection("runtimes");
    activateView("directory");
    return;
  }
  if (direction === "inference_service") {
    $("#inference-search").value = "";
    $("#inference-type-filter").value = goalConfig.serviceTypes[0];
    $("#inference-delivery-filter").value = "";
    $("#inference-model-source-filter").value = "";
    $("#inference-api-filter").value = "";
    $("#inference-sort-filter").value = "score";
    setDirectoryCollection("inference");
    activateView("directory");
    return;
  }
  $("#project-search").value = "";
  $("#family-filter").value = direction;
  populateRoleFilter();
  state.directoryRoles = goalConfig.roles.length > 1 ? [...goalConfig.roles] : null;
  $("#role-filter").value = goalConfig.roles.length === 1 ? goalConfig.roles[0] : "";
  $("#agent-filter").value = "";
  $("#architecture-filter").value = "";
  $("#deployment-filter").value = "";
  $("#agent-interface-filter").value = "";
  $("#source-model-filter").value = "";
  $("#license-filter").value = "";
  $("#status-filter").value = "active";
  $("#local-filter").checked = false;
  $("#sort-filter").value = "score";
  updateScoreSortAvailability();
  setDirectoryCollection("systems");
  activateView("directory");
}

function renderTaxonomy() {
  const roleGroups = state.taxonomy.system_families.map(family => [
    `${family.name} roles`,
    state.taxonomy.primary_roles.filter(item => item.family === family.id),
  ]);
  const glossary = AtlasCore.cardBadgeGlossary();
  const badgeGroups = Object.entries(AtlasCore.BADGE_FAMILIES).map(([id, family]) => [
    `Card badges · ${family.name}`,
    glossary.filter(entry => entry.family === id).map(entry => ({
      name: entry.name,
      definition: `${entry.definition} Shown on: ${entry.scopes.join(", ")}.`,
      emblem: AtlasCore.badgeEmblem(entry.id),
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
      <section class="detail-block"><h3>${escapeHTML(scoreProfileName(project.score_profile))}</h3><table class="score-table">${dimensions.map(([name, value]) => `<tr><td>${escapeHTML(label(name))}</td><td>${escapeHTML(value)}</td></tr>`).join("")}<tr><td><strong>Overall</strong></td><td>${project.score.overall}</td></tr></table></section>
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
// and every filter falls back to the boot record until it lands.
const searchIndexes = {};
const searchIndexRequests = {};

function loadSearchIndex(collection) {
  if (searchIndexes[collection]) return null;
  if (!searchIndexRequests[collection]) {
    searchIndexRequests[collection] = loadJSON(`app/search/${collection}.json`)
      .then(index => { searchIndexes[collection] = index; })
      .catch(() => { delete searchIndexRequests[collection]; });
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
  const attribution = AtlasCore.modelMetadataAttribution(model);
  const openWeightsLabel = attribution.listed ? "Open weights reported" : "Open weights";
  const licenseLabel = attribution.listed ? "License reported" : "License named by the developer";
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${detailScore(model.score[dimension.id])}</td></tr>`).join("");
  return `<p class="eyebrow">${escapeHTML(taxonomyName("model_types", model.model_type))} · ${escapeHTML(profile.name)} ${escapeHTML(model.score.overall)}</p><h1>${escapeHTML(model.name)}</h1><p>${escapeHTML(model.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Model identity</h3><p><strong>Developer:</strong> ${escapeHTML(model.developer)}</p>${labLinksMarkup("model", model)}<p>${attribution.listed ? `<strong>models.dev ID:</strong> ${escapeHTML(model.source_id)}` : escapeHTML(AtlasCore.UNLISTED_MODEL_LABEL)}</p><p><strong>Distribution:</strong> ${escapeHTML(model.distribution_modes.map(item => taxonomyName("model_distribution_modes", item)).join(" · "))}</p><p>${model.url ? `<a href="${escapeHTML(model.url)}" target="_blank" rel="noreferrer">Open official model page ↗</a>` : "—"}</p></section>
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
  const releases = AtlasCore.releasesNewestFirst(relations.models);
  const modes = AtlasCore.labDistributionModes(relations.models, labDistributionOrder());
  const modeCounts = modes.map(mode => `${escapeHTML(taxonomyName("model_distribution_modes", mode))}: ${relations.models.filter(model => (model.distribution_modes || []).includes(mode)).length}`).join(" · ");
  const recent = releases.slice(0, LAB_RECENT_RELEASES).map(model => `<li><button type="button" class="link-button" data-open-model="${escapeHTML(model.id)}">${escapeHTML(model.name)}</button><span class="evidence-date">${escapeHTML(AtlasCore.releaseDate(model) || "release date not reported")}</span></li>`).join("");
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
  return `<p class="eyebrow">Lab · ${escapeHTML(taxonomyName("lab_types", lab.lab_type))} · Unscored</p><h1>${escapeHTML(lab.name)}</h1><p>${escapeHTML(lab.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Organization</h3><p><strong>Type:</strong> ${escapeHTML(taxonomyName("lab_types", lab.lab_type))}</p><p><strong>Headquarters:</strong> ${escapeHTML(taxonomyName("countries", lab.headquarters))}</p>${lab.parent_organization ? `<p><strong>Parent organization:</strong> ${escapeHTML(lab.parent_organization)}</p>` : ""}<p><strong>Named in the catalog as:</strong> ${escapeHTML(lab.catalog_names.join(" · "))}</p><p><a href="${escapeHTML(lab.url)}" target="_blank" rel="noreferrer">Open official site ↗</a></p></section>
      <section class="detail-block"><h3>How it is organized</h3><p>${detailText(lab.organization_note)}</p></section>
      <section class="detail-block"><h3>Reviewed model releases · ${relations.models.length}</h3><p>${modeCounts}</p><ul class="lab-release-list">${recent}</ul>${pending}<p><button type="button" class="ghost-button" data-browse-lab-models="${escapeHTML(lab.id)}">Browse all ${total} in Models →</button></p></section>
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
  activateView("models");
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
      $$('[data-open-spec]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#pack-dialog").close(); openSpecification(button.dataset.openSpec); activateView("specifications"); }));
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

function showRecordDialog(selector, kind, id) {
  const dialog = $(selector);
  dialog.dataset.recordKind = kind;
  dialog.dataset.recordId = id;
  writeRecordURL(kind, id);
  if (!dialog.open) dialog.showModal();
}

function writeRecordURL(kind, id) {
  const url = new URL(window.location.href);
  const reference = `${kind}:${id}`;
  if (url.searchParams.get("record") === reference) return;
  url.searchParams.set("record", reference);
  window.history.pushState(null, "", url);
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
  window.history.replaceState(null, "", url);
}

function closeRecordDialogs() {
  RECORD_DIALOG_SELECTORS.forEach(selector => { if ($(selector).open) $(selector).close(); });
}

function restoreRecordFromURL() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("record");
  if (raw === null) return;
  const reference = AtlasCore.parseRecordReference(raw);
  if (reference && openRecord(reference.kind, reference.id)) {
    if (reference.kind === "spec") activateView("specifications");
    if (reference.kind === "model") activateView("models");
    if (reference.kind === "lab") activateView("labs");
    return;
  }
  url.searchParams.delete("record");
  window.history.replaceState(null, "", url);
}

// Back and forward move between record states only: collection and comparison
// changes replace the current entry, so a popstate is always a record change.
function syncRecordWithHistory() {
  const reference = AtlasCore.parseRecordReference(new URL(window.location.href).searchParams.get("record"));
  if (reference && openRecord(reference.kind, reference.id)) return;
  closeRecordDialogs();
  clearRecordURL();
}

// The share link is the record's static preview page, which carries its own
// title, description, and card metadata; the address bar stays on the app URL.
async function copyRecordLink(button) {
  const status = button.parentElement.querySelector("[data-record-link-status]");
  const dialog = button.closest("dialog");
  const url = new URL(AtlasCore.shareRecordPath(dialog.dataset.recordKind, dialog.dataset.recordId), window.location.href).href;
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
  if (id === "directory") url.searchParams.delete("view");
  else url.searchParams.set("view", id);
  window.history.replaceState(null, "", url);
}

function restoreViewFromURL() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("view");
  if (raw === null) return;
  const id = AtlasCore.parseViewId(raw);
  if (id) {
    activateView(id);
    return;
  }
  url.searchParams.delete("view");
  window.history.replaceState(null, "", url);
}

function activateView(id) {
  if (id === "inference-services" || id === "local-runtimes" || id === "agent-packs" || id === "robots") {
    setDirectoryCollection(id === "inference-services" ? "inference" : id === "local-runtimes" ? "runtimes" : id === "agent-packs" ? "packs" : "robots");
    id = "directory";
  }
  const comparisonFitsView = (id === "models" && state.comparison.kind === "model")
    || (id === "directory" && (
      (state.directoryCollection === "systems" && state.comparison.kind === "system")
      || (state.directoryCollection === "inference" && state.comparison.kind === "inference")
      || (state.directoryCollection === "runtimes" && state.comparison.kind === "runtime")
    ));
  if ((id === "directory" || id === "models") && state.comparison.ids.length && !comparisonFitsView) {
    clearComparison();
  }
  $$(".tab").forEach(item => item.classList.toggle("is-active", item.dataset.tab === id));
  $$(".view").forEach(view => view.classList.toggle("is-active", view.id === id));
  if (id === "directory" || id === "models") renderComparisonControls();
  else $("#comparison-tray").hidden = true;
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
};

function bindEvents() {
  $$(".tab").forEach(button => button.addEventListener("click", () => activateView(button.dataset.tab)));
  $$('[data-open-tab]').forEach(button => button.addEventListener("click", () => activateView(button.dataset.openTab)));
  $$('[data-directory-collection]').forEach(button => button.addEventListener("click", () => {
    const family = button.dataset.directoryFamily;
    if (family !== undefined) jumpToDirectoryFamily(family);
    else setDirectoryCollection(button.dataset.directoryCollection);
  }));
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
  $("#family-filter").addEventListener("input", () => {
    clearComparison();
    state.directoryRoles = null;
    $("#role-filter").value = "";
    populateRoleFilter();
    updateScoreSortAvailability();
    syncCollectionSwitcher();
    state.page.systems = 1;
    renderProjects();
    syncBadgeLegend();
  });
  $("#role-filter").addEventListener("input", () => { state.directoryRoles = null; state.page.systems = 1; renderProjects(); });
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
    state.page.systems = 1;
    renderProjects();
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
      return;
    }
    if (event.target.closest("[data-finder-back]")) {
      state.finder.step = Math.max(0, state.finder.step - 1);
      if (state.finder.step < 2) delete state.finder.answers.priority;
      if (state.finder.step < 1) delete state.finder.answers.goal;
      renderFinder();
      return;
    }
    if (event.target.closest("[data-finder-reset]")) {
      state.finder = { step: 0, answers: {} };
      renderFinder();
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
  window.addEventListener("popstate", syncRecordWithHistory);
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
  $("#theme-toggle")?.addEventListener("click", () => applyThemePreference(AtlasCore.cycleThemePreference(readThemePreference())));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
}

bindTheme();
bootstrap().catch(error => {
  document.body.innerHTML = `<main><div class="notice">peacefulcoexistance failed to load: ${escapeHTML(error.message)}</div></main>`;
});
