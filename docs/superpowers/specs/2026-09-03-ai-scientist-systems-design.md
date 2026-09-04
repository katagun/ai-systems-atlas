# Design: AI Scientist systems route to existing roles

**Date:** 2026-09-03
**Status:** Implemented — see [ADR 023](../../adr/023-autonomous-science-systems-are-not-a-role.md) and the plan at [`docs/superpowers/plans/2026-09-03-ai-scientist-systems.md`](../plans/2026-09-03-ai-scientist-systems.md)

> **One correction, recorded rather than rewritten.** This design specified `source_model: proprietary` for Kosmos. `scripts/validate_directory.py` makes that value unreachable alongside the Apache-2.0 client this same design requires, and the record was published as `mixed_source` on the `seekrflow` precedent. Read every statement below that Kosmos "has no source" as *publishes no source for the system itself* — the loop, the world model, the agent — while shipping an open client library. The arguments are unaffected; the classification is not.

## Problem

Autonomous scientific-discovery systems — "AI Scientist" systems — have no representation in the Atlas and no recorded position. Three questions sit behind that.

1. **A suspected coverage gap.** No reviewed record answers "which system autonomously conducts research and produces findings." Nothing in `directory/` mentions Edison Scientific, Kosmos, FutureHouse, Google's Co-Scientist, Microsoft Discovery, or Elicit.
2. **A suspected review error.** [`directory/exclusions.json`](../../../directory/exclusions.json) carries a September 2026 cluster of this exact class — The AI Scientist, The AI Scientist-v2, Darwin Gödel Machine, ALE-Agent, ALE-Bench, TreeQuest, HyperAgents, Dr. Zero. Several rest heavily on absent tests, absent continuous integration, and absent releases, none of which appears among the five conditions of the inclusion gate in [`docs/CURATION.md`](../../CURATION.md).
3. **A category about to grow,** with no written position to stop the next sweep re-litigating it.

## Evidence

Three screening sweeps ran on 2026-09-03. Every load-bearing claim below was re-fetched and verified independently of the sweep that reported it.

### Shipped products

| Product | Owns the loop | Loop closes on | Adoptable | Terms |
|---|---|---|---|---|
| Kosmos (Edison Scientific, Inc.) | yes | analysis code it writes and executes over user-supplied datasets | hosted run, $200/run published | ToS and Privacy effective 2025-10-30; `edison-client` Apache-2.0 on PyPI |
| Microsoft Discovery | yes | HPC and physical instruments under human oversight | GA 2026-06-02; Windows app and REST API | **none findable**; pricing page renders `$-` |
| Google Co-Scientist | yes | its own agents' tournament ranking | interest form behind a sign-in wall | none product-specific |
| FutureHouse platform | — | — | **no longer exists** | — |

`platform.futurehouse.org` returns 301 to `platform.edisonscientific.com`, and the FutureHouse cookbook returns 307 to `docs.edisonscientific.com`. Both verified directly. FutureHouse retains Apache-2.0 source only: `paper-qa`, `aviary`, and `ldp` are actively released; `robin` — the repository that actually carries the discovery claim — has zero releases, no tests directory, and no commit in roughly four and a half months.

### Published pipelines

Six screened. **Zero have continuous integration. Zero have a release or tag.** One has tests (`jennyzzt/dgm`, two modules covering only its bash and edit tools). One is installable (`zou-group/virtual-lab`, PyPI 1.2.0, MIT).

Two findings matter more than the aggregate.

**`gomesgroup/coscientist` is not the system in its Nature paper.** The published tree is 21 entries, mostly result CSVs. Its entire code is three files whose complete tool set is `eval()`, `random.randint()`, and a stop command; the shipped demo task string is `"Generate random number and calculate it's square toot"`. There is no instrument control, no liquid handler, and no search anywhere in the tree. The README's only disclosure is the word "simple" in a directory name. This fails inclusion-gate conditions 1 and 3: the claimed behavior cannot be assessed from what was published.

**The maintenance axis and the loop axis point in opposite directions.** The one properly packaged and recently maintained candidate, Virtual Lab, ships a library that exports `Agent` and `run_meeting` — an agent *meeting simulator*. Its nanobody discovery loop was human-run SLURM scripts copied out of a notebook by hand. The four candidates that genuinely own an autonomous loop are all unpackaged research code.

Both Sakana repositories relicensed from Apache-2.0 to the bespoke, use-restricted "AI Scientist Source Code License v1.0" on 2025-12-19. The two LICENSE files are byte-identical (SHA1 `96261369ee1370f7bc524c08655d1f2296d6c250`).

