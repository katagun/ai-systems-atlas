# Reviewed Models Without a models.dev Source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `directory/models.json` hold a reviewed model whose `source_id` is `null`, and give a human a guarded way to create one and later link it to its models.dev row.

**Architecture:** `source_id: null` is the only schema change. The record `id` is the stable slug of the expected models.dev ID, the payload builder overlays null-source records on a source row by `id`, the importer is untouched, and `promote_model_candidate.py` gains `init-gap` and `link`. No catalog record is added here; everything is tested on fixtures.

**Tech Stack:** Python 3.11 (`uv`, `unittest`), vanilla JS (`node:test`, Playwright), static JSON.

**Spec:** `docs/superpowers/specs/2026-09-20-models-without-models-dev-source-design.md` and `docs/adr/038-reviewed-models-may-precede-their-models-dev-source-row.md`. Read both before any task.

## Global Constraints

- Put `/usr/local/bin` first on `PATH` in every shell (`export PATH=/usr/local/bin:$PATH`). Default `node` is v16 and silently mis-hashes the asset stamp; v22 lives in `/usr/local/bin`.
- Python tests run with `uv run python -m unittest <module> -v`. There is no pytest.
- Never edit generated files by hand: `web/*.json` copies, `web/app/**`, `web/records/**`, `web/asset-version*`. Regenerate with the four commands in `AGENTS.md` ("Published catalog regeneration, in order").
- Snippets below write links as `ADR 038 {link to `path`}` because this repository link-checks plan files; in the target file, write a normal markdown link whose text is ADR 038 and whose target is exactly that path.
- Do not add, edit, or remove any record in `directory/models.json`, `directory/model-candidates.json`, or `directory/model-dispositions.json`. This plan ships mechanism only.
- `scripts/import_models_dev.py` must not change (Task 4 pins that with a test).
- User-facing strings use plain language. The exact strings are: `Not yet listed on models.dev`, `Reviewed by Atlas from developer documentation`, and the kicker suffix ` · {n} not yet on models.dev`. Never show "gap", "null-source", or `null` to a reader.
- `git diff` in scripts or checks needs `--no-ext-diff` (a global `difft` external diff empties piped output).
- Commit after each task. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Vocabulary used in this plan: a **null-source record** is a reviewed model with `source_id: null`; a **linked record** has a string `source_id`.

## File Structure

| File | Change |
|---|---|
| `scripts/validate_directory.py` | nullable `source_id`; null-source rules; new `validate_model_source_links` and `model_link_pending`; summary lines |
| `scripts/build_web_payload.py` | overlay rule in `model_records`; `unlisted_reviewed_count` in the models envelope |
| `scripts/promote_model_candidate.py` | null path in `preflight_promotion`; `build_gap_draft`; `preflight_link`, `apply_link`, `metadata_diff`; `init-gap` and `link` subcommands |
| `web/app-core.js` | `UNLISTED_MODEL_LABEL`, `modelSourceLabel`, `modelMetadataAttribution`, `modelsKickerText` |
| `web/app.js`, `web/index.html` | call the helpers; copy change |
| `tests/test_validation_policy.py`, `tests/test_directory.py`, `tests/test_web_payload.py`, `tests/test_import_models_dev.py`, `tests/test_promote_model_candidate.py`, `tests/test_web.js`, `tests/e2e/models.spec.js`, `tests/test_documentation.py` | tests |
| `docs/MODELS.md`, `docs/DATA_MODEL.md`, `docs/WEB.md`, `docs/OPERATIONS.md`, `docs/adr/025…`, `026…`, `027…`, `AGENTS.md`, `skills/ai-systems-atlas/reference.md`, `web/llms.txt`, `BACKLOG.md` | documentation |

---

### Task 1: Validator accepts `source_id: null` under two rules

**Files:**
- Modify: `scripts/validate_directory.py` (`validate_models`, the `source_id` block near `:1950-1958`)
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Produces: module-level `stable_model_id(source_id: str) -> str` in `scripts/validate_directory.py` (same algorithm as `scripts/import_models_dev.py:159-163`; the validator must not import the importer). `validate_models` signature is unchanged.

- [ ] **Step 1: Write the failing tests.** Add to `ValidationPolicyTests` in `tests/test_validation_policy.py`:

```python
    def _with_null_source_models(self, mutate) -> list[str]:
        """Turn the first reviewed model into a null-source record, apply mutate, validate."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "models.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        mutate(document["models"])
        self.write_json(path, document)
        self.write_json(root / "web" / "models.json", document)
        return validate(root)

    def test_null_source_id_is_accepted_for_a_slug_id_with_text_output(self) -> None:
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = None

        errors = self._with_null_source_models(mutate)

        # The detached upstream row now needs a queue entry or disposition, so the
        # eligible-count error is expected; nothing may complain about the model.
        self.assertFalse(
            [error for error in errors if error.startswith("model ")], errors
        )

    def test_two_null_source_records_do_not_collide(self) -> None:
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = None
            models[1]["source_id"] = None

        errors = self._with_null_source_models(mutate)

        self.assertFalse(
            [error for error in errors if "duplicate models.dev source_id" in error],
            errors,
        )

    def test_null_source_id_requires_a_stable_slug_id(self) -> None:
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = None
            models[0]["id"] = "model-Not_A_Slug"

        errors = self._with_null_source_models(mutate)

        self.assertTrue(
            any("without a models.dev source_id needs a stable slug id" in e for e in errors),
            errors,
        )

    def test_null_source_id_still_requires_text_output(self) -> None:
        # validate_model_source_metadata already enforces this for every reviewed
        # model (require_text defaults to True); the test pins it for ADR 038,
        # because the importer's modality gate never sees a null-source record.
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = None
            models[0]["source_metadata"]["modalities"]["output"] = ["image"]

        errors = self._with_null_source_models(mutate)

        self.assertTrue(
            any("model candidates must produce text" in e for e in errors),
            errors,
        )

    def test_empty_string_source_id_is_still_rejected(self) -> None:
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = ""

        errors = self._with_null_source_models(mutate)

        self.assertTrue(any("invalid models.dev source_id" in e for e in errors), errors)
```

- [ ] **Step 2: Run and confirm failure.**

Run: `uv run python -m unittest tests.test_validation_policy -k null_source -k empty_string_source -v`
Expected: the accept, no-collide, and slug tests FAIL (`invalid models.dev source_id` is reported for `None`); the text-output and empty-string tests pass already.

- [ ] **Step 3: Implement.** In `scripts/validate_directory.py`, add near the other module-level helpers:

```python
def stable_model_id(source_id: str) -> str:
    """The id models.dev import derives for a source id; kept equal to the importer's."""
    return "model-" + re.sub(r"[^a-z0-9]+", "-", source_id.lower()).strip("-")
```

Replace the inline derivation in `validate_models_dev` (`expected_id = "model-" + re.sub(...)`) with `expected_id = stable_model_id(source_id)`.

In `validate_models`, replace the `source_id` block with:

```python
        source_id = model.get("source_id")
        if source_id is None:
            # ADR 038: reviewed before models.dev listed it. The id stands in for
            # the expected upstream id, so it must have the stable slug form.
            if not isinstance(model_id, str) or not re.fullmatch(
                r"model-[a-z0-9]+(?:-[a-z0-9]+)*", model_id
            ):
                errors.append(
                    f"{prefix}: a model without a models.dev source_id needs a stable slug id"
                )
        elif not isinstance(source_id, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._/-]*", source_id
        ):
            errors.append(f"{prefix}: invalid models.dev source_id")
        elif source_id in source_ids:
            errors.append(f"{prefix}: duplicate models.dev source_id")
        else:
            source_ids.add(source_id)
```

- [ ] **Step 4: Run and confirm pass.**

Run: `uv run python -m unittest tests.test_validation_policy -v 2>&1 | tail -5`
Expected: `OK`.

- [ ] **Step 5: Add an importer-parity test** so the two slug functions cannot drift. In `tests/test_validation_policy.py`:

