# Web application

The `web/` directory is a dependency-free static application. `app-core.js` contains pure filtering and sorting behavior; `app.js` owns browser state and rendering.

## Visual language

The interface uses a technical editorial system: cool paper backgrounds, crisp white surfaces, teal, coral, and violet taxonomy accents, a subtle coordinate-grid texture, and restrained dimensional shadows. Bricolage Grotesque carries display hierarchy, IBM Plex Sans carries body text, and JetBrains Mono carries evidence, metadata, labels, and counts. The three faces are vendored into `web/fonts/` by `scripts/build_fonts.mjs`, which also writes `web/fonts.css`, so the published page makes no third-party request at runtime. The decorative atlas map in the directory hero expresses the three system families, the inference-service layer, and the local-runtime layer without becoming another navigation surface. Its faint orbital ellipses span all five nodes so no subset reads as a separate cluster. New components must take every colour from the custom properties in `styles.css`: the light palette lives on `:root`, and the dark palette is defined twice, once under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])` and once under `:root[data-theme="dark"]`, so the OS preference and an explicit choice resolve the same way. `tests/test_web.js` fails the build when the two dark blocks differ or when a colour literal appears anywhere else in the file; derive tints with `color-mix()` from a token rather than adding a literal. Corner radii follow the same rule: `--radius` rounds containers such as cards, panels, the map, and dialogs, `--radius-control` rounds inputs, buttons, and other controls, and `--radius-chip` rounds badges, tags, and marks, and the same test fails on any `border-radius` literal outside `:root`. The primary navigation is plain text with a two-pixel underline under the active view at every width, so the collection switcher below it is the only filled segmented control on the page. The footer is a two-zone grid on the content column: the notices stack left at a reading measure and the data date sits right in the mono metadata voice, collapsing to one left-aligned column on a phone. Preserve strong contrast and information density in both palettes, and keep decoration subordinate to taxonomy and evidence. Directory cards lead with a small product mark — a monochrome logo vendored into `web/logos.json`, or a monogram fallback — rendered in `currentColor` so marks stay subordinate to the taxonomy accents.

## Content hierarchy

The directory landing view is action-first. Keep its always-visible introduction to one short value proposition, one supporting sentence, and one optional Finder action. It presents systems, inference services, and local runtimes through collection scopes without merging their canonical records or scores.

Use progressive disclosure for explanation and specialist controls:

- Keep the All, Systems, Inference services, and Local runtimes collection switcher visible.
- In All, expose one shared search, sort alphabetically, and hide numeric scores.
- In Systems, keep Search, Family, Role, and Sort visible; keep source model, license, agent relation, architecture, deployment, interface, status, and local-first under “More filters.”
- In Inference services, keep search, service type, delivery, model source, API style, and score sort visible.
- In Local runtimes, keep search, runtime type, accelerator, model format, API style, and score sort visible.
- State the applicable score-scope rule beside each collection's controls.
- Offer comparison only after the user enters one comparable scope: a selected system family, Inference services, or Local runtimes.
- Put definitions and classification rationale in Taxonomy.
- Put the published JSON files, their fetching and licence terms, and what is deliberately unpublished in API. It is the human counterpart to `web/llms.txt`; keep the two saying the same thing.
- Put evidence, score dimensions, strengths, and weaknesses in project details.
- Keep Specifications as a sibling view with direct filters; show contract boundaries and evidence only on demand.
- Keep inference-service constraints, score dimensions, terms, and evidence in its record-specific detail dialog even though discovery shares the Directory surface.
- Keep local-runtime execution traits, hardware requirements, score dimensions, licensing, and evidence in its record-specific detail dialog.

Prefer plain interface labels over methodology language. Use exact taxonomy terms when changing their meaning would introduce ambiguity, but do not repeat the taxonomy thesis in the hero, filters, and footer.

## Behavioral contracts

- The default Directory scope shows every reviewed system, inference service, and local runtime alphabetically, including archived system references, with scores hidden across collections.
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
- Every system, inference-service, and local-runtime card — including Finder shortlist cards — leads with a product mark from `web/logos.json` or a monogram fallback. Marks are decorative (`aria-hidden`), may only depict the product itself or the maintainer/operator named in the record's published data, ship as build-sanitized monochrome vector bodies with no gradients, masks, links, or scripts, and the footer states that marks identify their owners' products. Regenerate the file with `node scripts/build_logos.mjs` after editing its record map or reviewing new records.
- License and source-model filters are taxonomy-driven and combine with every existing filter.
- The deployment filter is taxonomy-driven and combines with every existing filter. It lists only modes carried by published projects, and it is how a reader reaches an operational fact such as a vendor-operated system. [ADR 018](adr/018-operating-party-is-a-trait-not-a-role.md) makes that reachability a precondition: who operates a system is a trait, so the filter must exist rather than the fact being encoded as a role.
- The agent-interface filter is taxonomy-driven, lists only interfaces carried by published projects, and combines with every existing filter. It is how a reader separates a canvas-authored builder from a code library inside one role. [ADR 019](adr/019-authoring-surface-is-a-trait-not-a-role.md) makes that reachability a precondition: authoring surface is a trait, so the filter must exist rather than the fact being encoded as a role.
- Project details show scoped license evidence; Git-hosted evidence links both immutable blobs and human-readable source paths.
- Specification cards show type, integration scope, status or version, steward, and every reviewed license.
- Specification filters combine search, type, scope, status, and license. Results are alphabetic and explicitly unscored.
- Specification search indexes visible identity, steward, repository, and boundary prose; hidden relationship and evidence URLs must not create false-positive cards.
- Specification details distinguish what the artifact standardizes from what it does not, and link reviewed specification and license evidence.
- Reviewed provider traits appear in project details only; do not add a directory provider filter until coverage is representative.
- Inference-service filters combine search, type, delivery mode, model source, and API style inside the Inference services Directory scope. Results default to inference-service score and can be sorted alphabetically.
- Inference-service search indexes visible identity and boundary prose; terms and evidence URLs must not create false-positive cards.
- Inference-service details show the dedicated score dimensions, service/company/model/runtime boundary, regional and retention controls, routing, customization, terms, and reviewed evidence. The score language must exclude model quality, current price, and transient performance.
- Local-runtime filters combine search, runtime type, accelerator, model format, and API style inside the Local runtimes Directory scope. Results default to local-runtime score and can be sorted alphabetically.
- Local-runtime search indexes visible identity and boundary prose; evidence URLs and license blob identifiers must not create false-positive cards.
- Local-runtime details show the dedicated score dimensions, the runtime/service/assistant boundary, accelerators, model formats, serving modes, deployment surfaces, hardware requirements, model management, operational controls, scoped license evidence, and reviewed sources. The score language must exclude model quality, throughput, latency, benchmark rank, and hardware cost.
- Local runtimes reuse the inference API-style taxonomy because the trait describes the same documented contract on both sides of the service boundary.
- Comparison selection is available for two to four records in one score profile. Mixed results, all-family Systems, and Specifications never expose comparison controls.
- System comparisons align the family score with role, source model, licenses or terms, deployment, architecture, strengths, and watchouts. Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, strengths, and tradeoffs. Local-runtime comparisons align the runtime score with accelerators, model formats, serving modes, deployment surfaces, licensing, hardware requirements, model management, strengths, and tradeoffs.
- The `compare` URL parameter uses `system:id,id`, `inference:id,id`, or `runtime:id,id`. Restoration requires every ID to exist and share one compatible profile; invalid or incompatible state is removed rather than partially restored.
- Changing collection or system family clears an incompatible comparison. Filters within the same profile may hide a selected card but must not discard the selection.
- Comparison tables remain fully keyboard operable and horizontally scroll inside their dialog on narrow screens. The current URL is the shareable state; no account or server persistence is implied.
- Every detail dialog is addressable. Opening a system, specification, inference-service, or local-runtime record writes a `record` URL parameter — `system:id`, `spec:id`, `inference:id`, or `runtime:id` — as a new history entry, so the browser back button closes the dialog and forward reopens it; closing the dialog removes the parameter. Restoring a `record` URL opens the dialog over the requested collection, switches to the Specifications view for a specification, and discards an unknown kind, an unknown id, or a malformed reference rather than opening anything. Each record dialog offers a Copy link control that copies the record's share page URL rather than the address bar, because only the share page carries the record's own title, description, and preview card.
- Every record has a static share page under `web/records/<collection>/<id>/`, generated by `scripts/build_share_pages.py` together with `web/sitemap.xml` and `web/robots.txt`. A share page shows identity, licensing, and status facts and an "Open in the directory" link into the record dialog; it never shows scores, which only mean something beside their profile. Regenerate after any published data change and commit the result; CI checks freshness.
- The API view lists exactly the files in `PUBLISHED_DATA`, links each at the site origin, and states each file's top-level array and date keys. It carries no record counts: a count drifts the moment a record is added, which is the same reason `llms.txt` carries none. `tests/test_web.js` enforces the file list and the origin.
- The API view explains why the candidate and license-review queues are unpublished and why `logos.json` sits outside the catalog licence, so a reader who notices the gap is not left guessing.
- Every primary navigation view is addressable through the `view` URL parameter. The directory is the default and stays out of the URL; an unknown value is removed rather than leaving the page on nothing. A restored `record` reference still decides the view, so a specification link opens Specifications regardless of `view`.
- The page makes no request outside its own origin: fonts, marks, and data are all served from `web/`.
- The header carries a three-state theme control that cycles system, light, and dark. System leaves the root unstamped so the OS preference decides; light and dark stamp `data-theme` on the root, persist in `localStorage` under `theme`, and are re-applied by an inline script in `index.html` before first paint so a reload never flashes the wrong palette. An explicit choice always beats the OS. The control's accessible name states the current choice, and the `theme-color` meta follows the active background. Share pages follow the OS preference only.

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
```

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
11. search the mixed Directory for both a system and an inference service; confirm mixed cards hide scores and open the correct detail dialogs.
12. switch to Inference services, reload the scoped URL, combine every filter, verify score and name sorting, and open direct API, cloud platform, inference host, and routing-aggregator details.
13. confirm comparison controls are hidden in mixed and all-family views, then compare two to four systems within each family.
14. compare inference services, reload a comparison URL, test an invalid or cross-family URL, clear or change scope, and inspect the table at narrow and wide widths.
15. switch to Local runtimes, reload the scoped URL, combine every filter, verify score and name sorting, and open desktop-runner, server-engine, embedded-library, and compatibility-gateway details.
16. compare two to four local runtimes, reload a `runtime:` comparison URL, confirm a cross-profile URL is discarded rather than partially restored, and confirm changing scope clears the selection.
17. complete a local-runtime Finder path and confirm the Directory handoff preselects the runtime type.
18. confirm the five-node atlas map and the hero statistics row render without wrapping at narrow and wide widths.
19. confirm directory cards lead with product marks in all three collections and that unmapped records show monogram fallbacks.
20. open a record from each Directory collection and from Specifications, confirm the URL carries `record=`, reload it, press back to close it, and use Copy link; open the copied share page and follow its link back into the dialog.
21. confirm the network panel shows no request outside the site origin.
22. cycle the theme control through system, light, and dark with the OS set to each preference; reload under a stored choice and confirm there is no flash; check cards, badges, dialogs, the comparison table, and the Finder in dark.
23. confirm the theme control and the GitHub icon sit on the brand row at desktop, tablet, and phone widths, and that the GitHub icon carries an accessible name.
24. confirm the primary navigation is plain text with an underline under the active view, that every tab fits on a phone, and that the footer notices and data date align to the content column at desktop and phone widths.
25. open API, confirm it lists every published file, follow one endpoint link, and check the endpoint cards, notes, and code spans at narrow and wide widths in both palettes.
26. switch views and confirm the URL gains and drops `view=`, reload a `view=` URL, and confirm an unknown value falls back to the Directory with the parameter removed.

Use semantic controls and preserve keyboard operation, focus visibility, reduced-motion behavior, and meaningful accessible names.
