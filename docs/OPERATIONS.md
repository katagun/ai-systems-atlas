# Operations

Use this document for the standing rules of the catalog's engineering layer: what a review
date means, when drift is a fact rather than a failure, what the unattended routines' guards
bound and what they do not, and how this repository is protected.

Use [`RUNBOOKS.md`](RUNBOOKS.md) for the procedures themselves — verification, pre-commit,
regeneration, the weekly refresh, each review workflow, and the attention-source sweep. The
split is by kind, not by subject: a rule that says what must be true stays here even when a
command implements it, and a sequence of steps goes there even when a rule constrains it. The
line each one used to sit on is history; Git has the previous file.

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

`pushed_at` is left out because it measures upstream activity, not Atlas review. `--older-than DAYS` keeps records whose review or oldest evidence is more than `DAYS` old; `--collection` accepts `systems`, `inference`, `runtimes`, `models`, `specifications`, `packs`, or `labs` and may repeat. A lab's oldest evidence includes the date its safety framework was read.

## Evidence links and terms drift

The weekly workflow checks the authoritative record URL, every reviewed evidence URL,
every immutable evidence URL, and every license or governing-terms URL across systems,
specifications, inference services, local runtimes, reviewed models, agent packs, labs, and robots,
including each lab's channel pages and the safety framework it publishes:

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
terms. Evaluated 2026-09-23 with no entry added: `https://deepinfra.com/terms` carries only
heading ids and its h1 section spans the footer `Latest Models` menu, and
`https://cohere.com/terms-of-use` has no stable id around its terms (React-generated ids only).
An entry from before stored text gains its text silently when its hash is unchanged,
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

Robots carry terms in place of licences, and the page that names a model is the fact the
record exists to report, so the checker hashes both. A robot's record `url` is checked as a
link; every item in `terms_evidence` is hashed as `web_terms` like any other terms page; and
in `evidence`, the items whose role is `named_model` or `model_interface` are hashed too. A
drifted named-model or model-interface page is resolved exactly as terms drift is: read the
stored diff, open the vendor's page, correct whatever the record now states wrongly, and
advance the affected human-owned `verified_at` so the next run accepts the new hash. Drift
never hides a robot and never rewrites its record. Evidence with the roles `product_page`,
`technical_documentation`, or `supporting` is link-checked only.

An evidence or terms-evidence item may carry `"unpinnable": true`, which says the page's
visible text changes between fetches so its hash can never settle. An unpinnable citation is
still link-checked — a `404` on it still fails — and is never drift-monitored. The veto is
per URL rather than per citation: if any record cites a URL as unpinnable, that URL is left
out of monitoring even where another citation of the same URL would have turned monitoring
on. Reviewing a page before citing it is `scripts/check_page_stability.py`, below.

`directory/robots.json` is in the refresh's staged path list, so a hand-written robot record
travels with a weekly refresh, but no step of the refresh ever writes one: automation does
not create, edit, or remove a robot record (ADR 037).

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

## Reading a cited page directly

Quote a page only after reading it yourself. A search-engine extract is a lead, not a read: the
2026-09-25 lab re-read ([`LAB_REREAD_2026-09-25.md`](history/LAB_REREAD_2026-09-25.md)) found labels no
page supported, and a filing cited as one company's annual report that was another's. Read each
page as a browser shows it:

```bash
node scripts/read_page.mjs --out page-reads <url>...
xvfb-run -a node scripts/read_page.mjs --headed --out page-reads <url>   # pages that render only in a full browser
node scripts/read_page.mjs --full-text --out page-reads <url>            # text in collapsed sections and long filings
xvfb-run -a node scripts/read_page.mjs --headed --from <page> <pdf-url>  # a document served only from its host's own link
```

Each page is saved as text headed by its URL, final URL, status, and title, and a PDF is saved
as a file for text extraction, for example with `uv run --with pypdf`. The browser uses
`HTTPS_PROXY` when it is set, and `CHROMIUM_PATH` names the browser binary where Playwright's
own download is absent. SEC EDGAR asks automated clients to declare themselves, so pass
`--user-agent` with a maintainer contact rather than reading EDGAR anonymously. The script never
solves a challenge or disguises the browser: when a page stays behind a bot check or an error,
record it as unreadable and cite a first-party page that can be read, as the lab re-read did for
Perplexity's careers page and ByteDance's offices page.

