# Lab curation

Use this guide for the organizations that develop the catalog's reviewed model releases. A lab record says what the organization is, where it is headquartered, how the catalog's other records name it, which systems it builds, where it publishes, and whether it publishes a frontier-safety framework. Everything else about the lab is joined from the collections that already record it. The boundary is [ADR 041](adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md); the fields are in [`DATA_MODEL.md`](DATA_MODEL.md#lab-record).

## Inclusion gate

Add an organization to `directory/labs.json` only when the catalog has reviewed a release it developed: one of its `catalog_names` must equal the `developer` of a record in `models.json`, and validation refuses a lab that fails this. Review the release first under [`MODELS.md`](MODELS.md), then record its developer.

Size, funding, frontier status, popularity, openness, nationality, and licence decide nothing. An organization with no reviewed release is not a lab here, however well known: a service operator that serves other developers' models, a company whose only releases are image, audio, or video generators, or a company with nothing released. It waits until one of its releases is reviewed.

A lab record never replaces a release record, and it never carries a conclusion that belongs to one. Licence, source model, distribution, and access score stay on each release ([ADR 025](adr/025-model-releases-are-independent-curated-records.md)).

## Naming: `catalog_names` and `systems`

`catalog_names` lists the exact strings the catalog's other records use for the organization: model `developer`, service `operator`, runtime `maintainer`, specification `stewards`, and pack `steward` values. Copy each string exactly, including legal-entity suffixes and non-Latin script. Include:

- the organization's own name as the catalog spells it;
- the units that develop its models (`Google DeepMind`, `Qwen`, `Cohere Labs`, `ByteDance Seed`);
- the units and entities that operate its model services (`Google Cloud`, `Alibaba Cloud`, a regional entity such as `Jingsheng Hengxing Technology Pte. Ltd. (Z.ai)`).

Leave out a separately branded subsidiary with its own product line, such as GitHub, unless it develops or serves the lab's models. Every name must match at least one record, and no name may belong to two labs. If a models.dev namespace holds releases under two developer strings, the lab must name both, because validation refuses a split namespace.

`systems` lists the `projects.json` ids of the systems the organization builds and ships, because a system record names no organization. List a system only when its own reviewed record, its URL, or its repository establishes the organization as its maker. A system built on the lab's models by someone else is not the lab's. Validation requires every published system whose repository sits in one of the lab's `github` channel organizations to be listed.

## Classification

- `lab_type`: `ai_company` when the organization's principal business is AI models and what it builds on them; `technology_company` when AI models are one line of a broader business (search, cloud, social media, devices, chips, commerce, software); `public_research` for a government-funded, academic, or nonprofit research organization. Judge the organization the record names, not its parent.
- `headquarters`: the country where the organization says it is headquartered or based, from its own pages or its regulatory filings; a national programme is based in the country that runs it. A self-description such as "a Chinese company" or "an American research lab" says where it is based. When it says neither but its terms, policies, or filings give one principal address for it, such as a principal place of business, a registered office, or its notice address, use that country. When a holding company is incorporated elsewhere, record where the organization says it is headquartered and put the incorporation in `organization_note`. When none of these gives one country (its pages list several offices, only regional headquarters, or no location at all), record `none_listed`, shown as "No headquarters listed", and name its governing legal entities and any regional headquarters in `organization_note`. Never pick one of several offices, and never use an offshore holding company's registration, a court or governing-law clause, where staff work, or where the founders are. Add a country to the taxonomy's `countries` group only in the change whose record needs it, in order of its name with `none_listed` last, since the Labs filter lists the group in that order.
- `parent_organization`: present only when first-party evidence names a parent, such as a holding company or a controlling entity. Omit it otherwise; never infer one from investment.
- `organization_note`: say how the catalog names relate, which unit develops the models, which operates the services, and what the parent is. Write it for this organization. A sentence that would fit any lab is not a review.

## Channels

`channels` lists the pages a reader watches to track the lab, each `{kind, url}`:

- `model_catalog`: the organization's own page listing its current models, usually in its API or product documentation;
- `release_notes`: its own changelog for its models or model API;
- `news`: its own news, blog, or research index where releases are announced;
- `github`: a GitHub organization it publishes code from, as `https://github.com/<org>`;
- `hugging_face`: a Hugging Face organization it publishes weights from, as `https://huggingface.co/<org>`.

Record only first-party pages and official organizations. An official GitHub or Hugging Face organization is one the lab links from its own pages, or one that already hosts a reviewed record of the lab's in this catalog. List organizations that publish the lab's AI work; a company-wide organization with thousands of unrelated repositories adds nothing a reader can watch, unless a reviewed record of the lab's, such as a system or a runtime, lives there.

## Safety framework

Record `safety_framework` when the organization publishes a frontier-safety, responsible-scaling, preparedness, or risk-management framework on its own pages or official document host. Use the title the organization gives it, the URL of the current version, and the date you read it. The field says that the organization publishes the framework. It never says whether the organization follows it, how strong it is, or how one framework compares with another. Omit the field when none is found. Its absence is not a finding that none exists, and the page says so.

## Evidence workflow

1. Confirm the inclusion gate: find the lab's reviewed releases in `models.json` and copy their `developer` strings.
2. Collect the other names from `inference-services.json`, `local-runtimes.json`, `specifications.json`, and `packs.json`, and the systems from `projects.json`, following the naming rules above.
3. Read the organization's own terms, privacy policy, imprint, or about page for its legal entity and headquarters, and its about or investor pages for its type and any parent. Cite each as dated `web` evidence, and open each page yourself with [`scripts/read_page.mjs`](OPERATIONS.md#reading-a-cited-page-directly): a search-engine extract is a lead, not a read, and a filing or annual report must be the named company's own document. The governing-terms page an inference-service record already cites is often the right source.
4. Read each channel page and the safety framework before recording it.
5. Write `description` as one sentence and `organization_note` as the organization's own structure.
6. Run synchronization, payload and share-page generation, validation, all tests, and the Labs browser checks in [`WEB.md`](WEB.md).

Labs are never scored, ranked, or sorted by anything but name. Funding, valuation, revenue, headcount, compute, leadership, benchmarks, and news are not fields.

## Current coverage

Forty labs cover all 303 reviewed releases. [`COVERAGE.md`](COVERAGE.md#labs) records how the two batches were chosen and read, and [`LAB_REREAD_2026-09-25.md`](LAB_REREAD_2026-09-25.md) records the direct re-read of every page they cite.
