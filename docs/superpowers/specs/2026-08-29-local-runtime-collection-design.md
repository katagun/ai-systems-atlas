# Design: local-runtime collection, Ollama Cloud, and the SylphAI batch

**Date:** 2026-08-29
**Status:** Approved design, pending implementation plan

## Problem

Three gaps sit behind one request.

1. **Ollama has no representation.** [ADR 010](../../adr/010-inference-services-are-unscored-service-records.md) excludes local inference runtimes from the inference-service collection by name — Ollama, vLLM, llama.cpp — because a deployable runtime is not a managed service. [`docs/INFERENCE_SERVICES.md`](../../INFERENCE_SERVICES.md) anticipates that "a self-hosted runtime may warrant a future operational collection," and [`BACKLOG.md`](../../../BACKLOG.md) gates that reassessment on concrete user questions. The question is now concrete: users choosing where inference runs need to compare self-operated runtimes on the same evidence discipline the Atlas applies everywhere else.
2. **Ollama also operates a managed service.** Ollama Cloud is a hosted inference tier under Ollama's own operator boundary. It passes the existing inference-service inclusion gate today and is simply missing.
3. **The SylphAI products are absent,** as are several assistants and agent frameworks already sitting unreviewed in `directory/candidates.json`.

## Decisions

### 1. A fourth collection: local runtimes

Publish `directory/local-runtimes.json` as an independent canonical collection with a dedicated score profile, recorded in a new **ADR 015**.

**Unit of curation:** a named, self-operated software runtime that executes model inference on infrastructure the user controls. The user supplies the hardware and operates the process; no third party holds the serving contract. That axis is what separates a runtime from a managed service, and it is why the two cannot share a rubric — a managed service is scored on another party's governance and regions, a runtime on what it lets you run and how well it serves it.

ADR 015 **amends** ADR 010 rather than overturning it. ADR 010's exclusion remains correct: a runtime is not a managed inference service. ADR 015 supplies the separate collection ADR 010 left open. ADR 010 gains an `Amended by` note in the same form it already carries for ADR 012 and ADR 013.

**In scope:** desktop and CLI model runners, inference server engines, embedded inference libraries, and self-hosted compatibility gateways over local weights.

**Out of scope, stated in the ADR:**

- model weights, model families, and catalogs — a runtime is not the models it runs;
- managed inference services, including a vendor's hosted tier of its own runtime;
- inference client SDKs, proxies, and routing libraries — calling an endpoint is not operating one;
- vector stores and retrieval infrastructure, which remain scored systems under `retrieval_infrastructure`;
- training and fine-tuning frameworks — inference execution is the gate; and
- assistants that bundle a runtime, resolved by the test below.

**Runtime-versus-assistant test.** Classify by primary operational outcome. If the product exists to run models on the user's hardware and its chat window is how that capability is exercised, it is a runtime. If it owns a broad conversational workspace with durable context and connected information — the assistant gate in [`docs/CURATION.md`](../../CURATION.md) — it is an `assistant_system`. LM Studio and Jan fall on the runtime side. A future product may fall on the other, and belongs in the assistant family when it does.

**The Ollama split is the boundary's proof.** `ollama` is a runtime record; `ollama-cloud` is an inference-service record whose operator is Ollama. Each record's boundary prose names the other explicitly. This applies the discipline `CURATION.md` already requires for a vendor's assistant, coding agent, and SDK.

### 2. The `local_runtime` score profile

Stored as a top-level `local_runtime_score_profile` key in `directory/taxonomy.json`, matching the shape of `inference_service_score_profile`. The `score_profiles` enum stays memory/agent/assistant.

| Dimension | Weight | What earns a high score |
|---|---:|---|
| `hardware_accelerator_coverage` | 16% | Documented CPU, CUDA, ROCm, Metal, Vulkan, NPU, and multi-GPU execution paths |
| `model_format_support` | 15% | Breadth of weight formats, quantization schemes, and supported model architectures |
| `serving_concurrency` | 15% | Continuous batching, parallel requests, KV-cache management, distributed serving |
| `api_interoperability` | 13% | Documented native and compatible endpoints, embeddings, tool calling, structured output |
| `deployment_operations` | 13% | Install paths, containers, orchestration, resource limits, authentication, upgrade practice |
| `model_lifecycle_management` | 10% | Fetching, pinning, custom imports, adapters, storage control, removal |
| `observability_control` | 10% | Metrics, health endpoints, logs, request introspection, administrative surfaces |
| `documentation_transparency` | 8% | Specific, current, authoritative documentation for the above, including stated limits |

