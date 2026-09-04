# Candidate Triage Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a local scheduled routine sort the candidate queue and gather pinned evidence, without writing anything `docs/CURATION.md` reserves for human review.

**Architecture:** An optional `triage` block on a candidate record carries a verdict, the rule it turns on, a prose finding, and cited evidence. A deterministic Python harness does all fetching and pinning; an agent reads the harness bundle and writes only judgment; validator rules and a blast-radius check make the boundary mechanical rather than advisory.

**Tech Stack:** Python 3.11+ standard library only (the project has zero runtime dependencies), `uv` for running, `unittest` for tests, `ruff` for linting.

**Spec:** `docs/superpowers/specs/2026-09-04-candidate-triage-routine-design.md`

## Global Constraints

- Python floor is 3.11. `pyproject.toml` sets `requires-python = ">=3.11"` and ruff `target-version = "py311"`. No backslash inside an f-string expression — that is a syntax error before 3.12.
- No new runtime dependencies. `[project].dependencies` stays empty; standard library only.
- Never edit any file under `directory/` other than `candidates.json` in routine code.
- Error strings are the contract that tests assert on. Use the existing prefix form exactly: `f"candidate {prefix}: ..."`.
- Every task ends green on: `uv run ruff check scripts tests`, `uv run python scripts/validate_directory.py`, `uv run python -m unittest discover -s tests`.
- Commit messages: imperative mood, no `feat:`/`fix:` prefixes — this repository does not use Conventional Commits (`git log --oneline` confirms).

---

## File Structure

**Created:**

- `scripts/build_candidate_evidence.py` — the deterministic harness: selection, carry-forward, cross-collection checks, class signals, fetching, and `--recheck`. No judgment.
- `scripts/run_candidate_triage.py` — orchestration: `prepare` and `finish` subcommands, including the four guards.
- `tests/test_candidate_evidence.py` — offline tests for both scripts, using injected getters.
- `docs/routines/candidate-triage.md` — the canonical routine prompt.
- `docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md`

**Modified:**

- `scripts/validate_directory.py` — candidate schema split, `validate_triage`, null family/role rule.
- `tests/test_validation_policy.py` — rules for all of the above.
- `tests/test_documentation.py` — routine-prompt drift test.
- `docs/DATA_MODEL.md`, `docs/CURATION.md`, `docs/OPERATIONS.md`, `AGENTS.md`, `BACKLOG.md`, `.gitignore`

---

