---
name: track-work
description: "Use when a task needs memory beyond the conversation: starting, updating, checkpointing or recovering its Working Record; choosing, taking, switching or releasing a task from Freeflow's task menu, or one another session holds; moving a task into or out of a project; when work may not fit in what is left of the context, or will outlast this compaction cycle; when Freeflow says compaction is near, after a compaction, a summary, a clear or a move into a new session; before pausing, handing off or transferring work; when a task ID, a project, the Freeflow store or its sync, or parallel sessions are involved; when a record says Schema 4 or Pi's Task Memory is on; and when editing a record or running its working-record script. It decides what the record says, and every lifecycle change goes through its script."
---

# Track Work

Keep one Working Record per task so a fresh context, after a compaction, in another session or on another machine, continues the work without the conversation that produced it. The record is memory for the agent doing the work: what is true now, what is in progress and exactly how far it got, and what to read to resume. It is not authority, a Spec, a Plan, or a transcript, and it works for any kind of task: code, research, writing, analysis, operations.

A task is a folder, normally in the Freeflow store: one private Git repository at `FREEFLOW_HOME` (default `~/.freeflow`) that holds every task's memory, grouped in projects or in none, and syncs it, on this machine only or, with the user's private remote, on every device. The folder holds:

- `record.md`, the state, in three sections:
  - **Current Context:** Goal, Settled and Open, rewritten whole at each checkpoint and never patched in between.
  - **Current Work:** the open agreement (`A-NNN`), the current Slice (`S-NNN`), Delegations, Space, In flight, Defined by, Read on recovery, Read when and the Next action; it changes as the work moves.
  - **Future Work:** proposed Slices.
