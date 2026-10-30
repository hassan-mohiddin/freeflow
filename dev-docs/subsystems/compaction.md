# Compaction

> **Covers:** `pi-extension/src/compaction/`, `pi-extension/src/store/`
> **Tests:** `pi-extension/tests/compaction/`, `pi-extension/tests/store/`, `pi-extension/tests/integration/request-path-budget.test.js`
> **Verified at:** `992efbd4` (2026-10-30)
> **User docs:** `plugin-docs/capabilities/compaction.md`

For contributors changing Freeflow compaction on Pi and Pi's layer for the Freeflow store: when Freeflow tells the agent compaction is near, what it writes into the session, how Pi's own compaction works with it, and which behaviors are deliberate.

## Purpose

A long session outgrows the model's window. Pi compacts on its own: a separate summarizer call reads the conversation and the session continues from its summary and a recent tail. That summarizer has none of the working agent's knowledge of what the next step needs.

Freeflow compaction lets the working agent decide what survives, through Track Work: at a safe point the agent checkpoints its task (or, with no task, writes a session summary) with `checkpoint --compact` and ends its turn, and Freeflow writes Pi's compaction entry with the task's bundle (everything recovery reads, in one text) as its summary; the run continues from it. It is the same design as Freeflow's Claude Code mod (task-004's Spec, sections 9 and 11; [Freeflow store](freeflow-store.md)), on Pi's events. Pi's layer for the store also gives a session the task menu at its start, syncs the store, releases the hold at shutdown and shows the held task in the footer.

It deliberately does not:

- turn off, cancel, or change Pi's own compaction, which stays as the fallback;
- write a summary of its own: the record's In flight is the agent's part (P59), and the bundle is made by Track Work's script;
- read the store or the session file on the way to a request (performance rule R-1);
- let a Coordinator under projection checkpoint (it delegates to a worker).

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Cycle | The stretch of a session between two compactions; cycle 1 runs from session start to the first. Pi's compactions count too. | `nextCycle()`, `currentCycle()` in `harness.ts` |
| Notice | The one soft notice a cycle: keep working to a safe point, checkpoint with `--compact`, end the turn. | `Thresholds.notice`, notice level `"notice"` |
| Row | One line at 50, 60 or 70% of the window, below the notice, once each a cycle. | `ROWS_AT`, notice level `"row"` |
| Trigger | Where Pi compacts on its own: window minus Pi's reserve. | `Thresholds.trigger` |
| Checkpoint done | The held task's State as of, or the session summary's time, is later than this cycle's notice, or its start when no notice came (P68). | `checkpointDone()` |
| Bundle | Track Work's `view bundle`: the record and everything recovery reads, whole, with this compaction cycle's newest tool results (P2, P60). | `StoreLayer.bundle()` |
| Context reuse | Whether the bundle adds the newest tool results; off passes `--no-recent`. | `compaction.carry`, `CompactionHost.carryEnabled()` |
| Store state | `session status` as last read: the store, the held task, the session summary, a waiting compaction request. | `StoreLayer.current()` |
| Harness part | The part of the summary Freeflow writes from facts it holds: the cycle, what asked for the compaction, the routing profile, running background commands, the Freeflow skills read in the cycle it ends. | `harnessPart()` in `harness.ts` |
| Fallback | Pi's own compaction, with the bundle after its summary when a task is held. | `CompactionController.fallback()` |

## How It Works

### The store layer

`StoreLayer` (`store/layer.ts`) runs Track Work's script from Freeflow's package with Pi's environment and keeps `session status` in memory. It is read at session start, after the agent's own run of the script (off the request path, not awaited), when a run that touched the store ends, and at a compaction; the request path never reads it.