Weights total 1.00. `overall` is the weighted sum rounded to two decimals. Dimension values use the 0–2 / 3–4 / 5–6 / 7–8 / 9–10 anchors already defined in [`docs/INFERENCE_SERVICES.md`](../../INFERENCE_SERVICES.md), reused verbatim rather than restated in a second vocabulary.

**Excluded from the profile, written into ADR 015:** model intelligence, tokens per second, time to first token, benchmark rank, hardware cost, and repository popularity. This exclusion matters more here than for inference services, because runtimes are the most benchmark-baited category in the ecosystem and a throughput figure is a function of model, quantization, batch size, and accelerator — none of which the record owns. Every dimension scores a capability the documentation establishes, never a measurement.

Scores are comparable only inside this collection. Mixed Directory browsing hides them, per ADR 013.

### 3. Canonical schema

Envelope: `{"version": "1.0", "verified_at": <ISO date>, "runtimes": [...]}`.

Record fields:

```
id, name, maintainer, runtime_type, repo, url, description,
runtime_boundary,
accelerators[], model_formats[], serving_modes[], api_styles[], deployment_surfaces[],
model_management, hardware_requirements, operational_controls,
strengths[], tradeoffs[],
licenses[], source_model, license_note, license_evidence[],
score_profile: "local_runtime", score{eight dimensions + overall},
evidence[], verified_at
```

New taxonomy enum groups:

- `local_runtime_types`: `desktop_runner`, `server_engine`, `embedded_library`, `compatibility_gateway`;
- `runtime_accelerators`;
- `runtime_model_formats`;
- `runtime_serving_modes`; and
- `runtime_deployment_surfaces`.

All five groups are registered in the `TAXONOMY_GROUPS` tuple in `scripts/validate_directory.py` so they receive the same duplicate-id and string-id checks as every other group.

`api_styles` **reuses the existing `inference_api_styles` group**. A runtime exposing an OpenAI-compatible endpoint is the same documented trait as a service exposing one; forking the enum would let the two drift for no reason. `licenses` and `source_model` reuse the existing project enums, so a proprietary desktop runner and an MIT library coexist in one collection without special cases.

**Licenses follow the specification precedent, not the project one.** Runtimes carry inline `license_evidence` with scoped Git blobs, as `directory/specifications.json` does. They stay out of `directory/license-evidence.json` and out of the ADR 005 fail-closed drift machinery and `scripts/update_directory.py`. Rationale: `license-evidence.json` is keyed on `project_id` under a one-entry-per-project invariant the validator enforces (85 entries for 85 projects). Joining it would require either weakening that invariant or teaching the whole drift pipeline a second record type — real cost, no benefit, since the evidence discipline is identical either way.

### 4. Shared validator primitives

`scripts/validate_directory.py` gains three extractions, each replacing existing duplication rather than anticipating future need:

- `validate_collection_envelope(data, name, version, key, errors) -> list` — the version, `verified_at`, and present-and-unique-ids check currently written out for projects, specifications, and inference services;
- `validate_score_profile(taxonomy, key, profile_id, errors) -> dict[str, float]` — currently bespoke for inference services, gaining its second caller; and
- `validate_record_score(record, dimensions, profile_id, prefix, errors)` — the weighted-sum-equals-overall check.

Canonical schemas and per-collection validator blocks stay separate, as ADR 013 requires. The runtime block validates enum membership, boundary prose, inline license evidence including blob-SHA format, and dated evidence.

**One new cross-collection check:** no `id` may appear in more than one collection. This is what keeps `ollama` and `ollama-cloud` honest and prevents a future record from silently existing twice.

`local-runtimes.json` is added to `PUBLISHED_DATA` in both `scripts/validate_directory.py` and `scripts/sync_web_data.py`, and to the published-file hard rule in [`AGENTS.md`](../../../AGENTS.md).

### 5. Web surface

**Fourth Directory scope.** `["all", "systems", "inference", "runtimes"]` in `setDirectoryCollection`, a fourth switcher button and `#runtime-collection-count` in `web/index.html`, and a three-way sum for `#all-collection-count`. The `collection` URL parameter already round-trips an arbitrary string; scoped URLs need no new plumbing.

