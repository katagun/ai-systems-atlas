# Data model

Use this reference when editing JSON or code that consumes it. Taxonomy rationale belongs in `TAXONOMY.md`; review judgment belongs in `CURATION.md`.

## Canonical and published data

`directory/` is canonical. The browser consumes synchronized copies of ten files:

| Canonical file | Purpose | Published to `web/` |
|---|---|---|
| `projects.json` | Reviewed catalog and editorial scores | Yes |
| `taxonomy.json` | Enums, source models, licenses, and score profiles | Yes |
| `license-evidence.json` | Scoped reviewed license and terms evidence | Yes |
| `exclusions.json` | Reviewed scope-boundary decisions | Yes |
| `specifications.json` | Reviewed, unscored interoperability artifacts and evidence | Yes |
| `inference-services.json` | Reviewed managed inference services, dedicated service scores, and evidence | Yes |
| `local-runtimes.json` | Reviewed self-operated inference runtimes, dedicated runtime scores, and evidence | Yes |
| `models.json` | Reviewed provider-independent model releases, dedicated access scores, and evidence | Yes |
| `models-dev.json` | Complete commit-pinned models.dev source snapshot with no Atlas conclusions | Yes |
| `packs.json` | Reviewed, unscored agent packs recorded for what a host installs | Yes |
| `candidates.json` | Provisional discovery and migration queue | No |
| `model-candidates.json` | Imported models.dev discovery metadata awaiting complete human review | No |
| `model-dispositions.json` | Durable human hold and exclusion decisions for models.dev source IDs | No |
| `license-review.json` | Open license-evidence review incidents | No |
| `discovery-sources.json` | Allowlisted official feeds used to discover non-GitHub candidates | No |
| `hn-signals.json` | Attention-source signal queue: pointers plus optional review assessment | No |

Run `uv run python scripts/sync_web_data.py` and `uv run python scripts/build_share_pages.py` after manually changing published data.

The browser presents projects, inference services, local runtimes, and a de-duplicated union of models.dev source rows plus reviewed models through one Directory surface, but that is a presentation-layer union only. Mixed search may normalize shared identity fields for rendering; it never changes a canonical schema or makes scores comparable. Models is a sibling view because its model-artifact question is distinct from the operational Directory. See [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md), [ADR 025](adr/025-model-releases-are-independent-curated-records.md), and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).

## Project record

Fields are grouped by responsibility:

- **Identity:** `id`, `name`, optional GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** `system_family`, `primary_role`, `secondary_roles`, and `score_profile`.
- **Traits:** agent relationship, optional reviewed provider relationship and model backends, architecture, retrieval, capture, lifecycle, deployment (including `host_pack` for systems installed into a host agent), local-first behavior, editability, provenance, and agent-only operation fields.
- **Trait definitions:** Directory cards show `local_first` and `human_editable` as the Local-first and Editable by you badges. Each definition below quotes its badge definition in `web/app-core.js` verbatim, a test keeps the two identical, and [ADR 030](adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md) records the rules that follow each quote.
  - `local_first`: "Keeps your data on your own device or servers by default. It may still send requests to an online AI model; cloud storage is opt-in." True only when, by default, the working copy of the content the system keeps — files, notes, memory, sessions, conversation history, run state — lives on hardware the user controls, including servers they operate; the vendor stores none of that content beyond serving a request and bounded retention for abuse or safety monitoring, and does not use it for training; and vendor-hosted storage such as sync, cloud sessions, or remote indexes is opt-in. Sending requests to a remote model does not by itself make it false. Default telemetry that carries content — prompts, outputs, conversation or run state — counts as vendor storage; content-free usage analytics does not. A library or framework whose storage the application chooses is false unless the library itself writes its data to local disk by default.
  - `human_editable`: "You can open and change what it keeps, such as notes, memories, or instructions, directly in files or in the app, not only by chatting." True only when a person can change the stored content itself — notes, documents, memories, messages, instructions, or agent and workflow definitions the system stores — without writing code, through files, an editor, or an in-product screen that edits those entries. Configuration alone (keys, model choice, preferences), delete-only or regenerate-only controls, editing only through an API or SDK, and source code an integrator writes for a library to run do not count.
