---
name: ai-systems-atlas
description: Query the AI Systems Atlas, a directory of reviewed agent, memory, and assistant systems, model releases, interoperability specifications, managed inference services, and self-operated local runtimes, plus attributed models.dev source records. Use when an agent needs to find, compare, or cite catalog data rather than guessing from training knowledge.
---

# AI Systems Atlas

The Atlas (https://peacefulcoexistance.com/) reviews and curates AI agent, memory, and assistant systems, provider-independent model releases, interoperability specifications, managed inference services, and self-operated local runtimes. Reviewed records carry evidence and a `verified_at` date. A separate complete models.dev snapshot is published as attributed source metadata; automation cannot turn one of those rows into an Atlas review or change Atlas prose, licenses, scores, or conclusions.

## Fetch the right file for the question

| Question | Fetch |
|---|---|
| Agent, memory, or assistant systems | `projects.json` |
| Protocols, metadata schemas, instruction conventions (AGENTS.md, CLAUDE.md, Agent Skills, ...), capability or package formats | `specifications.json` |
| Managed inference APIs and hosting platforms | `inference-services.json` |
| Self-hosted inference runtimes (Ollama, vLLM, LM Studio, ...) | `local-runtimes.json` |
| Every provider-independent record present in models.dev | `models-dev.json` |
| Atlas-reviewed language-model releases, distribution terms, evidence, and access scores | `models.json` |
| Enum meanings, license identifiers, score-profile definitions | `taxonomy.json` |
| Why something was reviewed and not included | `exclusions.json` |

All files live at `https://peacefulcoexistance.com/<file>` and are plain JSON with no auth and no rate limit.

## Vocabulary you need to filter correctly

- `system_family`: one of `memory_system`, `agent_system`, `assistant_system`. A project's `primary_role` is only meaningful within its own family.
- `score_profile`: which scoring rubric a record uses. **Never compare `score.overall` across different `score_profile` values** — an 8.5 under one profile and an 8.5 under another are not measuring the same thing, and mixing them produces a wrong answer, not an approximate one. Models use `model_access`, which excludes quality, benchmarks, parameter count, current price, latency, and throughput. Specifications are never scored at all.
- `status`: `active`, `archived`, `superseded`, or `removed`. Default to `active` unless the user asks about history; a `superseded` record's `superseded_by` names its successor, whose record still exists.
- Licenses and source model never gate inclusion here — a project can be proprietary and still be reviewed. Don't infer permissiveness, quality, or popularity from a record's mere presence in the catalog.

## Full schema

See [reference.md](reference.md) in this skill for the field-by-field shape of every published file. Load it only when you need a field this summary doesn't name.
