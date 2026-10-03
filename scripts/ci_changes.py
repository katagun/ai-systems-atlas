"""Select CI work from a complete diff, including unverified pushes on main.

The small content contracts, catalog validation, Node tests and freshness checks
always run. Only the full Python regression/coverage suite and whole-tree lint
are conditional. Unknown inputs choose the complete gate.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHA = re.compile(r"[0-9a-f]{40}\Z")
TOOL_CONFIG = {
    "pyproject.toml",
    "uv.lock",
    ".python-version",
    "package.json",
    "package-lock.json",
    ".pre-commit-config.yaml",
    ".gitleaks.toml",
    ".markdownlint-cli2.jsonc",
    ".yamllint.yml",
    ".htmlhintrc",
    "eslint.config.mjs",
    "stylelint.config.mjs",
    "playwright.config.js",
}


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=check
    )


def commit(ref: str) -> str:
    value = git("rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}")
    sha = value.stdout.strip()
    if not SHA.fullmatch(sha):
        raise ValueError("git did not resolve a commit SHA")
    return sha


def changed_files(base: str, head: str, *, existing_only: bool = False) -> list[str]:
    args = ["diff", "--name-only", "--no-renames", "-z"]
    if existing_only:
        args.append("--diff-filter=ACMT")
    # --no-renames includes both paths of a move when classifying dependencies.
    output = git(*args, base, head, "--").stdout
    return output.rstrip("\0").split("\0") if output else []


def classify(paths: list[str]) -> tuple[bool, bool]:
    python_tests = False
    for path in paths:
        if path in TOOL_CONFIG or path.startswith(".github/"):
            return True, True
        if path.endswith((".py", ".pyi")):
            python_tests = True
            continue
        # These are content or JavaScript inputs. Their checkout contracts still
        # run even when the expensive Python regression tests are unnecessary.
        if path.startswith(("docs/", "directory/", "web/", "blog/", "skills/")):
            continue
        if path.endswith(".md"):
            continue
        if path.startswith(("scripts/", "tests/")) and path.endswith((".js", ".mjs")):
            continue
        return True, True
    return python_tests, False


def api_workflow_runs(repository: str, branch: str, page: int) -> list[dict]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("GITHUB_REPOSITORY must be owner/repository")
    query = urllib.parse.urlencode(
        {
            "branch": branch,
            "event": "push",
            "status": "success",
            "per_page": 100,
            "page": page,
        }
    )
    url = f"https://api.github.com/repos/{repository}/actions/workflows/verify.yml/runs?{query}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token := os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    # The URL has a fixed HTTPS API origin and a validated repository path.
    with urllib.request.urlopen(request, timeout=30) as response:  # nosec B310
        result = json.load(response)
    return result["workflow_runs"]


def last_verified_commit(
    repository: str, branch: str, head: str, run_id: str
) -> str | None:
    for page in range(1, 11):
        runs = api_workflow_runs(repository, branch, page)
        for run in runs:
            if (
                str(run["id"]) == run_id
                or run["event"] != "push"
                or run["conclusion"] != "success"
                or run["head_branch"] != branch
            ):
                continue
            sha = run["head_sha"]
            if (
                SHA.fullmatch(sha)
                and git(
                    "merge-base", "--is-ancestor", sha, head, check=False
                ).returncode
                == 0
            ):
                return sha
        if len(runs) < 100:
            break
    # A missing/old baseline means a full run, never a guess using event.before.
    return None


@dataclass(frozen=True)
class Plan:
    base: str | None
    head: str
    python_tests: bool
    lint_all: bool
    full_history: bool
    reason: str

    def outputs(self) -> dict[str, str]:
        return {
            "base": self.base or "",
            "head": self.head,
            "python_tests": str(self.python_tests).lower(),
            "lint_all": str(self.lint_all).lower(),
            "full_history": str(self.full_history).lower(),
        }


def make_plan(base: str | None, head: str, reason: str) -> Plan:
    if base is None:
        return Plan(None, head, True, True, True, reason)
    paths = changed_files(base, head)
    python_tests, lint_all = classify(paths)
    # New scanner rules must also be checked against existing history.
    full_history = any(
        path in {".gitleaks.toml", ".pre-commit-config.yaml", "scripts/scan_secrets.py"}
        for path in paths
    )
    return Plan(base, head, python_tests, lint_all, full_history, reason)


def event_plan(event: dict, event_name: str, head: str) -> Plan:
    if event_name == "pull_request":
        try:
            pull = event["pull_request"]
            base = git(
                "merge-base", commit(pull["base"]["sha"]), commit(pull["head"]["sha"])
            ).stdout.strip()
        except (subprocess.CalledProcessError, KeyError, ValueError):
            return make_plan(
                None, head, "pull request baseline unavailable: full verification"
            )
        return make_plan(
            base, head, "pull request merge-base through the tested merge commit"
        )
    if event_name == "push":
        repository = event["repository"]["full_name"]
        branch = event["repository"]["default_branch"]
        if event.get("ref") != f"refs/heads/{branch}":
            return make_plan(None, head, "non-default-branch push: full verification")
        try:
            base = last_verified_commit(
                repository, branch, head, os.environ.get("GITHUB_RUN_ID", "")
            )
        except (urllib.error.URLError, ValueError, KeyError, TypeError, TimeoutError):
            return make_plan(
                None, head, "verification baseline unavailable: full verification"
            )
        return make_plan(
            base,
            head,
            "changes since the last successful main verification"
            if base
            else "no successful ancestor: full verification",
        )
    return make_plan(
        None, head, "scheduled, manual or unknown event: full verification"
    )


def run_lint(base: str | None, head: str, lint_all: bool) -> int:
    command = ["pre-commit", "run", "--show-diff-on-failure"]
    if lint_all or base is None:
        command.append("--all-files")
    else:
        paths = changed_files(base, head, existing_only=True)
        command.extend(["--files", *(f"./{path}" for path in paths)])
    env = os.environ.copy()
    env["SKIP"] = ",".join(
        filter(None, [env.get("SKIP"), "no-commit-to-branch", "gitleaks"])
    )
    return subprocess.run(command, cwd=ROOT, env=env, check=False).returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "lint"))
    parser.add_argument("--base", default=os.environ.get("ATLAS_CI_BASE") or None)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--all", action="store_true", dest="all_files")
    args = parser.parse_args(argv)
    head = commit(args.head)
    base = commit(args.base) if args.base else None
    if args.command == "lint":
        return run_lint(
            base, head, args.all_files or os.environ.get("ATLAS_CI_LINT_ALL") == "true"
        )
    if args.all_files or base:
        plan = make_plan(
            None if args.all_files else base, head, "explicit local comparison"
        )
    else:
        event_path = os.environ.get("GITHUB_EVENT_PATH")
        event = json.loads(Path(event_path).read_text()) if event_path else {}
        plan = event_plan(event, os.environ.get("GITHUB_EVENT_NAME", ""), head)
    print(plan.reason)
    print(json.dumps(plan.outputs(), indent=2))
    if output := os.environ.get("GITHUB_OUTPUT"):
        with Path(output).open("a", encoding="utf-8") as stream:
            for key, value in plan.outputs().items():
                stream.write(f"{key}={value}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
