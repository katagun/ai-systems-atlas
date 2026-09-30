# ADR 049: Elements previews organization marks in a reviewed order

**Status:** Accepted. Amends [ADR 046](046-elements-adds-role-navigation-and-reference-sheets.md) and [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

## Context

Elements role tiles previewed the first three of a role's systems alphabetically, each drawn with the same mark component every other card uses. That component falls back to a monogram when a record has no logo, so 135 of 204 active systems rendered a placeholder glyph rather than a mark, and the three slots were won by whatever the alphabet happened to put first. A tile therefore showed neither a product identity a reader recognizes nor anything true about the organizations behind the role.

The alternative the page already had was the labs collection, which joins to systems by `systems` and to releases by `catalog_names`. Labs are unscored records with no popularity, ranking, or funding field, and the labs guide is explicit that size, funding, and reputation decide nothing about admission. Ordering organizations for a display purpose therefore needed a field of its own, and the temptation was to reach for market capitalization or revenue. Neither is evidence this catalog holds: both are figures no lab publishes about itself, both move, and neither belongs in a record whose other fields are all first-party reviewed.

## Decision

A role tile previews the organizations that build its systems. A lab appears when it owns at least one of the role's systems and has a mark in `logos.json`; a lab with no mark is left out rather than previewed as a monogram. A role whose systems no lab owns previews nothing and renders no strip at all. Tiles keep their role symbol, count, and name, and the reference sheet keeps the selected system's own mark.

Labs carry a required `display_order`: a positive multiple of ten, distinct per lab, ordered by the name on ties. It is a preview precedence and nothing else. It never reaches a score, a sort in any collection, a comparison, or a statement about an organization, and it is never derived from market capitalization, revenue, funding, headcount, or popularity. Because a lab's mark is a rendering fact rather than a catalog one, the previews are painted after `logos.json` loads, and the strip reserves its height until then so tiles do not resize.

## Consequences

- Elements previews three of a role's organizations on desktop and two on phones, with a remainder count over the labs that have a mark, and the strip's tooltip names every organization in the role.
- `display_order` is human-owned editorial data on the lab record, published in the Labs boot payload so the page orders previews from boot data with no extra request.
- Ten of nineteen roles currently have no lab at all, the whole memory family among them, so their tiles carry no marks. That is the catalog's present coverage, stated rather than filled with a placeholder.
- Labs, systems, dialogs, and Finder results keep their monogram fallback: a monogram stands in for a record's own identity, which an organization mark is not.
- A new lab is admitted with a precedence in the same change that records it, and validation refuses a missing, non-integer, or unspaced one.
