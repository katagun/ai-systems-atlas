# Directory curation policy

## Scope

The scored catalog covers reviewed operational memory, agent, and assistant systems. A system must be materially relevant to one role in `directory/taxonomy.json`; its source model and licenses describe the system but do not decide inclusion. Protocols, conventions, and packaging formats belong in the separate unscored specification collection described in [`SPECIFICATIONS.md`](SPECIFICATIONS.md).

## Inclusion gate

An entry belongs in `directory/projects.json` only when:

1. its operational product or implementation is identifiable from authoritative sources;
2. its family and role are materially relevant;
3. enough implementation or product evidence exists to assess its claimed behavior;
4. authoritative license or terms sources establish a reviewed `source_model` and complete `licenses` list; and
5. its record identifies evidence, research confidence, and verification date.

README badges and GitHub's detected SPDX value help locate evidence but do not replace reviewing license files, component maps, package manifests, or commercial terms. Record every material license from the taxonomy and classify the overall source model. Mixed-open-license, mixed-source, open-core, source-available, proprietary, and unclear systems remain eligible when they pass the operational scope gate. Use `open_core` only when the reusable open code is the operational core; use `mixed_source` when an open wrapper or component depends on a closed operational core or runtime.

An immutable blob proves the reviewed file's content, not repository-wide scope. Evidence therefore records the component or path it covers. Non-Git terms evidence is inherently mutable and must be labeled accordingly.

`directory/exclusions.json` is reserved for systems that fail a family or role boundary, duplicates, and non-operational research inputs. Relevant systems awaiting full review belong in `directory/candidates.json`, never exclusions solely because of licensing.

## Scope boundaries

Vertical agents qualify when they own an iterative, tool-using workflow with domain-specific failure and recovery behavior. For text-to-SQL and data analysis, require query planning or refinement, execution, result validation or repair, and an explanation or analysis surface. Bare models, prompt templates, benchmarks, and datasets remain research inputs rather than operational agent systems.

Frameworks qualify when building or running tool-using agents is a primary outcome. A general LLM application library or optimizer that can support an agent is provisional until that behavior is shown to be material. Client SDKs do not make an observability service or plain API client an agent system; classify the operational product represented by the reviewed evidence, not the brand attached to the SDK.

A provider-native SDK or harness qualifies only when agent execution—not model API access—is its primary outcome. The runtime may be open or proprietary; that difference belongs in `source_model`, evidence, weaknesses, and data-sovereignty scoring. Record provider coupling only from reviewed official support: missing provider traits mean “not reviewed,” never “provider agnostic.” Plain inference clients, provider adapters, and tracing clients remain outside the scored catalog.

Assistants qualify when a maintained end-user product owns a broad conversational workspace, durable context, connected information, model choice, or governed work assistance. Score the documented product boundary, not an underlying model benchmark or its most agentic optional feature. Keep branded products separate when their operational outcomes differ: an assistant, coding agent, SDK, and provider API from one vendor are not duplicate records. Split consumer and enterprise assistants when their governing terms, tenant data, administration, or integration boundaries materially differ. Thin prompt wrappers and raw API playgrounds remain outside the scored catalog.

## Classification

Choose `system_family` from the project's primary outcome:

- choose `memory_system` when preserving, organizing, retrieving, or reasoning over durable knowledge is primary;
- choose `agent_system` when planning and acting through tools is primary;
- choose `assistant_system` when broad interactive help in an end-user conversational workspace is primary.

Then assign one primary role belonging to that family. Record independent traits for source model, licenses, architecture, retrieval, capture, lifecycle, deployment, local-first behavior, editability, and provenance. Agent entries additionally require interfaces, execution boundaries, and capabilities.

## Superseded predecessors

When a maintainer publicly designates a named successor that the Atlas already publishes, set `status` to `superseded` and `superseded_by` to the successor's project id. The record keeps its family, role, traits, licenses, evidence, and score; supersession reports availability for a new choice, not review quality.

Use it only for a published maintainer declaration with a represented successor. Editorial judgment that a system has fallen behind belongs in weaknesses and the maturity dimension. A rename or rebrand stays one record with a note. See [ADR 016](adr/016-superseded-predecessors-keep-their-record.md).

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

### Assistant profile

- task reliability: 19%;
- context continuity: 14%;
- tools and integrations: 13%;
- human control: 13%;
- data governance: 13%;
- interoperability: 10%;
- usability and access: 8%;
- maturity: 10%.

The three profiles are not comparable. Do not produce a cross-family leaderboard or reuse a project's old score when moving it between families. Stars, forks, activity, and archival status are live signals; they never overwrite editorial scores.

## Human and automated fields

Human review owns classification, traits, editorial prose, scores, confidence, license evidence, source model, and `verified_at`. Automation owns live GitHub values plus `metadata_verified_at` and field-specific timestamps such as `stars_verified_at`.

A GitHub-detected license mismatch is a review trigger, not a new license conclusion. Automation marks `license_review_status` as `review_required` and opens a durable incident without hiding the project or changing its reviewed licenses or source model. A human resolves the evidence and classification.

## Review workflow

1. Review authoritative license or terms sources, understand their component scope, and pin Git blobs when available.
2. Review official documentation and enough implementation or product behavior to establish the claimed outcome.
3. Choose family, then primary role, then orthogonal traits.
4. Score only against the matching family profile.
5. Record strengths, weaknesses, why the project matters, confidence, and verification date.
6. Remove or resolve any corresponding candidate or license-review record.
7. Run `uv run python scripts/sync_web_data.py`.
8. Run validation and tests with `uv`, then exercise the static UI.

Automated discovery writes durable candidates with proposed family and role only. Candidates have no editorial score or editorial verification date. Discovery never auto-promotes entries and cannot complete editorial or license review.

See `docs/OPERATIONS.md` for candidate promotion and license-review resolution runbooks. See [ADR 007](adr/007-licenses-are-classification-not-inclusion.md) for the inclusion decision.
