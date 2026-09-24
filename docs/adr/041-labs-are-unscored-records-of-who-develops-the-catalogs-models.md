# ADR 041: Labs are unscored records of who develops the catalog's models

**Status:** Accepted

## Context

The Atlas records what an AI lab ships — reviewed model releases, the managed APIs that serve them, the assistants and agents built on them, and the runtimes and specifications some labs maintain — but not the lab. Each collection names the organization behind a record in its own free-text field, and the strings disagree. Models say `developer`, and the same organization appears as `Google` and `Google DeepMind`, `Alibaba` and `Qwen`, `Cohere` and `Cohere Labs`, `xAI` and `SpaceXAI (xAI)`. Inference services say `operator`, and Zhipu appears under a Singapore entity name for one API and a Beijing entity name for the other. Systems name no organization at all, and every flagship lab assistant, from ChatGPT to Z.ai, has no repository, so not even a GitHub owner links it to its maker.

A reader therefore cannot ask the catalog who develops its models, where those organizations are based, how each one distributes its releases, what else of theirs the Atlas has reviewed, or where to watch for their next release.

[ADR 025](025-model-releases-are-independent-curated-records.md) refused to record a developer *instead of* a release: a company record would "collapse differently licensed versions, sizes, and modalities into one unstable company record". That reasoning stands, and it bounds this decision. A lab record must never carry a conclusion that belongs to a release.

## Decision

`directory/labs.json` is a new collection, **Labs**, in the [ADR 008](008-specifications-are-unscored-artifacts.md) shape: no `system_family`, no `primary_role`, no score profile, no score, no rank, no stars, and no licence. A lab record states what the organization is, where it is headquartered, how its names in the catalog relate, which systems it builds, where it publishes, and whether it publishes a frontier-safety framework. Everything the catalog already records about the lab's releases, services, runtimes, specifications, and packs is joined from those collections, never copied.

### The unit and the gate

A record is one organization, either a company or a public research institution, that develops model releases the Atlas has reviewed. It is recorded at the level at which the catalog's own records name it. Google is one record whose names include `Google`, `Google DeepMind`, and `Google Cloud`, and its organization note says which unit develops the models and which operates the services.

The gate is the Models collection itself. An organization is recorded only once the catalog has reviewed a release it developed: one of its `catalog_names` must equal a reviewed model's `developer`, and validation enforces it. Size, funding, frontier status, popularity, openness, nationality, and licence decide nothing. The gate keeps the collection bounded by a boundary the Atlas already maintains. A service operator with no model of its own is not a lab, and neither is a company whose only releases are image generators or a company that has released nothing. Each of them waits until a release of theirs is reviewed.

### Names, not copies

`catalog_names` lists the exact strings the other collections use for the organization and for the units that develop its models or operate its model services. A separately branded subsidiary with its own product line, such as GitHub, stays out. The joins are fixed:

- a reviewed model belongs to the lab whose names include its `developer`;
- a service joins by `operator`, a runtime by `maintainer`, a specification by any of its `stewards`, and a pack by `steward`;
- a models.dev source row belongs to the lab whose reviewed releases share its namespace;
- systems carry no organization field, so the lab lists their ids in `systems`.

Validation keeps the joins honest. Every catalog name must match a record, no name, system, or GitHub organization may belong to two labs, a models.dev namespace may not be split between labs, and a published system whose repository sits in one of the lab's GitHub organizations must be listed. When someone renames an operator string, the build fails until the lab record changes, so the link cannot vanish silently.

### What a lab record may claim

A lab record claims only organization-level facts, each resting on dated first-party evidence:

- its type, as an AI company, a technology company, or a public research organization;
- its headquarters country;
- its parent organization, when first-party evidence names one;
- the channels where it publishes: its model catalog, release notes, news, GitHub organizations, and Hugging Face organizations;
- a frontier-safety, responsible-scaling, preparedness, or risk-management framework, when it publishes one on its own pages.

The framework field works like a [trust record](029-trust-records-are-unscored-and-never-first-hand.md) status. It says the organization publishes a statement, never what the organization does, and its absence is not a finding that none exists.

A lab record never claims a licence, a source model, an openness verdict, or a quality. How a lab distributes its models is shown as the union of its reviewed releases' own distribution modes, so each release keeps its own conclusion, which is ADR 025's point.

### Placement

Labs is a sibling view after Models, like Specifications, rather than a Directory scope. [ADR 013](013-distinct-collections-share-one-directory-surface.md) reserves the Directory for deployable choices, and an organization is not one. The view is alphabetical only, with no score, no sort control, no comparison ([ADR 014](014-comparisons-are-scoped-to-one-score-profile.md)), no Finder goal, and no trait badges; like every card, a lab card leads with its type badge. A card shows the date of the lab's newest reviewed release as a tracking signal, never as a sort. Every model, service, runtime, specification, pack, and system a lab claims links to the lab's dialog, and the Models view gains a Lab facet.

## Alternatives considered

**A `lab` foreign key on every model, service, and system record.** This would be normalized, but it edits hundreds of reviewed records and every promotion path to restate what `developer` and `operator` already say. Declared names give the same answer, and the validator guards drift. The alternative becomes worth revisiting if the backlog's reconciliation of `operator` values around contracting entities lands.

**Deriving labs from models.dev namespaces.** Namespaces are attributed community metadata under [ADR 027](027-complete-models-dev-source-catalog-is-published.md). They miss releases reviewed before models.dev lists them ([ADR 038](038-reviewed-models-may-precede-their-models-dev-source-row.md)), and they carry no headquarters, type, or channels. A lab is a reviewed record. Namespaces are only one of its joins.

**A Directory scope.** Rejected under ADR 013: a reader does not deploy an organization. Specifications set the precedent for a sibling view.

**Scoring labs on openness, transparency, or safety.** Openness is already scored where it is measurable, per release, by `model_access`. A lab-level score would restate those scores or rank companies on governance, and the Atlas has no rubric or evidence bar for governance. Ranking organizations invites the misreading ADR 014 exists to prevent. Recording that a framework is published is as far as the collection goes.

**Funding, valuation, revenue, headcount, compute, leadership, and benchmarks.** None is stable, first-party, and operational, so none is a field.

## Consequences

- [`docs/LABS.md`](../LABS.md) carries the inclusion gate, the naming rule, the evidence workflow, and the current coverage.
- The first batch covers the organizations behind most reviewed releases. The remaining developers of reviewed releases are listed in `BACKLOG.md` for the next batch, and each lab page counts the models.dev rows in its namespaces that still await review.
- Model `developer` and service `operator` strings stay free text. A lab names them rather than normalizing them.
- Every script that enumerates collections gains a row, and [`AGENT_DOCS.md`](../AGENT_DOCS.md)'s one-commit rule for published files applies to `labs.json`.
- Automation never writes a lab record. Link checking and review age reach labs like every collection.
