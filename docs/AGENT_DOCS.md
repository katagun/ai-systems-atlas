# Agent-facing discovery docs

Use this doc when changing `web/llms.txt` or `skills/ai-systems-atlas/`.

## What exists and why

- [`web/llms.txt`](../web/llms.txt) is the Atlas's entry point for an LLM that lands on the published site rather than this repository: a short summary, links to every published JSON file, and links to the reference docs that define their vocabulary. It follows the [llms.txt convention](https://llmstxt.org).
- [`skills/ai-systems-atlas/`](../skills/ai-systems-atlas/) packages that same knowledge as a Claude Agent Skill — the format curated in this repository's own Specifications collection as `agent-skills` — so an agent can install it once and query the catalog correctly afterward, rather than rediscovering the taxonomy from scratch on every session.

Both exist for the same reason `AGENTS.md`'s just-in-time table exists: an agent should not have to read every doc in this repository to use it correctly. This is that same just-in-time, progressive-disclosure discipline applied to a reader outside the repository.

## Maintenance contract

- Never add a record count, score, or any other figure to `llms.txt`, `SKILL.md`, or `reference.md`. Counts drift the moment a record is added or removed; `tests/e2e/directory-search.spec.js` had exactly this class of bug fixed by deriving totals from published files instead of hardcoding them.
- `llms.txt`'s Data section must list exactly the files in `PUBLISHED_DATA` (`scripts/validate_directory.py`, `scripts/sync_web_data.py`) — add or remove its entry in the same change that changes that tuple. `tests/test_web.js` enforces this.
- The API view in `web/index.html` is the same list for a human reader. Its endpoint links must stay in step with `llms.txt` and `PUBLISHED_DATA`; `tests/test_web.js` enforces both the file list and the origin. Adding a published file means changing the tuple, `llms.txt`, and the API view in one commit.
- `llms.txt`'s site-origin links must start with the same `SITE_URL` used in `scripts/build_share_pages.py`. `tests/test_web.js` enforces this too; a domain change must update both in the same change.
- If a score profile is renamed, or a taxonomy field the skill describes changes shape, update `skills/ai-systems-atlas/SKILL.md` and `reference.md` in the same change. There is no automated check for this beyond this document and the reachability test in `tests/test_documentation.py`.
- The files `scripts/build_web_payload.py` writes under `web/app/` are deliberately absent from `llms.txt`, the Atlas skill, and the API view's endpoint list in `web/index.html`. They are a projection of the published files shaped for this page's own first render, not a second copy of the catalog, and their split may change with any web change that alters what a card or a dialog needs. An agent or API consumer reads the seven published endpoints; do not add `app/` paths to any of these three surfaces to "complete" the list.
