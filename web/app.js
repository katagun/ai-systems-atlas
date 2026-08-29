const state = {
  projects: [], specifications: [], inferenceServices: [], localRuntimes: [], taxonomy: null, licenses: new Map(),
  directoryCollection: "all", directoryRoles: null,
  comparison: { kind: null, profile: null, ids: [], limitReached: false },
  finder: { step: 0, answers: {} },
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const compactNumber = value => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const label = value => String(value || "")
  .replaceAll("_", " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())
  .replace(/\bApi\b/g, "API")
  .replace(/\bAi\b/g, "AI");
const projectLocation = project => project.repo || new URL(project.url).hostname.replace(/^www\./, "");

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

async function loadJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function bootstrap() {
  const [directory, taxonomy, licenseEvidence, specificationDirectory, inferenceDirectory, runtimeDirectory] = await Promise.all([
    loadJSON("projects.json"), loadJSON("taxonomy.json"), loadJSON("license-evidence.json"),
    loadJSON("specifications.json"), loadJSON("inference-services.json"), loadJSON("local-runtimes.json")
  ]);
  state.projects = directory.projects;
  state.specifications = specificationDirectory.specifications;
  state.inferenceServices = inferenceDirectory.services;
  state.localRuntimes = runtimeDirectory.runtimes;
  state.taxonomy = taxonomy;
  state.licenses = new Map(licenseEvidence.entries.map(item => [item.project_id, item]));
  const dataDate = [directory.generated_at, specificationDirectory.verified_at, inferenceDirectory.verified_at, runtimeDirectory.verified_at]
    .filter(Boolean)
    .sort()
    .at(-1);
  $("#data-date").textContent = `Data updated ${dataDate}`;
  populateFilters();
  populateSpecificationFilters();
  populateInferenceServiceFilters();
  populateLocalRuntimeFilters();
  renderStats();
  renderFinder();
  renderSpecifications();
  renderTaxonomy();
  bindEvents();
  if (!restoreComparisonFromURL()) {
    setDirectoryCollection(new URL(window.location.href).searchParams.get("collection") || "all", { updateURL: false });
  }
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

// A Map, not an object literal: the comparison kind comes from the URL, and a
// plain-object lookup would resolve inherited names such as "constructor" or
// "hasOwnProperty" and dispatch to an unexpected target.
const COMPARISON_COLLECTIONS = new Map([
  ["system", () => state.projects],
  ["inference", () => state.inferenceServices],
  ["runtime", () => state.localRuntimes],
]);

function comparisonCollection(kind) {
  return COMPARISON_COLLECTIONS.get(kind)?.() || null;
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
  if (separator < 1 || referencedIds.length > 4 || records.length !== ids.length || !records.length || profiles.size !== 1) {
    url.searchParams.delete("compare");
    window.history.replaceState(null, "", url);
    return false;
  }
  const profile = [...profiles][0];
  state.comparison = { kind, profile, ids, limitReached: false };
  if (kind === "system") {
    state.directoryRoles = null;
    $("#family-filter").value = records[0].system_family;
    $("#role-filter").value = "";
    populateRoleFilter();
    updateScoreSortAvailability();
    setDirectoryCollection("systems", { updateURL: false });
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

function populateSpecificationFilters() {
  const published = {
    specification_types: new Set(state.specifications.map(item => item.specification_type)),
    specification_scopes: new Set(state.specifications.map(item => item.scope)),
    specification_statuses: new Set(state.specifications.map(item => item.status)),
  };
  for (const [group, selector] of [
    ["specification_types", "#specification-type-filter"],
    ["specification_scopes", "#specification-scope-filter"],
    ["specification_statuses", "#specification-status-filter"],
  ]) {
    state.taxonomy[group].filter(item => published[group].has(item.id)).forEach(item =>
      $(selector).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`)
    );
  }
  const licenses = new Set(state.specifications.flatMap(item => item.licenses));
  state.taxonomy.licenses.filter(item => licenses.has(item.id)).forEach(item =>
    $("#specification-license-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.id)} — ${escapeHTML(item.name)}</option>`)
  );
}

function populateInferenceServiceFilters() {
  const groups = {
    inference_service_types: new Set(state.inferenceServices.map(item => item.service_type)),
    inference_delivery_modes: new Set(state.inferenceServices.flatMap(item => item.delivery_modes)),
    inference_model_sources: new Set(state.inferenceServices.flatMap(item => item.model_sources)),
    inference_api_styles: new Set(state.inferenceServices.flatMap(item => item.api_styles)),
  };
  for (const [group, selector] of [
    ["inference_service_types", "#inference-type-filter"],
    ["inference_delivery_modes", "#inference-delivery-filter"],
    ["inference_model_sources", "#inference-model-source-filter"],
    ["inference_api_styles", "#inference-api-filter"],
  ]) {
    state.taxonomy[group]
      .filter(item => groups[group].has(item.id))
      .forEach(item => $(selector).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  }
}

function populateLocalRuntimeFilters() {
  const groups = {
    local_runtime_types: new Set(state.localRuntimes.map(item => item.runtime_type)),
    runtime_accelerators: new Set(state.localRuntimes.flatMap(item => item.accelerators)),
    runtime_model_formats: new Set(state.localRuntimes.flatMap(item => item.model_formats)),
    inference_api_styles: new Set(state.localRuntimes.flatMap(item => item.api_styles)),
  };
  for (const [group, selector] of [
    ["local_runtime_types", "#runtime-type-filter"],
    ["runtime_accelerators", "#runtime-accelerator-filter"],
    ["runtime_model_formats", "#runtime-format-filter"],
    ["inference_api_styles", "#runtime-api-filter"],
  ]) {
    state.taxonomy[group]
      .filter(item => groups[group].has(item.id))
      .forEach(item => $(selector).insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
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
  $("#status-filter").value = defaults.status;
  $("#sort-filter").value = defaults.sort;
  $("#local-filter").checked = defaults.localOnly;
  updateScoreSortAvailability();
}

function renderStats() {
  const memories = state.projects.filter(project => project.system_family === "memory_system").length;
  const agents = state.projects.filter(project => project.system_family === "agent_system").length;
  const assistants = state.projects.filter(project => project.system_family === "assistant_system").length;
  const total = state.projects.length + state.inferenceServices.length + state.localRuntimes.length;
  $("#hero-kicker").textContent = `${total} reviewed systems, services, and runtimes`;
  $("#hero-stats").innerHTML = [
    [memories, "memory"], [agents, "agents"], [assistants, "assistants"],
    [state.inferenceServices.length, "inference services"], [state.localRuntimes.length, "local runtimes"]
  ].map(([value, text]) => `<div class="stat"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(text)}</span></div>`).join("");
  $("#all-collection-count").textContent = total;
  $("#system-collection-count").textContent = state.projects.length;
  $("#inference-collection-count").textContent = state.inferenceServices.length;
  $("#runtime-collection-count").textContent = state.localRuntimes.length;
}

function setDirectoryCollection(collection, { updateURL = true } = {}) {
  const selected = ["all", "systems", "inference", "runtimes"].includes(collection) ? collection : "all";
  const compatible = (selected === "systems" && state.comparison.kind === "system")
    || (selected === "inference" && state.comparison.kind === "inference")
    || (selected === "runtimes" && state.comparison.kind === "runtime");
  if (updateURL && state.comparison.ids.length && !compatible) clearComparison({ updateURL: false });
  state.directoryCollection = selected;
  $$('[data-directory-collection]').forEach(button => {
    const active = button.dataset.directoryCollection === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#all-directory-panel").hidden = selected !== "all";
  $("#systems-directory-panel").hidden = selected !== "systems";
  $("#inference-directory-panel").hidden = selected !== "inference";
  $("#runtimes-directory-panel").hidden = selected !== "runtimes";
  const renderers = {
    all: renderAllDirectoryEntries,
    systems: renderProjects,
    inference: renderInferenceServices,
    runtimes: renderLocalRuntimes,
  };
  for (const [name, grid] of [
    ["all", "#all-directory-grid"], ["systems", "#project-grid"],
    ["inference", "#inference-grid"], ["runtimes", "#runtime-grid"],
  ]) {
    if (name !== selected) $(grid).innerHTML = "";
  }
  renderers[selected]();
  if (updateURL) writeDirectoryURL();
}

function renderAllDirectoryEntries() {
  const entries = AtlasCore.filterDirectoryEntries(state.projects, state.inferenceServices, state.localRuntimes, {
    term: $("#all-directory-search").value,
  });
  $("#all-directory-result-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · Scores hidden across collections`;
  $("#all-directory-grid").innerHTML = entries.map(({ kind, record }) => {
    if (kind === "runtime") {
      return `<article class="project-card local-runtime-card mixed-directory-card">
        <div class="card-top"><div><p class="family-label">Local runtime · ${escapeHTML(taxonomyName("local_runtime_types", record.runtime_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.maintainer)}</div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        <div class="tags">${record.accelerators.slice(0, 3).map(item => `<span>${escapeHTML(taxonomyName("runtime_accelerators", item))}</span>`).join("")}</div>
        <div class="card-footer"><span>Dedicated runtime score</span><button data-local-runtime="${escapeHTML(record.id)}">View details →</button></div>
      </article>`;
    }
    if (kind === "inference") {
      return `<article class="project-card inference-service-card mixed-directory-card">
        <div class="card-top"><div><p class="family-label">Inference service · ${escapeHTML(taxonomyName("inference_service_types", record.service_type))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(record.operator)}</div></div></div>
        <span class="role-badge">${escapeHTML(record.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
        <p>${escapeHTML(record.description)}</p>
        <div class="tags">${record.delivery_modes.slice(0, 3).map(item => `<span>${escapeHTML(taxonomyName("inference_delivery_modes", item))}</span>`).join("")}</div>
        <div class="card-footer"><span>Dedicated service score</span><button data-inference-service="${escapeHTML(record.id)}">View details →</button></div>
      </article>`;
    }
    const location = projectLocation(record);
    return `<article class="project-card mixed-directory-card ${escapeHTML(record.system_family)}">
      <div class="card-top"><div><p class="family-label">System · ${escapeHTML(familyName(record.system_family))}</p><h2>${escapeHTML(record.name)}</h2><div class="repo">${escapeHTML(location)}</div></div></div>
      <span class="role-badge">${escapeHTML(roleName(record.primary_role))}</span>
      <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(record.source_model))}</span>${record.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
      <p>${escapeHTML(record.description)}</p>
      <div class="tags">${record.architectures.slice(0, 3).map(item => `<span>${escapeHTML(architectureName(item))}</span>`).join("")}</div>
      <div class="card-footer"><span>${record.status === "active" ? "System-family score" : escapeHTML(label(record.status))}</span><button data-project="${escapeHTML(record.id)}">View details →</button></div>
    </article>`;
  }).join("") || '<div class="notice">No systems, inference services, or local runtimes match this search.</div>';
  $$('[data-project]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  $$('[data-inference-service]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openInferenceService(button.dataset.inferenceService)));
  $$('[data-local-runtime]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openLocalRuntime(button.dataset.localRuntime)));
}

function filteredProjects() {
  return AtlasCore.filterAndSortProjects(state.projects, {
    term: $("#project-search").value,
    family: $("#family-filter").value,
    role: $("#role-filter").value,
    roles: state.directoryRoles || [],
    agent: $("#agent-filter").value,
    architecture: $("#architecture-filter").value,
    sourceModel: $("#source-model-filter").value,
    license: $("#license-filter").value,
    status: $("#status-filter").value,
    localOnly: $("#local-filter").checked,
    sort: $("#sort-filter").value
  });
}

function renderProjects() {
  updateAdvancedFilterSummary();
  const projects = filteredProjects();
  const family = $("#family-filter").value;
  const finderContext = state.directoryRoles ? " · Finder match" : "";
  const selectedProfile = state.taxonomy.score_profiles.find(profile => profile.family === family);
  const scoreContext = family ? ` · ${scoreProfileName(selectedProfile?.id)}${finderContext}` : " · Scores hidden across families";
  $("#result-count").textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"}${scoreContext}`;
  $("#project-grid").innerHTML = projects.map(project => {
    const tags = [project.agent_relation, ...project.architectures.slice(0, 3)];
    const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${project.score.overall} out of 10">${project.score.overall}</div>` : "";
    const githubSignal = project.stars == null ? "No GitHub metrics" : `${compactNumber(project.stars)} ★`;
    return `<article class="project-card ${escapeHTML(project.system_family)}">
      <div class="card-top"><div><p class="family-label">${escapeHTML(familyName(project.system_family))}</p><h2>${escapeHTML(project.name)}</h2><div class="repo">${escapeHTML(projectLocation(project))}</div></div>${score}</div>
      <span class="role-badge">${escapeHTML(roleName(project.primary_role))}</span>
      <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(project.source_model))}</span>${project.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}${project.license_review_status === "review_required" ? '<span class="review-badge">Evidence review</span>' : ""}</div>
      <p>${escapeHTML(project.description)}</p>
      <div class="tags">${tags.map(tag => `<span>${escapeHTML(label(tag))}</span>`).join("")}</div>
      <div class="card-footer"><span>${escapeHTML(githubSignal)} ${project.status !== "active" ? `<b class="archived">· ${escapeHTML(project.status)}</b>` : ""}</span><div class="card-actions">${family ? `<button class="compare-toggle" data-compare-kind="system" data-compare-id="${escapeHTML(project.id)}" aria-label="Add ${escapeHTML(project.name)} to comparison" aria-pressed="false">Compare</button>` : ""}<button data-project="${escapeHTML(project.id)}">View details →</button></div></div>
    </article>`;
  }).join("") || '<div class="notice">No projects match these filters.</div>';
  $$('[data-project]', $("#project-grid")).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  bindComparisonButtons($("#project-grid"));
  renderComparisonControls();
}

function renderSpecifications() {
  const specifications = AtlasCore.filterSpecifications(state.specifications, {
    term: $("#specification-search").value,
    type: $("#specification-type-filter").value,
    scope: $("#specification-scope-filter").value,
    status: $("#specification-status-filter").value,
    license: $("#specification-license-filter").value,
  });
  $("#specifications-kicker").textContent = `${state.specifications.length} reviewed specifications`;
  $("#specification-result-count").textContent = `${specifications.length} ${specifications.length === 1 ? "artifact" : "artifacts"} · Unscored`;
  $("#specification-grid").innerHTML = specifications.map(specification => {
    const version = specification.current_version ? `Version ${specification.current_version}` : taxonomyName("specification_statuses", specification.status);
    return `<article class="project-card specification-card">
      <div class="card-top"><div><p class="family-label">${escapeHTML(taxonomyName("specification_types", specification.specification_type))}</p><h2>${escapeHTML(specification.short_name)}</h2><div class="repo">${escapeHTML(specification.repo || new URL(specification.url).hostname)}</div></div><span class="status-badge">${escapeHTML(version)}</span></div>
      <span class="role-badge">${escapeHTML(taxonomyName("specification_scopes", specification.scope))}</span>
      <div class="license-row">${specification.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
      <p>${escapeHTML(specification.description)}</p>
      <div class="tags"><span>${escapeHTML(taxonomyName("specification_statuses", specification.status))}</span><span>${escapeHTML(specification.stewards[0])}</span></div>
      <div class="card-footer"><span>No editorial score</span><button data-specification="${escapeHTML(specification.id)}">View details →</button></div>
    </article>`;
  }).join("") || '<div class="notice">No specifications match these filters.</div>';
  $$('[data-specification]', $("#specification-grid")).forEach(button => button.addEventListener("click", () => openSpecification(button.dataset.specification)));
}

function renderInferenceServices() {
  const services = AtlasCore.filterInferenceServices(state.inferenceServices, {
    term: $("#inference-search").value,
    type: $("#inference-type-filter").value,
    delivery: $("#inference-delivery-filter").value,
    modelSource: $("#inference-model-source-filter").value,
    apiStyle: $("#inference-api-filter").value,
    sort: $("#inference-sort-filter").value,
  });
  $("#inference-result-count").textContent = `${services.length} ${services.length === 1 ? "service" : "services"} · ${state.taxonomy.inference_service_score_profile.name}`;
  $("#inference-grid").innerHTML = services.map(service => `<article class="project-card inference-service-card">
    <div class="card-top"><div><p class="family-label">${escapeHTML(taxonomyName("inference_service_types", service.service_type))}</p><h2>${escapeHTML(service.name)}</h2><div class="repo">${escapeHTML(service.operator)}</div></div><div class="score-ring" aria-label="Inference-service score ${escapeHTML(service.score.overall)} out of 10">${escapeHTML(service.score.overall)}</div></div>
    <span class="role-badge">${escapeHTML(service.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
    <p>${escapeHTML(service.description)}</p>
    <div class="tags">${service.delivery_modes.map(item => `<span>${escapeHTML(taxonomyName("inference_delivery_modes", item))}</span>`).join("")}</div>
    <div class="card-footer"><span>${escapeHTML(service.model_sources.map(item => taxonomyName("inference_model_sources", item)).join(" · "))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="inference" data-compare-id="${escapeHTML(service.id)}" aria-label="Add ${escapeHTML(service.name)} to comparison" aria-pressed="false">Compare</button><button data-inference-service="${escapeHTML(service.id)}">View details →</button></div></div>
  </article>`).join("") || '<div class="notice">No inference services match these filters.</div>';
  $$('[data-inference-service]', $("#inference-grid")).forEach(button => button.addEventListener("click", () => openInferenceService(button.dataset.inferenceService)));
  bindComparisonButtons($("#inference-grid"));
  renderComparisonControls();
}

function renderLocalRuntimes() {
  const runtimes = AtlasCore.filterLocalRuntimes(state.localRuntimes, {
    term: $("#runtime-search").value,
    type: $("#runtime-type-filter").value,
    accelerator: $("#runtime-accelerator-filter").value,
    modelFormat: $("#runtime-format-filter").value,
    apiStyle: $("#runtime-api-filter").value,
    sort: $("#runtime-sort-filter").value,
  });
  $("#runtime-result-count").textContent = `${runtimes.length} ${runtimes.length === 1 ? "runtime" : "runtimes"} · ${state.taxonomy.local_runtime_score_profile.name}`;
  $("#runtime-grid").innerHTML = runtimes.map(runtime => `<article class="project-card local-runtime-card">
    <div class="card-top"><div><p class="family-label">${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))}</p><h2>${escapeHTML(runtime.name)}</h2><div class="repo">${escapeHTML(runtime.repo || runtime.maintainer)}</div></div><div class="score-ring" aria-label="Local-runtime score ${escapeHTML(runtime.score.overall)} out of 10">${escapeHTML(runtime.score.overall)}</div></div>
    <span class="role-badge">${escapeHTML(runtime.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</span>
    <div class="license-row"><span class="source-badge">${escapeHTML(sourceModelName(runtime.source_model))}</span>${runtime.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
    <p>${escapeHTML(runtime.description)}</p>
    <div class="tags">${runtime.accelerators.map(item => `<span>${escapeHTML(taxonomyName("runtime_accelerators", item))}</span>`).join("")}</div>
    <div class="card-footer"><span>${escapeHTML(runtime.model_formats.map(item => taxonomyName("runtime_model_formats", item)).join(" · "))}</span><div class="card-actions"><button class="compare-toggle" data-compare-kind="runtime" data-compare-id="${escapeHTML(runtime.id)}" aria-label="Add ${escapeHTML(runtime.name)} to comparison" aria-pressed="false">Compare</button><button data-local-runtime="${escapeHTML(runtime.id)}">View details →</button></div></div>
  </article>`).join("") || '<div class="notice">No local runtimes match these filters.</div>';
  $$('[data-local-runtime]', $("#runtime-grid")).forEach(button => button.addEventListener("click", () => openLocalRuntime(button.dataset.localRuntime)));
  bindComparisonButtons($("#runtime-grid"));
  renderComparisonControls();
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
    const choices = FINDER_PRIORITIES[answers.direction];
    content = `<div class="finder-question"><p class="eyebrow">Final tradeoff</p><h2>What matters most?</h2><p>This adjusts ranking only within the selected score profile.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("priority", item)).join("")}</div>`;
  } else {
    content = renderFinderResults();
  }
  const navigation = step > 0 ? `<div class="finder-navigation"><button class="ghost-button" data-finder-back>← Back</button><button class="ghost-button" data-finder-reset>Start over</button></div>` : "";
  $("#finder-content").innerHTML = content + navigation;
}

function priorityBoost(project, priority) {
  if (project.score_profile === "inference_service") {
    if (priority === "governance") return project.score.data_governance / 2;
    if (priority === "regions") return project.score.regional_deployment_control / 2;
    if (priority === "portable") return project.score.api_interoperability / 2 + project.score.serving_flexibility / 4;
    if (priority === "resilience") return project.score.traffic_resilience / 2 + project.score.operational_maturity / 4;
    return project.score.overall / 3;
  }
  if (project.score_profile === "local_runtime") {
    if (priority === "hardware") return project.score.hardware_accelerator_coverage / 2;
    if (priority === "formats") return project.score.model_format_support / 2;
    if (priority === "serving") return project.score.serving_concurrency / 2 + project.score.api_interoperability / 4;
    if (priority === "operability") return project.score.deployment_operations / 2 + project.score.observability_control / 4;
    return project.score.overall / 3;
  }
  if (project.system_family === "memory_system") {
    if (priority === "local_editable") return (project.local_first ? 2.2 : 0) + (project.human_editable ? 2 : 0) + (project.architectures.includes("plain_files") ? 0.8 : 0);
    if (priority === "local_control") return (project.local_first ? 3 : 0) + (project.deployment.includes("self_hosted") ? 0.8 : 0) + project.score.data_sovereignty / 10;
    if (priority === "easy") return project.score.operational_simplicity / 2;
    if (priority === "portable") return project.score.interoperability / 1.8 + (project.architectures.includes("plain_files") ? 0.6 : 0);
    return project.score.overall / 3;
  }
  if (project.system_family === "agent_system") {
    if (priority === "direct_use") return project.agent_interfaces.some(item => ["terminal", "ide", "web_app"].includes(item)) ? 3 : 0;
    if (priority === "developer") return project.agent_interfaces.some(item => ["library", "api_sdk"].includes(item)) ? 3 : 0;
    if (priority === "local") return (project.local_first ? 3 : 0) + (project.execution_boundaries.includes("host") ? 1 : 0) + project.score.data_sovereignty / 10;
    if (priority === "control") return project.score.human_control / 3 + project.score.observability_recovery / 4;
    return project.score.overall / 3;
  }
  if (priority === "tools") return project.score.tools_integrations / 2;
  if (priority === "continuity") return project.score.context_continuity / 2;
  if (priority === "governance") return project.score.data_governance / 3 + project.score.human_control / 4;
  if (priority === "portable") return project.score.interoperability / 1.8;
  return project.score.overall / 3;
}

function recommendationReasons(project, priority) {
  if (project.score_profile === "local_runtime") {
    const reasons = [taxonomyName("local_runtime_types", project.runtime_type)];
    if (priority === "hardware") reasons.push(`Accelerator coverage ${project.score.hardware_accelerator_coverage}/10`);
    if (priority === "formats") reasons.push(`Model formats ${project.score.model_format_support}/10`);
    if (priority === "serving") reasons.push(`Serving ${project.score.serving_concurrency}/10`);
    if (priority === "operability") reasons.push(`Deployment ${project.score.deployment_operations}/10`, `Observability ${project.score.observability_control}/10`);
    reasons.push(...project.accelerators.slice(0, 2).map(item => taxonomyName("runtime_accelerators", item)));
    return [...new Set(reasons)].slice(0, 4);
  }
  if (project.score_profile === "inference_service") {
    const reasons = [taxonomyName("inference_service_types", project.service_type)];
    if (priority === "governance") reasons.push(`Data governance ${project.score.data_governance}/10`);
    if (priority === "regions") reasons.push(`Regional control ${project.score.regional_deployment_control}/10`);
    if (priority === "portable") reasons.push(`API interoperability ${project.score.api_interoperability}/10`, `Serving flexibility ${project.score.serving_flexibility}/10`);
    if (priority === "resilience") reasons.push(`Traffic resilience ${project.score.traffic_resilience}/10`);
    reasons.push(...project.delivery_modes.slice(0, 2).map(item => taxonomyName("inference_delivery_modes", item)));
    return [...new Set(reasons)].slice(0, 4);
  }
  const reasons = [roleName(project.primary_role)];
  if (project.local_first) reasons.push("Local-first");
  if (project.system_family === "memory_system") {
    if (project.human_editable) reasons.push("Human-editable data");
    if (priority === "easy") reasons.push(`Simplicity ${project.score.operational_simplicity}/10`);
    if (priority === "portable") reasons.push(`Interoperability ${project.score.interoperability}/10`);
  } else if (project.system_family === "agent_system") {
    const interfaces = project.agent_interfaces.slice(0, 2).map(item => taxonomyName("agent_interfaces", item));
    reasons.push(...interfaces);
    if (priority === "control") reasons.push(`Human control ${project.score.human_control}/10`);
  } else {
    if (priority === "tools") reasons.push(`Tools & integrations ${project.score.tools_integrations}/10`);
    if (priority === "continuity") reasons.push(`Context continuity ${project.score.context_continuity}/10`);
    if (priority === "governance") reasons.push(`Data governance ${project.score.data_governance}/10`);
    if (priority === "portable") reasons.push(`Interoperability ${project.score.interoperability}/10`);
  }
  return [...new Set(reasons)].slice(0, 4);
}

function recommendedFinderRecords() {
  const { direction, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction].find(item => item.id === goal);
  const records = direction === "inference_service" ? state.inferenceServices
    : direction === "local_runtime" ? state.localRuntimes : state.projects;
  return records
    .filter(project => {
      if (direction === "inference_service") return goalConfig.serviceTypes.includes(project.service_type);
      if (direction === "local_runtime") return goalConfig.runtimeTypes.includes(project.runtime_type);
      return project.status === "active" && project.system_family === direction && goalConfig.roles.includes(project.primary_role);
    })
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
      <div class="finder-rank">0${index + 1}</div>
      <div><p class="family-label">${escapeHTML(classificationLabel(project))}</p><h3>${escapeHTML(project.name)}</h3><p>${escapeHTML(project.description)}</p>
        <div class="license-row">${identityRow(project)}</div>
      </div>
      <div class="finder-why"><strong>Why it surfaced</strong><div class="tags">${reasons.map(reason => `<span>${escapeHTML(reason)}</span>`).join("")}</div></div>
      <p class="finder-tradeoff"><strong>Watch for:</strong> ${escapeHTML(isInference || isRuntime ? project.tradeoffs[0] : project.weaknesses[0])}</p>
      <div class="finder-result-footer"><span>${escapeHTML(project.score.overall)} / 10 ${escapeHTML(profileLabel || project.score_profile)} score</span><button ${detailAttribute}="${escapeHTML(project.id)}">View details →</button></div>
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
  const groups = [
    ["System families", state.taxonomy.system_families], ...roleGroups,
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
    ["Specification types", state.taxonomy.specification_types],
    ["Specification scopes", state.taxonomy.specification_scopes], ["Specification statuses", state.taxonomy.specification_statuses],
    ["Licenses and terms", state.taxonomy.licenses]
  ];
  $("#taxonomy-content").innerHTML = groups.map(([name, items]) => `<section class="taxonomy-group"><h2>${escapeHTML(name)}</h2><div class="taxonomy-grid">${items.map(item => `<article class="taxonomy-item"><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.definition || item.note || "An explicit comparison trait.")}</p></article>`).join("")}</div></section>`).join("");
}

function openProject(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  const proof = state.licenses.get(project.id);
  const dimensions = Object.entries(project.score).filter(([key]) => key !== "overall");
  let familyDetail;
  if (project.system_family === "agent_system") {
    familyDetail = `<section class="detail-block"><h3>Agent operation</h3><p><strong>Interfaces:</strong> ${escapeHTML(traitNames("agent_interfaces", project.agent_interfaces))}</p><p><strong>Execution:</strong> ${escapeHTML(traitNames("execution_boundaries", project.execution_boundaries))}</p><p><strong>Capabilities:</strong> ${escapeHTML(traitNames("agent_capabilities", project.agent_capabilities))}</p></section>`;
  } else if (project.system_family === "memory_system") {
    familyDetail = `<section class="detail-block"><h3>Capture & lifecycle</h3><p><strong>Capture:</strong> ${project.capture_modes.map(label).map(escapeHTML).join(" · ")}</p><p><strong>Lifecycle:</strong> ${project.memory_lifecycle.map(label).map(escapeHTML).join(" · ")}</p></section>`;
  } else {
    familyDetail = `<section class="detail-block"><h3>Context & continuity</h3><p><strong>Inputs:</strong> ${project.capture_modes.map(label).map(escapeHTML).join(" · ")}</p><p><strong>Continuity:</strong> ${project.memory_lifecycle.map(label).map(escapeHTML).join(" · ")}</p></section>`;
  }
  const licenseLinks = proof ? proof.items.map(item => item.kind === "git_blob"
    ? `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable evidence ↗</a> · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">source path ↗</a></p>`
    : `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed terms ↗</a></p>`
  ).join("") : `<p>${project.licenses.map(escapeHTML).join(" · ")}</p>`;
  const providerDetail = project.provider_relationship && project.model_backends
    ? `<section class="detail-block"><h3>Model provider support</h3><p><strong>Relationship:</strong> ${escapeHTML(taxonomyName("provider_relationships", project.provider_relationship))}</p><p><strong>Reviewed backends:</strong> ${escapeHTML(project.model_backends.map(item => taxonomyName("model_backends", item)).join(" · "))}</p><p class="unscored-note">These traits describe reviewed support, not an inference-service score. Missing traits mean not reviewed.</p></section>`
    : "";
  $("#dialog-content").innerHTML = `<p class="eyebrow">${escapeHTML(familyName(project.system_family))} · ${escapeHTML(roleName(project.primary_role))}</p><h1>${escapeHTML(project.name)}</h1><p>${escapeHTML(project.why_it_matters)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>System identity</h3><p><strong>AI relationship:</strong> ${escapeHTML(relationName(project.agent_relation))}</p><p><strong>Canonical data:</strong> ${escapeHTML(project.canonical_data)}</p><p><strong>Source model:</strong> ${escapeHTML(sourceModelName(project.source_model))}</p><p><strong>Deployment:</strong> ${escapeHTML(project.deployment.map(label).join(", "))}</p><p><a href="${escapeHTML(project.url)}" target="_blank" rel="noreferrer">${project.repo ? "Open repository" : "Open official product"} ↗</a></p></section>
      <section class="detail-block"><h3>Licenses and terms</h3>${licenseLinks}${project.license_review_status === "review_required" ? '<p class="notice">The reviewed license evidence may be stale and requires human review.</p>' : ""}</section>
      <section class="detail-block"><h3>${escapeHTML(scoreProfileName(project.score_profile))}</h3><table class="score-table">${dimensions.map(([name, value]) => `<tr><td>${escapeHTML(label(name))}</td><td>${escapeHTML(value)}</td></tr>`).join("")}<tr><td><strong>Overall</strong></td><td>${project.score.overall}</td></tr></table></section>
      <section class="detail-block"><h3>Strengths</h3><ul>${project.strengths.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Weaknesses</h3><ul>${project.weaknesses.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Architecture</h3><p>${project.architectures.map(architectureName).map(escapeHTML).join(" · ")}</p><h3>Retrieval</h3><p>${project.retrieval_modes.map(label).map(escapeHTML).join(" · ")}</p></section>
      ${providerDetail}
      ${familyDetail}
    </div>`;
  $("#project-dialog").showModal();
}

function specificationEvidenceLink(item) {
  if (item.kind === "git_blob") {
    return `<p><strong>${escapeHTML(item.label || item.license_id)}:</strong> ${item.scope ? `${escapeHTML(item.scope)} · ` : ""}<a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable evidence ↗</a> · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">source path ↗</a></p>`;
  }
  return `<p><strong>${escapeHTML(item.label || item.license_id)}:</strong> ${item.scope ? `${escapeHTML(item.scope)} · ` : ""}<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a></p>`;
}

function openSpecification(id) {
  const specification = state.specifications.find(item => item.id === id);
  if (!specification) return;
  const related = specification.related_specifications.map(relatedId => state.specifications.find(item => item.id === relatedId)).filter(Boolean);
  $("#specification-dialog-content").innerHTML = `<p class="eyebrow">${escapeHTML(taxonomyName("specification_types", specification.specification_type))} · ${escapeHTML(taxonomyName("specification_scopes", specification.scope))}</p><h1>${escapeHTML(specification.name)}</h1><p>${escapeHTML(specification.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Artifact identity</h3><p><strong>Status:</strong> ${escapeHTML(taxonomyName("specification_statuses", specification.status))}</p><p><strong>Version:</strong> ${escapeHTML(specification.current_version || "Rolling / unversioned")}</p><p><strong>Steward:</strong> ${escapeHTML(specification.stewards.join(" · "))}</p><p><a href="${escapeHTML(specification.url)}" target="_blank" rel="noreferrer">Open official specification ↗</a></p>${specification.repo ? `<p><a href="https://github.com/${escapeHTML(specification.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p>` : ""}</section>
      <section class="detail-block"><h3>What it standardizes</h3><p>${escapeHTML(specification.standardizes)}</p></section>
      <section class="detail-block"><h3>What it does not standardize</h3><p>${escapeHTML(specification.does_not_standardize)}</p></section>
      <section class="detail-block"><h3>Licenses and terms</h3><p>${escapeHTML(specification.license_note)}</p>${specification.license_evidence.map(specificationEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${specification.evidence.map(specificationEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Related artifacts</h3>${related.length ? `<p>${related.map(item => escapeHTML(item.short_name)).join(" · ")}</p>` : "<p>None recorded.</p>"}<p class="unscored-note">Specifications are classified, not scored. Their value depends on the integration boundary you need.</p></section>
    </div>`;
  $("#specification-dialog").showModal();
}

function inferenceEvidenceLink(item) {
  return `<p><strong>${escapeHTML(item.label)}:</strong> <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a> <span class="evidence-date">${escapeHTML(item.verified_at)}</span></p>`;
}

function openInferenceService(id) {
  const service = state.inferenceServices.find(item => item.id === id);
  if (!service) return;
  const profile = state.taxonomy.inference_service_score_profile;
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${escapeHTML(service.score[dimension.id])}</td></tr>`).join("");
  $("#inference-dialog-content").innerHTML = `<p class="eyebrow">${escapeHTML(taxonomyName("inference_service_types", service.service_type))} · ${escapeHTML(profile.name)} ${escapeHTML(service.score.overall)}</p><h1>${escapeHTML(service.name)}</h1><p>${escapeHTML(service.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Service identity</h3><p><strong>Operator:</strong> ${escapeHTML(service.operator)}</p><p><strong>Type:</strong> ${escapeHTML(taxonomyName("inference_service_types", service.service_type))}</p><p><a href="${escapeHTML(service.url)}" target="_blank" rel="noreferrer">Open official service documentation ↗</a></p></section>
      <section class="detail-block"><h3>${escapeHTML(profile.name)}</h3><table class="score-table">${scoreRows}<tr><td><strong>Overall</strong></td><td>${escapeHTML(service.score.overall)}</td></tr></table><p class="unscored-note">Operational service score only. It excludes model quality, current price, and transient latency or throughput.</p></section>
      <section class="detail-block"><h3>Service boundary</h3><p>${escapeHTML(service.service_boundary)}</p><p class="unscored-note">Companies, models, local runtimes, and system-family scores remain separate boundaries.</p></section>
      <section class="detail-block"><h3>Delivery and model sources</h3><p><strong>Delivery:</strong> ${escapeHTML(service.delivery_modes.map(item => taxonomyName("inference_delivery_modes", item)).join(" · "))}</p><p><strong>Model sources:</strong> ${escapeHTML(service.model_sources.map(item => taxonomyName("inference_model_sources", item)).join(" · "))}</p><p><strong>API styles:</strong> ${escapeHTML(service.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Regional controls</h3><p>${escapeHTML(service.regional_controls)}</p></section>
      <section class="detail-block"><h3>Retention controls</h3><p>${escapeHTML(service.retention_controls)}</p></section>
      <section class="detail-block"><h3>Routing and customization</h3><p><strong>Routing:</strong> ${escapeHTML(service.routing)}</p><p><strong>Customization:</strong> ${escapeHTML(service.customization)}</p></section>
      <section class="detail-block"><h3>Strengths</h3><ul>${service.strengths.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Tradeoffs</h3><ul>${service.tradeoffs.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Governing terms</h3>${inferenceEvidenceLink(service.terms)}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${service.evidence.map(inferenceEvidenceLink).join("")}</section>
    </div>`;
  $("#inference-dialog").showModal();
}

function runtimeLicenseEvidenceLink(item) {
  const source = item.kind === "git_blob"
    ? `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">${escapeHTML(item.path)} ↗</a> · <a href="${escapeHTML(item.immutable_url)}" target="_blank" rel="noreferrer">immutable blob ↗</a>`
    : `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed terms ↗</a> <span class="evidence-date">${escapeHTML(item.verified_at)}</span>`;
  return `<p><strong>${escapeHTML(item.license_id)}:</strong> ${escapeHTML(item.scope)} — ${source}</p>`;
}

function openLocalRuntime(id) {
  const runtime = state.localRuntimes.find(item => item.id === id);
  if (!runtime) return;
  const profile = state.taxonomy.local_runtime_score_profile;
  const scoreRows = profile.dimensions.map(dimension => `<tr><td title="${escapeHTML(dimension.definition)}">${escapeHTML(label(dimension.id))} · ${Math.round(dimension.weight * 100)}%</td><td>${escapeHTML(runtime.score[dimension.id])}</td></tr>`).join("");
  $("#runtime-dialog-content").innerHTML = `<p class="eyebrow">${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))} · ${escapeHTML(profile.name)} ${escapeHTML(runtime.score.overall)}</p><h1>${escapeHTML(runtime.name)}</h1><p>${escapeHTML(runtime.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Runtime identity</h3><p><strong>Maintainer:</strong> ${escapeHTML(runtime.maintainer)}</p><p><strong>Type:</strong> ${escapeHTML(taxonomyName("local_runtime_types", runtime.runtime_type))}</p>${runtime.repo ? `<p><strong>Repository:</strong> ${escapeHTML(runtime.repo)}</p>` : ""}<p><a href="${escapeHTML(runtime.url)}" target="_blank" rel="noreferrer">Open official documentation ↗</a></p></section>
      <section class="detail-block"><h3>${escapeHTML(profile.name)}</h3><table class="score-table">${scoreRows}<tr><td><strong>Overall</strong></td><td>${escapeHTML(runtime.score.overall)}</td></tr></table><p class="unscored-note">Documented execution capability only. It excludes model quality, throughput, latency, benchmark rank, and hardware cost.</p></section>
      <section class="detail-block"><h3>Runtime boundary</h3><p>${escapeHTML(runtime.runtime_boundary)}</p><p class="unscored-note">Managed inference services, models, and system-family scores remain separate boundaries.</p></section>
      <section class="detail-block"><h3>Execution</h3><p><strong>Accelerators:</strong> ${escapeHTML(runtime.accelerators.map(item => taxonomyName("runtime_accelerators", item)).join(" · "))}</p><p><strong>Model formats:</strong> ${escapeHTML(runtime.model_formats.map(item => taxonomyName("runtime_model_formats", item)).join(" · "))}</p><p><strong>Serving:</strong> ${escapeHTML(runtime.serving_modes.map(item => taxonomyName("runtime_serving_modes", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Interfaces and deployment</h3><p><strong>API styles:</strong> ${escapeHTML(runtime.api_styles.map(item => taxonomyName("inference_api_styles", item)).join(" · "))}</p><p><strong>Deployment:</strong> ${escapeHTML(runtime.deployment_surfaces.map(item => taxonomyName("runtime_deployment_surfaces", item)).join(" · "))}</p></section>
      <section class="detail-block"><h3>Hardware requirements</h3><p>${escapeHTML(runtime.hardware_requirements)}</p></section>
      <section class="detail-block"><h3>Model management</h3><p>${escapeHTML(runtime.model_management)}</p></section>
      <section class="detail-block"><h3>Operational controls</h3><p>${escapeHTML(runtime.operational_controls)}</p></section>
      <section class="detail-block"><h3>Strengths</h3><ul>${runtime.strengths.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Tradeoffs</h3><ul>${runtime.tradeoffs.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Licensing</h3><p><strong>Source model:</strong> ${escapeHTML(sourceModelName(runtime.source_model))}</p><p>${escapeHTML(runtime.license_note)}</p>${runtime.license_evidence.map(runtimeLicenseEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${runtime.evidence.map(inferenceEvidenceLink).join("")}</section>
    </div>`;
  $("#runtime-dialog").showModal();
}

function comparisonTable(records, rows) {
  return `<div class="comparison-table-wrap"><table class="comparison-table">
    <thead><tr><th scope="col">Decision factor</th>${records.map(record => `<th scope="col"><strong>${escapeHTML(record.name)}</strong></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([name, values]) => `<tr><th scope="row">${escapeHTML(name)}</th>${values.map(value => `<td>${escapeHTML(value ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function openComparison() {
  const records = comparisonRecords();
  if (records.length < 2) return;
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
      ["Overall score", records.map(item => `${item.score.overall} / 10`)],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => `${item.score[dimension.id]} / 10`),
      ]),
      ["Source model", records.map(item => sourceModelName(item.source_model))],
      ["Licenses / terms", records.map(item => item.licenses.map(value => `${value} — ${licenseName(value)}`).join(" · "))],
      ["Deployment", records.map(item => item.deployment.map(value => taxonomyName("deployment_modes", value)).join(" · "))],
      ["Local-first", records.map(item => item.local_first ? "Yes" : "No")],
      ["Architecture", records.map(item => item.architectures.map(architectureName).join(" · "))],
      ["Strengths", records.map(item => item.strengths.join(" • "))],
      ["Watchouts", records.map(item => item.weaknesses.join(" • "))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  } else if (state.comparison.kind === "runtime") {
    profile = state.taxonomy.local_runtime_score_profile;
    eyebrow = profile.name;
    note = "This comparison covers documented execution capability on hardware you operate. It excludes model quality, throughput, latency, benchmark rank, and hardware cost.";
    rows = [
      ["Maintainer", records.map(item => item.maintainer)],
      ["Runtime type", records.map(item => taxonomyName("local_runtime_types", item.runtime_type))],
      ["Overall score", records.map(item => `${item.score.overall} / 10`)],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => `${item.score[dimension.id]} / 10`),
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
      ["Strengths", records.map(item => item.strengths.join(" • "))],
      ["Tradeoffs", records.map(item => item.tradeoffs.join(" • "))],
      ["Editorially verified", records.map(item => item.verified_at)],
    ];
  } else {
    profile = state.taxonomy.inference_service_score_profile;
    eyebrow = profile.name;
    note = "This comparison covers operational service characteristics. It excludes model quality, current price, and transient latency or throughput.";
    rows = [
      ["Operator", records.map(item => item.operator)],
      ["Service type", records.map(item => taxonomyName("inference_service_types", item.service_type))],
      ["Overall score", records.map(item => `${item.score.overall} / 10`)],
      ...profile.dimensions.map(dimension => [
        `${label(dimension.id)} · ${Math.round(dimension.weight * 100)}%`,
        records.map(item => `${item.score[dimension.id]} / 10`),
      ]),
      ["Delivery", records.map(item => item.delivery_modes.map(value => taxonomyName("inference_delivery_modes", value)).join(" · "))],
      ["Model sources", records.map(item => item.model_sources.map(value => taxonomyName("inference_model_sources", value)).join(" · "))],
      ["API styles", records.map(item => item.api_styles.map(value => taxonomyName("inference_api_styles", value)).join(" · "))],
      ["Regional controls", records.map(item => item.regional_controls)],
      ["Retention controls", records.map(item => item.retention_controls)],
      ["Routing", records.map(item => item.routing)],
      ["Customization", records.map(item => item.customization)],
      ["Strengths", records.map(item => item.strengths.join(" • "))],
      ["Tradeoffs", records.map(item => item.tradeoffs.join(" • "))],
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

function activateView(id) {
  if (id === "inference-services" || id === "local-runtimes") {
    setDirectoryCollection(id === "inference-services" ? "inference" : "runtimes");
    id = "directory";
  }
  $$(".tab").forEach(item => item.classList.toggle("is-active", item.dataset.tab === id));
  $$(".view").forEach(view => view.classList.toggle("is-active", view.id === id));
  if (id === "directory") renderComparisonControls();
  else $("#comparison-tray").hidden = true;
  window.scrollTo({ top: 0 });
}

function bindEvents() {
  $$(".tab").forEach(button => button.addEventListener("click", () => activateView(button.dataset.tab)));
  $$('[data-open-tab]').forEach(button => button.addEventListener("click", () => activateView(button.dataset.openTab)));
  $$('[data-directory-collection]').forEach(button => button.addEventListener("click", () => setDirectoryCollection(button.dataset.directoryCollection)));
  $("#all-directory-search").addEventListener("input", renderAllDirectoryEntries);
  $("#family-filter").addEventListener("input", () => {
    clearComparison();
    state.directoryRoles = null;
    $("#role-filter").value = "";
    populateRoleFilter();
    updateScoreSortAvailability();
    renderProjects();
  });
  $("#role-filter").addEventListener("input", () => { state.directoryRoles = null; renderProjects(); });
  ["#project-search", "#source-model-filter", "#license-filter", "#agent-filter", "#architecture-filter", "#status-filter", "#sort-filter", "#local-filter"].forEach(selector => $(selector).addEventListener("input", renderProjects));
  ["#specification-search", "#specification-type-filter", "#specification-scope-filter", "#specification-status-filter", "#specification-license-filter"].forEach(selector => $(selector).addEventListener("input", renderSpecifications));
  ["#inference-search", "#inference-type-filter", "#inference-delivery-filter", "#inference-model-source-filter", "#inference-api-filter", "#inference-sort-filter"].forEach(selector => $(selector).addEventListener("input", renderInferenceServices));
  ["#runtime-search", "#runtime-type-filter", "#runtime-accelerator-filter", "#runtime-format-filter", "#runtime-api-filter", "#runtime-sort-filter"].forEach(selector => $(selector).addEventListener("input", renderLocalRuntimes));
  $("#reset-specification-filters").addEventListener("click", () => {
    $("#specification-search").value = "";
    $("#specification-type-filter").value = "";
    $("#specification-scope-filter").value = "";
    $("#specification-status-filter").value = "";
    $("#specification-license-filter").value = "";
    renderSpecifications();
  });
  $("#reset-inference-filters").addEventListener("click", () => {
    $("#inference-search").value = "";
    $("#inference-type-filter").value = "";
    $("#inference-delivery-filter").value = "";
    $("#inference-model-source-filter").value = "";
    $("#inference-api-filter").value = "";
    $("#inference-sort-filter").value = "score";
    renderInferenceServices();
  });
  $("#reset-runtime-filters").addEventListener("click", () => {
    $("#runtime-search").value = "";
    $("#runtime-type-filter").value = "";
    $("#runtime-accelerator-filter").value = "";
    $("#runtime-format-filter").value = "";
    $("#runtime-api-filter").value = "";
    $("#runtime-sort-filter").value = "score";
    renderLocalRuntimes();
  });
  $("#reset-all-directory").addEventListener("click", () => {
    $("#all-directory-search").value = "";
    renderAllDirectoryEntries();
  });
  $("#reset-filters").addEventListener("click", () => {
    applyDirectoryDefaults();
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
  $("#comparison-open").addEventListener("click", openComparison);
  $("#comparison-clear").addEventListener("click", () => clearComparison());
  $("#comparison-dialog .dialog-close").addEventListener("click", () => $("#comparison-dialog").close());
  $("#comparison-dialog").addEventListener("click", event => { if (event.target === $("#comparison-dialog")) $("#comparison-dialog").close(); });
}

bootstrap().catch(error => {
  document.body.innerHTML = `<main><div class="notice">AI Systems Atlas failed to load: ${escapeHTML(error.message)}</div></main>`;
});
