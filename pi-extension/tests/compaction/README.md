# Compaction tests

Tests for [`src/compaction/`](../../src/compaction/README.md). `thresholds.test.js`, `controller.test.js` and `harness.test.js` are unit tests; `bundle.test.js` is native: a real Pi session with scripted model responses (see [`fixtures/`](../fixtures/README.md)) running Track Work's real script.

| File | Covers |
|---|---|
| `thresholds.test.js` | The notice point for several windows and a large reserve, the rows, Pi's reserve lookup, and the strictest window. |
| `controller.test.js` | Rows once each and the cycle's one notice naming the held task and the command; the notice without a task and under projection; the run-end compaction with the bundle only for a checkpoint done after the notice, keeping nothing raw; a session summary removed after it; a bundle that cannot be made said, not installed; Pi's own compaction with the bundle, with Pi's summary and the bundle after it, and with Freeflow's instructions alone. |
| `bundle.test.js` | A session summary with no store, and a task in a local store, each checkpointed with `--compact` and compacted with its bundle as the run continues; the next request extends the one after compaction. |
| `harness.test.js` | The harness part naming the Freeflow skills read in the cycle it ends, and nothing when there are none. |