### Boundary probes

ALE-Bench executes code in Docker as its core function; OpenAI's Deep Research runs a Python tool; Elicit advertises bioinformatics analysis. **A test keyed on "executes code" separates none of them.** What separates them is who owns the loop: in ALE-Bench and TreeQuest the caller supplies the model call and the scoring function, which is the test the TreeQuest exclusion already states in the Atlas's own words — "The question is who owns the loop."

## Decisions

### 1. No new role. ADR 023 declines the category.

A three-part boundary test was derived from the evidence — owns the loop, closes on a measurement it did not author, and something is adoptable — and then refuted. It is not adopted. Four reasons, each decisive on its own.

**ADR 011 governs and forbids it.** [ADR 011](../../adr/011-delegated-work-agents-are-agent-systems.md) is the only ADR that has ever minted an agent-family role, and it set the condition for the next one: "Future vertical work-agent roles require a coherent comparison set rather than one prominent product." The comparison set here is one. Kosmos publishes; Microsoft Discovery cannot (§5); Co-Scientist has nothing to adopt; every other candidate is either already excluded or fails the test it was built from. [`docs/COVERAGE.md`](../../COVERAGE.md) states the same rule one tier up: "Do not add a new family merely to fit a famous product."

**The role's distinguishing fact is already published under an existing role.** PRAXIST is published as `research_agent`, described as running "executable evaluations," and its `why_it_matters` reads "centered on falsifiable, computer-executable evidence." That is the proposed test's second condition, already in the catalog, in the role the proposal claimed could not hold it. [`AGENTS.md`](../../../AGENTS.md) also makes the general form of this a hard rule — "Architecture, retrieval, deployment, and agent traits are not primary roles" — and the mechanism is carried today by `agent_capabilities` and `execution_boundaries`. [ADR 018](../../adr/018-operating-party-is-a-trait-not-a-role.md) and [ADR 019](../../adr/019-authoring-surface-is-a-trait-not-a-role.md) reached the same conclusion on the same reasoning for two other candidate roles.

**The test convicts the inspectable and acquits the opaque.** "Closes on a measurement it did not author" was verified for Sakana by reading its source and falsified for Agent Laboratory by reading `get_score()`, which prompts a model as "an expert reward model" and parses the float it writes about its own output. Kosmos has no source, so for the single record the role would hold, the condition could only be established from the vendor's assertion about its own internals. [ADR 007](../../adr/007-licenses-are-classification-not-inclusion.md) makes `research_confidence` and evidence kind the remedy for unequal inspectability; a boundary gate that turns on source availability inverts it, and would refuse a peer-reviewed system while admitting a preprint-backed closed one.

**The class was already swept.** [`docs/COVERAGE.md`](../../COVERAGE.md) batch 36 — "Self-improving harnesses, asked for by name and mostly absent" — screened this territory, excluded nine, and deliberately routed its best-evidenced member, ShinkaEvolve, into `agent_framework_sdk` on the DSPy precedent. A new role would either reopen that recorded call without ADR-grade argument, or mean "autonomous scientific discovery, except the instance the Atlas actually verified."

### 2. What ADR 023 states as the condition for revisiting

The decline is not permanent, and the ADR says what would reopen it: three or more systems that each pass the full inclusion gate in [`docs/CURATION.md`](../../CURATION.md), whose shared operational outcome is named by no existing role, and whose distinguishing property is establishable from first-party evidence without reading source — so the boundary applies equally to open and closed systems. Absent all three, records route to existing roles.

### 3. Publish Kosmos as `research_agent`

One record, on the PRAXIST precedent. Constraints the review must honor:

- `system_family` `agent_system`, `primary_role` `research_agent`, `score_profile` `agent`, `repo` `null` — forty published records already carry a null repo, so no schema change is needed.
- `source_model` `proprietary`; `licenses` records the governing product terms, with the Apache-2.0 `edison-client` recorded at its own component scope. Terms evidence is non-Git and therefore labeled mutable, with its 2025-10-30 effective date.
- **`task_reliability` may not be scored from the vendor's own discovery claims.** The seven claimed discoveries appear only in a vendor-authored arXiv preprint with no peer review, and the vendor's own text notes that one target preprint predates the model training cutoff. Score the documented product controls; record the evidence limitation in `weaknesses` and in `research_confidence`, which is expected to be `medium` or lower.
- The record's description names the product boundary against Edison's sibling agents (Literature, Analysis, Precedent, Molecules), which share the platform and terms but are distinct products.

### 4. The exclusions are not edited

