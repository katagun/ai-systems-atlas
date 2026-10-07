# Operations

Use this document for verification, refresh, evidence-link, and repository policy. Step-by-step queue review and scheduled-routine procedures are in [`RUNBOOKS.md`](RUNBOOKS.md).

## Routine verification

```bash
uv run python scripts/regenerate.py --check
uv run ruff check scripts tests
uv run python scripts/validate_directory.py
uv run python scripts/run_python_tests.py
node --test tests/test_web.js
npm run lint:js
```

These commands verify the tree. Use `uv run python scripts/regenerate.py` to update generated files before checking them. Ruff and ESLint parse the source, so separate `compileall` and `node --check` steps are unnecessary.

`ruff` is pinned in the `dev` dependency group and installed by `uv sync`. Its rule set is configured in `pyproject.toml`; `eslint.config.mjs` covers the browser bundle, the build scripts, and the test suites. Both run in `verify.yml`. Ruff enforces the `requires-python` floor, which matters because CI only ever runs one Python version.

## Pre-commit

Install once per checkout with `pre-commit install`; the config's `default_install_hook_types` installs both the commit and the push hook. `.pre-commit-config.yaml` keeps the complete local checks. Every hook runs on `git commit` except the unit suite under coverage and browser end-to-end tests, which carry `stages: [pre-push]` and run on `git push`. Browser tests run locally only: GitHub CI never installs Chromium or runs Playwright. Bypass one check with `SKIP=<hook-id>`; prefer that to `--no-verify`, which removes every local check, including checks GitHub does not run.

GitHub's `verify` workflow always starts, and its final `verify` job remains the required check. Change detection selects which work is needed; the gate accepts a skipped job only when the change plan declared it unnecessary. Static verification always checks catalog validity, generated freshness, asset placeholders, fast Node behavior tests, and all lightweight content contracts. Ordinary lint receives changed filenames, including Python source changes. Tool or CI configuration changes and unrecognized inputs trigger whole-repository lint. Pre-commit environments are cached by operating system, architecture, Python version, hook configuration, and Python dependency inputs.

The full Python regression suite and its coverage threshold run for Python file changes, dependency manifests and locks, tool or CI configuration changes, and unrecognized inputs. Documentation, catalog, and ordinary web or JavaScript edits keep the content assertions that read those files without running the entire Python suite. `scripts/ci_changes.py` owns this classification. `scripts/run_content_checks.py` selects the content assertions from the existing tests and runs all groups on every CI run; it runs without a coverage threshold because it is only a subset. To run the content checks directly, use `uv run python scripts/run_content_checks.py`; `--scope docs`, `--scope catalog`, `--scope web`, and `--scope workflows` select individual groups locally and may be combined.

Pull requests compare their merge base with the reviewed tree. Main pushes include changes since the last successfully verified ancestor, so cancellation of an earlier run cannot hide its changes. If a safe baseline cannot be established, verification falls back to full lint and Python coverage. Scheduled and manually dispatched verification also run the full checks, including the full-history secret audit, with browser tests still local only.

Run every local check, including browser tests, with:

```bash
pre-commit install
pre-commit run --all-files --hook-stage pre-push
```

A test that fails without a change in what it tests is a bug with an owner, not a retry. A single green run is not evidence that a race is gone: on 2026-09-28 the badge-tooltip Escape test passed once on its pull request and then failed fourteen attempts in a row across every open pull request and `main`. Before merging a change to a hover, keyboard, or timing-sensitive browser test, run it locally and repeatedly (`npx playwright test <spec> -g "<title>" --repeat-each=8`), and fix a flake at its cause in the page or the test's setup rather than with a longer wait. Failed local runs retain traces in `test-results/`; inspect one with `npx playwright show-trace <file>.zip`.

What runs, and where it is configured:

- Generic hygiene from `pre-commit-hooks`: trailing whitespace, final newlines, LF endings, case conflicts, merge-conflict markers, YAML/JSON/TOML/XML syntax, private keys, no new submodules, no commits to `main`, and a 1000K ceiling on added files (the catalog JSON files peak at ~672K).
- Secrets use the pinned Gitleaks hook and `scripts/scan_secrets.py`: all fetched history locally, the relevant commit range on ordinary CI runs, and all fetched history on scheduled/manual runs, scanner configuration changes, or when no safe baseline is available. CI runs the hook separately from changed-file lint. Known-safe fixtures are allowlisted in `.gitleaks.toml`, never inline.
- Python: `ruff check --fix` and `ruff format` (pinned to the `pyproject.toml` dev group), plus `bandit` at medium severity and above. Low bandit findings are git-subprocess plumbing noise; the five medium sites carry `# nosec` with their allowlist justification on the preceding lines. Never add a bare `# nosec` without that justification.
- Complexity as ratchets, not targets: `C901` at 50 in `pyproject.toml` (today's maximum is 46 in `validate_hn_signals`) and the eslint `complexity` rule at 40 (today's maximum is 39 in `recommendationReasons`). Both fail any new function worse than the worst one already carried. Tighten them by refactoring, never with a `noqa` or an eslint-disable.
- Test coverage as a ratchet: `uv run python scripts/run_python_tests.py` runs the full unit suite under coverage and enforces `fail_under` in `pyproject.toml`. The Node behavior suite reports its own coverage with `node --test --experimental-test-coverage tests/test_web.js`. Raise the floor by adding tests, never by omitting files. The full Python suite retains this threshold when it runs; content subsets do not use it.
- JavaScript through the repo's own `eslint.config.mjs` (which already ignores generated trees), HTML through `htmlhint` (`.htmlhintrc`), stylesheets through `stylelint` (`.stylelintrc.json`), prose through `markdownlint-cli2` (`.markdownlint-cli2.jsonc`) with `--fix` so safe formatting applies on commit, workflows through `yamllint` (`.yamllint.yml`) and `zizmor` (suppressions with justification in `.github/zizmor.yml`), spelling through `codespell` (product names and house spellings in the hook's ignore list; real typos get fixed).
- Project verification shares the catalog-validation, Node behavior, generated-freshness, and asset-placeholder commands locally and in CI. `scripts/regenerate.py --check` covers every generated tree in dependency order; `scripts/build_asset_version.mjs --check` separately checks the committed asset placeholders. The local push-stage hooks also run the full Python coverage suite and Playwright (install Chromium once with `npx playwright install chromium`). CI runs full Python coverage conditionally and never runs Playwright.
- Generated and mirrored files are excluded from the content linters because their builders own them: `web/records/`, `web/app/`, `web/blog/`, `web/fonts/`, synced `web/*.json`, the sitemap, lockfiles, vendored dependencies, transient queues (`hn-signals.json`, `model-candidates.json`, `openrouter-model-leads.json`), and the upstream `models-dev.json` snapshot. The frozen `docs/superpowers/` planning archive is excluded from markdown linting for the same reason: reformatting history buys nothing.

### One command for the generated trees

`uv run python scripts/regenerate.py` regenerates every generated file under `web/`, in
dependency order, in about a second. `--check` writes nothing, reports **every** stale tree
rather than stopping at the first, and is the one freshness hook the verification runs. The
list of generators lives in that script alone.

It had to be consolidated. `AGENTS.md` carried a four-step regeneration sequence that named
`sync_web_data.py`, `build_web_payload.py`, `build_share_pages.py`, and
`build_asset_version.mjs`, and omitted `build_logos.mjs`, `build_fonts.mjs`, and
`build_blog.py` — so following the documented steps after picking up main left three
generated files stale, and the `freshness-logos` hook rejected the result in CI. A second copy of the generator list is a list that will
drift, which is what the prose was.

