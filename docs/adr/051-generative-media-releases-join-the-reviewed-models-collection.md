# ADR 051: Generative-media releases join the reviewed Models collection

**Status:** Accepted. Amends [`MODELS.md`](../MODELS.md)'s eligibility rule, which [ADR 025](025-model-releases-are-independent-curated-records.md) and [ADR 027](027-complete-models-dev-source-catalog-is-published.md) established, and amends [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md)'s sentence about image generators.

## Context

`docs/MODELS.md` has drawn eligibility with one sentence: "A release is eligible for the review queue and the scored Atlas collection when authoritative sources establish its identity and it generates text as an output modality." Everything else follows from that. `model_types` carries two values, `language_model` and `multimodal_language_model`, both defined by a text output. `scripts/import_models_dev.py` counts a models.dev row eligible only when `"text" in output`, and `validate_model_source_metadata` refuses a reviewed record whose `source_metadata.modalities.output` lacks `text` — a rule `DATA_MODEL.md` states explicitly for a record with `source_id: null`, because the importer's gate never sees it.

The boundary is doing real work. It is why an image generator is a source record a reader can discover and never a record the Atlas has reviewed; it is the stated reason GPT-Image-1.5, Quiver Arrow 2, and Arrow 2 Telos are held rather than reviewed; it is why Veo, grok-imagine, qwen-image, glm-image, MiniMax image-01, and the Gemini TTS rows have stayed out of the queue across every refresh; and it is the reason [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md) could say a company "whose only releases are image generators" is not a lab, and the reason ADR 044's `frontier_announcement` basis had nothing to admit in this class.

Black Forest Labs is what made the cost legible. Its releases are FLUX 3 Image, FLUX 3 Video, and the FLUX 3 Action world action model; its open-weight releases are FLUX.2 [dev] and the Klein variants under a published custom license. None of them generates text, so under the rule above none can be reviewed, and because the Labs gate runs on a reviewed release, BFL cannot be recorded as a lab at all — not by the strongest basis, and not by the narrowest one either, since "we are the frontier AI research lab for visual intelligence" is a claim about a field rather than a statement that the organization is building frontier language models. A reader who knows the name has no way to check the catalog's answer, which is the cost ADR 044 was written to end.

Two narrower paths were available and neither was taken. The rule could have been bent for one organization, which makes the boundary a whitelist. Or BFL could have been admitted on `frontier_announcement`, which contradicts the sentence in `docs/LABS.md` that keeps image-generator companies out and would have made that sentence untrue for the one company a reader is most likely to test it on.

## Decision

Eligibility stops being a statement about output modality and becomes a statement about what the record is for. A release is eligible when authoritative sources establish its identity and it is a **model artifact with a documented output modality**: text, image, video, or audio. Three types join `model_types`.

- `image_generation_model` — a model whose documented primary output is images.
- `video_generation_model` — a model whose documented primary output is video.
- `audio_generation_model` — a model whose documented primary output is audio.

`language_model` and `multimodal_language_model` keep their definitions and their text requirement, which is what those two definitions say. Validation now enforces the type against the record's own `source_metadata.modalities.output`: a language type requires `text`, an image type requires `image`, a video type requires `video`, and an audio type requires `audio`. The blanket "must produce text" rule is gone, and the importer's eligibility gate counts every row with a supported output modality.

### The score profile does not change, and cannot

Every reviewed model uses `model_access`, whose dimensions are license clarity, artifact availability, deployment portability, serving reach, lifecycle transparency, and documentation provenance. None of them is about language. Each asks how clearly an artifact can be obtained, governed, deployed, and tracked, and a diffusion transformer answers those questions the same way a transformer does — which is why no second profile is invented here, and why a new type did not need one. The profile still measures no output quality, no benchmark rank, no parameter count, no price, no latency, and no throughput, and an image generator is not scored on how good its images are. Because the profile is shared, an image release and a language release are comparable on access and on nothing else; that was already true of the language model's own lines.

### What is still out

An **action-emitting policy stays out**, whatever its input modality. FLUX 3 Action, GR00T, OpenVLA, OpenPI, and Gemini Robotics remain held against the Models collection for the reason `docs/COVERAGE.md` records: the review queue, `model_modalities`, and this decision name no type for a model whose primary output is a robot action or a predicted trajectory, and [ADR 036](036-the-agent-to-physical-world-boundary-is-in-scope.md)'s embodied boundary keeps that a separate question. A robotics policy is not a generative-media release, and admitting one would smuggle a physical-actuation boundary in through the modality door.

