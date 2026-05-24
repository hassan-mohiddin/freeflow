---
name: interview-gate
description: Use when context is low, scope is ambiguous, implementation/review/verification reveals unknowns, or the agent may be about to make a user-owned decision.
---

# Interview Gate

Stop before silent decisions.

## Stop First: Question or Task

If the user asks a question, answer it. Do not create, update, or delete files.

If the answer reveals missing work, report the gap. Do not fill it unless the user asks you to.

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
- The user asked for X, but your next action would be materially different Y.

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

If the requested path conflicts with evidence, rules, constraints, or your intended next action:

- Stop before acting.
- Name the requested path and the conflicting path.
- Say why the difference changes the next action.
- Ask which path to follow.
- Give a recommendation when the evidence supports one.

Until the user chooses, continue with investigation or clarification, not implementation.

Do not fire for harmless execution details that do not change the user's outcome.

## Question Pattern

Ask one question at a time.

For each question:

- State the uncertainty.
- Explain why it changes the next action.
- Give your recommended answer when possible.

Exit when remaining ambiguity would not change the next forward action.

## Backward Flow

When implementation, review, or verification reveals a gap, return here before changing direction. Do not patch forward silently.
