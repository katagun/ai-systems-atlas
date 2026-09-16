# Agent packs collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `directory/packs.json`, an unscored fifth collection of document packs a host agent installs, recorded for what they install rather than what they do, with ADR 032 amending ADR 031 so those packs stop landing in `exclusions.json`.

**Architecture:** The collection copies the specification collection's shape end to end: a canonical JSON file synchronized to `web/`, taxonomy enums, a `validate_packs` pass, a boot/detail payload projection, share pages, a Directory scope with alphabetical-only results and no comparison, and a record kind `pack:id`. Every script that enumerates collections (validator, payload, share pages, asset version, refresh staging, review age, evidence links, candidate evidence, updater dedupe, logos) gains one row.

**Tech Stack:** Python 3.11 with `uv` and `unittest`; dependency-free browser JS in `web/app-core.js` and `web/app.js`; Node test runner; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-16-agent-packs-collection-design.md`

## Global Constraints

- Collection name in prose is **Agent packs**; file `directory/packs.json`; envelope `{"version": "1.0", "verified_at": ..., "packs": [...]}`; record kind `pack`; share directory `records/packs`; payload `app/packs.json`. The word "harness" never names the collection.
- A pack record has **no** `system_family`, `primary_role`, `score_profile`, `score`, `stars`, or `stars_verified_at`; the validator rejects each.
- A repository appears in exactly one of `projects.json`, `packs.json`, `exclusions.json`.
- Packs sort alphabetically only; no score sort, no stars sort, no comparison, no Finder goal, no card badges.
- Every licence has one scoped `license_evidence` item; `LicenseRef-Unclear` is valid when no licence file is served.
- `PUBLISHED_DATA` (two scripts), `web/llms.txt`, and the API view in `web/index.html` change in the same commit (`docs/AGENT_DOCS.md`).
- Run `uv run python scripts/sync_web_data.py`, `uv run python scripts/build_web_payload.py`, `uv run python scripts/build_share_pages.py`, and `node scripts/build_asset_version.mjs` after any change to a published file, and commit the generated output.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never report a check as passing unless you ran it.

---

### Task 1: Publish an empty Agent packs collection

An empty collection that validates, synchronizes, and is listed on every agent-facing surface. Nothing renders yet.

**Files:**
- Modify: `directory/taxonomy.json` (three new enum groups after `specification_statuses`)
- Create: `directory/packs.json`, `web/packs.json`
- Modify: `scripts/validate_directory.py:26-30` (`PUBLISHED_DATA`), `:67-104` (`TAXONOMY_GROUPS`), `:121-126` (schema sets), `:984-1070` (extract evidence helper), new `validate_packs`, `:1572-1596` (`validate_unique_record_ids`), `:1985-2047` (`validate()` wiring and `main()` summary)
- Modify: `scripts/sync_web_data.py:9-12`
- Modify: `scripts/promote_system_candidate.py:199-203,285-295`, `scripts/promote_model_candidate.py:216-218` and the `validate_unique_record_ids` call below it
- Modify: `web/llms.txt`, `web/index.html:284-288` (API view), `AGENTS.md:88`, `README.md:57-60`, `skills/ai-systems-atlas/SKILL.md:12-20`, `skills/ai-systems-atlas/reference.md:5-14,22-27`, `docs/DATA_MODEL.md:7-20,144-156`
- Test: `tests/test_validation_policy.py`, `tests/test_directory.py`, `tests/test_promote_system_candidate.py:89`, `tests/test_promote_model_candidate.py:78`

**Interfaces:**
- Produces: taxonomy groups `pack_types`, `pack_hosts`, `pack_install_mechanisms`; validator constants `PACK_REQUIRED`, `PACK_OPTIONAL`, `PACK_FORBIDDEN`; `validate_evidence_items(evidence_items, repo, prefix, errors) -> None`; `validate_packs(packs_data, tax, specification_ids, index, errors) -> list[Any]`; `validate_unique_record_ids(..., models_value, errors, packs_value=None)`.

- [ ] **Step 1: Add the three taxonomy groups**

In `directory/taxonomy.json`, directly after the `specification_statuses` array (one line per entry, matching the file's style), add:

```json
  "pack_types": [
    {"id": "skills_bundle", "name": "Skills bundle", "definition": "A set of skill documents installed together under a capability format such as Agent Skills."},
    {"id": "plugin", "name": "Plugin", "definition": "A host plugin whose manifest declares commands, agents, skills, or hook configuration the host reads."},
    {"id": "process_kit", "name": "Process kit", "definition": "A methodology packaged as prompts, commands, subagent definitions, and templates a host follows."},
    {"id": "vault_bundle", "name": "Vault bundle", "definition": "A knowledge-vault template with the instructions a host reads to maintain it."},
    {"id": "marketplace", "name": "Marketplace", "definition": "A host-consumable manifest that lists other packs for installation. Its entries are never reviewed, counted, or listed by the record."}
  ],
  "pack_hosts": [
    {"id": "claude_code", "name": "Claude Code", "definition": "Installs into Anthropic's Claude Code through its plugin, skill, command, agent, or hook directories."},
    {"id": "codex", "name": "Codex", "definition": "Installs into OpenAI Codex through its skills or configuration directories."},
    {"id": "cursor", "name": "Cursor", "definition": "Installs into Cursor through its rules or skills directories."},
    {"id": "gemini_cli", "name": "Gemini CLI", "definition": "Installs into Google's Gemini CLI through its extensions or configuration directories."},
    {"id": "github_copilot", "name": "GitHub Copilot", "definition": "Installs into GitHub Copilot through its instructions, agents, or skills directories."},
    {"id": "opencode", "name": "OpenCode", "definition": "Installs into OpenCode through its agents, commands, or skills directories."},
    {"id": "windsurf", "name": "Windsurf", "definition": "Installs into Windsurf through its rules or workflows directories."},
    {"id": "cline", "name": "Cline", "definition": "Installs into Cline through its rules or workflows directories."},
    {"id": "obsidian", "name": "Obsidian", "definition": "A vault opened in Obsidian, with the host agent reading the vault's own instruction files."},
    {"id": "any_agent_skills_host", "name": "Any Agent Skills host", "definition": "The pack documents only the Agent Skills format and names no specific host."}
  ],
  "pack_install_mechanisms": [
    {"id": "host_marketplace", "name": "Host marketplace", "definition": "Installed through the host's own plugin or marketplace command from a manifest the pack ships."},
    {"id": "skills_cli", "name": "Skills installer", "definition": "Installed by a third-party skills installer that copies the pack into a host's skills directory."},
    {"id": "copy_files", "name": "Copy files", "definition": "The reader or an install script the pack ships copies files into the host's directories."},
    {"id": "clone_template", "name": "Clone as template", "definition": "The reader clones or forks the repository as the starting vault or project the host then works in."}
  ],
```

Also change the `principle` string's clause "Models, inference services, local runtimes, and specifications retain independent collection schemas" to "Models, inference services, local runtimes, specifications, and agent packs retain independent collection schemas".

- [ ] **Step 2: Create the empty collection in both places**

Write `directory/packs.json` and copy it to `web/packs.json`:

```json
{
  "version": "1.0",
  "verified_at": "2026-09-16",
  "packs": []
}
```

- [ ] **Step 3: Write the failing validator tests**

Append to `tests/test_validation_policy.py` inside `ValidationPolicyTests`, after `test_local_runtimes_must_be_published_to_web`:

```python
    SAMPLE_PACK: ClassVar[dict] = {
        "id": "sample-pack",
        "name": "Sample Pack",
        "steward": "Sample Steward",
        "repo": "sample/pack",
        "url": "https://github.com/sample/pack",
        "description": "A synthetic skills bundle used to exercise pack validation.",
        "pack_type": "skills_bundle",
        "hosts": ["claude_code", "codex"],
        "packaging_formats": ["agent-skills"],
        "install_mechanism": "skills_cli",
        "installs": "Three SKILL.md skill directories under skills/, each with one reference document.",
        "not_a_system": "Ships no program that runs at runtime and keeps no state it reads back; the host reads its documents as context.",
        "status": "active",
        "licenses": ["MIT"],
        "license_note": "Repository-wide MIT license.",
        "license_evidence": [{
            "license_id": "MIT",
            "scope": "Repository-wide license file",
            "kind": "git_blob",
            "path": "LICENSE",
            "url": "https://github.com/sample/pack/blob/main/LICENSE",
            "blob_sha": "0123456789abcdef0123456789abcdef01234567",
            "immutable_url": (
                "https://api.github.com/repos/sample/pack/git/blobs/"
                "0123456789abcdef0123456789abcdef01234567"
            ),
        }],
        "evidence": [{
            "kind": "git_blob",
            "label": "Top-level skill manifest",
            "path": "skills/sample/SKILL.md",
            "url": "https://github.com/sample/pack/blob/main/skills/sample/SKILL.md",
            "blob_sha": "89abcdef0123456789abcdef0123456789abcdef",
            "immutable_url": (
                "https://api.github.com/repos/sample/pack/git/blobs/"
                "89abcdef0123456789abcdef0123456789abcdef"
            ),
        }],
        "verified_at": "2026-09-16",
    }

    def catalog_with_pack(self, mutate=None) -> list[str]:
        """Validate a temporary catalog holding one synthetic agent pack."""
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        packs_path = root / "directory" / "packs.json"
        document = json.loads(packs_path.read_text(encoding="utf-8"))
        pack = json.loads(json.dumps(self.SAMPLE_PACK))
        document["packs"] = [pack]
        if mutate is not None:
            mutate(pack, root)
        self.write_json(packs_path, document)
        self.write_json(root / "web" / "packs.json", document)
        return validate(root)

    def test_valid_pack_passes_validation(self) -> None:
        errors = self.catalog_with_pack()
        self.assertFalse([error for error in errors if "sample-pack" in error], errors)

    def test_pack_rejects_every_scoring_and_popularity_field(self) -> None:
        for field, value in (
            ("stars", 10), ("stars_verified_at", "2026-09-16"), ("score", {"overall": 5}),
            ("score_profile", "agent_system"), ("system_family", "agent_system"),
            ("primary_role", "coding_agent_workflow"),
        ):
            with self.subTest(field=field):
                def mutate(pack, root, field=field, value=value):
                    pack[field] = value
                errors = self.catalog_with_pack(mutate)
                self.assertTrue(any(f"{field} is never recorded on a pack" in e for e in errors), errors)

    def test_pack_rejects_unknown_type_host_and_install_mechanism(self) -> None:
        for field, value, message in (
            ("pack_type", "plugin_marketplace", "unknown pack type"),
            ("hosts", ["emacs"], "unknown hosts"),
            ("install_mechanism", "pip", "unknown install mechanism"),
            ("status", "beta", "unknown status"),
        ):
            with self.subTest(field=field):
                def mutate(pack, root, field=field, value=value):
                    pack[field] = value
                errors = self.catalog_with_pack(mutate)
                self.assertTrue(any(message in e for e in errors), errors)

    def test_pack_packaging_formats_must_name_specification_records(self) -> None:
        def mutate(pack, root):
            pack["packaging_formats"] = ["not-a-spec"]
        errors = self.catalog_with_pack(mutate)
        self.assertTrue(any("unknown packaging_formats" in e for e in errors), errors)

    def test_pack_license_evidence_must_cover_every_license(self) -> None:
        def mutate(pack, root):
            pack["licenses"] = ["MIT", "Apache-2.0"]
        errors = self.catalog_with_pack(mutate)
        self.assertTrue(any("license evidence does not match licenses" in e for e in errors), errors)

    def test_pack_installs_and_not_a_system_are_required_prose(self) -> None:
        for field in ("installs", "not_a_system"):
            with self.subTest(field=field):
                def mutate(pack, root, field=field):
                    pack[field] = ""
                errors = self.catalog_with_pack(mutate)
                self.assertTrue(any(f"{field} must be a non-empty string" in e for e in errors), errors)

    def test_pack_repo_cannot_also_be_a_published_system(self) -> None:
        def mutate(pack, root):
            projects = json.loads((root / "directory" / "projects.json").read_text(encoding="utf-8"))
            pack["repo"] = next(p["repo"] for p in projects["projects"] if p.get("repo"))
        errors = self.catalog_with_pack(mutate)
        self.assertTrue(any("cannot be both a system and a pack" in e for e in errors), errors)

    def test_pack_repo_cannot_also_be_excluded(self) -> None:
        def mutate(pack, root):
            exclusions = json.loads((root / "directory" / "exclusions.json").read_text(encoding="utf-8"))
            pack["repo"] = exclusions["entries"][0]["repo"]
        errors = self.catalog_with_pack(mutate)
        self.assertTrue(any("cannot be both included and excluded" in e for e in errors), errors)

    def test_pack_ids_must_be_unique_across_collections(self) -> None:
        def mutate(pack, root):
            specs = json.loads((root / "directory" / "specifications.json").read_text(encoding="utf-8"))
            pack["id"] = specs["specifications"][0]["id"]
        errors = self.catalog_with_pack(mutate)
        self.assertTrue(any("appears in more than one collection" in e for e in errors), errors)

    def test_packs_must_be_published_to_web(self) -> None:
        temporary, root = self.temporary_catalog()
        self.addCleanup(temporary.cleanup)
        document = json.loads((root / "directory" / "packs.json").read_text(encoding="utf-8"))
        document["verified_at"] = "2026-01-01"
        self.write_json(root / "directory" / "packs.json", document)
        errors = validate(root)
        self.assertTrue(any("web/packs.json is not synchronized" in error for error in errors), errors)
