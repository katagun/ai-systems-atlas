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

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `uv run python -m http.server ${port} --bind 127.0.0.1 --directory web`,
    url: origin,
    // Never adopt a server this run did not start: a foreign one serves another
    // checkout's web/ and turns stale data into failures that read as regressions.
    reuseExistingServer: false,
  },
});
