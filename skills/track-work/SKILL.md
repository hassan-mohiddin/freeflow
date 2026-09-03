---
name: track-work
description: Use when ongoing work needs durable task memory, or when creating, recovering, maintaining, transitioning, or closing a Working Record.
---

# Track Work

Maintain one compact Working Record as the current projection of a task. It is memory, not authority, source truth, a Spec, a Plan, or a transcript. Current user direction, accepted artifacts, live evidence, and repository instructions override stale record content.

## Track Only When Continuity Matters

Use a record when losing current understanding, accepted decisions, future obligations, one active outcome, evidence, or the next useful action could misalign later work. Do not create one for a short disposable result merely because work occurred.

Use one ignored record per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

[Workflow](../workflow/SKILL.md) establishes record need, authority, ownership, and the route that receives the result. Use [Discuss](../discuss/SKILL.md) when intent, assumptions, alternatives, or task ownership are materially open. Track Work preserves accepted state and returns to that owning activity; it does not take over discussion.

Only the user changes task state. Creating or updating a record never authorizes implementation, evidence generation, commit, publication, deployment, or another controlled action.

## Keep Five Canonical Sections

Keep the record in this order:

1. **Current Context** — concise present understanding.
2. **Current Work** — one Current Slice or none, plus one next useful action.
3. **Future Work** — one ordered sequence of Slices and Checkpoints not yet in History.
4. **History** — Decisions, Checkpoints, and settled Slices, in that order.
5. **Notes** — inert retained context.

Read [Working Record Format](references/working-record-format.md) before directly editing structured record content or preparing Markdown for a lifecycle command. It owns the exact headings, fields, state tables, and omission rules. Do not invent fields, headings, IDs, or lifecycle states.

## Create Or Recover Honestly

Initialization creates every canonical heading. Start with at least:

- the task state;
- a supported Goal;
- any defining source or material Open question already known;
- `Current Slice: None`;
- one next useful action or an honest wait condition.

If the task is too unclear to state a Goal and next action without invention, discuss it before initialization.

The header’s `Last updated` is created by `init` and refreshed by successful lifecycle commands. Direct Markdown edits may leave it stale; it is advisory recency metadata, not proof of validity, freshness, authority, or semantic truth.

Use `resume` after context loss, compaction, session navigation, handoff, an intentional pause, or uncertain continuity. Do not reload it merely because another conversational turn began. Compare the recovered projection with current user direction and the live environment, then reconcile only affected state.

## Reconstruct State Before Action

Before any consequential action, especially after recovery, confirm:

- task State;
- Current Slice and its state;
- active Decisions;
- pending or deferred Checkpoints;
- the Next useful action;
- applicable authority, scope, and stop condition;
- unresolved Evidence or contradictions.

Reconcile the projection from the Working Record, selected exact History, accepted artifacts under `What defines this task`, the live environment, and current human intent and authority. Retrieve only the exact historical block needed for rationale, chronology, supersession, lineage, or Evidence. Do not act from the Working Record alone.

A record from another conversation branch remains memory. It does not transfer branch-local authority. If the record does not use the supported schema, inspect it through `full` and stop before direct edits or lifecycle transitions; migration is a separate explicit operation.

Before an expected compaction, clear, session pause, or handoff, reconcile the record only when material task state changed. The context boundary itself is not a History event, Evidence item, or Checkpoint.

## Keep Current Context Small And Current

Use concise bullets under exactly seven headings:

- Goal
- What defines this task
- Settled
- Tentative
- Open
- Current direction
- Boundaries

`Settled` contains supported present understanding, not duplicate Decision history. `What defines this task` points to accepted artifacts, user decisions, constraints, and source truth that determine interpretation.

Change Context only when its present meaning changes. Do not rewrite it after every Slice, Checkpoint, test, review, or ordinary transition. Add, edit, move, or remove only the affected bullet. Completed-event detail belongs with its Slice; accepted choice and rationale belong to a Decision.

## Edit Content Directly; Script Lifecycles

Use ordinary Markdown reads and edits for content that requires judgment:

- Current Context bullets;
- allowed wording and optional fields inside Future Work or the Current Slice;
- proposed-item order or removal;
- the next useful action;
- Material updates;
- Notes;
- clerical correction of active prose;
- the defined clerical correction block in terminal History.

