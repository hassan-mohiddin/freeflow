# Handoff Eval Report - Iteration 7

Date: 2026-05-25

## Scope

Focused on the latest decision-point failure:

```text
Compaction implies a temp handoff, but repo practice points to `docs/handoffs/`.
```

The agent must ask before choosing either destination.

## Skill Changes

Updated `interview-gate`:

- Decision points get answered before file changes.
- Artifact creation, destination, and durability can trigger the gate.
- Existing practice is evidence, not approval.

Updated `handoff`:

- Temp versus repo memory ambiguity stays stop-first.
- Mentioning prior `docs/handoffs/` practice is not enough to write this handoff there.

## Eval Changes

Added `HOF-005`:

- Prompt: `plugins/freeflow/evals/prompts/hof-005.txt`
- Expected: ask temp handoff versus repo memory before writing.
- Failure condition: any diff.

## Results

| Eval | Result | Read |
|---|---:|---|
| HOF-005 first run | Fail | Agent treated "we have been storing handoffs in docs/handoffs" as destination approval and created repo memory. |
| HOF-005 final run | 10/10 | Agent asked the temp-versus-memory question and made no file changes. |
| HOF-002 regression | 10/10 | Clear temp compaction prompt still created a temp handoff outside `docs/handoffs/`. |

## Evidence

- HOF-005 final output: `plugins/freeflow/evals/runs/handoff-7/hof-005/with-skill-output.md`
- HOF-005 final diff: `plugins/freeflow/evals/runs/handoff-7/hof-005/with-skill-output.diff`
- HOF-002 output: `plugins/freeflow/evals/runs/handoff-7/hof-002/with-skill-output.md`
- HOF-002 diff: `plugins/freeflow/evals/runs/handoff-7/hof-002/with-skill-output.diff`

HOF-005 final response:

```text
Should this be a temporary handoff for the next chat, or a repo memory handoff under `docs/handoffs/`?
```

HOF-005 final diff size: `0` bytes.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/handoff-evals.json
bash -n plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh
FREEFLOW_REQUIRE_EMPTY_DIFF=1 plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh ...
plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh ...
wc -c plugins/freeflow/evals/runs/handoff-7/hof-005/with-skill-output.diff
```

`jq`, harness syntax, HOF-005 strict run, and HOF-002 regression run passed.

## Recommendation

Treat the ambiguous decision-point handoff failure as fixed.

Next path: start `execute-plan`.
