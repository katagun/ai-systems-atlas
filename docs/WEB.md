# Web application

The `web/` directory is a dependency-free static application. `app-core.js` contains pure filtering and sorting behavior; `app.js` owns browser state and rendering.

## Visual language

The interface uses a restrained Scandinavian-inspired system: warm stone backgrounds, white paper-like surfaces, forest and muted-rust accents, light borders, generous whitespace, and Avenir-first system typography. Decoration stays subordinate to taxonomy and evidence. New components should reuse the CSS variables in `styles.css`, preserve the compact radius scale, and avoid heavy gradients, neon color, or ornamental shadows.

## Content hierarchy

The directory landing view is action-first. Keep its always-visible introduction to one short value proposition, one supporting sentence, and one optional Finder action. Put the primary browsing controls immediately after it.

Use progressive disclosure for explanation and specialist controls:

- Keep Search, Family, Role, and Sort visible.
- Keep source model, license, agent relation, architecture, status, and local-first under “More filters.”
- State the family-scoped score rule beside the filters where it affects a choice.
- Put definitions and classification rationale in Taxonomy.
- Put evidence, score dimensions, strengths, and weaknesses in project details.

Prefer plain interface labels over methodology language. Use exact taxonomy terms when changing their meaning would introduce ambiguity, but do not repeat the taxonomy thesis in the hero, filters, and footer.

## Behavioral contracts

- The default directory shows active memory systems ranked by the memory score.
- Directory role filters list only roles represented by published projects; candidate-only taxonomy roles remain discoverable in Taxonomy without offering empty filters.
- Selecting all families hides score values and disables score sorting.
- Finder recommendations consider only active projects in the selected family and role set.
- Add a Finder goal for a new role only after at least one active reviewed project can satisfy it.
- Finder priorities affect the shortlist; they are preferences, not hard eligibility filters.
- “Browse matches” preserves every eligible finder role. A manual family or role change clears that temporary role set.
- Active projects appear by default regardless of source model. Archived and removed projects remain inspectable through status filters.
- Every card displays its reviewed license identifiers and source model.
- License and source-model filters are taxonomy-driven and combine with every existing filter.
- Project details show scoped license evidence; Git-hosted evidence links both immutable blobs and human-readable source paths.

## Change surfaces

| Change | Primary location |
|---|---|
| filters and sorting | `web/app-core.js` |
| finder questions and ranking | `web/app.js` finder constants and functions |
| rendering and detail dialog | `web/app.js` |
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
uv run python -m http.server 8765 --directory web
```

Then verify in a browser:

1. search by name and editorial text;
2. switch memory, agent, and all-family views;
3. confirm all-family scores are hidden;
4. combine role, source-model, license, architecture, status, and local-first filters;
5. complete at least one memory and one agent finder path;
6. open the matching directory and confirm its role set;
7. inspect project details and evidence links;
8. navigate taxonomy groups;
9. check narrow and wide layouts and browser console errors.

Use semantic controls and preserve keyboard operation, focus visibility, reduced-motion behavior, and meaningful accessible names.
