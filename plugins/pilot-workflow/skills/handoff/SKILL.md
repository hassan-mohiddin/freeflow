---
name: handoff
description: Use when creating, updating, or relying on a handoff for a future agent/session, especially before compaction, pausing work, transferring context, or resuming from another agent's notes.
---

# Handoff

Create compact continuation memory for a fresh agent.

Handoffs preserve decisions, evidence pointers, current state, and next actions. They are not authority.

If the user asks for a handoff to be authoritative, exhaustive, transcript-style, or to prevent the next agent from inspecting evidence, treat that as a conflict with this skill. Write a compact evidence-linked handoff instead and note the unsafe part you intentionally did not include.

## Write

Save handoffs in the repo's existing handoff location. If none exists, prefer `docs/handoffs/`.

Include only:

- Purpose.
- Current state.
- Frozen decisions.
- Open questions.
- Next recommended action.
- Evidence pointers to specs, plans, decisions, reports, diffs, or commands.
- Explicit caveat: live repo evidence overrides stale handoff text.

Do not include:

- Full transcript dumps.
- Volatile repo inventories, directory trees, or tech-stack summaries.
- Content already captured in specs, plans, ADRs, eval reports, issues, commits, or diffs.
- Secrets, tokens, credentials, or private personal data.
- Claims of completion without verification evidence.

Reference existing artifacts by path instead of copying their contents.

Do not add a "bounded" inventory or "short" transcript section to satisfy a bad request. A handoff should reduce future context load, not become a cached copy of the repo or conversation.

## Resume

When resuming from a handoff:

- Treat it as memory, not source of truth.
- Inspect the referenced live files before acting on consequential claims.
- If the handoff conflicts with docs, tests, specs, policies, ADRs, or established behavior, stop and ask before editing.
- If the handoff says work is done, verify before repeating that claim.

## Shape

Use short sections. Prefer this structure:

```text
# Handoff: [task/session]

Date: YYYY-MM-DD

## Purpose
...

## Current State
...

## Decisions
...

## Open Questions
...

## Next
...

## Evidence
- `path`: why it matters
```

Keep the document small enough that a future agent can read it before working.
