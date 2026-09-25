# Web application

The `web/` directory is a dependency-free static application. `app-core.js` contains pure filtering and sorting behavior; `app.js` owns browser state and rendering.

## Visual language

The interface uses a technical editorial system: cool paper backgrounds, crisp white surfaces, teal, coral, and violet taxonomy accents, a subtle coordinate-grid texture, and restrained dimensional shadows. Bricolage Grotesque carries display hierarchy, IBM Plex Sans carries body text, and JetBrains Mono carries evidence, metadata, labels, and counts. The three faces are vendored into `web/fonts/` by `scripts/build_fonts.mjs`, which also writes `web/fonts.css`, so the published page makes no third-party request at runtime. The decorative atlas map in the directory hero expresses the three system families, the inference-service layer, and the local-runtime layer without becoming another navigation surface. Its faint orbital ellipses span all five nodes so no subset reads as a separate cluster. New components must take every colour from the custom properties in `styles.css`: the light palette lives on `:root`, and the dark palette is defined twice, once under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])` and once under `:root[data-theme="dark"]`, so the OS preference and an explicit choice resolve the same way. `tests/test_web.js` fails the build when the two dark blocks differ or when a colour literal appears anywhere else in the file; derive tints with `color-mix()` from a token rather than adding a literal. Corner radii follow the same rule: `--radius` rounds containers such as cards, panels, the map, and dialogs, `--radius-control` rounds inputs, buttons, and other controls, and `--radius-chip` rounds badges, tags, and marks, and the same test fails on any `border-radius` literal outside `:root`. The primary navigation is plain text with a two-pixel underline under the active view at every width, so the collection switcher below it is the only filled segmented control on the page. The footer is a two-zone grid on the content column: the notices stack left at a reading measure and the data date sits right in the mono metadata voice, collapsing to one left-aligned column on a phone. Preserve strong contrast and information density in both palettes, and keep decoration subordinate to taxonomy and evidence. Directory cards lead with a small product mark — a monochrome logo vendored into `web/logos.json`, or a monogram fallback — rendered in `currentColor` so marks stay subordinate to the taxonomy accents.

## Content hierarchy

The directory landing view is action-first. Keep its always-visible introduction to one short value proposition, one supporting sentence, and one optional Finder action. Its All scope presents systems, the complete models.dev source catalog with reviewed overlays, inference services, local runtimes, agent packs, and robots without merging their canonical records or scores.

Use progressive disclosure for explanation and specialist controls:

- Keep the All, Systems, Memory, Agents, Assistants, Models, Inference services, Local runtimes, Agent packs, and Robots quick-filter switcher visible. Models jumps to its sibling specialist view. The Robots entry is hidden while `robots.json` has no records, so an empty collection offers no empty scope. The switcher wraps onto further rows at desktop widths; at 720px and below it stays a one-row horizontal scroll strip, because a wrapped switcher there would push the grid below the fold, and the active entry is scrolled into view when the strip is actually scrollable.
- In All, expose one shared search, sort alphabetically, and hide numeric scores.
- In Systems, keep Search, Family, Role, and Sort visible; keep source model, license, agent relation, architecture, deployment, interface, status, and local-first under “More filters.”
- In Inference services, keep search, service type, delivery, model source, API style, and score sort visible.
- In Local runtimes, keep search, runtime type, accelerator, model format, API style, and score sort visible.
- In Agent packs, keep search, pack type, host, install mechanism, and licence visible; results are alphabetical and unscored.
- The Packs grid lists packs and scored systems whose deployment includes `host_pack` inline, alphabetical by name; pack facets narrow only packs while the search term narrows both; scores stay hidden, nothing offers comparison, and each system card opens its own system dialog (ADR 035).
- In Robots, keep search, form, AI, availability, and status visible; results are alphabetical, unscored, and never offer comparison.
- In Models, keep search, model type, distribution, modality, source model, license, and the sort (access score, release date, or name) visible, and a Lab filter that narrows to one lab's releases.
- In Labs, keep search, type, headquarters, and release distribution visible; results are alphabetical and unscored.
- State the applicable score-scope rule beside each collection's controls.
- Offer comparison only after the user enters one comparable scope: a selected system family, Inference services, Local runtimes, or Models.
- Put definitions and classification rationale in Taxonomy.
- Put the published JSON files, their fetching and licence terms, and what is deliberately unpublished in API. It is the human counterpart to `web/llms.txt`; keep the two saying the same thing.
- Put evidence, score dimensions, strengths, and weaknesses in project details.
- Keep Specifications as a sibling view with direct filters; show contract boundaries and evidence only on demand.
- Keep inference-service constraints, score dimensions, terms, and evidence in its record-specific detail dialog even though discovery shares the Directory surface.
- Keep local-runtime execution traits, hardware requirements, score dimensions, licensing, and evidence in its record-specific detail dialog.
- Keep Labs as a sibling primary view. A lab card and dialog show what the catalog already holds about the organization, joined by name in the browser; the lab record itself adds only who the organization is, where it publishes, and the framework it publishes ([ADR 041](adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md)).
- Keep Models as a sibling primary specialist view while also including every models.dev source record in mixed Directory discovery. Overlay reviewed records by `source_id`, or by `id` for a reviewed record with no `source_id` yet; imported cards and details must say they are not Atlas reviewed, while reviewed details show boundary, licensing, score dimensions, and evidence.

Prefer plain interface labels over methodology language. Use exact taxonomy terms when changing their meaning would introduce ambiguity, but do not repeat the taxonomy thesis in the hero, filters, and footer.

### Card badges

Every card except a robot's carries at least one badge. Badges are defined once in `CARD_BADGES` and listed per collection and system family, in priority order, in `CARD_BADGE_SETS` in `web/app-core.js`. A card shows up to six, which today means every match: one type badge plus at most five traits. On system, inference-service, and local-runtime cards the badges replace the tags row, and on reviewed-model cards they replace the role pill. Badges are for scanning only: they never carry merit, editorial picks, trust or evidence state, or automated signals such as stars, and they never rank.

Each card leads with exactly one **type badge**, which says what kind of record the card is. It tests the one field that classifies the record in its collection for a single value: `system_family`, `service_type`, `runtime_type`, `model_type`, `specification_type`, `pack_type`, or `lab_type`. For an imported models.dev row it tests the imported status, and the badge is named Source record. Every value of each of those vocabularies has a type badge, whether or not a published record carries it yet, so a new taxonomy value cannot ship without one. A type badge is the one deliberate restatement on a card: it repeats, as an emblem, the type the eyebrow prints, so every emblem row starts with the record's kind. It is exempt from the separation guideline below because it identifies rather than filters. Specifications, agent packs, labs, and imported models.dev rows carry their type badge and nothing else; reviewed models carry their type badge and distribution badges; robots get no badges. Robots are the interim exception to every card leading with one type badge while the collection is empty, until a later change adds a `form_factor` type badge and amends [ADR 037](adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md).

Every other badge is a **trait badge**. Each tests one reviewed field for presence — a boolean that is `true`, or an array that contains a named value — so a missing trait badge claims nothing is absent. A trait badge never repeats a fact its card already prints: role pills show API styles on services and runtimes, and service footers show model sources, so no trait badge tests those fields. A reviewed-model card has no role pill; its distribution modes print only as badges, so every mode is a badge, including Developer API at about 77% of reviewed models, and every reviewed model carries at least one. Share a badge name across system families only when it tests the same field and value. Add a badge only when it separates cards, roughly 10–75% of its collection or family; values nearly every record carries are noise. Specifications, imported models.dev rows, and labs carry no trait badges. The first two have no reviewed trait to test. A lab's distribution modes are joined from its releases rather than reviewed on the lab, so they print as one plain label. A reviewed-model card keeps its models.dev modality and family as plain text attributed in a `title` and in visually hidden text, and no badge tests `source_metadata`. A card whose record has no recognised type value and no trait omits the row; no published record does.

Badges render as icon-only emblems rather than text chips. Each badge has exactly one `family` in `BADGE_FAMILIES` in `web/app-core.js`: Type (a circle frame in the neutral `--slate-ink`, so the kind reads apart from the coloured traits), Control and privacy (a shield frame, `--cyan`), Capabilities (a hexagon frame, `--violet`), and Platform and hardware (a rounded-square frame, `--amber`). The family decides the emblem's frame shape and accent colour; `styles.css` colours a family's emblems through its `[data-family]` selector rather than a literal. One glyph maps to exactly one badge id: glyphs are hand-drawn 1.5-unit strokes on a shared 32-unit viewBox, and the three accelerator badges are lettered `MTL`, `ROC`, and `NPU` instead of being drawn or borrowed from a vendor mark.

Badges are not controls and take no tab stop. Each still carries its name and definition in visually hidden text beside the emblem, so a screen reader announces it once. One shared tooltip, `#badge-tooltip`, is `aria-hidden` and pointer-only: it shows the badge's family, name, and definition, opens on hover and on tap, and closes on Escape, on scroll, on an outside tap, or when the pointer leaves. There is no `title` attribute on a badge.

