# AGENTS.md — AI Systems Atlas

Atlas combines a human-reviewed catalog, automated discovery metadata, and a static web app.
`directory/` owns catalog data; `scripts/` validates and generates; `web/` serves the site.

## Working rules

1. Read only the relevant topic below, then follow its links to specific policies or ADRs as needed. Research history (`docs/RESEARCH.md`, `docs/superpowers/`) is optional context for tasks about those decisions, not startup reading.
2. Preserve unrelated user changes.
3. Use `uv` for Python work; setup commands are below.
4. Decide inclusion by the collection's relevance and operational boundary, never by license or source model.
5. Base license classifications on authoritative, scoped license/terms evidence covering every material license; README claims and GitHub SPDX detection are insufficient.
6. Assign exactly one compatible `system_family` and `primary_role` only to system records in `projects.json`; traits are not roles.
7. Keep scores within their taxonomy-defined profiles: system families, inference services, local runtimes, and reviewed models. Specifications, agent packs, and labs are unscored; mixed discovery hides scores and comparisons.
8. Keep editorial fields human-owned: automation cannot change classifications, prose, scores, evidence, confidence, trust records, or `verified_at`.
9. Require the collection's complete review workflow before promotion; candidate triage and attention signals are proposals, not accepted conclusions.
10. Preserve license-drift incidents until human resolution; stale evidence must not hide a record or rewrite its reviewed classification.
11. Keep models.dev data commit-pinned and attributed; its source snapshot is unreviewed metadata, with Atlas conclusions held in separate reviewed records. A reviewed model may exist before models.dev lists it (`source_id: null`, ADR 038); its metadata is then Atlas-authored, never attributed to models.dev.
12. Publish catalog JSON only from `PUBLISHED_DATA` in `scripts/sync_web_data.py`; queues, dispositions, and discovery configuration remain unpublished.
13. Edit canonical inputs and generators, not generated data copies, app payloads, share pages, blog output, fonts, or logos. Generator locations and asset-version dependencies are in `docs/WEB.md` and `docs/BLOG.md`.
14. After published catalog edits, run the regeneration sequence below and commit its output; record additions also need logo regeneration per `docs/WEB.md`.
15. Before completion, run the local validation, lint, test, syntax, and generated-file freshness checks in `.github/workflows/verify.yml`, including `build_web_payload.py --check`.
16. For published-data or web changes, also exercise the browser verification matrix in `docs/WEB.md`: collection filters, score scopes, comparisons, URL/history restoration, Finder, taxonomy, and every record dialog.
17. Report only checks actually run, including failures or checks that could not run.

## Topic map

| Task | Entry point |
|---|---|
| System inclusion, licensing, prose, scores, forks, successors | [Curation](docs/CURATION.md) |
| Families, roles, deployment, authoring surfaces, provider relationships | [Taxonomy](docs/TAXONOMY.md) |
| Fields, enums, timestamps, local-first/editability, queues, dispositions | [Data model](docs/DATA_MODEL.md) |
| Refresh, validation, evidence links, terms/license drift, review age, CI/deploy | [Operations](docs/OPERATIONS.md) |
| UI, filters, comparison, details, badges, payloads, assets, accessibility | [Web](docs/WEB.md) |
| Model releases, access scores, models.dev import and promotion | [Models](docs/MODELS.md) |
| Protocols, conventions, packaging formats | [Specifications](docs/SPECIFICATIONS.md) |
| Managed inference, service scores, trust records | [Inference services](docs/INFERENCE_SERVICES.md) |
| Self-operated inference, runtime scores | [Local runtimes](docs/LOCAL_RUNTIMES.md) |
| Skills, plugins, vault bundles, marketplaces, host-installed packs | [Agent packs](docs/PACKS.md) |
| AI robots, vendor-named models, robot hardware, terms of sale | [Robots](docs/ROBOTS.md) |
| AI labs, model developers, organization names across collections, where a lab publishes | [Labs](docs/LABS.md) |
| Candidate triage routine | [Candidate triage](docs/routines/candidate-triage.md) |
| Hacker News attention signals and sweep routine | [HN signals](docs/routines/hn-signals.md) |
| Agent discovery, llms.txt, Atlas skill | [Agent docs](docs/AGENT_DOCS.md) |
| Blog content and shared page shell | [Blog](docs/BLOG.md) |
| Coverage gaps, direction, priorities | [Coverage](docs/COVERAGE.md), [Roadmap](ROADMAP.md), [Backlog](BACKLOG.md) |
| Linting, formatting, pre-commit hooks | [Operations](docs/OPERATIONS.md) |

## Command reference

Environment setup (Python 3.11+; Node dependencies and Chromium support browser checks):

```bash
uv sync --locked
npm ci --ignore-scripts
npx playwright install chromium
pre-commit install
```

Published catalog regeneration, in order:

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
node scripts/build_asset_version.mjs
```

The complete check list lives in [.pre-commit-config.yaml](.pre-commit-config.yaml) and runs in [verify.yml](.github/workflows/verify.yml).
It runs on commit via pre-commit; `pre-commit run --all-files` reproduces CI exactly, browser suite included.
Browser tests (`npm run test:e2e`) start their own server. An exploratory server is available with
`uv run python -m http.server 8765 --bind 127.0.0.1 --directory web`.
