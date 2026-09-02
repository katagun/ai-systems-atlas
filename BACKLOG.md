# Backlog

This is the source of truth for actionable repository work. Policy and field definitions belong in `docs/`; completed implementation detail belongs in Git history.

## Now

- [ ] Review the remaining 91 provisional records in small, evidence-backed batches.
- [ ] Decide what the Atlas does with agent skill packs, as a deliberate question rather than a triage side effect. The 2026-08-31 sweep queued thirty survivors out of 279 candidates and recorded the classes it dropped only in aggregate — `docs/COVERAGE.md` names "several skill libraries" among them, and no per-item triage log exists, so the size of this class is unknown and would have to be re-derived; the class now includes some of the highest-adoption repositories in the ecosystem, and reviewed runtimes such as DeerFlow and LibreChat carry skills as first-class runtime constructs rather than as prose. Separate three cases before deciding any of them: the authoring convention itself, which belongs with the queued instruction-convention batch or the Specifications collection rather than the scored catalog; a skills runtime that resolves, installs, versions, or sandboxes packs, which could own an operational outcome; and a collection of skill documents, which the Superpowers exclusion already treats as a research input on the grounds that nothing runs when the host harness is removed. Adoption is not evidence either way, and Superpowers was the most-starred candidate in the sweep.
- [ ] Reconsider Liquid AI, and decide whether the Atlas needs a boundary for labs whose models you must serve yourself. Liquid AI was screened out of the inference-service collection on its own statement that it does "not currently offer a hosted API of our own", reaching users instead through a gated playground, OpenRouter, Bedrock, and direct weight downloads. That is the correct answer for that collection under [ADR 010](docs/adr/010-inference-services-are-unscored-service-records.md) and the wrong disposition for the Atlas: it is a real operational choice with no record able to hold it. The reviewable facts are procurement facts, not benchmark facts — the LFM Open License is free to download, run, and fine-tune commercially "until your company's annual revenue passes $10 million USD", after which a commercial license is required, and the documented deployment path runs through named local runtimes and third-party GPU platforms. Any such collection has to be defined so that it scores distribution, licensing, and deployment surface while keeping model quality, benchmarks, and parameter counts out, which is the line `ROADMAP.md` already draws for inference services. Note also that `directory/candidates.json` cannot currently queue this question: its schema requires a compatible family and role pair, so a system awaiting a collection that does not yet exist has nowhere to wait.
- [x] Write the derivative rule down; [ADR 020](docs/adr/020-derivative-records-turn-on-operational-boundary.md) settles it on the fields a record already carries rather than on repository lineage. One correction this item did not anticipate: Open Grok is not a precedent for the rule, because its upstream is not a published record and no exclusion branch was ever available. The base is oh-my-pi for inclusion and llamafile for packaging.
- [x] Stop the metadata refresh from overwriting an editorial status. `scripts/update_directory.py` derived `status` in both directions from the repository's archived flag, so the next refresh would have reverted both `superseded` records to active — GitHub reports neither predecessor as archived — and would equally have reverted a hand-set `archived`. The refresh now only promotes an active record to archived, and two tests cover it. Found while reviewing Continue, whose maintainers declared the repository read-only without archiving it.
- [ ] Resolve GroqChat's product boundary only when first-party evidence establishes a durable workspace distinct from Groq Playground and GroqCloud.
- [x] Add a deployment filter to the Systems scope and reconcile the `deployment` values behind it; both shipped, and ADR 019 later added the matching interface filter.
- [x] Review the former managed-platform candidates individually under the ADR 018 routing. Foundry Agent Service, Bedrock AgentCore, and the Gemini Enterprise Agent Platform are published as stateful agent runtimes and watsonx Orchestrate as a multi-agent orchestrator; Copilot Studio stays with the low-code builder batch.
- [x] Settle the product boundary for Salesforce Agentforce and the Meta Business Agent Platform; both are published as agent frameworks.
- [ ] Record the effective dates of the xAI terms governing Grok Bot. The host refuses both automated fetches and browser access from this environment, so the record cites the governing URLs without restating their dates; the Cursor terms it designates for authentication, retention, and deletion were read directly and are dated. Grok Bot is also the second record whose governance splits across two companies with no first-party page reconciling them.
- [ ] Re-read the Meta Business Agent terms and record their date and scope. The document renders only in a browser, and browser access to that host is blocked in the current environment, so this review cites the governing URL without restating its text.
- [ ] Review the remaining proprietary memory batch: NotebookLM, Microsoft Recall, and Limitless, preserving product boundaries from open references.
- [ ] Review the remaining coding-agent second pass: Cursor, GitHub Copilot coding agent, Jules, SWE-agent, and Windsurf. Replit Agent provides the managed-workspace baseline, and Roo Code is now published as archived alongside Crush, Qwen Code, and Continue. Zoo Code, the community continuation of Roo Code, is queued.
- [ ] Review the remaining source-model diversity candidates: screenpipe, Obsidian, Microsoft Recall, and Limitless. AFFiNE and Onyx are published, and both confirmed the concern behind this item: each reports no recognised license to automated detection while carrying a real proprietary tier, and Supermemory reports a permissive license while its memory engine is absent from the repository entirely.
- [ ] Add automated accessibility checks when a browser test runtime can be introduced without compromising the dependency-free application.
- [ ] Disable administrator bypass for the `github-pages` environment in GitHub's UI; the setting has no supported API mutation.

