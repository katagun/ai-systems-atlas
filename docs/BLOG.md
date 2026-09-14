# Blog

`blog/` holds editorial writing about how this catalog is made. Posts are not catalog records: they carry no score, no review date, and no evidence schema, and they are not published as JSON. `scripts/build_blog.py` turns them into `web/blog/index.html` and one page per post.

## Writing a post

One file, `blog/YYYY-MM-DD-slug.md`. The date orders the index; the slug becomes the URL `/blog/<slug>/`. It opens with a flat `key: value` frontmatter block between `---` fences carrying `title`, `date`, `summary`, and `author`. That block is not YAML — there is no YAML parser here, and `pyproject.toml` declares no dependencies on purpose.

Run `uv run python scripts/build_blog.py` after writing or editing a post, then `uv run python scripts/build_share_pages.py` so the sitemap picks up the URL, and commit the generated files with the source. `--check` on either rebuilds in memory and fails when the committed output differs, so a post cannot drift from what produced it and a deleted post cannot leave a live page behind. `verify.yml` runs both.

## The page shell

A blog page is the site's own shell around a reading measure. It links `web/styles.css` and `web/fonts.css`, the same files the directory page loads, under the same twelve-character content stamp `scripts/build_asset_version.mjs` gives `index.html`, so `build_blog.py --check` fails whenever either file changes without a blog rebuild and a cached stylesheet can never be paired with a newer page. The blog's own rules live in `styles.css` under `.writing-page`, `.writing`, `.byline`, `.post-card`, and `.footer-meta`, and take every colour, radius, and face from its tokens. The footer is the directory page's: the same three notices verbatim, checked against `web/index.html` by `tests/test_blog.py`, with the blog's own links in the slot where the directory page prints its data date.

Every page opens with the same header as the directory page: the wordmark, the primary navigation, the Suggest link, the theme control, and the GitHub link. It is static markup emitted by `scripts/build_blog.py`, not shared with `web/index.html`, because the main page's tabs are buttons that `web/app.js` wires up; the blog's links reach the same views through the `view` query parameter the app restores on load. A blog page loads no application script and fetches nothing beyond the stylesheets and fonts. Its one inline script does what `index.html`'s pre-paint stamp and `app.js`'s theme functions do together: it applies a stored choice before first paint, cycles the control through system, light, and dark, persists the choice under the same `theme` key, and keeps the control's name and the `theme-color` meta in step, so a choice made on a post is the site's choice.

## The markdown subset

There is no markdown library for the same reason there is no YAML parser, so the renderer implements a documented subset: ATX headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``, links, unordered lists, blockquotes, fenced code blocks, and horizontal rules.

Two rules keep that safe rather than reckless.

Post text is HTML-escaped before any markup is emitted, the same order `scripts/build_share_pages.py` uses. Prose stays prose: a post cannot introduce an element, and a `<script>` tag in a draft renders as visible text.

Link destinations are allowlisted. A post may link to an absolute HTTPS URL or use a same-site relative path, query, or fragment. Other schemes, protocol-relative or backslash forms, control characters, credentials, and malformed HTTPS URLs stop the build rather than becoming active browser content.

Anything the renderer does not implement stops the build, naming the file and line, rather than being passed through or silently mangled. Tables, images, ordered lists, and reference-style links are rejected today. If a post needs one, add it to the renderer with a test — do not loosen the escaping.

## Attribution

A post states its author on the page. Where a post is written by an AI, it says so plainly, and says that it was directed rather than self-started — a reader is entitled to know what wrote the sentences and that a person chose to publish them. Naming the editor is optional; the disclosure is not.
