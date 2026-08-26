# Coverage

Use this document to choose research batches. The canonical project and candidate records remain the source of truth; this is a dated editorial snapshot, not another queue.

## What comprehensive means

AI Systems Atlas aims for representative decision coverage, not an indiscriminate list. Coverage is healthy when a user can compare materially different approaches within an operational role, understand source-model and licensing tradeoffs, and see important systems that failed review with a concrete reason.

Measure coverage across three axes:

1. **Operational roles:** enough credible alternatives to expose real architectural choices.
2. **Source models:** open-source, open-core, source-available, and proprietary approaches where they materially exist.
3. **Ecosystem significance:** mature reference systems, important new designs, and provider-native approaches—not popularity alone.

Do not add a new family merely to fit a famous product. Add one only when its primary operational outcome cannot be scored coherently as memory or agent work.

## Snapshot — 2026-08-25

The reviewed catalog contains 57 systems: 24 memory systems and 33 agent systems. Fifty-three are represented by open-source operational code, one is open-core, and three are proprietary. The provisional queue contains 94 records. The separate unscored collection contains eight specifications spanning tool/data integration, agent interaction, agent–user and agent–client integration, project instructions, capabilities, and plugins.

| Role | Reviewed | Active | Coverage signal |
|---|---:|---:|---|
| Agent framework / SDK | 9 | 9 | Broad; continue provider-native and open-core review |
| Coding agent | 12 | 12 | Broad across local, self-hosted, and managed-cloud operation |
| Human-first PKM | 8 | 8 | Broad, but proprietary reference products remain provisional |
| AI knowledge app / RAG brain | 5 | 4 | Useful baseline; review enterprise/open-core alternatives |
| Retrieval infrastructure | 4 | 4 | Adequate baseline |
| Data-analysis / text-to-SQL agent | 3 | 2 | Improved; add distinct governed and enterprise approaches |
| Agent memory service | 2 | 2 | Thin |
| Ambient capture | 2 | 2 | Thin; source-model diversity is missing |
| Context graph engine | 2 | 2 | Thin |
| Multi-agent orchestrator | 2 | 2 | Thin relative to ecosystem size |
| Stateful agent runtime | 4 | 4 | Improved; compare persistence and execution-policy boundaries |
| Browser/computer agent | 1 | 1 | Priority gap |
| Coding-agent workflow | 1 | 1 | Priority gap |
| Human–agent memory bridge | 1 | 1 | Priority gap |
| Research agent | 1 | 1 | Priority gap |

Archived systems remain reviewed historical references but do not satisfy active-choice coverage.

## Research batches

Choose small batches with one coherent boundary question:

1. **Provider-native and major frameworks:** Claude Agent SDKs, Google ADK, and Mastra. Compare who owns the agent loop, runtime dependency, permissions, state, and commercial boundary.
2. **Coding-agent second pass:** Cursor, GitHub Copilot coding agent, Jules, Replit Agent, Roo Code, SWE-agent, and Windsurf. Resolve editor, cloud-delegation, and research-harness boundaries without duplicating products already represented.
3. **Source-model diversity:** screenpipe, AFFiNE, Onyx, Obsidian, Microsoft Recall, and Limitless. Review product terms and operational evidence without treating license as eligibility.
4. **Thin agent roles:** browser/computer use, research, and coding workflows. Prefer candidates that create a genuinely different operational choice.
5. **Thin memory roles:** agent memory, context graphs, ambient capture, and human–agent bridges.
6. **Specification second pass:** evaluate OpenAPI, JSON-RPC, Arazzo, AIP, NLIP, and other agent-specific formats only when they answer a distinct integration question; avoid cataloging generic web standards merely because agents use them.

For each batch, promote or exclude every reviewed candidate in the same change, update this snapshot only when counts materially change, and follow `CURATION.md` for evidence and scoring.