- **Licensing:** non-empty `licenses`, one `source_model`, and `license_review_status`.
- **Lifecycle:** `status`.
- **Editorial review:** score dimensions, strengths, weaknesses, significance, confidence, and `verified_at`.
- **Live metadata:** stars, forks, open issues, push time, detected license, and their metadata timestamps. These may be null for systems without a public GitHub repository.

All enum values and score dimensions come from `taxonomy.json`. Validation rejects unknown values and incompatible family, role, secondary-role, or score-profile combinations. Every family has exactly one score profile. Agent-operation fields are required only for agent systems; assistants use the shared architecture, retrieval, capture, lifecycle, deployment, provider, and evidence fields.

### Source and license traits

`source_model` is one of `open_source`, `mixed_open_source`, `mixed_source`, `open_core`, `source_available`, `proprietary`, or `unclear`. `licenses` lists every material reviewed identifier, including content or commercial terms that cover part of the represented system. Neither field controls inclusion.

The taxonomy assigns each license a kind. Validation keeps the two fields coherent: open-source models use only open-source terms; mixed-open-source models use at least two open code/content terms; mixed-source and open-core models combine reusable open-source code with restricted or proprietary terms; and source-available, proprietary, or unclear models include their corresponding term kind. Use `open_core` only when the reusable open code is the operational core. Use `mixed_source` when an open wrapper or component depends on a closed operational core or runtime.

`license_review_status` is `verified` when evidence supports the reviewed classification and `review_required` when automation or a reviewer detected possible drift. Review-required systems remain visible.

### Lifecycle

`status` is one of `active`, `archived`, `superseded`, or `removed`. `superseded_by` is optional, required exactly when `status` is `superseded`, and holds one project id that must resolve to another published record. The validator rejects a missing successor, an unknown id, a self-reference, and a `superseded_by` on any other status. See [ADR 016](adr/016-superseded-predecessors-keep-their-record.md).

### Optional provider traits

`provider_relationship` and `model_backends` are an atomic optional pair. Omit both until official support has been reviewed. When present, both must use taxonomy values; `provider_native` requires exactly one backend. Automation and candidate discovery never infer these editorial traits.

## Timestamp semantics

| Field | Owner | Meaning |
|---|---|---|
| `verified_at` | Human reviewer | Editorial classification, prose, and score were reviewed on this date |
| `metadata_verified_at` | Automation | Repository-level GitHub metadata was refreshed on this date |
| `stars_verified_at` | Automation | `stars` was observed on this date |
| `generated_at` | Automation/editor | The published project document was last regenerated |
| `trust.verified_at` | Human reviewer | The trust record's properties and findings were reviewed on this date; never automated |
| `excluded_at` (exclusion) | Human reviewer | The exclusion decision was first recorded on this date |
| `verified_at` (exclusion) | Human reviewer | The exclusion reason was last re-checked against current sources on this date; never automated |

Automation must never update `verified_at`.

## License evidence

Each project has one evidence record keyed by `project_id`. Its `items` cover every identifier in the project's `licenses` list:

- `license_id` is a taxonomy identifier;
- `scope` states the component, path, documentation, assets, or product terms covered;
- `kind` is `git_blob` or `web_terms`;
- Git evidence records `path`, `url`, `blob_sha`, and `immutable_url`;
- web terms record an authoritative `url` and `verified_at`, with no claim of immutability.

The evidence set may include multiple licenses for one repository. Blob identity proves content, not scope; reviewers must inspect path maps, package manifests, and relevant terms.

## Exclusion record

`exclusions.json` is the published record of reviewed scope-boundary decisions. Its envelope is `{"generated_at": <ISO date>, "entries": [...]}` and each entry carries exactly `name`, `repo` (owner/name or `null`), `reason`, `useful_lesson`, `excluded_at`, `verified_at`, and an optional first-party `url` for a product without a canonical repository. `excluded_at` is the date the decision was first recorded and never moves; `verified_at` is the date a human last re-read the reason against the repository or product as it stands and is bumped by every re-review, whether or not the decision changed. Validation requires both as ISO dates with `verified_at` no earlier than `excluded_at`. An entry that no longer holds leaves this file for `candidates.json`, or for `packs.json` after the complete pack review, in the same change; a repository never appears in two of `projects.json`, `packs.json`, `candidates.json`, and `exclusions.json`.

