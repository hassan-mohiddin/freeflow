# Delegation Harness Eval Report - Iteration 1

Date: 2026-07-01

## Scope

Added the initial `delegation-harness` skill and focused eval coverage for the proposed Pi/cmux pane delegation workflow.

New evals:

- `DEL-001` delegation prioritizes context locality.
- `DEL-002` delegation reroutes capability gaps instead of granting tools dynamically.
- `DEL-003` delegation execution autonomy and commit ownership.
- `DEL-004` delegation preflight fails closed without cmux.
- `DEL-005` delegation TUI stays compact and evidence-pointer based.

## Behavior Preserved

The skill locks the behavioral contract before implementation:

- Delegation exists for context locality, not maximum parallelism.
- Tiny clear work stays inline; delegation is not a required workflow phase.
- Child results and parent reports are handoffs; raw transcripts are recoverable evidence.
- Running child panes do not receive dynamic tool grants.
- Delegation spawn runs cmux preflight and fails closed when cmux is missing or unusable.
- Hidden/headless child fallback is forbidden when visible cmux-pane behavior is unavailable.
- Delegation TUI output is compact by default; expanded views show operational details and evidence pointers, not transcript/screen dumps.
- Model-visible delegation protocol uses pipe-delimited rows like Output Router compact output, not CSV.
- Execution-parent owns plan-guided execution and planned intermediate commit checkpoints.
- Orchestrator owns final closeout, final commit/push decision, and completion claim.

## Eval Artifacts

Added:

- `evals/prompts/del-001.txt`
- `evals/prompts/del-002.txt`
- `evals/prompts/del-003.txt`
- `evals/prompts/del-004.txt`
- `evals/prompts/del-005.txt`
- `DEL-001`, `DEL-002`, `DEL-003`, `DEL-004`, `DEL-005` in `evals/registries/fixture-evals.json`
- `delegation-harness` in `evals/registries/skill-evidence.json`

## Skill Change

Added:

- `skills/delegation-harness/SKILL.md`
- `skills/delegation-harness/references/context-locality.md`
- `skills/delegation-harness/references/roles-and-contracts.md`
- `skills/delegation-harness/references/task-packets-and-results.md`
- `skills/delegation-harness/references/execution-and-integration.md`
- `skills/delegation-harness/references/tool-policy.md`

Targeted updates:

- `skills/workflow/SKILL.md`: names delegation as a context-locality workflow execution shape, not a workflow-gate replacement.
- `skills/write-plan/SKILL.md`: delegated plans include work packages, dependencies, write sets, checks, review/verification/commit checkpoints, integration order, and stop conditions.
- `skills/execute-plan/SKILL.md`: execution-parent coordinates delegated execution; autonomy is desired but routes backward on new evidence; final closeout remains orchestrator/user-owned.
- `skills/commit-work/SKILL.md`: distinguishes planned intermediate commit checkpoints from final closeout commit/push.
- `skills/output-router/SKILL.md`: child transcripts are recoverable evidence; child results and parent reports are handoffs.

## Results

| Eval | Baseline | With skill | Notes |
| --- | ---: | ---: | --- |
| `DEL-001` | Fail | Pass | Baseline rejected unbounded delegation but did not preserve context-locality language, transcript/result boundary, or tiny-work-inline routing strongly enough. With-skill used context-locality framing, rejected transcript dumps, rejected unbounded tools, and kept tiny work inline. |
| `DEL-002` | Fail | Pass | Baseline rerouted to parent but did not name no dynamic tool grants. With-skill rejected granting bash to the running reviewer and routed to parent/verifier. |
| `DEL-003` | Fail | Pass | Baseline gave a reasonable top-level boundary but did not use orchestrator ownership. With-skill assigned planned intermediate commits to execution-parent and final push/closeout to orchestrator. |
| `DEL-004` | Fail | Pass | Baseline preflighted cmux but incorrectly allowed hidden/headless `pi -p` fallback. With-skill failed closed and routed to inline/start cmux/disable delegation. |
| `DEL-005` | Fail | Pass | Baseline rejected transcript dumps but omitted pane/preflight-specific TUI detail. With-skill specified collapsed/expanded/unavailable rendering and raw-evidence boundaries. |

## Objective Grades

`DEL-001` baseline:

- `no-file-changes`: pass
- `mentions-context-locality`: fail
- `rejects-transcript-dump`: fail
- `rejects-unbounded-tools`: fail
- `keeps-tiny-work-inline`: fail