`build_logos.mjs` reads the synced `web/*.json` mirrors rather than `directory/`, so the order
is a real constraint: a card-mark build before a sync invents or loses marks. `sync_web_data.py`
gained a `--check` for this reason — it previously accepted the flag silently and wrote
anyway, so a caller checking for staleness was editing the tree instead of reading it.

### Picking up main

`uv run python scripts/update_from_main.py` merges `origin/main` and regenerates, then reports
what changed. It refuses on a dirty tree, never rebases, and never commits or pushes.

**Merging rather than rebasing is deliberate.** A rebase replays the branch, and a replay that
lands on regenerated files conflicts, so the recovery is resolve, regenerate, force-push. The
force-push is the expensive part: `verify.yml` sets `cancel-in-progress: true`, so each one
kills the verification run the push just started. On 2026-09-30 that discarded three five-minute
runs while a branch was brought up to date, and the cost read as the work rather than as the
merge strategy. A merge needs one push, cancels nothing, and produces one state to push instead
of one per rebase. The merge commit never reaches main, which is squash-merged, so it costs
this repository nothing but a non-linear branch history.

### Skipping the browser suite without losing anything else

`SKIP=e2e-browser-tests` skips only the local browser suite. `git push --no-verify`
skips everything, including the staleness gate, and that is how `web/logos.json` reached CI
on 2026-09-30 carrying a `simple-icons` version CI did not install: two pushes went out with
the check that would have caught it bypassed. Nothing in pre-commit can survive `--no-verify`.

There is deliberately no Prettier hook. Its defaults would reformat the hand-styled `web/app.js`, the compact catalog JSON the generators write with `indent=2`, and long-line prose docs — thousands of churn lines with no defect caught. `ruff format` owns Python, `eslint` owns JavaScript, and the generators own their output.

Generators that read `node_modules` check the install before they generate. `scripts/build_logos.mjs` and `scripts/build_fonts.mjs` both call `assertPinnedInstall` from
`scripts/install_pin.mjs`, which compares each package's installed version against
`package-lock.json` and refuses to run when they differ, naming the versions and `npm ci`.
The reason is that their output is committed and regenerated by CI: `web/logos.json` records
the icon packages that produced it, and `web/fonts.css` names them in its first line, so an
install that differs from the lock produces an artifact CI will reject however correct it looks
locally. This happened on 2026-09-30 — `simple-icons` 16.32.0 installed against a 16.33.0 pin,
both freshness hooks green locally, two consecutive CI rejections — and nothing in the
repository compared the lockfile to the artifact. After changing a version in `package.json`, run
`npm ci --ignore-scripts` before regenerating either file; the guard will say so if you forget.
Any new generator that reads an installed package must call the same guard, and
`tests/test_web.js` asserts the versions recorded in both artifacts equal the pinned ones.

Bump a pinned hook version deliberately, one tool at a time, running `pre-commit run --all-files` and the full verification after each bump. Never run `pre-commit autoupdate` blindly across all hooks: a new codespell dictionary or a stricter default can turn a passing tree red for reasons unrelated to any change under review.

## Review age

```bash
uv run python scripts/report_review_age.py
uv run python scripts/report_review_age.py --older-than 90 --collection systems
uv run python scripts/report_review_age.py --json --as-of 2026-09-14
```

The report reads `directory/` and prints one row per reviewed record, oldest editorial date first. It changes no date, fetches nothing, and always exits 0: it is a prompt for human re-review, never a gate.

- **reviewed** is the age of the record's own `verified_at`.
- **oldest evidence** is the oldest human review date attached to the record — any nested `verified_at` in its evidence, license evidence, terms, trust record, or reviewed flags, plus a system's dated items in `license-evidence.json` — and names where that date sits. `none` means the record has no dated evidence; pinned blob evidence carries no review date.
- **metadata** is the newest automated timestamp, `metadata_verified_at` or `stars_verified_at`, or `none` for records without GitHub metadata. It says how fresh the live numbers are, not how fresh the review is.

