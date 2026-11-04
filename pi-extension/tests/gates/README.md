# Gates tests

Tests for [`src/gates/`](../../src/gates/README.md): the runtime alone, the extension's own `tool_call` and `tool_result` handlers, then a real in-process Pi session with Track Work's real script.

| File | Covers |
|---|---|
| `runtime.test.js` | One row per gate per turn under warn, the refusal under block, a delivery step asked where Pi has a screen and refused where it has none, `apply_patch`'s files, reads never gated; a missing state quiet under warn, said once after session start, closed under block; through the handlers, a refusal, the person's no and yes, and the row on a call's result with Tool Execution off; in a real Pi session, the row on the first change of a turn only, and a gate line per call in the event log. |
