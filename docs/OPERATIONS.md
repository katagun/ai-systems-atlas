# Operations

Use this document for refreshes, queue review, synchronization, and incident recovery.

## Routine verification

```bash
uv run python scripts/sync_web_data.py
uv run python scripts/validate_directory.py
uv run python -m unittest discover -s tests -v
uv run python -m compileall scripts tests
node --check web/app-core.js
node --check web/app.js
node --test tests/test_web.js
```

Synchronization is a write operation; the remaining commands are verification.

## Metadata refresh

```bash
GITHUB_TOKEN=... uv run python scripts/update_directory.py
```

The token is optional locally but recommended because GitHub search has a low anonymous rate limit. Never print or commit the token.

The refresh is transactional at the repository level:

1. update live metadata in memory;
2. require at least 80% project metadata success;
3. require at least one successful discovery query;
4. detect license drift and set affected projects to `quarantined`;
5. preserve prior candidates and unresolved quarantines;
6. write canonical JSON and synchronize published web copies;
7. validate and test in CI before committing.

Transport failures preserve existing project metadata. `404` and `410` are conclusive and mark a project `removed`. Automated refreshes never edit editorial fields.

## Review a candidate

For one record in `directory/candidates.json`:

1. Inspect repository license files and their scope.
2. If the project is restricted, mixed, or unclear, add it to `exclusions.json` and remove the candidate.
3. Read official documentation and enough implementation to establish behavior.
4. Follow `CURATION.md` to create the full project and evidence records.
5. Remove the candidate only in the same change that records its disposition.
6. Synchronize, validate, test, and exercise the UI.

Never copy proposed classification into the catalog without human confirmation. Never reuse a provisional candidate as an editorial score.

## Resolve a quarantine

Inspect the repository license files again; GitHub's detected SPDX value is only the trigger.

- **Still eligible:** update the project license if needed, replace evidence with the newly reviewed blob, set status to `active` or `archived`, and remove the quarantine entry.
- **Restricted or mixed:** move the project to `exclusions.json`, remove its project and evidence records, and remove the quarantine entry.
- **Unclear:** leave both the project status and queue entry quarantined.

Resolution must update all related records atomically. Validation rejects mismatches between project statuses and the quarantine queue.

## Scheduled workflow

`.github/workflows/update-directory.yml` runs weekly and on demand. Review a failed run rather than manually committing partial runner output. Candidate and quarantine queues are tracked files, so successful refresh results remain available after the runner exits.
