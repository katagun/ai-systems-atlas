# ADR 054: A role opens the Systems list

**Status:** Accepted. Amends [ADR 046](046-elements-adds-role-navigation-and-reference-sheets.md).

## Context

ADR 046 put a reference sheet on the role map. The sheet was a third way to read a system, beside the catalog cards and the record dialog, and it hid scores even after a family was selected. Models and Systems on the same door were a second list of the same records, ordered by date and absent from the URL. The catalog already had one results pipeline. The sheet and the stage list repeated it.

## Decision

The role map stays navigation. Choosing a role opens the Systems results for that family and role, sorted by name, in the list layout. Name is the handoff so the list is not a ranking. A family is selected, so the Systems score rule applies and the list shows that family's score. The role map itself shows no scores.

The list's columns are properties already on the boot record: name, role, deployment, license classification and material licenses, local-first, review date, score, and stars. Canonical data and recorded limitations stay in the record dialog. A row opens that dialog. Cards remain the other layout of the same results, and comparison, badges, paging, and the dialog stay available in both.

Models and Systems on the front door are entry points into that same surface, not a second list. Models opens Atlas-reviewed releases, newest release first, as a list. Systems opens active systems, newest review date first, as a list; a system with no review date sorts last and stays in the list. The URL names the screen with `collection`, `sort`, `reviewed`, and `layout`. There is no stage parameter.

`layout` is `cards` or `list`. Cards is the default and is omitted from the URL. A collection tile still opens cards.

An `element` and `elementRecord` URL redirects to `collection=systems` with that role's family, `sort=name`, and `layout=list`. When `elementRecord` is a system of that role, the redirect also opens `record=system:<id>`. An unknown role drops both parameters and stays on the front door.

## Consequences

- The reference sheet and the stage list are gone. One card function paints a collection, including Everything's mixed cards, and one results panel wears the active collection.
- ADR 046's phone bar, one-family role map, and organization previews on the tiles are unchanged.
- Catalog schemas, reviewed conclusions, and score profiles do not change. The score rule lives on the catalog: a family-filtered Systems list shows scores; the old sheet hid them.
