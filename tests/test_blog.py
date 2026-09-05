from __future__ import annotations

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


class PostFixture(unittest.TestCase):
    def root_with(self, **posts: str) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "blog").mkdir()
        (root / "web").mkdir()
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
        self.assertEqual("building-an-atlas", build_blog.slug_for("2026-09-05-building-an-atlas.md"))

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

    def test_the_supported_subset_renders(self) -> None:
        html = self.render(
            "## Heading\n\nA **bold** and *italic* and `code` word.\n\n"
            "- one\n- two\n\n> quoted\n\n```\nliteral\n```\n\n---\n"
        )
        for fragment in ("<h2>", "<strong>", "<em>", "<code>", "<ul>", "<li>",
                         "<blockquote>", "<pre>", "<hr"):
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
        return self.root_with(**{
            "2026-09-01-older.md": POST.replace("A Post", "Older").replace("2026-09-05", "2026-09-01"),
            "2026-09-05-newer.md": POST.replace("A Post", "Newer"),
        })

    def test_the_index_lists_newest_first(self) -> None:
        posts = build_blog.load_posts(self.two_posts())
        self.assertEqual(["newer", "older"], [post["slug"] for post in posts])

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
        (root / "web" / "blog" / "newer" / "index.html").write_text("stale", encoding="utf-8")
        self.assertEqual(1, build_blog.main(["--check"], root=root))

    def test_check_fails_on_a_page_no_post_produces(self) -> None:
        root = self.two_posts_root()
        self.build(root)
        orphan = root / "web" / "blog" / "deleted-post"
        orphan.mkdir(parents=True)
        (orphan / "index.html").write_text("orphan", encoding="utf-8")
        self.assertEqual(1, build_blog.main(["--check"], root=root))

    def two_posts_root(self) -> Path:
        return self.root_with(**{
            "2026-09-01-older.md": POST.replace("A Post", "Older").replace("2026-09-05", "2026-09-01"),
            "2026-09-05-newer.md": POST.replace("A Post", "Newer"),
        })


if __name__ == "__main__":
    unittest.main()
