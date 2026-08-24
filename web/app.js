const state = { projects: [], taxonomy: null, licenses: new Map() };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const compactNumber = value => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const label = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

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
  $("#data-date").textContent = `Data verified ${directory.generated_at}`;
  populateFilters();
  renderStats();
  renderProjects();
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
  const roles = state.taxonomy.primary_roles.filter(item => !family || item.family === family);
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
  const stars = state.projects.reduce((sum, project) => sum + (project.stars || 0), 0);
  $("#hero-stats").innerHTML = [
    [memories, "memory systems"], [agents, "agent systems"], [licensed, "pinned licenses"], [compactNumber(stars), "verified stars"]
  ].map(([value, text]) => `<div class="stat"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(text)}</span></div>`).join("");
}

function filteredProjects() {
  const term = $("#project-search").value.trim().toLowerCase();
  const family = $("#family-filter").value;
  const role = $("#role-filter").value;
  const agent = $("#agent-filter").value;
  const architecture = $("#architecture-filter").value;
  const status = $("#status-filter").value;
  const localOnly = $("#local-filter").checked;
  const sort = $("#sort-filter").value;
  const results = state.projects.filter(project => {
    const haystack = JSON.stringify(project).toLowerCase();
    return (!term || haystack.includes(term)) && (!family || project.system_family === family) &&
      (!role || project.primary_role === role) && (!agent || project.agent_relation === agent) &&
      (!architecture || project.architectures.includes(architecture)) && (!status || project.status === status) &&
      (!localOnly || project.local_first);
  });
  results.sort((a, b) => {
    if (sort === "stars") return (b.stars || -1) - (a.stars || -1);
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.score.overall - a.score.overall;
  });
  return results;
}

function renderProjects() {
  const projects = filteredProjects();
  const family = $("#family-filter").value;
  const scoreContext = family ? ` · ${familyName(family)} score` : " · scores hidden across families";
  $("#result-count").textContent = `${projects.length} of ${state.projects.length} projects${scoreContext}`;
  $("#project-grid").innerHTML = projects.map(project => {
    const tags = [project.agent_relation, ...project.architectures.slice(0, 3)];
    const score = family ? `<div class="score-ring" aria-label="${escapeHTML(project.score_profile)} score ${project.score.overall} out of 10">${project.score.overall}</div>` : "";
    return `<article class="project-card ${escapeHTML(project.system_family)}">
      <div class="card-top"><div><p class="family-label">${escapeHTML(familyName(project.system_family))}</p><h2>${escapeHTML(project.name)}</h2><div class="repo">${escapeHTML(project.repo)}</div></div>${score}</div>
      <span class="role-badge">${escapeHTML(roleName(project.primary_role))}</span>
      <p>${escapeHTML(project.description)}</p>
      <div class="tags">${tags.map(tag => `<span>${escapeHTML(label(tag))}</span>`).join("")}</div>
      <div class="card-footer"><span>${compactNumber(project.stars)} ★ ${project.status === "archived" ? '<b class="archived">· archived</b>' : ""}</span><button data-project="${escapeHTML(project.id)}">Inspect system →</button></div>
    </article>`;
  }).join("") || '<div class="notice">No projects match these filters.</div>';
  $$('[data-project]').forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
}

function renderTaxonomy() {
  const memoryRoles = state.taxonomy.primary_roles.filter(item => item.family === "memory_system");
  const agentRoles = state.taxonomy.primary_roles.filter(item => item.family === "agent_system");
  const groups = [
    ["System families", state.taxonomy.system_families], ["Memory-system roles", memoryRoles], ["Agent-system roles", agentRoles],
    ["Agent relationship", state.taxonomy.agent_relations], ["Architecture", state.taxonomy.architectures],
    ["Retrieval modes", state.taxonomy.retrieval_modes], ["Capture modes", state.taxonomy.capture_modes],
    ["Memory lifecycle", state.taxonomy.memory_lifecycle], ["Agent interfaces", state.taxonomy.agent_interfaces],
    ["Execution boundaries", state.taxonomy.execution_boundaries], ["Agent capabilities", state.taxonomy.agent_capabilities]
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
  const licenseLink = proof ? `<a href="${escapeHTML(proof.url)}" target="_blank" rel="noreferrer">${escapeHTML(project.license)} license file ↗</a>` : escapeHTML(project.license);
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

function bindEvents() {
  $$(".tab").forEach(button => button.addEventListener("click", () => {
    $$(".tab").forEach(item => item.classList.toggle("is-active", item === button));
    $$(".view").forEach(view => view.classList.toggle("is-active", view.id === button.dataset.tab));
  }));
  $("#family-filter").addEventListener("input", () => {
    populateRoleFilter();
    updateScoreSortAvailability();
    renderProjects();
  });
  ["#project-search", "#role-filter", "#agent-filter", "#architecture-filter", "#status-filter", "#sort-filter", "#local-filter"].forEach(selector => $(selector).addEventListener("input", renderProjects));
  $("#reset-filters").addEventListener("click", () => {
    $("#project-search").value = ""; $("#family-filter").value = "memory_system"; populateRoleFilter();
    $("#role-filter").value = ""; $("#agent-filter").value = ""; $("#architecture-filter").value = "";
    $("#status-filter").value = "active"; $("#sort-filter").value = "score"; updateScoreSortAvailability(); $("#local-filter").checked = false;
    renderProjects();
  });
  $(".dialog-close").addEventListener("click", () => $("#project-dialog").close());
  $("#project-dialog").addEventListener("click", event => { if (event.target === $("#project-dialog")) $("#project-dialog").close(); });
}

bootstrap().catch(error => {
  document.body.innerHTML = `<main><div class="notice">Agent Systems Atlas failed to load: ${escapeHTML(error.message)}</div></main>`;
});
