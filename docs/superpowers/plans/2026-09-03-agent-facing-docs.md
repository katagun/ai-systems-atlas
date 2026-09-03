# Agent-Facing Discovery Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an LLM that queries or browses the Atlas (rather than edits this repository) a compact entry point (`web/llms.txt`) and a packaged, installable knowledge source (`skills/ai-systems-atlas/`, an Agent Skill) for using the published JSON data correctly.

**Architecture:** Three independent, additive file sets — no changes to canonical data, the curation workflow, or the web app's runtime behavior. A repo-root Agent Skill folder (`SKILL.md` + `reference.md`) packages taxonomy knowledge; a static `web/llms.txt` links to the published data and to that skill; a short new doc plus one `AGENTS.md` row record why both exist and their maintenance contract.

**Tech Stack:** Plain Markdown/text files, Node's built-in `node:test` runner (`tests/test_web.js`), Python `unittest` (`tests/test_skill.py`, `tests/test_documentation.py`). No new dependencies — this repo has none (`pyproject.toml` `dependencies = []`), so frontmatter parsing in tests uses a small hand-rolled regex, not PyYAML.

**Spec:** [docs/superpowers/specs/2026-09-03-agent-facing-docs-design.md](../specs/2026-09-03-agent-facing-docs-design.md)

## Global Constraints

- Never add a record count, score, or any other figure that could go stale to `web/llms.txt`, `SKILL.md`, or `reference.md` (spec §1; this repo just fixed exactly this class of bug in `tests/e2e/directory-search.spec.js`).
- `web/llms.txt`'s Data section must list exactly the files in `PUBLISHED_DATA` (`scripts/validate_directory.py`, `scripts/sync_web_data.py`): `projects.json, taxonomy.json, exclusions.json, license-evidence.json, specifications.json, inference-services.json, local-runtimes.json` — 7 files, not 6 (`license-evidence.json` is easy to miss).
- `web/llms.txt`'s site-origin links must use the exact current value of `SITE_URL` in `scripts/build_share_pages.py` (`https://katagun.github.io/ai-systems-atlas/` at the time of writing this plan) — a test enforces this so a future domain fix (tracked separately as `task_fe30abc4`) is forced to update this file too, rather than silently drifting.
- The skill lives at repo-root `skills/ai-systems-atlas/`, not under `web/` — `docs/WEB.md` scopes `web/` as "a dependency-free static application" (the SPA, its data, generated share pages); the skill is reference material, same category as `docs/TAXONOMY.md`, which this repo already links to on GitHub rather than mirroring into `web/`.
- No CI workflow changes: `verify.yml` already runs `node --test tests/test_web.js` and `uv run python -m unittest discover -s tests -v`, which will pick up the new test file automatically.

---

### Task 1: The Agent Skill (`skills/ai-systems-atlas/`)

**Files:**
- Create: `skills/ai-systems-atlas/SKILL.md`
- Create: `skills/ai-systems-atlas/reference.md`
- Create: `tests/test_skill.py`

