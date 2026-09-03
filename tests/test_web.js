const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { directoryDefaults, filterAndSortProjects, filterDirectoryEntries, filterInferenceServices, filterLocalRuntimes, filterScoredCollection, filterSpecifications, cycleThemePreference, matchesProject, parseRecordReference, shareRecordPath, updateComparisonSelection } = require("../web/app-core.js");

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

test("the unified directory discovers both collections without indexing hidden provider metadata", () => {
  const combinedProjects = [
    { ...projects[3], id: "agent", description: "Coding system", model_backends: ["hidden-provider"] },
  ];
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, [], {}).map(item => [item.kind, item.record.name]),
    [["system", "Agent"], ["inference", "Amazon Bedrock"], ["inference", "OpenAI API"], ["inference", "OpenRouter"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, [], { term: "Bedrock" }).map(item => item.record.name),
    ["Amazon Bedrock"],
  );
  assert.deepEqual(filterDirectoryEntries(combinedProjects, inferenceServices, [], { term: "hidden-provider" }), []);
});

const localRuntimes = [
  { id: "ollama", name: "Ollama", maintainer: "Ollama", description: "Local model runner.", runtime_boundary: "Runtime, not Ollama Cloud.", model_management: "Pull and delete models.", hardware_requirements: "Compute capability floor.", operational_controls: "Parallel request settings.", runtime_type: "desktop_runner", accelerators: ["cpu", "cuda", "metal"], model_formats: ["gguf"], serving_modes: ["parallel_requests"], api_styles: ["openai_compatible"], deployment_surfaces: ["desktop_app"], strengths: ["Model lifecycle"], tradeoffs: ["No batching"], score: { overall: 7.31 }, evidence: [{ url: "https://hidden.example/runtime" }] },
  { id: "vllm", name: "vLLM", maintainer: "vLLM project", description: "Serving engine.", runtime_boundary: "Engine, not a managed service.", model_management: "Weights pinned at launch.", hardware_requirements: "Accelerator required.", operational_controls: "Parallelism configured at launch.", runtime_type: "server_engine", accelerators: ["cuda", "rocm"], model_formats: ["safetensors", "fp8"], serving_modes: ["continuous_batching"], api_styles: ["openai_compatible"], deployment_surfaces: ["container"], strengths: ["PagedAttention"], tradeoffs: ["No desktop packaging"], score: { overall: 8.64 }, evidence: [] },
  { id: "mlx-lm", name: "MLX LM", maintainer: "Apple machine learning research", description: "Apple silicon package.", runtime_boundary: "Package, not the MLX framework.", model_management: "Hugging Face Hub.", hardware_requirements: "Apple silicon only.", operational_controls: "Per-command parameters.", runtime_type: "embedded_library", accelerators: ["metal"], model_formats: ["mlx"], serving_modes: ["single_stream"], api_styles: ["openai_compatible"], deployment_surfaces: ["library"], strengths: ["First-party Apple path"], tradeoffs: ["Server not for production"], score: { overall: 4.43 }, evidence: [] },
];

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

test("mixed directory browsing includes local runtimes alongside the other collections", () => {
  const combinedProjects = [{ ...projects[3], id: "agent", description: "Coding system" }];
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, {}).map(item => [item.kind, item.record.name]),
    [
      ["system", "Agent"],
      ["inference", "Amazon Bedrock"],
      ["runtime", "MLX LM"],
      ["runtime", "Ollama"],
      ["inference", "OpenAI API"],
      ["inference", "OpenRouter"],
      ["runtime", "vLLM"],
    ],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, { term: "MLX" }).map(item => item.record.name),
    ["MLX LM"],
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
  for (const raw of [null, "", "ollama", "runtime:", ":ollama", "system:a:b", "constructor:x", "__proto__:x", "toString:x", "System:kilo-code"]) {
    assert.equal(parseRecordReference(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
  }
});

test("share record paths map each kind to its collection directory", () => {
  assert.equal(shareRecordPath("system", "kilo-code"), "records/systems/kilo-code/");
  assert.equal(shareRecordPath("spec", "mcp"), "records/specifications/mcp/");
  assert.equal(shareRecordPath("inference", "openai-api"), "records/inference-services/openai-api/");
  assert.equal(shareRecordPath("runtime", "ollama"), "records/local-runtimes/ollama/");
  assert.equal(shareRecordPath("constructor", "ollama"), null);
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
