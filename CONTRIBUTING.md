# Contributing

AI Systems Atlas accepts focused corrections, new evidence, candidate suggestions, and implementation improvements. A pull request should make one reviewable change and preserve the boundary between human editorial judgment and automated metadata. Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Choose the right path

- Systems, classifications, prose, or scores: read [`docs/CURATION.md`](docs/CURATION.md) and [`docs/TAXONOMY.md`](docs/TAXONOMY.md).
- Protocols, conventions, or formats: read [`docs/SPECIFICATIONS.md`](docs/SPECIFICATIONS.md).
- JSON fields or timestamps: read [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).
- Automation or GitHub workflows: read [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
- Browser behavior or styles: read [`docs/WEB.md`](docs/WEB.md).

Suggest an unreviewed project through the issue form rather than adding it directly to the published catalog. A catalog addition needs authoritative operational evidence, reviewed license or terms scope, a taxonomy-backed classification, and complete required fields. Assistant reviews evaluate the product rather than a transient underlying-model benchmark. Vendor-specific instruction conventions must be labeled as such.

## Verify the change

Run the commands in [`AGENTS.md`](AGENTS.md). After changing a published `directory/*.json` file, run synchronization before validation. Commit generated `web/` copies with their canonical directory files. Never report checks as passing unless you ran them.

Pull requests must pass the required `verify` job, including dependency review for lockfile changes. Suspected vulnerabilities follow [`SECURITY.md`](SECURITY.md), not public issues.
