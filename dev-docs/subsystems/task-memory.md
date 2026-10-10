# Task Memory

> **Covers:** `pi-extension/src/task-memory/`, `capabilities/task-memory/`
> **Tests:** `pi-extension/tests/task-memory/`
> **Verified at:** `d9497ae6` (2026-10-11)

For contributors changing Freeflow task memory on Pi, a prototype: how a session holds Working Records, what reaches the model and when, the write gate, and the choices behind them. It is off unless `taskMemory.enabled` is set, and has no user docs yet.

## Purpose

Track Work keeps one Working Record per task, but on its own the agent decides which record belongs to the work, finds it by path and recovers it by running a script; Freeflow compaction cannot name a record because it cannot tell which belongs ([Compaction](compaction.md), Decisions). Task memory makes the session know its records. The user attaches records (the model may propose one); one is the focus. Freeflow shows them in the Runtime State, delivers the focused record's resume view when it becomes the focus and when context is rebuilt, and refuses record writes to records the session has not attached.

It deliberately does not:

- require a record: a session with nothing attached gets no snapshot and is gated only against writing records it never attached;
- decide what a record says or when a task needs one: [Track Work](../../skills/track-work/SKILL.md) still owns that;
- move records or change their format: records stay under `.freeflow/tasks/` and are read through Track Work's own `views.mjs`, so a record stays valid for the script skill on other hosts;
- work under automatic Cognitive Routing yet: attaching is refused there.

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Attached | A record this session may write. Identified by its absolute path. | `TaskState.attached` |
| Focus | The attached record attention is on; its snapshot is delivered. At most one. | `TaskState.focus` |
| Held | An attachment a fork or clone inherited: readable, not writable until the user confirms. | `TaskState.held`, `holdInherited()` |
| Task entry | One `freeflow-task-memory-v1` custom entry: `{ op, record, at }`, `op` one of attach, detach, focus, hold, confirm. | `TASK_ENTRY` |
| Snapshot | The focused record's `view resume` output, labelled with its path and read time. | `snapshot()`, `SNAPSHOT_TYPE` |

## How It Works

**State.** Every change appends a task entry with `pi.appendEntry`. Pi places it on the current branch and never sends it to the model. The state is a fold over the branch's task entries (`foldState()`), computed at `session_start` and `session_tree` and otherwise kept in memory; a write adds its entry to the in-memory list and folds again.

**Changes.** The model's `freeflow_task` tool lists records, proposes attaching (the user confirms with `ctx.ui.confirm`; without UI it is refused), switches focus, and detaches. The user's `/freeflow task` command does the same without a confirmation, adds `confirm` for held records, and with no argument opens a picker over this repository's records. Each change sets `refreshState`, so the next request carries a Runtime State with the new `Task Memory:` lines.

**Delivery.** The snapshot reaches the model:

1. as the tool result of `freeflow_task` attach or focus;
2. as a hidden `custom_message` after `/freeflow task` attach or focus;
3. after `/tree` navigation, reload, resume or a fork, through `deliver()`, unless the branch already holds a snapshot of that record since its latest compaction;
4. after a Freeflow compaction, as a fourth boundary entry after the compaction, carried context and recovery message (`snapshotEntry()` in `turn_end`);
5. after Pi's own compaction, through `deliver()` in `session_compact`.

**Gate.** `tool_call` checks, before routing's gate, whether the call would write a Working Record (`recordTargets()`): `edit` and `write` by path, `apply_patch` by its `*** … File:` lines, and `bash` running `working-record.mjs` with a mutating group (`slice`, `checkpoint`, `decision`, `task`) by its `--record` and `--root`. A target that is not attached, or is held, is refused with a reason naming what is attached.

**Navigation and fork.** `session_tree` rebuilds the state from the new branch before routing's restore; a change is reported with a notice. On `session_start` with reason `fork` (Pi uses the same reason for clone), every inherited attachment gets a hold entry.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| State lives in branch custom entries and follows navigation. | Matches the conversation at that branch point and needs no store; Pi copies the branch on fork. | A per-session sidecar, where going back could write one task's discussion into another record. | Task 001 D-003 |
| Attaching grants writes and needs the user; focus grants nothing and is the model's call. | Authority stays with the user without confirming every change of attention. | One writable task per session. | Task 001 D-002 |
| A record is identified by its absolute path; no registry. | Enough for one level; a registry with stable IDs comes with parent and child records. | Task IDs now. | Task 001 D-010 |
| Records are read through Track Work's `views.mjs`. | One implementation of the record format for both versions of Track Work. | A copy in the extension. | Task 001 D-013 |
| The gate refuses rather than warns. | A wrong-task write is silent and hard to undo. | Warning only. | Task 001 D-010 |
| A fork's attachments are held. | Two sessions would otherwise write one record by accident. | Inheriting them writable. | Task 001 D-003 |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| The `task-memory` skill is listed while task memory is off. | Pi's skill list is fixed (`STABLE_FREEFLOW_SURFACE`) so the system prompt does not change with settings; the tool is withdrawn instead. | The system prompt changes when the switch flips. |
| A shell write to a record by other means (`sed -i`, redirection) is not refused. | The gate guards a cooperating agent against the wrong record; Pi has no sandbox. | — |
| Reads of unattached records are allowed. | Reading grants nothing; scoped reads come with parent and child records. | — |
| Only the focus gets a snapshot; other attached records appear as Runtime State lines. | Progressive disclosure: the model focuses a record to get its resume view. | Every attached record's resume in context. |

## Limits

- Prototype: no cache prefix test or request-path budget count yet; the snapshot is a native tool result or message, so it keeps its position.
- The fork path is unit-tested; the SDK session the native fixture uses cannot fork.
- Not available under automatic Cognitive Routing.

## Related

- Spec and decisions: Task 001's record and `specs/pi-task-memory-one-level.md` (Git-ignored task memory).
- [Compaction](compaction.md), [Prompt assembly](prompt-assembly.md).