A legend strip fixed to the bottom of the viewport names the active scope's emblems, type badges first:

- in the Directory's Systems scope, the union of badges across families, narrowed to one family's set when the Family filter picks one;
- in All and Agent packs, only the four families, not individual badges;
- in Models, the model types, the Source record badge, and the distribution badges;
- in Specifications and Labs, the view's type badges;
- in Finder, Taxonomy, and API, nothing. Finder shortlist cards carry badges, and their tooltips explain them. `badgeLegend()` in `web/app-core.js` decides the contents for a given collection and system family. The legend collapses to a small "Key" chip, remembers the reader's open-or-closed choice in `localStorage` under `atlas.badgeLegend`, and starts collapsed by default under a 720px viewport when no choice is stored. The legend and its Key chip both step aside while the comparison tray is open, since the tray owns the same edge of the viewport, and return as the stored choice says once the comparison is cleared. The strip's height changes with the scope and the viewport width, so the page measures it: while the strip is open, keyboard focus and scrolling keep content clear of it, and the page footer ends above it rather than under it. Closing the strip moves focus to the Key chip, and reopening it moves focus to its close button.

The Taxonomy view lists badges in one group per family, headed "Card badges · <family name>", stating the family's meaning and showing every badge in that family with its emblem, name, and definition.

