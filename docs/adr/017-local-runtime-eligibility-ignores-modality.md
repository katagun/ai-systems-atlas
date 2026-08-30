# ADR 017: Local-runtime eligibility ignores modality

**Status:** Accepted

## Context

[ADR 015](015-local-runtimes-are-self-operated-execution-records.md) defines the unit of curation as "a named, self-operated software runtime that executes model inference on infrastructure the user controls." It never names a model type, and its substrate test asks what the software is for rather than what it runs.

The operative boundary was narrower than that text, and the taxonomy proves it. Every one of the ten `runtime_model_formats` values enumerated a language-model weight artifact: GGUF, safetensors, PyTorch checkpoints, MLX, AWQ, GPTQ, FP8, ONNX, and MLC's compiled output. Nothing described a graph export, an audio model, or a vision model.

That divergence stayed invisible while every reviewed runtime served language models. It surfaced the moment one did not. TensorFlow Serving executes exactly one artifact, the TensorFlow SavedModel, and no identifier existed for it, so a required field had nowhere to point and the record failed validation outright. The collection could not represent the first candidate that took its own stated boundary literally.

A second case had already been left unresolved. whisper.cpp is a dedicated speech-inference implementation that passes the substrate test cleanly — serving inference is unambiguously its purpose — yet it was screened without a decision because its modality made reviewers hesitate. Hesitation is the symptom of an unwritten rule.

Two readings were available. Either the collection is about language-model execution and should say so, or modality is not an eligibility criterion and the vocabulary must catch up. Leaving the question open meant candidates would keep being judged by an unwritten standard that the written one contradicts.

## Decision

Modality is not an eligibility criterion for the local-runtime collection.

A runtime that serves speech, vision, embedding, or tabular models is eligible on the same terms as one that serves language models. Eligibility is decided by ADR 015's purpose test and its exclusions, and by nothing about the kind of model executed.

Reviewed runtimes carry the `local_runtime` score profile unchanged. There is no separate profile, no modality-specific weighting, and no modality trait.

### The vocabulary obligation

Admitting a modality obliges the curator to extend the classification vocabulary for it in the same change.

This is the operative half of the decision. A taxonomy that enumerates no identifiers for a modality's formats or accelerators does not merely describe such a record poorly; it makes the record unreachable. Directory filters are taxonomy-driven, so a runtime whose formats have no identifiers cannot be found by anyone filtering on format, however well it is written up.

The distinction that matters when scoring:

- A runtime that supports one format **by design** is correctly scored low on format breadth. ADR 015 already states that a deliberately narrow runtime scores low on dimensions it never set out to address, and that this is the intended behavior.
- A runtime that appears to support one format **because the taxonomy enumerates none of the others it supports** is a measurement artifact. The score is wrong, and the fix is curation, not a new weighting.

TensorFlow Serving is the first case and was scored accordingly. It genuinely serves one artifact. The `saved_model` identifier was added so that the artifact could be named at all, not to raise its score.

### What this does not change

- **The substrate test stands.** PyTorch, TensorFlow, JAX, and Apache TVM remain excluded under ADR 015 because serving is not their purpose. Modality neutrality does not readmit a general framework through a side door, and a framework's dedicated serving product continues to qualify on its own terms.
- **The score profile and its weights are unchanged.** Accelerator and format breadth together carry 31% of the profile, and a runtime serving one modality with one format will read low beside a broad language-model engine. That is the profile working as intended, and classification filters remain the primary decision tool.
- **The other collections are untouched.** This record governs local runtimes only. Systems, inference services, and specifications keep their own boundaries.
- **No modality trait is added.** Runtime type, accelerators, and model formats already carry the information a reader needs, and a fourth axis would duplicate them.

## Consequences

- The collection's published set will look language-heavy for as long as demand is language-heavy. That is a fact about what people run, not about the boundary, and a candidate must not be rejected for serving a different modality.
- Every modality admitted brings a curation obligation. Reviewing the first speech or vision runtime means extending `runtime_model_formats`, and possibly `runtime_accelerators`, in the same change rather than stretching an existing identifier.
- Vocabulary extension should be deliberate rather than incremental once a class of records accumulates. `saved_model` was added for one record; if further classical machine-learning serving systems are reviewed, the format vocabulary is better extended in one pass than one identifier at a time.
- whisper.cpp and comparable dedicated speech or vision runtimes are now decidable on their merits under the ADR 015 purpose test. Neither their admission nor their rejection is settled here.
- Score comparisons across modalities inside the collection remain valid but require care in reading. A specialist serving one artifact type is not worse than a general engine; it is answering a different question, which is why ADR 015 keeps classification filters primary.
- ADR 015 is amended to point here rather than carrying the modality rule inline, so the boundary and the eligibility criterion are separately citable.
