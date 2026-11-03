# Events

Freeflow's event log and claims on Pi, as Claude Code's mod writes them (SPEC-006): what happens in the session's loop, one schema v1 line per event and never contents, written by Track Work's `events append` when a run settles and at shutdown; and what Freeflow can do in this session, for request set 1. The schema, the writer and the summary are Track Work's ([`skills/track-work/scripts/lib/events5.mjs`](../../../skills/track-work/scripts/lib/events5.mjs)); the listing is Setup Freeflow's [`capabilities.mjs`](../../../skills/setup-freeflow/scripts/capabilities.mjs).

| File | Owns |
|---|---|
| [`recorder.ts`](recorder.ts) | `EventRecorder`: the lines kept in memory, their flush through the script (a failed one counted in the next), and the claims in `<FREEFLOW_HOME>/sessions/<session>/capabilities.json`, written when they change. `piClaims()` (yes, possible or no per request, from the capabilities this session runs), `exitCode()` (from Pi's "Command exited with code N"), `eventPath()`. |

## Rules

- Never on the way to a request (performance rule R-1): lines are kept in memory, the flush is not awaited at `agent_settled`, and the claims file is written only when the claims changed.
- A sensor fails open: a flush that fails drops its lines and never stops the session.
- Never contents: a line holds a tool's name, status, exit code, time, paths and a shell command's text, which the writer redacts and cuts; never a prompt, an answer, a file's content or a tool's output.

Tests: [`tests/events/`](../../tests/events/README.md).
