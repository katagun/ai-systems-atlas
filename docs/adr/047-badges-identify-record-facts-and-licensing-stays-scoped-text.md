# ADR 047: Badges identify record facts and licensing stays scoped text

**Status:** Accepted, 2026-09-29. Amends [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md) (robot type badges).

## Context

The [badge review](../BADGE_REVIEW_2026-09-29.md) found a stale robot exception, inaccessible pointer travel to tooltip content, missing review-attention labels in mixed cards and Finder, and ambiguity between navigation symbols, record types, and licensing. The owner approved addressing all six findings while preserving reviewed classifications and the bot-head navigation mark for Agents and Agent packs.

## Decision

Every published card leads with one type badge. Robots use their reviewed `form_factor`: Humanoid, Quadruped, Arm, Mobile manipulator, or Other. Each taxonomy value has its own glyph and definition, even when no current robot uses it. This says nothing about intelligence, autonomy, reliability, or model compatibility. Robots remain unscored and excluded from comparisons and Finder. Do not add `ai_basis` badges: the admission basis is explained in the record and is not a verified capability; a vendor-named model remains a vendor statement.

Navigation marks identify collections, independently of card predicates. `COLLECTIONS` owns their labels, meanings, and artwork references. Taxonomy explains them separately. Agent packs keeps its shared bot head and Robots its collection arm; neither assigns those types to every member.

Badges remain presence-only facts, with a design budget of six. Registry and published-record tests enforce the budget before publication. The renderer displays every match rather than truncating facts if the budget is accidentally exceeded; rows wrap. Canonical and boot records must resolve to identical badge IDs and order. Prevalence is advisory, with explicit populations and distribution-mode exceptions, never a reason to rewrite editorial data.

Hover explanations persist over the emblem, the gap, and the tooltip itself. Escape, outside tap, scroll, resize, and removal of the anchor dismiss them. Each badge group also has one native keyboard-operable “Badge meanings” disclosure with the same definitions. Individual emblems remain outside the tab order and retain screen-reader text. Evidence-review attention is separate text on scoped cards, mixed cards, and Finder; the last reviewed classification remains visible.

Licensing stays full text rather than a duplicate OSS trait. Systems and runtimes retain their software-scoped labels. Models use artifact-scoped names and definitions stored as `model_name` and `model_definition` on the existing `source_models` taxonomy entries. For example, `open_source` displays as “Open-licensed artifacts” for a model. The stored IDs, reviewed licenses, evidence, scores, and classifications do not change. These labels attest the reviewed release artifacts and mandatory terms, not training-code or training-data openness or compliance with the OSI Open Source AI Definition. Cards, filters, Explore, comparisons, details, Taxonomy, and generated share pages use the same scope. Imported models.dev records retain attributed reported licenses and never inherit reviewed conclusions.

Do not add an OA acronym or OpenAI-logo badge. Services and runtimes already display API styles. System client-side backend scope still needs the separate taxonomy decision in the backlog; provider-independent model releases carry no endpoint-compatibility claim.

## Consequences

Robot badges close the exception without turning admission evidence into a merit signal. One disclosure per card adds a keyboard stop, but avoids a stop for every emblem and makes explanations available beside the record. Scoped model wording clarifies existing evidence without re-reviewing records. A future stronger open-source-AI claim needs its own evidence standard and human review.