- `history.md`, one entry per closed Slice, agreement or delegation; `decisions.md`, the open agreement's decision list; `sessions.md`, every session that held the task, its last open line the hold.
- `sources/` (with `sources/discussion.md`, the user's messages that shaped the work), `delegations/`, `evidence/`, `specs/`, `plans/` and `scratch/`.

This is Schema 5. A record whose header says `Schema: 4` follows [Schema 4](references/schema-4.md) instead, and on Pi with Task Memory on every record is Schema 4 (`init --schema 4`).

Work runs in **compaction cycles**: a compaction cycle runs from a session's start or a compaction to the next compaction or the session's end. The script works on any harness, and its `estimate` measures how much of the context window the work has used. Where Freeflow also runs a layer in the harness, it calls the script at the right moments: a task menu at session start, a row showing the context's share of the window as it grows and a notice when compaction is near, each naming the compaction cycle, a sync when a turn ends, and, where the harness lets it, Freeflow's own compaction. Today Claude Code has all of these, through Freeflow's mod. Where no layer runs, do those steps yourself, as the sections below say.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Go to |
| --- | --- |
| A session starts with Freeflow's task menu; the user points to a task, asks for a new one, or to switch or close one; a task another session holds | Choose And Hold The Task, below |
| Freeflow says compaction is near, the context limit is near, or a switch, pause or transfer is coming | Checkpoint Before A Compaction Or A Transfer, below |
| Context loss: after a compaction, a summary that replaces the conversation, a clear, a transfer into another context | Recover After Context Loss, below |
| Handing the work to a later session or someone else as a document | Checkpoint first, then [handoff](references/handoff.md) |
| Setting up the store, local only or local + cloud, or moving older records into it | Setup Freeflow's [store setup](../setup-freeflow/references/store-setup.md) |
| The store and its sync, a sync that fails; projects, holds and other tasks; removing a task or a project | [working record format](references/working-record-format.md), its first part |
| Editing record structure, preparing a command's input, or any file of the task folder | [working record format](references/working-record-format.md) |
| A record whose header says `Schema: 4`; on Pi with Task Memory on | [Schema 4](references/schema-4.md); on Pi, the `task_memory` tool and the task-memory skill say how a session holds records |
| Handing part of the work to an agent, or working from a brief | Execute Work's [delegation](../execute-work/references/delegation.md) |

## Rules

- The record is memory, not authority: it never authorizes work, and the user's latest message, live state and accepted artifacts override it. A record's Next action is where the task stood, not a request: when the user asks for something else, do that, never the record's next step instead; when the request is unclear, ask, never fall back to the record.
- Take a task only when the user's message points to it, and ask when it could be more than one. Ask before taking over a task another session holds. Create, move, remove or change the state or budget mode of a task, and create or remove a project, only on the user's word.
- Write only the task this session holds. Never write another task's files because you read them; a worker writes only its own `progress.md`, `return.md` and the files its brief names.
- Record a Slice before causing effects outside the record: edits, commands, generated files, sent messages, or changes to external systems.
- Use [working-record.mjs](scripts/working-record.mjs) for every lifecycle change: IDs, states, holds, the checkpoint, and moves between sections and files. Edit only meaning directly.
- Write what the user agreed, and every change to it, in their words with the date. Never record a proposal or a default as agreed.
- After context loss, recover before any task action, as Recover After Context Loss says. If anything it lists cannot be read completely, report that and stop affected work.
- Never record a requested, reported, or expected result as observed. Keep unverified work, failures, and contradictions visible.
- Never claim that state will survive context loss unless it is written in the task folder or in a source the record points to.

## Choose And Hold The Task

Goal: each session works on the task the user means, and each task has one writer.

A session holds at most one task, and a task has at most one holder; any session may read any task. Freeflow's harness layer gives the agent a menu at session start: which task this session holds, if any, then the open tasks of the project whose tasks name this repository, newest first, each with its holder, when that holder last synced, and its cue. Elsewhere, run `task here` when the work may already have a task. The menu takes nothing.

| The user's message | Do |
| --- | --- |
| points to one task | `task take --id <ID>`, recover it, and say in one line what you read |
| could be about more than one | ask, with the likely tasks and "a new task" as the options |
| points to a task another session holds | `take` refuses and names that session and when it last synced: ask before `task take --id <ID> --takeover`; that session learns at its next sync and stops writing |
| asks for work that needs memory and no task fits | ask one question, through the harness's question tool where it has one, whose options say where the task goes: in the project the work belongs to, in no project, or no task at all; on the answer, `task create` with `--project <name>` or `--no-project` (this session holds it); a project the same way, with `project new` |
| moves a task into a project, or out of one | `task move --id <ID> --project <name>` or `--no-project`: the task gets the next number there, and the output prints its new ID |
| turns to another task | checkpoint the held task, `task switch --id <ID>`, then recover the new one |
| closes the task or ends the session | checkpoint what changed, then `task release` (Freeflow's harness layer releases it at the session's end); `task set-state` only when the user says the task is done or abandoned |
| asks for something the held task does not cover | do it; propose a task only if that work needs memory of its own |

A task's memory is worth keeping when the work will outlast this compaction cycle, or when losing its decisions, route or partial state would misdirect continuation. Judge it early: `estimate` gives the context used so far against the window and the notice point, and once part of the work is done, `estimate --done <n> --left <m>`, with the parts done in this compaction cycle and those left (a Plan's phases or Slices, the steps of your route), says whether the rest fits before the notice or about how many more compaction cycles it needs. Once Slices have been measured, in this task, its project or the store, `estimate --plan` sizes each Slice left from them: the compaction cycle it lands in, any that outgrows one, what could run in parallel, and the cost at API list price. A notice that comes before the work is done shows it did not fit. When the work will outlast it, plan where this compaction cycle ends: at a safe point before the notice, with the rest in Future Work. Work that ends within the compaction cycle needs no task unless the user asks; a question or a short self-contained result needs none, a session with no task is normal, and a user's choice not to keep one stands. Create a task with the understanding that justified it, not an empty shell; if even the Goal is unclear, discuss first.

A task always lives in the store. Where no store exists yet, ask once whether to set it up, local only or local + cloud, and set it up as Setup Freeflow's [store setup](../setup-freeflow/references/store-setup.md) says, which also moves older records in; a user who wants neither gets no task. Freeflow's harness layer acts only where a store exists, and says at session start what is missing for one.

Read another task when it bears on what you are about to decide or build (`task search --query <words>`, then `view recover --record <ID>` or `view entry`), and record what matters to this task in this task's own record.

## Decide What To Track

Goal: after any interruption, the next context continues correctly without re-deriving what you already knew.

