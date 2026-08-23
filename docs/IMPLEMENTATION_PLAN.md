# Implementation plan

## Completed v0.1 vertical slice

- multi-axis open-source systems taxonomy;
- curated project data with scores, strengths, weaknesses, and live-star timestamps;
- source-available/proprietary exclusions;
- static searchable/filterable directory;
- weekly GitHub metadata refresh, discovery, license gate, candidate and quarantine outputs;
- canonical Markdown records;
- atomic writes and append-only audit events;
- SQLite/FTS projection and deterministic multi-signal ranking;
- temporal validity and explicit supersession;
- cited context packs with a token budget;
- archive, tombstone deletion, import, backup, and briefing commands;
- loopback-only web API and local UI;
- tests and validation scripts.

## Next slices

### Slice 2 — local semantic projection

- pluggable embedding provider interface;
- optional local embedding model;
- vector projection keyed by record checksum and embedding-model version;
- reciprocal-rank fusion with FTS;
- retrieval evaluation fixtures.

### Slice 3 — entities and temporal graph

- entity/relationship schema;
- episode provenance;
- deterministic extraction proposal format;
- approval/rejection workflow;
- graph and as-of queries;
- contradiction report.

### Slice 4 — integrations without mandatory MCP

- stable JSON CLI contracts;
- Skills packages for Codex/Claude Code/OpenCode;
- optional MCP adapter as one compatibility path;
- file watcher for Obsidian/Foam-style vaults;
- GitHub project/repository memory adapter.

### Slice 5 — private capture

- browser clipper;
- explicit file folders;
- calendar and email import with allowlists;
- ActivityWatch adapter;
- optional OpenRecall adapter;
- retention and redaction policies before any raw evidence reaches an agent.

### Slice 6 — consolidation and reflection

- daily/weekly evidence bundles;
- model-assisted proposed summaries and decisions;
- human approval by default;
- provenance-preserving synthesis records;
- decay only for derived salience, never silent source deletion.

## Open design questions

- whether canonical record bodies should remain single files or support block IDs;
- whether sync should use Git, Syncthing, or an encrypted purpose-built log;
- how to model private scopes when multiple agents and devices are introduced;
- which local embedding model provides the best quality/latency on a 16 GB Apple Silicon machine;
- whether the graph projection should use SQLite tables, Kuzu alternatives, or a standalone graph database.
