# App Payload Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the web application a generated, click-shaped projection of the catalogue so a first render costs 43.6 KB gzipped instead of 182.8 KB, while the seven published JSON endpoints stay byte-for-byte unchanged.

**Architecture:** A new Python builder reads the published files under `web/` and writes three classes of artifact under `web/app/`: one small boot payload per collection (what a card, a filter, a sort, and the finder read), one lazily fetched search index per collection, and one detail file per record (everything else). The app loads boot payloads at start, fetches a search index when a search box takes focus, and fetches a record's detail when its dialog or comparison needs it — merging detail into the in-memory record so existing render code is unchanged. Every async path follows the paint-then-repaint pattern already in `web/app.js`.

**Tech Stack:** Python 3.12 (`uv`), dependency-free browser JavaScript, Node's built-in test runner, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-app-payload-split-design.md`

## Global Constraints

- **The seven published endpoints never change.** `projects.json`, `taxonomy.json`, `exclusions.json`, `license-evidence.json`, `specifications.json`, `inference-services.json`, `local-runtimes.json` keep their exact bytes, field set, and pretty-printed formatting. Never add a payload to `PUBLISHED_DATA` in `scripts/validate_directory.py`.
- **`directory/*.json` is never reformatted.** Curation review depends on readable diffs.
- **No new runtime dependency.** The browser app stays dependency-free; the builder uses only the standard library.
- **Payload paths are exactly:** `web/app/<collection>.json`, `web/app/search/<collection>.json`, `web/app/detail/<kind>/<id>.json`. Collections are `systems`, `inference`, `runtimes`, `specifications`. Kinds are `system`, `inference`, `runtime`, `spec` — the values `AtlasCore.parseRecordReference` already uses. Never `web/app/records/`: `web/records/` means share pages.
- **Detail is the complement of boot,** not a curated list: every published field is in boot or in detail, never neither. The single exception is `score`, which appears reduced to `{"overall": n}` in boot and in full in detail.
- **Every builder gets a `--check` mode** that fails on stale or orphaned output, matching `scripts/build_share_pages.py:241-263`.
- **Run before claiming completion:** `uv run ruff check scripts tests`, `uv run python -m unittest discover -s tests`, `uv run python scripts/validate_directory.py`, `npm run lint:js`, `node --test tests/test_web.js`, `node --check web/app-core.js && node --check web/app.js`, `npm run test:e2e`, and every `--check` builder.
- **Re-run the spec's ripple table first.** The analysis is pinned to `5af4f67`; branches touching `web/app.js`, `web/app-core.js`, and `tests/test_web.js` are in flight.

---

### Task 1: Authorize the new artifact class (ADR 025)

`AGENTS.md` currently says "Keep only `projects.json` … synchronized into `web/`". Task 2 violates that sentence as written, so the governing decision lands first.

**Files:**
- Create: `docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md`
- Modify: `AGENTS.md` (routing table, Commands block, hard rules)
- Modify: `tests/test_documentation.py:29-81` (routing manifest)

**Interfaces:**
- Consumes: nothing.
- Produces: the ADR path that every later task's documentation references.

- [ ] **Step 1: Write the failing test**

Add the ADR to the hardcoded manifest in `tests/test_documentation.py`, in the alphabetical position after ADR 024:

```python
            "docs/adr/024-candidate-triage-proposals-are-unaccepted-evidence.md",
            "docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md",
```

- [ ] **Step 2: Run the tests to verify both fail**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: FAIL on `test_task_routing_documents_exist` (the file does not exist) and on `test_routing_documents_are_reachable_from_agents` (it is not named in `AGENTS.md`).

- [ ] **Step 3: Write the ADR**

Create `docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md`. Match the house shape of `docs/adr/013-distinct-collections-share-one-directory-surface.md` — read it first for tone and section headings. It must state:

- **Context.** The seven files under `web/` are a public API: documented at `web/index.html:227`, listed in `web/llms.txt`, licensed CC BY 4.0, fetched by parties the project cannot see. They are also what the page loads, and they are shaped for reading a record, not for rendering a grid — 64% of `projects.json` is prose behind a click. One artifact cannot be both a stable contract and a payload tuned to how the page happens to load today.
- **Decision.** The endpoints are the contract and never change shape for the app's convenience. The app reads a generated projection under `web/app/`, regenerated from the endpoints by `scripts/build_web_payload.py`, carrying no compatibility promise, never advertised in `llms.txt`, the Atlas skill, or the API view's endpoint list, and never added to `PUBLISHED_DATA`.
- **Consequences.** Payload shape may change with any web change and needs no deprecation. The projection must be regenerated wherever `web/` is synchronized, or it ships stale. `web/app/` is committed because `deploy-pages.yml` uploads `web/` with no build step. Agents and API consumers are unaffected by design.
- **Why the complement rule.** Detail is the published record minus the boot fields. A curated drop-list was considered and rejected: an earlier pass proposed dropping nine never-rendered fields from `projects.json`, and `BACKLOG.md` "Render `current_repo_note`, or decide it is not reader-facing" reaches the opposite conclusion about `current_repo_note`, which carries product-boundary prose `docs/CURATION.md` requires reviewers to write and which the backlog wants rendered. A complement rule cannot lose a field.

- [ ] **Step 4: Amend AGENTS.md**

Three edits:

