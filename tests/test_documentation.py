from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
GENERATED_DIRECTORIES = {
    ".git",
    ".superpowers",
    ".venv",
    "node_modules",
    "playwright-report",
    "test-results",
}


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

    def test_the_routine_prompt_states_its_boundary(self) -> None:
        """The prompt is the only instruction a scheduled run sees, so its limits must be in it.

        Drift between this file and the installed copy is checked by
        scripts/run_candidate_triage.py prepare, which runs where ~/.claude exists.
        """
        prompt = (ROOT / "docs" / "routines" / "candidate-triage.md").read_text(
            encoding="utf-8"
        )
        for required in (
            "directory/candidates.json",
            "run_candidate_triage.py prepare",
            "run_candidate_triage.py finish",
            "NEVER FETCH",
            "024",
        ):
            self.assertIn(required, prompt, required)

    def test_the_signal_routine_prompt_states_its_boundary(self) -> None:
        """Mirrors test_the_routine_prompt_states_its_boundary for the attention-source routine."""
        text = (ROOT / "docs" / "routines" / "hn-signals.md").read_text(
            encoding="utf-8"
        )
        for needle in (
            "directory/hn-signals.json",
            "run_hn_signals.py prepare",
            "run_hn_signals.py finish",
            "NEVER FETCH",
            "028",
        ):
            self.assertIn(needle, text)

    def test_scheduled_prompts_name_their_checkout_and_queue(self) -> None:
        """A scheduled run starts in no particular directory, and the signal queue lives only
        on the local sweep branch; a prompt missing either can never run unattended."""
        placeholder = "{{ATLAS_CHECKOUT}}"
        for name in ("candidate-triage.md", "hn-signals.md"):
            text = (ROOT / "docs" / "routines" / name).read_text(encoding="utf-8")
            self.assertIn(placeholder, text, name)
        signals = (ROOT / "docs" / "routines" / "hn-signals.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("run_hn_signals.py prepare --from-ref local/hn-signals", signals)

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
            "docs/PACKS.md",
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
            "docs/adr/024-candidate-triage-proposals-are-unaccepted-evidence.md",
            "docs/adr/025-model-releases-are-independent-curated-records.md",
            "docs/adr/026-app-payloads-are-a-projection-of-the-published-endpoints.md",
            "docs/adr/028-attention-sources-are-pointers-not-claims.md",
            "docs/adr/029-trust-records-are-unscored-and-never-first-hand.md",
            "docs/adr/030-local-first-and-editable-judge-the-content-a-system-keeps.md",
            "docs/adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md",
            "docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md",
            "docs/adr/033-installing-into-a-host-is-a-deployment-mode-not-a-collection.md",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_routing_documents_are_reachable_from_agents(self) -> None:
        """Topic guides may disclose ADRs through links instead of bloating AGENTS.md."""
        pending = [ROOT / "AGENTS.md"]
        reachable: set[str] = set()
        while pending:
            document = pending.pop()
            relative = document.relative_to(ROOT).as_posix()
            if relative in reachable:
                continue
            reachable.add(relative)
            text = CODE_FENCE.sub("", document.read_text(encoding="utf-8"))
            for target in MARKDOWN_LINK.findall(text):
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                path = (document.parent / unquote(target.split("#", 1)[0])).resolve()
                if (
                    path.is_relative_to(ROOT)
                    and path.is_file()
                    and path.suffix == ".md"
                ):
                    pending.append(path)
        manifest = re.findall(
            r'"((?:docs/|)[A-Za-z0-9_./-]+\.md)"', self.routing_manifest_source()
        )
        unreachable = sorted(set(manifest) - reachable)
        self.assertEqual([], unreachable)

    def routing_manifest_source(self) -> str:
        source = Path(__file__).read_text(encoding="utf-8")
        start = source.index("def test_task_routing_documents_exist")
        end = source.index("self.assertTrue((ROOT / relative).is_file()", start)
        return source[start:end]

    def test_the_local_refresh_stages_every_directory_file_except_the_signal_queue(
        self,
    ) -> None:
        """The runner's explicit staging list is what stops a new catalog file being silently

        left out of every refresh (see `scripts/run_directory_refresh.py`,
        `STAGED_DIRECTORY_FILES`). Require it to equal the directory's real contents minus the
        daily sweep's own queue file, which is committed separately and never by this runner.
        """
        from scripts import run_directory_refresh

        self.assertNotIn(
            "hn-signals.json", run_directory_refresh.STAGED_DIRECTORY_FILES
        )
        on_disk = {p.name for p in (ROOT / "directory").glob("*.json")} - {
            "hn-signals.json"
        }
        staged = {
            path.split("/", 1)[1]
            for path in run_directory_refresh.STAGED_DIRECTORY_FILES
        }
        self.assertEqual(on_disk, staged)

    def test_every_path_has_a_code_owner(self) -> None:
        owners = (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
        rules = [
            line.split()
            for line in owners.splitlines()
            if line.strip() and not line.startswith("#")
        ]
        self.assertTrue(any(rule[0] == "*" and len(rule) > 1 for rule in rules), owners)

    def test_pages_deploy_accepts_only_trusted_main_verification(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(
            encoding="utf-8"
        )
        match = re.search(r"(?m)^  build:\n    if: >-\n((?:      .*\n)+)", workflow)
        self.assertIsNotNone(match)
        condition = " ".join(line.strip() for line in match.group(1).splitlines())
        expected = (
            "github.event_name == 'workflow_run' && "
            "github.event.workflow_run.event == 'push' && "
            "github.event.workflow_run.conclusion == 'success' && "
            "github.event.workflow_run.head_repository.full_name == github.repository && "
            "github.event.workflow_run.head_branch == github.event.repository.default_branch"
        )

        self.assertEqual(expected, condition)

    def test_pages_deploy_cannot_be_dispatched_by_hand(self) -> None:
        """A manual run would publish without the complete verify workflow (CR-04).

        Redeploying goes through a re-run of the push-triggered verify run instead.
        """
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("workflow_dispatch", workflow)


if __name__ == "__main__":
    unittest.main()
