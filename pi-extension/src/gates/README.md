# Gates

Freeflow's gates on Pi (SPEC-008), as Claude Code's mod runs them: before each tool call, Track Work's [`lib/gates5.mjs`](../../../skills/track-work/scripts/lib/gates5.mjs) decides the call against the agreement, Slice, delivery and delegation gates, from the session's gate state (`<FREEFLOW_HOME>/sessions/<session>/gates.json`), which Track Work's lifecycle commands write. How the gates work and why: [Gates](../../../dev-docs/subsystems/gates.md).

| File | Owns |
|---|---|
| [`runtime.ts`](runtime.ts) | `GateRuntime`: `gates5.mjs` loaded once from Freeflow's package; the gate state kept in memory, read at session start, after session start's `session status`, and after the agent runs Track Work's script; `check()` (warn, ask or block, one row per gate per turn); the rows a call's result gains; the missing state said once. |

## Rules

- No file is read per call: the state is read at session start and after a Track Work command (performance rule R-1).
- Pi has no workers, so the delegation gate never fires here.
- Until the module has loaded and the state has been read once, every call runs.

Tests: [`tests/gates/`](../../tests/gates/README.md).
