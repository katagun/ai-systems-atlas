# Design: terms drift shows what changed, and anchors hash their section

**Date:** 2026-09-15
**Status:** Approved in brainstorming (part 2 of 2, option B); spec review waived by the maintainer

## Problem

Part 1 (#176) made terms-drift detection independent of the checkout. The flags themselves remain expensive to judge: the evidence-link checker stores only a hash of a page's normalized visible text, so a drift report says that a page changed and nothing about what changed. Reviewing the Claude Agent SDK flag in #170 needed the Wayback Machine, which could not recover the old wording. Anchored evidence URLs are also over-sensitive: `code.claude.com/docs/en/agent-sdk/overview#license-and-terms` hashes the whole overview page.

The backlog proposed hashing only a page's main content. The 2026-09-15 sample rejects that as a general rule.

## Measured facts (2026-09-15 sample of all 173 monitored terms URLs)

- 168 fetched; 5 fail for the checker as before (a gated Hugging Face file, two OpenAI and two Perplexity pages); 39 are raw GitHub or Hugging Face blobs; 125 are HTML.
- Of the 125 HTML pages, 88 have `<main>`, 27 `<article>`, 13 `role="main"`, and 35 none; 3 have more than one `<main>`.
- `<main>` is empty on all three Cohere pages and OpenRouter; their text is outside it. DeepInfra has no main landmark.
- Fetching each known-noisy page twice seconds apart produced identical whole-page hashes every time: the drift is page change over hours or days, not per-request randomness.
- Against the shared cache, 109 HTML pages still match their stored baseline; 16 already differ (12 without open drift).
- The one anchored URL's `license-and-terms` id exists on an `<h2>`.

## Non-goals

No generic main-content heuristic. No change to the hash of any non-anchored page. No change to when drift is accepted: a newer human review still accepts a changed hash. No catalog record, evidence, or human-owned date changes.

## Decisions

### 1. The cache keeps the text behind every terms hash

A terms entry stores the normalized text its hash was computed from: `terms_text` beside `terms_sha256`, and `observed_terms_text` beside `observed_terms_sha256` while drift is open. Acceptance moves the observed text to the baseline. The text is the same normalized content that is hashed, so storing it changes no hash. Content that is not valid UTF-8 text stores no text.

### 2. Drift reports show a bounded diff

The normalized text is one whitespace-collapsed line, so the diff compares sentence-sized segments (split after `.`, `!`, `?`, `;`, or `:` followed by a space). A drift error is followed by up to 12 changed segments, each prefixed `-` or `+` and truncated to 240 characters, and a count of any further changes. With no stored baseline text the report says so. `--show-drift` prints the same diffs for every open drift entry straight from the cache, without fetching.

### 3. An anchored URL hashes its section

When a monitored URL has a fragment, or appears in the checker-owned `TERMS_SECTION_IDS` map (URL → element id, empty at introduction and extended only after a stored diff shows churn outside the terms), the checker hashes only that section:

- an element whose id matches and which is a heading `h1`–`h6`: its text plus everything after it up to the next heading of the same or a higher level;
- any other element with that id: the text inside it;
- script, style, template, svg, and noscript content never counts.

The entry records `terms_hash_scope: "section"`. If the id is not on the page, the checker hashes the whole page, records `terms_hash_scope: "page"`, and warns `terms anchor not found`.

### 4. Existing baselines migrate without silent acceptance

- A legacy entry with no stored text whose current hash equals its baseline gains `terms_text` silently.
- A legacy entry whose hash differs stays drift as today; its report says no baseline text was stored.
- An anchored URL whose entry has no section scope adopts the section hash and text silently only when the current page's whole-page hash equals the stored baseline; otherwise it is drift until a newer human review accepts the section hash.

## Implementation

- **`scripts/check_evidence_links.py`:** stdlib `_SectionText(HTMLParser)` and `section_text(body, element_id)`; `terms_content(body, content_type, url) -> TermsContent(text, sha256, scope)` wrapping `normalized_content`; `TERMS_SECTION_IDS`; `drift_diff(before, after)`; the monitor branch of `check_targets` storing and migrating text and scope, and attaching diffs to `CheckSummary.drift_details`; CLI printing details after errors and `--show-drift`.
- **`tests/test_evidence_links.py`:** tests for each decision.
- **`docs/OPERATIONS.md`:** "Evidence links and terms drift" covers stored text, diffs, `--show-drift`, section hashing, the override map, and migration.
- **`BACKLOG.md`:** remove the part-2 item.

## Testing

- Section extraction: heading section stops at the next same-or-higher heading and keeps lower headings; container section keeps its subtree; skipped tags excluded; missing id returns none.
- Anchored hashing records section scope; a missing anchor warns and hashes the page.
- Baseline and drift store their text; acceptance moves observed text to the baseline.
- Legacy backfill on an unchanged hash; legacy drift reports missing baseline text.
- Anchored migration: silent when the page hash still matches the old baseline, drift otherwise.
- Diff: changed segments only, bounded count, truncation, and the no-baseline-text message.
- `--show-drift` prints stored diffs without calling the fetcher.
