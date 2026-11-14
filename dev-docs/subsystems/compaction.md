# Compaction

> **Covers:** `pi-extension/src/compaction/`, `pi-extension/src/store/`
> **Tests:** `pi-extension/tests/compaction/`, `pi-extension/tests/store/`, `pi-extension/tests/integration/request-path-budget.test.js`
> **Verified at:** `ecfd0788` (2026-11-10)
> **User docs:** `plugin-docs/capabilities/compaction.md`

For contributors changing Freeflow compaction on Pi and Pi's layer for the Freeflow store: when Freeflow tells the agent compaction is near, what it writes into the session, how Pi's own compaction works with it, and which behaviors are deliberate.

## Purpose

A long session outgrows the model's window. Pi compacts on its own: a separate summarizer call reads the conversation and the session continues from its summary and a recent tail. That summarizer has none of the working agent's knowledge of what the next step needs.

Freeflow compaction lets the working agent decide what survives, through Track Work: at a safe point the agent checkpoints its task (or, with no task, writes a session summary) with `checkpoint --compact` and ends its turn, and Freeflow writes Pi's compaction entry with the task's bundle (everything recovery reads, in one text) as its summary; the run continues from it. It is the same design as Freeflow's Claude Code mod (task-004's Spec, sections 9 and 11; [Freeflow store](freeflow-store.md)), on Pi's events. Pi's layer for the store also gives a session the task menu at its start, syncs the store, releases the hold at shutdown and shows the held task in the footer. When Freeflow arrives in a running session, by a reload that brings it in or `enabled` switched on after the start, the next run's start gives the menu it missed, once, as that run's message, after a line saying Freeflow started mid-session (SPEC-013): each session's start records its steps in the Freeflow home's `sessions/<session>/start.json`, the ledger Claude Code's mod keeps too, so a reload of a session that had its menu reads the ledger and gives nothing; a try that fails is logged and made once more at the next run.

It deliberately does not:

- turn off, cancel, or change Pi's own compaction, which stays as the fallback;
- write a summary of its own: the record's In flight is the agent's part (P59), and the bundle is made by Track Work's script;
- read the store or the session file on the way to a request (performance rule R-1).

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Cycle | The stretch of a session between two compactions; cycle 1 runs from session start to the first. Pi's compactions count too. | `nextCycle()`, `currentCycle()` in `harness.ts` |
| Notice | The one soft notice a cycle: keep working to a safe point, checkpoint with `--compact`, end the turn. | `Thresholds.notice`, notice level `"notice"` |
| Trigger | Where Pi compacts on its own: window minus Pi's reserve. | `Thresholds.trigger` |
| Checkpoint done | The held task's State as of, a worker session's `progress.md` time (`checkpoint --delegation`), or the session summary's time, is later than this cycle's notice, or its start when no notice came (P68). | `checkpointDone()` |
| Bundle | Track Work's `view bundle`: the record and everything recovery reads, whole, with the files In flight carries (P60). | `StoreLayer.bundle()` |
| Store state | `session status` as last read: the store, the held task, the session summary, a waiting compaction request. | `StoreLayer.current()` |
| Harness part | The part of the summary Freeflow writes from facts it holds: the cycle, what asked for the compaction, running background commands, the Freeflow skills read in the cycle it ends. | `harnessPart()` in `harness.ts` |
| Fallback | Pi's own compaction, with the bundle after its summary when a task is held. | `CompactionController.fallback()` |

## How It Works

### The store layer

`StoreLayer` (`store/layer.ts`) runs Track Work's script from Freeflow's package with Pi's environment and keeps `session status` in memory. It is read at session start, after the agent's own run of the script (off the request path, not awaited), when a run that touched the store ends, and at a compaction; the request path never reads it.

