# Artifact Destinations

Use this when a discovery checkpoint or decision must survive beyond chat.

## Destination Test

Before writing, answer:

- What needs to survive?
- Who will treat the destination as authority?
- Which existing artifact already owns this kind of truth?
- Would writing here create a new convention?
- Would a future agent know to look here?

If the owner is unclear, ask before writing.

## Common Destinations

| Discovery output | Prefer | Avoid |
| --- | --- | --- |
| Domain term or meaning | Existing `CONTEXT.md`, glossary, or domain doc | README fallback; creating domain memory without asking |
| Feature behavior, scope, acceptance | Existing or requested spec | ADR unless the ADR test passes |
| Future implementation path | Plan | Hidden plan inside a discovery note |
| Evidence summary before requirements settle | Existing discovery, research, or design notes; otherwise ask | Creating `docs/research/` by default |
| Immediate continuation state | Handoff | Durable decision memory |
| Hard-to-reverse surprising tradeoff from alternatives | ADR | Product note that hides rationale |
| Rejected approach | ADR if tradeoff-heavy; otherwise spec/decision note | Changelog or README by default |
| No durable value | Chat checkpoint | New file for ceremony |

## ADR Test

Use an ADR only when all are true:

- Hard to reverse.
- Surprising without context.
- Chosen from real alternatives.

Otherwise use the owning spec, decision note, domain doc, handoff, or chat.

## Stop Rules

Do not create a new `CONTEXT.md`, glossary, `docs/decisions/`, `docs/specs/`, `docs/research/`, or ADR folder just because the checkpoint needs memory.

A missing destination convention is a decision point.

Do not put volatile file lists, command output, temporary TODOs, or implementation inventory in durable decision memory. Put continuation state in a handoff or plan when needed.

## Question Shape

When destination is ambiguous, ask one direct question:

```text
I have a checkpoint worth preserving: [what].
The narrowest destination is [recommended artifact] because [why].
Should I save it there?
```

Do not write the artifact before the user chooses the destination.
