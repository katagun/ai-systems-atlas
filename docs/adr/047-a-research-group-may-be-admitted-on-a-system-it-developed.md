# ADR 047: A research group may be admitted on a system it developed

**Status:** Accepted. Amends [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md) and [ADR 044](044-a-lab-may-be-recorded-on-its-own-published-statement-of-frontier-intent.md).

## Context

[ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md) gates Labs on Models: "An organization is recorded only once the catalog has reviewed a release it developed." [ADR 044](044-a-lab-may-be-recorded-on-its-own-published-statement-of-frontier-intent.md) widened that gate once, for an organization whose only first-party record is a published statement of frontier intent. Both bases still require the organization to be a *model* developer. Neither can hold an organization that develops something this catalog already curates in another collection and publishes no model the Atlas has reviewed.

The Systems collection holds reviewed records whose own first-party evidence names an academic research group as the maker. DSPy is the case: the Stanford Natural Language Processing Group's own site says it develops "DSPy, a Python framework for programming rather than prompting LLMs", and the reviewed system record is `stanfordnlp/dspy`. The Labs collection cannot record the group, and not only because the gate says no.

It is blocked mechanically, which is the part that matters. `validate_lab_catalog_names` requires every `catalog_names` entry to match a string in a model `developer`, service `operator`, runtime `maintainer`, specification `stewards`, or pack `steward`, and a system record carries no organization field at all — the union of fields across every published system has no `maker`, `org`, `vendor`, `publisher`, or `entity` key. A group is a system record's maker precisely because that collection declines to name one, so no string naming a research group exists anywhere in the catalog to copy. A reader who knows the name cannot check the catalog's answer, and the catalog's silence is indistinguishable from not having heard of it, which is the same cost ADR 044 was written to end.

The asymmetry is worth stating plainly, because the obvious objection is that this admits famous names. It is not a fame filter. Nothing here admits a group for being well known. The group's own page has to name the system, the catalog has to hold a reviewed record of that system, and the group has to be an organization rather than a person. Three checks, all about the work, none about attention — the same standard ADR 044 applied to its own basis.

## Decision

A third `admission_basis`, **`reviewed_system`**. The organization is established as the maker of at least one record in `projects.json`, by that record's own reviewed evidence or by the organization's first-party pages, and the catalog has reviewed no model release of its own. `systems` is non-empty and is the record's subject. `catalog_names` may be empty, and for a research group it normally is, because nothing else in the catalog names it.

The maker must be an **organization** — a company, institute, university, or a group within one — rather than an individual. A person is not a lab, exactly as under ADR 041, and a solo developer who has published a reviewed system stays out on that ground. This is a review judgment rather than a mechanical predicate, the same way `lab_type`, `parent_organization`, and `organization_note` are, and it is the human-owned part of the basis.

The three bases are mutually exclusive and validation enforces every direction. They are ordered from strongest join to weakest, so a record never understates its own join and never hides an absence behind stronger vocabulary:

- a reviewed model release of its own → **`reviewed_release`**;
- none, but a reviewed system it developed → **`reviewed_system`**;
- neither → **`frontier_announcement`**.

A `reviewed_system` record still meets every other rule ADR 041 set. It is one organization with a type, a headquarters, dated first-party evidence, and channels read from its own pages. It is unscored and unranked, like every lab.

### Why the boundary still holds

The gate was a boundary, not a fame filter, and this keeps it one. Every basis is a property of what this catalog curates: a reviewed release, a reviewed system, or a statement on the organization's own pages. The third is a property of a record the Atlas maintains, reviewed the same way, in the collection that already curates the thing. A company that merely announces an AI product still waits, and a research group whose work is a paper rather than a system still waits, because a paper is not a record in any collection.

The growth is therefore bounded by the Systems collection, which is the honest new boundary. It is a real widening — Labs is no longer bounded by Models alone — and it is recorded here rather than absorbed silently, the way ADR 044 recorded its own cost.

Four alternatives were considered and rejected:

**A separate collection for organizations that build systems.** Rejected on ADR 044's reasoning, which this inherits: a research group and a lab with forty reviewed releases answer the same reader's question — who is working on this and where do they publish — and splitting them makes the research set smaller and less findable. The Labs dialog already joins `systems`, so a second collection would duplicate an existing join and add a second place to look.

**An `organization` field on system records, with no new basis.** Rejected as the near-term fix, not as a bad idea. It is the better long-term shape — it is what the planned Maker facet needs, since the lab-to-systems direction already works and the reverse does not — and it is deferred to its own change because it edits a published field across every system record against a boot payload already over budget. This ADR takes the narrow door now and leaves the general one open.

**A basis with no exclusivity, admitting a research group that also has a reviewed release.** Rejected for the reason ADR 044 set: a record with a stronger join must use the stronger vocabulary, or the collection understates what it knows.

**A gate on prominence — citations, authorship, group size, or how often a name comes up.** Rejected on the same grounds ADR 044 rejected funding and stars. Those are unstable and they measure attention.

## Consequences

- `directory/taxonomy.json` gains `reviewed_system` in `lab_admission_bases`, and `public_research`'s definition drops its trailing "that develops and releases models", since a research group admitted under this basis may publish no model.
- `scripts/validate_directory.py` gains the third branch in `validate_lab_catalog_names`: the basis is rejected when the organization has a reviewed release, required when it has a reviewed system and no release, and refused when it has neither, with an error naming `frontier_announcement` instead. A `reviewed_system` record must list at least one system.
- `scripts/lab_relations.py` needs no change: it already joins a system by listed id.
- `web/app.js` learns that a lab with no reviewed releases explains its empty join in the words its basis calls for, and no longer renders an empty release list or a "Browse all 0 in Models" control. The card's count row already drops zero counts, and the Organization block already omits "Named in the catalog as" when `catalog_names` is empty, so both render without change.
- `docs/LABS.md` and [`DATA_MODEL.md`](../DATA_MODEL.md) state the third basis; this record supersedes ADR 041's "a company that has released nothing waits" for a group that developed a reviewed system, and leaves its data rules, naming rules, and refusal to score or rank untouched.
- A `reviewed_system` record moves to `reviewed_release` the moment a release of its own is reviewed, which validation requires rather than permits. The transition is a data edit, not a new record.
