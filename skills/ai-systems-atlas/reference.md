# AI Systems Atlas — data reference

Loaded on demand from [SKILL.md](SKILL.md) when a query needs a field the summary there doesn't name.

## Envelopes

- `projects.json`: `{generated_at, policy, projects: [...]}`
- `specifications.json`: `{version, verified_at, specifications: [...]}`
- `inference-services.json`: `{version, verified_at, services: [...], generated_at}`
- `local-runtimes.json`: `{version, verified_at, runtimes: [...]}`
- `packs.json`: `{version, verified_at, packs: [...]}`
- `labs.json`: `{version, verified_at, labs: [...]}`
- `models.json`: `{version, verified_at, source: {...}, models: [...]}`
- `models-dev.json`: `{version, updated_at, source_record_count, source: {...}, models: [...]}`
- `taxonomy.json`: `{version, principle, <enum and score-profile groups, listed below>}`
- `exclusions.json`: `{generated_at, entries: [...]}`

## `projects.json` record fields

`id, system_family, score_profile, name, repo, url, description, primary_role, secondary_roles, agent_relation, architectures, retrieval_modes, capture_modes, memory_lifecycle, canonical_data, deployment, agent_interfaces, execution_boundaries, agent_capabilities, local_first, human_editable, provenance, status, stars, stars_verified_at, historical_stars, current_repo_note, score, strengths, weaknesses, why_it_matters, research_confidence, verified_at, pushed_at, forks, open_issues, metadata_verified_at, github_detected_license, licenses, source_model, license_review_status`

`score` holds the profile's weighted dimensions plus `overall`. See [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md) for full field semantics, source/license classification rules, and lifecycle transitions.

## `specifications.json` record fields

`id, name, short_name, specification_type, scope, status, current_version, stewards, repo, url, description, standardizes, does_not_standardize, licenses, license_note, related_specifications, evidence, license_evidence, verified_at`

Never scored. `specification_type` is one of `protocol`, `metadata_schema`, `instruction_convention`, `capability_format`, `package_format`. See [docs/SPECIFICATIONS.md](../../docs/SPECIFICATIONS.md).

## `packs.json` record fields

`id, name, short_name, steward, repo, url, description, pack_type, hosts, packaging_formats, install_mechanism, installs, distribution_machinery, not_a_system, status, licenses, license_note, license_evidence, related_packs, related_systems, evidence, verified_at`

Never scored and never carrying stars. `pack_type` is one of `skills_bundle`, `plugin`, `process_kit`, `vault_bundle`, `marketplace`; `hosts` and `install_mechanism` use the `pack_hosts` and `pack_install_mechanisms` taxonomy groups; `packaging_formats` names `specifications.json` records. `installs` states what the pack places in the host, counted from its pinned tree; `not_a_system` states why it is not a scored record. A marketplace record never lists, counts, or reviews its entries. See [docs/PACKS.md](../../docs/PACKS.md).

## `labs.json` record fields

`id, name, url, description, lab_type, headquarters, parent_organization, organization_note, catalog_names, systems, channels, safety_framework, evidence, verified_at`

