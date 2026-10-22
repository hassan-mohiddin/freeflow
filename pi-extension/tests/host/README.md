# Host tests

Tests for [`src/host/`](../../src/host/README.md).

| File | Covers |
|---|---|
| `settings-view.test.js` | The `/freeflow settings` widgets: values publish only after they are saved, a failed write keeps the saved value, concurrent edits are blocked, and text input delegates paste, cursor and IME handling to Pi's `Input`. |
| `inbound.test.js` | The inbound channel: delivery while busy and idle, waiting for the next turn, batching within a window, a source stopped at its limit, and the one-line notice row. |
| `section-keeper.test.js` | Keeping the last prompt's system sections in the request of a run an extension's message starts. |
| `run-start-native.test.js` | Runs an extension's message starts on Pi 1.4.0: which sections Pi keeps with and without Freeflow, Freeflow's own sections following what it set, each request extending the last, and a skill command sent while a run starts. |
| `persisted-branch.test.js` | Checking that a session file still matches what Pi holds in memory: newly appended entries are verified from the file's tail, and a mismatch on the active branch fails. |

Most host behavior is tested through the whole extension in [`integration/`](../integration/README.md).
