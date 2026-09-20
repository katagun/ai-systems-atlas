# ADR 035: Host-installed systems are listed inline in the Agent packs scope

**Status:** Accepted. Amends [ADR 034](034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md).

## Context

ADR 034 gave the catalog the right primitive for a product that is both a
reviewed system and a host installable: the `host_pack` deployment mode. But
its presentation decision — a "Scored systems installed as packs" block below
the packs grid — bound placement to record kind while the reader task is
"things I can install into my agent." Observed on prod: a reader looking for
Superpowers among packs finds 5 counted packs and a separate uncounted block
in system-styled cards, one of which carries a "System-family score" footer
pointing at a score the scope never shows. The scope answers a question about
record kinds that no reader asked, and its count ("5 packs") disagrees with
what it displays (14 installables).

The scope's real constraints need no segregation to hold. Scores are already
hidden in this scope and comparison is never offered there, so a scored
system listed inline shows no score and offers no comparison — exactly the
behavior the "never scored, never compared" rule requires of the scope.

## Decision

The Agent packs scope lists one alphabetical grid of installables: unscored
pack records from `packs.json` merged with system records carrying
`host_pack`. Pack facets (type, host, install mechanism, licence) narrow only
packs; the search term narrows both, using each collection's own index. The
result count names both parts. System cards in this scope omit the score
footer line; pack cards are unchanged. Dialogs, deep-link URLs, the Systems
deployment filter, and the mixed Directory are unchanged.

## What this amends

- ADR 034's presentation paragraph ("renders a second block below the packs
  grid") now reads as inline listing. Its trait, filter-reachability, scoring,
  and no-duplication decisions stand unchanged: no `packs.json` change, no
  record gains or loses the mode, no score is shown or withdrawn.
- `docs/PACKS.md` ("Scored systems" section), `docs/CURATION.md` (packs
  paragraph tail), `docs/TAXONOMY.md` (host_pack sentence), and `docs/WEB.md`
  (Packs bullets and manual check 31) describe inline listing instead of the
  side block.

## Alternatives considered

**A duplicate `packs.json` record for host-installed systems.** Refused: a
repository appears in exactly one collection and the validator enforces it; a
second record either drops a reviewed score or carries one into a collection
that never scores, and either way the product is counted twice.

**Keeping the segregated block.** Refused: it communicates nothing — scores
are hidden there anyway — while its count disagrees with its display and its
cards point at absent scores. Kind-purity of the grid is not a reader need.

**Placement by distribution form (packs.json for everything installable).**
Already refuted in ADR 034: it reinstates ADR 031's rejected wording,
withdraws reviewed scores against ADR 016, and contradicts the trait-not-role
rule settled in BACKLOG.md.

## Consequences

- The packs grid, count, and empty-state rules above are the scope's contract;
  `docs/WEB.md` carries them and the browser suite covers them.
- A pack-shaped repository that passes ADR 031 still gets one system record
  with the mode set at review from its own prose; it now surfaces inline
  rather than in a block.
- The escalation norm stands alongside this record: a product whose pack and
  system aspects are both genuine is classified by a human ruling, never by
  applying a boundary test twice. Agents may propose placement; the ruling is
  editorial.
