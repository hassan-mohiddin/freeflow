# Store tests

Tests for [`src/store/`](../../src/store/README.md), unit tests with a fake script.

| File | Covers |
|---|---|
| `layer.test.js` | What counts as touching the store; the session's environment set and cleared; session start with a store (pull, then the menu), with what is missing, and with nothing to say; a run's end reading and syncing only after a touch, then the release at shutdown; an answered compaction request. |
