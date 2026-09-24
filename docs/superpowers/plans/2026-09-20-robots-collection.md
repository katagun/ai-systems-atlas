# Robots Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unscored Robots collection (`directory/robots.json`) to the Atlas — decision record, validator, generators, operations, web scope — and then review the four held robot candidates against it.

**Architecture:** Robots are a sibling of the Agent packs collection and reuse its plumbing: a published JSON file validated by `scripts/validate_directory.py`, projected into boot, search, and detail payloads by `scripts/build_web_payload.py`, given share pages by `scripts/build_share_pages.py`, and rendered by the generic `COLLECTIONS` table in `web/app.js` with `comparable: false`. What is new is the gate: a robot record carries `first_party_domains`, role-tagged evidence, `named_models`, and `terms` in place of licences, and the link checker monitors the named-model page for drift as it monitors terms.

**Tech Stack:** Python 3.11+ via `uv`, `unittest`; Node 22 (`/usr/local/bin/node` — the default `node` on this machine is v16 and mis-hashes the asset stamp), `node:test`, Playwright; static HTML/JS/CSS.

**Spec:** [`docs/superpowers/specs/2026-09-20-robots-collection-design.md`](../specs/2026-09-20-robots-collection-design.md). Read it before any task. Decision numbers below ("spec §5") refer to its `### N.` headings.

## Global Constraints

- Three pull requests, in order: **PR 1** Task 1; **PR 2** Tasks 2–10; **PR 3** Task 11. Do not merge PR 2 with a robot record in it, and do not start PR 3 before PR 2 is merged and deployed.
- Robots are never scored, compared, ranked, sorted by popularity, given a Finder goal, or given a card badge. Forbidden record fields, verbatim from the spec: `score`, `score_profile`, `system_family`, `primary_role`, `stars`, `stars_verified_at`, `price`, `price_usd`, `benchmarks`.
- Taxonomy group ids, verbatim: `robot_form_factors` = `humanoid`, `quadruped`, `arm`, `mobile_manipulator`, `other`; `robot_ai_bases` = `vendor_named_model`, `open_model_interface`; `robot_availability` = `orderable`, `reservation`, `enterprise_sales`, `research_only`, `announced`; `robot_model_kinds` = `vision_language_action`, `language_or_vision_language`, `reinforcement_learning_policy`, `other_learned`; `robot_terms_kinds` = `terms_of_sale`, `sdk_license`, `software_terms`, `warranty_only`, `none_published`.
- Evidence roles, verbatim: `product_page`, `technical_documentation`, `named_model`, `model_interface`, `supporting`. `product_page` is always required; `named_model` when `ai_basis` includes `vendor_named_model`; `model_interface` when it includes `open_model_interface`. `technical_documentation` and `supporting` are never required.
- The gate was loosened by the owner on 2026-09-20 (spec §3–§6): a robot qualifies on either AI basis, `named_models` may be empty when the basis is `open_model_interface` alone, a product page that states the hardware satisfies condition 4, and a page that fails the two-fetch rule is cited with `"unpinnable": true` instead of holding the robot.
- Record-reference kind is `robot`; share pages live at `records/robots/<id>/`; payloads are `app/robots.json`, `app/search/robots.json`, `app/detail/robot/<id>.json`. `web/robots.json` (the published collection) is unrelated to the existing `web/robots.txt`.
- The Robots navigation entry is hidden while the collection has zero records.
- Reader-facing copy uses plain words: "Robots", "Models the vendor names", "vendor-stated", "Runs your own models", "Maker names a model". No internal vocabulary ("score profile", "gate", "condition 3") in any string a reader sees.
- Edit canonical inputs and generators only (`AGENTS.md` rule 13). After any change to `directory/*.json` or a generator, run the regeneration sequence and commit its output:
  ```bash
  uv run python scripts/sync_web_data.py
  uv run python scripts/build_web_payload.py
  uv run python scripts/build_share_pages.py
  /usr/local/bin/node scripts/build_asset_version.mjs
  ```
- Run all Node tooling with `export PATH=/usr/local/bin:$PATH` first.
- `git diff` is wrapped by an external diff tool on this machine; any scripted diff needs `--no-ext-diff`.
- Automation never writes a robot record; both promote scripts must keep refusing held candidates, and nothing in this plan adds a robot promotion path.
- A subagent's research is a lead, never evidence. In Task 11 the reviewer re-fetches every URL and quotation personally before it lands.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md` | The collection's own decision record (ADR 013 and ADR 015 conditions). |
| `docs/ROBOTS.md` | Reviewer's guide: boundary, classification, evidence workflow, two-fetch rule. |
| `directory/robots.json` | Canonical collection. Empty in PR 2. |
| `scripts/check_page_stability.py` | The two-fetch rule as a command: fetch a URL twice, print both visible-text hashes. |
| `tests/test_page_stability.py` | Unit tests for the above, no network. |
| `tests/e2e/robots.spec.js` | Browser tests for the Robots scope, fed by routed fixture payloads. |

**Modified** (one responsibility each, all existing files)

- Validation: `scripts/validate_directory.py`, `directory/taxonomy.json`, `tests/test_validation_policy.py`, `tests/test_directory.py`.
- File lists: `scripts/sync_web_data.py`, `scripts/run_directory_refresh.py`, `scripts/build_candidate_evidence.py`, `scripts/promote_system_candidate.py`, `scripts/promote_model_candidate.py`, `scripts/update_directory.py` and their tests.
- Operations: `scripts/check_evidence_links.py`, `scripts/report_review_age.py`, `tests/test_evidence_links.py`, `tests/test_review_age.py`.
- Generators: `scripts/build_web_payload.py`, `scripts/build_share_pages.py`, `scripts/build_asset_version.mjs`, `scripts/build_logos.mjs`, `tests/test_web_payload.py`, `tests/test_share_pages.py`.
- Web: `web/app-core.js`, `web/app.js`, `web/index.html`, `web/styles.css`, `tests/test_web.js`, `tests/e2e/helpers/catalog-counts.js`.
- Documents and agent surface: `AGENTS.md`, `README.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/CURATION.md`, `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, `docs/TAXONOMY.md`, `docs/WEB.md`, `docs/COVERAGE.md`, `skills/ai-systems-atlas/SKILL.md`, `skills/ai-systems-atlas/reference.md`, `web/llms.txt`, `tests/test_documentation.py`.

`scripts/validate_directory.py` is already ~3,000 lines. This plan follows its existing pattern (one `validate_<collection>` function plus constants) rather than splitting it; a split is unrelated refactoring.

---

# PR 1 — Decision record and reviewer's guide

Branch: `claude/robots-collection-spec` (already carries the spec).

### Task 1: ADR 037 and `docs/ROBOTS.md`

**Files:**
- Create: `docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md`
- Create: `docs/ROBOTS.md`
- Modify: `AGENTS.md` (topic map), `tests/test_documentation.py:126` (ADR and guide list), `BACKLOG.md` (the "Decide the Robots collection" item)
- Test: `tests/test_documentation.py`

**Interfaces:**
- Consumes: the spec.
- Produces: the two document paths above, which Task 10 edits (ADR status → Accepted) and every later task cites.

- [ ] **Step 1: Write the failing test**

In `tests/test_documentation.py`, inside `test_task_routing_documents_exist`, add `"docs/ROBOTS.md",` after the `"docs/PACKS.md",` line, and add after the ADR 036 line:

```python
            "docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run python -m unittest tests.test_documentation -v 2>&1 | tail -15`
Expected: FAIL in `test_task_routing_documents_exist` with `docs/ROBOTS.md`.

- [ ] **Step 3: Read the skeptic's findings, then write ADR 037**

The controller has already briefed a repo-only skeptic; its findings are in `.superpowers/sdd/2026-09-20-robots-collection/adr-037-skeptic.md` (the dispatch gives the absolute path). Read it first. The spec was amended to answer it; the ADR must answer each surviving objection in its own words — condition 3 records documentation, not behaviour (cite ADR 029's "Statuses record documentation, not behaviour" and answer ADR 023's "convicts the inspectable and acquits the opaque"); the significance cost is stated ("nothing refuses the tenth quadruped except the queue and the ecosystem-significance judgement"); `first_party_domains` is named as a new, unmonitored trust anchor with its two limits; a withdrawn claim keeps its record under ADR 016 with `status: removed`; discovery cannot see repo-less products. Check every file and line citation you reuse from the skeptic's file yourself.

Then write the ADR with these sections and this content:

```markdown
# ADR 037: Robots are unscored records of what a vendor documents

**Status:** Proposed

## Context
```
- ADR 036 put AI robots in scope and admitted nothing; four candidates wait under `robots collection decision`.
- Inclusion-gate condition 4 in `docs/CURATION.md` is unmeetable for purchased hardware (quote batch 39: "genuinely unmeetable from what each vendor publishes").
- Scoring a robot under a system profile would measure the vendor's closed stack (ADR 032: "Every score dimension would measure the host").
- Batch 39 left the closed-system property unexercised.
- The skeptic's findings, stated plainly.

```markdown
## Decision
```
- Robots are a further collection in `directory/robots.json`, satisfying ADR 013's three conditions: schema (spec §5), boundary (spec §3, six conditions reproduced in full), comparison policy (spec §4: never scored, compared, ranked, sorted, given a Finder goal or a badge).
- The gate rests on composition evidence: what the vendor's documentation **names**, never what the robot does. `named_models` is recorded as a vendor claim with `research_confidence`.
- Stated weak point, verbatim from spec §4.
- Significance is not a gate: a famous robot that fails condition 3 or 4 stays held (`docs/COVERAGE.md`: "Do not add a new family merely to fit a famous product").
- Placement: a Robots scope, unscored cards, no comparison, hidden while empty.
- A repository appears in at most one collection; a repo-less robot is unique by canonical `url`.

```markdown
### What this does not change
```
- ADR 036's bounds (no vehicles, drones, components, general AI hardware).
- The Models collection: `related_models` stays empty until the action-policy model decision.
- The systems gate: robot software is reviewed under `docs/CURATION.md`, not here.

