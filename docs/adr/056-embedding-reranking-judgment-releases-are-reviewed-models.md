# ADR 056: Embedding, reranking, and judgment releases are reviewed models

**Status:** Accepted 2026-10-12, owner-directed. Extends [ADR 051](051-generative-media-releases-join-the-reviewed-models-collection.md) and settles the scope question in [`docs/MODELS.md`](../MODELS.md) plus the `model_type` question in `BACKLOG.md`.

## Context

The eligibility rule admitted text, image, video, and audio output, leaving three classes in limbo: embedding models (vector output), reranking models (score output), and judgment models (safety and decision labels). Three judgment records already sat in the catalog misfiled as `language_model` (two Llama Guard generations, one Nemotron safety guard, and Jev 1.13), and the queue held embedding and rerank candidates with nowhere to go. models.dev added its own `type` field (labeling Jev `decision`), raising whether to import it.

## Decision

1. **Scope: all three classes are eligible scored models.** Embedding, reranking, and judgment releases enter the review queue and the scored collection like any other release.
2. **Atlas vocabulary, three new `model_type` values:** `embedding_model` (output: the new `embedding` modality, dense vector representations), `rerank_model` (output: text, through which scores and rankings are expressed), and `judgment_model` (output: text, through which labels and decisions are expressed). Action-emitting policies stay out; ADR 036's boundary is untouched.
3. **No models.dev `type` import.** An external uncontrolled vocabulary does not become review evidence; Jev's `decision` label maps to Atlas `judgment_model` in review prose.
4. **Reclassification in the same change:** the two Llama Guard records, the Nemotron safety guard, and Jev 1.13 move to `judgment_model`. Their output modalities already agree, so no other field changes.
5. **Queue policy for releases models.dev does not list:** the automated files stay `source_id`-keyed because the importer rewrites them and hand-added null-source entries would be wiped. Null-source releases enter by direct `init-gap` review (`models.json` already accepts them with stable slug ids), and null-source holds live in backlog prose, not in the dispositions file.
6. **Labs follow releases, as always:** Baidu and Nous Research proceed through the six-lab text-release batch; Reka, Morph, Inception, and Kwaipilot stay under their existing item; inference-net, nex-agi, perceptron, and prism-ml wait on first-party release evidence; the Relace refusal stands.