```

Also extend `test_a_non_object_record_never_crashes_any_collection` with the tuple `("packs.json", "packs", "every pack must be an object")`.

In `tests/test_directory.py`, add to `setUpClass`:

```python
        cls.packs = json.loads((ROOT / "directory" / "packs.json").read_text(encoding="utf-8"))
```

and this test after `test_specification_relations_are_reciprocal`:

```python
    def test_packs_are_a_separate_unscored_collection(self) -> None:
        records = self.packs["packs"]
        project_repos = {p["repo"].lower() for p in self.document["projects"] if p.get("repo")}
        for record in records:
            for field in ("system_family", "primary_role", "score_profile", "score", "stars", "stars_verified_at"):
                self.assertNotIn(field, record, record["id"])
            self.assertTrue(record["installs"].strip(), record["id"])
            self.assertNotIn(record["repo"].lower(), project_repos, record["id"])
        for group in ("pack_types", "pack_hosts", "pack_install_mechanisms"):
            self.assertTrue(self.taxonomy[group], group)
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `uv run python -m unittest tests.test_validation_policy -k pack -v`
Expected: failures such as `KeyError: 'directory/packs.json'` or assertions about missing error strings, because `packs.json` is not yet in `CATALOG_DOCUMENTS` and no `validate_packs` exists.

- [ ] **Step 5: Wire the validator**

In `scripts/validate_directory.py`:

1. `PUBLISHED_DATA` becomes:

```python
PUBLISHED_DATA = (
    "projects.json", "taxonomy.json", "exclusions.json", "license-evidence.json",
    "specifications.json", "inference-services.json", "local-runtimes.json", "models.json",
    "models-dev.json", "packs.json",
)
```

2. In `TAXONOMY_GROUPS`, after `"specification_statuses",` add `"pack_types",`, `"pack_hosts",`, `"pack_install_mechanisms",`.

3. After `SPECIFICATION_REQUIRED`, add:

```python
PACK_REQUIRED = {
    "id", "name", "steward", "repo", "url", "description", "pack_type", "hosts",
    "packaging_formats", "install_mechanism", "installs", "not_a_system", "status",
    "licenses", "license_note", "license_evidence", "evidence", "verified_at",
}
PACK_OPTIONAL = {"short_name", "distribution_machinery", "related_packs", "related_systems"}
# A pack is recorded for what it installs, never ranked or scored (ADR 032).
PACK_FORBIDDEN = {"stars", "stars_verified_at", "score", "score_profile", "system_family", "primary_role"}
```

4. Extract the evidence loop from `validate_specifications` into a helper placed directly above it, and call the helper from `validate_specifications` in place of the loop (behaviour unchanged):

```python
def validate_evidence_items(
    evidence_items: Any, repo: Any, prefix: str, errors: list[str]
) -> None:
    """Validate pinned git-blob or dated web evidence. Specifications and packs cite alike."""
    if not isinstance(evidence_items, list) or not evidence_items:
        errors.append(f"{prefix}: evidence must be a non-empty list")
        evidence_items = []
    for item in evidence_items:
        if not isinstance(item, dict) or not isinstance(item.get("label"), str):
            errors.append(f"{prefix}: evidence requires an object with a label")
            continue
        if item.get("kind") == "git_blob":
            blob_sha = item.get("blob_sha")
            if not repo:
                errors.append(f"{prefix}: git-blob evidence requires a repository")
            elif not isinstance(blob_sha, str) or not SHA_PATTERN.fullmatch(blob_sha):
                errors.append(f"{prefix}: invalid evidence blob SHA")
            elif item.get("immutable_url") != f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}":
                errors.append(f"{prefix}: immutable evidence URL must address the blob SHA")
            if not isinstance(item.get("path"), str) or not item["path"]:
                errors.append(f"{prefix}: git-blob evidence requires a path")
            if not isinstance(item.get("url"), str) or not item["url"].startswith(
                f"https://github.com/{repo}/blob/"
            ):
                errors.append(f"{prefix}: evidence source must be a GitHub blob URL")
        elif item.get("kind") == "web":
            if not isinstance(item.get("url"), str) or not item["url"].startswith("https://"):
                errors.append(f"{prefix}: web evidence requires an authoritative HTTPS URL")
            if not valid_date(item.get("verified_at")):
                errors.append(f"{prefix}: web evidence requires verified_at")
        else:
            errors.append(f"{prefix}: unknown evidence kind {item.get('kind')!r}")
```

In `validate_specifications`, replace everything from `evidence_items = specification.get("evidence")` through the `else: errors.append(... unknown evidence kind ...)` block with:

```python
        validate_evidence_items(specification.get("evidence"), repo, prefix, errors)
```

5. Add `validate_packs` directly after `validate_specifications`:

```python
def validate_packs(
    packs_data: dict[str, Any],
    tax: Taxonomy,
    specification_ids: set[str],
    index: ProjectIndex,
    errors: list[str],
) -> list[Any]:
    """Validate unscored agent-pack records: what a host installs, never what it does (ADR 032)."""
    enum_ids = tax.enum_ids
    packs_value = validate_collection_envelope(packs_data, "packs.json", "1.0", "packs", errors)
    pack_ids = {
        item.get("id") for item in packs_value
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for pack in packs_value:
        if not isinstance(pack, dict):
            errors.append("packs.json: every pack must be an object")
            continue
        prefix = f"pack {pack.get('id', 'unknown')}"
        for field in sorted(PACK_FORBIDDEN & set(pack)):
            errors.append(f"{prefix}: {field} is never recorded on a pack")
        fields = set(pack) - PACK_FORBIDDEN
        if PACK_REQUIRED - fields or fields - PACK_REQUIRED - PACK_OPTIONAL:
            missing = sorted(PACK_REQUIRED - fields)
            extra = sorted(fields - PACK_REQUIRED - PACK_OPTIONAL)
            errors.append(f"{prefix}: fields differ from schema: missing={missing}, extra={extra}")
        pack_id = pack.get("id")
        if not isinstance(pack_id, str) or not ID_PATTERN.fullmatch(pack_id):
            errors.append(f"{prefix}: invalid id")
        for field in ("name", "steward", "url", "description", "installs", "not_a_system", "license_note"):
            if not isinstance(pack.get(field), str) or not pack[field].strip():
                errors.append(f"{prefix}: {field} must be a non-empty string")
        for field in ("short_name", "distribution_machinery"):
            if field in pack and (not isinstance(pack[field], str) or not pack[field].strip()):
                errors.append(f"{prefix}: {field} must be a non-empty string when present")
        if not isinstance(pack.get("url"), str) or not pack["url"].startswith("https://"):
            errors.append(f"{prefix}: url must be authoritative HTTPS")
        repo = pack.get("repo")
        if not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo):
            errors.append(f"{prefix}: invalid GitHub repository")
            repo = None
        elif repo.lower() in index.repos:
            errors.append(f"{prefix}: {repo} cannot be both a system and a pack")
        if pack.get("pack_type") not in enum_ids["pack_types"]:
            errors.append(f"{prefix}: unknown pack type")
        if pack.get("install_mechanism") not in enum_ids["pack_install_mechanisms"]:
            errors.append(f"{prefix}: unknown install mechanism")
        if pack.get("status") not in enum_ids["project_statuses"]:
            errors.append(f"{prefix}: unknown status")
        validate_string_list(pack, "hosts", enum_ids["pack_hosts"], prefix, errors)
        validate_string_list(pack, "licenses", enum_ids["licenses"], prefix, errors)
        validate_string_list(
            pack, "packaging_formats", specification_ids, prefix, errors, allow_empty=True,
        )
        if "related_packs" in pack:
            validate_string_list(pack, "related_packs", pack_ids, prefix, errors, allow_empty=True)
            if pack_id in pack.get("related_packs", []):
                errors.append(f"{prefix}: cannot relate to itself")
        if "related_systems" in pack:
            validate_string_list(pack, "related_systems", index.ids, prefix, errors, allow_empty=True)
        if not valid_date(pack.get("verified_at")):
            errors.append(f"{prefix}: verified_at must be an ISO date")
        validate_evidence_items(pack.get("evidence"), repo, prefix, errors)
        validate_scoped_license_evidence(pack, repo, prefix, errors)
    return packs_value
```

6. `validate_unique_record_ids` gains a keyword parameter and one tuple row:

```python
def validate_unique_record_ids(
    projects: list[dict[str, Any]],
    specifications_value: list[Any],
    inference_services_value: list[Any],
    local_runtimes_value: list[Any],
    models_value: list[Any],
    errors: list[str],
    packs_value: list[Any] | None = None,
) -> None:
    """No identifier may name a record in more than one collection."""
    collection_ids: dict[str, list[str]] = {}
    for collection_name, collection_records in (
        ("projects.json", projects),
        ("specifications.json", specifications_value),
        ("inference-services.json", inference_services_value),
        ("local-runtimes.json", local_runtimes_value),
        ("models.json", models_value),
        ("packs.json", packs_value or []),
    ):
```

(the loop body is unchanged).

7. In `validate()`, after `models_value = validate_models(...)`:

```python
    specification_ids = {
        item["id"] for item in specifications_value
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    packs_value = validate_packs(catalog["packs.json"], tax, specification_ids, index, errors)
    pack_repos = {
        item["repo"].lower() for item in packs_value
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    }
```

Pass `packs_value=packs_value` to `validate_unique_record_ids`, and change the exclusions call to `validate_exclusions(catalog["exclusions.json"], index.repos | pack_repos, candidate_repos, errors)`.

8. In `main()`, add `pack_count = len(load("packs.json")["packs"])` and extend the print with `f"{pack_count} unscored agent packs; "` before the models.dev clause.

