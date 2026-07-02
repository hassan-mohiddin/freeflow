# Context Locality

Delegation exists to avoid forcing every phase, slice, review, command output, and compaction into one shrinking conversation.

## Principle

```text
Store broadly. Return compactly. Promote selectively. Load narrowly.
```

## Memory Tiers

- **Live context**: what the current agent sees now. Keep narrow.
- **Promoted context**: spec, plan, parent report, child result, handoff, decision note. Use for handoffs.
- **Recoverable context**: transcripts, events, raw tool output, routed output IDs. Store, but do not load by default.
- **Noise**: abandoned paths and verbose intermediates. Keep recoverable only when audit/debug value is worth it.

## Compression Points

- Researcher returns evidence summary, not transcript.
- Reviewer returns findings, not fixes.
- Worker returns changes/checks/uncertainty, not a session dump.
- Verifier returns command evidence and output IDs.
- Planning-parent returns `PLANNING_REPORT`.
- Execution-parent returns `EXECUTION_REPORT`.

## Artifact Role

Specs, plans, reviews, and handoffs are context compression artifacts. They are not ceremony. They preserve what future agents need without replaying the planning chat.

## Anti-Patterns

- Pasting child transcripts into parent context.
- Spawning agents because parallelism feels powerful.
- Giving every child the whole planning conversation.
- Treating recoverable history as always-loaded memory.
- Compacting one giant session repeatedly when phase/slice boundaries are available.
