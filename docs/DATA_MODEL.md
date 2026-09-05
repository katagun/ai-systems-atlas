# Data model

Use this reference when editing JSON or code that consumes it. Taxonomy rationale belongs in `TAXONOMY.md`; review judgment belongs in `CURATION.md`.

## Canonical and published data

`directory/` is canonical. The browser consumes synchronized copies of nine files:

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
| `candidates.json` | Provisional discovery and migration queue | No |
| `model-candidates.json` | Imported models.dev discovery metadata awaiting complete human review | No |
| `license-review.json` | Open license-evidence review incidents | No |
| `discovery-sources.json` | Allowlisted official feeds used to discover non-GitHub candidates | No |

Run `uv run python scripts/sync_web_data.py` and `uv run python scripts/build_share_pages.py` after manually changing published data.

The browser presents projects, inference services, local runtimes, and a de-duplicated union of models.dev source rows plus reviewed models through one Directory surface, but that is a presentation-layer union only. Mixed search may normalize shared identity fields for rendering; it never changes a canonical schema or makes scores comparable. Models is a sibling view because its model-artifact question is distinct from the operational Directory. See [ADR 013](adr/013-distinct-collections-share-one-directory-surface.md), [ADR 025](adr/025-model-releases-are-independent-curated-records.md), and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).

## Project record

Fields are grouped by responsibility:

- **Identity:** `id`, `name`, optional GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** `system_family`, `primary_role`, `secondary_roles`, and `score_profile`.
- **Traits:** agent relationship, optional reviewed provider relationship and model backends, architecture, retrieval, capture, lifecycle, deployment, local-first behavior, editability, provenance, and agent-only operation fields.
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

Automation must never update `verified_at`.

## License evidence

Each project has one evidence record keyed by `project_id`. Its `items` cover every identifier in the project's `licenses` list:

- `license_id` is a taxonomy identifier;
- `scope` states the component, path, documentation, assets, or product terms covered;
- `kind` is `git_blob` or `web_terms`;
- Git evidence records `path`, `url`, `blob_sha`, and `immutable_url`;
- web terms record an authoritative `url` and `verified_at`, with no claim of immutability.

The evidence set may include multiple licenses for one repository. Blob identity proves content, not scope; reviewers must inspect path maps, package manifests, and relevant terms.

## Review queues

Candidate records contain discovery facts and proposed classification only. They intentionally have no editorial score, evidence, confidence assessment, or editorial verification date. Manually added candidates may omit `repo` when the product has no canonical GitHub repository.

A candidate may optionally carry a `triage` block: gathered evidence and a routing proposal, never an editorial conclusion. See [ADR 024](adr/024-candidate-triage-proposals-are-unaccepted-evidence.md). Its fields are `verdict` (`out_of_scope`, `held`, or `review_ready`), `rule`, `finding`, non-empty `evidence`, `proposed_at`, and `proposer`; `held_by` is optional and present if and only if `verdict` is `held`. Validation rejects a `finding` that names a `system_family` or `primary_role` taxonomy id. Each evidence entry carries `label`, `url`, `kind` (`git_blob` or `web`), `content_sha256`, and `fetched_at`; `git_blob` evidence additionally carries `blob_sha` and a matching `immutable_url`. `proposed_system_family` and `proposed_primary_role` may be null only when the candidate's `triage.held_by` is set — a record can wait for a collection that does not exist yet, but only while a human-named decision holds it.

Model candidate records contain a stable Atlas `id`, models.dev `source_id`, attributed `source_metadata`, provisional status, discovery and last-seen dates, and the complete review checklist. Their envelope records the pinned repository commit, immutable archive URL, source path, MIT license, archive SHA-256, total source count, and text-output eligible count. They contain no Atlas model type, distribution conclusion, license classification, evidence, boundary prose, score, or `verified_at`; those fields exist only after human review. Reviewed model `source_id` values must be absent from this queue. Every candidate must match the same source row in `models-dev.json`, but the source snapshot is not itself workflow state.

License-review records correspond one-to-one with projects whose `license_review_status` is `review_required`. Automation may add or preserve an incident, but only a human review may resolve it. Project lifecycle status does not change merely because license evidence became stale.

See `OPERATIONS.md` for promotion and resolution procedures.

## Discovery source registry

