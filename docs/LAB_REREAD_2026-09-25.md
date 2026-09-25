# Lab page re-read, 2026-09-25

**Status: corrections landing in batches.** Every page that `directory/labs.json` cites was read directly on 2026-09-25, and every claim was checked against the saved text.

- **Batch 1, applied: wrong and dead sources.** Covers Meituan, xAI, ByteDance, IBM, OpenBMB, Trendyol, and Perplexity. These records are re-dated to 2026-09-25.
- **Batch 2, applied: headquarters and legal-entity fixes.**
  - Thinking Machines Lab and Vivgrid move to `us`.
  - Covers Ant Group, DeepSeek, Arcee AI, Aikido Security, Mistral AI, MiniMax, Writer, and Cohere.
  - [`LABS.md`](LABS.md) now says that a self-description such as "a Chinese company" says where an organization is based.
  - These records are re-dated to 2026-09-25.
- **Batch 3, applied: labels, notes, and moved channels.**
  - Covers Anthropic, Mixedbread, the Swiss AI Initiative, Ornith AI, AI Singapore, Poolside, Amazon, Tencent, StepFun, TypeSafe AI, Upstage, Meta, Google, Xiaomi, and Motif Technologies, plus Microsoft's news channel.
  - Re-dates the records confirmed without change: AI21 Labs, Alibaba, NVIDIA, and OpenAI.
- **Still to apply:**
  - Moonshot AI, Z.ai, and Vispark, whose headquarters need a page with an address;
  - Microsoft's entity and address;
  - Amazon's model-catalog channel. This file and [`lab-reread-2026-09-25/`](lab-reread-2026-09-25/) keep the results so the work survives until the corrections land. The task is the "Re-read both lab batches' pages directly" item in [`BACKLOG.md`](../BACKLOG.md).

## Method

- **What was read.** All 269 URLs the forty lab records cite were opened: site URLs, evidence, channels, and framework documents. Chromium read them through the review environment's proxy, and the PDFs were converted to text with pypdf.
- **Pages that refused a headless browser.** A headed Chromium read these:
  - OpenAI's privacy policy and news page;
  - xAI's news page;
  - SEC's copy of Alibaba's Form 20-F;
  - Meta's framework PDF, reached by following the link in Meta's own blog post;
  - Xiaomi's annual report, fetched from the `ir.mi.com` origin.
- **SpaceX's S-1.** It was read from its full HTML text, because the browser's rendered text stops after the cover page.
- **How claims were checked.**
  - The saved text went to five reviewers of eight labs each. Each reviewer checked every evidence label, organization note, headquarters value, parent, framework title, channel, and site URL against the saved text only, following [`review-brief.md`](lab-reread-2026-09-25/review-brief.md).
  - All 704 quoted fragments in their findings were then checked by script against the saved text, and every one was found.
  - Fixes that depend on facts, such as company roles and addresses, were re-read in the source by hand.
- **What is committed.** The page copies themselves are not committed: 52 MB of third-party pages. [`sources.json`](lab-reread-2026-09-25/sources.json) indexes every read attempt: URL, final URL, HTTP status, title, text length, which records cite the page, and a note on how a hard page was read. [`findings.json`](lab-reread-2026-09-25/findings.json) holds the review results per lab: 117 problems and 498 confirmed claims, each with its quote and source file.

## Pages that could not be read directly

- **Perplexity: careers, about, and privacy pages.**
  - A Cloudflare challenge blocked every attempt, headless and headed.
  - Its terms of service did load. They give Perplexity AI, Inc.'s contact address in San Francisco and say the services are operated in the United States.
- **ByteDance's offices page** (`/en/resources/offices`).
  - ByteDance's own "500: Internal Server Error" page came back on every attempt over two hours.
  - The home page still says it has over 150,000 employees based out of nearly 120 cities and names no headquarters.
- **IBM's watsonx release notes** (`whats-new.html?context=wx`).
  - Every attempt, from the US and EU regions, redirected to IBM's "Error 500" page.
  - Without the `wx` context the page is Cloud Pak for Data's changelog, a different product.
- **Trendyol's imprint** (`/en/imprint`). Every trendyol.com page redirects to a country picker. After choosing Türkiye, the contact page (`/iletisim`) and the about page (`/s/meet-us`) load; the imprint still redirects.
- **OpenBMB's `openbmb.org` and Vivgrid's `www.vivgrid.com`.** Neither host responded. OpenBMB's site is now `openbmb.cn`, with its About page at `/en/about`; Vivgrid's pages load without `www`.
- **Meituan's annual report on its IR host.** The copy on `media-meituan.todayir.com` sits behind a Cloudflare challenge. The same report is on HKEXnews.

## Findings so far

**Wrong documents:**

- The HKEX PDF cited as Meituan's 2025 annual report (`2026042403596.pdf`) is Cirrus Aircraft Limited's annual report.
  - Meituan's own is `2026042400179.pdf`.
  - It confirms the Cayman Islands incorporation and gives the head office and principal place of business in China at No. 4 Wang Jing East Road, Chaoyang District, Beijing.
