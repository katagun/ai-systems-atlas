# Local runtime curation

Use this guide for self-operated software that executes model inference on infrastructure the user controls. Managed services follow [`INFERENCE_SERVICES.md`](INFERENCE_SERVICES.md); operational memory, agent, and assistant products follow [`CURATION.md`](CURATION.md); protocols and conventions follow [`SPECIFICATIONS.md`](SPECIFICATIONS.md).

## Inclusion boundary

Add a record to `directory/local-runtimes.json` only when all of the following are true:

1. a named software runtime executes model inference on hardware the user operates;
2. no third party holds the serving contract for that execution path;
3. authoritative sources establish at least one accelerator, model format, and API style;
4. accelerator, format, serving, deployment, and management claims can be stated without extrapolating from a different product, a fork, or an unreleased branch; and
5. authoritative license or terms sources establish a reviewed `source_model` and complete `licenses` list, with dated product evidence.

The record represents the runtime, not its maintainer, its model catalog, or a service built on it. Ollama is a runtime; Ollama Cloud is a managed inference service under a separate record. Text Generation Inference is a runtime; Hugging Face Inference Endpoints is a managed service. Each record names the adjacent boundary in prose.

Do not include model weights or families, managed inference services, inference client SDKs, proxies, routing libraries, vector stores, retrieval infrastructure, or training and fine-tuning frameworks. Inference execution on user-controlled hardware is the gate.

### Substrate and modality

A general-purpose machine-learning framework is out even though it executes inference. PyTorch, TensorFlow, JAX, and Apache TVM are the layer published runtimes are built on, and recording both would capture one execution stack twice. Ask what the software is for: if serving inference on the operator's hardware is the product, it is a candidate; if serving is one capability of something built to train models, it is not. A framework's dedicated serving product is a separate boundary and qualifies on its own terms.

Modality is not the gate. A runtime built for speech, vision, or embeddings is eligible on the same test as one built for language models, and is scored against the same profile. Admitting a modality obliges you to extend `runtime_model_formats`, and where needed `runtime_accelerators`, in the same change: filters are taxonomy-driven, so a record whose formats have no identifiers cannot be found by anyone filtering on format. Do not stretch an existing identifier to avoid the work. See [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md) and [ADR 017](adr/017-local-runtime-eligibility-ignores-modality.md).

### Runtime or assistant

Some runtimes ship a graphical chat interface. Classify by primary operational outcome.

If the product exists to run models on the user's hardware and the chat window is how that capability is exercised, it is a runtime. If it owns a broad conversational workspace with durable context, connected information, and governed work assistance — the assistant gate in `CURATION.md` — it is an `assistant_system`.

A bundled interface is not evidence of an assistant, and a headless server is not evidence of a runtime. Record the reasoning in `runtime_boundary`, not only in the decision record.

## Classification

Choose exactly one runtime type from `directory/taxonomy.json`. Record every reviewed accelerator, model format, serving mode, API style, and deployment surface that is material to the represented runtime.

API compatibility is a documented trait, not an equivalence guarantee. `openai_compatible` means the runtime claims compatibility with some OpenAI API conventions; it does not imply complete endpoint, parameter, tool, or response parity. Runtimes reuse the same API-style taxonomy as inference services, because the trait describes the same thing on both sides of the boundary.

Accelerator coverage records execution paths the project documents and supports. A community build, an unmerged branch, or a third-party fork is not the reviewed runtime's coverage.

## Scoring

Local runtimes use one dedicated profile. It is comparable only inside this collection; it is not comparable to memory, agent, assistant, or inference-service scores.

| Dimension | Weight | What earns a high score |
|---|---:|---|
| Hardware and accelerator coverage | 16% | Documented and supported CPU, CUDA, ROCm, Metal, Vulkan, NPU, and multi-GPU execution paths |
| Model format support | 15% | Breadth of weight formats, quantization schemes, and supported model architectures |
| Serving and concurrency | 15% | Continuous batching, parallel requests, KV-cache management, and distributed serving capability |
| API interoperability | 13% | Well-documented native and compatible endpoints, embeddings, tool calling, and structured output |
| Deployment and operations | 13% | Install paths, containers, orchestration, resource limits, authentication, and upgrade practice |
| Model lifecycle management | 10% | Fetching, pinning, custom imports, adapters, storage control, and removal |
| Observability and control | 10% | Metrics, health endpoints, logs, request introspection, and administrative surfaces |
| Documentation transparency | 8% | Specific, current, authoritative documentation for the above, including stated limits |

