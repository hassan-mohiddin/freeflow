---
name: discuss
description: "Use when exploring, clarifying, or revisiting what to accomplish or how to approach it, especially when user collaboration, alternatives, assumptions, or new evidence could change the next action."
---

# Discuss

Build enough shared understanding to choose the next sound action. Discussion can establish both what to accomplish and how to approach it; it need not end at requirements or continue until every implementation detail is known.

Discuss owns exploration, alternatives, assumptions, and direction.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Conversation, convergence, a recommendation, or a recorded proposal never authorizes execution. Begin implementation only under an execution agreement established through [Workflow](../workflow/SKILL.md).
- Keep supported facts and explicit decisions distinct from hypotheses, proposed mechanisms, and unresolved choices. An assistant recommendation never becomes a requirement because it is repeated or recorded.
- Leave priorities, behavior, constraints, and tradeoffs the user owns to the user; ask rather than decide them.
- Never weaken required behavior to make an approach look simpler.
- A successful demonstration is not production acceptance; promotion must be deliberately selected and its effects authorized.

## Start From The User's Intent

Goal: the conversation serves what the user is actually trying to do, at the depth they asked for.

Respond to the substance before steering the process.

A request to discuss keeps the user involved as understanding develops. Gather relevant existing facts when needed, explain what they imply, and return at the next meaningful question or supported conclusion.

A direct action request may already settle the outcome and delegate approach selection. Do not force a discussion phase when existing evidence can resolve the remaining facts and reversible local choices. Return clear covered work to Workflow.

Use [Decision Gate](../decision-gate/SKILL.md) for one known blocking user-owned choice or source conflict. Use [Diagnose Failure](../diagnose-failure/SKILL.md) when a reported or recurring failure needs a supported cause rather than broader option discussion.

## Separate Outcome From Approach

Goal: know which understanding is missing, what or how, and establish only that.

Identify which understanding is missing:

- **What:** the problem or opportunity, desired result, accepted behavior, constraints, non-goals, and what would count as success.
- **How:** the mechanism, dependencies, affected boundaries, tradeoffs, and evidence needed to produce that result in the actual environment.

Use [Design for Depth](../design-for-depth/SKILL.md) when representation, identity, ownership, interfaces, algorithms, state, dependencies, or failure behavior materially shape the choice. If unresolved choices could materially change a technical recommendation or invalidate significant dependent work, read its Implementation Decisions method before recommending a mechanism. Use it to explain the differences that matter between viable approaches, not to turn ordinary discussion or a supported local change into an architecture exercise.

These questions can be answered together. Reuse what remains supported instead of running two compulsory discovery passes. A detailed request may settle what while leaving how open; an investigation may reveal that the initial problem description was wrong.

When reopening discussion, name what changed and preserve unaffected understanding. A new local obstacle does not reopen the whole task.

## Gather Context To Answer A Question

Goal: answer the question the discussion needs with the smallest observation that can answer it.

Before inspecting the environment, identify the missing fact and how its answer could change the discussion. Check whether current evidence already supplies it.

Use [Action Selection](../action-selection/SKILL.md) for uncertain or broad inspection. Prefer a focused source, caller, contract, or observation over a repository survey. Read more only when the result leaves a material question unresolved.

Existing code, tests, documentation, policies, artifacts, repository state, supplied material, and current primary sources may settle factual questions. Inspect them rather than asking the user to supply facts available to the agent. Source inspection cannot establish unobserved runtime behavior.

Stop gathering when sufficient evidence supports the next decision. Do not collect every later dependency, reconstruct exhausted history, or prepare an exact implementation plan while the outcome is still open.

## Collaborate And Recommend Proportionately

Goal: the user gets your real judgment, with the tradeoffs that matter, and keeps the choices they own.

Carry your share of the thinking:

- explain what the evidence and intent imply;
- challenge unsupported claims and consequential assumptions;
- compare only materially different paths that could realistically be chosen;
- state what each sacrifices and the assumptions it needs;
- recommend the best-supported direction and what would change it;
- revise your position when evidence changes.

Keep one consequential uncertainty in focus; do not conduct a questionnaire or manufacture alternatives for ordinary choices.