## Review queues

Candidate records contain discovery facts and proposed classification only. They intentionally have no editorial score, evidence, confidence assessment, or editorial verification date. Manually added candidates may omit `repo` when the product has no canonical GitHub repository.

A candidate may optionally carry a `triage` block: gathered evidence and a routing proposal, never an editorial conclusion. See [ADR 024](adr/024-candidate-triage-proposals-are-unaccepted-evidence.md). Its fields are `verdict` (`out_of_scope`, `held`, or `review_ready`), `rule`, `finding`, non-empty `evidence`, `proposed_at`, and `proposer`; `held_by` is optional and present if and only if `verdict` is `held`. Validation rejects a `finding` that names a `system_family` or `primary_role` taxonomy id. Each evidence entry carries `label`, `url`, `kind` (`git_blob` or `web`), `content_sha256`, and `fetched_at`; `git_blob` evidence additionally carries `blob_sha` and a matching `immutable_url`. `proposed_system_family` and `proposed_primary_role` may be null only when the candidate's `triage.held_by` is set — a record can wait for a collection that does not exist yet, but only while a human-named decision holds it.

The unattended candidate-triage routine is narrower than the stored schema: it emits and
rechecks only one GitHub LICENSE and one README `git_blob` evidence item per candidate.
`web` remains available for human-authored triage of non-GitHub records and is rechecked
only through the bounded, public-HTTPS manual path.

Model candidate records contain a stable Atlas `id`, models.dev `source_id`, attributed `source_metadata`, provisional status, discovery and last-seen dates, and the complete review checklist. Their envelope records the pinned repository commit, immutable archive URL, source path, MIT license, archive SHA-256, total source count, and text-output eligible count. They contain no Atlas model type, distribution conclusion, license classification, evidence, boundary prose, score, or `verified_at`; those fields exist only after human review. Reviewed model `source_id` values must be absent from this queue. Every candidate must match the same source row in `models-dev.json`, but the source snapshot is not itself workflow state.

Model dispositions are the durable human record of what the queue must not carry. Unlike system candidates, model queue entries are regenerated wholesale by the importer and cannot hold per-record state, so holds and exclusions live in `model-dispositions.json` instead of on the queue entries. Each entry carries a models.dev `source_id`, a `disposition` of `held` (not now, may return) or `excluded` (never in this shape), a non-empty `reason`, and `decided_at`. The importer filters dispositioned IDs out of the queue while keeping them in the eligible count, promotion refuses them until the disposition is lifted, and validation requires the eligible count to equal queued plus reviewed plus dispositioned source IDs. A dispositioned ID must exist in the source snapshot and must not be reviewed; both conditions fail loudly so stale dispositions get pruned instead of lingering.

License-review records correspond one-to-one with projects whose `license_review_status` is `review_required`. Automation may add or preserve an incident, but only a human review may resolve it. Project lifecycle status does not change merely because license evidence became stale.

See `OPERATIONS.md` for promotion and resolution procedures.

`directory/hn-signals.json` is the attention-source signal queue, rebuilt wholesale from one
day's window by every sweep and carrying nothing forward, so it holds no durable state and
no assessment in it survives the next sweep; it is populated only by the
daily sweep in `scripts/sweep_hackernews.py`; see
[ADR 028](adr/028-attention-sources-are-pointers-not-claims.md). Its envelope is
`{"version": "1.0", "updated_at": <ISO datetime>, "source": {...}, "signals": [...]}`. When
the queue holds any signals, `source` records the query `endpoint`, the swept
`window_start` and `window_end`, the `points_floor` applied, the pre-cap `story_count`, the
kept `eligible_count`, and a `truncated` boolean that is true exactly when the run's cap
dropped qualifying stories that cleared the floor.

Each signal carries provenance only, never a classification: `story_id`, `story_url`,
`title`, `url`, `points`, `num_comments`, `submitted_at`, `page_status` (`readable`,
`unreadable`, or `failed`), `content_sha256` (present only when `page_status` is
`readable`), `fetched_at`, `status` (always `provisional`), and `discovered_at`.

