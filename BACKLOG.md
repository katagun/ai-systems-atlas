# Backlog

This is the source of truth for actionable repository work. Policy and field definitions belong in `docs/`; completed implementation detail belongs in Git history.

## Now

- [ ] Review the remaining 101 provisional records in small, evidence-backed batches.
- [ ] Resolve GroqChat's product boundary only when first-party evidence establishes a durable workspace distinct from Groq Playground and GroqCloud.
- [ ] Add a deployment filter to the Systems scope and reconcile the `deployment` values behind it. ADR 018 makes this a precondition for promoting any record whose distinguishing fact is operational.
- [ ] Review the former managed-platform candidates individually under the ADR 018 routing, rather than as one batch.
- [ ] Settle the product boundary for Salesforce Agentforce and the Meta Business Agent Platform before assigning either a role.
- [ ] Review the remaining proprietary memory batch: NotebookLM, Microsoft Recall, and Limitless, preserving product boundaries from open references.
- [ ] Review the remaining coding-agent second pass: Cursor, GitHub Copilot coding agent, Jules, Roo Code, SWE-agent, and Windsurf. Replit Agent now provides the managed-workspace baseline.
- [ ] Review source-model diversity candidates: screenpipe, AFFiNE, Onyx, Obsidian, Microsoft Recall, and Limitless.
- [ ] Add automated accessibility checks when a browser test runtime can be introduced without compromising the dependency-free application.
- [ ] Disable administrator bypass for the `github-pages` environment in GitHub's UI; the setting has no supported API mutation.

## Next

- [ ] Add a small review command that promotes a candidate only after all required editorial, source-model, license, and evidence fields are present.
- [ ] Add a stale-review report that distinguishes editorial age from GitHub metadata age without changing either.
- [ ] Document and test repository rename/transfer handling while preserving evidence history.
- [ ] Add link checking for project, license/terms, and immutable-evidence URLs with rate-limit-aware caching.
- [ ] Review cross-protocol authentication and authorization profiles, workflow-state exchange beyond task messaging, and conformance suites as the next specification batch.
- [ ] Review Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as the next bounded instruction-convention batch.

## Later

- [x] Reassess local inference runtimes as their own bounded collection; ADR 015 defines the local-runtime boundary and score profile, and the seed batch is published.
- [ ] Reassess API clients, adapters, and observability SDKs only after concrete user questions justify another bounded collection.
- [x] Decide how the Atlas represents a framework its maintainer has declared superseded while the successor is already scored; ADR 016 adds the `superseded` status and a validated `superseded_by` link, and AutoGen and Semantic Kernel are published under it.
- [x] Stop the automated updater from reformatting `projects.json`; the file now matches the serializer the updater writes with, so a metadata refresh produces no formatting churn.
- [ ] Evaluate Dify, Langflow, Flowise, and Botpress Cloud as one batch answering whether a low-code visual builder is an agent framework or a multi-agent orchestrator.
- [ ] Review Novita AI and Lambda Inference with governing terms in hand; one documentation pass did not establish their retention, residency, and delivery boundaries.
- [x] Review Meta's AI products; the consumer assistant, Muse Code, and the Meta Model API are published as three records across three collections.
- [ ] Review Qwen Chat and Kimi as assistants, each with its own product-terms and governance pass.
- [x] Review Meta Business AI. The name is a marketing umbrella over advertising automation, creative tooling, and one operational product, the Meta Business Agent Platform, which is queued as a candidate. Its governing terms are real and dated, but it belongs to the deferred managed-agent-platform batch rather than a solo promotion.
- [x] Thicken the embedded-library and compatibility-gateway runtime types and screen Intel and NPU server engines; ONNX Runtime GenAI, Xinference, and OpenVINO Model Server are published.
- [x] Screen edge-oriented inference engines and read the inconclusive license files; both were Apache-2.0 despite GitHub reporting NOASSERTION. MLC LLM, Qualcomm GenieX, and TensorRT-LLM are published and llamafile is excluded.
- [ ] Allow license evidence to reference a pinned blob in a vendored submodule's own repository. The GenieX proprietary component is documented only in the geniex-qairt-plugin repository, and the git-blob evidence rule requires the record's own repo, so it is recorded as dated web terms instead.
- [ ] Review a proprietary or managed self-hosted gateway; both reviewed compatibility gateways are open source.
- [ ] Extend the runtime model-format vocabulary in one deliberate pass if more classical machine-learning serving systems are reviewed. ADR 017 makes extending the vocabulary an obligation when a modality is admitted; TensorFlow Serving needed `saved_model` added on its own, and Triton, KServe, and Seldon would each hit the same edge.
- [ ] Decide whisper.cpp on its merits under the ADR 015 purpose test and the ADR 017 modality rule; it was screened without a decision when the rule was unwritten.
- [ ] Revisit Xinference if its commercial terms are published; the enterprise edition is currently noted as an adjacent boundary because the vendor's terms page is a placeholder.

## Completed on 2026-08-28

