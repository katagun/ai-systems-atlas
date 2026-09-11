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
    from .sweep_hackernews import content_hash, extract_visible_text
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_candidate_evidence import fetch_web_text
    from sweep_hackernews import content_hash, extract_visible_text

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "directory" / "hn-signals.json"
BUNDLE_DIR = ROOT / ".hn-signal-bundle"

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
    args = parser.parse_args(argv)
    problems = verify(refresh=args.refresh)
    for problem in problems:
        print(f"error: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
