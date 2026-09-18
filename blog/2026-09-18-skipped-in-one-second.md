---
title: Skipped in one second
date: 2026-09-18 19:38
summary: A pre-commit hook meant to keep humans off main froze this site for three and a half hours. No deploy failed — every one succeeded in a second, which was exactly the problem.
author: DeepSeek v4 Flash
---

## The one-second deploy

Run 35379104510 started at 18:15:21 and finished at 18:15:22. One second, and done. A deploy that short is either the best deploy this project has ever shipped or the most dangerous kind of failure there is — the kind that completes successfully.

It was the latter. For three hours and twenty-six minutes on 2026-09-18, between 14:58 and 18:24, the published site of this catalog served stale data while a stream of deploy runs "succeeded" in about a second each. Nothing failed. Nothing alarmed. Nothing even errored. The jobs ran, the checkmarks were green, the workflows showed `completed` with `success` in every field that pings a dashboard. The site just... didn't change. Nobody knew, because the entire incident read as normal operation.

This is the story of how a guard meant to protect `main` silently froze the site, and how the fix was one environment variable.

## The bouncer at the gate

On 2026-09-18 at 15:08, this repository merged a commit that added a full pre-commit gate to the project: 37 hooks spanning whitespace hygiene, gitleaks secret scanning, ruff and bandit, codespell, yamllint, markdownlint, htmlhint, zizmor's GitHub Actions audit, eslint complexity caps, a 50-point complexity ratchet, catalog validation, 632 unit tests, generated-file freshness checks, and browser end-to-end tests. The whole gate runs as exactly one command in CI: `pre-commit run --all-files`.

Among those 37 hooks sits a bouncer: `no-commit-to-branch`, configured with `args: [-b, main]`. Its job is to refuse any commit made while the current branch is `main`. The config even comments, honestly, that branch protection requires pull requests anyway — this hook is belt-and-suspenders for the local developer who might type a commit on the wrong branch.

Here is the quiet flaw. The CI workflow runs on every push to `main`. A push to `main` checks the repository out *on `main`*. The bouncer looks at the current branch, sees `main`, and throws the entire verification run out the door with exit code 1. Every push-triggered verification from that moment onward failed — seven of them, 15:08 through 18:11, every single one.

The site stayed up the whole time. That's the part that makes this incident invisible.

## Skipped is a kind of success

The deploy workflow is deliberately conservative: it deploys only after the exact `main` revision passes the complete verify workflow, and it has no manual trigger. The trigger is a `workflow_run` event — deploy fires when verify *completes*, then a job-level `if` demands four things at once: the event was a `workflow_run`, its originating event was a `push`, its conclusion was `success`, and the branch was the default branch.

All four conditions failed as a unit, because the input was poisoned: the verify run was there, completed, and *failed*. So the deploy job took the only honest action available to a job whose `if` is false: it got skipped. GitHub rendered that as a completed run in about a second. `skipped`, not `failure`. No red X, no page, no notification policy that fires on skip.

That is the whole trick. Outages that fail loudly get pages; outages that skip get nothing. A deploy that completes in one second is indistinguishable, from the outside, from a deploy that had nothing to do. The workflow ran. The checkmarks were green. The site simply never changed, and there was no path that would have changed it: the only way to redeploy was to push to `main` again, and pushing to `main` again produced another failed verify, and another skipped deploy, forever. The machine had deadlocked itself: to deploy you must pass verification; to pass verification you must not be on `main`; and you can only deploy from `main`.

## The fix that was always one line

The fix, once a human actually looked at the run list, was embarrassingly small. The bouncer exists to keep *humans* off `main`; branch protection is the real guard, and it was already on. So CI now runs the gate with `SKIP: no-commit-to-branch`, one environment variable on one step, with a comment that reads like a scar: "a push-triggered run on main always sits on main, so the hook would fail every post-merge verification."

The hook stays in the config, still guarding local commits, still doing its one job. It just no longer runs where its job doesn't exist.

The lesson isn't "don't add hooks." It's that a guard's scope is part of its correctness. A check that is true for humans and false for machines needs to know which one it's talking to. Ours didn't, and the cost was a site that silently went stale for three and a half hours on a day when the catalog was publishing new work every hour.

## The catalog has been thinking about trust this whole time

None of this is out of character for the project. Its operating principle is that trust must be earned record by record, and that automation may prepare evidence but never conclude. The model ingestion pipeline pulls its source corpus from models.dev — 395 records of machine-written text, every one published with an explicit `unreviewed` label that survives all the way to the web payloads. The importer fails closed: wrong host, over an 8 MiB archive, fewer than 100 or more than 20,000 records, or more than 20% of records dropping — any of those aborts the sync. And promotion of a model from that text-output queue to a reviewed record is a guarded three-step ritual that automation may start but never finish: license, evidence, scores, and `verified_at` are human-owned fields, and no script touches them.

The same instinct caught this incident, in the end. Nothing in the CI system was designed to notice a one-second skip, so the detection came from a person reading a list of runs and asking why six deploys in a row had done nothing. The catalog's core belief — that a label like `unreviewed` or `skipped` is information, not a verdict — is what made the fix look obvious once the question was asked.

## What else was publishing that day

The hours the site was frozen happened to be the hours the catalog was at its most alive. The thirty-first models.dev queue batch landed, then a local runtime record for exo, then a record for Paper2Agent — a Stanford framework, published in *Nature* the day before, that reads an AI-systems paper and its codebase and converts them into a verified MCP server any agent can query. A system that turns papers into queryable systems, added to a catalog that just drafted its first proposal for a papers collection — ADR 033, the first ADR in the repository ever merged in `Proposed` status, its boundary decision politely left open for later.

There is a pleasing recursion in a catalog documenting a tool that documents papers, and a certain justice in the fact that the day's most interesting technical story wasn't any of the curated records. It was the one-second run in the deploy list.

The dangerous kind of success is the one that completes in a second. The quietest outage is the one whose checkmarks are all green. The machine cannot see either of those; only a human looking at a run list can — which is, not coincidentally, the exact reason this catalog keeps a human in the loop everywhere else, too.

---

This post was written by DeepSeek v4 Flash, directed by the repository's editor. The incident it describes is a catalog record of operational history, not a scored entry; the run numbers, timestamps, and hook configuration it cites are pinned in the repository's history.
