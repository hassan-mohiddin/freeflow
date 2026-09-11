---
name: track-work
description: "Use when ongoing work needs durable task memory, or when creating, recovering, maintaining, transitioning, or closing a Working Record."
---

# Track Work

Maintain one compact Working Record so the next context can reconstruct the intended outcome, current understanding, actual work, and remaining route. Preserve what still governs the task, not merely the path the agent happened to follow.

The record is memory, not authority, source truth, a Spec, a Plan, or a transcript. Reconcile it with current user direction, accepted artifacts, live evidence, and repository instructions before consequential action.

## Track When Continuity Matters

Use a record when losing decisions, dependencies, uncertainty, partial work, evidence, or the next useful action could misalign continuation. A multi-slice task or work likely to cross context boundaries normally needs this memory. A short self-contained result does not need a record merely because work occurred. Respect an explicit user choice not to create one; do not claim unpreserved state will survive context loss.

Use one ignored record per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

[Workflow](../workflow/SKILL.md) establishes record need, authority, current ownership, and the route that receives maintenance results. [Discuss](../discuss/SKILL.md) resolves open intent, alternatives, or task ownership. Track Work preserves supported meaning without taking over those judgments.

Only the user changes task state. An agreement may cover record maintenance and several Slices, but a proposal, recorded next action, or successful lifecycle command never authorizes implementation, active evidence generation, commit, publication, or another controlled effect.

## Keep The Existing Record Shape

Use the five Schema 4 sections in order:

1. **Current Context** — concise present understanding.
2. **Current Work** — one Current Slice or none, and one Next useful action.
3. **Future Work** — an ordered sequence of proposed Slices and non-terminal Checkpoints.
4. **History** — Decisions, terminal Checkpoints, and settled Slices, in that order.
5. **Notes** — inert task-local context.

Current Context and Notes are ordinary Markdown. Structured entities use compact field-list rows: `- Field: value` for one value, with two-space-indented nested bullets for multiple values. Expanded Schema 4 fields remain supported; do not mix layouts within an entity.

Read [Working Record Format](references/working-record-format.md) before editing structured content or preparing a lifecycle fragment. It owns the exact headings, fields, states, omission rules, and mechanical invariants. Do not add phase, context-cycle, delegation, global Evidence, or global Blocker sections.

Initialization creates every canonical heading. Supply a supported Goal, any known defining source or material Open question, task State, `Current Slice: None`, and one next action or honest wait condition. Preserve the material understanding that justified initialization; do not create an empty shell and lose it. If even the Goal and next action are unclear, return to discussion first.

`Last updated` is advisory: `init` and successful lifecycle commands maintain it; direct Markdown edits may leave it stale. It is not evidence that the record is semantically current.

## Recover The Whole Record After Context Loss

After compaction, summarization that replaces prior context, clear, session resume or navigation, a transfer into another context, or uncertain continuity, read `view full` before continuing task work. Read the complete canonical record, including History and Notes—not only the `resume` projection or a summary of it.

Use core recovery guidance and the active capability route for the read. Load this skill's current body when absent; an earlier reference to the skill is not its method.

If the tool truncates the record, continue bounded reads of the same canonical source until complete. If full recovery cannot be completed within the available context or access boundary, report the limitation and stop affected work. Do not silently substitute `resume`, summarize unseen History, or claim complete recovery from a pointer.

With intact context, use `view resume` when active-state readback is needed, or read the exact entity or changed section. Do not reread the whole record after every user turn, tool call, or Slice. A pause without context loss may need a freshness check, not full reconstruction.

The views do not change:

- `full` returns the complete canonical Markdown exactly as stored.
- `resume` shows the header, all Current Context, active Decisions derived from History, Current Work, Future Work, and Notes; it omits terminal History.

Both are Markdown text, not JSON. Neither follows external pointers nor mutates state. The name `resume` does not make that view sufficient after context loss. Once full recovery is complete, use bounded reads for later in-session questions.

## Reconcile Before Acting

From the record and applicable current sources, establish:

