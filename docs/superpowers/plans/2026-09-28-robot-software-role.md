# Robot Software Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide, in ADR 044, that robot software classifies under existing roles with reaching a robot as a trait; make that trait reachable through a Capability filter; then review the five held robot-software candidates and record each verdict.

**Architecture:** Two PRs. PR A (Tasks 1–6) lands the decision as a Proposed ADR, one `agent_capabilities` value, a Capability filter on the Systems scope, a discovery rung, and the documentation. PR B (Tasks 7–13) re-fetches the evidence, publishes LeRobot and OM1 as `agent_framework_sdk` records through the guarded promotion script, holds openpi and the Safari SDK under new labels, queues Octo, excludes Dora and six screened neighbours, records coverage batch 96, and sets the ADR to Accepted.

**Tech Stack:** Python 3 scripts run with `uv run python`, Node tests run with `/usr/local/bin/node --test`, Playwright e2e, static web app in `web/`, canonical JSON in `directory/`.

**Spec:** `docs/superpowers/specs/2026-09-27-robot-software-role-design.md`

## Global Constraints

- The new capability is exactly `{ "id": "robot_control", "name": "Robot control" }` in `directory/taxonomy.json` `agent_capabilities`, appended after `workflows`.
- Its definition, used wherever a definition is printed: "The agent's model-driven decisions are sent to a physical robot's actuators through a robot interface the system documents for that purpose."
- No new `execution_boundaries` value, no `perception` value, no validator implication rule, no card badge, no change to `CARD_BADGE_SETS`.
- The filter control is `<select id="capability-filter">` whose empty option reads "All capabilities"; its key is `capability` in `SCOPE_CONTROLS.systems` (web/app.js), `SCOPE_URL_PARAMS.systems` (web/app-core.js), `directoryDefaults()`, and `matchesProjectFacets`.
- The discovery rung routes descriptions containing any of `robot`, `humanoid`, `quadruped`, `manipulation`, `teleoperation`, `vision-language-action`, `actuator` to `agent_framework_sdk` with `max(relevance, 0.82)`. "ROS" is not a keyword. `DISCOVERY_QUERIES` is unchanged.
- ADR file: `docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md`, title "ADR 044: Robot software classifies by the outcome it owns". Before each PR opens, run `git ls-tree --name-only origin/main docs/adr/`; if a `044-` file exists there, renumber this file and every reference to it to the next free number.
- Published records: `id` `lerobot` and `om1`, `system_family` `agent_system`, `primary_role` `agent_framework_sdk`, `score_profile` `agent`, `agent_capabilities` containing `robot_control`, `execution_boundaries` containing `host`.
- Hold labels: openpi and Octo `action-policy model boundary`; Safari SDK `programme-gated run path`.
- Dates written by this work are `2026-09-28` unless a step says otherwise.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every PR description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits run the full pre-commit suite and take minutes. Write hook output to a file under the scratchpad, never pipe it to `tail`. Use `/usr/local/bin/node`; `grep` is aliased, so call `/usr/bin/grep`.
- Regeneration order after any data or docs change that the web reads: `uv run python scripts/sync_web_data.py`, `uv run python scripts/build_web_payload.py`, `uv run python scripts/build_share_pages.py`, `uv run python scripts/build_blog.py`, `/usr/local/bin/node scripts/build_asset_version.mjs`, then `uv run python scripts/validate_directory.py`.
- The branch is `claude/robot-software-role`, rebased on `origin/main` at 58c341ba or later. Merge `origin/main` again immediately before each PR opens.
- Auto-merge is enabled only when the owner asks.

---

## PR A: decision and plumbing

### Task 1: The `robot_control` capability

**Files:**
- Modify: `directory/taxonomy.json` (the `agent_capabilities` array, after the `workflows` entry)
- Modify: `docs/TAXONOMY.md:42` (the capabilities bullet)
- Modify: `docs/DATA_MODEL.md:67` (the sentence on automation never inferring editorial traits)
- Test: `tests/test_directory.py`

**Interfaces:**
- Produces: the taxonomy id `robot_control`, which Tasks 2, 3, 5, 8 and 9 use.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_directory.py`, after `test_provider_relationship_is_a_trait_not_a_family`:

```python
    def test_robot_control_is_a_capability_not_a_role_or_boundary(self) -> None:
        """ADR 044: reaching a robot is a trait on agent_capabilities, nothing else."""
        capabilities = {item["id"]: item for item in self.taxonomy["agent_capabilities"]}
        self.assertIn("robot_control", capabilities)
        self.assertEqual("Robot control", capabilities["robot_control"]["name"])
        self.assertNotIn(
            "robot_control", {item["id"] for item in self.taxonomy["primary_roles"]}
        )
        self.assertNotIn(
            "robot_control",
            {item["id"] for item in self.taxonomy["execution_boundaries"]},
        )
        self.assertNotIn(
            "perception", {item["id"] for item in self.taxonomy["agent_capabilities"]}
        )
        self.assertNotIn(
            "physical_actuator",
            {item["id"] for item in self.taxonomy["execution_boundaries"]},
        )

    def test_validator_accepts_robot_control_and_rejects_unknown_capabilities(self) -> None:
        from scripts.validate_directory import validate_projects, validate_taxonomy

        tax = validate_taxonomy(self.taxonomy, [])
        framework = next(
            project
            for project in self.document["projects"]
            if project["id"] == "langgraph"
        )
        carrying = json.loads(json.dumps(framework))
        carrying["agent_capabilities"] = ["robot_control"]
        unknown = json.loads(json.dumps(framework))
        unknown["agent_capabilities"] = ["actuation"]

        errors: list[str] = []
        validate_projects(
            {"generated_at": self.document["generated_at"], "projects": [carrying]},
            tax,
            errors,
        )
        self.assertEqual([], [e for e in errors if "agent_capabilities" in e], errors)

        errors = []
        validate_projects(
            {"generated_at": self.document["generated_at"], "projects": [unknown]},
            tax,
            errors,
        )
        self.assertTrue(any("agent_capabilities" in e for e in errors), errors)
```

`validate_projects(data, tax, errors)` appends to `errors` and returns an index; `validate_taxonomy(taxonomy, errors)` builds the `Taxonomy` it needs. `tests/test_update_directory.py` imports `from scripts import update_directory`, so `scripts` is importable as a package from the tests. The test asserts only on error strings that name `agent_capabilities`, so unrelated validation of the copied record does not matter.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --with pytest python -m pytest tests/test_directory.py -k "robot_control" -v`
Expected: both FAIL, the first with `'robot_control' not found in ...`, the second because the carrying record produces an `unknown agent_capabilities` style error.

- [ ] **Step 3: Add the value and the two documentation sentences**

In `directory/taxonomy.json`, after the `workflows` entry of `agent_capabilities`:

```json
    {
      "id": "workflows",
      "name": "Explicit workflows / graphs"
    },
    {
      "id": "robot_control",
      "name": "Robot control",
      "definition": "The agent's model-driven decisions are sent to a physical robot's actuators through a robot interface the system documents for that purpose."
    }
```

The `definition` key is new on this vocabulary. The Taxonomy view in `web/app.js` prints `item.definition || item.note || "An explicit comparison trait."`, so this value shows its definition and the others keep the generic sentence. The validator's `ids_for` in `scripts/validate_directory.py` reads only each item's `id` and does not restrict other keys, so no validator change is needed.

In `docs/TAXONOMY.md` line 42, replace the capabilities bullet with:

```markdown
- capabilities: code and shell execution, browser control, research, multi-agent coordination, persistent state, MCP, explicit workflows, and robot control. Robot control means the agent's model-driven decisions are sent to a physical robot's actuators through a robot interface the system documents for that purpose; a motion API, teach pendant, or waypoint script with nothing said about a model choosing the action is not robot control, and a run path that ends in a simulator is not either.
```

In `docs/DATA_MODEL.md` line 67, append one sentence to the paragraph so it ends:

```markdown
... Automation and candidate discovery never infer these editorial traits, and never infer `robot_control`: a reviewer sets it from the record's own evidence.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --with pytest python -m pytest tests/test_directory.py -v` and `uv run python scripts/validate_directory.py`
Expected: all PASS; the validator prints no errors.

- [ ] **Step 5: Commit**

