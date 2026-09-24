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

  // Labs are unscored organizations (ADR 041). A lab stores the names the other
  // collections use for it and the ids of the systems it builds; everything else
  // is joined here by the rules scripts/lab_relations.py states for the validator
  // and share pages. `models` is the page's overlaid list, so a reviewed release
  // carries review_status "reviewed" and an imported models.dev row "imported".
  const LAB_VIEW = {
    searchFields: ["id", "name", "description", "catalog_names", "parent_organization"],
    facets: {
      type: "lab_type",
      headquarters: "headquarters",
    },
  };

  function sourceNamespace(sourceId) {
    if (typeof sourceId !== "string") return null;
    const separator = sourceId.indexOf("/");
    return separator > 0 ? sourceId.slice(0, separator) : null;
  }

  function labRelations(lab, catalog = {}) {
    const names = new Set(lab.catalog_names || []);
    const systemIds = new Set(lab.systems || []);
    const models = catalog.models || [];
    const reviewed = models.filter(model => model.review_status !== "imported" && names.has(model.developer));
    const namespaces = [...new Set(reviewed.map(model => sourceNamespace(model.source_id)).filter(Boolean))].sort();
    return {
      models: reviewed,
      namespaces,
      sourceRows: models.filter(model => model.review_status === "imported" && namespaces.includes(sourceNamespace(model.source_id))),
      services: (catalog.services || []).filter(item => names.has(item.operator)),
      runtimes: (catalog.runtimes || []).filter(item => names.has(item.maintainer)),
      specifications: (catalog.specifications || []).filter(item => (item.stewards || []).some(name => names.has(name))),
      packs: (catalog.packs || []).filter(item => names.has(item.steward)),
      systems: (catalog.projects || []).filter(item => systemIds.has(item.id)),
    };
  }

  // Release dates are models.dev metadata (or Atlas-authored for a release it
  // does not list), partial as YYYY-MM or full as YYYY-MM-DD; both sort as text.
  function releaseDate(model) {
    return model.source_metadata?.release_date || "";
  }

  function releasesNewestFirst(models) {
    return [...models].sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)) || a.name.localeCompare(b.name));
  }

  // The union of the distribution modes the lab's reviewed releases carry, in
  // taxonomy order: each release keeps its own conclusion (ADR 025), and the
  // lab only shows which ones occur.
  function labDistributionModes(models, order = []) {
    const present = new Set(models.flatMap(model => model.distribution_modes || []));
    return [...order.filter(mode => present.has(mode)), ...[...present].filter(mode => !order.includes(mode)).sort()];
  }

  // Labs sort by name only; the distribution facet keeps a lab with at least one
  // reviewed release distributed that way, so it needs the catalog's models.
  function filterLabs(labs, filters = {}) {
    return filterScoredCollection(labs, { ...filters, sort: "name" }, LAB_VIEW).filter(lab =>
      !filters.distribution || labRelations(lab, { models: filters.models || [] }).models
        .some(model => (model.distribution_modes || []).includes(filters.distribution)));
  }

  // Which lab claims each name, system, and models.dev namespace, so a record
  // dialog can link to its lab without re-joining every lab on every paint.
  function buildLabIndex(labs = [], models = []) {
    const byName = new Map();
    const bySystem = new Map();
    const byNamespace = new Map();
    for (const lab of labs) {
      for (const name of lab.catalog_names || []) byName.set(name, lab);
      for (const id of lab.systems || []) bySystem.set(id, lab);
    }
    for (const model of models) {
      if (model.review_status === "imported") continue;
      const lab = byName.get(model.developer);
      const namespace = sourceNamespace(model.source_id);
      if (lab && namespace && !byNamespace.has(namespace)) byNamespace.set(namespace, lab);
    }
    return { byName, bySystem, byNamespace };
  }

  // The labs a record belongs to by its collection's join rule; a specification
  // with several stewards can belong to more than one.
  function labsForRecord(kind, record, index) {
    if (!index || !record) return [];
    let labs;
    if (kind === "system") labs = [index.bySystem.get(record.id)];
    else if (kind === "model") {
      labs = [record.review_status === "imported"
        ? index.byNamespace.get(sourceNamespace(record.source_id))
        : index.byName.get(record.developer)];
    } else if (kind === "inference") labs = [index.byName.get(record.operator)];
    else if (kind === "runtime") labs = [index.byName.get(record.maintainer)];
    else if (kind === "spec") labs = (record.stewards || []).map(name => index.byName.get(name));
    else if (kind === "pack") labs = [index.byName.get(record.steward)];
    else labs = [];
    return [...new Set(labs.filter(Boolean))];
  }

  function filterInferenceServices(services, filters = {}) {
    return filterScoredCollection(services, filters, INFERENCE_SERVICE_VIEW);
  }

  function filterLocalRuntimes(runtimes, filters = {}) {
    return filterScoredCollection(runtimes, filters, LOCAL_RUNTIME_VIEW);
  }

  // `ids`, when present, narrows to one lab's releases: its reviewed rows and the
  // imported rows in its namespaces, which the caller resolves with labRelations.
  function filterModels(models, filters = {}) {
    return filterScoredCollection(models, filters, MODEL_VIEW).filter(model =>
      (!filters.modality || [
        ...(model.source_metadata?.modalities?.input || []),
        ...(model.source_metadata?.modalities?.output || []),
      ].includes(filters.modality)) &&
      (!filters.ids || filters.ids.has(model.id))
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
  // covers model releases, and filters.packSearchIndex covers agent packs.
  // Each is supplied independently, so a missing one only narrows that
  // collection to the searchable fields present in its boot records.
  function filterDirectoryEntries(projects, services, runtimes = [], models = [], filters = {}, packs = []) {
    const term = (filters.term || "").trim().toLowerCase();
    const entries = [
      ...projects.filter(project => matchesDirectoryProjectSearch(project, term, filters.searchIndex)).map(record => ({ kind: "system", record })),
      ...filterInferenceServices(services, { term, sort: "name", searchIndex: filters.serviceSearchIndex }).map(record => ({ kind: "inference", record })),
      ...filterLocalRuntimes(runtimes, { term, sort: "name", searchIndex: filters.runtimeSearchIndex }).map(record => ({ kind: "runtime", record })),
      ...filterModels(models, { term, sort: "name", searchIndex: filters.modelSearchIndex }).map(record => ({ kind: "model", record })),
      ...filterPacks(packs, { term, searchIndex: filters.packSearchIndex }).map(record => ({ kind: "pack", record })),
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
  const RECORD_KINDS = ["system", "spec", "inference", "runtime", "model", "pack", "lab"];
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
  const VIEW_IDS = ["directory", "finder", "models", "labs", "specifications", "taxonomy", "api"];
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
    if (kind === "lab") return `records/labs/${id}/`;
    return null;
  }

  // The theme control cycles through three states; anything else, including a
  // value someone typed into storage, restarts at the OS preference.
  const THEME_PREFERENCES = ["system", "light", "dark"];
  function cycleThemePreference(current) {
    return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length];
  }

  // A badge's family decides its frame and accent. Frames are path data on a
  // 32-unit viewBox; styles.css colours each family by its token through
  // [data-family]. A new family is one entry here plus its badges' glyphs.
  const BADGE_FAMILIES = {
    control: {
      name: "Control and privacy",
      meaning: "Where your data lives and who can touch it.",
      token: "--cyan",
      frame: "M16 2.5 27 6.5v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5Z",
    },
    capability: {
      name: "Capabilities",
      meaning: "What it can do.",
      token: "--violet",
      frame: "M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z",
    },
    platform: {
      name: "Platform and hardware",
      meaning: "Where it runs and what it runs on.",
      token: "--amber",
      frame: "M9 4h14a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z",
    },
  };
  const badgeLettering = text => `<text x="16" y="18.3" text-anchor="middle">${text}</text>`;

  // Card badges flag reviewed traits a reader scans a grid for. Each badge is
  // defined once and listed by id wherever it applies, so a name shared across
  // collections always tests the same field and value. A badge only asserts
  // presence: a missing, null, false, or empty field never produces one, and a
  // card without a badge claims nothing is absent. A badge never repeats a fact
  // the card already prints elsewhere (role pill, license row, footer). Each
  // badge also names its family (frame and accent) and owns one glyph. See
  // docs/WEB.md "Card badges".
  const CARD_BADGES = {
    "local-first": {
      name: "Local-first",
      definition: "Keeps your data on your own device or servers by default. It may still send requests to an online AI model; cloud storage is opt-in.",
      test: { field: "local_first" },
      family: "control",
      glyph: '<path d="M10.5 16.5 16 11.5l5.5 5M12.3 15.5V21h7.4v-5.5"/>',
    },
    "self-hostable": {
      name: "Self-hostable",
      definition: "Ships a service you can deploy and run on infrastructure you control.",
      test: { field: "deployment", anyOf: ["self_hosted"] },
      family: "control",
      glyph: '<rect x="10.5" y="10.5" width="11" height="4.2" rx="1"/><rect x="10.5" y="16.8" width="11" height="4.2" rx="1"/><circle class="badge-dot" cx="13" cy="12.6" r=".8"/><circle class="badge-dot" cx="13" cy="18.9" r=".8"/>',
    },
    "sandboxed-execution": {
      name: "Sandboxed execution",
      definition: "Can run agent actions in a local container or an external sandbox.",
      test: { field: "execution_boundaries", anyOf: ["container", "external_sandbox"] },
      family: "control",
      glyph: '<path d="M16 10 21.5 12.8v6.4L16 22l-5.5-2.8v-6.4ZM10.5 12.8 16 15.6l5.5-2.8M16 15.6V22"/>',
    },
    "browser-control": {
      name: "Browser control",
      definition: "Can operate a web browser as part of its work.",
      test: { field: "agent_capabilities", anyOf: ["browser_control"] },
      family: "capability",
      glyph: '<path d="m12 10.5 9 4.3-3.9 1.4-1.6 4.3Z"/>',
    },
    mcp: {
      name: "MCP",
      definition: "Can use tools and data sources through the Model Context Protocol.",
      test: { field: "agent_capabilities", anyOf: ["mcp"] },
      family: "capability",
      glyph: '<path d="M13.5 9.5v3.5M18.5 9.5v3.5M11.5 13h9v2.5a4.5 4.5 0 0 1-9 0ZM16 20v2.5"/>',
    },
    "editable-by-you": {
      name: "Editable by you",
      definition: "You can open and change what it keeps, such as notes, memories, or instructions, directly in files or in the app, not only by chatting.",
      test: { field: "human_editable" },
      family: "control",
      glyph: '<path d="m11.5 20.5.7-3 6.6-6.6 2.3 2.3-6.6 6.6Z"/>',
    },
    "graph-retrieval": {
      name: "Graph retrieval",
      definition: "Can recall related memories by following connections in a graph.",
      test: { field: "retrieval_modes", anyOf: ["graph_traversal"] },
      family: "capability",
      glyph: '<path d="M16 12.5 12.5 19M16 12.5 19.5 19M12.5 19h7"/><circle class="badge-dot" cx="16" cy="11.8" r="1.9"/><circle class="badge-dot" cx="12" cy="19.5" r="1.9"/><circle class="badge-dot" cx="20" cy="19.5" r="1.9"/>',
    },
    "plain-files": {
      name: "Plain files",
      definition: "Keeps data in human-readable files, such as Markdown.",
      test: { field: "architectures", anyOf: ["plain_files"] },
      family: "control",
      glyph: '<path d="M12 10h5.5l2.5 2.5V22h-8ZM14.2 15.5h3.6M14.2 18.5h3.6"/>',
    },
    "time-aware-recall": {
      name: "Time-aware recall",
      definition: "Can recall what was true as of a given point in time.",
      test: { field: "retrieval_modes", anyOf: ["temporal"] },
      family: "capability",
      glyph: '<circle cx="16" cy="16" r="5.8"/><path d="M16 12.8V16l2.3 1.5"/>',
    },
    "desktop-app": {
      name: "Desktop app",
      definition: "Available as a desktop application you install and run.",
      test: { field: "deployment", anyOf: ["desktop"] },
      family: "platform",
      glyph: '<rect x="10" y="10.5" width="12" height="8" rx="1"/><path d="M13.5 22h5M16 18.5V22"/>',
    },
    "mobile-app": {
      name: "Mobile app",
      definition: "Available as a mobile application you install and run.",
      test: { field: "deployment", anyOf: ["mobile"] },
      family: "platform",
      glyph: '<rect x="12.5" y="9.5" width="7" height="13" rx="1.5"/><circle class="badge-dot" cx="16" cy="20" r=".8"/>',
    },
    "dedicated-endpoints": {
      name: "Dedicated endpoints",
      definition: "Customers can get isolated serving resources or an endpoint of their own.",
      test: { field: "delivery_modes", anyOf: ["dedicated_endpoint"] },
      family: "platform",
      glyph: '<circle cx="16" cy="16" r="5.8"/><circle class="badge-dot" cx="16" cy="16" r="1.8"/>',
    },
    "reserved-capacity": {
      name: "Reserved capacity",
      definition: "Customers can reserve a defined throughput tier or capacity allocation.",
      test: { field: "delivery_modes", anyOf: ["reserved_capacity"] },
      family: "platform",
      glyph: '<path d="M11.5 21v-4M16 21V11M20.5 21v-7"/>',
    },
    batch: {
      name: "Batch",
      definition: "Accepts asynchronous jobs that trade an immediate response for separate capacity or pricing.",
      test: { field: "delivery_modes", anyOf: ["batch"] },
      family: "capability",
      glyph: '<path d="m10.5 13 5.5-2.8 5.5 2.8-5.5 2.8ZM10.5 16.2 16 19l5.5-2.8M10.5 19.3 16 22l5.5-2.7"/>',
    },
    "apple-metal": {
      name: "Apple Metal",
      definition: "Documented to run on Apple silicon GPUs through Metal.",
      test: { field: "accelerators", anyOf: ["metal"] },
      family: "platform",
      glyph: badgeLettering("MTL"),
    },
    "amd-rocm": {
      name: "AMD ROCm",
      definition: "Documented to run on AMD GPUs through ROCm.",
      test: { field: "accelerators", anyOf: ["rocm"] },
      family: "platform",
      glyph: badgeLettering("ROC"),
    },
    "distributed-serving": {
      name: "Distributed serving",
      definition: "Can spread a model or its requests across several accelerators or hosts.",
      test: { field: "serving_modes", anyOf: ["distributed_serving"] },
      family: "capability",
      glyph: '<rect x="13.8" y="9.8" width="4.4" height="4.4" rx="1"/><rect x="9.8" y="17.8" width="4.4" height="4.4" rx="1"/><rect x="17.8" y="17.8" width="4.4" height="4.4" rx="1"/><path d="M16 14.2v1.8M12 17.8V16h8v1.8"/>',
    },
    npu: {
      name: "NPU",
      definition: "Documented to run on a dedicated neural processing unit.",
      test: { field: "accelerators", anyOf: ["npu"] },
      family: "platform",
      glyph: badgeLettering("NPU"),
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
  const MAX_CARD_BADGES = 6;

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
      .map(id => ({ id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, family: CARD_BADGES[id].family }));
  }

  // One entry per badge, in first-listed order, naming every place it appears.
  function cardBadgeGlossary() {
    const entries = new Map();
    for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
      for (const id of ids) {
        if (!entries.has(id)) entries.set(id, { id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, family: CARD_BADGES[id].family, scopes: [] });
        entries.get(id).scopes.push(CARD_BADGE_SET_NAMES[key]);
      }
    }
    return [...entries.values()];
  }

  // Emblems are decoration: the card, the legend, and Taxonomy print the badge
  // name as text (visible or visually hidden) beside them.
  function emblemSVG(familyId, glyph) {
    const inner = glyph ? `<g class="badge-glyph">${glyph}</g>` : "";
    return `<svg class="badge-emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="badge-frame" d="${BADGE_FAMILIES[familyId].frame}"/>${inner}</svg>`;
  }
  function badgeEmblem(badgeId) {
    return emblemSVG(CARD_BADGES[badgeId].family, CARD_BADGES[badgeId].glyph);
  }
  function familyEmblem(familyId) {
    return emblemSVG(familyId, "");
  }

  // What the Directory legend shows for a scope: the badges its cards can
  // carry, grouped by family, or only the families where cards of every kind
  // mix. null means the scope shows no badges at all.
  function badgeLegend(collection, systemFamily = "") {
    if (collection === "all" || collection === "packs") {
      return { mode: "families", families: Object.entries(BADGE_FAMILIES).map(([id, family]) => ({ id, name: family.name, meaning: family.meaning })) };
    }
    const systemKeys = Object.keys(CARD_BADGE_SETS).filter(key => key.startsWith("system:"));
    const keys = collection === "systems" ? (systemFamily ? [`system:${systemFamily}`] : systemKeys)
      : collection === "inference" ? ["inference"]
      : collection === "runtimes" ? ["runtime"]
      : [];
    const ids = [...new Set(keys.flatMap(key => (Object.hasOwn(CARD_BADGE_SETS, key) ? CARD_BADGE_SETS[key] : [])))];
    if (!ids.length) return null;
    const order = Object.keys(BADGE_FAMILIES);
    ids.sort((a, b) => order.indexOf(CARD_BADGES[a].family) - order.indexOf(CARD_BADGES[b].family));
    return { mode: "badges", badges: ids.map(id => ({ id, name: CARD_BADGES[id].name, family: CARD_BADGES[id].family })) };
  }

  // ADR 038: Atlas can review a release before models.dev lists it. Such a
  // record has source_id null and metadata written by Atlas, so nothing on
  // the page may credit models.dev for it.
  const UNLISTED_MODEL_LABEL = "Not yet listed on models.dev";
  function modelSourceLabel(model) {
    return model.source_id || UNLISTED_MODEL_LABEL;
  }
  function modelMetadataAttribution(model) {
    if (model.source_id) {
      return {
        listed: true,
        cardTitle: "From models.dev source metadata, not Atlas reviewed",
        cardPrefix: "From models.dev: ",
        capabilityNote: "These values are imported discovery metadata, not an Atlas capability test.",
        linksHeading: "Source links from models.dev",
        noLinksText: "No source links reported by models.dev.",
      };
    }
    return {
      listed: false,
      cardTitle: "Reviewed by Atlas from developer documentation",
      cardPrefix: "From developer documentation: ",
      capabilityNote: "Reviewed by Atlas from developer documentation, not an Atlas capability test.",
      linksHeading: "Source links",
      noLinksText: "No source links recorded.",
    };
  }
  function modelsKickerText(sourceCount, reviewedCount, unlistedCount) {
    const base = `${sourceCount} models.dev records · ${reviewedCount} Atlas reviewed`;
    return unlistedCount > 0 ? `${base} · ${unlistedCount} not yet on models.dev` : base;
  }

  return {
    BADGE_FAMILIES,
    CARD_BADGES,
    CARD_BADGE_SETS,
    badgeEmblem,
    badgeLegend,
    buildLabIndex,
    cardBadgeGlossary,
    cardBadges,
    compareProjects,
    cycleThemePreference,
    directoryDefaults,
    familyEmblem,
    filterAndSortProjects,
    filterDirectoryEntries,
    filterInferenceServices,
    filterLabs,
    filterLocalRuntimes,
    filterModels,
    filterPacks,
    filterScoredCollection,
    filterSpecifications,
    labDistributionModes,
    labRelations,
    labsForRecord,
    matchesProject,
    matchesRecordSearch,
    mergePackScopeEntries,
    modelMetadataAttribution,
    modelSourceLabel,
    modelsKickerText,
    monogramGlyph,
    packShapedSystems,
    paginate,
    parseRecordReference,
    parseViewId,
    recordHaystack,
    releaseDate,
    releasesNewestFirst,
    shareRecordPath,
    sourceNamespace,
    UNLISTED_MODEL_LABEL,
    updateComparisonSelection,
  };
});
