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


def _document(title: str, description: str, url: str, body: str) -> str:
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
<link rel="stylesheet" href="../../fonts.css">
<style>
{STYLE}
</style>
</head>
<body>
<main>
{body}
</main>
<footer>{SITE_NAME} · {SITE_TAGLINE} · <a href="../">All writing</a> · <a href="../../">Browse the directory</a></footer>
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
    return _document(post["title"], post["summary"], post_url(post["slug"]), body)


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
    page = _document("Writing", description, f"{SITE_URL}{POSTS}/", body)
    # The index sits one level shallower than a post, so its relative links differ.
    return page.replace('href="../../fonts.css"', 'href="../fonts.css"').replace(
        '<a href="../">All writing</a> · <a href="../../">Browse the directory</a>',
        '<a href="../">Browse the directory</a>',
    )


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
