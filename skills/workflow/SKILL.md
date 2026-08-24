---
name: workflow
description: Use when coordinating discussion, decisions, durable task memory, execution, verification, review, or a route change from feedback.
---

# Workflow

Use feedback to choose the smallest useful next action. Treat work as an **Interaction Lifecycle** with an internal **Feedback Loop**, not a fixed sequence.

The active agent owns understanding, routing, authorized work, verification, correction, and completion. It adjudicates selected review. Keep one owner for the current activity; methods, domain guidance, and independent judgment do not take over workflow control.

Read [Workflow edges](references/workflow-edges.md) when work changes authority, crosses owners, resumes after context loss, or reaches a selected review or checkpoint. Read [domain skill composition](references/domain-skill-composition.md) when specialized engineering guidance must operate inside the active route.

## Enter Through Authority

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

At Entry, interpret the whole user turn and valid prior approval through the effective mode, then establish the current **authority envelope**: requested outcome, permitted effects, evidence boundary, and stop condition.

Classify effects cumulatively:

- **Passive observation:** inspect existing evidence or sources without exercising target behavior or intentionally changing task state.
- **Active evidence generation:** exercise target behavior to produce new evidence.
- **Mutation or delivery:** change repository, durable task or session, or external state.

When an action has multiple effects, apply the strongest relevant authority and mode boundary. Mode and skill selection choose or constrain the method; they do not widen authority.

A direct request authorizes an action when its requested outcome entails that action and its effects. Explicit approval may authorize a proposed action or checkpoint. A user-approved Spec or Plan establishes direction unless its approval also authorizes execution. A Working Record preserves authority but cannot create it.

Passive observation may support an answer when safe and relevant. Before uncovered active evidence generation, mutation or delivery, or another separately controlled action, state its exact purpose, expected evidence or result, and stop condition; ask one direct authorization question; then wait. Do not perform the proposed action, dispatch, or dependent next step while waiting.

Authorization covers the bounded outcome and its entailed tool calls, tests, verification, and reversible local choices. Ask again only when the outcome, permitted effects, evidence boundary, stop condition, or separately controlled action changes. Settled direction, recommendations, review findings, silence, task memory, and new evidence do not widen the envelope. New evidence supports reporting and routing; it does not by itself authorize correction or another lifecycle stage.

## Choose One Owner

Entry may answer, wait, defer, or stop directly. When work is needed, choose the narrowest owner:

- **Understand and decide:** [Discuss](../discuss/SKILL.md), [Decision Gate](../decision-gate/SKILL.md), or [Bypass](../bypass/SKILL.md), with [Design for Depth](../design-for-depth/SKILL.md) when direction is design-bearing.
- **Preserve memory or accepted artifacts:** [Track Work](../track-work/SKILL.md), [Write Spec](../write-spec/SKILL.md), [Write Plan](../write-plan/SKILL.md), or [Review Artifact](../review-artifact/SKILL.md).
- **Execute and learn:** [Execute Work](../execute-work/SKILL.md), [Migration Work](../migration-work/SKILL.md), [Diagnose Failure](../diagnose-failure/SKILL.md), [Verify Work](../verify-work/SKILL.md), or [Review Work](../review-work/SKILL.md).
- **Preserve or close out:** [Commit Work](../commit-work/SKILL.md), [Handoff](../handoff/SKILL.md), [Finish Branch](../finish-branch/SKILL.md), [Release Work](../release-work/SKILL.md), or [Launch Work](../launch-work/SKILL.md).

These are owners, not mandatory phases. A linked skill does not run automatically, and selecting a method creates no authority.

Before authorized work begins, recommend Discuss only when user input could materially change the outcome, boundary, tradeoff, approach, or acceptance. Name the question and wait. Inspect facts and choose reversible local details without asking. If the user declines optional discussion, do not ask again without new evidence.

## Run One Feedback Loop

For every bounded activity—whether the whole task, a slice, a subtask, an artifact revision, or a small local change:

1. Orient to accepted intent, the authority envelope, relevant task memory, and live evidence.
2. Use the owning skill to discuss, preserve, implement, test, observe, verify, or review.
3. Determine what the result proves at the required boundary.
4. Once initial evidence supports the result, self-review the resulting state once for alignment, suitability, and unnecessary complexity.
5. Only then treat the activity as supported, use its result as the basis for later work, or claim it complete.
6. Continue, correct, diagnose, revise, ask, defer, or stop from the result.

