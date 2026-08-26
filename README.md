# AI Systems Atlas

AI Systems Atlas is a curated directory of operational AI systems and the specifications that connect them. Memory and agent systems are compared only inside their family; protocols, conventions, and package formats are classified separately and left unscored. Licensing and reviewed evidence stay explicit throughout.

Browse the published directory at [katagun.github.io/agent-systems-atlas](https://katagun.github.io/agent-systems-atlas/).

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
| Add or understand a protocol, convention, or format | [`docs/SPECIFICATIONS.md`](docs/SPECIFICATIONS.md) |
| Understand coverage and choose a research batch | [`docs/COVERAGE.md`](docs/COVERAGE.md) |
| Add, remove, classify, or rescore a project | [`docs/CURATION.md`](docs/CURATION.md) |
| Understand JSON fields and timestamp semantics | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) |
| Run refreshes or review candidate/license incidents | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Change or verify the browser UI | [`docs/WEB.md`](docs/WEB.md) |
| See prioritized remaining work | [`BACKLOG.md`](BACKLOG.md) |
| Understand architectural decisions | [`docs/adr/`](docs/adr/) |

AI coding agents should begin with [`AGENTS.md`](AGENTS.md), which provides the same routing in an execution-oriented form.

## Repository map

```text
directory/projects.json         reviewed projects and editorial scores
directory/taxonomy.json         enum definitions, license catalog, score profiles
directory/license-evidence.json reviewed source paths and immutable blob evidence
directory/specifications.json  reviewed unscored protocols, conventions, and formats
directory/exclusions.json       reviewed family/role boundary decisions
directory/candidates.json       durable provisional discovery queue
directory/license-review.json   unresolved license-evidence review queue
scripts/                        refresh, synchronization, and validation
tests/                          Python invariants and dependency-free web logic tests
web/                            static directory UI and published data copies
docs/                           task-focused policy, model, operations, and ADRs
```

## Trust model

- Operational relevance determines inclusion; source model and licenses are reviewed traits and filters.
- Authoritative license and terms sources are human-reviewed; GitHub metadata is only a drift signal.
- A detected license mismatch marks evidence for review without hiding the project or rewriting human conclusions.
- Automated discoveries remain provisional and receive no editorial score or review date.
- Editorial verification dates are separate from live GitHub metadata dates.
- Memory and agent scores are never ranked across families.
- Specifications are classified by type, integration scope, and status; they are never operationally scored.

The weekly workflow refreshes live metadata, preserves candidate and license-review queues, validates the complete catalog, runs tests, and commits only verified data changes.

## License

Apache-2.0. Project names and descriptions remain the property of their respective projects and are used for factual identification and commentary.
