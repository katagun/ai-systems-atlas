# Backlog

This is the source of truth for actionable repository work. Policy and field definitions belong in `docs/`; completed implementation detail belongs in Git history.

## Now

- [ ] Review the 66 provisional records in small, evidence-backed batches, starting with provider-native agent SDKs, then framework SDKs, then data-analysis agents.
- [ ] Decide whether the static site needs a repository-owned deployment workflow and document the chosen hosting path.
- [ ] Add automated accessibility checks when a browser test runtime can be introduced without compromising the dependency-free application.

## Next

- [ ] Add a small review command that promotes a candidate only after all required editorial and license fields are present.
- [ ] Add a stale-review report that distinguishes editorial age from GitHub metadata age without changing either.
- [ ] Document and test repository rename/transfer handling while preserving evidence history.
- [ ] Add link checking for project, source-license, and immutable-evidence URLs with rate-limit-aware caching.
- [ ] Add provider-relationship UI detail only after enough reviewed projects carry the trait; add a filter only when it yields meaningful choices.

## Later

- [ ] Reassess an unscored ecosystem index for model providers, plain API SDKs, adapters, and observability clients after provider traits have been used in real reviews.

## Completed on 2026-08-25

- [x] Define provider relationships as optional reviewed traits in ADR 006, taxonomy, validation, and task-routed documentation.
- [x] Add Claude Agent SDK for Python and DeepSeek Harness to the provisional queue; exclude the proprietary TypeScript SDK.
- [x] Make discovery recognize agent harnesses and derive candidate families from taxonomy-owned role policy.
- [x] Make license drift fail closed for every detected license mismatch.
- [x] Preserve candidate and quarantine queues as versioned review artifacts.
- [x] Separate editorial `verified_at` from `metadata_verified_at` and field-specific live dates.
- [x] Centralize the curated license allowlist in the taxonomy and enforce it in validation.
- [x] Tie immutable evidence URLs to recorded Git blob SHAs.
- [x] Expand schema validation across taxonomy axes, queues, dates, URLs, and published copies.
- [x] Add updater regression tests and dependency-free web behavior tests.
- [x] Preserve multi-role finder constraints when opening the directory.
- [x] Backfill live metadata for all active catalog entries.
- [x] Add task-routed documentation for humans and AI agents.

## Backlog hygiene

- Keep items outcome-focused and independently verifiable.
- Link to a policy or ADR instead of duplicating it here.
- Move finished work to the dated completed section; remove obsolete items.
- Do not put provisional catalog candidates in this file—the candidate queue is their canonical home.