**Interfaces:**
- Produces: `skills/ai-systems-atlas/SKILL.md` (referenced by `web/llms.txt` in Task 2 and `docs/AGENT_DOCS.md` in Task 3) and `skills/ai-systems-atlas/reference.md` (referenced from `SKILL.md`, must exist for Task 2/3's own doc-link checks to pass).

- [ ] **Step 1: Write the failing test**

Create `tests/test_skill.py`:

```python
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = ROOT / "skills" / "ai-systems-atlas"
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


def parse_frontmatter(text: str) -> dict[str, str]:
    """Extract top-level `key: value` pairs from a SKILL.md frontmatter block.

    Deliberately not a YAML parser: this repository has zero Python
    dependencies (`pyproject.toml` declares `dependencies = []`), and the
    Agent Skills manifest only needs two flat scalar fields here.
    """
    match = FRONTMATTER.match(text)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return fields


class SkillTests(unittest.TestCase):
    def test_skill_manifest_has_required_frontmatter(self) -> None:
        text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        fields = parse_frontmatter(text)
        self.assertTrue(fields.get("name"), "SKILL.md frontmatter is missing a non-empty name")
        self.assertTrue(fields.get("description"), "SKILL.md frontmatter is missing a non-empty description")

    def test_reference_file_exists(self) -> None:
        self.assertTrue((SKILL_DIR / "reference.md").is_file())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run python -m unittest tests.test_skill -v`
Expected: FAIL — `skills/ai-systems-atlas/SKILL.md` does not exist (`FileNotFoundError`).

- [ ] **Step 3: Write `SKILL.md`**

Create `skills/ai-systems-atlas/SKILL.md`:

```markdown
---
name: ai-systems-atlas
description: Query the AI Systems Atlas, a reviewed directory of agent, memory, and assistant systems, interoperability specifications, managed inference services, and self-operated local runtimes. Use when an agent needs to find, compare, or cite systems in this catalog from its published JSON data rather than guessing from training knowledge.
---

# AI Systems Atlas

The Atlas (https://katagun.github.io/ai-systems-atlas/) reviews and curates AI agent, memory, and assistant systems, plus interoperability specifications, managed inference services, and self-operated local runtimes. Every published record carries reviewed license evidence and a `verified_at` date; nothing is scraped or self-scored.

## Fetch the right file for the question

| Question | Fetch |
|---|---|
| Agent, memory, or assistant systems | `projects.json` |
| Protocols, metadata schemas, instruction conventions (AGENTS.md, CLAUDE.md, Agent Skills, ...), capability or package formats | `specifications.json` |
| Managed inference APIs and hosting platforms | `inference-services.json` |
| Self-hosted inference runtimes (Ollama, vLLM, LM Studio, ...) | `local-runtimes.json` |
| Enum meanings, license identifiers, score-profile definitions | `taxonomy.json` |
| Why something was reviewed and not included | `exclusions.json` |

All files live at `https://katagun.github.io/ai-systems-atlas/<file>` and are plain JSON with no auth and no rate limit.

## Vocabulary you need to filter correctly

- `system_family`: one of `memory_system`, `agent_system`, `assistant_system`. A project's `primary_role` is only meaningful within its own family.
- `score_profile`: which scoring rubric a record uses. **Never compare `score.overall` across different `score_profile` values** — an 8.5 under one profile and an 8.5 under another are not measuring the same thing, and mixing them produces a wrong answer, not an approximate one. Specifications are never scored at all.
- `status`: `active`, `archived`, `superseded`, or `removed`. Default to `active` unless the user asks about history; a `superseded` record's `superseded_by` names its successor, whose record still exists.
- Licenses and source model never gate inclusion here — a project can be proprietary and still be reviewed. Don't infer permissiveness, quality, or popularity from a record's mere presence in the catalog.

## Full schema

See [reference.md](reference.md) in this skill for the field-by-field shape of every published file. Load it only when you need a field this summary doesn't name.
```

- [ ] **Step 4: Write `reference.md`**

Create `skills/ai-systems-atlas/reference.md`:

```markdown
# AI Systems Atlas — data reference

Loaded on demand from [SKILL.md](SKILL.md) when a query needs a field the summary there doesn't name.

## Envelopes

- `projects.json`: `{generated_at, policy, projects: [...]}`
- `specifications.json`: `{version, verified_at, specifications: [...]}`
- `inference-services.json`: `{version, verified_at, services: [...], generated_at}`
- `local-runtimes.json`: `{version, verified_at, runtimes: [...]}`
- `taxonomy.json`: `{version, principle, <enum and score-profile groups, listed below>}`
- `exclusions.json`: `{generated_at, entries: [...]}`

## `projects.json` record fields

`id, system_family, score_profile, name, repo, url, description, primary_role, secondary_roles, agent_relation, architectures, retrieval_modes, capture_modes, memory_lifecycle, canonical_data, deployment, agent_interfaces, execution_boundaries, agent_capabilities, local_first, human_editable, provenance, status, stars, stars_verified_at, historical_stars, current_repo_note, score, strengths, weaknesses, why_it_matters, research_confidence, verified_at, pushed_at, forks, open_issues, metadata_verified_at, github_detected_license, licenses, source_model, license_review_status`

`score` holds the profile's weighted dimensions plus `overall`. See [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md) for full field semantics, source/license classification rules, and lifecycle transitions.

## `specifications.json` record fields

`id, name, short_name, specification_type, scope, status, current_version, stewards, repo, url, description, standardizes, does_not_standardize, licenses, license_note, related_specifications, evidence, license_evidence, verified_at`

Never scored. `specification_type` is one of `protocol`, `metadata_schema`, `instruction_convention`, `capability_format`, `package_format`. See [docs/SPECIFICATIONS.md](../../docs/SPECIFICATIONS.md).

## `inference-services.json` record fields

`id, name, operator, service_type, url, description, service_boundary, delivery_modes, model_sources, api_styles, regional_controls, retention_controls, routing, customization, strengths, tradeoffs, score_profile, score, terms, evidence, verified_at`

`score_profile` is always `inference_service`; its eight dimensions are defined in [docs/INFERENCE_SERVICES.md](../../docs/INFERENCE_SERVICES.md). The profile never scores model quality, price, or throughput.

## `local-runtimes.json` record fields

`id, name, maintainer, runtime_type, repo, url, description, runtime_boundary, accelerators, model_formats, serving_modes, api_styles, deployment_surfaces, model_management, hardware_requirements, operational_controls, strengths, tradeoffs, licenses, source_model, license_note, license_evidence, score_profile, score, evidence, verified_at, stars, stars_verified_at`

`score_profile` is always `local_runtime`; its eight dimensions are defined in [docs/LOCAL_RUNTIMES.md](../../docs/LOCAL_RUNTIMES.md). The profile never scores throughput, latency, or hardware cost.

## `taxonomy.json` top-level groups

`version, principle, system_families, primary_roles, agent_relations, provider_relationships, model_backends, inference_service_types, inference_delivery_modes, inference_model_sources, inference_api_styles, local_runtime_types, runtime_accelerators, runtime_model_formats, runtime_serving_modes, runtime_deployment_surfaces, inference_service_score_profile, local_runtime_score_profile, specification_types, specification_scopes, specification_statuses, architectures, retrieval_modes, capture_modes, memory_lifecycle, agent_interfaces, execution_boundaries, agent_capabilities, deployment_modes, project_statuses, license_review_statuses, provenance_levels, research_confidence_levels, licenses, source_models, score_profiles`

Each group is a list of enum entries (or a scoring-profile object for the two `*_score_profile` keys). Fetch `taxonomy.json` before filtering by any enum field to confirm current valid values — enums are added and renamed over time, and this reference is not re-verified on every taxonomy change.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run python -m unittest tests.test_skill -v`
Expected: PASS (2 tests: `test_skill_manifest_has_required_frontmatter`, `test_reference_file_exists`)

- [ ] **Step 6: Run the full documentation-link test to catch any bad relative link in the two new files**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS — `test_relative_markdown_links_resolve` scans every `.md` file in the repository, including the two just added, and will fail on any broken `[text](path)` link.

- [ ] **Step 7: Commit**

```bash
git add skills/ai-systems-atlas/SKILL.md skills/ai-systems-atlas/reference.md tests/test_skill.py
git commit -m "$(cat <<'EOF'
Add the ai-systems-atlas Agent Skill

Packages the taxonomy knowledge an agent needs to query the Atlas's
published JSON correctly (which file answers what, and the score-profile
comparability rule) as an installable Agent Skill, per the design in
docs/superpowers/specs/2026-09-03-agent-facing-docs-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `web/llms.txt`

**Files:**
- Create: `web/llms.txt`
- Modify: `tests/test_web.js` (append new `test(...)` blocks; do not alter existing tests)

**Interfaces:**
- Consumes: `skills/ai-systems-atlas/SKILL.md` (Task 1) — linked from the Reference section.
- Produces: `web/llms.txt`, referenced by `docs/AGENT_DOCS.md` in Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_web.js` (after the existing final test, `"pagination of an empty list yields one empty page rather than page zero"`):

```js
test("llms.txt starts with an H1 title and a blockquote summary", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  assert.match(text, /^# [^\n]+\n\n> [^\n]+\n/);
});

test("llms.txt only links to files that actually exist", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length > 0, "llms.txt has no links");
  const siteRoot = "https://katagun.github.io/ai-systems-atlas/";
  const repoBlobRoot = "https://github.com/katagun/ai-systems-atlas/blob/main/";
  for (const link of links) {
    if (link.startsWith(siteRoot)) {
      const file = link.slice(siteRoot.length);
      assert.ok(fs.existsSync(path.join(__dirname, "..", "web", file)), `llms.txt links to missing web/${file}`);
    } else if (link.startsWith(repoBlobRoot)) {
      const file = link.slice(repoBlobRoot.length);
      assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `llms.txt links to missing ${file}`);
    } else {
      assert.fail(`llms.txt link ${link} is neither a site link nor a GitHub blob link: ${link}`);
    }
  }
});

