# Test fixtures

Shared helpers for the suites. They are not tests themselves.

| File | Provides |
|---|---|
| [`routing-native.js`](routing-native.js) | The native-test harness. `fixture(script, projection, after, withUI, options)` creates a temporary project and a real Pi session with Freeflow loaded, replaces `fetch` so each model request returns the tool calls `script` gives for that request number, and passes the captured request bodies, the session manager and UI notices to `after`. `response()` and `anthropicResponse()` build OpenAI Responses and Anthropic Messages streams. By default the fixture answers `session_before_compact` with a fixed summary; `fixtureCompaction: false` turns that off so a test runs the real compaction path. Pi's own automatic compaction is off unless `piAutoCompaction: true`. |
| [`routing-state.js`](routing-state.js) | Routing's effective state for assertions: the session's recorded events plus control changes staged for the next prompt. |
| [`pi087-context.js`](pi087-context.js) | Adapters for calling Freeflow's `context_with_system` and `before_agent_start` handlers directly, in the shape Pi 0.87 introduced. |
| [`v2-sidecar.js`](v2-sidecar.js) | Builds a synthetic native ancestry for lower-level event-store tests that have no real Pi result entries. |

Native fixtures restore the real `fetch` and delete their temporary directories when the test ends; keep that true when changing them.
