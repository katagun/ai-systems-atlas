from __future__ import annotations

import copy
import html
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_share_pages
from scripts.build_blog import blog_sitemap_entries
from scripts.build_share_pages import (
    COLLECTION_LABELS,
    FLAG_DISCLAIMER,
    FLAG_NO_STATEMENT_TEXT,
    FLAG_NOT_EXAMINED_TEXT,
    SITE_URL,
    build_pages,
    flag_sentence,
    load_catalog,
    preview_description,
    share_page_path,
)

ROOT = Path(__file__).resolve().parents[1]


# ADR 042: a reviewed model's share page carries the dialog's Risk
# statements section. No published model has a flag until the backfill, so
# these fixtures quote no real developer.
FLAG_FOUND = {
    "kind": "maker_risk_safeguards",
    "status": "statement_found",
    "tier_term": "Fixture Level 3",
    "domains": ["cyber", "bio_chem"],
    "determination": "precautionary",
    "scope": "weights",
    "statement": "A fixture sentence standing in for a developer's verbatim words.",
    "url": "https://www.example-lab.com/system-card",
    "content_sha256": "a" * 64,
    "verified_at": "2026-09-01",
    "research_confidence": "high",
}
FLAG_NONE = {
    "kind": "maker_risk_safeguards",
    "status": "no_statement_found",
    "url": "https://www.example-lab.com/safety",
    "verified_at": "2026-09-01",
    "research_confidence": "medium",
}


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
            "records/labs/lab-openai/index.html", share_page_path("lab", "lab-openai")
        )
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
                "labs",
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

    def test_system_page_shows_the_product_boundary_note(self) -> None:
        record = next(
            item for item in self.catalog["projects"] if item.get("current_repo_note")
        )
        page = self.pages[share_page_path("system", record["id"])]
        self.assertIn("<dt>Product boundary</dt>", page)
        self.assertIn(html.escape(record["current_repo_note"]), page)
        plain = next(
            item
            for item in self.catalog["projects"]
            if not item.get("current_repo_note")
        )
        self.assertNotIn(
            "Product boundary",
            self.pages[share_page_path("system", plain["id"])],
        )

    def test_pack_page_does_not_double_the_repository_link(self) -> None:
        page = self.pages["records/packs/claude-code-tresor/index.html"]
        self.assertEqual(
            1,
            page.count(
                '<a href="https://github.com/alirezarezvani/claude-code-tresor"'
            ),
        )

    def test_lab_page_joins_the_records_that_name_the_lab(self) -> None:
        page = self.pages["records/labs/lab-google/index.html"]
        self.assertIn('<p class="eyebrow">Lab · Technology company</p>', page)
        self.assertIn('href="../../../?record=lab:lab-google"', page)
        for fact in (
            "Alphabet Inc.",
            "Gemini API",
            "Gemini CLI",
            "Frontier Safety Framework",
        ):
            with self.subTest(fact=fact):
                self.assertIn(fact, page)
        self.assertIn('"parentOrganization"', page)
        self.assertNotIn("score", page.lower())

    def test_lab_page_says_when_no_framework_is_recorded(self) -> None:
        page = self.pages["records/labs/lab-deepseek/index.html"]
        self.assertIn("None recorded", page)
        self.assertNotIn('"parentOrganization"', page)

    def test_runtime_page_still_carries_its_repository_link(self) -> None:
        page = self.pages["records/local-runtimes/ollama/index.html"]
        self.assertIn(
            '<a href="https://github.com/ollama/ollama" rel="noreferrer">Repository ↗</a>',
            page,
        )

    def test_eyebrow_names_the_collection_once(self) -> None:
        """render_page adds the collection label; a branch that adds it too doubles it."""
        samples = {
            "system": "kilo-code",
            "spec": "mcp",
            "inference": "openai-api",
            "runtime": "exo",
            "model": "model-alibaba-qwen2-5-coder-0-5b",
            "pack": "agent-toolkit",
            "lab": "lab-anthropic",
        }
        for kind, record_id in samples.items():
            page = self.pages[share_page_path(kind, record_id)]
            eyebrow = page.split('<p class="eyebrow">')[1].split("</p>")[0]
            label = COLLECTION_LABELS[kind]
            with self.subTest(kind=kind, eyebrow=eyebrow):
                self.assertTrue(eyebrow.startswith(f"{label} · "))
                self.assertNotIn(f"{label} · {label}", eyebrow)
        self.assertIn(
            '<p class="eyebrow">Agent pack · Marketplace</p>',
            self.pages["records/packs/agent-toolkit/index.html"],
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
                "labs",
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
                "labs",
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
                "labs",
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

    def test_lab_pages_escape_organization_text(self) -> None:
        catalog = {
            key: []
            for key in (
                "projects",
                "specifications",
                "services",
                "runtimes",
                "models",
                "packs",
                "labs",
                "robots",
            )
        }
        catalog["taxonomy"] = self.catalog["taxonomy"]
        catalog["labs"] = [
            {
                **self.catalog["labs"][0],
                "id": "lab-evil",
                "name": 'Evil <script>alert("x")</script> Lab',
                "parent_organization": "</script><img src=x onerror=alert(1)>",
                "organization_note": "<img src=x onerror=alert(2)>",
            }
        ]
        page = build_pages(catalog)["records/labs/lab-evil/index.html"]
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<img", page)
        self.assertIn("Evil &lt;script&gt;", page)
        self.assertNotIn(
            "</script>",
            page.split('<script type="application/ld+json">')[1].split("</script>\n")[
                0
            ],
        )

    def page_with_flag(self, entry: dict) -> tuple[dict, str]:
        catalog = copy.deepcopy(self.catalog)
        model = catalog["models"][0]
        model["flags"] = [dict(entry)]
        return model, build_pages(catalog)[f"records/models/{model['id']}/index.html"]

    def test_every_reviewed_model_page_has_a_risk_statements_section(self) -> None:
        for model in self.catalog["models"]:
            page = self.pages[f"records/models/{model['id']}/index.html"]
            self.assertIn('<h2 id="risk-statements">Risk statements</h2>', page)
            if "flags" not in model:
                self.assertIn("<p>Not yet examined.</p>", page)
        self.assertNotIn(
            "Risk statements", self.pages["records/systems/kilo-code/index.html"]
        )

    def test_a_found_statement_is_quoted_with_its_link_date_confidence_and_scope(
        self,
    ) -> None:
        model, page = self.page_with_flag(FLAG_FOUND)
        sentence = (
            f"{model['developer']} names this release against “Fixture Level 3” in cyber "
            "and biological or chemical capability, as a precaution. The statement covers "
            "the model itself. This is the developer's own statement, not an Atlas risk rating."
        )
        self.assertIn("<h3>“Fixture Level 3” · Precautionary</h3>", page)
        self.assertIn(
            f"<blockquote>{html.escape(FLAG_FOUND['statement'])}</blockquote>", page
        )
        self.assertIn(
            "<dt>Risk areas</dt><dd>Cyber · Biological or chemical</dd>", page
        )
        self.assertIn("<dt>Covers</dt><dd>The model itself</dd>", page)
        self.assertIn(f'href="{FLAG_FOUND["url"]}"', page)
        self.assertIn("2026-09-01 · Research confidence: High", page)
        self.assertIn(html.escape(sentence), page)
        self.assertNotRegex(page.lower(), "high risk|dangerous")

    def test_a_determined_statement_names_every_domain_and_its_scope(self) -> None:
        entry = dict(
            FLAG_FOUND,
            determination="determined",
            domains=["cyber", "bio_chem", "autonomy"],
            scope="deployment",
        )
        model, page = self.page_with_flag(entry)
        sentence = (
            f"{model['developer']} states that this release reached “Fixture Level 3” in "
            "cyber, biological or chemical, and autonomy capability. The statement covers "
            "safeguards on a release channel. This is the developer's own statement, not "
            "an Atlas risk rating."
        )
        self.assertIn("<h3>“Fixture Level 3” · Threshold reached</h3>", page)
        self.assertIn(html.escape(sentence), page)

    def test_no_statement_reads_as_absence_not_safety(self) -> None:
        _, page = self.page_with_flag(FLAG_NONE)
        self.assertIn(
            "<p>The developer publishes no risk-threshold statement for this release. "
            "Absence is not evidence of safety.</p>",
            page,
        )
        self.assertIn(f'href="{FLAG_NONE["url"]}"', page)
        self.assertIn("Research confidence: Medium", page)
        self.assertNotIn("<blockquote>", page)

    def test_risk_statement_words_match_the_app(self) -> None:
        """The share page and the dialog must say the same fixed sentences."""
        core = (ROOT / "web" / "app-core.js").read_text(encoding="utf-8")
        app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        for text in (FLAG_DISCLAIMER, FLAG_NO_STATEMENT_TEXT, FLAG_NOT_EXAMINED_TEXT):
            self.assertIn(f'"{text}"', core)
        # flagSentence's claim templates and scope lead, in both builders.
        taxonomy = self.catalog["taxonomy"]
        precaution = flag_sentence(FLAG_FOUND, "Fixture Lab", taxonomy)
        reached = flag_sentence(
            dict(FLAG_FOUND, determination="determined"), "Fixture Lab", taxonomy
        )
        for template, sentence in (
            ("names this release against “", precaution),
            ("states that this release reached “", reached),
            (" capability, as a precaution.", precaution),
            (" The statement covers ", precaution),
        ):
            with self.subTest(template=template):
                self.assertIn(template, sentence)
                self.assertIn(template, core)
        # The source link's two labels, as the dialog writes them.
        for entry, label in (
            (FLAG_FOUND, "Read the developer's statement"),
            (FLAG_NONE, "Page the reviewer checked"),
        ):
            with self.subTest(label=label):
                page = self.page_with_flag(entry)[1]
                self.assertIn(f"{html.escape(label)} ↗</a>", page)
                self.assertIn(f'"{label}"', app)

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


class SharePageCheckGateTests(unittest.TestCase):
    """CR-15. The share-page `--check` is the second merge gate, and it was untested.

    `test_committed_share_pages_are_fresh` proves a stale commit fails the suite. These
    prove the gate itself can still fail, which nothing covered: a `--check` that
    returned 0 unconditionally would have let any stale share page merge.
    """

    def _run_check(self, pages: dict[str, str], mutate) -> int:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "web").mkdir()
            mutate(root / "web")
            with (
                patch.object(build_share_pages, "ROOT", root),
                patch.object(build_share_pages, "load_catalog", return_value={}),
                patch.object(build_share_pages, "build_pages", return_value=pages),
            ):
                return build_share_pages.main(["--check"])

    def test_check_passes_when_every_page_is_fresh(self) -> None:
        def fresh(web: Path) -> None:
            (web / "records" / "systems" / "kilo-code").mkdir(parents=True)
            (web / "records" / "systems" / "kilo-code" / "index.html").write_text(
                "page", encoding="utf-8"
            )

        self.assertEqual(
            0,
            self._run_check({"records/systems/kilo-code/index.html": "page"}, fresh),
        )

    def test_check_fails_when_a_page_is_stale(self) -> None:
        def stale(web: Path) -> None:
            (web / "records" / "systems" / "kilo-code").mkdir(parents=True)
            (web / "records" / "systems" / "kilo-code" / "index.html").write_text(
                "edited by hand", encoding="utf-8"
            )

        self.assertEqual(
            1,
            self._run_check({"records/systems/kilo-code/index.html": "page"}, stale),
        )

    def test_check_fails_when_a_page_is_missing(self) -> None:
        def missing(web: Path) -> None:
            (web / "records").mkdir()

        self.assertEqual(
            1,
            self._run_check({"records/systems/kilo-code/index.html": "page"}, missing),
        )

    def test_check_fails_when_records_holds_a_page_the_builder_does_not_produce(
        self,
    ) -> None:
        """The failure BACKLOG.md recorded surviving until a whole-branch review."""

        def orphan(web: Path) -> None:
            (web / "records" / "systems" / "kilo-code").mkdir(parents=True)
            (web / "records" / "systems" / "kilo-code" / "index.html").write_text(
                "page", encoding="utf-8"
            )
            (web / "records" / "packs" / "stray").mkdir(parents=True)
            (web / "records" / "packs" / "stray" / "index.html").write_text(
                "stray", encoding="utf-8"
            )

        self.assertEqual(
            1,
            self._run_check({"records/systems/kilo-code/index.html": "page"}, orphan),
        )


if __name__ == "__main__":
    unittest.main()
