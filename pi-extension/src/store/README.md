# Store

Freeflow's Pi layer for the Freeflow store, as the Claude Code mod is Claude Code's: it runs Track Work's script on Pi's events and delivers what the script prints; what happens to a task's memory is the script's. How it works and why: [`dev-docs/subsystems/compaction.md`](../../../dev-docs/subsystems/compaction.md#the-store-layer); the store itself: [`dev-docs/subsystems/freeflow-store.md`](../../../dev-docs/subsystems/freeflow-store.md).

| File | Owns |
|---|---|
| [`layer.ts`](layer.ts) | `StoreLayer`: the session's state in the store, held in memory; the session-start menu or what is missing; the sync after a run that touched the store; the bundle; the answered compaction request; the release at shutdown. `scriptRunner()`, `sessionEnvironment()` (the variables Track Work's script reads), `touchesStore()`. |
| [`waits.ts`](waits.ts) | `WaitWatch`: the Waits on row (SPEC-009 4.4): at a run's end, and once a minute while idle, only while the current Slice waits on a delegation that has not come back, it reads the state again and delivers one row per return through the inbound channel, batched over 60 seconds, waking an idle session where `delegation.wakeOnReturn` is on. |

## Rules

- Never read the store on the way to a request (performance rule R-1): read it at session start, after the agent's own script run (not awaited), at a run's end after a store touch, at a compaction, and, while a Slice waits on a delegation that has not come back, at a run's end and once a minute while idle.
- The store is optional: with none, compaction still works through the session summary (P4), and every failure leaves Pi working as without it.

Tests: [`tests/store/`](../../tests/store/README.md).
