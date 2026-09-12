# Backlog

This is the ordered source of truth for actionable repository work. Policy and field definitions belong in `docs/`; finding detail stays in the document that established it; completed implementation belongs in Git history.

## Now — recommended sequence

Keep this section to five independently verifiable outcomes that can start without an unresolved product or taxonomy decision.

- [ ] Make model comparison degrade safely when detail payloads fail (`CR-03` in [`docs/CODEBASE_REVIEW_2026-09-05.md`](docs/CODEBASE_REVIEW_2026-09-05.md)). Reuse the null-safe comparison helpers and add a model-specific outage test that proves the dialog opens without page errors, `undefined` content, or unbounded retries.
- [ ] Require complete verification for every manually triggered Pages deployment (`CR-04`). Prefer removing `workflow_dispatch`; otherwise require the complete verification workflow for the exact SHA before deployment.
- [ ] Add a stale-review report that distinguishes editorial `verified_at` age from live-metadata age without changing either date.
- [ ] Give Chroma, Milvus, Qdrant, and Weaviate separate evidence-backed strengths, weaknesses, and why-it-matters reviews. If the evidence does not support four distinct reviews, replace the repeated records with one explicitly bounded building-block treatment instead of preserving boilerplate.
- [ ] Close the stranded refresh pull request #106 and issue #107. The weekly refresh now runs locally via `scripts/run_directory_refresh.py` (see `docs/OPERATIONS.md`, "Metadata refresh" and "Scheduled workflow"), which opens its pull request with the maintainer's own `gh` credentials so `verify` actually runs; no `ATLAS_AUTOMATION_TOKEN` repository secret is needed, and `.github/workflows/update-directory.yml` is retired. #106 is the draft the old workflow could never make mergeable, and #107 is the automation-failure issue that tracked its red runs; both are artifacts of the retired workflow and can close once the local runner has produced a mergeable refresh.

## Next

Items are grouped by the dependency they resolve. Work top to bottom within a group; groups may proceed independently.

### Reliability and maintenance

- [ ] Work down the terms-drift review backlog in small batches: re-read each changed terms page on its own authority, update affected conclusions and scoped evidence, and advance the human-owned dates so the next scheduled check accepts the new baselines.
- [ ] Make multi-file canonical updates and generated-tree rebuilds crash-consistent, with staged validation and fault-injection tests at each replacement boundary (`CR-05`).
- [ ] Let the Directory boot with the collections that loaded, treating taxonomy as the only possible hard dependency and making unavailable collections retryable (`CR-06`). Add one failure-and-recovery browser test per boot payload.
- [ ] Replace `https://` prefix checks with one shared absolute-HTTPS parser that requires a host, rejects credentials, and carries collection-specific policy explicitly (`CR-07`). Use the same policy at validation and network boundaries.
- [ ] Exercise the declared Python 3.11 floor in CI, or raise the declared minimum to the version actually supported (`CR-08`). Run browser installation and end-to-end tests only once.
- [ ] Extend guarded promotion from models.dev candidates to system candidates. Refuse writes until editorial, source-model, license, evidence, identity, date, taxonomy, and score fields validate together.
- [ ] Document and test repository rename and transfer handling as recoverable review events that preserve evidence history.
- [ ] Add automated accessibility checks to the existing Playwright suite without adding a shipped runtime dependency.
- [ ] Validate the numeric snapshot in [`docs/COVERAGE.md`](docs/COVERAGE.md) against the canonical files so count drift fails loudly; keep editorial coverage-signal review a separate human task.
- [ ] Disable administrator bypass for the `github-pages` environment in GitHub's UI; no supported API mutation exists.

### Editorial and taxonomy decisions

