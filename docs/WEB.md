# Web application

The `web/` directory is a dependency-free static application. `app-core.js` contains pure filtering and sorting behavior; `app.js` owns browser state and rendering.

## Visual language

The interface uses a technical editorial system: cool paper backgrounds, crisp white surfaces, teal, coral, and violet taxonomy accents, a subtle coordinate-grid texture, and restrained dimensional shadows. Bricolage Grotesque carries display hierarchy, IBM Plex Sans carries body text, and JetBrains Mono carries evidence, metadata, labels, and counts. The decorative atlas map in the directory hero expresses the catalog's three system families without becoming another navigation surface. New components should reuse the CSS variables in `styles.css`, preserve strong contrast and information density, and keep decoration subordinate to taxonomy and evidence.

## Content hierarchy

The directory landing view is action-first. Keep its always-visible introduction to one short value proposition, one supporting sentence, and one optional system-Finder action. It presents systems and inference services through collection scopes without merging their canonical records or scores.

Use progressive disclosure for explanation and specialist controls:

- Keep the All, Systems, and Inference services collection switcher visible.
- In All, expose one shared search, sort alphabetically, and hide numeric scores.
- In Systems, keep Search, Family, Role, and Sort visible; keep source model, license, agent relation, architecture, status, and local-first under “More filters.”
- In Inference services, keep search, service type, delivery, model source, API style, and score sort visible.
- State the applicable score-scope rule beside each collection's controls.
- Offer comparison only after the user enters one comparable scope: a selected system family or Inference services.
- Put definitions and classification rationale in Taxonomy.
- Put evidence, score dimensions, strengths, and weaknesses in project details.
- Keep Specifications as a sibling view with direct filters; show contract boundaries and evidence only on demand.
- Keep inference-service constraints, score dimensions, terms, and evidence in its record-specific detail dialog even though discovery shares the Directory surface.

Prefer plain interface labels over methodology language. Use exact taxonomy terms when changing their meaning would introduce ambiguity, but do not repeat the taxonomy thesis in the hero, filters, and footer.

## Behavioral contracts

- The default Directory scope shows every reviewed system and inference service alphabetically, including archived system references, with scores hidden across collections.
- Mixed Directory search indexes visible identity, editorial, and boundary prose rather than hidden provider metadata or evidence URLs.
- Collection controls are mutually exclusive, expose their selected state accessibly, and preserve the selected Systems or Inference services scope in the `collection` URL parameter.
- The Systems scope defaults to every active memory, agent, and assistant family alphabetically, with cross-family scores hidden.
- A one-character directory search matches prefixes of words in system names; two-character searches require a complete word to avoid false positives such as `Pi` inside `API`.
- Choosing a family clears any role or Finder-role constraint; “Clear filters” restores the all-family active-system default.
- “More filters” reports how many non-default advanced constraints are active so a collapsed control never hides why results are missing.
- Directory role filters list only roles represented by published projects; candidate-only taxonomy roles remain discoverable in Taxonomy without offering empty filters.
- Selecting all families hides score values and disables score sorting.
- Finder recommendations consider only active projects in the selected family and role set. Family-specific ranking code must use an explicit branch; never assume every non-memory project has agent-operation fields.
- Add a Finder goal for a new role only after at least one active reviewed project can satisfy it.
- Finder priorities affect the shortlist; they are preferences, not hard eligibility filters.
- “Browse matches” preserves every eligible finder role. A manual family or role change clears that temporary role set.
- Active projects appear by default regardless of source model. Archived and removed projects remain inspectable through status filters.
- Every card displays its reviewed license identifiers and source model.
- License and source-model filters are taxonomy-driven and combine with every existing filter.
- Project details show scoped license evidence; Git-hosted evidence links both immutable blobs and human-readable source paths.
- Specification cards show type, integration scope, status or version, steward, and every reviewed license.
- Specification filters combine search, type, scope, status, and license. Results are alphabetic and explicitly unscored.
- Specification search indexes visible identity, steward, repository, and boundary prose; hidden relationship and evidence URLs must not create false-positive cards.
- Specification details distinguish what the artifact standardizes from what it does not, and link reviewed specification and license evidence.
- Reviewed provider traits appear in project details only; do not add a directory provider filter until coverage is representative.
- Inference-service filters combine search, type, delivery mode, model source, and API style inside the Inference services Directory scope. Results default to inference-service score and can be sorted alphabetically.
- Inference-service search indexes visible identity and boundary prose; terms and evidence URLs must not create false-positive cards.
- Inference-service details show the dedicated score dimensions, service/company/model/runtime boundary, regional and retention controls, routing, customization, terms, and reviewed evidence. The score language must exclude model quality, current price, and transient performance.
- Comparison selection is available for two to four records in one score profile. Mixed results, all-family Systems, and Specifications never expose comparison controls.
- System comparisons align the family score with role, source model, licenses or terms, deployment, architecture, strengths, and watchouts. Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, strengths, and tradeoffs.
- The `compare` URL parameter uses `system:id,id` or `inference:id,id`. Restoration requires every ID to exist and share one compatible profile; invalid or incompatible state is removed rather than partially restored.
- Changing collection or system family clears an incompatible comparison. Filters within the same profile may hide a selected card but must not discard the selection.
- Comparison tables remain fully keyboard operable and horizontally scroll inside their dialog on narrow screens. The current URL is the shareable state; no account or server persistence is implied.

## Change surfaces

| Change | Primary location |
|---|---|
| filters and sorting | `web/app-core.js` |
| finder questions and ranking | `web/app.js` finder constants and functions |
| rendering and detail dialog | `web/app.js` |
| comparison eligibility and selection | `web/app-core.js` and `web/app.js` |
| layout and responsive behavior | `web/styles.css` |
| static structure and controls | `web/index.html` |
| names and definitions | `directory/taxonomy.json` |

Prefer taxonomy-driven labels. Keep HTML escaping at every data-to-markup boundary.

## Verification

Run the dependency-free logic suite:

```bash
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
```

Run the rendered browser regression suite (install Chromium once per environment):

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

For exploratory browser verification, serve the static application:

```bash
uv run python -m http.server 8765 --directory web
```

Then verify in a browser:

1. search by name and editorial text;
2. switch memory, agent, assistant, and all-family views;
3. confirm all-family scores are hidden;
4. combine role, source-model, license, architecture, status, and local-first filters;
5. complete at least one memory, agent, and assistant finder path;
6. open the matching directory and confirm its role set;
7. inspect project details and evidence links;
8. navigate taxonomy groups;
9. check narrow and wide layouts and browser console errors.
10. search and combine filters in Specifications; open a protocol and instruction-convention detail view.
11. search the mixed Directory for both a system and an inference service; confirm mixed cards hide scores and open the correct detail dialogs.
12. switch to Inference services, reload the scoped URL, combine every filter, verify score and name sorting, and open direct API, cloud platform, inference host, and routing-aggregator details.
13. confirm comparison controls are hidden in mixed and all-family views, then compare two to four systems within each family.
14. compare inference services, reload a comparison URL, test an invalid or cross-family URL, clear or change scope, and inspect the table at narrow and wide widths.

Use semantic controls and preserve keyboard operation, focus visibility, reduced-motion behavior, and meaningful accessible names.
