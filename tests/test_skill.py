from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = ROOT / "skills" / "ai-systems-atlas"
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


def parse_frontmatter(text: str) -> dict[str, str]:
    """Extract top-level `key: value` pairs from a SKILL.md frontmatter block.

    Deliberately not a YAML parser: this repository has zero Python
    dependencies (`pyproject.toml` declares `dependencies = []`), and the
    Agent Skills manifest only needs two flat scalar fields here.
    """
    match = FRONTMATTER.match(text)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return fields


class SkillTests(unittest.TestCase):
    def test_skill_manifest_has_required_frontmatter(self) -> None:
        text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        fields = parse_frontmatter(text)
        self.assertTrue(fields.get("name"), "SKILL.md frontmatter is missing a non-empty name")
        self.assertTrue(fields.get("description"), "SKILL.md frontmatter is missing a non-empty description")

    def test_reference_file_exists(self) -> None:
        self.assertTrue((SKILL_DIR / "reference.md").is_file())


if __name__ == "__main__":
    unittest.main()
