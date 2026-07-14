# Diagnose Failure Eval Report - Iteration 2

Date: 2026-05-26

## Scope

Batch C: diagnosis depth.

Changed `skills/diagnose-failure/` to cover:

- vague bug reports without a repro
- flaky failures that invite sleeps/retries
- performance regressions that invite guessed optimization
- stale/cache reports where allowed behavior is mistaken for a repro

## Skill Changes

Restructured `skills/diagnose-failure/SKILL.md` for progressive disclosure:

- `Route First`
- `Hard Stops`
- `Load When Needed`
- `Feedback Loop`
- `Diagnose`
- `Fix`
- `Completion`

Updated the trigger description to:

```yaml
description: Use when asked to investigate or fix a bug, failed test, flaky failure, regression, performance problem, unexpected behavior, or anything described as broken.
```

Added references:

- `skills/diagnose-failure/references/feedback-loop-catalog.md`
- `skills/diagnose-failure/references/flaky-and-performance.md`

Notable rules added:

- Performance benchmarks must represent the reported slow path, compare old/new behavior, or validate profiler/query-plan evidence.
- Allowed behavior is not a repro.
- For stale/cache reports, a cached read is not root-cause evidence when docs say caching is allowed.
- A possible race inferred from code is still only a hypothesis until logs, steps, traces, or an existing expectation connect it to the user's failure.

## Eval Additions

Added:

- `DIA-002` flaky session timeout failure
- `DIA-003` performance regression measurement-before-fix

Added fixtures:

- `evals/fixtures/tiny-flaky-session-app/`
- `evals/fixtures/tiny-report-performance-app/`

Tightened the existing dashboard stale fixture note to make the allowed caching behavior explicit:

- a second `getDashboardData` call for the same user without `clearDashboardCache` is expected to return cached data
- cache changes require a captured stale path after a documented invalidation or refresh boundary

## Results

| Eval | Before Skill Update | Final With Skill | Notes |
|---|---:|---:|---|
| DIA-001 bug without repro | Pass in iteration 1, later regressed under cache pressure | Pass | Final run made no edits and asked for a concrete refresh/invalidation loop. |
| DIA-002 flaky failure | Pass | Pass | No sleep/retry; asked for exact CI/spec loop with seed/timing/trace. |
| DIA-003 performance regression | Fail | Pass | Initial run invented a same-array microbenchmark and memoized. Final run refused memoization without representative measurement. |
| CMD-011 diagnose command | Fail during this iteration | Pass | Initial runs patched cache or invented an invalidation race. Final run made no edits and named the missing boundary evidence. |

Final passing runs:

- `evals/runs/diagnose-failure-8/dia-001-with-skill-output.md`
- `evals/runs/diagnose-failure-6/dia-002-with-skill-output.md`
- `evals/runs/diagnose-failure-6/dia-003-with-skill-output.md`
- `evals/runs/diagnose-failure-9/cmd-011-with-skill-output.md`

All final diffs were empty.

## Verification

Commands:

```sh
jq empty evals/registries/fixture-evals.json
git diff --check
wc -c evals/runs/diagnose-failure-6/dia-002-with-skill-output.diff \
  evals/runs/diagnose-failure-6/dia-003-with-skill-output.diff \
  evals/runs/diagnose-failure-8/dia-001-with-skill-output.diff \
  evals/runs/diagnose-failure-9/cmd-011-with-skill-output.diff
```

Nested Codex fixture evals required escalated execution, consistent with prior eval runs.
