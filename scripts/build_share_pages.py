#!/usr/bin/env python3
"""Generate a static share page per published record, plus a sitemap and robots.txt.

The application is one index.html, so a record URL such as ``?record=system:kilo-code``
cannot carry its own title, description, or preview card. This script writes one small
landing page per record under ``web/records/<collection>/<id>/`` with that metadata,
JSON-LD, the record's identity and licensing facts, and a link that opens the record
in the directory. Pages never show scores: a score only means something beside its
profile, which is the application's job.

Run it after any published data change and commit the result. ``--check`` rebuilds in
memory and fails when the committed files differ from what the data would produce.
"""
from __future__ import annotations

import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://peacefulcoexistance.com/"
SITE_NAME = "peacefulcoexistance"
SITE_TAGLINE = "AI systems directory"
RECORD_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# kind (as in the application's record URL) -> (directory under web/records, catalog key)
COLLECTIONS = {
    "system": ("systems", "projects"),
    "spec": ("specifications", "specifications"),
    "inference": ("inference-services", "services"),
    "runtime": ("local-runtimes", "runtimes"),
}
COLLECTION_LABELS = {"system": "System", "spec": "Specification", "inference": "Inference service", "runtime": "Local runtime"}

STYLE = """
:root { color-scheme: light dark; --bg: #f7f9fc; --panel: #ffffff; --text: #16233a; --muted: #5b6b82; --line: #d8e0ea; --accent: #0f766e; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f141b; --panel: #171e28; --text: #e6ebf2; --muted: #9aa7b8; --line: #2a3441; --accent: #3fb8b0; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; }
main { max-width: 44rem; margin: 3rem auto 2rem; padding: 0 1.25rem; }
.eyebrow, dt, footer, .note { font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; }
.eyebrow { margin: 0 0 .5rem; color: var(--accent); font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0 0 .75rem; font: 700 clamp(2rem, 6vw, 3rem)/1.05 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -.02em; text-wrap: balance; }
.lead { margin: 0 0 1.5rem; font-size: 1.1rem; color: var(--muted); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 0 0 1.5rem; padding: 1rem 1.25rem; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
dt { color: var(--muted); font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; padding-top: .2rem; }
dd { margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin: 0 0 1.25rem; }
.primary { display: inline-block; padding: .65rem 1.1rem; background: var(--text); color: var(--bg); border-radius: 999px; font-weight: 600; text-decoration: none; }
.primary:hover { background: var(--accent); }
a { color: var(--accent); }
.note { margin: 0; color: var(--muted); font-size: .78rem; }
footer { max-width: 44rem; margin: 0 auto 3rem; padding: 1rem 1.25rem 0; border-top: 1px solid var(--line); color: var(--muted); font-size: .72rem; }
@media (max-width: 560px) { dl { grid-template-columns: 1fr; gap: .1rem; } dt { margin-top: .5rem; } }
""".strip()


def share_page_path(kind: str, record_id: str) -> str:
    if kind not in COLLECTIONS:
        raise ValueError(f"unknown record kind: {kind}")
    if not RECORD_ID.match(record_id):
        raise ValueError(f"record id is not a plain slug: {record_id}")
    return f"records/{COLLECTIONS[kind][0]}/{record_id}/index.html"


def share_page_url(kind: str, record_id: str) -> str:
    return SITE_URL + share_page_path(kind, record_id).removesuffix("index.html")


def preview_description(text: str, limit: int = 160) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,;:") + "…"


def load_catalog(root: Path = ROOT) -> dict:
    directory = root / "directory"
    def read(name: str) -> dict:
        return json.loads((directory / name).read_text(encoding="utf-8"))

    return {
        "projects": read("projects.json")["projects"],
        "specifications": read("specifications.json")["specifications"],
        "services": read("inference-services.json")["services"],
        "runtimes": read("local-runtimes.json")["runtimes"],
        "taxonomy": read("taxonomy.json"),
    }


def humanize(value: str) -> str:
    return value.replace("_", " ").capitalize()


