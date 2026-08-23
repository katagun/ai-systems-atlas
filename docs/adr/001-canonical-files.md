# ADR 001: Canonical Markdown, disposable indexes

**Status:** Accepted

## Decision

Human-readable Markdown records are the canonical store. SQLite FTS, future vectors, summaries, and graph structures are projections that can be rebuilt.

## Consequences

- Users can inspect, version, export, and recover knowledge without Cognosaic.
- Search and indexing can evolve without migrations of personal truth.
- Atomic writes and stable IDs are mandatory.
- Rich collaborative editing and high-frequency event streams require separate projections rather than mutating opaque canonical blobs.
