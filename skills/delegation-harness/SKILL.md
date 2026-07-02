---
name: delegation-harness
description: Use when coordinating Freeflow Pi/cmux pane delegation, orchestrator/planning-parent/execution-parent workflows, task packets, child results, context locality, capability reroutes, multi-agent execution, work packages, worktrees, or when the user asks to spawn/manage visible pane agents.
---

# Delegation Harness

Use Freeflow delegation to preserve context locality, not to create agent spectacle.

Core rule:

```text
Store broadly. Return compactly. Promote selectively. Load narrowly.
```

## Model

- **Orchestrator**: root continuity, user-facing routing, final closeout, final commit/push decision.
- **Planning-parent**: user-guided planning, research synthesis, spec/plan writing, artifact review loops.
- **Execution-parent**: plan-guided execution coordination, work packages, review/verification/integration, planned intermediate commits.
- **Children**: bounded researcher, worker, reviewer, verifier, or integrator panes.

The user normally talks to the orchestrator or active parent. Leaf children communicate through structured results, blockers, status, and evidence pointers.

## Hard Stops

Do not spawn before delegation preflight passes. If cmux is missing, unusable, or not the active visible workspace, fail closed and route to inline work, install/start cmux, or disable delegation. Do not fall back to hidden/headless child execution.

Do not dynamically grant tools to a running child pane. If a child lacks capability, route to the parent: handle it there, spawn a different pane, ask the user, or deny/defer.

Do not treat raw child transcripts as handoffs or normal TUI output. Child results and parent reports are the handoffs; transcripts and screen captures are recoverable evidence.

Do not let delegation bypass workflow gates. Source-truth conflicts, user-owned decisions, public API, compatibility, security, privacy, billing, data loss, permissions, and irreversible architecture still route to interview/discovery/spec/plan.

Do not parallelize implementation unless independence is explicit and writers are isolated. One writer per checkout.

Do not use delegation for tiny local tasks where one agent can safely inspect, edit, verify, and commit/close out without context pressure. Delegation is a shape for large context boundaries, not a required workflow phase.

## When To Delegate

Delegate when work has real context boundaries:

- planning research can run independently;
- a reviewer/verifier can inspect a bounded artifact, diff, or command result;
- execution packages can be isolated by dependencies/write sets;
- context-window pressure would force noisy compaction;
- a phase parent can synthesize child outputs into a compact report.

Keep small, reversible, single-file work inline.

## Normal Flow

1. Orchestrator and user settle the goal and rough scope.
2. Planning-parent owns deep planning and writes/reviews artifacts.
3. Planning-parent reports settled decisions, artifacts, open questions, risks, and execution guidance to orchestrator.
4. Orchestrator starts execution after user-approved planning.
5. Execution-parent builds a live execution map, delegates work packages, adjudicates reviews, verifies, integrates, and performs planned intermediate commits.
6. Execution-parent reports compact execution evidence to orchestrator.
7. Orchestrator owns final review/verification summary, final commit/push decision, handoff, and completion claim.

Execution autonomy is desired, not guaranteed. If execution reveals new path-changing evidence, route backward.

## Read When Needed

Read `references/context-locality.md` when explaining why delegation exists, deciding whether to delegate, or handling context-window/compaction pressure.

Read `references/roles-and-contracts.md` when deciding which pane owns a phase, who talks to the user, or what a parent/child report should contain.

Read `references/task-packets-and-results.md` when spawning a child, shaping a task packet, handling blockers/capability gaps, or consuming child results.

Read `references/execution-and-integration.md` when using workers, reviewers, verifiers, integrators, worktrees, execution maps, review loops, or commit checkpoints.

Read `references/tool-policy.md` when a child asks for tools, commands, writes, or capability escalation.