Ask: **if context were lost now, what would the next context need that it could not recover from the workspace, the defining artifacts, or the task's History?** Record that, where it belongs:

| When this happens | Record it in |
| --- | --- |
| A fact is settled, or a choice the user accepted still governs the task | Settled, at the next checkpoint |
| A question opens, or you propose something the user has not answered | Open, at the next checkpoint; a proposal as `Proposed: …` with its date, which permission to investigate it does not accept |
| The user agrees a piece of work, or changes what is agreed | the agreement, in their words |
| The work meets a choice the user owns | `decisions.md`, Discuss Work's decision list |
| Work with partial state is about to begin | a Slice |
| Work produces a result, an identity (a commit, a document version, a sent message) or evidence | a one-line update on the Slice: its kind and a pointer |
| Part of the work goes to another agent | a delegation |
| A Spec, Plan, issue or brief is accepted for the task, or the work must follow a skill beyond the core ones | Defined by |
| You learn what the next context must read: a file, a section, a saved message | Read on recovery; Read when, with its trigger |
| The repositories the task changes, and where each stands | Space, at the checkpoint |
| Where the step in progress stands, and what the next step rests on | In flight, at the checkpoint |
| The next step or the rough route becomes clear | the Next action and Future Work |
| A discussion with the user shaped the work | discussion blocks, at the checkpoint |

Until a checkpoint, the conversation holds new understanding; Current Context changes only then, whole, and when `agreement close` adds to Settled the choices that still govern. Check Settled, the agreement and `decisions.md` before asking the user something again.

Default to less. One accurate line beats a paragraph. Update at boundaries, not after every step, and do not narrate routine actions. If maintaining the record is taking noticeable time from the task, you are tracking too much. But concise is not lossy: keep a detail when removing it could change the next action.

When the record starts after work has already happened, compress that stretch; do not replay it. Settled results go into Settled. Record an earlier result as a Slice with `slice record` only when later work depends on it, such as evidence, a failed approach, or a retraction, and point to where its exact history lives. Never backfill with `slice start-direct` and `slice close`, and never close a live Slice to make room.

## Keep The Agreement

Goal: after context loss, the next context knows what the user agreed it may do, where it comes back, and until when, in the user's words.

Open the agreement when the user agrees a piece of work, with [Discuss Work](../discuss-work/SKILL.md)'s agreement: `agreement open`, its lines quoting the user beside what each answered, dated. Write only what is known: `Done when`, `Without asking:`, `Ask first:`, `Back at`, `Holds until`; one line is often enough. Never open one as a placeholder, and never ask the user for one just because a task is being created. A task has one open agreement, and each Slice works under it.

`Back at` lines are the agreement's return points: a pull request, a review, a decision, a pause. When one is due, stop the work that depends on it and return to the user. Some skills still call such a point a selected Checkpoint; with a Schema 5 record it is this line.

When the user changes what is agreed, `agreement update` adds one line in their words, without asking first: an extension, a lifted limit, a new endpoint, or a narrowing for now ("just diagnose first", "don't edit yet"), which governs over the rest until the user lifts it. Add a narrowing at once: a later context sees only what is written. Progress and results belong to Slices, never to the agreement. When a `Proposed:` item in Open is answered, it becomes an update if it changes what is agreed, an item in `decisions.md` if it settles a choice, and otherwise leaves Open at the next checkpoint.

Discuss Work's decision list lives in `decisions.md`; the items the user answered quote them, and the rest are what you assumed, never what the user accepted. When the user ends or replaces the agreement, or at its hand-over, `agreement close` moves its lines, updates and decision list into History; the choices that still govern the task go into Settled through its `Settled` input.

## Use Slices For Work With Partial State

A Slice is a unit of your work that would leave something to reconcile if interrupted: half-applied edits, a draft in progress, findings from 12 of 20 sources, a running process.

- Implementing a change, producing an artifact, or running an experiment is a Slice.
- An in-depth investigation across many sources can be a Slice; stopping halfway would lose which sources were covered and what they said.
- A discussion usually is not. Its results land in the agreement, `decisions.md`, discussion blocks and, at the checkpoint, Current Context.