### Task 1: Split the candidate schema into required and optional

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Produces: module constants `CANDIDATE_REQUIRED: set[str]`, `CANDIDATE_OPTIONAL: set[str]`. Later tasks add to `CANDIDATE_OPTIONAL`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_validation_policy.py`, inside `ValidationPolicyTests`:

```python
    def catalog_with_candidate(self, mutate=None) -> list[str]:
        """Validate a temporary catalog whose queue holds one synthetic candidate."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        path = root / "directory" / "candidates.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        candidate = {
            "repo": "sample/candidate",
            "name": "candidate",
            "url": "https://github.com/sample/candidate",
            "description": "A synthetic candidate used to exercise queue validation.",
            "proposed_system_family": "agent_system",
            "proposed_primary_role": "coding_agent",
            "classification_confidence": 0.8,
            "github_detected_license": "MIT",
            "stars": 100,
            "topics": ["agent"],
            "status": "provisional",
            "discovered_at": "2026-09-04",
            "review_required": ["licensing", "classification", "traits", "editorial_score"],
        }
        document["candidates"] = [candidate]
        if mutate is not None:
            mutate(candidate)
        self.write_json(path, document)
        return validate(root)

    def test_a_candidate_without_a_triage_block_is_valid(self) -> None:
        errors = self.catalog_with_candidate()
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_a_candidate_rejects_a_field_outside_the_schema(self) -> None:
        errors = self.catalog_with_candidate(lambda candidate: candidate.update({"surprise": 1}))
        self.assertTrue(any("fields do not match candidate schema" in error for error in errors), errors)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -k candidate -v`
Expected: `test_a_candidate_without_a_triage_block_is_valid` FAILS — the synthetic candidate's role `coding_agent` must exist in `directory/taxonomy.json`. If it does not, change both the role and family to a pair that does; run `uv run python -c "import json; t=json.load(open('directory/taxonomy.json')); print([(r['id'], r['family']) for r in t['primary_roles']][:5])"` to pick one.

- [ ] **Step 3: Hoist the schema to module constants**

In `scripts/validate_directory.py`, after the `INFERENCE_SERVICE_REQUIRED` block, add:

```python
CANDIDATE_REQUIRED = {
    "repo", "name", "url", "description", "proposed_system_family", "proposed_primary_role",
    "classification_confidence", "github_detected_license", "stars", "topics", "status",
    "discovered_at", "review_required",
}
CANDIDATE_OPTIONAL: set[str] = set()
```

In `validate_candidates`, delete the local `required = {...}` literal and replace the guard:

```python
        if not isinstance(candidate, dict) or (
            CANDIDATE_REQUIRED - set(candidate)
            or set(candidate) - CANDIDATE_REQUIRED - CANDIDATE_OPTIONAL
        ):
            errors.append(f"candidate {prefix}: fields do not match candidate schema")
            continue
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -v`
Expected: PASS. Then `uv run python scripts/validate_directory.py` — expected: the real catalog still validates.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Split the candidate schema into required and optional fields"
```

---

### Task 2: Validate the triage block's shape

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `CANDIDATE_OPTIONAL` from Task 1.
- Produces: `validate_triage(triage: Any, repo: Any, prefix: str, tax: Taxonomy, errors: list[str]) -> None`, and constants `TRIAGE_REQUIRED`, `TRIAGE_OPTIONAL`, `TRIAGE_VERDICTS`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_validation_policy.py`:

```python
    TRIAGE: ClassVar[dict] = {
        "verdict": "review_ready",
        "rule": "CURATION.md § Inclusion gate — operational product is identifiable",
        "finding": "The README documents a tool-using loop over a local index.",
        "evidence": [{
            "label": "README",
            "url": "https://github.com/sample/candidate/blob/main/README.md",
            "kind": "web",
            "content_sha256": "a" * 64,
            "fetched_at": "2026-09-04",
        }],
        "proposed_at": "2026-09-04",
        "proposer": "candidate-triage",
    }

    def candidate_with_triage(self, mutate=None) -> list[str]:
        def apply(candidate):
            candidate["triage"] = json.loads(json.dumps(self.TRIAGE))
            if mutate is not None:
                mutate(candidate["triage"], candidate)
        return self.catalog_with_candidate(apply)

    def test_a_valid_triage_block_passes(self) -> None:
        errors = self.candidate_with_triage()
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_triage_rejects_an_unknown_verdict(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"verdict": "publish"}))
        self.assertTrue(any("unknown triage verdict" in error for error in errors), errors)

    def test_triage_rejects_a_field_outside_its_schema(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"score": 9}))
        self.assertTrue(any("triage fields differ from schema" in error for error in errors), errors)

    def test_held_by_is_required_for_a_held_verdict(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"verdict": "held"}))
        self.assertTrue(any("held_by is required" in error for error in errors), errors)

    def test_held_by_is_forbidden_on_any_other_verdict(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"held_by": "BACKLOG.md — skill packs"}))
        self.assertTrue(any("held_by is required" in error for error in errors), errors)
```

Add `from typing import ClassVar` to the imports if Task not already present (it is — the file imports `ClassVar` for `SAMPLE_RUNTIME`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -k triage -v`
Expected: FAIL — `test_a_valid_triage_block_passes` reports "fields do not match candidate schema" because `triage` is not yet optional.

- [ ] **Step 3: Implement**

In `scripts/validate_directory.py`, set `CANDIDATE_OPTIONAL = {"triage"}` and add the constants beside it:

```python
TRIAGE_REQUIRED = {"verdict", "rule", "finding", "evidence", "proposed_at", "proposer"}
TRIAGE_OPTIONAL = {"held_by"}
TRIAGE_VERDICTS = {"out_of_scope", "held", "review_ready"}
```

Add the function immediately before `validate_candidates`:

```python
def validate_triage(
    triage: Any, repo: Any, prefix: str, tax: Taxonomy, errors: list[str]
) -> None:
    """Validate an unaccepted triage proposal: gathered evidence, never a conclusion."""
    if not isinstance(triage, dict):
        errors.append(f"candidate {prefix}: triage must be an object")
        return
    missing = sorted(TRIAGE_REQUIRED - set(triage))
    unknown = sorted(set(triage) - TRIAGE_REQUIRED - TRIAGE_OPTIONAL)
    if missing or unknown:
        errors.append(
            f"candidate {prefix}: triage fields differ from schema: missing={missing}, extra={unknown}"
        )
        return
    verdict = triage["verdict"]
    if verdict not in TRIAGE_VERDICTS:
        errors.append(f"candidate {prefix}: unknown triage verdict {verdict!r}")
    if (verdict == "held") != ("held_by" in triage):
        errors.append(
            f"candidate {prefix}: held_by is required for a held verdict and forbidden otherwise"
        )
    elif "held_by" in triage and (
        not isinstance(triage["held_by"], str) or not triage["held_by"].strip()
    ):
        errors.append(f"candidate {prefix}: held_by must name the decision that holds the record")
    for field in ("rule", "proposer"):
        if not isinstance(triage[field], str) or not triage[field].strip():
            errors.append(f"candidate {prefix}: triage {field} must be a non-empty string")
    if not valid_date(triage["proposed_at"]):
        errors.append(f"candidate {prefix}: triage proposed_at must be an ISO date")
```

Call it from `validate_candidates`, immediately after the `discovered_at` check at the end of the loop body:

```python
        if "triage" in candidate:
            validate_triage(candidate["triage"], candidate_repo, prefix, tax, errors)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Validate the shape of a triage proposal"
```

---

### Task 3: Validate cited evidence

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `validate_triage` from Task 2.
- Produces: `CONTENT_SHA_PATTERN`, evidence rules inside `validate_triage`.

- [ ] **Step 1: Write the failing tests**

```python
    def test_triage_evidence_requires_an_https_url(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage["evidence"][0].update({"url": "http://example.com"}))
        self.assertTrue(any("evidence requires an authoritative HTTPS URL" in e for e in errors), errors)

    def test_triage_evidence_requires_a_content_hash(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage["evidence"][0].update({"content_sha256": "nope"}))
        self.assertTrue(any("evidence requires a content_sha256" in e for e in errors), errors)

    def test_triage_evidence_must_not_be_empty(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"evidence": []}))
        self.assertTrue(any("triage evidence must be a non-empty list" in e for e in errors), errors)

    def test_git_blob_evidence_must_address_the_recorded_sha(self) -> None:
        def mutate(triage, _candidate):
            triage["evidence"][0] = {
                "label": "LICENSE",
                "url": "https://github.com/sample/candidate/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/sample/candidate/git/blobs/" + "1" * 40,
                "content_sha256": "a" * 64,
                "fetched_at": "2026-09-04",
            }
        errors = self.candidate_with_triage(mutate)
        self.assertTrue(any("immutable evidence URL must address the blob SHA" in e for e in errors), errors)

    def test_valid_git_blob_evidence_passes(self) -> None:
        def mutate(triage, _candidate):
            triage["evidence"][0] = {
                "label": "LICENSE",
                "url": "https://github.com/sample/candidate/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/sample/candidate/git/blobs/" + "0" * 40,
                "content_sha256": "a" * 64,
                "fetched_at": "2026-09-04",
            }
        errors = self.candidate_with_triage(mutate)
        self.assertFalse([e for e in errors if "sample/candidate" in e], errors)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -k evidence -v`
Expected: FAIL — no evidence rules exist yet.

- [ ] **Step 3: Implement**

Add beside `SHA_PATTERN` in `scripts/validate_directory.py`:

```python
CONTENT_SHA_PATTERN = re.compile(r"[0-9a-f]{64}")
EVIDENCE_REQUIRED = {"label", "url", "kind", "content_sha256", "fetched_at"}
BLOB_EVIDENCE_REQUIRED = {"blob_sha", "immutable_url"}
```

Append to `validate_triage`, before its closing:

```python
    items = triage["evidence"]
    if not isinstance(items, list) or not items:
        errors.append(f"candidate {prefix}: triage evidence must be a non-empty list")
        return
    for item in items:
        if not isinstance(item, dict):
            errors.append(f"candidate {prefix}: every evidence item must be an object")
            continue
        allowed = EVIDENCE_REQUIRED | (BLOB_EVIDENCE_REQUIRED if item.get("kind") == "git_blob" else set())
        if set(item) != allowed:
            errors.append(f"candidate {prefix}: evidence fields differ from schema")
            continue
        if not isinstance(item["label"], str) or not item["label"].strip():
            errors.append(f"candidate {prefix}: evidence requires a label")
        if not isinstance(item["url"], str) or not item["url"].startswith("https://"):
            errors.append(f"candidate {prefix}: evidence requires an authoritative HTTPS URL")
        if not isinstance(item["content_sha256"], str) or not CONTENT_SHA_PATTERN.fullmatch(
            item["content_sha256"]
        ):
            errors.append(f"candidate {prefix}: evidence requires a content_sha256")
        if not valid_date(item["fetched_at"]):
            errors.append(f"candidate {prefix}: evidence requires fetched_at")
        if item["kind"] == "git_blob":
            blob_sha = item["blob_sha"]
            if not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                errors.append(f"candidate {prefix}: invalid evidence blob SHA")
            elif item["immutable_url"] != f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}":
                errors.append(f"candidate {prefix}: immutable evidence URL must address the blob SHA")
        elif item["kind"] != "web":
            errors.append(f"candidate {prefix}: unknown evidence kind {item['kind']!r}")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Require triage evidence to be pinned and hashed"
```

---

### Task 4: Forbid a finding from classifying

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `validate_triage` from Task 2, `Taxonomy.enum_ids`.

This is the rule that makes "evidence, not conclusions" mechanical. It matches only `system_families` and `primary_roles` ids — the two axes the routine must not propose. Trait ids such as `cpu` are deliberately excluded, because a finding may legitimately quote a README that says "runs on cpu".

- [ ] **Step 1: Write the failing tests**

```python
    def test_a_finding_may_not_name_a_taxonomy_role(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"finding": "This is clearly a coding_agent."}))
        self.assertTrue(any("finding must not classify" in error for error in errors), errors)

    def test_a_finding_may_quote_prose_that_resembles_a_role(self) -> None:
        errors = self.candidate_with_triage(
            lambda triage, _: triage.update({"finding": 'The README calls it a "coding agent".'}))
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_a_finding_must_be_a_non_empty_string(self) -> None:
        errors = self.candidate_with_triage(lambda triage, _: triage.update({"finding": "  "}))
        self.assertTrue(any("triage requires a finding" in error for error in errors), errors)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -k finding -v`
Expected: FAIL on the first and third.

- [ ] **Step 3: Implement**

Add to `validate_triage`, after the `rule`/`proposer` loop:

```python
    finding = triage["finding"]
    if not isinstance(finding, str) or not finding.strip():
        errors.append(f"candidate {prefix}: triage requires a finding")
    else:
        classifying = tax.enum_ids["system_families"] | tax.enum_ids["primary_roles"]
        leaked = sorted(name for name in classifying if name in finding)
        if leaked:
            errors.append(
                f"candidate {prefix}: finding must not classify; it names taxonomy ids {leaked}"
            )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Keep a triage finding on the evidence side of the line"
```

---

### Task 5: Allow a null family and role while a decision holds the record

**Files:**
- Modify: `scripts/validate_directory.py`
- Test: `tests/test_validation_policy.py`

**Interfaces:**
- Consumes: `validate_triage` from Task 2.

Closes the second half of `BACKLOG.md` item 12: a record awaiting a collection that does not exist yet can finally wait in the queue.

- [ ] **Step 1: Write the failing tests**

```python
    def test_family_and_role_may_be_null_while_a_decision_holds_the_record(self) -> None:
        def mutate(triage, candidate):
            triage["verdict"] = "held"
            triage["held_by"] = "BACKLOG.md — labs whose models you serve yourself"
            candidate["proposed_system_family"] = None
            candidate["proposed_primary_role"] = None
        errors = self.candidate_with_triage(mutate)
        self.assertFalse([error for error in errors if "sample/candidate" in error], errors)

    def test_family_and_role_may_not_be_null_without_a_holding_decision(self) -> None:
        def mutate(candidate):
            candidate["proposed_system_family"] = None
            candidate["proposed_primary_role"] = None
        errors = self.catalog_with_candidate(mutate)
        self.assertTrue(any("may only be null" in error for error in errors), errors)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -k null -v`
Expected: FAIL — today both cases report "proposed family and role are incompatible".

- [ ] **Step 3: Implement**

In `validate_candidates`, replace the family/role check:

```python
        family = candidate["proposed_system_family"]
        role = candidate["proposed_primary_role"]
        triage = candidate.get("triage")
        held_by = triage.get("held_by") if isinstance(triage, dict) else None
        if family is None and role is None:
            if not held_by:
                errors.append(
                    f"candidate {prefix}: family and role may only be null while "
                    "triage.held_by names the decision that holds the record"
                )
        elif family not in families or role not in roles or roles.get(role) != family:
            errors.append(f"candidate {prefix}: proposed family and role are incompatible")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_validation_policy.py -v` then the full suite.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_directory.py tests/test_validation_policy.py
git commit -m "Let a held candidate wait without a family and role"
```

---

### Task 6: Record the decision and route to it

**Files:**
- Create: `docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md`
- Modify: `docs/DATA_MODEL.md`, `docs/CURATION.md`, `AGENTS.md`, `BACKLOG.md`
- Test: `tests/test_documentation.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_documentation.py`, inside the tuple in `test_task_routing_documents_exist`:

```python
            "docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md",
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run python -m unittest discover -s tests -p test_documentation.py -v`
Expected: FAIL on both `test_task_routing_documents_exist` (file missing) and `test_routing_documents_are_reachable_from_agents` (not routed from `AGENTS.md`).

- [ ] **Step 3: Write the ADR and the routing**

Create `docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md`, following the form of `docs/adr/022-general-pattern-content-is-not-a-collection.md`: a Status, Context, Decision, and Consequences section. The decision to record:

> A `triage` block on a candidate is gathered evidence and a routing proposal. It is never an editorial conclusion. It may carry a verdict, the rule that verdict turns on, the decision that holds the record, a prose finding, and pinned evidence. It may not carry a family, role, trait, score, `source_model`, confidence, or editorial prose, and validation rejects a finding that names a family or role id. Accepting a proposal — promoting a candidate, writing an exclusion, or resolving what holds it — remains a human act. Automation may add a block; only a human may act on one.

In `AGENTS.md`, add a routing row to the just-in-time table:

```markdown
| candidate triage, the queue's `triage` block, or the local triage routine | `docs/CURATION.md`, then `docs/adr/023-candidate-triage-proposals-are-unaccepted-evidence.md` and `docs/routines/candidate-triage.md` |
```

In `docs/DATA_MODEL.md`, under the candidate paragraph, document the `triage` block's fields, the `held_by` rule, and that family and role may be null only while held.

In `docs/CURATION.md`, add one sentence to "Human and automated fields": a triage proposal is evidence, and accepting it is a human act.

In `BACKLOG.md`, mark item 12 complete and move it to the `## Completed on 2026-09-04` section, noting both shapes are now expressible.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_documentation.py -v`
Expected: PASS, including `test_relative_markdown_links_resolve`.

- [ ] **Step 5: Commit**

```bash
git add docs AGENTS.md BACKLOG.md tests/test_documentation.py
git commit -m "Record ADR 023 and close the candidate-queue backlog item"
```

---

### Task 7: Select candidates and carry prior work forward

**Files:**
- Create: `scripts/build_candidate_evidence.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Produces:
  - `select_candidates(candidates: list[dict], limit: int) -> list[dict]` — returns candidates with no `triage` block, oldest `discovered_at` first, at most `limit`.
  - `carry_forward(candidates: list[dict], previous: list[dict]) -> int` — copies each `triage` block from `previous` onto the matching candidate in `candidates` that has none, matched on `repo` lowercased or `url`; returns how many were carried.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_candidate_evidence.py`:

```python
from __future__ import annotations

import unittest

from scripts import build_candidate_evidence as harness


def candidate(repo: str, discovered_at: str = "2026-09-01", **extra) -> dict:
    return {"repo": repo, "url": f"https://github.com/{repo}", "discovered_at": discovered_at, **extra}


class SelectionTests(unittest.TestCase):
    def test_selection_skips_candidates_that_already_carry_a_triage_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "held"}), candidate("b/two")]
        self.assertEqual(["b/two"], [item["repo"] for item in harness.select_candidates(queue, 10)])

    def test_selection_takes_the_oldest_first(self) -> None:
        queue = [candidate("a/new", "2026-09-03"), candidate("b/old", "2026-08-25")]
        self.assertEqual(["b/old"], [item["repo"] for item in harness.select_candidates(queue, 1)])

    def test_carry_forward_restores_prior_work_by_repo(self) -> None:
        queue = [candidate("a/one")]
        previous = [candidate("A/One", triage={"verdict": "held", "held_by": "x"})]
        self.assertEqual(1, harness.carry_forward(queue, previous))
        self.assertEqual("held", queue[0]["triage"]["verdict"])

    def test_carry_forward_never_overwrites_an_existing_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "review_ready"})]
        previous = [candidate("a/one", triage={"verdict": "out_of_scope"})]
        self.assertEqual(0, harness.carry_forward(queue, previous))
        self.assertEqual("review_ready", queue[0]["triage"]["verdict"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.build_candidate_evidence'`.

- [ ] **Step 3: Implement**

Create `scripts/build_candidate_evidence.py`:

```python
#!/usr/bin/env python3
"""Gather pinned, verifiable evidence for queued candidates.

