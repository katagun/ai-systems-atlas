# Design: unscored trust records on inference services

**Date:** 2026-09-11
**Status:** Approved; implemented on branch claude/llm-router-security-1c0ef4

## Problem

Every inference-service record answers what an operator promises: retention, training use, residency, routing. None answers what an operator can do with the traffic it holds, or whether anyone has looked. An API router terminates the client's TLS session and opens its own upstream one, so it holds every prompt, tool definition, tool-call argument, and credential in plaintext. A paper published on 2026-04-09, "Your Agent Is Mine" (arXiv 2604.08407), measured 428 grey-market routers bought on Taobao, Xianyu, and Shopify storefronts or scraped from community lists, and found nine rewriting tool calls in responses, seventeen using planted cloud credentials, and one draining a test wallet. Two gated the injection on triggers such as "after fifty prior calls" or "only in YOLO mode".

None of the 428 is an Atlas-listed service. The paper names OpenRouter once, as the largest public routing platform, for scale only. What the paper establishes is a threat model that every one of the 59 records sits inside, and one class-level fact: no provider it examined offers end-to-end integrity for a tool call between client and upstream model. The one third-party finding that names an Atlas record is CacheProbe (arXiv 2605.30613, 2026-05-28), which asks whether OpenRouter's shared upstream credentials pool prompt caches across its customers.

A reader choosing a service today cannot see, on the record, whether the operator signs responses, names who receives plaintext, documents how customer keys are stored, isolates caches, publishes a disclosure route, or has been examined by anyone. The record has nowhere to put a dated third-party finding, and the collection rule at `docs/adr/022-general-pattern-content-is-not-a-collection.md:17` says every collection pins evidence to one steward's own artifact, which a researcher's paper is not.

## Non-goals

This design does not score anything. It changes no weight, dimension, anchor, or `overall` in `docs/INFERENCE_SERVICES.md` and leaves ADR 012 untouched. It runs no probes: the Atlas sends no canary requests and records no first-hand measurement as a finding. It adds no record and reopens no boundary: self-hosted gateways such as LiteLLM stay excluded under ADR 015 and the settled Later item in `BACKLOG.md`, and no grey-market router becomes a candidate. It does not touch share pages, whose content model `docs/WEB.md:77` fixes as identity, licensing, and status facts. It does not re-review the 59 records; a record without the block is unexamined, and says so.

## Measured facts

- **The paper's population is disjoint from the collection.** Of the services it names, OpenRouter appears for scale, LiteLLM as the dominant open-source router, and Bedrock and Azure OpenAI as cloud-managed routers. None of the 428 measured endpoints is identified, and the authors publish no list. Batch order therefore cannot rest on the paper.
- **Existing prose already carries four of the six properties for some records.** Cerebras: "prompt caches are ephemeral". Requesty: "logs are encrypted". Nano-GPT: "a broad set of upstream partners is named in the privacy policy". TrustedRouter: "No third-party audit exists". A bare status beside that prose would record one fact twice with two dates, which is the reason `docs/DATA_MODEL.md:155` keeps operational constraints as prose.
- **One published record already rests on a first-hand check.** TrustedRouter's strengths state that its attestation "names an image digest matching the published one, and binds the connection's own certificate", which a reviewer verified by hand. The ADR therefore cannot say the Atlas never checks anything, only that it records no first-hand measurement as a finding.
- **The validator rejects unknown service fields.** `scripts/validate_directory.py:967` requires exact set equality with `INFERENCE_SERVICE_REQUIRED`; there is no `INFERENCE_SERVICE_OPTIONAL`. Precedent for an optional human-owned block on a published record exists at `PROJECT_OPTIONAL` (`provider_relationship`, `model_backends`), where `docs/CURATION.md:29` reads absence as "not reviewed".
- **Published evidence carries no content hash.** `scripts/validate_directory.py:847` fixes service evidence to `{kind, label, url, verified_at}`. The pinned `{label, url, kind, content_sha256, fetched_at}` shape exists only on unpublished queues, and ADR 024 says so at line 27. Adding it to a published endpoint is a deliberate shape change under ADR 026 and must update `skills/ai-systems-atlas/reference.md` in the same change per `docs/AGENT_DOCS.md:18`.
- **The weekly checker hashes only `web_terms`.** `scripts/check_evidence_links.py:138` monitors drift for that kind alone; every other kind is link-checked. A `404` fails the refresh (`docs/OPERATIONS.md:79`), and the refresh is already failing on twenty-four such links (`BACKLOG.md:9`).
- **The comparison table is enumerated.** `docs/WEB.md:72` lists the inference rows, `web/app.js:1748` heads the table with the score-profile note, and `docs/adr/014-comparisons-are-scoped-to-one-score-profile.md:33` requires web tests to cover collection-specific rows.

