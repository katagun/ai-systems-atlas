# Reviewed Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give reviewed models an optional `flags` field that records a developer's own risk-threshold statement (`maker_risk_safeguards`) in three states, validate it, keep its evidence current, and show it on cards, in the legend, in Taxonomy, in the model dialog, and on share pages, without ever issuing an Atlas risk verdict.

**Architecture:** Five new taxonomy vocabularies define the flag; `scripts/validate_directory.py` enforces the two exact entry shapes; the evidence checker drift-hashes flag pages through the existing `web_terms` machinery, with the reviewer's `content_sha256` as the pinned baseline; the boot payload projects each entry down to what the emblem needs (`kind` and `status`, plus a found statement's `tier_term`, `domains`, `determination`, and `scope`); `web/app-core.js` holds every sentence as a pure function, and `web/app.js` and `scripts/build_share_pages.py` render it. No real record gains a flag in this plan; every test uses fixtures.

**Tech Stack:** Python 3.11 (`uv`, `unittest`), dependency-free browser JavaScript (`node --test`), Playwright, static JSON under `directory/` and `web/`.

**Spec:** `docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md` (owner-approved; every decision in it is binding).

**Base:** Written against `origin/main` at `ac74c8f` (which includes #286 card emblems and #289 GitHub stars on card footers) **plus** the model-distribution-badges PR (branch `claude/model-distribution-badges`), which adds `CARD_BADGE_SETS.model`, `cardBadgeSetKey`'s reviewed-model gate, the `badgeLegend("models")` branch, the Models legend in `syncBadgeLegend`, and `badgeRow(AtlasCore.cardBadges("model", …))` on both reviewed-model card renderers. That PR merges before this plan executes. Before Task 1, confirm it is on `main`: `grep -n 'model: \["downloadable-weights"' web/app-core.js` must print one line. If it does not, stop and wait for it.

## Global Constraints

- Node 22 is at `/usr/local/bin/node`; the default node is v16 and silently mis-hashes the asset stamp. Every `node` command below uses `/usr/local/bin/node`.
- Playwright runs as `PATH=/usr/local/bin:$PATH npx playwright test`.
- Colours only from tokens or `color-mix()` of tokens, and radii only from radius tokens; `tests/test_web.js` enforces both.
- The regeneration sequence, in order: `uv run python scripts/sync_web_data.py`, `uv run python scripts/build_web_payload.py`, `uv run python scripts/build_share_pages.py`, `/usr/local/bin/node scripts/build_asset_version.mjs`, `uv run python scripts/build_blog.py`. Never hand-edit generated files (`web/*.json` copies, `web/app/`, `web/records/`, `web/sitemap.xml`, `web/robots.txt`, `web/blog/`, the `?v=` and `data-versions` stamps in `web/index.html`).
- `pre-commit run --all-files` is the gate. It takes minutes, and commits run it too; never use `--no-verify`. Give every `git commit` a timeout of at least 15 minutes and confirm with `git log -1` that it landed; a formatter hook can abort the first attempt, in which case re-add and commit again.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never solve a Playwright click interception with `pointer-events: none`.
- User-facing copy is plain language. No card, tooltip, dialog, share page, legend, or Taxonomy string uses "high risk", "dangerous", or any other Atlas word for a statement's result; the Atlas only quotes and classifies in the developer's own terms (ADR 039).
- No real record in `directory/` gains a `flags` field in this plan. The backfill is a separate change.
- Python tests run with `uv run python -m unittest <module>.<Class>.<test> -v`; the JS logic suite with `/usr/local/bin/node --test tests/test_web.js`.
- Complexity ratchets: ruff C901 max 50 (Python) and eslint `complexity` max 40 (JS). New logic goes in small helper functions, never inline in `check_targets` or `validate_models`.

## File map

| File | Responsibility in this plan |
|---|---|
| `directory/taxonomy.json` | `flag_kinds` (with `collections`), `flag_statuses`, `flag_domains`, `flag_determinations`, `flag_scopes` |
| `scripts/validate_directory.py` | taxonomy groups, `validate_flag_kinds`, `publisher_site`, `validate_model_flags`, models.dev rows refuse flags |
| `scripts/promote_model_candidate.py` | `init` scaffolds a blank flag; `check`/`apply` refuse a review without one |
| `scripts/check_evidence_links.py` | flag targets, pinned baselines, flag drift wording, `--pin` |
| `scripts/report_review_age.py` | docstring only; the generic walk already reads flag dates |
| `scripts/build_web_payload.py` | `BOOT_ITEM_FIELDS` projection |
| `web/app-core.js` | `flags` family, `REVIEWED_FLAGS`, `cardFlags`, `flagEmblemText`, `riskStatementView`, legend and emblem changes |
| `web/app.js` | flag emblem in badge rows, dialog section, Taxonomy groups |
| `web/styles.css` | `[data-family="flags"]` colour, dialog quote style |
| `scripts/build_share_pages.py` | "Risk statements" section on reviewed-model share pages |
| Docs | `docs/DATA_MODEL.md` (T1), `docs/MODELS.md` (T2), `docs/OPERATIONS.md` (T3), `docs/WEB.md` (T4, T7), `AGENTS.md`, `skills/ai-systems-atlas/reference.md`, `BACKLOG.md`, ADR 039 status (T8) |

## Fixture vocabulary used across tasks

Every test that needs a flag uses these two entries, adapted per language. They quote no real developer.

- Found: `kind "maker_risk_safeguards"`, `status "statement_found"`, `tier_term "Fixture Level 3"`, `domains ["cyber", "bio_chem"]`, `determination "precautionary"`, `scope "weights"`, `statement` a fixture sentence, `url` a fixture URL, `content_sha256 "a" * 64`, `verified_at "2026-09-01"`, `research_confidence "high"`.
- None: `kind "maker_risk_safeguards"`, `status "no_statement_found"`, `url` a fixture URL, `verified_at "2026-09-01"`, `research_confidence "medium"`.

The exact reader-facing sentences, identical in JS and Python:

- Disclaimer: `This is the developer's own statement, not an Atlas risk rating.`
- No statement: `The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.`
- Not examined: `Not yet examined.`
- Determined: `{developer} states that this release reached “{tier_term}” in {domains} capability. The statement covers {scope}. {disclaimer}`
- Precautionary: `{developer} names this release against “{tier_term}” in {domains} capability, as a precaution. The statement covers {scope}. {disclaimer}`

`{domains}` is the lower-cased taxonomy names joined as `a`, `a and b`, or `a, b, and c`. `{scope}` is the lower-cased first letter of the scope's taxonomy name ("the model itself", "safeguards on a release channel").

---

### Task 1: Flag vocabularies and validation

**Files:**
- Modify: `directory/taxonomy.json` (insert after the `model_distribution_modes` group)
- Modify: `scripts/validate_directory.py` (imports; constants after `MODEL_REVIEW_REQUIRED`; `TAXONOMY_GROUPS`; `Taxonomy`; `validate_taxonomy`; new functions before `validate_models`; `validate_models`; `validate_models_dev`)
- Modify: `docs/DATA_MODEL.md` ("Model record")
- Test: `tests/test_validation_policy.py`
- Generated: `web/taxonomy.json` and everything the regeneration sequence rewrites

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `MAKER_RISK_FLAG: str = "maker_risk_safeguards"` in `scripts/validate_directory.py` (Task 2 imports it).
  - `FLAG_SHAPES: dict[str, tuple[frozenset[str], ...]]` keyed by status.
  - `publisher_site(url: object) -> str | None`.
  - `validate_model_flags(model: dict, prefix: str, tax: Taxonomy, errors: list[str]) -> None`.
  - `Taxonomy.flag_collections: dict[str, set[str]]` (kind id → allowed collection names).
  - Taxonomy groups `flag_kinds`, `flag_statuses`, `flag_domains`, `flag_determinations`, `flag_scopes`, each a list of `{id, name, definition}`; `flag_kinds` items also carry `collections`. Tasks 5–7 read the `name` values: domains `Cyber`, `Biological or chemical`, `Autonomy`; determinations `Threshold reached`, `Precautionary`; scopes `The model itself`, `Safeguards on a release channel`; kind `Maker risk statement`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_validation_policy.py`, inside `ValidationPolicyTests`, after `test_trust_closure_carries_a_dated_first_party_source`:

```python
    # ADR 039: a reviewed flag records a developer's own risk-threshold statement.
    # The fixture points the first reviewed model at a lab site it cites, so the
    # first-party rule has something to check against.
    FLAG_SITE_URL: ClassVar[str] = "https://www.example-lab.com/models/alpha"
    FLAG_HF_URL: ClassVar[str] = "https://huggingface.co/example-lab/alpha"
    SAMPLE_FLAG_FOUND: ClassVar[dict] = {
        "kind": "maker_risk_safeguards",
        "status": "statement_found",
        "tier_term": "Fixture Level 3",
        "domains": ["cyber", "bio_chem"],
        "determination": "precautionary",
        "scope": "weights",
        "statement": "A fixture sentence standing in for a developer's verbatim words.",
        "url": "https://www.example-lab.com/safety/system-card",
        "content_sha256": "a" * 64,
        "verified_at": "2026-09-01",
        "research_confidence": "high",
    }
    SAMPLE_FLAG_NONE: ClassVar[dict] = {
        "kind": "maker_risk_safeguards",
        "status": "no_statement_found",
        "url": "https://www.example-lab.com/safety",
        "verified_at": "2026-09-01",
        "research_confidence": "medium",
    }

    def catalog_with_flags(self, flags, mutate_taxonomy=None) -> list[str]:
        """Validate the real catalog with the first reviewed model carrying `flags`."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "models.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        model = document["models"][0]
        model["url"] = self.FLAG_SITE_URL
        model["evidence"].append(
            {
                "kind": "web",
                "label": "Fixture weights page",
                "url": self.FLAG_HF_URL,
                "verified_at": model["verified_at"],
            }
        )
        model["verified_at"] = max(model["verified_at"], "2026-09-01")
        model["flags"] = json.loads(json.dumps(flags))
        self.write_json(path, document)
        self.write_json(root / "web" / "models.json", document)
        if mutate_taxonomy is not None:
            taxonomy_path = root / "directory" / "taxonomy.json"
            taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
            mutate_taxonomy(taxonomy)
            self.write_json(taxonomy_path, taxonomy)
            self.write_json(root / "web" / "taxonomy.json", taxonomy)
        return validate(root)

    def flag_errors(self, flags, mutate_taxonomy=None) -> list[str]:
        return [
            error
            for error in self.catalog_with_flags(flags, mutate_taxonomy)
            if "flag" in error
        ]

    def found(self, **changes) -> dict:
        entry = json.loads(json.dumps(self.SAMPLE_FLAG_FOUND))
        entry.update(changes)
        return entry

    def test_each_valid_flag_shape_passes_validation(self) -> None:
        unpinnable = self.found(unpinnable=True)
        del unpinnable["content_sha256"]
        for flags in ([self.found()], [unpinnable], [dict(self.SAMPLE_FLAG_NONE)]):
            with self.subTest(status=flags[0]["status"]):
                self.assertEqual([], self.catalog_with_flags(flags))

    def test_flag_shapes_are_exact(self) -> None:
        both = self.found(unpinnable=True)
        extra_none = dict(self.SAMPLE_FLAG_NONE, tier_term="Fixture Level 3")
        for label, entry in (
            ("extra field", self.found(note="Atlas prose")),
            ("hash and unpinnable", both),
            ("none with a found field", extra_none),
        ):
            with self.subTest(label):
                errors = self.flag_errors([entry])
                self.assertTrue(
                    any("fields differ from the" in error for error in errors), errors
                )

    def test_unpinnable_must_be_true(self) -> None:
        entry = self.found(unpinnable=False)
        del entry["content_sha256"]
        self.assertTrue(
            any("unpinnable must be true" in e for e in self.flag_errors([entry]))
        )

    def test_flag_values_come_from_the_taxonomy(self) -> None:
        for field, value, needle in (
            ("status", "clean", "unknown flag status 'clean'"),
            ("domains", ["weapons"], "unknown domains ['weapons']"),
            ("domains", [], "domains must be a non-empty list"),
            ("determination", "likely", "unknown determination 'likely'"),
            ("scope", "family", "unknown scope 'family'"),
            ("research_confidence", "certain", "unknown research_confidence"),
            ("content_sha256", "abc", "content_sha256 must be"),
            ("tier_term", " ", "tier_term must be a non-empty string"),
            ("kind", "atlas_risk_rating", "unknown flag kind 'atlas_risk_rating'"),
        ):
            with self.subTest(field=field):
                errors = self.flag_errors([self.found(**{field: value})])
                self.assertTrue(any(needle in e for e in errors), errors)

    def test_flag_url_must_be_on_a_site_the_record_cites(self) -> None:
        for url, accepted in (
            ("https://assets.example-lab.com/card.pdf", True),
            ("https://huggingface.co/example-lab/alpha/blob/main/README.md", True),
            ("https://huggingface.co/other-org/alpha", False),
            ("https://example.org/review-of-alpha", False),
            ("https://github.com/anomalyco/models.dev/blob/x/models/a.toml", False),
            ("http://www.example-lab.com/safety", False),
        ):
            with self.subTest(url=url):
                errors = self.flag_errors([self.found(url=url)])
                self.assertEqual(
                    accepted,
                    not any("first-party page" in e for e in errors),
                    errors,
                )

    def test_flag_cannot_postdate_its_record(self) -> None:
        errors = self.flag_errors([self.found(verified_at="2099-01-01")])
        self.assertTrue(
            any("verified_at must not be after the record verified_at" in e for e in errors),
            errors,
        )

    def test_one_entry_per_kind_and_a_non_empty_list(self) -> None:
        self.assertTrue(
            any(
                "maker_risk_safeguards appears more than once" in e
                for e in self.flag_errors([self.found(), dict(self.SAMPLE_FLAG_NONE)])
            )
        )
        self.assertTrue(
            any("flags must be a non-empty list" in e for e in self.flag_errors([]))
        )

    def test_a_kind_appears_only_in_its_allowed_collections(self) -> None:
        def packs_only(taxonomy: dict) -> None:
            taxonomy["flag_kinds"][0]["collections"] = ["packs"]

        errors = self.flag_errors([self.found()], packs_only)
        self.assertTrue(
            any("is not allowed on reviewed models" in e for e in errors), errors
        )

    def test_flag_kinds_name_known_collections(self) -> None:
        def unknown(taxonomy: dict) -> None:
            taxonomy["flag_kinds"][0]["collections"] = ["robots"]

        errors = self.catalog_with_flags([], unknown)
        self.assertTrue(
            any("names unknown collections ['robots']" in e for e in errors), errors
        )

    def test_imported_models_dev_rows_never_carry_flags(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "models-dev.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["models"][0]["flags"] = [dict(self.SAMPLE_FLAG_NONE)]
        self.write_json(path, document)
        self.write_json(root / "web" / "models-dev.json", document)
        errors = validate(root)
        self.assertTrue(
            any("never carries a flag" in error for error in errors), errors
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy -k flag -v`
Expected: FAIL. `test_each_valid_flag_shape_passes_validation` reports `fields differ from schema … extra=['flags']`; the others fail their `assertTrue` because no flag error text exists yet.

- [ ] **Step 3: Add the vocabularies to `directory/taxonomy.json`**

Insert this block immediately after the closing `],` of `"model_distribution_modes"` (before `"inference_service_types"`), keeping the file's two-space indentation:

```json
  "flag_kinds": [
    {
      "id": "maker_risk_safeguards",
      "name": "Maker risk statement",
      "definition": "The developer's own system card, model page, or safety framework names this release against a risk threshold in cyber, biological or chemical, or autonomy capability. The Atlas records the developer's words and adds no rating of its own.",
      "collections": [
        "models"
      ]
    }
  ],
  "flag_statuses": [
    {
      "id": "statement_found",
      "name": "Statement found",
      "definition": "The developer's own system card, model page, or safety framework names this release against a risk threshold."
    },
    {
      "id": "no_statement_found",
      "name": "No statement found",
      "definition": "A reviewer checked the developer's system card, model page, and framework page for this release, and none names it against a threshold. Absence is not evidence of safety."
    }
  ],
  "flag_domains": [
    {
      "id": "cyber",
      "name": "Cyber",
      "definition": "The statement concerns cyber capability, such as finding or exploiting software vulnerabilities."
    },
    {
      "id": "bio_chem",
      "name": "Biological or chemical",
      "definition": "The statement concerns biological or chemical capability, such as help toward making biological or chemical weapons."
    },
    {
      "id": "autonomy",
      "name": "Autonomy",
      "definition": "The statement concerns autonomy, such as acting, copying itself, or doing AI research without human direction."
    }
  ],
  "flag_determinations": [
    {
      "id": "determined",
      "name": "Threshold reached",
      "definition": "The developer states the release reached the threshold."
    },
    {
      "id": "precautionary",
      "name": "Precautionary",
      "definition": "The developer states it could not rule the threshold out, or deployed safeguards as a precaution."
    }
  ],
  "flag_scopes": [
    {
      "id": "weights",
      "name": "The model itself",
      "definition": "The statement is about the model, whichever way it is offered."
    },
    {
      "id": "deployment",
      "name": "Safeguards on a release channel",
      "definition": "The statement is about safeguards the developer runs on one way of offering the release, such as its own app or API."
    }
  ],
```

- [ ] **Step 4: Implement validation in `scripts/validate_directory.py`**

4a. Add `import urllib.parse` to the standard-library imports (after `import re`).

4b. Append the five group names to `TAXONOMY_GROUPS`, directly after `"model_distribution_modes",`:

```python
    "flag_kinds",
    "flag_statuses",
    "flag_domains",
    "flag_determinations",
    "flag_scopes",
```

4c. After the `MODEL_REVIEW_REQUIRED` set, add:

```python
MODEL_OPTIONAL = {"flags"}

# ADR 039: a reviewed flag records one kind of first-party statement, in the
# steward's own words. Each status has exactly one shape; a found statement on a
# page that cannot be pinned carries "unpinnable": true in place of the hash.
MAKER_RISK_FLAG = "maker_risk_safeguards"
FLAG_FOUND_FIELDS = frozenset(
    {
        "kind",
        "status",
        "tier_term",
        "domains",
        "determination",
        "scope",
        "statement",
        "url",
        "content_sha256",
        "verified_at",
        "research_confidence",
    }
)
FLAG_FOUND_UNPINNABLE_FIELDS = (FLAG_FOUND_FIELDS - {"content_sha256"}) | {"unpinnable"}
FLAG_NONE_FIELDS = frozenset(
    {"kind", "status", "url", "verified_at", "research_confidence"}
)
FLAG_SHAPES = {
    "statement_found": (FLAG_FOUND_FIELDS, FLAG_FOUND_UNPINNABLE_FIELDS),
    "no_statement_found": (FLAG_NONE_FIELDS,),
}
# Collection names a flag kind may list. Only models accept a `flags` field today;
# a kind for another collection needs its own ADR and its own schema change.
FLAG_COLLECTION_NAMES = frozenset(
    {
        "projects",
        "specifications",
        "inference-services",
        "local-runtimes",
        "models",
        "packs",
    }
)
# Hosts shared by many publishers: a site there is the host plus its first path
# segment (the owner), so huggingface.co/other-org is not huggingface.co/acme.
SHARED_PUBLISHER_HOSTS = frozenset(
    {"github.com", "raw.githubusercontent.com", "huggingface.co", "storage.googleapis.com"}
)
# Second-level labels under a two-letter country code (example.co.uk, example.com.cn).
SECOND_LEVEL_LABELS = frozenset({"ac", "co", "com", "edu", "gov", "net", "org"})
```

4d. Add a field to `Taxonomy` after `model_dimensions`:

```python
    flag_collections: dict[str, set[str]]
```

4e. In `validate_taxonomy`, before `return Taxonomy(`, add `flag_collections = validate_flag_kinds(taxonomy, enum_ids, errors)` and pass `flag_collections=flag_collections,` as the last keyword to `Taxonomy(...)`. Add this function directly above `validate_taxonomy`:

```python
def validate_flag_kinds(
    taxonomy: dict[str, Any], enum_ids: dict[str, set[str]], errors: list[str]
) -> dict[str, set[str]]:
    """Each flag kind names the collections it may appear in (ADR 039)."""
    if enum_ids["flag_statuses"] != set(FLAG_SHAPES):
        errors.append(f"taxonomy: flag_statuses must be exactly {sorted(FLAG_SHAPES)}")
    items = taxonomy.get("flag_kinds")
    allowed: dict[str, set[str]] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        collections = item.get("collections")
        if (
            not isinstance(collections, list)
            or not collections
            or not all(isinstance(name, str) for name in collections)
        ):
            errors.append(
                f"taxonomy: flag kind {item['id']!r} requires a non-empty collections list"
            )
            continue
        if unknown := set(collections) - FLAG_COLLECTION_NAMES:
            errors.append(
                f"taxonomy: flag kind {item['id']!r} names unknown collections {sorted(unknown)}"
            )
        allowed[item["id"]] = set(collections)
    return allowed
```

4f. Add these functions directly above `def stable_model_id`:

```python
def publisher_site(url: object) -> str | None:
    """The site a URL belongs to, for the first-party check on reviewed flags.

    A host minus a leading www., reduced to its registrable part, or host/owner on a
    host many publishers share. None for anything that is not a public HTTPS URL.
    """
    host = https_url_host(url)
    if host is None:
        return None
    host = host.removeprefix("www.")
    if host in SHARED_PUBLISHER_HOSTS:
        owner = urllib.parse.urlsplit(str(url)).path.strip("/").split("/", 1)[0]
        return f"{host}/{owner.lower()}" if owner else None
    labels = host.split(".")
    keep = (
        3
        if len(labels) >= 3
        and len(labels[-1]) == 2
        and labels[-2] in SECOND_LEVEL_LABELS
        else 2
    )
    return ".".join(labels[-keep:])


def record_publisher_sites(model: dict[str, Any]) -> set[str]:
    """Sites a reviewed model already cites: its url, evidence, and license evidence.

    The models.dev repository is never one: it is attributed source metadata, and
    models.dev text never establishes a flag (ADR 039, AGENTS.md rule 11).
    """
    urls: list[object] = [model.get("url")]
    for field in ("evidence", "license_evidence"):
        items = model.get(field)
        if isinstance(items, list):
            urls += [item.get("url") for item in items if isinstance(item, dict)]
    models_dev = publisher_site(MODELS_DEV_REPO)
    return {
        site
        for url in urls
        if (site := publisher_site(url)) is not None and site != models_dev
    }


def validate_found_statement(
    entry: dict[str, Any], prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """The developer's term, domains, determination, scope, quote, and pin."""
    for field in ("tier_term", "statement"):
        if not isinstance(entry[field], str) or not entry[field].strip():
            errors.append(f"{prefix}: {field} must be a non-empty string")
    validate_string_list(entry, "domains", tax.enum_ids["flag_domains"], prefix, errors)
    if entry["determination"] not in tax.enum_ids["flag_determinations"]:
        errors.append(f"{prefix}: unknown determination {entry['determination']!r}")
    if entry["scope"] not in tax.enum_ids["flag_scopes"]:
        errors.append(f"{prefix}: unknown scope {entry['scope']!r}")
    if "unpinnable" in entry:
        if entry["unpinnable"] is not True:
            errors.append(
                f"{prefix}: unpinnable must be true; cite content_sha256 when the page pins"
            )
    elif not isinstance(entry["content_sha256"], str) or not CONTENT_SHA_PATTERN.fullmatch(
        entry["content_sha256"]
    ):
        errors.append(f"{prefix}: content_sha256 must be a 64-character lowercase hex digest")


def validate_model_flag(
    entry: Any,
    prefix: str,
    record_verified_at: object,
    sites: set[str],
    tax: Taxonomy,
    errors: list[str],
) -> str | None:
    """One flag entry in one of its exact shapes. Returns its kind for the duplicate check."""
    if not isinstance(entry, dict):
        errors.append(f"{prefix}: must be an object")
        return None
    kind = entry.get("kind")
    if kind not in tax.flag_collections:
        errors.append(f"{prefix}: unknown flag kind {kind!r}")
    elif "models" not in tax.flag_collections[kind]:
        errors.append(f"{prefix}: flag kind {kind} is not allowed on reviewed models")
    status = entry.get("status")
    shapes = FLAG_SHAPES.get(status)
    if shapes is None:
        errors.append(f"{prefix}: unknown flag status {status!r}")
        return kind
    if not any(set(entry) == shape for shape in shapes):
        errors.append(
            f"{prefix}: fields differ from the {status} shape: expected exactly "
            f"{sorted(shapes[0])}"
            + (", with unpinnable: true in place of content_sha256" if len(shapes) > 1 else "")
        )
        return kind
    if publisher_site(entry["url"]) not in sites:
        errors.append(
            f"{prefix}: url must be a first-party page on a site the record already "
            "cites in its url, evidence, or license evidence"
        )
    if entry["research_confidence"] not in tax.enum_ids["research_confidence_levels"]:
        errors.append(f"{prefix}: unknown research_confidence")
    if not valid_date(entry["verified_at"]):
        errors.append(f"{prefix}: verified_at must be an ISO date")
    elif valid_date(record_verified_at) and entry["verified_at"] > record_verified_at:
        errors.append(f"{prefix}: verified_at must not be after the record verified_at")
    if status == "statement_found":
        validate_found_statement(entry, prefix, tax, errors)
    return kind


def validate_model_flags(
    model: dict[str, Any], prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """A reviewed model's flags: a maker's own statement, never an Atlas verdict (ADR 039).

    The field is omitted until a reviewer examines the record, which is the third
    state, "not examined". An empty list would claim an examination that says nothing.
    """
    flags = model["flags"]
    if not isinstance(flags, list) or not flags:
        errors.append(
            f"{prefix}: flags must be a non-empty list; omit the field until the record is examined"
        )
        return
    sites = record_publisher_sites(model)
    seen: set[str] = set()
    for index, entry in enumerate(flags):
        kind = validate_model_flag(
            entry, f"{prefix}: flag {index}", model.get("verified_at"), sites, tax, errors
        )
        if isinstance(kind, str) and kind in seen:
            errors.append(f"{prefix}: flag kind {kind} appears more than once")
        elif isinstance(kind, str):
            seen.add(kind)
```

4g. In `validate_models`, replace the schema check

```python
        if set(model) != MODEL_REQUIRED:
            errors.append(
                f"{prefix}: fields differ from schema: "
                f"missing={sorted(MODEL_REQUIRED - set(model))}, "
                f"extra={sorted(set(model) - MODEL_REQUIRED)}"
            )
            continue
```

with

```python
        if not MODEL_REQUIRED <= set(model) <= MODEL_REQUIRED | MODEL_OPTIONAL:
            errors.append(
                f"{prefix}: fields differ from schema: "
                f"missing={sorted(MODEL_REQUIRED - set(model))}, "
                f"extra={sorted(set(model) - MODEL_REQUIRED - MODEL_OPTIONAL)}"
            )
            continue
```

and, immediately before the final `for field in ("metadata_verified_at", "verified_at"):` loop, add:

```python
        if "flags" in model:
            validate_model_flags(model, prefix, tax, errors)
```

4h. In `validate_models_dev`, inside `for record in records:` directly after the `prefix = …` line, add:

```python
        if isinstance(record, dict) and "flags" in record:
            errors.append(
                f"{prefix}: an imported models.dev row carries no Atlas conclusion "
                "and never carries a flag (ADR 039)"
            )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_validation_policy -v`
Expected: PASS, including every existing test.

Run: `uv run python scripts/validate_directory.py`
Expected: exits 0 (the real catalog has no flags; `directory/taxonomy.json` differs from `web/taxonomy.json` until Step 7, so if it reports the published copy as stale, continue to Step 7 and rerun).

- [ ] **Step 6: Document the field in `docs/DATA_MODEL.md`**

In "## Model record", insert this bullet after the "**Evidence and review:**" bullet:

```markdown
- **Reviewed flags (optional):** `flags` is absent until a reviewer examines the record, and "not examined" is a state the app states rather than an absence it hides. When present it is a non-empty list with at most one entry per kind, and each `kind` comes from `flag_kinds` in `taxonomy.json`, which also names the collections a kind may appear in; `maker_risk_safeguards` is allowed on reviewed models only, and imported models.dev rows never carry a flag. A `statement_found` entry has exactly `kind`, `status`, `tier_term` (the developer's own term, verbatim), `domains` (from `flag_domains`), `determination` (from `flag_determinations`), `scope` (from `flag_scopes`), `statement` (quoted verbatim), `url`, `content_sha256`, `verified_at`, and `research_confidence`, except that a page which cannot be pinned carries `"unpinnable": true` in place of `content_sha256`. A `no_statement_found` entry has exactly `kind`, `status`, `url` (the page checked last), `verified_at`, and `research_confidence`. The `url` must sit on a site the record already cites in its `url`, `evidence`, or `license_evidence`, never the models.dev repository, and `verified_at` is on or before the record's. Like a trust status, a flag is exempt from the prose-only rule for operational constraints: it stores the developer's term verbatim rather than an Atlas grade and keeps `determination` and `scope` as separate facts, so what it compresses is only whether a document says something. A flag never affects inclusion, score, rank, sort, the Finder, or comparison; see [ADR 039](adr/039-reviewed-flags-record-a-makers-risk-statement.md).
```

Also change the sentence opening "Strict validation rejects extra fields," in the same section to begin "Strict validation rejects extra fields, flags outside their exact shapes,".

- [ ] **Step 7: Regenerate, verify, and commit**

Run the regeneration sequence:

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
/usr/local/bin/node scripts/build_asset_version.mjs
uv run python scripts/build_blog.py
```

Run: `uv run python scripts/validate_directory.py && uv run python -m unittest tests.test_validation_policy tests.test_directory -v`
Expected: PASS.

Run: `pre-commit run --all-files`
Expected: every hook passes.

```bash
git add directory/taxonomy.json scripts/validate_directory.py tests/test_validation_policy.py docs/DATA_MODEL.md web/
git commit -m "$(cat <<'EOF'
Add reviewed-flag vocabularies and validate flags on reviewed models

ADR 039: flag_kinds, flag_statuses, flag_domains, flag_determinations, and
flag_scopes join the taxonomy; the validator enforces both entry shapes, a
first-party URL, the kind's allowed collections, verified_at ordering, and
refuses flags on imported models.dev rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: New model reviews record a flag

**Files:**
- Modify: `scripts/promote_model_candidate.py` (imports, `build_draft`, `_promotion_specific_errors`)
- Modify: `docs/MODELS.md` ("Review workflow", the `init`/`check` paragraphs, "Line updates")
- Test: `tests/test_promote_model_candidate.py`

**Interfaces:**
- Consumes: `MAKER_RISK_FLAG` from `scripts/validate_directory.py` (Task 1); `validate_models` now accepts `flags`.
- Produces: `build_draft(...)["flags"] == [{"kind": "maker_risk_safeguards", "status": "", "url": "", "verified_at": "", "research_confidence": ""}]`; `preflight_promotion` raises `PromotionError` whose message contains `maker_risk_safeguards` when a record has no examined entry.

ADR 039: "From the day this record is implemented, a new model review or line update records a `maker_risk_safeguards` entry in one of the two examined states." The promotion command enforces it for new reviews; line updates are hand edits, so `docs/MODELS.md` carries the rule for them.

- [ ] **Step 1: Write the failing tests**

In `tests/test_promote_model_candidate.py`, at the end of `setUp` (after `self.queue = queue`), add:

```python
        # ADR 039: a new review records the maker-risk flag in an examined state.
        self.record["flags"] = [
            {
                "kind": "maker_risk_safeguards",
                "status": "no_statement_found",
                "url": self.record["url"],
                "verified_at": self.record["verified_at"],
                "research_confidence": "high",
            }
        ]
```

Add these tests to the class:

```python
    def test_draft_scaffolds_a_blank_maker_risk_flag(self) -> None:
        draft = build_draft(self.candidate, self.queue)

        self.assertEqual(
            [
                {
                    "kind": "maker_risk_safeguards",
                    "status": "",
                    "url": "",
                    "verified_at": "",
                    "research_confidence": "",
                }
            ],
            draft["flags"],
        )

    def test_review_without_a_maker_risk_flag_is_rejected(self) -> None:
        record = deepcopy(self.record)
        del record["flags"]
        with self.assertRaisesRegex(PromotionError, "maker_risk_safeguards"):
            preflight_promotion(self.root, record)

    def test_gap_review_also_needs_the_maker_risk_flag(self) -> None:
        record = self.gap_record()
        record["flags"] = []
        with self.assertRaisesRegex(PromotionError, "maker_risk_safeguards"):
            preflight_promotion(self.root, record)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_promote_model_candidate -v`
Expected: FAIL: `test_draft_scaffolds_a_blank_maker_risk_flag` with `KeyError: 'flags'`; `test_review_without_a_maker_risk_flag_is_rejected` because no error is raised.

- [ ] **Step 3: Implement**

3a. Add `MAKER_RISK_FLAG,` to both `from .validate_directory import (` and `from validate_directory import (` lists, in alphabetical position (before `Taxonomy,`).

3b. In `build_draft`, add this key to the returned dict directly after `"evidence": evidence,`:

```python
        # ADR 039: every new review records the maker-risk flag in an examined
        # state; the blank entry fails validation until the reviewer fills it.
        "flags": [
            {
                "kind": MAKER_RISK_FLAG,
                "status": "",
                "url": "",
                "verified_at": "",
                "research_confidence": "",
            }
        ],
```

3c. In `_promotion_specific_errors`, directly after the `license_review_status` check, add:

```python
    flags = record.get("flags")
    if not isinstance(flags, list) or not any(
        isinstance(entry, dict)
        and entry.get("kind") == MAKER_RISK_FLAG
        and entry.get("status") in {"statement_found", "no_statement_found"}
        for entry in flags
    ):
        errors.append(
            f"flags must record a {MAKER_RISK_FLAG} entry, statement_found or "
            "no_statement_found, before promotion (ADR 039)"
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_promote_model_candidate -v`
Expected: PASS, including every existing test.

- [ ] **Step 5: Amend `docs/MODELS.md`**

5a. In "## Review workflow", replace step 7 with these two steps:

```markdown
7. Record the `maker_risk_safeguards` flag ([ADR 039](adr/039-reviewed-flags-record-a-makers-risk-statement.md)). Check the developer's system card, model page, and safety or framework page for this release. If one names this release against a risk threshold, record `statement_found`: the developer's own term verbatim in `tier_term`, the `domains`, `determination`, and `scope` its words support, the sentence or sentences quoted verbatim in `statement`, and the page pinned with `uv run python scripts/check_evidence_links.py --pin URL`, which prints the `content_sha256` to record or says the page is unpinnable, in which case record `"unpinnable": true` instead. Otherwise record `no_statement_found` with the page checked last, normally the framework or system-card index. Before recording either, confirm that the statement names this release, not the family or a product; that the quote is verbatim from a first-party page; that `determination` and `scope` match the words; and, for `no_statement_found`, that all three pages were checked. A statement about a model family, a product built on the model, or a sibling release goes into prose or onto the product's own system record, never into a flag, and models.dev text never establishes one. Research agents may propose an entry; it is accepted only when the owner merges it.
8. Add dated authoritative evidence, remove the candidate in the same change, synchronize published data, regenerate share pages, and run the full verification suite.
```

5b. In the paragraph beginning "`init` copies only the candidate ID", append: "It also scaffolds one blank `maker_risk_safeguards` flag entry, which fails validation until it is completed in an examined state."

5c. In the paragraph beginning "`check` is read-only.", change "missing authoritative-model or pinned-source evidence," to "missing authoritative-model or pinned-source evidence, a missing examined `maker_risk_safeguards` flag,".

5d. In "### Line updates: re-review in place, never a second record", change "re-verify the license text, distribution paths, and scores against the new snapshot" to "re-verify the license text, distribution paths, flags, and scores against the new snapshot", and append this sentence to the paragraph: "A line update records a `maker_risk_safeguards` entry in an examined state if the record has none yet. When a developer revises or withdraws a statement, update the entry in place with a new `verified_at` and describe the change in the pull request; never remove it silently."

- [ ] **Step 6: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes.

```bash
git add scripts/promote_model_candidate.py tests/test_promote_model_candidate.py docs/MODELS.md
git commit -m "$(cat <<'EOF'
Require a maker-risk flag entry on every new model review

ADR 039: init scaffolds a blank maker_risk_safeguards entry and check and
apply refuse a review without an examined one; MODELS.md adds the review
step and the line-update rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Flag evidence stays current

**Files:**
- Modify: `scripts/check_evidence_links.py` (`_TargetBuilder`, `LinkTarget`, `_add_target`, new `_add_flag_targets`, `collect_targets`, `_missing_baseline_error`, `_terms_drift_error`, new `_first_baseline` and `_matches_pin`, `check_targets`, new `pin_hash` and `_run_pin`, `build_parser`, `main`)
- Modify: `scripts/report_review_age.py` (module docstring)
- Modify: `docs/OPERATIONS.md` ("Review age", "Evidence links and terms drift")
- Test: `tests/test_evidence_links.py`, `tests/test_review_age.py`

**Interfaces:**
- Consumes: the flag entry shapes from Task 1.
- Produces:
  - `LinkTarget.pinned_sha256: tuple[str, ...] = ()` (default keeps every existing constructor call valid).
  - `pin_hash(url: str, fetch: Callable[[LinkTarget], FetchResult]) -> str | None`.
  - CLI `uv run python scripts/check_evidence_links.py --pin URL` printing `content_sha256: <hex>` or a line starting `unpinnable:`.
  - Flag references are named `models:<id>:flags:<index>` and carry kind `flag`.

ADR 039: "Drift fails the evidence check and opens an incident, as terms drift does; the record itself is never edited." The checker records drift in its cache (`terms_drift_detected_at`) and fails with `flag page drift requires review`, which fails the weekly verification and opens or updates the durable `automation-failure` issue, exactly as `web_terms` drift does. It never writes the record: the entry's exact shape has no review field, and AGENTS.md rule 8 forbids automation to change it. An `unpinnable` page is link-checked only, as ADR 037 set.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_evidence_links.py`, after the `cache_of` helper:

```python
FLAG_URL = "https://www.example-lab.com/system-card"
FLAG_BODY = b"<html><main>Fixture statement, version A.</main></html>"


def flag_hash(body: bytes = FLAG_BODY) -> str:
    content = check_evidence_links.terms_content(body, "text/html", FLAG_URL)
    assert content is not None
    return content.sha256


def flag_target(
    *, pinned: tuple[str, ...], reviewed_at: str = "2026-09-01"
) -> check_evidence_links.LinkTarget:
    reference = "models:model-alpha:flags:0"
    return check_evidence_links.LinkTarget(
        url=FLAG_URL,
        kinds=("flag",),
        references=(reference,),
        review_dates=((reference, reviewed_at),),
        monitor_terms=True,
        pinned_sha256=pinned,
    )


class FlagEvidenceTests(unittest.TestCase):
    """ADR 039: flag pages are drift-hashed, with the reviewer's pin as the baseline."""

    def check(self, target, cache, body=FLAG_BODY, **options):
        return check_evidence_links.check_targets(
            [target],
            cache,
            lambda _target, _cached: response(body),
            now=datetime(2026, 9, 5, tzinfo=UTC),
            max_age=timedelta(0),
            **options,
        )

    def test_flags_become_targets_by_status(self) -> None:
        flags = [
            {
                "kind": "maker_risk_safeguards",
                "status": "statement_found",
                "url": "https://example.com/pinned",
                "content_sha256": "b" * 64,
                "verified_at": "2026-09-02",
            },
            {
                "kind": "maker_risk_safeguards",
                "status": "statement_found",
                "url": "https://example.com/unpinnable",
                "unpinnable": True,
                "verified_at": "2026-09-02",
            },
        ]
        other = {
            "kind": "maker_risk_safeguards",
            "status": "no_statement_found",
            "url": "https://example.com/checked",
            "verified_at": "2026-09-03",
        }
        models = [
            {"id": "model-a", "url": "https://example.com/a", "verified_at": "2026-09-04",
             "evidence": [], "license_evidence": [], "flags": flags},
            {"id": "model-b", "url": "https://example.com/b", "verified_at": "2026-09-04",
             "evidence": [], "license_evidence": [], "flags": [other]},
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            documents = {
                "projects.json": {"projects": []},
                "license-evidence.json": {"entries": []},
                "specifications.json": {"specifications": []},
                "inference-services.json": {"services": []},
                "local-runtimes.json": {"runtimes": []},
                "models.json": {"models": models},
                "packs.json": {"packs": []},
            }
            for filename, document in documents.items():
                (directory / filename).write_text(json.dumps(document), encoding="utf-8")
            by_url = {t.url: t for t in check_evidence_links.collect_targets(directory)}

        pinned = by_url["https://example.com/pinned"]
        self.assertEqual(("flag",), pinned.kinds)
        self.assertTrue(pinned.monitor_terms)
        self.assertEqual(("b" * 64,), pinned.pinned_sha256)
        self.assertEqual((("models:model-a:flags:0", "2026-09-02"),), pinned.review_dates)
        self.assertFalse(by_url["https://example.com/unpinnable"].monitor_terms)
        checked = by_url["https://example.com/checked"]
        self.assertTrue(checked.monitor_terms)
        self.assertEqual((), checked.pinned_sha256)
        self.assertEqual(("models:model-b:flags:0",), checked.references)

    def test_a_matching_pin_is_the_baseline_even_after_the_last_run(self) -> None:
        cache = cache_of({}, updated_at="2026-09-03T00:00:00Z")
        summary = self.check(flag_target(pinned=(flag_hash(),)), cache)
        self.assertEqual([], summary.errors)
        self.assertEqual([], summary.warnings)
        self.assertEqual(flag_hash(), cache["entries"][FLAG_URL]["terms_sha256"])

    def test_a_page_that_no_longer_matches_its_pin_fails_and_records_nothing(self) -> None:
        cache = cache_of({}, updated_at="2026-08-31T00:00:00Z")
        summary = self.check(
            flag_target(pinned=("c" * 64,)), cache, establish_baselines=True
        )
        self.assertRegex(summary.errors[0], r"^flag pin mismatch: https://www\.example-lab\.com")
        self.assertNotIn("terms_sha256", cache["entries"][FLAG_URL])

    def test_flag_drift_stays_open_until_a_review_pins_the_new_page(self) -> None:
        cache = cache_of({}, updated_at="2026-09-03T00:00:00Z")
        self.check(flag_target(pinned=(flag_hash(),)), cache)
        changed = b"<html><main>Fixture statement, version B.</main></html>"

        drift = self.check(flag_target(pinned=(flag_hash(),)), cache, body=changed)
        self.assertRegex(drift.errors[0], r"^flag page drift requires review: ")
        self.assertEqual(flag_hash(), cache["entries"][FLAG_URL]["terms_sha256"])

        unpinned_review = self.check(
            flag_target(pinned=(flag_hash(),), reviewed_at="2026-09-06"), cache, body=changed
        )
        self.assertRegex(unpinned_review.errors[0], "flag page drift requires review")

        pinned_review = self.check(
            flag_target(pinned=(flag_hash(changed),), reviewed_at="2026-09-06"),
            cache,
            body=changed,
        )
        self.assertEqual([], pinned_review.errors)
        self.assertEqual(1, pinned_review.terms_accepted)
        self.assertEqual(flag_hash(changed), cache["entries"][FLAG_URL]["terms_sha256"])

    def test_pin_hash_needs_two_equal_readable_fetches(self) -> None:
        bodies = iter([FLAG_BODY, FLAG_BODY])
        self.assertEqual(
            flag_hash(),
            check_evidence_links.pin_hash(FLAG_URL, lambda _t: response(next(bodies))),
        )
        changing = iter([FLAG_BODY, b"<html><main>Rebuilt 12:01</main></html>"])
        self.assertIsNone(
            check_evidence_links.pin_hash(FLAG_URL, lambda _t: response(next(changing)))
        )
        self.assertIsNone(
            check_evidence_links.pin_hash(FLAG_URL, lambda _t: response(b"<html></html>"))
        )
```

Add to `tests/test_review_age.py`, inside `ReviewAgeTests`:

```python
    def test_reviewed_flag_dates_count_as_evidence_review_dates(self) -> None:
        """ADR 039: each flag's verified_at is one of the nested dates the report reads."""
        model = record(
            "model-alpha",
            "2026-09-13",
            evidence=[{"url": "https://example.com/a", "verified_at": "2026-09-01"}],
            flags=[
                {
                    "kind": "maker_risk_safeguards",
                    "status": "no_statement_found",
                    "url": "https://example.com/safety",
                    "verified_at": "2026-08-01",
                    "research_confidence": "high",
                }
            ],
        )
        (row,) = self.rows(models=(model,))
        self.assertEqual(row.oldest_evidence.on, date(2026, 8, 1))
        self.assertEqual(row.oldest_evidence.source, "flags[0]")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_evidence_links.FlagEvidenceTests -v`
Expected: FAIL with `TypeError: LinkTarget.__init__() got an unexpected keyword argument 'pinned_sha256'` and `AttributeError: … has no attribute 'pin_hash'`.

Run: `uv run python -m unittest tests.test_review_age.ReviewAgeTests.test_reviewed_flag_dates_count_as_evidence_review_dates -v`
Expected: PASS. The report already walks every nested `verified_at` generically; this test pins that behaviour so a later narrowing of the walk cannot drop flags. No code change is needed beyond the docstring in Step 3f.

- [ ] **Step 3: Implement in `scripts/check_evidence_links.py`**

3a. `_TargetBuilder` gains `pinned: set[str] = field(default_factory=set)` after `monitor_terms`. `LinkTarget` gains `pinned_sha256: tuple[str, ...] = ()` after `monitor_terms`.

3b. `_add_target` gains a keyword parameter `pinned_sha256: object = None` after `monitor_terms`, and at its end:

```python
    if isinstance(pinned_sha256, str):
        target.pinned.add(pinned_sha256)
```

3c. Add after `_add_trust_targets`:

```python
def _add_flag_targets(
    targets: dict[str, _TargetBuilder],
    flags: Iterable[Any],
    *,
    record_id: str,
) -> None:
    """Reviewed-flag pages carry the fact the flag reports, so they are drift-hashed.

    A statement_found entry pins its page by content_sha256, which is the baseline
    the first observation must match. An unpinnable page is link-checked only, since
    its hash never settles (ADR 037). A no_statement_found entry's checked page is
    hashed like terms, so a statement appearing there raises a review. The checker
    never edits a flag; see ADR 039.
    """
    for index, entry in enumerate(flags):
        if not isinstance(entry, dict):
            continue
        _add_target(
            targets,
            entry.get("url"),
            kind="flag",
            reference=f"models:{record_id}:flags:{index}",
            reviewed_at=entry.get("verified_at"),
            monitor_terms=entry.get("unpinnable") is not True,
            pinned_sha256=entry.get("content_sha256"),
        )
```

3d. In `collect_targets`, inside the `for record in document[key]:` loop over runtimes, models, and packs, after the two `_add_evidence_items` calls, add:

```python
            if collection == "models" and isinstance(record.get("flags"), list):
                _add_flag_targets(targets, record["flags"], record_id=record_id)
```

and in the final `LinkTarget(...)` construction add `pinned_sha256=tuple(sorted(item.pinned)),`.

3e. Replace `_missing_baseline_error` and `_terms_drift_error` with:

```python
def _missing_baseline_error(target: LinkTarget) -> str:
    if target.pinned_sha256:
        return (
            f"flag pin mismatch: {target.url} ({_reference_label(target)}); the page no "
            "longer hashes to the content_sha256 its reviewed flag pins, so the flag needs "
            "review before any baseline is recorded"
        )
    return (
        f"terms baseline missing: {target.url} ({_reference_label(target)}); no cached baseline "
        "covers a review made before the last check. Import the cache that checked it "
        "(--import-cache), or review the page and rerun with --establish-baselines --max-age-hours 0"
    )
```

```python
def _terms_drift_error(target: LinkTarget) -> str:
    subject = "flag page drift" if "flag" in target.kinds else "terms drift"
    return f"{subject} requires review: {target.url} ({_reference_label(target)})"


def _first_baseline(
    target: LinkTarget, current_hash: str, *, reviewed_since: bool, establish: bool
) -> str:
    """How the first readable observation of a monitored page is treated.

    A pinned flag page is its own review record: it becomes the baseline only when
    it still hashes to the content_sha256 the reviewer pinned, and no request can
    override a mismatch. Returns "silent", "requested", or "missing".
    """
    if target.pinned_sha256:
        return "silent" if current_hash in target.pinned_sha256 else "missing"
    if reviewed_since:
        return "silent"
    return "requested" if establish else "missing"


def _matches_pin(target: LinkTarget, current_hash: str) -> bool:
    """A review may accept a changed flag page only at the hash its flag now pins."""
    return not target.pinned_sha256 or current_hash in target.pinned_sha256
```

3f. In `check_targets`, replace the whole `elif baseline_hash is None:` branch with:

```python
            elif baseline_hash is None:
                decision = _first_baseline(
                    target,
                    current_hash,
                    reviewed_since=_reviewed_since_last_run(review_dates, last_run),
                    establish=establish_baselines,
                )
                if decision == "missing":
                    # Terms reviewed before the last run should already have a baseline;
                    # its absence means a lost, new, or partial cache, not a first sight.
                    # A pinned flag page that no longer matches its pin lands here too.
                    entry["terms_baseline_missing"] = now.date().isoformat()
                    summary.errors.append(_missing_baseline_error(target))
                else:
                    _store_terms(
                        entry, "terms", current_hash, current_text, current_scope
                    )
                    entry["terms_reviewed_at"] = review_dates
                    _clear_observed(entry)
                    entry.pop("terms_baseline_missing", None)
                    summary.terms_bootstrapped += 1
                    if decision == "requested":
                        summary.warnings.append(
                            "terms baseline established by request: "
                            f"{target.url} ({_reference_label(target)})"
                        )
```

and in the following `elif current_hash != baseline_hash or entry.get("terms_drift_detected_at"):` branch change `if review_advanced:` to `if review_advanced and _matches_pin(target, current_hash):`.

3g. Add after `_run_import`:

```python
def pin_hash(url: str, fetch: Callable[[LinkTarget], FetchResult]) -> str | None:
    """The normalised hash a reviewed flag pins, or None when the page cannot be pinned.

    The page is fetched twice with the monitor's own normalisation (ADR 037's rule):
    two different hashes, or nothing readable, mean the flag cites it as unpinnable.
    """
    target = LinkTarget(
        url=url, kinds=("flag",), references=("pin",), review_dates=(), monitor_terms=True
    )
    hashes: set[str] = set()
    for _ in range(2):
        response = fetch(target)
        content = terms_content(
            response.body or b"", response.headers.get("content-type", ""), url
        )
        if content is None:
            return None
        hashes.add(content.sha256)
    return hashes.pop() if len(hashes) == 1 else None


def _run_pin(url: str) -> int:
    token = os.environ.get("GITHUB_TOKEN")
    try:
        pinned = pin_hash(url, lambda target: fetch_target(target, {}, token=token))
    except FetchFailure as exc:
        print(f"error: {url}: {exc}", file=sys.stderr)
        return 1
    if pinned:
        print(f"content_sha256: {pinned}")
    else:
        print(
            "unpinnable: the page changed between two fetches or has no readable text; "
            'cite it with "unpinnable": true'
        )
    return 0
```

3h. In `build_parser`, add:

```python
    parser.add_argument(
        "--pin",
        metavar="URL",
        help="fetch URL twice and print the content_sha256 a reviewed flag pins, or say it is unpinnable; uses no cache",
    )
```

and in `main`, directly after `cache_path = args.cache or default_cache_path()`, add:

```python
    if args.pin:
        return _run_pin(args.pin)
```

3i. In `scripts/report_review_age.py`, change the module docstring's "its own editorial ``verified_at``; the oldest human review date on its evidence, terms, and trust record;" to "its own editorial ``verified_at``; the oldest human review date on its evidence, terms, trust record, and reviewed flags;".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_evidence_links tests.test_review_age -v`
Expected: PASS, including every existing test.

- [ ] **Step 5: Amend `docs/OPERATIONS.md`**

5a. In "## Review age", change "any nested `verified_at` in its evidence, license evidence, terms, or trust record" to "any nested `verified_at` in its evidence, license evidence, terms, trust record, or reviewed flags".

5b. In "## Evidence links and terms drift", insert this paragraph directly after the trust-record paragraph (the one ending with the "See ADR 029" link):

```markdown
Reviewed-flag pages — the `url` of every `flags` entry on a reviewed model — are
first-party pages that carry the fact the flag exists to report, so they are
drift-hashed with the same normalisation as terms and fail as `flag page drift requires
review` when they change. A `statement_found` entry pins its page with `content_sha256`,
and that pin is the baseline: the first observation must match it, whenever the flag
was reviewed, and `--establish-baselines` cannot override a mismatch, which fails as
`flag pin mismatch`. A review that changes the page's pin and advances the flag's
`verified_at` accepts the new page only at the pinned hash. An `"unpinnable": true` entry
is link-checked and never hashed. A `no_statement_found` entry's checked page is hashed
like terms, so a statement appearing there raises a review. Drift never rewrites or
removes a flag; it fails the weekly verification and opens the `automation-failure`
issue, which waits for a human, as license drift does under AGENTS.md rule 10. To pin a
page while reviewing, run
`uv run python scripts/check_evidence_links.py --pin URL`: it fetches the page twice
with this normalisation, uses no cache, and prints either the `content_sha256` to record
or `unpinnable`. See
[ADR 039](adr/039-reviewed-flags-record-a-makers-risk-statement.md).
```

- [ ] **Step 6: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes.

```bash
git add scripts/check_evidence_links.py scripts/report_review_age.py tests/test_evidence_links.py tests/test_review_age.py docs/OPERATIONS.md
git commit -m "$(cat <<'EOF'
Drift-hash reviewed-flag pages and read flag dates in review age

ADR 039: flag URLs join the terms hashing with the reviewer's pin as the
baseline; unpinnable pages are link-checked only; --pin prints the hash a
flag records; the review-age walk is pinned to include flag dates.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Boot carries what the flag emblem needs, and no more

**Files:**
- Modify: `scripts/build_web_payload.py` (new `BOOT_ITEM_FIELDS` and `project_boot_items`; `build_payloads`)
- Modify: `docs/WEB.md` (the boot-payload figure under "## Verification")
- Test: `tests/test_web_payload.py`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime.
- Produces:
  - `BOOT_ITEM_FIELDS: dict[str, dict[str, dict[str, tuple[str, ...]]]]`, collection → list field → the item's `status` → the keys boot keeps: `{"models": {"flags": {"statement_found": ("kind", "status", "tier_term", "domains", "determination", "scope"), "no_statement_found": ("kind", "status")}}}`.
  - `project_boot_items(items: list[dict], keys_by_status: dict[str, tuple[str, ...]]) -> list[dict]`; an item whose status is not listed keeps only `kind` and `status`.
  - A reviewed model's boot entry has `flags` only when the record has `flags`: a `statement_found` entry carries `kind`, `status`, `tier_term`, `domains`, `determination`, and `scope`, which is enough to paint and explain the emblem; a `no_statement_found` entry carries `kind` and `status`. `statement`, `url`, `content_sha256` or `unpinnable`, `verified_at`, and `research_confidence` live only in `app/detail/model/<id>.json`, which has the full `flags` list. Tasks 5–7 rely on both.

The boot projection today supports only flat fields plus two hard-coded special cases (`score` and imported `source_metadata`); it has no nested subsets. `BOOT_ITEM_FIELDS` is the smallest general form: a list field whose items boot sees only in part, chosen by each item's `status`, and which detail keeps whole because the field is not in `BOOT_FIELDS`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_web_payload.py`:

1a. Add `import copy` to the imports and `BOOT_ITEM_FIELDS,` and `project_boot_items,` to the `from scripts.build_web_payload import (` list.

1b. In `test_every_published_field_lands_in_boot_or_detail`, directly after the `if field == "score": … continue` block, add:

```python
                    # A list whose items boot sees in part (ADR 039's flags): boot
                    # carries each item's keys for its status, detail the whole list.
                    keys_by_status = BOOT_ITEM_FIELDS.get(collection, {}).get(field)
                    if keys_by_status is not None:
                        self.assertEqual(
                            project_boot_items(record[field], keys_by_status),
                            entry[field],
                        )
                        self.assertEqual(record[field], detail[field])
                        continue
```

1c. Add these tests to the class:

```python
    FOUND_FLAG = {
        "kind": "maker_risk_safeguards",
        "status": "statement_found",
        "tier_term": "Fixture Level 3",
        "domains": ["cyber"],
        "determination": "determined",
        "scope": "weights",
        "statement": "A fixture sentence standing in for a developer's verbatim words.",
        "url": "https://www.example-lab.com/system-card",
        "content_sha256": "a" * 64,
        "verified_at": "2026-09-01",
        "research_confidence": "high",
    }
    NONE_FLAG = {
        "kind": "maker_risk_safeguards",
        "status": "no_statement_found",
        "url": "https://www.example-lab.com/safety",
        "verified_at": "2026-09-01",
        "research_confidence": "medium",
    }

    def flagged_payloads(self, entry: dict) -> tuple[dict, dict, dict]:
        catalog = copy.deepcopy(self.catalog)
        model = catalog["models.json"]["models"][0]
        model["flags"] = [dict(entry)]
        payloads = build_payloads(catalog)
        boot = {
            item["id"]: item
            for item in json.loads(payloads["app/models.json"])["models"]
        }
        detail = json.loads(payloads[f"app/detail/model/{model['id']}.json"])
        return model, boot[model["id"]], detail

    def test_boot_carries_a_found_statements_emblem_fields_and_not_its_quote(self) -> None:
        _, entry, detail = self.flagged_payloads(self.FOUND_FLAG)
        self.assertEqual(
            [
                {
                    "kind": "maker_risk_safeguards",
                    "status": "statement_found",
                    "tier_term": "Fixture Level 3",
                    "domains": ["cyber"],
                    "determination": "determined",
                    "scope": "weights",
                }
            ],
            entry["flags"],
        )
        self.assertEqual([self.FOUND_FLAG], detail["flags"])

    def test_boot_carries_only_kind_and_status_when_no_statement_was_found(self) -> None:
        _, entry, detail = self.flagged_payloads(self.NONE_FLAG)
        self.assertEqual(
            [{"kind": "maker_risk_safeguards", "status": "no_statement_found"}],
            entry["flags"],
        )
        self.assertEqual([self.NONE_FLAG], detail["flags"])

    def test_an_unknown_status_keeps_only_kind_and_status(self) -> None:
        self.assertEqual(
            [{"kind": "k", "status": "future"}],
            project_boot_items(
                [{"kind": "k", "status": "future", "tier_term": "x"}],
                BOOT_ITEM_FIELDS["models"]["flags"],
            ),
        )

    def test_imported_rows_never_carry_flags_in_boot(self) -> None:
        """Imported models.dev rows carry no Atlas conclusion, so boot gives them no flags."""
        boot = json.loads(self.payloads["app/models.json"])["models"]
        for entry in boot:
            if entry["review_status"] == "imported":
                self.assertNotIn("flags", entry, entry["id"])

    def test_flags_never_reach_search(self) -> None:
        """A flag never affects the Finder, sort, or search (ADR 039)."""
        self.assertNotIn("flags", SEARCH_FIELDS["models"])
        self.assertNotIn("flags", BOOT_FIELDS["models"])
        found = BOOT_ITEM_FIELDS["models"]["flags"]["statement_found"]
        for detail_only in ("statement", "url", "content_sha256", "unpinnable", "verified_at", "research_confidence"):
            self.assertNotIn(detail_only, found)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_web_payload -v`
Expected: FAIL with `ImportError: cannot import name 'BOOT_ITEM_FIELDS'`.

- [ ] **Step 3: Implement in `scripts/build_web_payload.py`**

3a. After the `BOOT_FIELDS` dict, add:

```python
# List fields a card needs only part of, keyed by each item's status. Boot carries
# the listed keys of each item; detail carries the whole field, because the field
# is not in BOOT_FIELDS. ADR 039: a found statement's term, domains, determination,
# and scope paint and explain the flag emblem; the quote, link, hash, and dates
# live in the model's detail file, because boot is already over its size budget.
BOOT_ITEM_FIELDS = {
    "models": {
        "flags": {
            "statement_found": (
                "kind",
                "status",
                "tier_term",
                "domains",
                "determination",
                "scope",
            ),
            "no_statement_found": ("kind", "status"),
        },
    },
}


def project_boot_items(
    items: list[dict], keys_by_status: dict[str, tuple[str, ...]]
) -> list[dict]:
    """Each item cut to the keys boot keeps for its status; kind and status otherwise."""
    return [
        {
            key: item[key]
            for key in keys_by_status.get(item.get("status"), ("kind", "status"))
            if key in item
        }
        for item in items
    ]
```

3b. In `build_payloads`, inside `for record in records:` of the boot loop, directly after `entry = {field: record[field] for field in boot_fields if field in record}`, add:

```python
            for field, keys_by_status in BOOT_ITEM_FIELDS.get(collection, {}).items():
                if field in record:
                    entry[field] = project_boot_items(record[field], keys_by_status)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_web_payload -v`
Expected: PASS.

Run: `uv run python scripts/build_web_payload.py --check`
Expected: `… app payload files are up to date.` (no real record has flags, so no payload changes).

- [ ] **Step 5: Measure the boot payload and record it in `docs/WEB.md`**

Run the measurement exactly as `docs/WEB.md` "## Verification" gives it:

```bash
uv run python -m http.server 8765 --directory web &
sleep 2
python3 -c "
import urllib.request, gzip
total = 0
for path in ['app/systems.json','app/inference.json','app/runtimes.json','app/specifications.json','app/models.json','app/packs.json','taxonomy.json']:
    body = urllib.request.urlopen(f'http://localhost:8765/{path}').read()
    total += len(gzip.compress(body, 9))
print(f'blocking boot payload: {total/1024:.1f} KB gzipped')"
kill %1
```

In `docs/WEB.md`, replace the sentence `Expected: 82.2 KB gzipped, measured 2026-09-20.` with `Expected: X KB gzipped, measured YYYY-MM-DD.`, writing the figure the command printed for X and the date of the run for YYYY-MM-DD, and append the sentence below to the end of that paragraph.

```markdown
Reviewed flags ([ADR 039](adr/039-reviewed-flags-record-a-makers-risk-statement.md)) add each entry's `kind` and `status` to `app/models.json`, plus a found statement's `tier_term`, `domains`, `determination`, and `scope` (`BOOT_ITEM_FIELDS`), and the five flag vocabularies add to `taxonomy.json`; the quote, link, hash, and dates stay in detail. No published model carries a flag at this measurement, so the backfill will add to the figure; re-measure after each backfill batch.
```

- [ ] **Step 6: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes.

```bash
git add scripts/build_web_payload.py tests/test_web_payload.py docs/WEB.md
git commit -m "$(cat <<'EOF'
Project reviewed flags to their emblem fields in the models boot payload

ADR 039: boot carries each flag's kind and status, plus a found
statement's term, domains, determination, and scope; the quote, link,
hash, and dates stay in the model's detail file. The boot figure in
WEB.md is re-measured.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The flags family and flag text in the web core

**Files:**
- Modify: `web/app-core.js` (`BADGE_FAMILIES`; new flag registry and functions after `badgeLegend`; `badgeEmblem`; `badgeLegend`; the returned API)
- Modify: `web/styles.css` (family colour rule)
- Modify: `web/app.js` (`renderTaxonomy`: keep the flag family out of "Card badges" groups)
- Modify: `tests/test_web.js`, `tests/e2e/badge-legend.spec.js`, `tests/e2e/card-badges.spec.js`
- Generated: the asset stamp and blog pages via the regeneration sequence

**Interfaces:**
- Consumes: taxonomy names from Task 1; boot `flags` from Task 4: a `statement_found` entry with `kind`, `status`, `tier_term`, `domains`, `determination`, and `scope`, a `no_statement_found` entry with `kind` and `status`.
- Produces (all on `AtlasCore`):
  - `BADGE_FAMILIES.flags = { name: "Maker risk statement", meaning, token: "--danger", frame }`.
  - `FLAG_FAMILY = "flags"`, `REVIEWED_FLAGS = { maker_risk_safeguards: { name, family, glyph } }`.
  - `makerRiskEntry(record) -> entry | null`.
  - `cardFlags(kind, record) -> Array<{ id, name, family, entry }>` (only a reviewed model with a `statement_found` entry yields one).
  - `flagEmblemText(entry, developer, taxonomy) -> { name: string, sentence: string }`, complete from a boot entry alone.
  - `riskStatementView(record, taxonomy) -> null | { state: "not_examined", text } | { state: "no_statement_found", text, url, verifiedAt, confidence } | { state: "statement_found", pending, heading, sentence, statement, domains, scope, url, verifiedAt, confidence }`, where `pending` is true until the detail file supplies `statement` (and `url`, `verifiedAt`, `confidence` are `null` until then).
  - `badgeEmblem(id)` now accepts a flag kind id; `badgeLegend("models")` leads with `{ id: "maker_risk_safeguards", name: "Maker risk statement", family: "flags" }`; `badgeLegend("all")` families end with `flags`; `badgeLegend("packs")` does not include it.

The All legend also lists the flag family. ADR 039 names only the Models legend, but reviewed-model cards appear in the All grid too, and the `docs/WEB.md` legend contract is that the strip "names the active scope's emblems". Packs never shows a model, so its legend stays three families.

- [ ] **Step 1: Write the failing tests**

1a. In `tests/test_web.js`, extend the destructured `require("../web/app-core.js")` on line 6 with `FLAG_FAMILY, REVIEWED_FLAGS, cardFlags, flagEmblemText, riskStatementView` (keep the list alphabetical where it already is).

1b. Update existing assertions:
- In "every badge belongs to one family and owns a unique glyph", change `assert.deepEqual(Object.keys(BADGE_FAMILIES), ["control", "capability", "platform"]);` to `assert.deepEqual(Object.keys(BADGE_FAMILIES), ["control", "capability", "platform", "flags"]);`.
- In "the legend lists only what the active scope can show", replace

```js
  for (const scope of ["all", "packs"]) {
    assert.equal(badgeLegend(scope).mode, "families");
    assert.deepEqual(badgeLegend(scope).families.map(family => family.id), ["control", "capability", "platform"]);
  }
```

with

```js
  for (const scope of ["all", "packs"]) assert.equal(badgeLegend(scope).mode, "families");
  // All lists reviewed-model cards, which can carry a flag; Packs never does.
  assert.deepEqual(badgeLegend("all").families.map(family => family.id), ["control", "capability", "platform", "flags"]);
  assert.deepEqual(badgeLegend("packs").families.map(family => family.id), ["control", "capability", "platform"]);
```

and replace `assert.deepEqual(ids(badgeLegend("models")), CARD_BADGE_SETS.model);` with `assert.deepEqual(ids(badgeLegend("models")), ["maker_risk_safeguards", ...CARD_BADGE_SETS.model]);`.

1c. Append at the end of `tests/test_web.js`:

```js
// Reviewed flags (ADR 039): a developer's own risk-threshold statement, quoted
// and classified in its own terms, never an Atlas verdict.
const FLAG_FOUND = {
  kind: "maker_risk_safeguards", status: "statement_found", tier_term: "Fixture Level 3",
  domains: ["cyber", "bio_chem"], determination: "precautionary", scope: "weights",
  statement: "A fixture sentence standing in for a developer's verbatim words.",
  url: "https://www.example-lab.com/system-card", content_sha256: "a".repeat(64),
  verified_at: "2026-09-01", research_confidence: "high",
};
const FLAG_NONE = { kind: "maker_risk_safeguards", status: "no_statement_found", url: "https://www.example-lab.com/safety", verified_at: "2026-09-01", research_confidence: "medium" };
// What boot carries for a found statement (Task 4): no quote, link, hash, or dates.
const FLAG_FOUND_BOOT = { kind: FLAG_FOUND.kind, status: FLAG_FOUND.status, tier_term: FLAG_FOUND.tier_term, domains: FLAG_FOUND.domains, determination: FLAG_FOUND.determination, scope: FLAG_FOUND.scope };
const flagModel = flags => ({ id: "model-example", developer: "Example Lab", review_status: "reviewed", distribution_modes: ["developer_api"], ...(flags ? { flags } : {}) });
const DISCLAIMER = "This is the developer's own statement, not an Atlas risk rating.";

test("only a found statement on a reviewed model paints a flag, and a flag is not a badge", () => {
  assert.deepEqual(cardFlags("model", flagModel([FLAG_FOUND])).map(flag => [flag.id, flag.family]), [["maker_risk_safeguards", "flags"]]);
  assert.equal(cardFlags("model", flagModel([FLAG_FOUND_BOOT])).length, 1, "the boot entry is enough to paint");
  assert.deepEqual(cardFlags("model", flagModel([FLAG_NONE])), []);
  assert.deepEqual(cardFlags("model", flagModel()), []);
  assert.deepEqual(cardFlags("model", { ...flagModel([FLAG_FOUND]), review_status: "imported" }), []);
  assert.deepEqual(cardFlags("system", { system_family: "agent_system", flags: [FLAG_FOUND] }), []);
  assert.deepEqual(badgeNames(cardBadges("model", flagModel([FLAG_FOUND]))), ["Developer API"]);
});

test("the flag tooltip prints the developer's term and determination and ends with the disclaimer", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const precautionary = flagEmblemText(FLAG_FOUND, "Example Lab", taxonomy);
  assert.equal(precautionary.name, "“Fixture Level 3” · Precautionary");
  assert.equal(precautionary.sentence, `Example Lab names this release against “Fixture Level 3” in cyber and biological or chemical capability, as a precaution. The statement covers the model itself. ${DISCLAIMER}`);
  const determined = flagEmblemText({ ...FLAG_FOUND, determination: "determined", domains: ["cyber", "bio_chem", "autonomy"], scope: "deployment" }, "Example Lab", taxonomy);
  assert.equal(determined.name, "“Fixture Level 3” · Threshold reached");
  assert.equal(determined.sentence, `Example Lab states that this release reached “Fixture Level 3” in cyber, biological or chemical, and autonomy capability. The statement covers safeguards on a release channel. ${DISCLAIMER}`);
  assert.equal(flagEmblemText({ ...FLAG_FOUND, domains: ["autonomy"] }, "Example Lab", taxonomy).sentence.split(" capability")[0], "Example Lab names this release against “Fixture Level 3” in autonomy");
});

test("the boot entry alone gives the full tooltip and hidden text, with no detail fetch", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  assert.deepEqual(flagEmblemText(FLAG_FOUND_BOOT, "Example Lab", taxonomy), flagEmblemText(FLAG_FOUND, "Example Lab", taxonomy));
});

test("no flag text uses an Atlas word for the result", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  const texts = [FLAG_FOUND, { ...FLAG_FOUND, determination: "determined", scope: "deployment" }]
    .flatMap(entry => Object.values(flagEmblemText(entry, "Example Lab", taxonomy)));
  for (const text of texts) assert.doesNotMatch(text, /high risk|dangerous|unsafe/i, text);
});

test("the Risk statements section has three states and imported models have none", () => {
  const taxonomy = readWebJSON("taxonomy.json");
  assert.deepEqual(riskStatementView(flagModel(), taxonomy), { state: "not_examined", text: "Not yet examined." });
  assert.deepEqual(riskStatementView(flagModel([FLAG_NONE]), taxonomy), {
    state: "no_statement_found",
    text: "The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.",
    url: FLAG_NONE.url, verifiedAt: "2026-09-01", confidence: "Medium",
  });
  const found = riskStatementView(flagModel([FLAG_FOUND]), taxonomy);
  assert.equal(found.state, "statement_found");
  assert.equal(found.pending, false);
  assert.equal(found.heading, "“Fixture Level 3” · Precautionary");
  assert.equal(found.statement, FLAG_FOUND.statement);
  assert.equal(found.domains, "Cyber · Biological or chemical");
  assert.equal(found.scope, "The model itself");
  assert.equal(found.url, FLAG_FOUND.url);
  assert.equal(found.confidence, "High");
  assert.ok(found.sentence.endsWith(DISCLAIMER));
  // Before detail lands the section knows the term, domains, and scope from
  // boot, but not the quote, link, date, or confidence.
  const pending = riskStatementView(flagModel([FLAG_FOUND_BOOT]), taxonomy);
  assert.equal(pending.state, "statement_found");
  assert.equal(pending.pending, true);
  assert.equal(pending.heading, found.heading);
  assert.equal(pending.sentence, found.sentence);
  assert.equal(pending.domains, found.domains);
  assert.equal(pending.statement, null);
  assert.equal(pending.url, null);
  const pendingNone = riskStatementView(flagModel([{ kind: FLAG_NONE.kind, status: "no_statement_found" }]), taxonomy);
  assert.equal(pendingNone.text, "The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.");
  assert.equal(pendingNone.url, null);
  assert.equal(riskStatementView({ ...flagModel([FLAG_FOUND]), review_status: "imported" }, taxonomy), null);
});

test("the flag family is a triangle on --danger, a token nothing else uses and no accent shares", () => {
  assert.equal(FLAG_FAMILY, "flags");
  assert.equal(BADGE_FAMILIES.flags.name, "Maker risk statement");
  assert.equal(BADGE_FAMILIES.flags.token, "--danger");
  const frames = Object.values(BADGE_FAMILIES).map(family => family.frame);
  assert.equal(new Set(frames).size, frames.length, "every family has its own frame");
  const svg = badgeEmblem("maker_risk_safeguards");
  assert.ok(svg.includes(`d="${BADGE_FAMILIES.flags.frame}"`));
  assert.ok(svg.includes(REVIEWED_FLAGS.maker_risk_safeguards.glyph));
  assert.ok(!Object.values(CARD_BADGES).some(badge => badge.glyph === REVIEWED_FLAGS.maker_risk_safeguards.glyph));
  const { light, osDark, rest } = stylesheetBlocks();
  assert.equal([...rest.matchAll(/var\(--danger\)/g)].length, 1, "--danger colours the flag family and nothing else");
  for (const accent of ["--cyan", "--violet", "--amber", "--coral"]) {
    assert.notEqual(light["--danger"], light[accent], `${accent} (light)`);
    assert.notEqual(osDark["--danger"], osDark[accent], `${accent} (dark)`);
  }
});

test("every reviewed flag is a taxonomy flag kind of the same name, allowed on models", () => {
  const kinds = readWebJSON("taxonomy.json").flag_kinds;
  for (const [id, flag] of Object.entries(REVIEWED_FLAGS)) {
    const kind = kinds.find(item => item.id === id);
    assert.ok(kind, `${id} is not a flag_kinds entry`);
    assert.equal(kind.name, flag.name);
    assert.deepEqual(kind.collections, ["models"]);
    assert.equal(flag.family, FLAG_FAMILY);
  }
});
```

1d. In `tests/e2e/badge-legend.spec.js`, in the test "mixed scopes show only the families, Models names its own set, and badge-less views show nothing", replace `await expect(items(page)).toHaveCount(3);` with:

```js
  await expect(items(page)).toHaveCount(4);
  await expect(items(page).last()).toContainText("Maker risk statement");
```

1e. In `tests/e2e/card-badges.spec.js`, extend the require to `const { cardBadgeGlossary, cardBadges, BADGE_FAMILIES, FLAG_FAMILY } = require("../../web/app-core.js");`, and in "Taxonomy lists every badge under its family with its emblem" change `for (const [id, family] of Object.entries(BADGE_FAMILIES)) {` to:

```js
  // Reviewed flags are not badges; Taxonomy lists them in their own group.
  for (const [id, family] of Object.entries(BADGE_FAMILIES).filter(([id]) => id !== FLAG_FAMILY)) {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js`
Expected: FAIL: the new tests with `TypeError: cardFlags is not a function` (and similar), and the updated family and legend assertions.

- [ ] **Step 3: Implement in `web/app-core.js`**

3a. Add a fourth entry to `BADGE_FAMILIES`, after `platform`:

```js
    // Reviewed flags (ADR 039), not badges: the triangle frame the badge
    // emblems reserved, on a token no other component uses.
    flags: {
      name: "Maker risk statement",
      meaning: "A developer's own statement that names this release against a risk threshold. It is the developer's words, not an Atlas rating.",
      token: "--danger",
      frame: "M16 3.8 29.2 27.2H2.8Z",
    },
```

3b. Replace `badgeEmblem` with:

```js
  function badgeEmblem(id) {
    const mark = Object.hasOwn(CARD_BADGES, id) ? CARD_BADGES[id] : REVIEWED_FLAGS[id];
    return emblemSVG(mark.family, mark.glyph);
  }
```

3c. In `badgeLegend`, replace the first `if (collection === "all" || collection === "packs") { … }` block with:

```js
    if (collection === "all" || collection === "packs") {
      // All lists reviewed-model cards, which can carry a flag; Packs never does.
      const families = Object.entries(BADGE_FAMILIES).filter(([id]) => collection === "all" || id !== FLAG_FAMILY);
      return { mode: "families", families: families.map(([id, family]) => ({ id, name: family.name, meaning: family.meaning })) };
    }
```

and replace its final `return { mode: "badges", badges: ids.map(…) };` with:

```js
    const badges = ids.map(id => ({ id, name: CARD_BADGES[id].name, family: CARD_BADGES[id].family }));
    // A flag leads a model card's badge row, so it leads the Models legend too.
    const flags = collection === "models"
      ? Object.entries(REVIEWED_FLAGS).map(([id, flag]) => ({ id, name: flag.name, family: flag.family }))
      : [];
    return { mode: "badges", badges: [...flags, ...badges] };
```

3d. Directly above `function emblemSVG`, add the flag registry. `badgeEmblem` and `badgeLegend` only read it when called, after the factory body has run, so this position is safe:

```js
  // Reviewed flags (ADR 039) are a second tier beside badges. A flag records one
  // kind of first-party statement a record's steward publishes about it, in the
  // steward's own words, never an Atlas verdict. Flags share the emblem drawing
  // but not the badge contract: they are not presence tests, lead the badge row
  // outside MAX_CARD_BADGES, and never affect score, sort, the Finder, or
  // comparison. See docs/WEB.md "Reviewed flags".
  const FLAG_FAMILY = "flags";
  const MAKER_RISK_FLAG = "maker_risk_safeguards";
  const REVIEWED_FLAGS = {
    [MAKER_RISK_FLAG]: {
      name: "Maker risk statement",
      family: FLAG_FAMILY,
      glyph: '<path d="M16 12.4v6"/><circle class="badge-dot" cx="16" cy="22.1" r="1.1"/>',
    },
  };
  const FLAG_DISCLAIMER = "This is the developer's own statement, not an Atlas risk rating.";
  const FLAG_NO_STATEMENT_TEXT = "The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.";
  const FLAG_NOT_EXAMINED_TEXT = "Not yet examined.";
```

3e. After `badgeLegend`, add:

```js
  function makerRiskEntry(record) {
    const flags = Array.isArray(record.flags) ? record.flags : [];
    return flags.find(entry => entry && entry.kind === MAKER_RISK_FLAG) || null;
  }

  // Flags a card paints, ahead of its badges. Only a reviewed model with a found
  // statement carries one; "no statement" and "not examined" are said in the
  // dialog, never as an emblem, so an unflagged card claims nothing.
  function cardFlags(kind, record) {
    if (kind !== "model" || record.review_status !== "reviewed") return [];
    const entry = makerRiskEntry(record);
    if (!entry || entry.status !== "statement_found") return [];
    return [{ id: MAKER_RISK_FLAG, name: REVIEWED_FLAGS[MAKER_RISK_FLAG].name, family: FLAG_FAMILY, entry }];
  }

  function vocabularyName(taxonomy, group, id) {
    const item = ((taxonomy && taxonomy[group]) || []).find(candidate => candidate.id === id);
    return item ? item.name : id;
  }

  function joinPlain(items) {
    if (items.length < 2) return items.join("");
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  // Boot carries a found statement's term, domains, determination, and scope
  // (ADR 039), so the emblem's words never wait for the detail file.
  function flagSentence(entry, developer, taxonomy) {
    const domains = joinPlain(entry.domains.map(id => vocabularyName(taxonomy, "flag_domains", id).toLowerCase()));
    const claim = entry.determination === "determined"
      ? `${developer} states that this release reached “${entry.tier_term}” in ${domains} capability.`
      : `${developer} names this release against “${entry.tier_term}” in ${domains} capability, as a precaution.`;
    const scope = vocabularyName(taxonomy, "flag_scopes", entry.scope);
    return `${claim} The statement covers ${scope.charAt(0).toLowerCase()}${scope.slice(1)}. ${FLAG_DISCLAIMER}`;
  }

  // The tooltip's name line and sentence; the card's hidden text is the sentence.
  function flagEmblemText(entry, developer, taxonomy) {
    return {
      name: `“${entry.tier_term}” · ${vocabularyName(taxonomy, "flag_determinations", entry.determination)}`,
      sentence: flagSentence(entry, developer, taxonomy),
    };
  }

  // What a reviewed model's "Risk statements" section shows in each of the
  // three states. null for anything but a reviewed model: imported rows carry
  // no Atlas conclusion and show nothing.
  function riskStatementView(record, taxonomy) {
    if (record.review_status !== "reviewed") return null;
    const entry = makerRiskEntry(record);
    if (!entry || !["statement_found", "no_statement_found"].includes(entry.status)) {
      return { state: "not_examined", text: FLAG_NOT_EXAMINED_TEXT };
    }
    const checked = {
      url: entry.url || null,
      verifiedAt: entry.verified_at || null,
      confidence: entry.research_confidence ? vocabularyName(taxonomy, "research_confidence_levels", entry.research_confidence) : null,
    };
    if (entry.status === "no_statement_found") return { state: "no_statement_found", text: FLAG_NO_STATEMENT_TEXT, ...checked };
    // The quote, link, date, and confidence arrive with the detail file; until
    // then the section says what boot knows and never reads as unexamined.
    const text = flagEmblemText(entry, record.developer, taxonomy);
    const quoted = typeof entry.statement === "string";
    return {
      state: "statement_found",
      pending: !quoted,
      heading: text.name,
      sentence: text.sentence,
      statement: quoted ? entry.statement : null,
      domains: entry.domains.map(id => vocabularyName(taxonomy, "flag_domains", id)).join(" · "),
      scope: vocabularyName(taxonomy, "flag_scopes", entry.scope),
      ...checked,
    };
  }
```

3f. Add to the returned API object, in its alphabetical positions: `FLAG_FAMILY,`, `REVIEWED_FLAGS,`, `cardFlags,`, `flagEmblemText,`, `makerRiskEntry,`, `riskStatementView,`.

- [ ] **Step 4: Implement the colour rule and the Taxonomy guard**

4a. In `web/styles.css`, after `[data-family="platform"] { color: var(--amber); }`, add:

```css
[data-family="flags"] { color: var(--danger); }
```

4b. In `web/app.js` `renderTaxonomy`, change `const badgeGroups = Object.entries(AtlasCore.BADGE_FAMILIES).map(([id, family]) => [` to:

```js
  // Reviewed flags are not badges; they have their own Taxonomy group.
  const badgeGroups = Object.entries(AtlasCore.BADGE_FAMILIES).filter(([id]) => id !== AtlasCore.FLAG_FAMILY).map(([id, family]) => [
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `/usr/local/bin/node --check web/app-core.js && /usr/local/bin/node --check web/app.js && /usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

Run the regeneration sequence (the asset stamp and blog pages change):

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
/usr/local/bin/node scripts/build_asset_version.mjs
uv run python scripts/build_blog.py
```

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/badge-legend.spec.js tests/e2e/card-badges.spec.js`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes.

```bash
git add web/app-core.js web/app.js web/styles.css web/index.html web/blog tests/test_web.js tests/e2e/badge-legend.spec.js tests/e2e/card-badges.spec.js
git commit -m "$(cat <<'EOF'
Add the reviewed-flags emblem family and flag text to the web core

ADR 039: a triangle flags family on --danger, the maker-risk flag glyph,
cardFlags, the tooltip sentence, the three-state Risk statements view, and
legend entries in Models and All. Taxonomy keeps flags out of card badges.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The flag on cards, in the legend, and in Taxonomy

**Files:**
- Modify: `web/app.js` (`badgeRow`, new `flagItem`; both reviewed-model card templates; `renderTaxonomy`)
- Create: `tests/e2e/reviewed-flags.spec.js`
- Generated: asset stamp and blog pages

**Interfaces:**
- Consumes: `AtlasCore.cardFlags`, `AtlasCore.flagEmblemText`, `AtlasCore.makerRiskEntry`, `AtlasCore.badgeEmblem`, `AtlasCore.FLAG_FAMILY`, `AtlasCore.REVIEWED_FLAGS`, `AtlasCore.BADGE_FAMILIES` (Task 5); boot `flags` entries from Task 4.
- Produces: `badgeRow(badges, flags = [], record = null)`; `.card-flag` list items carrying `data-family="flags"` and `data-flag-record`; the Taxonomy section `[data-reviewed-flags]`. Task 7 reuses the e2e fixture helpers by copying them.

Boot carries a found statement's `tier_term`, `domains`, `determination`, and `scope` (Task 4), so a card paints the full tooltip and hidden text from boot. It never fetches the model's detail file to paint a flag.

- [ ] **Step 1: Write the failing browser tests**

Create `tests/e2e/reviewed-flags.spec.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { cardBadges, flagEmblemText, badgeLegend } = require("../../web/app-core.js");

// No published model carries a flag until the ADR 039 backfill lands, so these
// tests serve one, shaped as the payload builder shapes it: boot carries each
// entry's kind and status plus a found statement's term, domains,
// determination, and scope; the model's detail file carries the whole entry.
// The fixture quotes no real developer.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
const read = file => JSON.parse(fs.readFileSync(path.join(WEB_DIR, file), "utf8"));
const taxonomy = read("taxonomy.json");
const allModels = read("app/models.json").models;
const byId = id => {
  const record = allModels.find(candidate => candidate.id === id);
  if (!record) throw new Error(`fixture ${id} is no longer published; pick another record of the same kind`);
  return record;
};
const FLAGGED = byId("model-anthropic-claude-sonnet-4-6");
const CHECKED = byId("model-alibaba-qwen2-5-coder-0-5b");
const UNEXAMINED = byId("model-alibaba-qwen3-235b-a22b-instruct-2507");
const IMPORTED = byId("model-alibaba-qwen-flash");

const FOUND = {
  kind: "maker_risk_safeguards", status: "statement_found", tier_term: "Fixture Level 3",
  domains: ["cyber", "bio_chem"], determination: "precautionary", scope: "weights",
  statement: "Fixture statement for the browser suite; it quotes no real developer.",
  url: "https://example.com/fixture-system-card", content_sha256: "a".repeat(64),
  verified_at: "2026-09-01", research_confidence: "high",
};
const NONE = { kind: "maker_risk_safeguards", status: "no_statement_found", url: "https://example.com/fixture-framework", verified_at: "2026-09-01", research_confidence: "medium" };
const BOOT_KEYS = {
  statement_found: ["kind", "status", "tier_term", "domains", "determination", "scope"],
  no_statement_found: ["kind", "status"],
};
const bootEntry = entry => Object.fromEntries(BOOT_KEYS[entry.status].map(key => [key, entry[key]]));

async function serveFlags(page, entries, { detail = true } = {}) {
  await page.route("**/app/models.json*", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const models = payload.models.map(model => entries[model.id]
      ? { ...model, flags: [bootEntry(entries[model.id])] }
      : model);
    await route.fulfill({ response, json: { ...payload, models } });
  });
  for (const [id, entry] of Object.entries(entries)) {
    await page.route(`**/app/detail/model/${id}.json*`, async route => {
      if (!detail) return route.abort();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, flags: [entry] } });
    });
  }
}

const modelCard = (page, record) => page.locator(`#model-grid .model-card:has([data-model="${record.id}"])`);

async function showModel(page, record) {
  await page.goto("/?view=models");
  await page.locator("#model-search").fill(record.name);
  await expect(modelCard(page, record)).toBeVisible();
}

// Hover races the page's smooth scrolling (see card-badges.spec.js), so scroll
// the emblem into view and let the scroll settle first.
async function settleOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => {
    let last = window.scrollY;
    const check = () => requestAnimationFrame(() => {
      if (window.scrollY === last) return resolve();
      last = window.scrollY;
      check();
    });
    check();
  }));
}

test("a found statement leads a reviewed-model card's badge row, outside the badge cap", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await showModel(page, FLAGGED);
  const card = modelCard(page, FLAGGED);
  await expect(card.locator(".card-badges > li").first()).toHaveAttribute("data-family", "flags");
  await expect(card.locator(".card-flag")).toHaveCount(1);
  await expect(card.locator(".card-badge:not(.card-flag)")).toHaveCount(cardBadges("model", FLAGGED).length);
  const expected = flagEmblemText(FOUND, FLAGGED.developer, taxonomy);
  await expect(card.locator(".card-flag .visually-hidden")).toHaveText(expected.sentence);
  await expect(card.locator(".card-flag svg.badge-emblem")).toHaveCount(1);
  await expect(card.locator(".card-flag")).not.toHaveAttribute("tabindex");
});

test("hovering the flag shows the family, the developer's term, and the sentence", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await showModel(page, FLAGGED);
  const emblem = modelCard(page, FLAGGED).locator(".card-flag");
  const expected = flagEmblemText(FOUND, FLAGGED.developer, taxonomy);
  await expect(emblem.locator(".visually-hidden")).toHaveText(expected.sentence);
  await settleOn(page, emblem);
  await emblem.hover();
  const tooltip = page.locator("#badge-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".badge-tooltip-family")).toHaveText("Maker risk statement");
  await expect(tooltip.locator(".badge-tooltip-name")).toHaveText("“Fixture Level 3” · Precautionary");
  await expect(tooltip.locator(".badge-tooltip-definition")).toHaveText(expected.sentence);
  await expect(tooltip).not.toContainText(/high risk|dangerous/i);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});

test("the flag paints its full words from boot without fetching the model's detail", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND }, { detail: false });
  let flaggedDetailRequests = 0;
  page.on("request", request => { if (request.url().includes(`/app/detail/model/${FLAGGED.id}.json`)) flaggedDetailRequests += 1; });
  await showModel(page, FLAGGED);
  const flag = modelCard(page, FLAGGED).locator(".card-flag");
  await expect(flag.locator(".visually-hidden")).toHaveText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(flag).toHaveAttribute("data-name", "“Fixture Level 3” · Precautionary");
  expect(flaggedDetailRequests).toBe(0);
});

test("no statement, not examined, and imported models paint no flag", async ({ page }) => {
  await serveFlags(page, { [CHECKED.id]: NONE });
  await showModel(page, CHECKED);
  await expect(modelCard(page, CHECKED).locator(".card-flag")).toHaveCount(0);
  await page.locator("#model-search").fill(UNEXAMINED.name);
  await expect(modelCard(page, UNEXAMINED).locator(".card-flag")).toHaveCount(0);
  await page.locator("#model-search").fill(IMPORTED.name);
  await expect(modelCard(page, IMPORTED)).toBeVisible();
  await expect(modelCard(page, IMPORTED).locator(".card-badges")).toHaveCount(0);
});

test("the mixed All grid shows the same flag", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await page.goto("/");
  await page.locator("#all-directory-search").fill(FLAGGED.name);
  const card = page.locator(`#all-directory-grid .project-card:has([data-model="${FLAGGED.id}"])`);
  await expect(card.locator(".card-badges > li").first()).toHaveAttribute("data-family", "flags");
  await expect(card.locator(".card-flag .visually-hidden")).toHaveText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
});

test("the Models legend leads with the flag and the All legend names its family", async ({ page }) => {
  await page.goto("/?view=models");
  const first = page.locator("#badge-legend-items > li").first();
  await expect(first).toHaveAttribute("data-family", "flags");
  await expect(first).toContainText("Maker risk statement");
  expect(badgeLegend("models").badges[0].id).toBe("maker_risk_safeguards");
  await page.goto("/");
  await expect(page.locator("#badge-legend-items > li").last()).toContainText("Maker risk statement");
});

test("Taxonomy lists reviewed flags in their own group with the emblem", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  const group = page.locator("#taxonomy-content [data-reviewed-flags]");
  await expect(group.locator("h2")).toHaveText("Reviewed flags");
  await expect(group.locator(".taxonomy-item strong")).toHaveText(["Maker risk statement"]);
  await expect(group.locator('.taxonomy-item[data-family="flags"] svg.badge-emblem')).toHaveCount(1);
  for (const heading of ["Reviewed flag states", "Risk areas", "What the developer states", "What a statement covers"]) {
    await expect(page.locator("#taxonomy-content h2", { hasText: heading })).toHaveCount(1);
  }
  await expect(page.locator("#taxonomy-content")).toContainText("Not examined");
  await expect(page.locator("#taxonomy-content [data-badge-family] .card-flag, #taxonomy-content [data-badge-family] [data-family=\"flags\"]")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the browser tests to verify they fail**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/reviewed-flags.spec.js`
Expected: FAIL: no `.card-flag` elements and no `[data-reviewed-flags]` group. (The legend test may already pass after Task 5; that is fine.)

- [ ] **Step 3: Implement in `web/app.js`**

3a. Replace `badgeRow` and its comment with:

```js
// Badges replace the tags row on system, inference-service, local-runtime, and
// reviewed-model cards. Each is an icon-only emblem whose frame names its
// family; the name and definition ride in visually hidden text for screen
// readers and in data attributes for the pointer tooltip. Badges are never
// controls and take no tab stop. Reviewed flags (ADR 039) lead the row,
// outside the badge cap; see flagItem.
function badgeRow(badges, flags = [], record = null) {
  if (!badges.length && !flags.length) return "";
  return `<ul class="card-badges" role="list">${flags.map(flag => flagItem(flag, record)).join("")}${badges.map(badge => `<li class="card-badge" data-badge="${escapeHTML(badge.id)}" data-family="${escapeHTML(badge.family)}" data-name="${escapeHTML(badge.name)}" data-definition="${escapeHTML(badge.definition)}">${AtlasCore.badgeEmblem(badge.id)}<span class="visually-hidden">${escapeHTML(badge.name)}: ${escapeHTML(badge.definition)}</span></li>`).join("")}</ul>`;
}

// A flag's hidden text is its tooltip sentence. Boot carries a found
// statement's term, domains, determination, and scope (ADR 039), so the card
// paints the developer's own words without waiting for the detail file.
function flagItem(flag, record) {
  const text = AtlasCore.flagEmblemText(flag.entry, record.developer, state.taxonomy);
  return `<li class="card-badge card-flag" data-badge="${escapeHTML(flag.id)}" data-family="${escapeHTML(flag.family)}" data-flag-record="${escapeHTML(record.id)}" data-name="${escapeHTML(text.name)}" data-definition="${escapeHTML(text.sentence)}">${AtlasCore.badgeEmblem(flag.id)}<span class="visually-hidden">${escapeHTML(text.sentence)}</span></li>`;
}
```

3b. In both reviewed-model card templates (the `kind === "model"` branch of `renderAllDirectoryEntries` and `COLLECTIONS.models.card`), replace `${badgeRow(AtlasCore.cardBadges("model", record))}` and `${badgeRow(AtlasCore.cardBadges("model", model))}` respectively with:

```js
        ${badgeRow(AtlasCore.cardBadges("model", record), AtlasCore.cardFlags("model", record), record)}
```

```js
        ${badgeRow(AtlasCore.cardBadges("model", model), AtlasCore.cardFlags("model", model), model)}
```

3c. In `renderTaxonomy`, after `badgeGroups`, add:

```js
  // Reviewed flags (ADR 039): the kind with its emblem, then the vocabularies a
  // flag entry uses. "Not examined" is a state, not a stored value.
  const flagFamily = AtlasCore.BADGE_FAMILIES[AtlasCore.FLAG_FAMILY];
  const flagGroups = [
    ["Reviewed flags", (state.taxonomy.flag_kinds || []).map(kind => ({
      name: kind.name,
      definition: kind.definition,
      emblem: Object.hasOwn(AtlasCore.REVIEWED_FLAGS, kind.id) ? AtlasCore.badgeEmblem(kind.id) : "",
      family: AtlasCore.FLAG_FAMILY,
    })), { lede: flagFamily.meaning, reviewedFlags: true }],
    ["Reviewed flag states", [...(state.taxonomy.flag_statuses || []), { name: "Not examined", definition: "No entry exists yet for this release. Its record says “Not yet examined.”" }]],
    ["Risk areas", state.taxonomy.flag_domains || []],
    ["What the developer states", state.taxonomy.flag_determinations || []],
    ["What a statement covers", state.taxonomy.flag_scopes || []],
  ];
```

Insert `...flagGroups,` into `groups` directly after the `["Model-access score", …]` entry. In the final `innerHTML` template, change `<section class="taxonomy-group"${extra.badgeFamily ? … : ""}>` to also emit the new attribute:

```js
`<section class="taxonomy-group"${extra.badgeFamily ? ` data-badge-family="${escapeHTML(extra.badgeFamily)}"` : ""}${extra.reviewedFlags ? " data-reviewed-flags" : ""}>`
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/usr/local/bin/node --check web/app.js && /usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

Run the regeneration sequence:

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
/usr/local/bin/node scripts/build_asset_version.mjs
uv run python scripts/build_blog.py
```

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/reviewed-flags.spec.js tests/e2e/card-badges.spec.js tests/e2e/badge-legend.spec.js tests/e2e/deferred-data.spec.js tests/e2e/page-health.spec.js`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes, browser suite included.

```bash
git add web/app.js web/index.html web/blog tests/e2e/reviewed-flags.spec.js
git commit -m "$(cat <<'EOF'
Show the maker-risk flag on reviewed-model cards and in Taxonomy

ADR 039: a found statement leads the badge row outside the cap, with the
developer's term, determination, domains, and scope in the tooltip and
hidden text, painted from boot. Taxonomy gains Reviewed flags.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Risk statements section in the dialog and on share pages

**Files:**
- Modify: `web/app.js` (new `riskStatementsMarkup`; `modelDialogMarkup`)
- Modify: `web/styles.css` (quote style)
- Modify: `scripts/build_share_pages.py` (constants, `risk_statements_html`, `render_page`)
- Modify: `docs/WEB.md` ("Reviewed flags" subsection, "Card badges" pointer, legend paragraph, behavioral contracts, browser matrix)
- Test: `tests/e2e/reviewed-flags.spec.js` (append), `tests/test_share_pages.py`
- Generated: `web/records/models/*/index.html` (every reviewed model gains the section), asset stamp, blog pages

**Interfaces:**
- Consumes: `AtlasCore.riskStatementView` (Task 5); boot and detail flags (Task 4); the e2e helpers `serveFlags`, `FLAGGED`, `CHECKED`, `UNEXAMINED`, `IMPORTED`, `FOUND`, `NONE`, `taxonomy`, `flagEmblemText` already in `tests/e2e/reviewed-flags.spec.js` (Task 6).
- Produces: dialog `section.detail-block[data-risk]` with `data-risk` one of `statement_found`, `no_statement_found`, `not_examined`, `pending`; share-page `section.risk-statements`; `risk_statements_html(record: dict, taxonomy: dict) -> str` in `scripts/build_share_pages.py`.

- [ ] **Step 1: Write the failing tests**

1a. Append to `tests/e2e/reviewed-flags.spec.js`:

```js
const riskSection = page => page.locator("#model-dialog-content section[data-risk]");

test("a found statement is quoted in the dialog with its link, date, confidence, and scope", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND });
  await page.goto(`/?record=model:${FLAGGED.id}`);
  const section = page.locator('#model-dialog-content section[data-risk="statement_found"]');
  await expect(section.locator("h3")).toHaveText("Risk statements");
  await expect(section).toContainText("“Fixture Level 3” · Precautionary");
  await expect(section.locator("blockquote")).toHaveText(FOUND.statement);
  await expect(section).toContainText("Risk areas: Cyber · Biological or chemical");
  await expect(section).toContainText("Covers: The model itself");
  await expect(section.locator("a")).toHaveAttribute("href", FOUND.url);
  await expect(section).toContainText("2026-09-01");
  await expect(section).toContainText("Research confidence: High");
  await expect(section).toContainText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(section).not.toContainText(/high risk|dangerous/i);
});

test("the dialog says when the developer publishes no statement, and when nobody has looked", async ({ page }) => {
  await serveFlags(page, { [CHECKED.id]: NONE });
  await page.goto(`/?record=model:${CHECKED.id}`);
  const none = page.locator('#model-dialog-content section[data-risk="no_statement_found"]');
  await expect(none).toContainText("The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety.");
  await expect(none.locator("a")).toHaveAttribute("href", NONE.url);
  await expect(none).toContainText("Research confidence: Medium");

  await page.goto(`/?record=model:${UNEXAMINED.id}`);
  await expect(page.locator('#model-dialog-content section[data-risk="not_examined"]')).toContainText("Not yet examined.");
});

test("a found statement whose detail never arrives never reads as unexamined", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND }, { detail: false });
  await page.goto(`/?record=model:${FLAGGED.id}`);
  // Boot already carries the term, domains, determination, and scope; only the
  // quote, link, date, and confidence wait for the detail file.
  const pending = page.locator('#model-dialog-content section[data-risk="pending"]');
  await expect(pending).toContainText("“Fixture Level 3” · Precautionary");
  await expect(pending).toContainText("Risk areas: Cyber · Biological or chemical");
  await expect(pending).toContainText(flagEmblemText(FOUND, FLAGGED.developer, taxonomy).sentence);
  await expect(pending.locator("blockquote")).toHaveCount(0);
  await expect(page.locator('#model-dialog-content section[data-risk="not_examined"]')).toHaveCount(0);
});

test("imported models show no Risk statements section", async ({ page }) => {
  await page.goto(`/?record=model:${IMPORTED.id}`);
  await expect(page.locator("#model-dialog-content h1")).toHaveText(IMPORTED.name);
  await expect(riskSection(page)).toHaveCount(0);
  await expect(page.locator("#model-dialog-content")).not.toContainText("Risk statements");
});

test("a flag never enters a model comparison", async ({ page }) => {
  await serveFlags(page, { [FLAGGED.id]: FOUND, [CHECKED.id]: NONE });
  await page.goto(`/?view=models&compare=model:${FLAGGED.id},${CHECKED.id}`);
  const table = page.locator("#comparison-dialog-content .comparison-table");
  await expect(table).toBeVisible();
  await expect(table).not.toContainText("Fixture Level 3");
  await expect(table).not.toContainText("Risk statements");
  await expect(table).not.toContainText("risk-threshold");
});
```

1b. Add to `tests/test_share_pages.py`: `import copy` and `import html` at the top, and these tests in `SharePageTests`:

```python
    FOUND = {
        "kind": "maker_risk_safeguards",
        "status": "statement_found",
        "tier_term": "Fixture Level 3",
        "domains": ["cyber", "bio_chem"],
        "determination": "precautionary",
        "scope": "weights",
        "statement": "A fixture sentence standing in for a developer's verbatim words.",
        "url": "https://www.example-lab.com/system-card",
        "content_sha256": "a" * 64,
        "verified_at": "2026-09-01",
        "research_confidence": "high",
    }
    NONE = {
        "kind": "maker_risk_safeguards",
        "status": "no_statement_found",
        "url": "https://www.example-lab.com/safety",
        "verified_at": "2026-09-01",
        "research_confidence": "medium",
    }

    def page_with_flag(self, entry: dict) -> tuple[dict, str]:
        catalog = copy.deepcopy(self.catalog)
        model = catalog["models"][0]
        model["flags"] = [dict(entry)]
        return model, build_pages(catalog)[f"records/models/{model['id']}/index.html"]

    def test_every_reviewed_model_page_has_a_risk_statements_section(self) -> None:
        for model in self.catalog["models"]:
            page = self.pages[f"records/models/{model['id']}/index.html"]
            self.assertIn('<h2 id="risk-statements">Risk statements</h2>', page)
            if "flags" not in model:
                self.assertIn("<p>Not yet examined.</p>", page)
        self.assertNotIn("Risk statements", self.pages["records/systems/kilo-code/index.html"])

    def test_a_found_statement_is_quoted_with_its_link_date_confidence_and_scope(self) -> None:
        model, page = self.page_with_flag(self.FOUND)
        sentence = (
            f"{model['developer']} names this release against “Fixture Level 3” in cyber "
            "and biological or chemical capability, as a precaution. The statement covers "
            "the model itself. This is the developer's own statement, not an Atlas risk rating."
        )
        self.assertIn("<strong>“Fixture Level 3” · Precautionary</strong>", page)
        self.assertIn(f"<blockquote>{html.escape(self.FOUND['statement'])}</blockquote>", page)
        self.assertIn("<dt>Risk areas</dt><dd>Cyber · Biological or chemical</dd>", page)
        self.assertIn("<dt>Covers</dt><dd>The model itself</dd>", page)
        self.assertIn(f'href="{self.FOUND["url"]}"', page)
        self.assertIn("2026-09-01 · Research confidence: High", page)
        self.assertIn(html.escape(sentence), page)
        self.assertNotRegex(page.lower(), "high risk|dangerous")

    def test_no_statement_reads_as_absence_not_safety(self) -> None:
        _, page = self.page_with_flag(self.NONE)
        self.assertIn(
            "<p>The developer publishes no risk-threshold statement for this release. "
            "Absence is not evidence of safety.</p>",
            page,
        )
        self.assertIn(f'href="{self.NONE["url"]}"', page)
        self.assertIn("Research confidence: Medium", page)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_share_pages -v`
Expected: FAIL: no "Risk statements" heading on any page.

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/reviewed-flags.spec.js`
Expected: the five new tests FAIL (no `section[data-risk]`); the comparison test may pass already, which is expected.

- [ ] **Step 3: Implement the dialog section**

3a. In `web/app.js`, directly above `function modelDialogMarkup`, add:

```js
// The three states of ADR 039's maker-risk flag, in the developer's own words.
// Boot knows the state and, for a found statement, its term, domains,
// determination, and scope; the quote, link, date, and confidence arrive with
// detail. Until then the section says what boot knows, so a found statement
// never reads as "not examined".
function riskStatementsMarkup(model) {
  const view = AtlasCore.riskStatementView(model, state.taxonomy);
  if (!view) return "";
  const heading = "<h3>Risk statements</h3>";
  const source = view.url
    ? `<p><a href="${escapeHTML(view.url)}" target="_blank" rel="noreferrer">${view.state === "statement_found" ? "Read the developer's statement" : "Page the reviewer checked"} ↗</a> <span class="evidence-date">${escapeHTML(view.verifiedAt)}</span> · Research confidence: ${escapeHTML(view.confidence)}</p>`
    : "";
  if (view.state === "not_examined") return `<section class="detail-block" data-risk="not_examined">${heading}<p>${escapeHTML(view.text)}</p></section>`;
  if (view.state === "no_statement_found") return `<section class="detail-block" data-risk="no_statement_found">${heading}<p>${escapeHTML(view.text)}</p>${source}</section>`;
  const quote = view.pending ? "" : `<blockquote class="risk-quote">${escapeHTML(view.statement)}</blockquote>`;
  return `<section class="detail-block" data-risk="${view.pending ? "pending" : "statement_found"}">${heading}<p><strong>${escapeHTML(view.heading)}</strong></p>${quote}<p><strong>Risk areas:</strong> ${escapeHTML(view.domains)}</p><p><strong>Covers:</strong> ${escapeHTML(view.scope)}</p>${source}<p class="unscored-note">${escapeHTML(view.sentence)}</p></section>`;
}
```

3b. In `modelDialogMarkup`, insert `${riskStatementsMarkup(model)}` on its own line directly after the `<section class="detail-block"><h3>Model boundary</h3>…</section>` line.

3c. In `web/styles.css`, after the `.detail-block h4 { … }` rule, add:

```css
.detail-block .risk-quote { margin: .6rem 0; padding: .1rem 0 .1rem .9rem; border-left: 3px solid var(--line-strong); color: var(--text); }
```

- [ ] **Step 4: Implement the share-page section in `scripts/build_share_pages.py`**

4a. After `COLLECTION_LABELS`, add:

```python
# ADR 039: the reviewed-model share page carries the same "Risk statements"
# section as the dialog, in the same words (web/app-core.js riskStatementView).
MAKER_RISK_FLAG = "maker_risk_safeguards"
FLAG_DISCLAIMER = "This is the developer's own statement, not an Atlas risk rating."
FLAG_NO_STATEMENT_TEXT = (
    "The developer publishes no risk-threshold statement for this release. "
    "Absence is not evidence of safety."
)
FLAG_NOT_EXAMINED_TEXT = "Not yet examined."
RISK_STYLE = """
.risk-statements { margin: 0 0 1.5rem; }
.risk-statements h2 { margin: 0 0 .5rem; font: 600 1.15rem/1.3 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
.risk-statements p { margin: 0 0 .5rem; }
.risk-statements blockquote { margin: 0 0 .75rem; padding: .1rem 0 .1rem 1rem; border-left: 3px solid var(--line); }
.risk-statements dl { margin: 0 0 .75rem; }
""".strip()
```

4b. After `names(...)`, add:

```python
def _join_plain(items: list[str]) -> str:
    if len(items) < 2:
        return "".join(items)
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def flag_sentence(entry: dict, developer: str, taxonomy: dict) -> str:
    """The same sentence web/app-core.js flagSentence builds for a loaded entry."""
    domains = _join_plain(
        [taxonomy_name(taxonomy, "flag_domains", item).lower() for item in entry["domains"]]
    )
    if entry["determination"] == "determined":
        claim = f"{developer} states that this release reached “{entry['tier_term']}” in {domains} capability."
    else:
        claim = f"{developer} names this release against “{entry['tier_term']}” in {domains} capability, as a precaution."
    scope = taxonomy_name(taxonomy, "flag_scopes", entry["scope"])
    return f"{claim} The statement covers {scope[:1].lower()}{scope[1:]}. {FLAG_DISCLAIMER}"


def risk_statements_html(record: dict, taxonomy: dict) -> str:
    """The reviewed-model "Risk statements" section in one of its three states."""
    entry = next(
        (item for item in record.get("flags", []) if item.get("kind") == MAKER_RISK_FLAG),
        None,
    )
    if entry is None:
        body = f"<p>{FLAG_NOT_EXAMINED_TEXT}</p>"
    else:
        confidence = taxonomy_name(
            taxonomy, "research_confidence_levels", entry["research_confidence"]
        )
        label = (
            "Read the developer's statement"
            if entry["status"] == "statement_found"
            else "Page the reviewer checked"
        )
        source = (
            f'<p class="note"><a href="{html.escape(entry["url"])}" rel="noreferrer">'
            f"{html.escape(label)} ↗</a> · {html.escape(entry['verified_at'])} · "
            f"Research confidence: {html.escape(confidence)}</p>"
        )
        if entry["status"] == "no_statement_found":
            body = f"<p>{FLAG_NO_STATEMENT_TEXT}</p>{source}"
        else:
            determination = taxonomy_name(
                taxonomy, "flag_determinations", entry["determination"]
            )
            domains = " · ".join(
                taxonomy_name(taxonomy, "flag_domains", item) for item in entry["domains"]
            )
            scope = taxonomy_name(taxonomy, "flag_scopes", entry["scope"])
            sentence = flag_sentence(entry, record["developer"], taxonomy)
            body = (
                f"<p><strong>“{html.escape(entry['tier_term'])}” · {html.escape(determination)}</strong></p>"
                f"<blockquote>{html.escape(entry['statement'])}</blockquote>"
                f"<dl><dt>Risk areas</dt><dd>{html.escape(domains)}</dd>"
                f"<dt>Covers</dt><dd>{html.escape(scope)}</dd></dl>"
                f'{source}<p class="note">{html.escape(sentence)}</p>'
            )
    return (
        '<section class="risk-statements" aria-labelledby="risk-statements">'
        f'<h2 id="risk-statements">Risk statements</h2>{body}</section>'
    )
```

4c. In `render_page`, before the `return f"""<!doctype html>` line, add:

```python
    risk_html = risk_statements_html(record, taxonomy) if kind == "model" else ""
```

and in the returned template change `<dl>{facts_html}</dl>` to `<dl>{facts_html}</dl>\n{risk_html}` and the `<style>` body from `{STYLE}` to `{STYLE}\n{RISK_STYLE}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run the regeneration sequence (every reviewed-model share page changes):

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
/usr/local/bin/node scripts/build_asset_version.mjs
uv run python scripts/build_blog.py
```

Run: `uv run python -m unittest tests.test_share_pages -v && /usr/local/bin/node --check web/app.js && /usr/local/bin/node --test tests/test_web.js`
Expected: PASS.

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/reviewed-flags.spec.js tests/e2e/deferred-data.spec.js tests/e2e/models.spec.js tests/e2e/share-pages.spec.js tests/e2e/record-links.spec.js`
Expected: PASS.

- [ ] **Step 6: Document the site behaviour in `docs/WEB.md`**

6a. In "### Card badges", replace the paragraph beginning "A triangle emblem frame is reserved for a possible future tier of reviewed flags" with:

```markdown
Reviewed flags are a separate tier drawn on the triangle frame; they are not badges and do not follow this contract. See "Reviewed flags" below.
```

6b. In the legend paragraph of "### Card badges" (as amended by the model-distribution-badges PR), change "only the three families, not individual badges, in All and Agent packs; the model set in Models;" to "only the families, not individual badges, in All and Agent packs, where All also names the reviewed-flags family because reviewed-model cards appear there; the reviewed flag and then the model set in Models;".

6c. Insert this subsection directly after "### Card badges" and before "## Behavioral contracts":

```markdown
### Reviewed flags

A reviewed flag records one kind of first-party statement a record's steward publishes about it, in the steward's own words, never an Atlas verdict ([ADR 039](adr/039-reviewed-flags-record-a-makers-risk-statement.md)). The only kind is `maker_risk_safeguards`, on reviewed models: `flags` entries in `directory/models.json`, named in the `flag_*` groups of `directory/taxonomy.json`. A flag never affects inclusion, score, rank, sort, search, the Finder, or comparison, and there is no flag filter and no caution notice.

- Flags reuse the emblem drawing but not the badge contract. `cardFlags()` in `web/app-core.js` paints an emblem only for a `statement_found` entry, in the `flags` family of `BADGE_FAMILIES`: the triangle frame, an exclamation glyph, and `--danger`, a token no other component uses. It leads the card's badge row, outside `MAX_CARD_BADGES`, in Models and in All. A `no_statement_found` entry or an absent one paints nothing on the card; imported models never carry a flag.
- The boot payload carries each entry's `kind` and `status`, plus a found statement's `tier_term`, `domains`, `determination`, and `scope` (`BOOT_ITEM_FIELDS` in `scripts/build_web_payload.py`), which is enough to paint and explain the emblem; the quote, link, hash, and dates live in the model's detail file. A card therefore paints its flag's full words from boot and never fetches detail to do it. `flagEmblemText()` builds them.
- The tooltip gives the family ("Maker risk statement"), the developer's term with the determination, and a sentence naming the developer, the domains, and the scope that ends "This is the developer's own statement, not an Atlas risk rating." The visually hidden text is the same sentence. No card, tooltip, dialog, or share page uses "high risk", "dangerous", or any other Atlas word for the result.
- Every reviewed-model dialog and share page has a "Risk statements" section in one of three states, built by `riskStatementView()` in the app and `risk_statements_html()` in `scripts/build_share_pages.py`, which must say the same words: the quoted statement with its link, date, confidence, and scope; "The developer publishes no risk-threshold statement for this release. Absence is not evidence of safety."; or "Not yet examined." Until the detail file lands, a found statement shows its term, domains, and scope from boot without the quote or link, and never reads as not examined.
- The Models legend leads with the flag, the All legend names the flag family beside the three badge families, and Taxonomy lists "Reviewed flags" with the flag vocabularies.
```

6d. In "## Behavioral contracts", in the bullet beginning "Reviewed model details distinguish imported models.dev facts", change "source links, and reviewed evidence." to "source links, reviewed evidence, and the Risk statements section described under "Reviewed flags"." In the bullet beginning "Every record has a static share page", change "A share page shows identity, licensing, and status facts" to "A share page shows identity, licensing, and status facts, plus the Risk statements section on a reviewed model's page,".

6e. Append to the browser matrix in "## Verification", after step 34:

```markdown
35. open several reviewed-model dialogs and share pages and confirm each has a Risk statements section; until the flag backfill lands, confirm it reads "Not yet examined." everywhere, that imported model dialogs have no such section, that the Models legend leads with "Maker risk statement", that the All legend names the flag family and the Agent packs legend does not, and that Taxonomy lists Reviewed flags with its triangle emblem in both palettes; once a reviewed model carries a flag, confirm its triangle emblem leads the card's badge row in Models and All in both palettes, hover and tap it for the tooltip, confirm Tab never lands on it, confirm the dialog and share page quote the statement with its link, date, confidence, and scope, and confirm a `no_statement_found` model says "Absence is not evidence of safety." and shows no emblem.
```

- [ ] **Step 7: Verify and commit**

Run: `pre-commit run --all-files`
Expected: every hook passes, browser suite included.

```bash
git add web/app.js web/styles.css web/index.html web/blog web/records web/sitemap.xml scripts/build_share_pages.py tests/e2e/reviewed-flags.spec.js tests/test_share_pages.py docs/WEB.md
git commit -m "$(cat <<'EOF'
Add a Risk statements section to reviewed-model dialogs and share pages

ADR 039: every reviewed model says which of three states its maker-risk
flag is in, quoting a found statement with its link, date, confidence, and
scope. WEB.md gains the Reviewed flags subsection and a matrix step.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Contract amendments and acceptance

**Files:**
- Modify: `AGENTS.md` (rule 8)
- Modify: `skills/ai-systems-atlas/reference.md` (`models.json` fields; taxonomy groups)
- Modify: `BACKLOG.md` (the ADR 039 item)
- Modify: `docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md` (Status)
- Test: `tests/test_documentation.py` (existing link and routing checks)

**Interfaces:**
- Consumes: everything above.
- Produces: the accepted record and the documentation agents read.

- [ ] **Step 1: Amend AGENTS.md rule 8**

Replace rule 8 with:

```markdown
8. Keep editorial fields human-owned: automation cannot create, change, or clear classifications, prose, scores, evidence, confidence, trust records, reviewed flags, or `verified_at`.
```

- [ ] **Step 2: Document the published field in `skills/ai-systems-atlas/reference.md`**

2a. In "## `models.json` record fields", change the field list line to end `…, evidence, metadata_verified_at, verified_at, flags` and add this paragraph after the paragraph that follows it:

```markdown
`flags` is optional and never scored. Each entry records a developer's own risk-threshold statement about this release, never an Atlas rating: `{kind: "maker_risk_safeguards", status: "statement_found", tier_term, domains, determination, scope, statement, url, content_sha256 | unpinnable, verified_at, research_confidence}`, or `{kind, status: "no_statement_found", url, verified_at, research_confidence}` when the developer's system card, model page, and framework page name no threshold for it. `tier_term` and `statement` are the developer's own words; `domains`, `determination`, and `scope` come from the `flag_domains`, `flag_determinations`, and `flag_scopes` taxonomy groups. An absent field means the release has not been examined, and `no_statement_found` is not evidence of safety. See [docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md](../../docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md).
```

2b. In "## `taxonomy.json` top-level groups", insert `flag_kinds, flag_statuses, flag_domains, flag_determinations, flag_scopes, ` directly after `model_distribution_modes, `.

- [ ] **Step 3: Groom the backlog item**

In `BACKLOG.md`, replace the item beginning "- [ ] Implement ADR 039", which is the reviewed-flags implementation item, with:

```markdown
- [ ] Backfill `maker_risk_safeguards` flags ([ADR 039](docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md), implemented; every reviewed model reads "Not yet examined." until its batch lands). Work in batches, developers that publish a risk framework first, then the rest with `no_statement_found` entries naming the page checked. Re-fetch every URL and quote by hand, pin each page with `uv run python scripts/check_evidence_links.py --pin URL`, and merge main right before each batch's PR. The review checklist and the evidence rules are in [`docs/MODELS.md`](docs/MODELS.md) "Review workflow" step 7 and [`docs/OPERATIONS.md`](docs/OPERATIONS.md) "Evidence links and terms drift".
```

- [ ] **Step 4: Accept the ADR**

In `docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md`, change `- Status: Proposed` to `- Status: Accepted`.

- [ ] **Step 5: Verify**

Run: `uv run python -m unittest tests.test_documentation tests.test_skill -v`
Expected: PASS (relative links resolve; the reference still exists).

Run: `uv run python scripts/build_web_payload.py --check && uv run python scripts/build_share_pages.py --check && /usr/local/bin/node scripts/build_asset_version.mjs --check && uv run python scripts/build_blog.py --check`
Expected: all up to date.

Run: `pre-commit run --all-files`
Expected: every hook passes, browser suite included.

Before opening the PR, fetch `origin/main` and list `docs/adr/` there; if another branch has taken number 039 for a different slug, renumber by slug and update only this branch's own bare references.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md skills/ai-systems-atlas/reference.md BACKLOG.md docs/adr/039-reviewed-flags-record-a-makers-risk-statement.md
git commit -m "$(cat <<'EOF'
Accept ADR 039 and amend rule 8 and the agent reference for flags

AGENTS.md rule 8 adds reviewed flags to the fields automation never
touches; the agent reference documents the optional flags field and the
five flag vocabularies; the backlog keeps only the backfill.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage (self-review against ADR 039)

| ADR 039 requirement | Task |
|---|---|
| One kind, `maker_risk_safeguards`, reviewed models only; kinds name their collections | 1 (taxonomy `collections`, validator) |
| Three states; "not examined" is absence of an entry | 1 (non-empty list rule), 5 (`riskStatementView`), 7 (dialog, share page) |
| `tier_term`, `domains`, `determination`, `scope`, `statement`; no Atlas word | 1, 5 (tests forbid the words), 6, 7 |
| Statement attaches only to this release; models.dev never establishes a flag | 1 (models.dev repository excluded from first-party sites; rows refuse flags), 2 (review checklist) |
| Exact shapes, `unpinnable` in place of `content_sha256`, first-party URL, allowed collections, `verified_at` ordering | 1 |
| Drift-monitored flag pages; unpinnable link-checked; drift never rewrites a flag | 3 |
| Review age reads flag `verified_at` | 3 |
| Line-update checklist gains flags; revisions updated in place | 2 |
| Owner decides kinds; reviewers decide entries; rule 8 | 2 (MODELS.md), 8 (AGENTS.md) |
| New reviews and line updates record an examined entry | 2 (promotion guard for new reviews; MODELS.md rule for line updates) |
| Reviewer checklist (release, verbatim, determination and scope, three pages) | 2 |
| `flags` family: triangle, exclamation, `--danger`, both palettes, unused elsewhere, distinct from accents | 5 |
| Found flag first in the badge row, outside the cap; tooltip family, term, determination, sentence and disclaimer; hidden text the same | 6 |
| Risk statements section in dialog and share page, three states, exact sentences; imported show nothing | 7 |
| Models legend lists the flag; Taxonomy "Reviewed flags"; no filter, no notice | 5, 6 |
| Boot carries kind and status, plus a found statement's term, domains, determination, and scope; quote, link, hash, and dates stay in detail | 4 |
| WEB.md subsection, browser-matrix step, triangle paragraph points to it | 7 |
| DATA_MODEL.md, MODELS.md, OPERATIONS.md, agent reference | 1, 2, 3, 8 |
| No data change; backfill separate | Global Constraints; 8 (backlog) |
