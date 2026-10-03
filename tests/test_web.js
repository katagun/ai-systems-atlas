const test = require("node:test");
const crypto = require("node:crypto");
const { relative, sep } = require("node:path");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { MAX_CARD_BADGES, modelLicenseCategories, BADGE_FAMILIES, CARD_BADGES, CARD_BADGE_SETS, COLLECTIONS, FINDER_DETAIL_KINDS, FINDER_DIRECTIONS, FINDER_DIRECTION_NAMES, FINDER_GOALS, FINDER_PRIORITIES, INACTIVE_STATUSES, SCOPE_URL_KEYS, SCOPE_URL_PARAMS, SEARCH_SYNONYMS, UNLISTED_MODEL_LABEL, badgeEmblem, badgeLegend, buildLabIndex, cardBadgeGlossary, cardBadges, collectionCategories, collectionCount, collectionHidden, collectionMatchCounts, collectionState, cycleThemePreference, datasetAttribute, directoryDefaults, directoryStageFromURL, editDistance, elementLabs, familyEmblem, familyMatchCounts, filterAndSortProjects, filterDirectoryEntries, filterInferenceServices, filterLabs, filterLocalRuntimes, filterModels, filterPacks, filterRobots, filterScoredCollection, filterSpecifications, finderDirectionTotal, finderGoalEntries, finderGoalRecords, holdsPhrase, labDistributionModes, labRelations, labsForRecord, matchFinderGoal, matchesProject, mergePackScopeEntries, modelAccessSummary, modelMetadataAttribution, modelSourceLabel, modelsKickerText, moreFromLabSystems, normalizeSearchText, packShapedSystems, paginate, parseRecordReference, parseSearchQuery, parseViewAlias, parseViewId, predecessorSystems, priorityBoost, queryMatches, readScopeURLParams, recommendationReasons, recordMatch, relatedSystems, releaseDate, releasesNewestFirst, scopeFromURL, scopeURLParams, scoreDimension, searchFields, searchWords, shareRecordPath, sourceNamespace, stemQueryWord, successorSystem, suggestNames, systemDeploymentSummary, systemElements, tokenHit, updateComparisonSelection } = require("../web/app-core.js");

const projects = [
  { name: "PKM", primary_role: "human_pkm", system_family: "memory_system", agent_relation: "none", architectures: ["plain_files"], deployment: ["desktop", "cloud_optional"], agent_interfaces: ["web_app"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: true, stars: 5, score: { overall: 9 } },
  { name: "Bridge", primary_role: "memory_bridge", system_family: "memory_system", agent_relation: "external_memory", architectures: ["plain_files"], deployment: ["local_cli"], agent_interfaces: ["library"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 10, score: { overall: 8 } },
  { name: "Service", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["vector_index"], deployment: ["library", "managed_cloud", "self_hosted"], agent_interfaces: ["api_sdk", "library"], source_model: "mixed_open_source", licenses: ["Apache-2.0", "CC-BY-4.0"], status: "active", local_first: false, stars: null, score: { overall: 7 } },
  { name: "Agent", primary_role: "coding_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["git_versioned"], deployment: ["local_cli", "self_hosted"], agent_interfaces: ["terminal", "ide"], agent_capabilities: ["code_editing", "shell_execution"], source_model: "open_core", licenses: ["MIT", "LicenseRef-Commercial"], status: "active", local_first: true, stars: 20, score: { overall: 10 } },
  { name: "Work Agent", primary_role: "general_work_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["undisclosed_managed"], deployment: ["managed_cloud"], agent_interfaces: ["web_app"], agent_capabilities: ["browser_control", "research"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.2 } },
  { name: "SDK", primary_role: "agent_framework_sdk", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["event_log"], deployment: ["library", "self_hosted"], agent_interfaces: ["library", "api_sdk"], agent_capabilities: ["workflows", "robot_control"], source_model: "mixed_source", licenses: ["MIT", "LicenseRef-Proprietary"], status: "active", local_first: false, stars: 15, score: { overall: 8.5 } },
  { name: "GBrain", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["git_versioned"], deployment: ["local_cli", "self_hosted"], agent_interfaces: ["terminal"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 24, score: { overall: 8.7 } },
  { name: "GStack", primary_role: "coding_agent_workflow", system_family: "agent_system", agent_relation: "coding_workflow", architectures: ["git_versioned"], deployment: ["local_cli"], agent_interfaces: ["terminal"], source_model: "mixed_open_source", licenses: ["MIT", "OFL-1.1"], status: "active", local_first: true, stars: 25, score: { overall: 8.6 } },
  { name: "Assistant", primary_role: "general_ai_assistant", system_family: "assistant_system", agent_relation: "agent_enabled_ui", architectures: ["hybrid"], deployment: ["desktop", "managed_cloud", "mobile"], agent_interfaces: ["web_app"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.8 } },
];

test("Elements uses primary roles, active status, taxonomy grouping and alphabetical records", () => {
  const taxonomy = { system_families: [{ id: "agent", name: "Agents" }], primary_roles: [
    { id: "coding_agent", family: "agent", name: "Coding agent" },
    { id: "future_role", family: "agent", name: "Future role" },
  ] };
  const rows = systemElements([
    { id: "b", name: "Beta", system_family: "agent", primary_role: "coding_agent", status: "active", score: { overall: 10 } },
    { id: "a", name: "Alpha", system_family: "agent", primary_role: "coding_agent", status: "active", score: { overall: 0 } },
    { id: "old", name: "Old", system_family: "agent", primary_role: "coding_agent", status: "archived" },
    { id: "wrong", name: "Wrong", system_family: "other", primary_role: "coding_agent", status: "active" },
  ], taxonomy);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].roles[0].symbol, "Ca");
  assert.deepEqual(rows[0].roles[0].records.map(record => record.id), ["a", "b"]);
  assert.deepEqual(rows[0].roles[1].records, []);
  assert.equal(rows[0].roles[1].symbol, "Fu");
  assert.equal(systemElements([], taxonomy)[0].count, 0);
});

test("Elements covers every active system once with unique role symbols", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const projects = readWebJSON("app/systems.json").systems;
  const groups = systemElements(projects, taxonomy);
  const roles = groups.flatMap(group => group.roles);
  const ids = roles.flatMap(role => role.records.map(record => record.id));
  assert.deepEqual(ids.slice().sort(), projects.filter(project => project.status === "active").map(project => project.id).sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(roles.map(role => role.symbol)).size, roles.length);
});

test("Elements previews the labs that build a role, in display order, marks only", () => {
  const labs = [
    { id: "lab-lead", name: "Zeta", display_order: 10, systems: ["one"] },
    { id: "lab-unmarked", name: "Gamma", display_order: 10, systems: ["five"] },
    { id: "lab-tied-a", name: "Alpha", display_order: 20, systems: ["two"] },
    { id: "lab-tied-b", name: "Beta", display_order: 20, systems: ["three"] },
    { id: "lab-small", name: "Small", display_order: 30, systems: ["four"] },
    { id: "lab-absent", name: "Delta", display_order: 10, systems: [] },
  ];
  const index = buildLabIndex(labs, []);
  const records = [{ id: "one" }, { id: "two" }, { id: "three" }, { id: "four" }, { id: "five" }];
  // A lab with no mark is left out rather than previewed as a monogram, and the
  // remaining tiers are read in display order.
  const marked = new Set(["lab-lead", "lab-small", "lab-tied-a", "lab-tied-b"]);
  assert.deepEqual(elementLabs(records, index, marked).map(lab => lab.id), ["lab-lead", "lab-tied-a", "lab-tied-b", "lab-small"]);
  // Without the mark filter the ordering still holds, and it is total: labs
  // sharing a display_order fall to the name.
  assert.deepEqual(elementLabs(records, index).map(lab => lab.id), ["lab-unmarked", "lab-lead", "lab-tied-a", "lab-tied-b", "lab-small"]);
  // A role whose systems no lab owns previews nothing, and neither does a
  // missing index or an empty record list.
  assert.deepEqual(elementLabs([{ id: "unknown" }], index, marked), []);
  assert.deepEqual(elementLabs(records, null, marked), []);
  assert.deepEqual(elementLabs([], index, marked), []);
});

test("every lab carries a preview precedence and roles preview only marked labs", () => {
  const labs = readWebJSON("labs.json").labs;
  const projects = readWebJSON("app/systems.json").systems;
  const taxonomy = readWebJSON("taxonomy.json");
  const logos = readWebJSON("logos.json");
  // Every lab carries a preview precedence, and no two share one, so the
  // ordering a tile draws its three marks from is a total order.
  const orders = labs.map(lab => lab.display_order);
  assert.equal(new Set(orders).size, orders.length);
  assert.ok(orders.every(order => Number.isInteger(order) && order > 0 && order % 10 === 0));
  const index = buildLabIndex(labs, readWebJSON("app/models.json").models);
  const marked = new Set(Object.keys(logos.records).filter(id => logos.records[id]));
  const roles = systemElements(projects, taxonomy).flatMap(group => group.roles);
  for (const role of roles) {
    const previews = elementLabs(role.records, index, marked);
    for (const lab of previews) assert.ok(marked.has(lab.id), `${role.id} previews the unmarked ${lab.id}`);
    // The preview is the whole ordered set the tile draws three from, so the
    // tiles' remainder counts stay a property of the catalog, not of the layout.
    assert.deepEqual(previews.map(lab => lab.id), elementLabs(role.records, index, marked).map(lab => lab.id));
  }
});

test("deployment summaries retain missing values and count overlapping modes once", () => {
  const taxonomy = { system_families: [{ id: "agent", name: "Agents" }], source_models: [{ id: "open", name: "Open" }], deployment_modes: [{ id: "local", name: "Local" }, { id: "cloud", name: "Cloud" }] };
  const record = { status: "active", system_family: "agent", source_model: "open" };
  const summary = systemDeploymentSummary([
    { ...record, deployment: ["local", "cloud", "local"], local_first: true },
    { ...record, deployment: ["cloud"], local_first: false },
    { ...record },
    { ...record, system_family: "future", source_model: "future" },
    { ...record, status: "archived", deployment: ["local"], local_first: true },
  ], taxonomy);
  assert.equal(summary.total, 4);
  assert.equal(summary.excluded, 1);
  assert.equal(summary.missingDeployment, 2);
  assert.deepEqual(summary.families.map(row => row.cells.map(cell => cell.count)), [[1, 2], [0, 0]]);
  assert.deepEqual(summary.licensing.map(row => row.cells.map(cell => cell.count)), [[1, 1, 1], [0, 0, 1]]);
  assert.equal(systemDeploymentSummary([], taxonomy).total, 0);
  assert.deepEqual(systemDeploymentSummary([], taxonomy).families, []);
});

test("system analysis cells reconcile to canonical records and catalog filters", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const boot = readWebJSON("app/systems.json").systems;
  const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "directory", "projects.json"), "utf8")).projects;
  const summary = systemDeploymentSummary(boot, taxonomy);
  assert.equal(summary.total, canonical.filter(record => record.status === "active").length);
  for (const [rows, rowFacet, cellFacet] of [[summary.families, "family", "deployment"], [summary.licensing, "sourceModel", "localOnly"]]) {
    assert.equal(rows.reduce((sum, row) => sum + row.count, 0), summary.total);
    for (const row of rows) for (const cell of row.cells) {
      const filters = { ...directoryDefaults(), [rowFacet]: row.id, [cellFacet]: cell.id };
      const expected = filterAndSortProjects(canonical, filters).map(record => record.id).sort();
      assert.equal(cell.count, expected.length);
      assert.deepEqual(filterAndSortProjects(boot, filters).map(record => record.id).sort(), expected);
    }
  }
  assert.equal(summary.missingDeployment, 0);
});

test("local-first filters distinguish false and missing while retaining old true links", () => {
  const records = [{ id: "yes", local_first: true }, { id: "no", local_first: false }, { id: "missing" }];
  const ids = localOnly => records.filter(record => matchesProject(record, { localOnly })).map(record => record.id);
  assert.deepEqual(ids(true), ["yes"]);
  assert.deepEqual(ids("1"), ["yes"]);
  assert.deepEqual(ids("0"), ["no"]);
  assert.deepEqual(ids("unknown"), ["missing"]);
  assert.deepEqual(ids(false), ["yes", "no", "missing"]);
});

test("model access counts overlaps once per release and excludes imported claims", () => {
  const sourceModels = [{ id: "open_source", name: "Open source" }];
  const modes = [{ id: "downloadable_weights", name: "Weights" }, { id: "developer_api", name: "API" }];
  const reviewed = { review_status: "reviewed", source_model: "open_source" };
  const summary = modelAccessSummary([
    { ...reviewed, source_id: null, distribution_modes: ["downloadable_weights", "developer_api", "developer_api"], licenses: ["MIT", "Apache-2.0"] },
    { ...reviewed, distribution_modes: ["developer_api"] },
    { ...reviewed, review_status: "imported", distribution_modes: ["downloadable_weights"] },
    { ...reviewed, source_model: "future_classification", distribution_modes: [] },
    { review_status: "reviewed" },
  ], sourceModels, modes);
  assert.equal(summary.total, 4);
  assert.equal(summary.excluded, 1);
  assert.deepEqual(summary.modes.map(mode => mode.count), [1, 2]);
  assert.deepEqual(summary.rows.map(row => [row.id, row.count]), [["open_source", 2], ["", 2]]);
  assert.equal(summary.missingDistribution, 2);
  const empty = modelAccessSummary([], sourceModels, modes);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.modes.map(mode => mode.count), [0, 0]);
});

test("model access boot aggregates agree with the canonical reviewed catalog", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const boot = readWebJSON("app/models.json").models;
  const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "directory", "models.json"), "utf8")).models;
  const summary = modelAccessSummary(boot, taxonomy.source_models, taxonomy.model_distribution_modes);
  assert.equal(summary.total, canonical.length);
  assert.equal(summary.rows.reduce((total, row) => total + row.count, 0), canonical.length);
  assert.equal(summary.missingDistribution, 0);
  for (const row of summary.rows) {
    for (const mode of row.modes) {
      const expected = canonical.filter(model => model.source_model === row.id && model.distribution_modes.includes(mode.id));
      assert.equal(mode.count, expected.length);
      assert.deepEqual(filterModels(boot, { sourceModel: row.id, distribution: mode.id }).map(model => model.id).sort(), expected.map(model => model.id).sort());
    }
  }
});

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
    deployment: "",
    agentInterface: "",
    capability: "",
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

test("an indexed search matches prose the boot payload does not carry", () => {
  const records = [{ id: "a", name: "Alpha", description: "A card line.", score: { overall: 1 } }];
  const searchIndex = { a: "alpha a card line. it consolidates episodic memory." };
  assert.equal(filterAndSortProjects(records, { term: "episodic", searchIndex }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "episodic" }).length, 0);
});

test("search falls back to card text before the index arrives", () => {
  const records = [{ id: "a", name: "Alpha", description: "A card line.", score: { overall: 1 } }];
  assert.equal(filterAndSortProjects(records, { term: "card" }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "card", searchIndex: {} }).length, 1);
});

test("indexed search reads the index through whole words", () => {
  // "gguf" appears only in the index text, never in the record's own fields,
  // so this fails if the matcher ignores the index.
  const records = [{ id: "ol", name: "Ol", description: "Runner.", score: { overall: 1 } }];
  const searchIndex = { ol: "ollama runner. runs gguf models locally." };
  assert.equal(filterAndSortProjects(records, { term: "gguf", searchIndex }).length, 1);
});

test("mid-word matches count inside names but not inside prose", () => {
  const records = [
    { id: "o", name: "Ollama", description: "Local runner.", score: { overall: 1 } },
    { id: "x", name: "Other", description: "Mentions ollama inside prose.", score: { overall: 9 } },
    { id: "s", name: "Store", description: "Vector storage.", score: { overall: 9 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "llama", sort: "name" }).map(record => record.name), ["Ollama"]);
  assert.deepEqual(filterAndSortProjects(records, { term: "rag", sort: "name" }).map(record => record.name), []);
});

