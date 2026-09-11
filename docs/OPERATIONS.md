# Operations

Use this document for refreshes, queue review, synchronization, and incident recovery.

## Routine verification

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/build_share_pages.py
uv run ruff check scripts tests
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
npm run lint:js
```

Synchronization and share-page generation are write operations; the remaining commands are verification.

`ruff` is pinned in the `dev` dependency group and installed by `uv sync`. Its rule set is configured in `pyproject.toml`; `eslint.config.mjs` covers the browser bundle, the build scripts, and the test suites. Both run in `verify.yml`. Ruff enforces the `requires-python` floor, which matters because CI only ever runs one Python version.

## Metadata refresh

```bash
GITHUB_TOKEN=... uv run python scripts/update_directory.py
```

The token is optional locally but recommended because GitHub search has a low anonymous rate limit. Never print or commit the token. Official non-GitHub discovery feeds are allowlisted in `directory/discovery-sources.json` and require no credentials.

The refresh is transactional at the repository level:

1. update live metadata in memory for projects with GitHub repositories;
2. require at least 80% project metadata success;
3. require at least one successful GitHub discovery query and one successful official feed when sources are configured;
4. validate source and redirect hosts before parsing only recent official feed items through bounded, doctype-free XML, launch-signal, and relevance checks;
5. detect license drift, mark evidence `review_required`, and open a durable incident;
6. preserve prior candidates and unresolved license-review incidents;
7. write canonical JSON and synchronize published web copies;
8. validate and test in CI before committing.

Transport failures preserve existing project metadata. `404` and `410` are conclusive and mark a GitHub-hosted project `removed`. Partial official-feed failures are warnings; an all-source failure aborts before writes. Official discovery never fetches article pages; attention-source discovery must, and does so through the hardened arbitrary-host path — see [ADR 028](adr/028-attention-sources-are-pointers-not-claims.md). Automated refreshes never edit editorial fields.

The same run also refreshes GitHub star counts for `directory/local-runtimes.json` records that carry a `repo`. This is a separate, lower-stakes pass: it only ever updates `stars` and `stars_verified_at`, it does not participate in the 80% success gate or license-drift machinery above, and a per-repository failure is a warning that leaves the existing value in place rather than an aborting condition. See [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md).

models.dev discovery is a separate fail-closed import:

```bash
GITHUB_TOKEN=... uv run python scripts/import_models_dev.py
```

It resolves the upstream ref, downloads the commit-pinned repository archive, reads only provider-independent model TOMLs, and normalizes the complete `directory/models-dev.json` source snapshot plus the text-output `directory/model-candidates.json` review queue only after all source, count, schema, and collision checks pass. Run `scripts/sync_web_data.py` afterward so the published snapshot reaches `web/`. The token is optional locally. The importer removes already reviewed `source_id` values from the queue but never edits `directory/models.json`. See [`MODELS.md`](MODELS.md) and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).

## Evidence links and terms drift

The weekly workflow checks the authoritative record URL, every reviewed evidence URL,
every immutable evidence URL, and every license or governing-terms URL across systems,
specifications, inference services, local runtimes, and reviewed models:

```bash
GITHUB_TOKEN=... uv run python scripts/check_evidence_links.py
```

The token is optional, but avoids the low anonymous limit on GitHub API blob URLs. The
checker deduplicates shared URLs, uses eight bounded workers, uses `HEAD` with a bounded
`GET` fallback for ordinary links, retries transient responses and explicit rate limits,
and keeps conditional-request validators in the ignored `.evidence-link-cache.json`. The
scheduled workflow preserves
that file with the GitHub Actions cache. A successful result less than twenty hours old is
reused, so re-running a workflow does not immediately crawl all reviewed sources again.

Mutable `web_terms` evidence receives an additional normalized content hash. HTML page
shells, scripts, styles, navigation, and whitespace are removed before hashing; GitHub and
Hugging Face blob pages are fetched through their stable raw-content routes. The first
successful observation establishes an automation-owned baseline. A later content change
fails the weekly verification and therefore opens or updates the durable
`automation-failure` issue; it never edits the record, its evidence, its source model, its
licenses, or its human-owned dates. `404` and `410` responses fail as broken reviewed
links. Other transport failures are warnings unless fewer than 80% of the current targets
were checked or served from a recent cache.

To resolve terms drift, inspect the authoritative page, update every affected conclusion
and scoped evidence item as needed, and advance every affected human-owned `verified_at`.
On the next scheduled check, a review date newer than the cached baseline accepts the new
hash; use `--max-age-hours 0` to verify that acceptance immediately. If the terms did not
change materially, advancing the evidence date still records that a human reviewed the
new page before the automation accepts it. Repair or replace a
broken URL in the same review. Do not delete the cache merely to make a drift signal pass;
a missing cache establishes new baselines and cannot prove that the reviewed terms stayed
the same.

## Review a candidate

For one record in `directory/candidates.json`:

1. Inspect authoritative license or terms sources and their component scope.
2. Classify `source_model` and record every material license; restricted, mixed, and proprietary systems remain eligible.
3. Read official documentation and enough implementation or product behavior to establish the operational outcome.
4. Follow `CURATION.md` to create the full project and evidence records.
5. Remove the candidate only in the same change that records its disposition.
6. Synchronize, validate, test, and exercise the UI.

Never copy proposed classification into the catalog without human confirmation. Never reuse a provisional candidate as an editorial score.

Provider traits are reviewed during the same workflow. Leave both fields absent when support evidence has not been checked; do not infer provider agnosticism from a plugin interface or community adapter.

## Review a triage batch

`scripts/run_candidate_triage.py finish` commits proposed `triage` blocks to the
`triage/pending` branch in an isolated worktree; it never pushes and never touches `main`
or `origin`. To review a run:

1. See what it proposed: `git log --oneline main..triage/pending` and
   `git diff main..triage/pending -- directory/candidates.json`.
2. Treat every proposal as evidence, never a conclusion. Check the sources a `triage`
   block cites — the pinned `evidence` items and the quoted `finding` — not the `verdict`
   it reached. See [ADR 024](adr/024-candidate-triage-proposals-are-unaccepted-evidence.md).
3. Re-verify the pinned evidence by hand with
   `uv run python scripts/build_candidate_evidence.py --recheck`. It re-fetches each
   citation and fails, naming it, when the URL it cites or the hash it recorded no longer
   matches the document. Run it from a checkout that actually holds the blocks — the run's
   worktree, or `triage/pending` checked out — because `main` holds none and the command
   exits 0 having verified nothing. It re-checks the blocks that differ from
   `origin/main` — the ones this run introduced or changed — and reports how many
   citations it examined, so a run that verified nothing cannot read as a run that
   verified everything. A block already on `origin/main` describes a document as it
   stood when a human accepted it, and re-verifying those would turn ordinary upstream
   drift into a failure no run can clear. Scoping is deliberately not based on
   `proposed_at`: that field is written by the agent being checked, so a back-dated
   block could have skipped verification entirely. To check an older citation, open its
   `immutable_url`, which addresses a blob SHA and cannot change under it.
   Pass `--baseline-ref` to compare against something other than `origin/main`.

The unattended `finish` path validates the queue before any re-fetch and invokes the
rechecker with `--unattended`. That mode accepts only GitHub LICENSE and README blobs
whose request paths are derived from the unchanged candidate repository; it rejects
generic `web` evidence before network I/O. Direct human rechecks retain support for
existing non-GitHub evidence, but require public DNS-backed HTTPS on port 443, keep every
redirect on the original host, reject non-public or multicast resolved addresses, pin the
TLS connection to a validated numeric address while retaining hostname verification, and
cap bodies at 2 MiB. The unattended path also permits each LICENSE and README label at
most once before making any request.

Then, per candidate:

- **Accepting `out_of_scope`:** follow `CURATION.md` — write the exclusion and remove the
  candidate in the same change. The `triage` block is removed with the candidate; nothing
  separate needs deleting.
- **Accepting `held`:** keep the candidate, keep its `triage.held_by`, and record the
  decision in `BACKLOG.md` so the open question stays visible outside the queue.
- **Accepting `review_ready`:** follow "Review a candidate" above, using the block's
  `finding` as research to check against its cited sources, not as a pre-made editorial
  conclusion to copy in.
- **Rejecting a proposal:** *edit* its `triage` block in `directory/candidates.json` to
  record your disposition — do not delete it. The routine never overwrites a block that is
  already there, so an edited block stays exactly as you left it. A deleted one does not:
  the candidate is untriaged again, and the next `prepare` carries the old block back from
  `triage/pending`, because the queue on that branch still has it and the harness cannot
  tell a block a human deleted from one that was never merged. Keeping the block, with
  your correction in it, is what makes a rejection durable. If the proposal is worthless
  rather than wrong, resolve the candidate instead: exclude it, or promote it.

`finish` refuses to commit a run that wrote anything but the two changes the routine is
allowed to make: adding a `triage` block to a candidate that had none, and nulling
`proposed_system_family` and `proposed_primary_role` on a candidate whose new block names
the decision holding it. Every other field of `directory/candidates.json` — a
classification, a confidence, a status — and the membership of the queue itself is human
review's, and a run that touches one aborts naming the candidate and the field. Reviewing
a batch therefore means judging verdicts and evidence, not auditing the diff for overreach.

The harness authenticates with `GITHUB_TOKEN` when it is set and otherwise falls back to
`gh auth token`, so a scheduled run needs no secret stored anywhere. With neither, GitHub
allows 60 anonymous requests an hour against the roughly 80 a default `--limit 40` run
issues, and the run fails on the rate limit before any judgment happens.

To install the routine as a scheduled task, sync `docs/routines/candidate-triage.md` to
`~/.claude/scheduled-tasks/candidate-triage/SKILL.md` and schedule it for Tuesday morning
local time. Scheduled tasks only run while the desktop app is open; a missed run catches
up the next time the app launches, so a run is not guaranteed at the exact scheduled time.

## Review a signal batch

`scripts/run_hn_signals.py finish` commits proposed `assessment` blocks to the
`hn-signals/pending` branch in an isolated worktree; it never pushes and never touches
`main` or `origin`. To review a run:

1. See what it proposed: `git log --oneline main..hn-signals/pending` and
   `git diff main..hn-signals/pending -- directory/hn-signals.json`.
2. Treat every assessment as evidence, never a conclusion. Check the sources an
   `assessment` block cites — the pinned `evidence` items and the quoted `finding` — not
   the `verdict` it reached. See
   [ADR 028](adr/028-attention-sources-are-pointers-not-claims.md).
3. Re-verify a signal's digest by hand with
   `uv run python scripts/verify_signal_pages.py --recheck`. It re-fetches every signal
   whose `page_status` is `readable` and fails, naming it, when the page's current
   content no longer hashes to the recorded `content_sha256` — that catches a vendor page
   that changed underneath the assessment. It walks the sweep's signals and never reads an
   `assessment`, so it is not what stops a fabricated citation. Validation is: an
   assessment may cite only its own signal's pinned page, and an `evidence` entry whose
   `url` or `content_sha256` differs from the signal's is rejected. Together they mean the
   digest this command re-fetches is the digest every citation on that signal carries.

Then, per signal:

- **Accepting `worth_review`:** the assessment is a dossier, not a classification. A
  signal is not a candidate — nothing in this pipeline writes `directory/candidates.json`.
  Follow `CURATION.md`'s review workflow yourself to decide whether the linked page
  describes a system the Atlas should carry, and, if so, create the candidate and carry it
  through review like any other discovery.
- **Accepting `out_of_scope`:** the verdict proposes an exclusion; it is not one. Write the
  exclusion in `directory/exclusions.json` following `CURATION.md`. When the rejected page
  has no GitHub repository — the ordinary case for an attention source — set the
  exclusion's optional `url` to the signal's `url`. The weekly discovery refresh folds
  every exclusion `url` into its known-URL set; without it, the same page can reappear as
  a new candidate the next time an official feed reports it.
- **Accepting `unreadable`:** no page text was ever read, so there is nothing to promote or
  exclude. Confirm `page_status` really is not `readable` and leave the signal as is.
- **Disagreeing with a verdict:** *edit* the signal's `assessment` block in
  `directory/hn-signals.json` to record your disposition — do not delete it.
  `signal_field_changes` in `scripts/run_hn_signals.py` permits a run to add an
  `assessment` only where a signal had none; it rejects any run that changes one that
  already exists. Delete the block and the field goes back to missing, and the next
  routine run reads that as a signal nobody has looked at yet: it proposes a fresh
  `assessment` from scratch, silently discarding your disagreement. Change the `verdict`,
  `finding`, `rule`, or `evidence` in place instead, and set `proposer` to `"human"` —
  this is the one queue whose purpose is holding the line between an unattended proposal
  and a human decision, and a disposition left as `"hn-signals"` is indistinguishable from
  one nobody reviewed. Keep `proposed_at` a valid date and the block otherwise
  schema-valid, including its `evidence`, which may cite only the signal's own pinned page
  — a later run then finds a signal that already carries an assessment and leaves it
  alone.

`finish` refuses to commit a run that changed anything but the one thing the routine is
allowed to do: adding an `assessment` to a signal that had none. Every provenance field the
sweep wrote — `story_id` through `discovered_at` — and the membership of the queue itself
belong to the sweep alone; a run that touches one aborts, naming the signal and the field.
Reviewing a batch therefore means judging verdicts and evidence, not auditing the diff for
overreach. These guards compare against `origin/main` by default; see "Running the loop
locally" under "Attention-source sweep" below for the `--from-ref` option that lets
`prepare` build from a local branch instead, and how `finish` still checks the right base
when it does.

To install the routine as a scheduled task, sync `docs/routines/hn-signals.md` to
`~/.claude/scheduled-tasks/hn-signals/SKILL.md` and schedule it for each weekday morning
local time, after the local sweep has run. `prepare` compares the two files and
refuses to run — `error: the routine prompt is not installed` — when the installed copy is
absent or differs, so the first run fails until it is installed and every later change to
the repository prompt has to be re-synced before a run proceeds. Scheduled tasks only run
while the desktop app is open; a missed run catches up the next time the app launches, so
a run is not guaranteed at the exact scheduled time.

## Review an inference service

Follow `INFERENCE_SERVICES.md` and treat the named service—not its company or models—as the review unit. Review product documentation, data controls, and governing terms together. Keep endpoint-, model-, region-, feature-, and contract-specific exceptions in prose. Synchronize and verify the complete catalog, then exercise inference-service search, filters, and details in the browser.

Do not copy prices, rate limits, model leaderboards, or exhaustive model inventories into the editorial record. A model offered by several services remains one model behind several operational and contractual boundaries; it does not merge those service records.

## Review a model candidate

Follow [`MODELS.md`](MODELS.md) and treat one provider-independent release—not a lab, model family, hosted endpoint, or repackaging—as the review unit. Verify the official identity, boundary, every governing distribution term, source model, distribution modes, evidence, and `model_access` score. Treat every models.dev field as attributed discovery metadata until first-party evidence supports the Atlas conclusion. Remove the candidate only in the same change that publishes or otherwise disposes of it, then synchronize, regenerate share pages, verify, and exercise Models search, filters, comparison, URL restoration, and details.

For publication, scaffold a review draft with `scripts/promote_model_candidate.py init`, fill its deliberately blank human-owned fields, run `check`, and only then run `apply`. The command validates the complete proposed model collection and remaining queue before it writes. It preserves the imported metadata and queue snapshot, requires exact pinned-source and authoritative-model evidence, and refuses incomplete licensing, scoring, dates, taxonomy, or identity. The exact command sequence and guard contract are in [`MODELS.md`](MODELS.md).

Never copy models.dev benchmarks or prices. Never convert its `license` or `open_weights` field directly into a reviewed Atlas license or source-model classification.

## Resolve a license review

Inspect the authoritative license or terms sources again; GitHub's detected SPDX value is only the trigger.

- Update `licenses` and `source_model` when the reviewed scope changed.
- Replace or extend scoped evidence, set `license_review_status` to `verified`, and remove the incident.
- If scope remains unclear, keep the project visible with its last reviewed classification, retain `review_required`, and explain the uncertainty in the incident and project weaknesses.
- Move a project to exclusions only when the operational family/role boundary—not its license—fails review.

Resolution must update all related records atomically. Validation rejects mismatches between project review status and the license-review queue.

## Scheduled workflow

`.github/workflows/update-directory.yml` runs weekly and on demand. It refreshes system/runtime metadata, the complete public models.dev source snapshot, and both candidate queues; synchronizes the public data again after the model import, regenerates payloads and share pages, checks reviewed links and mutable terms, verifies the result, then opens or updates `automation/directory-refresh`. It never commits directly to the default branch. Review license incidents, evidence-link or terms-drift signals, candidates, model candidates, and the CI result before merging.

Verification is reported, not fatal. Every check runs even after an earlier one fails, so a single broken record cannot hide the rest, and the branch is pushed either way. A refresh that fails verification opens its pull request as a **draft** titled `(verification failed)`, carrying the per-check results and a link to the run. Repair the branch and push; the next run promotes it out of draft once the catalog verifies. The job itself still fails, so the run stays red.

This is deliberate: a crawl costs an hour of live GitHub and feed reads, and discarding it because two records disagree with an editorial invariant means waiting a week. The fail-closed gate belongs on merging into `main`, which branch protection already enforces — not on preserving the work.

Any failed run opens or updates one issue labeled `automation-failure` and comments the run link on later failures. Close it once a refresh succeeds. A red scheduled run that nobody is told about is not a signal.

The refresh checks out with `persist-credentials: false` and only configures git authentication in the publishing step, so third-party feeds and search results are never parsed beside a writable token.

### Tokens

The job runs with `GITHUB_TOKEN` scoped to `contents: write` and `pull-requests: write`. In repository **Settings → Actions → General**, keep the default workflow permission read-only and enable **Allow GitHub Actions to create and approve pull requests** so the refresh job can create its PR.

A pull request opened with `GITHUB_TOKEN` does not trigger workflows, so `verify` — the required check — never runs on it and the pull request cannot reach a mergeable state. Add a repository secret named `ATLAS_AUTOMATION_TOKEN` holding a fine-grained personal access token or GitHub App installation token for this repository with **Contents: read and write** and **Pull requests: read and write**. The workflow prefers it and falls back to `GITHUB_TOKEN`, so the refresh still runs without the secret; it just produces a pull request whose required check has to be started by hand.

## Attention-source sweep

The sweep runs locally, not in GitHub Actions. `scripts/sweep_hackernews.py` needs no
credential of any kind — it reads a public search API and public vendor pages — and
`scripts/run_hn_signals.py` commits to a local branch and never pushes, so the whole
pipeline works on a checkout with no tokens configured. A workflow ran it in CI briefly;
it was retired because a pull request opened with `GITHUB_TOKEN` never triggers the
required `verify` check, so its output could not reach a mergeable state without adding a
credential the pipeline does not otherwise need.

Run a sweep by hand at any time:

```bash
uv run python scripts/sweep_hackernews.py
```

To run it daily without being asked, schedule it with launchd. Write
`~/Library/LaunchAgents/com.atlas.hn-sweep.plist`, substituting the checkout path, then
load it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.atlas.hn-sweep.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.atlas.hn-sweep</string>
  <key>WorkingDirectory</key><string>/path/to/ai-systems-atlas</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-lc</string>
    <string>uv run python scripts/sweep_hackernews.py</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>23</integer></dict>
  <key>StandardOutPath</key><string>/tmp/atlas-hn-sweep.log</string>
  <key>StandardErrorPath</key><string>/tmp/atlas-hn-sweep.log</string>
</dict>
</plist>
```