This script makes no editorial judgment. It fetches and records; a human, or a
routine acting under docs/adr/023, decides what the evidence means.
"""
from __future__ import annotations

from typing import Any

ROOT_KEYS = ("repo", "url")


def candidate_key(candidate: dict[str, Any]) -> str:
    """Identify a candidate the same way the updater's queue does."""
    return str(candidate.get("repo") or candidate.get("url") or "").lower()


def select_candidates(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Return untriaged candidates, oldest discovery first, at most `limit`."""
    pending = [item for item in candidates if "triage" not in item]
    pending.sort(key=lambda item: str(item.get("discovered_at") or ""))
    return pending[:limit]


def carry_forward(candidates: list[dict[str, Any]], previous: list[dict[str, Any]]) -> int:
    """Copy triage blocks from a previous unmerged run onto candidates that lack one."""
    prior = {
        candidate_key(item): item["triage"] for item in previous if isinstance(item.get("triage"), dict)
    }
    carried = 0
    for item in candidates:
        block = prior.get(candidate_key(item))
        if block is not None and "triage" not in item:
            item["triage"] = block
            carried += 1
    return carried
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py
git commit -m "Select untriaged candidates and carry prior work forward"
```

---

### Task 8: Cross-check the catalog and flag obvious classes

**Files:**
- Modify: `scripts/build_candidate_evidence.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Produces:
  - `cross_collection_hits(candidate: dict, catalog: dict[str, list[dict]]) -> list[str]` — human-readable strings naming every collection already holding this repo, id, or URL. `catalog` maps a collection filename to its record list.
  - `class_signals(candidate: dict) -> list[str]` — names of obvious non-operational classes matched in the name, description, or topics.

`awesome-second-brain` reached the queue on 2026-09-03 despite `EXCLUDED` in `scripts/update_directory.py`, because that filter runs only on discovery text. This runs on the queued record.

- [ ] **Step 1: Write the failing tests**

```python
class CrossCheckTests(unittest.TestCase):
    def test_a_repo_already_excluded_is_reported(self) -> None:
        catalog = {"exclusions.json": [{"repo": "A/One"}], "projects.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("exclusions.json" in hit for hit in hits), hits)

    def test_a_repo_already_published_is_reported(self) -> None:
        catalog = {"projects.json": [{"repo": "a/one", "id": "one"}], "exclusions.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("projects.json" in hit for hit in hits), hits)

    def test_a_clean_candidate_reports_nothing(self) -> None:
        catalog = {"projects.json": [{"repo": "b/two", "id": "two"}], "exclusions.json": []}
        self.assertEqual([], harness.cross_collection_hits(candidate("a/one"), catalog))


class ClassSignalTests(unittest.TestCase):
    def test_an_awesome_list_is_flagged(self) -> None:
        item = candidate("aristoapp/awesome-second-brain", name="awesome-second-brain",
                         description="A curated list of tools.", topics=[])
        self.assertIn("awesome list", harness.class_signals(item))

    def test_a_benchmark_topic_is_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An evaluation suite.", topics=["benchmark"])
        self.assertIn("benchmark", harness.class_signals(item))

    def test_an_ordinary_candidate_is_not_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An agent runtime.", topics=["agents"])
        self.assertEqual([], harness.class_signals(item))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: FAIL with `AttributeError: module ... has no attribute 'cross_collection_hits'`.

- [ ] **Step 3: Implement**

Append to `scripts/build_candidate_evidence.py`:

```python
CLASS_SIGNALS = {
    "awesome list": ("awesome-", "awesome ", "curated list"),
    "benchmark": ("benchmark", "eval suite", "evaluation suite", "leaderboard"),
    "dataset": ("dataset", "corpus"),
    "course or tutorial": ("tutorial", "course", "learning path", "roadmap"),
    "paper or research artifact": ("official implementation of", "paper implementation"),
}


def cross_collection_hits(
    candidate: dict[str, Any], catalog: dict[str, list[dict[str, Any]]]
) -> list[str]:
    """Report every collection that already holds this repository, id, or URL."""
    key = candidate_key(candidate)
    url = str(candidate.get("url") or "").lower().rstrip("/")
    hits: list[str] = []
    for name, records in sorted(catalog.items()):
        for record in records:
            values = {
                str(record.get(field) or "").lower().rstrip("/")
                for field in ("repo", "id", "url")
            }
            if key and key in values:
                hits.append(f"{name}: already holds {key}")
            elif url and url in values:
                hits.append(f"{name}: already holds {url}")
    return hits


def class_signals(candidate: dict[str, Any]) -> list[str]:
    """Flag obvious non-operational classes visible in the queued record itself."""
    haystack = " ".join([
        str(candidate.get("name") or ""),
        str(candidate.get("description") or ""),
        " ".join(candidate.get("topics") or []),
    ]).lower()
    return [name for name, terms in CLASS_SIGNALS.items() if any(term in haystack for term in terms)]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py
git commit -m "Cross-check queued candidates against every collection"
```

---

### Task 9: Fetch and hash the evidence

**Files:**
- Modify: `scripts/build_candidate_evidence.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Consumes: `GitHubGetter = Callable[[str, str | None], dict[str, Any]]` from `scripts/update_directory.py`.
- Produces:
  - `content_hash(text: str) -> str` — hex sha256 of the UTF-8 bytes.
  - `fetch_candidate_evidence(candidate: dict, getter, token: str | None, today: str) -> dict` — returns `{"repo": ..., "documents": [...], "errors": [...]}` where each document is `{"label", "url", "kind", "content", "content_sha256", "fetched_at"}` plus `blob_sha` and `immutable_url` for `git_blob`.

The licence is read from `/repos/{repo}/license`, which returns base64 `content` and the blob `sha` — verified on 2026-09-04 to return `d0a1fa1482eea82e19510e7920cbe3a03e41f691` for `ActivityWatch/activitywatch`, the exact `blob_sha` already pinned in `directory/license-evidence.json`.

- [ ] **Step 1: Write the failing tests**

```python
import base64


class FetchTests(unittest.TestCase):
    def responses(self, license_payload=None, readme_payload=None):
        def getter(path: str, _token):
            if path.endswith("/license"):
                if license_payload is None:
                    raise KeyError("no license")
                return license_payload
            if path.endswith("/readme"):
                return readme_payload or {}
            return {"full_name": "a/one", "description": "d", "topics": [], "archived": False}
        return getter

    def test_license_evidence_pins_the_blob_sha_the_api_returns(self) -> None:
        payload = {
            "sha": "0" * 40,
            "path": "LICENSE",
            "html_url": "https://github.com/a/one/blob/main/LICENSE",
            "content": base64.b64encode(b"MIT").decode(),
            "encoding": "base64",
        }
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(payload), None, "2026-09-04")
        licence = next(d for d in bundle["documents"] if d["label"] == "LICENSE")
        self.assertEqual("git_blob", licence["kind"])
        self.assertEqual("0" * 40, licence["blob_sha"])
        self.assertEqual(
            "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40, licence["immutable_url"])
        self.assertEqual(harness.content_hash("MIT"), licence["content_sha256"])

    def test_a_missing_license_is_recorded_as_an_error_not_a_crash(self) -> None:
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(None), None, "2026-09-04")
        self.assertTrue(bundle["errors"])
        self.assertFalse([d for d in bundle["documents"] if d["label"] == "LICENSE"])

    def test_content_hash_is_stable(self) -> None:
        self.assertEqual(harness.content_hash("MIT"), harness.content_hash("MIT"))
        self.assertEqual(64, len(harness.content_hash("MIT")))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -k Fetch -v`
Expected: FAIL — `fetch_candidate_evidence` does not exist.

- [ ] **Step 3: Implement**

Add the imports and functions to `scripts/build_candidate_evidence.py`:

```python
import base64
import hashlib

try:
    from .update_directory import GitHubGetter, github_get
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from update_directory import GitHubGetter, github_get


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _decode(payload: dict[str, Any]) -> str:
    if payload.get("encoding") == "base64":
        return base64.b64decode(payload.get("content") or "").decode("utf-8", "replace")
    return str(payload.get("content") or "")


def fetch_candidate_evidence(
    candidate: dict[str, Any], getter: GitHubGetter, token: str | None, today: str
) -> dict[str, Any]:
    """Fetch and hash a candidate's licence and README. Failures are recorded, never raised."""
    repo = candidate.get("repo")
    bundle: dict[str, Any] = {"repo": repo, "documents": [], "errors": []}
    if not repo:
        bundle["errors"].append("candidate has no GitHub repository")
        return bundle
    for label, path in (("LICENSE", f"/repos/{repo}/license"), ("README", f"/repos/{repo}/readme")):
        try:
            payload = getter(path, token)
        except Exception as exc:  # a missing document is data, not a failure
            bundle["errors"].append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        text = _decode(payload)
        blob_sha = payload.get("sha")
        document = {
            "label": label,
            "url": payload.get("html_url") or f"https://github.com/{repo}",
            "kind": "git_blob" if blob_sha else "web",
            "content": text,
            "content_sha256": content_hash(text),
            "fetched_at": today,
        }
        if blob_sha:
            document["blob_sha"] = blob_sha
            document["immutable_url"] = f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}"
        bundle["documents"].append(document)
    return bundle
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py
git commit -m "Fetch and hash candidate licence and README evidence"
```

---

### Task 10: Re-check cited evidence against the live source

**Files:**
- Modify: `scripts/build_candidate_evidence.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Produces: `recheck_candidates(candidates: list[dict], getter, token: str | None) -> list[str]` — returns a list of mismatch descriptions; empty means every citation re-fetched and hashed identically.

