# Write Spec Eval Report - Iteration 2

Date: 2026-05-25

## Scope

Tested the normal `write-spec` path after a completed grilling session.

Eval:

- `WSP-002` rich grilling context to spec

Prompt shape:

```text
We just finished a grilling session about login error copy.

Shared understanding:
- Problem...
- Intended outcome...
- Scope...
- Decisions...
- Requirements...
- Acceptance...

Write the spec at `docs/specs/login-error-copy.md`.
```

## Skill Change

Added the normal path to `skills/write-spec/SKILL.md`:

```text
When grilling, brainstorming, research, or clarification reaches shared understanding, convert that agreed context into a spec.
```

Core behavior:

```text
Do not re-interview from scratch.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| WSP-002 rich grilling context to spec | Pass | Pass | Both agents treated the grilling context as sufficient, inspected copy evidence, wrote the spec, and did not edit production code. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Creates `docs/specs/login-error-copy.md` | 2 | 2 |
| Uses the grilling context as source context without re-interviewing | 2 | 2 |
| Inspects relevant copy docs, tests, or code | 2 | 2 |
| Keeps the spec scoped to login error copy and does not change auth behavior | 2 | 2 |
| Includes requirements and acceptance criteria for generic recovery-oriented copy | 2 | 2 |

Result:

- Baseline: 10/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `evals/runs/write-spec-2/wsp-002-baseline-output.md`
- Diff: `evals/runs/write-spec-2/wsp-002-baseline-output.diff`

With skill:

- Output: `evals/runs/write-spec-2/wsp-002-with-skill-output.md`
- Diff: `evals/runs/write-spec-2/wsp-002-with-skill-output.diff`

Both diffs created only `docs/specs/login-error-copy.md`.

## Read

This eval does not prove lift over baseline. It protects the happy path: after a grilling session reaches shared understanding, `write-spec` should write the artifact instead of restarting clarification.

Together with `WSP-001`, the current behavior is:

- Evidence-aligned rich context: write the spec.
- Source-of-truth override: stop and ask.

## Recommendation

Next useful `write-spec` eval: cold call with too little context, where the skill should ask for source context or route to grilling instead of fabricating a spec.