Self-review is required at each such boundary. It is silent, remains inside the authorized activity rather than creating another activity or review cycle, creates no formal judgment, and does not widen authority. Correct clear local issues required by the accepted outcome within the authority envelope, re-verify the affected boundary, confirm the final state has no unresolved material issue, then freeze it. Return ambiguous, non-local, route-changing, or out-of-envelope issues to Workflow. Further polish, advisory warnings, and unrelated issues require another selected action.

If evidence fails or contradicts the claim, correct a clear local defect or use Diagnose Failure when the cause is unsupported or repeats. Do not review unsupported work as ready. Handle only edge cases required by accepted behavior, observed evidence, or material safety. A stream of related patches routes to the shared requirement, cause, ownership, or interface.

Continue only while the authority envelope still covers the work, evidence supports the route, no checkpoint is due, and the work converges.

## Preserve Only Necessary State

Decide whether a Working Record is needed before routing to Track Work. Discuss makes this assessment while it owns the route; Workflow may route directly when a clear task's need is already established. Use a Working Record only when losing current task state would risk later misalignment.

Create other durable artifacts only for their own jobs: a Spec for stable accepted content, a Plan for stable ordered strategy, an ADR for a surprising hard-to-reverse decision, or a Handoff for point-in-time transfer.

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, re-read the owning skill when its body is absent. Reopen the smallest sources that establish current intent, constraints, route, authority, and expected evidence. Include the Working Record's bounded `resume` view when one exists. Compare memory with the current conversation and live state; do not reconstruct authority or progress from a summary or another conversation branch.

Synchronize durable architecture, plugin, setup, or similar documentation when stabilized behavior or dependent work requires it. Never finish with a known required-doc inconsistency.

## Control Reviews And Checkpoints

A local commit, independent review, correction, follow-up review, push, integration, release, or launch is separately controlled unless the authority envelope explicitly covers it. Recommend a local commit only when it materially improves rollback, provenance, handoff, integration, or preservation; a slice ending alone is insufficient.

Specs and Plans receive separate independent Review Artifact after author self-review. Working Records do not by default. Select independent work review for sensitive, hard-to-reverse, architecture-bearing, strongly interacting, plan-selected, or explicitly requested boundaries—not merely because work paused or a skill was read.

Independent review ends with **Pass**, **Non-blocking**, **Inconclusive**, or **Blocking**. The active agent adjudicates every material item against source truth and evidence:

- accept a supported and applicable problem, stating its consequence and remedy-basis status;
- reject a stale, duplicate, preference-only, or unsupported item, stating why;
- keep an item open when evidence or a decision is missing, stating the concern, potential consequence, and missing basis.

When the problem, consequence, bounded remedy, and verification are clear, state the adjudication and remediation-ready route together. When findings interact, assumptions are challenged, materially different remedies remain, or user input could change the approach, report a problem checkpoint and stop before selecting or applying a remedy.

Findings authorize neither correction nor follow-up review. Do not ask for correction authority before the remedy is supported. Use existing authority when it covers the remedy; otherwise state the correction, rationale, verification boundary, and any warranted focused follow-up, then ask once and wait. Return authorized corrections to Execute Work or the artifact owner. Never create an automatic review-fix-review loop or keep editing merely to obtain Pass.

## Route And Exit From Evidence

- **Continue:** evidence supports the current route inside the authority envelope.
- **Correct:** one clear local defect preserves accepted intent and effects.
- **Broaden evidence:** the claim exceeds the observing boundary.
- **Diagnose:** the cause is unclear or failure repeats.
- **Discuss:** new options or invalid assumptions change direction.
- **Track Work:** task memory or history must be reconciled.
- **Revise Spec or Plan:** accepted content or ordered strategy changed.
- **Decision Gate:** a user-owned choice or source conflict blocks progress.
- **Stop or defer:** no safe worthwhile continuation remains.

Preserve valid work and revise only the affected layer. A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete.

Claim completion only when fresh evidence supports the accepted outcome, every completed bounded activity has crossed its required self-review boundary with no unresolved material issue, selected reviews are resolved, task memory is accurate, required artifacts are synchronized, and no user-owned decision or source conflict remains hidden. Report the outcome, evidence, gaps, and route. Use `Next:` only when one useful recommendation remains; it does not authorize action.