A triangle emblem frame is reserved for a possible future tier of reviewed flags, such as marking cyber-capable systems or systems with advanced, dangerous capabilities. Flags would be editorial judgments rather than presence tests, so they need a reviewed field, an evidence bar, and an ADR amending this contract before any data or UI work begins; the reservation is only a spare frame shape, not a commitment to build it.

Cards paint from the boot payload, so any field a badge tests must be in `BOOT_FIELDS` in `scripts/build_web_payload.py`. When the data guard in `tests/test_web.js` reports that a badge no longer appears on any card where it is listed, remove the badge from that list or re-justify it against the 10–75% guide; never change a record to satisfy the guard.

## Behavioral contracts

- The default Directory scope shows every reviewed system, every models.dev source record with reviewed releases overlaid, every inference service, every local runtime, every agent pack, and every robot alphabetically, including archived system references, with scores hidden across collections.
- Mixed Directory search indexes visible identity, editorial, and boundary prose rather than hidden provider metadata or evidence URLs.
- Collection controls are mutually exclusive, expose their selected state accessibly, and preserve the selected Systems, Inference services, Local runtimes, Agent packs, or Robots scope in the `collection` URL parameter.
- The Systems scope defaults to every active memory, agent, and assistant family alphabetically, with cross-family scores hidden.
- A one-character directory search matches prefixes of words in system names; two-character searches require a complete word to avoid false positives such as `Pi` inside `API`.
- Choosing a family clears any role or Finder-role constraint; “Clear filters” restores the all-family active-system default.
- “More filters” reports how many non-default advanced constraints are active so a collapsed control never hides why results are missing.
- Directory role filters list only roles represented by published projects; candidate-only taxonomy roles remain discoverable in Taxonomy without offering empty filters.
- Selecting all families hides score values and disables score sorting.
- Finder system recommendations consider only active projects in the selected family and role set. Inference recommendations consider only the selected service type, and local-runtime recommendations only the selected runtime type. Ranking code must dispatch on `score_profile` and never assume unlike records share fields or dimensions; absence of `system_family` is not a valid test for a collection.
- Add a Finder goal only after at least one active reviewed project, inference service, or local runtime can satisfy it.
- Finder priorities affect the shortlist; they are preferences, not hard eligibility filters.
- “Browse matches” preserves every eligible system role, the selected inference-service type, or the selected runtime type. A manual family or role change clears a temporary system-role set.
- Active projects appear by default regardless of source model. Archived, superseded, and removed projects remain inspectable through status filters.
- A superseded project's details lead with a notice naming its successor, and the successor's name opens that record. The notice states that the review still stands.
- Every card displays its reviewed license identifiers and source model.
- Every system, local-runtime, agent-pack, and specification card whose record carries a GitHub star count shows it in the card footer wherever the card appears: the Directory's All, Systems, Local runtimes, Specifications, and Agent packs grids and the Finder shortlist (Finder covers systems and runtimes). The count is compact, never wraps apart from its star, and reads to a screen reader as "GitHub stars" rather than the glyph's name. Stars are live metadata, so they never enter a score, decide a sort, or become a badge; labs, inference services, and models carry none. A card without a count shows nothing in its place, except in Systems, which can sort by stars and so says "No GitHub metrics" to explain why a record sorts last. Pack, specification, runtime, and service scopes stay alphabetical (or their own score sorts) and never offer a stars sort. Footer actions stay on one line; the facts beside them wrap instead.
- Every system, inference-service, local-runtime, model, and lab card — including Finder shortlist cards — leads with an applicable product/developer mark from `web/logos.json` or a monogram fallback.
- License and source-model filters are taxonomy-driven and combine with every existing filter.
- The deployment filter is taxonomy-driven and combines with every existing filter. It lists only modes carried by published projects, including `host_pack` for systems installed into a host agent, and it is how a reader reaches an operational fact such as a vendor-operated system. [ADR 018](adr/018-operating-party-is-a-trait-not-a-role.md) makes that reachability a precondition: who operates a system is a trait, so the filter must exist rather than the fact being encoded as a role.
- The agent-interface filter is taxonomy-driven, lists only interfaces carried by published projects, and combines with every existing filter. It is how a reader separates a canvas-authored builder from a code library inside one role. [ADR 019](adr/019-authoring-surface-is-a-trait-not-a-role.md) makes that reachability a precondition: authoring surface is a trait, so the filter must exist rather than the fact being encoded as a role.
- Project details show scoped license evidence; Git-hosted evidence links both immutable blobs and human-readable source paths.
- Specification cards show type, integration scope, status or version, steward, and every reviewed license.
- Specification filters combine search, type, scope, status, and license. Results are alphabetic and explicitly unscored.
- Specification search indexes visible identity, steward, repository, and boundary prose; hidden relationship and evidence URLs must not create false-positive cards.
- Specification details distinguish what the artifact standardizes from what it does not, and link reviewed specification and license evidence.
- Reviewed provider traits appear in project details only; do not add a directory provider filter until coverage is representative.
- Inference-service filters combine search, type, delivery mode, model source, and API style inside the Inference services Directory scope. Results default to inference-service score and can be sorted alphabetically.
- Inference-service search indexes visible identity and boundary prose; terms and evidence URLs must not create false-positive cards.
- Inference-service details show the dedicated score dimensions, service/company/model/runtime boundary, regional and retention controls, routing, customization, terms, and reviewed evidence, and, when a human has reviewed one, an unscored trust record with six documentation statuses and dated third-party findings; a service without one says it has not been examined, and an empty findings list says absence is not evidence of safety. The score language must exclude model quality, current price, and transient performance.
- Local-runtime filters combine search, runtime type, accelerator, model format, and API style inside the Local runtimes Directory scope. Results default to local-runtime score and can be sorted alphabetically.
- Local-runtime search indexes visible identity and boundary prose; evidence URLs and license blob identifiers must not create false-positive cards.
- Local-runtime details show the dedicated score dimensions, the runtime/service/assistant boundary, accelerators, model formats, serving modes, deployment surfaces, hardware requirements, model management, operational controls, scoped license evidence, and reviewed sources. The score language must exclude model quality, throughput, latency, benchmark rank, and hardware cost.
- Pack filters combine search, type, host, install mechanism, and licence inside the Agent packs Directory scope. Results are alphabetical, explicitly unscored, and never offer comparison. Scored host-installed systems appear inline in the same grid, narrowed by the search term only.
- Pack details show what the pack installs, any distribution machinery, why it is not a scored system, hosts, packaging formats linked to their specification records, scoped licence evidence, and reviewed sources.
- Lab filters combine search, type, headquarters, and release distribution inside the Labs view. Results are alphabetical, explicitly unscored, and never offer comparison. The release-distribution facet keeps a lab with at least one reviewed release distributed that way; the card and dialog show which modes its releases carry and never state a conclusion for the lab as a whole.
- Lab search reaches the name, description, organization note, catalog names, and parent organization; channel and evidence URLs must not create false-positive cards.
- Lab details join every record whose organization field names one of the lab's `catalog_names` — reviewed releases newest first with counts by distribution mode, the models.dev rows in its namespaces that no review overlays yet, inference services, local runtimes, specifications, and packs — plus the systems it lists, each opening its own dialog. They show headquarters, type, parent, how the organization is arranged, where it publishes, the safety framework when one is recorded (with the note that the Atlas does not assess it, or that absence is not a finding), and reviewed sources. "Browse all in Models" opens Models with the Lab filter set to the lab and the release-date sort, continuing the dialog's newest-first order; the filter keeps the lab's reviewed releases and its pending source rows, and clearing Models filters clears both.
- System, model, inference-service, local-runtime, specification, and pack dialogs name the lab their record joins by the same rules and open it; opening a lab closes the dialog it was opened from.
- Robot filters combine search, form, AI, availability, and status inside the Robots Directory scope. The AI facet offers the two robot AI bases by their reader-facing names, "Maker names a model" and "Runs your own models", and matches a robot carrying that basis. Results are alphabetical, explicitly unscored, and offer no sort control, no score, no card badge, no comparison, and no Finder goal. A robot card leads with its mark, its form factor, its name and maker, an availability pill, and a footer reading "Unscored" while the record is active, or its status word otherwise.
- Robot search matches the record's identity, maker, description, variants, and the names of the models the maker names; a named model's kind, role note, and evidence label are not indexed, so a role note cannot create a false-positive card.
- Robot details lead with the form factor and the word Unscored, and show what it is (maker, status, variants, official page, any repository); "Models the vendor names", each named model labelled vendor-stated with its kind and role note, or a line saying the maker names none, closing with the record's own not-verified sentence; "Running your own models" when the maker documents a route, and "Developer access" when it does not; hardware as the four prose fields compute, sensors, actuation, and power; availability with the vendor's own statement; terms with each reviewed terms source, or a line saying none were published at review time; reviewed sources with the review date; and related records, whose buttons open the related system or robot's own dialog.
- Local runtimes reuse the inference API-style taxonomy because the trait describes the same documented contract on both sides of the service boundary.
- Model filters combine search, model type, distribution mode, modality, source model, and license inside the Models view. Search and modality apply to all source rows; the Atlas model type, distribution, source-model, and license facets naturally select only reviewed rows because imported rows carry none of those conclusions. Results default to reviewed model-access score first, with unscored imports following alphabetically, and can be sorted wholly by name or by release date, newest first. The release-date sort orders reviewed and imported rows together by their models.dev release date, undated releases last, because the date is metadata both carry, not a score; imported rows carry `release_date` in the boot payload for it.
- Model search indexes visible identity and editorial boundary prose; evidence URLs and nested imported metadata must not create false-positive cards.
- Reviewed model details distinguish imported models.dev facts from reviewed conclusions and show the dedicated score, model/service/runtime/application boundary, modalities, reported capabilities and limits, licensing, strengths, tradeoffs, source links, and reviewed evidence. Imported source details show only attributed metadata and the commit-pinned TOML, with no score, comparison, reviewed-share control, or implied license conclusion. Score language must exclude output quality, benchmarks, parameter count, price, latency, and throughput.
- Comparison selection is available for two to four records in one score profile. Mixed results, all-family Systems, Specifications, Agent packs, and Robots never expose comparison controls.
- System comparisons align the family score with role, source model, licenses or terms, deployment, architecture, strengths, and watchouts. Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, six unscored trust-record rows labelled as such in the row heading, strengths, and tradeoffs. Local-runtime comparisons align the runtime score with accelerators, model formats, serving modes, deployment surfaces, licensing, hardware requirements, model management, strengths, and tradeoffs. Model comparisons align the access score with developer, type, distribution, modalities, context limit, licensing, strengths, and tradeoffs.
- The `compare` URL parameter uses `system:id,id`, `inference:id,id`, `runtime:id,id`, or `model:id,id`. Restoration requires every ID to exist and share one compatible profile; invalid or incompatible state is removed rather than partially restored.
- Changing collection or system family clears an incompatible comparison. Filters within the same profile may hide a selected card but must not discard the selection.
- Comparison tables remain fully keyboard operable and horizontally scroll inside their dialog on narrow screens. The current URL is the shareable state; no account or server persistence is implied.
- Every detail dialog is addressable. Opening a system, specification, inference-service, local-runtime, model, pack, lab, or robot record writes a `record` URL parameter — `system:id`, `spec:id`, `inference:id`, `runtime:id`, `model:id`, `pack:id`, `lab:id`, or `robot:id` — as a new history entry, so the browser back button closes the dialog and forward reopens it; closing the dialog removes the parameter. Restoring a `record` URL opens the dialog over the requested collection, switches to the Specifications, Models, or Labs sibling view for those record kinds, and discards an unknown kind, an unknown id, or a malformed reference rather than opening anything. Each reviewed record dialog offers a Copy link control that copies the record's share page URL rather than the address bar, because only the share page carries the record's own title, description, and preview card. Imported model source dialogs link their commit-pinned source and intentionally have no reviewed-record share control.
- Every record has a static share page under `web/records/<collection>/<id>/`, generated by `scripts/build_share_pages.py` together with `web/sitemap.xml` and `web/robots.txt`. A share page shows identity, licensing, and status facts and an "Open in the directory" link into the record dialog; it never shows scores, which only mean something beside their profile. Regenerate after any published data change and commit the result; CI checks freshness.
- The API view lists exactly the files in `PUBLISHED_DATA`, links each at the site origin, and states each file's top-level array and date keys. It carries no record counts: a count drifts the moment a record is added, which is the same reason `llms.txt` carries none. `tests/test_web.js` enforces the file list and the origin.
- The API view explains why the system-candidate, model-candidate, and license-review queues are unpublished and why `logos.json` sits outside the catalog licence, so a reader who notices the gap is not left guessing.
- Every primary navigation view is addressable through the `view` URL parameter. The directory is the default and stays out of the URL; an unknown value is removed rather than leaving the page on nothing. A restored `record` reference still decides the view, so a specification link opens Specifications regardless of `view`.
- The directory boots from nine payloads under `web/` — `app/systems.json`, `app/inference.json`, `app/runtimes.json`, `app/specifications.json`, `app/models.json`, `app/packs.json`, `app/labs.json`, `app/robots.json`, and `taxonomy.json` — rather than from the published endpoints; see [ADR 026](adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md). The Models boot payload combines `models-dev.json` with `models.json` by `source_id`, or by `id` for a reviewed record with no `source_id` yet, marks the source/review status, and emits per-record detail files only for reviewed models. The Labs boot payload carries the join keys (`catalog_names`, `systems`) and card fields only; a lab's joins are computed from the other boot payloads, and its note, channels, framework, and sources wait for its detail file. Its envelope carries `reviewed_count`, the number of reviewed records, and `unlisted_reviewed_count`, the subset of those still waiting on a models.dev row; the kicker in `web/app.js` reads both to add " · N not yet on models.dev" when the count is greater than zero. Imported cards keep only card metadata at boot; their remaining source fields share one lazy `app/model-source-details.json` payload loaded on the first imported detail. A search box loads its collection's search index from `app/search/` on focus. A reviewed record loads its own file from `app/detail/<kind>/<id>.json` when its dialog opens, when it enters a comparison, or when a Finder goal chooses it. `license-evidence.json` loads on the first record opened, and `logos.json` loads after first paint. The nine boot payloads are fetched together and none of them degrades: `bootstrap()` awaits them as one `Promise.all`, and `loadJSON` throws on a non-`ok` response, so a single missing boot payload replaces the whole page with a load-failure notice. Only the lazy payloads degrade, each because its own loader swallows the failure and clears its request so the next reader retries: a search index that never arrives leaves that filter matching the boot record's own fields, a record detail that never arrives leaves the dialog painted from boot, missing `license-evidence.json` leaves a record showing the licence identifiers it already carries, and missing `logos.json` leaves every card on its monogram. A detail opened for the first time paints from boot and repaints when its reviewed or imported-source detail lands.
- The page makes no request outside its own origin: fonts, marks, and data are all served from `web/`.
- The header carries a three-state theme control that cycles system, light, and dark. System leaves the root unstamped so the OS preference decides; light and dark stamp `data-theme` on the root, persist in `localStorage` under `theme`, and are re-applied by an inline script in `index.html` before first paint so a reload never flashes the wrong palette. An explicit choice always beats the OS. The control's accessible name states the current choice, and the `theme-color` meta follows the active background. Share pages follow the OS preference only. Blog pages carry the same stylesheet, the same pre-paint stamp, and their own copy of the control in one inline script, so a choice made anywhere holds everywhere (see `docs/BLOG.md`).