- [ ] Settle the operational boundary for agent skill packs. Keep authoring conventions in Specifications; distinguish a runtime that resolves, installs, versions, or sandboxes packs from a document collection executed by a host. Test the working discriminator—whether the candidate supervises the host or is run by it—against Superpowers, hyperresearch, claude-obsidian, obsidian-second-brain, and the other held vault packs before writing an ADR. Adoption alone is not evidence, and apply [ADR 020](docs/adr/020-derivative-records-turn-on-operational-boundary.md) to the likely ancestor pair only after this boundary is settled.
- [ ] Add Elastic License 2.0 as a named license identifier if authoritative scope review confirms the need, then use that decision in Open SWE and the MindsHub review. MindsHub's current repository is a code-free superproject over four submodules under three licenses; review the submodule products, not inherited stars or the former MindsDB tree.
- [ ] Represent a system operator's own models and explicit Azure OpenAI or Bedrock bring-your-own-key routes without misusing `openai_compatible`. Decide whether `model_backends` gets an operator-relative value or vendor-specific identifiers, then reconcile Cursor, Devin Desktop, Antigravity, and the existing Poolside precedent.
- [ ] Decide whether hosting other vendors' agents is a recordable capability independent of protocol. Test the proposed capability against Devin Desktop and Warp; ACP remains a Specification rather than the capability itself.
- [ ] Make product-boundary notes reader-visible, then give rename and acquisition history a correctly scoped field. `current_repo_note` is repository-scoped in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), yet 105 of 174 records inspected on 2026-09-03 used it for reader-facing boundary prose that the app and share pages did not render. Settle rendering first, then migrate non-repository notes without losing history.
- [ ] Add a browser-extension deployment value before publishing nanobrowser; do not misclassify it as `desktop`. Treat its dormancy since November 2025 as maturity evidence, not as the deployment decision.
- [ ] Reopen the agent-to-physical-world role only after the three gaps in [`docs/COVERAGE.md`](docs/COVERAGE.md) batch 39 close: name an operational outcome rather than a mechanism, complete license/source-model review through promotion, and test the model-in-the-loop property against opaque commercial systems. Keep the thirteen robotics candidates held meanwhile.
- [ ] Add a manual model-candidate path that preserves the pinned-source invariants, then review individual Liquid AI LFM releases under [ADR 025](docs/adr/025-model-releases-are-independent-curated-records.md). Do not publish a lab umbrella or score quality, benchmarks, or parameter counts.
- [ ] Decide whether the publishing party belongs among [ADR 020](docs/adr/020-derivative-records-turn-on-operational-boundary.md)'s operational-boundary fields. Brief a skeptic before drafting; do not fall back to repository lineage.
- [ ] Decide whether SeekrFlow's named product boundary supports a separate inference-service record. A price-page component is insufficient unless first-party evidence establishes a service boundary distinct from the published agent runtime.

### Coverage batches

- [ ] Work the sixty currently actionable system candidates in small evidence-backed batches; keep the thirteen robotics candidates held until their scope decision resolves.
- [ ] Review trust records for the twelve cloud model platforms, the last of the fifty-nine inference services without one. A platform-wide attestation, subprocessor list, or caching statement counts only when it names the service or states it covers every product; expect most of the work to be scope reading. Each batch so far took one working session with parallel research passes and every URL re-fetched by the integrator; budget the same.
- [ ] Triage the first attention-source signal bundle. The sweep runs locally on a schedule and commits `directory/hn-signals.json` to a local branch that never pushes, so the published queue is empty by design and nothing from that source has reached `directory/candidates.json`; run `scripts/run_hn_signals.py prepare --from-ref local/hn-signals` from the sweep worktree, annotate the bundle, and judge from that run whether the twenty-five-signal floor and sixty-signal cap are right.
- [ ] Review xerj as retrieval infrastructure, with maturity treated separately from eligibility and vendor-measured efficiency treated as marketing rather than evidence. Recheck `memory_service` before fixing its role.
- [ ] Re-check LangGraph's source model and deployment traits against the restricted agent server that made Open SWE mixed-source.
- [ ] Review the remaining proprietary and source-model-diversity memory batch together: NotebookLM, Microsoft Recall, Limitless, and Obsidian. This replaces the two overlapping backlog items that both named Recall and Limitless.
- [ ] Review the remaining coding-agent second pass: GitHub Copilot coding agent, Jules, and T3 Code. Focus on cloud delegation and workflow boundaries; the proprietary editor baseline is already covered.
- [ ] Review Sakana Chat, Sakana Translate, and Marlin as separate end-user products. Do not infer their terms or governance from the Sakana Fugu inference-service record.
- [ ] Disposition Elicit as publish, exclude, or a recorded boundary. Its repo-less commercial product shape cannot currently enter `directory/candidates.json`; solve that durable queue gap rather than leaving the result only in prose.
- [ ] Review `Future-House/paper-qa` first among the Edison/FutureHouse open repositories. Its active releases and tests make it a better boundary probe between `research_agent` and a memory-family knowledge role than the unreleased `robin` repository.
- [ ] Review cross-protocol authentication and authorization, workflow-state exchange beyond task messaging, and conformance evidence as the next Specifications batch.
- [ ] Review Amazon Q rules, Kiro steering, and JetBrains AI Assistant rules as the next bounded instruction-convention batch.