Never scored, ranked, or carrying a licence. `lab_type` and `headquarters` use the `lab_types` and `countries` taxonomy groups (`headquarters` is `none_listed` when the organization's own pages and filings give no single headquarters, base, or principal address); each of `channels` is `{kind, url}` with `kind` from `lab_channel_kinds`; `parent_organization` and `safety_framework` (`{title, url, verified_at}`) are present only when first-party evidence supports them. A lab's other records are joined, not copied: reviewed models whose `developer` is in `catalog_names`; services by `operator`, runtimes by `maintainer`, specifications by any of `stewards`, and packs by `steward`, each in `catalog_names`; models.dev rows in the namespaces (`source_id` before the `/`) of the lab's reviewed models; and systems listed by id in `systems`. See [docs/LABS.md](../../docs/LABS.md).

## `inference-services.json` record fields

`id, name, operator, service_type, url, description, service_boundary, delivery_modes, model_sources, api_styles, regional_controls, retention_controls, routing, customization, strengths, tradeoffs, score_profile, score, terms, evidence, verified_at`

`trust` is optional and unscored: `{verified_at, properties: {response_integrity, upstream_disclosure, credential_handling, cache_isolation, vulnerability_disclosure, independent_audit}, findings: [...]}`. Each property is `{status, note, url, scope, verified_at}` with `status` from the `trust_property_statuses` taxonomy group. Each finding is `{claim, published_at, source, operator_response, resolved}` with a `third_party` pinned source. Absent means the service has not been examined; an empty `findings` list is not evidence of safety. See [docs/adr/029-trust-records-are-unscored-and-never-first-hand.md](../../docs/adr/029-trust-records-are-unscored-and-never-first-hand.md).

`score_profile` is always `inference_service`; its eight dimensions are defined in [docs/INFERENCE_SERVICES.md](../../docs/INFERENCE_SERVICES.md). The profile never scores model quality, price, or throughput.

## `local-runtimes.json` record fields

`id, name, maintainer, runtime_type, repo, url, description, runtime_boundary, accelerators, model_formats, serving_modes, api_styles, deployment_surfaces, model_management, hardware_requirements, operational_controls, strengths, tradeoffs, licenses, source_model, license_note, license_evidence, score_profile, score, evidence, verified_at, stars, stars_verified_at`

`score_profile` is always `local_runtime`; its eight dimensions are defined in [docs/LOCAL_RUNTIMES.md](../../docs/LOCAL_RUNTIMES.md). The profile never scores throughput, latency, or hardware cost.

## `models.json` record fields

`id, source_id, name, developer, url, description, model_type, distribution_modes, source_metadata, licenses, source_model, license_review_status, license_note, license_evidence, access_boundary, strengths, tradeoffs, score_profile, score, evidence, metadata_verified_at, verified_at`

`source_id` is `null` when Atlas reviewed the release before models.dev listed it; `source_metadata` is then authored by Atlas from developer documentation rather than imported. Otherwise `source_metadata` preserves provider-independent discovery facts imported from the pinned models.dev snapshot. The surrounding fields are human-reviewed Atlas conclusions. `score_profile` is always `model_access`; see [docs/MODELS.md](../../docs/MODELS.md). The profile never scores output quality, benchmarks, parameter count, current price, latency, or throughput.

## `models-dev.json` source fields

Each source row contains `id, source_id, source_metadata`. `source_metadata` contains `name, description, family, release_date, last_updated, knowledge_cutoff, modalities, capabilities, limits, reported_open_weights, reported_license, links, weights`. These are models.dev-attributed source claims, not Atlas conclusions. They carry no Atlas model type, distribution mode, license classification, evidence, score, or `verified_at`; use `models.json` when the question requires reviewed terms or comparison.

## `taxonomy.json` top-level groups

`version, principle, system_families, primary_roles, agent_relations, provider_relationships, model_backends, model_types, model_modalities, model_distribution_modes, inference_service_types, inference_delivery_modes, inference_model_sources, inference_api_styles, trust_property_statuses, local_runtime_types, runtime_accelerators, runtime_model_formats, runtime_serving_modes, runtime_deployment_surfaces, inference_service_score_profile, local_runtime_score_profile, model_score_profile, specification_types, specification_scopes, specification_statuses, pack_types, pack_hosts, pack_install_mechanisms, lab_types, lab_channel_kinds, countries, architectures, retrieval_modes, capture_modes, memory_lifecycle, agent_interfaces, execution_boundaries, agent_capabilities, deployment_modes, project_statuses, license_review_statuses, provenance_levels, research_confidence_levels, licenses, source_models, score_profiles`

Each group is a list of enum entries (or a scoring-profile object for the three `*_score_profile` keys). Fetch `taxonomy.json` before filtering by any enum field to confirm current valid values — enums are added and renamed over time, and this reference is not re-verified on every taxonomy change.