test("a one-character term still matches only the start of a word in the name", () => {
  const records = [{ id: "a", name: "Alpha", description: "zebra", score: { overall: 1 } }];
  assert.equal(filterAndSortProjects(records, { term: "a" }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "z" }).length, 0);
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

test("indexed search reaches filterSpecifications through filters.searchIndex", () => {
  // "prompts" lives only in the index text, not in the record's own fields —
  // so this fails if filterSpecifications ignores filters.searchIndex.
  const records = [{ id: "proto", name: "Proto", short_name: "Proto", description: "A protocol.", specification_type: "protocol", scope: "tool_data_integration", status: "published", licenses: ["Apache-2.0"], score: { overall: 1 } }];
  const searchIndex = { proto: "a protocol. defines resources, tools, and prompts for hosts." };
  assert.equal(filterSpecifications(records, { term: "prompts", searchIndex }).length, 1);
  assert.equal(filterSpecifications(records, { term: "prompts" }).length, 0);
});

const inferenceServices = [
  { id: "openai-api", name: "OpenAI API", operator: "OpenAI", description: "First-party multimodal API.", service_boundary: "API, not ChatGPT.", service_type: "direct_model_api", delivery_modes: ["on_demand", "batch"], model_sources: ["first_party"], api_styles: ["openai_native"], regional_controls: "Regional projects.", retention_controls: "Endpoint-specific controls.", routing: "One provider.", customization: "Fine-tuning.", strengths: ["Broad modalities"], tradeoffs: ["First-party catalog"], score: { overall: 8.4 }, evidence: [{ url: "https://hidden.example/models" }] },
  { id: "amazon-bedrock", name: "Amazon Bedrock", operator: "Amazon Web Services", description: "Cloud model platform.", service_boundary: "Bedrock, not SageMaker.", service_type: "cloud_model_platform", delivery_modes: ["on_demand", "batch", "reserved_capacity"], model_sources: ["first_party", "third_party_proprietary", "open_weight", "customer_supplied"], api_styles: ["aws_native", "openai_compatible"], regional_controls: "Regional inference profiles.", retention_controls: "Model-specific terms.", routing: "Cross-region.", customization: "Custom models.", strengths: ["AWS governance"], tradeoffs: ["Regional variation"], score: { overall: 8.9 }, evidence: [] },
  { id: "openrouter", name: "OpenRouter", operator: "OpenRouter", description: "Routes across providers.", service_boundary: "Router, not upstream models.", service_type: "routing_aggregator", delivery_modes: ["on_demand"], model_sources: ["third_party_proprietary", "open_weight"], api_styles: ["openai_compatible"], regional_controls: "EU routing.", retention_controls: "Endpoint policies.", routing: "Fallback by price or latency.", customization: "Public catalog.", strengths: ["Routing controls"], tradeoffs: ["Additional boundary"], score: { overall: 7.59 }, evidence: [] },
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

test("inference services can sort by their dedicated score", () => {
  assert.deepEqual(
    filterInferenceServices(inferenceServices, { sort: "score" }).map(item => item.name),
    ["Amazon Bedrock", "OpenAI API", "OpenRouter"],
  );
});

test("indexed search reaches filterInferenceServices through filters.searchIndex", () => {
  // "quotas" lives only in the index text, not in the record's own fields —
  // so this fails if filterInferenceServices ignores filters.searchIndex.
  const records = [{ id: "svc", name: "Svc", operator: "Op", description: "A service.", service_boundary: "Boundary.", service_type: "direct_model_api", delivery_modes: ["on_demand"], model_sources: ["first_party"], api_styles: ["openai_native"], score: { overall: 1 }, evidence: [] }];
  const searchIndex = { svc: "a service. supports fine-grained retention quotas." };
  assert.equal(filterInferenceServices(records, { term: "quotas", searchIndex }).length, 1);
  assert.equal(filterInferenceServices(records, { term: "quotas" }).length, 0);
});

test("the unified directory preserves collection-specific search boundaries", () => {
  const combinedProjects = [
    { ...projects[3], id: "agent", description: "Coding system", model_backends: ["hidden-provider"] },
  ];
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, [], [], {}).map(item => [item.kind, item.record.name]),
    [["system", "Agent"], ["inference", "Amazon Bedrock"], ["inference", "OpenAI API"], ["inference", "OpenRouter"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, [], [], { term: "Bedrock" }).map(item => item.record.name),
    ["Amazon Bedrock"],
  );
  assert.deepEqual(filterDirectoryEntries(combinedProjects, inferenceServices, [], [], { term: "hidden-provider" }), []);
});

const localRuntimes = [
  { id: "ollama", name: "Ollama", maintainer: "Ollama", description: "Local model runner.", runtime_boundary: "Runtime, not Ollama Cloud.", model_management: "Pull and delete models.", hardware_requirements: "Compute capability floor.", operational_controls: "Parallel request settings.", runtime_type: "desktop_runner", accelerators: ["cpu", "cuda", "metal"], model_formats: ["gguf"], serving_modes: ["parallel_requests"], api_styles: ["openai_compatible"], deployment_surfaces: ["desktop_app"], strengths: ["Model lifecycle"], tradeoffs: ["No batching"], score: { overall: 7.31 }, evidence: [{ url: "https://hidden.example/runtime" }] },
  { id: "vllm", name: "vLLM", maintainer: "vLLM project", description: "Serving engine.", runtime_boundary: "Engine, not a managed service.", model_management: "Weights pinned at launch.", hardware_requirements: "Accelerator required.", operational_controls: "Parallelism configured at launch.", runtime_type: "server_engine", accelerators: ["cuda", "rocm"], model_formats: ["safetensors", "fp8"], serving_modes: ["continuous_batching"], api_styles: ["openai_compatible"], deployment_surfaces: ["container"], strengths: ["PagedAttention"], tradeoffs: ["No desktop packaging"], score: { overall: 8.64 }, evidence: [] },
  { id: "mlx-lm", name: "MLX LM", maintainer: "Apple machine learning research", description: "Apple silicon package.", runtime_boundary: "Package, not the MLX framework.", model_management: "Hugging Face Hub.", hardware_requirements: "Apple silicon only.", operational_controls: "Per-command parameters.", runtime_type: "embedded_library", accelerators: ["metal"], model_formats: ["mlx"], serving_modes: ["single_stream"], api_styles: ["openai_compatible"], deployment_surfaces: ["library"], strengths: ["First-party Apple path"], tradeoffs: ["Server not for production"], score: { overall: 4.43 }, evidence: [] },
];

const models = [
  { id: "model-qwen", source_id: "alibaba/qwen", name: "Qwen", developer: "Alibaba", description: "Open-weight language model.", access_boundary: "Model release, not an API.", model_type: "language_model", distribution_modes: ["downloadable_weights", "third_party_hosting"], source_model: "open_source", licenses: ["Apache-2.0"], source_metadata: { family: "qwen", modalities: { input: ["text"], output: ["text"] } }, strengths: ["Portable weights"], tradeoffs: ["Runtime required"], score: { overall: 8.0 } },
  { id: "model-vision", source_id: "acme/vision", name: "Vision Model", developer: "Acme", description: "Hosted multimodal model.", access_boundary: "Model release, not the host.", model_type: "multimodal_language_model", distribution_modes: ["developer_api"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], source_metadata: { family: null, modalities: { input: ["text", "image"], output: ["text"] } }, strengths: ["Image input"], tradeoffs: ["No weights"], score: { overall: 6.0 } },
];

const importedModel = {
  id: "model-acme-audio", source_id: "acme/audio", name: "Audio Source", developer: "acme",
  description: "Source-only audio model metadata.", review_status: "imported",
  source_metadata: { family: "audio", modalities: { input: ["text"], output: ["audio"] } },
};

test("model filters combine provider-independent facets and modalities", () => {
  assert.deepEqual(
    filterModels(models, { type: "language_model", distribution: "downloadable_weights", sourceModel: "open_source", license: "Apache-2.0", modality: "text" }).map(item => item.name),
    ["Qwen"],
  );
  assert.deepEqual(filterModels(models, { modality: "image" }).map(item => item.name), ["Vision Model"]);
});

test("model search indexes editorial boundary prose but not nested source metadata", () => {
  assert.deepEqual(filterModels(models, { term: "not an API" }).map(item => item.name), ["Qwen"]);
  assert.deepEqual(filterModels(models, { term: "qwen", sort: "score" }).map(item => item.name), ["Qwen"]);
});

test("model filtering keeps unscored source imports and sorts them after reviews", () => {
  assert.deepEqual(
    filterModels([...models, importedModel], { sort: "score" }).map(item => item.name),
    ["Qwen", "Vision Model", "Audio Source"],
  );
  assert.deepEqual(
    filterModels([...models, importedModel], { modality: "audio" }).map(item => item.name),
    ["Audio Source"],
  );
  assert.deepEqual(filterModels([importedModel], { type: "language_model" }), []);
});

test("the release sort orders reviewed and imported rows newest first, undated last", () => {
  const withDate = (model, date) => ({ ...model, source_metadata: { ...model.source_metadata, release_date: date } });
  const dated = [
    withDate(models[0], "2025-04-29"),
    withDate(models[1], "2026-01"),
    withDate(importedModel, "2026-03-02"),
    { ...importedModel, id: "model-acme-undated", name: "Undated Source" },
  ];
  assert.deepEqual(
    filterModels(dated, { sort: "release" }).map(item => item.name),
    ["Audio Source", "Vision Model", "Qwen", "Undated Source"],
  );
  assert.deepEqual(filterModels(dated, { sort: "release", type: "language_model" }).map(item => item.name), ["Qwen"]);
});

test("a reviewed model without a models.dev row never prints null", () => {
  const unlisted = { ...models[0], source_id: null };
  assert.equal(modelSourceLabel(models[0]), "alibaba/qwen");
  assert.equal(modelSourceLabel(unlisted), UNLISTED_MODEL_LABEL);
  assert.equal(UNLISTED_MODEL_LABEL, "Not yet listed on models.dev");
});

test("metadata attribution names Atlas when models.dev has no row", () => {
  const listed = modelMetadataAttribution(models[0]);
  const unlisted = modelMetadataAttribution({ ...models[0], source_id: null });
  assert.equal(listed.listed, true);
  assert.match(listed.cardTitle, /models\.dev/);
  assert.equal(listed.noLinksText, "No source links reported by models.dev.");
  assert.equal(unlisted.listed, false);
  assert.equal(unlisted.cardTitle, "Reviewed by Atlas from developer documentation");
  assert.equal(unlisted.noLinksText, "No source links recorded.");
  for (const text of Object.values(unlisted)) {
    if (typeof text === "string") assert.doesNotMatch(text, /models\.dev/);
  }
});

test("the models kicker counts reviewed models models.dev does not list", () => {
  assert.equal(modelsKickerText(400, 242, 0), "400 models.dev records · 242 Atlas reviewed");
  assert.equal(modelsKickerText(400, 243, 1), "400 models.dev records · 243 Atlas reviewed · 1 not yet on models.dev");
  assert.equal(modelsKickerText(400, 243, undefined), "400 models.dev records · 243 Atlas reviewed");
});

test("local runtime search covers visible boundary prose but not evidence URLs", () => {
  assert.deepEqual(
    filterLocalRuntimes(localRuntimes, { term: "Ollama Cloud" }).map(item => item.name),
    ["Ollama"],
  );
  assert.deepEqual(filterLocalRuntimes(localRuntimes, { term: "hidden" }), []);
});

test("local runtime filters combine type, accelerator, model format, and API style", () => {
  const results = filterLocalRuntimes(localRuntimes, {
    type: "server_engine",
    accelerator: "rocm",
    modelFormat: "fp8",
    apiStyle: "openai_compatible",
  });
  assert.deepEqual(results.map(item => item.name), ["vLLM"]);
  assert.deepEqual(
    filterLocalRuntimes(localRuntimes, { accelerator: "metal" }).map(item => item.name),
    ["MLX LM", "Ollama"],
  );
  assert.deepEqual(
    filterLocalRuntimes(localRuntimes, { accelerator: "metal", type: "embedded_library" }).map(item => item.name),
    ["MLX LM"],
  );
});

test("local runtimes sort by name by default and by their dedicated score on request", () => {
  assert.deepEqual(
    filterLocalRuntimes(localRuntimes, {}).map(item => item.name),
    ["MLX LM", "Ollama", "vLLM"],
  );
  assert.deepEqual(
    filterLocalRuntimes(localRuntimes, { sort: "score" }).map(item => item.name),
    ["vLLM", "Ollama", "MLX LM"],
  );
});

test("indexed search reaches filterLocalRuntimes through filters.searchIndex", () => {
  // "quantization" lives only in the index text, not in the record's own
  // fields — so this fails if filterLocalRuntimes ignores filters.searchIndex.
  const records = [{ id: "rt", name: "Rt", maintainer: "Maintainer", description: "A runtime.", runtime_boundary: "Boundary.", runtime_type: "desktop_runner", accelerators: ["cpu"], model_formats: ["gguf"], api_styles: ["openai_compatible"], score: { overall: 1 }, evidence: [] }];
  const searchIndex = { rt: "a runtime. ships with quantization presets." };
  assert.equal(filterLocalRuntimes(records, { term: "quantization", searchIndex }).length, 1);
  assert.equal(filterLocalRuntimes(records, { term: "quantization" }).length, 0);
});

test("scored collection filtering treats scalar and list facets alike", () => {
  const options = {
    searchFields: ["name", "strengths"],
    facets: { type: "runtime_type", accelerator: "accelerators" },
  };
  assert.deepEqual(
    filterScoredCollection(localRuntimes, { type: "desktop_runner" }, options).map(item => item.id),
    ["ollama"],
  );
  assert.deepEqual(
    filterScoredCollection(localRuntimes, { accelerator: "cuda" }, options).map(item => item.id),
    ["ollama", "vllm"],
  );
  assert.deepEqual(
    filterScoredCollection(localRuntimes, { term: "PagedAttention" }, options).map(item => item.id),
    ["vllm"],
  );
});

test("mixed directory browsing includes local runtimes and models alongside the other collections", () => {
  const combinedProjects = [{ ...projects[3], id: "agent", description: "Coding system" }];
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, {}).map(item => [item.kind, item.record.name]),
    [
      ["system", "Agent"],
      ["inference", "Amazon Bedrock"],
      ["runtime", "MLX LM"],
      ["runtime", "Ollama"],
      ["inference", "OpenAI API"],
      ["inference", "OpenRouter"],
      ["model", "Qwen"],
      ["model", "Vision Model"],
      ["runtime", "vLLM"],
    ],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "MLX" }).map(item => item.record.name),
    ["MLX LM"],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "Qwen" }).map(item => item.record.name),
    ["Qwen"],
  );
});

test("indexed search reaches filterDirectoryEntries through all four index keys", () => {
  // Each term lives only in one collection's own index entry, never in any
  // record's own fields — so this fails if filterDirectoryEntries wires a
  // wrong key (e.g. filters.serviceIndex instead of filters.serviceSearchIndex)
  // or ignores an index outright.
  const dirProjects = [{ ...projects[3], id: "proj", name: "Proj", description: "A system.", score: { overall: 1 } }];
  const dirServices = [{ id: "svc", name: "Svc", operator: "Op", description: "A service.", service_boundary: "Boundary.", service_type: "direct_model_api", delivery_modes: ["on_demand"], model_sources: ["first_party"], api_styles: ["openai_native"], score: { overall: 1 }, evidence: [] }];
  const dirRuntimes = [{ id: "rt", name: "Rt", maintainer: "Maintainer", description: "A runtime.", runtime_boundary: "Boundary.", runtime_type: "desktop_runner", accelerators: ["cpu"], model_formats: ["gguf"], api_styles: ["openai_compatible"], score: { overall: 1 }, evidence: [] }];
  const dirModels = [{ ...models[0], id: "mdl", name: "Mdl", description: "A model." }];

  const searchIndex = { proj: "a system. handles episodic recall for agents." };
  const serviceSearchIndex = { svc: "a service. offers regional failover routing." };
  const runtimeSearchIndex = { rt: "a runtime. ships with quantization presets." };
  const modelSearchIndex = { mdl: "a model. portable transformer release." };
  const filters = { searchIndex, serviceSearchIndex, runtimeSearchIndex, modelSearchIndex };

  assert.deepEqual(
    filterDirectoryEntries(dirProjects, dirServices, dirRuntimes, dirModels, { ...filters, term: "episodic" })
      .map(item => [item.kind, item.record.name]),
    [["system", "Proj"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(dirProjects, dirServices, dirRuntimes, dirModels, { ...filters, term: "failover" })
      .map(item => [item.kind, item.record.name]),
    [["inference", "Svc"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(dirProjects, dirServices, dirRuntimes, dirModels, { ...filters, term: "quantization" })
      .map(item => [item.kind, item.record.name]),
    [["runtime", "Rt"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(dirProjects, dirServices, dirRuntimes, dirModels, { ...filters, term: "transformer" })
      .map(item => [item.kind, item.record.name]),
    [["model", "Mdl"]],
  );
});

test("comparison selection stays inside one score profile and supports toggling", () => {
  const empty = { kind: null, profile: null, ids: [] };
  const first = updateComparisonSelection(empty, { kind: "system", profile: "memory", id: "mem0" });
  const second = updateComparisonSelection(first, { kind: "system", profile: "memory", id: "letta" });
  assert.deepEqual(second, { kind: "system", profile: "memory", ids: ["mem0", "letta"], limitReached: false });
  assert.deepEqual(
    updateComparisonSelection(second, { kind: "system", profile: "memory", id: "mem0" }),
    { kind: "system", profile: "memory", ids: ["letta"], limitReached: false },
  );
  assert.deepEqual(
    updateComparisonSelection(second, { kind: "inference", profile: "inference_service", id: "openai-api" }),
    { kind: "inference", profile: "inference_service", ids: ["openai-api"], limitReached: false },
  );
});

test("comparison selection enforces the four-entry limit", () => {
  const selected = { kind: "inference", profile: "inference_service", ids: ["one", "two", "three", "four"] };
  assert.deepEqual(
    updateComparisonSelection(selected, { kind: "inference", profile: "inference_service", id: "five" }),
    { ...selected, limitReached: true },
  );
});

test("deployment filtering selects only records carrying that operating arrangement", () => {
  const managed = filterAndSortProjects(projects, { deployment: "managed_cloud", status: "active", sort: "name" });

  assert.deepEqual(managed.map(project => project.name), ["Assistant", "Service", "Work Agent"]);
});

test("deployment filtering combines with family rather than replacing it", () => {
  const results = filterAndSortProjects(projects, {
    family: "memory_system",
    deployment: "managed_cloud",
    status: "active",
    sort: "name",
  });

  assert.deepEqual(results.map(project => project.name), ["Service"]);
});

test("the deployment filter defaults to unset so every operating arrangement is listed", () => {
  assert.equal(directoryDefaults().deployment, "");
  assert.equal(matchesProject(projects[0], { deployment: "" }), true);
  assert.equal(matchesProject(projects[0], { deployment: "managed_cloud" }), false);
});

test("interface filtering separates canvas-authored systems from code libraries", () => {
  const canvas = filterAndSortProjects(projects, { agentInterface: "web_app", status: "active", sort: "name" });
  const libs = filterAndSortProjects(projects, { agentInterface: "library", status: "active", sort: "name" });

  assert.deepEqual(canvas.map(project => project.name), ["Assistant", "PKM", "Work Agent"]);
  assert.deepEqual(libs.map(project => project.name), ["Bridge", "SDK", "Service"]);
});

test("the interface filter combines with role rather than replacing it", () => {
  const results = filterAndSortProjects(projects, {
    role: "agent_framework_sdk",
    agentInterface: "library",
    status: "active",
    sort: "name",
  });

  assert.deepEqual(results.map(project => project.name), ["SDK"]);
});

test("capability filtering reaches the agents that carry a capability", () => {
  const browsers = filterAndSortProjects(projects, { capability: "browser_control", status: "active", sort: "name" });
  const robots = filterAndSortProjects(projects, { capability: "robot_control", status: "active", sort: "name" });

  assert.deepEqual(browsers.map(project => project.name), ["Work Agent"]);
  assert.deepEqual(robots.map(project => project.name), ["SDK"]);
});

test("the capability filter defaults to unset and skips records with no capabilities", () => {
  assert.equal(directoryDefaults().capability, "");
  assert.equal(matchesProject(projects[0], { capability: "" }), true);
  assert.equal(matchesProject(projects[0], { capability: "browser_control" }), false);
});

test("the capability filter combines with role rather than replacing it", () => {
  const results = filterAndSortProjects(projects, {
    role: "agent_framework_sdk",
    capability: "robot_control",
    status: "active",
    sort: "name",
  });
  assert.deepEqual(results.map(project => project.name), ["SDK"]);
  const none = filterAndSortProjects(projects, {
    role: "coding_agent",
    capability: "robot_control",
    status: "active",
    sort: "name",
  });
  assert.deepEqual(none, []);
});

test("the systems scope writes the capability to the URL", () => {
  assert.equal(SCOPE_URL_PARAMS.systems.capability, "");
  const written = scopeURLParams("systems", { capability: "robot_control", status: "active", sort: "name" });
  assert.deepEqual(written, [["capability", "robot_control"]]);
  const restored = readScopeURLParams("systems", new URLSearchParams(written), {
    capability: new Set(["", "robot_control"]),
  });
  assert.equal(restored.values.capability, "robot_control");
});

test("robot control has no card badge (ADR 045)", () => {
  const tests = Object.values(CARD_BADGES).map(badge => JSON.stringify(badge.test || {}));
  assert.ok(tests.every(test => !test.includes("robot_control")), "a badge tests robot_control");
});

test("monogram glyphs use the first alphanumeric character uppercased", () => {
  const { monogramGlyph } = require("../web/app-core.js");
  assert.equal(monogramGlyph("Aider"), "A");
  assert.equal(monogramGlyph("llama.cpp"), "L");
  assert.equal(monogramGlyph("vLLM"), "V");
  assert.equal(monogramGlyph(".NET"), "N");
  assert.equal(monogramGlyph(""), "•");
  assert.equal(monogramGlyph(undefined), "•");
});

test("a lab card's flag covers every country the taxonomy records, and nothing else", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { countryFlag } = require("../web/app-core.js");
  const readJSON = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", file), "utf8"));

  // A regional indicator pair: two code points in the flag block, so a flag
  // cannot be a letter, a digit, or a country the taxonomy has not recorded.
  const isFlag = value => /^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(value);
  for (const country of readJSON("taxonomy.json").countries) {
    const flag = countryFlag(country.id);
    if (country.id === "none_listed") assert.equal(flag, "", "no headquarters is not a country to flag");
    else assert.ok(isFlag(flag), `no flag for the taxonomy country ${country.id} (${country.name})`);
  }
  for (const lab of readJSON("labs.json").labs) {
    assert.ok(lab.headquarters, `${lab.id} records no headquarters to flag`);
    assert.equal(countryFlag(lab.headquarters), countryFlag(lab.headquarters.toLowerCase()));
  }
  for (const unknown of ["none_listed", "", undefined, "zz", "usa"]) {
    assert.equal(countryFlag(unknown), "", `${unknown} must not borrow a flag`);
  }
});

test("every logo mapping points at a published record and a vendored plain mark", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const readJSON = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", file), "utf8"));
  const logos = readJSON("logos.json");
  const publishedIds = new Set([
    ...readJSON("projects.json").projects.map(record => record.id),
    ...readJSON("inference-services.json").services.map(record => record.id),
    ...readJSON("local-runtimes.json").runtimes.map(record => record.id),
    ...readJSON("models.json").models.map(record => record.id),
    ...readJSON("labs.json").labs.map(record => record.id),
  ]);

  assert.ok(Object.keys(logos.records).length > 0);
  for (const [recordId, key] of Object.entries(logos.records)) {
    assert.ok(publishedIds.has(recordId), `${recordId} is not a published directory record`);
    assert.ok(logos.icons[key], `${recordId} maps to missing icon ${key}`);
  }
  for (const [key, icon] of Object.entries(logos.icons)) {
    for (const [, tag] of icon.body.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)) {
      assert.ok(["path", "g", "circle", "rect", "ellipse", "polygon"].includes(tag), `${key} uses disallowed <${tag}>`);
    }
    assert.doesNotMatch(icon.body, /\son[a-z]+=|href=|url\(/i, `${key} carries disallowed attribute content`);
  }
});

test("record references parse only a known kind and a plain id", () => {
  assert.deepEqual(parseRecordReference("system:kilo-code"), { kind: "system", id: "kilo-code" });
  assert.deepEqual(parseRecordReference("spec:mcp"), { kind: "spec", id: "mcp" });
  assert.deepEqual(parseRecordReference("inference:openai-api"), { kind: "inference", id: "openai-api" });
  assert.deepEqual(parseRecordReference("runtime:ollama"), { kind: "runtime", id: "ollama" });
  assert.deepEqual(parseRecordReference("model:model-alibaba-qwen2-5-coder-0-5b"), { kind: "model", id: "model-alibaba-qwen2-5-coder-0-5b" });
  assert.deepEqual(parseRecordReference("pack:superpowers"), { kind: "pack", id: "superpowers" });
  assert.deepEqual(parseRecordReference("lab:lab-openai"), { kind: "lab", id: "lab-openai" });
  assert.deepEqual(parseRecordReference("robot:g-one"), { kind: "robot", id: "g-one" });
  for (const raw of [null, "", "ollama", "runtime:", ":ollama", "system:a:b", "constructor:x", "__proto__:x", "toString:x", "System:kilo-code"]) {
    assert.equal(parseRecordReference(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
  }
});

test("share record paths map each kind to its collection directory", () => {
  assert.equal(shareRecordPath("system", "kilo-code"), "records/systems/kilo-code/");
  assert.equal(shareRecordPath("spec", "mcp"), "records/specifications/mcp/");
  assert.equal(shareRecordPath("inference", "openai-api"), "records/inference-services/openai-api/");
  assert.equal(shareRecordPath("runtime", "ollama"), "records/local-runtimes/ollama/");
  assert.equal(shareRecordPath("model", "model-alibaba-qwen2-5-coder-0-5b"), "records/models/model-alibaba-qwen2-5-coder-0-5b/");
  assert.equal(shareRecordPath("pack", "superpowers"), "records/packs/superpowers/");
  assert.equal(shareRecordPath("lab", "lab-openai"), "records/labs/lab-openai/");
  assert.equal(shareRecordPath("constructor", "ollama"), null);
  assert.equal(shareRecordPath("robot", "g-one"), "records/robots/g-one/");
});

const packs = [
  { id: "superpowers", name: "Superpowers", steward: "obra", description: "A development methodology as skills.", pack_type: "process_kit", hosts: ["claude_code", "codex"], install_mechanism: "host_marketplace", licenses: ["MIT"], evidence: [{ url: "https://hidden.example/manifest" }] },
  { id: "kit", name: "Brain Kit", steward: "coleam00", description: "A vault starter.", pack_type: "vault_bundle", hosts: ["claude_code"], install_mechanism: "clone_template", licenses: ["LicenseRef-Unclear"], evidence: [] },
  { id: "market", name: "Agent Market", steward: "dave", description: "A marketplace manifest.", pack_type: "marketplace", hosts: ["claude_code"], install_mechanism: "host_marketplace", licenses: ["MIT"], evidence: [] },
];

test("pack filters combine type, host, install mechanism, and licence, sorted by name only", () => {
  assert.deepEqual(filterPacks(packs, {}).map(item => item.name), ["Agent Market", "Brain Kit", "Superpowers"]);
  assert.deepEqual(filterPacks(packs, { sort: "score" }).map(item => item.name), ["Agent Market", "Brain Kit", "Superpowers"]);
  assert.deepEqual(filterPacks(packs, { type: "marketplace" }).map(item => item.name), ["Agent Market"]);
  assert.deepEqual(filterPacks(packs, { host: "codex" }).map(item => item.name), ["Superpowers"]);
  assert.deepEqual(filterPacks(packs, { install: "clone_template" }).map(item => item.name), ["Brain Kit"]);
  assert.deepEqual(filterPacks(packs, { license: "MIT" }).map(item => item.name), ["Agent Market", "Superpowers"]);
});

test("pack search covers identity and steward prose but not evidence URLs", () => {
  assert.deepEqual(filterPacks(packs, { term: "coleam00" }).map(item => item.name), ["Brain Kit"]);
  assert.deepEqual(filterPacks(packs, { term: "hidden" }), []);
  assert.deepEqual(filterPacks(packs, { term: "manifest", searchIndex: { superpowers: "manifest words" } }).map(item => item.name), ["Agent Market", "Superpowers"]);
});

test("mixed directory browsing includes packs and reads their own index key", () => {
  const combinedProjects = [{ ...projects[3], id: "agent", description: "Coding system" }];
  const entries = filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, {}, packs);
  assert.ok(entries.some(item => item.kind === "pack" && item.record.name === "Superpowers"));
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "Superpowers" }, packs).map(item => [item.kind, item.record.name]),
    [["pack", "Superpowers"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "onlyinindex", packSearchIndex: { kit: "onlyinindex" } }, packs).map(item => item.record.name),
    ["Brain Kit"],
  );
  assert.deepEqual(filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "Superpowers" }), []);
});

