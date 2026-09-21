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

## Pre-commit

Install once per checkout with `pre-commit install`. The whole `verify.yml` gate lives in `.pre-commit-config.yaml`: CI is environment setup plus `pre-commit run --all-files`, and every commit runs the same hooks. Commit-time cost is ~1-2 minutes, dominated by the unit suite and e2e; bypass one check with `SKIP=<hook-id>`, or all of them with `git commit --no-verify` (CI still gates the merge).

No code reaches the remote green-unverified: `pre-commit install --hook-type pre-push` adds the same gate to `git push`, so a push that would fail CI never leaves the checkout. GitHub workflows are a backstop, not the gate.

```bash
pre-commit install
pre-commit run --all-files
```

What runs, and where it is configured:

- Generic hygiene from `pre-commit-hooks`: trailing whitespace, final newlines, LF endings, case conflicts, merge-conflict markers, YAML/JSON/TOML/XML syntax, private keys, no new submodules, no commits to `main`, and a 1000K ceiling on added files (the catalog JSON files peak at ~672K).
- Secrets as one identical check on commit and in CI: a full-history `gitleaks git` scan (seconds at this repo size) rather than a staged-only scan, so the local gate and the `verify.yml` gate can never disagree. The checkout in `verify.yml` uses `fetch-depth: 0` so the history is there to scan. Known-safe fixtures are allowlisted in `.gitleaks.toml`, never inline.
- Python: `ruff check --fix` and `ruff format` (pinned to the `pyproject.toml` dev group), plus `bandit` at medium severity and above. Low bandit findings are git-subprocess plumbing noise; the five medium sites carry `# nosec` with their allowlist justification on the preceding lines. Never add a bare `# nosec` without that justification.
- Complexity as ratchets, not targets: `C901` at 50 in `pyproject.toml` (today's maximum is 46 in `validate_hn_signals`) and the eslint `complexity` rule at 40 (today's maximum is 39 in `recommendationReasons`). Both fail any new function worse than the worst one already carried. Tighten them by refactoring, never with a `noqa` or an eslint-disable.
- Test coverage as a ratchet: `uv run coverage run -m unittest discover -s tests` followed by `uv run coverage report`, which enforces `fail_under` in `pyproject.toml` (79 today across `scripts/`). The browser suite reports its own coverage with `node --test --experimental-test-coverage tests/test_web.js` (`web/app-core.js` sits near 100%). Raise the floor by adding tests, never by omitting files.
- JavaScript through the repo's own `eslint.config.mjs` (which already ignores generated trees), HTML through `htmlhint` (`.htmlhintrc`), stylesheets through `stylelint` (`.stylelintrc.json`), prose through `markdownlint-cli2` (`.markdownlint-cli2.jsonc`) with `--fix` so safe formatting applies on commit, workflows through `yamllint` (`.yamllint.yml`) and `zizmor` (suppressions with justification in `.github/zizmor.yml`), spelling through `codespell` (product names and house spellings in the hook's ignore list; real typos get fixed).
- Project verification, same hooks locally and in CI: catalog validation, the unit suite under `coverage` with the `fail_under` gate, `compileall`, `node --check` on the browser bundle, the Node web behavior tests, every generated-file freshness check (logos, fonts, asset versions, share pages, app payloads, blog), and the Playwright end-to-end suite (needs `npx playwright install chromium` first; CI installs it before the pre-commit step).
- Generated and mirrored files are excluded from the content linters because their builders own them: `web/records/`, `web/app/`, `web/blog/`, `web/fonts/`, synced `web/*.json`, the sitemap, lockfiles, vendored dependencies, transient queues (`hn-signals.json`, `model-candidates.json`), and the upstream `models-dev.json` snapshot. The frozen `docs/superpowers/` planning archive is excluded from markdown linting for the same reason: reformatting history buys nothing.

There is deliberately no Prettier hook. Its defaults would reformat the hand-styled `web/app.js`, the compact catalog JSON the generators write with `indent=2`, and long-line prose docs — thousands of churn lines with no defect caught. `ruff format` owns Python, `eslint` owns JavaScript, and the generators own their output.

Bump a pinned hook version deliberately, one tool at a time, running `pre-commit run --all-files` and the full verification after each bump. Never run `pre-commit autoupdate` blindly across all hooks: a new codespell dictionary or a stricter default can turn a passing tree red for reasons unrelated to any change under review.

## Review age

```bash
uv run python scripts/report_review_age.py
uv run python scripts/report_review_age.py --older-than 90 --collection systems
uv run python scripts/report_review_age.py --json --as-of 2026-09-14
```

The report reads `directory/` and prints one row per reviewed record, oldest editorial date first. It changes no date, fetches nothing, and always exits 0: it is a prompt for human re-review, never a gate.

- **reviewed** is the age of the record's own `verified_at`.
- **oldest evidence** is the oldest human review date attached to the record — any nested `verified_at` in its evidence, license evidence, terms, or trust record, plus a system's dated items in `license-evidence.json` — and names where that date sits. `none` means the record has no dated evidence; pinned blob evidence carries no review date.
- **metadata** is the newest automated timestamp, `metadata_verified_at` or `stars_verified_at`, or `none` for records without GitHub metadata. It says how fresh the live numbers are, not how fresh the review is.

