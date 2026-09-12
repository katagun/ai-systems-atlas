# Models

Use this document for provider-independent model discovery, reviewed language-model releases, models.dev ingestion, and the `model_access` score profile. The complete automated source snapshot is `directory/models-dev.json`, the canonical reviewed collection is `directory/models.json`, and the workflow queue is `directory/model-candidates.json` and is never published.

## Record boundary

A model record represents one identifiable model release independently of where it is served. It is not:

- the developer or research lab as a company;
- a managed API or hosting platform, which belongs in Inference Services;
- execution software, which belongs in Local Runtimes;
- an assistant, agent, or memory product built on the model;
- a downstream quantization, repackaging, fine-tune, or hosted endpoint unless that artifact has its own reviewed release boundary.

Models therefore do not receive `system_family`, `primary_role`, or a system-family score. Every commit-pinned models.dev source record participates in the mixed Directory for common discovery, visibly labeled as imported until Atlas review is complete. Models remains a sibling specialist view; only reviewed releases carry the dedicated profile used for scoring, filtering, and comparison.

A models.dev source record is not an Atlas editorial conclusion. It carries only source-attributed identity, modality, capability, limit, date, license-label, open-weight, and link fields. It has no Atlas model type, distribution conclusion, source-model classification, license evidence, score, or `verified_at`. When a reviewed record has the same `source_id`, the UI overlays that reviewed record on the source row instead of showing a duplicate.

## Eligibility

The automated source snapshot preserves every record under models.dev's provider-independent `models/**/*.toml` tree, regardless of modality. This makes source coverage complete and lets readers discover image-, audio-, and video-output records without implying that Atlas has reviewed them.

A release is eligible for the review queue and the scored Atlas collection when authoritative sources establish its identity and it generates text as an output modality. Text-only and multimodal language models qualify for review. Image-, audio-, or video-only generators remain source records but do not enter the language-model review queue because the comparison vocabulary is about language-model access and deployment.

License, public weights, parameter count, benchmark performance, popularity, and first-party API availability never decide inclusion. A proprietary API-only model can qualify just as an open-weight release can. Those facts affect classification and the access score after the identity and evidence gates pass.

The initial reviewed records deliberately exercise different distribution terms: a permissive open-source release, a noncommercial source-available release, and a custom restricted model license. They are examples of the schema, not a quality shortlist.

## models.dev ingestion

models.dev is discovery metadata, not Atlas editorial authority. Run:

```bash
uv run python scripts/import_models_dev.py
```

The importer resolves the `anomalyco/models.dev` `dev` ref to a full Git SHA, downloads that commit's immutable repository archive, and reads only `models/**/*.toml`. It deliberately ignores provider-specific files under `providers/`, provider pricing, benchmarks, and endpoint inventories. Each run writes the complete source snapshot to `models-dev.json` and the text-output review queue to `model-candidates.json`; both record the commit, archive URL, archive SHA-256, and source count, while the queue also records its eligible count.

The import is fail-closed. It rejects an unexpected host, archive over 8 MiB, malformed paths or TOML, duplicate or colliding stable IDs, invalid field types, unsupported modalities, fewer than 100 or more than 20,000 source records, and an eligible-count drop greater than 20% from the previous successful snapshot. Parsing and normalization complete before either output is replaced.

Imported `source_metadata` preserves only these provider-independent facts:

- name, description, family, release and update dates, and knowledge cutoff;
- input and output modalities;
- attachment, reasoning, tool-call, structured-output, and temperature flags, preserving missing values as `null`;
- context, input, and output token limits;
- the upstream open-weights flag and license string as reported, without treating either as reviewed;
- source and weight links.

Benchmarks and prices are not copied. A models.dev license string is a review lead only; it never becomes an Atlas `licenses` or `source_model` conclusion automatically.

Every source record is published in `models-dev.json`. Reviewed `source_id` values are removed from the queue, but the importer never creates, edits, or deletes a reviewed model. It cannot change descriptions, boundaries, licenses, evidence, scores, `verified_at`, or any other human-owned field. The web projection combines the complete source snapshot with reviewed records by `source_id`; imported rows remain unscored and explicitly unreviewed.

## Review workflow

For one record in `directory/model-candidates.json`:

1. Confirm that the models.dev ID names one provider-independent release rather than an endpoint alias, quantization, or family umbrella.
2. Identify the developer's authoritative model page and set the record boundary explicitly.
3. Review every license and mandatory acceptable-use or distribution term at its actual scope. Public weights do not imply open source.
4. Classify exactly one `model_type`, one `source_model`, and one or more `distribution_modes`.
5. Treat imported capabilities and limits as attributed source metadata; use first-party evidence for Atlas prose and scoring.
6. Score only the stable access and deployability dimensions below.
7. Add dated authoritative evidence, remove the candidate in the same change, synchronize published data, regenerate share pages, and run the full verification suite.

Use the guarded promotion command to scaffold and apply that review:

