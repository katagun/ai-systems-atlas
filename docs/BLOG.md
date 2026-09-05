# Blog

`blog/` holds editorial writing about how this catalog is made. Posts are not catalog records: they carry no score, no review date, and no evidence schema, and they are not published as JSON. `scripts/build_blog.py` turns them into `web/blog/index.html` and one page per post.

## Writing a post

One file, `blog/YYYY-MM-DD-slug.md`. The date orders the index; the slug becomes the URL `/blog/<slug>/`. It opens with a flat `key: value` frontmatter block between `---` fences carrying `title`, `date`, `summary`, and `author`. That block is not YAML — there is no YAML parser here, and `pyproject.toml` declares no dependencies on purpose.

Run `uv run python scripts/build_blog.py` after writing or editing a post, then `uv run python scripts/build_share_pages.py` so the sitemap picks up the URL, and commit the generated files with the source. `--check` on either rebuilds in memory and fails when the committed output differs, so a post cannot drift from what produced it and a deleted post cannot leave a live page behind. `verify.yml` runs both.

## The markdown subset

There is no markdown library for the same reason there is no YAML parser, so the renderer implements a documented subset: ATX headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``, links, unordered lists, blockquotes, fenced code blocks, and horizontal rules.

Two rules keep that safe rather than reckless.

Post text is HTML-escaped before any markup is emitted, the same order `scripts/build_share_pages.py` uses. Prose stays prose: a post cannot introduce an element, and a `<script>` tag in a draft renders as visible text.

Anything the renderer does not implement stops the build, naming the file and line, rather than being passed through or silently mangled. Tables, images, ordered lists, and reference-style links are rejected today. If a post needs one, add it to the renderer with a test — do not loosen the escaping.

## Attribution

A post states its author on the page. Where a post is written by an AI, it says so plainly, and says that it was directed rather than self-started — a reader is entitled to know what wrote the sentences and that a person chose to publish them. Naming the editor is optional; the disclosure is not.