9. `scripts/sync_web_data.py` `PUBLISHED_DATA` gains `"packs.json",` after `"models-dev.json",`.

10. `scripts/promote_system_candidate.py`: load `packs_data = load_json(directory / "packs.json")` beside the other collections, and pass `packs_value=packs_data.get("packs") if isinstance(packs_data.get("packs"), list) else []` to `validate_unique_record_ids`. `scripts/promote_model_candidate.py`: same two changes at its `validate_unique_record_ids` call. In `tests/test_promote_system_candidate.py:89` and `tests/test_promote_model_candidate.py:78`, add `"packs.json"` to the tuple of files copied from `ROOT / "directory"`.

- [ ] **Step 6: Run the validator tests**

Run: `uv run python -m unittest tests.test_validation_policy tests.test_directory tests.test_promote_system_candidate tests.test_promote_model_candidate -v`
Expected: PASS, including every `test_pack_*` case.

- [ ] **Step 7: List the file on every agent-facing surface**

`web/llms.txt` Data section, after the `models-dev.json` bullet:

```
- [packs.json](https://peacefulcoexistance.com/packs.json): unscored agent packs a host agent installs, recorded for what each one installs, its hosts, install mechanism, and licence
```

`web/index.html`, after the `specifications.json` endpoint article (the `<article class="endpoint">` block at lines 283-288):

```html
        <article class="endpoint">
          <h2><a class="endpoint-link" href="https://peacefulcoexistance.com/packs.json">packs.json</a></h2>
          <p>Agent packs a host agent installs — skills bundles, plugins, process kits, vault bundles, and marketplaces — recorded for what each installs, into which hosts, by which mechanism, and under which licence. Never scored.</p>
          <p class="endpoint-shape"><code>packs[]</code> · <code>verified_at</code> · <code>version</code></p>
        </article>
```

`AGENTS.md:88`: in the hard rule beginning "Keep only `projects.json`, ...", insert `` `packs.json`, `` after `` `models.json`, ``.

`README.md`: after the `directory/models-dev.json` line add
`directory/packs.json          reviewed unscored agent packs a host agent installs`.

`skills/ai-systems-atlas/SKILL.md` table: after the `local-runtimes.json` row add
`| Skills bundles, plugins, process kits, vault bundles, and plugin marketplaces a host agent installs | \`packs.json\` |`.

`skills/ai-systems-atlas/reference.md`: envelope bullet `` - `packs.json`: `{version, verified_at, packs: [...]}` `` after the `local-runtimes.json` bullet, and a section after the `specifications.json` fields section:

```markdown
## `packs.json` record fields

`id, name, short_name, steward, repo, url, description, pack_type, hosts, packaging_formats, install_mechanism, installs, distribution_machinery, not_a_system, status, licenses, license_note, license_evidence, related_packs, related_systems, evidence, verified_at`

Never scored and never carrying stars. `pack_type` is one of `skills_bundle`, `plugin`, `process_kit`, `vault_bundle`, `marketplace`; `hosts` and `install_mechanism` use the `pack_hosts` and `pack_install_mechanisms` taxonomy groups; `packaging_formats` names `specifications.json` records. `installs` states what the pack places in the host, counted from its pinned tree; `not_a_system` states why it is not a scored record. A marketplace record never lists, counts, or reviews its entries. See [docs/PACKS.md](../../docs/PACKS.md).
```

`docs/DATA_MODEL.md`: change "synchronized copies of nine files" to "ten files"; add the table row `| \`packs.json\` | Reviewed, unscored agent packs recorded for what a host installs | Yes |` after the `models-dev.json` row; and add after the "Specification record" section:

```markdown
## Pack record

Pack records are independent from project records. They contain no `system_family`, role, score profile, score, or popularity metric, and the validator rejects each if present.

- **Identity:** `id`, `name`, optional `short_name`, one `steward`, GitHub `repo`, authoritative `url`, and `description`.
- **Classification:** taxonomy-backed `pack_type`, non-empty `hosts` (`pack_hosts`), `install_mechanism` (`pack_install_mechanisms`), and `packaging_formats` naming `specifications.json` records (may be empty).
- **Composition:** `installs`, a paragraph counting what the pack places in the host from its pinned manifest and tree; optional `distribution_machinery` naming shipped install, sync, or validation scripts.
- **Boundary:** `not_a_system` states why the pack is unscored in ADR 031's terms, or that a marketplace lists packs rather than being one.
- **Lifecycle:** `status` from `project_statuses`.
- **Licensing:** complete `licenses`, `license_note`, and scoped `license_evidence`; `LicenseRef-Unclear` when no licence file is served.
- **Relationships:** optional `related_packs` and `related_systems` reference records by id without implying compatibility.
- **Review:** pinned `evidence` (manifest or skill frontmatter as a Git blob, plus dated web sources) and human-owned `verified_at`. A marketplace's `verified_at` dates its pinned manifest, never the catalogue behind it.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`; see [ADR 032](adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md).
```

- [ ] **Step 8: Run the published-list guards and the full Python suite**

Run: `node --test tests/test_web.js && uv run python scripts/validate_directory.py && uv run ruff check scripts tests && uv run python -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: `llms.txt`/API-view tests PASS; the validator prints `0 unscored agent packs`; unittest ends `OK`. (Playwright is not run yet.)

- [ ] **Step 9: Commit**

```bash
git add directory/taxonomy.json directory/packs.json web/packs.json web/taxonomy.json scripts/validate_directory.py scripts/sync_web_data.py scripts/promote_system_candidate.py scripts/promote_model_candidate.py web/llms.txt web/index.html AGENTS.md README.md skills/ai-systems-atlas docs/DATA_MODEL.md tests/test_validation_policy.py tests/test_directory.py tests/test_promote_system_candidate.py tests/test_promote_model_candidate.py
git commit -m "Publish an empty Agent packs collection with validation

Adds directory/packs.json, its taxonomy groups, validate_packs, and the
file's entry on every agent-facing surface, per ADR 032's design spec.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Run `uv run python scripts/sync_web_data.py` first so `web/taxonomy.json` matches.)

---

### Task 2: Reach the new collection from every auxiliary script

Refresh staging, review age, evidence-link drift, candidate cross-collection hits, and discovery dedupe all enumerate collections by hand.

**Files:**
- Modify: `scripts/run_directory_refresh.py:41-56`, `scripts/report_review_age.py:21-27`, `scripts/check_evidence_links.py:311-341`, `scripts/build_candidate_evidence.py:36-44`, `scripts/update_directory.py:51,619-635,673-678,693`
- Test: `tests/test_documentation.py` (staging test already exists), `tests/test_review_age.py:18-38`, `tests/test_evidence_links.py:85-100,130-136`, `tests/test_candidate_evidence.py:608-626`, `tests/test_update_directory.py:579-600`

**Interfaces:**
- Consumes: `directory/packs.json` from Task 1.
- Produces: `update_directory.PACKS_PATH`; `known_urls_from(projects, exclusions, packs=())`; `known_repos_from(projects, exclusions, packs)`.

- [ ] **Step 1: Write the failing tests**

`tests/test_review_age.py`: add `packs: tuple[dict, ...] = ()` to `write_catalog`'s signature and `"packs.json": {"packs": list(packs)}` to its `files`. Add a test beside the existing runtime tests:

```python
    def test_packs_are_reported_with_their_evidence_age(self) -> None:
        (row,) = self.rows(packs=(record("kit", "2026-09-10", evidence=[{"verified_at": "2026-08-01"}]),))
        self.assertEqual("packs", row.collection)
        self.assertEqual(date(2026, 8, 1), row.oldest_evidence.on)
        self.assertIsNone(row.metadata, "a pack carries no stars_verified_at, so no metadata column")
```

(`self.rows` and `record` are the helpers the existing tests in that class already use; `rows` calls `write_catalog(self.directory, **catalog)`, which is why `write_catalog` must accept `packs`.)

`tests/test_evidence_links.py`: in the first fixture (line 85 block) add

```python
                "packs.json": {"packs": [{
                    "id": "kit", "url": "https://example.com/kit", "verified_at": "2026-08-08",
                    "evidence": [{"kind": "git_blob", "url": "https://example.com/kit-manifest", "immutable_url": "https://api.github.com/kit-blob"}],
                    "license_evidence": [],
                }]},
```

raise the expected count `self.assertEqual(7, len(targets))` to `10` (record url, evidence url, immutable url), and assert `self.assertEqual(("packs:kit:url",), by_url["https://example.com/kit"].references)`. In the trust fixture (line 130 block) add `"packs.json": {"packs": []},`.

`tests/test_candidate_evidence.py` `LoadCatalogTests`: add `"packs.json": {"packs": [{"id": "k"}]}` to `contents` and `self.assertEqual([{"id": "k"}], catalog["packs.json"])`.

`tests/test_update_directory.py` `KnownUrlTests`: add

```python
    def test_a_pack_url_and_repo_join_the_known_sets(self) -> None:
        """A pack is a decided record; discovery must not re-queue it as a candidate."""
        packs = [{"repo": "Obra/Superpowers", "url": "https://github.com/obra/superpowers"}]
        known = update_directory.known_urls_from([], {"entries": []}, packs)
        self.assertIn("https://github.com/obra/superpowers", known)
        repos = update_directory.known_repos_from([], {"entries": []}, packs)
        self.assertEqual({"obra/superpowers"}, repos)
```

and in `test_all_official_source_failures_abort_before_writes` add `update_directory.PACKS_PATH: {"packs": []},` to `documents`.

- [ ] **Step 2: Run them to see them fail**

Run: `uv run python -m unittest tests.test_review_age tests.test_evidence_links tests.test_candidate_evidence tests.test_update_directory -v 2>&1 | tail -20`
Expected: failures naming `packs`, `known_repos_from`, or `PACKS_PATH`.

- [ ] **Step 3: Implement**

`scripts/run_directory_refresh.py`: add `"directory/packs.json",` to `STAGED_DIRECTORY_FILES` after `"directory/specifications.json",`.

`scripts/report_review_age.py`: add `("packs", "packs.json", "packs"),` to `COLLECTIONS` after the specifications row.

`scripts/check_evidence_links.py`: the loop at line 311 becomes

```python
    for filename, key, collection in (
        ("local-runtimes.json", "runtimes", "local-runtimes"),
        ("models.json", "models", "models"),
        ("packs.json", "packs", "packs"),
    ):
```

(the body already adds the record url, `evidence`, and `license_evidence`).

`scripts/build_candidate_evidence.py`: add `"packs.json"` to `CATALOG_FILES` and `"packs.json": "packs"` to `COLLECTION_KEYS`.

`scripts/update_directory.py`: add `PACKS_PATH = DIRECTORY / "packs.json"` after `LOCAL_RUNTIMES_PATH`. Replace `known_urls_from` and add `known_repos_from`:

```python
def known_urls_from(
    projects: list[dict[str, Any]], exclusions: dict[str, Any], packs: list[dict[str, Any]] = (),
) -> set[str]:
    """Return every URL discovery should treat as already decided.

    An exclusion is a durable human rejection. Without its URL the weekly refresh
    re-adds the same non-GitHub page forever; 10 of the 70 entries have no repo at
    all, so `repo` alone cannot carry the rejection. A pack is a decided record too.
    """
    known = {project["url"] for project in projects if isinstance(project.get("url"), str)}
    known.update(
        item["url"]
        for item in exclusions.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("url"), str)
    )
    known.update(pack["url"] for pack in packs if isinstance(pack.get("url"), str))
    return known


