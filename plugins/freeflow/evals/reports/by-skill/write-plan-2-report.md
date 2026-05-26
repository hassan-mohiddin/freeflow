# Write Plan Eval Report - Iteration 2

Date: 2026-05-25

## Scope

Tested the bug-fix planning path with no reproduction or feedback loop.

Eval:

- `WPL-004` bug plan without repro

Prompt shape:

```text
Users say the dashboard randomly shows stale data.

Write an implementation plan at `docs/plans/fix-stale-dashboard.md` to fix it.

We do not have reproduction steps yet, and I do not want an investigation. Just make the plan.
```

## Skill Change

Tightened `skills/write-plan/SKILL.md` after the first with-skill run failed.

Core added classification:

```text
Bug without feedback loop: ask for or propose the feedback loop. Do not write the fix plan.
```

Added the bug-specific stop condition:

```text
Turn a missing bug repro into guessed fix steps, TTLs, invalidation rules, concurrency rules, or instrumentation requirements.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| WPL-004 bug plan without repro | Fail | Pass | Baseline created a fix plan with TTL, force-refresh, and cache contract decisions. Final with-skill inspected the fixture, created no plan, named the missing repro/feedback loop, and proposed the smallest unblocker. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects dashboard code or test notes | 2 | 2 |
| Does not create `docs/plans/fix-stale-dashboard.md` | 0 | 2 |
| Names that reproduction steps, a failing test, or root-cause evidence are missing | 0 | 2 |
| Asks for or proposes a concrete feedback loop before writing fix steps | 0 | 2 |
| Does not invent cache invalidation requirements or claim the bug can be fixed from the current evidence | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `plugins/freeflow/evals/runs/write-plan-2/wpl-004-baseline-output.md`
- Diff: `plugins/freeflow/evals/runs/write-plan-2/wpl-004-baseline-output.diff`

First with-skill failure:

- Output: `plugins/freeflow/evals/runs/write-plan-2/wpl-004-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/write-plan-2/wpl-004-with-skill-output.diff`

Final with skill:

- Output: `plugins/freeflow/evals/runs/write-plan-3/wpl-004-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/write-plan-3/wpl-004-with-skill-output.diff`

The final with-skill diff was `0` bytes.

## Iteration Note

The first with-skill run failed. It created a plan that started with a feedback loop but still invented fix direction: TTL, `forceRefresh`, cache metadata, concurrency behavior, and instrumentation requirements.

Fix:

- Moved the bug-without-feedback-loop rule into the top classification.
- Clarified that missing-repro bug reports should be answered in chat, not saved as fix plans.
- Added a stop condition against guessed TTLs, invalidation rules, concurrency rules, and instrumentation requirements.

## Recommendation

`write-plan` now covers the four core paths:

- Approved spec: write the plan.
- Clear low-risk context: write a lightweight plan.
- Hidden owner decision: stop and ask.
- Bug without repro or feedback loop: stop and ask/propose the feedback loop.

Move next to `execute-plan`.
