from __future__ import annotations

import base64
import unittest

from scripts import build_candidate_evidence as harness


def candidate(repo: str, discovered_at: str = "2026-09-01", **extra) -> dict:
    return {"repo": repo, "url": f"https://github.com/{repo}", "discovered_at": discovered_at, **extra}


class SelectionTests(unittest.TestCase):
    def test_selection_skips_candidates_that_already_carry_a_triage_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "held"}), candidate("b/two")]
        self.assertEqual(["b/two"], [item["repo"] for item in harness.select_candidates(queue, 10)])

    def test_selection_takes_the_oldest_first(self) -> None:
        queue = [candidate("a/new", "2026-09-03"), candidate("b/old", "2026-08-25")]
        self.assertEqual(["b/old"], [item["repo"] for item in harness.select_candidates(queue, 1)])

    def test_carry_forward_restores_prior_work_by_repo(self) -> None:
        queue = [candidate("a/one")]
        previous = [candidate("A/One", triage={"verdict": "held", "held_by": "x"})]
        self.assertEqual(1, harness.carry_forward(queue, previous))
        self.assertEqual("held", queue[0]["triage"]["verdict"])

    def test_carry_forward_never_overwrites_an_existing_block(self) -> None:
        queue = [candidate("a/one", triage={"verdict": "review_ready"})]
        previous = [candidate("a/one", triage={"verdict": "out_of_scope"})]
        self.assertEqual(0, harness.carry_forward(queue, previous))
        self.assertEqual("review_ready", queue[0]["triage"]["verdict"])


class CrossCheckTests(unittest.TestCase):
    def test_a_repo_already_excluded_is_reported(self) -> None:
        catalog = {"exclusions.json": [{"repo": "A/One"}], "projects.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("exclusions.json" in hit for hit in hits), hits)

    def test_a_repo_already_published_is_reported(self) -> None:
        catalog = {"projects.json": [{"repo": "a/one", "id": "one"}], "exclusions.json": []}
        hits = harness.cross_collection_hits(candidate("a/one"), catalog)
        self.assertTrue(any("projects.json" in hit for hit in hits), hits)

    def test_a_clean_candidate_reports_nothing(self) -> None:
        catalog = {"projects.json": [{"repo": "b/two", "id": "two"}], "exclusions.json": []}
        self.assertEqual([], harness.cross_collection_hits(candidate("a/one"), catalog))


class ClassSignalTests(unittest.TestCase):
    def test_an_awesome_list_is_flagged(self) -> None:
        item = candidate("aristoapp/awesome-second-brain", name="awesome-second-brain",
                         description="A curated list of tools.", topics=[])
        self.assertIn("awesome list", harness.class_signals(item))

    def test_a_benchmark_topic_is_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An evaluation suite.", topics=["benchmark"])
        self.assertIn("benchmark", harness.class_signals(item))

    def test_an_ordinary_candidate_is_not_flagged(self) -> None:
        item = candidate("x/y", name="y", description="An agent runtime.", topics=["agents"])
        self.assertEqual([], harness.class_signals(item))


class FetchTests(unittest.TestCase):
    def responses(self, license_payload=None, readme_payload=None):
        def getter(path: str, _token):
            if path.endswith("/license"):
                if license_payload is None:
                    raise KeyError("no license")
                return license_payload
            if path.endswith("/readme"):
                return readme_payload or {}
            return {"full_name": "a/one", "description": "d", "topics": [], "archived": False}
        return getter

    def test_license_evidence_pins_the_blob_sha_the_api_returns(self) -> None:
        payload = {
            "sha": "0" * 40,
            "path": "LICENSE",
            "html_url": "https://github.com/a/one/blob/main/LICENSE",
            "content": base64.b64encode(b"MIT").decode(),
            "encoding": "base64",
        }
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(payload), None, "2026-09-04")
        licence = next(d for d in bundle["documents"] if d["label"] == "LICENSE")
        self.assertEqual("git_blob", licence["kind"])
        self.assertEqual("0" * 40, licence["blob_sha"])
        self.assertEqual(
            "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40, licence["immutable_url"])
        self.assertEqual(harness.content_hash("MIT"), licence["content_sha256"])

    def test_a_missing_license_is_recorded_as_an_error_not_a_crash(self) -> None:
        bundle = harness.fetch_candidate_evidence(
            candidate("a/one"), self.responses(None), None, "2026-09-04")
        self.assertTrue(bundle["errors"])
        self.assertFalse([d for d in bundle["documents"] if d["label"] == "LICENSE"])

    def test_content_hash_is_stable(self) -> None:
        self.assertEqual(harness.content_hash("MIT"), harness.content_hash("MIT"))
        self.assertEqual(64, len(harness.content_hash("MIT")))


class RecheckTests(unittest.TestCase):
    def triaged(self, content_sha256: str) -> list[dict]:
        return [candidate("a/one", triage={
            "verdict": "review_ready",
            "rule": "r",
            "finding": "f",
            "evidence": [{
                "label": "LICENSE",
                "url": "https://github.com/a/one/blob/main/LICENSE",
                "kind": "git_blob",
                "blob_sha": "0" * 40,
                "immutable_url": "https://api.github.com/repos/a/one/git/blobs/" + "0" * 40,
                "content_sha256": content_sha256,
                "fetched_at": "2026-09-04",
            }],
            "proposed_at": "2026-09-04",
            "proposer": "candidate-triage",
        })]

    def getter(self, path: str, _token):
        return {"sha": "0" * 40, "encoding": "base64",
                "content": base64.b64encode(b"MIT").decode(),
                "html_url": "https://github.com/a/one/blob/main/LICENSE"}

    def test_matching_evidence_rechecks_clean(self) -> None:
        self.assertEqual([], harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), self.getter, None))

    def test_a_wrong_content_hash_is_reported(self) -> None:
        problems = harness.recheck_candidates(self.triaged("a" * 64), self.getter, None)
        self.assertTrue(any("content_sha256" in problem for problem in problems), problems)

    def test_an_unreachable_citation_is_reported(self) -> None:
        def failing(_path, _token):
            raise OSError("404")
        problems = harness.recheck_candidates(
            self.triaged(harness.content_hash("MIT")), failing, None)
        self.assertTrue(any("could not be re-fetched" in problem for problem in problems), problems)


if __name__ == "__main__":
    unittest.main()