This is the fabrication guard. A scheduled task keeps its tools, so nothing prevents an invented citation; this detects one before the run commits.

- [ ] **Step 1: Write the failing tests**

```python
class RecheckTests(unittest.TestCase):
    def triaged(self, content_sha256: str) -> list[dict]:
        return [candidate("a/one", triage={
            "verdict": "review_ready",
            "rule": "r",
            "finding": "f",
            "evidence": [{
                "label": "LICENSE",
                "url": "https://github.com/a/one/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40,
                "content_sha256": content_sha256,
                "fetched_at": "2026-09-04",
            }],
            "proposed_at": "2026-09-04",
            "proposer": "candidate-triage",
        })]

    def getter(self, path: str, _token):
        return {"sha": "0" * 40, "encoding": "base64",
                "content": base64.b64encode(b"MIT").decode(),
                "html_url": "https://github.com/a/one/blob/main/LICENSE"}

    def test_matching_evidence_rechecks_clean(self) -> None:
        self.assertEqual([], harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), self.getter, None))

    def test_a_wrong_content_hash_is_reported(self) -> None:
        problems = harness.recheck_candidates(self.triaged("a" * 64), self.getter, None)
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_an_unreachable_citation_is_reported(self) -> None:
        def failing(_path, _token):
            raise OSError("404")
        problems = harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), failing, None)
        self.assertTrue(any("could not be re-fetched" in problem for problem in problems), problems)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -k Recheck -v`
