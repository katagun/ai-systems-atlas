from __future__ import annotations

import contextlib
import io
import unittest

from scripts import run_directory_refresh as refresh


class ScriptedRun:
    """A fake `run(command, cwd=None, env=None)` for exercising the runner without a shell.

    `exact` maps a full command tuple to a fixed `(code, output)` result (or a callable
    producing one); `prefixes` matches a command by its leading elements, for commands
    whose tail varies (a `gh pr create` body, a commit message). Every call is recorded
    in `.calls` so a test can assert what ran, in what order, and with what `env`.
    """

    def __init__(self, exact=None, prefixes=None):
        self.exact = dict(exact or {})
        self.prefixes = list(prefixes or [])
        self.calls: list[dict] = []

    def __call__(self, command, cwd=None, env=None):
        command = list(command)
        self.calls.append(
            {"command": command, "cwd": cwd, "env": dict(env) if env else None}
        )
        key = tuple(command)
        if key in self.exact:
            return self._resolve(self.exact[key], command, cwd, env)
        for prefix, result in self.prefixes:
            if tuple(command[: len(prefix)]) == tuple(prefix):
                return self._resolve(result, command, cwd, env)
        return (0, "")

    @staticmethod
    def _resolve(result, command, cwd, env):
        return result(command, cwd, env) if callable(result) else result


# Commands the preflight and plumbing steps issue outside the generation/check lists.
STATUS = ("git", "status", "--porcelain")
FETCH = ("git", "fetch", "--quiet", "origin", "main")
REV_PARSE_HEAD = ("git", "rev-parse", "HEAD")
REV_PARSE_ORIGIN_MAIN = ("git", "rev-parse", "origin/main")
AUTH_TOKEN = ("gh", "auth", "token")
DIFF_QUIET = ("git", "diff", "--cached", "--quiet")
DIFF_CHECK = ("git", "diff", "--cached", "--check")
ADD_WEB = ("git", "add", "-A", "web")
ADD_DIRECTORY = ("git", "add", *refresh.STAGED_DIRECTORY_FILES)
CHECKOUT_BRANCH = ("git", "checkout", "-B", refresh.REFRESH_BRANCH)
REV_PARSE_SHORT = ("git", "rev-parse", "--short", "HEAD")
PUSH = (
    "git",
    "push",
    "--force-with-lease",
    "origin",
    f"HEAD:refs/heads/{refresh.REFRESH_BRANCH}",
)
PR_LIST = ("gh", "pr", "list")


def clean_matching_tree(overrides: dict | None = None) -> dict:
    """A baseline of exact-match results: clean tree, HEAD == origin/main, no token."""
    base = {
        STATUS: (0, ""),
        FETCH: (0, ""),
        REV_PARSE_HEAD: (0, "abc123\n"),
        REV_PARSE_ORIGIN_MAIN: (0, "abc123\n"),
        AUTH_TOKEN: (0, ""),
        DIFF_QUIET: (0, ""),  # 0 => `git diff --cached` is empty => nothing staged
        DIFF_CHECK: (0, ""),
        ADD_WEB: (0, ""),
        ADD_DIRECTORY: (0, ""),
        CHECKOUT_BRANCH: (0, ""),
        REV_PARSE_SHORT: (0, "abc123\n"),
    }
    base.update(overrides or {})
    return base


class PreflightTests(unittest.TestCase):
    def test_a_dirty_tree_is_refused(self) -> None:
        run = ScriptedRun(
            clean_matching_tree({STATUS: (0, " M directory/projects.json\n")})
        )
        error = refresh.preflight(run)
        self.assertIsNotNone(error)
        self.assertIn("dirty", error)

    def test_head_not_matching_a_freshly_fetched_origin_main_is_refused(self) -> None:
        run = ScriptedRun(clean_matching_tree({REV_PARSE_ORIGIN_MAIN: (0, "def456\n")}))
        error = refresh.preflight(run)
        self.assertIsNotNone(error)
        self.assertIn("origin/main", error)

    def test_a_clean_tree_matching_origin_main_passes(self) -> None:
        run = ScriptedRun(clean_matching_tree())
        self.assertIsNone(refresh.preflight(run))

    def test_preflight_fetches_origin_main_before_comparing(self) -> None:
        run = ScriptedRun(clean_matching_tree())
        refresh.preflight(run)
        commands = [call["command"] for call in run.calls]
        self.assertIn(list(FETCH), commands)


