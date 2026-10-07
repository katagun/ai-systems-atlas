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

try:
    from .build_blog import blog_sitemap_entries
    from .catalog import SHARE_DIRECTORIES
    from .lab_relations import lab_relations
    from .page_shell import SITE_NAME, SITE_TAGLINE, SITE_URL, STYLE
except ImportError:  # Direct script execution places scripts/ on sys.path.
    from build_blog import blog_sitemap_entries
    from catalog import SHARE_DIRECTORIES
    from lab_relations import lab_relations
    from page_shell import SITE_NAME, SITE_TAGLINE, SITE_URL, STYLE

ROOT = Path(__file__).resolve().parents[1]
RECORD_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# kind (as in the application's record URL) -> (directory under web/records, catalog key)
COLLECTIONS = SHARE_DIRECTORIES
COLLECTION_LABELS = {
    "system": "System",
    "spec": "Specification",
    "inference": "Inference service",
    "runtime": "Local runtime",
    "model": "Model",
    "pack": "Agent pack",
    "lab": "Lab",
    "robot": "Robot",
}

# ADR 042: a reviewed model's share page carries the dialog's "Risk statements"
# section in the same words (web/app-core.js flagSentence and riskStatementView).
# The kind's source of truth is MAKER_RISK_FLAG in scripts/validate_directory.py,
# which this generator does not import.
MAKER_RISK_FLAG = "maker_risk_safeguards"
FLAG_DISCLAIMER = "This is the developer's own statement, not an Atlas risk rating."
FLAG_NO_STATEMENT_TEXT = (
    "The developer publishes no risk-threshold statement for this release. "
    "Absence is not evidence of safety."
)
FLAG_NOT_EXAMINED_TEXT = "Not yet examined."
RISK_STYLE = """
.risk-statements { margin: 0 0 1.5rem; }
.risk-statements h2 { margin: 0 0 .5rem; font: 600 1.15rem/1.3 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
.risk-statements h3 { margin: 0 0 .5rem; font-size: 1rem; font-weight: 600; }
.risk-statements p { margin: 0 0 .5rem; }
.risk-statements blockquote { margin: 0 0 .75rem; padding: .1rem 0 .1rem 1rem; border-left: 3px solid var(--line); }
.risk-statements dl { margin: 0 0 .75rem; }
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
        "models": read("models.json")["models"],
        "packs": read("packs.json")["packs"],
        "labs": read("labs.json")["labs"],
        "robots": read("robots.json")["robots"],
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


def _join_plain(items: list[str]) -> str:
    if len(items) < 2:
        return "".join(items)
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def flag_sentence(entry: dict, developer: str, taxonomy: dict) -> str:
    """The sentence web/app-core.js flagSentence builds for a found statement."""
    domains = _join_plain(
        [
            taxonomy_name(taxonomy, "flag_domains", item).lower()
            for item in entry["domains"]
        ]
    )
    if entry["determination"] == "determined":
        claim = f"{developer} states that this release reached “{entry['tier_term']}” in {domains} capability."
    else:
        claim = f"{developer} names this release against “{entry['tier_term']}” in {domains} capability, as a precaution."
    scope = taxonomy_name(taxonomy, "flag_scopes", entry["scope"])
    return f"{claim} The statement covers {scope[:1].lower()}{scope[1:]}. {FLAG_DISCLAIMER}"


def _flag_source_html(entry: dict, taxonomy: dict) -> str:
    confidence = taxonomy_name(
        taxonomy, "research_confidence_levels", entry["research_confidence"]
    )
    label = (
        "Read the developer's statement"
        if entry["status"] == "statement_found"
        else "Page the reviewer checked"
    )
    return (
        f'<p class="note"><a href="{html.escape(entry["url"])}" rel="noreferrer">'
        f"{html.escape(label)} ↗</a> · {html.escape(entry['verified_at'])} · "
        f"Research confidence: {html.escape(confidence)}</p>"
    )


def _found_statement_html(entry: dict, developer: str, taxonomy: dict) -> str:
    determination = taxonomy_name(
        taxonomy, "flag_determinations", entry["determination"]
    )
    domains = names(taxonomy, "flag_domains", entry["domains"])
    scope = taxonomy_name(taxonomy, "flag_scopes", entry["scope"])
    sentence = flag_sentence(entry, developer, taxonomy)
    return (
        f"<h3>“{html.escape(entry['tier_term'])}” · {html.escape(determination)}</h3>"
        f"<blockquote>{html.escape(entry['statement'])}</blockquote>"
        f"<dl><dt>Risk areas</dt><dd>{html.escape(domains)}</dd>"
        f"<dt>Covers</dt><dd>{html.escape(scope)}</dd></dl>"
        f'{_flag_source_html(entry, taxonomy)}<p class="note">{html.escape(sentence)}</p>'
    )


def risk_statements_html(record: dict, taxonomy: dict) -> str:
    """A reviewed model's "Risk statements" section in one of its three states."""
    entry = next(
        (
            item
            for item in record.get("flags", [])
            if item.get("kind") == MAKER_RISK_FLAG
        ),
        None,
    )
    if entry is None:
        body = f"<p>{FLAG_NOT_EXAMINED_TEXT}</p>"
    elif entry["status"] == "no_statement_found":
        body = f"<p>{FLAG_NO_STATEMENT_TEXT}</p>{_flag_source_html(entry, taxonomy)}"
    else:
        body = _found_statement_html(entry, record["developer"], taxonomy)
    return (
        '<section class="risk-statements" aria-labelledby="risk-statements">'
        f'<h2 id="risk-statements">Risk statements</h2>{body}</section>'
    )


