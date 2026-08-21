---
name: workflow
description: Use when coordinating discussion, decisions, durable task memory, execution, verification, review, or a route change from feedback.
---

# Workflow

Use feedback to choose the smallest useful next action. Treat work as an **Interaction Lifecycle** with an internal **Feedback Loop**, not a fixed sequence.

The active agent owns understanding, routing, authorized work, verification, correction, and completion. It adjudicates selected review; independent judgment does not take over workflow control.

Read the [expanded Workflow loop](references/workflow-loop.md) when the complete lifecycle, skill relationships, or exits are unclear. Read [domain skill composition](references/domain-skill-composition.md) when specialized engineering guidance must run inside the active route.

## Route The Interaction

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry begins with a user turn or new evidence interpreted through the Interaction Contract and effective mode. It may route directly to an answer, wait, deferment, or stop. When work is needed, choose the narrowest owner:

- **Understand and decide:** [Discuss](../discuss/SKILL.md), [Decision Gate](../decision-gate/SKILL.md), [Bypass](../bypass/SKILL.md), with [Design for Depth](../design-for-depth/SKILL.md) when the direction is design-bearing.
- **Preserve memory or accepted artifacts:** [Track Work](../track-work/SKILL.md), [Write Spec](../write-spec/SKILL.md), [Write Plan](../write-plan/SKILL.md), and [Review Artifact](../review-artifact/SKILL.md).
- **Execute and learn:** [Execute Work](../execute-work/SKILL.md), [Migration Work](../migration-work/SKILL.md), [Diagnose Failure](../diagnose-failure/SKILL.md), [Verify Work](../verify-work/SKILL.md), and [Review Work](../review-work/SKILL.md).
- **Preserve or close out:** [Commit Work](../commit-work/SKILL.md), [Handoff](../handoff/SKILL.md), [Finish Branch](../finish-branch/SKILL.md), [Release Work](../release-work/SKILL.md), and [Launch Work](../launch-work/SKILL.md).

These are owners, not mandatory phases. Method and domain skills compose inside one active route without overriding accepted behavior, live evidence, or user authority.

## Authorize Or Wait

Before any state-changing or separately controlled action, identify the bounded action, confirm that the effective mode permits it, and establish its authority source. Authority may come from a clear direct request, explicit approval, or an action or checkpoint explicitly authorized through a user-approved Plan or discussion. An accepted Spec or Plan alone establishes direction, not execution authority. A Working Record may preserve authority but cannot create it.

If the action is not covered, recommend its exact purpose and scope, ask one direct authorization question, and wait for the user's response. Waiting means do not perform the proposed mutation, dispatch, or dependent next action. Mode, settled direction, a recommendation, review findings, silence, and task memory do not authorize work.

Authorization covers the bounded outcome, not each tool call. Do not ask again for contained edits, tests, verification, or reversible local choices. Ask again when the result, scope, evidence boundary, stop condition, or separately controlled action changes.

Before authorized work begins, recommend Discuss only when user input could materially change the outcome, boundary, tradeoff, approach, or acceptance. Name the question and wait. Use Design for Depth while the direction remains design-bearing. Inspect facts and choose reversible local details without asking. If the user declines optional discussion, do not ask again without new evidence. A discussion recommendation creates no artifact or slice.

## Run One Feedback Loop

For one bounded activity:

1. Orient to accepted intent, relevant task memory, and live evidence.
2. Use the owning skill to discuss, implement, test, observe, or otherwise act.
3. Verify what the evidence proves at the required boundary.
4. When supported, self-review once for alignment, suitability, and unnecessary complexity.
5. Continue, correct, diagnose, revise, ask, defer, or stop from the result.

Self-review is silent and creates no formal judgment or cycle. Correct clear local issues within authority, re-verify, then freeze the supported state. Freezing does not itself close a current Track Work slice; selected review, checkpoints, discussion, and accepted in-scope correction may continue inside it. Further polish, advisory warnings, and unrelated issues require another selected slice.

If verification fails, correct one clear local defect or diagnose an unsupported cause. Do not review unsupported work as ready. Handle only edge cases required by accepted behavior, observed evidence, or material safety. A stream of related patches routes to diagnosis of the shared requirement, cause, ownership, or interface.