**`web/app-core.js` extraction.** `filterScoredCollection(records, filters, {searchFields, facets, sort})`, where `facets` maps a filter key to a scalar field or an array-membership field. `filterInferenceServices` becomes a thin wrapper passing its existing search fields and four facets; `filterLocalRuntimes` passes `runtime_type` as a scalar and `accelerators`, `model_formats`, and `api_styles` as membership facets. The existing inference cases in `tests/test_web.js` are the regression proof: they must pass unchanged before any runtime case is added, so refactor and feature are separately verifiable.

`filterDirectoryEntries` accepts a third collection and emits `kind: "runtime"` into the same alphabetical, score-hidden mixed list.

**Runtimes-scope controls:** search, runtime type, accelerator, model format, API style, and a score-or-name sort — four facets plus search, mirroring the inference scope exactly. `serving_modes` and `deployment_surfaces` are recorded and shown in the detail dialog and comparison table but are deliberately not filters; a fifth and sixth facet would crowd the control row without answering a distinct browsing question. Search indexes `name`, `maintainer`, `description`, `runtime_boundary`, `model_management`, `hardware_requirements`, `operational_controls`, strengths, and tradeoffs. It must not index evidence URLs or license blob SHAs, matching the false-positive rule `WEB.md` states for the other collections.

**Comparison.** `updateComparisonSelection` is already generic over `{kind, profile, id}` and needs no change to satisfy [ADR 014](../../adr/014-comparisons-are-scoped-to-one-score-profile.md). The additions are the `runtime:id,id` URL form, a runtime column set (runtime type, accelerators, model formats, API styles, deployment surfaces, model management, hardware requirements, licenses, source model, strengths, tradeoffs) alongside the eight dimensions, and inclusion in the path that clears an incompatible selection on scope change.

**Finder.** A schema-specific runtime branch per ADR 013: jobs map to one runtime type, priorities map only to `local_runtime` dimensions, and the handoff lands in the runtimes scope with that type preselected. No ranking pools scores across profiles. A goal is added only after at least one reviewed runtime can satisfy it.

**Atlas map.** The decorative hero map carries four nodes, and [`docs/WEB.md`](../../WEB.md) specifies that its orbital ellipses "span all four nodes so no subset reads as a separate cluster." A fifth `RUNTIMES · host · execute` node and the corresponding orbit geometry in `web/styles.css` are part of this change; omitting them would make the new collection read as second-class in exactly the way that rule exists to prevent.

**`WEB.md` updates** to the behavioral-contract list and the numbered browser-verification steps. The contract list is the file's specification, not after-the-fact documentation.

### 6. Inference-service additions

Ollama Cloud, plus a small batch where each record answers a distinct deployment, routing, residency, retention, or procurement question, as `ROADMAP.md` requires:

| Service | Distinct question |
|---|---|
| Ollama Cloud | Hosted continuity for a local-runtime workflow under one operator |
| Nebius AI Studio | European processing and residency for open-weight models |
| Baseten | Dedicated deployment and procurement of customer-supplied models |
| Novita AI | Independent managed hosting of open-weight catalogs |
| Lambda Inference | Accelerator-operator-run managed endpoints |

Every record requires first-party documentation, governing terms, and a complete eight-dimension score before promotion. Nothing in this document pre-assigns a score.

### 7. Project promotions

**SylphAI, as two records** — `CURATION.md` states a vendor's agent and SDK are not duplicates:

- **AdaL CLI** — `agent_system` / `coding_agent`. Terminal, IDE, and browser interfaces; delegates to specialized worker agents for coding, review, research, and browser use; can delegate to Claude Code or Codex instead of its own agent. Commercial product with free and paid tiers; product terms must be reviewed before promotion, and it stays provisional if that evidence is insufficient.
- **AdalFlow** — `agent_system` / `agent_framework_sdk`. Open-source library; `CURATION.md` treats a general LLM application library or optimizer as provisional until agent-building is shown to be material, so promotion depends on establishing that its agent runtime and tool use are a primary outcome, not an incidental capability.

**Assistants** — the thinnest family at 12 records: Mistral Le Chat, Qwen Chat, Kimi, Meta AI. `COVERAGE.md` requires each to be materially distinct in workspace, governance, or regional ecosystem. GroqChat stays provisional per the existing coverage note.

