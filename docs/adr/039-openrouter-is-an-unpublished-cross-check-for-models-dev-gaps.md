# ADR 039: OpenRouter is an unpublished cross-check for models.dev gaps

- Status: Accepted
- Date: 2026-09-24

## Context

models.dev is the only automated model source ([ADR 025](025-model-releases-are-independent-curated-records.md), [ADR 027](027-complete-models-dev-source-catalog-is-published.md)). It has gaps: [ADR 038](038-reviewed-models-may-precede-their-models-dev-source-row.md) exists because Claude Mythos 5.1 and Jev 1.13 were missing from it, and each gap was found only because a reviewer happened to notice.

OpenRouter publishes `GET https://openrouter.ai/api/v1/models`, a JSON list of the models it routes. It answers without a key and is documented in OpenRouter's own OpenAPI description as `getModels`, which its SDKs wrap as `models.list`. With no query parameters it returns the complete list of models that output text: 446 rows on 2026-09-20. It is not a superset of models.dev, since it carried no Jev entry that day, so it can complement models.dev but not replace it.

A row names an OpenRouter route, not necessarily a release. Variant suffixes (`:free`, `:thinking`) are pricing or routing tiers of one route. Rows whose ID starts with `~` are moving aliases, and OpenRouter marks them with `alias_target`. OpenRouter's own namespaces name no developer: `openrouter/` holds its routers, and `stealth/` holds the cloaked models of its stealth program, listed under code names before a developer is named. Rows also carry prices, third-party benchmark rankings, sort orders derived from latency and throughput, a description, and provider-specific limits. None of these fields can inform an Atlas conclusion, and [`MODELS.md`](../MODELS.md) already refuses an aggregator listing as host documentation.

The terms of use are the open question. The page at `https://openrouter.ai/terms` was revised in July 2026 and could not be loaded from the environment that drafted this decision. Search-engine summaries of it report a clause against using scripts, crawlers, or other automated technology to scrape or copy information on the site or the services. The reasonable reading is that the clause targets scraping, not calls to a documented public API. Keeping a list of identifiers in a public repository is closer to copying, though. The maintainer read the terms on 2026-09-24, found this use permitted, and recorded that date as `terms_reviewed_at`. The OpenRouter inference-service record already watches that page for drift through its `terms.url`.

## Decision

Import OpenRouter's public model list as a second automated discovery source whose only output is **leads**: releases that output text, that OpenRouter lists, and that Atlas does not yet represent. A lead points a reviewer at the ADR 038 `init-gap` path. It is not a source row, a queue candidate, `source_metadata`, or evidence, and nothing derived from OpenRouter is published: both files below stay out of `PUBLISHED_DATA`, and validation rejects a copy of either in `web/`.

- **What is fetched.** Each run sends one unauthenticated GET to the fixed URL, over HTTPS, to `openrouter.ai` only. Redirects are refused and the body is capped at 8 MiB. The importer never requests the site's HTML pages, never uses an API key, and never sends OpenRouter's app-attribution headers.
- **What is kept.** For each lead only, and nothing else: the OpenRouter ID without its variant suffix, the canonical slug, the display name, the Hugging Face ID, and the listing date taken from `created`, plus Atlas's own `discovered_at` and `last_seen_at`. Rows Atlas already represents are counted and dropped. Descriptions, prices, benchmarks, rankings, latency, throughput, provider endpoints, supported parameters, and limits never reach the output.
- **Pinning.** `directory/openrouter-model-leads.json` records the endpoint, the fetch date, the SHA-256 of the exact response body, and the listed and eligible counts. A live API has no commit to cite, so the hash identifies what was seen and the date bounds it, the way triage evidence pins a web page. The file names OpenRouter and its terms URL as its source.
- **Fail closed.** The import refuses fewer than 100 or more than 20,000 rows. When `total_count` and `links.next` are present, `total_count` must equal the row count and `links.next` must be null. Row fields must have the expected types, and a drop of more than 20% in the eligible count from the previous import aborts. The file is replaced only after every check passes.
- **Mechanical exclusions** apply only where OpenRouter states the fact itself. A variant folds into its base route, and rows marked as aliases or without text output are skipped. OpenRouter's own `openrouter/` and `stealth/` namespaces are skipped because their routers and cloaked models name no developer, so they cannot pass the identity gate. Every other identity judgment, such as `-latest` names, fine-tunes, and dated snapshots, stays with a reviewer.
- **Represented rows.** A row produces no lead when any of these holds:
  - its ID or canonical slug derives the stable ID of a models.dev row or a reviewed record. The author segment is first translated to models.dev's provider directory for the few publishers whose names differ, such as `qwen` to `alibaba`;
  - its Hugging Face ID matches one of the release's own links: a models.dev row's source or weight links, or a reviewed record's page or source metadata. Evidence is not read for this test, because it also cites base models and quantizations;
  - a models.dev row or a reviewed record links to its OpenRouter model page. Reviewed records cite that page only as hosting evidence for the exact model.

  Each test is an exact-key match. The importer never infers that two differently named routes are one release.
- **Human decisions.** `directory/openrouter-model-dispositions.json` holds `held` and `excluded` decisions keyed by OpenRouter ID, each with a reason and a date. `excluded` covers routes that are not reviewable releases, and routes that are the same release as a models.dev row or reviewed record under another name; the reason names that row or record. The importer filters dispositioned IDs, and validation keeps leads and dispositions disjoint.
- **Terms gate.** The importer makes no request until a maintainer has read the live terms and recorded `terms_reviewed_at` in the dispositions file. Until then it reports that it skipped. With the date back at `null`, it clears any stored leads without fetching. Validation rejects a fetched leads file when no terms review is recorded. When the terms-drift check reports a change to the terms page, the maintainer re-reads it before the next import. If a reading of the terms forbids this use, the importer and both files are removed.
- **Scheduling.** The local weekly refresh runs the importer after the models.dev import, so matching sees the fresh snapshot. A failed import leaves the leads unchanged and is reported in the refresh pull request; it does not stop the rest of the refresh. No GitHub Action runs it.

## Consequences

- A gap in models.dev becomes a reviewable line in the weekly refresh diff instead of something a reviewer must happen to notice.
- The published site, its JSON API, and `llms.txt` do not change. Readers see no OpenRouter data, so no published surface needs OpenRouter attribution.
- The first import will produce a large batch of leads. Triage is human work, as it is for the models.dev queue, and each lead ends in a review, a disposition, or a models.dev row that later represents it.
- An OpenRouter listing stays inadmissible as host evidence, and a reviewer still needs the developer's own documentation. The Hugging Face ID often leads there.
- The author-alias table is maintained in the importer. A missing alias costs a spurious lead, never a hidden one.
- A release that neither source lists stays invisible. A release that models.dev omits still cannot be dispositioned in `model-dispositions.json`; an OpenRouter disposition only silences its lead.
- The providers endpoint, `/api/v1/providers`, was the backlog's second proposed use, as a source of review leads for inference-service and trust records. It is out of scope here and stays in `BACKLOG.md`.
