# Backlog

This is the ordered source of truth for actionable repository work. Policy and field definitions belong in `docs/`; finding detail stays in the document that established it; completed implementation belongs in Git history.

## Now — recommended sequence

Keep this section to five independently verifiable outcomes that can start without an unresolved product or taxonomy decision.

- [ ] Stop terms-drift detection from depending on which checkout ran it. Each checkout keeps its own ignored `.evidence-link-cache.json`, and a baseline is whatever page version that cache first saw, so on 2026-09-13 three checkouts held three different DeepInfra baselines and disagreed about whether it had drifted. The pages themselves are noisy: DeepInfra's terms page embeds a rotating featured-models menu that changes its normalized hash with no terms change, and Baseten's served a variant once. Hash only the terms body rather than site navigation, or share one cache across checkouts, and report a missing baseline instead of silently bootstrapping one.
- [ ] Rebalance the Finder's local priorities against [ADR 030](docs/adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md): a true `local_first` adds 3 to a match score that data sovereignty can move by at most 1, so a local-first record with a low sovereignty score still ranks first, and the agent priority labelled "Local execution and control" reads a trait that no longer judges where execution happens. Test the ranking with records that disagree on the two.
- [ ] Make multi-file canonical updates and generated-tree rebuilds crash-consistent, with staged validation and fault-injection tests at each replacement boundary (`CR-05` in [`docs/CODEBASE_REVIEW_2026-09-05.md`](docs/CODEBASE_REVIEW_2026-09-05.md)).
- [ ] Let the Directory boot with the collections that loaded, treating taxonomy as the only possible hard dependency and making unavailable collections retryable (`CR-06`). Add one failure-and-recovery browser test per boot payload.
- [ ] Replace `https://` prefix checks with one shared absolute-HTTPS parser that requires a host, rejects credentials, and carries collection-specific policy explicitly (`CR-07`). Use the same policy at validation and network boundaries.

## Next

Items are grouped by the dependency they resolve. Work top to bottom within a group; groups may proceed independently.

### Reliability and maintenance

