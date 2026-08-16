# Freeflow Agent Memory

This repo develops `freeflow`, a plugin/skill pack for guiding coding agents through consequential work without ceremony, silent decisions, or AI slop.

The plugin is not a new agent. It is a portable workflow layer for agents such as Codex, Claude Code, Pi, and similar coding environments.

## Read First

For the project docs map, read `docs/README.md`.

For project direction, read:

- `CONTEXT.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-packaging-and-publishing-design.md`
- `docs/freeflow-runtime-and-lifecycle.md`

For refined user-facing plugin docs, read:

- `plugin-docs/README.md`
- `plugin-docs/workflow.md`
- `plugin-docs/architecture.md`
- `plugin-docs/release-evidence.md`

For durable project decisions, read `docs/adr/`. For refined release ADRs, read `plugin-docs/adr/`.

For historical research, read `docs/` only when background matters. Live repo evidence and current plugin docs override older research and handoffs.

For current continuation state, read the latest relevant file in `docs/handoffs/`.

For current skill-evaluation evidence, inspect `.skill-eval/` and the accepted bundle for the exact skill, case, host, model, and configuration. Historical v1 cases and reports under `deprecated/skill-evals-v1/` are documentary only and never establish current readiness.

## Development Snapshot Boundary

Pi and PiFlow development consume a committed Freeflow snapshot, not this checkout's working tree:

```bash
npm run snapshot:refresh
```

Commit intended Freeflow changes before refreshing. The tool archives the selected Git revision, packs it with `npm pack --ignore-scripts`, records provenance, and replaces the target atomically. It excludes uncommitted and ignored files and does not mutate host state. Snapshots are development-only; production uses ordinary npm/Git sources. Read `docs/guides/tooling/freeflow-development-snapshot.md` for isolated targets, rollback, and clean-install verification.

PiFlow launch, import, and update behavior remains PiFlow-owned; Freeflow supplies policy and the development package snapshot.

## Reference Skill Stack

Freeflow is the primary workflow layer for this repo. Use this reference stack when Freeflow lacks coverage, evidence is thin, or a behavior gap appears:

- Matt Pocock skills are the primary style and behavior reference.
- Obra/Superpowers skills are the workflow lifecycle reference.
- Anthropic `skill-creator` is the skill authoring and eval methodology reference.

Use Matt for concise skill wording, sharp failure-prevention rules, low-ceremony loops, and practical engineering judgment.

Use Obra/Superpowers for workflow phases, planning, execution, review, verification, debugging, and lifecycle gaps Freeflow has not encoded yet.

Use Anthropic `skill-creator` for skill structure, trigger descriptions, progressive disclosure, baseline versus with-skill evals, and iteration from measured failures.

When reference skills conflict:

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

For the current skill set, inspect `skills/`. When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, read its complete Working Record and compare it with the current conversation and live state before continuing task work.

## Style

Write like Matt Pocock's best skills:

- concise
- generalizable
- specific where behavior can fail
- light on procedure
- clear about stop conditions

Do not write long manuals when a sharp rule will do.
