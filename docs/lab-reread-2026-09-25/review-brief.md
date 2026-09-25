# Lab claim review brief

You are checking lab records in the ai-systems-atlas catalog (`/home/user/ai-systems-atlas/directory/labs.json`) against a **direct read** of every page they cite. The pages were fetched today (2026-09-25) in a real browser and saved as text. That saved text is the only source you may use: do **not** use WebFetch, WebSearch, curl, or any network tool, and do not rely on memory of what a site says. If a fact is not in the saved text, it is unsupported.

Your input file is a JSON array. Each element has:
- `record`: the lab record as it stands.
- `sources`: for the lab's site URL, each `evidence` item, each `channels` item, and the `safety_framework`, the cached text file(s) (`files`, absolute paths), the HTTP `status`, and a `note` on how the page was read. **Read the notes**: some say a page was unreadable, redirected, returned an error, or is the wrong document, and some point at a replacement page that was read directly (its file is named in the note, in the same cache directory as the other files).

Every cached `.txt` file starts with `URL:`, `FINAL:` (after redirects), `STATUS:` and `TITLE:` lines. Some files are huge (annual reports, SEC filings, prospectuses: up to 1.8M characters). **Use Grep on big files** for the specific fact (entity name, "incorporated", "principal executive", "headquarter", an address, a date), not Read of the whole file. Read small files whole.

## The rules the records follow (from docs/LABS.md)

- `headquarters`: the country where the organization says it is headquartered or based, from its own pages or its regulatory filings; a national programme is based in the country that runs it. When it says neither but its terms, policies, or filings give one principal address for it, such as a principal place of business, a registered office, or its notice address, use that country. When a holding company is incorporated elsewhere, record where the organization says it is headquartered and put the incorporation in `organization_note`. When none of these gives one country (its pages list several offices, only regional headquarters, or no location at all), record `none_listed`, and name its governing legal entities and any regional headquarters in `organization_note`. Never pick one of several offices, and never use an offshore holding company's registration, a court or governing-law clause, where staff work, or where the founders are.
- `lab_type`: `ai_company` when the organization's principal business is AI models and what it builds on them; `technology_company` when AI models are one line of a broader business; `public_research` for a government-funded, academic, or nonprofit research organization.
- `parent_organization`: present only when first-party evidence names a parent, such as a holding company or a controlling entity; never inferred from investment.
- `organization_note`: how the catalog names relate, which unit develops the models, which operates the services, and what the parent is.
- `channels`, each `{kind, url}`, first-party pages and official organizations only:
  - `model_catalog`: the organization's own page listing its current models;
  - `release_notes`: its own changelog for its models or model API;
  - `news`: its own news, blog, or research index where releases are announced;
  - `github` / `hugging_face`: an official organization, one the lab links from its own pages or one that hosts a reviewed record of the lab's.
- `safety_framework`: the title the organization gives the framework, the URL of the current version. Check the title (and any version number or date the record's title carries) against the document itself.
- Evidence `label`: a short statement of what that page says. Every part of the label must be something the page says.

## What to check, per lab

1. **Each evidence item**: does the page text support every part of the label? Quote the supporting text. If part is not supported, or the page is an error, redirect to something else, or the wrong document, say so and propose a corrected label (and URL, when a note names a replacement page that was read directly and supports it).
2. **`organization_note`**: split it into its factual claims. For each claim about the organization (legal entity, incorporation, address, headquarters, founding, parent, renaming, who develops or operates what), find the supporting quote in one of the cited pages. Claims that only describe how this catalog names things ("The catalog names the developer X ... so both names belong to this record") are catalog facts: mark them `catalog` and move on. Flag every claim no cited page supports, or that a page contradicts, and propose wording the pages do support.
3. **`headquarters`**: apply the rule above step by step, quoting the text you rely on. Say which step decides it (says HQ/based; one principal address in terms, policies or filings; national programme; or none_listed) and whether the recorded value is right.
4. **`parent_organization`** (when present): quote the first-party text naming the parent.
5. **`description`**: flag only statements that a cited page contradicts or that no source supports, ignoring lists of the lab's systems, services and models (those are joins from other catalog records).
6. **`lab_type`**: is it consistent with the pages?
7. **Each channel**: does the page load (not an error, 404, login wall or challenge page)? Is it first-party or the official org? Does it fit its `kind`? For a GitHub or Hugging Face org, check the page is that org and it is plausibly official (the org page names the lab or links its site). If it redirects, give the final URL; if it is broken and a cached page shows the right URL, propose it.
8. **`safety_framework`**: quote the document's own title line and any version or effective date; say whether the record's title matches exactly.
9. **Site URL**: does it load and is it the organization's site?

## Output

End your reply with one fenced ```json block holding an array, one object per lab, in this shape:

```json
[{
  "lab": "lab-id",
  "problems": [
    {"field": "evidence[1].label | organization_note | headquarters | channels[2] | safety_framework.title | description | lab_type | parent_organization | url",
     "current": "the current text or value",
     "issue": "what is wrong or unreadable, in one or two sentences",
     "quote": "the exact page text that shows it (<= 300 chars), or empty",
     "file": "cache file you quote",
     "fix": "the exact replacement text/URL/value you propose, or 'remove', or 'none available'"}
  ],
  "confirmed": [
    {"field": "evidence[0].label", "quote": "short exact supporting quote (<= 200 chars)", "file": "cache file"}
  ]
}]
```

Put every evidence item, the headquarters value, each organization_note claim about the organization, the parent, the framework title and each channel in either `problems` or `confirmed`. Be exact and literal: a label that says "principal executive office" needs a page that says principal executive office; a date or version needs the same date or version. Do not soften findings, and do not invent quotes: copy them from the files.
