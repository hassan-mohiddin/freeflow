---
name: "action-selection"
description: "Use when choosing or bounding an environment interaction, especially when the needed context, target, observer, or scope is uncertain, output may be broad, or recent actions have not advanced the current question."
---

# Action Selection

Choose environment interactions that advance the current question or result, observe what they actually change, and return the changed evidence to the current owner.

An environment interaction is a bounded tool-mediated observation or effect. A current activity can need many of them; a tool call is not a task phase, a Slice, or a reason to change ownership.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Action Selection serves the current owner. It never changes the outcome, work agreement, execution method, scope, Slice, Checkpoint, or route, accepts no result, and an available tool grants no authority. Return changed authority, scope, ownership, direction, evidence boundary, or stop conditions to [Workflow](../workflow/SKILL.md).
- Never present a simulated, predicted, sampled, or truncated result as a complete observation. State truncation and sampling explicitly; a partial result does not show that omitted matches are irrelevant or that a search was exhaustive.
- Never report an interaction's success as proof of a wider claim. A successful read is not understanding, a successful write is not correctness, and a passing tool result is not the claim it was meant to support; return the evidence for interpretation.
- Do not emit candidate tables, scores, or speculative tool-call sequences unless a user-owned choice is exposed.

## Know What The Step Must Establish

Goal: every interaction answers a question the owner actually has.

Before touching the environment, identify what the interaction must answer or produce, and reuse evidence already available and current enough for that purpose. The need may be understanding the outcome or symptom, establishing a mechanism or dependency, applying an understood change, observing whether a claim holds, or reconstructing missing continuation state. Use these to focus the action, not to print phase labels or restart planning.

Aim for the minimum sufficient context or effect for the next decision; minimum means sufficient, not merely short. Do not collect information because it may be useful later, and do not mistake a source or reference existing for its contents being available.

## Run Settled Steps; Select Uncertain Ones

Goal: spend judgment where the next step is genuinely open, and none on steps that are already decided.

When the target, purpose, scope, and observing boundary are supported and the action is covered and directly checkable, act directly: read a known function or range, apply a selected edit, run a chosen focused check, inspect its diff.

When the owner's route or [Execute Work](../execute-work/SKILL.md)'s forecast already fixes a sequence, run the sequence without reconsidering each call. Issue independent reads together, apply coupled edits before their shared check, and run that check once. Select again only when a result contradicts the forecast, is unexpected, or opens a new question.

Select deliberately when the target, observer, or scope is uncertain, the likely output is broad, the action is destructive, expensive, or hard to recover, or recent work has stalled:

1. Identify the fact or effect the owner needs.
2. Check whether existing evidence already supplies it.
3. Consider only a few materially different ways to obtain it.
4. Reject unchanged rereads, equivalent searches, eliminated approaches, and information with no current use.
5. Prefer the most direct action that distinguishes the plausible answers.
6. Among equally useful actions, prefer proportionate output, side effects, context residue, and recovery cost.
7. Execute it, then choose what follows from the actual result.

Keep this comparison internal. A command being easy to run does not make its target or hypothesis well chosen. A good observation can change the owner's belief or next action whether it supports or contradicts the leading explanation; an exact mutation can advance a settled result without testing a hypothesis.

## Bound The Tool And Its Output

Goal: get the needed evidence at the lowest total cost, counting what the output costs after it arrives.

Everything an interaction returns stays in context and is paid for again on every later turn until compaction, so one broad read can cost more than several focused ones. Each separate call also costs a model turn, so batching independent calls saves turns. Weigh both.

Use the simplest operation that can establish the required relationship:

- known file, symbol, artifact, or range -> focused read or operation;
- ownership, caller, or dependency question -> structured relationship query where available;
- literal or generated reference -> bounded content search;
- behavioral claim -> the owner's selected test, observer, or reproduction;
- understood effect -> narrow direct mutation;
- unknown location -> bounded discovery, then narrow from its result.

Choose scope before running: directory, source kind, pattern, range, test target, time window, result count, fields, affected state, or recovery scope. Exclude unrelated history, generated output, and dependencies unless the question needs them. When volume is uncertain, run a location or count query before requesting all matching bodies, and prefer bounded output with an accessible full result.

When Runtime State shows Tool Execution active, recover exact captured output with `freeflow_result` instead of rerunning its command, and use a `freeflow_run` program when a settled loop over many results (filter, parse, compare, aggregate) would otherwise take many model turns. A program runs known steps; return to ordinary calls when a result needs a new decision.

Use host-supplied usage when available; do not invent token counts or treat the provider maximum as a promise that the work will fit. The owner chooses the work horizon: return an unexpectedly large context need to it instead of reading the whole dependency tree or silently shrinking acceptance.

## Observe Before Continuing

Goal: know what changed before deciding what comes next.

After an interaction, establish what actually ran or was returned, what changed in evidence, hypotheses, implementation, or task state, whether the intended question was answered or effect produced, and what uncertainty, partial effect, or contradiction remains. New content is not automatically useful evidence.

When a read settles the question, stop that investigation. An invalidated implementation premise needs reassessment before dependent effects; ordinary local continuation can proceed.

## Notice A Stall Early

Goal: stop spending interactions that no longer change anything.

If an interaction did not advance the question, do not repeat it with synonyms, nearby files, a wider equivalent search, or another tool with the same evidence relationship. Change the question or the kind of observer, or report the missing evidence.

The common stalls are rerunning a check against unchanged state, rereading an unchanged source without a new question, widening a search without narrowing the hypothesis, and alternating edits, failures, and reversions without a supported cause. When two or more recent interactions have not changed understanding, advanced the covered effect, or supported a new branch, read [Trajectory Stalls](references/trajectory-stalls.md) before another interaction.

For unexplained repeated failure, use [Diagnose Failure](../diagnose-failure/SKILL.md).

## Return

Return the observation and material state change to the same owner. Stop when the immediate need is satisfied, the active contract requires return, no useful covered interaction remains, or another activity must settle the next choice. Reuse adequate evidence instead of generating new calls to justify completion.

The goal is fewer low-value interactions while preserving sufficient evidence and the agreed outcome, not fewer calls at any cost.