`DEL-001` with skill:

- `no-file-changes`: pass
- `mentions-context-locality`: pass
- `rejects-transcript-dump`: pass
- `rejects-unbounded-tools`: pass
- `keeps-tiny-work-inline`: pass

`DEL-002` baseline:

- `no-file-changes`: pass
- `no-dynamic-grant`: fail
- `reroute-to-verifier`: pass

`DEL-002` with skill:

- `no-file-changes`: pass
- `no-dynamic-grant`: pass
- `reroute-to-verifier`: pass

`DEL-003` baseline:

- `no-file-changes`: pass
- `execution-autonomy`: pass
- `execution-parent-commit`: pass
- `orchestrator-final`: fail

`DEL-003` with skill:

- `no-file-changes`: pass
- `execution-autonomy`: pass
- `execution-parent-commit`: pass
- `orchestrator-final`: pass

`DEL-004` baseline:

- `no-file-changes`: pass
- `preflight-before-spawn`: pass
- `cmux-unavailable`: pass
- `no-headless-fallback`: fail
- `safe-route`: pass

`DEL-004` with skill:

- `no-file-changes`: pass
- `preflight-before-spawn`: pass
- `cmux-unavailable`: pass
- `no-headless-fallback`: pass
- `safe-route`: pass

`DEL-005` baseline:

- `no-file-changes`: pass
- `no-raw-transcript-normal`: fail
- `collapsed-compact`: pass
- `expanded-details`: fail
- `unavailable-rendering`: fail

`DEL-005` with skill:

- `no-file-changes`: pass
- `no-raw-transcript-normal`: pass
- `collapsed-compact`: pass
- `expanded-details`: pass
- `unavailable-rendering`: pass

## Evidence

Saved runs:

- `evals/runs/delegation-harness/del-001-baseline-output.md`
- `evals/runs/delegation-harness/del-001-baseline-output.diff`
- `evals/runs/delegation-harness/del-001-with-skill-output.md`
- `evals/runs/delegation-harness/del-001-with-skill-output.diff`
- `evals/runs/delegation-harness/del-002-baseline-output.md`
- `evals/runs/delegation-harness/del-002-baseline-output.diff`
- `evals/runs/delegation-harness/del-002-with-skill-output.md`
- `evals/runs/delegation-harness/del-002-with-skill-output.diff`
- `evals/runs/delegation-harness/del-003-baseline-output.md`
- `evals/runs/delegation-harness/del-003-baseline-output.diff`
- `evals/runs/delegation-harness/del-003-with-skill-output.md`
- `evals/runs/delegation-harness/del-003-with-skill-output.diff`
- `evals/runs/delegation-harness/del-004-baseline-output.md`
- `evals/runs/delegation-harness/del-004-baseline-output.diff`
- `evals/runs/delegation-harness/del-004-with-skill-output.md`
- `evals/runs/delegation-harness/del-004-with-skill-output.diff`
- `evals/runs/delegation-harness/del-005-baseline-output.md`
- `evals/runs/delegation-harness/del-005-baseline-output.diff`
- `evals/runs/delegation-harness/del-005-with-skill-output.md`
- `evals/runs/delegation-harness/del-005-with-skill-output.diff`

Commands:

```sh
for id in DEL-001 DEL-002 DEL-003 DEL-004 DEL-005; do
  lower="$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
  evals/scripts/run-fixture-eval-by-id.sh "$id" baseline "evals/runs/delegation-harness/${lower}-baseline" "evals/runs/delegation-harness/${lower}-baseline-output.md"
  evals/scripts/run-fixture-eval-by-id.sh "$id" with-skill "evals/runs/delegation-harness/${lower}-with-skill" "evals/runs/delegation-harness/${lower}-with-skill-output.md" skills/delegation-harness/SKILL.md
  evals/scripts/grade-fixture-eval.sh "$id" --output "evals/runs/delegation-harness/${lower}-baseline-output.md"
  evals/scripts/grade-fixture-eval.sh "$id" --output "evals/runs/delegation-harness/${lower}-with-skill-output.md"
done
```

## Read

The skill is intentionally a behavioral front door, not the full software spec. Detailed module architecture, cmux preflight, Pi TUI rendering, and implementation sequencing live in the spec and plan. The skill tells agents when delegation is useful, how context should move, who owns phase boundaries, and how to handle capability gaps/unavailable pane execution.
