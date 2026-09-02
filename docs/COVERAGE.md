# Coverage

Use this document to choose research batches. The canonical project and candidate records remain the source of truth; this is a dated editorial snapshot, not another queue.

## What comprehensive means

AI Systems Atlas aims to be comprehensive within its declared operational scope, not an indiscriminate list of every model, API, prompt wrapper, or branded feature. Coverage is healthy when a user can compare materially different approaches within a supported role, understand source-model and licensing tradeoffs, and see important systems that failed review with a concrete reason.

The operational-system universe is deployable or directly usable memory, agent, and assistant systems. Managed inference services and self-operated local runtimes each form a separately scored collection with its own rubric; specifications remain separate and unscored. Plain inference clients, model repositories, and observability-only services remain adjacent components unless a future collection defines their distinct user question and boundary.

Measure coverage across three axes:

1. **Operational roles:** enough credible alternatives to expose real architectural choices.
2. **Source models:** open-source, mixed-source, open-core, source-available, and proprietary approaches where they materially exist.
3. **Ecosystem significance:** mature reference systems, important new designs, and provider-native approaches—not popularity alone.

Do not add a new family merely to fit a famous product. Add one only when its primary operational outcome cannot be scored coherently by an existing family.

## Snapshot — 2026-08-29

The reviewed catalog contains 111 systems: 31 memory systems, 66 agent systems, and 14 assistant systems. Sixty-eight are open-source, three use mixed open licenses, three are open-core, three are mixed-source, three are source-available, and twenty-seven are proprietary. Three records are archived and two are superseded, so 106 satisfy active-choice coverage. The provisional queue contains 115 records. The separate collections contain 21 unscored specifications, 56 scored inference services spanning direct APIs, cloud model platforms, managed hosting, and routing aggregation across North American, European, Chinese, and other international operators, and 14 scored local runtimes.

### Local runtimes

The local-runtime collection covers self-operated inference software under [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md). Its fourteen records span three desktop runners, five server engines, four embedded libraries, and two compatibility gateways, across eleven open-source projects, two mixed-source products, and one open-core engine.

| Runtime type | Reviewed | Coverage signal |
|---|---:|---|
| Desktop runner | 3 | Adequate across an open runner, a proprietary application, and an on-device NPU product |
| Server engine | 5 | Broad across accelerator-backed serving, an Intel and NPU path, a first-party NVIDIA engine, and a versioned classical-machine-learning server |
| Embedded library | 4 | Adequate across GGUF, Apple silicon, portable ONNX, and compiled mobile and browser targets |
| Compatibility gateway | 2 | Improved; both reviewed gateways are open source, so a proprietary or managed self-hosted gateway remains unreviewed |

Execution now reaches past the desktop and the single server: phones, embedded boards, and the browser are represented, alongside NPU, OpenCL, WebGPU, DirectML, and ONNX paths.

Accelerator coverage now spans CPU, CUDA, ROCm, Metal, Vulkan, SYCL, NPU, and DirectML paths, and format coverage includes ONNX alongside GGUF, safetensors, MLX, and the quantized schemes. Coverage is representative of material execution choices rather than exhaustive. Text Generation Inference was screened and excluded because its repository is archived. Jan was screened and routed to the candidate queue as an assistant, because conversations, projects, assistants, agents, and connectors place it on the assistant side of the ADR 015 runtime test.

| Role | Reviewed | Active | Coverage signal |
|---|---:|---:|---|
| General work agent | 3 | 3 | Improved across research-first, office-work, and media-production approaches; keep reviewing control, recovery, permission, and execution boundaries |
| Agent framework / SDK | 23 | 20 | Broad across code frameworks and visual builders after ADR 019 widened the definition; two Microsoft predecessors are superseded and one builder is archived |
| Coding agent | 17 | 17 | Broad across local, self-hosted, managed-cloud, terminal-native, and community-fork operation |
| Human-first PKM | 8 | 8 | Broad, but proprietary reference products remain provisional |
| AI knowledge app / RAG brain | 6 | 5 | Improved with a proprietary self-maintaining knowledge product; review open-core alternatives |
| Retrieval infrastructure | 4 | 4 | Adequate baseline |
| Data-analysis / text-to-SQL agent | 3 | 2 | Improved; add distinct governed and enterprise approaches |
| Agent memory service | 7 | 7 | Improved with separate open-engine and managed-service boundaries; compare ownership, lifecycle, governance, and retrieval intelligence |
| Ambient capture | 2 | 2 | Thin; source-model diversity is missing |
| Context graph engine | 2 | 2 | Thin |
| Multi-agent orchestrator | 4 | 4 | Improved with a vendor-operated registry platform and a low-code service that escalates to people; open orchestrators remain thin |
| Stateful agent runtime | 8 | 8 | Broad after three vendor-operated platforms joined the self-operated runtimes; compare who holds the operating contract alongside persistence and execution policy |
| Browser/computer agent | 2 | 2 | Improved open baseline; desktop reliability and sandbox boundaries still need broader comparison |
| Coding-agent workflow | 3 | 3 | Improved with a third-party orchestration plugin and an agent-built demonstration; compare process and delivery discipline |
| Human–agent memory bridge | 1 | 1 | Priority gap |
| Research agent | 2 | 2 | Improved with a source-available executable-evidence approach; broader production evidence remains thin |
| General AI assistant | 10 | 10 | Representative provider baseline now including European-governed and Meta products; add others only when their workspace, governance, or regional ecosystem is materially distinct |
| Enterprise work assistant | 2 | 2 | Improved Microsoft/AWS baseline; broader enterprise SaaS diversity remains a priority |
| Multi-model chat client | 2 | 2 | Improved across conventional and privacy-oriented hosted approaches; open-client boundaries remain thin |

