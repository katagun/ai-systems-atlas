# Service Trust Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, human-owned, unscored `trust` block to inference-service records: six documentation-status properties with prose notes and scoped first-party URLs, plus dated, pinned, bounded third-party findings; validate it strictly, link-check it weekly, render it in the detail dialog and comparison table, and review the twelve routing aggregators as the first batch.

**Architecture:** The block is a new optional field on `directory/inference-services.json` records, validated by `scripts/validate_directory.py` against a new taxonomy group, collected as plain link targets by `scripts/check_evidence_links.py` (never drift-hashed), projected into the per-record detail payload by the existing complement rule in `scripts/build_web_payload.py` (no change there), and rendered by `web/app.js`. Nothing enters `score` or `overall`; ADR 029 records the decision and amends ADR 022's characterisation of published evidence.

**Tech Stack:** Python 3.11+ (`uv`, `unittest`, `ruff`), vanilla JavaScript (`web/app.js`), Node test runner, Playwright end-to-end tests, JSON catalog files synchronized into `web/`.

**Spec:** `docs/superpowers/specs/2026-09-11-service-trust-records-design.md`

## Global Constraints

- Every command runs from the repository root with `uv run` for Python and `node`/`npx` for JavaScript; see `AGENTS.md` "Commands".
- Any change to `directory/*.json` must be followed by `uv run python scripts/sync_web_data.py`, `uv run python scripts/build_web_payload.py`, `uv run python scripts/build_share_pages.py`, and `node scripts/build_asset_version.mjs`; `validate_published_copies` fails on any byte difference between `directory/` and `web/`.
- The block is unscored: it never enters `score`, `overall`, any sort, or any rank. The spec's decision 1.
- The block is human-owned: automation never adds, edits, or removes it. The spec's decision 2.
- `status` is one of `documented_yes`, `documented_no`, `undocumented`, read from `directory/taxonomy.json` group `trust_property_statuses` by both validator and app. The spec's decision 3.
- The six property keys, in this order everywhere they are listed: `response_integrity`, `upstream_disclosure`, `credential_handling`, `cache_isolation`, `vulnerability_disclosure`, `independent_audit`.
- A finding source has `kind: "third_party"` and exactly `{label, url, kind, content_sha256, fetched_at}`; `operator_response` and `resolved` are `null` or exactly `{url, verified_at, summary}`. The spec's decisions 4 and 10.
- Trust URLs are link-checked and never drift-hashed. The spec's decision 7.
- Share pages are unchanged. The spec's decision 8.
- Rendered copy, verbatim: heading `Trust record · unscored`; absent block `Not yet examined for trust properties.`; reviewed with no findings `Reviewed on {date}; no admissible third-party finding recorded. Absence of a finding is not evidence of safety.`; comparison cell for an unreviewed record `not examined`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Taxonomy group and validator shape rules

**Files:**
- Modify: `directory/taxonomy.json` (after the `inference_api_styles` group)
- Modify: `web/taxonomy.json` (via `scripts/sync_web_data.py`)
- Modify: `scripts/validate_directory.py:67-104` (`TAXONOMY_GROUPS`), `:136-141` (after `INFERENCE_SERVICE_REQUIRED`), `:967-970` (field-set check), `:1012` (after `validate_web_evidence`), plus three new functions after `validate_web_evidence`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `valid_date(value) -> bool`, `https_url_host(value) -> str | None`, `CONTENT_SHA_PATTERN`, `EVIDENCE_REQUIRED` — all already in `scripts/validate_directory.py`.
- Produces: `INFERENCE_SERVICE_OPTIONAL`, `TRUST_PROPERTIES` (tuple of the six keys in canonical order), `validate_trust_record(trust, prefix, statuses, collection_verified_at, errors) -> None`. Task 3's checker and Task 4's app rely on the field names fixed here.

- [ ] **Step 1: Add the taxonomy group**

In `directory/taxonomy.json`, immediately after the `inference_api_styles` array, add:

```json
  "trust_property_statuses": [
    {
      "id": "documented_yes",
      "name": "Documented",
      "definition": "The operator publishes a statement establishing the property for the named service."
    },
    {
      "id": "documented_no",
      "name": "Documented absent",
      "definition": "The operator publishes a statement denying the property, or stating it does not apply, for the named service."
    },
    {
      "id": "undocumented",
      "name": "Undocumented",
      "definition": "No first-party statement about the property was found on the review date."
    }
  ],
```

Then run `uv run python scripts/sync_web_data.py` so `web/taxonomy.json` matches byte for byte.

- [ ] **Step 2: Write the failing validator tests**

Add to `tests/test_validation_policy.py`, inside `ValidationPolicyTests`, after `SAMPLE_RUNTIME`:

```python
    SAMPLE_TRUST: ClassVar[dict] = {
        "verified_at": "2026-09-18",
        "properties": {
            name: {
                "status": "undocumented",
                "note": "No first-party statement was found in the API documentation.",
                "url": "https://example.com/docs",
                "scope": "Public API documentation for the named service",
                "verified_at": "2026-09-17",
            }
            for name in (
                "response_integrity", "upstream_disclosure", "credential_handling",
                "cache_isolation", "vulnerability_disclosure", "independent_audit",
            )
        },
        "findings": [
            {
                "claim": "Routing through the gateway with shared credentials may pool prompt caches across customers.",
                "published_at": "2026-05-28",
                "source": {
                    "label": "CacheProbe, arXiv 2605.30613v1",
                    "url": "https://arxiv.org/abs/2605.30613v1",
                    "kind": "third_party",
                    "content_sha256": "0" * 64,
                    "fetched_at": "2026-09-16",
                },
                "operator_response": None,
                "resolved": None,
            }
        ],
    }

    def catalog_with_trust(self, mutate) -> list[str]:
        """Validate the real catalog with the first service carrying a mutated SAMPLE_TRUST."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "inference-services.json"
        services = json.loads(path.read_text(encoding="utf-8"))
        trust = json.loads(json.dumps(self.SAMPLE_TRUST))
        mutate(trust)
        services["services"][0]["trust"] = trust
        self.write_json(path, services)
        self.write_json(root / "web" / "inference-services.json", services)
        return validate(root)

    def test_a_valid_trust_record_passes_validation(self) -> None:
        self.assertEqual([], self.catalog_with_trust(lambda trust: None))

    def test_trust_rejects_a_field_outside_its_schema(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust.update({"score": 7}))
        self.assertTrue(any("trust fields differ from schema" in error and "score" in error for error in errors), errors)

    def test_trust_properties_must_be_exactly_the_six(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust["properties"].pop("cache_isolation"))
        self.assertTrue(any("trust properties must be exactly" in error for error in errors), errors)

    def test_trust_status_must_come_from_the_taxonomy(self) -> None:
        errors = self.catalog_with_trust(
            lambda trust: trust["properties"]["cache_isolation"].update({"status": "safe"})
        )
        self.assertTrue(any("unknown trust status 'safe'" in error for error in errors), errors)

    def test_trust_property_requires_note_scope_and_public_https_url(self) -> None:
        def mutate(trust: dict) -> None:
            trust["properties"]["independent_audit"].update({"note": "", "scope": " ", "url": "https://"})
        errors = self.catalog_with_trust(mutate)
        for needle in ("note must be a non-empty string", "scope must be a non-empty string", "url must be an HTTPS URL on a public DNS host"):
            self.assertTrue(any("trust independent_audit" in error and needle in error for error in errors), errors)

    def test_trust_finding_source_must_be_a_pinned_third_party_page(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["source"].update({"kind": "web", "content_sha256": "abc"})
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("source kind must be third_party" in error for error in errors), errors)
        self.assertTrue(any("source requires a content_sha256" in error for error in errors), errors)

    def test_trust_dates_cannot_postdate_the_review(self) -> None:
        def mutate(trust: dict) -> None:
            trust["properties"]["response_integrity"]["verified_at"] = "2026-09-19"
            trust["findings"][0]["source"]["fetched_at"] = "2026-09-19"
            trust["findings"][0]["published_at"] = "2026-09-20"
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("trust response_integrity: verified_at must not be after the trust verified_at" in error for error in errors), errors)
        self.assertTrue(any("source fetched_at must not be after the trust verified_at" in error for error in errors), errors)
        self.assertTrue(any("published_at must not be after the source fetched_at" in error for error in errors), errors)

    def test_trust_review_cannot_postdate_the_collection(self) -> None:
        errors = self.catalog_with_trust(lambda trust: trust.update({"verified_at": "2099-01-01"}))
        self.assertTrue(any("trust verified_at must not be after the collection verified_at" in error for error in errors), errors)

    def test_trust_operator_response_is_null_or_complete(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["operator_response"] = {"url": "https://example.com/statement"}
        errors = self.catalog_with_trust(mutate)
        self.assertTrue(any("operator_response must be null or have exactly" in error for error in errors), errors)

    def test_trust_closure_carries_a_dated_first_party_source(self) -> None:
        def mutate(trust: dict) -> None:
            trust["findings"][0]["resolved"] = {"url": "https://example.com/fix", "verified_at": "2026-09-17", "summary": "Caches are now scoped per API key."}
        self.assertEqual([], self.catalog_with_trust(mutate))
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_validation_policy -k trust -v`
Expected: every new test FAILS. `test_a_valid_trust_record_passes_validation` fails with an error containing `fields differ from schema: missing=[], extra=['trust']`; the rest fail because the specific error strings never appear.

