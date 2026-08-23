from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from .index import BrainIndex


def build_brief(index: BrainIndex, *, days: int = 7, limit: int = 40) -> str:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    rows = index.recent(limit=limit)
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        try:
            updated = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if updated < cutoff:
            continue
        grouped.setdefault(row["record_type"], []).append(
            {
                "id": row["id"],
                "title": row["title"],
                "content": row["content"],
                "tags": ", ".join(json.loads(row["tags_json"])),
            }
        )

    order = ["decision", "task", "project", "observation", "claim", "note", "source", "person", "event"]
    lines = [f"# Cognosaic {days}-day brief", ""]
    for record_type in order:
        items = grouped.get(record_type, [])
        if not items:
            continue
        lines.extend([f"## {record_type.replace('_', ' ').title()}s", ""])
        for item in items:
            first = next((line.strip() for line in item["content"].splitlines() if line.strip()), "")
            detail = f" — {first[:180]}" if first else ""
            tags = f" `#{item['tags'].replace(', ', ' #')}`" if item["tags"] else ""
            lines.append(f"- **{item['title']}**{detail}{tags} [cog:{item['id']}]")
        lines.append("")
    if len(lines) == 2:
        lines.append("No recent active records.")
    return "\n".join(lines).rstrip() + "\n"
