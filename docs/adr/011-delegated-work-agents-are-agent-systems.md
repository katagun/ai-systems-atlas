# ADR 011: Delegated work agents are agent systems

**Status:** Accepted

## Context

General assistants increasingly contain agentic modes, while products such as Perplexity Computer and Claude Cowork are presented as work surfaces for delegating multi-step outcomes. Both may share accounts, models, or interfaces with a conversational assistant, but their primary interaction is different: the user hands off a job and the system plans, uses tools, creates artifacts, and returns completed work.

Classifying these products as general assistants would hide their execution and control boundary. Classifying them as browser/computer agents would overstate one implementation mechanism, while classifying them as stateful runtimes or frameworks would confuse an end-user product with developer infrastructure.

## Decision

Add `general_work_agent` to the existing `agent_system` family. It covers end-user systems whose primary value is accepting broad delegated knowledge-work outcomes and executing multi-step work across files, web sources, applications, or schedules.

Use the represented product boundary, not the vendor or account boundary. A named delegated-work product may be separate from a vendor's conversational assistant when authoritative product material establishes a distinct workflow, execution environment, or operating model. Conversely, do not split a conversational product merely because it adds an optional tool or agentic feature.

The role is not a catch-all for vertical automation. Browser/computer agents remain systems specialized around graphical operation; research agents remain specialized around sourced investigation; stateful runtimes and frameworks remain developer/operator infrastructure. Future vertical work-agent roles require a coherent comparison set rather than one prominent product.

## Consequences

- Delegated general work is scored with the agent profile, including autonomy, human control, observability, recovery, and execution boundaries.
- Perplexity Computer and Claude Cowork can be represented without collapsing Perplexity or Claude assistant product boundaries.
- Finder users can ask for broad delegated work independently of interactive assistance.
- Product terms and safety documentation require dated review because execution capabilities and plan availability change quickly.
