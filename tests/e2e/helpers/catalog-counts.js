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
const labs = read("labs.json").labs;
const robots = read("robots.json").robots;
const reviewedModels = read("models.json").models;
const sourceModels = read("models-dev.json").models;
const sourceModelIds = new Set(sourceModels.map(model => model.source_id));
const models = sourceModels.length + reviewedModels.filter(model => !sourceModelIds.has(model.source_id)).length;

// The All view unions the four scored collections plus unscored agent packs
// and robots; specifications are their own unscored collection and are not
// counted here.
const allDirectoryEntries = projects.length + inferenceServices.length + localRuntimes.length + models + packs.length + robots.length;

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

// A lab joins the reviewed releases whose developer is one of its catalog
// names (web/app-core.js labRelations); labs sort by name only (filterLabs).
function labDeveloperNames(labId) {
  return new Set(labs.find(lab => lab.id === labId).catalog_names);
}

function labNames(predicate = () => true) {
  return labs.filter(predicate).map(lab => lab.name).sort((a, b) => a.localeCompare(b));
}

function labsWithReleaseDistribution(mode) {
  return labNames(lab => {
    const names = new Set(lab.catalog_names);
    return reviewedModels.some(model => names.has(model.developer) && (model.distribution_modes || []).includes(mode));
  });
}

// The lab search reads the generated index, which holds these fields
// (scripts/build_web_payload.py SEARCH_FIELDS["labs"]).
function labsMatching(term) {
  const needle = term.toLowerCase();
  return labNames(lab =>
    [lab.id, lab.name, lab.description, lab.organization_note, ...lab.catalog_names, lab.parent_organization || ""]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
}

function reviewedModelsDevelopedBy(labId) {
  const names = labDeveloperNames(labId);
  return reviewedModelNames(model => names.has(model.developer));
}

// The Models release sort's order (web/app-core.js releasesNewestFirst): newest
// models.dev release date first, ties and undated releases by name.
function reviewedModelsDevelopedByNewestFirst(labId) {
  const names = labDeveloperNames(labId);
  const date = model => model.source_metadata?.release_date || "";
  return reviewedModels
    .filter(model => names.has(model.developer))
    .sort((a, b) => date(b).localeCompare(date(a)) || a.name.localeCompare(b.name))
    .map(model => model.name);
}

// A lab dialog's longest unbroken strings are a channel URL and a word in the
// lab's name; the phone-width check opens the lab with the longest of each.
function labIdWithLongest(measure) {
  return labs.reduce((best, lab) => (measure(lab) > measure(best) ? lab : best)).id;
}

const labNamesInCatalog = new Set(labs.flatMap(lab => lab.catalog_names));
const labCoveredModels = reviewedModels.filter(model => labNamesInCatalog.has(model.developer)).length;

module.exports = {
  projects: projects.length,
  inferenceServices: inferenceServices.length,
  localRuntimes: localRuntimes.length,
  packs: packs.length,
  robots: robots.length,
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
  labs: labs.length,
  labCoveredModels,
  labNames,
  labsWithReleaseDistribution,
  labsMatching,
  reviewedModelsDevelopedBy,
  reviewedModelsDevelopedByNewestFirst,
  labIdWithLongestChannel: labIdWithLongest(lab => Math.max(...lab.channels.map(channel => channel.url.length))),
  labIdWithLongestNameWord: labIdWithLongest(lab => Math.max(...lab.name.split(/\s+/).map(word => word.length))),
};
