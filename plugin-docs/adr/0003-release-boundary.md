# ADR 0003: Release Boundary

## Status

Accepted. Amended 2026-07-11.

## Decision

Freeflow ships as a marketplace repository with one source tree under the repo root.

The GitHub repository includes skills, bundled references, context-loading runtime, public docs, current `.skill-eval/` definitions, router evaluation evidence, deprecated historical evaluations, command-surface metadata, Codex/Claude metadata, and Pi package metadata/extension.

The npm tarball is the installable runtime artifact. It includes runtime-required skills, hooks, manifests, built router/delegation code, and the Pi extension. It excludes GitHub-only `plugin-docs/`, `.skill-eval/`, `router/evals/`, `deprecated/`, project-development docs, generated evaluation output, historical background notes, handoffs, enforcement hooks, CLI tools, and old Orchestra compatibility.

## Rationale

The public repository should keep documentation and evidence beside the skills they explain and protect. npm installations need executable runtime resources, not repository evidence or documentation copies. Keeping GitHub as the evidence surface avoids shipping hundreds of non-runtime files while preserving one source tree and no generated package mirror.

## Consequences

- Release evidence and public docs remain available on GitHub.
- README links to excluded docs and reports use absolute GitHub URLs.
- npm package validation rejects `plugin-docs/`, `.skill-eval/`, `router/evals/`, and `deprecated/` entries.
- Generated router evaluation output remains ignored unless a future release intentionally publishes it.
