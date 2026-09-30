from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import build_blog

POST = """---
title: A Post
date: 2026-09-05
summary: One sentence.
author: Someone
---

Body text.
"""
REPO_ROOT = Path(__file__).resolve().parent.parent
STYLESHEET = "body { margin: 0; }"


class PostFixture(unittest.TestCase):
    def root_with(self, **posts: str) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "blog").mkdir()
        (root / "web").mkdir()
        (root / "web" / "styles.css").write_text(STYLESHEET, encoding="utf-8")
        (root / "web" / "fonts.css").write_text("@font-face {}", encoding="utf-8")
        for name, text in posts.items():
            (root / "blog" / name).write_text(text, encoding="utf-8")
        return root


class FrontmatterTests(PostFixture):
    def test_a_complete_post_parses(self) -> None:
        meta, body, _ = build_blog.parse_frontmatter(POST, "a.md")
        self.assertEqual("A Post", meta["title"])
        self.assertEqual("2026-09-05", meta["date"])
        self.assertEqual("Body text.", body.strip())

    def test_a_missing_key_is_named(self) -> None:
        text = POST.replace("summary: One sentence.\n", "")
        with self.assertRaises(build_blog.PostError) as caught:
            build_blog.parse_frontmatter(text, "a.md")
        self.assertIn("summary", str(caught.exception))

    def test_an_unknown_key_is_rejected(self) -> None:
        text = POST.replace("author: Someone", "author: Someone\ntags: one, two")
        with self.assertRaises(build_blog.PostError) as caught:
            build_blog.parse_frontmatter(text, "a.md")
        self.assertIn("tags", str(caught.exception))

    def test_a_post_without_frontmatter_is_rejected(self) -> None:
        with self.assertRaises(build_blog.PostError):
            build_blog.parse_frontmatter("Just prose.\n", "a.md")

    def test_a_non_iso_date_is_rejected(self) -> None:
        with self.assertRaises(build_blog.PostError) as caught:
            build_blog.parse_frontmatter(POST.replace("2026-09-05", "Sept 5"), "a.md")
        self.assertIn("date", str(caught.exception))


class SlugTests(PostFixture):
    def test_the_slug_drops_the_date_prefix(self) -> None:
        self.assertEqual(
            "building-an-atlas", build_blog.slug_for("2026-09-05-building-an-atlas.md")
        )

    def test_a_filename_without_a_date_prefix_is_rejected(self) -> None:
        with self.assertRaises(build_blog.PostError):
            build_blog.slug_for("building-an-atlas.md")


class RenderTests(PostFixture):
    def render(self, body: str) -> str:
        return build_blog.render_markdown(body, "a.md")

    def test_post_text_can_never_introduce_an_element(self) -> None:
        """Escape first, then render. A post is prose, never markup."""
        html = self.render("A <script>alert(1)</script> tag.")
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_a_link_url_is_escaped_and_carries_rel(self) -> None:
        html = self.render('See [the site](https://example.com/"onmouseover=x).')
        self.assertNotIn('"onmouseover=x"', html)
        self.assertIn("rel=", html)

    def test_links_allow_https_and_same_site_relative_destinations(self) -> None:
        cases = (
            ("absolute HTTPS", "https://example.com/docs", "https://example.com/docs"),
            (
                "mixed-case HTTPS",
                "HTTPS://example.com/docs",
                "HTTPS://example.com/docs",
            ),
            (
                "punycode HTTPS",
                "https://xn--bcher-kva.example/",
                "https://xn--bcher-kva.example/",
            ),
            ("IPv6 HTTPS", "https://[2001:db8::1]/", "https://[2001:db8::1]/"),
            ("root-relative", "/docs/page", "/docs/page"),
            ("path-relative", "../page", "../page"),
            ("query-relative", "?view=all", "?view=all"),
            ("fragment-relative", "#details", "#details"),
        )
        for label, destination, rendered in cases:
            with self.subTest(label):
                html = self.render(f"[safe]({destination})")
                self.assertIn(f'href="{rendered}"', html)

    def test_link_destinations_preserve_html_escaping(self) -> None:
        html = self.render("[safe](https://example.com/search?one=1&two=2)")
        self.assertIn('href="https://example.com/search?one=1&amp;two=2"', html)

    def test_active_and_cross_site_relative_link_forms_are_rejected(self) -> None:
        destinations = (
            "javascript:document.body.textContent=owned",
            "JaVaScRiPt:document.body.textContent=owned",
            "data:text/html,owned",
            "file:///etc/passwd",
            "http://example.com/",
            "mailto:editor@example.com",
            "//example.com/path",
            r"\\example.com\path",
            r"https:\\example.com\path",
            "\x01javascript:document.body.textContent=owned",
            "\x7fjavascript:document.body.textContent=owned",
        )
        for destination in destinations:
            with (
                self.subTest(destination=repr(destination)),
                self.assertRaises(build_blog.PostError),
            ):
                self.render(f"[unsafe]({destination})")

    def test_malformed_or_credential_bearing_https_links_are_rejected(self) -> None:
        destinations = (
            "https:///missing-host",
            "https://%zz/",
            "https://bad_host.example/",
            "https://1.2.3.999/",
            "https://4294967296/",
            "https://0x7f000001/",
            "https://0177.0.0.1/",
            "https://xn--a/",
            "https://xn--0/",
            "https://[v1.foo]/",
            "https://a\u200cb.example/",
            "https://user:password@example.com/path",
            "https://example.com:not-a-port/path",
        )
        for destination in destinations:
            with (
                self.subTest(destination=destination),
                self.assertRaises(build_blog.PostError),
            ):
                self.render(f"[unsafe]({destination})")

    def test_the_supported_subset_renders(self) -> None:
        html = self.render(
            "## Heading\n\nA **bold** and *italic* and `code` word.\n\n"
            "- one\n- two\n\n> quoted\n\n```\nliteral\n```\n\n---\n"
        )
        for fragment in (
            "<h2>",
            "<strong>",
            "<em>",
            "<code>",
            "<ul>",
            "<li>",
            "<blockquote>",
            "<pre>",
            "<hr",
        ):
            self.assertIn(fragment, html, fragment)

    def test_an_unsupported_construct_fails_with_its_line(self) -> None:
        with self.assertRaises(build_blog.PostError) as caught:
            self.render("Fine.\n\n| a | b |\n| - | - |\n")
        self.assertIn("line 3", str(caught.exception))

    def test_an_image_is_rejected_rather_than_mangled(self) -> None:
        with self.assertRaises(build_blog.PostError):
            self.render("![alt](cat.png)\n")


