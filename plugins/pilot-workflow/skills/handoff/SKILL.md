---
name: handoff
description: Use when creating, updating, or relying on a temporary or durable handoff for a future agent/session, especially before compaction, pausing work, transferring context to a new chat, storing project memory, or resuming from another agent's notes.
---

# Handoff

Create compact continuation context for a fresh agent. Handoffs are memory, not authority.

## Stop First: Ambiguous Destination

If a request mixes immediate continuation language with durable memory language, do not inspect, classify, or write yet.

This includes prompts like:

- "after compaction, but maybe repo memory"
- "temporary, unless you think it is important"
- "you decide" when temp vs memory is still unclear

Ask one question and stop:

```txt
Should this be a temporary handoff for the next chat, or a repo memory handoff under `docs/handoffs/`?
```

First classify the handoff:

- **Temp handoff**: for compaction, ending a chat, or continuing soon in a fresh chat. Save to the OS temp directory unless the user gives a path.
- **Memory handoff**: for durable project memory, future-agent context, or explicit repo storage. Save to the repo's existing handoff location, usually `docs/handoffs/`.

Memory handoffs are still memory, not authority. They must not replace live repo inspection, promise no reinspection, or include full transcripts/file inventories.

Temp handoffs should optimize for immediate continuation in the next chat.

Memory handoffs should optimize for durable decisions, stable context, next actions, and evidence pointers.

Always:

- Reference existing artifacts by path instead of copying them.
- Redact secrets, tokens, credentials, and private personal data.
- Say when live repo evidence should override stale handoff text.
- Keep the document small enough that a future agent can read before working.

Avoid:

- Full transcript dumps.
- Volatile repo inventories, directory trees, or tech-stack summaries.
- Claims of completion without verification evidence.

If the user explicitly asks for an authoritative, exhaustive, transcript-style, no-reinspection, or full-inventory handoff, stop before writing. Name the conflict with handoff memory rules and ask whether to follow the requested shape or write compact evidence-linked memory.

When resuming from a handoff:
- Inspect the referenced live files before acting on consequential claims.
- If the handoff conflicts with docs, tests, specs, policies, ADRs, or established behavior, stop and ask before editing.
- If the handoff says work is done, verify before repeating that claim.
