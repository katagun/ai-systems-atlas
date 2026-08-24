# Memory Systems Atlas

Memory Systems Atlas is a curated, license-gated directory of open-source personal knowledge management, second-brain, agent-memory, RAG, ambient-capture, coding-agent, and retrieval-infrastructure projects.

It separates **what a system is for** from **how it stores and retrieves memory**. Every project has one primary role plus orthogonal traits for agent relationship, architecture, retrieval, capture, lifecycle, deployment, openness, and data ownership.

This repository is the editorial directory and static web application. The local-first second-brain implementation informed by this research lives in [Cognosaic](https://github.com/embark-delve/cognosaic).

## Explore locally

Python work in this repository uses [`uv`](https://docs.astral.sh/uv/).

```bash
uv sync --locked
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m http.server 8765 --directory web
```

Open `http://127.0.0.1:8765`.

## Repository map

```text
directory/projects.json       curated project records and editorial scores
directory/taxonomy.json       roles, traits, and score dimensions
directory/exclusions.json     relevant projects outside the open-source gate
docs/TAXONOMY.md              taxonomy rationale and definitions
docs/RESEARCH.md              architectural research synthesis
docs/CURATION.md              inclusion, evidence, and scoring policy
scripts/update_directory.py   metadata refresh and candidate discovery
scripts/validate_directory.py schema and policy validation
tests/test_directory.py       executable directory invariants
web/                          dependency-free static directory UI
```

## Directory policy

- Main entries must be GitHub-hosted and use an OSI-compatible license.
- License claims must be verified from the repository's license files, not its README.
- Every project has exactly one primary role; vector, graph, Markdown, and SQLite are architectures rather than roles.
- Live GitHub metadata never changes a human editorial score.
- Automated discoveries remain provisional until reviewed.
- Relevant source-available, mixed-license, and proprietary systems belong in `directory/exclusions.json`.

See [docs/CURATION.md](docs/CURATION.md) before adding or rescoring a project.

## Automation

The weekly workflow refreshes GitHub metadata, quarantines unavailable or license-incompatible entries, proposes new candidates, validates the catalog, and runs the test suite. Automated discovery never represents itself as a completed editorial review.

## License

Apache-2.0. Project names and descriptions remain the property of their respective projects and are used for factual identification and commentary.
