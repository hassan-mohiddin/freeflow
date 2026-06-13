# Freeflow Current State

> **Doc ID:** STATE-2026-05-26-freeflow-current
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current
> **Source:** Live repo, v0.1 acceptance evidence, marketplace-layout verification.

Freeflow is a portable workflow skill pack for coding agents.

## Current Status

- Product name: Freeflow.
- Plugin runtime: `plugins/freeflow/`, the single source of truth for manifests, skills, references, evals, command-surface metadata, and refined plugin docs.
- Marketplace repo root: contains GitHub README, license, changelog, root project docs, Codex marketplace index, and Claude marketplace index.
- Version target: `0.1.0`.
- License target: MIT.
- GitHub target: `hassan-mohiddin/freeflow`.
- GitHub repo: published at `https://github.com/hassan-mohiddin/freeflow`.
- First host targets: Codex and Claude Code.
- v0.1 local acceptance suite: passed after measured fixes.
- Prepublish verification: passed on 2026-05-26. Generated eval runs live under `plugins/freeflow/evals/runs/` and are ignored.
- Native slash handlers: not shipped in v0.1.
- Context-loading hooks: shipped as plugin runtime.
- Enforcement hooks and CLI enforcement: not shipped in v0.1.
- Old Orchestra: prior art and failure evidence, not the release plugin.

## Release Boundary

The public repository includes:

- Codex marketplace metadata at `.agents/plugins/marketplace.json`.
- Claude marketplace metadata at `.claude-plugin/marketplace.json`.
- Plugin runtime under `plugins/freeflow/`.
- Runtime skills, bundled references, eval definitions, eval reports, and command-surface metadata.
- Refined user-facing plugin docs under `plugins/freeflow/docs/`.
- Root project docs under `docs/` for planning, current state, research, and handoffs.

The public repository excludes:

- Generated eval run output under `plugins/freeflow/evals/runs/`.
- Enforcement hooks, CLI enforcement, native slash handlers, and old Orchestra compatibility.

## Evidence

Use `plugins/freeflow/evals/README.md` for the eval directory guide.

Current high-signal evidence:

- `plugins/freeflow/evals/reports/acceptance/v0.1-acceptance-report.md`
- `plugins/freeflow/evals/reports/by-command-surface/command-surface-matrix.md`
- `plugins/freeflow/evals/reports/runtime/always-on-runtime-1-report.md`
- `plugins/freeflow/evals/reports/runtime/workflow-context-hook-1-report.md`

## Current Next Work

1. Install from GitHub in a separate Codex environment and Claude environment.
2. Dogfood in one real repo before broader announcement.
3. Decide whether to tag `v0.1.0` and create a GitHub release after install smoke tests pass.

Use this doc for current project status. Use research docs for historical reasoning.
