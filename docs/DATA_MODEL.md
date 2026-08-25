# Data model

Use this reference when editing JSON or code that consumes it. Taxonomy rationale belongs in `TAXONOMY.md`; review judgment belongs in `CURATION.md`.

## Canonical and published data

`directory/` is canonical. The browser consumes synchronized copies of four files:

| Canonical file | Purpose | Published to `web/` |
|---|---|---|
| `projects.json` | Reviewed catalog and editorial scores | Yes |
| `taxonomy.json` | Enums, license allowlist, score profiles | Yes |
| `license-evidence.json` | Reviewed license evidence | Yes |
| `exclusions.json` | Relevant systems outside the gate | Yes |
| `candidates.json` | Provisional discovery queue | No |
| `quarantine.json` | Open license-review incidents | No |

Run `uv run python scripts/sync_web_data.py` after manually changing published data.

## Project record

Fields are grouped by responsibility:

- **Identity:** `id`, `name`, `repo`, `url`, `description`.
- **Classification:** `system_family`, `primary_role`, `secondary_roles`, `score_profile`.
- **Traits:** agent relationship, architecture, retrieval, capture, lifecycle, deployment, local-first behavior, editability, provenance, and agent-only operation fields.
- **License gate:** `license`, `license_scope`, `status`.
- **Editorial review:** score dimensions, strengths, weaknesses, significance, confidence, and `verified_at`.
- **Live metadata:** stars, forks, open issues, push time, detected license, and their metadata timestamps.

All enum values and score dimensions come from `taxonomy.json`. Validation rejects unknown values and incompatible family, role, or score-profile combinations.

## Timestamp semantics

| Field | Owner | Meaning |
|---|---|---|
| `verified_at` | Human reviewer | Editorial classification, prose, and score were reviewed on this date |
| `metadata_verified_at` | Automation | Repository-level GitHub metadata was refreshed on this date |
| `stars_verified_at` | Automation | `stars` was observed on this date |
| `generated_at` | Automation/editor | The published project document was last regenerated |

Automation must never update `verified_at`.

## License evidence

Each main project has exactly one evidence record:

- `url` identifies the human-readable repository source path and may follow a branch;
- `blob_sha` identifies the exact reviewed Git blob content;
- `immutable_url` addresses that blob through GitHub's Git Data API;
- `spdx_id` must match the project license and the taxonomy allowlist.

The blob identity proves content, not license scope. A human must still inspect the repository layout and determine whether restricted code changes the inclusion decision.

## Review queues

Candidate records contain discovery facts and proposed classification only. They intentionally have no editorial score, evidence, confidence assessment, or editorial verification date.

Quarantine records correspond one-to-one with projects whose status is `quarantined`. Automation may add or preserve a quarantine, but only a human review may resolve it.

See `OPERATIONS.md` for promotion and resolution procedures.
