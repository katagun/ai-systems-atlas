"""Run the complete Python suite with the same coverage gate locally and in CI."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    env = os.environ.copy()
    # Git hooks export these; the suite's temporary repositories must be isolated.
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"):
        env.pop(key, None)
    for args in (("run", "-m", "unittest", "discover", "-s", "tests"), ("report",)):
        result = subprocess.run(
            [sys.executable, "-m", "coverage", *args], cwd=ROOT, env=env, check=False
        )
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
