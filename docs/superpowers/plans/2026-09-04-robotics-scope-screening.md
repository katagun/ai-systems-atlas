# Robotics Scope Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Screen the robotics landscape against the Atlas's existing inclusion gate and record every disposition in a machine-readable file, so a later ADR decides the agent-to-physical-world boundary from evidence rather than from enthusiasm.

**Architecture:** Extend the evidence harness so web citations can be re-verified, then run five class sweeps that write `triage` blocks onto queued candidates or entries into the exclusion list. Nothing is published, no vocabulary is extended, and no ADR is written. The sweep's output is evidence plus a coverage note.

**Tech Stack:** Python 3.12 via `uv`, `unittest`, `ruff`. Data is hand-edited JSON under `directory/`, validated by `scripts/validate_directory.py`.

**Spec:** [`docs/superpowers/specs/2026-09-04-robotics-scope-screening-design.md`](../specs/2026-09-04-robotics-scope-screening-design.md)

## Global Constraints

- `triage.held_by` is the exact string `robotics scope decision` for every held candidate in this batch. One stable value, greppable before an ADR number exists.
- A `triage.finding` must not contain any `system_family` or `primary_role` taxonomy id. `scripts/validate_directory.py` rejects it. Describe what was observed, never what it classifies as.
- A held candidate has `proposed_system_family: null` and `proposed_primary_role: null`. Validation permits null only while `held_by` is set.
- `classification_confidence` stays a number between 0 and 1 even on a held candidate. The validator requires it unconditionally; do not set it to null.
- `review_required` is always exactly `["licensing", "classification", "traits", "editorial_score"]`.
- Every evidence item carries `label`, `url`, `kind`, `content_sha256`, `fetched_at`. A `git_blob` item adds `blob_sha` and `immutable_url` equal to `https://api.github.com/repos/<repo>/git/blobs/<blob_sha>`. No other fields are permitted.
- An exclusion entry is exactly `{name, repo, reason, useful_lesson}`. There is no field for a product without a repository — see Task 4 for what to do instead.
- Publish nothing. Do not touch `directory/projects.json`, `models.json`, `specifications.json`, `inference-services.json`, `local-runtimes.json`, or `directory/taxonomy.json`.
- Never claim a check passed without running it.

## Screening Procedure

Every class task in this plan applies this procedure to each candidate. It is written once here rather than repeated per task.

1. **Name the reviewable unit** before assessing it: software, hosted service, model artifact, specification, or hardware.
2. **Test against the five-condition inclusion gate** in `docs/CURATION.md`. Record which condition fails *first* if one does. A verdict without a named failing condition is not a finding.
3. **Test whether an existing role or collection holds it.** State which comes closest and precisely what it fails to name. "Nothing fits" is not a finding; "no record type names outcome X" is.
4. **Apply the source-independence test.** Is the distinguishing property visible in first-party documentation, or only by reading the tree? Record the answer even when it is inconvenient — this is ADR 023's third requirement and the sweep exists to test it.
5. **Fetch and hash every cited document yourself.** A subagent's summary is a lead, never evidence.
6. **Choose a verdict:** `review_ready` (passes the gate, an existing record type holds it), `held` (passes the gate, no record type holds it), or `out_of_scope` (fails the gate).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/build_candidate_evidence.py` | Gains web-citation recheck so hand-written evidence is verifiable | 1 |
| `tests/test_candidate_evidence.py` | Covers the new recheck branch | 1 |
| `directory/candidates.json` | Held and review-ready dispositions, with `triage` blocks | 2–5 |
| `directory/exclusions.json` | Out-of-scope dispositions for candidates that have a repository | 3–5 |
| `docs/COVERAGE.md` | One research-batch note recording the sweep | 6 |
| `BACKLOG.md` | One item naming the open decision | 6 |

---

### Task 1: Make web citations verifiable

`recheck_candidates` maps a label to a GitHub API path and accepts only `LICENSE` and `README`; every other label is reported as a problem, and a candidate with no `repo` cannot be fetched at all. Most robotics evidence is a documentation or terms page on a vendor site. Without this, the spec's rule that every citation is re-verifiable cannot be discharged for the majority of this sweep.

**Files:**
- Modify: `scripts/build_candidate_evidence.py` — `recheck_candidates`
- Test: `tests/test_candidate_evidence.py`

**Interfaces:**
- Consumes: `content_hash(text) -> str`, already defined in the same module.
- Produces: `recheck_candidates(candidates, getter, token, baseline) -> list[str]` keeps its signature. Behavior change only: an evidence item whose `kind` is `web` is re-fetched by its `url` and compared, instead of being reported as an unknown label.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_candidate_evidence.py` (create the file if absent, with the imports shown):

