# Execute Plan Eval Report - Iteration 3

Date: 2026-06-17

## Scope

Deepened `execute-plan` for large multi-slice execution where each slice may include exploration, TDD, verification, review checkpoints, commits/handoffs, scope changes, and context-window boundaries.

Prompted by observed output-router implementation failures: non-passing review passes were treated as edit scripts, leading to autonomous review-fix-review loops instead of parent adjudication, backward routing, and diagnosis.

## Skill Changes

`execute-plan/SKILL.md` now:

- Treats the plan as instructions, not authority.
- Works one verified slice at a time.
- Adds an explicit per-slice contract: source truth, module/interface, behavior/test/benchmark, verification, review checkpoint, commit/handoff checkpoint, and stop conditions.
- Bridges to `../research/LANGUAGE.md` for module/interface/depth/seam/adapter/locality language when slices affect architecture or review findings become edge-case patch streams.
- Integrates TDD as a per-slice vertical loop: one behavior test/benchmark, minimal implementation, refactor while green, verify.
- Treats scope expansion as a backward route to research/spec/plan instead of absorbing it into implementation.
- Treats a non-passing review during execution as a phase exit: inspect, classify, and report the route before editing from that review batch.
- Hard-stops same-scope review loops at three review passes and routes to diagnosis instead of a fourth broad review.

Added:

- `skills/execute-plan/references/execution-map.md`

The map includes compact/reference execution flow, entry points, exits, slice contract, review-failure routing, and context/snapshot discipline.

## Evals Added

Added:

- `XPL-005`: non-pass review is execution phase exit.
- `XPL-006`: scope expansion routes back to plan/spec/research.

Added fixture:

- `evals/fixtures/tiny-execute-review-loop-app/`

## Results

| Eval | Final with skill | Read |
| --- | ---: | --- |
| XPL-005 non-pass review phase exit | Pass | Made no edits, classified blocking/non-blocking/question findings, and recommended a bounded fix route instead of applying findings and requesting another review. |
| XPL-006 scope expansion | Pass | Made no edits, recognized billing/webhook/email behavior as outside the settings-title plan, and asked whether to revise source truth/plan. |
| XPL-001 valid settings plan regression | Manual pass | Edited only `src/settings-page.ts` to `Settings` and reported lightweight verification. |
| XPL-004 verification failure regression | Manual pass | Edited only `src/settings-page.ts`, ran the planned check, stopped on billing-check/source-truth conflict, and asked which source should change. |

`XPL-005` first with-skill run failed before the final wording tightening: the agent classified findings but still fixed `src/billing.ts` in the same turn. The final wording now says the turn that receives a non-passing review ends with adjudication and route only.

## Evidence

Final new eval runs:

- `evals/runs/execute-plan-depth-pi-2/xpl-005-with-skill-output.md`
- `evals/runs/execute-plan-depth-pi-2/xpl-005-with-skill-output.diff`
- `evals/runs/execute-plan-depth-pi-2/xpl-006-with-skill-output.md`
- `evals/runs/execute-plan-depth-pi-2/xpl-006-with-skill-output.diff`

Regression runs:

- `evals/runs/execute-plan-depth-regression-pi-1/xpl-001-with-skill-output.md`
- `evals/runs/execute-plan-depth-regression-pi-1/xpl-001-with-skill-output.diff`
- `evals/runs/execute-plan-depth-regression-pi-1/xpl-004-with-skill-output.md`
- `evals/runs/execute-plan-depth-regression-pi-1/xpl-004-with-skill-output.diff`

Failed tightening run:

- `evals/runs/execute-plan-depth-pi-1/xpl-005-with-skill-output.md`
- `evals/runs/execute-plan-depth-pi-1/xpl-005-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools, following `docs/pi-token-efficient-skill-evals.md` guidance.
- Deterministic grading with `grade-fixture-eval.sh` where objective checks exist.

## Verification

Commands:

```sh
evals/scripts/grade-fixture-eval.sh XPL-005 --output evals/runs/execute-plan-depth-pi-2/xpl-005-with-skill-output.md
evals/scripts/grade-fixture-eval.sh XPL-006 --output evals/runs/execute-plan-depth-pi-2/xpl-006-with-skill-output.md
evals/scripts/grade-fixture-eval.sh XPL-001 --output evals/runs/execute-plan-depth-regression-pi-1/xpl-001-with-skill-output.md
evals/scripts/grade-fixture-eval.sh XPL-004 --output evals/runs/execute-plan-depth-regression-pi-1/xpl-004-with-skill-output.md
```
