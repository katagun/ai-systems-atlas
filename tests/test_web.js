const test = require("node:test");
const assert = require("node:assert/strict");
const { filterAndSortProjects, filterSpecifications, matchesProject } = require("../web/app-core.js");

const projects = [
  { name: "PKM", primary_role: "human_pkm", system_family: "memory_system", agent_relation: "none", architectures: ["plain_files"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: true, stars: 5, score: { overall: 9 } },
  { name: "Bridge", primary_role: "memory_bridge", system_family: "memory_system", agent_relation: "external_memory", architectures: ["plain_files"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 10, score: { overall: 8 } },
  { name: "Service", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["vector_index"], source_model: "mixed_open_source", licenses: ["Apache-2.0", "CC-BY-4.0"], status: "active", local_first: false, stars: null, score: { overall: 7 } },
  { name: "Agent", primary_role: "coding_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["git_versioned"], source_model: "open_core", licenses: ["MIT", "LicenseRef-Commercial"], status: "active", local_first: true, stars: 20, score: { overall: 10 } },
];

test("finder role sets exclude unrelated projects without imposing a local-only threshold", () => {
  const results = filterAndSortProjects(projects, {
    family: "memory_system",
    roles: ["memory_bridge", "agent_memory_service", "context_graph_engine"],
    status: "active",
    localOnly: false,
    sort: "score",
  });

  assert.deepEqual(results.map(project => project.name), ["Bridge", "Service"]);
});

test("family matching keeps score comparisons inside one family", () => {
  assert.equal(matchesProject(projects[3], { family: "memory_system" }), false);
  assert.equal(matchesProject(projects[0], { family: "memory_system" }), true);
});

test("unknown stars sort behind verified star counts", () => {
  const results = filterAndSortProjects(projects, { sort: "stars" });
  assert.deepEqual(results.map(project => project.name), ["Agent", "Bridge", "PKM", "Service"]);
});

test("license and source-model filters combine", () => {
  const results = filterAndSortProjects(projects, {
    license: "MIT",
    sourceModel: "open_source",
    sort: "name",
  });
  assert.deepEqual(results.map(project => project.name), ["Bridge"]);
});

test("multi-license projects match any reviewed license", () => {
  const results = filterAndSortProjects(projects, { license: "CC-BY-4.0", sort: "name" });
  assert.deepEqual(results.map(project => project.name), ["Service"]);
});

test("short searches match words instead of fragments such as pi in API", () => {
  const searchable = [
    { ...projects[3], name: "Pi", description: "Minimal coding agent" },
    { ...projects[3], name: "Framework", description: "Agent API and SDK" },
  ];

  const results = filterAndSortProjects(searchable, { term: "Pi", sort: "name" });

  assert.deepEqual(results.map(project => project.name), ["Pi"]);
});

const specifications = [
  { name: "Model Context Protocol", short_name: "MCP", description: "Connect models to tools and data.", specification_type: "protocol", scope: "tool_data_integration", status: "published", licenses: ["Apache-2.0"] },
  { name: "AGENTS.md", short_name: "AGENTS.md", description: "Repository instructions for coding agents.", specification_type: "instruction_convention", scope: "project_instructions", status: "evolving", licenses: ["MIT"] },
  { name: "CLAUDE.md", short_name: "CLAUDE.md", description: "Claude Code project memory.", specification_type: "instruction_convention", scope: "project_instructions", status: "vendor_specific", licenses: ["LicenseRef-Unclear"] },
];

test("specification search includes names, descriptions, and identifiers", () => {
  assert.deepEqual(
    filterSpecifications(specifications, { term: "MCP" }).map(item => item.name),
    ["Model Context Protocol"],
  );
  assert.deepEqual(
    filterSpecifications(specifications, { term: "repository" }).map(item => item.name),
    ["AGENTS.md"],
  );
});

test("specification filters combine type, scope, status, and license", () => {
  const results = filterSpecifications(specifications, {
    type: "instruction_convention",
    scope: "project_instructions",
    status: "vendor_specific",
    license: "LicenseRef-Unclear",
  });
  assert.deepEqual(results.map(item => item.name), ["CLAUDE.md"]);
});