```markdown
## Alternatives considered
```
- **Robots as `agent_system` records** — condition 4 unmeetable; scores would measure a closed stack.
- **Hardware as a trait on software records (ADR 034's reasoning)** — a robot exists whether or not reviewed software runs on it, and it cannot meet the systems gate. Do not argue from `related_models`: it is empty by design.
- **Structured numeric specifications** — would invite ranking and churn with every vendor revision.
- **Admitting any programmable robot** — pulls in classical robotics that batch 39 excluded on the software side.

```markdown
## Consequences
```
- Spot, Unitree G1, Figure, and 1X NEO are reviewed against the gate in a later change; any may stay held.
- The link checker monitors the named-model page for drift.
- The record becomes Accepted when the collection plumbing lands.

- [ ] **Step 4: Write `docs/ROBOTS.md`**

Model it on `docs/PACKS.md` (same headings, same imperative voice). Sections and required content:

1. `# Robot curation` — one paragraph: what the guide is for, link to ADR 036 and ADR 037.
2. `## Inclusion boundary` — the six conditions from spec §3 verbatim, then the "Outside the collection" sentence.
3. `## Classification` — choose one `form_factor` and one `availability`; record `ai_basis` (`vendor_named_model` when the documentation names a model, `open_model_interface` when it documents a supported way to run the reader's own model or policy, both when both hold); record every `named_models` entry with `kind`, `role_note` in the vendor's terms, and the `evidence_label` it rests on; rate `research_confidence` (`high`: the vendor's technical documentation names the model and what it controls; `medium`: a first-party product or news page names it; `low`: named only in passing or only for a variant).
4. `## Evidence workflow` — numbered:
   1. Establish `first_party_domains` from the product page and the manufacturer's own outbound links. Never add a domain because a search result pointed at it.
   2. For each page you intend to cite, run the two-fetch rule: `uv run python scripts/check_page_stability.py <url>`. Prefer a page whose two hashes match. If no stable first-party page exists for a fact, cite the unstable one with `"unpinnable": true`; it is link-checked but not drift-monitored, and it never holds a robot. Paste both hashes into the PR description either way.
   3. Record `product_page` always, `named_model` for every named model, and `model_interface` when the basis includes `open_model_interface`; add `technical_documentation` when a spec sheet or documentation exists. Prefer `git_blob` evidence from the vendor's own SDK or documentation repository wherever it exists.
   4. Record `terms` as found. A 404 or missing terms page is `none_published` with the observation in `terms_note`; never infer a classification.
   5. Write `hardware` as four prose fields from the spec sheet; write `"Not published."` where the vendor publishes nothing. No numbers lifted into structured fields, no price.
   6. Write `not_verified` in the record's own words: the named-model fact is the vendor's claim, and the evidence is mutable web content.
   7. Run the regeneration sequence, validation, all tests, and the robots row of the browser matrix in `docs/WEB.md`.
5. `## Unavailable pages` — spec §6 rule 7 verbatim.
6. `## What robots never carry` — the forbidden field list and the comparison policy.

- [ ] **Step 5: Link the guide so the reachability test passes**

In `AGENTS.md`'s topic map, add after the Agent packs row:

```markdown
| AI robots, vendor-named models, robot hardware, terms of sale | [Robots](docs/ROBOTS.md) |
```

`docs/ROBOTS.md` must link ADR 037 with a relative link (`adr/037-…md`) so the ADR is reachable from `AGENTS.md`.

In `BACKLOG.md`, rewrite the "Decide the Robots collection in a record of its own" item to say the decision is drafted as ADR 037 (Proposed) and what remains is the plumbing and the first reviews, linking this plan.

- [ ] **Step 6: Run the tests**

Run: `uv run python -m unittest tests.test_documentation -v 2>&1 | tail -5`
Expected: `OK`.

- [ ] **Step 7: Commit, push, open PR 1**

```bash
git add docs/adr/037-*.md docs/ROBOTS.md AGENTS.md BACKLOG.md tests/test_documentation.py docs/superpowers/plans/2026-09-20-robots-collection.md
git commit -m "Propose the Robots collection (ADR 037) and its reviewer's guide"
git fetch origin main && git merge --no-edit origin/main
git push -u origin HEAD
gh pr create --base main --title "Propose the unscored Robots collection (ADR 037)" --body "<summary, checks run>"
```

The push hook runs the full suite and takes several minutes; run it in the background. After opening, merge `main` again if the PR reports BEHIND — strict branch protection skips `verify` on a stale branch.

---

# PR 2 — Collection plumbing with zero records

Branch: `claude/robots-collection-plumbing`, cut from `main` after PR 1 merges.

### Task 2: Taxonomy groups, the empty collection, and every file list

**Files:**
- Create: `directory/robots.json`
- Modify: `directory/taxonomy.json` (five groups after `pack_install_mechanisms`), `scripts/validate_directory.py:27-38` (`PUBLISHED_DATA`), `:132-134` (`TAXONOMY_GROUPS`), `:3014-3022` (summary), `scripts/sync_web_data.py:10-21`, `scripts/run_directory_refresh.py:56`, `scripts/build_candidate_evidence.py:40-55`
- Test: `tests/test_validation_policy.py`, `tests/test_documentation.py`, `tests/test_candidate_evidence.py:757-777`

**Interfaces:**
- Produces: `directory/robots.json` with envelope `{"version": "1.0", "verified_at": "<today>", "robots": []}`; `tax.enum_ids["robot_form_factors" | "robot_availability" | "robot_model_kinds" | "robot_terms_kinds" | "robot_ai_bases"]`; `validate_robots(robots_data, tax, index, errors) -> list[Any]` (envelope only in this task; Tasks 3–5 fill it in).

- [ ] **Step 1: Write the failing tests**

In `tests/test_validation_policy.py`, add to `ValidationPolicyTests`, after the last pack test:

```python
    SAMPLE_ROBOT = {
        "id": "sample-robot",
        "name": "Sample Robot",
        "manufacturer": "Example Robotics",
        "url": "https://robots.example/sample",
        "first_party_domains": ["robots.example", "github.com/example-robotics"],
        "description": "A humanoid whose maker documents a vision-language-action model.",
        "form_factor": "humanoid",
        "availability": "reservation",
        "availability_note": "Reservations open in two regions.",
        "ai_basis": ["vendor_named_model"],
        "named_models": [
            {
                "name": "Sample-VLA",
                "kind": "vision_language_action",
                "role_note": "The vendor says it turns camera frames and a spoken request into arm and hand motion.",
                "evidence_label": "Model announcement",
            }
        ],
        "research_confidence": "medium",
        "hardware": {
            "compute": "Not published.",
            "sensors": "Two head cameras and a depth sensor, per the spec sheet.",
            "actuation": "Electric actuators in both arms and hands.",
            "power": "Not published.",
        },
        "developer_access": "The vendor documents no SDK.",
        "terms": ["terms_of_sale"],
        "terms_note": "Terms of sale cover the purchase and name no software licence.",
        "terms_evidence": [
            {
                "terms_kind": "terms_of_sale",
                "scope": "Purchase terms",
                "kind": "web_terms",
                "url": "https://robots.example/terms",
                "verified_at": "2026-09-20",
            }
        ],
        "not_verified": "The model named here is the maker's own claim and is not verified by the Atlas; every source is a web page the maker can change.",
        "status": "active",
        "evidence": [
            {
                "kind": "web",
                "role": "product_page",
                "label": "Product page",
                "url": "https://robots.example/sample",
                "verified_at": "2026-09-20",
            },
            {
                "kind": "web",
                "role": "technical_documentation",
                "label": "Spec sheet",
                "url": "https://docs.robots.example/sample/specs",
                "verified_at": "2026-09-20",
            },
            {
                "kind": "web",
                "role": "named_model",
                "label": "Model announcement",
                "url": "https://robots.example/news/sample-vla",
                "verified_at": "2026-09-20",
            },
        ],
        "verified_at": "2026-09-20",
    }

    def catalog_with_robot(self, mutate=None) -> list[str]:
        """Validate a temporary catalog holding one synthetic robot."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        robots_path = root / "directory" / "robots.json"
        document = json.loads(robots_path.read_text(encoding="utf-8"))
        robot = json.loads(json.dumps(self.SAMPLE_ROBOT))
        document["robots"] = [robot]
        if mutate is not None:
            mutate(robot, root)
        self.write_json(robots_path, document)
        self.write_json(root / "web" / "robots.json", document)
        return validate(root)

    def test_the_committed_robots_collection_validates(self) -> None:
        self.assertEqual([], validate(ROOT))

    def test_robot_taxonomy_groups_exist(self) -> None:
        taxonomy = json.loads(
            (ROOT / "directory" / "taxonomy.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            ["humanoid", "quadruped", "arm", "mobile_manipulator", "other"],
            [item["id"] for item in taxonomy["robot_form_factors"]],
        )
        self.assertEqual(
            ["orderable", "reservation", "enterprise_sales", "research_only", "announced"],
            [item["id"] for item in taxonomy["robot_availability"]],
        )
        self.assertEqual(
            [
                "vision_language_action",
                "language_or_vision_language",
                "reinforcement_learning_policy",
                "other_learned",
            ],
            [item["id"] for item in taxonomy["robot_model_kinds"]],
        )
        self.assertEqual(
            ["terms_of_sale", "sdk_license", "software_terms", "warranty_only", "none_published"],
            [item["id"] for item in taxonomy["robot_terms_kinds"]],
        )
        self.assertEqual(
            ["vendor_named_model", "open_model_interface"],
            [item["id"] for item in taxonomy["robot_ai_bases"]],
        )
```

If `ROOT` is not already imported at the top of the file, it is defined there as the repository root; check the existing imports and reuse the existing name.

Also add `("robots.json", "robots", "every robot must be an object"),` to the malformed-record table at `tests/test_validation_policy.py:679-700`, and in `tests/test_candidate_evidence.py:757-777` add `"robots.json": {"robots": [{"id": "b"}]},` to `contents` and `self.assertEqual([{"id": "b"}], catalog["robots.json"])`.

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy tests.test_candidate_evidence 2>&1 | tail -8`
Expected: FAIL — `KeyError: 'robot_form_factors'` and a missing `robots.json`.

- [ ] **Step 3: Add the taxonomy groups**

In `directory/taxonomy.json`, after the closing `]` of `pack_install_mechanisms`, add five groups. Every entry is `{"id", "name", "definition"}`:

```json
  "robot_form_factors": [
    {"id": "humanoid", "name": "Humanoid", "definition": "A robot with a torso, two arms, and legs or a wheeled base standing in for them, built to work in spaces made for people."},
    {"id": "quadruped", "name": "Quadruped", "definition": "A four-legged walking robot."},
    {"id": "arm", "name": "Arm", "definition": "A fixed or bench-mounted manipulator with no locomotion of its own."},
    {"id": "mobile_manipulator", "name": "Mobile manipulator", "definition": "One or more arms on a wheeled or tracked base that moves itself."},
    {"id": "other", "name": "Other", "definition": "A robot whose body fits none of the named forms; the record's description says what it is. Never a vehicle, a drone, or a component."}
  ],
  "robot_ai_bases": [
    {"id": "vendor_named_model", "name": "Maker names a model", "definition": "The maker's own documentation names a learned model or policy and says what it controls on the robot."},
    {"id": "open_model_interface", "name": "Runs your own models", "definition": "The maker documents a supported way to run your own model or policy on the robot, such as an SDK or a policy interface."}
  ],
  "robot_availability": [
    {"id": "orderable", "name": "Orderable", "definition": "The maker's own site takes an order or states a price and a way to buy."},
    {"id": "reservation", "name": "Reservation", "definition": "The maker takes a deposit or a place in a queue ahead of delivery."},
    {"id": "enterprise_sales", "name": "Enterprise sales", "definition": "Sold through a sales contact or a pilot programme, with no public order path."},
    {"id": "research_only", "name": "Research only", "definition": "Offered to laboratories or developers, not for general use."},
    {"id": "announced", "name": "Announced", "definition": "Documented by its maker, with no stated way to obtain one yet."}
  ],
  "robot_model_kinds": [
    {"id": "vision_language_action", "name": "Vision-language-action model", "definition": "A model the maker says takes images and language and produces robot actions."},
    {"id": "language_or_vision_language", "name": "Language or vision-language model", "definition": "A model the maker says interprets requests or scenes and plans in language, with motion produced elsewhere."},
    {"id": "reinforcement_learning_policy", "name": "Reinforcement-learning policy", "definition": "A learned control policy the maker says was trained by reinforcement learning, typically for locomotion or manipulation."},
    {"id": "other_learned", "name": "Other learned model", "definition": "A learned model the maker names that fits none of the other kinds; the record says what the maker claims for it."}
  ],
  "robot_terms_kinds": [
    {"id": "terms_of_sale", "name": "Terms of sale", "definition": "The maker's purchase, subscription, or reservation terms."},
    {"id": "sdk_license", "name": "SDK licence", "definition": "A licence covering a software development kit the maker publishes for the robot."},
    {"id": "software_terms", "name": "Software terms", "definition": "Terms covering the software that ships on or with the robot."},
    {"id": "warranty_only", "name": "Warranty only", "definition": "The only published terms are a hardware warranty or after-sales policy."},
    {"id": "none_published", "name": "None published", "definition": "No terms could be found on the maker's own pages at review time."}
  ],
```

Match the file's existing indentation (expand each entry over multiple lines as its neighbours are).

- [ ] **Step 4: Create the empty collection and register it everywhere**

`directory/robots.json`:

```json
{
  "version": "1.0",
  "verified_at": "2026-09-20",
  "robots": []
}
```

Use today's date. Then:

- `scripts/validate_directory.py` `PUBLISHED_DATA` (`:27-38`): add `"robots.json",` after `"packs.json",`.
- `scripts/validate_directory.py` `TAXONOMY_GROUPS` (`:132-134`): add the five group names after `"pack_install_mechanisms",`.
- `scripts/sync_web_data.py:10-21`: add `"robots.json",` after `"packs.json",`.
- `scripts/run_directory_refresh.py:56`: add `"directory/robots.json",` after `"directory/packs.json",`.
- `scripts/build_candidate_evidence.py`: add `"robots.json"` to `CATALOG_FILES` and `"robots.json": "robots"` to `COLLECTION_KEYS`.

- [ ] **Step 5: Add the validator skeleton and the summary clause**

In `scripts/validate_directory.py`, after `validate_packs` (ends `:1607`):

```python
def validate_robots(
    robots_data: dict[str, Any],
    tax: Taxonomy,
    index: ProjectIndex,
    errors: list[str],
) -> list[Any]:
    """Validate unscored robot records: what a vendor documents, never what a robot does (ADR 037)."""
    robots_value = validate_collection_envelope(
        robots_data, "robots.json", "1.0", "robots", errors
    )
    for robot in robots_value:
        if not isinstance(robot, dict):
            errors.append("robots.json: every robot must be an object")
            continue
    return robots_value
```

In `validate()`, directly after the `pack_repos = {...}` block (`:2948-2952`):

```python
    robots_value = validate_robots(catalog["robots.json"], tax, index, errors)
```

In `main()` (`:3014-3022`), add `robot_count = len(load("robots.json")["robots"])` beside `pack_count`, and the clause `f"{robot_count} unscored robots; "` directly after the agent-packs clause.

- [ ] **Step 6: Sync and run**

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py | tail -1
uv run python -m unittest tests.test_validation_policy tests.test_candidate_evidence tests.test_documentation 2>&1 | tail -4
```

Expected: the summary line contains `0 unscored robots;` and the three modules report `OK`. (`tests.test_promote_*` and `tests.test_evidence_links` are untouched so far and still pass, because nothing loads `robots.json` there yet.)

- [ ] **Step 7: Commit**

```bash
git add directory/robots.json directory/taxonomy.json web/robots.json web/taxonomy.json scripts/validate_directory.py scripts/sync_web_data.py scripts/run_directory_refresh.py scripts/build_candidate_evidence.py tests/
git commit -m "Register the empty Robots collection and its taxonomy groups"
```

`web/taxonomy.json` changes feed the asset stamp; the commit hook's freshness check will tell you to run `build_asset_version.mjs` — run it and add `web/index.html`.

### Task 3: Robot record schema

**Files:**
- Modify: `scripts/validate_directory.py` (constants after `PACK_FORBIDDEN` at `:250-257`; body of `validate_robots`)
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `validate_robots` skeleton, `SAMPLE_ROBOT`, `catalog_with_robot` from Task 2; existing helpers `validate_string_list`, `valid_date`, `ID_PATTERN`.
- Produces: constants `ROBOT_REQUIRED`, `ROBOT_OPTIONAL`, `ROBOT_FORBIDDEN`, `ROBOT_HARDWARE_FIELDS`, `ROBOT_NAMED_MODEL_FIELDS`. Error strings other tasks and tests match on: `"<field> is never recorded on a robot"`, `"fields differ from schema"`, `"vendor_named_model must be in ai_basis exactly when named_models is non-empty"`, `"hardware must carry exactly"`.

- [ ] **Step 1: Write the failing tests**

```python
    def test_valid_robot_passes_validation(self) -> None:
        errors = self.catalog_with_robot()
        self.assertFalse([e for e in errors if "sample-robot" in e], errors)

    def test_robot_rejects_every_scoring_price_and_popularity_field(self) -> None:
        for field, value in (
            ("score", {"overall": 5}),
            ("score_profile", "agent_system"),
            ("system_family", "agent_system"),
            ("primary_role", "coding_agent"),
            ("stars", 10),
            ("stars_verified_at", "2026-09-20"),
            ("price", "$20,000"),
            ("price_usd", 20000),
            ("benchmarks", {"lift_kg": 20}),
        ):
            with self.subTest(field=field):

                def mutate(robot, root, field=field, value=value):
                    robot[field] = value

                errors = self.catalog_with_robot(mutate)
                self.assertTrue(
                    any(f"{field} is never recorded on a robot" in e for e in errors),
                    errors,
                )

    def test_robot_rejects_unknown_and_missing_fields(self) -> None:
        def add_unknown(robot, root):
            robot["payload_kg"] = 3

        def drop_required(robot, root):
            del robot["not_verified"]

        for mutate, needle in (
            (add_unknown, "extra=['payload_kg']"),
            (drop_required, "missing=['not_verified']"),
        ):
            with self.subTest(needle=needle):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_enums_come_from_the_taxonomy(self) -> None:
        for field, needle in (
            ("form_factor", "unknown form factor"),
            ("availability", "unknown availability"),
            ("status", "unknown status"),
            ("research_confidence", "unknown research confidence"),
        ):
            with self.subTest(field=field):

                def mutate(robot, root, field=field):
                    robot[field] = "not-a-value"

                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_superseded_status_names_a_successor_robot(self) -> None:
        def missing(robot, root):
            robot["status"] = "superseded"

        def stray(robot, root):
            robot["superseded_by"] = "sample-robot-2"

        def itself(robot, root):
            robot["status"] = "superseded"
            robot["superseded_by"] = "sample-robot"

        for mutate, needle in (
            (missing, "superseded status requires superseded_by"),
            (stray, "superseded_by requires the superseded status"),
            (itself, "a robot cannot supersede itself"),
        ):
            with self.subTest(needle=needle):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_ai_basis_agrees_with_named_models(self) -> None:
        def named_without_basis(robot, root):
            robot["ai_basis"] = ["open_model_interface"]

        def basis_without_named(robot, root):
            robot["named_models"] = []

        def unknown_basis(robot, root):
            robot["ai_basis"] = ["autonomy"]

        def no_basis(robot, root):
            robot["ai_basis"] = []

        for mutate, needle in (
            (named_without_basis, "vendor_named_model must be in ai_basis exactly when named_models is non-empty"),
            (basis_without_named, "vendor_named_model must be in ai_basis exactly when named_models is non-empty"),
            (unknown_basis, "unknown ai_basis"),
            (no_basis, "ai_basis must be a non-empty list"),
        ):
            with self.subTest(mutate=mutate.__name__):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_named_model_has_a_closed_shape_and_a_known_kind(self) -> None:
        def extra_key(robot, root):
            robot["named_models"][0]["parameters"] = "7B"

        def bad_kind(robot, root):
            robot["named_models"][0]["kind"] = "planner"

        for mutate, needle in (
            (extra_key, "named_models entries must carry exactly"),
            (bad_kind, "unknown named model kind"),
        ):
            with self.subTest(needle=needle):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_hardware_is_four_prose_fields(self) -> None:
        def numeric(robot, root):
            robot["hardware"]["payload_kg"] = 3

        def empty(robot, root):
            robot["hardware"]["compute"] = " "

        for mutate, needle in (
            (numeric, "hardware must carry exactly"),
            (empty, "hardware.compute must be a non-empty string"),
        ):
            with self.subTest(needle=needle):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy -k robot 2>&1 | tail -12`
Expected: every new test except `test_valid_robot_passes_validation` FAILS (the skeleton accepts anything).

- [ ] **Step 3: Implement**

After `PACK_FORBIDDEN`:

```python
ROBOT_REQUIRED = {
    "id",
    "name",
    "manufacturer",
    "url",
    "first_party_domains",
    "description",
    "form_factor",
    "availability",
    "availability_note",
    "ai_basis",
    "named_models",
    "research_confidence",
    "hardware",
    "developer_access",
    "terms",
    "terms_note",
    "terms_evidence",
    "not_verified",
    "status",
    "evidence",
    "verified_at",
}
ROBOT_OPTIONAL = {
    "short_name",
    "variants",
    "repo",
    "superseded_by",
    "related_systems",
    "related_models",
    "related_robots",
}
# A robot is recorded for what its maker documents, never scored, priced, or ranked (ADR 037).
ROBOT_FORBIDDEN = {
    "score",
    "score_profile",
    "system_family",
    "primary_role",
    "stars",
    "stars_verified_at",
    "price",
    "price_usd",
    "benchmarks",
}
ROBOT_HARDWARE_FIELDS = ("compute", "sensors", "actuation", "power")
ROBOT_NAMED_MODEL_FIELDS = {"name", "kind", "role_note", "evidence_label"}
```

Replace the loop body of `validate_robots` with:

```python
    enum_ids = tax.enum_ids
    for robot in robots_value:
        if not isinstance(robot, dict):
            errors.append("robots.json: every robot must be an object")
            continue
        prefix = f"robot {robot.get('id', 'unknown')}"
        for field in sorted(ROBOT_FORBIDDEN & set(robot)):
            errors.append(f"{prefix}: {field} is never recorded on a robot")
        fields = set(robot) - ROBOT_FORBIDDEN
        if ROBOT_REQUIRED - fields or fields - ROBOT_REQUIRED - ROBOT_OPTIONAL:
            missing = sorted(ROBOT_REQUIRED - fields)
            extra = sorted(fields - ROBOT_REQUIRED - ROBOT_OPTIONAL)
            errors.append(
                f"{prefix}: fields differ from schema: missing={missing}, extra={extra}"
            )
        robot_id = robot.get("id")
        if not isinstance(robot_id, str) or not ID_PATTERN.fullmatch(robot_id):
            errors.append(f"{prefix}: invalid id")
        for field in (
            "name",
            "manufacturer",
            "description",
            "availability_note",
            "developer_access",
            "terms_note",
            "not_verified",
        ):
            if not isinstance(robot.get(field), str) or not robot[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        for field in ("short_name", "variants"):
            if field in robot and (
                not isinstance(robot[field], str) or not robot[field].strip()
            ):
                errors.append(
                    f"{prefix}: {field} must be a non-empty string when present"
                )
        if not isinstance(robot.get("url"), str) or not robot["url"].startswith(
            "https://"
        ):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        if robot.get("form_factor") not in enum_ids["robot_form_factors"]:
            errors.append(f"{prefix}: unknown form factor")
        if robot.get("availability") not in enum_ids["robot_availability"]:
            errors.append(f"{prefix}: unknown availability")
        if robot.get("status") not in enum_ids["project_statuses"]:
            errors.append(f"{prefix}: unknown status")
        if robot.get("research_confidence") not in enum_ids["research_confidence_levels"]:
            errors.append(f"{prefix}: unknown research confidence")
        if not valid_date(robot.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")
        if robot.get("status") == "superseded":
            if "superseded_by" not in robot:
                errors.append(f"{prefix}: superseded status requires superseded_by")
            elif robot["superseded_by"] == robot_id:
                errors.append(f"{prefix}: a robot cannot supersede itself")
        elif "superseded_by" in robot:
            errors.append(f"{prefix}: superseded_by requires the superseded status")

        validate_string_list(
            robot, "ai_basis", enum_ids["robot_ai_bases"], prefix, errors
        )
        ai_basis = robot.get("ai_basis") if isinstance(robot.get("ai_basis"), list) else []
        named_models = robot.get("named_models")
        if not isinstance(named_models, list):
            errors.append(f"{prefix}: named_models must be a list")
            named_models = []
        if ("vendor_named_model" in ai_basis) != bool(named_models):
            errors.append(
                f"{prefix}: vendor_named_model must be in ai_basis exactly when "
                "named_models is non-empty"
            )
        for entry in named_models:
            if not isinstance(entry, dict) or set(entry) != ROBOT_NAMED_MODEL_FIELDS:
                errors.append(
                    f"{prefix}: named_models entries must carry exactly "
                    f"{sorted(ROBOT_NAMED_MODEL_FIELDS)}"
                )
                continue
            for field in ("name", "role_note", "evidence_label"):
                if not isinstance(entry[field], str) or not entry[field].strip():
                    errors.append(
                        f"{prefix}: named_models.{field} must be a non-empty string"
                    )
            if entry["kind"] not in enum_ids["robot_model_kinds"]:
                errors.append(f"{prefix}: unknown named model kind")

        hardware = robot.get("hardware")
        if not isinstance(hardware, dict) or set(hardware) != set(ROBOT_HARDWARE_FIELDS):
            errors.append(
                f"{prefix}: hardware must carry exactly {list(ROBOT_HARDWARE_FIELDS)}"
            )
        else:
            for field in ROBOT_HARDWARE_FIELDS:
                if not isinstance(hardware[field], str) or not hardware[field].strip():
                    errors.append(
                        f"{prefix}: hardware.{field} must be a non-empty string"
                    )
```

Check the exact messages `validate_string_list` emits for an empty list and for an unknown value, and make the `ai_basis` test needles (`"ai_basis must be a non-empty list"`, `"unknown ai_basis"`) match them rather than changing the helper. Confirm `research_confidence_levels` is in `TAXONOMY_GROUPS`; it is used by project validation, so it should be. If the project validator reads it under another name, use that name.

- [ ] **Step 4: Run the tests**

Run: `uv run python -m unittest tests.test_validation_policy -k robot 2>&1 | tail -4`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Validate the robot record schema"
```

### Task 4: First-party domains, evidence roles, and terms

**Files:**
- Modify: `scripts/validate_directory.py` (new helpers before `validate_robots`; more of its body)
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: Task 3's `validate_robots`; existing `validate_evidence_items(evidence_items, repo, prefix, errors)` (open key set, so `role` passes through it untouched), `REPO_PATTERN`.
- Produces: `url_is_first_party(url: str, domains: list[str]) -> bool`; constant `ROBOT_EVIDENCE_ROLES = ("product_page", "technical_documentation", "named_model", "model_interface", "supporting")` and the mapping `ROBOT_BASIS_EVIDENCE_ROLE = {"vendor_named_model": "named_model", "open_model_interface": "model_interface"}`. Task 6 monitors the two basis roles by their literal names.

- [ ] **Step 1: Write the failing tests**

```python
    def test_robot_evidence_must_cover_the_roles_its_basis_requires(self) -> None:
        def no_product_page(robot, root):
            robot["evidence"] = [i for i in robot["evidence"] if i["role"] != "product_page"]

        def interface_without_source(robot, root):
            robot["ai_basis"] = ["vendor_named_model", "open_model_interface"]

        for mutate, needle in (
            (no_product_page, "evidence lacks required roles ['product_page']"),
            (interface_without_source, "evidence lacks required roles ['model_interface']"),
        ):
            with self.subTest(mutate=mutate.__name__):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_robot_may_rest_on_an_open_model_interface_alone(self) -> None:
        def mutate(robot, root):
            robot["ai_basis"] = ["open_model_interface"]
            robot["named_models"] = []
            robot["evidence"] = [
                item for item in robot["evidence"] if item["role"] == "product_page"
            ] + [
                {
                    "kind": "web",
                    "role": "model_interface",
                    "label": "Policy SDK guide",
                    "url": "https://docs.robots.example/sdk/policy",
                    "verified_at": "2026-09-20",
                }
            ]

        errors = self.catalog_with_robot(mutate)
        self.assertFalse([e for e in errors if "sample-robot" in e], errors)

    def test_robot_unpinnable_is_true_and_only_on_web_evidence(self) -> None:
        def ok(robot, root):
            robot["evidence"][2]["unpinnable"] = True

        def falsy(robot, root):
            robot["evidence"][2]["unpinnable"] = False

        self.assertFalse([e for e in self.catalog_with_robot(ok) if "sample-robot" in e])
        self.assertTrue(
            any("unpinnable must be true when present" in e for e in self.catalog_with_robot(falsy))
        )

    def test_robot_evidence_role_is_required_and_closed(self) -> None:
        def missing(robot, root):
            del robot["evidence"][0]["role"]

        def unknown(robot, root):
            robot["evidence"][0]["role"] = "press"

        for mutate in (missing, unknown):
            with self.subTest(mutate=mutate.__name__):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any("unknown evidence role" in e for e in errors), errors)

    def test_robot_named_model_label_must_resolve_to_a_named_model_source(self) -> None:
        def dangling(robot, root):
            robot["named_models"][0]["evidence_label"] = "No such source"

        def wrong_role(robot, root):
            robot["named_models"][0]["evidence_label"] = "Product page"

        for mutate in (dangling, wrong_role):
            with self.subTest(mutate=mutate.__name__):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(
                    any("does not name a named_model source" in e for e in errors), errors
                )

    def test_robot_urls_must_be_first_party(self) -> None:
        def press(robot, root):
            robot["evidence"][2]["url"] = "https://news.example.org/sample-vla"

        def lookalike(robot, root):
            robot["evidence"][2]["url"] = "https://evilrobots.example/sample-vla"

        def foreign_terms(robot, root):
            robot["terms_evidence"][0]["url"] = "https://retailer.example.org/terms"

        for mutate in (press, lookalike, foreign_terms):
            with self.subTest(mutate=mutate.__name__):
                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any("is not first-party" in e for e in errors), errors)

    def test_robot_first_party_domains_accept_subdomains_and_github_orgs(self) -> None:
        def mutate(robot, root):
            robot["repo"] = "example-robotics/sample-sdk"
            robot["evidence"].append(
                {
                    "kind": "git_blob",
                    "role": "supporting",
                    "label": "SDK README",
                    "path": "README.md",
                    "url": "https://github.com/example-robotics/sample-sdk/blob/main/README.md",
                    "blob_sha": "a" * 40,
                    "immutable_url": "https://api.github.com/repos/example-robotics/sample-sdk/git/blobs/"
                    + "a" * 40,
                }
            )

        errors = self.catalog_with_robot(mutate)
        self.assertFalse([e for e in errors if "sample-robot" in e], errors)

    def test_robot_first_party_domains_are_bare_hosts_or_github_orgs(self) -> None:
        for value in ("https://robots.example", "robots.example/path", "github.com", ""):
            with self.subTest(value=value):

                def mutate(robot, root, value=value):
                    robot["first_party_domains"] = [value]

                errors = self.catalog_with_robot(mutate)
                self.assertTrue(
                    any("first_party_domains entries must be" in e for e in errors), errors
                )

    def test_robot_product_page_anchors_the_first_party_list(self) -> None:
        def mutate(robot, root):
            robot["first_party_domains"] = ["docs.robots.example", "github.com/example-robotics"]

        errors = self.catalog_with_robot(mutate)
        self.assertTrue(any("url 'https://robots.example/sample' is not first-party" in e for e in errors), errors)

    def test_robot_first_party_domains_refuse_multi_tenant_hosts(self) -> None:
        for value in ("github.io", "huggingface.co", "youtube.com", "medium.com", "notion.site"):
            with self.subTest(value=value):

                def mutate(robot, root, value=value):
                    robot["first_party_domains"].append(value)

                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any("is a shared host" in e for e in errors), errors)

    def test_robot_none_published_stands_alone_and_permits_no_terms_evidence(self) -> None:
        def alone(robot, root):
            robot["terms"] = ["none_published"]
            robot["terms_evidence"] = []

        def mixed(robot, root):
            robot["terms"] = ["none_published", "terms_of_sale"]

        def uncovered(robot, root):
            robot["terms"] = ["terms_of_sale", "sdk_license"]

        self.assertFalse(
            [e for e in self.catalog_with_robot(alone) if "sample-robot" in e]
        )
        self.assertTrue(
            any("none_published must appear alone" in e for e in self.catalog_with_robot(mixed))
        )
        self.assertTrue(
            any("terms evidence does not match terms" in e for e in self.catalog_with_robot(uncovered))
        )
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy -k robot 2>&1 | tail -12`
Expected: the seven new tests FAIL, except the two that assert validity (`accept_subdomains` and the `alone` half), which pass vacuously.

- [ ] **Step 3: Implement**

Before `validate_robots`:

```python
ROBOT_EVIDENCE_ROLES = (
    "product_page",
    "technical_documentation",
    "named_model",
    "model_interface",
    "supporting",
)
ROBOT_BASIS_EVIDENCE_ROLE = {
    "vendor_named_model": "named_model",
    "open_model_interface": "model_interface",
}
FIRST_PARTY_HOST = re.compile(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+")
FIRST_PARTY_GITHUB_ORG = re.compile(r"github\.com/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?")
# Hosts many unrelated parties publish on. A bare entry would make every tenant
# first-party, so a shared host enters only as github.com/<org>.
MULTI_TENANT_HOSTS = frozenset(
    {
        "github.com",
        "github.io",
        "gitlab.com",
        "huggingface.co",
        "youtube.com",
        "medium.com",
        "substack.com",
        "notion.site",
        "x.com",
        "twitter.com",
        "linkedin.com",
    }
)


def url_is_first_party(url: object, domains: list[str]) -> bool:
    """True when `url` falls under a declared host, a subdomain of one, or a GitHub org."""
    if not isinstance(url, str):
        return False
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        return False
    segments = [part for part in parsed.path.split("/") if part]
    # api.github.com blob URLs are /repos/<owner>/<repo>/git/blobs/<sha>.
    owner_position = {"github.com": 0, "raw.githubusercontent.com": 0, "api.github.com": 1}
    for entry in domains:
        if "/" in entry:
            position = owner_position.get(host)
            if (
                position is not None
                and len(segments) > position
                and segments[position].lower() == entry.split("/", 1)[1].lower()
            ):
                return True
        elif host == entry or host.endswith("." + entry):
            return True
    return False
```

Add `import urllib.parse` at the top of the module if it is not already imported.

Append to the per-robot body of `validate_robots`:

```python
        domains = robot.get("first_party_domains")
        if not isinstance(domains, list) or not domains:
            errors.append(f"{prefix}: first_party_domains must be a non-empty list")
            domains = []
        clean_domains: list[str] = []
        for entry in domains:
            if isinstance(entry, str) and entry in MULTI_TENANT_HOSTS and entry != "github.com":
                errors.append(
                    f"{prefix}: first_party_domains entry {entry!r} is a shared host"
                )
            elif isinstance(entry, str) and (
                FIRST_PARTY_GITHUB_ORG.fullmatch(entry)
                or (FIRST_PARTY_HOST.fullmatch(entry) and entry != "github.com")
            ):
                clean_domains.append(entry)
            else:
                errors.append(
                    f"{prefix}: first_party_domains entries must be a bare lowercase "
                    f"host or github.com/<org>, not {entry!r}"
                )

        repo = robot.get("repo")
        if repo is not None and (
            not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo)
        ):
            errors.append(f"{prefix}: repo must be owner/name when present")
            repo = None

        validate_evidence_items(robot.get("evidence"), repo, prefix, errors)
        evidence = [
            item for item in robot.get("evidence") or [] if isinstance(item, dict)
        ]
        for item in evidence:
            if item.get("role") not in ROBOT_EVIDENCE_ROLES:
                errors.append(
                    f"{prefix}: unknown evidence role {item.get('role')!r} on "
                    f"{item.get('label')!r}"
                )
            if "unpinnable" in item and (
                item["unpinnable"] is not True or item.get("kind") != "web"
            ):
                errors.append(
                    f"{prefix}: unpinnable must be true when present, and only on web evidence"
                )
        present_roles = {item.get("role") for item in evidence}
        required_roles = ["product_page"] + [
            ROBOT_BASIS_EVIDENCE_ROLE[basis]
            for basis in ai_basis
            if basis in ROBOT_BASIS_EVIDENCE_ROLE
        ]
        missing_roles = [role for role in required_roles if role not in present_roles]
        if missing_roles:
            errors.append(f"{prefix}: evidence lacks required roles {missing_roles}")
        named_model_labels = {
            item.get("label") for item in evidence if item.get("role") == "named_model"
        }
        for entry in named_models:
            if (
                isinstance(entry, dict)
                and entry.get("evidence_label") not in named_model_labels
            ):
                errors.append(
                    f"{prefix}: named model {entry.get('name')!r} evidence_label "
                    f"{entry.get('evidence_label')!r} does not name a named_model source"
                )

        terms = robot.get("terms")
        validate_string_list(robot, "terms", enum_ids["robot_terms_kinds"], prefix, errors)
        terms = terms if isinstance(terms, list) else []
        if "none_published" in terms and len(terms) > 1:
            errors.append(f"{prefix}: none_published must appear alone in terms")
        terms_evidence = robot.get("terms_evidence")
        if not isinstance(terms_evidence, list):
            errors.append(f"{prefix}: terms_evidence must be a list")
            terms_evidence = []
        covered: set[object] = set()
        for item in terms_evidence:
            if not isinstance(item, dict) or set(item) - {"unpinnable"} != {
                "terms_kind",
                "scope",
                "kind",
                "url",
                "verified_at",
            } or item.get("unpinnable", True) is not True:
                errors.append(f"{prefix}: terms evidence must match the terms evidence schema")
                continue
            covered.add(item["terms_kind"])
            if item["kind"] != "web_terms":
                errors.append(f"{prefix}: terms evidence kind must be web_terms")
            if not isinstance(item["scope"], str) or not item["scope"].strip():
                errors.append(f"{prefix}: terms evidence requires a scope")
            if not valid_date(item["verified_at"]):
                errors.append(f"{prefix}: terms evidence requires verified_at")
        expected = set(terms) - {"none_published"}
        if covered != expected:
            errors.append(f"{prefix}: terms evidence does not match terms")

        for label, url in (
            [("url", robot.get("url"))]
            + [(f"evidence {item.get('label')!r}", item.get("url")) for item in evidence]
            + [
                (f"evidence {item.get('label')!r} immutable_url", item["immutable_url"])
                for item in evidence
                if "immutable_url" in item
            ]
            + [
                ("terms evidence", item.get("url"))
                for item in terms_evidence
                if isinstance(item, dict)
            ]
        ):
            if not url_is_first_party(url, clean_domains):
                errors.append(f"{prefix}: {label} {url!r} is not first-party")