- **Session start** (`index.ts`): `sessionEnvironment()` sets `FREEFLOW_SESSION` (Pi's session ID), `FREEFLOW_HARNESS=Pi`, `FREEFLOW_TRANSCRIPT` (the session file), `FREEFLOW_RESUME` (`pi --session <file>`) and `FREEFLOW_CONTEXT_WINDOW` in the process, so the agent's commands, which Pi's bash runs with its environment, and Freeflow's own see the same session (T6). Then, not awaited: where a store exists, `store sync --pull` and `task here --rules --take-back`, which first takes back the task this session held when it ended, delivered as one `freeflow-store` message for the next turn; where none exists, what `session status` lists as missing. A `/reload` only reads the state again.
- **A tool call** that runs `working-record.mjs`, or a file tool on a path inside the store, marks the run as touching the store (`touchesStore()`).
- **The run's last turn** (a `turn_end` whose message has no tool calls): after a run that touched the store, `session status` is read again and `store sync` runs when something changed; then the compaction below.
- **Shutdown:** `task release --ended` for a held task, so a resume of the session takes it back, else `store sync` when something changed. A reload's shutdown is not the session's end (the same session starts again), so it keeps the hold and only syncs.
- **Footer and status:** the footer adds `task <ID>` while the session holds one; `/freeflow status` has a `store:` line.

### Notices

Worked example, 200k window with Pi's default reserve: trigger 200,000 − 16,384 = 183,616; the notice a lead of 20,000 tokens before it, 163,616, under the 750,000 ceiling. Nothing is sent before it.

1. **Measure.** `turn_end` calls `compaction.observe(ctx, turn)`. `measure()` takes the context from the turn's own usage, or Pi's estimate when the turn reports none. Thresholds come from `strictest()` over the active model.
2. **Notify.** Below the notice, `observe()` returns nothing: the notice is the only signal before compaction. At the notice point, the cycle's one notice, then nothing more that cycle. The notice names the held task and the command (`checkpoint --record <ID> --compact`), or `checkpoint --session --compact` with none; in a worker session (one that ran `delegate join`, SPEC-009), `checkpoint --delegation <D-NNN> --compact`, and its compaction installs `view bundle --delegation`, its end running `release --ended` then a sync; and, for a coordinator whose current Slice waits on a delegation, `WaitWatch` (`store/waits.ts`) gives one row when it comes back (`D-NNN returned (done). S-NNN waits on it: check it and close it.`), through the inbound channel batched over 60 seconds, waking the idle session where `delegation.wakeOnReturn` is on; it reads session status again at a run's end and once a minute while idle, only while something it waits on has not come back; under projection it tells the Coordinator to delegate the checkpoint. `index.ts` sends it as a `freeflow-compaction-notice` message: steered into the next request mid-run, held for the next prompt at a run's end.

### The compaction

The agent's `checkpoint --compact` writes the request into the store's `sessions/<session>/compact.json` (in the Freeflow home, so a session summary needs no store, P4), when the session's driver claims `compact` in its `capabilities.json`; Pi's extension writes its claims at session start (`src/events/`), with `compact` yes while compaction is on, and where no driver claims it the script writes no request and says so (SPEC-006 P11). At the run's last turn, `settle()`:

1. reads the store again (the run touched it), and finds a request not yet done;
2. skips a turn that errored, was aborted or hit its length limit, and a checkpoint not done;
3. makes the bundle (`view bundle --record <record>`, or `--session`);
4. returns two entries and `continue: true`, which Pi appends before continuing the run: a Pi `compaction` entry with `firstKeptEntryId: null` (nothing raw is kept), the bundle followed by the harness part, and `details` holding Pi's file lists and `freeflow: { version: 2, cycle, bundle: "task" | "session", profile?, assignment? }`; and a visible `freeflow-compaction-recovery` message saying the conversation is now the bundle;
5. marks the request done and removes a session summary it installed.

A bundle that cannot be made (a record left invalid mid-edit) is said in one recovery message, with no compaction and the request still waiting. Pi fires no `session_compact` for entries an extension appends, so the resets run at the next `turn_start` (`takeCompacted()`).

`/freeflow compact` sends `USER_REQUEST` as a `freeflow-compaction-request` message, starting a turn when idle: checkpoint now with `--compact`, then end the turn.

### Pi's own compaction

When Pi compacts (its trigger, an overflowing request, or `/compact`), `session_before_compact` calls `fallback()`, which reads the store first:

- **Checkpoint done** (a held task or a session summary): the bundle is the summary and no summarizer runs; Pi's kept tail stays (Pi's result needs a kept entry). The request, if any, is answered.
- **A held task, not checkpointed:** Pi's summarizer, told that the record holds the work up to its State as of and to keep what happened after; then the harness part and `view bundle --fallback`: the bundle as of the last checkpoint and the user's messages since, word for word (P16).
- **No task:** Pi's summarizer with Freeflow's general instructions (`FALLBACK_INSTRUCTIONS`), then the harness part.