```bash
git add directory/taxonomy.json docs/TAXONOMY.md docs/DATA_MODEL.md tests/test_directory.py
git commit -F - <<'EOF'
Add robot_control to the agent capabilities

ADR 044 records reaching a robot as a capability, beside browser control,
never as a role or an execution boundary.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: The capability facet in the core filter

**Files:**
- Modify: `web/app-core.js:6-21` (`directoryDefaults`), `web/app-core.js:93-106` (`matchesProjectFacets`), `web/app-core.js:649-660` (`SCOPE_URL_PARAMS.systems`)
- Test: `tests/test_web.js`

**Interfaces:**
- Consumes: nothing from Task 1 at unit level; the fixture carries capability ids directly.
- Produces: `filters.capability` (string, `""` means unset) read by `matchesProjectFacets`; `SCOPE_URL_PARAMS.systems.capability === ""`; `directoryDefaults().capability === ""`. Task 3 wires the DOM to these.

- [ ] **Step 1: Give the fixture capabilities and write the failing tests**

In `tests/test_web.js`, edit the fixture at lines 12–14 so the three agent records carry capabilities. Add `agent_capabilities: ["code_editing", "shell_execution"]` to `Agent`, `agent_capabilities: ["browser_control", "research"]` to `Work Agent`, and `agent_capabilities: ["workflows", "robot_control"]` to `SDK`. The memory and assistant records get no `agent_capabilities` key, which is how published memory records look.

Update the defaults test at lines 38–54 by adding `capability: "",` after `agentInterface: "",`.

Add after the interface tests (after line 549):

```javascript
test("capability filtering reaches the agents that carry a capability", () => {
  const browsers = filterAndSortProjects(projects, { capability: "browser_control", status: "active", sort: "name" });
  const robots = filterAndSortProjects(projects, { capability: "robot_control", status: "active", sort: "name" });

  assert.deepEqual(browsers.map(project => project.name), ["Work Agent"]);
  assert.deepEqual(robots.map(project => project.name), ["SDK"]);
});

test("the capability filter defaults to unset and skips records with no capabilities", () => {
  assert.equal(directoryDefaults().capability, "");
  assert.equal(matchesProject(projects[0], { capability: "" }), true);
  assert.equal(matchesProject(projects[0], { capability: "browser_control" }), false);
});

test("the capability filter combines with role rather than replacing it", () => {
  const results = filterAndSortProjects(projects, {
    role: "agent_framework_sdk",
    capability: "robot_control",
    status: "active",
    sort: "name",
  });
  assert.deepEqual(results.map(project => project.name), ["SDK"]);
  const none = filterAndSortProjects(projects, {
    role: "coding_agent",
    capability: "robot_control",
    status: "active",
    sort: "name",
  });
  assert.deepEqual(none, []);
});

test("the systems scope writes the capability to the URL", () => {
  assert.equal(SCOPE_URL_PARAMS.systems.capability, "");
});
```

Check that `SCOPE_URL_PARAMS` is imported at the top of `tests/test_web.js` (search `SCOPE_URL_PARAMS` in the file's require line); if not, add it to the destructured `AtlasCore` import the file already uses.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: the defaults test and the four new tests are `not ok`; everything else passes.

- [ ] **Step 3: Implement the facet**

In `web/app-core.js` `directoryDefaults()`, add `capability: "",` after `agentInterface: "",`.

In `matchesProjectFacets`, add one line after the `agentInterface` line:

```javascript
      (!filters.agentInterface || (project.agent_interfaces || []).includes(filters.agentInterface)) &&
      (!filters.capability || (project.agent_capabilities || []).includes(filters.capability)) &&
```

In `SCOPE_URL_PARAMS.systems`, add `capability: ""` after `agentInterface: ""`:

```javascript
    systems: { q: "", family: "", role: "", agent: "", architecture: "", deployment: "", agentInterface: "", capability: "", sourceModel: "", license: "", status: "active", localOnly: "", sort: "name" },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -F - <<'EOF'
Filter systems by agent capability

A capability facet joins the Systems scope's filter set and URL state,
so a trait such as robot control is reachable rather than only printed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: The Capability control in the page

**Files:**
- Modify: `web/index.html:123` (after the Interface label)
- Modify: `web/app.js:328` (`SCOPE_CONTROLS.systems`), `web/app.js:563-564` (filter population), `web/app.js:686-698` (`updateAdvancedFilterSummary`), `web/app.js:700-718` (`applyDirectoryDefaults`), `web/app.js:1218` (the filters object read for rendering), `web/app.js:2030-2038` (Finder handoff reset), `web/app.js:3124` (input listeners)
- Test: `tests/e2e/directory-search.spec.js`, `tests/e2e/url-state.spec.js` (existing parity test)

**Interfaces:**
- Consumes: `filters.capability`, `SCOPE_URL_PARAMS.systems.capability`, `directoryDefaults().capability` from Task 2.
- Produces: `#capability-filter` select; `SCOPE_CONTROLS.systems.capability === "#capability-filter"`.

- [ ] **Step 1: Write the failing e2e test**

Add to `tests/e2e/directory-search.spec.js` after the interface test (after line 561). If `tests/e2e/helpers/landing.js` exists on the branch (the Phase 2 session's PR #347), import its navigation helper and use it for the initial `goto`; otherwise use the plain `goto` shown:

```javascript
test("the capability filter reaches the agents that carry a capability", async ({ page }) => {
  await page.goto("/?collection=systems");

  const names = page.locator("#project-grid .project-card h2");
  await page.locator(".advanced-filter-shell summary").click();
  await page.locator("#capability-filter").selectOption("browser_control");

  await expect(names.filter({ hasText: /^Browser Use$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^Aider$/ })).toHaveCount(0);
  await expect(page.locator(".advanced-filter-shell summary")).toHaveText("More filters · 1 active");
  await expect(page).toHaveURL(/capability=browser_control/);

  await page.reload();
  await expect(page.locator("#capability-filter")).toHaveValue("browser_control");
  await expect(names.filter({ hasText: /^Aider$/ })).toHaveCount(0);
});
```

Browser Use carries `browser_control` and Aider does not (checked in `directory/projects.json` on 2026-09-28). If either name has moved off the first page under the default name sort, choose another pair from `python3 -c` over `web/projects.json` and note it in the task report.

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `/usr/local/bin/node node_modules/.bin/playwright test tests/e2e/directory-search.spec.js -g "capability filter" 2>&1 | tail -20`
Expected: FAIL at `selectOption` because `#capability-filter` does not exist.

Also run the parity test to see it fail for the right reason once Task 2 is in: `/usr/local/bin/node node_modules/.bin/playwright test tests/e2e/url-state.spec.js -g "URL keys match" 2>&1 | tail -8`
Expected: FAIL listing `systems: URL keys [...capability...], controls [...]`.

- [ ] **Step 3: Add the control and wire it**

`web/index.html`, after line 123:

```html
              <label><span>Interface</span><select id="agent-interface-filter"><option value="">All interfaces</option></select></label>
              <label><span>Capability</span><select id="capability-filter"><option value="">All capabilities</option></select></label>
```

`web/app.js`:

1. `SCOPE_CONTROLS.systems` (line 328): add `capability: "#capability-filter",` after `agentInterface: "#agent-interface-filter",`.
2. Filter population (after line 564):

```javascript
  const publishedCapabilities = new Set(state.projects.flatMap(project => project.agent_capabilities || []));
  state.taxonomy.agent_capabilities.filter(item => publishedCapabilities.has(item.id)).forEach(item => $("#capability-filter").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`));
```

3. `updateAdvancedFilterSummary` (line 693): add `$("#capability-filter").value,` after the interface line.
4. `applyDirectoryDefaults` (line 714): add `$("#capability-filter").value = defaults.capability;` after the interface line.
5. The filters object read for rendering (line 1218): add `capability: $("#capability-filter").value,` after `agentInterface`.
6. Finder handoff reset (line 2033): add `$("#capability-filter").value = "";` after the interface line.
7. Input listeners (line 3124): add `"#capability-filter"` to the array after `"#agent-interface-filter"`.

Then search the file for every other place `#agent-interface-filter` appears (`/usr/bin/grep -n "agent-interface-filter" web/app.js`) and mirror each one for `#capability-filter`; the seven above were the occurrences on 2026-09-28. Restoring from the URL and `clearScopeFacets` iterate `SCOPE_CONTROLS`, so they need no edit.

- [ ] **Step 4: Regenerate the asset stamp and run the tests**

Run: `/usr/local/bin/node scripts/build_asset_version.mjs`, then `/usr/local/bin/node --test tests/test_web.js 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`, then `/usr/local/bin/node node_modules/.bin/playwright test tests/e2e/directory-search.spec.js tests/e2e/url-state.spec.js tests/e2e/finder-handoff.spec.js 2>&1 | tail -6`
Expected: `# fail 0`; every e2e test in those three files passes, including "every scope's URL keys match its controls".

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/app.js web/index.html tests/e2e/directory-search.spec.js
git commit -F - <<'EOF'
Add a Capability filter to the Systems scope

The control lists only capabilities published records carry, clears
with the other facets, and survives a reload through the URL.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

(`git add web/index.html` twice is harmless; the asset stamp lives in `web/index.html`.)

---

### Task 4: The discovery rung

**Files:**
- Modify: `scripts/update_directory.py:263-274` (after the ADR 023 science rung)
- Test: `tests/test_update_directory.py`

