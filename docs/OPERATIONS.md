# Operations

Use this document for refreshes, queue review, synchronization, and incident recovery.

## Routine verification

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_share_pages.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
```

Synchronization and share-page generation are write operations; the remaining commands are verification.

## Metadata refresh

```bash
GITHUB_TOKEN=... uv run python scripts/update_directory.py
```

The token is optional locally but recommended because GitHub search has a low anonymous rate limit. Never print or commit the token. Official non-GitHub discovery feeds are allowlisted in `directory/discovery-sources.json` and require no credentials.

The refresh is transactional at the repository level:

1. update live metadata in memory for projects with GitHub repositories;
2. require at least 80% project metadata success;
3. require at least one successful GitHub discovery query and one successful official feed when sources are configured;
4. validate source and redirect hosts before parsing only recent official feed items through bounded, doctype-free XML, launch-signal, and relevance checks;
5. detect license drift, mark evidence `review_required`, and open a durable incident;
6. preserve prior candidates and unresolved license-review incidents;
7. write canonical JSON and synchronize published web copies;
8. validate and test in CI before committing.

Transport failures preserve existing project metadata. `404` and `410` are conclusive and mark a GitHub-hosted project `removed`. Partial official-feed failures are warnings; an all-source failure aborts before writes. Official discovery never fetches article pages. Automated refreshes never edit editorial fields.

The same run also refreshes GitHub star counts for `directory/local-runtimes.json` records that carry a `repo`. This is a separate, lower-stakes pass: it only ever updates `stars` and `stars_verified_at`, it does not participate in the 80% success gate or license-drift machinery above, and a per-repository failure is a warning that leaves the existing value in place rather than an aborting condition. See [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md).

## Review a candidate

For one record in `directory/candidates.json`:

1. Inspect authoritative license or terms sources and their component scope.
2. Classify `source_model` and record every material license; restricted, mixed, and proprietary systems remain eligible.
3. Read official documentation and enough implementation or product behavior to establish the operational outcome.
4. Follow `CURATION.md` to create the full project and evidence records.
5. Remove the candidate only in the same change that records its disposition.
6. Synchronize, validate, test, and exercise the UI.

Never copy proposed classification into the catalog without human confirmation. Never reuse a provisional candidate as an editorial score.

Provider traits are reviewed during the same workflow. Leave both fields absent when support evidence has not been checked; do not infer provider agnosticism from a plugin interface or community adapter.

## Review an inference service

Follow `INFERENCE_SERVICES.md` and treat the named service—not its company or models—as the review unit. Review product documentation, data controls, and governing terms together. Keep endpoint-, model-, region-, feature-, and contract-specific exceptions in prose. Synchronize and verify the complete catalog, then exercise inference-service search, filters, and details in the browser.

Do not copy prices, rate limits, model leaderboards, or exhaustive model inventories into the editorial record. A model offered by several services remains one model behind several operational and contractual boundaries; it does not merge those service records.

## Resolve a license review

Inspect the authoritative license or terms sources again; GitHub's detected SPDX value is only the trigger.

- Update `licenses` and `source_model` when the reviewed scope changed.
- Replace or extend scoped evidence, set `license_review_status` to `verified`, and remove the incident.
- If scope remains unclear, keep the project visible with its last reviewed classification, retain `review_required`, and explain the uncertainty in the incident and project weaknesses.
- Move a project to exclusions only when the operational family/role boundary—not its license—fails review.

Resolution must update all related records atomically. Validation rejects mismatches between project review status and the license-review queue.

## Scheduled workflow

`.github/workflows/update-directory.yml` runs weekly and on demand. It refreshes metadata, regenerates share pages, verifies the result, then opens or updates `automation/directory-refresh`; it never commits directly to the default branch. Review license incidents, candidates, and the CI result before merging.

Verification is reported, not fatal. Every check runs even after an earlier one fails, so a single broken record cannot hide the rest, and the branch is pushed either way. A refresh that fails verification opens its pull request as a **draft** titled `(verification failed)`, carrying the per-check results and a link to the run. Repair the branch and push; the next run promotes it out of draft once the catalog verifies. The job itself still fails, so the run stays red.

This is deliberate: a crawl costs an hour of live GitHub and feed reads, and discarding it because two records disagree with an editorial invariant means waiting a week. The fail-closed gate belongs on merging into `main`, which branch protection already enforces — not on preserving the work.

Any failed run opens or updates one issue labeled `automation-failure` and comments the run link on later failures. Close it once a refresh succeeds. A red scheduled run that nobody is told about is not a signal.

The refresh checks out with `persist-credentials: false` and only configures git authentication in the publishing step, so third-party feeds and search results are never parsed beside a writable token.

### Tokens

The job runs with `GITHUB_TOKEN` scoped to `contents: write` and `pull-requests: write`. In repository **Settings → Actions → General**, keep the default workflow permission read-only and enable **Allow GitHub Actions to create and approve pull requests** so the refresh job can create its PR.

A pull request opened with `GITHUB_TOKEN` does not trigger workflows, so `verify` — the required check — never runs on it and the pull request cannot reach a mergeable state. Add a repository secret named `ATLAS_AUTOMATION_TOKEN` holding a fine-grained personal access token or GitHub App installation token for this repository with **Contents: read and write** and **Pull requests: read and write**. The workflow prefers it and falls back to `GITHUB_TOKEN`, so the refresh still runs without the secret; it just produces a pull request whose required check has to be started by hand.

## Share pages

`uv run python scripts/build_share_pages.py` writes one static landing page per published record under `web/records/<collection>/<id>/`, plus `web/sitemap.xml` and `web/robots.txt`, from the canonical `directory/*.json` files. `--check` rebuilds in memory and fails when the committed files differ or when `web/records/` holds a file the catalog no longer produces, so a published record cannot change without its share page. The weekly refresh regenerates the pages after updating metadata, because a status promotion changes a page.

## Vendored fonts

`node scripts/build_fonts.mjs --check` rebuilds `web/fonts.css` and the woff2 files under `web/fonts/` in memory from the installed `@fontsource` packages and fails when the committed copies differ, so a font package bump or a face change cannot ship unvendored; regenerate with `node scripts/build_fonts.mjs`.

## Asset versions

`node scripts/build_asset_version.mjs --check` recomputes the `?v=` query string on every local asset `web/index.html` references (`fonts.css`, `styles.css`, `app-core.js`, `app.js`) from that file's content hash and fails when the committed page carries a different value, so a stylesheet or script change cannot ship under a version a browser has already cached. Regenerate with `node scripts/build_asset_version.mjs` after editing any of those files; `tests/test_web.js` enforces the same rule. The weekly refresh regenerates them too, because a catalog change moves the hash of any published file index.html references.

## Logo coverage

`node scripts/build_logos.mjs --check` rebuilds `web/logos.json` in memory and fails when the committed file no longer matches the record map, the published records, or the installed icon-package versions. It also reports every monogram record and flags candidates whose id or name now matches an available icon slug. Three rails keep coverage current:

- `verify.yml` runs the check on every pull request, so a record-map edit or icon-package bump cannot merge without a regenerated `web/logos.json`.
- `update-directory.yml` writes the weekly coverage report to the run summary, surfacing records published without marks and newly available candidates.
- Dependabot's weekly npm pull requests bump the icon packages; the check fails on those PRs until the file is regenerated, which is when newly added icons become mappable.

A candidate hint is a review prompt, never an auto-mapping: confirm the icon depicts the record's product or the maintainer/operator named in its published data, then map it — or record `null` in `RECORD_MARKS` to decline it durably with a reason.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys only `web/` after the exact `main` revision passes the complete `verify` workflow. A manual run is accepted only from `main` and performs the deployment workflow's local validation before publishing. In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its default-branch deployment rule enabled; disable administrator bypass in the environment UI.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check. Classic `main` protection requires pull requests, a current `verify` result, conversation resolution, and an up-to-date branch; it blocks force-pushes and deletion. A complementary default-branch security ruleset makes high-or-higher CodeQL findings merge-blocking. Zero required approvals is intentional while the project has one maintainer; require an independent approval when a second maintainer is available.

`.github/CODEOWNERS` assigns every path to the maintainer. Ownership is advisory while required approvals are zero; enable **Require review from Code Owners** on `main` once a second maintainer exists.

All actions are pinned to immutable commit SHAs, and repository settings enforce those pins while allowing only GitHub-owned actions plus `astral-sh/setup-uv`. The required verification job includes dependency review for pull requests. `.github/dependabot.yml` opens weekly pull requests for Actions and npm updates. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.

Secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting, and CodeQL default setup are enabled. Secret validity checks and non-provider patterns remain disabled; enable them if the repository settings expose those controls later. See [`SECURITY.md`](../SECURITY.md) for reporting; do not put suspected vulnerabilities in public issues.

Use squash merges and linear history; merge commits and rebase merges are disabled. Automatic merge and the update-branch button are enabled. Keep zero required approvals only while the repository has one maintainer.
