# ADR 046: Elements adds role navigation and reference sheets

**Status:** Accepted. Amends [ADR 043](043-the-directory-opens-on-a-front-door-of-collection-tiles.md). Amended by [ADR 054](054-a-role-opens-the-systems-list.md).

## Context

The catalog already assigns each system one family and one operational role. A chemistry-inspired landing visualization can make that structure discoverable, while a particle-data-style reference sheet can expose recorded properties and their review provenance. Neither analogy establishes a periodic law, a performance measurement, or a common ranking across collections.

## Decision

The landing page adds Elements between its search and Finder links and its collection index. Each taxonomy role has a tile grouped under its family, displaying a short symbol and the number of active systems. Symbols are display notation only; names and grouping come from the taxonomy. Empty roles remain visible but disabled. Archived records do not contribute, and each active system appears once.

Selecting a role opens a semantic reference table with an alphabetical record selector. It shows deployment, scoped license classification and material license identifiers, local-first status, canonical data, editorial review date, and recorded limitations. Local-first is not presented as proof of local execution. No scores or recommendation ordering appear. Links open the exact active family/role catalog slice or the selected record's existing evidence dialog.

Counts and navigation use the existing boot payload. Detailed review fields load on selection through the existing detail loader. Pending and failed loads remain explicit, failed loads can retry, and a late response cannot overwrite a newer selection.

The sheet selection uses `element` and `elementRecord` URL parameters with replacement history. Reload and Back restore it. Leaving for a catalog collection or another view removes those parameters. On phones the sheet follows the selected family; on larger screens it follows the whole role map. Keyboard selection focuses its heading, and closing returns focus to the role tile.

## Consequences

- Search and the beginning of Elements occupy the initial viewport; the collection index follows below. ADR 043's collection navigation, counts, facets, and state indicators remain unchanged.
- Catalog schemas, reviewed conclusions, payload fields, and scoring profiles do not change.
- Unit tests cover grouping, counts, ordering, and empty roles. Browser tests cover detail loading, retry, selection races, URL restoration, catalog and evidence links, keyboard focus, and both palettes from desktop down to 320px.

## Mobile navigation amendment

Below 768px, Elements shows one system family at a time using labeled family buttons. A restored role selection reveals its family; switching families closes a sheet belonging to another family. Desktop retains the full map, search, Finder jobs, and collection tiles.

The mobile landing page replaces the header navigation and the five job shortcuts with a fixed, labeled Home, Search, Finder, Explore, and More bar. Search opens the existing mixed catalog and focuses its input. More is a native modal containing documentation links, the existing theme control, and GitHub. Compact collection tiles retain their counts, reviewed/imported distinctions, and state dots; category shortcuts and recent marks remain on desktop. Family buttons are presentation state; selected reference sheets retain their existing URLs.

The bar reserves the device safe area. The comparison tray and badge legend sit above it, and document spacing keeps the footer reachable. While an editing field has a keyboard-sized visual-viewport reduction, the navigation and legend step aside. Desktop and blog navigation retain their existing behavior.