Archived and superseded systems remain reviewed historical references but do not satisfy active-choice coverage. A superseded record names its successor, so a reader who arrives at a predecessor is pointed at the system that replaced it.

## Catalog sources for coverage audits

`directory/discovery-sources.json` holds authoritative announcement feeds that automation polls for launches. It is not the right home for a catalog, because its schema requires a feed and the updater treats every entry as a stream of dated items.

For checking coverage rather than detecting launches, use [models.dev](https://models.dev/api.json), a community-maintained database of inference providers and models published under an open license from [anomalyco/models.dev](https://github.com/anomalyco/models.dev). A pass on 2026-08-31 found 212 provider entries against 49 reviewed services. That difference overstates the gap: the catalog keys on API endpoints, so one operator appears several times across regional and subscription variants, and Alibaba alone accounts for six entries. Collapse those to service boundaries before treating an entry as a candidate, and treat the catalog as aggregated third-party data that locates candidates rather than as evidence, since every record still needs first-party terms and documentation.

### High-adoption discovery sweep

A 2026-08-31 sweep looked for widely adopted open-source systems the catalog does not hold, prompted by a question about forks and derivatives. Two findings shaped the method.

**Walking fork graphs does not work.** The seventy-three published repositories carry more than half a million forks between them, dominated by personal copies: sorting one popular project's forks by stars returned repositories with 584, 70, and 28 stars. More decisively, the derivative that prompted the question is not a fork in the platform's sense at all, so no amount of graph walking would reach it. Lineage is a review-time boundary question, not a discovery mechanism.

**Adoption finds candidates; the existing rules filter them.** Twenty banded searches keyed to the role vocabulary returned 327 repositories, 279 of them new, active, and not forks. Star count sorts attention but decides nothing: the highest-ranked results included a methodology, several skill libraries, an unrelated automation platform, a database, and an agent-managed museum exhibit. `CURATION.md` already excludes prompt templates, collections, and research inputs, and applying that plus the tool-and-plugin boundary removed the noise. Thirty survivors were queued.

Band the searches. A first pass with an unbanded top-thirty cut silently dropped a twenty-eight-thousand-star coding agent because larger repositories crowded the result window.

### Chinese-operator coverage

A 2026-08-31 pass compared the catalog against models.dev for Chinese operators. Thirty-five catalog entries collapsed to about thirteen operators once regional and subscription variants were folded in, confirming that the catalog keys on endpoints rather than on services.

Two boundary rules were already settled and held. A domestic platform operated by a different legal entity from its international sibling is a separate record: Volcengine Ark's own terms licence it for use only within mainland China, Zhipu's mainland platform and Z.ai are separate companies in separate jurisdictions, and SiliconFlow's international terms exclude users located in mainland China outright. Subscription tiers are not separate records, which the existing BytePlus boundary already stated. Region-scoped endpoints of one platform remain a trait rather than a record, as Alibaba Cloud Model Studio shows.

Remaining unreviewed operators from that comparison include Xiaomi, Bailing, and the long tail of aggregators that resell other aggregators, which needs a boundary rule of its own before any of them is reviewable.

## Research batches

Choose small batches with one coherent boundary question:

1. **Assistant boundary follow-up:** keep GroqChat provisional until first-party evidence establishes a durable end-user workspace distinct from Groq Playground and GroqCloud. Preserve consumer, enterprise, playground, model, API, and agent-mode boundaries rather than comparing transient model benchmarks.
2. **Managed agent platforms:** closed. Under [ADR 018](adr/018-operating-party-is-a-trait-not-a-role.md) the batch was dissolved and routed per record, and the last two are now reviewed. Salesforce Agentforce and the Meta Business Agent Platform are agent frameworks rather than orchestrators: Agentforce's subagents are categories of actions inside one agent rather than peers it delegates to, and Meta's platform coordinates nothing. Foundry Agent Service, Bedrock AgentCore, and the Gemini Enterprise Agent Platform are stateful agent runtimes; watsonx Orchestrate is a multi-agent orchestrator; Copilot Studio joined batch 10.
3. **Coding-agent second pass:** Cursor, GitHub Copilot coding agent, Jules, Roo Code, SWE-agent, Windsurf, and T3 Code. Replit Agent now establishes a vertically integrated managed-cloud baseline; resolve editor, cloud-delegation, and workflow boundaries without duplicating represented products.
4. **Proprietary memory and knowledge:** NotebookLM, Microsoft Recall, Limitless, and other products that provide a materially different ownership or governance boundary. Zep Cloud and Slite now establish managed agent-memory and self-maintaining knowledge baselines.
5. **Source-model diversity:** screenpipe, AFFiNE, Onyx, and Obsidian. Review product terms and operational evidence without treating license as eligibility.
6. **Thin operational roles:** browser/computer use, research, general work, coding workflows, context graphs, ambient capture, and human–agent bridges. Keep Pletor and Sylph provisional until their license or product-terms evidence meets the full curation standard.
7. **Specification follow-up:** identity and discovery now have OASF and ANP baselines; browser-native tools and agentic transactions now have WebMCP, AP2, UCP, and Commerce ACP baselines. Next evaluate cross-protocol authentication/authorization profiles, workflow-state exchange beyond task messaging, and conformance evidence without absorbing generic web standards.
8. **Instruction-convention follow-up:** evaluate Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as one bounded batch. Treat workflows, custom modes, and product configuration as separate boundaries rather than stretching the instruction-convention category.
9. **Superseded predecessors:** resolved by [ADR 016](adr/016-superseded-predecessors-keep-their-record.md), which adds the `superseded` status and a validated `superseded_by` link. AutoGen and Semantic Kernel are published under it. Apply the same treatment when a maintainer publishes a succession and the successor is already reviewed.
10. **Low-code agent builders:** done under [ADR 019](adr/019-authoring-surface-is-a-trait-not-a-role.md). Dify, Langflow, and Botpress Cloud are published as agent frameworks, Flowise as an archived one after its maintainers wound it down without naming a successor, and Copilot Studio as a multi-agent orchestrator because it coordinates other agents and escalates to people. A shared authoring surface did not make them alike, and `agent_interfaces` now carries that difference as a filter.
11. **Local-runtime passes two and three:** done. ONNX Runtime GenAI, Xinference, and OpenVINO Model Server closed the portable-library, gateway, and Intel/NPU gaps; MLC LLM, Qualcomm GenieX, and TensorRT-LLM extended execution to mobile, browser, and first-party NVIDIA serving. llamafile was screened out as packaging of the published llama.cpp record rather than a distinct execution boundary. Remaining gap: a proprietary or managed self-hosted gateway.
12. **Assistant regional follow-up:** Meta AI is now reviewed. Qwen Chat and Kimi remain unreviewed, and each needs its own product-terms and governance pass; do not infer an assistant's boundary from its provider's API record.
13. **Inference-service follow-up:** the routing-aggregator gap is closed. Nine records now join OpenRouter — Requesty, Eden AI, AI/ML API, Nano-GPT, TrustedRouter, and the Vercel and Cloudflare gateways as aggregators, Chutes as a managed host — and Unify is excluded after its product and its successor were both retired. Fee models were established for each but are deliberately absent from the records, since ADR 012 keeps volatile prices out of service scoring; where a fee bears on transparency it is recorded as documentation rather than as a price. Novita AI and Lambda Inference remain unreviewed for want of governing terms.
14. **Meta follow-up:** done. Meta Business AI is a marketing umbrella over advertising automation and creative tooling rather than a product. Its one operational product, the Meta Business Agent Platform, publishes real dated terms and is queued as a candidate in batch 2, because promoting it alone would settle that batch's role question by accident.

15. **Queue batch two — harnesses, chat clients, and code graphs:** done. Eight sweep candidates were reviewed against the boundary they each tested, and the star ranking inverted the substance ranking. Superpowers, the most-starred candidate in the sweep at 280,000 stars, is excluded: it declares no executable and no dependencies, and its session hook only prints a skill document as additional context. ruflo is published as a stateful agent runtime rather than the multi-agent orchestrator it markets, because the swarm engine it advertises is a dependency of neither the published package nor its command line. Orca, the least-starred, is the only one with implemented inter-agent handoff, and is published as the orchestrator. ECC is a coding-agent workflow, DeerFlow a stateful agent runtime, CodeGraph and GitNexus context graph engines, and LibreChat fills the thin multi-model chat-client role. GitNexus is the collection's first PolyForm Noncommercial record, which GitHub reports as having no license at all.
16. **Inference-service labs pass:** abliteration.ai is published as a direct model API. Its service type is a genuine editorial call, since it serves operator-derived weights it does not publish, and `model_sources` records only `first_party` for that reason. Liquid AI is not an inference service on its own statement that it does not offer a hosted API, reaching users instead through a gated playground, OpenRouter, Bedrock, and direct weight downloads — but it is not excluded either. It is a lab whose models a reader must serve themselves, which no collection currently represents, so `BACKLOG.md` carries that boundary question rather than recording a decision the Atlas has not made.

17. **Queue batch three — the memory and knowledge boundary:** done. OpenViking and Supermemory are agent memory services, Onyx an AI knowledge app, and AFFiNE a personal knowledge tool, so the sweep's proposed roles held for all four. Its source models did not. Onyx and AFFiNE each report no recognised license to automated detection while carrying a real proprietary tier, and Supermemory reports a permissive license over a repository that does not contain its memory engine at all — its whole tree is client libraries and applications, with no server and no container definition anywhere. The three errors all ran in the permissive direction, which is the concern the source-model diversity item was reaching for. OpenViking was independently confirmed as a selectable memory backend in the published DeerFlow record, which is what settled it as infrastructure rather than a product a person opens.
18. **Queue batch three — the derivative cluster:** done, and the expected shape did not hold. Of four candidates chosen as suspected derivatives, only oh-my-pi is one: it shares early history with the published Pi record and carries that author's copyright, while GitHub does not flag it as a fork. Codewhale is a rename of its own author's earlier project and Reasonix a self-rewrite on an orphan branch, so neither has an upstream to fold into; oh-my-claudecode is an independent port of a project the Atlas does not represent, which left the host-harness question rather than the derivative question to decide it. All four are published. The batch produced the rule itself, recorded as [ADR 020](adr/020-derivative-records-turn-on-operational-boundary.md).

19. **Queue batch four — the coding-agent second pass:** done for four of the six named candidates' cohort, and three of the four turned out to be winding down. Crush is published as the catalogue's first source-available coding agent, licensed on terms that bar competing commercial use and convert to permissive terms two years after each release. Qwen Code clears [ADR 020](adr/020-derivative-records-turn-on-operational-boundary.md) against its published upstream on five of the named fields. Continue and Roo Code are published as archived on their maintainers' own statements; Roo Code's documentation names a community fork and its origin project as alternatives rather than declaring a successor, so ADR 016 does not apply, and that fork is queued as a candidate. The add-on question [ADR 020](adr/020-derivative-records-turn-on-operational-boundary.md) reserved was not engaged: both extension-shipping candidates run their core outside the editor, one through a compatibility shim written for that purpose.
20. **Queue batch four — the research-agent role:** the role is sound but was over-applied once. Vane and dexter are published as research agents and deepagents as a framework, its own architecture document notwithstanding, because it owns a storage protocol, model harness profiles, and benchmark infrastructure of its own. STORM is excluded as a research artifact: its readme presents a research preview that cannot produce publication-ready output, it ships no tests at all, its package still declares alpha status, and its last substantive commit predates this review by more than a year. dexter is the catalogue's second `unclear` licence and the starker case — no licence file has ever existed in the repository, and a single readme sentence is the only artifact asserting terms.

21. **Queue batch five — the browser-agent role:** one publish, two exclusions, one hold. Skyvern is published as open core: every file in its repository is copyleft, and its own code comments say the anti-bot and captcha solvers are cloud overrides of open stubs that return nothing. Stagehand is excluded because its current major version deleted its agent loop on purpose; the migration guide says the orchestrator is gone and the control flow is the caller's, which leaves a driver library the Atlas has no role for. Agent S is excluded on the same test that excluded STORM, with one sharper tell: the loop lives in a demo command line, directly beneath a comment promising a confirmation prompt that does not exist. nanobrowser is a genuine agent held only because no deployment value describes a browser extension; that vocabulary gap is in the backlog.
22. **Queue batch five — the stateful-runtime role:** two publishes, one exclusion, one hold. CowAgent is the renamed chatgpt-on-wechat, and the rename changed nothing; the 2.0 agent core released ten weeks earlier is what earns the role, and it is one record under ADR 016. nanobot was queued as a framework from its tagline, but its readme and code say runtime, and it turned out to be the upstream of the agent module vendored into the published OpenViking record. herdr is excluded as a process supervisor that owns terminals rather than agents and makes no model calls. MindsHub is held: the repository is the former MindsDB database hollowed out to a superproject with no code of its own, the product lives in four submodules under three licences, and one of those licences has no identifier in the taxonomy.

For each batch, promote or exclude every reviewed candidate in the same change, update this snapshot only when counts materially change, and follow `CURATION.md` for evidence and scoring.