const labs = [
  { id: "lab-alpha", name: "Alpha", description: "An AI company with a cloud unit.", lab_type: "ai_company", headquarters: "us", parent_organization: "Alpha Holdings", catalog_names: ["Alpha", "Alpha Cloud"], systems: ["alpha-chat"] },
  { id: "lab-beta", name: "Beta", description: "A technology company.", lab_type: "technology_company", headquarters: "fr", catalog_names: ["Beta", "Beta Research"], systems: [] },
];
const labCatalog = {
  models: [
    { id: "alpha-one", name: "Alpha One", developer: "Alpha", source_id: "alpha/one", review_status: "reviewed", distribution_modes: ["developer_api"], source_metadata: { release_date: "2026-03-02" } },
    { id: "alpha-two", name: "Alpha Two", developer: "Alpha", source_id: "alpha/two", review_status: "reviewed", distribution_modes: ["developer_api", "third_party_hosting"], source_metadata: { release_date: "2026-07" } },
    { id: "alpha-early", name: "Alpha Early", developer: "Alpha", source_id: null, review_status: "reviewed", distribution_modes: ["downloadable_weights"], source_metadata: {} },
    { id: "alpha-three", name: "Alpha Three", developer: "alpha", source_id: "alpha/three", review_status: "imported" },
    { id: "beta-one", name: "Beta One", developer: "Beta Research", source_id: "beta/one", review_status: "reviewed", distribution_modes: ["downloadable_weights"], source_metadata: { release_date: "2025-11-20" } },
    { id: "gamma-one", name: "Gamma One", developer: "Gamma", source_id: "gamma/one", review_status: "reviewed", distribution_modes: ["developer_api"] },
    { id: "gamma-two", name: "Gamma Two", developer: "gamma", source_id: "gamma/two", review_status: "imported" },
  ],
  services: [{ id: "alpha-api", operator: "Alpha Cloud" }, { id: "router", operator: "Router Inc." }],
  runtimes: [{ id: "beta-serve", maintainer: "Beta" }],
  specifications: [{ id: "shared-spec", stewards: ["Alpha", "Beta"] }, { id: "other-spec", stewards: ["Community"] }],
  packs: [{ id: "alpha-pack", steward: "Alpha" }],
  projects: [{ id: "alpha-chat" }, { id: "unrelated" }],
};

test("a lab joins every record whose organization field it names", () => {
  const alpha = labRelations(labs[0], labCatalog);
  assert.deepEqual(alpha.models.map(item => item.id), ["alpha-one", "alpha-two", "alpha-early"]);
  assert.deepEqual(alpha.namespaces, ["alpha"]);
  assert.deepEqual(alpha.sourceRows.map(item => item.id), ["alpha-three"]);
  assert.deepEqual(alpha.services.map(item => item.id), ["alpha-api"]);
  assert.deepEqual(alpha.specifications.map(item => item.id), ["shared-spec"]);
  assert.deepEqual(alpha.packs.map(item => item.id), ["alpha-pack"]);
  assert.deepEqual(alpha.systems.map(item => item.id), ["alpha-chat"]);
  const beta = labRelations(labs[1], labCatalog);
  assert.deepEqual(beta.models.map(item => item.id), ["beta-one"], "a unit name the lab lists joins its releases");
  assert.deepEqual(beta.runtimes.map(item => item.id), ["beta-serve"]);
  assert.deepEqual(beta.sourceRows, [], "a namespace with no pending rows adds none");
  assert.deepEqual(labRelations({ catalog_names: ["Nobody"] }, labCatalog).models, []);
});

test("source namespaces are the models.dev directory before the slash", () => {
  assert.equal(sourceNamespace("alpha/one"), "alpha");
  assert.equal(sourceNamespace("alpha/nested/one"), "alpha");
  for (const value of [null, undefined, "", "noslash", "/leading"]) assert.equal(sourceNamespace(value), null);
});

test("lab releases list newest first and fall back to the name when a date is missing", () => {
  const alpha = labRelations(labs[0], labCatalog).models;
  assert.deepEqual(releasesNewestFirst(alpha).map(item => item.id), ["alpha-two", "alpha-one", "alpha-early"]);
  assert.equal(releaseDate(alpha[2]), "");
  assert.deepEqual(alpha.map(item => item.id), ["alpha-one", "alpha-two", "alpha-early"], "sorting copies rather than reorders");
});

test("a stage lists dated records newest first and breaks a shared date by name", () => {
  const { newestDated } = require("../web/app-core.js");
  const records = [
    { id: "late-b", name: "Beta", release: "2026-09-22" },
    { id: "late-a", name: "Alpha", release: "2026-09-22" },
    { id: "mid", name: "Mid", release: "2026-09-21" },
    { id: "undated", name: "Undated", release: "" },
  ];
  const dateOf = record => record.release;
  assert.deepEqual(newestDated(records, dateOf).map(item => item.id), ["late-a", "late-b", "mid"]);
  assert.deepEqual(records.map(item => item.id), ["late-b", "late-a", "mid", "undated"], "sorting copies rather than reorders");
  assert.deepEqual(newestDated([], dateOf), []);
});

test("a lab shows which distribution modes its releases carry, in taxonomy order", () => {
  const alpha = labRelations(labs[0], labCatalog).models;
  assert.deepEqual(labDistributionModes(alpha, ["downloadable_weights", "developer_api", "third_party_hosting"]), ["downloadable_weights", "developer_api", "third_party_hosting"]);
  assert.deepEqual(labDistributionModes(alpha.slice(0, 1), ["downloadable_weights", "developer_api"]), ["developer_api"]);
  assert.deepEqual(labDistributionModes(alpha, []), ["developer_api", "downloadable_weights", "third_party_hosting"]);
});

test("lab filters combine type, headquarters, and release distribution, sorted by name only", () => {
  assert.deepEqual(filterLabs([...labs].reverse(), {}).map(item => item.id), ["lab-alpha", "lab-beta"]);
  assert.deepEqual(filterLabs(labs, { sort: "score" }).map(item => item.id), ["lab-alpha", "lab-beta"]);
  assert.deepEqual(filterLabs(labs, { type: "technology_company" }).map(item => item.id), ["lab-beta"]);
  assert.deepEqual(filterLabs(labs, { headquarters: "us" }).map(item => item.id), ["lab-alpha"]);
  assert.deepEqual(filterLabs(labs, { distribution: "downloadable_weights", models: labCatalog.models }).map(item => item.id), ["lab-alpha", "lab-beta"]);
  assert.deepEqual(filterLabs(labs, { distribution: "third_party_hosting", models: labCatalog.models }).map(item => item.id), ["lab-alpha"]);
  assert.deepEqual(filterLabs(labs, { distribution: "developer_api" }), [], "without models no lab has a release");
});

test("lab search covers names, units, and parent organizations", () => {
  assert.deepEqual(filterLabs(labs, { term: "Beta Research" }).map(item => item.id), ["lab-beta"]);
  assert.deepEqual(filterLabs(labs, { term: "Holdings" }).map(item => item.id), ["lab-alpha"]);
  assert.deepEqual(filterLabs(labs, { term: "Hangzhou", searchIndex: { "lab-beta": "lab-beta beta offices in hangzhou" } }).map(item => item.id), ["lab-beta"]);
});

test("a record dialog finds its lab by its own collection's join rule", () => {
  const index = buildLabIndex(labs, labCatalog.models);
  const ids = (kind, record) => labsForRecord(kind, record, index).map(item => item.id);
  assert.deepEqual(ids("model", labCatalog.models[0]), ["lab-alpha"]);
  assert.deepEqual(ids("model", labCatalog.models[3]), ["lab-alpha"], "an imported row joins through its namespace");
  assert.deepEqual(ids("model", labCatalog.models[6]), [], "a namespace no lab reviewed stays unjoined");
  assert.deepEqual(ids("model", labCatalog.models[5]), []);
  assert.deepEqual(ids("inference", labCatalog.services[0]), ["lab-alpha"]);
  assert.deepEqual(ids("inference", labCatalog.services[1]), []);
  assert.deepEqual(ids("runtime", labCatalog.runtimes[0]), ["lab-beta"]);
  assert.deepEqual(ids("spec", labCatalog.specifications[0]), ["lab-alpha", "lab-beta"]);
  assert.deepEqual(ids("pack", labCatalog.packs[0]), ["lab-alpha"]);
  assert.deepEqual(ids("system", { id: "alpha-chat" }), ["lab-alpha"]);
  assert.deepEqual(ids("system", { id: "unrelated" }), []);
  assert.deepEqual(labsForRecord("model", labCatalog.models[0], null), []);
});

// Related navigation inside a system dialog comes from data the boot payload
// already carries: the same primary role for siblings, superseded_by links
// for previous and next. Active records come first, then names A–Z, and the
// record itself is never listed.
test("a system dialog lists same-role siblings and predecessor and successor links", () => {
  const systems = [
    { id: "alpha-chat", name: "Alpha Chat", primary_role: "general_ai_assistant", status: "active" },
    { id: "beta-chat", name: "Beta Chat", primary_role: "general_ai_assistant", status: "active" },
    { id: "old-chat", name: "Old Chat", primary_role: "general_ai_assistant", status: "archived" },
    { id: "agent-one", name: "Agent One", primary_role: "coding_agent", status: "active", superseded_by: "agent-two" },
    { id: "agent-two", name: "Agent Two", primary_role: "coding_agent", status: "active" },
  ];
  assert.deepEqual(relatedSystems(systems[0], systems).map(item => item.id), ["beta-chat", "old-chat"]);
  assert.deepEqual(relatedSystems(systems[0], systems, 1).map(item => item.id), ["beta-chat"]);
  assert.deepEqual(relatedSystems(systems[3], systems).map(item => item.id), ["agent-two"]);
  assert.equal(successorSystem(systems[3], systems).id, "agent-two");
  assert.equal(successorSystem(systems[4], systems), null);
  assert.deepEqual(predecessorSystems(systems[4], systems).map(item => item.id), ["agent-one"]);
  assert.deepEqual(predecessorSystems(systems[0], systems), []);
});

test("more-from-lab lists same-lab systems besides the record itself", () => {
  const owned = [{ id: "lab-a", name: "A", catalog_names: ["A"], systems: ["chat-a", "chat-b"] }];
  const index = buildLabIndex(owned, []);
  const projects = [
    { id: "chat-a", name: "Chat A", status: "active" },
    { id: "chat-b", name: "Chat B", status: "active" },
    { id: "chat-c", name: "Chat C", status: "active" },
  ];
  const more = moreFromLabSystems(projects[0], { index, projects });
  assert.equal(more.lab.id, "lab-a");
  assert.deepEqual(more.systems.map(item => item.id), ["chat-b"]);
  assert.equal(more.total, 1);
  assert.equal(moreFromLabSystems(projects[2], { index, projects }), null);
});

test("the models lab filter narrows to the ids it is given", () => {
  const ids = new Set(["model-vision"]);
  assert.deepEqual(filterModels(models, { ids }).map(item => item.id), ["model-vision"]);
  assert.equal(filterModels(models, {}).length, models.length);
});

// Rover sorts last by name but carries a stray score higher than any tie
// fallback (robots never carry scores in real data) so that an unpinned
// score sort would put it first; this is what proves the "sorted by name
// only" pin actually does something instead of merely tying on every pair.
const robots = [
  { id: "g-one", name: "G One", manufacturer: "Unibot", description: "A compact humanoid.", form_factor: "humanoid", ai_basis: ["vendor_named_model", "open_model_interface"], availability: "orderable", status: "active", evidence: [{ url: "https://hidden.example/spec" }] },
  { id: "rover", name: "Rover", manufacturer: "Dynamo", description: "A walking inspector.", form_factor: "quadruped", ai_basis: ["open_model_interface"], availability: "enterprise_sales", status: "active", score: { overall: 9 } },
  { id: "old-arm", name: "Atlas Arm", manufacturer: "Dynamo", description: "A bench arm.", form_factor: "arm", ai_basis: ["vendor_named_model"], availability: "research_only", status: "archived" },
];

test("robot filters combine form factor, availability, and status, sorted by name only", () => {
  assert.deepEqual(filterRobots(robots, {}).map(item => item.name), ["Atlas Arm", "G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { sort: "score" }).map(item => item.name), ["Atlas Arm", "G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { formFactor: "quadruped" }).map(item => item.name), ["Rover"]);
  assert.deepEqual(filterRobots(robots, { availability: "orderable" }).map(item => item.name), ["G One"]);
  assert.deepEqual(filterRobots(robots, { aiBasis: "open_model_interface" }).map(item => item.name), ["G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { status: "archived" }).map(item => item.name), ["Atlas Arm"]);
  assert.deepEqual(filterRobots(robots, { formFactor: "arm", status: "active" }), []);
});

test("robot search covers name and maker, reads the index for named models, and never evidence URLs", () => {
  // Both match through their maker alone, so the active robot leads the archived one.
  assert.deepEqual(filterRobots(robots, { term: "dynamo" }).map(item => item.name), ["Rover", "Atlas Arm"]);
  assert.deepEqual(filterRobots(robots, { term: "hidden" }), []);
  assert.deepEqual(filterRobots(robots, { term: "sample-vla", searchIndex: { "g-one": "sample-vla" } }).map(item => item.name), ["G One"]);
});

test("mixed directory browsing includes robots and reads their own index key", () => {
  const entries = filterDirectoryEntries([], [], [], [], { term: "rover" }, [], robots);
  assert.deepEqual(entries.map(item => [item.kind, item.record.name]), [["robot", "Rover"]]);
  assert.deepEqual(
    filterDirectoryEntries([], [], [], [], { term: "onlyinindex", robotSearchIndex: { rover: "onlyinindex" } }, [], robots).map(item => item.record.name),
    ["Rover"],
  );
  assert.deepEqual(filterDirectoryEntries([], [], [], [], { term: "rover" }), []);
});

test("theme preference cycles system, light, dark and recovers from unknown values", () => {
  assert.equal(cycleThemePreference("system"), "light");
  assert.equal(cycleThemePreference("light"), "dark");
  assert.equal(cycleThemePreference("dark"), "system");
  assert.equal(cycleThemePreference("sepia"), "system");
  assert.equal(cycleThemePreference(null), "system");
});

// The stylesheet is themed through custom properties only. Every colour lives
// in the light :root block or in one of the two dark blocks, and the dark
// blocks must define the same tokens with the same values so the OS
// preference and an explicit choice can never drift apart.
function stylesheetBlocks() {
  const css = fs.readFileSync(path.join(__dirname, "..", "web", "styles.css"), "utf8");
  const tokens = text => Object.fromEntries([...text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
  const light = tokens(css.match(/^:root \{([\s\S]*?)^\}/m)[1]);
  const osDark = tokens(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\}\s*\}/)[1]);
  const chosenDark = tokens(css.match(/^:root\[data-theme="dark"\] \{([\s\S]*?)^\}/m)[1]);
  const rest = css
    .replace(/^:root \{[\s\S]*?^\}/m, "")
    .replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\}\s*\}/, "")
    .replace(/^:root\[data-theme="dark"\] \{[\s\S]*?^\}/m, "");
  return { light, osDark, chosenDark, rest };
}

test("both dark token blocks define the same tokens with the same values", () => {
  const { light, osDark, chosenDark } = stylesheetBlocks();
  assert.ok(Object.keys(osDark).length > 20, "dark palette is missing");
  assert.deepEqual(osDark, chosenDark);
  for (const token of Object.keys(osDark)) assert.ok(token in light, `${token} has no light definition`);
});

test("colours outside the token blocks are references, never literals", () => {
  const { rest } = stylesheetBlocks();
  const literals = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:white|black)\b(?!-)/g)].map(match => match[0]);
  assert.deepEqual(literals, []);
});

function indexHTML() {
  return fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
}

// A generator that vendors bytes out of node_modules produces a file that CI
// regenerates from the pinned versions, so a drifted local install is a wrong artifact
// rather than a wrong check. On 2026-09-30 simple-icons 16.32.0 sat in node_modules
// against a 16.33.0 pin in both package.json and package-lock.json: every local
// `--check` passed and CI rejected the committed logos.json on two consecutive runs,
// because logos.json records the version that produced it. Nothing compared the two, so
// the guard is the thing that has to exist rather than a note asking for `npm ci`.
const { assertPinnedInstall, installDrift, pinnedVersion: pinned } = require("../scripts/install_pin.mjs");

test("a generator refuses an install that is not the one CI installs, and says how to fix it", () => {
  assert.deepEqual(
    installDrift(["icons", "fonts"], {
      pinned: name => (name === "icons" ? "16.33.0" : "5.3.0"),
      installed: name => (name === "icons" ? "16.32.0" : "5.3.0"),
    }),
    [{ name: "icons", installed: "16.32.0", locked: "16.33.0", problem: "installed 16.32.0, pinned 16.33.0" }],
    "one entry per drifted package, naming both versions",
  );
  assert.throws(
    () => assertPinnedInstall(["icons"], { pinned: () => "16.33.0", installed: () => "16.32.0" }),
    /npm ci --ignore-scripts/,
    "the error has to name the command that fixes it",
  );
  // A package that is merely absent is drift, and `npm ci` fixes it. A name the
  // lockfile never declared is a repository defect that `npm ci` cannot fix, so it must
  // not be dressed as a version mismatch with that remedy attached.
  assert.deepEqual(installDrift(["icons"], { pinned: () => "1.0.0", installed: () => null }).map(d => d.problem), ["not installed"]);
  assert.throws(() => installDrift(["undeclared"]), /not a declared dependency in package-lock\.json/);
});

