# Freeflow Current State

> **Doc ID:** STATE-2026-06-15-freeflow-current
> **Date:** 2026-06-19
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current
> **Source:** Live repo, v0.1 acceptance evidence, output-router benchmark evidence, marketplace-layout verification, Pi package/runtime verification.

Freeflow is a portable workflow skill pack for coding agents.

## Current Status

- Product name: Freeflow.
- Plugin runtime: `plugins/freeflow/`, the single source of truth for manifests, skills, references, evals, command-surface metadata, and refined plugin docs.
- Marketplace repo root: contains GitHub README, license, changelog, root project docs, Codex marketplace index, Claude marketplace index, and Pi package manifest.
- Version target: `0.2.0`.
- License target: MIT.
- GitHub target: `hassan-mohiddin/freeflow`.
- GitHub repo: published at `https://github.com/hassan-mohiddin/freeflow`.
- npm package: prepared as `@hassangameryt/freeflow@0.2.0`; latest known published version was `0.1.0`.
- Host targets: Codex, Claude Code, and Pi.
- v0.1 local acceptance suite: passed after measured fixes.
- Output-router benchmark evidence: passed for deterministic retrieval, command-output routing/recovery, optional local-index experiment, and Codex Structured Q&A macro coverage.
- Prepublish verification: passed on 2026-05-26 for v0.1 and refreshed during v0.2 release prep. Generated eval runs live under `plugins/freeflow/evals/runs/` and are ignored.
- Targeted runtime/interview-gate verification: passed on 2026-06-15 for syntax, runtime-context hooks, activation contract, release metadata, and Pi extension mock lifecycle.
- Native slash handlers: not shipped for Codex/Claude in the current release; Pi exposes direct Freeflow commands through its extension.
- Runtime context loading: shipped through Codex/Claude plugin-bundled hooks and the Pi extension.
- Active discovery skill: `research`; deprecated `research-brief`, `grill-context`, and `capture-decisions` live under root `deprecated/skills/` outside the runtime surface.
- npm Trusted Publisher: configured for GitHub Actions workflow `.github/workflows/release.yml` with environment `npm`.
- Enforcement hooks and CLI enforcement: not shipped in the current release.
- Old Orchestra: prior art and failure evidence, not the release plugin.

## Release Boundary

The public repository includes:

- Codex marketplace metadata at `.agents/plugins/marketplace.json`.
- Claude marketplace metadata at `.claude-plugin/marketplace.json`.
- Pi package metadata in root `package.json`.
- Plugin runtime under `plugins/freeflow/`.
- Active runtime skills, bundled references, eval definitions, eval reports, and command-surface metadata.
- Refined user-facing plugin docs under `plugins/freeflow/docs/`.
- Root project docs under `docs/` for planning, current state, research, and handoffs.

The public repository excludes:

- Generated eval run output under `plugins/freeflow/evals/runs/`.
- Enforcement hooks, CLI enforcement, Codex/Claude native slash handlers, and old Orchestra compatibility.

## Evidence

Use `plugins/freeflow/evals/README.md` for the eval directory guide.

Current high-signal evidence:

- `plugins/freeflow/evals/reports/by-skill/research-1-report.md`
- `plugins/freeflow/evals/reports/acceptance/v0.1-acceptance-report.md`
- `plugins/freeflow/evals/reports/by-command-surface/command-surface-matrix.md`
- `plugins/freeflow/evals/reports/runtime/always-on-runtime-1-report.md`
- `plugins/freeflow/evals/reports/runtime/workflow-context-hook-1-report.md`
- `plugins/freeflow/evals/reports/by-skill/interview-gate-2-report.md`
- `plugins/freeflow/evals/reports/runtime/output-router-benchmark-1-report.md`
- `plugins/freeflow/evals/reports/runtime/output-router-command-benchmark-1-report.md`
- `plugins/freeflow/evals/reports/runtime/output-router-index-benchmark-1-report.md`
- `plugins/freeflow/evals/reports/runtime/output-router-codex-qa-benchmark-1-report.md`
- `plugins/freeflow/evals/reports/by-skill/setup-freeflow-5-report.md`

## Current Next Work

1. Push the `0.2.0` release-prep commit and publish through the npm workflow when ready.
2. Reinstall Freeflow from the local/GitHub package path and run the install-smoke checks in Codex, Claude, and fresh Pi environments.
3. Confirm Pi package-gallery indexing after npm refresh.
4. Dogfood in one real repo before broader announcement.
5. Decide whether to tag `v0.2.0` and create a GitHub release after install smoke tests pass.

Use this doc for current project status. Use research docs for historical reasoning.