The agent runs only while you are logged in, and launchd fires a missed run once at next
login rather than once per missed day. A gap is recoverable rather than lost: `--lag-days`
moves the swept window back, so `--lag-days 3` sweeps the day that ended three days ago.
The sweep leaves `directory/hn-signals.json` modified in the working tree; commit it on a
branch before running the routine.

### Running the loop locally

By default `run_hn_signals.py prepare` builds its worktree from `origin/main`, which is
protected (`required_pr: true`, `required_checks: ["verify"]`, `enforce_admins: true`), so
a swept queue that has not yet cleared a pull request cannot reach the routine. Pass
`--from-ref` to point `prepare` at a local branch instead, and the whole sweep-assess-
iterate loop runs without touching `origin/main` at all:

```bash
uv run python scripts/sweep_hackernews.py
git checkout -b hn-signals/local-sweep
git add directory/hn-signals.json
git commit -m "Sweep signals for $(date +%F)"
uv run python scripts/run_hn_signals.py prepare --from-ref hn-signals/local-sweep
```

`prepare` resolves `--from-ref` to a commit SHA and records it in
`.hn-signal-bundle/base-ref.json` under the primary checkout (`ROOT`), not the worktree —
still covered by `.gitignore`, so it never reaches a commit. That location matters: the
worktree is where the unattended model works, so a record `finish` trusts had to live
somewhere an ordinary file edit there cannot reach. `finish` reads that file and uses the
pinned SHA everywhere it would otherwise compare against `origin/main`: the head-moved
check, the committed-diff blast-radius check, and the `git show
<base>:directory/hn-signals.json` field-guard baseline all run against the exact tree
`prepare` handed the model, not whatever `origin/main` has become since. A SHA rather than
the ref name, because a branch can move between `prepare` and `finish`; pinning the commit
means the guards always check the tree the model actually saw. When no SHA was recorded —
an older worktree, one built without `--from-ref`, or a record that failed the checks
below — `finish` falls back to `origin/main` exactly as it always has. A recorded value
that is not exactly a 40-hex commit SHA, or that lives behind a symlink instead of a plain
file, is treated the same as no record at all rather than trusted.