Expected: FAIL — `recheck_candidates` does not exist.

- [ ] **Step 3: Implement**

```python
def recheck_candidates(
    candidates: list[dict[str, Any]], getter: GitHubGetter, token: str | None
) -> list[str]:
    """Re-fetch every cited document and confirm it still hashes to what was recorded."""
    problems: list[str] = []
    for candidate in candidates:
        triage = candidate.get("triage")
        if not isinstance(triage, dict):
            continue
        repo = candidate.get("repo")
        for item in triage.get("evidence") or []:
            label = item.get("label")
            path = f"/repos/{repo}/license" if label == "LICENSE" else f"/repos/{repo}/readme"
            try:
                payload = getter(path, token)
            except Exception as exc:
                problems.append(
                    f"{candidate_key(candidate)}: {label} could not be re-fetched: "
                    f"{type(exc).__name__}: {exc}"
                )
                continue
            actual = content_hash(_decode(payload))
            if actual != item.get("content_sha256"):
                problems.append(
                    f"{candidate_key(candidate)}: {label} content_sha256 recorded "
                    f"{item.get('content_sha256')} but re-fetched {actual}"
                )
            if item.get("kind") == "git_blob" and payload.get("sha") != item.get("blob_sha"):
                problems.append(
                    f"{candidate_key(candidate)}: {label} blob_sha recorded "
                    f"{item.get('blob_sha')} but re-fetched {payload.get('sha')}"
                )
    return problems
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py
git commit -m "Re-check cited evidence against its live source"
```

