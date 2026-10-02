# Compaction tests

Tests for [`src/compaction/`](../../src/compaction/README.md), all native: a real Pi session with scripted model responses (see [`fixtures/`](../fixtures/README.md)).

| File | Covers |
|---|---|
| `agent-path.test.js` | `freeflow_compact` refused until compaction is due; `/freeflow compact` leading to one compaction in the same run, with the next request holding summary, carried context and recovery, files carried as they are at compaction time, and the next cycle extending its own requests; limit and budget refusals; file tracking reduced to carried files; the tool declared only while compaction is on; a worker compacting mid-assignment under Cognitive Routing. |

`/freeflow compact` starts its run after the command returns, so the tests wait for the run's first request before waiting for idle.