```

The record `url` is already in the first-party loop above, so a list that omits the product page's own host fails on `url` — that is the anchor the spec requires; no extra code is needed beyond the test. A subdomain of a shared host (`vendor.github.io`) still passes as a bare host entry, because it names one tenant.

`kind: "web_terms"` on `terms_evidence` is what makes `scripts/check_evidence_links.py` monitor a URL for drift (`_add_evidence_items`, `:154-179`), so it is fixed here rather than left to the reviewer. An SDK licence that lives in a repository is cited as `web_terms` on its `github.com/<org>/…/blob/…` URL, with the pinned blob added to `evidence` under the `supporting` role.

- [ ] **Step 4: Run the tests**

Run: `uv run python -m unittest tests.test_validation_policy -k robot 2>&1 | tail -4`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Validate robot evidence roles, first-party domains, and terms"
```

### Task 5: Cross-collection identity and relationships

**Files:**
- Modify: `scripts/validate_directory.py` (`validate_unique_record_ids` `:2356-2382`; `validate()` `:2940-2990`; `validate_robots` signature), `scripts/promote_system_candidate.py:206-214,300-310`, `scripts/promote_model_candidate.py:244,295-305`, `scripts/update_directory.py:53,741-779,798-848`
- Test: `tests/test_validation_policy.py`, `tests/test_promote_system_candidate.py:100-108`, `tests/test_promote_model_candidate.py:75-82`, `tests/test_update_directory.py:659-669,736-744`

