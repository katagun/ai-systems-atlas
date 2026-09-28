(function exposeAtlasCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createAtlasCore() {
  function directoryDefaults() {
    return {
      term: "",
      family: "",
      role: "",
      roles: [],
      agent: "",
      architecture: "",
      deployment: "",
      agentInterface: "",
      sourceModel: "",
      license: "",
      status: "active",
      localOnly: false,
      sort: "name",
    };
  }

  function monogramGlyph(name) {
    return (String(name || "").match(/[a-zA-Z0-9]/)?.[0] || "•").toUpperCase();
  }

  // Search (ADR 040): words, not substrings; results ordered by match, never
  // by score.
  const SEARCH_STOP_WORDS = new Set(["a", "an", "the", "for", "with", "my", "to", "of", "and", "on", "in", "i", "me"]);

  // Lower case with accents dropped; every character other than a letter, a
  // digit, ".", "+", "#", or "-" becomes a space.
  function normalizeSearchText(text) {
    return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
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

  // A query or a name as search compares them: a hyphen reads as a space and
  // a period that ends a word is dropped, so "self-hosted" asks what "self
  // hosted" asks and "ollama." what "ollama" asks, while ".net" and
  // "llama.cpp" stay whole.
  function comparableText(text) {
    return normalizeSearchText(text).replace(/-/g, " ").replace(/\.+(?=\s|$)/g, "").replace(/\s+/g, " ").trim();
  }

  // `words` holds each query word as typed, index for index with its stem in
  // `tokens`, because a stem is not always a prefix of its own spelling:
  // "series" stems to "sery".
  function parseSearchQuery(raw) {
    const words = comparableText(raw).split(" ")
      .filter(word => word && !SEARCH_STOP_WORDS.has(word));
    const tokens = words.map(stemQueryWord);
    return { raw: String(raw || ""), text: tokens.join(" "), tokens, words };
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

  function compareProjects(sort) {
    if (sort === "stars") return (a, b) => (b.stars ?? -1) - (a.stars ?? -1);
    if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
    return (a, b) => b.score.overall - a.score.overall || a.name.localeCompare(b.name);
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

  const INFERENCE_SERVICE_VIEW = {
    kind: "inference",
    searchFields: [
      "id", "name", "operator", "description", "service_boundary", "regional_controls",
      "retention_controls", "routing", "customization", "strengths", "tradeoffs",
    ],
    facets: {
      type: "service_type",
      delivery: "delivery_modes",
      modelSource: "model_sources",
      apiStyle: "api_styles",
    },
  };

  const LOCAL_RUNTIME_VIEW = {
    kind: "runtime",
    searchFields: [
      "id", "name", "maintainer", "description", "runtime_boundary", "model_management",
      "hardware_requirements", "operational_controls", "strengths", "tradeoffs",
    ],
    facets: {
      type: "runtime_type",
      accelerator: "accelerators",
      modelFormat: "model_formats",
      apiStyle: "api_styles",
    },
  };

  const MODEL_VIEW = {
    kind: "model",
    searchFields: [
      "id", "source_id", "name", "developer", "description", "access_boundary",
      "strengths", "tradeoffs",
    ],
    facets: {
      type: "model_type",
      distribution: "distribution_modes",
      sourceModel: "source_model",
      license: "licenses",
    },
  };

  // Packs are unscored (ADR 032): the shared collection filter is reused for its
  // facets and search, and unscoredSort pins the sort so no caller can ask for a
  // score order that does not exist.
  const PACK_VIEW = {
    kind: "pack",
    searchFields: ["id", "name", "short_name", "steward", "repo", "description"],
    facets: {
      type: "pack_type",
      host: "hosts",
      install: "install_mechanism",
      license: "licenses",
    },
  };

  // Unscored collections are A–Z while browsing and ordered by match while
  // searching (ADR 032, ADR 037, ADR 040, ADR 041).
  const unscoredSort = filters => (String(filters.term || "").trim() ? "match" : "name");

  function filterPacks(packs, filters = {}) {
    return filterScoredCollection(packs, { ...filters, sort: unscoredSort(filters) }, PACK_VIEW);
  }

  // Labs are unscored organizations (ADR 041). A lab stores the names the other
  // collections use for it and the ids of the systems it builds; everything else
  // is joined here by the rules scripts/lab_relations.py states for the validator
  // and share pages. `models` is the page's overlaid list, so a reviewed release
  // carries review_status "reviewed" and an imported models.dev row "imported".
  const LAB_VIEW = {
    kind: "lab",
    searchFields: ["id", "name", "description", "catalog_names", "parent_organization"],
    facets: {
      type: "lab_type",
      headquarters: "headquarters",
    },
  };

  function sourceNamespace(sourceId) {
    if (typeof sourceId !== "string") return null;
    const separator = sourceId.indexOf("/");
    return separator > 0 ? sourceId.slice(0, separator) : null;
  }

  function labRelations(lab, catalog = {}) {
    const names = new Set(lab.catalog_names || []);
    const systemIds = new Set(lab.systems || []);
    const models = catalog.models || [];
    const reviewed = models.filter(model => model.review_status !== "imported" && names.has(model.developer));
    const namespaces = [...new Set(reviewed.map(model => sourceNamespace(model.source_id)).filter(Boolean))].sort();
    return {
      models: reviewed,
      namespaces,
      sourceRows: models.filter(model => model.review_status === "imported" && namespaces.includes(sourceNamespace(model.source_id))),
      services: (catalog.services || []).filter(item => names.has(item.operator)),
      runtimes: (catalog.runtimes || []).filter(item => names.has(item.maintainer)),
      specifications: (catalog.specifications || []).filter(item => (item.stewards || []).some(name => names.has(name))),
      packs: (catalog.packs || []).filter(item => names.has(item.steward)),
      systems: (catalog.projects || []).filter(item => systemIds.has(item.id)),
    };
  }

  // Release dates are models.dev metadata (or Atlas-authored for a release it
  // does not list), partial as YYYY-MM or full as YYYY-MM-DD; both sort as text.
  function releaseDate(model) {
    return model.source_metadata?.release_date || "";
  }

  function releasesNewestFirst(models) {
    return [...models].sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)) || a.name.localeCompare(b.name));
  }

  // The union of the distribution modes the lab's reviewed releases carry, in
  // taxonomy order: each release keeps its own conclusion (ADR 025), and the
  // lab only shows which ones occur.
  function labDistributionModes(models, order = []) {
    const present = new Set(models.flatMap(model => model.distribution_modes || []));
    return [...order.filter(mode => present.has(mode)), ...[...present].filter(mode => !order.includes(mode)).sort()];
  }

  // Labs sort as the other unscored collections do; the distribution facet keeps
  // a lab with at least one reviewed release distributed that way, so it needs
  // the catalog's models.
  function filterLabs(labs, filters = {}) {
    return filterScoredCollection(labs, { ...filters, sort: unscoredSort(filters) }, LAB_VIEW).filter(lab =>
      !filters.distribution || labRelations(lab, { models: filters.models || [] }).models
        .some(model => (model.distribution_modes || []).includes(filters.distribution)));
  }

  // Which lab claims each name, system, and models.dev namespace, so a record
  // dialog can link to its lab without re-joining every lab on every paint.
  function buildLabIndex(labs = [], models = []) {
    const byName = new Map();
    const bySystem = new Map();
    const byNamespace = new Map();
    for (const lab of labs) {
      for (const name of lab.catalog_names || []) byName.set(name, lab);
      for (const id of lab.systems || []) bySystem.set(id, lab);
    }
    for (const model of models) {
      if (model.review_status === "imported") continue;
      const lab = byName.get(model.developer);
      const namespace = sourceNamespace(model.source_id);
      if (lab && namespace && !byNamespace.has(namespace)) byNamespace.set(namespace, lab);
    }
    return { byName, bySystem, byNamespace };
  }

  // The labs a record belongs to by its collection's join rule; a specification
  // with several stewards can belong to more than one.
  function labsForRecord(kind, record, index) {
    if (!index || !record) return [];
    let labs;
    if (kind === "system") labs = [index.bySystem.get(record.id)];
    else if (kind === "model") {
      labs = [record.review_status === "imported"
        ? index.byNamespace.get(sourceNamespace(record.source_id))
        : index.byName.get(record.developer)];
    } else if (kind === "inference") labs = [index.byName.get(record.operator)];
    else if (kind === "runtime") labs = [index.byName.get(record.maintainer)];
    else if (kind === "spec") labs = (record.stewards || []).map(name => index.byName.get(name));
    else if (kind === "pack") labs = [index.byName.get(record.steward)];
    else labs = [];
    return [...new Set(labs.filter(Boolean))];
  }

  // Robots are unscored (ADR 037): the shared collection filter supplies the
  // facets and search, and unscoredSort pins the sort so no caller can ask for
  // a score order that does not exist.
  const ROBOT_VIEW = {
    kind: "robot",
    searchFields: ["id", "name", "short_name", "manufacturer", "description"],
    facets: {
      formFactor: "form_factor",
      aiBasis: "ai_basis",
      availability: "availability",
      status: "status",
    },
  };

  // The fields each collection searches until its index arrives, so a missing
  // index narrows a search, never widens it (for systems, the mixed
  // directory's old list).
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

  // How query word `i` hits one field's words: the better of its stem and the
  // word as typed, so "series" still finds "series" although it stems to
  // "sery".
  function queryWordHit(words, query, i, inName) {
    const token = query.tokens[i];
    const typed = (query.words || query.tokens)[i];
    const hit = tokenHit(words, token, inName);
    return typed === token ? hit : Math.max(hit, tokenHit(words, typed, inName));
  }

  // A record's match weight: 0 when any query word misses every field, since
  // every word must match. Otherwise the number only orders results; it never
  // reads a score, stars, or any other merit (ADR 040). The name bonuses also
  // compare the query as typed, since stemming ("Swarms") and stop words
  // ("A-MEM") change the stemmed text.
  function searchMatch(query, fields) {
    if (!query.tokens.length) return 1;
    const words = Object.fromEntries(Object.keys(SEARCH_FIELD_WEIGHTS).map(field => [field, cachedSearchWords(fields[field])]));
    const nameHasAll = query.tokens.every((_, i) => queryWordHit(words.name, query, i, true) > 0);
    let weight = 0;
    for (let i = 0; i < query.tokens.length; i += 1) {
      let best = 0;
      for (const [field, fieldWeight] of Object.entries(SEARCH_FIELD_WEIGHTS)) {
        const inName = field === "name";
        best = Math.max(best, queryWordHit(words[field], query, i, inName) * (inName && !nameHasAll ? 12 : fieldWeight));
      }
      if (!best) return 0;
      weight += best;
    }
    const name = comparableText(fields.name);
    const typed = comparableText(query.raw);
    if (name === query.text || name === typed) return weight + 1000;
    if (name.startsWith(query.text) || (typed && name.startsWith(typed))) return weight + 400;
    return nameHasAll ? weight + 200 : weight;
  }

  // A split product name still comes first: "lang chain" also tries
  // "langchain", and a record whose name holds the joined word counts as a
  // name match. The typed words are joined beside their stems.
  function recordMatch(query, fields) {
    let weight = searchMatch(query, fields);
    const nameWords = cachedSearchWords(fields.name);
    const join = (list, i) => [...list.slice(0, i), list[i] + list[i + 1], ...list.slice(i + 2)];
    for (let i = 0; i < query.tokens.length - 1; i += 1) {
      const tokens = join(query.tokens, i);
      const joined = { raw: query.raw, text: tokens.join(" "), tokens, words: join(query.words || query.tokens, i) };
      if (!tokens.every((_, j) => queryWordHit(nameWords, joined, j, true) > 0)) continue;
      weight = Math.max(weight, searchMatch(joined, fields) + 300);
    }
    return weight;
  }

  // Every record status the taxonomy defines that means a record is no longer
  // current, from project_statuses (systems, packs, robots) and
  // specification_statuses; no other kind carries a status. Among equal
  // matches, every other record comes first (ADR 040).
  const INACTIVE_STATUSES = new Set(["archived", "superseded", "removed"]);
  const isActiveRecord = record => !INACTIVE_STATUSES.has(record.status);

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

  function filterRobots(robots, filters = {}) {
    return filterScoredCollection(robots, { ...filters, sort: unscoredSort(filters) }, ROBOT_VIEW);
  }

  function filterInferenceServices(services, filters = {}) {
    return filterScoredCollection(services, filters, INFERENCE_SERVICE_VIEW);
  }

  function filterLocalRuntimes(runtimes, filters = {}) {
    return filterScoredCollection(runtimes, filters, LOCAL_RUNTIME_VIEW);
  }

  // `ids`, when present, narrows to one lab's releases: its reviewed rows and the
  // imported rows in its namespaces, which the caller resolves with labRelations.
  // The "release" sort orders reviewed and imported rows together, newest first:
  // the release date is models.dev metadata both carry, not a score.
  function filterModels(models, filters = {}) {
    const matches = filterScoredCollection(models, filters, MODEL_VIEW).filter(model =>
      (!filters.modality || [
        ...(model.source_metadata?.modalities?.input || []),
        ...(model.source_metadata?.modalities?.output || []),
      ].includes(filters.modality)) &&
      (!filters.ids || filters.ids.has(model.id))
    );
    return filters.sort === "release" ? releasesNewestFirst(matches) : matches;
  }

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

  // Scored systems that install into a host agent as a skills bundle, plugin,
  // or vault (deployment mode host_pack, ADR 034). The Packs scope lists them
  // beside the unscored packs; the search term is the only filter that applies,
  // because pack facets describe packs, not systems.
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
      .sort((a, b) => b.weight - a.weight
        || Number(isActiveRecord(b.entry.record)) - Number(isActiveRecord(a.entry.record))
        || byName(a.entry, b.entry))
      .map(item => item.entry);
  }

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
    const query = comparableText(raw);
    if (query.length < 3) return [];
    const most = query.length >= 8 ? 2 : 1;
    const found = [];
    for (const record of records) {
      const name = comparableText(record.name);
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
  // description. A goal with nothing eligible never matches. Each kept
  // position is scored with queryWordHit, the better of its stem and its
  // typed spelling, since a stem is not always a prefix of its own spelling
  // ("libraries" stems to "library"): a stem-only hit test would miss it.
  function matchFinderGoal(goals, raw) {
    const query = parseSearchQuery(raw);
    const positions = [...query.tokens.keys()].filter(i => query.tokens[i].length >= 3);
    if (!positions.length) return null;
    const needed = Math.max(1, Math.ceil(positions.length * 0.6));
    let best = null;
    for (const goal of goals) {
      if (!goal.eligible) continue;
      const goalWords = cachedSearchWords(`${goal.label} ${goal.description}`);
      const hits = positions.filter(i => queryWordHit(goalWords, query, i, false) > 0).length;
      if (hits >= needed && (!best || hits > best.hits)) best = { goal, hits };
    }
    return best ? best.goal : null;
  }

  // Which one switcher chip is pressed. `entries` describes the buttons in
  // order: { collection, family }, with no family on a collection-wide chip.
  // A family chip wins over its collection's chip, so choosing Memory never
  // also presses Systems: the controls are mutually exclusive (docs/WEB.md).
  function activeSwitcherIndex(entries, { collection, family = "" }) {
    if (family) {
      const familyIndex = entries.findIndex(entry => entry.collection === collection && entry.family === family);
      if (familyIndex !== -1) return familyIndex;
    }
    return entries.findIndex(entry => entry.collection === collection && entry.family === undefined);
  }

  // What each switcher chip counts: exactly what its scope lists by default.
  // Systems and the family chips open on directoryDefaults().status, so they
  // count active records; All lists everything, archived references
  // included; Agent packs lists packs beside host-installed systems (ADR 035).
  function switcherCounts({ projects = [], services = [], runtimes = [], models = [], packs = [], robots = [], labs = [], specifications = [] }) {
    const { status } = directoryDefaults();
    const listed = projects.filter(project => !status || project.status === status);
    const family = id => listed.filter(project => project.system_family === id).length;
    return {
      all: projects.length + services.length + runtimes.length + models.length + packs.length + robots.length,
      systems: listed.length,
      memory_system: family("memory_system"),
      agent_system: family("agent_system"),
      assistant_system: family("assistant_system"),
      inference: services.length,
      runtimes: runtimes.length,
      models: models.length,
      packs: packs.length + packShapedSystems(projects, {}).length,
      robots: robots.length,
      labs: labs.length,
      specifications: specifications.length,
    };
  }

  // Every URL parameter a scope writes, with its default. The keys are the
  // ones the scope's filter already reads — directoryDefaults() for Systems,
  // the view descriptors' facets elsewhere — so a parameter means the same in
  // the URL and in the code; `q` is the scope's query. A value equal to its
  // default is never written, and while a query is present a sort's default
  // is Best match (scopeURLParams).
  const SCOPE_URL_PARAMS = {
    all: { q: "" },
    systems: { q: "", family: "", role: "", agent: "", architecture: "", deployment: "", agentInterface: "", sourceModel: "", license: "", status: "active", localOnly: "", sort: "name" },
    inference: { q: "", type: "", delivery: "", modelSource: "", apiStyle: "", sort: "score" },
    runtimes: { q: "", type: "", accelerator: "", modelFormat: "", apiStyle: "", sort: "score" },
    packs: { q: "", type: "", host: "", install: "", license: "" },
    robots: { q: "", formFactor: "", aiBasis: "", availability: "", status: "" },
    models: { q: "", type: "", distribution: "", modality: "", sourceModel: "", license: "", lab: "", sort: "score" },
    labs: { q: "", type: "", headquarters: "", distribution: "" },
    specifications: { q: "", type: "", scope: "", status: "", license: "" },
  };
  const SCOPE_URL_KEYS = [...new Set(Object.values(SCOPE_URL_PARAMS).flatMap(Object.keys)), "page"];

  // A query lists by Best match unless the reader chose another sort, so
  // while one is present the URL leaves out "match" and names any other sort,
  // the browsing default included. A reload or a shared link then restores
  // the sort the reader chose (ruling R-P1-2b).
  function scopeURLParams(scope, values = {}) {
    const searching = String(values.q ?? "").trim() !== "";
    return Object.entries(SCOPE_URL_PARAMS[scope] || {})
      .filter(([key, fallback]) => values[key] !== undefined
        && String(values[key]) !== (key === "sort" && searching ? "match" : fallback))
      .map(([key]) => [key, String(values[key])]);
  }

  // `allowed` maps each key to the Set of values its control offers, or to
  // "text" for free text. A present parameter the control cannot take, or one
  // this scope does not own, comes back in `rejected`, so the caller removes it
  // rather than applying part of a state.
  function readScopeURLParams(scope, params, allowed = {}) {
    const owned = SCOPE_URL_PARAMS[scope] || {};
    const values = {};
    const rejected = [];
    for (const key of SCOPE_URL_KEYS) {
      if (key === "page" || !params.has(key)) continue;
      const value = params.get(key);
      const accepts = allowed[key];
      if (key in owned && (accepts === "text" || (accepts instanceof Set && accepts.has(value)))) values[key] = value;
      else rejected.push(key);
    }
    const page = params.get("page");
    if (page !== null) {
      if (/^[1-9]\d*$/.test(page)) values.page = Number(page);
      else rejected.push("page");
    }
    return { values, rejected };
  }

  // Which scope a URL's filters belong to: the Directory collection it names,
  // or All. Finder, Taxonomy, and API carry none. Legacy sibling-view URLs
  // (?view=models|labs|specifications) resolve to their collection so shared
  // links keep working after the unified catalog move.
  function scopeFromURL(params) {
    const view = params.get("view");
    if (["models", "labs", "specifications"].includes(view)) return view;
    if (view && view !== "directory") return null;
    const collection = params.get("collection");
    if (["systems", "inference", "runtimes", "packs", "robots", "models", "labs", "specifications"].includes(collection)) return collection;
    return "all";
  }

  function paginate(items, { page = 1, pageSize } = {}) {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const clampedPage = Math.min(Math.max(1, page), pageCount);
    const start = (clampedPage - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page: clampedPage, pageCount, totalCount: items.length };
  }

  function updateComparisonSelection(current = {}, candidate, maxItems = 4) {
    const sameProfile = current.kind === candidate.kind && current.profile === candidate.profile;
    const ids = sameProfile ? [...(current.ids || [])] : [];
    const selectedIndex = ids.indexOf(candidate.id);
    if (selectedIndex >= 0) ids.splice(selectedIndex, 1);
    else if (ids.length >= maxItems) return { ...current, limitReached: true };
    else ids.push(candidate.id);
    return {
      kind: ids.length ? candidate.kind : null,
      profile: ids.length ? candidate.profile : null,
      ids,
      limitReached: false,
    };
  }

  // Record references come from the URL. The kind is checked against a static
  // list on purpose: a lookup keyed on user input could resolve inherited names
  // such as "constructor", and an id is a plain slug or it is nothing.
  const RECORD_KINDS = ["system", "spec", "inference", "runtime", "model", "pack", "lab", "robot"];
  const RECORD_ID = /^[\w.-]+$/;
  function parseRecordReference(raw) {
    if (typeof raw !== "string") return null;
    const separator = raw.indexOf(":");
    if (separator < 1) return null;
    const kind = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (!RECORD_KINDS.includes(kind) || !RECORD_ID.test(id)) return null;
    return { kind, id };
  }

  // The view parameter names a primary navigation view. It is matched against a
  // static list for the same reason a record kind is: a lookup keyed on the URL
  // could resolve an inherited name such as "constructor". Models, labs, and
  // specifications are Directory collections; their legacy view values resolve
  // through VIEW_ALIASES so shared links keep landing on the right collection.
  const VIEW_IDS = ["directory", "finder", "taxonomy", "api"];
  const VIEW_ALIASES = { models: "models", labs: "labs", specifications: "specifications" };
  function parseViewId(raw) {
    return typeof raw === "string" && VIEW_IDS.includes(raw) ? raw : null;
  }
  function parseViewAlias(raw) {
    return typeof raw === "string" && Object.hasOwn(VIEW_ALIASES, raw) ? VIEW_ALIASES[raw] : null;
  }

  // Share pages are generated by scripts/build_share_pages.py under
  // web/records/<collection>/<id>/; this is the one place the two agree on paths.
  function shareRecordPath(kind, id) {
    if (kind === "system") return `records/systems/${id}/`;
    if (kind === "spec") return `records/specifications/${id}/`;
    if (kind === "inference") return `records/inference-services/${id}/`;
    if (kind === "runtime") return `records/local-runtimes/${id}/`;
    if (kind === "model") return `records/models/${id}/`;
    if (kind === "pack") return `records/packs/${id}/`;
    if (kind === "lab") return `records/labs/${id}/`;
    if (kind === "robot") return `records/robots/${id}/`;
    return null;
  }

  // The theme control cycles through three states; anything else, including a
  // value someone typed into storage, restarts at the OS preference.
  const THEME_PREFERENCES = ["system", "light", "dark"];
  function cycleThemePreference(current) {
    return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length];
  }

  // A badge's family decides its frame and accent. Frames are path data on a
  // 32-unit viewBox; styles.css colours each family by its token through
  // [data-family]. A new family is one entry here plus its badges' glyphs.
  // Type comes first: every card leads with exactly one type badge, and the
  // legend and Taxonomy list families in this order.
  const BADGE_FAMILIES = {
    type: {
      name: "Type",
      meaning: "What kind of record it is. Every card carries exactly one.",
      token: "--slate-ink",
      frame: "M16 3a13 13 0 1 1 0 26a13 13 0 1 1 0-26Z",
    },
    control: {
      name: "Control and privacy",
      meaning: "Where your data lives and who can touch it.",
      token: "--cyan",
      frame: "M16 2.5 27 6.5v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5Z",
    },
    capability: {
      name: "Capabilities",
      meaning: "What it can do.",
      token: "--violet",
      frame: "M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z",
    },
    platform: {
      name: "Platform and hardware",
      meaning: "Where it runs and what it runs on.",
      token: "--amber",
      frame: "M9 4h14a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z",
    },
  };
  const badgeLettering = text => `<text x="16" y="18.3" text-anchor="middle">${text}</text>`;

  // Card badges flag reviewed traits a reader scans a grid for. Each badge is
  // defined once and listed by id wherever it applies, so a name shared across
  // collections always tests the same field and value. A trait badge only
  // asserts presence: a missing, null, false, or empty field never produces
  // one, and a card without a trait badge claims nothing is absent. A trait
  // badge never repeats a fact the card already prints elsewhere (role pill,
  // license row, footer). Each badge also names its family (frame and accent)
  // and owns one glyph. See docs/WEB.md "Card badges".
  //
  // Type badges are the exception on purpose: each tests the one field that
  // says what the record is (`equals` a single value), every card carries
  // exactly one, and it restates the type the card's eyebrow prints so the
  // emblem row always leads with the record's kind.
  const CARD_BADGES = {
    "memory-system": {
      name: "Memory system",
      definition: "Its main job is keeping knowledge: capturing, organizing, and recalling what it is given.",
      test: { field: "system_family", equals: "memory_system" },
      family: "type",
      glyph: '<ellipse cx="16" cy="11.6" rx="5" ry="1.9"/><path d="M11 11.6v8.8c0 1.05 2.24 1.9 5 1.9s5-.85 5-1.9v-8.8M11 16c0 1.05 2.24 1.9 5 1.9s5-.85 5-1.9"/>',
    },
    "agent-system": {
      name: "Agent system",
      definition: "Its main job is planning and taking actions with tools on your behalf.",
      test: { field: "system_family", equals: "agent_system" },
      family: "type",
      glyph: '<rect x="11" y="12.8" width="10" height="8" rx="2"/><path d="M16 12.8v-2"/><circle class="badge-dot" cx="16" cy="10.1" r=".9"/><circle class="badge-dot" cx="13.9" cy="16.6" r="1"/><circle class="badge-dot" cx="18.1" cy="16.6" r="1"/>',
    },
    "assistant-system": {
      name: "Assistant system",
      definition: "An assistant you converse with to reason, create, research, and sometimes act across broad tasks.",
      test: { field: "system_family", equals: "assistant_system" },
      family: "type",
      glyph: '<path d="M10.5 12a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-4.5l-3.2 2.3v-2.3H12a1.5 1.5 0 0 1-1.5-1.5Z"/>',
    },
    "direct-model-api": {
      name: "Direct model API",
      definition: "A model developer's own API for its own models.",
      test: { field: "service_type", equals: "direct_model_api" },
      family: "type",
      glyph: '<path d="M10.5 16h6.8M14.6 13.2l2.8 2.8-2.8 2.8"/><circle class="badge-dot" cx="20.4" cy="16" r="1.9"/>',
    },
    "cloud-model-platform": {
      name: "Cloud model platform",
      definition: "A cloud provider's platform that serves models from several publishers alongside its own deployment controls.",
      test: { field: "service_type", equals: "cloud_model_platform" },
      family: "type",
      glyph: '<rect x="10.5" y="10.5" width="4.6" height="4.6" rx="1"/><rect x="16.9" y="10.5" width="4.6" height="4.6" rx="1"/><rect x="10.5" y="16.9" width="4.6" height="4.6" rx="1"/><rect x="16.9" y="16.9" width="4.6" height="4.6" rx="1"/>',
    },
    "managed-inference-host": {
      name: "Managed inference host",
      definition: "An infrastructure company that serves selected third-party or open-weight models through its own API.",
      test: { field: "service_type", equals: "managed_inference_host" },
      family: "type",
      glyph: '<rect x="12" y="12" width="8" height="8" rx="1.2"/><path d="M14.5 9.8V12M17.5 9.8V12M14.5 20v2.2M17.5 20v2.2M9.8 14.5H12M9.8 17.5H12M20 14.5h2.2M20 17.5h2.2"/>',
    },
    "routing-aggregator": {
      name: "Routing aggregator",
      definition: "One API that routes each request among upstream models or providers.",
      test: { field: "service_type", equals: "routing_aggregator" },
      family: "type",
      glyph: '<path d="M10.5 16H15l4.2-4.2h2.3M15 16l4.2 4.2h2.3"/><circle class="badge-dot" cx="15" cy="16" r="1.1"/>',
    },
    "desktop-runner": {
      name: "Desktop runner",
      definition: "An app or command you install on your own machine that downloads, stores, and serves models for you.",
      test: { field: "runtime_type", equals: "desktop_runner" },
      family: "type",
      glyph: '<rect x="10" y="11" width="12" height="10" rx="1.4"/><path d="m14.6 13.8 3.6 2.2-3.6 2.2Z"/>',
    },
    "server-engine": {
      name: "Server engine",
      definition: "An inference server built for sustained, batched serving on hardware you operate.",
      test: { field: "runtime_type", equals: "server_engine" },
      family: "type",
      glyph: '<path d="M14.33 12.25 14.84 10.52 17.16 10.52 17.67 12.25 18.41 12.68 20.16 12.25 21.33 14.27 20.08 15.57 20.08 16.43 21.33 17.73 20.16 19.75 18.41 19.32 17.67 19.75 17.16 21.48 14.84 21.48 14.33 19.75 13.59 19.32 11.84 19.75 10.67 17.73 11.92 16.43 11.92 15.57 10.67 14.27 11.84 12.25 13.59 12.68Z"/><circle cx="16" cy="16" r="1.7"/>',
    },
    "embedded-library": {
      name: "Embedded library",
      definition: "Inference code another application embeds, rather than a service you run.",
      test: { field: "runtime_type", equals: "embedded_library" },
      family: "type",
      glyph: '<path d="M16 12.3c-1.5-1.1-3.2-1.5-5.3-1.3v9.2c2.1-.2 3.8.2 5.3 1.3 1.5-1.1 3.2-1.5 5.3-1.3V11c-2.1-.2-3.8.2-5.3 1.3ZM16 12.3v9.2"/>',
    },
    "compatibility-gateway": {
      name: "Compatibility gateway",
      definition: "A self-hosted server that offers a familiar API over one or more local inference backends.",
      test: { field: "runtime_type", equals: "compatibility_gateway" },
      family: "type",
      glyph: '<path d="M11 13.5h9.3M17.8 11l2.5 2.5-2.5 2.5M21 18.5h-9.3M14.2 16l-2.5 2.5 2.5 2.5"/>',
    },
    "language-model": {
      name: "Language model",
      definition: "A model whose documented input and output are text.",
      test: { field: "model_type", equals: "language_model" },
      family: "type",
      glyph: '<path d="M11 12h10M11 15.3h10M11 18.6h6"/>',
    },
    "multimodal-language-model": {
      name: "Multimodal language model",
      definition: "A model that also takes images, audio, video, or documents, and answers mainly in text.",
      test: { field: "model_type", equals: "multimodal_language_model" },
      family: "type",
      glyph: '<rect x="10.5" y="11" width="11" height="10" rx="1.4"/><path d="m10.8 19.2 3.4-3.4 2.8 2.8 1.9-1.9 2.4 2.4"/><circle class="badge-dot" cx="18.6" cy="13.9" r="1.1"/>',
    },
    "source-record": {
      name: "Source record",
      definition: "A release listed in the models.dev catalog, shown as attributed metadata. The Atlas has not reviewed it.",
      test: { field: "review_status", equals: "imported" },
      family: "type",
      glyph: '<circle class="badge-dot" cx="11.6" cy="12" r=".95"/><circle class="badge-dot" cx="11.6" cy="16" r=".95"/><circle class="badge-dot" cx="11.6" cy="20" r=".95"/><path d="M14.3 12h7M14.3 16h7M14.3 20h7"/>',
    },
    protocol: {
      name: "Protocol",
      definition: "A machine-readable contract for exchanging messages or capabilities between independently built components.",
      test: { field: "specification_type", equals: "protocol" },
      family: "type",
      glyph: '<circle class="badge-dot" cx="11.5" cy="16" r="1.7"/><circle class="badge-dot" cx="20.5" cy="16" r="1.7"/><path d="M13.8 14.6h4.4M13.8 17.4h4.4"/>',
    },
    "metadata-schema": {
      name: "Metadata schema",
      definition: "A versioned vocabulary for describing something so other tools can discover it.",
      test: { field: "specification_type", equals: "metadata_schema" },
      family: "type",
      glyph: '<rect x="10.5" y="10.5" width="11" height="11" rx="1.4"/><path d="M10.5 14.5h11M14.8 14.5v7"/>',
    },
    "instruction-convention": {
      name: "Instruction convention",
      definition: "A file an agent looks for to read project guidance, without defining a wire protocol.",
      test: { field: "specification_type", equals: "instruction_convention" },
      family: "type",
      glyph: '<path d="M16 10v1.8M16 15.2v1.7M16 20.3V22M11.5 11.8h7.8l1.7 1.7-1.7 1.7h-7.8ZM20.5 16.9h-7.8L11 18.6l1.7 1.7h7.8Z"/>',
    },
    "capability-format": {
      name: "Capability format",
      definition: "A portable package of instructions, scripts, and resources that teaches an agent a reusable capability.",
      test: { field: "specification_type", equals: "capability_format" },
      family: "type",
      glyph: '<path d="M11 13.5h3.3a1.7 1.7 0 1 1 3.4 0H21v3.3a1.7 1.7 0 1 1 0 3.4V22H11Z"/>',
    },
    "package-format": {
      name: "Package format",
      definition: "A bundle contract that ships commands, agents, hooks, or integrations together.",
      test: { field: "specification_type", equals: "package_format" },
      family: "type",
      glyph: '<rect x="10.5" y="10.5" width="11" height="3.2" rx=".8"/><path d="M11.5 13.7V21a.8.8 0 0 0 .8.8h7.4a.8.8 0 0 0 .8-.8v-7.3M14.4 16.4h3.2"/>',
    },
    "skills-bundle": {
      name: "Skills bundle",
      definition: "A set of skill documents a host agent installs together.",
      test: { field: "pack_type", equals: "skills_bundle" },
      family: "type",
      glyph: '<path d="m16 10.4 1.75 3.55 3.9.57-2.82 2.75.66 3.88L16 19.32l-3.49 1.83.66-3.88-2.82-2.75 3.9-.57Z"/>',
    },
    plugin: {
      name: "Plugin",
      definition: "A host plugin whose manifest declares the commands, agents, skills, or hooks the host loads.",
      test: { field: "pack_type", equals: "plugin" },
      family: "type",
      glyph: '<rect x="10.5" y="10.5" width="11" height="11" rx="2.6"/><path d="M16 13.3v5.4M13.3 16h5.4"/>',
    },
    "process-kit": {
      name: "Process kit",
      definition: "A way of working packaged as prompts, commands, subagents, and templates a host follows.",
      test: { field: "pack_type", equals: "process_kit" },
      family: "type",
      glyph: '<path d="M10.5 21.5h3.7v-3.7h3.6v-3.6h3.7v-3.7"/>',
    },
    "vault-bundle": {
      name: "Vault bundle",
      definition: "A knowledge-vault template with the instructions a host follows to keep it up.",
      test: { field: "pack_type", equals: "vault_bundle" },
      family: "type",
      glyph: '<path d="M10.5 12.2a1.2 1.2 0 0 1 1.2-1.2h2.9l1.5 1.7h4.2a1.2 1.2 0 0 1 1.2 1.2v6.9a1.2 1.2 0 0 1-1.2 1.2h-8.6a1.2 1.2 0 0 1-1.2-1.2Z"/>',
    },
    marketplace: {
      name: "Marketplace",
      definition: "A manifest that lists other packs for a host to install. The Atlas does not review its entries.",
      test: { field: "pack_type", equals: "marketplace" },
      family: "type",
      glyph: '<path d="M10.8 14.3 12 11h8l1.2 3.3M10.8 14.3h10.4M11.8 14.3V21h8.4v-6.7M14.6 21v-3.6h2.8V21"/>',
    },
    "ai-company": {
      name: "AI company",
      definition: "An organization whose main business is developing AI models and what it builds on them.",
      test: { field: "lab_type", equals: "ai_company" },
      family: "type",
      glyph: '<path d="M16 10.3c.4 3.1 2.3 5 5.4 5.4-3.1.4-5 2.3-5.4 5.4-.4-3.1-2.3-5-5.4-5.4 3.1-.4 5-2.3 5.4-5.4Z"/>',
    },
    "technology-company": {
      name: "Technology company",
      definition: "A company whose main business is broader than AI models and which develops models through its own units.",
      test: { field: "lab_type", equals: "technology_company" },
      family: "type",
      glyph: '<rect x="11.5" y="10.5" width="9" height="11" rx="1"/><path d="M14 13.6h1M17 13.6h1M14 16.6h1M17 16.6h1M15 21.5v-2.4h2v2.4"/>',
    },
    "public-research": {
      name: "Public research organization",
      definition: "A government-funded, academic, or nonprofit research organization that develops and releases models.",
      test: { field: "lab_type", equals: "public_research" },
      family: "type",
      glyph: '<path d="M13.8 10.5h4.4M14.6 10.5v4.1l-3.5 5.7c-.5.8.1 1.7 1 1.7h7.8c.9 0 1.5-.9 1-1.7l-3.5-5.7v-4.1M12.6 18.2h6.8"/>',
    },
    "local-first": {
      name: "Local-first",
      definition: "Keeps your data on your own device or servers by default. It may still send requests to an online AI model; cloud storage is opt-in.",
      test: { field: "local_first" },
      family: "control",
      glyph: '<path d="M10.5 16.5 16 11.5l5.5 5M12.3 15.5V21h7.4v-5.5"/>',
    },
    "self-hostable": {
      name: "Self-hostable",
      definition: "Ships a service you can deploy and run on infrastructure you control.",
      test: { field: "deployment", anyOf: ["self_hosted"] },
      family: "control",
      glyph: '<rect x="10.5" y="10.5" width="11" height="4.2" rx="1"/><rect x="10.5" y="16.8" width="11" height="4.2" rx="1"/><circle class="badge-dot" cx="13" cy="12.6" r=".8"/><circle class="badge-dot" cx="13" cy="18.9" r=".8"/>',
    },
    "sandboxed-execution": {
      name: "Sandboxed execution",
      definition: "Can run agent actions in a local container or an external sandbox.",
      test: { field: "execution_boundaries", anyOf: ["container", "external_sandbox"] },
      family: "control",
      glyph: '<path d="M16 10 21.5 12.8v6.4L16 22l-5.5-2.8v-6.4ZM10.5 12.8 16 15.6l5.5-2.8M16 15.6V22"/>',
    },
    "browser-control": {
      name: "Browser control",
      definition: "Can operate a web browser as part of its work.",
      test: { field: "agent_capabilities", anyOf: ["browser_control"] },
      family: "capability",
      glyph: '<path d="m12 10.5 9 4.3-3.9 1.4-1.6 4.3Z"/>',
    },
    mcp: {
      name: "MCP",
      definition: "Can use tools and data sources through the Model Context Protocol.",
      test: { field: "agent_capabilities", anyOf: ["mcp"] },
      family: "capability",
      glyph: '<path d="M13.5 9.5v3.5M18.5 9.5v3.5M11.5 13h9v2.5a4.5 4.5 0 0 1-9 0ZM16 20v2.5"/>',
    },
    "editable-by-you": {
      name: "Editable by you",
      definition: "You can open and change what it keeps, such as notes, memories, or instructions, directly in files or in the app, not only by chatting.",
      test: { field: "human_editable" },
      family: "control",
      glyph: '<path d="m11.5 20.5.7-3 6.6-6.6 2.3 2.3-6.6 6.6Z"/>',
    },
    "graph-retrieval": {
      name: "Graph retrieval",
      definition: "Can recall related memories by following connections in a graph.",
      test: { field: "retrieval_modes", anyOf: ["graph_traversal"] },
      family: "capability",
      glyph: '<path d="M16 12.5 12.5 19M16 12.5 19.5 19M12.5 19h7"/><circle class="badge-dot" cx="16" cy="11.8" r="1.9"/><circle class="badge-dot" cx="12" cy="19.5" r="1.9"/><circle class="badge-dot" cx="20" cy="19.5" r="1.9"/>',
    },
    "plain-files": {
      name: "Plain files",
      definition: "Keeps data in human-readable files, such as Markdown.",
      test: { field: "architectures", anyOf: ["plain_files"] },
      family: "control",
      glyph: '<path d="M12 10h5.5l2.5 2.5V22h-8ZM14.2 15.5h3.6M14.2 18.5h3.6"/>',
    },
    "time-aware-recall": {
      name: "Time-aware recall",
      definition: "Can recall what was true as of a given point in time.",
      test: { field: "retrieval_modes", anyOf: ["temporal"] },
      family: "capability",
      glyph: '<circle cx="16" cy="16" r="5.8"/><path d="M16 12.8V16l2.3 1.5"/>',
    },
    "desktop-app": {
      name: "Desktop app",
      definition: "Available as a desktop application you install and run.",
      test: { field: "deployment", anyOf: ["desktop"] },
      family: "platform",
      glyph: '<rect x="10" y="10.5" width="12" height="8" rx="1"/><path d="M13.5 22h5M16 18.5V22"/>',
    },
    "mobile-app": {
      name: "Mobile app",
      definition: "Available as a mobile application you install and run.",
      test: { field: "deployment", anyOf: ["mobile"] },
      family: "platform",
      glyph: '<rect x="12.5" y="9.5" width="7" height="13" rx="1.5"/><circle class="badge-dot" cx="16" cy="20" r=".8"/>',
    },
    "dedicated-endpoints": {
      name: "Dedicated endpoints",
      definition: "Customers can get isolated serving resources or an endpoint of their own.",
      test: { field: "delivery_modes", anyOf: ["dedicated_endpoint"] },
      family: "platform",
      glyph: '<circle cx="16" cy="16" r="5.8"/><circle class="badge-dot" cx="16" cy="16" r="1.8"/>',
    },
    "reserved-capacity": {
      name: "Reserved capacity",
      definition: "Customers can reserve a defined throughput tier or capacity allocation.",
      test: { field: "delivery_modes", anyOf: ["reserved_capacity"] },
      family: "platform",
      glyph: '<path d="M11.5 21v-4M16 21V11M20.5 21v-7"/>',
    },
    batch: {
      name: "Batch",
      definition: "Accepts asynchronous jobs that trade an immediate response for separate capacity or pricing.",
      test: { field: "delivery_modes", anyOf: ["batch"] },
      family: "capability",
      glyph: '<path d="m10.5 13 5.5-2.8 5.5 2.8-5.5 2.8ZM10.5 16.2 16 19l5.5-2.8M10.5 19.3 16 22l5.5-2.7"/>',
    },
    "apple-metal": {
      name: "Apple Metal",
      definition: "Documented to run on Apple silicon GPUs through Metal.",
      test: { field: "accelerators", anyOf: ["metal"] },
      family: "platform",
      glyph: badgeLettering("MTL"),
    },
    "amd-rocm": {
      name: "AMD ROCm",
      definition: "Documented to run on AMD GPUs through ROCm.",
      test: { field: "accelerators", anyOf: ["rocm"] },
      family: "platform",
      glyph: badgeLettering("ROC"),
    },
    "distributed-serving": {
      name: "Distributed serving",
      definition: "Can spread a model or its requests across several accelerators or hosts.",
      test: { field: "serving_modes", anyOf: ["distributed_serving"] },
      family: "capability",
      glyph: '<rect x="13.8" y="9.8" width="4.4" height="4.4" rx="1"/><rect x="9.8" y="17.8" width="4.4" height="4.4" rx="1"/><rect x="17.8" y="17.8" width="4.4" height="4.4" rx="1"/><path d="M16 14.2v1.8M12 17.8V16h8v1.8"/>',
    },
    npu: {
      name: "NPU",
      definition: "Documented to run on a dedicated neural processing unit.",
      test: { field: "accelerators", anyOf: ["npu"] },
      family: "platform",
      glyph: badgeLettering("NPU"),
    },
    "downloadable-weights": {
      name: "Downloadable weights",
      definition: "The developer publishes the model's weights, so you can download it and run it on hardware you control, under the licence shown on the card.",
      test: { field: "distribution_modes", anyOf: ["downloadable_weights"] },
      family: "control",
      glyph: '<path d="M16 10v7.5M12.8 14.5 16 17.7l3.2-3.2M10.8 18.8v1.7a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-1.7"/>',
    },
    "developer-api": {
      name: "Developer API",
      definition: "The developer offers the model through its own managed API.",
      test: { field: "distribution_modes", anyOf: ["developer_api"] },
      family: "platform",
      glyph: '<path d="M14 10.5h-.6c-1.1 0-1.7.6-1.7 1.7v1.9c0 .9-.6 1.6-1.5 1.9.9.3 1.5 1 1.5 1.9v1.9c0 1.1.6 1.7 1.7 1.7h.6M18 10.5h.6c1.1 0 1.7.6 1.7 1.7v1.9c0 .9.6 1.6 1.5 1.9-.9.3-1.5 1-1.5 1.9v1.9c0 1.1-.6 1.7-1.7 1.7h-.6"/>',
    },
    "third-party-hosting": {
      name: "Third-party hosting",
      definition: "At least one company other than the developer documents hosting this exact model as a service.",
      test: { field: "distribution_modes", anyOf: ["third_party_hosting"] },
      family: "platform",
      glyph: '<path d="M12.8 20.2h6.9a2.4 2.4 0 0 0 .3-4.8 3.9 3.9 0 0 0-7.4-1 2.9 2.9 0 0 0 .2 5.8Z"/>',
    },
  };

  // Order is priority: a card shows the first MAX_CARD_BADGES that match. Each
  // set opens with its type badges, which all test one field for one value, so
  // exactly one of them matches a well-formed record and it always leads.
  const CARD_BADGE_SETS = {
    "system:agent_system": ["agent-system", "local-first", "sandboxed-execution", "browser-control", "mcp", "self-hostable"],
    "system:memory_system": ["memory-system", "local-first", "editable-by-you", "graph-retrieval", "plain-files", "time-aware-recall"],
    "system:assistant_system": ["assistant-system", "local-first", "self-hostable", "desktop-app", "mobile-app"],
    inference: ["direct-model-api", "cloud-model-platform", "managed-inference-host", "routing-aggregator", "dedicated-endpoints", "reserved-capacity", "batch"],
    runtime: ["desktop-runner", "server-engine", "embedded-library", "compatibility-gateway", "apple-metal", "amd-rocm", "distributed-serving", "npu"],
    model: ["language-model", "multimodal-language-model", "downloadable-weights", "developer-api", "third-party-hosting"],
    "model-source": ["source-record"],
    spec: ["protocol", "metadata-schema", "instruction-convention", "capability-format", "package-format"],
    pack: ["skills-bundle", "plugin", "process-kit", "vault-bundle", "marketplace"],
    lab: ["ai-company", "technology-company", "public-research"],
  };
  const CARD_BADGE_SET_NAMES = {
    "system:agent_system": "Agent systems",
    "system:memory_system": "Memory systems",
    "system:assistant_system": "Assistant systems",
    inference: "Inference services",
    runtime: "Local runtimes",
    model: "Model releases",
    "model-source": "models.dev source records",
    spec: "Specifications",
    pack: "Agent packs",
    lab: "Labs",
  };
  const MAX_CARD_BADGES = 6;

  function cardBadgeSetKey(kind, record) {
    if (kind === "system") return `system:${record.system_family}`;
    // A reviewed model takes the reviewed set; an imported row has no reviewed
    // field, so it takes only the source-record type badge. A malformed record
    // or a future status takes none.
    if (kind === "model") {
      if (record.review_status === "reviewed") return "model";
      return record.review_status === "imported" ? "model-source" : "";
    }
    return kind;
  }

  function matchesBadgeTest(record, test) {
    const value = record[test.field];
    if (test.equals !== undefined) return value === test.equals;
    if (!test.anyOf) return value === true;
    return Array.isArray(value) && value.some(item => test.anyOf.includes(item));
  }

  function cardBadges(kind, record) {
    const key = cardBadgeSetKey(kind, record);
    if (!key || !Object.hasOwn(CARD_BADGE_SETS, key)) return [];
    return CARD_BADGE_SETS[key]
      .filter(id => matchesBadgeTest(record, CARD_BADGES[id].test))
      .slice(0, MAX_CARD_BADGES)
      .map(id => ({ id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, family: CARD_BADGES[id].family }));
  }

  // One entry per badge, in first-listed order, naming every place it appears.
  function cardBadgeGlossary() {
    const entries = new Map();
    for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) {
      for (const id of ids) {
        if (!entries.has(id)) entries.set(id, { id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, family: CARD_BADGES[id].family, scopes: [] });
        entries.get(id).scopes.push(CARD_BADGE_SET_NAMES[key]);
      }
    }
    return [...entries.values()];
  }

  // Emblems are decoration: the card, the legend, and Taxonomy print the badge
  // name as text (visible or visually hidden) beside them.
  function emblemSVG(familyId, glyph) {
    const inner = glyph ? `<g class="badge-glyph">${glyph}</g>` : "";
    return `<svg class="badge-emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="badge-frame" d="${BADGE_FAMILIES[familyId].frame}"/>${inner}</svg>`;
  }
  function badgeEmblem(badgeId) {
    return emblemSVG(CARD_BADGES[badgeId].family, CARD_BADGES[badgeId].glyph);
  }
  function familyEmblem(familyId) {
    return emblemSVG(familyId, "");
  }

  // What the Directory legend shows for a scope: the badges its cards can
  // carry, grouped by family, or only the families where cards of every kind
  // mix. null means the scope shows no badges at all.
  function badgeLegend(collection, systemFamily = "") {
    if (collection === "all" || collection === "packs") {
      return { mode: "families", families: Object.entries(BADGE_FAMILIES).map(([id, family]) => ({ id, name: family.name, meaning: family.meaning })) };
    }
    const systemKeys = Object.keys(CARD_BADGE_SETS).filter(key => key.startsWith("system:"));
    const keys = collection === "systems" ? (systemFamily ? [`system:${systemFamily}`] : systemKeys)
      : collection === "inference" ? ["inference"]
      : collection === "runtimes" ? ["runtime"]
      : collection === "models" ? ["model", "model-source"]
      : collection === "specifications" ? ["spec"]
      : collection === "labs" ? ["lab"]
      : [];
    const ids = [...new Set(keys.flatMap(key => (Object.hasOwn(CARD_BADGE_SETS, key) ? CARD_BADGE_SETS[key] : [])))];
    if (!ids.length) return null;
    const order = Object.keys(BADGE_FAMILIES);
    ids.sort((a, b) => order.indexOf(CARD_BADGES[a].family) - order.indexOf(CARD_BADGES[b].family));
    return { mode: "badges", badges: ids.map(id => ({ id, name: CARD_BADGES[id].name, family: CARD_BADGES[id].family })) };
  }

  // ADR 038: Atlas can review a release before models.dev lists it. Such a
  // record has source_id null and metadata written by Atlas, so nothing on
  // the page may credit models.dev for it.
  const UNLISTED_MODEL_LABEL = "Not yet listed on models.dev";
  function modelSourceLabel(model) {
    return model.source_id || UNLISTED_MODEL_LABEL;
  }
  function modelMetadataAttribution(model) {
    if (model.source_id) {
      return {
        listed: true,
        cardTitle: "From models.dev source metadata, not Atlas reviewed",
        cardPrefix: "From models.dev: ",
        capabilityNote: "These values are imported discovery metadata, not an Atlas capability test.",
        linksHeading: "Source links from models.dev",
        noLinksText: "No source links reported by models.dev.",
      };
    }
    return {
      listed: false,
      cardTitle: "Reviewed by Atlas from developer documentation",
      cardPrefix: "From developer documentation: ",
      capabilityNote: "Reviewed by Atlas from developer documentation, not an Atlas capability test.",
      linksHeading: "Source links",
      noLinksText: "No source links recorded.",
    };
  }
  function modelsKickerText(sourceCount, reviewedCount, unlistedCount) {
    const base = `${sourceCount} models.dev records · ${reviewedCount} Atlas reviewed`;
    return unlistedCount > 0 ? `${base} · ${unlistedCount} not yet on models.dev` : base;
  }

  return {
    BADGE_FAMILIES,
    CARD_BADGES,
    CARD_BADGE_SETS,
    INACTIVE_STATUSES,
    SCOPE_URL_KEYS,
    SCOPE_URL_PARAMS,
    activeSwitcherIndex,
    badgeEmblem,
    badgeLegend,
    buildLabIndex,
    cardBadgeGlossary,
    cardBadges,
    comparableText,
    compareProjects,
    cycleThemePreference,
    directoryDefaults,
    editDistance,
    familyEmblem,
    filterAndSortProjects,
    filterDirectoryEntries,
    filterInferenceServices,
    filterLabs,
    filterLocalRuntimes,
    filterModels,
    filterPacks,
    filterRobots,
    filterScoredCollection,
    filterSpecifications,
    labDistributionModes,
    labRelations,
    labsForRecord,
    matchesProject,
    matchFinderGoal,
    mergePackScopeEntries,
    modelMetadataAttribution,
    modelSourceLabel,
    modelsKickerText,
    monogramGlyph,
    normalizeSearchText,
    packShapedSystems,
    paginate,
    parseRecordReference,
    parseSearchQuery,
    parseViewAlias,
    parseViewId,
    readScopeURLParams,
    recordMatch,
    releaseDate,
    releasesNewestFirst,
    scopeFromURL,
    scopeURLParams,
    searchFields,
    searchWords,
    shareRecordPath,
    sourceNamespace,
    stemQueryWord,
    suggestNames,
    switcherCounts,
    tokenHit,
    UNLISTED_MODEL_LABEL,
    updateComparisonSelection,
  };
});
