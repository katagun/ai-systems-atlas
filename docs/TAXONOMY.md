# Atlas taxonomy

## Why separate families

Memory systems preserve and retrieve knowledge. Agent systems plan and take actions through tools. Assistant systems provide broad interactive help in an end-user conversational workspace. They overlap, but their primary outcomes and failure modes differ. One flat category would reward a vector database, coding agent, note-taking app, and hosted assistant against the same rubric.

Every operational system entry therefore receives:

1. exactly one `system_family`;
2. exactly one family-compatible `primary_role`;
3. orthogonal architecture and operating traits; and
4. the score profile assigned to its family.

`directory/taxonomy.json` is the executable source for families, roles, traits, source models, licenses, statuses, deployment modes, confidence and provenance levels, and score weights. This document explains the model; validation enforces the JSON definitions.

Specifications, inference services, local runtimes, and models are separate collections, not additional system families. Specifications remain unscored. Inference services, local runtimes, and provider-independent model releases each use their own taxonomy and dedicated score profile, none comparable with a system-family profile or with one another. Systems, model releases, services, and runtimes share the mixed Directory only as a presentation union; Models remains a sibling specialist view and Specifications remains a separate artifact view. See [`SPECIFICATIONS.md`](SPECIFICATIONS.md), [`INFERENCE_SERVICES.md`](INFERENCE_SERVICES.md), [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md), [`MODELS.md`](MODELS.md), [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md), and [ADR 025](adr/025-model-releases-are-independent-curated-records.md).

General agent-architecture pattern content — harness shapes, failure taxonomies, and similar concepts with no single authoritative steward — is not a further collection. Every collection here pins evidence to one steward's own reviewable artifact; a pattern synthesized across independent literature cannot meet that bar without inviting figures that only look sourced. See [ADR 022](adr/022-general-pattern-content-is-not-a-collection.md).

Autonomous scientific-discovery systems are not a further role either. They are classified by the operational outcome they own — sourced investigation is `research_agent` — while the discovery mechanism itself, writing and executing code against data or instruments, is carried by `agent_capabilities` and `execution_boundaries` like any other agent trait. See [ADR 023](adr/023-autonomous-science-systems-are-not-a-role.md).

## Family 1: memory systems

Memory-system roles are human-first PKM, AI knowledge app / RAG brain, external agent-memory service, temporal context / graph engine, human–agent memory bridge, ambient capture, and retrieval infrastructure.

The memory score measures second-brain fit, data sovereignty, interoperability, memory intelligence, operational simplicity, and maturity.

## Family 2: agent systems

Agent-system roles are general work agent, coding agent, research agent, browser / computer-use agent, data-analysis / text-to-SQL agent, stateful agent runtime, coding-agent workflow, multi-agent orchestrator, and agent framework / SDK.

General work agents accept broad end-user outcomes and carry out multi-step knowledge work across files, web sources, applications, or schedules. This is distinct from a general assistant's primarily conversational workspace, a computer-use agent's interaction specialization, and a developer runtime or framework. Named modes are separate records only when authoritative evidence establishes a distinct product workflow or execution boundary; see [ADR 011](adr/011-delegated-work-agents-are-agent-systems.md).

Agent projects also record:

- interfaces: terminal, IDE, web app, API / SDK, or library;
- execution boundaries: host, container, external sandbox, remote cloud, or application-defined;
- capabilities: code and shell execution, browser control, research, multi-agent coordination, persistent state, MCP, and explicit workflows.

The agent score measures task reliability, tool use, autonomy, human control, observability and recovery, data sovereignty, interoperability, and maturity.

## Family 3: assistant systems

Assistant-system roles are general AI assistant, enterprise work assistant, and multi-model chat client. The family covers end-user products whose primary outcome is broad conversational assistance, even when they also offer memory, research, connected tools, or agentic modes.

The assistant score measures task reliability, context continuity, tools and integrations, human control, data governance, interoperability, usability and access, and maturity. It evaluates the product-level experience and controls, not a transient leaderboard of its underlying models.

