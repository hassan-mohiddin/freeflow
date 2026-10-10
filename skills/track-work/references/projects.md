# Projects And Child Records

Read this when the work involves a registered task: a task ID such as `my-project/task-003`, a child record, a project, or the user asking to group tasks, split a task across parallel sessions, or move a record out of a repository.

The **Rules** below are binding; everything else is judgment.

## Rules

- Create or link a project, and import a record into one, only when the user asks.
- Write a record only from the session that owns it. A parent task's record is written by the parent's session; a child's record by the child's session.
- A child has no children.

## What A Project Is

A project groups related tasks, possibly across several repositories. Its records live in a store under the Freeflow home (`FREEFLOW_HOME`, default `~/.freeflow`), outside any repository, so removing a worktree does not delete them. Each registered task has an ID, `<project>/task-NNN`, and every command that takes `--record` also takes the ID. The registry also records which session owns each record and which task is a child of which.

```text
working-record.mjs project new --name <name> [--cwd <directory>]      create; link this repository
working-record.mjs project link --name <name> [--cwd <directory>]     link another repository
working-record.mjs project show [--cwd <directory>]                   the linked project's tasks
working-record.mjs task create --title <t> --goal <g> [--parent <id>] a registered task, or a child
working-record.mjs task import --record <record.md> --project <name>  move an existing record in
working-record.mjs task search --query <q> --id <id> --scope task|tree|project
```

Run each command with `--help` before preparing its input. A record that is not registered keeps working where it is.

## Child Records

Goal: parallel work on one task, each workstream with its own memory, and one writer per record.

A child is a record for one workstream of a task that runs in parallel in another interactive session the user starts. Create one with `task create --parent <id>` when the user splits work that way; most tasks never need one. A subagent is not a child: it works inside its session, on that session's task, and needs no record.

After creating a child, record the delegation in the parent's record (for example as a Slice whose result is the child's). Read a child's progress with `view resume --record <child-id>` or `task search --scope tree`; when its result matters to the parent, record it in the parent as you would a finished Slice. The child's own session writes the child's record.

Owners are recorded on every host, but only a harness that gates writes enforces them. Without one, check `project show` before writing a registered record another session owns, and ask the user.