Start a Slice before its first effect (Rules): `slice start` for a proposal in Future Work, `slice start-direct` for one that was never proposed. It names its result, scope, what shows it done, when to stop, and the state of what it will change. A Slice with no effects, such as an investigation, may be recorded once it becomes substantial.

The commands measure what each Slice uses, so you keep no figures by hand: `slice start` records its prediction from past Slices and its first reading, each `checkpoint` adds what was used since, and `slice close` keeps both in History, with the files the Slice changed, where the planner learns from them. Give a Slice a `Size: <n> files` when you propose or start it, the files it will add or change as the touch map or a survey shows them: the prediction scales with it, where one Slice's median would treat a one-line fix and a 200-file removal alike. They read the harness's transcript where they can; where they cannot, pass `--used <tokens>` as the harness shows it, or leave the Slice unmeasured.

Size a Slice by one coherent result that can be checked and corrected with a manageable working set. A Slice may cover a whole phase of a Plan, or one Plan step may take several Slices. Do not split by tool call, file, or test, and do not merge unrelated results because they happen together.

While it runs, add one line per boundary under its fields: a kind and a pointer, such as `- Evidence (observed): the retry test passes — scratch/retry-test.txt` or `- Result: commit 1a2b3c4d`. The proof lives in the file the line points to. Keep checking and correction inside the Slice that produced the work. When accepted scope grows, add an `Extension` line before acting on it; start a new Slice when the result, authority, or evidence boundary changes.

Delegations are not part of a Slice: each has its own line in Delegations and its own lifecycle, and Execute Work's [delegation](../execute-work/references/delegation.md) reference says how to open, check and close one. A Slice that needs a delegation's result names it under `Waits on` and waits for it to close; no Slice stays open only because a worker runs.

An experiment or investigation completes when its question is answered or its limit is reached; a negative answer is a valid result. Record what it showed and what it changes, not how it was built. A study run with [Research Work](../research-work/SKILL.md) keeps its plan, lock, run ledger and deviation log as its own evidence: list the plan under Defined by, record its lock, the user's decision, as an agreement update in their words, and do not copy receipts or deviations into the record.

## Keep A Rolling Route In Future Work

Future Work is your route at this moment, not a commitment: proposed Slices only, each with the result it wants, in about 300 words. At the next boundary, drop, add, reorder or reword proposals freely; they cost nothing and authorize nothing.

- After discussing what and how, propose the route before starting.
- With a Plan, propose only the next few steps and point into the Plan rather than copying it. To see where its remaining steps land across compaction cycles, give them to `estimate --plan --input -`, each with its size.
- During hands-on iteration, where each step depends on the last result, keep only the Next action. Do not invent distant steps.

Before starting a proposal, check its dependencies against what actually happened and against the current agreement; being next in Future Work is not a reason to take on its obligations. Check the History index for closed work on the same result and read it with `view entry`: a failed or abandoned approach lives there.

## Stay Within The Budget

Goal: what recovery reads of the memory you shaped fits a fresh context, and you know the limit before you write.

The recovery budget counts the memory the agent shapes: `record.md`, the active decisions shown, the History and project indexes, Read on recovery's sources and In flight's Carry files. It does not count the store's and the project's `rules/`, the skills, or Defined by's entries, which recovery reads whole. It grows with the context window, a task's header sets `normal` or `expanded`, and Current Context (about 600 words) and Future Work (about 300) stay fixed.

Run `budget` before you write a record or a checkpoint; `budget --record` shows what each part holds and what is left, and `init` and `checkpoint` print the same lines. The budget only warns. When a part runs over, distill it at the next checkpoint: rewrite Current Context tighter, give a source only some situations need a `Read when` trigger, drop sources the work no longer needs, and close Slices whose result is settled, never one that is not. When a task's memory keeps running over, propose expanded mode to the user; `task set-budget` changes it on their word.

Put a source under Defined by only when it is an accepted definition or a method the work must follow; memory you shaped goes under Read on recovery, so the budget counts what you can distill.

## Checkpoint Before A Compaction Or A Transfer

Goal: at a compaction, a switch or a transfer, the task folder holds everything the next compaction cycle needs, so the work never depends on a summary.

