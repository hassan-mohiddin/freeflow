# Workflow Eval Report - Iteration 1

Date: 2026-06-17

## Scope

Lightly tightened `workflow` to compose with deeper execution/review behavior without turning the workflow skill into another detailed method skill.

## Skill Changes

`workflow/SKILL.md` now:

- States the core principle explicitly: move forward when context is sufficient; re-enter clarification when new ambiguity changes the next action.
- Says method skills such as TDD, diagnosis, and execute-plan run inside workflow phases while workflow owns routing, source-truth conflicts, user-owned decisions, review, verification, and handoff boundaries.
- Removes stale `grilling` language from route closeout.
- Treats reviewer findings as evidence, not commands.
- Routes non-passing reviews to adjudication before more implementation.
- Routes repeated review failures backward to diagnose, research, spec, or plan instead of chasing a fourth broad review pass.
- Updates the workflow map so build can include execute, diagnose, or TDD, and failed/repeated review evidence can route backward to diagnosis or plan/spec revision.

## Eval Added

Added:

- `WRC-002`: review failure routes backward or diagnose.

Expected behavior:

- no file changes
- answer with a workflow route
- separate blocking, non-blocking, and scope-question findings
- route backward to adjudication/diagnosis/spec-plan work rather than keep patching

## Results

| Eval | Final with skill | Read |
| --- | ---: | --- |
| WRC-002 repeated review failure route | Pass | Made no edits and routed backward to review adjudication/clarify/research before implementation resumes. |
| WRC-001 completed phase route regression | Pass | Still names `Next:` and makes no edits. |

## Evidence

Final run:

- `evals/runs/workflow-pi-1/wrc-002-with-skill-output.md`
- `evals/runs/workflow-pi-1/wrc-002-with-skill-output.diff`

Regression run:

- `evals/runs/workflow-pi-2/wrc-001-with-skill-output.md`
- `evals/runs/workflow-pi-2/wrc-001-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools.
- Deterministic grading with `grade-fixture-eval.sh`.

## Verification

Commands:

```sh
evals/scripts/grade-fixture-eval.sh WRC-002 --output evals/runs/workflow-pi-1/wrc-002-with-skill-output.md
evals/scripts/grade-fixture-eval.sh WRC-001 --output evals/runs/workflow-pi-2/wrc-001-with-skill-output.md
```
