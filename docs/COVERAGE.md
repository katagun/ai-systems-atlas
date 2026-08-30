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

The reviewed catalog contains 91 systems: 27 memory systems, 51 agent systems, and 13 assistant systems. Sixty-two are open-source, three use mixed open licenses, two are open-core, one is mixed-source, one is source-available, and twenty-two are proprietary. Two records are archived and two are superseded, so 87 satisfy active-choice coverage. The provisional queue contains 100 records. The separate collections contain 21 unscored specifications, 39 scored inference services spanning direct APIs, cloud model platforms, managed hosting, and routing aggregation across North American, European, Chinese, and other international operators, and 13 scored local runtimes.

### Local runtimes

The local-runtime collection covers self-operated inference software under [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md). Its thirteen records span three desktop runners, four server engines, four embedded libraries, and two compatibility gateways, across ten open-source projects, two mixed-source products, and one open-core engine.

| Runtime type | Reviewed | Coverage signal |
|---|---:|---|
| Desktop runner | 3 | Adequate across an open runner, a proprietary application, and an on-device NPU product |
| Server engine | 4 | Broad across accelerator-backed serving, an Intel and NPU path, and a first-party NVIDIA engine |
| Embedded library | 4 | Adequate across GGUF, Apple silicon, portable ONNX, and compiled mobile and browser targets |
| Compatibility gateway | 2 | Improved; both reviewed gateways are open source, so a proprietary or managed self-hosted gateway remains unreviewed |

Execution now reaches past the desktop and the single server: phones, embedded boards, and the browser are represented, alongside NPU, OpenCL, WebGPU, DirectML, and ONNX paths.

Accelerator coverage now spans CPU, CUDA, ROCm, Metal, Vulkan, SYCL, NPU, and DirectML paths, and format coverage includes ONNX alongside GGUF, safetensors, MLX, and the quantized schemes. Coverage is representative of material execution choices rather than exhaustive. Text Generation Inference was screened and excluded because its repository is archived. Jan was screened and routed to the candidate queue as an assistant, because conversations, projects, assistants, agents, and connectors place it on the assistant side of the ADR 015 runtime test.

| Role | Reviewed | Active | Coverage signal |
|---|---:|---:|---|
| General work agent | 3 | 3 | Improved across research-first, office-work, and media-production approaches; keep reviewing control, recovery, permission, and execution boundaries |
| Agent framework / SDK | 17 | 15 | Broad across provider-native, provider-published, provider-agnostic, open-core, and auto-optimizing approaches; two Microsoft predecessors are reviewed but superseded |
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
| General AI assistant | 9 | 9 | Representative provider baseline now including a European-governed product; add others only when their workspace, governance, or regional ecosystem is materially distinct |
| Enterprise work assistant | 2 | 2 | Improved Microsoft/AWS baseline; broader enterprise SaaS diversity remains a priority |
| Multi-model chat client | 2 | 2 | Improved across conventional and privacy-oriented hosted approaches; open-client boundaries remain thin |

Archived and superseded systems remain reviewed historical references but do not satisfy active-choice coverage. A superseded record names its successor, so a reader who arrives at a predecessor is pointed at the system that replaced it.

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
9. **Superseded predecessors:** resolved by [ADR 016](adr/016-superseded-predecessors-keep-their-record.md), which adds the `superseded` status and a validated `superseded_by` link. AutoGen and Semantic Kernel are published under it. Apply the same treatment when a maintainer publishes a succession and the successor is already reviewed.
10. **Low-code agent builders:** evaluate Dify, Langflow, Flowise, and Botpress Cloud as one batch whose single question is whether a visual builder is an agent framework or a multi-agent orchestrator. Do not resolve that boundary inside a code-first SDK batch.
11. **Local-runtime passes two and three:** done. ONNX Runtime GenAI, Xinference, and OpenVINO Model Server closed the portable-library, gateway, and Intel/NPU gaps; MLC LLM, Qualcomm GenieX, and TensorRT-LLM extended execution to mobile, browser, and first-party NVIDIA serving. llamafile was screened out as packaging of the published llama.cpp record rather than a distinct execution boundary. Remaining gap: a proprietary or managed self-hosted gateway.
12. **Assistant regional follow-up:** Qwen Chat, Kimi, and Meta AI remain unreviewed. Each needs its own product-terms and governance pass; do not infer an assistant's boundary from its provider's API record.
13. **Inference-service follow-up:** Novita AI and Lambda Inference were screened but not promoted because one documentation pass did not establish their retention, residency, and delivery boundaries. Revisit with governing terms in hand.

For each batch, promote or exclude every reviewed candidate in the same change, update this snapshot only when counts materially change, and follow `CURATION.md` for evidence and scoring.
