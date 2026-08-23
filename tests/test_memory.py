from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cognosaic.brief import build_brief
from cognosaic.context import build_context_pack
from cognosaic.index import BrainIndex
from cognosaic.paths import BrainPaths
from cognosaic.vault import Vault, parse_record


class CognosaicMemoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.paths = BrainPaths.from_root(self.temp.name)
        self.vault = Vault(self.paths)
        self.index = BrainIndex(self.paths)
        self.index.rebuild(self.vault)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def create_indexed(self, **kwargs):
        record = self.vault.create(**kwargs)
        path = self.vault.find_path(record.id)
        self.assertIsNotNone(path)
        self.index.upsert(record, path)  # type: ignore[arg-type]
        return record, path

    def test_create_writes_canonical_markdown_and_event(self) -> None:
        record, path = self.create_indexed(
            title="Canonical Markdown",
            content="Markdown remains the source of truth.",
            record_type="decision",
            tags=["Architecture", "local-first"],
            sources=["https://example.invalid/spec"],
        )
        self.assertTrue(path.exists())
        parsed = parse_record(path.read_text(encoding="utf-8"))
        self.assertEqual(parsed.id, record.id)
        self.assertEqual(parsed.tags, ["architecture", "local-first"])
        events = [json.loads(line) for line in self.paths.events.read_text().splitlines()]
        self.assertTrue(any(event["event"] == "record.created" for event in events))

    def test_search_returns_citation_and_score_explanation(self) -> None:
        record, _ = self.create_indexed(
            title="Use explicit supersession",
            content="Facts change over time, so do not silently overwrite them.",
            record_type="decision",
            tags=["temporal"],
        )
        results = self.index.search("facts overwrite", limit=5)
        self.assertEqual(results[0].id, record.id)
        self.assertTrue(results[0].citation.startswith("[cog:"))
        self.assertIn("coverage", results[0].score_parts)
        self.assertGreater(results[0].score, 0)

    def test_rebuild_restores_search_from_files(self) -> None:
        record, _ = self.create_indexed(
            title="Rebuildable index",
            content="SQLite is a disposable projection.",
            record_type="claim",
        )
        self.paths.index.unlink()
        count = self.index.rebuild(self.vault)
        self.assertEqual(count, 1)
        self.assertEqual(self.index.search("disposable projection")[0].id, record.id)

    def test_supersession_preserves_history_and_current_truth(self) -> None:
        old, _ = self.create_indexed(
            title="Hosting choice",
            content="Use provider A.",
            record_type="decision",
        )
        before = datetime.now(UTC).isoformat()
        replacement = self.vault.supersede(
            old.id,
            title="Hosting choice",
            content="Use provider B because requirements changed.",
            record_type="decision",
        )
        self.index.rebuild(self.vault)
        self.assertEqual(self.vault.get(old.id).status, "superseded")
        current = self.index.search("hosting provider", include_inactive=False)
        self.assertEqual([item.id for item in current], [replacement.id])
        historical = self.index.search("provider A", include_inactive=True, as_of=before)
        self.assertEqual(historical[0].id, old.id)

    def test_context_pack_is_cited_and_budgeted(self) -> None:
        self.create_indexed(
            title="Context pack rule",
            content="Every context excerpt must carry a stable record citation.",
            record_type="decision",
        )
        pack = build_context_pack(self.index, "stable citation", token_budget=300)
        self.assertIn("[cog:", pack.text)
        self.assertLessEqual(pack.estimated_tokens, 300)
        self.assertEqual(len(pack.citations), 1)

    def test_archive_is_reversible_style_removal(self) -> None:
        record, path = self.create_indexed(title="Old note", content="Archive me.")
        destination = self.vault.archive(record.id)
        self.assertFalse(path.exists())
        self.assertTrue(destination.exists())
        self.assertEqual(self.vault.get(record.id).status, "archived")

    def test_brief_groups_recent_records(self) -> None:
        self.create_indexed(title="Choose local first", content="Decision body", record_type="decision")
        self.create_indexed(title="Index documents", content="Task body", record_type="task")
        brief = build_brief(self.index, days=7)
        self.assertIn("## Decisions", brief)
        self.assertIn("## Tasks", brief)
        self.assertIn("Choose local first", brief)


if __name__ == "__main__":
    unittest.main()