---

### Task 11: Wire the harness command line

**Files:**
- Modify: `scripts/build_candidate_evidence.py`, `.gitignore`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Produces: `main(argv: list[str] | None = None) -> int`. Exit 0 on success, 1 when GitHub is unreachable or a recheck reports problems.

- [ ] **Step 1: Write the failing test**

```python
class MainTests(unittest.TestCase):
    def test_an_unreachable_github_fails_before_any_agent_work(self) -> None:
        def failing(_path, _token):
            raise OSError("network down")
        self.assertEqual(1, harness.run_build(
            candidates=[candidate("a/one")], catalog={}, getter=failing,
            token=None, today="2026-09-04", limit=5, bundle_path=None))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -k Main -v`
Expected: FAIL — `run_build` does not exist.

- [ ] **Step 3: Implement**

```python
import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_PATH = ROOT / ".candidate-evidence" / "bundle.json"
CATALOG_FILES = (
    "projects.json", "exclusions.json", "specifications.json",
    "inference-services.json", "local-runtimes.json",
)
COLLECTION_KEYS = {
    "projects.json": "projects", "exclusions.json": "entries",
    "specifications.json": "specifications", "inference-services.json": "services",
    "local-runtimes.json": "runtimes",
}


def previous_candidates(branch: str) -> list[dict[str, Any]]:
    """Read the queue from a previous unmerged triage branch, if one exists."""
    if not branch:
        return []
    finished = subprocess.run(
        ["git", "show", f"{branch}:directory/candidates.json"],
        capture_output=True, text=True, cwd=ROOT,
    )
    if finished.returncode != 0:
        return []
    return json.loads(finished.stdout).get("candidates") or []


def load_catalog(directory: Path) -> dict[str, list[dict[str, Any]]]:
    catalog: dict[str, list[dict[str, Any]]] = {}
    for name in CATALOG_FILES:
        document = json.loads((directory / name).read_text(encoding="utf-8"))
        catalog[name] = document.get(COLLECTION_KEYS[name]) or []
    return catalog


def run_build(*, candidates, catalog, getter, token, today, limit, bundle_path, previous=()) -> int:
    """Build the evidence bundle. Returns a process exit code."""
    carried = carry_forward(candidates, list(previous))
    if carried:
        print(f"carried {carried} triage blocks forward from the previous run")
    selected = select_candidates(candidates, limit)
    entries = []
    for item in selected:
        bundle = fetch_candidate_evidence(item, getter, token, today)
        if bundle["errors"] and not bundle["documents"]:
            print(f"error: {candidate_key(item)}: {bundle['errors']}", file=sys.stderr)
            return 1
        bundle["cross_collection_hits"] = cross_collection_hits(item, catalog)
        bundle["class_signals"] = class_signals(item)
        entries.append(bundle)
    if bundle_path is not None:
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        bundle_path.write_text(json.dumps({"candidates": entries}, indent=2) + "\n", encoding="utf-8")
    print(f"prepared evidence for {len(entries)} candidates")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--recheck", action="store_true")
    parser.add_argument("--previous-branch", default="")
    args = parser.parse_args(argv)
    directory = ROOT / "directory"
    candidates = json.loads((directory / "candidates.json").read_text(encoding="utf-8"))["candidates"]
    token = os.environ.get("GITHUB_TOKEN")
    today = date.today().isoformat()
    if args.recheck:
        problems = recheck_candidates(candidates, github_get, token)
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        return 1 if problems else 0
    return run_build(
        candidates=candidates, catalog=load_catalog(directory), getter=github_get,
        token=token, today=today, limit=args.limit, bundle_path=BUNDLE_PATH,
        previous=previous_candidates(args.previous_branch),
    )


if __name__ == "__main__":
    raise SystemExit(main())
```

Add to `.gitignore`:

```
.candidate-evidence/
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -v` and `uv run ruff check scripts tests`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py .gitignore
git commit -m "Give the evidence harness a command line"
```

---

### Task 12: Guard the blast radius

**Files:**
- Create: `scripts/run_candidate_triage.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Produces: `unexpected_changes(porcelain: str) -> list[str]` — given `git status --porcelain` output, returns every changed path that is not `directory/candidates.json`.

This is the guard that makes the human/automation boundary mechanical: one stray edit to `projects.json` aborts the run.

- [ ] **Step 1: Write the failing tests**

```python
from scripts import run_candidate_triage as runner


class BlastRadiusTests(unittest.TestCase):
    def test_only_candidates_json_is_allowed_to_change(self) -> None:
        self.assertEqual([], runner.unexpected_changes(" M directory/candidates.json\n"))

    def test_an_edit_to_projects_json_is_reported(self) -> None:
        porcelain = " M directory/candidates.json\n M directory/projects.json\n"
        self.assertEqual(["directory/projects.json"], runner.unexpected_changes(porcelain))

    def test_an_untracked_file_is_reported(self) -> None:
        self.assertEqual(["scratch.txt"], runner.unexpected_changes("?? scratch.txt\n"))

    def test_an_empty_diff_is_clean(self) -> None:
        self.assertEqual([], runner.unexpected_changes(""))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -k BlastRadius -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.run_candidate_triage'`.

