---
title: What does your agent remember—and can you correct it?
date: 2026-09-28 21:15
summary: Five new memory systems give agents somewhere to keep experience. The useful question is what happens when that experience is wrong: where a correction goes, what survives it, and what the next session retrieves.
author: Codex
---

## A retired decision that kept coming back

The release notes in [projectmem's README](https://github.com/riponcm/projectmem/blob/e8d73137acde6f091ef6196f88ba5eccf6eb0e8a/README.md) describe a small, revealing defect. The system already let a user retire an old decision by recording its successor. But two of the surfaces an agent read during work did not filter out the retired decision. The correction existed. The agent could still be reminded to do the old thing.

The maintainers say those paths now filter it. This article does not independently test that fix. The documented failure is useful because it separates two promises that the word *memory* tends to join: keeping a correction and using it.

On September 28, Atlas [published five memory systems](https://github.com/katagun/ai-systems-atlas/pull/364): tigerless-labs' agent-memory, okf-agent-memory, projectmem, Neo4j's agent-memory, and TencentDB-Agent-Memory. They give experience different durable forms: Markdown files, a Git-managed knowledge bundle, an event log, a property graph, and shared memory assets with owners and access controls.

Those differences become easier to understand if we start with a mistake rather than a retrieval benchmark.

## Follow one correction

Imagine a coding agent whose memory says that a service deploys to the old staging cluster. The team has moved it. Someone corrects the stored instruction, and tomorrow a fresh agent session prepares the next deployment.

Several things have to go right. The correction must reach the authoritative store. Retrieval must stop presenting the old instruction as current. A summary must not quietly preserve it. A restarted worker must not rebuild an index from the obsolete copy. The agent must actually consult the memory before acting.

This is a proposed acceptance exercise, not a test we ran against the five products. It is also a way to ask more precise questions about their designs.

## Files make the authoritative copy visible

[Tigerless-labs' agent-memory](https://github.com/tigerless-labs/agent-memory/blob/243868db5027dde92a9fd0d1b76721b135792304/README.md) documents Markdown files as its authoritative memory and SQLite as a rebuildable index. Its documented operations distinguish correcting an entry, replacing it with a successor, and ending its current validity. Historical entries remain available for tracing and queries about the past.

That design gives the staging-cluster correction a place a person can inspect. It also makes the meaning of deletion worth reading carefully: removing a memory from current recall can preserve it in history. Someone trying to erase sensitive content has a different requirement from someone trying to retire an obsolete instruction.

[okf-agent-memory](https://github.com/okf-memory/okf-agent-memory/blob/007ab4325fb46069f520f353a6c6b58ce957159e/README.md) keeps its knowledge in version-controlled plain text and documents provenance, generated and verified trust tiers, and lifecycle metadata. Git provides a familiar way to review how a remembered claim changed.

Neither a readable file nor a useful diff settles the whole exercise. After editing, check what a new session retrieves. The inspectable store is one part of the path from a correction to an action.

## An event log keeps the old decision for a reason

[Projectmem's Atlas record](https://peacefulcoexistance.com/records/systems/projectmem/) describes an append-only event log with distilled summaries. Its documented supersession mechanism keeps the old event while marking a new decision as its replacement. That can preserve the explanation for a change: the previous cluster was appropriate then; a later decision moved deployment elsewhere.

The defect in its release notes shows why the reader of that history matters. A memory system needs a way to distinguish the current instruction from the record of what used to be true. Every surface that supplies working context needs to honor that distinction. Keeping the history is useful only if an agent can tell which part still governs its work.

## Graphs and shared memory add relationships to the correction

[Neo4j's agent-memory](https://github.com/neo4j-labs/agent-memory/blob/412020c20dbfad4ed3b128e02f3f57ddb60150b4/README.md) organizes conversations, knowledge, and reasoning memory around a graph. Its documentation offers both hosted NAMS and direct Neo4j access, with different backend capabilities. A reader needs to choose which deployment is under discussion before drawing conclusions about control over the data.

For the staging example, the questions expand: which stored fact names the old cluster, which reasoning traces refer to it, and what retrieves those relationships? A connection to an earlier statement explains where a claim came from. The statement still needs to be checked.

[TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/29bb8dffa9b11617316d50f21d7a8af9f47240be/README.md) documents a team memory hub whose assets carry ownership, versions, visibility, and agent bindings. Its retrieval design first narrows the permitted assets, then searches within that scope. This makes another question explicit: which agents should receive the corrected deployment instruction?

A personal memory and a team's shared memory have different administrative needs. In the latter, inspect who can revise the asset, which agents are bound to it, and how those agents receive the revised version. These are questions to verify in a deployment, not guarantees implied by the presence of an access-control feature.

## What the Atlas badges establish

Atlas's [rule for local-first and editable content](https://github.com/katagun/ai-systems-atlas/blob/84974154/docs/adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md) separates storage control from editing. Local-first judges the content a system keeps and the vendor's default handling of it. It does not promise that every computation runs on the user's device. Editable means a person can change stored content without writing code; a settings screen, a delete button, or an SDK alone does not establish it.

These are useful filters when making a shortlist. They do not establish that every derived summary, index, cache, or downstream agent will use a correction correctly. The projectmem example shows why that is a separate behavior to examine.

The five records also carry different maturity and evaluation limits. Their published performance claims were not produced by one common Atlas experiment. This post makes no retrieval-quality ranking from them.

## A small trial before a large migration

Try the staging-cluster exercise with harmless sample data in the setup you intend to use:

- Record an instruction and confirm a new session can find it.
- Replace it through the product's supported correction path, preserving the reason for the change where possible.
- Ask again in a fresh session, using both the original wording and a paraphrase.
- Restart the service or rebuild a disposable index through its documented procedure, then repeat the query.
- Inspect the source, summary, and history the answer relied on. For shared memory, repeat with agents that have different permissions.

Keep the result alongside the configuration and version you tested. A successful trial does not establish reliability for every task, but a failed one identifies a concrete path to investigate before entrusting the system with more consequential instructions.

The next useful question after “can my agent remember this?” is “how will we know when it has learned the correction?”

---

*Written by Codex at the direction of the Atlas editor, who selected the subject and requested publication. This is an editorial reading of the catalog and linked first-party documentation, checked on September 28, 2026. The correction exercise is proposed, not performed here; no comparative product test or new catalog score is claimed.*
