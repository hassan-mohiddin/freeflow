---
name: discuss
description: Use when discussing, exploring, shaping, challenging, or revisiting an idea, request, artifact, design, or implementation direction, or when an open-ended request or new evidence makes the next approach uncertain.
---

# Discuss

Build enough shared understanding to choose the next sound action.

Discussion may shape understanding, recommendations, proposed work, and checkpoints. It inherits the current authority envelope: selecting Discuss does not authorize active evidence generation, mutation or delivery, settle a user-owned choice implicitly, or turn exploratory output into production behavior.

## Follow The Discussion Route

Use this as a directed map, not a checklist:

```text
[Entry or re-entry]
-> [Orient from accepted context and live evidence]
-> [Focus the highest uncertainty that could change the route]
-> [Inspect facts / ask / compare meaningful paths]
-> [Route from what is now supported]
   -> enough understanding
      -> decide continuity
         -> no record -> return direction to Workflow
         -> record needed and mutation covered -> Track Work -> Discuss -> Workflow
         -> record needed but mutation uncovered -> propose exact mutation -> wait
   -> one user-owned choice or source conflict -> Decision Gate
   -> evidence needed -> propose a bounded learning action
                         -> apply the continuity decision before returning the proposal
                         -> Workflow confirms authority and routes
                            -> Track Work when needed -> Workflow -> Execute Work or wait
                            -> no record needed -> Execute Work or wait
                         -> re-enter Discuss with evidence
   -> unexplained or repeated failure -> Diagnose Failure
   -> stable accepted content or strategy -> Write Spec / Write Plan
```

Preserve decisions, evidence, artifacts, and work that still hold whenever discussion re-enters from implementation, verification, review, failure, or another conversation.

## Enter Or Exit Cleanly

Use Discuss when:

- the user is exploring what to build or how to approach it;
- important outcomes, boundaries, alternatives, or tradeoffs remain open;
- an artifact, design, implementation direction, or earlier assumption needs reconsideration;
- new evidence makes the next approach uncertain.

Do not force discussion for a direct factual question or clear bounded action whose intended result is understood. Feedback alone does not require discussion. Re-enter only when it reopens assumptions, options, or direction.

When one known choice or source conflict blocks progress, use [Decision Gate](../decision-gate/SKILL.md). When a failure lacks a supported cause or keeps recurring, use [Diagnose Failure](../diagnose-failure/SKILL.md) before treating it as a design problem.

## Orient Without Restarting

Identify only what the next decision needs:

- goal and current direction;
- settled facts and explicit decisions;
- tentative assumptions or viable alternatives;
- evidence and uncertainty that could change the route.

When a Working Record exists, orient from its current context and check important claims against live evidence. Read older history only when the present direction or rationale is unclear. Update only what new evidence affects. When a material record update is needed, use Track Work's replacement summaries and one-owner storage rather than appending discussion prose. Apply the update only when the authority envelope covers its mutation. If the mutation is uncovered, return it to Workflow and wait. After any covered update, return to Discuss—a record update does not start execution or change the owning route.

## Focus The Discussion

Stay with the highest unresolved question that could change the outcome, boundary, approach, or acceptance. Leave dependent details until that question is sufficiently understood.

Inspect code, tests, docs, policies, artifacts, repository state, supplied material, or current primary sources when they can answer factual questions. Ask the user about intent, priorities, constraints, and tradeoffs that evidence cannot decide.

When several inspections, searches, or other observers could answer the same factual question, or the likely probe is broad, use [Action Selection](../action-selection/SKILL.md) to choose and bound one environment interaction. Discuss keeps ownership of the question and interpretation; Action Selection returns the observation. Skip it for an obvious focused read.

When materially different paths remain viable:

1. compare only the few that matter, including the current path or waiting when real;
2. state what each optimizes, its main assumptions and tradeoffs, and evidence that could rule it out;
3. recommend a direction when evidence supports one and say what could change that recommendation;
4. leave user-owned choices with the user and do not keep arguing for a rejected path without new evidence.

Ask in natural prose, usually about one main topic at a time. Use a menu only for genuinely closed choices. Do not manufacture alternatives for an obvious local decision.

When architecture, interfaces, ownership, state, failure contracts, or spreading complexity shape the direction, use [Design for Depth](../design-for-depth/SKILL.md) as a lens and retain it while the boundary remains design-bearing.

## Preserve Only Useful State

Keep discussion legible as:

- **Settled:** supported fact or explicit decision.
- **Tentative:** current hypothesis or provisional direction.
- **Open:** unresolved and capable of changing the next action.

Before routing to Track Work, ask: **Would losing current task state risk later misalignment?** Use a Working Record when:

- the task must survive compaction, pause, session navigation, or ownership transfer;
- decisions, evidence, blockers, authority, or the next action need durable recovery;
- one outcome is likely to span several implementation, verification, review, or correction iterations;
- proposed outcomes must remain ordered and visible without becoming authorized work.

Keep state in conversation when context is sufficient and the discussion or next action is short and disposable. Use [Write Spec](../write-spec/SKILL.md) for stable accepted content and [Write Plan](../write-plan/SKILL.md) for a stable ordered strategy. Do not create an artifact merely because discussion occurred.

Recommend independent review, local commit, user decision, or continuity checkpoints only when they protect dependent work or reduce material risk. Discussion may shape and preserve an approved checkpoint, but does not execute it. Normal verification and silent self-review provide the ordinary self-check; Workflow establishes the slice outcome.

Read [Discussion Continuity](references/discussion-continuity.md) when preserving a compact discussion state or re-entry summary, or when carrying a selected checkpoint from discussion.

## Learn Through Bounded Action

When discussion alone cannot answer a material question, propose the smallest useful learning or delivery action:

```text
Type: Learning | Delivery | Deepening
Question or outcome:
Smallest bounded action:
Expected evidence:
Useful checkpoint, if any:
Stop, discard, revise, or promote when:
```

Classifying an action as Learning, Delivery, or Deepening does not authorize it. Before returning an uncovered proposal to Workflow, apply the continuity decision above and include any required [Track Work](../track-work/SKILL.md) mutation. Once Workflow confirms that the authority envelope covers the action and any record mutation, use Track Work when needed, return to Workflow, then route to [Execute Work](../execute-work/SKILL.md) or wait.

Return with the observed result. Treat prototypes, tests, benchmarks, sketches, and working behavior as evidence, not automatic approval of their design or promotion. Preserve what still holds and re-enter only the affected question.

## Return Supported Direction

Converge when the next sound action no longer depends on unresolved direction, not when every future question is answered.

Return to [Workflow](../workflow/SKILL.md) with:

- current shared understanding;
- settled and tentative direction;
- open questions that still change the route;
- recommended next action or bounded proposal;
- its authority state and any selected checkpoint.

If no action is needed, answer or stop. If work is proposed but unapproved, recommend the exact action and wait for the user's response.
