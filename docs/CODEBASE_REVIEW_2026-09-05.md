# Critical codebase review — 2026-09-05

## Executive assessment

The codebase has a strong editorial model, unusually explicit collection boundaries, and a substantial verification suite. A follow-up security review confirmed the mechanics of the first two findings, but also found that their original High ratings overstated the reachable impact. The unattended triage issue was a Medium-severity SSRF boundary because exploitation required control of a newly added triage block and invocation of a routine that was not installed on the reviewed host. The blog issue was Low severity because posts are repository-authored, deployment requires a merged change, and execution required a reader click. Both are fixed in the reviewed working tree.

After reverification, this review records no Critical or High findings, five Medium findings, and three Low findings. CR-01 and CR-02 are resolved; the other six findings remain open. Severity reflects demonstrated preconditions and impact, not only the vulnerable code shape.

| ID | Severity | Status | Finding |
|---|---|---|---|
| CR-01 | Medium | Resolved | Candidate triage fetched agent-authored URLs before validation |
| CR-02 | Low | Resolved | Blog Markdown links allowed active `javascript:` destinations |
| CR-03 | Medium | Open | Model comparison does not degrade safely when detail payloads fail |
| CR-04 | Medium | Open | Manual Pages deployment can bypass the complete verification workflow |
| CR-05 | Medium | Open | Multi-file updates and generated-tree rebuilds are not crash-consistent |
| CR-06 | Medium | Open | One missing collection payload prevents the entire application from booting |
| CR-07 | Low | Open | URL validation accepts malformed hostless URLs that the browser cannot render |
| CR-08 | Low | Open | Python 3.11 is declared as supported but is not exercised in CI |

Severity reflects credible impact if the path is reached, not just how often the path is used. Line references identify the reviewed implementation; they will naturally drift as fixes land.

## Scope and method

The review covered the canonical-data pipeline, validation and curation automation, generated web artifacts, the browser application, CI/CD workflows, and Python, JavaScript, and browser tests. It began at commit `6b316da` on branch `evidence-link-checking` plus the pre-existing working-tree changes present on 2026-09-05; those pre-existing changes were committed independently as `3c4ca63` while the follow-up was in progress. Final verification used `3c4ca63` plus the security changes described here. The follow-up independently reproduced the two security mechanics, challenged their threat assumptions and severities, implemented fixes, and subjected the patches to separate adversarial review. Unrelated user-owned changes were preserved.

The review combined source inspection, the repository's full verification suite, and focused reproductions. It did not run the live metadata refresh, models.dev import, or evidence-link crawl because those paths depend on external state and can update repository data; their implementations and unit tests were reviewed instead.

## Findings

### CR-01 — Candidate triage fetched agent-authored URLs before validation

**Severity: Medium — resolved**

The original triage runner invoked the evidence rechecker before the validator. The rechecker accepted every `kind: web` entry in the agent-edited queue and passed its URL directly to `urllib`, with automatic redirects and an unbounded read. Only afterward did the separate validator apply its URL check. A no-network reproduction confirmed that an HTTP link-local URL reached the HTTP-client boundary before validation; no redirect or TLS assumption was needed.

The path was real, but its preconditions matter. Normal `prepare` emits only GitHub LICENSE and README blobs, the routine can write only a newly added triage block, and the reviewed host did not have the routine installed. Exploitation therefore required influencing the unattended agent to invent a web item and then reaching `finish`. That supports Medium rather than the original High rating.

**Resolution**

The runner now validates the queue before rechecking and invokes an explicit `--unattended` mode ([`run_candidate_triage.py`](../scripts/run_candidate_triage.py), [`build_candidate_evidence.py`](../scripts/build_candidate_evidence.py)). That mode rejects `web` evidence and the wrong proposer before I/O, allows each of the `LICENSE` and `README` labels at most once, and derives GitHub request paths from the unchanged candidate repository. Missing GitHub blob SHAs no longer downgrade to generic web evidence.

The retained human-only web recheck path now requires a public-DNS HTTPS URL on port 443, rejects credentials plus private, loopback, link-local, reserved, and multicast answers, caps the address set, follows at most five same-host redirects, and reads at most 2 MiB. Its TLS socket connects to a validated numeric address while retaining the original hostname for SNI and certificate verification, closing the DNS validation/connection race and bypassing ambient proxies.

**Acceptance tests**

- Validation and unattended policy failures invoke neither the web fetcher nor GitHub getter.
- HTTP, file, data, FTP, credentials, non-default ports, loopback, private, mixed public/private, reserved, multicast, cross-host redirects, too many redirects, and oversized responses fail closed.
- Production connections receive only the validated numeric address while TLS verifies the cited hostname.
- Duplicate unattended citations are rejected before any GitHub request.

### CR-02 — Blog Markdown links allowed active URL schemes

**Severity: Low — resolved**

