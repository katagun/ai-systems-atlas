# ADR 044: A lab may be recorded on its own published statement of frontier intent

**Status:** Accepted. Amends [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

## Context

[ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md) gates the Labs collection on the Models collection: "An organization is recorded only once the catalog has reviewed a release it developed: one of its `catalog_names` must equal a reviewed model's `developer`, and validation enforces it." It is explicit about who waits. A service operator with no model of its own "is not a lab, and neither is a company whose only releases are image generators or a company that has released nothing. Each of them waits until a release of theirs is reviewed."

The gate is the collection's reason to be. Labs answers "who develops the catalog's models", and a reviewed release is what makes an organization one of *this catalog's* developers rather than an organization the catalog happens to know about. The gate is not a quality filter and never was: it is a boundary, and it keeps the collection bounded by a boundary the Atlas already maintains elsewhere.

It has a cost, and this record is written because the cost became real. An organization can announce, on its own pages, that it is building frontier models, and be absent from the collection until it ships something the Atlas reviews — which may be never. A reader who knows the name has no way to check the catalog's answer, and the catalog's silence is indistinguishable from not having heard of it.

Safe Superintelligence Inc. is that case. Its site states that it "started the world's first straight-shot SSI lab, with one goal and one product: a safe superintelligence", that it is "an American company with offices in Palo Alto and Tel Aviv", and that "SSI is our mission, our name, and our entire product roadmap". It has published no model, no weights, no API, no documentation, no terms, and no safety framework; its GitHub organization exists and holds no repositories, and it has no Hugging Face organization. Its own statement of intent is the entire first-party record.

## Decision

A lab record may be admitted on either of two bases, and every lab record states which one in a required `admission_basis` field drawn from the `lab_admission_bases` taxonomy group.

- **`reviewed_release`** — the original gate. At least one `catalog_names` entry equals a reviewed model's `developer`. This is the basis for every lab that has a release in the catalog.
- **`frontier_announcement`** — the organization publishes, on its own pages, a statement that it is building frontier models, and the catalog has reviewed no release of its own. Its `catalog_names` may be empty, and it normally is.

The two are mutually exclusive and validation enforces both directions. A record that has a reviewed release must use `reviewed_release`, so a lab never understates its own join; a record with no reviewed release must use `frontier_announcement`, so a lab never hides the absence of one behind the stronger vocabulary.

A `frontier_announcement` record still has to meet every other rule ADR 041 set. It is one organization with a legal entity, a headquarters, a type, dated first-party evidence, and channels read from its own pages. It is unscored, unranked, and joined by nothing. What it does not have is the thing the collection was built around, and the page says so in those words rather than printing an empty heading.

### Why the boundary still holds

The gate was a boundary, not a fame filter, and this keeps it one. The new basis is a **property of the organization's own published pages**, not of its size, funding, valuation, headcount, compute, leadership, or reputation. It is checkable by reading one page, and it does not admit a company that merely announces an intention to build something AI-shaped: the pages must say the organization is building frontier models, which is a claim about the work and not about the sector.

It is also the narrowest available widening. Three alternatives were considered and rejected:

**A lab record with no gate at all.** Rejected. That admits every seed-stage company the maintainers can name, which is the outcome ADR 041's gate exists to prevent and which no evidence test can bound.

**A gate on reputation — stars, coverage, hiring, funding rounds.** Rejected on the same grounds ADR 041 rejected scoring labs on governance: these are unstable, and they measure attention rather than the work. A record admitted because it raised a billion dollars is a record of the raise.

**A second collection for announced organizations, keeping Labs join-driven.** Rejected as a schema with no reader. An announced frontier lab and a lab with forty reviewed releases answer the same question — *who is working on this, and where do they publish* — and a reader looking for Safe Superintelligence would not find it by looking somewhere else. Splitting the two makes the announced set smaller and less findable, which is the opposite of the reason for this change.

The cost is accepted rather than argued away: the collection is no longer bounded entirely by the Models collection, and one organization in it joins to nothing. That is stated in the taxonomy, on the record, and on the page, so a reader is never left to infer it from a missing list.

## Consequences

- `directory/taxonomy.json` gains `lab_admission_bases` with `reviewed_release` and `frontier_announcement`.
- `scripts/validate_directory.py` gains `admission_basis` as a required lab field, validates it against the taxonomy, and enforces the two exclusivity directions described above. The catalog-name check still requires every name to match a record, so a name never floats free.
- `scripts/build_web_payload.py` carries `admission_basis` on the Labs boot record, and `web/app.js` prints it in the dialog's Organization block as "Recorded because", and replaces the reviewed-releases block on an announced lab with the sentence explaining the empty join.
- `docs/LABS.md` states both bases and the "recorded because" line; this record supersedes ADR 041's "a company that has released nothing waits" sentence for the announced case only. ADR 041's data rules, its naming rules, and its refusal to score or rank a lab are untouched.
- A lab admitted on an announcement moves to `reviewed_release` the moment a release of its own is reviewed, which validation requires rather than permits. The transition is a data edit, not a new record.
