# ADR 027: The complete models.dev source catalog is published

- Status: Accepted
- Date: 2026-09-05

## Context

ADR 025 separated automated models.dev discovery from Atlas-reviewed model releases so sparse community metadata could not silently become a license conclusion, score, or editorial boundary. The first implementation made only the reviewed records visible and kept every other source row inside the unpublished review queue. That preserved evidence integrity but made the Models view and common Directory search look like a shortlist rather than a models.dev-backed catalog.

The review queue is also narrower than the upstream source. It admits text-output models because the `model_access` rubric is designed for language-model access and deployment. models.dev's provider-independent tree also contains image-, audio-, and video-output records. Publishing only queue-eligible rows would still not satisfy a complete-source discovery claim.

## Decision

Publish `models-dev.json` as a distinct, commit-pinned, automated source snapshot containing every valid record under models.dev's `models/**/*.toml` tree. Keep only selected provider-independent fields, continue excluding provider endpoint inventories, prices, and benchmarks, and preserve models.dev's MIT attribution.

Keep `models.json` as the independent Atlas-reviewed collection and `model-candidates.json` as the unpublished language-model review workflow. A source record has no Atlas model type, distribution conclusion, source-model classification, reviewed license, evidence, score, or editorial verification date. The UI must label it “Imported metadata · Not Atlas reviewed” and may display upstream license and open-weight values only as reported source claims.

The Models view and common Directory search combine the complete source snapshot with reviewed records by `source_id`. A reviewed record overlays its matching source row, so one upstream release appears once. Imported rows expose source details and the commit-pinned TOML but no score, comparison control, or generated reviewed-record share page. Model-access comparison remains restricted to reviewed `model_access` records.

The importer validates and normalizes the full source snapshot before replacing output files. The weekly refresh may add, update, or remove automated source rows as the pinned upstream commit changes, but it may never edit a reviewed record or promote a queue candidate.

## Consequences

- The quick Models filter, Models view, and common search expose complete upstream source coverage rather than only completed reviews.
- Readers can distinguish “present in models.dev” from “reviewed by Atlas” on every card and detail surface.
- Non-language generators are discoverable as attributed source rows without being forced into a language-model score profile.
- The public API gains one endpoint with models.dev's MIT-derived metadata; Atlas-reviewed conclusions remain in the existing CC BY 4.0 collection.
- Boot payload growth must remain measured because the Models view now carries hundreds of compact source rows; imported records do not generate per-record detail payloads or reviewed share pages.