**Interfaces:**
- Consumes: `ProjectIndex` fields `ids`, `repos`, `url_keys`; `canonical_url_key` (already imported from `scripts/discovery_sources.py`).
- Produces: `validate_robots(robots_data, tax, index, errors, *, model_ids: set[str], pack_repos: set[str]) -> list[Any]`; `validate_unique_record_ids(..., packs_value=None, robots_value=None)`; `update_directory.ROBOTS_PATH`; `known_urls_from(projects, exclusions, packs=(), robots=())`; `known_repos_from(projects, exclusions, packs=(), robots=())`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_validation_policy.py`:

```python
    def test_robot_ids_must_be_unique_across_collections(self) -> None:
        def mutate(robot, root):
            specs = json.loads(
                (root / "directory" / "specifications.json").read_text(encoding="utf-8")
            )
            robot["id"] = specs["specifications"][0]["id"]

        errors = self.catalog_with_robot(mutate)
        self.assertTrue(
            any("appears in more than one collection" in e for e in errors), errors
        )

    def test_robot_related_ids_must_exist(self) -> None:
        for field in ("related_systems", "related_models", "related_robots"):
            with self.subTest(field=field):

                def mutate(robot, root, field=field):
                    robot[field] = ["no-such-record"]

                errors = self.catalog_with_robot(mutate)
                self.assertTrue(any(f"unknown {field}" in e for e in errors), errors)

    def test_robot_cannot_relate_to_itself(self) -> None:
        def mutate(robot, root):
            robot["related_robots"] = ["sample-robot"]

        errors = self.catalog_with_robot(mutate)
        self.assertTrue(any("cannot relate to itself" in e for e in errors), errors)

    def test_robot_url_cannot_duplicate_a_system_url(self) -> None:
        def mutate(robot, root):
            projects = json.loads(
                (root / "directory" / "projects.json").read_text(encoding="utf-8")
            )
            repoless = next(p for p in projects["projects"] if p.get("repo") is None)
            robot["url"] = repoless["url"]
            robot["first_party_domains"] = [
                urllib.parse.urlsplit(repoless["url"]).hostname
            ]

        errors = self.catalog_with_robot(mutate)
        self.assertTrue(any("is already a system record" in e for e in errors), errors)

    def test_robot_repo_cannot_be_a_system_pack_candidate_or_exclusion(self) -> None:
        def mutate(robot, root):
            projects = json.loads(
                (root / "directory" / "projects.json").read_text(encoding="utf-8")
            )
            robot["repo"] = next(p["repo"] for p in projects["projects"] if p.get("repo"))

        errors = self.catalog_with_robot(mutate)
        self.assertTrue(
            any("cannot be both a system and a robot" in e for e in errors), errors
        )
```

Add `import urllib.parse` to the test module's imports. In `tests/test_update_directory.py`, after `test_a_pack_url_and_repo_join_the_known_sets`:

```python
    def test_a_robot_url_joins_the_known_set_with_or_without_a_repo(self) -> None:
        """A robot is a decided record; discovery must not re-queue its product page."""
        robots = [
            {"url": "https://robots.example/sample"},
            {"repo": "Example-Robotics/SDK", "url": "https://robots.example/other"},
        ]
        known = update_directory.known_urls_from([], {"entries": []}, (), robots)
        self.assertLessEqual(
            {"https://robots.example/sample", "https://robots.example/other"}, known
        )
        repos = update_directory.known_repos_from([], {"entries": []}, (), robots)
        self.assertEqual({"example-robotics/sdk"}, repos)
```

In the same file's `documents` dict (`:659-669`) add `update_directory.ROBOTS_PATH: {"robots": []},`. In `tests/test_promote_system_candidate.py:100-108` and `tests/test_promote_model_candidate.py:75-82`, add `"robots.json",` to the tuple of files copied from the real catalog.

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy tests.test_update_directory -k robot 2>&1 | tail -10`
Expected: FAIL — no such errors are raised yet; `AttributeError: ROBOTS_PATH`.

- [ ] **Step 3: Implement the validator side**

Change the signature to `def validate_robots(robots_data, tax, index, errors, *, model_ids: set[str], pack_repos: set[str]) -> list[Any]:` and append to the per-robot body:

```python
        if isinstance(repo, str):
            if repo.lower() in index.repos:
                errors.append(f"{prefix}: {repo} cannot be both a system and a robot")
            if repo.lower() in pack_repos:
                errors.append(f"{prefix}: {repo} cannot be both a pack and a robot")
            if repo.lower() in robot_repos_seen:
                errors.append(f"{prefix}: duplicate robot repository {repo}")
            robot_repos_seen.add(repo.lower())
        url_key = canonical_url_key(robot.get("url", ""))
        if url_key in index.url_keys:
            errors.append(f"{prefix}: {robot.get('url')} is already a system record")
        if url_key in robot_urls_seen:
            errors.append(f"{prefix}: duplicate robot url {robot.get('url')}")
        robot_urls_seen.add(url_key)
        for field, allowed in (
            ("related_systems", index.ids),
            ("related_models", model_ids),
            ("related_robots", robot_ids),
        ):
            if field in robot:
                validate_string_list(
                    robot, field, allowed, prefix, errors, allow_empty=True
                )
        if robot_id in robot.get("related_robots", []):
            errors.append(f"{prefix}: cannot relate to itself")
        if "superseded_by" in robot and robot["superseded_by"] not in robot_ids:
            errors.append(f"{prefix}: superseded_by must name a robot record")
```

Add to this task's tests a case that sets `status: "superseded"` with `superseded_by: "no-such-robot"` and expects `"superseded_by must name a robot record"`.

Before the loop, initialise:

```python
    robot_ids = {
        item.get("id")
        for item in robots_value
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    robot_repos_seen: set[str] = set()
    robot_urls_seen: set[str] = set()
```

In `validate()`, replace Task 2's call with:

```python
    model_ids = {
        item["id"]
        for item in models_value
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    robots_value = validate_robots(
        catalog["robots.json"],
        tax,
        index,
        errors,
        model_ids=model_ids,
        pack_repos=pack_repos,
    )
    robot_repos = {
        item["repo"].lower()
        for item in robots_value
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    }
```

Pass `robots_value=robots_value` to `validate_unique_record_ids`. Beside the existing candidates-and-packs overlap check add:

```python
    if overlap := candidate_repos & robot_repos:
        errors.append(
            f"repositories cannot be both candidates and robots: {sorted(overlap)}"
        )
```

and change the exclusions call to pass `index.repos | pack_repos | robot_repos`.

In `validate_unique_record_ids`, add the parameter `robots_value: list[Any] | None = None` after `packs_value` and the tuple row `("robots.json", robots_value or []),`.

Note the four held robot candidates in `directory/candidates.json` have `repo: null`, so the repo overlap check cannot catch a robot that is both queued and published. Task 11 removes each candidate in the same change that publishes its record, and says so.

- [ ] **Step 4: Implement the promote and discovery side**

In both promote scripts, beside `packs_data = load_json(directory / "packs.json")` add `robots_data = load_json(directory / "robots.json")`, and pass to `validate_unique_record_ids`:

```python
        robots_value=robots_data.get("robots")
        if isinstance(robots_data.get("robots"), list)
        else [],
```

