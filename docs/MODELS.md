# Models

Use this document for provider-independent language-model releases, models.dev ingestion, and the `model_access` score profile. The canonical reviewed collection is `directory/models.json`; the automated queue is `directory/model-candidates.json` and is never published.

## Record boundary

A model record represents one identifiable model release independently of where it is served. It is not:

- the developer or research lab as a company;
- a managed API or hosting platform, which belongs in Inference Services;
- execution software, which belongs in Local Runtimes;
- an assistant, agent, or memory product built on the model;
- a downstream quantization, repackaging, fine-tune, or hosted endpoint unless that artifact has its own reviewed release boundary.

Models therefore do not receive `system_family`, `primary_role`, or a system-family score. Reviewed releases participate in the mixed Directory for common discovery with numeric scores hidden; Models remains a sibling specialist view whose records share one dedicated profile for filtering and comparison.

## Eligibility

A release is eligible when authoritative sources establish its identity and it generates text as an output modality. Text-only and multimodal language models qualify. Image-, audio-, or video-only generators do not yet qualify because this collection's comparison vocabulary is about language-model access and deployment.

License, public weights, parameter count, benchmark performance, popularity, and first-party API availability never decide inclusion. A proprietary API-only model can qualify just as an open-weight release can. Those facts affect classification and the access score after the identity and evidence gates pass.

The initial reviewed records deliberately exercise different distribution terms: a permissive open-source release, a noncommercial source-available release, and a custom restricted model license. They are examples of the schema, not a quality shortlist.

## models.dev ingestion

models.dev is discovery metadata, not Atlas editorial authority. Run:

```bash
uv run python scripts/import_models_dev.py
```

The importer resolves the `anomalyco/models.dev` `dev` ref to a full Git SHA, downloads that commit's immutable repository archive, and reads only `models/**/*.toml`. It deliberately ignores provider-specific files under `providers/`, provider pricing, benchmarks, and endpoint inventories. Each queue run records the commit, archive URL, archive SHA-256, source count, and eligible count.

The import is transactional and fail-closed. It rejects an unexpected host, archive over 8 MiB, malformed paths or TOML, duplicate or colliding stable IDs, invalid field types, unsupported modalities, fewer than 100 or more than 20,000 source records, and an eligible-count drop greater than 20% from the previous successful snapshot. A failed run leaves the existing queue unchanged.

Imported `source_metadata` preserves only these provider-independent facts:

- name, description, family, release and update dates, and knowledge cutoff;
- input and output modalities;
- attachment, reasoning, tool-call, structured-output, and temperature flags, preserving missing values as `null`;
- context, input, and output token limits;
- the upstream open-weights flag and license string as reported, without treating either as reviewed;
- source and weight links.

Benchmarks and prices are not copied. A models.dev license string is a review lead only; it never becomes an Atlas `licenses` or `source_model` conclusion automatically.

Published `source_id` values are removed from the queue, but the importer never creates, edits, or deletes a published model. It cannot change descriptions, boundaries, licenses, evidence, scores, `verified_at`, or any other human-owned field.

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

The imported provider-independent metadata is derived from models.dev under its MIT License; the required notice is preserved in `third_party/models.dev-LICENSE.txt`. Atlas classification, prose, scores, and reviewed evidence remain distinct human-authored catalog material under `LICENSE-DATA`.

See [ADR 025](adr/025-model-releases-are-independent-curated-records.md) for the boundary decision and `DATA_MODEL.md` for the exact JSON shape.