- [x] Expand Specifications with WebMCP, OASF, ANP, AP2, UCP, and Commerce ACP, adding explicit web-agent, identity/discovery, metadata-schema, and agent-transaction taxonomy boundaries.
- [x] Extend the Atlas Finder to inference-service jobs and priorities while preserving separate score profiles and collection-native Directory handoffs.
- [x] Repair the duplicate ADR 011 sequence and update task-routing links.
- [x] Define delegated general work as an agent-system role and publish Perplexity Computer and Claude Cowork with explicit boundaries from their vendors' conversational assistants.
- [x] Publish Zep Cloud separately from Graphiti and Slite as a knowledge system whose Agent maintains the product's human-owned knowledge base.
- [x] Reconcile Mem0, Letta Code, Graphiti, Sylph, Pletor, Gorgias Cortex, and Slite Agent with reviewed, provisional, or exclusion dispositions instead of forcing every name into a scored record.
- [x] Show reviewed provider relationship and model-backend traits in project details without adding a sparse directory filter.
- [x] Define managed Inference Services as service records rather than companies, models, or local runtimes in ADR 010.
- [x] Add a six-service inference pilot with taxonomy-backed filters, terms, dated evidence, synchronization, validation, and detail views; later superseded its unscored treatment with ADR 012's dedicated service rubric.
- [x] Expand the pilot to a 36-service, geographically broad baseline using multiple current discovery catalogs and first-party verification for every promoted service.
- [x] Fold inference-service discovery into one Directory surface with systems while preserving separate schemas, filters, detail dialogs, URL state, and score comparability boundaries.
- [x] Add shareable two-to-four-item comparisons scoped to one system-family or inference-service score profile, with aligned decision context and URL restoration.

## Completed on 2026-08-26

- [x] Publish Grok and Microsoft 365 Copilot with explicit consumer, enterprise, agent, API, and model boundaries; retain GroqChat as provisional after its workspace boundary remained unproven.
- [x] Publish Claude, Gemini Apps, Microsoft Copilot, DeepSeek, and Z.ai as evidence-backed general assistants with explicit product boundaries.
- [x] Add assistant systems as a separately scored family with general, enterprise-work, and multi-model-chat roles.
- [x] Publish ChatGPT, Amazon Quick, and T3 Chat as the first evidence-backed assistant comparison across all three roles.
- [x] Add authoritative feed discovery for non-GitHub launches without allowing automation to make editorial conclusions.
- [x] Seed assistant, managed-platform, memory, agent-workflow, and framework candidates from authoritative product boundaries.

## Completed on 2026-08-25

- [x] Add evidence-backed instruction conventions for GitHub Copilot, Gemini CLI, Cline, Cursor, Continue, Roo Code, and Devin Desktop; keep deprecated Cursor and Windsurf paths from becoming duplicate records.
- [x] Harden repository automation with dependency review, npm Dependabot coverage, immutable-action enforcement, a deployment gate, and concise security and contribution guidance.
- [x] Make all active families the clear/default directory state, clear family-scoped roles on family changes, and surface hidden advanced-filter counts.
- [x] Publish GBrain as a local-first external agent-memory service with scoped MIT evidence; confirm GStack remains separately represented as a coding-agent workflow.
- [x] Publish Claude Agent SDK, Google ADK, and Mastra as one-record-per-product framework systems with provider traits, scoped license evidence, and duplicate language-binding dispositions.
- [x] Distinguish mixed-source products from open-core products so an open wrapper around a closed operational runtime is represented accurately.
- [x] Add an unscored Specifications catalog with MCP, A2A, AG-UI, ACP, AGENTS.md, CLAUDE.md, Agent Skills, and Agent Plugins; include taxonomy-backed filters and pinned evidence.
- [x] Publish the static site through a validated, least-privilege GitHub Pages workflow and document repository safeguards.
- [x] Publish Claude Code, Devin, Kiro, OpenHands, OpenClaw, Pi, and Prime Agent with source-model-appropriate license or terms evidence.
- [x] Add the next major coding-agent comparison batch to the provisional queue instead of treating the first expansion as comprehensive.
- [x] Rebrand product-facing copy and metadata from Agent Systems Atlas to AI Systems Atlas, then rename the public repository and Pages site to match.
- [x] Publish DB-GPT and Vanna as reviewed data-analysis systems; exclude SQL Chat on the operational-agent boundary.
- [x] Publish Agno, Haystack, LlamaIndex, and DSPy as reviewed framework systems with pinned license evidence.
- [x] Add a coverage matrix and batch-selection guidance for systematic expansion.
- [x] Replace license-gated inclusion with reviewed source-model and multi-license classification across policy, data, automation, and UI.
- [x] Publish WrenAI as the first reviewed open-core data-analysis agent with scoped Apache, CC BY, and commercial evidence.
- [x] Return ten license-only exclusions to the provisional queue; reserve exclusions for family and role boundaries.
- [x] Define provider relationships as optional reviewed traits in ADR 006, taxonomy, validation, and task-routed documentation.
- [x] Add Claude Agent SDK for Python and DeepSeek Harness to the provisional queue under the initial license-gated policy (later superseded by ADR 007).
- [x] Make discovery recognize agent harnesses and derive candidate families from taxonomy-owned role policy.
- [x] Review the first provider-native batch under the initial operational-source boundary (later superseded by ADR 007).
- [x] Review the first framework batch: publish OpenAI Agents SDK and LangChain with pinned license and provider evidence.
- [x] Introduce durable license-drift incidents, now represented by non-hiding evidence-review signals under ADR 007.
- [x] Preserve candidate and license-review queues as versioned review artifacts.
- [x] Separate editorial `verified_at` from `metadata_verified_at` and field-specific live dates.
- [x] Centralize license identifiers and source-model coherence rules in the taxonomy and validation.
- [x] Tie immutable evidence URLs to recorded Git blob SHAs.
- [x] Expand schema validation across taxonomy axes, queues, dates, URLs, and published copies.
- [x] Add updater regression tests and dependency-free web behavior tests.
- [x] Preserve multi-role finder constraints when opening the directory.
- [x] Backfill live metadata for all active catalog entries.
- [x] Add task-routed documentation for humans and AI agents.

## Backlog hygiene

- Keep items outcome-focused and independently verifiable.
- Link to a policy or ADR instead of duplicating it here.
- Move finished work to the dated completed section; remove obsolete items.
- Do not put provisional catalog candidates in this file—the candidate queue is their canonical home.
