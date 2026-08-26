# AGENTS.md — AI Systems Atlas

This repository is a curated directory of operational memory systems and AI agent systems across open-source, mixed, open-core, source-available, and proprietary source models. Preserve evidence integrity and the distinction between human editorial judgment and automated metadata.

## Just-in-time context

Read only the documents required by the change:

| If you are changing… | Read first |
|---|---|
| project inclusion, classification, prose, or scores | `docs/CURATION.md`, then `docs/TAXONOMY.md` |
| JSON fields, enums, queues, or timestamps | `docs/DATA_MODEL.md` |
| updater, validation, license drift, or workflows | `docs/OPERATIONS.md`, `docs/adr/005-fail-closed-license-drift.md` |
| finder, filters, details, styles, or accessibility | `docs/WEB.md` |
| taxonomy or family boundaries | relevant files in `docs/adr/` |
| coverage gaps or expansion batches | `docs/COVERAGE.md`, then `docs/CURATION.md` |
| direction and sequencing | `ROADMAP.md` |
| priorities or follow-up work | `BACKLOG.md` |

Do not preload `docs/RESEARCH.md` unless the task concerns research conclusions or project lessons.

## Commands

Use `uv` for Python work.

```bash
uv sync --locked
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
uv run python -m http.server 8765 --directory web
```

Run synchronization after changing any published `directory/*.json` file. Run all validation and tests before claiming completion. For web changes, also exercise search, family and role filters, cross-family score hiding, the finder handoff, taxonomy, and project details in a browser.

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
- Keep only `projects.json`, `taxonomy.json`, `exclusions.json`, and `license-evidence.json` synchronized into `web/`; candidate and license-review queues are not published.
- Never report checks as passing unless you ran them.

Existing unrelated changes belong to the user. Preserve them.
