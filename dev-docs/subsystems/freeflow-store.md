# Freeflow store and Schema 5 tasks

> **Covers:** `skills/track-work/scripts/working-record.mjs`, `skills/track-work/scripts/lib/freeflow-store.mjs`, `skills/track-work/scripts/lib/store.mjs`, `skills/track-work/scripts/lib/record5.mjs`, `skills/track-work/scripts/lib/transitions5.mjs`, `skills/track-work/scripts/lib/views5.mjs`, `skills/track-work/scripts/lib/projects5.mjs`, `skills/track-work/scripts/lib/delegations5.mjs`, `skills/track-work/scripts/lib/migrate5.mjs`, `skills/track-work/scripts/lib/discussion5.mjs`, `skills/track-work/scripts/lib/carry5.mjs`, `skills/track-work/scripts/lib/budget5.mjs`, `skills/track-work/scripts/lib/estimate5.mjs`, `skills/track-work/scripts/lib/measure5.mjs`, `skills/track-work/scripts/lib/planner5.mjs`
> **Tests:** `.skill-eval/track-work/tests/`
> **Verified at:** `da8bc00c` (2026-10-30)
> **User docs:** `plugin-docs/using-freeflow.md`

For anyone changing how Track Work's script keeps task memory: the Freeflow store, the Schema 5 task folder, the commands that change it, the views recovery reads, delegation, and the measurement and planning built on them. The skill that teaches the agent when to use these is [Track Work](../skills/track-work.md); Pi's Task Memory, which still keeps Schema 4, is [Task memory](task-memory.md); Claude Code's mod, which calls this script at the right moments, is in the [overview](../README.md).

## Purpose

An agent working for days, across many compactions, sessions and machines, needs memory that outlives every one of them, stays current and stays small enough to read back. The store and Schema 5 give it that: every task's memory in one private Git repository that syncs itself, a task folder whose state is rewritten and whose logs are appended, and a script that makes every lifecycle change, so the agent edits only meaning.

It replaces, for every harness but Pi, Schema 4's single growing `record.md`, Pi's registry of projects and child records, and the rule against opening a record. It does not decide what is worth recording (the skill does), it never authorizes work (the record is memory, not authority), and it writes nothing into a code repository.

## Vocabulary

| Term | In the code |
| --- | --- |
| Store | The Git repository at the Freeflow home (`FREEFLOW_HOME`, default `~/.freeflow`), marked by `store.json` with `kind: freeflow-store`; `isFreeflowStore`, `freeflowStoreOf` in `store.mjs`. Local, or cloud with the user's private remote. |
| Project | A folder `projects/<project>/` holding `rules/` and `tasks/`; a task in no project sits in the store's own `tasks/`. |
| Task folder | `task-NNN-<slug>/`: `record.md`, `history.md`, `decisions.md`, `sessions.md`, `sources/`, `delegations/`, `evidence/`, `scratch/`. Its ID is `<project>/task-NNN`, or `task-NNN` (`STORE_TASK_ID` in `projects5.mjs`). |
| Hold | The last line of a task's `sessions.md` that says `holding`: which session may write it. |
| Agreement, Slice, delegation | `A-NNN`, `S-NNN`, `D-NNN` (and `D-NNN.n` for a sub-worker), each with one History entry when it closes. |
| Compaction cycle | From a session's start or a compaction to the next compaction or the session's end. |
| Bundle | Everything recovery reads, in one text (`view bundle`): what Freeflow's compaction installs as the conversation. |
| Carry | What In flight names for the next compaction cycle: a file read fresh, or a tool result read from the session's transcript by its tool-use ID (`carry5.mjs`, P2). |
| Recovery budget | The words of memory the agent shapes that recovery may read, scaled by the square root of the context window (`budget5.mjs`). |
| Measure | One Slice's or delegation's use: context added, compaction cycles touched, working and wall-clock time, and billed tokens and list-price cost per model and effort (`measure5.mjs`). |

## How It Works

