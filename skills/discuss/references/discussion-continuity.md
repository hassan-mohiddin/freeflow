# Discussion Continuity

Read this before preserving discussion across context loss, creating or updating durable task memory from discussion, or carrying a proposed or selected checkpoint beyond the current conversational context.

Discussion state is not automatically a Working Record, Spec, Plan, checkpoint, or authority.

## Keep It In Conversation When Possible

Keep state in chat when the current context can safely reach the next decision or action.

Summarize only what helps:

```text
Goal or question:
Current understanding:
Settled:
Tentative:
Open:
Evidence or alternatives that matter:
Recommended or accepted next action:
Authority or decision still needed:
```

Prefer natural prose. Use structured fields only when they prevent ambiguity or support a transition. Never emit empty or irrelevant fields.

Do not preserve a transcript, repeated rationale, rejected alternatives that no longer matter, or every discussion turn.

## Choose Durable Memory By Purpose

Use a durable destination only when losing the state could cause later misalignment:

- **Working Record:** evolving task state, current work, proposed outcomes, decisions, evidence pointers, checkpoints, blockers, and the next useful action.
- **Spec:** stable accepted behavior, boundaries, or content needs a tracked source.
- **Plan:** an accepted ordered execution strategy must survive independently.
- **ADR:** a surprising and hard-to-reverse repository decision needs durable rationale.
- **Handoff:** a point-in-time continuation package must transfer to another context or owner.
- **Domain documentation:** stable terminology or domain meaning belongs in an existing repository source.

Do not create an artifact merely because discussion occurred. Prefer an existing repository convention. Ask before inventing a tracked destination whose authority or ownership matters.

## Preserve Through Track Work

Discuss owns exploration and meaning. [Track Work](../../track-work/SKILL.md) owns the Working Record and its lifecycle.

```text
Discuss
-> supported state worth preserving
-> Track Work performs one atomic update
-> Discuss confirms the preserved meaning
-> continue discussion or return to Workflow
```

A Working Record is appropriate when:

- the task must survive compaction, pause, navigation, or transfer;
- decisions, evidence, blockers, authority, or the next action need reconstruction;
- one outcome may span implementation, verification, feedback, review, or correction;
- several proposed outcomes or dependencies must remain ordered without becoming authorized;
- a selected checkpoint must survive until its boundary is resolved.

Preserve only supported state that could affect later interpretation or action. Give each detailed fact one canonical owner. Track Work should store current meaning rather than append discussion chronology.

When the initial record need arises from discussion, preserve the state that justified the record in the first authorized atomic update. Do not create an empty shell and lose the decisions, proposals, or uncertainty that made continuity necessary.

After preservation, return to Discuss unless Workflow established another route. Record mutation does not transfer ownership or authorize execution.

## Carry Proposed And Selected Checkpoints

A possible checkpoint remains proposed in the current discussion until Workflow selects it.

For a proposed checkpoint, preserve only:

```text
Status: Proposed
Type:
Purpose:
Boundary it could protect:
Authority or selection still needed:
```

For a selected checkpoint, preserve:

```text
Status: Selected
Type:
Purpose:
Due boundary:
Condition:
Selection source:
Authority scope:
```

Persist checkpoint state through Track Work only when durable memory is needed. Keep local commit authority separate from push or integration, and keep migration, release, and launch separately controlled.

## Preserve Re-entry State

When evidence, feedback, or failure reopens discussion, preserve only the affected change:

```text
New evidence:
Assumption or direction affected:
What remains valid:
Decision, proposal, Slice, or artifact affected:
Question or bounded learning action now needed:
Authority or user decision needed:
```

Do not restart from zero, rewrite unaffected decisions, or narrate completed work.

After context loss, recover through Track Work’s prescribed view before relying on the record. Compare recovered memory with current user direction and live evidence. Reconcile only what current evidence changed.

## Stop

Stop preserving when the current meaning and one next useful action can be reconstructed safely.

Do not turn continuity into:

- a transcript;
- a mandatory artifact;
- a second source of authority;
- a frozen architecture;
- an automatic checkpoint;
- a reason to begin execution.
