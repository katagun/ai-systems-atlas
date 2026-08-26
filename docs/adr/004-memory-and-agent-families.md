# ADR 004: Separate memory and agent system families

**Status:** Accepted; family count extended by [ADR 009](009-assistant-systems-are-a-distinct-family.md)

## Context

The directory originally used one second-brain-oriented rubric even though it contained two projects—GStack and Letta Code—whose primary outcome is agent action rather than durable knowledge. Expanding agent research would make a single taxonomy and leaderboard increasingly misleading.

## Decision

The atlas initially used two top-level families: `memory_system` and `agent_system`. Each role belongs to exactly one family, and each family has its own weighted score profile. GStack and Letta Code move to the agent family and are rescored against the agent profile. ADR 009 later adds `assistant_system` under the same separation rule.

Shared traits such as architecture, deployment, interoperability, and relationship to memory remain available across the catalog. Agent records additionally describe interface, execution boundary, and capabilities.

The UI may show all families for discovery, but it must hide editorial scores and disable score ordering in that view. A numeric score is comparable only among projects using the same profile.

## Consequences

- Research can expand from memory into agents without pretending they solve the same job.
- Users can explore the relationship between memory and agency in one directory.
- Family moves require explicit rescoring.
- Future system families require their own roles, profile, validation, and UI treatment.