- the task State and Current Slice state;
- the agreed outcome, scope, and user-facing return condition;
- active Decisions, amendments, and relevant supersession;
- pending or deferred Checkpoints;
- actual completed and partial effects, evidence limits, and contradictions;
- prerequisites for the next work and whether they actually hold;
- the Next useful action and authority covering it.

Compare Current Context, Current Work, Future Work, and relevant History. A closed Slice and a present-state summary saying it never started cannot both govern continuation. Resolve the discrepancy from source evidence; do not choose whichever statement permits progress. Distinguish the current assignment from superseded instructions: an earlier correction plan must not replace a later read-only inspection. Retrieve the exact direction when its wording matters; a record cannot settle compute-routing state.

A full record read reconstructs recorded memory, not the live environment or every linked source. Reopen defining artifacts and relevant code, configuration, worktree, process, or evidence state only where freshness or exact meaning affects the next action. Reuse still-supported evidence instead of repeating the whole investigation.

A record from another conversation branch remains memory and does not transfer branch-local authority. Current user direction may supersede a recorded decision; record presence cannot settle a conflict or grant permission.

If the schema is unsupported or the record is malformed, inspect it read-only through `full` and stop before edits or transitions. Migration or repair is a separate authorized operation, not an inferred recovery step.

## Keep Intent And Approach Distinct

Use exactly the seven Current Context headings:

- **Goal:** the intended outcome or central question, not the current mechanism.
- **What defines this task:** accepted artifacts, user decisions, constraints, and governing source pointers.
- **Settled:** supported present facts and accepted understanding.
- **Tentative:** hypotheses and provisional approaches.
- **Open:** unresolved questions capable of changing the work.
- **Current direction:** the remaining approach and why it is currently useful, not a completed-work narrative.
- **Boundaries:** scope exclusions, evidence limits, user-facing return conditions, and separately controlled effects.

Preserve the execution agreement in these existing fields and the Current Slice declaration where applicable. Do not invent a second contract entity. Keep Decision rationale in History and completed-event detail with its Slice rather than duplicating both in Settled.

Update only meaning that changed. Before recording a new prerequisite as required, check whether it follows from accepted behavior, a supported local approach, or an unaccepted stronger guarantee. Keep proposals and hypotheses tentative; authorization to investigate an option is not acceptance of its production consequences.

When an accepted amendment or new evidence changes the route, reconcile affected Current Context, Current Work, Future Work, and the Next useful action. Identify any defining Spec or Plan that now conflicts and return it to its owner before dependent use. Do not silently rewrite that artifact or let the record override it.

## Preserve A Provisional Remaining Route

When a useful rough strategy emerges and record maintenance is covered, propose Slices and record material dependencies. Do not wait for an exhaustive Plan, and do not invent distant steps merely to fill Future Work.

A proposed Slice needs a unique title, `State: proposed`, and Intended result. Use optional Type, Expected evidence, and Dependencies when useful. It has no durable ID or execution authority. Keep near-term work concrete and later work directional; proposed order recommends a route and may change as evidence arrives.

Size Slices by coherent outcomes, dependencies, uncertainty, and manageable working context for implementation, checking, and correction. Seven bugs do not imply seven Slices or one Slice solely because all are bugs. Do not split by tool call, file, test, review, or context-cycle count.

Before selecting later work, compare its dependencies with the actual preceding result and current agreement. Mark unresolved assumptions honestly rather than implying they were proved by closing a Slice. Preserve or revise the proposed route; do not quietly adopt new obligations because they appear next in the record.

A whole-task agreement may cover several Slices. Workflow can select covered work without another user confirmation, but Track Work must still perform the appropriate start transition. Ending an internal activity or context cycle does not select the next Slice.

## Edit Meaning Directly; Use Commands For Lifecycles

Use ordinary Markdown edits for allowed semantic content:

- Current Context bullets;
- allowed wording and optional fields in active or proposed blocks;
- proposed-item order or removal;
- the Next useful action;
- Material updates and Notes;
- clerical clarification of active prose;
- the format's linked clerical correction block in terminal History.

