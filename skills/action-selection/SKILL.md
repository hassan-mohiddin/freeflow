---
name: "action-selection"
description: "Use when choosing or bounding an environment interaction, especially when the needed context, target, observer, or scope is uncertain, output may be broad, or recent actions have not advanced the current question."
---

# Action Selection

Choose one covered environment interaction that advances the current question or result, observe what it actually changes, and return the changed evidence to the current owner.

An environment interaction is a bounded tool-mediated observation or effect. A current activity can need several interactions; a tool call is not a task phase, Slice, or reason to change ownership.

Action Selection does not decide the user's outcome, work agreement, execution method, Slice, checkpoint, or Workflow route. It serves the owner responsible for those judgments and cannot accept the whole result.

## Identify The Immediate Need

Before touching the environment, identify what this interaction must answer or produce. Reuse evidence already available and current enough for that purpose.

The need may be:

- understanding the required outcome or reported symptom;
- establishing the mechanism, dependency, or approach;
- applying an understood change;
- observing whether a claim holds;
- reconstructing missing continuation state.

Use these purposes to focus the action, not to print phase labels or restart planning. Ask: what is the minimum sufficient context or effect for this next decision? Minimum means sufficient, not merely short.

Do not collect information because it may be useful later. Do not confuse the existence of a source or reference with having its necessary contents available.

## Take The Fast Path When The Action Is Known

Use the direct tool when the target, purpose, scope, and observing boundary are already supported and the action is covered, mechanical, and directly verifiable.

Examples include reading a known function or range, applying an exact selected edit, running an already-chosen focused check, or inspecting its resulting diff.

Do not manufacture alternative tools or repeat the action-selection method for an obvious continuation. A command being easy to run does not make its target or hypothesis well chosen.

## Compare Only Meaningful Alternatives

When the target, observer, or scope is uncertain, likely output is broad, the action is destructive, expensive, or difficult to recover, or recent work has stalled:

1. Identify the fact or effect the current owner needs.
2. Check whether existing evidence already supplies it.
3. Consider only a few materially different ways to obtain it.
4. Reject unchanged rereads, equivalent searches, eliminated approaches, and information without a current use.
5. Prefer the most direct action that distinguishes the plausible answers.
6. Among equally useful actions, prefer proportionate output, side effects, context residue, and recovery cost.
7. Execute the selected action once; choose the next interaction from its actual result.

Keep this comparison internal unless a user-owned choice is exposed. Do not emit candidate tables, numeric scores, simulated results, or a speculative sequence of tool calls.

A good observation can change the owner's belief or next action whether it supports or contradicts the leading explanation. An exact mutation can advance a settled result without testing a new hypothesis.

## Bound The Tool And Its Output

Use the simplest operation that can establish the required relationship:

- known file, symbol, artifact, or range -> focused read or operation;
- ownership, caller, or dependency question -> structured relationship query where available;
- literal or generated reference -> bounded content search;
- behavioral claim -> the owner's selected test, observer, or reproduction;
- understood effect -> narrow direct mutation;
- unknown location -> bounded discovery, then narrow from its result.

Choose scope before execution: directory, source kind, pattern, range, test target, time window, result count, fields, affected state, or recovery scope. Exclude unrelated history, generated output, and dependencies unless the current question needs them.

Use a location or count query before requesting all matching bodies when volume is uncertain. Prefer bounded output with an accessible full result. Truncation or a sampled result must remain explicit; it is not proof that omitted matches are irrelevant or that a search was exhaustive.

Context cost includes instructions, results, repeated material, and the capacity still needed for implementation, checking, correction, and continuation. Use host-supplied usage when available; do not invent token measurements or treat the provider maximum as a promise that a unit will fit.

The owner selects the work horizon. Return unexpectedly large context needs to it instead of reading the entire dependency tree or silently shrinking acceptance.

## Observe Before Continuing

After the interaction, determine:

- what actually ran or was returned;
- what changed in evidence, hypotheses, implementation, or task state;
- whether the intended question was answered or effect produced;
- which uncertainty, partial effect, or contradictory observation remains.

New content is not automatically useful evidence. A successful read is not understanding; a successful write is not correctness; a passing tool result is not proof of the wider claim. Return evidence to its owner for interpretation at the required boundary.

When a read settles the question, stop that investigation. Ordinary local continuation may be obvious; an invalidated implementation premise needs reassessment before dependent effects.

If the result did not advance the question, do not repeat it using synonyms, nearby files, a wider equivalent search, or another tool. Change the question or observer, or report the missing evidence.

When two or more recent interactions have not materially changed understanding, advanced the covered effect, or supported a new branch, read [Trajectory Stalls](references/trajectory-stalls.md) before another interaction.

## Return Without Expanding The Work

Return the observation and material state change to the same current owner. Action Selection does not transfer compute profiles, accept an implementation, or create authority.

When an experiment reveals a new prerequisite, report what it blocks: the current observer, chosen approach, or required outcome. Do not convert a blocked tool or prototype into permission to build a subsystem.

Use [Diagnose Failure](../diagnose-failure/SKILL.md) for unexplained repeated failures. Return changed authority, scope, ownership, direction, evidence boundary, or stop conditions to [Workflow](../workflow/SKILL.md).

Stop when the immediate need is satisfied, the active contract requires return, no useful covered interaction remains, or another activity must settle the next choice. Reuse adequate evidence instead of generating new calls to justify completion.

The goal is fewer low-value interactions while preserving sufficient evidence and the agreed outcome—not fewer calls at any cost.
