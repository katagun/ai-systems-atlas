# Coverage

Use this document to choose research batches. The canonical project and candidate records remain the source of truth; this is a dated editorial snapshot, not another queue.

## What comprehensive means

AI Systems Atlas aims to be comprehensive within its declared operational scope, not an indiscriminate list of every model, API, prompt wrapper, or branded feature. Coverage is healthy when a user can compare materially different approaches within a supported role, understand source-model and licensing tradeoffs, and see important systems that failed review with a concrete reason.

The declared universe is deployable or directly usable memory, agent, and assistant systems. Providers, plain inference clients, model repositories, and observability-only services are adjacent ecosystem components. Specifications remain a separate unscored collection.

Measure coverage across three axes:

1. **Operational roles:** enough credible alternatives to expose real architectural choices.
2. **Source models:** open-source, mixed-source, open-core, source-available, and proprietary approaches where they materially exist.
3. **Ecosystem significance:** mature reference systems, important new designs, and provider-native approaches—not popularity alone.

Do not add a new family merely to fit a famous product. Add one only when its primary operational outcome cannot be scored coherently by an existing family.

## Snapshot — 2026-08-26

The reviewed catalog contains 64 systems: 25 memory systems, 36 agent systems, and 3 assistant systems. Fifty-four are open-source, one uses mixed open licenses, two are open-core, one is mixed-source, and six are proprietary. The provisional queue contains 107 records. The separate unscored collection contains 15 specifications spanning tool/data integration, agent interaction, agent–user and agent–client integration, project instructions, capabilities, and plugins.

| Role | Reviewed | Active | Coverage signal |
|---|---:|---:|---|
| Agent framework / SDK | 12 | 12 | Broad across provider-native, provider-published, provider-agnostic, and open-core approaches |
| Coding agent | 12 | 12 | Broad across local, self-hosted, and managed-cloud operation |
| Human-first PKM | 8 | 8 | Broad, but proprietary reference products remain provisional |
| AI knowledge app / RAG brain | 5 | 4 | Useful baseline; review enterprise/open-core alternatives |
| Retrieval infrastructure | 4 | 4 | Adequate baseline |
| Data-analysis / text-to-SQL agent | 3 | 2 | Improved; add distinct governed and enterprise approaches |
| Agent memory service | 3 | 3 | Improved; compare memory ownership, lifecycle, and retrieval intelligence |
| Ambient capture | 2 | 2 | Thin; source-model diversity is missing |
| Context graph engine | 2 | 2 | Thin |
| Multi-agent orchestrator | 2 | 2 | Thin relative to ecosystem size |
| Stateful agent runtime | 4 | 4 | Improved; compare persistence and execution-policy boundaries |
| Browser/computer agent | 1 | 1 | Priority gap |
| Coding-agent workflow | 1 | 1 | Priority gap |
| Human–agent memory bridge | 1 | 1 | Priority gap |
| Research agent | 1 | 1 | Priority gap |
| General AI assistant | 1 | 1 | New baseline; review distinct provider products without duplicating agent modes |
| Enterprise work assistant | 1 | 1 | New baseline; proprietary hyperscaler and SaaS diversity is a priority |
| Multi-model chat client | 1 | 1 | New baseline; review product depth and hosted/open-client boundaries |

Archived systems remain reviewed historical references but do not satisfy active-choice coverage.

## Research batches

Choose small batches with one coherent boundary question:

1. **Assistant second pass:** Claude.ai, Gemini Apps, Grok, GroqChat, and Microsoft 365 Copilot. Preserve product boundaries and compare the assistant product rather than transient model benchmarks.
2. **Managed agent platforms:** Microsoft Foundry Agent Service, Copilot Studio, Amazon Bedrock AgentCore, Gemini Enterprise Agent Platform, Salesforce Agentforce, and IBM watsonx Orchestrate.
3. **Coding-agent second pass:** Cursor, GitHub Copilot coding agent, Jules, Replit Agent, Roo Code, SWE-agent, Windsurf, and T3 Code. Resolve editor, cloud-delegation, and workflow boundaries without duplicating represented products.
4. **Proprietary memory and knowledge:** NotebookLM, Zep Cloud, Microsoft Recall, Limitless, and other products that provide a materially different ownership or governance boundary.
5. **Source-model diversity:** screenpipe, AFFiNE, Onyx, and Obsidian. Review product terms and operational evidence without treating license as eligibility.
6. **Thin operational roles:** browser/computer use, research, coding workflows, context graphs, ambient capture, and human–agent bridges.
7. **Specification second pass:** evaluate agent identity, discovery, authentication, and workflow exchange only when candidates answer a distinct integration question; avoid cataloging generic web standards merely because agents use them.
8. **Instruction-convention follow-up:** evaluate Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as one bounded batch. Treat workflows, custom modes, and product configuration as separate boundaries rather than stretching the instruction-convention category.

For each batch, promote or exclude every reviewed candidate in the same change, update this snapshot only when counts materially change, and follow `CURATION.md` for evidence and scoring.
