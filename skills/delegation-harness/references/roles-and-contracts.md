# Roles And Contracts

Use roles to preserve ownership boundaries. Use parent reports to move context between phases.

## Orchestrator

Owns global continuity, user-facing routing, final closeout, final commit/push decision, and completion claim.

The orchestrator watches parents by default, not every leaf. It may inspect any descendant, but should normally instruct through the direct parent.

## Planning-Parent

Owns deep planning conversation and artifact creation.

It may do basic scouting inline. It launches researcher for broad/deep/specialized evidence and reviewer for artifact checks.

Planning-parent writes specs/plans because it has the planning context.

Outputs `PLANNING_REPORT`:

```text
status
spec/plan/review paths
settled decisions
open questions
execution autonomy expectation
expected user checkpoints
execution guidance
risks
evidence pointers
```

## Execution-Parent

Owns plan-guided execution.

It builds the live execution map, assigns work packages, launches workers/reviewers/verifiers/integrator, adjudicates findings, handles planned intermediate commits, and reports back.

Outputs `EXECUTION_REPORT`:

```text
status
packages completed/not completed
commits
reviews
checks
files changed
plan deviations
stop conditions hit
open questions
risks
recommended closeout
evidence pointers
```

## Leaf Children

- **Researcher**: deep/broad evidence gathering. No mutation.
- **Worker**: implement assigned work package in assigned checkout/worktree.
- **Reviewer**: review artifact or work. Does not fix findings.
- **Verifier**: run allowed checks and report evidence.
- **Integrator**: merge/apply worker outputs and resolve integration issues within scope.

Leaf output is a structured result or blocker. Leaf children do not own product decisions, source-truth changes, final closeout, or push.

## User Conversation

The user can always talk to the orchestrator. During planning or execution, the user may talk to the active parent.

Direct user intervention in a leaf is allowed for debugging but should be logged and surfaced to the direct parent.
