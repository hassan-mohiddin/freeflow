# Pilot Workflow Agent Memory

This repo develops `pilot-workflow`, a candidate plugin/skill pack for guiding coding agents through consequential work without ceremony, silent decisions, or AI slop.

The plugin is not a new agent. It is a portable workflow layer for agents such as Codex, Claude, and similar coding environments.

## Read First

For project direction, read:

- `CONTEXT.md`
- `docs/plugin-contract.md`
- `docs/agent-workflow-plugin-context.md`
- `docs/skill-inventory-and-plugin-plan.md`

For durable decisions, read `docs/adr/`.

For current continuation state, read the latest relevant file in `docs/handoffs/`.

For evidence about whether a skill works, read `plugins/pilot-workflow/evals/*report.md`. Prefer later reports over earlier ones when they conflict.

## Working Rules

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

Plugin draft lives under `plugins/pilot-workflow/`.

For the current skill set, inspect `plugins/pilot-workflow/skills/`.

For current eval status, read the latest relevant report in `plugins/pilot-workflow/evals/`.

For active continuation context, read the latest relevant file in `docs/handoffs/`.

## Style

Write like Matt Pocock's best skills:

- concise
- generalizable
- specific where behavior can fail
- light on procedure
- clear about stop conditions

Do not write long manuals when a sharp rule will do.
