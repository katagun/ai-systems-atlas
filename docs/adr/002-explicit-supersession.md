# ADR 002: Explicit supersession instead of silent overwrite

**Status:** Accepted

## Decision

Changing a durable claim closes the prior record’s validity window and creates a new record linked through `supersedes`.

## Consequences

- Current and historical answers can be distinguished.
- Contradictions are inspectable.
- Storage grows, but personal knowledge is small enough for this tradeoff.
- Conflict resolution can later branch rather than destroying evidence.
