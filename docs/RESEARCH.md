# Research synthesis

## Selection method

The catalog is coverage-weighted rather than a naïve star leaderboard. Popularity is tracked separately, but a selected project must contribute a distinct architectural or operational lesson. Memory, agent, and assistant projects are evaluated only within their separate families and score profiles.

### Memory-system research set

| Project | Primary lesson | Strongest contribution | Principal weakness |
|---|---|---|---|
| Letta Code | Embedded stateful agents | Memory, identity, skills, schedules, dreaming, and Git-tracked agent state | Self-editing memory can drift; current codebase is newer than the historically popular repository |
| Mem0 | External agent memory | Simple production-oriented API, scoped memories, multi-signal retrieval | Opaque extracted facts can become a second source of truth |
| Graphiti | Temporal context graph | Provenance, validity windows, changing truth, and as-of queries | Operational graph/LLM complexity |
| Basic Memory | Human–agent bridge | Shared Markdown, MCP/skills interoperability, semantic and graph recall | Lightweight semantics and local sync burden |
| Khoj | Complete AI second-brain product | Broad source/model support, agents, automation, self-hosting | Database-centric canonical knowledge and weak explicit supersession |
| Logseq | Local graph PKM | User-owned linked knowledge, blocks, backlinks, and queries | Complexity and architectural transition risk |
| Trilium | Hierarchical PKM | Hierarchy, cloning, revisions, encryption, scripting, REST API, large-vault maturity | Less portable database-centric storage |
| AppFlowy | Structured workspace UX | Documents, databases, projects, native cross-platform experience, data control | Heavy system whose AI memory lifecycle remains secondary |
| OpenRecall | Open ambient capture | Local, cross-platform, searchable screenshot history | Privacy, storage, noise, and slower project activity |
| claude-mem | Coding-session memory as a service | Store reachable through an interface, a tool protocol, and a package at once, with provenance as a first-class table | Two storage models coexist; writing memory requires an off-device model call |
| agentmemory | Memory lifecycle mechanics | Supersession, decay, expiry, and eviction implemented separately, running with no key and no model calls | Pinned third-party engine dependency; more open issues than closed |
| memU | Judgement delegated to the caller | Plain markdown on disk, a store that makes no model calls, one backend shared across hosts | Non-canonical licence text no identifier matches; retrieval is cosine similarity alone |
| OpenHuman | Personal memory the owner can read | Editable markdown vault the agent reasons over, with local-only mode enforced at the client construction point | An assistant rather than a service: no external interface lets other software read its memory |
| CodeGraph | Code graph as shared infrastructure | Measured per-language extraction coverage on named public repositories, and uncertain edges marked rather than asserted | Telemetry ships enabled by default; the schema keeps only current state, so history cannot be queried |
| GitNexus | Cross-repository code graph | Ad-hoc graph queries, hybrid keyword and vector search, and contract registries that join microservice graphs | Noncommercial licence bars commercial use and reads as unlicensed to automated detection; the docs contradict each other on incremental indexing |
| OpenViking | Memory as a browsable filesystem | Tiered summaries and retrieval that keeps the path which produced each result | Copyleft server with a permissively licensed client, and an unlicensed Python library between them |
| Supermemory | Open adapters over a closed core | Eight framework adapters and a tool server, all permissive and forkable | The memory engine is absent from the repository the documentation calls open source |
| Onyx | Honest open-core boundary | Fifty-five connectors and a full retrieval stack that run without the enterprise tree | Permission sync and post-query filtering are enterprise-only, which is what mixed-permission data needs |
| AFFiNE | Permissive client on a proprietary server | A genuinely local-first offline path with reusable editor internals | Synchronization, search, and all AI sit in one licensed server, and self-hosting caps at ten seats |
| screenpipe | Ambient capture goes source-available | An agent-facing API and tool server over a local database with retention and export controls | Nothing in the tree is open since June 2026; analytics defaults on despite the local claim |
| Hindsight | Beliefs with evidence, not a fact pile | Consolidation into observations with quoted proof, and a third-party runtime already using it as a backend | Every accuracy figure is vendor-run; the wrapper defaults to the vendor cloud |
| DocsGPT | Enterprise governance not withheld | Role management, single sign-on, and teams in the permissive tree; agents as compatible and tool-server endpoints | The quick-start routes inference through the vendor's shared key |
| MemOS | Memory cubes without reciprocation | Per-user, per-agent isolation, a real service surface, and on-device plugins for three runtimes | No targeted runtime names it as a backend; defaults and benchmarks are vendor-run |
| Memobase | Memory as an editable user profile | A configurable profile schema plus an event timeline, directly editable through the API | Every first-party hosted surface is gone, and development stopped in January |