`prepare`'s first step is `git fetch --quiet origin`; a failure there is fatal only when
`--from-ref` names a remote-tracking ref (its prefix matches a configured remote, as
`origin/main` does). A purely local ref cannot be stale against a remote, so a fetch
failure is tolerated and the run proceeds offline — the same rule `git worktree add`
implicitly follows for any commit-ish it is given directly. `--from-ref` naming a
remote-tracking ref of a remote other than `origin` (`fork/main`, say) is rejected outright
— `prepare` only ever fetches `origin`, so checking freshness against a different remote's
ref under that fetch would pass while the baseline was arbitrarily stale.

Iterate locally as long as you like — re-run `prepare --from-ref` after every sweep or
edit, since it always resolves the ref fresh — and push only once there is something on
the queue worth a human review pass. Nothing about the default `origin/main` path changes:
omitting `--from-ref` behaves exactly as before.

### Guard threat model

`scripts/run_candidate_triage.py` and `scripts/run_hn_signals.py` share their mechanical
guards through `scripts/routine_guards.py`, and this threat model applies identically to
both. It was sharpened by an adversarial review that found the base-record file could be
relocated out of the worktree but still bypassed — read on for what closed and what did
not.

The guards are built to bound an honest-but-misled model: one that misreads what
`docs/routines/hn-signals.md` or `docs/routines/candidate-triage.md` asked of it, or one
steered by prompt injection carried in a fetched vendor page or README. That is the
failure this pipeline actually runs into — an unattended model reading attacker-influenced
text and drawing the wrong conclusion from it — and the blast-radius, committed-diff, and
field-level checks catch a real, broad class of mistakes: an edit outside the one file the
routine may touch, a rewritten provenance field, an added or removed queue entry, a
second commit riding along with the legitimate one.

