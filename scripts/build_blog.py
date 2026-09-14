#!/usr/bin/env python3
"""Generate the blog index and one static page per post in ``blog/``.

Posts are markdown, but there is no markdown library here and none is coming:
``pyproject.toml`` declares no dependencies and the published site makes no
third-party request at runtime. So this renders a documented subset, and it does
two things that keep that safe rather than reckless.

It escapes every character of post text before emitting any markup, the same
order ``build_share_pages.py`` uses, so a post is prose and can never introduce
an element. And it refuses what it does not implement: a table or an image stops
the build naming the line, instead of being silently mangled into something the
author never wrote. An unrecognised input fails closed, as it does everywhere
else in this repository.
"""
from __future__ import annotations

import html
import ipaddress
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

try:
    from .page_shell import SITE_NAME, SITE_TAGLINE, SITE_URL, STYLE
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from page_shell import SITE_NAME, SITE_TAGLINE, SITE_URL, STYLE

ROOT = Path(__file__).resolve().parents[1]
POSTS = "blog"
REQUIRED_KEYS = {"title", "date", "summary", "author"}
FILENAME = re.compile(r"(\d{4}-\d{2}-\d{2})-(?P<slug>[a-z0-9][a-z0-9-]*)\.md")
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
SUPPORTED = (
    "headings, paragraphs, bold, italic, inline code, links, unordered lists, "
    "blockquotes, fenced code blocks and horizontal rules"
)

INLINE_CODE = re.compile(r"`([^`]+)`")
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
HOST_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", re.IGNORECASE)
LEGACY_NUMBER_LABEL = re.compile(r"(?:[0-9]+|0x[0-9a-f]+)", re.IGNORECASE)

# Constructs this renderer does not implement. Each would otherwise be emitted as
# literal text, which reads as a bug in the post rather than a gap in the tool.
UNSUPPORTED = (
    (re.compile(r"^\s*\|"), "a table"),
    (re.compile(r"!\["), "an image"),
    (re.compile(r"^\s*\d+\.\s"), "an ordered list"),
    (re.compile(r"^\s*\[[^\]]+\]:\s"), "a reference link definition"),
)


class PostError(Exception):
    """A post the renderer refuses to guess at."""


def _well_formed_hostname(hostname: str) -> bool:
    """Accept ASCII DNS names, valid punycode, and canonical IP literals."""
    if not hostname.isascii() or "%" in hostname or hostname.endswith("."):
        return False
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        labels = hostname.split(".")
        if all(LEGACY_NUMBER_LABEL.fullmatch(label) for label in labels):
            # Browsers reinterpret several non-canonical integer, octal, and hex
            # forms as IPv4. Accept only the canonical form parsed above.
            return False
        if len(hostname) > 253 or not all(HOST_LABEL.fullmatch(label) for label in labels):
            return False
        for label in labels:
            if not label.lower().startswith("xn--"):
                continue
            try:
                decoded = label.encode("ascii").decode("idna")
                if decoded.encode("idna").decode("ascii").lower() != label.lower():
                    return False
            except UnicodeError:
                return False
        return True
    return True


def slug_for(filename: str) -> str:
    match = FILENAME.fullmatch(filename)
    if not match:
        raise PostError(f"{filename}: a post is named YYYY-MM-DD-slug.md")
    return match.group("slug")


def post_url(slug: str) -> str:
    return f"{SITE_URL}{POSTS}/{slug}/"


