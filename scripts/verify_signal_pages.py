"""Re-fetch each signal's vendor page and check it against the committed digest.

--refresh writes the bundle the routine reads; --recheck verifies without writing.
Claude never fetches: this deterministic script does, exactly as prepare/finish do
for the candidate-triage routine.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from .build_candidate_evidence import fetch_web_text
    from .sweep_hackernews import content_hash
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_candidate_evidence import fetch_web_text
    from sweep_hackernews import content_hash

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
BUNDLE_DIR = ROOT / ".hn-signal-bundle"


def verify(*, refresh: bool, fetcher=fetch_web_text, signals_path: Path = SIGNALS_PATH) -> list[str]:
    """Re-fetch every readable signal's page and compare it against the recorded digest.

    `signals_path` is injectable so tests can point this at a fake queue instead of
    the real one — the real queue may be empty, and the test must run with no network.
    """
    document = json.loads(signals_path.read_text(encoding="utf-8"))
    problems: list[str] = []
    bundle: dict[str, str] = {}
    for signal in document["signals"]:
        if signal["page_status"] != "readable":
            continue
        try:
            text = fetcher(signal["url"])
        except (OSError, ValueError) as error:
            problems.append(f"signal {signal['story_id']}: re-fetch failed: {error}")
            continue
        digest = content_hash(text)
        if digest != signal["content_sha256"]:
            problems.append(
                f"signal {signal['story_id']}: page changed since the sweep recorded it"
            )
            continue
        bundle[signal["story_id"]] = text
    if refresh:
        BUNDLE_DIR.mkdir(exist_ok=True)
        (BUNDLE_DIR / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--refresh", action="store_true")
    mode.add_argument("--recheck", action="store_true")
    args = parser.parse_args(argv)
    problems = verify(refresh=args.refresh)
    for problem in problems:
        print(f"error: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
