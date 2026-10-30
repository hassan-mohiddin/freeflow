# Working Record Format

This reference owns where Schema 5 task memory lives and its exact shape: the Freeflow store and its sync, projects and holds, the task folder and each of its files, the record's sections, fields and states, and the command contract. It is binding as written, with the Rules below. It defines format, not what is worth recording; [Track Work](../SKILL.md) owns that judgment. A record whose header says `Schema: 4` is read only by `migrate`, which converts it.

## Rules

- Make the store, add its remote, create or remove a project, and create, move or remove a task only when the user asks or says yes to your question. A removal is a delete and a commit that Git history keeps: never delete the store's files another way, and never rewrite, reset or force-push its history.
- The store goes only to the user's own private remote. Never push it, or copy its records, anywhere else.
- When a sync stops on a conflict, show the user both copies and stop work on that file until they say what stays; never take one side to make the sync pass.
- Write the store only through the script and the direct edits Track Work allows; never commit, pull or push in the store by hand.

## The Store

The Freeflow store is one Git repository at `FREEFLOW_HOME` (default `~/.freeflow`) that holds every task's memory, its records tracked on purpose:

```text
<FREEFLOW_HOME>/
  store.json             marks the store
  .gitignore             scratch/, evidence/**/raw/, local/, sessions/
  .gitattributes         history.md and sessions.md merge by keeping both sides' lines
  rules/                 the user's standing rules, read for every task
  projects/<project>/
    rules/               read for this project's tasks
    tasks/task-NNN-<short-name>/
  tasks/task-NNN-<short-name>/   a task in no project
  local/                 this machine only: where each repository is, sync state, conflicts
  sessions/              this machine's live sessions: worker maps, session summaries
```

`rules/` holds the user's always-on context, like `CLAUDE.md` with room to organize: every file in the store's `rules/`, and the project's once the session holds one of its tasks, is read at every recovery and never counted against the budget. Create or edit a rule only when the user asks; the checks show their size, and you never trim them.

**Local or cloud.** The same store either way. A local store, the default, lives on this device only: `store init` makes it, and nothing leaves the machine. A cloud store is the same store with the user's private repository as its remote, kept in step on every device: `store init --remote <url>` clones it into `FREEFLOW_HOME`, laying out an empty repository as a store or joining one that already is, and `store remote --url <url>` moves a local store's whole history into an empty repository. A cloud session needs a cloud store, since its container is thrown away: the store's repository is one of the session's repositories, `FREEFLOW_HOME` points at its clone, and pushing needs the host's access to that repository; Setup Freeflow's [store setup](../../setup-freeflow/references/store-setup.md) says what the user sets, and `session status` lists what is missing. `store init` refuses a folder that holds Pi's former Task Memory (`registry.json`) or anything else: ask the user where the store should go. Commits are authored as the user, with no trailers.

## Sync

| When | What runs |
| --- | --- |
| Session start | The remote's commits are taken under the local ones: Freeflow's harness layer runs `store sync --pull`; elsewhere, run it yourself. |
| `task take`, `release`, `switch` | The hold is written, committed and pushed. |
| A Slice, agreement or delegation closes; each `checkpoint` | Commit, take the remote's commits, push. |
| A turn that changed the store ends; the session ends | Freeflow's harness layer runs `store sync`; elsewhere, run it yourself after direct edits you need kept. |

`store status` says, with no network, what is not committed or not pushed and when the store last synced. A local store commits and has nothing to push.

When a sync fails:

- **The remote moved:** the sync takes its commits and pushes again by itself.
- **No network or no access:** the commits stay on this machine, the output says so, and the next sync pushes them. Work never waits on the network.
- **A secret in the changes:** the push stops and names the path, line and kind. Remove it from the file, and tell the user if it was real, then sync again; never push it.
- **A file both sides changed** (other than `history.md` and `sessions.md`): this store's copy stays in place, committed and not pushed, and the remote's goes under `local/conflicts/`. Show the user both, merge what they say should stay into this store's file, then run `store sync --resolved`.

