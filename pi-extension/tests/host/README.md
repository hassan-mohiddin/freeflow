# Host tests

Tests for [`src/host/`](../../src/host/README.md).

| File | Covers |
|---|---|
| `settings-view.test.js` | The `/freeflow settings` widgets: values publish only after they are saved, a failed write keeps the saved value, concurrent edits are blocked, and text input delegates paste, cursor and IME handling to Pi's `Input`. |
| `persisted-branch.test.js` | Checking that a session file still matches what Pi holds in memory: newly appended entries are verified from the file's tail, and a mismatch on the active branch fails. |

Most host behavior is tested through the whole extension in [`integration/`](../integration/README.md).
