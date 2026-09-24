# Design: An unscored Robots collection

**Date:** 2026-09-20
**Status:** Implemented (PR 2 plumbing; records follow in PR 3)

## Problem

[ADR 036](../../adr/036-the-agent-to-physical-world-boundary-is-in-scope.md) put AI robots and their hardware in scope and admitted nothing. Four commercial robots — Spot, Unitree G1, Figure, and 1X NEO — wait in `directory/candidates.json` under `triage.held_by: "robots collection decision"`.

They cannot enter `directory/projects.json`. Inclusion-gate condition 4 in [`docs/CURATION.md`](../../CURATION.md) requires a reviewed `source_model` and a complete `licenses` list. Coverage batch 39 found that condition "genuinely unmeetable from what each vendor publishes": a purchased robot has terms of sale, a spec sheet, and sometimes an SDK licence, not a classifiable software licence. The system score profiles would also end up measuring a vendor's closed software stack, the objection [ADR 032](../../adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md) raised about scoring packs.

Batch 39 also left one property untested: whether "a model in the decision loop" can be established for a closed system from first-party evidence without reading source. The four hardware candidates were held on condition 4 alone and never run through it.

## Decisions

### 1. A further collection: Robots, recorded in ADR 037

Robots are recorded in `directory/robots.json`, an unscored collection with its own schema, boundary, and comparison policy, as [ADR 013](../../adr/013-distinct-collections-share-one-directory-surface.md) requires. [ADR 015](../../adr/015-local-runtimes-are-self-operated-execution-records.md) requires a further collection to carry its own decision record and forbids admitting by analogy; ADR 037 is that record, and ADR 036 is not. ADR 037 is drafted with this spec and stays Proposed until the collection plumbing lands.

The strongest argument against a collection is [ADR 034](../../adr/034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md)'s: where a system runs is a trait, not a placement. ADR 037 must answer it. The answer this design rests on: a robot is a product a reader chooses, it exists whether or not any reviewed software runs on it, and it cannot meet the systems gate.

### 2. Record unit

One robot product as the manufacturer sells it — "Unitree G1", not Unitree and not each SKU. Variants are prose in `variants`. One manufacturer per record. A record may have no `repo`.

### 3. Inclusion boundary

Add a robot to `directory/robots.json` when all six hold, each from first-party pages:

1. **Identifiable product** from one named manufacturer.
2. **It is a robot:** a machine with its own actuators that moves itself or manipulates objects. `form_factor` is one of `humanoid`, `quadruped`, `arm`, `mobile_manipulator`, `other`. `other` is for a robot whose body fits none of the named forms; it never admits a vehicle, a drone, or a component, which ADR 036 keeps out.
3. **First-party documentation gives the robot an AI basis, in one or both of two ways.** Either it *names a learned model or policy and states what it controls on the robot* — a vision-language-action model, a language or vision-language model, a reinforcement-learning policy — or it *documents a supported way to run the reader's own model or policy on the robot*: an SDK, a policy interface, a documented control API. The record states what the documentation says, never what the robot does, the rule [ADR 029](../../adr/029-trust-records-are-unscored-and-never-first-hand.md) set for trust statuses: "Statuses record documentation, not behaviour." The basis is recorded in `ai_basis`, a named model in `named_models`, each with its evidence and a `research_confidence`, and none of it is scored. A robot whose documentation offers neither — classical autonomy only, no supported model interface — stays out.
4. **The maker documents the hardware.** A spec sheet, technical documentation, or a first-party product page that itself states the hardware. A demo video, a press release, or a waitlist page alone fails.
5. **The vendor states availability:** `orderable`, `reservation`, `enterprise_sales`, `research_only`, or `announced`.
6. **Terms are recorded as found.** Terms of sale, an SDK licence, software terms, a warranty-only page, or none published. Absence is recorded, not disqualifying, and never rewritten as a classification by inference.

Outside the collection: robots whose documentation neither names a learned model or policy nor documents a supported way to run one, robot components, vehicles, drones, simulators, lab prototypes with no stated availability, and concept videos. ADR 036 already bounds the domain; this collection does not widen it.

