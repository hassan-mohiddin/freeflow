# Output Router Transform Eval - Iteration 1

Date: 2026-06-28

## Scope

Targeted deterministic eval for transformed-output routing. It compares direct/manual long-log inspection against explicit Freeflow transform operations.

## Command

```sh
npm run build && node evals/scripts/run-output-router-transform-eval.js
```

## Summary

- Fixtures: 1
- Objective gates passed: 4/4

## Results

| fixture | direct/raw baseline | Freeflow routed behavior | status | gates |
| --- | --- | --- | --- | --- |
| long-log-manual-inspection-vs-freeflow-transform | 7729 raw log bytes for manual inspection | 193 filtered evidence bytes; countMatches=2; exact transformed recovery | pass | manualBaselineWouldReadWholeLog ✓; filteredTargetFacts ✓; countMatches ✓; lineage ✓ |

## Result

All targeted transform gates passed for these deterministic fixtures.
