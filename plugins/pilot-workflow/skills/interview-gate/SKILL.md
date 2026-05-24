---
name: interview-gate
description: Use when context is low, scope is ambiguous, implementation/review/verification reveals unknowns, or the agent may be about to make a user-owned decision.
---

# Interview Gate

Stop before silent decisions.

Fire this gate from any workflow state when the next action depends on:

- Product behavior.
- Scope or priority.
- Domain meaning.
- Compatibility.
- Public API or user-facing behavior.
- Irreversible architecture.
- Security, privacy, billing, or data-loss behavior.
- Changing docs, tests, specs, policies, ADRs, or handoffs to fit a new implementation request.
- A user request, handoff, plan, or review comment contradicts current repo evidence.

## Inspect Before Asking

If the answer is discoverable, inspect first:

- Code.
- Tests.
- Docs.
- Logs.
- Issues.
- ADRs or decision records.
- Current external docs when facts may have changed.

Ask the user only for decisions that remain user-owned.

## Conflict Pattern

If the requested action conflicts with docs, tests, specs, policies, ADRs, handoffs, or established code behavior:

- Stop before editing.
- Name the conflicting sources.
- Do not update the sources to erase the conflict.
- Ask whether the source of truth should change.
- Give a recommendation when the evidence supports one.

Until the user explicitly confirms the source-of-truth change, continue with investigation or clarification, not implementation.

## Question Pattern

Ask one question at a time.

For each question:

- State the uncertainty.
- Explain why it changes the next action.
- Give your recommended answer when possible.

Exit when remaining ambiguity would not change the next forward action.

## Backward Flow

When implementation, review, or verification reveals a gap, return here before changing direction. Do not patch forward silently.