`discovery-sources.json` is operational configuration, not a catalog or evidence source. Each sorted entry identifies one authoritative HTTPS hub and feed plus the exact lowercase public DNS hosts allowed for the configured URLs, redirects, and feed item links. It contains no proposed family, role, license, source model, provider trait, score, or editorial conclusion.

The updater reads recent official announcements, applies conservative launch and relevance gates, and emits ordinary provisional candidate records. It never fetches linked article pages or treats registry inclusion as product eligibility. Feed observations receive the same complete human-review requirements as GitHub discoveries.

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

## Inference service record

Inference-service records are independent from project and specification records. They contain no `system_family`, role, popularity metric, or model-quality ranking. Every record uses the dedicated `inference_service` score profile.

- **Identity and boundary:** `id`, `name`, `operator`, authoritative `url`, `description`, and `service_boundary`.
- **Classification:** one taxonomy-backed `service_type` plus non-empty `delivery_modes`, `model_sources`, and `api_styles`.
- **Operational constraints:** regional controls, retention controls, routing, and customization are reviewed prose because their exceptions cannot be represented safely as one boolean.
- **Editorial analysis:** strengths and tradeoffs describe the represented service boundary without ranking it.
- **Editorial score:** `score_profile` identifies the inference-service rubric and `score` contains every weighted operational dimension plus the calculated overall; it never scores model quality, price, or transient performance.
- **Terms and evidence:** one dated governing-terms record plus non-empty dated authoritative evidence.
- **Review:** both the record and collection carry `verified_at` dates.

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

- **Identity and boundary:** `id`, models.dev `source_id`, `name`, `developer`, authoritative `url`, `description`, and `access_boundary`, which distinguishes the release from its developer, APIs, hosts, runtimes, quantizations, fine-tunes, and applications.
- **Classification:** one taxonomy-backed `model_type` and non-empty `distribution_modes`.
- **Imported source metadata:** `source_metadata` contains models.dev's name, description, family, partial dates, modalities, tri-state capability flags, nullable token limits, reported open-weight and license values, and source/weight links. It is attributed discovery metadata, never a substitute for reviewed evidence.
- **Licensing:** complete `licenses`, one coherent `source_model`, `license_review_status`, `license_note`, and inline scoped `license_evidence`. Models stay out of `license-evidence.json`, whose invariant applies only to projects.
- **Editorial analysis:** strengths and tradeoffs describe access and deployability without making a quality claim.
- **Editorial score:** `score_profile` is `model_access`; `score` holds license clarity, artifact availability, deployment portability, serving reach, lifecycle transparency, documentation provenance, and calculated overall. It excludes output quality, benchmarks, parameter count, price, latency, throughput, popularity, and safety rankings.
- **Evidence and review:** non-empty dated authoritative evidence, human-reviewed `metadata_verified_at` for the attributed source snapshot, and human-owned `verified_at` for Atlas conclusions. The queue importer never updates either field on a published record.

Strict validation rejects extra fields, unknown taxonomy values, incomplete evidence, score mismatches, duplicate `source_id` values, overlap with the model candidate queue, and model IDs that collide with any other published collection. See [`MODELS.md`](MODELS.md) and [ADR 025](adr/025-model-releases-are-independent-curated-records.md).

## models.dev source record

`models-dev.json` is an automated, attributed source snapshot rather than an Atlas-reviewed collection. Its envelope is `{"version": "1.0", "updated_at": <ISO date>, "source_record_count": n, "source": {...}, "models": [...]}`. `source` pins the models.dev repository ref to a full commit and immutable archive URL, records the archive SHA-256, source path, and MIT license.

Each source row contains only `id`, `source_id`, and `source_metadata`. The metadata shape is the same attributed block a reviewed model preserves: name, nullable description and family, partial release/update/knowledge dates, input and output modalities, tri-state reported capabilities, nullable token limits, reported open-weight and license values, and selected HTTPS source or weight links. Every valid upstream `models/**/*.toml` row is retained, including records that do not output text.

Source rows carry no Atlas `developer` conclusion, model type, distribution mode, source model, reviewed license, evidence, prose boundary, score, or verification date. The web projection derives display-only fields, overlays a reviewed `models.json` record with the same `source_id`, and labels every remaining row as imported and unscored. See [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).
