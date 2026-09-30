# ADR 050: Committed pages carry an asset-version placeholder; the deploy job writes the hashes

**Status:** Accepted. Supersedes the committed-hash convention described in [`docs/WEB.md`](../WEB.md) and the second implementation in `scripts/build_blog.py`.

## Context

Every page that loads a shared asset referenced it under a content hash: `styles.css?v=834bed2c70c9`, and for the app shell a `data-versions` block giving each of the 28 catalog files its own 12 hex characters. A hash in a committed file is a line that changes whenever any referenced asset changes. Two branches that touched *different* assets each rewrote the same line, so Git reported a conflict whose entire content was a hash — a conflict with no semantic content to reconcile.

The cost was not the conflict. It was everything the conflict forced. Resolving one meant taking `main`'s copy of the file, re-running the stamper, amending or adding a second commit, and force-pushing, because the other side held a real change that a plain rebase had already invalidated. The force-push then triggered the deploy workflow's `cancel-in-progress: true`, which killed the verification run the push had just started. So each recurrence cost a rebase, a regeneration, a commit, a force-push, and a five-minute CI run.

This was not a one-off. [#360](https://github.com/katagun/ai-systems-atlas/pull/360) reported it. It recurred twice on 2026-09-29 merging the Sakana and SSI branches, and three more times on 2026-09-30 on #391, #392, and #401, once per rebase onto a `main` that had itself restamped the file. Seven occurrences across three days, each landing on a branch whose actual subject was something else entirely. It was the first item in the `Now` section for that reason.

Two things made it structural rather than careless. The deploy job published the committed tree verbatim — it checked out, validated, and uploaded `web/` — so the hashes had to be in the commit for the published site to have them. And the convention was implemented twice: `scripts/build_asset_version.mjs` for the app shell, and a separate `asset_versions` in `scripts/build_blog.py` that reimplemented SHA-256 truncation in Python, so a blog edit restamped nine pages and the app shell and blog could drift apart without either check noticing.

The original motivation for hashing was sound and stays. A hand-maintained `?v=` failed once by shipping two changes under one number, and readers saw new markup with an old stylesheet. The guarantee is worth keeping.

## Decision

**A committed page carries the literal placeholder `?v=BUILD` and never a content hash.** `scripts/build_asset_version.mjs` is the only implementation that computes a hash, and it runs in the deploy job after checkout, replacing the placeholder in the published artifact. `build_blog.py` no longer hashes anything: it writes the same placeholder and asserts the files it links exist.

The placeholder is not a fallback or a degraded mode. It is the only committed state, and it is invariant — no asset change can alter it — which is precisely why the hash-only conflict can no longer be written. The guarantee the hashes existed for is unchanged in production: a reader still cannot pair a cached `styles.css` with a newer page.

The freshness check inverts, and the inversion is the point. `pre-commit`'s `freshness-assets` hook runs `--check`, which now demands placeholders and fails if a deploy build was committed, if a reference names a file that no longer exists, or if a page dropped the token. It can no longer fail because an asset changed, because there is nothing left to restamp. What the old check verified — that each stamp really is its file's hash — is now asserted in `tests/test_web.js` against the stamper's *output* rather than a committed line, which tests the same property without needing a hash in the repository. The deploy job runs the mirror check, `--stamped`, which fails if any published reference is not a resolved hash, so a placeholder can never ship.

Five alternatives were considered and rejected:

**Keep committed hashes and resolve conflicts by discipline.** Rejected: seven recurrences are the evidence, and the discipline required was to rebase immediately after every merge — an unrequested cost imposed on every future branch touching any asset.

**A `.gitattributes` merge driver unioning the hash lines.** Rejected: it would resolve the conflict automatically and wrongly. The two sides' hashes reflect two different asset states, and a union produces a page whose data-versions block matches neither tree, which is the stale-cache bug the convention exists to prevent, arrived at silently.

**A single deploy-wide token, the commit SHA.** Rejected as worse on the merits, not only on conflicts: it still edits one committed line, so the conflict remains, and it busts the entire cache on every deploy. The per-file scheme exists so the app's ~261 KB of gzipped JSON survives a deploy that changed one record.

**Content-addressed filenames, `app.9f3f6da4f28.js`.** Rejected: still a committed edit, and it rewrites every import path, the sitemap, and the hand-maintained `web/index.html` — a far larger diff for no gain in conflict terms.

**Stamping at serve time in `serve_web.py`.** Rejected as a second implementation of the thing this ADR exists to have exactly one of, and as unnecessary: no CDN sits in front of a local preview, so a stale cached stylesheet locally costs a hard refresh, not correctness.

## Consequences

- `scripts/build_asset_version.mjs` stamps the app shell and the whole blog tree, so the blog's nine pages and the app now share one implementation, and it exports its functions so tests can assert against stamped output. Its CLI runs only when invoked directly, so importing it cannot rewrite a working tree mid-test.
- `scripts/build_blog.py` loses `asset_versions` and `hashlib`. It keeps `assert_shared_assets`, because a blog page linking a missing stylesheet is still a build error worth failing on.
- **Local previews and the browser suite run against `?v=BUILD`.** Within a session, a stylesheet edit may not be picked up without a hard refresh. That is the accepted cost of one implementation; the alternative was a second stamper in the dev server.
- The author-facing regeneration sequence in [`AGENTS.md`](../../AGENTS.md) no longer includes the asset stamper: there is nothing for a branch to regenerate. It appears in the deploy job instead.
- `freshness-assets` keeps its hook id, so branch protection and the `Now` item's reference to it stay valid while its direction is reversed.
- A rename or deletion of an asset now fails `--check` by name, at commit time, rather than at the next deploy. That is a real improvement: the old check could not detect a broken reference at all, because it only compared hashes it had already resolved.