## Next

- [ ] Surface local-runtime GitHub star counts in the Directory UI (card badge, sort option). `directory/local-runtimes.json` now carries `stars`/`stars_verified_at`, refreshed by `scripts/update_directory.py`, but the web app doesn't render them yet; data-only was a deliberate scope cut.
- [ ] Add a small review command that promotes a candidate only after all required editorial, source-model, license, and evidence fields are present.
- [ ] Add a stale-review report that distinguishes editorial age from GitHub metadata age without changing either.
- [ ] Document and test repository rename/transfer handling while preserving evidence history.
- [ ] Add link checking for project, license/terms, and immutable-evidence URLs with rate-limit-aware caching. This is also the natural home for terms-drift detection: the weekly refresh only compares GitHub-detected SPDX against reviewed licenses, so license or terms changes for records without a GitHub-detected license — inference services above all — surface no signal today.
- [ ] Review cross-protocol authentication and authorization profiles, workflow-state exchange beyond task messaging, and conformance suites as the next specification batch.
- [ ] Review Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as the next bounded instruction-convention batch.
- [x] Add operator and project logos to the directory cards on the site. 119 of 174 records carry monochrome marks vendored into `web/logos.json` from `@lobehub/icons-static-svg` (MIT) and `simple-icons` (CC0) via `scripts/build_logos.mjs`; the rest show monogram fallbacks, the runtime stays dependency-free, and the footer carries a trademark notice.

## Later