```python
    def test_validator_and_importer_derive_the_same_stable_id(self) -> None:
        from scripts.import_models_dev import stable_model_id as importer_id
        from scripts.validate_directory import stable_model_id as validator_id

        for source_id in ("anthropic/claude-mythos-5-1", "Acme/Big_Model.v2", "x/y--z"):
            self.assertEqual(importer_id(source_id), validator_id(source_id))
```

Run it; expected PASS.

- [ ] **Step 6: Commit.**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Accept reviewed models with a null models.dev source_id"
```

---

### Task 2: Cross-file source links, id collisions, and the link-pending report

**Files:**
- Modify: `scripts/validate_directory.py` (new functions; `validate()` near `:2926`; `main()` summary near `:3012`)
- Modify: `tests/test_directory.py:46-51`, `:60-68`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `stable_model_id` from Task 1.
- Produces:
  - `validate_model_source_links(models: list[Any], source_models: list[Any], errors: list[str]) -> None`
  - `model_link_pending(models: list[Any], candidates: list[Any]) -> list[tuple[str, str]]` returning `(model_id, candidate_source_id)` pairs, sorted. Task 6 reuses it.

- [ ] **Step 1: Write the failing tests** in `tests/test_validation_policy.py`:

```python
    def test_reviewed_source_id_must_exist_in_the_snapshot(self) -> None:
        def mutate(models: list[dict]) -> None:
            models[0]["source_id"] = "acme/not-upstream"

        errors = self._with_null_source_models(mutate)

        self.assertTrue(
            any(
                "acme/not-upstream" in e and "missing from the complete models.dev source snapshot" in e
                for e in errors
            ),
            errors,
        )

    def test_snapshot_row_id_must_not_collide_with_a_differently_linked_record(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        models_path = root / "directory" / "models.json"
        document = json.loads(models_path.read_text(encoding="utf-8"))
        source = json.loads((root / "directory" / "models-dev.json").read_text(encoding="utf-8"))
        first, second = document["models"][0], document["models"][1]
        # A wrong-guess link: the record keeps its frozen id but points at another row.
        first_row_id = first["id"]
        first["source_id"], second["source_id"] = second["source_id"], first["source_id"]
        self.write_json(models_path, document)
        self.write_json(root / "web" / "models.json", document)

        errors = validate(root)

        self.assertTrue(
            any(first_row_id in e and "collides with models.dev row" in e for e in errors),
            errors,
        )
        self.assertTrue(source["models"])  # fixture sanity

    def test_queued_row_for_a_null_source_record_is_reported_not_rejected(self) -> None:
        from scripts.validate_directory import model_link_pending

        models = [{"id": "model-acme-chat", "source_id": None}]
        candidates = [
            {"id": "model-acme-chat", "source_id": "acme/chat"},
            {"id": "model-acme-other", "source_id": "acme/other"},
        ]

        self.assertEqual(
            [("model-acme-chat", "acme/chat")], model_link_pending(models, candidates)
        )
```

- [ ] **Step 2: Run and confirm failure.**

Run: `uv run python -m unittest tests.test_validation_policy -k snapshot -k collide -k reported_not_rejected -v`
Expected: FAIL (no such error text; `model_link_pending` not importable).

- [ ] **Step 3: Implement** in `scripts/validate_directory.py`, after `validate_model_candidates`:

```python
def validate_model_source_links(
    models: list[Any], source_models: list[Any], errors: list[str]
) -> None:
    """Check reviewed models against the snapshot they claim to come from (ADR 038)."""
    rows_by_source = {
        row.get("source_id"): row
        for row in source_models
        if isinstance(row, dict) and isinstance(row.get("source_id"), str)
    }
    source_by_row_id = {
        row.get("id"): source_id for source_id, row in rows_by_source.items()
    }
    for model in models:
        if not isinstance(model, dict):
            continue
        source_id = model.get("source_id")
        if not isinstance(source_id, str):
            continue
        prefix = f"model {model.get('id', 'unknown')}"
        if source_id not in rows_by_source:
            errors.append(
                f"{prefix}: source_id {source_id} is missing from the complete "
                "models.dev source snapshot; set it to null and re-attest the "
                "metadata if upstream removed the row"
            )
        colliding = source_by_row_id.get(model.get("id"))
        if colliding is not None and colliding != source_id:
            errors.append(
                f"{prefix}: id collides with models.dev row {colliding} while linked "
                f"to {source_id}; unlink to null, link to {colliding}, and exclude "
                f"{source_id} (ADR 038)"
            )


def model_link_pending(models: list[Any], candidates: list[Any]) -> list[tuple[str, str]]:
    """Queued rows whose stable id matches a reviewed model that has no source_id yet."""
    waiting = {
        model.get("id")
        for model in models
        if isinstance(model, dict) and model.get("source_id") is None
    }
    return sorted(
        (candidate["id"], candidate["source_id"])
        for candidate in candidates
        if isinstance(candidate, dict)
        and candidate.get("id") in waiting
        and isinstance(candidate.get("source_id"), str)
    )
```

In `validate()`, directly after `source_models_value = validate_models_dev(...)`:

```python
    validate_model_source_links(models_value, source_models_value, errors)
```

In `main()`, after the existing summary `print(...)` and before `return 0`:

```python
    for model_id, source_id in model_link_pending(
        load("models.json")["models"], load("model-candidates.json")["candidates"]
    ):
        print(f"link pending: {model_id} <- {source_id}")
```

(`load` is the helper `main()` already uses for the counts. If `model-candidates.json` is not reachable through it, read `ROOT / "directory" / "model-candidates.json"` with `json.loads` instead.)

- [ ] **Step 4: Fix the two catalog tests** in `tests/test_directory.py`. Replace the assertion at `:46-51` with:

```python
        linked = {
            model["source_id"]
            for model in self.models["models"]
            if model["source_id"] is not None
        }
        self.assertEqual(linked, {item["source_id"] for item in source_records} & linked)
```

In the test at `:60-68`, build the reviewed list as `[model["source_id"] for model in self.models["models"] if model["source_id"] is not None]` and keep the uniqueness and queue-disjoint assertions on that list.

- [ ] **Step 5: Run.**

Run: `uv run python -m unittest tests.test_validation_policy tests.test_directory 2>&1 | tail -3 && uv run python scripts/validate_directory.py | tail -2`
Expected: `OK`; the validator prints its usual summary and no `link pending` line.

- [ ] **Step 6: Commit.**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py tests/test_directory.py
git commit -m "Validate reviewed model source links and report pending links"
```

---

### Task 3: Payload overlay and `unlisted_reviewed_count`

**Files:**
- Modify: `scripts/build_web_payload.py` (`model_records` `:236-265`; models envelope `:312-321`)
- Test: `tests/test_web_payload.py`

**Interfaces:**
- Produces: `model_records(catalog) -> list[dict]` (unchanged signature); `unlisted_model_count(catalog) -> int`; envelope key `unlisted_reviewed_count: int` in `web/app/models.json`. Task 7 reads that key in the browser.

- [ ] **Step 1: Write the failing tests** in `tests/test_web_payload.py` (import `unlisted_model_count` next to `model_records`):

```python
    def _catalog_with(self, reviewed: list[dict], rows: list[dict]) -> dict:
        return {
            "models.json": {"models": reviewed},
            "models-dev.json": {"source": {"commit": "c" * 40}, "models": rows},
        }

    @staticmethod
    def _row(source_id: str, model_id: str) -> dict:
        return {
            "id": model_id,
            "source_id": source_id,
            "source_metadata": {"name": source_id, "description": None},
        }

    def test_null_source_record_overlays_the_row_with_its_id(self) -> None:
        catalog = self._catalog_with(
            [{"id": "model-acme-chat", "source_id": None, "name": "Chat"}],
            [self._row("acme/chat", "model-acme-chat")],
        )

        records = model_records(catalog)

        self.assertEqual(["model-acme-chat"], [item["id"] for item in records])
        self.assertEqual("reviewed", records[0]["review_status"])
        self.assertEqual(0, unlisted_model_count(catalog))

    def test_null_source_record_without_a_row_is_appended_and_counted(self) -> None:
        catalog = self._catalog_with(
            [{"id": "model-acme-chat", "source_id": None, "name": "Chat"}],
            [self._row("acme/other", "model-acme-other")],
        )

        records = model_records(catalog)

        self.assertEqual(
            [("model-acme-other", "imported"), ("model-acme-chat", "reviewed")],
            [(item["id"], item["review_status"]) for item in records],
        )
        self.assertEqual(1, unlisted_model_count(catalog))

    def test_linked_record_with_a_frozen_id_overlays_its_own_source_row(self) -> None:
        catalog = self._catalog_with(
            [{"id": "model-acme-chat", "source_id": "acme/chat-2026", "name": "Chat"}],
            [self._row("acme/chat-2026", "model-acme-chat-2026")],
        )

        records = model_records(catalog)

        self.assertEqual([("model-acme-chat", "reviewed")],
                         [(item["id"], item["review_status"]) for item in records])
```

Update `test_models_payload_overlays_reviews_on_every_source_record`: replace the first and last assertions with

```python
        self.assertEqual(
            source["source_record_count"] + payload["unlisted_reviewed_count"],
            len(payload["models"]),
        )
        ...
        ids = [item["id"] for item in payload["models"]]
        self.assertEqual(len(ids), len(set(ids)))
        linked = [item["source_id"] for item in payload["models"] if item["source_id"]]
        self.assertEqual(len(linked), len(set(linked)))
```

- [ ] **Step 2: Run and confirm failure.**

Run: `uv run python -m unittest tests.test_web_payload -v 2>&1 | tail -8`
Expected: ImportError for `unlisted_model_count`.

- [ ] **Step 3: Implement.** In `scripts/build_web_payload.py` replace the head of `model_records` and its loop match:

```python
def model_records(catalog: dict[str, dict]) -> list[dict]:
    """Overlay reviewed Atlas models on the complete attributed source snapshot.

    A linked record matches its row by source_id. A record reviewed before
    models.dev listed it has no source_id and matches by id (ADR 038).
    """
    linked: dict[str, dict] = {}
    unlisted: dict[str, dict] = {}
    for record in catalog["models.json"]["models"]:
        reviewed = {**record, "review_status": "reviewed"}
        if record["source_id"] is None:
            unlisted[record["id"]] = reviewed
        else:
            linked[record["source_id"]] = reviewed
    source = catalog["models-dev.json"]
    commit = source["source"]["commit"]
    combined: list[dict] = []
    for source_record in source["models"]:
        source_id = source_record["source_id"]
        if source_id in linked:
            combined.append(linked.pop(source_id))
            continue
        if source_record["id"] in unlisted:
            combined.append(unlisted.pop(source_record["id"]))
            continue
```

Keep the imported-row dictionary as it is, and end with:

```python
    combined.extend(linked.values())
    combined.extend(unlisted.values())
    return combined


def unlisted_model_count(catalog: dict[str, dict]) -> int:
    """Reviewed models that no models.dev row stands behind yet."""
    row_ids = {row["id"] for row in catalog["models-dev.json"]["models"]}
    return sum(
        record["source_id"] is None and record["id"] not in row_ids
        for record in catalog["models.json"]["models"]
    )
```

In the models envelope add `"unlisted_reviewed_count": unlisted_model_count(catalog),` after `"reviewed_count"`.

- [ ] **Step 4: Regenerate and run.**

```bash
uv run python scripts/build_web_payload.py
uv run python -m unittest tests.test_web_payload 2>&1 | tail -3
git --no-pager diff --no-ext-diff --stat web/app | tail -3
```

Expected: `OK`; only `web/app/models.json` changes, by one envelope key (`"unlisted_reviewed_count": 0`).

- [ ] **Step 5: Commit** (asset version is restamped in Task 7, the last task that changes `web/`).

```bash
git add scripts/build_web_payload.py tests/test_web_payload.py web/app/models.json
git commit -m "Overlay null-source reviewed models by id in the Models payload"
```

---

### Task 4: Pin that the importer ignores null-source records

**Files:**
- Test: `tests/test_import_models_dev.py`

- [ ] **Step 1: Write the test** beside `test_dispositioned_source_ids_leave_the_queue_but_count_as_eligible`:

```python
    def test_row_for_a_null_source_reviewed_model_is_queued_like_any_other(self) -> None:
        # ADR 038: run() builds published_source_ids from string source_ids only, so a
        # reviewed record with source_id null never keeps its upstream row out of the queue.
        catalog = {"acme/chat": model_record("acme/chat")}

        candidates, eligible = normalize_catalog(
            catalog,
            observed_at="2026-09-20",
            minimum_records=1,
            published_source_ids=set(),
        )

        self.assertEqual(1, eligible)
        self.assertEqual(["model-acme-chat"], [item["id"] for item in candidates])
```

Add a second test that reads the filter itself, so a future edit to `run()` cannot start treating `None` as published:

```python
    def test_published_source_ids_ignore_null(self) -> None:
        import inspect

        from scripts import import_models_dev

        source = inspect.getsource(import_models_dev.run)
        self.assertIn("isinstance(", source)
        self.assertIn('"source_id"', source)
```

- [ ] **Step 2: Run.** `uv run python -m unittest tests.test_import_models_dev 2>&1 | tail -3` — expected `OK` immediately (this task pins existing behaviour). Confirm `git --no-pager diff --no-ext-diff --stat scripts/import_models_dev.py` is empty.

- [ ] **Step 3: Commit.**

```bash
git add tests/test_import_models_dev.py
git commit -m "Pin that the models.dev importer queues rows for null-source models"
```

---

### Task 5: `init-gap`, and `check`/`apply` for a null-source draft

**Files:**
- Modify: `scripts/promote_model_candidate.py`
- Test: `tests/test_promote_model_candidate.py`

**Interfaces:**
- Consumes: `stable_model_id` from `scripts/validate_directory.py` (add it to both import blocks at the top of the script).
- Produces:
  - `EMPTY_SOURCE_METADATA: dict` — the required shape with empty values.
  - `build_gap_draft(root: Path, expected_source_id: str) -> dict[str, Any]` — raises `PromotionError` on any refusal.
  - `preflight_promotion(root, record)` — unchanged signature; with `record["source_id"] is None` it returns `(proposed_models, candidates_data_unchanged)`.
  - `apply_promotion` — unchanged signature; writes only `models.json` on the null path.

- [ ] **Step 1: Write the failing tests.** In `tests/test_promote_model_candidate.py`, import `build_gap_draft` and add:

```python
    def gap_record(self) -> dict:
        """The fixture record rewritten as a complete null-source review."""
        record = deepcopy(self.record)
        record["source_id"] = None
        record["id"] = "model-acme-unlisted"
        record["evidence"] = [
            item
            for item in record["evidence"]
            if "github.com/anomalyco/models.dev/blob/" not in item["url"]
        ]
        return record

    def test_gap_draft_has_null_source_and_empty_metadata(self) -> None:
        draft = build_gap_draft(self.root, "acme/unlisted")

        self.assertEqual("model-acme-unlisted", draft["id"])
        self.assertIsNone(draft["source_id"])
        self.assertEqual([], draft["source_metadata"]["modalities"]["output"])
        self.assertEqual([], draft["evidence"])
        self.assertEqual("review_required", draft["license_review_status"])

    def test_gap_draft_refuses_ids_models_dev_already_lists(self) -> None:
        with self.assertRaisesRegex(PromotionError, "already in the models.dev snapshot"):
            build_gap_draft(self.root, self.candidate["source_id"])

    def test_gap_draft_refuses_dispositioned_ids(self) -> None:
        write_json(
            self.root / "directory" / "model-dispositions.json",
            {"dispositions": [{"source_id": "acme/unlisted", "disposition": "held",
                               "reason": "x", "decided_at": "2026-09-20"}]},
        )
        with self.assertRaisesRegex(PromotionError, "dispositioned"):
            build_gap_draft(self.root, "acme/unlisted")

    def test_gap_draft_refuses_an_id_that_is_already_published(self) -> None:
        models = json.loads((self.root / "directory" / "models.json").read_text())
        taken = models["models"][0]["source_id"]
        source = {"models": []}
        write_json(self.root / "directory" / "models-dev.json", source)
        with self.assertRaisesRegex(PromotionError, "already published"):
            build_gap_draft(self.root, taken)

    def test_complete_gap_review_passes_and_apply_leaves_the_queue_alone(self) -> None:
        queue_path = self.root / "directory" / "model-candidates.json"
        before = queue_path.read_bytes()

        preflight_promotion(self.root, self.gap_record())
        remaining, model_id = apply_promotion(self.root, self.gap_record())

        self.assertEqual("model-acme-unlisted", model_id)
        self.assertEqual(1, remaining)
        self.assertEqual(before, queue_path.read_bytes())
        models = json.loads((self.root / "directory" / "models.json").read_text())
        added = [m for m in models["models"] if m["id"] == "model-acme-unlisted"]
        self.assertEqual([None], [m["source_id"] for m in added])

    def test_gap_review_still_needs_the_authoritative_model_url(self) -> None:
        record = self.gap_record()
        record["evidence"] = [e for e in record["evidence"] if e["url"] != record["url"]]
        with self.assertRaisesRegex(PromotionError, "authoritative model URL"):
            preflight_promotion(self.root, record)

    def test_gap_review_is_refused_once_models_dev_lists_the_id(self) -> None:
        record = self.gap_record()
        record["id"] = self.candidate["id"]
        with self.assertRaisesRegex(PromotionError, "use the queue"):
            preflight_promotion(self.root, record)

    def test_missing_source_id_key_is_still_rejected(self) -> None:
        record = deepcopy(self.record)
        del record["source_id"]
        with self.assertRaisesRegex(PromotionError, "requires a models.dev source_id"):
            preflight_promotion(self.root, record)
```

- [ ] **Step 2: Run and confirm failure.** `uv run python -m unittest tests.test_promote_model_candidate 2>&1 | tail -5` — ImportError for `build_gap_draft`.

- [ ] **Step 3: Implement.** In `scripts/promote_model_candidate.py`:

Add `stable_model_id` to both `validate_directory` import blocks. Add:

```python
EMPTY_SOURCE_METADATA: dict[str, Any] = {
    "name": "",
    "description": None,
    "family": None,
    "release_date": None,
    "last_updated": None,
    "knowledge_cutoff": None,
    "modalities": {"input": [], "output": []},
    "capabilities": {
        "attachment": None,
        "reasoning": None,
        "tool_call": None,
        "structured_output": None,
        "temperature": None,
    },
    "limits": {"context": None, "input": None, "output": None},
    "reported_open_weights": None,
    "reported_license": None,
    "links": [],
    "weights": [],
}
```

The top-level keys equal `MODEL_SOURCE_METADATA_REQUIRED` (`scripts/validate_directory.py:377-391`). Add a test asserting `set(EMPTY_SOURCE_METADATA["capabilities"]) == MODEL_CAPABILITIES` and `set(EMPTY_SOURCE_METADATA["limits"]) == MODEL_LIMITS` (import both from `scripts.validate_directory`) so the template cannot drift from the schema.

```python
def _dispositioned(directory: Path) -> dict[str, str]:
    path = directory / "model-dispositions.json"
    if not path.exists():
        return {}
    return {
        entry["source_id"]: str(entry.get("disposition", "dispositioned"))
        for entry in load_json(path).get("dispositions", [])
        if isinstance(entry, dict) and isinstance(entry.get("source_id"), str)
    }


def _refuse_listed(directory: Path, expected_source_id: str, model_id: str) -> None:
    """A gap review is only for releases models.dev does not list (ADR 038)."""
    rows = load_json(directory / "models-dev.json").get("models") or []
    if any(
        isinstance(row, dict)
        and (row.get("source_id") == expected_source_id or row.get("id") == model_id)
        for row in rows
    ):
        raise PromotionError(
            f"{expected_source_id} is already in the models.dev snapshot; use the queue "
            "(init, or link for an existing record)"
        )
    disposition = _dispositioned(directory).get(expected_source_id)
    if disposition:
        raise PromotionError(f"{expected_source_id} is dispositioned as {disposition}")


def build_gap_draft(root: Path, expected_source_id: str) -> dict[str, Any]:
    """Scaffold a review for a release models.dev does not list yet."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._/-]*", expected_source_id):
        raise PromotionError("expected id must look like PROVIDER/MODEL")
    directory = root / "directory"
    model_id = stable_model_id(expected_source_id)
    _refuse_listed(directory, expected_source_id, model_id)
    models = load_json(directory / "models.json").get("models") or []
    if any(isinstance(m, dict) and m.get("id") == model_id for m in models):
        raise PromotionError(f"model id is already published: {model_id}")
    return build_draft(
        {"id": model_id, "source_id": None, "source_metadata": EMPTY_SOURCE_METADATA},
        {},
    )
```

`build_draft` calls `models_dev_evidence_url`, which raises for a `None` source id. In `build_draft`, set `"evidence"` to `[]` when `candidate.get("source_id") is None` and to the existing single pinned entry otherwise. Add `import re` at the top of the script.

In `preflight_promotion`, replace the `source_id` guard with:

```python
    if "source_id" not in record or (
        record["source_id"] is not None
        and (not isinstance(record["source_id"], str) or not record["source_id"])
    ):
        raise PromotionError("review record requires a models.dev source_id")
    source_id = record["source_id"]
    if source_id is None:
        return _preflight_gap(
            directory, record, models_data, candidates_data, taxonomy_data,
            projects_data, specifications_data, inference_services_data,
            local_runtimes_data, packs_data,
        )
```

and add:

```python
def _preflight_gap(
    directory: Path,
    record: dict[str, Any],
    models_data: dict[str, Any],
    candidates_data: dict[str, Any],
    taxonomy_data: dict[str, Any],
    projects_data: dict[str, Any],
    specifications_data: dict[str, Any],
    inference_services_data: dict[str, Any],
    local_runtimes_data: dict[str, Any],
    packs_data: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    model_id = str(record.get("id"))
    rows = load_json(directory / "models-dev.json").get("models") or []
    if any(isinstance(row, dict) and row.get("id") == model_id for row in rows):
        raise PromotionError(
            f"models.dev now lists a row with id {model_id}; use the queue instead of a gap review"
        )
    errors: list[str] = []
    models = models_data.get("models") if isinstance(models_data.get("models"), list) else []
    if any(isinstance(m, dict) and m.get("id") == model_id for m in models):
        errors.append(f"model id is already published: {model_id}")
    if record.get("license_review_status") != "verified":
        errors.append("license_review_status must be verified before promotion")
    evidence = record.get("evidence") if isinstance(record.get("evidence"), list) else []
    urls = {item.get("url") for item in evidence if isinstance(item, dict)}
    if record.get("url") not in urls:
        errors.append("evidence must include the authoritative model URL")
    if any("github.com/anomalyco/models.dev/" in str(url) for url in urls):
        errors.append("a gap review cannot cite models.dev evidence; models.dev does not list it")
    metadata_date = _valid_date(record.get("metadata_verified_at"))
    reviewed_date = _valid_date(record.get("verified_at"))
    current_date = datetime.now(UTC).date()
    if reviewed_date and metadata_date and reviewed_date < metadata_date:
        errors.append("verified_at predates metadata_verified_at")
    if metadata_date and metadata_date > current_date:
        errors.append("metadata_verified_at cannot be in the future")
    if reviewed_date and reviewed_date > current_date:
        errors.append("verified_at cannot be in the future")

    proposed_models = deepcopy(models_data)
    if isinstance(proposed_models.get("models"), list):
        proposed_models["models"].append(deepcopy(record))
        proposed_models["models"].sort(
            key=lambda item: (
                str(item.get("developer", "")).casefold(),
                str(item.get("name", "")).casefold(),
                str(item.get("id", "")),
            )
        )
    record_date = _valid_date(record.get("verified_at"))
    collection_date = _valid_date(proposed_models.get("verified_at"))
    if record_date and (collection_date is None or record_date > collection_date):
        proposed_models["verified_at"] = record_date.isoformat()

    taxonomy_errors: list[str] = []
    taxonomy = validate_taxonomy(taxonomy_data, taxonomy_errors)
    errors.extend(taxonomy_errors)
    validate_models(proposed_models, taxonomy, errors)
    published = proposed_models.get("models")
    validate_unique_record_ids(
        projects_data.get("projects", []),
        specifications_data.get("specifications", []),
        inference_services_data.get("services", []),
        local_runtimes_data.get("runtimes", []),
        published if isinstance(published, list) else [],
        errors,
        packs_value=packs_data.get("packs") if isinstance(packs_data.get("packs"), list) else [],
    )
    if errors:
        formatted = "\n".join(f"- {error}" for error in errors)
        raise PromotionError(f"gap review is not ready for promotion:\n{formatted}")
    return proposed_models, candidates_data
```

The sort key and the `verified_at` bump duplicate lines in `preflight_promotion`. Extract them into `_with_record(models_data, record) -> dict[str, Any]` and call it from both places.

In `_promotion_specific_errors`, guard the duplicate check: `if record.get("source_id") is not None and model.get("source_id") == record.get("source_id"):`.

In `apply_promotion`, write the queue only when it changed:

```python
    if proposed_candidates != load_json(candidates_path):
        _write_json_atomic(candidates_path, proposed_candidates)
```

(keep the rollback `except` as is).

CLI: add

```python
    gap = commands.add_parser(
        "init-gap", help="write a review draft for a release models.dev does not list"
    )
    gap.add_argument("expected", help="the models.dev id you expect, PROVIDER/MODEL")
    gap.add_argument("--output", type=Path, required=True, help="new JSON review-draft path")
```

and in `main`, before loading `args.record`:

```python
        if args.command == "init-gap":
            output = args.output.resolve()
            write_draft(output, build_gap_draft(root, args.expected))
            print(f"wrote incomplete gap review draft for {args.expected} to {output}")
            print("fill source_metadata from the developer's documentation, then run check")
            return 0
```

In the `check` and `apply` messages replace `record['source_id']` with `record.get('source_id') or record.get('id')`.

- [ ] **Step 4: Run.** `uv run python -m unittest tests.test_promote_model_candidate -v 2>&1 | tail -6` — expected `OK`, including every pre-existing test.

- [ ] **Step 5: Smoke the CLI against the real catalog without writing to it.**

```bash
uv run python scripts/promote_model_candidate.py init-gap anthropic/claude-mythos-5 --output "$TMPDIR/x.json"; echo "exit=$?"
uv run python scripts/promote_model_candidate.py init-gap anthropic/claude-mythos-5-1 --output "$TMPDIR/gap.json" && head -5 "$TMPDIR/gap.json"; rm -f "$TMPDIR/gap.json"
```

Expected: first command prints `error: anthropic/claude-mythos-5 is already in the models.dev snapshot…`, `exit=1`; second writes a draft with `"id": "model-anthropic-claude-mythos-5-1"` and `"source_id": null`. `git status --short directory/` stays empty.

- [ ] **Step 6: Commit.**

```bash
git add scripts/promote_model_candidate.py tests/test_promote_model_candidate.py
git commit -m "Add guarded gap reviews for models models.dev does not list"
```

---

### Task 6: `link` a null-source record to its models.dev row

**Files:**
- Modify: `scripts/promote_model_candidate.py`
- Test: `tests/test_promote_model_candidate.py`

**Interfaces:**
- Consumes: `candidate_for`, `models_dev_evidence_url`, `_write_json_atomic`, `_valid_date`, `_dispositioned` (Task 5).
- Produces:
  - `metadata_diff(authored: dict, upstream: dict) -> list[str]` — one `field: authored -> upstream` line per differing leaf, dotted paths, sorted.
  - `preflight_link(root: Path, model_id: str, source_id: str, metadata_verified_at: str) -> tuple[dict, dict, list[str]]` returning `(proposed_models, proposed_candidates, diff_lines)`.
  - `apply_link(root, model_id, source_id, metadata_verified_at) -> list[str]` returning the diff lines.

- [ ] **Step 1: Write the failing tests.** Import `apply_link`, `metadata_diff`, `preflight_link`. The `setUp` fixture already has one queued candidate (`self.candidate`) whose reviewed twin was popped from `models.json`; put a null-source twin back:

```python
    def install_null_source_twin(self, *, model_id: str | None = None) -> dict:
        record = deepcopy(self.record)
        record["source_id"] = None
        record["id"] = model_id or self.candidate["id"]
        record["source_metadata"]["limits"]["context"] = 123
        record["evidence"] = [
            e for e in record["evidence"]
            if "github.com/anomalyco/models.dev/blob/" not in e["url"]
        ]
        path = self.root / "directory" / "models.json"
        models = json.loads(path.read_text())
        models["models"].append(record)
        write_json(path, models)
        return record

    def test_metadata_diff_names_each_differing_leaf(self) -> None:
        self.assertEqual(
            ["limits.context: 123 -> 456", "name: 'A' -> 'B'"],
            metadata_diff(
                {"name": "A", "limits": {"context": 123}, "family": "f"},
                {"name": "B", "limits": {"context": 456}, "family": "f"},
            ),
        )

    def test_link_adopts_upstream_metadata_and_removes_the_candidate(self) -> None:
        twin = self.install_null_source_twin()

        diff = apply_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        self.assertTrue(any(line.startswith("limits.context: 123 -> ") for line in diff))
        models = json.loads((self.root / "directory" / "models.json").read_text())
        linked = next(m for m in models["models"] if m["id"] == twin["id"])
        self.assertEqual(self.candidate["source_id"], linked["source_id"])
        self.assertEqual(self.candidate["source_metadata"], linked["source_metadata"])
        self.assertEqual("2026-09-20", linked["metadata_verified_at"])
        self.assertEqual(twin["verified_at"], linked["verified_at"])
        self.assertEqual(twin["score"], linked["score"])
        self.assertTrue(
            any(
                e["url"].endswith(f"/models/{self.candidate['source_id']}.toml")
                and e["label"] == "Pinned models.dev source metadata"
                and e["verified_at"] == "2026-09-20"
                for e in linked["evidence"]
            )
        )
        queue = json.loads((self.root / "directory" / "model-candidates.json").read_text())
        self.assertEqual([], queue["candidates"])

    def test_link_keeps_a_frozen_id_when_upstream_used_another_name(self) -> None:
        twin = self.install_null_source_twin(model_id="model-acme-guessed-name")

        apply_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        models = json.loads((self.root / "directory" / "models.json").read_text())
        ids = {m["id"]: m["source_id"] for m in models["models"]}
        self.assertEqual(self.candidate["source_id"], ids["model-acme-guessed-name"])

    def test_preflight_link_writes_nothing(self) -> None:
        twin = self.install_null_source_twin()
        before = {
            name: (self.root / "directory" / name).read_bytes()
            for name in ("models.json", "model-candidates.json")
        }

        preflight_link(self.root, twin["id"], self.candidate["source_id"], "2026-09-20")

        for name, payload in before.items():
            self.assertEqual(payload, (self.root / "directory" / name).read_bytes())

    def test_link_refuses_a_record_that_is_already_linked(self) -> None:
        models = json.loads((self.root / "directory" / "models.json").read_text())
        linked_id = models["models"][0]["id"]
        with self.assertRaisesRegex(PromotionError, "already linked"):
            preflight_link(self.root, linked_id, self.candidate["source_id"], "2026-09-20")

    def test_link_refuses_a_source_id_that_is_not_queued(self) -> None:
        twin = self.install_null_source_twin()
        with self.assertRaisesRegex(PromotionError, "model candidate not found"):
            preflight_link(self.root, twin["id"], "acme/ghost", "2026-09-20")

    def test_link_refuses_a_stale_or_future_metadata_date(self) -> None:
        twin = self.install_null_source_twin()
        for bad in ("2026-09-03", "2999-01-01", "yesterday"):
            with self.assertRaises(PromotionError):
                preflight_link(self.root, twin["id"], self.candidate["source_id"], bad)
```

(`2026-09-03` predates the fixture queue's `updated_at` of `2026-09-04`.)

- [ ] **Step 2: Run and confirm failure.** ImportError for `apply_link`.

- [ ] **Step 3: Implement.**

```python
def metadata_diff(authored: Any, upstream: Any, path: str = "") -> list[str]:
    """Leaf-level differences between hand-authored and models.dev metadata."""
    if isinstance(authored, dict) and isinstance(upstream, dict):
        lines: list[str] = []
        for key in sorted(set(authored) | set(upstream)):
            lines.extend(
                metadata_diff(authored.get(key), upstream.get(key), f"{path}.{key}" if path else key)
            )
        return lines
    return [] if authored == upstream else [f"{path}: {authored!r} -> {upstream!r}"]


def preflight_link(
    root: Path, model_id: str, source_id: str, metadata_verified_at: str
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Propose linking a reviewed model to the models.dev row that now lists it."""
    directory = root / "directory"
    models_data = load_json(directory / "models.json")
    candidates_data = load_json(directory / "model-candidates.json")
    source_models_data = load_json(directory / "models-dev.json")
    taxonomy_data = load_json(directory / "taxonomy.json")
    models = models_data.get("models") if isinstance(models_data.get("models"), list) else []
    matches = [m for m in models if isinstance(m, dict) and m.get("id") == model_id]
    if len(matches) != 1:
        raise PromotionError(f"reviewed model not found: {model_id}")
    if matches[0].get("source_id") is not None:
        raise PromotionError(
            f"{model_id} is already linked to {matches[0]['source_id']}; "
            "set source_id to null by hand first if upstream changed"
        )
    disposition = _dispositioned(directory).get(source_id)
    if disposition:
        raise PromotionError(f"{source_id} is dispositioned as {disposition}; lift it first")
    candidate = candidate_for(candidates_data, source_id)
    rows = [
        row for row in source_models_data.get("models") or []
        if isinstance(row, dict) and row.get("source_id") == source_id
    ]
    if len(rows) != 1 or rows[0].get("source_metadata") != candidate.get("source_metadata"):
        raise PromotionError("candidate metadata differs from the complete models.dev source snapshot")

    attested = _valid_date(metadata_verified_at)
    queue_date = _valid_date(candidates_data.get("updated_at"))
    if attested is None:
        raise PromotionError("--metadata-verified-at must be an ISO date")
    if queue_date and attested < queue_date:
        raise PromotionError("metadata_verified_at predates the imported candidate snapshot")
    if attested > datetime.now(UTC).date():
        raise PromotionError("metadata_verified_at cannot be in the future")

    proposed_models = deepcopy(models_data)
    record = next(m for m in proposed_models["models"] if m.get("id") == model_id)
    diff = metadata_diff(record.get("source_metadata"), candidate.get("source_metadata"))
    record["source_id"] = source_id
    record["source_metadata"] = deepcopy(candidate["source_metadata"])
    record["metadata_verified_at"] = metadata_verified_at
    pinned_url = models_dev_evidence_url(candidate, candidates_data)
    if all(item.get("url") != pinned_url for item in record["evidence"]):
        record["evidence"].append(
            {
                "kind": "web",
                "label": "Pinned models.dev source metadata",
                "url": pinned_url,
                "verified_at": metadata_verified_at,
            }
        )
    proposed_candidates = deepcopy(candidates_data)
    proposed_candidates["candidates"] = [
        item for item in proposed_candidates["candidates"]
        if not isinstance(item, dict) or item.get("source_id") != source_id
    ]

    errors: list[str] = []
    taxonomy = validate_taxonomy(taxonomy_data, errors)
    validate_models(proposed_models, taxonomy, errors)
    validate_model_candidates(
        proposed_candidates,
        proposed_models["models"],
        source_models_data.get("models") or [],
        taxonomy,
        errors,
        set(_dispositioned(directory)),
    )
    if errors:
        formatted = "\n".join(f"- {error}" for error in errors)
        raise PromotionError(f"link is not safe to apply:\n{formatted}")
    return proposed_models, proposed_candidates, diff


def apply_link(root: Path, model_id: str, source_id: str, metadata_verified_at: str) -> list[str]:
    proposed_models, proposed_candidates, diff = preflight_link(
        root, model_id, source_id, metadata_verified_at
    )
    models_path = root / "directory" / "models.json"
    candidates_path = root / "directory" / "model-candidates.json"
    original_models = models_path.read_bytes()
    original_candidates = candidates_path.read_bytes()
    try:
        _write_json_atomic(models_path, proposed_models)
        _write_json_atomic(candidates_path, proposed_candidates)
    except Exception:
        models_path.write_bytes(original_models)
        candidates_path.write_bytes(original_candidates)
        raise
    return diff
```

The evidence entry shape must match what `validate_web_evidence` accepts; copy the keys from the pinned entry in `build_draft`.

CLI:

```python
    link = commands.add_parser(
        "link", help="link a reviewed model to the models.dev row that now lists it"
    )
    link.add_argument("model_id", help="Atlas id of the reviewed model without a source_id")
    link.add_argument("source_id", help="queued models.dev source_id to adopt")
    link.add_argument("--metadata-verified-at", required=True, help="ISO date you checked the upstream metadata")
    link.add_argument("--dry-run", action="store_true", help="show the metadata diff and stop")
```

and in `main`, beside the `init-gap` branch:

```python
        if args.command == "link":
            run = preflight_link if args.dry_run else apply_link
            result = run(root, args.model_id, args.source_id, args.metadata_verified_at)
            diff = result[2] if args.dry_run else result
            print("hand-authored -> models.dev metadata:")
            for line in diff or ["(no differences)"]:
                print(f"  {line}")
            if args.dry_run:
                print("dry run: nothing written")
            else:
                print(f"linked {args.model_id} to {args.source_id}")
                print("re-read the review if any difference touches a score or the boundary,")
                print("then synchronize web data, regenerate share pages, and run full verification")
            return 0
```

Update the module docstring and `argparse` description to mention gap reviews and linking.

- [ ] **Step 4: Run.** `uv run python -m unittest tests.test_promote_model_candidate 2>&1 | tail -3` — `OK`.

- [ ] **Step 5: Commit.**

```bash
git add scripts/promote_model_candidate.py tests/test_promote_model_candidate.py
git commit -m "Add a guarded link command for models that models.dev lists later"
```

---

### Task 7: UI

**Files:**
- Modify: `web/app-core.js` (new helpers; export list at `:476-503`)
- Modify: `web/app.js:179`, `:646-649`, `:899`, `:920`, `:1600-1610`
- Modify: `web/index.html:190-205`
- Test: `tests/test_web.js`, `tests/e2e/models.spec.js`
- Regenerate: asset version stamp

**Interfaces:**
- Consumes: `unlisted_reviewed_count` from `web/app/models.json` (Task 3).
- Produces in `AtlasCore`:
  - `UNLISTED_MODEL_LABEL = "Not yet listed on models.dev"`
  - `modelSourceLabel(model) -> string`
  - `modelMetadataAttribution(model) -> { listed: boolean, cardTitle, cardPrefix, capabilityNote, linksHeading }`
  - `modelsKickerText(sourceCount, reviewedCount, unlistedCount) -> string`

- [ ] **Step 1: Write the failing unit tests.** In `tests/test_web.js`, add the four names to the `require` destructuring and:

```js
test("a reviewed model without a models.dev row never prints null", () => {
  const unlisted = { ...models[0], source_id: null };
  assert.equal(modelSourceLabel(models[0]), "alibaba/qwen");
  assert.equal(modelSourceLabel(unlisted), UNLISTED_MODEL_LABEL);
  assert.equal(UNLISTED_MODEL_LABEL, "Not yet listed on models.dev");
});

test("metadata attribution names Atlas when models.dev has no row", () => {
  const listed = modelMetadataAttribution(models[0]);
  const unlisted = modelMetadataAttribution({ ...models[0], source_id: null });
  assert.equal(listed.listed, true);
  assert.match(listed.cardTitle, /models\.dev/);
  assert.equal(unlisted.listed, false);
  assert.equal(unlisted.cardTitle, "Reviewed by Atlas from developer documentation");
  for (const text of Object.values(unlisted)) {
    if (typeof text === "string") assert.doesNotMatch(text, /models\.dev/);
  }
});

test("the models kicker counts reviewed models models.dev does not list", () => {
  assert.equal(modelsKickerText(400, 242, 0), "400 models.dev records · 242 Atlas reviewed");
  assert.equal(modelsKickerText(400, 243, 1), "400 models.dev records · 243 Atlas reviewed · 1 not yet on models.dev");
  assert.equal(modelsKickerText(400, 243, undefined), "400 models.dev records · 243 Atlas reviewed");
});
```

- [ ] **Step 2: Run and confirm failure.** `node --test tests/test_web.js 2>&1 | tail -8` — the new names are `undefined`.

- [ ] **Step 3: Implement the helpers** in `web/app-core.js`, above the `return {` export block, and add all four names to it in alphabetical position:

```js
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
      };
    }
    return {
      listed: false,
      cardTitle: "Reviewed by Atlas from developer documentation",
      cardPrefix: "From developer documentation: ",
      capabilityNote: "Reviewed by Atlas from developer documentation, not an Atlas capability test.",
      linksHeading: "Source links",
    };
  }
  function modelsKickerText(sourceCount, reviewedCount, unlistedCount) {
    const base = `${sourceCount} models.dev records · ${reviewedCount} Atlas reviewed`;
    return unlistedCount > 0 ? `${base} · ${unlistedCount} not yet on models.dev` : base;
  }
```

- [ ] **Step 4: Use them in `web/app.js`.**

- `:179` add below it: `state.modelUnlistedCount = models.unlisted_reviewed_count;`
- `modelSourceMeta` (`:646-649`):

```js
function modelSourceMeta(model) {
  const parts = [modelModalityRoute(model), model.source_metadata.family].filter(Boolean);
  const attribution = AtlasCore.modelMetadataAttribution(model);
  return `<div class="card-source-meta" title="${escapeHTML(attribution.cardTitle)}"><span class="visually-hidden">${escapeHTML(attribution.cardPrefix)}</span>${parts.map(part => `<span>${escapeHTML(part)}</span>`).join("")}</div>`;
}
```

  Update the comment above it: modality and family come from models.dev, or from developer documentation for a model models.dev does not list yet.
- `:899` kicker: `$("#models-kicker").textContent = AtlasCore.modelsKickerText(state.modelSourceCount, state.reviewedModelCount, state.modelUnlistedCount);`
- `:920` reviewed card footer: replace `${escapeHTML(model.source_id)}` with `${escapeHTML(AtlasCore.modelSourceLabel(model))}`. Leave the imported card (`:663`) alone; imported rows always have an ID.
- `modelDialogMarkup` (`:1594-1612`): add `const attribution = AtlasCore.modelMetadataAttribution(model);` and change three spots:
  - identity: `<p><strong>models.dev ID:</strong> ${escapeHTML(AtlasCore.modelSourceLabel(model))}</p>`
  - capabilities note: `<p class="unscored-note">${escapeHTML(attribution.capabilityNote)}</p>`
  - links block heading: `<h3>${escapeHTML(attribution.linksHeading)}</h3>`
  - in "Release metadata", when `!attribution.listed`, render the two "reported" rows as `<strong>Open weights:</strong>` and `<strong>License named by the developer:</strong>` instead of "Open weights reported" / "License reported"; keep the current wording when listed.

`web/index.html:192`: replace the paragraph with

```html
        <p>Every provider-independent model record from models.dev is discoverable here, along with releases Atlas has reviewed that models.dev does not list yet. Source imports are visibly unscored; releases with completed Atlas identity, licensing, evidence, and deployability review add the dedicated access score.</p>
```

- [ ] **Step 5: Write the e2e case.** In `tests/e2e/models.spec.js`, reuse the file's existing `QWEN` constant:

```js
test("a reviewed model models.dev does not list yet says so and never prints null", async ({ page }) => {
  await page.route("**/app/models.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const models = payload.models.map(model => model.id === QWEN ? { ...model, source_id: null } : model);
    await route.fulfill({ response, json: { ...payload, unlisted_reviewed_count: 1, models } });
  });
  await page.goto("/#models");

  await expect(page.locator("#models-kicker")).toContainText("1 not yet on models.dev");
  const card = page.locator(`#model-grid .project-card:has([data-model="${QWEN}"])`);
  await page.locator("#model-search").fill("Qwen2.5-Coder-0.5B");
  await expect(card.locator(".card-footer")).toContainText("Not yet listed on models.dev");
  await expect(card).not.toContainText("null");
  await expect(card.locator(".card-source-meta")).toHaveAttribute("title", "Reviewed by Atlas from developer documentation");

  await card.locator(`[data-model="${QWEN}"]`).click();
  const dialog = page.locator("#model-dialog-content");
  await expect(dialog).toContainText("models.dev ID: Not yet listed on models.dev");
  await expect(dialog).toContainText("Reviewed by Atlas from developer documentation");
  await expect(dialog).not.toContainText("Source links from models.dev");
  await expect(dialog).not.toContainText("null");
});
```

Match the navigation call (`page.goto(...)`) to how the other tests in that file open the Models view.

- [ ] **Step 6: Restamp and run.**

```bash
export PATH=/usr/local/bin:$PATH
node scripts/build_asset_version.mjs
git --no-pager diff --no-ext-diff --stat | tail -5
node --test tests/test_web.js 2>&1 | tail -4
npx playwright test tests/e2e/models.spec.js 2>&1 | tail -5
```

Expected: both suites pass. Confirm in the diff that `app.js`, `app-core.js`, and the models payload each got a **new** query string in `web/index.html` (a stale cache-buster is invisible to a fresh browser context, so check the strings, not the page).

- [ ] **Step 7: Commit.**

```bash
git add web tests/test_web.js tests/e2e/models.spec.js
git commit -m "Show reviewed models that models.dev does not list yet"
```

---

### Task 8: Documentation, ADR pointers, backlog

**Files:**
- Modify: `docs/MODELS.md`, `docs/DATA_MODEL.md`, `docs/WEB.md`, `docs/OPERATIONS.md`, `docs/adr/025-…md`, `docs/adr/026-…md`, `docs/adr/027-…md`, `AGENTS.md`, `skills/ai-systems-atlas/reference.md`, `web/llms.txt`, `BACKLOG.md`, `tests/test_documentation.py`

- [ ] **Step 1: Add ADR 038 to the manifest first** (the failing test). In `tests/test_documentation.py`, after the `035` line:

```python
            "docs/adr/038-reviewed-models-may-precede-their-models-dev-source-row.md",