def known_repos_from(
    projects: list[dict[str, Any]], exclusions: dict[str, Any], packs: list[dict[str, Any]] = (),
) -> set[str]:
    """Return every lower-cased repository discovery should treat as already decided."""
    known = {project["repo"].lower() for project in projects if project.get("repo")}
    known.update(
        item["repo"].lower()
        for item in exclusions.get("entries", [])
        if isinstance(item, dict) and isinstance(item.get("repo"), str)
    )
    known.update(pack["repo"].lower() for pack in packs if isinstance(pack.get("repo"), str))
    return known
```

In `main()`: load `packs_document = load_json(PACKS_PATH, {"version": "1.0", "verified_at": None, "packs": []})` beside `local_runtimes_document`; replace the inline `known_projects = {...}; known_projects.update(...)` block with `known_projects = known_repos_from(projects, exclusions, packs_document["packs"])`; and change `known_urls = known_urls_from(projects, exclusions)` to `known_urls = known_urls_from(projects, exclusions, packs_document["packs"])`. Do not write `packs.json` back; the updater never touches it.

- [ ] **Step 4: Run the tests**

Run: `uv run python -m unittest tests.test_review_age tests.test_evidence_links tests.test_candidate_evidence tests.test_update_directory tests.test_documentation tests.test_run_directory_refresh -v 2>&1 | tail -5`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/run_directory_refresh.py scripts/report_review_age.py scripts/check_evidence_links.py scripts/build_candidate_evidence.py scripts/update_directory.py tests/test_review_age.py tests/test_evidence_links.py tests/test_candidate_evidence.py tests/test_update_directory.py
git commit -m "Reach packs.json from refresh staging, review age, link drift, triage, and discovery

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Project packs into the app payload, share pages, asset stamps, and logo map

**Files:**
- Modify: `scripts/build_web_payload.py:19-88`, `scripts/build_share_pages.py:33-45,70-82,100-153`, `scripts/build_asset_version.mjs:25-29`, `scripts/build_logos.mjs:248-253`
- Test: `tests/test_web_payload.py:53-58,114-126`, `tests/test_share_pages.py:24-36,46-50,72-79`, `tests/test_web.js:643-652`

**Interfaces:**
- Produces: payload files `app/packs.json`, `app/search/packs.json`, `app/detail/pack/<id>.json`; share pages `records/packs/<id>/index.html`; `COLLECTIONS["pack"]` and `COLLECTION_LABELS["pack"] == "Agent pack"` in the share builder.

- [ ] **Step 1: Write the failing tests**

`tests/test_web_payload.py`: in `test_boot_carries_the_dates_the_page_prints` change the tuple to `("inference", "runtimes", "specifications", "models", "packs")`; in `test_one_detail_file_per_record` add `("packs.json", "packs"),` to the tuple; add

```python
    def test_packs_are_unscored_and_boot_carries_only_card_fields(self) -> None:
        boot = json.loads(self.payloads["app/packs.json"])
        self.assertIn("packs", boot)
        for entry in boot["packs"]:
            self.assertNotIn("score", entry)
            self.assertNotIn("installs", entry, "installs is detail-only prose")
            self.assertIn("pack_type", entry)
```

`tests/test_share_pages.py`: in `test_share_page_path_maps_each_collection_and_rejects_others` add `self.assertEqual("records/packs/kit/index.html", share_page_path("pack", "kit"))`; in `test_every_record_gets_a_page_plus_sitemap_and_robots` add `"packs"` to the `for key in (...)` tuple.

`tests/test_web.js` `every app payload class is versioned`: change the loop list to `["systems", "inference", "runtimes", "specifications", "packs"]`.

- [ ] **Step 2: Run them to see them fail**

Run: `uv run python -m unittest tests.test_web_payload tests.test_share_pages -v 2>&1 | tail -8`
Expected: `KeyError: 'app/packs.json'` and `ValueError: unknown record kind: pack`.

- [ ] **Step 3: Implement**

`scripts/build_web_payload.py`:

```python
COLLECTIONS = (
    ("systems", "projects.json", "projects", "system"),
    ("inference", "inference-services.json", "services", "inference"),
    ("runtimes", "local-runtimes.json", "runtimes", "runtime"),
    ("specifications", "specifications.json", "specifications", "spec"),
    ("models", "models.json", "models", "model"),
    ("packs", "packs.json", "packs", "pack"),
)
```

In `BOOT_FIELDS` add

```python
    "packs": (
        "id", "name", "short_name", "steward", "repo", "url", "description", "pack_type",
        "hosts", "install_mechanism", "packaging_formats", "licenses", "status",
    ),
```

and in `SEARCH_FIELDS` add

```python
    "packs": (
        "id", "name", "short_name", "steward", "repo", "description", "installs", "not_a_system",
    ),
```

`scripts/build_share_pages.py`: add `"pack": ("packs", "packs"),` to `COLLECTIONS` and `"pack": "Agent pack",` to `COLLECTION_LABELS`; add `"packs": read("packs.json")["packs"],` to `load_catalog`; and in `_facts_for`, before the local-runtime fallthrough, add

```python
    if kind == "pack":
        eyebrow = f"Agent pack · {taxonomy_name(taxonomy, 'pack_types', record['pack_type'])}"
        facts = [
            ("Steward", record["steward"]),
            ("Hosts", names(taxonomy, "pack_hosts", record["hosts"])),
            ("Install", taxonomy_name(taxonomy, "pack_install_mechanisms", record["install_mechanism"])),
            ("Licenses", names(taxonomy, "licenses", record["licenses"])),
            ("Status", humanize(record["status"])),
            ("Installs", record["installs"]),
        ]
        return eyebrow, record["description"], facts, "CreativeWork", "Open repository"
```

`scripts/build_asset_version.mjs`: add `"app/packs.json",` to the first list and `"app/search/packs.json",` to the search list.

`scripts/build_logos.mjs`: add `["web/packs.json", "packs"],` to the `recordNames` source list so a mark can be mapped later; this design maps none.

- [ ] **Step 4: Regenerate and run the tests**

Run:

```bash
uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && node scripts/build_asset_version.mjs && node scripts/build_logos.mjs --check && uv run python -m unittest tests.test_web_payload tests.test_share_pages -v 2>&1 | tail -5 && node --test tests/test_web.js 2>&1 | tail -5
```

Expected: payload and share builders report their file counts; unittest `OK`; node tests pass (the versioned-payload test now sees `app/packs.json`).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_web_payload.py scripts/build_share_pages.py scripts/build_asset_version.mjs scripts/build_logos.mjs web/app web/index.html web/sitemap.xml tests/test_web_payload.py tests/test_share_pages.py tests/test_web.js
git commit -m "Project the packs collection into app payloads, share pages, and asset stamps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Pure filtering and reference parsing for packs in app-core.js

**Files:**
- Modify: `web/app-core.js:147-175` (view descriptors), `:209-219` (`filterDirectoryEntries`), `:247` (`RECORD_KINDS`), `:269-276` (`shareRecordPath`), `:436-459` (exports)
- Test: `tests/test_web.js`

**Interfaces:**
- Produces: `PACK_VIEW`; `filterPacks(packs, filters)`; `filterDirectoryEntries(projects, services, runtimes, models, filters, packs = [])` reading `filters.packSearchIndex`; `parseRecordReference("pack:id")`; `shareRecordPath("pack", id) === "records/packs/<id>/"`.

- [ ] **Step 1: Write the failing tests**

Add `filterPacks` to the `require` destructuring at the top of `tests/test_web.js`, then append after the `share record paths` test:

```js
const packs = [
  { id: "superpowers", name: "Superpowers", steward: "obra", description: "A development methodology as skills.", pack_type: "process_kit", hosts: ["claude_code", "codex"], install_mechanism: "host_marketplace", licenses: ["MIT"], evidence: [{ url: "https://hidden.example/manifest" }] },
  { id: "kit", name: "Brain Kit", steward: "coleam00", description: "A vault starter.", pack_type: "vault_bundle", hosts: ["claude_code"], install_mechanism: "clone_template", licenses: ["LicenseRef-Unclear"], evidence: [] },
  { id: "market", name: "Agent Market", steward: "dave", description: "A marketplace manifest.", pack_type: "marketplace", hosts: ["claude_code"], install_mechanism: "host_marketplace", licenses: ["MIT"], evidence: [] },
];

test("pack filters combine type, host, install mechanism, and licence, sorted by name only", () => {
  assert.deepEqual(filterPacks(packs, {}).map(item => item.name), ["Agent Market", "Brain Kit", "Superpowers"]);
  assert.deepEqual(filterPacks(packs, { sort: "score" }).map(item => item.name), ["Agent Market", "Brain Kit", "Superpowers"]);
  assert.deepEqual(filterPacks(packs, { type: "marketplace" }).map(item => item.name), ["Agent Market"]);
  assert.deepEqual(filterPacks(packs, { host: "codex" }).map(item => item.name), ["Superpowers"]);
  assert.deepEqual(filterPacks(packs, { install: "clone_template" }).map(item => item.name), ["Brain Kit"]);
  assert.deepEqual(filterPacks(packs, { license: "MIT" }).map(item => item.name), ["Agent Market", "Superpowers"]);
});

test("pack search covers identity and steward prose but not evidence URLs", () => {
  assert.deepEqual(filterPacks(packs, { term: "coleam00" }).map(item => item.name), ["Brain Kit"]);
  assert.deepEqual(filterPacks(packs, { term: "hidden" }), []);
  assert.deepEqual(filterPacks(packs, { term: "manifest", searchIndex: { superpowers: "manifest words" } }).map(item => item.name), ["Agent Market", "Superpowers"]);
});

test("mixed directory browsing includes packs and reads their own index key", () => {
  const combinedProjects = [{ ...projects[3], id: "agent", description: "Coding system" }];
  const entries = filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, {}, packs);
  assert.ok(entries.some(item => item.kind === "pack" && item.record.name === "Superpowers"));
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "Superpowers" }, packs).map(item => [item.kind, item.record.name]),
    [["pack", "Superpowers"]],
  );
  assert.deepEqual(
    filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "onlyinindex", packSearchIndex: { kit: "onlyinindex" } }, packs).map(item => item.record.name),
    ["Brain Kit"],
  );
  assert.deepEqual(filterDirectoryEntries(combinedProjects, inferenceServices, localRuntimes, models, { term: "Superpowers" }), []);
});
```

Extend the existing `record references parse only a known kind` test with `assert.deepEqual(parseRecordReference("pack:superpowers"), { kind: "pack", id: "superpowers" });` and the `share record paths` test with `assert.equal(shareRecordPath("pack", "superpowers"), "records/packs/superpowers/");`. Extend `specifications, models, and unknown kinds or families get no badges` with `assert.deepEqual(cardBadges("pack", packs[0]), []);`.

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/test_web.js 2>&1 | grep -E "^not ok|filterPacks" | head`
Expected: `filterPacks is not a function` and the pack reference/share assertions fail.

- [ ] **Step 3: Implement**

In `web/app-core.js`, after `MODEL_VIEW`:

```js
  // Packs are unscored (ADR 032): the shared collection filter is reused for its
  // facets and search, and the sort is pinned to name so no caller can ask for a
  // score order that does not exist.
  const PACK_VIEW = {
    searchFields: ["id", "name", "short_name", "steward", "repo", "description"],
    facets: {
      type: "pack_type",
      host: "hosts",
      install: "install_mechanism",
      license: "licenses",
    },
  };

  function filterPacks(packs, filters = {}) {
    return filterScoredCollection(packs, { ...filters, sort: "name" }, PACK_VIEW);
  }
```

