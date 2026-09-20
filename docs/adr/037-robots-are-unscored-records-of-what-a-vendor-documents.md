# ADR 037: Robots are unscored records of what a vendor documents

**Status:** Proposed

## Context

[ADR 036](036-the-agent-to-physical-world-boundary-is-in-scope.md) put AI robots and their hardware in scope and admitted nothing. Four commercial robots — Spot, Unitree G1, Figure, and 1X NEO — wait in `directory/candidates.json` under `triage.held_by: "robots collection decision"`, the label that names this record as the thing owed before any of them is reviewed.

They cannot enter `directory/projects.json`. Inclusion-gate condition 4 in [`docs/CURATION.md`](../CURATION.md) requires a reviewed `source_model` and a complete `licenses` list, and coverage batch 39 in [`docs/COVERAGE.md`](../COVERAGE.md) found that condition "genuinely unmeetable from what each vendor publishes". A purchased robot has terms of sale, a spec sheet, and sometimes an SDK licence; it does not have a classifiable software licence, and no amount of review work produces one.

Scoring is the second obstacle, and it is separate from the first. [ADR 032](032-agent-packs-are-unscored-records-of-what-a-host-installs.md) refused to score packs because "Every score dimension would measure the host." The robot case is its own and rests on robot evidence: a system score would read autonomy, reliability, extensibility, and data sovereignty off a vendor's statements about an onboard stack no reviewer can open, install, or run. The score would then carry a reviewer's authority for a claim the reviewer took from marketing. That is not a score the catalog can stand behind.

Batch 39 also left one property untested. Whether "a model in the decision loop" can be established for a closed system from first-party evidence, without reading source, was never exercised: the four hardware candidates were held on condition 4 alone and never run through it. The five open robot-software candidates were, and their repositories made the property legible by construction, which is exactly what makes them no test of it.

A repository-only skeptic was briefed to refute this proposal before the record was drafted. Its objections are answered below where they changed the design, and named in "Alternatives considered" where they did not.

## Decision

`directory/robots.json` is a further collection, **Robots**, in the [ADR 008](008-specifications-are-unscored-artifacts.md) shape: no `system_family`, no `primary_role`, no score profile, no score, no stars. A record states what one manufacturer sells, what its own documentation names running on it, what it publishes about the hardware, what a buyer may run on it, and on what terms.

[ADR 015](015-local-runtimes-are-self-operated-execution-records.md) requires a further collection to carry its own decision record and warns that "the existence of a fourth is not a precedent for admitting adjacent software by analogy". This is that record. The Agent packs collection appears below for mechanism — how an unscored collection is shaped, validated, and rendered — and never as a reason to admit robots.

[ADR 013](013-distinct-collections-share-one-directory-surface.md) admits a collection to the Directory only when it retains "an explicit schema, boundary, and comparison policy". The schema is decision 5 of [the design spec](../superpowers/specs/2026-09-20-robots-collection-design.md); the boundary and the comparison policy are below. ADR 013 also forbids a shared surface that would "combine unlike licensing or terms fields", which is why a robot's terms are a new vocabulary, `robot_terms_kinds`, rather than a reuse of `licenses`: terms of sale and a warranty page are not licences and must never be classified as one.

The record unit is one robot product as the manufacturer sells it — "Unitree G1", not Unitree and not each SKU. Variants are prose. A record may have no repository at all. A repository appears in at most one collection, as today; a repo-less robot is unique by its canonical `url` within the collection.

### The boundary

Add a robot to `directory/robots.json` when all six hold, each from first-party pages:

1. **Identifiable product** from one named manufacturer.
2. **It is a robot:** a machine with its own actuators that moves itself or manipulates objects. `form_factor` is one of `humanoid`, `quadruped`, `arm`, `mobile_manipulator` — exactly the forms ADR 036 names. A robot of another form waits for a scope decision; there is no `other`.
3. **First-party documentation names a learned model or policy and states what it controls on the robot** — a vision-language-action model, a language or vision-language model, a reinforcement-learning policy. The record states what the documentation says, never what the robot does, the rule [ADR 029](029-trust-records-are-unscored-and-never-first-hand.md) set for trust statuses: "Statuses record documentation, not behaviour." It is recorded in `named_models` with its evidence and a `research_confidence`, and is never scored.
4. **A spec sheet or technical documentation exists and can be pinned.** A demo video, a press release, or a waitlist page alone fails.
5. **The vendor states availability:** `orderable`, `reservation`, `enterprise_sales`, `research_only`, or `announced`.
6. **Terms are recorded as found.** Terms of sale, an SDK licence, software terms, a warranty-only page, or none published. Absence is recorded, not disqualifying, and never rewritten as a classification by inference.

