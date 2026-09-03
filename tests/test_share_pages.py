from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts.build_share_pages import SITE_URL, build_pages, load_catalog, preview_description, share_page_path

ROOT = Path(__file__).resolve().parents[1]


class SharePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(ROOT)
        cls.pages = build_pages(cls.catalog)

    def test_share_page_path_maps_each_collection_and_rejects_others(self) -> None:
        self.assertEqual("records/systems/kilo-code/index.html", share_page_path("system", "kilo-code"))
        self.assertEqual("records/specifications/mcp/index.html", share_page_path("spec", "mcp"))
        self.assertEqual("records/inference-services/openai-api/index.html", share_page_path("inference", "openai-api"))
        self.assertEqual("records/local-runtimes/ollama/index.html", share_page_path("runtime", "ollama"))
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
        records = sum(len(self.catalog[key]) for key in ("projects", "specifications", "services", "runtimes"))
        self.assertEqual(records + 2, len(self.pages))
        self.assertIn("sitemap.xml", self.pages)
        self.assertIn("robots.txt", self.pages)

    def test_system_page_carries_share_metadata_and_an_atlas_link(self) -> None:
        page = self.pages["records/systems/kilo-code/index.html"]
        self.assertIn("<title>Kilo Code · peacefulcoexistance</title>", page)
        self.assertIn('<meta property="og:site_name" content="peacefulcoexistance">', page)
        self.assertNotIn("Atlas", page)
        self.assertIn(f'<link rel="canonical" href="{SITE_URL}records/systems/kilo-code/">', page)
        self.assertIn('<meta property="og:title" content="Kilo Code">', page)
        self.assertIn(f'<meta property="og:url" content="{SITE_URL}records/systems/kilo-code/">', page)
        self.assertIn('<meta name="twitter:card" content="summary">', page)
        self.assertIn('<script type="application/ld+json">', page)
        self.assertIn('href="../../../?record=system:kilo-code"', page)
        self.assertIn("Agent system", page)
        self.assertIn("Coding agent", page)
        self.assertNotIn("score", page.lower().replace("score profile", ""))

    def test_other_collections_link_back_with_their_own_kind(self) -> None:
        self.assertIn('href="../../../?record=spec:mcp"', self.pages["records/specifications/mcp/index.html"])
        self.assertIn('href="../../../?record=inference:openai-api"', self.pages["records/inference-services/openai-api/index.html"])
        self.assertIn('href="../../../?record=runtime:ollama"', self.pages["records/local-runtimes/ollama/index.html"])

    def test_pages_escape_record_text_everywhere(self) -> None:
        catalog = {key: [] for key in ("projects", "specifications", "services", "runtimes")}
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["runtimes"] = [{
            **self.catalog["runtimes"][0],
            "id": "evil",
            "name": 'Evil <script>alert("x")</script> & Co',
            "description": "</script><img src=x onerror=alert(1)>",
        }]
        page = build_pages(catalog)["records/local-runtimes/evil/index.html"]
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<img", page)
        self.assertNotIn("</script><img", page)
        self.assertIn("Evil &lt;script&gt;", page)
        self.assertNotIn("</script>", page.split('<script type="application/ld+json">')[1].split("</script>\n")[0])

    def test_sitemap_lists_the_root_and_every_page(self) -> None:
        sitemap = self.pages["sitemap.xml"]
        self.assertIn(f"<loc>{SITE_URL}</loc>", sitemap)
        self.assertIn(f"<loc>{SITE_URL}records/systems/kilo-code/</loc>", sitemap)
        self.assertEqual(len(self.pages) - 1, sitemap.count("<loc>"))
        self.assertIn(f"Sitemap: {SITE_URL}sitemap.xml", self.pages["robots.txt"])

    def test_committed_share_pages_are_fresh(self) -> None:
        for path, content in self.pages.items():
            target = ROOT / "web" / path
            self.assertTrue(target.exists(), f"web/{path} is missing; run scripts/build_share_pages.py")
            self.assertEqual(content, target.read_text(encoding="utf-8"), f"web/{path} is stale")
        committed = {str(path.relative_to(ROOT / "web")) for path in (ROOT / "web" / "records").rglob("*") if path.is_file()}
        self.assertEqual(set(), committed - set(self.pages), "web/records holds files the build does not produce")


if __name__ == "__main__":
    unittest.main()
