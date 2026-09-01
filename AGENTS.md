# AGENTS.md — AI Systems Atlas

This repository is a curated directory of operational memory, agent, and assistant systems plus unscored interoperability specifications, managed inference services, and self-operated local runtimes. Preserve evidence integrity and the distinction between human editorial judgment and automated metadata.

## Just-in-time context

Read only the documents required by the change:

| If you are changing… | Read first |
|---|---|
| project inclusion, classification, prose, or scores | `docs/CURATION.md`, then `docs/TAXONOMY.md` |
| JSON fields, enums, queues, or timestamps | `docs/DATA_MODEL.md` |
| updater, validation, license drift, or workflows | `docs/OPERATIONS.md`, `docs/adr/005-fail-closed-license-drift.md` |
| finder, Directory collections, filters, comparison, details, styles, or accessibility | `docs/WEB.md`, then `docs/adr/013-distinct-collections-share-one-directory-surface.md` for collection boundaries and `docs/adr/014-comparisons-are-scoped-to-one-score-profile.md` for comparison |
| system families, primary roles, or family boundaries | `docs/TAXONOMY.md`, then `docs/adr/003-multi-axis-directory.md`, `docs/adr/004-memory-and-agent-families.md`, `docs/adr/009-assistant-systems-are-a-distinct-family.md`, and `docs/adr/011-delegated-work-agents-are-agent-systems.md` |
| licenses, source models, or evidence scope | `docs/CURATION.md`, then `docs/adr/007-licenses-are-classification-not-inclusion.md` |
| project status, archival, or a maintainer-declared successor | `docs/CURATION.md`, then `docs/adr/016-superseded-predecessors-keep-their-record.md` |
| visual builders, authoring surface, or agent interfaces | `docs/TAXONOMY.md`, then `docs/adr/019-authoring-surface-is-a-trait-not-a-role.md` |
| vendor-hosted platforms, who operates a system, or deployment traits | `docs/TAXONOMY.md`, then `docs/adr/018-operating-party-is-a-trait-not-a-role.md` and `docs/adr/003-multi-axis-directory.md` |
| provider relationships or model backends | `docs/DATA_MODEL.md`, then `docs/adr/006-provider-relationships-are-orthogonal.md` |
| forks, ports, renames, or derivative candidates | `docs/CURATION.md`, then `docs/adr/020-derivative-records-turn-on-operational-boundary.md` for the boundary test and `docs/adr/016-superseded-predecessors-keep-their-record.md` for renames and declared successors |
| coverage gaps or expansion batches | `docs/COVERAGE.md`, then `docs/CURATION.md` |
| specifications, protocols, conventions, or package formats | `docs/SPECIFICATIONS.md`, then `docs/adr/008-specifications-are-unscored-artifacts.md` |
| inference services, model APIs, managed inference, routing platforms, or service scores | `docs/INFERENCE_SERVICES.md`, then `docs/adr/010-inference-services-are-unscored-service-records.md`, `docs/adr/012-inference-services-use-a-dedicated-score-profile.md`, and `docs/adr/013-distinct-collections-share-one-directory-surface.md` |
| local runtimes, self-hosted inference, runtime scores | `docs/LOCAL_RUNTIMES.md`, then `docs/adr/015-local-runtimes-are-self-operated-execution-records.md` for the boundary, `docs/adr/017-local-runtime-eligibility-ignores-modality.md` for eligibility and the vocabulary obligation, and `docs/adr/013-distinct-collections-share-one-directory-surface.md` |
| direction and sequencing | `ROADMAP.md` |
| priorities or follow-up work | `BACKLOG.md` |

Do not preload `docs/RESEARCH.md` unless the task concerns research conclusions or project lessons.

## Commands

Use `uv` for Python work.

```bash
uv sync --locked
uv run python scripts/sync_web_data.py
node scripts/build_logos.mjs --check
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
npm ci
npx playwright install chromium
npm run test:e2e
uv run python -m http.server 8765 --directory web
```

Run synchronization after changing any published `directory/*.json` file. Run all validation and tests before claiming completion. For published-data or web changes, also exercise system, specification, inference-service, and local-runtime search/filters, cross-family score hiding, scoped comparison and URL restoration, the finder handoff, taxonomy, and all four dialogs in a browser.

## Hard rules

- Relevance and operational capability determine inclusion; license or source model never does.
- Review authoritative license or terms sources and their component/path scope; README claims and GitHub SPDX detection are insufficient.
- Record every material license and one source-model classification from `directory/taxonomy.json`.
- A license mismatch opens a durable review incident and marks license evidence stale; it never silently hides the project or changes the human conclusion.
- Assign exactly one `system_family` and one compatible `primary_role`.
- Architecture, retrieval, deployment, and agent traits are not primary roles.
- Never compare or rank scores across score profiles.
- Never let automated refreshes change editorial prose, scores, evidence, confidence, or `verified_at`.
- Never promote `directory/candidates.json` records without the complete curation workflow.
- Keep specifications outside `system_family` and score profiles; classify their type, integration scope, and maturity without ranking unlike artifacts.
- Keep inference services outside `system_family` and system-family score profiles; use their dedicated service profile, curate named service boundaries rather than companies, models, or local runtimes, and never rank them with volatile prices or benchmarks.
- Keep local runtimes outside `system_family` and system-family score profiles; use their dedicated runtime profile, curate self-operated execution software rather than models, managed services, or client libraries, and never score them with throughput, latency, or benchmark results.
- Do not call a vendor convention an open standard. Pin authoritative specification and license evidence where available.
- Keep only `projects.json`, `taxonomy.json`, `exclusions.json`, `license-evidence.json`, `specifications.json`, `inference-services.json`, and `local-runtimes.json` synchronized into `web/`; candidate and license-review queues are not published.
- Never report checks as passing unless you ran them.

Existing unrelated changes belong to the user. Preserve them.
