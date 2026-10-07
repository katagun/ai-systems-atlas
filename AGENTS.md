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
7. Keep scores within their taxonomy-defined profiles: system families, inference services, local runtimes, and reviewed models. Specifications, agent packs, labs, and robots are unscored; mixed discovery hides scores and comparisons.
8. Keep editorial fields human-owned: automation cannot create, change, or clear classifications, prose, scores, evidence, confidence, trust records, reviewed flags, or `verified_at`.
9. Require the collection's complete review workflow before promotion; candidate triage and attention signals are proposals, not accepted conclusions.
10. Preserve license-drift incidents until human resolution; stale evidence must not hide a record or rewrite its reviewed classification.
11. Keep models.dev data commit-pinned and attributed; its source snapshot is unreviewed metadata, with Atlas conclusions held in separate reviewed records. A reviewed model may exist before models.dev lists it (`source_id: null`, ADR 038); its metadata is then Atlas-authored, never attributed to models.dev. OpenRouter listings are unpublished leads, never source metadata or evidence, fetched only after a recorded terms review (ADR 039).
12. Publish catalog JSON only from `PUBLISHED_DATA` in `scripts/sync_web_data.py`; queues, dispositions, and discovery configuration remain unpublished.
13. Edit canonical inputs and generators, not generated data copies, app payloads, share pages, blog output, fonts, or logos. Generator locations and asset-version dependencies are in `docs/WEB.md` and `docs/BLOG.md`.
14. After published catalog edits, run `uv run python scripts/regenerate.py` and commit its output. That one command covers every generated tree in dependency order, card marks and vendored fonts included; the four-step list it replaced omitted them, and the omission is why a merge once left three generated files stale. `--check` reports every stale tree without writing.
15. Before completion, run the local validation, lint, test, syntax, and generated-file freshness checks in [`.pre-commit-config.yaml`](.pre-commit-config.yaml), including `build_web_payload.py --check`. GitHub CI scopes lint and Python tests to affected changes; browser tests remain local only.
16. For published-data or web changes, also exercise the browser verification matrix in `docs/WEB.md`: collection filters, score scopes, comparisons, URL/history restoration, Finder, taxonomy, and every record dialog.
17. Report only checks actually run, including failures or checks that could not run.
18. Measure code instead of transcribing it. A line count, function count, or file size written into prose is stale within days, and on 2026-09-29 three different figures for `web/app.js` were in circulation in one afternoon. Run `uv run python scripts/measure_engineering.py` or `build_web_payload.py --counts` and quote the result; when a document must carry a measurement, date it. `tests/test_documentation.py` asserts the claims that do not churn — that a cited symbol still exists and that a ratchet is not undercut — so prefer those to restating a number.

## Topic map

| Task | Entry point |
|---|---|
| System inclusion, licensing, prose, scores, forks, successors | [Curation](docs/CURATION.md) |
| Families, roles, deployment, authoring surfaces, provider relationships, robot software | [Taxonomy](docs/TAXONOMY.md) |
| Fields, enums, timestamps, local-first/editability, queues, dispositions | [Data model](docs/DATA_MODEL.md) |
| Refresh, validation, evidence links, terms/license drift, review age, CI/deploy | [Operations](docs/OPERATIONS.md) |
| UI, filters, comparison, details, badges, payloads, assets, accessibility | [Web](docs/WEB.md) |
| Model releases, access scores, models.dev import, OpenRouter leads, and promotion | [Models](docs/MODELS.md) |
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
| Engineering-debt measurements, complexity ratchet, stale prose figures | `scripts/measure_engineering.py` |

## Command reference

Environment setup (Python 3.12+; Node dependencies and Chromium support browser checks):

```bash
uv sync --locked
npm ci --ignore-scripts
npx playwright install chromium
pre-commit install
```

`npm ci` is not interchangeable with the install already on disk. `build_logos.mjs` and
`build_fonts.mjs` copy bytes out of installed packages, and their output records the
package versions it vendored, so a drifted `node_modules` produces a committed file that
CI regenerates differently. Both generators now refuse to run until the install matches
`package-lock.json`; if one refuses, run `npm ci --ignore-scripts` and generate again.
Never regenerate a committed artifact with a stale install to make a freshness hook pass.

Published catalog regeneration, in dependency order:

```bash
uv run python scripts/regenerate.py          # all six generated trees
uv run python scripts/regenerate.py --check  # report every stale tree, write nothing
```

The order is enforced in `scripts/regenerate.py`, not here, because a list of steps in
prose drifts from the set of generators.

Asset stamps are not in that sequence and no branch runs them. A committed page carries
`?v=BUILD` and the deploy job writes the hashes
([ADR 050](docs/adr/050-committed-pages-carry-an-asset-version-placeholder.md)).

Picking up main, and pushing afterwards:

```bash
uv run python scripts/update_from_main.py            # merge origin/main, then regenerate
uv run python scripts/update_from_main.py --dry-run  # would main move anything? are the trees current?
```

**Merge main; do not rebase a feature branch onto it.** A rebase replays the branch, and a
replay landing on regenerated files conflicts, so the recovery ends in a force-push — and
`verify.yml` sets `cancel-in-progress: true`, so each force-push kills the verification
run it just started. A merge needs one push and cancels nothing. The merge commit never
reaches main, which is squash-merged.

To skip only the browser suite on a push, use `SKIP=e2e-browser-tests`. Prefer that to
`git push --no-verify`, which also drops the sub-second staleness gate.

The complete local check list lives in [.pre-commit-config.yaml](.pre-commit-config.yaml).
The fast hooks run on commit and the unit and browser suites on push; `pre-commit run --all-files --hook-stage pre-push` runs every local check, browser suite included.
[verify.yml](.github/workflows/verify.yml) uses changed-file lint, content checks, and conditional full Python coverage; it never runs browser tests. See [Operations](docs/OPERATIONS.md#pre-commit) for CI scope and full-run fallbacks.
Browser tests (`npm run test:e2e`) start their own server. An exploratory server is available with
`uv run python scripts/serve_web.py 8765`.

Measurements, on demand and never transcribed:

```bash
uv run python scripts/measure_engineering.py          # line and function counts, complexity ratchet
uv run python scripts/build_web_payload.py --counts   # blocking boot payload against its 60 KB budget
```