The guards do not bound a hostile model with shell access to this checkout, and the
reason is not that it shares a ref store and object database with the repository — that
explains one bypass, not the general case. The general case is simpler: `finish` executes
worktree-controlled code between its last read of the queue and the commit that stages
it, and a `git status`-based blast-radius guard can be made to describe a tree that is no
longer the one it checked. Concretely: `git update-index --assume-unchanged <a tracked
script CHECKS runs>`, then poison that script. `git status --porcelain` stops reporting
the modification, so the blast-radius guard sees only the one file the routine is allowed
to touch; every guard up to that point passes. `finish` then runs `CHECKS`, which executes
the now-poisoned script, which rewrites the queue after the field guard already read it;
`finish` stages and commits the rewritten file. Demonstrated against both routines: on
`run_hn_signals.py` it committed `points: 9999`; on `run_candidate_triage.py` it flipped
`confidence` to `high` and added the candidate `acme/injected` — the two writes ADR 024's
review step exists to catch. `finish` re-reads the queue immediately before `git add` and
refuses if it differs from what the field guard read, which closes this deterministic
form of the route — a CHECKS command that rewrites the queue itself is now caught — but a
hostile model with shell access has other channels no file-comparison guard reads, so the
class stays open.

A related but distinct route runs through the shared git dir rather than the working
tree: every worktree of a repository shares one ref store and object database, so `git
replace -f <pinned> <forged>` — one command, run from inside the worktree — makes `git
diff` and `git show`, which every field-level guard is built from, silently substitute a
different object for the one a pinned SHA names; a truthful two-file diff can become
empty output. `finish` runs its git commands with `GIT_NO_REPLACE_OBJECTS=1` and refuses
outright when `refs/replace` is non-empty, which closes the cheapest route to that
bypass — it does not close the class either. A model with shell access can act on the
repository through channels no file-comparison guard reads.