```python
from __future__ import annotations

import unittest
from unittest import mock

from scripts.build_candidate_evidence import content_hash, recheck_candidates


def candidate_with(evidence: list[dict]) -> dict:
    return {
        "repo": None,
        "url": "https://example.invalid/product",
        "triage": {"verdict": "held", "held_by": "robotics scope decision", "evidence": evidence},
    }


class WebCitationRecheckTests(unittest.TestCase):
    def test_a_web_citation_that_still_matches_reports_no_problem(self) -> None:
        body = "terms of service, version 3"
        item = {
            "label": "Product terms",
            "url": "https://example.invalid/terms",
            "kind": "web",
            "content_sha256": content_hash(body),
            "fetched_at": "2026-09-04",
        }
        with mock.patch("scripts.build_candidate_evidence.fetch_web_text", return_value=body):
            problems = recheck_candidates([candidate_with([item])], lambda *a, **k: {}, None, [])
        self.assertEqual([], problems)

    def test_a_web_citation_that_drifted_is_reported(self) -> None:
        item = {
            "label": "Product terms",
            "url": "https://example.invalid/terms",
            "kind": "web",
            "content_sha256": content_hash("original"),
            "fetched_at": "2026-09-04",
        }
        with mock.patch("scripts.build_candidate_evidence.fetch_web_text", return_value="rewritten"):
            problems = recheck_candidates([candidate_with([item])], lambda *a, **k: {}, None, [])
        self.assertEqual(1, len(problems), problems)
        self.assertIn("Product terms", problems[0])
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
uv run python -m unittest discover -s tests -p "test_candidate_evidence.py" -v
```

Expected: FAIL — `AttributeError` or `ImportError` on `fetch_web_text`, which does not exist yet.

- [ ] **Step 3: Add the fetcher and the web branch**

In `scripts/build_candidate_evidence.py`, add near `content_hash`:

```python
def fetch_web_text(url: str) -> str:
    """Fetch a cited web document. Text only; the hash is over the decoded body."""
    request = urllib.request.Request(url, headers={"User-Agent": "agent-systems-atlas-evidence"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")
```

Add `import urllib.request` to the imports.

Then in `recheck_candidates`, insert a `web` branch immediately **before** the existing `if label == "LICENSE":` line, inside the `for item in evidence:` loop:

```python
            if item.get("kind") == "web":
                # Re-fetching the cited URL itself is what makes a fabricated citation
                # fail: there is no label-derived path to fall back on, so a URL that
                # does not serve the recorded bytes cannot pass.
                try:
                    actual = content_hash(fetch_web_text(item.get("url") or ""))
                except Exception as exc:
                    problems.append(
                        f"{candidate_key(candidate)}: {label} could not be re-fetched: "
                        f"{type(exc).__name__}: {exc}"
                    )
                    continue
                if actual != item.get("content_sha256"):
                    problems.append(
                        f"{candidate_key(candidate)}: {label} content_sha256 recorded "
                        f"{item.get('content_sha256')} but re-fetched {actual}"
                    )
                continue
```

Change nothing else. The existing `LICENSE`/`README` dispatch, the URL-consistency check, and the `git_blob` handling all stay exactly as they are.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
uv run python -m unittest discover -s tests -p "test_candidate_evidence.py" -v
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Confirm nothing else regressed**