A direct edit may change allowed content inside a block. It must not change the block’s durable ID, lifecycle state, entity kind, or owning top-level section. Do not delete or reactivate terminal History or erase its prior value; append a defined correction instead.

Prose-only bullet edits need no extra validation. After editing headings, fields, references, or other structured blocks, run `validate` before consequential work; every lifecycle command validates its source and candidate.

Use a deterministic lifecycle command when an operation creates structured identity or changes lifecycle state:

- initialize the record;
- propose a Slice or Checkpoint;
- start, pause, resume, close, or reopen a Slice;
- activate, defer, resume, or close a Checkpoint;
- add, supersede, or retire a Decision;
- change task state.

Commands own placement, ID allocation, legal state transitions, complete multi-block movement, and the script-maintained `Last updated` field. The agent owns meaning and supplies the content. Slice and task-state transitions also require agent-supplied Next useful action text; Checkpoint transitions may update it when supplied. Use [working-record.mjs](scripts/working-record.mjs) for the lifecycle boundary; run each command with `--help` for its small Markdown-fragment input contract.

A lifecycle command must validate the source and candidate before publication and apply one complete transition or none. If its result is uncertain, stop and re-read `full` before retrying or editing related state.

## Keep One Coherent Slice

A Slice is one coherent learning, delivery, or deepening outcome. Keep implementation, verification, review, accepted correction, and associated Checkpoints inside the same Slice while its intended result, authority boundary, evidence boundary, and independently useful outcome remain coherent.

Use a new Slice when any of those boundaries materially changes. Do not split ordinary implementation stages, tests, reviews, or corrections into separate Slices.

A proposed Slice has no durable ID or authority. Its title must be unique across Future Work. It may be edited, reordered, or removed until selected.

When an immediately authorized outcome does not need Future Work ordering or recovery, use `slice start-direct`. It creates a new Current Slice without consuming or changing any Future Work item. Never silently treat a direct start as proposal selection.

Starting requires current authority and creates one detailed Current Slice with a new `S-NNN` ID before execution. Do not begin Slice work until that start transition has successfully persisted and validated the Current Slice and Next useful action. After a successful start or reopen, return the bounded result to [Execute Work](../execute-work/SKILL.md); the transition itself is not implementation authority.

```text
Future proposed
-> Current in_progress
<-> Current paused
-> History completed | blocked | abandoned
```

- `in_progress` means the selected outcome is actively being pursued.
- `paused` means the outcome remains current but safe continuation is suspended. Ordinary feedback or a turn boundary is not a pause.
- Historical `blocked` means the unresolved paused attempt deliberately left Current Work.
- Historical `completed` means the intended result and required evidence boundary were settled.
- Historical `abandoned` means the outcome is no longer pursued under explicit authority.
- Close as historical `blocked` only from a paused Current Slice; close as `abandoned` only with explicit authority and a reason; close as `completed` only after required Evidence and applicable Checkpoints are settled.

Append a Material update only when safe continuation or truthful closure would otherwise lose a material change. Use concise labeled bullets for Evidence, pauses and resumptions, accepted extensions, contradictions, review outcomes, or corrections. Routine commands, edits, tests, and conversation turns are not record events.

Record an accepted extension before expanded work begins. Preserve its authority, added scope, added evidence boundary, and changed stop condition when applicable. Questions, criticism, findings, and useful suggestions do not authorize an extension.

A Slice cannot close while a `pending` or `deferred` Checkpoint applies to it. Resolve the Checkpoint first. Closure compacts the active declaration and Material updates into one historical Slice; it does not copy the active block wholesale.

Before closing as `completed`, establish that every material completion claim has supporting Evidence at its required boundary, the live state does not contradict the result, no authority conflict remains, and no material contradiction is unresolved. A Learning Slice may complete by disproving its hypothesis when its question and Evidence boundary are settled. The command can enforce structure, not semantic truth.

Closing never selects or starts another Future Work item. After closure, Current Slice is `None` until another outcome is explicitly selected.

To continue a historical `completed` or `blocked` Slice, create a new Current Slice with a new ID and `Reopened from: S-old`. Supply fresh authority, scope, expected evidence, stop condition, and starting state. Leave the historical entry unchanged. Resuming returns a Current paused Slice to `in_progress`; reopening creates a linked Slice from History.

