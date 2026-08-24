# Research synthesis

## Selection method

The comparative top ten is coverage-weighted rather than a naïve star leaderboard. Popularity is tracked separately, but a selected project must contribute a distinct architectural lesson.

The main research set:

| Project | Primary lesson | Strongest contribution | Principal weakness |
|---|---|---|---|
| GStack | Coding-agent process | Role separation and artifact handoffs from discovery through release | It is not a durable knowledge store |
| Letta Code | Embedded stateful agents | Memory, identity, skills, schedules, dreaming, and Git-tracked agent state | Self-editing memory can drift; current codebase is newer than the historically popular repository |
| Mem0 | External agent memory | Simple production-oriented API, scoped memories, multi-signal retrieval | Opaque extracted facts can become a second source of truth |
| Graphiti | Temporal context graph | Provenance, validity windows, changing truth, and as-of queries | Operational graph/LLM complexity |
| Basic Memory | Human–agent bridge | Shared Markdown, MCP/skills interoperability, semantic and graph recall | Lightweight semantics and local sync burden |
| Khoj | Complete AI second-brain product | Broad source/model support, agents, automation, self-hosting | Database-centric canonical knowledge and weak explicit supersession |
| Logseq | Local graph PKM | User-owned linked knowledge, blocks, backlinks, and queries | Complexity and architectural transition risk |
| Trilium | Hierarchical PKM | Hierarchy, cloning, revisions, encryption, scripting, REST API, large-vault maturity | Less portable database-centric storage |
| AppFlowy | Structured workspace UX | Documents, databases, projects, native cross-platform experience, data control | Heavy system whose AI memory lifecycle remains secondary |
| OpenRecall | Open ambient capture | Local, cross-platform, searchable screenshot history | Privacy, storage, noise, and slower project activity |

## Architectural synthesis for local-first memory

A local-first memory implementation can adopt:

- **from Logseq and Basic Memory:** human-readable knowledge and links;
- **from Trilium:** revisions, structured metadata, automation, and scale discipline;
- **from AppFlowy and Memos:** polished structure plus extremely low capture friction;
- **from Khoj and AnythingLLM:** broad model/source interoperability and useful local AI workflows;
- **from Mem0:** explicit user/session/agent scopes and multi-signal retrieval;
- **from Graphiti:** episodes, provenance, temporal validity, and supersession;
- **from Letta Code:** bounded context, durable identity, skills, scheduled consolidation, and Git-visible changes;
- **from GStack:** role-specialized workflow and evidence-based completion;
- **from OpenRecall and ActivityWatch:** optional ambient evidence streams, never enabled by default.

This research argues against:

- vectors as the only canonical representation;
- untraceable memory extraction;
- silent UPDATE/DELETE of facts;
- mandatory cloud storage;
- unrestricted passive capture;
- agent self-modification without auditability;
- MCP as the only integration path;
- popularity as a substitute for architectural fit.

## Directory policy

The main catalog contains GitHub-hosted projects whose relevant code is under an OSI-compatible license. Source-visible but restricted projects are documented separately because their ideas remain useful, but they cannot satisfy the user’s open-source-only constraint.

Known exclusions include screenpipe (source-available commercial license), AFFiNE (mixed repository with production-restricted backend portions), proprietary Obsidian, Microsoft Recall, and Rewind/Limitless.