`pushed_at` is left out because it measures upstream activity, not Atlas review. `--older-than DAYS` keeps records whose review or oldest evidence is more than `DAYS` old; `--collection` accepts `systems`, `inference`, `runtimes`, `models`, or `specifications` and may repeat.

## Metadata refresh

The weekly refresh runs this alongside the models.dev import, synchronization, payload and
share-page regeneration, and verification, as one local script; see "Scheduled workflow" below
for `scripts/run_directory_refresh.py` and how it is scheduled and published. The commands
below run this step, or the models.dev import, on their own.

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

The same run also refreshes GitHub star counts for `directory/local-runtimes.json` records that carry a `repo`. This is a separate, lower-stakes pass: it only ever updates `stars` and `stars_verified_at`, it does not participate in the 80% success gate or license-drift machinery above, and a per-repository failure is a warning that leaves the existing value in place rather than an aborting condition. See [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md). `directory/packs.json` carries no stars and is never touched by this pass.

models.dev discovery is a separate fail-closed import:

```bash
GITHUB_TOKEN=... uv run python scripts/import_models_dev.py
```

It resolves the upstream ref, downloads the commit-pinned repository archive, reads only provider-independent model TOMLs, and normalizes the complete `directory/models-dev.json` source snapshot plus the text-output `directory/model-candidates.json` review queue only after all source, count, schema, and collision checks pass. Run `scripts/sync_web_data.py` afterward so the published snapshot reaches `web/`. The token is optional locally. The importer removes already reviewed `source_id` values from the queue, and also filters the `source_id` values dispositioned in `directory/model-dispositions.json` while keeping them in the eligible count, but never edits `directory/models.json`. See [`MODELS.md`](MODELS.md) and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).

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
and keeps conditional-request validators and terms baselines in one cache shared by every
worktree of the clone, `.git/atlas/evidence-link-cache.json` (`--cache PATH` overrides it).
A run holds an exclusive lock on that cache from load to save, so a second concurrent run
exits instead of overwriting the first, and replaces the file atomically. A run also keeps
the entries of URLs it did not check, so a branch that lacks some records never erases their
baselines. A successful result less than twenty hours old is reused, so re-running the check
does not immediately crawl all reviewed sources again.
A `GET` that returns `403` without rate-limit headers gets one retry with ordinary
browser headers: pages behind a bot wall (observed on xAI and OpenAI terms hosts) then
count as reachable but raise a visible `bot-walled reviewed link` warning, while a page
that refuses both user agents keeps the original conclusive `403` failure.

Mutable `web_terms` evidence receives an additional normalized content hash. HTML page
shells, scripts, styles, navigation, per-request telemetry nonces rendered as text, and whitespace are removed before hashing; GitHub and
Hugging Face blob pages are fetched through their stable raw-content routes. The cache keeps
the normalized text behind every hash (`terms_text`, and `observed_terms_text` while drift is
open), so each drift report prints up to twelve changed sentence-sized segments, and
`--show-drift` prints the same diffs for every open drift entry from the cache without
fetching. Until an entry holds that text, the checker fetches its page without conditional
request headers, because a `304 Not Modified` answer carries no body to store. When an evidence URL names a fragment, or its URL appears in the checker's
`TERMS_SECTION_IDS` map, only that section is hashed: a heading and everything up to the next
heading of the same or higher level, or the element carrying the id. If the id is missing
from the page, the whole page is hashed and the run warns `terms anchor not found`. Add a
`TERMS_SECTION_IDS` entry only after a stored diff shows a page's churn sits outside its
terms. An entry from before stored text gains its text silently when its hash is unchanged,
and an anchored URL moves from its whole-page baseline to its section silently only when the
page still hashes to that baseline; any other difference stays drift until reviewed. A page without a
baseline gets one on its first successful observation only when every review date for that
URL is on or after the cache's previous run: the evidence was added or re-reviewed since the
checker last ran, so first sight follows a human review. Otherwise the check fails with
`terms baseline missing`, and keeps failing even while the entry is served from the cache;
a new or lost cache therefore reports every page. After reviewing such pages, rerun with
`--establish-baselines --max-age-hours 0`, which records them and lists each as a warning.
Evidence reviewed on a branch that stays unmerged past a check fails once this way. A later content change
fails the weekly verification and therefore opens or updates the durable
`automation-failure` issue; it never edits the record, its evidence, its source model, its
licenses, or its human-owned dates. `404` and `410` responses fail as broken reviewed
links. Other transport failures are warnings unless fewer than 80% of the current targets
were checked or served from a recent cache.

Trust-record URLs — every property source, finding source, operator response, and
resolution — are checked as links and receive no terms baseline of their own; a URL shared
with a `web_terms` entry stays hashed under that entry, and the trust review date joins that
entry's acceptance gate. The rest holds: the Atlas cannot accept a change to a page it does
not steward, and a finding's pinned `content_sha256` is a review-time record compared to
nothing here. See
[ADR 029](adr/029-trust-records-are-unscored-and-never-first-hand.md).

To resolve terms drift, start from the stored diff (`--show-drift`), inspect the authoritative
page, update every affected conclusion
and scoped evidence item as needed, and advance every affected human-owned `verified_at`.
On the next scheduled check, a review date newer than the cached baseline accepts the new
hash; use `--max-age-hours 0` to verify that acceptance immediately. If the terms did not
change materially, advancing the evidence date still records that a human reviewed the
new page before the automation accepts it. Repair or replace a
broken URL in the same review. Do not delete the cache merely to make a drift signal pass;
a lost cache reports every baseline as missing instead of accepting the pages as they now
are, and only a person reviewing those pages can restore it.

