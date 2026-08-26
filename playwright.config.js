const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "uv run python -m http.server 8765 --bind 127.0.0.1 --directory web",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
  },
});
