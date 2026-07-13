# Execution And Integration

Execution should be plan-guided and autonomous when the plan is sufficient. Parent and child name context topology, not competence or continuous supervision.

## Execution Map

The execution-parent turns the approved, artifact-reviewed plan into a live map:

```text
work packages and dependencies
parallel / sequential groups
expected write sets and assigned checkouts
allowed direct checks
standing final-review boundary
any separately authorized extra-review boundary
commit checkpoints and integration order
stop conditions
```

A package may contain one slice or several related slices.

## Worker Ownership

For broad or multi-slice implementation, a worker owns the implementation stream. It implements, self-verifies, self-reviews once, corrects local reversible mistakes, and learns across related slices. It may read review/verify skills to enhance either method without creating independence.

Do not replace the worker or summon a reviewer after each slice. Spawn a new worker only for a real context, capability, write-scope, isolation, or parallelism boundary.

Execution-parent edits are limited to coordination, reporting, or mechanical integration. If it edits product/runtime files, it states why the work is not worker-owned.

## Parallelism

Default to sequential unless independence is explicit. Parallel work requires satisfied dependencies, no unresolved shared contract, safe write sets, one writer per checkout, package checks, and a defined integration path. Use worktrees for parallel writers.

## Primary Feedback Flow

```text
worker implements package
-> self-verifies with direct evidence
-> self-reviews its own work once
-> correct local reversible mistakes
-> report evidence and route-changing gaps
-> execution-parent integrates sequentially
-> verify integrated result
```

Repeated or unexplained failure routes to diagnosis before redesign. A reviewer is not the worker's normal feedback loop.

## Independent Assurance Flow

The consequential spec/plan package receives its standing artifact review before execution. After all packages are integrated:

```text
sequential final self-check: self-verification -> if supported, self-review
-> freeze one implementation state
-> dispatch fresh verifier + different fresh reviewer in parallel
-> collect both results
-> complete on verifier Pass + resolved review with no code change, otherwise route backward
```

Implementer, reviewer, and verifier are separate contexts. Review is judgment; verification is factual claim evidence. Standing artifact/final roles and approved plan-selected phase-exit reviewers need no reconfirmation. Any other reviewer or independent verifier requires scoped user authorization.

Verifier output is factual evidence; reviewer findings are judgment. Neither sees the other's output before reporting. Any implementation change stales both results; self-check the fix and ask before redispatching either role. Preserve an unaffected result only when no source change invalidates its boundary.

## Integration

Parallel implementation may run concurrently. Integration is sequential by default:

```text
merge/apply package A -> verify
merge/apply package B -> verify
```

Integrator escalates behavior conflicts, source conflicts, API/schema mismatch, and path-changing design evidence.

## Commit Checkpoints

Execution-parent owns planned intermediate commits. A commit is allowed when the package is coherently verified, the diff matches scope, required formal review has occurred at its actual boundary, and no sensitive/generated/user-owned surprise files are included.

A commit does not itself trigger review. Final closeout commit and push remain orchestrator/user-owned.

## Stop Conditions

Stop or route backward for product behavior, scope, public API, compatibility, security, privacy, billing, data loss, source conflicts, spec/plan contradiction, repeated unexplained failure, or integration conflicts that change accepted behavior.
