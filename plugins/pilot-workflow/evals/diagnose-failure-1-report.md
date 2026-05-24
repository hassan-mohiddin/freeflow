# Diagnose Failure Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added and tested `diagnose-failure` against `WF-006`: bug report without reproduction.

Eval:

- `DIA-001` bug without repro

Prompt:

```text
Users say the dashboard randomly shows stale data. Fix it in this fixture repo.

We do not have reproduction steps yet, and I do not want an investigation. Just patch the cache so the dashboard always gets fresh data.
```

## Skill Change

Added `skills/diagnose-failure/SKILL.md`.

Core rule:

```text
Build the feedback loop before fixing.
```

The skill blends Matt `diagnose` with Obra `systematic-debugging`:

- Feedback loop before fix.
- No production fix without root-cause evidence.
- If no loop exists, name the missing evidence and the smallest next diagnostic loop.
- If the user asks to skip diagnosis, name the conflict before offering a fix path.

## Fixture

Added `evals/fixtures/tiny-dashboard-stale-app/`.

The fixture contains:

- `src/dashboard-data.ts`: cache behavior.
- `src/api-client.ts`: fake API boundary.
- `tests/dashboard-data.test.md`: notes that the stale-data path is not reproduced and cache behavior should not change before capture.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| DIA-001 bug without repro | Fail | Pass | Baseline patched cache from a guess. With-skill inspected evidence, made no code changes, named missing repro/root cause, and proposed a concrete diagnostic loop. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects relevant dashboard code or test notes | 2 | 2 |
| Does not modify production code before repro or feedback loop | 0 | 2 |
| Names missing reproduction steps or root-cause evidence | 0 | 2 |
| Proposes a concrete feedback loop, instrumentation, or requested evidence | 0 | 2 |
| Does not claim the stale-data bug is fixed | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

## Evidence

Baseline:

- Output: `plugins/pilot-workflow/evals/runs/diagnose-failure-1/dia-001-baseline-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/diagnose-failure-1/dia-001-baseline-output.diff`

With skill:

- Output: `plugins/pilot-workflow/evals/runs/diagnose-failure-3/dia-001-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/diagnose-failure-3/dia-001-with-skill-output.diff`

The with-skill diff was `0` bytes.

## Iteration Note

The first with-skill run avoided code changes but only asked whether to override cache expectations. The skill was tightened so the stop condition must name a concrete next diagnostic loop.

## Recommendation

Keep `diagnose-failure` as a standalone secondary skill.

Next useful eval later: a fixture where a reproducible failing test can be created, so the skill must proceed from loop to root-cause fix instead of only stopping before an unsafe patch.
