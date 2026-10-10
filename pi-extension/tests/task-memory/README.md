# Task memory tests

Tests for [`src/task-memory/`](../../src/task-memory/README.md). `state.test.js` is a unit test; `session.test.js` and `tree.test.js` are native: a real Pi session with scripted model responses (see [`fixtures/`](../fixtures/README.md)), which answers the attach confirmation through the fixture's `ui` option.

| File | Covers |
|---|---|
| `state.test.js` | The state fold (attach, focus, detach, hold, confirm); which tool calls write a record; a fork's held records refused by the gate until confirmed; attaching refused under automatic routing. |
| `tree.test.js` | Native, registered records: a parent and child with the `Children` block, tree search and view by ID; a child created from its own session; writes refused after a takeover; a declined takeover. |
| `session.test.js` | The model proposing an attach that the user confirms or declines; the user attaching by command and the snapshot reaching the next request; the write gate for `write`, `bash` and `edit`; off by default; reload without a second snapshot; navigation restoring an earlier point's records with a notice; the snapshot after Pi's compaction and after Freeflow's, following the recovery message. |

Every test sets `FREEFLOW_HOME` to a temporary directory, so none touches the user's registry.

The registry's own tests are Track Work's: `.skill-eval/track-work/tests/registry.test.mjs`.
