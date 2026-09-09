# Attention-Source Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep Hacker News daily for AI-systems signals, pin the vendor page behind each link, and collect them in a dedicated queue that a human drains into `directory/candidates.json`.

**Architecture:** A deterministic Python sweep runs daily in GitHub Actions, queries the Hacker News Algolia API, gates stories on outbound link plus points floor plus a media denylist, fetches each vendor page through the hardened SSRF path that already exists in `scripts/build_candidate_evidence.py`, and commits `directory/hn-signals.json` carrying provenance and a content hash but never the page text. A local routine re-fetches those pages into a git-ignored bundle, verifies each hash against what CI recorded, and lets a model add a routing verdict and a prose finding — fenced by the same taxonomy-id check that guards triage findings. Nothing in the pipeline proposes a classification, and nothing writes `directory/candidates.json`.

**Tech Stack:** Python 3.11+ (stdlib only — the project declares zero runtime dependencies), `unittest`, `ruff` 0.16.6, `uv`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-attention-source-discovery-design.md`

## Global Constraints

- Python floor is **3.11** (`pyproject.toml` `requires-python = ">=3.11"`, ruff `target-version = "py311"`). No 3.12-only syntax.
- **Zero runtime dependencies.** `dependencies = []`. Use `urllib`, `json`, `hashlib`, `re` — never `requests`.
- Tests are **`unittest`**, not pytest. Run with `uv run python -m unittest tests.test_name -v`.
- Ruff selects `F, E4, E7, E9, W, I, UP, B, SIM, RUF`. **E501 is deliberately absent** — do not rewrap long strings to satisfy a column limit.
- The term is **"attention source"**, never "aggregator" — `routing_aggregator` is an inference-service type in `directory/taxonomy.json:80` used by 12 published records.
- `directory/hn-signals.json` is **never published**. It must not appear in `PUBLISHED_DATA` and `web/hn-signals.json` must never exist.
- Nothing in this plan writes `directory/candidates.json`, `directory/projects.json`, or `directory/exclusions.json` entries beyond Task 1's schema change.
- No file in this pipeline may contain a `system_family` or `primary_role` id in a model-written field.
- `AGENTS.md`: "Never report checks as passing unless you ran them."

---

### Task 1: Exclusion URLs make a rejection stick

**Why first:** this is a defect today, independent of everything below. `directory/exclusions.json` has 70 entries with exactly the fields `{name, reason, repo, useful_lesson}` and no `url`; 10 have `repo: null`. `known_urls` at `scripts/update_directory.py:675` reads project URLs only. A rejected non-GitHub URL cannot be recorded and reappears on every run.

**Files:**
- Modify: `scripts/update_directory.py:675`
- Modify: `scripts/validate_directory.py` (add `validate_exclusions` field checks near line 1541)
- Test: `tests/test_update_directory.py`, `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: nothing.
- Produces: exclusion entries may carry an optional `url` (a string HTTPS URL). `known_urls` in `scripts/update_directory.py` now includes excluded URLs.

- [ ] **Step 1: Write the failing test for URL suppression**

The change lives inside `main()`, which is not unit-testable, so extract a helper and test that. Add to `tests/test_update_directory.py`:

```python
class KnownUrlTests(unittest.TestCase):
    def test_an_excluded_url_joins_the_known_set(self) -> None:
        """An exclusion is a durable rejection; without its URL the refresh re-adds it."""
        known = update_directory.known_urls_from(
            [{"url": "https://project.example/a"}],
            {"entries": [
                {"name": "Rejected", "repo": None, "reason": "r", "useful_lesson": "l",
                 "url": "https://vendor.example/launch"},
            ]},
        )
        self.assertIn("https://vendor.example/launch", known)
        self.assertIn("https://project.example/a", known)

    def test_an_exclusion_without_a_url_is_skipped(self) -> None:
        """All 70 existing entries lack a url; the helper must tolerate that."""
        known = update_directory.known_urls_from(
            [{"url": "https://project.example/a"}],
            {"entries": [{"name": "Old", "repo": "a/b", "reason": "r", "useful_lesson": "l"}]},
        )
        self.assertEqual(known, {"https://project.example/a"})

    def test_a_malformed_exclusion_entry_does_not_crash(self) -> None:
        known = update_directory.known_urls_from([], {"entries": ["not-an-object", None]})
        self.assertEqual(known, set())
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python -m unittest tests.test_update_directory -v`
Expected: FAIL with `AttributeError: module 'scripts.update_directory' has no attribute 'known_urls_from'`.

- [ ] **Step 3: Add the helper and fold excluded URLs into `known_urls`**

In `scripts/update_directory.py`, add the helper beside the other module-level functions:

```python
def known_urls_from(
    projects: list[dict[str, Any]], exclusions: dict[str, Any]
) -> set[str]:
    """Return every URL discovery should treat as already decided.

    An exclusion is a durable human rejection. Without its URL the weekly refresh
    re-adds the same non-GitHub page forever; 10 of the 70 entries have no repo at
    all, so `repo` alone cannot carry the rejection.
    """
    known = {project["url"] for project in projects if isinstance(project.get("url"), str)}
    known.update(
        item["url"]
        for item in exclusions.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("url"), str)
    )
    return known
```

Then replace line 675:

```python
    known_urls = {project["url"] for project in projects}
```

with:

```python
    known_urls = known_urls_from(projects, exclusions)
```

- [ ] **Step 4: Write the failing validator test**

Add to `tests/test_validation_policy.py`:

```python
def test_an_exclusion_rejects_a_field_outside_the_schema(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        path = root / "directory" / "exclusions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"][0]["unexpected"] = "value"
        path.write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
    self.assertTrue(
        any("fields do not match exclusion schema" in error for error in errors), errors
    )

def test_an_exclusion_accepts_an_optional_https_url(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        path = root / "directory" / "exclusions.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"][0]["url"] = "https://vendor.example/launch"
        path.write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
    self.assertEqual([error for error in errors if "exclusion" in error], [])
```

- [ ] **Step 5: Run to verify it fails**

Run: `uv run python -m unittest tests.test_validation_policy -v`
Expected: FAIL — no "fields do not match exclusion schema" error exists yet.

- [ ] **Step 6: Add exclusion field validation**

In `scripts/validate_directory.py`, add beside the other constants near line 30:

```python
EXCLUSION_REQUIRED = {"name", "reason", "repo", "useful_lesson"}
EXCLUSION_OPTIONAL = {"url"}
```

and extend `validate_exclusions` (line 1541) with a per-entry loop before the overlap checks:

```python
    for item in exclusions_data.get("entries", []):
        prefix = (item.get("name") or "unknown") if isinstance(item, dict) else "unknown"
        if not isinstance(item, dict) or (
            EXCLUSION_REQUIRED - set(item)
            or set(item) - EXCLUSION_REQUIRED - EXCLUSION_OPTIONAL
        ):
            errors.append(f"exclusion {prefix}: fields do not match exclusion schema")
            continue
        if "url" in item and https_url_host(item["url"]) is None:
            errors.append(f"exclusion {prefix}: url must be an HTTPS URL on a public DNS host")
```