Checkouts from before the shared cache each kept a `.evidence-link-cache.json` at their
root. Merge them into the shared cache once; the import fetches nothing and never changes
the source files:

```bash
uv run python scripts/check_evidence_links.py \
  --import-cache /path/to/agent-systems-atlas/.evidence-link-cache.json \
  --import-cache /path/to/atlas-directory-refresh/.evidence-link-cache.json
```

For each URL the import keeps an entry found in only one cache, prefers the entry accepted
after a strictly newer human review of every reference, and otherwise keeps the most
recently checked entry. When two baselines agree it keeps any open drift; when they disagree
without a newer review it opens terms drift, so a person decides which page is right.

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

`scripts/promote_system_candidate.py` scaffolds and guards steps 4-6 above. `init <repo-or-url> --output <path>` writes an incomplete review draft, prefilling only identity and automation-owned GitHub facts plus a `license-evidence.json` item built from the candidate's pinned `LICENSE` git blob — never the proposed family or role. `check <draft>` runs the full preflight against the current catalog and reports without writing. `apply <draft>` re-runs that preflight, then atomically writes the completed project into `projects.json`, its evidence into `license-evidence.json`, and removes the one candidate from `candidates.json`, rolling every file back if any write fails.

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

- **Accepting `out_of_scope`:** follow `CURATION.md` — write the exclusion, with today's
  date as both `excluded_at` and `verified_at`, and remove the candidate in the same change. The `triage` block is removed with the candidate; nothing
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

`prepare` resolves `origin/main` to a commit SHA when it builds the worktree and records
it in `.candidate-evidence/base-ref.json` under the primary checkout (`ROOT`), not the
worktree — still covered by `.gitignore`, so it never reaches a commit. `finish` reads
that file and uses the pinned SHA everywhere it would otherwise compare against
`origin/main`: the head-moved check, the committed-diff blast-radius check, and the `git
show <base>:directory/candidates.json` field-guard baseline all run against the exact
tree `prepare` handed the model, not whatever `origin/main` has become since. This matters
because `main` moves several times a day in this repository; without pinning, any commit
landing between `prepare` and `finish` made the blast-radius guard blame the run for files
it never touched. When no SHA was recorded — an older worktree, or a record that failed
the checks below — `finish` falls back to `origin/main` exactly as it always has. A
recorded value that is not exactly a 40-hex commit SHA, or that lives behind a symlink
instead of a plain file, is treated the same as no record at all rather than trusted. This
machinery is shared with `run_hn_signals.py` through `scripts/routine_guards.py`; see
"Running the loop locally" below for that routine's additional `--from-ref` option, which
candidate triage has no equivalent need for and does not implement.

The harness authenticates with `GITHUB_TOKEN` when it is set and otherwise falls back to
`gh auth token`, so a scheduled run needs no secret stored anywhere. With neither, GitHub
allows 60 anonymous requests an hour against the roughly 80 a default `--limit 40` run
issues, and the run fails on the rate limit before any judgment happens.

To schedule the routine, install its prompt from the checkout it should run in — one
whose scripts track `origin/main`, such as the attention-source sweep worktree, which
rebases onto `origin/main` before every sweep:

```bash
uv run python scripts/run_candidate_triage.py install-prompt
```

That writes `docs/routines/candidate-triage.md` to
`~/.claude/scheduled-tasks/candidate-triage/SKILL.md` with `{{ATLAS_CHECKOUT}}` filled in
with that checkout's path. A scheduled run starts in no particular directory, so the prompt
has to name one, and a machine path cannot be reviewed into the repository. `prepare`
renders the reviewed prompt for its own checkout before comparing, so the placeholder is the
only difference the drift check allows, and the installed prompt can only name the checkout
doing the checking. Then register a `candidate-triage` scheduled task for Tuesday morning
local time in the desktop app. A `SKILL.md` file alone is not a registered routine and never
runs; if registering rewrites the file, run `install-prompt` again afterwards, and again
after every change to the repository prompt. Scheduled tasks only run while the desktop app
is open; a missed run catches
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
   `uv run python scripts/verify_signal_pages.py --recheck`. It re-fetches only the
   signals whose `assessment` this run introduced or changed — found by diffing the
   queue against a baseline, `origin/main` by default — and fails, naming it, when a
   cited page's current content no longer hashes to the recorded `content_sha256`. That
   catches a vendor page that changed underneath the very assessment citing it. A signal
   that already carried its assessment on the baseline, or one that carries no
   assessment at all, is not re-fetched: an already-baselined citation was verified when
   it was introduced, and an unassessed signal stakes no citation this run needs the page
   to still support. Vendor pages drift constantly — timestamps, view counts, rotating
   content — so re-checking every readable signal on every run meant a handful of
   unrelated drifting pages could discard a whole day's worth of otherwise-verifiable
   assessments. Scoping is deliberately not based on `proposed_at` or `proposer`: both
   are written by the agent being checked, so either could let a back-dated or
   relabelled assessment exempt itself from verification. Pass `--base-ref` to compare
   against something other than `origin/main` — `finish` always passes the exact SHA
   `prepare` recorded (see "Running the loop locally" below), so a manual recheck
   against a checkout built with `--from-ref` should do the same. Validation is what
   stops a fabricated citation from pointing anywhere but the signal's own page: an
   assessment may cite only its own signal's pinned page, and an `evidence` entry whose
   `url` or `content_sha256` differs from the signal's is rejected. Together they mean
   the digest this command re-fetches, for a signal it examines, is the digest every
   citation on that signal carries.