The original renderer escaped Markdown text, but then inserted a captured link destination into an `href` without a scheme policy. Escaping quotes prevented attribute injection; it did not make `javascript:` safe. A focused reproduction rendered a clickable `javascript:` anchor.

The technical defect was confirmed, but the first-pass High rating assumed an ingestion path that does not exist. Posts come only from reviewed repository files, the static Atlas origin has no identified authenticated state, and the link must be clicked. This is a worthwhile defense-in-depth fix with Low severity under the present trust model.

**Resolution**

The renderer now parses the browser-visible attribute value and allows only absolute HTTPS URLs or same-site relative paths, queries, and fragments ([`build_blog.py`](../scripts/build_blog.py)). It rejects other schemes, protocol-relative and backslash forms, controls, credentials, invalid ports, missing or malformed hosts, and parser leftovers. Escaping still occurs before inline rendering.

**Acceptance tests**

- Direct and mixed-case `javascript:`, `data:`, `file:`, HTTP, protocol-relative, backslash, control-prefixed, credential-bearing, and malformed HTTPS forms are rejected.
- Relative links and valid absolute HTTPS links render correctly, and HTML escaping remains intact.
- Independent parser fuzzing exercised 64,484 destination variants without finding an accepted non-HTTPS protocol.

### CR-03 — Model comparison does not degrade safely when detail payloads fail

**Severity: Medium**

