# Freeflow Agent Memory

This repo develops `freeflow`, a plugin/skill pack for guiding coding agents through consequential work without ceremony, silent decisions, or AI slop.

The plugin is not a new agent. It is a portable workflow layer for agents such as Codex, Claude Code, Pi, and similar coding environments.

This file governs contributing to the Freeflow repository. It does not define the model-facing workflow or task-memory method; those belong to the runtime context and active skills. Repository-specific constraints here still apply to changes made in this repo.

## Read First

Use the project material relevant to the change:

- Read `docs/README.md` for the project docs map.
- Read `CONTEXT.md` for project language and direction.
- Read `docs/freeflow-current-state.md`, `docs/freeflow-packaging-and-publishing-design.md`, and `docs/freeflow-runtime-and-lifecycle.md` when changing product behavior, runtime, packaging, or architecture.
- Read `plugin-docs/README.md`, `plugin-docs/workflow.md`, `plugin-docs/architecture.md`, and `plugin-docs/release-evidence.md` when changing public plugin behavior, docs, or release guidance.
- Read `docs/adr/` or `plugin-docs/adr/` when the change touches a durable decision.
- Read the latest relevant file in `docs/handoffs/` when resuming an existing project task or transfer.
- Inspect `.skill-eval/` and the accepted bundle when changing or evaluating a skill's evidence. Historical v1 cases and reports under `deprecated/skill-evals-v1/` are documentary only and never establish current readiness.

Historical research under `docs/` is background only; live repository evidence and current plugin docs override it.

## Development Snapshot Boundary

Pi and PiFlow development consume a committed Freeflow snapshot, not this checkout's working tree:

```bash
npm run snapshot:refresh
```

Commit intended Freeflow changes before refreshing. The tool archives the selected Git revision, packs it with `npm pack --ignore-scripts`, records provenance, and replaces the target atomically. It excludes uncommitted and ignored files and does not mutate host state. Snapshots are development-only; production uses ordinary npm/Git sources. Read `docs/guides/tooling/freeflow-development-snapshot.md` for isolated targets, rollback, and clean-install verification.

PiFlow launch, import, and update behavior remains PiFlow-owned; Freeflow supplies policy and the development package snapshot.

## Reference Stack For Skill Development

When authoring or revising a Freeflow skill and current coverage, evidence, or behavior needs an outside reference, consult this stack:

- Matt Pocock skills are the primary style and behavior reference.
- Obra/Superpowers skills are the workflow lifecycle reference.
- Anthropic `skill-creator` is the skill authoring and eval methodology reference.

These references guide skill development and evaluation; they are not runtime dependencies and do not replace the active Freeflow skills during ordinary work.

Use Matt for concise skill wording, sharp failure-prevention rules, low-ceremony loops, and practical engineering judgment.

Use Obra/Superpowers for workflow phases, planning, execution, review, verification, debugging, and lifecycle gaps Freeflow has not encoded yet.

Use Anthropic `skill-creator` for skill structure, trigger descriptions, progressive disclosure, baseline versus with-skill evals, and iteration from measured failures.

When reference skills conflict during skill development:

1. User instruction wins.
2. Repo memory wins: `AGENTS.md`, `CONTEXT.md`, ADRs.
3. Freeflow docs and eval reports win.
4. Matt style wins for interaction shape and skill wording.
5. Obra/Superpowers wins for lifecycle coverage.
6. Anthropic `skill-creator` wins for skill creation and eval mechanics.

## Working Rules

- Use `CONTEXT.md` for project language. Do not turn it into a spec or implementation summary.
- Use ADRs sparingly for hard-to-reverse, surprising, tradeoff-driven decisions.
- Do not hardcode volatile repo facts, directory inventories, or stack summaries into durable memory.
- Do not add enforcement hooks until skill wording and evals prove the behavior needs mechanical enforcement.

## Documentation And Changelog Policy

- Agents may update `CHANGELOG.md` under `## Unreleased` for verified consumer-visible work when the task authorization covers that update. Defer the entry until the final implementation slice unless bounded write-ahead authorization says otherwise.
- Never edit released changelog sections.
- Changes to `plugin-docs/`, public contract or install guidance, durable project docs, ADRs, or release evidence require explicit authorization and should be deferred to the final documentation slice.
- If leaving a document stale would make the repository misleading, stop and ask rather than silently editing it.

## Release And CI

- Use `release-work` for version classification, release preparation, artifact checks, publication, recovery, and consumer-side verification.
- `npm run check` is the deterministic local/CI gate. It does not run model-based skill evaluations or require publication credentials.
- Release preparation may update version metadata and move verified `Unreleased` notes into a version section, but it must not commit, tag, push, publish, or create a GitHub Release by itself.
- A Git tag in the form `vX.Y.Z` is the human-controlled release boundary. The tag workflow verifies the exact source and version, then publishes npm and creates the GitHub Release.
- Never reuse an npm version or force-move a release tag. If publication partially succeeds, inspect remote state before retrying.
- Do not run `npm run snapshot:refresh` as part of a production release. Snapshots are development-only.

## Implementation Pointers

The repo root is the single source of truth for runtime skills, plugin docs, current `.skill-eval/` definitions, router evidence under `router/evals/`, and command-surface metadata. The npm tarball contains only runtime-required files; GitHub retains docs and evidence.

For the current skill set, inspect `skills/` when changing or evaluating a skill. Runtime behavior and task-memory mechanics belong to their corresponding skill and runtime sources; this contributor file does not restate them.

## Style

Write like Matt Pocock's best skills:

- concise
- generalizable
- specific where behavior can fail
- light on procedure
- clear about stop conditions

Do not write long manuals when a sharp rule will do.
