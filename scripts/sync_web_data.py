#!/usr/bin/env python3
"""Copy canonical published catalog data into the dependency-free web app.

Two modes, because every other generator in this repository has both and this one
used to have only one. Without `--check` it copies `directory/<name>` to `web/<name>`
for each published file. With `--check` it copies nothing and reports the files whose
web copy is not byte-identical to the canonical one, exiting non-zero.

The mode existed because `scripts/regenerate.py` lists this script as the first step of
the generation order, and a script that silently accepts an argument it does not
implement is a trap: `--check` used to print a success line and write anyway, so a
caller checking the tree for staleness was quietly editing it instead. build_logos.mjs
reads the synced web copies rather than directory/, so a stale sync here is a wrong
logos.json as well as a wrong set of payloads.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

try:
    from .catalog import PUBLISHED_DATA
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from catalog import PUBLISHED_DATA

ROOT = Path(__file__).resolve().parents[1]


def stale_files() -> list[str]:
    """Published catalog files whose web copy differs from the canonical one."""
    stale = []
    for name in PUBLISHED_DATA:
        canonical = ROOT / "directory" / name
        mirrored = ROOT / "web" / name
        if not mirrored.exists() or canonical.read_bytes() != mirrored.read_bytes():
            stale.append(name)
    return stale


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report unsynchronized files without writing",
    )
    args = parser.parse_args()

    if args.check:
        stale = stale_files()
        if stale:
            print(
                "web/ is not synchronized with directory/; run `uv run python scripts/sync_web_data.py`:"
            )
            for name in stale:
                print(f"  {name}")
            return 1
        print(f"web/ matches all {len(PUBLISHED_DATA)} published catalog files")
        return 0

    for name in PUBLISHED_DATA:
        shutil.copy2(ROOT / "directory" / name, ROOT / "web" / name)
    print(f"synchronized {len(PUBLISHED_DATA)} catalog files to web/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
