from __future__ import annotations

import unittest
from pathlib import Path

from scripts.build_blog import blog_sitemap_entries
from scripts.build_share_pages import (
    SITE_URL,
    build_pages,
    load_catalog,
    preview_description,
    share_page_path,
)

ROOT = Path(__file__).resolve().parents[1]


class SharePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(ROOT)
        cls.pages = build_pages(cls.catalog)

    def test_share_page_path_maps_each_collection_and_rejects_others(self) -> None:
        self.assertEqual(
            "records/systems/kilo-code/index.html",
            share_page_path("system", "kilo-code"),
        )
        self.assertEqual(
            "records/specifications/mcp/index.html", share_page_path("spec", "mcp")
        )
        self.assertEqual(
            "records/inference-services/openai-api/index.html",
            share_page_path("inference", "openai-api"),
        )
        self.assertEqual(
            "records/local-runtimes/ollama/index.html",
            share_page_path("runtime", "ollama"),
        )
        self.assertEqual(
            "records/models/model-alibaba-qwen2-5-coder-0-5b/index.html",
            share_page_path("model", "model-alibaba-qwen2-5-coder-0-5b"),
        )
        self.assertEqual("records/packs/kit/index.html", share_page_path("pack", "kit"))
        self.assertEqual(
            "records/robots/bot/index.html", share_page_path("robot", "bot")
        )
        with self.assertRaises(ValueError):
            share_page_path("constructor", "ollama")
        with self.assertRaises(ValueError):
            share_page_path("system", "../escape")

    def test_preview_description_caps_on_a_word_boundary(self) -> None:
        self.assertEqual("Short.", preview_description("Short."))
        long = " ".join(["word"] * 60)
        capped = preview_description(long)
        self.assertLessEqual(len(capped), 160)
        self.assertTrue(capped.endswith("…"))
        self.assertNotIn("wor…", capped)

    def test_every_record_gets_a_page_plus_sitemap_and_robots(self) -> None:
        records = sum(
            len(self.catalog[key])
            for key in (
                "projects",
                "specifications",
                "services",
                "runtimes",
                "models",
                "packs",
                "robots",
            )
        )
        self.assertEqual(records + 2, len(self.pages))
        self.assertIn("sitemap.xml", self.pages)
        self.assertIn("robots.txt", self.pages)

    def test_system_page_carries_share_metadata_and_an_atlas_link(self) -> None:
        page = self.pages["records/systems/kilo-code/index.html"]
        self.assertIn("<title>Kilo Code · peacefulcoexistance</title>", page)
        self.assertIn(
            '<meta property="og:site_name" content="peacefulcoexistance">', page
        )
        self.assertNotIn("Atlas", page)
        self.assertIn(
            f'<link rel="canonical" href="{SITE_URL}records/systems/kilo-code/">', page
        )
        self.assertIn('<meta property="og:title" content="Kilo Code">', page)
        self.assertIn(
            f'<meta property="og:url" content="{SITE_URL}records/systems/kilo-code/">',
            page,
        )
        self.assertIn('<meta name="twitter:card" content="summary">', page)
        self.assertIn('<script type="application/ld+json">', page)
        self.assertIn('href="../../../?record=system:kilo-code"', page)
        self.assertIn("Agent system", page)
        self.assertIn("Coding agent", page)
        self.assertNotIn("score", page.lower().replace("score profile", ""))

    def test_pack_page_does_not_double_the_repository_link(self) -> None:
        page = self.pages["records/packs/claude-code-tresor/index.html"]
        self.assertEqual(
            1,
            page.count(
                '<a href="https://github.com/alirezarezvani/claude-code-tresor"'
            ),
        )

    def test_runtime_page_still_carries_its_repository_link(self) -> None:
        page = self.pages["records/local-runtimes/ollama/index.html"]
        self.assertIn(
            '<a href="https://github.com/ollama/ollama" rel="noreferrer">Repository ↗</a>',
            page,
        )

    def test_pages_follow_the_os_colour_scheme(self) -> None:
        page = self.pages["records/systems/kilo-code/index.html"]
        self.assertIn("color-scheme: light dark", page)
        self.assertIn("@media (prefers-color-scheme: dark)", page)

    def test_system_page_names_deployment_modes_from_the_taxonomy(self) -> None:
        """Readers see the taxonomy's names, never an identifier with its underscores removed."""
        page = self.pages["records/systems/superpowers/index.html"]
        self.assertIn(
            "<dt>Deployment</dt><dd>Local CLI · Installed into a host agent</dd>", page
        )
        self.assertNotIn("Host pack", page)
        self.assertNotIn("Local cli", page)

    def test_other_collections_link_back_with_their_own_kind(self) -> None:
        self.assertIn(
            'href="../../../?record=spec:mcp"',
            self.pages["records/specifications/mcp/index.html"],
        )
        self.assertIn(
            'href="../../../?record=inference:openai-api"',
            self.pages["records/inference-services/openai-api/index.html"],
        )
        self.assertIn(
            'href="../../../?record=runtime:ollama"',
            self.pages["records/local-runtimes/ollama/index.html"],
        )
        self.assertIn(
            'href="../../../?record=model:model-alibaba-qwen2-5-coder-0-5b"',
            self.pages["records/models/model-alibaba-qwen2-5-coder-0-5b/index.html"],
        )

    def test_robot_page_states_the_vendor_claim_and_carries_no_score(self) -> None:
        catalog = {
            key: []
            for key in (
                "projects",
                "specifications",
                "services",
                "runtimes",
                "models",
                "packs",
                "robots",
            )
        }
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["robots"] = [
            {
                "id": "bot",
                "name": "Bot <One>",
                "manufacturer": "Example Robotics",
                "url": "https://robots.example/bot",
                "description": "A humanoid.",
                "form_factor": "humanoid",
                "availability": "reservation",
                "status": "active",
                "ai_basis": ["vendor_named_model"],
                "named_models": [
                    {
                        "name": "Sample-VLA",
                        "kind": "vision_language_action",
                        "role_note": "Turns frames into motion.",
                        "evidence_label": "News",
                    }
                ],
                "not_verified": "The model is the maker's claim.",
                "verified_at": "2026-09-20",
            }
        ]
        page = build_pages(catalog)["records/robots/bot/index.html"]
        self.assertIn("Robot · Humanoid", page)
        self.assertNotIn("Robot · Robot", page)
        self.assertIn("Bot &lt;One&gt;", page)
        self.assertIn("Sample-VLA", page)
        self.assertIn("vendor-stated", page)
        self.assertNotIn("score", page.lower())

    def test_robot_page_states_no_named_model_when_the_robot_is_interface_only(
        self,
    ) -> None:
        catalog = {
            key: []
            for key in (
                "projects",
                "specifications",
                "services",
                "runtimes",
                "models",
                "packs",
                "robots",
            )
        }
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["robots"] = [
            {
                "id": "open-bot",
                "name": "Open Bot",
                "manufacturer": "Example Robotics",
                "url": "https://robots.example/open-bot",
                "description": "A humanoid with an open model interface.",
                "form_factor": "humanoid",
                "availability": "reservation",
                "status": "active",
                "ai_basis": ["open_model_interface"],
                "named_models": [],
                "developer_access": "The vendor documents an SDK.",
                "not_verified": "The interface is the maker's claim.",
                "verified_at": "2026-09-20",
            }
        ]
        page = build_pages(catalog)["records/robots/open-bot/index.html"]
        self.assertIn("None named by the maker", page)
        self.assertIn("Yes, by a route the maker documents", page)

    def test_pages_escape_record_text_everywhere(self) -> None:
        catalog = {
            key: []
            for key in (
                "projects",
                "specifications",
                "services",
                "runtimes",
                "models",
                "packs",
                "robots",
            )
        }
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["runtimes"] = [
            {
                **self.catalog["runtimes"][0],
                "id": "evil",
                "name": 'Evil <script>alert("x")</script> & Co',
                "description": "</script><img src=x onerror=alert(1)>",
            }
        ]
        page = build_pages(catalog)["records/local-runtimes/evil/index.html"]
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<img", page)
        self.assertNotIn("</script><img", page)
        self.assertIn("Evil &lt;script&gt;", page)
        self.assertNotIn(
            "</script>",
            page.split('<script type="application/ld+json">')[1].split("</script>\n")[
                0
            ],
        )

    def test_sitemap_lists_the_root_and_every_page(self) -> None:
        """The sitemap covers the root, every share page, and every blog page.

        This module owns the sitemap; the blog module owns its own pages and hands
        their URLs over. The count therefore spans both, and asserting only the
        share pages would let a blog post go unlisted without failing anything.
        """
        sitemap = self.pages["sitemap.xml"]
        self.assertIn(f"<loc>{SITE_URL}</loc>", sitemap)
        self.assertIn(f"<loc>{SITE_URL}records/systems/kilo-code/</loc>", sitemap)
        blog = blog_sitemap_entries(ROOT)
        for url, _date in blog:
            self.assertIn(f"<loc>{url}</loc>", sitemap)
        share_pages = (
            len(self.pages) - 1
        )  # every page except sitemap.xml and robots.txt, plus the root
        self.assertEqual(share_pages + len(blog), sitemap.count("<loc>"))
        self.assertIn(f"Sitemap: {SITE_URL}sitemap.xml", self.pages["robots.txt"])

    def test_committed_share_pages_are_fresh(self) -> None:
        for path, content in self.pages.items():
            target = ROOT / "web" / path
            self.assertTrue(
                target.exists(),
                f"web/{path} is missing; run scripts/build_share_pages.py",
            )
            self.assertEqual(
                content, target.read_text(encoding="utf-8"), f"web/{path} is stale"
            )
        committed = {
            str(path.relative_to(ROOT / "web"))
            for path in (ROOT / "web" / "records").rglob("*")
            if path.is_file()
        }
        self.assertEqual(
            set(),
            committed - set(self.pages),
            "web/records holds files the build does not produce",
        )


if __name__ == "__main__":
    unittest.main()
