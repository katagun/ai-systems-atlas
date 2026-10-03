from __future__ import annotations

import contextlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest.mock import patch

from scripts import ci_changes as ci
from scripts import run_python_tests, scan_secrets

BASE = "a" * 40
HEAD = "b" * 40
GIT_ENV = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR")


def completed(
    returncode: int = 0, stdout: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], returncode, stdout, "")


def workflow_run(sha: str = BASE, **overrides: object) -> dict:
    return {
        "id": 1,
        "event": "push",
        "conclusion": "success",
        "head_branch": "main",
        "head_sha": sha,
        **overrides,
    }


def push_event() -> dict:
    return {
        "ref": "refs/heads/main",
        "before": "c" * 40,
        "repository": {"full_name": "owner/atlas", "default_branch": "main"},
    }


class ChangeClassificationTests(unittest.TestCase):
    def test_content_and_javascript_changes_skip_full_python_and_full_lint(
        self,
    ) -> None:
        for path in (
            "README.md",
            "docs/OPERATIONS.md",
            "blog/2026-10-03-ci.md",
            "skills/ai-systems-atlas/SKILL.md",
            "directory/projects.json",
            "web/app.js",
            "web/index.html",
            "web/styles.css",
            "web/app/systems.json",
            "scripts/build_logos.mjs",
            "tests/test_web.js",
            "tests/e2e/search.spec.js",
        ):
            with self.subTest(path=path):
                self.assertEqual((False, False), ci.classify([path]))

    def test_python_in_any_location_requires_coverage_but_keeps_lint_scoped(
        self,
    ) -> None:
        for path in (
            "scripts/ci_changes.py",
            "tests/test_ci_changes.py",
            "web/check.py",
            "types/api.pyi",
        ):
            with self.subTest(path=path):
                self.assertEqual((True, False), ci.classify(["README.md", path]))

    def test_tooling_configuration_and_unknown_inputs_require_full_checks(self) -> None:
        for path in (
            *ci.TOOL_CONFIG,
            ".stylelintrc.json",
            ".github/workflows/verify.yml",
            "Makefile",
            "new-tool/config.json",
        ):
            with self.subTest(path=path):
                self.assertEqual((True, True), ci.classify([path]))

    def test_an_empty_diff_has_no_expensive_work(self) -> None:
        self.assertEqual((False, False), ci.classify([]))

    def test_secret_rule_changes_require_a_complete_history_scan(self) -> None:
        for path in (
            ".gitleaks.toml",
            ".pre-commit-config.yaml",
            "scripts/scan_secrets.py",
        ):
            with (
                self.subTest(path=path),
                patch.object(ci, "changed_files", return_value=[path]),
            ):
                self.assertTrue(ci.make_plan(BASE, HEAD, "test").full_history)
        with patch.object(ci, "changed_files", return_value=["README.md"]):
            self.assertFalse(ci.make_plan(BASE, HEAD, "test").full_history)

    def test_unknown_baseline_requires_every_check(self) -> None:
        plan = ci.make_plan(None, HEAD, "missing")
        self.assertEqual(
            {
                "base": "",
                "head": HEAD,
                "python_tests": "true",
                "lint_all": "true",
                "full_history": "true",
            },
            plan.outputs(),
        )


class GitChangesTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.enterContext(patch.object(ci, "ROOT", self.root))
        env = {key: value for key, value in os.environ.items() if key not in GIT_ENV}
        self.enterContext(patch.dict(os.environ, env, clear=True))
        self.git("init", "--initial-branch=main")
        self.git("config", "user.name", "CI test")
        self.git("config", "user.email", "ci-test@example.invalid")
        self.write("README.md", "Atlas\n")
        self.base = self.commit("initial")

    def git(self, *args: str) -> str:
        return subprocess.run(
            [
                "git",
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "commit.gpgsign=false",
                *args,
            ],
            cwd=self.root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def write(self, path: str, text: str = "fixture\n") -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def commit(self, message: str) -> str:
        self.git("add", "--all")
        self.git("commit", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def test_renaming_python_into_docs_still_requires_python_tests(self) -> None:
        self.write("scripts/old.py", "answer = 42\n")
        before = self.commit("python")
        (self.root / "docs").mkdir()
        self.git("mv", "scripts/old.py", "docs/old.txt")
        after = self.commit("rename")
        self.assertEqual(
            {"scripts/old.py", "docs/old.txt"}, set(ci.changed_files(before, after))
        )
        self.assertEqual(
            ["docs/old.txt"], ci.changed_files(before, after, existing_only=True)
        )
        self.assertTrue(ci.make_plan(before, after, "rename").python_tests)

    def test_deleted_python_is_classified_even_though_lint_excludes_it(self) -> None:
        self.write("scripts/removed.py")
        before = self.commit("add python")
        (self.root / "scripts/removed.py").unlink()
        after = self.commit("remove python")
        self.assertEqual(["scripts/removed.py"], ci.changed_files(before, after))
        self.assertEqual([], ci.changed_files(before, after, existing_only=True))
        self.assertTrue(ci.make_plan(before, after, "delete").python_tests)

    def test_null_delimited_diff_preserves_spaces_newlines_and_option_like_paths(
        self,
    ) -> None:
        names = {"docs/two words.md", "docs/two\nlines.md", "--all-files"}
        for name in names:
            self.write(name)
        head = self.commit("awkward names")
        self.assertEqual(names, set(ci.changed_files(self.base, head)))

    def test_pr_compares_merge_base_through_the_tested_merge_commit(self) -> None:
        self.git("switch", "-c", "feature")
        self.write("README.md", "Updated docs\n")
        feature = self.commit("feature docs")
        self.git("switch", "main")
        self.write("scripts/concurrent.py", "answer = 42\n")
        target = self.commit("main python change")
        self.git("merge", "--no-ff", "feature", "-m", "test merge")
        tested = self.git("rev-parse", "HEAD")
        event = {"pull_request": {"base": {"sha": target}, "head": {"sha": feature}}}
        plan = ci.event_plan(event, "pull_request", tested)
        self.assertEqual(self.base, plan.base)
        self.assertEqual(tested, plan.head)
        self.assertTrue(plan.python_tests)
        self.assertFalse(plan.lint_all)

    def test_main_accumulates_unverified_pushes_and_ignores_ineligible_runs(
        self,
    ) -> None:
        self.git("switch", "-c", "unrelated")
        self.write("unrelated.txt")
        unrelated = self.commit("unrelated history")
        self.git("switch", "main")
        self.write("scripts/unverified.py")
        unverified = self.commit("canceled python push")
        self.write("README.md", "Only the latest push is documentation\n")
        head = self.commit("docs push")
        runs = [
            workflow_run(head, id=55),
            workflow_run(unverified, id=54, conclusion="cancelled"),
            workflow_run(head, id=53, event="pull_request"),
            workflow_run(head, id=52, head_branch="feature"),
            workflow_run(unrelated, id=51),
            workflow_run("--invalid", id=50),
            workflow_run(self.base, id=49),
        ]
        with (
            patch.object(ci, "api_workflow_runs", return_value=runs),
            patch.dict(os.environ, {"GITHUB_RUN_ID": "55"}),
        ):
            plan = ci.event_plan(push_event(), "push", head)
        self.assertEqual(self.base, plan.base)
        self.assertTrue(plan.python_tests)
        self.assertFalse(plan.full_history)

    def test_commit_resolution_accepts_refs_but_rejects_option_injection(self) -> None:
        self.assertEqual(self.base, ci.commit("HEAD"))
        with self.assertRaises(subprocess.CalledProcessError):
            ci.commit("--help")


class VerificationBaselineTests(unittest.TestCase):
    def test_unresolvable_pr_commits_fall_back_to_full_verification(self) -> None:
        event = {"pull_request": {"base": {"sha": BASE}, "head": {"sha": HEAD}}}
        failure = subprocess.CalledProcessError(128, ["git", "rev-parse"])
        for resolutions in ([failure], [BASE, failure]):
            with (
                self.subTest(resolutions=resolutions),
                patch.object(ci, "commit", side_effect=resolutions),
            ):
                plan = ci.event_plan(event, "pull_request", HEAD)
                self.assertIsNone(plan.base)
                self.assertTrue(
                    plan.python_tests and plan.lint_all and plan.full_history
                )

    def test_missing_pr_merge_base_falls_back_to_full_verification(self) -> None:
        event = {"pull_request": {"base": {"sha": BASE}, "head": {"sha": HEAD}}}
        with (
            patch.object(ci, "commit", side_effect=[BASE, HEAD]),
            patch.object(
                ci,
                "git",
                side_effect=subprocess.CalledProcessError(1, ["git", "merge-base"]),
            ),
        ):
            plan = ci.event_plan(event, "pull_request", HEAD)
        self.assertIsNone(plan.base)
        self.assertTrue(plan.python_tests and plan.lint_all and plan.full_history)

    def test_api_pages_are_followed_until_a_successful_ancestor_is_found(self) -> None:
        skipped = [workflow_run(conclusion="cancelled")] * 100
        with (
            patch.object(
                ci, "api_workflow_runs", side_effect=[skipped, [workflow_run()]]
            ) as api,
            patch.object(ci, "git", return_value=completed()) as git,
        ):
            self.assertEqual(
                BASE, ci.last_verified_commit("owner/atlas", "main", HEAD, "99")
            )
        self.assertEqual([1, 2], [call.args[-1] for call in api.call_args_list])
        git.assert_called_once_with(
            "merge-base", "--is-ancestor", BASE, HEAD, check=False
        )

    def test_baseline_search_is_bounded_and_missing_ancestor_returns_none(self) -> None:
        with patch.object(
            ci,
            "api_workflow_runs",
            return_value=[workflow_run(conclusion="cancelled")] * 100,
        ) as api:
            self.assertIsNone(
                ci.last_verified_commit("owner/atlas", "main", HEAD, "99")
            )
        self.assertEqual(10, api.call_count)
        with patch.object(ci, "api_workflow_runs", return_value=[]):
            self.assertIsNone(
                ci.last_verified_commit("owner/atlas", "main", HEAD, "99")
            )

    def test_api_failure_falls_back_to_full_checks_not_the_previous_push(self) -> None:
        for error in (
            urllib.error.URLError("offline"),
            ValueError("bad JSON"),
            KeyError("workflow_runs"),
            TypeError("bad result"),
            TimeoutError(),
        ):
            with (
                self.subTest(error=error),
                patch.object(ci, "last_verified_commit", side_effect=error),
            ):
                plan = ci.event_plan(push_event(), "push", HEAD)
                self.assertIsNone(plan.base)
                self.assertTrue(
                    plan.python_tests and plan.lint_all and plan.full_history
                )

    def test_no_successful_baseline_and_nondefault_push_are_full_checks(self) -> None:
        with patch.object(ci, "last_verified_commit", return_value=None):
            self.assertIsNone(ci.event_plan(push_event(), "push", HEAD).base)
        event = push_event()
        event["ref"] = "refs/heads/feature"
        with patch.object(ci, "last_verified_commit") as baseline:
            self.assertTrue(ci.event_plan(event, "push", HEAD).full_history)
        baseline.assert_not_called()

    def test_schedule_dispatch_and_unknown_event_are_full_checks(self) -> None:
        for event_name in ("schedule", "workflow_dispatch", "unexpected"):
            with self.subTest(event=event_name):
                plan = ci.event_plan({}, event_name, HEAD)
                self.assertTrue(
                    plan.python_tests and plan.lint_all and plan.full_history
                )

    def test_api_uses_fixed_origin_encoded_parameters_and_bounded_timeout(self) -> None:
        with (
            patch.dict(os.environ, {"GITHUB_TOKEN": "test-fixture-token"}),
            patch.object(
                ci.urllib.request,
                "urlopen",
                return_value=io.StringIO(
                    json.dumps({"workflow_runs": [workflow_run()]})
                ),
            ) as fetch,
        ):
            self.assertEqual(
                [workflow_run()],
                ci.api_workflow_runs("owner/atlas", "branch with/slash", 3),
            )
        request = fetch.call_args.args[0]
        url = urllib.parse.urlparse(request.full_url)
        self.assertEqual("https", url.scheme)
        self.assertEqual("api.github.com", url.netloc)
        self.assertEqual(
            "/repos/owner/atlas/actions/workflows/verify.yml/runs", url.path
        )
        self.assertEqual(
            {
                "branch": ["branch with/slash"],
                "event": ["push"],
                "status": ["success"],
                "per_page": ["100"],
                "page": ["3"],
            },
            urllib.parse.parse_qs(url.query),
        )
        self.assertEqual(
            "Bearer test-fixture-token", request.get_header("Authorization")
        )
        self.assertEqual(30, fetch.call_args.kwargs["timeout"])

    def test_api_omits_authorization_when_no_token_exists(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                ci.urllib.request,
                "urlopen",
                return_value=io.StringIO('{"workflow_runs": []}'),
            ) as fetch,
        ):
            self.assertEqual([], ci.api_workflow_runs("owner/atlas", "main", 1))
        self.assertIsNone(fetch.call_args.args[0].get_header("Authorization"))

    def test_repository_cannot_change_the_api_origin_or_path(self) -> None:
        with patch.object(ci.urllib.request, "urlopen") as fetch:
            for repository in (
                "https://evil.example/a",
                "owner/repo/../other",
                "owner/repo?x=1",
                "owner/repo\nheader",
            ):
                with self.subTest(repository=repository), self.assertRaises(ValueError):
                    ci.api_workflow_runs(repository, "main", 1)
        fetch.assert_not_called()

    def test_non_sha_commit_resolution_fails_closed(self) -> None:
        with (
            patch.object(ci, "git", return_value=completed(stdout="not-a-sha\n")),
            self.assertRaises(ValueError),
        ):
            ci.commit("HEAD")


class LintAndPlanCommandTests(unittest.TestCase):
    def test_lint_passes_safe_filenames_and_preserves_existing_skips(self) -> None:
        names = ["docs/two words.md", "docs/two\nlines.md", "--all-files"]
        with (
            patch.object(ci, "changed_files", return_value=names) as diff,
            patch.object(ci.subprocess, "run", return_value=completed(7)) as run,
            patch.dict(os.environ, {"SKIP": "codespell"}),
        ):
            self.assertEqual(7, ci.run_lint(BASE, HEAD, False))
        diff.assert_called_once_with(BASE, HEAD, existing_only=True)
        self.assertEqual(
            [
                "pre-commit",
                "run",
                "--show-diff-on-failure",
                "--files",
                *[f"./{name}" for name in names],
            ],
            run.call_args.args[0],
        )
        self.assertEqual(
            {"codespell", "no-commit-to-branch", "gitleaks"},
            set(run.call_args.kwargs["env"]["SKIP"].split(",")),
        )
        self.assertFalse(run.call_args.kwargs["check"])

    def test_full_lint_and_unknown_baseline_use_all_files(self) -> None:
        for base, lint_all in ((BASE, True), (None, False)):
            with (
                self.subTest(base=base, lint_all=lint_all),
                patch.object(ci, "changed_files") as diff,
                patch.object(ci.subprocess, "run", return_value=completed()) as run,
            ):
                self.assertEqual(0, ci.run_lint(base, HEAD, lint_all))
                self.assertIn("--all-files", run.call_args.args[0])
                diff.assert_not_called()

    def test_plan_appends_machine_outputs_and_keeps_reason_out_of_github_output(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "output"
            output.write_text("existing=value\n", encoding="utf-8")
            env = {"GITHUB_OUTPUT": str(output)}
            with (
                patch.dict(os.environ, env, clear=True),
                patch.object(ci, "commit", side_effect=[HEAD, BASE]),
                patch.object(ci, "changed_files", return_value=["README.md"]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(0, ci.main(["plan", "--base", BASE]))
            self.assertEqual(
                f"existing=value\nbase={BASE}\nhead={HEAD}\npython_tests=false\nlint_all=false\nfull_history=false\n",
                output.read_text(encoding="utf-8"),
            )

    def test_plan_reads_the_event_file_and_all_flag_forces_complete_checks(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            event_path = Path(temporary) / "event.json"
            event_path.write_text(json.dumps(push_event()), encoding="utf-8")
            env = {"GITHUB_EVENT_PATH": str(event_path), "GITHUB_EVENT_NAME": "push"}
            with (
                patch.dict(os.environ, env, clear=True),
                patch.object(ci, "commit", return_value=HEAD),
                patch.object(
                    ci, "event_plan", return_value=ci.make_plan(None, HEAD, "fallback")
                ) as event_plan,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(0, ci.main(["plan"]))
                event_plan.assert_called_once_with(push_event(), "push", HEAD)
                event_plan.reset_mock()
                self.assertEqual(0, ci.main(["plan", "--all"]))
                event_plan.assert_not_called()

    def test_lint_command_uses_environment_plan(self) -> None:
        with (
            patch.dict(
                os.environ,
                {"ATLAS_CI_BASE": BASE, "ATLAS_CI_LINT_ALL": "true"},
                clear=True,
            ),
            patch.object(ci, "commit", side_effect=[HEAD, BASE]),
            patch.object(ci, "run_lint", return_value=8) as lint,
        ):
            self.assertEqual(8, ci.main(["lint"]))
        lint.assert_called_once_with(BASE, HEAD, True)


class SecretScanTests(unittest.TestCase):
    def test_explicit_range_is_bounded_to_the_verified_diff(self) -> None:
        command = scan_secrets.command(BASE, HEAD)
        self.assertIn(f"--log-opts={BASE}..{HEAD}", command)
        self.assertIn("--redact", command)
        self.assertIn(".gitleaks.toml", command)

    def test_audit_without_base_scans_all_fetched_history(self) -> None:
        self.assertIn("--log-opts=--all", scan_secrets.command("", ""))

    def test_incomplete_or_option_like_range_is_rejected_before_execution(self) -> None:
        for base, head in (
            ("--all", HEAD),
            (BASE, "--all"),
            (BASE[:8], HEAD),
            (BASE, ""),
            (BASE + "\n--all", HEAD),
        ):
            with self.subTest(base=base, head=head), self.assertRaises(ValueError):
                scan_secrets.command(base, head)

    def test_scanner_failure_reaches_the_workflow(self) -> None:
        with (
            patch.dict(
                os.environ,
                {"ATLAS_GITLEAKS_BASE": BASE, "ATLAS_GITLEAKS_HEAD": HEAD},
                clear=True,
            ),
            patch.object(
                scan_secrets.subprocess, "run", return_value=completed(3)
            ) as run,
        ):
            self.assertEqual(3, scan_secrets.main())
        run.assert_called_once_with(scan_secrets.command(BASE, HEAD), check=False)


class PythonCoverageRunnerTests(unittest.TestCase):
    def test_runs_coverage_then_report_and_isolates_temporary_git_repositories(
        self,
    ) -> None:
        env = dict.fromkeys(GIT_ENV, "/wrong/repository") | {"PRESERVE_ME": "yes"}
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(
                run_python_tests.subprocess, "run", return_value=completed()
            ) as run,
        ):
            self.assertEqual(0, run_python_tests.main())
        self.assertEqual(
            [
                [
                    sys.executable,
                    "-m",
                    "coverage",
                    "run",
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    "tests",
                ],
                [sys.executable, "-m", "coverage", "report"],
            ],
            [call.args[0] for call in run.call_args_list],
        )
        for call in run.call_args_list:
            self.assertEqual({"PRESERVE_ME": "yes"}, call.kwargs["env"])
            self.assertEqual(run_python_tests.ROOT, call.kwargs["cwd"])

    def test_failed_tests_stop_before_coverage_report(self) -> None:
        with patch.object(
            run_python_tests.subprocess, "run", return_value=completed(5)
        ) as run:
            self.assertEqual(5, run_python_tests.main())
        self.assertEqual(1, run.call_count)

    def test_coverage_threshold_failure_is_preserved(self) -> None:
        with patch.object(
            run_python_tests.subprocess, "run", side_effect=[completed(), completed(2)]
        ) as run:
            self.assertEqual(2, run_python_tests.main())
        self.assertEqual(2, run.call_count)


class RequiredWorkflowGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        workflow = (
            Path(__file__).resolve().parents[1] / ".github/workflows/verify.yml"
        ).read_text(encoding="utf-8")
        job = workflow.split("  verify:\n", 1)[1]
        script = re.search(r"(?m)^        run: \|\n((?:          .*\n)+)", job)
        if script is None:
            raise AssertionError("verify job has no executable gate script")
        cls.script = textwrap.dedent(script.group(1))

    def run_gate(self, **overrides: str) -> int:
        env = (
            os.environ.copy()
            | {
                "CHANGES_RESULT": "success",
                "STATIC_RESULT": "success",
                "PYTHON_RESULT": "success",
                "PYTHON_EXPECTED": "true",
            }
            | overrides
        )
        return subprocess.run(
            ["bash", "-e", "-o", "pipefail", "-c", self.script],
            env=env,
            check=False,
            text=True,
            capture_output=True,
        ).returncode

    def test_success_and_deliberately_unnecessary_python_suite_pass(self) -> None:
        self.assertEqual(0, self.run_gate())
        self.assertEqual(
            0, self.run_gate(PYTHON_EXPECTED="false", PYTHON_RESULT="skipped")
        )
        self.assertEqual(
            0, self.run_gate(PYTHON_EXPECTED="false", PYTHON_RESULT="success")
        )

    def test_classifier_and_static_checks_are_always_required(self) -> None:
        for check in ("CHANGES_RESULT", "STATIC_RESULT"):
            for result in ("failure", "cancelled", "skipped", ""):
                with self.subTest(check=check, result=result):
                    self.assertNotEqual(0, self.run_gate(**{check: result}))

    def test_selected_python_may_not_fail_cancel_or_skip(self) -> None:
        for result in ("failure", "cancelled", "skipped", "", "unexpected"):
            with self.subTest(result=result):
                self.assertNotEqual(0, self.run_gate(PYTHON_RESULT=result))

    def test_unnecessary_python_may_skip_but_may_not_hide_a_failure(self) -> None:
        for result in ("failure", "cancelled", "", "unexpected"):
            with self.subTest(result=result):
                self.assertNotEqual(
                    0, self.run_gate(PYTHON_EXPECTED="false", PYTHON_RESULT=result)
                )

    def test_missing_or_invalid_selection_never_passes(self) -> None:
        for expected in ("", "yes", "TRUE", "false\n", "false:skipped"):
            with self.subTest(expected=expected):
                self.assertNotEqual(0, self.run_gate(PYTHON_EXPECTED=expected))


if __name__ == "__main__":
    unittest.main()