### Reader experience

- [ ] Replace the per-collection search boxes with one search across records, specifications, and taxonomy terms that lands in the correct collection and never mixes score profiles under [ADR 013](docs/adr/013-distinct-collections-share-one-directory-surface.md).
- [ ] Show related records and previous/next navigation inside detail dialogs using existing family, role, and successor data.
- [ ] Surface local-runtime GitHub stars as a card badge and sort option; the canonical data and updater already carry `stars` and `stars_verified_at`.

## Watching

These items have no repository action until their stated trigger occurs. Move one back to `Now` or `Next` only when that trigger is met.

- [ ] Revisit vibe-kanban if commits resume or the repository is archived. Its maintainer dissolved, the shipped product retired its board flow, and no current status describes that unarchived state accurately.
- [ ] Revisit dendron if the repository is archived. It is maintenance-only and dormant, but its hosts and extension remain available; its source also contains no model or embedding code, placing it beside ordinary personal knowledge tools rather than agent systems.
- [ ] Revisit plandex if commits resume or the repository is archived. Its hosted tier ended and first-party hosts no longer resolve, while the self-hosted terminal agent remains in an unarchived dormant repository.
- [ ] Revisit LaVague if commits resume or the repository is archived. The genuine browser-agent loop is dormant, packages are stale, and a security report about executing model-derived page content remains unanswered.
- [ ] Revisit Claudable if commits resume or the repository is archived. It is a coding-agent workflow supervisor, but it lacks a correctness gate, current releases, and recent activity.
- [ ] Revisit OpenCursor only after it has its own adoption and correctness gate. Current repository stars and forks belong to an unrelated predecessor, and the rewritten extension has only scaffold-level tests.
- [ ] Resolve GroqChat only when first-party evidence establishes a durable workspace distinct from Groq Playground and GroqCloud.
- [ ] Revisit Flowise if a community fork gains maintainer endorsement or clear succession; the archived record has no declared successor.
- [ ] Revisit Xinference if the commercial edition publishes governing terms.
- [ ] Revisit Microsoft Discovery if product-specific commercial terms are published. The MIT catalog and installer pointer do not govern the closed product.
- [ ] Record effective dates for the xAI terms governing Grok Bot when the host becomes reachable from a review environment.
- [ ] Re-read and scope the Meta Business Agent terms when their browser-only host becomes reachable.
- [ ] Revisit Google Co-Scientist and AlphaProof when either becomes generally available through a self-serve or contractable product boundary.
- [ ] Revisit Meta's announced Harness framework only after a repository, documentation, or first-party product page exists.

## Later

- [ ] Build an original, dependency-free diagram layer for the Atlas's own taxonomy when explanatory work outranks catalog maintenance. Start with family boundaries, score-profile separation, and the system/service/runtime distinction; source every number or label it illustrative.
- [ ] Review vendor-hosted editions of self-hosted gateways as routing aggregators, starting with Portkey and Helicone; keep the self-hostable proxy software outside the service collection under ADRs 010 and 015.
- [ ] Decide whether domain-specific model APIs belong in Inference Services, using AlphaGenome as the boundary case. Write the general-inference-substrate rule if that is the intended limit.
- [ ] Reassess API clients, adapters, observability SDKs, or a new collection only after a concrete user question justifies reversing their current exclusion.
- [ ] Settle whether an aggregator that resells other aggregators is reviewable and how its operational boundary differs from the upstream service.
- [ ] Reconcile inference-service `operator` values around the legal entity the customer contracts with, rather than mixing brands and entities.
- [ ] Audit models.dev providers for service coverage in boundary-collapsed batches; use it as third-party discovery metadata, never as evidence.
- [ ] Settle Glama's current product boundary before review; its gateway, tool-server index, and chat workspace no longer form an obvious single record.
- [ ] Review Novita AI and Lambda Inference once governing terms establish retention, residency, and delivery boundaries.
- [ ] Review Qwen Chat and Kimi as assistants with separate product-terms and governance passes.
- [ ] Allow pinned license evidence from a repository other than the record's own, covering the GenieX proprietary component and watsonx Orchestrate client without degrading immutable evidence to dated web prose.
- [ ] Review a proprietary or managed self-hosted compatibility gateway; both current gateway records are open source.
- [ ] Decide whisper.cpp under the [ADR 015](docs/adr/015-local-runtimes-are-self-operated-execution-records.md) purpose test and [ADR 017](docs/adr/017-local-runtime-eligibility-ignores-modality.md) modality rule.
- [ ] Extend runtime model-format vocabulary in one deliberate pass when Triton, KServe, Seldon, or another classical-machine-learning server is reviewed; do not add speculative enum values record by record.
- [ ] Decide whether CrewAI covers only its open framework or also the AMP suite; its current `self_hosted` value relies on AMP's on-premise option.
- [ ] Decide whether the Codex record is the terminal agent alone or also the IDE extension and desktop app distributed from the same repository.
- [ ] Re-check Khoj's status and links; its desktop download is missing and the homepage now leads with a different product.
- [ ] Decide whether Perplexity Personal Computer is operationally distinct from the cloud Perplexity Computer record.

