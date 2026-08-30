from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
GENERATED_DIRECTORIES = {".git", ".venv", "node_modules", "playwright-report", "test-results"}


class DocumentationTests(unittest.TestCase):
    def test_relative_markdown_links_resolve(self) -> None:
        broken: list[str] = []
        for document in ROOT.rglob("*.md"):
            if GENERATED_DIRECTORIES.intersection(document.parts):
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
            "docs/INFERENCE_SERVICES.md",
            "docs/LOCAL_RUNTIMES.md",
            "docs/SPECIFICATIONS.md",
            "docs/TAXONOMY.md",
            "docs/WEB.md",
            "docs/adr/005-fail-closed-license-drift.md",
            "docs/adr/006-provider-relationships-are-orthogonal.md",
            "docs/adr/007-licenses-are-classification-not-inclusion.md",
            "docs/adr/008-specifications-are-unscored-artifacts.md",
            "docs/adr/010-inference-services-are-unscored-service-records.md",
            "docs/adr/011-delegated-work-agents-are-agent-systems.md",
            "docs/adr/012-inference-services-use-a-dedicated-score-profile.md",
            "docs/adr/013-distinct-collections-share-one-directory-surface.md",
            "docs/adr/014-comparisons-are-scoped-to-one-score-profile.md",
            "docs/adr/015-local-runtimes-are-self-operated-execution-records.md",
            "docs/adr/016-superseded-predecessors-keep-their-record.md",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_pages_deploy_accepts_only_trusted_main_verification(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        match = re.search(r"(?m)^  build:\n    if: >-\n((?:      .*\n)+)", workflow)
        self.assertIsNotNone(match)
        condition = " ".join(line.strip() for line in match.group(1).splitlines())
        expected = (
            "(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') || "
            "(github.event_name == 'workflow_run' && "
            "github.event.workflow_run.event == 'push' && "
            "github.event.workflow_run.conclusion == 'success' && "
            "github.event.workflow_run.head_repository.full_name == github.repository && "
            "github.event.workflow_run.head_branch == github.event.repository.default_branch)"
        )

        self.assertEqual(expected, condition)


if __name__ == "__main__":
    unittest.main()
