from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


class DocumentationTests(unittest.TestCase):
    def test_relative_markdown_links_resolve(self) -> None:
        broken: list[str] = []
        for document in ROOT.rglob("*.md"):
            if ".git" in document.parts or ".venv" in document.parts:
                continue
            text = document.read_text(encoding="utf-8")
            for target in MARKDOWN_LINK.findall(text):
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                path_text = unquote(target.split("#", 1)[0])
                if path_text and not (document.parent / path_text).resolve().exists():
                    broken.append(f"{document.relative_to(ROOT)} -> {target}")
        self.assertEqual([], broken)

    def test_task_routing_documents_exist(self) -> None:
        for relative in (
            "ROADMAP.md",
            "BACKLOG.md",
            "docs/CURATION.md",
            "docs/COVERAGE.md",
            "docs/DATA_MODEL.md",
            "docs/OPERATIONS.md",
            "docs/TAXONOMY.md",
            "docs/WEB.md",
            "docs/adr/005-fail-closed-license-drift.md",
            "docs/adr/006-provider-relationships-are-orthogonal.md",
            "docs/adr/007-licenses-are-classification-not-inclusion.md",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)


if __name__ == "__main__":
    unittest.main()