```

Run `uv run python -m unittest tests.test_documentation 2>&1 | tail -4`. Expected: FAIL — ADR 038 is not link-reachable from `AGENTS.md` yet.

- [ ] **Step 2: `docs/MODELS.md`.**
  - `:17` last sentence becomes: "When a reviewed record has the same `source_id`, the UI overlays that reviewed record on the source row instead of showing a duplicate. A reviewed record whose `source_id` is `null` was reviewed before models.dev listed the release; it overlays a source row with the same `id` once one appears."
  - `:52` "combines … by `source_id`" gains "(or by `id` for a record with no `source_id` yet)".
  - In "Release identity", change the opening "A models.dev ID names a reviewable release only when…" to "A release is reviewable only when it has a fixed identity of its own, whether or not models.dev lists it:". The bullets stay.
  - After "Review workflow" and before "Distribution-mode conventions", add:

```markdown
### Releases models.dev does not list

models.dev has gaps; a gap upstream is not a reason to leave a release out (ADR 038 {link to `adr/038-reviewed-models-may-precede-their-models-dev-source-row.md`}). When the pinned snapshot and the upstream `dev` branch both lack a release that passes the eligibility and release-identity rules above:

```bash
uv run python scripts/promote_model_candidate.py init-gap PROVIDER/MODEL --output model-review.json
uv run python scripts/promote_model_candidate.py check model-review.json
uv run python scripts/promote_model_candidate.py apply model-review.json
```

