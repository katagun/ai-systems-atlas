# ADR 018: Operating party is a trait, not a role

**Status:** Accepted

## Context

`docs/COVERAGE.md` grouped seven vendor products into one research batch — Microsoft Foundry Agent Service, Microsoft Copilot Studio, Amazon Bedrock AgentCore, the Gemini Enterprise Agent Platform, Salesforce Agentforce, IBM watsonx Orchestrate, and the Meta Business Agent Platform — on the claim that they share one shape: the vendor hosts the runtime while the customer configures an agent with tools, grounding, and handoff. The batch asked for the role question to be settled once for the class, since `agent_framework_sdk` describes a library the customer runs.

The automated discovery pass never agreed the class existed. It proposed `stateful_agent_runtime` for three, `agent_framework_sdk` for three, and `multi_agent_orchestrator` for one, with the Meta candidate carrying the lowest classification confidence in the queue.

Reading the seven products' own documentation dissolved the premise.

**The shared clause is false for at least one member.** IBM lists five watsonx Orchestrate offerings, two of them client-managed: AWS, AWS Gov, IBM Cloud, **on-premises**, and a **Developer Edition** that "runs as a local server on your computer." On-premises deployment carries a maintained release-by-release compatibility matrix and documented air-gapped support. Whoever operates watsonx Orchestrate, it is not necessarily IBM. It also coordinates other vendors' agents over A2A — including Salesforce Agentforce agents through Salesforce's own Agent API — which is the `multi_agent_orchestrator` definition rather than a new one.

**The second clause is false for three more.** Microsoft Foundry Agent Service offers three paths and says so: a prompt agent defined by configuration, a **hosted agent** where the customer brings "your own code and framework as a container," and a Responses API call with no agent resource at all. Bedrock AgentCore and the Gemini Enterprise Agent Platform are likewise framework-agnostic hosts rather than configuration products — AgentCore Runtime "works with custom frameworks and any open-source framework, including CrewAI, LangGraph, LlamaIndex, Google ADK, OpenAI Agents SDK, and Strands Agents." For all three, the customer's canonical artifact is code written against a framework, and three of the frameworks named are already published Atlas records.

**The handoff clause is false for the same three.** Neither AgentCore nor the Gemini Enterprise Agent Platform documents human escalation as a platform feature; AWS offers architectural guidance in its Well-Architected material, and Google's live-agent handoff belongs to a different product.

**The class is not closed.** Botpress Cloud already sits in the candidate queue as a "hosted platform for building and operating conversational agents" — the proposed shape verbatim — but under a different research batch asking whether a visual builder is a framework or an orchestrator. Copilot Studio is a low-code visual builder and belongs to that question on its own merits. A role drawn around the seven would have to absorb Botpress Cloud, then the hosted tiers of Dify and Langflow, at which point it would mean "sold as a service" and would filter nothing.

What survives across the remainder is one fact: who operates the runtime.

## Decision

Operating party is a trait. It is not a primary role, and no `managed_agent_platform` role is added.

This is not a new rule. `AGENTS.md` states it as a hard rule — "Architecture, retrieval, deployment, and agent traits are not primary roles" — and [ADR 003](003-multi-axis-directory.md) names deployment as one of the orthogonal trait axes in the founding decision. `docs/CURATION.md` already applies it to this exact territory: a provider-native SDK or harness qualifies on whether agent execution is its primary outcome, and "the runtime may be open or proprietary; that difference belongs in `source_model`, evidence, weaknesses, and data-sovereignty scoring." A role named for who holds the operating contract is the deployment axis wearing a role's name.

No fifth collection is created either. [ADR 013](013-distinct-collections-share-one-directory-surface.md) admits a new collection only when it retains "an explicit schema, boundary, and comparison policy," and [ADR 015](015-local-runtimes-are-self-operated-execution-records.md) forecloses the analogy in advance: "the existence of a fourth is not a precedent for admitting adjacent software by analogy." These products need no distinct schema — they use the same interfaces, execution boundaries, and capabilities as every agent record — and they need no distinct rubric, because the agent score profile already scores vendor-operated agents at production quality. Devin, Replit Agent, Higgsfield Supercomputer, and Perplexity Computer are all scored under it today, each correctly low on data sovereignty.

The seven are therefore routed individually, under roles that already exist, and the batch is dissolved rather than settled.

### The defect this exposes

The proposal was wrong, but the pressure that produced it is real and must be relieved rather than resisted.