Pi's file lists from an earlier Freeflow compaction are added back into Pi's preparation. If anything throws, `fallback()` returns `undefined` and Pi compacts as it would alone.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| The agent asks with Track Work's `checkpoint --compact`; Freeflow installs the bundle (P1). | One method on every harness: the record is the compaction's summary, and Claude Code's mod does the same. | `compact_context` and a hand-written summary in a fixed shape; a Pi capability skill teaching it (P3: Track Work holds the method). | task-004 A-004 |
| Compaction is written at the run's last `turn_end`, not at `agent_before_settle`. | Registering `agent_before_settle` added three branch walks to a prompt with routing (13 against a budget of 10), and the last `turn_end` sees the same moment. | `agent_before_settle`, Pi's dedicated run-end boundary. | `request-path-budget.test.js` |
| One soft notice a cycle a lead of 20,000 tokens before Pi's trigger, under a ceiling of 750,000 tokens, and no row before it (P5, P80; rows removed, 2026-11-14). The formula is `lib/notice5.mjs`'s, shared with every driver and Track Work's planner. | As on Claude Code: a soft notice the agent acts on at a safe point; repeats turned a soft notice into a hard one. | The warning, then "compact now" every further 10k tokens. | task-004 P5, P50 |
| The store's state is held in memory and read only at session start, after the agent's own script run, at a run's end after a store touch, and at a compaction. | Performance rule R-1: the request path never reads store files. A notice names the task from memory. | `session status` on every turn, as the mod's turn end does. | [Performance](../guides/performance.md) |
| The session's environment is set in Pi's process. | Pi's bash spreads `process.env` into each command (`getShellEnv()`, Pi 1.4.0), so the agent's own `checkpoint` writes for the same session Freeflow reads. | Passing the session to each script run only, which leaves the agent's commands without it. | Pi `src/utils/shell.ts` at v1.4.0 |
| Track Work's script reads Pi's session file along its active branch for `discussion capture` (P2). | One reader per transcript format serves every command; the branch walk ignores a branch left with `/tree`. | Pi's own result index (`r12`) and carry: a second carry path that would differ from Claude Code's. Tool results are not carried at all since 2026-11-03: Carry is files only. | `skills/track-work/scripts/lib/pi-session.mjs` |
| Pi's own compaction stays on; with the checkpoint done the bundle replaces its summary, otherwise the bundle follows it. | Pi's `compaction.enabled = false` also disables its recovery from an overflowing request. | Turning Pi's automatic compaction off. | `d75ac55`, P16 |
| Freeflow's code never names a Working Record; the bundle and the notice name the task the store says this session holds. | The store's hold is the only reliable link between a session and a task. | Guessing from the repository. | P40 |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| Nothing compacts until the run ends, even right after `checkpoint --compact`. | Track Work says to end the turn after it; compacting mid-turn would cut off the agent's own last step. | A compaction between a command and its result. |
| A checkpoint taken before this cycle's notice does not count once the notice came. | The notice asked for a fresh checkpoint (T12). | A stale record installed as the next cycle. |
| The compaction entry keeps nothing raw. | The bundle replaces the conversation on purpose. | The checkpointing turns are kept and refill the cycle. |
| Pi's own compaction after a checkpoint keeps Pi's kept tail. | Pi's compaction result must name a kept entry; only an extension's entry can keep none. | — |
| The menu arrives with the next turn, not at startup. | Startup is not held up by a pull over the network; the message joins the first prompt's run. | A slow start on every launch. |
| No notice repeats, however far the context grows. | A soft notice that repeats becomes a hard one; Pi's own compaction is the backstop. | Notice spam. |

## Surface