## Keep Checkpoints Prospective Until Terminal

Every Checkpoint belongs to one Slice. Its title must be unique across Future Work.

```text
proposed -> pending <-> deferred
pending | deferred -> completed | cancelled | replaced
```

- `proposed` is a candidate with no authority or durable ID.
- `pending` is an accepted unresolved boundary that dependent work must not cross.
- `deferred` remains accepted but dormant until its recorded condition.
- `completed` means the boundary occurred; its result may still be adverse or blocking.
- `cancelled` means it is no longer required.
- `replaced` names the pending Checkpoint that takes its place.

A proposed Checkpoint may be removed without History. Activate it only when the boundary is explicitly selected or authorized; a proposal or recommendation is not acceptance. Activation assigns `C-NNN`. When its proposed Slice starts, the same transition replaces the exact proposed-title reference with the new `S-NNN`. An accepted Checkpoint leaves Future Work only through a lifecycle command and remains there until terminal.

## Preserve Decisions Without Rewriting Their Meaning

Decisions live under History and receive `D-NNN` when added:

```text
active -> superseded | retired
```

A clerical clarification may edit an active Decision directly without changing its meaning. A material change creates a new Decision and supersedes the old one. A superseded Decision names its replacement; a retired Decision records why it no longer governs. Terminal Decisions are not reactivated. Adopting an old choice again creates a new active Decision.

## Keep Evidence And Blockers With Their Slice

Do not create global Evidence or Blocker sections. A material Evidence update states the claim, observing boundary, result, what it proves and does not prove, and a real pointer when available. Later contradictory Evidence is appended rather than silently rewriting the earlier observation.

A pause update states why continuation stopped and what permits resumption. A resume update states the resolution source. At closure, distill the strongest relevant Evidence, proof limits, unresolved blocker, and task effect into the historical Slice.

Evidence supports claims only at its observing boundary. A green check, completed implementation, or review opinion alone does not establish a supported exit. If an attempt fails, is rolled back, or leaves residual effects that change the next decision, preserve that attempt, reason, Evidence, and residual state in Material updates or the historical Slice.

## Change Task State Explicitly

Task states are:

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active only by explicit user reopening
```

Pausing a task pauses its Current Slice first when one exists. Reactivating the task does not automatically resume that Slice. A completed or abandoned task requires Current Slice `None` and no pending or deferred Checkpoint. Proposed Future Work may remain only when it is clearly retained as non-obligating future material; otherwise reconcile or remove it before the terminal transition. Reopening a task does not automatically select work.

## Keep Notes Inert

Notes have no field schema. Add or edit them directly as ordinary Markdown. Remove a user-authored Note only when the user requests it; remove other Notes only when current maintenance authority clearly covers that correction.

Notes do not authorize, prioritize, schedule, block, unblock, prove, or require follow-up.

## Read Through Two Views

- `resume` shows the record header, complete Current Context, active Decisions derived from History, complete Current Work, complete Future Work, and Notes. It omits terminal History.
- `full` returns the complete canonical Markdown exactly as stored.

Both views are direct Markdown text, not JSON. A host may render that Markdown visually. Neither view follows external pointers or mutates the record. When one historical entity is needed, search and read its bounded `S-NNN`, `C-NNN`, or `D-NNN` block instead of loading all History.

## Return To The Requesting Activity

After maintenance, return to the activity that requested the record operation. Discussion returns to [Discuss](../discuss/SKILL.md) after accepted state is preserved; authorized Slice work returns to [Execute Work](../execute-work/SKILL.md). Point-in-time transfer uses [Handoff](../handoff/SKILL.md). Task-local durable content remains owned by [Write Spec](../write-spec/SKILL.md) and [Write Plan](../write-plan/SKILL.md). Do not continue execution, select Future Work, or treat a recorded proposal, Decision, Checkpoint, or next action as fresh authority merely because it is present.

Stop instead of guessing when authority, intended result, scope, evidence, record structure, migration, or a transition is unclear. Track Work ends when the record accurately preserves supported current state and one next useful action. It does not claim implementation, verification, review, commit, release, publication, or task completion on its own.
