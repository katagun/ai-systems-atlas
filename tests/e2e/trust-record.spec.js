const { test, expect } = require("@playwright/test");

// A trust record is an optional, unscored, human-owned block on a service. No
// published record carries one until the first review batch lands, so these
// tests serve one into the detail payload and hold the three rendered states:
// absent, reviewed with findings, reviewed with none — never "clean".

const property = (status, note) => ({
  status,
  note,
  url: "https://openrouter.ai/docs/",
  scope: "OpenRouter API documentation for the named service",
  verified_at: "2026-09-17",
});

const TRUST = {
  verified_at: "2026-09-18",
  properties: {
    response_integrity: property("undocumented", "No signing or attestation of responses is documented."),
    upstream_disclosure: property("documented_yes", "The provider routing guide names each upstream by provider."),
    credential_handling: property("documented_yes", "Bring-your-own-key storage is described in the integrations guide."),
    cache_isolation: property("undocumented", "The documentation does not say whether caches are pooled across customers."),
    vulnerability_disclosure: property("documented_yes", "A security contact is published."),
    independent_audit: property("undocumented", "No attestation naming the API is published."),
  },
  findings: [{
    claim: "Routing through OpenRouter with shared organizational credentials may create global cache sharing across all OpenRouter users.",
    published_at: "2026-05-28",
    source: {
      label: "CacheProbe: Auditing Prompt Cache Isolation in Gateway APIs, arXiv 2605.30613v1",
      url: "https://arxiv.org/abs/2605.30613v1",
      kind: "third_party",
      content_sha256: "0".repeat(64),
      fetched_at: "2026-09-16",
    },
    operator_response: null,
    resolved: null,
  }],
};

async function serveTrust(page, id, trust) {
  await page.route(`**/app/detail/inference/${id}.json*`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    await route.fulfill({ response, json: { ...detail, trust } });
  });
}

// The opposite fixture: a record served without any trust block, so the "not
// examined" states stay testable after every published service has been reviewed.
async function serveWithoutTrust(page, id) {
  await page.route(`**/app/detail/inference/${id}.json*`, async route => {
    const response = await route.fetch();
    const { trust, ...detail } = await response.json();
    await route.fulfill({ response, json: detail });
  });
}

const collectPageErrors = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
};

test("a service without a trust record says it has not been examined", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveWithoutTrust(page, "openai-api");
  await page.goto("/?record=inference:openai-api");
  const block = page.locator('#inference-dialog-content [data-trust="absent"]');
  await expect(block).toContainText("Trust record · unscored");
  await expect(block).toContainText("Not yet examined for trust properties.");
  expect(errors).toEqual([]);
});

test("a reviewed service renders six statuses and its finding, none as a score", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveTrust(page, "openrouter", TRUST);
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#inference-dialog-content [data-trust="findings"]');
  await expect(block).toContainText("Trust record · unscored");
  await expect(block.locator(".trust-table tr")).toHaveCount(6);
  await expect(block.locator(".trust-table tr").first()).toContainText("Response integrity");
  await expect(block.locator(".trust-table tr").first()).toContainText("Undocumented");
  await expect(block).toContainText("CacheProbe");
  await expect(block).toContainText("published 2026-05-28");
  await expect(block).toContainText("Operator response: none recorded.");
  await expect(block).not.toContainText("undefined");
  await expect(block).not.toContainText("/ 10");
  expect(errors).toEqual([]);
});

test("a reviewed service with no findings never reads as clean", async ({ page }) => {
  await serveTrust(page, "openrouter", { ...TRUST, findings: [] });
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#inference-dialog-content [data-trust="reviewed"]');
  await expect(block).toContainText("Reviewed on 2026-09-18; no admissible third-party finding recorded.");
  await expect(block).toContainText("Absence of a finding is not evidence of safety.");
});

test("a closed finding shows its resolution beside the claim", async ({ page }) => {
  const closed = {
    ...TRUST,
    findings: [{
      ...TRUST.findings[0],
      operator_response: { url: "https://openrouter.ai/docs/", verified_at: "2026-09-17", summary: "The operator states caches are keyed per API key." },
      resolved: { url: "https://openrouter.ai/docs/", verified_at: "2026-09-17", summary: "Per-key cache scoping is now documented." },
    }],
  };
  await serveTrust(page, "openrouter", closed);
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#inference-dialog-content [data-trust="findings"]');
  await expect(block).toContainText("Operator response: The operator states caches are keyed per API key.");
  await expect(block).toContainText("Closed: Per-key cache scoping is now documented.");
});

test("a service whose detail has not loaded yet never reads as unexamined", async ({ page }) => {
  await page.route("**/app/detail/inference/openai-api.json*", route => route.abort());
  await page.goto("/?record=inference:openai-api");
  const pending = page.locator('#inference-dialog-content [data-trust="pending"]');
  await expect(pending).toBeVisible();
  await expect(pending).toContainText("Trust record · unscored");
  await expect(page.locator('#inference-dialog-content [data-trust="absent"]')).toHaveCount(0);
});

test("a comparison shows six unscored trust rows and marks unreviewed records as not examined", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveTrust(page, "openrouter", TRUST);
  await serveWithoutTrust(page, "openai-api");
  await page.goto("/?collection=inference&compare=inference:openrouter,openai-api");
  const table = page.locator("#comparison-dialog-content .comparison-table");
  const row = table.locator("tr").filter({ hasText: "Cache isolation · trust record, unscored" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(0)).toHaveText("Undocumented");
  await expect(row.locator("td").nth(0)).toHaveAttribute("title", /caches are pooled/);
  await expect(row.locator("td").nth(1)).toHaveText("not examined");
  await expect(table.locator("tr").filter({ hasText: "trust record, unscored" })).toHaveCount(6);
  await expect(table).not.toContainText("undefined");
  expect(errors).toEqual([]);
});

test("a comparison record whose detail failed to load never reads as not examined", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveTrust(page, "openrouter", TRUST);
  await page.route("**/app/detail/inference/openai-api.json*", route => route.abort());
  await page.goto("/?collection=inference&compare=inference:openrouter,openai-api");
  const table = page.locator("#comparison-dialog-content .comparison-table");
  const row = table.locator("tr").filter({ hasText: "Cache isolation · trust record, unscored" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(0)).toHaveText("Undocumented");
  await expect(row.locator("td").nth(1)).toHaveText("—");
  await expect(row.locator("td").nth(1)).not.toHaveText("not examined");
  expect(errors).toEqual([]);
});
