# Atlas taxonomy

## Why separate families

Memory systems preserve and retrieve knowledge. Agent systems plan and take actions through tools. Assistant systems provide broad interactive help in an end-user conversational workspace. They overlap, but their primary outcomes and failure modes differ. One flat category would reward a vector database, coding agent, note-taking app, and hosted assistant against the same rubric.

Every catalog entry therefore receives:

1. exactly one `system_family`;
2. exactly one family-compatible `primary_role`;
3. orthogonal architecture and operating traits; and
4. the score profile assigned to its family.

`directory/taxonomy.json` is the executable source for families, roles, traits, source models, licenses, statuses, deployment modes, confidence and provenance levels, and score weights. This document explains the model; validation enforces the JSON definitions.

Specifications are a separate collection, not another system family. They are classified by artifact type, integration scope, and publication status, and never receive an operational-system score. See [`SPECIFICATIONS.md`](SPECIFICATIONS.md) and [ADR 008](adr/008-specifications-are-unscored-artifacts.md).

## Family 1: memory systems

Memory-system roles are human-first PKM, AI knowledge app / RAG brain, external agent-memory service, temporal context / graph engine, human–agent memory bridge, ambient capture, retrieval infrastructure, and research reference.

The memory score measures second-brain fit, data sovereignty, interoperability, memory intelligence, operational simplicity, and maturity.

## Family 2: agent systems

Agent-system roles are coding agent, research agent, browser / computer-use agent, data-analysis / text-to-SQL agent, stateful agent runtime, coding-agent workflow, multi-agent orchestrator, and agent framework / SDK.

Agent projects also record:

- interfaces: terminal, IDE, web app, API / SDK, or library;
- execution boundaries: host, container, external sandbox, remote cloud, or application-defined;
- capabilities: code and shell execution, browser control, research, multi-agent coordination, persistent state, MCP, and explicit workflows.

The agent score measures task reliability, tool use, autonomy, human control, observability and recovery, data sovereignty, interoperability, and maturity.

## Family 3: assistant systems

Assistant-system roles are general AI assistant, enterprise work assistant, and multi-model chat client. The family covers end-user products whose primary outcome is broad conversational assistance, even when they also offer memory, research, connected tools, or agentic modes.

The assistant score measures task reliability, context continuity, tools and integrations, human control, data governance, interoperability, usability and access, and maturity. It evaluates the product-level experience and controls, not a transient leaderboard of its underlying models.

Keep product boundaries explicit. ChatGPT is distinct from Codex and OpenAI Agents SDK; T3 Chat is distinct from T3 Code; Grok is distinct from Grok Bot; and GroqChat is distinct from Groq's inference service. A thin prompt wrapper, API playground, provider, or model repository is not an assistant system.

### Vertical agents and framework boundaries

A vertical system can be an agent when it owns a consequential tool loop rather than only generating text. For data analysis, this means planning or refining a query, executing it through database or analytics tools, validating or repairing the result, and explaining the output. A text-to-SQL model, prompt collection, benchmark, or training dataset alone is not a data-analysis agent.

Include a framework when building or running tool-using agents is a primary product outcome. General LLM application libraries, prompt optimizers, tracing clients, and observability services do not become agent systems merely because agents can use them. Borderline frameworks stay provisional until review establishes that agent execution is material rather than incidental.

## No cross-family ranking

An 8.4 agent score, assistant score, and memory score answer different questions. The web directory shows editorial scores only when one family is selected. “All families” supports discovery by name or GitHub stars, not a synthetic best-overall list.

Specifications are also never inserted into this ranking. A protocol can be mature and widely adopted without being a deployable agent, and an instruction convention cannot be meaningfully scored against a memory service.

## Guided finder

The web finder is a transparent decision flow over this taxonomy:

1. choose the memory, agent, or assistant family;
2. choose a desired job, which maps to one or more primary roles;
3. choose a priority such as local control, interoperability, operational simplicity, developer composability, or human control and recovery.

Only active projects in the chosen family and role set are eligible. The priority adds weight to documented traits or score dimensions, while the family-specific editorial score breaks close ties. Results explain the matched role and traits and surface one recorded weakness. Opening the directory preserves the complete eligible role set; preferences remain soft ranking signals rather than hard filters. The finder never compares numeric scores across families and should be treated as a starting shortlist rather than an empirical evaluation of a user's workload.

## Shared axes

Architecture, retrieval, deployment, source model, licenses, and relationship to agents remain orthogonal traits. Vector, graph, Markdown, relational storage, and full-text search are implementation choices, not product roles.

### Source model and licenses

`source_model` answers how much of the operational system users may inspect and use: open source, mixed open licenses, mixed open and proprietary, open core, source available, proprietary, or unclear. “Open core” requires the reusable open code to be the operational core; “mixed source” covers an open wrapper or component around a closed core or runtime. `licenses` records every material code, content, or product-terms identifier reviewed for the listed system. Neither field is a family, role, score profile, or inclusion gate.

An open-source-only view is a user-selected filter. Mixed licenses retain their component or path scope in evidence. Proprietary terms can support a listing when operational behavior is otherwise reviewable, but lower inspectability should affect research confidence and relevant score dimensions. See [ADR 007](adr/007-licenses-are-classification-not-inclusion.md).

### Model-provider relationship

Provider coupling is also orthogonal. `provider_native` identifies a primary path coupled to one provider, `multi_provider` identifies several maintained first-class integrations, and `provider_agnostic` requires a substitutable backend contract. Reviewed backend identifiers live in the taxonomy. These optional fields roll out through deliberate project review; their absence means “not reviewed.” See [ADR 006](adr/006-provider-relationships-are-orthogonal.md).

Providers and plain model API clients are not operational system families. An official SDK can qualify as an agent framework or runtime only when it materially owns a tool-using agent loop.

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
| ChatGPT | Assistant | General AI assistant | Projects, memory, research, connected applications |
| Amazon Quick | Assistant | Enterprise work assistant | Organizational context, agents, analytics, governed actions |
| T3 Chat | Assistant | Multi-model chat client | Persistent workspace with first-class provider choice |