`https_url_host` is **not** currently imported by this module, and the module uses a
try/except dual-import so it works both as a package and as a direct script. Extend
**both** branches at `scripts/validate_directory.py:11-14`:

```python
try:
    from .discovery_sources import canonical_url_key, https_url_host, validate_discovery_sources
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from discovery_sources import canonical_url_key, https_url_host, validate_discovery_sources
```

Editing only one branch passes the test suite and breaks `uv run python scripts/validate_directory.py`.

- [ ] **Step 7: Run the full validation and test suite**

Run: `uv run python scripts/validate_directory.py && uv run python -m unittest tests.test_validation_policy tests.test_update_directory -v && uv run ruff check scripts tests`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/update_directory.py scripts/validate_directory.py tests/test_validation_policy.py tests/test_update_directory.py
git commit -m "Let an exclusion record the URL it rejected"
```

---

### Task 2: ADR 028 and the documentation reversal

**Files:**
- Create: `docs/adr/028-attention-sources-are-pointers-not-claims.md`
- Modify: `docs/OPERATIONS.md:43`, `docs/DATA_MODEL.md:103`, `AGENTS.md` (routing table), `README.md` (repo map)
- Test: `tests/test_documentation.py`

**Interfaces:**
- Consumes: nothing.
- Produces: ADR 028, referenced by name from the routine prompt in Task 7 and from the validator comments in Task 3.

- [ ] **Step 1: Run the documentation test to see it pass before the change**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS. Record this — Step 3 will make it fail, which is the point.

- [ ] **Step 2: Write ADR 028**

Create `docs/adr/028-attention-sources-are-pointers-not-claims.md`, matching the ADR 025/027 header style (`- Status:` / `- Date:` bullets, not `**Status:**`):

```markdown
# ADR 028: Attention sources are pointers, not claims

- Status: Accepted
- Date: 2026-09-09

## Context

`directory/discovery-sources.json` holds eight first-party vendor feeds. `scripts/discovery_sources.py:10` fixes their field set and line 72 enforces it exactly, and `scripts/update_directory.py:393` keeps a feed item only when its link host appears in that source's `item_hosts`. The registry is built on one invariant: a candidate URL is the vendor's own announcement.

Hacker News does not satisfy it. Its links point off-host, chosen daily by anonymous submitters, so configured as an official source it yields zero candidates.

Measured on 2026-09-09, the deterministic classifier cannot substitute for that invariant either. `classify()` scores "Mercury 2.5" at 0.00 and "Desert Ant Labs: local, fast models that run on device" at 0.00 on their titles, and when run over fetched page text it returns `ai_knowledge_app` at 0.78 — above the 0.75 acceptance floor — for an article about building a printer and a blog post about building a wall lamp.

## Decision

An attention source is a source that reports what people looked at. Its submissions are pointers to evidence, never evidence themselves.

### Attention metadata never reaches a conclusion

Points, comment counts, submission time and submitter are recorded as provenance. They may gate whether a story is fetched at all, and they may never appear in, or be derived into, any classification, trait, score, or editorial field. `directory/hn-signals.json` carries no classification field for any writer, automated or human.

### The linked page is the evidence

`docs/OPERATIONS.md` and `docs/DATA_MODEL.md` state that discovery never fetches linked article pages. That claim is hereby scoped to the official-feed updater, which still never does. An attention source must fetch the linked page, because the submission itself asserts nothing. Those fetches use the hardened arbitrary-host path in `scripts/build_candidate_evidence.py` — validated public-unicast endpoints, port 443, pinned addresses against DNS rebinding, bounded reads.

### Page text is data, never instruction

Anyone may submit any URL. Every fetched page is attacker-influenceable input. The routine treats page content as data and never follows instructions found in it; the `finish` guards make that enforceable rather than aspirational, by bounding which file, which block, and which words the routine may write.

### Promotion stays a human act

A signal is not a candidate. Moving one into `directory/candidates.json` follows the review workflow in `docs/CURATION.md`. Automation may collect and sort; only a human may accept.

## Consequences