The actual containment is that nothing either routine writes is ever accepted
automatically: `finish` commits only to an isolated local branch (`hn-signals/pending` or
`triage/pending`) that is never pushed, and a human reviews every proposal — reading
cited evidence, not trusting a verdict — before anything reaches `directory/*.json` on
`main`. [ADR 024](adr/024-candidate-triage-proposals-are-unaccepted-evidence.md) already
reserves that review step for candidate triage; the same reservation is what actually
stands between an unattended run and the published catalog for both routines, guards or
no guards.

One route the guards still do not close, documented rather than fixed: `finish` falls
back to comparing against `origin/main` whenever no base record is found — including when
one was deleted. A model with shell access could delete
`.hn-signal-bundle/base-ref.json` and then `git update-ref refs/remotes/origin/main
<forged>` to make that fallback compare against a forged tree instead of the real one.
The `refs/replace` refusal and `GIT_NO_REPLACE_OBJECTS=1` do not touch this path — it
never goes through `git replace` — and closing it would mean either hard-erroring on a
missing record (a real behavior change to the always-worked default path) or trusting a
second location no more defensible than the first. Left open, same as the human-review
containment above already assumes it must be.

The points floor (`--points-floor`, default 25) is the sweep's only tuning knob: the
minimum score a story needs to be swept at all. Its right value is not settled; watch what
the current floor lets through and adjust it. `directory/hn-signals.json`'s
`source.eligible_count` is capped at 60 signals per run. When the cap binds,
`source.truncated` is `true` and the sweep prints a warning naming how many qualifying
stories it dropped — because the attention source returns stories newest-first, a bound
cap always drops the oldest stories in the swept window, never a random sample. A
`truncated: true` envelope is a signal to raise `--points-floor`, not to ignore: the
response is a narrower query that the cap can carry in full, not silence about the stories
the run never kept. The first run at a floor of 10 reported `truncated: true` against 1,142
stories, which is why the default is 25.