Change `filterDirectoryEntries` to take packs after filters (existing call sites stay valid) and add its entries and index key:

```js
  function filterDirectoryEntries(projects, services, runtimes = [], models = [], filters = {}, packs = []) {
    const term = (filters.term || "").trim().toLowerCase();
    const entries = [
      ...projects.filter(project => matchesDirectoryProjectSearch(project, term, filters.searchIndex)).map(record => ({ kind: "system", record })),
      ...filterInferenceServices(services, { term, sort: "name", searchIndex: filters.serviceSearchIndex }).map(record => ({ kind: "inference", record })),
      ...filterLocalRuntimes(runtimes, { term, sort: "name", searchIndex: filters.runtimeSearchIndex }).map(record => ({ kind: "runtime", record })),
      ...filterModels(models, { term, sort: "name", searchIndex: filters.modelSearchIndex }).map(record => ({ kind: "model", record })),
      ...filterPacks(packs, { term, searchIndex: filters.packSearchIndex }).map(record => ({ kind: "pack", record })),
    ];
```

Update the comment above it to name `filters.packSearchIndex`. Change `RECORD_KINDS` to `["system", "spec", "inference", "runtime", "model", "pack"]`; add `if (kind === "pack") return \`records/packs/${id}/\`;` to `shareRecordPath`; export `filterPacks` in the returned object (alphabetical position after `filterModels`).

- [ ] **Step 4: Run the tests**

Run: `node --test tests/test_web.js 2>&1 | tail -4 && node --check web/app-core.js && npm run lint:js`
Expected: all pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add web/app-core.js tests/test_web.js
git commit -m "Filter, search, and reference agent packs in app-core

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Packs Directory scope, mixed cards, and detail dialog

**Files:**
- Modify: `web/index.html:83-92` (switcher), `:145-158` (new panel after runtimes), `:284` (API view already done), `:331-334` (new dialog after runtime dialog)
- Modify: `web/app.js:17-26` (state), `:168-183` (bootstrap), `:380-425` (`COLLECTION_FILTERS`), `:481-495` (`renderStats`), `:518-543` (`setDirectoryCollection`), `:547-561` (pagers), `:637-690` (mixed cards), `:757-878` (`COLLECTIONS` views), `:906-925` (renderers), `:1197-1230` (taxonomy groups), `:1520-1590` (dialogs), `:1619-1629` (`RECORD_DIALOG_SELECTORS`, `openRecord`), `:1940-1945` (`SEARCH_SCOPES`), `:1986-2016` (listeners and reset), `:2088-2089` (dialog close)
- Modify: `web/styles.css:56-60,131-135,193-197` (`--card-pack` token in all three palette blocks), `:676-677` (card class)
- Test: `tests/test_web.js` (stylesheet guards already run), manual browser check in Task 8

**Interfaces:**
- Consumes: `AtlasCore.filterPacks`, `filterDirectoryEntries(..., packs)`, payload `app/packs.json`, `app/search/packs.json`, `app/detail/pack/<id>.json`.
- Produces: DOM ids `#packs-directory-panel`, `#pack-search`, `#pack-type-filter`, `#pack-host-filter`, `#pack-install-filter`, `#pack-license-filter`, `#pack-result-count`, `#reset-pack-filters`, `#pack-grid`, `#pack-pager`, `#pack-collection-count`, `#pack-dialog`, `#pack-dialog-content`; functions `openPack(id)`, `packDialogMarkup(pack)`, `renderPacks()`; `data-pack` buttons; URL `?collection=packs`.

- [ ] **Step 1: Markup**

`web/index.html` switcher: after the Local runtimes button add

```html
        <button data-directory-collection="packs" aria-pressed="false"><span>Agent packs</span><strong id="pack-collection-count"></strong></button>
```

After `#runtimes-directory-panel`'s closing `</div>` add:

```html
      <div id="packs-directory-panel" class="collection-panel" hidden>
        <section class="control-panel inference-controls" aria-label="Agent pack filters">
          <label class="search-field"><span>Search</span><input id="pack-search" type="search" placeholder="Search packs and stewards" autocomplete="off"></label>
          <label><span>Type</span><select id="pack-type-filter"><option value="">All types</option></select></label>
          <label><span>Host</span><select id="pack-host-filter"><option value="">All hosts</option></select></label>
          <label><span>Install</span><select id="pack-install-filter"><option value="">All install mechanisms</option></select></label>
          <label><span>License</span><select id="pack-license-filter"><option value="">All licenses</option></select></label>
          <p class="filter-guidance">Packs are documents a host agent installs and reads. They are recorded for what they install, never scored, and never compared. A pack that runs its own code is reviewed as a system instead. <button data-open-tab="taxonomy">How packs are classified →</button></p>
        </section>
        <div class="result-row"><p id="pack-result-count" aria-live="polite"></p><button id="reset-pack-filters" class="ghost-button">Clear filters</button></div>
        <section id="pack-grid" class="project-grid inference-grid" aria-label="Reviewed agent packs"></section>
        <nav id="pack-pager" class="pager" aria-label="Agent packs pagination"></nav>
      </div>
```

After `#runtime-dialog` add:

```html
  <dialog id="pack-dialog">
    <button class="dialog-close" aria-label="Close">×</button>
    <div id="pack-dialog-content"></div>
  </dialog>
```

`web/styles.css`: add `--card-pack: linear-gradient(145deg, #f7fdfa, #fff 68%);` after `--card-runtime` on `:root`, and `--card-pack: linear-gradient(145deg, rgba(94, 200, 160, .07), var(--panel) 68%);` after `--card-runtime` in **both** dark blocks (the stylesheet test fails if the two dark blocks differ). After the `.local-runtime-card::before` rule add:

```css
.agent-pack-card { min-height: 380px; background: var(--card-pack); }
.agent-pack-card::before { background: var(--cyan); }
```

(`--cyan` is the teal accent already defined on `:root` and in both dark blocks; never add a colour literal outside `:root`.)

- [ ] **Step 2: State, boot, filters, stats, scope**

`web/app.js`:

- `state`: add `packs: []` after `models: []`, and `packs: 1` in `page`.
- `bootstrap`: load `loadJSON("app/packs.json")` as a seventh entry; `state.packs = packs.packs;` and include `packs.verified_at` in `dataDate`.
- `COLLECTION_FILTERS`: add

```js
  packs: {
    records: () => state.packs,
    groups: [
      ["pack_types", "#pack-type-filter", item => [item.pack_type]],
      ["pack_hosts", "#pack-host-filter", item => item.hosts],
      ["pack_install_mechanisms", "#pack-install-filter", item => [item.install_mechanism]],
    ],
    licenseFilter: "#pack-license-filter",
  },
```

- `renderStats`: `const total = state.projects.length + state.inferenceServices.length + state.localRuntimes.length + state.models.length + state.packs.length;`, kicker text `${total} systems, source models, services, runtimes, and packs`, and `$("#pack-collection-count").textContent = state.packs.length;`.
- `setDirectoryCollection`: allowed list `["all", "systems", "inference", "runtimes", "packs"]`; `$("#packs-directory-panel").hidden = selected !== "packs";`; `packs: renderPacks` in `renderers`; `["packs", "#pack-grid"]` in the grid list. Packs are never `compatible`, so an existing comparison clears on entering the scope, which is the ADR 014 rule.
- `PAGE_CONTAINERS`: `packs: "#pack-pager"`; `pageRenderer`: `packs: renderPacks`; `renderSearchSurfaces` renderers: `packs: renderPacks`.
- `SEARCH_SCOPES`: `"#pack-search": ["packs"]`, and `"#all-directory-search": ["systems", "inference", "runtimes", "models", "packs"]`.
- `activateView`: accept `id === "agent-packs"` the way it accepts `"local-runtimes"` (`setDirectoryCollection("packs"); id = "directory";`).

- [ ] **Step 3: Cards, dialog, and events**

Add to `COLLECTIONS` (the view registry) after `runtimes`:

```js
  packs: {
    grid: "#pack-grid",
    resultCount: "#pack-result-count",
    pageKey: "packs",
    dataset: "pack",
    noun: ["pack", "packs"],
    empty: "No agent packs match these filters.",
    open: id => openPack(id),
    context: () => ({ suffix: " · Unscored", comparable: false }),
    records: () => AtlasCore.filterPacks(state.packs, {
      term: $("#pack-search").value,
      searchIndex: searchIndexes.packs,
      type: $("#pack-type-filter").value,
      host: $("#pack-host-filter").value,
      install: $("#pack-install-filter").value,
      license: $("#pack-license-filter").value,
    }),
    card: pack => packCard(pack),
  },
```

Add these functions near `badgeRow`:

```js
function packHosts(pack) {
  return pack.hosts.map(item => taxonomyName("pack_hosts", item)).join(" · ");
}

function packCard(pack, { mixed = false } = {}) {
  const typeLabel = taxonomyName("pack_types", pack.pack_type);
  return `<article class="project-card agent-pack-card${mixed ? " mixed-directory-card" : ""}">
    <div class="card-top"><div class="card-identity">${cardMark(pack)}<div><p class="family-label">${mixed ? "Agent pack · " : ""}${escapeHTML(typeLabel)}</p><h2>${escapeHTML(pack.name)}</h2><div class="repo">${escapeHTML(pack.steward)}</div></div></div></div>
    <span class="role-badge">${escapeHTML(packHosts(pack))}</span>
    <div class="license-row">${pack.licenses.map(item => `<span class="license-badge" title="${escapeHTML(licenseName(item))}">${escapeHTML(item)}</span>`).join("")}</div>
    <p>${escapeHTML(pack.description)}</p>
    <div class="card-footer"><span>${escapeHTML(taxonomyName("pack_install_mechanisms", pack.install_mechanism))}${pack.status === "active" ? "" : ` · ${escapeHTML(label(pack.status))}`}</span><button data-pack="${escapeHTML(pack.id)}">View details →</button></div>
  </article>`;
}
```

In `renderAllDirectoryEntries`: pass `state.packs` as the sixth argument and `packSearchIndex: searchIndexes.packs` in the filters; add `if (kind === "pack") return packCard(record, { mixed: true });` before the runtime branch; bind `$$('[data-pack]', $("#all-directory-grid")).forEach(button => button.addEventListener("click", () => openPack(button.dataset.pack)));`; change the empty notice to `No systems, model releases, inference services, local runtimes, or agent packs match this search.`; update the comment that says four collections.

Add the dialog markup function after `specificationDialogMarkup`:

