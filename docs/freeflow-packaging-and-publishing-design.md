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
- Tagline: `A feedback-based control system for coding agents.`
- Positioning: Freeflow is a portable control layer for Codex, Claude, and Pi. It gives coding agents an Interaction Contract, evidence-driven Workflow, focused methods, and durable task memory while preserving user authority and live source truth.

Freeflow should not present itself as a full governance system, agent replacement, CLI framework, or hook-enforced process engine.

## Why Separate From Orchestra

Old Orchestra is a heavy Claude-first engineering toolkit with typed docs, spec review machinery, CLI/lint tooling, hooks, mermaid expectations, and a broader governance identity.

Freeflow is a small portable workflow layer:

- skills first
- host-native skill invocation rather than duplicate manifest command handlers
- plugin-bundled context and session-mode hooks or Pi extension only; no enforcement hooks or CLI enforcement in v0.1
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
  .skill-eval/
  deprecated/
  hooks/
  capabilities/
  pi-extension/
  router/
  skills/
```

`plugin-docs/` contains public plugin docs. `.skill-eval/` contains current skill-evaluation definitions, `router/evals/` contains router-owned evaluation evidence, and `deprecated/skill-evals-v1/` contains documentary-only legacy skill evaluations. `docs/` contains project-development memory. These remain in the GitHub repository and are excluded from the npm runtime tarball. Generated router evaluation output stays ignored under `router/evals/runs/`.

## Codex Manifest

Use `.codex-plugin/plugin.json` as the Codex manifest:

- `name`: `freeflow`
- `version`: `0.1.0`
- `license`: `MIT`
- `skills`: `./skills/` (the 25 cross-host model/contributor skills only)
- `hooks`: `./hooks/hooks.json`
- `interface.displayName`: `Freeflow`
- `interface.shortDescription`: `Feedback-based control for coding agents.`
- `interface.longDescription`: describe the Interaction Contract, adaptive Workflow, three modes, routing from evidence, task memory, verification, selected review, and controlled delivery boundaries without overclaiming readiness.
- `interface.category`: `Coding` or `Productivity`; prefer `Coding`.
- no `commands` or `slashCommands`; Codex invokes plugin skills through `/skills` and `$skill` mentions.

Keep `nativeSlashHandlers=false` as evidence that Freeflow does not duplicate host-native skill invocation through manifest handlers. Record Claude namespaced slash skills, Codex skill mentions, and Pi registered commands separately in command-surface metadata.

## Claude Manifest

Create a Claude plugin manifest modeled on old Orchestra's `.claude-plugin/plugin.json`, but with Freeflow's lighter scope.

The Claude manifest lives at `.claude-plugin/plugin.json` and explicitly exposes `./skills/`. Claude loads the standard `hooks/hooks.json` automatically, so the manifest must not repeat that path; doing so creates a duplicate-hook load failure. Its model-facing skill surface matches Codex and excludes Pi-only capabilities.

The root `.claude-plugin/marketplace.json` points at `.` for manual Claude install and future GitHub publishing.

## Pi Package Manifest

The root `package.json` exposes the repo as a Pi package:

- `pi.skills`: `[]` (skill exposure is dynamic)
- `pi.extensions`: `pi-extension/freeflow/index.js`

The Pi extension registers direct Freeflow commands, keeps `/freeflow mode` changes session-scoped, separates temporary Session mode from configured defaults, and exposes model skills dynamically after setup. It reads required `.freeflow/config.json` plus optional per-checkout `.freeflow/local.json`, appends effective compact state and the Interaction Contract before agent turns, and loads Workflow once as a hidden persistent message while Skills are effective. Top-level `enabled: false` suppresses Freeflow context and capabilities. The extension does not enforce policy, grant permissions, or create repo-local hooks.

For local Pi/PiFlow development, Freeflow may provide an exact-commit snapshot built with `git archive` and `npm pack --ignore-scripts`. The snapshot is development-only, does not establish version precedence, and does not replace production npm/Git sources. PiFlow owns host launch, import, update, and upstream synchronization; Freeflow owns policy and snapshot production.

## README Shape

The public README should establish the product before installation:

1. Feedback-based control-system identity and failure pressures.
2. Interaction Lifecycle, Feedback Loop, and core principles.
3. Three modes, skill routing, task memory, and the separately packaged Pi-only Output Router capability.
4. Evidence and explicit Unverified boundary for the current candidate.
5. Install and repository activation for Codex, Claude, and Pi.
6. Runtime delivery, canonical commands, compatibility aliases, and public-doc links.
7. What Freeflow is not.

Keep the explanation concise and evidence-backed. Avoid broad competitive claims, generic philosophy essays, or old Orchestra feature promises.

## Release Boundary

The active cross-host plugin runtime ships this 25-skill model/contributor set:

- `workflow`
- `mode-contract`
- `decision-gate`
- `discuss`
- `track-work`
- `design-for-depth`
- `write-spec`
- `review-artifact`
- `write-plan`
- `execute-work`
- `tdd`
- `simplify-code`
- `migration-work`
- `diagnose-failure`
- `verify-work`
- `review-work`
- `commit-work`
- `handoff`
- `finish-branch`
- `release-work`
- `launch-work`
- `bypass`
- `setup-freeflow`
- `write-skill`
- `evaluate-skill`

The Pi npm package separately ships `capabilities/output-router/` for explicit Pi-only activation. Codex and Claude do not discover that path and their lifecycle hook does not inspect, report, or inject it.

The setup skill uses the public `setup-freeflow` name. It creates required shared `.freeflow/config.json`, may create optional personal `.freeflow/local.json` only when requested, preserves repo-owned host instruction files, and reports host runtime delivery separately from activation.

The current adaptive-workflow revisions are an Unverified candidate pending behavioral evaluation. `migration-work`, `finish-branch`, `release-work`, `launch-work`, and `simplify-code` are optional lifecycle skills; `tdd` is an optional execution method.

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

- No duplicate Codex/Claude manifest command runtime; use host-native skill invocation.
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