Not every page can be read. A first live run failed to fetch 11 of 60 pages: seven
returned HTTP 403 to the fetcher, including `openai.com`; three resolved to more than the
eight addresses `_validated_web_endpoint` permits; one redirected across hosts. Those
signals are recorded `page_status: "failed"` and carry no digest, so the routine may only
give them the `unreadable` verdict and a human opens the link directly. A vendor that
blocks the fetcher is not a defect to route around by weakening the fetch guards.


## App payloads

`uv run python scripts/build_web_payload.py` writes five boot payloads, five search indexes, one shared imported-model source-detail payload, and one per-record detail file for every reviewed catalog record under `web/app/` — the projection `web/app.js` actually loads at boot, on search focus, and on record or comparison open; see [ADR 026](adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md). `--check` rebuilds the tree in memory and fails when the committed files differ, and `verify.yml` runs it on every pull request. `scripts/update_directory.py` regenerates payloads right after `sync_web_data()`, since payloads project the files that call writes and cannot be built before it. `.github/workflows/update-directory.yml` synchronizes again after the separate models.dev import, then runs the builder, share-page generator, and asset-version builder in that order. Dropping either synchronization/build ordering ships stale card metadata because the app payloads are committed rather than built during Pages deployment.

## Share pages

`uv run python scripts/build_share_pages.py` writes one static landing page per published record under `web/records/<collection>/<id>/`, plus `web/sitemap.xml` and `web/robots.txt`, from the canonical `directory/*.json` files. `--check` rebuilds in memory and fails when the committed files differ or when `web/records/` holds a file the catalog no longer produces, so a published record cannot change without its share page. The weekly refresh regenerates the pages after updating metadata, because a status promotion changes a page.