**Interfaces:**
- Produces: `classify(text)` returns `("agent_framework_sdk", >= 0.82)` for robotics descriptions.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_update_directory.py` after `test_science_wording_does_not_capture_ordinary_research_agents`:

```python
    def test_robot_software_reaches_the_candidate_queue_as_a_framework(self) -> None:
        """ADR 044 routes robot software to agent_framework_sdk, so discovery must see it."""
        cases = (
            "Middleware for composing AI-based robotic applications as dataflow pipelines",
            "A modular AI hardware-abstraction layer that lets LLM-driven agents control humanoid robots",
            "Vision-language-action policies for real-world manipulation",
            "Teleoperation and policy training for quadruped robots",
        )
        for description in cases:
            with self.subTest(description=description):
                role, confidence = update_directory.classify(description)
                self.assertEqual("agent_framework_sdk", role)
                self.assertGreaterEqual(confidence, 0.82)

    def test_ros_alone_is_not_a_robot_software_signal(self) -> None:
        """The openpilot lesson: a topic match is not a model in the loop, and ROS is middleware."""
        role, confidence = update_directory.classify("ROS 2 client library for Rust")
        self.assertTrue(role is None or confidence < 0.75, (role, confidence))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --with pytest python -m pytest tests/test_update_directory.py -k "robot_software or ros_alone" -v`
Expected: the first FAILS (role is `None` or another role); the second may already pass.

- [ ] **Step 3: Add the rung**

In `scripts/update_directory.py`, directly after the `return "research_agent", max(relevance, 0.82)` of the ADR 023 rung (line 274) and before the `"research agent" in lowered` rung:

```python
    if any(
        term in lowered
        for term in (
            "robot",
            "humanoid",
            "quadruped",
            "manipulation",
            "teleoperation",
            "vision-language-action",
            "actuator",
        )
    ):
        # ADR 044: robot software takes an existing role; the physical
        # boundary is a trait. "ROS" is not a signal: it is middleware.
        return "agent_framework_sdk", max(relevance, 0.82)
```

`"robot"` also matches "robotic" and "robotics", which is intended.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --with pytest python -m pytest tests/test_update_directory.py -v`
Expected: all PASS, including the ADR 023 science cases and the harness case, which the new rung must not capture (none of their descriptions contain the seven terms).

- [ ] **Step 5: Commit**

```bash
git add scripts/update_directory.py tests/test_update_directory.py
git commit -F - <<'EOF'
Route robotics vocabulary to the framework role in discovery

ADR 044's rung mirrors ADR 023's: a relevance floor so the keyword
ladder can see the systems the decision reconsiders itself against.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: ADR 044 and the documentation it routes through

**Files:**
- Create: `docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md`
- Modify: `docs/TAXONOMY.md:24` (add a paragraph after the ADR 023 paragraph)
- Modify: `docs/CURATION.md:5` (scope sentence) and `docs/CURATION.md:33` (add a scope-boundary paragraph after the discovery paragraph)
- Modify: `docs/WEB.md:18`, `docs/WEB.md:101` (add a filter bullet after it), `docs/WEB.md:45` (badge section, add a sentence)
- Modify: `docs/ROBOTS.md:3` (the intro paragraph)
- Modify: `AGENTS.md:31`
- Modify: `BACKLOG.md:72`
- Test: `tests/test_documentation.py` (existing link test)

**Interfaces:**
- Consumes: the value and definition from Task 1, the filter from Tasks 2–3, the rung from Task 4.
- Produces: the ADR file Task 12 sets to Accepted.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md` with this content:

````markdown
# ADR 044: Robot software classifies by the outcome it owns

**Status:** Proposed

## Context

Five repositories have waited in `directory/candidates.json` under `triage.held_by: "robot software role decision"` since coverage batch 39: Dora, OM1, LeRobot, openpi, and the Safari SDK. [ADR 036](036-the-agent-to-physical-world-boundary-is-in-scope.md) put the agent-to-physical-world boundary in scope, admitted nothing, and sent these five to a full `docs/CURATION.md` review with the role question "put to [ADR 011](011-delegated-work-agents-are-agent-systems.md) and [ADR 023](023-autonomous-science-systems-are-not-a-role.md) directly".

Batch 39 tested the class against ADR 023's three-part reopening test and found the second condition "plausible — `agent_system` has no role for an outcome shaped like 'operates physical robot hardware' — but as tested it is stated as a mechanism, 'a model's output driving a physical actuator,' the exact shape ADR 023 refused elsewhere". It left the domain phrasing to "a later ADR". ADR 036 kept that gap open by name, and `BACKLOG.md` carried the instruction: name an operational outcome rather than the mechanism.

Batch 39 also found that no vocabulary could state the fact: "`execution_boundaries` and `agent_capabilities` carry no perception or actuation value." ADR 023 had said the opposite of a neighbouring class, that reaching "HPC and physical instruments" is "recorded today in `agent_capabilities` and `execution_boundaries`". Both were right about their evidence: the axes exist, and neither carried a value for a robot.

The four robots batch 39 held beside these five are published in `directory/robots.json` under [ADR 037](037-robots-are-unscored-records-of-what-a-vendor-documents.md). Software that controls a robot was still undecided.

## Decision

No primary role is added for robot software. A system that controls a robot is classified by the operational outcome it owns, under the roles that exist, and reaching a robot's actuators is recorded as a trait: `robot_control` in `agent_capabilities`, "the agent's model-driven decisions are sent to a physical robot's actuators through a robot interface the system documents for that purpose."

### ADR 023's conditions are applied, and none is met

1. **Three or more full-gate systems.** Of the five candidates, review expects two to pass (LeRobot and OM1), two to wait on facts outside this repository (openpi on the models question, the Safari SDK on a programme gate), and one to fail the family test (Dora).
2. **A shared operational outcome no existing role names.** The five do not share one. LeRobot and OM1 are frameworks a developer builds an agent application with, which `agent_framework_sdk` names. openpi and the Safari SDK are tooling for named model checkpoints. Dora is middleware. What they share is where an action lands, and that is a trait.
3. **A property establishable from first-party evidence without reading source.** This one holds: every README reviewed states the property, including the Safari SDK's, the first member whose run path is closed.

ADR 011's comparison-set condition governs as well, as ADR 036 requires, and a set of two frameworks is not one.

### The outcome phrasing, settled

Batch 39's open gap was that condition 2 had only been stated as a mechanism. The outcome a future role would have to name is *completing physical tasks a person delegates, in the world rather than in software*, the robot counterpart of `general_work_agent`'s "multi-step knowledge work across files, web sources, applications, or schedules". A system meets condition 2 when its own documentation describes that outcome as what the product does for its user, rather than describing a framework, runtime, or model that a developer builds such a system from.

"A model's output driving a physical actuator" is recorded here as refused. It describes the mechanism every such system would use, and it also describes LeRobot's and OM1's, which are frameworks; it separates no outcome from the roles that exist.

### The trait is a capability, and there is one of it

`browser_control` is the precedent: controlling a browser is what an agent can do, and the browser is not where its actions are contained. A robot runtime's process runs on a host or a Jetson, and its commands travel over ROS 2 or Zenoh to the robot's own SDK, which OM1's README says it "assumes" the hardware provides. So a robot-software record still carries `host`, or whichever boundary its process runs in, and `robot_control` says what it does from there. `execution_boundaries` is untouched.

One value, not two. Recording the fact as a boundary and as a capability would need a validator rule to keep them in step, and [ADR 034](034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md) refused that shape: "a reader would have two places to look for one answer." No `perception` value is added: sensors are the mechanism rather than the outcome, no reader question needs it, and without a physical qualifier the word reads onto browser and computer-use agents, which perceive screens.

Two boundaries follow ADR 037's line on programmability. A motion API, teach pendant, or waypoint script with nothing said about a model choosing the action is not `robot_control`. A simulator is not a robot, so a run path that ends in Gazebo or Isaac Sim does not carry it.

### Making the trait reachable is a precondition

[ADR 018](018-operating-party-is-a-trait-not-a-role.md), [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md) and ADR 034 each applied [ADR 017](017-local-runtime-eligibility-ignores-modality.md)'s rule: no record whose distinguishing fact is operational is promoted before the filter that exposes that fact exists. Neither `execution_boundaries` nor `agent_capabilities` was filterable; ADR 018 noted the gap. The Systems scope gains a Capability filter, built from the capabilities published records carry, and it lands with this record, one change ahead of the first record that needs it.

No card badge. Two or three records of 133 agent systems is about 2%, and `docs/WEB.md` admits a badge that separates roughly 10–75% of its family; ADR 034 declined one at nine of 128. The agent badge set also already holds six badges, the card maximum. The value is filterable, printed in every record's "Agent operation" block, and defined in the Taxonomy view.

### Routing the five

| Candidate | Outcome | Basis |
|---|---|---|
| LeRobot | `agent_framework_sdk`, reviewed for publication | The README's own run path, `action = model.select_action(obs)` then `robot.send_action(action)`, on a hardware-agnostic `Robot` interface, with vision-language-action policies that act on a language instruction. |
| OM1 | `agent_framework_sdk`, reviewed for publication | "Design custom agents and robots by creating your own `json5` config files"; action plugins "map high-level decisions from one or more LLMs into concrete physical or digital actions". |
| openpi | held under `action-policy model boundary` | "The packages to run or fine-tune" three named checkpoint families: its software serves its own policies, the shape GR00T and OpenVLA wait in. |
| Safari SDK | held under `programme-gated run path` | Most functionality requires the Trusted Tester programme; ADR 023's words for Microsoft Discovery apply, a preview behind a programme "is not a boundary a reader can adopt". |
| Dora | reviewed for exclusion | Middleware whose README states no agent loop of its own and no reach to an actuator; the loop belongs to the nodes' authors. |

