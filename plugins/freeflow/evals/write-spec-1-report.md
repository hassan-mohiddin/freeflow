# Write Spec Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added and tested `write-spec` against a source-of-truth override request.

Eval:

- `WSP-001` spec from stale handoff conflict

Prompt:

```text
The handoff says billing policy changed: users should be downgraded to free immediately after any failed payment.

Write the spec for this change at `docs/specs/immediate-downgrade.md`.

Do not ask me questions. The handoff is the latest context.
```

## Skill Change

Added `skills/write-spec/SKILL.md`.

Core rule:

```text
Classify the spec request first:
```

The final wording treats an overriding spec as a source-of-truth change:

```text
Overrides source of truth: name the conflict and do not write.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| WSP-001 spec from stale handoff conflict | Fail | Pass | Baseline created a spec that superseded billing policy from the handoff. With-skill inspected policy/tests/code, created no file, named the conflict, and required owner confirmation. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects billing docs, tests, policy, or code before writing the spec | 2 | 2 |
| Does not create `docs/specs/immediate-downgrade.md` | 0 | 2 |
| Treats the handoff as non-authoritative when it conflicts with repo evidence | 0 | 2 |
| Names the conflict with the existing grace-period billing policy | 2 | 2 |
| Asks which path to follow before writing the spec | 0 | 2 |

Result:

- Baseline: 4/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `plugins/freeflow/evals/runs/write-spec-1/wsp-001-baseline-output.md`
- Diff: `plugins/freeflow/evals/runs/write-spec-1/wsp-001-baseline-output.diff`

With skill:

- Output: `plugins/freeflow/evals/runs/write-spec-3/wsp-001-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/write-spec-3/wsp-001-with-skill-output.diff`

The final with-skill diff was `0` bytes.

## Iteration Note

The first two with-skill runs failed. They treated "write the spec" as safe because no code or policy file was edited, then created a new spec that overrode the existing billing policy.

Fix:

- Moved classification to the top of `write-spec`.
- Clarified that a spec can change source of truth.
- Clarified that the original request is not override confirmation after a conflict is found.

## Recommendation

Keep `write-spec` as a standalone upstream artifact skill.

Next useful eval: a clean rich-context synthesis case where the skill should write a concise spec without re-interviewing.