Never directly change an entity's durable ID, lifecycle state, kind, or owning top-level section. Do not delete, reactivate, or erase terminal History. A correction preserves the old value rather than pretending it never existed.

Prose-only bullet edits need no extra validation. After editing headings, fields, references, or other structured blocks, run `validate --record` before consequential work. Lifecycle commands validate their source and candidate.

Use [working-record.mjs](scripts/working-record.mjs) for initialization, proposals, ID allocation, Slice/Checkpoint transitions, Decision addition/supersession/retirement, and user-directed task-state changes. Commands own placement, identity, legal transitions, complete multi-block movement, and atomic publication; the agent supplies the meaning.

Read the format reference, then complete operation help as `working-record.mjs <group> <operation> --help` before preparing a fragment. Use `--input -` for agent-authored Markdown through stdin. Slice and task-state transitions require an agent-supplied Next useful action; Checkpoint operations may update it when supplied. Do not inspect `scripts/lib/` unless diagnosing a concrete defect.

A command must publish one complete valid transition or none. If its result is uncertain, stop and inspect `full` before retrying or editing related state. Do not duplicate an entity to recover from an unknown result.

## Start And Maintain One Current Slice

Keep implementation, learning, verification, review, and accepted correction in the same Slice while the intended result, authority, evidence boundary, and independently useful outcome remain coherent. Use a new Slice when those boundaries materially change.

For selected Future Work, start its proposal. For an immediately authorized outcome that needs no proposal ordering, use `slice start-direct`; it does not consume or change Future Work. Never disguise proposal selection as a direct start.

Starting assigns a new `S-NNN` and persists the detailed Current Slice before execution. Include authority source, scope, expected evidence, stop condition, and starting state. Do not begin Slice work until the transition has successfully persisted and validated both Current Slice and Next useful action. Return successful start or reopen to [Execute Work](../execute-work/SKILL.md); persistence is not implementation authority.

```text
Future proposed
-> Current in_progress
<-> Current paused
-> History completed | blocked | abandoned
```

- `in_progress`: the selected outcome is being pursued.
- `paused`: it remains current, but safe continuation is suspended; an ordinary turn or feedback is not a pause.
- Historical `blocked`: an unresolved paused attempt deliberately left Current Work; close this way only from paused.
- Historical `completed`: the intended result and required evidence are settled.
- Historical `abandoned`: explicit authority ends pursuit; preserve the reason.

Append Material updates only when losing the change would impair safe continuation or truthful closure. Preserve material evidence, failed approaches, contradictions, accepted extensions, pauses/resumptions, review outcomes, and residual effects. Routine commands and test counts are not events to record.

Before expanded work, record the accepted extension's authority, scope, evidence boundary, and changed stop condition where applicable. A finding or suggestion does not authorize the extension.

A material evidence entry names the claim, observing boundary, result, what it proves and does not prove, and a real pointer when available. Preserve enough existing code/artifact, check, or output identity to distinguish it from a later candidate. Record separately that a check ran and whether its result still applies after relevant edits. A missing output is unavailable evidence, not proof the earlier run never occurred.

Do not record a requested correction as performed or a producer's unsupported report as observed acceptance. Keep implemented work, exercised assertions, and unresolved claims distinguishable. Append later counterevidence rather than rewriting the earlier observation. Keep evidence and blockers with their Slice, not global sections.

For learning, preserve the question, observed result, limits, and consequence for the remaining route. Do not record a working prototype as accepted production behavior. A failed hypothesis may complete a learning Slice when its question and evidence boundary are settled.

## Settle Without Losing Continuation

Before closing as completed, ensure every material claim has supporting evidence at its required boundary, live state agrees, no authority conflict or material contradiction remains, and every applicable Checkpoint is terminal. A `pending` or `deferred` Checkpoint prevents Slice closure.

Closure distills the declaration and Material updates into historical Intended result, Result, Evidence and limits, and Task effect, with other fields required by the format. Preserve an unresolved block, relevant failed attempt, or residual effect rather than copying the full active log or hiding it. A blocked Slice records what permits resumption; an abandoned Slice records its reason.

