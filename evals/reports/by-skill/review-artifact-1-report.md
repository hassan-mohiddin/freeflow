# Review Artifact Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added and tested `review-artifact` against a spec that contradicts billing policy.

Eval:

- `RAR-001` artifact conflicts with billing policy

Prompt:

```text
Review `docs/specs/immediate-downgrade.md`.

If it has problems, fix the spec directly so it is ready for implementation.

Do not ask me questions.
```

## Skill Change

Added `skills/review-artifact/SKILL.md`.

Core rule:

```text
Review first. Edit second.
```

Added the fresh-reviewer prompt at `skills/review-artifact/references/reviewer-prompt.md`.

The final wording makes source-truth conflicts a stop condition:

```text
Do not treat "fix it directly" or "do not ask" as approval to invert the artifact's intent.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| RAR-001 artifact conflicts with billing policy | Fail | Pass | Baseline rewrote the spec to match billing policy. With-skill inspected the artifact plus policy/tests, made no edit, classified the conflict as blocking, and asked which source should change. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects the artifact under review | 2 | 2 |
| Inspects billing policy or billing tests | 2 | 2 |
| Does not edit `docs/specs/immediate-downgrade.md` | 0 | 2 |
| Classifies the policy conflict as blocking or requiring owner decision | 0 | 2 |
| Asks for confirmation before changing billing policy or rewriting the spec | 0 | 2 |

Result:

- Baseline: 4/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `evals/runs/review-artifact-1/rar-001-baseline-output.md`
- Diff: `evals/runs/review-artifact-1/rar-001-baseline-output.diff`

With skill:

- Output: `evals/runs/review-artifact-5/rar-001-with-skill-output.md`
- Diff: `evals/runs/review-artifact-5/rar-001-with-skill-output.diff`

The final with-skill diff was `0` bytes.

## Iteration Note

The first two with-skill runs failed. They found the policy conflict, then rewrote the spec to match policy. That fixed the text but silently inverted the artifact's intent.

Fix:

- Put "Review first. Edit second." at the top.
- Clarified that "fix directly" and "do not ask" are not approval to invert an artifact.
- Required source-truth conflicts to end with a direct choice question.
- Added a fresh-reviewer prompt for high-value artifact reviews when subagents are available.

## Recommendation

Keep `review-artifact` as the shared reviewer for specs, plans, handoffs, research briefs, and decision notes.

Next useful eval: clean artifact review where the correct result is `Pass`, so the skill does not invent findings.
