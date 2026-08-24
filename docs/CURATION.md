# Directory curation policy

## Scope

The main catalog covers operational, GitHub-hosted systems relevant to personal knowledge, second brains, agent memory, RAG, ambient capture, coding-agent workflows, and retrieval infrastructure. Research-only artifacts may be included when they provide a distinct architectural lesson.

## Inclusion gate

An entry belongs in `directory/projects.json` only when:

1. its relevant source is hosted on GitHub;
2. the repository license files establish an OSI-compatible license for the relevant code;
3. its role is materially relevant to the atlas taxonomy; and
4. the record identifies its review confidence and verification date.

README badges, GitHub's detected SPDX value, or a package-registry label can help locate evidence, but do not replace reviewing the license files. Mixed-license, source-available, proprietary, or unclear projects belong in `directory/exclusions.json` or quarantine until resolved.

## Classification

Assign one `primary_role` based on the job the system is designed to perform. Record independent traits for agent relationship, architecture, retrieval, capture, lifecycle, deployment, local-first behavior, human editability, and provenance.

Do not make an implementation technique a product role. In particular, vector indexes, graphs, relational databases, Markdown, and full-text indexes are architectures.

## Editorial score

Each dimension is scored from 0 to 10 using the weights in `directory/taxonomy.json`:

- second-brain fit: 22%;
- data sovereignty: 18%;
- interoperability: 16%;
- memory intelligence: 18%;
- operational simplicity: 12%;
- maturity: 14%.

The overall score is the weighted sum rounded to two decimals. Stars, forks, activity, and archival status are live signals; they do not directly overwrite editorial dimensions. Rescoring requires a brief evidence-backed explanation in the project record's strengths, weaknesses, or current repository note.

## Review workflow

1. Read the repository license files and identify their scope.
2. Review the project documentation and enough implementation detail to establish canonical data, deployment, retrieval, and lifecycle behavior.
3. Choose the primary role before filling orthogonal traits.
4. Record strengths, weaknesses, why the project matters, research confidence, and the verification date.
5. Synchronize `directory/*.json` to `web/`.
6. Run validation and tests with `uv`.

Automated discovery may propose candidates and provisional classifications. It cannot complete the license or editorial review by itself.
