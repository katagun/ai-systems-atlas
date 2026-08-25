# Agent Systems Atlas

Agent Systems Atlas is a curated, license-gated directory of open-source memory systems and AI agent systems. It separates what a system is for from how it works, and compares scores only inside the appropriate system family.

The repository contains the canonical editorial catalog, its validation and refresh automation, and a dependency-free static web interface. The local-first second-brain implementation informed by this research lives in [Cognosaic](https://github.com/embark-delve/cognosaic).

## Start here

```bash
uv sync --locked
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
node --test tests/test_web.js
uv run python -m http.server 8765 --directory web
```

Open `http://127.0.0.1:8765`.

## Choose your path

Read only what your task needs:

| Goal | Read next |
|---|---|
| Understand direction and sequencing | [`ROADMAP.md`](ROADMAP.md) |
| Understand families, roles, and scores | [`docs/TAXONOMY.md`](docs/TAXONOMY.md) |
| Add, remove, classify, or rescore a project | [`docs/CURATION.md`](docs/CURATION.md) |
| Understand JSON fields and timestamp semantics | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) |
| Run refreshes or review candidates/quarantine | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Change or verify the browser UI | [`docs/WEB.md`](docs/WEB.md) |
| See prioritized remaining work | [`BACKLOG.md`](BACKLOG.md) |
| Understand architectural decisions | [`docs/adr/`](docs/adr/) |

AI coding agents should begin with [`AGENTS.md`](AGENTS.md), which provides the same routing in an execution-oriented form.

## Repository map

```text
directory/projects.json         reviewed projects and editorial scores
directory/taxonomy.json         enum definitions, license allowlist, score profiles
directory/license-evidence.json reviewed source paths and immutable blob evidence
directory/exclusions.json       relevant systems outside the strict license gate
directory/candidates.json       durable provisional discovery queue
directory/quarantine.json       unresolved fail-closed license review queue
scripts/                        refresh, synchronization, and validation
tests/                          Python invariants and dependency-free web logic tests
web/                            static directory UI and published data copies
docs/                           task-focused policy, model, operations, and ADRs
```

## Trust model

- Main entries are GitHub-hosted and use a license from the curated OSI-compatible allowlist.
- License files are human-reviewed; GitHub metadata is only a drift signal.
- A detected license mismatch hides the project from the active directory until a human resolves it.
- Automated discoveries remain provisional and receive no editorial score or review date.
- Editorial verification dates are separate from live GitHub metadata dates.
- Memory and agent scores are never ranked across families.

The weekly workflow refreshes live metadata, preserves candidate and quarantine queues, validates the complete catalog, runs tests, and commits only verified data changes.

## License

Apache-2.0. Project names and descriptions remain the property of their respective projects and are used for factual identification and commentary.