A signal may optionally carry one `assessment` block, added by the local
`docs/routines/hn-signals.md` routine: `verdict` (`worth_review`, `out_of_scope`, or
`unreadable`), `rule`, `finding`, non-empty `evidence`, `proposed_at`, and `proposer`. Each
evidence entry carries `label`, `url`, `kind` (always `web`), `content_sha256`, and
`fetched_at`, and every entry must cite the signal's own pinned page: validation rejects
an evidence `url` or `content_sha256` that differs from the signal's, because the routine
is handed exactly one page and a citation to any other is one nobody fetched. `proposer`
is `hn-signals` for a block the routine wrote or `human` for one a reviewer edited in
place — a human's disposition is never recorded as an unattended proposal. A signal whose `page_status` is not `readable` may carry only the
`unreadable` verdict — validation rejects any other verdict on a page nobody could read —
and validation rejects a `finding` or `rule` that names a `system_family` or `primary_role`
taxonomy id, because proposing a classification stays the human's alone. An `assessment` is
itself a proposal, never an accepted conclusion: promotion into `directory/candidates.json`
follows the same human review workflow as any other discovery.

## Discovery source registry

`discovery-sources.json` is operational configuration, not a catalog or evidence source. Each sorted entry identifies one authoritative HTTPS hub and feed plus the exact lowercase public DNS hosts allowed for the configured URLs, redirects, and feed item links. It contains no proposed family, role, license, source model, provider trait, score, or editorial conclusion.

The updater reads recent official announcements, applies conservative launch and relevance gates, and emits ordinary provisional candidate records. The official-feed updater never fetches linked article pages or treats registry inclusion as product eligibility. Feed observations receive the same complete human-review requirements as GitHub discoveries.

## Specification record

Specification records are intentionally independent from project records. They contain no `system_family`, role, score profile, score, or popularity metric.

- **Identity:** `id`, `name`, `short_name`, optional GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** taxonomy-backed `specification_type`, integration `scope`, and `status`.
- **Release:** nullable `current_version` and one or more `stewards`.
- **Boundary:** `standardizes` and `does_not_standardize` state the contract's limits.
- **Licensing:** complete `licenses`, `license_note`, and scoped `license_evidence`.
- **Relationships:** `related_specifications` references other records by ID without implying compatibility.
- **Review:** authoritative `evidence` plus human-owned `verified_at`.

Evidence is either an immutable Git blob or a dated authoritative web source. Every listed license must have one scoped evidence item. `LicenseRef-Unclear` is valid when the artifact is documented but no standalone reusable format license can be established; it must not be rewritten as open source by inference.

## Pack record

Pack records are independent from project records. They contain no `system_family`, role, score profile, score, or popularity metric, and the validator rejects each if present.

- **Identity:** `id`, `name`, optional `short_name`, one `steward`, GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** taxonomy-backed `pack_type`, non-empty `hosts` (`pack_hosts`), `install_mechanism` (`pack_install_mechanisms`), and `packaging_formats` naming `specifications.json` records (may be empty).
- **Composition:** `installs`, a paragraph counting what the pack places in the host from its pinned manifest and tree; optional `distribution_machinery` naming shipped install, sync, or validation scripts.
- **Boundary:** `not_a_system` states why the pack is unscored in ADR 031's terms, or that a marketplace lists packs rather than being one.
- **Lifecycle:** `status` from `project_statuses`.
- **Licensing:** complete `licenses`, `license_note`, and scoped `license_evidence`; `LicenseRef-Unclear` when no licence file is served.
- **Relationships:** optional `related_packs` and `related_systems` reference records by id without implying compatibility.
- **Review:** pinned `evidence` (manifest or skill frontmatter as a Git blob, plus dated web sources) and human-owned `verified_at`. A marketplace's `verified_at` dates its pinned manifest, never the catalogue behind it.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`; see [ADR 032](adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md).

## Inference service record

Inference-service records are independent from project and specification records. They contain no `system_family`, role, popularity metric, or model-quality ranking. Every record uses the dedicated `inference_service` score profile.

