# ADR 015: Local runtimes are self-operated execution records

**Status:** Amended by [ADR 017](017-local-runtime-eligibility-ignores-modality.md)

ADR 017 preserves this record's boundary, purpose test, and exclusions. It settles separately whether the kind of model a runtime executes affects eligibility, and adds the vocabulary obligation that follows.

## Context

[ADR 010](010-inference-services-are-unscored-service-records.md) separated managed inference services from models, companies, and local runtimes. It excluded local inference runtimes by name — Ollama, vLLM, llama.cpp, and similar software — on the correct ground that a deployable runtime is not a managed service. It also anticipated the gap that exclusion leaves: "A self-hosted runtime may warrant a future operational collection, but it is not a managed inference service merely because it implements an API-compatible endpoint."

That gap is now the larger of the two. Choosing where inference runs is a routine operational decision, and for a growing share of users the answer is their own hardware. Those users compare accelerator support, weight formats, batching behavior, endpoint compatibility, deployment surface, and model management. None of those properties belong to a managed service, none are scored by the `inference_service` profile, and none are expressible through the `provider_relationship` and `model_backends` project traits, which describe a system's relationship to a provider rather than the execution software itself.

Nor can a runtime be absorbed into an existing system family. A runtime does not preserve durable knowledge, does not plan and act through tools, and does not own a conversational workspace. Forcing one into `memory_system`, `agent_system`, or `assistant_system` would break the operational taxonomy the same way [ADR 008](008-specifications-are-unscored-artifacts.md) declined to force protocols into it.

[ADR 013](013-distinct-collections-share-one-directory-surface.md) established the condition under which a new collection may join the Directory: it must retain an explicit schema, boundary, and comparison policy. This record supplies all three.

## Decision

Publish `directory/local-runtimes.json` as an independent canonical collection with a dedicated `local_runtime` score profile.

This decision **amends ADR 010** rather than overturning it. ADR 010's conclusion stands: a local runtime is not a managed inference service, and it does not become one by exposing an API-compatible endpoint. ADR 015 supplies the separate operational collection that ADR 010 deferred.

### Unit of curation

A named, self-operated software runtime that executes model inference on infrastructure the user controls. The user supplies the hardware and operates the process; no third party holds the serving contract.

That last clause is the whole boundary. A managed service is evaluated on another organization's governance, regions, and capacity commitments. A runtime is evaluated on what it lets you run and how well it serves it. The two cannot share a rubric because they do not share a subject.

Each record must:

- identify the maintainer, runtime type, accelerators, model formats, serving modes, API styles, and deployment surfaces;
- state model management, hardware requirements, and operational controls in prose with explicit limits;
- record every material license, one source-model classification, and scoped license evidence;
- distinguish strengths from tradeoffs; and
- name the boundary against any adjacent service, assistant, or library record.

### Exclusions

- **Model weights, families, and catalogs:** a runtime is not the models it runs.
- **Managed inference services,** including a vendor's hosted tier of its own runtime. These remain inference-service records under ADR 010 and [ADR 012](012-inference-services-use-a-dedicated-score-profile.md).
- **Inference client SDKs, proxies, and routing libraries:** calling an endpoint is not operating one.
- **Vector stores and retrieval infrastructure:** these remain scored systems under the `retrieval_infrastructure` role.
- **Training and fine-tuning frameworks:** inference execution is the gate.
- **General-purpose machine-learning frameworks and tensor libraries,** resolved by the substrate test below.
- **Assistants that bundle a runtime,** resolved by the test below.

### The substrate test

A framework that runtimes are built on is not itself a member of this collection.

PyTorch, TensorFlow, JAX, and Apache TVM all execute model inference on hardware the user controls, so the unit of curation above does not exclude them on its face. They are still out, because serving inference is not what they are for. Their primary outcome is building and training models, and inference is one capability among many rather than the product.

Admitting them would also break the collection's structure rather than extend it. Several published records are built on these frameworks: TensorRT-LLM is architected on PyTorch, MLX LM sits on the MLX array framework, and MLC LLM compiles through Apache TVM. A collection that contained both a runtime and the framework beneath it would be recording one execution stack twice, and every record would be partly a duplicate of the substrate entry.

The test is therefore purpose, not capability. Ask what the software is for. If serving inference on the operator's hardware is the product, it is a candidate. If serving is a capability of something built to do a different job, the record belongs to that job's collection or to no collection at all.

