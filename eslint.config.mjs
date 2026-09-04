// The web app ships as plain files with no build step, so linting is the only
// automated reader of web/app.js: node --check proves the syntax parses and the
// Playwright suite exercises behaviour, but neither notices an unused binding,
// a shadowed variable, or a name that was renamed at one call site.
import js from "@eslint/js";
import globals from "globals";

const shared = {
  ...js.configs.recommended.rules,
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
  "no-var": "error",
  "prefer-const": "error",
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-implied-eval": "error",
  "no-console": "off",
  // Both empty catches in this repo are deliberate: a browser refusing storage
  // and an absent generated file are normal, and there is nothing to record.
  "no-empty": ["error", { allowEmptyCatch: true }],
};

export default [
  { ignores: ["node_modules/**", "web/records/**", "playwright-report/**", "test-results/**"] },
  {
    // The browser bundle. AtlasCore is defined by app-core.js, loaded first.
    files: ["web/app.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, AtlasCore: "readonly" },
    },
    rules: shared,
  },
  {
    // A UMD module: the same file is required by the Node test suite.
    files: ["web/app-core.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, ...globals.commonjs },
    },
    rules: shared,
  },
  {
    files: ["scripts/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
    rules: shared,
  },
  {
    files: ["tests/**/*.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      // The specs run in Node, but page.evaluate callbacks inside them are
      // serialised and run in the browser, so both realms are legitimate here.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: shared,
  },
];
