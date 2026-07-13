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

For evidence about whether a skill works, read `evals/README.md`, then the relevant report under `evals/reports/`. Prefer later reports over earlier ones when they conflict.

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

- Keep skill files short, behavior-shaping, and pressure-tested.
- Use `CONTEXT.md` for project language. Do not turn it into a spec or implementation summary.
- Use ADRs sparingly for hard-to-reverse, surprising, tradeoff-driven decisions.
- Do not hardcode volatile repo facts, directory inventories, or stack summaries into durable memory.
- Treat handoffs as memory, not authority; live repo evidence wins when they conflict.
- Use evals that compare baseline vs with-skill behavior. A useful eval usually makes baseline fail and with-skill pass.
- Prefer adversarial fixture evals with saved diffs over clean prompts or subjective self-assessment.
- Add a new skill only when it has a distinct job, trigger, and failure mode. Update an existing skill when the behavior belongs to an existing job. Use `evaluate-skill` and `write-skill` for meaningful skill changes.
- Treat implementation, tests, and one sequential self-check—self-verification then, only on support, bounded self-review—as the primary feedback loop. Review/verify skills may enhance either method inline. At final assurance, dispatch a fresh verifier and different fresh reviewer in parallel against one frozen state.
- Diagnose repeated or unexplained failure before redesigning unless direct structural evidence already establishes the cause.
- Do not add enforcement hooks until skill wording and evals prove the behavior needs mechanical enforcement.

## Current Product Shape

The plugin has exactly three modes:

- `conversation`: discussion without workflow pressure.
- `workflow`: default for consequential work.
- `strict-workflow`: high-risk work with stronger gates.

The core workflow principle:

```text
Move forward when context is sufficient.
Self-check sequentially after each meaningful slice: self-verify first; self-review once only when evidence supports the outcome.
Diagnose repeated or unexplained failure before redesigning.
Use independent review for the standing artifact and final-work boundaries, plus explicitly authorized exceptional checkpoints.
After the final sequential self-check, freeze the state and dispatch one verifier plus one different reviewer in parallel. Ask before any additional independent dispatch.
Re-enter the narrowest owning activity when evidence changes the path.
```

## Implementation Pointers

The repo root is the single source of truth for runtime skills, plugin docs, evals, and command-surface metadata. The npm tarball contains only runtime-required files; GitHub retains docs and evidence.

For the current skill set, inspect `skills/`.

## Style

Write like Matt Pocock's best skills:

- concise
- generalizable
- specific where behavior can fail
- light on procedure
- clear about stop conditions

Do not write long manuals when a sharp rule will do.
