---
name: track-work
description: "Use when work needs durable task memory: starting, updating, recovering, or closing a Working Record, or preparing for compaction, a pause, or a handoff."
---

# Track Work

Keep one Working Record per task so a fresh context can pick up the work without the conversation that produced it. The record is memory for the agent doing the work: what is true now, what is in progress, what to read to resume, and the rough road ahead.

The record is not authority, a Spec, a Plan, or a transcript. It works for any kind of task: code, research, writing, analysis, operations.

The record has five sections:

- **Current Context:** present understanding, including `What defines this task`, which points to the task's defining artifacts such as its Spec and Plan.
- **Current Work:** the Current Slice (the unit of work in progress, with its `Material updates` log), `Recovery sources` to read when resuming, and one Next useful action.
- **Future Work:** the rough route ahead, as proposed Slices and Checkpoints.
- **History:** accepted Decisions, closed Checkpoints, and closed Slices.
- **Notes:** free-form context with no authority.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- The record is memory, not authority. It never authorizes work, and current user direction, live state, and accepted artifacts override it.
- Record a Slice before causing effects outside the record: edits, commands, generated files, sent messages, or changes to external systems.
- Use [working-record.mjs](scripts/working-record.mjs) for every lifecycle change: IDs, states, and moves between sections. Edit only meaning directly.
- Only the user changes task state.
- After context loss, recover in this order before any task action: the complete record through `view full`, then every artifact listed under `What defines this task`, then `Recovery sources`. If any of them cannot be read completely, report that and stop affected work.
- Never record a requested, reported, or expected result as observed. Keep unverified work, failures, and contradictions visible.
- Never claim that state will survive context loss unless it is written in the record or in a source the record points to.

## Decide What To Track

Goal: after any interruption, the next context can continue correctly without re-deriving what you already knew.

Ask: **if context were lost now, what would the next context need that it could not recover from the workspace, the defining artifacts, or retrievable history?** Record that, at the moment it becomes true.

| When this happens | Record it in |
| --- | --- |
| Understanding changes: a fact is settled, a hypothesis forms, a question opens | Current Context |
| The user accepts a choice | a Decision |
| Work with partial state is about to begin | a Slice |
| You learn something needed to resume: a file, attachment, message, or section | Recovery sources |
| A Spec, Plan, or other defining artifact is created or accepted for the task | What defines this task |
| The next step or rough route becomes clear | Next useful action and Future Work |
| Work produces a result, an identity (commit, document version, sent message), or evidence | the Slice's Material updates, then its closure |

Default to less. One accurate line beats a paragraph. Update at boundaries, not after every step, and do not narrate routine actions. If maintaining the record is taking noticeable time from the task, you are tracking too much. But concise is not lossy: keep a detail when removing it could change the next action.

Keep hypotheses and proposals in Tentative until they are accepted. Permission to investigate an option does not accept it.

Use a record when the task spans several steps or sessions, or when losing its decisions, route, or partial state would misdirect continuation. A short self-contained result needs no record. Respect a user's choice not to keep one. Create a record with the understanding that justified it, not an empty shell; if even the Goal is unclear, discuss first.

When the record starts after work has already happened, compress that stretch; do not replay it. Settled results go into Current Context. Record an earlier result as a Slice with `slice record` only when later work depends on it, such as evidence, a failed approach, or a retraction, and point to where its exact history lives. Never backfill with `slice start-direct` and `slice close`, and never close a live Slice to make room.

## Use The Record While Discussing And Executing

The record serves both halves of the work; update it at meaningful boundaries, not on every turn.

**Discussing:** the record is working memory.

- Start a record, with the understanding gathered so far, once the task is likely to outlast the current context or span sessions.
- When the user makes a choice, record a Decision. Put options under consideration in Tentative and unanswered questions in Open.
- Use Open to choose what to ask next, and check Settled and Decisions before asking the user something again.
- When the user supplies material that governs the work, point to it from Recovery sources, or from `What defines this task` if it defines the task.
- When what and how are settled, propose the route in Future Work.