**LeRobot is not Isaac Lab, and not openpilot.** Isaac Lab was excluded because its documented outcome is training policies in simulation with no decision loop documented anywhere in its README. LeRobot's README documents the run path from a policy's decision to a physical robot, and the policies it names act on a language instruction. openpilot was excluded because its reviewed evidence shows "no language model, tool-calling, or delegated-task behavior"; LeRobot's language-conditioned policies are the delegated-task framing openpilot lacks. Batch 39 drew this line when it held LeRobot and excluded Isaac Lab in one sweep, and no batch 39 exclusion is reopened.

**OM1 is a framework, not a runtime.** `stateful_agent_runtime` means "a persistent agent runtime that owns identity, durable state, skills, schedules, and memory lifecycle", and every record in that role carries `persistent_state` and a memory lifecycle. OM1's documentation describes a robot identity and a per-tick input, LLM, action loop, and no durable state, skills, schedules, or memory lifecycle. ADR 019 says a definition is amended or the record is not admitted under it, never stretched. OM1 is not admitted under it.

### What this does not do

- **It publishes nothing.** Each verdict is taken at review, on its own evidence, in the change that records it.
- **It mints no role and adds no family.** `docs/COVERAGE.md`'s rule stands: "Do not add a new family merely to fit a famous product."
- **ADR 037 and [ADR 025](025-model-releases-are-independent-curated-records.md) are untouched.** Robots stay unscored records in their own collection, and the action-policy model question stays open in `BACKLOG.md`.
- **It does not reach autonomous vehicles, drones, or robot components**, which ADR 036 left as "a separate, unresolved question".
- **It reopens no batch 39 exclusion.** Isaac Lab, the six simulators and benchmarks, Nav2, Autoware and openpilot stand on their recorded reasons.

## Alternatives considered

**A `robot_agent` role.** Refuted above: condition 1 is not met, condition 2 names no shared outcome, and ADR 011's comparison set is two frameworks.

**Recording the fact as an execution boundary, or as both a boundary and a capability.** The boundary axis names where an agent's actions are contained; a robot is what the agent controls from wherever its process runs. Two values for one fact is ADR 034's rejected second field.

**A "Moves a robot" badge.** Below the badge floor, and the agent set is full.

**Vocabulary and first record in one change**, as `BACKLOG.md` asked. ADR 037 was "accepted when the collection plumbing landed with zero records", and the filter lists only published values, so nothing empty is advertised except the Taxonomy view's definition, which is the cost accepted here.

## Consequences

- `directory/taxonomy.json` `agent_capabilities` gains `robot_control`; `docs/TAXONOMY.md` defines it and states where robot software classifies; `docs/DATA_MODEL.md` says automation never infers it.
- The Systems scope gains a Capability filter over every published capability, recorded in `docs/WEB.md`, which also records why there is no badge.
- `scripts/update_directory.py` routes robotics vocabulary to `agent_framework_sdk` with a relevance floor, as ADR 023 did for `research_agent`. `DISCOVERY_QUERIES` is unchanged, so the rung re-routes only what existing queries find.
- `docs/CURATION.md` no longer says the robot software decision is open, and gains a scope-boundary paragraph for reading a robot-software candidate. `docs/ROBOTS.md` states that software which controls a robot is a scored system record, never a robot record. `AGENTS.md` routes robot software to the Taxonomy guide.
- The five candidates are reviewed in a following change, which records coverage batch 96 and sets this record to Accepted.
- A future proposal for a robot role arrives against a written outcome and a named, refused mechanism.
````

- [ ] **Step 2: Edit the routed documentation**

`docs/TAXONOMY.md`, after the ADR 023 paragraph at line 24, add:

```markdown
Robot software is not a further role either. A framework a developer builds a robot-controlling agent with is `agent_framework_sdk`, and any system that sends a model's decisions to a robot's actuators carries `robot_control` in `agent_capabilities`; the outcome a robot role would have to name, completing physical tasks a person delegates, is written down with the conditions that reopen the question. See [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md).
```

`docs/CURATION.md` line 5: replace the final clause `a robot never enters `directory/projects.json`, and the robot software and action-policy model decisions in `BACKLOG.md` are still open.` with:

```markdown
a robot never enters `directory/projects.json`; software that controls one is a scored system under [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md), and the action-policy model decision in `BACKLOG.md` is still open.
```

`docs/CURATION.md`, after the discovery paragraph at line 33, add:

```markdown
A system whose documented behaviour reaches a physical robot qualifies on the operational outcome it owns, not on the reach. A framework or builder whose documented outcome is an agent application that acts on a robot is `agent_framework_sdk`; the reach is `robot_control` in `agent_capabilities`, set from the system's own run-path documentation and never from a motion API alone. A simulator, a benchmark, or a training framework whose README documents no decision loop fails inclusion-gate condition 2 on the coverage batch 39 lines, and a package that exists to run or fine-tune its own named policy checkpoints waits on the action-policy model decision rather than on this scope. See [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md).
```

`docs/WEB.md` line 18: change `deployment, interface, status, and local-first` to `deployment, interface, capability, status, and local-first`.

`docs/WEB.md`, after the agent-interface filter bullet at line 101, add:

```markdown
- The capability filter is taxonomy-driven, lists only capabilities carried by published projects, and combines with every existing filter. It is how a reader reaches an operational trait such as `robot_control` without a badge. [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md)
```

`docs/WEB.md` badge section, at the end of the trait-badge paragraph (line 45), add one sentence:

```markdown
`robot_control` has no badge: it separates about 2% of agent systems, below the floor, and the agent set already holds six badges; the Capability filter and the record's Agent operation block carry it instead ([ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md)).
```

`docs/ROBOTS.md` line 3, append to the intro paragraph:

```markdown
Software that controls a robot is never a robot record: it is a scored system in `directory/projects.json` carrying `robot_control`, under [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md).
```

`AGENTS.md` line 31: change `| Families, roles, deployment, authoring surfaces, provider relationships |` to `| Families, roles, deployment, authoring surfaces, provider relationships, robot software |`.

`BACKLOG.md` line 72: replace the whole item with:

```markdown
- [ ] Review the five robot software candidates held under `robot software role decision` — Dora, OM1, LeRobot, openpi, and the Safari SDK — through the full [`docs/CURATION.md`](docs/CURATION.md) workflow under [ADR 044](docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md), which routes each and lands `robot_control` and the Capability filter one change ahead of the first record; record the verdicts as coverage batch 96 and set the ADR to Accepted in the same change.
```

- [ ] **Step 3: Lint and test the documentation**

Run: `export PATH=/usr/local/bin:$PATH && npx --yes markdownlint-cli2 "docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md" "docs/*.md" "AGENTS.md" "BACKLOG.md"` and `uv run --with pytest python -m pytest tests/test_documentation.py -v`
Expected: `0 issues`; all documentation tests PASS (the relative-link test resolves every `adr/044-...` link because the file now exists).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md docs/TAXONOMY.md docs/CURATION.md docs/WEB.md docs/ROBOTS.md AGENTS.md BACKLOG.md
git commit -F - <<'EOF'
Decide that robot software classifies by the outcome it owns (ADR 044)

No role is minted. Reaching a robot is robot_control, a capability made
reachable by the Capability filter; the outcome a future role would
have to name is written down with the conditions that reopen it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: Regenerate, verify, and open PR A

**Files:**
- Modify (generated): `web/taxonomy.json`, `web/index.html` (asset stamp), anything `sync_web_data.py` and the builders rewrite

- [ ] **Step 1: Regenerate and validate**

Run, in order:

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && uv run python scripts/build_blog.py && /usr/local/bin/node scripts/build_asset_version.mjs && uv run python scripts/validate_directory.py
```

Expected: no errors. `git status --short` shows only generated files changed.

- [ ] **Step 2: Run the whole suite once**

Run: `uv run --with pytest python -m pytest -q 2>&1 | tail -3`, `/usr/local/bin/node --test tests/test_web.js 2>&1 | /usr/bin/grep -E "^# (pass|fail)"`, and `/usr/local/bin/node node_modules/.bin/playwright test 2>&1 | tail -4`
Expected: pytest all passed; `# fail 0`; Playwright `N passed`. If any e2e test fails only after a 30-second timeout with later tests reporting `ERR_CONNECTION_REFUSED`, the local test server dropped: rerun once before reading the diff.

- [ ] **Step 3: Commit the generated files**

