"""Re-fetch each signal's vendor page and check it against the committed digest.

--refresh writes the bundle the routine reads, checking every readable signal broadly.
--recheck verifies without writing, and scopes to only the signals whose `assessment`
this run added or changed (see `assessed_story_ids`) — a drifted page nobody assessed
carries no citation this run is staking anything on, so its drift cannot fail the run.
Claude never fetches: this deterministic script does, exactly as prepare/finish do
for the candidate-triage routine.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from .build_candidate_evidence import fetch_web_text
    from .sweep_hackernews import content_hash, extract_visible_text
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_candidate_evidence import fetch_web_text
    from sweep_hackernews import content_hash, extract_visible_text

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
BUNDLE_DIR = ROOT / ".hn-signal-bundle"
QUEUE_REPO_PATH = "directory/hn-signals.json"
DEFAULT_BASE_REF = "origin/main"

# Measured against a real 39-page bundle (568,518 chars / ~142,000 tokens uncapped,
# largest page 91,401 chars, one Apple page 52,890 chars of mostly navigation chrome).
# Distinct AI-relevant terms retained out of 56 present uncapped, by per-page cap:
#   2,000 chars  -> ~19,000 tokens  -> 19/56 terms
#   4,000 chars  -> ~37,000 tokens  -> 25/56 terms
#   8,000 chars  -> ~63,000 tokens  -> 40/56 terms   <- chosen
#   uncapped     -> ~142,000 tokens -> 56/56 terms
# 8,000 is ~2.3x cheaper than uncapped while keeping most of the signal; spot-checked
# that a relevant page's first 4,000 chars already carry its key terms, so a relevance
# judgement does not need the whole page. This caps only the text written into the
# bundle for the routine's model to read — never the text that is hashed (see verify()).
MAX_BUNDLE_CHARS = 8000


def _bundle_text(text: str, *, url: str) -> str:
    """Truncate a page's text for the bundle, making the cut visible to the model.

    Never used for hashing — verify() hashes the full `text` first and only calls this
    when assembling what gets written to disk, so a truncated bundle never affects
    drift detection.
    """
    if len(text) <= MAX_BUNDLE_CHARS:
        return text
    return (
        text[:MAX_BUNDLE_CHARS]
        + f"\n\n[truncated: the full page is at {url}]"
    )


def assessed_story_ids(
    signals: list[dict[str, Any]], baseline: list[dict[str, Any]]
) -> set[str]:
    """story_ids whose `assessment` this run introduced or changed.

    Judged by comparing against a reference queue, never by `proposed_at` or `proposer`:
    both are written by the very agent this check polices, so scoping on either would let
    a back-dated or relabelled assessment exempt itself from verification. Mirrors
    `blocks_to_recheck` in `build_candidate_evidence.py`, which solves the identical
    problem for the triage routine's evidence recheck, down to the same reasoning.

    A signal's `assessment` can in practice only be added, never edited — `finish`'s own
    `signal_field_changes` rejects overwriting one that already existed — but comparing
    the whole block rather than just its presence costs nothing and does not depend on
    that other guard holding.
    """
    prior = {
        str(item.get("story_id")): item.get("assessment")
        for item in baseline
        if isinstance(item, dict)
    }
    return {
        str(signal.get("story_id"))
        for signal in signals
        if isinstance(signal.get("assessment"), dict)
        and signal["assessment"] != prior.get(str(signal.get("story_id")))
    }


def baseline_queue_signals(base_ref: str, *, run=subprocess.run) -> list[dict[str, Any]]:
    """The signal queue as it stood at `base_ref`, or [] if it cannot be read.

    An unreadable or malformed baseline widens the recheck's scope rather than narrowing
    it: with nothing to compare against, every currently-assessed signal counts as new,
    so `--recheck` errs toward verifying more citations, never fewer. Mirrors
    `previous_candidates` in `build_candidate_evidence.py`.
    """
    result = run(
        ["git", "show", f"{base_ref}:{QUEUE_REPO_PATH}"], capture_output=True, text=True
    )
    if result.returncode != 0:
        return []
    try:
        document = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    signals = document.get("signals") if isinstance(document, dict) else None
    return signals if isinstance(signals, list) else []


def verify(
    *, refresh: bool, fetcher=fetch_web_text, signals_path: Path = SIGNALS_PATH,
    baseline: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Re-fetch a signal's page and compare it against the recorded digest.

    `refresh` (used by `prepare`) checks every readable signal, broadly, to populate the
    bundle the routine's model reads — drift there is reported but does not fail the run
    (see `run_hn_signals.prepare`). `recheck` (`refresh=False`, used by `finish`) narrows
    to the signals `assessed_story_ids` finds new or changed against `baseline`: a page
    that drifted but carries no assessment this run added has no citation at stake, so
    its drift cannot fail a run that never cited it. `baseline` defaults to `[]`, which
    scopes a bare `refresh=False` call to every currently-assessed signal — the safe
    default when no baseline was supplied.

    `signals_path` is injectable so tests can point this at a fake queue instead of
    the real one — the real queue may be empty, and the test must run with no network.
    """
    document = json.loads(signals_path.read_text(encoding="utf-8"))
    signals = document["signals"]
    scope = None if refresh else assessed_story_ids(signals, baseline or [])
    problems: list[str] = []
    bundle: dict[str, str] = {}
    for signal in signals:
        if signal["page_status"] != "readable":
            continue
        if scope is not None and str(signal.get("story_id")) not in scope:
            continue
        try:
            body = fetcher(signal["url"])
        except (OSError, ValueError) as error:
            problems.append(f"signal {signal['story_id']}: re-fetch failed: {error}")
            continue
        # The same extraction the sweep hashed. Importing it rather than repeating it is
        # load-bearing: two extractors that disagree by one space report drift on every
        # page, every day, and a real change would be indistinguishable from the noise.
        text = extract_visible_text(body)
        digest = content_hash(text)
        if digest != signal["content_sha256"]:
            problems.append(
                f"signal {signal['story_id']}: page changed since the sweep recorded it"
            )
            continue
        bundle[signal["story_id"]] = _bundle_text(text, url=signal["url"])
    if refresh:
        BUNDLE_DIR.mkdir(exist_ok=True)
        (BUNDLE_DIR / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--refresh", action="store_true")
    mode.add_argument("--recheck", action="store_true")
    parser.add_argument(
        "--base-ref", default=DEFAULT_BASE_REF,
        help=(
            "commit --recheck diffs the queue against to find this run's own new or "
            "changed assessments (default: origin/main); ignored by --refresh, which "
            "always checks every readable signal. run_hn_signals.py finish passes the "
            "exact SHA prepare recorded, which may differ from origin/main."
        ),
    )
    args = parser.parse_args(argv)
    baseline = None if args.refresh else baseline_queue_signals(args.base_ref)
    problems = verify(refresh=args.refresh, baseline=baseline)
    for problem in problems:
        print(f"error: {problem}", file=sys.stderr)
    if not args.refresh:
        document = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
        scoped = assessed_story_ids(document["signals"], baseline or [])
        # Say what was verified. A silent "0 problems" reads identically whether this
        # run's citations held up or whether nothing was examined at all.
        print(f"rechecked {len(scoped)} signal(s) with a new assessment this run")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