**When.** Freeflow's notice comes once each compaction cycle, before the harness's own compaction would start. Keep working until a safe point: a finished step whose result you know, such as a check run and read, a set of edits complete, or a report written; not mid-edit, with a command still running, or partway through reads you need together. If your work ends within a step or two, finish it first. Then checkpoint with `--compact` and end your turn. Where the harness lets Freeflow compact, Freeflow then compacts the session with the record in place of the conversation and starts the next turn; it compacts only on that request, so a checkpoint without it never compacts. Elsewhere the harness compacts on its own, and you recover after it. You may also checkpoint with `--compact` before the notice, at a boundary where the conversation holds mostly work the record already keeps, such as a phase finished and delivered. Checkpoint the same way before a switch, a pause or a transfer, when a harness without Freeflow's notice says the context is nearly full, and when the user asks.

**How:**

1. Rewrite Current Context whole: the Goal; what is Settled and still governs; what is Open. Drop narration and anything another part already holds. Material that exists only in the conversation, such as a pasted image, file or long message, will not survive: save it under `sources/` and point to it.
2. Adjust the rest of Current Work and Future Work: Defined by, Read on recovery and Read when (drop what the work no longer needs; give a source only some situations need its trigger), one Next action a fresh context can act on, and the route. Close nothing to make room. Do not rush a Slice to completion, claim an unfinished check passed, or guess the outcome of a running operation.
3. If discussion with the user in this compaction cycle shaped the work, save it as blocks; skip this when none did. `discussion list` numbers the user's messages since the last checkpoint; `discussion save --messages 4-7,11 --title <topic> --shapes <A-NNN or S-NNN> --input -` appends one block with those messages word for word and your line under each saying what it answered, specifically enough that it reads alone. A cycle may add several blocks, one per stretch of discussion, or none. A block is never edited: one that a later discussion changes is replaced (`--replaces B-NNN`), and once the work a block shaped is closed and nothing open rests on it, `discussion drop` removes it; the checkpoint lists those blocks.
4. `checkpoint --record <ID> --input -` with In flight's lines, and `--compact` when Freeflow should compact, which replace the old ones whole. In flight is the record's part of the compaction: write state, not a story, and keep exact paths, identifiers, commands, error text, numbers, and the user's words where wording matters.
   - `Now:` the step in progress and exactly how far it got;
   - `Observed:` a result the next step rests on, with its evidence; `Hypothesis:` what is being tested, unverified;
   - `Dropped:` an approach and why it failed, so it is not tried again; `Pending:` what runs or waits, and on what;
   - `Carry:` a file the next compaction cycle needs fresh, with its lines and why.

   A result that closes a claim goes on the Slice instead, and a narrower instruction from the user in the agreement. The command checks the task folder's structure and the budget, writes Space for the repository you work in, adds to the current Slice's measure, sets the record's "State as of", then commits and pushes the store.
5. After `--compact`, end the turn. For a switch, `task switch`; for a pause or a transfer, `task release`, and write a [handoff](references/handoff.md) when someone needs a document.

A session that holds no task writes a session summary instead, `checkpoint --session --input -` with its Goal, Settled, Open, Agreement, In flight, Read when and Next action: it is the next compaction cycle's only memory. A compaction never creates a task.

A checkpoint closes nothing and is not a Slice transition: pause a Slice only when safe continuation is actually suspended.

## Recover After Context Loss

Context loss means the conversation about the current work is no longer in context: after a compaction, a summary that replaces it, a clear, a transfer to another session, or a branch that continues the work without it. With that conversation still in context (a new message, a pause, a resumed session), read `record.md` or the part you need instead.