**Executing:** the record is bookkeeping.

- Record the Slice before its first effect.
- Add Material updates at boundaries: evidence, identities such as commit SHAs or document versions, scope extensions, and contradictions.
- Add Recovery sources as the work reveals what a resume would need.
- Close Checkpoints as their boundaries happen, then close the Slice with a distilled result.

## Use Slices For Work With Partial State

A Slice is a unit of work that would leave something to reconcile if interrupted: half-applied edits, a draft in progress, findings from 12 of 20 sources, a running process.

- Implementing a change, producing an artifact, or running an experiment is a Slice.
- An in-depth investigation across many sources can be a Slice; stopping halfway would lose which sources were covered and what they said.
- A discussion usually is not. Its results land directly in Current Context, Decisions, and Future Work.

Start a Slice before its first effect (Rules). A Slice with no effects, such as an investigation, may be recorded once it becomes substantial.

Size a Slice by one coherent result that can be checked and corrected with a manageable working set. A Slice may cover a whole phase of a Plan, or one Plan step may take several Slices. Do not split by tool call, file, or test, and do not merge unrelated results because they happen together.

Keep checking and correction inside the Slice that produced the work. When accepted scope grows, record the extension in the Slice before acting on it. Start a new Slice when the result, authority, or evidence boundary changes.

An experiment or investigation completes when its question is answered or its limit is reached; a negative answer is a valid result. Record what it showed and what it changes, not how it was built.

## Keep A Rolling Route In Future Work

Future Work is your route at this moment, not a commitment. When you know roughly what comes next, write it down: propose the next Slices and the Checkpoints between them. At the next boundary, drop, add, reorder, or reword proposals freely; they cost nothing and authorize nothing.

- After discussing what and how, propose the route before starting.
- With a Plan, propose only the next few steps and point into the Plan rather than copying it.
- During hands-on iteration, where each step depends on the last result, keep only the Next useful action. Do not invent distant steps.

Before starting a proposal, check its dependencies against what actually happened and against the current agreement. Being next in Future Work is not a reason to take on its obligations.

A **Checkpoint** is a boundary on the route that is not itself a unit of work: a commit, a publication, a review, a decision, a continuity point. It belongs to the Slice it follows. Do not make a Checkpoint into a Slice.

```text
User: "Implement the parser, then commit, then do the CLI."
Future Work:
  Slice — Implement the parser
  Checkpoint — Commit the parser        (preserve, applies to: Implement the parser)
  Slice — Add the CLI
Not: a separate "Commit the parser" Slice.
```

| Type | Code | Other work |
| --- | --- | --- |
| `preserve` | local commit | save a draft version or snapshot |
| `publish` | push, pull request | publish, send to a client |
| `review` | independent code review | editor or reviewer sign-off |
| `decision` | owner chooses a design | owner chooses between options |
| `continuity` | pause or handoff point | pause or handoff point |

A Checkpoint is `proposed` while it is only anticipated and `pending` once the user authorizes or selects it. Activate it as soon as authority exists. A pending or deferred Checkpoint must be closed before its Slice closes; `completed` means the boundary happened, even when its judgment was adverse.

On long tasks, a `preserve` Checkpoint every few Slices keeps a recoverable point without a Slice of its own.

## Recover After Context Loss

Context loss includes compaction, summarization that replaces context, clear, session resume or navigation, transfer to another context, or uncertain continuity. Recover only the record of the current work: one that current user direction, the assignment, or the summary names for it. A record that is merely recent, or that they do not name, is not a recovery source; when a pointer conflicts with them, report the mismatch instead of recovering it.

Recover before task work (Rules), in order:

1. `view full`: read the complete record, including History and Notes. If output is truncated, keep reading the same file until complete. `view resume` and summaries are not full recovery.
2. Every artifact listed under `What defines this task`, such as the task's Spec and Plan.
3. Every entry under `Recovery sources`, except one whose stated trigger ("read when …") does not apply yet; read that one when it does.