## Vendored fonts

`node scripts/build_fonts.mjs --check` rebuilds `web/fonts.css` and the woff2 files under `web/fonts/` in memory from the installed `@fontsource` packages and fails when the committed copies differ, so a font package bump or a face change cannot ship unvendored; regenerate with `node scripts/build_fonts.mjs`.

## Asset versions

`node scripts/build_asset_version.mjs --check` recomputes the `?v=` query string on every local asset `web/index.html` references (`fonts.css`, `styles.css`, `app-core.js`, `app.js`) from that file's content hash and fails when the committed page carries a different value, so a stylesheet or script change cannot ship under a version a browser has already cached. Regenerate with `node scripts/build_asset_version.mjs` after editing any of those files; `tests/test_web.js` enforces the same rule. The weekly refresh regenerates them too, because a catalog change moves the hash of any published file index.html references.

## Logo coverage

`node scripts/build_logos.mjs --check` rebuilds `web/logos.json` in memory and fails when the committed file no longer matches the record map, the published records, or the installed icon-package versions. It also reports every monogram record and flags candidates whose id or name now matches an available icon slug. Three rails keep coverage current:

- `verify.yml` runs the check on every pull request, so a record-map edit or icon-package bump cannot merge without a regenerated `web/logos.json`.
- `update-directory.yml` writes the weekly coverage report to the run summary, surfacing records published without marks and newly available candidates.
- Dependabot's weekly npm pull requests bump the icon packages; the check fails on those PRs until the file is regenerated, which is when newly added icons become mappable.

