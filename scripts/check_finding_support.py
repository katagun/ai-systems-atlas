#!/usr/bin/env python3
"""Report findings whose pinned evidence may not support them. Read-only; edits nothing.

A triage `finding` quotes its evidence and makes claims about it. `--recheck` in
`build_candidate_evidence.py` already proves each cited document still hashes to what
was recorded, which shows the document is real. It does not show that the finding says
what the document says: a quote nobody wrote, or a claim the README never makes, passes
every hash check. Fabricated delegate research has been the costliest failure this
catalog has had, and it looks exactly like that.

Two layers, because they fail differently:

1. Quotes, in code. Every quoted span in a finding must appear verbatim in one of that
   block's pinned documents. This is deterministic, needs no model, and a miss is a
   fact: the words are not in the source. When a cited document no longer hashes to its
   pin, its quotes are reported as unverifiable rather than missing, because the text
   they came from is gone.
2. Claims, by typed judgment. Each sentence of the finding is judged against the pinned
   documents by TypeSafe's System One API, which picks one of four options and generates
   no text. It flags sentences the documents contradict or never state. It runs only when
   `TYPESAFE_API_KEY` exists, and any failure leaves layer 1's report standing alone.

Working rules 8 and 9 hold: this sorts and flags for a person, and never writes a
verdict, a classification, or a record. A flag is a place to look, not a conclusion;
layer 2 is a model's judgment and is wrong some of the time in both directions.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    from . import rank_signals
    from .build_candidate_evidence import (
        _decode,
        content_hash,
        fetch_web_text,
        github_token,
    )
    from .update_directory import github_get
except ImportError:  # Direct script execution places scripts/ on sys.path.
    import rank_signals
    from build_candidate_evidence import (
        _decode,
        content_hash,
        fetch_web_text,
        github_token,
    )
    from update_directory import github_get

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "directory" / "candidates.json"
CACHE = ROOT / ".candidate-evidence" / "pinned-text"
MIN_QUOTE_CHARS = 12
# Jev evaluates `state` plus the longest question inside 32k tokens. A long README is cut
# here, and a claim resting on text past the cut is reported as such, never as unsupported.
MAX_STATE_CHARS = 60_000
MAX_NESTED_QUOTES = 3
TRAILING = " ,.;:!?"
ELISION = re.compile("\\s*(?:\\.\\.\\.|\u2026|\\[\\.\\.\\.\\]|\\[\u2026\\])\\s*")
SENTENCE_END = re.compile('(?<=[.?!])["\u201d\u2019)]*\\s+(?=[A-Z"\u201c(])')

OPTIONS = {
    "supported": (
        "The documents state this, or it follows directly from what they state. "
        "A sentence that only relays quotations found in the documents is supported."
    ),
    "contradicted": "The documents say something that conflicts with this sentence.",
    "not_in_documents": (
        "The sentence asserts a fact about the project, its licence, or its "
        "documentation, and the documents neither state nor imply it."
    ),
    "not_a_document_claim": (
        "The sentence is not a claim about the documents' content: a question for a "
        "reviewer, a note about the review process or other catalog records, or a "
        "judgment about what should happen next."
    ),
}
FLAGGED = ("contradicted", "not_in_documents")
# Flags below this confidence are counted, not listed. Measured on 2026-09-20 against the
# 41 triage findings then queued: of 40 fabricated sentences the model flagged, 39 scored
# 0.67 or higher, while 8 of the 11 flags it raised on the real findings scored below 0.6.
# Those fabrications were blatant by construction; a subtle distortion will score lower.
MIN_CONFIDENCE = 0.6
# Sentences about the review itself, which the cited documents could never support. The
# model is asked to set these aside too, but it flagged 20 of them as `not_in_documents`
# in that measurement, and a rule code can state exactly belongs in code.
PROCESS_SENTENCE = re.compile(
    r"\b(?:(?:the|this) bundle|this catalog|BACKLOG\.md|ADR \d+|published record|same product|"
    r"cross-collection|boundary question|could be fetched|was fetched|HTTP \d{3}|"
    r"GitHub (?:detected|reports)|no existing role|promotion review|the Atlas)\b",
    re.IGNORECASE,
)


def normalise(text: str) -> str:
    """Fold the differences that are typography, not wording."""
    text = unicodedata.normalize("NFKC", text)
    for old, new in (
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
    ):
        text = text.replace(old, new)
    text = re.sub("[\u2010-\u2015]", "-", text)  # hyphens and dashes
    text = re.sub(r"[*`_]", "", text)  # Markdown emphasis a rendered quote drops
    return re.sub(r"\s+", " ", text).casefold().strip()


def _present(span: str, sources: list[str]) -> bool:
    """Every part of a possibly elided span appears, in order, in one source."""
    parts = [normalise(p).strip(TRAILING) for p in ELISION.split(span)]
    parts = [p for p in parts if p]
    if not parts:
        return True
    for source in sources:
        position = 0
        for part in parts:
            position = source.find(part, position)
            if position < 0:
                break
            position += len(part)
        else:
            return True
    return False


def quote_report(finding: str, documents: Mapping[str, str]) -> tuple[int, list[str]]:
    """(quotes checked, quotes missing) for one finding against its documents' text.

    Quotation marks are paired left to right, but a quoted passage can contain quotes of
    its own — `(the "License")` — which a naive pairing splits into fragments of the
    agent's own prose. So each opening mark tries the closers that would enclose three,
    two, one, and no nested pairs, longest first, and takes the first span the sources
    contain. Only when none matches is the shortest span reported missing.
    """
    text = finding.replace("\u201c", '"').replace("\u201d", '"')
    marks = [i for i, ch in enumerate(text) if ch == '"']
    sources = [normalise(body) for body in documents.values()]
    checked, missing = 0, []
    index = 0
    while index + 1 < len(marks):
        shortest = text[marks[index] + 1 : marks[index + 1]]
        if len(shortest.strip()) < MIN_QUOTE_CHARS and index + 2 >= len(marks):
            break
        matched = None
        # Longest first: a fragment of a quote is also in the source, so the nearest
        # closer would match `released under ... (the ` and then miscount what follows.
        # A span that swallows the agent's own prose cannot match, so it falls through.
        for nested in range(MAX_NESTED_QUOTES, -1, -1):
            closer = index + 1 + 2 * nested
            if closer >= len(marks):
                continue
            span = text[marks[index] + 1 : marks[closer]]
            if len(span.strip()) >= MIN_QUOTE_CHARS and _present(span, sources):
                matched = closer
                break
        if matched is not None:
            checked += 1
            index = matched + 1
            continue
        if len(shortest.strip()) >= MIN_QUOTE_CHARS:
            checked += 1
            missing.append(shortest.strip())
        index += 2
    return checked, missing


def sentences(finding: str) -> list[str]:
    """The finding's sentences that make a claim the cited documents could support."""
    parts = [part.strip() for part in SENTENCE_END.split(finding)]
    return [
        part
        for part in parts
        if len(part) >= MIN_QUOTE_CHARS and not PROCESS_SENTENCE.search(part)
    ]