No defect was found. The TreeQuest entry already states the loop-ownership test in the Atlas's own words, and ALE-Bench turns on the benchmark boundary. The Sakana and Darwin Gödel Machine entries turn on producthood — [`docs/CURATION.md`](../../CURATION.md)'s "non-operational research inputs" — which the evidence sustains: no releases, no continuous integration, no installable package, and package source untouched since April 2025 and October 2025 respectively.

The original concern was sound and its answer is recorded rather than acted on: the hygiene facts those entries cite are maturity evidence, and they are legitimate *evidence for* the producthood conclusion rather than a separate gate. Exclusion entries carry no `decided_at` and no revision field, so retroactively re-narrating a dated human conclusion would be unreviewable outside Git history and would cut against the evidence-integrity rule in [`AGENTS.md`](../../../AGENTS.md).

### 5. Microsoft Discovery and Google Co-Scientist go to Watching

Neither can be published, and neither is waiting on work in this repository.

- **Microsoft Discovery** fails inclusion-gate condition 4: no product-specific terms exist on any first-party page and the published price renders `$-`. The precedent is the Xinference hold — revisit when commercial terms are published.
- **Google Co-Scientist** has nothing a reader could adopt: an interest form behind a Google sign-in wall, or an enterprise request through an account team, with no published price. The precedent is the ALE-Agent exclusion reasoning and the Meta "Harness" hold. Peer review in *Nature* is evidence of capability and not of an operational boundary; the two questions are independent.

### 6. One new coverage item

FutureHouse's platform has transferred to Edison Scientific, and `Future-House/paper-qa` — Apache-2.0, thirty-plus releases, a tests directory, and commits within the last month — has never been screened. That is a genuine coverage finding independent of this decision and belongs in the queue on its own evidence.

## What changes

| File | Change |
|---|---|
| `docs/adr/023-autonomous-science-systems-are-not-a-role.md` | New. The decline, its four grounds, and the revisit condition. |
| [`AGENTS.md`](../../../AGENTS.md) | One routing-table row pointing family/role questions at ADR 023. |
| [`docs/TAXONOMY.md`](../../TAXONOMY.md) | One sentence beside the existing ADR 022 note: autonomous-science systems route to existing roles. |
| [`docs/CURATION.md`](../../CURATION.md) | One paragraph in "Scope boundaries," in the style of the vertical-agent test, stating where these records go and why the mechanism is a trait. |
| `directory/projects.json` | One record: Kosmos. |
| `directory/license-evidence.json` | Terms evidence for Kosmos, labeled mutable with its effective date. |
| [`docs/COVERAGE.md`](../../COVERAGE.md) | Recomputed counts, a batch note, and the research-agent row's coverage signal. |
| [`docs/RESEARCH.md`](../../RESEARCH.md) | Batch rows for the screened candidates and their lessons. |
| [`BACKLOG.md`](../../../BACKLOG.md) | Two Watching items, one coverage item; no "Now" item. |
| [`ROADMAP.md`](../../../ROADMAP.md) | The "Later" section notes the category as decided, beside the ADR 022 sentence. |

No taxonomy vocabulary changes. No validator, updater, schema, finder, or web changes. `web/*.json` is regenerated by `scripts/sync_web_data.py`, never edited.

## Verification

The full command list in [`AGENTS.md`](../../../AGENTS.md) runs before completion, and no check may be reported as passing unless it was run. Specifically: `sync_web_data.py` and `build_share_pages.py` after the `directory/*.json` edits, then `validate_directory.py`, the unittest suite, and the documentation tests — [`tests/test_documentation.py`](../../../tests/test_documentation.py) asserts that relative Markdown links resolve, which this spec and the new ADR must satisfy. The published record is then exercised in a browser: role filter, detail dialog, share page, and the finder handoff.

## Risks and what this does not decide

- **A reader looking for "an AI scientist" finds one record under a research-agent label.** That is the honest state of the class: one shipped product clears the gate today. The ADR's revisit condition is what converts a growing class into a role rather than leaving it to be re-argued.
- **Kosmos's score rests on documented controls, not on outcomes.** A product whose claimed outcome is discovery, evidenced only by its own preprint, cannot have that outcome scored. This is stated in the record rather than hidden in a number.
- **`task_reliability` remains the weakest dimension for this record** at 20% of the profile. If review concludes it cannot be scored honestly at all, that is a finding to bring back, not to paper over.
- **Not decided here:** whether `paper-qa`, `aviary`, `ldp`, or ShinkaEvolve's recorded role should change; the skill-pack question; and whether the Atlas ever wants a collection for systems whose evidence is a scientific claim rather than an artifact.
