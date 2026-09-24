# Web application

The `web/` directory is a dependency-free static application. `app-core.js` contains pure filtering and sorting behavior; `app.js` owns browser state and rendering.

## Visual language

The interface uses a technical editorial system: cool paper backgrounds, crisp white surfaces, teal, coral, and violet taxonomy accents, a subtle coordinate-grid texture, and restrained dimensional shadows. Bricolage Grotesque carries display hierarchy, IBM Plex Sans carries body text, and JetBrains Mono carries evidence, metadata, labels, and counts. The three faces are vendored into `web/fonts/` by `scripts/build_fonts.mjs`, which also writes `web/fonts.css`, so the published page makes no third-party request at runtime. The decorative atlas map in the directory hero expresses the three system families, the inference-service layer, and the local-runtime layer without becoming another navigation surface. Its faint orbital ellipses span all five nodes so no subset reads as a separate cluster. New components must take every colour from the custom properties in `styles.css`: the light palette lives on `:root`, and the dark palette is defined twice, once under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])` and once under `:root[data-theme="dark"]`, so the OS preference and an explicit choice resolve the same way. `tests/test_web.js` fails the build when the two dark blocks differ or when a colour literal appears anywhere else in the file; derive tints with `color-mix()` from a token rather than adding a literal. Corner radii follow the same rule: `--radius` rounds containers such as cards, panels, the map, and dialogs, `--radius-control` rounds inputs, buttons, and other controls, and `--radius-chip` rounds badges, tags, and marks, and the same test fails on any `border-radius` literal outside `:root`. The primary navigation is plain text with a two-pixel underline under the active view at every width, so the collection switcher below it is the only filled segmented control on the page. The footer is a two-zone grid on the content column: the notices stack left at a reading measure and the data date sits right in the mono metadata voice, collapsing to one left-aligned column on a phone. Preserve strong contrast and information density in both palettes, and keep decoration subordinate to taxonomy and evidence. Directory cards lead with a small product mark — a monochrome logo vendored into `web/logos.json`, or a monogram fallback — rendered in `currentColor` so marks stay subordinate to the taxonomy accents.

## Content hierarchy

The directory landing view is action-first. Keep its always-visible introduction to one short value proposition, one supporting sentence, and one optional Finder action. Its All scope presents systems, the complete models.dev source catalog with reviewed overlays, inference services, and local runtimes without merging their canonical records or scores.

Use progressive disclosure for explanation and specialist controls:

- Keep the All, Systems, Memory, Agents, Assistants, Models, Inference services, Local runtimes, and Agent packs quick-filter switcher visible. Models jumps to its sibling specialist view.
- In All, expose one shared search, sort alphabetically, and hide numeric scores.
- In Systems, keep Search, Family, Role, and Sort visible; keep source model, license, agent relation, architecture, deployment, interface, status, and local-first under “More filters.”
- In Inference services, keep search, service type, delivery, model source, API style, and score sort visible.
- In Local runtimes, keep search, runtime type, accelerator, model format, API style, and score sort visible.
- In Agent packs, keep search, pack type, host, install mechanism, and licence visible; results are alphabetical and unscored.
- The Packs grid lists packs and scored systems whose deployment includes `host_pack` inline, alphabetical by name; pack facets narrow only packs while the search term narrows both; scores stay hidden, nothing offers comparison, and each system card opens its own system dialog (ADR 035).
- In Models, keep search, model type, distribution, modality, source model, license, and access-score sort visible.
- State the applicable score-scope rule beside each collection's controls.
- Offer comparison only after the user enters one comparable scope: a selected system family, Inference services, Local runtimes, or Models.
- Put definitions and classification rationale in Taxonomy.
- Put the published JSON files, their fetching and licence terms, and what is deliberately unpublished in API. It is the human counterpart to `web/llms.txt`; keep the two saying the same thing.
- Put evidence, score dimensions, strengths, and weaknesses in project details.
- Keep Specifications as a sibling view with direct filters; show contract boundaries and evidence only on demand.
- Keep inference-service constraints, score dimensions, terms, and evidence in its record-specific detail dialog even though discovery shares the Directory surface.
- Keep local-runtime execution traits, hardware requirements, score dimensions, licensing, and evidence in its record-specific detail dialog.
- Keep Models as a sibling primary specialist view while also including every models.dev source record in mixed Directory discovery. Overlay reviewed records by `source_id`, or by `id` for a reviewed record with no `source_id` yet; imported cards and details must say they are not Atlas reviewed, while reviewed details show boundary, licensing, score dimensions, and evidence.

Prefer plain interface labels over methodology language. Use exact taxonomy terms when changing their meaning would introduce ambiguity, but do not repeat the taxonomy thesis in the hero, filters, and footer.

### Card badges

System, inference-service, and local-runtime cards replace the tags row, and reviewed-model cards replace the role pill, with up to six badges, which today means every match, since no set lists more than five, defined once in `CARD_BADGES` and listed per collection and system family, in priority order, in `CARD_BADGE_SETS` in `web/app-core.js`. Badges are for scanning only: they never carry merit, editorial picks, trust or evidence state, or automated signals such as stars, and they never rank. Each badge tests one reviewed field for presence — a boolean that is `true`, or an array that contains a named value — so a missing badge claims nothing is absent. A badge never repeats a fact its card already prints: role pills show API styles on services and runtimes, and service footers show model sources, so no badge tests those fields. A reviewed-model card has no role pill; its distribution modes print only as badges, so every mode is a badge, including Developer API at about 77% of reviewed models, and every reviewed model carries at least one. Share a badge name across system families only when it tests the same field and value. Add a badge only when it separates cards, roughly 10–75% of its collection or family; values nearly every record carries are noise. Specifications and imported models.dev rows get no badges, because they carry no reviewed field to test; a reviewed-model card keeps its models.dev modality and family as plain text attributed in a `title` and in visually hidden text, and no badge tests `source_metadata`. A card with no badge omits the row.

Badges render as icon-only emblems rather than text chips. Each badge has exactly one `family` in `BADGE_FAMILIES` in `web/app-core.js` — Control and privacy (a shield frame, `--cyan`), Capabilities (a hexagon frame, `--violet`), and Platform and hardware (a rounded-square frame, `--amber`) — and the family decides the emblem's frame shape and accent colour; `styles.css` colours a family's emblems through its `[data-family]` selector rather than a literal. One glyph maps to exactly one badge id: glyphs are hand-drawn 1.5-unit strokes on a shared 32-unit viewBox, and the three accelerator badges are lettered `MTL`, `ROC`, and `NPU` instead of being drawn or borrowed from a vendor mark.

Badges are not controls and take no tab stop. Each still carries its name and definition in visually hidden text beside the emblem, so a screen reader announces it once. One shared tooltip, `#badge-tooltip`, is `aria-hidden` and pointer-only: it shows the badge's family, name, and definition, opens on hover and on tap, and closes on Escape, on scroll, on an outside tap, or when the pointer leaves. There is no `title` attribute on a badge.