- **Identity and boundary:** `id`, `name`, `operator`, authoritative `url`, `description`, and `service_boundary`.
- **Classification:** one taxonomy-backed `service_type` plus non-empty `delivery_modes`, `model_sources`, and `api_styles`.
- **Operational constraints:** regional controls, retention controls, routing, and customization are reviewed prose because their exceptions cannot be represented safely as one boolean.
- **Editorial analysis:** strengths and tradeoffs describe the represented service boundary without ranking it.
- **Editorial score:** `score_profile` identifies the inference-service rubric and `score` contains every weighted operational dimension plus the calculated overall; it never scores model quality, price, or transient performance.
- **Terms and evidence:** one dated governing-terms record plus non-empty dated authoritative evidence.
- **Review:** both the record and collection carry `verified_at` dates.
- **Trust record (optional):** `trust` is absent until a human reviews the service for it. When present it has exactly `verified_at`, `properties`, and `findings`. `properties` has exactly `response_integrity`, `upstream_disclosure`, `credential_handling`, `cache_isolation`, `vulnerability_disclosure`, and `independent_audit`, each with `status` (from `trust_property_statuses`), a non-empty `note`, a first-party public `url`, a `scope`, and `verified_at`. The status says whether the operator publishes a statement, never what the service does, which is why it is exempt from the prose-only rule above: it compresses no capability, and the note carries every exception. `findings` is a list, possibly empty, of `{claim, published_at, source, operator_response, resolved}`; `source` is `{label, url, kind: "third_party", content_sha256, fetched_at}`, and `operator_response` and `resolved` are `null` or `{url, verified_at, summary}`. Every date in the block is on or before `trust.verified_at`, which is on or before the collection `verified_at`. The block is unscored and human-owned; see [ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md).

Strict validation rejects extra fields such as copied price tables or model inventories and verifies every score against the taxonomy weights. See [`INFERENCE_SERVICES.md`](INFERENCE_SERVICES.md), [ADR 010](adr/010-inference-services-are-unscored-service-records.md), [ADR 012](adr/012-inference-services-use-a-dedicated-score-profile.md), and [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md).

## Local runtime record

Local-runtime records are independent from project, specification, and inference-service records. They contain no `system_family`, role, popularity metric, or throughput measurement. Every record uses the dedicated `local_runtime` score profile. The envelope is `{"version": "1.0", "verified_at": <ISO date>, "runtimes": [...]}`.

- **Identity and boundary:** `id`, `name`, `maintainer`, `repo` (owner/name or `null`), authoritative `url`, `description`, and `runtime_boundary`, which names the adjacent managed service, assistant, or library the record is not.
- **Classification:** one taxonomy-backed `runtime_type` plus non-empty `accelerators`, `model_formats`, `serving_modes`, `api_styles`, and `deployment_surfaces`. `api_styles` reuses the `inference_api_styles` group because the trait describes the same documented contract on both sides of the service boundary.
- **Operational constraints:** `model_management`, `hardware_requirements`, and `operational_controls` are reviewed prose because their exceptions vary by build, platform, backend, and model architecture.
- **Editorial analysis:** strengths and tradeoffs describe the reviewed runtime without ranking it against another collection.
- **Licensing:** `licenses`, `source_model`, `license_note`, and inline `license_evidence` scoped in the manner of specification records. Local runtimes stay out of `license-evidence.json`, whose one-entry-per-project invariant is keyed on `project_id`, and out of the ADR 005 project drift machinery.
- **Editorial score:** `score_profile` identifies the local-runtime rubric and `score` contains every weighted execution dimension plus the calculated overall; it never scores model quality, throughput, latency, benchmark rank, or hardware cost.
- **Evidence and review:** non-empty dated authoritative evidence, and both the record and collection carry `verified_at` dates.
- **Live metadata (optional):** `stars` and `stars_verified_at`, automation-refreshed GitHub star counts for records with a `repo`. This is descriptive only and never enters `score`; ADR 015 deliberately excludes repository popularity from the local-runtime rubric. Both fields are `null` for a record without a `repo`.

Strict validation rejects fields outside this schema, enforces taxonomy membership, and verifies every score against the taxonomy weights. A cross-collection check additionally rejects any identifier that appears in more than one published collection, which is what keeps a runtime and its vendor's managed service distinct. See [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md), [ADR 015](adr/015-local-runtimes-are-self-operated-execution-records.md), and [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md).

