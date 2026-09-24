#!/usr/bin/env python3
"""Run the weekly directory refresh locally instead of in GitHub Actions.

This reproduces `.github/workflows/update-directory.yml` (retired alongside this
script) on the maintainer's own machine: it runs the same six generation steps, the
same twelve verification checks, stages the same explicit path list, and commits on
the same `automation/directory-refresh` branch. It adds one generation step the
workflow never had, the OpenRouter cross-check (ADR 039). A pull request opened with
`GITHUB_TOKEN` never triggers the required `verify` check, so the workflow could never
reach a mergeable state without an extra repository secret. Running here instead means
the pull request is opened with the maintainer's own `gh` credentials, so `verify` runs
on it like any other pull request — no repository secret is needed anywhere. See
`docs/OPERATIONS.md`, "Metadata refresh" and "Scheduled workflow", and the
attention-source sweep (`scripts/run_hn_signals.py`) this follows the pattern of.

The refresh involves no judgment, so scheduling it is a job for launchd
(see "Scheduled workflow" in `docs/OPERATIONS.md`), not an unattended model.

Usage:
    uv run python scripts/run_directory_refresh.py            # generate, verify, commit locally
    uv run python scripts/run_directory_refresh.py --publish   # also push and open/update the PR
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REFRESH_BRANCH = "automation/directory-refresh"
DEFAULT_BRANCH = "main"

# Mirrors the workflow's two explicit `git add directory/...` staging lists (kept
# identical there because GitHub Actions steps share no shell state). An unqualified
# `git add -A directory` once swept the daily attention-source queue into this weekly
# branch, so the list stays explicit and excludes `directory/hn-signals.json` on
# purpose. tests/test_documentation.py checks this list against the files actually on
# disk, so a new catalog file cannot be silently left out of every refresh.
STAGED_DIRECTORY_FILES = (
    "directory/projects.json",
    "directory/candidates.json",
    "directory/exclusions.json",
    "directory/discovery-sources.json",
    "directory/license-evidence.json",
    "directory/license-review.json",
    "directory/models.json",
    "directory/models-dev.json",
    "directory/model-candidates.json",
    "directory/model-dispositions.json",
    "directory/openrouter-model-leads.json",
    "directory/openrouter-model-dispositions.json",
    "directory/inference-services.json",
    "directory/local-runtimes.json",
    "directory/specifications.json",
    "directory/packs.json",
    "directory/taxonomy.json",
)

OPENROUTER_STEP = "refresh OpenRouter model leads"
# Steps whose failure is reported instead of stopping the run. The OpenRouter importer
# writes only unpublished leads and replaces them only on success, so an outage there
# must not throw away a week of GitHub and models.dev reads, or hold back the models.dev
# snapshot that the later steps publish. Verification is reported rather than fatal for
# the same reason.
REPORTED_STEPS = frozenset({OPENROUTER_STEP})

# name, command, whether it reads GITHUB_TOKEN. Order matches the workflow, with the
# OpenRouter cross-check (ADR 039) after the models.dev import so it matches against the
# fresh snapshot; a failure stops the run there, just as a failed step would stop the job.
GENERATION_STEPS = (
    (
        "refresh GitHub metadata and discover candidates",
        ("uv", "run", "python", "scripts/update_directory.py"),
        True,
    ),
    (
        "refresh models.dev source and candidate metadata",
        ("uv", "run", "python", "scripts/import_models_dev.py"),
        True,
    ),
    (
        OPENROUTER_STEP,
        ("uv", "run", "python", "scripts/import_openrouter.py"),
        False,
    ),
    (
        "synchronize published data after models.dev refresh",
        ("uv", "run", "python", "scripts/sync_web_data.py"),
        False,
    ),
    (
        "regenerate app payloads",
        ("uv", "run", "python", "scripts/build_web_payload.py"),
        False,
    ),
    (
        "regenerate share pages",
        ("uv", "run", "python", "scripts/build_share_pages.py"),
        False,
    ),
    ("regenerate asset versions", ("node", "scripts/build_asset_version.mjs"), False),
)

# name, command, whether it reads GITHUB_TOKEN. Every one of these runs even after an
# earlier check fails, matching the workflow's `check()` helper; the "generated diff
# whitespace" check is not a fixed command (it stages first) and is appended by
# run_checks() below, for twelve checks total.
CHECK_COMMANDS = (
    (
        "validate_directory",
        ("uv", "run", "python", "scripts/validate_directory.py"),
        False,
    ),
    (
        "unittest",
        ("uv", "run", "python", "-m", "unittest", "discover", "-s", "tests", "-v"),
        False,
    ),
    (
        "compileall",
        ("uv", "run", "python", "-m", "compileall", "scripts", "tests"),
        False,
    ),
    (
        "evidence links and terms drift",
        ("uv", "run", "python", "scripts/check_evidence_links.py"),
        True,
    ),
    (
        "share page freshness",
        ("uv", "run", "python", "scripts/build_share_pages.py", "--check"),
        False,
    ),
    (
        "app payload freshness",
        ("uv", "run", "python", "scripts/build_web_payload.py", "--check"),
        False,
    ),
    ("asset versions", ("node", "scripts/build_asset_version.mjs", "--check"), False),
    ("app-core.js syntax", ("node", "--check", "web/app-core.js"), False),
    ("app.js syntax", ("node", "--check", "web/app.js"), False),
    ("web behavior tests", ("node", "--test", "tests/test_web.js"), False),
    ("logo coverage", ("node", "scripts/build_logos.mjs", "--check"), False),
)


def shell(
    command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None
) -> tuple[int, str]:
    """Run a command, capturing combined output. `env` is overlaid on the current one.

    Never logs `env`: it is the one place a caller may pass GITHUB_TOKEN, and the
    token must never reach printed output.
    """
    merged_env = dict(os.environ)
    if env:
        merged_env.update(env)
    finished = subprocess.run(
        command, cwd=cwd, env=merged_env, capture_output=True, text=True
    )
    return finished.returncode, finished.stdout + finished.stderr


def preflight(run=shell) -> str | None:
    """None when the tree is clean and HEAD matches a freshly fetched origin/main.

    A refresh must be generated from current main, not from a stale or locally
    modified checkout: otherwise it could stage a diff against the wrong baseline, or
    quietly re-propose work already on main.
    """
    status_code, porcelain = run(["git", "status", "--porcelain"], ROOT)
    if status_code != 0:
        return f"could not read git status:\n{porcelain}"
    if porcelain.strip():
        return "refusing to run on a dirty working tree"
    fetch_code, fetch_output = run(
        ["git", "fetch", "--quiet", "origin", DEFAULT_BRANCH], ROOT
    )
    if fetch_code != 0:
        return f"git fetch origin {DEFAULT_BRANCH} failed:\n{fetch_output}"
    head_code, head = run(["git", "rev-parse", "HEAD"], ROOT)
    origin_code, origin_head = run(
        ["git", "rev-parse", f"origin/{DEFAULT_BRANCH}"], ROOT
    )
    if head_code != 0 or origin_code != 0:
        return "could not resolve HEAD or origin/main"
    if head.strip() != origin_head.strip():
        return (
            f"HEAD ({head.strip()[:12]}) does not match a freshly fetched "
            f"origin/{DEFAULT_BRANCH} ({origin_head.strip()[:12]}); check out current main first"
        )
    return None


def github_token(run=shell) -> str | None:
    """The maintainer's own token from `gh auth token`, or None with a warning.

    No repository secret is involved anywhere in this runner: the token, when
    present, is the maintainer's own GitHub CLI login.
    """
    code, output = run(["gh", "auth", "token"], ROOT)
    if code != 0:
        print(
            "warning: `gh auth token` failed; continuing without GITHUB_TOKEN "
            "(GitHub rate limits may bite)",
            file=sys.stderr,
        )
        return None
    token = output.strip()
    return token or None


def token_env(needs_token: bool, token: str | None) -> dict[str, str] | None:
    return {"GITHUB_TOKEN": token} if needs_token and token else None


def run_generation_steps(
    run, token: str | None
) -> tuple[bool, list[tuple[str, int, str]]]:
    """Run the seven generation steps in order. Stop at the first failure, except in
    REPORTED_STEPS, whose failure is only reported."""
    results: list[tuple[str, int, str]] = []
    for name, command, needs_token in GENERATION_STEPS:
        print(f"== {name} ==")
        code, output = run(list(command), ROOT, token_env(needs_token, token))
        print(output)
        results.append((name, code, output))
        if code != 0 and name in REPORTED_STEPS:
            print(
                f"warning: {name!r} failed; its files are unchanged and the run continues",
                file=sys.stderr,
            )
        elif code != 0:
            print(f"error: {name!r} failed", file=sys.stderr)
            return False, results
    return True, results


def reported_step_failed(generation_results: list[tuple[str, int, str]]) -> bool:
    return any(
        code != 0
        for name, code, _output in generation_results
        if name in REPORTED_STEPS
    )


def stage_directory_files(run) -> tuple[int, str]:
    """Stage the same explicit path list the workflow staged. Never `git add -A directory`."""
    web_code, web_output = run(["git", "add", "-A", "web"], ROOT)
    directory_code, directory_output = run(
        ["git", "add", *STAGED_DIRECTORY_FILES], ROOT
    )
    return (web_code or directory_code), web_output + directory_output


def run_checks(run, token: str | None) -> list[tuple[str, bool, str]]:
    """Run all twelve verification checks. Every one runs even after an earlier fails."""
    results: list[tuple[str, bool, str]] = []
    for name, command, needs_token in CHECK_COMMANDS:
        code, output = run(list(command), ROOT, token_env(needs_token, token))
        results.append((name, code == 0, output))
    stage_code, stage_output = stage_directory_files(run)
    diff_code, diff_output = run(["git", "diff", "--cached", "--check"], ROOT)
    whitespace_ok = stage_code == 0 and diff_code == 0
    results.append(
        ("generated diff whitespace", whitespace_ok, stage_output + diff_output)
    )
    return results


def link_pending_lines(results: list[tuple[str, bool, str]]) -> list[str]:
    """Every `link pending:` line any check printed, deduplicated in first-seen order.

    `validate_directory` prints one such line per reviewed model that models.dev now
    lists (ADR 038); without this, the line has no reader outside a raw terminal.
    """
    seen: set[str] = set()
    lines: list[str] = []
    for _name, _ok, output in results:
        for line in output.splitlines():
            if line.startswith("link pending:") and line not in seen:
                seen.add(line)
                lines.append(line)
    return lines


# The importer's own report lines: what it staged, why it skipped or failed, what to prune.
OPENROUTER_REPORT_PREFIXES = (
    "staged ",
    "OpenRouter import skipped",
    "OpenRouter import failed",
    "prunable OpenRouter disposition:",
)


def openrouter_report(generation_results: list[tuple[str, int, str]]) -> list[str]:
    """The OpenRouter importer's summary, so the pull request says what it staged, why
    it made no request, or why it failed (ADR 039); a skipped import is otherwise silent."""
    for name, _code, output in generation_results:
        if name == OPENROUTER_STEP:
            return [
                line.strip()
                for line in output.splitlines()
                if line.strip().startswith(OPENROUTER_REPORT_PREFIXES)
            ]
    return []


def print_check_summary(results: list[tuple[str, bool, str]]) -> None:
    print("== Verification results ==")
    for name, ok, _output in results:
        print(f"- {name}: {'passed' if ok else 'FAILED'}")
    pending = link_pending_lines(results)
    if pending:
        print("== Models awaiting a models.dev link ==")
        for line in pending:
            print(line)


def has_staged_changes(run) -> bool:
    code, _output = run(["git", "diff", "--cached", "--quiet"], ROOT)
    return code != 0


def commit_refresh(run) -> tuple[int, str]:
    """Commit the staged refresh on automation/directory-refresh, using the caller's
    own git identity (never github-actions[bot])."""
    branch_code, branch_output = run(["git", "checkout", "-B", REFRESH_BRANCH], ROOT)
    if branch_code != 0:
        return branch_code, branch_output
    return run(["git", "commit", "-m", "chore(directory): local weekly refresh"], ROOT)


def build_pr_body(
    results: list[tuple[str, bool, str]], openrouter: list[str] | None = None
) -> str:
    lines = ["Local metadata refresh and candidate discovery.", ""]
    lines.append("## Verification")
    lines.append("")
    for name, ok, _output in results:
        lines.append(f"- `{name}`: {'passed' if ok else '**failed**'}")
    lines.append("")
    pending = link_pending_lines(results)
    if pending:
        lines.append("## Models awaiting a models.dev link")
        lines.append("")
        lines.extend(f"- {line}" for line in pending)
        lines.append("")
        lines.append(
            "models.dev now lists these reviewed releases; run the `link` command "
            "in docs/MODELS.md."
        )
        lines.append("")
    if openrouter:
        lines.append("## OpenRouter model leads")
        lines.append("")
        lines.extend(f"- {line}" for line in openrouter)
        lines.append("")
        lines.append(
            "Leads are unpublished pointers, never evidence; triage them under "
            "docs/MODELS.md."
        )
        lines.append("")
    lines.append("Review license incidents and candidate additions before merging.")
    return "\n".join(lines)


def push_and_open_pr(
    run, results: list[tuple[str, bool, str]], openrouter: list[str] | None = None
) -> int:
    """Force-with-lease push the refresh branch, then open or update its pull request.

    Opened with the maintainer's own `gh` credentials, so `verify` — the required
    check branch protection enforces on main — actually runs on it.
    """
    push_code, push_output = run(
        [
            "git",
            "push",
            "--force-with-lease",
            "origin",
            f"HEAD:refs/heads/{REFRESH_BRANCH}",
        ],
        ROOT,
    )
    if push_code != 0:
        print(f"error: push failed\n{push_output}", file=sys.stderr)
        return push_code

    any_failed = any(not ok for _name, ok, _output in results)
    title = "chore(directory): local weekly refresh"
    if any_failed:
        title += " (verification failed)"
    body = build_pr_body(results, openrouter)

    list_code, list_output = run(
        [
            "gh",
            "pr",
            "list",
            "--head",
            REFRESH_BRANCH,
            "--state",
            "open",
            "--json",
            "number",
            "--jq",
            ".[0].number // empty",
        ],
        ROOT,
    )
    number = list_output.strip() if list_code == 0 else ""

    if not number:
        command = [
            "gh",
            "pr",
            "create",
            "--base",
            DEFAULT_BRANCH,
            "--head",
            REFRESH_BRANCH,
            "--title",
            title,
            "--body",
            body,
        ]
        if any_failed:
            command.append("--draft")
        code, output = run(command, ROOT)
    else:
        code, output = run(
            ["gh", "pr", "edit", number, "--title", title, "--body", body], ROOT
        )
    if code != 0:
        print(
            f"error: opening or updating the pull request failed\n{output}",
            file=sys.stderr,
        )
    return code


def main(argv: list[str] | None = None, *, run=shell) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="push automation/directory-refresh and open or update its pull request",
    )
    args = parser.parse_args(argv)

    error = preflight(run)
    if error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    token = github_token(run)

    generated_ok, generation_results = run_generation_steps(run, token)
    if not generated_ok:
        return 1

    check_results = run_checks(run, token)
    print_check_summary(check_results)
    any_check_failed = any(not ok for _name, ok, _output in check_results)

    openrouter_failed = reported_step_failed(generation_results)
    stage_directory_files(run)
    if not has_staged_changes(run):
        print("no directory changes; nothing to commit")
        return 1 if openrouter_failed else 0

    commit_code, commit_output = commit_refresh(run)
    if commit_code != 0:
        print(f"error: commit failed\n{commit_output}", file=sys.stderr)
        return 1

    _sha_code, sha = run(["git", "rev-parse", "--short", "HEAD"], ROOT)
    print(f"committed {sha.strip()} on {REFRESH_BRANCH}")

    publish_failed = False
    if args.publish:
        publish_failed = (
            push_and_open_pr(run, check_results, openrouter_report(generation_results))
            != 0
        )
    else:
        print(f"to publish: uv run python {Path(__file__).name} --publish")
        print(
            f"(pushes {REFRESH_BRANCH} with --force-with-lease and opens or updates its "
            "pull request with gh)"
        )

    return 1 if (any_check_failed or publish_failed or openrouter_failed) else 0


if __name__ == "__main__":
    raise SystemExit(main())