**The store.** `store init` makes a local store: `store.json`, `.gitignore` (`STORE_IGNORE`: `scratch/`, `evidence/**/raw/`, `local/`, `sessions/`), `.gitattributes` (`STORE_ATTRIBUTES`: `history.md` and `sessions.md` merge by union), `rules/`, `projects/` and `local/`, the user's Git identity, and a first commit; the store's `tasks/` appears with its first task in no project. `store init --remote <url>` clones the user's private repository into the home instead, laying the store out when it is empty and joining it otherwise; a home that already holds an empty clone of that remote, as a cloud session has it, is used as it is (`isEmptyCloneOf`). `store remote --url` moves a local store's whole history into an empty remote. Every commit is the script's, authored as the user, with no trailers.

**Sync** (`syncStore` in `freeflow-store.mjs`). It commits what changed, scans the added lines for secrets (`SECRET_PATTERNS`), takes the remote's commits under the local ones, and pushes. A refused push takes the remote's commits and tries again; no network or no access (the fetch or the push fails) leaves the commits local and says so, and the next sync both takes the remote's commits and pushes. A conflict in any file other than the two union-merged ones aborts, keeps this store's version in place, committed and not pushed, puts the remote's copy under `local/conflicts/` (ignored, on this machine only), and stops until `store sync --resolved`. The harness layer runs `store sync --pull` at session start and `store sync` at a turn's end; holds, closes and checkpoints sync themselves.

**Tasks and holds** (`projects5.mjs`). `task create` makes a task folder in a project or in none and opens the hold; `task take`, `release` and `switch` append or close lines in `sessions.md`; a take refused because another session holds the task names that session and its last sync, and `--takeover` closes that hold as `taken over`. The session comes from the environment (`sessionIdentity`: `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_REMOTE_SESSION_ID`, or `FREEFLOW_SESSION` and `FREEFLOW_HARNESS` from other harness layers). `task here` prints the session-start menu: the held task, then the open tasks of the project whose tasks name this repository's remote in Space (at most `MENU_TASKS`, 15), then tasks in no project; where no task names the folder's repository, as in a cloud session whose folder is the store itself, every open task in the store. With `--scan <folders>`, `task here` first remembers in `local/repositories.json` where each repository a task names is, from the Git checkouts at and directly inside those folders (`findRepositories`), so recovery resolves a task's repository pointers in a fresh container. With `--rules`, it adds after the menu the store's `rules/`, then those of the folder's project and of the held task's project, each whole and once (`sessionRules`), as the bundle prints them: what a harness layer gives a session at its start, so the rules hold before any task is taken. `session status` adds `missing`: what keeps the session from a working store (a home `FREEFLOW_HOME` names with no store in it, an empty clone not laid out, a cloud session's store with no remote), each with its fix and whether the user or the agent makes it (`missingParts`), and `compact`: the request `checkpoint --compact` left in `sessions/<session>/compact.json`, which a harness layer answers once by compacting the session and marks done (P102). `task move` moves a folder with Git, giving it the destination's next number.

**The task's lifecycle** (`transitions5.mjs`). `agreement open | update | close`, `slice propose | start | start-direct | pause | resume | close | record`, and `checkpoint` each load and validate the task folder, build the new files, and publish them whole: `history.md` first, then `record.md`, then `decisions.md`, each only while it still holds the text the command read. A close writes exactly one History entry; a checkpoint rewrites In flight from its input, pinning a Carry line's `result <n>` to that result's tool-use ID and what its call was for (`pinResults`), writes Space for the repository it runs in, and where that repository is on this machine in `local/repositories.json` (`rememberRepository`), adds the reading since the last one to the current Slice's `Measured:` line, sets "State as of", and syncs. Without a held task, `checkpoint --session` writes the session summary to `sessions/<session>/summary.md`, its Carry lines pinned the same way.

**Views** (`views5.mjs`). `view recover` prints the opening line (the record is memory; the user's direction decides), the store's and the project's rules, `record.md`, the active decisions within their budget, the History index, the project index and the checks (the task folder's path, the budget, pointers that do not resolve, Defined by and Read on recovery entries that name no pointer, open delegations, the hold, unsynced commits, where each repository in Space stands). A relative pointer resolves from the task folder, then the work repository the command runs in, then each repository Space names at the path `local/repositories.json` holds for it (`resolvePointer` in `recover.mjs`, `spaceRepositories` in `budget5.mjs`), so a session started outside the work repository, as a cloud session started in its home folder is, still reads the skills and repository files the record names. `view bundle` adds every source recovery reads, whole, and what In flight carries, with counted and uncounted sizes, and the recovery line. Context reuse follows Pi's: after the carried items, the bundle adds this compaction cycle's newest tool results from the session's transcript, whole, newest first, each that still fits the carry budget (15% of the window, at most 40,000 tokens), up to 40, and lists the next 30 by ID for `carry show`; results under 25 tokens, such as a command's one-line acknowledgement, are left out, since a first version filled the budget with a hundred of them. A carried result the transcript no longer holds, as after the session that wrote it ends, is named in the checks; `--fallback` is what Freeflow adds after the harness's own summary when the compaction came before the checkpoint, and `--session` a session summary's bundle. `view entry`, `view index` and `view full` read History and the raw record.

**Delegation** (`delegations5.mjs`). `delegate open` assigns `D-NNN`, writes `brief.md` from its template, makes a writing worker's worktree beside the repository on its own branch at the base, and writes the delegation's line in Current Work; `--parent` nests a sub-worker's folder inside its worker's and refuses a fourth level. With no task, `--scratch <folder>` in place of `--record` keeps the delegation under that folder's `delegations/` and records nothing; `check-return --scratch` checks it. `check-return` checks the return's headings and that its commits are on the brief's branch; `close` records the outcome, the merge commit and the worker's measure in one History entry and removes the line. Delegations are apart from Slices: a Slice that needs one names it under `Waits on`.

**Discussion and migration.** `discussion list` numbers the user's messages since the last checkpoint from a transcript reader per format (Claude Code's log, or a plain export); `discussion save` appends a block of chosen messages word for word, each with the agent's one line, and `drop` removes one (`discussion5.mjs`). `migrate` converts a Schema 4 record to a task folder, in place or into the store, keeping the old record whole as `sources/schema4-record.md`; with `--project`, a Schema 5 task kept in a repository's `.freeflow/tasks/` is copied into the store unchanged (`copyTaskIntoStore`, `migrate5.mjs`).

