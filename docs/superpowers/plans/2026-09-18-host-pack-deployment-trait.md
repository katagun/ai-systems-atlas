# Host-pack deployment trait Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scored systems that install as skills packs findable from the Agent packs scope and the Systems deployment filter, by adding the `host_pack` deployment mode, applying it to nine records, and rendering a second block in the Packs scope, recorded in ADR 033.

**Architecture:** A taxonomy value on the existing `deployment` trait (no new field, no migration), one pure helper in `web/app-core.js`, one extra block rendered by the packs renderer in `web/app.js`, and the documents that make the trait reachable. ADR 031, ADR 032, scores, and collection membership are untouched.

**Tech Stack:** Python 3.11 with `uv` and `unittest`; dependency-free browser JS; Node test runner (`/usr/local/bin/node`, v22); Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-host-pack-deployment-trait-design.md`

## Global Constraints

- Taxonomy value: id `host_pack`, name `Installed into a host agent`, definition exactly: "A skills bundle, plugin, or vault template the user installs into a host coding agent's own directories, so the system runs inside that host's sessions rather than as its own process."
- The nine records: `superpowers`, `gentle-ai`, `ecc`, `gstack`, `vibecode-pro-max-kit`, `oh-my-openagent`, `claude-obsidian`, `obsidian-second-brain`, `hyperresearch`. Add `host_pack` to `deployment` only when the record's own prose says it installs into a host; report any that do not. Set each edited record's `verified_at` to `2026-09-18`. Change nothing else on them.
- Packs-scope block heading text: `Scored systems installed as packs`; note text: "These are reviewed systems that ship as a skills bundle, plugin, or vault; their scores live in the Systems scope."; the block honours the search term only and hides when empty; cards show no score ring and no Compare.
- No card badge, no new field, no payload change (`deployment` is already a boot field).
- Every node command uses `/usr/local/bin/node` (the default node is v16). Run `node scripts/build_asset_version.mjs` after editing `web/app.js`, `web/app-core.js`, or `web/index.html` and commit the re-stamped `web/index.html`. Run `uv run python scripts/sync_web_data.py`, `build_web_payload.py`, and `build_share_pages.py` after editing any published `directory/*.json` and commit the output.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never report a check as passing unless you ran it. Do not push.

---

### Task 1: The trait, the nine records, ADR 033, and the documents

**Files:**
- Modify: `directory/taxonomy.json` (`deployment_modes`), `directory/projects.json` (nine records), `AGENTS.md` (packs routing row), `docs/TAXONOMY.md`, `docs/DATA_MODEL.md`, `docs/PACKS.md`, `docs/CURATION.md`, `docs/COVERAGE.md`, `skills/ai-systems-atlas/SKILL.md`
- Create: `docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md`
- Test: `tests/test_directory.py`, `tests/test_documentation.py`

**Interfaces:**
- Produces: taxonomy id `host_pack` in `deployment_modes`; nine `projects.json` records whose `deployment` includes `host_pack`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_directory.py`, after `test_packs_are_a_separate_unscored_collection`:

```python
    def test_systems_installed_as_packs_carry_the_host_pack_deployment_mode(self) -> None:
        modes = {item["id"] for item in self.taxonomy["deployment_modes"]}
        self.assertIn("host_pack", modes)
        carriers = {p["id"] for p in self.document["projects"] if "host_pack" in p["deployment"]}
        self.assertIn("superpowers", carriers)
        for project in self.document["projects"]:
            if "host_pack" in project["deployment"]:
                # A pack-installed system still runs somewhere: it names another mode or an interface.
                self.assertTrue(
                    len(project["deployment"]) > 1 or project.get("agent_interfaces"),
                    project["id"],
                )
```

In `tests/test_documentation.py` `test_task_routing_documents_exist`, add `"docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md",` after the ADR 032 line.

Run: `uv run python -m unittest tests.test_directory -k host_pack -v; uv run python -m unittest tests.test_documentation -k routing -v`
Expected: both FAIL (`host_pack` absent; ADR 033 missing).

- [ ] **Step 2: Add the taxonomy value**

In `directory/taxonomy.json`, append to `deployment_modes` (one line, matching the file's style):

```json
    {"id": "host_pack", "name": "Installed into a host agent", "definition": "A skills bundle, plugin, or vault template the user installs into a host coding agent's own directories, so the system runs inside that host's sessions rather than as its own process."}
```

- [ ] **Step 3: Apply it to the nine records**

For each id in the Global Constraints list, read the record's `description`, `canonical_data`, and `current_repo_note`; if they state that the system installs into a host agent (skills, plugin, vault, hooks, commands the host reads), append `"host_pack"` to its `deployment` list (keep existing modes and order, add at the end) and set `verified_at` to `"2026-09-18"`. Do not touch any other field. If a record's prose does not say so, leave it unchanged and name it in your report.

- [ ] **Step 4: Write ADR 033**

Create `docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md` with `**Status:** Accepted` and these sections, in the voice of ADR 018 and ADR 019:

- `## Context`: Superpowers was published 2026-09-18 as a scored coding-agent workflow on its companion server under ADR 031; a reader who knows it as a skills pack cannot find it from the Agent packs scope, and `packs.json` does not list it. The role is named "Coding-agent workflow / skill stack", so the classification holds; the record is unreachable from where a reader looks. A placement-by-distribution-form proposal was refuted: its exception clause was ADR 031's rejected wording, the catalog never withdraws a reviewed score (ADR 016), and `BACKLOG.md` already settled packaging as a trait on 2026-09-17.
- `## Decision`: installing into a host agent is a deployment mode, `host_pack`, on the existing `deployment` trait ADR 003 names and ADR 018 already used. Nine records carry it from their own prose. The Agent packs scope renders a second block, "Scored systems installed as packs", listing systems that carry the mode, scores hidden, each opening its own system dialog; the Systems deployment filter reaches the same records because it is taxonomy-driven. Subsections: "Making the trait reachable is a precondition" (cite ADR 017, 018, 019) and "What this does not change" (ADR 031 still decides which pack-shaped repositories are systems and ADR 032 which are packs; a repository still appears in exactly one collection; the block is a presentation-layer union under ADR 013 and merges no schema; no score changes; no badge, because nine records is under the 10% guide).
- `## Alternatives considered`: placement by distribution form (refuted as above); a new `distributed_as` field (deployment already carries the fact); moving Superpowers to `packs.json` (would withdraw a score and leave a published systems URL with no successor).
- `## Consequences`: the Packs scope shows scored systems beside packs; the deployment filter gains a value; `docs/PACKS.md` explains the relationship; a future pack-shaped system gets the mode at review; the value is never used to decide inclusion.

Do not write markdown links inside code spans; relative links to sibling ADRs are fine.

- [ ] **Step 5: Amend the documents**

- `AGENTS.md`: in the routing row for "skill packs, plugins, vault bundles, marketplaces, or harness add-ons", append `` and `docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md` `` inside the existing backtick list (keep the row's format).
- `docs/TAXONOMY.md`: after the paragraph beginning "Specifications, inference services, local runtimes, models, and agent packs are separate collections", add: "Installing into a host agent is a deployment mode, `host_pack`, not a collection: a scored system that ships as a skills bundle, plugin, or vault keeps its family, role, and score, and the Agent packs scope lists it beside the unscored packs. See \[ADR 033\] (adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md)."
- `docs/DATA_MODEL.md` project-record Traits line: after "deployment" add " (including `host_pack` for systems installed into a host agent)".
- `docs/PACKS.md`: add a section before "Current coverage":

```markdown
## Scored systems that install as packs

A repository that installs as a skills bundle, plugin, or vault and passes ADR 031's prongs is a scored system, not a pack, and it never appears in `packs.json`. It carries the deployment mode `host_pack` on its system record instead, and the Agent packs scope lists it under "Scored systems installed as packs" beside the unscored packs, with its score hidden and its details in the Systems scope. Set the mode at review from the record's own prose; it never decides inclusion. See [ADR 033](adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md).
```

- `docs/CURATION.md` packs paragraph (the one citing ADR 031 and ADR 032): append the sentence "A pack-shaped repository that passes the prongs is a scored system and carries the deployment mode `host_pack` so the Agent packs scope can list it; see \[ADR 033\] (adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md)."
- `docs/COVERAGE.md` Agent packs subsection: append "Scored systems that install as packs carry the `host_pack` deployment mode and are listed in the Packs scope beside the collection; nine records carry it as of 2026-09-18."
- `skills/ai-systems-atlas/SKILL.md` fetch table: change the packs row's question cell to "Skills bundles, plugins, process kits, vault bundles, and plugin marketplaces a host agent installs (unscored); scored systems that install as packs are in `projects.json` with `deployment` containing `host_pack`".

- [ ] **Step 6: Regenerate and verify**

Run: `uv run python scripts/sync_web_data.py && uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && /usr/local/bin/node scripts/build_asset_version.mjs && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests 2>&1 | tail -3 && uv run ruff check scripts tests && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -3`
Expected: validator clean; unittest OK (the two new tests pass); node tests pass.

- [ ] **Step 7: Commit**

```bash
git add directory web docs AGENTS.md skills tests
git commit -m "ADR 033: installing into a host is a deployment mode, not a collection

Adds the host_pack deployment mode, applies it to the nine scored systems
that install as skills bundles, plugins, or vaults, and documents how the
Agent packs scope will list them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The Packs-scope block and the pure helper

**Files:**
- Modify: `web/app-core.js` (new `packShapedSystems`, export), `web/app.js` (`renderPacks`, a `mixedSystemCard` helper factored from `renderAllDirectoryEntries`, the packs renderer), `web/index.html` (packs panel markup), `docs/WEB.md`
- Test: `tests/test_web.js`

**Interfaces:**
- Consumes: `deployment` including `host_pack` on boot records (Task 1).
- Produces: `AtlasCore.packShapedSystems(projects, { term, searchIndex })`; DOM ids `#pack-systems-block`, `#pack-systems-heading`, `#pack-systems-count`, `#pack-systems-grid`; `mixedSystemCard(record)` in `app.js`.

- [ ] **Step 1: Write the failing node tests**

Add `packShapedSystems` to the `require` list at the top of `tests/test_web.js` and append:

```js
test("packShapedSystems lists only host-pack systems, by name, honouring the term and index", () => {
  const systems = [
    { id: "gstack", name: "GStack", description: "Cross-host workflow.", deployment: ["local_cli", "host_pack"], repo: "garrytan/gstack", url: "https://github.com/garrytan/gstack" },
    { id: "superpowers", name: "Superpowers", description: "A skills library.", deployment: ["local_cli", "host_pack"], repo: "obra/superpowers", url: "https://github.com/obra/superpowers" },
    { id: "emdash", name: "emdash", description: "Desktop app.", deployment: ["desktop"], repo: "x/emdash", url: "https://github.com/x/emdash" },
  ];
  assert.deepEqual(packShapedSystems(systems, {}).map(item => item.id), ["gstack", "superpowers"]);
  assert.deepEqual(packShapedSystems(systems, { term: "skills" }).map(item => item.id), ["superpowers"]);
  assert.deepEqual(packShapedSystems(systems, { term: "onlyindex", searchIndex: { gstack: "onlyindex" } }).map(item => item.id), ["gstack"]);
  assert.deepEqual(packShapedSystems([systems[2]], {}), []);
});
```

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | grep -E "^not ok|packShapedSystems" | head`
Expected: `packShapedSystems is not a function`.

- [ ] **Step 2: Implement the helper**

In `web/app-core.js`, after `filterDirectoryEntries`:

```js
  // Scored systems that install into a host agent as a skills bundle, plugin,
  // or vault (deployment mode host_pack, ADR 033). The Packs scope lists them
  // beside the unscored packs; the search term is the only filter that applies,
  // because pack facets describe packs, not systems.
  function packShapedSystems(projects, filters = {}) {
    const term = (filters.term || "").trim().toLowerCase();
    return projects
      .filter(project => (project.deployment || []).includes("host_pack"))
      .filter(project => matchesDirectoryProjectSearch(project, term, filters.searchIndex))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
```

Export `packShapedSystems` in the returned object (alphabetical position after `monogramGlyph`).

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | tail -3 && npm run lint:js`
Expected: pass, lint clean.

- [ ] **Step 3: Markup**

In `web/index.html`, after `#pack-pager` inside `#packs-directory-panel`, add:

```html
        <section id="pack-systems-block" class="pack-systems-block" hidden aria-labelledby="pack-systems-heading">
          <h2 id="pack-systems-heading" class="pack-systems-heading">Scored systems installed as packs <span id="pack-systems-count" class="pack-systems-count"></span></h2>
          <p class="pack-systems-note">These are reviewed systems that ship as a skills bundle, plugin, or vault; their scores live in the Systems scope.</p>
          <section id="pack-systems-grid" class="project-grid" aria-label="Scored systems installed as packs"></section>
        </section>
```

In `web/styles.css`, add rules for `.pack-systems-block` (top margin using an existing spacing token), `.pack-systems-heading` (the section-heading font already used by `h2` in `.section-heading`; reuse tokens, no colour literals), `.pack-systems-count` (mono metadata font token, `color: var(--muted)` or the token the result-row uses), `.pack-systems-note` (muted body text). Check `:root` for the token names before writing; never add a literal.

- [ ] **Step 4: Render the block**

In `web/app.js`:

1. Factor the `kind === "system"` card branch of `renderAllDirectoryEntries` into a function `mixedSystemCard(record)` returning the same markup, and call it from `renderAllDirectoryEntries` so behaviour is unchanged.
2. Add:

```js
function renderPackShapedSystems() {
  const systems = AtlasCore.packShapedSystems(state.projects, {
    term: $("#pack-search").value,
    searchIndex: searchIndexes.systems,
  });
  const block = $("#pack-systems-block");
  block.hidden = systems.length === 0;
  $("#pack-systems-count").textContent = systems.length ? `${systems.length} ${systems.length === 1 ? "system" : "systems"}` : "";
  const grid = $("#pack-systems-grid");
  grid.innerHTML = systems.map(mixedSystemCard).join("");
  $$('[data-project]', grid).forEach(button => button.addEventListener("click", () => openProject(button.dataset.project)));
  paintMarks(grid);
}
```

3. Change `const renderPacks = () => renderCollection("packs");` to `const renderPacks = () => { renderCollection("packs"); renderPackShapedSystems(); };`.
4. In `SEARCH_SCOPES`, change `"#pack-search": ["packs"]` to `"#pack-search": ["packs", "systems"]` so focusing the packs search also loads the systems index.

Run: `/usr/local/bin/node --check web/app.js && npm run lint:js && /usr/local/bin/node scripts/build_asset_version.mjs && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -3`
Expected: clean; the stylesheet guard passes.

- [ ] **Step 5: Document**

`docs/WEB.md`: in the Packs bullets add "- Below the packs grid, the Packs scope lists scored systems whose deployment includes `host_pack` under 'Scored systems installed as packs', alphabetical, search-term only, scores hidden, each opening its own system dialog; the block hides when empty (ADR 033)."; in the deployment-filter bullet add "including `host_pack` for systems installed into a host agent"; extend manual check 31 with "confirm the scored-systems block lists Superpowers, shows no score or Compare, and opens the system dialog".

- [ ] **Step 6: Smoke and commit**

Serve `web/` (`uv run python -m http.server 8765 --directory web`), open `/?collection=packs`, confirm the block renders with nine cards and no score rings, and that typing "super" leaves Superpowers alone in the block; stop the server. If you cannot drive a browser, say so in the report.

```bash
git add web docs/WEB.md tests/test_web.js
git commit -m "List scored systems installed as packs in the Agent packs scope

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Browser coverage and full verification

**Files:**
- Modify: `tests/e2e/directory-search.spec.js`

- [ ] **Step 1: Add the Playwright tests**

Append:

```js
test("the packs scope lists scored systems installed as packs without scores and opens their system dialog", async ({ page }) => {
  await page.goto("/?collection=packs");
  const block = page.locator("#pack-systems-block");
  await expect(block).toBeVisible();
  await expect(page.locator("#pack-systems-heading")).toContainText("Scored systems installed as packs");
  const cards = page.locator("#pack-systems-grid .project-card h2");
  await expect(cards.filter({ hasText: /^Superpowers$/ })).toHaveCount(1);
  await expect(page.locator("#pack-systems-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#pack-systems-grid .compare-toggle")).toHaveCount(0);

  await page.locator("#pack-search").fill("Superpowers");
  await expect(cards).toHaveText(["Superpowers"]);
  await expect(page.locator("#pack-grid .project-card")).toHaveCount(0);

  await page.locator('#pack-systems-grid [data-project="superpowers"]').click();
  await expect(page.locator("#project-dialog")).toBeVisible();
  await expect(page).toHaveURL(/record=system(%3A|:)superpowers/);
});

test("the systems deployment filter reaches systems installed into a host agent", async ({ page }) => {
  await page.goto("/?collection=systems");
  await page.locator("#deployment-filter").selectOption("host_pack");
  const names = page.locator("#project-grid .project-card h2");
  await expect(names.filter({ hasText: /^Superpowers$/ })).toHaveCount(1);
});
```

If the Systems scope opens with the family filter set, clear it the way the existing deployment-filter test at the "vendor-operated systems" test does before selecting the option.

- [ ] **Step 2: Run the suite and the full command list**

Run `PATH=/usr/local/bin:$PATH npm run test:e2e 2>&1 | tail -5`, then every command in `AGENTS.md`'s Commands section in order, recording each tail. All must pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e
git commit -m "Cover the scored-systems block in the packs scope and the host_pack filter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