Continue only while authority remains clear, evidence supports the route, no checkpoint is due, and the work converges.

## Preserve Necessary State

When authorized work is concrete and direction is settled, use Track Work to decide whether continuity needs a Working Record, then follow its result to Execute Work or wait. Create durable memory only when forgetting would risk misalignment: a Working Record for living task state, a Spec for stable accepted content, a Plan for ordered strategy, an ADR for a surprising hard-to-reverse decision, or a Handoff for point-in-time transfer.

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, re-read the owning skill if its body is absent from the current context; a summary that it was read earlier is not a substitute. Reopen the smallest set of sources that establishes the task's current intent, constraints, route, authority, boundaries, and expected evidence. Include the Working Record's bounded `resume` view when one exists, plus any accepted artifact or other source that establishes the work. Compare those sources with the current conversation and live repository state. Retrieve older history or exact entities only when the next decision requires them; do not reconstruct authority or progress from a summary alone. Another conversation branch may preserve memory, not authority.

Synchronize durable architecture, plugin, setup, or similar documentation when stabilized behavior or dependent work requires it—not after every slice. Never finish with a known required-doc inconsistency.

## Control Reviews And Checkpoints

A local commit, independent review, correction, follow-up review, push, integration, release, or launch is separately controlled unless existing authority explicitly covers it. At a supported boundary, recommend a local commit only when it materially improves rollback, provenance, handoff, integration, or preservation; a slice ending alone is insufficient. When a useful boundary is unapproved, recommend its exact purpose and scope, then wait; do not stage, edit, dispatch, or cross the boundary from the recommendation.

Specs and Plans receive separate independent Review Artifact after author self-review. Working Records do not by default. Select independent work review for sensitive, hard-to-reverse, architecture-bearing, strongly interacting, plan-selected, or explicitly requested boundaries—not merely because a slice ended. Reading a review skill does not create independence.

Independent review ends with **Pass**, **Non-blocking**, **Inconclusive**, or **Blocking**. The active agent adjudicates every material item rather than forwarding the report. For each accepted item, state the actual problem, consequence, and whether the remedy basis is supported or uncertain; note when a causal explanation is unnecessary. For each open item, state the concern, potential consequence, and missing evidence or decision. Then proceed, defer explicitly, gather what is missing, or stop before the blocked boundary.

When the problem, basis, bounded remedy, and verification are clear, include adjudication and remediation in the same assistant response. Otherwise, if findings interact, direction remains uncertain, accepted assumptions are challenged, materially different remedies remain, or user input could change the approach, use the current response for a problem checkpoint: report what is settled and open, name Discuss, Diagnose Failure, Decision Gate, evidence gathering, or the affected owner as the next route, then stop and wait. Continue remedy selection only when a later user turn or new evidence supplies enough support. Do not request correction authority before selecting the remedy or wait for the user to elicit the missing analysis.

A remediation-ready route states the correction or revision, rationale, verification boundary, whether focused follow-up is needed, and authority status. Findings are evidence, not commands, and authorize neither edits nor another dispatch. Use existing authority when it covers the result; otherwise ask once for the remedy, with a warranted focused follow-up or without one, then wait. Return authorized corrections to Execute Work or the artifact owner, verify them, and run follow-up only when needed and authorized. Never create an automatic review-fix-review loop or keep editing merely to obtain Pass.

## Route And Exit From Evidence

- **Continue:** evidence supports the current route.
- **Correct:** one clear local defect preserves intent and scope.
- **Broaden evidence:** the claim exceeds the check.
- **Diagnose:** the cause is unclear or failure repeats.
- **Discuss:** new options or invalid assumptions change direction.
- **Track Work:** task memory or history must be reconciled.
- **Revise Spec or Plan:** accepted content, contract, order, mechanism, dependencies, or checks changed.
- **Decision Gate:** a user-owned choice or source conflict blocks progress.
- **Stop or defer:** no safe worthwhile continuation remains.

Preserve valid work and revise only the affected layer. A supported exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete the task.

Claim completion only when fresh verification supports the outcome, self-review has no unresolved material issue, selected reviews are resolved, task memory is accurate, required artifacts are synchronized, and no user-owned decision or source conflict remains hidden. Report the outcome, evidence, gaps, and route. Use `Next:` only when one useful recommendation remains; it does not authorize action.
