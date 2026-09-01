---
name: "workflow"
description: "Use when authority, current ownership, route changes, continuity, selected checkpoints, or Supported Exit must be coordinated across Freeflow activities."
---

# Workflow

Own the outer Interaction Lifecycle. Interpret and enforce authority, keep one current owner for each bounded activity, route only when evidence changes responsibility, select checkpoints deliberately, and determine when a Supported Exit is justified.

Workflow does not create authority or supervise every action. It coordinates owners and methods without replacing their detailed jobs.

Selecting a skill, method, lens, tool, artifact, review, checkpoint, domain guide, or compute profile never widens authority or changes the current owner automatically.

## Enter Through Authority

Interpret the whole user turn, current runtime state, and still-valid prior approval before consequential action.

Classify effects cumulatively when one activity contains more than one kind, using the Shared Terms definitions for passive observation, active evidence generation, and mutation or delivery.

A direct request authorizes its bounded outcome and entailed tools, checks, and reversible local choices. It does not authorize unrelated cleanup, another outcome, a separately controlled effect, or an action whose consequence could materially change the user’s choice.

A Spec, Plan, Working Record, Handoff, review, recommendation, checkpoint, useful evidence, or silence may constrain or preserve work. None creates authority.

Before active evidence generation, mutation, delivery, or another separately controlled action not covered by current authority, tell the user why it is needed, exactly what will happen, what evidence or result it should produce, and where it will stop. Ask one direct authorization question and wait. Do not perform the proposed action or dependent work while waiting.

When authority, accepted intent, or the effect boundary is unclear, resolve that boundary before selecting an execution owner.

## Choose And Keep One Current Owner

Choose the narrowest discoverable owner whose job matches the current bounded activity. The categories below are common owners, not an exhaustive list.

### Understand or decide

- [Discuss](../discuss/SKILL.md) for materially open direction, alternatives, assumptions, or tradeoffs.
- [Decision Gate](../decision-gate/SKILL.md) for one blocking user-owned choice or source conflict.

Use [Design for Depth](../design-for-depth/SKILL.md) as a lens when direction is design-bearing. A lens does not become the current owner.

### Produce, preserve, or judge durable state

- [Track Work](../track-work/SKILL.md) for Working Record creation, recovery, reconciliation, and lifecycle.
- [Write Spec](../write-spec/SKILL.md) for stable accepted content or contracts.
- [Write Plan](../write-plan/SKILL.md) for stable ordered execution strategy.
- [Review Artifact](../review-artifact/SKILL.md) for judgment of a durable guiding artifact.

### Execute, investigate, verify, or judge work

- [Execute Work](../execute-work/SKILL.md) for concrete implementation, documentation, configuration, learning, or maintenance.
- [Migration Work](../migration-work/SKILL.md) for moving consumers, state, or traffic between paths.
- [Diagnose Failure](../diagnose-failure/SKILL.md) for unexplained or repeated failure.
- [Verify Work](../verify-work/SKILL.md) for determining what direct evidence proves.
- [Review Work](../review-work/SKILL.md) for implementation judgment, independent review, or adjudication.

[TDD](../tdd/SKILL.md), [Simplify Code](../simplify-code/SKILL.md), domain guidance, references, and tools may supply the current owner’s method without becoming another owner.

### Preserve, checkpoint, integrate, or deliver

- [Commit Work](../commit-work/SKILL.md) for an authorized local commit or simple push.
- [Handoff](../handoff/SKILL.md) for point-in-time continuation transfer.
- [Finish Branch](../finish-branch/SKILL.md) for integration, preservation, discard, or branch closeout.
- [Release Work](../release-work/SKILL.md) for versioned publication.
- [Launch Work](../launch-work/SKILL.md) for production exposure, rollback, or recovery.

### Apply modifiers and interaction control

[Bypass](../bypass/SKILL.md) modifies explicitly selected optional Workflow pressure. It does not become the owner of the underlying activity.

When the owner needs an environment interaction and the action or tool choice is not already obvious, use [Action Selection](../action-selection/SKILL.md). It returns the observation and state change to the same current owner.

When specialized engineering guidance must support the current owner, read [Domain Skill Composition](references/domain-skill-composition.md).

Keep the current owner while its question, intended result, authority, and required observing boundary remain coherent. Methods, tools, feedback, profile transitions, and environment interactions do not create owner changes by themselves.

Recommend Discuss before authorized work only when user input could materially change the outcome, boundary, tradeoff, approach, or acceptance. Inspect available facts and choose reversible local details without unnecessary questions.