## Projects

A project is a folder, `projects/<project>/`, with its `rules/` and `tasks/`; a task belongs to the project whose folder holds it, and its ID is `<project>/task-NNN`. A task in no project is in the store's own `tasks/`, its ID `task-NNN`; `task create` puts it there with `--no-project`, or when no project's tasks name the repository. A session finds its project by matching the repository's remote against the repositories its tasks name in Space; a folder with no repository, or one no task names, such as the store's own, gets every project's open tasks. The store writes nothing into code repositories; only a task kept without a store lives in one, in its Git-ignored `.freeflow/tasks/`.

```text
working-record.mjs project new --name <name>                         a project, on the user's word
working-record.mjs project list                                       every project, its tasks and repositories
working-record.mjs project show [--name <project>]                    a project's tasks; without --name, this repository's menu
working-record.mjs task here [--cwd <directory>] [--rules]            the session-start menu, and with --rules the rules after it
working-record.mjs task search --query <words> [--project <p>]       every task's record, history and decisions
working-record.mjs task remove --id <ID> | project remove --name <p>   delete and commit, on the user's word
working-record.mjs task move --id <ID> (--project <p> | --no-project)  into a project or out of one, on the user's word
```

`task move` moves the task's folder, gives it the next number free in its new place, then commits and pushes; the output prints the new ID. The old ID no longer names the task, its delegations' briefs name the new one, and Git history keeps the old path. It is refused while another session holds the task. Creating, taking, releasing and switching tasks are in Lifecycle Commands, below.

### Other Tasks In The Project

Each task keeps its own record. The project index in recovery lists the other tasks, each with its cue. Read one (`task search --query <words>`, then `view recover --record <ID>` or `view entry`) when it bears on what you are about to decide or build, and search the project before settling something another task may already have settled. Use what you read as evidence about that task, name it when it shapes your work, and record what matters to this task in this task's own record, never in the other one.

### Where A Task's Work Happens

Space names every repository the task changes, and `local/` where each one is on this machine. Make the task's changes in those repositories; work in another belongs to another task unless the user says otherwise. `checkpoint` writes the Space line for the repository it runs in, or the one `--repo` names.

### Removing

`task remove` and `project remove` delete the folder, then commit and push; the output says how to bring it back from Git history. Run them only when the user asked for that task or project to be removed. A removed task's number is never reused.

## Holds

A task's `sessions.md` keeps one line per session that held it; its last open line is the hold. A take refused because another session holds the task names that session and when it last synced: ask the user before `--takeover`; that session learns at its next sync and stops writing.

- **A compaction** keeps the session and its hold.
- **`/clear`** starts a new session: the old one's end releases the hold, and the new menu lists that task first.
- **A fork** has a new session ID; taking the task asks first, since the session it forked from still holds it.
- **A session reopened later** finds its hold by its ID. If the task was taken over meanwhile, ask before taking it back; if it changed, recover.
- **A cloud session that goes idle** keeps its hold until another session takes the task over.