class BuildTests(PostFixture):
    def two_posts(self) -> Path:
        return self.root_with(
            **{
                "2026-09-01-older.md": POST.replace("A Post", "Older").replace(
                    "2026-09-05", "2026-09-01"
                ),
                "2026-09-05-newer.md": POST.replace("A Post", "Newer"),
            }
        )

    def test_the_index_lists_newest_first(self) -> None:
        posts = build_blog.load_posts(self.two_posts())
        self.assertEqual(["newer", "older"], [post["slug"] for post in posts])

    def test_same_day_posts_order_by_stated_time_not_slug(self) -> None:
        root = self.root_with(
            **{
                "2026-09-05-early.md": POST.replace("A Post", "Early").replace(
                    "2026-09-05", "2026-09-05 08:15"
                ),
                "2026-09-05-late.md": POST.replace("A Post", "Late").replace(
                    "2026-09-05", "2026-09-05 20:40"
                ),
            }
        )
        posts = build_blog.load_posts(root)
        self.assertEqual(["late", "early"], [post["slug"] for post in posts])

    def test_a_same_day_post_renders_its_time_in_the_byline(self) -> None:
        root = self.root_with(
            **{
                "2026-09-05-early.md": POST.replace("A Post", "Early").replace(
                    "2026-09-05", "2026-09-05 08:15"
                )
            }
        )
        page = build_blog.build_pages(root)["blog/early/index.html"]
        self.assertIn(
            '<time datetime="2026-09-05T08:15">2026-09-05 · 08:15</time>', page
        )

    def test_every_post_page_carries_a_nav_of_all_posts_marking_the_open_one(
        self,
    ) -> None:
        pages = build_blog.build_pages(self.two_posts())
        newer = pages["blog/newer/index.html"]
        self.assertIn('class="post-nav"', newer)
        self.assertIn('href="../older/"', newer)
        self.assertIn('aria-current="page"', newer)
        self.assertIn("Newer", newer)
        older = pages["blog/older/index.html"]
        self.assertIn('href="../newer/"', older)
        self.assertIn('aria-current="page"', older)
        self.assertIn("Older", older)

    def test_the_index_page_has_no_post_nav(self) -> None:
        index = build_blog.build_pages(self.two_posts())["blog/index.html"]
        self.assertNotIn("post-nav", index)

    def test_every_post_gets_a_page_and_an_index_exists(self) -> None:
        pages = build_blog.build_pages(self.two_posts())
        self.assertIn("blog/index.html", pages)
        self.assertIn("blog/newer/index.html", pages)
        self.assertIn("blog/older/index.html", pages)

    def test_a_post_page_states_it_is_editorial_not_a_catalog_record(self) -> None:
        pages = build_blog.build_pages(self.two_posts())
        self.assertIn("editorial", pages["blog/newer/index.html"].lower())

    def test_sitemap_entries_use_the_site_origin_and_the_post_date(self) -> None:
        entries = build_blog.blog_sitemap_entries(self.two_posts())
        locs = dict(entries)
        self.assertIn(f"{build_blog.SITE_URL}blog/newer/", locs)
        self.assertEqual("2026-09-05", locs[f"{build_blog.SITE_URL}blog/newer/"])


