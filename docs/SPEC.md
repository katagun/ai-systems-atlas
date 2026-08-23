# Cognosaic product specification

## Problem

Personal knowledge is fragmented across notes, files, projects, conversations, decisions, tasks, and activity traces. Existing systems force a tradeoff among human ownership, AI usefulness, temporal correctness, low capture friction, and operational simplicity.

## Product thesis

A useful second brain is not a chat interface over a vector store. It is a governed memory system with:

- inspectable canonical knowledge;
- fast, multi-signal recall;
- explicit time and contradiction handling;
- provenance and citations;
- reversible lifecycle operations;
- agent interoperability;
- optional, privacy-bounded capture;
- predictable context assembly.

## Initial user

A technically sophisticated individual who uses coding agents, works across multiple projects, values local-first/open-source tools, and wants to preserve decisions, research, relationships, operational context, and long-running project memory.

## Functional requirements

### Capture

- Create notes, observations, decisions, projects, people, tasks, sources, claims, and events.
- Accept direct text, stdin, Markdown, and text-file imports.
- Preserve source URIs and import checksums.
- Keep capture fast enough for a one-command workflow.

### Canonical storage

- Store each record as readable Markdown with strict JSON metadata frontmatter.
- Use stable IDs independent of titles and paths.
- Keep an append-only audit log for mutations.
- Permit manual edits followed by reindexing.

### Temporal truth

- Records have `valid_from` and optional `valid_to`.
- Superseding a record closes its validity window and creates a new record.
- Historical records remain searchable with `--include-inactive` and `--as-of`.
- Hard deletion requires explicit confirmation and leaves a tombstone.

### Recall

- Provide keyword/FTS retrieval.
- Add deterministic coverage, title, recency, confidence, graph-degree, and tag signals.
- Keep vector retrieval optional and rebuildable in a later slice.
- Return excerpts, record IDs, line ranges, scores, and score components.

### Context assembly

- Build bounded context packs under a token budget.
- Include only records that fit the budget.
- Cite every included excerpt.
- Tell the consuming agent to distinguish evidence from inference.

### Briefing

- Produce a deterministic recent brief grouped by record type.
- Future LLM synthesis must consume the deterministic evidence layer, not replace it.

### Web interface

- Combine the open-source systems directory and personal brain UI.
- Bind only to loopback.
- Block hostile Host headers and cross-origin access.
- Require a per-vault token for mutation endpoints.

### Directory

- Classify each project by one primary role and orthogonal traits.
- Keep editorial score distinct from GitHub stars.
- Refresh metadata weekly.
- Auto-discovered projects remain visibly provisional until deep review.
- Quarantine repositories with incompatible or unclear licenses.

## Non-functional requirements

- Zero required cloud services.
- Python standard library only for the initial engine.
- Rebuildable derived state.
- Atomic file writes.
- No background capture by default.
- Useful on macOS and Linux; avoid platform-specific assumptions in the core.
- A 10,000-record vault should remain practical with SQLite FTS.

## Invariants

1. Every record ID is unique.
2. Canonical files are sufficient to reconstruct the index.
3. An active record cannot be superseded twice without an explicit branch/conflict workflow.
4. Superseded records retain their content and source metadata.
5. Search never presents inactive facts as current unless requested.
6. Context-pack claims are traceable to record citations.
7. Hard deletion is never the default path.
8. The main directory never intentionally contains source-available or proprietary codebases.
9. A vector index may accelerate recall but never becomes the sole copy of knowledge.
10. An agent may propose memory changes; durable personal truth remains auditable and user-controlled.

## Non-goals for v0.1

- continuous screen or audio recording;
- multi-user collaboration;
- automatic email/calendar ingestion;
- production-grade sync;
- built-in LLM inference;
- a universal ontology;
- replacing mature note editors;
- autonomous deletion or forgetting.

## Acceptance evidence

- Creating a record produces a Markdown file and audit event.
- Reindexing from files restores search.
- Supersession makes the old record inactive while preserving historical search.
- Context packs respect the token budget and contain citations.
- Directory validation rejects unknown roles, architectures, duplicate IDs, and non-open-source entries.
- Loopback API rejects invalid Host headers and unauthorized mutations.
