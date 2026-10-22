---
name: "task-memory"
description: "Use when the user asks about tasks or projects (open, create, switch, split), or the work needs a record attached, another task read, or Freeflow refuses a record write. Track Work decides what records say."
---

# Task Memory

With Task Memory on, a Pi session holds the Working Records it works on. Attached records are the ones this session may write; one attached record is the focus, the one the conversation is about. A record may be registered in a project, with an ID such as `my-project/task-003` and one owning session; registered tasks can have child records, each worked in its own session. Freeflow lists attached records in the Runtime State under `Task Memory:`, delivers the focused record's resume view when it becomes the focus or context is rebuilt, and refuses writes to records the session has not attached. [Track Work](../../skills/track-work/SKILL.md) still decides whether a task needs a record and what a record says; this skill covers how the session holds records and how the user's requests about tasks and projects become `task_memory` actions.

A repository linked to a project, and each child's worktree, has `.freeflow/project`: a link to the project's store, so the user can open and edit its records in the editor. A path under it names the same record as the task ID; reach records by task ID and `task_memory` actions, not by listing that folder.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- The user's latest request decides the work. The focused record's Next useful action is where that task stood, not a request: when the user asks for something else, including work on another record, do that (proposing to attach the other record when a write needs it) and do not switch to the focused record's work. When the request is unclear or incomplete, ask what the user means; never fall back to the record's Next useful action.
- Act on the user's authority only through a `task_memory` proposal the user confirms: `attach`, `create`, `child`, `fanout`, `project_new`, `project_link`, `import`, `confirm`, and `env` with a change each open a dialog, unless the user's auto-approve setting covers that action, which is their standing confirmation (the result then says it was auto-approved). A declined proposal is the user's answer: do not retry it, rephrase it, or reach the same result another way unless the user asks again.
- Write a record only when it is attached to this session, not held, and, if registered, owned by this session. Write each update to the record it concerns, whichever record is the focus. Never write another task's record because you read it.
- When Freeflow refuses a record write, tell the user which record and why. Never write that record another way, such as a shell command.
- Remove tasks and projects only with `remove` and `project_remove`. Never empty the trash or delete records, stores or the registry another way: emptying the trash is the user's command, so when asked to, tell the user to run `/freeflow trash empty`.

## Turn Requests Into Actions

Goal: the user works in plain language; you pick the action and show its outcome.

| The user says | Action |
| --- | --- |
| list my projects | `projects` |
| list tasks, show this project's / another project's tasks | `list`, with `project` for another one |
| open, select, work on, continue a task | `attach` (or `focus` when already attached) |
| switch to, back to a task | `focus` |
| close, stop working on a task here | `detach` (the task's state is Track Work's, changed only on the user's word) |
| new task, track this | `create` (creates it in this repository's project and attaches it, one dialog) |
| split off, run in parallel, in another session or worktree | `fanout` when the work will change files, `child` when it only reads |
| create a project, add this repository to a project | `project_new`, `project_link` |
| move this record into the project | `import` |
| remove, delete a task or a project | `remove` (a task and its children) or `project_remove`: records move to the trash |
| what did we decide about X, find X | `search`, then `view` the entry that answers it |
| where does this task's work happen | `env` without a change |

When a request names a task loosely ("the retry one"), `list` first and pick the match; ask only if two fit. After an action, say what happened in a line; the transcript already shows the details.

A fan-out result contains a command for a new terminal. Give it to the user exactly as returned, in a code block, and say that Freeflow there offers to attach the child. A fan-out or child result also contains the Track Work command that records the split in the parent's record: run it (adjusting its wording only), then update the parent's Next useful action if this session should not do that work. On Pi the tool supplies everything; Track Work's `--agent` option is only for its script on other hosts.

## Propose When Track Work Calls For A Record

Goal: a Task Memory record where Track Work would keep a record, and none where it would not.

Propose attaching when a record already belongs to the work in front of you; propose `create` when Track Work says the task now needs a record and this repository is linked to a project. Without a project, create the record with Track Work's `init` in the repository and propose attaching it; propose `project_new` only when the user wants tasks grouped, kept across worktrees, or split into parallel sessions. A session with nothing attached is normal: a question, a short self-contained change, or a session the user keeps memory-free needs no record, so never propose one only because the Runtime State says nothing is attached.

## Use The Delivered Resume View

Goal: recover a record once, at the cost of its present state, not its whole history.

The resume view Freeflow delivers (as `task_memory`'s result, or as a message starting `<task-memory`) is Track Work's resume read for that record: do not read the record again to recover it. Fetch closed History entries the next action depends on with `view` and an entry ID, then continue Track Work's recovery order with the defining artifacts and Recovery sources. Read the record again when it has changed since the delivery, for example after another session wrote it.

## Use The Rest Of The Project

Goal: work that another task already did, decided or abandoned informs this one without the user pointing to it.

A registered task's resume view lists the project's other tasks, most recently changed first, one line each. Each task keeps its own record; nothing from another task is in yours until you read it. Read another task with `view` (no attach, no dialog) when its title bears on what you are about to decide or build, and `search` the project before settling something another task may already have settled. Use what you read as evidence about that task, name it when it shapes your work, and record anything that matters to this task in this task's own record. When the user points to a task, read it the same way.

## Move Between Attached Records

Goal: the focus follows the conversation, so the resume view in context is the one the work needs.

When the conversation turns to another attached record, switch with `focus` and continue from the resume view it returns. A single update to another attached record in the middle of your work needs no switch: write it to that record and stay where you are.

## Child Records On Pi

Read Track Work's [Projects And Child Records](../../skills/track-work/references/projects.md) when the work involves a child record or splitting a task: it says when a task gets a child and how the parent records it. On Pi, `fanout` creates the child's worktree and the command to start it; `child` creates one that needs no worktree, which the user attaches in its own session. A subagent is not a child. The parent's resume view lists children in a `Children` block; read one with `view`.

A child session is one the user starts and steers alongside the parent; workers Cognitive Routing manages are not children. When Messaging is on, a child reports to its parent through it, as the Messaging skill describes.

## Where The Work Happens

A registered task's resume view names its directory in an `Environment:` line. When it says this session runs outside that directory, the task's changes belong there: tell the user before changing files here for that task.

## Under Cognitive Routing

Goal: the user talks to the Coordinator, so Task Memory stays with the Coordinator.

Under automatic routing the Coordinator proposes Task Memory actions and writes the user's own words into the focused record (a Decision or a Work agreement change), as it owns the user's direction; other record maintenance goes where the delegation mode places it. A worker reads Task Memory (`projects`, `list`, `view`, `search`, `env` without a change) and writes a record only when its assignment's contract says so; an action it would propose, such as attaching another task, goes in its report for the Coordinator to propose. The resume view reaches every profile, including after a worker's compaction.

## Held Records

A forked or cloned session inherits the records attached on the branch it came from, held: listed and readable but not writable, so two sessions do not write one record by accident. Propose `confirm` only when the user wants this session to continue that record.