- [ ] **Step 3: Implement**

Create `scripts/run_candidate_triage.py`:

```python
#!/usr/bin/env python3
"""Orchestrate one candidate-triage run: prepare evidence, then verify and commit.

The judgment between `prepare` and `finish` belongs to a human or to the routine
described in docs/routines/candidate-triage.md. Everything here is mechanical.
"""
from __future__ import annotations

ALLOWED_CHANGES = {"directory/candidates.json"}


def unexpected_changes(porcelain: str) -> list[str]:
    """Return every path in `git status --porcelain` output the routine may not touch."""
    changed: list[str] = []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # a rename reports "old -> new"
            path = path.split(" -> ", 1)[1]
        if path not in ALLOWED_CHANGES:
            changed.append(path)
    return changed
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run_candidate_triage.py tests/test_candidate_evidence.py
git commit -m "Refuse a triage run that touches anything but the queue"
```

---

### Task 13: Wire prepare and finish

**Files:**
- Modify: `scripts/run_candidate_triage.py`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Consumes: `unexpected_changes` from Task 12.
- Produces: `shell(command: list[str], cwd: Path | None = None) -> tuple[int, str]`, `prepare(*, limit: int, run=shell) -> int`, `finish(*, run=shell) -> int`, `prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None`, and `main(argv: list[str] | None = None) -> int` with subcommands `prepare` and `finish`.

Every injected `run` takes `(command, cwd)`. Worktree git operations run in the primary checkout; the harness, the checks, and the commit run inside the worktree — otherwise the harness would rewrite the primary checkout's `candidates.json`, which is exactly what the isolation is for.

`prepare` refreshes an isolated worktree from `origin/main` — this is what keeps the routine from contending with the weekly Actions refresh, and from touching the primary checkout. It also fails closed when the installed prompt has drifted from the reviewed one, which is where that check belongs: CI cannot see `~/.claude`, but the machine that actually runs the routine can.

- [ ] **Step 1: Write the failing test**

```python
class FinishTests(unittest.TestCase):
    def test_finish_refuses_when_a_forbidden_file_changed(self) -> None:
        calls = []

        def fake_run(command: list[str], _cwd=None) -> tuple[int, str]:
            calls.append(command)
            if command[:3] == ["git", "status", "--porcelain"]:
                return 0, " M directory/projects.json\n"
            return 0, ""

        self.assertEqual(1, runner.finish(run=fake_run))
        self.assertNotIn(["git", "commit"], [call[:2] for call in calls])


class PromptDriftTests(unittest.TestCase):
    def test_an_uninstalled_prompt_is_drift(self) -> None:
        self.assertIsNotNone(runner.prompt_drift("body", None))

    def test_a_changed_installed_prompt_is_drift(self) -> None:
        self.assertIsNotNone(runner.prompt_drift("body", "different body"))

    def test_an_identical_prompt_is_not_drift(self) -> None:
        self.assertIsNone(runner.prompt_drift("body\n", "  body  "))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run python -m unittest discover -s tests -p test_candidate_evidence.py -k Finish -v`
Expected: FAIL — `finish` does not exist.

- [ ] **Step 3: Implement**

```python
import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CHECKS = (
    ["uv", "run", "python", "scripts/build_candidate_evidence.py", "--recheck"],
    ["uv", "run", "python", "scripts/validate_directory.py"],
    ["uv", "run", "python", "-m", "unittest", "discover", "-s", "tests"],
    ["uv", "run", "ruff", "check", "scripts", "tests"],
)


def shell(command: list[str], cwd: Path | None = None) -> tuple[int, str]:
    finished = subprocess.run(command, capture_output=True, text=True, cwd=cwd)
    return finished.returncode, finished.stdout + finished.stderr


WORKTREE = ROOT.parent / "atlas-candidate-triage"
PROMPT = ROOT / "docs" / "routines" / "candidate-triage.md"
INSTALLED_PROMPT = Path.home() / ".claude" / "scheduled-tasks" / "candidate-triage" / "SKILL.md"


def prompt_drift(repo_prompt: str, installed_prompt: str | None) -> str | None:
    """Report drift between the reviewed prompt and the one that actually runs."""
    if installed_prompt is None:
        return "the routine prompt is not installed"
    if installed_prompt.strip() != repo_prompt.strip():
        return "the installed routine prompt differs from docs/routines/candidate-triage.md"
    return None


def prepare(*, limit: int, run=shell) -> int:
    """Refresh an isolated worktree from origin/main and build the evidence bundle."""
    installed = INSTALLED_PROMPT.read_text(encoding="utf-8") if INSTALLED_PROMPT.exists() else None
    drift = prompt_drift(PROMPT.read_text(encoding="utf-8"), installed)
    if drift:
        print(f"error: {drift}", file=sys.stderr)
        return 1
    for command in (
        ["git", "fetch", "--quiet", "origin"],
        ["git", "worktree", "remove", "--force", str(WORKTREE)],
        ["git", "worktree", "add", "--quiet", "--detach", str(WORKTREE), "origin/main"],
    ):
        code, output = run(command, ROOT)
        # Removing a worktree that does not exist is expected on a first run.
        if code != 0 and command[1] != "worktree":
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    code, output = run([
        "uv", "run", "python", "scripts/build_candidate_evidence.py",
        "--limit", str(limit), "--previous-branch", "triage/pending",
    ], WORKTREE)
    print(output)
    if code == 0:
        print(f"worktree ready: {WORKTREE}")
    return code


def finish(*, run=shell) -> int:
    """Run every guard, then commit. Any failure aborts before the commit."""
    status_code, porcelain = run(["git", "status", "--porcelain"], WORKTREE)
    if status_code != 0:
        print("error: could not read git status", file=sys.stderr)
        return 1
    forbidden = unexpected_changes(porcelain)
    if forbidden:
        print(f"error: the run changed files it may not touch: {forbidden}", file=sys.stderr)
        return 1
    if not porcelain.strip():
        print("no triage proposals to commit")
        return 0
    for command in CHECKS:
        code, output = run(list(command), WORKTREE)
        if code != 0:
            print(f"error: {' '.join(command)} failed\n{output}", file=sys.stderr)
            return 1
    run(["git", "add", "directory/candidates.json"], WORKTREE)
    run(["git", "checkout", "-B", "triage/pending"], WORKTREE)
    run(["git", "commit", "-m", f"Propose candidate triage for {date.today().isoformat()}"], WORKTREE)
    print("committed triage proposals")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "finish"))
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args(argv)
    if args.command == "prepare":
        return prepare(limit=args.limit)
    return finish()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m unittest discover -s tests -v` and `uv run ruff check scripts tests`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/run_candidate_triage.py tests/test_candidate_evidence.py