Detail fetch errors are deliberately swallowed so a comparison can reopen with boot data ([`app.js`](../web/app.js#L1363), [`app.js`](../web/app.js#L1655)). The system comparison supports that state with null-safe helpers, and an end-to-end test protects it ([`deferred-data.spec.js`](../tests/e2e/deferred-data.spec.js#L116)). The model branch instead formats missing dimension scores directly and calls `.join()` on detail-only `strengths` and `tradeoffs` ([`app.js`](../web/app.js#L1698)). Model boot records contain only the overall score and omit those lists ([`build_web_payload.py`](../scripts/build_web_payload.py#L55), [`build_web_payload.py`](../scripts/build_web_payload.py#L153)).

A focused Playwright reproduction blocked model detail responses and opened a two-model comparison deep link. The comparison dialog remained hidden rather than opening in the intended bounded, degraded state. The temporary probe was removed after confirming the failure.

**Recommended fix**

Use the same `scoreCell` and `listCell` helpers as the other score profiles, and make nested source metadata null-safe. Add a model-specific network-failure test that asserts the dialog is visible, contains no `undefined`, performs a bounded number of requests, and raises no page error.

### CR-04 — Manual Pages deployment can bypass the complete verification workflow

**Severity: Medium**

The normal Pages path correctly requires a successful `Verify AI Systems Atlas` run for the exact `main` revision. The same workflow also accepts a manual dispatch from `main` without checking that result ([`deploy-pages.yml`](../.github/workflows/deploy-pages.yml#L20)). Its local build runs only the catalog validator, Node behavior tests, and syntax checks ([`deploy-pages.yml`](../.github/workflows/deploy-pages.yml#L40)). It omits Python tests and lint, ESLint, generated payload/share/blog/font/logo/asset freshness checks, and browser tests that the complete verification workflow runs ([`verify.yml`](../.github/workflows/verify.yml#L38)).

Repository and environment protection may reduce the likelihood, but the workflow is not self-enforcing: a manual deployment can publish stale generated data or a browser regression from a `main` revision whose complete verification did not pass.

**Recommended fix**

Prefer removing `workflow_dispatch`. If emergency manual deployment is required, make verification reusable and invoke the same job for the selected SHA, or query the exact SHA's required check result and refuse deployment unless it succeeded. Keep the external `github-pages` default-branch restriction as a second layer.

### CR-05 — Multi-file updates and generated-tree rebuilds are not crash-consistent

**Severity: Medium**

Several operations compute output before writing, but replace related files sequentially:

- The models.dev importer writes the published source snapshot and candidate queue in two independent writes ([`import_models_dev.py`](../scripts/import_models_dev.py#L404)). A failure on the second write contradicts the operator-facing claim that failure occurred without changing the queue's related state.
- The directory updater writes four canonical documents and then synchronizes/builds their projections ([`update_directory.py`](../scripts/update_directory.py#L705)). A late disk or build failure leaves a mixed generation locally.
- App payload, share-page, blog, and font builders delete the live generated tree before rewriting it ([`build_web_payload.py`](../scripts/build_web_payload.py#L223), [`build_share_pages.py`](../scripts/build_share_pages.py#L260), [`build_blog.py`](../scripts/build_blog.py#L303), [`build_fonts.mjs`](../scripts/build_fonts.mjs#L98)). Interruption can leave a partially published tree.

The weekly workflow preserves failed output on a draft branch, which is a useful recovery mechanism, but it does not make local operations or generated directories crash-consistent. The atomic temporary-file pattern in [`promote_model_candidate.py`](../scripts/promote_model_candidate.py#L273) is a useful starting point.

**Recommended fix**

Stage all canonical and generated outputs in sibling temporary paths, run validation against the staged view, fsync files where practical, then replace live files/directories only after every build succeeds. For a multi-file commit, keep a rollback manifest or use a generation directory plus one atomic pointer/manifest swap. Add fault-injection tests at each write boundary.

### CR-06 — One missing collection payload prevents the entire application from booting

**Severity: Medium**

The first render awaits six independent resources in one `Promise.all` ([`app.js`](../web/app.js#L161)). Any failed request rejects the entire bootstrap, after which the global handler replaces the page with a generic failure notice ([`app.js`](../web/app.js#L2037)). A transient or deployment-specific failure in, for example, the specifications payload therefore prevents users from browsing systems, runtimes, services, and models whose payloads loaded successfully.

This couples the availability of otherwise distinct collections and enlarges the blast radius of a stale or missing generated file.

**Recommended fix**

Use per-resource settlement, preserve successfully loaded collections, and disable only unavailable collection controls with a specific retryable notice. Taxonomy may remain a hard dependency if the UI truly cannot render without it. Add end-to-end cases for each missing boot payload and for recovery after retry.

### CR-07 — URL validation accepts malformed hostless URLs that the browser cannot render

**Severity: Low**

Catalog validation generally treats `startswith("https://")` as sufficient URL validation; the system path is representative ([`validate_directory.py`](../scripts/validate_directory.py#L428)), and the same pattern appears across specifications, services, runtimes, models, and evidence. The value `https://` passes that condition even though it has no host. The browser later constructs `new URL(project.url)` without a guard ([`app.js`](../web/app.js#L56)), which throws for that value and can interrupt rendering.

Replace prefix checks with one shared parser that requires an absolute HTTPS URL, a nonempty hostname, no credentials, and any collection-specific host policy. Use the same policy in network clients. Add invalid-host, credential, port, Unicode, and normalization tests.

### CR-08 — Python 3.11 is declared as supported but is not exercised in CI

**Severity: Low**

The package declares Python 3.11 and newer and Ruff targets 3.11 ([`pyproject.toml`](../pyproject.toml#L1)), while verification installs only Python 3.12 ([`verify.yml`](../.github/workflows/verify.yml#L31)). Static target-version checks catch syntax incompatibilities but not runtime and standard-library behavior differences.

Run the Python unit tests and validator on both 3.11 and the primary current version. Browser installation and end-to-end tests need run only once. Alternatively, raise the declared minimum to the version actually supported.

## What is working well

- The repository distinguishes human editorial decisions from automated metadata and encodes that distinction in schemas, ADRs, and validation.
- Score profiles and collection boundaries are explicit, and cross-profile comparisons are deliberately prevented.
- Generated data has content-versioning and freshness checks instead of relying on undocumented build behavior.
- The published/static application has a small runtime dependency surface and no third-party client framework.
- CI pins Actions to commit SHAs, removes checkout credentials while parsing external input, reviews dependency changes, and runs substantial Python, JavaScript, and browser coverage.
- The models.dev source snapshot remains separate from reviewed model records, preserving provenance and preventing automated promotion.
- Existing failure-path browser tests show the right intent; CR-03 is a localized inconsistency rather than an absence of resilience engineering.

## Verification record

The following checks passed against the reviewed working tree:

- `uv run ruff check scripts tests`
- `uv run python scripts/validate_directory.py`
- `uv run python -m unittest discover -s tests -v` — 326 tests after the security fixes
- `uv run python -m compileall scripts tests`
- `node --check web/app-core.js` and `node --check web/app.js`
- `node --test tests/test_web.js` — 70 tests
- `npm run lint:js`
- logo, font, asset-version, share-page, app-payload, and blog freshness checks
- `npm run test:e2e` — 96 tests

The focused model-detail outage probe failed as described in CR-03; it was a deliberate reproduction of the uncovered defect, not part of the passing committed suite. Separate security regression runs cover 104 candidate-evidence tests and 23 blog tests. The blog finding was confirmed from the generated anchor and cross-checked against WHATWG URL parsing; an unsafe live click was not forced after the in-app browser rejected the data-URL test context.

## Tracking and remediation order

[`BACKLOG.md`](../BACKLOG.md) is the executable source of truth. Keep finding evidence and acceptance detail here; update status here when a finding is resolved, and remove the corresponding backlog item once its regression tests pass. Within the engineering work, use this order:

1. CR-01 and CR-02 are resolved in the reviewed working tree.
2. Fix CR-03 and add the missing model failure-path coverage.
3. Make manual deployment prove full verification for the exact SHA (CR-04).
4. Make repository and generated-tree writes crash-consistent (CR-05).
5. Reduce boot coupling (CR-06), then centralize URL validation and test the declared Python floor (CR-07 and CR-08).

The new security regressions are organized around unattended network policy, destination and redirect validation, DNS-to-socket binding, bounded reads, and generated-HTML sinks. Keep those controls aligned with the written trust model as the automation and writing surfaces evolve.
