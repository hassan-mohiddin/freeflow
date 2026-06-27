# ADR 0003: Release Boundary

## Status

Accepted.

## Decision

Freeflow ships as a marketplace repo with one plugin runtime under the repo root.

The plugin runtime includes skills, bundled references, context-loading runtime, public docs, eval sources/reports, command-surface metadata, Codex/Claude metadata, and Pi package metadata/extension.

The runtime excludes generated eval run output, historical background notes, handoffs, enforcement hooks, CLI tools, and old Orchestra compatibility.

## Rationale

The public repo should be installable without generated artifacts or duplicate package copies. Eval definitions and concise reports stay near the skills they protect; generated run output stays ignored.

## Consequences

Release evidence is summarized in `release-evidence.md`. Generated eval run output remains ignored unless a future release intentionally publishes it.