test("this checkout's packages are the pinned ones, which is what makes a passing freshness check mean anything", () => {
  for (const name of ["@lobehub/icons-static-svg", "simple-icons", "@fontsource/ibm-plex-sans", "@fontsource-variable/bricolage-grotesque", "@fontsource-variable/jetbrains-mono"]) {
    assert.deepEqual(installDrift([name]), [], `${name} is not installed at the pinned version; run npm ci --ignore-scripts`);
  }
  // Both artifacts already record the version that produced them, so a stamp that
  // disagrees with the lock is the exact shape of the failure and is checkable here
  // without regenerating either file.
  const logos = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "logos.json"), "utf8"));
  assert.equal(logos.sources.simple.version, pinned("simple-icons"), "logos.json records the simple-icons version it was built from");
  assert.equal(logos.sources.lobe.version, pinned("@lobehub/icons-static-svg"), "logos.json records the lobehub version it was built from");
  const fonts = fs.readFileSync(path.join(__dirname, "..", "web", "fonts.css"), "utf8");
  for (const [, name, version] of fonts.matchAll(/(@fontsource[a-z-]*\/[a-z0-9-]+)@([0-9][^ ]*?)(?: \(|$)/gm)) {
    assert.equal(version, pinned(name), `fonts.css records ${name}@${version}`);
  }
});

const { DETAIL_VERSION_KEY, PLACEHOLDER, pageFiles, readDetailTree, readPageAsset, stampAssetVersions, violations } =
  require("../scripts/build_asset_version.mjs");

// ADR 050: committed pages carry PLACEHOLDER, and the deploy job substitutes content
// hashes. So the committed file cannot be checked for a correct hash any more, and the
// coverage that check used to give is asserted against the stamper's *output* instead:
// the guarantee that a changed asset is never served from a stale cache still has to
// hold, it just lives in a function call rather than in a committed line.
const webRoot = path.join(__dirname, "..", "web");
const stampedPage = (name = "index.html") => {
  const page = path.join(webRoot, name);
  return stampAssetVersions(fs.readFileSync(page, "utf8"), readPageAsset(page), readDetailTree);
};
const stampsOf = (html) => new Map([...html.matchAll(/(?:href|src)="([\w./-]+)\?v=([^"]*)"/g)].map(m => [m[1], m[2]]));
const dataVersionsOf = (html) => JSON.parse(html.match(/id="data-versions">([^<]*)</)[1]);

test("no committed page carries a content hash, which is what makes hash-only merge conflicts impossible", () => {
  const committed = pageFiles().map(page => violations(page, fs.readFileSync(page, "utf8"))).flat();
  assert.deepEqual(committed, [], `a deploy build was committed, or a reference is broken:\n  ${committed.join("\n  ")}`);
  for (const page of pageFiles()) {
    const html = fs.readFileSync(page, "utf8");
    for (const [file, version] of stampsOf(html)) {
      assert.equal(version, PLACEHOLDER, `${page} references ${file} under ?v=${version}, not the placeholder`);
    }
  }
});

test("the deploy stamper resolves every page's references, so one file changed on one branch moves only that file's stamp", () => {
  const app = stampsOf(stampedPage("index.html"));
  assert.deepEqual([...app.keys()].sort(), ["app-core.js", "app.js", "fonts.css", "styles.css"]);
  for (const [file, version] of app) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(webRoot, file))).digest("hex").slice(0, 12);
    assert.equal(version, digest, `${file} would be published as ?v=${version} but hashes to ${digest}`);
  }
  // The blog reaches the same two stylesheets by a different, page-relative path and must
  // land on the same hashes, which is the whole point of one implementation replacing the
  // second copy this module used to have in build_blog.py.
  for (const page of pageFiles().filter(name => name.includes(`${sep}blog${sep}`))) {
    for (const [file, version] of stampsOf(stampedPage(relative(webRoot, page)))) {
      const shared = file.replace(/^(\.\.\/)+/, "");
      assert.equal(version, app.get(shared), `${relative(webRoot, page)} and the app disagree on ${shared}`);
    }
  }
});

test("every catalog file app.js fetches is stamped at deploy so the data can be cached", () => {
  const fetched = [...fs.readFileSync(path.join(webRoot, "app.js"), "utf8")
    .matchAll(/loadJSON\("([\w./-]+)"\)/g)].map(match => match[1]);
  const committed = dataVersionsOf(indexHTML());
  for (const file of fetched) {
    assert.ok(file in committed, `app.js fetches ${file} but index.html does not stamp it`);
  }
  const stamped = dataVersionsOf(stampedPage());
  for (const [file, version] of Object.entries(stamped)) {
    if (file === DETAIL_VERSION_KEY) continue; // one shared stamp over a directory, not a single file's hash
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(webRoot, file))).digest("hex").slice(0, 12);
    assert.equal(version, digest, `${file} would be published as ${version} but hashes to ${digest}`);
  }
});

// The two loops above exempt app/detail because it stamps a tree rather than a file.
// Nothing else checked its value, so a builder whose hashing changed -- or one whose
// stamp depended on where the checkout lived -- was invisible here. This recomputes it
// independently: over the whole tree, in sorted order, under each file's slash-separated
// path relative to the detail root.
test("the shared app/detail stamp hashes every detail file's content under a checkout-independent name", () => {
  const detailRoot = path.join(webRoot, "app", "detail");
  const names = fs.readdirSync(detailRoot, { recursive: true })
    .filter(name => fs.statSync(path.join(detailRoot, name)).isFile())
    .map(name => name.split(path.sep).join("/"))
    .sort();
  assert.ok(names.length > 200, `only ${names.length} detail files walked; the tree should hold one per record`);
  assert.ok(names.every(name => !path.isAbsolute(name)), "a stamp over absolute paths differs between checkouts");
  const hash = crypto.createHash("sha256");
  for (const name of names) {
    hash.update(Buffer.from(name));
    hash.update(fs.readFileSync(path.join(detailRoot, name)));
  }
  const versions = dataVersionsOf(stampedPage());
  assert.equal(versions[DETAIL_VERSION_KEY], hash.digest("hex").slice(0, 12),
    `app/detail would be published as ${versions[DETAIL_VERSION_KEY]} but the tree hashes to something else`);
});

test("every app payload class is versioned at deploy, with one shared stamp for detail", () => {
  const versions = dataVersionsOf(stampedPage());
  for (const collection of ["systems", "inference", "runtimes", "specifications", "packs", "labs", "robots"]) {
    assert.match(versions[`app/${collection}.json`], /^[0-9a-f]{12}$/);
    assert.match(versions[`app/search/${collection}.json`], /^[0-9a-f]{12}$/);
  }
  assert.match(versions[DETAIL_VERSION_KEY], /^[0-9a-f]{12}$/);
  const perRecord = Object.keys(versions).filter(key => key.startsWith("app/detail/"));
  assert.deepEqual(perRecord, [], "detail files share one stamp; they are not versioned individually");
});

test("the stamper refuses to leave a page half-stamped, so a deploy cannot ship mixed freshness", () => {
  const once = stampedPage();
  const twice = stampAssetVersions(once, readPageAsset(path.join(webRoot, "index.html")), readDetailTree);
  assert.equal(twice, once, "stamping an already-stamped page changed it again");
});

test("the app does not disable the HTTP cache it just earned a content hash for", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  assert.ok(!/cache:\s*"no-store"/.test(app), "app.js re-disables caching; the ?v= stamp already guarantees freshness");
});

test("the primary navigation links to the blog, so it is found by scanning the nav", () => {
  const html = indexHTML();
  assert.match(html, /<nav class="tabs" aria-label="Primary navigation">[\s\S]*?href="blog\/">Blog<\/a>/,
    "index.html should link to blog/ from the primary navigation");
});

test("the GitHub link is an icon with an accessible name rather than visible text", () => {
  const link = indexHTML().match(/<a class="github-link"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(link, "no .github-link anchor in index.html");
  assert.match(link[0], /aria-label="GitHub"/);
  assert.match(link[1], /^\s*<svg[^>]*aria-hidden="true"[^>]*>[\s\S]*<\/svg>\s*$/, "the link body must be exactly one hidden SVG with no visible text");
});

test("corner radii outside the token block are references, never literals", () => {
  const { light, rest } = stylesheetBlocks();
  for (const token of ["--radius", "--radius-control", "--radius-chip"]) assert.ok(token in light, `${token} is not defined on :root`);
  const literals = [...rest.matchAll(/border-radius:\s*([^;]+);/g)].map(match => match[1].trim()).filter(value => !/^(?:0|50%|var\(--radius(?:-\w+)?\))$/.test(value));
  assert.deepEqual(literals, []);
});

test("pagination slices an exact multiple of the page size into full pages", () => {
  const items = Array.from({ length: 48 }, (_, index) => index);
  const first = paginate(items, { page: 1, pageSize: 24 });
  assert.deepEqual(first, { items: items.slice(0, 24), page: 1, pageCount: 2, totalCount: 48 });
  const second = paginate(items, { page: 2, pageSize: 24 });
  assert.deepEqual(second, { items: items.slice(24, 48), page: 2, pageCount: 2, totalCount: 48 });
});

test("pagination gives the last page fewer items when the count doesn't divide evenly", () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  const result = paginate(items, { page: 3, pageSize: 24 });
  assert.deepEqual(result, { items: items.slice(48, 50), page: 3, pageCount: 3, totalCount: 50 });
});

test("pagination clamps a page past the end down to the last page", () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  const result = paginate(items, { page: 10, pageSize: 24 });
  assert.deepEqual(result, { items: items.slice(48, 50), page: 3, pageCount: 3, totalCount: 50 });
});

test("pagination clamps a page below one up to the first page", () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  const result = paginate(items, { page: 0, pageSize: 24 });
  assert.deepEqual(result, { items: items.slice(0, 24), page: 1, pageCount: 3, totalCount: 50 });
});

test("pagination of an empty list yields one empty page rather than page zero", () => {
  const result = paginate([], { page: 1, pageSize: 24 });
  assert.deepEqual(result, { items: [], page: 1, pageCount: 1, totalCount: 0 });
});

test("llms.txt starts with an H1 title and a blockquote summary", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  assert.match(text, /^# [^\n]+\n\n> [^\n]+\n/);
});

test("llms.txt only links to files that actually exist", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length > 0, "llms.txt has no links");
  const builder = fs.readFileSync(path.join(__dirname, "..", "scripts", "page_shell.py"), "utf8");
  const siteUrlMatch = builder.match(/SITE_URL = "([^"]+)"/);
  assert.ok(siteUrlMatch, "could not find SITE_URL in scripts/page_shell.py");
  const siteRoot = siteUrlMatch[1];
  const repoBlobRoot = "https://github.com/katagun/ai-systems-atlas/blob/main/";
  for (const link of links) {
    if (link.startsWith(siteRoot)) {
      const file = link.slice(siteRoot.length);
      assert.ok(fs.existsSync(path.join(__dirname, "..", "web", file)), `llms.txt links to missing web/${file}`);
    } else if (link.startsWith(repoBlobRoot)) {
      const file = link.slice(repoBlobRoot.length);
      assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `llms.txt links to missing ${file}`);
    } else {
      assert.fail(`llms.txt link ${link} is neither a site link nor a GitHub blob link: ${link}`);
    }
  }
});

test("llms.txt's site links use the same origin as the share-page builder", () => {
  const llms = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  const builder = fs.readFileSync(path.join(__dirname, "..", "scripts", "page_shell.py"), "utf8");
  const match = builder.match(/SITE_URL = "([^"]+)"/);
  assert.ok(match, "could not find SITE_URL in scripts/page_shell.py");
  const [, siteUrl] = match;
  const siteLinks = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(m => m[1]).filter(link => !link.startsWith("https://github.com/"));
  assert.ok(siteLinks.length > 0, "llms.txt has no site-origin links to check");
  for (const link of siteLinks) assert.ok(link.startsWith(siteUrl), `${link} does not start with SITE_URL (${siteUrl}); update llms.txt if the domain changed`);
});

test("llms.txt's Data section lists exactly the published catalog files", () => {
  const llms = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  // The published set is defined once, in scripts/catalog.py. It used to be restated
  // in scripts/validate_directory.py, which is why this test scraped that file's
  // source; scraping the registry instead means a redefinition there is what fails.
  const registry = fs.readFileSync(path.join(__dirname, "..", "scripts", "catalog.py"), "utf8");
  const match = registry.match(/PUBLISHED_DATA = \(([\s\S]*?)\n\)/);
  assert.ok(match, "could not find PUBLISHED_DATA in scripts/catalog.py");
  const published = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  const dataSection = llms.split("## Data")[1].split("## Reference")[0];
  const linked = [...dataSection.matchAll(/\]\(https:\/\/[^)]*\/([a-z-]+\.json)\)/g)].map(m => m[1]).sort();
  assert.deepEqual(linked, published);
});

test("the API view lists exactly the published catalog files", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  // The published set is defined once, in scripts/catalog.py. It used to be restated
  // in scripts/validate_directory.py, which is why this test scraped that file's
  // source; scraping the registry instead means a redefinition there is what fails.
  const registry = fs.readFileSync(path.join(__dirname, "..", "scripts", "catalog.py"), "utf8");
  const match = registry.match(/PUBLISHED_DATA = \(([\s\S]*?)\n\)/);
  assert.ok(match, "could not find PUBLISHED_DATA in scripts/catalog.py");
  const published = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  const linked = [...html.matchAll(/class="endpoint-link" href="https:\/\/[^"]*\/([a-z-]+\.json)"/g)].map(m => m[1]).sort();
  assert.deepEqual(linked, published);
});

test("the API view's endpoint links use the same origin as the share-page builder", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(__dirname, "..", "scripts", "page_shell.py"), "utf8");
  const match = builder.match(/SITE_URL = "([^"]+)"/);
  assert.ok(match, "could not find SITE_URL in scripts/page_shell.py");
  const [, siteUrl] = match;
  const links = [...html.matchAll(/class="endpoint-link" href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(links.length > 0, "the API view has no endpoint links to check");
  for (const link of links) assert.ok(link.startsWith(siteUrl), `${link} does not start with SITE_URL (${siteUrl}); update index.html if the domain changed`);
});

test("every primary navigation tab is addressable as a view parameter", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const tabs = [...html.matchAll(/class="tab[^"]*" data-tab="([a-z-]+)"/g)].map(m => m[1]);
  assert.ok(tabs.length > 0, "index.html has no primary navigation tabs");
  for (const tab of tabs) assert.equal(parseViewId(tab), tab, `${tab} is a tab but not an addressable view`);
  for (const view of ["explore", "taxonomy", "api"]) {
    assert.match(html, new RegExp(`data-open-view="${view}"`), `${view} is reachable through the Docs menu`);
    assert.equal(parseViewId(view), view, `${view} is a Docs item but not an addressable view`);
  }
});

test("legacy sibling-view URLs resolve to their unified collection", () => {
  assert.equal(parseViewAlias("models"), "models");
  assert.equal(parseViewAlias("labs"), "labs");
  assert.equal(parseViewAlias("specifications"), "specifications");
  assert.equal(parseViewAlias("directory"), null);
  assert.equal(parseViewAlias("taxonomy"), null);
  assert.equal(parseViewAlias("constructor"), null);
  assert.equal(scopeFromURL(new URLSearchParams("view=models")), "models");
  assert.equal(scopeFromURL(new URLSearchParams("collection=models")), "models");
  assert.equal(scopeFromURL(new URLSearchParams("collection=labs")), "labs");
  assert.equal(scopeFromURL(new URLSearchParams("collection=specifications")), "specifications");
});

test("an unknown or malformed view parameter resolves to no view", () => {
  assert.equal(parseViewId("records"), null);
  assert.equal(parseViewId(""), null);
  assert.equal(parseViewId(null), null);
  assert.equal(parseViewId(undefined), null);
  assert.equal(parseViewId("API"), null);
  assert.equal(parseViewId("constructor"), null);
});

const badgeNames = badges => badges.map(badge => badge.name);
const isTypeBadge = id => CARD_BADGES[id].family === "type";

test("agent-system badges lead with the type and follow priority order, showing every match", () => {
  const record = {
    system_family: "agent_system",
    local_first: true,
    execution_boundaries: ["host", "container"],
    agent_capabilities: ["mcp", "browser_control"],
    deployment: ["self_hosted"],
  };
  assert.deepEqual(badgeNames(cardBadges("system", record)), ["Agent system", "Local-first", "Sandboxed execution", "Browser control", "MCP", "Self-hostable"]);
  assert.deepEqual(cardBadges("system", record).map(badge => badge.family), ["type", "control", "control", "capability", "capability", "control"]);
});

// A set may list a type badge for every value of its type field, but they all
// test that one field for one value each, so a card matches at most one of
// them. The cap therefore bounds one type badge plus the set's traits.
test("no card can overflow the cap of six: one type badge plus its set's traits", () => {
  for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
    const types = ids.filter(isTypeBadge);
    assert.ok(types.length > 0, `${key} lists no type badge`);
    assert.deepEqual(ids.slice(0, types.length), types, `${key} must list its type badges first`);
    assert.equal(new Set(types.map(id => CARD_BADGES[id].test.field)).size, 1, `${key} type badges must all test one field`);
    assert.equal(new Set(types.map(id => CARD_BADGES[id].test.equals)).size, types.length, `${key} type badges must test distinct values`);
    assert.ok(1 + ids.length - types.length <= MAX_CARD_BADGES, `${key} can show ${1 + ids.length - types.length} badges`);
  }
});

test("badges come from the record's own family", () => {
  const memory = {
    system_family: "memory_system",
    local_first: false,
    human_editable: true,
    retrieval_modes: ["graph_traversal"],
    architectures: ["plain_files"],
    agent_capabilities: ["mcp"],
  };
  assert.deepEqual(badgeNames(cardBadges("system", memory)), ["Memory system", "Editable by you", "Graph retrieval", "Plain files"]);
  assert.deepEqual(badgeNames(cardBadges("system", { system_family: "agent_system", human_editable: true })), ["Agent system"]);
});

test("missing, null, false, empty, and non-boolean fields never produce a trait badge", () => {
  const records = [
    { system_family: "agent_system" },
    { system_family: "agent_system", local_first: null, execution_boundaries: null, agent_capabilities: [], deployment: [] },
    { system_family: "agent_system", local_first: false },
    { system_family: "agent_system", local_first: "true" },
    { system_family: "agent_system", deployment: "self_hosted" },
  ];
  for (const record of records) assert.deepEqual(badgeNames(cardBadges("system", record)), ["Agent system"], JSON.stringify(record));
});

test("a type badge needs its type field to equal one value exactly", () => {
  for (const service_type of [undefined, null, "", "Direct model API", ["direct_model_api"], "constructor"]) {
    assert.deepEqual(cardBadges("inference", { service_type, delivery_modes: ["batch"] }).map(badge => badge.id), ["batch"], JSON.stringify(service_type));
  }
  assert.deepEqual(badgeNames(cardBadges("inference", { service_type: "routing_aggregator" })), ["Routing aggregator"]);
});

test("specifications, packs, and labs carry only their type; imported rows only the source record", () => {
  assert.deepEqual(badgeNames(cardBadges("spec", { specification_type: "protocol", status: "published", licenses: ["MIT"] })), ["Protocol"]);
  assert.deepEqual(badgeNames(cardBadges("pack", packs[0])), ["Process kit"]);
  assert.deepEqual(badgeNames(cardBadges("lab", labs[1])), ["Technology company"]);
  // An imported row has no reviewed field, so even a row carrying every
  // distribution mode takes the source-record badge and nothing else.
  for (const record of [
    { review_status: "imported" },
    { review_status: "imported", model_type: "language_model", distribution_modes: ["downloadable_weights", "developer_api", "third_party_hosting"] },
  ]) assert.deepEqual(badgeNames(cardBadges("model", record)), ["Source record"], JSON.stringify(record));
  // The gate is an allow-list on review_status: a malformed or future-status
  // record takes no badge, even carrying every mode and a type.
  assert.deepEqual(cardBadges("model", { model_type: "language_model", distribution_modes: ["downloadable_weights", "developer_api", "third_party_hosting"] }), []);
  assert.deepEqual(cardBadges("model", { review_status: "retracted", model_type: "language_model" }), []);
  assert.deepEqual(cardBadges("toString", { local_first: true }), []);
  assert.deepEqual(cardBadges("system", { system_family: "constructor", local_first: true }), []);
  assert.deepEqual(badgeNames(cardBadges("robot", { form_factor: "quadruped" })), ["Quadruped"]);
});

// Reviewed-model cards trade their role pill for the same distribution_modes
// fact printed as up to three emblems, in the taxonomy's own priority order.
test("reviewed-model badges test distribution_modes, in taxonomy order, and every reviewed model carries at least one", () => {
  assert.deepEqual(
    badgeNames(cardBadges("model", { review_status: "reviewed", distribution_modes: ["downloadable_weights"] })),
    ["Downloadable weights"],
  );
  assert.deepEqual(
    badgeNames(cardBadges("model", { review_status: "reviewed", distribution_modes: ["third_party_hosting", "developer_api"] })),
    ["Developer API", "Third-party hosting"],
  );
  assert.deepEqual(
    badgeNames(cardBadges("model", { review_status: "reviewed", distribution_modes: ["third_party_hosting", "developer_api", "downloadable_weights"] })),
    ["Downloadable weights", "Developer API", "Third-party hosting"],
  );
  assert.deepEqual(cardBadges("model", { review_status: "reviewed", distribution_modes: [] }), []);
  assert.deepEqual(cardBadges("model", { review_status: "reviewed" }), []);
  assert.deepEqual(
    badgeNames(cardBadges("model", { review_status: "reviewed", model_type: "multimodal_language_model", distribution_modes: ["developer_api"] })),
    ["Multimodal language model", "Developer API"],
  );
});

