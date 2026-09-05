# Design: a blog surface for the Atlas

**Date:** 2026-09-05
**Status:** Approved design, implemented in-session (no separate implementation plan)

## Problem

The Atlas publishes 174 reviewed systems, 55 exclusions, and 22 architecture decisions, and every one of them is a verdict about someone else's work. Nothing on the site accounts for how the catalog itself was made, what it got wrong, or why a reader should trust its method. That account is editorial writing, and there is nowhere to put it: the site is a data-driven application plus one generated static page per published record.

This adds a blog surface — a generator, an index, per-post pages, and one navigation link — seeded with a first post about how the Atlas was built.

## Non-goals

No comments, tags, categories, pagination, RSS, or author pages. No third-party dependency, no build toolchain, no client-side JavaScript on a post page. The blog is not part of the catalog: posts are not records, carry no score, and are not published as JSON.

## Decisions

### 1. A post is one markdown file in `blog/`

`blog/YYYY-MM-DD-slug.md`. The date prefix orders the index; the slug becomes the URL `/blog/<slug>/`. Frontmatter is a flat `key: value` block between `---` fences carrying `title`, `date`, `summary`, and `author`.

Frontmatter is parsed by a small purpose-built reader, not YAML. `pyproject.toml` declares `dependencies = []` and the project means it — `docs/WEB.md` records that the published page makes no third-party request at runtime, and `verify.yml` runs dependency review on lockfile changes. A blog post is not a reason to spend that posture.

### 2. A deliberately small markdown renderer, escape-first and fail-closed

There is no markdown library available for the same reason. `scripts/build_blog.py` implements a documented subset: ATX headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``, links, unordered lists, blockquotes, fenced code blocks, and horizontal rules.

Two properties make this safe rather than reckless, and both mirror rules the repository already holds:

- **Escape first, then render.** Every character of post text passes through `html.escape` before any markup is emitted, exactly as `scripts/build_share_pages.py` does. Post text can never introduce an element, so a raw HTML tag in a draft renders as visible text rather than being rejected — escaping is the stronger answer than refusal here.
- **Reject what it does not understand.** An unsupported construct — a table, an image, an ordered list, a reference link — fails the build naming the file and line, rather than being passed through or silently mangled. This is the same fail-closed posture as [ADR 005](../../adr/005-fail-closed-license-drift.md): an unrecognised input stops the run instead of producing a quiet wrong answer.

The subset is documented in `docs/BLOG.md` so an author knows the vocabulary before writing rather than discovering it at build time.

### 3. `build_blog.py` owns blog pages; `build_share_pages.py` keeps the sitemap

The blog generator writes `web/blog/index.html` and `web/blog/<slug>/index.html`. It imports `SITE_URL`, `SITE_NAME`, `SITE_TAGLINE`, and `STYLE` from `scripts/page_shell.py` so the visual language has exactly one definition.

Those constants were originally read straight out of `build_share_pages.py`, which produced a circular import the moment that module needed the blog's URLs — and a further trap, because naming the extracted module `site.py` silently shadows a standard library module and only breaks when the script is run directly, which is how this repository runs it. Both were caught before commit; the constants now live in `page_shell.py`, which is what they always were.

`build_share_pages.py` already owns `web/sitemap.xml` and `web/robots.txt`. Rather than a second writer for one file, it imports `blog_sitemap_entries()` from the blog module and folds those URLs into the sitemap it already builds. One owner per output; neither module duplicates the other's knowledge of where pages live.

### 4. The same freshness rail as every other generated artifact

`build_blog.py --check` rebuilds in memory and fails when a committed file differs, when a post source has no built page, or when `web/blog/` holds a page no source produces. This is the rule `build_share_pages.py`, `build_fonts.mjs`, `build_logos.mjs`, and `build_asset_version.mjs` all follow, and it is added to `verify.yml` beside them. A post cannot drift from its source, and a deleted post cannot leave a live page behind.

### 5. One line in `index.html`, in `.header-tools`

The blog link sits beside *Suggest a system*, not in `<nav class="tabs">`.

The tabs switch views inside the application without navigating; the blog is a separate page. `.header-tools` already holds exactly the links that leave the app. This is also the smallest possible collision surface with the in-flight Models work, which is editing the tab list in a parallel branch.

### 6. Post pages are self-contained

A post page loads `fonts.css` and its own inlined `STYLE`, like a share page. No `app.js`, no catalog JSON, no client-side state. A post is readable with JavaScript disabled and costs one HTML request plus the shared fonts.

### 7. The first post: evidence discipline applied to itself

`blog/2026-09-05-cite-your-sources-including-yourself.md`, written in the first person by Claude, with the human maintainer as editor and driver, and labelled as such on the page. Its organising rule is the catalog's own: every factual claim points at a commit, a session transcript, or a file in the repository.

It covers what the sources actually support: the limit of the author's own recall, what the catalog is and the project it split from, the discipline of exclusion, four named and dated errors with the mechanism that caught each, and what adversarial review bought. Failures are included as evidence that the method works, not as confession.

## Verification

- `tests/test_blog.py`: frontmatter parsing and its rejections, slug and URL derivation, index ordering, escaping (a post containing `<script>` renders inert), the unsupported-construct rejection with line number, `--check` staleness and orphan detection, and sitemap entry shape.
- `tests/test_web.js`: the blog link exists in `index.html` and points at `blog/`.
- `tests/e2e/page-health.spec.js`: `/blog/` and the first post return 200 and render their title.
- Every command in `AGENTS.md`, plus `ruff` and `eslint`.
- Manual: read the built post in a browser in both palettes before merge.

## Risks and open questions

- **The renderer is a subset, and subsets surprise authors.** Mitigated by rejecting unknown constructs loudly and documenting the vocabulary, but the first author to want a table will hit it. The answer then is to add the construct to the renderer with a test, not to loosen the escaping.
- **An essay is not a reviewed record.** The blog sits on a site whose credibility rests on cited evidence. The post's own rule — every claim sourced — is the mitigation, and the page states plainly that it is editorial writing rather than a catalog record.
- **Attribution.** A first-person post by an AI on a site carrying a person's name needs to say so on the page, not only in the repository.
- **Parallel work.** The Models branch edits `web/index.html`, `web/styles.css`, and `docs/WEB.md`. This design touches the first two minimally and takes a new file for its own documentation instead of expanding `docs/WEB.md`.
