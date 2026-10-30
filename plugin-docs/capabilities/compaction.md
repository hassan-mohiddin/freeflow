# Compaction

Pi compacts a long session on its own when the context nears the model's window: a separate summarizer call reads the conversation and writes a summary, and the session continues from that summary and a recent tail. The agent doing the work has no say in it, so the summary can miss what the next step needed.

Freeflow compaction lets the agent decide what survives. Freeflow tells the agent once when compaction is near; at a safe point the agent checkpoints its task's Working Record as the Track Work skill says, with `checkpoint --compact`, and ends its turn. Freeflow then replaces the conversation with the task's bundle (the record and everything recovery reads, in one text) and the same run continues. It works the same way as Freeflow on Claude Code. Pi's own compaction stays on as the fallback when the context fills before the agent checkpoints.

## Availability

- Native Pi 0.99.1 or later, including Pi 1.0.
- On by default whenever Freeflow is enabled. Turn it off with `compaction.enabled: false` in `.freeflow/config.json` or `.freeflow/local.json`, or with the Compaction switch in `/freeflow settings` (Repository, Personal or Session scope).
- Context reuse (`compaction.carry`, on by default): the bundle also carries this compaction cycle's newest tool results, within a carry budget. With it off, only the results the agent names in its record are carried.
- Tasks need the Freeflow store ([Setup Freeflow](../../skills/setup-freeflow/references/store-setup.md) sets it up). Without a store, compaction still works: the agent writes a session summary instead, and the next cycle starts from it.

```json
{
  "compaction": { "enabled": true, "carry": true }
}
```

Freeflow never turns Pi's own compaction off: Pi's switch also disables its recovery from an overflowing request.

## When Freeflow says compaction is near

Freeflow measures the context after each turn. As it grows it shows one row at 50%, 60% and 70% of the window, then one notice a compaction cycle, before Pi's own trigger (the model's window minus Pi's reserve, `compaction.reserveTokens` in Pi's settings, 16,384 by default):

| Window | Notice | Pi compacts |
| --- | --- | --- |
| 128k | 96k | 112k |
| 200k | 150k | 184k |
| 1M | 750k | 984k |

The notice is soft: keep working to a safe point, then checkpoint and end the turn. A safe point is a finished step whose result the agent knows: a check it ran and read, a complete set of edits, a written report. If its work ends within a step or two, the agent finishes first. The notice comes once a cycle and does not repeat.

`/freeflow compact` asks the agent to checkpoint with `--compact` now. `/freeflow status` shows the current cycle, the context against the notice and Pi's trigger, the kind of the last compaction, and the store with the task this session holds.

## What the next cycle starts from

The bundle, which Track Work's script prints: an opening line saying the record is memory and your direction decides the work, your rules from the store, the record (with its In flight section, where the step in progress stands), the active decisions, the History and project indexes, the checks, every source the record says recovery reads, the files and tool results In flight carries, the newest results of the cycle within the carry budget, and the core skills. Freeflow appends the cycle, the routing profile and running background commands, then a line saying the conversation is now the bundle. Nothing of the old conversation is kept raw.

Without a task, the session summary takes the record's place.

## When Pi compacts first

If Pi compacts before the agent checkpoints, Pi's summarizer runs as usual, told what the record already holds, and the bundle as of the last checkpoint follows its summary, with your messages since then word for word. If the agent had already checkpointed, the bundle replaces Pi's summary. If anything in Freeflow's part fails, Pi compacts as it would alone.

## The Freeflow store on Pi

Where the store exists, a new session gets the task menu and your rules with its first turn; the footer shows the task the session holds; the store is synced after a run that changed it, and the session's hold is released when it ends.

## With Cognitive Routing

- The notice is measured on the full history the next worker request carries, not on the Coordinator's smaller projected view, and on the smallest window among the models that may receive it.
- The Coordinator under projection does not checkpoint itself: its view leaves out what workers did. Its notice tells it to delegate an assignment that checkpoints with `--compact` and returns; Freeflow compacts when the run ends.

## Prompt cache

Any compaction replaces the conversation, so the next request is written to the provider's cache once; from there each request extends the previous one as usual. Freeflow's notices and the menu are appended to the conversation and never edit what was already sent. See [Prompt caching](../prompt-caching.md).

## Evidence limits

Native Pi tests cover the notice and rows, Freeflow's compaction with a task and with a session summary on a real Pi session running Track Work's real script, Pi's own compaction with the bundle, and the request after compaction extending into the next. A live run on a real model has not been made on Pi with this design.

## Related documentation

- [Capabilities](README.md)
- [Cognitive Routing](cognitive-routing.md)
- [Tool Execution](tool-execution.md)
- [Pi integration](../integrations/pi.md)
- [Prompt caching](../prompt-caching.md)
- [How compaction works](../../dev-docs/subsystems/compaction.md) (developer docs)