def _lab_facts(
    record: dict, taxonomy: dict, catalog: dict
) -> tuple[str, str, list[tuple[str, str]], str, str]:
    """A lab's facts, with its other records joined by name as the app joins them (ADR 041)."""
    relations = lab_relations(record, catalog)
    facts = [
        ("Headquarters", taxonomy_name(taxonomy, "countries", record["headquarters"])),
    ]
    if record.get("research_locations"):
        # Where the work happens is a separate fact from where the entity is
        # (ADR 052), so a share page prints it as one rather than folding it in.
        facts.append(
            (
                "Work also happens in",
                names(taxonomy, "countries", record["research_locations"]),
            )
        )
    if record.get("parent_organization"):
        facts.append(("Parent organization", record["parent_organization"]))
    facts += [
        ("Named in the catalog as", " · ".join(record["catalog_names"])),
        ("Reviewed model releases", str(len(relations["models"]))),
    ]
    for label, key in (
        ("Systems", "systems"),
        ("Inference services", "services"),
        ("Robots", "robots"),
    ):
        if relations[key]:
            facts.append(
                (label, " · ".join(sorted(item["name"] for item in relations[key])))
            )
    framework = record.get("safety_framework")
    facts += [
        ("Safety framework", framework["title"] if framework else "None recorded"),
        ("How it is organized", record["organization_note"]),
    ]
    return (
        taxonomy_name(taxonomy, "lab_types", record["lab_type"]),
        record["description"],
        facts,
        "Organization",
        "Open official site",
    )