```js
function packDialogMarkup(pack) {
  const formats = (pack.packaging_formats || []).map(id => state.specifications.find(item => item.id === id)).filter(Boolean);
  const relatedPacks = (pack.related_packs || []).map(id => state.packs.find(item => item.id === id)).filter(Boolean);
  const relatedSystems = (pack.related_systems || []).map(id => state.projects.find(item => item.id === id)).filter(Boolean);
  return `<p class="eyebrow">Agent pack · ${escapeHTML(taxonomyName("pack_types", pack.pack_type))} · Unscored</p><h1>${escapeHTML(pack.name)}</h1><p>${escapeHTML(pack.description)}</p>
    <div class="detail-grid">
      <section class="detail-block"><h3>Pack identity</h3><p><strong>Steward:</strong> ${escapeHTML(pack.steward)}</p><p><strong>Status:</strong> ${escapeHTML(label(pack.status))}</p><p><strong>Hosts:</strong> ${escapeHTML(packHosts(pack))}</p><p><strong>Install:</strong> ${escapeHTML(taxonomyName("pack_install_mechanisms", pack.install_mechanism))}</p><p><a href="${escapeHTML(pack.url)}" target="_blank" rel="noreferrer">Open official page ↗</a></p><p><a href="https://github.com/${escapeHTML(pack.repo)}" target="_blank" rel="noreferrer">Open repository ↗</a></p></section>
      <section class="detail-block"><h3>What it installs</h3><p>${detailText(pack.installs)}</p>${pack.distribution_machinery ? `<p><strong>Distribution machinery:</strong> ${escapeHTML(pack.distribution_machinery)}</p>` : ""}</section>
      <section class="detail-block"><h3>Why it is not a scored system</h3><p>${detailText(pack.not_a_system)}</p><p class="unscored-note">Packs are recorded for what they install, never for what they do. A pack that owns state or does enforced work is a scored system instead (ADR 031, ADR 032).</p></section>
      <section class="detail-block"><h3>Packaging formats</h3>${formats.length ? `<p>${formats.map(item => `<button type="button" class="ghost-button" data-open-spec="${escapeHTML(item.id)}">${escapeHTML(item.short_name)}</button>`).join(" ")}</p>` : "<p>No packaging format recorded; the pack installs by script or clone.</p>"}</section>
      <section class="detail-block"><h3>Licenses and terms</h3><p>${detailText(pack.license_note)}</p>${(pack.license_evidence || []).map(specificationEvidenceLink).join("")}</section>
      <section class="detail-block"><h3>Reviewed sources</h3>${(pack.evidence || []).map(specificationEvidenceLink).join("") || "<p>—</p>"}</section>
      <section class="detail-block"><h3>Related records</h3>${relatedPacks.length || relatedSystems.length ? `<p>${[...relatedPacks.map(item => `<button type="button" class="ghost-button" data-open-pack="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`), ...relatedSystems.map(item => `<button type="button" class="ghost-button" data-open-project="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`)].join(" ")}</p>` : "<p>None recorded.</p>"}</section>
    </div>`;
}
```

Add to `RECORD_DIALOGS`:

```js
  pack: {
    dialog: "#pack-dialog",
    content: "#pack-dialog-content",
    find: id => state.packs.find(item => item.id === id),
    markup: packDialogMarkup,
    afterRender: () => {
      $$('[data-open-spec]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#pack-dialog").close(); openSpecification(button.dataset.openSpec); activateView("specifications"); }));
      $$('[data-open-pack]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => openPack(button.dataset.openPack)));
      $$('[data-open-project]', $("#pack-dialog-content")).forEach(button => button.addEventListener("click", () => { $("#pack-dialog").close(); openProject(button.dataset.openProject); }));
    },
  },
```

Add `function openPack(id) { return openRecordDialog("pack", id); }` beside `openModel`; `const renderPacks = () => renderCollection("packs");` beside `renderModels`; `"#pack-dialog"` in `RECORD_DIALOG_SELECTORS`; `if (kind === "pack") return openPack(id);` in `openRecord`. `renderTaxonomy` groups: after the specification groups add `["Pack types", state.taxonomy.pack_types], ["Pack hosts", state.taxonomy.pack_hosts], ["Pack install mechanisms", state.taxonomy.pack_install_mechanisms],`.

In `bindEvents`: add the listener line

```js
  ["#pack-search", "#pack-type-filter", "#pack-host-filter", "#pack-install-filter", "#pack-license-filter"].forEach(selector => $(selector).addEventListener("input", () => { state.page.packs = 1; renderPacks(); }));
```

the reset handler

```js
  $("#reset-pack-filters").addEventListener("click", () => {
    $("#pack-search").value = "";
    $("#pack-type-filter").value = "";
    $("#pack-host-filter").value = "";
    $("#pack-install-filter").value = "";
    $("#pack-license-filter").value = "";
    state.page.packs = 1;
    renderPacks();
  });
```

and the two dialog close lines mirroring `#runtime-dialog`.

- [ ] **Step 4: Syntax, lint, unit guards**

Run: `node --check web/app.js && npm run lint:js && node --test tests/test_web.js 2>&1 | tail -4`
Expected: clean; the stylesheet palette test passes because `--card-pack` is defined in all three blocks.

- [ ] **Step 5: Smoke the empty scope in a browser**

Run: `uv run python -m http.server 8765 --directory web` and open `http://localhost:8765/?collection=packs`.
Expected: the Agent packs button is pressed, the panel shows `0 packs · Unscored` and the empty notice, no console errors, and `?collection=packs` survives reload. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/app.js web/styles.css
git commit -m "Add the Agent packs Directory scope, mixed cards, and detail dialog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ADR 032 and the documents it amends

**Files:**
- Create: `docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md`, `docs/PACKS.md`
- Modify: `docs/adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md:3,17`, `docs/CURATION.md:21,31`, `ROADMAP.md:25`, `AGENTS.md:3,20`, `docs/TAXONOMY.md:16`, `docs/COVERAGE.md` (new subsection after Local runtimes), `docs/OPERATIONS.md:66`, `docs/WEB.md:20-29,60-63,85,135,170-191`, `docs/SPECIFICATIONS.md:9-16`, `BACKLOG.md:33-36`
- Test: `tests/test_documentation.py:64-105`

- [ ] **Step 1: Add the routing test entries**

In `tests/test_documentation.py` `test_task_routing_documents_exist`, add `"docs/PACKS.md",` after `"docs/SPECIFICATIONS.md",` and `"docs/adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md",` and `"docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md",` after the ADR 030 line.

Run: `uv run python -m unittest tests.test_documentation -v 2>&1 | tail -6`
Expected: `test_task_routing_documents_exist` fails on `docs/PACKS.md`.

- [ ] **Step 2: Write ADR 032**

Create `docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md`:

```markdown
# ADR 032: Agent packs are unscored records of what a host installs

**Status:** Accepted. Amends [ADR 031](031-skill-packs-earn-records-by-owned-state-or-enforced-work.md).

## Context

ADR 031 settled which packs earn a scored system record: those that own state or do enforced work. Its decision sentence sends every other pack to `directory/exclusions.json`, and `ROADMAP.md` says of the "collection of skill documents" that it cannot own an operational outcome. Both statements are right about scoring. Neither answers the reader.

A reader assembling a coding-agent setup chooses among exactly these packs. The scored roles hold the packs that ship machinery, a minority of what that reader is choosing among, and the catalog answers the rest with a rejection note. The question the catalog cannot answer is concrete: **for a given host agent, which add-ons exist, what does each one install, under what licence, and does any of them own machinery of its own?** Only the last clause is ADR 031's question.

The Atlas already has a shape for artifacts that matter to selection but are not systems. [ADR 008](008-specifications-are-unscored-artifacts.md) made specifications an unscored collection on that reasoning. [ADR 022](022-general-pattern-content-is-not-a-collection.md) refused a pattern collection only because patterns have no single steward or reviewable artifact. A pack has both: one repository, one licence, one tree to open.

A repository-only skeptic was briefed to refute this proposal before it was designed. Its objections are answered below where they changed the design, and named in "Alternatives considered" where they did not.

## Decision

`directory/packs.json` is a fifth collection, **Agent packs**, in the ADR 008 shape: no `system_family`, no `primary_role`, no score profile, no score, no stars. A pack record states what the pack installs, into which hosts, by which mechanism, under which licence, and why it is not a scored system.

### The boundary

A record is one steward's pack, offered for others to install into a host agent as one unit, whose contents the host reads as instructions, configuration, or templates. Four refusals, each already decided elsewhere in this catalog:

1. **Mirrors and aggregated documentation** are not one steward's pack. `NVIDIA/skills` and `Orchestra-Research/AI-Research-SKILLs` stay excluded, and their lesson stands: an aggregated catalog of independent instruction bundles is not one product.
2. **Personal snapshots not offered for install** have no install unit. `oldwinter/knowledge-garden` stays excluded; the recordable system is the software that operates a vault, not one person's vault.
3. **Material no host consumes** is not a pack: books, courses, awesome-lists.
4. **Packs that ship running code** are decided by ADR 031, not here. A hook that denies, a script that does the work, a store the pack re-reads: scored if it passes, excluded if what it runs is observation. Install, sync, manifest-resolution, and self-validation scripts are distribution machinery and never move a pack out of this collection; ADR 031 already says the same of `vibecode-pro-max-kit`'s top-level scripts.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`. ADR 031 decides between the first two, and the validator refuses a repository present in both.

Five types: skills bundle, plugin, process kit, vault bundle, marketplace.

### Evidence is composition, never behaviour

ADR 031 found that prose about what a pack does is a claim, not evidence. This collection therefore pins only artifacts that prove composition: the install manifest or skill frontmatter, the licence file, and the tree. The `installs` field is written from the tree in countable terms and is checkable by counting it. No record states what a pack does at runtime, because the collection admits only packs that run nothing.

### Marketplaces are install sources, not catalogues

A marketplace record pins its host-consumable manifest and names its steward, hosts, install mechanism, and licence. It never reviews, counts, or lists its entries, carries no field for them, and its `verified_at` dates the pinned manifest rather than the catalogue behind it. The `buildwithclaude` lesson stands: indexing adds no operational boundary, and the record claims none. This is not the models.dev shape of [ADR 027](027-complete-models-dev-source-catalog-is-published.md): nothing is imported and no unreviewed rows are published. A repository whose items each install separately through a marketplace manifest it ships is recorded once, as a marketplace.

### Adoption still decides nothing

The Superpowers exclusion's lesson, "adoption does not establish an operational boundary", remains true and is preserved in `docs/PACKS.md`. A pack record is unscored precisely because it establishes none. Records carry no `stars`, the Packs scope sorts by name only, and a pack enters the queue and is reviewed from its tree like any other candidate. The stated weak point: nothing refuses the tenth Claude Code skills bundle except the queue and the ecosystem-significance judgement `docs/COVERAGE.md` already applies to the ninth coding agent.

### Placement

Packs join the Directory as a fifth scope under [ADR 013](013-distinct-collections-share-one-directory-surface.md), because a pack is a deployment choice rather than an interoperability artifact and a reader searching the mixed Directory must find it. The scope is alphabetical only, offers no comparison ([ADR 014](014-comparisons-are-scoped-to-one-score-profile.md)), no Finder goal, and no card badges.

## What this amends

- ADR 031's decision sentence now reads: "Otherwise it is a document collection executed by the host, and it is reviewed for the unscored Agent packs collection under ADR 032." Its prongs, its evidence rule, and its observability line are unchanged.
- `ROADMAP.md`'s "only the middle case can own an operational outcome" stays true and gains the clause that the third case is recorded, unscored, for what it installs.
- `docs/CURATION.md`'s reservation of `exclusions.json` and its packs paragraph route document packs to `docs/PACKS.md`.

## Alternatives considered

**A new `specification_type`.** A skills bundle is an instance of a capability format, not a format; `docs/SPECIFICATIONS.md` requires normative detail for an independent implementation, which a bundle of prompts does not have.

**Rendering `exclusions.json` in the app.** An exclusion is a reason to leave. The reader's question needs hosts, install mechanism, and licence, which exclusions do not carry.

**A blog post.** Kept as a complement, not a substitute: a post carries no evidence schema and no review date.

**Reversing ADR 031 and scoring packs as coding-agent workflows.** Every score dimension would measure the host. ADR 031 rejected the "supervises the host" phrasing for exactly this reason.

## Consequences

- `docs/PACKS.md` carries the inclusion boundary, classification order, marketplace rule, and evidence workflow.
- The six packs excluded under ADR 031's first application are re-reviewed from their trees and, where they pass this boundary, move from `exclusions.json` to `packs.json`.
- A candidate bound for this collection waits under `triage.held_by: "ADR 032 pack review"`; automation never writes a pack record. Extending the triage routine's routing is a `BACKLOG.md` follow-up.
- Every script that enumerates collections gains a row; `docs/AGENT_DOCS.md`'s one-commit rule for published files applies.
```

- [ ] **Step 3: Write docs/PACKS.md**

```markdown
# Agent pack curation

