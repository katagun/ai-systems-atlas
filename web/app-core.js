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

  function matchesProjectSearch(project, term) {
    if (term.length === 1) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}`).test(project.name.toLowerCase());
    }
    return matchesSearchTerm(JSON.stringify(project).toLowerCase(), term);
  }

  function matchesDirectoryProjectSearch(project, term) {
    if (term.length === 1) return matchesProjectSearch(project, term);
    const haystack = [
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

  function matchesProject(project, filters) {
    const term = (filters.term || "").trim().toLowerCase();
    const roles = filters.roles || [];
    return matchesProjectSearch(project, term) &&
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

  function filterSpecifications(specifications, filters = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    return specifications.filter(specification => {
      const haystack = [
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
      const haystack = searchFields
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
      ? (a, b) => b.score.overall - a.score.overall || a.name.localeCompare(b.name)
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

  function filterInferenceServices(services, filters = {}) {
    return filterScoredCollection(services, filters, INFERENCE_SERVICE_VIEW);
  }

  function filterLocalRuntimes(runtimes, filters = {}) {
    return filterScoredCollection(runtimes, filters, LOCAL_RUNTIME_VIEW);
  }

  function filterDirectoryEntries(projects, services, runtimes = [], filters = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    const entries = [
      ...projects.filter(project => matchesDirectoryProjectSearch(project, term)).map(record => ({ kind: "system", record })),
      ...filterInferenceServices(services, { term, sort: "name" }).map(record => ({ kind: "inference", record })),
      ...filterLocalRuntimes(runtimes, { term, sort: "name" }).map(record => ({ kind: "runtime", record })),
    ];
    return entries.sort((a, b) => a.record.name.localeCompare(b.record.name) || a.kind.localeCompare(b.kind));
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
  const RECORD_KINDS = ["system", "spec", "inference", "runtime"];
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

  return {
    compareProjects,
    directoryDefaults,
    filterAndSortProjects,
    filterDirectoryEntries,
    filterInferenceServices,
    filterLocalRuntimes,
    filterScoredCollection,
    filterSpecifications,
    matchesProject,
    monogramGlyph,
    parseRecordReference,
    updateComparisonSelection,
  };
});
