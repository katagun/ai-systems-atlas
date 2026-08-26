# Backlog

This is the source of truth for actionable repository work. Policy and field definitions belong in `docs/`; completed implementation detail belongs in Git history.

## Now

- [ ] Review the 94 provisional records in small, evidence-backed batches; next prioritize Claude Agent SDKs, Google ADK, and Mastra.
- [ ] Review the coding-agent second pass: Cursor, GitHub Copilot coding agent, Jules, Replit Agent, Roo Code, SWE-agent, and Windsurf.
- [ ] Review source-model diversity candidates: screenpipe, AFFiNE, Onyx, Obsidian, Microsoft Recall, and Limitless.
- [ ] Add automated accessibility checks when a browser test runtime can be introduced without compromising the dependency-free application.

## Next

- [ ] Add a small review command that promotes a candidate only after all required editorial, source-model, license, and evidence fields are present.
- [ ] Add a stale-review report that distinguishes editorial age from GitHub metadata age without changing either.
- [ ] Document and test repository rename/transfer handling while preserving evidence history.
- [ ] Add link checking for project, license/terms, and immutable-evidence URLs with rate-limit-aware caching.
- [ ] Add provider-relationship UI detail only after enough reviewed projects carry the trait; add a filter only when it yields meaningful choices.

## Later

- [ ] Reassess an unscored ecosystem index for model providers, plain API SDKs, adapters, and observability clients after provider traits have been used in real reviews.

## Completed on 2026-08-25

- [x] Publish the static site through a validated, least-privilege GitHub Pages workflow and document repository safeguards.
- [x] Publish Claude Code, Devin, Kiro, OpenHands, OpenClaw, Pi, and Prime Agent with source-model-appropriate license or terms evidence.
- [x] Add the next major coding-agent comparison batch to the provisional queue instead of treating the first expansion as comprehensive.
- [x] Rebrand product-facing copy and metadata from Agent Systems Atlas to AI Systems Atlas while retaining the repository URL.
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