```bash
uv run ruff check scripts tests && uv run python -m unittest discover -s tests
```

Expected: ruff clean, full suite OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_candidate_evidence.py tests/test_candidate_evidence.py
git commit -m "Re-verify web citations, not only LICENSE and README

A hand-written triage block cites a vendor's documentation or terms page.
recheck only understood two GitHub labels, so every such citation was
reported as a problem and none was actually re-fetched. Hash the web body
and compare it the same way."
```

---

### Task 2: Build the candidate list from reproducible queries

Do not start from a remembered list of robotics systems. Produce the list from queries that another person can re-run, and record the queries themselves in the batch note.

**Files:**
- Modify: `directory/candidates.json`

**Interfaces:**
- Produces: a set of queued candidates, each carrying the full 13-field candidate schema, that Tasks 3–5 will attach `triage` blocks to.

- [ ] **Step 1: Record the discovery queries**

Run GitHub topic and search queries and keep the exact query strings for the batch note. At minimum sweep the topics `robotics`, `embodied-ai`, `vision-language-action`, `ros2`, and `robot-learning`, plus the first-party documentation sites of any vendor named by those results. Capture, for each hit: name, URL, repository if any, and one sentence on what it claims to do.

- [ ] **Step 2: Reduce to a budget of 15–25 candidates across the five classes**

The five classes are robot software stacks, policy and action models, simulation and benchmark environments, commercial robot products, and robotics interchange contracts. Coverage of the classes matters; the count is a budget, not a target. Record what was dropped and why — the batch note needs it.

- [ ] **Step 3: Check nothing is already curated**

```bash
python3 - <<'PY'
import json
names = {"REPLACE_WITH", "YOUR", "CANDIDATE", "NAMES"}
for path, key in (("directory/projects.json","projects"),("directory/candidates.json","candidates"),
                  ("directory/exclusions.json","entries"),("directory/models.json","models")):
    data = json.load(open(path))[key]
    for item in data:
        if str(item.get("name","")) in names:
            print("already present:", path, item.get("name"))
PY
```

Expected: no output. A repository may be curated, a candidate, or excluded — never two.

- [ ] **Step 4: Append each candidate with the full schema**

Every candidate object has exactly these 13 keys. `repo` is `null` for a product with no canonical GitHub repository, and then `url` must be an HTTPS URL that is not a github.com repository URL:

```json
{
  "repo": null,
  "name": "Example Robot Platform",
  "url": "https://example.invalid/platform",
  "description": "One sentence from first-party material describing what it does.",
  "proposed_system_family": null,
  "proposed_primary_role": null,
  "classification_confidence": 0.5,
  "github_detected_license": null,
  "stars": null,
  "topics": [],
  "status": "provisional",
  "discovered_at": "2026-09-04",
  "review_required": ["licensing", "classification", "traits", "editorial_score"]
}
```

Leave `proposed_system_family` and `proposed_primary_role` populated with a compatible pair only where an existing role plainly holds the candidate. Otherwise leave both null — Task 3 attaches the `triage.held_by` that makes null legal.

- [ ] **Step 5: Validate**

```bash
uv run python scripts/validate_directory.py
```

Expected: a `family and role may only be null while triage.held_by names the decision that holds the record` error for each candidate you left null. That failure is correct at this point and Task 3 clears it. Any *other* error is a schema mistake to fix now.

- [ ] **Step 6: Commit**

```bash
git add directory/candidates.json
git commit -m "Queue the robotics screening batch