def build_request(finding: str, documents: Mapping[str, str]) -> dict[str, Any]:
    budget = MAX_STATE_CHARS
    state_documents = []
    for label, body in documents.items():
        cut = body[: max(budget, 0)]
        state_documents.append(
            {"label": label, "text": cut, "truncated": len(cut) < len(body)}
        )
        budget -= len(cut)
    questions = {
        f"s{number}": {
            "type": "choice",
            "instructions": {
                "sentence": sentence,
                "question": (
                    "`sentence` comes from a reviewer's note about a software project. "
                    "Judged only against `documents`, which option describes it?"
                ),
            },
            "criteria": OPTIONS,
        }
        for number, sentence in enumerate(sentences(finding))
    }
    return {
        "state": {"documents": state_documents},
        "model": rank_signals.MODEL,
        "questions": questions,
    }


def judge_claims(
    finding: str,
    documents: Mapping[str, str],
    *,
    key: str,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> list[dict[str, Any]]:
    """One request per finding; every sentence is an independent question over it."""
    payload = build_request(finding, documents)
    if not payload["questions"]:
        return []
    request = urllib.request.Request(
        rank_signals.ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with opener(request, timeout=60) as response:
        answers = json.loads(response.read(1024 * 1024))["answers"]
    judged = []
    for number, sentence in enumerate(sentences(finding)):
        answer = answers.get(f"s{number}")
        if not isinstance(answer, dict) or answer.get("choice") not in OPTIONS:
            continue
        judged.append(
            {
                "sentence": sentence,
                "choice": answer["choice"],
                "confidence": answer.get("confidence"),
            }
        )
    return judged


@dataclass
class BlockReport:
    key: str
    quotes_checked: int = 0
    quotes_missing: list[str] = field(default_factory=list)
    drifted: list[str] = field(default_factory=list)
    mismatched: list[str] = field(default_factory=list)
    unfetched: list[str] = field(default_factory=list)
    claims: list[dict[str, Any]] = field(default_factory=list)
    claims_error: str | None = None

    @property
    def flagged_claims(self) -> list[dict[str, Any]]:
        return [claim for claim in self.claims if claim["choice"] in FLAGGED]

    def listed_claims(self, min_confidence: float) -> list[dict[str, Any]]:
        """Flags confident enough to show, strongest first. No confidence means show it."""
        shown = [
            claim
            for claim in self.flagged_claims
            if not isinstance(claim.get("confidence"), int | float)
            or claim["confidence"] >= min_confidence
        ]
        # An explicit 0.0 confidence is the weakest signal, not a missing one:
        # `or 1.0` would rank it strongest, so only None (unknown) defaults to 1.0.
        return sorted(
            shown,
            key=lambda claim: (
                -(
                    claim["confidence"]
                    if isinstance(claim.get("confidence"), int | float)
                    else 1.0
                )
            ),
        )

    @property
    def clean(self) -> bool:
        return not (self.quotes_missing or self.flagged_claims or self.unfetched)


def pinned_text(
    repo: str | None, item: dict[str, Any], *, getter, token, cache: Path
) -> str:
    """The cited document's text. A blob is immutable, so its text is cached by SHA."""
    blob_sha = item.get("blob_sha")
    if item.get("kind") == "git_blob" and isinstance(blob_sha, str) and repo:
        cached = cache / blob_sha
        if cached.is_file():
            return cached.read_text(encoding="utf-8")
        text = _decode(getter(f"/repos/{repo}/git/blobs/{blob_sha}", token))
        cache.mkdir(parents=True, exist_ok=True)
        cached.write_text(text, encoding="utf-8")
        return text
    return fetch_web_text(str(item.get("url") or ""))


def check_block(
    key: str,
    repo: str | None,
    triage: dict[str, Any],
    *,
    getter=github_get,
    token: str | None = None,
    cache: Path = CACHE,
    api_key: str | None = None,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> BlockReport:
    report = BlockReport(key)
    documents: dict[str, str] = {}
    drifted_labels: set[str] = set()
    for item in triage.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label"))
        try:
            text = pinned_text(repo, item, getter=getter, token=token, cache=cache)
        except Exception as error:
            report.unfetched.append(f"{label}: {type(error).__name__}")
            continue
        if content_hash(text) != item.get("content_sha256"):
            if item.get("kind") == "git_blob":
                # A blob cannot change, so this is not drift: the record pins a blob and
                # a digest that do not describe the same bytes. The blob is still the
                # pinned document, so quotes and claims are checked against it.
                report.mismatched.append(label)
            else:
                report.drifted.append(label)
                drifted_labels.add(label)
        documents[label] = text
    finding = str(triage.get("finding") or "")
    report.quotes_checked, missing = quote_report(finding, documents)
    # A drifted source cannot convict a quote: the words may have been there when pinned.
    if report.drifted:
        report.quotes_missing = []
        report.drifted = (
            [
                f"{label} ({len(missing)} quote(s) unverifiable)"
                for label in report.drifted
            ]
            if missing
            else report.drifted
        )
    else:
        report.quotes_missing = missing
    # The same rule for claims: a sentence written about the pinned page is not
    # contradicted by whatever the page says today. Judge against unchanged documents only.
    pinned = {
        label: text for label, text in documents.items() if label not in drifted_labels
    }
    if api_key and pinned:
        try:
            report.claims = judge_claims(finding, pinned, key=api_key, opener=opener)
        except Exception as error:
            report.claims_error = type(error).__name__
    return report


def render(
    reports: list[BlockReport], *, judged: bool, min_confidence: float = MIN_CONFIDENCE
) -> str:
    lines = []
    for report in reports:
        listed = report.listed_claims(min_confidence)
        if not (
            report.quotes_missing
            or report.unfetched
            or report.drifted
            or report.mismatched
            or report.claims_error
            or listed
        ):
            continue
        lines.append(report.key)
        lines.extend(
            f"  QUOTE NOT IN SOURCE: {q[:160]!r}" for q in report.quotes_missing
        )
        lines.extend(f"  source changed since pinned: {d}" for d in report.drifted)
        lines.extend(
            f"  RECORD INCONSISTENT: {m} pins a blob whose text does not hash to its content_sha256"
            for m in report.mismatched
        )
        lines.extend(f"  could not fetch: {u}" for u in report.unfetched)
        for claim in listed:
            confidence = claim.get("confidence")
            shown = (
                f" ({confidence:.2f})" if isinstance(confidence, int | float) else ""
            )
            lines.append(f"  {claim['choice']}{shown}: {claim['sentence'][:200]}")
        if report.claims_error:
            lines.append(f"  claims not judged: {report.claims_error}")
    quotes = sum(r.quotes_checked for r in reports)
    missing = sum(len(r.quotes_missing) for r in reports)
    lines.append(
        f"{len(reports)} finding(s); {quotes} quote(s) checked, {missing} not in source"
    )
    if judged:
        claims = sum(len(r.claims) for r in reports)
        flagged = sum(len(r.flagged_claims) for r in reports)
        listed_total = sum(len(r.listed_claims(min_confidence)) for r in reports)
        lines.append(
            f"{claims} sentence(s) judged by {rank_signals.MODEL}; {listed_total} flagged at "
            f"confidence {min_confidence:g} or above, {flagged - listed_total} below it and "
            "not listed; a flag is a place to look, not a conclusion"
        )
    else:
        lines.append(f"claims not judged: no {rank_signals.KEY_NAME}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--repo", action="append", help="check only this owner/name")
    parser.add_argument(
        "--quotes-only", action="store_true", help="skip the typed-judgment layer"
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=MIN_CONFIDENCE,
        help="list judged flags at or above this confidence (0 lists every flag)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit 1 when a quote is not in its source (judged claims never fail a run)",
    )
    args = parser.parse_args(argv)
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))["candidates"]
    api_key = None if args.quotes_only else rank_signals.load_api_key()
    token = github_token()
    reports = [
        check_block(
            str(candidate.get("repo") or candidate.get("name")),
            candidate.get("repo"),
            candidate["triage"],
            token=token,
            api_key=api_key,
        )
        for candidate in candidates
        if isinstance(candidate.get("triage"), dict)
        and (not args.repo or candidate.get("repo") in args.repo)
    ]
    print(render(reports, judged=bool(api_key), min_confidence=args.min_confidence))
    if args.strict and any(report.quotes_missing for report in reports):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