`primary_role` is the only filterable classification axis a system record has. `matchesProject` filters family, role, agent relation, architecture, source model, license, status, and local-first. It does not filter `deployment` or `execution_boundaries`, and `secondary_roles` — recorded on twenty-three records and validated — is rendered nowhere in the web application at all. A curator who knows an operational fact matters to readers has exactly one place to put it where a reader can find it, and that place is the role.

[ADR 017](017-local-runtime-eligibility-ignores-modality.md) already decided what to do about this shape of problem: a record the filters cannot reach is unfindable however well it is written up, and the remedy is to extend the reachable vocabulary rather than to distort the classification. The same obligation applies here.

**Making the operating party reachable is a precondition, not a follow-up.** No record whose distinguishing fact is operational may be promoted before `deployment` is a filter on the Systems scope. Promoting one earlier would leave the fact unfindable and would recreate exactly the pressure this record refuses.

The existing `deployment` data must be corrected in the same change. `managed_cloud` is currently carried by thirty-one records including Joplin and ChatGPT, where it means only "a hosted tier exists"; twelve of seventeen framework records use `cloud_optional` while LangGraph carries `cloud_optional` despite shipping a managed platform. A filter over inconsistent values is worse than none.

### What this does not change

- **ADR 015's boundary is untouched.** Local runtimes remain a separate collection defined by self-operation. This record governs how the systems collection represents an operational fact; it does not move anything across a collection boundary.
- **The agent score profile and its weights are unchanged.** A vendor-operated system scoring low on data sovereignty is the profile working as ADR 015 described: a record scores low on dimensions it never set out to address while remaining the correct choice for its use.
- **Roles continue to name primary outcomes.** Hosting agents, coordinating agents, and producing agents that serve a third party are different outcomes, and they remain separable by the roles that already exist.
- **Nothing is promoted here.** This record settles classification policy. Each of the seven still requires its own evidence, licensing, and scoring pass under `CURATION.md`.

### Routing

| Product | Role | Basis |
|---|---|---|
| Microsoft Foundry Agent Service | `stateful_agent_runtime` | Versioned agent assets, server-side conversations, memory stores, per-agent directory identity |
| Amazon Bedrock AgentCore | `stateful_agent_runtime` | Managed memory, identity, session-isolated runtime, skills |
| Gemini Enterprise Agent Platform | `stateful_agent_runtime` | Agent Runtime, Sessions, Memory Bank, agent identity |
| IBM watsonx Orchestrate | `multi_agent_orchestrator` | Coordinates other vendors' agents over A2A; ships on-premises and locally |
| Salesforce Agentforce | Unresolved | The brand spans a platform, prebuilt assistants, and separate products; review must first fix the product boundary |
| Microsoft Copilot Studio | Deferred to the low-code builder batch | A visual builder; its question is framework versus orchestrator, not who operates it |
| Meta Business Agent Platform | Unresolved | Lowest classification confidence in the queue; scope is one messaging surface |

AgentCore and the Gemini Enterprise Agent Platform are separate records from Strands Agents SDK and Google ADK rather than duplicates of them. Each hosts frameworks its vendor did not publish, and each SDK's own documentation lists the platform as one deployment target among several. Both records must state that boundary, because the reverse error — folding a framework-agnostic host into one framework's record — is the easier mistake to make.

## Consequences

- The managed-platform batch is dissolved. `docs/COVERAGE.md` must stop asking for one answer for seven products and record the routing instead.
- A `deployment` filter is now owed on the Systems scope, together with a pass over the inconsistent values behind it. Until both land, the affected candidates stay in the queue.
- `execution_boundaries` carries `remote_cloud`, defined as running on the vendor's infrastructure, which states the operating fact more precisely than `managed_cloud` does. Whether one filter or two is the right answer is left to the change that implements it.
- The agent profile's `data_sovereignty` dimension is worded for self-operation — "Local execution, privacy, exportability, and operator control" — while the assistant profile's counterpart names tenant boundaries, residency, and administration. Vendor-operated platforms sell exactly those controls, and a scorer has no vocabulary for them today. Rewording carries a rescoring obligation across every agent record, so it is recorded as known debt rather than decided here.
- Future proposals to encode an operational fact as a role should be read as evidence that a trait is unreachable, and answered by making it reachable.
- Salesforce Agentforce and the Meta Business Agent Platform remain unresolved on purpose. Neither failed; both need a product-boundary decision before a role means anything.
