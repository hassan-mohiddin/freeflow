---
name: "decision-gate"
description: "Use when proceeding would silently choose a consequential outcome for the user, or when accepted sources conflict in a way that leaves one material choice blocking the next action."
---

# Decision Gate

Resolve one known blocking decision without making it for the user.

A **blocking decision** is a choice whose realistic answers materially change the accepted outcome, scope, behavior, risk, persistence, compatibility, evidence boundary, or next safe action.

Decision Gate is not general discussion, factual investigation, or an approval checkpoint for routine work. It begins only when one blocking choice or source conflict is clear enough to resolve with one direct question.

The [Interaction Contract](../../runtime/prompts/interaction-contract.md) governs whether the user is asking, proposing, deciding, or authorizing action. [Workflow](../workflow/SKILL.md) owns authority and routing.

## Enter With One Decision

Use Decision Gate only when:

- the requested or accepted path is known;
- one unresolved choice or material source conflict can be stated precisely;
- available evidence and established source precedence do not already settle it;
- different realistic answers would materially change what follows;
- proceeding would silently decide for the user or override accepted source truth.

Do not use Decision Gate for:

- facts available through focused passive inspection;
- reversible implementation details that preserve the accepted outcome;
- ordinary authorization for one clear additional action;
- preferences that do not affect the result or its acceptance;
- hypothetical edge cases without supported reachability or consequence;
- broad or unsettled option spaces that still require exploration.

Use [Discuss](../discuss/SKILL.md) when the problem, alternatives, assumptions, or direction are not yet bounded enough for one decision.

When several decisions appear, ask only the earliest one whose answer determines whether the others remain relevant. Do not turn the gate into an interview.

## Resolve Facts Before Asking

Inspect the smallest existing evidence that can settle the factual part: the current request, accepted decisions, code, tests, documentation, Specs, policies, ADRs, repository state, supplied artifacts, and current primary sources when relevant.

Do not ask the user to choose between factual claims whose truth can be established from available evidence.

When accepted sources appear to conflict:

1. state each source's exact claim and applicable scope;
2. determine whether each is current, accepted, draft, historical, generated, or advisory;
3. apply repository-defined precedence or maintenance policy when one exists;
4. identify the observable consequence of following each claim.

A difference is material only when applicable sources make incompatible claims and selecting between them changes the accepted result or next safe action.

Do not invent a universal hierarchy: code is not automatically correct because it runs, tests are not automatically requirements because they fail, documentation is not automatically stale because implementation differs, and task memory does not override live accepted source truth.

If established precedence resolves the conflict, return the supported result to Workflow without asking a decision question. Updating an inconsistent source belongs to its owning activity and requires its own authority.

If responsible framing requires new active evidence, return the exact claim, proposed observer, expected evidence, and stop condition to Workflow. Decision Gate does not run an experiment merely to make its question easier.

## Ask One Direct Question

State proportionately:

1. the requested or previously accepted path;
2. the exact missing choice or conflicting evidence;
3. why it changes the next action;
4. the realistic options and material tradeoffs;
5. a recommendation when evidence supports one;
6. one direct question that resolves the block.

Frame the choice around the outcome the user owns, not ordinary implementation mechanics. Do not ask which file to change when the real decision is which behavior or contract should govern.

Do not manufacture a menu. Omit dominated, unsafe, unavailable, or hypothetical options. A direct yes-or-no question is appropriate when one supported deviation needs a decision. Include preserving the current behavior, waiting, or stopping only when each is real.

Recommend plainly when one path is better supported. State its principal tradeoff and what evidence or changed priority would alter the recommendation. A recommendation is not the user's decision.

Then stop. Do not perform the blocked action in the same response.

Urgency, prior effort, reviewer confidence, common practice, or general approval to continue does not resolve an unnamed decision or source conflict.

## Interpret And Return The Decision

Treat an explicit choice as resolving only the decision that was asked. A question, criticism, hypothesis, preference, conditional answer, or request for more information is not automatically a decision; respond to its substance and keep the blocked action stopped.

Route narrowly:

- explicit choice with a clear covered path → Workflow;
- answer that reopens alternatives or assumptions → Discuss;
- unresolved factual evidence → Workflow and the appropriate evidence owner;
- defer, preserve, or stop → return that outcome without forcing progress.

A resolved decision may complete the missing intent for a still-valid request. It does not authorize unrelated effects or another outcome by implication.

Return to Workflow with:

- the exact decision and who or what established it;
- the selected outcome and important exclusions;
- material consequences and affected source truth;
- remaining uncertainty or revisit condition;
- the authority state of the next action.

When losing the decision or its rationale could cause later misalignment, Workflow may route [Track Work](../track-work/SKILL.md) to preserve it. Decision Gate does not mutate task memory itself.

Do not broaden the answer, reinterpret it as approval for a different path, or continue past another separately controlled boundary.

Stop when one direct question has been asked and no answer exists, the answer does not resolve the material block, the appropriate decision owner is unavailable, or active evidence is required before a responsible choice can be framed. A supported wait, deferment, preservation boundary, or stop is a valid result.
