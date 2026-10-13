# ADR 057: The Atlas is the reviewed layer over the inventories

**Status:** Proposed 2026-10-13, draft for owner review. Amends [ADR 055](055-automation-authors-reviewed-records-with-disclosure.md) (withdraws the scale goal in its context; its operating mode stands). Extends [ADR 039](039-openrouter-is-an-unpublished-cross-check-for-models-dev-gaps.md) (the terms gate now also governs Hugging Face). Leaves [ADR 027](027-complete-models-dev-source-catalog-is-published.md), [ADR 051](051-generative-media-releases-join-the-reviewed-models-collection.md), and [ADR 056](056-embedding-reranking-judgment-releases-are-reviewed-models.md) in force.

## Context

Hugging Face hosts millions of model repositories and an organization page for every lab that uploads to it. GitHub hosts every open agent, assistant, and memory system the Atlas has ever reviewed, and a great many it never will. models.dev and OpenRouter list the models that are callable through an API. Against those inventories the Atlas is small: on 2026-10-13 it publishes 281 systems, 375 reviewed models over a 550-row models.dev snapshot, 68 labs, 62 inference services, 22 specifications, 17 local runtimes, 17 robots, and 10 packs. It cannot ingest the inventories with a static, dependency-free site whose app payload is already past its 60 KB budget, and it would add nothing by doing so: the inventories are already free, queryable, and complete for what they host.

The repository already says most of this. `ROADMAP.md` states that adding records is no longer the binding constraint. `docs/COVERAGE.md` says the catalog is not an indiscriminate list of every model. The README's trust model treats GitHub metadata as a drift signal, models.dev rows as attributed source metadata, and OpenRouter listings as pointers that are never evidence. `docs/LABS.md` already links a lab to its Hugging Face organization. None of that is decided here again.

Three things are not settled, and the gap between the position and the catalog is where the position is false today.

1. **The scale goal.** ADR 055's context justifies automation-authored records by "a scale goal of 1,001 cataloged systems". That number appears nowhere else. It is the last place the repository treats breadth as the aim, and it points the review queue at the inventories' game.
2. **Licence evidence for weights.** Every one of the 444 licence-evidence items across the 375 reviewed models is `kind: web_terms`. The validator forbids `git_blob` evidence on a model because models have no `repo`, so no reviewed model pins a licence file by hash the way every reviewed system does. 153 items cite `huggingface.co`; 23 of those cite a mutable `blob/main` or `resolve/main` path. Roughly 148 `license_note` fields say the classification rests on a model-card declaration, a docs statement, or a repository without a licence file. `BACKLOG.md` holds the open question of whether a declared card tag can satisfy the evidence standard, and records that it "currently blocks reviewing any Hugging Face model release" while coverage notes record that several releases were published on "concordant card and docs declarations" alone. The catalog is doing one thing and the standard says another.
3. **Review age.** `scripts/report_review_age.py` shows 77 of 281 systems with a `verified_at` older than 45 days, and `BACKLOG.md` records that no threshold exists and the report is wired into nothing. A record that calls itself reviewed while its date silently ages is the one thing a host inventory would never be caught doing, because a host never claimed to review.

So the position has to be stated once, and then made true where it is not, or it is a slogan.

## Decision

### 1. Position

The inventories hold the long tail. The Atlas publishes reviewed conclusions about a bounded set of records: inclusion by operational role, licence and terms evidence pinned so it can be re-fetched and compared, trust records, family-scoped scores, reviewed flags, and the joins from a lab to its releases, the services that host them, the runtimes that run them, the specifications they implement, the packs installed into them, and the robots built on them. Breadth is not a goal and is never a measure of progress. The "1,001 cataloged systems" goal in ADR 055's context is withdrawn; ADR 055's decision, automation authorship under machine verification, sampled human checks, and disclosure, is the operating mode and is unchanged.

Coverage continues to be measured as `docs/COVERAGE.md` already measures it: by operational role, source-model diversity, and meaningful alternatives. A collection is complete when a reader with a decision to make finds the reviewed alternatives that exist for it, not when it approaches the inventory's count.

### 2. Hugging Face is an evidence host and a drift signal, not a source snapshot

The Atlas does not import a Hugging Face catalog. ADR 027 stands for models.dev alone: the mixed Directory keeps the complete models.dev snapshot as its discovery layer and gains no Hugging Face rows. A reader who wants the long tail of open weights is sent to the developer's Hugging Face organization, which lab records already link.

Hugging Face enters the catalog in exactly two ways.

- **Pinned licence evidence for weights.** A new evidence kind, `hub_blob`, records a licence or terms file served from a Hugging Face repository: `repo` (the hub repository id), `revision` (a full 40-hex commit), `path`, `url` (the human-readable blob page at that revision), `immutable_url` (`https://huggingface.co/<repo>/resolve/<revision>/<path>`), and `content_sha256` of the fetched bytes. Validation requires the full revision, requires `immutable_url` to be built from `repo`, `revision`, and `path`, and refuses a `main` or branch reference anywhere in the item. A `hub_blob` item is accepted on models, local runtimes, and specifications wherever `web_terms` is accepted today. A release whose material licence is pinned this way earns the same `license_clarity` as a system whose licence is pinned by Git blob, because the evidence is the same kind of thing: the text, at a commit, with a hash.
- **Declared-tag drift.** The weekly refresh compares a reviewed open-weight release's model-card `license:` tag with the Atlas classification and raises a review signal on disagreement, in the way GitHub SPDX detection already does for systems. A declared tag is a signal only. It never becomes a `licenses` entry on its own.

