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
- Treat implementation, tests, and one sequential self-check—active-agent verification then, only on support, bounded self-review—as the primary feedback loop. Review/verify skills may enhance either method inline; reading them does not create independence.
- Use independent review only at its standing Spec or Plan boundary, an approved Plan-selected boundary, or another explicitly selected boundary. Review findings do not authorize edits; request unapproved corrections and any warranted focused follow-up together.
- Diagnose repeated or unexplained failure before redesigning unless direct structural evidence already establishes the cause.
- Do not add enforcement hooks until skill wording and evals prove the behavior needs mechanical enforcement.

## Current Product Shape

The plugin has exactly three modes:

- `conversation`: discussion without workflow pressure.
- `workflow`: default for consequential work.
- `strict-workflow`: high-risk work with stronger gates.

The core workflow principle:

```text
Begin one Interaction Lifecycle from the user turn or new evidence.
Enter the Feedback Loop only when work is needed.
Self-check sequentially after meaningful work: verify first; self-review once only when evidence supports the result.
Diagnose repeated or unexplained failure before redesigning.
Use separate independent review for Specs, Plans, approved Plan-selected boundaries, or another explicitly selected boundary.
End review with Pass, Non-blocking, Inconclusive, or Blocking; then adjudicate and route without treating findings as commands.
Re-enter the narrowest owning activity when evidence changes the path.
Reach a Supported Exit without inventing another phase.
```

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