class HeaderTests(PostFixture):
    """Every blog page is the site's own shell: its header, stylesheet, fonts, and theme."""

    def pages(self) -> dict[str, str]:
        return build_blog.build_pages(
            self.root_with(**{"2026-09-05-newer.md": POST.replace("A Post", "Newer")})
        )

    def test_the_index_and_posts_carry_the_site_header_before_main(self) -> None:
        for path, html in self.pages().items():
            with self.subTest(path):
                self.assertLess(
                    html.index('<header class="site-header">'),
                    html.index('<main id="main"'),
                )
                self.assertIn(
                    '<nav class="tabs" aria-label="Primary navigation">', html
                )
                self.assertIn(
                    '<span class="wordmark-name">peacefulcoexistance</span>', html
                )

    def test_view_links_point_at_the_directory_page_relative_to_each_depth(
        self,
    ) -> None:
        pages = self.pages()
        for path, root in (
            ("blog/index.html", "../"),
            ("blog/newer/index.html", "../../"),
        ):
            with self.subTest(path):
                html = pages[path]
                self.assertIn(f'<a class="tab-link" href="{root}">Catalog</a>', html)
                self.assertIn(
                    f'<a class="tab-link" href="{root}?view=finder">Find your fit</a>',
                    html,
                )
                docs_block = re.search(
                    r'<details class="docs-menu">.*?</details>', html, re.DOTALL
                )
                assert docs_block is not None, f"{path} has no Docs menu"
                for kind, slug, label in build_blog.DOCS:
                    self.assertIn(
                        f'<a href="{root}?{kind}={slug}">{label}</a>',
                        docs_block.group(0),
                    )

    def test_the_blog_link_is_marked_current(self) -> None:
        pages = self.pages()
        self.assertIn(
            '<a class="is-active" aria-current="page" href="./">Blog</a>',
            pages["blog/index.html"],
        )
        self.assertIn(
            '<a class="is-active" aria-current="page" href="../">Blog</a>',
            pages["blog/newer/index.html"],
        )

    def test_the_blog_header_mirrors_the_directory_navigation(self) -> None:
        """web/index.html owns the primary navigation; the blog header must
        carry the same top-level entries and nothing more — Catalog, Find
        your fit, and a Docs menu — so a nav change cannot land in one and
        miss the other, and the blog cannot sprout its own collection tabs."""
        index = (build_blog.ROOT / "web" / "index.html").read_text(encoding="utf-8")
        tabs = re.search(
            r'<nav class="tabs" aria-label="Primary navigation">(.*?)</nav>',
            index,
            re.DOTALL,
        )
        assert tabs is not None, "web/index.html has no primary navigation"
        app_labels = [
            match.group(1) if match.group(1) is not None else "Docs"
            for match in re.finditer(
                r'<button class="tab[^"]*" data-tab="[^"]+"[^>]*>([^<]+)</button>|<div class="docs-menu">',
                tabs.group(1),
            )
        ]
        pages = self.pages()
        for path, _root in (
            ("blog/index.html", "../"),
            ("blog/newer/index.html", "../../"),
        ):
            with self.subTest(path):
                html = pages[path]
                nav = re.search(
                    r'<nav class="tabs" aria-label="Primary navigation">(.*?)</nav>',
                    html,
                    re.DOTALL,
                )
                assert nav is not None, f"{path} has no primary navigation"
                blog_labels = [
                    match.group(1) if match.group(1) is not None else "Docs"
                    for match in re.finditer(
                        r'<a class="tab-link"[^>]*>([^<]+)</a>|<details class="docs-menu">',
                        nav.group(1),
                    )
                ]
                self.assertEqual(
                    blog_labels,
                    app_labels,
                    f"{path} primary navigation diverges from web/index.html",
                )

    def test_pages_carry_the_unstamped_placeholder_the_deploy_job_replaces(
        self,
    ) -> None:
        """ADR 049: a blog page carries the placeholder, never a content hash.

        The hash used to be computed here, which meant an edit to any post rewrote
        the stamp in all nine pages and two branches editing different posts
        conflicted on nine files at once. The stamp now comes from the one
        implementation in scripts/build_asset_version.mjs at deploy time, so this
        module holds no hashing at all -- only the token, which
        ``test_the_blog_placeholder_matches_the_deploy_stamper`` pins to that module.
        """
        for path, root in (
            ("blog/index.html", "../"),
            ("blog/newer/index.html", "../../"),
        ):
            with self.subTest(path):
                for name in ("styles.css", "fonts.css"):
                    self.assertIn(
                        f'<link rel="stylesheet" href="{root}{name}'
                        f'?v={build_blog.ASSET_VERSION_PLACEHOLDER}">',
                        self.pages()[path],
                    )
                self.assertNotIn("<style>", self.pages()[path])

    def test_the_blog_placeholder_matches_the_deploy_stamper(self) -> None:
        """Two modules now name the token, and only one may compute a hash.

        build_blog.py writes it and build_asset_version.mjs replaces it, so a
        rename on one side that missed the other would ship a blog whose references
        the deploy job silently never stamps -- stale stylesheets for every reader,
        with the freshness check passing throughout because the committed file is
        placeholder-only either way.
        """
        stamper = subprocess.run(
            [
                "node",
                "-e",
                "process.stdout.write(require('./scripts/build_asset_version.mjs').PLACEHOLDER)",
            ],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            check=True,
        )
        self.assertEqual(stamper.stdout, build_blog.ASSET_VERSION_PLACEHOLDER)

    def test_a_missing_stylesheet_stops_the_build(self) -> None:
        root = self.root_with(
            **{"2026-09-05-newer.md": POST.replace("A Post", "Newer")}
        )
        (root / "web" / "styles.css").unlink()
        with self.assertRaises(build_blog.PostError) as caught:
            build_blog.build_pages(root)
        self.assertIn("styles.css", str(caught.exception))

    def test_blog_pages_carry_the_theme_control_and_no_application_script(self) -> None:
        """One inline script stamps the stored theme before paint and drives the control."""
        for path, html in self.pages().items():
            with self.subTest(path):
                self.assertNotIn("<script src", html)
                self.assertEqual(1, html.count("<script>"))
                self.assertIn('var KEY = "theme"', html)
                self.assertLess(
                    html.index("<script>"), html.index('<link rel="stylesheet"')
                )
                self.assertIn(
                    '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Theme: system"',
                    html,
                )
                self.assertLess(
                    html.index("<footer>"), html.index('class="suggest-link"')
                )
                self.assertLess(
                    html.index('id="theme-toggle"'), html.index('class="github-link"')
                )

    def test_footers_keep_their_depth_specific_links(self) -> None:
        pages = self.pages()
        self.assertIn(
            '<span class="footer-meta"><a href="../">Browse the directory</a></span>',
            pages["blog/index.html"],
        )
        self.assertIn(
            '<span class="footer-meta"><a href="../">All writing</a> · <a href="../../">Browse the directory</a></span>',
            pages["blog/newer/index.html"],
        )

    def test_footers_carry_the_directory_page_notices_verbatim(self) -> None:
        """The published index.html is the reference, so the two footers cannot drift apart."""
        index = (build_blog.ROOT / "web" / "index.html").read_text(encoding="utf-8")
        match = re.search(
            r"<footer>.*?</div>(.*?)<span id=\"data-date\"></span></footer>", index
        )
        self.assertIsNotNone(match)
        for path, html in self.pages().items():
            with self.subTest(path):
                self.assertIn(f'{match.group(1)}<span class="footer-meta">', html)