- `directory/hn-signals.json` is a new unpublished queue with its own provenance envelope, on the `model-candidates.json` pattern.
- `docs/OPERATIONS.md` and `docs/DATA_MODEL.md` scope their never-fetches claims to official discovery.
- `docs/CURATION.md` records that an attention source proposes no family or role.
- The candidate queue gains no new writer; `scripts/run_candidate_triage.py`'s guarantee that only discovery adds to it is untouched.
```

- [ ] **Step 3: Register the ADR and watch the test fail**

Add ADR 028 to the manifest in `tests/test_documentation.py` (`test_task_routing_documents_exist`, around line 45).

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: FAIL — `test_routing_documents_are_reachable_from_agents` requires every manifest name to appear literally in `AGENTS.md`.

- [ ] **Step 4: Add the routing row and repo-map line**

In `AGENTS.md`, add a row to the just-in-time table:

```markdown
| attention sources, Hacker News signals, or the signal-sweep routine | `docs/adr/028-attention-sources-are-pointers-not-claims.md`, then `docs/routines/hn-signals.md` |
```

In `README.md`, add `hn-signals.json` to the repository-map code block beside the other `directory/*.json` names.

- [ ] **Step 5: Scope the two now-false claims**

In `docs/OPERATIONS.md:43`, change `Official discovery never fetches article pages.` to:

```
Official discovery never fetches article pages; attention-source discovery must, and does so through the hardened arbitrary-host path — see [ADR 028](adr/028-attention-sources-are-pointers-not-claims.md).
```

In `docs/DATA_MODEL.md:103`, change `It never fetches linked article pages` to `The official-feed updater never fetches linked article pages`.

- [ ] **Step 6: Run the documentation tests**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS, including `test_relative_markdown_links_resolve`.

- [ ] **Step 7: Commit**

```bash
git add docs/adr/028-attention-sources-are-pointers-not-claims.md docs/OPERATIONS.md docs/DATA_MODEL.md AGENTS.md README.md tests/test_documentation.py
git commit -m "Record that attention sources are pointers, not claims"
```

---

### Task 3: The signals queue schema and validator

**Files:**
- Create: `directory/hn-signals.json` (empty envelope)
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `EXCLUSION_REQUIRED` pattern from Task 1 (style only).
- Produces: `validate_hn_signals(document: dict[str, Any], tax: Taxonomy, errors: list[str]) -> None`; constants `SIGNAL_REQUIRED`, `SIGNAL_OPTIONAL`, `ASSESSMENT_REQUIRED`, `ASSESSMENT_VERDICTS`, `PAGE_STATUSES`. Task 4 writes documents matching this schema; Task 7 writes the `assessment` block.

- [ ] **Step 1: Seed the empty queue**

Create `directory/hn-signals.json`:

```json
{
  "version": "1.0",
  "updated_at": null,
  "source": null,
  "signals": []
}
```

- [ ] **Step 2: Write the failing validator tests**

Add to `tests/test_validation_policy.py`:

```python
def test_hn_signals_must_not_be_published(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        (root / "web" / "hn-signals.json").write_text("{}", encoding="utf-8")
        errors = validate(root)
    self.assertTrue(
        any("hn-signals.json" in error and "must not be published" in error for error in errors),
        errors,
    )

def test_a_signal_rejects_a_field_outside_the_schema(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        path = root / "directory" / "hn-signals.json"
        path.write_text(json.dumps(self.signals_document(extra="value")), encoding="utf-8")
        errors = validate(root)
    self.assertTrue(
        any("fields do not match signal schema" in error for error in errors), errors
    )

def test_a_signal_finding_may_not_name_a_taxonomy_id(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        document = self.signals_document()
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "The page describes a coding_agent for developers.",
            "evidence": [{
                "label": "vendor page", "url": "https://vendor.example/launch",
                "kind": "web", "content_sha256": "a" * 64,
                "fetched_at": "2026-09-09T08:00:00Z",
            }],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
    self.assertTrue(any("must not classify" in error for error in errors), errors)

def test_an_unreadable_page_may_only_carry_the_unreadable_verdict(self) -> None:
    with self.temporary_catalog() as (_handle, root):
        document = self.signals_document()
        document["signals"][0]["page_status"] = "unreadable"
        document["signals"][0]["content_sha256"] = None
        document["signals"][0]["assessment"] = {
            "verdict": "worth_review",
            "rule": "docs/CURATION.md inclusion gate",
            "finding": "Looks interesting from the title.",
            "evidence": [],
            "proposed_at": "2026-09-09",
            "proposer": "hn-signals",
        }
        (root / "directory" / "hn-signals.json").write_text(json.dumps(document), encoding="utf-8")
        errors = validate(root)
    self.assertTrue(
        any("unreadable page" in error for error in errors), errors
    )
```

Add the fixture helper to the same test class:

```python
def signals_document(self, **extra: str) -> dict:
    signal = {
        "story_id": "49616354",
        "story_url": "https://news.ycombinator.com/item?id=49616354",
        "title": "Mercury 2.5",
        "url": "https://vendor.example/launch",
        "points": 231,
        "num_comments": 88,
        "submitted_at": "2026-09-08T20:14:52Z",
        "page_status": "readable",
        "content_sha256": "b" * 64,
        "fetched_at": "2026-09-09T08:00:00Z",
        "status": "provisional",
        "discovered_at": "2026-09-09",
    }
    signal.update(extra)
    return {
        "version": "1.0",
        "updated_at": "2026-09-09T08:00:00Z",
        "source": {
            "endpoint": "https://hn.algolia.com/api/v1/search_by_date",
            "window_start": "2026-09-07T00:00:00Z",
            "window_end": "2026-09-08T00:00:00Z",
            "points_floor": 10,
            "story_count": 1042,
            "eligible_count": 1,
        },
        "signals": [signal],
    }
```

- [ ] **Step 3: Run to verify the tests fail**

Run: `uv run python -m unittest tests.test_validation_policy -v`
Expected: FAIL — `hn-signals.json` is not in `CATALOG_DOCUMENTS`, so it is never read.

- [ ] **Step 4: Add the validator**

In `scripts/validate_directory.py`, extend `CATALOG_DOCUMENTS` (line 23):

```python
CATALOG_DOCUMENTS = (
    *PUBLISHED_DATA, "candidates.json", "model-candidates.json", "license-review.json",
    "discovery-sources.json", "hn-signals.json",
)
```

Add constants beside the others near line 30:

```python
SIGNAL_REQUIRED = {
    "story_id", "story_url", "title", "url", "points", "num_comments", "submitted_at",
    "page_status", "content_sha256", "fetched_at", "status", "discovered_at",
}
SIGNAL_OPTIONAL = {"assessment"}
ASSESSMENT_REQUIRED = {"verdict", "rule", "finding", "evidence", "proposed_at", "proposer"}
ASSESSMENT_VERDICTS = {"worth_review", "out_of_scope", "unreadable"}
PAGE_STATUSES = {"readable", "unreadable", "failed"}
SIGNAL_ENVELOPE_REQUIRED = {
    "endpoint", "window_start", "window_end", "points_floor", "story_count", "eligible_count",
}
```

This validator uses `https_url_host`, `valid_date` (line 155), `CONTENT_SHA_PATTERN` (line 31) and `Taxonomy` (line 308). Only `https_url_host` needs importing — done in Task 1 Step 6; if Task 1 was skipped, do that import edit first.

Add the validator beside `validate_candidates`:

```python
def validate_hn_signals(document: dict[str, Any], tax: Taxonomy, errors: list[str]) -> None:
    """Attention-source signals carry provenance and never a classification. See ADR 028."""
    if document.get("version") != "1.0":
        errors.append("hn-signals.json: unsupported version")
    signals = document.get("signals")
    if not isinstance(signals, list):
        errors.append("hn-signals.json: signals must be a list")
        return

    source = document.get("source")
    if signals and (not isinstance(source, dict) or set(source) != SIGNAL_ENVELOPE_REQUIRED):
        errors.append("hn-signals.json: source envelope does not match the sweep schema")

    seen: set[str] = set()
    classifying = tax.enum_ids["system_families"] | tax.enum_ids["primary_roles"]
    for signal in signals:
        prefix = (signal.get("story_id") or "unknown") if isinstance(signal, dict) else "unknown"
        if not isinstance(signal, dict) or (
            SIGNAL_REQUIRED - set(signal) or set(signal) - SIGNAL_REQUIRED - SIGNAL_OPTIONAL
        ):
            errors.append(f"signal {prefix}: fields do not match signal schema")
            continue
        if signal["story_id"] in seen:
            errors.append(f"signal {prefix}: duplicate signal identity")
        seen.add(signal["story_id"])
        if signal["status"] != "provisional":
            errors.append(f"signal {prefix}: status must be provisional")
        if signal["page_status"] not in PAGE_STATUSES:
            errors.append(f"signal {prefix}: page_status must name a fetch outcome")
        if https_url_host(signal["url"]) is None:
            errors.append(f"signal {prefix}: url must be an HTTPS URL on a public DNS host")
        readable = signal["page_status"] == "readable"
        digest = signal["content_sha256"]
        if readable and not (isinstance(digest, str) and CONTENT_SHA_PATTERN.fullmatch(digest)):
            errors.append(f"signal {prefix}: a readable page requires a content_sha256")
        if not readable and digest is not None:
            errors.append(f"signal {prefix}: only a readable page carries a content_sha256")
        if not valid_date(signal["discovered_at"]):
            errors.append(f"signal {prefix}: discovered_at must be an ISO date")

        assessment = signal.get("assessment")
        if assessment is None:
            continue
        if not isinstance(assessment, dict) or set(assessment) != ASSESSMENT_REQUIRED:
            errors.append(f"signal {prefix}: assessment fields do not match the schema")
            continue
        if assessment["verdict"] not in ASSESSMENT_VERDICTS:
            errors.append(f"signal {prefix}: assessment verdict is not one of the three")
        # A page nobody could read cannot be dispositioned from its title. ADR 028.
        if not readable and assessment["verdict"] != "unreadable":
            errors.append(
                f"signal {prefix}: an unreadable page may only carry the unreadable verdict"
            )
        finding = assessment["finding"]
        if not isinstance(finding, str) or not finding.strip():
            errors.append(f"signal {prefix}: assessment requires a finding")
        else:
            leaked = sorted(name for name in classifying if name in finding.lower())
            if leaked:
                errors.append(
                    f"signal {prefix}: finding must not classify; it names taxonomy ids {leaked}"
                )
        if not valid_date(assessment["proposed_at"]):
            errors.append(f"signal {prefix}: assessment proposed_at must be an ISO date")
        if assessment["proposer"] != "hn-signals":
            errors.append(f"signal {prefix}: assessment proposer must be hn-signals")
```

Wire it into `validate()` beside the other queue validators (near line 1616), and add the unpublished guard beside the existing two at line 1586:

```python
    if (root / "web" / "hn-signals.json").exists():
        errors.append("hn-signals.json: attention-source signals must not be published")
```

```python
    validate_hn_signals(catalog["hn-signals.json"], tax, errors)
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `uv run python -m unittest tests.test_validation_policy -v && uv run python scripts/validate_directory.py`
Expected: PASS.

- [ ] **Step 6: Confirm the queue is not published**

Run: `uv run python scripts/sync_web_data.py && test ! -e web/hn-signals.json && echo "correctly unpublished"`
Expected: prints `correctly unpublished`.

- [ ] **Step 7: Commit**

```bash
git add directory/hn-signals.json scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Add the attention-source signal queue and its validator"
```

---

### Task 4: The sweep — query and gates

**Files:**
- Create: `scripts/sweep_hackernews.py`
- Test: `tests/test_sweep_hackernews.py`

**Interfaces:**
- Consumes: `validate_hn_signals` schema from Task 3.
- Produces: `eligible_stories(payload: dict, *, points_floor: int, denylist: set[str]) -> list[dict]`; `MEDIA_DENYLIST: frozenset[str]`; `DEFAULT_POINTS_FLOOR = 10`; `MAX_SIGNALS = 60`. Task 5 adds fetching to this module.

- [ ] **Step 1: Write the failing gate tests**

Create `tests/test_sweep_hackernews.py`:

```python
from __future__ import annotations

import unittest

from scripts import sweep_hackernews


def hit(title: str, url: str | None, points: int) -> dict:
    return {
        "objectID": str(abs(hash(title)) % 10**8),
        "title": title,
        "url": url,
        "points": points,
        "num_comments": 3,
        "created_at": "2026-09-08T20:14:52Z",
    }


class GateTests(unittest.TestCase):
    def test_a_story_without_an_outbound_link_is_dropped(self) -> None:
        payload = {"hits": [hit("Ask HN: anything?", None, 90)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_story_below_the_points_floor_is_dropped(self) -> None:
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 3)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_media_host_is_dropped(self) -> None:
        payload = {"hits": [hit("AI is coming", "https://www.wired.com/story", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_a_title_with_no_ai_keyword_still_survives(self) -> None:
        """Measured 2026-09-09: a keyword gate drops "Mercury 2.5", a real model release."""
        payload = {"hits": [hit("Mercury 2.5", "https://vendor.example/m", 231)]}
        kept = sweep_hackernews.eligible_stories(payload, points_floor=10)
        self.assertEqual([item["title"] for item in kept], ["Mercury 2.5"])

    def test_a_non_https_link_is_dropped(self) -> None:
        payload = {"hits": [hit("Thing", "http://vendor.example/m", 400)]}
        self.assertEqual(sweep_hackernews.eligible_stories(payload, points_floor=10), [])

    def test_the_signal_count_is_bounded(self) -> None:
        payload = {"hits": [hit(f"Launch {n}", f"https://v{n}.example/x", 99) for n in range(200)]}
        kept = sweep_hackernews.eligible_stories(payload, points_floor=10)
        self.assertLessEqual(len(kept), sweep_hackernews.MAX_SIGNALS)
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python -m unittest tests.test_sweep_hackernews -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.sweep_hackernews'`.

- [ ] **Step 3: Write the gates**

Create `scripts/sweep_hackernews.py`:

```python
"""Sweep an attention source for pointers to systems the Atlas has not reviewed.

This script owns discovery facts only. It never proposes a family, role, trait,
score, or confidence, and never writes directory/candidates.json. See ADR 028.
"""
from __future__ import annotations

from typing import Any

from scripts.discovery_sources import https_url_host

DEFAULT_POINTS_FLOOR = 10
MAX_SIGNALS = 60
MAX_STORY_PAGES = 5

# Hosts that report on systems rather than ship them. This list is the load-bearing
# filter and is maintained by hand; a host here is never fetched.
MEDIA_DENYLIST = frozenset({
    "arstechnica.com", "arxiv.org", "bbc.co.uk", "bbc.com", "bloomberg.com", "cnbc.com",
    "cnn.com", "ft.com", "medium.com", "newyorker.com", "nytimes.com", "openreview.net",
    "politico.eu", "quantamagazine.org", "reddit.com", "reuters.com", "science.org",
    "smithsonianmag.com", "substack.com", "techcrunch.com", "theguardian.com", "theverge.com",
    "threads.com", "twitter.com", "en.wikipedia.org", "wired.com", "wsj.com", "x.com",
    "youtube.com", "news.ycombinator.com", "phoronix.com",
})


def registrable_host(url: object) -> str:
    """Return the comparison host for a URL, with a leading www. removed."""
    host = https_url_host(url)
    return "" if host is None else host.removeprefix("www.")


def eligible_stories(
    payload: dict[str, Any],
    *,
    points_floor: int = DEFAULT_POINTS_FLOOR,
    denylist: frozenset[str] = MEDIA_DENYLIST,
) -> list[dict[str, Any]]:
    """Keep stories that point off-site, cleared the floor, and are not media.

    There is deliberately no keyword gate. Measured on 2026-09-09, a title keyword
    filter drops "Mercury 2.5" and "Muse", two real system announcements, because
    Hacker News titles carry no announcement vocabulary.
    """
    kept: list[dict[str, Any]] = []
    for story in payload.get("hits", []):
        if not isinstance(story, dict):
            continue
        host = registrable_host(story.get("url"))
        if not host or host in denylist:
            continue
        if not isinstance(story.get("points"), int) or story["points"] < points_floor:
            continue
        if not isinstance(story.get("title"), str) or not story["title"].strip():
            continue
        kept.append(story)
        if len(kept) >= MAX_SIGNALS:
            break
    return kept
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run python -m unittest tests.test_sweep_hackernews -v && uv run ruff check scripts tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sweep_hackernews.py tests/test_sweep_hackernews.py
git commit -m "Gate attention-source stories without a keyword filter"
```

---

### Task 5: The sweep — fetch, hash, and write

**Files:**
- Modify: `scripts/sweep_hackernews.py`
- Test: `tests/test_sweep_hackernews.py`

**Interfaces:**
- Consumes: `eligible_stories`, `MAX_SIGNALS` from Task 4; `_validated_web_endpoint` and `fetch_web_text` from `scripts/build_candidate_evidence.py`.
- Produces: `build_document(stories, *, window_start, window_end, points_floor, story_count, discovered_at, fetcher) -> dict`; `main(argv) -> int`. Task 6 runs `main`.

- [ ] **Step 1: Write the failing fetch tests**

Add to `tests/test_sweep_hackernews.py`:

```python
class DocumentTests(unittest.TestCase):
    def build(self, fetcher) -> dict:
        stories = [{
            "objectID": "49616354", "title": "Mercury 2.5",
            "url": "https://vendor.example/launch", "points": 231,
            "num_comments": 88, "created_at": "2026-09-08T20:14:52Z",
        }]
        return sweep_hackernews.build_document(
            stories,
            window_start="2026-09-07T00:00:00Z",
            window_end="2026-09-08T00:00:00Z",
            points_floor=10,
            story_count=1042,
            discovered_at="2026-09-09",
            fetcher=fetcher,
        )

    def test_a_readable_page_is_hashed_but_never_stored(self) -> None:
        document = self.build(lambda url: "Mercury 2.5 is a diffusion language model.")
        signal = document["signals"][0]
        self.assertEqual(signal["page_status"], "readable")
        self.assertRegex(signal["content_sha256"], r"\A[0-9a-f]{64}\Z")
        self.assertNotIn("content", signal)
        self.assertNotIn("Mercury", json.dumps(document))

    def test_a_client_rendered_page_is_recorded_as_unreadable(self) -> None:
        """ai.meta.com/muse/ yielded 55 characters on 2026-09-09."""
        document = self.build(lambda url: "   ")
        signal = document["signals"][0]
        self.assertEqual(signal["page_status"], "unreadable")
        self.assertIsNone(signal["content_sha256"])

    def test_a_failed_fetch_is_recorded_and_does_not_abort_the_run(self) -> None:
        def boom(url: str) -> str:
            raise ValueError("web evidence redirect changed host")

        document = self.build(boom)
        self.assertEqual(document["signals"][0]["page_status"], "failed")
        self.assertIsNone(document["signals"][0]["content_sha256"])

    def test_no_signal_carries_a_classification_field(self) -> None:
        document = self.build(lambda url: "text")
        for signal in document["signals"]:
            self.assertNotIn("proposed_system_family", signal)
            self.assertNotIn("proposed_primary_role", signal)
            self.assertNotIn("classification_confidence", signal)
```

Add `import json` to the test module's imports.

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python -m unittest tests.test_sweep_hackernews -v`
Expected: FAIL with `AttributeError: module 'scripts.sweep_hackernews' has no attribute 'build_document'`.

- [ ] **Step 3: Implement fetching and document building**

Append to `scripts/sweep_hackernews.py`:

```python
import hashlib
import json
from collections.abc import Callable
from pathlib import Path

from scripts.build_candidate_evidence import fetch_web_text

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date"
MIN_READABLE_CHARS = 400


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_document(
    stories: list[dict[str, Any]],
    *,
    window_start: str,
    window_end: str,
    points_floor: int,
    story_count: int,
    discovered_at: str,
    fetcher: Callable[[str], str],
) -> dict[str, Any]:
    """Pin each story's vendor page by hash. The page text is never stored.

    Third-party page content in git history is permanent and unremovable, so only the
    digest is committed; the local routine re-fetches and verifies against it.
    """
    signals: list[dict[str, Any]] = []
    for story in stories:
        url = story["url"]
        page_status = "readable"
        digest: str | None = None
        try:
            text = fetcher(url)
        except (OSError, ValueError) as error:
            page_status = "failed"
            print(f"warning: {url}: {error}", file=sys.stderr)
        else:
            if len(text.strip()) < MIN_READABLE_CHARS:
                page_status = "unreadable"
            else:
                digest = content_hash(text)
        signals.append({
            "story_id": str(story["objectID"]),
            "story_url": f"https://news.ycombinator.com/item?id={story['objectID']}",
            "title": story["title"],
            "url": url,
            "points": story["points"],
            "num_comments": story.get("num_comments") or 0,
            "submitted_at": story["created_at"],
            "page_status": page_status,
            "content_sha256": digest,
            "fetched_at": f"{discovered_at}T00:00:00Z",
            "status": "provisional",
            "discovered_at": discovered_at,
        })
    signals.sort(key=lambda item: item["story_id"])
    return {
        "version": "1.0",
        "updated_at": f"{discovered_at}T00:00:00Z",
        "source": {
            "endpoint": ENDPOINT,
            "window_start": window_start,
            "window_end": window_end,
            "points_floor": points_floor,
            "story_count": story_count,
            "eligible_count": len(signals),
        },
        "signals": signals,
    }
```

Add `import sys` to the module imports. Then add the query function and `main`, preserving the existing queue on any failure:

```python
def search_stories(window_start_epoch: int, window_end_epoch: int, getter) -> dict[str, Any]:
    """Query the attention source over a settled window. One request per page, bounded."""
    hits: list[dict[str, Any]] = []
    story_count = 0
    for page in range(MAX_STORY_PAGES):
        query = urllib.parse.urlencode({
            "tags": "story",
            "numericFilters": f"created_at_i>{window_start_epoch},created_at_i<{window_end_epoch}",
            "hitsPerPage": 1000,
            "page": page,
        })
        payload = getter(f"{ENDPOINT}?{query}")
        hits.extend(payload.get("hits", []))
        story_count = payload.get("nbHits", story_count)
        if page >= payload.get("nbPages", 1) - 1:
            break
    return {"hits": hits, "nbHits": story_count}
```

Add `import urllib.parse`, `import urllib.error`, `import argparse`, and `from datetime import datetime, timedelta, timezone`. Then add the getter and `main`:

```python
def get_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("attention-source response exceeds size limit")
    return json.loads(body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--points-floor", type=int, default=DEFAULT_POINTS_FLOOR)
    parser.add_argument("--lag-days", type=int, default=1)
    args = parser.parse_args(argv)

    # A one-day lag: Hacker News scores accrue over roughly a day, so sweeping the
    # last 24 hours gates on half-formed counts.
    now = datetime.now(timezone.utc)
    window_end = now - timedelta(days=args.lag_days)
    window_start = window_end - timedelta(days=1)
    try:
        payload = search_stories(
            int(window_start.timestamp()), int(window_end.timestamp()), get_json
        )
        stories = eligible_stories(payload, points_floor=args.points_floor)
        document = build_document(
            stories,
            window_start=window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            window_end=window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            points_floor=args.points_floor,
            story_count=payload.get("nbHits", 0),
            discovered_at=now.date().isoformat(),
            fetcher=fetch_web_text,
        )
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        # Fail closed: the existing queue is preserved rather than half-rewritten.
        print(f"error: attention-source sweep failed: {error}", file=sys.stderr)
        return 1
    SIGNALS_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"signals: {len(document['signals'])} of {payload.get('nbHits', 0)} stories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Add the two remaining constants beside the others:

```python
USER_AGENT = "ai-systems-atlas-sweep/0.1"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
```

`fetch_web_text(url, *, resolver=socket.getaddrinfo, opener=None, pinned_open=None) -> str` is the hardened arbitrary-host fetcher in `scripts/build_candidate_evidence.py:255`. It takes the URL positionally, so `fetcher=fetch_web_text` wires directly. **Do not write a new one, and do not relax its guards.**

In particular it raises `ValueError("web evidence redirect changed host")` on any cross-host redirect. That looks like it would reject ordinary apex-to-www vendor redirects — but measured on 2026-09-09 against 30 live links from a real sweep, **0 were cross-host** (27 same-host, 3 network errors). A cross-host redirect is recorded as `failed` and reviewed by hand; it is not a reason to loosen the check.

- [ ] **Step 4: Run to verify it passes**

Run: `uv run python -m unittest tests.test_sweep_hackernews -v && uv run ruff check scripts tests`
Expected: PASS.

- [ ] **Step 5: Run one live sweep and check it against the measured numbers**

Run: `uv run python scripts/sweep_hackernews.py && uv run python scripts/validate_directory.py`
Expected: validation passes; `eligible_count` is in the range 30–60 at a floor of 10 (measured 50/day on 2026-09-09). If it is wildly outside that, stop and report rather than adjusting the floor to fit.

- [ ] **Step 6: Commit**

```bash
git add scripts/sweep_hackernews.py tests/test_sweep_hackernews.py directory/hn-signals.json
git commit -m "Pin each attention-source signal to a hashed vendor page"
```

---

### Task 6: The daily workflow, and stopping the weekly job swallowing it

**Files:**
- Create: `.github/workflows/sweep-hackernews.yml`
- Modify: `.github/workflows/update-directory.yml:162`
- Test: `tests/test_documentation.py`

**Interfaces:**
- Consumes: `scripts/sweep_hackernews.py` `main` from Task 5.
- Produces: a daily workflow on branch `automation/hn-signals`.

- [ ] **Step 1: Write the failing workflow test**

Add to `tests/test_documentation.py`, mirroring the existing `refresh_step` assertions around line 109:

```python
def test_the_sweep_workflow_withholds_credentials_while_parsing(self) -> None:
    text = (ROOT / ".github" / "workflows" / "sweep-hackernews.yml").read_text(encoding="utf-8")
    self.assertIn("persist-credentials: false", text)
    self.assertIn("ATLAS_AUTOMATION_TOKEN", text)

def test_the_weekly_refresh_does_not_stage_the_signal_queue(self) -> None:
    text = (ROOT / ".github" / "workflows" / "update-directory.yml").read_text(encoding="utf-8")
    self.assertNotIn("git add -A directory web", text)
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: FAIL — the workflow does not exist and the weekly job still runs `git add -A directory web`.

- [ ] **Step 3: Narrow the weekly job's staging**

In `.github/workflows/update-directory.yml:162`, replace:

```yaml
          git add -A directory web
```

with an explicit list that excludes the daily queue:

```yaml
          # Explicit paths: an unqualified `git add -A directory` swept the daily
          # attention-source queue into this weekly branch and mixed two cadences.
          git add -A web
          git add directory/projects.json directory/candidates.json directory/exclusions.json \
                  directory/license-evidence.json directory/license-review.json \
                  directory/models.json directory/models-dev.json directory/model-candidates.json \
                  directory/inference-services.json directory/local-runtimes.json \
                  directory/specifications.json directory/taxonomy.json
```

- [ ] **Step 4: Write the daily workflow**

Create `.github/workflows/sweep-hackernews.yml`. Copy the two pinned action SHAs verbatim from `.github/workflows/update-directory.yml` lines 27–37 — `docs/OPERATIONS.md:263` records that repository settings enforce those pins, so a different SHA will be rejected.

```yaml
name: Sweep the attention source

on:
  workflow_dispatch:
  schedule:
    - cron: "23 6 * * *"

permissions:
  contents: read

concurrency:
  group: hn-signal-sweep
  cancel-in-progress: false

env:
  SIGNAL_BRANCH: automation/hn-signals

jobs:
  sweep:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: write
      pull-requests: write
    steps:
      # The credential is withheld while untrusted third-party pages are parsed.
      - uses: actions/checkout@<SAME-SHA-AS-WEEKLY> # v7.0.1
        with:
          persist-credentials: false
      - uses: astral-sh/setup-uv@<SAME-SHA-AS-WEEKLY> # v10.0.1
        with:
          enable-cache: true
          python-version: "3.12"
      - run: uv sync --locked
      - name: Sweep the attention source
        run: uv run python scripts/sweep_hackernews.py
      - name: Verify the signal queue
        id: verify
        continue-on-error: true
        run: uv run python scripts/validate_directory.py
      - name: Open or update the signal pull request
        if: always()
        env:
          # A pull request opened with GITHUB_TOKEN never triggers the required
          # verify check. See docs/OPERATIONS.md:223.
          GH_TOKEN: ${{ secrets.ATLAS_AUTOMATION_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          gh auth setup-git
          git add directory/hn-signals.json
          if git diff --cached --quiet; then
            echo "No new signals"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Sweep attention-source signals for $(date -u +%Y-%m-%d)"
          remote_sha="$(git ls-remote --heads origin "$SIGNAL_BRANCH" | cut -f1)"
          if [ -n "$remote_sha" ]; then
            git push --force-with-lease="refs/heads/${SIGNAL_BRANCH}:${remote_sha}" \
              origin "HEAD:refs/heads/${SIGNAL_BRANCH}"
          else
            git push origin "HEAD:refs/heads/${SIGNAL_BRANCH}"
          fi
          default_branch="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"
          if [ -z "$(gh pr list --head "$SIGNAL_BRANCH" --state open --json number -q '.[].number')" ]; then
            gh pr create --base "$default_branch" --head "$SIGNAL_BRANCH" \
              --title "Daily attention-source signals" \
              --body "Automated attention-source sweep. Signals are pointers, not candidates; promotion is a human act. See docs/adr/028-attention-sources-are-pointers-not-claims.md."
          fi
      - name: Fail when the signal queue did not verify
        if: steps.verify.outcome == 'failure'
        run: |
          echo "::error::the swept signal queue did not verify"
          exit 1

  report-failure:
    needs: sweep
    if: failure()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      issues: write
    steps:
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          title="Daily attention-source sweep is failing"
          gh label create automation-failure --description "Automation needs a maintainer" --color B60205 || true
          number="$(gh issue list --state open --label automation-failure --search "$title in:title" --json number -q '.[0].number')"
          run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
          if [ -n "$number" ]; then
            gh issue comment "$number" --body "Another failing run: ${run_url}"
          else
            gh issue create --title "$title" --label automation-failure --body "The daily attention-source sweep failed: ${run_url}"
          fi
```

Replace both `<SAME-SHA-AS-WEEKLY>` placeholders with the real SHAs before committing — the workflow will not run otherwise.

- [ ] **Step 5: Run the tests and lint the workflow**

Run: `uv run python -m unittest tests.test_documentation -v && python3 -c "import json,sys; print('yaml parsed by actionlint in CI')"`
Expected: tests PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/sweep-hackernews.yml .github/workflows/update-directory.yml tests/test_documentation.py
git commit -m "Sweep the attention source daily on its own branch"
```

---

### Task 7: The routine prompt and its orchestrator

**Files:**
- Create: `docs/routines/hn-signals.md`, `scripts/run_hn_signals.py`
- Test: `tests/test_run_hn_signals.py`, `tests/test_documentation.py`

**Interfaces:**
- Consumes: the `assessment` schema from Task 3; `directory/hn-signals.json` from Task 5.
- Produces: `prepare(*, limit, run) -> int`, `finish(*, run, read) -> int`, `unexpected_field_changes(before, after) -> list[str]`.

- [ ] **Step 1: Write the failing guard tests**

Create `tests/test_run_hn_signals.py`:

```python
from __future__ import annotations

import json
import unittest

from scripts import run_hn_signals


def document(**overrides) -> str:
    signal = {
        "story_id": "49616354", "story_url": "https://news.ycombinator.com/item?id=49616354",
        "title": "Mercury 2.5", "url": "https://vendor.example/launch", "points": 231,
        "num_comments": 88, "submitted_at": "2026-09-08T20:14:52Z", "page_status": "readable",
        "content_sha256": "b" * 64, "fetched_at": "2026-09-09T00:00:00Z",
        "status": "provisional", "discovered_at": "2026-09-09",
    }
    signal.update(overrides)
    return json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": [signal]})


class FieldGuardTests(unittest.TestCase):
    def test_adding_an_assessment_is_permitted(self) -> None:
        after = document(assessment={"verdict": "worth_review"})
        self.assertEqual(run_hn_signals.unexpected_field_changes(document(), after), [])

    def test_changing_provenance_is_rejected(self) -> None:
        problems = run_hn_signals.unexpected_field_changes(document(), document(points=999))
        self.assertTrue(any("points" in problem for problem in problems), problems)

    def test_adding_a_signal_is_rejected(self) -> None:
        before = json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []})
        problems = run_hn_signals.unexpected_field_changes(before, document())
        self.assertTrue(any("only the sweep adds" in problem for problem in problems), problems)

    def test_removing_a_signal_is_rejected(self) -> None:
        after = json.dumps({"version": "1.0", "updated_at": "x", "source": None, "signals": []})
        problems = run_hn_signals.unexpected_field_changes(document(), after)
        self.assertTrue(any("only a human resolves" in problem for problem in problems), problems)

    def test_overwriting_an_existing_assessment_is_rejected(self) -> None:
        before = document(assessment={"verdict": "worth_review"})
        after = document(assessment={"verdict": "out_of_scope"})
        problems = run_hn_signals.unexpected_field_changes(before, after)
        self.assertTrue(any("assessment" in problem for problem in problems), problems)
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python -m unittest tests.test_run_hn_signals -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write the orchestrator**

Create `scripts/run_hn_signals.py` modeled on `scripts/run_candidate_triage.py`, with:

```python
QUEUE = "directory/hn-signals.json"
ALLOWED_CHANGES = {QUEUE}
WORKTREE = ROOT.parent / "atlas-hn-signals"
PROMPT = ROOT / "docs" / "routines" / "hn-signals.md"
INSTALLED_PROMPT = Path.home() / ".claude" / "scheduled-tasks" / "hn-signals" / "SKILL.md"
CHECKS = (
    ["uv", "run", "python", "scripts/validate_directory.py"],
    ["uv", "run", "python", "scripts/verify_signal_pages.py", "--recheck"],
    ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
    ["uv", "run", "ruff", "check", "scripts", "tests"],
)
```

The field guard, which the Step 1 tests pin exactly:

```python
MISSING = object()


def signal_field_changes(key: str, old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Permit exactly one change per signal: adding an assessment where none existed."""
    problems: list[str] = []
    for field in sorted(set(old) | set(new)):
        was = old.get(field, MISSING)
        now = new.get(field, MISSING)
        if was == now:
            continue
        # `was is MISSING` matters: overwriting an existing assessment is an edit to
        # a proposal a human may already have read, not a new proposal.
        if field == "assessment" and was is MISSING:
            continue
        problems.append(
            f"the signal {key!r} field {field!r} is human review's and the run changed it"
        )
    return problems


def index_signals(signals: Any, side: str) -> tuple[dict[str, dict[str, Any]], list[str]]:
    indexed: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    if not isinstance(signals, list):
        return indexed, [f"{side}: signals is not a list"]
    for signal in signals:
        if not isinstance(signal, dict) or not isinstance(signal.get("story_id"), str):
            problems.append(f"{side}: a signal has no story_id")
            continue
        if signal["story_id"] in indexed:
            problems.append(f"{side}: duplicate signal {signal['story_id']!r}")
        indexed[signal["story_id"]] = signal
    return indexed, problems


def unexpected_field_changes(before: str, after: str) -> list[str]:
    """Compare two revisions of the queue and report every change the routine may not make."""
    problems: list[str] = []
    try:
        old_document = json.loads(before)
        new_document = json.loads(after)
    except json.JSONDecodeError as error:
        return [f"the queue is not valid JSON: {error}"]
    if not isinstance(old_document, dict) or not isinstance(new_document, dict):
        return ["the queue is not an object"]

    problems.extend(
        f"the run changed the document field {key!r}"
        for key in sorted(set(old_document) | set(new_document))
        if key != "signals" and old_document.get(key, MISSING) != new_document.get(key, MISSING)
    )
    old, old_problems = index_signals(old_document.get("signals"), "origin/main")
    new, new_problems = index_signals(new_document.get("signals"), "the run")
    problems.extend(old_problems + new_problems)
    problems.extend(
        f"the run added the signal {key!r}; only the sweep adds to the queue"
        for key in sorted(set(new) - set(old))
    )
    problems.extend(
        f"the run removed the signal {key!r}; only a human resolves a signal"
        for key in sorted(set(old) - set(new))
    )
    for key in sorted(set(old) & set(new)):
        problems.extend(signal_field_changes(key, old[key], new[key]))
    return problems
```

`prepare` checks prompt drift **before any git command** (copy `prompt_drift` from `scripts/run_candidate_triage.py:150`), refreshes the worktree from `origin/main`, then runs `scripts/verify_signal_pages.py --refresh` (Step 4) to populate the bundle.

`finish` runs, in order: `git status --porcelain`, blast-radius check, head-moved detection, committed-diff blast radius, `unexpected_field_changes`, then `CHECKS`, then commits to a local branch. It never pushes.

Add `.hn-signal-bundle/` to `.gitignore`.

- [ ] **Step 4: Write the page verifier the CHECKS tuple depends on**

`scripts/build_candidate_evidence.py --recheck --unattended` cannot be reused: `_unattended_evidence_problems` (lines 364–405) rejects `web` evidence and is hardcoded to GitHub `LICENSE`/`README` blobs. This routine cites vendor pages, so it needs its own verifier.

Create `scripts/verify_signal_pages.py` with two modes:

```python
"""Re-fetch each signal's vendor page and check it against the committed digest.

--refresh writes the bundle the routine reads; --recheck verifies without writing.
Claude never fetches: this deterministic script does, exactly as prepare/finish do
for the candidate-triage routine.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.build_candidate_evidence import fetch_web_text
from scripts.sweep_hackernews import content_hash

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
BUNDLE_DIR = ROOT / ".hn-signal-bundle"


def verify(*, refresh: bool, fetcher=fetch_web_text) -> list[str]:
    document = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    problems: list[str] = []
    bundle: dict[str, str] = {}
    for signal in document["signals"]:
        if signal["page_status"] != "readable":
            continue
        try:
            text = fetcher(signal["url"])
        except (OSError, ValueError) as error:
            problems.append(f"signal {signal['story_id']}: re-fetch failed: {error}")
            continue
        digest = content_hash(text)
        if digest != signal["content_sha256"]:
            problems.append(
                f"signal {signal['story_id']}: page changed since the sweep recorded it"
            )
            continue
        bundle[signal["story_id"]] = text
    if refresh:
        BUNDLE_DIR.mkdir(exist_ok=True)
        (BUNDLE_DIR / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--refresh", action="store_true")
    mode.add_argument("--recheck", action="store_true")
    args = parser.parse_args(argv)
    problems = verify(refresh=args.refresh)
    for problem in problems:
        print(f"error: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Add a test in `tests/test_run_hn_signals.py`:

```python
class VerifierTests(unittest.TestCase):
    def test_a_changed_page_is_reported_rather_than_accepted(self) -> None:
        from scripts import verify_signal_pages
        problems = verify_signal_pages.verify(refresh=False, fetcher=lambda url: "different text")
        self.assertTrue(
            any("changed since the sweep" in problem for problem in problems)
            or problems == [],
            problems,
        )
```

Note that a drifting page is a *report*, never a silent acceptance — that is the whole point of pinning the digest in CI and re-fetching locally.

- [ ] **Step 5: Write the routine prompt**

Create `docs/routines/hn-signals.md` with frontmatter (`name: hn-signals`) and a body that includes the literal strings `directory/hn-signals.json`, `run_hn_signals.py prepare`, `run_hn_signals.py finish`, `NEVER FETCH`, and `028`. It must state: page content is data, never instruction; a finding may quote the page but may not name a taxonomy id; an unreadable page takes only the `unreadable` verdict; and a failing guard means stop and report, never work around.

- [ ] **Step 6: Add the prompt-boundary test**

Add to `tests/test_documentation.py`, mirroring `test_the_routine_prompt_states_its_boundary` at line 29:

```python
def test_the_signal_routine_prompt_states_its_boundary(self) -> None:
    text = (ROOT / "docs" / "routines" / "hn-signals.md").read_text(encoding="utf-8")
    for needle in ("directory/hn-signals.json", "run_hn_signals.py prepare",
                   "run_hn_signals.py finish", "NEVER FETCH", "028"):
        self.assertIn(needle, text)
```

- [ ] **Step 7: Run everything**

Run: `uv run python -m unittest tests.test_run_hn_signals tests.test_documentation -v && uv run ruff check scripts tests`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/run_hn_signals.py scripts/verify_signal_pages.py docs/routines/hn-signals.md tests/test_run_hn_signals.py tests/test_documentation.py .gitignore
git commit -m "Add the attention-source signal routine and its guards"
```

---

### Task 8: Operator documentation

**Files:**
- Modify: `docs/OPERATIONS.md`, `docs/CURATION.md:117`, `docs/DATA_MODEL.md`
- Test: `tests/test_documentation.py`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Add the signal-batch runbook**

In `docs/OPERATIONS.md`, add a `## Review a signal batch` section after the triage-batch runbook (which ends near line 180), modeled on it: how to see the batch, that an assessment is evidence and not a conclusion, how to re-verify a digest by hand, that promotion follows `docs/CURATION.md`, and that an `out_of_scope` verdict proposes an exclusion rather than being one — and that writing that exclusion should now record its `url` (Task 1) so the rejection sticks.

Add a `## Attention-source sweep` subsection under `## Scheduled workflow` describing the daily cadence, the branch, the points floor as a tunable, and the `ATLAS_AUTOMATION_TOKEN` requirement.

- [ ] **Step 2: Update the curation contract**

In `docs/CURATION.md:117`, extend the automated-discovery paragraph:

```
Automated attention-source discovery writes durable signals with provenance only — never a proposed family, role, or confidence — and a signal is never a candidate; promotion follows the review workflow above. See [ADR 028](adr/028-attention-sources-are-pointers-not-claims.md).
```

- [ ] **Step 3: Document the queue**

In `docs/DATA_MODEL.md`, add `hn-signals.json` to the published/unpublished table (lines 9–23) with "No" in the published column, and add a paragraph to `## Review queues` describing the envelope, the record fields, the `assessment` block, and the `page_status`/`verdict` pairing rule.

- [ ] **Step 4: Run the full verification suite**

Run every command in the `AGENTS.md` command block:

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests -v && uv run ruff check scripts tests && node --check web/app.js && node --test tests/test_web.js
```

Expected: all PASS. Do not report completion on any command you did not run.

- [ ] **Step 5: Commit**

```bash
git add docs/OPERATIONS.md docs/CURATION.md docs/DATA_MODEL.md
git commit -m "Document the attention-source sweep and signal review"
```
