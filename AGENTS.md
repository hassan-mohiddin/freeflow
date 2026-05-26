# Freeflow Agent Memory

This repo develops `freeflow`, a candidate plugin/skill pack for guiding coding agents through consequential work without ceremony, silent decisions, or AI slop.

The plugin is not a new agent. It is a portable workflow layer for agents such as Codex, Claude, and similar coding environments.

## Read First

For project direction, read:

- `CONTEXT.md`
- `docs/plugin-contract.md`
- `docs/agent-workflow-plugin-context.md`
- `docs/skill-inventory-and-plugin-plan.md`
- `docs/freeflow-runtime-and-lifecycle.md`

For durable decisions, read `docs/adr/`.

For current continuation state, read the latest relevant file in `docs/handoffs/`.

For evidence about whether a skill works, read `plugins/freeflow/evals/README.md`, then the relevant report under `plugins/freeflow/evals/reports/`. Prefer later reports over earlier ones when they conflict.

## Reference Skill Stack

Freeflow is being built to become the primary workflow and orchestration layer. Until its behavior is validated, use this reference stack:

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

- Questions get answers, not surprise artifacts. If answering reveals missing work, report it; do not create files unless asked.
- If the user asks for X and the agent is about to do materially different Y, name the mismatch and ask which path to follow.
- Keep skill files short, behavior-shaping, and pressure-tested.
- Use `CONTEXT.md` for project language. Do not turn it into a spec or implementation summary.
- Use ADRs sparingly for hard-to-reverse, surprising, tradeoff-driven decisions.
- Do not hardcode volatile repo facts, directory inventories, or stack summaries into durable memory.
- Treat handoffs as memory, not authority.
- Let live repo evidence override stale handoff text.
- Do not let the agent silently decide product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or irreversible architecture.
- If a user-owned decision appears, ask before editing.
- Verify before claiming work is complete.
- Use evals that compare baseline vs with-skill behavior. A useful eval usually makes baseline fail and with-skill pass.
- Prefer adversarial fixture evals with saved diffs over clean prompts or subjective self-assessment.
- Add a new skill only when it has a distinct job, trigger, and failure mode. Update an existing skill when the behavior belongs to an existing job. Use `evaluate-skill` and `write-skill` for meaningful skill changes.
- Do not add hooks until skill wording and evals prove the behavior needs enforcement.

## Current Product Shape

The plugin has exactly three modes:

- `conversation`: discussion without workflow pressure.
- `workflow`: default for consequential work.
- `strict-workflow`: high-risk work with stronger gates.

The core workflow principle:

```text
Move forward when context is sufficient.
Re-enter clarification when new ambiguity would change the next action.
```

## Implementation Pointers

Plugin draft lives under `plugins/freeflow/`.

For the current skill set, inspect `plugins/freeflow/skills/`.

For current eval status, read `plugins/freeflow/evals/README.md`, then the latest relevant report in `plugins/freeflow/evals/reports/`.

For active continuation context, read the latest relevant file in `docs/handoffs/`.

## Style

Write like Matt Pocock's best skills:

- concise
- generalizable
- specific where behavior can fail
- light on procedure
- clear about stop conditions

Do not write long manuals when a sharp rule will do.