Candidates from reproducible topic and vendor queries, not recall. Family
and role are left null where no existing role plainly holds the record;
the triage blocks that legalise that follow."
```

---

### Task 3: Screen the software stacks

The class most likely to produce a record. Apply the Screening Procedure to every candidate in this class.

**Files:**
- Modify: `directory/candidates.json`, `directory/exclusions.json`

**Interfaces:**
- Consumes: the queued candidates from Task 2.
- Produces: a `triage` block on each software-stack candidate, or an exclusion entry.

- [ ] **Step 1: Gather and hash evidence for each candidate**

For a candidate with a repository:

```bash
uv run python scripts/build_candidate_evidence.py --limit 25
```

This writes `.candidate-evidence/bundle.json` with the LICENSE and README text, their `content_sha256`, `blob_sha`, and `immutable_url`. For a candidate without a repository, fetch each cited page and hash it:

```bash
curl -sL "https://example.invalid/docs/overview" | python3 -c "import sys,hashlib;print(hashlib.sha256(sys.stdin.read().encode()).hexdigest())"
```

- [ ] **Step 2: Write a triage block per candidate**

A held candidate — passes the gate, no existing record type names its outcome:

```json
"triage": {
  "verdict": "held",
  "held_by": "robotics scope decision",
  "rule": "docs/CURATION.md inclusion gate; ADR 023 role test",
  "finding": "Ships an installable package and documents a maintained run path. Its documented outcome is driving physical actuators from model output, which no existing record type names. The property is stated in first-party documentation without reading the tree.",
  "evidence": [
    {
      "label": "README",
      "url": "https://github.com/example/stack/blob/main/README.md",
      "kind": "git_blob",
      "content_sha256": "REPLACE_WITH_64_HEX_FROM_BUNDLE",
      "fetched_at": "2026-09-04",
      "blob_sha": "REPLACE_WITH_40_HEX_FROM_BUNDLE",
      "immutable_url": "https://api.github.com/repos/example/stack/git/blobs/REPLACE_WITH_40_HEX_FROM_BUNDLE"
    }
  ],
  "proposed_at": "2026-09-04",
  "proposer": "robotics scope screening"
}
```

An out-of-scope candidate that has a repository leaves the queue entirely and gains an exclusion entry instead:

```json
{
  "name": "Example Research Code",
  "repo": "example/research-code",
  "reason": "Paper reference code with no release, no package, and no maintained run path, so inclusion-gate condition 1 fails: there is no identifiable operational product. Named here so the disposition is findable from the evidence that produced it.",
  "useful_lesson": "A repository that accompanies a paper is a research input until something makes it adoptable; the citation count is not the gate."
}
```

Remember: the `finding` must not contain any `system_family` or `primary_role` taxonomy id. Validation rejects it.

- [ ] **Step 3: Clear the nulls for anything not held**

A candidate you did not hold needs a compatible `proposed_system_family` and `proposed_primary_role` pair from `directory/taxonomy.json`, and no `held_by`. `held_by` is required for a `held` verdict and forbidden otherwise.

- [ ] **Step 4: Re-verify every citation**

```bash
uv run python scripts/build_candidate_evidence.py --recheck
```

Expected: `rechecked N citations across M candidates` and exit 0. A non-zero exit means a recorded hash does not match what the URL serves now — fix the record, never the hash.

- [ ] **Step 5: Validate and test**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests
```

Expected: validator silent, suite OK. `sync_web_data.py` runs because `exclusions.json` is published.

- [ ] **Step 6: Commit**

```bash
git add directory/candidates.json directory/exclusions.json web/exclusions.json
git commit -m "Screen the robotics software stacks

Each disposition names the first failing inclusion-gate condition, or the
outcome no existing record type names. Every citation is pinned and
re-verified."
```

---

### Task 4: Screen models, simulators, and hardware products

Three classes with one thing in common: each is expected to fail, and the value is in recording *which condition* fails rather than asserting a verdict.

**Files:**
- Modify: `directory/candidates.json`, `directory/exclusions.json`

**Interfaces:**
- Consumes: the queued candidates from Task 2.
- Produces: dispositions for the model, simulator, and hardware classes.

- [ ] **Step 1: Models — test against the Models collection, not against exclusion**

