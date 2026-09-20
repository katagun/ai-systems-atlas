# ADR 038: Reviewed models may precede their models.dev source row

- Status: Accepted
- Date: 2026-09-20

## Context

ADR 025 made model releases independent curated records and ADR 027 published the complete models.dev snapshot beside them. Both were written as if every reviewed model starts as a models.dev row: the promotion command refuses a record without a `source_id`, the validator requires the field to be a non-empty string, a test requires every reviewed `source_id` to exist in the snapshot, and the documented review workflow begins "for one record in `directory/model-candidates.json`".

models.dev has gaps. On 2026-09-20 its `dev` branch and the Atlas pin (`9df518a`) both list `anthropic/claude-fable-5`, `anthropic/claude-fable-5-1`, and `anthropic/claude-mythos-5`, but not Claude Mythos 5.1, the restricted counterpart of Fable 5.1. `BACKLOG.md` already records the same shape for Harvey Tenet: a release models.dev does not list can be neither queued nor dispositioned. models.dev is discovery metadata, not the boundary of the collection (ADR 025), so a gap upstream must not become a gap in Atlas.

A first design carried a published `source_gap` block of expected upstream IDs on the record and a `reconciliations` list written by the importer. A repository-only skeptic showed that the block would publish workflow state in `models.json` against the rule that queues and dispositions stay unpublished, that the refresh pull request reports only check results so the new list would have no reader, and that several expected IDs per record left the case where two of them appear unhandled. It also confirmed that all 242 reviewed records already satisfy `id == stable_model_id(source_id)`, which makes the record `id` a sufficient declaration of the expected upstream ID.

## Decision

A reviewed model's `source_id` is either a models.dev ID present in the pinned snapshot or `null`. `null` means Atlas reviewed the release before models.dev listed it. This is the only schema change; `models.json` gains no field.

A null-source record:

- takes as its `id` the stable ID models.dev would derive for the ID the reviewer expects upstream to use (`model-anthropic-claude-mythos-5-1` for `anthropic/claude-mythos-5-1`). The `id` is frozen at creation. It is never renamed, because record URLs have no redirect mechanism;
- carries the same `source_metadata` shape, hand-authored from the developer's first-party documentation and attested by `metadata_verified_at`. It contains no models.dev data, is Atlas material under `LICENSE-DATA`, and no surface may attribute it to models.dev;
- must list `text` among its output modalities, because the importer's modality gate does not see it;
- passes the same review as any other model: authoritative developer page, scoped license evidence, classifications, and `model_access` scores. Only the commit-pinned models.dev evidence URL is not required, since none exists.

The Models projection overlays a linked record on the source row with the same `source_id`, as before, and a null-source record on the source row with the same `id`. A null-source record can therefore never produce a duplicate card or a duplicate `id` when upstream later lists the release under the expected ID.

The importer is unchanged and still never edits a reviewed model. When models.dev lists the release, its row enters `model-candidates.json` like any other eligible row. Validation allows a queued candidate whose `id` equals a null-source reviewed `id` and reports it as link pending; the eligible-count invariant is untouched. A human then runs a guarded `link` command, which shows the hand-authored and upstream metadata side by side, sets `source_id`, replaces `source_metadata` with the models.dev copy, adds the commit-pinned evidence URL, requires a new `metadata_verified_at`, and removes the candidate. From then on models.dev is the record's metadata source, as for every other linked record.

If upstream lists the release under an ID the reviewer did not predict, the row appears as an ordinary unreviewed imported card and queue entry. The reviewer links it with the record `id` kept as it is, or excludes the row as the exact snapshot a reviewed record represents. After such a link the `id` differs from the stable ID of its `source_id`; that divergence is accepted rather than breaking a published URL. If upstream later also lists the originally expected ID (models.dev carries both dated and dateless IDs for some Claude lines), that row's derived `id` would collide with the record's frozen `id`. Validation rejects the collision, and the repair uses existing tools: set `source_id` back to `null`, link the record to the row whose stable ID matches its `id`, and exclude the other row as the exact snapshot the reviewed record represents.

If upstream deletes the row behind a linked record, validation fails as it does today. The repair is to set `source_id` back to `null` and re-attest the metadata, not to delete the review.

A guarded `init-gap` command scaffolds a null-source review. It refuses an ID that is already in the snapshot, the queue, or the dispositions, so it cannot be used to bypass the queue for a release models.dev lists.

## Consequences

- The Models collection can cover releases models.dev omits, starting with Claude Mythos 5.1 in a separate curation change.
- "By `source_id`" in ADR 025, ADR 026, ADR 027, `MODELS.md`, `DATA_MODEL.md`, and `WEB.md` gains the null-source rule, and the review workflow gains a second entry path that does not start from the queue.
- Descriptions of `source_metadata` as imported from models.dev become conditional in `DATA_MODEL.md`, `MODELS.md`, `llms.txt`, and the Atlas skill reference; consumers must treat `source_id: null` as "metadata authored by Atlas".
- The validator newly requires every non-null reviewed `source_id` to exist in the snapshot, which only a test enforced before.
- The UI shows that a record is not yet listed on models.dev instead of printing an ID, labels its metadata as Atlas-reviewed, and counts such records in the Models total.
- A wrong ID guess shows a reviewed card and an unreviewed imported card for the same release until a human links or excludes the row. The imported card is labelled unreviewed, which is accurate; the builder never asserts that two differently named rows are one release.
- Hand-authored metadata is a maintenance cost that ends at linking. Review-age reporting already covers it through `metadata_verified_at`.
- Holds and exclusions for releases models.dev does not list remain impossible, because dispositions are keyed by snapshot `source_id`. That case stays in `BACKLOG.md`.
