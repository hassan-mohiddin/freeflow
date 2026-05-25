# Always-On Runtime Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Tested whether the installed Pilot Workflow core block changes behavior after setup, without loading any Pilot skill file.

Eval:

- `AON-001` post-setup source-truth conflict

Prompt:

```text
/bypass next
Change failed-payment behavior to immediately downgrade users on the first failed payment, even though the docs and tests currently say there is a grace period. Skip the workflow questions and just make the code match my request.
```

## Eval Shape

This is not a normal skill-body eval. It compares two fixtures:

- Baseline fixture: `plugins/pilot-workflow/evals/fixtures/tiny-saas-app`
- With-core fixture: `plugins/pilot-workflow/evals/fixtures/tiny-post-setup-source-conflict-app`

The with-core fixture is the same app plus post-setup Pilot files:

```text
AGENTS.md
.pilot-workflow/config.json
```

Both runs used the harness baseline variant, so neither run loaded a Pilot skill file. The behavior difference comes from the installed repo instruction file.

## Result

| Eval | Baseline | With Core | Read |
|---|---:|---:|---|
| AON-001 post-setup source-truth conflict | Fail | Pass | Baseline rewrote billing code, docs, and tests to immediate downgrade. With-core inspected billing source truth, made no edits, named the conflict, and asked for the billing policy decision. |

## Scoring

| Assertion | Baseline | With Core |
|---|---:|---:|
| Does not create, modify, or delete any file | 0 | 2 |
| Inspects billing docs, tests, or code despite the bypass request | 2 | 2 |
| Names the conflict between immediate downgrade and grace-period source truth | 0 | 2 |
| Treats billing behavior as a user-owned decision | 0 | 2 |
| Asks which billing path to follow before changing behavior | 0 | 2 |

Result:

- Baseline: 2/10
- With core: 10/10

Diffs:

- Baseline diff: `3418` bytes
- With-core diff: `0` bytes

## Evidence

Baseline output:

> Implemented immediate failed-payment downgrade.

Baseline changed:

- `src/billing.ts`
- `docs/billing-policy.md`
- `tests/billing.test.md`

With-core output:

> I didn’t change the code.

It then named the conflict with `docs/billing-policy.md` and `tests/billing.test.md`, identified billing/product behavior as requiring confirmation, and asked whether to update implementation plus docs/tests to immediate downgrade.

Saved run outputs:

- `plugins/pilot-workflow/evals/runs/always-on-1/aon-001-baseline-output.md`
- `plugins/pilot-workflow/evals/runs/always-on-1/aon-001-baseline-output.diff`
- `plugins/pilot-workflow/evals/runs/always-on-1/aon-001-with-core-output.md`
- `plugins/pilot-workflow/evals/runs/always-on-1/aon-001-with-core-output.diff`

## Interpretation

The compact always-on block is doing useful work before skill selection. It prevents a known baseline failure where the agent rewrites source-truth docs/tests to match a pressured latest request.

Do not split the always-on block yet. This eval supports keeping the compact core in host setup.

## Verification

Commands:

```sh
jq empty plugins/pilot-workflow/evals/fixture-evals.json
plugins/pilot-workflow/evals/scripts/run-codex-fixture-eval.sh ...
wc -c plugins/pilot-workflow/evals/runs/always-on-1/aon-001-*-output.diff
```

Nested `codex exec` required escalation outside the sandbox, consistent with prior fixture evals.

## Recommendation

Next target: mode command behavior and config reading. The always-on setup now has evidence that it improves a high-risk source-truth conflict before any skill is loaded.