def parse_frontmatter(text: str, name: str) -> tuple[dict[str, str], str, int]:
    """Read the flat `key: value` block a post opens with. Not YAML, deliberately."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        raise PostError(f"{name}: a post must open with a --- frontmatter fence")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise PostError(f"{name}: the frontmatter fence is never closed") from None
    meta: dict[str, str] = {}
    for number, line in enumerate(lines[1:end], start=2):
        if not line.strip():
            continue
        if ":" not in line:
            raise PostError(f"{name} line {number}: frontmatter needs `key: value`")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    missing = sorted(REQUIRED_KEYS - set(meta))
    unknown = sorted(set(meta) - REQUIRED_KEYS)
    if missing:
        raise PostError(f"{name}: frontmatter is missing {missing}")
    if unknown:
        raise PostError(f"{name}: frontmatter has unknown keys {unknown}")
    if not ISO_DATE.fullmatch(meta["date"]):
        raise PostError(f"{name}: date must be an ISO date, got {meta['date']!r}")
    try:
        date.fromisoformat(meta["date"])
    except ValueError:
        raise PostError(f"{name}: date {meta['date']!r} is not a real date") from None
    return meta, "\n".join(lines[end + 1:]), end + 2


def _validate_link_destination(escaped_destination: str, name: str) -> None:
    """Allow links that cannot turn post prose into active browser content."""
    # ``_inline`` receives HTML-escaped text. One unescape produces the exact
    # attribute value the HTML parser will expose to the browser's URL parser.
    destination = html.unescape(escaped_destination)
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in destination):
        raise PostError(f"{name}: a link destination cannot contain control characters")
    if "\\" in destination or destination.startswith("//"):
        raise PostError(f"{name}: a link destination must not be protocol-relative")

    try:
        parsed = urlsplit(destination)
        hostname = parsed.hostname
        _ = parsed.port  # Validate malformed and out-of-range ports too.
    except ValueError as error:
        raise PostError(f"{name}: invalid link destination {destination!r}: {error}") from None

    if not parsed.scheme:
        if parsed.netloc:
            raise PostError(f"{name}: a relative link cannot name another host")
        return
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or not hostname
        or not _well_formed_hostname(hostname)
    ):
        raise PostError(
            f"{name}: a link must be an absolute HTTPS URL or a same-site relative URL"
        )
    if parsed.username is not None or parsed.password is not None:
        raise PostError(f"{name}: an HTTPS link cannot contain credentials")
    if "[" in parsed.netloc or "]" in parsed.netloc:
        try:
            ipaddress.IPv6Address(hostname)
        except ValueError:
            raise PostError(
                f"{name}: a bracketed HTTPS host must be an IPv6 address"
            ) from None


def _inline(text: str, name: str) -> str:
    """Apply inline markup to text that is ALREADY html-escaped."""
    placeholders: list[str] = []

    def stash(match: re.Match[str]) -> str:
        placeholders.append(f"<code>{match.group(1)}</code>")
        return f"\x00{len(placeholders) - 1}\x00"

    def link(match: re.Match[str]) -> str:
        destination = match.group(2)
        _validate_link_destination(destination, name)
        return f'<a href="{destination}" rel="noreferrer">{match.group(1)}</a>'

    text = INLINE_CODE.sub(stash, text)
    text = LINK.sub(link, text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: placeholders[int(m.group(1))], text)


def render_markdown(body: str, name: str, first_line: int = 1) -> str:
    """Render the supported subset. Escaping happens first, so text stays text."""
    lines = html.escape(body).split("\n")
    out: list[str] = []
    paragraph: list[str] = []
    quote: list[str] = []
    items: list[str] = []
    fence: list[str] | None = None

    def flush() -> None:
        nonlocal paragraph, quote, items
        if paragraph:
            out.append(f"<p>{_inline(' '.join(paragraph), name)}</p>")
            paragraph = []
        if items:
            rendered = "".join(f"<li>{_inline(item, name)}</li>" for item in items)
            out.append(f"<ul>{rendered}</ul>")
            items = []
        if quote:
            out.append(f"<blockquote><p>{_inline(' '.join(quote), name)}</p></blockquote>")
            quote = []

    for offset, line in enumerate(lines):
        number = first_line + offset
        stripped = line.strip()
        if stripped.startswith("```"):
            if fence is None:
                flush()
                fence = []
            else:
                out.append(f"<pre><code>{chr(10).join(fence)}</code></pre>")
                fence = None
            continue
        if fence is not None:
            fence.append(line)
            continue
        for pattern, what in UNSUPPORTED:
            if pattern.search(line):
                raise PostError(
                    f"{name} line {number}: {what} is not supported. "
                    f"This renderer implements {SUPPORTED}."
                )
        if not stripped:
            flush()
        elif re.fullmatch(r"-{3,}", stripped):
            flush()
            out.append("<hr>")
        elif stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            if not 1 <= level <= 6 or not stripped[level:].startswith(" "):
                raise PostError(f"{name} line {number}: a heading is 1-6 # then a space")
            flush()
            out.append(f"<h{level}>{_inline(stripped[level + 1:].strip(), name)}</h{level}>")
        elif stripped.startswith("&gt; "):  # `> ` survives escaping as `&gt; `
            quote.append(stripped[5:])
        elif stripped.startswith("- "):
            if paragraph:
                flush()
            items.append(stripped[2:])
        else:
            if items or quote:
                flush()
            paragraph.append(stripped)
    if fence is not None:
        raise PostError(f"{name}: a fenced code block is never closed")
    flush()
    return "\n".join(out)


def load_posts(root: Path = ROOT) -> list[dict[str, Any]]:
    """Every post, newest first."""
    directory = root / POSTS
    posts: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.md")) if directory.exists() else []:
        text = path.read_text(encoding="utf-8")
        meta, body, first_line = parse_frontmatter(text, path.name)
        posts.append({
            "slug": slug_for(path.name),
            "html": render_markdown(body, path.name, first_line),
            **meta,
        })
    posts.sort(key=lambda post: (post["date"], post["slug"]), reverse=True)
    return posts


# The main page's header, reproduced as static markup. Its view tabs are buttons that
# app.js wires up; here they are links to the same views through the `view` query
# parameter the app restores on load. There is no theme control because a blog page
# carries no script: like the share pages, it follows the OS preference.
VIEWS = (("finder", "Finder"), ("models", "Models"), ("specifications", "Specifications"),
         ("taxonomy", "Taxonomy"), ("api", "API"))
REPOSITORY = "https://github.com/katagun/ai-systems-atlas"
GITHUB_ICON = (
    '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 '
    "0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61"
    "C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 "
    "2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22"
    "-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 "
    "2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625"
    "-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 "
    '24 12.297c0-6.627-5.373-12-12-12"/></svg>'
)

HEADER_STYLE = """
.skip-link { position: fixed; left: 1rem; top: -5rem; z-index: 20; padding: .7rem 1rem; border-radius: 999px; background: var(--text); color: var(--bg); }
.skip-link:focus { top: 1rem; }
.site-header { min-height: 88px; padding: 0 max(1.5rem, calc((100% - 1360px) / 2)); border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(20px) saturate(140%); }
.brand { display: flex; flex-direction: column; justify-content: center; gap: .18rem; }
.brand a { color: inherit; text-decoration: none; }
.wordmark { display: block; font: 700 1.05rem/1 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -.035em; }
.wordmark-name { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
.wordmark-art { display: inline-grid; grid-template-columns: auto auto auto; align-items: center; line-height: 1.02; }
.wm-pe { grid-area: 1 / 1 / 2 / 2; text-align: right; }
.wm-a { grid-area: 1 / 2 / 3 / 3; font-size: 2.2em; line-height: .68; padding: 0 1px; }
.wm-ceful { grid-area: 1 / 3 / 2 / 4; }
.wm-coexist { grid-area: 2 / 1 / 3 / 2; text-align: right; }
.wm-nce { grid-area: 2 / 3 / 3 / 4; }
.brand small { display: block; color: var(--muted); font: 500 .6rem "JetBrains Mono", "SFMono-Regular", Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.tabs { display: flex; align-self: center; gap: 1.4rem; }
.tab-link { padding: .3rem .05rem .5rem; border-bottom: 2px solid transparent; color: var(--muted); font-size: .78rem; font-weight: 600; text-decoration: none; white-space: nowrap; }
.tab-link:hover { color: var(--text); }
.tab-link.is-active { color: var(--text); border-bottom-color: var(--text); }
.header-tools { display: flex; align-items: center; gap: .5rem; justify-self: end; }
.suggest-link, .github-link { height: 38px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--panel) 50%, transparent); color: var(--muted); text-decoration: none; }
.suggest-link { padding: 0 .75rem; font-size: .78rem; font-weight: 600; white-space: nowrap; }
.github-link { width: 38px; }
.github-link svg { width: 18px; height: 18px; fill: currentColor; }
.suggest-link:hover, .github-link:hover { color: var(--text); border-color: var(--muted); }
@media (max-width: 1100px) { .site-header { grid-template-columns: 1fr auto auto; column-gap: .75rem; } }
@media (max-width: 720px) { .site-header { padding: .75rem; display: flex; flex-wrap: wrap; gap: .65rem; justify-content: space-between; } .header-tools { order: 2; } .brand small { display: none; } .tabs { order: 3; width: 100%; gap: .8rem; overflow-x: auto; } .tab-link { flex: 0 0 auto; font-size: .7rem; } }
""".strip()


def render_header(root: str, blog: str) -> str:
    """The site header for a page whose path to the site root is ``root``."""
    views = "".join(f'<a class="tab-link" href="{root}?view={view}">{label}</a>' for view, label in VIEWS)
    return (
        '<a class="skip-link" href="#main">Skip to content</a>\n'
        '<header class="site-header">\n'
        f'<div class="brand"><a href="{root}"><strong class="wordmark">'
        f'<span class="wordmark-name">{SITE_NAME}</span>'
        '<span class="wordmark-art" aria-hidden="true"><span class="wm-pe">pe</span><span class="wm-a">a</span>'
        '<span class="wm-ceful">ceful</span><span class="wm-coexist">coexist</span><span class="wm-nce">nce</span></span>'
        f'</strong><small>{SITE_TAGLINE}</small></a></div>\n'
        '<nav class="tabs" aria-label="Primary navigation">'
        f'<a class="tab-link" href="{root}">Directory</a>{views}'
        f'<a class="tab-link is-active" aria-current="page" href="{blog}">Blog</a></nav>\n'
        '<div class="header-tools">'
        f'<a class="suggest-link" href="{REPOSITORY}/issues/new?template=system-suggestion.yml" target="_blank" rel="noreferrer">Suggest a system</a>'
        f'<a class="github-link" href="{REPOSITORY}" target="_blank" rel="noreferrer" aria-label="GitHub" title="Source on GitHub">{GITHUB_ICON}</a>'
        "</div>\n</header>"
    )


def _document(title: str, description: str, url: str, body: str, root: str, footer: str) -> str:
    """One page. ``root`` is the relative path back to the site root; ``footer`` its links."""
    blog = "./" if root == "../" else root[3:]
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · {SITE_NAME}</title>
<meta name="description" content="{html.escape(description)}">
<link rel="canonical" href="{html.escape(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:url" content="{html.escape(url)}">
<meta name="theme-color" content="#f7f9fc">
<link rel="stylesheet" href="{root}fonts.css">
<style>
{STYLE}
{HEADER_STYLE}
</style>
</head>
<body>
{render_header(root, blog)}
<main id="main">
{body}
</main>
<footer>{SITE_NAME} · {SITE_TAGLINE} · {footer}</footer>
</body>
</html>
"""


