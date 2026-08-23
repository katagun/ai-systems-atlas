# Systems taxonomy

## Why a flat category fails

“Second brain” currently refers to at least five distinct objects:

- a human note-taking and knowledge-management application;
- a RAG assistant over documents;
- a memory service used by an agent;
- a stateful agent whose memory is embedded in its runtime;
- an ambient recorder of digital activity.

A flat list makes misleading comparisons. GStack and Mem0 can both be described as “agent tools,” but one is a software-delivery process and the other is a durable memory service. Logseq and Khoj can both answer questions over personal knowledge, but their canonical data, capture workflow, and memory lifecycle differ radically.

## The model

### Axis 1: primary system role

A project receives exactly one primary role based on the job it is designed to perform.

1. **Human-first PKM / workspace** — deliberate human knowledge work is primary.
2. **AI knowledge app / RAG brain** — a user-facing AI assistant over sources is primary.
3. **External agent-memory service** — durable memory is provided to replaceable agents through a service or library.
4. **Temporal context / graph engine** — evolving entities, relationships, provenance, and historical truth are primary.
5. **Stateful agent runtime / harness** — memory and identity are embedded in a persistent agent.
6. **Coding-agent workflow / skill stack** — software-delivery process around coding agents is primary.
7. **Human–agent memory bridge** — the project exposes human-owned knowledge to multiple agents.
8. **Ambient capture / lifelogging** — passive evidence capture is primary.
9. **Retrieval / storage infrastructure** — low-level storage and retrieval components.
10. **Research / benchmark / reference** — informs implementation but is not a complete operational system.

### Axis 2: relationship to an agent

- **No agent dependency:** useful without AI.
- **Agent-enabled UI:** a human application offers optional AI.
- **External memory:** agents call an independent memory component.
- **Embedded memory:** memory lives inside the agent process or state model.
- **Agent runtime:** the project runs persistent agents.
- **Coding workflow:** the project coordinates coding-agent work.

### Axis 3: storage architecture

- plain files / Markdown;
- relational database;
- vector index;
- graph database;
- full-text index;
- append-only event log;
- raw media;
- Git-versioned state;
- hybrid composition.

**Vector-based is deliberately not a primary category.** It is one retrieval architecture. A vector index can sit under a PKM app, RAG product, agent-memory service, context graph, or ambient recorder.

### Axis 4: retrieval behavior

- keyword / BM25 / FTS;
- semantic vector retrieval;
- lexical–semantic hybrid retrieval;
- graph traversal;
- temporal or “as-of” retrieval;
- structured SQL/Datalog queries;
- iterative agentic retrieval;
- deterministic recency or rule scoring.

### Axis 5: capture mode

- deliberate writing;
- file import or sync;
- conversation extraction;
- API/SaaS connectors;
- scheduled collection;
- screen snapshots;
- audio/transcription;
- application and activity telemetry;
- coding-session checkpoints.

### Axis 6: memory lifecycle

- human curated;
- append-only;
- upsert or rewrite;
- explicit supersession;
- revision history;
- consolidation, summarization, or dreaming;
- decay or forgetting;
- agent self-editing.

## Definitions requested during research

### External agent memory

A memory component that is **not the agent runtime itself**. An agent sends observations or conversations to it and later queries it for relevant context. The memory can persist while models, prompts, or agent harnesses change.

Strengths:

- agent and model portability;
- reusable memory across channels and tools;
- centralized retrieval and policy;
- easier evaluation as a bounded component.

Weaknesses:

- creates another source of truth;
- memories may be extracted incorrectly by an LLM;
- users may not be able to inspect or edit the stored representation;
- the agent may over-trust retrieved memory;
- deletion, scope, and temporal validity become distributed-system problems.

### Ambient capture

Passive collection of evidence about what a person did or encountered. Examples include active application events, window titles, screenshots, browser history, audio, or meeting transcripts.

Strengths:

- nearly zero deliberate capture effort;
- reconstructs forgotten work and context;
- provides time-stamped source evidence;
- can generate standups, time breakdowns, and meeting recall.

Weaknesses:

- captures secrets, bystanders, and irrelevant noise;
- has large storage and retention costs;
- requires deterministic filtering, encryption, and deletion—not only prompt instructions;
- raw capture is not knowledge until it is interpreted;
- continuous surveillance can harm trust even when local.

## Multi-label examples

| Project | Primary role | Agent relation | Architectures | Capture |
|---|---|---|---|---|
| GStack | Coding-agent workflow | Coding workflow | Markdown, Git | Coding sessions |
| Letta Code | Stateful agent runtime | Agent runtime | Git state, event history, hybrid | Conversation, schedules, coding sessions |
| Mem0 | External agent-memory service | External memory | Vector + metadata stores | Conversation/API |
| Graphiti | Temporal context graph | External memory | Graph + vector + full text | Episodes/conversations/data |
| Basic Memory | Human–agent bridge | External memory | Markdown + graph + semantic/full text | Humans and agents write shared files |
| Khoj | AI knowledge app | Agent-enabled UI | Vector + relational + hybrid | Files, connectors, conversations, schedules |
| Logseq | Human-first PKM | Agent-enabled UI | Files/database + graph + queries | Deliberate writing/import |
| OpenRecall | Ambient capture | No agent dependency | Screenshots + database + search | Passive screen capture |
| Qdrant | Retrieval infrastructure | External memory building block | Vector index | API ingestion |
