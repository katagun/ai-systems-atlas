from __future__ import annotations

import json
import math
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

from .models import Record
from .paths import BrainPaths
from .vault import Vault

_TOKEN = re.compile(r"[\w-]+", re.UNICODE)


@dataclass(slots=True)
class SearchResult:
    id: str
    title: str
    record_type: str
    status: str
    content: str
    tags: list[str]
    sources: list[str]
    created_at: str
    updated_at: str
    valid_from: str | None
    valid_to: str | None
    confidence: float
    path: str
    score: float
    score_parts: dict[str, float]
    excerpt: str
    line_start: int
    line_end: int

    @property
    def citation(self) -> str:
        return f"[cog:{self.id}:L{self.line_start}-L{self.line_end}]"


class BrainIndex:
    def __init__(self, paths: BrainPaths):
        self.paths = paths
        self.paths.ensure()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.paths.index)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    @staticmethod
    def _schema(connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                record_type TEXT NOT NULL,
                status TEXT NOT NULL,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                links_json TEXT NOT NULL,
                supersedes_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                valid_from TEXT,
                valid_to TEXT,
                confidence REAL NOT NULL,
                path TEXT NOT NULL,
                metadata_json TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
                id UNINDEXED,
                title,
                content,
                tags,
                tokenize='unicode61 remove_diacritics 2'
            );
            CREATE TABLE IF NOT EXISTS links (
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                relation TEXT NOT NULL,
                PRIMARY KEY (source_id, target_id, relation)
            );
            CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
            CREATE INDEX IF NOT EXISTS idx_records_type ON records(record_type);
            CREATE INDEX IF NOT EXISTS idx_records_validity ON records(valid_from, valid_to);
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
            """
        )

    def rebuild(self, vault: Vault | None = None) -> int:
        vault = vault or Vault(self.paths)
        connection = self.connect()
        try:
            self._schema(connection)
            connection.execute("DELETE FROM records")
            connection.execute("DELETE FROM records_fts")
            connection.execute("DELETE FROM links")
            count = 0
            for record, path in vault.iter_records(include_archive=True):
                self._insert(connection, record, path)
                count += 1
            connection.commit()
        finally:
            connection.close()
        vault.append_event("index.rebuilt", "index", records=count)
        return count

    @staticmethod
    def _insert(connection: sqlite3.Connection, record: Record, path: Path) -> None:
        connection.execute(
            """
            INSERT OR REPLACE INTO records (
                id, title, record_type, status, content, tags_json, sources_json,
                links_json, supersedes_json, created_at, updated_at, valid_from,
                valid_to, confidence, path, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.title,
                record.record_type,
                record.status,
                record.content,
                json.dumps(record.tags, ensure_ascii=False),
                json.dumps(record.sources, ensure_ascii=False),
                json.dumps(record.links, ensure_ascii=False),
                json.dumps(record.supersedes, ensure_ascii=False),
                record.created_at,
                record.updated_at,
                record.valid_from,
                record.valid_to,
                record.confidence,
                str(path),
                json.dumps(record.metadata(), ensure_ascii=False, sort_keys=True),
            ),
        )
        connection.execute("DELETE FROM records_fts WHERE id = ?", (record.id,))
        connection.execute(
            "INSERT INTO records_fts (id, title, content, tags) VALUES (?, ?, ?, ?)",
            (record.id, record.title, record.content, " ".join(record.tags)),
        )
        for target in record.links:
            connection.execute(
                "INSERT OR IGNORE INTO links (source_id, target_id, relation) VALUES (?, ?, 'links_to')",
                (record.id, target),
            )
        for target in record.supersedes:
            connection.execute(
                "INSERT OR IGNORE INTO links (source_id, target_id, relation) VALUES (?, ?, 'supersedes')",
                (record.id, target),
            )

    def upsert(self, record: Record, path: Path) -> None:
        connection = self.connect()
        try:
            self._schema(connection)
            self._insert(connection, record, path)
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def _fts_query(query: str) -> str:
        tokens = [token for token in _TOKEN.findall(query.lower()) if len(token) > 1]
        if not tokens:
            return ""
        return " OR ".join(f'"{token.replace(chr(34), "")}"' for token in tokens[:20])

    @staticmethod
    def _parse_time(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            return None

    @staticmethod
    def _excerpt(content: str, query_tokens: list[str], max_chars: int = 420) -> tuple[str, int, int]:
        lines = content.splitlines() or [content]
        selected = 0
        for index, line in enumerate(lines):
            lowered = line.lower()
            if any(token in lowered for token in query_tokens):
                selected = index
                break
        start = max(0, selected - 1)
        end = min(len(lines), start + 5)
        excerpt = "\n".join(lines[start:end]).strip()
        if len(excerpt) > max_chars:
            excerpt = excerpt[: max_chars - 1].rstrip() + "…"
        return excerpt, start + 1, end

    def search(
        self,
        query: str,
        *,
        limit: int = 10,
        include_inactive: bool = False,
        record_types: Iterable[str] | None = None,
        tags: Iterable[str] | None = None,
        as_of: str | None = None,
    ) -> list[SearchResult]:
        query = query.strip()
        if not query:
            return []
        query_tokens = [token.lower() for token in _TOKEN.findall(query) if len(token) > 1]
        fts_query = self._fts_query(query)
        requested_types = {item for item in (record_types or []) if item}
        requested_tags = {item.lower() for item in (tags or []) if item}
        as_of_value = as_of or datetime.now(UTC).isoformat()

        connection = self.connect()
        try:
            self._schema(connection)
            params: list[object] = []
            where = ["1=1"]
            if not include_inactive:
                where.append("r.status = 'active'")
            if requested_types:
                placeholders = ",".join("?" for _ in requested_types)
                where.append(f"r.record_type IN ({placeholders})")
                params.extend(sorted(requested_types))
            where.append("(r.valid_from IS NULL OR r.valid_from <= ?)")
            where.append("(r.valid_to IS NULL OR r.valid_to > ?)")
            params.extend([as_of_value, as_of_value])

            if fts_query:
                sql = f"""
                    SELECT r.*, bm25(records_fts, 2.0, 1.0, 1.4) AS rank,
                           (SELECT COUNT(*) FROM links l WHERE l.source_id = r.id OR l.target_id = r.id) AS degree
                    FROM records_fts
                    JOIN records r ON r.id = records_fts.id
                    WHERE records_fts MATCH ? AND {' AND '.join(where)}
                    ORDER BY rank ASC
                    LIMIT ?
                """
                rows = connection.execute(sql, [fts_query, *params, max(limit * 5, 40)]).fetchall()
            else:
                rows = []

            if not rows:
                like = f"%{query}%"
                sql = f"""
                    SELECT r.*, 20.0 AS rank,
                           (SELECT COUNT(*) FROM links l WHERE l.source_id = r.id OR l.target_id = r.id) AS degree
                    FROM records r
                    WHERE (r.title LIKE ? OR r.content LIKE ?) AND {' AND '.join(where)}
                    ORDER BY r.updated_at DESC
                    LIMIT ?
                """
                rows = connection.execute(sql, [like, like, *params, max(limit * 5, 40)]).fetchall()
        finally:
            connection.close()

        now = self._parse_time(as_of_value) or datetime.now(UTC)
        results: list[SearchResult] = []
        for row in rows:
            row_tags = json.loads(row["tags_json"])
            if requested_tags and not requested_tags.intersection(row_tags):
                continue
            title_lower = row["title"].lower()
            content_lower = row["content"].lower()
            exact_title = 1.0 if query.lower() == title_lower else 0.0
            token_hits = sum(1 for token in set(query_tokens) if token in title_lower or token in content_lower)
            coverage = token_hits / max(len(set(query_tokens)), 1)
            raw_rank = float(row["rank"] or 0.0)
            lexical = 1.0 / (1.0 + max(raw_rank, 0.0))
            updated = self._parse_time(row["updated_at"])
            age_days = max((now - updated).total_seconds() / 86400, 0) if updated else 3650
            recency = math.exp(-age_days / 365.0)
            confidence = float(row["confidence"])
            degree = min(float(row["degree"] or 0) / 12.0, 1.0)
            tag_overlap = len(requested_tags.intersection(row_tags)) / max(len(requested_tags), 1) if requested_tags else 0
            score_parts = {
                "lexical": lexical,
                "coverage": coverage,
                "exact_title": exact_title,
                "recency": recency,
                "confidence": confidence,
                "graph": degree,
                "tag_overlap": tag_overlap,
            }
            score = (
                lexical * 0.28
                + coverage * 0.28
                + exact_title * 0.14
                + recency * 0.10
                + confidence * 0.12
                + degree * 0.05
                + tag_overlap * 0.03
            )
            excerpt, line_start, line_end = self._excerpt(row["content"], query_tokens)
            results.append(
                SearchResult(
                    id=row["id"],
                    title=row["title"],
                    record_type=row["record_type"],
                    status=row["status"],
                    content=row["content"],
                    tags=row_tags,
                    sources=json.loads(row["sources_json"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    valid_from=row["valid_from"],
                    valid_to=row["valid_to"],
                    confidence=confidence,
                    path=row["path"],
                    score=round(score, 6),
                    score_parts={key: round(value, 6) for key, value in score_parts.items()},
                    excerpt=excerpt,
                    line_start=line_start,
                    line_end=line_end,
                )
            )
        results.sort(key=lambda item: (item.score, item.updated_at), reverse=True)
        return results[:limit]

    def recent(self, *, limit: int = 20, record_type: str | None = None) -> list[sqlite3.Row]:
        connection = self.connect()
        try:
            self._schema(connection)
            if record_type:
                rows = connection.execute(
                    "SELECT * FROM records WHERE status='active' AND record_type=? ORDER BY updated_at DESC LIMIT ?",
                    (record_type, limit),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM records WHERE status='active' ORDER BY updated_at DESC LIMIT ?", (limit,)
                ).fetchall()
            return rows
        finally:
            connection.close()