def taxonomy_name(taxonomy: dict, group: str, value: str) -> str:
    for item in taxonomy.get(group, []):
        if item.get("id") == value:
            return item.get("name", humanize(value))
    return humanize(value)


def names(taxonomy: dict, group: str, values: list[str]) -> str:
    return " · ".join(taxonomy_name(taxonomy, group, value) for value in values)


def _facts_for(kind: str, record: dict, taxonomy: dict, by_id: dict) -> tuple[str, str, list[tuple[str, str]], str, str]:
    """Return (eyebrow, lead, facts, about_type, official_label)."""
    if kind == "system":
        eyebrow = f"{taxonomy_name(taxonomy, 'system_families', record['system_family'])} · {taxonomy_name(taxonomy, 'primary_roles', record['primary_role'])}"
        facts = [
            ("Source model", taxonomy_name(taxonomy, "source_models", record["source_model"])),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Deployment", " · ".join(humanize(item) for item in record["deployment"])),
            ("Status", humanize(record["status"])),
        ]
        successor = by_id.get(record.get("superseded_by") or "")
        if record.get("status") == "superseded" and successor:
            facts.append(("Superseded by", f'<a href="../{html.escape(successor["id"])}/">{html.escape(successor["name"])}</a>'))
        return eyebrow, record["why_it_matters"], facts, "SoftwareApplication", "Open repository" if record.get("repo") else "Open official product"
    if kind == "spec":
        eyebrow = f"{taxonomy_name(taxonomy, 'specification_types', record['specification_type'])} · {taxonomy_name(taxonomy, 'specification_scopes', record['scope'])}"
        facts = [
            ("Status", taxonomy_name(taxonomy, "specification_statuses", record["status"])),
            ("Version", record.get("current_version") or "Rolling / unversioned"),
            ("Steward", " · ".join(record["stewards"])),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Standardizes", record["standardizes"]),
        ]
        return eyebrow, record["description"], facts, "CreativeWork", "Open official specification"
    if kind == "inference":
        eyebrow = f"Inference service · {taxonomy_name(taxonomy, 'inference_service_types', record['service_type'])}"
        facts = [
            ("Operator", record["operator"]),
            ("Delivery", names(taxonomy, "inference_delivery_modes", record["delivery_modes"])),
            ("Model sources", names(taxonomy, "inference_model_sources", record["model_sources"])),
            ("API styles", names(taxonomy, "inference_api_styles", record["api_styles"])),
            ("Boundary", record["service_boundary"]),
        ]
        return eyebrow, record["description"], facts, "Service", "Open official service documentation"
    eyebrow = f"Local runtime · {taxonomy_name(taxonomy, 'local_runtime_types', record['runtime_type'])}"
    facts = [
        ("Maintainer", record["maintainer"]),
        ("Accelerators", names(taxonomy, "runtime_accelerators", record["accelerators"])),
        ("Model formats", names(taxonomy, "runtime_model_formats", record["model_formats"])),
        ("Source model", taxonomy_name(taxonomy, "source_models", record["source_model"])),
        ("Licenses", names(taxonomy, "licenses", record["licenses"])),
        ("Boundary", record["runtime_boundary"]),
    ]
    return eyebrow, record["description"], facts, "SoftwareApplication", "Open official documentation"