Keep product boundaries explicit. ChatGPT is distinct from Codex and OpenAI Agents SDK; Claude is distinct from Claude Code and Claude Agent SDK; Gemini Apps is distinct from Gemini in Workspace, Gemini CLI, and Google ADK; consumer Microsoft Copilot is distinct from Microsoft 365 Copilot and Copilot Studio; Perplexity is distinct from Perplexity Computer, Comet, and its developer API; Grok is distinct from Grok on X, Grok Bot, developer APIs, and model releases; DeepSeek Web/App is distinct from its model weights, API, and harness; and Z.ai Chat is distinct from its API and separately licensed GLM releases. T3 Chat is likewise distinct from T3 Code. A thin prompt wrapper, API playground, provider, or model repository is not an assistant system.

### Vertical agents and framework boundaries

A vertical system can be an agent when it owns a consequential tool loop rather than only generating text. For data analysis, this means planning or refining a query, executing it through database or analytics tools, validating or repairing the result, and explaining the output. A text-to-SQL model, prompt collection, benchmark, or training dataset alone is not a data-analysis agent.

Include a framework when building or running tool-using agents is a primary product outcome. General LLM application libraries, prompt optimizers, tracing clients, and observability services do not become agent systems merely because agents can use them. Borderline frameworks stay provisional until review establishes that agent execution is material rather than incidental.

## No cross-family ranking

An 8.4 agent score, assistant score, and memory score answer different questions. The web directory shows editorial scores only when one family is selected. “All families” supports discovery by name or GitHub stars, not a synthetic best-overall list.

Specifications are also never inserted into this ranking. A protocol can be mature and widely adopted without being a deployable agent, and an instruction convention cannot be meaningfully scored against a memory service.

The same rule applies to the collection-specific `inference_service`, `local_runtime`, and `model_access` profiles. A model-access score describes obtainability and deployment, not whether a model is more capable than another, and it cannot be compared with a runtime or service score.

## Guided finder

The Finder is a transparent decision flow over the operational collections:

1. choose a memory, agent, assistant, or inference-service direction;
2. choose a desired job, which maps to one or more system roles or one inference-service type;
3. choose a priority supported by that record's own traits and score profile.

Only active projects in the chosen system family and role set are eligible on a system path; inference paths use the independently curated service collection and exactly one service type. The priority adds weight only to documented traits or dimensions in the selected profile, whose overall score breaks close ties. Results explain the native classification and surface one recorded weakness or tradeoff. Opening the Directory preserves the eligible role set or service type. Preferences remain soft ranking signals rather than hard filters. The Finder never pools or compares scores across profiles and is a starting shortlist, not an empirical evaluation of a user's workload.

## Shared axes

Architecture, retrieval, deployment, source model, licenses, and relationship to agents remain orthogonal traits. Vector, graph, Markdown, relational storage, and full-text search are implementation choices, not product roles.

### Source model and licenses

`source_model` answers how much of the operational system users may inspect and use: open source, mixed open licenses, mixed open and proprietary, open core, source available, proprietary, or unclear. “Open core” requires the reusable open code to be the operational core; “mixed source” covers an open wrapper or component around a closed core or runtime. `licenses` records every material code, content, or product-terms identifier reviewed for the listed system. Neither field is a family, role, score profile, or inclusion gate.

An open-source-only view is a user-selected filter. Mixed licenses retain their component or path scope in evidence. Proprietary terms can support a listing when operational behavior is otherwise reviewable, but lower inspectability should affect research confidence and relevant score dimensions. See [ADR 007](adr/007-licenses-are-classification-not-inclusion.md).

### Model-provider relationship

Provider coupling is also orthogonal. `provider_native` identifies a primary path coupled to one provider, `multi_provider` identifies several maintained first-class integrations, and `provider_agnostic` requires a substitutable backend contract. Reviewed backend identifiers live in the taxonomy. These optional fields roll out through deliberate project review; their absence means “not reviewed.” See [ADR 006](adr/006-provider-relationships-are-orthogonal.md).

Providers and plain model API clients are not operational system families. An official SDK can qualify as an agent framework or runtime only when it materially owns a tool-using agent loop.

Named managed inference services live in a separate canonical collection with a dedicated operational-service score, surfaced alongside systems in the Directory. The record unit is the service boundary—not the company, model, local runtime, or client SDK. These records explain who operates inference and under what delivery, data, routing, and terms boundary; their score compares documented service controls without ranking model quality, price, or transient provider performance.

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