In `scripts/update_directory.py`: add `ROBOTS_PATH = DIRECTORY / "robots.json"` beside `PACKS_PATH`; give `known_urls_from` and `known_repos_from` a fourth parameter `robots: list[dict[str, Any]] = ()` handled exactly as `packs` is (`known.update(robot["url"] for robot in robots if isinstance(robot.get("url"), str))`, and the lower-cased `repo` guard); load the document beside `packs_document` with default `{"version": "1.0", "verified_at": None, "robots": []}`; pass `robots_document["robots"]` at both call sites (`:828`, `:848`).

- [ ] **Step 5: Run the tests**

Run: `uv run python -m unittest tests.test_validation_policy tests.test_update_directory tests.test_promote_system_candidate tests.test_promote_model_candidate 2>&1 | tail -4`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/ tests/
git commit -m "Keep robot ids, repositories, and product pages unique across collections"
```

### Task 6: Link monitoring, review age, and the two-fetch command

**Files:**
- Modify: `scripts/check_evidence_links.py:154-179,311-343`, `scripts/report_review_age.py:22-29`
- Create: `scripts/check_page_stability.py`, `tests/test_page_stability.py`
- Test: `tests/test_evidence_links.py:80-217`, `tests/test_review_age.py:18-48,160-170`

**Interfaces:**
- Consumes: `check_evidence_links.LinkTarget`, `fetch_target(target, cached, *, token, ...) -> FetchResult`, `content_sha256(body: bytes, content_type: str) -> str`, `FetchFailure`.
- Produces: `_add_evidence_items(..., monitor_roles: frozenset[str] = frozenset())`; `check_page_stability.fetch_hash(url, *, fetch=...) -> str`; `check_page_stability.main(argv) -> int` (exit 0 stable, 1 unstable, 2 fetch failure).

- [ ] **Step 1: Write the failing tests**

In `tests/test_evidence_links.py`, in the first fixture's `documents` (`:84-177`) add:

```python
                "robots.json": {
                    "robots": [
                        {
                            "id": "bot",
                            "url": "https://robots.example/bot",
                            "verified_at": "2026-09-01",
                            "evidence": [
                                {
                                    "kind": "web",
                                    "role": "product_page",
                                    "url": "https://robots.example/bot",
                                    "verified_at": "2026-09-01",
                                },
                                {
                                    "kind": "web",
                                    "role": "named_model",
                                    "url": "https://robots.example/news/model",
                                    "verified_at": "2026-09-01",
                                },
                                {
                                    "kind": "web",
                                    "role": "model_interface",
                                    "unpinnable": True,
                                    "url": "https://robots.example/sdk",
                                    "verified_at": "2026-09-01",
                                },
                            ],
                            "terms_evidence": [
                                {
                                    "kind": "web_terms",
                                    "url": "https://robots.example/terms",
                                    "verified_at": "2026-09-01",
                                }
                            ],
                        }
                    ]
                },
```

Change `self.assertEqual(10, len(targets))` to `14` (four new distinct URLs; the product page and the record `url` deduplicate), and add:

```python
        self.assertEqual(
            ("robots:bot:evidence:0", "robots:bot:url"),
            tuple(sorted(by_url["https://robots.example/bot"].references)),
        )
        self.assertFalse(by_url["https://robots.example/bot"].monitor_terms)
        self.assertTrue(
            by_url["https://robots.example/news/model"].monitor_terms,
            "the named-model page is the collection's central fact and is watched for drift",
        )
        self.assertTrue(by_url["https://robots.example/terms"].monitor_terms)
        self.assertFalse(
            by_url["https://robots.example/sdk"].monitor_terms,
            "an unpinnable page is link-checked but its hash can never settle",
        )
```

In the second fixture (`:211-217`) add `"robots.json": {"robots": []},`.

In `tests/test_review_age.py`: add `robots: tuple[dict, ...] = (),` to `write_catalog`'s parameters and `"robots.json": {"robots": list(robots)},` to `files`, then:

```python
    def test_robots_are_reported_with_their_evidence_age(self) -> None:
        (row,) = self.rows(
            robots=(
                record("bot", "2026-09-10", evidence=[{"verified_at": "2026-08-01"}]),
            )
        )
        self.assertEqual("robots", row.collection)
        self.assertEqual(date(2026, 8, 1), row.oldest_evidence.on)
        self.assertIsNone(row.metadata)
```

Create `tests/test_page_stability.py`:

```python
"""The two-fetch rule: a page is citable only when its visible text hashes the same twice."""

import io
import unittest
from contextlib import redirect_stdout

from scripts import check_page_stability
from scripts.check_evidence_links import FetchFailure, FetchResult


def result(body: bytes) -> FetchResult:
    return FetchResult(
        status=200,
        final_url="https://robots.example/page",
        headers={"content-type": "text/html; charset=utf-8"},
        body=body,
    )


class PageStabilityTests(unittest.TestCase):
    def run_main(self, bodies):
        responses = iter(bodies)

        def fetch(url):
            value = next(responses)
            if isinstance(value, Exception):
                raise value
            return result(value)

        out = io.StringIO()
        with redirect_stdout(out):
            code = check_page_stability.main(
                ["https://robots.example/page", "--wait", "0"], fetch=fetch
            )
        return code, out.getvalue()

    def test_markup_noise_does_not_make_a_page_unstable(self) -> None:
        code, out = self.run_main(
            [
                b'<html><body><svg><linearGradient id="g-1842"/></svg><p>Spec sheet</p></body></html>',
                b'<html><body><svg><linearGradient id="g-9931"/></svg><p>Spec sheet</p></body></html>',
            ]
        )
        self.assertEqual(0, code)
        self.assertIn("stable", out)

    def test_changed_visible_text_is_unstable(self) -> None:
        code, out = self.run_main(
            [b"<html><body><p>Trace 1842</p></body></html>",
             b"<html><body><p>Trace 9931</p></body></html>"]
        )
        self.assertEqual(1, code)
        self.assertIn("UNSTABLE", out)

    def test_a_fetch_failure_is_not_a_stable_page(self) -> None:
        code, out = self.run_main([FetchFailure("HTTP 404")])
        self.assertEqual(2, code)
        self.assertIn("HTTP 404", out)
```

Check how other tests import from `scripts` (`from scripts import …` versus a `sys.path` insert) and match it.

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_evidence_links tests.test_review_age tests.test_page_stability 2>&1 | tail -8`
Expected: FAIL — `ModuleNotFoundError: check_page_stability`, target count 10 ≠ 13, `KeyError: 'robots'`.

- [ ] **Step 3: Implement**

`scripts/check_evidence_links.py` — give `_add_evidence_items` a keyword `monitor_roles: frozenset[str] = frozenset()` and change the terms line to:

```python
        is_terms = item.get("kind") == "web_terms"
        # An unpinnable page changes between fetches, so its hash can never settle:
        # it is still link-checked, never drift-monitored.
        is_monitored = (
            is_terms or item.get("role") in monitor_roles
        ) and not item.get("unpinnable")
```

passing `kind="terms" if is_terms else "evidence"` as before and `monitor_terms=is_monitored`. After the three-collection loop (`:311-343`) add a robots loop:

```python
    # Robots carry terms in place of licences, and their central fact is a vendor
    # page naming a model (ADR 037), so that page is watched for drift as terms are.
    for record in load_json(directory / "robots.json")["robots"]:
        record_id = record["id"]
        reviewed_at = record.get("verified_at")
        _add_target(
            targets,
            record.get("url"),
            kind="record",
            reference=f"robots:{record_id}:url",
            reviewed_at=reviewed_at,
        )
        _add_evidence_items(
            targets,
            record["evidence"],
            collection="robots",
            record_id=record_id,
            group="evidence",
            record_reviewed_at=reviewed_at,
            monitor_roles=frozenset({"named_model", "model_interface"}),
        )
        _add_evidence_items(
            targets,
            record["terms_evidence"],
            collection="robots",
            record_id=record_id,
            group="terms",
            record_reviewed_at=reviewed_at,
        )
```

`scripts/report_review_age.py`: append `("robots", "robots.json", "robots"),` as the **last** row of `COLLECTIONS` (the tuple's order is the report's sort tiebreak; appending keeps every existing row where it is).

`scripts/check_page_stability.py`:

```python
"""Apply the two-fetch rule from docs/ROBOTS.md to one page.

Fetch a URL twice and hash its visible text both times with the same
normalisation the evidence monitor uses. A page whose hashes differ cannot be
pinned, so it cannot be cited; find a stable first-party alternative instead.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_evidence_links import (  # noqa: E402
    FetchFailure,
    FetchResult,
    LinkTarget,
    content_sha256,
    fetch_target,
)


def _fetch(url: str) -> FetchResult:
    target = LinkTarget(
        url=url,
        kinds=("terms",),
        references=("page-stability",),
        review_dates=(),
        monitor_terms=True,
    )
    return fetch_target(target, {}, token=None)


def fetch_hash(url: str, *, fetch: Callable[[str], FetchResult] = _fetch) -> str:
    result = fetch(url)
    if result.body is None:
        raise FetchFailure("no body returned")
    return content_sha256(result.body, result.headers.get("content-type", ""))


def main(
    argv: list[str] | None = None,
    *,
    fetch: Callable[[str], FetchResult] = _fetch,
) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("url")
    parser.add_argument(
        "--wait", type=float, default=120.0, help="seconds between the two fetches"
    )
    args = parser.parse_args(argv)
    try:
        first = fetch_hash(args.url, fetch=fetch)
        time.sleep(args.wait)
        second = fetch_hash(args.url, fetch=fetch)
    except FetchFailure as failure:
        print(f"{args.url}: fetch failed: {failure}")
        return 2
    print(f"first  {first}\nsecond {second}")
    if first != second:
        print("UNSTABLE: the visible text changed between fetches; do not cite this page")
        return 1
    print("stable: citable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Match the import style of the other scripts (check how `promote_system_candidate.py` imports from `validate_directory`) and the header-key casing `fetch_target` returns (`_headers()` at `:623`); if keys are not lower-cased, read `Content-Type` accordingly.

- [ ] **Step 4: Run the tests**

Run: `uv run python -m unittest tests.test_evidence_links tests.test_review_age tests.test_page_stability 2>&1 | tail -4`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_evidence_links.py scripts/report_review_age.py scripts/check_page_stability.py tests/
git commit -m "Monitor robot terms and named-model pages, and add the two-fetch check"
```

### Task 7: Payloads, share pages, asset stamps, and marks

**Files:**
- Modify: `scripts/build_web_payload.py:20-28,126-140,200-209`, `scripts/build_share_pages.py:34-50,75-89,207-225`, `scripts/build_asset_version.mjs:18-31`, `scripts/build_logos.mjs:249-257`
- Test: `tests/test_web_payload.py:57-68,141-165`, `tests/test_share_pages.py:24-71,132-160`, `tests/test_web.js:684`

**Interfaces:**
- Consumes: record fields from Task 3.
- Produces: `web/app/robots.json` (`{"verified_at": …, "robots": [...]}`), `web/app/search/robots.json`, `web/app/detail/robot/<id>.json`; `share_page_path("robot", id) == "records/robots/<id>/index.html"`. Task 9's boot loader depends on `app/robots.json` existing even when the collection is empty — a missing boot payload blanks the whole site.

- [ ] **Step 1: Write the failing tests**

`tests/test_web_payload.py`: add `"robots",` to the tuple in `test_boot_carries_the_dates_the_page_prints`; add `("robots.json", "robots"),` to the tuple in `test_one_detail_file_per_record`; then add:

```python
    def test_robots_are_unscored_and_boot_carries_only_card_fields(self) -> None:
        boot = json.loads(self.payloads["app/robots.json"])
        self.assertIn("robots", boot)
        for entry in boot["robots"]:
            self.assertNotIn("score", entry)
            self.assertNotIn("hardware", entry, "hardware is detail-only prose")
            self.assertIn("form_factor", entry)

    def test_an_empty_robots_collection_still_ships_its_boot_payload(self) -> None:
        """app/robots.json sits in the blocking boot fetch; a missing file blanks the site."""
        catalog = {**self.catalog, "robots.json": {"verified_at": "2026-09-20", "robots": []}}
        payloads = build_payloads(catalog)
        self.assertEqual([], json.loads(payloads["app/robots.json"])["robots"])
        self.assertEqual({}, json.loads(payloads["app/search/robots.json"]))
```

Do **not** copy the packs test's `assertTrue(boot["packs"], …)` line: the robots collection ships empty in this PR. Check what an empty search index serialises to for another collection before asserting `{}`; if the builder wraps the index in an envelope, assert that shape instead.

`tests/test_share_pages.py`: add to `test_share_page_path_maps_each_collection_and_rejects_others`:

```python
        self.assertEqual("records/robots/bot/index.html", share_page_path("robot", "bot"))
```

add `"robots",` to the key tuples in `test_every_record_gets_a_page_plus_sitemap_and_robots` and `test_pages_escape_record_text_everywhere`, and add:

```python
    def test_robot_page_states_the_vendor_claim_and_carries_no_score(self) -> None:
        catalog = {
            key: []
            for key in (
                "projects", "specifications", "services", "runtimes", "models", "packs", "robots",
            )
        }
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["robots"] = [
            {
                "id": "bot",
                "name": "Bot <One>",
                "manufacturer": "Example Robotics",
                "url": "https://robots.example/bot",
                "description": "A humanoid.",
                "form_factor": "humanoid",
                "availability": "reservation",
                "status": "active",
                "ai_basis": ["vendor_named_model"],
                "named_models": [
                    {"name": "Sample-VLA", "kind": "vision_language_action",
                     "role_note": "Turns frames into motion.", "evidence_label": "News"}
                ],
                "not_verified": "The model is the maker's claim.",
                "verified_at": "2026-09-20",
            }
        ]
        page = build_pages(catalog)["records/robots/bot/index.html"]
        self.assertIn("Robot · Humanoid", page)
        self.assertIn("Bot &lt;One&gt;", page)
        self.assertIn("Sample-VLA", page)
        self.assertIn("vendor-stated", page)
        self.assertNotIn("score", page.lower())
```

`tests/test_web.js:684`: add `"robots"` to the collection list in the asset-stamp test.

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run python -m unittest tests.test_web_payload tests.test_share_pages 2>&1 | tail -8`
Expected: FAIL — `KeyError: 'app/robots.json'`, `ValueError: unknown record kind: robot`.

- [ ] **Step 3: Implement the payload builder**

`scripts/build_web_payload.py`: append to `COLLECTIONS`:

```python
    ("robots", "robots.json", "robots", "robot"),