test("inference-service and local-runtime badges skip facts their cards already print", () => {
  assert.deepEqual(
    badgeNames(cardBadges("inference", { model_sources: ["customer_supplied"], delivery_modes: ["batch", "dedicated_endpoint"], api_styles: ["anthropic_compatible"] })),
    ["Dedicated endpoints", "Batch"],
  );
  assert.deepEqual(
    badgeNames(cardBadges("runtime", { accelerators: ["cuda", "metal"], serving_modes: ["distributed_serving"], api_styles: ["anthropic_compatible"] })),
    ["Apple Metal", "Distributed serving"],
  );
});

// Role pills print api_styles (services, runtimes) and distribution_modes
// (models); service footers print model_sources. A trait badge on those fields
// would repeat the card to itself. The type badge is the one deliberate
// restatement: it repeats the type the eyebrow prints, as an emblem.
test("no trait badge tests a field its card already prints", () => {
  const printed = { inference: ["api_styles", "model_sources"], runtime: ["api_styles"], model: ["model_type", "source_model", "licenses"] };
  for (const [key, fields] of Object.entries(printed)) {
    for (const id of CARD_BADGE_SETS[key].filter(id => !isTypeBadge(id))) {
      assert.ok(!fields.includes(CARD_BADGES[id].test.field), `${id} repeats ${CARD_BADGES[id].test.field}, which ${key} cards already print`);
    }
  }
});

test("the data model quotes the trait badge definitions verbatim", () => {
  const dataModel = fs.readFileSync(path.join(__dirname, "..", "docs", "DATA_MODEL.md"), "utf8");
  for (const [id, field] of [["local-first", "local_first"], ["editable-by-you", "human_editable"]]) {
    assert.equal(CARD_BADGES[id].test.field, field, `${id} must test ${field}`);
    assert.ok(
      dataModel.includes(`\`${field}\`: "${CARD_BADGES[id].definition}"`),
      `docs/DATA_MODEL.md must quote the ${CARD_BADGES[id].name} badge definition verbatim for ${field}`,
    );
  }
});

test("every badge list names a defined badge and every defined badge is listed", () => {
  const listed = new Set(Object.values(CARD_BADGE_SETS).flat());
  for (const id of listed) assert.ok(Object.hasOwn(CARD_BADGES, id), `${id} is listed but not defined`);
  for (const id of Object.keys(CARD_BADGES)) assert.ok(listed.has(id), `${id} is defined but never shown`);
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    assert.ok(badge.name && badge.definition, `${id} needs a name and a definition`);
    assert.ok(Array.isArray(badge.test.anyOf) ? badge.test.anyOf.length > 0 : badge.test.anyOf === undefined, `${id} has a malformed test`);
    // Type badges test one value exactly; trait badges test presence.
    if (badge.family === "type") assert.ok(typeof badge.test.equals === "string" && badge.test.anyOf === undefined, `${id} must test one value with equals`);
    else assert.equal(badge.test.equals, undefined, `${id} is a trait badge and must not test equality`);
  }
});

test("the badge glossary lists each badge once with every place it appears", () => {
  const glossary = cardBadgeGlossary();
  assert.equal(glossary.length, Object.keys(CARD_BADGES).length);
  assert.equal(new Set(glossary.map(entry => entry.name)).size, glossary.length);
  assert.deepEqual(glossary.find(entry => entry.id === "local-first").scopes, ["Agent systems", "Memory systems", "Assistant systems"]);
  assert.deepEqual(glossary.find(entry => entry.id === "self-hostable").scopes, ["Agent systems", "Assistant systems"]);
});

test("every badge belongs to one family and owns a unique glyph", () => {
  assert.deepEqual(Object.keys(BADGE_FAMILIES), ["type", "control", "capability", "platform"]);
  const css = fs.readFileSync(path.join(__dirname, "..", "web", "styles.css"), "utf8");
  for (const [id, family] of Object.entries(BADGE_FAMILIES)) {
    assert.ok(family.name && family.meaning && family.frame, `${id} needs a name, a meaning, and a frame`);
    assert.match(family.token, /^--[a-z-]+$/);
    assert.ok(css.includes(`${family.token}:`), `${family.token} is not a token in styles.css`);
    assert.ok(css.includes(`[data-family="${id}"] { color: var(${family.token}); }`), `styles.css must colour family ${id} with ${family.token}`);
  }
  const glyphs = new Set();
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    assert.ok(Object.hasOwn(BADGE_FAMILIES, badge.family), `${id} has unknown family ${badge.family}`);
    assert.ok(badge.glyph, `${id} needs a glyph`);
    assert.ok(!glyphs.has(badge.glyph), `${id} reuses another badge's glyph`);
    glyphs.add(badge.glyph);
  }
  for (const [id, text] of [["apple-metal", "MTL"], ["amd-rocm", "ROC"], ["npu", "NPU"]]) assert.ok(CARD_BADGES[id].glyph.includes(`>${text}</text>`), `${id} must be lettered ${text}`);
  assert.equal(cardBadgeGlossary().find(entry => entry.id === "mcp").family, "capability");
});

test("emblems are hidden decorative SVG built from the family frame and the badge glyph", () => {
  const svg = badgeEmblem("local-first");
  assert.match(svg, /^<svg class="badge-emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false">/);
  assert.ok(svg.includes(`d="${BADGE_FAMILIES.control.frame}"`));
  assert.ok(svg.includes(CARD_BADGES["local-first"].glyph));
  assert.ok(familyEmblem("platform").includes(`d="${BADGE_FAMILIES.platform.frame}"`));
  assert.ok(!familyEmblem("platform").includes("badge-glyph"));
});

test("the legend lists only what the active scope can show", () => {
  const ids = legend => legend.badges.map(badge => badge.id);
  const inFamilyOrder = list => [...list].sort((a, b) =>
    Object.keys(BADGE_FAMILIES).indexOf(CARD_BADGES[a].family) - Object.keys(BADGE_FAMILIES).indexOf(CARD_BADGES[b].family));
  assert.deepEqual(ids(badgeLegend("inference")), inFamilyOrder(CARD_BADGE_SETS.inference));
  assert.deepEqual(ids(badgeLegend("inference")).slice(0, 4), ["direct-model-api", "cloud-model-platform", "managed-inference-host", "routing-aggregator"]);
  assert.deepEqual(ids(badgeLegend("systems", "agent_system")), ["agent-system", "local-first", "sandboxed-execution", "self-hostable", "browser-control", "mcp"]);
  const systems = badgeLegend("systems");
  assert.equal(systems.mode, "badges");
  assert.equal(new Set(ids(systems)).size, ids(systems).length, "each badge once");
  assert.deepEqual(new Set(ids(systems)), new Set([...CARD_BADGE_SETS["system:agent_system"], ...CARD_BADGE_SETS["system:memory_system"], ...CARD_BADGE_SETS["system:assistant_system"]]));
  const families = systems.badges.map(badge => Object.keys(BADGE_FAMILIES).indexOf(badge.family));
  assert.deepEqual(families, [...families].sort((a, b) => a - b), "grouped by family in registry order");
  for (const scope of ["all", "packs"]) {
    assert.equal(badgeLegend(scope).mode, "families");
    assert.deepEqual(badgeLegend(scope).families.map(family => family.id), ["type", "control", "capability", "platform"]);
  }
  // Models lists reviewed and imported rows together, so its legend names the
  // reviewed set and the source-record badge, types first.
  assert.deepEqual(ids(badgeLegend("models")), ["language-model", "multimodal-language-model", "image-generation-model", "video-generation-model", "audio-generation-model", "source-record", "downloadable-weights", "developer-api", "third-party-hosting"]);
  assert.deepEqual(ids(badgeLegend("specifications")), CARD_BADGE_SETS.spec);
  assert.deepEqual(ids(badgeLegend("labs")), CARD_BADGE_SETS.lab);
  assert.equal(badgeLegend("systems", "constructor"), null);
  assert.equal(badgeLegend("toString"), null);
});

// Published-data guards: a renamed taxonomy value or a badge nothing can earn
// fails here instead of silently emptying cards.
const readWebJSON = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", file), "utf8"));

const BADGE_FIELD_VOCABULARIES = {
  execution_boundaries: "execution_boundaries",
  agent_capabilities: "agent_capabilities",
  deployment: "deployment_modes",
  retrieval_modes: "retrieval_modes",
  architectures: "architectures",
  model_sources: "inference_model_sources",
  delivery_modes: "inference_delivery_modes",
  api_styles: "inference_api_styles",
  accelerators: "runtime_accelerators",
  serving_modes: "runtime_serving_modes",
  distribution_modes: "model_distribution_modes",
};

// Each type field and the vocabulary its values come from. An imported row's
// review_status is set by the payload builder, not the taxonomy.
const TYPE_FIELD_VOCABULARIES = {
  system_family: "system_families",
  service_type: "inference_service_types",
  runtime_type: "local_runtime_types",
  model_type: "model_types",
  specification_type: "specification_types",
  pack_type: "pack_types",
  lab_type: "lab_types",
  form_factor: "robot_form_factors",
};

test("every value a badge tests exists in its taxonomy vocabulary", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    if (badge.test.equals !== undefined) {
      if (badge.test.field === "review_status") {
        assert.equal(badge.test.equals, "imported", `${id} may only mark an imported row`);
        continue;
      }
      const group = TYPE_FIELD_VOCABULARIES[badge.test.field];
      assert.ok(group, `${id} tests ${badge.test.field}, which is not a type field`);
      assert.ok(taxonomy[group].some(item => item.id === badge.test.equals), `${id} names unknown ${group} value ${badge.test.equals}`);
      // System families are named in the plural ("Memory systems"); a badge names one record.
      const taxonomyName = taxonomy[group].find(item => item.id === badge.test.equals).name;
      assert.equal(badge.name, group === "system_families" ? taxonomyName.replace(/s$/, "") : taxonomyName, `${id} must carry its taxonomy name`);
      continue;
    }
    if (!badge.test.anyOf) continue;
    const group = BADGE_FIELD_VOCABULARIES[badge.test.field];
    assert.ok(group, `${id} tests ${badge.test.field}, which has no known vocabulary`);
    const known = new Set(taxonomy[group].map(item => item.id));
    for (const value of badge.test.anyOf) assert.ok(known.has(value), `${id} names unknown ${group} value ${value}`);
  }
});

// A new type value without a badge would leave its cards without one, so every
// value of every type vocabulary must have a type badge in the matching set.
test("every value of every type vocabulary has a type badge", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const setsFor = { system_family: key => key.startsWith("system:"), service_type: key => key === "inference", runtime_type: key => key === "runtime", model_type: key => key === "model", specification_type: key => key === "spec", pack_type: key => key === "pack", lab_type: key => key === "lab", form_factor: key => key === "robot" };
  for (const [field, group] of Object.entries(TYPE_FIELD_VOCABULARIES)) {
    const listed = Object.entries(CARD_BADGE_SETS).filter(([key]) => setsFor[field](key)).flatMap(([, ids]) => ids).filter(id => CARD_BADGES[id].test.field === field);
    const covered = new Set(listed.map(id => CARD_BADGES[id].test.equals));
    for (const { id } of taxonomy[group]) assert.ok(covered.has(id), `${group} value ${id} has no type badge`);
  }
  for (const family of taxonomy.system_families) {
    const types = CARD_BADGE_SETS[`system:${family.id}`].filter(isTypeBadge);
    assert.deepEqual(types.map(id => CARD_BADGES[id].test.equals), [family.id], `system:${family.id} must list exactly its own family badge`);
  }
});

function publishedBadgeScopes() {
  const projects = readWebJSON("projects.json").projects;
  const family = name => ["system", projects.filter(record => record.system_family === name)];
  // The reviewed catalog (models.json) carries no review_status field of its
  // own — only the merged boot payload marks reviewed vs imported — so read
  // the boot payload here, split the same way cardBadgeSetKey gates.
  const bootModels = readWebJSON("app/models.json").models;
  return {
    "system:agent_system": family("agent_system"),
    "system:memory_system": family("memory_system"),
    "system:assistant_system": family("assistant_system"),
    inference: ["inference", readWebJSON("inference-services.json").services],
    runtime: ["runtime", readWebJSON("local-runtimes.json").runtimes],
    model: ["model", bootModels.filter(record => record.review_status === "reviewed")],
    "model-source": ["model", bootModels.filter(record => record.review_status === "imported")],
    spec: ["spec", readWebJSON("specifications.json").specifications],
    pack: ["pack", readWebJSON("packs.json").packs],
    lab: ["lab", readWebJSON("labs.json").labs],
    robot: ["robot", readWebJSON("robots.json").robots],
  };
}

// Trait badges must be earned by some published card. A type badge exists for
// every value of its vocabulary, whether or not a record carries it yet.
test("every trait badge appears on at least one published card in each place it is listed", () => {
  const scopes = publishedBadgeScopes();
  assert.deepEqual(Object.keys(scopes).sort(), Object.keys(CARD_BADGE_SETS).sort());
  for (const [scope, ids] of Object.entries(CARD_BADGE_SETS)) {
    const [kind, records] = scopes[scope];
    assert.ok(records.length > 0, `${scope} has no published records`);
    for (const id of ids.filter(id => !isTypeBadge(id))) {
      assert.ok(records.some(record => cardBadges(kind, record).some(badge => badge.id === id)), `${id} never appears on a ${scope} card`);
    }
  }
});

test("every published card carries exactly one type badge, and it leads the row", () => {
  for (const [scope, [kind, records]] of Object.entries(publishedBadgeScopes())) {
    for (const record of records) {
      const badges = cardBadges(kind, record);
      assert.ok(badges.length > 0 && badges.length <= MAX_CARD_BADGES, `${scope}/${record.id} shows ${badges.length} badges`);
      assert.equal(badges[0].family, "type", `${scope}/${record.id} does not lead with its type`);
      assert.equal(badges.filter(badge => badge.family === "type").length, 1, `${scope}/${record.id} shows more than one type badge`);
    }
  }
});

// Cards paint from the boot payload before any detail file lands, so every
// field a badge tests must be in boot for every record that carries it.
test("every field a badge tests reaches the boot payload", () => {
  const boots = {
    system: [readWebJSON("projects.json").projects, readWebJSON("app/systems.json").systems],
    inference: [readWebJSON("inference-services.json").services, readWebJSON("app/inference.json").inference],
    runtime: [readWebJSON("local-runtimes.json").runtimes, readWebJSON("app/runtimes.json").runtimes],
    model: [readWebJSON("models.json").models, readWebJSON("app/models.json").models],
    // review_status is added by the payload builder, so no published row has
    // it and the loop below checks nothing here beyond the join.
    "model-source": [readWebJSON("models-dev.json").models, readWebJSON("app/models.json").models],
    spec: [readWebJSON("specifications.json").specifications, readWebJSON("app/specifications.json").specifications],
    pack: [readWebJSON("packs.json").packs, readWebJSON("app/packs.json").packs],
    lab: [readWebJSON("labs.json").labs, readWebJSON("app/labs.json").labs],
    robot: [readWebJSON("robots.json").robots, readWebJSON("app/robots.json").robots],
  };
  for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
    const kind = key.split(":")[0];
    const [published, boot] = boots[kind];
    const bootById = new Map(boot.map(record => [record.id, record]));
    for (const record of published) {
      const bootRecord = bootById.get(record.id);
      assert.ok(bootRecord, `${kind}/${record.id} has no boot record`);
      // Reviewed overlays replace source rows; their parity is checked above.
      if (kind === "model-source" && bootRecord.review_status === "reviewed") continue;
      const status = kind === "model-source" ? "imported" : "reviewed";
      const canonical = kind.startsWith("model") ? { ...record, review_status: status } : record;
      const badgeKind = kind === "model-source" ? "model" : kind;
      assert.deepEqual(cardBadges(badgeKind, bootRecord).map(badge => badge.id), cardBadges(badgeKind, canonical).map(badge => badge.id), `${kind}/${record.id} badge IDs/order differ between canonical and boot`);
    }
    for (const id of ids) {
      const { field } = CARD_BADGES[id].test;
      for (const record of published) {
        if (!(field in record)) continue;
        const bootRecord = bootById.get(record.id);
        assert.ok(bootRecord, `${kind}/${record.id} has no boot record`);
        assert.deepEqual(bootRecord[field], record[field], `${kind}/${record.id} boot value differs for ${field}, which the ${id} badge tests`);
      }
    }
  }
});

test("packShapedSystems lists only host-pack systems, by name, honouring the term and index", () => {
  const systems = [
    { id: "gstack", name: "GStack", description: "Cross-host workflow.", deployment: ["local_cli", "host_pack"], repo: "garrytan/gstack", url: "https://github.com/garrytan/gstack" },
    { id: "superpowers", name: "Superpowers", description: "A skills library.", deployment: ["local_cli", "host_pack"], repo: "obra/superpowers", url: "https://github.com/obra/superpowers" },
    { id: "emdash", name: "emdash", description: "Desktop app.", deployment: ["desktop"], repo: "x/emdash", url: "https://github.com/x/emdash" },
  ];
  assert.deepEqual(packShapedSystems(systems, {}).map(item => item.id), ["gstack", "superpowers"]);
  assert.deepEqual(packShapedSystems(systems, { term: "skills" }).map(item => item.id), ["superpowers"]);
  assert.deepEqual(packShapedSystems(systems, { term: "onlyindex", searchIndex: { gstack: "onlyindex" } }).map(item => item.id), ["gstack"]);
  assert.deepEqual(packShapedSystems([systems[2]], {}), []);
});

test("mergePackScopeEntries unions packs and host-pack systems by name with kind tiebreak", () => {
  const packs = [{ id: "b-pack", name: "B" }];
  const systems = [{ id: "z-sys", name: "Z" }, { id: "a-sys", name: "A" }];
  assert.deepEqual(mergePackScopeEntries(packs, systems).map(item => [item.kind, item.record.id]), [["system", "a-sys"], ["pack", "b-pack"], ["system", "z-sys"]]);
  assert.deepEqual(mergePackScopeEntries([], []), []);
});

test("a scope writes only the parameters that differ from their defaults, in a fixed order", () => {
  // Beside a query, Name is a sort the reader chose (ruling R-P1-2b).
  assert.deepEqual(
    scopeURLParams("systems", { q: "graph", family: "memory_system", role: "", status: "active", localOnly: "", sort: "name" }),
    [["q", "graph"], ["family", "memory_system"], ["sort", "name"]],
  );
  assert.deepEqual(scopeURLParams("systems", { status: "", localOnly: "1", sort: "score" }), [["status", ""], ["localOnly", "1"], ["sort", "score"]]);
  assert.deepEqual(scopeURLParams("inference", { type: "direct_model_api", sort: "score" }), [["type", "direct_model_api"]]);
  assert.deepEqual(scopeURLParams("nowhere", { q: "x" }), []);
});

// Ruling R-P1-2b: while a query is present, Best match is the sort a URL
// leaves out, so a reload or a shared link keeps any other sort the reader
// chose, the browsing default included.
test("while a query is present, a URL leaves out Best match and names any other sort", () => {
  assert.deepEqual(scopeURLParams("inference", { q: "api", sort: "match" }), [["q", "api"]]);
  assert.deepEqual(scopeURLParams("inference", { q: "api", sort: "score" }), [["q", "api"], ["sort", "score"]]);
  assert.deepEqual(scopeURLParams("runtimes", { q: "api", sort: "score" }), [["q", "api"], ["sort", "score"]]);
  assert.deepEqual(scopeURLParams("models", { q: "api", sort: "score" }), [["q", "api"], ["sort", "score"]]);
  assert.deepEqual(scopeURLParams("systems", { q: "coding agent", sort: "name" }), [["q", "coding agent"], ["sort", "name"]]);
  // Browsing keeps each scope's own default, and a query of spaces is none.
  assert.deepEqual(scopeURLParams("inference", { q: "", sort: "score" }), []);
  assert.deepEqual(scopeURLParams("inference", { q: "", sort: "match" }), [["sort", "match"]]);
  assert.deepEqual(scopeURLParams("inference", { q: "  ", sort: "score" }), [["q", "  "]]);
});