## Decisions

### 1. A trust record is unscored and stays unscored

The block never enters `score` or `overall`, is not a dimension, and is never summed, ranked, or sorted on. It renders under its own heading with an explicit unscored label, in the detail dialog and the comparison table. A reader weighs it the way specification maturity is shown and never ranked.

### 2. A trust record is present only after a human review

`trust` is optional on a service record. Absent means the service has not been examined for these properties, and the app renders "not yet examined". Present means a human reviewed every property on the stated dates. Automation never adds, edits, or removes the block; the weekly refresh treats it as human-owned exactly as it treats scores and prose.

### 3. Six properties, each a fact about documentation, not about behaviour

Each property records whether the operator publishes a statement, with the exceptions in prose:

| Property | What `documented_yes` means |
|---|---|
| `response_integrity` | The operator publishes a mechanism by which a client can verify a response, including a tool call, arrived from the upstream model unaltered: a signature, an attestation, or an equivalent. |
| `upstream_disclosure` | The operator names the parties that receive request plaintext. For a direct API that is the operator alone; for an aggregator or platform it is the upstream list or subprocessor list. |
| `credential_handling` | For a service that accepts customer-supplied upstream keys, the operator documents how they are stored and whether they are encrypted at rest. For a service whose documentation offers no customer-supplied-key path, the status is `documented_no`, and the note cites the documented request path that shows the feature is absent. |
| `cache_isolation` | The operator documents whether prompt caching is scoped per customer or pooled behind shared upstream credentials. |
| `vulnerability_disclosure` | A public security contact or disclosure policy exists for the named service. |
| `independent_audit` | A SOC 2, ISO 27001, or equivalent attestation is published for the named service. Recorded as an operator claim; the Atlas does not read or judge the report. |

`status` is one of `documented_yes`, `documented_no`, and `undocumented`. `documented_yes` means the operator publishes a statement establishing the property; `documented_no` means the operator publishes a statement denying it or stating it does not apply; `undocumented` means no first-party statement was found on the review date. The tri-state therefore never compresses a capability into a boolean: it says whether a document exists, and the required `note` carries every exception, per-plan variation, and per-endpoint limit in prose. This is why the block is exempt from the prose-only rule at `docs/DATA_MODEL.md:155`, and the data model says so.

Each property carries a `url` that must be first-party and public: gated portals and sign-in-walled trust centres are ineligible. The `url` must be scoped to the named service, and `scope` states that, the way license evidence does at `docs/DATA_MODEL.md:76`. A company-wide SOC 2 page that does not name the service earns `undocumented` with a note, not `documented_yes`. Every property carries its own `verified_at`.

Where existing prose already states the fact, the prose stays where it is and the property cites the same source; the two are not contradictory because the property records only that the statement exists. A review that finds the prose and the source disagree is a review of the prose.

### 4. Findings are third-party, dated, pinned, and bounded

A finding is a claim someone else made about this named service. It is admissible when all four hold:

1. the source names the service, not the operator's company, a product class, or an unidentified endpoint;
2. the source states a method a reader could repeat, or describes an incident the operator has acknowledged;
3. the source carries a publication date; and
4. the source can be pinned: a version-specific arXiv URL, a CVE or GHSA record, a DOI, or a first-party disclosure page, with its content hash taken at review.

Preprints, published papers, CVE and advisory records, and disclosure write-ups by the researcher or the operator can qualify. News coverage, social posts, aggregator summaries, and secondary write-ups of someone else's work never do: they are pointers, in the sense ADR 028 gives the word, and a pointer is followed to its source, which is then tested against the four conditions. "Your Agent Is Mine" fails condition 1 for every Atlas record and is never a finding on any of them. CacheProbe passes all four for OpenRouter.

A finding holds the claim in the source's own words, bounded to what the source establishes about this service, the pinned source, and its `published_at` date. It may carry the operator's published response, dated. It is never deleted. When the issue is resolved, the finding carries a dated `resolved` source and renders as closed, so the record keeps its history. A finding says nothing the source does not say; a reviewer who wants to add a conclusion writes it in `tradeoffs`, where editorial judgement lives.

An empty `findings` list on a reviewed record means "reviewed on this date, no admissible finding recorded". It never renders as clean, and the rendered text says so.

### 5. A finding is a review trigger for any dimension it bears on

ADR 012 requires every dimension to be supported by dated authoritative evidence and lowers a dimension when public evidence is missing. A finding that bears on a scored dimension, such as a cache-isolation finding on data governance, does not change the score by itself and does not enter it. It obliges the reviewer to re-read the affected dimension against the operator's own evidence and the finding, and to advance that record's `verified_at`, exactly as `docs/CURATION.md:96` treats a license mismatch and `:98` treats a changed terms page: a review trigger, never a new conclusion. The ADR states this so the unscored block and the scored profile cannot be read as contradicting each other.