## Model record

Model records are independent from projects, specifications, inference services, and local runtimes. They contain no `system_family`, role, popularity field, price, parameter count, benchmark, or performance measurement. Every record uses the dedicated `model_access` score profile. The envelope is `{"version": "1.0", "verified_at": <ISO date>, "source": {...}, "models": [...]}`; `source` identifies the models.dev repository and pinned full commit used for attributed discovery metadata.

- **Identity and boundary:** `id`, `source_id`, `name`, `developer`, authoritative `url`, `description`, and `access_boundary`, which distinguishes the release from its developer, APIs, hosts, runtimes, quantizations, fine-tunes, and applications. `source_id` is a models.dev ID present in the snapshot, or `null`. With `null`, `id` must be a stable slug, since Atlas reviewed the release before models.dev listed it and the record has no upstream identity to key on yet ([ADR 038](adr/038-reviewed-models-may-precede-their-models-dev-source-row.md)).
- **Classification:** one taxonomy-backed `model_type` and non-empty `distribution_modes`.
- **Imported source metadata:** with a non-null `source_id`, `source_metadata` is the models.dev copy taken at promotion or linking: name, description, family, partial dates, modalities, tri-state capability flags, nullable token limits, reported open-weight and license values, and source/weight links. It is attributed discovery metadata, never a substitute for reviewed evidence. With `source_id: null`, `source_metadata` is authored by Atlas from the developer's first-party documentation, `metadata_verified_at` attests it, and `modalities.output` must contain `text` because the importer's modality gate never sees the record.
- **Licensing:** complete `licenses`, one coherent `source_model`, `license_review_status`, `license_note`, and inline scoped `license_evidence`. Models stay out of `license-evidence.json`, whose invariant applies only to projects.
- **Editorial analysis:** strengths and tradeoffs describe access and deployability without making a quality claim.
- **Editorial score:** `score_profile` is `model_access`; `score` holds license clarity, artifact availability, deployment portability, serving reach, lifecycle transparency, documentation provenance, and calculated overall. It excludes output quality, benchmarks, parameter count, price, latency, throughput, popularity, and safety rankings.
- **Evidence and review:** non-empty dated authoritative evidence, human-reviewed `metadata_verified_at` for the attributed source snapshot, and human-owned `verified_at` for Atlas conclusions. The queue importer never updates either field on a published record.

Strict validation rejects extra fields, unknown taxonomy values, incomplete evidence, score mismatches, duplicate `source_id` values, overlap with the model candidate queue, and model IDs that collide with any other published collection. It also rejects a non-null `source_id` absent from the complete models.dev source snapshot, and a snapshot row whose `id` equals a differently linked record's `id` (a null-source record whose `id` matches a snapshot row that another linked record already claims is rejected the same way). See [`MODELS.md`](MODELS.md), [ADR 025](adr/025-model-releases-are-independent-curated-records.md), and [ADR 038](adr/038-reviewed-models-may-precede-their-models-dev-source-row.md).

## models.dev source record

`models-dev.json` is an automated, attributed source snapshot rather than an Atlas-reviewed collection. Its envelope is `{"version": "1.0", "updated_at": <ISO date>, "source_record_count": n, "source": {...}, "models": [...]}`. `source` pins the models.dev repository ref to a full commit and immutable archive URL, records the archive SHA-256, source path, and MIT license.

Each source row contains only `id`, `source_id`, and `source_metadata`. The metadata shape is the same attributed block a reviewed model preserves: name, nullable description and family, partial release/update/knowledge dates, input and output modalities, tri-state reported capabilities, nullable token limits, reported open-weight and license values, and selected HTTPS source or weight links. Every valid upstream `models/**/*.toml` row is retained, including records that do not output text.

Source rows carry no Atlas `developer` conclusion, model type, distribution mode, source model, reviewed license, evidence, prose boundary, score, or verification date. The web projection derives display-only fields, overlays a reviewed `models.json` record with the same `source_id`, or with the same `id` when the reviewed record has no `source_id` yet, and labels every remaining row as imported and unscored. See [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md) and [ADR 038](adr/038-reviewed-models-may-precede-their-models-dev-source-row.md).
