# Task Memory

Track Work keeps a Working Record for a task that has to survive context loss: its goal, decisions, current work and history. On its own, the agent decides which record belongs to the work, finds it by path, and recovers it by running a script after a compaction. Nothing stops it from writing to the wrong record or recovering one that belongs to other work.

Task memory, a preview on native Pi, makes the session know its records. You attach the records a session works on; one of them is the focus. Freeflow gives the agent the focused record's current state whenever its context is rebuilt, shows the attached records in its Runtime State, and refuses record writes to records you have not attached. Records can also belong to a project, with stable IDs and storage outside any repository, and a task can be split into child records worked in parallel sessions.

Task memory does not decide when a task needs a record or what goes in it: Track Work still does. A session never has to attach anything.

## Availability

- Native Pi only. Other hosts keep Track Work as a skill; see [Other hosts](#other-hosts).
- Off by default. Turn it on with the Task Memory switch in `/freeflow settings`: the Session scope for this session only (kept in the session, no file changes), Personal for you in this checkout, Repository for everyone. Or set it in `.freeflow/config.json` or `.freeflow/local.json`:

```json
{
  "taskMemory": { "enabled": true }
}
```

- Off inside subagents: a subagent works on its session's task.
- Works with Cognitive Routing too. Under automatic routing the Coordinator, the profile you talk to, handles task memory with you: it proposes attaching, creating and the rest. Helper and Executor workers can only read task memory; one that needs an action puts it in its report for the Coordinator to propose. Every profile receives the focused record's resume view, also after a worker compacts.

## Ask in plain language

Everything below can be done by asking the agent: "list my projects", "show this project's tasks", "open the retry task", "start a task for the parser port", "split the parser off into its own worktree", "what did we decide about the cache key?", "remove the trial project". The agent picks the action. Anything that creates something, lets the session write or removes something (creating a project or task, linking a repository, attaching, splitting off a child, importing, releasing a held record, changing a task's directories, removing a task or project) opens a dialog first, and nothing happens unless you confirm. A decline stands: the agent does not retry or work around it. Reading, listing, searching and moving the focus need no dialog.

To stop being asked for some of these, turn on their auto-approve switches in `/freeflow settings` (Personal or Repository scope), or in a config file. Each switch covers a group of actions and is off by default:

| Switch | Actions it lets the agent take without asking |
| --- | --- |
| `attach` | attaching a record, and making a held record writable |
| `create` | creating a task or a child task |
| `env` | changing a task's directories |
| `fanout` | a child task with its own Git worktree and branch |
| `projects` | creating or linking a project, and importing a record into one |

```json
{
  "taskMemory": { "enabled": true, "autoApprove": { "attach": true, "create": true } }
}
```

An action taken this way says in the transcript that it was auto-approved. Your personal file overrides the repository's switch by switch. The `/freeflow` commands in [Commands](#commands) do the same things directly.

In the transcript each task-memory step is one line, such as `Task memory · Attach my-app/task-003` with `Attached Retry logic [my-app/task-003] · active` and the task's next action under it; expand it to see what the agent read. When the agent receives a task's resume view, a `Task memory` line names the task, its state and next action; expand it to read the view.

## Attach and focus

A session holds a set of attached records, and at most one focus.

- **Attach.** When work needs a record, the agent proposes attaching it and Freeflow asks you to confirm. You can also attach one yourself with `/freeflow task attach <task ID or record path>`, or pick from this repository's records with `/freeflow task`. Attaching makes the record the focus and lets the session write it.
- **Focus.** The agent moves the focus between attached records as the work moves, and says so. Focus grants nothing: it decides which record's state the agent is given.
- **Detach.** You or the agent can detach a record. The session can then no longer write it.

When a record becomes the focus, and again after a compaction, `/reload`, a resume, a fork or `/tree` navigation, the agent receives the record's resume view: its current state and a one-line index of its closed history, marked as task memory rather than as an instruction. Your latest message still decides what the agent does; the record's next action is where that task stood, not a request.

Attachments belong to the point in the conversation where they were made. After `/tree` takes you to an earlier point, the records attached there apply again, and Freeflow tells you if the focus changed. A forked session starts with the records it inherited held: readable, not writable, until you run `/freeflow task confirm`, so two sessions do not write one record by accident.

## What is refused

A write to a Working Record (editing `record.md`, or a Track Work command that changes a record) is refused unless the record is attached to this session, is not held, and, for a project record, is owned by this session. The refusal says which of these failed, and the agent is told not to write around it. Reading any record is always allowed.

The check guards against the agent writing to the wrong record. It is not a sandbox: a shell command that rewrites the file by other means is not stopped.

## Projects

A project groups related tasks, possibly across several repositories. Ask the agent to create one (you confirm), or run:

```text
/freeflow project new <name> [--worktrees <dir>]
/freeflow project link <name> [--worktrees <dir>]
/freeflow project
/freeflow project list
```

`new` creates the project and links the current repository; `link` links another repository to an existing project; `/freeflow project` shows the repository's project and its tasks; `list` shows every project. `--worktrees` sets where child worktrees go (default: the repository's parent directory; `~` means your home directory).

A project's records live in a store under the Freeflow home, `~/.freeflow/projects/<project>/tasks/task-NNN-<name>/record.md`, not in the repository, so removing a worktree does not remove its task memory. A record outside a project stays in its checkout's `.freeflow/tasks/` and goes with the checkout. Each task has an ID such as `my-app/task-003`, which works wherever a record path does. Set `FREEFLOW_HOME` to keep the registry and stores elsewhere.

**Browse the records in your editor.** Each repository linked to a project, and each child's worktree, gets `.freeflow/project`, a link to the project's store, so you can open and edit its records while the agent works; your edits change the real files. Freeflow keeps the link out of Git through the clone's `.git/info/exclude`, so no tracked file changes, and makes it again at session start if it is missing. Where a link cannot be made, `/freeflow project` shows the store's real path. The agent itself reaches records by task ID, not through the link.

Once the repository is linked, ask the agent for a new task, or run `/freeflow task new <title>`; either creates it in the project and attaches it to the session. A record in the repository's `.freeflow/tasks/` keeps working there, without an ID or owner; `/freeflow task import <record> <project>` moves it into the project's store after you confirm.

**One session writes each project record.** Attaching a project record makes this session its owner. If another session owns it, Freeflow asks before taking it over; that session's writes are then refused. A session that has ended keeps ownership until another takes it over, because Pi cannot tell that a session is gone.

**Tasks see the rest of their project.** Each task keeps its own record; nothing from another task is in it. A project task's resume view also lists the project's other tasks, the 15 most recently changed with their state and title, so the agent can tell which ones bear on the work. It reads or searches them on its own when one does, without attaching them, and records what matters in its own task. You can also point it at one: "check what task-002 decided about retries".

**A task records where its work happens**: its primary directory (a repository or worktree) and any additional directories. When a session starts in a task's directory with nothing attached, Freeflow offers to attach that task; if you decline, it does not ask again on that session's branch. The resume view warns the agent when the session runs outside the task's directory. Pi's tools can reach any path, so the directory guides the agent rather than restricting it.

## Parallel work: child records

A project task can be split into child records, one per workstream that runs in parallel in its own session; a record outside a project has no children. Each child has its own record and its own writer; the parent's session writes the parent and reads its children. A child has no children of its own, and most tasks need none. A subagent is not a child: it works inside its session.

For a child that will change files, ask the agent to fan out, or run:

```text
/freeflow task fanout <title>
```

from the session that owns the parent. Freeflow creates the child record, a Git worktree for it on branch `<project>/<task-NNN>-<name>`, and copies your `.freeflow/local.json` into the worktree so task memory stays on there. It then gives you a command to paste into a new terminal, for example:

```bash
cd '/Users/you/Developer/Worktrees/app-parser' && pi
```

(with `FREEFLOW_HOME=…` before `pi` when you use a non-default Freeflow home). Run it, and Freeflow in the new session offers to attach the child.

For a child that only reads or researches, no worktree is needed. Start a new session and run `/freeflow task child <parent ID> <title>`, which creates the child and attaches it there.

The parent's resume view lists its children with each child's state and next action, and the agent can read a child's record or search across the task and its children. A child's result reaches the parent's record when the parent's session records it. With [Messaging](messaging.md) on, the child's session can report to the parent's session itself.

## Removing tasks and projects

Ask the agent to remove a task or a project, or run `/freeflow task remove <task ID>` or `/freeflow project remove <name>`. A dialog names what goes (a task takes its child tasks with it; a project takes all its tasks), which other sessions own any of it, and which Git worktrees stay. Removal always asks: no auto-approve switch covers it.

Removed records are not deleted. They move to the trash, `~/.freeflow/trash/`, and leave the registry; a project's `.freeflow/project` links go too. Task numbers are never reused, so an old ID cannot come to name a new task. Fan-out worktrees and branches stay, and the result gives the `git worktree remove` and `git branch -D` commands if you want them gone.

`/freeflow trash` lists what the trash holds. **Only you empty it**, with `/freeflow trash empty`, which asks once more and then deletes for good. The agent has no way to empty it: asked to, it tells you to run the command. To get a removed task back before then, move its folder out of the trash into a repository's `.freeflow/tasks/`, renamed to the part of its trash name that starts with `task-` (a trash entry `2026-10-12T09-30-00-000Z-my-app-task-003-retry` becomes `task-003-retry`). It then works as a record outside any project, and `/freeflow task import` puts it back into one, with a new number.

## Search

Ask the agent to search task memory. It searches the focused task, the task with its parent and children, or every task in the project, and returns matching lines with the record and entry each comes from.

## Commands

| Command | Does |
| --- | --- |
| `/freeflow task` | Pick from this repository's records: attach one, or focus one already attached. |
| `/freeflow task list [project]` | List this repository's records and what is attached, or a project's tasks. |
| `/freeflow task new <title>` | Create a task in this repository's project and attach it. |
| `/freeflow task attach <ID or path>` | Attach a record and make it the focus. |
| `/freeflow task focus <ID or path>` | Move the focus to an attached record. |
| `/freeflow task detach <ID or path>` | Detach a record. |
| `/freeflow task confirm [record]` | Make a held record writable in this session (and take ownership of a project record). |
| `/freeflow task fanout <title>` | Create a child of the focused task with its own worktree and branch. |
| `/freeflow task child <parent ID> <title>` | From a new session: create a child of that task and attach it here. |
| `/freeflow task import <record> <project>` | Move a repository record into a project's store. |
| `/freeflow task remove <ID>` | Move a task and its children to the trash, after a dialog. |
| `/freeflow project [new\|link <name> [--worktrees <dir>]]` | Show, create, or link the repository's project. |
| `/freeflow project list` | List every project. |
| `/freeflow project remove <name>` | Move a project and all its tasks to the trash, after a dialog. |
| `/freeflow trash [empty]` | List the trash, or delete everything in it for good (asks first). Only you can do this. |

`/freeflow status` reports whether task memory is on, and the Runtime State the agent sees lists the attached records and marks the focus.

## Other hosts

On Claude Code, Codex and other hosts, Track Work works as before: the agent recovers a record through its resume view, and opens closed entries by ID when it needs them. Projects, child records, task IDs, worktree fan-out and search are Track Work commands there too: ask the agent to create a project, fan a task out or search a project. Owners are recorded on every host, but only Pi refuses writes; elsewhere the agent checks the project before writing a record another session owns and asks you.

## Prompt cache

Resume views and task-memory notices are appended to the conversation; nothing already sent is edited, so each request still starts with the previous one. While task memory is on, its tool is part of every request. Turning task memory on or off changes the tools and reloads the session, so the next request is written to the provider's cache once. See [Prompt caching](../prompt-caching.md).

## Evidence limits

Native Pi tests cover attaching, focus, the write check, ownership and takeover, held records after a fork, delivery after reload, navigation and both kinds of compaction, projects, children, fan-out, the directory offer, and that each request stays a prefix of the next.

Model behavior was checked in scripted Pi sessions on Claude Haiku 5.5 (xhigh), three runs per case (October 2026): recovering a task from the resume view without reading the whole record, 3 of 3; attaching before writing the record or code, 3 of 3; with two records attached, writing a finding to the right one, 3 of 3; keeping to your request when another record is in focus, and leaving a declined record unchanged, 3 of 3. Three runs show the effect, not a rate. Other models, long real use, and parallel sessions beyond one manual trial have not been measured.

## Related documentation

- [Using Freeflow Effectively: Track Work](../using-freeflow.md#preserve-memory-with-track-work)
- [Compaction](compaction.md)
- [Capabilities](README.md)
- [Pi integration](../integrations/pi.md)
- [How task memory works](../../dev-docs/subsystems/task-memory.md) (developer docs)
