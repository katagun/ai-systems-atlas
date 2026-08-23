# AGENTS.md — Cognosaic operating contract

## Mission

Build a trustworthy open-source systems directory and a local-first second brain that is inspectable, provenance-aware, efficient, and useful to both humans and agents.

## Read first

Before changing behavior, read:

1. `docs/SPEC.md`
2. `docs/TAXONOMY.md`
3. `docs/ARCHITECTURE.md`
4. the relevant ADRs in `docs/adr/`

## Orchestrator discipline

Protect the main context. Delegate independent work when the host supports subagents:

- **Landscape researcher:** discovers GitHub projects, verifies repository identity, maintenance, and current code location.
- **License auditor:** reads actual license files and identifies mixed-license or source-available traps.
- **Taxonomy analyst:** classifies primary role separately from architectures and capabilities.
- **Memory architect:** reviews lifecycle, provenance, temporal truth, deletion, and rebuildability.
- **Implementation agent:** changes one bounded vertical slice with tests.
- **QA/reviewer:** runs commands, probes edge cases, and reports evidence rather than confidence language.

Subagents return compact artifacts: findings, citations/URLs, uncertainties, and suggested patches. They do not dump unfiltered browsing logs into the orchestrator context.

## Hard rules

- GitHub-hosted and OSI-compatible open-source projects only in `directory/projects.json`.
- Do not infer openness from README marketing. Inspect repository license metadata and license files.
- Mixed or restricted repositories belong in `directory/exclusions.json` or quarantine.
- One `primary_role` per project. Vector, graph, Markdown, and SQLite are architectures—not primary roles.
- Preserve the human-authored editorial score when refreshing live GitHub metadata.
- Never silently overwrite canonical memory facts. Use supersession.
- Canonical records must remain readable without Cognosaic.
- Derived indexes must be rebuildable.
- Mutating web APIs stay loopback-only and require the session mutation token.
- Do not claim tests, builds, or updates passed unless the commands were executed.

## Completion evidence

For Python changes:

```bash
python scripts/validate_directory.py
python -m unittest discover -s tests -v
python -m compileall cognosaic scripts tests
```

For web changes, also start the local server and exercise `/api/health`, directory loading, capture, search, and context-pack generation.

## Scope control

Finish the requested slice. Record adjacent improvements in `docs/IMPLEMENTATION_PLAN.md`; do not broaden an implementation task into speculative cleanup.