ADR 025 gives the Atlas a Models collection. `model_types` is `{language_model, multimodal_language_model}` and `model_modalities` is `{text, image, audio, video, pdf}`. An embodied-reasoning model that emits text is already expressible; an action-emitting policy is not. For each model candidate, record whether an existing `model_type` and output modality name it, and note that `google/gemini-robotics-er-1.6-preview` already sits in `directory/model-candidates.json` with output modality `text`.

Do not edit `directory/models.json` or `directory/model-candidates.json`. The finding goes in the triage block or the batch note.

One robotics-adjacent entry among 351 model candidates is a fact about what models.dev covers, not about the field. Do not record absence there as evidence that action-emitting policies are rare; find them from the Task 2 queries or record that you could not.

- [ ] **Step 2: Simulators — apply the ADR 015 substrate test**

The test is purpose, not capability: if serving is a capability of software built to do a different job, it belongs to that job's collection or to no collection. Record for each simulator whether its primary outcome is building and training, and whether a dedicated serving product exists separately.

- [ ] **Step 3: Hardware — expect condition 4 to fail, and handle the repo-less exclusion problem**

An exclusion entry is exactly `{name, repo, reason, useful_lesson}` and every one of the 55 existing entries has a repository. A humanoid vendor with no repository therefore has **no valid exclusion shape**. Do not invent a field and do not put a placeholder in `repo`. Instead keep it in `directory/candidates.json` with a `held` verdict whose finding records the failing condition:

```json
"triage": {
  "verdict": "held",
  "held_by": "robotics scope decision",
  "rule": "docs/CURATION.md inclusion gate condition 4",
  "finding": "No product-specific terms or licence are published on any first-party page, so a reviewed source model and complete licence list cannot be established from what the vendor publishes. Capability is shown in vendor-authored demonstrations, which are evidence of the claim rather than of the behaviour.",
  "evidence": [
    {
      "label": "Product page",
      "url": "https://example.invalid/product",
      "kind": "web",
      "content_sha256": "REPLACE_WITH_64_HEX",
      "fetched_at": "2026-09-04"
    }
  ],
  "proposed_at": "2026-09-04",
  "proposer": "robotics scope screening"
}
```

This is the same shape ADR 023 used for Microsoft Discovery: held rather than excluded, because the gate is unmeetable from what the vendor publishes rather than failed on the merits.

- [ ] **Step 4: Re-verify every citation**

```bash
uv run python scripts/build_candidate_evidence.py --recheck
```

Expected: exit 0. Task 1 is what makes the web citations in this task verifiable at all.

- [ ] **Step 5: Validate and test**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests
```

Expected: validator silent, suite OK.

- [ ] **Step 6: Commit**

```bash
git add directory/candidates.json directory/exclusions.json web/exclusions.json
git commit -m "Screen robotics models, simulators, and hardware products

Models are tested against the Models collection rather than assumed
excluded. Hardware with no published terms is held, not excluded: the
gate is unmeetable from first-party material rather than failed."
```

---

### Task 5: Screen the robotics interchange contracts

**Files:**
- Modify: `directory/candidates.json`, `directory/exclusions.json`

**Interfaces:**
- Consumes: the queued candidates from Task 2.
- Produces: dispositions for the specification class.

- [ ] **Step 1: Test each contract against the specification inclusion boundary**

`docs/SPECIFICATIONS.md` admits a reusable contract at a boundary "between agents, tools, clients, users, repositories, or extension packages" — robots are not in that enumeration — and refuses "a general transport, serialization format, or API description language solely because an agent uses it." For each contract, record which of the ten `specification_scopes` comes closest and exactly what it fails to name.

- [ ] **Step 2: Record the vocabulary consequence without acting on it**

If a contract would need a scope identifier that does not exist, say so in the finding. Do not add it: ADR 017 makes the extension an obligation discharged in the same change that admits a record, and this sweep admits nothing.

- [ ] **Step 3: Write the triage blocks**

Use the held block shape from Task 3, Step 2, with `rule` set to `docs/SPECIFICATIONS.md inclusion boundary` and a finding that names the closest scope and the gap. The taxonomy-id prohibition still applies: `specification_scopes` values are not `system_family` or `primary_role` ids, so naming one is permitted, but do not name a family or role.

- [ ] **Step 4: Re-verify, validate, and test**

```bash
uv run python scripts/build_candidate_evidence.py --recheck
uv run python scripts/sync_web_data.py && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests
```

Expected: recheck exit 0, validator silent, suite OK.

- [ ] **Step 5: Commit**

```bash
git add directory/candidates.json directory/exclusions.json web/exclusions.json
git commit -m "Screen the robotics interchange contracts