1. Routing table — add a row after the `finder, Directory collections, …` row:

```markdown
| app payloads, page load cost, or the boot/detail split | `docs/WEB.md`, then `docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md` |
```

2. Commands block — add after the `sync_web_data.py` line:

```bash
uv run python scripts/build_web_payload.py
```

3. Hard rules — replace the sentence beginning "Keep only `projects.json`" with:

```markdown
- Keep only `projects.json`, `taxonomy.json`, `exclusions.json`, `license-evidence.json`, `specifications.json`, `inference-services.json`, and `local-runtimes.json` synchronized into `web/`; candidate and license-review queues are not published. Share pages under `web/records/` and app payloads under `web/app/` are generated from those files, never edited by hand, and never published as endpoints. Share pages never show scores.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run python -m unittest tests.test_documentation -v`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md AGENTS.md tests/test_documentation.py
git commit -m "Separate the published endpoints from the app's payload (ADR 025)"
```

---

### Task 2: The payload builder

**Files:**
- Create: `scripts/build_web_payload.py`
- Create: `tests/test_web_payload.py`
- Modify: `scripts/update_directory.py:709` (call the builder after `sync_web_data()`)
- Modify: `.github/workflows/verify.yml` (add a `--check` step)
- Modify: `.github/workflows/update-directory.yml` (add a build step)
- Generated: `web/app/**` (279 files, committed)

**Interfaces:**
- Consumes: ADR 025 from Task 1.
- Produces: `load_catalog(root) -> dict[str, dict]`, `build_payloads(catalog) -> dict[str, str]` mapping a `web/`-relative path to its exact file text, `main(argv) -> int`. `BOOT_FIELDS: dict[str, tuple[str, ...]]` and `SEARCH_FIELDS: dict[str, tuple[str, ...]]` keyed by collection. Task 3 reads the payload paths; Task 5 reads the payload shapes.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_web_payload.py`:

```python
from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts.build_web_payload import BOOT_FIELDS, build_payloads, load_catalog

ROOT = Path(__file__).resolve().parents[1]


class WebPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(ROOT)
        cls.payloads = build_payloads(cls.catalog)

    def test_every_published_field_lands_in_boot_or_detail(self) -> None:
        """Detail is the complement of boot: no field is dropped, none is duplicated."""
        boot = {item["id"]: item for item in json.loads(self.payloads["app/systems.json"])["systems"]}
        for record in self.catalog["projects.json"]["projects"]:
            entry = boot[record["id"]]
            detail = json.loads(self.payloads[f"app/detail/system/{record['id']}.json"])
            for field in record:
                if field == "score":
                    self.assertIn("overall", entry["score"])
                    self.assertEqual(record["score"], detail["score"])
                    continue
                self.assertTrue(
                    (field in entry) != (field in detail),
                    f"{record['id']}.{field} must be in exactly one of boot and detail",
                )

    def test_boot_carries_the_dates_the_page_prints(self) -> None:
        """bootstrap() derives the 'Data updated' line from these envelope keys."""
        self.assertIn("generated_at", json.loads(self.payloads["app/systems.json"]))
        for collection in ("inference", "runtimes", "specifications"):
            self.assertIn("verified_at", json.loads(self.payloads[f"app/{collection}.json"]))

    def test_search_index_covers_every_record(self) -> None:
        index = json.loads(self.payloads["app/search/systems.json"])
        ids = {record["id"] for record in self.catalog["projects.json"]["projects"]}
        self.assertEqual(ids, set(index))

    def test_search_index_holds_lowercased_prose(self) -> None:
        index = json.loads(self.payloads["app/search/systems.json"])
        record = self.catalog["projects.json"]["projects"][0]
        self.assertEqual(index[record["id"]], index[record["id"]].lower())
        self.assertIn(record["why_it_matters"].lower(), index[record["id"]])
        for item in record["strengths"]:
            self.assertIn(item.lower(), index[record["id"]])

    def test_payloads_never_carry_the_published_policy_string(self) -> None:
        self.assertNotIn("policy", json.loads(self.payloads["app/systems.json"]))

    def test_one_detail_file_per_record(self) -> None:
        detail = [path for path in self.payloads if path.startswith("app/detail/")]
        records = sum(
            len(self.catalog[name][key])
            for name, key in (
                ("projects.json", "projects"),
                ("inference-services.json", "services"),
                ("local-runtimes.json", "runtimes"),
                ("specifications.json", "specifications"),
            )
        )
        self.assertEqual(records, len(detail))

    def test_committed_output_matches_the_builder(self) -> None:
        """The same assertion --check makes, so a stale commit fails the suite too."""
        for path, content in self.payloads.items():
            self.assertEqual(
                content,
                (ROOT / "web" / path).read_text(encoding="utf-8"),
                f"web/{path} is stale; run uv run python scripts/build_web_payload.py",
            )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m unittest tests.test_web_payload -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.build_web_payload'`.

- [ ] **Step 3: Write the builder**

Create `scripts/build_web_payload.py`. `BOOT_FIELDS` and `SEARCH_FIELDS` are copied verbatim from spec decisions 2 and 4; `SEARCH_FIELDS` must match `web/app-core.js:45-53`, `:88-96`, `:127-130`, `:140-143` exactly.

```python
#!/usr/bin/env python3
"""Generate the web application's data payloads from the published catalog.

The seven files under web/ are a published API with a compatibility promise.
These payloads are a projection of them shaped for how the page loads: a small
boot payload per collection, a lazily fetched search index, and one detail file
per record. See docs/adr/025-app-payloads-are-a-projection-of-the-published-endpoints.md.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# collection, published file, record key, record-reference kind
COLLECTIONS = (
    ("systems", "projects.json", "projects", "system"),
    ("inference", "inference-services.json", "services", "inference"),
    ("runtimes", "local-runtimes.json", "runtimes", "runtime"),
    ("specifications", "specifications.json", "specifications", "spec"),
)

# What a card, a filter, a sort, and the finder read before anything is clicked.
BOOT_FIELDS = {
    "systems": (
        "id", "name", "system_family", "primary_role", "secondary_roles", "score_profile",
        "stars", "status", "source_model", "licenses", "license_review_status", "description",
        "agent_relation", "architectures", "repo", "url", "deployment", "agent_interfaces",
        "local_first", "superseded_by",
    ),
    "inference": (
        "id", "name", "service_type", "operator", "url", "api_styles", "model_sources",
        "delivery_modes", "description", "score_profile", "terms",
    ),
    "runtimes": (
        "id", "name", "runtime_type", "maintainer", "repo", "url", "api_styles", "accelerators",
        "model_formats", "serving_modes", "deployment_surfaces", "licenses", "source_model",
        "stars", "description", "score_profile",
    ),
    "specifications": (
        "id", "name", "short_name", "specification_type", "scope", "status", "current_version",
        "repo", "url", "licenses", "description", "stewards", "related_specifications",
    ),
}

# Exactly the fields each filter in web/app-core.js searches today.
SEARCH_FIELDS = {
    "systems": ("id", "name", "description", "repo", "url", "why_it_matters", "strengths", "weaknesses"),
    "inference": (
        "id", "name", "operator", "description", "service_boundary", "regional_controls",
        "retention_controls", "routing", "customization", "strengths", "tradeoffs",
    ),
    "runtimes": (
        "id", "name", "maintainer", "description", "runtime_boundary", "model_management",
        "hardware_requirements", "operational_controls", "strengths", "tradeoffs",
    ),
    "specifications": (
        "id", "name", "short_name", "description", "standardizes", "does_not_standardize",
        "repo", "stewards",
    ),
}

# Envelope keys the page reads: bootstrap() prints the newest of these as "Data updated".
ENVELOPE_KEYS = ("generated_at", "verified_at")


def load_catalog(root: Path) -> dict[str, dict]:
    """Read the published copies the payloads project from."""
    web = root / "web"
    return {
        name: json.loads((web / name).read_text(encoding="utf-8"))
        for _, name, _, _ in COLLECTIONS
    }


def searchable_text(value) -> str:
    """Flatten a field the way the browser's filters do before matching."""
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(searchable_text(item) for item in value)
    return str(value)


def dumps(payload) -> str:
    """Payloads are machine-read, so they are written minified with a trailing newline."""
    return json.dumps(payload, separators=(",", ":"), sort_keys=False) + "\n"


def build_payloads(catalog: dict[str, dict]) -> dict[str, str]:
    payloads: dict[str, str] = {}
    for collection, name, key, kind in COLLECTIONS:
        document = catalog[name]
        records = document[key]
        boot_fields = BOOT_FIELDS[collection]

        entries = []
        for record in records:
            entry = {field: record[field] for field in boot_fields if field in record}
            if "score" in record:
                entry["score"] = {"overall": record["score"]["overall"]}
            entries.append(entry)

        envelope = {key: document[key] for key in ENVELOPE_KEYS if key in document}
        payloads[f"app/{collection}.json"] = dumps({**envelope, collection: entries})

        payloads[f"app/search/{collection}.json"] = dumps({
            record["id"]: " ".join(
                searchable_text(record.get(field)) for field in SEARCH_FIELDS[collection]
            ).lower()
            for record in records
        })

        for record in records:
            detail = {field: value for field, value in record.items() if field not in boot_fields}
            if "score" in record:
                detail["score"] = record["score"]
            payloads[f"app/detail/{kind}/{record['id']}.json"] = dumps(detail)
    return payloads


def main(argv: list[str]) -> int:
    payloads = build_payloads(load_catalog(ROOT))
    web = ROOT / "web"
    if "--check" in argv:
        problems = [
            f"web/{path} is missing or stale"
            for path, content in payloads.items()
            if not (web / path).exists() or (web / path).read_text(encoding="utf-8") != content
        ]
        app_dir = web / "app"
        if app_dir.exists():
            committed = {str(path.relative_to(web)) for path in app_dir.rglob("*") if path.is_file()}
            problems += [
                f"web/{path} is not produced by the catalog"
                for path in sorted(committed - set(payloads))
            ]
        if problems:
            print("\n".join(problems[:20] + ([f"… and {len(problems) - 20} more"] if len(problems) > 20 else [])), file=sys.stderr)
            print("Run `uv run python scripts/build_web_payload.py` and commit the result.", file=sys.stderr)
            return 1
        print(f"{len(payloads)} app payload files are up to date.")
        return 0
    shutil.rmtree(web / "app", ignore_errors=True)
    for path, content in payloads.items():
        target = web / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(f"wrote {len(payloads)} app payload files under web/app/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4: Generate the payloads and run the tests**

Run: `uv run python scripts/build_web_payload.py && uv run python -m unittest tests.test_web_payload -v`
Expected: `wrote 279 app payload files under web/app/`, then PASS on all 7 tests.

If `test_every_published_field_lands_in_boot_or_detail` fails, a published field is missing from `BOOT_FIELDS` — that is the test doing its job. Decide whether the field is card-level (add it to `BOOT_FIELDS`) or not (it needs no change; the complement puts it in detail automatically). Never "fix" this by narrowing the assertion.

- [ ] **Step 5: Confirm the size target**

Run:

```bash
python3 -c "
import glob,gzip,os
boot=sum(len(gzip.compress(open(f,'rb').read(),9)) for f in glob.glob('web/app/*.json'))
idx=sum(len(gzip.compress(open(f,'rb').read(),9)) for f in glob.glob('web/app/search/*.json'))
tax=len(gzip.compress(open('web/taxonomy.json','rb').read(),9))
print(f'boot {(boot+tax)/1024:.1f} KB gz | search index {idx/1024:.1f} KB gz')"
```

Expected: boot 41.3 KB, index 100.3 KB. (43.6 KB appears in the design spec; that figure was measured pretty-printed, and the builder minifies.) A boot payload materially over 50 KB means `BOOT_FIELDS` has picked up prose — re-read spec decision 2 before continuing.

- [ ] **Step 6: Wire the builder into the refresh**

In `scripts/update_directory.py`, import beside the existing `sync_web_data` import (both the relative and absolute branches at lines 33 and 40) and call it immediately after `sync_web_data()` at line 709:

```python
    sync_web_data()
    build_web_payload()
```

- [ ] **Step 7: Wire the builder into both workflows**

In `.github/workflows/verify.yml`, add after the "Check share page freshness" step:

```yaml
      - name: Check app payload freshness
        run: uv run python scripts/build_web_payload.py --check
```

In `.github/workflows/update-directory.yml`, add between "Refresh GitHub metadata and discover candidates" and "Regenerate share pages":

```yaml
      - name: Regenerate app payloads
        run: uv run python scripts/build_web_payload.py
```

Order is fixed and load-bearing: `sync_web_data` → `build_web_payload` → `build_share_pages` → `build_asset_version`.

- [ ] **Step 8: Verify the guards actually catch drift**

Run:

```bash
printf '{}' > web/app/systems.json
uv run python scripts/build_web_payload.py --check; echo "exit: $?"
echo '{}' > web/app/detail/system/not-a-record.json
uv run python scripts/build_web_payload.py --check; echo "exit: $?"
uv run python scripts/build_web_payload.py
uv run python scripts/build_web_payload.py --check; echo "exit: $?"
```

Expected: exit 1 reporting `web/app/systems.json is missing or stale`; exit 1 also reporting `web/app/detail/system/not-a-record.json is not produced by the catalog`; then exit 0. If the orphan is not reported, the rebuild in `main` is not clearing the tree.

- [ ] **Step 9: Run the full guard set**

Run: `uv run ruff check scripts tests && uv run python -m unittest discover -s tests && uv run python scripts/validate_directory.py`
Expected: all pass. `validate_directory.py` must still report 174 projects — payloads must not have touched the published files.

- [ ] **Step 10: Commit**

```bash
git add scripts/build_web_payload.py tests/test_web_payload.py scripts/update_directory.py .github/workflows/verify.yml .github/workflows/update-directory.yml web/app
git commit -m "Generate the app's boot, search, and detail payloads"
```

---

### Task 3: Version the payloads for cache busting

`scripts/build_asset_version.mjs` inlines one content hash per file into `<script id="data-versions">`. 271 detail hashes would add 8–10 KB to `index.html` — a sixth of the boot budget spent to save it. Boot and index files get their own hashes; detail files share one stamp.

**Files:**
- Modify: `scripts/build_asset_version.mjs:22-43`
- Modify: `web/index.html` (regenerated `data-versions`)
- Modify: `tests/test_web.js` (new test)

**Interfaces:**
- Consumes: the payload paths from Task 2.
- Produces: `data-versions` keys `app/systems.json`, `app/inference.json`, `app/runtimes.json`, `app/specifications.json`, `app/search/*.json`, and the single key `app/detail`. Task 5's `loadJSON` reads them.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_web.js`:

```javascript
test("every app payload class is versioned, with one shared stamp for detail", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const versions = JSON.parse(html.match(/id="data-versions">([^<]*)</)[1]);
  for (const collection of ["systems", "inference", "runtimes", "specifications"]) {
    assert.match(versions[`app/${collection}.json`], /^[0-9a-f]{12}$/);
    assert.match(versions[`app/search/${collection}.json`], /^[0-9a-f]{12}$/);
  }
  assert.match(versions["app/detail"], /^[0-9a-f]{12}$/);
  const perRecord = Object.keys(versions).filter(key => key.startsWith("app/detail/"));
  assert.deepEqual(perRecord, [], "detail files share one stamp; they are not versioned individually");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/test_web.js`
Expected: FAIL — `versions["app/systems.json"]` is `undefined`.

- [ ] **Step 3: Extend the version builder**

In `scripts/build_asset_version.mjs`, extend `DATA_FILES` and add the detail stamp. Keep the injected-reader shape so the test can stub the filesystem:

```javascript
const DATA_FILES = [
  "projects.json", "taxonomy.json", "license-evidence.json", "specifications.json",
  "inference-services.json", "local-runtimes.json", "logos.json",
  "app/systems.json", "app/inference.json", "app/runtimes.json", "app/specifications.json",
  "app/search/systems.json", "app/search/inference.json",
  "app/search/runtimes.json", "app/search/specifications.json",
];

// 271 detail files would put 8-10 KB of hashes in index.html to save it, so they
// share one stamp over the whole tree. A change to any record busts them all,
// which is the right trade for files fetched on demand and rarely.
const DETAIL_VERSION_KEY = "app/detail";
```

`stampAssetVersions` takes a third argument, `readDetailTree`, returning sorted `[path, Buffer]` pairs; the version is `assetVersion(Buffer.concat(...))` over paths and contents. Extend the `node:fs` import first — the file currently imports only `readFileSync` and `writeFileSync`:

```javascript
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
```

At the bottom of the file, pass the real implementation:

```javascript
const readDetailTree = () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "app", "detail");
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map(name => join(root, name))
    .filter(path => statSync(path).isFile())
    .sort()
    .map(path => [path, readFileSync(path)]);
};
```

- [ ] **Step 4: Restamp and run the tests**

Run: `node scripts/build_asset_version.mjs && node --test tests/test_web.js`
Expected: `stamped asset versions in web/index.html`, then PASS on all tests including the new one.

- [ ] **Step 5: Verify the stamp actually moves**

Run:

```bash
BEFORE=$(grep -o '"app/detail":"[0-9a-f]*"' web/index.html)
python3 -c "
import json,pathlib
p=pathlib.Path('web/app/detail/system/agno.json'); d=json.loads(p.read_text())
d['why_it_matters']='changed'; p.write_text(json.dumps(d,separators=(',',':'))+'\n')"
node scripts/build_asset_version.mjs
AFTER=$(grep -o '"app/detail":"[0-9a-f]*"' web/index.html)
[ "$BEFORE" != "$AFTER" ] && echo "stamp moved: OK" || echo "STAMP DID NOT MOVE — readDetailTree is not seeing the file"
uv run python scripts/build_web_payload.py && node scripts/build_asset_version.mjs
```

Expected: `stamp moved: OK`, then the rebuild restores both. A stamp that does not move means a returning visitor is served stale detail from cache — this is the check that catches it.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_asset_version.mjs web/index.html tests/test_web.js
git commit -m "Version the app payloads, with one shared stamp for record detail"
```

---

### Task 4: Teach app-core to search from an index

Purely additive: the app still reads the published endpoints after this task, and behaviour is unchanged. It converges the two search paths that disagree today — the grid searches whole records via `JSON.stringify` (`web/app-core.js:40`) while the finder searches an explicit field list (`:43`).

**Files:**
- Modify: `web/app-core.js:35-56` (`matchesProjectSearch`, `matchesDirectoryProjectSearch`), `:58-72` (`matchesProject`), `:84-103` (`filterSpecifications`), `:105-123` (`filterScoredCollection`), `:160-168` (`filterDirectoryEntries`)
- Modify: `tests/test_web.js` (search tests)

**Interfaces:**
- Consumes: the index shape from Task 2 — a plain object mapping record id to lowercased text.
- Produces: `recordHaystack(record, index)` and `matchesRecordSearch(record, term, index)`; every filter accepts `filters.searchIndex`, an optional object. When absent, matching falls back to card-level fields. Task 5 passes it in.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_web.js`:

```javascript
test("an indexed search matches prose the boot payload does not carry", () => {
  const records = [{ id: "a", name: "Alpha", description: "A card line." }];
  const searchIndex = { a: "alpha a card line. it consolidates episodic memory." };
  assert.equal(filterAndSortProjects(records, { term: "episodic", searchIndex }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "episodic" }).length, 0);
});

test("search falls back to card text before the index arrives", () => {
  const records = [{ id: "a", name: "Alpha", description: "A card line." }];
  assert.equal(filterAndSortProjects(records, { term: "card" }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "card", searchIndex: {} }).length, 1);
});

test("indexed search keeps infix matching, which is why the index is raw text", () => {
  // The term must appear ONLY in the index: a record whose own id or name
  // contains it would match through the fallback and prove nothing.
  const records = [{ id: "ol", name: "Ol", description: "Runner.", score: { overall: 1 } }];
  const searchIndex = { ol: "ollama runner. runs gguf models locally." };
  assert.equal(filterAndSortProjects(records, { term: "llama", searchIndex }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "llama" }).length, 0);
});

test("a one-character term still matches only the start of a word in the name", () => {
  const records = [{ id: "a", name: "Alpha", description: "zebra" }];
  assert.equal(filterAndSortProjects(records, { term: "a" }).length, 1);
  assert.equal(filterAndSortProjects(records, { term: "z" }).length, 0);
});
```

Then update the existing search tests: every call that relies on matching text outside `id`, `name`, `description`, `repo`, `url`, `operator`, `maintainer`, or `short_name` must pass a `searchIndex`. Run the suite to find them rather than guessing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/test_web.js`
Expected: FAIL on the first new test — `filterAndSortProjects` ignores `searchIndex`, so both counts are 0.

- [ ] **Step 3: Implement the shared haystack**

In `web/app-core.js`, replace `matchesProjectSearch` and `matchesDirectoryProjectSearch` with one path:

```javascript
  // One haystack for every collection and every search box. The index is the
  // lowercased prose a record carries; before it arrives — or for a record it
  // does not cover — the card-level fields the boot payload already holds are
  // matched instead, so a search always answers with something correct.
  const CARD_FIELDS = ["id", "name", "short_name", "description", "repo", "url", "operator", "maintainer"];

  function recordHaystack(record, index) {
    const indexed = index && index[record.id];
    if (indexed) return indexed;
    return CARD_FIELDS.map(field => record[field]).filter(Boolean).join(" ").toLowerCase();
  }

  function matchesRecordSearch(record, term, index) {
    if (term.length === 1) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}`).test(String(record.name || "").toLowerCase());
    }
    return matchesSearchTerm(recordHaystack(record, index), term);
  }
```

Then in `matchesProject`, `filterSpecifications`, `filterScoredCollection`, and `filterDirectoryEntries`, replace each inline haystack with `matchesRecordSearch(record, term, filters.searchIndex)`. In `filterDirectoryEntries`, pass the per-collection index through to each of the three collection filters. Export `recordHaystack` alongside the existing exports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/test_web.js && npm run lint:js && node --check web/app-core.js`
Expected: PASS on every test, clean lint.

- [ ] **Step 5: Confirm the app is still unchanged**

Run: `npm run test:e2e`
Expected: 64 passed. This task touched no loading behaviour, so any e2e failure is a real regression in search.

- [ ] **Step 6: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Give every search box one haystack, optionally from an index"
```

---

### Task 5: Switch the app onto the payloads

The intermediate states here are broken — a boot payload without detail loading leaves empty dialogs — so this lands as one change.

**Files:**
- Modify: `web/app.js` — `loadJSON` (~:131), `bootstrap` (~:139), `RECORD_DIALOGS`/`openRecordDialog` (~:1123-1174), `openComparison` (~:1292), search input bindings in `bindEvents`
- Modify: `tests/e2e/deferred-data.spec.js`

**Interfaces:**
- Consumes: payload paths (Task 2), `data-versions` keys (Task 3), `filters.searchIndex` (Task 4).
- Produces: `loadDetail(kind, record)`, `loadSearchIndex(collection)` — both returning a promise on first call and `null` once satisfied, matching `ensureLicenseEvidence`.

- [ ] **Step 1: Write the failing e2e tests**

Add to `tests/e2e/deferred-data.spec.js`:

```javascript
test("boot fetches payloads, not the published endpoints", async ({ page }) => {
  const requested = [];
  page.on("request", request => requested.push(new URL(request.url()).pathname));
  await page.goto("/?collection=systems");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();

  expect(requested.filter(path => path.endsWith("/app/systems.json"))).toHaveLength(1);
  expect(requested.filter(path => path.endsWith("/projects.json"))).toHaveLength(0);
  expect(requested.filter(path => path.includes("/app/search/"))).toHaveLength(0);
});

test("a deep-linked record fetches its detail and renders the full dialog", async ({ page }) => {
  await page.goto("/?collection=systems&record=system:kilo-code");
  await expect(page.locator("#project-dialog h1")).toHaveText("Kilo Code");
  const strengths = page.locator("#dialog-content .detail-block").filter({ hasText: "Strengths" });
  await expect(strengths.locator("li").first()).toBeVisible();
  await expect(page.locator("#dialog-content .score-table tr")).not.toHaveCount(1);
});

test("focusing search loads the index and widens the results", async ({ page }) => {
  const requested = [];
  page.on("request", request => requested.push(new URL(request.url()).pathname));
  await page.goto("/?collection=systems");
  await page.locator("#project-search").focus();
  await expect.poll(() => requested.filter(p => p.endsWith("/app/search/systems.json")).length).toBe(1);

  await page.locator("#project-search").fill("episodic");
  await expect(page.locator("#project-grid .project-card").first()).toBeVisible();
});

test("a restored comparison renders every score row", async ({ page }) => {
  await page.goto("/?collection=systems&compare=system:kilo-code,cline");
  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator(".comparison-table tbody tr").filter({ hasText: "Strengths" })).toHaveCount(1);
  await expect(page.locator(".comparison-table tbody tr")).not.toHaveCount(2);
});

test("the page still renders when a payload class never arrives", async ({ page }) => {
  await page.route("**/app/search/**", route => route.abort());
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill("kilo");
  await expect(page.locator('#project-grid [data-project="kilo-code"]')).toBeVisible();
});
```

Confirm the two ids in the comparison test share one `score_profile`, or `restoreComparisonFromURL` discards the parameter:

```bash
python3 -c "
import json
p={r['id']:r for r in json.load(open('web/projects.json'))['projects']}
print(p['kilo-code']['score_profile'], p['cline']['score_profile'])"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/e2e/deferred-data.spec.js --reporter=list`
Expected: FAIL — the app still requests `projects.json` and never requests a payload.

- [ ] **Step 3: Resolve the detail version stamp in loadJSON**

```javascript
async function loadJSON(path) {
  // Record detail shares one stamp rather than carrying 271 hashes in the page.
  const version = dataVersions[path] || (path.startsWith("app/detail/") ? dataVersions["app/detail"] : undefined);
  const response = await fetch(version ? `${path}?v=${version}` : path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}
```

- [ ] **Step 4: Boot from the payloads**

```javascript
async function bootstrap() {
  // The published endpoints are an API, not this page's payload: the page reads
  // a projection of them shaped for a first render. See ADR 025.
  const [systems, inference, runtimes, specifications, taxonomy] = await Promise.all([
    loadJSON("app/systems.json"), loadJSON("app/inference.json"), loadJSON("app/runtimes.json"),
    loadJSON("app/specifications.json"), loadJSON("taxonomy.json")
  ]);
  state.projects = systems.systems;
  state.inferenceServices = inference.inference;
  state.localRuntimes = runtimes.runtimes;
  state.specifications = specifications.specifications;
  state.taxonomy = taxonomy;
  const dataDate = [systems.generated_at, specifications.verified_at, inference.verified_at, runtimes.verified_at]
    .filter(Boolean)
    .sort()
    .at(-1);
```

The rest of `bootstrap` is unchanged.

- [ ] **Step 5: Add the two lazy loaders**

Beside `ensureLicenseEvidence`, following the same shape — a promise on first call, `null` once satisfied:

```javascript
// A record's detail is merged into the boot record in place, so every existing
// reference to it — the dialog, the comparison table — sees the full record
// afterwards without being handed a new object.
const loadedDetail = new Set();
const detailRequests = new Map();

function loadDetail(kind, record) {
  const key = `${kind}:${record.id}`;
  if (loadedDetail.has(key)) return null;
  if (!detailRequests.has(key)) {
    detailRequests.set(key, loadJSON(`app/detail/${kind}/${record.id}.json`)
      .then(detail => { Object.assign(record, detail); loadedDetail.add(key); })
      .catch(() => { detailRequests.delete(key); }));
  }
  return detailRequests.get(key);
}

const searchIndexes = {};
const searchIndexRequests = {};

function loadSearchIndex(collection) {
  if (searchIndexes[collection]) return null;
  if (!searchIndexRequests[collection]) {
    searchIndexRequests[collection] = loadJSON(`app/search/${collection}.json`)
      .then(index => { searchIndexes[collection] = index; })
      .catch(() => { delete searchIndexRequests[collection]; });
  }
  return searchIndexRequests[collection];
}
```

- [ ] **Step 6: Hydrate the dialogs**

Each entry in `RECORD_DIALOGS` gains a `kind` matching its payload directory, and `openRecordDialog`'s existing `hydrate` hook gains detail:

```javascript
  dialog.hydrate?.()?.then(repaint);
  loadDetail(kind, record)?.then(repaint);
```

where `repaint` is the guarded repaint already in `openRecordDialog` (commit `c732774`):

```javascript
  const repaint = () => {
    const element = $(dialog.dialog);
    if (element.dataset.recordKind === kind && element.dataset.recordId === id) paintRecordDialog(dialog, record);
  };
```

Note the dialog paints twice on a first open — once from boot, once when detail lands. That is the same pattern the licence evidence already uses and is why the markup must tolerate missing detail fields: guard `project.strengths`, `project.weaknesses`, `project.score` dimensions, `project.canonical_data`, `project.capture_modes`, `project.memory_lifecycle`, `project.execution_boundaries`, and `project.agent_capabilities` with `|| []` or `?? ""` in the four `*DialogMarkup` functions. Skipping this is a `TypeError` on first paint.

- [ ] **Step 7: Hydrate the comparison**

In `openComparison`, before building rows:

```javascript
  const pending = records.map(record => loadDetail(state.comparison.kind, record)).filter(Boolean);
  if (pending.length) {
    Promise.all(pending).then(() => { if (comparisonRecords().length === records.length) openComparison(); });
    return;
  }
```

At most four small fetches (`web/app-core.js:177` caps selection at 4). `restoreComparisonFromURL` needs no change: it validates on `id` and `score_profile`, both in boot.

- [ ] **Step 8: Load an index on focus and widen when it lands**

In `bindEvents`, for each of the five search inputs — `#project-search`, `#specification-search`, `#inference-search`, `#runtime-search`, and `#all-directory-search`:

```javascript
  // Fetching on focus rather than on the first keystroke usually beats the
  // second character, so the widened results arrive before anyone sees the
  // narrow ones. The All view searches three collections, so it loads three.
  const SEARCH_SCOPES = {
    "#project-search": ["systems"], "#specification-search": ["specifications"],
    "#inference-search": ["inference"], "#runtime-search": ["runtimes"],
    "#all-directory-search": ["systems", "inference", "runtimes"],
  };
  for (const [selector, collections] of Object.entries(SEARCH_SCOPES)) {
    $(selector).addEventListener("focus", () => {
      for (const collection of collections) {
        loadSearchIndex(collection)?.then(renderSearchSurfaces);
      }
    });
  }
```

`renderSearchSurfaces` repaints whatever is on screen, using the renderers that already exist at `web/app.js:762-765`:

```javascript
function renderSearchSurfaces() {
  const renderers = {
    all: renderAllDirectoryEntries, systems: renderProjects,
    inference: renderInferenceServices, runtimes: renderLocalRuntimes,
  };
  renderers[state.directoryCollection]?.();
  renderSpecifications();
  if (state.directoryRoles) renderFinder();
}
```

Pass the index into every filter call site by adding `searchIndex: searchIndexes.<collection>` to the `filters` object each `COLLECTIONS[*].records()` builds, and pass all three to `AtlasCore.filterDirectoryEntries` in `renderAllDirectoryEntries`.

- [ ] **Step 9: Run every test**

Run: `node --check web/app.js && npm run lint:js && node --test tests/test_web.js && npm run test:e2e`
Expected: all pass, including the five new e2e tests.

- [ ] **Step 10: Confirm the size target on a real page load**

```bash
uv run python -m http.server 8765 --directory web &
sleep 2
python3 -c "
import urllib.request, gzip, json, re
html = urllib.request.urlopen('http://localhost:8765/').read().decode()
versions = json.loads(re.search(r'id=\"data-versions\">([^<]*)<', html).group(1))
total = 0
for path in ['app/systems.json','app/inference.json','app/runtimes.json','app/specifications.json','taxonomy.json']:
    body = urllib.request.urlopen(f'http://localhost:8765/{path}').read()
    total += len(gzip.compress(body, 9))
print(f'blocking boot payload: {total/1024:.1f} KB gzipped')"
kill %1
```

Expected: 41.3 KB. (The design spec's 43.6 KB estimate was computed on pretty-printed JSON; the builder writes payloads minified, which is correct for machine-read files and accounts for the whole difference.) Anything over 60 KB means a prose field reached a boot payload.

- [ ] **Step 11: The browser pass AGENTS.md requires**

Serve `web/` and exercise, in a browser: search and filters in all four collections; cross-family score hiding; scoped comparison and its URL restoration; record deep links; the back button; the finder handoff; taxonomy; and all four dialogs. Confirm in devtools that boot requests only the five payload files and that `app/search/*.json` appears only after a search box takes focus.

- [ ] **Step 12: Commit**

```bash
git add web/app.js tests/e2e/deferred-data.spec.js
git commit -m "Load the directory from app payloads instead of the endpoints"
```

---

### Task 6: Document what the site now serves

**Files:**
- Modify: `web/index.html` (the "What is not published" section, `:265`)
- Modify: `docs/WEB.md`, `docs/OPERATIONS.md`, `docs/AGENT_DOCS.md`

**Interfaces:**
- Consumes: ADR 025 (Task 1), the builder (Task 2), the loading model (Task 5).
- Produces: nothing code reads.

- [ ] **Step 1: Extend the API view's "What is not published"**

That section already accounts for the one non-endpoint JSON the site serves — "`logos.json` is served because this page needs it" — which makes it a standing promise to explain every JSON on the origin. Add a third paragraph inside the same `<article>`:

```html
          <p>The files under <code>/app/</code> are this page's own payload: the same records, split into what a card needs and what a record dialog needs, so the directory renders without downloading every review first. They are regenerated from the files above and carry no compatibility promise. Build against the endpoints on this page, not against those.</p>
```

Add no `endpoint-link` anchor — `tests/test_web.js:578` asserts the endpoint list equals `PUBLISHED_DATA` exactly, and an extra link fails it.

- [ ] **Step 2: Verify the API view tests still pass**

Run: `node --test tests/test_web.js`
Expected: PASS, including "the API view lists exactly the published catalog files".

- [ ] **Step 3: Document the loading model in docs/WEB.md**

Under "Behavioral contracts", state what is fetched when: five files at boot; a search index on search focus; a record's detail on dialog open or comparison; `license-evidence.json` on the first record open; `logos.json` after first paint. State that every one of these degrades to something correct on failure, and that a dialog paints twice on a first open. Under "Change surfaces", add the `web/app/` tree and the rule that it is generated, never hand-edited. Under "Verification", add the boot-payload size check from Task 5 step 10.

- [ ] **Step 4: Document the build in docs/OPERATIONS.md**

Add an "App payloads" section beside the existing "Share pages", "Asset versions", and "Logo coverage" sections: what `scripts/build_web_payload.py` writes, that `--check` guards it in `verify.yml`, that the weekly refresh regenerates it via `scripts/update_directory.py`, and the fixed order `sync_web_data` → `build_web_payload` → `build_share_pages` → `build_asset_version`. State plainly that a payload builder missing from the refresh chain ships stale `stars` on every run.

- [ ] **Step 5: Record the agent-facing boundary in docs/AGENT_DOCS.md**

Under "Maintenance contract", record that app payloads are deliberately absent from `llms.txt`, the Atlas skill, and the API view's endpoint list, because they are a projection whose shape may change with any web change. Agents and API consumers read the seven endpoints.

- [ ] **Step 6: Run the whole suite**

Run:

```bash
uv run ruff check scripts tests && uv run python -m unittest discover -s tests \
  && uv run python scripts/validate_directory.py \
  && node scripts/build_logos.mjs --check && node scripts/build_fonts.mjs --check \
  && node scripts/build_asset_version.mjs --check \
  && uv run python scripts/build_share_pages.py --check \
  && uv run python scripts/build_web_payload.py --check \
  && npm run lint:js && node --test tests/test_web.js && npm run test:e2e
```

Expected: every check passes.

- [ ] **Step 7: Commit**

```bash
git add web/index.html docs/WEB.md docs/OPERATIONS.md docs/AGENT_DOCS.md
git commit -m "Document the app payloads and what they are not"
```