test("restoring a scope keeps what its controls offer and rejects the rest", () => {
  const params = new URLSearchParams("q=graph&family=memory_system&role=nope&type=direct_model_api&page=2");
  const allowed = { q: "text", family: new Set(["", "memory_system"]), role: new Set(["", "human_pkm"]) };
  assert.deepEqual(readScopeURLParams("systems", params, allowed), {
    values: { q: "graph", family: "memory_system", page: 2 },
    rejected: ["role", "type"],
  });
  assert.deepEqual(readScopeURLParams("all", new URLSearchParams("page=0"), { q: "text" }), { values: {}, rejected: ["page"] });
  assert.ok(SCOPE_URL_KEYS.includes("page"));
});

test("a URL's filters belong to its view or to the Directory collection it names", () => {
  assert.equal(scopeFromURL(new URLSearchParams("")), "all");
  assert.equal(scopeFromURL(new URLSearchParams("collection=systems")), "systems");
  assert.equal(scopeFromURL(new URLSearchParams("collection=nope")), "all");
  assert.equal(scopeFromURL(new URLSearchParams("view=models&collection=systems")), "models");
  assert.equal(scopeFromURL(new URLSearchParams("view=finder")), null);
});

// A label names one control, so it may hold only that one labelable element.
// The search counts beside the boxes once sat inside them as <output>, a
// second labelable element, which made each of those labels invalid.
test("every label in index.html holds exactly one control", () => {
  const labels = [...indexHTML().matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)];
  assert.ok(labels.length > 0, "index.html has labels");
  for (const [whole, inner] of labels) {
    const controls = inner.match(/<(?:input|select|textarea|button|output|meter|progress)\b/g) || [];
    assert.equal(controls.length, 1, `${whole.slice(0, 90)}… holds ${controls.length} controls`);
  }
});

// Agent packs and robots have no scores, so the All intro promises scores
// only where a collection has them (ruling R-P1-23).
test("the All intro promises scores only where a collection has them", () => {
  assert.match(indexHTML(), /Choose a collection for its own filters, and its scores where it has them\./);
});

test("the API view does not call web-page evidence pinned", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  // docs/DATA_MODEL.md: web terms carry "no claim of immutability".
  assert.doesNotMatch(html, /pinned to the exact file or page/);
  assert.match(html, /web page records the date it was read/);
});

test("search text normalises case, accents, and separators", () => {
  assert.equal(normalizeSearchText("  Qwen3.8 Omni — Flash!  "), "qwen3.8 omni flash");
  assert.equal(normalizeSearchText("Café-Crème"), "cafe-creme");
  assert.deepEqual(searchWords("llama.cpp and self-hosted"), ["llama.cpp", "llama", "cpp", "and", "self-hosted", "self", "hosted"]);
});

test("query words are stemmed lightly and never below four letters", () => {
  assert.equal(stemQueryWord("agents"), "agent");
  assert.equal(stemQueryWord("memories"), "memory");
  assert.equal(stemQueryWord("locally"), "local");
  assert.equal(stemQueryWord("hosted"), "host");
  assert.equal(stemQueryWord("coding"), "coding");
  assert.equal(stemQueryWord("news"), "news");
  assert.equal(stemQueryWord("access"), "access");
});

test("a query drops stop words and treats hyphens as spaces", () => {
  assert.deepEqual(parseSearchQuery("Memory for Agents").tokens, ["memory", "agent"]);
  assert.deepEqual(parseSearchQuery("self-hosted").tokens, parseSearchQuery("self hosted").tokens);
  assert.deepEqual(parseSearchQuery("   ").tokens, []);
});

// "ollama." asks for "ollama": a period that ends a query word is dropped
// before matching, before the name bonus reads the query as typed, and before
// did-you-mean, while a period inside or before a word stays.
test("a period that ends a query word is dropped, and every other period stays", () => {
  const words = raw => parseSearchQuery(raw).words;
  assert.deepEqual(parseSearchQuery("ollama.").tokens, ["ollama"]);
  assert.deepEqual(words("ollama. cloud"), ["ollama", "cloud"]);
  assert.deepEqual(words(".net"), [".net"]);
  assert.deepEqual(words("llama.cpp"), ["llama.cpp"]);
  assert.deepEqual(words("node.js"), ["node.js"]);
  assert.deepEqual(words("c++"), ["c++"]);
  assert.deepEqual(words("c#"), ["c#"]);
  assert.deepEqual(words("..."), []);
  assert.deepEqual(words(". . ."), []);
  assert.deepEqual(words("e.g."), ["e.g"]);
  const records = [
    { id: "memori", name: "Memori", description: "A memory engine.", score: { overall: 9 } },
    { id: "a-mem", name: "A-MEM", description: "Agentic memory.", score: { overall: 1 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "A-MEM.", sort: "match" }).map(record => record.name), ["A-MEM", "Memori"]);
  assert.deepEqual(suggestNames([{ name: "Ollama" }], "olama."), ["Ollama"]);
});

test("short words are strict outside names, and names match inside compounds", () => {
  const prose = searchWords("An agent API that stores vectors in storage");
  assert.equal(tokenHit(prose, "pi", false), 0);
  assert.equal(tokenHit(prose, "rag", false), 0);
  assert.equal(tokenHit(prose, "api", false), 1);
  assert.equal(tokenHit(prose, "stor", false), 0.8);
  assert.equal(tokenHit(searchWords("Pi"), "pi", true), 1);
  assert.equal(tokenHit(searchWords("ChatGPT"), "gpt", true), 0.6);
  assert.equal(tokenHit(searchWords("agentmemory"), "memory", true), 0.6);
  assert.equal(tokenHit(searchWords("GBrain"), "gbr", true), 0.8);
  assert.equal(tokenHit(searchWords("zebra"), "z", false), 0);
  assert.equal(tokenHit(searchWords("Alpha"), "a", true), 0.8);
});

test("a search orders by match and never by score", () => {
  const records = [
    { id: "a", name: "Alpha Router", description: "Routes requests to ollama.", status: "active", score: { overall: 10 } },
    { id: "b", name: "Ollama", description: "Runs models.", status: "active", score: { overall: 1 } },
    { id: "c", name: "Ollama Classic", description: "Old runner.", status: "archived", score: { overall: 9 } },
  ];
  const names = filterAndSortProjects(records, { term: "ollama", sort: "match", status: "" }).map(record => record.name);
  assert.deepEqual(names, ["Ollama", "Ollama Classic", "Alpha Router"]);
  // Without a query, "match" falls back to names A–Z.
  assert.deepEqual(filterAndSortProjects(records, { term: "", sort: "match", status: "" }).map(record => record.name), ["Alpha Router", "Ollama", "Ollama Classic"]);
});

// A specification's status comes from its own vocabulary, where "published"
// is as current as a system's "active", so a superseded one follows it.
test("a superseded specification follows a current one at an equal match", () => {
  const specifications = [
    { id: "alpha", name: "Alpha Protocol", short_name: "AP", description: "An older wire format.", status: "superseded", licenses: [] },
    { id: "beta", name: "Beta Protocol", short_name: "BP", description: "A newer wire format.", status: "published", licenses: [] },
  ];
  assert.deepEqual(filterSpecifications(specifications, { term: "protocol" }).map(item => item.name), ["Beta Protocol", "Alpha Protocol"]);
});

// Every status in the taxonomy's record vocabularies is either current or no
// longer current, and the inactive set holds exactly the second kind, so a
// status added to a vocabulary has to be classed here before it ships.
test("the inactive statuses are the taxonomy's statuses for records no longer current", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const statuses = ["project_statuses", "specification_statuses"].flatMap(group => taxonomy[group].map(item => item.id));
  const current = ["active", "published", "evolving", "vendor_specific"];
  assert.deepEqual([...new Set(statuses)].sort(), [...current, ...INACTIVE_STATUSES].sort());
  assert.deepEqual([...INACTIVE_STATUSES].sort(), ["archived", "removed", "superseded"]);
});

// ADR 040's central promise: among equal matches, active records lead, then
// names A–Z, and nothing reads a score or stars. Every record here matches
// "notes" in its name alone, so all tie, and each merit field points the other
// way: the archived record has the top score and the most stars, and among
// the active ones each later name has the higher score and more stars.
test("equal matches never order by score or stars, and active records lead", () => {
  const systems = [
    { id: "alpha", name: "Alpha Notes", description: "A notebook.", status: "archived", deployment: ["host_pack"], score: { overall: 10 }, stars: 99999 },
    { id: "beta", name: "Beta Notes", description: "A notebook.", status: "active", deployment: [], score: { overall: 1 }, stars: 1 },
    { id: "gamma", name: "Gamma Notes", description: "A notebook.", status: "active", deployment: [], score: { overall: 9 }, stars: 500 },
  ];
  const names = entries => entries.map(entry => (entry.record || entry).name);
  assert.deepEqual(names(filterAndSortProjects(systems, { term: "notes", sort: "match", status: "" })), ["Beta Notes", "Gamma Notes", "Alpha Notes"]);
  const runtimes = [{ id: "delta", name: "Delta Notes", maintainer: "Delta", description: "A notebook.", api_styles: [], score: { overall: 10 }, stars: 70000 }];
  assert.deepEqual(names(filterDirectoryEntries(systems, [], runtimes, [], { term: "notes" })), ["Beta Notes", "Delta Notes", "Gamma Notes", "Alpha Notes"]);
  // The Packs scope ties an active pack with an archived, top-scored system.
  const packs = [{ id: "zeta", name: "Zeta Notes", steward: "Zeta", description: "A notebook.", status: "active" }];
  assert.deepEqual(names(mergePackScopeEntries(packs, packShapedSystems(systems, { term: "notes" }), { term: "notes" })), ["Zeta Notes", "Alpha Notes"]);
});

// While searching, Specifications order by match, never A–Z: the one named
// for the query leads one that only mentions it (ADR 040).
test("a Specifications search orders by match, not A–Z", () => {
  const specifications = [
    { id: "alpha", name: "Alpha Rules", description: "Rules that build on the Zeta Protocol.", status: "published", licenses: [] },
    { id: "zeta", name: "Zeta Protocol", description: "A wire format.", status: "published", licenses: [] },
  ];
  assert.deepEqual(filterSpecifications(specifications, { term: "zeta protocol" }).map(item => item.name), ["Zeta Protocol", "Alpha Rules"]);
  assert.deepEqual(filterSpecifications(specifications, {}).map(item => item.name), ["Alpha Rules", "Zeta Protocol"]);
});

test("a split name is found as a name", () => {
  const fields = searchFields("system", { id: "lc", name: "LangChain", description: "Framework." });
  assert.ok(recordMatch(parseSearchQuery("lang chain"), fields) > 0);
});

// The joined word is tried against every field, not only names, so "lang
// chain" also finds a record whose prose says "langchain". That record holds
// the phrase, so it leads one whose prose only holds "language" and "chain"
// apart; only a name match earns the split-name lead.
test("a split name also finds records whose prose holds the joined word", () => {
  const records = [
    { id: "cot", name: "Beta Model", description: "A language model trained on chain-of-thought traces.", status: "active", deployment: [] },
    { id: "lg", name: "Alpha Graph", description: "Graphs built on LangChain.", status: "active", deployment: [] },
    { id: "lc", name: "LangChain", description: "Framework.", status: "active", deployment: [] },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "lang chain", sort: "match", status: "" }).map(record => record.name), ["LangChain", "Alpha Graph", "Beta Model"]);
});

// A name holding the joined word earns the phrase bonus at the name's weight,
// so a product whose name is split in a longer query still leads records
// that only hold the joined word in their repository.
test("a split name leads a longer query ahead of records that only mention it", () => {
  const records = [
    { id: "aa", name: "Alpha Agents", repo: "langchain-ai/alpha-agents", description: "Agents.", status: "active", deployment: [] },
    { id: "lc", name: "LangChain", description: "A framework for building agents.", status: "active", deployment: [] },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "lang chain agents", sort: "match", status: "" }).map(record => record.name), ["LangChain", "Alpha Agents"]);
});

// Words a record holds together, in order, outrank the same words held apart,
// even when the apart ones land in a weightier field: "self hosted" once
// listed services typed "Managed inference host" before records described
// as self-hosted. The phrase is matched word by word under the usual rules,
// so a stem, a word's start, or a stop word changes nothing.
test("a phrase a record holds together outranks the same words apart", () => {
  const labelOf = (kind, record) => (record.id === "host" ? "Managed inference host" : "General work agent");
  const records = [
    { id: "host", name: "Alpha Cloud", description: "Serves models on a self-built engine.", status: "active", deployment: [] },
    { id: "agent", name: "Zeta", description: "A self-hosted assistant.", status: "active", deployment: [] },
  ];
  for (const term of ["self hosted", "self host", "self hosting", "the self hosted"]) {
    assert.deepEqual(filterAndSortProjects(records, { term, sort: "match", status: "", labelOf }).map(record => record.name), ["Zeta", "Alpha Cloud"], term);
  }
});

// The phrase bonus stays below the name tiers: a label that holds the query
// as a phrase still follows a name that holds every query word, though names
// A–Z alone would put the label's record first.
test("a phrase in a label never outranks a name that holds every query word", () => {
  const labelOf = (kind, record) => (record.id === "label" ? "Open source" : "General work agent");
  const records = [
    { id: "label", name: "Alpha", description: "A kit.", status: "active", deployment: [] },
    { id: "name", name: "Source Open Kit", description: "A kit.", status: "active", deployment: [] },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "open source", sort: "match", status: "", labelOf }).map(record => record.name), ["Source Open Kit", "Alpha"]);
});

// A short name is a whole name, so the exact-name lead reads it too: "ACP"
// once tied Agent Client Protocol with a protocol whose short name only holds
// ACP, and only names A–Z decided between them. The fixture renames one so
// that A–Z would decide against it.
test("a short name equal to the query comes first", () => {
  const specifications = [
    { id: "commerce", name: "Agentic Commerce Protocol", short_name: "Commerce ACP", description: "Checkout.", status: "published", licenses: [] },
    { id: "client", name: "Zeta Client Protocol", short_name: "ACP", description: "Editors.", status: "published", licenses: [] },
  ];
  assert.deepEqual(filterSpecifications(specifications, { term: "acp" }).map(item => item.name), ["Zeta Client Protocol", "Agentic Commerce Protocol"]);
});

test("the mixed directory stays A–Z while browsing and orders by match while searching", () => {
  const systems = [{ id: "z", name: "Zeta Agent", description: "An agent.", status: "active", deployment: [] }];
  const runtimes = [{ id: "o", name: "Ollama", maintainer: "Ollama", description: "Runs models.", api_styles: [] }];
  const browse = filterDirectoryEntries(systems, [], runtimes, [], { term: "" }).map(entry => entry.record.name);
  assert.deepEqual(browse, ["Ollama", "Zeta Agent"]);
  const found = filterDirectoryEntries(systems, [], runtimes, [], { term: "agent" }).map(entry => entry.record.name);
  assert.deepEqual(found, ["Zeta Agent"]);
});

test("real-catalog probes: known names first and loose queries answered", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const nameOf = (group, id) => (taxonomy[group] || []).find(item => item.id === id)?.name || "";
  const labelOf = (kind, record) => ({
    system: `${nameOf("primary_roles", record.primary_role)} ${nameOf("system_families", record.system_family)} ${nameOf("source_models", record.source_model)}`,
    inference: nameOf("inference_service_types", record.service_type),
    runtime: nameOf("local_runtime_types", record.runtime_type),
    model: nameOf("model_types", record.model_type),
    pack: nameOf("pack_types", record.pack_type),
    spec: nameOf("specification_types", record.specification_type),
    robot: nameOf("robot_form_factors", record.form_factor),
  })[kind] || "";
  const boot = name => readWebJSON(`app/${name}.json`);
  const index = name => readWebJSON(`app/search/${name}.json`);
  const indexes = {
    searchIndex: index("systems"), serviceSearchIndex: index("inference"), runtimeSearchIndex: index("runtimes"),
    modelSearchIndex: index("models"), packSearchIndex: index("packs"), robotSearchIndex: index("robots"),
  };
  const search = term => filterDirectoryEntries(
    boot("systems").systems, boot("inference").inference, boot("runtimes").runtimes, boot("models").models,
    { term, labelOf, ...indexes }, boot("packs").packs, boot("robots").robots,
  );
  const run = term => search(term).map(entry => entry.record.name);
  const indexOf = {
    system: indexes.searchIndex, inference: indexes.serviceSearchIndex, runtime: indexes.runtimeSearchIndex,
    model: indexes.modelSearchIndex, pack: indexes.packSearchIndex, robot: indexes.robotSearchIndex,
  };
  // Each result's searchable words: every field's, and its name's alone.
  const hits = term => search(term).map(({ kind, record }) => {
    const fields = searchFields(kind, record, { index: indexOf[kind], labelOf });
    return { name: record.name, words: Object.values(fields).flatMap(text => searchWords(text)), nameWords: searchWords(fields.name) };
  });
  assert.equal(run("ollama")[0], "Ollama");
  assert.deepEqual(run("ollama."), run("ollama"));
  assert.equal(run("cursor")[0], "Cursor");
  assert.equal(run("openrouter")[0], "OpenRouter");
  assert.equal(run("claude code")[0], "Claude Code");
  assert.equal(run("lang chain")[0], "LangChain");
  assert.deepEqual(run("self hosted"), run("self-hosted"));
  assert.deepEqual(run("the self hosted"), run("self hosted"));
  // A record that says the phrase leads the ones holding its words apart:
  // "self hosted" once listed services typed "Managed inference host" first.
  for (const term of ["self hosted", "self host"]) {
    const [{ kind, record }] = search(term);
    const leading = searchFields(kind, record, { index: indexOf[kind], labelOf });
    assert.ok([leading.label, leading.maker, leading.description].some(text => holdsPhrase(text, parseSearchQuery(term))), `${record.name} leads "${term}" without saying it`);
  }
  // A split name finds everything the joined one does.
  const split = new Set(run("lang chain"));
  for (const name of run("langchain")) assert.ok(split.has(name), `"lang chain" misses ${name}, which "langchain" finds`);
  // Each specification's short name lists that specification, or one of the
  // same name, first, and ahead by its match rather than by names A–Z.
  const { specifications } = boot("specifications");
  const specificationIndex = index("specifications");
  for (const { short_name: shortName } of specifications) {
    const [first, second] = filterSpecifications(specifications, { term: shortName, searchIndex: specificationIndex, labelOf });
    assert.ok([first.name, first.short_name].some(name => name.toLowerCase() === shortName.toLowerCase()), `"${shortName}" lists ${first.name} first`);
    if (second) {
      const weight = item => recordMatch(parseSearchQuery(shortName), searchFields("spec", item, { index: specificationIndex, labelOf }));
      assert.ok(weight(first) > weight(second), `"${shortName}" lists ${first.name} first only by names A–Z`);
    }
  }
  assert.ok(run("gpt").includes("ChatGPT"));
  assert.ok(run("run models locally").length > 0);
  assert.ok(run("memory for agents").length > 0);
  assert.ok(run("open source coding agent").length > 0);
  // Every reviewed synonym answers the query its catalog words answer: the
  // synonym's matches are a superset of its expansion's, so a rotting entry
  // fails here rather than silently listing nothing.
  for (const { match, expand } of SEARCH_SYNONYMS) {
    const phrase = match.join(" ");
    const expanded = expand.join(" ");
    assert.ok(run(phrase).length > 0, `"${phrase}" lists nothing`);
    const listed = new Set(run(phrase));
    for (const name of run(expanded)) assert.ok(listed.has(name), `"${phrase}" misses ${name}, which "${expanded}" finds`);
  }
  // Every reviewed goal keyword names its goal on the shipped goal set.
  const shippedGoals = Object.entries(FINDER_GOALS).flatMap(([direction, goals]) =>
    goals.map(goal => ({ ...goal, direction, eligible: 1 })));
  for (const [term, id] of [["sql", "analyze_data"], ["retrieval", "memory_infrastructure"], ["gateway", "self_host_endpoint"]]) {
    assert.equal(matchFinderGoal(shippedGoals, term).id, id);
  }
  // Short words stay whole outside names: "rag" never matches inside a prose
  // word such as "storage", and "pi" never matches "API".
  const rag = hits("rag");
  assert.ok(rag.length > 0);
  for (const { name, words, nameWords } of rag) {
    assert.ok(words.includes("rag") || nameWords.some(word => word.includes("rag")), `${name} matches "rag" by a whole word or inside its name`);
  }
  const pi = hits("pi");
  assert.equal(pi[0].name, "Pi");
  for (const { name, words, nameWords } of pi) {
    assert.ok(words.includes("pi") || nameWords.some(word => word.startsWith("pi")), `${name} matches "pi" by a whole word or the start of a name word`);
  }
});

// The exact-name bonus reads the query as typed: stemming turns "Swarms" into
// "swarm", and dropping the stop word turns "A-MEM" into "mem".
test("a name equal to the query as typed comes first when stemming changes the query", () => {
  const records = [
    { id: "sc", name: "SwarmClaw", description: "An agent.", score: { overall: 9 } },
    { id: "s", name: "Swarms", description: "A framework.", score: { overall: 1 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "Swarms", sort: "match" }).map(record => record.name), ["Swarms", "SwarmClaw"]);
});