def render_page(kind: str, record: dict, taxonomy: dict, by_id: dict) -> str:
    eyebrow, lead, facts, about_type, official_label = _facts_for(kind, record, taxonomy, by_id)
    name, url = record["name"], share_page_url(kind, record["id"])
    description = preview_description(record["description"])
    about: dict = {"@type": about_type, "name": name, "url": record["url"], "description": description}
    if kind == "inference":
        about["provider"] = {"@type": "Organization", "name": record["operator"]}
    if record.get("repo"):
        about["sameAs"] = f"https://github.com/{record['repo']}"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": name,
        "description": description,
        "url": url,
        "dateModified": record["verified_at"],
        "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "alternateName": SITE_TAGLINE, "url": SITE_URL},
        "about": about,
    }
    # Escaping "<" keeps the JSON-LD payload from closing its own <script> element.
    # It stays outside the f-string: a backslash in an f-string expression is a
    # syntax error before Python 3.12, and this project supports 3.11.
    json_ld_script = json.dumps(json_ld, ensure_ascii=False).replace("<", "\\u003c")
    escaped_facts = [(label, value if label == "Superseded by" else html.escape(value)) for label, value in facts]
    facts_html = "".join(f"<dt>{html.escape(label)}</dt><dd>{value}</dd>" for label, value in escaped_facts)
    repo_link = f' <a href="https://github.com/{html.escape(record["repo"])}" rel="noreferrer">Repository ↗</a>' if record.get("repo") and kind != "system" else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(name)} · {SITE_NAME}</title>
<meta name="description" content="{html.escape(description)}">
<link rel="canonical" href="{html.escape(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{html.escape(name)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:url" content="{html.escape(url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f7f9fc">
<link rel="stylesheet" href="../../../fonts.css">
<style>
{STYLE}
</style>
<script type="application/ld+json">{json_ld_script}</script>
</head>
<body>
<main>
<p class="eyebrow">{html.escape(COLLECTION_LABELS[kind])} · {html.escape(eyebrow)}</p>
<h1>{html.escape(name)}</h1>
<p class="lead">{html.escape(lead)}</p>
<dl>{facts_html}</dl>
<p class="actions"><a class="primary" href="../../../?record={kind}:{html.escape(record["id"])}">Open in the directory →</a> <a href="{html.escape(record["url"])}" rel="noreferrer">{official_label} ↗</a>{repo_link}</p>
<p class="note">Editorial ratings appear in the directory beside the profile they belong to and are never compared across collections.</p>
</main>
<footer>{SITE_NAME} · {SITE_TAGLINE} · Reviewed {html.escape(record["verified_at"])} · <a href="../../../">Browse the directory</a></footer>
</body>
</html>
"""


def build_pages(catalog: dict) -> dict[str, str]:
    taxonomy = catalog["taxonomy"]
    pages: dict[str, str] = {}
    entries: list[tuple[str, str]] = []
    for kind, (_, key) in COLLECTIONS.items():
        records = catalog[key]
        by_id = {record["id"]: record for record in records}
        for record in records:
            path = share_page_path(kind, record["id"])
            pages[path] = render_page(kind, record, taxonomy, by_id)
            entries.append((share_page_url(kind, record["id"]), record["verified_at"]))
    entries.sort()
    locs = "".join(f"  <url><loc>{html.escape(loc)}</loc><lastmod>{html.escape(lastmod)}</lastmod></url>\n" for loc, lastmod in entries)
    pages["sitemap.xml"] = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}</loc></url>\n{locs}</urlset>\n"
    )
    pages["robots.txt"] = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n"
    return pages


def main(argv: list[str]) -> int:
    pages = build_pages(load_catalog(ROOT))
    web = ROOT / "web"
    if "--check" in argv:
        problems = [f"web/{path} is missing or stale" for path, content in pages.items()
                    if not (web / path).exists() or (web / path).read_text(encoding="utf-8") != content]
        records_dir = web / "records"
        if records_dir.exists():
            committed = {str(path.relative_to(web)) for path in records_dir.rglob("*") if path.is_file()}
            problems += [f"web/{path} is not produced by the catalog" for path in sorted(committed - set(pages))]
        if problems:
            print("\n".join(problems[:20] + ([f"… and {len(problems) - 20} more"] if len(problems) > 20 else [])), file=sys.stderr)
            print("Run `uv run python scripts/build_share_pages.py` and commit the result.", file=sys.stderr)
            return 1
        print(f"{len(pages)} share files are up to date.")
        return 0
    shutil.rmtree(web / "records", ignore_errors=True)
    for path, content in pages.items():
        target = web / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(f"wrote {len(pages)} share files under web/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
