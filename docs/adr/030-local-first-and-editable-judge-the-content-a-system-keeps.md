# ADR 030: Local-first and editable judge the content a system keeps

- Status: Accepted
- Date: 2026-09-14

## Context

`local_first` and `human_editable` are boolean traits on every system record. They drive the Local-first and Editable by you card badges, the Local-first filter, the comparison table's Local-first row, and three Finder priorities, where a true `local_first` adds 3 to a match score that the data-sovereignty dimension can move by at most 1. Until [#150](https://github.com/katagun/ai-systems-atlas/pull/150) neither had a written definition, and records set before then applied them unevenly.

The re-review in [#154](https://github.com/katagun/ai-systems-atlas/pull/154) found three cases the new wording did not decide. A skeptic reading only the repository then showed that the obvious settlements were worse than the gaps:

- Reading `local_first` as storage only kept Cursor, Claude Code, Google Antigravity, and Devin Desktop true, but left the tooltip's "any vendor cloud is optional" false for every one of them, and gave the Local-first badge to products whose vendor keeps interaction data or trains on it by default.
- Judging every library by its default network behaviour would have meant auditing 41 records with `library` deployment, and flipping them would take agent systems from 60% to about 82% local-first and memory systems from 56% to about 79%, past the 10–75% range [`docs/WEB.md`](../WEB.md) sets for a badge that separates cards.
- Counting settings in `human_editable` let configuration stand in for editing stored content, and did not say whether an API edit endpoint or an integrator's own source code counts.

## Decision

### Local-first asks where the kept content lives and whether the vendor keeps it

`local_first` is true only when, by default, the working copy of the content the system keeps — files, notes, memory, sessions, conversation history, run state — lives on hardware the user controls, including servers they operate; the vendor stores none of that content beyond serving a request and bounded retention for abuse or safety monitoring, and does not use it for training; and vendor-hosted storage such as sync, cloud sessions, or remote indexes is opt-in.

Sending requests to a remote model does not by itself make a system false; how much leaves the device is a data-sovereignty or data-governance judgement recorded in scores and weaknesses. Vendor storage does: default training use, default recording of interactions, and default telemetry that carries content — prompts, outputs, conversation or run state — each make it false. Content-free usage analytics does not.

Changing a value needs a first-party statement of the default. Where the vendor's default is unstated, the record keeps its value and the gap belongs in weaknesses.

### A library is local-first only when it writes its own data locally

A library or framework whose storage the application chooses is false unless the library itself writes its data to local disk by default, as AdalFlow, OpenEvolve, and ShinkaEvolve do. One that keeps nothing of its own has no main data to keep local.

The rejected alternative judged each library by whether its defaults send anything to a vendor. It is defensible, but it costs an evidence review of every library record, blurs the badge inside the agent family, and still leaves a badge that says a library "keeps your data" when it keeps none. A third state for records with nothing of their own was also considered: validation accepts only booleans and the comparison table prints "No" for anything not true, so it is recorded as a follow-up rather than adopted here.

### Editable counts stored content a person changes without writing code

`human_editable` is true only when a person can change the stored content itself — notes, documents, memories, messages, instructions, or agent and workflow definitions the system stores — without writing code, through files, an editor, or an in-product screen that edits those entries. Configuration alone, delete-only or regenerate-only controls, editing only through an API or SDK, and source code an integrator writes for a library to run do not count.

### Tooltips carry the rule's shape; the data model carries its exceptions

Both badge definitions are rewritten in plain language so that the hover text is true under these rules. [`docs/DATA_MODEL.md`](../DATA_MODEL.md) quotes each one verbatim and states the rules above, and a test in `tests/test_web.js` fails if the quote and the badge definition drift apart.

## Consequences

- Google Antigravity becomes not local-first. Its terms state "When you use the Service, we record and store your user data, interaction data pertaining to your usage of the Service, related metadata connected to the Service, and any feedback you provide", and its settings only change how that data is used.
- Devin Desktop becomes not local-first. The former Windsurf security page now redirects to Cognition's security page, which states "By default, we may use your data for model training purposes to improve and enhance the Services" and offers the opt-out only on paid plans.
- Claude Code stays local-first: its documentation states that clients "store session transcripts locally in plaintext under ~/.claude/projects/", retention for accounts that do not allow model improvement is 30 days, and no first-party page establishes training by default. Cursor stays local-first: Cloud Agents, "the only feature that requires Cursor to store code", are optional, and its pages do not state the Privacy Mode default for individual accounts.
- Three library records change under the library rule. smolagents becomes neither local-first nor editable: agent memory is an in-process list of steps, and it writes files only when the application calls `save` with a directory it chooses. A-MEM becomes not local-first: its memory system builds an in-memory Chroma client and resets it on start, so nothing it keeps outlives the process. Claude Agent SDK becomes local-first: `persistSession` defaults to true and resumes sessions from disk, Anthropic deletes API inputs and outputs within 30 days, and its commercial terms state that it "may not train models on Customer Content from Services".
- Memobase stays editable: its first-party Inspector edits stored user profiles in a form, so editing is not limited to the API.
- Records these rules put in doubt but that were not reviewed here move to the unsampled trait sweep in `BACKLOG.md` rather than being flipped from their own prose: library records whose editability rests on integrator code, assistants whose only editable content is chat history, self-hosted database records marked false despite running on operator servers, device-held assistant histories, and records with content-carrying telemetry.
- The Finder's 3-point `local_first` boost against a data-sovereignty contribution of at most 1, and the agent Finder label that promises local execution, are unchanged here and tracked as follow-up work.