`PROVIDER/MODEL` is the ID you expect models.dev to use; the record `id` is derived from it and never changes afterwards. `init-gap` refuses an ID that is already in the snapshot, the queue, or the dispositions. The draft has `source_id: null` and an empty `source_metadata` block: fill every field from the developer's first-party documentation, leave unknown values `null`, and date the work with `metadata_verified_at`. That block is Atlas material, not models.dev data. The review is otherwise identical, except that no pinned models.dev evidence URL exists to cite. `apply` does not touch the queue.

When models.dev later lists the release, the weekly refresh queues the row as usual and `validate_directory.py` prints `link pending: <model id> <- <source id>`. Until it is linked, the reviewed card stands in for the row. Link it:

```bash
uv run python scripts/promote_model_candidate.py link MODEL_ID PROVIDER/MODEL --metadata-verified-at YYYY-MM-DD --dry-run
uv run python scripts/promote_model_candidate.py link MODEL_ID PROVIDER/MODEL --metadata-verified-at YYYY-MM-DD
```

`link` prints each difference between the hand-authored and the models.dev metadata, adopts the models.dev copy, adds the pinned evidence URL, and removes the candidate. It changes no prose, classification, license, score, or `verified_at`; if a difference touches a score rationale or the boundary, re-review the record in the same change.