```

Add to `BOOT_FIELDS` (what a card, a filter, and the mixed search read):

```python
    "robots": (
        "id",
        "name",
        "short_name",
        "manufacturer",
        "url",
        "description",
        "form_factor",
        "ai_basis",
        "availability",
        "status",
    ),
```

and to `SEARCH_FIELDS`:

```python
    "robots": (
        "id",
        "name",
        "short_name",
        "manufacturer",
        "description",
        "named_models",
        "variants",
    ),
```

Read how `SEARCH_FIELDS` values are flattened into the index text (`:324-332`). If the flattener only handles strings and lists of strings, `named_models` (a list of objects) needs the model names extracted; add, beside the existing flattening, a branch that for a list of dicts joins each dict's `name`. Add a test line asserting `"sample-vla"` appears in the index text for a robot fixture if you add that branch.

- [ ] **Step 4: Implement the share pages**

`scripts/build_share_pages.py`: add `"robot": ("robots", "robots"),` to `COLLECTIONS`, `"robot": "Robot",` to `COLLECTION_LABELS`, and `"robots": read("robots.json")["robots"],` to `load_catalog`. Insert **above** the unguarded local-runtime fall-through in `_facts_for` (`:225`):

```python
    if kind == "robot":
        eyebrow = (
            f"Robot · {taxonomy_name(taxonomy, 'robot_form_factors', record['form_factor'])}"
        )
        facts = [
            ("Maker", record["manufacturer"]),
            (
                "Availability",
                taxonomy_name(taxonomy, "robot_availability", record["availability"]),
            ),
            (
                "Models the vendor names",
                "; ".join(
                    f"{model['name']} (vendor-stated): {model['role_note']}"
                    for model in record["named_models"]
                )
                or "None named by the maker",
            ),
            (
                "Runs your own models",
                "Yes, by a route the maker documents"
                if "open_model_interface" in record["ai_basis"]
                else "Not documented by the maker",
            ),
            ("Status", humanize(record["status"])),
            ("Not verified", record["not_verified"]),
        ]
        return eyebrow, record["description"], facts, "Product", "Open official page"
```

Check that `"Product"` is an acceptable schema.org `about` type for the JSON-LD the page emits (the other branches use `SoftwareApplication` and `CreativeWork`); it is a valid type, and nothing validates the value against a list.

- [ ] **Step 5: Register the payloads with the asset stamp and the mark builder**

`scripts/build_asset_version.mjs` `DATA_FILES`: add `"app/robots.json",` after `"app/packs.json",` and `"app/search/robots.json",` after `"app/search/packs.json",`.

`scripts/build_logos.mjs` (`:249-257`): add `["web/robots.json", "robots"],` after the packs row. Do not add any `RECORD_MARKS` entry — there are no records yet, and a mark mapped before its record is published makes the builder throw.

- [ ] **Step 6: Regenerate and run**

```bash
export PATH=/usr/local/bin:$PATH
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
node scripts/build_asset_version.mjs
node scripts/build_logos.mjs --check
uv run python -m unittest tests.test_web_payload tests.test_share_pages 2>&1 | tail -4
```

Expected: `web/app/robots.json` and `web/app/search/robots.json` exist; no `web/app/detail/robot/` directory (no records); both modules `OK`. After `build_asset_version.mjs`, confirm with `git diff --no-ext-diff web/index.html | grep robots` that both new payload keys gained a version stamp — a fresh browser cannot reveal a missing one.

- [ ] **Step 7: Commit**

```bash
git add scripts/ tests/ web/
git commit -m "Project robots into boot, search, detail, and share pages"
```

### Task 8: Robot filtering in `web/app-core.js`

**Files:**
- Modify: `web/app-core.js:167-182` (add beside `PACK_VIEW`), `:221-238`, `:288`, `:310-318`, `:476-503` (exports, alphabetical)
- Test: `tests/test_web.js`

**Interfaces:**
- Consumes: `filterScoredCollection(records, filters, view)` — the generic engine; handles scalar and array facet fields.
- Produces: `AtlasCore.filterRobots(robots, filters) -> robot[]` with filters `{ term, searchIndex, formFactor, aiBasis, availability, status }`, always name-sorted; `filterDirectoryEntries(projects, services, runtimes, models, filters, packs, robots)` reading `filters.robotSearchIndex` and emitting `{ kind: "robot", record }`; `RECORD_KINDS` including `"robot"`; `shareRecordPath("robot", id) === "records/robots/<id>/"`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_web.js`, add `filterRobots` to the destructured import on line 6 (alphabetical, after `filterProjects`-style neighbours; keep the list sorted), then after the pack tests:

```js
const robots = [
  { id: "g-one", name: "G One", manufacturer: "Unibot", description: "A compact humanoid.", form_factor: "humanoid", ai_basis: ["vendor_named_model", "open_model_interface"], availability: "orderable", status: "active", evidence: [{ url: "https://hidden.example/spec" }] },
  { id: "rover", name: "Rover", manufacturer: "Dynamo", description: "A walking inspector.", form_factor: "quadruped", ai_basis: ["open_model_interface"], availability: "enterprise_sales", status: "active" },
  { id: "old-arm", name: "Atlas Arm", manufacturer: "Dynamo", description: "A bench arm.", form_factor: "arm", ai_basis: ["vendor_named_model"], availability: "research_only", status: "archived" },
];

test("robot filters combine form factor, availability, and status, sorted by name only", () => {
  assert.deepEqual(filterRobots(robots, {}).map(item => item.name), ["Atlas Arm", "G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { sort: "score" }).map(item => item.name), ["Atlas Arm", "G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { formFactor: "quadruped" }).map(item => item.name), ["Rover"]);
  assert.deepEqual(filterRobots(robots, { availability: "orderable" }).map(item => item.name), ["G One"]);
  assert.deepEqual(filterRobots(robots, { aiBasis: "open_model_interface" }).map(item => item.name), ["G One", "Rover"]);
  assert.deepEqual(filterRobots(robots, { status: "archived" }).map(item => item.name), ["Atlas Arm"]);
  assert.deepEqual(filterRobots(robots, { formFactor: "arm", status: "active" }), []);
});

test("robot search covers name and maker, reads the index for named models, and never evidence URLs", () => {
  assert.deepEqual(filterRobots(robots, { term: "dynamo" }).map(item => item.name), ["Atlas Arm", "Rover"]);
  assert.deepEqual(filterRobots(robots, { term: "hidden" }), []);
  assert.deepEqual(filterRobots(robots, { term: "sample-vla", searchIndex: { "g-one": "sample-vla" } }).map(item => item.name), ["G One"]);
});

test("mixed directory browsing includes robots and reads their own index key", () => {
  const entries = filterDirectoryEntries([], [], [], [], { term: "rover" }, [], robots);
  assert.deepEqual(entries.map(item => [item.kind, item.record.name]), [["robot", "Rover"]]);
  assert.deepEqual(
    filterDirectoryEntries([], [], [], [], { term: "onlyinindex", robotSearchIndex: { rover: "onlyinindex" } }, [], robots).map(item => item.record.name),
    ["Rover"],
  );
  assert.deepEqual(filterDirectoryEntries([], [], [], [], { term: "rover" }), []);
});
```

Add beside the existing `parseRecordReference("pack:…")` and `shareRecordPath("pack", …)` assertions (`:540`, `:552`):

```js
  assert.deepEqual(parseRecordReference("robot:g-one"), { kind: "robot", id: "g-one" });
  assert.equal(shareRecordPath("robot", "g-one"), "records/robots/g-one/");
```

and beside `cardBadges("pack", packs[0])` (`:879`): `assert.deepEqual(cardBadges("robot", robots[0]), []);`

- [ ] **Step 2: Run them to verify they fail**

Run: `export PATH=/usr/local/bin:$PATH; node --test tests/test_web.js 2>&1 | tail -12`
Expected: FAIL — `filterRobots is not a function`.

- [ ] **Step 3: Implement**

After `filterPacks` (`:180-182`):

```js
  // Robots are unscored (ADR 037): the shared collection filter supplies the
  // facets and search, and the sort is pinned to name so no caller can ask for
  // a score order that does not exist.
  const ROBOT_VIEW = {
    searchFields: ["id", "name", "short_name", "manufacturer", "description"],
    facets: {
      formFactor: "form_factor",
      aiBasis: "ai_basis",
      availability: "availability",
      status: "status",
    },
  };

  function filterRobots(robots, filters = {}) {
    return filterScoredCollection(robots, { ...filters, sort: "name" }, ROBOT_VIEW);
  }
```

In `filterDirectoryEntries`: add the parameter `robots = []` after `packs = []`, add the entry line

```js
      ...filterRobots(robots, { term, searchIndex: filters.robotSearchIndex }).map(record => ({ kind: "robot", record })),
```

after the packs line, and extend the comment above the function with "and filters.robotSearchIndex covers robots".

`RECORD_KINDS` (`:288`): append `"robot"`. `shareRecordPath` (`:316`): add ``if (kind === "robot") return `records/robots/${id}/`;`` Add `filterRobots,` to the export object in alphabetical position. Do **not** add a `robot` key to `CARD_BADGE_SETS`: `cardBadges` returns `[]` for an unknown key, which is the required "no badges".

- [ ] **Step 4: Run the tests**

Run: `node --test tests/test_web.js 2>&1 | tail -6`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Filter robots by form factor, availability, and status"
```

### Task 9: The Robots scope, card, and dialog

**Files:**
- Modify: `web/index.html` (`:6`, `:20`, `:92`, `:97`, `:101`, after `:173`, after `:307`, after `:359`), `web/app.js` (lines cited per step), `web/styles.css` (`:61`, `:137`, `:200`, after `:682`), `tests/e2e/helpers/catalog-counts.js:17-25,83`
- Create: `tests/e2e/robots.spec.js`

**Interfaces:**
- Consumes: `AtlasCore.filterRobots`, `filterDirectoryEntries(..., packs, robots)`, payload paths from Task 7, the generic `renderCollection(name)` and `COLLECTIONS` table in `web/app.js:762-947`.
- Produces: DOM ids `#robot-collection-count`, `#robots-directory-panel`, `#robot-search`, `#robot-form-factor-filter`, `#robot-ai-basis-filter`, `#robot-availability-filter`, `#robot-status-filter`, `#robot-result-count`, `#reset-robot-filters`, `#robot-grid`, `#robot-pager`, `#robot-dialog`, `#robot-dialog-content`; card class `.robot-card`; card button attribute `data-robot`; `?collection=robots`; `record=robot:<id>`.

- [ ] **Step 1: Write the failing browser tests**

Create `tests/e2e/robots.spec.js`. The published collection is empty in this PR, so the populated cases route fixture payloads over the real ones:

```js
const { test, expect } = require("@playwright/test");
const catalogCounts = require("./helpers/catalog-counts");

const ROBOTS = [
  { id: "g-one", name: "G One", manufacturer: "Unibot", url: "https://unibot.example/g-one", description: "A compact humanoid.", form_factor: "humanoid", ai_basis: ["vendor_named_model", "open_model_interface"], availability: "orderable", status: "active" },
  { id: "rover", name: "Rover", manufacturer: "Dynamo", url: "https://dynamo.example/rover", description: "A walking inspector.", form_factor: "quadruped", ai_basis: ["open_model_interface"], availability: "enterprise_sales", status: "active" },
];
const DETAIL = {
  first_party_domains: ["unibot.example"],
  availability_note: "Sold direct in two regions.",
  named_models: [{ name: "Uni-VLA", kind: "vision_language_action", role_note: "The maker says it turns camera frames and a request into whole-body motion.", evidence_label: "Model page" }],
  research_confidence: "medium",
  hardware: { compute: "Not published.", sensors: "Depth camera and lidar.", actuation: "Electric joints.", power: "Swappable battery." },
  developer_access: "A documented SDK for running your own policy.",
  terms: ["terms_of_sale"], terms_note: "Purchase terms only.",
  terms_evidence: [{ terms_kind: "terms_of_sale", scope: "Purchase terms", kind: "web_terms", url: "https://unibot.example/terms", verified_at: "2026-09-20" }],
  not_verified: "The model named here is the maker's own claim and is not verified by the Atlas.",
  evidence: [{ kind: "web", role: "named_model", label: "Model page", url: "https://unibot.example/uni-vla", verified_at: "2026-09-20" }],
  verified_at: "2026-09-20",
};

async function withRobots(page) {
  await page.route(/\/app\/robots\.json/, route => route.fulfill({ json: { verified_at: "2026-09-20", robots: ROBOTS } }));
  await page.route(/\/app\/search\/robots\.json/, route => route.fulfill({ json: {} }));
  await page.route(/\/app\/detail\/robot\/g-one\.json/, route => route.fulfill({ json: DETAIL }));
}

test("the robots entry stays out of the navigation while the collection is empty", async ({ page }) => {
  test.skip(catalogCounts.robots > 0, "the published collection has records");
  await page.goto("/");
  // toBeHidden also passes for an element that does not exist, so pin its presence first.
  await expect(page.locator('[data-directory-collection="robots"]')).toHaveCount(1);
  await expect(page.locator('[data-directory-collection="robots"]')).toBeHidden();
  await expect(page.locator("#all-collection-count")).toHaveText(String(catalogCounts.allDirectoryEntries));
});

test("the robots scope filters, opens its own dialog, and never scores or compares", async ({ page }) => {
  await withRobots(page);
  await page.goto("/?collection=robots");

  await expect(page.getByRole("button", { name: "Robots 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#robot-result-count")).toContainText("2 robots · Unscored");
  await expect(page.locator("#robot-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#robot-grid .compare-toggle")).toHaveCount(0);
  await expect(page.locator("#robot-sort-filter")).toHaveCount(0);
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One", "Rover"]);

  await page.locator("#robot-form-factor-filter").selectOption("quadruped");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["Rover"]);
  await page.locator("#reset-robot-filters").click();
  await page.locator("#robot-ai-basis-filter").selectOption("vendor_named_model");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);
  await page.locator("#reset-robot-filters").click();
  await page.locator("#robot-search").fill("unibot");
  await expect(page.locator("#robot-grid .project-card h2")).toHaveText(["G One"]);

  await page.locator('#robot-grid [data-robot="g-one"]').click();
  await expect(page.locator("#robot-dialog")).toBeVisible();
  await expect(page.locator("#robot-dialog-content .eyebrow")).toContainText("Unscored");
  await expect(page.locator("#robot-dialog-content")).toContainText("Models the vendor names");
  await expect(page.locator("#robot-dialog-content")).toContainText("vendor-stated");
  await expect(page.locator("#robot-dialog-content")).toContainText("Running your own models");
  await expect(page.locator("#robot-dialog-content")).toContainText("not verified by the Atlas");
  await expect(page).toHaveURL(/record=robot(%3A|:)g-one/);

  await page.reload();
  await expect(page.locator("#robot-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#robot-dialog")).toBeHidden();
});

test("mixed browsing surfaces robots without scores or comparison", async ({ page }) => {
  await withRobots(page);
  await page.goto("/");
  await page.locator("#all-directory-search").fill("rover");
  const card = page.locator('#all-directory-grid .robot-card:has([data-robot="rover"])');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".family-label")).toContainText("Robot · Quadruped");
  await expect(card.locator(".score-ring")).toHaveCount(0);
  await expect(card.locator(".compare-toggle")).toHaveCount(0);
});
```

