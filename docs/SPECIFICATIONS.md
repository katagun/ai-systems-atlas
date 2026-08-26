# Specification curation

Use this guide for protocols, instruction conventions, capability formats, and plugin package formats. Operational systems follow [`CURATION.md`](CURATION.md); the two collections share license and evidence rigor but not schema or scores.

## Inclusion boundary

Add an artifact to `directory/specifications.json` when it defines a reusable contract at a meaningful boundary between agents, tools, clients, users, repositories, or extension packages. Require:

1. an authoritative specification or product document;
2. a distinct interoperability question not already answered by another record;
3. enough normative detail for an independent implementation or, for a vendor convention, precise documented behavior;
4. reviewed license evidence, including `LicenseRef-Unclear` when no standalone format license can be established; and
5. a concise statement of what the artifact does and does not standardize.

Do not add a general transport, serialization format, or API description language solely because an agent uses it. Do not list a product feature with no reusable contract. Vendor-specific conventions may be included when users must understand them, but label them `vendor_specific` rather than implying open governance.

## Classification order

Choose one artifact type:

- `protocol`: machine-readable interaction between independent components;
- `instruction_convention`: a named file and discovery convention for project guidance;
- `capability_format`: a reusable capability bundle with instructions and optional resources;
- `package_format`: a larger distributable extension bundle.

Then choose the single integration scope that best answers “what boundary does this contract connect?” Finally assign status: `published`, `evolving`, `vendor_specific`, or `superseded`. Status describes the artifact's publication posture, not popularity or implementation quality.

## Evidence workflow

1. Read the current authoritative specification or product documentation.
2. Pin the reviewed Git blob for normative text when a public repository exists; also retain the current official web URL.
3. Inspect license files and path-specific terms. Record every material code or content license with scope.
4. Write `standardizes` and `does_not_standardize` before adding relationships; this prevents adjacent protocols from being collapsed into one category.
5. Relate records only when the relationship aids navigation. A relationship is not a compatibility claim.
6. Run synchronization, validation, all tests, and the specification browser checks in [`WEB.md`](WEB.md).

Specifications are never scored, sorted by popularity, or assigned a system family. See [ADR 008](adr/008-specifications-are-unscored-artifacts.md).