Score each dimension from 0 to 10 using the anchors in [`INFERENCE_SERVICES.md`](INFERENCE_SERVICES.md#scoring):

- **0–2:** absent, non-operational, or too opaque to support a useful claim;
- **3–4:** minimal capability or public evidence, with major limitations;
- **5–6:** a documented baseline with material gaps or configuration-specific uncertainty;
- **7–8:** strong capability with clear controls and bounded exceptions; and
- **9–10:** unusually comprehensive, explicit, and mature coverage of the dimension.

Use decimal values when evidence falls between anchors. Missing evidence lowers the relevant score; never substitute maintainer reputation, repository popularity, or a downstream product's capabilities. Compute `overall` as the weighted sum rounded to two decimals.

The profile excludes model intelligence, tokens per second, time to first token, benchmark rank, and hardware cost. A throughput figure describes a model, a quantization, a batch size, and an accelerator — not the runtime. A deliberately narrow runtime scores low on dimensions it never set out to address while remaining the correct choice for its use, so runtime type, accelerator, model format, and API style stay primary decision tools.

## Evidence and freshness

Use authoritative project documentation, the runtime's own repository, and governing license or product terms. Review the license file and its component and path scope; a README badge and GitHub's detected SPDX value help locate evidence but do not replace it. Pin immutable Git blobs where available.

Runtime capabilities change faster than service terms. Every claim is dated through `verified_at` and is a statement about the reviewed version, not a durable property. State configuration-specific exceptions in prose rather than compressing them into a misleading trait: accelerator support, quantization coverage, and batching behavior often vary by build, platform, backend, and model architecture.

Do not copy benchmark tables, throughput measurements, or hardware recommendations expressed as performance claims. `hardware_requirements` records what the documentation states is needed to run, not how fast it runs.

`stars` and `stars_verified_at` are the one piece of automation-refreshed live metadata this collection carries. `scripts/update_directory.py` refreshes them from GitHub for every record with a `repo`, the same way it refreshes `projects.json`. They are descriptive only: never weigh them, or let their absence lower a dimension score. The scoring rubric above already excludes repository popularity by design, per [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md).

## Coverage discovery

No single external list defines this universe, and the available ones count different units. Inference-client adapter lists mix managed services with runtimes and compatibility aliases. Model hubs list integration partners. Package registries count distributions rather than projects.

Build the discovery union, normalize aliases to a named runtime boundary, then apply the inclusion test above. Use ecosystem catalogs only to find candidates; promotion requires first-party documentation and license evidence. Coverage is representative of material execution choices — desktop runner, server engine, embedded library, and compatibility gateway — not a claim that every wrapper or distribution has been enumerated.

## Review workflow

1. Establish the exact runtime and maintainer boundary, and identify any adjacent service or assistant record.
2. Review authoritative license sources, understand their component scope, and pin Git blobs where available.
3. Review current documentation for accelerators, formats, serving, API surface, deployment, and model management.
4. Classify type, accelerators, model formats, serving modes, API styles, and deployment surfaces from those sources.
5. Write boundary, model management, hardware requirements, operational controls, strengths, and tradeoffs with explicit limits.
6. Score every dimension from the same evidence, calculate the weighted overall, and check that no value imports model quality, throughput, or popularity.
7. Add dated evidence, then run synchronization and the complete verification suite.
8. Exercise search, every local-runtime filter, score sorting, comparison, and the detail dialog in a browser.

Local runtimes use a dedicated score profile and default to score sorting inside their Directory scope. Mixed Directory browsing hides every numeric score. See [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md), [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md), and [ADR 014](adr/014-comparisons-are-scoped-to-one-score-profile.md).
