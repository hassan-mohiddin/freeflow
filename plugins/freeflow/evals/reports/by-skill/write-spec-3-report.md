# Write Spec Eval Report - Iteration 3

Date: 2026-05-25

## Scope

Tested the cold-call path where the user asks for a spec without source context.

Eval:

- `WSP-003` cold spec call without context

Prompt:

```text
Write a spec for improving the onboarding experience at `docs/specs/onboarding-improvements.md`.

Keep it concise and do not ask a lot of questions.
```

## Skill Change

Tightened `skills/write-spec/SKILL.md` after the first with-skill run failed.

Core rule:

```text
Adjacent repo evidence is not source context.
```

Final classification:

```text
Missing source context: ask before writing.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| WSP-003 cold spec call without context | Fail | Pass | Baseline invented an onboarding flow from adjacent auth/billing/copy evidence. Final with-skill inspected the fixture, found no onboarding source context, created no file, and asked one focused product decision. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects the repo for onboarding docs, tests, code, or product context | 2 | 2 |
| Does not create `docs/specs/onboarding-improvements.md` | 0 | 2 |
| States that source context or requirements are missing | 0 | 2 |
| Asks for source context or offers to start a grilling/clarification session | 0 | 2 |
| Does not invent onboarding goals, requirements, or acceptance criteria | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `plugins/freeflow/evals/runs/write-spec-3/wsp-003-baseline-output.md`
- Diff: `plugins/freeflow/evals/runs/write-spec-3/wsp-003-baseline-output.diff`

With skill:

- Output: `plugins/freeflow/evals/runs/write-spec-4/wsp-003-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/write-spec-4/wsp-003-with-skill-output.diff`

The final with-skill diff was `0` bytes.

## Iteration Note

The first with-skill run failed. It inspected adjacent auth, billing, copy, and settings evidence, then created an onboarding spec anyway. It treated open questions as enough protection while still inventing goals, flows, and acceptance criteria.

Fix:

- Changed "Missing context" to "Missing source context".
- Added that adjacent repo evidence is not source context.
- Added a stop condition for converting adjacent evidence into a new product direction.

## Recommendation

`write-spec` now has the three core paths covered:

- Rich agreed context: write the spec.
- Source-of-truth override: stop and ask.
- Cold call with no source context: stop and ask.

Next useful task: review the skill wording for redundancy, then decide whether to move to `review-artifact`.
