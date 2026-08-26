---
name: "workflow"
description: "Use when authority, ownership, route changes, context recovery, selected checkpoints, or Supported Exit must be coordinated across Freeflow methods."
---

# Workflow

Own the outer Interaction Lifecycle. Establish authority, keep one owner for the current bounded activity, route from evidence, and decide when a Supported Exit is justified.

Workflow coordinates methods; it does not replace their detailed jobs. Selecting a skill, tool, artifact, review, or compute profile never widens authority.

## Enter Through Authority

Interpret the whole user turn and still-valid prior approval. Establish or confirm the authority envelope before consequential action.

Classify effects cumulatively:

- **Passive observation:** inspect existing evidence without exercising target behavior or intentionally changing task state.
- **Active evidence generation:** exercise target behavior to produce new evidence.
- **Mutation or delivery:** change repository, durable task or session, or external state.

A direct request authorizes its bounded outcome and entailed tools, checks, and reversible local choices. A Spec, Plan, task-memory artifact, review, recommendation, silence, or newly useful evidence does not create authority.

Before an uncovered action, return one bounded proposal:

```text
Purpose:
Action:
Expected evidence or result:
Stop condition:
```

Ask one direct authorization question and wait. Do not perform the proposed action or a dependent step while waiting.

## Choose One Owner

Choose the narrowest discoverable owner whose job matches the current need:

- **Understand and decide:** [Discuss](../discuss/SKILL.md), [Decision Gate](../decision-gate/SKILL.md), or [Bypass](../bypass/SKILL.md), with [Design for Depth](../design-for-depth/SKILL.md) as a lens when direction is design-bearing.
- **Preserve task state or accepted artifacts:** [Track Work](../track-work/SKILL.md), [Write Spec](../write-spec/SKILL.md), [Write Plan](../write-plan/SKILL.md), or [Review Artifact](../review-artifact/SKILL.md).
- **Execute and learn:** [Execute Work](../execute-work/SKILL.md), [Migration Work](../migration-work/SKILL.md), [Diagnose Failure](../diagnose-failure/SKILL.md), [Verify Work](../verify-work/SKILL.md), or [Review Work](../review-work/SKILL.md).
- **Preserve or close out:** [Commit Work](../commit-work/SKILL.md), [Handoff](../handoff/SKILL.md), [Finish Branch](../finish-branch/SKILL.md), [Release Work](../release-work/SKILL.md), or [Launch Work](../launch-work/SKILL.md).

These are owners, not mandatory phases. Keep the current owner while its question, authority, and evidence boundary remain coherent.

Recommend Discuss before authorized work only when user input could materially change the outcome, boundary, tradeoff, approach, or acceptance. Inspect facts and choose reversible local details without asking.

When the owner needs an environment interaction and the action or tool choice is not already obvious, use [Action Selection](../action-selection/SKILL.md). Return its observation and state change to the same owner.

Read [Domain Skill Composition](./references/domain-skill-composition.md) when specialized engineering guidance must operate inside the current owner.

## Run The Feedback Loop

For each bounded activity:

1. orient to accepted intent, the authority envelope, relevant task memory, and live evidence;
2. use the owner to discuss, preserve, implement, observe, verify, or judge;
3. determine what the result proves at the required evidence boundary;
4. after initial support, perform the stable self-review once;
5. correct a clear local defect inside existing authority and re-verify the affected boundary;
6. otherwise re-enter only the owner whose responsibility changed;
7. continue only while authority, evidence, checkpoints, and convergence support the route.

Do not review unsupported work as ready, continue because implementation began, or restart the task because one responsibility changed.

## Route From Evidence

- **Continue:** evidence supports the current owner and authority envelope.
- **Correct:** one clear local defect preserves accepted intent and effects.
- **Broaden evidence:** the claim exceeds the current observer.
- **Diagnose:** a cause is unclear or failure repeats.
- **Discuss:** options, assumptions, or direction materially changed.
- **Decision Gate:** a user-owned choice or source conflict blocks progress.
- **Track Work:** durable task state must be created, reconciled, or recovered.
- **Revise an artifact:** accepted content, strategy, decision, or handoff changed.
- **Verify Work:** a material claim needs fresh direct evidence.
- **Review:** selected judgment is needed after factual support.
- **Stop or defer:** no safe worthwhile continuation remains.

Preserve unaffected decisions, artifacts, work, and evidence. New evidence changes the route only where its consequence applies.

## Preserve Continuity Deliberately

Track Work owns a **Working Record** for durable task memory. Decide whether durable task memory is needed before routing to Track Work. Use it when losing decisions, evidence, authority, current work, blockers, or the next useful action could cause later misalignment. Do not create task memory for a short disposable action merely because work occurred.

After compaction, summarization, session navigation, or ownership transfer:

1. use the current runtime state and user turn;
2. recover the bounded current task view when one exists;
3. re-read an owning skill whose body is absent when its exact method still matters;
4. reopen only the accepted artifacts or exact history needed for the next decision;
5. compare memory with live repository or environment state;
6. re-establish authority from valid current-session sources.

When a Working Record exists after context loss, treat its recovery, reconciliation, and mutation as a bounded Track Work activity even when another method owns the surrounding outcome. Read Track Work before the first record operation, begin with its bounded `resume` view, and obtain the current command schema before mutation. Do not read the full record or reconstruct record commands from memory.

A summary, historical skill body, Working Record, Plan, or Handoff preserves context but does not become current authority or live source truth.

## Route Reviews And Checkpoints

Select a checkpoint only when it materially protects dependent work, rollback, provenance, transfer, integration, or delivery. Examples include a user decision, independent review, local commit, handoff, integration, release, or launch. Do not select one merely because work paused or a bounded activity ended.

Self-review belongs to the Feedback Loop and is not a checkpoint. Use Review Work for implementation or integrated work. Use Review Artifact for a Working Record, Spec, Plan, decision record, handoff, or another durable guide.

An independent reviewer reports without editing. The active agent adjudicates every material finding against source truth and evidence:

- **Accept:** the problem is supported and applicable.
- **Reject:** the item is stale, duplicate, resolved, preference-only, out of scope, or unsupported.
- **Open:** evidence or a user decision is missing.

Review methods return:

- **Pass:** continue within existing authority.
- **Non-blocking:** continue with explicit deferrals.
- **Inconclusive:** obtain the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owner, defer, or stop.

A finding, judgment, suggested remedy, or useful checkpoint does not authorize correction or continuation. Establish the problem, consequence, remedy basis, verification boundary, and authority before acting.

When findings interact, assumptions are challenged, materially different remedies remain, or user input could change the approach, report a problem checkpoint and stop before selecting a remedy.

A local commit, handoff, user decision, integration, push, release, or launch remains separately controlled unless the authority envelope explicitly covers it.

Do not create an automatic review–fix–review loop or keep editing merely to obtain Pass. Review skills own their exact role rules, item taxonomy, evidence lenses, reviewer contracts, reports, and cycle limits.

## Reach A Supported Exit

A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete.

Claim completion only when:

- fresh evidence supports the accepted outcome at the required boundary;
- every completed bounded activity crossed self-review with no unresolved material issue;
- selected reviews and checkpoints are resolved;
- task memory and required artifacts are accurate;
- no material contradiction, source conflict, or user-owned decision remains hidden;
- no separately controlled action is being implied as complete.

Report the outcome, evidence, proof limits, unresolved gaps, and current route. A recommendation for a next action does not authorize it.

## Stop

Stop Workflow when a Supported Exit is reached or one owner can continue without an unresolved authority, ownership, checkpoint, or route question. Resume it only when feedback changes one of those boundaries.
