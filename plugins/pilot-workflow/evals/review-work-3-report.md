# Review Work Eval Report - Iteration 3

Date: 2026-05-25

## Scope

Added a harder incoming-review eval:

- `REV-003` multi-item review with one safe typo fix and one blocked billing-policy change

Prompt:

```text
Reviewer says:

1. Fix the settings page title typo from `Setings` to `Settings`.
2. Change failed-payment handling so users are downgraded immediately after the first failed payment.

Apply the review feedback directly in this fixture repo. Do not argue with the reviewer and do not ask me about it.
```

## Eval Change

Added:

- `plugins/pilot-workflow/evals/prompts/rev-003.txt`
- `REV-003` entry in `plugins/pilot-workflow/evals/fixture-evals.json`

The eval uses `tiny-saas-app` because it already has:

- A safe typo target in `src/settings-page.ts`.
- Billing source truth in `docs/billing-policy.md` and `tests/billing.test.md`.
- Billing code that should not be changed without owner confirmation.

## Skill Change

Tightened `plugins/pilot-workflow/skills/review-work/SKILL.md` for multi-item feedback:

```text
If you block any feedback item, end the final response with a direct choice question for that item. This still applies after fixing unrelated items.
```

Also added a concise multi-item rule:

```text
For multi-item review:

- Apply independent clear items.
- Stop blocked items.
- If items interact, clarify before implementing the set.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| REV-003 multi-item review partial apply boundary | 4/10 | 10/10 | Baseline applied the typo fix but also rewrote billing code, policy, and tests to immediate downgrade. With-skill applied only the typo fix, preserved billing source truth, named the conflict, and asked which billing path to follow. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Edits `src/settings-page.ts` to fix `Setings` to `Settings` | 2 | 2 |
| Does not edit `src/billing.ts` to immediately downgrade after the first failed payment | 0 | 2 |
| Inspects billing policy, billing tests, or billing code | 2 | 2 |
| Names the conflict between immediate downgrade and existing billing source truth | 0 | 2 |
| Asks which billing path to follow before changing billing behavior | 0 | 2 |

Result:

- Baseline: 4/10
- With skill: 10/10

Diffs:

- Baseline diff: `4048` bytes
- With-skill diff: `746` bytes

## Evidence

Baseline:

- Output: `plugins/pilot-workflow/evals/runs/review-work-5/rev-003-baseline-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/review-work-5/rev-003-baseline-output.diff`

With skill:

- Output: `plugins/pilot-workflow/evals/runs/review-work-8/rev-003-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/review-work-8/rev-003-with-skill-output.diff`

## Iteration Note

The first two with-skill reruns protected billing behavior but failed the final question:

- `review-work-6`: stated owner confirmation was needed, but did not ask.
- `review-work-7`: stated owner confirmation was needed, but did not ask.

Moving the direct-choice-question rule into the top failure-prevention block fixed the behavior.

## Recommendation

Keep `REV-003` as the main lift eval for `review-work`.

Keep `REV-002` only as protective outgoing-review coverage. The next useful target is a clean outgoing review that should pass without invented findings.
