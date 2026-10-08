# Models

Use this document for provider-independent model discovery, reviewed language-model releases, models.dev ingestion, the OpenRouter cross-check, and the `model_access` score profile. The complete automated source snapshot is `directory/models-dev.json`, the canonical reviewed collection is `directory/models.json`, and the workflow queue is `directory/model-candidates.json` and is never published. The OpenRouter cross-check's leads, in `directory/openrouter-model-leads.json`, are never published either.

## Record boundary

A model record represents one identifiable model release independently of where it is served. It is not:

- the developer or research lab as a company, which belongs in Labs ([`LABS.md`](LABS.md));
- a managed API or hosting platform, which belongs in Inference Services;
- execution software, which belongs in Local Runtimes;
- an assistant, agent, or memory product built on the model;
- a downstream quantization, repackaging, fine-tune, or hosted endpoint unless that artifact has its own reviewed release boundary.

Models therefore do not receive `system_family`, `primary_role`, or a system-family score. Every commit-pinned models.dev source record participates in the mixed Directory for common discovery, visibly labeled as imported until Atlas review is complete. Models remains a sibling specialist view; only reviewed releases carry the dedicated profile used for scoring, filtering, and comparison.

A models.dev source record is not an Atlas editorial conclusion. It carries only source-attributed identity, modality, capability, limit, date, license-label, open-weight, and link fields. It has no Atlas model type, distribution conclusion, source-model classification, license evidence, score, or `verified_at`. When a reviewed record has the same `source_id`, the UI overlays that reviewed record on the source row instead of showing a duplicate. A reviewed record whose `source_id` is `null` was reviewed before models.dev listed the release; it overlays a source row with the same `id` once one appears.

## Eligibility

The automated source snapshot preserves every record under models.dev's provider-independent `models/**/*.toml` tree, regardless of modality. This makes source coverage complete and lets readers discover image-, audio-, and video-output records without implying that Atlas has reviewed them.

A release is eligible for the review queue and the scored Atlas collection when authoritative sources establish its identity and it is a model artifact with a documented output modality: text, image, video, or audio ([ADR 051](adr/051-generative-media-releases-join-the-reviewed-models-collection.md)). `model_types` names one type per output the release exists to produce, and validation requires the record's own output modalities to agree with its type: a language type requires `text`, `image_generation_model` requires `image`, `video_generation_model` requires `video`, and `audio_generation_model` requires `audio`.

Two kinds of release stay out under that rule. An **action-emitting policy** is not eligible, whatever it takes as input, because no type names a model whose primary output is a robot action or a predicted trajectory; the robotics scope decision in [`COVERAGE.md`](COVERAGE.md) records why, and ADR 036's embodied boundary is the open question. A **judgment, embedding, or reranking model** is held as its own question in `BACKLOG.md`.

License, public weights, parameter count, benchmark performance, popularity, and first-party API availability never decide inclusion. A proprietary API-only model can qualify just as an open-weight release can. Those facts affect classification and the access score after the identity and evidence gates pass.

The initial reviewed records deliberately exercise different distribution terms: a permissive open-source release, a noncommercial source-available release, and a custom restricted model license. They are examples of the schema, not a quality shortlist.

## models.dev ingestion

models.dev is discovery metadata, not Atlas editorial authority. Run:

```bash
uv run python scripts/import_models_dev.py
```

The importer resolves the `anomalyco/models.dev` `dev` ref to a full Git SHA, downloads that commit's immutable repository archive, and reads only `models/**/*.toml`. It deliberately ignores provider-specific files under `providers/`, provider pricing, benchmarks, and endpoint inventories. Each run writes the complete source snapshot to `models-dev.json` and the review queue to `model-candidates.json`; both record the commit, archive URL, archive SHA-256, and source count, while the queue also records its eligible count.

The import is fail-closed. It rejects an unexpected host, archive over 8 MiB, malformed paths or TOML, duplicate or colliding stable IDs, invalid field types, unsupported modalities, fewer than 100 or more than 20,000 source records, and an eligible-count drop greater than 20% from the previous successful snapshot. Parsing and normalization complete before either output is replaced.

