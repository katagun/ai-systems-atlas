from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.json_io import (
    DirectoryDataError,
    load_document,
    write_json_atomic,
    write_json_atomic_all,
)


class LoadDocumentTests(unittest.TestCase):
    """CR-22. One loader, one failure behaviour, and the filename in the message."""

    def test_a_missing_file_returns_the_default_when_one_is_given(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "absent.json"
            self.assertEqual(
                {"candidates": []}, load_document(path, {"candidates": []})
            )

    def test_a_missing_file_without_a_default_names_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "absent.json"
            with self.assertRaises(DirectoryDataError) as caught:
                load_document(path)
            self.assertIn("absent.json", str(caught.exception))
            self.assertIn("missing", str(caught.exception))

    def test_invalid_json_names_the_file_and_the_position(self) -> None:
        """Before CR-22 this surfaced as a bare "Expecting property name", naming nothing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "taxonomy.json"
            path.write_text('{"broken": }', encoding="utf-8")
            with self.assertRaises(DirectoryDataError) as caught:
                load_document(path, {"default": True})
            message = str(caught.exception)
            self.assertIn("taxonomy.json", message)
            self.assertIn("not valid JSON", message)
            self.assertIn("line 1", message)

    def test_a_corrupt_file_never_falls_back_to_the_default(self) -> None:
        """A half-written catalog must not read as an empty one."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "candidates.json"
            path.write_text("", encoding="utf-8")
            with self.assertRaises(DirectoryDataError):
                load_document(path, {"candidates": []})

    def test_a_non_object_document_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "models.json"
            path.write_text("[1, 2, 3]", encoding="utf-8")
            with self.assertRaises(DirectoryDataError) as caught:
                load_document(path)
            self.assertIn("list", str(caught.exception))

    def test_a_valid_document_round_trips(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            write_json_atomic(path, {"projects": [{"id": "a"}]})
            self.assertEqual({"projects": [{"id": "a"}]}, load_document(path))


class WriteJsonAtomicTests(unittest.TestCase):
    def test_the_target_is_replaced_whole(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            write_json_atomic(path, {"projects": [1, 2, 3]})
            self.assertEqual([1, 2, 3], load_document(path)["projects"])

    def test_an_existing_file_keeps_its_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            path.write_text("{}", encoding="utf-8")
            os.chmod(path, 0o640)
            write_json_atomic(path, {"projects": []})
            self.assertEqual(0o640, stat.S_IMODE(path.stat().st_mode))

    def test_a_new_file_gets_default_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "fresh.json"
            write_json_atomic(path, {})
            self.assertTrue(path.exists())

    def test_no_temporary_file_survives_a_successful_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            write_json_atomic(path, {"a": 1})
            self.assertEqual(["projects.json"], os.listdir(tmpdir))

    def test_no_temporary_file_survives_a_failed_write(self) -> None:
        """A non-serialisable value must not leave debris beside the catalog."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            path.write_text('{"a": 1}', encoding="utf-8")
            with self.assertRaises(TypeError):
                write_json_atomic(path, {"a": {1, 2}})  # a set is not JSON
            self.assertEqual(["projects.json"], os.listdir(tmpdir))
            self.assertEqual({"a": 1}, load_document(path))

    def test_a_failed_write_leaves_the_previous_content_intact(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            write_json_atomic(path, {"generation": 1})
            with self.assertRaises(TypeError):
                write_json_atomic(path, {"generation": object()})
            self.assertEqual(1, load_document(path)["generation"])

    def test_output_matches_the_repository_format(self) -> None:
        """Two-space indent, real unicode, trailing newline, as every catalog file has."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projects.json"
            write_json_atomic(path, {"name": "北京火山引擎", "list": [1]})
            text = path.read_text(encoding="utf-8")
            self.assertEqual(
                '{\n  "name": "北京火山引擎",\n  "list": [\n    1\n  ]\n}\n', text
            )


class WriteJsonAtomicAllTests(unittest.TestCase):
    """CR-14. The group write is the part that protects a multi-file update."""

    def _documents(self, tmpdir: str) -> list[Path]:
        directory = Path(tmpdir)
        names = [
            "projects.json",
            "candidates.json",
            "license-review.json",
            "local-runtimes.json",
            "packs.json",
            "specifications.json",
        ]
        for name in names:
            (directory / name).write_text(json.dumps({"stale": True}), encoding="utf-8")
        return [directory / name for name in names]

    def test_every_target_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self._documents(tmpdir)
            write_json_atomic_all(
                [(path, {"stale": False, "name": path.name}) for path in paths]
            )
            for path in paths:
                self.assertEqual(path.name, load_document(path)["name"])

    def test_one_failure_restores_every_target(self) -> None:
        """This is the defect CR-14 recorded: six writes, no rollback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self._documents(tmpdir)
            good = paths[:-1]
            broken = paths[-1]
            with self.assertRaises(TypeError):
                write_json_atomic_all(
                    [(path, {"generation": 2}) for path in good]
                    + [(broken, {"generation": object()})]
                )
            for path in paths:
                self.assertEqual(
                    {"stale": True},
                    load_document(path),
                    f"{path.name} was left half-refreshed",
                )

    def test_a_failure_in_the_middle_restores_later_targets_too(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self._documents(tmpdir)
            pairs = [(paths[0], {"generation": 2}), (paths[1], {"bad": object()})]
            pairs += [(path, {"generation": 2}) for path in paths[2:]]
            with self.assertRaises(TypeError):
                write_json_atomic_all(pairs)
            for path in paths:
                self.assertEqual({"stale": True}, load_document(path))

    def test_a_target_that_does_not_exist_is_removed_on_rollback(self) -> None:
        """A first-time file is a legitimate member of a group write."""
        with tempfile.TemporaryDirectory() as tmpdir:
            existing = Path(tmpdir) / "projects.json"
            existing.write_text('{"stale": true}', encoding="utf-8")
            fresh = Path(tmpdir) / "brand-new.json"
            with self.assertRaises(TypeError):
                write_json_atomic_all(
                    [
                        (existing, {"generation": 2}),
                        (fresh, {"generation": 2}),
                        (Path(tmpdir) / "boom.json", {"bad": object()}),
                    ]
                )
            self.assertEqual({"stale": True}, load_document(existing))
            self.assertFalse(
                fresh.exists(), "a rolled-back first-time file was left behind"
            )

    def test_an_interrupt_after_two_of_three_writes_is_rolled_back(self) -> None:
        """Fault injection at the replacement boundary, which is where CR-05 asked for it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self._documents(tmpdir)
            real_replace = os.replace
            calls = {"n": 0}

            def failing_replace(src, dst, *args, **kwargs):
                calls["n"] += 1
                if calls["n"] == 3:
                    raise KeyboardInterrupt("interrupted mid-update")
                return real_replace(src, dst, *args, **kwargs)

            with (
                mock.patch("scripts.json_io.os.replace", failing_replace),
                self.assertRaises(KeyboardInterrupt),
            ):
                write_json_atomic_all([(path, {"generation": 2}) for path in paths])
            for path in paths:
                self.assertEqual(
                    {"stale": True},
                    load_document(path),
                    f"{path.name} kept a new value after an interrupt",
                )
            self.assertEqual(
                sorted(p.name for p in paths),
                sorted(os.listdir(tmpdir)),
                "a temporary file survived the interrupt",
            )


if __name__ == "__main__":
    unittest.main()