A candidate hint is a review prompt, never an auto-mapping: confirm the icon depicts the record's product or the maintainer/operator named in its published data, then map it — or record `null` in `RECORD_MARKS` to decline it durably with a reason.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys only `web/` after the exact `main` revision passes the complete `verify` workflow. A manual run is accepted only from `main` and performs the deployment workflow's local validation before publishing. In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its default-branch deployment rule enabled; disable administrator bypass in the environment UI.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check. Classic `main` protection requires pull requests, a current `verify` result, conversation resolution, and an up-to-date branch; it blocks force-pushes and deletion. A complementary default-branch security ruleset makes high-or-higher CodeQL findings merge-blocking. Zero required approvals is intentional while the project has one maintainer; require an independent approval when a second maintainer is available.

`.github/CODEOWNERS` assigns every path to the maintainer. Ownership is advisory while required approvals are zero; enable **Require review from Code Owners** on `main` once a second maintainer exists.

All actions are pinned to immutable commit SHAs, and repository settings enforce those pins while allowing only GitHub-owned actions plus `astral-sh/setup-uv`. The required verification job includes dependency review for pull requests. `.github/dependabot.yml` opens weekly pull requests for Actions and npm updates. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.

Secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting, and CodeQL default setup are enabled. Secret validity checks and non-provider patterns remain disabled; enable them if the repository settings expose those controls later. See [`SECURITY.md`](../SECURITY.md) for reporting; do not put suspected vulnerabilities in public issues.

Use squash merges and linear history; merge commits and rebase merges are disabled. Automatic merge and the update-branch button are enabled. Keep zero required approvals only while the repository has one maintainer.