## Change surfaces

| Change | Primary location |
|---|---|
| filters and sorting | `web/app-core.js` |
| finder questions and ranking | `web/app.js` finder constants and functions |
| collection filter facets and search fields | `web/app-core.js` collection view descriptors |
| rendering and detail dialog | `web/app.js` |
| lab join rules | `scripts/lab_relations.py` and `web/app-core.js` `labRelations`, changed together |
| comparison eligibility and selection | `web/app-core.js` and `web/app.js` |
| card marks and logo vendoring | `scripts/build_logos.mjs`, then regenerate `web/logos.json` |
| web fonts | `scripts/build_fonts.mjs`, then regenerate `web/fonts.css` and `web/fonts/` |
| share pages, sitemap, robots | `scripts/build_share_pages.py`, then regenerate `web/records/`, `web/sitemap.xml`, and `web/robots.txt` |
| app payloads | `scripts/build_web_payload.py`, then regenerate `web/app/`; the tree is generated and must never be hand-edited |
| record URLs and detail dialog history | `web/app-core.js` `parseRecordReference` and `web/app.js` record functions |
| view URLs and primary navigation | `web/app-core.js` `parseViewId` and `web/app.js` `activateView`, `writeViewURL`, `restoreViewFromURL` |
| published endpoint reference | `web/index.html` API view, alongside `web/llms.txt` |
| theme palette and control | `web/styles.css` token blocks, `web/index.html` pre-paint stamp, `web/app.js` theme functions |
| layout and responsive behavior | `web/styles.css` |
| asset cache busting | `scripts/build_asset_version.mjs`, run after any change to `web/fonts.css`, `web/styles.css`, `web/app-core.js`, or `web/app.js`; blog pages embed the same `fonts.css` and `styles.css` stamps, so a change to either also needs `scripts/build_blog.py` (see [`BLOG.md`](BLOG.md)) |
| robot filters, cards, and detail dialog | `web/app-core.js` `ROBOT_VIEW` and `filterRobots`, `web/app.js` `robotCard` and `robotDialogMarkup` |
| static structure and controls | `web/index.html` |
| names and definitions | `directory/taxonomy.json` |

