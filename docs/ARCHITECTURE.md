# Architecture

## Data flow

```text
Human / Agent / Import
          |
          v
  Canonical Markdown record  -----> append-only events.jsonl
          |
          v
  Rebuildable SQLite projection
   | records table
   | FTS5 index
   | link edges
          |
          +----> ranked search results + score explanation
          |
          +----> cited, token-bounded context packs
          |
          +----> deterministic recent brief
```

## Canonical record

A record contains strict JSON metadata between Markdown frontmatter delimiters, followed by a normal heading and body. JSON was chosen instead of permissive YAML so the standard library can parse it deterministically and manually edited records fail loudly rather than being misinterpreted.

```markdown
---
{
  "id": "20260823-use-canonical-markdown-a1b2c3",
  "record_type": "decision",
  "status": "active",
  "valid_from": "2026-08-23T18:00:00+00:00",
  "valid_to": null,
  "sources": ["https://example.invalid/design"],
  "tags": ["architecture"]
}
---
# Use canonical Markdown

SQLite and vector indexes are disposable projections.
```

## Derived projection

SQLite stores normalized metadata and an FTS5 table. Rebuild scans canonical files and recreates records and edges. The first retrieval implementation combines:

- FTS/BM25 rank;
- query-token coverage;
- exact title match;
- exponential recency decay;
- record confidence;
- link degree;
- requested-tag overlap.

This is intentionally model-free and deterministic. A later vector projection can be added as another disposable signal.

## Temporal model

Cognosaic distinguishes transaction history from fact validity:

- `created_at` / `updated_at` describe the record artifact;
- `valid_from` / `valid_to` describe when the claim should be treated as true;
- `supersedes` links the replacement to prior records;
- inactive facts are excluded from current search by default.

## Security boundary

The web server:

- binds only to `127.0.0.1`, `localhost`, or `::1`;
- validates the Host header to mitigate DNS rebinding;
- sends no permissive CORS headers;
- requires an unpredictable per-vault token for POST operations;
- applies a restrictive content security policy;
- limits JSON mutation bodies to 1 MB.

This is a local development/personal tool boundary, not an internet-facing multi-user security model.

## Future optional projections

- local embeddings and vector similarity;
- entity extraction and temporal context graph;
- browser/file/email/calendar connector adapters;
- encrypted sync;
- ambient evidence adapters with deterministic allow/deny rules;
- consolidation proposals that require audit or approval.