Then reconcile before acting. Establish the task and Slice state, the agreed outcome and return condition, active Decisions, pending Checkpoints, completed and partial effects, whether the next action's prerequisites hold, and what authorizes it.

- Current user direction supersedes older instructions in the record, including a record written on another conversation branch.
- Compare the record with the live state the next action depends on. If they disagree, resolve it from sources; do not follow whichever version lets work continue.
- If the record conflicts with a defining Spec or Plan, the record does not win. Return the conflict to that artifact's owner before dependent work.
- Reuse evidence that still applies instead of repeating the investigation. Reopen further sources only when their exact content or freshness changes the next action.

With context intact, use `view resume` or read the relevant section. Another turn or an ordinary pause is not context loss.

## Prepare For A Context Boundary

When a context limit is near or a pause or transfer is coming, make the record sufficient before stopping:

- Record partial effects, unverified work, failed approaches that would otherwise be repeated, and anything running whose result is unknown.
- Update `Recovery sources` with what the next context must read, and why each matters. Drop entries the current work no longer needs; give a source needed only in some situation a trigger ("read when …").
- Material that exists only in the conversation, such as a pasted image, file, or long message, will not survive. Save a copy under the task's `sources/` directory and point to it, or point to host-retrievable history when the host provides it.
- Leave one Next useful action that a fresh context can act on.

Do not rush a Slice to completion, claim an unfinished check passed, or guess the outcome of a running operation.

A context boundary is not a Slice transition or a Checkpoint. Pause the Slice only when safe continuation is actually suspended, and use a `continuity` Checkpoint only for a planned pause or handoff, not for every compaction.

## Maintain The Record

Read [Working Record Format](references/working-record-format.md) before editing structure or preparing input for a command. It owns the exact shape, fields, states, and command contract.

Edit meaning directly: Current Context bullets, optional fields, Material updates, Recovery sources, proposal order or removal, the Next useful action, and Notes. After a structural edit, run `validate`. It checks structure only; it cannot tell whether an edit changed history or skipped a lifecycle step, so never make those edits by hand.

Run `working-record.mjs <group> <operation> --help` before preparing a command's input; the help and the format reference are the contract, so read `scripts/lib/` only when diagnosing a defect. If a command exits with code 2, the write may have happened: read `view full` before retrying or editing. Never duplicate an entity to recover from an uncertain result.

If `init` reports that the task directory is not ignored by Git, ask the user before changing ignore rules. Records must stay out of version control.

If a record uses another schema or fails validation, read it through `view full` and stop before edits or transitions. Repair or migration needs separate authorization.

## Close Without Losing What Matters

Close a Slice as `completed` only when its result is supported by evidence, live state agrees, no material contradiction or authority conflict remains, and no Checkpoint on it is pending or deferred. Close as `blocked` from `paused` when it cannot continue, or as `abandoned` with explicit authority and a reason.

Closing keeps only the historical fields; Material updates and Recovery sources do not carry over. Before closing, put every evidence pointer, residual effect, and limit that still matters into `Evidence and limits` or `Task effect`, and remove Recovery sources that no longer apply.

Closing selects nothing. Set the Next useful action from the actual result.

## Return

Return to the activity that asked for the update: [Discuss](../discuss/SKILL.md) for discussion, [Execute Work](../execute-work/SKILL.md) for Slice work, [Workflow](../workflow/SKILL.md) for routing. [Handoff](../handoff/SKILL.md) owns point-in-time transfer; [Write Spec](../write-spec/SKILL.md) and [Write Plan](../write-plan/SKILL.md) own the task's artifacts.

Stop when the record lets a fresh context continue correctly. Stop and report, rather than invent, when authority, structure, or the meaning of a transition is missing. A record update never completes the work it describes.
