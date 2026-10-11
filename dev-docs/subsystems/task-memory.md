# Task Memory

> **Covers:** `pi-extension/src/task-memory/`, `capabilities/task-memory/`, `skills/track-work/scripts/lib/registry.mjs`, `skills/track-work/scripts/lib/search.mjs`
> **Tests:** `pi-extension/tests/task-memory/`, `pi-extension/tests/cache-reuse/task-memory.test.js`, `.skill-eval/track-work/tests/registry.test.mjs`
> **Verified at:** `cd02403c` (2026-10-11)

For contributors changing Freeflow task memory on Pi, a preview: how a session holds Working Records, how projects, child records and record ownership work, what reaches the model and when, the write gate, and the choices behind them. It is off unless `taskMemory.enabled` is set. User docs: [Task Memory](../../plugin-docs/capabilities/task-memory.md).

## Purpose

Track Work keeps one Working Record per task, but on its own the agent decides which record belongs to the work, finds it by path and recovers it by running a script; Freeflow compaction cannot name a record because it cannot tell which belongs ([Compaction](compaction.md), Decisions). Task memory makes the session know its records. The user attaches records (the model may propose one); one is the focus. Freeflow shows them in the Runtime State, delivers the focused record's resume view when it becomes the focus and when context is rebuilt, and refuses record writes to records the session has not attached.

Records can also be registered in a project. A registered record has a stable ID, lives in the project's store outside any repository (so removing a worktree does not delete it), and has one owning session. A registered task can have child records for parallel work: each child is worked in its own interactive session, and only the parent's session writes the parent.

It deliberately does not:

- require a record: a session with nothing attached gets no snapshot (its record writes are still refused until the user attaches the record);
- decide what a record says or when a task needs one: [Track Work](../../skills/track-work/SKILL.md) still owns that;
- change the record format: every record, registered or not, is a Track Work record created by its `init` and read through its `views.mjs`, so it stays valid for the script skill on other hosts;
- pass messages between a parent and its children: the user runs both sessions, and the parent reads children's records;
- treat subagents as children: Freeflow turns task memory off inside subagents, and a subagent works on its session's task;
- work under automatic Cognitive Routing yet: attaching is refused there.

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Primary directory | Where a registered task's effects belong: a repository or a worktree. Additional directories may be recorded too. | `environment.primary`, `environment.directories` |
| Fan-out | Creating a child together with its own Git worktree and branch. | `fanout()` |
| Session branch | The path of Pi session entries from the root to the current leaf; `/tree` moves between session branches. Not a Git branch. | `getBranch()` |
| Git branch | A branch in a repository; a fanned-out child works on its own. | — |
| Effective | Task memory is on: Freeflow enabled and `taskMemory.enabled` true, outside subagents. | `capability.taskMemory.effective` |
| Attached | A record this session may write (if it also owns it, when registered). Kept by absolute path. | `TaskState.attached` |
| Focus | The attached record attention is on; its snapshot is delivered. At most one. | `TaskState.focus` |
| Held | An attachment a fork or clone inherited: readable, not writable until the user confirms. | `TaskState.held`, `holdInherited()` |
| Task entry | One `freeflow-task-memory-v1` custom entry: `{ op, record, at }`, `op` one of attach, detach, focus, hold, confirm. | `TASK_ENTRY` |
| Snapshot | The focused record's `view resume` output, labelled with its ID or path and read time. | `snapshot()`, `SNAPSHOT_TYPE` |
| Freeflow home | `FREEFLOW_HOME`, default `~/.freeflow`: the registry file and project stores. | `freeflowHome()` |
| Registry | `<home>/registry.json`: projects, registered tasks, parents, owners. Owned by Track Work's library; Pi uses it through a facade. | `Registry` in `skills/track-work/scripts/lib/registry.mjs`; facade `pi-extension/src/task-memory/registry.ts` |
| Project | A named group of tasks with a store, `<home>/projects/<slug>/`, and linked repositories. | `Project` |
| Registered record | A record listed in the registry, with ID `<slug>/task-NNN`, the number Track Work's `init` gave it in the store. | `RegisteredTask` |
| Unregistered record | A record attached by path where Track Work keeps it (a repository's `.freeflow/tasks/`). No ID, owner or children. | — |
| Owner | The one session that may write a registered record. | `RegisteredTask.owner` |
| Child | A registered record whose `parent` is another registered task. A child has no children. | `RegisteredTask.parent` |

## How It Works

**Session state.** Every change appends a task entry with `pi.appendEntry`. Pi places it on the current branch and never sends it to the model. The state is a fold over the branch's task entries (`foldState()`), computed at `session_start` and `session_tree` and otherwise kept in memory; a write adds its entry to the in-memory list and folds again. `load()` then reads the attached records' names and IDs for the Runtime State.

**Track Work and the capability.** Everything portable is Track Work's: the record format and lifecycle, and also the registry, project stores, task IDs, children, owners, search and import, in `skills/track-work/scripts/lib/registry.mjs` and `search.mjs`, with `working-record.mjs` commands (`project new|link|show`, `task create|import|search|env|here|fanout`, and a task ID accepted as `--record`) that every host can run. The Pi capability adds what needs a harness: attaching, delivery, the write gate and takeover prompts, the Runtime State, and compaction integration. `pi-extension/src/task-memory/registry.ts` is a typed facade that loads the library on first use, so the extension never touches it while task memory is unused.

**Registry.** The library owns the file and hides its layout behind outcome operations (`createProject`, `linkProject`, `createTask`, `importRecord`, `own`, `release`, `children`, `projectFor`, `setEnvironment`, `environment`, `here`, `fanout`). Every change goes through `update()`: read the file, change a copy, write a temporary file, and rename it over the registry only if the file did not change since the read. A change by another session is re-read and the operation applied once more; a second conflict is reported and nothing is written. The check and the rename are two steps, not one atomic operation: a write by another session landing between them is lost. That window is accepted for the prototype. A registry that cannot be parsed is reported and never rewritten; registered features then fail with that message, writes to records inside the Freeflow home are refused because their owner cannot be checked, and unregistered records elsewhere work as before.

**Projects and tasks.** `/freeflow project new <name>` creates a project and links the current repository (its Git top level, or the directory outside Git); `link <name>` links another. A repository links to at most one project. `createProject` writes `store.json` at the store's root; Track Work's `taskRoot()` then uses the store's `tasks/` rather than a repository's `.freeflow/tasks/`, and an absolute store record path finds its own root (`storeOf()`). `task_memory` `create` runs Track Work's `init` with the store as `--root` (outside a Git repository `init` skips its ignore check) and registers the result. `/freeflow task import <record> <project>` moves an unregistered record's task directory into a store, with the next free number, after the user confirms. It does not check whether another session has the old path attached; that session's attachment then points at a missing file and its snapshot says so.

**Project index.** A registered task's snapshot gains a `Project … other tasks` block after its family block (`projectLines()`): the project's other tasks, excluding the task, its parent and its children, ordered by record file time, the first `PROJECT_INDEX_LIMIT` (15) with ID, task state and title, then a count of the rest. Only the listed records are read. The capability skill tells the agent to `view` or `search` them when they bear on the work; reading never needs attaching. `view` of a registered task without an entry ID shows the same family, project and environment lines before its resume view.

**Children.** `task_memory` `child` creates a child of the focused task; only that task's owner may. `/freeflow task child <parent-id> <title>`, run in the new session, creates the child and attaches it there. A child's record names its parent under `What defines this task`. Freeflow never writes the parent for a child; the `child` and `fanout` results include a ready Track Work command (`delegation()`: a retroactive `slice record` on the parent's ID) that the parent's session runs to record the split, since the split itself already happened when the user confirmed it. The parent's snapshot gains a `Children` block (one line per child: ID, title, task state, Current Slice, Next useful action, read from the child's record when the snapshot is made), and a child's snapshot gains a `Parent` line. Between snapshots, `view` and `search` read children's current records.

**Ownership.** Attaching a registered record calls `own()`, which checks and sets the owner in one registry update, so two sessions cannot both become owner. If another session owns it, the user is asked to take it over; declining leaves the record unattached. Detaching releases ownership only if this session owns it. A session that ends keeps ownership until another takes over: Pi gives no reliable signal that a session is gone. `/freeflow task confirm` on a held record takes ownership from whichever session owns it, without a second prompt: the command is the user's confirmation.

**Changes from the model.** `task_memory` can do everything `/freeflow task` and `/freeflow project` do, so the user works in plain language and the capability skill maps requests to actions. Its actions split by authority (`run()` and `ask()` in `tool.ts`): reads and attention changes (`projects`, `list`, `view`, `search`, `focus`, `detach`) run at once; every action that creates something or grants writes (`attach`, `create`, `child`, `fanout`, `project_new`, `project_link`, `import`, `confirm`, and `env` with a change) first asks the user with `ctx.ui.confirm`, and is refused without a UI. `create` is one dialog for creating the task and attaching it. A decline returns an error result saying not to retry or work around it, and writes nothing. The user's own commands run without these dialogs: typing the command is the confirmation. `/freeflow task` with no argument opens a picker over the repository's project tasks and `.freeflow/tasks/` records. Each change sets `refreshState`, so the next request carries the new `Task Memory:` lines.

**Transcript.** `render.ts` draws a `task_memory` call as one line (`Task memory · Attach my-app/task-003`) and its result as one line from `details.headline` (with the focused task's next action, and for fan-out the start command, which shows even collapsed); expanding shows the text the model read. Snapshot messages are sent with `display: true` and drawn by a message renderer as one line naming the task, its state and next action, expanding to the whole view. Rendering changes nothing the model receives.

**Delivery.** The snapshot reaches the model:

1. as the tool result of `task_memory` attach or focus;
2. as a `custom_message` (shown collapsed) after `/freeflow task` attach, new, focus or child;
3. after `/tree` navigation, reload, resume or a fork, through `deliver()`, unless the branch already holds a snapshot of that record since its latest compaction;
4. after a Freeflow compaction, as a fourth boundary entry after the compaction, carried context and recovery message (`snapshotEntry()` in `turn_end`);
5. after Pi's own compaction, through `deliver()` in `session_compact`.

**Search.** `task_memory` `search` reads the records in scope on each call (no index) and returns matching lines with the record ID and the entry heading and state each line sits under, at most 40. Scope `task` is the focus; `tree` is the focused task's root (its parent, or itself) and the root's children, and is refused when the focus is unregistered; `project` is every task in the focus's project, or the repository's project when the focus is unregistered.

**Gate.** `tool_call` checks, before routing's gate, whether the call would write a Working Record (`recordTargets()` in `runtime.ts`; the refusal comes from `TaskMemory.gate()`): `edit` and `write` by path, `apply_patch` by its `*** … File:` lines, and `bash` running `working-record.mjs` with a record-writing command (any `slice`, `checkpoint` or `decision` operation, `task set-state`, `task import`) by its `--record` and `--root`. A bash command is read segment by segment (split on `;`, `&&`, `||`, `|` and newlines) after expanding variables assigned earlier in the same command, so `S=<script>; R=<record>; node $S decision add --record "$R"` is checked like the literal form (Pi evals found agents writing that way past the earlier check). A segment with `--help` is not a write, since Track Work tells agents to read a command's help before preparing its input. A `--record` given as a task ID is resolved through the registry. A write whose record still cannot be read from the command (a variable assigned elsewhere, or no `--record`) is refused with a request for a literal path or ID. A script path held in a variable the command never assigns is not recognized as Track Work at all; Pi's bash tool starts a fresh shell per call, so such a command fails on its own. A target that is not attached, is held, or is registered and not owned by this session is refused, with a reason saying which. `--record` is resolved against `--root` when given, otherwise the session's cwd; a command that reaches a record without `--record` (after a `cd`, say) is not detected. `working-record.mjs init` is not gated. Views, `validate` and reads are never gated.

**Environment.** A registered task's environment (its primary directory and additional directories) is registry data, set by Track Work's library: `task create` records the repository root of its `--cwd`, fan-out records the new worktree, and `task env` changes it on request. Branches are never stored: `environment()` asks Git for the current branch and whether the directory is a worktree each time. A registered task's snapshot gains an `Environment:` line, and a warning when the session's cwd is outside the primary directory. Directories are advisory on Pi: its tools accept any path, so nothing is enforced.

**Fan-out.** `task_memory` `fanout` (or `/freeflow task fanout <title>`) from the focused task's owner calls the library's `fanout()`: create the child record, run `git worktree add -b <project>/<task-NNN>-<slug> <worktrees>/<repo>-<slug> HEAD` in the parent's repository (`<project>` is the project's slug, `<task-NNN>-<slug>` the child record's task directory name, `<repo>` the repository directory's name), copy the repository's `.freeflow/local.json` into the worktree when it has none (it is Git-ignored, so task memory would otherwise be off there), and record the worktree as the child's primary directory. A project's worktrees directory is set with `/freeflow project new|link <name> --worktrees <dir>` and defaults to the repository's parent. If the worktree cannot be created, the child stays registered with no environment, and the error says so; nothing is removed. Freeflow does not open a terminal or start the child's session: the user does, with the command the result gives (`startCommand()` in Track Work's library: `cd '<worktree>' && pi`, with `FREEFLOW_HOME='…'` before `pi` when the home is not the default, so the child finds the same registry). Track Work's CLI prints the same command for the agent named by `--agent`. Paths typed with a leading `~` (worktrees, directories) are expanded by the library (`directory()`), since commands typed in Pi are not expanded by a shell.