- **After Freeflow's compaction** the conversation is the bundle: the opening line, the rules, the record, the active decisions, the History and project indexes, the checks, then every source recovery reads, whole, with their sizes. It was all read when the bundle was made: read none of it again unless something changed it since, but read again before you apply it any skill the bundle did not carry. Check the live state the next step depends on, and go on from In flight and the Next action.
- **After the harness's own compaction,** its summary replaces the conversation, and where Freeflow's harness layer can add to it, the bundle as of the last checkpoint and the user's messages since then, word for word, follow. When the compaction came before a checkpoint, the record is behind: where the summary or those messages differ from it, they win, and the transcript holds what the summary lost. With no bundle after the summary, recover as the next line says.
- **Otherwise,** when you take a task or no bundle came, recover only the task this session holds or the user's message points to; when that task and the user's current work disagree, report it instead of recovering it. `view recover --record <ID>` prints the opening line, the rules, the record, the active decisions, the indexes and the checks, which name any pointer that does not resolve. Read every Defined by entry, every Read on recovery source and the core skills (Track Work, Discuss Work and Execute Work), whole; a Read when source once its trigger applies; and, with `view entry <ID>`, the History entries the next action depends on: closed work on the same result, an attempt that failed or was abandoned, and any entry the record names. Then say in one line what you read.
- **A worker** recovers with `view recover --record <ID> --delegation <D-NNN>`: its brief is its scope and wins where it and the record disagree.

Then reconcile before acting:

- The user's latest direction supersedes older instructions in the record, including a record written on another conversation branch. Establish the agreement (or, without one, the agreed outcome and return condition) and whether that direction has changed it, the active decisions, the Slice and its state, open delegations, partial effects, and whether the next action's prerequisites hold.
- Compare the record with the live state the next action depends on: the checks name where each repository in Space stands and the store's unpushed commits. If they disagree, resolve it from sources; do not follow whichever version lets work continue.
- If the record conflicts with a Spec or Plan under Defined by, the record does not win. Return the conflict to that artifact's owner before dependent work.
- Check an important completion, verification, review, or commit claim, and the identity of what it examined, before repeating it; a run that happened may not apply to the current state. Reuse evidence that still applies instead of repeating the investigation, and reopen a source only when its exact content or freshness changes the next action.
- A next action a handoff names authorizes nothing by itself. Without a record, as when resuming from a handoff alone, reconstruct from it and the exact sources it names, and report a missing boundary instead of inventing it.

## Maintain The Record

[Working Record Format](references/working-record-format.md) owns the exact shape of every file in the task folder and the command contract; read it before editing structure or preparing input for a command. Run `working-record.mjs <group> <operation> --help` before preparing a command's input; read `scripts/lib/` only when diagnosing a defect.

Edit meaning directly: Current Context (at a checkpoint), a Slice's update lines, Defined by, Read on recovery, Read when, the Next action, and the order, wording or removal of Future Work's proposals. After a structural edit, run `validate`. It checks structure and warns about pointers that do not resolve; it cannot tell whether an edit changed history or skipped a lifecycle step, so never make those edits by hand: IDs, states, the agreement's lines, the hold, and anything in `history.md`.

If a command exits with code 2, the write may have happened: read `view full` before retrying or editing, and never duplicate an entity to recover from an uncertain result. If a record fails validation, read it through `view full` and stop before edits or transitions; repair needs separate authorization.


Keep temporary files for the task, such as throwaway scripts, saved command output and downloads, in its `scratch/`. They stay with the task and out of version control; nothing in them is memory unless the record points to it.

## Close Without Losing What Matters

Close a Slice as `completed` only when its result is supported by evidence, live state agrees, no material contradiction or authority conflict remains, and no delegation it waits on is open. Close as `blocked` from `paused` when it cannot continue, or as `abandoned` with explicit authority and a reason.

`slice close` writes the Slice's one History entry, its update lines included; Read on recovery and Read when entries do not carry over. Give it a cue that says when the entry matters, not what it holds ("read when the retry policy is in question"), and put every pointer, residual effect and limit that still matters into its Evidence and Task effect. Then remove the sources the record no longer needs.

When the Slice settled how a documented part of the software works or why, such as a design choice, a rejected alternative, or a limit accepted on purpose, record it in that documentation with [Write Docs](../write-docs/SKILL.md) before closing. The record is task memory; it does not outlive the task.

Closing selects nothing. Set the Next action from the actual result.

## Return

Return to the activity that asked for the update: [Discuss Work](../discuss-work/SKILL.md) for discussion, [Execute Work](../execute-work/SKILL.md) for Slice work. [Write Docs](../write-docs/SKILL.md) owns the task's Specs and Plans.

Stop when the task folder lets a fresh context continue correctly. Stop and report, rather than invent, when authority, structure, or the meaning of a transition is missing. A record update never completes the work it describes.