Check how the other specs import the Playwright test object and the counts helper and match them exactly. In `tests/e2e/helpers/catalog-counts.js` add `const robots = read("robots.json").robots;` after the packs line, add `+ robots.length` to `allDirectoryEntries` (and "and robots" to its comment), and export `robots: robots.length,`.

- [ ] **Step 2: Run them to verify they fail**

Run: `export PATH=/usr/local/bin:$PATH; npx playwright test tests/e2e/robots.spec.js 2>&1 | tail -15`
Expected: all three FAIL — the first on `toHaveCount(1)` (no switcher entry yet), the others on the missing `#robot-result-count` and `.robot-card`.

- [ ] **Step 3: Add the markup**

`web/index.html`:

- `:6` and `:20` meta descriptions, `:97` placeholder, `:101` aria-label: add robots to each enumeration ("…local runtimes, agent packs, and robots").
- After `:92`, inside the switcher:

```html
        <button data-directory-collection="robots" aria-pressed="false" hidden><span>Robots</span><strong id="robot-collection-count"></strong></button>
```

  The static `hidden` means the entry never flashes before `renderStats()` decides.

- After the packs panel (`:173`):

```html
      <div id="robots-directory-panel" class="collection-panel" hidden>
        <section class="control-panel inference-controls" aria-label="Robot filters">
          <label class="search-field"><span>Search</span><input id="robot-search" type="search" placeholder="Search robots, makers, and named models" autocomplete="off"></label>
          <label><span>Form</span><select id="robot-form-factor-filter"><option value="">All forms</option></select></label>
          <label><span>AI</span><select id="robot-ai-basis-filter"><option value="">Any</option></select></label>
          <label><span>Availability</span><select id="robot-availability-filter"><option value="">Any availability</option></select></label>
          <label><span>Status</span><select id="robot-status-filter"><option value="">Any status</option></select></label>
          <p class="filter-guidance">Robots are listed for what their makers document: the models they name or the way they let you run your own, the hardware, how to get one, and the terms. The Atlas does not test robots, so nothing here is scored or compared. <button data-open-tab="taxonomy">How robots are classified →</button></p>
        </section>
        <div class="result-row"><p id="robot-result-count" aria-live="polite"></p><button id="reset-robot-filters" class="ghost-button">Clear filters</button></div>
        <section id="robot-grid" class="project-grid inference-grid" aria-label="Reviewed robots"></section>
        <nav id="robot-pager" class="pager" aria-label="Robots pagination"></nav>
      </div>
```

- After the packs endpoint card (`:307`):

```html
        <article class="endpoint">
          <h2><a class="endpoint-link" href="https://peacefulcoexistance.com/robots.json">robots.json</a></h2>
          <p>AI robots recorded for what their makers document — the learned models they name, hardware, developer access, availability, and terms. The named model is the maker's claim, never verified or scored.</p>
          <p class="endpoint-shape"><code>robots[]</code> · <code>verified_at</code> · <code>version</code></p>
        </article>
```

- After `#pack-dialog` (`:359`):

```html
  <dialog id="robot-dialog">
    <button class="dialog-close" aria-label="Close">×</button>
    <div id="robot-dialog-content"></div>
  </dialog>
```

`web/styles.css`: add a `--card-robot` token beside each of the three `--card-pack` declarations (`:61`, `:137`, `:200`), choosing a tint distinct from the five existing card tokens in both palettes, and after `:682`:

```css
.robot-card { min-height: 380px; background: var(--card-robot); }
.robot-card::before { background: var(--violet); }
```

Use an accent variable that already exists in the file (list them with `grep -n "^  --" web/styles.css | head -40`); do not invent a colour name that is not defined.

- [ ] **Step 4: Wire the state, boot, counts, and scope switch in `web/app.js`**

- State (`:18`, `:25`): add `robots: []` and `robots: 1` to `page`.
- Boot (`:168-186`): add `loadJSON("app/robots.json")` as the last `Promise.all` entry, destructure it as `robots`, set `state.robots = robots.robots;`, and add `robots.verified_at` to the `dataDate` array.
- `COLLECTION_FILTERS` (`:424-432`), a new entry:

```js
  robots: {
    records: () => state.robots,
    groups: [
      ["robot_form_factors", "#robot-form-factor-filter", item => [item.form_factor]],
      ["robot_ai_bases", "#robot-ai-basis-filter", item => item.ai_basis],
      ["robot_availability", "#robot-availability-filter", item => [item.availability]],
      ["project_statuses", "#robot-status-filter", item => [item.status]],
    ],
  },
```

  Read `populateCollectionFilters` (`:435-450`) first: if it dereferences `licenseFilter` unconditionally, guard it with `if (config.licenseFilter)`.

- `renderStats()` (`:493-511`): add `+ state.robots.length` to `total`, change the kicker to `…services, runtimes, packs, and robots`, and after the pack count:

```js
  // An empty collection has no navigation entry: the scope exists before its
  // first record is reviewed, and a reader should not be sent to an empty page.
  $("#robot-collection-count").textContent = state.robots.length;
  $("#robot-collection-count").parentElement.hidden = state.robots.length === 0;
```

- `setDirectoryCollection()` (`:534-562`): add `"robots"` to the whitelist at `:535`; add `$("#robots-directory-panel").hidden = selected !== "robots";`; add `robots: () => renderCollection("robots")` to `renderers`; add `["robots", "#robot-grid"]` to the grid-clearing list. Leave `robots` **out** of the `compatible` expression — that omission is what clears a comparison on entry.
- `PAGE_CONTAINERS` (`:564-572`): `robots: "#robot-pager"`. `pageRenderer` (`:574-580`): map `robots` to `() => renderCollection("robots")`.
- `renderSearchSurfaces()` (`:990-1002`): add `robots: () => renderCollection("robots")`.

- [ ] **Step 5: Add the card, the collection entry, and the mixed view**

After `packCard` (`:642`):

```js
function robotCard(robot, { mixed = false } = {}) {
  const formLabel = taxonomyName("robot_form_factors", robot.form_factor);
  return `<article class="project-card robot-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(robot)}<div><p class="family-label">${mixed ? "Robot · " : ""}${escapeHTML(formLabel)}</p><h2>${escapeHTML(robot.name)}</h2><div class="repo">${escapeHTML(robot.manufacturer)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(taxonomyName("robot_availability", robot.availability))}</span>
    <p>${escapeHTML(robot.description)}</p>
    <div class="card-footer"><span>${robot.status === "active" ? "Unscored" : escapeHTML(label(robot.status))}</span><button data-robot="${escapeHTML(robot.id)}">View details →</button></div>
  </article>`;
}
```

In the `COLLECTIONS` table (`:762-924`), a new entry — the generic, pre-ADR-035 shape, not the bespoke `renderPacks`:

```js
  robots: {
    grid: "#robot-grid",
    resultCount: "#robot-result-count",
    pageKey: "robots",
    dataset: "robot",
    noun: ["robot", "robots"],
    empty: "No robots match these filters.",
    open: id => openRobot(id),
    context: () => ({ suffix: " · Unscored", comparable: false }),
    records: () => AtlasCore.filterRobots(state.robots, {
      term: $("#robot-search").value,
      searchIndex: searchIndexes.robots,
      formFactor: $("#robot-form-factor-filter").value,
      aiBasis: $("#robot-ai-basis-filter").value,
      availability: $("#robot-availability-filter").value,
      status: $("#robot-status-filter").value,
    }),
    card: robot => robotCard(robot),
  },
```

`renderCollection` does not call `paintMarks(grid)`; check whether the other generic collections' cards get their marks (they do, through `cardMark` and the document-wide sweep). If robot cards render without marks in the browser check, add `paintMarks(grid)` to `renderCollection` for every collection rather than special-casing robots.

`renderAllDirectoryEntries()` (`:682-736`): pass `robotSearchIndex: searchIndexes.robots` in the filters object and `state.robots` as the seventh argument; add `if (kind === "robot") return robotCard(record, { mixed: true });`; extend the empty notice to "…local runtimes, agent packs, or robots match this search."; bind `$$('[data-robot]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openRobot(button.dataset.robot)));`.

- [ ] **Step 6: Add the dialog and its URL plumbing**

After `packDialogMarkup` (`:1388`):

```js
function robotTermsLink(item) {
  return `<p><strong>${escapeHTML(taxonomyName("robot_terms_kinds", item.terms_kind))}:</strong> ${escapeHTML(item.scope)} · <a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">reviewed source ↗</a></p>`;
}

function robotDialogMarkup(robot) {
  const relatedSystems = (robot.related_systems || []).map(id => state.projects.find(item => item.id === id)).filter(Boolean);
  const relatedRobots = (robot.related_robots || []).map(id => state.robots.find(item => item.id === id)).filter(Boolean);
  const hardware = robot.hardware || {};
  return `<p class="eyebrow">Robot · ${escapeHTML(taxonomyName("robot_form_factors", robot.form_factor))} · Unscored</p><h1>${escapeHTML(robot.name)}</h1><p>${escapeHTML(robot.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>What it is</h3><p><strong>Maker:</strong> ${escapeHTML(robot.manufacturer)}</p><p><strong>Status:</strong> ${escapeHTML(label(robot.status))}</p>${robot.variants ? `<p><strong>Variants:</strong> ${escapeHTML(robot.variants)}</p>` : ""}<p><a href="${escapeHTML(robot.url)}" target="_blank" rel="noreferrer">Open official page ↗</a></p>${robot.repo ? `<p><a href="https://github.com/${escapeHTML(robot.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p>` : ""}</section>
      <section class="detail-block"><h3>Models the vendor names</h3>${(robot.named_models || []).map(model => `<p><strong>${escapeHTML(model.name)}</strong> · ${escapeHTML(taxonomyName("robot_model_kinds", model.kind))} · <em>vendor-stated</em></p><p>${detailText(model.role_note)}</p>`).join("") || "<p>The maker names no model for this robot.</p>"}<p class="unscored-note">${escapeHTML(robot.not_verified || "")}</p></section>
      ${(robot.ai_basis || []).includes("open_model_interface") ? `<section class="detail-block"><h3>Running your own models</h3><p>${detailText(robot.developer_access || "")}</p></section>` : ""}
      <section class="detail-block"><h3>Hardware</h3><p><strong>Compute:</strong> ${detailText(hardware.compute || "—")}</p><p><strong>Sensors:</strong> ${detailText(hardware.sensors || "—")}</p><p><strong>Actuation:</strong> ${detailText(hardware.actuation || "—")}</p><p><strong>Power:</strong> ${detailText(hardware.power || "—")}</p></section>
      ${(robot.ai_basis || []).includes("open_model_interface") ? "" : `<section class="detail-block"><h3>Developer access</h3><p>${detailText(robot.developer_access || "—")}</p></section>`}
      <section class="detail-block"><h3>Availability</h3><p><strong>${escapeHTML(taxonomyName("robot_availability", robot.availability))}</strong></p><p>${detailText(robot.availability_note || "")}</p></section>
      <section class="detail-block"><h3>Terms</h3><p>${detailText(robot.terms_note || "")}</p>${(robot.terms_evidence || []).map(robotTermsLink).join("") || "<p>No terms were published on the maker's pages at review time.</p>"}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(robot.evidence || []).map(specificationEvidenceLink).join("") || "<p>—</p>"}<p>Reviewed ${escapeHTML(robot.verified_at || "")}.</p></section>
      <section class="detail-block"><h3>Related records</h3>${relatedSystems.length || relatedRobots.length ? `<p>${[...relatedSystems.map(item => `<button type="button" class="ghost-button" data-open-project="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`), ...relatedRobots.map(item => `<button type="button" class="ghost-button" data-open-robot="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`)].join(" ")}</p>` : "<p>None recorded.</p>"}</section>
    </div>`;
}
```

An evidence entry marked `unpinnable` must say so to the reader: wrap the sources list so each such entry is followed by `<p class="unscored-note">This page changes between visits, so the Atlas cannot pin what it said.</p>` (map over `robot.evidence`, call `specificationEvidenceLink(item)`, and append the note when `item.unpinnable`).

Look at how `openRecordDialog` merges the boot record with the lazily loaded detail (`:1530-1545`) — if the markup function first renders from the boot record alone, every detail field above must tolerate being `undefined`, which the `|| …` guards already do.

`RECORD_DIALOGS` (`:1642-1652`), a new entry:

```js
  robot: {
    dialog: "#robot-dialog",
    content: "#robot-dialog-content",
    find: id => state.robots.find(item => item.id === id),
    markup: robotDialogMarkup,
    afterRender: () => {
      $$('[data-open-robot]', $("#robot-dialog-content")).forEach(button => button.addEventListener("click", () => openRobot(button.dataset.openRobot)));
      $$('[data-open-project]', $("#robot-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#robot-dialog").close(); openProject(button.dataset.openProject); }));
    },
  },
```

After `openPack` (`:1695`): `function openRobot(id) { return openRecordDialog("robot", id); }`. Add `"#robot-dialog"` to `RECORD_DIALOG_SELECTORS` (`:1726-1728`) and `if (kind === "robot") return openRobot(id);` to `openRecord` (`:1731-1739`). Find where a restored `record` URL switches the directory scope for a `pack` and add the same for `robot` → `"robots"`.

- [ ] **Step 7: Bind events and the taxonomy view**

- `SEARCH_SCOPES` (`:2055-2060`): add `"#robot-search": ["robots"],` and append `"robots"` to the `#all-directory-search` list.
- Filter inputs, beside the packs line (`:2103`):

```js
  ["#robot-search", "#robot-form-factor-filter", "#robot-ai-basis-filter", "#robot-availability-filter", "#robot-status-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.robots = 1; renderCollection("robots"); }));
```

- Reset, beside the packs reset (`:2144-2152`):