**Directory offer (Pi only).** At session start with nothing attached and a UI, Freeflow asks the library which registered task the session's directory belongs to (`here()`, deepest primary directory first) and asks the user whether to attach it. The dialog is not awaited, so startup finishes first. Yes attaches it (taking ownership as usual) and delivers its snapshot; no records a `decline` task entry on the session branch, which stops the offer for that task on that session branch, reloads included. A declined task can still be attached with `/freeflow task attach`. On other hosts, `task here` answers the same question when the agent or user asks it.

**Compaction** changes no task state: the entries stay on the branch, ownership stays in the registry, and only the focused record's snapshot is delivered again.

**Navigation and fork.** `session_tree` rebuilds the state from the new branch before routing's restore; a change is reported with a notice. On `session_start` with reason `fork` (Pi uses the same reason for clone), every inherited attachment gets a hold entry.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| Session state lives in branch custom entries and follows navigation. | Matches the conversation at that branch point and needs no store; Pi copies the branch on fork. | A per-session sidecar, where going back could write one task's discussion into another record. | `77815ab0` |
| Attaching grants writes and needs the user; focus grants nothing and is the model's call. | Authority stays with the user without confirming every change of attention. | One writable task per session. | `77815ab0` |
| Registered records live in a project store under the Freeflow home. | Removing a worktree no longer deletes task memory, and task numbers are stable per project. | Registry pointing at records left in worktrees. | `b51e51cc` |
| A store keeps records in `tasks/`, marked by `store.json`, not a repository's `.freeflow/tasks/`. | The store is not a repository; the marker makes the layout self-describing, so it does not depend on `FREEFLOW_HOME` agreeing across processes. | Nesting `.freeflow/tasks/` inside the store; detecting stores by their location under the home. | `0da5b5cd` |
| Task IDs reuse Track Work's `init` numbering in the store. | No format change and no second numbering scheme. | Global random IDs. | `b51e51cc` |
| One owner session per registered record; takeover only with the user's confirmation. | One writer per record without a merge contract; Pi cannot tell when a session has ended, so the user decides. | Relying only on Track Work's stale-write check. | `b51e51cc` |
| Children are interactive sessions; the parent's session alone writes the parent and reads children. | The user mediates, so no messaging is needed; subagents stay within their session's task. | Children writing the parent, which needs merging; subagents as children. | `b51e51cc` |
| Records are read and created through Track Work's own library and script. | One implementation of the record format, so records stay valid for the script skill on other hosts. | A copy of the format code in the extension. | `77815ab0` |
| The registry, search and import live in Track Work's library; Pi delegates to them. | Portable parts serve every host through the script; Pi adds only harness behavior. | Two Track Work products, one per kind of host. | `5fec4720` |
| The resume view opens by saying it is task memory, not an instruction, and that the user's latest message decides the work; the capability skill has the matching Rule. | In Pi evals on claude-haiku-5-5, with a record in focus the agent did the record's Next useful action instead of the user's request 3 of 3 times; with task memory off it did the request 3 of 3. | Relying on Track Work's general "the record is memory, not authority" Rule, which the agent had and still did not apply. | `00ab3048` |
| The gate refuses rather than warns. | A write to the wrong record is silent and hard to undo. | Warning only. | `77815ab0` |
| A fork's attachments are held. | Two sessions would otherwise write one record by accident. | Inheriting them writable. | `77815ab0` |
| Ships as an opt-in preview, off by default. | With it on, Track Work record writes on Pi are refused until the record is attached, so on by default would change every Pi user's Track Work; evals have 3 trials per case. | On by default; renaming the capability to Track Work on Pi (Track Work stays and pairs with it). | User, 2026-10-11 |
| Fan-out creates a worktree per writing child, at `<worktrees>/<repo>-<slug>` on branch `<project>/<task-NNN>-<slug>`, and copies `.freeflow/local.json`. | Each writing workstream needs its own effects boundary; the names match the user's worktree convention and show the task ID in Git; the copy keeps task memory on in the child. | Opening terminals or prepared session files, which Pi cannot do portably (a session file is written only once it has a message). | `6c48b37c` |
| A session in a task's directory offers that task, without blocking startup. | Makes fan-out a two-step handoff while the user still confirms. | Attaching silently; never offering. | `6c48b37c` |
| The model proposes every action, and a dialog decides those that create something or grant writes. | The user keeps the decision without having to type commands; reads and attention changes grant nothing. | Only the user creating projects (the first version); dialogs for every action, which would make reading noisy. | User, 2026-10-11 |
| A registered task's resume view indexes the project's other tasks (15 most recently changed, then a count). | Titles let the agent decide which other task to read, as the History index does for entries; without an index it finds only what it thinks to search for. Sorted by file time, so only the listed records are read. | Skill guidance alone; the whole project's records in the view. | User, 2026-10-11 |
| The tool is named `task_memory`, not `freeflow_task`. | On grok-4.7 (medium), the first call of a fresh session went to bash as `freeflow_task action=… name=…` in 5 of 5 runs with the old name, model-only, and 3 of 5 with direct exposure and codemode; renamed, the tool was called directly 5 of 5. The old name reads like the `/freeflow task` command the skill and docs also name. | `freeflow_task`, matching the other `freeflow_*` tools. | Harness runs, 2026-10-11 |
| `task_memory` is `model-only`. | It asks the user, which Pi reserves for model-only tools; called inside a codemode script its transcript views were bypassed (user trial on grok-4.7). | `direct` exposure (the first version). | User trial, 2026-10-11 |
| Delivered resume views are displayed, collapsed to one line. | The user sees when and which task memory the agent received. | Hidden messages (the first version). | User, 2026-10-11 |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| The `task-memory` skill is listed while task memory is off. | Pi's skill list is fixed (`STABLE_FREEFLOW_SURFACE`) so the system prompt does not change with settings; the tool is withdrawn instead. | The system prompt changes when the switch flips. |
| A shell write to a record by other means (`sed -i`, redirection) is not refused. | The gate guards a cooperating agent against the wrong record; Pi has no sandbox. | — |
| Reads of unattached or unowned records are allowed. | Reading grants nothing; a parent reads its children this way. | — |
| After `/tree` navigation the attached records and focus can change. | State follows the branch: the records attached at that point of the conversation. A notice reports the change. | A session-wide selection that ignores where in the conversation the user is. |
| Only the focus gets a snapshot; other attached records appear as Runtime State lines. | Progressive disclosure: the model focuses a record to get its resume view. | Every attached record's resume in context. |
| The resume view is enclosed in `<task-memory …>` tags with a closing line. | Delivered right before the user's prompt, it ends with the record's (often empty) Notes heading; providers may join consecutive user-role messages, and in Pi evals the agent took the user's request for the record's Notes. | Bare text, which reads straight into the next message. |
| A session that ended still owns its records. | Pi has no reliable signal that a session is gone; the next session asks the user to take over. | Automatic expiry would let two live sessions write one record. |
| A record can stay attached on a branch after another session took it over; its writes are then refused. | Attachment is per branch, ownership is global; neither copies the other. | — |