## The two-fetch rule for a robot's evidence

Before citing a page on a robot record, fetch it twice and compare the hashes the evidence
monitor would keep:

```bash
uv run python scripts/check_page_stability.py <url>
uv run python scripts/check_page_stability.py <url> --wait 5   # a shorter gap between fetches
```

The script fetches the URL, waits `--wait` seconds (120 by default), fetches it again, and
hashes each body with the same visible-text normalisation `check_evidence_links.py` uses. It
prints both hashes and exits `0` when they match, `1` when they differ, and `2` when either
fetch fails. Paste both hashes into the pull request description either way.

Differing hashes do not disqualify the page. Look for a stable first-party alternative
first; where none exists, cite the page with `"unpinnable": true`, which records the
instability on the record itself and keeps the link checker on it. An unpinnable page never
holds a robot out of the collection. See [`ROBOTS.md`](ROBOTS.md) and
[ADR 037](adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md).

### Guard threat model

`scripts/run_candidate_triage.py` and `scripts/run_hn_signals.py` share their mechanical
guards through `scripts/routine_guards.py`, and this threat model applies identically to
both. One behavior is not shared: `run_hn_signals.py finish` removes this run's assessments
whose pinned page changed before its guards run (see "Review a signal batch" in
[`RUNBOOKS.md`](RUNBOOKS.md)), while
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

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys only `web/`, and only after a push to `main` passes the complete `verify` workflow for that exact revision. It has no manual trigger, so nothing can publish a revision that skipped verification; the deployment workflow still runs its own local validation before publishing, which includes the web behavior tests and therefore requires `npm ci --ignore-scripts` in that job: the pinned-install guard reads `node_modules`, so a deploy job that skips the install reads every package as absent and fails. To redeploy a revision without a new commit, re-run its push-triggered **Verify AI Systems Atlas** run (`gh run rerun <run-id>`): a re-run keeps the original push event and commit, so a successful re-run starts the deployment again. That path follows GitHub's documented re-run behavior and has not yet been exercised in this repository. In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its default-branch deployment rule enabled; disable administrator bypass in the environment UI.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check; its `verify` gate job is the one required context, so the jobs behind it can be split or resharded without touching protection. Classic `main` protection requires pull requests, a passing `verify` result, conversation resolution, and linear history; it blocks force-pushes and deletion. It does not require the branch to be up to date with `main`: with squash merges and linear history that setting only forced every other open pull request to rebase and re-run the seven-minute gate after each merge, which serialised a day's merges into an hour and gave every flake another roll. A pull request whose base moved is still merged as a squash onto current `main`, and the push-triggered `verify` run on `main` plus the deploy's own checks catch a semantic conflict between two green branches; when that happens, revert or fix forward on `main`. A complementary default-branch security ruleset makes high-or-higher CodeQL findings merge-blocking. Zero required approvals is intentional while the project has one maintainer; require an independent approval when a second maintainer is available.

`.github/CODEOWNERS` assigns every path to the maintainer. Ownership is advisory while required approvals are zero; enable **Require review from Code Owners** on `main` once a second maintainer exists.

All actions are pinned to immutable commit SHAs, and repository settings enforce those pins while allowing only GitHub-owned actions plus `astral-sh/setup-uv`. The required verification job includes dependency review for pull requests. `.github/dependabot.yml` opens weekly pull requests for Actions, npm, pre-commit, and uv updates. The pre-commit and uv entries cover the seven tool versions pinned outside `package.json`, one pull request per tool on staggered schedules, so each still arrives as its own reviewable change under the policy above rather than as one sweep. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.

Secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting, and CodeQL default setup are enabled. Secret validity checks and non-provider patterns remain disabled; enable them if the repository settings expose those controls later. See [`SECURITY.md`](../SECURITY.md) for reporting; do not put suspected vulnerabilities in public issues.

Use squash merges and linear history; merge commits and rebase merges are disabled. Automatic merge and the update-branch button are enabled. Keep zero required approvals only while the repository has one maintainer.
