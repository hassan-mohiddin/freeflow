---
name: "task-memory"
description: "Use when a Pi session has Freeflow task memory on and the work creates, recovers, or updates a Working Record: attaching it to the session, moving between attached records, or a refused record write."
---

# Task Memory

With task memory on, a Pi session holds the Working Records it works on. The user attaches records; one attached record is the focus, the one the conversation is about. Freeflow lists attached records in the Runtime State under `Task Memory:`, delivers the focused record's resume view when it becomes the focus or context is rebuilt, and refuses writes to records the session has not attached. [Track Work](../../skills/track-work/SKILL.md) still decides whether a task needs a record and what a record says; this skill covers how the session holds records.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Attaching is the user's choice. Propose it with `freeflow_task` (`attach`); a decline stands until the user says otherwise.
- Write a record only when it is attached to this session and not held, and write each update to the record it concerns, whichever record is the focus.
- When Freeflow refuses a record write, tell the user which record and why. Never write that record another way, such as a shell command.

## Attach When Track Work Calls For A Record

Goal: task memory where Track Work would keep a record, and none where it would not.

Propose attaching when a record already belongs to the work in front of you, or when Track Work says the task now needs one and you have created it. A session with nothing attached is normal: a question, a short self-contained change, or a session the user keeps memory-free needs no record, so never propose one only because the Runtime State says nothing is attached.

## Use The Delivered Resume View

Goal: recover a record once, at the cost of its present state, not its whole history.

The resume view Freeflow delivers (as `freeflow_task`'s result, or as a message starting `[Freeflow task memory]`) is Track Work's resume read for that record: do not read the record again to recover it. Fetch closed History entries the next action depends on with `view entry`, then continue Track Work's recovery order with the defining artifacts and Recovery sources. Read the record again when it has changed since the delivery, for example after another session wrote it.

## Move Between Attached Records

Goal: the focus follows the conversation, so the resume view in context is the one the work needs.

When the conversation turns to another attached record, switch with `freeflow_task` (`focus`) and continue from the resume view it returns. A single update to another attached record in the middle of your work needs no switch: write it to that record and stay where you are.

## Held Records

A forked or cloned session inherits the records attached on the branch it came from, held: listed and readable but not writable, so two sessions do not write one record by accident. Only the user releases them, with `/freeflow task confirm`.