A legend strip fixed to the bottom of the viewport in the Directory and in Models names the active scope's emblems: the union of badges across families in Systems, narrowed to one family's set when the Family filter picks one; only the three families, not individual badges, in All and Agent packs; the model set in Models; and nothing in Finder, Specifications, Taxonomy, or API. `badgeLegend()` in `web/app-core.js` decides the contents for a given collection and system family. The legend collapses to a small "Key" chip, remembers the reader's open-or-closed choice in `localStorage` under `atlas.badgeLegend`, and starts collapsed by default under a 720px viewport when no choice is stored. The legend and its Key chip both step aside while the comparison tray is open, since the tray owns the same edge of the viewport, and return as the stored choice says once the comparison is cleared. The strip's height changes with the scope and the viewport width, so the page measures it: while the strip is open, keyboard focus and scrolling keep content clear of it, and the page footer ends above it rather than under it. Closing the strip moves focus to the Key chip, and reopening it moves focus to its close button.

The Taxonomy view lists badges in one group per family, headed "Card badges · <family name>", stating the family's meaning and showing every badge in that family with its emblem, name, and definition.

A triangle emblem frame is reserved for a possible future tier of reviewed flags, such as marking cyber-capable systems or systems with advanced, dangerous capabilities. Flags would be editorial judgments rather than presence tests, so they need a reviewed field, an evidence bar, and an ADR amending this contract before any data or UI work begins; the reservation is only a spare frame shape, not a commitment to build it.

