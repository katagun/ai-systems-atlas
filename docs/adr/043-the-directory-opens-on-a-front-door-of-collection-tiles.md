# ADR 043: The Directory opens on a front door of collection tiles

**Status:** Accepted. Amends [ADR 013](013-distinct-collections-share-one-directory-surface.md) and [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

The role navigation and inline reference sheets added by [ADR 045](045-elements-adds-role-navigation-and-reference-sheets.md) precede the collection index. The collection tile and results-strip contracts below remain in force.

## Context

The Directory landed on a hero, an atlas map, and a switcher of ten chips. The switcher mixed three levels: All, a collection, that collection's families, and the Models sibling view. It was 1,346 px wide inside a 349 px phone frame, it sat below the fold on a laptop, and each chip carried a name and a count and nothing else. The [front-door design](../superpowers/specs/2026-09-24-directory-front-door-design.md) chose a search-first landing page whose index and scope tabs are the quick filters. Its skeptic review ruled that tiles carry no definitions and no example marks, because choosing example records would need a ranking the unscored collections forbid ([ADR 008](008-specifications-are-unscored-artifacts.md), [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md), [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md)).

[ADR 013](013-distinct-collections-share-one-directory-surface.md) describes Models as "a visible quick-filter destination" and requires every sibling scope to be "reachable from the quick filters". That wording was written for the chip switcher.

ADR 013 kept Specifications, and ADR 041 kept Labs, as sibling views beside the Directory. Pull request #345 retired those sibling views without an ADR on 2026-09-28: Models, Labs, and Specifications became ordinary Directory collections. This record states that change.

## Decision

A bare Directory URL opens the front door. It holds the headline, one supporting sentence, one search across every collection, the first Finder job of each direction, and an index with one tile per collection. Choosing a tile opens results, where a sticky strip lists the same collections. Tiles and the strip render from one registry, `AppCore.COLLECTIONS`, so a new collection is one entry, hidden while empty.

Tiles and strip entries are the Directory's quick filters. ADR 013's "a visible quick-filter destination" and "reachable from the quick filters" mean a tile on the front door and an entry in the strip. Every collection, Models, Labs, and Specifications included, is a Directory collection with a tile and a strip entry. Legacy `?view=models|labs|specifications` URLs alias to the collection. This supersedes the sibling-view rule of ADR 013 and ADR 041 for the Directory's navigation. Their data rules stand: collections share no canonical schema, and labs stay unscored.

A tile carries the collection's emblem, the count its default view lists with its split, its largest categories as links, three marks, and a state dot. The marks are the three records reviewed most recently by `verified_at`, ties broken by name A–Z. That amends the front-door spec's ruling against example marks. A review date is not a ranking, so the marks make no claim any unscored collection forbids. Tiles still carry no definitions.

The strip changes form with the width. At 1000 px and below its entries show emblems only, and a caption under the row names the pressed entry and its count. From 1001 to 1407 px entries show short names, and above that full names. The header is one compact sticky row on phones (#367), and the strip sticks directly under it at every width, so the collections stay one tap away. On phones the header is 64 px tall and the strip at most 80 px inside Systems, where the family row stays one row, so the sticky stack stays under the old 185 px sticky header. That Phase 0 leftover closed through the compact header, not through a static one. `scroll-padding-top` follows the measured header-plus-strip stack, so focus and anchors land below it.

## Consequences

- `docs/WEB.md` "Content hierarchy" describes the front door and the strip; the switcher contract is gone.
- Leaving the front door pushes one history entry; everything inside results replaces; one restore reads the whole URL on boot and on Back.
- A collection with no records has no tile and no entry, which generalises ADR 037's Robots rule.
- The marks rule reads a field every published record already carries, so no field joins the boot payload; the payload envelope names the three ids.
- Papers (ADR 033, Proposed) and any later collection add one registry entry and one payload.
