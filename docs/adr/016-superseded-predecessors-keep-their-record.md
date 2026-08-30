# ADR 016: Superseded predecessors keep their record

**Status:** Accepted

## Context

Every system record carries one project status. The vocabulary is `active`, `archived`, and `removed`. None of the three describes a system whose maintainer has publicly declared it superseded by a named successor while the project still receives commits and remains usable today.

Two concrete cases forced the question. Microsoft names Microsoft Agent Framework the enterprise-ready successor to both AutoGen and Semantic Kernel, and the Atlas already scores `microsoft-agent-framework` as an active record. AutoGen's README states that the project is in maintenance mode and community managed. Semantic Kernel's README states that it "is now Microsoft Agent Framework" — yet its repository was pushed to within the last few days, so recording it as `archived` would state something false about a live repository.

`active` is equally wrong. It is the value that answers "should I start here," and for both frameworks the maintainer has published the answer, which is no.

Excluding them is the worst of the three options. Both pass the inclusion gate in [`docs/CURATION.md`](../CURATION.md) — identifiable product, material family and role, sufficient implementation evidence, authoritative license sources — and both are among the most historically significant agent frameworks in the ecosystem. [`docs/COVERAGE.md`](../COVERAGE.md) already settles the principle for the adjacent case: "Archived systems remain reviewed historical references but do not satisfy active-choice coverage." A superseded predecessor is the same kind of record. What the Atlas lacks is a way to say so.

The vocabulary is not new to the repository. The specification collection published under [ADR 008](008-specifications-are-unscored-artifacts.md) already classifies an artifact as `superseded` when a successor is the recommended integration path. This record extends the same concept to projects rather than inventing a second word for it.

## Decision

Add a fourth project status, `superseded`, and an accompanying optional field `superseded_by` that holds the project id of the successor record.

### What the status asserts

`superseded` means the maintainer has publicly designated a named successor, and that successor is itself represented in the Atlas.

Both halves are required. The status reports a maintainer's declaration; it is not the Atlas's editorial opinion about which system is better. A record moves to `superseded` because its maintainer published the succession, and the evidence for that declaration is recorded like any other reviewed claim.

### The `superseded_by` field

`superseded_by` is required when the status is `superseded` and must not appear on any other record. It holds one project id, it must resolve to an existing project record, and it must not point at itself. A validator enforces all three conditions.

The relationship is therefore machine-checkable rather than prose. A reader following AutoGen or Semantic Kernel arrives at `microsoft-agent-framework` by traversing data, not by reading a sentence and searching for the name in it.

### The review survives the status

A superseded record keeps its family, primary role, traits, licenses, evidence, and full editorial score.

Supersession changes availability for a new choice. It does not change the quality of the review or retroactively invalidate what the system does. A predecessor's score stays comparable inside its family profile, which is the intended behavior: the score answers how good the system is, and the status answers whether to start with it. Collapsing the two would make the score mean two things at once.

### Placement in the interface

Superseded records are excluded from the default active-choice view alongside archived and removed ones, and they do not satisfy active-choice coverage in [`docs/COVERAGE.md`](../COVERAGE.md).

They remain browsable, comparable within their score profile under [ADR 014](014-comparisons-are-scoped-to-one-score-profile.md), and reachable from the successor record. A user who arrives looking for a well-known framework finds it, sees why it is not a recommended starting point, and is pointed at what replaced it.

### When not to use it

- **Not for a system the Atlas judges outdated.** Editorial judgment about staleness belongs in weaknesses prose and the maturity dimension, not in the status field.
- **Not for a rename or rebrand of the same product.** That is a note on one record, not two.
- **Not where the successor is not itself represented.** `superseded_by` must resolve, so a declaration pointing outside the Atlas cannot be recorded until the successor is reviewed and published.

Absent a maintainer declaration and a represented successor, the correct value remains `active`, `archived`, or `removed`.

### Supersession versus rename

The Atlas has recent rename cases. Nebius AI Studio became Nebius Token Factory, and Mistral's Le Chat became Vibe. Each stayed one record with a note, because the product boundary did not change: the same service, the same terms, the same operational outcome, under a new name.

Supersession is the opposite shape. It is two records with two boundaries and a directed link between them. AutoGen and Microsoft Agent Framework are separate products with separate repositories, separate documentation, and a published migration path from one to the other. One case collapses to a single record and the other holds two for the same reason `docs/CURATION.md` already keeps a vendor's assistant, coding agent, and SDK apart: distinct operational boundaries mean distinct records, and a shared name or a shared lineage does not merge them.

## Consequences

- Users can see why a well-known framework is not a recommended starting point without the Atlas either hiding it or misdescribing it.
- The successor relationship becomes machine-checkable rather than prose. Validation, the web interface, and future tooling read one field instead of parsing an editorial sentence.
- A superseded record's score remains comparable inside its family. This is intended: a predecessor that was well built stays well built, and the status carries the availability signal on its own.
- Adding the status requires a taxonomy change, a validator change for the two `superseded_by` conditions plus the self-reference check, and an interface change to the default view and its filters.
- A successor that is itself later superseded creates a chain. Chains are permitted as long as every link resolves to an existing record and no record names itself.
- Curation gains an obligation. A maintainer declaration is a review trigger like an archived repository or a license mismatch, and the successor must be reviewed and published before the predecessor can be moved.
- The other collections are unaffected. Specification publication status continues to work as [ADR 008](008-specifications-are-unscored-artifacts.md) defines it, and its own `superseded` value keeps its existing meaning. Inference services and local runtimes carry no status field at all; extending lifecycle vocabulary to them would require its own decision, and a managed service or runtime that is retired is handled today by the exclusion or candidate queues.
