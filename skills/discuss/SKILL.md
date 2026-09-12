---
name: discuss
description: "Use when exploring, clarifying, or revisiting what to accomplish or how to approach it, especially when user collaboration, alternatives, assumptions, or new evidence could change the next action."
---

# Discuss

Build enough shared understanding to choose the next sound action. Discussion can establish both what to accomplish and how to approach it; it need not end at requirements or continue until every implementation detail is known.

Discuss owns exploration, alternatives, assumptions, and direction. It does not turn conversation, a recommendation, or a recorded proposal into execution authority.

## Start From The User's Intent

Respond to the substance before steering the process.

A request to discuss keeps the user involved as understanding develops. Gather relevant existing facts when needed, explain what they imply, and return at the next meaningful question or supported conclusion. Do not treat convergence as permission to implement.

A direct action request may already settle the outcome and delegate approach selection. Do not force a discussion phase when existing evidence can resolve the remaining facts and reversible local choices. Return clear covered work to [Workflow](../workflow/SKILL.md).

Use [Decision Gate](../decision-gate/SKILL.md) for one known blocking user-owned choice or source conflict. Use [Diagnose Failure](../diagnose-failure/SKILL.md) when a reported or recurring failure needs a supported cause rather than broader option discussion.

## Separate Outcome From Approach

Identify which understanding is missing:

- **What:** the problem or opportunity, desired result, accepted behavior, constraints, non-goals, and what would count as success.
- **How:** the mechanism, dependencies, affected boundaries, tradeoffs, and evidence needed to produce that result in the actual environment.

Use [Design for Depth](../design-for-depth/SKILL.md) when representation, identity, ownership, interfaces, algorithms, state, dependencies, or failure behavior materially shape the choice. If unresolved choices could materially change a technical recommendation or invalidate significant dependent work, read its Implementation Decisions method before recommending a mechanism. Use it to explain the differences that matter between viable approaches, not to turn ordinary discussion or a supported local change into an architecture exercise.

These questions can be answered together. Reuse what remains supported instead of running two compulsory discovery passes. A detailed request may settle what while leaving how open; an investigation may reveal that the initial problem description was wrong.

Keep supported facts and explicit decisions distinct from hypotheses, proposed mechanisms, and unresolved choices. Do not turn an assistant recommendation into a requirement because it is repeated or recorded.

When reopening discussion, name what changed and preserve unaffected understanding. A new local obstacle does not reopen the whole task.

## Gather Context To Answer A Question

Before inspecting the environment, identify the missing fact and how its answer could change the discussion. Check whether current evidence already supplies it.

Use [Action Selection](../action-selection/SKILL.md) for uncertain or broad inspection. Prefer a focused source, caller, contract, or observation over a repository survey. Read more only when the result leaves a material question unresolved.

Existing code, tests, documentation, policies, artifacts, repository state, supplied material, and current primary sources may settle factual questions. Inspect them rather than asking the user to supply facts available to the agent. Source inspection cannot establish unobserved runtime behavior.

Stop gathering when sufficient evidence supports the next decision. Do not collect every later dependency, reconstruct exhausted history, or prepare an exact implementation plan while the outcome is still open.

## Collaborate And Recommend Proportionately

Carry your share of the thinking:

- explain what the evidence and intent imply;
- challenge unsupported claims and consequential assumptions;
- compare only materially different paths that could realistically be chosen;
- state what each sacrifices and the assumptions it needs;
- recommend the best-supported direction and what would change it;
- revise your position when evidence changes.

Ask about priorities, behavior, constraints, and tradeoffs the user owns. Keep one consequential uncertainty in focus; do not conduct a questionnaire or manufacture alternatives for ordinary choices.

Before recommending a new obligation, distinguish a requirement from a limitation of the current approach. Explain consequences in user terms: "requires changing and distributing a patched host," not merely "needs a provenance interface." Include a simpler in-scope alternative when one is supported. Do not weaken required behavior to make an approach look simpler.

## Frame And Assess A Learning Action

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

Revise only the affected understanding. Preserve the consequence for the task, remaining uncertainty, and exploratory-artifact disposition when continuity matters. A successful demonstration is not production acceptance; promotion must be deliberately selected and its effects authorized. Stop assessment when the supported next direction or unresolved decision is clear.

## Preserve A Useful Route When Needed

When the likely work becomes clear enough, propose coherent outcomes and their dependencies. Keep near-term work concrete and later work directional. A rough route need not wait for a formal Plan; its order may change as evidence arrives.

Ask whether losing the current understanding, decisions, evidence, proposals, or next action would risk misalignment. If not, keep it in conversation.

If continuity matters, read [Discussion Continuity](references/discussion-continuity.md), then Track Work before record operations. Preserve the state that made memory necessary, not an empty shell or transcript. Keep the outcome separate from the current approach and retain material uncertainty instead of describing proposals as settled work.

```text
Discuss establishes supported meaning
-> Track Work preserves material state
-> Discuss continues or returns the direction to Workflow
```

The record does not select work or grant authority. Propose independent review, a local commit, a user decision, or a continuity checkpoint only when it protects a material boundary; Workflow selects it.

## Converge And Return

End the current discussion when the next sound action no longer depends on unresolved direction, or when a bounded learning action, missing user decision, wait, or stop is clear. Do not continue merely because more detail could be explored.

When the user requests execution, return to Workflow to establish its outcome, scope, and user-facing return condition. If the user delegates the remaining investigation and implementation, do not require them to finish planning it.

Return only what the next route needs: supported understanding, tentative approach, material open questions, relevant evidence, recommended or accepted next action, continuity, and authority state.

- Stable accepted content needing a durable source -> [Write Spec](../write-spec/SKILL.md).
- A supported ordered strategy needing a durable artifact -> [Write Plan](../write-plan/SKILL.md).
- Covered concrete work -> Workflow and Execute Work.
- One blocking owner choice -> Decision Gate.
- Unsupported failure cause -> Diagnose Failure.
- No action needed -> answer or stop.

Neither an artifact nor a planning milestone is mandatory. Stop recommending or preserving once the agreed discussion result is supported; do not begin implementation without the execution agreement.
