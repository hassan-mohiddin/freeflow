# Compaction

Freeflow compaction turns compaction into a planned cycle boundary. After each turn Freeflow measures the context; when it passes the warning point, a notice says compaction is due and lists the results the agent can carry, and a second notice says to compact now near Pi's own limit. The agent updates its Working Record and calls `freeflow_compact` with a summary and the files to carry. At the end of that turn Freeflow writes Pi's compaction entry, keeping nothing raw, followed by the carried context and a recovery message, and the same run continues from them. Pi's own compaction stays unchanged as the fallback.

Compaction is on by default whenever Freeflow is on (`compaction.enabled` in Freeflow config).

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | The `compaction` config key, its validation and its effective state. |
| [`controller.ts`](controller.ts) | The agent path: when a request is accepted, validating it, the entries written at turn end, and the handoff to the post-compaction resets. |
| [`tool.ts`](tool.ts) | Registers `freeflow_compact` (model-only, not callable from codemode) and declares it only while compaction is effective. |
| [`thresholds.ts`](thresholds.ts) | When compaction is due: the warning at 80% of the window or 30k tokens before Pi's trigger, whichever is first, and "compact now" 10k before it, using Pi's effective reserve and the smallest window that may receive the full history. |
| [`results.ts`](results.ts) | The result index: this cycle's larger tool results with ids (`r12`) the agent carries by; ids stay stable across compactions. |
| [`carry.ts`](carry.ts) | The carried context: the latest user messages verbatim, selected files read fresh at compaction, selected tool results copied by id, the carry budget, and the summary limit. |
| [`harness.ts`](harness.ts) | The part of the summary Freeflow writes itself: cycle, Working Record to read first, routing profile, running background commands, and files read and changed this cycle. |

`/freeflow compact` (in `src/index.ts`) makes compaction due and sends the request as the user's message.

## Rules

- `freeflow_compact` is accepted only when compaction is due: the context is past the warning point, or the user ran `/freeflow compact` in this cycle. Due is recomputed from the measurement, so a reload does not lose it.
- Each notice is sent once per cycle. Mid-run it joins the next request; at the end of a run it waits for the next prompt rather than starting work.
- Under Cognitive Routing the measurement covers the full history whenever the Coordinator is active under projection: its own view is small, but the next worker request carries everything.
- Pi fires no compaction events for this path, so `index.ts` runs Freeflow's resets at the next `turn_start`: request history, cache tracking, routing reconcile, and file tracking reduced to the carried files.
- Carried content is copied into the session, never resolved later, so a reopened session needs no Freeflow lookup.
- A turn that errors, aborts or hits its length limit writes no compaction; compaction stays due.
- Never cancel or change Pi's own compaction.

Tests: [`tests/compaction/`](../../tests/compaction/README.md).
