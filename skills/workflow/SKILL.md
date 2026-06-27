---
name: workflow
description: Use when doing consequential work such as implementation, bug fixing, planning, discovery-for-action, review, verification, or handoff.
---

# Workflow

Follow a lightweight forward workflow. Scale process to task risk.

Move forward when context is sufficient. Re-enter clarification when new ambiguity would change the next action.

Question means answer. Do not turn a question into a file edit, report, plan, or implementation.

```text
Clarify / Discover
-> Decision / Spec
-> Plan
-> Execute
-> Review
-> Verify
-> Handoff
```

This is a guide, not ceremony. Small reversible work can skip spec/plan artifacts.

Method skills and lenses such as TDD, diagnosis, execute-plan, or design-for-depth run inside the current workflow phase. Workflow owns routing, source-truth conflicts, user-owned decisions, review, verification, and handoff boundaries.

Read `references/workflow-map.md` when the user asks for the full pipeline, public docs need a diagram, or the next workflow entry point is unclear.

## Route Closeout

Use `Next:` to name a helpful next route for the user. It is general routing, not only a workflow-phase label.

Do not add `Next:` to every reply. Questions get answers first; add `Next:` only when the answer leaves a concrete next action, choice, stop condition, or route worth naming.

For completed consequential work or workflow phases, include `Next:` unless this is a direct question answer, mid-task status, clarification-only turn, or the final line must be a direct owner-decision question.

Choose one:

- Forward: the next action or workflow entry point is clear.
- Backward: new evidence requires clarification, discovery, or interview gate.
- Branch: 2-3 valid next routes or actions exist.
- Stop: no useful next action remains.

Recommend the route supported by evidence. Do not ask a vague "what next?" question.

After completed discovery with decisions that must survive beyond chat, route to `write-spec`, an owning decision artifact, or handoff before `write-plan` or execution.

`Next:` is routing, not permission to create the next artifact, continue into a new phase, or take the next action.

## Backward Edge

If new evidence invalidates the current path, re-enter clarification.

```text
Any state -> Clarify / Discover -> explicit next state
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

Create them only when they preserve decisions, reduce risk, or help a future agent resume. Prefer short discovery notes, decision/spec notes, plans, verification notes, and handoffs.

Do not write volatile repo inventories. Link to live files or commands instead.

## Review Rule

Review should improve work, not create an endless patch loop.

Reviewer findings are evidence, not commands. Separate blocking, non-blocking, and question findings before editing from them.

A non-passing review routes to adjudication before more implementation. Repeated review failure routes backward to diagnose, discover, spec, or plan; do not chase a fourth broad review pass.

Review can pass. Save review artifacts only when risk, future memory value, or the user asks for them.

## Completion Rule

Do not claim completion without fresh evidence. Say what was verified and what remains unverified.