## Completed on 2026-09-12

- [x] Review trust records for the fifteen managed inference hosts, the third batch under [ADR 029](docs/adr/029-trust-records-are-unscored-and-never-first-hand.md). Three records carry findings: Fireworks AI and DeepInfra (the 2025 prompt-cache audit, arXiv 2502.07776v2, closed against pages that now state per-account caches, with the note that the paper names neither among the providers that confirmed a change) and Replicate (its own 2024 disclosure of a shared-network vulnerability, closed on the same page). Cerebras, Groq, Fireworks, and DeepInfra state that caches are not shared across organisations; Together documents a fleet-wide serverless cache without stating whose entries it holds. Company-wide attestations that do not name the service leave Groq, Cerebras, NVIDIA, and SiliconFlow undocumented; Hugging Face Inference Endpoints, Together, Baseten, SambaNova, DeepInfra, and Nebius name theirs. Scores are unchanged throughout.
- [x] Review trust records for the twenty direct model APIs, the second batch under [ADR 029](docs/adr/029-trust-records-are-unscored-and-never-first-hand.md). Three records carry findings: OpenAI (the 2025 prompt-cache audit, arXiv 2502.07776v2, closed against the guide that now states caches are not shared across organisations), DeepSeek (the January 2025 Wiz disclosure of an exposed database holding chat history and secret keys, with no operator statement, so the record gains a tradeoff), and Mistral AI Studio (its own advisory MAI-2026-001, closed on the same page). Two operators document response verification for enclave-backed tiers only, Cohere and none else outside Model Vault; none does so for its default API. Scores are unchanged throughout, because no operator's own evidence changed.
- [x] Review trust records for the twelve routing aggregators, the first batch under [ADR 029](docs/adr/029-trust-records-are-unscored-and-never-first-hand.md). Every property cites a first-party page read on the review date with the deciding sentence quoted; OpenRouter carries the two admissible findings, CacheProbe (arXiv 2605.30613v1) and KeyPooling (arXiv 2608.17485v1), both on cross-account prompt-cache reads for traffic on its shared upstream credentials, and its record gained a tradeoff and a fresh review date while its data-governance score stayed where the operator's own evidence puts it. No service documents a way to verify a response arrived unaltered from the upstream model outside enclave-scoped model tiers, which is the class-level fact the paper that prompted this work established.

## Completed on 2026-09-11

- [x] Curate the first models.dev queue batch beyond the seed. Twenty-four releases across OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen, Z.ai, Moonshot, MiniMax, NVIDIA, IBM, Microsoft, Cohere, and xAI now carry the model-access score, the taxonomy gains ten licence identifiers for the Llama 3.3 and 4 terms, the NVIDIA Nemotron licence, the two modified-MIT model licences, and the Gemini and xAI API terms, and two retired or undocumented releases are held rather than published. `docs/COVERAGE.md` batch 42 records the licence and lifecycle findings.

## Backlog hygiene

- Order work within each section; the first unchecked item in `Now` is the default next step.
- Keep `Now` at five outcomes or fewer and require each to be startable without an unresolved decision.
- State the outcome and acceptance signal here; link evidence, policy, and design detail instead of duplicating them.
- Merge overlapping batches and make dependencies explicit.
- Move condition-triggered work to `Watching`; keep low-priority but actionable work in `Later`.
- Remove completed items. Git history is the completion record.
