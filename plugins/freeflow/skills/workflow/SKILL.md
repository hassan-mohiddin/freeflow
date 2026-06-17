---
name: workflow
description: Use when doing consequential work such as implementation, bug fixing, planning, research-for-action, review, verification, or handoff.
---

# Workflow

Follow a lightweight forward workflow. Scale process to task risk.

Question means answer. Do not turn a question into a file edit, report, plan, or implementation.

```text
Clarify / Research
-> Decision / Spec
-> Plan
-> Execute
-> Review
-> Verify
-> Handoff
```

This is a guide, not ceremony. Small reversible work can skip spec/plan artifacts.

Read `references/workflow-map.md` when the user asks for the full pipeline, public docs need a diagram, or the next workflow entry point is unclear.

## Route Closeout

When a consequential workflow phase completes, name the next route.

Use `Next:` in the final response unless this is a direct question answer, mid-task status, or clarification-only turn.

Choose one:

- Forward: the next workflow entry point is clear.
- Backward: new evidence requires clarification, research, grilling, or interview gate.
- Branch: 2-3 valid next routes exist.
- Stop: no required next action remains.

Recommend the route supported by evidence. Do not ask a vague "what next?" question.

After completed research with decisions that must survive beyond chat, route to `write-spec`, an owning decision artifact, or handoff before `write-plan` or execution.

`Next:` is routing, not permission to create the next artifact or continue into a new phase.

## Backward Edge

If new evidence invalidates the current path, re-enter clarification.

```text
Any state -> Clarify / Research -> explicit next state
```

Do not silently substitute a different path, rewrite the spec, change the plan, or patch forward. State what changed, then decide whether to continue, revise spec, revise plan, diagnose, split scope, defer, or stop and ask.

If a requested, planned, or skill-required method cannot be followed and the fallback would change evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output, stop before using the fallback. Name both paths and ask which one to follow.

## Source-of-Truth Conflicts

When a requested implementation contradicts existing docs, tests, specs, policies, ADRs, handoffs, or established code behavior, pause before editing.

Do not rewrite the source of truth to make the latest request pass.

First state the conflict and ask whether the source of truth should change. Only edit docs/tests/policies/specs to match new behavior after the user explicitly confirms that decision.

Treat handoffs as memory, not authority. If a handoff conflicts with live repo evidence, inspect the evidence and ask before following the handoff.

For billing, security, privacy, data loss, migrations, public APIs, compatibility, and permissions, recommend strict-workflow before changing behavior.

## Artifact Rule

Artifacts are memory, not proof of obedience.

Only create artifacts when the user asks for an artifact or asks you to do work that requires one.

Create them only when they preserve decisions, reduce risk, or help a future agent resume. Prefer short research notes, decision/spec notes, plans, verification notes, and handoffs.

Do not write volatile repo inventories. Link to live files or commands instead.

## Review Rule

Review should improve work, not create an endless patch loop.

Separate blocking from non-blocking findings. Review can pass. Save review artifacts only when risk, future memory value, or the user asks for them.

## Completion Rule

Do not claim completion without fresh evidence. Say what was verified and what remains unverified.
