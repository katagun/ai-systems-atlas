const test = require("node:test");
const assert = require("node:assert/strict");
const { directoryDefaults, filterAndSortProjects, filterInferenceServices, filterSpecifications, matchesProject } = require("../web/app-core.js");

const projects = [
  { name: "PKM", primary_role: "human_pkm", system_family: "memory_system", agent_relation: "none", architectures: ["plain_files"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: true, stars: 5, score: { overall: 9 } },
  { name: "Bridge", primary_role: "memory_bridge", system_family: "memory_system", agent_relation: "external_memory", architectures: ["plain_files"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 10, score: { overall: 8 } },
  { name: "Service", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["vector_index"], source_model: "mixed_open_source", licenses: ["Apache-2.0", "CC-BY-4.0"], status: "active", local_first: false, stars: null, score: { overall: 7 } },
  { name: "Agent", primary_role: "coding_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["git_versioned"], source_model: "open_core", licenses: ["MIT", "LicenseRef-Commercial"], status: "active", local_first: true, stars: 20, score: { overall: 10 } },
  { name: "Work Agent", primary_role: "general_work_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["undisclosed_managed"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.2 } },
  { name: "SDK", primary_role: "agent_framework_sdk", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["event_log"], source_model: "mixed_source", licenses: ["MIT", "LicenseRef-Proprietary"], status: "active", local_first: false, stars: 15, score: { overall: 8.5 } },
  { name: "GBrain", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["git_versioned"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 24, score: { overall: 8.7 } },
  { name: "GStack", primary_role: "coding_agent_workflow", system_family: "agent_system", agent_relation: "coding_workflow", architectures: ["git_versioned"], source_model: "mixed_open_source", licenses: ["MIT", "OFL-1.1"], status: "active", local_first: true, stars: 25, score: { overall: 8.6 } },
  { name: "Assistant", primary_role: "general_ai_assistant", system_family: "assistant_system", agent_relation: "agent_enabled_ui", architectures: ["hybrid"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.8 } },
];

test("finder role sets exclude unrelated projects without imposing a local-only threshold", () => {
  const results = filterAndSortProjects(projects, {
    family: "memory_system",
    roles: ["memory_bridge", "agent_memory_service", "context_graph_engine"],
    status: "active",
    localOnly: false,
    sort: "score",
  });

  assert.deepEqual(results.map(project => project.name), ["GBrain", "Bridge", "Service"]);
});

test("family matching keeps score comparisons inside one family", () => {
  assert.equal(matchesProject(projects[3], { family: "memory_system" }), false);
  assert.equal(matchesProject(projects[0], { family: "memory_system" }), true);
  assert.equal(matchesProject(projects[8], { family: "assistant_system" }), true);
});

test("directory defaults expose every active family without a hidden role constraint", () => {
  assert.deepEqual(directoryDefaults(), {
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
  });
});

test("all-family search finds agent workflows by name", () => {
  const results = filterAndSortProjects(projects, {
    ...directoryDefaults(),
    term: "GStack",
  });
  assert.deepEqual(results.map(project => project.name), ["GStack"]);
});

test("single-character search finds matching system-name prefixes across families", () => {
  const results = filterAndSortProjects(projects, {
    ...directoryDefaults(),
    term: "G",
  });
  assert.deepEqual(results.map(project => project.name), ["GBrain", "GStack"]);
});

test("unknown stars sort behind verified star counts", () => {
  const results = filterAndSortProjects(projects, { sort: "stars" });
  assert.deepEqual(results.map(project => project.name), ["GStack", "GBrain", "Agent", "SDK", "Bridge", "PKM", "Service", "Work Agent", "Assistant"]);
});

test("assistant family supports role filtering and family-local score sorting", () => {
  const results = filterAndSortProjects(projects, {
    family: "assistant_system",
    role: "general_ai_assistant",
    sort: "score",
  });
  assert.deepEqual(results.map(project => project.name), ["Assistant"]);
});

test("general work agents remain distinct from general assistants", () => {
  assert.deepEqual(filterAndSortProjects(projects, {
    family: "agent_system",
    role: "general_work_agent",
    sort: "score",
  }).map(project => project.name), ["Work Agent"]);
  assert.equal(matchesProject(projects[4], { family: "assistant_system" }), false);
});

test("license and source-model filters combine", () => {
  const results = filterAndSortProjects(projects, {
    license: "MIT",
    sourceModel: "open_source",
    sort: "name",
  });
  assert.deepEqual(results.map(project => project.name), ["Bridge", "GBrain"]);
});

test("mixed-source projects remain independently filterable", () => {
  const results = filterAndSortProjects(projects, {
    license: "LicenseRef-Proprietary",
    sourceModel: "mixed_source",
    sort: "name",
  });
  assert.deepEqual(results.map(project => project.name), ["SDK"]);
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
  { name: "GitHub Copilot repository instructions", short_name: "copilot-instructions.md", description: "Persistent GitHub Copilot repository guidance.", specification_type: "instruction_convention", scope: "project_instructions", status: "vendor_specific", licenses: ["CC-BY-4.0"] },
  { name: "GEMINI.md", short_name: "GEMINI.md", description: "Gemini CLI project instructions.", specification_type: "instruction_convention", scope: "project_instructions", status: "vendor_specific", licenses: ["Apache-2.0"], related_specifications: ["github-copilot-instructions"] },
  { name: "Cline Rules", short_name: ".clinerules/", description: "Cline workspace and global guidance.", specification_type: "instruction_convention", scope: "project_instructions", status: "vendor_specific", licenses: ["Apache-2.0"] },
];

test("specification search includes names, descriptions, and identifiers", () => {
  assert.deepEqual(
    filterSpecifications(specifications, { term: "MCP" }).map(item => item.name),
    ["Model Context Protocol"],
  );
  assert.deepEqual(
    filterSpecifications(specifications, { term: "coding agents" }).map(item => item.name),
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

test("vendor instruction search finds Copilot, Gemini, and Cline conventions", () => {
  const filters = {
    type: "instruction_convention",
    scope: "project_instructions",
    status: "vendor_specific",
  };

  for (const term of ["Copilot", "GEMINI.md", "Cline"]) {
    const results = filterSpecifications(specifications, { ...filters, term });
    assert.equal(results.length, 1, term);
  }
});

const inferenceServices = [
  { id: "openai-api", name: "OpenAI API", operator: "OpenAI", description: "First-party multimodal API.", service_boundary: "API, not ChatGPT.", service_type: "direct_model_api", delivery_modes: ["on_demand", "batch"], model_sources: ["first_party"], api_styles: ["openai_native"], regional_controls: "Regional projects.", retention_controls: "Endpoint-specific controls.", routing: "One provider.", customization: "Fine-tuning.", strengths: ["Broad modalities"], tradeoffs: ["First-party catalog"], evidence: [{ url: "https://hidden.example/models" }] },
  { id: "amazon-bedrock", name: "Amazon Bedrock", operator: "Amazon Web Services", description: "Cloud model platform.", service_boundary: "Bedrock, not SageMaker.", service_type: "cloud_model_platform", delivery_modes: ["on_demand", "batch", "reserved_capacity"], model_sources: ["first_party", "third_party_proprietary", "open_weight", "customer_supplied"], api_styles: ["aws_native", "openai_compatible"], regional_controls: "Regional inference profiles.", retention_controls: "Model-specific terms.", routing: "Cross-region.", customization: "Custom models.", strengths: ["AWS governance"], tradeoffs: ["Regional variation"], evidence: [] },
  { id: "openrouter", name: "OpenRouter", operator: "OpenRouter", description: "Routes across providers.", service_boundary: "Router, not upstream models.", service_type: "routing_aggregator", delivery_modes: ["on_demand"], model_sources: ["third_party_proprietary", "open_weight"], api_styles: ["openai_compatible"], regional_controls: "EU routing.", retention_controls: "Endpoint policies.", routing: "Fallback by price or latency.", customization: "Public catalog.", strengths: ["Routing controls"], tradeoffs: ["Additional boundary"], evidence: [] },
];

test("inference service search covers visible boundary prose but not evidence URLs", () => {
  assert.deepEqual(
    filterInferenceServices(inferenceServices, { term: "SageMaker" }).map(item => item.name),
    ["Amazon Bedrock"],
  );
  assert.deepEqual(filterInferenceServices(inferenceServices, { term: "hidden" }), []);
});

test("inference service filters combine type, delivery, model source, and API style", () => {
  const results = filterInferenceServices(inferenceServices, {
    type: "cloud_model_platform",
    delivery: "reserved_capacity",
    modelSource: "customer_supplied",
    apiStyle: "openai_compatible",
  });
  assert.deepEqual(results.map(item => item.name), ["Amazon Bedrock"]);
});
