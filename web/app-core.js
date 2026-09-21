(function exposeAtlasCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createAtlasCore() {
  function directoryDefaults() {
    return {
      term: "",
      family: "",
      role: "",
      roles: [],
      agent: "",
      architecture: "",
      deployment: "",
      agentInterface: "",
      sourceModel: "",
      license: "",
      status: "active",
      localOnly: false,
      sort: "name",
    };
  }

  function matchesSearchTerm(haystack, term) {
    if (!term) return true;
    if (term.length > 2) return haystack.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  }

  function monogramGlyph(name) {
    return (String(name || "").match(/[a-zA-Z0-9]/)?.[0] || "•").toUpperCase();
  }

  // The systems grid's own haystack: an optional index entry for the record,
  // or (until an index arrives) the whole record stringified and lowercased —
  // exactly what this search already matched against before indexes existed,
  // so no index keeps this collection's search a no-op.
  function recordHaystack(record, index) {
    const indexed = index && index[record.id];
    if (indexed) return indexed;
    return JSON.stringify(record).toLowerCase();
  }

  function matchesRecordSearch(record, term, index) {
    if (term.length === 1) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}`).test(String(record.name || "").toLowerCase());
    }
    return matchesSearchTerm(recordHaystack(record, index), term);
  }

  function matchesProject(project, filters) {
    const term = (filters.term || "").trim().toLowerCase();
    const roles = filters.roles || [];
    return matchesRecordSearch(project, term, filters.searchIndex) &&
      (!filters.family || project.system_family === filters.family) &&
      (!filters.role || project.primary_role === filters.role) &&
      (!roles.length || roles.includes(project.primary_role)) &&
      (!filters.agent || project.agent_relation === filters.agent) &&
      (!filters.architecture || project.architectures.includes(filters.architecture)) &&
      (!filters.deployment || project.deployment.includes(filters.deployment)) &&
      (!filters.agentInterface || (project.agent_interfaces || []).includes(filters.agentInterface)) &&
      (!filters.sourceModel || project.source_model === filters.sourceModel) &&
      (!filters.license || project.licenses.includes(filters.license)) &&
      (!filters.status || project.status === filters.status) &&
      (!filters.localOnly || project.local_first);
  }

  function compareProjects(sort) {
    if (sort === "stars") return (a, b) => (b.stars ?? -1) - (a.stars ?? -1);
    if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
    return (a, b) => b.score.overall - a.score.overall || a.name.localeCompare(b.name);
  }

  function filterAndSortProjects(projects, filters) {
    return projects.filter(project => matchesProject(project, filters)).sort(compareProjects(filters.sort));
  }

  // Specifications, inference services, and local runtimes each document a
  // narrower search surface than the systems grid: visible identity and
  // boundary prose, never a relationship id or an evidence URL. An index
  // entry stands in for that surface once one exists; absent one, the
  // collection's own field list still builds it exactly as it always has.
  function filterSpecifications(specifications, filters = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    return specifications.filter(specification => {
      const indexed = filters.searchIndex && filters.searchIndex[specification.id];
      const haystack = indexed || [
        specification.id,
        specification.name,
        specification.short_name,
        specification.description,
        specification.standardizes,
        specification.does_not_standardize,
        specification.repo,
        ...(specification.stewards || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesSearchTerm(haystack, term) &&
        (!filters.type || specification.specification_type === filters.type) &&
        (!filters.scope || specification.scope === filters.scope) &&
        (!filters.status || specification.status === filters.status) &&
        (!filters.license || specification.licenses.includes(filters.license));
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function filterScoredCollection(records, filters = {}, options = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    const searchFields = options.searchFields || [];
    const facets = options.facets || {};
    return records.filter(record => {
      const indexed = filters.searchIndex && filters.searchIndex[record.id];
      const haystack = indexed || searchFields
        .flatMap(field => Array.isArray(record[field]) ? record[field] : [record[field]])
        .filter(Boolean).join(" ").toLowerCase();
      if (!matchesSearchTerm(haystack, term)) return false;
      return Object.entries(facets).every(([key, field]) => {
        const selected = filters[key];
        if (!selected) return true;
        const value = record[field];
        return Array.isArray(value) ? value.includes(selected) : value === selected;
      });
    }).sort(filters.sort === "score"
      ? (a, b) => (b.score?.overall ?? -1) - (a.score?.overall ?? -1) || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
  }

  const INFERENCE_SERVICE_VIEW = {
    searchFields: [
      "id", "name", "operator", "description", "service_boundary", "regional_controls",
      "retention_controls", "routing", "customization", "strengths", "tradeoffs",
    ],
    facets: {
      type: "service_type",
      delivery: "delivery_modes",
      modelSource: "model_sources",
      apiStyle: "api_styles",
    },
  };

  const LOCAL_RUNTIME_VIEW = {
    searchFields: [
      "id", "name", "maintainer", "description", "runtime_boundary", "model_management",
      "hardware_requirements", "operational_controls", "strengths", "tradeoffs",
    ],
    facets: {
      type: "runtime_type",
      accelerator: "accelerators",
      modelFormat: "model_formats",
      apiStyle: "api_styles",
    },
  };

  const MODEL_VIEW = {
    searchFields: [
      "id", "source_id", "name", "developer", "description", "access_boundary",
      "strengths", "tradeoffs",
    ],
    facets: {
      type: "model_type",
      distribution: "distribution_modes",
      sourceModel: "source_model",
      license: "licenses",
    },
  };

  // Packs are unscored (ADR 032): the shared collection filter is reused for its
  // facets and search, and the sort is pinned to name so no caller can ask for a
  // score order that does not exist.
  const PACK_VIEW = {
    searchFields: ["id", "name", "short_name", "steward", "repo", "description"],
    facets: {
      type: "pack_type",
      host: "hosts",
      install: "install_mechanism",
      license: "licenses",
    },
  };

  function filterPacks(packs, filters = {}) {
    return filterScoredCollection(packs, { ...filters, sort: "name" }, PACK_VIEW);
  }

  // Robots are unscored (ADR 037): the shared collection filter supplies the
  // facets and search, and the sort is pinned to name so no caller can ask for
  // a score order that does not exist.
  const ROBOT_VIEW = {
    searchFields: ["id", "name", "short_name", "manufacturer", "description"],
    facets: {
      formFactor: "form_factor",
      aiBasis: "ai_basis",
      availability: "availability",
      status: "status",
    },
  };

  function filterRobots(robots, filters = {}) {
    return filterScoredCollection(robots, { ...filters, sort: "name" }, ROBOT_VIEW);
  }

  function filterInferenceServices(services, filters = {}) {
    return filterScoredCollection(services, filters, INFERENCE_SERVICE_VIEW);
  }

  function filterLocalRuntimes(runtimes, filters = {}) {
    return filterScoredCollection(runtimes, filters, LOCAL_RUNTIME_VIEW);
  }

  function filterModels(models, filters = {}) {
    return filterScoredCollection(models, filters, MODEL_VIEW).filter(model =>
      !filters.modality || [
        ...(model.source_metadata?.modalities?.input || []),
        ...(model.source_metadata?.modalities?.output || []),
      ].includes(filters.modality)
    );
  }

  // The mixed directory searches the same visible identity, editorial, and
  // boundary prose as the Systems finder's advanced view, never the hidden
  // provider metadata or evidence URLs that only ever show up in detail
  // dialogs; an index entry stands in for that surface once one exists.
  function matchesDirectoryProjectSearch(project, term, index) {
    if (term.length === 1) return matchesRecordSearch(project, term, index);
    const indexed = index && index[project.id];
    const haystack = indexed || [
      project.id,
      project.name,
      project.description,
      project.repo,
      project.url,
      project.why_it_matters,
      ...(project.strengths || []),
      ...(project.weaknesses || []),
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesSearchTerm(haystack, term);
  }

  // Each collection in the unified directory keeps its own index namespace:
  // filters.searchIndex covers systems (the same shape filterAndSortProjects
  // takes), filters.serviceSearchIndex covers inference services,
  // filters.runtimeSearchIndex covers local runtimes, filters.modelSearchIndex
  // covers model releases, filters.packSearchIndex covers agent packs, and
  // filters.robotSearchIndex covers robots. Each is supplied independently,
  // so a missing one only narrows that collection to the searchable fields
  // present in its boot records.
  function filterDirectoryEntries(projects, services, runtimes = [], models = [], filters = {}, packs = [], robots = []) {
    const term = (filters.term || "").trim().toLowerCase();
    const entries = [
      ...projects.filter(project => matchesDirectoryProjectSearch(project, term, filters.searchIndex)).map(record => ({ kind: "system", record })),
      ...filterInferenceServices(services, { term, sort: "name", searchIndex: filters.serviceSearchIndex }).map(record => ({ kind: "inference", record })),
      ...filterLocalRuntimes(runtimes, { term, sort: "name", searchIndex: filters.runtimeSearchIndex }).map(record => ({ kind: "runtime", record })),
      ...filterModels(models, { term, sort: "name", searchIndex: filters.modelSearchIndex }).map(record => ({ kind: "model", record })),
      ...filterPacks(packs, { term, searchIndex: filters.packSearchIndex }).map(record => ({ kind: "pack", record })),
      ...filterRobots(robots, { term, searchIndex: filters.robotSearchIndex }).map(record => ({ kind: "robot", record })),
    ];
    return entries.sort((a, b) => a.record.name.localeCompare(b.record.name) || a.kind.localeCompare(b.kind));
  }

  // Scored systems that install into a host agent as a skills bundle, plugin,
  // or vault (deployment mode host_pack, ADR 034). The Packs scope lists them
  // beside the unscored packs; the search term is the only filter that applies,
  // because pack facets describe packs, not systems.
  function packShapedSystems(projects, filters = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    return projects
      .filter(project => (project.deployment || []).includes("host_pack"))
      .filter(project => matchesDirectoryProjectSearch(project, term, filters.searchIndex))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // The Packs scope lists one grid of installables: unscored packs beside
  // scored host-installed systems (ADR 035). Both inputs arrive pre-filtered
  // and name-sorted; the merge keeps that order with kind as tiebreak, the
  // same rule filterDirectoryEntries uses for mixed entries.
  function mergePackScopeEntries(packs, systems) {
    return [
      ...packs.map(record => ({ kind: "pack", record })),
      ...systems.map(record => ({ kind: "system", record })),
    ].sort((a, b) => a.record.name.localeCompare(b.record.name) || a.kind.localeCompare(b.kind));
  }

  function paginate(items, { page = 1, pageSize } = {}) {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const clampedPage = Math.min(Math.max(1, page), pageCount);
    const start = (clampedPage - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page: clampedPage, pageCount, totalCount: items.length };
  }

  function updateComparisonSelection(current = {}, candidate, maxItems = 4) {
    const sameProfile = current.kind === candidate.kind && current.profile === candidate.profile;
    const ids = sameProfile ? [...(current.ids || [])] : [];
    const selectedIndex = ids.indexOf(candidate.id);
    if (selectedIndex >= 0) ids.splice(selectedIndex, 1);
    else if (ids.length >= maxItems) return { ...current, limitReached: true };
    else ids.push(candidate.id);
    return {
      kind: ids.length ? candidate.kind : null,
      profile: ids.length ? candidate.profile : null,
      ids,
      limitReached: false,
    };
  }

  // Record references come from the URL. The kind is checked against a static
  // list on purpose: a lookup keyed on user input could resolve inherited names
  // such as "constructor", and an id is a plain slug or it is nothing.
  const RECORD_KINDS = ["system", "spec", "inference", "runtime", "model", "pack", "robot"];
  const RECORD_ID = /^[\w.-]+$/;
  function parseRecordReference(raw) {
    if (typeof raw !== "string") return null;
    const separator = raw.indexOf(":");
    if (separator < 1) return null;
    const kind = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (!RECORD_KINDS.includes(kind) || !RECORD_ID.test(id)) return null;
    return { kind, id };
  }

  // The view parameter names a primary navigation tab. It is matched against a
  // static list for the same reason a record kind is: a lookup keyed on the URL
  // could resolve an inherited name such as "constructor".
  const VIEW_IDS = ["directory", "finder", "models", "specifications", "taxonomy", "api"];
  function parseViewId(raw) {
    return typeof raw === "string" && VIEW_IDS.includes(raw) ? raw : null;
  }

  // Share pages are generated by scripts/build_share_pages.py under
  // web/records/<collection>/<id>/; this is the one place the two agree on paths.
  function shareRecordPath(kind, id) {
    if (kind === "system") return `records/systems/${id}/`;
    if (kind === "spec") return `records/specifications/${id}/`;
    if (kind === "inference") return `records/inference-services/${id}/`;
    if (kind === "runtime") return `records/local-runtimes/${id}/`;
    if (kind === "model") return `records/models/${id}/`;
    if (kind === "pack") return `records/packs/${id}/`;
    if (kind === "robot") return `records/robots/${id}/`;
    return null;
  }

  // The theme control cycles through three states; anything else, including a
  // value someone typed into storage, restarts at the OS preference.
  const THEME_PREFERENCES = ["system", "light", "dark"];
  function cycleThemePreference(current) {
    return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length];
  }

  // Card badges flag reviewed traits a reader scans a grid for. Each badge is
  // defined once and listed by id wherever it applies, so a name shared across
  // collections always tests the same field and value. A badge only asserts
  // presence: a missing, null, false, or empty field never produces one, and a
  // card without a badge claims nothing is absent. A badge never repeats a fact
  // the card already prints elsewhere (role pill, license row, footer). See
  // docs/WEB.md "Card badges".
  const CARD_BADGES = {
    "local-first": {
      name: "Local-first",
      definition: "Keeps your data on your own device or servers by default. It may still send requests to an online AI model; cloud storage is opt-in.",
      test: { field: "local_first" },
    },
    "self-hostable": {
      name: "Self-hostable",
      definition: "Ships a service you can deploy and run on infrastructure you control.",
      test: { field: "deployment", anyOf: ["self_hosted"] },
    },
    "sandboxed-execution": {
      name: "Sandboxed execution",
      definition: "Can run agent actions in a local container or an external sandbox.",
      test: { field: "execution_boundaries", anyOf: ["container", "external_sandbox"] },
    },
    "browser-control": {
      name: "Browser control",
      definition: "Can operate a web browser as part of its work.",
      test: { field: "agent_capabilities", anyOf: ["browser_control"] },
    },
    mcp: {
      name: "MCP",
      definition: "Can use tools and data sources through the Model Context Protocol.",
      test: { field: "agent_capabilities", anyOf: ["mcp"] },
    },
    "editable-by-you": {
      name: "Editable by you",
      definition: "You can open and change what it keeps, such as notes, memories, or instructions, directly in files or in the app, not only by chatting.",
      test: { field: "human_editable" },
    },
    "graph-retrieval": {
      name: "Graph retrieval",
      definition: "Can recall related memories by following connections in a graph.",
      test: { field: "retrieval_modes", anyOf: ["graph_traversal"] },
    },
    "plain-files": {
      name: "Plain files",
      definition: "Keeps data in human-readable files, such as Markdown.",
      test: { field: "architectures", anyOf: ["plain_files"] },
    },
    "time-aware-recall": {
      name: "Time-aware recall",
      definition: "Can recall what was true as of a given point in time.",
      test: { field: "retrieval_modes", anyOf: ["temporal"] },
    },
    "desktop-app": {
      name: "Desktop app",
      definition: "Available as a desktop application you install and run.",
      test: { field: "deployment", anyOf: ["desktop"] },
    },
    "mobile-app": {
      name: "Mobile app",
      definition: "Available as a mobile application you install and run.",
      test: { field: "deployment", anyOf: ["mobile"] },
    },
    "dedicated-endpoints": {
      name: "Dedicated endpoints",
      definition: "Customers can get isolated serving resources or an endpoint of their own.",
      test: { field: "delivery_modes", anyOf: ["dedicated_endpoint"] },
    },
    "reserved-capacity": {
      name: "Reserved capacity",
      definition: "Customers can reserve a defined throughput tier or capacity allocation.",
      test: { field: "delivery_modes", anyOf: ["reserved_capacity"] },
    },
    batch: {
      name: "Batch",
      definition: "Accepts asynchronous jobs that trade an immediate response for separate capacity or pricing.",
      test: { field: "delivery_modes", anyOf: ["batch"] },
    },
    "apple-metal": {
      name: "Apple Metal",
      definition: "Documented to run on Apple silicon GPUs through Metal.",
      test: { field: "accelerators", anyOf: ["metal"] },
    },
    "amd-rocm": {
      name: "AMD ROCm",
      definition: "Documented to run on AMD GPUs through ROCm.",
      test: { field: "accelerators", anyOf: ["rocm"] },
    },
    "distributed-serving": {
      name: "Distributed serving",
      definition: "Can spread a model or its requests across several accelerators or hosts.",
      test: { field: "serving_modes", anyOf: ["distributed_serving"] },
    },
    npu: {
      name: "NPU",
      definition: "Documented to run on a dedicated neural processing unit.",
      test: { field: "accelerators", anyOf: ["npu"] },
    },
  };

  // Order is priority: a card shows the first MAX_CARD_BADGES that match.
  const CARD_BADGE_SETS = {
    "system:agent_system": ["local-first", "sandboxed-execution", "browser-control", "mcp", "self-hostable"],
    "system:memory_system": ["local-first", "editable-by-you", "graph-retrieval", "plain-files", "time-aware-recall"],
    "system:assistant_system": ["local-first", "self-hostable", "desktop-app", "mobile-app"],
    inference: ["dedicated-endpoints", "reserved-capacity", "batch"],
    runtime: ["apple-metal", "amd-rocm", "distributed-serving", "npu"],
  };
  const CARD_BADGE_SET_NAMES = {
    "system:agent_system": "Agent systems",
    "system:memory_system": "Memory systems",
    "system:assistant_system": "Assistant systems",
    inference: "Inference services",
    runtime: "Local runtimes",
  };
  const MAX_CARD_BADGES = 4;

  function cardBadgeSetKey(kind, record) {
    if (kind === "system") return `system:${record.system_family}`;
    return kind;
  }

  function matchesBadgeTest(record, test) {
    const value = record[test.field];
    if (!test.anyOf) return value === true;
    return Array.isArray(value) && value.some(item => test.anyOf.includes(item));
  }

  function cardBadges(kind, record) {
    const key = cardBadgeSetKey(kind, record);
    if (!key || !Object.hasOwn(CARD_BADGE_SETS, key)) return [];
    return CARD_BADGE_SETS[key]
      .filter(id => matchesBadgeTest(record, CARD_BADGES[id].test))
      .slice(0, MAX_CARD_BADGES)
      .map(id => ({ id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition }));
  }

  // One entry per badge, in first-listed order, naming every place it appears.
  function cardBadgeGlossary() {
    const entries = new Map();
    for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
      for (const id of ids) {
        if (!entries.has(id)) entries.set(id, { id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, scopes: [] });
        entries.get(id).scopes.push(CARD_BADGE_SET_NAMES[key]);
      }
    }
    return [...entries.values()];
  }

  return {
    CARD_BADGES,
    CARD_BADGE_SETS,
    cardBadgeGlossary,
    cardBadges,
    compareProjects,
    cycleThemePreference,
    directoryDefaults,
    filterAndSortProjects,
    filterDirectoryEntries,
    filterInferenceServices,
    filterLocalRuntimes,
    filterModels,
    filterPacks,
    filterRobots,
    filterScoredCollection,
    filterSpecifications,
    matchesProject,
    matchesRecordSearch,
    mergePackScopeEntries,
    monogramGlyph,
    packShapedSystems,
    paginate,
    parseRecordReference,
    parseViewId,
    recordHaystack,
    shareRecordPath,
    updateComparisonSelection,
  };
});
