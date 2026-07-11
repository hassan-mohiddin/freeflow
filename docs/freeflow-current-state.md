# Freeflow Current State

> **Doc ID:** STATE-2026-07-11-freeflow-current
> **Date:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current
> **Source:** Live repo, npm package metadata, v0.1 acceptance evidence, v0.3 runtime/setup/output-router evidence, marketplace-layout verification, Pi package/runtime verification.

Freeflow is a portable workflow skill pack for coding agents.

## Current Status

- Product name: Freeflow.
- Source tree: the repo root is the single source of truth for manifests, skills, references, evals, command-surface metadata, and refined plugin docs; the npm tarball includes only runtime-required files.
- Marketplace repo root: contains GitHub README, license, changelog, `plugin-docs/`, `docs/`, Codex marketplace index, Claude marketplace index, and Pi package manifest.
- Current package version: `0.3.0`.
- License target: MIT.
- GitHub target: `hassan-mohiddin/freeflow`.
- GitHub repo: published at `https://github.com/hassan-mohiddin/freeflow`.
- npm package: published as `@hassangameryt/freeflow@0.3.0`.
- Host targets: Codex, Claude Code, and Pi.
- v0.1 local acceptance suite: passed after measured fixes and remains historical release evidence; it does not verify the current adaptive-workflow candidate.
- Output-router evidence: passed for deterministic retrieval, command-output routing/recovery, observed routing, vault-wide indexing, transform/reducer routing, proof-backed script transform adapters, storage policy, Context Mode comparison, and Codex Structured Q&A coverage.
- Setup/config contract: `.freeflow/config.json` is the sole repo activation boundary; setup preserves repo-owned host instructions and adds optional router/observed-routing/script-transform config only after an explicit setup branch/request. This revised setup behavior is Unverified pending behavioral evaluation.
- Prepublish verification: passed on 2026-05-26 for v0.1, refreshed during v0.2 release prep, and covered by the current release-metadata validation script for v0.3 package metadata and release-boundary docs.
- Candidate skill snapshot: 26 runtime/contributor skills. The adaptive revisions and new candidate skills remain Unverified pending behavioral evaluation.
- Command surface: 4 mode commands, 16 direct skill calls, 3 developer/setup calls, and 3 Pi native settings commands.
- Optional candidates: `deprecation-and-migration`, `finish-branch`, `release-work`, `shipping-and-launch`, and `simplify-code`; `tdd` is an optional execution method.
- Decision authority: `decision-gate` is the active skill name and runtime path; legacy `IVG-*` IDs and historical reports remain historical evidence for the former `interview-gate` behavior.
- Native slash handlers: not shipped for Codex/Claude in the current release; Pi exposes direct Freeflow commands through its extension.
- Runtime context loading: Codex/Claude plugin-bundled hooks and the Pi extension load one canonical compact kernel from `skills/decision-gate/references/runtime-kernel.md`; global installs stay inert until valid `.freeflow/config.json` exists. The full Workflow skill loads once on the first turn, while Mode Contract and other workflow skills remain on demand. Pi keeps the kernel in every system prompt and Workflow in one hidden persistent session message, suppressing that message while Skills are disabled. Deterministic runtime tests cover injection and deduplication; behavioral effectiveness remains Unverified.
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

The npm runtime tarball excludes root `evals/`, `plugin-docs/`, and project-development docs; those remain GitHub evidence and documentation surfaces.

The public repository excludes:

- Generated eval run output under `evals/runs/`.
- Enforcement hooks, CLI enforcement, Codex/Claude native slash handlers, and old Orchestra compatibility.

## Evidence

Use `evals/README.md` for the eval directory guide.

Current high-signal historical and runtime evidence (not behavioral verification of the adaptive candidate):

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

1. Freeze the structurally validated 26-skill adaptive snapshot as Unverified.
2. Finish the evaluator architecture before running new skill evals.
3. Add baseline-vs-with-skill behavioral coverage for revised and new skills, including config-only activation, unavailable/untrusted runtime delivery, and composition pressure cases.
4. Reinstall from the GitHub package path and run Codex, Claude, and fresh Pi install-smoke checks when preparing the next release.
5. Dogfood in one real repo before making readiness or comparative-superiority claims.

Use this doc for current project status. Use research docs for historical reasoning.