```js
  $("#reset-robot-filters").addEventListener("click", () => {
    $("#robot-search").value = "";
    $("#robot-form-factor-filter").value = "";
    $("#robot-ai-basis-filter").value = "";
    $("#robot-availability-filter").value = "";
    $("#robot-status-filter").value = "";
    state.page.robots = 1;
    renderCollection("robots");
  });
```

- Dialog close, beside `:2215-2216`:

```js
  $("#robot-dialog .dialog-close").addEventListener("click", () => $("#robot-dialog").close());
  $("#robot-dialog").addEventListener("click", event => { if (event.target === $("#robot-dialog")) $("#robot-dialog").close(); });
```

- `renderTaxonomy()` (`:1304-1305`), after the pack groups:

```js
    ["Robot forms", state.taxonomy.robot_form_factors], ["How a robot uses AI", state.taxonomy.robot_ai_bases], ["Robot availability", state.taxonomy.robot_availability],
    ["Kinds of model a robot maker names", state.taxonomy.robot_model_kinds], ["Robot terms", state.taxonomy.robot_terms_kinds],
```

- [ ] **Step 8: Re-stamp and run the browser tests**

```bash
export PATH=/usr/local/bin:$PATH
node scripts/build_asset_version.mjs
node --test tests/test_web.js 2>&1 | tail -4
npx playwright test tests/e2e/robots.spec.js tests/e2e/directory-search.spec.js 2>&1 | tail -12
```

Expected: all pass. Confirm `app.js`, `app-core.js`, and `styles.css` each got a new `?v=` in `web/index.html`.

- [ ] **Step 9: Commit**

```bash
git add web/ tests/
git commit -m "Add the Robots scope, card, and record dialog"
```

### Task 10: Documents, agent surface, ADR acceptance, and full verification

**Files:**
- Modify: `AGENTS.md` (rule 7), `README.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/CURATION.md:21`, `docs/DATA_MODEL.md` (after `:175`), `docs/OPERATIONS.md`, `docs/TAXONOMY.md:16-18`, `docs/WEB.md` (`:15`, `:20`, `:37`, `:73-74`, `:79`, `:84`, `:89`, `:95-113`, `:139`, `:146`, `:196`), `docs/COVERAGE.md`, `docs/adr/037-*.md` (status), `skills/ai-systems-atlas/SKILL.md:18`, `skills/ai-systems-atlas/reference.md:11,29-33`, `web/llms.txt:3,20`
- Test: `tests/test_directory.py`, `tests/test_documentation.py`

**Interfaces:**
- Consumes: everything above.
- Produces: a mergeable PR 2.

- [ ] **Step 1: Write the failing test**

In `tests/test_directory.py`, load `robots.json` in `setUpClass` beside `cls.packs`, and add:

```python
    def test_robots_are_a_separate_unscored_collection(self) -> None:
        for record in self.robots["robots"]:
            for field in (
                "system_family", "primary_role", "score_profile", "score",
                "stars", "stars_verified_at", "price", "price_usd", "benchmarks",
            ):
                self.assertNotIn(field, record, record["id"])
            self.assertEqual(
                "vendor_named_model" in record["ai_basis"],
                bool(record["named_models"]),
                record["id"],
            )
            self.assertTrue(record["not_verified"].strip(), record["id"])
        for group in (
            "robot_form_factors", "robot_ai_bases", "robot_availability",
            "robot_model_kinds", "robot_terms_kinds",
        ):
            self.assertTrue(self.taxonomy[group], group)

    def test_agent_documents_name_the_robots_endpoint(self) -> None:
        for relative in (
            "web/llms.txt",
            "skills/ai-systems-atlas/SKILL.md",
            "skills/ai-systems-atlas/reference.md",
            "docs/DATA_MODEL.md",
        ):
            self.assertIn(
                "robots.json", (ROOT / relative).read_text(encoding="utf-8"), relative
            )
```

Run: `uv run python -m unittest tests.test_directory -k robots 2>&1 | tail -6` — expected FAIL on the second test.

- [ ] **Step 2: Update the agent surface (one commit with the published file, per the one-commit rule)**

- `web/llms.txt:3`: add "and unscored AI robots recorded for what their makers document" to the lead sentence; after `:20`: `- [robots.json](https://peacefulcoexistance.com/robots.json): unscored AI robots, recorded for the learned models their makers name, hardware, developer access, availability, and terms; the named model is the maker's claim`
- `skills/ai-systems-atlas/SKILL.md`, a table row after the packs row: `| AI robots — humanoids, quadrupeds, arms, mobile manipulators — whose makers name a learned model (unscored; the named model is the maker's claim) | \`robots.json\` |`
- `skills/ai-systems-atlas/reference.md`: envelope line ``- `robots.json`: `{version, verified_at, robots: [...]}` ``, and a `## robots.json record fields` section after the packs one listing every field from Task 3's constants, stating: never scored, never priced; `named_models` is what the maker's documentation names and is not verified; `hardware` is four prose fields; `terms` uses `robot_terms_kinds`; every URL falls under `first_party_domains`. Link `docs/ROBOTS.md`.

- [ ] **Step 3: Update the project documents**

- `AGENTS.md` rule 7: "Specifications, agent packs, and robots are unscored".
- `docs/CURATION.md:21`: exclusions are also for robots that fail the Robots boundary in `ROBOTS.md`; add to the uniqueness sentence that a repository appears in at most one of `projects.json`, `packs.json`, `robots.json`, and `exclusions.json`.
- `docs/DATA_MODEL.md`: a Robots section after packs — envelope, every field with one line each, the evidence `role` values, the `terms_evidence` item shape, relationships.
- `docs/TAXONOMY.md`: the five robot groups and one sentence that a robot never receives a family or role.
- `docs/OPERATIONS.md`: the link checker monitors robot terms and named-model pages for drift and a drifted named-model page is resolved as terms drift is; `check_page_stability.py` usage; `robots.json` in the refresh staging list.
- `docs/WEB.md`: switcher list (`:15`); a Robots scope line after `:21`; `:37` — say plainly that specifications, models, agent packs, and robots get no badges (this also closes the existing gap where packs are not named); filters and details after `:74`; `:79` and `:84` enumerations (`robot:id`); `:89` "eight payloads" with `app/robots.json` — and correct the sentence's claim: the eight boot payloads are fetched together and a missing one stops the page, while the lazy payloads degrade; the change-surface table; the measurement one-liner at `:139` plus a re-measured figure at `:146`; and a new matrix row:

```markdown
32. with at least one robot published, switch to Robots, reload the scoped URL, combine form, AI basis, availability, and status, open a robot detail and confirm "Models the vendor names", the vendor-stated label, the not-verified sentence, hardware, terms, and sources; confirm no score, sort, badge, or Compare control; search the mixed Directory for a robot; follow a related system into its dialog and confirm the URL names the system; reload a `record=robot:` URL. With none published, confirm the Robots entry is absent from the switcher and the All total is unchanged.
```

- `README.md`, `ROADMAP.md`: add Robots to the collection lists in the same one-sentence style as packs.
- `docs/adr/037-*.md`: `**Status:** Accepted`.
- `docs/COVERAGE.md`: a numbered batch note — the collection exists, empty; the four candidates now wait under `robots collection review`. Change those four `triage.held_by` values in `directory/candidates.json` from `robots collection decision` to `robots collection review`. Leave ADR 036's table as it is — it is a dated record — and say in the batch note that the label moved.
- `BACKLOG.md`: replace the Robots-collection item with two: review the four held robots under `docs/ROBOTS.md`; teach the triage routine and `update_directory.py` to route robot candidates (spec §9).

- [ ] **Step 4: Regenerate and run every check**

```bash
export PATH=/usr/local/bin:$PATH
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
node scripts/build_asset_version.mjs
pre-commit run --all-files 2>&1 | grep -v "Passed\|Skipped"
```

Expected: no output from the last command (every hook passed, browser suite included).

- [ ] **Step 5: Exercise the browser matrix**

Start `uv run python -m http.server 8765 --bind 127.0.0.1 --directory web` through the preview tool and walk the full matrix in `docs/WEB.md`, not only row 32: every collection filter, score scopes, comparison, URL and history restoration, Finder, Taxonomy (the four robot groups render in both palettes), and a record dialog from every collection. For the populated Robots rows, the Playwright fixtures in Task 9 are the evidence; say so in the PR rather than claiming a manual pass that could not happen on an empty collection.

- [ ] **Step 6: Commit, push, open PR 2**

```bash
git add -A
git commit -m "Document the Robots collection and accept ADR 037"
git fetch origin main && git merge --no-edit origin/main
```

If the merge conflicts only in generated files, do not hand-resolve them: take either side, re-run all four generators, and commit. Then push (background; the hook is slow), open the PR listing every check actually run, and merge `main` again if it reports BEHIND. After merge, find the deploy run by merge SHA and `curl -s https://peacefulcoexistance.com/robots.json` to confirm the empty collection is live and `curl -s https://peacefulcoexistance.com/ | grep -c 'data-directory-collection="robots"'` returns `1`.

---

# PR 3 — First records

Branch: `claude/robots-first-records`, cut from `main` after PR 2 is merged and live.

### Task 11: Review Spot, Unitree G1, Figure, and 1X NEO

> **Before dispatching (from the PR 2 final review):** (a) the candidate↔robot overlap check compares repositories only and all four held robots have `repo: null`, so removing each published robot's candidate in the same change is a manual step the reviewer must show in the PR; (b) the `unpinnable` veto in `check_evidence_links.py` is per URL across every collection — before citing a page as unpinnable, grep the other collections' evidence and terms for the same URL, because the citation would silently stop drift monitoring there; (c) decide whether a robot may cite `git_blob` evidence from a vendor SDK repository: today `validate_evidence_items` ties blobs to the robot's own `repo`, and repository uniqueness forbids a robot sharing a repo with a system or pack — Unitree's SDK organisation is the live case, so cite SDK licences as `web_terms` on the blob URL under `github.com/<org>` in `first_party_domains`, and set `repo` only when the robot itself owns a repository no other collection records. (d) Owner decision 2026-09-24: robots will carry one identifying type badge on `form_factor` (the #293 contract), added with the badge session's robot-badge follow-up after this task, when ADR 037's badge sentence is amended; do not add it here.

This task is curation, not code. Its steps are a procedure; its outcomes are not known in advance, and any of the four may stay held. `AGENTS.md` rule 8 applies: every classification, sentence, and confidence level is the reviewer's.

**Files:**
- Modify: `directory/robots.json`, `directory/candidates.json`, `scripts/build_logos.mjs` (`RECORD_MARKS`, only for a data-backed mark), `docs/COVERAGE.md`, `BACKLOG.md`, `tests/e2e/robots.spec.js`, all generated output

- [ ] **Step 1: Gather leads with research subagents, one per robot, in parallel**

Give each the candidate's `triage` block from `directory/candidates.json`, `docs/ROBOTS.md`, and this brief: find, on the maker's own domains only, (a) the product page, (b) a spec sheet or technical documentation, (c) a page where the maker names a learned model or policy and says what it does, (d) availability, (e) terms of sale, SDK licence, software terms, or warranty, (f) any SDK or documentation repository under the maker's GitHub organisation. Return URLs with the exact sentence relied on, quoted. Say "not found" rather than explaining an absence — an agent asked why it found nothing will invent a mechanism it never measured.

- [ ] **Step 2: Re-fetch everything yourself**

For every URL a subagent returned: fetch it, find the quoted sentence, and discard the lead if either fails (a 404 is the cheapest tell of a fabricated citation). Then run the two-fetch rule on each page you intend to cite:

```bash
uv run python scripts/check_page_stability.py "<url>"
```

Record both hashes for the PR description. Expected for a citable page: `stable: citable`. `figure.ai` is the known risk: batch 39 could not pin it under the candidate hasher. If it is unstable here too, look for a stable first-party alternative for that role; if none exists, cite the page with `"unpinnable": true` and say so in the batch note. An unpinnable page does not hold Figure.

- [ ] **Step 3: Decide each robot against the six conditions**

Write down, per robot, which condition fails first, if one does. Expected hard cases: **Spot** and condition 3 — batch 39's evidence shows classical autonomy in the SDK documentation, so its likely basis is `open_model_interface` alone: check whether Boston Dynamics' own documentation describes a supported way to run the reader's own model or policy (the Spot SDK and its documented control services are the place to look), and add `vendor_named_model` only if that documentation also names a learned policy; a press article or a conference talk is not first-party documentation. **1X NEO** and condition 6 — a 404 terms page is `none_published`, not a failure. **Unitree G1** — a warranty page is `warranty_only`; check the `unitreerobotics` GitHub organisation for an SDK licence and cite it as `sdk_license` with the pinned blob under `supporting`.

- [ ] **Step 4: Write each passing record**

Follow `docs/ROBOTS.md`. `hardware` fields are prose taken from the spec sheet; no price anywhere, including `availability_note`. Set `research_confidence` by the guide's definitions. Remove the robot's entry from `directory/candidates.json` in the same change (the validator cannot catch a repo-less robot that is both queued and published). For a robot that stays held, *edit* its `triage` block to record the condition it failed and the evidence — do not delete it.

- [ ] **Step 5: Marks**

Add a `RECORD_MARKS` entry only where Simple Icons or lobe-icons carries the maker's mark (`node scripts/build_logos.mjs` prints candidate hints). Otherwise leave the monogram. Run `node scripts/build_logos.mjs` and commit `web/logos.json` if it changed.

- [ ] **Step 6: Add a browser test against a real record**

In `tests/e2e/robots.spec.js`, add a test that, without routing fixtures, opens `/?collection=robots`, expects the switcher button `Robots ${catalogCounts.robots}` to be visible, opens the first published record by its real id, and asserts "Models the vendor names" and the `record=robot:` URL. The empty-collection test self-skips once `catalogCounts.robots > 0`.

- [ ] **Step 7: Regenerate, verify, document**

Run the regeneration sequence and `pre-commit run --all-files`. Walk matrix row 32 in a browser against the real records. Add a `docs/COVERAGE.md` batch note stating, per robot, published or held and on which condition, plus the two-fetch result for every cited page; update the queue counts in its snapshot paragraph; groom `BACKLOG.md`.

- [ ] **Step 8: PR, merge, and check the live site**

Open PR 3 with each robot's outcome, the hashes, and the checks run. Merge `main` immediately before opening. After merge, identify the deploy by merge SHA, then:

```bash
curl -s https://peacefulcoexistance.com/robots.json | python3 -c "import json,sys; print([r['id'] for r in json.load(sys.stdin)['robots']])"
curl -sI https://peacefulcoexistance.com/records/robots/<id>/ | head -1
```

Expected: the published ids, and `200` for each share page. A green badge is not evidence; these two commands are.