- [ ] Confirm `candidate-triage` finishes its first unattended run. It started on schedule at 09:01 on 2026-09-15 — proving the Tuesday trigger fires — and was still running almost three hours later with no `finish` commit on `triage/pending` and no PR yet, so the outcome is unconfirmed. The other two scheduled jobs already closed this bar the same way: the weekly refresh's first live Monday run opened [#158](https://github.com/katagun/ai-systems-atlas/pull/158) (merged), and `hn-signals`' first run opened [#165](https://github.com/katagun/ai-systems-atlas/pull/165) (merged).
- [ ] Decide whether `local_first` needs a third state for records that keep nothing of their own, such as libraries whose storage the application chooses. Today validation accepts only booleans and the comparison table prints "No", which reads as a negative claim about a record that has no data to keep; [ADR 030](docs/adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md) left them false.
- [ ] Exercise the declared Python 3.11 floor in CI, or raise the declared minimum to the version actually supported (`CR-08` in [`docs/CODEBASE_REVIEW_2026-09-05.md`](docs/CODEBASE_REVIEW_2026-09-05.md)). Run browser installation and end-to-end tests only once.
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

- [ ] Give Chroma, Milvus, Qdrant, and Weaviate separate evidence-backed strengths, weaknesses, and why-it-matters reviews. If the evidence does not support four distinct reviews, replace the repeated records with one explicitly bounded building-block treatment instead of preserving boilerplate.
- [ ] Triage, then work, the candidate queue in small evidence-backed batches. After [#141](https://github.com/katagun/ai-systems-atlas/pull/141), [#144](https://github.com/katagun/ai-systems-atlas/pull/144), and [#145](https://github.com/katagun/ai-systems-atlas/pull/145) merged, and xerj and Lurnby resolved two of #141's nine new holds, it holds 148: 20 held (thirteen robotics plus seven remaining new holds) and the rest without a triage block — mostly the 102 discovered by the 2026-09-13 refresh and five queued from attention-source signals (Graphify C#, gPTY, mobile-use, ARTEMIS, iLands). Run `scripts/run_candidate_triage.py` over the untriaged set first so review starts from `review_ready` proposals rather than raw discovery.
- [ ] Disposition the attention-source `out_of_scope` proposals and retune the sweep. [#165](https://github.com/katagun/ai-systems-atlas/pull/165) bundles three daily sweeps and the first `hn-signals` routine pass, open for review: 2026-09-12 (57 signals: 47 `out_of_scope`, 1 `unreadable`) and 2026-09-13 (60 signals, cap hit: 42 `out_of_scope`, 11 `unreadable`, 4 `worth_review`, already queued) as before, plus 2026-09-14 (36 signals: 24 `out_of_scope`, 9 `unreadable`, 3 `worth_review` — AgentsDock, Apple Foundation Models third generation, and Norton Neo, each with an open boundary question in the PR). Decide whether off-topic stories (health news, climate, compilers) need exclusions with `url` at all or only in-family rejections do, then write those. With roughly 90% of each day off-topic and the sixty-signal cap already truncating, judge a relevance prefilter before the fetch against a higher points floor.
- [ ] Re-review `local_first` and `human_editable` on the records the sampled review behind [#154](https://github.com/katagun/ai-systems-atlas/pull/154) did not reach, under the rules in [ADR 030](docs/adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md). That sample covered about 55 records per trait of 199; confirm each remaining value against the record's own sources rather than its prose, since several legacy records reduce `canonical_data` to `database`. Start with the groups ADR 030 put in doubt: library and framework records whose editability rests on integrator code (agent systems are 117 of 125 editable today), assistants whose only editable content is chat history (DeepSeek, Z.ai Chat, Grok, Poolside Chat), self-hosted database records marked not local-first although they run on operator servers (LibreChat, Open Notebook), Venice's device-held history, and default telemetry that may carry content (Agno, Skyvern, CodeGraph, Omnigent).
- [ ] Confirm whether Letta Code has been renamed: Letta's documentation now calls it "The Letta Harness (formerly Letta Code)". If the rename is maintainer-declared, keep one record with a note under [ADR 016](docs/adr/016-superseded-predecessors-keep-their-record.md) and update its name and description.
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
- [ ] Surface local-runtime GitHub stars as a card footer signal and sort option; the canonical data and updater already carry `stars` and `stars_verified_at`. Keep it out of card badges: the "Card badges" contract in [`docs/WEB.md`](docs/WEB.md) excludes automated signals. Runtime card footers currently print model formats, so decide what the stars count displaces, as system cards already show stars there.
- [ ] Stop card-badge definitions from being announced twice. Each badge carries its definition in both visually hidden text and a `title`, and Chromium exposes the `title` as a description that some screen readers read again. Keep one source of the definition for assistive technology while pointer users still get the tooltip, and cover it with the badge Playwright spec.

## Watching

These items have no repository action until their stated trigger occurs. Move one back to `Now` or `Next` only when that trigger is met.

- [ ] Revisit claude-mem's `local_first` if its installer starts writing cloud-sync credentials at sign-in without an explicit hosted-plan choice. [#154](https://github.com/katagun/ai-systems-atlas/pull/154) kept it true because sync begins only after CMEM Pro enrollment, but the interactive installer already requires sign-in and preselects the hosted observer.
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
- [ ] Re-read and scope the Meta Business Agent terms when their browser-only host becomes reachable.
- [ ] Revisit Google Co-Scientist and AlphaProof when either becomes generally available through a self-serve or contractable product boundary.
- [ ] Revisit Meta's announced Harness framework only after a repository, documentation, or first-party product page exists.

## Later

- [ ] Build an original, dependency-free diagram layer for the Atlas's own taxonomy when explanatory work outranks catalog maintenance. Start with family boundaries, score-profile separation, and the system/service/runtime distinction; source every number or label it illustrative.
- [ ] Review vendor-hosted editions of self-hosted gateways as routing aggregators, starting with Portkey and Helicone; keep the self-hostable proxy software outside the service collection under ADRs 010 and 015.
- [ ] Decide whether domain-specific model APIs belong in Inference Services, using AlphaGenome as the boundary case. Write the general-inference-substrate rule if that is the intended limit.
- [ ] Reassess API clients, adapters, observability SDKs, or a new collection only after a concrete user question justifies reversing their current exclusion.
- [ ] Consider making card badges apply their matching filter when clicked. Badges shipped as plain labels; clickable filters need a filter for every badge, a place in the mixed All view (which has no filters), URL state, and phone-safe hit targets beside the card actions.
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

## Backlog hygiene

- Order work within each section; the first unchecked item in `Now` is the default next step.
- Keep `Now` at five outcomes or fewer and require each to be startable without an unresolved decision.
- State the outcome and acceptance signal here; link evidence, policy, and design detail instead of duplicating them.
- Merge overlapping batches and make dependencies explicit.
- Move condition-triggered work to `Watching`; keep low-priority but actionable work in `Later`.
- Remove completed items. Git history is the completion record.
