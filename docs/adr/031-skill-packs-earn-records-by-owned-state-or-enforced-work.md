# ADR 031: Skill packs earn records by owned state or enforced work

**Status:** Accepted

## Context

A pack is a repository a host agent runs: a skills bundle, a plugin, a prompt-and-process kit, a vault bundle. The queue produces them constantly, and the catalog has been deciding them case by case without a written rule.

It has decided them both ways. `obra/superpowers` is excluded at 280,000 stars because "its session hook only reads a skill document and prints it as additional context"; `softaworks/agent-toolkit` and `alirezarezvani/claude-code-tresor` are excluded as instruction bundles, the second with the closest thing to a rule the repository had: "The test is whether an engine, retrieval path, or persistence layer exists outside what the host agent already provides." Meanwhile `hyperresearch`, `claude-obsidian`, `obsidian-second-brain`, `smart-second-brain`, `ecc`, `gstack`, `oh-my-openagent`, and `vibecode-pro-max-kit` are published, several of them packs a host agent runs.

`BACKLOG.md` reserved the question, and [ADR 020](020-derivative-records-turn-on-operational-boundary.md) refused to answer it in passing: "Whether a plugin, skill pack, or harness extension earns a record is reserved by `BACKLOG.md` as a deliberate question, and settling it as a side effect of the derivative rule is exactly what that item exists to prevent." This record settles it directly, which is the condition that reservation set.

Five candidates wait on it: `browser-use/video-use`, `coleam00/second-brain-starter`, `FailproofAI/failproofai`, `Gentleman-Programming/gentle-ai`, and `davepoon/buildwithclaude`.

## Decision

A pack earns a scored record when it **owns state** or **does enforced work**. Otherwise it is a document collection executed by the host, and it belongs in `directory/exclusions.json`.

**Owned state.** The pack maintains a durable artifact that it reads back to change its own later behavior: a memory it rewrites, an index it queries, an append-only ledger. Where the file lives does not decide this. A vault of Markdown in the user's own directory counts when the pack maintains and re-reads it, and a file inside the pack's own directory does not count when nothing but a host agent ever reads it.

**Enforced work.** The pack acts at runtime in a way the host would not otherwise act: it denies or rewrites what the host is about to do, or it carries out the work itself through code it ships rather than instructing the host to do it. The distinction is who executes: a pack that tells a host to run a command is documentation, and a pack whose own program runs is doing the work. Recording what a host did is observation, not enforcement, and never qualifies a pack on its own.

### The evidence is a file in the repository, not a sentence in the README

This is the operative half of the rule, and without it the prongs decide nothing.

A reviewer accepting a pack must be able to name the shipped artifact that satisfies the prong: the indexer, the store and its schema, the hook or policy file that returns a denial, the script that does the work. A README that claims memory, enforcement, or persistence is a claim about the pack, not evidence of it, and the catalog has already been wrong in that direction — `Agent Laboratory` reads as a system that measures until you open the evaluator.

Two consequences follow. A pack whose only durable artifacts are prose that a host writes and later reads as context has no owned state, however the README describes it; the host is doing the reading, and the pack is the documentation it read. And bypassability does not disqualify enforcement: a hook a user can disable still denies tool calls while installed, and `ecc` is published with that limitation recorded in its own weaknesses. What disqualifies is the absence of a deny path in the shipped code.

### A pack that both watches and intervenes is recorded for the intervention

`FailproofAI/failproofai` pitches "Observability and enforcement for every harness your agents run in" in one sentence. The observation half is the shape the catalog excludes — `AgentOps-AI/agentops`, `chirpz-ai/pandaprobe`, and `langchain-ai/langsmith-sdk` are all excluded because "the agents it records are the operational systems; this product watches them." The enforcement half is a pack acting on the host.

A product that does both is reviewed for what it enforces. Its telemetry belongs in prose and never earns the record by itself, so a pack that only watches stays excluded, and the three observability exclusions stand unchanged.

### The rule's first test caught a mistake in the drafting of it

`vibecode-pro-max-kit` looked like the record this rule would evict. Its `canonical_data` is "Markdown plan, spec, and progress files written into the target repository", its architecture is `plain_files`, it is the only `coding_agent_workflow` record without `persistent_state` among its capabilities, and its two top-level scripts are distribution machinery — one resolves a manifest of file patterns, the other computes a sync plan and says of itself, "No side effects — reads files, never writes." A reviewer working from the record, and a skeptic briefed to attack this rule using the repository alone, both concluded it fails each prong.

The repository says otherwise. The kit ships ninety-two executable files, among them a browser skill whose scripts drive Chrome directly to navigate, click, fill, and screenshot, and around forty validators its skills invoke. Its own program runs; it does not only tell a host to run one. It holds its record under the second prong.

Two things follow, and both are the reason the evidence rule is written the way it is. Record prose is not evidence either: `plain_files` and a canonical-data line describing Markdown artifacts survived a review of a repository that ships a Chrome automation library. And the pack that best fits the excluded shape on paper can fail that shape on disk, which is why a reviewer opens the repository before deciding.

The record is re-reviewed to correct what it claims this kit keeps and does, not to remove it.

## Alternatives considered

**Whether the pack supervises the host or is run by it.** `BACKLOG.md` proposed this phrasing, and it is a better description of the question than of the answer. Superpowers supervises: its hook injects a skill document into every session, and its plugin manifests cover eight hosts. The rule that readmits the repository this catalog excluded at 280,000 stars for shipping no machinery is the wrong rule, and "supervises" also covers packs that only configure a host, which is installation, not operation.

**Any durable store counts.** Mechanically simple, and it reopens the observability exclusions decided days earlier: a tracing platform keeps a database too.

**No pack executed by a host earns a record.** The cleanest line to apply, and it evicts `ecc`, `gstack`, `hyperresearch`, and `claude-obsidian`, each of which owns machinery a reader is genuinely choosing.

## Consequences

- `docs/CURATION.md` states the rule in its scope boundaries, where the reviewer reading about frameworks and SDKs will meet it.
- The five held candidates get dispositions, and `vibecode-pro-max-kit` gets a re-review, in a follow-up pull request rather than this one.
- Packaging formats are unaffected: `agent-skills`, `agent-plugins`, `claude-code-plugins`, and `claude-md` remain Specifications, which describe how a pack is authored and never whether one is a system.
- A triage proposal may cite this rule, but accepting it stays a human act under [ADR 024](024-candidate-triage-proposals-are-unaccepted-evidence.md).
- The rule asks a reviewer to open the repository rather than read its README. That cost is the point: every case this catalog decided wrongly in this area was decided from a tagline.