Outside the collection: robots whose documentation names no learned model or policy, robot components, vehicles, drones, simulators, lab prototypes with no stated availability, and concept videos.

### The gate reads documentation, not behaviour

Condition 3 is batch 39's untested property, exercised, and it is establishable for a closed robot because of what it asks. It asks what the manufacturer's own documentation names and says that model controls; it does not ask what the robot does. The rule is [ADR 029](029-trust-records-are-unscored-and-never-first-hand.md)'s for trust statuses — "Statuses record documentation, not behaviour", where "`documented_yes` means the operator publishes a statement establishing the property" — applied to a manufacturer instead of an operator. `role_note` holds the vendor's terms for what the model does and nothing the vendor does not say, and `not_verified` states on every record that the Atlas has not seen the robot run.

[ADR 023](023-autonomous-science-systems-are-not-a-role.md) refused a boundary test on the ground that "The test convicts the inspectable and acquits the opaque", because [ADR 007](007-licenses-are-classification-not-inclusion.md) had already settled that unequal inspectability is a classification matter, not a gate: "research confidence and evidence kind make that limitation visible". This gate does not invert that. It reads published documentation for open and closed robots alike and reads source for neither, so nothing turns on whether a repository exists. Where the documentation is thin the record says so in `research_confidence`, which is where ADR 007 puts it.

One asymmetry remains and is deliberate. ADR 029 records a missing first-party statement as `undocumented` rather than refusing the record, and this gate refuses. The difference is what the statement carries. A trust property is an attribute of a service already admitted on other grounds; the named model is the whole ground of admission here. ADR 036 bounded the first round to robots "for which first-party documentation names a learned model or policy that drives the robot's behaviour". A robot whose vendor names none may be an excellent machine, but it is not an AI robot, and this catalog has nothing to say about it.

The cost is real and falls on the terse vendor: a manufacturer who publishes little is refused where a more talkative one is admitted. The alternative costs more. Admitting a robot on an inference from a demonstration video would be the Atlas asserting a fact about a machine it has never operated, and `research_confidence` cannot repair a record whose central claim was never published.

### Never scored, and what that costs

Robots are never scored, compared, ranked, sorted by popularity, given a Finder goal, or given a card badge. They are listed alphabetically. No comparison surface accepts them, because there is no profile for them to be comparable within.

The weak point is stated on every record rather than kept in this file, and `not_verified` carries the sentence: the named-model fact is the vendor's own claim, which the Atlas cannot verify, and the evidence is mutable web content.

Significance is not a gate, and the collection says what that costs, as ADR 032 said it for packs: nothing refuses the tenth quadruped except the queue and the ecosystem-significance judgement `docs/COVERAGE.md` already applies to the ninth coding agent. `docs/COVERAGE.md`'s rule holds in the other direction too — "Do not add a new family merely to fit a famous product" — so a famous robot that fails condition 3 or condition 4 stays held with its reason written down, and the boundary is not widened to reach it.

### `first_party_domains` is a new trust anchor

Every evidence URL and the record `url` must fall under an entry in the record's `first_party_domains`, and the validator enforces it. No other collection has a reviewer-asserted list that a validator then trusts, and nothing monitors the list itself for drift: the validator checks URLs against the list, never the list against the world. Two limits keep it narrow. The record `url`'s own host must appear in the list, so the anchor is the product page a reader can open rather than a free assertion. Multi-tenant hosts are refused as bare domains, so a shared site builder or code host can enter only as a scoped `github.com/<org>` prefix. A wrong entry is still a review error that only the next reviewer catches, and that is the honest statement of the risk; it is not the equivalent of licence-drift monitoring, and this record does not claim it is.

### Placement

The Agent packs pattern, with no new interface concept: a Robots scope in the Directory with a count, included in the All total and hidden while the collection is empty; unscored cards showing name, manufacturer, form factor, and availability; filters for form factor, availability, and status; alphabetical order with no sort control; a record dialog and a share page under `/records/robots/<id>/`. In the mixed All view robots appear unscored, as packs do. Reader-facing copy uses plain words and no internal vocabulary.

