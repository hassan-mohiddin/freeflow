# Compaction

> **Covers:** `pi-extension/src/compaction/`, `capabilities/compaction/`
> **Tests:** `pi-extension/tests/compaction/`, `pi-extension/tests/integration/request-path-budget.test.js`
> **Verified at:** `d8cff54e` (2026-10-03)
> **User docs:** `plugin-docs/capabilities/compaction.md`

For contributors changing Freeflow compaction on Pi: how it decides when compaction is due, what it writes into the session, how it works with Cognitive Routing and with Pi's own compaction, and which of its behaviors are deliberate.

## Purpose

A long session outgrows the model's window. Pi handles that by compacting on its own: a separate summarizer call reads the conversation, writes a summary, and the session continues from the summary and a recent tail. That summarizer has none of the working agent's knowledge of what the next step needs, so it can drop exactly that.

Freeflow compaction lets the working agent compact itself. Freeflow measures the context after every turn, warns the agent ahead of Pi's limit, and offers a tool, `freeflow_compact`. At a safe point the agent updates its Working Record, writes a summary, picks what to carry, and calls the tool. At the end of that turn Freeflow writes the compaction into the session and the same run continues from the summary, the carried context and a recovery message.

It deliberately does not:

- turn off, cancel, or change Pi's own compaction, which stays as the fallback;
- decide which Working Record belongs to the work (the agent's summary names it);
- resolve carried content later: everything carried is copied into the session at compaction;
- let a Coordinator under projection compact (it delegates to a worker).

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Cycle | The stretch of a session between two compactions. Cycle 1 runs from session start to the first compaction; Pi's compactions count too. | `nextCycle()`, `currentCycle()` in `harness.ts` |
| Warning | The first point: compaction is due, keep working to a safe point. | `Thresholds.warning`, notice level `"warning"` |
| Compact now | The firm point, 25k tokens before Pi's trigger. | `Thresholds.compactNow`, notice level `"compactNow"` |
| Trigger | Where Pi compacts on its own: window minus Pi's reserve. | `Thresholds.trigger` |
| Due | `freeflow_compact` is accepted: context past the warning, or the user ran `/freeflow compact` in this cycle. | `CompactionController.isDue()` |
| Safe point | A finished step whose result the agent knows. Taught by the skill, not enforced. | `capabilities/compaction/SKILL.md` |
| Carry | Content copied into the next cycle: the user's latest messages, the agent's picks (files, tool results), and an automatic fill. | `carry.ts`, `CompactionController.fill()` |
| Context reuse | The switch for carrying files and results. Off: only the summary and the user's messages carry over. | `compaction.carry`, `CompactionHost.carryEnabled()` |
| Result index | Under no routing, the list of this cycle's larger tool results with ids `r1`, `r2`, … the agent carries by. | `resultIndex()`, `renderIndex()` in `results.ts` |
| Routing ref | Under Cognitive Routing, a tool result's source ref `ctx:<entry-id>`, used instead of `r` ids. | `CompactionHost.nativeRefs()`, `resolveRef()` |
| Harness part | The part of the summary Freeflow writes from facts it holds. | `harnessPart()` in `harness.ts` |
| Fallback | Pi's own compaction with Freeflow's instructions and state added. | `CompactionController.fallback()` |

Terms from elsewhere in Freeflow, defined fully in their own docs:

- **Cognitive Routing** splits work between a **Coordinator** (talks to the user, plans, assesses) and **workers** (Helper and Executor profiles) that carry out **assignments**, each with a written **contract**, and end them with `freeflow_return`. A worker selects tool results as **evidence** for the Coordinator by routing ref. With **projection** on, the Coordinator's requests carry a reduced view: its own conversation plus selected evidence, not the workers' full history. See [Cognitive Routing](cognitive-routing.md).
- **Working Record:** a task's `record.md` under `.freeflow/tasks/`, kept by the Track Work skill; recovery after compaction starts from it when the summary names one.
- **Codemode:** Pi's mode in which the model writes a script that calls tools; those calls appear as nested calls on the script's result.

## How It Works

### The agent path

Worked example, 200k window with Pi's default reserve: trigger 200,000 − 16,384 = 183,616; compact now 183,616 − 25,000 = 158,616; warning the lower of 70% (140,000) and 158,616 − 20,000 = 138,616, so 138,616. The [user guide](../../plugin-docs/capabilities/compaction.md) tabulates other windows.

1. **Measure.** Pi's `turn_end` handler in `index.ts` calls `compaction.observe(ctx, turn)` after routing's own turn end. `measure()` takes the context size from the turn's own usage (`turnContextTokens()`), falling back to Pi's `getContextUsage()`. For a Coordinator under projection it takes the larger of that and the full history's estimate (`fullHistoryTokens()`), because the next worker request carries everything the Coordinator's small view leaves out. Thresholds come from `strictest()`: the smallest warning among every model that may receive the full history (the active model and, under routing, each profile's model), each with Pi's effective reserve.
2. **Notify.** `observe()` returns a notice when the context crosses the warning (once per cycle) or compact now (on crossing, then each further 10k tokens). The first notice of a cycle, and the first compact now, include the result index when there is one. `index.ts` sends it as a `freeflow-compaction-notice` custom message: steered into the next request when the turn had tool calls (mid-run), held for the next prompt when the run is ending.
3. **Request.** The agent reads the compaction skill and calls `freeflow_compact({ summary, carry })`. `request()` validates the call: compaction effective and due, not a Coordinator under projection, summary non-empty and at most 8,000 tokens, carry items well-formed and readable, within the carry budget. A valid call is stored as `pending` and the tool answers that compaction happens at the end of the turn. Nothing is written yet.
4. **Write.** At the same turn's end, `turnEnd()` runs before `observe()`. With a pending request and a normal stop (the assistant message's `stopReason` is not `error`, `aborted` or `length`) it re-reads the carried files fresh, fills the rest of the budget automatically, and returns three entries plus `continue: true`, which Pi appends and then continues the run:
   - a Pi `compaction` entry with `firstKeptEntryId: null` (nothing raw is kept), the agent's summary followed by the harness part, and `details` holding Pi's file lists and Freeflow's record;
   - a hidden `freeflow-carried-context` custom message;
   - a visible `freeflow-compaction-recovery` custom message telling the agent how to recover and not to re-read what was carried.
5. **Reset.** Pi fires no `session_compact` for entries an extension appends, so `takeCompacted()` hands the compaction to the next `turn_start`, which runs the same resets as Pi's compaction (`restore(ctx, false)`: request history, cache tracking, routing reconcile; `false` because the branch is unchanged, so file state is not invalidated as after navigation) and reduces file tracking to the carried files (`files.compacted()`).

`/freeflow compact` calls `requestByUser()`, which makes compaction due for this cycle, then sends `USER_REQUEST` (plus the result index) as the user's message, steered when a run is active.

### Carry

The carried context holds, in order: the user's latest messages (up to 3, 8,000 tokens, outside the budget, never the `/freeflow compact` text), the agent's files read fresh at compaction and numbered by file line, the agent's picked results, the automatic fill, and a list of the work's other results by ref.

The automatic fill takes the newest results of the work in progress (the current assignment under routing, otherwise the cycle) into the room the picks left, skipping any that does not fit. Freeflow's control calls and reads of its own instructions (`capabilities/`, `skills/`, `runtime/`) are excluded, as are earlier `read` results of a file the agent carries fresh. Up to 60 of the rest are listed by ref.

The budget is the smallest of 15% of the window, 40k tokens, and a quarter of the warning point (`carryBudget()`).

### With Cognitive Routing

- The agent's context already names every result by routing ref, so no result index is sent and carry resolves `ctx:` refs through routing (`evidenceSource()`).
- The compaction record stores the routing profile and the assignment in progress. Routing reads them back: the Coordinator's Runtime State says which worker compacted (`workerCompaction()` in `assembler.ts`), and when routing re-sends the assignment's contract to the worker, a line after it says the worker compacted during this assignment (`compactedInAssignment`), so a contract asking for compaction does not read as undone.
- The carried-context entry has a second version in `details.coordinatorContent`: the user's messages and only the names of the worker's copies. `projection.ts` swaps it in for the Coordinator's selective view.
- Evidence the Coordinator received after a compaction stays in its view until the next compaction (`assessedSinceCompaction` in `assembler.ts` and `projection.ts`).

### Pi's own compaction

When Pi compacts (its trigger, an overflowing request, or `/compact`), `session_before_compact` calls `fallback()`. It drops any pending Freeflow compaction, adds the previous compaction's file lists back into Pi's preparation, and runs Pi's summarizer with Freeflow's instructions appended (`FALLBACK_INSTRUCTIONS`, which Pi shows as "Additional focus"). It then appends the harness part, which under routing lists the assignment's results by ref, with recovery steps, and records `freeflow.fallback: true`. Pi keeps its own summary shape and kept tail. If anything throws, `fallback()` returns `undefined` and Pi compacts as it would alone.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| The working agent prepares the compaction; Freeflow writes it as Pi's own `compaction` entry at `turn_end`, then carried context and recovery, and the run continues. | The working agent knows what the next step needs; Pi's summarizer is a separate call without that knowledge. Writing Pi's own entry type keeps Pi's session model and later compactions (Pi's or Freeflow's) working. | Only improving Pi's summarizer (still a reader without the working knowledge); cancelling Pi's compaction and replacing it (Freeflow never cancels it). | `6b56e7d` |
| Pi's own compaction stays on, improved with Freeflow's instructions and state. | Pi's `compaction.enabled = false` also disables its recovery from an overflowing request, so turning it off trades a rare bad summary for a failed session. | Turning Pi's automatic compaction off by default. | `d75ac55`, `da71c3a` |
| Warning at the lower of 70% of the window and 20k before compact now; compact now 25k before Pi's trigger, repeated every 10k; the smallest window among models that may get the full history. | The agent needs room to reach a safe point and then to prepare (reading the skill, updating the record, writing the summary). Pi checks its own trigger on an estimate before each response, so a step that started below it can end past it. | Compact now 10k before Pi's trigger (a live run reached it with about 1k tokens left to prepare). | `caf90f0`, `dcf82fc`, `7fb0792`, `da71c3a` |
| Compact at a safe point; finish work that ends within a step or two instead; a routed worker at compact now compacts before returning (except a worker answering an evidence recovery, which is read-only and cannot compact; see Limits). | Stopping mid-step loses state that is not written down. A final answer stops the session's growth, but a worker's return does not: the Coordinator and the next assignment continue the same history. | A warning that said "prepare now" (an agent one step from returning stopped to compact, then re-read what it had read); a worker always returning first. | `7fb0792`, `7cb89ed`, `97b149b` |
| Carry copies content (picks plus a greedy automatic fill of the newest work), lists the rest by ref, within min(15% window, 40k, warning/4). | A kept raw tail would keep the preparation turns themselves. Greedy fill carries the most recent work that fits. The warning cap stops a large Pi reserve from making the carried context refill the next cycle to the warning (seen in a live run). | A Pi-style kept tail. | `dcf82fc`, `7fb0792` |
| Context reuse off carries nothing, but under routing the ref list stays. | Evidence selection still needs to name results the worker no longer sees. | Dropping the list too. | `942057d`, `7fb0792` |
| Freeflow never names a Working Record; the summary does. | Freeflow cannot tell which record belongs to this work; a guessed record once sent recovery into another task. | Naming the most recent record. | `f00704a` |
| `/freeflow compact` is sent as the user's message. | A run started by an extension message loses Freeflow's system sections from its second request (Pi issue #10267). | Sending it as a Freeflow custom message. | `6b56e7d`, `f41f1e0` |
| A Coordinator under projection never compacts; it delegates an assignment whose contract says to read the compaction skill, compact with `freeflow_compact`, then return with `freeflow_return`. Its notices and the refusal say so. | Its view leaves out what workers did, so its summary would lose their work. | Letting the Coordinator compact its own view. | `6b56e7d`, `305f20b` |
| After a worker's compaction the Coordinator sees names, not copies; evidence it received stays in its view until the next compaction; no resume placement after a recovery suspension. | Copies would repeat evidence it receives by selection; dropping received evidence or re-placing it broke the Coordinator's cache prefix in live probes. | Showing the worker's carried context unchanged. | `01505b0`, `9849a16` |
| `freeflow_compact` is callable from codemode scripts (`exposure: "direct"`). | Agents that look for tools in codemode first concluded they could not compact. Routing tools stay model-only. | Model-only exposure. | `257ee32` |
| Carried files and read results are numbered by file line. | Agents re-read carried files with `nl` to cite lines. | Plain copies. | `97b149b` |
| Context size from the turn's own usage; full-history estimate extended incrementally; result index built only near the warning. | `observe()` runs after every turn; Pi's `getContextUsage()` rebuilds the session projection each call. | Asking Pi each turn; building the index every turn. | `9078dd0` |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| `freeflow_compact` is refused unless due. | Compaction is lossy; it should happen at Freeflow's notice or the user's request, not on the agent's whim. | Agents compact early and often, paying the per-cycle cost each time. |
| A second `freeflow_compact` in a cycle that began with a compaction is refused, saying where to go next. | After Freeflow's compaction the request is done; after Pi's, the prepared one is no longer needed. Routed workers otherwise compacted twice when their re-sent contract still asked for it. | Repeated compactions and loops. |
| A Coordinator under projection is always refused, even when due. | See Decisions. | Its summary loses worker work. |
| The compaction entry keeps nothing raw (`firstKeptEntryId: null`). | Carried content replaces the tail on purpose. | The preparation turns are kept and refill the cycle. |
| No `session_compact` event fires for a Freeflow compaction; resets run at the next `turn_start`. | Pi fires it only for its own compactions. | Resets placed in a `session_compact` handler never run for this path. |
| Notices are appended messages, never system-prompt changes. | The system section must stay fixed for the prompt cache. | Every notice invalidates the cached prefix. |
| The warning is sent once per cycle; compact now repeats only every further 10k. | Repeated notices fill the context they warn about. | Notice spam. |
| Pi still compacts on its own past its trigger, with Freeflow compaction on. | The fallback. | Overflow failures. |
| The automatic fill skips a too-large newest result and carries older, smaller ones. | Greedy fill uses the budget. | — |
| A `bash` or codemode output that repeats a freshly carried file is not removed from carry; only earlier `read` results of that file are. | Freeflow cannot tell reliably what a command printed. Accepted for now. | — |
| The Coordinator's carried context differs from the worker's. | See Decisions. | Duplicated evidence in the Coordinator's view. |
| `/freeflow compact`'s own text is not among the carried user messages. | The compaction completes that request. | The next cycle sees "compact now" as a pending instruction and compacts again. |
| The compaction skill is listed even when compaction is off. | Freeflow's skill list is resolved from a fixed surface (`STABLE_FREEFLOW_SURFACE`) so the system prompt does not change with settings; the tool, not the skill, is withdrawn. | The system prompt changes when the switch flips. |
| A turn that errors, aborts or hits its length limit writes no compaction, and compaction stays due. | The agent may not have finished preparing. | A half-prepared compaction. |

## Surface

**Configuration** (`.freeflow/config.json`, overridden by `.freeflow/local.json`, then session scope; validated by `validateCompactionConfig()`):

| Key | Default | Effect |
| --- | --- | --- |
| `compaction.enabled` | `true` | Effective only while Freeflow is enabled. Off: no notices, tool withdrawn, no fallback additions. |
| `compaction.carry` | `true` | Context reuse. Off: no result index, no budget, `carry` items refused. |

Pi settings read, never written: `compaction.reserveTokens` and `compaction.modelOverrides["<provider>/<id>"].reserveTokens` (`reserveTokens()`, default 16,384).

**Tool:** `freeflow_compact` (`tool.ts`). Parameters `summary` (required) and `carry` (items `{ file, lines? }` or `{ result }`). Registered once with `defaultActive: false`, declared by `applyCompactionTools()` only while compaction is effective, `exposure: "direct"`, `executionMode: "sequential"`.

**Commands:** `/freeflow compact` (`compactNow()` in `index.ts`); `/freeflow status` shows `statusText()`: cycle, context against each point, and the kind and carried size of the last compaction. `/freeflow settings` shows the Compaction and Context reuse switches.

**Events handled** (`index.ts`): `turn_end` (write or notify), `turn_start` (post-compaction resets), `session_before_compact` (fallback), `session_start` and `session_shutdown` (`reset()`).

**Messages:** `freeflow-compaction-notice` (visible, `details.level`), `freeflow-carried-context` (hidden), `freeflow-compaction-recovery` (visible). All start with Freeflow's notice prefix so the agent never reads them as the user's words.

**Skill:** `capabilities/compaction/SKILL.md` with `references/summary-format.md`: when to compact, the summary's shape, what to carry.

## State

**Session entries** (persisted by Pi):

- `compaction`: `summary` (agent summary plus harness part), `firstKeptEntryId: null`, `details.readFiles` / `details.modifiedFiles` (Pi's shape, session-wide), and `details.freeflow`:
  `{ version: 1, cycle, carried: [{ kind: "file", path, lines?, firstCycle, bodyHash | error } | { kind: "result", ref, tool, firstCycle, bodyHash, automatic? }], files: { read, changed }, requestedBy: "user" | "notice", profile?, assignment? }`.
  A fallback compaction keeps Pi's details and adds `freeflow: { version: 1, cycle, fallback: true, carried: [] }`.
- `custom_message` `freeflow-carried-context` (`display: false`; `details.coordinatorContent` under routing).
- `custom_message` `freeflow-compaction-recovery` (`display: true`).
- `custom_message` `freeflow-compaction-notice` (`details.level`).

**Memory only** (`CompactionController`): `requested` (the cycle the user asked in), `sent` (warning sent, compact-now level), `pending` (a validated request), `compacted` (for the `turn_start` resets). All cleared on `session_start` and `session_shutdown`. The cycle and due state are recomputed from the branch and the measurement, so a reload loses only a pending `/freeflow compact` request and the sent flags: a warning can repeat once after reload.

## Invariants

- Freeflow never cancels or alters Pi's compaction result except by appending to its summary and details; any failure returns `undefined`. Guarded by `fallback.test.js`.
- Nothing is written before the turn ends; a refused or pending call changes no session state. Guarded by `agent-path.test.js`.
- Carried files are read from disk at compaction, never copied from an earlier read. Guarded by `agent-path.test.js`.
- Carried content is copied into the session; no later lookup is needed to rebuild a reopened session. No test reopens a session for this.
- File lists stay session-wide across any mix of Freeflow and Pi compactions (Pi skips merging lists from an extension's compaction, so `fallback()` adds them back). Guarded by `fallback.test.js`.
- Freeflow's code never names a Working Record path. No test; the strings in `harness.ts` and `controller.ts` show it.
- `observe()` asks Pi for the branch at most once per leaf (`cachedBranch()`) and does not call `getContextUsage()` when the turn reports usage. Guarded by `request-path-budget.test.js`.
- The next cycle's requests extend each other, including the Coordinator's after a worker compacts. Guarded by `agent-path.test.js` and `coordinator-view.test.js`.

## Failure Behavior

| Failure | Result |
| --- | --- |
| A refused call (not due, too long, over budget, unreadable file, unknown ref) | The tool returns an error naming what to fix; nothing is scheduled. |
| The compacting turn errors, aborts or hits its length limit | `pending` is dropped, nothing is written, and compaction stays due; compact now keeps repeating every further 10k tokens. |
| A carried file becomes unreadable between the call and the turn end | Recorded with its error and shown as "Not carried" in the carried context. |
| Pi compacts while a Freeflow compaction is pending | Pi's compaction wins; the pending request is dropped and the summary says not to call `freeflow_compact` again. |
| During Pi's compaction, Pi's summarizer run with Freeflow's instructions fails, or Freeflow's additions throw | `fallback()` returns `undefined` and Pi compacts exactly as it would without Freeflow (`fallback.test.js`). |
| The context passes Pi's trigger before the agent compacts | Pi compacts (fallback). |
| No model reports a context window | `measure()` returns `undefined`: no notices, and `isDue()` is false until `/freeflow compact`. |

## Cost

- **Per turn:** `observe()` runs after every turn. It follows the [performance rules](../guides/performance.md): context size from the turn's usage, one branch walk per leaf, the full-history estimate extended incrementally, the result index built only within `INDEX_TOKEN_BOUND` (2,000 tokens) of the warning. New per-turn work needs a count in `request-path-budget.test.js` when it could grow with the session, and `npm run perf:request` before and after.
- **Per cycle:** a compaction is not free. The next cycle reloads the methods it needs (about 14k tokens under routing in live runs) plus the carried context and summary, so small windows or large Pi reserves leave little working room.
- **Prompt cache:** notices and carried context are appended messages; the tool and skill list stay fixed. After a worker's compaction the Coordinator writes its view once (about 50k to 106k tokens in October 2026 live runs) and then reads it from cache. See [Prompt cache rules](../guides/prompt-cache.md).

## Code Map

- `pi-extension/src/compaction/`: the subsystem. Its [README](../../pi-extension/src/compaction/README.md) lists each file.
  - `controller.ts`: `CompactionController` (`observe`, `request`, `turnEnd`, `fallback`, `fill`, `statusText`), the `CompactionHost` interface, entry types, recovery and refusal texts.
  - `thresholds.ts`: `thresholds()`, `strictest()`, `reserveTokens()`.
  - `carry.ts`: `carryBudget()`, `readCarriedFile()`, `latestUserMessages()`, `numberLines()`, `renderCarried()`, `renderCarriedForCoordinator()`, `renderListed()`.
  - `results.ts`: `resultIndex()`, `scopeResults()`, `resolveResult()`, `resultFirstLine()`, `INDEX_TOKEN_BOUND`.
  - `harness.ts`: `harnessPart()`, `nextCycle()`, `currentCycle()`, `sessionFileLists()`.
  - `tool.ts`: `registerCompactionTool()`, `applyCompactionTools()`.
  - `config.ts`: `resolveCompactionConfig()`, `validateCompactionConfig()`.
- `pi-extension/src/index.ts`: the `CompactionHost` implementation (`measure`, `turnContextTokens()`, `fullHistoryTokens()`, `coordinatorUnderProjection`), the event handlers, and `/freeflow compact`.
- `pi-extension/src/host/config.ts`: layers the `compaction` key.
- `pi-extension/src/cognitive-routing/assembler.ts` and `projection.ts`: `workerCompaction()`, `compactedInAssignment()`, `assessedSinceCompaction`, `details.coordinatorContent`.
- `capabilities/compaction/`: the model-facing skill and summary format.

## Tests

See [the tests README](../../pi-extension/tests/compaction/README.md) for each file. In short: `thresholds.test.js` (points, budget, index), `notices.test.js` (warning and compact now timing), `agent-path.test.js` (the full path, refusals, routed workers), `automatic-carry.test.js` (the four carry cases: routing off or on, context reuse on or off), `carry.test.js` (context reuse and routing refs), `worker-warning.test.js` and `coordinator-view.test.js` (routing), `script-call.test.js` (codemode), `fallback.test.js` (Pi's compaction). `pi-extension/tests/integration/request-path-budget.test.js` bounds the per-turn work.

## Limits

- The per-cycle cost above can make compaction a poor trade on small windows.
- An agent may keep working past the first compact now; one live run compacted 3k tokens before Pi's trigger.
- A read-only evidence recovery cannot compact; a recovery worker at compact now returns without compacting.
- A command output that repeats a freshly carried file is carried twice.
- Whether agent-written summaries keep the next action better than Pi's summarizer has not been measured.

## Changes

- `9078dd0` (2026-10-03): per-turn cost cut (turn usage, incremental estimate, index near the warning).
- `97b149b`, `257ee32`, `d818051` (2026-10-03): numbered carried files; compact before return only at compact now; codemode calls.
- `01505b0`, `9849a16` (2026-10-03): the Coordinator's view and cache after a worker compacts.
- `580eebb`, `7cb89ed` (2026-10-03): no re-reads after compaction; routed workers compact before returning.
- `7fb0792`, `dcf82fc`, `da71c3a` (2026-10-03): safe points, automatic carry, budget cap, repeating compact now, 25k headroom.
- `305f20b`, `b44ccc2`, `f00704a`, `942057d` (2026-10-02 to 03): compaction contracts end in a return; no guessed record; routing refs and the context reuse switch.
- `d75ac55`, `6cdbdfc`, `32ddb16`, `7070241` (2026-10-02): Pi's compaction improved; session-wide file lists; settings and status; Coordinator told of a worker's compaction.
- `6b56e7d`, `caf90f0`, `c27d141` (2026-10-02): the agent path, warnings and result index, the skill.
