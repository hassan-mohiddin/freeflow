# Artifact Skills Handoff

Date: 2026-05-25

## Purpose

Continue Freeflow development by drafting and evaluating artifact skills:

- `write-spec`
- `write-plan`
- `review-artifact`

This handoff is memory, not authority. Inspect live files before editing.

## Read First

- `docs/research/freeflow-artifact-skills.md`
- `docs/plugin-contract.md`
- `docs/research/agent-workflow-plugin-context.md`
- `plugins/freeflow/skills/workflow/SKILL.md`
- `plugins/freeflow/skills/interview-gate/SKILL.md`
- `plugins/freeflow/skills/review-work/SKILL.md`

For eval style:

- `plugins/freeflow/evals/reports/iterations/iteration-6-report.md`
- `plugins/freeflow/evals/reports/by-skill/review-work-1-report.md`
- `plugins/freeflow/evals/reports/by-skill/diagnose-failure-1-report.md`

## Current Decisions

- Rename planned `review-spec` to `review-artifact`.
- Keep `write-spec`, `write-plan`, and `review-artifact` separate.
- Do not build one broad `write-artifact` skill yet.
- `write-spec` normally writes a file. If artifact type or destination is unclear, fire interview gate before writing.
- `write-plan` should prefer an approved spec, but can write a lightweight plan from clear context. Missing spec plus missing context routes to interview/grilling.
- `review-artifact` reviews whether an artifact can guide work. It is distinct from `review-work`, which reviews completed implementation.

## Evidence Pointers

Reference skill files already inspected:

- Matt `to-prd`: concise synthesis from known context.
- Matt `grill-with-docs`: inspect docs/language first; capture stable terms/decisions.
- Matt `tdd`: behavior-first vertical red/green loops.
- Matt `to-issues`: tracer-bullet slicing.
- Matt `diagnose`: repro/feedback loop before bug fixes.
- Obra `brainstorming`: lifecycle before implementation, but too hard-gated for Freeflow defaults.
- Obra `writing-plans`: executable plans, but too exhaustive/code-heavy as Freeflow default.
- Obra review skills: feedback is evidence, not authority.
- Orchestra `design-docs`: useful prior art, but too much taxonomy and ceremony.
- Orchestra `spec-review`: useful review lenses; reject default multi-judge YAML loop.
- Anthropic `skill-creator`: use baseline versus with-skill evals.

## Next Implementation Shape

Recommended next order:

1. Draft `write-spec/SKILL.md`.
2. Add focused eval prompts for cold call, rich-context synthesis, and source-of-truth conflict.
3. Draft `review-artifact/SKILL.md`.
4. Add evals where clean review can pass and flawed artifact blocks.
5. Draft `write-plan/SKILL.md`.
6. Add evals for approved spec, clear-context lightweight plan, and hidden user-owned decision.

Keep skill bodies short. Use Matt-style pressure: trigger, loop, stop condition, failure prevention.

## Avoid

- Do not copy Orchestra skill files.
- Do not add templates first.
- Do not add hooks.
- Do not require review artifacts by default.
- Do not turn specs or plans into full repo inventories.
- Do not let plan-writing invent requirements absent from the spec/context.
