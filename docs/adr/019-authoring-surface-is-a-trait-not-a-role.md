# ADR 019: Authoring surface is a trait, not a role

**Status:** Accepted

## Context

`docs/COVERAGE.md` batch 10 asked one question about a class of five products — Dify, Langflow, Flowise, Botpress Cloud, and Microsoft Copilot Studio, the last routed here by [ADR 018](018-operating-party-is-a-trait-not-a-role.md): "whether a visual builder is an agent framework or a multi-agent orchestrator." The framing presumes the answer is one of those two, for the class.

Reading the products' own documentation answers half of it immediately and rejects the other half.

**`multi_agent_orchestrator` is wrong for all of them.** That role means "a system for coordinating specialized agents, handoffs, workflows, and shared execution," and none of these organizes itself that way. Langflow's own documentation points a reader wanting multiple agents at "use an agent as a tool" — hierarchical delegation, where one agent calls another as a function, not peer handoff. Botpress ships things it calls Agents, but they are "specialized components that extend the capabilities of a bot" running in a fixed order, a middleware chain around a single bot; in Botpress, handoff means bot-to-human. Dify is the only one whose documentation describes "a few specialized agents handing off to each other," and it offers that as one reason to place an agent inside a workflow — the workflow is the container, and composition is primary. All three compose nodes in a pipeline. The automated classifier's split, which proposed this role for two of them and a framework role for the other three, was reading a capability as a purpose.

**`agent_framework_sdk` is closer but excludes them on its face.** It reads "a developer framework for building tool-using, controllable, observable agent applications." Langflow calls itself "a Python-based, customizable framework" and ships an embeddable library, so it satisfies the definition as written. Dify is a platform whose code path surrounds a canvas rather than replacing it. Botpress Cloud is a hosted product whose open repository contains integrations and a CLI but not the product. Copilot Studio ships no framework at all and targets business makers rather than developers. Stretching "developer framework" to cover those silently would make the definition mean nothing.

So the batch question is malformed in the same way an earlier one was: it asks which role a *class defined by how you build* takes, when the systems in it differ by what they do.

## Decision

Authoring surface — whether an agent is composed on a visual canvas or written in code — is a trait. It is not a primary role, and no builder role is added.

This is not reached by analogy with ADR 018, and the difference matters. ADR 018 could call operating party a trait because deployment is one of the axes [ADR 003](003-multi-axis-directory.md) names. Authoring surface is not on that list, so calling it a trait would be an assertion rather than an application of a rule. What settles it is that the distinction is already modeled: `agent_interfaces` separates `library` and `api_sdk` from `web_app`, every published framework and orchestrator record carries the former pair, and a visual builder carries the latter. The Finder already treats that axis as exactly this discriminator, scoring a "developer" priority against `library` and `api_sdk` and a "direct use" priority against `terminal`, `ide`, and `web_app`. `AGENTS.md` then applies: agent traits are not primary roles.

### The definition is amended rather than stretched

`agent_framework_sdk` becomes:

> A developer framework or builder for creating tool-using, controllable, observable agent applications.

The role has always been about the outcome — you finish with an agent application you deploy — and never about whether the authoring happened in an editor or on a canvas. The old wording described the population rather than the boundary, which is a defect that only surfaced when the first builder was reviewed. Amending it is honest; admitting builders under the old wording would not be.

### Making the trait reachable is a precondition

`agent_interfaces` is recorded on every agent record, is load-bearing in Finder ranking, and appears in record details — but no filter exposes it. A reader browsing the Systems scope cannot separate a canvas from a library.

[ADR 017](017-local-runtime-eligibility-ignores-modality.md) already decided what to do about that shape of problem: a record the filters cannot reach is unfindable however well it is written up, and the remedy is to extend the reachable vocabulary rather than distort the classification. So no builder is published before `agent_interfaces` is a filter on the Systems scope. Publishing four builders into a role that reads as developer infrastructure, with no way to tell them apart, would produce precisely the confusion this record refuses to fix with a new role.

### What this does not change

- **Roles continue to name primary outcomes.** Building an agent application, coordinating specialized agents, and operating a runtime remain different outcomes, separable by roles that already exist.
- **The score profile and its weights are unchanged.** A canvas builder and a code framework are scored on the same eight dimensions because they answer the same question — how well does this let you build and run an agent.
- **Nothing here admits a product that fails `CURATION.md`.** A builder still qualifies only when building or running tool-using agents is a primary outcome.
- **ADR 018 is untouched.** Operating party remains a separate trait, and a builder may be self-operated, vendor-operated, or both.

## Consequences

- Batch 10 is dissolved. `docs/COVERAGE.md` records the routing rather than the question.
- An `agent_interfaces` filter is owed on the Systems scope before any builder is promoted, joining the deployment filter ADR 018 required.
- The `agent_framework_sdk` population becomes more varied, and its name reads increasingly poorly against its contents. Renaming a role identifier would break recorded data and URL state, so the name stays and the definition carries the meaning.
- A future product that genuinely organizes itself around specialized agents handing off to each other still belongs in `multi_agent_orchestrator`. That role is not weakened here; it is kept for systems whose purpose it actually describes.
- Copilot Studio arrives from ADR 018 with a different answer from its batch-mates: it coordinates child agents, connected agents, and external agents, and escalates to humans as a first-class construct, which is the orchestrator definition rather than the builder one. A shared authoring surface did not make these products alike.
