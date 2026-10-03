# Compaction

Pi compacts a long session on its own when the context nears the model's window: a separate summarizer call reads the conversation and writes a summary, and the session continues from that summary and a recent tail. The agent doing the work has no say in it, so the summary can miss what the next step needed.

Freeflow compaction lets the agent compact itself, at a point it chooses, from what it knows. Freeflow warns the agent ahead of Pi's limit; at a safe point the agent updates its Working Record, writes the summary, chooses what to carry, and calls `freeflow_compact`. At the end of that turn Freeflow replaces the conversation with the summary, the carried context and a recovery message, and the same run continues. Pi's own compaction stays on as the fallback when the context fills before the agent compacts.

## Availability

- Native Pi 0.99.1 or later, including Pi 1.0.
- On by default whenever Freeflow is enabled. Turn it off with `compaction.enabled: false` in `.freeflow/config.json` or `.freeflow/local.json`, or with the Compaction switch in `/freeflow settings` (Repository, Personal or Session scope).
- Context reuse (`compaction.carry`, on by default) lets the agent carry files and tool results into the next cycle. With it off only the summary and the user's latest messages carry over.

```json
{
  "compaction": { "enabled": true, "carry": true }
}
```

Freeflow never turns Pi's own compaction off: Pi's switch also disables its recovery from an overflowing request.

## When compaction is due

Freeflow measures the context after each turn against Pi's trigger (the model's window minus Pi's reserve, `compaction.reserveTokens` in Pi's settings, 16,384 by default):

| Point | Where | What happens |
| --- | --- | --- |
| Warning | 70% of the window, or 20k before "compact now" if that is earlier | Advance notice: keep working to a safe point, then compact. |
| Compact now | 25k before Pi's trigger | Firm: the end of the current step is the safe point. Repeats every further 10k tokens. |
| Pi's trigger | window minus Pi's reserve | Pi compacts on its own. |

With Pi's default reserve:

| Window | Warning | Compact now | Pi compacts | Carry budget |
| --- | --- | --- | --- | --- |
| 128k | 67k | 87k | 112k | 17k |
| 200k | 139k | 159k | 184k | 30k |
| 272k | 190k | 231k | 256k | 40k |
| 400k | 280k | 359k | 384k | 40k |
| 1M | 700k | 959k | 984k | 40k |

`/freeflow compact` asks for a compaction now, regardless of these points. `/freeflow status` shows the current cycle, the context against each point, and the kind of the last compaction.

A safe point is a finished step whose result the agent knows: a check it ran and read, a complete set of edits, a written report. Mid-edit, with a command still running, or partway through reads it needs together is not one. If its work ends within a step or two with a final answer, the agent finishes instead of compacting, since the session stops growing.

## What the next cycle starts from

1. **The summary**, written by the agent in a fixed shape (the compaction skill and its summary format teach it). With a Working Record the summary names the record and holds only what sits below it: the step in progress, results in flight, the next steps. Without one, the summary uses the record's own headings and is the task memory for the next cycle. Freeflow appends its own lines: the cycle, the request the compaction completes, the routing profile, running background commands, and the files read and changed in the session.
2. **The carried context**: the user's latest messages word for word, then what the agent carries. The agent picks files (read fresh at compaction, optionally by line range) and earlier tool results; Freeflow fills the rest of the carry budget with the newest results of the work in progress and lists the others by reference, so the agent can carry them later, select them as evidence, or read them again. Files and read results are numbered by file line, so the agent can cite them without reading them again.
3. **A recovery message**: recover the Working Record the summary names (or re-read the summary's recovery sources), check the live state the next step depends on, and continue; do not re-read what was carried, and do not compact again in this cycle.

The carry budget is 15% of the window, at most 40k tokens, and at most a quarter of the warning point. Freeflow never names a Working Record itself: it cannot tell which record belongs to the work, so the agent's summary names it.

## When Pi compacts first

Pi's own compaction keeps Pi's summarizer and recent tail. Freeflow adds its summary instructions to Pi's summarizer and appends its own state and recovery steps; under Cognitive Routing it also lists the current assignment's results by reference. A `freeflow_compact` call after Pi has compacted is refused with the reason, so the agent does not compact twice. If anything in Freeflow's part fails, Pi compacts as it would alone.

## With Cognitive Routing

- The warning is measured on the full history the next worker request carries, not on the Coordinator's smaller projected view, and on the smallest window among the models that may receive it.
- A worker (Helper or Executor) compacts itself in the middle of its assignment and continues it. At "compact now" it compacts before returning, because the Coordinator and the next assignment continue the same history. After the compaction, routing re-sends the assignment's contract with a note that the compaction it may ask for is done.
- The Coordinator under projection does not compact: its view leaves out what workers did. Its notices tell it to delegate an assignment that compacts and returns, usually folded into work already going to a worker.
- The Coordinator sees a version of the carried context that names the worker's copies instead of repeating them, and receives evidence only by the worker's selection. Evidence it has received stays in its view until the next compaction, so its requests keep reusing the prompt cache through an assessment, an evidence recovery and the unit's close.

## Prompt cache

Any compaction replaces the conversation, so the next request is written to the provider's cache once; from there each request extends the previous one as usual. Freeflow's notices are appended to the conversation and never edit what was already sent. See [Prompt caching](../prompt-caching.md).

## Evidence limits

Native Pi tests cover the thresholds, notices, the agent path, carrying, recovery, Pi's own compaction with Freeflow's additions, and the Coordinator's view and cache. Live sessions on GPT-6 Luna and Sol 6.1 (October 2026) exercised warnings and safe points, Freeflow and Pi compactions mid-assignment, automatic carry, recovery without re-reading, and the Coordinator's cache after a worker compacted. Whether Freeflow's summaries keep the next action better than Pi's summarizer has not been measured.

Known limits:

- Each new cycle starts by reloading the methods the agent uses (about 14k tokens under Cognitive Routing) plus the carried context. With small windows or a large Pi reserve this leaves little room per cycle.
- An evidence recovery is read-only, so a Coordinator whose next step is a recovery cannot fold a compaction into it; Pi's own compaction covers that case.

## Related documentation

- [Capabilities](README.md)
- [Cognitive Routing](cognitive-routing.md)
- [Tool Execution](tool-execution.md)
- [Pi integration](../integrations/pi.md)
- [Prompt caching](../prompt-caching.md)
- [How compaction works](../../dev-docs/subsystems/compaction.md) (developer docs)
