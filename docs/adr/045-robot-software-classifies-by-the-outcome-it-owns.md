# ADR 045: Robot software classifies by the outcome it owns

**Status:** Accepted

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
- The five candidates are reviewed in a following change, which records coverage batch 98 and sets this record to Accepted.
- A future proposal for a robot role arrives against a written outcome and a named, refused mechanism.
