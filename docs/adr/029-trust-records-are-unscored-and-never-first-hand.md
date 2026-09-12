# ADR 029: Trust records are unscored and never first-hand

- Status: Accepted
- Date: 2026-09-11

## Context

An inference-service record states what an operator promises: retention, training use, residency, routing. It has nowhere to state whether the operator publishes a way to verify a response, names who receives plaintext, documents how customer keys are stored, isolates caches, or has been examined by anyone. An API router terminates the client's TLS session and opens its own upstream session, so it holds every prompt, tool definition, tool-call argument, and credential in plaintext.

"Your Agent Is Mine" (arXiv 2604.08407, 2026-04-09) measured 428 grey-market routers and found nine rewriting tool calls in responses and seventeen using planted cloud credentials. None of the 428 is an Atlas-listed service; the paper names OpenRouter once, for scale. The one third-party finding that names an Atlas record is CacheProbe (arXiv 2605.30613, 2026-05-28), on OpenRouter cache isolation.

[ADR 022](022-general-pattern-content-is-not-a-collection.md) characterises every collection as pinning each record's evidence to one steward's own artifact. A researcher's paper about a service is not that.

## Decision

### The block is unscored

An optional `trust` block on an inference-service record never enters `score` or `overall`, is not a dimension, and is never summed, ranked, or sorted on. ADR 012's profile is unchanged. It renders under an explicit unscored label.

### Statuses record documentation, not behaviour

Each of six properties — response integrity, upstream disclosure, credential handling, cache isolation, vulnerability disclosure, independent audit — carries one of `documented_yes`, `documented_no`, `undocumented`, from `directory/taxonomy.json`. `documented_yes` means the operator publishes a statement establishing the property; `documented_no` means it publishes one denying it or stating it does not apply; `undocumented` means no first-party statement was found on the review date. A required prose `note` carries every exception, and the `url` is first-party, public, and scoped to the named service. The tri-state is therefore exempt from the prose-only rule in `docs/DATA_MODEL.md` for operational constraints: it compresses no capability, only whether a document exists.

### Findings are third-party, dated, pinned, and bounded

A finding is admissible when its source names the service, states a repeatable method or an operator-acknowledged incident, carries a date, and can be pinned by content hash in an immutable form where one exists. Preprints, papers, CVE and advisory records, and first-party disclosures can qualify. News, social posts, and summaries of others' work are pointers in the sense of [ADR 028](028-attention-sources-are-pointers-not-claims.md), followed to their source and never recorded themselves. A finding holds the claim in the source's words and nothing the source does not say; editorial judgement goes in `tradeoffs`. Findings are never deleted; they are closed with a dated resolution source.

This is the first third-party-authored evidence on a published endpoint. ADR 022's characterisation is amended: every collection pins evidence to a steward's own artifact, except that an inference-service trust record may additionally carry a pinned third-party finding under the four conditions above. The finding's source kind is `third_party`.

### A finding is a review trigger, never a score input

When a finding bears on a scored dimension, the reviewer re-reads that dimension against the operator's own evidence and the finding, and advances the record's `verified_at`, as `docs/CURATION.md` treats a license mismatch or a changed terms page. The score changes only through that human review.

### The block is human-owned and present only after review

Automation never adds, edits, or removes the block. Absent means unexamined, and the app says so. An empty findings list on a reviewed record renders as "no admissible finding recorded" with the statement that absence is not evidence of safety; it never renders as clean.

### The Atlas records no first-hand measurement as a finding

The Atlas sends no canary requests. A reviewer may verify an operator's published mechanism by hand, as the TrustedRouter review verified an attestation, and may say so in `strengths`; that is a review of a first-party claim, not a finding.

### Trust URLs are link-checked and never drift-hashed

`scripts/check_evidence_links.py` checks every property and finding URL as a link; a `404` fails the weekly refresh like any reviewed link. No trust URL receives a terms baseline, because the Atlas cannot accept a change to a page it does not steward.

## Consequences

- `directory/inference-services.json` records gain an optional `trust` field; `directory/taxonomy.json` gains `trust_property_statuses`.
- The published endpoint's shape changes by that optional field, deliberately, under [ADR 026](026-app-payloads-are-a-projection-of-the-published-endpoints.md); `skills/ai-systems-atlas/reference.md` documents it.
- Share pages are unchanged. The detail dialog and the inference comparison render the block with an unscored label.
- The first review batch is the twelve routing aggregators, because an aggregator has upstreams to disclose, accepts or shares credentials, and can pool caches, and because the only admissible finding names one of them. The order does not rest on the grey-market paper.