def _facts_for(
    kind: str, record: dict, taxonomy: dict, by_id: dict, catalog: dict | None = None
) -> tuple[str, str, list[tuple[str, str]], str, str]:
    """Return (eyebrow, lead, facts, about_type, official_label)."""
    if kind == "lab":
        return _lab_facts(record, taxonomy, catalog or {})
    if kind == "system":
        eyebrow = f"{taxonomy_name(taxonomy, 'system_families', record['system_family'])} · {taxonomy_name(taxonomy, 'primary_roles', record['primary_role'])}"
        facts = [
            (
                "Source model",
                taxonomy_name(taxonomy, "source_models", record["source_model"]),
            ),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Deployment", names(taxonomy, "deployment_modes", record["deployment"])),
            ("Status", humanize(record["status"])),
        ]
        successor = by_id.get(record.get("superseded_by") or "")
        if record.get("status") == "superseded" and successor:
            facts.append(
                (
                    "Superseded by",
                    f'<a href="../{html.escape(successor["id"])}/">{html.escape(successor["name"])}</a>',
                )
            )
        if record.get("current_repo_note"):
            facts.append(("Product boundary", record["current_repo_note"]))
        return (
            eyebrow,
            record["why_it_matters"],
            facts,
            "SoftwareApplication",
            "Open repository" if record.get("repo") else "Open official product",
        )
    if kind == "spec":
        eyebrow = f"{taxonomy_name(taxonomy, 'specification_types', record['specification_type'])} · {taxonomy_name(taxonomy, 'specification_scopes', record['scope'])}"
        facts = [
            (
                "Status",
                taxonomy_name(taxonomy, "specification_statuses", record["status"]),
            ),
            ("Version", record.get("current_version") or "Rolling / unversioned"),
            ("Steward", " · ".join(record["stewards"])),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Standardizes", record["standardizes"]),
        ]
        return (
            eyebrow,
            record["description"],
            facts,
            "CreativeWork",
            "Open official specification",
        )
    if kind == "inference":
        eyebrow = taxonomy_name(
            taxonomy, "inference_service_types", record["service_type"]
        )
        facts = [
            ("Operator", record["operator"]),
            (
                "Delivery",
                names(taxonomy, "inference_delivery_modes", record["delivery_modes"]),
            ),
            (
                "Model sources",
                names(taxonomy, "inference_model_sources", record["model_sources"]),
            ),
            (
                "API styles",
                names(taxonomy, "inference_api_styles", record["api_styles"]),
            ),
            ("Boundary", record["service_boundary"]),
        ]
        return (
            eyebrow,
            record["description"],
            facts,
            "Service",
            "Open official service documentation",
        )
    if kind == "model":
        eyebrow = taxonomy_name(taxonomy, "model_types", record["model_type"])
        facts = [
            ("Developer", record["developer"]),
            (
                "Distribution",
                names(
                    taxonomy, "model_distribution_modes", record["distribution_modes"]
                ),
            ),
            (
                "Artifact licensing",
                next(
                    item["model_name"]
                    for item in taxonomy["source_models"]
                    if item["id"] == record["source_model"]
                ),
            ),
            (
                "License scope",
                "Reviewed release artifacts and mandatory terms; not an assessment of training code or training data openness.",
            ),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Boundary", record["access_boundary"]),
        ]
        return (
            eyebrow,
            record["description"],
            facts,
            "SoftwareSourceCode",
            "Open official model page",
        )
    if kind == "pack":
        eyebrow = taxonomy_name(taxonomy, "pack_types", record["pack_type"])
        facts = [
            ("Steward", record["steward"]),
            ("Hosts", names(taxonomy, "pack_hosts", record["hosts"])),
            (
                "Install",
                taxonomy_name(
                    taxonomy, "pack_install_mechanisms", record["install_mechanism"]
                ),
            ),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Status", humanize(record["status"])),
            ("Installs", record["installs"]),
        ]
        return eyebrow, record["description"], facts, "CreativeWork", "Open repository"
    if kind == "robot":
        # render_page() already prefixes the eyebrow with COLLECTION_LABELS[kind]
        # ("Robot"); this branch supplies only the form factor, not the label
        # again, or the page reads "Robot · Robot · Humanoid".
        eyebrow = taxonomy_name(taxonomy, "robot_form_factors", record["form_factor"])
        facts = [
            ("Maker", record["manufacturer"]),
            (
                "Availability",
                taxonomy_name(taxonomy, "robot_availability", record["availability"]),
            ),
            (
                "Models the vendor names",
                "; ".join(
                    f"{model['name']} (vendor-stated): {model['role_note']}"
                    for model in record["named_models"]
                )
                or "None named by the maker",
            ),
            (
                "Runs your own models",
                "Yes, by a route the maker documents"
                if "open_model_interface" in record["ai_basis"]
                else "Not documented by the maker",
            ),
            ("Status", humanize(record["status"])),
            ("Not verified", record["not_verified"]),
        ]
        return eyebrow, record["description"], facts, "Product", "Open official page"
    eyebrow = taxonomy_name(taxonomy, "local_runtime_types", record["runtime_type"])
    facts = [
        ("Maintainer", record["maintainer"]),
        (
            "Accelerators",
            names(taxonomy, "runtime_accelerators", record["accelerators"]),
        ),
        (
            "Model formats",
            names(taxonomy, "runtime_model_formats", record["model_formats"]),
        ),
        (
            "Source model",
            taxonomy_name(taxonomy, "source_models", record["source_model"]),
        ),
        ("Licenses", names(taxonomy, "licenses", record["licenses"])),
        ("Boundary", record["runtime_boundary"]),
    ]
    return (
        eyebrow,
        record["description"],
        facts,
        "SoftwareApplication",
        "Open official documentation",
    )