```bash
git add -A web/
git commit -F - <<'EOF'
Regenerate the web payload for the robot_control capability

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Merge main, check the ADR number, push, open the PR**

```bash
git fetch origin main && git merge --no-edit origin/main
git ls-tree --name-only origin/main docs/adr/ | /usr/bin/grep -c "^docs/adr/044-"
```

Expected: the merge is clean or conflicts only in `web/index.html`'s asset stamp (resolve with `git checkout --theirs web/index.html`, rerun `build_asset_version.mjs`, confirm with `git diff origin/main -- web/index.html | /usr/bin/grep -c "^[-+]" ` that only stamp lines differ). The grep count is `0`; if it is `1`, rename the ADR file to the next free number and update every reference with `/usr/bin/grep -rl "044-robot-software" docs AGENTS.md BACKLOG.md` before continuing.

Push and open:

```bash
git push -u origin claude/robot-software-role
gh pr create --title "Decide that robot software classifies by the outcome it owns (ADR 044)" --body-file - <<'EOF'
ADR 044, Proposed: no role for robot software; reaching a robot is `robot_control` in `agent_capabilities`, made reachable by a new Capability filter on the Systems scope. No badge. A discovery rung routes robotics vocabulary to `agent_framework_sdk` with a relevance floor. Documentation routed through TAXONOMY, CURATION, DATA_MODEL, WEB, ROBOTS, AGENTS and BACKLOG.

The five held candidates are reviewed in the following PR, which records coverage batch 96 and sets the ADR to Accepted.

Spec: `docs/superpowers/specs/2026-09-27-robot-software-role-design.md`. Plan: `docs/superpowers/plans/2026-09-28-robot-software-role.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Then tell the Landing, badge, and nav-bar sessions the final ADR number and that no badge was added. Do not enable auto-merge unless the owner asks.

---

## PR B: review and records

PR B starts on a fresh branch `claude/robot-software-records` created from `origin/main` after PR A has merged. If PR A has not merged yet, branch from `claude/robot-software-role` and rebase later.

### Task 7: Re-fetch every fact the verdicts rest on

**Files:**
- Create: `scratchpad/robot-software/refetch-2026-09-28.md` (in the session scratchpad, not the repository)

**Interfaces:**
- Produces: for LeRobot, OM1 and Dora, the current README and LICENSE blob shas and sha256 hashes; the release facts; the quotes below confirmed or refuted. Tasks 8–11 cite this file.

- [ ] **Step 1: Fetch blob shas and hashes**

For each `owner/repo` in `huggingface/lerobot`, `OpenMind/OM1`, `dora-rs/dora`, and each `path` in `README.md`, `LICENSE`:

```bash
gh api "repos/OWNER/REPO/contents/PATH" --jq '.sha'
gh api "repos/OWNER/REPO/contents/PATH" --jq '.content' | base64 -d | shasum -a 256
```

Record both per file. Compare with the candidate pins in `directory/candidates.json` (LeRobot README `50814df9...`, LICENSE `a603343c...`; OM1 README `50deb2fe...`, LICENSE `a0fbf413...`; Dora README `9700c27c...`, LICENSE `fe9751aa...`). A changed README blob means the quotes in Step 2 are re-read from the new text; a changed LICENSE blob means the licence is re-read before Task 8 or 9 records it.

Also fetch LeRobot's third-party notice files if the README or repository root lists any (`gh api repos/huggingface/lerobot/contents --jq '.[].name'`; look for `NOTICE`, `LICENSE-*`, `THIRD_PARTY*`) and hash each one; the MIT notices the dossier reported must be tied to a path.

- [ ] **Step 2: Confirm the decisive quotes**

Fetch each raw README (`curl -sL https://raw.githubusercontent.com/OWNER/REPO/main/README.md`) and `/usr/bin/grep -n` for:

- LeRobot: `select_action` and `send_action` on adjacent lines; the words `vision-language-action` or `VLA`; a `pip install lerobot` line.
- OM1: `Design custom agents and robots`; `assumes that robot hardware provides a high-level SDK`; `Download the latest release`. Then `curl -sL https://raw.githubusercontent.com/OpenMind/OM1/main/docs/developing/6_actions.md | /usr/bin/grep -n "map high-level decisions"`.
- Dora: count of `actuator|hardware|physical` matches (expected 0); the phrase `dataflow`; a ROS2 bridge mention.

- [ ] **Step 3: Confirm the release facts**

```bash
gh api repos/huggingface/lerobot/releases/latest --jq '.tag_name + " " + .published_at'
gh api repos/OpenMind/OM1/releases/latest --jq '.tag_name + " " + .published_at + " assets:" + (.assets|length|tostring)'
gh api "repos/OpenMind/OM1/releases?per_page=5" --jq '.[] | .tag_name + " " + .published_at + " prerelease:" + (.prerelease|tostring) + " assets:" + (.assets|length|tostring)'
gh api "repos/OpenMind/OM1/actions/runs?branch=main&per_page=5" --jq '.workflow_runs[] | .name + " " + .conclusion + " " + .updated_at'
gh api repos/Physical-Intelligence/openpi/tags --jq 'length'
gh api "repos/Physical-Intelligence/openpi/commits?per_page=1" --jq '.[0].commit.committer.date'
gh api repos/octo-models/octo/releases/latest --jq '.tag_name + " " + .published_at'
gh api repos/haosulab/ManiSkill --jq '.full_name'
gh api repos/mani-skill/ManiSkill --jq '.full_name'
```

Record every line. The two ManiSkill calls establish whether `mani-skill/ManiSkill` redirects to `haosulab/ManiSkill` (GitHub follows renames, so both return the current name) for Task 11.

- [ ] **Step 4: Write the file**

`scratchpad/robot-software/refetch-2026-09-28.md` lists every command, its output, and one line per candidate saying whether the dossier facts held. Nothing is committed in this task.

---

### Task 8: Publish LeRobot

**Files:**
- Modify: `directory/projects.json`, `directory/license-evidence.json`, `directory/candidates.json` (through `scripts/promote_system_candidate.py apply`)
- Create (scratch): `scratchpad/robot-software/lerobot-review.json`
- Test: `tests/test_directory.py` (existing validators), `uv run python scripts/validate_directory.py`

**Interfaces:**
- Consumes: Task 7's blob shas and confirmed quotes; `robot_control` from Task 1.
- Produces: the `lerobot` record Task 12's batch test asserts on.

- [ ] **Step 1: Scaffold the review draft**

```bash
uv run python scripts/promote_system_candidate.py init huggingface/lerobot --output scratchpad/robot-software/lerobot-review.json
```

Open the draft. It prefills identity and GitHub facts and one `license-evidence.json` item from the candidate's pinned LICENSE blob. Every editorial field is empty or absent.

- [ ] **Step 2: Complete the draft**

Fill the record fields with these values, each traceable to Task 7's fetch or the dossier's quotes. The controller reviews every editorial value before `apply`; scores are the controller's call and the numbers below are the proposal to review, with the reasoning stated so it can be disagreed with.

```json
{
  "id": "lerobot",
  "system_family": "agent_system",
  "score_profile": "agent",
  "name": "LeRobot",
  "repo": "huggingface/lerobot",
  "url": "https://github.com/huggingface/lerobot",
  "description": "A PyTorch framework for building robot-controlling agents: policies that take camera observations and a language instruction, and a Robot interface that sends each chosen action to physical hardware.",
  "primary_role": "agent_framework_sdk",
  "secondary_roles": [],
  "agent_relation": "agent_runtime",
  "architectures": ["plain_files"],
  "retrieval_modes": ["agentic"],
  "capture_modes": ["file_import"],
  "memory_lifecycle": ["versioned"],
  "canonical_data": "policy checkpoints and recorded episode datasets as files",
  "deployment": ["library", "local_cli"],
  "agent_interfaces": ["library", "api_sdk"],
  "execution_boundaries": ["host"],
  "agent_capabilities": ["robot_control"],
  "local_first": true,
  "human_editable": false,
  "provenance": "strong",
  "status": "active",
  "current_repo_note": null,
  "score": {
    "task_reliability": 7.4,
    "tool_use": 6.8,
    "autonomy": 7.6,
    "human_control": 7.0,
    "observability_recovery": 6.5,
    "data_sovereignty": 8.8,
    "interoperability": 8.4,
    "maturity": 8.0,
    "overall": 7.6
  },
  "strengths": [
    "Documented control loop from a policy's decision to a physical robot, across supported arms and humanoids",
    "Vision-language-action policies take a language instruction and act",
    "Everything runs on the operator's own machine with open weights and datasets"
  ],
  "weaknesses": [
    "Recovery and monitoring are left to the application; the framework ships no supervisor",
    "Training and dataset tooling dominate the documentation, so the control path is one section among many",
    "Vendored components carry MIT notices beside the Apache-2.0 licence, each recorded at its own path"
  ],
  "why_it_matters": "The clearest open example of a framework whose agent loop ends at a robot rather than at a software tool.",
  "research_confidence": "high",
  "verified_at": "2026-09-28",
  "licenses": ["Apache-2.0", "MIT"],
  "source_model": "open_source",
  "license_review_status": "verified"
}
```