def render_post_page(post: dict[str, Any]) -> str:
    body = (
        '<p class="eyebrow">Editorial writing · not a catalog record</p>\n'
        f'<h1>{html.escape(post["title"])}</h1>\n'
        f'<p class="lead">{html.escape(post["summary"])}</p>\n'
        f'<p class="actions">{html.escape(post["author"])} · {html.escape(post["date"])}</p>\n'
        f'{post["html"]}\n'
    )
    footer = '<a href="../">All writing</a> · <a href="../../">Browse the directory</a>'
    return _document(post["title"], post["summary"], post_url(post["slug"]), body, "../../", footer)


def render_index_page(posts: list[dict[str, Any]]) -> str:
    entries = "\n".join(
        f'<section class="detail-block"><h2><a href="{post["slug"]}/">{html.escape(post["title"])}</a></h2>'
        f'<p>{html.escape(post["summary"])}</p>'
        f'<p class="actions">{html.escape(post["author"])} · {html.escape(post["date"])}</p></section>'
        for post in posts
    ) or '<p class="lead">Nothing published yet.</p>'
    body = (
        '<p class="eyebrow">Editorial writing · not catalog records</p>\n'
        "<h1>Writing</h1>\n"
        '<p class="lead">How this catalog is built, and where it has been wrong.</p>\n'
        f'<div class="detail-grid">{entries}</div>\n'
    )
    description = "How the AI Systems Atlas is built, and where it has been wrong."
    # The index sits one level shallower than a post, so its relative links differ.
    footer = '<a href="../">Browse the directory</a>'
    return _document("Writing", description, f"{SITE_URL}{POSTS}/", body, "../", footer)


