# Agent Systems Atlas

Agent Systems Atlas is a curated, license-gated directory of open-source memory systems and AI agent systems. It covers personal knowledge management, second brains, agent memory, RAG, ambient capture, coding and research agents, browser agents, multi-agent orchestration, frameworks, and retrieval infrastructure.

It first separates **memory systems** from **agent systems**, then separates **what a system is for** from **how it works**. Every project has one family and one primary role plus orthogonal traits. Each family has its own editorial score; scores are not ranked across families.

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

The **Find a system** tab provides a three-step guided shortlist. It asks for the desired family, primary job, and most important tradeoff, then explains up to three matches using catalog roles, traits, and the appropriate family-specific score. It is a discovery aid, not a personalized guarantee or a cross-family leaderboard.

## Repository map

```text
directory/projects.json       curated project records and editorial scores
directory/taxonomy.json       roles, traits, and score dimensions
directory/license-evidence.json reviewed license URLs and pinned blob SHAs
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
- Every project belongs to exactly one family and uses that family's score profile.
- Memory-system and agent-system scores are never presented as one leaderboard.
- Live GitHub metadata never changes a human editorial score.
- Automated discoveries remain provisional until reviewed.
- Relevant source-available, mixed-license, and proprietary systems belong in `directory/exclusions.json`.

See [docs/CURATION.md](docs/CURATION.md) before adding or rescoring a project.

## Automation

The weekly workflow refreshes GitHub metadata, quarantines unavailable entries, proposes new candidates, validates the catalog, and runs the test suite. Discovery never auto-promotes a project into the curated directory and never represents metadata license detection as completed license review.

## License

Apache-2.0. Project names and descriptions remain the property of their respective projects and are used for factual identification and commentary.