Then, per signal:

- **Accepting `worth_review`:** the assessment is a dossier, not a classification. A
  signal is not a candidate — nothing in this pipeline writes `directory/candidates.json`.
  Follow `CURATION.md`'s review workflow yourself to decide whether the linked page
  describes a system the Atlas should carry, and, if so, create the candidate and carry it
  through review like any other discovery.
- **Accepting `out_of_scope`:** the verdict proposes an exclusion; it is not one. Write the
  exclusion in `directory/exclusions.json` following `CURATION.md`, dating `excluded_at` and
  `verified_at` to the day you decide it. When the rejected page
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

`finish` makes one change to the queue itself. Before any guard reads the queue, it
re-fetches each page whose signal gained an `assessment` this run — using the `url` and
`content_sha256` from the base commit, not the run's copy — and hashes it with the same
`extract_visible_text` and `content_hash` the sweep and `verify_signal_pages.py` use. An
assessment whose page no longer matches is removed, and the rest of the run still commits.
Vendor pages drift within minutes: on 2026-09-15 two runs, of 29 and 55 assessments, were
each discarded whole because one unrelated page changed between `prepare` and `finish`.
The removal is deliberately narrow. It touches only blocks the base queue did not have,
so a disposition already on the branch is never removed; only a digest mismatch triggers
it, while a page that cannot be fetched still aborts the run; the decision is made in
`finish`'s own process, never from anything a `CHECKS` command prints; and the dropped
story ids go to stderr and into the commit message. The field guard, validation, the
`--recheck` in `CHECKS`, and the re-read before `git add` all run afterwards against the
final bytes, so a page that drifts in the short window between the drop and that recheck
still fails the run. A signal whose assessment was dropped is left with none.

The queue itself is transient, and a reviewer has to act accordingly. `sweep_hackernews.py`
rebuilds `directory/hn-signals.json` from one day's window and carries nothing forward, so
every assessment in it — an unattended proposal, or a block you edited in place and marked
`proposer: "human"` — is gone at the next sweep, on `main` as well as on the branch. Only
the durable records outlive it: a candidate, a project, or an exclusion carrying the page's
`url`, each of which the next sweep then suppresses before it fetches anything. So a day's
proposals are worth reviewing before the following morning's sweep, and a disposition you
want to keep belongs in one of those files rather than in the queue. Nothing enforces this;
it is a property of a queue rebuilt daily from an attention source, and the reason a
verdict is accepted by writing a record elsewhere rather than by editing the signal.

To schedule the routine, run `uv run python scripts/run_hn_signals.py install-prompt` from
the sweep worktree — the checkout holding the `local/hn-signals` branch the prompt reads with
`--from-ref` — then register an `hn-signals` scheduled task in the desktop app for each
morning after the local sweep has run. The installed copy is `docs/routines/hn-signals.md`
with `{{ATLAS_CHECKOUT}}` filled in with that worktree's path, exactly as for candidate
triage above. `prepare` refuses to run — `error: the routine prompt is not installed` —
when the installed copy is absent or differs from the reviewed prompt rendered for its own
checkout, so every later change to the repository prompt needs `install-prompt` again
before a run proceeds. A `SKILL.md` file alone is not a registered routine. Scheduled tasks only run
while the desktop app is open; a missed run catches up the next time the app launches, so
a run is not guaranteed at the exact scheduled time.

## Review an inference service

Follow `INFERENCE_SERVICES.md` and treat the named service—not its company or models—as the review unit. Review product documentation, data controls, and governing terms together. Keep endpoint-, model-, region-, feature-, and contract-specific exceptions in prose. Synchronize and verify the complete catalog, then exercise inference-service search, filters, and details in the browser.

Do not copy prices, rate limits, model leaderboards, or exhaustive model inventories into the editorial record. A model offered by several services remains one model behind several operational and contractual boundaries; it does not merge those service records.

## Review a model candidate

Follow [`MODELS.md`](MODELS.md) and treat one provider-independent release—not a lab, model family, hosted endpoint, or repackaging—as the review unit. Verify the official identity, boundary, every governing distribution term, source model, distribution modes, evidence, and `model_access` score. Treat every models.dev field as attributed discovery metadata until first-party evidence supports the Atlas conclusion. Remove the candidate only in the same change that publishes or otherwise disposes of it, then synchronize, regenerate share pages, verify, and exercise Models search, filters, comparison, URL restoration, and details.

For publication, scaffold a review draft with `scripts/promote_model_candidate.py init`, fill its deliberately blank human-owned fields, run `check`, and only then run `apply`. The command validates the complete proposed model collection and remaining queue before it writes. It preserves the imported metadata and queue snapshot, requires exact pinned-source and authoritative-model evidence, and refuses incomplete licensing, scoring, dates, taxonomy, or identity. The exact command sequence and guard contract are in [`MODELS.md`](MODELS.md). When models.dev does not list the release yet, `init-gap` is the second entry path: it scaffolds a `source_id: null` draft, which the same `check` and `apply` commands validate before anything is written; `MODELS.md` documents when to use it and how to `link` the record once models.dev lists the release.