Use this guide for skills bundles, plugins, process kits, vault bundles, and marketplaces a host agent installs and reads. Operational systems follow [`CURATION.md`](CURATION.md); the two collections share licence and evidence rigour but not schema or scores. The boundary is [ADR 032](adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md), which amends [ADR 031](adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md).

## Inclusion boundary

Add a repository to `directory/packs.json` when all four hold:

1. **One steward authored the contents.** A mirror, a daily sync of other products' documentation, or an aggregate of other authors' bundles is not a pack.
2. **It is offered for install as one unit:** a plugin manifest, a skills folder, a marketplace manifest, a vault template, or an install script that copies the whole pack into a host's discovery locations. A personal snapshot nobody is invited to install is not a pack.
3. **A host agent consumes it.** Books, courses, and awesome-lists stay out.
4. **Its contents are documents, not running code.** Open the tree before deciding. A pack that ships a program the host runs at runtime is decided by ADR 031: scored if it owns state or does enforced work, excluded if what it runs is observation. Install, sync, manifest-resolution, and self-validation scripts are distribution machinery and do not move a pack out of this collection; record them in `distribution_machinery`.

A repository appears in exactly one of `projects.json`, `packs.json`, and `exclusions.json`. Adoption does not establish an operational boundary, and it does not decide inclusion here either; a pack enters `candidates.json` and is reviewed from its tree like any other record.

## Classification order

Choose one `pack_type`:

- `skills_bundle`: skill documents installed together under a capability format;
- `plugin`: a host plugin whose manifest declares commands, agents, skills, or hook configuration;
- `process_kit`: a methodology packaged as prompts, commands, subagent definitions, and templates;
- `vault_bundle`: a knowledge-vault template with the instructions a host reads to maintain it;
- `marketplace`: a host-consumable manifest that lists other packs.

Then record every host the pack **documents** installing into (`pack_hosts`), never a host inferred from a format's compatibility list; use `any_agent_skills_host` when the pack documents only the Agent Skills format. Record one `install_mechanism`, and name each `packaging_formats` entry as a `specifications.json` id (`agent-skills`, `claude-code-plugins`, `agent-plugins`, or an instruction convention). Assign `status` from the project statuses so an abandoned pack is labelled rather than removed.

## The marketplace rule

A marketplace record pins its manifest and names its steward, hosts, install mechanism, and licence. It never reviews, counts, or lists its entries and has no field for them; its `verified_at` dates the pinned manifest, not the catalogue behind it. A repository whose items each install separately through a marketplace manifest it ships is recorded once, as a marketplace, not as forty bundles. The entries it lists are each reviewable on their own evidence, in whichever collection ADR 031 and this boundary place them.

## Evidence workflow

1. List the tree (`gh api repos/<owner>/<name>/git/trees/HEAD?recursive=1 --jq '.tree[].path'`) and read the install manifest, skill frontmatter, or install script. Decide boundary test 4 from the tree, never from the README.
2. Pin the manifest or top-level `SKILL.md` as `git_blob` evidence with its blob SHA from the API (`gh api repos/<owner>/<name>/contents/<path> --jq .sha`), and add a `web` evidence item for the official page when the manifest alone does not show the documented hosts.
3. Inspect licence files and path-specific terms; record every material licence with scoped `git_blob` evidence. When no licence file is served at any usual path, record `LicenseRef-Unclear` with `web_terms` evidence pointing at the README and say so in `license_note`; never rewrite it as open source by inference.
4. Write `installs` from the tree in countable terms: how many skill directories, command files, agent definitions, hook configurations, templates, and where the host reads them. Write `not_a_system` in ADR 031's terms, or, for a marketplace, that it lists packs rather than being one.
5. Relate records only when it aids navigation; a relationship is not a compatibility claim.
6. Run synchronization, payload and share-page generation, validation, all tests, and the pack browser checks in [`WEB.md`](WEB.md).

Packs are never scored, sorted by popularity, or assigned a system family.

## Current coverage

The collection opens with the six repositories ADR 031's first application excluded and this boundary admits: Superpowers and claude-code-tresor as process kits, agent-toolkit and Build with Claude as marketplaces, Second Brain Starter and obsidian-claude-pkm as vault bundles. `NVIDIA/skills` and `AI-Research-SKILLs` remain excluded as mirrors, `knowledge-garden` as a personal snapshot. Use [`COVERAGE.md`](COVERAGE.md) and [`BACKLOG.md`](../BACKLOG.md) for the next pass.
```

- [ ] **Step 4: Amend the existing documents**

- `docs/adr/031-...md:3` → `**Status:** Accepted. Amended by \[ADR 032\] (032-agent-packs-are-unscored-records-of-what-a-host-installs.md).`; line 17 → `A pack earns a scored record when it **owns state** or **does enforced work**. Otherwise it is a document collection executed by the host, and it is reviewed for the unscored Agent packs collection under \[ADR 032\] (032-agent-packs-are-unscored-records-of-what-a-host-installs.md).`
- `docs/CURATION.md:21` → `` `directory/exclusions.json` is reserved for systems that fail a family or role boundary, duplicates, non-operational research inputs, and packs that fail the Agent packs boundary in \[`PACKS.md`\] (PACKS.md). Relevant systems awaiting full review belong in `directory/candidates.json`, never exclusions solely because of licensing. `` Line 31: replace the final sentence "Instruction documents a host reads as prompt text stay outside the scored catalog, and the packaging formats themselves stay in Specifications." with "Instruction documents a host reads as prompt text stay outside the scored catalog and are reviewed for the unscored Agent packs collection under \[`PACKS.md`\] (PACKS.md) and \[ADR 032\] (adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md); the packaging formats themselves stay in Specifications."
- `ROADMAP.md:25` → `- Settle the treatment of agent skill packs before the class grows further, separating the authoring convention from a skills runtime from a collection of skill documents; only the middle case can own an operational outcome, the third is recorded unscored for what it installs under ADR 032, and adoption does not settle any of them.`
- `AGENTS.md:3` → append ", and unscored agent packs a host agent installs" after "self-operated local runtimes". Line 20 → `| skill packs, plugins, vault bundles, marketplaces, or harness add-ons | \`docs/PACKS.md\`, then \`docs/adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md\` and \`docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md\` |`. Add a hard rule after the specifications rule: `- Keep agent packs outside \`system_family\` and every score profile; record what a pack installs from its pinned tree, never what it does; never carry stars, scores, or a marketplace's entries; and never let a repository appear in more than one of \`projects.json\`, \`packs.json\`, and \`exclusions.json\`.`
- `docs/TAXONOMY.md:16`: change the first sentence to "Specifications, inference services, local runtimes, models, and agent packs are separate collections, not additional system families. Specifications and agent packs remain unscored." and add `\[\`PACKS.md\`\] (PACKS.md)` and ADR 032 to the see-also list.
- `docs/COVERAGE.md`: after the Local runtimes subsection add `### Agent packs` with one paragraph naming the six initial records by type and the three that stay excluded, and the sentence "Coverage here is opened, not surveyed; the class is admitted from the queue on the same significance judgement as any other."
- `docs/OPERATIONS.md:66`: append "`directory/packs.json` carries no stars and is never touched by this pass."
- `docs/SPECIFICATIONS.md`: in "Inclusion boundary" add the sentence "A skills bundle, plugin, or marketplace is an instance of a format, not a format; it belongs in the Agent packs collection (\[`PACKS.md`\] (PACKS.md))."
- `docs/WEB.md`: switcher bullet lists "Agent packs" after Local runtimes; add "- In Agent packs, keep search, pack type, host, install mechanism, and licence visible; results are alphabetical and unscored." ; in the feature list add "- Pack filters combine search, type, host, install mechanism, and licence inside the Agent packs Directory scope. Results are alphabetical, explicitly unscored, and never offer comparison." and "- Pack details show what the pack installs, any distribution machinery, why it is not a scored system, hosts, packaging formats linked to their specification records, scoped licence evidence, and reviewed sources."; the comparison sentence adds "and Agent packs"; the record-kinds sentence adds `pack:id`; "boots from six payloads" → "seven payloads" with `app/packs.json` in the list and in the measurement snippet; manual checks gain "31. switch to Agent packs, reload the scoped URL, combine every filter, open a process-kit and a marketplace detail, follow a packaging-format link into Specifications, and confirm no score, sort-by-score, or Compare control appears; search the mixed Directory for a pack." Re-measure and update the "Expected: 53.2 KB gzipped" figure.
- `BACKLOG.md`: under "Editorial and taxonomy decisions" add `- [ ] Extend the candidate-triage routine's routing so a review-ready pack can be proposed for \`packs.json\` without a \`held_by\` hold; until then packs wait under "ADR 032 pack review".` Update the first ADR 031 item's opening to note ADR 032 now routes failing packs to the collection.

- [ ] **Step 5: Run the documentation tests**

Run: `uv run python -m unittest tests.test_documentation -v 2>&1 | tail -4`
Expected: `OK` (routing entries exist and are reachable from `AGENTS.md`).

- [ ] **Step 6: Commit**

