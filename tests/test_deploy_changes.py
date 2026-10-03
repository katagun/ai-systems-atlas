from __future__ import annotations

import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from scripts import check_deploy_changes as deploy


class GitHubTests(unittest.TestCase):
    def test_pagination_exhausts_full_pages(self) -> None:
        api = deploy.GitHub("token")
        page = [{"id": number} for number in range(deploy.PAGE_SIZE)]
        with patch.object(api, "get", side_effect=[page, [{"id": 100}]]) as get:
            self.assertEqual(
                [*page, {"id": 100}],
                list(api.pages("path", environment="github-pages")),
            )
        self.assertEqual(2, get.call_count)
        self.assertEqual(2, get.call_args.kwargs["page"])

    def test_invalid_page_or_api_failure_is_not_an_empty_history(self) -> None:
        api = deploy.GitHub("token")
        for result in ({"message": "API failed"}, ["not an object"]):
            with (
                self.subTest(result=result),
                patch.object(api, "get", return_value=result),
                self.assertRaises(ValueError),
            ):
                list(api.pages("path"))
        error = HTTPError("https://api.github.com", 403, "rate limit", {}, None)
        with patch.object(api, "get", side_effect=error), self.assertRaises(HTTPError):
            list(api.pages("path"))

    def test_requests_use_token_timeout_and_encoded_parameters(self) -> None:
        response = io.BytesIO(json.dumps({"sha": "a" * 40}).encode())
        opener = Mock()
        opener.open.return_value = response
        with patch.object(deploy, "build_opener", return_value=opener):
            result = deploy.GitHub("secret").get(
                "repos/owner/repo", environment="github-pages"
            )
        request = opener.open.call_args.args[0]
        self.assertEqual("a" * 40, result["sha"])
        self.assertEqual("Bearer secret", request.get_header("Authorization"))
        self.assertEqual(
            "https://api.github.com/repos/owner/repo?environment=github-pages",
            request.full_url,
        )
        self.assertEqual(30, opener.open.call_args.kwargs["timeout"])

    def test_token_cannot_be_sent_to_insecure_or_redirected_origin(self) -> None:
        for url in (
            "http://api.github.com",
            "https://user:pass@api.github.com",
            "https:///missing",
            "https://api.github.com?x=1",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                deploy.GitHub("secret", url)
        with self.assertRaises(RuntimeError):
            deploy.NoRedirect().redirect_request(
                None, None, 302, "Moved", {}, "https://elsewhere.test"
            )

    def test_deployment_and_status_pagination_find_older_success(self) -> None:
        api = deploy.GitHub("token")
        deployments = [
            {"id": number, "sha": "a" * 40} for number in range(200, 100, -1)
        ]

        def get(path, **parameters):
            page = parameters["page"]
            if path.endswith("/deployments"):
                return deployments if page == 1 else [{"id": 100, "sha": "b" * 40}]
            if path.endswith("/100/statuses"):
                return (
                    [{"state": "inactive"}] * deploy.PAGE_SIZE
                    if page == 1
                    else [{"state": "success"}]
                )
            return [{"state": "failure"}]

        with patch.object(api, "get", side_effect=get):
            self.assertEqual(
                "b" * 40, deploy.last_successful_deployment(api, "owner/repo")
            )

    def test_malformed_deployment_is_rejected(self) -> None:
        api = Mock(spec=deploy.GitHub)
        api.pages.return_value = iter([{"id": "../elsewhere", "sha": "a" * 40}])
        with self.assertRaises(ValueError):
            deploy.last_successful_deployment(api, "owner/repo")
        with self.assertRaises(ValueError):
            deploy.checked_sha("--help")


class PublicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.run_git("init", "--quiet")
        for path in deploy.PUBLICATION_INPUTS:
            self.write(path + "index.html" if path.endswith("/") else path, "initial\n")
        self.base = self.commit()

    def run_git(self, *args: str) -> str:
        return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()

    def write(self, name: str, text: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self) -> str:
        self.run_git("add", ".")
        self.run_git(
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--quiet",
            "-m",
            "fixture",
        )
        return self.run_git("rev-parse", "HEAD")

    def api(self, head: str, deployments: list[tuple[str, list[str]]]) -> Mock:
        api = Mock(spec=deploy.GitHub)
        api.get.return_value = {"sha": head}

        def pages(path, **parameters):
            if path.endswith("/deployments"):
                self.assertEqual("github-pages", parameters["environment"])
                return iter(
                    {"id": index, "sha": sha}
                    for index, (sha, _) in enumerate(deployments, 1)
                )
            index = int(path.split("/")[-2])
            return iter({"state": state} for state in deployments[index - 1][1])

        api.pages.side_effect = pages
        return api

    def decide(self, head: str, deployments=None, **kwargs) -> deploy.Decision:
        api = self.api(
            head, [(self.base, ["success"])] if deployments is None else deployments
        )
        return deploy.publication_decision(
            api, "owner/repo", "main", head, kwargs.get("workflow_sha", head), self.root
        )

    def test_first_publication_runs_and_identical_rerun_skips(self) -> None:
        self.assertTrue(self.decide(self.base, []).changed)
        result = self.decide(self.base)
        self.assertFalse(result.changed)
        self.assertEqual(self.base, result.baseline)

    def test_documentation_only_skips_and_does_not_advance_baseline(self) -> None:
        self.write("docs/guide.md", "first docs change\n")
        first = self.commit()
        self.assertFalse(self.decide(first).changed)
        self.write("docs/guide.md", "second docs change\n")
        result = self.decide(self.commit())
        self.assertFalse(result.changed)
        self.assertEqual(self.base, result.baseline)

    def test_each_publication_input_triggers_deploy(self) -> None:
        previous = self.base
        for path in deploy.PUBLICATION_INPUTS:
            with self.subTest(path=path):
                self.write(
                    path + "index.html" if path.endswith("/") else path, "updated\n"
                )
                head = self.commit()
                self.assertTrue(self.decide(head, [(previous, ["success"])]).changed)
                previous = head

    def test_removing_a_published_file_triggers_deploy(self) -> None:
        (self.root / "web/index.html").unlink()
        self.assertTrue(self.decide(self.commit()).changed)

    def test_docs_after_failed_or_canceled_site_deploy_still_publish_site(self) -> None:
        self.write("web/index.html", "new site\n")
        failed = self.commit()
        self.write("README.md", "documentation after a failed deployment\n")
        head = self.commit()
        for states in (["failure"], ["error"], ["queued"], []):
            with self.subTest(states=states):
                result = self.decide(
                    head, [(failed, states), (self.base, ["inactive", "success"])]
                )
                self.assertTrue(result.changed)
                self.assertEqual(self.base, result.baseline)

    def test_old_verify_rerun_cannot_rollback_new_main(self) -> None:
        api = self.api("b" * 40, [])
        result = deploy.publication_decision(
            api, "owner/repo", "main", self.base, self.base, self.root
        )
        self.assertFalse(result.changed)
        api.pages.assert_not_called()

    def test_workflow_sha_must_describe_the_verified_artifact(self) -> None:
        self.assertFalse(self.decide(self.base, workflow_sha="b" * 40).changed)

    def test_checkout_and_repository_must_be_valid(self) -> None:
        api = self.api(self.base, [])
        with self.assertRaises(ValueError):
            deploy.publication_decision(
                api, "owner/repo", "main", "b" * 40, "b" * 40, self.root
            )
        with self.assertRaises(ValueError):
            deploy.publication_decision(
                api, "../repo", "main", self.base, self.base, self.root
            )

    def test_non_ancestor_deployment_fails_instead_of_rolling_back(self) -> None:
        self.write("web/index.html", "newer deployed site\n")
        newer = self.commit()
        self.run_git("checkout", "--quiet", self.base)
        with self.assertRaisesRegex(ValueError, "refusing a rollback"):
            self.decide(self.base, [(newer, ["success"])])

    def test_api_failure_does_not_publish_or_skip_successfully(self) -> None:
        api = self.api(self.base, [])
        api.pages.side_effect = RuntimeError("API unavailable")
        with self.assertRaisesRegex(RuntimeError, "API unavailable"):
            deploy.publication_decision(
                api, "owner/repo", "main", self.base, self.base, self.root
            )

    def test_git_comparison_failure_is_not_a_site_change(self) -> None:
        original = deploy.git

        def git(*args, **kwargs):
            if args[0] == "diff":
                return subprocess.CompletedProcess(args, 128)
            return original(*args, **kwargs)

        with (
            patch.object(deploy, "git", side_effect=git),
            self.assertRaises(RuntimeError),
        ):
            self.decide(self.base)

    def test_command_writes_boolean_output(self) -> None:
        output = self.root / "output"
        environment = {
            "GITHUB_TOKEN": "token",
            "GITHUB_REPOSITORY": "owner/repo",
            "DEFAULT_BRANCH": "main",
            "VERIFIED_SHA": self.base,
            "GITHUB_SHA": self.base,
            "GITHUB_OUTPUT": str(output),
        }
        with (
            patch.dict(os.environ, environment),
            patch.object(deploy.Path, "cwd", return_value=self.root),
            patch.object(deploy, "GitHub", return_value=self.api(self.base, [])),
        ):
            deploy.main()
        self.assertIn("changed=true\n", output.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