### Agent-system research set

| Project | Primary lesson | Strongest contribution | Principal weakness |
|---|---|---|---|
| Codex | Controlled coding agency | Repository-scale execution with approvals, sandboxing, IDE/CLI/SDK, and MCP | Strongest model experience is hosted; output still needs review |
| Claude Code | Provider-native coding agency | Mature permissions, hooks, MCP, subagents, and terminal/IDE/SDK surfaces | Proprietary implementation coupled to Anthropic models |
| Devin | Delegated cloud engineering | Long-running observable workspaces, takeover, parallel sessions, API, and team integrations | Proprietary cloud execution reduces inspectability and sovereignty |
| Cline | Human control | Visible plans, diffs, approval-gated tools, browser use, and MCP | IDE-centered; safety rests heavily on operator attention |
| Aider | Auditable pair programming | Git-native edits and broad provider support with a mature operational history | Narrower tool surface and less autonomy than newer harnesses |
| OpenCode | Provider-neutral coding agent | Model portability, multiple interfaces, and an open extension surface | Rapid interface evolution and configuration-dependent safety |
| OpenHands | Coding-agent operations | Self-hosted agent control, automations, execution backends, and ACP interoperability | Safe deployment depends on deliberate sandbox and backend configuration |
| Pi | Minimal extensible harness | Small reusable agent/model/TUI packages with deep extension seams | No built-in permission boundary; sandboxing is external |
| Goose | Local extensible agent | MCP-native local tools for code and general tasks | Reliability and observability vary with extensions and models |
| Kiro | Spec-driven coding | Reviewable specs, steering files, hooks, powers, IDE/CLI, and MCP | Proprietary AWS service with remote model processing |
| GStack | Coding-agent process | Role separation and artifact handoffs from discovery through release | It is a workflow layer rather than a durable knowledge store or full runtime |
| Browser Use | Browser agency | Rich browser-control primitives and local/cloud execution choices | Websites are nondeterministic and remote browsers complicate privacy |
| GPT Researcher | Research agency | Multi-step web research with cited report artifacts | Source judgment and steering still require a human |
| OpenClaw | Personal agent runtime | Local gateway joins durable sessions, tools, schedules, channels, skills, and devices | Host tools and inbound messages create a broad security boundary |
| Prime Agent | Long-running recursive harness | Persistent IPython, subagents, background sessions, goals, schedules, and reversible refinement | Host execution and self-editing durable state require careful trust controls |
| LangGraph | Durable agent runtime | Checkpoints, resumability, explicit graphs, and human-in-the-loop control | Substantial framework and workflow-design complexity |
| Pydantic AI | Typed agent engineering | Contracts, validation, evaluation, observability, and provider portability | Python-focused; execution policy remains application-owned |
| CrewAI | Multi-agent coordination | Accessible role-based crews plus explicit flows | Extra agents can amplify nondeterminism and debugging cost |
| Microsoft Agent Framework | Workflow convergence | Multi-agent workflows, state, observability, and .NET/Python support | Newer consolidated framework with cloud-oriented integrations |
| smolagents | Minimal agent abstraction | Understandable code-agent design and flexible local/sandbox execution | Persistence, recovery, and policy are mostly left to applications |
| Gajae-Code | Subscription-authenticated agency | Runs on plans the developer already pays for, gates mutation behind an approved plan, and relays questions to chat apps | Self-declared experimental beta with no semantic retrieval |
| oh-my-openagent | Third-party orchestration layer | Adds planning, multi-agent teams, and code navigation inside command lines developers already run | Source-available licence bars commercial redistribution; all releases are prereleases |
| Claw Code | Agent-executed codebase as artifact | Safe-by-default permissions and structured diagnostics across a large agent-built Rust workspace | Maintainers direct users elsewhere for real work; no releases or tags exist |
| DeerFlow | Batteries-included agent runtime | Memory, skills, sandboxes, and schedules ship as one operable system across four interfaces | Gateway administration equals host code execution; run history is not durable by default |
| ECC | Process enforced at tool-call time | Blocking hooks demand facts before edits rather than asking a question the model always answers yes | Most of the catalogue is documentation, and the headline control plane is self-declared alpha |
| ruflo | Advertised coordination versus shipped substrate | A genuinely built memory layer with vector index, encryption at rest, and expiry sweeps | The swarm engine it markets is in neither dependency chain of the published package |
| Orca | Supervising real agent processes | Typed, durable inter-agent messages and a terminal daemon that outlives the application | The orchestration layer is behind an experimental flag and absent from the readme |
| Grok Bot | Persistent named agents as a product | Per-action approvals, review rules where requiring approval wins, and peer handoffs between durable bots | One shared computer per user is explicitly not a security boundary, and no administrator audit trail exists yet |
| oh-my-pi | A fork that outgrew its upstream | Native execution core, debugger and language-server integration, shared sessions | Approval defaults to auto-approving shell execution, with no operating-system sandbox |
| oh-my-claudecode | Orchestrating rival vendors' agents | Supervises six competing coding-agent tools as interchangeable workers | The primary surface runs nothing without the host agent and a paid subscription |
| Codewhale | Authorization written as specification | Nine ordered approval layers, and sandbox docs that name what is not wired | Telemetry defaults to on, and the licence still names the pre-rename identity |
| Reasonix | A whole agent in one static binary | Self-contained cross-compiled distribution with reversible file-snapshot checkpoints | The shipped code lives on a rewrite branch; the repository's named branch is abandoned |
| Crush | Source-available coding agency | Language-server operations as agent tools, and one local backend serving several clients | Licence bars competing commercial use; project config is executed shell |
| Qwen Code | A provider fork that outgrew its upstream | Sandboxed execution, subagents, and a client surface wider than the record it descends from | Surface area outruns evidence, and the headline install pipes a hosted script into a shell |
| Continue | A coding agent that ended deliberately | Removed telemetry, authentication, and hosted coupling before freezing at a final release | Read-only and unmaintained; headless mode allows every tool by default |
| Roo Code | The middle link of a fork chain | Per-task checkpoints and a shim letting one core run outside the editor | Shut down and delisted; its command line auto-approves by default |
| Vane | A bounded research loop, self-hosted | An explicit tool registry with a deliberate finish action, and a plan shown to the reader | No tests or CI beyond an image build; dormant, with advertised providers absent |
| dexter | Domain tools carry the specialisation | Nine implemented finance tools and a shell-parsing permission engine that fails closed | No licence file has ever existed; all data flows through one hard-coded vendor |
| deepagents | A harness that earns its own build target | Its own storage protocol, model harness profiles, and three external benchmarks in CI | Inseparable from the framework beneath it, whose vendor tracing is a hard dependency |
| Skyvern | Where the open core stops | A budgeted, retrying step loop with a failure classifier, plus a workflow builder and self-hosted server | Anti-bot and captcha solving are cloud overrides of open stubs; telemetry defaults on |
| CowAgent | A messaging bridge that became a runtime | Standing named agents with their own workspaces, and delegation recorded as durable runs | Argument-level permissions defaulting to full access; no general test suite in CI |
| nanobot | A runtime that is also a library | Version-controlled layered memory, checkpoint recovery, and four surfaces over one engine | Control governs who may talk, not what may run; isolation is Linux-only |
| CAMEL | A research collective's production orchestrator | Coordinator, snapshot, resume, and runtime worker creation, all tested | Release train stalled at alphas; two files of over six thousand lines |
| Open Design | A workflow that owns its own daemon | Data-contract adapters for many vendor tools, and a tool-loop guard with real failure semantics | Silently modified Apache text; a telemetry channel the toggle cannot disable |
| AionUi | Bundled engine plus supervised vendor workers | Scheduler, mailbox, and crash recovery as machinery; runs without any third-party tool | The core is a binary fetched from a second repository at packaging time |
| mini-SWE-agent | How little harness a coding agent needs | A hundred-line tested loop, confirmation by default, and one design across host, container, and sandbox | The shell is the only tool; the default environment has no isolation |
| SWE-agent | A superseded scaffold kept for reproducibility | Tested library loop, replayable trajectories, container by default | Its own maintainers recommend the successor; no distributed package since 2024 |
| agenticSeek | A fully local general work agent, two surfaces of four | A real browser navigation loop, workspace confinement, local models first | No CI or release ever; execution unconfirmed by default; no scheduler or connectors |
| Omnigent | Competing agents as interchangeable executors | Paired harness modules for a dozen vendors, stacked policies in a non-Turing-complete language, ten sandboxes | Pre-release with a thousand open issues in three months; the routing gate fails open by design |
| Open SWE | A coding agent as deployable infrastructure | Five graphs, delivery to a code host, and a reviewer evaluated against golden comments from real repositories | The production runtime is restricted and licence-keyed; models are a closed list |
| Swarms | Dispatch that is real, marketing that is not | Typed order parsing verified by running the shipped package offline against stub workers | Zero passing test runs in thirty; telemetry on by default carries task text and conversation |
| MagenticLite | A browser agent inside a virtual machine | The strongest isolation boundary reviewed, with approval-by-default and a grant table for folders | The rewrite deleted the planning feature its own description still advertises |
| TaskWeaver | Generated Python over live state | Syntax-tree verification before execution, and a kernel that keeps tables alive across turns | Archived with no notice on the readme or the live documentation site; never packaged |
| emdash | Parallel agent runs as a delivery process | One protocol contract driving thirty-eight vendors' tools, with a test gate that provisions native builds so specs actually run | No model client at all, so it is contingent on other vendors' tools |
| stagewise | A coding agent inside its own browser | The live page's console and structure as environment adapters, and an approval default that cannot drift | The licence appends a carve-out for bundled icons the app depends on |
| BeeAI Framework | Tool-use control declared ahead of the run | Requirement rules validated at construction, and one agent served over three protocols | The headline promises multi-agent; coordination is under five per cent of the package |
| grok-cli | Scheduled unattended runs on one provider | Hooks that block at tool-call time, and reproducible signed binaries | File tools resolve absolute paths with no containment; no workflow runs its tests |
| SeekrFlow | Attribution as a platform surface | Context, training-data, and source attribution map a response back to retrieved chunks and training examples | The advertised cross-session memory has no documented surface; commercial terms are unpublished |

