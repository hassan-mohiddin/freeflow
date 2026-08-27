---
name: discuss
description: "Use when the user is exploring, challenging, or revisiting what to build or how to proceed, or when assumptions, alternatives, or new evidence leave the next sound action materially uncertain."
---

# Discuss

Build enough shared understanding to choose the next sound action.

Discuss owns exploration, alternatives, assumptions, and direction. It may shape recommendations, proposed work, and checkpoints. It does not authorize active evidence generation, mutation, delivery, or a user-owned decision.

## Enter Or Exit Cleanly

Use Discuss when:

- the outcome, boundary, approach, or acceptance remains materially open;
- several meaningful paths remain viable;
- an assumption or earlier direction needs reconsideration;
- new evidence makes the next route uncertain.

Do not turn every interaction into a discussion phase. If the user asks a direct factual question, provides a clear bounded request, or gives feedback that does not reopen direction, answer or return the request to Workflow.

When one known user-owned choice or source conflict blocks progress, use [Decision Gate](../decision-gate/SKILL.md). When a failure lacks a supported cause or keeps recurring, use [Diagnose Failure](../diagnose-failure/SKILL.md).

## Discuss Like A Collaborator

Respond to the user’s substance before steering the conversation.

Carry your share of the thinking:

- interpret what the current evidence and intent imply;
- expose consequential assumptions and tradeoffs;
- challenge claims when evidence or engineering judgment warrants it;
- recommend a direction when one is better supported;
- revise your position plainly when new reasoning or evidence changes it.

Ask only questions whose answers could materially change the route and which available evidence cannot answer. Ask the user about intent, priorities, constraints, and tradeoffs they own. Do not make the user answer factual questions that existing sources can resolve.

Keep one consequential uncertainty in focus. Do not conduct a questionnaire, manufacture alternatives, repeat accepted context, or continue arguing for a rejected path without new evidence.

## Follow The Discussion Loop

```text
Orient from what remains true
-> respond to the current substance
-> focus the uncertainty that could change the route
-> inspect facts, ask about intent, or compare meaningful paths
-> determine what is now supported
   -> continue discussion
   -> learn through bounded action
   -> decide continuity
   -> route the supported result
```

Use this as a feedback loop, not a user-facing checklist.

## Orient Without Restarting

Identify only what the next decision needs:

- the goal and current direction;
- supported facts and explicit decisions;
- tentative assumptions or viable alternatives;
- open questions capable of changing the route;
- evidence that still matters.

Keep these distinctions available:

- **Settled:** supported fact or explicit decision.
- **Tentative:** live hypothesis or provisional direction.
- **Open:** unresolved and capable of changing the next action.

Use those labels in the response only when they make a transition or summary clearer. Do not turn every discussion turn into a status report.

When discussion reopens after implementation, feedback, verification, review, or failure, preserve what still holds and revisit only the affected assumption, decision, or direction.

When a Working Record exists, read [Track Work](../track-work/SKILL.md) before any record operation. Recover the relevant current state, reconcile it with current user direction and live evidence, and return to the question that actually changed. Memory does not override contradictory evidence or current intent.

## Resolve What Conversation Can Resolve

Inspect existing code, tests, documentation, policies, artifacts, repository state, supplied material, or current primary sources when they can answer a factual question without exercising target behavior or changing state.

When several observations could answer the same question, or the likely inspection is broad, use [Action Selection](../action-selection/SKILL.md) to choose the smallest discriminating observation.

When materially different paths remain viable:

1. compare only the paths that could realistically be chosen;
2. state what each optimizes and what it sacrifices;
3. identify the assumptions on which each path depends;
4. recommend the best-supported direction;
5. state what evidence or changed priority would alter that recommendation.

When architecture, interfaces, ownership, state, or failure behavior shapes the direction, use [Design for Depth](../design-for-depth/SKILL.md) as a lens.

Converge when the next sound action no longer depends on unresolved direction. Do not continue discussion merely because more detail could be explored.

## Learn Through Bounded Action

Do not keep reasoning about an empirical uncertainty when a small, reversible experiment can discriminate between the remaining hypotheses.

Use a Learning action when:

- accepted evidence and passive inspection cannot answer a material question;
- exercising behavior, building a prototype, testing an assumption, or writing disposable code can answer it;
- the expected information can change the direction;
- the action can be bounded by evidence and a stop condition.

Propose:

```text
Question or hypothesis:
Smallest discriminating action:
Reversible effects and production boundary:
Expected evidence:
Stop and return when:
Discard, revise, or propose promotion when:
```

A learning proposal does not authorize execution. Before returning it to Workflow, decide whether its context needs durable preservation. Workflow confirms authority and routes covered work through [Track Work](../track-work/SKILL.md) when needed and then [Execute Work](../execute-work/SKILL.md).

Return the result to Discuss. Treat prototypes, tests, benchmarks, sketches, and working behavior as evidence—not automatic approval of their design or promotion into production.

If the work remains valuable as an accepted outcome regardless of what it teaches, propose a Delivery or Deepening result instead of disguising it as Learning.

## Decide Continuity Before Leaving

Before discussion hands off a supported direction, ask:

> Would losing the current understanding, decisions, evidence, proposals, or next action risk later misalignment?

If no, keep the state in conversation.

If yes, read [Discussion Continuity](references/discussion-continuity.md) before choosing or preserving the durable destination. When a Working Record is appropriate:

```text
Discuss
-> material supported state
-> Track Work update
-> Discuss
-> Workflow
```

Discuss decides what the state means and whether it needs continuity. Track Work owns the Working Record and its lifecycle. A record update does not end discussion, authorize work, select a proposal, or change the owning route.

Do not create a Working Record for a short disposable exchange or one clear direct result merely because discussion occurred. Reconsider the decision if a small task develops durable decisions, several outcomes, repeated feedback, checkpoints, or context-loss risk.

## Shape Checkpoints Sparingly

Recommend a user decision, independent review, local commit, or continuity checkpoint only when crossing that boundary unresolved could materially endanger dependent work.

Discussion may propose a checkpoint. Workflow selects it. Track Work preserves it when durable memory is needed. A recommendation or recorded checkpoint does not authorize the action it describes.

## Return Supported Direction

Return to [Workflow](../workflow/SKILL.md) with the concepts the next route needs:

- current shared understanding;
- settled and tentative direction;
- open questions that still change the route;
- recommended next action or bounded proposal;
- continuity decision;
- authority state and selected checkpoint, when any.

Use natural prose unless structured state materially improves continuity.

Route narrowly:

- one user-owned choice or source conflict -> Decision Gate;
- unexplained or repeated failure -> Diagnose Failure;
- stable accepted content -> [Write Spec](../write-spec/SKILL.md);
- stable ordered strategy -> [Write Plan](../write-plan/SKILL.md);
- covered bounded work -> Workflow and Execute Work;
- no action needed -> answer or stop.

If work is recommended but not authorized, state the exact proposal and wait.
