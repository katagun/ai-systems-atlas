# Operations

Use this document for refreshes, queue review, synchronization, and incident recovery.

## Routine verification

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
```

Synchronization is a write operation; the remaining commands are verification.

## Metadata refresh

```bash
GITHUB_TOKEN=... uv run python scripts/update_directory.py
```

The token is optional locally but recommended because GitHub search has a low anonymous rate limit. Never print or commit the token.

The refresh is transactional at the repository level:

1. update live metadata in memory for projects with GitHub repositories;
2. require at least 80% project metadata success;
3. require at least one successful discovery query;
4. detect license drift, mark evidence `review_required`, and open a durable incident;
5. preserve prior candidates and unresolved license-review incidents;
6. write canonical JSON and synchronize published web copies;
7. validate and test in CI before committing.

Transport failures preserve existing project metadata. `404` and `410` are conclusive and mark a GitHub-hosted project `removed`. Automated refreshes never edit editorial fields.

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

## Resolve a license review

Inspect the authoritative license or terms sources again; GitHub's detected SPDX value is only the trigger.

- Update `licenses` and `source_model` when the reviewed scope changed.
- Replace or extend scoped evidence, set `license_review_status` to `verified`, and remove the incident.
- If scope remains unclear, keep the project visible with its last reviewed classification, retain `review_required`, and explain the uncertainty in the incident and project weaknesses.
- Move a project to exclusions only when the operational family/role boundary—not its license—fails review.

Resolution must update all related records atomically. Validation rejects mismatches between project review status and the license-review queue.

## Scheduled workflow

`.github/workflows/update-directory.yml` runs weekly and on demand. It validates a complete refresh, then opens or updates `automation/directory-refresh`; it never commits directly to the default branch. Review license incidents, candidates, and the CI result before merging. Review a failed run rather than manually committing partial runner output.

The workflow uses `GITHUB_TOKEN` with job-scoped `contents: write` and `pull-requests: write`. In repository **Settings → Actions → General**, keep the default workflow permission read-only and enable **Allow GitHub Actions to create and approve pull requests** so the refresh job can create its PR. GitHub may require a maintainer to approve CI on bot-created PRs; that review gate is intentional.

## GitHub Pages

`.github/workflows/deploy-pages.yml` validates the published catalog and deploys only `web/` after a push to `main` or a manual run. In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its deployment protection rules enabled.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check. Configure a `main` ruleset that requires pull requests, the `verify` job, conversation resolution, and a current branch before merge. Keep force-pushes and branch deletion disabled. Enable secret scanning, push protection, Dependabot alerts, and CodeQL default setup for the public repository.

All third-party actions are pinned to immutable commit SHAs. `.github/dependabot.yml` opens weekly pull requests to keep those pins current. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.
