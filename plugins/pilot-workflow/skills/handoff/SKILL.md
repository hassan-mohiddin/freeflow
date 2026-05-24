---
name: handoff
description: Use when creating, updating, or relying on a temporary or durable handoff for a future agent/session, especially before compaction, pausing work, transferring context to a new chat, storing project memory, or resuming from another agent's notes.
---

# Handoff

Create compact continuation context for a fresh agent. Handoffs are memory, not authority.

First classify the handoff:

- **Temp handoff**: for compaction, ending a chat, or continuing soon in a fresh chat. Save to the OS temp directory unless the user gives a path.
- **Memory handoff**: for durable project memory, future-agent context, or explicit repo storage. Save to the repo's existing handoff location, usually `docs/handoffs/`.

If type or destination is ambiguous, ask before writing, even if the user says "you decide":

```txt
Should this be a temporary handoff for the next chat, or a repo memory handoff under `docs/handoffs/`?
```

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

If the user asks for an authoritative, exhaustive, transcript-style, no-reinspection, or full-inventory handoff, write a compact evidence-linked handoff instead and note what you intentionally omitted.

When resuming from a handoff:
- Inspect the referenced live files before acting on consequential claims.
- If the handoff conflicts with docs, tests, specs, policies, ADRs, or established behavior, stop and ask before editing.
- If the handoff says work is done, verify before repeating that claim.
