# AI Systems Atlas — data reference

Loaded on demand from [SKILL.md](SKILL.md) when a query needs a field the summary there doesn't name.

## Envelopes

- `projects.json`: `{generated_at, policy, projects: [...]}`
- `specifications.json`: `{version, verified_at, specifications: [...]}`
- `inference-services.json`: `{version, verified_at, services: [...], generated_at}`
- `local-runtimes.json`: `{version, verified_at, runtimes: [...]}`
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

## `inference-services.json` record fields

`id, name, operator, service_type, url, description, service_boundary, delivery_modes, model_sources, api_styles, regional_controls, retention_controls, routing, customization, strengths, tradeoffs, score_profile, score, terms, evidence, verified_at`

`score_profile` is always `inference_service`; its eight dimensions are defined in [docs/INFERENCE_SERVICES.md](../../docs/INFERENCE_SERVICES.md). The profile never scores model quality, price, or throughput.

## `local-runtimes.json` record fields

`id, name, maintainer, runtime_type, repo, url, description, runtime_boundary, accelerators, model_formats, serving_modes, api_styles, deployment_surfaces, model_management, hardware_requirements, operational_controls, strengths, tradeoffs, licenses, source_model, license_note, license_evidence, score_profile, score, evidence, verified_at, stars, stars_verified_at`

`score_profile` is always `local_runtime`; its eight dimensions are defined in [docs/LOCAL_RUNTIMES.md](../../docs/LOCAL_RUNTIMES.md). The profile never scores throughput, latency, or hardware cost.

## `models.json` record fields

`id, source_id, name, developer, url, description, model_type, distribution_modes, source_metadata, licenses, source_model, license_review_status, license_note, license_evidence, access_boundary, strengths, tradeoffs, score_profile, score, evidence, metadata_verified_at, verified_at`

`source_metadata` preserves provider-independent discovery facts imported from the pinned models.dev snapshot. The surrounding fields are human-reviewed Atlas conclusions. `score_profile` is always `model_access`; see [docs/MODELS.md](../../docs/MODELS.md). The profile never scores output quality, benchmarks, parameter count, current price, latency, or throughput.

## `models-dev.json` source fields

Each source row contains `id, source_id, source_metadata`. `source_metadata` contains `name, description, family, release_date, last_updated, knowledge_cutoff, modalities, capabilities, limits, reported_open_weights, reported_license, links, weights`. These are models.dev-attributed source claims, not Atlas conclusions. They carry no Atlas model type, distribution mode, license classification, evidence, score, or `verified_at`; use `models.json` when the question requires reviewed terms or comparison.

## `taxonomy.json` top-level groups

`version, principle, system_families, primary_roles, agent_relations, provider_relationships, model_backends, inference_service_types, inference_delivery_modes, inference_model_sources, inference_api_styles, local_runtime_types, runtime_accelerators, runtime_model_formats, runtime_serving_modes, runtime_deployment_surfaces, model_types, model_modalities, model_distribution_modes, inference_service_score_profile, local_runtime_score_profile, model_score_profile, specification_types, specification_scopes, specification_statuses, architectures, retrieval_modes, capture_modes, memory_lifecycle, agent_interfaces, execution_boundaries, agent_capabilities, deployment_modes, project_statuses, license_review_statuses, provenance_levels, research_confidence_levels, licenses, source_models, score_profiles`

Each group is a list of enum entries (or a scoring-profile object for the three `*_score_profile` keys). Fetch `taxonomy.json` before filtering by any enum field to confirm current valid values — enums are added and renamed over time, and this reference is not re-verified on every taxonomy change.