## Surface

- **Tool:** `task_memory` with `action` `projects`, `list`, `view`, `search`, `attach`, `focus`, `detach`, `create`, `child`, `fanout`, `project_new`, `project_link`, `import`, `confirm` or `env`, and `record` (a task ID or a `record.md` path), `project`, `name`, `worktrees`, `title`, `goal`, `entry`, `query`, `scope`, `primary`, `add_dir`, `remove_dir`. Results carry `details.headline`, `details.next`, `details.command`, `details.id` for rendering. Registered once with `exposure: "model-only"` (Pi's exposure for tools that ask the user: codemode scripts cannot call it, so its own transcript views apply); declared only while task memory is effective (`applyTaskMemoryTools()`).
- **Commands:** `/freeflow task` with no argument (picker), `list [project]`, `new <title>`, `attach <id or record>`, `focus <id or record>`, `detach <id or record>`, `confirm [record]`, `child <parent-id> <title>`, `fanout <title>`, `import <record> <project>`; `/freeflow project` (show the repository's project), `project new <name> [--worktrees <dir>]`, `project link <name> [--worktrees <dir>]`, `project list`.
- **Config:** `taskMemory.enabled` in `.freeflow/config.json` or `.freeflow/local.json`, or as a session override (`SESSION_OVERRIDE_KEYS`); default `false`; disabled inside subagents. `/freeflow settings` shows it as the Task Memory section on every scope. Changing it reloads the session like every capability switch, and `session_start` then rebuilds the state and delivers the focus. `FREEFLOW_HOME` moves the registry and stores.
- **Files:** `<home>/registry.json` (`version`, `projects` with `name`, `store`, `repos`, `worktrees`; `tasks` with `record`, `project`, `title`, `parent`, `owner`, `environment`); `<home>/projects/<slug>/store.json` (`version`, `project`) and `<home>/projects/<slug>/tasks/task-NNN-<slug>/record.md`.
- **Session entries:** `freeflow-task-memory-v1` custom entries (state), `freeflow-task-memory-snapshot` custom messages (`display: true`, drawn collapsed by `renderSnapshotMessage()`; `details.record`).
- **Runtime State:** a `Task Memory:` block while effective, with IDs for registered records; `/freeflow status` adds a `task memory` line.
- **Skill:** `capabilities/task-memory/SKILL.md`, listed with the other capability skills.

## Tests

- `pi-extension/tests/cache-reuse/task-memory.test.js`: on an OpenAI and a Claude model, each request is a prefix of the next, with the same tools and system prompt, through attach, focus, detach, a command attach, and after a Freeflow compaction.
- `pi-extension/tests/integration/request-path-budget.test.js`: a scenario with a focused record keeps Pi branch walks per prompt bounded and independent of session length; `npm run perf:request` has a matching `task memory, one record in focus` scenario.
- `pi-extension/tests/integration/pi-extension.test.js` and `unaffected-regressions.test.js`: the Task Memory settings section, off by default, its status line, and the session switch.
- `state.test.js`: the state fold, which tool calls write a record, the fork hold and confirm, and the refusal under automatic routing. The fork path is tested here because the SDK session the native fixture uses cannot fork.
- `.skill-eval/track-work/tests/registry.test.mjs` (Track Work's suite): projects, tasks and children through `init`; one owner with takeover and owner-only release; a concurrent change re-applied and a second conflict writing nothing; an unreadable registry left untouched; import; the CLI commands, including a task ID as `--record`; environment and `here` with nested directories; fan-out creating worktree, branch and config, and its failure leaving the child registered.
- `session.test.js`: native, unregistered records: attach confirmed and declined, attach by command, the gate, off by default, reload, navigation, and delivery after Pi's and Freeflow's compaction.
- `environment.test.js`: native: the `Environment:` line and the outside-directory warning; the directory offer attaching a task, and a decline not repeated across reloads; fan-out from the owner creating the worktree, branch and copied config.
- `agent-actions.test.js`: native: the agent creating a project (declined, then confirmed) and a task in one dialog; reads with no dialog; fan-out's start command; the project index in a resume view; `/freeflow task new` and `/freeflow project list`; how calls, results and delivered views render.
- `tree.test.js`: native, registered records: a parent with a child (the `Children` block, tree search, view by ID), a child created from its own session (the `Parent` line), a write refused after another session took the record over, and a declined takeover.

Every test sets `FREEFLOW_HOME` to a temporary directory.

## Related

[Compaction](compaction.md), [Prompt assembly](prompt-assembly.md), [Track Work](../../skills/track-work/SKILL.md).