Never copy models.dev benchmarks or prices. Never convert its `license` or `open_weights` field directly into a reviewed Atlas license or source-model classification.

## Resolve a license review

Inspect the authoritative license or terms sources again; GitHub's detected SPDX value is only the trigger.

- Update `licenses` and `source_model` when the reviewed scope changed.
- Replace or extend scoped evidence, set `license_review_status` to `verified`, and remove the incident.
- If scope remains unclear, keep the project visible with its last reviewed classification, retain `review_required`, and explain the uncertainty in the incident and project weaknesses.
- Move a project to exclusions only when the operational family/role boundary—not its license—fails review.

Resolution must update all related records atomically. Validation rejects mismatches between project review status and the license-review queue.

## Scheduled workflow

The weekly refresh runs locally, not in GitHub Actions — the same move already made for the
attention-source sweep, and for the same reason: a pull request opened with `GITHUB_TOKEN`
never triggers the required `verify` check, so a workflow-opened refresh pull request could
never reach a mergeable state without an extra repository secret. `scripts/run_directory_refresh.py`
reproduces the retired `.github/workflows/update-directory.yml` on the maintainer's own
machine instead: it refreshes system/runtime metadata, the complete public models.dev source
snapshot, and both candidate queues; synchronizes the public data again after the model
import; regenerates payloads and share pages; checks reviewed links and mutable terms; verifies
the result; and, only when asked, opens or updates a pull request. It never commits directly to
the default branch, and it runs no judgment of its own — it is a deterministic wrapper around
the same scripts described above, which is what makes it safe to schedule unattended.

```bash
uv run python scripts/run_directory_refresh.py            # generate, verify, commit locally
uv run python scripts/run_directory_refresh.py --publish   # also push and open/update the PR
```

The runner refuses to start on a dirty working tree or on a `HEAD` that does not match a
freshly fetched `origin/main` — a refresh must be generated from current main, never from a
stale or locally modified checkout. It runs the six generation steps in order, stopping at the
first failure, then runs every verification check even after one fails, so a single broken
record cannot hide the rest, and prints a pass/fail summary. It stages the same explicit path
list the retired workflow staged (`STAGED_DIRECTORY_FILES` in the script) — never an unqualified
`git add -A directory`, which once swept the daily attention-source queue into this weekly
branch — and, if that leaves nothing staged, says so and exits successfully. Otherwise it
commits on `automation/directory-refresh` using the maintainer's own git identity, never
`github-actions[bot]`.

Verification is reported, not fatal, exactly as before: a refresh that fails a check still
commits, because discarding an hour of live GitHub and feed reads over one broken record means
waiting a week for the next run. The fail-closed gate belongs on merging into `main`, which
branch protection already enforces — not on preserving the work. What changes with `--publish`
is where that gate is checked: the runner force-with-lease pushes `automation/directory-refresh`
and opens or updates its pull request with `gh`, as a **draft** titled `(verification failed)`
carrying the per-check results when any check failed. Because the pull request is opened with
the maintainer's own `gh` credentials rather than a workflow token, `verify` actually runs on
it. Without `--publish`, the runner stops after the local commit and prints the exact command
to publish; review the commit yourself before deciding to push it. Either way the runner exits
non-zero when a check failed, even after a successful publish, so a scheduler notices.

Schedule it with launchd, following the same pattern as the attention-source sweep: a
dedicated worktree and a small wrapper script, not the runner pointed at an everyday
checkout. Three things make the wrapper necessary rather than decorative:

- The runner commits with `git checkout -B automation/directory-refresh`, so a run leaves its
  checkout on that branch, and the next week's preflight refuses because `HEAD` no longer
  matches `origin/main`. The wrapper runs `git fetch --prune origin` and
  `git checkout --detach origin/main` first; `--prune` keeps the force-with-lease push honest
  after a merged refresh branch is deleted on GitHub. For the same reason, no other worktree
  may have `automation/directory-refresh` checked out when the job runs.
- launchd's login shell does not put Homebrew or nvm on `PATH`. Without `gh`, the runner
  silently falls back to anonymous GitHub limits and `--publish` cannot open the pull
  request; the Node checks need a current `node`. The wrapper sets `PATH` explicitly, with
  the nvm `node` ahead of Homebrew so a newer Homebrew `node` does not shadow it.
- The logo and web checks need the lockfile's devDependencies, so the wrapper runs
  `npm ci --ignore-scripts` in the worktree before the runner, matching `verify`.

Create the worktree once. Like every worktree of the clone, it reads and writes the shared
evidence-link cache in the repository's git directory, so there is no cache to copy (see
"Evidence links and terms drift" above):

```bash
git worktree add --detach ../atlas-directory-refresh origin/main
```

Then write the wrapper, refusing a dirty tree before doing anything else:

```sh
#!/bin/sh
set -u
cd /path/to/atlas-directory-refresh || exit 1
NODE_BIN=$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)
PATH="${NODE_BIN:+$NODE_BIN:}$HOME/.local/bin:/opt/homebrew/bin:$PATH"; export PATH
[ -z "$(git status --porcelain)" ] || { echo "refusing: worktree is dirty" >&2; exit 1; }
git fetch -q --prune origin && git checkout -q --detach origin/main || exit 1
npm ci --ignore-scripts --no-audit --no-fund --silent || exit 1
exec uv run python scripts/run_directory_refresh.py "$@"
```