- xAI's "Exhibit 21" link (`exhibit21-sx1.htm`) is Exhibit 2.1, the merger agreement. The subsidiary list naming X.AI LLC (Nevada) is Exhibit 21.1, `exhibit211-sx1.htm`.

**Headquarters values the saved pages do not support as recorded:**

- **Thinking Machines Lab** (`none_listed`): its cited privacy notice says "We are based in the United States." Rule step 1 gives `us`.
- **Vivgrid** (`none_listed`): the site and privacy-policy footers give one address for Allegro US, LLC, at 2261 Market Street, San Francisco. Rule step 2 gives `us`.
- **Moonshot AI** (`cn`):
  - The cited Kimi platform privacy policy names only MOONSHOT AI PTE. LTD., in Singapore. It never names Beijing Moonshot Technology and gives no address.
  - It needs a page naming 北京月之暗面科技有限公司 with its Beijing address; without one, the record falls to `none_listed`.
- **Z.ai** (`cn`):
  - No cited page gives an address or says where Zhipu is based. The Z.ai terms name JINGSHENG HENGXING TECHNOLOGY PTE.LTD but do not say it is in Singapore.
  - It needs a first-party page with Zhipu's Beijing address; without one, the record falls to `none_listed`.
- **Vispark** (`in`):
  - No page calls Vispark "an Indian tech company"; that phrase came from a search extract. The pages say only "Made with ❤️ in India" and that its Vision model was developed in India.
  - Its unread terms and privacy policy may give an address; without one, the record falls to `none_listed`.
- **Microsoft** (`us`): the privacy statement's "How to contact us" section is collapsed, so the saved text lacks the One Microsoft Way address. It needs a re-read with that section open.
- **Cohere** (`ca`): the value holds today on the SaaS agreement's Toronto principal place of business. But the Aleph Alpha agreement says the combined company will have headquarters in Canada and Germany, so the value needs a re-check when that deal completes.

**Moved or broken channels and URLs:**

| Record | Cited | Now |
|---|---|---|
| Anthropic model catalog | `platform.claude.com/docs/en/about-claude/models/overview` | redirects to `/docs/en/models/overview` |
| ByteDance Seed news | `seed.bytedance.com/en/blog` | 404; the site's own "Blog & Publication" link is `/en/research` |
| IBM release notes | `whats-new.html?context=wx` | IBM's Error 500 page |
| Microsoft AI news | `microsoft.ai/news/` | redirects to `/blog/` |
| Mistral model catalog | `docs.mistral.ai/models/overview` | redirects to `/models` |
| Mixedbread release notes | `mixedbread.com/changelog` | redirects to `/docs/changelog` |
| Ornith AI site | `deep-reinforce.com` | redirects to `ornith.ai` |
| Swiss AI organization page | `swiss-ai.org/team-3` | redirects to `/org` |
| Volcano Engine Ark terms | `docs.volcengine.com/docs/82379/1104498` | redirects to `/docs/ark/volcengine-ark-platform-terms` |
| Amazon model catalog | the Nova Version 1 user guide | says current models are in the Nova 2 guide |

**Labels and notes that say more than their pages:**

- **Aikido Security.**
  - No page says "headquarters". The footer lists addresses in Ghent, Chicago, and London, and there is no APAC or Defense location.
  - `be` still holds on the terms' single registered office in Ghent.
- **Arcee AI.**
  - The privacy policy says only that the site is owned by Arcee AI, Inc.
  - The home page calls Arcee "an American research lab" that develops open-weight models in the U.S.
- **Mistral AI.** The terms say "a French limited joint-stock corporation", not a simplified one.
- **Swiss AI Initiative.**
  - The organization page says ETH Zurich and EPFL have equal voting power on the steering committee.
  - No page says Apertus is developed with CSCS or that its sites belong to EPFL. The Apertus site's notice reads "© 2026 ETH AI Center & EPFL AI Center".
- **OpenBMB.**
  - The About page says THUNLP and Modelbest jointly initiated the community in April 2022.
  - The MiniCPM repository names the "Gaoling School of Artificial Intelligence of RUC".
- **Ant Group.** The Our Offices page and every footer name Ant Group Headquarters at A Space, No. 569 Xixi Road, Hangzhou. The record cites branch offices at 77 Xueyuan Road instead.
- **MiniMax.**
  - The note omits the Cayman Islands incorporation.
  - The prospectus's subsidiary table assigns model research and development to Shanghai and Beijing Xiyu Jizhi Technology, and the open platform to Shanghai Xiyu Technology and Nanonoble Pte. Ltd.
- **Poolside, Perplexity, and Trendyol.** Their notes cite careers pages and an imprint that are not among the pages read, or cannot be read.
- **DeepSeek.** The terms name the registered office only in a court clause. The Hugging Face card calls DeepSeek "a Chinese company".
- **Amazon.** The Kiro FAQ says Enterprise plans are billed through AWS, not that AWS builds and operates Kiro.
- **Ornith AI.** No page says its organizations were renamed. The Hugging Face card says "We’re the DeepReinforce team", and the Ornith-1 README still uses `deepreinforce-ai` model IDs.
- **Tencent.** The Hy3 repository page shows no copyright line, and the note's 腾讯混元团队 appears on no cited page.
- **Cohere.** The framework document carries V1.0 and no date; "February 2025" comes only from its file name.
- **"Reviewed for the … record" clauses.** Seven labels end with one. It records provenance, not page content, and every page has now been read directly for the lab record.