So is a **judgment, embedding, or reranking model**, which `BACKLOG.md` already holds open as its own question.

### The queue follows the boundary

The importer's gate widens with the boundary, so the eighteen models.dev rows that produce only image, video, or audio enter the review queue at the next scheduled refresh rather than staying invisible to review. They enter as candidates and nothing else: each still passes identity, licence, boundary, and score review on its own evidence, and a queue entry is a proposal, not a conclusion. The `held` dispositions written against the old rule — GPT-Image-1.5, Quiver Arrow 2, Arrow 2 Telos — keep their `held` state, because "not now" is still true of them, and their recorded reasons are re-read at that refresh rather than edited here.

A release models.dev does not list is unaffected by the gate either way: it is reviewed through `init-gap`, with `source_id: null` and hand-authored `source_metadata`. Black Forest Labs is the case that needed it, since models.dev carries no namespace for the organization.

### The Labs consequence

ADR 041's sentence excluding "a company whose only releases are image generators" no longer holds, because such a release can now be reviewed, and a lab with a reviewed release is admitted on `reviewed_release` like any other. The labs gate is unchanged; what changed is which organizations can reach it. `docs/LABS.md` states the widened reach rather than the old exclusion.

## Why the boundary still holds

The old rule was a proxy. "Generates text" stood in for "is the kind of release this catalog reviews", and it did the job only as long as the two coincided. A diffusion model with published weights, a published custom license, a reference implementation, and a documented release identity is the same kind of object as a gated weight release under a community license: an artifact a reader can obtain, govern, deploy, and track. Excluding it was not a judgment about quality or relevance; it was a fact about token output that happened to be doing a scoping job.

What the boundary is now rests on is the same kind of property the other collections rest on: a record the Atlas maintains, reviewed the same way, with the same evidence discipline. Nothing here is decided by prominence, funding, or coverage. BFL is not admitted because it is well known; it is admitted because a release of its own is now reviewable and was reviewed.

Three alternatives were considered and rejected:

**A single `generative_model` type covering every non-text output.** Rejected. It collapses image, video, and audio into one filter value, so a reader filtering for image models would also get speech synthesis, and a future robot-action release would have nowhere to go that does not require reopening this decision. Three values cost three lines and keep each one honest.

**A separate `media-models` collection.** Rejected on ADR 044's reasoning, which this inherits: the question a reader has is the same one — what is this artifact, what may I do with it, and where do I get it — and the score profile, the licence evidence rules, and the labs join are already built for it. A second collection would duplicate the record schema and split the discovery surface to no gain.

**Admitting the action and policy models at the same time.** Rejected because the output vocabulary still cannot express them, and because ADR 036's physical-world boundary is unresolved. Naming them here would pretend the question was settled by a decision about image models.

## Consequences

- `directory/taxonomy.json` gains three `model_types` values. Every type value needs a type card badge, so `web/app-core.js` gains one badge per new type and lists them in the model badge set.
- `scripts/import_models_dev.py` counts a row eligible on any supported output modality rather than on `text`, and `scripts/validate_directory.py` replaces the blanket text rule with the type-modality coherence check. The `source_metadata` schema itself is unchanged; a record with `source_id: null` no longer has to claim a text output it does not have.
- `docs/MODELS.md` states the widened eligibility rule and keeps the review workflow, the release-identity rules, and the scoring boundaries as they were. `docs/DATA_MODEL.md` states the coherence rule in place of the text requirement.
- `docs/LABS.md` replaces the sentence excluding image-generator companies with the widened reach, and its coverage count moves.
- `docs/COVERAGE.md` records the decision, the release reviewed under it, and the lab admitted because of it, with counts measured rather than transcribed.
- The queue and the source snapshot are regenerated by the next scheduled models.dev refresh, not by this change: `scripts/regenerate.py` does not own them, and re-pinning the snapshot here would move the commit every reviewed record's metadata was taken at.
- Nothing already published is reclassified. Every reviewed record keeps the type it has, and the three new types hold no records until a release is reviewed under them.
