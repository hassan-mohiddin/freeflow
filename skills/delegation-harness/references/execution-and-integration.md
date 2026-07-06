# Execution And Integration

Execution should be plan-guided and autonomous when the plan is sufficient. Autonomy is desired, not guaranteed.

## Execution Map

Execution-parent turns the approved plan into a live execution map:

```text
work packages
dependencies
parallel/sequential groups
expected write sets
assigned checkout/worktree
allowed checks
review checkpoints
verification checkpoints
commit checkpoints
integration order
stop conditions
```

A work package may contain one slice or several related slices.

## Worker Ownership

Decide worker delegation from the whole execution shape, not from the next slice alone.

For broad or multi-slice implementation, execution-parent coordinates and a worker owns the implementation stream. Do not let the parent become the main implementer because each individual slice looks small.

One worker may own multiple sequential slices when context remains useful and the write scope stays coherent. Spawn a new worker only for a real context boundary, parallelism, different write scope or capability, stale context, or isolation need.

Execution-parent inline edits are for coordination, reporting, or mechanical integration. If the parent edits product/runtime files, it must state why the edit is not worker-owned.

## Parallelism

Default to sequential unless independence is explicit.

Parallel work requires:

- dependency satisfied;
- no unresolved shared API/schema/product decision;
- safe expected write sets;
- one writer per checkout;
- checks per package;
- integration path.

Use worktrees for parallel writers.

## Review And Fix Flow

```text
worker completes package
-> verifier runs planned checks
-> reviewer reviews artifact/diff/work
-> execution-parent adjudicates findings
-> worker fixes accepted implementation findings
-> integrator fixes integration findings
-> verifier/reviewer re-check as needed
```

Reviewer findings are evidence, not commands. Reviewer does not fix.

Repeated review/verification failure routes backward to diagnose, discover, spec, or plan.

## Integration

Parallel implementation can run concurrently. Integration is sequential by default:

```text
merge/apply package A -> verify
merge/apply package B -> verify
```

Integrator escalates behavior conflicts, source-truth conflicts, API/schema mismatch, and design changes.

## Commit Checkpoints

Execution-parent owns planned intermediate commit checkpoints.

A checkpoint commit is allowed when it was planned, the package is reviewed/verified as required, the diff matches intended scope, and no sensitive/generated/user-owned surprise files are included.

Final closeout commit and push remain orchestrator/user-owned.

## Stop Conditions

Stop and route back for product behavior, scope, public API, compatibility, security, privacy, billing, data loss, source-truth conflicts, spec/plan contradiction, repeated failure, or integration conflicts that change design/behavior.
