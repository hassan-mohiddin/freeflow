---
name: decision-gate
description: Use when the next action depends on a user-owned decision, source-truth or path conflict, material method substitution, ambiguous artifact destination, or new evidence from discovery, implementation, review, or verification that makes the current route unsafe or changes the next action.
---

# Decision Gate

Stop before silently choosing a consequential path.

This skill handles one unsafe next action. It is not a questionnaire, brainstorming method, or substitute for Discover.

The always-on interaction contract lives in [the runtime kernel](references/runtime-kernel.md). Read it when configuring or reviewing Freeflow runtime behavior; runtime adapters may load it directly as system context.

## Fire The Gate

Stop when the next action depends on:

- product behavior, scope, priority, or domain meaning;
- public API, compatibility, permissions, security, privacy, billing, or data-loss behavior;
- hard-to-reverse architecture or migration behavior;
- artifact creation, destination, durability, or authority when alternatives differ materially;
- changing docs, tests, specs, policies, ADRs, or handoffs to fit a new request or implementation;
- a request, handoff, plan, review comment, or assumption that conflicts with live evidence;
- the user asking for X while the proposed next action is materially different Y;
- replacing a requested, planned, or skill-required method with a fallback that changes evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output;
- implementation, review, or verification evidence that invalidates the current spec, plan, interface, scope, or later slices.

Do not fire for harmless local choices such as equivalent commands, temporary names, nearby reads, formatting, or implementation details that preserve the accepted outcome.

## Inspect Or Ask

Inspect first when code, tests, docs, logs, issues, ADRs, repo state, or current external sources can answer the factual question.

Ask only for decisions that remain user-owned or whose alternatives materially change the next route.

Exception: when the requested method and a materially different fallback are already known, ask before fallback work or extra inspection performed only to make the substitution sound more complete.

## Gate Response

1. Name the current requested or planned path.
2. Name the conflicting path, evidence, or missing decision.
3. Explain why it changes the next action.
4. Recommend a route only when evidence supports one; do not manufacture a preferred answer before the option space is understood.
5. Ask one direct decision question, or route to Discover when the problem needs broader collaborative exploration.
6. Stop. Do not perform the blocked action in the same response.

A direct skill call, approval to continue, “do not ask,” urgency, reviewer confidence, or existing practice does not override the gate.

## Backward Route

When later work exposes a gap, preserve what remains valid and identify the narrowest affected layer:

- continue when evidence does not change the route;
- revise later slices or the plan when execution order or mechanism changed;
- revise the spec when behavior, scope, acceptance, public contract, or failure semantics changed;
- use `../design-for-depth/SKILL.md` when caller knowledge, states, edge cases, or coordination are spreading;
- use `../diagnose-failure/SKILL.md` when the next question is a failure signal or root cause;
- return to Discover when the option space or intended outcome needs reopening;
- stop or defer when no safe in-scope route remains.

Do not restart discovery from zero or patch forward silently.

## Exit

Exit when the relevant decision is explicit, source conflicts are resolved, and remaining ambiguity would not change the next safe action.

If the user must choose between consequential paths, end with the direct choice question rather than `Next:`.