class CheckTests(PostFixture):
    def build(self, root: Path) -> None:
        self.assertEqual(0, build_blog.main([], root=root))

    def test_check_passes_on_freshly_built_output(self) -> None:
        root = self.two_posts_root()
        self.build(root)
        self.assertEqual(0, build_blog.main(["--check"], root=root))

    def test_check_fails_when_a_page_is_stale(self) -> None:
        root = self.two_posts_root()
        self.build(root)
        (root / "web" / "blog" / "newer" / "index.html").write_text(
            "stale", encoding="utf-8"
        )
        self.assertEqual(1, build_blog.main(["--check"], root=root))

    def test_check_fails_on_a_page_no_post_produces(self) -> None:
        root = self.two_posts_root()
        self.build(root)
        orphan = root / "web" / "blog" / "deleted-post"
        orphan.mkdir(parents=True)
        (orphan / "index.html").write_text("orphan", encoding="utf-8")
        self.assertEqual(1, build_blog.main(["--check"], root=root))

    def two_posts_root(self) -> Path:
        return self.root_with(
            **{
                "2026-09-01-older.md": POST.replace("A Post", "Older").replace(
                    "2026-09-05", "2026-09-01"
                ),
                "2026-09-05-newer.md": POST.replace("A Post", "Newer"),
            }
        )


if __name__ == "__main__":
    unittest.main()