- [ ] **Step 4: Register the group and the constants**

In `scripts/validate_directory.py`, add `"trust_property_statuses",` to `TAXONOMY_GROUPS` immediately after `"inference_api_styles",`.

After the `INFERENCE_SERVICE_REQUIRED` block, add:

```python
INFERENCE_SERVICE_OPTIONAL = {"trust"}
TRUST_REQUIRED = {"verified_at", "properties", "findings"}
TRUST_PROPERTIES = (
    "response_integrity", "upstream_disclosure", "credential_handling",
    "cache_isolation", "vulnerability_disclosure", "independent_audit",
)
TRUST_PROPERTY_REQUIRED = {"status", "note", "url", "scope", "verified_at"}
TRUST_FINDING_REQUIRED = {"claim", "published_at", "source", "operator_response", "resolved"}
TRUST_RESPONSE_REQUIRED = {"url", "verified_at", "summary"}
```

- [ ] **Step 5: Replace the exact-set check and call the new validator**

In `validate_inference_services`, replace

```python
        if set(service) != INFERENCE_SERVICE_REQUIRED:
            missing = sorted(INFERENCE_SERVICE_REQUIRED - set(service))
            extra = sorted(set(service) - INFERENCE_SERVICE_REQUIRED)
            errors.append(f"{prefix}: fields differ from schema: missing={missing}, extra={extra}")
```

with

```python
        missing = sorted(INFERENCE_SERVICE_REQUIRED - set(service))
        extra = sorted(set(service) - INFERENCE_SERVICE_REQUIRED - INFERENCE_SERVICE_OPTIONAL)
        if missing or extra:
            errors.append(f"{prefix}: fields differ from schema: missing={missing}, extra={extra}")
```

and after the existing `validate_web_evidence(service, prefix, errors)` line add:

```python
        if "trust" in service:
            validate_trust_record(
                service["trust"], prefix, enum_ids["trust_property_statuses"],
                inference_services_data.get("verified_at"), errors,
            )
```

- [ ] **Step 6: Add the three validator functions**

Immediately after `validate_web_evidence`, add:

```python
def validate_trust_record(
    trust: Any, prefix: str, statuses: set[str], collection_verified_at: object, errors: list[str]
) -> None:
    """Validate an unscored, human-owned trust record: documentation statuses plus pinned third-party findings.

    The block never enters a score. Its statuses say whether the operator publishes a
    statement, never what the service does; the note carries every exception in prose.
    See docs/adr/029-trust-records-are-unscored-and-never-first-hand.md.
    """
    if not isinstance(trust, dict):
        errors.append(f"{prefix}: trust must be an object")
        return
    if set(trust) != TRUST_REQUIRED:
        missing = sorted(TRUST_REQUIRED - set(trust))
        extra = sorted(set(trust) - TRUST_REQUIRED)
        errors.append(f"{prefix}: trust fields differ from schema: missing={missing}, extra={extra}")
        return
    reviewed_at: str | None = trust["verified_at"]
    if not valid_date(reviewed_at):
        errors.append(f"{prefix}: trust verified_at must be an ISO date")
        reviewed_at = None
    elif valid_date(collection_verified_at) and reviewed_at > collection_verified_at:
        errors.append(f"{prefix}: trust verified_at must not be after the collection verified_at")
    properties = trust["properties"]
    if not isinstance(properties, dict) or set(properties) != set(TRUST_PROPERTIES):
        errors.append(f"{prefix}: trust properties must be exactly {sorted(TRUST_PROPERTIES)}")
    else:
        for name in TRUST_PROPERTIES:
            validate_trust_property(properties[name], f"{prefix}: trust {name}", statuses, reviewed_at, errors)
    findings = trust["findings"]
    if not isinstance(findings, list):
        errors.append(f"{prefix}: trust findings must be a list")
        return
    for index, finding in enumerate(findings):
        validate_trust_finding(finding, f"{prefix}: trust finding {index}", reviewed_at, errors)


def validate_trust_property(
    item: Any, prefix: str, statuses: set[str], reviewed_at: str | None, errors: list[str]
) -> None:
    """One property: a taxonomy status, a prose note, and a scoped, public, first-party URL."""
    if not isinstance(item, dict) or set(item) != TRUST_PROPERTY_REQUIRED:
        errors.append(f"{prefix}: must have exactly {sorted(TRUST_PROPERTY_REQUIRED)}")
        return
    if item["status"] not in statuses:
        errors.append(f"{prefix}: unknown trust status {item['status']!r}")
    for field in ("note", "scope"):
        if not isinstance(item[field], str) or not item[field].strip():
            errors.append(f"{prefix}: {field} must be a non-empty string")
    if https_url_host(item["url"]) is None:
        errors.append(f"{prefix}: url must be an HTTPS URL on a public DNS host")
    if not valid_date(item["verified_at"]):
        errors.append(f"{prefix}: verified_at must be an ISO date")
    elif reviewed_at is not None and item["verified_at"] > reviewed_at:
        errors.append(f"{prefix}: verified_at must not be after the trust verified_at")


def validate_trust_finding(
    finding: Any, prefix: str, reviewed_at: str | None, errors: list[str]
) -> None:
    """One third-party finding: a quoted claim, a pinned source, and optional dated responses."""
    if not isinstance(finding, dict) or set(finding) != TRUST_FINDING_REQUIRED:
        errors.append(f"{prefix}: must have exactly {sorted(TRUST_FINDING_REQUIRED)}")
        return
    if not isinstance(finding["claim"], str) or not finding["claim"].strip():
        errors.append(f"{prefix}: claim must be a non-empty string")
    published_at: str | None = finding["published_at"]
    if not valid_date(published_at):
        errors.append(f"{prefix}: published_at must be an ISO date")
        published_at = None
    source = finding["source"]
    if not isinstance(source, dict) or set(source) != EVIDENCE_REQUIRED:
        errors.append(f"{prefix}: source must have exactly {sorted(EVIDENCE_REQUIRED)}")
    else:
        if source["kind"] != "third_party":
            errors.append(f"{prefix}: source kind must be third_party")
        if not isinstance(source["label"], str) or not source["label"].strip():
            errors.append(f"{prefix}: source requires a label")
        if https_url_host(source["url"]) is None:
            errors.append(f"{prefix}: source requires an HTTPS URL on a public DNS host")
        if not isinstance(source["content_sha256"], str) or not CONTENT_SHA_PATTERN.fullmatch(
            source["content_sha256"]
        ):
            errors.append(f"{prefix}: source requires a content_sha256")
        if not valid_date(source["fetched_at"]):
            errors.append(f"{prefix}: source fetched_at must be an ISO date")
        else:
            if published_at is not None and published_at > source["fetched_at"]:
                errors.append(f"{prefix}: published_at must not be after the source fetched_at")
            if reviewed_at is not None and source["fetched_at"] > reviewed_at:
                errors.append(f"{prefix}: source fetched_at must not be after the trust verified_at")
    for field in ("operator_response", "resolved"):
        value = finding[field]
        if value is None:
            continue
        if not isinstance(value, dict) or set(value) != TRUST_RESPONSE_REQUIRED:
            errors.append(
                f"{prefix}: {field} must be null or have exactly {sorted(TRUST_RESPONSE_REQUIRED)}"
            )
            continue
        if https_url_host(value["url"]) is None:
            errors.append(f"{prefix}: {field} url must be an HTTPS URL on a public DNS host")
        if not isinstance(value["summary"], str) or not value["summary"].strip():
            errors.append(f"{prefix}: {field} summary must be a non-empty string")
        if not valid_date(value["verified_at"]):
            errors.append(f"{prefix}: {field} verified_at must be an ISO date")
        elif reviewed_at is not None and value["verified_at"] > reviewed_at:
            errors.append(f"{prefix}: {field} verified_at must not be after the trust verified_at")
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_validation_policy -v`
Expected: every test PASSES, including the pre-existing `test_local_runtime_still_rejects_unknown_fields` and the service tests near line 709.

