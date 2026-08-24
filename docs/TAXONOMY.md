# Systems taxonomy

## Why two families

Memory systems preserve and retrieve knowledge. Agent systems plan and take actions through tools. They overlap—agents use memory and memory products increasingly contain agents—but their primary outcomes and failure modes differ. One flat category would reward a vector database, coding agent, and note-taking app against the same rubric.

Every catalog entry therefore receives:

1. exactly one `system_family`;
2. exactly one family-compatible `primary_role`;
3. orthogonal architecture and operating traits; and
4. the score profile assigned to its family.

## Family 1: memory systems

Memory-system roles are human-first PKM, AI knowledge app / RAG brain, external agent-memory service, temporal context / graph engine, human–agent memory bridge, ambient capture, retrieval infrastructure, and research reference.

The memory score measures second-brain fit, data sovereignty, interoperability, memory intelligence, operational simplicity, and maturity.

## Family 2: agent systems

Agent-system roles are coding agent, research agent, browser / computer-use agent, stateful agent runtime, coding-agent workflow, multi-agent orchestrator, and agent framework / SDK.

Agent projects also record:

- interfaces: terminal, IDE, web app, API / SDK, or library;
- execution boundaries: host, container, external sandbox, remote cloud, or application-defined;
- capabilities: code and shell execution, browser control, research, multi-agent coordination, persistent state, MCP, and explicit workflows.

The agent score measures task reliability, tool use, autonomy, human control, observability and recovery, data sovereignty, interoperability, and maturity.

## No cross-family ranking

An 8.4 agent score and an 8.4 memory score answer different questions. The web directory shows editorial scores only when one family is selected. “All families” supports discovery by name or GitHub stars, not a synthetic best-overall list.

## Guided finder

The web finder is a transparent decision flow over this taxonomy:

1. choose the memory or agent family;
2. choose a desired job, which maps to one or more primary roles;
3. choose a priority such as local control, interoperability, operational simplicity, developer composability, or human control and recovery.

Only active projects in the chosen family and role set are eligible. The priority adds weight to documented traits or score dimensions, while the family-specific editorial score breaks close ties. Results explain the matched role and traits and surface one recorded weakness. The finder never compares numeric scores across families and should be treated as a starting shortlist rather than an empirical evaluation of a user's workload.

## Shared axes

Architecture, retrieval, deployment, openness, and relationship to agents remain orthogonal traits. Vector, graph, Markdown, relational storage, and full-text search are implementation choices, not product roles.

### External agent memory

A component outside the agent runtime that persists memory while agents, models, or prompts can change. It improves reuse and portability but creates another source of truth and hard questions about deletion, provenance, scope, and temporal validity.

### Ambient capture

Passive evidence collection such as app activity, screenshots, browser history, audio, or meeting transcripts. It reduces capture friction but requires deterministic privacy, retention, consent, and deletion controls.

## Examples

| Project | Family | Primary role | Distinguishing traits |
|---|---|---|---|
| Logseq | Memory | Human-first PKM | Files, graph, queries, deliberate capture |
| Mem0 | Memory | Agent-memory service | External memory, vector/metadata storage |
| OpenRecall | Memory | Ambient capture | Passive screenshots, local database |
| Codex | Agent | Coding agent | Terminal/IDE, shell and code tools, sandboxing |
| GPT Researcher | Agent | Research agent | Web research, cited reports, multi-step planning |
| Browser Use | Agent | Browser agent | Browser control, local or remote execution |
| LangGraph | Agent | Agent framework | Durable graph state, checkpoints, human control |
