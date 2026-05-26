# ADR 0003: Release Boundary

## Status

Accepted.

## Decision

Freeflow v0.1 ships as a runtime skill package, not as the full Research workspace.

The package includes skills, bundled references, public docs, and Codex/Claude metadata.

The package excludes eval reports, fixtures, research notes, handoffs, command-surface development evidence, hooks, CLI tools, and old Orchestra compatibility.

## Rationale

The public package should be small enough to inspect and install. Development evidence remains valuable, but it should not become runtime weight.

## Consequences

Release evidence is summarized in `docs/release-evidence.md`. Full eval artifacts stay in the development repository unless a future release intentionally publishes them.
