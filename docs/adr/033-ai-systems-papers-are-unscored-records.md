# ADR 033: AI systems papers are unscored records

**Status:** Proposed

## Context

The scored catalog's systems are built on knowledge in these papers. MemGPT is a memory system's paper; RAG and Lost in the Middle are the retrieval the catalog's systems run; ReAct, Toolformer, and Generative Agents are the tool-use, orchestration, and context work under agent systems. A reader who lands on mem0, letta-code, or claude-code meets a system whose provenance is a paper, and the catalog today cannot answer which paper that is, or which recorded systems a given paper built.

Nothing answers the reader because the rules route this material to a rejection note. [ADR 021](021-the-research-reference-role-is-removed.md) removed the `research_reference` role, and `docs/CURATION.md` reserves `directory/exclusions.json` for "non-operational research inputs". Both statements are right about the scored catalog. Neither lets a paper be discovered.

The house has a shape for artifacts that matter to selection but are not systems: [ADR 008](008-specifications-are-unscored-artifacts.md) made specifications an unscored collection on that reasoning, and ADR 010/012, ADR 015, ADR 025, and ADR 032 followed it for inference services, local runtimes, models, and agent packs. [ADR 022](022-general-pattern-content-is-not-a-collection.md) refused a pattern collection only because pattern content has no single steward or reviewable artifact, and it explicitly left the mechanism open: "A future artifact with one authoritative steward and a real reviewable specification remains eligible for the specifications collection or a similarly-shaped new one." [ADR 021](021-the-research-reference-role-is-removed.md) reserved it for reference material outright: "Publishing reference material stays possible. It would need its own collection under the ADR 008 pattern, with its own record and its own reasons."

A paper has the evidence shape ADR 022 found missing in pattern content: one authors' artifact, one authoritative record, one venue. The primary end user wants the important papers discoverable beside the systems they underpin.

## Decision

`directory/papers.json` is a sixth collection in the [ADR 008](008-specifications-are-unscored-artifacts.md) shape: no `system_family`, no `primary_role`, no score profile, no score, no popularity ranking, no stars. The envelope is `{"version": "1.0", "verified_at": <ISO date>, "papers": [...]}`.

**1. Justification.** The scored catalog's systems are built on the knowledge in these papers, and the primary end user wants the important papers discoverable beside the systems they underpin. Papers are the one reference shape [ADR 022](022-general-pattern-content-is-not-a-collection.md) explicitly left open — a record with a single authoritative steward and a single reviewable artifact — and [ADR 021](021-the-research-reference-role-is-removed.md) explicitly reserved the ADR 008 mechanism for reference material: "It would need its own collection under the ADR 008 pattern, with its own record and its own reasons."

**2. The inclusion boundary.** A record is a primary research paper whose contribution concerns memory, agent, or assistant systems, or the infrastructure the catalog's systems are built on: retrieval, tool use, orchestration, context management, and evaluation of these. Surveys and pattern syntheses are excluded in the first pass, on the [ADR 022](022-general-pattern-content-is-not-a-collection.md) evidence-shape lesson — a survey is the natural home of figures presented beside an untraceable citation. Benchmark *artifacts* without a primary research paper — leaderboards, benchmark indexes, evaluation collections with no paper of their own — are excluded on the same grounds. A primary research paper that *introduces* an evaluation benchmark (AgentBench, SWE-bench) is a paper about evaluating agent systems and stays in scope under "evaluation of these"; the exclusion targets the artifact, not the paper. Both exclusions are boundary decisions that may be revisited on their own terms; they are not judgements on the excluded artifacts themselves.

**3. The evidence rule.** The paper's authoritative DOI/arXiv record and venue are the pinned artifact. A record describes the paper and its relevance to the catalog's systems; it never re-derives or re-measures the paper's results, which is the [ADR 022](022-general-pattern-content-is-not-a-collection.md) failure mode. Each record carries the arXiv identifier and version and the publication venue, and pins the arXiv abstract page (and the DOI when available) as evidence. A companion repository the paper names is pinned as additional evidence when it exists — some papers ship code (`zhengkid/Dream-RSI` is a paper repository whose code release is still pending), and the reader's question includes where the code lives — but a companion repository never makes the paper a system candidate: reference code without a release, package, or maintained run path is a non-operational research input under `docs/CURATION.md`, and that judgement is unchanged.