Cards paint from the boot payload, so any field a badge tests must be in `BOOT_FIELDS` in `scripts/build_web_payload.py`. When the data guard in `tests/test_web.js` reports that a badge no longer appears on any card where it is listed, remove the badge from that list or re-justify it against the 10–75% guide; never change a record to satisfy the guard.

## Behavioral contracts

- The default Directory scope shows every reviewed system, every models.dev source record with reviewed releases overlaid, every inference service, and every local runtime alphabetically, including archived system references, with scores hidden across collections.
- Mixed Directory search indexes visible identity, editorial, and boundary prose rather than hidden provider metadata or evidence URLs.
- Collection controls are mutually exclusive, expose their selected state accessibly, and preserve the selected Systems, Inference services, or Local runtimes scope in the `collection` URL parameter.
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
- Every system, local-runtime, agent-pack, and specification card whose record carries a GitHub star count shows it in the card footer wherever the card appears: the Directory's All, Systems, Local runtimes, Specifications, and Agent packs grids and the Finder shortlist (Finder covers systems and runtimes). The count is compact, never wraps apart from its star, and reads to a screen reader as "GitHub stars" rather than the glyph's name. Stars are live metadata, so they never enter a score, decide a sort, or become a badge; inference services and models carry none. A card without a count shows nothing in its place, except in Systems, which can sort by stars and so says "No GitHub metrics" to explain why a record sorts last. Pack, specification, runtime, and service scopes stay alphabetical (or their own score sorts) and never offer a stars sort. Footer actions stay on one line; the facts beside them wrap instead.
- Every system, inference-service, local-runtime, and model card — including Finder shortlist cards — leads with an applicable product/developer mark from `web/logos.json` or a monogram fallback. Marks are decorative (`aria-hidden`), may only depict the record or the maintainer/operator/developer named in its published data, ship as build-sanitized monochrome vector bodies with no gradients, masks, links, or scripts, and the footer states that marks identify their owners' products. Regenerate the file with `node scripts/build_logos.mjs` after editing its record map or reviewing new records.
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
- Local runtimes reuse the inference API-style taxonomy because the trait describes the same documented contract on both sides of the service boundary.
- Model filters combine search, model type, distribution mode, modality, source model, and license inside the Models view. Search and modality apply to all source rows; the Atlas model type, distribution, source-model, and license facets naturally select only reviewed rows because imported rows carry none of those conclusions. Results default to reviewed model-access score first, with unscored imports following alphabetically, and can be sorted wholly by name.
- Model search indexes visible identity and editorial boundary prose; evidence URLs and nested imported metadata must not create false-positive cards.
- Reviewed model details distinguish imported models.dev facts from reviewed conclusions and show the dedicated score, model/service/runtime/application boundary, modalities, reported capabilities and limits, licensing, strengths, tradeoffs, source links, and reviewed evidence. Imported source details show only attributed metadata and the commit-pinned TOML, with no score, comparison, reviewed-share control, or implied license conclusion. Score language must exclude output quality, benchmarks, parameter count, price, latency, and throughput.
- Comparison selection is available for two to four records in one score profile. Mixed results, all-family Systems, Specifications, and Agent packs never expose comparison controls.
- System comparisons align the family score with role, source model, licenses or terms, deployment, architecture, strengths, and watchouts. Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, six unscored trust-record rows labelled as such in the row heading, strengths, and tradeoffs. Local-runtime comparisons align the runtime score with accelerators, model formats, serving modes, deployment surfaces, licensing, hardware requirements, model management, strengths, and tradeoffs. Model comparisons align the access score with developer, type, distribution, modalities, context limit, licensing, strengths, and tradeoffs.
- The `compare` URL parameter uses `system:id,id`, `inference:id,id`, `runtime:id,id`, or `model:id,id`. Restoration requires every ID to exist and share one compatible profile; invalid or incompatible state is removed rather than partially restored.
- Changing collection or system family clears an incompatible comparison. Filters within the same profile may hide a selected card but must not discard the selection.
- Comparison tables remain fully keyboard operable and horizontally scroll inside their dialog on narrow screens. The current URL is the shareable state; no account or server persistence is implied.
- Every detail dialog is addressable. Opening a system, specification, inference-service, local-runtime, model, or pack record writes a `record` URL parameter — `system:id`, `spec:id`, `inference:id`, `runtime:id`, `model:id`, or `pack:id` — as a new history entry, so the browser back button closes the dialog and forward reopens it; closing the dialog removes the parameter. Restoring a `record` URL opens the dialog over the requested collection, switches to the Specifications or Models sibling view for those record kinds, and discards an unknown kind, an unknown id, or a malformed reference rather than opening anything. Each reviewed record dialog offers a Copy link control that copies the record's share page URL rather than the address bar, because only the share page carries the record's own title, description, and preview card. Imported model source dialogs link their commit-pinned source and intentionally have no reviewed-record share control.
- Every record has a static share page under `web/records/<collection>/<id>/`, generated by `scripts/build_share_pages.py` together with `web/sitemap.xml` and `web/robots.txt`. A share page shows identity, licensing, and status facts and an "Open in the directory" link into the record dialog; it never shows scores, which only mean something beside their profile. Regenerate after any published data change and commit the result; CI checks freshness.
- The API view lists exactly the files in `PUBLISHED_DATA`, links each at the site origin, and states each file's top-level array and date keys. It carries no record counts: a count drifts the moment a record is added, which is the same reason `llms.txt` carries none. `tests/test_web.js` enforces the file list and the origin.
- The API view explains why the system-candidate, model-candidate, and license-review queues are unpublished and why `logos.json` sits outside the catalog licence, so a reader who notices the gap is not left guessing.
- Every primary navigation view is addressable through the `view` URL parameter. The directory is the default and stays out of the URL; an unknown value is removed rather than leaving the page on nothing. A restored `record` reference still decides the view, so a specification link opens Specifications regardless of `view`.
- The directory boots from seven payloads under `web/` — `app/systems.json`, `app/inference.json`, `app/runtimes.json`, `app/specifications.json`, `app/models.json`, `app/packs.json`, and `taxonomy.json` — rather than from the published endpoints; see [ADR 026](adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md). The Models boot payload combines `models-dev.json` with `models.json` by `source_id`, or by `id` for a reviewed record with no `source_id` yet, marks the source/review status, and emits per-record detail files only for reviewed models. Its envelope carries `reviewed_count`, the number of reviewed records, and `unlisted_reviewed_count`, the subset of those still waiting on a models.dev row; the kicker in `web/app.js` reads both to add " · N not yet on models.dev" when the count is greater than zero. Imported cards keep only card metadata at boot; their remaining source fields share one lazy `app/model-source-details.json` payload loaded on the first imported detail. A search box loads its collection's search index from `app/search/` on focus. A reviewed record loads its own file from `app/detail/<kind>/<id>.json` when its dialog opens, when it enters a comparison, or when a Finder goal chooses it. `license-evidence.json` loads on the first record opened, and `logos.json` loads after first paint. Every one of these degrades to something correct if it never arrives. A detail opened for the first time paints from boot and repaints when its reviewed or imported-source detail lands.
- The page makes no request outside its own origin: fonts, marks, and data are all served from `web/`.
- The header carries a three-state theme control that cycles system, light, and dark. System leaves the root unstamped so the OS preference decides; light and dark stamp `data-theme` on the root, persist in `localStorage` under `theme`, and are re-applied by an inline script in `index.html` before first paint so a reload never flashes the wrong palette. An explicit choice always beats the OS. The control's accessible name states the current choice, and the `theme-color` meta follows the active background. Share pages follow the OS preference only. Blog pages carry the same stylesheet, the same pre-paint stamp, and their own copy of the control in one inline script, so a choice made anywhere holds everywhere (see `docs/BLOG.md`).