```bash
uv run python scripts/promote_model_candidate.py init PROVIDER/MODEL --output model-review.json
uv run python scripts/promote_model_candidate.py check model-review.json
uv run python scripts/promote_model_candidate.py apply model-review.json
uv run python scripts/sync_web_data.py
uv run python scripts/build_share_pages.py
```

`init` copies only the candidate ID, attributed `source_metadata`, and exact commit-pinned models.dev evidence URL. It deliberately leaves all human-owned classifications, license conclusions, prose, scores, evidence dates, and review dates incomplete. Complete the draft from authoritative sources before running `check`.

`check` is read-only. Both `check` and `apply` refuse changed imported metadata, duplicate source IDs, cross-collection ID collisions, an unverified license review, missing authoritative-model or pinned-source evidence, stale or future review dates, invalid taxonomy values, and incomplete or incorrectly calculated scores. `apply` preflights the complete proposed model collection and remaining queue before writing either canonical file; it removes only the reviewed candidate and does not change the queue's import-snapshot timestamp. It never fetches evidence or makes an editorial conclusion. Commit the completed review draft only if it is useful review history; it is not a catalog input after promotion.

### Distribution-mode conventions

Apply these consistently so batches score the same way:

- A publisher's own serving surface is `developer_api` reach, never `third_party_hosting`. Google's Vertex AI, AI Studio, and Model Garden serving Google's own models, and NVIDIA's build.nvidia.com trial endpoint serving NVIDIA's own models, are first-party developer-API evidence.
- Another operator's managed hosting of the exact model is `third_party_hosting`: Anthropic Claude on Vertex AI or Bedrock, any publisher's model on Azure Foundry, or a non-NVIDIA model behind an NVIDIA NIM endpoint. Each claim needs first-party host documentation naming the exact model; aggregator listings without host documentation are insufficient.
- A models.dev ID is reviewable when the publisher documents it as a fixed release identity: a dated snapshot, or a dateless ID the publisher defines as a pinned snapshot rather than a moving alias. A name that moves between snapshots without its own fixed identity is not a record; the full alias discriminator is still open (see `BACKLOG.md`).

### Release identity: fixed snapshots, not aliases

A models.dev ID names a reviewable release only when it has a fixed identity of its own:

- a dated snapshot (for example `claude-sonnet-4-5-20250929` or `gpt-5-2025-08-07`);
- a dateless ID the publisher defines as a pinned snapshot rather than a moving alias (Anthropic documents post-4.6 dateless IDs this way).

These never become records, no matter how prominent the name:

- moving aliases that resolve to different snapshots over time (`-latest` IDs, `chat-latest` IDs, pre-4.6 floaters);
- API route names that are not releases (the discontinued `deepseek-chat` and `deepseek-reasoner` names);
- retired snapshots of a line already reviewed at its current identity, and snapshots that duplicate a reviewed record outright (the `20250514` first-generation Claude snapshots, the dated `gpt-4o` snapshots named inside that record). Model records follow release lines at their current fixed identity; unlike systems under ADR 016, retired snapshots are excluded with a pointer rather than kept as records, because a line can accumulate dozens of them.

A launch-dated release served only through a rotating alias is still reviewable: the release itself (announcement date, dated deployments) is the fixed identity even when no pinnable snapshot exists, as with GPT-6 Astra and GPT-5.5 Instant. The exclusion targets names with no release identity of their own, not releases whose serving alias moves. Record the rotation as a lifecycle deduction.

### Holds and exclusions

Retired or undocumented source IDs that the queue cannot resolve on its own are dispositioned in `directory/model-dispositions.json`, never in prose alone: `held` means not now but possibly later (the page is gone or was never published, as with Claude Opus 4.1 and Grok 4.1 Fast), `excluded` means never in this shape (aliases, duplicates, retired snapshots of reviewed lines). Each entry carries the `source_id`, the disposition, a reason, and `decided_at`. The importer filters dispositioned IDs out of `model-candidates.json` while keeping them in the eligible count, the promotion command refuses them until the disposition is lifted, and validation keeps the eligible count equal to queued plus reviewed plus dispositioned IDs. The file is unpublished review state, like the queue itself.

## Model-access score

Every model uses `score_profile: model_access`. The weighted dimensions in `directory/taxonomy.json` are:

- license clarity: 22%;
- artifact availability: 18%;
- deployment portability: 20%;
- serving reach: 14%;
- lifecycle transparency: 12%;
- documentation provenance: 14%.

The score asks how clearly a model can be obtained, governed, deployed, and tracked. It never measures output quality, benchmark rank, parameter count, training compute, current price, latency, throughput, popularity, or safety performance. Compare model scores only with other `model_access` records.

## Attribution

The published provider-independent source snapshot is derived from models.dev under its MIT License; the required notice is preserved in `third_party/models.dev-LICENSE.txt`. Atlas classification, prose, scores, and reviewed evidence remain distinct human-authored catalog material under `LICENSE-DATA`.

See [ADR 025](adr/025-model-releases-are-independent-curated-records.md) for the reviewed-record boundary, [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md) for the source/review split, and `DATA_MODEL.md` for the exact JSON shapes.
