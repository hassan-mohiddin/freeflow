# Requirements

The change makes the carry budget fit the room before the warning, repeats "compact now" while the context keeps growing within a run, and gives a clear refusal once Pi has compacted on its own.

1. The carry budget is 15% of the context window, and never more than 40,000 tokens. With no known window it is 40,000 tokens.
2. The carry budget is also never more than a quarter of the warning point, rounded down, when that point is above zero, so a large Pi reserve lowers it.
3. The budget that the notices state is the budget `freeflow_compact` enforces for the same context.
4. The warning is sent once per cycle.
5. "Compact now" is sent when the context reaches its point. It is not sent again until the context has grown by another 10,000 tokens, and then it repeats each time the context grows by another 10,000 tokens within the cycle.
6. Except in the Coordinator-under-projection form, the 'compaction is due' and 'compact now' notices say that Pi compacts on its own past its trigger once this run ends. The 'compact now' notice also says that Pi compacts when a request overflows the model's window.
7. After Pi compacts on its own in a cycle, a freeflow_compact call is refused with a message saying that the cycle began with Pi's own compaction, so the compaction being prepared is no longer needed, and telling the agent to continue the work or, for a routing assignment that only asked for compaction, return it. The message does not mention /freeflow compact.
8. When the cycle began with a Freeflow compaction, the refusal keeps its existing wording.
