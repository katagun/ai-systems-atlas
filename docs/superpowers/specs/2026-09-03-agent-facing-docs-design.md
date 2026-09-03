# Design: agent-facing discovery docs (llms.txt and an Atlas skill)

**Date:** 2026-09-03
**Status:** Approved design, pending implementation plan

## Problem

The Atlas already applies just-in-time context and progressive disclosure to itself: `AGENTS.md`'s routing table tells a human or coding agent which doc to read for which change, and `docs/WEB.md` applies the same discipline to the directory's own UI. Nothing extends that discipline to an LLM that is not editing this repository but simply trying to use the published site — an agent that lands on `peacefulcoexistance.com` (or is told to fetch it) has no compact, accurate entry point, and no packaged way to learn the taxonomy well enough to query the data correctly (for example, the rule that scores are never comparable across score profiles).

This is a new, small discovery layer for that consumer, not a change to the directory's data model, curation workflow, or UI.

## Decisions

### 1. `web/llms.txt`

A static file at the site root following the [llms.txt convention](https://llmstxt.org): an H1 title, a one-paragraph blockquote summary, then H2 link sections. No record counts or other figures that go stale — `tests/e2e/directory-search.spec.js` just had this exact class of bug fixed by deriving totals from published files rather than hardcoding them; `llms.txt` holds the same line by containing no numbers at all.

Sections:

- **Summary** (blockquote): what the Atlas is, what it curates (agent/memory/assistant systems, specifications, inference services, local runtimes), and that every record carries reviewed license and evidence — no score or count claims.
- **Data**: one link per file in `PUBLISHED_DATA` (`scripts/validate_directory.py` / `scripts/sync_web_data.py`) — `projects.json`, `taxonomy.json`, `exclusions.json`, `license-evidence.json`, `specifications.json`, `inference-services.json`, `local-runtimes.json` — each an absolute URL built from the same site origin as `SITE_URL` in `scripts/build_share_pages.py`, with a one-line note of what each file contains.
- **Reference**: GitHub blob links (`https://github.com/katagun/ai-systems-atlas/blob/main/<path>`) to `docs/TAXONOMY.md`, `docs/CURATION.md`, `docs/DATA_MODEL.md`, and `skills/ai-systems-atlas/SKILL.md` (decision 2) — the docs that define the vocabulary and review discipline behind the data.

`llms.txt` is hand-authored prose with a fixed link list; it is not generated, since nothing in it is derived from data. Drift is caught by the test in decision 4, not by a build step.

### 2. `skills/ai-systems-atlas/` — an Agent Skill

A new repo-root directory, parallel to `scripts/`, `docs/`, `tests/` — not under `web/`. `docs/WEB.md` scopes `web/` as "a dependency-free static application" (the SPA, its data, and generated share pages); a skill is none of those, and this repo already links out to GitHub for reference material that isn't part of the deployed app (`TAXONOMY.md`, `CURATION.md`, `DATA_MODEL.md`). The skill follows the same pattern rather than introducing a new hosting rule.

This is the Agent Skills format the Atlas already tracks as a specification record (`agent-skills` in `directory/specifications.json`): a folder with a `SKILL.md` manifest (YAML frontmatter `name` and `description`, required) and optional bundled resources loaded progressively.

- **`SKILL.md`**: frontmatter plus a short body — which published JSON file answers which kind of question, the taxonomy fields an agent needs to filter correctly (`system_family`, `primary_role`, `score_profile`, `status`), and the single rule most likely to produce a wrong answer if skipped: scores are never comparable across score profiles (ADR 013/014). Ends by pointing to `reference.md` for the full schema.
- **`reference.md`**: bundled, loaded only when the agent needs it — the field-by-field schema for each published JSON file's envelope and record shape, drawn from `docs/DATA_MODEL.md` (project fields), `docs/SPECIFICATIONS.md` (specification fields), `docs/INFERENCE_SERVICES.md` (service fields), and `docs/LOCAL_RUNTIMES.md` (runtime fields). This is the progressive-disclosure split: `SKILL.md` stays short enough to load unconditionally, `reference.md` carries the detail.
- No bundled scripts. The agent already has HTTP fetch; a script would add an execution surface (the Agent Skills specification explicitly does not standardize "the quality and safety of bundled scripts") without adding capability, since the JSON files require no processing beyond parsing and filtering.

### 3. `docs/AGENT_DOCS.md` and an `AGENTS.md` routing row

A short new doc, the same size class as `docs/WEB.md` or `docs/OPERATIONS.md`, recording why `llms.txt` and the skill exist and their maintenance contract:

- Update both when a published JSON filename changes, a score profile is added or renamed, or a taxonomy field the skill describes changes shape.
- Never add a record count, score, or other volatile figure to either file.
- `llms.txt`'s Data links must stay byte-consistent with `PUBLISHED_DATA` in `scripts/validate_directory.py` and `scripts/sync_web_data.py` — if a file is added or removed from that list, add or remove its `llms.txt` entry in the same change.

One new row in `AGENTS.md`'s just-in-time table: "agent-facing discovery docs, llms.txt, or the Atlas skill" → `docs/AGENT_DOCS.md`.

### 4. Tests

- **`tests/test_web.js`**: a new block reads `web/llms.txt` and asserts (a) it starts with an H1 and a blockquote, matching the llms.txt shape; (b) every absolute site-origin link resolves to a real file under `web/`; (c) every `github.com/katagun/ai-systems-atlas/blob/main/<path>` link's `<path>` exists in the repository. This is a static check against the filesystem, no network calls.
- **`tests/test_skill.py`** (new file, picked up automatically by the existing `unittest discover -s tests`): parses `skills/ai-systems-atlas/SKILL.md`'s YAML frontmatter and asserts `name` and `description` are present and non-empty; asserts `skills/ai-systems-atlas/reference.md` exists and is referenced by path from `SKILL.md`.

No CI workflow changes: `verify.yml` already runs `node --test tests/test_web.js` and `uv run python -m unittest discover -s tests -v`.

## Implementation phases

Each phase is independently verifiable and commitable.

1. **The skill.** `skills/ai-systems-atlas/SKILL.md` and `reference.md`; `tests/test_skill.py`.
2. **`llms.txt`.** `web/llms.txt`; the new block in `tests/test_web.js`.
3. **Documentation.** `docs/AGENT_DOCS.md`; the `AGENTS.md` routing row.

## Verification

```
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --test tests/test_web.js
```

No published `directory/*.json` data changes, so `sync_web_data.py`, `build_share_pages.py`, and `validate_directory.py` are unaffected and do not need to be rerun for this change; run them anyway if any adjacent edit touches published data.

## Risks and open questions

- **Domain drift.** `SITE_URL` in `scripts/build_share_pages.py` and `web/index.html`'s canonical/og URLs still say `katagun.github.io` despite the custom-domain `CNAME` already merged (flagged separately, task `task_fe30abc4`). `llms.txt` must build its Data links from the same `SITE_URL` string rather than a new literal, so that fix updates this file for free instead of leaving a second stale domain behind.
- **Skill content staleness.** `reference.md` restates field lists that already live in four other docs. If any of those docs changes shape and `docs/AGENT_DOCS.md`'s maintenance contract is skipped, `reference.md` silently drifts; there is no automated check for this beyond the human/agent discipline the routing row is meant to prompt. Keeping `reference.md`'s schema description structurally short (names and one-line meanings, not full prose) keeps the restatement cheap to keep in sync.
