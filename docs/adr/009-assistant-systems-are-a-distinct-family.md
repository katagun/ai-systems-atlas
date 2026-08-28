# ADR 009: Assistant systems are a distinct family

**Status:** Accepted

## Context

General assistants, enterprise work assistants, and multi-model chat clients are operational AI systems, but their primary outcome is neither durable knowledge ownership nor delegated autonomous action. Forcing ChatGPT, Amazon Quick, or T3 Chat into a memory or agent role would make the role label and score misleading. Excluding them would preserve a GitHub-centric blind spot in a directory named AI Systems Atlas.

Assistant products can contain research, memory, tools, and agentic modes. Classification follows the primary end-user outcome of the represented product, not its most agentic feature. Product boundaries remain explicit: ChatGPT is distinct from Codex and OpenAI Agents SDK; T3 Chat is distinct from T3 Code; Grok is distinct from Grok Bot; and a provider or inference API is not an assistant merely because it powers one.

## Decision

Add `assistant_system` as a third scored system family. Its initial roles are:

- `general_ai_assistant` for broad provider-branded conversational workspaces;
- `enterprise_work_assistant` for governed assistants grounded in organizational data and applications; and
- `multi_model_chat_client` for maintained end-user workspaces whose primary value is model and provider choice.

The assistant profile scores the product-level experience: task reliability, context continuity, tools and integrations, human control, data governance, interoperability, usability and access, and maturity. It does not score transient model benchmarks. Assistant, agent, and memory scores are never compared.

Agent-operation traits remain required only for `agent_system`. Assistants use the shared architecture, retrieval, capture, lifecycle, deployment, source-model, license, and provider traits. Each family has exactly one score profile, and secondary roles cannot cross family boundaries.

Plain model APIs, providers, playgrounds, thin prompt wrappers, and model repositories remain outside the scored system catalog. ADR 010 later defines managed inference services as a separate unscored collection without changing this scored-family boundary.

## Consequences

- The Atlas can cover proprietary and hosted assistants without pretending that a chat workspace is an autonomous runtime.
- Assistant capabilities and terms require dated review because product plans change faster than repository software.
- Each Finder goal is exposed only after at least one active reviewed system satisfies its role.
- Adding a future family still requires a distinct outcome, roles, score profile, validation, UI treatment, and reviewed comparison set.
