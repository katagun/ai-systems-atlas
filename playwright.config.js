const crypto = require("node:crypto");
const { defineConfig } = require("@playwright/test");

// The suite serves its own copy of web/ on a port derived from this checkout's
// path, so an exploratory server on 8765 or a suite running in another worktree
// can never be mistaken for this one's site. Set ATLAS_E2E_PORT to override.
function e2ePort() {
  const override = Number(process.env.ATLAS_E2E_PORT);
  if (Number.isInteger(override) && override > 0 && override < 65536) return override;
  return 45000 + (crypto.createHash("sha256").update(__dirname).digest().readUInt16BE(0) % 1000);
}

const port = e2ePort();
const origin = `http://127.0.0.1:${port}`;

// CI splits the suite across runners: ATLAS_E2E_SHARD="1/2" runs the first half.
// Unset locally, so `npm run test:e2e` is still the whole suite.
function e2eShard() {
  const match = /^(\d+)\/(\d+)$/.exec(process.env.ATLAS_E2E_SHARD || "");
  if (!match) return undefined;
  const [current, total] = [Number(match[1]), Number(match[2])];
  if (current < 1 || total < 1 || current > total) throw new Error(`ATLAS_E2E_SHARD must be current/total, got ${process.env.ATLAS_E2E_SHARD}`);
  return { current, total };
}

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  shard: e2eShard(),
  reporter: "list",
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
  },
  webServer: {
    // Not `python -m http.server`: its listen backlog of five drops connections
    // from the parallel boot fetches (scripts/serve_web.py explains).
    command: `uv run python scripts/serve_web.py ${port}`,
    url: origin,
    // Never adopt a server this run did not start: a foreign one serves another
    // checkout's web/ and turns stale data into failures that read as regressions.
    reuseExistingServer: false,
  },
});