Both uses are behind the ADR 039 terms gate. No automated request reaches `huggingface.co` until a maintainer has read the live Hub terms and recorded `terms_reviewed_at` where ADR 039 records OpenRouter's. Until then the refresh reports that it skipped, and `hub_blob` items are created only by a reviewer's own fetch.

### 3. A declaration is recorded as a declaration

A model-card tag or a docs statement with no licence text behind it is a **declaration**. A release whose only evidence for a material licence is a declaration is recorded with the developer's declared licence and `license_review_status: declared`, a third value beside `verified` and `review_required`. The status renders on every surface that renders the licence, so a reader sees that the classification is the developer's own statement, not reviewed text. `license_clarity` already scores a declaration below a licence file and keeps doing so. `LicenseRef-Unclear` is unchanged and still means that no licence is declared or served at all.

This closes the open backlog question: a declared tag is sufficient to record the licence a developer declares, and insufficient to call it verified. The 148 records whose notes describe a declaration are re-read and moved to `declared` where the note is accurate, in one pass under ADR 055 verification, with the pass recorded in `docs/COVERAGE.md`. The 23 items that cite a mutable `main` path are re-pinned as `hub_blob` or re-recorded as declarations in the same pass.

### 4. Review order follows evidence value, not queue order

Eligibility is unchanged. ADR 051 and ADR 056 stand, the queue invariant that every eligible source row is queued, reviewed, or dispositioned stands, and the 110 queued candidates stay queued. What changes is the order in which the queue is worked and what a batch is for.

A review batch is drawn in this priority:

1. closed and API-only releases, whose terms exist nowhere else in structured, dated, evidenced form;
2. releases whose declared licence disagrees with a served licence file, or whose terms have changed since review;
3. releases that a reviewed service hosts, a reviewed lab develops, or a reviewed runtime targets, because the join is the value;
4. everything else.

A batch is sized by what it verifies, never by a count. "Six publishes" is an outcome some batches had and no batch is owed.

### 5. The Atlas publishes what the inventories cannot

Two generated analysis exports join `web/analysis/`, built by the existing export generator and regenerated with everything else:

- **declarations.csv**: every reviewed release whose licence status is `declared`, and every release whose declared tag disagrees with the Atlas classification or with a served licence file, with the evidence URLs and dates;
- **review_age.csv**: the `report_review_age.py` table for every reviewed record, so a stale review is visible in the data rather than only to someone who runs a script.

No review-age threshold is set here. The published table makes the gap measurable; whether the application marks a record stale at some age is the open backlog item and gets its own decision.

### 6. The exit signal lives in the roadmap

Whether the reviewed layer is worth maintaining is a roadmap question, and `ROADMAP.md` already carries exit signals in its own form. This ADR adds none. The follow-up roadmap edit states one measurable signal for the reviewed layer, external use of the published data and analysis files found by a dated sweep, and states that absence of that signal after a stated period is grounds to stop. A static site with no analytics cannot measure citations directly, so the roadmap names the proxies it will use.

## Alternatives considered

- **Mirror Hugging Face.** Rejected. The Hub API already serves it, a mirror adds no reviewed conclusion, the payload cannot carry it, the Hub terms have not been reviewed, and the models.dev snapshot already pins its source at a single commit and archive hash, which the Hub has no tree-level equivalent of.
- **Narrow Models to closed releases plus hash-reviewed open releases.** Rejected. It would supersede ADR 056 one day after acceptance and ADR 051 with it, strand 110 queued candidates with no disposition vocabulary, and recast more than a hundred published records as out of scope. Ordering the queue by evidence value reaches the same releases first without changing what is eligible.
- **Accept a declared tag as verified.** Rejected. AGENTS.md rule 5 rules a README or card claim insufficient for a licence classification, and nothing about the Hub changes that. Recording it as a declaration keeps the information and the honesty.
- **Keep the position implicit.** Rejected. The repository already says most of it, but the scale goal, the declaration practice, and the unwired age report each contradict it in a way a reader of one document cannot see.
- **Stop the project.** Not rejected; deferred to the roadmap's exit signal. A directory competing with the inventories on breadth should stop. A reviewed layer should be judged on whether anyone uses the reviews, and that is not known yet.

## Consequences

- `docs/adr/055`'s context is amended to drop the 1,001 figure and point here. Its decision is untouched.
- `docs/DATA_MODEL.md` gains the `hub_blob` evidence kind, the `declared` licence review status, and the rule that `hub_blob` requires a full revision and a hash. `directory/taxonomy.json` gains the enum value. `scripts/validate_directory.py` enforces both. `docs/MODELS.md` and `docs/CURATION.md` describe when each applies.
- `scripts/check_evidence_links.py` learns to re-fetch a `hub_blob` immutable URL and compare its hash, and to compare a model-card tag with the classification. Both run only once the Hub terms review is recorded; `docs/OPERATIONS.md` and `docs/RUNBOOKS.md` say where.
- `scripts/build_analysis_exports.py` emits `declarations.csv` and `review_age.csv`; `docs/WEB.md`'s analysis section lists them.
- The 148 declaration-backed records and 23 mutable-path items are re-read in one ADR 055 pass. The backlog question on declared tags is closed by this ADR, and the pass, the Hub terms review, and the roadmap exit signal become backlog items.
- `README.md`'s first paragraph and `docs/COVERAGE.md`'s "What comprehensive means" say the Atlas is the reviewed layer and send the long tail to the inventories.
- Validation that every published record carries the ADR 055 disclosure where automation authored it is out of scope here and remains ADR 055's own reconciliation debt.