Run: `uv run ruff check scripts tests && uv run python scripts/validate_directory.py`
Expected: no lint output; the validator prints its summary line ending in `370 attributed models.dev source records`.

- [ ] **Step 8: Commit**

```bash
git add directory/taxonomy.json web/taxonomy.json scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Validate an optional unscored trust record on inference services

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Guards that keep the block human-owned and detail-only

**Files:**
- Test: `tests/test_update_directory.py`
- Test: `tests/test_web_payload.py`

**Interfaces:**
- Consumes: `scripts/update_directory.py` (source text only), `BOOT_FIELDS` and `SEARCH_FIELDS` from `scripts/build_web_payload.py`.
- Produces: nothing new; these are regression guards for the spec's decisions 2 and 8.

- [ ] **Step 1: Write the updater guard**

`scripts/update_directory.py` never reads or writes `inference-services.json` today, which is what keeps the block human-owned without a field list. Pin that. Add at the top of `tests/test_update_directory.py`, after `from scripts import update_directory`:

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
```

and inside `UpdateDirectoryTests`, after `test_metadata_refresh_does_not_change_editorial_verification_date`:

```python
    def test_the_refresh_never_touches_inference_service_records(self) -> None:
        """Trust records are human-owned; the refresh has no reason to open the collection at all."""
        source = (ROOT / "scripts" / "update_directory.py").read_text(encoding="utf-8")
        self.assertNotIn("inference-services", source)
        self.assertNotIn("inference_services", source)
```

- [ ] **Step 2: Write the payload guard**

In `tests/test_web_payload.py`, change the import block to also import `BOOT_FIELDS`:

```python
from scripts.build_web_payload import (
    BOOT_FIELDS,
    COLLECTIONS,
    SEARCH_FIELDS,
    build_payloads,
    load_catalog,
    model_records,
)
```

and add inside `WebPayloadTests`:

```python
    def test_trust_records_are_detail_only_and_never_searched(self) -> None:
        """A trust block is read behind a click; it never bloats boot and never makes a card match."""
        self.assertNotIn("trust", BOOT_FIELDS["inference"])
        self.assertNotIn("trust", SEARCH_FIELDS["inference"])
```

- [ ] **Step 3: Run both test modules**

Run: `uv run python -m unittest tests.test_update_directory tests.test_web_payload -v`
Expected: all PASS on the first run. These guards pass today; their job is to fail if a later change adds the collection to the refresh or the field to boot.

- [ ] **Step 4: Commit**