Condition 3 is batch 39's untested property, exercised. It is establishable for a closed system without reading source because it asks what the vendor's documentation names, not what the robot does. ADR 023 warned against a test that "convicts the inspectable and acquits the opaque"; this one reads documentation for open and closed robots alike and never reads source for either, and unequal documentation shows in `research_confidence`, as ADR 007 intends.

### 4. Comparison policy and stated weak point

Robots are never scored, compared, ranked, sorted by popularity, given a Finder goal, or given a card badge. They are listed alphabetically.

The collection's weak point is stated on every record: the named-model fact is the vendor's own claim, which the Atlas cannot verify, and the evidence is mutable web content. `not_verified` carries that sentence. The same holds of a documented model interface, which is a promise the maker publishes about its own product: the record reports the promise and nothing more, and an interface-only record's `not_verified` says so in those terms.

Significance is not a gate, and the collection says what that costs, as ADR 032 did for packs: nothing refuses the tenth quadruped except the queue and the ecosystem-significance judgement `docs/COVERAGE.md` already applies to the ninth coding agent.

`docs/COVERAGE.md`'s rule — "Do not add a new family merely to fit a famous product" — applies. A famous robot that fails condition 3 or 4 stays held with its reason. The gate was loosened once, by the owner on 2026-09-20, from "the vendor names a model" to either basis, from a required spec sheet to documented hardware, and from holding a robot over an unstable page to citing the page as unpinnable; the reason was that the stricter gate would have opened the collection nearly empty and shut out robots sold as platforms for the reader's own models.

### 5. Record schema

Top-level key `robots`. Validation mirrors packs: required, optional, and forbidden field sets in `scripts/validate_directory.py`.

**Required**

| Field | Content |
|---|---|
| `id`, `name`, `manufacturer`, `url`, `description` | Identity. `url` is the first-party product page. |
| `first_party_domains` | Non-empty list of registrable domains, or `github.com/<org>` prefixes, the manufacturer controls. The reviewer establishes each from the product page or the manufacturer's own links. |
| `form_factor` | One value from the new taxonomy group `robot_form_factors`. |
| `availability` | One value from the new group `robot_availability`. |
| `availability_note` | The vendor's statement in prose. No price. |
| `ai_basis` | Non-empty list from the new group `robot_ai_bases`: `vendor_named_model`, `open_model_interface`. `vendor_named_model` is present exactly when `named_models` is non-empty. |
| `named_models` | List, empty only when `ai_basis` lacks `vendor_named_model`. Each entry: `name`, `kind` (group `robot_model_kinds`: `vision_language_action`, `language_or_vision_language`, `reinforcement_learning_policy`, `other_learned`), `role_note` (what the vendor says the model does), `evidence_label` (the `label` of an entry in `evidence`). |
| `research_confidence` | Existing `low` / `medium` / `high`, rating how well the documentation supports the recorded `ai_basis` — the named model, the model interface, or both. |
| `hardware` | Object with prose fields `compute`, `sensors`, `actuation`, `power`. Each required; each may be `"Not published."`. |
| `developer_access` | What the vendor documents for running the reader's own software or policy, or that it documents none. When `ai_basis` includes `open_model_interface`, this says what the interface is and what it lets a model control, in the vendor's terms. |
| `terms` | Non-empty list from the new group `robot_terms_kinds`: `terms_of_sale`, `sdk_license`, `software_terms`, `warranty_only`, `none_published`. `none_published` appears alone. |
| `terms_note`, `terms_evidence` | Prose and scoped evidence. `terms_evidence` may be empty only when `terms` is `["none_published"]`. |
| `not_verified` | The weak-point sentence. |
| `status`, `evidence`, `verified_at` | Existing project statuses, existing evidence shape, existing meaning. |

