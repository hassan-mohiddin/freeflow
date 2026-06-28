# Freeflow Packaging and Publishing Design

> **Doc ID:** DESIGN-001-freeflow-packaging
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Design
> **Status:** Accepted
> **Source:** Current Freeflow v0.1 acceptance evidence, old Orchestra audit, Codex/Superpowers/Caveman plugin shapes, Claude plugin marketplace shape, Pi package/runtime verification

## Decision

Publish the proven Freeflow v0.1 behavior as a separate public plugin named **Freeflow**.

Do not copy the contents into the old `orchestra` repo for the first public plugin. Treat old Orchestra as prior art, migration context, and failure evidence. Freeflow should stand alone as the lightweight workflow successor.

The development surface now uses `freeflow` as well. The public repository uses one installable plugin runtime under the repo root; no generated package copy should be maintained.

## Product Identity

- Repository name: `freeflow`
- Plugin name: `freeflow`
- Display name: `Freeflow`
- Tagline: `Lightweight workflow for coding agents.`
- Positioning: Freeflow is a portable workflow skill pack for Codex, Claude, and Pi. It keeps consequential work moving while preserving user control over product behavior, scope, public APIs, security, privacy, billing, data loss, compatibility, and irreversible architecture.

Freeflow should not present itself as a full governance system, agent replacement, CLI framework, or hook-enforced process engine.

## Why Separate From Orchestra

Old Orchestra is a heavy Claude-first engineering toolkit with typed docs, spec review machinery, CLI/lint tooling, hooks, mermaid expectations, and a broader governance identity.

Freeflow is a small portable workflow layer:

- skills first
- no Codex/Claude native slash handlers in v0.1
- plugin-bundled context hooks or Pi extension only; no enforcement hooks or CLI enforcement in v0.1
- no mandatory global standards
- no old `/orchestra:*` compatibility surface

Publishing separately avoids inheriting old Orchestra expectations while preserving the option to later add a migration note in the old repo.

## Repository Shape

Use the public repository as the plugin root and keep one installable runtime:

```text
freeflow/
  package.json
  .agents/plugins/marketplace.json
  .codex-plugin/plugin.json
  .claude-plugin/marketplace.json
  .claude-plugin/plugin.json
  README.md
  LICENSE
  CHANGELOG.md
  command-surface.json
  assets/
  plugin-docs/
  docs/
  evals/
  hooks/
  pi-extension/
  router/
  skills/
```

`plugin-docs/` contains public plugin docs. `docs/` contains project-development memory. Generated eval run output stays ignored under `evals/runs/`.

## Codex Manifest

Use `.codex-plugin/plugin.json` as the Codex manifest:

- `name`: `freeflow`
- `version`: `0.1.0`
- `license`: `MIT`
- `skills`: `./skills/`
- `interface.displayName`: `Freeflow`
- `interface.shortDescription`: `Lightweight workflow for coding agents.`
- `interface.longDescription`: describe conversation/workflow/strict-workflow, interview gates, verification-before-claiming, review, commit, handoff, and decision capture without overclaiming.
- `interface.category`: `Coding` or `Productivity`; prefer `Coding`.
- no `commands` or `slashCommands` until native handlers are intentionally added.

Keep `nativeSlashHandlers=false` in the internal command-surface evidence for Codex/Claude unless native runtime support is added later. Pi direct commands are documented as Pi-extension behavior.

## Claude Manifest

Create a Claude plugin manifest modeled on old Orchestra's `.claude-plugin/plugin.json`, but with Freeflow's lighter scope.

The Claude manifest lives at `.claude-plugin/plugin.json` and exposes the same `skills/` directory through the plugin runtime.

The root `.claude-plugin/marketplace.json` points at `.` for manual Claude install and future GitHub publishing.

## Pi Package Manifest

The root `package.json` exposes the repo as a Pi package:

- `pi.skills`: `skills`
- `pi.extensions`: `pi-extension/dist/index.js`

The Pi extension registers direct Freeflow commands, keeps `/workflow` mode changes session-scoped, loads workflow, interview-gate, discover, workflow-map, and output-router context on session start and compact, and injects that context before agent turns. It does not enforce policy, block tools, grant permissions, or create repo-local hooks.

## README Shape

The public README should be short and install-focused:

1. What Freeflow is.
2. What it is not.
3. Install for Codex.
4. Install for Claude.
5. Install for Pi.
6. Basic usage examples.
7. Mode summary: `conversation`, `workflow`, `strict-workflow`.
8. Skill list.
9. Development evidence: link to v0.1 acceptance report in this repo or copied release notes.
10. Relationship to Orchestra.

Avoid long competitive comparisons, broad philosophy essays, or old Orchestra feature promises.

## Release Boundary

The active plugin runtime ships the current proven skill set:

- `workflow`
- `mode-contract`
- `interview-gate`
- `output-router`
- `discover`
- `write-spec`
- `review-artifact`
- `write-plan`
- `execute-plan`
- `diagnose-failure`
- `verify-work`
- `review-work`
- `commit-work`
- `handoff`
- `bypass`
- `setup-freeflow`
- `write-skill`
- `evaluate-skill`

The setup skill uses the public `setup-freeflow` name.

## Publishing Sequence

1. Prepare the public marketplace repo with one runtime at the repo root. Done.
2. Add Codex, Claude, and Pi package metadata. Done.
3. Add README, LICENSE, CHANGELOG, project docs, and refined plugin docs. Done.
4. Run manifest validation and the existing command-surface audit. Done for manifest validation; command-surface audit remains part of final verification.
5. Run the v0.1 acceptance suite from the current eval layout or add an equivalent marketplace-layout smoke gate.
6. Create a separate GitHub repo for `freeflow`. Done: `https://github.com/hassan-mohiddin/freeflow`.
7. Push marketplace repo contents. Done previously; repeat after this layout cleanup.
8. Install from GitHub in separate Codex, Claude, and fresh Pi environments.
9. Dogfood in one real repo before broader announcement.

## Remaining Decisions Before Public Announcement

- Whether old Orchestra receives a short README note after Freeflow is published.
- Whether to publish a summarized eval-evidence page publicly beyond the plugin docs `plugin-docs/release-evidence.md`.

## Non-Goals For v0.1

- No Codex/Claude native slash-command runtime.
- No enforcement hooks or CLI enforcement.
- No old Orchestra command compatibility.
- No migration of old Orchestra docs, templates, spec-review machinery, or CLI.
- No public marketplace submission until GitHub install works for Codex, Claude, and Pi.

## Self-Review

- No placeholders remain.
- The design preserves the user's chosen Freeflow name.
- The design separates publishing identity from old Orchestra while keeping a later migration path open.
- The scope is limited to packaging and publication readiness, not runtime expansion.
- Remaining decisions are explicit.
