# Projects And Child Records

Read this when the work involves a registered task: a task ID such as `my-project/task-003`, a child record, a project, or the user asking to group tasks, split a task across parallel sessions, or move a record out of a repository.

The **Rules** below are binding; everything else is judgment.

## Rules

- Create or link a project, import a record into one, and change a task's directories, only when the user asks, when the user confirms your proposal in a harness dialog, or when the user's auto-approve setting covers that change (Pi task memory).
- Write a record only from the session that owns it. A parent task's record is written by the parent's session; a child's record by the child's session.
- A child has no children.
- Remove a task or a project only when the user asks for it to be removed, or confirms your proposal in a harness dialog. Removal moves records to the trash under the Freeflow home; never empty the trash or delete records another way: that is the user's.

## What A Project Is

A project groups related tasks, possibly across several repositories. Its records live in a store under the Freeflow home (`FREEFLOW_HOME`, default `~/.freeflow`), at `projects/<project>/tasks/task-NNN-<short-name>/record.md`, outside any repository, so removing a worktree does not delete them. A registered record is not in the repository's `.freeflow/tasks/`, and that is expected. Each registered task has an ID, `<project>/task-NNN`, and every command that takes `--record` also takes the ID. The registry also records which session owns each record and which task is a child of which.

```text
working-record.mjs project new --name <name> [--worktrees <dir>]     create; link this repository
working-record.mjs project link --name <name> [--worktrees <dir>]    link another repository
working-record.mjs project show [--name <name>]                     a project's tasks (default: this repository's)
working-record.mjs project list                                      every project
working-record.mjs task create --title <t> --goal <g> [--parent <id>] a registered task, or a child
working-record.mjs task fanout --parent <id> --title <t> --goal <g> --agent <cmd>  a child with its own worktree
working-record.mjs task here                                         the task this directory belongs to
working-record.mjs task env --id <id>                                where a task's work happens
working-record.mjs task import --record <record.md> --project <name> move an existing record in
working-record.mjs task search --query <q> --id <id> --scope task|tree|project
working-record.mjs task remove --id <id>                             a task and its children, to the trash
working-record.mjs project remove --name <name>                      a project and its tasks, to the trash
```

Run each command with `--help` before preparing its input. A record that is not registered keeps working where it is.

## Other Tasks In The Project

Each task keeps its own record. Read another task's record (`view resume --record <id>`, `task search --id <id> --scope project --query <words>`) when it bears on what you are about to decide or build; record what matters to this task in this task's own record, never in the other one.

## Where A Task's Work Happens

A registered task records its primary directory (the repository or worktree where its effects belong) and any additional directories; `task env` shows them with the current Git branch. When a session starts with no task in hand, `task here` names the task the directory belongs to: recover that one. Make the task's changes in its primary directory; work in another directory belongs to another workstream unless the user says otherwise.

## Child Records

Goal: parallel work on one task, each workstream with its own memory, and one writer per record.

A child is a record for one workstream of a task that runs in parallel in another interactive session the user starts. When the child will change files, create it with `task fanout`, which also creates its Git worktree on a branch named for it and copies the repository's personal Freeflow config. Pass `--agent` with the command that starts this host's agent (such as `claude` or `codex`); the output ends with a command for a new terminal. Give the user that command exactly. A child that only reads or researches needs no worktree: use `task create --parent <id>`. Most tasks never need a child. A subagent is not a child: it works inside its session, on that session's task, and needs no record.

After creating a child, record the delegation in the parent's record (for example as a Slice whose result is the child's). Read a child's progress with `view resume --record <child-id>` or `task search --scope tree`; when its result matters to the parent, record it in the parent as you would a finished Slice. The child's own session writes the child's record.

Owners are recorded on every host, but only a harness that gates writes enforces them. Without one, check `project show` before writing a registered record another session owns, and ask the user.
