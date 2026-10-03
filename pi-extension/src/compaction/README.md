# Compaction

Freeflow compaction turns compaction into a planned cycle boundary. After each turn Freeflow measures the context; when it passes the warning point, a notice says compaction is due and lists the results the agent can carry, and a second notice says to compact now near Pi's own limit. The agent updates its Working Record and calls `freeflow_compact` with a summary and the files to carry. At the end of that turn Freeflow writes Pi's compaction entry, keeping nothing raw, followed by the carried context and a recovery message, and the same run continues from them. Pi's own compaction stays unchanged as the fallback.

Compaction is on by default whenever Freeflow is on: `compaction.enabled` in Freeflow config, shown as the Compaction switch in `/freeflow settings`, with Context reuse (`compaction.carry`, on by default) beneath it. `/freeflow status` reports the cycle, context use against the warning, compact-now and Pi points, and the last compaction. The model-facing guidance is the compaction skill, [`capabilities/compaction/SKILL.md`](../../../capabilities/compaction/SKILL.md), with the summary's exact shape in [`references/summary-format.md`](../../../capabilities/compaction/references/summary-format.md); Freeflow always lists it with its skills, so the system prompt does not change with this setting.

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | The `compaction` config key, its validation and its effective state. |
| [`controller.ts`](controller.ts) | The agent path: when a request is accepted, validating it, the entries written at turn end, and the handoff to the post-compaction resets. |
| [`tool.ts`](tool.ts) | Registers `freeflow_compact` (model-only, not callable from codemode) and declares it only while compaction is effective. |
| [`thresholds.ts`](thresholds.ts) | When compaction is due: "compact now" 25k tokens before Pi's trigger, and the warning at 70% of the window or 20k before "compact now", whichever is first, using Pi's effective reserve and the smallest window that may receive the full history. |
| [`results.ts`](results.ts) | The result list for sessions without Cognitive Routing: this cycle's larger tool results, except Freeflow's control calls, with ids (`r12`) the agent carries by; ids stay stable across compactions. Under routing no list is inserted: the agent's context already names each result by routing's source ref, and carry resolves those refs. Also the results of the work in progress for automatic carry and the ref list: the current assignment's under Cognitive Routing (by routing ref), otherwise this cycle's, without control calls or reads of Freeflow's own instructions. |
| [`carry.ts`](carry.ts) | The carried context: the latest user messages verbatim, selected files read fresh at compaction, selected tool results copied by id, the carry budget, and the summary limit. |
| [`harness.ts`](harness.ts) | The part of the summary Freeflow writes itself: cycle, the request this compaction completes, routing profile, running background commands, and the session-wide file lists in Pi's `<read-files>`/`<modified-files>` form (codemode nested calls included). |

`/freeflow compact` (in `src/index.ts`) makes compaction due and sends the request as the user's message.

## Rules

- `freeflow_compact` is accepted only when compaction is due: the context is past the warning point, or the user ran `/freeflow compact` in this cycle. Due is recomputed from the measurement, so a reload does not lose it.
- Context reuse off: no list, no carry budget, and `carry` items are refused; the user's latest messages are still carried.
- A list inserted with the warning is context too, so its size moves the warning point earlier.
- The warning is sent once per cycle; "compact now" when the context crosses its point and again each time it grows another 10k tokens, because Pi 1.0 checks its own threshold only after a run ends, not between turns. Mid-run a notice joins the next request; at the end of a run it waits for the next prompt rather than starting work.
- The warning is advance notice: the agent keeps working to a safe point (a finished step whose result it knows), finishes work that ends within a step or two instead of compacting, and compacts at once if it is already at one. "Compact now" makes the end of the current step the safe point. `/freeflow compact` is immediate.
- Carry is the agent's picks plus an automatic fill: the newest results of the work in progress (the current assignment under routing, otherwise the cycle) take the rest of the budget, and the others are listed by ref in the carried context. With context reuse off nothing is copied; under routing the list stays, because evidence selection needs it.
- The carry budget is 15% of the window, at most 40k, and at most a quarter of the warning point, so a large Pi reserve cannot make the carried context refill the next cycle.
- A `freeflow_compact` call refused in a cycle a compaction began says where to go next: after Freeflow's compaction, that it completed the request; after Pi's own, that the compaction being prepared is no longer needed.
- After a worker's Freeflow compaction, routing's Runtime State tells the Coordinator which worker compacted, for the rest of that cycle (the compaction details record the profile).
- The compaction details also record the routing assignment in progress. When routing re-sends that assignment's contract after the compaction, a line directly after it says the worker compacted during this assignment, so a contract asking for compaction does not read as still undone. A later `freeflow_compact` call in a cycle a Freeflow compaction began is refused with the same fact and a pointer to continue or return.
- A Coordinator under projection never compacts: its notices tell it to delegate compaction to a worker, and `freeflow_compact` refuses it.
- Under Cognitive Routing the measurement covers the full history whenever the Coordinator is active under projection: its own view is small, but the next worker request carries everything.
- Pi fires no compaction events for this path, so `index.ts` runs Freeflow's resets at the next `turn_start`: request history, cache tracking, routing reconcile, and file tracking reduced to the carried files.
- Carried content is copied into the session, never resolved later, so a reopened session needs no Freeflow lookup.
- Freeflow never names a Working Record: it cannot tell which record belongs to this work. The agent's summary names it, and the recovery message says to recover a record the summary names.
- The compaction completes the request that asked for it, and the summary and recovery message say so; `/freeflow compact`'s own text is not carried as a user message. The carried context and recovery message carry Freeflow's notice prefix, so the agent never reads them as the user's words.
- A turn that errors, aborts or hits its length limit writes no compaction; compaction stays due.
- Pi's own compaction (its threshold, which it checks before each response within a run, an overflow, or `/compact`) keeps Pi's summarizer and kept tail; under routing Freeflow's part lists the current assignment's results by ref. Freeflow adds its summary instructions (Pi appends them as "Additional focus") and its own state with recovery steps, and drops any scheduled Freeflow compaction. When Pi summarizes only a split turn's prefix, its prompt takes no extra instructions, so only the appended state applies. If anything fails, Freeflow steps aside and Pi compacts as it would alone.
- File lists stay session-wide across any mix of Freeflow and Pi compactions: Freeflow stores them in Pi's details shape (`readFiles`, `modifiedFiles`), and before Pi's summarizer runs it adds back the previous compaction's lists, which Pi skips when an extension wrote that compaction.
- Never cancel or change Pi's own compaction.

Tests: [`tests/compaction/`](../../tests/compaction/README.md).