class TokenTests(unittest.TestCase):
    def test_the_token_comes_from_gh_auth_token(self) -> None:
        run = ScriptedRun({AUTH_TOKEN: (0, "gho_secret123\n")})
        self.assertEqual("gho_secret123", refresh.github_token(run))

    def test_a_failing_gh_auth_token_warns_and_continues(self) -> None:
        run = ScriptedRun({AUTH_TOKEN: (1, "not logged in")})
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            token = refresh.github_token(run)
        self.assertIsNone(token)
        self.assertIn("warning", stderr.getvalue().lower())
        self.assertIn("rate limit", stderr.getvalue().lower())

    def test_token_reaches_only_the_three_scripts_that_read_it(self) -> None:
        run = ScriptedRun(clean_matching_tree())
        token = "gho_secret123"
        refresh.run_generation_steps(run, token)
        refresh.run_checks(run, token)
        token_calls = [
            call for call in run.calls if call["env"] and "GITHUB_TOKEN" in call["env"]
        ]
        token_scripts = {
            call["command"][-1]
            for call in token_calls
            if call["command"][-1].endswith(".py")
        }
        self.assertEqual(
            {
                "scripts/update_directory.py",
                "scripts/import_models_dev.py",
                "scripts/check_evidence_links.py",
            },
            token_scripts,
        )
        for call in token_calls:
            self.assertEqual({"GITHUB_TOKEN": token}, call["env"])
        non_token_calls = [call for call in run.calls if call not in token_calls]
        self.assertTrue(all(call["env"] is None for call in non_token_calls))

    def test_the_token_never_appears_in_printed_output(self) -> None:
        token = "gho_super_secret_value"
        run = ScriptedRun(clean_matching_tree({AUTH_TOKEN: (0, token)}))
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            refresh.main([], run=run)
        self.assertNotIn(token, stdout.getvalue())
        self.assertNotIn(token, stderr.getvalue())


class GenerationStepsTests(unittest.TestCase):
    def test_steps_run_in_the_documented_order(self) -> None:
        run = ScriptedRun(clean_matching_tree())
        refresh.run_generation_steps(run, None)
        expected = [
            list(command) for _name, command, _needs_token in refresh.GENERATION_STEPS
        ]
        self.assertEqual(expected, [call["command"] for call in run.calls])

    def test_a_failure_stops_the_run(self) -> None:
        failing = ("uv", "run", "python", "scripts/import_models_dev.py")
        run = ScriptedRun(clean_matching_tree({failing: (1, "boom")}))
        ok, results = refresh.run_generation_steps(run, None)
        self.assertFalse(ok)
        ran = [call["command"] for call in run.calls]
        self.assertIn(list(failing), ran)
        # The third generation step (sync_web_data.py) must never run.
        self.assertNotIn(["uv", "run", "python", "scripts/sync_web_data.py"], ran)
        self.assertEqual(2, len(results))


class ChecksTests(unittest.TestCase):
    def test_all_twelve_checks_run_even_when_one_fails(self) -> None:
        failing = ("uv", "run", "python", "-m", "compileall", "scripts", "tests")
        run = ScriptedRun(
            clean_matching_tree({failing: (1, "syntax error"), DIFF_QUIET: (1, "")})
        )
        results = refresh.run_checks(run, None)
        self.assertEqual(12, len(results))
        names = [name for name, _ok, _output in results]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn("generated diff whitespace", names)
        outcomes = dict((name, ok) for name, ok, _output in results)
        self.assertFalse(outcomes["compileall"])
        self.assertTrue(
            all(ok for name, ok in outcomes.items() if name != "compileall")
        )

    def test_main_exits_non_zero_when_a_check_fails(self) -> None:
        failing = ("uv", "run", "python", "scripts/validate_directory.py")
        run = ScriptedRun(
            clean_matching_tree({failing: (1, "invalid"), DIFF_QUIET: (1, "")})
        )
        code = refresh.main([], run=run)
        self.assertNotEqual(0, code)


class StagingTests(unittest.TestCase):
    def test_staged_paths_match_the_explicit_list_exactly(self) -> None:
        run = ScriptedRun(clean_matching_tree())
        refresh.stage_directory_files(run)
        add_calls = [
            call["command"]
            for call in run.calls
            if call["command"][:2] == ["git", "add"]
        ]
        self.assertIn(["git", "add", "-A", "web"], add_calls)
        directory_calls = [
            call for call in add_calls if call != ["git", "add", "-A", "web"]
        ]
        self.assertEqual(1, len(directory_calls))
        self.assertEqual(list(refresh.STAGED_DIRECTORY_FILES), directory_calls[0][2:])
        self.assertNotIn("directory/hn-signals.json", directory_calls[0])


class NothingChangedTests(unittest.TestCase):
    def test_nothing_changed_says_so_and_exits_zero(self) -> None:
        run = ScriptedRun(clean_matching_tree())  # DIFF_QUIET is 0: nothing staged
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = refresh.main([], run=run)
        self.assertEqual(0, code)
        self.assertIn("no directory changes", stdout.getvalue())
        commands = [call["command"] for call in run.calls]
        self.assertNotIn(list(CHECKOUT_BRANCH), commands)