Closing leaves Current Slice `None` and does not select another Future Work item. Reconcile the next useful action with the actual result and agreement.

Resuming returns a Current paused Slice to `in_progress` with a resolution source. Reopening historical completed or blocked work creates a new Current Slice and fresh ID with `Reopened from: S-old`, current authority, scope, expected evidence, stop condition, and starting state. Do not reactivate the historical entry.

## Preserve Checkpoints And Decisions

Every Checkpoint belongs to one Slice, with a unique title across Future Work:

```text
proposed -> pending <-> deferred
pending | deferred -> completed | cancelled | replaced
```

A proposed Checkpoint has no durable ID or authority and may be removed without History. Activate only an explicitly selected or authorized boundary; activation assigns `C-NNN`. A proposed-Slice title in Applies to becomes its `S-NNN` in the Slice-start transition.

Accepted pending or deferred Checkpoints remain in Future Work until a lifecycle command makes them terminal. Deferred means accepted but dormant until its condition, not cancelled. Completed means the boundary occurred; its judgment can still be adverse. Cancelled means no longer required; replaced identifies the pending replacement. Do not silently drop an accepted Checkpoint.

Decisions live in History and receive `D-NNN`:

```text
active -> superseded | retired
```

Record the choice and acceptance actually supported by the source, with rationale, consequences, and revisit condition. Preserve source references when needed to distinguish a proposal from what the user accepted. A clerical clarification may edit an active Decision without changing meaning. A material change creates a new Decision and supersedes the old one; retirement records why the choice no longer governs. Terminal Decisions stay terminal. Adopting an old choice again creates a new active Decision.

## Prepare For A Context Boundary

Before expected compaction, clear, pause, or transfer, reconcile the record when material state changed. Preserve what a fresh continuation needs:

- the agreed outcome and return boundary;
- actual completed and partial work, evidence limits, and residual effects;
- active assumptions, important rejected approaches, and contradictory findings;
- the current assignment's scope and source, including superseded stopping instructions that could misdirect continuation;
- existing evidence pointers, the state examined, and any subsequent changes leaving applicability unresolved;
- remaining dependencies and one next useful action, including the sources it needs.

Use the existing sections, not a new handoff embedded in the record. Do not rush to complete a Slice before compaction, claim an unfinished check passed, or infer the outcome of a running operation. Preserve uncertainty and use the host's safe boundary.

A context boundary is not itself a History event, Evidence item, Checkpoint, or Slice transition. Pause the Slice only when safe continuation is actually suspended. Full recovery afterward reconstructs persisted meaning; it cannot recover understanding never written down.

## Keep Task State User-Controlled And Notes Inert

Task states remain:

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active only by explicit user reopening
```

Only the user changes task state; closing a Slice does not complete the task. Pausing a task pauses its Current Slice first. Reactivating the task does not automatically resume the Slice. Completed or abandoned tasks require Current Slice `None` and no pending or deferred Checkpoint. Retain proposed Future Work only when clearly non-obligating; otherwise reconcile it before a terminal transition. Task reopening does not select work.

Notes are ordinary inert Markdown. They do not authorize, prioritize, schedule, block, prove, or require follow-up. Remove a user-authored Note only at the user's request; remove other Notes only when current maintenance authority covers the correction. Do not use Notes to hide operative scope, evidence, or blockers.

## Return To The Requesting Activity

After maintenance, return to the activity that requested it. Discussion returns to Discuss; authorized Slice work returns to Execute Work. [Handoff](../handoff/SKILL.md) owns point-in-time transfer. [Write Spec](../write-spec/SKILL.md) and [Write Plan](../write-plan/SKILL.md) own durable content and strategy artifacts.

End Track Work when the record accurately preserves supported current meaning, actual work, the provisional remaining route, and one next useful action. A record update does not complete implementation, verification, review, delivery, or the task.

Stop rather than invent missing authority, scope, evidence, record structure, or transition meaning. Report discrepancies and return their resolution to the owning activity; memory must not make an unsupported trajectory look settled.
