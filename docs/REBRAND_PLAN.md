# Rebrand plan: AI Systems Atlas is canonical

Status: proposal. No branding string changes are made under this document; it records a
decision and a sequence for review.

## Decision

`AI Systems Atlas` is the canonical public name. `peacefulcoexistance` retires as a public
name. The site, the repository, the skill, the data licence, and the automation all speak
one name.

The word was never the problem. The problem is that the product currently has three public
names and none of them is the one in [`README.md`](../README.md):

| Surface | Name a reader sees | File |
|---|---|---|
| Repository, `llms.txt`, CC-BY attribution | AI Systems Atlas | [`README.md`](../README.md), [`web/llms.txt`](../web/llms.txt) |
| Site wordmark | peacefulcoexistance | [`web/index.html`](../web/index.html) |
| Site subtitle | AI systems directory | [`web/index.html`](../web/index.html) |
| Primary nav tab | Catalog | [`web/index.html`](../web/index.html) |
| Blog footer link | Browse the directory | [`scripts/build_blog.py`](../scripts/build_blog.py) |

## The blocker is duplication, not vocabulary

[`scripts/page_shell.py`](../scripts/page_shell.py) is the site's identity module:

```python
SITE_URL = "https://peacefulcoexistance.com/"
SITE_NAME = "peacefulcoexistance"
SITE_TAGLINE = "AI systems directory"
```

[`scripts/build_blog.py`](../scripts/build_blog.py) and
[`scripts/build_share_pages.py`](../scripts/build_share_pages.py) both import it. The
directory page does not: it is hand-written, and it repeats all three values as literals —
`title`, `og:title`, the meta description, `canonical`, the `aria-label`, the wordmark name,
the wordmark art, and the subtitle.

Nothing asserts the two agree. [`tests/test_web.js`](../tests/test_web.js) pins `SITE_URL`
consistency between `llms.txt` and the share-page builder, and
[`tests/test_share_pages.py`](../tests/test_share_pages.py) asserts generated share pages
carry the expected name — but no test compares `index.html` to `page_shell.py`. The two
definitions can drift silently today, and a rebrand applied to one of them would ship an
inconsistent site.

Phase 0 exists to close that gap before any string moves.

## The wordmark is not a string

The mark is a hand-built typographic treatment, not a swappable label. `web/index.html`
splits the name into five segments laid out on a 2x3 CSS grid, and
[`web/styles.css`](../web/styles.css) positions each one:

| Segment | Characters | Rule |
|---|---|---|
| `wm-pe` | `pe` | row 1, right-aligned |
| `wm-a` | `a` | spans rows 1-2, `2.2em` |
| `wm-ceful` | `ceful` | row 1 |
| `wm-coexist` | `coexist` | row 2, right-aligned |
| `wm-nce` | `nce` | row 2 |

Retiring the name means designing a new mark, not editing text. This is the only genuinely
creative decision in the rebrand, and it is the reason Phase 1 is not mechanical.

## Surfaces already consistent with AI Systems Atlas

These need no change, and confirming that is part of why the decision is cheap:

| Surface | Where |
|---|---|
| Repository and skill name | `ai-systems-atlas`, [`skills/ai-systems-atlas/`](../skills/ai-systems-atlas/) |
| Data licence attribution | [`LICENSE-DATA`](../LICENSE-DATA) |
| Agent entry point | [`web/llms.txt`](../web/llms.txt) |
| Workflow and audit titles | [`verify.yml`](../.github/workflows/verify.yml), [`.gitleaks.toml`](../.gitleaks.toml), [`.zizmor.yml`](../.github/zizmor.yml) |
| Test package name | [`package.json`](../package.json) |
| Internal identifiers | `ATLAS_*` env vars, the `com.atlas.*` launchd label, `.git/atlas/` cache path |

## Never rename

Each of these looks like a rename and is not:

- **`atlas.*` `localStorage` keys** — `atlas.badgeLegend`, `atlas.directory`, `atlas.hn`,
  `atlas.pageSize`. Renaming silently discards every reader's saved state. Keep them, or
  migrate with a read-fallback; never swap the name outright.
- **Blog post prose** — [`web/blog/`](../web/blog) holds dated editorial artifacts. Rewriting
  "The AI Systems Atlas catalogs software" inside a published post falsifies the archive.
  A new post may use the new name; an old post may not be edited.
- **Decision history** — [`docs/adr/`](../docs/adr) and
  [`docs/superpowers/`](../docs/superpowers) record what was decided under the old name.
  That is the correct record.
- **Published JSON** — record ids, `developer` values, and `models.dev` source metadata are
  data, not brand.

## Sequence

| Phase | Change | Visible | Risk | Reversible |
|---|---|---|---|---|
| 0 | Assert `index.html` identity literals against `page_shell.py` | No | Low | Yes |
| 1 | Flip wordmark, `title`, `og:title`, description, subtitle, `llms.txt` | Yes | Low | Yes |
| 2 | Move the domain | Yes | High | No |
| 3 | Rename `ATLAS_*` env vars and the launchd label | No | Medium | Yes |

Phase 0 is the prerequisite and is worth doing even if the rebrand never happens: it turns
a silent-drift class of bug into a failing test. Model it on the existing footer test, which
already holds the directory notices and the blog's copy to be identical.

Phase 1 is the actual rebrand. It touches no URL, no repository name, and no reader state,
and it needs a new wordmark designed and a `styles.css` grid laid out for it.

Phase 2 is the expensive one and is not recommended. The domain is bound in
[`web/CNAME`](../web/CNAME), `page_shell.SITE_URL`, [`web/sitemap.xml`](../web/sitemap.xml)
(676 references, regenerated), and every share page's canonical URL, and it carries the
inbound links and search history that a name change would discard. Nothing about the
editorial mission requires it.

Phase 3 has little value: the identifiers are invisible, and renaming them breaks the
launchd job and every local checkout's environment for no reader-facing gain. Keep them, or
defer them behind Phase 2 if it ever happens.

## Open decisions

1. **New wordmark, or keep the treatment?** The existing 2x3 segmented treatment can be
   re-cut for a new name, or replaced with a single-line mark. The latter is simpler and
   probably better for a 19-character name becoming 15.
2. **Subtitle.** "AI systems directory" is accurate and already used. Retain it, or replace
   it with something that carries the review guarantee instead ("reviewed AI systems", for
   instance), which is the thing that distinguishes the site.
3. **Domain.** Recommend never. Revisit only if inbound links become worthless.
4. **Nav tab.** "Catalog" is the reader-facing label for a tab whose code identifier is
   `directory`. This is a code-versus-label inconsistency, independent of the rebrand, and
   can be settled on its own at any time.
