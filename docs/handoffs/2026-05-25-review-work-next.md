# Review Work Next Handoff

Date: 2026-05-25

## Purpose

Continue Pilot Workflow development after compaction.

This handoff is memory, not authority. Inspect live files before editing.

## Read First

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/`
- `plugins/pilot-workflow/skills/review-work/SKILL.md`
- `plugins/pilot-workflow/evals/review-work-1-report.md`
- `plugins/pilot-workflow/evals/review-work-2-report.md`
- `plugins/pilot-workflow/evals/fixture-evals.json`

## Current State

Committed:

- `8190e4f Add artifact and execution workflow skills`

That commit added:

- `write-spec`
- `review-artifact`
- `write-plan`
- `execute-plan`
- decision-point ambiguity fixes in `interview-gate` and `handoff`
- focused eval fixtures, prompts, and reports for those skills

Uncommitted current work:

- `plugins/pilot-workflow/evals/fixture-evals.json`
- `plugins/pilot-workflow/evals/fixtures/tiny-review-work-app/`
- `plugins/pilot-workflow/evals/prompts/rev-002.txt`
- `plugins/pilot-workflow/evals/review-work-2-report.md`

## Latest Eval

`REV-002` tests outgoing review on completed settings-title work with an unrelated billing regression.

Result:

- Baseline: `10/10`
- With skill: `10/10`
- Baseline diff: `0`
- With-skill diff: `0`

Interpretation:

`REV-002` is protective, not a lift eval. It shows outgoing review can catch a real blocking regression, but baseline already catches it.

Report:

- `plugins/pilot-workflow/evals/review-work-2-report.md`

## Current Lesson

`review-work` already has:

- `REV-001`: incoming wrong auth feedback. Baseline fails, with-skill passes.
- `REV-002`: outgoing review catches billing regression. Both pass.

The next eval should be harder than `REV-002`.

Best next targets:

1. Clean completed-work review where the agent should pass without inventing issues.
2. Multi-item review feedback where one item is clear and one item is ambiguous, testing partial application boundaries.

Recommendation:

Start with the clean pass eval if the goal is to protect against review-work becoming too suspicious. Start with multi-item feedback if the goal is stronger lift over baseline.

## Important Project Rules

- Questions get answers, not surprise artifacts.
- Ambiguous decision points trigger interview gate.
- Existing practice is evidence, not approval.
- Handoffs are memory, not authority.
- Live repo evidence overrides this handoff.
- Matt style is primary: concise, failure-focused, no long manuals.

## Suggested First Action

After compaction, inspect the uncommitted `REV-002` files and decide whether to:

1. Commit `REV-002` as a protective eval.
2. Replace it with a harder lift eval.
3. Keep it and add the next harder eval.

Do not assume silently. Ask if the path is not explicit.