Point `~/Library/LaunchAgents/com.atlas.directory-refresh.plist` at it, then load it with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.atlas.directory-refresh.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.atlas.directory-refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-lc</string>
    <string>$HOME/.local/bin/atlas-directory-refresh.sh --publish</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>17</integer></dict>
  <key>StandardOutPath</key><string>/tmp/atlas-directory-refresh.log</string>
  <key>StandardErrorPath</key><string>/tmp/atlas-directory-refresh.log</string>
</dict>
</plist>
```

Before relying on the schedule, run the wrapper once under launchd without `--publish` from a
throwaway agent: bootstrap it, then start it with `launchctl kickstart -p
gui/$(id -u)/<label>` — a `RunAtLoad` agent bootstrapped from outside `~/Library/LaunchAgents`
was observed never to start on its own. That exercises the real launchd environment — `PATH`,
the `gh` token from the login keychain, Node — through a full refresh and local commit, while
pushing nothing. Remove the throwaway agent with `launchctl bootout` afterwards.

The agent runs only while the maintainer is logged in, and launchd fires a missed run once at
next login rather than once per missed week — the same tradeoff the attention-source sweep
already accepts. A red run still opens or updates its issue-worthy signal in the log rather than
silently vanishing; there is no `report-failure` job to do that automatically, so a failed run
in the log is the thing to watch. Review license incidents, evidence-link or terms-drift
signals, candidates, model candidates, and the check summary before merging any refresh pull
request. The refresh's check summary and the pull-request body both list a "Models awaiting a
models.dev link" section when models.dev now lists a release Atlas reviewed earlier; run the
`link` command in [`MODELS.md`](MODELS.md) for each one. Running `validate_directory.py` directly
prints the same `link pending:` lines those sections are built from.

### Tokens

The runner obtains its token from the maintainer's own GitHub CLI login — `gh auth token` —
and passes it as `GITHUB_TOKEN` only to the three scripts that read it: `update_directory.py`,
`import_models_dev.py`, and `check_evidence_links.py`. It never prints the token. If
`gh auth token` fails, the runner warns that GitHub rate limits may bite and runs anyway without
one; a missing token slows discovery but does not stop it.

No repository secret is needed anywhere. The old `ATLAS_AUTOMATION_TOKEN` secret existed only to
work around a pull request opened by a GitHub Actions job with `GITHUB_TOKEN`, which never
triggers the required `verify` check. Since `--publish` opens the pull request with the
maintainer's own `gh` credentials instead, `verify` runs on it the same way it runs on a
pull request from any other local branch, and the workaround secret has nothing left to fix.

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

Before fetching any story's page, the sweep drops one whose outbound URL a human has
already decided on — it appears with a `url` in `directory/exclusions.json` (a
rejection), `directory/projects.json` (already a reviewed record), or
`directory/candidates.json` (already queued for review) — so an already-decided page is
never re-fetched and never re-costs a triage pass. The comparison uses
`canonical_url_key` from `scripts/discovery_sources.py`, the same key
`update_directory.py` uses for this: it is a conservative key, not a full normaliser, so
it folds a trailing slash, a default port, and `utm_`/tracking query parameters, but it
does not fold a `www.` host prefix — a page linked both with and without `www.` is not
recognized as the same URL. The three catalog files are local JSON in the same checkout;
if one cannot be read or parsed, the sweep aborts instead of silently suppressing
nothing, since an empty suppression set would recreate the exact defect this guards
against. The count of stories dropped this way is recorded as `suppressed` in the
committed queue's `source` envelope, alongside `truncated`, and printed to stdout so it
shows up in the launchd log.

`scripts/verify_signal_pages.py --refresh` (invoked by `run_hn_signals.py prepare`) caps
each page at `MAX_BUNDLE_CHARS` (8,000 characters) when it writes `bundle.json` for the
routine's model to read. A real 39-page bundle ran 568,518 characters uncapped (~142,000
tokens); 8,000 chars/page cut that to ~63,000 tokens (~2.3x cheaper) while retaining 40 of
56 distinct AI-relevant terms present uncapped, against 19/56 and 25/56 at 2,000- and
4,000-char caps respectively. The cap applies only to what is written into the bundle,
never to what is hashed: `verify()` hashes each page's full extracted text and compares
that against the signal's recorded `content_sha256` before truncating anything, so drift
detection sees the whole page regardless of the cap. A truncated page gets a trailing
marker naming its `url` so the model knows the rest was cut, not that the page ended.

To run it daily without being asked, schedule `scripts/run_hn_sweep.py` with launchd from
a dedicated worktree on the branch the routine reads:

```bash
git worktree add -b local/hn-signals ../atlas-hn-sweep origin/main
```

Write `~/Library/LaunchAgents/com.atlas.hn-sweep.plist`, substituting that worktree's
path, then load it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.atlas.hn-sweep.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.atlas.hn-sweep</string>
  <key>WorkingDirectory</key><string>/path/to/atlas-hn-sweep</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-lc</string>
    <string>uv run python scripts/run_hn_sweep.py</string>
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
`sweep_hackernews.py` alone leaves `directory/hn-signals.json` modified in the working
tree. The scheduled routine reads the queue from the local branch `local/hn-signals`, so
the launchd job runs `scripts/run_hn_sweep.py`, which owns the git sequence around the
sweep: refuse a dirty tree, refuse any branch but `local/hn-signals`, fetch `origin main`,
move the branch onto `origin/main` so the sweep and the routine both run current code,
sweep, and commit the file. Arguments it does not know, such as `--lag-days`, pass through
to the sweep. The plist holds the only machine-specific values, the worktree's path and
the schedule; the `-lc` login shell supplies `PATH`.

The branch check is a safety catch, not a convention. The runner hard-resets its branch,
so started by mistake in a working checkout it would discard that branch's unpushed
commits; it refuses instead, before anything moves.

That last step resets rather than rebases, and the difference is load-bearing. Each sweep
rewrites the queue wholesale, so replaying yesterday's sweep commits onto `main` conflicts
with any queue change merged there. On 2026-09-15, after [#165](https://github.com/katagun/ai-systems-atlas/pull/165)
merged a day of assessments, that rebase conflicted, aborted, and every later sweep refused
with `could not rebase onto origin/main` — while the scheduled routine silently reran on the
previous day's queue, because a queue that is merely stale still reads as a queue. A reset
discards nothing that matters: assessments are committed to `hn-signals/pending` by
`run_hn_signals.py finish`, never to this branch, and the branch is never pushed. Keep the
previous tip on a ref such as `local/hn-signals-prev` before resetting, so a swept day
remains recoverable for one generation.

The commit skips the repository's hooks (`git commit --no-verify`), and a commit that
fails anyway is unstaged and discarded before the runner exits, as is a queue the sweep
half-wrote before failing. Both halves come from one
failure. On 2026-09-18 the pre-commit hook failed the sweep's commit, the queue stayed
staged, and the dirty-tree guard then refused the next two sweeps — so the routine reran a
four-day-old queue, again unnoticed, until 2026-09-20. Installing the hook's dependencies
does not rescue it: the suite asserts that a checkout holds no `.hn-signal-bundle`
(`test_running_the_suite_leaves_no_stray_bundle_in_the_real_checkout`), and this checkout
is the one `prepare` writes that directory into, so the suite cannot pass here. Skipping
it costs nothing, because the commit is one data file on a branch that is never pushed,
and `run_hn_signals.py finish` and the `verify` check both validate the queue before
`main` sees it. The rule the two failures share: no step may leave the tree in a state
the runner's own first guard refuses, because a refused sweep is silent and a stale queue
still reads as a queue. Both failures happened while this sequence was a shell script
outside the repository, where no test could hold that rule. `tests/test_run_hn_sweep.py`
now drives a real repository, injects a failure at the fetch, the reset, the add, and the
commit, and after each asserts a clean tree and that the next sweep still runs.

`run_hn_signals.py prepare` is where that silence ends. It warns on stderr when the queue
it was handed was swept more than two days ago, naming the sweep date and
`/tmp/atlas-hn-sweep.log`, and then prepares the queue anyway: old unassessed signals are
still work, and a warning a person reads beats a log nobody does. A queue with no
readable `updated_at` draws no warning, because a guess that fires wrongly stops being
read.

### Pre-ranking the queue

`prepare` can order the pending list by how likely each page is to be a system, so the
routine reads the likeliest signals first and the `--limit` cap keeps those rather than
the lowest story ids. `scripts/rank_signals.py` sends one yes/no question per bundled
page to TypeSafe's System One API, which returns a probability and no generated text.
The order is all it produces: every signal still gets an assessment, none is skipped, and
a rank is never evidence and never cited, exactly as ADR 028 treats points and comment
counts.

It is off until a key exists. Put `TYPESAFE_API_KEY=...` in the environment, or in an
ignored `.env` at the root of the checkout `prepare` runs from — for the scheduled
routine that is the sweep checkout, not the primary one. The key never belongs in the
repository, a plist that is committed, or a workflow secret. Everything fails open: no
key, an unreachable API, a rejected request, or a malformed answer leaves the queue in
sweep order with a warning, and `verify` never reaches the network because only `main`
passes `prepare` a ranker.

Two things leave the machine when it is on: each pending signal's title and URL, and up
to 8,000 characters of its page text. All three are already public, and the submitter
chose the first two, so treat the returned number as you treat the page: data about an
attacker-influenceable input. The model is pinned by version in `rank_signals.MODEL`;
move it deliberately, and re-measure against recorded verdicts when you do. The
2026-09-20 measurement replayed 265 re-fetched pages from every queue in Git history:
20 seconds in total, about 141,000 tokens and $0.006 per 60-signal queue, and against the
59 readable signals the routine had already judged, all five `worth_review` ranked in the
top eight. Three cautions bound it. Five positives is a small sample. Only 106 of the 265
pages still matched their pinned hash, so the verdicts had been given to text that has
since changed. And a companion question asking which collection a page belongs to was
unreliable — it called the iOS 27 page not a product and a Moon essay a model release —
which is why only the yes/no probability is used. The question also cannot know what the
catalog already holds: the top of the unjudged ranking was pages about Claude, the Gemini
app, and the OpenAI Agents API, which the routine calls `out_of_scope` as rehashes.
`BACKLOG.md` holds the re-measurement that decides whether the step stays.

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
both. One behavior is not shared: `run_hn_signals.py finish` removes this run's assessments
whose pinned page changed before its guards run (see "Review a signal batch"), while
`run_candidate_triage.py finish` still aborts when its evidence recheck fails. It was sharpened by an adversarial review that found the base-record file could be
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
`.hn-signal-bundle/base-ref.json` (or, for candidate triage, `.candidate-evidence/base-ref.json`) and then `git
update-ref refs/remotes/origin/main <forged>` to make that fallback compare against a
forged tree instead of the real one.
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

`uv run python scripts/build_web_payload.py` writes five boot payloads, five search indexes, one shared imported-model source-detail payload, and one per-record detail file for every reviewed catalog record under `web/app/` — the projection `web/app.js` actually loads at boot, on search focus, and on record or comparison open; see [ADR 026](adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md). `--check` rebuilds the tree in memory and fails when the committed files differ, and `verify.yml` runs it on every pull request. `scripts/update_directory.py` regenerates payloads right after `sync_web_data()`, since payloads project the files that call writes and cannot be built before it. The weekly refresh (`scripts/run_directory_refresh.py`) synchronizes again after the separate models.dev import, then runs the builder, share-page generator, and asset-version builder in that order. Dropping either synchronization/build ordering ships stale card metadata because the app payloads are committed rather than built during Pages deployment.

## Share pages

`uv run python scripts/build_share_pages.py` writes one static landing page per published record under `web/records/<collection>/<id>/`, plus `web/sitemap.xml` and `web/robots.txt`, from the canonical `directory/*.json` files. `--check` rebuilds in memory and fails when the committed files differ or when `web/records/` holds a file the catalog no longer produces, so a published record cannot change without its share page. The weekly refresh regenerates the pages after updating metadata, because a status promotion changes a page.

## Vendored fonts

`node scripts/build_fonts.mjs --check` rebuilds `web/fonts.css` and the woff2 files under `web/fonts/` in memory from the installed `@fontsource` packages and fails when the committed copies differ, so a font package bump or a face change cannot ship unvendored; regenerate with `node scripts/build_fonts.mjs`.

## Asset versions

`node scripts/build_asset_version.mjs --check` recomputes the `?v=` query string on every local asset `web/index.html` references (`fonts.css`, `styles.css`, `app-core.js`, `app.js`) from that file's content hash and fails when the committed page carries a different value, so a stylesheet or script change cannot ship under a version a browser has already cached. Regenerate with `node scripts/build_asset_version.mjs` after editing any of those files; `tests/test_web.js` enforces the same rule. The weekly refresh regenerates them too, because a catalog change moves the hash of any published file index.html references.

## Logo coverage

`node scripts/build_logos.mjs --check` rebuilds `web/logos.json` in memory and fails when the committed file no longer matches the record map, the published records, or the installed icon-package versions. It also reports every monogram record and flags candidates whose id or name now matches an available icon slug. Three rails keep coverage current:

- `verify.yml` runs the check on every pull request, so a record-map edit or icon-package bump cannot merge without a regenerated `web/logos.json`.
- The weekly refresh (`scripts/run_directory_refresh.py`) prints the same logo-coverage report as part of its verification summary, surfacing records published without marks and newly available candidates.
- Dependabot's weekly npm pull requests bump the icon packages; the check fails on those PRs until the file is regenerated, which is when newly added icons become mappable.

A candidate hint is a review prompt, never an auto-mapping: confirm the icon depicts the record's product or the maintainer/operator named in its published data, then map it — or record `null` in `RECORD_MARKS` to decline it durably with a reason.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys only `web/`, and only after a push to `main` passes the complete `verify` workflow for that exact revision. It has no manual trigger, so nothing can publish a revision that skipped verification; the deployment workflow still runs its own local validation before publishing. To redeploy a revision without a new commit, re-run its push-triggered **Verify AI Systems Atlas** run (`gh run rerun <run-id>`): a re-run keeps the original push event and commit, so a successful re-run starts the deployment again. That path follows GitHub's documented re-run behavior and has not yet been exercised in this repository. In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its default-branch deployment rule enabled; disable administrator bypass in the environment UI.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check. Classic `main` protection requires pull requests, a current `verify` result, conversation resolution, and an up-to-date branch; it blocks force-pushes and deletion. A complementary default-branch security ruleset makes high-or-higher CodeQL findings merge-blocking. Zero required approvals is intentional while the project has one maintainer; require an independent approval when a second maintainer is available.

`.github/CODEOWNERS` assigns every path to the maintainer. Ownership is advisory while required approvals are zero; enable **Require review from Code Owners** on `main` once a second maintainer exists.

All actions are pinned to immutable commit SHAs, and repository settings enforce those pins while allowing only GitHub-owned actions plus `astral-sh/setup-uv`. The required verification job includes dependency review for pull requests. `.github/dependabot.yml` opens weekly pull requests for Actions and npm updates. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.

Secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting, and CodeQL default setup are enabled. Secret validity checks and non-provider patterns remain disabled; enable them if the repository settings expose those controls later. See [`SECURITY.md`](../SECURITY.md) for reporting; do not put suspected vulnerabilities in public issues.

Use squash merges and linear history; merge commits and rebase merges are disabled. Automatic merge and the update-branch button are enabled. Keep zero required approvals only while the repository has one maintainer.