**Optional:** `short_name`, `variants`, `repo`, `superseded_by` (a robot id; required when `status` is `superseded`, forbidden otherwise, never the record's own id), `related_systems` (ids in `projects.json`), `related_models` (ids in `models.json`), `related_robots`. Relationships aid navigation and are not compatibility claims. `related_models` stays empty until the action-policy model decision in `BACKLOG.md` is made; until then models are named only as text in `named_models`.

**Forbidden:** `score`, `score_profile`, `system_family`, `primary_role`, `stars`, `stars_verified_at`, `price`, `price_usd`, `benchmarks`. Hardware is prose so that no numeric specification can be sorted or ranked, and price stays out as it does in every collection.

**Uniqueness:** `id` within the collection; `repo`, when present, across all collections as today; `url` within the collection for repo-less records.

### 6. Evidence rules

1. **First-party only.** Every evidence URL, and the record `url`, falls under an entry in the record's `first_party_domains`: the manufacturer's site, its documentation or support site, its own GitHub organisation. Press, reviews, video platforms, and retailers are never evidence.
2. **Every evidence entry carries a `role`:** `product_page`, `technical_documentation`, `named_model`, `model_interface`, or `supporting`. `product_page` is always required. `named_model` is required when `ai_basis` includes `vendor_named_model`, and every `named_models[].evidence_label` resolves to an entry with that role. `model_interface` is required when `ai_basis` includes `open_model_interface`. `technical_documentation` is recorded when it exists and is not required, because condition 4 accepts a product page that states the hardware.
3. **Kinds.** `web` for pages and PDFs; `git_blob` with a blob SHA wherever the vendor publishes an SDK or documentation repository, preferred because it is the only immutable evidence the collection can have.
4. **Terms are drift-monitored** through `scripts/check_evidence_links.py` exactly as service terms are. Drift opens an incident that waits for a human and never hides the record.
5. **The AI-basis pages are drift-monitored too** — every `named_model` and `model_interface` entry. They carry the collection's central fact; if the vendor rewrites one, a human reviews the record.
6. **The two-fetch rule.** Before a page is cited, it is fetched twice, minutes apart, and hashed with `check_evidence_links.content_sha256` — the monitor's visible-text normalisation. If the hashes differ, the reviewer first looks for a stable first-party alternative. If none exists, the page may still be cited with `"unpinnable": true` on its evidence entry: the record says the page changes between fetches, the link checker still checks that it resolves, and it is left out of drift monitoring because its hash can never settle. An unpinnable page never holds a robot. Both hashes are recorded in the review note either way.
7. **Unavailable pages.** A 404, a sales gate, or a login wall on a required evidence role fails the gate. A missing terms page does not: it is recorded as `none_published` with the observation in `terms_note`.
8. `robots.json` joins `scripts/report_review_age.py`.

Batch 39 could not pin `figure.ai` because `scripts/build_candidate_evidence.py` hashes raw fetched text, which includes a randomly seeded SVG gradient identifier. The published-record monitor hashes visible text only. This is read from the code, not yet observed against the site; rule 6 is the test, and `unpinnable` is the fallback if it fails.

A subagent's research is a lead, never evidence. Every URL and quotation is re-fetched by the reviewer before it lands.

### 7. Placement on the site

The Agent packs pattern, with no new interface concept.

- A **Robots** scope in the Directory navigation with a count, included in the All total. The entry is hidden while the collection is empty.
- Cards show name, manufacturer, form factor, and availability, with no score and no badge. Marks come from the existing logo pipeline where a data-backed mark exists; otherwise a monogram.
- Filters: form factor, AI basis ("Maker names a model", "Runs your own models"), availability, status. Search covers name, manufacturer, description, and named-model names. Alphabetical order, no sort control.
- The record dialog and share page (`/records/robots/<id>/`) show, in order: what it is; models the vendor names, each with its `role_note` and a "vendor-stated" label, with the `not_verified` sentence directly beneath them because it is about that claim, or a plain statement that the maker names none once detail has arrived; running your own models, when the maker documents a way; hardware; developer access; availability; terms; evidence and verification date; related records. Detail-only fields render an em dash until the record's detail has loaded; the dialog never asserts an absence from a field that has not arrived.
- No comparison, no Finder goal, no score scope. In the mixed All view robots appear unscored, as packs do.
- Reader-facing copy uses plain words — "Robots", "Models the vendor names" — and no internal vocabulary.

### 8. Documents, routing, and published-file lists

- New `docs/ROBOTS.md`: boundary, classification, evidence workflow, review checklist. `AGENTS.md` gains a topic-map row and rule 7 names robots among the unscored collections.
- `README.md`, `ROADMAP.md`, `docs/CURATION.md`, `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, `docs/TAXONOMY.md`, `docs/WEB.md`, `docs/COVERAGE.md`, and `BACKLOG.md` are updated.
- `robots.json` joins `PUBLISHED_DATA` in `scripts/sync_web_data.py`, `COLLECTIONS` in `scripts/build_web_payload.py`, `scripts/build_share_pages.py`, `scripts/build_asset_version.mjs`, `scripts/build_logos.mjs`, `scripts/check_evidence_links.py`, `scripts/report_review_age.py`, and `scripts/run_directory_refresh.py`.
- `skills/ai-systems-atlas/`, `llms.txt`, and the API view change in the same commit as the published file.

### 9. Candidate routing

Automation never writes a robot record. Both promote scripts refuse a candidate bound for this collection. A robot candidate waits under `triage.held_by: "robots collection review"` once the collection exists. Teaching the triage routine and `scripts/update_directory.py` to find robot candidates is a `BACKLOG.md` follow-up, not part of this work.

### 10. Delivery

Three pull requests.

1. **ADR 037, `docs/ROBOTS.md`, and this spec.** Documents only.
2. **Collection plumbing with zero records:** taxonomy groups, validator, generators, operations scripts, web scope, tests, documents. The navigation entry stays hidden while the collection is empty. ADR 037 becomes Accepted.
3. **First records.** Spot, Unitree G1, Figure, and 1X NEO are each reviewed against the boundary and published or kept held with a stated reason. No outcome is assumed; any of the four may stay held.

### 11. Validation

`scripts/validate_directory.py` enforces: the three field sets; taxonomy membership for the four new groups; membership of `ai_basis` in `robot_ai_bases` and its agreement with `named_models`; every `evidence_label` resolving to a `named_model`-role entry; the evidence roles each basis requires; `unpinnable` being `true` and only on `web` or `web_terms` evidence; `none_published` appearing alone and only then permitting empty `terms_evidence`; every evidence, terms-evidence, and record URL falling under an entry in `first_party_domains`; uniqueness as in decision 5; and existence of every `related_*` id.

### 12. Testing

Pull request 2 is test-driven. Validation-policy tests cover each forbidden field, `ai_basis` disagreeing with `named_models` in both directions, a dangling `evidence_label`, a missing basis-required evidence role, a malformed `unpinnable`, `none_published` combined with another value, a repo-less record, a duplicate `url`, and an unknown related id. Payload, share-page, review-age, evidence-link, and promote-refusal tests mirror the pack tests. Web unit and end-to-end tests cover the scope, facets, search, dialog, URL and history restoration, the hidden-when-empty navigation entry, and unscored rendering in the mixed view, using fixtures. `docs/WEB.md`'s browser verification matrix gains a robots row and is exercised before pull request 2 merges. Pull request 3 is followed by a check of the live site against the merge commit.

## Out of scope

- Action-emitting policy models in the Models collection, robot software records, and the URDF specification question — each has its own `BACKLOG.md` item under ADR 036.
- Robot components, vehicles, drones, wearables, and general AI hardware.
- Structured or numeric hardware specifications, prices, and benchmarks.
- Automated discovery of robot candidates.

## Risks

- **The collection may open nearly empty.** If condition 3 or the two-fetch rule holds most of the four candidates, the first publish is one or two records. That is the boundary working; the remedy is screening more robots, not loosening the gate.
- **Vendor claims change quietly.** Evidence rule 5 monitors the named-model page, but a vendor can change the robot and leave the page alone. `not_verified` states the limit rather than hiding it.
- **`first_party_domains` is a new kind of trust anchor.** No other collection has a reviewer-asserted list that the validator then trusts, and nothing monitors it for drift. The validator checks URLs against the list, not the list against the world. Two limits keep it narrow: the record `url`'s own host must be in the list, so the anchor is the product page a reader can open; and multi-tenant hosts are refused as bare domains, so a shared host can enter only as `github.com/<org>`. A wrong entry is still a review error that only the next reviewer catches.
- **A withdrawn claim.** If a vendor stops naming a model, the record is kept, as [ADR 016](../../adr/016-superseded-predecessors-keep-their-record.md) keeps a reviewed record whose standing changes: the reviewer sets `status` to `removed` and says why in `description`. Nothing is deleted.
- **Discovery cannot see robots.** The refresh discovers GitHub repositories by topic, and a robot is a product, usually with no repository. ADR 023 extended discovery in the same record that named a class; here there is nothing to extend, so robot candidates are queued by hand and `BACKLOG.md` carries the routing work.
