(function exposeAtlasCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createAtlasCore() {
  function matchesProject(project, filters) {
    const term = (filters.term || "").trim().toLowerCase();
    const roles = filters.roles || [];
    const haystack = JSON.stringify(project).toLowerCase();
    return (!term || haystack.includes(term)) &&
      (!filters.family || project.system_family === filters.family) &&
      (!filters.role || project.primary_role === filters.role) &&
      (!roles.length || roles.includes(project.primary_role)) &&
      (!filters.agent || project.agent_relation === filters.agent) &&
      (!filters.architecture || project.architectures.includes(filters.architecture)) &&
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

  return { compareProjects, filterAndSortProjects, matchesProject };
});