**Configuration:** `compaction.enabled` (default on; off: no notices, no Freeflow compaction, Pi's compaction unchanged). `compaction.carry` (context reuse) is retired: tool results are not carried, so a config that sets it still loads and it does nothing. Pi settings read, never written: `compaction.reserveTokens` and its per-model overrides.

**Environment set:** `FREEFLOW_SESSION`, `FREEFLOW_HARNESS`, `FREEFLOW_TRANSCRIPT`, `FREEFLOW_RESUME`, `FREEFLOW_CONTEXT_WINDOW` (also on `model_select`). Read: `FREEFLOW_HOME`, through the script.

**Commands:** `/freeflow compact`; `/freeflow status` shows the cycle, the context against the notice and Pi's trigger, the last compaction's kind, and the `store:` line.

**Events handled** (`index.ts`): `session_start` (environment, store start, `reset()`), `tool_call` (store touch), `tool_result` (state read after the script), `turn_end` (notices; at the last turn, sync and compaction), `turn_start` (post-compaction resets), `session_before_compact` (fallback), `session_shutdown` (release), `model_select` (the window).

**Messages:** `freeflow-store` (the menu), `freeflow-compaction-notice` (`details.level`: the notice), `freeflow-compaction-request`, `freeflow-compaction-recovery`, each in Freeflow's notice tag.

## State

- **Session entries:** the `compaction` entry above; a fallback keeps Pi's details and adds `freeflow: { version: 2, cycle, fallback: true }`.
- **The Freeflow home:** `sessions/<session>/compact.json` and `summary.md`, written by Track Work's script, answered and removed here; the request only where `capabilities.json` claims `compact`.
- **Memory only:** `CompactionController.sent` (the cycle's notice time, also kept in `sessions/<session>/cycle.json` beside the cycle number, the copy a reload reads once; the Claude Code mod keeps the same file), `startedAt`, `compacted`; `StoreLayer`'s state and whether this run touched the store. Cleared at session start and shutdown; a reload does not send the notice its cycle already sent.

## Invariants

- Freeflow never cancels Pi's compaction; any failure in `fallback()` returns `undefined`. Guarded by `controller.test.js`.
- A compaction is written only for a waiting request whose checkpoint is done, at a turn that ended normally. Guarded by `controller.test.js` and `bundle.test.js`.
- The request after Freeflow's compaction starts from the bundle, and the next request extends it. Guarded by `bundle.test.js`.
- The request path reads no store or session file, and asks Pi for the branch at most once per leaf. Guarded by `request-path-budget.test.js`.

## Failure Behavior

| Failure | Result |
| --- | --- |
| The bundle cannot be made | One recovery message names the error; no compaction; the request waits. |
| The compacting turn errors, aborts or hits its length limit | Nothing is written; the request waits for the next run's end. |
| The script cannot run or prints nothing readable | The last known state is kept; nothing compacts. |
| Pi compacts before the checkpoint | Pi's summary, then the bundle as of the last checkpoint and the user's messages since. |
| No model reports a context window | No notice; `checkpoint --compact` still compacts at the run's end. |

## Cost

- **Per turn:** `observe()` follows the [performance rules](../guides/performance.md): context from the turn's usage, one branch walk per leaf. A tool call adds a string check; only a run that touched the store reads it at its end.
- **Per compaction:** two script runs (`session status`, `view bundle`), off the request path. The next cycle starts with the bundle, whose size Track Work's budget keeps.
- **Prompt cache:** notices and the menu are appended messages; tools and skills stay fixed. The request after a compaction starts a new prefix, and later requests extend it.

## Code Map

- `skills/track-work/scripts/lib/notice5.mjs`: the notice point, the one formula Claude Code's mod, Pi, Codex and Track Work's planner and estimate share.
- `pi-extension/src/compaction/`: `controller.ts` (`observe`, `settle`, `fallback`, `statusText`), `thresholds.ts`, `harness.ts`, `config.ts`. Its [README](../../pi-extension/src/compaction/README.md) lists each file.
- `pi-extension/src/store/layer.ts`: `StoreLayer`, `scriptRunner()`, `sessionEnvironment()`, `touchesStore()`, and the session-start ledger (`readStartLedger()`, `keepStartLedger()`).
- `pi-extension/src/index.ts`: the hosts, the event handlers, `/freeflow compact`, the store's start and status line.
- `skills/track-work/scripts/lib/pi-session.mjs`: Track Work's reader for Pi's session file.

## Tests

`thresholds.test.js` (the notice point), `controller.test.js` (notices, the run-end compaction, a session summary, a bundle that fails, Pi's compaction in its three cases), `bundle.test.js` (a real Pi session with Track Work's real script: a session summary with no store, and a task in a local store, compacted with the bundle; the next request extends the one after compaction), `harness.test.js`, `pi-extension/tests/store/layer.test.js` (store touches, the environment, session start, the run's end, an answered request), and `pi-extension/tests/store/catch-up.test.js` (an in-process Pi session: Freeflow switched on after the start gets the menu at the next run, once; a session that started with it gets none). `request-path-budget.test.js` bounds the per-turn work.

## Limits

- The live compaction on a real model has not been driven on Pi (P9's check needs a model key).
- Slice measurement on Pi uses `--used`: Track Work has no reader for Pi's usage records.
