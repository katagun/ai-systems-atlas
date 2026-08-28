# ADR 006: Model-provider relationships are orthogonal traits

**Status:** Accepted; family count extended by [ADR 009](009-assistant-systems-are-a-distinct-family.md)

## Context

Operational agent systems range from provider-native SDKs to runtimes that support several model backends. Plain model API clients, providers, and observability clients are adjacent ecosystem components, but they do not independently plan or act through tools. Treating a provider or its SDK as another system family would mix vendor identity with system outcome and would require a score profile that has no coherent comparison target.

## Decision

Keep provider identity out of system-family classification. The operational families are defined by outcome—initially `memory_system` and `agent_system`, with `assistant_system` added by ADR 009. Describe a reviewed project's coupling with two optional, orthogonal fields:

- `provider_relationship`: `provider_native`, `multi_provider`, or `provider_agnostic`;
- `model_backends`: one or more reviewed backend identifiers from the taxonomy.

The fields are optional during rollout so existing records do not acquire inferred claims. When either field is reviewed, both are required. `provider_native` requires exactly one backend; the other relationships may name multiple backends. Absence means “not reviewed,” not “provider agnostic.”

Provider-native agent SDKs and harnesses may qualify when building or running a tool-using agent is their primary outcome. Source ownership and runtime dependencies are recorded through the source model, license evidence, strengths, weaknesses, and research confidence; they are not inclusion gates. Plain inference/API clients, model repositories, adapters, and tracing clients remain outside the scored system catalog because they do not independently provide the operational outcome. ADR 010 later defines managed inference services as a separate collection, and ADR 011 gives that collection its own non-system score; neither alters this system-classification decision.

Discovery receives role-to-family policy from the taxonomy rather than maintaining its own family list. Automated discovery may propose family and role, but it does not assign provider traits.

## Consequences

- Provider coupling can be reviewed without changing family, role, or score comparability.
- Existing projects remain valid until provider evidence is deliberately reviewed.
- Reviewed provider traits may appear in project details; directory filtering waits for representative coverage, avoiding a sparse or misleading control.
- Adding a backend requires one taxonomy update rather than free-form project strings.
- Ordinary model API SDKs do not enter the catalog merely because their publisher also ships agent products.
