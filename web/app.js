const state = { projects: [], taxonomy: null, licenses: new Map(), directoryRoles: null, finder: { step: 0, answers: {} } };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const compactNumber = value => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const label = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

const FINDER_FAMILIES = [
  { id: "memory_system", label: "Preserve and use knowledge", description: "Notes, documents, recall, personal knowledge, or durable memory for agents.", cue: "I need a memory system" },
  { id: "agent_system", label: "Plan and take action", description: "Coding, research, browser work, or a framework for building tool-using agents.", cue: "I need an agent system" }
];

const FINDER_GOALS = {
  memory_system: [
    { id: "personal_knowledge", label: "Keep my own notes and knowledge", description: "A workspace for writing, linking, organizing, and revisiting ideas.", roles: ["human_pkm"] },
    { id: "knowledge_assistant", label: "Ask questions over documents", description: "A ready-to-use AI knowledge app or RAG workspace.", roles: ["ai_knowledge_app"] },
    { id: "agent_memory", label: "Give agents durable memory", description: "Memory services, temporal context, or a bridge to human-owned knowledge.", roles: ["agent_memory_service", "context_graph_engine", "memory_bridge"] },
    { id: "ambient_recall", label: "Automatically remember activity", description: "Passive capture for reconstructing digital work and context.", roles: ["ambient_capture"] },
    { id: "memory_infrastructure", label: "Build a custom memory product", description: "Retrieval or context-graph infrastructure for developers.", roles: ["retrieval_infrastructure", "context_graph_engine"] }
  ],
  agent_system: [
    { id: "coding", label: "Write and maintain software", description: "An interactive coding agent or a repeatable coding-agent workflow.", roles: ["coding_agent", "coding_agent_workflow"] },
    { id: "research", label: "Research and synthesize information", description: "A multi-step researcher that gathers sources and produces reports.", roles: ["research_agent"] },
    { id: "browser", label: "Operate websites or browsers", description: "An agent specialized in browser and graphical interaction.", roles: ["browser_computer_agent"] },
    { id: "persistent", label: "Run a persistent, stateful agent", description: "Identity, memory, schedules, skills, and long-running state.", roles: ["stateful_agent_runtime"] },
    { id: "build_agents", label: "Build and orchestrate agents", description: "A framework for tools, workflows, state, and multi-agent coordination.", roles: ["agent_framework_sdk", "multi_agent_orchestrator"] }
  ]
};

const FINDER_PRIORITIES = {
  memory_system: [
    { id: "local_editable", label: "Local, inspectable knowledge", description: "Prefer local-first systems with data people can directly inspect or edit." },
    { id: "local_control", label: "Self-hosting and privacy", description: "Prefer local execution and strong control over stored data." },
    { id: "easy", label: "Low setup and maintenance", description: "Prefer systems that are easier for an individual to operate." },
    { id: "portable", label: "Open and interoperable", description: "Prefer portable formats, APIs, and provider flexibility." },
    { id: "balanced", label: "Best balanced fit", description: "Use the family-specific editorial score as the main tie-breaker." }
  ],
  agent_system: [
    { id: "direct_use", label: "Ready for me to use", description: "Prefer terminal, IDE, or web interfaces over embedded libraries." },
    { id: "developer", label: "Composable developer framework", description: "Prefer libraries and APIs for building a custom agent product." },
    { id: "local", label: "Local execution and control", description: "Prefer local-first agents that can operate on the host." },
    { id: "control", label: "Human control and recovery", description: "Prefer approvals, observability, checkpoints, and recoverability." },
    { id: "balanced", label: "Best balanced fit", description: "Use the family-specific editorial score as the main tie-breaker." }
  ]
};

