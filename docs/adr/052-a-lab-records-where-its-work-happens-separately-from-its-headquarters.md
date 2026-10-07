# ADR 052: A lab records where its work happens, separately from where it is headquartered

**Status:** Accepted. Amends [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

## Context

`headquarters` answers one question: where the organization says it is based, taken from its own pages or its filings. It is the right answer for a filter, and it was the only place the collection said anything about geography, which made it carry a second meaning it was never written for. The two come apart in both directions.

Higgsfield AI's terms, privacy policy, and footer give one address, 535 Mission St, San Francisco, and its about page says it is headquartered in San Francisco, so `headquarters` is `us` and that is not in doubt. Its own careers board is a different picture: of 81 open roles, 50 are on-site in Almaty, Kazakhstan, including nearly every Engineering & Product role and all eight Creative content roles, while the 27 San Francisco Bay Area roles are the corporate, commercial, legal, finance, and security functions. A reader who saw only the headquarters would conclude the opposite of where the engineering happens.

Google runs the other direction. The record is `us` because Google DeepMind's corporate base is Mountain View under Google LLC, and its `organization_note` already separates which unit develops the models from which serves them. DeepMind's own careers page lists ten locations — London, Bay Area, Bangalore, Cambridge (US), Montreal, New York City, Paris, Tokyo, Toronto, Zurich — so the research that produces the catalog's releases is not co-located with the entity the record is named for.

Both facts are first-party and checkable, and both were unreachable. The alternative was prose in `organization_note`, which the labs guide already allows, and prose cannot reach a filter, a card, or a badge: it is one reader's sentence rather than a value. A second flag on a lab card has to come from a value.

## Decision

A lab record may carry `research_locations`: an ordered, distinct list of `countries` ids saying where the organization says its own research, engineering, or creative work happens, whether or not that is where it is headquartered. It is optional. Absent means the catalog has not reviewed it, which is a different statement from a reviewed empty list, and the field never implies that an entry is a legal entity, an office, a registration, or a place a reader should expect to visit.

`headquarters` is unchanged and keeps its own rule: where the organization says it is headquartered or based. `research_locations` never overrides it and never rewrites it, so a San Francisco entity whose engineering sits in Almaty carries both facts, and a Mountain View parent whose research began in London carries both.

Validation requires every entry to be in the taxonomy's `countries` group, to be distinct, to be neither `none_listed` nor the lab's own `headquarters`, and to be at most three entries. The cap is a review cap and a display cap at once: it keeps the field to the sites a reader most needs to know, and it keeps a card's flag row to four circles a mark can carry. An organization with more sites than that keeps the full list in `organization_note`, which is where the whole picture belongs.

Both `countries` roles are editorial and reviewed. A country enters the group in the change whose record needs it, as [`docs/LABS.md`](../LABS.md) already requires for a headquarters, and its definition names both uses.

The page shows the geography as decoration, never as a claim: a lab card keeps the headquarters flag its mark already carries and adds one circle per `research_locations` entry, and the lab dialog names each of them in the Organization block. The flags are regional indicator characters drawn by the platform's font, so no flag artwork enters the repository, and they are `aria-hidden` because the country name is always printed as text beside them.

## Consequences

- Two records carry the field in this change: `lab-higgsfield-ai` with `["kz"]`, from its own careers board, and `lab-google` with `["gb"]`, from DeepMind's own careers page, which lists London first among ten locations. Each carries the supporting evidence entry and the prose that gives the whole picture, including the fact that Higgsfield's one Research & Development role is San Francisco hybrid, which is why its record does not claim all of its R&D is in Kazakhstan.
- The first sweep took eighteen of the 54 records: nine with at least one country, Microsoft's London AI hub and Beijing R&D campus, Amazon's London, Tel Aviv and São Paulo research sites, IBM's Israel, United Kingdom and Switzerland labs, Cohere's San Francisco, London and Paris offices, Writer's London office, Safe Superintelligence's Tel Aviv office, Mixedbread's San Francisco roles, and Higgsfield AI's Almaty engineering, plus Google's London; and nine reviewed empty, where a careers page, imprint, or contact page read for the record places the work in the headquarters country and names no other. The remaining thirty-six leave the field absent. That is the honest state of a field this catalog has not reviewed for them, and a later review fills it in the change that reads that organization's own pages. No record is backfilled from an inference about where a lab "probably" works, and nothing derives the field from a founder's nationality, an address, or a hiring page nobody cited. A page that never discusses where people work is not a review of where they work either, so an unreviewed record is left absent rather than given an empty list.
- `countries` gains `kz` and `gb`. The Labs headquarters filter narrows its options to values published records carry, as every taxonomy filter in the page already does, so no empty country appears in it.
- A country a reader cannot act on stays prose. A lab with sites in ten cities gets the ones that distinguish it and the sentence that names the rest, because a flag per city would be a decoration the reader cannot use.
- The field is human-owned like every other lab field: no automation writes it, no refresh proposes it, and the review workflow in [`docs/LABS.md`](../LABS.md) is what admits one.
