# ADR 040: Search orders by match, never by score

**Status:** Accepted. Amends [ADR 013](013-distinct-collections-share-one-directory-surface.md), [ADR 032](032-agent-packs-are-unscored-records-of-what-a-host-installs.md), [ADR 035](035-host-installed-systems-are-listed-inline-in-the-packs-scope.md), [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md), and [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

## Context

Directory search matched the whole query as one literal substring and listed matches in each scope's browsing order. Measured on 2026-09-23 against the live catalog:

- Searching "ollama" listed Ollama 17th of 20.
- "run models locally", "memory for agents", "open source coding agent", and "self hosted" found nothing, while "self-hosted" found 51.
- "rag" and "mac" matched inside other words.

A reader who knew what they wanted could not find it first, and a reader who described a need found nothing.

ADR 013 made All "alphabetical discovery", ADR 032 made the Packs scope "alphabetical only", ADR 035 made that scope "one alphabetical grid of installables", ADR 037 lists robots alphabetically, and ADR 041 makes the Labs view "alphabetical only". Those rules exist so that an order never implies merit: none of those lists may be ranked by score, and packs, robots, and labs carry no score at all.

## Decision

A search matches words and orders its results by how well each record matches the query. That order never reads a score, stars, or any other merit.

- **Every query word must match.** Case and accents do not matter. Hyphens split query words, so "self-hosted" and "self hosted" ask the same thing, and a record's word joined by ".", "+", "#", or "-" also counts as its parts, so "llama" finds llama.cpp. Stop words such as "for", "the", and "my" are dropped.
- **A query word matches as typed or as its light stem, whichever matches better.** In a word of five or more letters, the stem turns a final -ies into -y. Otherwise it drops a final -s, but not -ss, from a word of five or more letters, then -ly, -ing, or -ed when four letters remain. So "agents" finds "agent", "memories" finds "memory", and "series" still finds "series".
- **Word length decides how a word may match:**
  - Four or more letters: the start of any word, or anywhere inside a word of the record's name.
  - Three letters: a whole word, or anywhere inside a name word.
  - Two letters: a whole word, or the start of a name word.
  - One letter: the start of a name word.
- **Where a word lands decides the order.** A name that holds every query word counts most, then the record's label, then its maker, then its description, then its other searchable prose. The label is the record's role or type, and for a system also its family and source-model names.
- **Names come first.** A name equal to the query as typed, stop words included, comes first, so "A-MEM" lists A-MEM first. Then come names that start with the query, then names that hold every query word. A split name is found as one: "lang chain" also tries "langchain". Among equal matches, active records come first, then names A–Z.
- **Browsing keeps each scope's own order.** With no query, All, Agent packs, Specifications, Labs, and Robots are A–Z, and a scope with a Sort control keeps the sort that control shows.
- **Best match.** Systems, Inference services, Local runtimes, and Models list "Best match" first in their Sort control, and offer it only while a query is present. A query selects it unless the reader chooses another sort during that query, and a sort chosen then survives further typing. Clearing the query restores the sort from before it, unless the reader chose one during the query, which stays. Scores stay visible exactly where [ADR 014](014-comparisons-are-scoped-to-one-score-profile.md) allows them.
- **Best match in the URL.** While a query is present, Best match is the URL's default sort and is never written. A sort the reader chose during the query is written, even when it is the browsing default, so a reload keeps it. A link with a query and no sort opens on Best match, and a sort the link names counts as chosen.

Each collection's search index, part of [ADR 026](026-app-payloads-are-a-projection-of-the-published-endpoints.md)'s app projection, is unchanged. A search newly reads two things the indexes do not hold, both from what the page already loads, so no payload grows: the label, which the browser builds from the taxonomy, and a local runtime's repository, which the maker reads from its boot record. A match weight is computed in the browser, is never published, and never appears on a card.

## Consequences

- These sentences now describe browsing, and a query orders by match:
  - ADR 013's All bullet ("alphabetical discovery");
  - ADR 032's "the Packs scope sorts by name only" and "The scope is alphabetical only";
  - ADR 035's "one alphabetical grid of installables";
  - ADR 037's "They are listed alphabetically" and "alphabetical order with no sort control";
  - ADR 041's "The view is alphabetical only".
- The Robots session, which owns ADR 037, and the Labs session, which owns ADR 041, agreed on 2026-09-24. The other rules in those records stay: packs, robots, and labs are unscored, with no sort control and no comparison, and All hides scores. ADR 037's sentence "They are listed alphabetically" now reads "while browsing"; its rule that robots are never ranked by merit still holds, because a match order reflects how well a record's text answers one query, never the record's merit.
- A known name comes first: "ollama" lists Ollama first. A split or misspelled name is still found: "lang chain" finds LangChain, and "olama" suggests Ollama.
- Search no longer matches inside prose words, so "rag" stops matching "storage". It still matches inside names, so "gpt" finds ChatGPT.
- The label makes a record's role or type searchable: "coding agent" finds Aider, whose role is Coding agent, although its prose never uses the word "coding". The maker makes a local runtime's repository searchable too: "mudler" finds LocalAI.
- [`docs/WEB.md`](../WEB.md) holds the full search contract, including what an empty result offers.
- Tests pin the matching rules against fixtures and the probe queries against the published catalog.