def render_page(
    kind: str, record: dict, taxonomy: dict, by_id: dict, catalog: dict | None = None
) -> str:
    eyebrow, lead, facts, about_type, official_label = _facts_for(
        kind, record, taxonomy, by_id, catalog
    )
    name, url = record["name"], share_page_url(kind, record["id"])
    description = preview_description(record["description"])
    about: dict = {
        "@type": about_type,
        "name": name,
        "url": record["url"],
        "description": description,
    }
    if kind == "inference":
        about["provider"] = {"@type": "Organization", "name": record["operator"]}
    if kind == "model":
        about["creator"] = {"@type": "Organization", "name": record["developer"]}
    if kind == "lab" and record.get("parent_organization"):
        about["parentOrganization"] = {
            "@type": "Organization",
            "name": record["parent_organization"],
        }
    if record.get("repo"):
        about["sameAs"] = f"https://github.com/{record['repo']}"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": name,
        "description": description,
        "url": url,
        "dateModified": record["verified_at"],
        "isPartOf": {
            "@type": "WebSite",
            "name": SITE_NAME,
            "alternateName": SITE_TAGLINE,
            "url": SITE_URL,
        },
        "about": about,
    }
    # Escaping "<" keeps the JSON-LD payload from closing its own <script> element.
    # It stays outside the f-string: a backslash in an f-string expression is a
    # syntax error before Python 3.12, and this project supports 3.11.
    json_ld_script = json.dumps(json_ld, ensure_ascii=False).replace("<", "\\u003c")
    escaped_facts = [
        (label, value if label == "Superseded by" else html.escape(value))
        for label, value in facts
    ]
    facts_html = "".join(
        f"<dt>{html.escape(label)}</dt><dd>{value}</dd>"
        for label, value in escaped_facts
    )
    repo_link = (
        f' <a href="https://github.com/{html.escape(record["repo"])}" rel="noreferrer">Repository ↗</a>'
        if record.get("repo")
        and kind != "system"
        and record.get("url") != f"https://github.com/{record['repo']}"
        else ""
    )
    # The section sits on its own line between the facts and the actions.
    risk_html = f"{risk_statements_html(record, taxonomy)}\n" if kind == "model" else ""
    style = f"{STYLE}\n{RISK_STYLE}" if risk_html else STYLE
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
{style}
</style>
<script type="application/ld+json">{json_ld_script}</script>
</head>
<body>
<main>
<p class="eyebrow">{html.escape(COLLECTION_LABELS[kind])} · {html.escape(eyebrow)}</p>
<h1>{html.escape(name)}</h1>
<p class="lead">{html.escape(lead)}</p>
<dl>{facts_html}</dl>
{risk_html}<p class="actions"><a class="primary" href="../../../?record={kind}:{html.escape(record["id"])}">Open in the directory →</a> <a href="{html.escape(record["url"])}" rel="noreferrer">{official_label} ↗</a>{repo_link}</p>
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
            pages[path] = render_page(kind, record, taxonomy, by_id, catalog)
            entries.append((share_page_url(kind, record["id"]), record["verified_at"]))
    # The blog module owns its pages; this module owns the sitemap, so it asks
    # rather than duplicating any knowledge of where posts live.
    entries.extend(blog_sitemap_entries(ROOT))
    entries.sort()
    locs = "".join(
        f"  <url><loc>{html.escape(loc)}</loc><lastmod>{html.escape(lastmod)}</lastmod></url>\n"
        for loc, lastmod in entries
    )
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
        problems = [
            f"web/{path} is missing or stale"
            for path, content in pages.items()
            if not (web / path).exists()
            or (web / path).read_text(encoding="utf-8") != content
        ]
        records_dir = web / "records"
        if records_dir.exists():
            committed = {
                str(path.relative_to(web))
                for path in records_dir.rglob("*")
                if path.is_file()
            }
            problems += [
                f"web/{path} is not produced by the catalog"
                for path in sorted(committed - set(pages))
            ]
        if problems:
            print(
                "\n".join(
                    problems[:20]
                    + (
                        [f"… and {len(problems) - 20} more"]
                        if len(problems) > 20
                        else []
                    )
                ),
                file=sys.stderr,
            )
            print(
                "Run `uv run python scripts/build_share_pages.py` and commit the result.",
                file=sys.stderr,
            )
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
