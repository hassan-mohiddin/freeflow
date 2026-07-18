---
name: discuss
description: Use when discussing, exploring, shaping, challenging, or revisiting an idea, request, artifact, design, or implementation direction, or when an open-ended request or new evidence makes the next approach uncertain.
---

# Discuss

Build enough shared understanding to choose the next sound action.

Discussion may begin with a fresh request or resume from a spec, plan, implementation, failure, review, or earlier conversation. Start from what is already known. Preserve decisions, evidence, artifacts, and work that still hold.

Discussion can alternate with bounded action. Do not wait for a complete spec or plan when a small experiment, prototype, or implementation slice is the clearest way to learn.

## Use Discuss

Use Discuss when:

- the user is exploring an idea, asking what to build, or discussing how to approach it;
- an open-ended request leaves important outcomes, boundaries, or alternatives unsettled;
- a spec, plan, design, or implementation direction needs discussion or revision;
- materially different approaches or tradeoffs need to be understood;
- new evidence invalidates an assumption or makes the next approach uncertain.

Do not force discussion for a direct factual question or a clear, bounded action whose intended result is already understood. When one known choice or conflict blocks progress, read [Decision Gate](../decision-gate/SKILL.md).

Feedback from review, verification, or implementation does not require discussion by itself. Use Discuss when that feedback reopens assumptions, alternatives, or direction. When the failure is unexplained or repeated, read [Diagnose Failure](../diagnose-failure/SKILL.md) before treating it as a design problem.

## Start From The Current State

Identify:

- the goal and current direction;
- settled facts and decisions;
- active assumptions or alternatives;
- the evidence and uncertainty that could change the next action.

When a Working Record exists, orient from its current state and check important claims against live evidence. Read older history only when the present direction or rationale is unclear.

For a fresh request, little may be settled. When returning from implementation or another feedback source, update only what the new evidence affects.

## Build Shared Understanding

Stay with the highest unresolved question that could change the direction. Leave dependent details until the purpose, scope, boundaries, or approach are clear.

Inspect code, tests, docs, policies, existing artifacts, repository state, provided material, or current primary sources when they can answer factual questions. Ask the user about intent, priorities, constraints, and tradeoffs that evidence cannot decide.

When materially different paths are viable, compare the few that matter. Include the current approach or waiting when either is a real option. Explain what each path optimizes, its main assumptions and tradeoffs, and what evidence could rule it out. Do not manufacture alternatives for an obvious local choice.

Ask in natural prose, usually about one main topic at a time. Let each answer shape what comes next. Use a menu only when the choices are genuinely closed.

Contribute your own judgment. Recommend a direction when evidence supports it, explain why, and state what could change your view. Leave user-owned choices with the user, and do not keep arguing for a rejected path without new evidence.

When architecture, interfaces, ownership, state, failure contracts, or spreading complexity are central, read [Design for Depth](../design-for-depth/SKILL.md).

## Learn Through Action

When discussion alone cannot answer an important question, define the smallest useful learning or delivery slice. When a written shape helps, use:

```text
Type: Learning | Delivery | Deepening
Question or outcome:
Smallest bounded action:
Expected evidence:
Useful checkpoint, if any:
Stop, discard, revise, or promote when:
```

The slice may produce throwaway code, a prototype, a test, an interface sketch, a benchmark, a design comparison, or working behavior.

Defining a slice does not authorize it. Before execution, confirm that the user requested or approved the action. When durable task memory is needed, read [Track Work](../track-work/SKILL.md) and record the slice before execution begins.

After the slice, return to discussion with the observed result. Treat the output as evidence, not automatic approval of its design or promotion into production. Diverge again when the result opens materially different paths. Update the current understanding, decisions, proposed work, and Working Record only where the result changed them.

## Shape Useful Checkpoints

A checkpoint is a deliberate boundary before dependent work where the agent observes, judges, decides, preserves, or transfers state.

When discussion shapes a slice, phase, experiment, or execution strategy, help the user consider useful independent reviews, local commits, user decisions, continuity checkpoints, or separately controlled follow-on work. Recommend one only when it reduces material risk, preserves a coherent state, or protects dependent work. State its purpose, when it becomes due, and the conditions that must hold.

Do not add checkpoints after every slice by habit. Normal verification and silent self-review already close each meaningful slice. Explicit approval in discussion authorizes the listed checkpoint only; a local commit does not authorize push or integration, and migration, deprecation, release, or launch remain separate.

Keep an approved checkpoint in conversation while context is sufficient. Use [Write Plan](../write-plan/SKILL.md) when it belongs to a stable ordered strategy or [Track Work](../track-work/SKILL.md) when evolving task state must survive. Discuss does not execute the checkpoint.

## Keep The Discussion Legible

Track only what helps the next action:

- **Settled:** supported fact or explicit decision.
- **Tentative:** current hypothesis or provisional direction.
- **Open:** unresolved and capable of changing the next action.

Note an uncertainty assigned to action, a deferred topic, or an invalidated assumption only when it affects the route.

Keep this state in conversation while the context is sufficient. Use a Working Record when the discussion, slices, decisions, or evidence must survive compaction, pause, or a later session. Discuss does not define the Working Record schema or lifecycle; [Track Work](../track-work/SKILL.md) owns that method.

## Converge And Return

Converge when the next sound action no longer depends on unresolved direction, not when every future question is answered.

State:

- the current shared understanding;
- settled and tentative direction;
- open questions that still matter;
- the recommended next action or bounded slice.

Read [Write Spec](../write-spec/SKILL.md) when stable accepted content needs a separate durable artifact. Read [Write Plan](../write-plan/SKILL.md) when a stable ordered execution strategy needs a separate artifact. Discussion and a Working Record may otherwise continue to guide the task slice by slice.

When later evidence changes the direction, return with the evidence, the invalidated assumption, and what remains valid. Continue the discussion from that state rather than restarting from zero.

Read [discussion checkpoints](references/checkpoints.md) when closing or preserving a compact discussion checkpoint.
