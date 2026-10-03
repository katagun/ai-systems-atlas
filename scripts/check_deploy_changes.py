"""Publish changed site inputs after verification, using the real deployment baseline.

Runs with the hosted runner's standard-library Python; publishing installs no project
dependencies. Skipped workflow runs never advance the baseline. GitHub retains the
success status when an older deployment becomes inactive, so inspect status history
instead of treating only currently active deployments as successful publications.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PUBLICATION_INPUTS = (
    "web/",
    "scripts/build_asset_version.mjs",
    "scripts/check_deploy_changes.py",
    ".github/workflows/deploy-pages.yml",
)
PAGE_SIZE = 100


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError(
            "GitHub API unexpectedly redirected; refusing to forward token"
        )


class GitHub:
    def __init__(self, token: str, api_url: str = "https://api.github.com") -> None:
        parsed = urlsplit(api_url)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username
            or parsed.query
        ):
            raise ValueError("GitHub API must use an HTTPS origin without credentials")
        self.api_url = api_url.rstrip("/")
        self.token = token

    def get(self, path: str, **parameters):
        url = f"{self.api_url}/{path.lstrip('/')}"
        if parameters:
            url += "?" + urlencode(parameters)
        request = Request(
            url,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        # Only the HTTPS GitHub API origin above is used; redirects cannot leak the token.
        with build_opener(NoRedirect).open(request, timeout=30) as response:  # nosec B310
            return json.load(response)

    def pages(self, path: str, **parameters) -> Iterator[dict]:
        page = 1
        while True:
            rows = self.get(path, per_page=PAGE_SIZE, page=page, **parameters)
            if not isinstance(rows, list) or any(
                not isinstance(row, dict) for row in rows
            ):
                raise ValueError("Expected a list of GitHub API objects")
            yield from rows
            if len(rows) < PAGE_SIZE:
                return
            page += 1


def checked_sha(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Expected a complete Git commit SHA")
    return value


def last_successful_deployment(api: GitHub, repository: str) -> str | None:
    # GitHub returns newest deployments first. A failed newer deployment does not
    # replace the successful site, and an inactive status does not erase its success.
    for deployment in api.pages(
        f"repos/{repository}/deployments", environment="github-pages"
    ):
        deployment_id = deployment["id"]
        if not isinstance(deployment_id, int) or deployment_id <= 0:
            raise ValueError("Invalid deployment ID")
        statuses = api.pages(f"repos/{repository}/deployments/{deployment_id}/statuses")
        if any(status["state"] == "success" for status in statuses):
            return checked_sha(deployment["sha"])
    return None


def git(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=check, capture_output=True, text=True
    )


@dataclass(frozen=True)
class Decision:
    changed: bool
    reason: str
    baseline: str | None = None


def publication_decision(
    api: GitHub,
    repository: str,
    branch: str,
    verified_sha: str,
    workflow_sha: str,
    cwd: Path,
) -> Decision:
    if not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*", repository
    ):
        raise ValueError("Expected owner/repository")
    verified_sha = checked_sha(verified_sha)
    workflow_sha = checked_sha(workflow_sha)
    if git("rev-parse", "HEAD", cwd=cwd).stdout.strip() != verified_sha:
        raise ValueError("Checkout does not match the verified commit")
    # workflow_run's GITHUB_SHA can be newer than head_sha. Environment deployments
    # record GITHUB_SHA, so publish only when that record describes our exact artifact.
    if workflow_sha != verified_sha:
        return Decision(False, "a newer revision started this deployment workflow")
    current = api.get(f"repos/{repository}/commits/{quote(branch, safe='')}")
    if checked_sha(current["sha"]) != verified_sha:
        return Decision(False, "verified revision is no longer the default-branch head")
    baseline = last_successful_deployment(api, repository)
    if baseline is None:
        return Decision(True, "no successful Pages deployment exists")
    ancestry = git(
        "merge-base", "--is-ancestor", baseline, verified_sha, cwd=cwd, check=False
    )
    if ancestry.returncode != 0:
        raise ValueError(
            "Deployed commit is not an ancestor of verified HEAD; refusing a rollback"
        )
    comparison = git(
        "diff",
        "--quiet",
        "--no-ext-diff",
        "--no-textconv",
        baseline,
        verified_sha,
        "--",
        *PUBLICATION_INPUTS,
        cwd=cwd,
        check=False,
    )
    if comparison.returncode not in (0, 1):
        raise RuntimeError(
            "Could not compare publication inputs with the deployed commit"
        )
    if comparison.returncode:
        return Decision(
            True, "publication inputs changed since the last deployment", baseline
        )
    return Decision(
        False, "publication inputs match the last successful deployment", baseline
    )


def main() -> None:
    api = GitHub(
        os.environ["GITHUB_TOKEN"],
        os.environ.get("GITHUB_API_URL", "https://api.github.com"),
    )
    decision = publication_decision(
        api,
        os.environ["GITHUB_REPOSITORY"],
        os.environ["DEFAULT_BRANCH"],
        os.environ["VERIFIED_SHA"],
        os.environ["GITHUB_SHA"],
        Path.cwd(),
    )
    print(f"Pages publication: {decision.reason}")
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"changed={str(decision.changed).lower()}\n")
        output.write(f"baseline={decision.baseline or ''}\n")


if __name__ == "__main__":
    main()