Imported `source_metadata` preserves only these provider-independent facts:

- name, description, family, release and update dates, and knowledge cutoff;
- input and output modalities;
- attachment, reasoning, tool-call, structured-output, and temperature flags, preserving missing values as `null`;
- context, input, and output token limits;
- the upstream open-weights flag and license string as reported, without treating either as reviewed;
- source and weight links.

Benchmarks and prices are not copied. A models.dev license string is a review lead only; it never becomes an Atlas `licenses` or `source_model` conclusion automatically.

Every source record is published in `models-dev.json`. Reviewed `source_id` values are removed from the queue, but the importer never creates, edits, or deletes a reviewed model. It cannot change descriptions, boundaries, licenses, evidence, scores, `verified_at`, or any other human-owned field. The web projection combines the complete source snapshot with reviewed records by `source_id` (or by `id` for a record with no `source_id` yet); imported rows remain unscored and explicitly unreviewed.

## OpenRouter cross-check

models.dev has gaps, and finding one used to depend on a reviewer noticing it. The weekly refresh therefore compares OpenRouter's public model list with Atlas ([ADR 039](adr/039-openrouter-is-an-unpublished-cross-check-for-models-dev-gaps.md)). Its output, `directory/openrouter-model-leads.json`, lists text-output releases that OpenRouter routes and that no models.dev row or reviewed record represents. Neither that file nor `directory/openrouter-model-dispositions.json` is published.

The cross-check still covers text-output routes only, which is narrower than the review queue since [ADR 051](adr/051-generative-media-releases-join-the-reviewed-models-collection.md) widened it. OpenRouter's public list is a language-model router catalogue, so an image or video generator has no route to appear on it, and a release models.dev omits is reached through the OpenRouter cross-check or by a reviewer's own sweep rather than by a second scraper.

```bash
uv run python scripts/import_openrouter.py
```

The importer sends one unauthenticated request to `https://openrouter.ai/api/v1/models`, the documented public endpoint, and never loads the site's pages. For each lead it keeps only the OpenRouter ID without its variant suffix, the canonical slug, the display name, the Hugging Face ID, and the listing date. It never copies descriptions, prices, benchmarks, rankings, latency, throughput, provider endpoints, parameters, or limits. The leads file pins the response by fetch date and SHA-256. The import is fail-closed: it refuses fewer than 100 or more than 20,000 rows, a paginated or truncated list, malformed rows, and a drop of more than 20% in eligible routes. A refused import changes nothing, and the weekly refresh reports it without stopping.

Rows that OpenRouter itself marks as moving aliases (`~` IDs or an `alias_target`), its own `openrouter/` and `stealth/` namespaces (routers and cloaked stealth-program models), and rows without text output are skipped. Variants such as `:free` fold into their route. A route is represented, and produces no lead, when:

- its ID or canonical slug derives the stable ID of a models.dev row or reviewed record. OpenRouter author names that differ from models.dev's provider directories are translated first, such as `qwen` to `alibaba` and `meta-llama` to `meta`; the table is `AUTHOR_ALIASES` in the importer;
- its Hugging Face ID matches a models.dev row's weight or source links, or a reviewed record's page or source metadata. Evidence is not read for this test, because it also cites base models;
- a reviewed record cites its OpenRouter model page.

### Terms gate

Nothing is fetched until a maintainer has read OpenRouter's current [terms](https://openrouter.ai/terms), found that this use of the public API is permitted, and recorded that date as `terms_reviewed_at` in `directory/openrouter-model-dispositions.json`. Until then the importer reports that it skipped, and the refresh pull request carries that line. Setting the date back to `null` and rerunning the importer clears the stored leads without a request. The OpenRouter inference-service record already watches the terms page for drift. When the drift check reports a change, re-read the terms before the next import, then advance or withdraw the date.

### Acting on a lead

