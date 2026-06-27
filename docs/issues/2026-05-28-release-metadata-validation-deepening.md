# Release Metadata Validation Deepening

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow release validation

## Summary

Freeflow's release metadata validation is shallow because marketplace identity, host manifests, command-surface metadata, package-boundary rules, release evidence, and deferred smoke-test status are checked through scattered docs and ad hoc commands.

Deepen this into one release metadata validation module with a trivial maintainer-facing default and host/source-specific adapters.

## Evidence

Discovery artifact:

- [Architecture review candidates](artifacts/2026-05-28-architecture-review-candidates.html)

Focused interface review:

- [Release metadata validation interface review](artifacts/2026-05-28-release-metadata-validation-interface-review.html)

Current files:

- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/plugin.json`
- `.claude-plugin/plugin.json`
- `command-surface.json`
- `evals/scripts/audit-command-surface.sh`
- `plugin-docs/architecture.md`
- `plugin-docs/release-evidence.md`
- `plugin-docs/adr/0003-release-boundary.md`
- `evals/reports/acceptance/v0.1-acceptance-report.md`
- `.gitignore`

## Problem

The current release metadata shape has weak locality:

- Codex marketplace metadata lives at the repo root
- Claude marketplace metadata lives at the repo root
- Codex plugin manifest lives under the runtime
- Claude plugin manifest lives under the runtime
- command-surface truth lives in `command-surface.json`
- command-surface validation lives in a Bash audit script
- release-boundary truth lives in docs and ADRs
- prepublish checks live in acceptance reports and historical plans
- package cleanliness and old-identity scans are not one reusable interface
- GitHub and Claude install smoke checks are deferred but not represented as first-class validation states

The module is shallow because release preparation requires remembering too many paths and precedence rules.

## Recommendation

Use a hybrid design:

```text
validateReleaseMetadata()
  -> ReleaseMetadataValidator.validate({
       pluginRoot: "the repo root",
       mode: "prepublish",
       checks: defaultLocalChecks
     })
       -> HostMetadataAdapters(Codex, Claude)
       -> CommandSurfaceAdapter(existing audit first)
       -> DocsEvidenceAdapter
       -> GitPackageScanAdapter
       -> Optional InstallSmokeAdapter
```

This combines:

- a trivial default caller for maintainers
- a normalized release metadata model
- bounded modes: `local`, `prepublish`, and `release`
- source-specific adapters
- optional install smoke checks that can be `blocked` or `deferred`

Do not create a generated package copy or add hooks/native slash handlers as part of this deepening.

## Desired Interface

Default caller:

```text
validateReleaseMetadata() -> ReleaseMetadataReport
```

Explicit caller:

```text
ReleaseMetadataValidator.validate({
  repoRoot,
  pluginRoot: "the repo root",
  releaseVersion: "0.1.0",
  mode: "prepublish",
  checks: [
    "json-shape",
    "marketplace-locality",
    "manifest-consistency",
    "command-surface",
    "release-boundary",
    "package-cleanliness",
    "docs-drift"
  ]
}) -> ReleaseMetadataReport
```

Report shape:

- `status`: `pass`, `fail`, or `blocked`
- `version`
- `summary`
- `checks`
- `findings`
- `warnings`
- `deferred`
- `evidence`

## Invariants

- repo root is the marketplace and GitHub-facing shell
- the repo root is the only plugin runtime source of truth
- root Codex marketplace points to `.`
- root Claude marketplace points to `.`
- Codex and Claude manifests agree on stable release metadata: `name`, `version`, `license`, author, homepage, repository, and identity language
- `command-surface.json` is command authority
- `nativeSlashHandlers=false` means manifests do not declare `commands` or `slashCommands`
- every command-surface skill route maps to an existing `skills/<skill>/SKILL.md`
- mode commands use `/workflow ...` and route to `mode-contract`
- release docs and release evidence do not claim v0.1 hooks, CLI enforcement, native slash handlers, old Orchestra compatibility, or generated package output
- generated eval runs remain ignored and outside release metadata truth
- install smoke checks run last and can be reported as blocked/deferred when auth, network, or host runtime is unavailable

## Adapter Strategy

Keep the core validator pure: normalized inputs in, findings out.

Adapters:

- `CodexMarketplaceAdapter`: reads `.agents/plugins/marketplace.json`.
- `ClaudeMarketplaceAdapter`: reads `.claude-plugin/marketplace.json`.
- `CodexManifestAdapter`: reads `.codex-plugin/plugin.json`.
- `ClaudeManifestAdapter`: reads `.claude-plugin/plugin.json`.
- `CommandSurfaceAdapter`: wraps or replaces `audit-command-surface.sh`.
- `DocsEvidenceAdapter`: checks release evidence, architecture docs, and ADR 0003 for drift.
- `GitPackageScanAdapter`: checks ignored generated runs, duplicate package copies, old identity, and package cleanliness.
- `InstallSmokeAdapter`: optional Codex/GitHub/Claude install checks.

Wrap the existing command-surface audit first. Replace it with a structured adapter only when a concrete caller needs richer findings.

## Follow-Up Checklist

Use this as a readiness checklist for future work, not as an approved implementation plan.

- [ ] Decide implementation language for the validator and default caller.
- [ ] Decide whether the first caller is a script, module, or both.
- [ ] Add or update eval/fixture coverage before replacing release checks.
- [ ] Preserve the repo root as the single runtime.
- [ ] Preserve root marketplace files pointing to `.`.
- [ ] Preserve Codex and Claude manifest identity alignment.
- [ ] Preserve `nativeSlashHandlers=false` and no manifest command handlers for v0.1.
- [ ] Preserve generated-run exclusion and `.gitignore` behavior.
- [ ] Preserve release-boundary claims in ADR 0003 and plugin docs.
- [ ] Wrap `audit-command-surface.sh` before rewriting it.
- [ ] Represent GitHub/Claude install smoke as optional or blocked when unavailable.
- [ ] Avoid making Markdown prose parsing too brittle.
- [ ] Run JSON validation, command-surface audit, package cleanliness checks, and `git diff --check`.

## Non-Goals

- Do not add hooks.
- Do not add native slash handlers.
- Do not add CLI enforcement as part of v0.1 validation.
- Do not create a generated package mirror.
- Do not make docs prose the only authority for release truth.
- Do not prove runtime agent behavior here; behavioral proof remains in evals.

## Open Questions

- Should the validator live under `evals/scripts/`, a new release-validation module, or another runtime-adjacent folder?
- Should local package cleanliness inspect the working tree only, or also a generated archive later?
- Which checks should be release-blocking versus warning/deferred in `local`, `prepublish`, and `release` modes?
- Should docs drift checks start as targeted string checks, or should release docs get structured metadata later?
