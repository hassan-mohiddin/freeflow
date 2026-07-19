---
name: workflow
description: Use when coordinating discussion, decisions, durable task memory, execution, verification, review, or a route change from feedback.
---

# Workflow

Use feedback to choose the smallest useful next action. Treat work as an **Interaction Lifecycle** with an internal **Feedback Loop**, not a fixed sequence.

The active agent owns understanding, routing, authorized work, verification, correction, and completion. Independent review may add judgment; it does not take over workflow control.

Read the [expanded Workflow loop](references/workflow-loop.md) when the complete lifecycle, skill relationships, or possible exits are unclear. Read [domain skill composition](references/domain-skill-composition.md) when specialized engineering guidance must run inside the active route.

## Interaction Lifecycle

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry begins with a user turn or new evidence interpreted through the Interaction Contract and effective mode. It may route directly to an answer, wait, deferment, or stop. When work is needed, Workflow enters the Feedback Loop and re-enters the narrowest owner until a supported exit exists.

## Choose The Owning Skill

- **Understand and decide:** [Discuss](../discuss/SKILL.md) shapes open or revisited direction; [Decision Gate](../decision-gate/SKILL.md) stops on one user-owned choice, source conflict, or material path change; [Bypass](../bypass/SKILL.md) reduces optional pressure inside an accepted action.
- **Preserve memory and artifacts:** [Track Work](../track-work/SKILL.md) owns living task state; [Write Spec](../write-spec/SKILL.md) owns stable accepted content; [Write Plan](../write-plan/SKILL.md) owns stable ordered strategy; [Review Artifact](../review-artifact/SKILL.md) owns artifact self-review and selected independent review.
- **Execute and learn:** [Execute Work](../execute-work/SKILL.md) owns bounded concrete changes; [Migration Work](../migration-work/SKILL.md) moves consumers, traffic, configuration, or data; [Diagnose Failure](../diagnose-failure/SKILL.md) establishes unsupported causes; [Verify Work](../verify-work/SKILL.md) checks factual claims; [Review Work](../review-work/SKILL.md) owns implementation self-review and selected independent judgment.
- **Preserve or close out:** [Commit Work](../commit-work/SKILL.md) owns authorized commits and pushes; [Handoff](../handoff/SKILL.md) transfers continuation context; [Finish Branch](../finish-branch/SKILL.md) owns branch integration or preservation; [Release Work](../release-work/SKILL.md) owns versioned publication; [Launch Work](../launch-work/SKILL.md) owns production deployment and rollout.

These are owners, not mandatory phases. Create no artifact or checkpoint merely because one exists. Method and domain skills compose inside the selected route without overriding accepted behavior, live evidence, or user authority.

## Run The Feedback Loop

For one bounded activity:

1. Orient to accepted intent, relevant task memory, and live evidence.
2. Implement, test, observe, discuss, or otherwise use the owning skill.
3. Verify what the evidence proves.
4. When supported, self-review once for alignment, suitability, and unnecessary complexity.
5. Continue, correct, diagnose, revise, ask, defer, or stop from the result.

Self-review is silent and creates no formal judgment or cycle. Correct clear local issues and re-verify, then freeze the supported state. Freezing does not end a current Track Work slice; discussion, selected review, checkpoints, and accepted in-scope correction may continue inside it. Further polish, advisory warnings, and unrelated issues require another selected slice.

Handle only edge cases required by accepted behavior, observed evidence, or material safety. A stream of related patches routes to diagnosis of the shared requirement, cause, ownership, or interface.

Use Verify Work when the claim or evidence boundary needs its fuller method. Use Review Work for implementation self-review or selected independent work review, and Review Artifact for artifact review. Reading either review skill does not create independence.

If verification fails, correct a clear local defect or diagnose the cause; do not review unsupported work as ready. Continue while authority remains clear, evidence supports the route, no checkpoint is due, and remaining work converges.

## Discuss Before Execution

Before implementation or any other state-changing work, confirm that the concrete work was requested or approved and that the effective mode permits mutation. Settled direction alone is not execution authority. Then assess whether brief discussion has material decision value. Recommend Discuss when user input could materially change the outcome, boundaries, tradeoffs, approach, or acceptance. When architecture, interfaces, ownership, state, failure contracts, or spreading complexity shape that direction, use [Design for Depth](../design-for-depth/SKILL.md) as a lens during discussion and retain it while the boundary remains design-bearing. Name the question and why it matters, then wait.

