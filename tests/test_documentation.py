from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
GENERATED_DIRECTORIES = {".git", ".venv", "node_modules", "playwright-report", "test-results"}


class DocumentationTests(unittest.TestCase):
    def test_relative_markdown_links_resolve(self) -> None:
        broken: list[str] = []
        for document in ROOT.rglob("*.md"):
            if GENERATED_DIRECTORIES.intersection(document.parts):
                continue
            text = CODE_FENCE.sub("", document.read_text(encoding="utf-8"))
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
            "docs/AGENT_DOCS.md",
            "docs/CURATION.md",
            "docs/COVERAGE.md",
            "docs/DATA_MODEL.md",
            "docs/OPERATIONS.md",
            "docs/INFERENCE_SERVICES.md",
            "docs/LOCAL_RUNTIMES.md",
            "docs/SPECIFICATIONS.md",
            "docs/TAXONOMY.md",
            "docs/WEB.md",
            "docs/adr/003-multi-axis-directory.md",
            "docs/adr/004-memory-and-agent-families.md",
            "docs/adr/005-fail-closed-license-drift.md",
            "docs/adr/009-assistant-systems-are-a-distinct-family.md",
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
            "docs/adr/017-local-runtime-eligibility-ignores-modality.md",
            "docs/adr/018-operating-party-is-a-trait-not-a-role.md",
            "docs/adr/019-authoring-surface-is-a-trait-not-a-role.md",
            "docs/adr/020-derivative-records-turn-on-operational-boundary.md",
            "docs/adr/021-the-research-reference-role-is-removed.md",
            "docs/adr/022-general-pattern-content-is-not-a-collection.md",
            "docs/adr/023-autonomous-science-systems-are-not-a-role.md",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_routing_documents_are_reachable_from_agents(self) -> None:
        """Every document the manifest protects must be routed to from AGENTS.md."""
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        manifest = re.findall(r'"((?:docs/|)[A-Za-z0-9_./-]+\.md)"', self.routing_manifest_source())
        unreachable = sorted({name for name in manifest if name not in agents})
        self.assertEqual([], unreachable)

    def routing_manifest_source(self) -> str:
        source = Path(__file__).read_text(encoding="utf-8")
        start = source.index("def test_task_routing_documents_exist")
        end = source.index("self.assertTrue((ROOT / relative).is_file()", start)
        return source[start:end]

    def refresh_workflow(self) -> str:
        return (ROOT / ".github" / "workflows" / "update-directory.yml").read_text(encoding="utf-8")

    def refresh_step(self, name: str) -> str:
        """Return one step's block from the refresh workflow, without a YAML parser."""
        workflow = self.refresh_workflow()
        start = workflow.index(f"      - name: {name}\n")
        end = workflow.find("\n      - name: ", start + 1)
        return workflow[start:] if end == -1 else workflow[start:end]

    def test_refresh_withholds_push_credentials_while_parsing_third_party_input(self) -> None:
        """Feeds and search results are parsed before the push credential exists."""
        self.assertIn("persist-credentials: false", self.refresh_step("Check out repository"))

    def test_refresh_verification_does_not_abort_the_run(self) -> None:
        """Every check reports, so one failure never hides the rest."""
        self.assertIn("continue-on-error: true", self.refresh_step("Verify the refreshed catalog"))

    def test_refresh_publishes_its_branch_even_when_an_earlier_step_failed(self) -> None:
        """A failed crawl stays recoverable from the branch instead of dying with the runner."""
        self.assertIn("if: always()", self.refresh_step("Open or update the refresh pull request"))

    def test_refresh_still_fails_when_the_catalog_does_not_verify(self) -> None:
        """Publishing the branch must not turn a failing refresh green."""
        self.assertIn(
            "if: steps.verify.outcome == 'failure'",
            self.refresh_step("Fail when the refreshed catalog did not verify"),
        )

    def test_refresh_prefers_a_token_that_lets_the_required_check_run(self) -> None:
        """A pull request opened with GITHUB_TOKEN never triggers `verify`."""
        self.assertIn(
            "${{ secrets.ATLAS_AUTOMATION_TOKEN || secrets.GITHUB_TOKEN }}",
            self.refresh_step("Open or update the refresh pull request"),
        )

    def test_refresh_failures_reach_a_maintainer(self) -> None:
        """A red scheduled run nobody watches is not a signal."""
        workflow = self.refresh_workflow()
        self.assertIn("  report-failure:\n", workflow)
        report = workflow[workflow.index("  report-failure:\n"):]
        self.assertIn("if: failure()", report)
        self.assertIn("gh issue create", report)

    def test_every_path_has_a_code_owner(self) -> None:
        owners = (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
        rules = [line.split() for line in owners.splitlines() if line.strip() and not line.startswith("#")]
        self.assertTrue(any(rule[0] == "*" and len(rule) > 1 for rule in rules), owners)

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
