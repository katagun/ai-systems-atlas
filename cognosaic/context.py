from __future__ import annotations

from dataclasses import asdict, dataclass

from .index import BrainIndex, SearchResult


@dataclass(slots=True)
class ContextPack:
    query: str
    text: str
    citations: list[dict[str, object]]
    estimated_tokens: int
    truncated: bool


def _estimate_tokens(text: str) -> int:
    # Deliberately conservative and model-independent.
    return max(1, len(text) // 4)


def build_context_pack(
    index: BrainIndex,
    query: str,
    *,
    token_budget: int = 1800,
    limit: int = 12,
    include_inactive: bool = False,
    as_of: str | None = None,
) -> ContextPack:
    results = index.search(
        query,
        limit=limit,
        include_inactive=include_inactive,
        as_of=as_of,
    )
    header = (
        f"# Cognosaic context pack\n\n"
        f"Query: {query}\n\n"
        "Use only claims supported by the cited records. Distinguish direct evidence from inference.\n"
    )
    chunks: list[str] = [header]
    citations: list[dict[str, object]] = []
    truncated = False
    current_tokens = _estimate_tokens(header)

    for result in results:
        chunk = _render_result(result)
        chunk_tokens = _estimate_tokens(chunk)
        if current_tokens + chunk_tokens > token_budget:
            truncated = True
            continue
        chunks.append(chunk)
        current_tokens += chunk_tokens
        citations.append(
            {
                "record_id": result.id,
                "citation": result.citation,
                "title": result.title,
                "path": result.path,
                "score": result.score,
                "sources": result.sources,
            }
        )

    if not citations:
        chunks.append("\nNo supporting records fit the query and budget.\n")
    return ContextPack(
        query=query,
        text="\n".join(chunks).rstrip() + "\n",
        citations=citations,
        estimated_tokens=current_tokens,
        truncated=truncated,
    )


def _render_result(result: SearchResult) -> str:
    source_text = ", ".join(result.sources) if result.sources else "local record"
    return (
        f"\n## {result.title} {result.citation}\n"
        f"Type: {result.record_type} | Confidence: {result.confidence:.2f} | Source: {source_text}\n\n"
        f"{result.excerpt}\n"
    )
