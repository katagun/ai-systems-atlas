from __future__ import annotations

import io
import tarfile
import unittest
from unittest.mock import patch

from scripts.import_models_dev import (
    build_document,
    build_source_document,
    catalog_from_archive,
    get_bytes,
    get_json,
    normalize_catalog,
    normalize_source_catalog,
    stable_model_id,
)

COMMIT = "0123456789abcdef0123456789abcdef01234567"


def model_record(source_id: str, *, output: list[str] | None = None) -> dict:
    return {
        "id": source_id,
        "name": source_id.rsplit("/", 1)[-1],
        "description": "Provider-independent model metadata.",
        "modalities": {"input": ["text"], "output": output or ["text"]},
        "limit": {"context": 8192, "output": 1024},
        "attachment": False,
        "tool_call": True,
    }


def archive_with(files: dict[str, str]) -> bytes:
    body = io.BytesIO()
    prefix = f"models.dev-{COMMIT}/"
    with tarfile.open(fileobj=body, mode="w:gz") as archive:
        for path, content in files.items():
            payload = content.encode()
            member = tarfile.TarInfo(prefix + path)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))
    return body.getvalue()


class ModelsDevImportTests(unittest.TestCase):
    def test_json_fetch_rejects_hosts_that_only_contain_an_allowed_hostname(self) -> None:
        malicious_urls = (
            "https://api.github.com.attacker.invalid/repos/anomalyco/models.dev/commits/dev",
            "https://attacker.invalid/?next=https://api.github.com/repos/anomalyco/models.dev/commits/dev",
            "https://raw.githubusercontent.com.attacker.invalid/anomalyco/models.dev/dev/models.json",
        )

        with patch("scripts.import_models_dev.urllib.request.urlopen") as urlopen:
            for url in malicious_urls:
                with self.subTest(url=url), self.assertRaisesRegex(ValueError, "allowlist"):
                    get_json(url, "secret")
            urlopen.assert_not_called()

    def test_archive_fetch_rejects_hosts_that_only_contain_the_allowed_hostname(self) -> None:
        malicious_url = (
            "https://codeload.github.com.attacker.invalid/"
            "anomalyco/models.dev/tar.gz/0123456789abcdef"
        )

        with patch("scripts.import_models_dev.urllib.request.urlopen") as urlopen:
            with self.assertRaisesRegex(ValueError, "allowlist"):
                get_bytes(malicious_url, "secret")
            urlopen.assert_not_called()

    def test_archive_reads_only_provider_independent_model_tomls(self) -> None:
        body = archive_with({
            "models/acme/example.toml": (
                'name = "Example"\n'
                'description = "Example model"\n'
                'tool_call = true\n'
                '[limit]\ncontext = 8192\noutput = 1024\n'
                '[modalities]\ninput = ["text"]\noutput = ["text"]\n'
            ),
            "providers/acme/models/example.toml": 'name = "Provider endpoint"\n',
            "README.md": "ignored",
        })

        catalog = catalog_from_archive(body, COMMIT)

        self.assertEqual(["acme/example"], list(catalog))
        self.assertEqual("acme/example", catalog["acme/example"]["id"])

    def test_normalization_filters_non_text_outputs_and_preserves_unknowns(self) -> None:
        catalog = {
            "acme/chat": model_record("acme/chat"),
            "acme/image": model_record("acme/image", output=["image"]),
        }

        candidates, eligible = normalize_catalog(
            catalog, observed_at="2026-09-04", minimum_records=1,
        )

        self.assertEqual(1, eligible)
        self.assertEqual(["acme/chat"], [item["source_id"] for item in candidates])
        self.assertIsNone(candidates[0]["source_metadata"]["capabilities"]["reasoning"])
        self.assertIsNone(candidates[0]["source_metadata"]["limits"]["input"])

    def test_source_snapshot_keeps_every_model_regardless_of_output_modality(self) -> None:
        catalog = {
            "acme/chat": model_record("acme/chat"),
            "acme/image": model_record("acme/image", output=["image"]),
        }

        records = normalize_source_catalog(catalog, minimum_records=1)

        self.assertEqual(["acme/chat", "acme/image"], [item["source_id"] for item in records])
        self.assertEqual(["image"], records[1]["source_metadata"]["modalities"]["output"])

    def test_source_document_records_the_complete_commit_pinned_catalog(self) -> None:
        catalog = {
            "acme/chat": model_record("acme/chat"),
            "acme/image": model_record("acme/image", output=["image"]),
        }

        document = build_source_document(
            catalog,
            b"source archive",
            COMMIT,
            observed_at="2026-09-05",
            minimum_records=1,
        )

        self.assertEqual(2, document["source_record_count"])
        self.assertEqual(2, len(document["models"]))
        self.assertEqual(COMMIT, document["source"]["commit"])

    def test_optional_description_is_preserved_as_unknown(self) -> None:
        record = model_record("acme/chat")
        del record["description"]

        candidates, _ = normalize_catalog(
            {"acme/chat": record}, observed_at="2026-09-04", minimum_records=1,
        )

        self.assertIsNone(candidates[0]["source_metadata"]["description"])

    def test_published_sources_leave_the_queue_without_editing_metadata(self) -> None:
        catalog = {"acme/chat": model_record("acme/chat")}
        existing = {"candidates": [{
            "source_id": "acme/chat",
            "discovered_at": "2026-08-01",
        }]}

        candidates, eligible = normalize_catalog(
            catalog,
            observed_at="2026-09-04",
            existing=existing,
            published_source_ids={"acme/chat"},
            minimum_records=1,
        )

        self.assertEqual(1, eligible)
        self.assertEqual([], candidates)

    def test_existing_candidates_keep_their_discovery_date(self) -> None:
        catalog = {"acme/chat": model_record("acme/chat")}
        existing = {"candidates": [{
            "source_id": "acme/chat",
            "discovered_at": "2026-08-01",
        }]}

        candidates, _ = normalize_catalog(
            catalog, observed_at="2026-09-04", existing=existing, minimum_records=1,
        )

        self.assertEqual("2026-08-01", candidates[0]["discovered_at"])
        self.assertEqual("2026-09-04", candidates[0]["last_seen_at"])

    def test_slug_collisions_fail_closed(self) -> None:
        catalog = {
            "Acme/model": model_record("Acme/model"),
            "acme-model": model_record("acme-model"),
        }

        with self.assertRaisesRegex(ValueError, "collide"):
            normalize_catalog(catalog, observed_at="2026-09-04", minimum_records=1)

    def test_large_eligible_count_shrink_fails_closed(self) -> None:
        catalog = {
            f"acme/model-{index}": model_record(f"acme/model-{index}")
            for index in range(7)
        }

        with self.assertRaisesRegex(ValueError, "shrank"):
            build_document(
                catalog,
                b"source archive",
                COMMIT,
                observed_at="2026-09-04",
                existing={"eligible_record_count": 10, "candidates": []},
                published_source_ids=set(),
                minimum_records=1,
            )

    def test_model_ids_are_stable_and_collection_scoped(self) -> None:
        self.assertEqual("model-google-gemma-4-e2b-it", stable_model_id("google/gemma-4-E2B-it"))


if __name__ == "__main__":
    unittest.main()