## Change surfaces

| Change | Primary location |
|---|---|
| filters and sorting | `web/app-core.js` |
| finder questions and ranking | `web/app.js` finder constants and functions |
| collection filter facets and search fields | `web/app-core.js` collection view descriptors |
| rendering and detail dialog | `web/app.js` |
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
| asset cache busting | `scripts/build_asset_version.mjs`, run after any change to `web/fonts.css`, `web/styles.css`, `web/app-core.js`, or `web/app.js` |
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
for path in ['app/systems.json','app/inference.json','app/runtimes.json','app/specifications.json','app/models.json','app/packs.json','taxonomy.json']:
    body = urllib.request.urlopen(f'http://localhost:8765/{path}').read()
    total += len(gzip.compress(body, 9))
print(f'blocking boot payload: {total/1024:.1f} KB gzipped')"
kill %1
```

Expected: 82.2 KB gzipped, measured 2026-09-20. The 60 KB check threshold stands: anything over it requires checking whether source growth or a detail-only field reached a boot payload. The overage grew from 66.8 KB pre-packs (of which `app/packs.json` adds 0.9 KB) through 68.3 KB to today's figure mostly on `app/models.json` source-catalog growth, and is tracked in `BACKLOG.md`.

Run the rendered browser regression suite. It also guards page health: zero console or page errors across every view, no horizontal overflow at 390px, no request outside the site origin, and record URL restoration (install Chromium once per environment):

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

The suite starts its own server on a port derived from the checkout's path and never adopts one it did not start, so the exploratory server below and a suite running in another worktree cannot serve it another checkout's `web/`. A stale server producing believable but wrong data is the failure this prevents; if its own port is occupied, the run stops with an error naming the port instead. Set `ATLAS_E2E_PORT` to choose the port yourself.

For exploratory browser verification, serve the static application:

```bash
uv run python -m http.server 8765 --directory web
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
31. confirm emblems on a system from each family, an inference service, a local runtime, and a reviewed model, in both palettes; confirm imported models and specifications show none; confirm a badge-less card keeps its footer at the bottom; hover and tap an emblem for its tooltip and dismiss it with Escape; confirm Tab never lands on an emblem; confirm the legend's contents in All, Systems, each Family filter value, Inference services, Local runtimes, Agent packs, and Models, and its absence in Finder and Taxonomy; close it, reload, and reopen it from the Key chip; select a record for comparison and confirm the legend and its Key chip step aside for the tray and return when the comparison is cleared; Tab through the Directory with the legend open and confirm focus never lands under it; scroll to the page footer with the legend open; and find every badge under its family in Taxonomy in both palettes.
32. switch to Agent packs, reload the scoped URL, combine every filter, open a process-kit and a marketplace detail, follow a packaging-format link into Specifications, and confirm no score, sort-by-score, or Compare control appears; search the mixed Directory for a pack; confirm Superpowers is listed inline among the packs with no score or Compare and opens the system dialog.
33. once the robots scope ships, open it, confirm records list alphabetically with no sort control, no score, no Compare control, and no Finder goal; open a record dialog and confirm its evidence roles render.
34. confirm GitHub star counts on system, local-runtime, pack, and specification cards in All, Systems, Local runtimes, Specifications, Agent packs, and a system and a runtime Finder shortlist; confirm ChatGPT and LM Studio show no count outside Systems while Systems says "No GitHub metrics" for ChatGPT, and that a specification without a repo shows no count; and at phone width confirm no count splits from its star and no footer action wraps.

Use semantic controls and preserve keyboard operation, focus visibility, reduced-motion behavior, and meaningful accessible names.
