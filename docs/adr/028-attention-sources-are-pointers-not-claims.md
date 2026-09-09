# ADR 028: Attention sources are pointers, not claims

- Status: Accepted
- Date: 2026-09-09

## Context

`directory/discovery-sources.json` holds eight first-party vendor feeds. `scripts/discovery_sources.py:10` fixes their field set and line 72 enforces it exactly, and `scripts/update_directory.py:393` keeps a feed item only when its link host appears in that source's `item_hosts`. The registry is built on one invariant: a candidate URL is the vendor's own announcement.

Hacker News does not satisfy it. Its links point off-host, chosen daily by anonymous submitters, so configured as an official source it yields zero candidates.

Measured on 2026-09-09, the deterministic classifier cannot substitute for that invariant either. `classify()` scores "Mercury 2.5" at 0.00 and "Desert Ant Labs: local, fast models that run on device" at 0.00 on their titles, and when run over fetched page text it returns `ai_knowledge_app` at 0.78 — above the 0.75 acceptance floor — for an article about building a printer and a blog post about building a wall lamp.

## Decision

An attention source is a source that reports what people looked at. Its submissions are pointers to evidence, never evidence themselves.

### Attention metadata never reaches a conclusion

Points, comment counts, submission time and submitter are recorded as provenance. They may gate whether a story is fetched at all, and they may never appear in, or be derived into, any classification, trait, score, or editorial field. `directory/hn-signals.json` carries no classification field for any writer, automated or human.

### The linked page is the evidence

`docs/OPERATIONS.md` and `docs/DATA_MODEL.md` state that discovery never fetches linked article pages. That claim is hereby scoped to the official-feed updater, which still never does. An attention source must fetch the linked page, because the submission itself asserts nothing. Those fetches use the hardened arbitrary-host path in `scripts/build_candidate_evidence.py` — validated public-unicast endpoints, port 443, pinned addresses against DNS rebinding, bounded reads.

### Page text is data, never instruction

Anyone may submit any URL. Every fetched page is attacker-influenceable input. The routine treats page content as data and never follows instructions found in it; the `finish` guards make that enforceable rather than aspirational, by bounding which file, which block, and which words the routine may write.

### Promotion stays a human act

A signal is not a candidate. Moving one into `directory/candidates.json` follows the review workflow in `docs/CURATION.md`. Automation may collect and sort; only a human may accept.

## Consequences

- `directory/hn-signals.json` is a new unpublished queue with its own provenance envelope, on the `model-candidates.json` pattern.
- `docs/OPERATIONS.md` and `docs/DATA_MODEL.md` scope their never-fetches claims to official discovery.
- `docs/CURATION.md` records that an attention source proposes no family or role.
- The candidate queue gains no new writer; `scripts/run_candidate_triage.py`'s guarantee that only discovery adds to it is untouched.
