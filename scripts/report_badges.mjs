// Advisory only: never changes classifications or makes prevalence a gate.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CARD_BADGES, CARD_BADGE_SETS, cardBadges, MAX_CARD_BADGES } = require("../web/app-core.js");
const read = file => JSON.parse(readFileSync(new URL(`../directory/${file}`, import.meta.url), "utf8"));
const systems = read("projects.json").projects;
const scopes = {
  ...Object.fromEntries(["agent_system", "memory_system", "assistant_system"].map(family =>
    [`system:${family}`, ["system", systems.filter(record => record.system_family === family)]])),
  inference: ["inference", read("inference-services.json").services],
  runtime: ["runtime", read("local-runtimes.json").runtimes],
  model: ["model", read("models.json").models.map(record => ({ ...record, review_status: "reviewed" }))],
  robot: ["robot", read("robots.json").robots],
};
const report = Object.entries(scopes).map(([scope, [kind, records]]) => ({
  scope,
  population: "Canonical published records, including archived; imported model rows excluded",
  denominator: records.length,
  atCapacity: records.filter(record => cardBadges(kind, record).length === MAX_CARD_BADGES).map(record => record.id),
  overflow: records.filter(record => cardBadges(kind, record).length > MAX_CARD_BADGES).map(record => record.id),
  traits: CARD_BADGE_SETS[scope].filter(id => CARD_BADGES[id].family !== "type").map(id => {
    const count = records.filter(record => cardBadges(kind, record).some(badge => badge.id === id)).length;
    const percent = records.length ? Math.round(1000 * count / records.length) / 10 : 0;
    return { id, count, percent, advisory: percent < 10 || percent > 75 ? "Outside 10–75% guide; review scope, never alter data to meet it" : "Within guide", exception: kind === "model" ? "Every reviewed distribution mode is shown, regardless of prevalence" : null };
  }),
}));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
