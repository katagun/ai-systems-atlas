# Robot curation

Use this guide for AI robots: commercial robot products whose manufacturer's own documentation names a learned model or policy and says what it controls. Operational software follows [`CURATION.md`](CURATION.md); the two collections share evidence rigour but not schema, gate, or scores. The scope decision is [ADR 036](adr/036-the-agent-to-physical-world-boundary-is-in-scope.md) and the collection's boundary, comparison policy, and weak point are [ADR 037](adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md). Robots are never scored.

## Inclusion boundary

Add a robot to `directory/robots.json` when all six hold, each from first-party pages:

1. **Identifiable product** from one named manufacturer.
2. **It is a robot:** a machine with its own actuators that moves itself or manipulates objects. `form_factor` is one of `humanoid`, `quadruped`, `arm`, `mobile_manipulator` — exactly the forms ADR 036 names. A robot of another form waits for a scope decision; there is no `other`.
3. **First-party documentation names a learned model or policy and states what it controls on the robot** — a vision-language-action model, a language or vision-language model, a reinforcement-learning policy. The record states what the documentation says, never what the robot does. It is recorded in `named_models` with its evidence and a `research_confidence`, and is never scored.
4. **A spec sheet or technical documentation exists and can be pinned.** A demo video, a press release, or a waitlist page alone fails.
5. **The vendor states availability:** `orderable`, `reservation`, `enterprise_sales`, `research_only`, or `announced`.
6. **Terms are recorded as found.** Terms of sale, an SDK licence, software terms, a warranty-only page, or none published. Absence is recorded, not disqualifying, and never rewritten as a classification by inference.

Outside the collection: robots whose documentation names no learned model or policy, robot components, vehicles, drones, simulators, lab prototypes with no stated availability, and concept videos.

One record is one robot product as the manufacturer sells it — "Unitree G1", not Unitree and not each SKU. Put variants in `variants`. A record may have no `repo`. A famous robot that fails a condition stays in `directory/candidates.json` with the failing condition written down; significance never lifts a condition.

## Classification

Choose one `form_factor` and one `availability`, each from the vendor's own words, never from a reviewer's impression of the machine. Write the vendor's availability statement into `availability_note` as prose, with no price.

Record every model the documentation names as an entry in `named_models`, each with:

- `name` as the vendor writes it;
- `kind` from `robot_model_kinds`: `vision_language_action`, `language_or_vision_language`, `reinforcement_learning_policy`, `other_learned`;
- `role_note`, what the vendor says the model does, in the vendor's terms and nothing the vendor does not say;
- `evidence_label`, the `label` of the `evidence` entry whose role is `named_model` and which carries the claim.

Then rate `research_confidence` for how well the documentation supports those entries:

- `high`: the vendor's technical documentation names the model and states what it controls;
- `medium`: a first-party product or news page names it;
- `low`: it is named only in passing, or only for a variant.

Assign `status` from the project statuses so a discontinued robot is labelled rather than deleted. If a vendor stops naming a model, set `status` to `removed` and say why in `description`; nothing is removed from the file.

## Evidence workflow

1. Establish `first_party_domains` from the product page and the manufacturer's own outbound links. Never add a domain because a search result pointed at it. The record `url`'s own host belongs in the list, and a multi-tenant host enters only as a `github.com/<org>` prefix, never as a bare domain.
2. For each page you intend to cite, run the two-fetch rule: `uv run python scripts/check_page_stability.py <url>`. Cite only a page whose two hashes match; paste both hashes into the pull request description. If no stable first-party page exists for a required role, the robot stays held.
3. Record the three required evidence roles: `product_page`, `technical_documentation`, and `named_model`. Prefer `git_blob` evidence from the vendor's own SDK or documentation repository wherever it exists — it is the only immutable evidence this collection can have. Press, reviews, video platforms, and retailers are never evidence.
4. Record `terms` as found. A 404 or a missing terms page is `none_published`, alone, with the observation in `terms_note`; never infer a classification from a warranty page or a generic site notice.
5. Write `hardware` as four prose fields from the spec sheet — `compute`, `sensors`, `actuation`, `power` — and write `"Not published."` where the vendor publishes nothing. No numbers lifted into structured fields, and no price.
6. Write `not_verified` in the record's own words: the named-model fact is the vendor's claim, and the evidence is mutable web content.
7. Run the regeneration sequence in [`../AGENTS.md`](../AGENTS.md), validation, all tests, and the robots row of the browser verification matrix in [`WEB.md`](WEB.md).

A subagent's research is a lead, never evidence. Re-fetch every URL and re-read every quotation yourself before it lands.

## Unavailable pages

A 404, a sales gate, or a login wall on a required evidence role fails the gate. A missing terms page does not: it is recorded as `none_published` with the observation in `terms_note`.

## What robots never carry

No `score`, `score_profile`, `system_family`, `primary_role`, `stars`, `stars_verified_at`, `price`, `price_usd`, or `benchmarks`. Hardware stays prose so that no specification can be sorted or ranked.

Robots are never scored, compared, ranked, sorted by popularity, given a Finder goal, or given a card badge. The scope lists them alphabetically and offers no sort control. Relate a record to another only when it aids navigation; a relationship is not a compatibility claim, and `related_models` stays empty until the action-policy model decision in [`../BACKLOG.md`](../BACKLOG.md) is made.