### 6. Trust evidence is a new published evidence kind

The finding source uses a new kind, `third_party`, with the pinned shape `{label, url, kind, content_sha256, fetched_at}`. Property evidence uses the existing `web` kind with a `scope`. `docs/DATA_MODEL.md` documents both under the inference-service record, ADR 029 records that this is the first third-party-authored evidence on a published endpoint and amends the characterisation at ADR 022 line 17 accordingly, and `skills/ai-systems-atlas/reference.md` gains the field in the same change.

### 7. The weekly checker link-checks trust URLs and hashes none of them

`scripts/check_evidence_links.py` adds property `url`s and finding `url`s to its target set as ordinary links: a `404` or `410` fails the refresh, as it does for every other reviewed link. It does not drift-hash finding pages, because the Atlas cannot accept a change to a page it does not steward, and the acceptance rule at `docs/CURATION.md:102` would force every record sharing a paper's URL to advance its date to clear one drift. The pinned `content_sha256` is a review-time record of what the reviewer read, on the model of the triage block, and is compared to nothing weekly. Immutable source forms in decision 4 keep the `404` budget small; a finding whose pinned source vanishes needs a human anyway.

### 8. Rendering: detail dialog and comparison, not share pages

The service detail dialog gains one block, "Trust record · unscored", after "Routing and customization" and before "Strengths". It renders the six properties as a table with status, note, and a dated link, then the findings as a list with claim, source, date, operator response, and closure. Absent block: one line, "Not yet examined for trust properties." Present with no findings: "Reviewed on {date}; no admissible third-party finding recorded. Absence of a finding is not evidence of safety."

The inference-service comparison gains six rows, one per property, each cell showing the status word and the note on hover, under a row heading that carries the unscored label inside the table. A record without the block shows "not examined" in every cell. No findings row: findings are prose and belong in the dialog.

Share pages are unchanged. The block lives in the detail payload under `web/app/detail/inference/`, which the complement rule at `scripts/build_web_payload.py:193` already produces; nothing is added to `BOOT_FIELDS` or `SEARCH_FIELDS`. The seven published endpoints change shape only by the optional field.

### 9. Batch order rests on the collection's own mechanics

The first review batch is the twelve `routing_aggregator` records, because an aggregator has upstreams to disclose, accepts or shares credentials, and can pool caches, so five of the six properties are live questions for it, and because the only admissible finding names one of them. The order does not rest on the grey-market paper, and the ADR says so: no Atlas record is implicated by it, and `docs/INFERENCE_SERVICES.md:50` forbids substituting an adjacent product's controls for the reviewed service's. The remaining 47 follow in batches by service type.

### 10. Record shape

```json
"trust": {
  "verified_at": "2026-09-18",
  "properties": {
    "response_integrity": {
      "status": "undocumented",
      "note": "No signing or attestation of responses is documented for the API.",
      "url": "https://openrouter.ai/docs/",
      "scope": "OpenRouter API documentation, reviewed for response signing or attestation",
      "verified_at": "2026-09-18"
    },
    "upstream_disclosure": { "status": "documented_yes", "note": "...", "url": "...", "scope": "...", "verified_at": "..." },
    "credential_handling": { "status": "documented_no", "note": "...", "url": "...", "scope": "...", "verified_at": "..." },
    "cache_isolation":     { "status": "undocumented",  "note": "...", "url": "...", "scope": "...", "verified_at": "..." },
    "vulnerability_disclosure": { "status": "documented_yes", "note": "...", "url": "...", "scope": "...", "verified_at": "..." },
    "independent_audit":   { "status": "undocumented",  "note": "...", "url": "...", "scope": "...", "verified_at": "..." }
  },
  "findings": [
    {
      "claim": "Routing through OpenRouter with shared organizational credentials may create global cache sharing across all OpenRouter users.",
      "published_at": "2026-05-28",
      "source": {
        "label": "CacheProbe: Auditing Prompt Cache Isolation in Gateway APIs, arXiv 2605.30613v1",
        "url": "https://arxiv.org/abs/2605.30613v1",
        "kind": "third_party",
        "content_sha256": "<hash of the fetched page at review>",
        "fetched_at": "2026-09-18"
      },
      "operator_response": null,
      "resolved": null
    }
  ]
}
```

`operator_response` and `resolved`, when present, are `{url, verified_at, summary}` with a first-party `url`.

### 11. Validator rules

