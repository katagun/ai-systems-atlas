# Coverage

Use this document to choose research batches. The canonical project and candidate records remain the source of truth; this is a dated editorial snapshot, not another queue.

## What comprehensive means

AI Systems Atlas aims to be comprehensive within its declared operational scope, not an indiscriminate list of every model, API, prompt wrapper, or branded feature. Coverage is healthy when a user can compare materially different approaches within a supported role, understand source-model and licensing tradeoffs, and see important systems that failed review with a concrete reason.

The operational-system universe is deployable or directly usable memory, agent, and assistant systems. Managed inference services form a separately scored collection with a service-specific rubric; specifications remain separate and unscored. Plain inference clients, model repositories, local runtimes, and observability-only services remain adjacent components unless a future collection defines their distinct user question and boundary.

Measure coverage across three axes:

1. **Operational roles:** enough credible alternatives to expose real architectural choices.
2. **Source models:** open-source, mixed-source, open-core, source-available, and proprietary approaches where they materially exist.
3. **Ecosystem significance:** mature reference systems, important new designs, and provider-native approaches—not popularity alone.

Do not add a new family merely to fit a famous product. Add one only when its primary operational outcome cannot be scored coherently by an existing family.

## Snapshot — 2026-08-28

The reviewed catalog contains 85 systems: 27 memory systems, 46 agent systems, and 12 assistant systems. Fifty-eight are open-source, two use mixed open licenses, two are open-core, one is mixed-source, one is source-available, and twenty-one are proprietary. The provisional queue contains 102 records. The separate collections contain 21 unscored specifications plus 36 scored inference services spanning direct APIs, cloud model platforms, managed hosting, and routing aggregation across North American, European, Chinese, and other international operators.

| Role | Reviewed | Active | Coverage signal |
|---|---:|---:|---|
| General work agent | 3 | 3 | Improved across research-first, office-work, and media-production approaches; keep reviewing control, recovery, permission, and execution boundaries |
| Agent framework / SDK | 12 | 12 | Broad across provider-native, provider-published, provider-agnostic, and open-core approaches |
| Coding agent | 16 | 16 | Broad across local, self-hosted, managed-cloud, terminal-native, and community-fork operation |
| Human-first PKM | 8 | 8 | Broad, but proprietary reference products remain provisional |
| AI knowledge app / RAG brain | 6 | 5 | Improved with a proprietary self-maintaining knowledge product; review open-core alternatives |
| Retrieval infrastructure | 4 | 4 | Adequate baseline |
| Data-analysis / text-to-SQL agent | 3 | 2 | Improved; add distinct governed and enterprise approaches |
| Agent memory service | 4 | 4 | Improved with separate open-engine and managed-service boundaries; compare ownership, lifecycle, governance, and retrieval intelligence |
| Ambient capture | 2 | 2 | Thin; source-model diversity is missing |
| Context graph engine | 2 | 2 | Thin |
| Multi-agent orchestrator | 2 | 2 | Thin relative to ecosystem size |
| Stateful agent runtime | 5 | 5 | Improved with a self-editing personal-agent runtime; compare persistence and execution-policy boundaries |
| Browser/computer agent | 2 | 2 | Improved open baseline; desktop reliability and sandbox boundaries still need broader comparison |
| Coding-agent workflow | 1 | 1 | Priority gap |
| Human–agent memory bridge | 1 | 1 | Priority gap |
| Research agent | 2 | 2 | Improved with a source-available executable-evidence approach; broader production evidence remains thin |
| General AI assistant | 7 | 7 | Representative provider baseline; add products only when their workspace, governance, or regional ecosystem is materially distinct |
| Enterprise work assistant | 2 | 2 | Improved Microsoft/AWS baseline; broader enterprise SaaS diversity remains a priority |
| Multi-model chat client | 2 | 2 | Improved across conventional and privacy-oriented hosted approaches; open-client boundaries remain thin |

Archived systems remain reviewed historical references but do not satisfy active-choice coverage.

## Research batches

Choose small batches with one coherent boundary question:

1. **Assistant boundary follow-up:** keep GroqChat provisional until first-party evidence establishes a durable end-user workspace distinct from Groq Playground and GroqCloud. Preserve consumer, enterprise, playground, model, API, and agent-mode boundaries rather than comparing transient model benchmarks.
2. **Managed agent platforms:** Microsoft Foundry Agent Service, Copilot Studio, Amazon Bedrock AgentCore, Gemini Enterprise Agent Platform, Salesforce Agentforce, and IBM watsonx Orchestrate.
3. **Coding-agent second pass:** Cursor, GitHub Copilot coding agent, Jules, Roo Code, SWE-agent, Windsurf, and T3 Code. Replit Agent now establishes a vertically integrated managed-cloud baseline; resolve editor, cloud-delegation, and workflow boundaries without duplicating represented products.
4. **Proprietary memory and knowledge:** NotebookLM, Microsoft Recall, Limitless, and other products that provide a materially different ownership or governance boundary. Zep Cloud and Slite now establish managed agent-memory and self-maintaining knowledge baselines.
5. **Source-model diversity:** screenpipe, AFFiNE, Onyx, and Obsidian. Review product terms and operational evidence without treating license as eligibility.
6. **Thin operational roles:** browser/computer use, research, general work, coding workflows, context graphs, ambient capture, and human–agent bridges. Keep Pletor and Sylph provisional until their license or product-terms evidence meets the full curation standard.
7. **Specification follow-up:** identity and discovery now have OASF and ANP baselines; browser-native tools and agentic transactions now have WebMCP, AP2, UCP, and Commerce ACP baselines. Next evaluate cross-protocol authentication/authorization profiles, workflow-state exchange beyond task messaging, and conformance evidence without absorbing generic web standards.
8. **Instruction-convention follow-up:** evaluate Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as one bounded batch. Treat workflows, custom modes, and product configuration as separate boundaries rather than stretching the instruction-convention category.

For each batch, promote or exclude every reviewed candidate in the same change, update this snapshot only when counts materially change, and follow `CURATION.md` for evidence and scoring.
