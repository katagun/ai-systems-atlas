# ADR 039: Reviewed flags record a maker's own risk statement

- Status: Proposed
- Date: 2026-09-24

## Context

Card badges ([`docs/WEB.md`](../WEB.md) "Card badges") flag reviewed traits a reader scans for, and their contract forbids them to carry merit, trust, evidence state, or risk. The owner asked for a second tier beside them: marks for AI that is dangerous in ways a reader should see from the grid, with cyber-capable systems as the first example. The badge emblems shipped in [#286](https://github.com/katagun/ai-systems-atlas/pull/286) reserved a triangle frame for that tier, and [`BACKLOG.md`](../../BACKLOG.md) asked for "an ADR that defines the reviewed field, the evidence bar, and who decides" before any data or UI work.

The catalog has no risk vocabulary at all, and nothing in it rates danger. The closest precedent is [ADR 029](029-trust-records-are-unscored-and-never-first-hand.md), which records what an inference operator documents about trust properties and never what the service does: "Statuses record documentation, not behaviour." [ADR 016](016-superseded-predecessors-keep-their-record.md) set the same line for lifecycle: "The status reports a maintainer's declaration; it is not the Atlas's editorial opinion".

Frontier developers now publish that kind of declaration about risk. A system card or safety framework may state that a release reached a named threshold in cyber, biological or chemical, or autonomy capability, or that the developer could not rule it out and deployed safeguards as a precaution. The statement is first-party, dated, and about a named release. It is the only risk fact the Atlas can record without issuing its own verdict.

A repository-only skeptic was briefed to refute the first version of this proposal before drafting. Four of its arguments changed the design and are answered in the decision; the rest are under "Alternatives considered".

## Decision

### A flag records a maker's statement, never an Atlas verdict

A **reviewed flag** records one kind of first-party statement a record's steward publishes about it. The Atlas quotes the statement, classifies it only in the statement's own terms, and adds nothing the source does not say, the rule ADR 029 set for findings: "A finding holds the claim in the source's words and nothing the source does not say". A flag never affects inclusion, score, rank, sort, the Finder, or comparison.

This record creates exactly one kind, `maker_risk_safeguards`, for reviewed models in `directory/models.json`. A further kind, or any change to what a kind may assert, requires its own ADR.

### `maker_risk_safeguards`: three states, never two

For each reviewed model, the kind is in one of three states:

| State | Meaning |
|---|---|
| `statement_found` | The developer's own system card, model page, or safety framework names this release against a risk threshold. |
| `no_statement_found` | A reviewer checked the developer's system card, model page, and framework page for this release, and none names it against a threshold. |
| Not examined | No entry exists for the kind. |

Two states would not do. A badge's absence "claims nothing is absent", which is safe for a trait and unsafe for risk: an unflagged frontier model reads as "not dangerous". The catalog refuses that reading everywhere a gap could imply safety. ADR 029: "Absent means unexamined, and the app says so." [`docs/INFERENCE_SERVICES.md`](../INFERENCE_SERVICES.md): "It is never evidence of safety, and the app says so." So a model the Atlas has not examined says so, and a model whose developer publishes nothing says that, with the sentence "Absence is not evidence of safety."

The third state is also the answer to [ADR 023](023-autonomous-science-systems-are-not-a-role.md)'s objection to a test that "convicts the inspectable and acquits the opaque". A present-or-absent flag would reward a developer for publishing no framework: its models would carry clean cards. With `no_statement_found` recorded, silence is visible as silence, and the reader can compare a developer that publishes thresholds with one that publishes none.

### The label is the maker's words

A found statement stores:

- `tier_term`: the developer's own term, verbatim, such as a framework level or a safeguard level.
- `domains`: one or more of `cyber`, `bio_chem`, `autonomy`, the domains the statement names.
- `determination`: `determined` when the developer states the threshold was reached; `precautionary` when it states it could not rule the threshold out, or deployed safeguards as a precaution.
- `scope`: `weights` when the statement is about the model; `deployment` when it is about safeguards on a release channel.
- `statement`: the sentence or sentences quoted verbatim.

The card never says "high risk", "dangerous", or any other Atlas word for the result. Merging different developers' frameworks into one grade would be the Atlas's own equivalence call, and a precautionary statement recorded as a finding would misstate its source. The tooltip and dialog print `tier_term` and `determination` as the developer's statement, and state that it is "the developer's own statement, not an Atlas risk rating".

### A statement attaches only to the release it names

The model record boundary in [`docs/MODELS.md`](../MODELS.md) is a release, and the catalog already splits one set of weights across records that differ by safeguards. A flag therefore attaches only when the statement names this record's release. A statement about a model family, a product built on the model, or a sibling release goes into the record's prose, or onto the product's own system record, and not into a flag. Where one set of weights has several records, each is judged on what its own statement says, and `scope` records whether that statement covers the weights or a deployment.

Evidence is first-party only. models.dev text never establishes a flag, even when it names cyber or biology work, because it is unreviewed source metadata under [AGENTS.md](../../AGENTS.md) rule 11.

### Data

Reviewed model records gain an optional `flags` list. Each entry's `kind` is from a new `flag_kinds` vocabulary in `directory/taxonomy.json`, which also names the collections a kind may appear in. `maker_risk_safeguards` is allowed on reviewed models only; imported models.dev rows carry no Atlas conclusion ([`docs/MODELS.md`](../MODELS.md)) and never carry a flag.

An entry with `status: "statement_found"` has exactly `kind`, `status`, `tier_term`, `domains`, `determination`, `scope`, `statement`, `url`, `content_sha256`, `verified_at`, and `research_confidence`, except that a page which cannot be pinned carries `"unpinnable": true` in place of `content_sha256`. An entry with `status: "no_statement_found"` has exactly `kind`, `status`, `url` (the page the reviewer checked last, normally the developer's framework or system-card index), `verified_at`, and `research_confidence`. Validation enforces both shapes, a first-party URL, the kind's allowed collections, and `verified_at` on or before the record's.

The structured field needs the argument ADR 029 made for its tri-state. [`docs/DATA_MODEL.md`](../DATA_MODEL.md) exempts trust statuses from the prose-only rule because "it compresses no capability". A flag does not either. It stores the developer's term verbatim rather than an Atlas grade, and keeps `determination` and `scope` as separate facts so that no exception is folded into one value. What a flag compresses is whether a document says something, which is what the exemption allows.

### Evidence stays current

A flag's page is first-party and carries the fact the flag exists to report, so it is drift-monitored, as [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md) chose for its AI-basis pages "because they carry the fact the record exists to report". ADR 029 declined hashing for the opposite reason: its findings are third-party papers, and "the Atlas cannot accept a change to a page it does not steward". A developer's system card is the steward's own artifact, like a terms page.

Flag URLs join the normalised content hashing that `scripts/check_evidence_links.py` runs on `web_terms` evidence. A page that changes between two fetches, or a PDF the normaliser cannot read stably, is cited with `"unpinnable": true` as ADR 037 allows, and stays link-checked. Drift marks the flag `review_required` and opens an incident. It never rewrites or removes the flag, the rule [AGENTS.md](../../AGENTS.md) rule 10 sets for license drift.

The model line-update checklist in [`docs/MODELS.md`](../MODELS.md) gains flags beside license text, distribution paths, and scores, and `scripts/report_review_age.py` reads each flag's `verified_at` among the nested dates it reports.

### Who decides

The owner decides what can be flagged, by accepting an ADR for each kind. Reviewers decide individual flags: a flag entry is a reviewed editorial field under the complete review workflow ([AGENTS.md](../../AGENTS.md) rule 9). Research agents may propose, and an entry is accepted only when the owner merges it. [AGENTS.md](../../AGENTS.md) rule 8 adds flags to the fields automation can never create, change, or clear.

From the day this record is implemented, a new model review or line update records a `maker_risk_safeguards` entry in one of the two examined states, so "not examined" describes only records reviewed earlier. Existing reviewed models are backfilled in batches. Developers that publish a risk framework go first, then the rest, which receive `no_statement_found` entries naming the page checked. Each batch re-fetches every URL and quote by hand and pins the statement by hash before merge.

For each entry the reviewer confirms that:

- the statement names this release, not the family or a product;
- the quote is verbatim from a first-party page;
- `determination` and `scope` match the words;
- for `no_statement_found`, the developer's system card, model page, and framework page were all checked.

When a developer revises or withdraws a statement, the entry is updated in place with a new `verified_at` and the change is described in the pull request. Nothing is removed silently.

### What the site shows

A `flags` family joins the badge registry, using the reserved triangle frame, an exclamation glyph, and the `--danger` token. It is defined in both palettes, unused by any other component, and distinct from every card accent. A `statement_found` flag renders first in the card's badge row, outside the badge cap. Its tooltip gives the family ("Maker risk statement"), `tier_term` and `determination`, and a sentence naming the developer, the domains, and the scope, ending "This is the developer's own statement, not an Atlas risk rating." The visually hidden text is the same sentence.

Every reviewed-model dialog, and its share page, gains a "Risk statements" section showing the entry in any of the three states. A found statement is quoted with its link, date, confidence, and scope in plain words. `no_statement_found` reads "The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety." Not examined reads "Not yet examined." Imported models show nothing.

The Models legend lists the flag beside the model badges, and Taxonomy gains a "Reviewed flags" group. There is no flag filter and no caution notice. A filter waits for the click-to-filter backlog item, and a notice would put the Atlas's own voice on a statement that is the developer's.

The boot payload carries only `flags[].kind` and `flags[].status`, enough to paint the emblem. The statement and its fields live in the model's detail file, because boot is already over its size budget.

`docs/WEB.md` gains a "Reviewed flags" subsection and a browser-matrix step, and the "Card badges" paragraph that reserves the triangle points to it.

## Consequences

- `directory/taxonomy.json` gains `flag_kinds`, `flag_statuses`, `flag_domains`, `flag_determinations`, and `flag_scopes`; reviewed models in `directory/models.json` gain the optional `flags` field.
- The published models endpoint changes shape by that optional field, deliberately, under [ADR 026](026-app-payloads-are-a-projection-of-the-published-endpoints.md); the agent reference documents it.
- `scripts/validate_directory.py` validates flags; `scripts/check_evidence_links.py` hashes flag pages; `scripts/report_review_age.py` reads flag dates; `scripts/build_web_payload.py` adds the two boot fields.
- [AGENTS.md](../../AGENTS.md) rule 8, [`docs/MODELS.md`](../MODELS.md) (review workflow and line updates), [`docs/DATA_MODEL.md`](../DATA_MODEL.md), and [`docs/WEB.md`](../WEB.md) are amended when this record is implemented.
- All 303 reviewed models start unexamined, and the site says so on each of them until its batch lands.
- Implementation and backfill follow in separate changes. This record changes no data.

## Alternatives considered

- **A present-or-absent flag.** Rejected. Absence would read as safety and would favour developers that publish nothing (ADR 023's objection). The third state costs one line per model.
- **A label in the Atlas's own words, such as "high risk".** Rejected. It would merge incomparable frameworks into an Atlas grade and would misstate precautionary statements.
- **The Atlas's own risk judgment,** as with a score. Rejected. It is a first-hand verdict the catalog cannot stand behind, the line ADR 029 draws for trust.
- **Independent evaluators' findings as flags.** Deferred. They are third-party, which ADR 029's findings model handles differently, and choosing which evaluators count is its own decision.
- **Family-level or product statements as flags.** Rejected. They would put a claim about a sibling release or a product on a record whose boundary is one release.
- **"Built for offensive security" as a second flag on systems.** Deferred to a trait decision. Purpose is classified through roles and traits ([ADR 011](011-delegated-work-agents-are-agent-systems.md), [ADR 018](018-operating-party-is-a-trait-not-a-role.md), [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md)), and a trait-like fact must be reachable by a filter. No published system carries it yet. It is decided when the first penetration-testing agent is reviewed.
- **Reusing the trust-record block.** Rejected. It is shaped for six inference-service properties. The flag borrows its evidence discipline, not its structure.
- **Hashing nothing, as ADR 029 does.** Rejected for first-party statement pages, for the reason given under "Evidence stays current".
