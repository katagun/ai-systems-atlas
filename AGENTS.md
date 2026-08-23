# AGENTS.md — Cognosaic

Local-first second brain + license-gated directory of open-source memory/PKM/agent projects.
Canonical Markdown records are the source of truth; SQLite/FTS indexes are disposable projections.

## Layout

- `cognosaic/` — engine, CLI (`cognosaic`), loopback web API (`api.py`, `serve`)
- `directory/` — `projects.json` (curated catalog), `taxonomy.json`, `exclusions.json`
- `scripts/` — `validate_directory.py`, `update_directory.py` (weekly GitHub refresh, runs in CI)
- `web/` — static directory UI + local memory UI
- `docs/` — `SPEC.md`, `TAXONOMY.md`, `ARCHITECTURE.md`, `adr/`, `IMPLEMENTATION_PLAN.md`
- `tests/` — unittest suite

Read `docs/SPEC.md`, `docs/TAXONOMY.md`, `docs/ARCHITECTURE.md`, and relevant ADRs before changing behavior.

## Commands

```bash
python -m venv .venv && source .venv/bin/activate && pip install -e .   # Python >= 3.11, no deps
python scripts/validate_directory.py
python -m unittest discover -s tests -v
python -m compileall cognosaic scripts tests
cognosaic --home ./demo-brain init|remember|search|context|serve        # see README for full CLI
```

Run validate + tests before claiming any change is done. For web changes also start `serve` and exercise `/api/health`, capture, search, and context packs.

## Hard rules

- Directory: GitHub-hosted, OSI-compatible licenses only. Verify from license files, not READMEs. Restricted projects go in `exclusions.json`.
- One `primary_role` per project; vector/graph/Markdown/SQLite are architectures, not roles.
- Live GitHub metadata never overwrites the human editorial score.
- Memory: never silently overwrite facts — use supersession. Records must stay readable without Cognosaic; indexes must be rebuildable (`reindex`).
- Mutating web APIs stay loopback-only and require the session mutation token.
- Never report tests/builds as passing unless you ran them.
- Finish the requested slice; log adjacent ideas in `docs/IMPLEMENTATION_PLAN.md` instead of expanding scope.
