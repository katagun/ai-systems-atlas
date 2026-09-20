const fs = require("node:fs");
const path = require("node:path");

// The browser renders from the published copies under web/, so the expected
// totals come from the same files the page fetches. Validation already keeps
// web/ byte-identical to directory/.
const WEB_DIR = path.join(__dirname, "..", "..", "..", "web");

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(WEB_DIR, name), "utf8"));
}

const projects = read("projects.json").projects;
const hostPackSystems = read("app/systems.json").systems.filter(system => (system.deployment || []).includes("host_pack"));
const inferenceServices = read("inference-services.json").services;
const localRuntimes = read("local-runtimes.json").runtimes;
const packs = read("packs.json").packs;
const reviewedModels = read("models.json").models;
const sourceModels = read("models-dev.json").models;
const sourceModelIds = new Set(sourceModels.map(model => model.source_id));
const models = sourceModels.length + reviewedModels.filter(model => !sourceModelIds.has(model.source_id)).length;

// The All view unions the four scored collections plus unscored agent packs;
// specifications are their own unscored collection and are not counted here.
const allDirectoryEntries = projects.length + inferenceServices.length + localRuntimes.length + models + packs.length;

function projectsInFamily(family) {
  return projects.filter(project => project.system_family === family).length;
}

// The Systems view opens on the "Active" status filter, so its pager counts only
// records whose status matches exactly (web/app-core.js filterProjects).
function projectsWithStatus(status) {
  return projects.filter(project => project.status === status).length;
}

// Reviewed-model card names filtered the way web/app-core.js filterModels
// matches facets, in grid order — score descending, then name, which is the
// Models view default sort — so filter expectations follow the data instead
// of a pinned list.
function reviewedModelNames(predicate) {
  return reviewedModels
    .filter(predicate)
    .sort(
      (a, b) =>
        (b.score?.overall ?? -1) - (a.score?.overall ?? -1) ||
        a.name.localeCompare(b.name)
    )
    .map(model => model.name);
}

function reviewedModelsWithSourceModel(sourceModel) {
  return reviewedModelNames(model => model.source_model === sourceModel);
}

function reviewedModelsWithModality(modality) {
  return reviewedModelNames(model =>
    [
      ...(model.source_metadata?.modalities?.input || []),
      ...(model.source_metadata?.modalities?.output || []),
    ].includes(modality)
  );
}

function reviewedModelsWithDistribution(mode) {
  return reviewedModelNames(model => (model.distribution_modes || []).includes(mode));
}

function reviewedModelsWithLicense(license) {
  return reviewedModelNames(model => (model.licenses || []).includes(license));
}

// Highest-scoring reviewed model in grid order: imports are unscored, so the
// first card is always the top reviewed record by score, then name.
function topReviewedModelName() {
  return reviewedModelNames(() => true)[0];
}

module.exports = {
  projects: projects.length,
  inferenceServices: inferenceServices.length,
  localRuntimes: localRuntimes.length,
  packs: packs.length,
  hostPackSystems: hostPackSystems.length,
  models,
  reviewedModels: reviewedModels.length,
  allDirectoryEntries,
  projectsInFamily,
  projectsWithStatus,
  reviewedModelsWithSourceModel,
  reviewedModelsWithModality,
  reviewedModelsWithDistribution,
  reviewedModelsWithLicense,
  topReviewedModelName,
};
