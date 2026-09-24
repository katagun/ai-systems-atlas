const test = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { BADGE_FAMILIES, CARD_BADGE_SETS, CARD_BADGES, UNLISTED_MODEL_LABEL, badgeEmblem, badgeLegend, buildLabIndex, cardBadgeGlossary, cardBadges, cycleThemePreference, directoryDefaults, familyEmblem, filterAndSortProjects, filterDirectoryEntries, filterInferenceServices, filterLabs, filterLocalRuntimes, filterModels, filterPacks, filterScoredCollection, filterSpecifications, labDistributionModes, labRelations, labsForRecord, matchesProject, mergePackScopeEntries, modelMetadataAttribution, modelsKickerText, modelSourceLabel, packShapedSystems, paginate, parseRecordReference, parseViewId, releaseDate, releasesNewestFirst, shareRecordPath, sourceNamespace, updateComparisonSelection } = require("../web/app-core.js");

const projects = [
  { name: "PKM", primary_role: "human_pkm", system_family: "memory_system", agent_relation: "none", architectures: ["plain_files"], deployment: ["desktop", "cloud_optional"], agent_interfaces: ["web_app"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: true, stars: 5, score: { overall: 9 } },
  { name: "Bridge", primary_role: "memory_bridge", system_family: "memory_system", agent_relation: "external_memory", architectures: ["plain_files"], deployment: ["local_cli"], agent_interfaces: ["library"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 10, score: { overall: 8 } },
  { name: "Service", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["vector_index"], deployment: ["library", "managed_cloud", "self_hosted"], agent_interfaces: ["api_sdk", "library"], source_model: "mixed_open_source", licenses: ["Apache-2.0", "CC-BY-4.0"], status: "active", local_first: false, stars: null, score: { overall: 7 } },
  { name: "Agent", primary_role: "coding_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["git_versioned"], deployment: ["local_cli", "self_hosted"], agent_interfaces: ["terminal", "ide"], source_model: "open_core", licenses: ["MIT", "LicenseRef-Commercial"], status: "active", local_first: true, stars: 20, score: { overall: 10 } },
  { name: "Work Agent", primary_role: "general_work_agent", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["undisclosed_managed"], deployment: ["managed_cloud"], agent_interfaces: ["web_app"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.2 } },
  { name: "SDK", primary_role: "agent_framework_sdk", system_family: "agent_system", agent_relation: "agent_runtime", architectures: ["event_log"], deployment: ["library", "self_hosted"], agent_interfaces: ["library", "api_sdk"], source_model: "mixed_source", licenses: ["MIT", "LicenseRef-Proprietary"], status: "active", local_first: false, stars: 15, score: { overall: 8.5 } },
  { name: "GBrain", primary_role: "agent_memory_service", system_family: "memory_system", agent_relation: "external_memory", architectures: ["git_versioned"], deployment: ["local_cli", "self_hosted"], agent_interfaces: ["terminal"], source_model: "open_source", licenses: ["MIT"], status: "active", local_first: true, stars: 24, score: { overall: 8.7 } },
  { name: "GStack", primary_role: "coding_agent_workflow", system_family: "agent_system", agent_relation: "coding_workflow", architectures: ["git_versioned"], deployment: ["local_cli"], agent_interfaces: ["terminal"], source_model: "mixed_open_source", licenses: ["MIT", "OFL-1.1"], status: "active", local_first: true, stars: 25, score: { overall: 8.6 } },
  { name: "Assistant", primary_role: "general_ai_assistant", system_family: "assistant_system", agent_relation: "agent_enabled_ui", architectures: ["hybrid"], deployment: ["desktop", "managed_cloud", "mobile"], agent_interfaces: ["web_app"], source_model: "proprietary", licenses: ["LicenseRef-Proprietary"], status: "active", local_first: false, stars: null, score: { overall: 8.8 } },
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
    deployment: "",
    agentInterface: "",
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

test("indexed search keeps infix matching, which is why the index is raw text", () => {
  // "llama" appears only in the index text, never in the record's own id,
  // name, or description — so this fails if recordHaystack ignores the index.
  const records = [{ id: "ol", name: "Ol", description: "Runner.", score: { overall: 1 } }];
  const searchIndex = { ol: "ollama runner. runs gguf models locally." };
  assert.equal(filterAndSortProjects(records, { term: "llama", searchIndex }).length, 1);
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

test("monogram glyphs use the first alphanumeric character uppercased", () => {
  const { monogramGlyph } = require("../web/app-core.js");
  assert.equal(monogramGlyph("Aider"), "A");
  assert.equal(monogramGlyph("llama.cpp"), "L");
  assert.equal(monogramGlyph("vLLM"), "V");
  assert.equal(monogramGlyph(".NET"), "N");
  assert.equal(monogramGlyph(""), "•");
  assert.equal(monogramGlyph(undefined), "•");
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

test("the models lab filter narrows to the ids it is given", () => {
  const ids = new Set(["model-vision"]);
  assert.deepEqual(filterModels(models, { ids }).map(item => item.id), ["model-vision"]);
  assert.equal(filterModels(models, {}).length, models.length);
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

test("index.html references each web asset under its content hash so a change is never served from a stale cache", () => {
  const references = [...indexHTML().matchAll(/(?:href|src)="([\w./-]+)\?v=([^"]*)"/g)];
  assert.deepEqual(references.map(match => match[1]).sort(), ["app-core.js", "app.js", "fonts.css", "styles.css"]);
  for (const [, file, version] of references) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", "web", file))).digest("hex").slice(0, 12);
    assert.equal(version, digest, `${file} is referenced as ?v=${version} but its content hashes to ${digest}; run node scripts/build_asset_version.mjs`);
  }
});

test("every catalog file app.js fetches is stamped with its content hash so the data can be cached", () => {
  const stamped = JSON.parse(indexHTML().match(/<script type="application\/json" id="data-versions">([^<]*)<\/script>/)[1]);
  const fetched = [...fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8")
    .matchAll(/loadJSON\("([\w./-]+)"\)/g)].map(match => match[1]);
  for (const file of fetched) {
    assert.ok(file in stamped, `app.js fetches ${file} but index.html does not stamp it`);
  }
  for (const [file, version] of Object.entries(stamped)) {
    if (file === "app/detail") continue; // one shared stamp over a directory, not a single file's hash
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", "web", file))).digest("hex").slice(0, 12);
    assert.equal(version, digest, `${file} is stamped ${version} but hashes to ${digest}; run node scripts/build_asset_version.mjs`);
  }
});

// The loop above exempts app/detail because it stamps a tree rather than a
// file. Nothing else checked its value, so a builder whose hashing changed —
// or one whose stamp depended on where the checkout lived — was invisible
// here. This recomputes it independently: over the whole tree, in sorted order,
// under each file's slash-separated path relative to the detail root.
test("the shared app/detail stamp hashes every detail file's content under a checkout-independent name", () => {
  const detailRoot = path.join(__dirname, "..", "web", "app", "detail");
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
  const digest = hash.digest("hex").slice(0, 12);
  const versions = JSON.parse(indexHTML().match(/id="data-versions">([^<]*)</)[1]);
  assert.equal(versions["app/detail"], digest,
    `index.html stamps app/detail ${versions["app/detail"]} but the tree hashes to ${digest}; run node scripts/build_asset_version.mjs`);
});

test("every app payload class is versioned, with one shared stamp for detail", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const versions = JSON.parse(html.match(/id="data-versions">([^<]*)</)[1]);
  for (const collection of ["systems", "inference", "runtimes", "specifications", "packs"]) {
    assert.match(versions[`app/${collection}.json`], /^[0-9a-f]{12}$/);
    assert.match(versions[`app/search/${collection}.json`], /^[0-9a-f]{12}$/);
  }
  assert.match(versions["app/detail"], /^[0-9a-f]{12}$/);
  const perRecord = Object.keys(versions).filter(key => key.startsWith("app/detail/"));
  assert.deepEqual(perRecord, [], "detail files share one stamp; they are not versioned individually");
});

test("the app does not disable the HTTP cache it just earned a content hash for", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  assert.ok(!/cache:\s*"no-store"/.test(app), "app.js re-disables caching; the ?v= stamp already guarantees freshness");
});

test("the primary navigation links to the blog, so it is found by scanning the nav", () => {
  const html = indexHTML();
  assert.match(html, /<a class="tab-link" href="blog\/">Blog<\/a>/,
    "index.html should link to blog/ from the primary tab row");
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
  const validate = fs.readFileSync(path.join(__dirname, "..", "scripts", "validate_directory.py"), "utf8");
  const match = validate.match(/PUBLISHED_DATA = \(([\s\S]*?)\)/);
  assert.ok(match, "could not find PUBLISHED_DATA in scripts/validate_directory.py");
  const published = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  const dataSection = llms.split("## Data")[1].split("## Reference")[0];
  const linked = [...dataSection.matchAll(/\]\(https:\/\/[^)]*\/([a-z-]+\.json)\)/g)].map(m => m[1]).sort();
  assert.deepEqual(linked, published);
});

test("the API view lists exactly the published catalog files", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const validate = fs.readFileSync(path.join(__dirname, "..", "scripts", "validate_directory.py"), "utf8");
  const match = validate.match(/PUBLISHED_DATA = \(([\s\S]*?)\)/);
  assert.ok(match, "could not find PUBLISHED_DATA in scripts/validate_directory.py");
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
    assert.ok(1 + ids.length - types.length <= 6, `${key} can show ${1 + ids.length - types.length} badges`);
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
  assert.deepEqual(ids(badgeLegend("models")), ["language-model", "multimodal-language-model", "source-record", "downloadable-weights", "developer-api", "third-party-hosting"]);
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
  const setsFor = { system_family: key => key.startsWith("system:"), service_type: key => key === "inference", runtime_type: key => key === "runtime", model_type: key => key === "model", specification_type: key => key === "spec", pack_type: key => key === "pack", lab_type: key => key === "lab" };
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
      assert.ok(badges.length > 0 && badges.length <= 6, `${scope}/${record.id} shows ${badges.length} badges`);
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
  };
  for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
    const kind = key.split(":")[0];
    const [published, boot] = boots[kind];
    const bootById = new Map(boot.map(record => [record.id, record]));
    for (const id of ids) {
      const { field } = CARD_BADGES[id].test;
      for (const record of published) {
        if (!(field in record)) continue;
        const bootRecord = bootById.get(record.id);
        assert.ok(bootRecord, `${kind}/${record.id} has no boot record`);
        assert.ok(field in bootRecord, `${kind}/${record.id} boot record lacks ${field}, which the ${id} badge tests`);
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
