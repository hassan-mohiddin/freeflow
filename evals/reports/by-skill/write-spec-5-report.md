# Write Spec Eval Report - Iteration 5

Date: 2026-07-01

## Scope

Added a pre-spec readiness gate after a preserved failure where the agent agreed to write a durable spec before unresolved design topics had been grilled.

New eval:

- `WSP-009` pre-spec readiness gate after brainstorming.

## Failure Preserved

The user asked whether to write a spec after a long design discussion. Several path-changing topics were still open, including role/context loading, tool enforcement, result parsing/failure behavior, output-router boundaries, and worktree integration.

Expected behavior: answer the readiness question, classify the spec as not ready, name the unresolved topics, and recommend a short discovery/grilling pass before writing.

## Eval Artifacts

Added:

- `evals/prompts/wsp-009.txt`
- `WSP-009` in `evals/registries/fixture-evals.json`
- `WSP-009` in `evals/registries/skill-evidence.json`

## Skill Change

Updated `skills/write-spec/SKILL.md` to add a pre-spec readiness gate:

- Green: stable enough to write when asked.
- Yellow: write with explicit assumptions/open questions when ambiguity will not change the artifact.
- Red: unresolved path-changing topics remain; do not write or say yes, and recommend a brief grilling/discovery pass.

## Results

| Eval | Baseline | With skill | Notes |
| --- | ---: | ---: | --- |
| `WSP-009` | Fail | Pass | Baseline named some open topics but did not use the explicit Red readiness gate. With-skill classified readiness as Red, made no edits, named open topics, and recommended discovery before writing. |

## Objective Grades

Baseline:

- `no-file-changes`: pass
- `readiness-red`: fail
- `names-open-topics`: pass

With skill:

- `no-file-changes`: pass
- `readiness-red`: pass
- `names-open-topics`: pass

## Evidence

Saved runs:

- `evals/runs/spec-readiness/wsp-009-baseline-output.md`
- `evals/runs/spec-readiness/wsp-009-baseline-output.diff`
- `evals/runs/spec-readiness/wsp-009-with-skill-output.md`
- `evals/runs/spec-readiness/wsp-009-with-skill-output.diff`

Commands:

```sh
evals/scripts/run-fixture-eval-by-id.sh WSP-009 baseline evals/runs/spec-readiness/wsp-009-baseline evals/runs/spec-readiness/wsp-009-baseline-output.md

evals/scripts/run-fixture-eval-by-id.sh WSP-009 with-skill evals/runs/spec-readiness/wsp-009-with-skill evals/runs/spec-readiness/wsp-009-with-skill-output.md skills/write-spec/SKILL.md

evals/scripts/grade-fixture-eval.sh WSP-009 --output evals/runs/spec-readiness/wsp-009-baseline-output.md

evals/scripts/grade-fixture-eval.sh WSP-009 --output evals/runs/spec-readiness/wsp-009-with-skill-output.md
```

## Read

The gate belongs in `write-spec` because the failure happens at the moment a durable artifact is about to freeze decisions. `discover` can navigate earlier, but `write-spec` must still check readiness before writing or saying yes.
