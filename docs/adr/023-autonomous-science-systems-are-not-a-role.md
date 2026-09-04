# ADR 023: Autonomous science systems are not a role

**Status:** Accepted

## Context

Systems marketed as autonomous scientists — products and repositories that read literature, form hypotheses, run experiments, and report findings without a human driving each step — had no representation in the Atlas and no recorded position. The class is growing, and without a written answer every sweep re-argues it from the same evidence.

A three-bucket screening sweep ran on 2026-09-03: shipped products, published pipelines, and boundary probes against systems that merely execute code. It produced a candidate boundary test, which is named here so a later reader can see exactly what was rejected. A system would have qualified for a new role when it **owns the loop**, when **the loop closes on a measurement the system did not author**, and when **something about it is adoptable**.

That test survived its first contact with the evidence. It separates the two Sakana AI Scientist repositories, whose loops close on metrics parsed from real executed runs, from `SamuelSchmidgall/AgentLaboratory`, whose evaluation is `get_score(...)` — a call that prompts a model as "an expert reward model" and parses the float it writes about its own output. It separates both from the boundary probes, `SakanaAI/ALE-Bench` and `SakanaAI/treequest`, where the caller supplies the model call and the scoring function, which is the distinction `directory/exclusions.json` already draws in the Atlas's own words: "The question is who owns the loop."

It did not survive the second contact. The test is not adopted, and neither is the role, for the four reasons below. Each is decisive on its own.

## Decision

No primary role is added for autonomous scientific-discovery systems. Records in this class are classified by the operational outcome they own, under roles that already exist.

### ADR 011 governs, and its condition is not met

[ADR 011](011-delegated-work-agents-are-agent-systems.md) is the only ADR that has ever minted an agent-family role, and in the same paragraph that refused a catch-all it set the condition for the next one: "Future vertical work-agent roles require a coherent comparison set rather than one prominent product." The comparison set here is one, and the absences are not incidental.

Kosmos, from Edison Scientific, Inc., is the single publishable member: a hosted service that publishes no source for the system itself — the loop, the world model, the agent — $200 per run published, terms of service and privacy policy effective 2025-10-30, and an Apache-2.0 Python client published at its own component scope. Microsoft Discovery is generally available as of 2026-06-02 with an application and a REST API, and its loop reaches HPC and physical instruments under human oversight, but no product-specific terms exist on any first-party page, so inclusion-gate condition 4 in [`../CURATION.md`](../CURATION.md) — authoritative license or terms sources establishing a reviewed source model and a complete licenses list — is not merely weakly met but unmeetable from what the vendor publishes; the published pricing page, which renders a price of `$-`, corroborates that absence rather than constituting the failure. Google Co-Scientist is peer-reviewed in *Nature* as of 2026-05-19, which is evidence of capability rather than of an operational boundary; access is an interest form behind a Google sign-in wall or an enterprise request through an account team, with no published price, so there is nothing a reader could adopt. The FutureHouse platform is gone: `platform.futurehouse.org` returns HTTP 301 to `platform.edisonscientific.com`, and only Apache-2.0 source remains.

The published pipelines fail for their own reasons rather than for a shared one. Both Sakana repositories were relicensed from Apache-2.0 on 2025-12-19 to a bespoke use-restricted license — the two LICENSE files are byte-identical — and carry zero tests, zero continuous integration, and zero releases, with package source untouched since April 2025 and October 2025 respectively; they are non-operational research inputs under `../CURATION.md` and are already excluded on that basis. `gomesgroup/coscientist` is not the system in its *Nature* paper: the published repository is 21 entries, mostly result CSVs, and three code files whose entire tool set is `eval()`, `random.randint()`, and a stop command, which fails inclusion-gate conditions 1 and 3 because the claimed behavior cannot be assessed from what was published. `zou-group/virtual-lab` is the one properly packaged and maintained candidate — MIT, on PyPI at 1.2.0 — but its library simulates agent *meetings*, exporting `Agent` and `run_meeting`, while the discovery loop it is famous for was human-run SLURM scripts. The maintenance axis and the loop axis point in opposite directions across the whole set.

[`../COVERAGE.md`](../COVERAGE.md) states the same rule one tier up, for families rather than roles: "Do not add a new family merely to fit a famous product."

### The distinguishing property is already published under an existing role

PRAXIST is published as `research_agent`, and its `why_it_matters` field reads: "A distinctive research-agent design centered on falsifiable, computer-executable evidence and evolutionary parallel search rather than a single linear report workflow." Falsifiable, computer-executable evidence is the derived test's second condition, already carried in the catalog, in the role the proposal claimed could not hold it.