test("a name equal to the query as typed comes first when a stop word is dropped", () => {
  const records = [
    { id: "memori", name: "Memori", description: "A memory engine.", score: { overall: 9 } },
    { id: "a-mem", name: "A-MEM", description: "Agentic memory.", score: { overall: 1 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "A-MEM", sort: "match" }).map(record => record.name), ["A-MEM", "Memori"]);
});

// "series" stems to "sery", which is not a prefix of "series", so a query word
// also matches as typed.
test("series finds a record whose description says series", () => {
  const records = [{ id: "s", name: "Alpha", description: "Covers a model series.", score: { overall: 1 } }];
  assert.equal(filterAndSortProjects(records, { term: "series" }).length, 1);
});

test("memories finds a record whose indexed text says memories", () => {
  const records = [{ id: "m", name: "Beta", description: "A notes app.", score: { overall: 1 } }];
  const searchIndex = { m: "beta a notes app. it keeps memories between sessions." };
  assert.equal(filterAndSortProjects(records, { term: "memories", searchIndex }).length, 1);
});

test("a lab is found by its exact name when that name ends in -ies", () => {
  const motif = [{ id: "lab-motif", name: "Motif Technologies", description: "A model developer.", lab_type: "ai_company", headquarters: "kr", catalog_names: ["Motif Technologies"], systems: [] }];
  assert.deepEqual(filterLabs(motif, { term: "Motif Technologies" }).map(lab => lab.name), ["Motif Technologies"]);
});

// Without the joined-words retry, LangChain holds both words only inside one
// word and ranks below a name that holds them apart.
test("a split query ranks the joined name above a name that holds the words apart", () => {
  const records = [
    { id: "kit", name: "Lang Chain Kit", description: "Helpers.", score: { overall: 9 } },
    { id: "lc", name: "LangChain", description: "Framework.", score: { overall: 1 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "lang chain", sort: "match" }).map(record => record.name), ["LangChain", "Lang Chain Kit"]);
});

test("a misspelled name suggests the closest whole names first", () => {
  assert.equal(editDistance("olama", "ollama"), 1);
  assert.equal(editDistance("form", "from"), 1);
  const records = [{ name: "Ollama Cloud" }, { name: "Ollama" }, { name: "Llama-3.1-70B-Instruct" }, { name: "Mem0" }];
  assert.deepEqual(suggestNames(records, "olama"), ["Ollama", "Ollama Cloud", "Llama-3.1-70B-Instruct"]);
  assert.deepEqual(suggestNames(records, "zz"), []);
});

test("a query names a Finder job when most of its words appear in it", () => {
  const goals = [
    { id: "personal_machine", direction: "local_runtime", label: "Run models on my own computer", description: "A packaged runner that manages download, storage, and local serving.", eligible: 4 },
    { id: "knowledge_assistant", direction: "memory_system", label: "Ask questions over documents", description: "A ready-to-use AI knowledge app or RAG workspace.", eligible: 9 },
    { id: "empty", direction: "memory_system", label: "Run everything locally", description: "Nothing qualifies.", eligible: 0 },
  ];
  assert.equal(matchFinderGoal(goals, "run models locally").id, "personal_machine");
  assert.equal(matchFinderGoal(goals, "rag workspace").id, "knowledge_assistant");
  assert.equal(matchFinderGoal(goals, "ai"), null);
  assert.equal(matchFinderGoal(goals, "zebra crossing"), null);
});

// One word names a job only when that job's label holds it and no other job
// with records holds it anywhere. A generic word such as "agent" raises no
// banner, and neither does "rag", which only a description mentions. Among
// jobs matching as many words, the one whose label holds more of them wins.
test("one word names a Finder job only when that job's label alone holds it", () => {
  const goals = [
    { id: "general_work", direction: "agent_system", label: "Delegate general knowledge work", description: "An end-user agent that plans and completes broad multi-step work.", eligible: 5 },
    { id: "build_agents", direction: "agent_system", label: "Build and orchestrate agents", description: "A framework for tools, workflows, state, and multi-agent coordination.", eligible: 7 },
    { id: "knowledge_assistant", direction: "memory_system", label: "Ask questions over documents", description: "A ready-to-use AI knowledge app or RAG workspace.", eligible: 9 },
    { id: "empty", direction: "memory_system", label: "Summarize documents", description: "Nothing qualifies.", eligible: 0 },
  ];
  assert.equal(matchFinderGoal(goals, "agent"), null);
  assert.equal(matchFinderGoal(goals, "rag"), null);
  // A job with nothing to shortlist never makes a word ambiguous.
  assert.equal(matchFinderGoal(goals, "documents").id, "knowledge_assistant");
  assert.equal(matchFinderGoal(goals, "multi agent").id, "build_agents");
});

// R-P1-8: matchFinderGoal must score a kept position with queryWordHit (the
// better of a token's stem and its typed spelling), not with tokenHit on the
// stem alone. "libraries" stems to "library", which is not a prefix of
// "libraries", so a stem-only hit test misses a goal label that holds the
// word as typed. A scratch check (not committed) shows the brief's
// stem-only tokenHit call returns null for this same input. The word sits in
// the label because one word names a goal only through its label.
test("a query names a Finder job by an -ies word matched as typed, not only its stem", () => {
  const goals = [
    { id: "sdk_builder", direction: "agent_system", label: "Build agent libraries", description: "An SDK for building agents.", eligible: 3 },
  ];
  assert.equal(matchFinderGoal(goals, "libraries").id, "sdk_builder");
});

// A synonym replaces whole query words with the catalog words that answer
// them, and a record matches on the best variant.
test("a reviewed synonym widens the query without adding required words", () => {
  const query = parseSearchQuery("note taking");
  assert.deepEqual(query.alternates.map(alternate => alternate.words), [["notes"]]);
  assert.deepEqual(parseSearchQuery("notes").alternates, []);
  const fields = searchFields("system", { id: "n", name: "Notebook", description: "Take notes and link ideas." });
  assert.ok(recordMatch(parseSearchQuery("notes"), fields) > 0);
  assert.ok(recordMatch(query, fields) > 0);
  const other = searchFields("system", { id: "o", name: "Orchestrator", description: "Coordinate agents." });
  assert.equal(recordMatch(query, other), 0);
});

// Goal keywords count as the label for the one-word rule, so "sql" names the
// data-analysis goal while a word two goals share names none.
test("a goal keyword names the goal for a one-word query", () => {
  const goals = [
    { id: "analyze_data", direction: "agent_system", label: "Analyze data with natural language", description: "An analytics agent.", keywords: ["sql"], eligible: 4 },
    { id: "build_agents", direction: "agent_system", label: "Build and orchestrate agents", description: "A framework for tools.", eligible: 7 },
  ];
  assert.equal(matchFinderGoal(goals, "sql").id, "analyze_data");
  const shared = goals.map(goal => ({ ...goal, keywords: ["sql"] }));
  assert.equal(matchFinderGoal(shared, "sql"), null);
});

// A synonym variant retries goal naming, so "note taking" names the goal
// "notes" names.
test("a synonym variant names the Finder job its expansion names", () => {
  const goals = [
    { id: "personal_knowledge", direction: "memory_system", label: "Keep my own notes and knowledge", description: "A workspace for ideas.", eligible: 6 },
  ];
  assert.equal(matchFinderGoal(goals, "notes").id, "personal_knowledge");
  assert.equal(matchFinderGoal(goals, "note taking").id, "personal_knowledge");
});

const registryPayloads = {
  projects: [
    { id: "m1", name: "M1", system_family: "memory_system", status: "active", deployment: [] },
    { id: "m2", name: "M2", system_family: "memory_system", status: "archived", deployment: [] },
    { id: "a1", name: "A1", system_family: "agent_system", status: "active", deployment: ["host_pack"] },
    { id: "a2", name: "A2", system_family: "agent_system", status: "active", deployment: [] },
    { id: "s1", name: "S1", system_family: "assistant_system", status: "active", deployment: [] },
  ],
  services: [
    { id: "i1", name: "I1", service_type: "direct_model_api" },
    { id: "i2", name: "I2", service_type: "direct_model_api" },
    { id: "i3", name: "I3", service_type: "routing_aggregator" },
  ],
  runtimes: [{ id: "r1", name: "R1", runtime_type: "desktop_runner" }],
  models: [
    { id: "x1", name: "X1", review_status: "reviewed", model_type: "language_model" },
    { id: "x2", name: "X2", review_status: "reviewed", model_type: "multimodal_language_model" },
    { id: "x3", name: "X3", review_status: "imported" },
  ],
  packs: [{ id: "p1", name: "P1", pack_type: "skills_bundle" }],
  robots: [{ id: "b1", name: "B1", form_factor: "humanoid" }, { id: "b2", name: "B2", form_factor: "quadruped" }],
  labs: [{ id: "l1", name: "L1", lab_type: "ai_company" }],
  specifications: [{ id: "sp1", name: "SP1", specification_type: "protocol" }],
};

test("the registry lists every collection once, each a Directory collection, in front-door order", () => {
  assert.deepEqual(COLLECTIONS.map(entry => entry.id), ["all", "systems", "models", "inference", "runtimes", "packs", "robots", "labs", "specifications"]);
  assert.ok(COLLECTIONS.every(entry => entry.kind === "scope"));
  // Collections use a known type badge or their own navigation glyph;
  // Everything alone uses the empty frame.
  for (const entry of COLLECTIONS) {
    if (entry.emblem === null) assert.ok(entry.id === "all" || entry.glyph, entry.id);
    else assert.equal(CARD_BADGES[entry.emblem].family, "type", entry.id);
  }
});

test("each collection counts what its default view lists, with its split", () => {
  assert.deepEqual(collectionCount("all", registryPayloads), { count: 5 + 3 + 1 + 3 + 1 + 2 + 1 + 1, note: "A–Z, no scores" });
  assert.deepEqual(collectionCount("systems", registryPayloads), { count: 4, note: "active" });
  assert.deepEqual(collectionCount("models", registryPayloads), { count: 3, note: "2 reviewed · 1 imported" });
  assert.deepEqual(collectionCount("packs", registryPayloads), { count: 2, note: "1 pack · 1 host-installed" });
  assert.deepEqual(collectionCount("inference", registryPayloads), { count: 3, note: "" });
  assert.deepEqual(collectionCount("robots", registryPayloads), { count: 2, note: "" });
  assert.deepEqual(collectionCount("labs", registryPayloads), { count: 1, note: "" });
  assert.deepEqual(collectionCount("specifications", registryPayloads), { count: 1, note: "" });
  assert.deepEqual(collectionCount("robots", { ...registryPayloads, robots: [] }), { count: 0, note: "" });
});

test("Everything holds every record the site publishes, so its count cannot drift from the collections", () => {
  // Not the sum of the eight tile counts: Everything lists archived and superseded
  // systems too, and counts a host-installed system once, inside projects, where the
  // Agent packs tile also counts it. What it must equal is every record in every
  // collection's payload -- so that is the invariant, stated from the payloads.
  const everyRecord = ["projects", "services", "runtimes", "models", "packs", "robots", "labs", "specifications"]
    .reduce((total, key) => total + registryPayloads[key].length, 0);
  assert.equal(collectionCount("all", registryPayloads).count, everyRecord);
  assert.equal(collectionCount("all", { ...registryPayloads, labs: [], specifications: [] }).count,
    everyRecord - 2, "emptying a collection has to move the Everything count");

  // The scope's name, its search, and its grid are three separate code paths. The
  // search reached eight kinds (MATCH_GROUPS) while the grid offered six, which is how
  // a lab came to be findable and unbrowsable at once.
  const browsed = new Set(filterDirectoryEntries(
    registryPayloads.projects, registryPayloads.services, registryPayloads.runtimes, registryPayloads.models,
    {}, registryPayloads.packs, registryPayloads.robots, registryPayloads.labs, registryPayloads.specifications,
  ).map(entry => entry.kind));
  assert.deepEqual([...browsed].sort(), ["inference", "lab", "model", "pack", "robot", "runtime", "spec", "system"]);
  // And the scope states its own membership, in the one sentence a reader reads.
  assert.match(COLLECTIONS[0].meaning, /labs, and specifications together/);
});

test("one match pass finds what a search finds, and nothing for a query without search words, which callers treat as browsing", () => {
  assert.deepEqual([...queryMatches("a1", registryPayloads, {})].map(record => record.id), ["a1"]);
  assert.equal(queryMatches("", registryPayloads, {}).size, 0);
  assert.equal(queryMatches("the", registryPayloads, {}).size, 0, "stop words alone hold no search word, so the pass returns nothing");
});

test("each collection counts the query's matches its default view lists", () => {
  const counts = collectionMatchCounts(queryMatches("m", registryPayloads, {}), registryPayloads);
  assert.equal(counts.all, 2, "All lists the archived M2 as well");
  assert.equal(counts.systems, 1, "Systems lists active systems only");
  assert.equal(counts.labs, 0);
  assert.deepEqual(Object.keys(counts), ["all", "systems", "models", "inference", "runtimes", "packs", "robots", "labs", "specifications"]);
  const packs = collectionMatchCounts(queryMatches("a1", registryPayloads, {}), registryPayloads);
  assert.equal(packs.packs, 1, "a host-installed system counts in Agent packs");
});

test("the family row counts active systems, and only the query's matches while searching", () => {
  assert.deepEqual(familyMatchCounts(null, registryPayloads), { "": 4, memory_system: 1, agent_system: 2, assistant_system: 1 });
  assert.deepEqual(familyMatchCounts(queryMatches("m", registryPayloads, {}), registryPayloads), { "": 1, memory_system: 1 });
});

test("an empty collection is hidden and All never is", () => {
  assert.equal(collectionHidden("labs", registryPayloads), false);
  assert.equal(collectionHidden("labs", { ...registryPayloads, labs: [] }), true);
  assert.equal(collectionHidden("all", {}), false);
});

test("browseSort is written only beside a query listed by Best match, and never as the default", () => {
  const params = values => Object.fromEntries(scopeURLParams("inference", values));
  assert.deepEqual(params({ q: "router", sort: "match", browseSort: "name" }), { q: "router", browseSort: "name" });
  assert.deepEqual(params({ q: "router", sort: "match", browseSort: "score" }), { q: "router" }, "the default is never written");
  assert.deepEqual(params({ q: "router", sort: "name", browseSort: "score" }), { q: "router", sort: "name" }, "a sort chosen during the query wins");
  assert.deepEqual(params({ q: "", sort: "name", browseSort: "score" }), { sort: "name" }, "without a query there is nothing to return to");
});

test("browseSort restores only beside a query and without a sort", () => {
  const allowed = { q: "text", sort: new Set(["score", "name"]), browseSort: new Set(["score", "name"]) };
  const read = query => readScopeURLParams("inference", new URLSearchParams(query), allowed);
  assert.deepEqual(read("q=router&browseSort=name"), { values: { q: "router", browseSort: "name" }, rejected: [] });
  assert.deepEqual(read("browseSort=name").rejected, ["browseSort"]);
  assert.deepEqual(read("q=router&sort=score&browseSort=name").rejected, ["browseSort"]);
  assert.deepEqual(read("q=router&browseSort=match").rejected, ["browseSort"]);
});

test("a collection's categories are its largest values with the facet that opens them", () => {
  assert.deepEqual(collectionCategories("systems", registryPayloads), [
    { key: "family", value: "agent_system", count: 2, label: "Agents" },
    { key: "family", value: "assistant_system", count: 1, label: "Assistants" },
    { key: "family", value: "memory_system", count: 1, label: "Memory" },
  ]);
  // The tie between assistant_system and memory_system breaks by value, not
  // by which record happened to come first.
  assert.deepEqual(
    collectionCategories("systems", { ...registryPayloads, projects: [...registryPayloads.projects].reverse() }).map(category => category.value),
    ["agent_system", "assistant_system", "memory_system"]
  );
  assert.deepEqual(collectionCategories("inference", registryPayloads), [
    { key: "type", value: "direct_model_api", count: 2, label: "Direct model API" },
    { key: "type", value: "routing_aggregator", count: 1, label: "Routing aggregator" },
  ]);
  // Imported rows carry no model type, so only reviewed rows are tallied.
  assert.deepEqual(collectionCategories("models", registryPayloads).map(category => category.value), ["language_model", "multimodal_language_model"]);
  // Robots have no type badge yet, so the value is humanised.
  assert.deepEqual(collectionCategories("robots", registryPayloads).map(category => category.label), ["Humanoid", "Quadruped"]);
  assert.deepEqual(collectionCategories("robots", registryPayloads)[0].key, "formFactor");
  assert.deepEqual(collectionCategories("all", registryPayloads), []);
  assert.equal(collectionCategories("inference", registryPayloads, 1).length, 1);
});

test("a state dot names the collection a comparison or a Finder role set belongs to", () => {
  assert.equal(collectionState("systems", { comparisonKind: "system", finderRoles: null }), "compare");
  assert.equal(collectionState("runtimes", { comparisonKind: "runtime", finderRoles: null }), "compare");
  assert.equal(collectionState("models", { comparisonKind: "model", finderRoles: null }), "compare");
  assert.equal(collectionState("systems", { comparisonKind: null, finderRoles: ["coding_agent", "coding_agent_workflow"] }), "finder");
  assert.equal(collectionState("systems", { comparisonKind: "system", finderRoles: ["coding_agent"] }), "compare");
  assert.equal(collectionState("inference", { comparisonKind: "system", finderRoles: ["coding_agent"] }), null);
  assert.equal(collectionState("packs", {}), null);
});

test("a bare URL is the front door; a collection, a filter, a comparison, or a record is results", () => {
  const stage = query => directoryStageFromURL(new URLSearchParams(query));
  assert.equal(stage(""), "door");
  assert.equal(stage("view=directory"), "door");
  assert.equal(stage("collection=all"), "results");
  assert.equal(stage("collection=systems&family=memory_system"), "results");
  assert.equal(stage("q=ollama"), "results");
  assert.equal(stage("compare=system:aider,kilo-code"), "results");
  assert.equal(stage("record=system:aider"), "results");
  assert.equal(stage("view=finder"), "results");
});

test("a comparison names the scope before the collection parameter, and a record only without one", () => {
  const scope = query => scopeFromURL(new URLSearchParams(query));
  assert.equal(scope(""), "all");
  assert.equal(scope("collection=systems"), "systems");
  assert.equal(scope("collection=systems&compare=inference:a,b"), "inference");
  assert.equal(scope("compare=model:a,b"), "models");
  assert.equal(scope("record=runtime:ollama"), "runtimes");
  // An explicit collection keeps a record opened over it (ruling R17).
  assert.equal(scope("collection=systems&record=pack:superpowers"), "systems");
  assert.equal(scope("collection=all&record=pack:superpowers"), "all");
  assert.equal(scope("record=spec:mcp"), "specifications");
  assert.equal(scope("record=lab:anthropic"), "labs");
  assert.equal(scope("record=model:x"), "models");
  // A comparison wins over a record; a malformed reference is ignored.
  assert.equal(scope("compare=system:a,b&record=runtime:x"), "systems");
  assert.equal(scope("record=nonsense"), "all");
  assert.equal(scope("compare=constructor:a,b"), "all");
  // A comparison without a colon names no kind, so "systemx" is not "system".
  assert.equal(scope("compare=systemx&collection=inference"), "inference");
  assert.equal(scope("view=finder&record=system:aider"), null);
});

// CR-12. escapeHTML is a convention, and conventions leak: the score ring at
// web/app.js:1461 escaped score_profile and then interpolated score.overall raw
// two tokens later, into both the aria-label and the element text.
//
// A general per-site guard is not writable, and the reason is worth recording so
// the next reader does not try. 299 of app.js's 787 interpolations are internal
// builders that escape internally — badgeRow, detailsButton, cardMark, taxonomyName —
// and the file's established idiom is to build a local and escape it at the render
// boundary. `origin` at :1273, `version` at :1497, and the Finder's `reasons` at
// :1886 were all unescaped where they were built and escaped by their consumer.
// Telling "escaped later" from "never escaped" is a dataflow question, so a sweep
// either misses real leaks or drowns in false positives.
//
// What is checkable is a direct sink: a record field interpolated straight into a
// template that becomes markup, with no local in between. `origin` and `version`
// are escaped where they are built now, so the same rule covers them. A regression
// on any entry below fails here, and extending the list is the way to widen it.
const DIRECT_SINKS = [
  "score.overall",
  "description",
  "research_confidence",
  "license_note",
  "current_repo_note",
  "access_boundary",
  "parent_organization",
  "current_version",
];

const SAFE_WRAPPER = /^(?:escapeHTML|detailText|detailList|detailScore|scoreCell|listCell)\(/;

test("a record field interpolated straight into markup is escaped at the point of use", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const offenders = [];
  for (const match of app.matchAll(/\$\{([^{}]*)\}/g)) {
    const expression = match[1].trim();
    if (SAFE_WRAPPER.test(expression)) continue;
    const sink = DIRECT_SINKS.find(field => new RegExp(`\\.${field}\\b`).test(expression));
    if (!sink) continue;
    const line = app.slice(0, match.index).split("\n").length;
    offenders.push(`web/app.js:${line} interpolates .${sink} as {${expression}}`);
  }
  assert.deepEqual(offenders, [],
    "record prose reached a template without escaping:\n  " + offenders.join("\n  "));
});

