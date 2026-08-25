# ADR 006: Model-provider relationships are orthogonal traits

**Status:** Accepted

## Context

Operational agent systems range from provider-native SDKs to runtimes that support several model backends. Plain model API clients, providers, and observability clients are adjacent ecosystem components, but they do not independently plan or act through tools. Treating a provider or its SDK as a third system family would mix vendor identity with system outcome and would require a score profile that has no coherent comparison target.

## Decision

Keep `memory_system` and `agent_system` as the only system families. Describe a reviewed project's coupling with two optional, orthogonal fields:

- `provider_relationship`: `provider_native`, `multi_provider`, or `provider_agnostic`;
- `model_backends`: one or more reviewed backend identifiers from the taxonomy.

The fields are optional during rollout so existing records do not acquire inferred claims. When either field is reviewed, both are required. `provider_native` requires exactly one backend; the other relationships may name multiple backends. Absence means “not reviewed,” not “provider agnostic.”

Provider-native agent SDKs and harnesses may qualify when building or running a tool-using agent is their primary outcome. Plain inference/API clients, model repositories, adapters, and tracing clients remain outside the scored catalog. A future unscored ecosystem index requires separate evidence of user value and is not part of this decision.

Discovery receives role-to-family policy from the taxonomy rather than maintaining its own family list. Automated discovery may propose family and role, but it does not assign provider traits.

## Consequences

- Provider coupling can be reviewed without changing family, role, or score comparability.
- Existing projects remain valid until provider evidence is deliberately reviewed.
- UI detail and filters wait for sufficient reviewed coverage, avoiding sparse or misleading controls.
- Adding a backend requires one taxonomy update rather than free-form project strings.
- Ordinary model API SDKs do not enter the catalog merely because their publisher also ships agent products.