### What this does not change

- **ADR 036's bounds.** No vehicles, drones, wearables, robot components, or general AI hardware. A proposal to widen the domain is a new scope decision with a record of its own, exactly as ADR 036 says.
- **The Models collection.** `related_models` stays empty until the action-policy model question in `BACKLOG.md` is decided under [ADR 025](025-model-releases-are-independent-curated-records.md). Until then a model is named as text in `named_models`, with its evidence, and nothing links to a model record.
- **The systems gate.** Robot software is reviewed under [`docs/CURATION.md`](../CURATION.md) for `projects.json`, not here. A robot record never admits the software that runs on it, and this collection is not a route around the inclusion gate for anything that could meet it.
- **No record is withdrawn.** [ADR 016](016-superseded-predecessors-keep-their-record.md) keeps a reviewed record whose standing changes, and ADR 034 states the principle plainly: "The catalog has no procedure for retracting a score a reviewer gave." If a vendor stops naming a model, or the claim proves to have been marketing, the reviewer sets `status` to `removed` and says why in `description`. Nothing is deleted. `superseded` is handled the same way it is for systems: `superseded_by` holds a robot id, is required when the status is `superseded`, is forbidden otherwise, and never points at the record's own id.

## Alternatives considered

**Robots as `agent_system` records.** Inclusion-gate condition 4 is unmeetable for purchased hardware, and the scores would measure a closed stack the reviewer cannot open. This is the alternative ADR 036 already identified as the reason hardware needs a record of its own.

**Hardware as a trait on software records, on [ADR 034](034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md)'s reasoning.** This is the strongest argument against the collection, and ADR 034's own objection to a second field — "a reader would have two places to look for one answer" — is a real cost of a new collection. It fails on the disanalogy. Superpowers had a record to hang a trait on, because it could meet the systems gate; Spot cannot meet it at all, so a `physical_robot` deployment mode would decorate records that do not exist and leave the robot a reader is choosing absent from the catalog. A robot exists whether or not any reviewed software runs on it. The argument from relationships that ADR 036 gestured at is not used here: `related_models` is empty by design, and relationship fields are navigation aids, never compatibility claims, so they cannot carry a placement argument.

**Structured or numeric hardware specifications.** Payload in kilograms, degrees of freedom, and battery minutes would invite exactly the ranking this record forbids, and would churn with every vendor revision of a spec sheet. Hardware is four prose fields, each of which may say `"Not published."`.

**Admitting any programmable robot.** This drops condition 3 and pulls in the classical robotics stacks batch 39 excluded on the software side, where planning is costmaps and behaviour trees and no model operates a loop. The same line is drawn here, on the same evidence.

**Recording a robot with no named model as `undocumented` rather than refusing it.** Answered above: ADR 029's tri-state describes an attribute of an admitted record, while condition 3 is the admission ground ADR 036 set.

## Consequences

- Spot, Unitree G1, Figure, and 1X NEO are each reviewed against this boundary in a later change. No outcome is assumed; any of the four may stay held, and the first publish may be one or two records. Their hold label moves from `robots collection decision` to `robots collection review` when the collection exists.
- `scripts/check_evidence_links.py` will monitor a robot's terms evidence and its named-model page for drift once the collection plumbing lands, because the named-model page is the collection's central fact. Drift opens an incident that waits for a human and never hides the record.
- Discovery cannot see this collection's members. The refresh finds GitHub repositories by topic, and a robot is a product that usually has no repository. ADR 023 extended discovery in the record that needed it — "A decision that reconsiders itself at three qualifying systems is worthless if the path those systems arrive by cannot see them" — but here there is nothing to extend: no keyword ladder reaches `bostondynamics.com`. Robot candidates are queued by hand, and `BACKLOG.md` carries the routing work. The revisit condition this record can honestly offer is a reviewer's sweep, not a queue that fills itself.
- `docs/ROBOTS.md` carries the boundary, classification, and evidence workflow a reviewer needs, and `AGENTS.md` routes robot questions to it.
- Every script that enumerates collections gains a row, and `docs/AGENT_DOCS.md`'s one-commit rule for published files applies.
- This record becomes Accepted when the collection plumbing lands with zero records. Until then nothing may be written to `directory/robots.json`, and automation never writes a robot record at all.
