# Freeflow Current State

> **Doc ID:** STATE-2026-07-01-freeflow-current
> **Date:** 2026-07-01
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current
> **Source:** Live repo, npm package metadata, v0.1 acceptance evidence, v0.3 runtime/setup/output-router evidence, marketplace-layout verification, Pi package/runtime verification.

Freeflow is a portable workflow skill pack for coding agents.

## Current Status

- Product name: Freeflow.
- Plugin runtime: the repo root, the single source of truth for manifests, skills, references, evals, command-surface metadata, and refined plugin docs.
- Marketplace repo root: contains GitHub README, license, changelog, `plugin-docs/`, `docs/`, Codex marketplace index, Claude marketplace index, and Pi package manifest.
- Current package version: `0.3.0`.
- License target: MIT.
- GitHub target: `hassan-mohiddin/freeflow`.
- GitHub repo: published at `https://github.com/hassan-mohiddin/freeflow`.
- npm package: published as `@hassangameryt/freeflow@0.3.0`.
- Host targets: Codex, Claude Code, and Pi.
- v0.1 local acceptance suite: passed after measured fixes and remains the release behavior baseline.
- Output-router evidence: passed for deterministic retrieval, command-output routing/recovery, observed routing, vault-wide indexing, transform/reducer routing, proof-backed script transform adapters, storage policy, Context Mode comparison, and Codex Structured Q&A coverage.
- Setup/config evidence: `setup-freeflow` keeps minimal setup to `defaultMode` and adds optional router/observed-routing/script-transform config only after explicit setup branch/request.
- Prepublish verification: passed on 2026-05-26 for v0.1, refreshed during v0.2 release prep, and covered by the current release-metadata validation script for v0.3 package metadata and release-boundary docs.
- Native slash handlers: not shipped for Codex/Claude in the current release; Pi exposes direct Freeflow commands through its extension.
- Runtime context loading: shipped through Codex/Claude plugin-bundled hooks and the Pi extension; global installs stay inert until `.freeflow/config.json` exists, and Pi injects only effective runtime layers before each agent turn.
- Active discovery skill: `discover`; deprecated `research-brief`, `grill-context`, and `capture-decisions` live under root `deprecated/skills/` outside the runtime surface.
- Router runtime source is organized by responsibility under `router/src/` (`tools/`, `transform/`, `evidence/`, `vault/`, `repo/`, `routing/`, `sandbox/`, `config/`, `benchmarks/`, `experiments/`); deprecated router references live under `deprecated/router/`.
- npm Trusted Publisher: configured for GitHub Actions workflow `.github/workflows/release.yml` with environment `npm`.
- Enforcement hooks and CLI enforcement: not shipped in the current release.
- Old Orchestra: prior art and failure evidence, not the release plugin.

## Release Boundary

The public repository includes:

- Codex marketplace metadata at `.agents/plugins/marketplace.json`.
- Claude marketplace metadata at `.claude-plugin/marketplace.json`.
- Pi package metadata in root `package.json`.
- Plugin runtime under the repo root.
- Active runtime skills, bundled references, eval definitions, eval reports, and command-surface metadata.
- Refined user-facing plugin docs under `plugin-docs/`.
- Project-development docs under `docs/` for planning, current state, research, and handoffs.

The public repository excludes:

- Generated eval run output under `evals/runs/`.
- Enforcement hooks, CLI enforcement, Codex/Claude native slash handlers, and old Orchestra compatibility.

## Evidence

Use `evals/README.md` for the eval directory guide.

Current high-signal evidence:

- `evals/reports/acceptance/v0.1-acceptance-report.md`
- `evals/reports/by-skill/discover-1-report.md`
- `evals/reports/by-skill/interview-gate-2-report.md`
- `evals/reports/by-skill/setup-freeflow-5-report.md`
- `evals/reports/by-command-surface/command-surface-matrix.md`
- `evals/reports/runtime/always-on-runtime-1-report.md`
- `evals/reports/runtime/workflow-context-hook-1-report.md`
- `evals/reports/runtime/output-router-benchmark-1-report.md`
- `evals/reports/runtime/output-router-command-benchmark-1-report.md`
- `evals/reports/runtime/pi-observed-routing-eval-1-report.md`
- `evals/reports/runtime/vault-index-storage-spike-1-report.md`
- `evals/reports/runtime/output-router-transform-eval-1-report.md`
- `evals/reports/runtime/storage-policy-benchmark-1-report.md`
- `evals/reports/runtime/context-mode-normalized-benchmark-1-report.md`
- `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md`
- `evals/reports/runtime/output-router-codex-qa-benchmark-1-report.md`
- `evals/reports/runtime/quickjs-wasi-proof-spike-1-report.md`
- `evals/reports/runtime/eryx-python-proof-spike-2-report.md`
- `evals/reports/runtime/jq-wasm-proof-spike-1-report.md`
- `evals/reports/runtime/script-sandbox-probe-resource-hardening-1-report.md`

## Current Next Work

1. Tag `v0.3.0` and create a GitHub release if the release should have a public GitHub anchor.
2. Reinstall Freeflow from the GitHub package path and run install-smoke checks in Codex, Claude, and fresh Pi environments.
3. Run live Claude smoke evals after Hassan confirms Claude testing is available again.
4. Confirm Pi package-gallery indexing after npm refresh.
5. Dogfood in one real repo before broader announcement.
6. Submit or broaden public marketplace visibility only after required GitHub-install smoke tests pass.

Use this doc for current project status. Use research docs for historical reasoning.