If models.dev used a different ID than expected, the row shows as an ordinary imported card and produces no `link pending` line. Link it the same way; the record keeps its `id`. If upstream later also adds the ID you first expected, validation reports an id collision: set `source_id` to `null`, run the importer, link to the row whose stable ID matches the record `id`, and exclude the other row as the exact snapshot the reviewed record represents. If upstream deletes a linked row, validation fails; set `source_id` to `null` and re-attest the metadata rather than deleting the review.

Holds and exclusions still require a snapshot `source_id`, so a release models.dev does not list cannot be dispositioned; see `BACKLOG.md`.
```

  - Attribution paragraph: append "`source_metadata` on a record with `source_id: null` is hand-authored Atlas material under `LICENSE-DATA`, not models.dev data."
  - Last line: add ", and ADR 038 {link to `adr/038-reviewed-models-may-precede-their-models-dev-source-row.md`} for releases models.dev does not list".

- [ ] **Step 3: `docs/DATA_MODEL.md`** (`:214-230`). State: `source_id` is a models.dev ID present in the snapshot, or `null`; with `null`, `id` must be a stable slug, `source_metadata.modalities.output` must contain `text`, and `source_metadata` is authored by Atlas with `metadata_verified_at` attesting it; with a string, `source_metadata` is the models.dev copy taken at promotion or linking. Add to the validation sentence at `:222`: rejects a non-null `source_id` absent from the snapshot and a snapshot row whose `id` equals a differently linked record's `id`. At `:228-230` replace "overlays a reviewed `models.json` record with the same `source_id`" with the two-part rule. Link ADR 038.

- [ ] **Step 4: `docs/WEB.md`.** `:31` and `:89`: overlay rule; document `unlisted_reviewed_count` next to `reviewed_count`. In the browser verification matrix add one row: "Models: a reviewed model with `source_id: null` shows 'Not yet listed on models.dev' on the card and in the dialog, credits its metadata to Atlas, and is counted in the kicker."

- [ ] **Step 5: `docs/OPERATIONS.md`.** In the weekly-refresh review notes (near `:569`), add: "A `link pending:` line in the validator output means models.dev now lists a release Atlas reviewed earlier; run the `link` command in `MODELS.md`." Near `:435-441` mention `init-gap` as the second entry path.

- [ ] **Step 6: ADR pointers.** Add one line directly under the `- Date:` line of ADRs 025, 026, 027:

```markdown
- Amended by: ADR 038 {link to `038-reviewed-models-may-precede-their-models-dev-source-row.md`} (a reviewed model may have no models.dev row yet)
```

Do not edit their Context, Decision, or Consequences.

- [ ] **Step 7: `AGENTS.md` rule 11.** Append: " A reviewed model may exist before models.dev lists it (`source_id: null`, ADR 038); its metadata is then Atlas-authored, never attributed to models.dev."

- [ ] **Step 8: Agent docs.** `skills/ai-systems-atlas/reference.md` after the field list at `:51`: "`source_id` is `null` when Atlas reviewed the release before models.dev listed it; `source_metadata` is then authored by Atlas from developer documentation rather than imported." Adjust `:53` so "imported from the pinned models.dev snapshot" is conditional on a non-null `source_id`. Apply the same one-sentence condition at `web/llms.txt:18`. Check `docs/AGENT_DOCS.md` for whether either file is generated; if a generator owns it, edit the generator input instead.

- [ ] **Step 9: `BACKLOG.md`.** Add two open items in the Models section, and end the Harvey Tenet entry (`:101`) with "See the dispositions item below.":

```markdown
- [ ] Curate Claude Mythos 5.1 as the first model reviewed without a models.dev row (ADR 038 {link to `docs/adr/038-reviewed-models-may-precede-their-models-dev-source-row.md`}): `init-gap anthropic/claude-mythos-5-1`, first-party evidence only, separate change from the mechanism.
- [ ] Decide how to hold or exclude a release models.dev does not list. `model-dispositions.json` is keyed by snapshot `source_id`, so such a release can be reviewed (ADR 038) but not dispositioned.
```

- [ ] **Step 10: Run.**

```bash
uv run python -m unittest tests.test_documentation 2>&1 | tail -3
node scripts/build_asset_version.mjs   # llms.txt lives under web/
```

Expected: `OK`.

- [ ] **Step 11: Commit.**

```bash
git add AGENTS.md BACKLOG.md docs skills web tests/test_documentation.py
git commit -m "Document reviewed models that precede their models.dev row"
```

---

### Task 9: Full verification

- [ ] **Step 1: Freshness and the whole suite.**

```bash
export PATH=/usr/local/bin:$PATH
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py --check
uv run python scripts/build_share_pages.py
node scripts/build_asset_version.mjs
git status --short            # expected: clean; any diff means a generated file was stale, commit it
pre-commit run --all-files 2>&1 | tail -30
```

Expected: every hook `Passed`, including browser end-to-end tests.

- [ ] **Step 2: Browser matrix with a temporary record.** Create a throwaway gap review from a real record so the catalog is only changed locally:

```bash
uv run python scripts/promote_model_candidate.py init-gap acme/atlas-fixture --output "$TMPDIR/fixture.json"
```

Fill the draft by copying every human-owned field and `source_metadata` from `model-anthropic-claude-mythos-5` in `directory/models.json` (keep `id`, `source_id: null`; drop its models.dev evidence entry), then `check`, `apply`, run the four regeneration commands, serve with `uv run python -m http.server 8765 --bind 127.0.0.1 --directory web`, and walk the Models rows of the `docs/WEB.md` matrix: filters, score sort, comparison with another model, URL restore of `#models` with the dialog open, Finder search for "Atlas Fixture", the share page at `records/models/model-acme-atlas-fixture/`. Confirm the kicker ends with `· 1 not yet on models.dev` and that the string `null` appears nowhere.

- [ ] **Step 3: Discard the fixture.**

```bash
git checkout -- directory web && git clean -fd web/records/models/model-acme-atlas-fixture web/app/detail/model
git status --short   # expected: clean
```

Look at what `git clean` will remove with `-n` first.

- [ ] **Step 4: Report** the checks actually run and their results, then open the pull request. Merge `main` immediately before opening it.

## Spec coverage

| Spec section | Task |
|---|---|
| 1 nullable `source_id`, slug id, text output (already enforced; pinned) | 1 |
| 1 non-null must exist in snapshot; link pending | 2 |
| 2 overlay rule, `unlisted_reviewed_count`, id-collision rejection | 3, 2 |
| 3 importer unchanged | 4 |
| 4 `init-gap`, null `check`/`apply` | 5 |
| 4 `link`, `--dry-run` | 6 |
| 5 UI | 7 |
| 6 tests | each task |
| 7 documentation, backlog | 8 |
| Verification | 9 |