A task has one holder, so work that must run in parallel interactive sessions is separate tasks, each with its own record; parallel work inside one session is delegation (Execute Work's [delegation](../../execute-work/references/delegation.md) reference).

## Task Folder

```text
task-NNN-<short-name>/
  record.md          the state                                    the session holding the task
  history.md         closed Slices, agreements and delegations    the closing commands
  sessions.md        every session that held the task            task create, take, release and switch
  decisions.md       the open agreement's decision list           the session holding the task
  sources/           material from outside the work, notes        the session holding the task
    discussion.md    the user's messages that shaped the work     discussion save and drop
  delegations/       one folder per delegation                    whoever hands the work out, and each worker
  evidence/<slug>/   README.md kept; raw/ ignored                 whoever ran it
  specs/  plans/     when the task has them                       Write Docs
  scratch/           temporary, ignored                           anyone
```

In the Freeflow store the folder is `<store>/projects/<project>/tasks/task-NNN-<short-name>/`, and its ID is `<project>/task-NNN`, or in no project `<store>/tasks/task-NNN-<short-name>/`, and `task-NNN`; every command that takes `--record` also takes the ID. A task kept before the store, without one, is in `<repository>/.freeflow/tasks/task-NNN-<short-name>/`, which Git must ignore, until it is moved into the store. `NNN` is three or more digits; a new task takes the next number after the highest one there, and numbers are never reused. `init` and `task create` write `record.md`, `history.md`, `decisions.md` and `scratch/`, and `task create` also `sessions.md`; the rest appear when needed. Nothing anything points to is ever under `scratch/`. `sources/notes.md` holds free notes when a task wants them; they carry no authority.

A delegation's folder, `delegations/D-NNN-<slug>/` with `brief.md`, `progress.md` and `return.md`, and a sub-worker's inside its worker's, are Execute Work's [delegation](../../execute-work/references/delegation.md) reference's.

## record.md

`init` writes every structural heading:

```markdown
# <task name>

Schema: 5 · State: active · Budget: normal
Cue: read when <situations this task matters to>
State as of: <UTC ISO-8601 time>

## Current Context

### Goal

### Settled

### Open

## Current Work

### Delegations

### Space

### In flight

### Defined by

### Read on recovery

### Read when

### Next action

## Future Work
```

The three top-level sections are fixed, in this order. Current Work holds its seven headings in this order; while an agreement is open, `### Agreement A-NNN — <title>` comes first, and while a Slice is current, `### Slice S-NNN — <title>` follows it, both before Delegations.

### Header

| Line | Holds |
| --- | --- |
| `# <task name>` | The task's name. |
| `Schema: 5 · State: <state> · Budget: <mode>` | The task state (`active`, `paused`, `completed`, `abandoned`) and the budget mode (`normal` or `expanded`; `normal` when absent). |
| `Cue:` | When the task matters, starting "read when", in at most 25 words. The menu and the project index show it. |
| `State as of:` | When the record was last checkpointed: `init` and `checkpoint` set it, nothing else. Where Freeflow compacts for the harness, it counts a checkpoint as done when this is later than the compaction cycle's notice, or, with no notice in it, than its start. |

### Fields

Structured blocks use field rows:

```markdown
- Field: one-line value
  continued on lines indented two spaces
```

Use only the fields defined for the block; omit an optional field that has no value, never writing an empty label. Every line inside a block belongs to a field or an update line; stray text is invalid. IDs are assigned by commands and never change or get reused: `A-NNN` agreements, `S-NNN` Slices, `D-NNN` delegations and `D-NNN.n` sub-workers' delegations, `B-NNN` discussion blocks. They follow recording order. Proposed Slices have no ID.

### Current Context

Bullets under Goal, Settled and Open, in about 600 words in every mode and window. It is written at `init` and rewritten whole before each `checkpoint`; `agreement close` also adds to Settled the choices that still govern.

| Heading | Holds |
| --- | --- |
| Goal | The outcome or central question; not the current mechanism. |
| Settled | Facts and accepted choices that still govern the task. |
| Open | Questions that could change the work, and proposals the user has not answered, each `Proposed: <proposal> (<date>)`. |

### The Agreement

```markdown
### Agreement A-003 — Retries for 503

- Opened: 2026-10-29
- Done when 503s are retried with backoff and the pull request is open. You: "go" (2026-10-29)
- Without asking: change src/http/ and its tests.
- Ask first: merging.
- Back at the pull request.
- Update: Narrowed to diagnosis: "just find the cause first" (2026-10-30)
```

`agreement open` assigns the ID and writes `Opened` and its lines; each line starts with the lead words for the part it states (`Done when`, `Without asking:`, `Ask first:`, `Back at`, `Holds until`) and quotes the user where it rests on their reply. `agreement update` appends one `Update:` line. `agreement close` moves the block, with `decisions.md`'s list, into History.

### The Slice

```markdown
### Slice S-024 — Add the retry loop

- State: in_progress
- Opened: 2026-10-30
- Under: A-003
- Result wanted: 503 responses retried three times with backoff.
- Scope: src/http/client.ts and its test.
- Done when: the test sends three 503s and sees three attempts.
- Stop if: a caller relies on a single attempt.
- Started from: main at 1a2b3c4d; no retry.
- Waits on: D-012
- Predicted: context 40,000, working 25 min, $1.20; median of 6 Slices of this task
- Measured: context 12,000 over 1 compaction cycle(s); working 8 min, wall 15 min; claude-opus-5-5 high: 2 in, 3,000 written, 400,000 read, 9,000 out, $0.28; as of 2026-10-30T10:15:00.000Z at 52,000 tokens
- Evidence (observed): the retry test passes — scratch/retry-test.txt
- Result: commit 5e6f7a8b
```

| Field | Required | Values |
| --- | --- | --- |
| State | yes | `in_progress`, `paused` |
| Opened | yes | The date the Slice started. |
| Under | yes | The open agreement, `A-NNN`. |
| Result wanted | yes | |
| Scope | yes | |
| Done when | yes | The evidence that shows it is done. |
| Stop if | yes | |
| Started from | yes | The state of what this Slice will change; a Slice that continues closed work names it here. |
| Waits on | no | The delegations whose result it needs, `D-NNN`, comma-separated. |
| Dependencies | no | |
| Predicted | no | Written by `slice start`: the median context, working time and cost of the nearest of this task, its project and the store holding 3 measured Slices, each figure scaled `(×<n>)` by the median of actual over predicted where 3 past predictions have their actual. None when too few are measured. |
| Measured | no | Written by `slice start`, `checkpoint` and `slice close`: the context the Slice added and the compaction cycles it touched (`partly measured` where a reading missed some), working and wall-clock time, then per model and effort its billed tokens (input, cache written, cache read, output) and their cost at API list price, and the last reading. Read from the harness's transcript, or `--used`; none when neither is available. |

After the fields come its update lines, one line each, a kind and then the claim and its pointer; the detail lives in the file the line points to. The kinds: `Evidence (observed)`, `Evidence (reported)`, `Result`, `Review`, `Review gate`, `Contradiction`, `Blocker`, `Correction`, `Paused`, `Resumed`, `Extension`. `slice pause` and `slice resume` write the `Paused` and `Resumed` lines; the rest are direct edits. An Evidence line identifies the state it observed well enough to tell it apart from later versions; append counterevidence as a new line instead of rewriting the earlier one, and label what you did not observe yourself `reported`.

Two kinds have a fixed shape, so outcomes and rounds can be counted later. [Review Work](../../review-work/SKILL.md) says when each is written:

```markdown
- Review gate: mode: auto | off | always; tier: standard | security | none; because: <trigger> | no trigger; result: dispatched | proposed | skipped
- Review: round: R1 | R2 | R3; reviewer: <model> (<family>); judgment: <adjudicated judgment>; Accepted: <n>; Rejected: <n>; Open: <n>; reviewed: <commit or version>; report: <path>; effect: <the next route>
```

`in_progress` means the Slice's result is being pursued. `paused` means it is still current but safe continuation is suspended; an ordinary turn, feedback, or a context boundary is not a pause.

### Delegations

One line per open delegation, written by `delegate open`, changed by `delegate check-return` and removed by `delegate close`:

```markdown
- D-012 — Read the callers (gather, Haiku xhigh) · under A-003 · from S-024 · running · delegations/D-012-read-the-callers/brief.md
```

The state is `running` or `returned`. A sub-worker's delegation has no line here; its worker reports it.

### Space

One line per repository the task changes, written by `checkpoint` for the repository it runs in (or `--repo`):

```markdown
- github.com/acme/widget · retry-503 · 5e6f7a8b · pushed
```

The remote as host/owner/repo (or the path when it has none), the branch, the commit, and `pushed` or `not pushed`.

### In flight

Rewritten whole by `checkpoint --input`; each line starts with its label:

```markdown
- Now: the retry loop is written; its test is not.
- Observed: no caller assumes one attempt — delegations/D-012-read-the-callers/return.md
- Hypothesis: the 503s come from the proxy's health check (unverified)
- Dropped: retrying inside fetch() — it hides the attempt count from the test
- Pending: CI on 5e6f7a8b — its result
- Carry: src/http/client.ts (lines 10–40) — the loop under test
- Carry: result toolu_01AbC (Bash: npm test) — the two failures the fix answers
```

A `Carry` line names a context item and why the next compaction cycle needs it, and what it carries counts toward the budget:

- a file, optionally its lines, which the bundle copies fresh;
- a tool result, `result <n>` with its number in `carry list`, which `checkpoint` pins to the result's tool-use ID and what its call was for, as above; the bundle copies it whole, as it was, from the session's transcript, and the checks name one the transcript no longer holds.

The bundle then adds this compaction cycle's newest tool results that no line carried, whole, within the carry budget (15% of the window, at most 40,000 tokens), and lists older ones by ID; results under 25 tokens are left out. An input of `none` empties In flight, and a labelled line that says only `none` (`- Carry: none`) is left out.

### Defined by, Read on recovery, Read when

One bullet per source, a pointer then what it establishes:

```markdown
### Defined by

- specs/retry.md — the accepted retry policy.

### Read on recovery

- sources/discussion.md — the user's messages that shaped the retry policy.

### Read when

- docs/benchmarks.md — baseline timings; read when measuring performance.
```

| Section | What goes there | Recovery | Budget |
| --- | --- | --- | --- |
| Defined by | Accepted Specs, Plans, issues, briefs and other definitions, and the skills the work follows beyond Track Work, Discuss Work and Execute Work | reads each whole | not counted |
| Read on recovery | Memory the agent shaped that the next context must read | reads each whole | counted |
| Read when | Sources only some situations need; each line names its trigger, "read when <situation>" | reads each once its trigger applies | counted when read |

A pointer is a path (from the task folder, else from the work repository's root, else from each repository in Space at its path on this machine), an absolute path, a `~/` path, a URL, or a commit; start each entry with it. A Defined by or Read on recovery entry that names no pointer is never read for you, and the checks say so. `sources/discussion.md` is a Read on recovery source while it holds blocks.

### Next action

One bullet: a concise action, or an honest wait or stop condition. The Slice and task-state commands require `--next-action` and replace it with that text; the agreement commands replace it when given one.

### Future Work

```markdown
### Slice — Add the CLI

- Result wanted: A CLI that exposes the parser.
- Done when: a test for each subcommand.
- Dependencies: S-024 closed.
```

Proposed Slices only, each under its own `### Slice — <title>` heading, in about 300 words in all. `Result wanted` is required; `Done when` and `Dependencies` are optional. Titles are unique. A plain line under `## Future Work` is invalid. Order is a recommendation and confers no authority.

## history.md

```markdown
# History: <task name>

## S-001 — Write the parser

- State: completed
- Dates: 2026-10-27 to 2026-10-28
- Cue: read when the parser's shape is in question
- Under: A-001
- Result wanted: A parser.
- Result: It parses record.md.
- Evidence: record.md
- Task effect: Commands can read the record.
- Updates:
  - Evidence (observed): the parser ran — record.md
- Correction: Result; before: parses; after: parses record.md; reason: clarity
```

One entry per closed Slice, agreement or delegation, appended by the command that closes it and never edited; Git merges the file by keeping both sides' lines. `Dates` is `YYYY-MM-DD` or `YYYY-MM-DD to YYYY-MM-DD`. Every entry has a `Cue`: when the entry matters, not what it holds, starting "read when", in at most 25 words.

| Entry | States | Fields |
| --- | --- | --- |
| Slice | `completed`, `blocked`, `abandoned` | State, Dates, Cue, Under, Result wanted, Result, Evidence, Task effect; Resume when (blocked), Reason (abandoned), Predicted, Measured (`not measured` when no reading was taken), Updates; Recorded (`slice record`) |
| Agreement | `completed`, `ended`, `replaced` | State, Dates, Cue, Lines, Result, Task effect; Updates, Decisions |
| Delegation | `accepted`, `sent back`, `stopped` | State, Dates, Cue, Under, Kind, Agent, Result, Return; From, Tokens, Minutes, Measured (from the worker's own log, or `not measured`), Task effect, Merge commit |

A clerical fix is appended inside its entry as one more `Correction:` line (the field, before, after, reason); it never changes an entry's state, ID or meaning. `view index` lists every entry in one line; recovery shows the newest within the budget and any the record names.

## decisions.md

```markdown
# Decisions

- P1 [agreed] When jobs pile up, which runs first? -> oldest first. You: "go" (2026-10-20)
- T1 [default] FIFO array in queue.ts -> serves P1
```

The open agreement's decision list, one line per item in Discuss Work's format, kept directly as items change. `agreement close` moves it into the agreement's History entry and leaves `# Decisions` alone in the file.

## sessions.md

```markdown
# Sessions (times in UTC)

- 788323ff · Claude Code · cloud · 2026-10-29 03:45 – now · holding · https://claude.ai/code/session_…
- 4b1e90c2 · Pi · laptop · 2026-10-28 21:10 – 23:02 · released · <Pi's resume command>
```

One line per hold: the session, the harness, where it ran, from and to, how it ended (`holding`, `released`, `taken over`), and the way back to it. The last line that says `holding` is the hold. Only `task create`, `task take`, `task release` and `task switch` write it; Git merges it by keeping both sides' lines.

## sources/discussion.md

```markdown
# Discussion: <task name>

The user's messages that shaped the work, word for word, in blocks; under each message, the agent's line saying what it answered. Blocks are added or dropped, never edited.

Last block: B-002

## B-002 — Retry policy · 2026-10-29 14:02 to 14:20 · shapes A-003, S-024 · replaces B-001

### You, 2026-10-29 14:02

> Three attempts is enough, but never retry a POST.

Agent: answered whether POST requests are retried, after I proposed retrying every method.
```

Only `discussion save` and `discussion drop` write it.

## The Session Summary

A session that holds no task checkpoints into `<store>/sessions/<session ID>/summary.md` with `checkpoint --session --input -`: the headings `## Goal`, `## Settled`, `## Open`, `## Agreement`, `## In flight`, `## Read when` and `## Next action`, in that order, with `(none)` where one has nothing; Goal and Next action must say something; In flight takes the same Carry lines as a record's, files read from the session's folder. Freeflow's compaction installs it after the store's rules, with what it carries and this compaction cycle's newest tool results, and removes it. The store's `sessions/` folder is this machine's only and is never synced.

## Task State

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active
```

Only the user changes task state, through `task set-state`. A new task starts `active`. Pausing the task pauses its Slice; reactivating it resumes nothing. A completed or abandoned task has no Slice: close it first. Completing a Slice never completes the task. Before completing or abandoning a task, keep a proposal in Future Work only if it is clearly non-binding; otherwise reconcile it first.

## Lifecycle Commands

Run `working-record.mjs <group> <operation> --help` for each command's options and input fields. `--input -` reads the input from stdin. An input holds only the fields its help lists; commands set states, dates and IDs themselves.

| Change | Command |
| --- | --- |
| Create a task | `task create --title <title> --goal <goal> --cue <cue> [--project <p> \| --no-project]` in the store (this session holds it) |
| Hold a task, give it up, move to another | `task take --id <ID> [--takeover]`, `task release`, `task switch --id <ID>` |
| Move a task into a project, or out of one | `task move --id <ID> (--project <p> \| --no-project)`, on the user's word |
| Open, change, close the agreement | `agreement open`, `agreement update`, `agreement close --state <completed\|ended\|replaced>` |
| Propose a Slice | `slice propose` |
| Start a proposed Slice, or one never proposed | `slice start --title <proposal title>`, `slice start-direct` |
| `in_progress` ↔ `paused` | `slice pause`, `slice resume` |
| Close the current Slice | `slice close --state <completed\|blocked\|abandoned>` (blocked from paused) |
| Record a Slice that finished before it could be recorded | `slice record --state <state>`: History only; Current Work and Future Work unchanged |
| Hand work to an agent, and close it | `delegate open`, `amend`, `status`, `check-return`, `close`; with no task, `delegate open --scratch <folder>` and `check-return --scratch <folder>`, which record nothing |
| Checkpoint | `checkpoint --record <ID> --input -`; `checkpoint --session --input -` without a task; either with `--compact` to have Freeflow's harness layer compact when the turn ends, which it does only on that request |
| Save or drop discussion | `discussion list`, `discussion save`, `discussion drop` |
| A tool result to carry into the next compaction cycle | `carry list` numbers this compaction cycle's results; `carry show --id <ID or n>` prints one whole; both change nothing |
| The budget | `budget [--record <ID>]`; `task set-budget --mode <normal\|expanded>` on the user's word |
| The context used, and whether the rest fits in this compaction cycle | `estimate [--used <tokens>] [--done <n> --left <m>]`: changes nothing; `--used` where the harness shows the use and the script cannot read it |
| The Slices left, sized from measured ones, across compaction cycles; a project's or the store's measured use | `estimate --plan [--record <ID>] [--input -] [--fan-out <n>] [--json]`, `estimate --project <name>`, `estimate --store`: change nothing |
| Change the task state | `task set-state --state <state>` |
| Convert a Schema 4 record | `migrate`, on the user's word |

A Slice that continues closed work is a new Slice that names it in `Started from`. Every command validates the task folder before and after the change and publishes one complete valid result or nothing; those that change the store then commit and push it.

| Exit code | Meaning |
| --- | --- |
| 0 | The change was published, or there was nothing to change. |
| 1 | Nothing was written. The error says why. |
| 2 | The outcome is uncertain: the write may have happened. Read `view full` before retrying or editing. |

## Direct Edits

Edit directly:

- Current Context's bullets;
- a Slice's update lines and the wording of its optional fields;
- Defined by, Read on recovery, Read when and the Next action;
- the order, wording or removal of Future Work's proposals;
- `decisions.md`'s items;
- a `Correction:` line appended inside a History entry.

Never edit directly: IDs, `State` fields, `Opened`, `State as of`, `Predicted` and `Measured`, the agreement's lines and updates, Delegations, Space, In flight, `sessions.md`, `sources/discussion.md`, or any History entry beyond appending a correction. After a structural edit, run `validate --record <ID>`. It checks the task folder's structure and lists pointers that do not resolve, as warnings, since a line may name a planned path or a commit not fetched yet; `--strict` fails on those an Evidence or Result line names. It cannot detect a hand-made state change or a deleted entry, so those edits are forbidden rather than checked.

## Views

Views print and change nothing.

- `view recover [--delegation <D-NNN>]`: the opening line (the record is memory; the user's direction decides the work), the store's and the project's rules, `record.md`, the active decisions within their budget, the History index, the project's other tasks with their cues, and the checks: the task folder's path, the budget, pointers that do not resolve, open delegations, the hold, the store's changes not yet synced, and where each repository in Space stands; then the line saying what to read next. With `--delegation`, a worker's: its rule and its delegation's brief, progress and return first.
- `view bundle`: the same, then every source recovery reads, whole, In flight's carried files and results, this compaction cycle's newest tool results within the carry budget with the rest listed by ID, the counted and uncounted sizes and the recovery line: what Freeflow's compaction installs. `--fallback` is what Freeflow adds after the harness's own summary when the compaction came before the checkpoint; `--session` is a session summary's bundle.
- `view entry <ID> [<ID> ...]`: the named History entries as stored, in the order given; an unknown ID prints nothing and fails.
- `view index`: every History entry, one line each.
- `view full`: `record.md` as stored, valid or not; use it after an uncertain write or a failed validation.