- `INFERENCE_SERVICE_OPTIONAL = {"trust"}`; the exact-set check at `scripts/validate_directory.py:967` becomes required-subset plus optional-superset, matching the project and runtime checks.
- `trust` has exactly `verified_at`, `properties`, and `findings`.
- `properties` has exactly the six keys, each with exactly `status`, `note`, `url`, `scope`, and `verified_at`; `status` is one of the three values, which live in `directory/taxonomy.json` as `trust_property_statuses` so the app and validator read one list; `note` and `scope` are non-empty; `url` passes the shared URL validator and is `https`.
- `findings` is a list; each finding has exactly `claim`, `published_at`, `source`, `operator_response`, and `resolved`; `claim` is non-empty; `source.kind` is `third_party`; `source.content_sha256` is sixty-four lowercase hex characters; `source.fetched_at` and `published_at` are ISO dates; `operator_response` and `resolved` are `null` or `{url, verified_at, summary}`.
- Every date in the block is not after the record's `trust.verified_at`, and `trust.verified_at` is not after the collection `verified_at`.
- Automation guard: `scripts/update_directory.py`'s human-owned field list gains `trust`, so a refresh that touches it fails the existing editorial-field test.

### 12. Documentation

- `docs/adr/029-trust-records-are-unscored-and-never-first-hand.md`: unscored; present only after human review; findings are third-party, dated, pinned, bounded, never deleted; a finding is a review trigger for the dimension it bears on; the Atlas records no first-hand measurement as a finding; amends ADR 022's characterisation of published evidence.
- `docs/INFERENCE_SERVICES.md`: a "Trust record" section after "Evidence and freshness" with the six property definitions, the tri-state meaning, the four admissibility conditions, and the review trigger.
- `docs/DATA_MODEL.md`: the block under "Inference service record", including why the tri-state is exempt from the prose-only rule.
- `docs/WEB.md`: the new detail block and the six comparison rows at line 72, and the browser checklist at line 171.
- `docs/OPERATIONS.md`: trust URLs in the link-check target set, never drift-hashed.
- `AGENTS.md`: one hard rule: "Trust records are unscored, present only after human review, and carry third-party findings only as dated, pinned, bounded claims; never render an empty findings list as clean."
- `skills/ai-systems-atlas/reference.md`: the optional field and its shape.

## Implementation phases

1. **Taxonomy, validator, data model.** Add `trust_property_statuses` to the taxonomy, the optional field and its strict rules to the validator, the human-owned guard to the updater, and the documentation. Failing tests first for every rule in decision 11.
2. **Evidence checking.** Extend `scripts/check_evidence_links.py` to collect trust URLs as plain link targets; test that a `third_party` source is never drift-monitored and that a trust `404` fails.
3. **Rendering.** Detail block, comparison rows, and the three empty states in `web/app.js`; unit tests in `tests/test_web.js`; an end-to-end case that opens a service with a block, one without, and a comparison mixing both, asserting the unscored label and no `undefined`.
4. **ADR and prose.** ADR 029 and the document changes in decision 12.
5. **First batch.** Review the twelve aggregators: properties from first-party pages, the CacheProbe finding on OpenRouter with its hash taken at review. Regenerate payloads and share pages; run the checker with `--max-age-hours 0`.

Phases 1 to 4 are one pull request with no record changes. Phase 5 is a curation pull request.

## Verification

Every command in `AGENTS.md`, plus: the validator rejects each malformed shape in decision 11 with a specific message; a refresh run against a fixture that edits `trust` fails the editorial-field guard; the checker run over the twelve reviewed records reports the new targets and no drift baselines for them; and in a browser, the OpenRouter dialog shows the block with one finding, a direct-API record shows "not yet examined", and a comparison of the two shows six rows with the unscored label and "not examined" cells.

## Risks and open questions

- **Reviewer effort.** Six properties with scoped first-party URLs is a real review per record, on the order of the original service review. The twelve-record first batch measures it before the other 47 are scheduled.
- **`404` budget.** Researcher pages rot. Decision 4's immutable-form requirement is the mitigation; if finding links start failing the refresh at a rate the backlog cannot absorb, the ADR's successor is a dedicated archival step at review time, not a weaker check.
- **`documented_no` versus `undocumented` is a judgement.** A privacy policy that never mentions caching is `undocumented`; one that says caches are not isolated is `documented_no`. The note must quote the sentence that decided it, and `docs/INFERENCE_SERVICES.md` says so.
- **Reader expectation of LiteLLM.** The strongest real-world incidents in this area are about self-hosted gateway software the Atlas excludes. The trust block's dialog text does not mention them; the explanatory place for that boundary is `docs/INFERENCE_SERVICES.md` and, if it earns one, a blog post, not a record.