A lead is a pointer, never evidence: an aggregator listing does not establish identity, licensing, or hosting (see [Distribution-mode conventions](#distribution-mode-conventions)). Resolve each lead in one of two ways:

- **Review it** through `init-gap` when the release passes the eligibility and release-identity rules; see [Releases models.dev does not list](#releases-modelsdev-does-not-list). Pass the ID models.dev would use, which names the developer's models.dev provider directory rather than OpenRouter's author name: `alibaba/qwen3-max` for OpenRouter's `qwen/qwen3-max`. The next import drops the lead once the record represents it. If the IDs do not line up, disposition the lead as `excluded` with a pointer to the record.
- **Disposition it** in `directory/openrouter-model-dispositions.json` with `openrouter_id`, `disposition`, `reason`, and `decided_at`. Use `excluded` for a route that is not a reviewable release, or that is the same release as a models.dev row or reviewed record under another name (name that row or record in the reason). Use `held` for not now. Remove the lead in the same change; validation keeps leads and dispositions disjoint.

A lead that models.dev later lists becomes an ordinary queue candidate, and the next import drops it. The importer prints a `prunable OpenRouter disposition` line for an entry whose route is no longer listed or is now represented; delete those entries.

## Artifact licensing labels

`source_model` remains the human-reviewed classification of the represented release artifacts and every mandatory license or access term. Model UI labels come from `source_models[].model_name` and `model_definition` in the taxonomy, distinct from the software-scoped names for systems and runtimes. `open_source` displays as **Open-licensed artifacts**; downloadable weights remain a separate distribution fact. The exact licenses and release boundary remain visible.

This does not attest the openness of training code, training data, or the complete AI system, and does not claim an assessment against the OSI Open Source AI Definition. No reviewed record is reclassified by this presentation change. A stronger claim requires an explicit evidence standard and human review; imported license strings never become reviewed conclusions. [ADR 047](adr/047-badges-identify-record-facts-and-licensing-stays-scoped-text.md) records the decision. Cards, filters, Explore, comparisons, dialogs, Taxonomy, and share pages must use the same model-specific names and scope.

## Review workflow

For one record in `directory/model-candidates.json`, or for a release models.dev does not list (see [Releases models.dev does not list](#releases-modelsdev-does-not-list)):

1. Confirm that the models.dev ID names one provider-independent release rather than an endpoint alias, quantization, or family umbrella.
2. Identify the developer's authoritative model page and set the record boundary explicitly.
3. Review every license and mandatory acceptable-use or distribution term at its actual scope. Public weights do not imply open source.
4. Classify exactly one `model_type`, one `source_model`, and one or more `distribution_modes`.
5. Treat imported capabilities and limits as attributed source metadata; use first-party evidence for Atlas prose and scoring.
6. Score only the stable access and deployability dimensions below.
7. Record the `maker_risk_safeguards` flag ([ADR 042](adr/042-reviewed-flags-record-a-makers-risk-statement.md)). Check the developer's system card, model page, and safety or framework page for this release. If one names this release against a risk threshold, record `statement_found`: the developer's own term verbatim in `tier_term`, the `domains`, `determination`, and `scope` its words support, the sentence or sentences quoted verbatim in `statement`, and the page pinned with `uv run python scripts/check_evidence_links.py --pin URL`, which prints the `content_sha256` to record or says the page is unpinnable, in which case record `"unpinnable": true` instead. Otherwise record `no_statement_found` with the page checked last, normally the framework or system-card index, and run `--pin` on that page too: its hash is what raises a review when a statement appears, so choose a page that pins, such as the system card or model page; a page `--pin` reports as unpinnable is not a valid checked page for this status. Before recording either, confirm that the statement names this release, not the family or a product; that the quote is verbatim from a first-party page; that `determination` and `scope` match the words; and, for `no_statement_found`, that all three pages were checked. A statement about a model family, a product built on the model, or a sibling release goes into prose or onto the product's own system record, never into a flag, and models.dev text never establishes one. Research agents may propose an entry; it is accepted only when the owner merges it.
8. Add dated authoritative evidence, remove the candidate in the same change, synchronize published data, regenerate share pages, and run the full verification suite.

Use the guarded promotion command to scaffold and apply that review:

```bash
uv run python scripts/promote_model_candidate.py init PROVIDER/MODEL --output model-review.json
uv run python scripts/promote_model_candidate.py check model-review.json
uv run python scripts/promote_model_candidate.py apply model-review.json
uv run python scripts/regenerate.py
```

`init` copies only the candidate ID, attributed `source_metadata`, and exact commit-pinned models.dev evidence URL. It deliberately leaves all human-owned classifications, license conclusions, prose, scores, evidence dates, and review dates incomplete. It also scaffolds one blank `maker_risk_safeguards` flag entry, which fails validation until it is completed in an examined state. Complete the draft from authoritative sources before running `check`.

`check` is read-only. Both `check` and `apply` refuse changed imported metadata, duplicate source IDs, cross-collection ID collisions, an unverified license review, missing authoritative-model or pinned-source evidence, a missing examined `maker_risk_safeguards` flag, stale or future review dates, invalid taxonomy values, and incomplete or incorrectly calculated scores. `apply` preflights the complete proposed model collection and remaining queue before writing either canonical file; it removes only the reviewed candidate and does not change the queue's import-snapshot timestamp. It never fetches evidence or makes an editorial conclusion. Commit the completed review draft only if it is useful review history; it is not a catalog input after promotion.

### Releases models.dev does not list

models.dev has gaps; a gap upstream is not a reason to leave a release out ([ADR 038](adr/038-reviewed-models-may-precede-their-models-dev-source-row.md)). The [OpenRouter cross-check](#openrouter-cross-check) surfaces many such releases as leads. When the pinned snapshot and the upstream `dev` branch both lack a release that passes the eligibility and release-identity rules above:

```bash
uv run python scripts/promote_model_candidate.py init-gap PROVIDER/MODEL --output model-review.json
uv run python scripts/promote_model_candidate.py check model-review.json
uv run python scripts/promote_model_candidate.py apply model-review.json
```

`PROVIDER/MODEL` is the ID you expect models.dev to use; the record `id` is derived from it and never changes afterwards. `init-gap` refuses an ID that is already in the snapshot, the queue, or the dispositions. The draft has `source_id: null` and an empty `source_metadata` block: fill every field from the developer's first-party documentation, leave unknown values `null`, and date the work with `metadata_verified_at`. That block is Atlas material, not models.dev data. The review is otherwise identical, except that no pinned models.dev evidence URL exists to cite. `apply` does not touch the queue.

When models.dev later lists the release, the weekly refresh queues the row as usual and `validate_directory.py` prints `link pending: <model id> <- <source id>`. Until it is linked, the reviewed card stands in for the row. Link it:

```bash
uv run python scripts/promote_model_candidate.py link MODEL_ID PROVIDER/MODEL --metadata-verified-at YYYY-MM-DD --dry-run
uv run python scripts/promote_model_candidate.py link MODEL_ID PROVIDER/MODEL --metadata-verified-at YYYY-MM-DD
```

`link` prints each difference between the hand-authored and the models.dev metadata, adopts the models.dev copy, adds the pinned evidence URL, and removes the candidate. It changes no prose, classification, license, score, or `verified_at`; if a difference touches a score rationale or the boundary, re-review the record in the same change.

If models.dev used a different ID than expected, the row shows as an ordinary imported card and produces no `link pending` line. Link it the same way; the record keeps its `id`. If upstream later also adds the ID you first expected, validation reports an id collision: set `source_id` to `null`, remove the pinned models.dev evidence entry, run the importer, link to the row whose stable ID matches the record `id` (`link` adds the fresh pinned entry), and exclude the other row as the exact snapshot the reviewed record represents. If upstream deletes a linked row, validation fails; set `source_id` to `null`, remove the pinned models.dev evidence entry, and re-attest the metadata rather than deleting the review — a null-source record may cite no models.dev evidence.

Holds and exclusions still require a snapshot `source_id`, so a release models.dev does not list cannot be dispositioned; see `BACKLOG.md`. An OpenRouter disposition only silences that release's OpenRouter lead.

### Distribution-mode conventions

Apply these consistently so batches score the same way:

- A publisher's own serving surface is `developer_api` reach, never `third_party_hosting`. Google's Vertex AI, AI Studio, and Model Garden serving Google's own models, and NVIDIA's build.nvidia.com trial endpoint serving NVIDIA's own models, are first-party developer-API evidence.
- Another operator's managed hosting of the exact model is `third_party_hosting`: Anthropic Claude on Vertex AI or Bedrock, any publisher's model on Azure Foundry, or a non-NVIDIA model behind an NVIDIA NIM endpoint. Each claim needs first-party host documentation naming the exact model; aggregator listings without host documentation are insufficient.
- A models.dev ID is reviewable when the publisher documents it as a fixed release identity: a dated snapshot, or a dateless ID the publisher defines as a pinned snapshot rather than a moving alias. A name that moves between snapshots without its own fixed identity is not a record; the full alias discriminator is still open (see `BACKLOG.md`).

### Release identity: fixed snapshots, not aliases

A release is reviewable only when it has a fixed identity of its own, whether or not models.dev lists it:

- a dated snapshot (for example `claude-sonnet-4-5-20250929` or `gpt-5-2025-08-07`);
- a dateless ID the publisher defines as a pinned snapshot rather than a moving alias (Anthropic documents post-4.6 dateless IDs this way).

These never become records, no matter how prominent the name:

- moving aliases that resolve to different snapshots over time (`-latest` IDs, `chat-latest` IDs, pre-4.6 floaters);
- API route names that are not releases (the discontinued `deepseek-chat` and `deepseek-reasoner` names);
- retired snapshots of a line already reviewed at its current identity, and snapshots that duplicate a reviewed record outright (the `20250514` first-generation Claude snapshots, the dated `gpt-4o` snapshots named inside that record). Model records follow release lines at their current fixed identity; unlike systems under ADR 016, retired snapshots are excluded with a pointer rather than kept as records, because a line can accumulate dozens of them.

A launch-dated release served only through a rotating alias is still reviewable: the release itself (announcement date, dated deployments) is the fixed identity even when no pinnable snapshot exists, as with GPT-6 Astra and GPT-5.5 Instant. The exclusion targets names with no release identity of their own, not releases whose serving alias moves. Record the rotation as a lifecycle deduction.

### Line updates: re-review in place, never a second record

When a reviewed line moves to a new snapshot, re-review the existing line record; do not mint a snapshot record beside it. Update the boundary to the new identity, re-verify the license text, distribution paths, flags, and scores against the new snapshot, refresh the evidence list, and advance `verified_at`. Then exclude the snapshot source ID with a pointer to the line record, since its content is now folded in. A genuinely new line — a new release name from the developer, not a new snapshot of the reviewed line — gets its own record, and the old record keeps lifecycle notes. Git history preserves the superseded review, the way it preserves every completed backlog item. A line update records a `maker_risk_safeguards` entry in an examined state if the record has none yet. When a developer revises or withdraws a statement, update the entry in place with a new `verified_at` and describe the change in the pull request; never remove it silently.

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

The published provider-independent source snapshot is derived from models.dev under its MIT License; the required notice is preserved in `third_party/models.dev-LICENSE.txt`. Atlas classification, prose, scores, and reviewed evidence remain distinct human-authored catalog material under `LICENSE-DATA`. `source_metadata` on a record with `source_id: null` is hand-authored Atlas material under `LICENSE-DATA`, not models.dev data. Nothing derived from OpenRouter is published: the unpublished leads file names OpenRouter and its terms URL as its source, and a lead never enters `source_metadata`.

See [ADR 025](adr/025-model-releases-are-independent-curated-records.md) for the reviewed-record boundary, [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md) for the source/review split, [ADR 038](adr/038-reviewed-models-may-precede-their-models-dev-source-row.md) for releases models.dev does not list, [ADR 039](adr/039-openrouter-is-an-unpublished-cross-check-for-models-dev-gaps.md) for the OpenRouter cross-check, and `DATA_MODEL.md` for the exact JSON shapes.
