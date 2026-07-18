---
name: track-work
description: Use when creating, resuming, or updating a durable Working Record so ongoing task state, planned actions, decisions, history, and the next action survive execution, pauses, or context loss.
---

# Track Work

Maintain living task memory without turning it into a transcript, fixed Plan, or authority over live evidence and user decisions.

## Read The Required Reference

Before creating, resuming, or updating a Working Record, read the complete [Working Record method and schema](references/working-record-schema.md). This skill and its reference form one method. Do not invent fields, states, or transitions from memory; if the reference is unavailable, do not mutate the record.

## Core Contract

- A Working Record may guide work without a Spec or Plan. Create one when the user asks or agrees, and recommend one when losing context could misalign later work. A short self-contained action needs none.
- A record preserves current context, one current slice, revisable proposals, durable history, inert Notes, and one next useful action. It is memory; live evidence and user decisions win.
- Only the user changes task state. Do not infer `Paused`, `Completed`, `Abandoned`, or renewed `Active` state from inactivity, apparent completion, or failure.
- A **slice** is one bounded piece of learning, delivery, or structural improvement. One slice may span multiple iterations of [Workflow's](../workflow/SKILL.md) Feedback Loop and calls to other owning skills.
- Record state changes, not every edit or conversation. Apply authorized in-scope steering and reconcile its meaningful final effect when the slice closes.
- Before work changes the recorded result, scope, authority, evidence boundary, or stop conditions, decide and record whether it extends the current slice or requires a new one.
- Questions, criticism, and review findings do not authorize changes. Ordinary in-slice feedback is not a checkpoint or history event merely because work pauses for the user.
- Workflow establishes slice outcomes. Implementation, verification, self-review, or a review report does not end a slice by itself, and review need not Pass.
- The record may preserve authority sources, decisions, checkpoints, and evidence; it never creates authority or proof.

## Follow The Lifecycle

After reading the required reference:

1. **Create or resume:** use the established task directory, restore task state after context loss, and orient from live evidence.
2. **Select a slice:** confirm authority, move one proposal into `Current Slice`, assign its chronological `S-` ID, save the write-ahead state, then execute.
3. **Maintain the slice:** keep small steering out of the event history; record accepted extensions before execution; preserve blockers, review routes, and evidence without replacing a coherent slice.
4. **Close the slice:** move the Workflow-established outcome to History, preserve the original boundary and accepted extensions, reconcile current state, and set `Current Slice` to `None`.
5. **Preserve what matters:** keep task-local decisions, selected checkpoints, evidence pointers, and Notes in their schema-owned sections.

## Context Boundaries

Before an expected compaction, summarization, pause, clear, or transfer, reconcile the record only when task state changed. The boundary itself is not a record event.

After compaction, summarization, resume, clear, or session navigation, read the complete record before the next task action and compare it with the current conversation and live state. Identify the task from current context or inspect and ask rather than guessing. A record written on another conversation branch is memory, not authority.

## Route Or Stop

Use [Discuss](../discuss/SKILL.md) before selecting a slice when a collaborative question could materially change its result, scope, or route.

Use `Blocked` only when a required decision, dependency, capability, evidence source, stop condition, or other unavailable condition prevents safe continuation. Keep the blocked slice current, record what is needed, then stop. General execution authority does not override a stop condition.

When the user requests a separate point-in-time transfer artifact, read [Handoff](../handoff/SKILL.md). Creating a handoff does not replace living Working Record state.

## Check The Record

After every update, silently compare the record with live evidence and the required reference. Correct clear local issues. Do not create review history or request review merely because the record changed.
