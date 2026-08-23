# Cognosaic

**Cognosaic** is two things in one Codex-native repository:

1. a curated, license-gated web directory of open-source second-brain, agent-memory, PKM, RAG, ambient-capture, coding-agent, and retrieval-infrastructure projects; and
2. a working local-first second-brain engine built around human-readable canonical records, explicit provenance, temporal supersession, and bounded cited retrieval.

The core design rule is simple:

> Product role and memory architecture are different dimensions.

A coding-agent workflow can use memory. A human PKM app can use vectors. A vector database can support both—but is not a second brain by itself.

## Current directory taxonomy

Every project gets exactly one **primary role** and multiple orthogonal traits.

| Primary role | What it means | Representative projects |
|---|---|---|
| Human-first PKM / workspace | Humans deliberately write, organize, link, and revisit knowledge | Logseq, Trilium, AppFlowy, Joplin, SiYuan, Memos |
| AI knowledge app / RAG brain | User-facing assistant over documents, sources, and automations | Khoj, AnythingLLM, Open Notebook, Quivr |
| External agent-memory service | Durable memory lives outside the agent runtime behind an SDK/API/tool | Mem0, LangMem |
| Temporal context / graph engine | Entities, relationships, provenance, and changing truth | Graphiti, Cognee |
| Stateful agent runtime | Memory, identity, skills, and schedules are embedded in the agent | Letta Code |
| Coding-agent workflow | Repeatable software-delivery process around a coding agent | GStack |
| Human–agent memory bridge | Human-owned files are exposed to multiple agents | Basic Memory |
| Ambient capture / lifelogging | Passive collection of screen, audio, app, or activity evidence | OpenRecall, ActivityWatch |
| Retrieval infrastructure | Vector/graph/search building blocks; not a complete brain | Qdrant, Chroma, Milvus, Weaviate |

See [`docs/TAXONOMY.md`](docs/TAXONOMY.md) for the full model.

## Why a new second brain?

The strongest existing systems each solve only part of the problem:

- human PKM tools preserve ownership but rarely govern AI-generated memory;
- RAG products answer questions but often reduce knowledge to opaque chunks;
- agent-memory services personalize agents but create a hidden second source of truth;
- context graphs handle changing facts but add operational complexity;
- ambient capture removes note-taking friction but creates privacy, noise, and retention hazards;
- agent runtimes can learn over time but may rewrite their own memory without enough human control.

Cognosaic combines the strongest ideas while retaining five invariants:

1. **Canonical knowledge remains inspectable.** Markdown records are the source of truth.
2. **Derived indexes are disposable.** SQLite/FTS can be rebuilt from the files.
3. **Facts are not silently overwritten.** Changes create explicit supersession history.
4. **Answers carry citations.** Context packs identify record IDs and line ranges.
5. **Agents are consumers, not owners, of personal truth.** Agent adapters never become the only copy.

## Quick start

```bash
cd cognosaic
python -m venv .venv
source .venv/bin/activate
pip install -e .

cognosaic --home ./demo-brain init
cognosaic --home ./demo-brain remember \
  --type decision \
  --title "Use canonical Markdown records" \
  --tags architecture,local-first \
  --content "Markdown is the source of truth; SQLite and future vectors are rebuildable projections."

cognosaic --home ./demo-brain search "source of truth"
cognosaic --home ./demo-brain context "How should Cognosaic store knowledge?"
cognosaic --home ./demo-brain serve
```

Open `http://127.0.0.1:8765`.

## CLI

```text
cognosaic init                         initialize vault and index
cognosaic remember                     capture a canonical record
cognosaic import                       ingest Markdown or text files
cognosaic search                       hybrid lexical/temporal/graph-aware recall
cognosaic context                      build a bounded cited context pack
cognosaic supersede                    replace a claim without deleting history
cognosaic archive                      reversibly remove a record
cognosaic delete --yes                 hard-delete and retain a tombstone
cognosaic reindex                      rebuild SQLite/FTS from canonical files
cognosaic brief                        deterministic recent-memory briefing
cognosaic backup                       ZIP the canonical vault
cognosaic serve                        local directory + memory web interface
```

## Repository map

```text
AGENTS.md                         Codex and subagent operating rules
cognosaic/                        second-brain engine and loopback API
directory/projects.json           curated, rated project catalog
directory/taxonomy.json           multi-axis classification model
directory/exclusions.json         useful but non-open-source systems
docs/                             research, product spec, ADRs, architecture
scripts/update_directory.py       weekly GitHub metadata and discovery scan
web/                              static directory + local memory UI
tests/                            executable evidence
.github/workflows/                weekly refresh and verification
```

## Directory automation

The weekly workflow:

1. refreshes stars, forks, activity, archive status, and license metadata;
2. quarantines projects that become unavailable or fail the open-source license gate;
3. searches GitHub using several role-specific discovery queries;
4. classifies high-confidence discoveries as visible **candidates**, never pretending an automated first pass is a deep review;
5. validates the taxonomy, runs the test suite, and commits verified data changes.

The updater intentionally separates **live adoption signals** from **editorial scores**. Stars do not determine the rating.

## Verification

```bash
python scripts/validate_directory.py
python -m unittest discover -s tests -v
```

## License

Apache-2.0. Project names and descriptions in the directory remain the property of their respective projects and are used for factual identification and commentary.