### Assistant-system research set

| Product | Primary lesson | Strongest contribution | Principal weakness |
|---|---|---|---|
| ChatGPT | Mature general assistant | Broad tools, projects, memory, research, and cross-device product maturity | Provider-native service with limited portability and inspectability |
| Claude | Controlled contextual collaboration | Explicit projects, editable memory, citations, connected research, and context import/export | Features and limits vary by plan; all operational state remains service-managed |
| Gemini Apps | Ecosystem-integrated assistance | Deep Research, Google-connected context, Gems, personalization, and scheduled or multi-step work | Consumer, Workspace, and experimental product boundaries are easy to conflate |
| Microsoft Copilot | Ubiquitous personal companion | Reach across standalone apps, Windows, mobile, web, and Microsoft surfaces | The Copilot brand spans many separately governed products and capability sets |
| DeepSeek | Open-model/closed-product boundary | Accessible reasoning, search, files, and synchronized web/mobile chat | Hosted product governance and continuity controls are comparatively limited |
| Z.ai | Regional provider coverage | GLM-native chat, file input, deliberate reasoning, and an integrated coding entry point | Thin public product documentation and limited evidence for durable context or portability |
| Grok | Real-time provider-native assistance | Current-information retrieval, research, files, creation, and optional agentic actions | Overlapping consumer, X, bot, API, and model boundaries require careful separation |
| Amazon Quick | Governed enterprise assistance | Organizational knowledge, analytics, actions, custom agents, and AWS administration | Broad evolving bundle with proprietary cloud operation |
| Microsoft 365 Copilot | Tenant-grounded work assistance | Microsoft 365 context, enterprise search, notebooks, applications, agents, and governance | Licensing and capability surfaces vary across plans, tenant configuration, and the wider Copilot brand |
| T3 Chat | Multi-provider workspace | First-class model choice in a simple persistent client | Narrower tools, governance, and autonomous workflows than major provider assistants |
| LibreChat | Operator-held multi-model workspace | Hash-chained audit log, group and role permissions, and its own agents re-exposed as a model endpoint | Manifests declare a different licence from the repository; memory entries overwrite with no history |

GroqChat remains provisional. Groq's current first-party agreement establishes a governed cloud service with access to multiple model services, but the public product material does not yet establish the durable workspace or boundary from Groq Playground and GroqCloud required for the multi-model chat-client role.

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

The catalog is organized by operational relevance, not by license eligibility. Open-source, open-core, source-available, and proprietary systems can all qualify when their behavior can be reviewed responsibly. Licensing remains prominent, scoped evidence: users can filter by exact license or source model, and inspectability influences confidence and relevant score dimensions. An open-source-only directory is therefore a view over the catalog rather than its boundary. See [ADR 007](adr/007-licenses-are-classification-not-inclusion.md).

License-only exclusions were returned to the review queue. True exclusions now express a role or evidence boundary—for example, a tracing client that does not itself act as an agent—not a preference for one software-distribution model.
| Jan | The open desktop counterpart to hosted chat | Threads, assistants, and models as readable local files, re-exposed through a local compatible server | The licence file is a notice rather than the text, and package manifests disagree with each other |
