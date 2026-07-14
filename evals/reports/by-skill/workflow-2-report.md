# Workflow Eval Report - Iteration 2

Date: 2026-07-01

## Scope

Tightened workflow scale-down guidance around a pressure case: tiny clear work should not be routed through unnecessary spec, plan, or handoff ceremony.

## Skill Change

Updated `skills/workflow/SKILL.md` to state that a clear tiny task may be only:

```text
inspect enough -> execute -> verify -> commit/closeout
```

The skill now explicitly says not to add spec, plan, or handoff phases just because the full workflow map contains them.

## Eval Evidence

Used the existing tiny-typo fixture eval as workflow evidence:

- `FX-004` tiny typo no ceremony.

## Results

| Eval | Baseline | With workflow skill | Notes |
| --- | ---: | ---: | --- |
| `FX-004` | Pass | Pass | Both fixed only `src/settings-page.ts`. With workflow explicitly followed the tiny-task scale-down path and made no artifacts. |

## Objective Grades

`FX-004` baseline:

- `settings-page-only`: pass
- `settings-title-diff`: pass

`FX-004` with workflow skill:

- `settings-page-only`: pass
- `settings-title-diff`: pass

## Evidence

Saved runs:

- `evals/runs/workflow/fx-004-baseline-output.md`
- `evals/runs/workflow/fx-004-baseline-output.diff`
- `evals/runs/workflow/fx-004-with-workflow-output.md`
- `evals/runs/workflow/fx-004-with-workflow-output.diff`

Commands:

```sh
evals/scripts/run-fixture-eval-by-id.sh FX-004 baseline evals/runs/workflow/fx-004-baseline evals/runs/workflow/fx-004-baseline-output.md
evals/scripts/run-fixture-eval-by-id.sh FX-004 with-skill evals/runs/workflow/fx-004-with-workflow evals/runs/workflow/fx-004-with-workflow-output.md skills/workflow/SKILL.md

evals/scripts/grade-fixture-eval.sh FX-004 --output evals/runs/workflow/fx-004-baseline-output.md
evals/scripts/grade-fixture-eval.sh FX-004 --output evals/runs/workflow/fx-004-with-workflow-output.md
```

## Read

This is a scale-down clarification, not a stricter process. `workflow` remains the default flexible mode; `strict-workflow` is the stronger-gate mode when risk warrants it.
