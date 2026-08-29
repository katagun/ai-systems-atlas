# Local-Runtime Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth Atlas collection for self-operated inference runtimes with a dedicated score profile, and close the coverage gaps for Ollama Cloud, the SylphAI products, and several assistants and agent frameworks.

**Architecture:** Canonical schemas stay separate per ADR 013; only genuinely duplicated primitives are extracted (collection envelope validation, score-profile validation, weighted-score checking, and a parameterized filter in `app-core.js`). The new collection mirrors the inference-service pattern end to end: canonical JSON → taxonomy enums → validator block → sync → Directory scope → filters → detail dialog → comparison → Finder.

**Tech Stack:** Python 3.12 with `uv` (stdlib only, no runtime dependencies), dependency-free vanilla JavaScript in `web/`, `unittest`, `node --test`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-29-local-runtime-collection-design.md`](../specs/2026-08-29-local-runtime-collection-design.md)

## Global Constraints

- Evidence integrity is absolute: **never invent** a license identifier, blob SHA, capability claim, score, or date. Every value comes from an authoritative source fetched during the task. A record whose evidence cannot be established goes to `directory/candidates.json`, never into a published collection with a guessed score.
- `local_runtime` score weights, exactly: `hardware_accelerator_coverage` 0.16, `model_format_support` 0.15, `serving_concurrency` 0.15, `api_interoperability` 0.13, `deployment_operations` 0.13, `model_lifecycle_management` 0.10, `observability_control` 0.10, `documentation_transparency` 0.08. Total 1.00.
- `overall` is the weighted sum **rounded to two decimals**; the validator recomputes and rejects mismatches.
- Never rank across score profiles. Mixed Directory browsing hides all numeric scores.
- Run `uv run python scripts/sync_web_data.py` after changing any `directory/*.json`; the validator fails if `web/` copies differ.
- The web application has zero runtime dependencies. Do not add a bundler, framework, or package.
- Escape HTML at every data-to-markup boundary (`escapeHTML` in `web/app.js`).
- Commit after each task. Never report a check as passing without running it.

---

### Task 1: ADR 015 and the amendment to ADR 010

**Files:**
- Create: `docs/adr/015-local-runtimes-are-self-operated-execution-records.md`
- Modify: `docs/adr/010-inference-services-are-unscored-service-records.md` (Status line)
- Modify: `tests/test_documentation.py` (routing manifest)

**Interfaces:**
- Produces: the `local_runtime` profile name, dimension ids, and weights that Task 2 encodes in `taxonomy.json`; the boundary prose Task 5 quotes in `docs/LOCAL_RUNTIMES.md`.

- [ ] **Step 1: Add ADR 015 to the routing manifest test (failing test first)**

In `tests/test_documentation.py::test_task_routing_documents_exist`, add two entries to the tuple:

```python
            "docs/LOCAL_RUNTIMES.md",
            "docs/adr/015-local-runtimes-are-self-operated-execution-records.md",
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: FAIL on `test_task_routing_documents_exist` for the two missing paths.

- [ ] **Step 3: Write ADR 015**

Follow the structure of ADR 012 (Context / Decision / Consequences). It must state:
- the unit of curation — a named, self-operated software runtime executing model inference on infrastructure the user controls, with no third party holding the serving contract;
- that it amends ADR 010 by supplying the collection ADR 010 deferred, without overturning ADR 010's exclusion;
- the six exclusions from the spec (model weights and catalogs; managed services including a vendor's hosted tier of its own runtime; client SDKs, proxies, and routers; vector stores and retrieval infrastructure; training and fine-tuning frameworks; assistants with a bundled runtime);
- the runtime-versus-assistant test, resolved by primary operational outcome;
- the `ollama` / `ollama-cloud` split as the worked example;
- the eight dimensions and weights verbatim from Global Constraints;
- the exclusion of model intelligence, tokens per second, time to first token, benchmark rank, hardware cost, and repository popularity, with the reason: a throughput figure is a function of model, quantization, batch size, and accelerator, none of which the record owns; and
- that classification filters stay primary because a deliberately narrow runtime can be the correct choice at a lower overall.

- [ ] **Step 4: Mark ADR 010 amended**

Change its Status line to name ADR 015 alongside ADR 012 and ADR 013, and add one sentence to the paragraph beneath it explaining that ADR 015 supplies the separate collection for local runtimes without changing ADR 010's exclusion of them from managed inference services.

- [ ] **Step 5: Create `docs/LOCAL_RUNTIMES.md`**

The curation guide, structured like `docs/INFERENCE_SERVICES.md`: inclusion boundary, classification, scoring table with the eight dimensions and the 0–2 / 3–4 / 5–6 / 7–8 / 9–10 anchors reused from `INFERENCE_SERVICES.md`, an evidence-and-freshness section stating that runtime capability claims are dated rather than durable, coverage discovery, and a numbered review workflow.

- [ ] **Step 6: Add the routing row to `AGENTS.md`**

In the just-in-time context table, after the inference-services row:

```
| local runtimes, self-hosted inference, runtime scores | `docs/LOCAL_RUNTIMES.md`, then `docs/adr/015-local-runtimes-are-self-operated-execution-records.md` and `docs/adr/013-distinct-collections-share-one-directory-surface.md` |
```

Add a hard rule: keep local runtimes outside `system_family` and system-family score profiles; curate self-operated runtimes rather than models, managed services, or client libraries.

- [ ] **Step 7: Run the documentation tests**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS, all three tests. The relative-link test also proves every link added above resolves.

- [ ] **Step 8: Commit**

```bash
git add docs/adr/015-local-runtimes-are-self-operated-execution-records.md docs/adr/010-inference-services-are-unscored-service-records.md docs/LOCAL_RUNTIMES.md AGENTS.md tests/test_documentation.py
git commit -m "Add ADR 015 defining the local-runtime collection"
```

---

### Task 2: Taxonomy enums and the `local_runtime` score profile

**Files:**
- Modify: `directory/taxonomy.json`
- Modify: `scripts/validate_directory.py` (`TAXONOMY_GROUPS`)
- Test: `tests/test_directory.py`

**Interfaces:**
- Consumes: dimension ids and weights from Task 1.
- Produces: enum groups `local_runtime_types`, `runtime_accelerators`, `runtime_model_formats`, `runtime_serving_modes`, `runtime_deployment_surfaces`, and the top-level `local_runtime_score_profile` object, all consumed by Task 4's validator block and Task 6's rendering.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_directory.py`:

```python
    def test_local_runtime_score_profile_weights_total_one(self) -> None:
        profile = self.taxonomy["local_runtime_score_profile"]
        self.assertEqual("local_runtime", profile["id"])
        weights = [dimension["weight"] for dimension in profile["dimensions"]]
        self.assertAlmostEqual(1.0, sum(weights))
        self.assertTrue(all(weight > 0 for weight in weights))
        self.assertTrue(all(dimension["definition"].strip() for dimension in profile["dimensions"]))

    def test_local_runtime_enum_groups_exist(self) -> None:
        for group in (
            "local_runtime_types", "runtime_accelerators", "runtime_model_formats",
            "runtime_serving_modes", "runtime_deployment_surfaces",
        ):
            ids = [item["id"] for item in self.taxonomy[group]]
            self.assertTrue(ids, group)
            self.assertEqual(len(ids), len(set(ids)), group)
```

Match the existing fixture style in the file — read how `self.taxonomy` is loaded before writing this.

- [ ] **Step 2: Run and confirm it fails**

Run: `uv run python -m unittest tests.test_directory -v -k local_runtime`
Expected: FAIL with `KeyError: 'local_runtime_score_profile'`.

- [ ] **Step 3: Add the enum groups to `directory/taxonomy.json`**

Each entry is `{"id": ..., "name": ..., "definition": ...}`, matching the shape of the neighbouring `inference_*` groups.

- `local_runtime_types`: `desktop_runner`, `server_engine`, `embedded_library`, `compatibility_gateway`.
- `runtime_accelerators`: `cpu`, `cuda`, `rocm`, `metal`, `vulkan`, `sycl`, `npu`, `multi_gpu`.
- `runtime_model_formats`: `gguf`, `safetensors`, `pytorch`, `mlx`, `onnx`, `awq`, `gptq`, `fp8`.
- `runtime_serving_modes`: `single_stream`, `continuous_batching`, `parallel_requests`, `distributed_serving`, `speculative_decoding`.
- `runtime_deployment_surfaces`: `desktop_app`, `local_cli`, `library`, `container`, `orchestrated_cluster`.

Only include values the seed batch in Task 5 can actually evidence; delete any that no record uses rather than shipping an empty filter option.

- [ ] **Step 4: Add `local_runtime_score_profile`**

A sibling of `inference_service_score_profile`: `{"id": "local_runtime", "name": ..., "summary": ..., "dimensions": [{"id", "name", "weight", "definition"}, ...]}` using the eight ids and weights from Global Constraints.

- [ ] **Step 5: Register the groups in the validator**

Add the five group names to the `TAXONOMY_GROUPS` tuple in `scripts/validate_directory.py`, after the `inference_*` entries.

- [ ] **Step 6: Run tests and sync**

```bash
uv run python scripts/sync_web_data.py
uv run python -m unittest tests.test_directory -v
uv run python scripts/validate_directory.py
```
Expected: PASS, and the validator still reports the existing counts.

- [ ] **Step 7: Commit**

```bash
git add directory/taxonomy.json web/taxonomy.json scripts/validate_directory.py tests/test_directory.py
git commit -m "Add local-runtime taxonomy groups and score profile"
```

---

### Task 3: Extract shared validator primitives

Behavior-preserving refactor. **No new records and no behavior changes.** The existing suites are the proof.

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Produces, for Task 4:
  - `validate_collection_envelope(data: dict, name: str, version: str, key: str, errors: list[str]) -> list` — checks `version`, ISO `verified_at`, that `data[key]` is a list, and that every member is a dict with a present, unique, `ID_PATTERN`-matching `id`. Returns the list (empty on structural failure).
  - `validate_score_profile(taxonomy: dict, key: str, profile_id: str, errors: list[str]) -> dict[str, float]` — validates the profile object and returns `{dimension_id: weight}` (empty on failure).
  - `validate_record_score(record: dict, dimensions: dict[str, float], profile_id: str, prefix: str, errors: list[str]) -> None` — checks `score_profile`, exact key match against dimensions plus `overall`, 0–10 numeric range, and that `overall` equals the weighted sum rounded to two decimals.

- [ ] **Step 1: Record the current baseline**

Run: `uv run python -m unittest discover -s tests -v 2>&1 | tail -5`
Write down the test count and the OK line. This is what must not change.

- [ ] **Step 2: Add the three helpers**

Place them after `validate_string_list`. Copy the logic verbatim from the existing sites — do not "improve" messages, because the error strings are asserted in `tests/test_validation_policy.py`.

- [ ] **Step 3: Replace the inference-service call sites**

Swap the taxonomy block at the `inference_service_score_profile` section for `inference_score_dimensions = validate_score_profile(taxonomy, "inference_service_score_profile", "inference_service", errors)`, the envelope block for `validate_collection_envelope(...)`, and the score block for `validate_record_score(...)`.

- [ ] **Step 4: Replace the specifications and projects envelope call sites**

Only where the envelope check is genuinely identical. If a collection's envelope differs (projects use `generated_at`, not `verified_at`), leave it alone — forcing it into the helper would be the abstraction Approach B was rejected for.

- [ ] **Step 5: Run the full suite and confirm the baseline is unchanged**

```bash
uv run python -m unittest discover -s tests -v 2>&1 | tail -5
uv run python scripts/validate_directory.py
uv run python -m compileall scripts tests
```
Expected: identical test count, OK, and the same validator summary line as Step 1.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate_directory.py
git commit -m "Extract shared collection, profile, and score validation helpers"
```

---

### Task 4: Local-runtime schema and validation

**Files:**
- Modify: `scripts/validate_directory.py`
- Modify: `scripts/sync_web_data.py`
- Modify: `AGENTS.md` (published-file hard rule)
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: helpers from Task 3, enum groups from Task 2.
- Produces: `LOCAL_RUNTIME_REQUIRED` (the exact field set Task 5's records must match), and the cross-collection id-uniqueness rule.

- [ ] **Step 1: Write the failing policy tests**

Add to `tests/test_validation_policy.py`, following the file's existing pattern of mutating a temporary copy of the directory and asserting a specific error string:

```python
    def test_local_runtime_overall_must_match_weighted_score(self) -> None:
        errors = self.validate_with(lambda root: self.mutate_runtime(root, 0, {"score": {**self.runtime_score(root, 0), "overall": 9.99}}))
        self.assertTrue(any("does not match weighted" in error for error in errors), errors)

    def test_local_runtime_rejects_unknown_accelerator(self) -> None:
        errors = self.validate_with(lambda root: self.mutate_runtime(root, 0, {"accelerators": ["quantum"]}))
        self.assertTrue(any("unknown accelerators" in error for error in errors), errors)

    def test_ids_must_be_unique_across_collections(self) -> None:
        errors = self.validate_with(self.duplicate_first_runtime_id_into_inference_services)
        self.assertTrue(any("appears in more than one collection" in error for error in errors), errors)
```

Read the file's existing helpers first and reuse them; add `mutate_runtime`, `runtime_score`, and `duplicate_first_runtime_id_into_inference_services` in the same style as their inference-service equivalents.

- [ ] **Step 2: Run and confirm failure**

Run: `uv run python -m unittest tests.test_validation_policy -v -k local_runtime`
Expected: FAIL — `local-runtimes.json` does not exist yet.

- [ ] **Step 3: Add `LOCAL_RUNTIME_REQUIRED`**

```python
LOCAL_RUNTIME_REQUIRED = {
    "id", "name", "maintainer", "runtime_type", "repo", "url", "description",
    "runtime_boundary", "accelerators", "model_formats", "serving_modes", "api_styles",
    "deployment_surfaces", "model_management", "hardware_requirements",
    "operational_controls", "strengths", "tradeoffs", "licenses", "source_model",
    "license_note", "license_evidence", "score_profile", "score", "evidence", "verified_at",
}
```

- [ ] **Step 4: Add the validation block**

After the inference-service block. Use `validate_collection_envelope(local_runtimes_data, "local-runtimes.json", "1.0", "runtimes", errors)`, `validate_score_profile(taxonomy, "local_runtime_score_profile", "local_runtime", errors)`, and `validate_record_score(...)`. Then per record: exact field-set match, `ID_PATTERN` id, non-empty strings for the prose fields, HTTPS `url`, `repo` matching `REPO_PATTERN` or `null`, `runtime_type` in `local_runtime_types`, `validate_string_list` for `accelerators` / `model_formats` / `serving_modes` / `api_styles` (against `inference_api_styles`) / `deployment_surfaces` / `licenses`, `source_model` in `source_models`, and the license-evidence and evidence loops copied from the **specifications** block, which already implements exactly the scoped-blob and web-terms rules this collection needs.

- [ ] **Step 5: Add cross-collection id uniqueness**

After all collections are validated:

```python
    collection_ids: dict[str, list[str]] = {}
    for collection_name, records in (
        ("projects.json", projects),
        ("specifications.json", specifications_value),
        ("inference-services.json", inference_services_value),
        ("local-runtimes.json", local_runtimes_value),
    ):
        for record in records:
            if isinstance(record, dict) and isinstance(record.get("id"), str):
                collection_ids.setdefault(record["id"], []).append(collection_name)
    for record_id, sources in sorted(collection_ids.items()):
        if len(sources) > 1:
            errors.append(f"id {record_id!r} appears in more than one collection: {sorted(sources)}")
```

- [ ] **Step 6: Publish the file**

Add `"local-runtimes.json"` to `PUBLISHED_DATA` in both `scripts/validate_directory.py` and `scripts/sync_web_data.py`. Update the `AGENTS.md` hard rule that enumerates the six published files to name seven. Add the runtime count to the `main()` summary line.

- [ ] **Step 7: Create a minimal valid `directory/local-runtimes.json`**

`{"version": "1.0", "verified_at": "<today>", "runtimes": []}` so the validator has a file to read. Task 5 fills it.

- [ ] **Step 8: Run**

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
```
Expected: PASS. The new policy tests still fail until Task 5 supplies records — if the fixtures need at least one record, move those three assertions to Task 5 rather than weakening them.

- [ ] **Step 9: Commit**

```bash
git add scripts/ directory/local-runtimes.json web/local-runtimes.json tests/test_validation_policy.py AGENTS.md
git commit -m "Add local-runtime schema validation and publishing"
```

---

### Task 5: Curate the eight seed runtimes

**Files:**
- Modify: `directory/local-runtimes.json`

This is research, not coding. Budget accordingly and do the records one at a time.

**Batch:** Ollama, llama.cpp, vLLM, LM Studio, SGLang, LocalAI, Jan, Hugging Face Text Generation Inference.

- [ ] **Step 1: For each runtime, gather license evidence first**

Fetch the authoritative `LICENSE` file and review its component and path scope. For GitHub-hosted runtimes, resolve the blob SHA:

```bash
curl -s "https://api.github.com/repos/<owner>/<repo>/contents/LICENSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])"
```

The `immutable_url` must be exactly `https://api.github.com/repos/<repo>/git/blobs/<sha>` and the `url` must start with `https://github.com/<repo>/blob/` — the validator enforces both. README badges and GitHub's detected SPDX value are not sufficient evidence.

- [ ] **Step 2: Establish the boundary**

Write `runtime_boundary` naming what the record is not: for Ollama, that `ollama-cloud` is the separate managed-service record; for LM Studio and Jan, why the runtime-versus-assistant test resolves them as runtimes; for TGI, its relationship to Hugging Face Inference Endpoints, which is already an inference-service record.

- [ ] **Step 3: Score all eight dimensions from fetched documentation**

One authoritative documentation source per claim. Missing public evidence lowers the relevant dimension — never substitute reputation, GitHub stars, or an adjacent product's capabilities. Compute `overall` as the weighted sum rounded to two decimals.

- [ ] **Step 4: Verify each record as you add it**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py
```
Expected: the summary line's runtime count increments by one.

- [ ] **Step 5: Re-enable and pass the Task 4 policy tests**

Run: `uv run python -m unittest discover -s tests -v`
Expected: PASS including the three local-runtime policy tests.

- [ ] **Step 6: Commit**

```bash
git add directory/local-runtimes.json web/local-runtimes.json tests/
git commit -m "Curate the seed local-runtime batch"
```

---

### Task 6: Web surface

**Files:**
- Modify: `web/app-core.js`, `web/app.js`, `web/index.html`, `web/styles.css`
- Modify: `docs/WEB.md`
- Test: `tests/test_web.js`, `tests/e2e/directory-search.spec.js`

**Interfaces:**
- Consumes: the record schema from Task 4 and the taxonomy groups from Task 2.
- Produces: `AtlasCore.filterLocalRuntimes(runtimes, filters)` and `AtlasCore.filterScoredCollection(records, filters, options)`.

- [ ] **Step 1: Write the failing core tests**

Add to `tests/test_web.js`, matching the file's existing `node:test` style:

```javascript
test("filterLocalRuntimes filters by type, accelerator, and format", () => {
  const runtimes = [
    { id: "a", name: "Alpha", maintainer: "A", description: "", runtime_boundary: "",
      model_management: "", hardware_requirements: "", operational_controls: "",
      strengths: [], tradeoffs: [], runtime_type: "server_engine",
      accelerators: ["cuda"], model_formats: ["safetensors"], api_styles: ["openai_compatible"],
      score: { overall: 8 } },
    { id: "b", name: "Beta", maintainer: "B", description: "", runtime_boundary: "",
      model_management: "", hardware_requirements: "", operational_controls: "",
      strengths: [], tradeoffs: [], runtime_type: "desktop_runner",
      accelerators: ["metal"], model_formats: ["gguf"], api_styles: ["openai_compatible"],
      score: { overall: 9 } },
  ];
  assert.deepEqual(AtlasCore.filterLocalRuntimes(runtimes, { type: "desktop_runner" }).map(r => r.id), ["b"]);
  assert.deepEqual(AtlasCore.filterLocalRuntimes(runtimes, { accelerator: "cuda" }).map(r => r.id), ["a"]);
  assert.deepEqual(AtlasCore.filterLocalRuntimes(runtimes, { modelFormat: "gguf" }).map(r => r.id), ["b"]);
  assert.deepEqual(AtlasCore.filterLocalRuntimes(runtimes, { sort: "score" }).map(r => r.id), ["b", "a"]);
});

test("filterDirectoryEntries includes runtimes in mixed browsing", () => {
  const entries = AtlasCore.filterDirectoryEntries([], [], [{ id: "a", name: "Alpha", score: { overall: 8 } }], {});
  assert.deepEqual(entries.map(e => e.kind), ["runtime"]);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/test_web.js`
Expected: FAIL — `AtlasCore.filterLocalRuntimes is not a function`.

- [ ] **Step 3: Extract `filterScoredCollection` and add `filterLocalRuntimes`**

```javascript
  function filterScoredCollection(records, filters = {}, options = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    const { searchFields = [], facets = {} } = options;
    return records.filter(record => {
      const haystack = searchFields
        .flatMap(field => Array.isArray(record[field]) ? record[field] : [record[field]])
        .filter(Boolean).join(" ").toLowerCase();
      if (!matchesSearchTerm(haystack, term)) return false;
      return Object.entries(facets).every(([key, field]) => {
        const selected = filters[key];
        if (!selected) return true;
        const value = record[field];
        return Array.isArray(value) ? value.includes(selected) : value === selected;
      });
    }).sort(filters.sort === "score"
      ? (a, b) => b.score.overall - a.score.overall || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
  }
```

Rewrite `filterInferenceServices` as a wrapper over it with its existing search fields and the facets `{type: "service_type", delivery: "delivery_modes", modelSource: "model_sources", apiStyle: "api_styles"}`. Add `filterLocalRuntimes` with search fields `id, name, maintainer, description, runtime_boundary, model_management, hardware_requirements, operational_controls, strengths, tradeoffs` and facets `{type: "runtime_type", accelerator: "accelerators", modelFormat: "model_formats", apiStyle: "api_styles"}`. Export both plus `filterScoredCollection`.

Note the existing default: `filterInferenceServices` sorts by name unless `sort === "score"`, but the Inference services scope defaults to score sorting in `app.js`. Preserve that split — the core function's default must stay name-sorted or the mixed-browsing call site changes behavior.

- [ ] **Step 4: Extend `filterDirectoryEntries` to three collections**

Add a `runtimes` parameter and emit `{ kind: "runtime", record }`, keeping the existing alphabetical-then-kind sort.

- [ ] **Step 5: Run the core tests**

Run: `node --check web/app-core.js && node --test tests/test_web.js`
Expected: PASS, including every pre-existing inference-service test unchanged.

- [ ] **Step 6: Commit the core extraction separately**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Parameterize scored-collection filtering and add local runtimes"
```

- [ ] **Step 7: Add the Directory scope**

In `web/app.js`: load `local-runtimes.json` into `state.localRuntimes`; add `"runtimes"` to the valid list in `setDirectoryCollection` (line ~345); add `#runtime-collection-count` to `renderStats` and make `#all-collection-count` a three-way sum; add `populateLocalRuntimeFilters`, `renderLocalRuntimes`, and `openLocalRuntime` modelled on their inference-service equivalents at lines 275, 469, and 747; pass `state.localRuntimes` to `filterDirectoryEntries`; and handle the `runtime` kind in mixed cards and in the mixed-card click handler.

- [ ] **Step 8: Add the markup**

In `web/index.html`, a fourth switcher button after line 66:

```html
        <button data-directory-collection="runtimes" aria-pressed="false"><span>Local runtimes</span><strong id="runtime-collection-count"></strong></button>
```

Plus the runtimes filter row (search, type, accelerator, model format, API style, sort) and the runtime detail dialog, mirroring the inference-service markup.

- [ ] **Step 9: Add the fifth atlas-map node**

In `web/index.html` after line 52:

```html
            <span class="map-node map-runtime"><i></i><b>RUNTIMES</b><small>host · execute</small></span>
```

Update the orbit geometry in `web/styles.css` so the ellipses span five nodes — `docs/WEB.md` requires that no subset reads as a separate cluster.

- [ ] **Step 10: Wire comparison**

Add `runtime` to the `compare` URL kinds (`runtime:id,id`), to `restoreComparisonFromURL`, and to `openComparison` with the runtime column set: runtime type, accelerators, model formats, API styles, deployment surfaces, model management, hardware requirements, licenses, source model, strengths, tradeoffs, plus the eight dimensions. Verify the scope-change path clears an incompatible selection.

- [ ] **Step 11: Add the Finder branch**

Extend `FINDER_DIRECTIONS`, `FINDER_GOALS`, and `FINDER_PRIORITIES` with a `local_runtime` direction. `priorityBoost` and `recommendationReasons` must branch explicitly on profile — never assume unlike records share dimension names. Add a goal only once a reviewed runtime can satisfy it.

- [ ] **Step 12: Update `docs/WEB.md`**

Add behavioral-contract bullets for runtime filters, search fields, detail contents, and comparison, and add browser-verification steps for the runtimes scope, its scoped URL, runtime comparison, the Finder path, and the five-node map.

- [ ] **Step 13: Extend the e2e suite**

In `tests/e2e/directory-search.spec.js`, add specs for switching to the runtimes scope, reloading `?collection=runtimes`, combining filters, opening a runtime detail dialog, and confirming mixed browsing hides runtime scores.

- [ ] **Step 14: Run every web check**

```bash
node --check web/app-core.js && node --check web/app.js && node --test tests/test_web.js
npm ci && npx playwright install chromium && npm run test:e2e
```
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add web/ docs/WEB.md tests/
git commit -m "Add the local-runtimes Directory scope"
```

---

### Task 7: Ollama Cloud and the inference-service batch

**Files:**
- Modify: `directory/inference-services.json`

**Batch:** Ollama Cloud, Nebius AI Studio, Baseten, Novita AI, Lambda Inference.

- [ ] **Step 1: Curate Ollama Cloud first**

It is the record that proves the ADR 015 boundary. `operator` is Ollama; `service_type` is `managed_inference_host`; `service_boundary` must name the `ollama` runtime record as the separate local-execution boundary. Review the current service documentation and governing terms; state retention and residency from those sources only, with their exceptions. Do not copy prices or tier limits into the record — `INFERENCE_SERVICES.md` forbids it.

- [ ] **Step 2: Curate the remaining four**

Each must answer a distinct deployment, routing, residency, retention, or procurement question, per `ROADMAP.md`. Score all eight inference dimensions from the same fetched evidence.

- [ ] **Step 3: Verify**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py
```
Expected: the inference-service count rises to 41, and the cross-collection id check passes with both `ollama` and `ollama-cloud` present.

- [ ] **Step 4: Commit**

```bash
git add directory/inference-services.json web/inference-services.json
git commit -m "Add Ollama Cloud and four managed inference services"
```

---

### Task 8: Project promotions

**Files:**
- Modify: `directory/projects.json`, `directory/license-evidence.json`, `directory/candidates.json`

**Batch:** AdaL CLI (`agent_system` / `coding_agent`), AdalFlow (`agent_system` / `agent_framework_sdk`, conditional), Mistral Le Chat, Qwen Chat, Kimi, Meta AI (`assistant_system`), AutoGen, Semantic Kernel, Strands Agents SDK, Genkit (`agent_system` / `agent_framework_sdk`).

- [ ] **Step 1: Apply the AdalFlow materiality gate first**

`docs/CURATION.md`: "A general LLM application library or optimizer that can support an agent is provisional until that behavior is shown to be material." Review AdalFlow's agent runtime and tool-use documentation. If agent building and running are not established as a primary outcome, leave it in `candidates.json` and promote only AdaL CLI. Record the decision either way.

- [ ] **Step 2: Curate each record fully**

Every promoted project needs a matching `directory/license-evidence.json` entry keyed on `project_id` — the validator enforces one entry per project. Score against the matching family profile only; never reuse a score across families.

- [ ] **Step 3: Remove promoted records from `candidates.json`**

Required by the `CURATION.md` review workflow, and the validator rejects a candidate whose repository is already curated.

- [ ] **Step 4: Verify**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests -v
```

- [ ] **Step 5: Commit**

```bash
git add directory/ web/
git commit -m "Promote the SylphAI, assistant, and agent-framework batch"
```

---

### Task 9: Counts closeout and full verification

**Files:**
- Modify: `docs/COVERAGE.md`, `ROADMAP.md`, `BACKLOG.md`, `README.md`, `docs/DATA_MODEL.md`

- [ ] **Step 1: Recompute every published count**

```bash
uv run python - <<'PY'
import json, collections
for name, key in (("projects","projects"),("specifications","specifications"),("inference-services","services"),("local-runtimes","runtimes")):
    d = json.load(open(f"directory/{name}.json"))
    print(name, len(d[key]))
p = json.load(open("directory/projects.json"))["projects"]
print(collections.Counter(x["system_family"] for x in p))
print(collections.Counter(x["source_model"] for x in p))
print("candidates", len(json.load(open("directory/candidates.json"))["candidates"]))
PY
```

- [ ] **Step 2: Update the `COVERAGE.md` snapshot**

Rewrite the dated snapshot paragraph and the affected role rows from the computed numbers. Add a local-runtime paragraph. Change the "three collections" framing to four wherever it appears.

- [ ] **Step 3: Update `ROADMAP.md`, `README.md`, and `docs/DATA_MODEL.md`**

`ROADMAP.md` gains a local-runtime principle; `README.md`'s collection description and counts change; `DATA_MODEL.md` documents the new file, its envelope, and its fields.

- [ ] **Step 4: Tick the backlog**

Mark `BACKLOG.md`'s "Reassess local inference runtimes…" line done, referencing ADR 015, and add any follow-up the work surfaced (the deferred Dify/Langflow/Flowise/Botpress boundary batch).

- [ ] **Step 5: Run the complete suite**

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js && node --check web/app.js && node --test tests/test_web.js
npm run test:e2e
```
Expected: all PASS. Paste the real output; do not summarize a run you did not do.

- [ ] **Step 6: Exercise the browser**

```bash
uv run python -m http.server 8765 --directory web
```
Walk the numbered checklist in `docs/WEB.md`, including the new runtime steps.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "Refresh coverage counts for the local-runtime collection"
```
