# Compaction

Freeflow compaction turns compaction into a planned cycle boundary. When compaction is due, the agent updates its Working Record and calls `freeflow_compact` with a summary and the files to carry. At the end of that turn Freeflow writes Pi's compaction entry, keeping nothing raw, followed by the carried context and a recovery message, and the same run continues from them. Pi's own compaction stays unchanged as the fallback.

Compaction is on by default whenever Freeflow is on (`compaction.enabled` in Freeflow config).

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | The `compaction` config key, its validation and its effective state. |
| [`controller.ts`](controller.ts) | The agent path: when a request is accepted, validating it, the entries written at turn end, and the handoff to the post-compaction resets. |
| [`tool.ts`](tool.ts) | Registers `freeflow_compact` (model-only, not callable from codemode) and declares it only while compaction is effective. |
| [`carry.ts`](carry.ts) | The carried context: the latest user messages verbatim, selected files read fresh at compaction, the carry budget, and the summary limit. |
| [`harness.ts`](harness.ts) | The part of the summary Freeflow writes itself: cycle, Working Record to read first, routing profile, running background commands, and files read and changed this cycle. |

`/freeflow compact` (in `src/index.ts`) makes compaction due and sends the request as the user's message.

## Rules

- `freeflow_compact` is accepted only when compaction is due: after a Freeflow notice or the user's `/freeflow compact`.
- Pi fires no compaction events for this path, so `index.ts` runs Freeflow's resets at the next `turn_start`: request history, cache tracking, routing reconcile, and file tracking reduced to the carried files.
- Carried content is copied into the session, never resolved later, so a reopened session needs no Freeflow lookup.
- A turn that errors, aborts or hits its length limit writes no compaction; compaction stays due.
- Never cancel or change Pi's own compaction.

Tests: [`tests/compaction/`](../../tests/compaction/README.md).