Do not discuss facts that can be inspected, settled direction, or reversible local choices. If the user declines optional discussion and no owner decision, source conflict, or safety boundary remains, proceed within accepted scope. Do not ask again without new evidence. A discussion recommendation creates no artifact, checkpoint, slice, or implementation authority.

When no discussion or decision boundary remains, route the concrete work through Track Work and follow its result to Execute Work or wait.

## Preserve Context Deliberately

When discussion becomes task-shaped and continuity may matter, use Track Work to decide whether to recommend a Working Record.

Create durable memory only when forgetting would risk misalignment:

- a **Working Record** for living task state;
- a **Spec** for stable accepted content;
- a **Plan** for stable ordered strategy;
- an **ADR** for a surprising, hard-to-reverse repository decision;
- a **Handoff** for point-in-time transfer.

These artifacts are conditional and do not override contradictory live evidence or user decisions.

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, read its complete Working Record before the next task action and compare it with the current conversation and live state. Identify the record from context or inspect and ask rather than guessing. Another conversation branch may have written memory, not authority. Before an expected boundary, use Track Work to reconcile changed state.

Do not synchronize durable architecture, plugin, setup, or similar docs after every slice. Track their impact and update them once behavior stabilizes, unless earlier synchronization governs the next action or prevents real compatibility, safety, or coordination harm. Never close with a known required-doc inconsistency.

## Route Checkpoints And Review

At a supported boundary, assess whether a local commit would materially improve rollback, provenance, handoff, integration, or preservation before riskier work. A slice ending alone is insufficient. If useful but unapproved, recommend the exact purpose, scope, and due conditions, then wait; do not stage, commit, or push from the recommendation. When an approved checkpoint becomes due during execution, Execute Work uses Commit Work before continuing; Workflow may route directly for an explicit commit request or a due checkpoint outside execution. Push remains separately controlled. If the user declines, do not recommend the same checkpoint again without materially changed state.

Specs and Plans receive separate independent Review Artifact after author self-review. Working Records do not by default. Select independent work review for sensitive, hard-to-reverse, architecture-bearing, strongly interacting, plan-selected, or explicitly requested boundaries—not merely because a slice ended.

Independent review ends with Pass, Non-blocking, Inconclusive, or Blocking. The active agent adjudicates:

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owning activity, defer, or stop.

Review findings do not authorize edits. Ask once for every unapproved next action: accepted corrections plus any warranted focused follow-up review, or corrections alone when no follow-up is warranted. A review budget caps independent reviews but does not authorize another dispatch.

Return implementation corrections to Execute Work and artifact revisions to their owner. Keep the current slice when its intended result remains coherent and accepted scope can be verified as one unit. Before expanded work begins, decide and record whether it extends that slice or needs a distinct result, authority, or evidence boundary. Verify corrections and run a focused follow-up only when needed and authorized. Never create an automatic review-fix-review loop or keep editing merely to obtain Pass.

## Route From Evidence

- **Continue:** evidence supports the route.
- **Correct:** a clear local defect preserves intent and scope.
- **Broaden evidence:** the claim exceeds the check.
- **Diagnose:** cause is unclear or failure repeats.
- **Discuss:** new options or invalid assumptions change direction.
- **Track Work:** task memory or history must be reconciled.
- **Revise Spec:** accepted behavior, scope, contract, or failure semantics changed.
- **Revise Plan:** order, mechanism, dependencies, slices, or checks changed.
- **Decision Gate:** a user-owned choice or source conflict blocks progress.
- **Stop or defer:** no safe worthwhile continuation remains.

Preserve valid work and revise only the affected layer. Do not continue because implementation started or redesign because an ordinary mistake occurred.

## Reach A Supported Exit

A supported exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete the task. Use `Next:` only when a phase exit, completion, or blocker leaves one useful recommendation; it does not authorize action.

Claim completion only when fresh verification supports the outcome, self-review has no unresolved material issue, selected reviews are resolved, any Working Record is accurate, required durable artifacts are synchronized, and no user-owned decision or source conflict remains hidden.

Report the supported outcome, evidence, gaps, and route.
