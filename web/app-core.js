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

  function matchesProjectSearch(project, term) {
    if (term.length === 1) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}`).test(project.name.toLowerCase());
    }
    return matchesSearchTerm(JSON.stringify(project).toLowerCase(), term);
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
      const haystack = JSON.stringify(specification).toLowerCase();
      return matchesSearchTerm(haystack, term) &&
        (!filters.type || specification.specification_type === filters.type) &&
        (!filters.scope || specification.scope === filters.scope) &&
        (!filters.status || specification.status === filters.status) &&
        (!filters.license || specification.licenses.includes(filters.license));
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  return { compareProjects, directoryDefaults, filterAndSortProjects, filterSpecifications, matchesProject };
});
