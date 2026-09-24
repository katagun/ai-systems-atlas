# Ranked Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Directory search find what a reader means: known names first, multi-word, hyphenated, and loosely spelled queries working, and never an order by score. Also offer the Finder job a query names, and turn an empty result into next steps.

**Architecture:** One word-based matcher in `web/app-core.js` replaces the literal substring test that every collection filter shares. It weights where each query word lands (name, role or type, maker, description, other prose) to order results while a query is present. It reads the same search indexes and boot fields as today, so no payload grows. `web/app.js` passes each record's role or type name through a `labelOf` callback, adds a "Best match" sort, carries the query between scopes, and renders suggestions and the empty state. ADR 040 records the decision in the same pull request.

**Tech Stack:** Vanilla JavaScript (ES2020), `node:test` (`tests/test_web.js`), Playwright (`tests/e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-24-directory-front-door-design.md` ("Phase 1 — search that ranks", "Contract changes", "Testing").

## Global Constraints

- Starts after the Phase 0 plan (`docs/superpowers/plans/2026-09-24-directory-phase-0-fixes.md`) has merged. This plan uses its `SCOPE_CONTROLS`, `activeScope()`, `SCOPE_URL_PARAMS`, and `writeScopeURL()`, and the Robots collection's `ROBOT_VIEW`, `filterRobots`, and `robotSearchIndex` from #300.
- One branch, `claude/directory-p1-ranked-search`, from fresh `origin/main`; one commit per task; one PR after Task 6. ADR 040 and the `docs/WEB.md` changes ship in that same PR, so `main` never contradicts an accepted decision.
- Before opening the PR, run `git fetch origin && git ls-tree --name-only origin/main docs/adr/`. ADR 040 is claimed; if `main` has taken it anyway, renumber by slug first.
- Order by match weight only. Nothing reads `score`, `stars`, or any merit field to order a search.
- No payload grows: no new field in `BOOT_FIELDS`, and search indexes are unchanged. `exclusions.json` loads only when an empty result needs it.
- Colours only from the tokens in `web/styles.css`; no colour or radius literals.
- After any change to `web/index.html`, `web/app.js`, `web/app-core.js`, or `web/styles.css`, run `/usr/local/bin/node scripts/build_asset_version.mjs`. Use `/usr/local/bin/node` for every Node command.
- Local Playwright boot timeouts are harness flakes; rerun with `npx playwright test --last-failed`.
- Commits run the full pre-commit suite: use a 10-minute timeout and check `git log -1`.

---

### Task 1: Words and tokens

**Files:**
- Modify: `web/app-core.js` (add `SEARCH_STOP_WORDS`, `normalizeSearchText`, `searchWords`, `stemQueryWord`, `parseSearchQuery`, `tokenHit`; export all but the constant)
- Modify: `tests/test_web.js`

**Interfaces:**
- Produces:
  - `normalizeSearchText(text) → string`
  - `searchWords(text) → string[]`
  - `stemQueryWord(word) → string`
  - `parseSearchQuery(raw) → { raw: string, text: string, tokens: string[] }`
  - `tokenHit(words: string[], token: string, inName: boolean) → 0 | 0.6 | 0.8 | 1`

- [ ] **Step 1: Write the failing tests**

Import `normalizeSearchText`, `parseSearchQuery`, `searchWords`, `stemQueryWord`, and `tokenHit` in `tests/test_web.js`, then append:

```js
test("search text normalises case, accents, and separators", () => {
  assert.equal(normalizeSearchText("  Qwen3.8 Omni — Flash!  "), "qwen3.8 omni flash");
  assert.equal(normalizeSearchText("Café-Crème"), "cafe-creme");
  assert.deepEqual(searchWords("llama.cpp and self-hosted"), ["llama.cpp", "llama", "cpp", "and", "self-hosted", "self", "hosted"]);
});

test("query words are stemmed lightly and never below four letters", () => {
  assert.equal(stemQueryWord("agents"), "agent");
  assert.equal(stemQueryWord("memories"), "memory");
  assert.equal(stemQueryWord("locally"), "local");
  assert.equal(stemQueryWord("hosted"), "host");
  assert.equal(stemQueryWord("coding"), "coding");
  assert.equal(stemQueryWord("news"), "news");
  assert.equal(stemQueryWord("access"), "access");
});

test("a query drops stop words and treats hyphens as spaces", () => {
  assert.deepEqual(parseSearchQuery("Memory for Agents").tokens, ["memory", "agent"]);
  assert.deepEqual(parseSearchQuery("self-hosted").tokens, parseSearchQuery("self hosted").tokens);
  assert.deepEqual(parseSearchQuery("   ").tokens, []);
});

test("short words are strict outside names, and names match inside compounds", () => {
  const prose = searchWords("An agent API that stores vectors in storage");
  assert.equal(tokenHit(prose, "pi", false), 0);
  assert.equal(tokenHit(prose, "rag", false), 0);
  assert.equal(tokenHit(prose, "api", false), 1);
  assert.equal(tokenHit(prose, "stor", false), 0.8);
  assert.equal(tokenHit(searchWords("Pi"), "pi", true), 1);
  assert.equal(tokenHit(searchWords("ChatGPT"), "gpt", true), 0.6);
  assert.equal(tokenHit(searchWords("agentmemory"), "memory", true), 0.6);
  assert.equal(tokenHit(searchWords("GBrain"), "gbr", true), 0.8);
  assert.equal(tokenHit(searchWords("zebra"), "z", false), 0);
  assert.equal(tokenHit(searchWords("Alpha"), "a", true), 0.8);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `normalizeSearchText is not a function`.

- [ ] **Step 3: Implement them**

In `web/app-core.js`, after `monogramGlyph`:

```js
  // Search (ADR 040): words, not substrings; results ordered by match, never
  // by score.
  const SEARCH_STOP_WORDS = new Set(["a", "an", "the", "for", "with", "my", "to", "of", "and", "on", "in", "i", "me"]);

  // Lower case with accents dropped; every character other than a letter, a
  // digit, ".", "+", "#", or "-" becomes a space.
  function normalizeSearchText(text) {
    return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9.+#-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // A text's words. A word joined by ".", "+", "#", or "-" also counts as its
  // parts, so "llama.cpp" is found by "llama" and "self-hosted" by "hosted".
  function searchWords(text) {
    const words = [];
    for (const word of normalizeSearchText(text).split(" ")) {
      if (!word) continue;
      words.push(word);
      if (/[.+#-]/.test(word)) for (const part of word.split(/[.+#-]+/)) if (part) words.push(part);
    }
    return words;
  }

  // Light stemming for query words only: plurals, then -ly, -ing, or -ed when
  // the stem keeps four letters, so "hosted" becomes "host" but "coding" stays.
  function stemQueryWord(word) {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    let stem = word;
    if (stem.length > 4 && stem.endsWith("s") && !stem.endsWith("ss")) stem = stem.slice(0, -1);
    for (const suffix of ["ly", "ing", "ed"]) {
      if (stem.endsWith(suffix) && stem.length - suffix.length >= 4) return stem.slice(0, -suffix.length);
    }
    return stem;
  }

  // Hyphens split query words, so "self-hosted" asks what "self hosted" asks.
  function parseSearchQuery(raw) {
    const tokens = normalizeSearchText(raw).replace(/-/g, " ").split(" ")
      .filter(word => word && !SEARCH_STOP_WORDS.has(word))
      .map(stemQueryWord);
    return { raw: String(raw || ""), text: tokens.join(" "), tokens };
  }

  // How one query word hits one field's words: 1 for a whole word, 0.8 for a
  // word's start, 0.6 for the inside of a word in a name, otherwise 0. Short
  // words are strict outside names, so "pi" never finds API and "rag" never
  // finds storage, while "gpt" still finds ChatGPT (docs/WEB.md).
  function tokenHit(words, token, inName) {
    if (token.length === 1) return inName && words.some(word => word.startsWith(token)) ? 0.8 : 0;
    if (words.includes(token)) return 1;
    if (words.some(word => word.startsWith(token)) && (inName || token.length >= 4)) return 0.8;
    if (inName && token.length >= 3 && words.some(word => word.includes(token))) return 0.6;
    return 0;
  }
```

Export `normalizeSearchText`, `parseSearchQuery`, `searchWords`, `stemQueryWord`, and `tokenHit`, in alphabetical order.

- [ ] **Step 4: Run them and watch them pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Add word-based search tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Match records and order by match

**Files:**
- Modify: `web/app-core.js`:
  - add `searchWordCache` / `cachedSearchWords`, `SEARCH_TEXT_FIELDS`, `searchFields`, `SEARCH_FIELD_WEIGHTS`, `searchMatch`, `recordMatch`, `isActiveRecord`, and `orderBySearch`;
  - rewrite `matchesProject`, `filterAndSortProjects`, `filterSpecifications`, `filterScoredCollection`, `filterPacks`, `filterLabs`, `filterRobots`, `filterDirectoryEntries`, `packShapedSystems`, and `mergePackScopeEntries`;
  - delete `matchesSearchTerm`, `recordHaystack`, `matchesRecordSearch`, and `matchesDirectoryProjectSearch`, and their exports.
- Modify: `web/app.js` (add `searchLabel`; pass `labelOf: searchLabel` to every filter call)
- Modify: `web/index.html` (a "Best match" option in the four Sort selects)
- Modify: `tests/test_web.js`

**Interfaces:**
- Consumes: Task 1's functions.
- Produces:
  - `searchFields(kind, record, { index, labelOf, textFields }) → { name, label, maker, description, text }`
  - `recordMatch(query, fields) → number` (0 = no match)
  - Every filter function accepts `labelOf: (kind, record) → string` and `sort: "match"`. With a query, `filterDirectoryEntries`, `filterSpecifications`, `filterPacks`, `filterLabs`, `filterRobots`, `packShapedSystems`, and `mergePackScopeEntries(packs, systems, { term, packIndex, systemIndex, labelOf })` order by match.

- [ ] **Step 1: Write the failing tests**

Import `recordMatch` and `searchFields` in `tests/test_web.js`. Replace the test "indexed search keeps infix matching, which is why the index is raw text" with:

```js
test("indexed search reads the index through whole words", () => {
  // "gguf" appears only in the index text, never in the record's own fields,
  // so this fails if the matcher ignores the index.
  const records = [{ id: "ol", name: "Ol", description: "Runner.", score: { overall: 1 } }];
  const searchIndex = { ol: "ollama runner. runs gguf models locally." };
  assert.equal(filterAndSortProjects(records, { term: "gguf", searchIndex }).length, 1);
});

test("mid-word matches count inside names but not inside prose", () => {
  const records = [
    { id: "o", name: "Ollama", description: "Local runner.", score: { overall: 1 } },
    { id: "x", name: "Other", description: "Mentions ollama inside prose.", score: { overall: 9 } },
    { id: "s", name: "Store", description: "Vector storage.", score: { overall: 9 } },
  ];
  assert.deepEqual(filterAndSortProjects(records, { term: "llama", sort: "name" }).map(record => record.name), ["Ollama"]);
  assert.deepEqual(filterAndSortProjects(records, { term: "rag", sort: "name" }).map(record => record.name), []);
});
```

Then append:

```js
test("a search orders by match and never by score", () => {
  const records = [
    { id: "a", name: "Alpha Router", description: "Routes requests to ollama.", status: "active", score: { overall: 10 } },
    { id: "b", name: "Ollama", description: "Runs models.", status: "active", score: { overall: 1 } },
    { id: "c", name: "Ollama Classic", description: "Old runner.", status: "archived", score: { overall: 9 } },
  ];
  const names = filterAndSortProjects(records, { term: "ollama", sort: "match", status: "" }).map(record => record.name);
  assert.deepEqual(names, ["Ollama", "Ollama Classic", "Alpha Router"]);
  // Without a query, "match" falls back to names A–Z.
  assert.deepEqual(filterAndSortProjects(records, { term: "", sort: "match", status: "" }).map(record => record.name), ["Alpha Router", "Ollama", "Ollama Classic"]);
});

test("a split name is found as a name", () => {
  const fields = searchFields("system", { id: "lc", name: "LangChain", description: "Framework." });
  assert.ok(recordMatch(parseSearchQuery("lang chain"), fields) > 0);
});

test("the mixed directory stays A–Z while browsing and orders by match while searching", () => {
  const systems = [{ id: "z", name: "Zeta Agent", description: "An agent.", status: "active", deployment: [] }];
  const runtimes = [{ id: "o", name: "Ollama", maintainer: "Ollama", description: "Runs models.", api_styles: [] }];
  const browse = filterDirectoryEntries(systems, [], runtimes, [], { term: "" }).map(entry => entry.record.name);
  assert.deepEqual(browse, ["Ollama", "Zeta Agent"]);
  const found = filterDirectoryEntries(systems, [], runtimes, [], { term: "agent" }).map(entry => entry.record.name);
  assert.deepEqual(found, ["Zeta Agent"]);
});

test("real-catalog probes: known names first and loose queries answered", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const nameOf = (group, id) => (taxonomy[group] || []).find(item => item.id === id)?.name || "";
  const labelOf = (kind, record) => ({
    system: `${nameOf("primary_roles", record.primary_role)} ${nameOf("system_families", record.system_family)} ${nameOf("source_models", record.source_model)}`,
    inference: nameOf("inference_service_types", record.service_type),
    runtime: nameOf("local_runtime_types", record.runtime_type),
    model: nameOf("model_types", record.model_type),
    pack: nameOf("pack_types", record.pack_type),
    robot: nameOf("robot_form_factors", record.form_factor),
  })[kind] || "";
  const boot = name => readWebJSON(`app/${name}.json`);
  const index = name => readWebJSON(`app/search/${name}.json`);
  const indexes = {
    searchIndex: index("systems"), serviceSearchIndex: index("inference"), runtimeSearchIndex: index("runtimes"),
    modelSearchIndex: index("models"), packSearchIndex: index("packs"), robotSearchIndex: index("robots"),
  };
  const run = term => filterDirectoryEntries(
    boot("systems").systems, boot("inference").inference, boot("runtimes").runtimes, boot("models").models,
    { term, labelOf, ...indexes }, boot("packs").packs, boot("robots").robots,
  ).map(entry => entry.record.name);
  assert.equal(run("ollama")[0], "Ollama");
  assert.equal(run("cursor")[0], "Cursor");
  assert.equal(run("openrouter")[0], "OpenRouter");
  assert.equal(run("claude code")[0], "Claude Code");
  assert.equal(run("lang chain")[0], "LangChain");
  assert.deepEqual(run("self hosted"), run("self-hosted"));
  assert.ok(run("gpt").includes("ChatGPT"));
  assert.ok(run("run models locally").length > 0);
  assert.ok(run("memory for agents").length > 0);
  assert.ok(run("open source coding agent").length > 0);
});
```

`readWebJSON(file)` is the file's existing helper for reading `web/<file>`; append these tests at the end of the file, after its definition.

- [ ] **Step 2: Run them and watch them fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `recordMatch is not a function`, and the "rag" and "llama" assertions fail.

- [ ] **Step 3: Implement matching**

In `web/app-core.js`:

1. Give each view descriptor its record kind: `kind: "inference"` in `INFERENCE_SERVICE_VIEW`, `kind: "runtime"` in `LOCAL_RUNTIME_VIEW`, `kind: "model"` in `MODEL_VIEW`, `kind: "pack"` in `PACK_VIEW`, `kind: "lab"` in `LAB_VIEW`, and `kind: "robot"` in `ROBOT_VIEW`.
2. After the last view descriptor, add:

```js
  // The prose each collection searches until its index arrives: the fields it
  // has always searched, so a missing index narrows a search, never widens it.
  const SEARCH_TEXT_FIELDS = {
    system: ["id", "name", "description", "repo", "url", "why_it_matters", "strengths", "weaknesses"],
    spec: ["id", "name", "short_name", "description", "standardizes", "does_not_standardize", "repo", "stewards"],
    inference: INFERENCE_SERVICE_VIEW.searchFields,
    runtime: LOCAL_RUNTIME_VIEW.searchFields,
    model: MODEL_VIEW.searchFields,
    pack: PACK_VIEW.searchFields,
    lab: LAB_VIEW.searchFields,
    robot: ROBOT_VIEW.searchFields,
  };
  const SEARCH_FIELD_WEIGHTS = { name: 50, label: 30, maker: 20, description: 10, text: 3 };

  const searchWordCache = new Map();
  function cachedSearchWords(text) {
    const key = String(text || "");
    let words = searchWordCache.get(key);
    if (!words) {
      words = searchWords(key);
      searchWordCache.set(key, words);
    }
    return words;
  }

  // What a record is matched and ordered by. `labelOf(kind, record)` names its
  // role or type (the caller holds the taxonomy); `text` is the record's search
  // index entry, or its own prose until the index arrives.
  function searchFields(kind, record, { index, labelOf, textFields } = {}) {
    const maker = record.repo || record.operator || record.maintainer || record.developer
      || record.steward || record.manufacturer || (record.stewards || []).join(" ");
    const prose = (textFields || SEARCH_TEXT_FIELDS[kind] || ["name", "description"])
      .flatMap(field => Array.isArray(record[field]) ? record[field] : [record[field]])
      .filter(Boolean).join(" ");
    return {
      name: [record.name, record.short_name].filter(Boolean).join(" "),
      label: labelOf ? labelOf(kind, record) : "",
      maker: maker || "",
      description: record.description || "",
      text: (index && index[record.id]) || prose,
    };
  }

  // A record's match weight: 0 when any query word misses every field, since
  // every word must match. Otherwise the number only orders results; it never
  // reads a score, stars, or any other merit (ADR 040).
  function searchMatch(query, fields) {
    if (!query.tokens.length) return 1;
    const words = Object.fromEntries(Object.keys(SEARCH_FIELD_WEIGHTS).map(field => [field, cachedSearchWords(fields[field])]));
    const nameHasAll = query.tokens.every(token => tokenHit(words.name, token, true) > 0);
    let weight = 0;
    for (const token of query.tokens) {
      let best = 0;
      for (const [field, fieldWeight] of Object.entries(SEARCH_FIELD_WEIGHTS)) {
        const inName = field === "name";
        best = Math.max(best, tokenHit(words[field], token, inName) * (inName && !nameHasAll ? 12 : fieldWeight));
      }
      if (!best) return 0;
      weight += best;
    }
    const name = normalizeSearchText(fields.name).replace(/-/g, " ");
    if (name === query.text) return weight + 1000;
    if (name.startsWith(query.text)) return weight + 400;
    return nameHasAll ? weight + 200 : weight;
  }

  // A split product name still comes first: "lang chain" also tries
  // "langchain", and a record whose name holds the joined word counts as a
  // name match.
  function recordMatch(query, fields) {
    let weight = searchMatch(query, fields);
    const nameWords = cachedSearchWords(fields.name);
    for (let i = 0; i < query.tokens.length - 1; i += 1) {
      const tokens = [...query.tokens.slice(0, i), query.tokens[i] + query.tokens[i + 1], ...query.tokens.slice(i + 2)];
      if (!tokens.every(token => tokenHit(nameWords, token, true) > 0)) continue;
      weight = Math.max(weight, searchMatch({ raw: query.raw, text: tokens.join(" "), tokens }, fields) + 300);
    }
    return weight;
  }

  const isActiveRecord = record => !record.status || record.status === "active";

  // Keeps the records a query matches and orders them: by match weight when
  // `byMatch` is set and there is a query, otherwise by `compare`. Among equal
  // matches, active records come first, then names A–Z.
  function orderBySearch(records, query, fieldsOf, compare, byMatch) {
    if (!query.tokens.length) return [...records].sort(compare);
    const matched = [];
    for (const record of records) {
      const weight = recordMatch(query, fieldsOf(record));
      if (weight > 0) matched.push({ record, weight });
    }
    if (!byMatch) return matched.map(item => item.record).sort(compare);
    return matched.sort((a, b) => b.weight - a.weight
      || Number(isActiveRecord(b.record)) - Number(isActiveRecord(a.record))
      || a.record.name.localeCompare(b.record.name)).map(item => item.record);
  }
```

- [ ] **Step 4: Rewrite the filters on top of it**

Replace these functions in `web/app-core.js`:

```js
  function matchesProjectFacets(project, filters) {
    const roles = filters.roles || [];
    return (!filters.family || project.system_family === filters.family) &&
      (!filters.role || project.primary_role === filters.role) &&
      (!roles.length || roles.includes(project.primary_role)) &&
      (!filters.agent || project.agent_relation === filters.agent) &&
      (!filters.architecture || project.architectures.includes(filters.architecture)) &&
      (!filters.deployment || project.deployment.includes(filters.deployment)) &&
      (!filters.agentInterface || (project.agent_interfaces || []).includes(filters.agentInterface)) &&
      (!filters.sourceModel || project.source_model === filters.sourceModel) &&
      (!filters.license || project.licenses.includes(filters.license)) &&
      (!filters.status || project.status === filters.status) &&
      (!filters.localOnly || project.local_first);
  }

  function matchesProject(project, filters) {
    const query = parseSearchQuery(filters.term);
    return matchesProjectFacets(project, filters) && (!query.tokens.length
      || recordMatch(query, searchFields("system", project, { index: filters.searchIndex, labelOf: filters.labelOf })) > 0);
  }

  function filterAndSortProjects(projects, filters) {
    const query = parseSearchQuery(filters.term);
    const byMatch = filters.sort === "match" && query.tokens.length > 0;
    return orderBySearch(
      projects.filter(project => matchesProjectFacets(project, filters)),
      query,
      project => searchFields("system", project, { index: filters.searchIndex, labelOf: filters.labelOf }),
      compareProjects(filters.sort === "match" ? "name" : filters.sort),
      byMatch,
    );
  }

  function filterSpecifications(specifications, filters = {}) {
    const faceted = specifications.filter(specification =>
      (!filters.type || specification.specification_type === filters.type) &&
      (!filters.scope || specification.scope === filters.scope) &&
      (!filters.status || specification.status === filters.status) &&
      (!filters.license || specification.licenses.includes(filters.license)));
    return orderBySearch(
      faceted,
      parseSearchQuery(filters.term),
      specification => searchFields("spec", specification, { index: filters.searchIndex, labelOf: filters.labelOf }),
      (a, b) => a.name.localeCompare(b.name),
      true,
    );
  }

  function filterScoredCollection(records, filters = {}, options = {}) {
    const facets = options.facets || {};
    const faceted = records.filter(record => Object.entries(facets).every(([key, field]) => {
      const selected = filters[key];
      if (!selected) return true;
      const value = record[field];
      return Array.isArray(value) ? value.includes(selected) : value === selected;
    }));
    const byScore = (a, b) => (b.score?.overall ?? -1) - (a.score?.overall ?? -1) || a.name.localeCompare(b.name);
    const byName = (a, b) => a.name.localeCompare(b.name);
    return orderBySearch(
      faceted,
      parseSearchQuery(filters.term),
      record => searchFields(options.kind, record, { index: filters.searchIndex, labelOf: filters.labelOf, textFields: options.searchFields }),
      filters.sort === "score" ? byScore : byName,
      filters.sort === "match",
    );
  }

  // Unscored collections are A–Z while browsing and ordered by match while
  // searching (ADR 032, ADR 037, ADR 040, ADR 041).
  const unscoredSort = filters => (String(filters.term || "").trim() ? "match" : "name");

  function filterPacks(packs, filters = {}) {
    return filterScoredCollection(packs, { ...filters, sort: unscoredSort(filters) }, PACK_VIEW);
  }
```

In `filterLabs` and `filterRobots`, change the pinned `sort: "name"` to `sort: unscoredSort(filters)`. Then replace:

```js
  const DIRECTORY_KINDS = [
    ["system", "searchIndex"], ["inference", "serviceSearchIndex"], ["runtime", "runtimeSearchIndex"],
    ["model", "modelSearchIndex"], ["pack", "packSearchIndex"], ["robot", "robotSearchIndex"],
  ];

  // All is A–Z while browsing (ADR 013) and ordered by match while searching,
  // never by score (ADR 040). Each collection reads its own index namespace;
  // a missing one narrows that collection to its boot fields.
  function filterDirectoryEntries(projects, services, runtimes = [], models = [], filters = {}, packs = [], robots = []) {
    const query = parseSearchQuery(filters.term);
    const lists = { system: projects, inference: services, runtime: runtimes, model: models, pack: packs, robot: robots };
    const entries = [];
    for (const [kind, indexKey] of DIRECTORY_KINDS) {
      for (const record of lists[kind]) {
        const weight = query.tokens.length
          ? recordMatch(query, searchFields(kind, record, { index: filters[indexKey], labelOf: filters.labelOf }))
          : 1;
        if (weight > 0) entries.push({ kind, record, weight });
      }
    }
    const byName = (a, b) => a.record.name.localeCompare(b.record.name) || a.kind.localeCompare(b.kind);
    const ordered = query.tokens.length
      ? entries.sort((a, b) => b.weight - a.weight || Number(isActiveRecord(b.record)) - Number(isActiveRecord(a.record)) || byName(a, b))
      : entries.sort(byName);
    return ordered.map(({ kind, record }) => ({ kind, record }));
  }

  function packShapedSystems(projects, filters = {}) {
    const query = parseSearchQuery(filters.term);
    return orderBySearch(
      projects.filter(project => (project.deployment || []).includes("host_pack")),
      query,
      project => searchFields("system", project, { index: filters.searchIndex, labelOf: filters.labelOf }),
      (a, b) => a.name.localeCompare(b.name),
      query.tokens.length > 0,
    );
  }

  // The Packs scope lists one grid: unscored packs beside scored
  // host-installed systems (ADR 035). It is A–Z while browsing and ordered
  // by match while searching.
  function mergePackScopeEntries(packs, systems, { term = "", packIndex, systemIndex, labelOf } = {}) {
    const entries = [
      ...packs.map(record => ({ kind: "pack", record })),
      ...systems.map(record => ({ kind: "system", record })),
    ];
    const byName = (a, b) => a.record.name.localeCompare(b.record.name) || a.kind.localeCompare(b.kind);
    const query = parseSearchQuery(term);
    if (!query.tokens.length) return entries.sort(byName);
    const weightOf = entry => recordMatch(query, searchFields(entry.kind, entry.record, {
      index: entry.kind === "pack" ? packIndex : systemIndex, labelOf,
    }));
    return entries.map(entry => ({ entry, weight: weightOf(entry) }))
      .sort((a, b) => b.weight - a.weight || byName(a.entry, b.entry))
      .map(item => item.entry);
  }
```

Delete `matchesSearchTerm`, `recordHaystack`, `matchesRecordSearch`, and `matchesDirectoryProjectSearch`, and remove them from the returned object. Export `recordMatch` and `searchFields`.

- [ ] **Step 5: Run the unit tests and watch them pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS. The single-character, Pi/API, fallback, and index tests pass unchanged.

- [ ] **Step 6: Pass role and type names from the page**

In `web/app.js`, after `roleName`'s definition, add:

```js
// A record's role or type in words, which search weighs above its prose.
function searchLabel(kind, record) {
  if (kind === "system") return `${roleName(record.primary_role)} ${familyName(record.system_family)} ${sourceModelName(record.source_model)}`;
  if (kind === "inference") return taxonomyName("inference_service_types", record.service_type);
  if (kind === "runtime") return taxonomyName("local_runtime_types", record.runtime_type);
  if (kind === "model") return record.model_type ? taxonomyName("model_types", record.model_type) : "";
  if (kind === "pack") return taxonomyName("pack_types", record.pack_type);
  if (kind === "lab") return taxonomyName("lab_types", record.lab_type);
  if (kind === "spec") return taxonomyName("specification_types", record.specification_type);
  if (kind === "robot") return taxonomyName("robot_form_factors", record.form_factor);
  return "";
}
```

Add `labelOf: searchLabel,` to the filters object of every `AtlasCore` filter call:
- `filterAndSortProjects` in `filteredProjects`
- `filterDirectoryEntries` in `renderAllDirectoryEntries`
- `filterPacks` and `packShapedSystems` in `renderPacks`
- `filterSpecifications`, `filterLabs`, `filterInferenceServices`, and `filterModels` in their `COLLECTIONS` entries' `records()`
- the robots entry's `filterRobots`

In `renderPacks`, replace `AtlasCore.mergePackScopeEntries(packs, systems)` with:

```js
  const entries = AtlasCore.mergePackScopeEntries(packs, systems, {
    term, packIndex: searchIndexes.packs, systemIndex: searchIndexes.systems, labelOf: searchLabel,
  });
```

- [ ] **Step 7: Add "Best match" to the scored Sort controls**

In `web/index.html`, add `<option value="match">Best match</option>` as the first option of `#sort-filter`, `#inference-sort-filter`, `#runtime-sort-filter`, and `#model-sort-filter`. Leave each control's `selected` default unchanged. Task 4 selects "Best match" while a query is present.

- [ ] **Step 8: Run all suites**

Run: `/usr/local/bin/node --test tests/test_web.js && npm run test:e2e`
Expected: PASS, apart from e2e assertions that pinned where a search result sits among several matches under A–Z order. Update each one to expect the match order. For example, a test that expected the first of several results by name now expects the exact-name record first.

- [ ] **Step 9: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app-core.js web/app.js web/index.html tests/test_web.js tests/e2e
git commit -m "Match search by words and order results by match

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Spelling suggestions and Finder jobs

**Files:**
- Modify: `web/app-core.js` (add `editDistance`, `suggestNames`, `matchFinderGoal`; export them)
- Modify: `tests/test_web.js`

**Interfaces:**
- Produces:
  - `editDistance(a, b) → number` (optimal string alignment)
  - `suggestNames(records, raw, limit = 3) → string[]`
  - `matchFinderGoal(goals, raw) → goal | null`, where `goals` is `[{ id, direction, label, description, eligible }]`

- [ ] **Step 1: Write the failing tests**

Import `editDistance`, `matchFinderGoal`, and `suggestNames`, then append:

```js
test("a misspelled name suggests the closest whole names first", () => {
  assert.equal(editDistance("olama", "ollama"), 1);
  assert.equal(editDistance("form", "from"), 1);
  const records = [{ name: "Ollama Cloud" }, { name: "Ollama" }, { name: "Llama-3.1-70B-Instruct" }, { name: "Mem0" }];
  assert.deepEqual(suggestNames(records, "olama"), ["Ollama", "Ollama Cloud", "Llama-3.1-70B-Instruct"]);
  assert.deepEqual(suggestNames(records, "zz"), []);
});

test("a query names a Finder job when most of its words appear in it", () => {
  const goals = [
    { id: "personal_machine", direction: "local_runtime", label: "Run models on my own computer", description: "A packaged runner that manages download, storage, and local serving.", eligible: 4 },
    { id: "knowledge_assistant", direction: "memory_system", label: "Ask questions over documents", description: "A ready-to-use AI knowledge app or RAG workspace.", eligible: 9 },
    { id: "empty", direction: "memory_system", label: "Run everything locally", description: "Nothing qualifies.", eligible: 0 },
  ];
  assert.equal(matchFinderGoal(goals, "run models locally").id, "personal_machine");
  assert.equal(matchFinderGoal(goals, "rag").id, "knowledge_assistant");
  assert.equal(matchFinderGoal(goals, "ai"), null);
  assert.equal(matchFinderGoal(goals, "zebra crossing"), null);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL, `editDistance is not a function`.

- [ ] **Step 3: Implement them**

In `web/app-core.js`, after `mergePackScopeEntries`:

```js
  // Edits needed to turn one string into another, counting a swap of two
  // neighbouring letters as one edit ("form" is one edit from "from").
  function editDistance(a, b) {
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
    return rows[a.length][b.length];
  }

  // Record names within one edit (queries up to seven letters) or two (longer)
  // of a query that matched nothing. Whole names come before single words of
  // a name, closer before farther, shorter before longer.
  function suggestNames(records, raw, limit = 3) {
    const query = normalizeSearchText(raw).replace(/-/g, " ");
    if (query.length < 3) return [];
    const most = query.length >= 8 ? 2 : 1;
    const found = [];
    for (const record of records) {
      const name = normalizeSearchText(record.name).replace(/-/g, " ");
      const whole = editDistance(name, query);
      const nearestWord = Math.min(...name.split(" ").map(word => (Math.abs(word.length - query.length) <= most ? editDistance(word, query) : Infinity)));
      const best = Math.min(whole, nearestWord);
      if (best <= most) found.push({ name: record.name, rank: [whole <= most ? 0 : 1, best, record.name.length] });
    }
    found.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.name.localeCompare(b.name));
    return [...new Set(found.map(item => item.name))].slice(0, limit);
  }

  // The Finder goal a query most plausibly names: at least 60% of its words of
  // three letters or more, and at least one, appear in the goal's label or
  // description. A goal with nothing eligible never matches.
  function matchFinderGoal(goals, raw) {
    const tokens = parseSearchQuery(raw).tokens.filter(token => token.length >= 3);
    if (!tokens.length) return null;
    const needed = Math.max(1, Math.ceil(tokens.length * 0.6));
    let best = null;
    for (const goal of goals) {
      if (!goal.eligible) continue;
      const words = cachedSearchWords(`${goal.label} ${goal.description}`);
      const hits = tokens.filter(token => tokenHit(words, token, false) > 0).length;
      if (hits >= needed && (!best || hits > best.hits)) best = { goal, hits };
    }
    return best ? best.goal : null;
  }
```

Export `editDistance`, `matchFinderGoal`, and `suggestNames`.

- [ ] **Step 4: Run them and watch them pass**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Suggest names and Finder jobs for a search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Best match, a count beside the box, "/", and a query that follows the reader

**Files:**
- Modify: `web/app.js` (`MATCH_SORTS`, `syncMatchSort`, `setSearchCount`, the "/" handler, `setDirectoryCollection`, `applyFinderToDirectory`, and the render functions)
- Modify: `web/index.html` (an `<output class="search-count">` in every search field)
- Modify: `web/styles.css`
- Create: `tests/e2e/search.spec.js`

**Interfaces:**
- Consumes: Phase 0's `SCOPE_CONTROLS`, `activeScope()`, and `SCOPE_URL_PARAMS`; Task 2's `sort: "match"`.
- Produces: `setDirectoryCollection(collection, { updateURL, carryQuery })`, where `carryQuery` defaults to `updateURL`.

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e/search.spec.js`:

```js
const { test, expect } = require("@playwright/test");

async function searchAll(page, text) {
  await page.goto("/");
  const input = page.locator("#all-directory-search");
  await input.focus();
  await input.fill(text);
}

test("an exact name comes first", async ({ page }) => {
  await searchAll(page, "ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
});

test("hyphens and spaces ask the same question", async ({ page }) => {
  await searchAll(page, "self-hosted");
  const hyphenated = await page.locator("#all-directory-result-count").textContent();
  await page.locator("#all-directory-search").fill("self hosted");
  await expect(page.locator("#all-directory-result-count")).toHaveText(hyphenated);
});

test("the result count shows beside the box, uncovered, without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchAll(page, "ollama");
  const count = page.locator("#all-directory-panel .search-count");
  await expect(count).toHaveText(/^\d+ results?$/);
  await expect(count).toBeInViewport();
  const uncovered = await count.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element;
  });
  expect(uncovered).toBe(true);
});

test("slash focuses the search box", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(page.locator("#all-directory-search")).toBeFocused();
});

test("a query follows the reader to another scope, and Best match selects itself and gives way", async ({ page }) => {
  await searchAll(page, "coding agent");
  await page.getByRole("button", { name: /^Systems / }).click();
  await expect(page.locator("#project-search")).toHaveValue("coding agent");
  await expect(page.locator("#sort-filter")).toHaveValue("match");
  await page.locator("#project-search").fill("");
  await expect(page.locator("#sort-filter")).toHaveValue("name");
});

test("a sort chosen during a query is kept", async ({ page }) => {
  await page.goto("/?collection=inference");
  await page.locator("#inference-search").fill("api");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("match");
  await page.locator("#inference-sort-filter").selectOption("name");
  await page.locator("#inference-search").fill("apis");
  await expect(page.locator("#inference-sort-filter")).toHaveValue("name");
});
```

- [ ] **Step 2: Run them and watch the new behaviours fail**

Run: `npx playwright test tests/e2e/search.spec.js`
Expected: the first two pass after Task 2. The count, "/", follow, and sort tests fail.

- [ ] **Step 3: Implement the page behaviour**

In `web/index.html`, add `<output class="search-count" aria-hidden="true"></output>` directly after the `<input>` inside every `<label class="search-field">`. That covers All, Systems, Inference services, Local runtimes, Agent packs, Robots, Models, Labs, and Specifications. The live count in each result row stays the one screen readers hear.

Append to `web/styles.css`:

```css
/* The query's result count, beside the input, so typing shows its effect
   without scrolling. The live count in the result row stays the announced one. */
.search-field { position: relative; }
.search-field input { padding-right: 6.5rem; }
.search-count {
  position: absolute;
  right: .8rem;
  bottom: .7rem;
  color: var(--muted);
  font: 500 .72rem var(--font-mono);
}
```

In `web/app.js`, after `writeScopeURL`:

```js
// Scopes whose Sort control has "Best match": a query selects it unless the
// reader picked a sort since typing, and clearing the query gives back the
// sort from before (spec, Phase 1 "Order").
const MATCH_SORTS = { systems: "#sort-filter", inference: "#inference-sort-filter", runtimes: "#runtime-sort-filter", models: "#model-sort-filter" };
const sortBeforeQuery = {};
const sortChosenDuringQuery = {};

function syncMatchSort(scope) {
  const selector = MATCH_SORTS[scope];
  if (!selector) return;
  const select = $(selector);
  const hasQuery = Boolean($(SCOPE_CONTROLS[scope].q).value.trim());
  if (hasQuery && !sortChosenDuringQuery[scope] && select.value !== "match") {
    sortBeforeQuery[scope] = select.value;
    select.value = "match";
  } else if (!hasQuery) {
    if (select.value === "match") select.value = sortBeforeQuery[scope] || AtlasCore.SCOPE_URL_PARAMS[scope].sort;
    delete sortBeforeQuery[scope];
    sortChosenDuringQuery[scope] = false;
    if (scope === "systems") updateScoreSortAvailability();
  }
}

// "12 results" beside a search box while it holds a query.
function setSearchCount(scope, count) {
  const selector = SCOPE_CONTROLS[scope]?.q;
  const input = selector && $(selector);
  const badge = input && input.parentElement.querySelector(".search-count");
  if (badge) badge.textContent = input.value.trim() ? `${count} ${count === 1 ? "result" : "results"}` : "";
}
```

Call `setSearchCount`:
- in `renderAllDirectoryEntries`, with `("all", entries.length)`;
- in `renderCollection`, with `(name, records.length)`;
- in `renderPacks`, with `("packs", entries.length)`.

At the very top of `bindEvents()`, before any other listener, add:

```js
  for (const [scope, selector] of Object.entries(MATCH_SORTS)) {
    $(SCOPE_CONTROLS[scope].q).addEventListener("input", () => syncMatchSort(scope));
    $(selector).addEventListener("input", () => {
      if ($(SCOPE_CONTROLS[scope].q).value.trim()) sortChosenDuringQuery[scope] = true;
    });
  }
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const selector = SCOPE_CONTROLS[activeScope()]?.q;
    if (!selector) return;
    event.preventDefault();
    $(selector).focus();
  });
```

Change `setDirectoryCollection` so the query follows the reader, in three edits:

1. Change its signature to `function setDirectoryCollection(collection, { updateURL = true, carryQuery = updateURL } = {}) {`.
2. Directly after its first line, `const selected = …`, insert:

```js
  // Read before the scope changes: the query the reader is leaving.
  const previousQuery = carryQuery ? $(SCOPE_CONTROLS[state.directoryCollection].q).value : null;
```

3. Directly after the line `state.directoryCollection = selected;`, insert:

```js
  if (previousQuery !== null) {
    const input = $(SCOPE_CONTROLS[selected].q);
    if (input.value !== previousQuery) {
      input.value = previousQuery;
      state.page[selected] = 1;
    }
    syncMatchSort(selected);
  }
```

In `applyFinderToDirectory`, pass `{ carryQuery: false }` to its three `setDirectoryCollection` calls. The Finder clears the search on purpose.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx playwright test tests/e2e/search.spec.js tests/e2e/url-state.spec.js tests/e2e/directory-search.spec.js`
Expected: PASS.

- [ ] **Step 5: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/index.html web/styles.css tests/e2e/search.spec.js
git commit -m "Select Best match while searching and carry the query between scopes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Empty results that help, and the Finder job banner

**Files:**
- Modify: `web/app.js`:
  - add `finderGoalRecords` and `finderGoalEntries`, and refactor `finderCandidates` onto them;
  - add `openFinderAt`, `renderJobHint`, `excludedEntry`, `suggestionURL`, `emptyStateMarkup`, and `SCOPE_RECORDS`;
  - add a delegated click handler;
  - wire them into the render functions.
- Modify: `web/index.html` (job-hint containers)
- Modify: `web/styles.css`
- Modify: `tests/e2e/search.spec.js`

**Interfaces:**
- Consumes: Task 3's `suggestNames` and `matchFinderGoal`, and `normalizeSearchText`.
- Produces: `openFinderAt(direction, goalId)`.

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/search.spec.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

test("a misspelled name offers the right one", async ({ page }) => {
  await searchAll(page, "olama");
  const suggestion = page.getByRole("button", { name: "Ollama", exact: true });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(page.locator("#all-directory-search")).toHaveValue("Ollama");
  await expect(page.locator("#all-directory-grid .project-card h2").first()).toHaveText("Ollama");
});

test("a query with no match offers the Finder and a suggestion form", async ({ page }) => {
  await searchAll(page, "notion alternative");
  await expect(page.getByText("No matches for “notion alternative”.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try the Finder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Suggest it for review" }))
    .toHaveAttribute("href", /template=system-suggestion\.yml&name=notion%20alternative/);
});

test("a name the review left out says why", async ({ page }) => {
  // Serve a known exclusion so the test does not depend on which real
  // entries happen to be mentioned in some record's prose.
  const published = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "exclusions.json"), "utf8"));
  await page.route(/\/exclusions\.json(\?.*)?$/, route => route.fulfill({
    json: { ...published, entries: [{ ...published.entries[0], name: "Zyxwvut Frobnicator", reason: "Test reason: out of scope." }] },
  }));
  await searchAll(page, "Zyxwvut Frobnicator");
  await expect(page.getByText("Reviewed and left out:")).toBeVisible();
  await expect(page.getByText("Test reason: out of scope.")).toBeVisible();
});

test("an intent query offers the Finder job and opens its shortlist step", async ({ page }) => {
  await searchAll(page, "run models locally");
  const hint = page.locator('[data-job-hint="all"]');
  await expect(hint).toContainText("Run models on my own computer");
  await hint.getByRole("button", { name: /Open shortlist/ }).click();
  await expect(page.locator("#finder")).toHaveClass(/is-active/);
  await expect(page.locator("#finder-content h2")).toHaveText("What matters most?");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx playwright test tests/e2e/search.spec.js`
Expected: FAIL. No suggestion button, no empty-state copy, and no job hint exist yet.

- [ ] **Step 3: Implement it**

In `web/index.html`, insert `<div class="job-hint" data-job-hint="all" hidden></div>` directly before `#all-directory-grid`. Insert the same element, with `data-job-hint="systems"`, `"inference"`, or `"runtimes"`, before `#project-grid`, `#inference-grid`, and `#runtime-grid`.

In `web/app.js`, replace `finderCandidates` and add the helpers after it:

```js
// The records a Finder goal can draw on: active systems in its family and
// role set, or services or runtimes of its type (docs/WEB.md).
function finderGoalRecords(direction, goalConfig) {
  if (direction === "inference_service") return state.inferenceServices.filter(item => goalConfig.serviceTypes.includes(item.service_type));
  if (direction === "local_runtime") return state.localRuntimes.filter(item => goalConfig.runtimeTypes.includes(item.runtime_type));
  return state.projects.filter(item => item.status === "active" && item.system_family === direction && goalConfig.roles.includes(item.primary_role));
}

function finderCandidates() {
  const { direction, goal } = state.finder.answers;
  const goalConfig = FINDER_GOALS[direction]?.find(item => item.id === goal);
  return goalConfig ? finderGoalRecords(direction, goalConfig) : [];
}

let finderGoalList = null;
function finderGoalEntries() {
  finderGoalList ||= Object.entries(FINDER_GOALS).flatMap(([direction, goals]) =>
    goals.map(goal => ({ ...goal, direction, eligible: finderGoalRecords(direction, goal).length })));
  return finderGoalList;
}

function openFinderAt(direction, goal) {
  state.finder = { step: 2, answers: { direction, goal } };
  renderFinder();
  activateView("finder");
}

function renderJobHint(scope, term) {
  const hint = $(`[data-job-hint="${scope}"]`);
  if (!hint) return;
  const goal = term.trim() ? AtlasCore.matchFinderGoal(finderGoalEntries(), term) : null;
  hint.hidden = !goal;
  hint.innerHTML = goal
    ? `<span>Looks like a job: <strong>${escapeHTML(goal.label)}</strong>. The Finder can shortlist from ${goal.eligible} reviewed ${goal.eligible === 1 ? "record" : "records"}.</span><button type="button" class="link-button" data-finder-goal="${escapeHTML(`${goal.direction}:${goal.id}`)}">Open shortlist →</button>`
    : "";
}

// Records each scope's did-you-mean draws from, so a suggestion always
// matches something in the scope it is offered in.
const SCOPE_RECORDS = {
  all: () => [...state.projects, ...state.inferenceServices, ...state.localRuntimes, ...state.models, ...state.packs, ...state.robots],
  systems: () => state.projects,
  inference: () => state.inferenceServices,
  runtimes: () => state.localRuntimes,
  packs: () => [...state.packs, ...AtlasCore.packShapedSystems(state.projects, {})],
  robots: () => state.robots,
  models: () => state.models,
  labs: () => state.labs,
  specifications: () => state.specifications,
};

let exclusionsRequest = null;
function excludedEntry(term) {
  if (!state.exclusions) {
    exclusionsRequest ||= loadJSON("exclusions.json")
      .then(data => { state.exclusions = data.entries || []; })
      .catch(() => { state.exclusions = []; })
      .then(() => pageRenderer(activeScope())?.());
    return null;
  }
  const wanted = AtlasCore.normalizeSearchText(term);
  return state.exclusions.find(entry => AtlasCore.normalizeSearchText(entry.name) === wanted) || null;
}

function suggestionURL(term) {
  return `https://github.com/katagun/ai-systems-atlas/issues/new?template=system-suggestion.yml&name=${encodeURIComponent(term.trim())}`;
}

function emptyStateMarkup(scope, fallback) {
  const selector = SCOPE_CONTROLS[scope]?.q;
  const term = selector ? $(selector).value : "";
  if (!term.trim()) return `<div class="notice">${fallback}</div>`;
  const names = AtlasCore.suggestNames(SCOPE_RECORDS[scope]?.() || [], term);
  const excluded = excludedEntry(term);
  return `<div class="notice empty-search">
    <p><strong>No matches for “${escapeHTML(term.trim())}”.</strong></p>
    ${names.length ? `<p>Did you mean ${names.map(name => `<button type="button" class="link-button" data-suggest-query="${escapeHTML(name)}">${escapeHTML(name)}</button>`).join(", ")}?</p>` : ""}
    ${excluded ? `<p><strong>Reviewed and left out:</strong> ${escapeHTML(excluded.name)}. ${escapeHTML(excluded.reason)}</p>` : ""}
    <p><button type="button" class="link-button" data-empty-finder>Try the Finder</button> · <a href="${escapeHTML(suggestionURL(term))}" target="_blank" rel="noreferrer">Suggest it for review</a></p>
  </div>`;
}
```

Wire them in:
1. `renderAllDirectoryEntries`: replace the fallback `'<div class="notice">No systems, … match this search.</div>'` with `emptyStateMarkup("all", "No systems, model releases, inference services, local runtimes, or agent packs match this search.")`, and call `renderJobHint("all", $("#all-directory-search").value);`.
2. `renderCollection(name)`: replace `` `<div class="notice">${collection.empty}</div>` `` with `emptyStateMarkup(name, collection.empty)`, and call `renderJobHint(name, $(SCOPE_CONTROLS[name].q).value);`. The function returns early for scopes without a hint container.
3. `renderPacks`: replace its empty notice the same way with scope `"packs"`.

In `bindEvents`, add one delegated handler:

```js
  document.addEventListener("click", event => {
    const suggestion = event.target.closest("[data-suggest-query]");
    if (suggestion) {
      const selector = SCOPE_CONTROLS[activeScope()]?.q;
      if (!selector) return;
      const input = $(selector);
      input.value = suggestion.dataset.suggestQuery;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      return;
    }
    const goal = event.target.closest("[data-finder-goal]");
    if (goal) {
      const [direction, id] = goal.dataset.finderGoal.split(":");
      openFinderAt(direction, id);
      return;
    }
    if (event.target.closest("[data-empty-finder]")) activateView("finder");
  });
```

Append to `web/styles.css`:

```css
.job-hint {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: .5rem 1rem;
  margin: 0 0 1rem;
  padding: .7rem 1rem;
  border: 1px solid color-mix(in srgb, var(--cyan) 30%, var(--line));
  border-radius: var(--radius-control);
  background: var(--sage-soft);
  color: var(--sage-ink);
  font-size: .9rem;
}
.job-hint strong { color: var(--text); }
.empty-search p { margin: 0 0 .5rem; }
.empty-search p:last-child { margin-bottom: 0; }
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx playwright test tests/e2e/search.spec.js tests/e2e/directory-search.spec.js tests/e2e/page-health.spec.js`
Expected: PASS. `page-health` confirms that no request leaves the origin: the suggestion form is a link, not a request.

- [ ] **Step 5: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/index.html web/styles.css tests/e2e/search.spec.js
git commit -m "Turn empty searches into suggestions and offer the matching Finder job

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ADR 040 and the web contract

**Files:**
- Create: `docs/adr/040-search-orders-by-match-never-by-score.md`
- Modify: `docs/adr/013-distinct-collections-share-one-directory-surface.md`, `docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md`, `docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md`, and `docs/adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md` (status lines)
- Modify: `docs/WEB.md`
- Modify: `tests/test_documentation.py` (routing manifest)

**Interfaces:** none.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/040-search-orders-by-match-never-by-score.md`:

```markdown
# ADR 040: Search orders by match, never by score

**Status:** Accepted. Amends [ADR 013](013-distinct-collections-share-one-directory-surface.md), [ADR 032](032-agent-packs-are-unscored-records-of-what-a-host-installs.md), [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md), and [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md).

## Context

Directory search matched the whole query as one literal substring and listed matches in each scope's browsing order. Measured on 2026-09-23 against the live catalog:
- Searching "ollama" listed Ollama 17th of 20.
- "run models locally", "memory for agents", "open source coding agent", and "self hosted" found nothing, while "self-hosted" found 51.
- "rag" and "mac" matched inside other words.

A reader who knew what they wanted could not find it first, and a reader who described a need found nothing.

ADR 013 made All "alphabetical discovery", ADR 032 made the Packs scope "alphabetical only", ADR 037 lists robots alphabetically, and ADR 041 makes the Labs view "alphabetical only". Those rules exist so that an order never implies merit: none of those lists may be ranked by score, and packs, robots, and labs carry no score at all.

## Decision

A search matches words and orders its results by how well each record matches the query. It never orders by score, stars, or any other merit.

- **Every query word must match.** Case, accents, hyphens, and plurals do not matter.
- **Word length decides how a word may match:**
  - Four or more letters: the start of any word, or anywhere inside a word of the record's name.
  - Three letters: a whole word, or anywhere inside a name word.
  - Two letters: a whole word, or the start of a name word.
  - One letter: the start of a name word.
- **Where a word lands decides the order.** A match in the record's name counts most, then its role or type, then its maker, then its description, then its other searchable prose. Among equal matches, active records come first, then names A–Z.
- **Browsing keeps each scope's own order.** With no query, All, Agent packs, Specifications, Labs, and Robots are A–Z, and scored scopes use their default sort.
- **Best match.** Scopes with a Sort control gain "Best match", which a query selects unless the reader has chosen a sort. Scores stay visible exactly where ADR 014 allows them.

Each collection's searchable text is unchanged (ADR 026's search indexes). A match weight is computed in the browser, is never published, and never appears on a card.

## Consequences

- ADR 013's All bullet, ADR 032's "The scope is alphabetical only", ADR 037's "They are listed alphabetically", and ADR 041's "The view is alphabetical only" now describe browsing; a query orders by match. The Robots session, which owns ADR 037, and the Labs session, which owns ADR 041, agreed on 2026-09-24. ADR 041's other rules stay: no score, no sort control, no comparison.
- A known name comes first: "ollama" lists Ollama first. A split or misspelled name is still found: "lang chain" finds LangChain, and "olama" suggests Ollama.
- Search no longer matches inside prose words, so "rag" stops matching "storage". It still matches inside names, so "gpt" finds ChatGPT.
- Tests pin the matching rules against fixtures and the probe queries against the published catalog.
```

- [ ] **Step 2: Mark the amended ADRs**

Append this sentence to the status line of ADR 013, ADR 032, ADR 037, and ADR 041. If a status line already lists amendments, add ADR 040 to that list instead.

```markdown
Amended by [ADR 040](040-search-orders-by-match-never-by-score.md) (search order).
```

- [ ] **Step 3: Update `docs/WEB.md`**

1. "Content hierarchy": change "In All, expose one shared search, sort alphabetically, and hide numeric scores." to "In All, expose one shared search, list alphabetically while browsing and by match while searching (ADR 040, linked as shown below), and hide numeric scores." In the Labs and Agent packs bullets, change "alphabetical" to "alphabetical while browsing and ordered by match while searching".
2. "Behavioral contracts": replace the bullet "A one-character directory search matches prefixes of words in system names; two-character searches require a complete word to avoid false positives such as `Pi` inside `API`." with:
   - "Search matches words, not substrings. Every query word must match; case, accents, hyphens, and plurals do not matter. Words of four or more letters match the start of any word, and anywhere inside a word of the record's name. Three-letter words match a whole word or anywhere inside a name word. Two-letter words match a whole word or the start of a name word; one letter matches the start of a name word. So `Pi` never matches `API`, and `rag` never matches `storage`. A query orders every scope by match, never by score or stars; browsing keeps each scope's own order (ADR 040, linked as shown below)."
   - "Scopes with a Sort control offer \"Best match\", which a query selects unless the reader chose a sort; clearing the query restores the earlier sort."
   - "When a query matches nothing, the result offers up to three record names within a small edit distance, the Finder, and \"Suggest it for review\", a link to the suggestion form with the Name field filled in. It also names an `exclusions.json` entry with its reason when the query is that entry's name. `exclusions.json` loads only then."
   - "When a query names a Finder goal, a banner above the All, Systems, Inference services, and Local runtimes results offers that goal's shortlist."
   - "\"/\" focuses the visible search box. A query follows the reader between Directory scopes, and each search box shows its result count beside the input."
3. In the Specifications, Agent packs, Labs, and Robots contract bullets, change "Results are alphabetical" (or "alphabetic") to "Results are alphabetical while browsing and ordered by match while searching". In the Inference services, Local runtimes, and Models bullets, add after the default-sort sentence: "A query selects Best match."
4. Verification step 11: append "In All, search `ollama` and confirm Ollama leads. Confirm `self hosted` and `self-hosted` return the same set, and `olama` offers Ollama. Confirm a query with no match offers the Finder and \"Suggest it for review\", `run models locally` offers its Finder job, and \"/\" focuses search."

Wherever these sentences say "ADR 040, linked as shown below", write the link like this, which also makes the ADR reachable from `AGENTS.md`:

```markdown
[ADR 040](adr/040-search-orders-by-match-never-by-score.md)
```

- [ ] **Step 4: Add the ADR to the routing manifest**

In `tests/test_documentation.py`, add `"docs/adr/040-search-orders-by-match-never-by-score.md",` to the list in `test_task_routing_documents_exist` after the ADR 038 entry.

- [ ] **Step 5: Run the documentation and web suites**

Run: `uv run python -m unittest tests.test_documentation -v && /usr/local/bin/node --test tests/test_web.js`
Expected: PASS. The ADR is reachable from `AGENTS.md` through `docs/WEB.md`'s link.

- [ ] **Step 6: Commit, check the ADR number, open the PR**

```bash
git add docs/adr/040-search-orders-by-match-never-by-score.md docs/adr/013-distinct-collections-share-one-directory-surface.md docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md docs/adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md docs/WEB.md tests/test_documentation.py
git commit -m "Record ADR 040: search orders by match, never by score

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git fetch origin && git ls-tree --name-only origin/main docs/adr/ | grep 040 || echo "040 free"
gh pr create --title "Rank Directory search by match, never by score (ADR 040)" --fill
```

Run the full browser verification matrix in `docs/WEB.md` before merging. Merge once checks pass.