`pushed_at` is left out because it measures upstream activity, not Atlas review. `--older-than DAYS` keeps records whose review or oldest evidence is more than `DAYS` old; `--collection` accepts `systems`, `inference`, `runtimes`, `models`, `specifications`, `packs`, or `labs` and may repeat. A lab's oldest evidence includes the date its safety framework was read.

## Metadata refresh

The weekly refresh runs this alongside the models.dev import, the OpenRouter cross-check,
synchronization, payload and share-page regeneration, and verification, as one local script; see
"Scheduled workflow" in [`RUNBOOKS.md`](RUNBOOKS.md#scheduled-workflow) for `scripts/run_directory_refresh.py` and how it is scheduled and
published. The commands below run this step, the models.dev import, or the OpenRouter
cross-check on their own.

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

The same run also refreshes GitHub star counts for `directory/local-runtimes.json`, `directory/packs.json`, and `directory/specifications.json` records that carry a `repo`. This is a separate, lower-stakes pass: it only ever updates `stars` and `stars_verified_at`, it does not participate in the 80% success gate or license-drift machinery above, and a per-repository failure is a warning that leaves the existing value in place rather than an aborting condition. See [`LOCAL_RUNTIMES.md`](LOCAL_RUNTIMES.md). `directory/labs.json` and `directory/robots.json` carry no stars and are never touched by this pass.

models.dev discovery is a separate fail-closed import:

```bash
GITHUB_TOKEN=... uv run python scripts/import_models_dev.py
```

It resolves the upstream ref, downloads the commit-pinned repository archive, reads only provider-independent model TOMLs, and normalizes the complete `directory/models-dev.json` source snapshot plus the text-output `directory/model-candidates.json` review queue only after all source, count, schema, and collision checks pass. Run `scripts/sync_web_data.py` afterward so the published snapshot reaches `web/`. The token is optional locally. The importer removes already reviewed `source_id` values from the queue, and also filters the `source_id` values dispositioned in `directory/model-dispositions.json` while keeping them in the eligible count. Its only edit to `directory/models.json` is the envelope `source.commit`, moved to the new snapshot's commit in the same all-or-nothing write, because validation requires the two to match; it never edits a reviewed record. See [`MODELS.md`](MODELS.md) and [ADR 027](adr/027-complete-models-dev-source-catalog-is-published.md).

The OpenRouter cross-check runs next, against the snapshot the models.dev import just wrote:

```bash
uv run python scripts/import_openrouter.py
```

It needs no token and makes no request until `terms_reviewed_at` is recorded in `directory/openrouter-model-dispositions.json`; until then it reports that it skipped. Once enabled, it fetches OpenRouter's public model list once and replaces the unpublished `directory/openrouter-model-leads.json` only after its count, pagination, and schema checks pass. It writes nothing under `web/` and never edits models, candidates, or dispositions. See the OpenRouter section of [`MODELS.md`](MODELS.md) and [ADR 039](adr/039-openrouter-is-an-unpublished-cross-check-for-models-dev-gaps.md).

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

Reviewed-flag pages — the `url` of every `flags` entry on a reviewed model — are
first-party pages that carry the fact the flag exists to report, so they are
drift-hashed with the same normalisation as terms and fail as `flag page drift requires
review` when they change. A `statement_found` entry pins its page with `content_sha256`,
and that pin is the baseline: the first observation must match it, whenever the flag
was reviewed, and `--establish-baselines` cannot override a mismatch, which fails as
`flag pin mismatch`; the pin is also checked on every fetch of the page, not only when
it changes, so a wrong pin fails while the page is unchanged. A review that changes the
page's pin and advances the flag's `verified_at` accepts the new page only at the pinned
hash. Every flag citing a page must carry the page's current pin: when several
`statement_found` entries cite one page, each pin must equal its current hash, so a
drifted page keeps failing until every flag citing it is re-reviewed and re-pinned. An
`"unpinnable": true` entry is link-checked and never hashed; that veto applies
to every citation of the URL, so terms-drift monitoring also stops for another record
citing the same page, and validation refuses a page that one `statement_found` entry
cites as unpinnable and another pins. A `no_statement_found` entry's checked page is
hashed like terms, so a statement appearing there raises a review; it must therefore be
a page that pins, such as the system card or model page, and a page `--pin` reports as
unpinnable is not a valid checked page for that status. Drift never rewrites or
removes a flag; it fails the weekly verification and opens the `automation-failure`
issue, which waits for a human, as license drift does under AGENTS.md rule 10. To pin a
page while reviewing, run
`uv run python scripts/check_evidence_links.py --pin URL`: it fetches the page twice
with this normalisation, uses no cache, and prints either the `content_sha256` to record
or `unpinnable`. See
[ADR 042](adr/042-reviewed-flags-record-a-makers-risk-statement.md).

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

## App payloads

`uv run python scripts/build_web_payload.py` writes seven boot payloads, seven search indexes, one shared imported-model source-detail payload, and one per-record detail file for every reviewed catalog record under `web/app/` — the projection `web/app.js` actually loads at boot, on search focus, and on record or comparison open; see [ADR 026](adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md). `--check` rebuilds the tree in memory and fails when the committed files differ, and `verify.yml` runs it on every pull request. `scripts/update_directory.py` regenerates payloads right after `sync_web_data()`, since payloads project the files that call writes and cannot be built before it. The weekly refresh (`scripts/run_directory_refresh.py`) synchronizes again after the separate models.dev import, then runs the builder, share-page generator, and asset-version builder in that order. Dropping either synchronization/build ordering ships stale card metadata because the app payloads are committed rather than built during Pages deployment.

## Share pages

`uv run python scripts/build_share_pages.py` writes one static landing page per published record under `web/records/<collection>/<id>/`, plus `web/sitemap.xml` and `web/robots.txt`, from the canonical `directory/*.json` files. `--check` rebuilds in memory and fails when the committed files differ or when `web/records/` holds a file the catalog no longer produces, so a published record cannot change without its share page. The weekly refresh regenerates the pages after updating metadata, because a status promotion changes a page.

## Vendored fonts

`node scripts/build_fonts.mjs --check` rebuilds `web/fonts.css` and the woff2 files under `web/fonts/` in memory from the installed `@fontsource` packages and fails when the committed copies differ, so a font package bump or a face change cannot ship unvendored; regenerate with `node scripts/build_fonts.mjs`.

## Asset versions

`node scripts/build_asset_version.mjs --check` checks the opposite of what it used to. A committed page carries the
placeholder `?v=BUILD` and never a content hash, so there is nothing to regenerate after editing a stylesheet or a
script — that is the point, and it is why an asset change no longer produces a hash-only merge conflict. The hook
fails when a deploy build was committed, when a referenced file no longer exists, or when a page dropped the token.
The hashes are written once per deployment: `.github/workflows/deploy-pages.yml` runs
`node scripts/build_asset_version.mjs` after checkout and then `--stamped`, which fails if any published reference is
not a resolved hash, so a placeholder cannot ship. The `?v=` guarantee itself — that a changed asset is never served
from a stale cache — is asserted against the stamper's output in `tests/test_web.js` rather than against a committed
line. [ADR 050](adr/050-committed-pages-carry-an-asset-version-placeholder.md) records the decision and its costs; the
deploy step is the only place a hash is written, so nothing in a refresh routine needs regenerating. index.html references.

## Logo coverage

`node scripts/build_logos.mjs --check` rebuilds `web/logos.json` in memory and fails when the committed file no longer matches the record map, the published records, or the installed icon-package versions. It also reports every monogram record and flags candidates whose id or name now matches an available icon slug. Three rails keep coverage current:

- `verify.yml` runs the check on every pull request, so a record-map edit or icon-package bump cannot merge without a regenerated `web/logos.json`. Dependabot cannot regenerate it, so `.github/dependabot.yml` ignores `simple-icons` and `@lobehub/icons-static-svg`; the weekly refresh bumps both to their latest release (`npm install --save-exact`) and runs the generator in the same change (`ICON_PACKAGES` in `scripts/run_directory_refresh.py`).
- The weekly refresh (`scripts/run_directory_refresh.py`) prints the same logo-coverage report as part of its verification summary, surfacing records published without marks and newly available candidates.
- Dependabot's weekly npm pull requests bump the icon packages; the check fails on those PRs until the file is regenerated, which is when newly added icons become mappable.

A candidate hint is a review prompt, never an auto-mapping: confirm the icon depicts the record's product or the maintainer/operator named in its published data, then map it — or record `null` in `RECORD_MARKS` to decline it durably with a reason.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys only `web/`, and only after a push to `main` passes the complete `verify` workflow for that exact revision. It has no manual trigger. The verified revision must still be the current default-branch head, so rerunning an older verification cannot roll back the site. Deployment compares the site and deployment inputs with the last successful `github-pages` deployment, looking past failed, canceled, or skipped runs; unchanged inputs skip publication. The first deployment runs normally, and an unavailable deployment history fails instead of guessing what is live.

For changed inputs, the workflow checks out the verified SHA, stamps asset hashes, checks the stamps with `--stamped`, uploads `web/`, and deploys it. It does not reinstall Python or npm dependencies or repeat tests that verification already passed. Asset stamping uses Node's built-in modules. To retry a failed deployment without a new commit, re-run the current main revision's push-triggered **Verify AI Systems Atlas** run (`gh run rerun <run-id>`). A successful rerun triggers the deployment comparison again; an already published identical revision stays skipped.

In **Settings → Pages**, choose **GitHub Actions** as the source. Keep the `github-pages` environment and its default-branch deployment rule enabled; disable administrator bypass in the environment UI.

The site URL follows the repository owner and name. After a transfer or rename, update any explicit links or custom-domain configuration separately; the deployment workflow itself is owner-independent.

## Repository safeguards

`.github/workflows/verify.yml` is the required CI check; its `verify` gate job is the one required context, so the jobs behind it can be reorganized without touching protection. The workflow has no path filter: it always reports a result, and unnecessary work is skipped inside the workflow. Classic `main` protection requires pull requests, a passing `verify` result, conversation resolution, and linear history; it blocks force-pushes and deletion. It does not require the branch to be up to date with `main`. A pull request whose base moved is still merged as a squash onto current `main`, and the push-triggered `verify` run checks that merged revision before deployment; if two green branches conflict semantically, revert or fix forward on `main`. A complementary default-branch security ruleset makes high-or-higher CodeQL findings merge-blocking. Zero required approvals is intentional while the project has one maintainer; require an independent approval when a second maintainer is available.

`.github/CODEOWNERS` assigns every path to the maintainer. Ownership is advisory while required approvals are zero; enable **Require review from Code Owners** on `main` once a second maintainer exists.

All actions are pinned to immutable commit SHAs, and repository settings enforce those pins while allowing only GitHub-owned actions plus `astral-sh/setup-uv`. The required verification job includes dependency review for pull requests. `.github/dependabot.yml` opens weekly pull requests for Actions, npm, pre-commit, and uv updates. The pre-commit and uv entries cover the seven tool versions pinned outside `package.json`, one pull request per tool on staggered schedules, so each still arrives as its own reviewable change under the policy above rather than as one sweep. Workflow tokens use least privilege, deployments are serialized, and verification jobs cancel superseded runs.

Secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting, and CodeQL default setup are enabled. Secret validity checks and non-provider patterns remain disabled; enable them if the repository settings expose those controls later. See [`SECURITY.md`](../SECURITY.md) for reporting; do not put suspected vulnerabilities in public issues.

Use squash merges and linear history; merge commits and rebase merges are disabled. Automatic merge and the update-branch button are enabled. Keep zero required approvals only while the repository has one maintainer.