async function loadJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function bootstrap() {
  const [directory, taxonomy, licenseEvidence] = await Promise.all([
    loadJSON("projects.json"), loadJSON("taxonomy.json"), loadJSON("license-evidence.json")
  ]);
  state.projects = directory.projects;
  state.taxonomy = taxonomy;
  state.licenses = new Map(licenseEvidence.entries.map(item => [item.repo.toLowerCase(), item]));
  $("#data-date").textContent = `Data updated ${directory.generated_at}`;
  populateFilters();
  renderStats();
  renderProjects();
  renderFinder();
  renderTaxonomy();
  bindEvents();
}

function taxonomyName(group, id) {
  return state.taxonomy[group].find(item => item.id === id)?.name || label(id);
}
const familyName = id => taxonomyName("system_families", id);
const roleName = id => taxonomyName("primary_roles", id);
const relationName = id => taxonomyName("agent_relations", id);
const architectureName = id => taxonomyName("architectures", id);
const traitNames = (group, values = []) => values.map(id => taxonomyName(group, id)).join(" · ");

function populateFilters() {
  const family = $("#family-filter");
  state.taxonomy.system_families.forEach(item => family.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  family.value = "memory_system";
  populateRoleFilter();
  state.taxonomy.agent_relations.forEach(item => $("#agent-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
  state.taxonomy.architectures.forEach(item => $("#architecture-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
}

function populateRoleFilter() {
  const role = $("#role-filter");
  const selected = role.value;
  const family = $("#family-filter").value;
  const publishedRoles = new Set(state.projects
    .filter(project => !family || project.system_family === family)
    .map(project => project.primary_role));
  const roles = state.taxonomy.primary_roles.filter(item => publishedRoles.has(item.id));
  role.innerHTML = '<option value="">All roles</option>' + roles.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("");
  if (roles.some(item => item.id === selected)) role.value = selected;
}

function updateScoreSortAvailability() {
  const scoreOption = $("#sort-filter").querySelector('option[value="score"]');
  const hasFamily = Boolean($("#family-filter").value);
  scoreOption.disabled = !hasFamily;
  if (!hasFamily && $("#sort-filter").value === "score") $("#sort-filter").value = "name";
}

function renderStats() {
  const memories = state.projects.filter(project => project.system_family === "memory_system").length;
  const agents = state.projects.filter(project => project.system_family === "agent_system").length;
  const licensed = state.licenses.size;
  $("#hero-kicker").textContent = `${state.projects.length} reviewed open-source projects`;
  $("#hero-stats").innerHTML = [
    [memories, "memory"], [agents, "agents"], [licensed, "licenses reviewed"]
  ].map(([value, text]) => `<div class="stat"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(text)}</span></div>`).join("");
}

function filteredProjects() {
  return AtlasCore.filterAndSortProjects(state.projects, {
    term: $("#project-search").value,
    family: $("#family-filter").value,
    role: $("#role-filter").value,
    roles: state.directoryRoles || [],
    agent: $("#agent-filter").value,
    architecture: $("#architecture-filter").value,
    status: $("#status-filter").value,
    localOnly: $("#local-filter").checked,
    sort: $("#sort-filter").value
  });
}

function renderProjects() {
  const projects = filteredProjects();
  const family = $("#family-filter").value;
  const finderContext = state.directoryRoles ? " · Finder match" : "";
  const scoreContext = family ? ` · ${family === "memory_system" ? "Memory" : "Agent"} score${finderContext}` : " · Scores hidden across families";
  $("#result-count").textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"}${scoreContext}`;
  $("#project-grid").innerHTML = projects.map(project => {
    const tags = [project.agent_relation, ...project.architectures.slice(0, 3)];
    const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${project.score.overall} out of 10">${project.score.overall}</div>` : "";
    return `<article class="project-card ${escapeHTML(project.system_family)}">
      <div class="card-top"><div><p class="family-label">${escapeHTML(familyName(project.system_family))}</p><h2>${escapeHTML(project.name)}</h2><div class="repo">${escapeHTML(project.repo)}</div></div>${score}</div>
      <span class="role-badge">${escapeHTML(roleName(project.primary_role))}</span>
      <p>${escapeHTML(project.description)}</p>
      <div class="tags">${tags.map(tag => `<span>${escapeHTML(label(tag))}</span>`).join("")}</div>
      <div class="card-footer"><span>${compactNumber(project.stars)} ★ ${project.status !== "active" ? `<b class="archived">· ${escapeHTML(project.status)}</b>` : ""}</span><button data-project="${escapeHTML(project.id)}">View details →</button></div>
    </article>`;
  }).join("") || '<div class="notice">No projects match these filters.</div>';
  $$('[data-project]').forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
}

function finderChoice(key, item) {
  return `<button class="finder-choice" data-finder-choice="${escapeHTML(key)}" data-finder-value="${escapeHTML(item.id)}">
    <span class="finder-choice-cue">${escapeHTML(item.cue || "Choose this")}</span>
    <strong>${escapeHTML(item.label)}</strong>
    <span>${escapeHTML(item.description)}</span>
  </button>`;
}

function renderFinderProgress() {
  const step = state.finder.step;
  const labels = ["Direction", "Job", "Priority"];
  $("#finder-progress").innerHTML = labels.map((item, index) => {
    const status = step > index ? "is-complete" : step === index ? "is-active" : "";
    return `<div class="finder-progress-step ${status}"><span>${step > index ? "✓" : index + 1}</span><strong>${item}</strong></div>`;
  }).join("") + `<p>${step >= 3 ? "Shortlist ready" : `Step ${step + 1} of 3`}</p>`;
}

function renderFinder() {
  renderFinderProgress();
  const { step, answers } = state.finder;
  let content;
  if (step === 0) {
    content = `<div class="finder-question"><p class="eyebrow">Start with the outcome</p><h2>What should it do?</h2><p>Memory systems preserve knowledge. Agent systems plan and act through tools.</p></div>
      <div class="finder-choice-grid two-up">${FINDER_FAMILIES.map(item => finderChoice("family", item)).join("")}</div>`;
  } else if (step === 1) {
    const choices = FINDER_GOALS[answers.family];
    content = `<div class="finder-question"><p class="eyebrow">${escapeHTML(familyName(answers.family))}</p><h2>Choose the closest job.</h2><p>You can broaden the directory afterward.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("goal", item)).join("")}</div>`;
  } else if (step === 2) {
    const choices = FINDER_PRIORITIES[answers.family];
    content = `<div class="finder-question"><p class="eyebrow">Final tradeoff</p><h2>What matters most?</h2><p>This adjusts ranking within the selected family.</p></div>
      <div class="finder-choice-grid">${choices.map(item => finderChoice("priority", item)).join("")}</div>`;
  } else {
    content = renderFinderResults();
  }
  const navigation = step > 0 ? `<div class="finder-navigation"><button class="ghost-button" data-finder-back>← Back</button><button class="ghost-button" data-finder-reset>Start over</button></div>` : "";
  $("#finder-content").innerHTML = content + navigation;
}

function priorityBoost(project, priority) {
  if (project.system_family === "memory_system") {
    if (priority === "local_editable") return (project.local_first ? 2.2 : 0) + (project.human_editable ? 2 : 0) + (project.architectures.includes("plain_files") ? 0.8 : 0);
    if (priority === "local_control") return (project.local_first ? 3 : 0) + (project.deployment.includes("self_hosted") ? 0.8 : 0) + project.score.data_sovereignty / 10;
    if (priority === "easy") return project.score.operational_simplicity / 2;
    if (priority === "portable") return project.score.interoperability / 1.8 + (project.architectures.includes("plain_files") ? 0.6 : 0);
    return project.score.overall / 3;
  }
  if (priority === "direct_use") return project.agent_interfaces.some(item => ["terminal", "ide", "web_app"].includes(item)) ? 3 : 0;
  if (priority === "developer") return project.agent_interfaces.some(item => ["library", "api_sdk"].includes(item)) ? 3 : 0;
  if (priority === "local") return (project.local_first ? 3 : 0) + (project.execution_boundaries.includes("host") ? 1 : 0) + project.score.data_sovereignty / 10;
  if (priority === "control") return project.score.human_control / 3 + project.score.observability_recovery / 4;
  return project.score.overall / 3;
}

function recommendationReasons(project, priority) {
  const reasons = [roleName(project.primary_role)];
  if (project.local_first) reasons.push("Local-first");
  if (project.system_family === "memory_system") {
    if (project.human_editable) reasons.push("Human-editable data");
    if (priority === "easy") reasons.push(`Simplicity ${project.score.operational_simplicity}/10`);
    if (priority === "portable") reasons.push(`Interoperability ${project.score.interoperability}/10`);
  } else {
    const interfaces = project.agent_interfaces.slice(0, 2).map(item => taxonomyName("agent_interfaces", item));
    reasons.push(...interfaces);
    if (priority === "control") reasons.push(`Human control ${project.score.human_control}/10`);
  }
  return [...new Set(reasons)].slice(0, 4);
}

function recommendedProjects() {
  const { family, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[family].find(item => item.id === goal);
  return state.projects
    .filter(project => project.status === "active" && project.system_family === family && goalConfig.roles.includes(project.primary_role))
    .map(project => {
      const roleIndex = goalConfig.roles.indexOf(project.primary_role);
      const match = 6 - roleIndex * 0.4 + project.score.overall * 0.2 + priorityBoost(project, priority);
      return { project, match, reasons: recommendationReasons(project, priority) };
    })
    .sort((a, b) => b.match - a.match || b.project.score.overall - a.project.score.overall || a.project.name.localeCompare(b.project.name))
    .slice(0, 3);
}

function renderFinderResults() {
  const { family, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[family].find(item => item.id === goal);
  const priorityConfig = FINDER_PRIORITIES[family].find(item => item.id === priority);
  const results = recommendedProjects();
  return `<div class="finder-result-heading"><div><p class="eyebrow">Your shortlist</p><h2>${escapeHTML(goalConfig.label)}</h2><p>Within ${escapeHTML(familyName(family).toLowerCase())}, weighted for “${escapeHTML(priorityConfig.label.toLowerCase())}.”</p></div><button class="primary-button" data-finder-directory>Browse matches →</button></div>
    <div class="finder-results">${results.map(({ project, reasons }, index) => `<article class="finder-result ${escapeHTML(project.system_family)}">
      <div class="finder-rank">0${index + 1}</div>
      <div><p class="family-label">${escapeHTML(roleName(project.primary_role))}</p><h3>${escapeHTML(project.name)}</h3><p>${escapeHTML(project.description)}</p></div>
      <div class="finder-why"><strong>Why it surfaced</strong><div class="tags">${reasons.map(reason => `<span>${escapeHTML(reason)}</span>`).join("")}</div></div>
      <p class="finder-tradeoff"><strong>Watch for:</strong> ${escapeHTML(project.weaknesses[0])}</p>
      <div class="finder-result-footer"><span>${escapeHTML(project.score.overall)} / 10 ${escapeHTML(project.score_profile)} score</span><button data-finder-project="${escapeHTML(project.id)}">View details →</button></div>
    </article>`).join("")}</div>
    <p class="finder-disclaimer">A curated starting point—not a benchmark of your workload.</p>`;
}

function applyFinderToDirectory() {
  const { family, goal, priority } = state.finder.answers;
  const goalConfig = FINDER_GOALS[family].find(item => item.id === goal);
  $("#project-search").value = "";
  $("#family-filter").value = family;
  populateRoleFilter();
  state.directoryRoles = goalConfig.roles.length > 1 ? [...goalConfig.roles] : null;
  $("#role-filter").value = goalConfig.roles.length === 1 ? goalConfig.roles[0] : "";
  $("#agent-filter").value = "";
  $("#architecture-filter").value = "";
  $("#status-filter").value = "active";
  $("#local-filter").checked = false;
  $("#sort-filter").value = "score";
  updateScoreSortAvailability();
  renderProjects();
  activateView("directory");
}

function renderTaxonomy() {
  const memoryRoles = state.taxonomy.primary_roles.filter(item => item.family === "memory_system");
  const agentRoles = state.taxonomy.primary_roles.filter(item => item.family === "agent_system");
  const groups = [
    ["System families", state.taxonomy.system_families], ["Memory-system roles", memoryRoles], ["Agent-system roles", agentRoles],
    ["Agent relationship", state.taxonomy.agent_relations], ["Architecture", state.taxonomy.architectures],
    ["Retrieval modes", state.taxonomy.retrieval_modes], ["Capture modes", state.taxonomy.capture_modes],
    ["Memory lifecycle", state.taxonomy.memory_lifecycle], ["Agent interfaces", state.taxonomy.agent_interfaces],
    ["Execution boundaries", state.taxonomy.execution_boundaries], ["Agent capabilities", state.taxonomy.agent_capabilities],
    ["Deployment modes", state.taxonomy.deployment_modes], ["Project statuses", state.taxonomy.project_statuses],
    ["Provenance levels", state.taxonomy.provenance_levels], ["Research confidence", state.taxonomy.research_confidence_levels],
    ["Eligible licenses", state.taxonomy.allowed_licenses]
  ];
  $("#taxonomy-content").innerHTML = groups.map(([name, items]) => `<section class="taxonomy-group"><h2>${escapeHTML(name)}</h2><div class="taxonomy-grid">${items.map(item => `<article class="taxonomy-item"><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.definition || item.note || "An explicit comparison trait.")}</p></article>`).join("")}</div></section>`).join("");
}

function openProject(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  const proof = state.licenses.get(project.repo.toLowerCase());
  const dimensions = Object.entries(project.score).filter(([key]) => key !== "overall");
  const familyDetail = project.system_family === "agent_system"
    ? `<section class="detail-block"><h3>Agent operation</h3><p><strong>Interfaces:</strong> ${escapeHTML(traitNames("agent_interfaces", project.agent_interfaces))}</p><p><strong>Execution:</strong> ${escapeHTML(traitNames("execution_boundaries", project.execution_boundaries))}</p><p><strong>Capabilities:</strong> ${escapeHTML(traitNames("agent_capabilities", project.agent_capabilities))}</p></section>`
    : `<section class="detail-block"><h3>Capture & lifecycle</h3><p><strong>Capture:</strong> ${project.capture_modes.map(label).map(escapeHTML).join(" · ")}</p><p><strong>Lifecycle:</strong> ${project.memory_lifecycle.map(label).map(escapeHTML).join(" · ")}</p></section>`;
  const licenseLink = proof ? `<a href="${escapeHTML(proof.immutable_url)}" target="_blank" rel="noreferrer">${escapeHTML(project.license)} immutable evidence ↗</a> · <a href="${escapeHTML(proof.url)}" target="_blank" rel="noreferrer">source path ↗</a>` : escapeHTML(project.license);
  $("#dialog-content").innerHTML = `<p class="eyebrow">${escapeHTML(familyName(project.system_family))} · ${escapeHTML(roleName(project.primary_role))}</p><h1>${escapeHTML(project.name)}</h1><p>${escapeHTML(project.why_it_matters)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>System identity</h3><p><strong>Agent relation:</strong> ${escapeHTML(relationName(project.agent_relation))}</p><p><strong>Canonical data:</strong> ${escapeHTML(project.canonical_data)}</p><p><strong>License:</strong> ${licenseLink}</p><p><strong>Deployment:</strong> ${escapeHTML(project.deployment.map(label).join(", "))}</p><p><a href="${escapeHTML(project.url)}" target="_blank" rel="noreferrer">Open GitHub repository ↗</a></p></section>
      <section class="detail-block"><h3>${escapeHTML(project.score_profile === "agent" ? "Agent-system" : "Memory-system")} score</h3><table class="score-table">${dimensions.map(([name, value]) => `<tr><td>${escapeHTML(label(name))}</td><td>${escapeHTML(value)}</td></tr>`).join("")}<tr><td><strong>Overall</strong></td><td>${project.score.overall}</td></tr></table></section>
      <section class="detail-block"><h3>Strengths</h3><ul>${project.strengths.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Weaknesses</h3><ul>${project.weaknesses.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>
      <section class="detail-block"><h3>Architecture</h3><p>${project.architectures.map(architectureName).map(escapeHTML).join(" · ")}</p><h3>Retrieval</h3><p>${project.retrieval_modes.map(label).map(escapeHTML).join(" · ")}</p></section>
      ${familyDetail}
    </div>`;
  $("#project-dialog").showModal();
}

function activateView(id) {
  $$(".tab").forEach(item => item.classList.toggle("is-active", item.dataset.tab === id));
  $$(".view").forEach(view => view.classList.toggle("is-active", view.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindEvents() {
  $$(".tab").forEach(button => button.addEventListener("click", () => activateView(button.dataset.tab)));
  $$('[data-open-tab]').forEach(button => button.addEventListener("click", () => activateView(button.dataset.openTab)));
  $("#family-filter").addEventListener("input", () => {
    state.directoryRoles = null;
    populateRoleFilter();
    updateScoreSortAvailability();
    renderProjects();
  });
  $("#role-filter").addEventListener("input", () => { state.directoryRoles = null; renderProjects(); });
  ["#project-search", "#agent-filter", "#architecture-filter", "#status-filter", "#sort-filter", "#local-filter"].forEach(selector => $(selector).addEventListener("input", renderProjects));
  $("#reset-filters").addEventListener("click", () => {
    state.directoryRoles = null; $("#project-search").value = ""; $("#family-filter").value = "memory_system"; populateRoleFilter();
    $("#role-filter").value = ""; $("#agent-filter").value = ""; $("#architecture-filter").value = "";
    $("#status-filter").value = "active"; $("#sort-filter").value = "score"; updateScoreSortAvailability(); $("#local-filter").checked = false;
    renderProjects();
  });
  $("#finder-content").addEventListener("click", event => {
    const choice = event.target.closest("[data-finder-choice]");
    if (choice) {
      const key = choice.dataset.finderChoice;
      state.finder.answers[key] = choice.dataset.finderValue;
      if (key === "family") {
        delete state.finder.answers.goal;
        delete state.finder.answers.priority;
      } else if (key === "goal") {
        delete state.finder.answers.priority;
      }
      state.finder.step = Math.min(3, state.finder.step + 1);
      renderFinder();
      return;
    }
    if (event.target.closest("[data-finder-back]")) {
      state.finder.step = Math.max(0, state.finder.step - 1);
      if (state.finder.step < 2) delete state.finder.answers.priority;
      if (state.finder.step < 1) delete state.finder.answers.goal;
      renderFinder();
      return;
    }
    if (event.target.closest("[data-finder-reset]")) {
      state.finder = { step: 0, answers: {} };
      renderFinder();
      return;
    }
    const projectButton = event.target.closest("[data-finder-project]");
    if (projectButton) {
      openProject(projectButton.dataset.finderProject);
      return;
    }
    if (event.target.closest("[data-finder-directory]")) applyFinderToDirectory();
  });
  $(".dialog-close").addEventListener("click", () => $("#project-dialog").close());
  $("#project-dialog").addEventListener("click", event => { if (event.target === $("#project-dialog")) $("#project-dialog").close(); });
}

bootstrap().catch(error => {
  document.body.innerHTML = `<main><div class="notice">Agent Systems Atlas failed to load: ${escapeHTML(error.message)}</div></main>`;
});