test("the card score ring escapes the score it prints, in the label and the text", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const ring = app.match(/const score = family \? `[^`]*score-ring[^`]*`/);
  assert.ok(ring, "could not find the card score ring in web/app.js");
  const raw = (ring[0].match(/\$\{(?!escapeHTML)/g) || []).length;
  assert.equal(raw, 0, `the score ring interpolates ${raw} value(s) unescaped: ${ring[0]}`);
  const escaped = (ring[0].match(/escapeHTML\(/g) || []).length;
  assert.equal(escaped, 3,
    `the score ring should escape its profile and both score positions, saw ${escaped}`);
});

test("escapeHTML encodes every character that can break out of markup", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const set = app.match(/const escapeHTML = \(value = ""\) => String\(value\)\.replace\(\/(?<chars>[^/]*)\/g,[\s\S]*?=> \(\{(?<map>[^}]*)\}/);
  assert.ok(set, "could not read the escapeHTML character set from web/app.js");
  const ENCODED = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  for (const [char, encoded] of Object.entries(ENCODED)) {
    assert.ok(set.groups.chars.includes(char),
      `escapeHTML no longer encodes ${char}; an unescaped interpolation of it would inject markup`);
    // The source may quote either side of the pair, so match on the value alone.
    assert.ok(set.groups.map.includes(`:"${encoded}"`),
      `escapeHTML maps ${char} to something other than ${encoded}; the map is ${set.groups.map}`);
  }
});

// --- CR-18: the Finder's ranking and vocabulary, moved out of web/app.js ---
// docs/WEB.md specifies this weighting in prose and nothing enforced it. These
// assertions are the enforcement, so a change to the dispatch has to be deliberate.

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "directory", "taxonomy.json"), "utf8"));
const taxonomyIds = group => new Set((taxonomy[group] || []).map(item => item.id));
// The resolver app.js injects as labelOf; it has the same (group, id) shape.
const labelOf = (group, id) => (taxonomy[group] || []).find(item => item.id === id)?.name || String(id);

test("datasetAttribute turns a camelCase key into the data attribute the DOM reads", () => {
  assert.equal(datasetAttribute("serviceType"), "data-service-type");
  assert.equal(datasetAttribute("family"), "data-family");
  assert.equal(datasetAttribute("modelFormat"), "data-model-format");
  assert.equal(datasetAttribute("alreadyKebab"), "data-already-kebab");
  // Every collector reads its key back off the element, so the attribute the
  // query string builds has to be the one dataset exposes.
  assert.equal(datasetAttribute("serviceType"), `data-${"serviceType".replace(/[A-Z]/g, l => `-${l.toLowerCase()}`)}`);
});

test("an undelivered score dimension counts as zero, so a pending weight is never NaN", () => {
  assert.equal(scoreDimension({ score: { overall: 8 } }, "overall"), 8);
  assert.equal(scoreDimension({ score: {} }, "human_control"), 0);
  assert.equal(scoreDimension({}, "human_control"), 0);
  assert.equal(scoreDimension({ score: { human_control: 0 } }, "human_control"), 0);
});

test("priorityBoost dispatches on score_profile, never on the field that happens to exist", () => {
  const inference = { score_profile: "inference_service", score: { data_governance: 10, overall: 5 } };
  assert.equal(priorityBoost(inference, "governance"), 5);
  // The same priority over a system profile must read a different dimension, so
  // a profile swap that forgot the dispatch cannot pass by accident.
  const system = { score_profile: "system", score: { data_governance: 10, human_control: 6, overall: 5 } };
  assert.equal(priorityBoost(system, "governance"), 10 / 3 + 6 / 4);

  const runtime = { score_profile: "local_runtime", score: { hardware_accelerator_coverage: 9, overall: 5 } };
  assert.equal(priorityBoost(runtime, "hardware"), 4.5);
  assert.equal(priorityBoost(runtime, "balanced"), 5 / 3);
});

test("priorityBoost's balanced fallback is the profile's own overall score for every profile", () => {
  const profiles = [
    { score_profile: "inference_service", score: { overall: 7 } },
    { score_profile: "local_runtime", score: { overall: 7 } },
    { system_family: "memory_system", score: { overall: 7 } },
    { system_family: "agent_system", score: { overall: 7 } },
    { system_family: "assistant_system", score: { overall: 7 } },
  ];
  for (const project of profiles) {
    assert.equal(priorityBoost(project, "balanced"), 7 / 3,
      `balanced fell through differently for ${project.score_profile || project.system_family}`);
  }
});

test("priorityBoost reads the memory and agent traits its priorities name, not a score", () => {
  const memory = {
    system_family: "memory_system",
    local_first: true, human_editable: true, deployment: ["self_hosted"],
    architectures: ["plain_files"],
    score: { data_sovereignty: 5, overall: 7 },
  };
  assert.equal(priorityBoost(memory, "local_editable"), 2.2 + 2 + 0.8);
  assert.equal(priorityBoost(memory, "local_control"), 1 + 1 + 1);
  // deployment and architectures are required on every memory record, so the
  // unguarded .includes above is only safe because the validator guarantees them.
  const required = new Set(Object.keys(JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "directory", "projects.json"), "utf8")).projects[0]));
  for (const field of ["deployment", "architectures", "local_first", "human_editable", "score"]) {
    assert.ok(required.has(field), `priorityBoost reads project.${field}, which no project record carries`);
  }

  const agent = {
    system_family: "agent_system", local_first: true, execution_boundaries: ["host"],
    agent_interfaces: ["terminal", "web_app"], score: { data_sovereignty: 5, human_control: 9, observability_recovery: 8, overall: 7 },
  };
  assert.equal(priorityBoost(agent, "direct_use"), 3);
  assert.equal(priorityBoost(agent, "developer"), 0);
  assert.equal(priorityBoost(agent, "local"), 1 + 1 + 1);
  assert.equal(priorityBoost(agent, "control"), 3 + 2);
});

test("sovereignty outranks the local_first boolean on the local priorities", () => {
  // ADR 030 made local_first a data trait (where kept content lives and
  // whether the vendor keeps it), so on an execution-labelled priority the
  // boolean alone must not beat the full data-sovereignty range. These two
  // records disagree on exactly those two inputs.
  const localLowSov = {
    system_family: "agent_system", local_first: true, execution_boundaries: ["remote_cloud"],
    agent_interfaces: ["terminal"], score: { data_sovereignty: 2, overall: 7 },
  };
  const remoteHighSov = {
    system_family: "agent_system", local_first: false, execution_boundaries: ["host"],
    agent_interfaces: ["terminal"], score: { data_sovereignty: 9, overall: 7 },
  };
  assert.ok(priorityBoost(remoteHighSov, "local") > priorityBoost(localLowSov, "local"),
    `sovereignty 9 without local_first (${priorityBoost(remoteHighSov, "local")}) should beat ` +
    `local_first with sovereignty 2 (${priorityBoost(localLowSov, "local")})`);

  const memLocalLow = {
    system_family: "memory_system", local_first: true, deployment: ["managed_cloud"],
    human_editable: false, architectures: ["plain_files"], score: { data_sovereignty: 2, overall: 7 },
  };
  const memRemoteHigh = {
    system_family: "memory_system", local_first: false, deployment: ["self_hosted"],
    human_editable: false, architectures: ["plain_files"], score: { data_sovereignty: 9, overall: 7 },
  };
  assert.ok(priorityBoost(memRemoteHigh, "local_control") > priorityBoost(memLocalLow, "local_control"),
    `sovereignty 9 without local_first (${priorityBoost(memRemoteHigh, "local_control")}) should beat ` +
    `local_first with sovereignty 2 (${priorityBoost(memLocalLow, "local_control")})`);
});

test("recommendationReasons prints an em dash, never NaN, for a dimension no detail file carried", () => {
  const runtime = {
    score_profile: "local_runtime", runtime_type: "server_engine", accelerators: ["cuda", "rocm"],
    score: { serving_concurrency: 8 },
  };
  const reasons = recommendationReasons(runtime, "serving", labelOf);
  assert.ok(reasons.includes("Serving 8/10"), reasons.join(" | "));
  assert.ok(reasons.includes("Server engine"), reasons.join(" | "));
  // Two accelerators are named, and the taxonomy's own wording, not a raw id.
  assert.ok(reasons.includes("NVIDIA CUDA"), reasons.join(" | "));
  assert.ok(reasons.includes("AMD ROCm"), reasons.join(" | "));
  for (const reason of reasons) {
    assert.ok(!/undefined|NaN/.test(reason), `a reason chip printed a raw value: ${reason}`);
  }
  const missing = recommendationReasons(
    { score_profile: "inference_service", service_type: "direct_model_api", delivery_modes: ["api"], score: {} },
    "governance", labelOf);
  assert.ok(missing.includes("Data governance —/10"), missing.join(" | "));
});

test("recommendationReasons caps at four and de-duplicates, so a chip row never overflows", () => {
  const project = {
    system_family: "memory_system", primary_role: "human_pkm", local_first: true, human_editable: true,
    architectures: ["plain_files"], score: { operational_simplicity: 7, interoperability: 6, overall: 8 },
  };
  for (const priority of FINDER_PRIORITIES.memory_system.map(item => item.id)) {
    const reasons = recommendationReasons(project, priority, labelOf);
    assert.ok(reasons.length <= 4, `${priority} produced ${reasons.length} chips`);
    assert.equal(new Set(reasons).size, reasons.length, `${priority} repeated a chip: ${reasons.join(" | ")}`);
  }
});

test("every FINDER_GOALS entry classifies by taxonomy values that still exist", () => {
  // A goal that names a role or type the taxonomy has dropped matches nothing,
  // and e2e cannot see it: the direction still renders, just empty.
  const groups = { roles: "primary_roles", serviceTypes: "inference_service_types", runtimeTypes: "local_runtime_types" };
  for (const direction of FINDER_DIRECTIONS) {
    const goals = FINDER_GOALS[direction.id];
    assert.ok(goals?.length, `no goals for direction ${direction.id}`);
    for (const goal of goals) {
      for (const [key, group] of Object.entries(groups)) {
        for (const value of goal[key] || []) {
          assert.ok(taxonomyIds(group).has(value),
            `goal ${direction.id}/${goal.id} classifies on ${key} "${value}", which is not in taxonomy.${group}`);
        }
      }
    }
  }
});

test("every direction has priorities, a direction name, and a detail kind", () => {
  for (const direction of FINDER_DIRECTIONS) {
    assert.ok(FINDER_PRIORITIES[direction.id]?.length, `no priorities for ${direction.id}`);
    assert.ok(FINDER_GOALS[direction.id]?.length, `no goals for ${direction.id}`);
    // Every direction ends in a balanced tie-breaker, so a reader always has one.
    assert.equal(FINDER_PRIORITIES[direction.id].at(-1).id, "balanced",
      `${direction.id} does not end its priorities with the balanced tie-breaker`);
  }
  // The two profile-scored directions are named in words, not by family id.
  for (const [id, name] of Object.entries(FINDER_DIRECTION_NAMES)) {
    assert.ok(FINDER_DIRECTIONS.some(item => item.id === id), `${name} names direction ${id}, which has no tile`);
  }
  // FINDER_DETAIL_KINDS names a directory under web/app/detail, not a collection
  // id, so assert the path exists rather than matching it against COLLECTIONS.
  const detailRoot = path.join(__dirname, "..", "web", "app", "detail");
  for (const [id, kind] of Object.entries(FINDER_DETAIL_KINDS)) {
    assert.ok(fs.existsSync(path.join(detailRoot, kind)),
      `detail kind ${kind} for ${id} has no directory under web/app/detail, so every load 404s`);
  }
  // And a direction with no entry falls back to a kind that does exist.
  assert.ok(fs.existsSync(path.join(detailRoot, "system")),
    "the fallback detail kind 'system' has no directory under web/app/detail");
  for (const direction of FINDER_DIRECTIONS) {
    const kind = FINDER_DETAIL_KINDS[direction.id] || "system";
    assert.ok(fs.existsSync(path.join(detailRoot, kind)), `direction ${direction.id} loads an absent detail kind`);
  }
});

test("recommendationReasons names an agent's own interfaces, and an assistant's priority", () => {
  // The agent branch reads agent_interfaces through the taxonomy, the way the
  // local-runtime and inference branches read their own type.
  const agent = {
    system_family: "agent_system", primary_role: "coding_agent", local_first: false,
    agent_interfaces: ["terminal", "ide", "web_app"], score: { human_control: 7, overall: 8 },
  };
  const reasons = recommendationReasons(agent, "control", labelOf);
  assert.ok(reasons.includes("Human control 7/10"), reasons.join(" | "));
  assert.ok(reasons.some(reason => /Coding|agent/i.test(reason)), reasons.join(" | "));
  // Only the first two interfaces are named, so a card's chip row stays short.
  assert.equal(reasons.length, 4, reasons.join(" | "));

  // The assistant branch has no profile and no trait list, so each priority
  // contributes exactly one dimension chip.
  const assistant = {
    system_family: "assistant_system", primary_role: "general_ai_assistant",
    score: { tools_integrations: 9, context_continuity: 8, data_governance: 7, interoperability: 6, human_control: 5, overall: 8 },
  };
  assert.ok(recommendationReasons(assistant, "tools", labelOf).includes("Tools & integrations 9/10"));
  assert.ok(recommendationReasons(assistant, "continuity", labelOf).includes("Context continuity 8/10"));
  assert.ok(recommendationReasons(assistant, "governance", labelOf).includes("Data governance 7/10"));
  assert.ok(recommendationReasons(assistant, "portable", labelOf).includes("Interoperability 6/10"));
  // An assistant record is not local-first, so that chip never appears.
  assert.ok(!recommendationReasons(assistant, "balanced", labelOf).includes("Local-first"));
});

// The Finder ranks across two collections and three system families, so the
// dispatch is exercised against the canonical record each one actually ships in.
function findRecordsByProfile() {
  const load = file => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "directory", file), "utf8"));
  const projects = load("projects.json").projects;
  return {
    inference_service: load("inference-services.json").services,
    local_runtime: load("local-runtimes.json").runtimes,
    memory_system: projects.filter(p => p.system_family === "memory_system"),
    agent_system: projects.filter(p => p.system_family === "agent_system"),
    assistant_system: projects.filter(p => p.system_family === "assistant_system"),
  };
}

test("priorityBoost is finite for every profile and every priority the Finder offers", () => {
  // Table-driven over the whole dispatch: a new profile or priority that falls
  // through to a NaN or undefined reaches a reader as a broken shortlist order.
  for (const [direction, records] of Object.entries(findRecordsByProfile())) {
    assert.ok(records.length, `no ${direction} record to exercise the dispatch with`);
    const project = records[0];
    for (const { id } of FINDER_PRIORITIES[direction]) {
      const value = priorityBoost(project, id);
      assert.ok(Number.isFinite(value),
        `priorityBoost returned ${value} for ${direction}/${id} on ${project.id}`);
    }
    // And on a record whose detail never arrived, where every dimension is absent.
    const bare = { ...project, score: {} };
    for (const { id } of FINDER_PRIORITIES[direction]) {
      assert.ok(Number.isFinite(priorityBoost(bare, id)),
        `priorityBoost returned ${priorityBoost(bare, id)} for ${direction}/${id} with no score`);
    }
  }
});

test("recommendationReasons is finite and chip-bounded for every real record and priority", () => {
  for (const [direction, records] of Object.entries(findRecordsByProfile())) {
    for (const project of records) {
      for (const { id } of FINDER_PRIORITIES[direction]) {
        const reasons = recommendationReasons(project, id, labelOf);
        assert.ok(reasons.length >= 1 && reasons.length <= 4,
          `${project.id} ${direction}/${id} produced ${reasons.length} chips: ${reasons.join(" | ")}`);
        for (const reason of reasons) {
          assert.ok(!/undefined|NaN|\[object/.test(reason),
            `${project.id} ${direction}/${id} printed a raw value: ${reason}`);
        }
      }
    }
  }
});


test("a future overflow cannot silently discard matching facts", () => {
  const ids = CARD_BADGE_SETS["system:agent_system"];
  ids.push("editable-by-you");
  try {
    const record = { system_family: "agent_system", local_first: true, human_editable: true, execution_boundaries: ["container"], agent_capabilities: ["browser_control", "mcp"], deployment: ["self_hosted"] };
    const badges = cardBadges("system", record);
    assert.equal(badges.length, MAX_CARD_BADGES + 1);
    assert.equal(badges.at(-1).id, "editable-by-you");
  } finally {
    ids.pop();
  }
});

test("model licensing has complete scoped labels without changing classification IDs", () => {
  const categories = readWebJSON("taxonomy.json").source_models;
  const scoped = modelLicenseCategories(categories);
  assert.deepEqual(scoped.map(item => item.id), categories.map(item => item.id));
  for (const item of scoped) {
    assert.ok(item.name && item.definition, `${item.id} needs model-scoped wording`);
    assert.notEqual(item.definition, categories.find(row => row.id === item.id).definition);
  }
  assert.equal(scoped.find(item => item.id === "open_source").name, "Open-licensed artifacts");
  assert.equal(categories.find(item => item.id === "open_source").name, "Open source");
});

test("collection symbols have their own explanations independent of shared glyphs", () => {
  for (const entry of COLLECTIONS) assert.ok(entry.meaning, entry.id);
  assert.equal(COLLECTIONS.find(entry => entry.id === "packs").emblem, "agent-system");
  assert.match(COLLECTIONS.find(entry => entry.id === "packs").meaning, /own type badges/);
});

// The Finder's screen is one counted map of its goal tables, so the counts it
// prints are the numbers a reader trusts before choosing anything. These read
// the real payloads, not fixtures: a tile that shows 0 for a job the directory
// can satisfy is the defect they exist to catch.
test("every goal the Finder offers can satisfy at least one active reviewed record", () => {
  const records = findRecordsByProfile();
  const collections = {
    projects: Object.values(records).flatMap(byFamily => byFamily).filter(record => record.system_family),
    inferenceServices: records.inference_service,
    localRuntimes: records.local_runtime,
  };
  const entries = finderGoalEntries(collections);
  assert.equal(entries.length, FINDER_DIRECTIONS.reduce((sum, direction) => sum + FINDER_GOALS[direction.id].length, 0));
  for (const entry of entries) {
    assert.ok(Number.isInteger(entry.eligible), `${entry.id} counts whole records`);
    assert.ok(entry.eligible >= 1, `${entry.id} has at least one active reviewed record`);
  }
  // The same predicate ranks the shortlist, so a tile's count and the
  // candidate set can never disagree.
  for (const entry of entries) {
    const goal = FINDER_GOALS[entry.direction].find(item => item.id === entry.id);
    assert.equal(finderGoalRecords(entry.direction, goal, collections).length, entry.eligible);
  }
});

test("a direction's total is never the sum of its goal counts, because goals overlap", () => {
  // context_graph_engine is claimed by both memory's agent_memory and its
  // memory_infrastructure, so the two counts share records and the column
  // total is smaller than their sum. The tile heading prints the total and the
  // tiles print the per-goal counts, so a rendering rule that summed them
  // would misstate the column. A future overlap is then a deliberate change
  // here rather than a silent regression.
  const records = findRecordsByProfile();
  const collections = {
    projects: Object.values(records).flatMap(byFamily => byFamily).filter(record => record.system_family),
    inferenceServices: records.inference_service,
    localRuntimes: records.local_runtime,
  };
  const overlapping = finderGoalEntries(collections).filter(entry => entry.direction === "memory_system");
  const summed = overlapping.reduce((sum, entry) => sum + entry.eligible, 0);
  const total = finderDirectionTotal("memory_system", collections);
  assert.ok(summed > total, `memory's goals sum to ${summed} against a family total of ${total}`);

  // A direction whose goals partition their direction sums exactly, which is
  // what makes memory's excess a property of the tables and not of the maths.
  for (const direction of ["agent_system", "assistant_system"]) {
    const summed = FINDER_GOALS[direction].reduce((sum, goal) => {
      const entries = finderGoalEntries(collections).filter(entry => entry.direction === direction && entry.id === goal.id);
      return sum + entries[0].eligible;
    }, 0);
    assert.equal(summed, finderDirectionTotal(direction, collections), `${direction}'s goals partition it`);
  }
});

test("the direction total counts active records only, so a retired one leaves the heading", () => {
  const base = { name: "Live", primary_role: "coding_agent", system_family: "agent_system", status: "active" };
  const retired = { ...base, name: "Retired", status: "retired" };
  const collections = { projects: [base, retired], inferenceServices: [], localRuntimes: [] };
  assert.equal(finderDirectionTotal("agent_system", collections), 1);
  assert.equal(finderGoalRecords("agent_system", FINDER_GOALS.agent_system.find(item => item.id === "coding"), collections).length, 1);
});
