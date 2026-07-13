# Roles And Contracts

Use roles to preserve ownership boundaries. Parent and child describe context topology, not competence or seniority. Use parent reports to move context between phases without continuously supervising responsible workers.

## Orchestrator

Owns global continuity, user-facing routing, final closeout, final commit/push decision, and completion claim.

The orchestrator watches parents by default, not every leaf. It may inspect any descendant, but should normally instruct through the direct parent.

## Planning-Parent

Owns deep planning conversation and artifact creation.

It may do basic scouting inline and launch researchers for broad, deep, or specialized evidence. It runs the standing independent review of a consequential spec/plan package before implementation; other artifact reviews require Workflow's scoped authorization.

Planning-parent writes specs and plans because it has the planning context. It self-reviews its artifacts and may read `review-artifact` for richer lenses without creating independence.

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

It builds the live execution map, assigns work packages, launches workers or an integrator when useful, adjudicates formal findings, handles planned intermediate commits, and reports back. At final assurance it freezes one state and launches a fresh verifier plus a different fresh reviewer in parallel. Neither consumes the other's output; the parent collects both before adjudication. Extra reviewers or independent verifiers require Workflow authorization.

For broad or multi-slice implementation, it assigns a worker to the implementation stream instead of self-implementing slice by slice. It decides from the whole execution package, not from whether the next slice looks small.

Execution-parent may edit for coordination, reporting, or mechanical integration. If it edits product/runtime files, it must state why that edit is not worker-owned.

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
- **Worker**: responsible engineer for the assigned package in its checkout/worktree. It implements, self-verifies, self-reviews, may read review/verify skills for richer inline guidance, corrects local reversible mistakes, and learns across sequential slices; do not replace it per slice by default.
- **Reviewer**: strict independent second opinion at a selected consequential boundary. It does not supervise the worker continuously, own source truth, fix findings, or count as the verifier.
- **Verifier**: distinct fresh context that runs the finalized allowed checks and reports factual evidence without editing or reviewing design. The standing final verifier runs once; extra independent runs require user authorization.
- **Integrator**: merge/apply worker outputs and resolve integration issues within scope.

Leaf output is a role-native structured result, report, or blocker. Workers report changed files/checks/findings. Reviewers report blocking/non-blocking/questions without fixing. Verifiers report check evidence and unverified claims. Leaf children do not own product decisions, source-truth changes, final closeout, or push.

## User Conversation

The user can always talk to the orchestrator. During planning or execution, the user may talk to the active parent. The user is the accountable owner and collaborator: they own intent and consequential decisions, while live evidence owns factual behavior.

Agents should correct unsupported factual or technical claims with evidence rather than agree performatively. Direct user intervention in a leaf is allowed for debugging but should be logged and surfaced to the direct parent.
