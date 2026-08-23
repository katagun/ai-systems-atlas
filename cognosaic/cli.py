from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from .api import serve
from .brief import build_brief
from .context import build_context_pack
from .index import BrainIndex
from .paths import BrainPaths
from .vault import Vault


def _csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def _read_content(args: argparse.Namespace) -> str:
    if getattr(args, "content_file", None):
        return Path(args.content_file).expanduser().read_text(encoding="utf-8")
    if getattr(args, "content", None) is not None:
        return args.content
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise ValueError("provide --content, --content-file, or pipe content on stdin")


def _paths(args: argparse.Namespace) -> BrainPaths:
    return BrainPaths.from_root(args.home)


def command_init(args: argparse.Namespace) -> int:
    paths = _paths(args)
    paths.ensure()
    count = BrainIndex(paths).rebuild(Vault(paths))
    print(json.dumps({"home": str(paths.root), "indexed": count}, indent=2))
    return 0


def command_remember(args: argparse.Namespace) -> int:
    paths = _paths(args)
    vault = Vault(paths)
    record = vault.create(
        title=args.title,
        content=_read_content(args),
        record_type=args.type,
        tags=_csv(args.tags),
        sources=_csv(args.sources),
        links=_csv(args.links),
        confidence=args.confidence,
        origin=args.origin,
        valid_from=args.valid_from,
    )
    path = vault.find_path(record.id)
    if path:
        BrainIndex(paths).upsert(record, path)
    print(json.dumps(asdict(record), ensure_ascii=False, indent=2))
    return 0


def command_import(args: argparse.Namespace) -> int:
    paths = _paths(args)
    vault = Vault(paths)
    index = BrainIndex(paths)
    imported = []
    for raw in args.paths:
        source = Path(raw).expanduser()
        if source.is_dir():
            files = [path for path in source.rglob("*") if path.is_file() and path.suffix.lower() in {".md", ".txt"}]
        else:
            files = [source]
        for file_path in files:
            record = vault.import_text_file(file_path, tags=_csv(args.tags))
            path = vault.find_path(record.id)
            if path:
                index.upsert(record, path)
            imported.append(record.id)
    print(json.dumps({"imported": imported, "count": len(imported)}, indent=2))
    return 0


def command_search(args: argparse.Namespace) -> int:
    results = BrainIndex(_paths(args)).search(
        args.query,
        limit=args.limit,
        include_inactive=args.include_inactive,
        record_types=_csv(args.types),
        tags=_csv(args.tags),
        as_of=args.as_of,
    )
    if args.json:
        print(json.dumps([asdict(item) | {"citation": item.citation} for item in results], ensure_ascii=False, indent=2))
        return 0
    for item in results:
        print(f"{item.score:.3f}  {item.citation}  {item.title} [{item.record_type}]")
        if item.excerpt:
            print("  " + item.excerpt.replace("\n", "\n  "))
    return 0


def command_context(args: argparse.Namespace) -> int:
    pack = build_context_pack(
        BrainIndex(_paths(args)),
        args.query,
        token_budget=args.budget,
        limit=args.limit,
        include_inactive=args.include_inactive,
        as_of=args.as_of,
    )
    if args.json:
        print(json.dumps(asdict(pack), ensure_ascii=False, indent=2))
    else:
        print(pack.text, end="")
    return 0


def command_supersede(args: argparse.Namespace) -> int:
    paths = _paths(args)
    vault = Vault(paths)
    record = vault.supersede(
        args.old_id,
        title=args.title,
        content=_read_content(args),
        record_type=args.type,
        tags=_csv(args.tags) if args.tags is not None else None,
        sources=_csv(args.sources) if args.sources is not None else None,
        confidence=args.confidence,
        origin=args.origin,
    )
    BrainIndex(paths).rebuild(vault)
    print(json.dumps(asdict(record), ensure_ascii=False, indent=2))
    return 0


def command_archive(args: argparse.Namespace) -> int:
    paths = _paths(args)
    destination = Vault(paths).archive(args.record_id)
    BrainIndex(paths).rebuild(Vault(paths))
    print(destination)
    return 0