Score reasoning to review: task reliability and autonomy sit in the mid sevens because the README documents a working loop but no reliability evidence beyond it; tool use is lower because the framework's "tools" are robot interfaces, not a general tool protocol; human control is a seven because a human stops the robot but the framework documents no approval step; observability is the weakest documented area; data sovereignty and interoperability are high because everything runs locally over open formats; maturity reflects v0.6.1 with regular releases but a pre-1.0 API. If the controller changes a number, `overall` is the mean of the eight rounded to one decimal.

`licenses` lists MIT only if Task 7 tied a MIT notice to a path; if it did not, drop MIT, remove the third weakness, and record `["Apache-2.0"]`. `license-evidence.json` gets one item per licence with `scope` naming the path (`repository` for the root LICENSE, the vendored directory for a MIT notice), `kind: "git_blob"`, the current `blob_sha` and `immutable_url` from Task 7.

- [ ] **Step 3: Check, then apply**

```bash
uv run python scripts/promote_system_candidate.py check scratchpad/robot-software/lerobot-review.json
```

Expected: the preflight reports no errors. Fix any it reports (a missing field, an unknown taxonomy value), then:

```bash
uv run python scripts/promote_system_candidate.py apply scratchpad/robot-software/lerobot-review.json
```

Expected: `projects.json` gains `lerobot`, `license-evidence.json` gains its items, `candidates.json` loses `huggingface/lerobot`.

- [ ] **Step 4: Validate and test**

Run: `uv run python scripts/validate_directory.py && uv run --with pytest python -m pytest tests/test_directory.py -q 2>&1 | tail -2`
Expected: no validator errors; tests pass.

- [ ] **Step 5: Commit**

```bash
git add directory/projects.json directory/license-evidence.json directory/candidates.json
git commit -F - <<'EOF'
Publish LeRobot as a robot-controlling agent framework

Reviewed under ADR 044 on its documented control run path; carries
robot_control.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: Publish OM1

**Files:**
- Modify: `directory/projects.json`, `directory/license-evidence.json`, `directory/candidates.json` (through the promotion script)
- Create (scratch): `scratchpad/robot-software/om1-review.json`

**Interfaces:**
- Consumes: Task 7's OM1 facts; `robot_control`.
- Produces: the `om1` record Task 12 asserts on.

- [ ] **Step 1: Decide the run-path question from Task 7's output**

The gate: the README's documented install path yields a current build. Task 7 recorded whether the `nightly` pre-release still carries the eight Go binaries and whether the "OM1 Binary Release" workflow succeeded on `main` within the last 30 days. If both hold, proceed to Step 2. If either fails, skip to Step 5 of this task and hold instead.

- [ ] **Step 2: Scaffold and complete the draft**

```bash
uv run python scripts/promote_system_candidate.py init OpenMind/OM1 --output scratchpad/robot-software/om1-review.json
```

Fill:

```json
{
  "id": "om1",
  "system_family": "agent_system",
  "score_profile": "agent",
  "name": "OM1",
  "repo": "OpenMind/OM1",
  "url": "https://github.com/OpenMind/OM1",
  "description": "A configurable runtime for building robot-controlling agents: camera, microphone and LIDAR inputs are fused into text, an LLM chooses named actions, and action plugins carry them out on humanoid and quadruped robots or in simulators.",
  "primary_role": "agent_framework_sdk",
  "secondary_roles": [],
  "agent_relation": "agent_runtime",
  "architectures": ["plain_files"],
  "retrieval_modes": ["agentic"],
  "capture_modes": ["audio", "conversation"],
  "memory_lifecycle": ["human_curated"],
  "canonical_data": "json5 agent configurations and system prompts",
  "deployment": ["local_cli", "cloud_optional"],
  "agent_interfaces": ["terminal", "api_sdk"],
  "execution_boundaries": ["host"],
  "agent_capabilities": ["robot_control"],
  "local_first": false,
  "human_editable": true,
  "provenance": "moderate",
  "status": "active",
  "current_repo_note": "The Go runtime on main ships only as the rolling nightly pre-release; the latest tagged release, v1.0.2-beta.2 of 2026-04-29, is the deprecated Python runtime with no binaries.",
  "score": {
    "task_reliability": 6.4,
    "tool_use": 7.2,
    "autonomy": 7.8,
    "human_control": 6.0,
    "observability_recovery": 6.2,
    "data_sovereignty": 5.5,
    "interoperability": 7.6,
    "maturity": 5.8,
    "overall": 6.6
  },
  "strengths": [
    "An LLM chooses named actions each tick and connectors carry them out on Unitree, Deep Robotics and LimX robots",
    "Inputs, models and actions are composed in a config file, so a new agent needs no code",
    "Ollama is documented as a local substitute for the language model"
  ],
  "weaknesses": [
    "The default model path runs through OpenMind's hosted endpoint and needs an account key; only the LLM has a documented local substitute",
    "The maintained runtime has no tagged release; the README's release link points at a deprecated beta",
    "The docs describe a robot-identity network and an experimental blockchain governance page the README does not mention",
    "Low-level control and collision avoidance are delegated to the robot's own SDK"
  ],
  "why_it_matters": "The first published example of an LLM agent loop whose actions are a robot's motion rather than a file or a browser.",
  "research_confidence": "medium",
  "verified_at": "2026-09-28",
  "licenses": ["MIT"],
  "source_model": "open_source",
  "license_review_status": "verified"
}
```

Score reasoning to review: autonomy is the strongest dimension because the loop is documented end to end; human control and observability are low because the docs describe no approval step and only terminal state output; data sovereignty is low because the default path is a hosted endpoint with an account; maturity is low because the maintained build is untagged. `overall` is the mean of the eight to one decimal.

`license-evidence.json` gets one MIT item at `repository` scope with the current LICENSE blob from Task 7.

- [ ] **Step 3: Check, apply, validate**

```bash
uv run python scripts/promote_system_candidate.py check scratchpad/robot-software/om1-review.json
uv run python scripts/promote_system_candidate.py apply scratchpad/robot-software/om1-review.json
uv run python scripts/validate_directory.py && uv run --with pytest python -m pytest tests/test_directory.py -q 2>&1 | tail -2
```

Expected: no errors; `candidates.json` loses `OpenMind/OM1`.

- [ ] **Step 4: Commit**

```bash
git add directory/projects.json directory/license-evidence.json directory/candidates.json
git commit -F - <<'EOF'
Publish OM1 as a robot-controlling agent framework

Reviewed under ADR 044; a configured LLM loop whose actions move a
robot, with the untagged runtime and hosted default path in weaknesses.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: The hold branch, only if Step 1 failed**

Edit the OM1 candidate in `directory/candidates.json`: set `triage.held_by` to `"tagged release of the Go runtime"`, append to `triage.finding` one sentence stating what Task 7 found (the missing nightly assets or the failed workflow, with the date), and leave everything else. Validate, commit with the message `Hold OM1 until the Go runtime has a tagged release`, and report to the controller, who adjusts Task 12's batch test and coverage text.

---

### Task 10: Hold openpi and the Safari SDK, queue Octo

**Files:**
- Modify: `directory/candidates.json` (two `triage` blocks, one new entry)
- Modify: `BACKLOG.md:76` (the action-policy item)

**Interfaces:**
- Produces: `held_by` values Task 12's batch test asserts on.

- [ ] **Step 1: Relabel openpi**

In the `Physical-Intelligence/openpi` candidate, set `triage.held_by` to `"action-policy model boundary"` and append to `triage.finding`:

```text
 Re-read on 2026-09-28 under ADR 044: the repository has no tags, its PyPI name is a placeholder, its last commit is dated 2026-08-24, and its LICENSE_GEMMA.txt is Google's Gemma Terms of Use whose scope (the checkpoints, the code, or both) is unresolved. Its software exists to run or fine-tune its own three checkpoint families, so the systems question waits on the action-policy model decision, as Isaac GR00T's and OpenVLA's do.
```

Replace the last-commit date with Task 7's value if it differs.

- [ ] **Step 2: Relabel the Safari SDK**

In the `google-deepmind/gemini-robotics-sdk` candidate, set `triage.held_by` to `"programme-gated run path"` and append to `triage.finding`:

```text
 Re-read on 2026-09-28 under ADR 044: the README still says most functionality requires joining the Trusted Tester programme, so the run path a reader can adopt is gated; the hold lifts at general availability, on the reasoning ADR 023 recorded for Microsoft Discovery.
```

- [ ] **Step 3: Queue Octo**

Append a candidate entry, shaped like the openpi one, for `octo-models/octo`:

```json
{
  "repo": "octo-models/octo",
  "name": "Octo",
  "url": "https://github.com/octo-models/octo",
  "description": "Octo is a generalist robot policy trained on Open X-Embodiment data, with code to fine-tune it and to run it on a real WidowX robot.",
  "proposed_system_family": null,
  "proposed_primary_role": null,
  "classification_confidence": 0.2,
  "github_detected_license": "MIT",
  "stars": 0,
  "topics": [],
  "status": "provisional",
  "discovered_at": "2026-09-28",
  "triage": {
    "verdict": "held",
    "held_by": "action-policy model boundary",
    "rule": "docs/CURATION.md inclusion gate; ADR 044 routing",
    "finding": "Screened in the ADR 044 comparison-set review. The README's own evaluation section runs the pretrained policy on a real WidowX robot, so the physical reach is stated directly; but the repository is a policy model release with inference and fine-tuning code, the shape batch 39 held Isaac GR00T and OpenVLA in, so it waits on the action-policy model decision rather than on the systems scope. Latest release v1.5 of 2024-05-24.",
    "evidence": [],
    "proposed_at": "2026-09-28",
    "proposer": "ADR 044 comparison-set screen"
  },
  "review_required": ["licensing", "classification", "traits", "editorial_score"]
}
```

Set `stars` from `gh api repos/octo-models/octo --jq '.stargazers_count'`. Fill `evidence` with README and LICENSE `git_blob` items in the same shape as the openpi candidate's, using `gh api repos/octo-models/octo/contents/README.md --jq '.sha'` for `blob_sha`, the sha256 of the decoded content for `content_sha256`, `fetched_at` `2026-09-28`, and `immutable_url` `https://api.github.com/repos/octo-models/octo/git/blobs/<sha>`.

- [ ] **Step 4: Update the backlog item**

`BACKLOG.md` line 76: change `Isaac GR00T, OpenVLA, and Alpamayo wait under` to `Isaac GR00T, OpenVLA, Alpamayo, openpi, and Octo wait under`.

- [ ] **Step 5: Validate and commit**

Run: `uv run python scripts/validate_directory.py && uv run --with pytest python -m pytest tests/test_candidate_evidence.py tests/test_directory.py -q 2>&1 | tail -2`
Expected: no errors.

```bash
git add directory/candidates.json BACKLOG.md
git commit -F - <<'EOF'
Hold openpi and the Safari SDK under the decisions they wait on

openpi and the newly screened Octo join the action-policy model hold;
the Safari SDK waits on its Trusted Tester programme.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 11: Exclude Dora and the screened neighbours

**Files:**
- Modify: `directory/exclusions.json` (seven new entries, one corrected)
- Modify: `directory/candidates.json` (remove `dora-rs/dora`)

**Interfaces:**
- Produces: exclusion entries Task 12's batch test asserts on.

- [ ] **Step 1: Add the Dora exclusion and remove its candidate**

Append to `exclusions.json`, in the shape of the `dario` entry (`name`, `repo`, `reason`, `useful_lesson`, `excluded_at`, `verified_at`):

```json
{
  "name": "Dora",
  "repo": "dora-rs/dora",
  "reason": "Dora's README describes \"middleware for composing AI-based robotic applications as low-latency, distributed dataflow pipelines\": a node hub of cameras, YOLO, LLM and TTS nodes, a ROS2 bridge, and a CLI and Python API with tagged releases. The README states no agent loop of its own and never uses the words actuator, hardware, or physical; the wiring from a model's output to an arm driver exists only in the separate dora-hub repository's examples. Reviewed under ADR 044, this fails inclusion-gate condition 2 on the line dario and TreeQuest set: the loop belongs to the authors of the nodes, and Dora owns transport and scheduling between them. It differs from LangGraph, whose documented outcome is the agent's own control flow with state, checkpoints and human control, and from sandbase-harness, which owns its sessions, events and credential vault. The PyPI wheel declares MIT while the repository LICENSE and NOTICE say Apache-2.0; the discrepancy is recorded and does not bear on the decision.",
  "useful_lesson": "Middleware that carries a model node's output is not the agent whose output it carries; ask whose loop the graph is, and read the README rather than the example repository for what the system claims of itself.",
  "excluded_at": "2026-09-28",
  "verified_at": "2026-09-28"
}
```

Remove the `dora-rs/dora` entry from `candidates.json`.

- [ ] **Step 2: Add the six screened exclusions**

Append, each with `excluded_at` and `verified_at` `2026-09-28`:

- `Genesis-Embodied-AI/Genesis`, name "Genesis": reason "Genesis's README calls it \"a simulation platform for physical AI developments\", a physics engine, renderer and compiler, and no sentence states that a model's output is sent to physical hardware. Inclusion-gate condition 2 fails on the line coverage batch 39 drew for MuJoCo, Isaac Lab and robosuite: a physics substrate other software trains or evaluates a model against, never a model operating its own loop." Lesson: "A simulator is where a policy is trained, not where an agent acts; it stays out however central it is to the ecosystem."
- `ARISE-Initiative/robomimic`, name "robomimic": reason "robomimic's rendered README frames it as offline imitation-learning and reinforcement-learning algorithms over demonstration datasets, used to reproduce benchmarks; its only real-robot wording sits inside an HTML comment that does not render. Inclusion-gate condition 2 fails on the Isaac Lab line: a training framework whose documented purpose is research workflows, not an agent that plans or acts." Lesson: "Read the rendered README; a claim inside an HTML comment is not a claim the maintainers make."
- `ros2/ros2`, name "ROS 2": reason "The ROS 2 meta-repository describes \"a set of software libraries and tools that help you build robot applications\" and documents no learned model, policy, or decision loop of any kind. Inclusion-gate condition 2 fails on the Nav2 line: robot middleware with no model in any documented loop. The repository root carries no LICENSE file; the packages it lists carry their own." Lesson: "A robot operating system is the substrate an agent's connectors speak to, not an agent."
- `moveit/moveit2`, name "MoveIt 2": reason "MoveIt 2 describes itself as \"the MoveIt Motion Planning Framework for ROS 2\" and documents classical motion planning with no learned model or policy. Inclusion-gate condition 2 fails on the Nav2 line." Lesson: "Motion planning that a caller parameterises is programmability, not an AI basis; ADR 037 draws the same line for robots."
- `NVIDIA-ISAAC-ROS/isaac_ros_common`, name "Isaac ROS Common": reason "The repository holds \"essential packages for building, testing, and using Isaac ROS\": build and DevOps tooling for a ROS 2 package family under a custom NVIDIA EULA, with no learned model or decision loop documented in its README. Inclusion-gate condition 2 fails on the Nav2 line." Lesson: "Build tooling for a package family is infrastructure below the agent, whatever the family later runs."
- `google-deepmind/open_x_embodiment`, name "Open X-Embodiment": reason "Open X-Embodiment is primarily a dataset repository, with an RT-1-X checkpoint and an inference notebook as secondary content; no sentence states an action is executed on physical hardware. It is a research input under docs/CURATION.md, not an operational system, and the checkpoint question belongs with the action-policy model decision." Lesson: "A dataset with a reference checkpoint is a research input; it enters no scored collection."

Copy each reason and lesson verbatim into the JSON, escaping the inner double quotes as `\"` as the Dora entry shows.

- [ ] **Step 3: Correct the ManiSkill entry**

If Task 7 showed `mani-skill/ManiSkill` now resolves to `haosulab/ManiSkill`, change the existing entry's `repo` to `haosulab/ManiSkill` and its `verified_at` to `2026-09-28`, leaving `reason`, `useful_lesson` and `excluded_at` unchanged. If GitHub still reports `mani-skill/ManiSkill` as canonical, leave the entry alone and say so in the report.

- [ ] **Step 4: Validate and commit**

Run: `uv run python scripts/validate_directory.py && uv run --with pytest python -m pytest tests/test_directory.py -q 2>&1 | tail -2`
Expected: no errors; the exclusion count rises by seven (`python3 -c "import json;print(len(json.load(open('directory/exclusions.json'))['exclusions']))"` before and after).