The general form of this is a hard rule in [`../../AGENTS.md`](../../AGENTS.md): "Architecture, retrieval, deployment, and agent traits are not primary roles." The mechanism these systems share — writing and executing analysis code over supplied data, and in Microsoft Discovery's case reaching HPC and physical instruments — is a capability and an execution boundary, and both are recorded today in `agent_capabilities` and `execution_boundaries`. That is the same grounding [ADR 019](019-authoring-surface-is-a-trait-not-a-role.md) used when it declined a builder role because `agent_interfaces` already modeled the distinction, and it reaches the conclusion [ADR 018](018-operating-party-is-a-trait-not-a-role.md) reached for operating party: a role named after a mechanism is a trait axis wearing a role's name.

### The test convicts the inspectable and acquits the opaque

"Closes on a measurement the system did not author" was established for the Sakana repositories by reading their source, and falsified for Agent Laboratory by reading its `get_score(...)` reward-model prompt. Both verdicts required source. Kosmos publishes none for the system itself — its open client library is a wrapper over the hosted service and says nothing about the loop, the world model, or the agent — so for the single record the role would actually hold, the condition could be established only from the vendor's assertion about its own internals — and the vendor's evidence for its seven claimed discoveries is an arXiv preprint it authored itself, with no peer review.

[ADR 007](007-licenses-are-classification-not-inclusion.md) settled what to do about unequal inspectability, and it is not a gate: "Some proprietary systems will have less inspectable operational evidence; research confidence and evidence kind make that limitation visible." A boundary test that turns on whether source can be read inverts that decision at the classification layer, where `research_confidence` cannot reach it. Applied to this evidence it would refuse the one system with peer review — Co-Scientist's loop closes on its own agents' tournament ranking, with human labs validating afterward — while admitting a closed product on a self-authored preprint. A test that produces that ordering is measuring source availability, not autonomy.

### The class was already swept

[`../COVERAGE.md`](../COVERAGE.md) batch 36, "Self-improving harnesses, asked for by name and mostly absent," screened this territory, excluded nine entries including both Sakana AI Scientist repositories, and deliberately routed its best-evidenced member into an existing role: ShinkaEvolve is published as `agent_framework_sdk` on the DSPy precedent rather than as the workflow its headless mode resembles, and the note records that as the contested call. A new role now would either reopen that recorded conclusion without ADR-grade argument against it, or would have to mean "autonomous scientific discovery, except the instance the Atlas actually verified."

### What would reopen this

The decline is not permanent, and it is not left to be re-litigated on enthusiasm. Three requirements must hold simultaneously:

1. three or more systems that each pass the full five-condition inclusion gate in [`../CURATION.md`](../CURATION.md);
2. a shared operational outcome that no existing role names; and
3. a distinguishing property establishable from first-party evidence without reading source, so that the boundary applies equally to open and closed systems.

Until all three hold, records in this class route to existing roles.

### What this does not change

- **ADR 011 stands.** Its comparison-set condition is applied here, not weakened; a later class that meets it is not prejudiced by this record.
- **[ADR 021](021-the-research-reference-role-is-removed.md) stands.** Nothing here reopens the removed `research_reference` role, and nothing here is a route for publishing papers rather than systems.
- **No existing exclusion is re-narrated.** The entries this sweep re-read were decided on producthood and on the loop-ownership boundary, and the evidence sustains both; the maturity facts they cite are evidence for those conclusions rather than a separate gate.
- **Kosmos is published under an existing role,** on the PRAXIST precedent, with its discovery claims recorded in weaknesses and research confidence rather than scored as reliability.
- **The `research_agent` and `data_analysis_agent` definitions are untouched.** This record decides that no role is added; it does not redraw the ones that exist.

## Consequences

- `AGENTS.md` routes family, role, and boundary questions here alongside ADR 011, ADR 021, and ADR 022.
- `docs/TAXONOMY.md` gains one sentence stating where these systems classify, and `docs/CURATION.md` gains one scope-boundary paragraph stating how to read a discovery claim. Neither restates the rejected three-part test, which is recorded here as refused rather than adopted anywhere as policy.
- No vocabulary changes. `directory/taxonomy.json` is untouched, and no validator, schema, or web change follows: declining a role adds nothing to remove later.
- `scripts/update_directory.py` does change, in one direction only. Its keyword ladder carried no science, discovery, hypothesis, or experiment term, so every description this class actually uses scored zero and was dropped before reaching the candidate queue — the published Kosmos record's own paper title among them. A decision that reconsiders itself at three qualifying systems is worthless if the path those systems arrive by cannot see them, so discovery now routes this vocabulary to `research_agent`, which is what this record decides they are. False positives cost a provisional queue entry a reviewer dismisses; false negatives cost the revisit condition.
- Microsoft Discovery is watched rather than excluded: it did not fail on relevance, and it waits on published commercial terms rather than on work in this repository. Google Co-Scientist reached the same judgment by a different route — it was excluded on availability while this branch was in flight, in the Alpha-lineage sweep recorded as `docs/COVERAGE.md` batch 37, on the reasoning this record also gives: a preview behind an account team is not a boundary a reader can adopt. `BACKLOG.md` carries the watch that promotes it at general availability.
- A future proposal in this class arrives against a written condition and a named, rejected test, instead of a blank page.
