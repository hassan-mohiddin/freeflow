# Compaction

Freeflow compaction on Pi: the agent compacts itself at a safe point with `freeflow_compact`, and Pi's own compaction stays as the fallback. How it works and why, including the behavior that looks wrong but is intended: [`dev-docs/subsystems/compaction.md`](../../../dev-docs/subsystems/compaction.md). The model-facing guidance is the compaction skill, [`capabilities/compaction/SKILL.md`](../../../capabilities/compaction/SKILL.md).

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | The `compaction` config key, its validation and its effective state. |
| [`controller.ts`](controller.ts) | The agent path: when a request is accepted, validating it, the entries written at turn end, and the handoff to the post-compaction resets. |
| [`tool.ts`](tool.ts) | Registers `freeflow_compact` (callable directly and from codemode scripts) and declares it only while compaction is effective. |
| [`thresholds.ts`](thresholds.ts) | When compaction is due: "compact now" 25k tokens before Pi's trigger, and the warning at 70% of the window or 20k before "compact now", whichever is first, using Pi's effective reserve and the smallest window that may receive the full history. |
| [`results.ts`](results.ts) | The result list for sessions without Cognitive Routing: this cycle's larger tool results, except Freeflow's control calls, with ids (`r12`) the agent carries by; ids stay stable across compactions. Under routing no list is inserted: the agent's context already names each result by routing's source ref, and carry resolves those refs. Also the results of the work in progress for automatic carry and the ref list: the current assignment's under Cognitive Routing (by routing ref), otherwise this cycle's, without control calls or reads of Freeflow's own instructions. |
| [`carry.ts`](carry.ts) | The carried context: the latest user messages verbatim, selected files read fresh at compaction, selected tool results copied by id, the carry budget, and the summary limit. |
| [`harness.ts`](harness.ts) | The part of the summary Freeflow writes itself: cycle, the request this compaction completes, routing profile, running background commands, and the session-wide file lists in Pi's `<read-files>`/`<modified-files>` form (codemode nested calls included). |

`/freeflow compact` (in `src/index.ts`) makes compaction due and sends the request as the user's message.

## Rules

- Never cancel or change Pi's own compaction; `fallback()` returns `undefined` on any failure.
- Write nothing before the turn ends: `request()` only validates and schedules, `turnEnd()` writes.
- Notices and carried context are appended messages; never change the system prompt, tool definitions or skill list with compaction state (prompt cache).
- `observe()` runs after every turn: follow [Performance](../../../dev-docs/guides/performance.md) and keep `tests/integration/request-path-budget.test.js` passing.
- Never name a Working Record from Freeflow's own text; the agent's summary names it.
- Update the subsystem doc in the same change when behavior described there changes.

Tests: [`tests/compaction/`](../../tests/compaction/README.md).