test("llms.txt's site links use the same origin as the share-page builder", () => {
  const llms = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  const builder = fs.readFileSync(path.join(__dirname, "..", "scripts", "build_share_pages.py"), "utf8");
  const match = builder.match(/SITE_URL = "([^"]+)"/);
  assert.ok(match, "could not find SITE_URL in scripts/build_share_pages.py");
  const [, siteUrl] = match;
  const siteLinks = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(m => m[1]).filter(link => !link.startsWith("https://github.com/"));
  assert.ok(siteLinks.length > 0, "llms.txt has no site-origin links to check");
  for (const link of siteLinks) assert.ok(link.startsWith(siteUrl), `${link} does not start with SITE_URL (${siteUrl}); update llms.txt if the domain changed`);
});

test("llms.txt's Data section lists exactly the published catalog files", () => {
  const llms = fs.readFileSync(path.join(__dirname, "..", "web", "llms.txt"), "utf8");
  const validate = fs.readFileSync(path.join(__dirname, "..", "scripts", "validate_directory.py"), "utf8");
  const match = validate.match(/PUBLISHED_DATA = \(([\s\S]*?)\)/);
  assert.ok(match, "could not find PUBLISHED_DATA in scripts/validate_directory.py");
  const published = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  const dataSection = llms.split("## Data")[1].split("## Reference")[0];
  const linked = [...dataSection.matchAll(/\]\(https:\/\/[^)]*\/([a-z-]+\.json)\)/g)].map(m => m[1]).sort();
  assert.deepEqual(linked, published);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_web.js`
Expected: the four new tests FAIL (`web/llms.txt` does not exist yet — `ENOENT`); every pre-existing test still passes.

- [ ] **Step 3: Write `web/llms.txt`**

Create `web/llms.txt`:

```
# AI Systems Atlas

