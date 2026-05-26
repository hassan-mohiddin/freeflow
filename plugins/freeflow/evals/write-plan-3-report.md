# Write Plan Eval Report - Iteration 3

Date: 2026-05-26

## Scope

Updated `write-plan` for strict-workflow and delegated plan shape.

Owned paths:

- `plugins/freeflow/skills/write-plan/`
- write-plan prompts, fixtures, and fixture registry entries

No hooks, CLI commands, review workflow changes, or global artifact standards were added.

## Skill Changes

`write-plan/SKILL.md` now:

- has a trigger description that covers strict-workflow and delegated/future-agent plans
- links to `references/plan-shapes.md` for strict, high-risk, durable, or delegated plans
- calls for durable plan identity when a plan is saved for future agents or teammates
- preserves the missing-repro bug rule: do not write or save a fix plan without a repro, failing test, or feedback loop

Added:

- `write-plan/references/plan-shapes.md`

The reference keeps heavier plan-shape detail out of always-loaded text:

- durable plan identity fields
- lightweight, normal, strict, and delegated plan shapes
- strict stop conditions for owner/source ambiguity
- review checkpoints and handoff criteria for delegated work

Final main skill length: 88 lines.

## Eval Added

Added:

- `WPL-005`: strict-workflow delegated billing webhook API plan.

Expected behavior:

- inspect the approved billing webhook API spec plus relevant policy/tests/source files
- create `docs/plans/billing-webhook-api.md`
- include durable plan identity: `Doc ID`, `Date`, `Owner`, `Type: Plan`, `Status`, and `Source`
- include vertical slices with checks and review/verification checkpoints for another agent
- name stop conditions for public API/auth/payload/billing ambiguity
- avoid editing production source files

## Results

`WPL-005` baseline: fail.

- Created a useful implementation plan.
- Omitted durable plan identity and owner/status/source header.

`WPL-005` current skill before revision: fail.

- Created a useful implementation plan with source context, vertical slices, checks, and stop conditions.
- Still omitted durable plan identity and owner/status/source header.

`WPL-005` after revision: pass.

- Created `docs/plans/billing-webhook-api.md`.
- Added durable plan identity with `Doc ID`, `Date`, `Owner`, `Type: Plan`, `Status: Ready`, and `Source`.
- Used the approved spec, billing policy, test notes, and current source files.
- Included strict stop conditions for config, route, audit-log persistence, source-truth conflicts, and atomic idempotency decisions.

Regression after the final structure and description update:

- `WPL-004`: first rerun failed because the skill wrote a "Draft - blocked on feedback loop" plan.
- Tightened the bug-without-feedback-loop rule to forbid draft, blocked, or feedback-loop-only fix plans unless the user asks for a diagnostic plan.
- Final `WPL-004`: pass, created no plan file and proposed the smallest diagnostic feedback loop in chat.

## Evidence

Saved runs:

- `evals/runs/write-plan-4/wpl-005-baseline-output.md`
- `evals/runs/write-plan-4/wpl-005-with-skill-output.md`
- `evals/runs/write-plan-5/wpl-004-with-skill-output.md`
- `evals/runs/write-plan-5/wpl-005-with-skill-output.md`
- `evals/runs/write-plan-6/wpl-004-with-skill-output.md`
- `evals/runs/write-plan-6/wpl-005-with-skill-output.md`

Key diffs:

- `evals/runs/write-plan-4/wpl-005-baseline-output.diff`
- `evals/runs/write-plan-4/wpl-005-with-skill-output.diff`
- `evals/runs/write-plan-5/wpl-004-with-skill-output.diff`
- `evals/runs/write-plan-6/wpl-004-with-skill-output.diff`
- `evals/runs/write-plan-6/wpl-005-with-skill-output.diff`

`WPL-004` final diff was `0` bytes.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/fixture-evals.json
wc -l plugins/freeflow/skills/write-plan/SKILL.md plugins/freeflow/skills/write-plan/references/plan-shapes.md
git diff --check
git diff --cached --check
```

Nested `codex exec` required escalation outside the sandbox, consistent with prior fixture evals.
