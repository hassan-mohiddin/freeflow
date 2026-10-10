---
name: "task-memory"
description: "Use when Freeflow task memory is on and work involves a Working Record: attaching one to this session, switching focus between attached records, or reading what Freeflow delivered."
---

# Task Memory

With task memory on, this session knows which Working Records it works on. The user attaches records; one attached record is the focus. Freeflow lists them in the Runtime State, delivers the focused record's resume view when it becomes the focus (and after compaction, navigation or a resumed session), and refuses writes to records this session has not attached. [Track Work](../../skills/track-work/SKILL.md) still owns what a record holds and when one is needed; this skill covers only how the session holds records.

## Rules

- A session needs no record. Propose attaching one only when Track Work calls for a record: an existing record belongs to the work, or the task now needs one. Never propose one just because nothing is attached.
- Attaching is the user's choice. `freeflow_task` with `attach` asks them; a decline stands.
- Every record write names a record attached to this session. A refused write means the record is not attached or is held after a fork; say so instead of writing around the gate.
- A delivered snapshot is Track Work's resume read for that record: do not read it again. Fetch closed History entries with `view entry` when the next action depends on them, then continue Track Work's recovery order (defining artifacts, Recovery sources).

## Focus

Focus is where attention is, not a permission. When the conversation moves to another attached record, switch with `freeflow_task` `focus` and continue from the resume view it returns. Write each record update to the record it concerns, whichever is in focus.

## Held Records

A forked or cloned session inherits the attachments of the branch it came from, held: readable but not writable, so two sessions do not write one record by accident. The user releases them with `/freeflow task confirm`.
