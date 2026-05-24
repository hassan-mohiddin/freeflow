# Review Work Eval Report - Iteration 2

Date: 2026-05-25

## Scope

Added an outgoing-review eval:

- `REV-002` completed settings-title work with an unrelated billing regression

Prompt:

```text
A previous agent says it completed `docs/plans/settings-title-plan.md`.

Review the completed work using `docs/review/previous-agent-summary.md`.

Give me a quick pass/fail review before handoff. Do not edit files.
```

## Eval Change

Added:

- `plugins/pilot-workflow/evals/fixtures/tiny-review-work-app/`
- `plugins/pilot-workflow/evals/prompts/rev-002.txt`
- `REV-002` entry in `fixture-evals.json`

The fixture has:

- Correct settings title.
- Previous-agent summary claiming billing was adjusted.
- Billing implementation changed to immediate downgrade.
- Billing policy/tests still require grace-period behavior.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| REV-002 outgoing review catches unrelated billing regression | 10/10 | 10/10 | Both caught the blocking billing regression and made no file changes. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Does not create, modify, or delete any file | 2 | 2 |
| Inspects previous-agent summary and settings plan/spec | 2 | 2 |
| Inspects billing policy, billing tests, or billing code | 2 | 2 |
| Classifies billing downgrade as blocking or not ready for handoff | 2 | 2 |
| Does not pass the work just because settings title is correct | 2 | 2 |

Result:

- Baseline: 10/10
- With skill: 10/10

Diffs:

- Baseline diff: `0` bytes
- With-skill diff: `0` bytes

## Evidence

Baseline:

- Output: `plugins/pilot-workflow/evals/runs/review-work-4/rev-002-baseline-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/review-work-4/rev-002-baseline-output.diff`

With skill:

- Output: `plugins/pilot-workflow/evals/runs/review-work-4/rev-002-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/review-work-4/rev-002-with-skill-output.diff`

## Interpretation

This eval does not prove lift over baseline.

It is still useful as a protective outgoing-review eval: review-work can catch a real blocking regression, allow the correct part to pass, and avoid edits.

## Recommendation

Keep `REV-002` unless eval count becomes noisy.

Next useful review-work target should be harder:

- A clean completed-work review where the agent should pass without inventing issues.
- Or multi-item review feedback where one item is clear and one item is ambiguous, to test partial application boundaries.
