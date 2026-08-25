# Directory curation policy

## Scope

The main catalog covers operational, GitHub-hosted open-source memory systems and AI agent systems. A project must be materially relevant to one role in `directory/taxonomy.json`.

## Inclusion gate

An entry belongs in `directory/projects.json` only when:

1. its relevant source is hosted on GitHub;
2. reviewed repository license files establish an OSI-compatible license for the relevant code;
3. the reviewed source path, immutable Git blob URL, and blob SHA are recorded in `directory/license-evidence.json`;
4. its family and role are materially relevant; and
5. its record identifies review confidence and verification date.

README badges and GitHub's detected SPDX value help locate evidence but do not replace reviewing license files. The license identifier must appear in the curated allowlist in `directory/taxonomy.json`. Mixed-license, open-core, source-available, proprietary, and unclear projects belong in `directory/exclusions.json` or quarantine. OpenHands is excluded because its repository combines an MIT core with source-available enterprise code.

The evidence blob proves the reviewed file's content, not its repository-wide scope. Reviewers must still inspect relevant directories and license notices.

## Scope boundaries

Vertical agents qualify when they own an iterative, tool-using workflow with domain-specific failure and recovery behavior. For text-to-SQL and data analysis, require query planning or refinement, execution, result validation or repair, and an explanation or analysis surface. Bare models, prompt templates, benchmarks, and datasets remain research inputs rather than operational agent systems.

Frameworks qualify when building or running tool-using agents is a primary outcome. A general LLM application library or optimizer that can support an agent is provisional until that behavior is shown to be material. Client SDKs do not make a proprietary hosted or enterprise-licensed platform eligible; classify the product represented by the reviewed source, not the brand attached to the SDK.

## Classification

Choose `system_family` from the project's primary outcome:

- choose `memory_system` when preserving, organizing, retrieving, or reasoning over durable knowledge is primary;
- choose `agent_system` when planning and acting through tools is primary.

Then assign one primary role belonging to that family. Record independent traits for architecture, retrieval, capture, lifecycle, deployment, local-first behavior, human editability, and provenance. Agent entries additionally require interfaces, execution boundaries, and capabilities.

## Editorial scores

Scores run from 0 to 10. The overall is the profile's weighted sum rounded to two decimals.

### Memory profile

- second-brain fit: 22%;
- data sovereignty: 18%;
- interoperability: 16%;
- memory intelligence: 18%;
- operational simplicity: 12%;
- maturity: 14%.

### Agent profile

- task reliability: 20%;
- tool use: 14%;
- autonomy: 10%;
- human control: 15%;
- observability and recovery: 12%;
- data sovereignty: 10%;
- interoperability: 9%;
- maturity: 10%.

The two profiles are not comparable. Do not produce a cross-family leaderboard or reuse a project's old score when moving it between families. Stars, forks, activity, and archival status are live signals; they never overwrite editorial scores.

## Human and automated fields

Human review owns classification, traits, editorial prose, scores, confidence, license evidence, and `verified_at`. Automation owns live GitHub values plus `metadata_verified_at` and field-specific timestamps such as `stars_verified_at`.

A GitHub-detected license mismatch is a review trigger, not a new license conclusion. Automation quarantines the entry; a human either updates the reviewed evidence and restores eligibility or moves the project to exclusions.

## Review workflow

1. Read the repository license files, understand their scope, and pin the reviewed blob content.
2. Review official documentation and enough implementation detail to establish the claimed behavior.
3. Choose family, then primary role, then orthogonal traits.
4. Score only against the matching family profile.
5. Record strengths, weaknesses, why the project matters, confidence, and verification date.
6. Remove or resolve any corresponding candidate or quarantine record.
7. Run `uv run python scripts/sync_web_data.py`.
8. Run validation and tests with `uv`, then exercise the static UI.

Automated discovery writes durable candidates with proposed family and role only. Candidates have no editorial score or editorial verification date. Discovery never auto-promotes entries and cannot complete editorial or license review.

See `docs/OPERATIONS.md` for candidate promotion and quarantine resolution runbooks.