- **Session start** (`index.ts`): `sessionEnvironment()` sets `FREEFLOW_SESSION` (Pi's session ID), `FREEFLOW_HARNESS=Pi`, `FREEFLOW_TRANSCRIPT` (the session file), `FREEFLOW_RESUME` (`pi --session <file>`) and `FREEFLOW_CONTEXT_WINDOW` in the process, so the agent's commands, which Pi's bash runs with its environment, and Freeflow's own see the same session (T6). Then, not awaited: where a store exists, `store sync --pull` and `task here --rules`, delivered as one `freeflow-store` message for the next turn; where none exists, what `session status` lists as missing. A `/reload` only reads the state again.
- **A tool call** that runs `working-record.mjs`, or a file tool on a path inside the store, marks the run as touching the store (`touchesStore()`).
- **The run's last turn** (a `turn_end` whose message has no tool calls): after a run that touched the store, `session status` is read again and `store sync` runs when something changed; then the compaction below.
- **Shutdown:** `task release` for a held task, else `store sync` when something changed.
- **Footer and status:** the footer adds `task <ID>` while the session holds one; `/freeflow status` has a `store:` line.

### Notices

Worked example, 200k window with Pi's default reserve: trigger 200,000 − 16,384 = 183,616; the notice at the lower of 75% (150,000) and the trigger less a tenth of the window (163,616), so 150,000. Rows at 100,000, 120,000 and 140,000.

1. **Measure.** `turn_end` calls `compaction.observe(ctx, turn)` after routing's turn end. `measure()` takes the context from the turn's own usage, and for a Coordinator under projection the larger of that and the full history's estimate. Thresholds come from `strictest()`: the lowest notice among every model that may receive the full history.
2. **Notify.** Below the notice, `observe()` returns a row at the highest of 50, 60 and 70% crossed, each once a cycle; at the notice, the cycle's one notice, then nothing more that cycle. The notice names the held task and the command (`checkpoint --record <ID> --compact`), or `checkpoint --session --compact` with none; under projection it tells the Coordinator to delegate the checkpoint. `index.ts` sends it as a `freeflow-compaction-notice` message: steered into the next request mid-run, held for the next prompt at a run's end.

### The compaction

The agent's `checkpoint --compact` writes the request into the store's `sessions/<session>/compact.json` (in the Freeflow home, so a session summary needs no store, P4). At the run's last turn, `settle()`:

1. reads the store again (the run touched it), and finds a request not yet done;
2. skips a turn that errored, was aborted or hit its length limit, and a checkpoint not done;
3. makes the bundle (`view bundle --record <record>`, or `--session`), with `--no-recent` when context reuse is off;
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

### With Cognitive Routing

- The compaction records the routing profile and the assignment in progress; routing reads them back (`workerCompaction()`, `compactedInAssignment()` in `assembler.ts`).
- A Coordinator under projection is told to delegate the checkpoint; Cognitive Routing's skill holds the rule (P3).

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| The agent asks with Track Work's `checkpoint --compact`; Freeflow installs the bundle (P1). | One method on every harness: the record is the compaction's summary, and Claude Code's mod does the same. | `compact_context` and a hand-written summary in a fixed shape; a Pi capability skill teaching it (P3: Track Work holds the method). | task-004 A-004 |
| Compaction is written at the run's last `turn_end`, not at `agent_before_settle`. | Registering `agent_before_settle` added three branch walks to a prompt with routing (13 against a budget of 10), and the last `turn_end` sees the same moment. | `agent_before_settle`, Pi's dedicated run-end boundary. | `request-path-budget.test.js` |
| One soft notice a cycle at the lower of 75% and a tenth of the window before Pi's trigger; rows at 50, 60 and 70% (P5, P80). | As on Claude Code: a soft notice the agent acts on at a safe point; repeats turned a soft notice into a hard one. | The warning, then "compact now" every further 10k tokens. | task-004 P5, P50 |
| The store's state is held in memory and read only at session start, after the agent's own script run, at a run's end after a store touch, and at a compaction. | Performance rule R-1: the request path never reads store files. A notice names the task from memory. | `session status` on every turn, as the mod's turn end does. | [Performance](../guides/performance.md) |
| The session's environment is set in Pi's process. | Pi's bash spreads `process.env` into each command (`getShellEnv()`, Pi 1.4.0), so the agent's own `checkpoint` writes for the same session Freeflow reads. | Passing the session to each script run only, which leaves the agent's commands without it. | Pi `src/utils/shell.ts` at v1.4.0 |
| Track Work's script reads Pi's session file along its active branch for `carry list`, the bundle's results and `discussion list` (P2). | One reader per transcript format serves every command; the branch walk ignores a branch left with `/tree`. | Pi's own result index (`r12`) and carry: a second carry path that would differ from Claude Code's. | `skills/track-work/scripts/lib/pi-session.mjs` |
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

**Configuration:** `compaction.enabled` (default on; off: no notices, no Freeflow compaction, Pi's compaction unchanged) and `compaction.carry` (context reuse; off: `--no-recent`). Pi settings read, never written: `compaction.reserveTokens` and its per-model overrides.

**Environment set:** `FREEFLOW_SESSION`, `FREEFLOW_HARNESS`, `FREEFLOW_TRANSCRIPT`, `FREEFLOW_RESUME`, `FREEFLOW_CONTEXT_WINDOW` (also on `model_select`). Read: `FREEFLOW_HOME`, through the script.

**Commands:** `/freeflow compact`; `/freeflow status` shows the cycle, the context against the notice and Pi's trigger, the last compaction's kind, and the `store:` line.

**Events handled** (`index.ts`): `session_start` (environment, store start, `reset()`), `tool_call` (store touch), `tool_result` (state read after the script), `turn_end` (notices; at the last turn, sync and compaction), `turn_start` (post-compaction resets), `session_before_compact` (fallback), `session_shutdown` (release), `model_select` (the window).

**Messages:** `freeflow-store` (the menu), `freeflow-compaction-notice` (`details.level` row or notice), `freeflow-compaction-request`, `freeflow-compaction-recovery`, each in Freeflow's notice tag.

## State

- **Session entries:** the `compaction` entry above; a fallback keeps Pi's details and adds `freeflow: { version: 2, cycle, fallback: true }`.
- **The Freeflow home:** `sessions/<session>/compact.json` and `summary.md`, written by Track Work's script, answered and removed here.
- **Memory only:** `CompactionController.sent` (the cycle's highest row and its notice time), `startedAt`, `compacted`; `StoreLayer`'s state and whether this run touched the store. Cleared at session start and shutdown; a reload can show a row again.

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
| No model reports a context window | No rows or notice; `checkpoint --compact` still compacts at the run's end. |

## Cost

- **Per turn:** `observe()` follows the [performance rules](../guides/performance.md): context from the turn's usage, one branch walk per leaf. A tool call adds a string check; only a run that touched the store reads it at its end.
- **Per compaction:** two script runs (`session status`, `view bundle`), off the request path. The next cycle starts with the bundle, whose size Track Work's budget keeps.
- **Prompt cache:** notices and the menu are appended messages; tools and skills stay fixed. The request after a compaction starts a new prefix, and later requests extend it.

## Code Map

- `pi-extension/src/compaction/`: `controller.ts` (`observe`, `settle`, `fallback`, `statusText`), `thresholds.ts`, `harness.ts`, `config.ts`. Its [README](../../pi-extension/src/compaction/README.md) lists each file.
- `pi-extension/src/store/layer.ts`: `StoreLayer`, `scriptRunner()`, `sessionEnvironment()`, `touchesStore()`.
- `pi-extension/src/index.ts`: the hosts, the event handlers, `/freeflow compact`, the store's start and status line.
- `skills/track-work/scripts/lib/pi-session.mjs`: Track Work's reader for Pi's session file.

## Tests

`thresholds.test.js` (the notice and rows), `controller.test.js` (notices, the run-end compaction, a session summary, a bundle that fails, Pi's compaction in its three cases), `bundle.test.js` (a real Pi session with Track Work's real script: a session summary with no store, and a task in a local store, compacted with the bundle; the next request extends the one after compaction), `harness.test.js`, and `pi-extension/tests/store/layer.test.js` (store touches, the environment, session start, the run's end, an answered request). `request-path-budget.test.js` bounds the per-turn work.

## Limits

- The live compaction on a real model has not been driven on Pi (P9's check needs a model key).
- Under Cognitive Routing, a worker's checkpoint is followed by the compaction only when the whole run ends; no test drives a routed worker's checkpoint.
- Slice measurement on Pi uses `--used`: Track Work has no reader for Pi's usage records.
