"""Run the pinned Gitleaks hook against all history or an explicit CI range.

pre-commit installs the binary and puts it on PATH. Local hooks and scheduled
audits scan all fetched history. CI supplies complete, validated commit IDs for
the range of a PR or the pushes since main's last successful verification.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys


def command(base: str, head: str) -> list[str]:
    if base and not all(re.fullmatch(r"[0-9a-f]{40}", value) for value in (base, head)):
        raise ValueError("secret scan range requires two complete commit SHAs")
    return [
        "gitleaks",
        "git",
        "--redact",
        "--verbose",
        "--config",
        ".gitleaks.toml",
        f"--log-opts={base}..{head}" if base else "--log-opts=--all",
    ]


def main() -> int:
    argv = command(
        os.environ.get("ATLAS_GITLEAKS_BASE", ""),
        os.environ.get("ATLAS_GITLEAKS_HEAD", ""),
    )
    return subprocess.run(argv, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())