Before recommending a new obligation, distinguish a requirement from a limitation of the current approach. Explain consequences in user terms: "requires changing and distributing a patched host," not merely "needs a provenance interface." Include a simpler in-scope alternative when one is supported.

## Frame And Assess A Learning Action

Goal: when evidence cannot settle a question, the smallest experiment that can settle it, and an honest reading of what it showed.

Use an experiment or prototype when existing evidence cannot settle a material question and exercising behavior can distinguish the remaining answers. A separate prototype should isolate the uncertainty more safely or economically than changing production; unfamiliarity alone does not require one.

If the work is an accepted useful outcome regardless of what it teaches, treat it as Delivery or Deepening rather than disguise implementation as Learning. Incidental learning does not change its authority or acceptance boundary.

Frame the action before proposing execution:

- the question and its consequence for the accepted outcome or approach;
- plausible answers and the observation that would distinguish them;
- the smallest adequate prototype or observer;
- permitted effects, environment, and production exclusion;
- expected evidence and return conditions: question answered, observing limit reached, or further work requiring a different question or expanded scope;
- what would justify discarding, revising, or proposing promotion.

Add a time or cost boundary when repetition or setup could grow; do not demand an exact token prediction. If no adequate observer is available within scope, state the limitation rather than inventing a proof.

Return the framed action to Workflow for authority and, when needed, [Track Work](../track-work/SKILL.md) preservation, then [Execute Work](../execute-work/SKILL.md) for execution. Existing authority may already cover the experiment; its name does not create another approval gate.

Assess returned evidence against the original question. Negative or inconclusive evidence is a valid result; one failed technique does not prove every alternative impossible. If a new prerequisite is reported, distinguish a limitation of the observer or chosen approach from a requirement of the intended outcome before recommending more work.

Revise only the affected understanding. Preserve the consequence for the task, remaining uncertainty, and exploratory-artifact disposition when continuity matters. Stop assessment when the supported next direction or unresolved decision is clear.

## Preserve A Useful Route When Needed

Goal: when the likely work becomes clear, the route and the understanding behind it survive for whoever continues.

When the likely work becomes clear enough, propose coherent outcomes and their dependencies. Keep near-term work concrete and later work directional. A rough route need not wait for a formal Plan; its order may change as evidence arrives.

Ask whether losing the current understanding, decisions, evidence, proposals, or next action would risk misalignment. If not, keep it in conversation.

If continuity matters, read [Discussion Continuity](references/discussion-continuity.md), then Track Work before record operations. Preserve the state that made memory necessary, not an empty shell or transcript. Keep the outcome separate from the current approach and retain material uncertainty instead of describing proposals as settled work.

Once a record exists, use it as working memory during the discussion, updating it at meaningful boundaries: accepted choices, open questions, options still under consideration, material the user supplies, and the route as it emerges. Track Work describes how.

```text
Discuss establishes supported meaning
-> Track Work preserves material state
-> Discuss continues or returns the direction to Workflow
```

The record does not select work or grant authority. When the route includes a commit, a publication, a review, a user decision, or a planned handoff, propose it as a Checkpoint on the route rather than as a separate Slice; Workflow selects it.

## Converge And Return

Goal: end the discussion when the next sound action no longer depends on it, and hand over only what that action needs.

End the current discussion when the next sound action no longer depends on unresolved direction, or when a bounded learning action, missing user decision, wait, or stop is clear. Do not continue merely because more detail could be explored.

When the user requests execution, return to Workflow to establish its outcome, scope, and user-facing return condition. If the user delegates the remaining investigation and implementation, do not require them to finish planning it. Context gathered during discussion counts toward preparing the route; do not repeat it, and gather what the route still needs before the first production change.

Return only what the next route needs: supported understanding, tentative approach, material open questions, relevant evidence, recommended or accepted next action, continuity, and authority state.

- Stable accepted content needing a durable source -> [Write Spec](../write-spec/SKILL.md).
- A supported ordered strategy needing a durable artifact -> [Write Plan](../write-plan/SKILL.md).
- Covered concrete work -> Workflow and Execute Work.
- One blocking owner choice -> Decision Gate.
- Unsupported failure cause -> Diagnose Failure.
- No action needed -> answer or stop.

Neither an artifact nor a planning milestone is mandatory. Stop recommending or preserving once the agreed discussion result is supported.
