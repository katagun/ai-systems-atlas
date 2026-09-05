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
const inferenceServices = read("inference-services.json").services;
const localRuntimes = read("local-runtimes.json").runtimes;
const reviewedModels = read("models.json").models;
const sourceModels = read("models-dev.json").models;
const sourceModelIds = new Set(sourceModels.map(model => model.source_id));
const models = sourceModels.length + reviewedModels.filter(model => !sourceModelIds.has(model.source_id)).length;

// The All view unions the four scored collections; specifications are their
// own unscored collection and are not counted here.
const allDirectoryEntries = projects.length + inferenceServices.length + localRuntimes.length + models;

function projectsInFamily(family) {
  return projects.filter(project => project.system_family === family).length;
}

module.exports = {
  projects: projects.length,
  inferenceServices: inferenceServices.length,
  localRuntimes: localRuntimes.length,
  models,
  reviewedModels: reviewedModels.length,
  allDirectoryEntries,
  projectsInFamily,
};
