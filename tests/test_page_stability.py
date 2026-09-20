"""The two-fetch rule: a page is citable only when its visible text hashes the same twice."""

import io
import unittest
from contextlib import redirect_stdout

from scripts import check_page_stability
from scripts.check_evidence_links import FetchFailure, FetchResult


def result(body: bytes) -> FetchResult:
    return FetchResult(
        status=200,
        final_url="https://robots.example/page",
        headers={"content-type": "text/html; charset=utf-8"},
        body=body,
    )


class PageStabilityTests(unittest.TestCase):
    def run_main(self, bodies):
        responses = iter(bodies)

        def fetch(url):
            value = next(responses)
            if isinstance(value, Exception):
                raise value
            return result(value)

        out = io.StringIO()
        with redirect_stdout(out):
            code = check_page_stability.main(
                ["https://robots.example/page", "--wait", "0"], fetch=fetch
            )
        return code, out.getvalue()

    def test_markup_noise_does_not_make_a_page_unstable(self) -> None:
        code, out = self.run_main(
            [
                b'<html><body><svg><linearGradient id="g-1842"/></svg><p>Spec sheet</p></body></html>',
                b'<html><body><svg><linearGradient id="g-9931"/></svg><p>Spec sheet</p></body></html>',
            ]
        )
        self.assertEqual(0, code)
        self.assertIn("stable", out)

    def test_changed_visible_text_is_unstable(self) -> None:
        code, out = self.run_main(
            [
                b"<html><body><p>Trace 1842</p></body></html>",
                b"<html><body><p>Trace 9931</p></body></html>",
            ]
        )
        self.assertEqual(1, code)
        self.assertIn("UNSTABLE", out)

    def test_a_fetch_failure_is_not_a_stable_page(self) -> None:
        code, out = self.run_main([FetchFailure("HTTP 404")])
        self.assertEqual(2, code)
        self.assertIn("HTTP 404", out)