Prefer taxonomy-driven labels. Keep HTML escaping at every data-to-markup boundary.

## Verification

Run the dependency-free logic suite:

```bash
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
node scripts/build_fonts.mjs --check
node scripts/build_asset_version.mjs --check
uv run python scripts/build_share_pages.py --check
uv run python scripts/build_web_payload.py --check
```

Confirm the blocking boot payload stays small — this is the number `web/app/` exists to keep down:

```bash
uv run python -m http.server 8765 --directory web &
sleep 2
python3 -c "
import urllib.request, gzip
total = 0
for path in ['app/systems.json','app/inference.json','app/runtimes.json','app/specifications.json','app/models.json','app/packs.json','app/labs.json','app/robots.json','taxonomy.json']:
    body = urllib.request.urlopen(f'http://localhost:8765/{path}').read()
    total += len(gzip.compress(body, 9))
print(f'blocking boot payload: {total/1024:.1f} KB gzipped')"
kill %1
```

Expected: 96.2 KB gzipped, measured 2026-09-25. The 60 KB check threshold stands: anything over it requires checking whether source growth or a detail-only field reached a boot payload. The overage grew from 66.8 KB pre-packs (of which `app/packs.json` adds 0.9 KB) through 68.3 KB and 82.2 KB (2026-09-20) to 90.3 KB before labs, mostly on `app/models.json` source-catalog growth; `app/labs.json` and the three lab taxonomy groups added 2.2 KB with the first fifteen labs, and the second batch of twenty-five, with `none_listed` and seven more countries, 2.0 KB. The overage is tracked in `BACKLOG.md`. It measured 95.7 KB on 2026-09-25 after the Robots collection and the pack and specification star counts merged, and the Models release-date sort adds 0.5 KB by giving imported rows their `release_date`.

