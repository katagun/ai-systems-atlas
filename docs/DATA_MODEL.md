# Data model

Use this reference when editing JSON or code that consumes it. Taxonomy rationale belongs in `TAXONOMY.md`; review judgment belongs in `CURATION.md`.

## Canonical and published data

`directory/` is canonical. The browser consumes synchronized copies of five files:

| Canonical file | Purpose | Published to `web/` |
|---|---|---|
| `projects.json` | Reviewed catalog and editorial scores | Yes |
| `taxonomy.json` | Enums, source models, licenses, and score profiles | Yes |
| `license-evidence.json` | Scoped reviewed license and terms evidence | Yes |
| `exclusions.json` | Reviewed scope-boundary decisions | Yes |
| `specifications.json` | Reviewed, unscored interoperability artifacts and evidence | Yes |
| `candidates.json` | Provisional discovery and migration queue | No |
| `license-review.json` | Open license-evidence review incidents | No |

Run `uv run python scripts/sync_web_data.py` after manually changing published data.

## Project record

Fields are grouped by responsibility:

- **Identity:** `id`, `name`, optional GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** `system_family`, `primary_role`, `secondary_roles`, and `score_profile`.
- **Traits:** agent relationship, optional reviewed provider relationship and model backends, architecture, retrieval, capture, lifecycle, deployment, local-first behavior, editability, provenance, and agent-only operation fields.
- **Licensing:** non-empty `licenses`, one `source_model`, and `license_review_status`.
- **Lifecycle:** `status`.
- **Editorial review:** score dimensions, strengths, weaknesses, significance, confidence, and `verified_at`.
- **Live metadata:** stars, forks, open issues, push time, detected license, and their metadata timestamps. These may be null for systems without a public GitHub repository.

All enum values and score dimensions come from `taxonomy.json`. Validation rejects unknown values and incompatible family, role, or score-profile combinations.

### Source and license traits

`source_model` is one of `open_source`, `mixed_open_source`, `open_core`, `source_available`, `proprietary`, or `unclear`. `licenses` lists every material reviewed identifier, including content or commercial terms that cover part of the represented system. Neither field controls inclusion.

The taxonomy assigns each license a kind. Validation keeps the two fields coherent: open-source models use only open-source terms; mixed-open-source models use at least two open code/content terms; open-core models combine an open-source core with restricted or proprietary terms; and source-available, proprietary, or unclear models include their corresponding term kind.

`license_review_status` is `verified` when evidence supports the reviewed classification and `review_required` when automation or a reviewer detected possible drift. Review-required systems remain visible.

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

License-review records correspond one-to-one with projects whose `license_review_status` is `review_required`. Automation may add or preserve an incident, but only a human review may resolve it. Project lifecycle status does not change merely because license evidence became stale.

See `OPERATIONS.md` for promotion and resolution procedures.

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
