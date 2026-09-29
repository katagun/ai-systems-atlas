#!/usr/bin/env python3
"""Copy canonical published catalog data into the dependency-free web app."""

from __future__ import annotations

import shutil
from pathlib import Path

try:
    from .catalog import PUBLISHED_DATA
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from catalog import PUBLISHED_DATA

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    for name in PUBLISHED_DATA:
        shutil.copy2(ROOT / "directory" / name, ROOT / "web" / name)
    print(f"synchronized {len(PUBLISHED_DATA)} catalog files to web/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