Each disposition names the closest specification scope and what it fails
to name. No scope identifier is added: this sweep admits nothing, and
ADR 017 ties the extension to the change that admits a record."
```

---

### Task 6: Record the batch and the open decision

**Files:**
- Modify: `docs/COVERAGE.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: every disposition from Tasks 3–5.

- [ ] **Step 1: Append the research-batch note**

Add the next numbered entry under `## Research batches` in `docs/COVERAGE.md`. Batch 38 is the most recent; use 39. Follow its form: one dense paragraph stating what was screened, the discovery queries used, the count published, held, and excluded, the sharpest finding, and any incidental finding that sits outside the decision. State explicitly whether ADR 023's three requirements were met, because that is the sentence the later ADR will be written from.

- [ ] **Step 2: Add the BACKLOG item**

`docs/OPERATIONS.md` requires an accepted `held` verdict to be recorded in `BACKLOG.md` so the question stays visible outside the queue. Add one item under `## Now` naming the decision, the count of records it holds, and the decision rule from the spec that the evidence now points at.

- [ ] **Step 3: Verify the counts against the files rather than from memory**

```bash
python3 - <<'PY'
import json
c = json.load(open("directory/candidates.json"))["candidates"]
held = [r for r in c if r.get("triage", {}).get("held_by") == "robotics scope decision"]
triaged = [r for r in c if "triage" in r]
print("queue", len(c), "| triaged", len(triaged), "| held", len(held))
print("excluded", len(json.load(open("directory/exclusions.json"))["entries"]))
PY
```

Put these numbers in the batch note. `docs/COVERAGE.md` already carries a standing problem with counts drifting from the published files; do not add to it.

- [ ] **Step 4: Run the documentation tests**

```bash
uv run python -m unittest discover -s tests -p "test_documentation.py" -v
```

Expected: OK. This checks the cross-references you just added resolve.

- [ ] **Step 5: Commit**

```bash
git add docs/COVERAGE.md BACKLOG.md
git commit -m "Record the robotics screening batch and the decision it holds

The batch note states whether ADR 023's three requirements were met,
which is the sentence the later ADR is written from. The BACKLOG item
keeps the open question visible outside the queue."
```

---

### Task 7: Full verification

**Files:** none modified.

- [ ] **Step 1: Run every check in the repository contract**

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_share_pages.py --check
uv run python scripts/validate_directory.py
uv run ruff check scripts tests
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
```

Expected: all pass. `build_share_pages.py --check` should report no difference, because this sweep publishes no record.

- [ ] **Step 2: Confirm the working tree holds only what this plan changed**

```bash
git status --short && git diff --stat origin/main..HEAD
```

Expected: a clean tree, and a diff touching only `scripts/build_candidate_evidence.py`, `tests/test_candidate_evidence.py`, `directory/candidates.json`, `directory/exclusions.json`, `web/exclusions.json`, `docs/COVERAGE.md`, and `BACKLOG.md`.

- [ ] **Step 3: Confirm the sweep decided nothing it was not meant to decide**

```bash
git diff origin/main..HEAD --name-only | grep -E "directory/(projects|models|specifications|inference-services|local-runtimes|taxonomy)\.json|docs/adr/" && echo "SCOPE VIOLATION" || echo "scope clean"
```

Expected: `scope clean`. This sweep publishes no record, extends no vocabulary, and writes no ADR.