def build_pages(root: Path = ROOT) -> dict[str, str]:
    posts = load_posts(root)
    pages = {f"{POSTS}/{post['slug']}/index.html": render_post_page(post) for post in posts}
    pages[f"{POSTS}/index.html"] = render_index_page(posts)
    return pages


def blog_sitemap_entries(root: Path = ROOT) -> list[tuple[str, str]]:
    """(url, lastmod) for the index and every post, for the sitemap owner to fold in."""
    posts = load_posts(root)
    entries = [(post_url(post["slug"]), post["date"]) for post in posts]
    if posts:
        entries.insert(0, (f"{SITE_URL}{POSTS}/", posts[0]["date"]))
    return entries


def main(argv: list[str], root: Path = ROOT) -> int:
    try:
        pages = build_pages(root)
    except PostError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    web = root / "web"
    if "--check" in argv:
        problems = [
            f"web/{path} is missing or stale" for path, content in pages.items()
            if not (web / path).exists() or (web / path).read_text(encoding="utf-8") != content
        ]
        built = web / POSTS
        if built.exists():
            committed = {str(path.relative_to(web)) for path in built.rglob("*") if path.is_file()}
            problems += [f"web/{path} is not produced by a post" for path in sorted(committed - set(pages))]
        if problems:
            print("\n".join(problems), file=sys.stderr)
            print("Run `uv run python scripts/build_blog.py` and commit the result.", file=sys.stderr)
            return 1
        print(f"{len(pages)} blog files are up to date.")
        return 0
    import shutil

    shutil.rmtree(web / POSTS, ignore_errors=True)
    for path, content in pages.items():
        target = web / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(f"wrote {len(pages)} blog files under web/{POSTS}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