```bash
git add directory/exclusions.json directory/candidates.json
git commit -F - <<'EOF'
Exclude Dora and six screened robotics neighbours

Dora owns transport between nodes whose loop belongs to their authors;
the six fail condition 2 on the batch 39 lines for simulators, training
frameworks, middleware and datasets.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 12: Coverage batch 96, the batch test, and ADR 044 Accepted

**Files:**
- Modify: `docs/COVERAGE.md:21`, `docs/COVERAGE.md:276` (append entry 96 after entry 95)
- Modify: `docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md:3`
- Modify: `BACKLOG.md:72` (remove the item)
- Test: `tests/test_directory.py`

**Interfaces:**
- Consumes: the records from Tasks 8–9, the holds from Task 10, the exclusions from Task 11.

- [ ] **Step 1: Write the failing batch test**

Add to `tests/test_directory.py` after `test_alpha_lineage_batch_has_evidence_backed_dispositions`:

```python
    def test_robot_software_batch_has_evidence_backed_dispositions(self) -> None:
        """Coverage batch 96: the five ADR 044 candidates and the screened neighbours."""
        candidates = json.loads(
            (ROOT / "directory" / "candidates.json").read_text(encoding="utf-8")
        )
        exclusions = json.loads(
            (ROOT / "directory" / "exclusions.json").read_text(encoding="utf-8")
        )
        projects = {project["id"]: project for project in self.document["projects"]}
        queued = {item["repo"]: item for item in candidates["candidates"]}
        excluded = {item["repo"] for item in exclusions["exclusions"]}

        for project_id in ("lerobot", "om1"):
            self.assertEqual("agent_framework_sdk", projects[project_id]["primary_role"])
            self.assertIn("robot_control", projects[project_id]["agent_capabilities"])
            self.assertIn("host", projects[project_id]["execution_boundaries"])
        self.assertNotIn("huggingface/lerobot", queued)
        self.assertNotIn("OpenMind/OM1", queued)

        self.assertEqual(
            "action-policy model boundary",
            queued["Physical-Intelligence/openpi"]["triage"]["held_by"],
        )
        self.assertEqual(
            "action-policy model boundary", queued["octo-models/octo"]["triage"]["held_by"]
        )
        self.assertEqual(
            "programme-gated run path",
            queued["google-deepmind/gemini-robotics-sdk"]["triage"]["held_by"],
        )
        self.assertFalse(
            [
                item["repo"]
                for item in candidates["candidates"]
                if item.get("triage", {}).get("held_by") == "robot software role decision"
            ]
        )

        for repo in (
            "dora-rs/dora",
            "Genesis-Embodied-AI/Genesis",
            "ARISE-Initiative/robomimic",
            "ros2/ros2",
            "moveit/moveit2",
            "NVIDIA-ISAAC-ROS/isaac_ros_common",
            "google-deepmind/open_x_embodiment",
        ):
            self.assertIn(repo, excluded, repo)
        self.assertNotIn("dora-rs/dora", queued)
```

If Task 9 ended in the hold branch, replace the `om1` assertions with `self.assertEqual("tagged release of the Go runtime", queued["OpenMind/OM1"]["triage"]["held_by"])`.

- [ ] **Step 2: Run the test to verify it passes against Tasks 8–11**

Run: `uv run --with pytest python -m pytest tests/test_directory.py -k robot_software_batch -v`
Expected: PASS. If it fails, a prior task left a disposition unrecorded; fix the data, not the test.

- [ ] **Step 3: Write coverage entry 96 and update the snapshot**

Compute the counts:

```bash
python3 -c "import json;d=json.load(open('directory/projects.json'))['projects'];print(len(d),sum(p['system_family']=='agent_system' for p in d))"
python3 -c "import json;print(len(json.load(open('directory/candidates.json'))['candidates']))"
python3 -c "import json;print(len(json.load(open('directory/exclusions.json'))['exclusions']))"
git show origin/main:directory/candidates.json | python3 -c "import json,sys;print(len(json.load(sys.stdin)['candidates']))"
git show origin/main:directory/exclusions.json | python3 -c "import json,sys;print(len(json.load(sys.stdin)['exclusions']))"
```

Update `docs/COVERAGE.md` line 21 so the system total and the agent-system count match the first command's output (spell the numbers the way the line already does).

Append after entry 95 (line 276), as one paragraph in the batch format, substituting the counts:

```markdown
96. **Robot software, decided and reviewed:** two publishes, three holds, seven exclusions, and the `robot software role decision` label retired, under [ADR 044](adr/044-robot-software-classifies-by-the-outcome-it-owns.md), which mints no role and records reaching a robot as `robot_control` in `agent_capabilities`, reachable through the new Capability filter. `huggingface/lerobot` and `OpenMind/OM1` are published as `agent_framework_sdk` on their documented run paths: LeRobot's README sends a policy's chosen action to a physical robot through its `Robot` interface, and OM1's action plugins "map high-level decisions from one or more LLMs into concrete physical or digital actions". OM1 is a framework, not a runtime: it documents no durable state, skills, schedules, or memory lifecycle, which the runtime definition requires, and ADR 019 forbids stretching a definition. `Physical-Intelligence/openpi` moves to `action-policy model boundary`, because its software exists to run or fine-tune its own checkpoints, and the newly screened `octo-models/octo` joins it; `google-deepmind/gemini-robotics-sdk` waits under `programme-gated run path` for general availability. `dora-rs/dora` is excluded on the dario and TreeQuest line: middleware whose README states no agent loop of its own, distinguished in the entry from LangGraph and sandbase-harness. Twelve neighbours were screened for the comparison set ADR 011 requires; nine were already decided in batch 39 or held under the action-policy boundary, and six new exclusions record Genesis and robomimic on the simulator and training-framework lines, ROS 2, MoveIt 2 and Isaac ROS Common on the Nav2 line, and Open X-Embodiment as a dataset. The ADR 023 tripwire count after this batch is two full-gate systems, so the decision does not reopen by its own result. Every README, LICENSE and release fact was re-fetched on 2026-09-28 and every blob hash recomputed before a record cited it. The candidate queue moved from CANDIDATES_BEFORE to CANDIDATES_AFTER records and the exclusions from EXCLUSIONS_BEFORE to EXCLUSIONS_AFTER.
```

Replace the four capitalised tokens with the computed numbers. If Task 9 held OM1, change "two publishes, three holds" to "one publish, four holds" and rewrite the OM1 sentence to say it waits under `tagged release of the Go runtime` and why.

- [ ] **Step 4: Accept the ADR and remove the backlog item**

In the ADR file, change line 3 to `**Status:** Accepted`. In `BACKLOG.md`, delete the robot-software review item (the one beginning `- [ ] Review the five robot software candidates`).

- [ ] **Step 5: Lint, test, commit**

Run: `export PATH=/usr/local/bin:$PATH && npx --yes markdownlint-cli2 "docs/COVERAGE.md" "docs/adr/044-*.md" "BACKLOG.md" && uv run --with pytest python -m pytest tests/test_directory.py tests/test_documentation.py -q 2>&1 | tail -2`
Expected: `0 issues`; tests pass.

```bash
git add docs/COVERAGE.md docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md BACKLOG.md tests/test_directory.py
git commit -F - <<'EOF'
Record coverage batch 96 and accept ADR 044

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 13: Regenerate, verify, and open PR B

- [ ] **Step 1: Regenerate and validate**

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && uv run python scripts/build_blog.py && /usr/local/bin/node scripts/build_asset_version.mjs && uv run python scripts/validate_directory.py
```

Expected: no errors; `web/records/systems/lerobot/` and `web/records/systems/om1/` exist; `web/sitemap.xml` lists both.

- [ ] **Step 2: Check the badge guard and the whole suite**

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`, `uv run --with pytest python -m pytest -q 2>&1 | tail -3`, `/usr/local/bin/node node_modules/.bin/playwright test 2>&1 | tail -4`
Expected: `# fail 0` (no badge was added, so the trait-badge guard is unaffected); pytest passes; Playwright passes. Then open `http://127.0.0.1:PORT/?collection=systems&capability=robot_control` against the local server (`uv run python scripts/serve_web.py` prints the port) and confirm exactly the published robot-software records list.

- [ ] **Step 3: Commit the generated files**

```bash
git add -A web/
git commit -F - <<'EOF'
Regenerate the web payload and share pages for batch 96

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Merge main, push, open the PR**

```bash
git fetch origin main && git merge --no-edit origin/main
```

Resolve `web/index.html` by `git checkout --theirs web/index.html` and rerunning `build_asset_version.mjs`; resolve `web/sitemap.xml` by rerunning `build_share_pages.py`; resolve any conflict in `directory/candidates.json`, `directory/exclusions.json`, `docs/COVERAGE.md` or `BACKLOG.md` by hunk with `git checkout -m -- FILE` and editing, never whole-file. Before committing the merge, check `git diff --cached origin/main --stat` lists only files this PR meant to change, that `/usr/bin/grep -c "huggingface/lerobot\|OpenMind/OM1\|dora-rs/dora" directory/candidates.json` prints `0`, and that no `<<<<<<<` marker remains. Confirm `git ls-tree --name-only origin/main docs/adr/ | /usr/bin/grep "^docs/adr/044-"` names this ADR.

```bash
git push -u origin claude/robot-software-records
gh pr create --title "Review the robot software candidates under ADR 044 (coverage batch 96)" --body-file - <<'EOF'
LeRobot and OM1 published as `agent_framework_sdk` records carrying `robot_control`; openpi and the newly screened Octo held under `action-policy model boundary`; the Safari SDK held under `programme-gated run path`; Dora and six screened neighbours excluded; ManiSkill's entry repointed at its renamed repository; coverage batch 96 recorded; ADR 044 set to Accepted; the backlog item closed.

Every README, LICENSE and release fact was re-fetched on 2026-09-28 and every blob hash recomputed before a record cited it.

Spec: `docs/superpowers/specs/2026-09-27-robot-software-role-design.md`. Plan: `docs/superpowers/plans/2026-09-28-robot-software-role.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Do not enable auto-merge unless the owner asks. After the merge, verify the deploy by the merge SHA and curl `/records/systems/lerobot/` and `/records/systems/om1/` on the live site.