**Measurement and planning.** `slice start` takes a Slice's first reading and its prediction, each `checkpoint` adds what was used since, and `slice close` takes the last reading and copies `Predicted:` and `Measured:` into the History entry. A reading walks the transcript the harness layer names (`FREEFLOW_TRANSCRIPT`, or `--transcript`) from the last reading on, reading the log's tail and growing it only until it reaches that time (`TAIL_STEPS`); `--used` gives a context figure where no transcript can be read. The prediction (`predictSlice` in `planner5.mjs`) is the median of the nearest of the task, its project and the store holding `MIN_MEASURED` (3) complete measured Slices (each wider pool includes the narrower one's Slices), scaled by the median of actual over predicted; with fewer than 3 measured Slices in every pool, the Slice starts with no `Predicted:` line. `estimate` reports the context against the window and the notice point; `estimate --plan` lays the Slices left across compaction cycles from the prediction, `--json` gives the same as data for Discuss Work's `choices.mjs agreement --plan`, and `--project` and `--store` add up what was measured.

## Decisions

The P and T numbers name choices in the design that built this, task-004's Spec (`specs/memory-and-delegation.md` in that task's folder, with the user's words for each). The code came in by merge: the store in `ebf7c8e0` (hassan-mohiddin/freeflow#123), Schema 5's files, commands and views in `83454ea2` (#124), delegation in `9273f5e4` (#125), discussion, migration and the budget in `3f4f445e` (#126), Claude Code's mod in `992efbd4` (#127), Schema 5 as `init`'s default in `70afe225` (#128), and measurement and planning in `da8bc00c` (#129).

- **One Git repository for all task memory, local by default** (P1, P2, P58). Memory has to outlive sessions and containers; Git gives history, sync and conflict handling without a service. Local first, because nothing should leave the machine unless the user adds a remote; cloud is the same store plus a remote, so going cloud is one command. Rejected: memory in each code repository's ignored folder (lost with a cloud container, and invisible across repositories).
- **A cloud session's store is one of its repositories; Freeflow clones nothing** (P93, replacing P92). A cloud setup script cannot clone a private repository the session did not select (it fails with exit code 128), and a session starts with one repository, its code, so the agent attaches the store during the session on the user's word and Claude Code's mod takes it up at that turn's end; a session that works on the store alone starts with it. `session status`'s `missing` list says what is needed (P94). Rejected: the mod cloning the store from a URL the environment names (P92).
- **Projects are folders, holds are lines in the task** (P3, P44, T8). Membership is the folder tree and who holds a task lives in the task's own `sessions.md`, so no shared registry file can conflict between machines. Rejected: Pi's `registry.json`, which every change rewrote.
- **State rewritten, logs appended** (Spec principles 2 and 3). `record.md` holds what is true now, rewritten as the work moves; `history.md` and `sessions.md` only grow, merge by union, and are never edited, so a correction is appended inside its entry. Rejected: Schema 4's single record, whose History, Decisions and Checkpoints grew without limit.
- **The script makes every lifecycle change** (Spec principle 5). IDs, states, holds, closes and the checkpoint go through commands that validate before and after and publish whole files; the agent edits only meaning. A hand-made state change cannot be detected, so it is forbidden rather than checked.
- **A recovery budget that scales with the square root of the window, and only warns** (P32, P62). A larger window carries more memory, but slower than the window grows; the rules, the skills and Defined by are read whole and never counted, so the agent cannot shrink what it must read. Recovery still reads everything it lists, because a must-read source skipped for room costs the next action more than its words.
- **The checkpoint is the compaction's summary** (P59, P60, P63). In flight holds what sits below the record's grain, and the bundle is the record's own state, so Freeflow's compaction needs no summarizer request.
- **Readings only from the transcript the harness layer names** (P83, T30). Measurement writes into the record, so it never looks up a log by itself: a test inherits the session's environment, and a lookup would measure the session running it. `estimate` and `discussion list`, which only print, also find this Claude Code session's log by its ID.
- **Planning is deterministic** (P89). Medians, ranges and ratios over measured History entries; the correction divides by the uncorrected median, so corrections do not compound. Rejected: a fitted or probabilistic predictor, since a task holds too few Slices for one and its figures could not be traced.
- **Dollars at API list price from a dated table** (P86, T31). On a subscription the figure is what the work would cost through the API, not what is charged; `FREEFLOW_PRICES` replaces the table.

## Intended Behavior That Looks Wrong

- **A close that stops halfway leaves `history.md` ahead of `record.md`.** History is published first; running the same close again sees its entry and finishes the record without a second entry. Publishing the record first would lose the entry when the second write fails.
- **`history.md` and `sessions.md` can end up with both machines' lines in any order.** They merge by union on purpose: they only append, so keeping both sides is right, and a conflict there would stop work for nothing.
- **A record over its budget is still read whole.** The budget warns at `init`, `checkpoint` and recovery and trims nothing.
- **`checkpoint` writes Space only for the repository it runs in.** Another repository's line changes when a checkpoint runs there (or with `--repo`); the record never claims to know where a repository it cannot see stands.
- **A Slice measured with `--used` shows `working 0 min` and no cost.** Only a transcript gives requests' times and billing; the planner treats such a Slice's time and cost as unknown, never as zero.
- **`store init` refuses a home that holds Pi's `registry.json`.** Pi's Task Memory keeps its Schema 4 registry, projects and records there until Freeflow's Pi layer moves onto the store; laying a store over them would mix two layouts in one folder and strand Pi's records. The refusal (`task-memory-home`) asks for another folder, with `FREEFLOW_HOME` set to it for the sessions that use the store.
- **A moved task gets a new number, and its old ID names nothing.** Numbers are per folder and never reused; Git history keeps the old path.

## Surface

- Commands, all in `working-record.mjs` (`<group> <operation> --help` gives each one's options): `store init | remote | sync | status`; `init`, `validate`, `budget`, `estimate`; `agreement`, `slice`, `checkpoint`; `view recover | bundle | entry | index | full`; `task create | take | release | switch | here | search | remove | set-budget | set-state | move`; `project new | remove | list | show`; `delegate open | amend | status | check-return | close`; `discussion list | save | drop`; `carry list | show`; `migrate`; `session status` (JSON for a harness layer).
- Environment: `FREEFLOW_HOME`; `FREEFLOW_CONTEXT_WINDOW` (the window the budget and `estimate` use, 200,000 when unset); `FREEFLOW_TRANSCRIPT` (the log measurement reads); `FREEFLOW_PRICES` (a price table file); `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_REMOTE_SESSION_ID`, `FREEFLOW_SESSION`, `FREEFLOW_HARNESS`, `FREEFLOW_RESUME` (the session and the way back to it).
- Exit codes: 0 published or nothing to change; 1 nothing written, with the reason; 2 the outcome is uncertain, so read `view full` before retrying.
- Text the agent reads: every view, the budget lines, `estimate`'s lines, the menu, the checks. The exact shape of every file is Track Work's `skills/track-work/references/working-record-format.md`.

## State

- **In the store, synced:** `store.json`, `.gitignore` and `.gitattributes`; `rules/`, each project's `rules/` and `tasks/`, the store's `tasks/`; in each task folder `record.md`, `history.md`, `decisions.md`, `sessions.md`, `sources/`, `delegations/`, and `evidence/<slug>/README.md`.
- **In the store, this machine only** (ignored by `.gitignore`, so never committed or pushed): `local/` (where each repository is, sync state, conflicts), `sessions/<session>/` (the session summary, the mod's `cycle.json` and `delegations.json`), each task's `scratch/` and `evidence/**/raw/`.
- **Nothing in memory survives a command:** each command reads the files, validates, writes, and exits. After a restart, a compaction or another machine, the files are the state.
- **Without a store,** a task folder lives in a repository's Git-ignored `.freeflow/tasks/`, and nothing syncs.

## Invariants

- A record is never written inside a Git repository that is not the store unless the path is ignored and untracked: `assertGitSafePath` in `store.mjs` refuses it with `unignored-path` or `tracked-path` and writes nothing (exit 1); inside the store, whose `store.json` marks its records as tracked on purpose, it allows any path (`store.test.mjs`, "the Git check accepts a record inside the store and still refuses one a code repository does not ignore").
- Every command publishes one complete valid result or nothing, and refuses to overwrite a file that changed since it read it (`publishAtomically`; `schema5.test.mjs`).
- Closing a Slice, agreement or delegation appends exactly one History entry (`schema5.test.mjs`, `delegations5.test.mjs`).
- A task has at most one holder, and a session holds at most one task (`projects5.test.mjs`).
- Nothing pushes without the secret scan, and only to the store's own remote (`store.test.mjs`).
- There is no fourth level of delegation (`delegations5.test.mjs`).
- Nothing in the store is written into a code repository; no test guards this absence.
- A test never measures the session running it: measurement reads only `FREEFLOW_TRANSCRIPT` or `--transcript`, and Track Work's suite runs with `FREEFLOW_TRANSCRIPT` cleared (`scripts/validation/with-symlinked-tmp.mjs`; `measure5.test.mjs`).
- A prediction never counts a Slice measured only partly, or a time or cost that was not read (`planner5.test.mjs`).

## Failure Behavior

- **Sync:** a moved remote is taken and the push retried; no network or no access commits locally, says so ("not pushed (…); the next store sync pushes it") and exits 0, and the next sync pushes; a secret stops the push with `secret-found`, naming the path, line and kind, and exits 1 (`store.test.mjs`, "a secret stops the push, named by path, line and kind, and a commit that held it never leaves"); a conflict stops with `sync-conflict`, both copies kept, and exits 1 until `store sync --resolved`. Work never waits on the network.
- **A command that fails validation** before its change writes nothing (exit 1); one whose write may have happened exits 2, and the agent reads `view full` before anything else.
- **A take on a held task** is refused, naming the holder and its last sync.
- **A reading that cannot be taken** (no transcript, no `--used`) leaves the Slice unmeasured; its History entry says `not measured`, and nothing waits on it. A worker whose log cannot be found is `not measured` too.
- **A planner pool with too few measured Slices** falls to the next pool; with none, `estimate --plan` asks for `--done` and plans at this compaction cycle's rate, and says so.
- **Another task's unreadable `history.md`** is skipped by the planner, never fatal to a Slice's start.

## Cost

- A reading reads the log's tail, 8 MB, then 64 MB, then the whole file, only until it reaches the previous reading's time; a long session's log is not read whole at each checkpoint.
- A Slice's start reads every task's `history.md` in its project and store to predict; this is file reads only, once per start.
- Commands run as separate processes outside any model request, so they add nothing to a request's path.

## Code Map

- `skills/track-work/scripts/working-record.mjs`: the CLI: options, help, dispatch, and the store task ID resolved to its record.
- `skills/track-work/scripts/lib/freeflow-store.mjs`: the store: `initStore`, `addStoreRemote`, `storeStatus`, `syncStore`, the secret scan, conflicts.
- `skills/track-work/scripts/lib/store.mjs`: paths and writes: the store marker, the Git check, task numbering, atomic publication.
- `skills/track-work/scripts/lib/record5.mjs`: Schema 5's parse and validation: field orders (`SLICE5_ORDER`, `ENTRY_ORDER`), states, IDs, the skeleton.
- `skills/track-work/scripts/lib/transitions5.mjs`: the agreement, Slice and checkpoint commands, readings at start, checkpoint and close, the session summary, Space.
- `skills/track-work/scripts/lib/views5.mjs`: `view recover`, `view bundle` (with `--fallback` and `--session`), `entry`, `index`.
- `skills/track-work/scripts/lib/projects5.mjs`: projects, tasks, holds, the menu, `task move`, `session status`.
- `skills/track-work/scripts/lib/delegations5.mjs`: the delegate commands, worker recovery's section, the worker's measure at close.
- `skills/track-work/scripts/lib/discussion5.mjs`: transcript readers, discussion blocks.
- `skills/track-work/scripts/lib/carry5.mjs`: the session's tool results from its transcript, `carry list` and `show`, the carry budget.
- `skills/track-work/scripts/lib/migrate5.mjs`: Schema 4 to Schema 5.
- `skills/track-work/scripts/lib/budget5.mjs`: the recovery budget, the active decisions shown, the History and project indexes, the counted sizes.
- `skills/track-work/scripts/lib/measure5.mjs`: transcript readings, the price table, measures and their one-line form.
- `skills/track-work/scripts/lib/planner5.mjs`: pools, predictions and the correction, `estimate --plan`, `--project`, `--store`.
- `skills/track-work/scripts/lib/estimate5.mjs`: `estimate`'s context reading and its modes' wiring.

Schema 4's modules (`document.mjs`, `transitions.mjs`, `views.mjs`, `registry.mjs`, `recover.mjs`) stay for Pi and unconverted records.

## Tests

All in `.skill-eval/track-work/tests/`, run by `npm run test:track-work` with the temporary folder reached through a symlink and `FREEFLOW_TRANSCRIPT` cleared:

- `store.test.mjs`: the store's layout, an empty clone of the remote used as it is, the Git check, sync against bare remotes, union merges, conflicts, offline commits, the secret scan, the refusal of Pi's home, and `session status`'s `missing` list.
- `schema5.test.mjs`: Schema 5's files, their validation and broken shapes, each command's before and after, one History entry per close.
- `views5.test.mjs`: `view recover` and `view bundle` in order, with budgets, checks and sizes.
- `projects5.test.mjs`: projects, tasks, holds and takeovers, the menu (every project's open tasks where none matches), `task here --scan`, removals, tasks in no project and moves, the session read from the environment.
- `session5.test.mjs`: `session status` for a harness layer, and the bundle added after a compaction that came before the checkpoint.
- `delegations5.test.mjs`: the delegate commands, nesting, returns, closes, and the worker measured from its log.
- `discussion5.test.mjs`: transcript readers and discussion blocks.
- `carry5.test.mjs`: `carry list` and `show`, a result Carry line pinned and carried whole, the newest others, a result the transcript lost, and the same without a task.
- `migrate5.test.mjs`: Schema 4 records converted, in place and into the store; a Schema 5 record brought into the store.
- `budget5.test.mjs`: the budget at several windows and both modes.
- `estimate5.test.mjs`, `measure5.test.mjs`, `planner5.test.mjs`: the context estimate, readings and measures, predictions, the correction and the planner's views.

The CLI's live steps are its feature file, [Track Work CLI](../features/track-work-cli.md).

## Limits

- Pi's Task Memory keeps Schema 4 in its registry until Pi moves onto these scripts; `init --schema 4` and Schema 4's modules serve it meanwhile.
- Whether a cloud session's end is reported is unknown, so a cloud session's hold may be released only by a takeover.
- The planner sizes every Slice the same, since Slices have no kind; delegations are grouped by kind, model and effort.
- Prices go stale with the table's date until `FREEFLOW_PRICES` or a new table replaces them.
- The recovery budget's figures (10,000 words at 200,000 tokens, expanded half as large again) are starting points, not yet tuned by a continuity test.