**Agent frameworks, promoted from `candidates.json`:** AutoGen, Semantic Kernel, Strands Agents SDK, Genkit.

**Deliberately deferred:** Dify, Langflow, Flowise, and Botpress Cloud. These are low-code visual builders whose role boundary — `agent_framework_sdk` versus `multi_agent_orchestrator` — is one coherent question deserving its own batch, per `COVERAGE.md`'s instruction to choose small batches with one boundary question. Promoting them alongside code-first SDKs would resolve that boundary by accident.

Every promoted candidate is removed from `directory/candidates.json` in the same change, per the `CURATION.md` review workflow.

## Implementation phases

Each phase is independently verifiable and commitable. Tests precede implementation within each phase.

1. **Decision records and taxonomy.** ADR 015; ADR 010 amendment note; `taxonomy.json` enum groups and `local_runtime_score_profile`; new `docs/LOCAL_RUNTIMES.md` curation guide; `AGENTS.md` routing row, published-file rule, and hard rules; ADR 015 and `docs/LOCAL_RUNTIMES.md` both added to the routing manifest in `tests/test_documentation.py`.
2. **Validator primitives.** Extract the three shared helpers. Behavior-preserving: every existing suite must pass unchanged, with no new records introduced.
3. **Canonical collection.** Seed records with full evidence, license review, and scores; `LOCAL_RUNTIME_REQUIRED`; the runtime validator block; cross-collection id uniqueness; `PUBLISHED_DATA` in both scripts; tests in `tests/test_directory.py` and `tests/test_validation_policy.py`.
4. **Web surface.** `app-core.js` extraction and `filterLocalRuntimes`; scope, rendering, and detail dialog in `app.js`; `index.html`; `styles.css` including the fifth map node; comparison; Finder branch; `WEB.md`; `tests/test_web.js`; `tests/e2e/directory-search.spec.js`.
5. **Inference-service additions.** Ollama Cloud and the four-service batch.
6. **Project promotions.** SylphAI records, assistants, frameworks, and candidate removals.
7. **Counts and closeout.** `COVERAGE.md` snapshot, `ROADMAP.md`, `BACKLOG.md`, `README.md`; full verification suite.

### Seed runtime batch

Eight records spanning desktop runner, server engine, and compatibility gateway, and spanning open-source through proprietary source models:

Ollama, llama.cpp, vLLM, LM Studio, SGLang, LocalAI, Jan, Hugging Face Text Generation Inference.

Each requires authoritative license review with component and path scope, documentation evidence for all eight dimensions, and a stated boundary against any adjacent service or assistant record. Any record whose evidence does not meet the standard is written to `directory/candidates.json` instead, never promoted with a provisional score.

## Verification

Per `AGENTS.md`, run after the relevant phases and in full before completion:

```
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
npm ci && npx playwright install chromium && npm run test:e2e
```

Browser verification adds, to the existing checklist: the runtimes scope and its filters, scoped URL restoration, score and name sorting, runtime detail dialogs across all four runtime types, score hiding in mixed browsing, runtime comparison including an invalid and a cross-profile `compare` URL, the runtime Finder path and its Directory handoff, and the five-node atlas map at narrow and wide widths.

## Risks and open questions

- **Rubric durability.** Eight dimensions must be defensible against runtimes that are deliberately narrow. A minimal embedded library will score low on serving and operations while being the correct choice for its use; ADR 015 must state, as ADR 012 does, that classification filters remain primary and a lower overall can be the right fit.
- **Evidence volatility.** Runtime capabilities change faster than service terms. Every record carries `verified_at`, and `docs/LOCAL_RUNTIMES.md` must state that capability claims are dated rather than durable.
- **Jan and LM Studio classification.** Both ship chat interfaces. The runtime-versus-assistant test resolves them as runtimes, but the reasoning must appear in each record's `runtime_boundary`, not only in the ADR.
- **AdalFlow materiality.** Promotion is conditional on establishing that agent building and running are a primary outcome. If review does not establish it, AdalFlow remains a candidate and only AdaL CLI is promoted.
- **Scope of phase 4.** `web/app.js` is 951 lines and gains a rendering path, a detail dialog, a comparison column set, and a Finder branch. If it grows past comfortable reading, extracting the runtime rendering into a sibling module is preferable to letting one file absorb a fourth collection wholesale.