def command_delete(args: argparse.Namespace) -> int:
    if not args.yes:
        raise ValueError("hard deletion requires --yes; use archive for reversible removal")
    paths = _paths(args)
    Vault(paths).hard_delete(args.record_id)
    BrainIndex(paths).rebuild(Vault(paths))
    print(args.record_id)
    return 0


def command_reindex(args: argparse.Namespace) -> int:
    paths = _paths(args)
    print(BrainIndex(paths).rebuild(Vault(paths)))
    return 0


def command_brief(args: argparse.Namespace) -> int:
    print(build_brief(BrainIndex(_paths(args)), days=args.days), end="")
    return 0


def command_backup(args: argparse.Namespace) -> int:
    destination = Path(args.destination or "cognosaic-backup")
    print(Vault(_paths(args)).backup(destination))
    return 0


def command_serve(args: argparse.Namespace) -> int:
    serve(_paths(args), host=args.host, port=args.port)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cognosaic", description="Local-first, provenance-aware second brain")
    parser.add_argument("--home", help="brain directory (default: COGNOSAIC_HOME or ~/.cognosaic)")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="initialize the vault and index")
    init.set_defaults(func=command_init)

    remember = sub.add_parser("remember", help="create a canonical memory record")
    remember.add_argument("--title", required=True)
    remember.add_argument("--content")
    remember.add_argument("--content-file")
    remember.add_argument("--type", default="note", choices=["note", "observation", "decision", "project", "person", "task", "source", "claim", "event"])
    remember.add_argument("--tags")
    remember.add_argument("--sources")
    remember.add_argument("--links")
    remember.add_argument("--confidence", type=float, default=1.0)
    remember.add_argument("--origin", default="human")
    remember.add_argument("--valid-from")
    remember.set_defaults(func=command_remember)

    ingest = sub.add_parser("import", help="import Markdown or text files")
    ingest.add_argument("paths", nargs="+")
    ingest.add_argument("--tags")
    ingest.set_defaults(func=command_import)

    search = sub.add_parser("search", help="hybrid lexical, temporal, confidence, and graph-aware retrieval")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--types")
    search.add_argument("--tags")
    search.add_argument("--as-of")
    search.add_argument("--include-inactive", action="store_true")
    search.add_argument("--json", action="store_true")
    search.set_defaults(func=command_search)

    context = sub.add_parser("context", help="build a bounded, cited context pack")
    context.add_argument("query")
    context.add_argument("--budget", type=int, default=1800)
    context.add_argument("--limit", type=int, default=12)
    context.add_argument("--as-of")
    context.add_argument("--include-inactive", action="store_true")
    context.add_argument("--json", action="store_true")
    context.set_defaults(func=command_context)

    supersede = sub.add_parser("supersede", help="replace a fact without destroying history")
    supersede.add_argument("old_id")
    supersede.add_argument("--title", required=True)
    supersede.add_argument("--content")
    supersede.add_argument("--content-file")
    supersede.add_argument("--type")
    supersede.add_argument("--tags")
    supersede.add_argument("--sources")
    supersede.add_argument("--confidence", type=float)
    supersede.add_argument("--origin", default="human")
    supersede.set_defaults(func=command_supersede)

    archive = sub.add_parser("archive", help="reversibly archive a record")
    archive.add_argument("record_id")
    archive.set_defaults(func=command_archive)

    delete = sub.add_parser("delete", help="irreversibly delete a record and leave a tombstone")
    delete.add_argument("record_id")
    delete.add_argument("--yes", action="store_true")
    delete.set_defaults(func=command_delete)

    reindex = sub.add_parser("reindex", help="rebuild the derived SQLite/FTS index")
    reindex.set_defaults(func=command_reindex)

    brief = sub.add_parser("brief", help="generate a deterministic recent-memory brief")
    brief.add_argument("--days", type=int, default=7)
    brief.set_defaults(func=command_brief)

    backup = sub.add_parser("backup", help="create a ZIP backup of the canonical vault")
    backup.add_argument("--destination")
    backup.set_defaults(func=command_backup)

    server = sub.add_parser("serve", help="run the loopback-only directory and second-brain web app")
    server.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost", "::1"])
    server.add_argument("--port", type=int, default=8765)
    server.set_defaults(func=command_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except (ValueError, KeyError, FileNotFoundError, RuntimeError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