```bash
git add tests/test_update_directory.py tests/test_web_payload.py
git commit -m "Guard trust records as human-owned and detail-only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Weekly link check covers trust URLs and never drift-hashes them

**Files:**
- Modify: `scripts/check_evidence_links.py:127-155` (add `_add_trust_targets` after `_add_evidence_items`), `:212-238` (call it inside the services loop)
- Test: `tests/test_evidence_links.py`

**Interfaces:**
- Consumes: `_add_target(targets, url, *, kind, reference, reviewed_at, monitor_terms)` and `_TargetBuilder` from the same module.
- Produces: link targets with kinds `trust_property`, `trust_finding`, `trust_response` and references `inference-services:{id}:trust:{property}`, `inference-services:{id}:finding:{index}`, `inference-services:{id}:finding:{index}:{operator_response|resolved}`.

- [ ] **Step 1: Write the failing test**

Add to `EvidenceLinkTests` in `tests/test_evidence_links.py`, after `test_collects_every_reviewed_collection_and_deduplicates_urls`:

```python
    def test_trust_urls_are_link_checked_and_never_drift_hashed(self) -> None:
        """A third-party page is not the Atlas's to accept changes to: check the link, hash nothing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            documents = {
                "projects.json": {"projects": []},
                "license-evidence.json": {"entries": []},
                "specifications.json": {"specifications": []},
                "local-runtimes.json": {"runtimes": []},
                "models.json": {"models": []},
                "inference-services.json": {"services": [{
                    "id": "router", "url": "https://example.com/router", "verified_at": "2026-09-18",
                    "terms": {"kind": "web_terms", "url": "https://example.com/terms", "verified_at": "2026-09-18"},
                    "evidence": [],
                    "trust": {
                        "verified_at": "2026-09-18",
                        "properties": {"cache_isolation": {
                            "status": "undocumented", "note": "n", "scope": "s",
                            "url": "https://example.com/privacy", "verified_at": "2026-09-17",
                        }},
                        "findings": [{
                            "claim": "c", "published_at": "2026-05-28",
                            "source": {
                                "label": "l", "url": "https://arxiv.org/abs/2605.30613v1", "kind": "third_party",
                                "content_sha256": "0" * 64, "fetched_at": "2026-09-16",
                            },
                            "operator_response": {"url": "https://example.com/response", "verified_at": "2026-09-17", "summary": "s"},
                            "resolved": None,
                        }],
                    },
                }]},
            }
            for filename, document in documents.items():
                (directory / filename).write_text(json.dumps(document), encoding="utf-8")

            targets = check_evidence_links.collect_targets(directory)

        by_url = {item.url: item for item in targets}
        self.assertEqual(5, len(targets))
        finding = by_url["https://arxiv.org/abs/2605.30613v1"]
        self.assertFalse(finding.monitor_terms)
        self.assertIn("trust_finding", finding.kinds)
        self.assertEqual((("inference-services:router:finding:0", "2026-09-16"),), finding.review_dates)
        self.assertEqual(("inference-services:router:trust:cache_isolation",), by_url["https://example.com/privacy"].references)
        self.assertFalse(by_url["https://example.com/privacy"].monitor_terms)
        self.assertIn("trust_response", by_url["https://example.com/response"].kinds)
        self.assertEqual(
            ("inference-services:router:finding:0:operator_response",),
            by_url["https://example.com/response"].references,
        )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run python -m unittest tests.test_evidence_links.EvidenceLinkTests.test_trust_urls_are_link_checked_and_never_drift_hashed -v`
Expected: FAIL with `AssertionError: 5 != 2` (only the record URL and the terms URL are collected).

- [ ] **Step 3: Add the collector**

In `scripts/check_evidence_links.py`, after `_add_evidence_items`, add:

```python
def _add_trust_targets(
    targets: dict[str, _TargetBuilder],
    trust: Mapping[str, Any],
    *,
    record_id: str,
) -> None:
    """Trust URLs are checked as links and never drift-hashed.

    A property URL is the operator's page; a finding URL is someone else's. The Atlas
    cannot accept a change to a page it does not steward, so neither gets a terms
    baseline. The pinned content_sha256 on a finding is a review-time record of what
    the reviewer read, compared to nothing here. See ADR 029.
    """
    for name, item in trust.get("properties", {}).items():
        _add_target(
            targets,
            item.get("url"),
            kind="trust_property",
            reference=f"inference-services:{record_id}:trust:{name}",
            reviewed_at=item.get("verified_at"),
        )
    for index, finding in enumerate(trust.get("findings", [])):
        reference = f"inference-services:{record_id}:finding:{index}"
        source = finding.get("source") or {}
        _add_target(
            targets,
            source.get("url"),
            kind="trust_finding",
            reference=reference,
            reviewed_at=source.get("fetched_at"),
        )
        for field in ("operator_response", "resolved"):
            response = finding.get(field)
            if isinstance(response, dict):
                _add_target(
                    targets,
                    response.get("url"),
                    kind="trust_response",
                    reference=f"{reference}:{field}",
                    reviewed_at=response.get("verified_at"),
                )
```

`Mapping` (from `collections.abc`) and `Any` (from `typing`) are already imported at lines 20 and 27 of the module.

Then in `collect_targets`, inside `for record in service_document["services"]:`, after the second `_add_evidence_items(...)` call for `record["evidence"]`, add:

```python
        if isinstance(record.get("trust"), dict):
            _add_trust_targets(targets, record["trust"], record_id=record_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_evidence_links -v`
Expected: all PASS, including the pre-existing `test_collects_every_reviewed_collection_and_deduplicates_urls` (its fixture has no `trust`, so its count of 7 is unchanged).

Run: `uv run ruff check scripts tests`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_evidence_links.py tests/test_evidence_links.py
git commit -m "Link-check trust URLs weekly without drift-hashing third-party pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Detail dialog renders the trust block in three states

**Files:**
- Modify: `web/app.js` (new helpers before `inferenceDialogMarkup` at line 1279; one line inside it after the "Routing and customization" section)
- Modify: `web/styles.css` (after `.unscored-note` at line 1104)
- Create: `tests/e2e/trust-record.spec.js`

**Interfaces:**
- Consumes: `escapeHTML`, `taxonomyName(group, id)`, `state.taxonomy`, the `.detail-block`, `.evidence-date`, `.unscored-note` styles, the detail payload at `web/app/detail/inference/{id}.json`.
- Produces: `TRUST_PROPERTY_LABELS`, `TRUST_PROPERTY_ORDER`, `trustStatusName(status)`, `trustBlockMarkup(service)`. Task 5 reuses the first three.

- [ ] **Step 1: Write the failing end-to-end tests**

Create `tests/e2e/trust-record.spec.js`:

```js
const { test, expect } = require("@playwright/test");

// A trust record is an optional, unscored, human-owned block on a service. No
// published record carries one until the first review batch lands, so these
// tests serve one into the detail payload and hold the three rendered states:
// absent, reviewed with findings, reviewed with none — never "clean".

const property = (status, note) => ({
  status,
  note,
  url: "https://openrouter.ai/docs/",
  scope: "OpenRouter API documentation for the named service",
  verified_at: "2026-09-17",
});

const TRUST = {
  verified_at: "2026-09-18",
  properties: {
    response_integrity: property("undocumented", "No signing or attestation of responses is documented."),
    upstream_disclosure: property("documented_yes", "The provider routing guide names each upstream by provider."),
    credential_handling: property("documented_yes", "Bring-your-own-key storage is described in the integrations guide."),
    cache_isolation: property("undocumented", "The documentation does not say whether caches are pooled across customers."),
    vulnerability_disclosure: property("documented_yes", "A security contact is published."),
    independent_audit: property("undocumented", "No attestation naming the API is published."),
  },
  findings: [{
    claim: "Routing through OpenRouter with shared organizational credentials may create global cache sharing across all OpenRouter users.",
    published_at: "2026-05-28",
    source: {
      label: "CacheProbe: Auditing Prompt Cache Isolation in Gateway APIs, arXiv 2605.30613v1",
      url: "https://arxiv.org/abs/2605.30613v1",
      kind: "third_party",
      content_sha256: "0".repeat(64),
      fetched_at: "2026-09-16",
    },
    operator_response: null,
    resolved: null,
  }],
};

async function serveTrust(page, id, trust) {
  await page.route(`**/app/detail/inference/${id}.json*`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    await route.fulfill({ response, json: { ...detail, trust } });
  });
}

const collectPageErrors = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
};

test("a service without a trust record says it has not been examined", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/?record=inference:openai-api");
  const block = page.locator('#dialog-content [data-trust="absent"]');
  await expect(block).toContainText("Trust record · unscored");
  await expect(block).toContainText("Not yet examined for trust properties.");
  expect(errors).toEqual([]);
});

test("a reviewed service renders six statuses and its finding, none as a score", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveTrust(page, "openrouter", TRUST);
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#dialog-content [data-trust="findings"]');
  await expect(block).toContainText("Trust record · unscored");
  await expect(block.locator(".trust-table tr")).toHaveCount(6);
  await expect(block.locator(".trust-table tr").first()).toContainText("Response integrity");
  await expect(block.locator(".trust-table tr").first()).toContainText("Undocumented");
  await expect(block).toContainText("CacheProbe");
  await expect(block).toContainText("published 2026-05-28");
  await expect(block).toContainText("Operator response: none recorded.");
  await expect(block).not.toContainText("undefined");
  await expect(block).not.toContainText("/ 10");
  expect(errors).toEqual([]);
});

test("a reviewed service with no findings never reads as clean", async ({ page }) => {
  await serveTrust(page, "openrouter", { ...TRUST, findings: [] });
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#dialog-content [data-trust="reviewed"]');
  await expect(block).toContainText("Reviewed on 2026-09-18; no admissible third-party finding recorded.");
  await expect(block).toContainText("Absence of a finding is not evidence of safety.");
});

test("a closed finding shows its resolution beside the claim", async ({ page }) => {
  const closed = {
    ...TRUST,
    findings: [{
      ...TRUST.findings[0],
      operator_response: { url: "https://openrouter.ai/docs/", verified_at: "2026-09-17", summary: "The operator states caches are keyed per API key." },
      resolved: { url: "https://openrouter.ai/docs/", verified_at: "2026-09-17", summary: "Per-key cache scoping is now documented." },
    }],
  };
  await serveTrust(page, "openrouter", closed);
  await page.goto("/?record=inference:openrouter");
  const block = page.locator('#dialog-content [data-trust="findings"]');
  await expect(block).toContainText("Operator response: The operator states caches are keyed per API key.");
  await expect(block).toContainText("Closed: Per-key cache scoping is now documented.");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/trust-record.spec.js`
Expected: all four FAIL on the first `expect`, because no element matches `[data-trust=...]`.

- [ ] **Step 3: Add the rendering helpers**

In `web/app.js`, immediately before `function inferenceDialogMarkup(service) {`, add:

```js
// A trust record is unscored and human-owned. Each status says whether the operator
// publishes a statement about a property, never what the service does; the note
// carries every exception. Nothing rendered here enters a score. See ADR 029.
const TRUST_PROPERTY_LABELS = {
  response_integrity: "Response integrity",
  upstream_disclosure: "Upstream disclosure",
  credential_handling: "Credential handling",
  cache_isolation: "Cache isolation",
  vulnerability_disclosure: "Vulnerability disclosure",
  independent_audit: "Independent audit",
};
const TRUST_PROPERTY_ORDER = Object.keys(TRUST_PROPERTY_LABELS);

function trustStatusName(status) {
  return taxonomyName("trust_property_statuses", status);
}

function trustSourceLink(item, text) {
  return `<a href="${escapeHTML(item.url)}" target="_blank" rel="noreferrer">${escapeHTML(text)} ↗</a>`;
}

function trustResponseMarkup(label, response, absent) {
  if (!response) return `<p><strong>${escapeHTML(label)}:</strong> ${escapeHTML(absent)}</p>`;
  return `<p><strong>${escapeHTML(label)}:</strong> ${escapeHTML(response.summary)} ${trustSourceLink(response, "source")} <span class="evidence-date">${escapeHTML(response.verified_at)}</span></p>`;
}

function trustFindingMarkup(finding) {
  const source = `<p>${trustSourceLink(finding.source, finding.source.label)} <span class="evidence-date">published ${escapeHTML(finding.published_at)} · read ${escapeHTML(finding.source.fetched_at)}</span></p>`;
  return `<li><p>${escapeHTML(finding.claim)}</p>${source}${trustResponseMarkup("Operator response", finding.operator_response, "none recorded.")}${finding.resolved ? trustResponseMarkup("Closed", finding.resolved, "") : "<p><strong>Open.</strong></p>"}</li>`;
}

function trustBlockMarkup(service) {
  const heading = "<h3>Trust record · unscored</h3>";
  // The dialog paints from boot data and repaints when the detail file lands;
  // retention_controls is detail-only, so its absence means "not loaded yet",
  // which must not read as "not examined".
  if (!("retention_controls" in service)) {
    return `<section class="detail-block" data-trust="pending">${heading}<p>—</p></section>`;
  }
  const trust = service.trust;
  if (!trust) {
    return `<section class="detail-block" data-trust="absent">${heading}<p>Not yet examined for trust properties.</p></section>`;
  }
  const rows = TRUST_PROPERTY_ORDER.map(name => {
    const item = trust.properties[name];
    return `<tr><td>${escapeHTML(TRUST_PROPERTY_LABELS[name])}</td><td>${escapeHTML(trustStatusName(item.status))}</td><td>${escapeHTML(item.note)} ${trustSourceLink(item, "source")} <span class="evidence-date">${escapeHTML(item.verified_at)}</span></td></tr>`;
  }).join("");
  const findings = trust.findings.length
    ? `<ul>${trust.findings.map(trustFindingMarkup).join("")}</ul>`
    : `<p>Reviewed on ${escapeHTML(trust.verified_at)}; no admissible third-party finding recorded. Absence of a finding is not evidence of safety.</p>`;
  const state = trust.findings.length ? "findings" : "reviewed";
  return `<section class="detail-block" data-trust="${state}">${heading}<table class="trust-table">${rows}</table><h4>Third-party findings</h4>${findings}<p class="unscored-note">Each status says whether the operator publishes a statement, never what the service does. Nothing here enters the score. Reviewed ${escapeHTML(trust.verified_at)}.</p></section>`;
}
```

Then inside `inferenceDialogMarkup`, after the line that renders the "Routing and customization" section and before the "Strengths" section, add:

```js
      ${trustBlockMarkup(service)}
```

- [ ] **Step 4: Add the styles**

In `web/styles.css`, after the `.unscored-note` rule at line 1104, add:

```css
.trust-table { width: 100%; border-collapse: collapse; }
.trust-table td { padding: .45rem; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--muted); line-height: 1.45; }
.trust-table td:nth-child(2) { white-space: nowrap; font-weight: 600; color: var(--text); }
.detail-block h4 { margin: 1rem 0 .4rem; color: var(--text); font-size: .92rem; font-weight: 600; }
```

- [ ] **Step 5: Run the syntax check, lint, and the tests**

Run: `node --check web/app.js && npm run lint:js && npx playwright test tests/e2e/trust-record.spec.js`
Expected: no syntax or lint output; all four tests PASS.

Run: `npm run test:e2e`
Expected: the whole suite PASSES; `deferred-data.spec.js` in particular, since the dialog markup path changed.

- [ ] **Step 6: Bump the asset version and commit**

Run: `node scripts/build_asset_version.mjs` (the app and stylesheet changed, so the cache-busting query strings in `web/index.html` must change; `--check` runs in CI and the script writes only that file).

```bash
git add web/app.js web/styles.css web/index.html tests/e2e/trust-record.spec.js
git commit -m "Render the trust record in the service detail dialog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Comparison table gains six unscored trust rows

**Files:**
- Modify: `web/app.js` (`comparisonTable` at line 1629; the inference `rows` array at lines 1749-1765; one new helper)
- Modify: `tests/e2e/trust-record.spec.js`

**Interfaces:**
- Consumes: `TRUST_PROPERTY_LABELS`, `TRUST_PROPERTY_ORDER`, `trustStatusName` from Task 4; `comparisonTable(records, rows)`.
- Produces: `trustComparisonCell(service, name)`; `comparisonTable` accepts a cell value of `{ text, title }` as well as a string or `null`.

- [ ] **Step 1: Write the failing end-to-end test**

Append to `tests/e2e/trust-record.spec.js`:

```js
test("a comparison shows six unscored trust rows and marks unreviewed records as not examined", async ({ page }) => {
  const errors = collectPageErrors(page);
  await serveTrust(page, "openrouter", TRUST);
  await page.goto("/?collection=inference&compare=inference:openrouter,openai-api");
  const table = page.locator("#comparison-dialog-content .comparison-table");
  const row = table.locator("tr").filter({ hasText: "Cache isolation · trust record, unscored" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(0)).toHaveText("Undocumented");
  await expect(row.locator("td").nth(0)).toHaveAttribute("title", /caches are pooled/);
  await expect(row.locator("td").nth(1)).toHaveText("not examined");
  await expect(table.locator("tr").filter({ hasText: "trust record, unscored" })).toHaveCount(6);
  await expect(table).not.toContainText("undefined");
  expect(errors).toEqual([]);
});
```

`collection=inference` is the value `web/index.html` line 90 binds to the Inference services tab, and the `inference:` prefix is the record kind `comparisonCollection` in `web/app.js` reads; columns follow the order of ids in the `compare` parameter.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/trust-record.spec.js -g "comparison"`
Expected: FAIL at `toHaveCount(1)` because no row carries the trust label.

- [ ] **Step 3: Let a cell carry a hover title**

In `web/app.js`, replace `comparisonTable` with:

```js
// A cell is a string, null (rendered "—"), or { text, title }: the trust rows put
// the status word in the cell and the reviewer's note in the title, so a table of
// six one-word statuses still carries every exception on hover.
const comparisonCell = value => {
  if (value && typeof value === "object") {
    return `<td title="${escapeHTML(value.title)}">${escapeHTML(value.text)}</td>`;
  }
  return `<td>${escapeHTML(value ?? "—")}</td>`;
};

function comparisonTable(records, rows) {
  return `<div class="comparison-table-wrap"><table class="comparison-table">
    <thead><tr><th scope="col">Decision factor</th>${records.map(record => `<th scope="col"><strong>${escapeHTML(record.name)}</strong></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([name, values]) => `<tr><th scope="row">${escapeHTML(name)}</th>${values.map(comparisonCell).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}
```

- [ ] **Step 4: Add the rows**

Immediately before `function comparisonTable(records, rows) {`, add:

```js
function trustComparisonCell(service, name) {
  const item = service.trust?.properties?.[name];
  if (!item) return "not examined";
  return { text: trustStatusName(item.status), title: `${item.note} (${item.verified_at})` };
}
```

In the inference branch of the comparison builder (the `else` branch whose `note` begins "This comparison covers operational service characteristics"), insert after the `["Customization", ...]` row and before `["Strengths", ...]`:

```js
      ...TRUST_PROPERTY_ORDER.map(name => [
        `${TRUST_PROPERTY_LABELS[name]} · trust record, unscored`,
        records.map(item => trustComparisonCell(item, name)),
      ]),
```

and change that branch's `note` to:

```js
    note = "This comparison covers operational service characteristics. It excludes model quality, current price, and transient latency or throughput. Trust rows record whether the operator documents a property; they are unscored and never ranked.";
```

- [ ] **Step 5: Run the checks and tests**

Run: `node --check web/app.js && npm run lint:js && npx playwright test tests/e2e/trust-record.spec.js && node --test tests/test_web.js`
Expected: all PASS.

Run: `npm run test:e2e`
Expected: PASS. `deferred-data.spec.js` exercises a degraded system comparison through `comparisonTable`; string and `null` cells must still render as before.

- [ ] **Step 6: Bump the asset version and commit**

Run: `node scripts/build_asset_version.mjs`

```bash
git add web/app.js web/index.html tests/e2e/trust-record.spec.js
git commit -m "Compare trust statuses across services as unscored rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ADR 029 and the documentation that routes to it

**Files:**
- Create: `docs/adr/029-trust-records-are-unscored-and-never-first-hand.md`
- Modify: `docs/DATA_MODEL.md:149-162` (inference service record section)
- Modify: `docs/INFERENCE_SERVICES.md` (new section after "Evidence and freshness"; one step in "Review workflow")
- Modify: `docs/WEB.md:63`, `:72`, `:171`
- Modify: `docs/OPERATIONS.md:55-60` ("Evidence links and terms drift")
- Modify: `AGENTS.md:26` (just-in-time row) and the hard rules list
- Modify: `skills/ai-systems-atlas/reference.md:28-32` and `:52`
- Modify: `tests/test_documentation.py:57-93` (routing manifest)

**Interfaces:**
- Consumes: the field names and copy fixed in Tasks 1, 4, and 5.
- Produces: the ADR every code comment above already cites.

- [ ] **Step 1: Add the ADR to the routing manifest so the test fails first**

In `tests/test_documentation.py`, in `test_task_routing_documents_exist`, after the line `"docs/adr/028-attention-sources-are-pointers-not-claims.md",` add:

```python
            "docs/adr/029-trust-records-are-unscored-and-never-first-hand.md",
```

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: `test_task_routing_documents_exist` FAILS (file missing) and `test_routing_documents_are_reachable_from_agents` FAILS (not named in `AGENTS.md`).

- [ ] **Step 2: Write the ADR**

Create `docs/adr/029-trust-records-are-unscored-and-never-first-hand.md`:

```markdown
# ADR 029: Trust records are unscored and never first-hand

- Status: Accepted
- Date: 2026-09-11

## Context

An inference-service record states what an operator promises: retention, training use, residency, routing. It has nowhere to state whether the operator publishes a way to verify a response, names who receives plaintext, documents how customer keys are stored, isolates caches, or has been examined by anyone. An API router terminates the client's TLS session and opens its own upstream session, so it holds every prompt, tool definition, tool-call argument, and credential in plaintext.

"Your Agent Is Mine" (arXiv 2604.08407, 2026-04-09) measured 428 grey-market routers and found nine rewriting tool calls in responses and seventeen using planted cloud credentials. None of the 428 is an Atlas-listed service; the paper names OpenRouter once, for scale. The one third-party finding that names an Atlas record is CacheProbe (arXiv 2605.30613, 2026-05-28), on OpenRouter cache isolation.

[ADR 022](022-general-pattern-content-is-not-a-collection.md) characterises every collection as pinning each record's evidence to one steward's own artifact. A researcher's paper about a service is not that.

## Decision

### The block is unscored

An optional `trust` block on an inference-service record never enters `score` or `overall`, is not a dimension, and is never summed, ranked, or sorted on. ADR 012's profile is unchanged. It renders under an explicit unscored label.

### Statuses record documentation, not behaviour

Each of six properties — response integrity, upstream disclosure, credential handling, cache isolation, vulnerability disclosure, independent audit — carries one of `documented_yes`, `documented_no`, `undocumented`, from `directory/taxonomy.json`. `documented_yes` means the operator publishes a statement establishing the property; `documented_no` means it publishes one denying it or stating it does not apply; `undocumented` means no first-party statement was found on the review date. A required prose `note` carries every exception, and the `url` is first-party, public, and scoped to the named service. The tri-state is therefore exempt from the prose-only rule in `docs/DATA_MODEL.md` for operational constraints: it compresses no capability, only whether a document exists.

### Findings are third-party, dated, pinned, and bounded

A finding is admissible when its source names the service, states a repeatable method or an operator-acknowledged incident, carries a date, and can be pinned by content hash in an immutable form where one exists. Preprints, papers, CVE and advisory records, and first-party disclosures can qualify. News, social posts, and summaries of others' work are pointers in the sense of [ADR 028](028-attention-sources-are-pointers-not-claims.md), followed to their source and never recorded themselves. A finding holds the claim in the source's words and nothing the source does not say; editorial judgement goes in `tradeoffs`. Findings are never deleted; they are closed with a dated resolution source.

This is the first third-party-authored evidence on a published endpoint. ADR 022's characterisation is amended: every collection pins evidence to a steward's own artifact, except that an inference-service trust record may additionally carry a pinned third-party finding under the four conditions above. The finding's source kind is `third_party`.

### A finding is a review trigger, never a score input

When a finding bears on a scored dimension, the reviewer re-reads that dimension against the operator's own evidence and the finding, and advances the record's `verified_at`, as `docs/CURATION.md` treats a license mismatch or a changed terms page. The score changes only through that human review.

### The block is human-owned and present only after review

Automation never adds, edits, or removes the block. Absent means unexamined, and the app says so. An empty findings list on a reviewed record renders as "no admissible finding recorded" with the statement that absence is not evidence of safety; it never renders as clean.

### The Atlas records no first-hand measurement as a finding

The Atlas sends no canary requests. A reviewer may verify an operator's published mechanism by hand, as the TrustedRouter review verified an attestation, and may say so in `strengths`; that is a review of a first-party claim, not a finding.

### Trust URLs are link-checked and never drift-hashed

`scripts/check_evidence_links.py` checks every property and finding URL as a link; a `404` fails the weekly refresh like any reviewed link. No trust URL receives a terms baseline, because the Atlas cannot accept a change to a page it does not steward.

## Consequences

- `directory/inference-services.json` records gain an optional `trust` field; `directory/taxonomy.json` gains `trust_property_statuses`.
- The published endpoint's shape changes by that optional field, deliberately, under [ADR 026](026-app-payloads-are-a-projection-of-the-published-endpoints.md); `skills/ai-systems-atlas/reference.md` documents it.
- Share pages are unchanged. The detail dialog and the inference comparison render the block with an unscored label.
- The first review batch is the twelve routing aggregators, because an aggregator has upstreams to disclose, accepts or shares credentials, and can pool caches, and because the only admissible finding names one of them. The order does not rest on the grey-market paper.
```

- [ ] **Step 3: Update `docs/DATA_MODEL.md`**

In the "Inference service record" section, after the `- **Review:**` bullet, add:

```markdown
- **Trust record (optional):** `trust` is absent until a human reviews the service for it. When present it has exactly `verified_at`, `properties`, and `findings`. `properties` has exactly `response_integrity`, `upstream_disclosure`, `credential_handling`, `cache_isolation`, `vulnerability_disclosure`, and `independent_audit`, each with `status` (from `trust_property_statuses`), a non-empty `note`, a first-party public `url`, a `scope`, and `verified_at`. The status says whether the operator publishes a statement, never what the service does, which is why it is exempt from the prose-only rule above: it compresses no capability, and the note carries every exception. `findings` is a list, possibly empty, of `{claim, published_at, source, operator_response, resolved}`; `source` is `{label, url, kind: "third_party", content_sha256, fetched_at}`, and `operator_response` and `resolved` are `null` or `{url, verified_at, summary}`. Every date in the block is on or before `trust.verified_at`, which is on or before the collection `verified_at`. The block is unscored and human-owned; see [ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md).
```

In the "Timestamp semantics" table, add a row:

```markdown
| `trust.verified_at` | Human reviewer | The trust record's properties and findings were reviewed on this date; never automated |
```

- [ ] **Step 4: Update `docs/INFERENCE_SERVICES.md`**

After the "Evidence and freshness" section and before "Coverage discovery", add:

```markdown
## Trust record

A trust record is an optional, unscored, human-owned block that says whether the operator documents six properties, and lists dated third-party findings about the named service. It never enters the score. [ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md) is the governing decision.

| Property | `documented_yes` means the operator publishes… |
|---|---|
| `response_integrity` | a mechanism by which a client can verify a response, including a tool call, arrived from the upstream model unaltered: a signature, an attestation, or an equivalent. |
| `upstream_disclosure` | the parties that receive request plaintext: the operator alone for a direct API; the upstream or subprocessor list for an aggregator or platform. |
| `credential_handling` | how customer-supplied upstream keys are stored and whether they are encrypted at rest. A service whose documentation offers no such path is `documented_no`, with a note citing the documented request path. |
| `cache_isolation` | whether prompt caching is scoped per customer or pooled behind shared upstream credentials. |
| `vulnerability_disclosure` | a public security contact or disclosure policy for the named service. |
| `independent_audit` | a SOC 2, ISO 27001, or equivalent attestation for the named service, recorded as an operator claim the Atlas does not read or judge. |

`documented_no` means the operator publishes a statement denying the property or stating it does not apply. `undocumented` means no first-party statement was found on the review date. The line between them is a judgement: a privacy policy that never mentions caching is `undocumented`; one that says caches are not isolated is `documented_no`. The note quotes the sentence that decided it. Every `url` is first-party and public — gated portals are ineligible — and scoped to the named service; a company-wide attestation that does not name the service earns `undocumented` with a note. Where existing prose already states the fact, the prose stays and the property cites the same source.

A finding is admissible when the source names the service, states a method a reader could repeat or an incident the operator has acknowledged, carries a publication date, and can be pinned: a version-specific arXiv URL, a CVE or advisory record, a DOI, or a first-party disclosure page, with its content hash taken at review. News coverage, social posts, and summaries of others' work are pointers, never findings; follow them to their source. A finding says nothing its source does not say. It is never deleted; close it with a dated `resolved` source. A finding that bears on a scored dimension is a review trigger: re-read that dimension against the operator's evidence and the finding, and advance `verified_at`.

An empty findings list on a reviewed record means "reviewed, no admissible finding recorded". It is never evidence of safety, and the app says so.
```

In "Review workflow", after step 6, add:

```markdown
7. Optionally review the trust record: answer each of the six properties from first-party pages with a scoped URL and a note quoting the deciding sentence, record any admissible third-party finding with its pinned hash, and set `trust.verified_at`. A service without this step carries no `trust` block and renders as unexamined.
```

and renumber the former step 7 to 8.

- [ ] **Step 5: Update `docs/WEB.md`**

At line 63 (the bullet beginning "Inference-service details show"), append to the sentence listing what details show: `, and, when a human has reviewed one, an unscored trust record with six documentation statuses and dated third-party findings; a service without one says it has not been examined, and an empty findings list says absence is not evidence of safety`.

At line 72, change `Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, strengths, and tradeoffs.` to `Inference-service comparisons align the service score with delivery, model sources, API styles, operational controls, six unscored trust-record rows labelled as such in the row heading, strengths, and tradeoffs.`

At line 171 (checklist item 14), append: `; confirm the six trust rows show a status word for a reviewed service and "not examined" for an unreviewed one, and that hovering a status shows the reviewer's note`.

- [ ] **Step 6: Update `docs/OPERATIONS.md`**

In "Evidence links and terms drift", after the sentence `Other transport failures are warnings unless fewer than 80% of the current targets were checked or served from a recent cache.`, add:

```markdown
Trust-record URLs — every property source, finding source, operator response, and
resolution — are checked as links and never drift-hashed: the Atlas cannot accept a change
to a page it does not steward, and a finding's pinned `content_sha256` is a review-time
record compared to nothing here. See
[ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md).
```

- [ ] **Step 7: Update `AGENTS.md`**

In the just-in-time table, change the row at line 26 to end with `, `docs/adr/013-distinct-collections-share-one-directory-surface.md`, and `docs/adr/029-trust-records-are-unscored-and-never-first-hand.md` for trust records |`.

In "Hard rules", after the bullet beginning `Keep inference services outside`, add:

```markdown
- Trust records on inference services are unscored, present only after human review, and carry third-party findings only as dated, pinned, bounded claims from sources that name the service; never render an empty findings list as clean, and never let automation write the block.
```

- [ ] **Step 8: Update the skill reference**

In `skills/ai-systems-atlas/reference.md`, in the `inference-services.json` record fields section, after the field list line add:

```markdown
`trust` is optional and unscored: `{verified_at, properties: {response_integrity, upstream_disclosure, credential_handling, cache_isolation, vulnerability_disclosure, independent_audit}, findings: [...]}`. Each property is `{status, note, url, scope, verified_at}` with `status` from the `trust_property_statuses` taxonomy group. Each finding is `{claim, published_at, source, operator_response, resolved}` with a `third_party` pinned source. Absent means the service has not been examined; an empty `findings` list is not evidence of safety. See [docs/adr/029-trust-records-are-unscored-and-never-first-hand.md](../../docs/adr/029-trust-records-are-unscored-and-never-first-hand.md).
```

At line 52, insert `trust_property_statuses` into the taxonomy key list immediately after `inference_api_styles`.

- [ ] **Step 9: Run the documentation tests and the full Python suite**

Run: `uv run python -m unittest tests.test_documentation tests.test_skill -v`
Expected: all PASS.

Run: `uv run python -m unittest discover -s tests -q && uv run ruff check scripts tests && uv run python -m compileall scripts tests -q`
Expected: all PASS, no lint output.

- [ ] **Step 10: Commit**

```bash
git add docs/adr/029-trust-records-are-unscored-and-never-first-hand.md docs/DATA_MODEL.md docs/INFERENCE_SERVICES.md docs/WEB.md docs/OPERATIONS.md AGENTS.md skills/ai-systems-atlas/reference.md tests/test_documentation.py
git commit -m "Decide that trust records are unscored and never first-hand (ADR 029)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Full verification of the code pull request

**Files:** none modified.

- [ ] **Step 1: Run every command in `AGENTS.md`**

```bash
uv sync --locked
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
uv run python scripts/build_blog.py
node scripts/build_logos.mjs --check
node scripts/build_fonts.mjs --check
node scripts/build_asset_version.mjs --check
uv run python scripts/build_share_pages.py --check
uv run python scripts/build_blog.py --check
uv run ruff check scripts tests
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
npm run lint:js
npm run test:e2e
```

Expected: every command exits 0; `git status --short` is empty afterwards (the sync and builders must produce no diff, since no record changed).

- [ ] **Step 2: Browser pass**

Run `uv run python -m http.server 8765 --directory web` and, in a browser, open `http://localhost:8765/?record=inference:openai-api`: the dialog shows "Trust record · unscored" with "Not yet examined for trust properties." between Routing and customization and Strengths. Open `http://localhost:8765/?collection=inference&compare=inference:openrouter,openai-api`: six rows read "not examined" in both columns and the note under the eyebrow ends "unscored and never ranked". Narrow the window below 720px: the trust block stacks and the table does not overflow the dialog.

- [ ] **Step 3: Open the pull request**

Title: `Add unscored trust records to inference services`. Body: summarise the spec's decisions 1 to 9 in one paragraph each at most, list the verification commands run, and end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge; the user holds the merge.

---

### Task 8: First review batch, the twelve routing aggregators

This task is a curation pull request, opened only after Task 7's pull request is merged. Its content is human review, so the plan fixes the procedure, the record shape, and the one admissible finding; the property values and notes are the review's output.

**Files:**
- Modify: `directory/inference-services.json` (twelve records: `openrouter`, `hugging-face-inference-providers`, `venice-api`, `requesty`, `eden-ai`, `aiml-api`, `nano-gpt`, `vercel-ai-gateway`, `cloudflare-ai-gateway`, `martian`, `trustedrouter`, `qiniu-ai-inference`)
- Regenerate: `web/inference-services.json`, `web/app/**`, `web/records/**`, `web/sitemap.xml`

- [ ] **Step 1: Pin the CacheProbe finding**

Fetch the version-pinned abstract page and hash its bytes:

```bash
uv run python - <<'EOF'
import hashlib, urllib.request
url = "https://arxiv.org/abs/2605.30613v1"
with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ai-systems-atlas-review"}), timeout=30) as response:
    body = response.read()
print(hashlib.sha256(body).hexdigest())
EOF
```

Record the printed digest as `content_sha256` and today's date as `fetched_at` in the OpenRouter finding:

```json
{
  "claim": "Routing through OpenRouter with shared organizational credentials may create global cache sharing across all OpenRouter users, bypassing the per-account cache isolation individual providers implement.",
  "published_at": "2026-05-28",
  "source": {
    "label": "CacheProbe: Auditing Prompt Cache Isolation in Gateway APIs, arXiv 2605.30613v1",
    "url": "https://arxiv.org/abs/2605.30613v1",
    "kind": "third_party",
    "content_sha256": "<the printed digest>",
    "fetched_at": "<today>"
  },
  "operator_response": null,
  "resolved": null
}
```

Read the paper's method and conclusion sections before committing the claim wording; the claim must be bounded to what the paper establishes about OpenRouter, in its words, and nothing more. If OpenRouter has published a response, record it in `operator_response` with its URL and date.

- [ ] **Step 2: Review each of the twelve records**

For each service, in the order listed above, open the first-party documentation, privacy policy, security page, and terms already cited in the record's `evidence` and `terms`, then answer each property:

| Property | Where to look | Deciding question |
|---|---|---|
| `response_integrity` | API reference, security page | Is any response signature, attestation, or verifiable envelope documented? Expect `undocumented` for most. |
| `upstream_disclosure` | Provider list, routing docs, privacy policy subprocessor list | Are the upstream operators that receive plaintext named? |
| `credential_handling` | Bring-your-own-key or integrations guide, security page | If BYOK exists, is storage and encryption at rest documented? If no BYOK path, `documented_no` citing the request path. |
| `cache_isolation` | Caching guide, privacy policy | Is cache scope (per key, per org, pooled) stated? |
| `vulnerability_disclosure` | `/.well-known/security.txt`, security page, terms | Is a security contact or disclosure policy published for the service? |
| `independent_audit` | Trust centre, security page | Is a SOC 2 or ISO 27001 attestation named for this service on a public page? A gated trust portal is `undocumented`. |

For each, write `status`, a `note` that quotes the deciding sentence (or states that no statement was found and which pages were read), the public first-party `url`, a `scope` naming the page and the service, and `verified_at` as today. Set `trust.verified_at` to today. Where a finding bears on a scored dimension (the OpenRouter finding bears on `data_governance`), re-read that dimension against the operator's evidence and the finding, change the score only if the operator's own evidence now reads differently, and advance the record's `verified_at`.

- [ ] **Step 3: Regenerate, validate, and check links**

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_web_payload.py
uv run python scripts/build_share_pages.py
node scripts/build_asset_version.mjs
uv run python scripts/validate_directory.py
GITHUB_TOKEN=... uv run python scripts/check_evidence_links.py --max-age-hours 0
```

Expected: the validator reports 59 scored inference services with no errors; the checker's summary line counts the new targets and reports `0` terms baselines added for them (trust URLs are never drift-hashed), and every trust URL is fetched or reported as a non-conclusive warning. Any `404` on a trust URL is a record error to fix before committing, not a warning to grandfather.

- [ ] **Step 4: Run the full verification and browser pass**

Run every command in Task 7 Step 1. Then in a browser open `http://localhost:8765/?record=inference:openrouter`: the trust block shows six statuses and the CacheProbe finding as open with "Operator response: none recorded." unless one was found. Open a comparison of `openrouter` and `openai-api`: the trust rows show a status word for OpenRouter and "not examined" for OpenAI API, and hovering a status shows the note.

- [ ] **Step 5: Commit and open the curation pull request**

```bash
git add directory/inference-services.json web/
git commit -m "Review trust records for the twelve routing aggregators

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Title: `Review trust records for the twelve routing aggregators`. The body lists, per service, the six statuses and a one-line rationale, names the OpenRouter finding, and states how long the twelve reviews took so the remaining 47 can be scheduled against that measurement. Do not merge; the user holds the merge.