class PublishGatingTests(unittest.TestCase):
    def test_nothing_is_pushed_and_no_pr_is_opened_without_publish(self) -> None:
        run = ScriptedRun(clean_matching_tree({DIFF_QUIET: (1, "")}))
        code = refresh.main([], run=run)
        self.assertEqual(0, code)
        commands = [call["command"] for call in run.calls]
        self.assertFalse(any(command[:2] == ["git", "push"] for command in commands))
        self.assertFalse(any(command[:2] == ["gh", "pr"] for command in commands))
        # Without --publish, the runner still commits locally.
        self.assertIn(list(CHECKOUT_BRANCH), commands)

    def test_publish_pushes_with_force_with_lease_and_opens_a_pull_request(
        self,
    ) -> None:
        overrides = clean_matching_tree(
            {
                DIFF_QUIET: (1, ""),
                PUSH: (0, ""),
            }
        )
        run = ScriptedRun(
            overrides,
            prefixes=[
                (PR_LIST, (0, "")),  # no existing PR -> empty number
                (("gh", "pr", "create"), (0, "https://example.invalid/pull/1")),
            ],
        )
        code = refresh.main(["--publish"], run=run)
        self.assertEqual(0, code)
        commands = [call["command"] for call in run.calls]
        self.assertIn(list(PUSH), commands)
        self.assertTrue(
            any(command[:3] == ["gh", "pr", "create"] for command in commands)
        )

    def test_publish_with_a_failed_check_opens_a_draft_pull_request(self) -> None:
        failing = ("uv", "run", "python", "scripts/validate_directory.py")
        overrides = clean_matching_tree(
            {
                failing: (1, "invalid"),
                DIFF_QUIET: (1, ""),
                PUSH: (0, ""),
            }
        )
        run = ScriptedRun(
            overrides,
            prefixes=[
                (PR_LIST, (0, "")),
                (("gh", "pr", "create"), (0, "https://example.invalid/pull/1")),
            ],
        )
        code = refresh.main(["--publish"], run=run)
        self.assertNotEqual(0, code)
        create_calls = [
            call["command"]
            for call in run.calls
            if call["command"][:3] == ["gh", "pr", "create"]
        ]
        self.assertEqual(1, len(create_calls))
        self.assertIn("--draft", create_calls[0])


class LinkPendingTests(unittest.TestCase):
    """The `link pending:` validator line otherwise has no reader (docs/OPERATIONS.md)."""

    def test_link_pending_lines_are_pulled_from_every_result_and_deduplicated(
        self,
    ) -> None:
        results = [
            (
                "validate_directory",
                True,
                "validated 3 models\nlink pending: model-acme-chat <- acme/chat\n"
                "link pending: model-acme-other <- acme/other\n",
            ),
            ("unittest", True, "OK\n"),
            (
                "app payload freshness",
                True,
                # A different check that happens to also run validate_directory and
                # print the same line must not duplicate it.
                "link pending: model-acme-chat <- acme/chat\n",
            ),
        ]

        self.assertEqual(
            [
                "link pending: model-acme-chat <- acme/chat",
                "link pending: model-acme-other <- acme/other",
            ],
            refresh.link_pending_lines(results),
        )

    def test_link_pending_lines_is_empty_when_no_result_mentions_one(self) -> None:
        results = [("validate_directory", True, "validated 3 models\n")]
        self.assertEqual([], refresh.link_pending_lines(results))

    def test_check_summary_prints_a_section_only_when_something_is_pending(
        self,
    ) -> None:
        pending_results = [
            ("validate_directory", True, "link pending: model-acme-chat <- acme/chat\n")
        ]
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            refresh.print_check_summary(pending_results)
        self.assertIn("== Models awaiting a models.dev link ==", stdout.getvalue())
        self.assertIn("link pending: model-acme-chat <- acme/chat", stdout.getvalue())

        clean_results = [("validate_directory", True, "validated 3 models\n")]
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            refresh.print_check_summary(clean_results)
        self.assertNotIn("Models awaiting a models.dev link", stdout.getvalue())

    def test_pr_body_adds_a_section_only_when_something_is_pending(self) -> None:
        clean_results = [("validate_directory", True, "validated 3 models\n")]
        pending_results = [
            ("validate_directory", True, "link pending: model-acme-chat <- acme/chat\n")
        ]

        clean_body = refresh.build_pr_body(clean_results)
        self.assertNotIn("Models awaiting a models.dev link", clean_body)

        pending_body = refresh.build_pr_body(pending_results)
        self.assertIn("## Models awaiting a models.dev link", pending_body)
        self.assertIn("- link pending: model-acme-chat <- acme/chat", pending_body)
        self.assertIn(
            "models.dev now lists these reviewed releases; run the `link` command "
            "in docs/MODELS.md.",
            pending_body,
        )

    def test_pr_body_is_byte_identical_to_before_when_nothing_is_pending(self) -> None:
        """Locks the exact original body so the new section never leaks in empty."""
        results = [
            ("validate_directory", True, "validated 3 models\n"),
            ("unittest", False, "boom\n"),
        ]
        expected = "\n".join(
            [
                "Local metadata refresh and candidate discovery.",
                "",
                "## Verification",
                "",
                "- `validate_directory`: passed",
                "- `unittest`: **failed**",
                "",
                "Review license incidents and candidate additions before merging.",
            ]
        )
        self.assertEqual(expected, refresh.build_pr_body(results))


if __name__ == "__main__":
    unittest.main()