## Route From The Result

Run the guaranteed Feedback Loop through the current owner. Re-enter Workflow only when authority, ownership, required evidence, checkpoints, or the supported exit changes.

Route from what the result now supports:

- **Continue:** the current owner, intended result, authority, and required observing boundary remain coherent.
- **Correct locally:** one clear defect preserves accepted intent and effects; return it to the producing owner, re-verify the affected boundary, and self-review the corrected state.
- **Broaden evidence:** the claim exceeds the current observer; use Verify Work or return the missing evidence requirement to the current owner.
- **Diagnose:** the cause is unclear, evidence conflicts, or correction repeats.
- **Discuss:** assumptions, alternatives, strategy, or direction materially changed.
- **Decision Gate:** one user-owned choice or source conflict blocks safe continuation.
- **Track:** durable task state must be created, recovered, reconciled, or changed materially.
- **Revise an artifact:** accepted content, strategy, decision, or transfer state changed; return to that artifact’s owner.
- **Review:** selected judgment is needed after factual support.
- **Checkpoint:** a selected boundary is due before dependent work.
- **Stop or defer:** no safe, authorized, and worthwhile continuation remains.

Preserve unaffected decisions, artifacts, work, and evidence. New evidence changes the route only where its consequence applies.

Do not continue because implementation began, review unsupported work as ready, restart the task because one responsibility changed, or let a useful next action become implied authority.

## Preserve Continuity Deliberately

Decide whether losing current task state could cause later misalignment.

Use Track Work when decisions, evidence, authority, current work, blockers, checkpoints, or the next useful action need durable recovery. Do not create a Working Record for a short disposable activity merely because work occurred.

When a Working Record exists after compaction, summarization, session navigation, or ownership transfer:

1. route record recovery and reconciliation through Track Work;
2. compare recovered memory with the current user turn and relevant live state;
3. return to the owner whose activity actually continues.

After recovery, re-read the current owner’s skill when its exact method is absent, reopen only the sources or history needed for the next decision, and re-establish authority from valid current-session sources.

Track Work owns record views, schemas, mutations, and lifecycle mechanics. Workflow does not reproduce them.

A summary, historical skill body, Working Record, Plan, or Handoff preserves context. It does not create current authority, prove live state, or become profile-routing state.

## Select And Route Checkpoints

Select a checkpoint only when crossing it unresolved could materially endanger dependent work, rollback, provenance, transfer, integration, or delivery.

A checkpoint may require:

- a user decision;
- selected independent review;
- a local commit;
- continuity transfer;
- branch integration;
- release;
- launch.

A pause, status update, bounded activity ending, completed implementation, passing check, or self-review does not create a checkpoint automatically.

Workflow selects the checkpoint and the boundary it protects. Its owner performs it. Track Work preserves its selection and result when durable memory exists.

Self-review remains part of the ordinary Feedback Loop and is never a checkpoint.

Review Work owns review roles, findings, adjudication, judgments, and cycle limits. Workflow consumes the returned result and decides what responsibility follows. A review report, finding, judgment, or suggested remedy does not authorize correction or another review.

When checkpoint evidence or conditions no longer hold, return the deviation rather than forcing the checkpoint. Cancel, replace, defer, or revise a selected checkpoint only through an explicit supported route, then reconcile durable state when present.

Do not create an automatic review–fix–review loop. Do not keep editing merely to obtain Pass.

A commit, handoff, integration, push, release, or launch remains separately controlled unless the authority envelope explicitly covers it.

## Reach A Supported Exit

A Supported Exit may answer, wait, pause, hand off, defer, preserve a controlled boundary, stop, or complete.

Claim completion only when:

- fresh evidence supports the accepted outcome at the required boundary;
- every completed bounded activity received required self-review with no unresolved material issue;
- selected reviews and checkpoints are resolved;
- task memory and required artifacts accurately describe the supported state;
- no material contradiction, source conflict, blocker, or user-owned decision remains hidden;
- no separately controlled action is being implied as complete.

Report proportionately:

- the supported outcome;
- strongest evidence and proof limits;
- material unresolved or deferred state;
- the current route when work continues or waits.

A recommendation for a next action does not authorize it.

## Stop

Stop Workflow when:

- a Supported Exit is reached; or
- one current owner can continue without an unresolved authority, ownership, checkpoint, continuity, or route question.

Resume Workflow only when feedback or evidence changes one of those boundaries.
