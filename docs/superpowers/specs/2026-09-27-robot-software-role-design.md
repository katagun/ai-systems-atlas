# Design: Robot software classifies by the outcome it owns

**Date:** 2026-09-27 (revised 2026-09-28 after the repository skeptic's review)
**Status:** Proposed, awaiting owner review

## Changes since the design approved in chat

The owner approved six design sections in chat on 2026-09-27. A repository-only skeptic then read the proposal against `main` at 85e544ba and found five points where the approved text contradicts recorded decisions, each quoted with path and line. This spec changes the approved design in these places. Everything else stands.

| Approved | Now | Why |
|---|---|---|
| LeRobot is a framework "for training, fine-tuning, and serving robot policies" | LeRobot is classified on its documented control run path, the one batch 39 held it for | The approved reason is the reason Isaac Lab was excluded (`directory/exclusions.json`, Isaac Lab entry), and ADR 036 says no batch 39 exclusion is reopened |
| Tripwire: three full-gate systems that "decide and act on a physical robot" | ADR 023's three conditions apply verbatim; condition 2 is given its domain phrasing as an outcome | Batch 39, ADR 036 and `BACKLOG.md` all say the next ADR must name an outcome, not the actuator mechanism |
| Three trait values: `physical_actuator` (boundary), `actuation` and `perception` (capabilities), with a validator rule tying them | One value: `robot_control` in `agent_capabilities` | ADR 034 rejected recording one fact in two places; `perception` has no reader who needs it and would read onto screen-perceiving agents |
| A "Moves a robot" card badge | No badge | About 2% of the agent family; `docs/WEB.md` sets a 10–75% floor and ADR 034 declined a badge at 7%; the badge would also fail the "earned by a published card" test in PR A |
| No filter | A Capability filter on the Systems scope | ADR 018, 019 and 034 make a filter a precondition before publishing a record whose distinguishing fact is operational |
| OM1 is a `stateful_agent_runtime` | OM1 is an `agent_framework_sdk` | The runtime definition requires durable state, skills, schedules and memory lifecycle; all 18 runtime records carry them and OM1's documentation shows none, and ADR 019 says amend the definition or do not admit |
| openpi: hold or exclude | openpi moves to the `action-policy model boundary` hold | Its software exists to run or fine-tune its own three checkpoint families, so the systems question waits on the models question, as GR00T's and OpenVLA's do |

## Problem

Five repositories wait in `directory/candidates.json` under `triage.held_by: "robot software role decision"`: Dora, OM1, LeRobot, openpi, and the Safari SDK. [ADR 036](../../adr/036-the-agent-to-physical-world-boundary-is-in-scope.md) put the agent-to-physical-world boundary in scope and admitted nothing; its table sends these five to a full `docs/CURATION.md` review with the role question "put to ADR 011 and ADR 023 directly". Coverage batch 39 found that the agent family has no role for an outcome shaped like "operates physical robot hardware", but that as tested the proposal was "a model's output driving a physical actuator", a mechanism, "the exact shape ADR 023 refused elsewhere". `BACKLOG.md` carries the item with the same instruction: name an operational outcome, not the mechanism.

Batch 39 also found that no vocabulary can state the fact: "`execution_boundaries` and `agent_capabilities` carry no perception or actuation value." [ADR 023](../../adr/023-autonomous-science-systems-are-not-a-role.md) had claimed the opposite, that physical-instrument reach "is recorded today" in those two axes. This design reconciles the two.

The four robots that batch 39 held beside these five are published in `directory/robots.json` since batch 95. `docs/CURATION.md` still says "the robot software and action-policy model decisions in `BACKLOG.md` are still open."

## Decisions

### 1. ADR 044: no role for robot software; the physical boundary is a trait

Robot software is classified by the operational outcome it owns, under the roles that exist. A framework or builder whose documented outcome is an agent application that acts on a robot is `agent_framework_sdk`. A product that carries out delegated tasks on a robot for an end user would be a delegated-work agent, and none is before the Atlas. Reaching a robot's actuators is recorded as a trait.

**Why no role.** The three ADR 023 conditions are applied verbatim, and [ADR 011](../../adr/011-delegated-work-agents-are-agent-systems.md)'s comparison-set condition with them, as ADR 036 requires:

1. Three or more systems that pass the full five-condition gate. Of the five candidates, this review expects two to pass (LeRobot and OM1), two to wait on facts outside this repository (openpi on the models question, the Safari SDK on a programme gate), and one to fail the family test (Dora). Condition 1 is not met.
2. A shared operational outcome that no existing role names. The five do not share one. LeRobot and OM1 are frameworks a developer builds an agent application with, an outcome `agent_framework_sdk` names. openpi and the Safari SDK are tooling for named model checkpoints. Dora is middleware. What they share is where an action lands, and that is a trait. Condition 2 is not met.
3. A distinguishing property establishable from first-party evidence without reading source. The property is legible in every README reviewed, so condition 3 would hold, as batch 39 found. It was tested only on open repositories; the Safari SDK is the first closed-run-path member, and its README states the property too.

**The domain phrasing, settled.** Batch 39's first gap was that condition 2 had only been stated as a mechanism. ADR 044 states the outcome a future role would have to name: *completing physical tasks a person delegates, in the world rather than in software*, the robot counterpart of `general_work_agent`'s "multi-step knowledge work across files, web sources, applications, or schedules". A system meets condition 2 when its own documentation describes that outcome as what the product does for its user, rather than describing a framework, runtime, or model that a developer builds such a system from. "A model's output driving a physical actuator" describes the mechanism every such system would use, and also describes LeRobot's and OM1's, which are frameworks; it does not separate an outcome from the roles that exist, which is why ADR 044 records it as refused.

**What reopens this.** The three conditions above, with condition 2 read against that outcome phrasing, plus ADR 011's requirement of a coherent comparison set rather than one prominent product. The revisit is a reviewer's judgment against a written condition, as ADR 023's is.

**What this does not do.** It publishes nothing: each verdict below is taken at review in the second change, on its own evidence. It mints no role, adds no family, and does not touch ADR 037's collection or ADR 025's text-output criterion; the action-policy model question stays open in `BACKLOG.md`. It does not reach autonomous vehicles, drones, or robot components, which ADR 036 left as "a separate, unresolved question". It reopens no batch 39 exclusion: Isaac Lab, the six simulators and benchmarks, Nav2, Autoware and openpilot stand on their recorded reasons, and the verdicts below say why each published record is not one of them.

### 2. Vocabulary: one value, `robot_control`

`directory/taxonomy.json` `agent_capabilities` gains:

```json
{ "id": "robot_control", "name": "Robot control" }
```

`docs/TAXONOMY.md` carries the definition, in the capabilities list beside "browser control": *the agent's model-driven decisions are sent to a physical robot's actuators through a robot interface the system documents for that purpose.* Two boundaries follow from ADR 037's line on programmability: a motion API, teach pendant, or waypoint script with nothing said about a model choosing the action is not `robot_control`; and a simulator is not a robot, so a system whose documented run path ends in Gazebo or Isaac Sim does not carry it.

**Why a capability and not a boundary.** `browser_control` is the precedent. Controlling a browser is what the agent can do; the browser is not where the agent's actions are contained. A robot runtime's process runs on the host, a Jetson, or a laptop, and its commands travel over ROS 2 or Zenoh to the robot's own SDK, which OM1's README says it "assumes" the hardware provides. So a robot-software record still carries `host`, or whichever boundary its process runs in, and `robot_control` says what it does from there. `execution_boundaries` is untouched.

**Why one value.** The approved design recorded the fact as a boundary and as a capability and needed a validator rule to keep the two in step. ADR 034 refused that shape: "a reader would have two places to look for one answer." `perception` is dropped: no reader question needs it, sensors are the mechanism rather than the outcome, and without a physical qualifier the word reads onto browser and computer-use agents, which perceive screens.

**Validator.** No new rule. `validate_directory.py`'s agent branch already validates `agent_capabilities` against the taxonomy, so the value is accepted as soon as the taxonomy carries it. `DATA_MODEL.md` gains one sentence: automation and candidate discovery never infer `robot_control`; a reviewer sets it from the record's evidence.

**`BACKLOG.md` is amended.** Its item says "add actuation and perception trait values ... in the same change as the first record that needs them." ADR 044 replaces that with one value, landed one change ahead of its first record, on ADR 037's precedent ("accepted when the collection plumbing landed with zero records"). The cost is stated: the Taxonomy view lists every capability, so between the two changes it names "Robot control" with no record carrying it. The Capability filter has no such window because it is built from published values only.

### 3. Reachability: a Capability filter, no badge

**Filter.** The Systems scope gains a Capability filter, built like the Interface filter: a `<select id="capability-filter">` in `web/index.html`, populated in `web/app.js` from `agent_capabilities` values that published records carry, a `capability` key in `matchesProject` in `web/app-core.js` testing `project.agent_capabilities.includes(...)`, URL state, reset, and the input listener. It exposes all eight existing values as well as the new one. The Landing session's Phase 1 PR (#344) reworks the Systems control panel and facet handling, so the filter is built on `main` after that PR lands and follows its contract: `capability` is added to `SCOPE_CONTROLS.systems` in `web/app.js` and to `SCOPE_URL_PARAMS` in `web/app-core.js`, which the parity test requires and which lets the empty state's "Show it" button clear it with the other facets; and the filter is read inside `filterAndSortProjects`, like the Interface filter, so the empty state's "your filters hide N" count treats it as a facet. Capability names are not added to the search index: the filter is the reachability surface, and searching trait names is a separate question. This is the precondition ADR 018, 019 and 034 each applied: "no record whose distinguishing fact is operational is promoted before the filter that exposes that fact exists." Neither `execution_boundaries` nor `agent_capabilities` is filterable today; ADR 018 noted the gap and ADR 044 closes half of it.

**No badge.** Two or three records of 133 agent systems is about 2%. `docs/WEB.md` admits a badge that separates roughly 10–75% of its family, and ADR 034 declined one at nine of 128. The agent badge set also already holds six badges, which is `MAX_CARD_BADGES`, so a seventh could be cut off on cards that match all six. `docs/WEB.md` records the decision in the badge section's own words: the value is filterable and printed in record details, and a badge is revisited if the family's count reaches the floor.

**Where a reader sees the value.** The Capability filter; the record's "Agent operation" detail block, which already prints capabilities; the Taxonomy view, which lists every capability with its definition once `docs/TAXONOMY.md` has one; and the share page, which prints the same traits.

### 4. Roles and evidence for the five

Each record is an `agent_system` in `directory/projects.json`, scored on the agent profile. Role and traits come from review step 2 in `docs/CURATION.md`, official documentation plus enough product behaviour to establish the outcome, the same rule every scored record follows. ADR 037's documentation-only rule is not borrowed: it exists because robots are unscored, and these records are scored. Licences come from pinned blobs, read and hashed again at review.

| Candidate | Role | Basis for the role, from first-party text already fetched |
|---|---|---|
| LeRobot | `agent_framework_sdk` | The README's own run path: `action = model.select_action(obs)` then `robot.send_action(action)`, on a hardware-agnostic `Robot` interface, with vision-language-action policies that take a language instruction and act. A developer finishes with an agent application that acts on a robot. |
| OM1 | `agent_framework_sdk` | The README: "Design custom agents and robots by creating your own `json5` config files with custom combinations of inputs and actions." The docs: action plugins "map high-level decisions from one or more LLMs into concrete physical or digital actions". A developer configures an agent and OM1 runs it. |
| openpi | none yet | "The packages to run or fine-tune" three named checkpoint families. Its outcome is serving its own policy checkpoints. |
| Safari SDK | none yet | "Full lifecycle tooling for Google DeepMind's Gemini Robotics models", with most functionality behind the Trusted Tester programme. |
| Dora | none | "Middleware for composing AI-based robotic applications as low-latency, distributed dataflow pipelines." |

**LeRobot is not Isaac Lab, and not openpilot.** Isaac Lab was excluded because its documented outcome is training policies in simulation, with "no model, language-driven decision loop, or conversational component ... documented anywhere in the README". LeRobot's README documents the run path from a policy's decision to a physical robot, and the policies it names are vision-language-action models that act on a language instruction. openpilot was excluded on the narrower ground that its reviewed evidence shows "no language model, tool-calling, or delegated-task behavior"; LeRobot's language-conditioned policies are the delegated-task framing openpilot lacks. Batch 39 drew exactly this line when it held LeRobot and excluded Isaac Lab in the same sweep. The record's `why_it_matters` states the framework outcome; the training and dataset tooling is described as what the framework also ships, never as the reason it is in the Atlas.

**OM1 is a framework, not a runtime.** `stateful_agent_runtime` means "a persistent agent runtime that owns identity, durable state, skills, schedules, and memory lifecycle", and every one of the 18 records in that role carries `persistent_state` and a memory lifecycle. OM1's documentation describes a robot identity (URID) and a per-tick input, LLM, action loop; it describes no durable state, skills, schedules, or memory lifecycle. ADR 019 says a definition is amended or the record is not admitted under it, never stretched. OM1 is not admitted under it. `agent_framework_sdk`, "a developer framework or builder for creating tool-using, controllable, observable agent applications", fits what OM1's README says a developer does with it. The record's weaknesses carry what the definition would have wanted and the docs do not show.

**Traits.** LeRobot and OM1 carry `robot_control`; OM1 also carries `persistent_state` only if review finds it documented, which the dossier did not. Boundaries stay `host` (both run as a local process), with `framework_defined` where the record's agent application decides. Interfaces: `library` and `api_sdk` for LeRobot; `terminal` and `api_sdk` for OM1.

**Licences.** LeRobot: Apache-2.0 with MIT notices for vendored components, from pinned blobs. OM1: MIT. openpi, if it is ever reviewed as a system: Apache-2.0 plus `LICENSE_GEMMA.txt`, whose scope (the checkpoints, the code, or both) is unresolved and is recorded on the candidate. Every blob hash is recomputed at review; a changed hash means the file is read again.

**Scores and gating.** Nothing is gated out of a record for being closed or programme-bound; that belongs in `weaknesses` and `research_confidence` (ADR 007, `docs/CURATION.md` on vendor-only claims). OM1's default model path runs through OpenMind's hosted endpoint with an account key, with Ollama documented as the local substitute; that is a data-sovereignty and human-control fact in the score, not an admission fact.

### 5. Verdict rules and expected outcomes

Verdicts are taken at review in the second change. The rules:

- **Publish** when all five gate conditions hold and the role in section 4 is confirmed against re-fetched documentation.
- **Hold** when the gate fails on a fact outside this repository that a stated event would change, and re-label `triage.held_by` with what the candidate waits on, as batch 93 did when it relabelled the robots.
- **Exclude** when the family or role test fails on what the reviewed evidence shows, with a `reason` that says what the evidence shows and a `useful_lesson` a later reviewer can apply.

Expected outcomes, each open to reversal on the review's own evidence:

| Candidate | Expected | Grounds, to be re-established at review |
|---|---|---|
| LeRobot | Publish | Maintained run path (v0.6.1, 2026-08-03), documented control loop, pinned licences. |
| OM1 | Publish, with weaknesses | The documented install path yields a current build: the Go binaries are rebuilt nightly and CI was green on 2026-09-24. The weaknesses state that the latest tagged release (v1.0.2-beta.2, 2026-04-29) is the deprecated Python runtime with no binaries, that the default model path needs an OpenMind account key, and that the docs describe a FABRIC robot-identity network and an experimental blockchain governance page the README does not mention. If the reviewer judges an untagged nightly is not a maintained run path, hold under `tagged release of the Go runtime`. |
| openpi | Hold, relabelled `action-policy model boundary` | Its software exists to run or fine-tune its own checkpoints, the shape batch 39 held GR00T and OpenVLA in. Zero tags, a placeholder PyPI name, last commit 2026-08-24, and the Gemma licence scope are recorded on the candidate for whichever review takes it. |
| Safari SDK | Hold, relabelled `programme-gated run path` | The README says most functionality requires joining the Trusted Tester programme. ADR 023's words for Microsoft Discovery apply: a preview behind a programme "is not a boundary a reader can adopt". The hold lifts at general availability. |
| Dora | Exclude | The README describes dataflow middleware whose nodes may be cameras, YOLO, LLMs, or TTS, and it states no agent loop of its own and no reach to an actuator; the model-to-arm wiring exists only in the separate hub repository's examples. The reason distinguishes the two published records a reader might compare it with: LangGraph's documented outcome is the agent's own control flow, with state, checkpoints, and human control, and sandbase-harness owns its sessions, events, and credential vault; Dora owns transport and scheduling between nodes whose loop belongs to their authors, the dario and TreeQuest line. The reason also records that the PyPI wheel declares MIT while the repository LICENSE and NOTICE say Apache-2.0. |

**Screened neighbours.** Twelve adjacent repositories were screened so that the comparison set is coherent (ADR 011). Nine were already decided in batch 39 or are held under the action-policy boundary. Of the rest: Octo, a policy release with inference code, is queued and held under `action-policy model boundary` beside GR00T, OpenVLA and Alpamayo; Genesis (a simulator) and robomimic (a training framework) get exclusion entries on the batch 39 lines for simulators and Isaac Lab; ROS 2, MoveIt 2, and Isaac ROS Common get exclusion entries on the Nav2 line, since their READMEs document no learned model in any loop; Open X-Embodiment gets an exclusion entry as a dataset, a research input. ManiSkill's exclusion entry names `mani-skill/ManiSkill` while the repository now lives at `haosulab/ManiSkill`; the entry's `repo` is corrected and `verified_at` bumped. The tripwire count after review is at most two full-gate systems, so ADR 044's condition 1 stays unmet by the review's own result.

### 6. Discovery

`scripts/update_directory.py`'s keyword ladder gains one rung before the generic framework rung: descriptions containing "robot", "robotics", "humanoid", "quadruped", "manipulation", "teleoperation", "vision-language-action", or "actuator" route to `agent_framework_sdk` with a relevance floor of 0.82, the same mechanism ADR 023 used for `research_agent`. The route matches what ADR 044 decides such systems are when they are agent systems at all. "ROS" is not a keyword: it matches too much middleware, and the openpilot lesson warns that a robotics topic match "does not establish that a system's documented behavior involves a model in the loop". `DISCOVERY_QUERIES` is unchanged, so the rung re-routes only repositories the existing queries already find; batch 39's candidates came from manual topic sweeps and the next ones will too. False positives cost a provisional queue entry a reviewer dismisses.

### 7. Documentation

- `docs/adr/044-robot-software-classifies-by-the-outcome-it-owns.md`, Proposed in the first change, Accepted in the second. The number is re-checked against `origin/main` before each PR and renumbered by slug if taken.
- `docs/TAXONOMY.md`: the capabilities list gains "robot control" with its definition, and the scope section gains one sentence after the ADR 023 paragraph stating where robot software classifies, linking ADR 044.
- `docs/CURATION.md`: the scope sentence no longer says the robot software decision is open; a scope-boundary paragraph states how to read a robot-software candidate (outcome first, actuator reach as a trait, simulators and training frameworks on the batch 39 lines, policy checkpoints to the models question).
- `docs/DATA_MODEL.md`: automation never infers `robot_control`.
- `docs/WEB.md`: the Capability filter joins the filter list; the badge section records why `robot_control` has no badge.
- `docs/ROBOTS.md`: one sentence in the boundary section stating that software which controls a robot is a scored system record under ADR 044, never a robot record. The Landing session is editing line 68 of this file in its Phase 1 PR; this sentence goes elsewhere, and whichever PR lands second resolves a one-line hunk if they touch.
- `AGENTS.md`: the Taxonomy row of the topic map gains "robot software".
- `docs/COVERAGE.md`: entry 96 records the review, the verdicts, the screen, and the trait, in the batch format.
- `BACKLOG.md`: the robot-software item is removed; the action-policy item gains Octo and openpi; the triage-routing item is unchanged.
- ADR 036 and ADR 037 are not edited. ADR 036's table names the review this is; the COVERAGE entry and the candidates' relabels carry the outcome.

### 8. Tests

- `tests/test_directory.py`: `robot_control` is a valid capability; a record carrying an unknown capability still fails.
- `tests/test_web.js`: the Capability filter narrows by `agent_capabilities`; the URL state round-trips `capability`; the trait-badge guard still passes with no new badge; the badge set is unchanged.
- `tests/e2e/directory-search.spec.js`: one case selects a capability in the filter and asserts the count, mirroring the Interface case at line 544.
- `tests/test_update_directory.py`: a robotics description routes to `agent_framework_sdk` at or above 0.82; a description with "ROS" alone does not route by the new rung.
- Page-stability check, recomputed blob hashes, and `validate_directory.py` at both PRs. No test pins the five candidates by name, checked with `grep` on 2026-09-28.

### 9. Delivery

Two PRs, subagent-driven, each merged with `main` right before opening and auto-merged only when the owner asks.

- **PR A, decision and plumbing:** ADR 044 (Proposed), the taxonomy value, the Capability filter and its tests, the discovery rung and its tests, the documentation changes in section 7 except COVERAGE 96 and the candidate relabels, and the `BACKLOG.md` amendment.
- **PR B, review and records:** re-fetch every URL and recompute every hash; the two records (or fewer, on the review's evidence); the Dora exclusion and the six screened exclusions; the openpi, Safari SDK, and Octo holds; the ManiSkill entry correction; candidate removals; COVERAGE 96; ADR 044 to Accepted; regenerated payload, share pages, blog, and asset stamp.

The Landing, badge, and nav-bar sessions are told the final ADR number and that no badge is added, so the badge session's `MAX_CARD_BADGES` arithmetic is unaffected.

## Open points for the owner

1. Whether the Capability filter is the right reachability surface, or whether an Execution filter should land in the same change to close ADR 018's gap fully. This spec adds only the Capability filter.
2. Whether OM1's nightly-only Go runtime counts as a maintained run path. This spec expects yes, with the release state in weaknesses.