A framework's dedicated serving product is a separate boundary and can qualify on its own. TensorFlow Serving exists to serve trained models and is judged on its own terms; the TensorFlow framework is not.

### Modality

The unit of curation says model inference without naming a model type. Whether that omission is an eligibility criterion is settled by [ADR 017](017-local-runtime-eligibility-ignores-modality.md), which holds that modality is not a gate and records the vocabulary obligation that follows from admitting one.

The purpose test above still governs. A general framework is not admitted merely because it serves the same modality as a published runtime.

### Runtime versus assistant

Classify by primary operational outcome. If the product exists to run models on the user's hardware, and its chat window is how that capability is exercised, it is a runtime. If it owns a broad conversational workspace with durable context, connected information, and governed work assistance — the assistant gate in [`docs/CURATION.md`](../CURATION.md) — it is an `assistant_system`.

A bundled graphical interface is not itself evidence of an assistant, and a headless server is not itself evidence of a runtime. The reasoning must appear in each record's boundary prose, not only here.

### The Ollama split

`ollama` is a local-runtime record. `ollama-cloud` is an inference-service record whose operator is Ollama. Both are published, and each names the other in its boundary prose.

This is the same discipline `docs/CURATION.md` already requires when one vendor ships an assistant, a coding agent, and an SDK. It is recorded here because it is the clearest demonstration that the runtime boundary is real: the same organization can operate on both sides of it, and the two records answer different questions.

### Score profile

Every reviewed runtime carries the `local_runtime` profile. Scores run from 0 to 10 with the weighted dimensions:

- hardware and accelerator coverage: 16%;
- model format support: 15%;
- serving and concurrency: 15%;
- API interoperability: 13%;
- deployment and operations: 13%;
- model lifecycle management: 10%;
- observability and control: 10%; and
- documentation transparency: 8%.

The overall is the weighted sum rounded to two decimals. Dimension values use the common anchors documented in [`docs/INFERENCE_SERVICES.md`](../INFERENCE_SERVICES.md), reused deliberately rather than restated in a second vocabulary that would drift from the first.

The profile deliberately excludes model intelligence, tokens per second, time to first token, benchmark rank, hardware cost, and repository popularity.

This exclusion carries more weight here than it did in ADR 012. Runtimes are the most benchmark-contested category in the ecosystem, and a throughput figure is a function of model, quantization, batch size, sequence length, and accelerator — none of which the record owns. Publishing one as reviewed editorial truth would be a measurement of a test rig, not a property of the software. Every dimension above scores a capability the documentation establishes.

Scores are comparable only inside this collection. Mixed Directory browsing hides them, per ADR 013.

Classification filters remain first-class. A deliberately narrow runtime — an embedded library with no serving layer, a desktop runner with no orchestration — will score low on dimensions it never set out to address while remaining the correct choice for its use. Runtime type, accelerator, model format, and API style stay primary decision tools.

## Consequences

- Users can compare self-operated execution software without conflating it with managed services or with the models it runs.
- One organization can hold records in two collections when it genuinely operates on both sides of the boundary, without either record absorbing the other's claims.
- The Atlas publishes four collections. Systems, inference services, and local runtimes share the Directory surface under ADR 013; specifications remain a sibling view under ADR 008.
- Comparison follows [ADR 014](014-comparisons-are-scoped-to-one-score-profile.md): selection is available inside the `local_runtime` profile and never across profiles or in mixed browsing.
- Runtime capability claims change faster than service terms. Every record carries `verified_at`, and curation must revisit documentation rather than assume a reviewed capability persists.
- Local runtimes carry inline scoped license evidence in the manner of specifications. They stay outside `directory/license-evidence.json`, whose one-entry-per-project invariant is keyed on `project_id`, and outside the [ADR 005](005-fail-closed-license-drift.md) project drift machinery.
- Changing a dimension or weight requires a taxonomy and documentation change plus recomputation of every local-runtime score.
- The substrate test keeps the collection one layer deep. A framework beneath a published runtime is out, while that framework's dedicated serving product is judged on its own terms, so an execution stack is never recorded twice.
- Leaving modality open is settled by [ADR 017](017-local-runtime-eligibility-ignores-modality.md), which admits speech, vision, and embedding runtimes on the same purpose test and requires the classification vocabulary to be extended alongside.
- Adding a fifth collection requires its own decision record and the ADR 013 conditions; the existence of a fourth is not a precedent for admitting adjacent software by analogy.
