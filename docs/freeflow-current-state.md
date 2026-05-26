# Freeflow Current State

> **Doc ID:** STATE-2026-05-26-freeflow-current
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current
> **Source:** Live repo, v0.1 acceptance evidence, package scaffold commit.

Freeflow is a portable workflow skill pack for coding agents.

## Current Status

- Product name: Freeflow.
- Development plugin: `plugins/freeflow/`.
- Publishable package: `packages/freeflow/`.
- Version target: `0.1.0`.
- License target: MIT.
- GitHub target: `hassan-mohiddin/freeflow`.
- First host targets: Codex and Claude Code.
- v0.1 local acceptance suite: passed after measured fixes.
- Native slash handlers: not shipped in v0.1.
- Hooks and CLI enforcement: not shipped in v0.1.
- Old Orchestra: prior art and failure evidence, not the release package.

## Release Boundary

The public package includes:

- Codex plugin metadata.
- Claude plugin metadata and local marketplace metadata.
- Runtime skills and bundled skill references.
- Public README, license, changelog, and concise docs.

The public package excludes:

- Research notes.
- Handoffs.
- Eval registries, fixtures, reports, and generated runs.
- Command-surface development evidence.
- Hooks, CLI enforcement, native slash handlers, and old Orchestra compatibility.

## Evidence

Use `plugins/freeflow/evals/README.md` for the eval directory guide.

Current high-signal evidence:

- `plugins/freeflow/evals/reports/acceptance/v0.1-acceptance-report.md`
- `plugins/freeflow/evals/reports/by-command-surface/command-surface-matrix.md`
- `plugins/freeflow/evals/reports/runtime/always-on-runtime-1-report.md`

## Current Next Work

1. Run final verification against `plugins/freeflow/` and `packages/freeflow/`.
2. Create or push the standalone `hassan-mohiddin/freeflow` repo.
3. Install from GitHub in a separate Codex environment and Claude environment.
4. Dogfood in one real repo before broader announcement.

Use this doc for current project status. Use research docs for historical reasoning.
