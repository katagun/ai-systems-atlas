# Research synthesis

## Selection method

The catalog is coverage-weighted rather than a naïve star leaderboard. Popularity is tracked separately, but a selected project must contribute a distinct architectural or operational lesson. Memory and agent projects are evaluated within separate families.

### Memory-system research set

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

### Agent-system research set

| Project | Primary lesson | Strongest contribution | Principal weakness |
|---|---|---|---|
| Codex | Controlled coding agency | Repository-scale execution with approvals, sandboxing, IDE/CLI/SDK, and MCP | Strongest model experience is hosted; output still needs review |
| Cline | Human control | Visible plans, diffs, approval-gated tools, browser use, and MCP | IDE-centered; safety rests heavily on operator attention |
| Aider | Auditable pair programming | Git-native edits and broad provider support with a mature operational history | Narrower tool surface and less autonomy than newer harnesses |
| OpenCode | Provider-neutral coding agent | Model portability, multiple interfaces, and an open extension surface | Rapid interface evolution and configuration-dependent safety |
| Goose | Local extensible agent | MCP-native local tools for code and general tasks | Reliability and observability vary with extensions and models |
| Browser Use | Browser agency | Rich browser-control primitives and local/cloud execution choices | Websites are nondeterministic and remote browsers complicate privacy |
| GPT Researcher | Research agency | Multi-step web research with cited report artifacts | Source judgment and steering still require a human |
| LangGraph | Durable agent runtime | Checkpoints, resumability, explicit graphs, and human-in-the-loop control | Substantial framework and workflow-design complexity |
| Pydantic AI | Typed agent engineering | Contracts, validation, evaluation, observability, and provider portability | Python-focused; execution policy remains application-owned |
| CrewAI | Multi-agent coordination | Accessible role-based crews plus explicit flows | Extra agents can amplify nondeterminism and debugging cost |
| Microsoft Agent Framework | Workflow convergence | Multi-agent workflows, state, observability, and .NET/Python support | Newer consolidated framework with cloud-oriented integrations |
| smolagents | Minimal agent abstraction | Understandable code-agent design and flexible local/sandbox execution | Persistence, recovery, and policy are mostly left to applications |

OpenHands is architecturally relevant but excluded from the main directory because the repository contains MIT core code alongside source-available enterprise code.

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

Known exclusions include OpenHands (mixed MIT/source-available repository), screenpipe (source-available commercial license), AFFiNE (mixed repository with production-restricted backend portions), proprietary Obsidian, Microsoft Recall, and Rewind/Limitless.