**4. The licensing posture.** Papers have no `source_model`. Record the arXiv distribution licence and publisher terms per record without classifying open or closed, and use a `license_note`-style statement rather than taxonomy license identifiers where the paper carries no standalone license.

**5. The significance standard.** A paper enters on an editorial ecosystem-significance judgement in the `docs/COVERAGE.md` sense: does it underpin the kind of systems this catalog records? Never popularity, citation counts, or benchmark rank. The collection is unscored and never sorted by popularity.

**6. Relationships.** `related_systems` links to published `projects.json` records — mem0, letta-code, camel, autogen, swe-agent, openhands, claude-code — so a paper points at the catalog systems built on it. A relationship aids navigation and is never an endorsement or compatibility claim, the same rule specifications and packs follow.

**7. Placement.** Papers join the Directory as a sixth scope under [ADR 013](013-distinct-collections-share-one-directory-surface.md), mirroring the Packs placement: alphabetical scope, search and filters, detail dialog, score-free share pages, no Finder goal, no comparison ([ADR 014](014-comparisons-are-scoped-to-one-score-profile.md)), no card badges.

## What this does not change

- **ADR 021 stands.** The `research_reference` role stays removed. This is a collection, not a role, and the validator still refuses `system_family` or `primary_role` on a paper record.
- **ADR 022 stands.** General pattern content is still not a collection; this decision is the one shape ADR 022 left open, not a reopening of it.
- **The scored catalog is untouched.** No `projects.json` record changes, and paper records never enter `projects.json`.
- **`exclusions.json` is untouched.** A paper reference is not a system candidate; nothing this collection records moves from or into exclusions on these grounds, and the exclusions decided on the `docs/CURATION.md` scope sentence stand.
- **No new score profile exists or is planned.** Papers are not comparable with systems, inference services, local runtimes, or models, and no cross-profile ranking is possible.

## Alternatives considered

**A `research_reference` role inside `memory_system`.** Rejected: [ADR 021](021-the-research-reference-role-is-removed.md) removed it, and the validator requires a score whose keys match the family's profile exactly, so a survey published this way would have to carry a second-brain-fit number and a memory-intelligence number.

**Folding papers into `specifications.json`.** Rejected: a paper is not a reusable contract with normative detail for independent implementation, which `docs/SPECIFICATIONS.md` requires.

**A blog post.** A complement, not a substitute: a post carries no evidence schema and no review date, and posts are not published as JSON.

**Including surveys in the first pass.** Rejected under the boundary above: the ADR 022 evidence-shape lesson applies to the survey shape itself, and revisiting it is a boundary decision the collection may take up on its own terms.

**Recording papers only in `exclusions.json`.** Rejected: an exclusion is a reason to leave, not a discoverable record with evidence, and the reader's question needs arXiv identity, venue, and relationships that exclusions do not carry.

## Consequences

- A new canonical file `directory/papers.json` is published to `web/`: a row in the canonical and published data table in `docs/DATA_MODEL.md` and an entry in `PUBLISHED_DATA` in `scripts/sync_web_data.py`.
- A taxonomy `paper_type` group is added, and the validator, `sync_web_data.py`, `build_web_payload.py`, `build_share_pages.py`, and `build_asset_version.mjs` each gain a row for the collection.
- `docs/PAPERS.md` carries the inclusion boundary, evidence workflow, licensing posture, and significance standard.
- `docs/DATA_MODEL.md`, the `docs/COVERAGE.md` snapshot, `docs/TAXONOMY.md`, `docs/WEB.md`, `ROADMAP.md`'s ecosystem-context section, and the `AGENTS.md` just-in-time table are updated to name the collection.
- `docs/AGENT_DOCS.md`'s one-commit rule for published files applies: the published file, `llms.txt`, and the API view change in one commit.
- Initial curation batches are in `BACKLOG.md`: batch 1's ten foundational records (Attention Is All You Need, GPT-3 few-shot learning, RAG, InstructGPT, ReAct, Chain-of-Thought, Reflexion, Generative Agents, MemGPT, Toolformer) and batch 2's catalog-anchoring records (CoALA, Voyager, AutoGen, CAMEL, HuggingGPT, Lost in the Middle, Self-RAG, SWE-agent, AgentBench, SWE-bench).
