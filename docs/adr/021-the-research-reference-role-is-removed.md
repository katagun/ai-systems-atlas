# ADR 021: The research-reference role is removed

**Status:** Accepted

## Context

`directory/taxonomy.json` has carried a `primary_roles` entry in the `memory_system` family since the repository's first commit:

> A survey, benchmark, course, template, or catalog that informs memory implementation.

No ADR ever adopted it. It predates [ADR 003](003-multi-axis-directory.md), which introduced the multi-axis model, and [ADR 004](004-memory-and-agent-families.md), which introduced families; it is a vestige of the original single-family directory.

No published record uses it, as a primary or a secondary role. That alone decides nothing, and the argument must not rest on it: `embedded_memory`, the `removed` status, the `low` research-confidence level, and seven licence identifiers are equally unused, and none of them is being removed. Vocabulary a reviewer may yet need is a different thing from vocabulary the rules route elsewhere.

What decides it is that the rules route this material elsewhere, unconditionally. `docs/CURATION.md` states the catalog's scope:

> The scored catalog covers reviewed operational memory, agent, and assistant systems.

and states where the material this role names belongs:

> `directory/exclusions.json` is reserved for systems that fail a family or role boundary, duplicates, and non-operational research inputs.

There is no qualifier limiting that to unreviewed material. The qualifier runs the other way, to candidates.

The practice matches the rules rather than the role. A triage sweep in September 2026 excluded four entries of precisely this role's stated shape — a survey's companion bibliography, a catalogue of papers and projects, an index of other people's knowledge gardens, and a teaching course — and none of the four reached for it. Each was decided on the scope sentence above.

## Decision

The `research_reference` role is removed from the taxonomy.

### The role is unreachable as well as unused

The role never appears as a filter. `web/app.js` populates the role selector from published values only, so no reader could ever select it and no saved URL could carry it. Its single reader-facing appearance is the taxonomy reference dialog, which lists every role in the vocabulary — where it advertises a memory-family role for surveys and catalogues the Atlas does not publish and has decided not to.

That also distinguishes this from the caution [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md) recorded against renaming a role, which was that renaming an identifier breaks recorded data and URL state. Neither exists here.

### A separate collection, not a role, is the house answer

If the Atlas ever does publish surveys, benchmarks, or catalogues, this role is not the mechanism. [ADR 008](008-specifications-are-unscored-artifacts.md) settled the shape of that problem for artifacts that are not operational systems:

> Forcing them into `system_family` would break the operational taxonomy; giving them scores would create meaningless comparisons between wire protocols and Markdown conventions.

Its remedy was a separate file, its own record, and no family. Both later unscored collections followed it. A role inside `memory_system` is the opposite arrangement: the validator requires a `score` whose keys match the family's profile exactly, so a survey published this way would have to carry a second-brain-fit number and a memory-intelligence number.

### What this does not change

- **Nothing about what is excluded.** The four entries named above were decided on the scope and exclusions sentences in `docs/CURATION.md`, and they stand on those sentences whether or not this role exists.
- **No other unused vocabulary is touched.** Emptiness is not the criterion, and the identifiers listed in the context above remain available.
- **The memory family keeps its other roles.** This removes one entry, not a family boundary, and [ADR 004](004-memory-and-agent-families.md) is untouched.
- **Publishing reference material stays possible.** It would need its own collection under the ADR 008 pattern, with its own record and its own reasons, not a role in a scored family.

## Consequences

- `directory/taxonomy.json` loses one `primary_roles` entry, and `web/taxonomy.json` is regenerated from it by the synchronisation script rather than edited.
- `docs/TAXONOMY.md` no longer names the role in its list of memory-system roles.
- No validator, updater, test, filter, or URL state changes. The automated classifier had no branch that could ever return this role.
- The taxonomy reference dialog stops advertising a role the Atlas does not publish into.
- If reference material is ever wanted, the work is a collection under [ADR 008](008-specifications-are-unscored-artifacts.md)'s pattern, and this record is not an obstacle to it.
