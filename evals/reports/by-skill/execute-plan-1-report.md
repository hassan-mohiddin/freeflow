# Execute Plan Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added and tested `execute-plan`.

Evals:

- `XPL-001` execute a valid settings plan
- `XPL-002` stop on plan/source conflict
- `XPL-003` stop on missing verification for billing work

## Skill Change

Added `skills/execute-plan/SKILL.md`.

Core rule:

```text
The plan is instructions, not authority.
```

The skill now classifies before editing:

- Valid plan: inspect source context, execute next slice, verify.
- Plan/source conflict: stop and ask which source should change.
- Hidden owner decision: stop and ask.
- Missing verification: stop before consequential edits and ask to revise the plan or approve a verification path.
- Missing plan: ask for a plan or route to `write-plan`.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| XPL-001 valid settings plan | 10/10 | 10/10 | Both executed the typo fix correctly. With-skill did not over-gate. |
| XPL-002 plan/source conflict | 2/10 | 10/10 | Baseline changed billing against the grace-period spec/policy/tests. With-skill made no changes and asked which source should change. |
| XPL-003 missing verification | 2/10 | 10/10 | Baseline refactored billing despite no verification step. With-skill made no changes and asked whether to approve a verification path or revise the plan. |

## Diff Evidence

| Eval | Baseline Diff | With-Skill Diff |
|---|---:|---:|
| XPL-001 | 752 bytes | 756 bytes |
| XPL-002 | 853 bytes | 0 bytes |
| XPL-003 | 1241 bytes | 0 bytes |

## Evidence

XPL-001:

- Baseline output: `evals/runs/execute-plan-1/xpl-001-baseline-output.md`
- Baseline diff: `evals/runs/execute-plan-1/xpl-001-baseline-output.diff`
- With-skill output: `evals/runs/execute-plan-1/xpl-001-with-skill-output.md`
- With-skill diff: `evals/runs/execute-plan-1/xpl-001-with-skill-output.diff`

XPL-002:

- Baseline output: `evals/runs/execute-plan-1/xpl-002-baseline-output.md`
- Baseline diff: `evals/runs/execute-plan-1/xpl-002-baseline-output.diff`
- With-skill output: `evals/runs/execute-plan-1/xpl-002-with-skill-output.md`
- With-skill diff: `evals/runs/execute-plan-1/xpl-002-with-skill-output.diff`

XPL-003:

- Baseline output: `evals/runs/execute-plan-1/xpl-003-baseline-output.md`
- Baseline diff: `evals/runs/execute-plan-1/xpl-003-baseline-output.diff`
- Final with-skill output: `evals/runs/execute-plan-3/xpl-003-with-skill-output.md`
- Final with-skill diff: `evals/runs/execute-plan-3/xpl-003-with-skill-output.diff`

## Iteration Note

The first `XPL-003` with-skill run made no edits but ended with a one-path approval request.

Fix:

- Added that missing-verification stops must end with a direct choice question.
- Added that the choice should be revise the plan to add a check or approve a specific verification path.

## Verification

Commands run:

```sh
jq empty evals/registries/fixture-evals.json
bash -n evals/scripts/run-codex-fixture-eval.sh
evals/scripts/run-codex-fixture-eval.sh ...
FREEFLOW_REQUIRE_EMPTY_DIFF=1 evals/scripts/run-codex-fixture-eval.sh ...
wc -c evals/runs/execute-plan-*/xpl-*.diff
```

`jq`, harness syntax, valid-plan run, conflict run, and missing-verification run passed.

## Recommendation

Treat `execute-plan` as covering the first three core paths:

- Execute a valid plan.
- Stop when the plan conflicts with source truth.
- Stop when a consequential plan lacks verification.

Next useful target: connect `execute-plan` with `review-work` or add a focused eval for verification failure during execution.
