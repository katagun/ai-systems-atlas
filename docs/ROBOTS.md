# Robot curation

Use this guide for AI robots: commercial robot products whose maker's own documentation either names a learned model or policy and says what it controls, or documents a supported way to run the reader's own. Operational software follows [`CURATION.md`](CURATION.md); the two collections share evidence rigour but not schema, gate, or scores. The scope decision is [ADR 036](adr/036-the-agent-to-physical-world-boundary-is-in-scope.md) and the collection's boundary, comparison policy, and weak point are [ADR 037](adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md). Robots are never scored.

## Inclusion boundary

Add a robot to `directory/robots.json` when all six hold, each from first-party pages:

1. **Identifiable product** from one named manufacturer.
2. **It is a robot:** a machine with its own actuators that moves itself or manipulates objects. `form_factor` is one of `humanoid`, `quadruped`, `arm`, `mobile_manipulator`, `other`. `other` is for a robot whose body fits none of the named forms; it never admits a vehicle, a drone, or a component, which ADR 036 keeps out.
3. **First-party documentation gives the robot an AI basis, in one or both of two ways.** Either it *names a learned model or policy and states what it controls on the robot* — a vision-language-action model, a language or vision-language model, a reinforcement-learning policy — or it *documents a supported way to run the reader's own model or policy on the robot*: an SDK, a policy interface, a documented control API. The record states what the documentation says, never what the robot does, the rule [ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md) set for trust statuses: "Statuses record documentation, not behaviour." The basis is recorded in `ai_basis`, a named model in `named_models`, each with its evidence and a `research_confidence`, and none of it is scored. A robot whose documentation offers neither — classical autonomy only, no supported model interface — stays out.
4. **The maker documents the hardware.** A spec sheet, technical documentation, or a first-party product page that itself states the hardware. A demo video, a press release, or a waitlist page alone fails.
5. **The vendor states availability:** `orderable`, `reservation`, `enterprise_sales`, `research_only`, or `announced`.
6. **Terms are recorded as found.** Terms of sale, an SDK licence, software terms, a warranty-only page, or none published. Absence is recorded, not disqualifying, and never rewritten as a classification by inference.

Outside the collection: robots whose documentation neither names a learned model or policy nor documents a supported way to run one, robot components, vehicles, drones, simulators, lab prototypes with no stated availability, and concept videos. ADR 036 already bounds the domain; this collection does not widen it.

One record is one robot product as the manufacturer sells it — "Unitree G1", not Unitree and not each SKU. Put variants in `variants`. A record may have no `repo`. A famous robot that fails a condition stays in `directory/candidates.json` with the failing condition written down; significance never lifts a condition.

The gate reached this shape after the owner loosened it on 2026-09-20 — either AI basis, documented hardware rather than a required spec sheet, unpinnable pages rather than a hold, and `other` among the form factors. [ADR 037](adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md) records why. Nothing loosened about where a fact comes from: every one of the six conditions is met from the maker's own pages.

## Classification

Choose one `form_factor` and one `availability`, each from the vendor's own words, never from a reviewer's impression of the machine. Use `other` only for a body none of the four named forms fits, never to slip in a vehicle, a drone, or a component. Write the vendor's availability statement into `availability_note` as prose, with no price.

Record the AI basis in `ai_basis`, one or both values from `robot_ai_bases`:

- `vendor_named_model`, when the documentation names a learned model or policy and states what it controls. It is present exactly when `named_models` is non-empty — never one without the other.
- `open_model_interface`, when the documentation gives a supported way to run the reader's own model or policy: an SDK, a policy interface, a documented control API. Say in `developer_access` what the interface is and what it lets a model control, in the vendor's terms. Programmability alone — a teach pendant, a waypoint script, a motion API the maker never offers for running a model — is not this basis.

Record every model the documentation names as an entry in `named_models`, each with:

- `name` as the vendor writes it;
- `kind` from `robot_model_kinds`: `vision_language_action`, `language_or_vision_language`, `reinforcement_learning_policy`, `other_learned`;
- `role_note`, what the vendor says the model does, in the vendor's terms and nothing the vendor does not say;
- `evidence_label`, the `label` of the `evidence` entry whose role is `named_model` and which carries the claim.

Leave `named_models` empty when the record rests on `open_model_interface` alone, and say so plainly in `description` rather than implying the maker names a model.

Then rate `research_confidence` for how well the documentation supports whichever basis you recorded:

- `high`: the vendor's technical documentation names the model and states what it controls, or documents the model interface and what it drives;
- `medium`: a first-party product page carries it, with no technical documentation behind it;
- `low`: it is mentioned only in passing, or only for a variant.

Assign `status` from the project statuses so a discontinued robot is labelled rather than deleted. If a vendor withdraws the claim the record rests on, set `status` to `removed` and say why in `description`; nothing is removed from the file.

## Evidence workflow

1. Establish `first_party_domains` from the product page and the manufacturer's own outbound links. Never add a domain because a search result pointed at it. The record `url`'s own host belongs in the list, and a multi-tenant host enters only as a `github.com/<org>` prefix, never as a bare domain.
2. For each page you intend to cite, run the two-fetch rule: `uv run python scripts/check_page_stability.py <url>`; [`OPERATIONS.md`](OPERATIONS.md) describes its output and exit codes. Paste both hashes into the pull request description either way. When they differ, look for a stable first-party alternative first; if none exists, cite the page with `"unpinnable": true`, which keeps the link checker on it and leaves it out of drift monitoring. An unpinnable page never holds a robot.
3. Give every evidence entry a role. `product_page` is always required. `named_model` is required when `ai_basis` includes `vendor_named_model`, and every `named_models[].evidence_label` resolves to one. `model_interface` is required when the basis includes `open_model_interface`. `technical_documentation` and `supporting` are recorded when they exist and are never required, because condition 4 accepts a product page that states the hardware. Prefer `git_blob` evidence from the vendor's own SDK or documentation repository wherever it exists — it is the only immutable evidence this collection can have. Press, reviews, video platforms, and retailers are never evidence.
4. Record `terms` as found. A 404 or a missing terms page is `none_published`, alone, with the observation in `terms_note`; never infer a classification from a warranty page or a generic site notice.
5. Write `hardware` as four prose fields from whatever the maker documents — `compute`, `sensors`, `actuation`, `power` — and write `"Not published."` where the maker publishes nothing. No numbers lifted into structured fields, and no price.
6. Write `not_verified` in the record's own words: the fact the record rests on — the named model, the documented interface, or both — is the vendor's claim, and the evidence is mutable web content.
7. Run the regeneration sequence in [`../AGENTS.md`](../AGENTS.md), validation, all tests, and the robots row of the browser verification matrix in [`WEB.md`](WEB.md).

A subagent's research is a lead, never evidence. Re-fetch every URL and re-read every quotation yourself before it lands.

## Unavailable pages

A 404, a sales gate, or a login wall on a required evidence role fails the gate. A missing terms page does not: it is recorded as `none_published` with the observation in `terms_note`. A page that resolves but cannot be pinned is not an unavailable page; cite it as unpinnable, per step 2.

## What robots never carry

No `score`, `score_profile`, `system_family`, `primary_role`, `stars`, `stars_verified_at`, `price`, `price_usd`, or `benchmarks`. Hardware stays prose so that no specification can be sorted or ranked.

Robots are never scored, compared, ranked, sorted by popularity, given a Finder goal, or given a card badge. The scope lists them alphabetically and offers no sort control. Relate a record to another only when it aids navigation; a relationship is not a compatibility claim, and `related_models` stays empty until the action-policy model decision in [`../BACKLOG.md`](../BACKLOG.md) is made.
