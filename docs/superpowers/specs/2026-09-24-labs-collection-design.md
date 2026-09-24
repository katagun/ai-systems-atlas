# Design: an unscored Labs collection

**Date:** 2026-09-24
**Status:** Approved design, implemented with ADR 041

## Problem

The Atlas records the artifacts an AI lab ships — 303 reviewed model releases, their managed APIs, the assistants and agents built on them, the runtimes and specifications some labs maintain — but not the lab. Every collection names the organization behind a record in its own free-text field, and the strings disagree:

- models say `developer`: `Google` for 35 releases and `Google DeepMind` for one; `Alibaba` for 24 and `Qwen` for two; `Cohere` for nine and `Cohere Labs` for five; `xAI` for six and `SpaceXAI (xAI)` for two;
- inference services say `operator`: `Google` for the Gemini API, `Google Cloud` for Vertex AI, and for Zhipu both `Jingsheng Hengxing Technology Pte. Ltd. (Z.ai)` and `北京智谱华章科技股份有限公司 (Beijing Zhipu Huazhang Technology)`;
- local runtimes say `maintainer`, specifications `stewards`, packs `steward`;
- systems name no organization at all, and every flagship lab assistant — ChatGPT, Claude, Gemini Apps, Grok, Meta AI, Mistral Vibe, DeepSeek, Z.ai — has `repo: null`, so not even a GitHub owner links it to its maker.

So the catalog cannot answer a question its readers bring to it: **who develops the models in this catalog, where are they based, how do they distribute their releases, what else of theirs does the Atlas record, and where do they publish?** ADR 025 rightly refused to record a developer *instead of* a release; nothing yet records the developer *beside* its releases.

## Decisions

### 1. A new collection: Labs, recorded in ADR 041

Publish `directory/labs.json` as an independent canonical collection in the ADR 008 shape: **no** `system_family`, `primary_role`, score profile, score, rank, stars, or licence. Envelope `{"version": "1.0", "verified_at": ..., "labs": [...]}`. Record kind `lab`; ids carry a `lab-` prefix (`lab-openai`) because several organizations share a name with a record in another collection (`deepseek`, `z-ai`, `perplexity` are systems) and ids are unique across collections.

**Unit of curation:** one organization — a company or a public research institution — that develops model releases the Atlas has reviewed, recorded at the level at which the catalog's own records name it. Google is one record whose names include `Google`, `Google DeepMind`, and `Google Cloud`; Alibaba is one record whose names include `Alibaba`, `Qwen`, and `Alibaba Cloud`.

### 2. Inclusion gate

An organization is recorded when **the catalog has reviewed at least one release it developed**: one of its `catalog_names` equals the `developer` of a record in `models.json`. The gate is enforced by validation. Size, funding, "frontier" status, popularity, openness, nationality, and licence never decide inclusion. The gate bounds the collection by the Models collection's own boundary (text-output releases under ADR 025, ADR 038 for releases models.dev does not list): an organization with no reviewed release — a service operator such as Groq, a lab whose only releases are image generators, or a company with nothing released — is not recorded until one of its releases is.

### 3. Record schema

Required unless marked optional; the validator rejects extra fields and names the scoring and licensing fields explicitly.