- [x] Reassess local inference runtimes as their own bounded collection; ADR 015 defines the local-runtime boundary and score profile, and the seed batch is published.
- [ ] Review the hosted editions of self-hosted gateways as routing aggregators, starting with Portkey and Helicone. Their vendor-run tiers are inference services on the existing definition; the self-hostable software itself stays out under ADR 015, which excludes proxies and routing libraries by name.
- [ ] Reassess API clients, adapters, and observability SDKs only after concrete user questions justify another bounded collection. A 2026-08-31 pass asked whether self-hosted AI gateways deserved a collection and concluded they do not: ADR 010 and ADR 015 already exclude proxies and routing libraries by name, so this is a settled decision rather than an unfilled gap, and reversing it would need its own record.
- [x] Decide how the Atlas represents a framework its maintainer has declared superseded while the successor is already scored; ADR 016 adds the `superseded` status and a validated `superseded_by` link, and AutoGen and Semantic Kernel are published under it.
- [x] Stop the automated updater from reformatting `projects.json`; the file now matches the serializer the updater writes with, so a metadata refresh produces no formatting churn.
- [x] Answer whether a low-code visual builder is an agent framework or a multi-agent orchestrator; ADR 019 makes authoring surface a trait, amends the framework definition to cover builders, and requires an interface filter before any is promoted.
- [x] Publish the reviewed builders under the ADR 019 routing; all five are published.
- [ ] Revisit Flowise if a community fork gains maintainer endorsement or clear succession; the record is archived with no successor named, so ADR 016's superseded status does not apply.
- [ ] Settle whether an aggregator that resells other aggregators is reviewable, and on what boundary. Several catalog entries route to OpenRouter and to each other, so a record could describe a service whose whole substance is another reviewed record.
- [ ] Reconcile the `operator` field convention across inference services. Recent records name legal entities while older ones name brands, and the field should say who the customer contracts with; Z.ai was corrected because its brand and its Singapore contracting entity share no words.
- [ ] Work the models.dev catalog for inference-service coverage in evidence-backed batches, collapsing regional and subscription variants to service boundaries first. It is a coverage-audit source rather than a discovery feed; `directory/discovery-sources.json` requires an announcement feed and models.dev publishes none, serving one HTML page for every path.
- [ ] Settle what Glama is before reviewing it. Its model gateway still serves a public catalogue, but the product now presents as an index of tool servers with a chat workspace attached, and no plan price is visible without signing up, so the reviewable boundary is unclear.
- [ ] Review Novita AI and Lambda Inference with governing terms in hand; one documentation pass did not establish their retention, residency, and delivery boundaries.
- [x] Review Meta's AI products; the consumer assistant, Muse Code, and the Meta Model API are published as three records across three collections.
- [ ] Review Qwen Chat and Kimi as assistants, each with its own product-terms and governance pass.
- [x] Review Meta Business AI. The name is a marketing umbrella over advertising automation, creative tooling, and one operational product, the Meta Business Agent Platform, which is queued as a candidate. Its governing terms are real and dated, but it belongs to the deferred managed-agent-platform batch rather than a solo promotion.
- [x] Thicken the embedded-library and compatibility-gateway runtime types and screen Intel and NPU server engines; ONNX Runtime GenAI, Xinference, and OpenVINO Model Server are published.
- [x] Screen edge-oriented inference engines and read the inconclusive license files; both were Apache-2.0 despite GitHub reporting NOASSERTION. MLC LLM, Qualcomm GenieX, and TensorRT-LLM are published and llamafile is excluded.
- [ ] Allow license evidence to reference a pinned blob in a repository other than the record's own. Two records now need it: the GenieX proprietary component, and watsonx Orchestrate, whose MIT client lives in a repository the platform record does not claim as its own. Both are recorded as dated web terms with the blob hash named in the scope instead.
- [ ] Review a proprietary or managed self-hosted gateway; both reviewed compatibility gateways are open source.
- [ ] Extend the runtime model-format vocabulary in one deliberate pass if more classical machine-learning serving systems are reviewed. ADR 017 makes extending the vocabulary an obligation when a modality is admitted; TensorFlow Serving needed `saved_model` added on its own, and Triton, KServe, and Seldon would each hit the same edge.
- [ ] Decide whisper.cpp on its merits under the ADR 015 purpose test and the ADR 017 modality rule; it was screened without a decision when the rule was unwritten.
- [x] Settle whether `self_hosted` belongs on a record that ships only a library. The definitions now turn on whether the project ships the server or a helper the user's own server calls, and all 59 records were audited against them.
- [ ] Decide whether the CrewAI record covers the open-source framework alone or the framework together with the vendor's AMP suite. Its `self_hosted` value currently rests on AMP's on-premise option rather than on anything the open-source package ships.
- [ ] Decide whether the Codex record is scoped to the terminal agent alone. Its deployment now names the first-party IDE extension and desktop app from the same repository, which is wider than the record's own summary.
- [ ] Re-check the Khoj record's status and links. The desktop download on khoj.dev returns 404 and the homepage now leads with a different product, which is a status question rather than a deployment one.
- [ ] Decide whether Perplexity Personal Computer is a separate record from Perplexity Computer. It has its own product page and installs on the user's machine with access to local files and applications, so its execution boundary differs from the cloud product this record reviews.
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