**Confirmed without change:** AI21 Labs, Alibaba, NVIDIA, OpenAI, and Writer. Writer's newsroom also states its headquarters at 111 Maiden Lane, San Francisco.

**A reviewer error caught on re-check:** MiniMax HONGKONG Limited is an investment holding company in the prospectus's subsidiary table, not an open-platform operator.

**Extra first-party pages read for the corrections:**

- Mistral's product page says "Le Chat is now Vibe".
- Aikido's Altar announcement calls Altar a model for defensive security.
- Trendyol's Asure model card says it is tuned for e-commerce tasks in Turkish and English.
- Google Cloud's Vertex AI generative AI docs now redirect to the Gemini Enterprise Agent Platform docs.
- Also read: Arcee's home page, Writer's newsroom, Meituan's HKEXnews report, OpenBMB's About page, Seed's research index, Trendyol's contact and about pages, Perplexity's terms of service, and SpaceX's Exhibit 21.1.

## Per lab

| Lab | Problems | Confirmed | Fields with problems |
|---|---:|---:|---|
| AI Singapore | 4 | 10 | evidence label, organization note |
| AI21 Labs | 0 | 16 | none |
| Aikido Security | 5 | 10 | evidence label, organization note, description, news channel |
| Alibaba | 0 | 16 | none |
| Amazon | 5 | 10 | evidence label, organization note, model catalog, GitHub channel, framework title |
| Ant Group | 6 | 14 | evidence label, organization note |
| Anthropic | 2 | 16 | organization note, model catalog |
| Arcee AI | 4 | 12 | evidence label, organization note, headquarters, model catalog |
| ByteDance | 5 | 20 | evidence labels and URL, organization note, news channel |
| Cohere | 3 | 13 | headquarters (future), framework title, description |
| DeepSeek | 3 | 13 | evidence label, organization note |
| Google | 1 | 19 | organization note |
| IBM | 1 | 19 | release-notes channel |
| Meituan | 4 | 10 | both address evidence items, organization note |
| Meta | 1 | 14 | organization note |
| Microsoft | 7 | 10 | evidence label, headquarters, organization note, news channel |
| MiniMax | 4 | 15 | evidence label, organization note |
| Mistral AI | 4 | 10 | evidence label, organization note, model catalog |
| Mixedbread | 2 | 11 | organization note, release-notes channel |
| Moonshot AI | 3 | 8 | evidence label, organization note, headquarters |
| Motif Technologies | 1 | 12 | organization note |
| NVIDIA | 0 | 15 | none |
| OpenAI | 0 | 16 | none |
| OpenBMB | 5 | 8 | evidence URL and label, organization note, lab type (judgment call) |
| Ornith AI | 5 | 8 | URL, evidence labels, organization note, description |
| Perplexity | 4 | 12 | evidence, organization note, description |
| Poolside | 2 | 13 | evidence label, organization note |
| StepFun | 2 | 12 | evidence labels |
| Swiss AI Initiative | 4 | 12 | evidence labels, organization note |
| Tencent | 3 | 13 | evidence label, organization note |
| Thinking Machines Lab | 2 | 14 | headquarters, organization note |
| Trendyol | 5 | 6 | evidence URLs and labels, organization note, description |
| TypeSafe AI | 1 | 13 | evidence label |
| Upstage | 1 | 12 | evidence label |
| Vispark | 3 | 8 | evidence label, organization note, headquarters |
| Vivgrid | 8 | 6 | evidence URL and label, headquarters, organization note, description |
| Writer | 0 | 15 | none |
| xAI | 1 | 14 | evidence URL |
| Xiaomi | 3 | 12 | organization note, description |
| Z.ai | 3 | 11 | evidence label, organization note, headquarters |

## Next steps

1. **Read the pages some fixes still need:**
   - Microsoft's privacy statement with "How to contact us" open;
   - Vispark's terms and privacy policy;
   - Moonshot's mainland platform policy;
   - Zhipu's BigModel privacy policy;
   - Amazon's Nova 2 guide and framework PDF;
   - Tencent's Hy3 `LICENSE`.
2. **Apply the corrections to `directory/labs.json`.** Set every evidence item, framework, and record `verified_at` to 2026-09-25. Then:
   - update [`COVERAGE.md`](COVERAGE.md#labs), [`LABS.md`](LABS.md), [`BACKLOG.md`](../BACKLOG.md), and the lab test's ByteDance comment;
   - regenerate the published files;
   - run the gate and the browser suite.
3. **Follow-ups outside the lab records:**
   - The Vertex AI service record's docs now redirect to the Gemini Enterprise Agent Platform.
   - These agreements changed after the records that cite them were checked:
     - TypeSafe's master customer agreement, updated 2026-09-23;
     - Upstage's terms, updated 2026-09-21;
     - the BigModel user agreement, updated 2026-09-04.
