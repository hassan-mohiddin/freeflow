# Freeflow Packaging and Publishing Design

> **Doc ID:** DESIGN-001-freeflow-packaging
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Design
> **Status:** Draft
> **Source:** Current Freeflow v0.1 acceptance evidence, old Orchestra audit, Codex/Superpowers/Caveman plugin shapes, Claude plugin marketplace shape

## Decision

Publish the proven Freeflow v0.1 behavior as a separate public plugin named **Freeflow**.

Do not copy the contents into the old `orchestra` repo for the first public package. Treat old Orchestra as prior art, migration context, and failure evidence. Freeflow should stand alone as the lightweight workflow successor.

The development surface now uses `freeflow` as well. The public package and dev workspace should not preserve the old candidate name in tracked content.

## Product Identity

- Repository name: `freeflow`
- Plugin name: `freeflow`
- Display name: `Freeflow`
- Tagline: `Lightweight workflow for coding agents.`
- Positioning: Freeflow is a portable workflow skill pack for Codex and Claude. It keeps consequential work moving while preserving user control over product behavior, scope, public APIs, security, privacy, billing, data loss, compatibility, and irreversible architecture.

Freeflow should not present itself as a full governance system, agent replacement, CLI framework, or hook-enforced process engine.

## Why Separate From Orchestra

Old Orchestra is a heavy Claude-first engineering toolkit with typed docs, spec review machinery, CLI/lint tooling, hooks, mermaid expectations, and a broader governance identity.

Freeflow is a small portable workflow layer:

- skills first
- no native slash handlers in v0.1
- no hooks or CLI enforcement in v0.1
- no mandatory global standards
- no old `/orchestra:*` compatibility surface

Publishing separately avoids inheriting old Orchestra expectations while preserving the option to later add a migration note in the old repo.

## Package Shape

Create a clean distributable package under `packages/freeflow/`, not a copy of the Research repo:

```text
packages/freeflow/
  .codex-plugin/
    plugin.json
  .claude-plugin/
    plugin.json
    marketplace.json
  skills/
  README.md
  LICENSE
  CHANGELOG.md
  docs/
```

The public package should include only install/runtime assets and concise supporting docs. Development-only fixtures, eval run outputs, research notes, and handoffs should stay in this Research repo unless deliberately published as evidence.

## Codex Manifest

Use the current `plugins/freeflow/.codex-plugin/plugin.json` as the starting point, with identity updated:

- `name`: `freeflow`
- `version`: `0.1.0`
- `license`: choose before publishing
- `skills`: `./skills/`
- `interface.displayName`: `Freeflow`
- `interface.shortDescription`: `Lightweight workflow for coding agents.`
- `interface.longDescription`: describe conversation/workflow/strict-workflow, interview gates, verification-before-claiming, review, commit, handoff, and decision capture without overclaiming.
- `interface.category`: `Coding` or `Productivity`; prefer `Coding`.
- no `commands` or `slashCommands` until native handlers are intentionally added.

Keep `nativeSlashHandlers=false` in the internal command-surface evidence unless native runtime support is added later.

## Claude Manifest

Create a Claude plugin manifest modeled on old Orchestra's `.claude-plugin/plugin.json`, but with Freeflow's lighter scope.

The Claude package should expose the same root `skills/` directory. Do not nest runtime components inside `.claude-plugin/` except Claude plugin metadata.

The optional `.claude-plugin/marketplace.json` should point at this plugin as a single local marketplace entry for manual Claude install and future GitHub publishing.

## README Shape

The public README should be short and install-focused:

1. What Freeflow is.
2. What it is not.
3. Install for Codex.
4. Install for Claude.
5. Basic usage examples.
6. Mode summary: `conversation`, `workflow`, `strict-workflow`.
7. Skill list.
8. Development evidence: link to v0.1 acceptance report in this repo or copied release notes.
9. Relationship to Orchestra.

Avoid long competitive comparisons, broad philosophy essays, or old Orchestra feature promises.

## Release Boundary

The first public package should ship the current proven v0.1 skill set:

- `workflow`
- `mode-contract`
- `interview-gate`
- `grill-context`
- `research-brief`
- `write-spec`
- `review-artifact`
- `write-plan`
- `execute-plan`
- `diagnose-failure`
- `verify-work`
- `review-work`
- `commit-work`
- `capture-decisions`
- `handoff`
- `bypass`
- `setup-freeflow`
- `write-skill`
- `evaluate-skill`

The setup skill uses the public `setup-freeflow` name.

## Publishing Sequence

1. Prepare a clean `freeflow` package directory from the current development plugin.
2. Add Codex and Claude manifests.
3. Add README, LICENSE, and CHANGELOG.
4. Run manifest validation and the existing command-surface audit against the packaged copy.
5. Run the v0.1 acceptance suite against the packaged copy or add an equivalent package-mode smoke gate.
6. Create a separate GitHub repo for `freeflow`.
7. Push v0.1.0.
8. Install from GitHub in a separate Codex environment and Claude environment.
9. Dogfood in one real repo before broader announcement.

## Open Decisions Before Implementation

- License: likely MIT, but confirm before publishing.
- GitHub owner/path: likely `hassan-mohiddin/freeflow`, but confirm.
- Whether public package includes eval reports as docs or keeps them only in Research.
- Whether old Orchestra receives a short README note after Freeflow is published.

## Non-Goals For v0.1

- No native slash-command runtime.
- No hooks or CLI enforcement.
- No old Orchestra command compatibility.
- No migration of old Orchestra docs, templates, spec-review machinery, or CLI.
- No public marketplace submission until GitHub install works for Codex and Claude.

## Self-Review

- No placeholders remain.
- The design preserves the user's chosen Freeflow name.
- The design separates publishing identity from old Orchestra while keeping a later migration path open.
- The scope is limited to packaging and publication readiness, not implementation.
- Open decisions are explicit and must be resolved before publishing.
