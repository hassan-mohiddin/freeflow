# Compaction tests

Tests for [`src/compaction/`](../../src/compaction/README.md). `thresholds.test.js` is a unit test; the others are native: a real Pi session with scripted model responses (see [`fixtures/`](../fixtures/README.md)).

| File | Covers |
|---|---|
| `thresholds.test.js` | Warning and compact-now points for several windows, Pi's reserve lookup, the strictest window, the carry budget's cap by the warning point, and the result index (ordering, size floor, ids stable across compaction, previously carried results). |
| `notices.test.js` | The warning once mid-run, then compact now, either making compaction acceptable and carrying a result by id; a warning at the end of a run waiting for the next prompt; compact now repeating each further 10k tokens within a run; the Coordinator warned through the full-history estimate under projection. |
| `carry.test.js` | Context reuse: no list under routing and a worker carrying a result by routing ref; context reuse off refusing carry items with no list; a list moving the warning point earlier by its size. |
| `worker-warning.test.js` | The warning reaching a worker mid-assignment under projection: the worker's notice (not the Coordinator's) in its next request, the worker keeping its run, compacting, continuing its re-sent contract, and returning. |
| `script-call.test.js` | `freeflow_compact` called from a script (as Pi's codemode calls tools) compacting at the end of the turn, with the run continuing from the new cycle. |
| `coordinator-view.test.js` | The Coordinator's view after a worker compacts, selects evidence, and returns under projection: the carried context names the worker's copies instead of repeating them, the selected result appears once, and the request after the unit closes extends the assessing one; an evidence recovery round after the compaction keeping the Coordinator's prefix through the supplement and the close. |
| `automatic-carry.test.js` | The four carry cases: routing off or on, context reuse on or off; the newest results filling the budget, the rest listed by `r` id or routing ref, and nothing copied or listed where the case says so. |
| `fallback.test.js` | Pi's own compaction with Freeflow's instructions reaching Pi's summarizer, Freeflow's state and recovery appended, and Pi's kept tail; Pi compacting exactly as alone when Freeflow's summarizer fails; file lists covering the whole session across a Freeflow compaction and then Pi's; after Pi's own compaction, a `freeflow_compact` call refused with where to go next. |
| `agent-path.test.js` | `freeflow_compact` refused until compaction is due; `/freeflow compact` leading to one compaction in the same run, with the next request holding summary, carried context and recovery, files carried as they are at compaction time, and the next cycle extending its own requests; limit and budget refusals; file tracking reduced to carried files; the tool declared only while compaction is on; a worker compacting mid-assignment under Cognitive Routing, with the re-sent contract followed by the fact that it compacted and a second call refused with where to go next; a Coordinator under projection refused and told to delegate; the compaction skill listed to the model. |

`/freeflow compact` starts its run after the command returns, so the tests wait for the run's first request before waiting for idle.