git commit -m "Run every guard before a triage run may commit"
```

---

### Task 14: Write the routine prompt and keep it from drifting

**Files:**
- Create: `docs/routines/candidate-triage.md`
- Modify: `tests/test_documentation.py`

**Interfaces:**
- Consumes: `scripts/run_candidate_triage.py` from Tasks 12–13.

The prompt is the most safety-critical prose in this design, so it lives in the repository under review. The installed copy at `~/.claude/scheduled-tasks/candidate-triage/SKILL.md` is generated from it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_documentation.py`:

```python
    def test_the_routine_prompt_states_its_boundary(self) -> None:
        """The prompt is the only instruction a scheduled run sees, so its limits must be in it.

        Drift between this file and the installed copy is checked by
        scripts/run_candidate_triage.py prepare, which runs where ~/.claude exists.
        """
        prompt = (ROOT / "docs" / "routines" / "candidate-triage.md").read_text(encoding="utf-8")
        for required in (
            "directory/candidates.json",
            "run_candidate_triage.py prepare",
            "run_candidate_triage.py finish",
            "never fetch",
            "023",
        ):
            self.assertIn(required, prompt, required)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run python -m unittest discover -s tests -p test_documentation.py -k routine -v`
Expected: FAIL with `FileNotFoundError`.

- [ ] **Step 3: Write the prompt**

Create `docs/routines/candidate-triage.md` with exactly this content:

````markdown
---
name: candidate-triage
description: Sort the Atlas candidate queue and gather pinned evidence, without making an editorial decision
---

Triage the AI Systems Atlas candidate queue, once.

    cd /Users/shamil/projects/github/embark-delve/agent-systems-atlas
    uv run python scripts/run_candidate_triage.py prepare

`prepare` refreshes an isolated worktree from `origin/main` and prints its path.
Do all of your work in that worktree. It also writes `.candidate-evidence/bundle.json`
there: every fact you are allowed to cite is in that file.

Then, for each candidate in the bundle, add a `triage` block to that candidate in
`directory/candidates.json` — and change nothing else, in no other file.

Finally:

    uv run python scripts/run_candidate_triage.py finish

WHAT THIS IS. An evidence-gathering and sorting pass, not a review. `docs/CURATION.md`
reserves classification, traits, editorial prose, scores, confidence, license evidence,
source model, and `verified_at` for human review, and ADR 023 records that a `triage`
block is gathered evidence and a routing proposal, never an editorial conclusion. A
human decides what your evidence means.

NEVER FETCH ANYTHING. You have no need to: `prepare` already fetched and hashed every
document, and recorded the blob SHA for each licence. `finish` re-fetches every citation
and compares hashes, so a URL that was not in the bundle fails the run. Cite the bundle
and nothing else.

THE THREE VERDICTS.

- `out_of_scope` — it fails a family or role boundary, duplicates something already in a
  collection, or is a non-operational research input (an awesome list, a benchmark, a
  dataset, a course). Quote the `docs/CURATION.md` clause in `rule`. This is a *proposed*
  exclusion; you never write `directory/exclusions.json`.
- `held` — in scope, but blocked on a question nobody has decided. Name that question in
  `held_by`, citing the `BACKLOG.md` item or ADR. If the record is waiting for a
  collection that does not exist yet, also set `proposed_system_family` and
  `proposed_primary_role` to null — that is the only case where null is permitted.
- `review_ready` — nothing blocks a human review. Here `finding` is the dossier: what the
  licence says, quoted; what the official documentation claims the product does, quoted;
  any cross-collection hit the bundle reports; and the one boundary question the record
  turns on.

WHAT A FINDING MAY NOT SAY. It may not name a `system_family` or `primary_role` id.
Validation rejects a finding containing one, because proposing a classification is the
human's call. Quoting prose that resembles a role is fine; writing the identifier is not.

WHEN A GUARD FAILS. Report what failed and stop. Do not retry, do not work around it, and
do not edit any file to make a check pass. A failed run costs a week; a wrong record in
the catalog costs more.

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run python -m unittest discover -s tests -p test_documentation.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/routines/candidate-triage.md tests/test_documentation.py
git commit -m "Write the candidate-triage routine prompt"
```

---

### Task 15: Document the review runbook

**Files:**
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Write the runbook**

Add a `## Review a triage batch` section to `docs/OPERATIONS.md`, after "Review a candidate":

- how to see the run's proposals: `git log --oneline main..triage/<date>` and `git diff main..triage/<date> -- directory/candidates.json`;
- that a proposal is evidence, never a conclusion — check the sources it cites, not the verdict it reached;
- how to re-verify by hand: `uv run python scripts/build_candidate_evidence.py --recheck`;
- accepting `out_of_scope`: follow the existing exclusion workflow; the triage block is removed with the candidate;
- accepting `held`: keep the candidate, keep `held_by`, and record the decision in `BACKLOG.md`;
- accepting `review_ready`: follow the existing candidate-promotion runbook, using the dossier as research rather than as conclusions;
- rejecting: edit or delete the `triage` block; the routine never overwrites an existing block;
- how to install the routine: sync `docs/routines/candidate-triage.md` to `~/.claude/scheduled-tasks/candidate-triage/SKILL.md`, scheduled Tuesday morning local, and the note that scheduled tasks run while the desktop app is open and catch up on next launch.

- [ ] **Step 2: Run the docs tests**

Run: `uv run python -m unittest discover -s tests -p test_documentation.py -v`
Expected: PASS — `test_relative_markdown_links_resolve` covers any links added.

- [ ] **Step 3: Run the full verification**

Run, in order:

```bash
uv run ruff check scripts tests
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --test tests/test_web.js
npm run lint:js
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/OPERATIONS.md
git commit -m "Add a runbook for reviewing a triage batch"
```

---

## Manual verification after Task 15

These cannot be unit-tested and must be done by hand once, per the spec's Verification section:

- [ ] Dry run against the real queue: `uv run python scripts/run_candidate_triage.py prepare --limit 5`, then hand-write one `triage` block, then `finish`. Confirm the commit touches only `directory/candidates.json`.
- [ ] Deliberate fabrication: edit a committed citation's `content_sha256`, run `--recheck`, confirm it exits 1 and names the citation.
- [ ] Deliberate overreach: edit a `finding` to contain a role id, run the validator, confirm it fails.
- [ ] Confirm the primary checkout and `origin` are untouched by a run.