> A reviewed directory of agent, memory, and assistant systems, plus interoperability specifications, managed inference services, and self-operated local runtimes. Every record carries reviewed license evidence and a verified_at date rather than automated scraping or self-reported claims. Relevance and operational capability determine inclusion; license or source model never does.

## Data

Published JSON, no auth, no rate limit — fetch directly.

- [projects.json](https://katagun.github.io/ai-systems-atlas/projects.json): reviewed agent, memory, and assistant systems with editorial scores
- [taxonomy.json](https://katagun.github.io/ai-systems-atlas/taxonomy.json): enum values, license identifiers, and score-profile definitions used by every other file
- [exclusions.json](https://katagun.github.io/ai-systems-atlas/exclusions.json): reviewed scope-boundary decisions — why a candidate was not included
- [license-evidence.json](https://katagun.github.io/ai-systems-atlas/license-evidence.json): scoped, reviewed license and terms evidence per project
- [specifications.json](https://katagun.github.io/ai-systems-atlas/specifications.json): unscored interoperability protocols, metadata schemas, instruction conventions, and package formats
- [inference-services.json](https://katagun.github.io/ai-systems-atlas/inference-services.json): managed inference services with a dedicated operational-service score
- [local-runtimes.json](https://katagun.github.io/ai-systems-atlas/local-runtimes.json): self-operated inference runtimes with a dedicated runtime score

## Reference

- [Taxonomy](https://github.com/katagun/ai-systems-atlas/blob/main/docs/TAXONOMY.md): family, role, and trait definitions behind every enum
- [Curation](https://github.com/katagun/ai-systems-atlas/blob/main/docs/CURATION.md): the review workflow and inclusion rules applied to every record
- [Data model](https://github.com/katagun/ai-systems-atlas/blob/main/docs/DATA_MODEL.md): field-by-field schema for the published files
- [Agent Skill](https://github.com/katagun/ai-systems-atlas/blob/main/skills/ai-systems-atlas/SKILL.md): a packaged skill for querying this data, in the Agent Skills format
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_web.js`
Expected: PASS — all tests, including the four new ones and every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add web/llms.txt tests/test_web.js
git commit -m "$(cat <<'EOF'
Add web/llms.txt as the site's LLM entry point

Follows the llms.txt convention: a short summary, links to every
published JSON file, and links to the docs and skill that define their
vocabulary. Carries no record counts or other figures that would go
stale, and tests/test_web.js enforces that its Data links match
PUBLISHED_DATA and its site-origin links match SITE_URL.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `docs/AGENT_DOCS.md` and routing

**Files:**
- Create: `docs/AGENT_DOCS.md`
- Modify: `AGENTS.md:26` (insert a new table row before the existing `direction and sequencing` row)
- Modify: `tests/test_documentation.py:32` (insert a new tuple entry before the existing `"docs/COVERAGE.md"` entry)

**Interfaces:**
- Consumes: `web/llms.txt` (Task 2), `skills/ai-systems-atlas/` (Task 1) — both referenced by path from `docs/AGENT_DOCS.md`.

- [ ] **Step 1: Write the failing test (extend the existing routing manifest)**

In `tests/test_documentation.py`, the tuple inside `test_task_routing_documents_exist` currently reads (lines 29-33):

```python
        for relative in (
            "ROADMAP.md",
            "BACKLOG.md",
            "docs/CURATION.md",
            "docs/COVERAGE.md",
```

Change it to:

```python
        for relative in (
            "ROADMAP.md",
            "BACKLOG.md",
            "docs/AGENT_DOCS.md",
            "docs/CURATION.md",
            "docs/COVERAGE.md",
```

This is the same pattern the local-runtimes work used to protect `docs/LOCAL_RUNTIMES.md`: adding the path here means `test_routing_documents_are_reachable_from_agents` will now require the literal string `docs/AGENT_DOCS.md` to appear in `AGENTS.md`, and `test_task_routing_documents_exist` will require the file to exist.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: FAIL — `test_task_routing_documents_exist` fails because `docs/AGENT_DOCS.md` does not exist yet. (`test_routing_documents_are_reachable_from_agents` may also fail, since the string isn't in `AGENTS.md` yet.)

- [ ] **Step 3: Write `docs/AGENT_DOCS.md`**

Create `docs/AGENT_DOCS.md`:

```markdown
# Agent-facing discovery docs

Use this doc when changing `web/llms.txt` or `skills/ai-systems-atlas/`.

## What exists and why

- [`web/llms.txt`](../web/llms.txt) is the Atlas's entry point for an LLM that lands on the published site rather than this repository: a short summary, links to every published JSON file, and links to the reference docs that define their vocabulary. It follows the [llms.txt convention](https://llmstxt.org).
- [`skills/ai-systems-atlas/`](../skills/ai-systems-atlas/) packages that same knowledge as a Claude Agent Skill — the format curated in this repository's own Specifications collection as `agent-skills` — so an agent can install it once and query the catalog correctly afterward, rather than rediscovering the taxonomy from scratch on every session.

Both exist for the same reason `AGENTS.md`'s just-in-time table exists: an agent should not have to read every doc in this repository to use it correctly. This is that same just-in-time, progressive-disclosure discipline applied to a reader outside the repository.

## Maintenance contract

- Never add a record count, score, or any other figure to `llms.txt`, `SKILL.md`, or `reference.md`. Counts drift the moment a record is added or removed; `tests/e2e/directory-search.spec.js` had exactly this class of bug fixed by deriving totals from published files instead of hardcoding them.
- `llms.txt`'s Data section must list exactly the files in `PUBLISHED_DATA` (`scripts/validate_directory.py`, `scripts/sync_web_data.py`) — add or remove its entry in the same change that changes that tuple. `tests/test_web.js` enforces this.
- `llms.txt`'s site-origin links must start with the same `SITE_URL` used in `scripts/build_share_pages.py`. `tests/test_web.js` enforces this too; a domain change must update both in the same change.
- If a score profile is renamed, or a taxonomy field the skill describes changes shape, update `skills/ai-systems-atlas/SKILL.md` and `reference.md` in the same change. There is no automated check for this beyond this document and the reachability test in `tests/test_documentation.py`.
```

- [ ] **Step 4: Add the `AGENTS.md` routing row**

In `AGENTS.md`, the table currently reads (lines 26-27):

```markdown
| direction and sequencing | `ROADMAP.md` |
| priorities or follow-up work | `BACKLOG.md` |
```

Change it to:

```markdown
| agent-facing discovery docs, llms.txt, or the Atlas skill | `docs/AGENT_DOCS.md` |
| direction and sequencing | `ROADMAP.md` |
| priorities or follow-up work | `BACKLOG.md` |
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS — all three tests in `DocumentationTests`.

- [ ] **Step 6: Run the full verification suite**

```bash
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --test tests/test_web.js
```

Expected: PASS across the board. No published `directory/*.json` data changed, so `sync_web_data.py`, `build_share_pages.py --check`, and `validate_directory.py` are unaffected by this change; skip re-running them unless a later, unrelated change touches published data.

- [ ] **Step 7: Commit**

```bash
git add docs/AGENT_DOCS.md AGENTS.md tests/test_documentation.py
git commit -m "$(cat <<'EOF'
Document the maintenance contract for llms.txt and the Atlas skill

Adds docs/AGENT_DOCS.md recording why web/llms.txt and
skills/ai-systems-atlas/ exist and the no-hardcoded-figures /
stay-in-sync-with-PUBLISHED_DATA rules that keep them from rotting, an
AGENTS.md routing row pointing to it, and the matching entry in
tests/test_documentation.py's routing manifest.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