```bash
git add docs/adr/032-agent-packs-are-unscored-records-of-what-a-host-installs.md docs/PACKS.md docs/adr/031-skill-packs-earn-records-by-owned-state-or-enforced-work.md docs/CURATION.md ROADMAP.md AGENTS.md docs/TAXONOMY.md docs/COVERAGE.md docs/OPERATIONS.md docs/SPECIFICATIONS.md docs/WEB.md BACKLOG.md tests/test_documentation.py
git commit -m "ADR 032: agent packs are unscored records of what a host installs

Amends ADR 031 so document packs are reviewed for the new collection
instead of exclusions, and documents the boundary in docs/PACKS.md.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Review the six initial packs from their trees

Each record is written from the repository tree and the GitHub API, never from the old exclusion text. Delegated research must be re-fetched: every SHA and path below comes from a command you ran.

**Files:**
- Modify: `directory/packs.json`, `directory/exclusions.json` (remove entries at the indexes found by the grep below), `web/*.json`, `web/app/`, `web/records/`, `web/sitemap.xml`, `web/index.html` (asset stamps)
- Test: `tests/test_directory.py` (`test_packs_are_a_separate_unscored_collection` gains an expected-id set)

- [ ] **Step 1: Pin the expected ids in the test**

In `test_packs_are_a_separate_unscored_collection` add, before the loop:

```python
        expected = {"superpowers", "claude-code-tresor", "agent-toolkit", "buildwithclaude", "second-brain-starter", "obsidian-claude-pkm"}
        self.assertLessEqual(expected, {record["id"] for record in records})
```

Run: `uv run python -m unittest tests.test_directory -k packs -v` — expected: FAIL, the set is empty.

- [ ] **Step 2: Gather evidence for each repository**

For each of `obra/superpowers`, `alirezarezvani/claude-code-tresor`, `softaworks/agent-toolkit`, `davepoon/buildwithclaude`, `coleam00/second-brain-starter`, `ballred/obsidian-claude-pkm`, run and keep the output:

```bash
gh api "repos/<owner>/<name>/git/trees/HEAD?recursive=1" --jq '.tree[] | select(.type=="blob") | .path'
gh api "repos/<owner>/<name>" --jq '{default_branch, archived, license: .license.spdx_id, html_url}'
gh api "repos/<owner>/<name>/contents/LICENSE" --jq .sha            # 404 means try LICENSE.md, LICENSE.txt; all 404 → LicenseRef-Unclear
gh api "repos/<owner>/<name>/contents/<manifest path>" --jq .sha   # .claude-plugin/plugin.json, .claude-plugin/marketplace.json, the top-level SKILL.md, or the install script
```

From the tree, count: skill directories (`*/SKILL.md`), command files, agent definitions, hook configurations, templates, executable files (`.sh`, `.py`, `.js`, `.ts`). Apply boundary test 4: a pack with executables must be classified as distribution machinery (installer, sync, validation of its own files) or fail the boundary; if any executable does runtime work the host would not, stop and report it, because that pack is ADR 031's case and must not be recorded here. Confirm `archived` is false for `status: active`.

- [ ] **Step 3: Write the six records**

Ids, display names, and proposed types are fixed here so the tests in this task and Task 8 can name them; the type changes only if the tree contradicts it, and then the test expectations change with it:

| `id` | `name` | `repo` | `pack_type` | `install_mechanism` |
|---|---|---|---|---|
| `superpowers` | Superpowers | `obra/superpowers` | `process_kit` | `host_marketplace` |
| `claude-code-tresor` | claude-code-tresor | `alirezarezvani/claude-code-tresor` | `process_kit` | `copy_files` |
| `agent-toolkit` | agent-toolkit | `softaworks/agent-toolkit` | `marketplace` | `host_marketplace` |
| `buildwithclaude` | Build with Claude | `davepoon/buildwithclaude` | `marketplace` | `host_marketplace` |
| `second-brain-starter` | Second Brain Starter | `coleam00/second-brain-starter` | `vault_bundle` | `clone_template` |
| `obsidian-claude-pkm` | obsidian-claude-pkm | `ballred/obsidian-claude-pkm` | `vault_bundle` | `clone_template` |

Use this shape, substituting only values you read from the commands above (blob SHAs, default branch in URLs, counts in `installs`, licence identifier). Example for Superpowers:

```json
{
  "id": "superpowers",
  "name": "Superpowers",
  "steward": "Jesse Vincent (obra)",
  "repo": "obra/superpowers",
  "url": "https://github.com/obra/superpowers",
  "description": "A software-development methodology packaged as composable skills that a coding agent reads and follows.",
  "pack_type": "process_kit",
  "hosts": ["claude_code", "codex", "cursor", "opencode"],
  "packaging_formats": ["agent-skills", "claude-code-plugins"],
  "install_mechanism": "host_marketplace",
  "installs": "<N> SKILL.md skill directories under skills/, a Claude Code plugin manifest at .claude-plugin/plugin.json, a SessionStart hook configuration that prints one skill document into the session as context, and install manifests for <M> other hosts under <dir>.",
  "distribution_machinery": "<name each shipped script and what it does, from the tree; omit the field if the tree has no executables>",
  "not_a_system": "Owns no state it reads back and does no enforced work: its hook prints a document, and every step it describes is executed by the host's own tools.",
  "status": "active",
  "licenses": ["MIT"],
  "license_note": "Repository-wide MIT license.",
  "license_evidence": [{
    "license_id": "MIT",
    "scope": "Repository-wide license file",
    "kind": "git_blob",
    "path": "LICENSE",
    "url": "https://github.com/obra/superpowers/blob/<default_branch>/LICENSE",
    "blob_sha": "<sha from gh api>",
    "immutable_url": "https://api.github.com/repos/obra/superpowers/git/blobs/<same sha>"
  }],
  "evidence": [{
    "kind": "git_blob",
    "label": "Plugin manifest",
    "path": ".claude-plugin/plugin.json",
    "url": "https://github.com/obra/superpowers/blob/<default_branch>/.claude-plugin/plugin.json",
    "blob_sha": "<sha from gh api>",
    "immutable_url": "https://api.github.com/repos/obra/superpowers/git/blobs/<same sha>"
  }],
  "verified_at": "2026-09-16"
}
```

`hosts` lists only hosts the repository's own documentation or manifests name; drop any host in the example the tree does not support. For the two marketplaces, pin `.claude-plugin/marketplace.json`, set `install_mechanism` to `host_marketplace`, and write `not_a_system` as "A marketplace manifest that lists other packs for installation; it is an install source, not a system, and this record never lists, counts, or reviews its entries." For `second-brain-starter`, if no licence file is served, use:

```json
  "licenses": ["LicenseRef-Unclear"],
  "license_note": "No LICENSE file is served at LICENSE, LICENSE.md, or LICENSE.txt and the README claims none; no reusable licence can be established and none is inferred.",
  "license_evidence": [{
    "license_id": "LicenseRef-Unclear",
    "scope": "Repository README, which states no licence; no licence file at any usual path",
    "kind": "web_terms",
    "url": "https://github.com/coleam00/second-brain-starter",
    "verified_at": "2026-09-16"
  }],
```

Set the envelope `verified_at` to the newest record date. Remove the six entries from `directory/exclusions.json` (find them with `python3 -c "import json;[print(i,e['repo']) for i,e in enumerate(json.load(open('directory/exclusions.json'))['entries']) if e['repo'] in {...}]"`); leave `NVIDIA/skills`, `Orchestra-Research/AI-Research-SKILLs`, and `oldwinter/knowledge-garden` in place. If a repository fails boundary test 4 on inspection, leave its exclusion in place, drop its id from the test's expected set, and say so in the commit message and in `docs/PACKS.md` "Current coverage".

- [ ] **Step 4: Regenerate, validate, test**

Run:

```bash
uv run python scripts/sync_web_data.py && uv run python scripts/build_web_payload.py && uv run python scripts/build_share_pages.py && node scripts/build_asset_version.mjs && node scripts/build_logos.mjs --check && uv run python scripts/validate_directory.py && uv run python -m unittest discover -s tests 2>&1 | tail -3 && node --test tests/test_web.js 2>&1 | tail -3
```

Expected: the validator prints `6 unscored agent packs` (or the number that survived Step 3); every suite `OK`; the badge data guard still passes because packs list no badges.

- [ ] **Step 5: Commit**

```bash
git add directory/packs.json directory/exclusions.json web tests/test_directory.py docs/PACKS.md
git commit -m "Record the first six agent packs from their trees

Moves Superpowers, claude-code-tresor, agent-toolkit, Build with Claude,
Second Brain Starter, and obsidian-claude-pkm from exclusions to the
Agent packs collection under ADR 032, each pinned to its manifest and
licence blob.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Browser regression, boot budget, and final verification

**Files:**
- Modify: `tests/e2e/helpers/catalog-counts.js:14-22,68-82`, `tests/e2e/directory-search.spec.js` (three new tests), `docs/WEB.md:142` (measured figure)

- [ ] **Step 1: Count packs in the All scope helper**

In `catalog-counts.js` add `const packs = read("packs.json").packs;` after `localRuntimes`, change the comment to "The All view unions the four scored collections plus unscored agent packs", make `allDirectoryEntries = projects.length + inferenceServices.length + localRuntimes.length + models + packs.length`, and export `packs: packs.length`.

- [ ] **Step 2: Write the Playwright tests**

Append to `tests/e2e/directory-search.spec.js`:

```js
test("the agent packs scope filters, opens its own dialog, and never scores or compares", async ({ page }) => {
  await page.goto("/?collection=packs");

  await expect(page.getByRole("button", { name: /^Agent packs / })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pack-result-count")).toContainText(`${catalogCounts.packs} packs · Unscored`);
  await expect(page.locator("#pack-grid .score-ring")).toHaveCount(0);
  await expect(page.locator("#pack-grid .compare-toggle")).toHaveCount(0);
  await expect(page.locator("#pack-sort-filter")).toHaveCount(0);

  await page.locator("#pack-type-filter").selectOption("marketplace");
  const names = page.locator("#pack-grid .project-card h2");
  await expect(names).toHaveText(["Build with Claude", "agent-toolkit"].sort((a, b) => a.localeCompare(b)));

  await page.locator("#reset-pack-filters").click();
  await page.locator("#pack-search").fill("Superpowers");
  await expect(names).toHaveText(["Superpowers"]);
  await page.locator('#pack-grid [data-pack="superpowers"]').click();
  await expect(page.locator("#pack-dialog")).toBeVisible();
  await expect(page.locator("#pack-dialog-content .eyebrow")).toContainText("Unscored");
  await expect(page.locator("#pack-dialog-content")).toContainText("What it installs");
  await expect(page).toHaveURL(/record=pack(%3A|:)superpowers/);

  await page.reload();
  await expect(page.locator("#pack-dialog")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#pack-dialog")).toBeHidden();
});

test("mixed browsing surfaces agent packs without scores or comparison", async ({ page }) => {
  await page.goto("/");
  await page.locator("#all-directory-search").fill("Superpowers");
  const card = page.locator('#all-directory-grid .agent-pack-card:has([data-pack="superpowers"])');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".family-label")).toContainText("Agent pack · Process kit");
  await expect(card.locator(".score-ring")).toHaveCount(0);
  await expect(card.locator(".compare-toggle")).toHaveCount(0);
});

test("a packaging-format link in a pack dialog opens the specification", async ({ page }) => {
  await page.goto("/?record=pack:superpowers");
  await page.locator('#pack-dialog-content [data-open-spec="agent-skills"]').click();
  await expect(page.locator("#specification-dialog")).toBeVisible();
  await expect(page.locator("#specification-dialog-content h1")).toHaveText("Agent Skills");
});

test("taxonomy documents every pack group", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Taxonomy" }).click();
  for (const group of ["Pack types", "Pack hosts", "Pack install mechanisms"]) {
    await expect(page.locator("#taxonomy-content h2", { hasText: group })).toHaveCount(1);
  }
  await expect(page.locator("#taxonomy-content")).toContainText("Marketplace");
});
```

If Superpowers' `packaging_formats` from Task 7 does not include `agent-skills`, point the third test at a format the record does carry.

- [ ] **Step 3: Run the suite**

Run: `npm ci && npx playwright install chromium && npm run test:e2e 2>&1 | tail -15`
Expected: all tests pass, including the existing All-scope count test, which now includes packs through the helper.

- [ ] **Step 4: Measure the boot budget and update WEB.md**

Run the measurement block from `docs/WEB.md` with `app/packs.json` added to its list. Record the printed figure in `docs/WEB.md` in place of `53.2 KB`. If it exceeds 60 KB, move `hosts` or `packaging_formats` out of `BOOT_FIELDS["packs"]` only if a card does not print them; otherwise report the figure and stop.

- [ ] **Step 5: Run the full command list from AGENTS.md**

Run every command in `AGENTS.md`'s "Commands" section in order (sync, payload, share pages, blog, the four `--check` builds, ruff, validator, unittest, compileall, both `node --check`, node tests, `npm run lint:js`, `npm run test:e2e`).
Expected: every command exits 0. Paste the tail of each into the PR description; do not claim a check passed that was not run.

- [ ] **Step 6: Manual browser pass**

Serve `web/` and walk checks 11, 20, 25, 26, 30, and the new 31 from `docs/WEB.md` in both palettes and at 390px width. Confirm the Agent packs button fits the switcher on a phone.

- [ ] **Step 7: Commit and open the PR**

```bash
git add tests/e2e docs/WEB.md
git commit -m "Cover the Agent packs scope in the browser suite and re-measure the boot budget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin claude/skills-packs-ai-directory-7dee8c
```

Open a pull request against `main` titled "Add the unscored Agent packs collection (ADR 032)" whose body links the spec and ADR, lists the six records and the three exclusions that stayed, states the measured boot figure, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge.