Run the rendered browser regression suite. It also guards page health: zero console or page errors across every view, no horizontal overflow at 390px, no request outside the site origin, and record URL restoration (install Chromium once per environment):

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

The suite starts its own server on a port derived from the checkout's path and never adopts one it did not start, so the exploratory server below and a suite running in another worktree cannot serve it another checkout's `web/`. A stale server producing believable but wrong data is the failure this prevents; if its own port is occupied, the run stops with an error naming the port instead. Set `ATLAS_E2E_PORT` to choose the port yourself. The server is `scripts/serve_web.py` rather than `python -m http.server`, whose listen backlog of five drops connections when a page fetches its boot payloads in parallel. A dropped connection waits on the client to retry its handshake; when the retries failed too, as on 2026-09-24, pages never booted and each local run failed a different handful of tests.

For exploratory browser verification, serve the static application:

```bash
uv run python scripts/serve_web.py 8765
```

Then verify in a browser:

1. search by name and editorial text;
2. switch memory, agent, assistant, and all-family views;
3. confirm all-family scores are hidden;
4. combine role, source-model, license, architecture, status, and local-first filters;
5. complete at least one memory, agent, assistant, and inference-service Finder path;
6. open the matching Directory and confirm its role set or service type;
7. inspect project details and evidence links;
8. navigate taxonomy groups;
9. check narrow and wide layouts and browser console errors.
10. search and combine filters in Specifications; open a protocol and instruction-convention detail view.
11. search the mixed Directory for a system, model release, inference service, and local runtime; confirm mixed cards hide scores and open the correct detail dialogs.
12. switch to Inference services, reload the scoped URL, combine every filter, verify score and name sorting, and open direct API, cloud platform, inference host, and routing-aggregator details.
13. confirm comparison controls are hidden in mixed and all-family views, then compare two to four systems within each family.
14. compare inference services, reload a comparison URL, test an invalid or cross-family URL, clear or change scope, and inspect the table at narrow and wide widths; confirm the six trust rows show a status word for a reviewed service and "not examined" for an unreviewed one, and that hovering a status shows the reviewer's note.
15. switch to Local runtimes, reload the scoped URL, combine every filter, verify score and name sorting, and open desktop-runner, server-engine, embedded-library, and compatibility-gateway details.
16. compare two to four local runtimes, reload a `runtime:` comparison URL, confirm a cross-profile URL is discarded rather than partially restored, and confirm changing scope clears the selection.
17. complete a local-runtime Finder path and confirm the Directory handoff preselects the runtime type.
18. confirm the five-node atlas map and the hero statistics row render without wrapping at narrow and wide widths.
19. confirm directory cards lead with product marks in all four collections and that unmapped records show monogram fallbacks.
20. open a record from each Directory collection, Models, and Specifications, confirm the URL carries `record=`, reload it, press back to close it, and use Copy link; open the copied share page and follow its link back into the dialog.
21. confirm the network panel shows no request outside the site origin.
22. cycle the theme control through system, light, and dark with the OS set to each preference; reload under a stored choice and confirm there is no flash; check cards, badges, dialogs, the comparison table, and the Finder in dark.
23. confirm the theme control and the GitHub icon sit on the brand row at desktop, tablet, and phone widths, and that the GitHub icon carries an accessible name.
24. confirm the primary navigation is plain text with an underline under the active view, that every tab fits on a phone, and that the footer notices and data date align to the content column at desktop and phone widths.
25. open API, confirm it lists every published file, follow one endpoint link, and check the endpoint cards, notes, and code spans at narrow and wide widths in both palettes.
26. switch views and confirm the URL gains and drops `view=`, reload a `view=` URL, and confirm an unknown value falls back to the Directory with the parameter removed.
27. use the Models quick filter, verify the full source count, search one imported text model and one non-text-output model, open their attributed details, and confirm both lack score and comparison controls; then combine model type, distribution, modality, source-model, and license filters to isolate reviewed records and verify access-score and name sorting.
28. compare two to four models, reload a `model:` comparison URL, and confirm the table never presents quality, benchmark, price, latency, or throughput rankings.
29. open a model detail and verify imported models.dev fields are visibly attributed as source metadata while the model boundary, licensing, score, and evidence remain reviewed Atlas fields.
30. open a reviewed model with `source_id: null` and confirm the card and dialog show "Not yet listed on models.dev", the metadata is credited to Atlas, and the record is counted in the kicker.
31. confirm emblems on a system from each family, an inference service, a local runtime, and a reviewed model, in both palettes; confirm every card in every grid and in a Finder shortlist leads with one grey type badge, and that a specification, an agent pack, a lab, and an imported model show their type badge alone; confirm a card with only its type badge keeps its footer at the bottom; hover and tap an emblem for its tooltip and dismiss it with Escape; confirm Tab never lands on an emblem; confirm the legend's contents in All, Systems, each Family filter value, Inference services, Local runtimes, Agent packs, Models, Specifications, and Labs, and its absence in Finder and Taxonomy; close it, reload, and reopen it from the Key chip; select a record for comparison and confirm the legend and its Key chip step aside for the tray and return when the comparison is cleared; Tab through the Directory with the legend open and confirm focus never lands under it; scroll to the page footer with the legend open; and find every badge under its family in Taxonomy in both palettes.
32. switch to Agent packs, reload the scoped URL, combine every filter, open a process-kit and a marketplace detail, follow a packaging-format link into Specifications, and confirm no score, sort-by-score, or Compare control appears; search the mixed Directory for a pack; confirm Superpowers is listed inline among the packs with no score or Compare and opens the system dialog.
33. with at least one robot published, switch to Robots, reload the scoped URL, combine form, AI basis, availability, and status, open a robot detail and confirm "Models the vendor names", the vendor-stated label, the not-verified sentence, hardware, terms, and sources; confirm no score, sort, badge, or Compare control; search the mixed Directory for a robot; follow a related system into its dialog and confirm the URL names the system; reload a `record=robot:` URL. With none published, confirm the Robots entry is absent from the switcher and the All total is unchanged.
34. confirm GitHub star counts on system, local-runtime, pack, and specification cards in All, Systems, Local runtimes, Specifications, Agent packs, and a system and a runtime Finder shortlist; confirm ChatGPT and LM Studio show no count outside Systems while Systems says "No GitHub metrics" for ChatGPT, and that a specification without a repo shows no count; and at phone width confirm no count splits from its star and no footer action wraps.
35. switch to Labs, reload `view=labs`, combine type, headquarters, and release filters, search for a unit name (`Qwen`) and for text only an organization note carries (`Hangzhou`), and confirm no score, sort control, or Compare control appears; open a lab, follow a release, a system, and an inference service into their dialogs, return through each dialog's Lab link, use "Browse all in Models", confirm it lands on the release-date sort, and clear the Lab filter; open a lab with no recorded framework and confirm it says absence is not a finding; check the lab grid and dialog at phone width in both palettes, including a lab with long channel URLs, and confirm the dialog never scrolls sideways.

Use semantic controls and preserve keyboard operation, focus visibility, reduced-motion behavior, and meaningful accessible names.
