from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
EDITORIAL_FIELDS_TABLE = re.compile(
    r"^## Human-owned editorial fields.*?^\| Collection \| Editorial fields \|"
    r".*?^\|[-| ]+\|\n(?P<rows>(?:^\|.*\|\n?)+)",
    re.DOTALL | re.MULTILINE,
)
EDITORIAL_ROW = re.compile(
    r"^\| `(?P<file>[a-z-]+\.json)` \| (?P<fields>.+?) \|$", re.MULTILINE
)
FIELD_NAME = re.compile(r"`([a-z0-9_]+)`")
COLLECTION_SCHEMA = {
    "projects.json": "PROJECT",
    "specifications.json": "SPECIFICATION",
    "packs.json": "PACK",
    "labs.json": "LAB",
    "robots.json": "ROBOT",
    "inference-services.json": "INFERENCE_SERVICE",
    "local-runtimes.json": "LOCAL_RUNTIME",
    "models.json": "MODEL",
}
CATALOG_COUNTS_BLOCK = re.compile(
    r"<!-- catalog-counts.*?-->.*?```text\n(?P<block>.*?)```", re.DOTALL
)
BACKLOG = ROOT / "BACKLOG.md"
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
            "NOBODY IS WATCHING",
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
            "docs/RUNBOOKS.md",
            "docs/INFERENCE_SERVICES.md",
            "docs/LOCAL_RUNTIMES.md",
            "docs/SPECIFICATIONS.md",
            "docs/PACKS.md",
            "docs/LABS.md",
            "docs/ROBOTS.md",
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
            "docs/adr/034-installing-into-a-host-is-a-deployment-mode-not-a-collection.md",
            "docs/adr/035-host-installed-systems-are-listed-inline-in-the-packs-scope.md",
            "docs/adr/036-the-agent-to-physical-world-boundary-is-in-scope.md",
            "docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md",
            "docs/adr/038-reviewed-models-may-precede-their-models-dev-source-row.md",
            "docs/adr/040-search-orders-by-match-never-by-score.md",
            "docs/adr/041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md",
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

    # ---- CR-10 through CR-16 -------------------------------------------------

    def _editorial_field_rows(self) -> list[tuple[str, str, list[str]]]:
        text = (ROOT / "docs" / "DATA_MODEL.md").read_text(encoding="utf-8")
        table = EDITORIAL_FIELDS_TABLE.search(text)
        self.assertIsNotNone(
            table, "docs/DATA_MODEL.md lost its human-owned editorial fields table"
        )
        assert table is not None
        return [
            (
                row.group("file"),
                row.group("fields"),
                FIELD_NAME.findall(row.group("fields")),
            )
            for row in EDITORIAL_ROW.finditer(table.group("rows"))
        ]

    def test_every_published_collection_names_its_editorial_fields(self) -> None:
        """CR-10. A collection missing from the table leaves its reserved fields undocumented.

        The project row named `significance` and `confidence`, neither of which is a
        field, while the real `why_it_matters` and `research_confidence` went undocumented.
        """
        listed = {file for file, _, _ in self._editorial_field_rows()}
        self.assertEqual(
            set(COLLECTION_SCHEMA),
            listed,
            "docs/DATA_MODEL.md editorial-fields table does not match the published collections",
        )

    def test_documented_editorial_fields_are_real_fields(self) -> None:
        """CR-10. The table must name fields, not prose that reads like fields."""
        from scripts import validate_directory as validator

        for file, prose, fields in self._editorial_field_rows():
            if file not in COLLECTION_SCHEMA:
                self.fail(
                    f"docs/DATA_MODEL.md lists {file}, which is not a published collection; "
                    "add it to COLLECTION_SCHEMA and CATALOG_DOCUMENTS in one change"
                )
            prefix = COLLECTION_SCHEMA[file]
            schema = set(getattr(validator, f"{prefix}_REQUIRED")) | set(
                getattr(validator, f"{prefix}_OPTIONAL", set())
            )
            with self.subTest(collection=file):
                self.assertTrue(
                    fields, f"{file} editorial row names no field: {prose!r}"
                )
                self.assertEqual(
                    [],
                    [name for name in fields if name not in schema],
                    f"docs/DATA_MODEL.md names fields absent from the {file} schema",
                )

    def test_coverage_snapshot_quotes_generated_counts(self) -> None:
        """CR-11. The docs/COVERAGE.md snapshot was wrong by eleven records.

        The counts were transcribed by hand and nothing recomputed them, so a data batch
        moved the catalog and left the prose asserting a catalog that no longer existed.
        """
        from scripts.validate_directory import catalog_counts, counts_markdown, load_all

        text = (ROOT / "docs" / "COVERAGE.md").read_text(encoding="utf-8")
        block = CATALOG_COUNTS_BLOCK.search(text)
        self.assertIsNotNone(block, "docs/COVERAGE.md lost its catalog-counts block")
        assert block is not None
        self.assertEqual(
            counts_markdown(catalog_counts(load_all())).strip(),
            block.group("block").strip(),
            "docs/COVERAGE.md counts are stale; rerun "
            "`uv run python scripts/validate_directory.py --counts` and paste the block",
        )

    def test_every_consumer_projects_from_the_one_catalog_registry(self) -> None:
        """CR-16. The published-file and collection tables were restated five times.

        A file added to one copy of PUBLISHED_DATA and not the other either never reaches
        web/ or is never checked for freshness, and neither failure is loud.
        """
        from scripts import (
            build_share_pages,
            build_web_payload,
            catalog,
            report_review_age,
            run_directory_refresh,
            sync_web_data,
            validate_directory,
        )

        self.assertIs(sync_web_data.PUBLISHED_DATA, catalog.PUBLISHED_DATA)
        self.assertIs(validate_directory.PUBLISHED_DATA, catalog.PUBLISHED_DATA)
        self.assertIs(validate_directory.CATALOG_DOCUMENTS, catalog.CATALOG_DOCUMENTS)
        self.assertIs(validate_directory.MODELS_DEV_REPO, catalog.MODELS_DEV_REPO)
        self.assertIs(report_review_age.COLLECTIONS, catalog.COLLECTION_TRIPLES)
        self.assertIs(build_share_pages.COLLECTIONS, catalog.SHARE_DIRECTORIES)
        self.assertEqual(
            tuple(row[:4] for row in catalog.COLLECTIONS),
            build_web_payload.COLLECTIONS,
        )
        self.assertEqual(
            set(catalog.CATALOG_DOCUMENTS) - {"hn-signals.json"},
            {
                path.split("/", 1)[1]
                for path in run_directory_refresh.STAGED_DIRECTORY_FILES
            },
        )

    def test_the_collection_registry_agrees_with_the_files_on_disk(self) -> None:
        """A registry entry for a file that does not exist publishes nothing."""
        from scripts import catalog

        self.assertEqual(
            {path.name for path in (ROOT / "directory").glob("*.json")},
            set(catalog.CATALOG_DOCUMENTS),
            "directory/ holds a file the catalog registry does not name",
        )
        self.assertEqual(
            sorted(catalog.REVIEW_AGE_ORDER),
            sorted(name for name, *_ in catalog.COLLECTIONS),
            "REVIEW_AGE_ORDER and COLLECTIONS name different collections",
        )

    def test_backlog_engineering_anchors_still_resolve(self) -> None:
        """The Engineering debt section's anchors must point at things that exist.

        These items quote line numbers, function counts, and complexity maxima to
        size their work, and every one of those drifts on an ordinary merge. On
        2026-09-29 three stale sets of figures for `web/app.js` were in circulation
        in the same afternoon (3,694, 3,728, and 3,740), and #382's own verification
        of seven line anchors was overtaken by #384 minutes later.

        So this asserts the stable property, not the volatile one: a named symbol
        is still declared, and a cited Python line is still inside its file. A
        reader sent to `syncMatchSort` (319) should find a `syncMatchSort`, even
        though the number beside it is now wrong. Asserting the line numbers themselves
        would fail on nearly every merge and train people to skip the check, which
        is worth less than no check at all.
        """
        from scripts.measure_engineering import (
            engineering_debt_section,
            javascript_anchor_failures,
            python_line_anchor_failures,
        )

        section = engineering_debt_section()
        self.assertIn("### Engineering debt", BACKLOG.read_text(encoding="utf-8"))
        failures = javascript_anchor_failures(section) + python_line_anchor_failures(
            section
        )
        self.assertEqual([], failures, "; ".join(failures) or "no anchors to check")

    def test_engineering_ratchet_is_not_undercut(self) -> None:
        """The complexity ratchet must stay above the worst function carried.

        `pyproject.toml` sets `max-complexity` as a ratchet rather than a target:
        it passes today and fails any new function worse than the worst one already
        carried. That only holds while the configured value is at or above the live
        maximum, and nothing in the linter would catch the ratchet being lowered
        past it — ruff would simply report fewer violations. The live maximum comes
        from ruff itself rather than a reimplementation, since the claim is about
        the number ruff computes.
        """
        from scripts.measure_engineering import (
            ROOT as MEASURE_ROOT,
        )
        from scripts.measure_engineering import (
            configured_ratchet,
            live_max_complexity,
        )

        configured = configured_ratchet()
        _, live = live_max_complexity(
            MEASURE_ROOT / "scripts" / "validate_directory.py"
        )
        self.assertGreater(
            live,
            0,
            "ruff reported no complexity, so the ratchet has no measured maximum",
        )
        self.assertLessEqual(
            live,
            configured,
            f"live maximum complexity {live} exceeds the configured ratchet "
            f"{configured}; CR-19's ratchet no longer constrains the worst function",
        )

    def test_web_app_js_still_declares_global_bindings(self) -> None:
        """CR-18's premise: `web/app.js` is a classic script sharing globals.

        The finding argues that the file's remaining declarations are reachable
        from the e2e suite and uncovered by unit tests, which is only true while
        they sit at global scope in a script with no module boundary. If a change
        encapsulates the file, the finding stops describing the code and prose
        that says the opposite becomes misleading — the same class of drift this
        suite exists to catch, one level up from the counts.
        """
        from scripts.measure_engineering import ROOT as MEASURE_ROOT
        from scripts.measure_engineering import module_level_declarations

        declarations = module_level_declarations(MEASURE_ROOT / "web" / "app.js")
        self.assertGreater(
            declarations,
            0,
            "web/app.js declares nothing at global scope, so CR-18's description no "
            "longer matches the file; update the finding rather than leaving it",
        )
        source = (MEASURE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn(
            "\nexport ",
            source,
            "web/app.js grew an export, so it is a module and CR-18's global-scope "
            "premise needs revisiting",
        )

    def test_adr_numbers_are_unique_and_match_their_titles(self) -> None:
        """No two ADRs may claim one number, and a filename must state its own.

        On 2026-09-29 a lab ADR was merged as 047 while a badge ADR merged as 047
        earlier the same afternoon, so `docs/adr/` carried two files claiming one
        number and every cross-reference silently picked whichever a reader opened
        first. Nothing else checks this: the link assertions above confirm a cited
        ADR *exists*, not that the one it names is the one that means. The rule is
        cheap, so it is enforced rather than remembered.
        """
        directory = ROOT / "docs" / "adr"
        numbered: dict[str, list[str]] = {}
        for path in sorted(directory.glob("*.md")):
            match = re.match(r"^(\d{3})-", path.name)
            self.assertIsNotNone(
                match, f"{path.name}: an ADR filename must start with its number"
            )
            title = path.read_text(encoding="utf-8").splitlines()[0]
            heading = re.match(r"^# ADR (\d{3}):", title)
            self.assertIsNotNone(
                heading,
                f"{path.name}: first line must be an ADR heading, got {title!r}",
            )
            self.assertEqual(
                match.group(1),
                heading.group(1),
                f"{path.name}: filename number does not match its heading {title!r}",
            )
            numbered.setdefault(match.group(1), []).append(path.name)
        duplicates = {n: names for n, names in numbered.items() if len(names) > 1}
        self.assertEqual(
            {},
            duplicates,
            "these ADR numbers are claimed more than once; renumber the newest: "
            + "; ".join(f"{n}: {names}" for n, names in sorted(duplicates.items())),
        )

    def test_adr_cross_references_name_the_adrs_they_cite(self) -> None:
        """An `ADR nnn` citation in prose must resolve to the nnn ADR on disk.

        The uniqueness test above cannot see a citation that names a number no file
        claims, which is what a renumber leaves behind: the number is unique and
        the reference is still wrong.
        """
        numbers = {path.name[:3] for path in (ROOT / "docs" / "adr").glob("*.md")}
        cited: dict[str, list[str]] = {}
        for path in sorted(ROOT.rglob("*.md")):
            if any(
                part in {".git", "node_modules", ".venv", ".claude", ".muse"}
                for part in path.parts
            ):
                continue
            # A dated design spec and an ADR are both point-in-time records, and a
            # citation that was right when it was written is not a defect in it.
            if "adr" in path.parts or "superpowers" in path.parts:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for number in set(re.findall(r"ADR (\d{3})", text)):
                if number not in numbers:
                    cited.setdefault(number, []).append(str(path.relative_to(ROOT)))
        self.assertEqual(
            {},
            cited,
            "these citations name an ADR number no file in docs/adr claims: "
            + "; ".join(f"{n}: {paths[:3]}" for n, paths in sorted(cited.items())),
        )

    def test_measured_claims_name_a_date(self) -> None:
        """A measurement quoted in the backlog must say when it was taken.

        The numbers themselves cannot be checked without failing every ordinary
        commit, but a reader can be told what a number is: a snapshot. This requires
        a date on any line that asserts a measurement of the code, so a stale
        figure announces itself instead of reading as current. It is the cheap half
        of the fix — the anchors above are the half that can be enforced.
        """
        text = BACKLOG.read_text(encoding="utf-8")
        start = text.index("### Engineering debt")
        section = text[start : text.index("### AI systems papers")]
        dated = re.compile(r"20\d\d-\d\d-\d\d")
        undated: list[str] = []
        for number, line in enumerate(section.splitlines(), start=1):
            if not line.startswith("- [ ]"):
                continue
            # A line that quotes a size and does not date it is a figure that will
            # silently read as current. Proportions, counts of items, and PR
            # references are exempt: only a measurement of the tree itself is at
            # risk, and a line that already carries a date is fine.
            measures = re.search(
                r"\b\d{1,3}(?:,\d{3})+\b|\b\d+\s*(?:lines|functions)\b", line
            )
            if measures and not dated.search(line):
                undated.append(f"line {number}: {line[:90]}")
        self.assertEqual(
            [],
            undated,
            "these lines quote a measurement with no date; add one, or drop the "
            "figure in favour of `uv run python scripts/measure_engineering.py`: "
            + "; ".join(undated),
        )

    def test_every_corner_in_the_stylesheet_comes_from_a_radius_token(self) -> None:
        """`web/styles.css` must take every corner radius from a token.

        The radius scale once encoded size rather than role, so a 112px tile and a
        dialog picked different steps and two adjacent grids rendered visibly
        different corners. That drift is invisible to a linter and only shows up
        in a screenshot, so the rule is asserted here instead: a corner is one of
        four tokens or it is a finding. A literal `50%` is the same class of
        problem, since the circle value then has a second home.
        """
        css = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
        tokens = {"var(--radius)", "var(--radius-control)", "var(--radius-chip)"}
        literals: list[str] = []
        for number, line in enumerate(css.splitlines(), start=1):
            for value in re.findall(r"border-radius:\s*([^;]+);", line):
                if value.strip() not in tokens | {"var(--radius-pill)", "0"}:
                    literals.append(f"line {number}: {value.strip()}")
        self.assertEqual(
            [],
            literals,
            "these corners set a radius directly; use --radius for containers, "
            "--radius-control for inputs and buttons, --radius-chip for badges "
            "and toggle chips, and --radius-pill only for circles: "
            + "; ".join(literals),
        )

    def test_container_components_take_the_container_radius(self) -> None:
        """A component's radius token must follow its role, not its size.

        `--radius-control` names the controls a pointer enters — inputs, buttons,
        menu items — so a panel that happens to be small cannot claim it. The
        classes below are the surfaces that drifted: popovers, table wrappers,
        dialog blocks, and grid tiles, several of which rendered beside each other
        with different corners.
        """
        css = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
        containers = (
            ".element-tile",
            ".finder-goal",
            ".finder-result",
            ".tile",
            ".detail-block",
            ".comparison-table-wrap",
            ".badge-tooltip",
            ".badge-legend-chip",
            ".taxonomy-item",
        )
        wrong: list[str] = []
        for selector in containers:
            # The selector may head a list, as `.element-tile` and `.finder-goal`
            # do: the Finder's goal tile IS the door's element tile, so one
            # declaration serves both and a second copy could drift. What the
            # rule has to state is that the named component takes --radius,
            # wherever else it shares the line.
            rule = re.search(
                rf"(?m)^{re.escape(selector)}(?:\s*,[^{{}}]*)?\s*\{{(.*?)\}}",
                css,
                re.DOTALL,
            )
            self.assertIsNotNone(rule, f"{selector} no longer exists in styles.css")
            radius = re.search(r"border-radius:\s*([^;]+);", rule.group(1))
            self.assertIsNotNone(radius, f"{selector} sets no border-radius")
            if radius.group(1).strip() != "var(--radius)":
                wrong.append(f"{selector}: {radius.group(1).strip()}")
        self.assertEqual(
            [],
            wrong,
            "these containers take a radius token that is not --radius; a "
            "container's corners should not depend on how big it is: "
            + "; ".join(wrong),
        )

    def test_the_radius_scale_stays_sharp_and_ordered(self) -> None:
        """The four steps must keep their order and stay small.

        Order is the scale's whole contract: a container's corner may never be
        tighter than a chip's, or the nesting reads inverted. The ceiling keeps
        the corners sharp, which is the intended character and the reason the
        tokens were rescaled in the first place.
        """
        css = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
        declared = dict(
            (name, int(px))
            for name, px in re.findall(r"--radius(-chip|-control)?:\s*(\d+)px;", css)
        )
        scale = {
            "chip": declared.get("-chip"),
            "control": declared.get("-control"),
            "container": declared.get(""),
            "pill": 999 if "--radius-pill: 999px;" in css else None,
        }
        self.assertEqual(
            [],
            [name for name, value in scale.items() if value is None],
            f"a radius token is missing or unparsable: {scale}",
        )
        self.assertLess(
            scale["chip"],
            scale["control"],
            f"chip radius {scale['chip']}px is not tighter than control "
            f"{scale['control']}px",
        )
        self.assertLess(
            scale["control"],
            scale["container"],
            f"control radius {scale['control']}px is not tighter than container "
            f"{scale['container']}px",
        )
        self.assertLessEqual(
            scale["container"],
            10,
            f"container radius {scale['container']}px exceeds the 10px ceiling; "
            "these corners are meant to read as sharp",
        )


if __name__ == "__main__":
    unittest.main()
