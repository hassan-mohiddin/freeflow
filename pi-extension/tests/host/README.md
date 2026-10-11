# Host tests

Tests for [`src/host/`](../../src/host/README.md).

| File | Covers |
|---|---|
| `settings-view.test.js` | The `/freeflow settings` widgets: values publish only after they are saved, a failed write keeps the saved value, concurrent edits are blocked, and text input delegates paste, cursor and IME handling to Pi's `Input`. |
| `inbound.test.js` | The inbound channel: delivery while busy and idle, waiting for the next turn, batching within a window, a source stopped at its limit, and the one-line notice row. |
| `persisted-branch.test.js` | Checking that a session file still matches what Pi holds in memory: newly appended entries are verified from the file's tail, and a mismatch on the active branch fails. |

Most host behavior is tested through the whole extension in [`integration/`](../integration/README.md).
