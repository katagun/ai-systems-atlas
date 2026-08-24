# AGENTS.md — Agent Systems Atlas

Curated, license-gated directory of open-source memory systems and AI agent systems.

## Layout

- `directory/` — canonical catalog, taxonomy, pinned license evidence, and exclusions
- `scripts/` — validation and scheduled GitHub refresh
- `web/` — dependency-free static directory UI
- `docs/` — taxonomy, research, curation policy, and ADRs
- `tests/` — directory invariants

Read `docs/TAXONOMY.md`, `docs/CURATION.md`, and relevant ADRs before changing classifications or editorial data.

## Commands

Use `uv` for all Python work.

```bash
uv sync --locked
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
uv run python -m http.server 8765 --directory web
```

Run validation and tests before claiming a change is complete. For web changes, also serve `web/` and exercise search, filters, taxonomy, and project details.

## Hard rules

- Main entries are GitHub-hosted and OSI-compatible. Verify the repository license files, not README claims.
- Restricted or mixed-license projects go in `directory/exclusions.json`.
- Assign exactly one `system_family` and one `primary_role`; vector, graph, Markdown, and SQLite are architectures, not roles.
- Memory and agent systems use different score profiles; never publish a cross-family score ranking.
- Preserve the distinction between live metadata and human editorial scores.
- Automated candidates stay provisional until an evidence-backed human review.
- Keep `directory/*.json` and the copies served from `web/` synchronized.
- Use `uv` for anything Python.
- Never report checks as passing unless you ran them.