- **Identity:** `id` (`lab-` prefix), `name`, `url` (the organization's official site), `description` (one sentence: what the organization is and what it develops).
- **Organization:** `lab_type` (taxonomy `lab_types`), `headquarters` (taxonomy `countries`), optional `parent_organization` (only when first-party evidence names one), and `organization_note` — reviewed prose saying how the organization's catalog names relate: which unit develops the models, which operates the services, and what the parent is. This is the field that makes each record its own review rather than boilerplate.
- **Catalog links:** `catalog_names` — the exact strings other collections use for this organization; `systems` — ids of `projects.json` records the organization builds, because a system record carries no organization field.
- **Where it publishes:** `channels`, a non-empty list of `{kind, url}` with `kind` from taxonomy `lab_channel_kinds` (`model_catalog`, `release_notes`, `news`, `github`, `hugging_face`). These are the pages a reader watches to track the lab.
- **Safety framework (optional):** `safety_framework` `{title, url, verified_at}` when the organization publishes a frontier-safety, responsible-scaling, preparedness, or risk-management framework on its own pages. Absence is never a finding that none exists; the page says so.
- **Review:** `evidence` (dated first-party web sources, the inference-service shape) and human-owned `verified_at`.

Forbidden with an explicit message: `score`, `score_profile`, `stars`, `stars_verified_at`, `system_family`, `primary_role`, `licenses`, `source_model`.

New taxonomy groups: `lab_types` (`ai_company`, `technology_company`, `public_research`), `lab_channel_kinds`, and `countries` (ISO 3166-1 alpha-2, lower-cased, only values a record uses).

### 4. Relations are derived, never stored twice

A lab record stores names and system ids; everything else is joined from the other collections, one rule per collection:

| Collection | Joined when |
|---|---|
| Reviewed models | `developer` is one of `catalog_names` |
| models.dev source rows | the row's namespace (`source_id` before the `/`) is the namespace of one of the lab's reviewed releases |
| Inference services | `operator` is one of `catalog_names` |
| Local runtimes | `maintainer` is one of `catalog_names` |
| Specifications | any of `stewards` is one of `catalog_names` |
| Agent packs | `steward` is one of `catalog_names` |
| Systems | the id is listed in `systems` |

Nothing is duplicated, so promoting a new release, adding a service, or renaming an operator string changes the lab page with no edit to `labs.json` — and a rename that orphans a catalog name fails validation instead of silently dropping a link. The joins live once in Python (`scripts/lab_relations.py`, shared by the validator and the share-page builder) and once in the browser (`labRelations` in `web/app-core.js`), each tested against fixtures.

### 5. Validation

`validate_labs` enforces: the envelope, required, optional, and forbidden fields; the `lab-` id pattern and cross-collection id uniqueness; taxonomy membership for `lab_type`, `headquarters`, and channel kinds; HTTPS public-host URLs; and these catalog rules:

1. every catalog name matches at least one record in the other collections (no dead names), and at least one matches a reviewed model's `developer` (the inclusion gate);
2. no catalog name, system, or GitHub organization belongs to two labs;
3. a models.dev namespace is never split: every reviewed release in a namespace one lab draws from must carry one of that lab's names;
4. every published system whose repository sits in one of the lab's `github` channel organizations is listed in `systems`, so a new lab-owned system cannot be added without its lab;
5. `github` channels are organization URLs (`https://github.com/<org>`), `hugging_face` channels are organization URLs, channel URLs are unique, and a safety framework is dated no later than the record.

### 6. Placement on the site

Labs is a **sibling view** — a primary navigation tab after Models, `?view=labs` — not a Directory scope. ADR 013 reserves the Directory for deployable choices; an organization is not one, which is also why Specifications is a sibling view.

- **Labs view:** search (names, catalog names, description, organization note), lab type, headquarters, and a distribution facet ("has at least one reviewed release distributed this way", from `model_distribution_modes`). Alphabetical only; no score, no sort control, no comparison, no Finder goal. The only card badge is the lab-type badge every card leads with ([type badges design](2026-09-24-type-badges-design.md)).
- **Cards:** mark, `type · country`, name, parent or site host, the union of the lab's reviewed distribution modes, counts of linked records, the description, and the date of its newest reviewed release — a tracking signal, not a ranking.
- **Detail dialog:** organization facts, the organization note, the lab's reviewed releases newest first (each opens its model dialog) with a "Browse all in Models" handoff, the count of models.dev rows in its namespaces still awaiting review, its systems, services, runtimes, specifications, and packs (each opens its dialog), channels, the safety framework, and reviewed sources. Record kind `lab:id`, Copy link, share page `records/labs/<id>/`, back-button behaviour like every dialog.
- **Cross-links:** a model's developer, a service's operator, a runtime's maintainer, a specification's steward, a pack's steward, and a system claimed by a lab each gain a link to the lab dialog.
- **Models view:** a Lab facet narrows reviewed rows by developer and imported rows by namespace, so "Browse all in Models" lands on the lab's complete release list.
- **Payload:** `app/labs.json` boot (`id`, `name`, `url`, `description`, `lab_type`, `headquarters`, `parent_organization`, `catalog_names`, `systems`), detail files for the rest, and `app/search/labs.json`.
- **Taxonomy view:** lab types and channel kinds.

### 7. Published API

`labs.json` joins `PUBLISHED_DATA`, `web/llms.txt`, the API view, the Atlas skill reference, and `docs/DATA_MODEL.md` in one commit, as `docs/AGENT_DOCS.md` requires. The published record carries names, not joined ids: an API consumer applies the documented join rules to the published files, exactly as the page does. The API view drops its hard-coded file count ("nine"), which had already drifted when `packs.json` was added.

### 8. What automation may do

Nothing writes a lab record. The weekly refresh stages `labs.json` like every catalog file and never edits it. Link checking reaches each lab's `url`, evidence, channels, and safety framework. Review age reports labs like every collection. Candidate discovery and candidate evidence ignore labs: they match repositories, and a lab has none.

### 9. Fitting the Directory redesign (direction B)

The landing-page redesign session asked how labs plug into its front door, which has collection tiles, results scope tabs, a filter rail, and a record side panel. These are the answers.

- **(a) Labs are a collection.** They are reviewed records with their own schema, and ADR 041 is their record under ADR 013: an explicit schema, a boundary (the inclusion gate), and a comparison policy (never compared, never scored, so ADR 014's no-mixing rule is met by having no profile). Labs ship today as a sibling primary view like Models and Specifications, not as a Directory switcher chip. An organization is not a deployable choice, so labs stay out of the All union and its count. In the redesign's registry, Labs is one entry:
  - the tile shows its count, the one-line definition "The organizations that develop the reviewed model releases", and its categories, which `app/labs.json` already carries as `lab_type` and `headquarters`;
  - the tab, list rows, record panel, share pages (`records/labs/<id>/`) and search index (`app/search/labs.json`) already exist.

  It is never empty, so it needs no hide-while-empty rule.
- **(b) Labs are the maker behind other records, and that join is already built.**
  - **What joins.** `buildLabIndex` and `labsForRecord` in `web/app-core.js` return the lab for:
    - a reviewed model, by `developer`;
    - an imported row, by its models.dev namespace;
    - an inference service, by `operator`;
    - a local runtime, by `maintainer`;
    - a specification, by any of `stewards`;
    - a pack, by `steward`;
    - a system, by the explicit ids in the lab's `systems`.

    `labRelations` returns everything one lab joins. A Maker facet, a Labs group in suggestions, and "More from <lab>" in the side panel can all reuse these, with no scores and no Compare.
  - **What doesn't join.** The inclusion gate means only organizations with a reviewed release are labs. A Maker facet over every record therefore needs a fallback to the raw field value for makers that are not labs, such as pure hosts, routers, and most system repository owners. A system joins only when a lab lists it; repository owners are never matched automatically. Validation does require every system in a lab's own GitHub organization to be listed.
  - **Robots.** `robots.manufacturer` is not joined because Robots has not landed. Adding it is one field in `scripts/lab_relations.py` and one in `labRelations`.
- **Operator reconciliation.** The lab registry maps the strings the catalog already uses to one organization, so it answers "which organization is this" without rewriting any operator value. It does not replace the backlog's legal-entity item, which is about which entity a customer contracts with. If that item renames operator values, validation makes the lab's `catalog_names` change in the same commit.
- **(c) Tracking over time is not built.** A lab carries only `verified_at`. Its dialog lists releases newest first by models.dev release date, and its card shows the newest reviewed release, which is a tracking signal only. A first-seen date per record, which a "What's new" view would need, is a separate field and a separate decision.
- **Web files touched.**
  - Code: `web/app.js`, `web/app-core.js`, `web/index.html`, `web/styles.css`.
  - Generated: `web/app/`, `web/records/labs/`, `web/labs.json`, `web/logos.json`, `web/llms.txt`, `web/taxonomy.json`, `web/sitemap.xml`, the blog's asset stamps.
  - Docs: `docs/WEB.md`.
  - Browser tests: the new `tests/e2e/labs.spec.js`, `page-health.spec.js`, `card-badges.spec.js`, `badge-legend.spec.js`, `helpers/catalog-counts.js`.

## Out of scope

- Scoring, ranking, or sorting labs by anything but name; release counts are shown, never sorted.
- Funding, valuation, revenue, headcount, compute, leadership, benchmark results, and news. None is stable, first-party, and operational.
- Organizations with no reviewed release (Hugging Face, Groq, Liquid AI until an LFM release is reviewed) and image-, audio-, or video-only developers.
- Labs in the mixed Directory search; the backlog's unified-search item gains labs instead.
- A timeline of releases across labs; the backlog carries a Models release-date sort.
- Reconciling `operator` strings to contracting entities (an existing backlog item); `catalog_names` accepts the strings as they stand and fails loudly when they change.

## Testing

- `tests/test_validation_policy.py`: a valid lab passes; each forbidden field, an unknown type, country, or channel kind, a dead catalog name, a lab with no reviewed release, a name, system, or GitHub organization claimed twice, a split namespace, an unlisted system in the lab's GitHub organization, a malformed channel URL, a future-dated safety framework, a bad id prefix, a cross-collection id collision, and an unsynchronized web copy each fail.
- `tests/test_lab_relations.py`: the Python joins.
- `tests/test_directory.py`: every published lab passes the gate and carries no forbidden field.
- `tests/test_web_payload.py`, `tests/test_share_pages.py`: the boot fields, one detail file per lab, and a share page per lab.
- `tests/test_web.js`: `filterLabs`, `labRelations`, `labForRecord`, record references, share paths, view ids, and the published-file lists.
- `tests/e2e/labs.spec.js`: the view renders and filters; a dialog opens, restores from its URL, closes on back, hands off to Models, and opens a model; a model dialog links back to its lab.
